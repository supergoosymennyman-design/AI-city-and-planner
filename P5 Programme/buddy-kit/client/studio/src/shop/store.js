/**
 * store.js — the model shop's persisted state (economy + placements + UI prefs).
 *
 * The shop needs to survive reloads: coins, the player's level, which models were
 * bought/earned (`owned`), which ones are currently standing in the scene (`placed`,
 * with their transform), the monotonic placement-id counter, and whether the left
 * sidebar is collapsed. All of it lives in `localStorage['studio.shop.v1']`.
 *
 * Storage access is guarded exactly like `src/ai/config.js`: private-mode browsers,
 * disabled storage, quota failures, sandboxed contexts where merely reading
 * `globalThis.localStorage` throws, and plain Node (which has no `localStorage`) all
 * degrade to an in-memory mirror instead of throwing. Tests and the app therefore share
 * one code path.
 *
 * Version envelope (a conscious divergence from `ai/config.js`, which has none):
 * the shop's `owned` set is MONOTONIC — once a model is bought or earned it must never
 * silently disappear. A settings blob can be read forward-compatibly by merging unknown
 * keys, but a schema change here would otherwise wipe a child's progress. So every write
 * stamps `version: SHOP_VERSION`, and a stored document bearing a different version is
 * displayed with safe defaults while its original bytes are kept unchanged. Mutations
 * refuse an unsupported version rather than downgrading it.
 *
 * Reads return validated defaults. Transactional edits reject unsupported documents
 * and failed browser writes so purchases are never reported as durably saved when they aren't.
 */

/** localStorage key under which the shop state is serialized. */
export const SHOP_KEY = 'studio.shop.v1';

/** Schema version stamped on every write; a mismatch is ignored (see module JSDoc). */
export const SHOP_VERSION = 1;

/** Width (px) the left sidebar falls back to when no valid value was persisted.
 *  The UI layer owns clamping it to its own min/max; the store only rejects junk. */
const SAFE_SIDEBAR_WIDTH = 240;

/** Last serialized state when real storage is unavailable or failing. */
let memoryValue = null;

/** Whether the most recent `writeStored` actually reached real storage. When it did
 *  not (storage absent, or `setItem` threw on quota / private mode), the in-memory
 *  mirror is the newer value and must win over a stale stored document. */
let lastWritePersisted = false;

/** Whether the one-shot "stored version differs" warning has already been emitted. */
let warnedVersionMismatch = false;

/**
 * Resolve the `localStorage` object, or null when it is absent/unusable.
 * Access is wrapped because merely reading `globalThis.localStorage` can throw in a
 * sandboxed/private context; a partially-implemented stub is also rejected.
 * @returns {Storage|null}
 */
function getStorage() {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return null;
    if (typeof ls.getItem !== 'function' || typeof ls.setItem !== 'function' ||
        typeof ls.removeItem !== 'function') {
      return null;
    }
    return ls;
  } catch (err) {
    return null;
  }
}

/**
 * Read the raw stored string, falling back to the in-memory mirror.
 *
 * WHY the write-failure check: if the last `setItem` failed (quota / private mode)
 * but an OLDER value is still in storage, the stored string is stale and the newer
 * in-session value lives only in the mirror. When the last write DID persist, storage
 * is preferred so another tab's newer write is picked up. Never throws.
 * @returns {string|null}
 */
function readStored() {
  if (!lastWritePersisted && memoryValue != null) return memoryValue;
  try {
    const ls = getStorage();
    if (ls) {
      const value = ls.getItem(SHOP_KEY);
      return value;
    }
  } catch (err) {
    /* fall through to the in-memory mirror */
  }
  return memoryValue;
}

/**
 * Persist the raw string to localStorage AND the in-memory mirror.
 * The memory write happens first so a failed `setItem` (quota / private mode / a
 * throwing stub) still leaves the module with a consistent in-session value; the
 * module remembers that failure so a later read prefers the mirror over stale storage.
 * Never throws.
 * @param {string} json
 */
function writeStored(json) {
  memoryValue = json;
  let persisted = false;
  try {
    const ls = getStorage();
    if (ls) {
      ls.setItem(SHOP_KEY, json);
      persisted = true;
    }
  } catch (err) {
    /* in-memory only — storage is unavailable */
  }
  lastWritePersisted = persisted;
}

/**
 * Drop the stored entry (real storage if present, plus the in-memory mirror).
 * Never throws.
 */
function clearStored() {
  memoryValue = null;
  try {
    const ls = getStorage();
    if (ls) ls.removeItem(SHOP_KEY);
  } catch (err) {
    /* nothing else to clear */
  }
}

/**
 * A finite number?
 * @param {unknown} value
 * @returns {boolean}
 */
function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Is `value` an array of exactly `length` finite numbers?
 * @param {unknown} value
 * @param {number} length
 * @returns {boolean}
 */
function isNumberVector(value, length) {
  return Array.isArray(value) && value.length === length && value.every(isFiniteNumber);
}

/**
 * Coerce to a non-negative integer, falling back when the value is not one.
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function toNonNegativeInt(value, fallback) {
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

/**
 * Coerce to a finite number, falling back when the value is absent or non-finite.
 * Unlike `toNonNegativeInt`, the sidebar width is not required to be an integer — the
 * UI layer clamps it to its own min/max, so the store only rejects NaN/Infinity/junk.
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function toFiniteNumber(value, fallback) {
  return isFiniteNumber(value) ? value : fallback;
}

/**
 * Sanitize the `placed` array, dropping every entry that is not well-formed and
 * every entry whose `id` was already accepted (a duplicate id would otherwise
 * render/delete the same placement more than once). A valid entry is
 * `{ id: positive integer, modelId: string, p: number[3], q: number[4], s: number[3] }`.
 * Vectors are copied so the returned state never aliases caller-owned arrays.
 * @param {unknown} raw
 * @returns {Array<{id:number, modelId:string, p:number[], q:number[], s:number[]}>}
 */
function sanitizePlaced(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seenIds = new Set();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    if (!Number.isInteger(entry.id) || entry.id <= 0) continue;
    if (typeof entry.modelId !== 'string') continue;
    if (!isNumberVector(entry.p, 3) || !isNumberVector(entry.q, 4) || !isNumberVector(entry.s, 3)) {
      continue;
    }
    if (seenIds.has(entry.id)) continue;
    seenIds.add(entry.id);
    out.push({
      id: entry.id,
      modelId: entry.modelId,
      p: entry.p.slice(),
      q: entry.q.slice(),
      s: entry.s.slice(),
    });
  }
  return out;
}

/**
 * Sanitize a persisted progress set (`achieved` / `unlockedNodes`): keep only non-empty
 * strings and drop duplicates (first occurrence wins). This mirrors the `owned` filter
 * style but adds dedup so a poisoned blob cannot bloat an achievement set with repeated
 * ids. The returned array is always fresh (never aliases caller-owned data).
 * @param {unknown} raw
 * @returns {string[]}
 */
function sanitizeStringSet(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const value of raw) {
    if (typeof value !== 'string' || value.length === 0) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

/**
 * Build the safe fallback state: the caller's economy defaults plus empty shop-only
 * fields. The passed defaults object is never mutated (fresh spread + fresh arrays).
 * @param {object} defaults
 * @returns {{version:number, coins:number, level:number, owned:string[], placed:Array<object>, nextPlacementId:number, collapsed:boolean, sidebarWidth:number, achieved:string[], unlockedNodes:string[]}}
 */
function safeDefaults(defaults) {
  const base = defaults && typeof defaults === 'object' && !Array.isArray(defaults) ? defaults : {};
  return {
    ...base,
    version: SHOP_VERSION,
    owned: [],
    placed: [],
    nextPlacementId: 1,
    collapsed: false,
    sidebarWidth: SAFE_SIDEBAR_WIDTH,
    achieved: [],
    unlockedNodes: [],
  };
}

/**
 * Load and validate the persisted shop state.
 *
 * What: parse `localStorage['studio.shop.v1']` (or the in-memory mirror) and return a
 * fully sanitized state whose `owned`/`placed` are always arrays and whose integers are
 * always valid. `economyDefaults` supplies `coins`/`level` when storage has none or its
 * values are malformed.
 * Why: every boot rehydrates the shop from this one call, and a child's progress must
 * never be lost to — or blocked by — a corrupt/partial/stale stored document.
 * Units: `coins`/`level` are plain integer counts; `p`/`q`/`s` are three.js
 * position/quaternion/scale components.
 * Never throws.
 * @param {{coins?:number, level?:number, [key:string]:unknown}} economyDefaults
 * @returns {{version:number, coins:number, level:number, owned:string[], placed:Array<{id:number, modelId:string, p:number[], q:number[], s:number[]}>, nextPlacementId:number, collapsed:boolean, sidebarWidth:number, achieved:string[], unlockedNodes:string[]}}
 */
export function loadShopState(economyDefaults) {
  const defaults = (economyDefaults && typeof economyDefaults === 'object' && !Array.isArray(economyDefaults))
    ? economyDefaults
    : {};
  const fallback = safeDefaults(defaults);

  const raw = readStored();
  if (raw == null) return fallback;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return fallback;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return fallback;
  }

  // A version mismatch is ignored rather than migrated: the `owned` set is monotonic, so
  // guessing at an unknown schema could silently drop earned models. Warn once, then
  // show defaults without writing. saveShopState also refuses to overwrite this document.
  if (parsed.version !== SHOP_VERSION) {
    if (!warnedVersionMismatch) {
      warnedVersionMismatch = true;
      try {
        console.warn(`[shop] ignoring stored state with version ${String(parsed.version)} ` +
          `(expected ${SHOP_VERSION}); starting from defaults`);
      } catch (err) {
        /* console unavailable — the warning is best-effort */
      }
    }
    return fallback;
  }

  const owned = Array.isArray(parsed.owned)
    ? parsed.owned.filter((id) => typeof id === 'string' && id.length > 0)
    : [];
  const achieved = sanitizeStringSet(parsed.achieved);
  const unlockedNodes = sanitizeStringSet(parsed.unlockedNodes);
  const placed = sanitizePlaced(parsed.placed);
  const maxPlacedId = placed.reduce((max, entry) => (entry.id > max ? entry.id : max), 0);
  const storedNext = Number.isInteger(parsed.nextPlacementId) && parsed.nextPlacementId >= 1
    ? parsed.nextPlacementId
    : 0;

  return {
    ...fallback,
    version: SHOP_VERSION,
    coins: toNonNegativeInt(parsed.coins, fallback.coins),
    level: toNonNegativeInt(parsed.level, fallback.level),
    owned,
    placed,
    nextPlacementId: Math.max(storedNext, 1 + maxPlacedId, 1),
    collapsed: typeof parsed.collapsed === 'boolean' ? parsed.collapsed : false,
    sidebarWidth: toFiniteNumber(parsed.sidebarWidth, fallback.sidebarWidth),
    achieved,
    unlockedNodes,
  };
}

/**
 * Persist the shop state, forcing the current schema version.
 *
 * What: `writeStored(JSON.stringify({ ...state, version: SHOP_VERSION }))`.
 * Unknown/corrupt saved documents are never overwritten by this writer.
 * Never throws: when storage is unavailable the value is kept in the in-memory mirror
 * for the remainder of the session.
 * @param {object} state
 * @returns {boolean} false when the saved document is unsupported or serialization fails.
 */
export function saveShopState(state) {
  if (shopStorageIssue()) return false;
  let json;
  try {
    const base = state && typeof state === 'object' && !Array.isArray(state) ? state : {};
    json = JSON.stringify({ ...base, version: SHOP_VERSION });
  } catch (err) {
    return false;
  }
  writeStored(json);
  return true;
}

/** Unknown documents remain untouched; browsing can still show safe defaults. */
export function shopStorageIssue() {
  const raw = readStored();
  if (raw == null) return null;
  try {
    const value = JSON.parse(raw);
    if (value && typeof value === 'object' && !Array.isArray(value) && value.version !== SHOP_VERSION) {
      return 'Saved shop progress needs a different app version. It has been kept unchanged.';
    }
  } catch { return 'Saved shop progress could not be read. It has been kept unchanged.'; }
  return null;
}

let queued = Promise.resolve();
/** Serialize read/modify/write across tabs. Re-read only AFTER acquiring the lock. */
export function updateShopState(defaults, change) {
  const run = () => {
    const issue = shopStorageIssue();
    if (issue) throw new Error(issue);
    const { state, result } = change(loadShopState(defaults));
    const priorMemory = memoryValue, priorPersisted = lastWritePersisted;
    if (!saveShopState(state)) throw new Error('Shop progress could not be updated.');
    if (typeof window !== 'undefined' && getStorage() && !lastWritePersisted) {
      memoryValue = priorMemory; lastWritePersisted = priorPersisted;
      throw new Error('Shop progress could not be saved. No credits were spent.');
    }
    return result;
  };
  if (typeof window !== 'undefined' && globalThis.navigator?.locks?.request) return navigator.locks.request(SHOP_KEY, run);
  // A browser with shared storage but no lock API cannot safely spend from two tabs.
  if (typeof window !== 'undefined' && getStorage()) return Promise.reject(new Error('This browser cannot safely update shop progress. Use a browser with Web Locks support.'));
  const result = queued.then(run);
  queued = result.catch(() => {});
  return result;
}

/**
 * Clear the persisted shop state (real storage if present, plus the in-memory mirror).
 *
 * What: removes the `localStorage` entry and the mirror so the next `loadShopState`
 * starts from defaults.
 * Why: a full shop reset must not leave stale placements behind for the next session.
 * Never throws.
 * @returns {void}
 */
export function resetShopState() {
  clearStored();
}
