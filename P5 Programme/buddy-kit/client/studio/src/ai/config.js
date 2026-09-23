/**
 * config.js — the studio's persisted AI-optimization settings store.
 *
 * The AI panel needs a small set of user settings (endpoint, API key, chosen model,
 * context scope, geometry toggle, sampling temperature). They are deliberately kept
 * OUT of source: the API key is a secret and must never be committed — the user types
 * it into the panel and it lives only in `localStorage['studio.ai.config']` on their
 * own device.
 *
 * Storage access is guarded (mirroring `persist.js`): private-mode browsers, disabled
 * storage, quota failures, and plain Node (which has no `localStorage`) must all
 * degrade to an in-memory object instead of throwing. The module therefore behaves
 * identically with or without real storage — tests and the app share one code path.
 *
 * Stored format is a plain JSON object of settings; there is no version envelope here
 * because every field is optional and unknown keys are preserved by the merge, so an
 * older writer is read forward-compatibly.
 */

/** localStorage key under which the settings object is serialized. */
const STORAGE_KEY = 'studio.ai.config';

/**
 * Factory-fresh settings. `key` is intentionally the empty string — a real key is
 * never committed and is supplied by the user at runtime.
 * @type {{baseUrl: string, key: string, model: string, scope: string, includeGeo: boolean, temperature: number}}
 */
export const AI_DEFAULTS = {
  // Empty on purpose (repo review 09-18): the studio is used by children, so no request leaves
  // the page until an adult types a server they trust. The earlier default was an unknown relay.
  baseUrl: '',
  key: '',
  model: '',
  scope: 'selected',
  includeGeo: false,
  temperature: 0.4,
};

/** Last serialized config when real storage is unavailable or failing. */
let memoryValue = null;
// A failed mutation makes memory authoritative until a later write/reset succeeds.
// Otherwise an old, still-readable key would silently replace the user's new choice.
let memoryOverride = false;

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
 * Successful reads refresh the mirror, including deletions made in another tab.
 * Failed writes/removals take precedence over stale storage for this session.
 * Never throws.
 * @returns {string|null}
 */
function readStored() {
  if (memoryOverride) return memoryValue;
  try {
    const ls = getStorage();
    if (ls) {
      memoryValue = ls.getItem(STORAGE_KEY);
      return memoryValue;
    }
  } catch (err) {
    /* fall through to the in-memory mirror */
  }
  return memoryValue;
}

/**
 * Persist the raw string to localStorage AND the in-memory mirror.
 * The memory write happens first so a failed `setItem` (quota / private mode / a
 * throwing stub) still leaves the module with a consistent in-session value.
 * Never throws.
 * @param {string} json
 */
function writeStored(json) {
  memoryValue = json;
  memoryOverride = true;
  try {
    const ls = getStorage();
    if (ls) {
      ls.setItem(STORAGE_KEY, json);
      memoryOverride = false;
    }
  } catch (err) {
    /* in-memory only — storage is unavailable */
  }
}

/**
 * Drop the stored entry (real storage if present, plus the in-memory mirror).
 * Never throws.
 */
function clearStored() {
  memoryValue = null;
  memoryOverride = true;
  try {
    const ls = getStorage();
    if (ls) {
      ls.removeItem(STORAGE_KEY);
      memoryOverride = false;
    }
  } catch (err) {
    /* nothing else to clear */
  }
}

/**
 * Load the current AI settings.
 *
 * What: `AI_DEFAULTS` shallow-merged with whatever is stored under
 * `localStorage['studio.ai.config']`.
 * Why: the UI and the client both need one authoritative settings object, and a
 * fresh browser must still produce a usable (if unconfigured) config.
 * Units: none — all fields are plain strings/numbers/booleans.
 * Never throws: absent storage, absent entry, non-object JSON, or corrupt JSON all
 * return a fresh copy of `AI_DEFAULTS`.
 * @returns {{baseUrl: string, key: string, model: string, scope: string, includeGeo: boolean, temperature: number}}
 */
export function loadAIConfig() {
  const raw = readStored();
  if (raw == null) return { ...AI_DEFAULTS };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ...AI_DEFAULTS };
    }
    return { ...AI_DEFAULTS, ...parsed };
  } catch (err) {
    return { ...AI_DEFAULTS };
  }
}

/**
 * Shallow-merge `partial` into the stored settings and persist the result.
 *
 * What: loads the current config, overlays the provided keys, writes the merged
 * object back, and returns it. Untouched keys keep their previous (or default) value.
 * Why: the settings panel edits one field at a time; a partial save must not wipe the
 * rest of the config (notably the user's key).
 * Never throws: when storage is unavailable the merge is kept in memory for the
 * remainder of the session.
 * @param {object} [partial] keys to overlay (ignored when not a plain object)
 * @returns {{baseUrl: string, key: string, model: string, scope: string, includeGeo: boolean, temperature: number}} the merged config
 */
export function saveAIConfig(partial) {
  const current = loadAIConfig();
  const patch = partial && typeof partial === 'object' && !Array.isArray(partial) ? partial : {};
  const next = { ...current, ...patch };
  writeStored(JSON.stringify(next));
  return next;
}

/**
 * Clear the persisted settings and return factory defaults.
 *
 * What: removes the `localStorage` entry and the in-memory mirror.
 * Why: "Reset settings" must not leave a stale key/model behind for the next user of
 * the device.
 * Never throws.
 * @returns {{baseUrl: string, key: string, model: string, scope: string, includeGeo: boolean, temperature: number}} a fresh copy of `AI_DEFAULTS`
 */
export function resetAIConfig() {
  clearStored();
  return { ...AI_DEFAULTS };
}

/**
 * Whether a config is complete enough to make a request.
 *
 * What: true only when `baseUrl`, `key`, and `model` are all non-empty strings
 * (whitespace-only counts as empty).
 * Why: every caller wants the same "can we talk to the endpoint yet?" decision, and
 * the panel uses it to point the user at the missing field.
 * @param {object} [cfg] config to test (typically from `loadAIConfig()`)
 * @returns {boolean}
 */
export function isConfigured(cfg) {
  if (!cfg || typeof cfg !== 'object') return false;
  const has = (value) => typeof value === 'string' && value.trim() !== '';
  return has(cfg.baseUrl) && has(cfg.key) && has(cfg.model);
}
