import * as economy from './unlock.js';
import { loadShopState, updateShopState, shopStorageIssue } from './store.js';
import { applyAchieved, normalizeProgress } from './skill-progress.js';

/**
 * Own purchases and achievements only. The Studio document owns every placed mesh,
 * its undo history and persistence; there is deliberately no placement replay here.
 * `insert` must synchronously commit one prepared model as one document undo unit.
 */
export function createShopController({ loader, insert, dispose = () => {}, timeoutMs = 15000, champion = null } = {}) {
  let catalog = null;
  let tree = null;
  let state = null;
  let epoch = 0;
  const listeners = new Set();
  function publish() {
    if (!state) return;
    // Older demo builds persisted placements here. Never replay or write those records.
    state.placed = [];
    for (const listener of listeners) listener(getState());
  }
  function getState() { return state ? structuredClone(state) : null; }
  function getProgress() { return normalizeProgress(state); }
  function refresh() {
    if (!catalog) return;
    state = economy.applyLevelUnlocks((champion ? champion.shopState() : loadShopState(economy.initialState(catalog))), catalog);
    publish();
  }
  async function change(edit) {
    if (!catalog) throw new Error('The shop is still loading.');
    const result = await (champion ? champion.updateShop : updateShopState)(economy.initialState(catalog), latest => {
      const changed = edit(economy.applyLevelUnlocks(latest, catalog));
      return { ...changed, state: { ...changed.state, placed: [] } };
    });
    refresh();
    return result;
  }
  function setCatalog(value) {
    catalog = value;
    champion?.setCatalog?.(value);
    refresh(); // Boot is a read, never a write over an unknown saved version.
  }
  function report(ids) {
    if (champion) return Promise.resolve({ newlyUnlocked: [], grantedCoins: 0, grantedLevels: 0, ignored: ids });
    if (!state || !tree) return { newlyUnlocked: [], grantedCoins: 0, grantedLevels: 0, ignored: ids };
    return change(latest => {
      const result = applyAchieved(normalizeProgress(latest), tree, ids);
      let next = { ...latest, ...result.progress };
      next = economy.grantCoins(next, result.grantedCoins);
      next = economy.grantLevel(next, catalog, result.grantedLevels);
      return { state: next, result };
    });
  }
  return {
    getState, getProgress, setCatalog, refresh, storageIssue: () => champion ? champion.issue() : shopStorageIssue(),
    setSkillTree(value) { tree = value; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    purchase(model) {
      const entry = catalog?.models.find((m) => m.id === model?.id);
      if (champion) return champion.purchase(entry, catalog).then(result => { refresh(); return result; });
      return change(latest => { const result = economy.purchase(latest, entry); return { state: result.state, result }; });
    },
    grantCoins(n) { if (champion) return Promise.reject(Error('Only a teacher can award credits.')); return change(latest => ({ state: economy.grantCoins(latest, n) })); },
    grantLevel(n) { if (champion) return Promise.reject(Error('Developer levels are disabled.')); return change(latest => ({ state: economy.grantLevel(latest, catalog, n) })); },
    applyAchieved: report,
    setCollapsed(value) { return change(latest => ({ state: { ...latest, collapsed: !!value } })); },
    setSidebarWidth(value) { return change(latest => ({ state: { ...latest, sidebarWidth: Number.isFinite(value) ? value : latest.sidebarWidth } })); },
    reset() {
      if (champion) return Promise.reject(Error('Shared credits cannot be reset here.'));
      epoch++;
      if (!catalog) return;
      return change(latest => ({ state: { ...latest, ...economy.initialState(catalog), achieved: [], unlockedNodes: [], placed: [] } }));
    },
    invalidate() { epoch++; },
    async placeModel(model, point) {
      const issue = champion ? champion.issue() : shopStorageIssue();
      if (issue) throw new Error(issue);
      refresh();
      const entry = catalog?.models.find((m) => m.id === model?.id);
      if (!state || !entry || !economy.status(state, entry).unlocked) throw new Error('Unlock this model first.');
      const ticket = epoch;
      let expired = false;
      let timer;
      // A late answer after timeout is disposed, not inserted into a later document.
      const loading = Promise.resolve().then(() => loader.loadTemplate(entry.file)).then((object) => {
        if (expired) { dispose(object); return null; }
        return object;
      });
      let object;
      try {
        object = await Promise.race([loading, new Promise((_, reject) => {
          timer = setTimeout(() => { expired = true; reject(new Error('Model loading timed out. Try again.')); }, timeoutMs);
        })]);
        if (ticket !== epoch) { dispose(object); return null; }
        return insert(object, entry, point);
      } catch (error) {
        if (object) dispose(object);
        throw error;
      } finally { clearTimeout(timer); }
    },
  };
}
