// champion.js — the Studio's wallet surface.
//
// AUTHORITY: the shared envelope wallet (`city-common/project-store.js`) owns the
// balance and owned items. The Champion session (`champion-session.js`) is kept as
// a COMPATIBILITY ADAPTER: its `file.economy` is mirrored from the envelope so the
// synchronous, session-based surfaces (the shop readout, `ChampionControls.credits`,
// the Champion File) keep working, but a purchase NEVER debits the session economy
// directly — it goes through `store.purchase`, the one commit primitive the Market
// also uses, which reads the price from a catalogue and commits debit + ownership
// in a single IndexedDB transaction.
//
// The Studio's own `shop/unlock.js` stays the single UNLOCK law (free / level /
// coins / level+coins): the adapter asks it first so a level-gated model cannot be
// bought early, then lets the ledger commit the price. If no envelope exists
// (no IndexedDB), the original session economy remains the wallet, unchanged.
import '../../workshop/toolbox/champion-session.js';
import '../../workshop/toolbox/champion-controls.js';
import * as rules from './shop/unlock.js';
import { createProjectStore, migrateEconomyFromChampion, PROJECT_EVENT } from '../../city-common/project-store.js';
import { normalizeEconomy } from '../../city-common/ledger.js';
import { studioCatalogue, walletOf } from '../../city-common/studio-wallet.js';
const C = globalThis.ChampionSession;
export let session;
let startingLevel = 0;

// ── the shared envelope wallet ─────────────────────────────────────────────
let envelope = null;        // the project store, once connected
let walletEconomy = null;   // its cached economy (synchronous readout)
let mirroring = false;
const walletListeners = new Set();

const clone = (value) => (value == null ? value : JSON.parse(JSON.stringify(value)));
function notifyWallet() {
  for (const fn of [...walletListeners]) {
    try { fn(); } catch { /* a wallet listener must never break the wallet */ }
  }
}

/** Connect the authoritative store, import a legacy session wallet EXACTLY once,
 *  and cache the economy the shop reads synchronously. Never throws. */
async function connectEnvelope() {
  if (envelope) return true;
  // No IndexedDB → no envelope. The session remains the wallet, as before.
  if (!globalThis.indexedDB) return false;
  try {
    const store = createProjectStore();
    const opened = await store.openActiveProject();
    // Import the legacy Workshop/Studio wallet exactly once. `migrateEconomyFromChampion`
    // is itself idempotent (guarded by `progress.economyMigrated`); the guard here only
    // avoids a needless write on every later open.
    if (!opened?.progress?.economyMigrated) {
      await store.mutate((current) => { migrateEconomyFromChampion(current, session.file.economy); return current; }, { reason: 'economy-migration' });
    }
    envelope = store;
    walletEconomy = await store.readEconomy();
    await mirrorWallet();
    // Another app in this origin can switch/import a project; re-read then.
    globalThis.addEventListener?.(PROJECT_EVENT, () => { void refreshWallet(); });
    if (typeof window !== 'undefined') window.addEventListener('focus', () => { void refreshWallet(); });
    return true;
  } catch {
    envelope = null; walletEconomy = null;
    return false;
  }
}

/** Re-read the authoritative economy (after another app earns, or on refocus). */
async function refreshWallet() {
  if (!envelope) return false;
  try {
    walletEconomy = await envelope.readEconomy();
    await mirrorWallet();
    notifyWallet();
    return true;
  } catch { return false; }
}

const sameWallet = (a, b) => Boolean(a && b)
  && a.version === b.version && a.balance === b.balance
  && JSON.stringify(a.owned) === JSON.stringify(b.owned)
  && JSON.stringify(a.transactions) === JSON.stringify(b.transactions);

/** Mirror the authoritative economy into the session file so the synchronous
 *  session-based surfaces stay coherent. This is a ONE-WAY mirror: the session
 *  economy is never a source of credits. A concurrent tab's edit is left alone. */
async function mirrorWallet() {
  if (!envelope || !walletEconomy || !session || mirroring) return;
  if (sameWallet(session.file.economy, walletEconomy)) return;
  mirroring = true;
  try { await session.edit((file) => { file.economy = { ...clone(walletEconomy), projectOwner: localStorage.getItem('passiona_active_project_v1') }; return file; }); }
  catch { /* an external tab holds the session; the envelope is still authoritative */ }
  finally { mirroring = false; }
}

export async function openChampion() {
  session = await C.create({ kind: 'ai-champion', version: 1, champion: { name: 'Champion', parts: {} }, projects: {} });
  window.__championSession = session;
  await connectEnvelope();
  return session;
}
export function studioSection() { return session.file.projects['3d-studio']; }

function readSection(file) {
  const section = file.projects['3d-studio'];
  if (section && section.version !== 1) throw Error('Studio project is read-only in this version.');
  return section;
}
function buildShopState(section, wallet) {
  return { coins: wallet.coins, owned: wallet.owned, level: startingLevel, achieved: [], unlockedNodes: [], collapsed: false, sidebarWidth: 280, ...section?.shop, coins: wallet.coins, owned: wallet.owned };
}

/** The state the shop UI reads: envelope-authoritative when connected, else the
 *  legacy session wallet. Synchronous by design (the panel rebuilds from it). */
export function shopState(file = session.file) {
  const section = readSection(file);
  const wallet = walletEconomy ? walletOf(walletEconomy) : walletOf(C.economy(file));
  return buildShopState(section, wallet);
}
/** The legacy session-only view, for the fallback purchase path. */
function sessionShopState(file = session.file) {
  const section = readSection(file);
  return buildShopState(section, walletOf(C.economy(file)));
}

/** Buy a Studio model through the ENVELOPE, keeping the Studio unlock law as the
 *  pre-gate. Returns null to signal "fall back to the session path". */
async function envelopePurchase(model, catalog) {
  const id = model && typeof model.id === 'string' && model.id.length > 0 ? model.id : null;
  if (!id) return { ok: false, reason: 'unavailable' };
  const before = rules.applyLevelUnlocks(shopState(), catalog);
  const decision = rules.purchase(before, model);
  if (!decision.ok) return { ok: false, reason: decision.reason };
  if (before.owned.includes(id)) return { ok: true, reason: 'owned' };
  let result;
  try { result = await envelope.purchase(id, `studio-${C.id()}`, studioCatalogue(catalog)); }
  catch (error) { return { ok: false, reason: String(error?.message || error) }; }
  if (!result.ok) {
    // Storage vanished (private mode/quota): let the legacy session path try.
    if (result.storageUnavailable) return null;
    return { ok: false, reason: result.error || 'That could not be completed.' };
  }
  if (result.economy) { walletEconomy = result.economy; await mirrorWallet(); notifyWallet(); }
  else await refreshWallet();
  return { ok: true, reason: result.purchased ? 'purchased' : 'owned' };
}

/** The original session economy transaction, preserved verbatim for the fallback. */
async function legacyPurchase(model, catalog) {
  const transactionID = C.id(); let result;
  await session.edit(file => {
    const before = rules.applyLevelUnlocks(sessionShopState(file), catalog);
    result = rules.purchase(before, model);
    if (!result.ok || before.owned.includes(model.id)) return file;
    return C.transact(file, { id: transactionID, type: 'purchase', item: model.id, title: model.name, amount: before.coins - result.state.coins });
  }, { latest: true });
  return result;
}

export const championShop = {
  shopState,
  setCatalog(catalog) { startingLevel = rules.initialState(catalog).level; },
  subscribe(fn) {
    const offSession = session.subscribe(type => { if (type !== 'external') fn(); });
    walletListeners.add(fn);
    return () => { offSession(); walletListeners.delete(fn); };
  },
  issue() { try { if (session.stale) throw Error('Champion updated in another tab. Reload before placing gear.'); shopState(); return null; } catch(e) { return e.message; } },
  /** True once the shared envelope is the wallet. */
  envelopeReady() { return !!envelope; },
  /** The authoritative economy (or the session economy when no envelope exists). */
  async wallet() { if (envelope) { await refreshWallet(); return clone(walletEconomy); } return session.file.economy; },
  /** A synchronous snapshot for the Champion File writer. */
  walletEconomy() { return walletEconomy ? clone(walletEconomy) : null; },
  /** Replace the authoritative economy from a deliberate full restore (Champion
   *  File Open). Restore REPLACES; it never merges balances (plan §3). */
  async replaceWallet(economy) {
    if (!envelope || !economy) return { ok: false };
    const out = await envelope.mutate((current) => {
      current.economy = normalizeEconomy(economy);
      current.progress ||= {};
      current.progress.economyMigrated = true;
      return current;
    }, { reason: 'restore:economy' });
    if (out.ok) { walletEconomy = clone(out.project.economy); await mirrorWallet(); notifyWallet(); }
    return { ok: out.ok, error: out.error };
  },
  /** Teacher adjustment, routed to the envelope (the PIN is verified by the caller). */
  async teacherAward(op) {
    if (!envelope) return { ok: false, error: 'The shared wallet is unavailable.' };
    const result = await envelope.award(op);
    if (result.ok) { walletEconomy = result.economy; await mirrorWallet(); notifyWallet(); }
    return { ok: result.ok, error: result.error };
  },
  /** One-time import of legacy `studio.shop.v1` ownership into the envelope. The
   *  ledger's `legacy-ownership` transaction is itself once-only (`legacyImported`). */
  async importLegacyOwned(owned) {
    const ids = Array.isArray(owned) ? owned.filter(id => typeof id === 'string' && id.length > 0) : [];
    if (!envelope || !ids.length) return { ok: false, error: 'Nothing to import.' };
    const result = await envelope.transact({ id: 'legacy-studio-ownership', type: 'legacy-ownership', amount: 0, title: 'Legacy Studio gear', owned: ids });
    if (result.ok) { walletEconomy = result.economy; await mirrorWallet(); notifyWallet(); }
    return { ok: result.ok, error: result.error };
  },
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
    if (envelope) {
      const attempt = await envelopePurchase(model, catalog);
      if (attempt) return attempt;
    }
    return legacyPurchase(model, catalog);
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
