// persistence.js — best-effort durability for the on-device envelope.
//
// IMPORTANT: `navigator.storage.persist()` is only a SUGGESTION. A browser may
// ignore it, and iOS Safari can still evict IndexedDB after ~7 days of disuse.
// The REAL safety net is the Champion File (💾 Save my city) and the cloud codes
// (☁️) — this module only asks the browser to keep the data and warns a returning
// child, whose wallet/city has vanished, to restore from one of those.
//
// Everything here is guarded so it is a no-op in Node and never throws at boot.
export const ENVELOPE_EMPTY_EVENT = 'passiona:envelope-empty';
export const DEVICE_SEEN_KEY = 'passiona_device_seen_v1';
export const DEVICE_SEEN_VERSION = '1';

function safeStorage(storage) {
  if (storage) return storage;
  try { return globalThis.localStorage || null; } catch { return null; }
}

/**
 * Ask the browser to keep this origin's storage. Fire-and-forget: resolves
 * `{supported:false}` under Node, private mode, or an old browser.
 */
export async function requestPersistentStorage(nav = globalThis.navigator) {
  try {
    const storage = nav?.storage;
    if (!storage || typeof storage.persist !== 'function' || typeof storage.persisted !== 'function') {
      return { supported: false, granted: false };
    }
    const already = await storage.persisted();
    if (already) return { supported: true, granted: true, already: true };
    const granted = await storage.persist();
    return { supported: true, granted: !!granted, already: false };
  } catch { return { supported: false, granted: false }; }
}

/** Storage usage/quota, or null where the API is unavailable. */
export async function estimateStorage(nav = globalThis.navigator) {
  try {
    const storage = nav?.storage;
    if (!storage || typeof storage.estimate !== 'function') return null;
    const { usage = 0, quota = 0 } = await storage.estimate();
    const u = Number(usage) || 0, q = Number(quota) || 0;
    return { usage: u, quota: q, ratio: q > 0 ? u / q : null };
  } catch { return null; }
}

/** Remember that this device has opened the programme before. */
export function markDeviceSeen(storage = safeStorage()) {
  try { storage?.setItem(DEVICE_SEEN_KEY, DEVICE_SEEN_VERSION); return true; }
  catch { return false; }
}

/** A device the programme has seen before (so an empty envelope is suspicious). */
export function isReturningDevice(storage = safeStorage()) {
  try { return storage?.getItem(DEVICE_SEEN_KEY) === DEVICE_SEEN_VERSION; }
  catch { return false; }
}

const isNonEmptyObject = (value) => !!value && typeof value === 'object' && Object.keys(value).length > 0;

// `progress` holds bookkeeping flags that are not student work; ignore those so
// a project that only ran a migration is still "empty".
const PROGRESS_BOOKKEEPING = new Set(['economyMigrated', 'economyMigratedAt', 'lastWorkspace', 'lastWorkspaceAt']);
function progressHasWork(progress) {
  if (!progress || typeof progress !== 'object') return false;
  if (isNonEmptyObject(progress.tutorialRooms)) return true;
  return Object.keys(progress).some((key) => !PROGRESS_BOOKKEEPING.has(key));
}

/**
 * True when there is no student work to lose — not just no wallet activity, but
 * no capabilities, installations, challenge runs, tutorial rooms, or workspace
 * section either. `sections` is the `project.projects` map; `extra` carries the
 * envelope books a caller has already read.
 */
export function envelopeIsEmpty(economy, sections = {}, extra = {}) {
  const hasWallet = !!economy && (
    Number(economy.balance) > 0
    || (economy.owned?.length || 0) > 0
    || (economy.claimed?.length || 0) > 0
    || (economy.transactions?.length || 0) > 0
  );
  const hasWork = Object.values(sections || {}).some(isNonEmptyObject)
    || isNonEmptyObject(extra.capabilities)
    || isNonEmptyObject(extra.installations)
    || isNonEmptyObject(extra.challenges?.runs)
    || progressHasWork(extra.progress);
  return !hasWallet && !hasWork;
}

/**
 * Startup health check: a returning device whose envelope is empty has probably
 * been evicted — offer a restore instead of silently starting from zero.
 * @returns {Promise<{returning:boolean, empty:boolean, needsRestore:boolean}>}
 */
export async function checkEnvelopeHealth(store, { storage = safeStorage() } = {}) {
  const returning = isReturningDevice(storage);
  let economy = null, sections = {}, extra = {};
  try {
    // Prefer the whole project, so capabilities/installations/challenges/progress
    // count as work too — not only the workspace sections.
    const project = await store?.openActiveProject?.();
    if (project) {
      economy = project.economy;
      sections = project.projects || {};
      extra = { capabilities: project.capabilities, installations: project.installations, challenges: project.challenges, progress: project.progress };
    } else {
      economy = await store?.readEconomy?.();
      sections = {
        city: await store?.readSection?.('city'),
        workshop: await store?.readSection?.('workshop'),
        studio: await store?.readSection?.('studio'),
        planner: await store?.readSection?.('planner'),
      };
    }
  } catch {
    return { returning, empty: false, needsRestore: false };
  }
  const empty = envelopeIsEmpty(economy, sections, extra);
  return { returning, empty, needsRestore: returning && empty };
}

/**
 * The one call each app shell makes at boot: ask for persistence, run the health
 * check, mark this device seen, and (only on a suspected eviction) fire the
 * `passiona:envelope-empty` event and the caller's restore offer.
 */
export async function bootDurability(store, { storage = safeStorage(), nav = globalThis.navigator, lang = 'en', onNeedsRestore = null } = {}) {
  const persistence = await requestPersistentStorage(nav);
  const storageEstimate = await estimateStorage(nav);
  const health = await checkEnvelopeHealth(store, { storage });
  markDeviceSeen(storage);
  if (health.needsRestore) {
    const detail = { lang, health, storageEstimate };
    try { globalThis.dispatchEvent?.(new CustomEvent(ENVELOPE_EMPTY_EVENT, { detail })); } catch { /* event optional */ }
    try { await onNeedsRestore?.(detail); } catch { /* the offer must never block boot */ }
  }
  return { persistence, storageEstimate, ...health };
}

let styleInjected = false;
function injectStyle(doc) {
  if (styleInjected || !doc) return;
  styleInjected = true;
  const style = doc.createElement('style');
  style.textContent = `
    .passiona-restore-offer{position:fixed;left:50%;bottom:96px;transform:translateX(-50%);z-index:2147483600;
      max-width:min(92vw,520px);padding:14px 16px;border-radius:14px;background:#132433;color:#f8fafc;
      border:1px solid #607184;box-shadow:0 10px 30px rgba(0,0,0,.35);font:600 15px/1.4 system-ui,sans-serif}
    .passiona-restore-offer p{margin:0 0 10px}
    .passiona-restore-actions{display:flex;gap:8px;flex-wrap:wrap}
    .passiona-restore-actions button{min-height:48px;padding:0 16px;border-radius:10px;border:1px solid #8fb0c9;
      background:#1d3b57;color:#f8fafc;font:700 15px system-ui,sans-serif;cursor:pointer}
    .passiona-restore-actions button.ghost{background:transparent;border-color:#607184}
    .passiona-restore-actions button:focus-visible{outline:3px solid #ffcf4d;outline-offset:2px}`;
  (doc.head || doc.documentElement).append(style);
}

/**
 * A small, dismissible restore prompt. Buttons trigger the app's OWN file/cloud
 * controls, so every app keeps its existing restore path. Returns the element.
 */
export function mountRestoreOffer({ onFile, onCloud, lang = 'en', parent = globalThis.document?.body } = {}) {
  const doc = parent?.ownerDocument;
  if (!doc) return null;
  injectStyle(doc);
  const zh = lang === 'zh-Hant';
  const banner = doc.createElement('div');
  banner.className = 'passiona-restore-offer';
  banner.setAttribute('role', 'alert');

  const message = doc.createElement('p');
  message.textContent = zh ? '我們在這部裝置找不到你的城市。你可以還原備份。' : 'We could not find your city on this device. You can restore a backup.';
  const actions = doc.createElement('div');
  actions.className = 'passiona-restore-actions';

  const make = (label, cls, run) => {
    const button = doc.createElement('button');
    button.type = 'button';
    if (cls) button.className = cls;
    button.textContent = label;
    button.addEventListener('click', () => { try { run?.(); } finally { banner.remove(); } });
    return button;
  };
  actions.append(
    make(zh ? '開啟城市檔案' : 'Open my city file', '', onFile),
    make(zh ? '從雲端開啟' : 'Open from cloud', '', onCloud),
    make(zh ? '稍後' : 'Later', 'ghost', null),
  );
  banner.append(message, actions);
  parent.append(banner);
  return banner;
}
