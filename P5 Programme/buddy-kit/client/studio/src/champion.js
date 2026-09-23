import '../../workshop/toolbox/champion-session.js';
import '../../workshop/toolbox/champion-controls.js';
import * as rules from './shop/unlock.js';
const C = globalThis.ChampionSession;
export let session;
let startingLevel = 0;
export async function openChampion() {
  session = await C.create({ kind: 'ai-champion', version: 1, champion: { name: 'Champion', parts: {} }, projects: {} });
  window.__championSession = session;
  return session;
}
export function studioSection() { return session.file.projects['3d-studio']; }
export function shopState(file = session.file) {
  const e = C.economy(file), section = file.projects['3d-studio'];
  if (section && section.version !== 1) throw Error('Studio project is read-only in this version.');
  return { coins: e.balance, owned: e.owned, level: startingLevel, achieved: [], unlockedNodes: [], collapsed: false, sidebarWidth: 280, ...section?.shop, coins: e.balance, owned: e.owned };
}
export const championShop = {
  shopState,
  setCatalog(catalog) { startingLevel = rules.initialState(catalog).level; },
  subscribe(fn) { return session.subscribe(type => { if (type !== 'external') fn(); }); },
  issue() { try { if (session.stale) throw Error('Champion updated in another tab. Reload before placing gear.'); shopState(); return null; } catch(e) { return e.message; } },
  async updateShop(defaults, change) {
    let result;
    await session.edit(file => {
      const changed = change(shopState(file)); result = changed.result;
      const { coins, owned, ...ui } = changed.state;
      const prior = file.projects['3d-studio'];
      file.projects['3d-studio'] = { ...prior, version: 1, shop: ui };
      return file;
    });
    return result;
  },
  async purchase(model, catalog) {
    const transactionID = C.id(); let result;
    await session.edit(file => {
      const before = rules.applyLevelUnlocks(shopState(file), catalog);
      result = rules.purchase(before, model);
      if (!result.ok || before.owned.includes(model.id)) return file;
      return C.transact(file, { id: transactionID, type: 'purchase', item: model.id, title: model.name, amount: before.coins - result.state.coins });
    }, { latest: true });
    return result;
  },
};
export function encodeProject(snapshot, wardrobe) { return { version: 1, encoding: 1, data: C.encode({ snapshot, wardrobe }) }; }
export function decodeProject(section) {
  if (!section) return null;
  if (section.version !== 1 || (section.data && section.encoding !== 1)) throw Error('Studio project is read-only in this version.');
  if (!section.data) return null;
  const value = C.decode(section.data);
  if (!value || !value.snapshot || !Array.isArray(value.snapshot.objects) || !Array.isArray(value.wardrobe)) throw Error('Invalid Studio project.');
  for (const o of value.snapshot.objects) {
    if (!o || !o.transform || !['p','r','s'].every(k => o.transform[k]?.length === 3 && o.transform[k].every(Number.isFinite))) throw Error('Invalid Studio transform.');
    if (!['custom','box','sphere','cylinder','cone','torus','octahedron','plane'].includes(o.kind)) throw Error('Unsupported Studio shape.');
    if (o.kind === 'custom' && (!o.geo?.positions || o.geo.positions.length < 3 || o.geo.positions.length % 3 || !o.geo.positions.every(Number.isFinite))) throw Error('Studio geometry is incomplete.');
  }
  for (const o of value.snapshot.objects) {
    const g = o.geo;
    if (g?.positions) {
      const vertices = g.positions.length / 3;
      for (const [key,size] of [['normals',3],['colors',3],['uv',2],['basePos',3]]) {
        if (g[key] && (g[key].length !== vertices * size || !g[key].every(Number.isFinite))) throw Error('Invalid Studio geometry attribute: ' + key);
      }
      if (g.index && !g.index.every(i => Number.isInteger(i) && i >= 0 && i < vertices)) throw Error('Invalid Studio geometry index.');
    }
    for (const material of o.appearance?.materials || []) {
      if (material.map && (typeof material.map !== 'string' || !material.map.startsWith('data:image/'))) throw Error('Studio texture must be embedded in the Champion File.');
    }
  }
  for (const w of value.wardrobe) if (!(w.buffer instanceof ArrayBuffer) || w.buffer.byteLength < 12 || new DataView(w.buffer).getUint32(0,true) !== 0x46546c67) throw Error('Invalid fitted GLB.');
  return value;
}
