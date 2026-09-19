// city-common/champion-file.js — the ONE portable artifact for a student's work.
//
// The programme promises "everything lives in the Champion File". This module
// makes that real: it bundles every piece of student state the unified origin
// owns (layout + quests + props + skin + language + unlock/progress flags) into
// a single versioned JSON the student can download (or save to the cloud) and
// restore on ANY device, next lesson, weeks later.
//
// Design notes:
//  - The `state` payload is the RAW localStorage string per key, stored
//    losslessly. Applying = writing the raw strings back. No per-app schema to
//    drift — the apps re-read their own keys on boot exactly as before.
//  - `collectState`/`writeState` take an injected storage so node:test can pass
//    a fake; every other function is pure.
//  - Versioned + kind-tagged so a future v2 can migrate old files.
//
// Usage (browser):
//   const file = composeChampionFile(collectState(), 'Jason week 3');
//   const raw  = JSON.stringify(file);
//   // ... download raw, or POST to the cloud save endpoint ...
//   const { ok, file } = sanitizeChampionFile(raw);   // validate on load
//   writeState(file.state);                            // restore → reload
export const CHAMPION_FILE_KIND = 'passiona-champion-file';
export const CHAMPION_FILE_VERSION = 1;

/** The localStorage keys the Champion File owns (all same-origin). */
export const CF_KEYS = {
  layout: 'p5_city_planner_layout_v1',
  quests: 'hk_ai_city_quests_v1',
  props: 'hk_ai_city_props_citybuilder_v1',
  skin: 'hk_ai_city_skin_v2',
  accessories: 'hk_ai_city_accessories_v1',
  unlockedSkins: 'hk_ai_city_unlocked_skins_v1',
  lang: 'hk_ai_city_lang_v1',
  plannerUnlocked: 'p5_planner_unlocked',
  coachSeen: 'p5_city_planner_coach_v1',
  pregame: 'p5_pregame_progress',
  badges: 'p5_city_badges_v1',
  milestones: 'p5_city_milestones_v1',
  caps: 'p5_city_capabilities_v1',
  cityName: 'p5_city_save_name_v1',
  customModels: 'hk_ai_city_custom_models_v1',
  cityLook: 'p5_city_look_v1',
  groundTexture: 'p5_city_ground_texture_v1',
  trafficVehicles: 'p5_city_traffic_vehicles_v1',
};

/** Read every known key as its raw string (absent keys omitted). */
export function collectState(storage = defaultStorage()) {
  const state = {};
  for (const key of Object.keys(CF_KEYS)) {
    let v = null;
    try { v = storage.getItem(CF_KEYS[key]); } catch { /* ignore */ }
    if (v !== null && v !== undefined) state[key] = String(v);
  }
  return state;
}

/**
 * Write every raw string back (best-effort; never throws).
 * Returns `{ wrote, total, ok, failed }` so the UI can WARN on a partial
 * restore (e.g. a storage quota hit mid-loop) instead of silently dropping
 * state and leaving the child with a fragmented city.
 */
export function writeState(state, storage = defaultStorage()) {
  const entries = Object.entries(state || {}).filter(([key, raw]) => Object.hasOwn(CF_KEYS, key) && typeof raw === 'string');
  const failed = [];
  let wrote = 0;
  if (storage) {
    for (const [key, raw] of entries) {
      try { storage.setItem(CF_KEYS[key], raw); wrote++; }
      catch { failed.push(key); }
    }
  } else {
    for (const [key] of entries) failed.push(key);
  }
  return { wrote, total: entries.length, ok: failed.length === 0, failed };
}

/** Build the versioned, kind-tagged file object. */
export function composeChampionFile(state, label) {
  return {
    kind: CHAMPION_FILE_KIND,
    version: CHAMPION_FILE_VERSION,
    savedAt: new Date().toISOString(),
    label: (typeof label === 'string' && label.trim()) ? label.trim() : 'My AI City',
    state,
  };
}

/**
 * Validate a parsed champion file. Returns { ok, file?, error? }.
 * Never throws. Rejects wrong kind/version, non-object state, or state whose
 * values aren't JSON-safe strings — but does NOT try to understand each key
 * (the apps re-validate their own data on boot).
 */
export function sanitizeChampionFile(parsed) {
  try { return sanitizeChampionFileValue(parsed); } catch { return { ok: false, error: 'Invalid Champion File values.' }; }
}
function sanitizeChampionFileValue(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'That file is not a Champion File.' };
  }
  if (parsed.kind !== CHAMPION_FILE_KIND) {
    return { ok: false, error: 'That does not look like a Champion File (wrong type).' };
  }
  if (parsed.version !== CHAMPION_FILE_VERSION) {
    return { ok: false, error: `This Champion File is version ${parsed.version} — this app knows version ${CHAMPION_FILE_VERSION}.` };
  }
  if (!withinImportLimit(JSON.stringify(parsed))) return { ok: false, error: 'File is too large (maximum 5 MiB).' };
  const state = parsed.state;
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return { ok: false, error: 'The Champion File has no saved state.' };
  }
  for (const [k, v] of Object.entries(state)) {
    if (typeof v !== 'string') {
      return { ok: false, error: `The Champion File has an unusable value for "${k}".` };
    }
  }
  return { ok: true, file: { kind: parsed.kind, version: parsed.version, savedAt: parsed.savedAt, label: parsed.label, state } };
}

/** Safe download filename from a student's label (no path separators / junk). */
export function championFilename(label) {
  const base = String(label || 'my-ai-city')
    .replace(/[^A-Za-z0-9 _-]/g, '')   // strip anything not safe
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
    .trim() || 'my-ai-city';
  return `${base}.champion.json`;
}

// ── "When did the child last save?" — powers the resume surface ──────────────
// A device-local timestamp (NOT part of the Champion File state) set whenever
// the child makes a backup. The city entry overlay uses it to greet a returning
// student ("Continue — last saved 2 Sep") instead of a cold "start".
export const SAVE_AT_KEY = 'p5_city_saved_at_v1';

/** Record the current time as the child's last-save moment. */
export function rememberSavedAt(storage = defaultStorage()) {
  if (!storage) return;
  try { storage.setItem(SAVE_AT_KEY, new Date().toISOString()); } catch { /* ignore */ }
}

/** The ISO timestamp of the last save, or null if never saved. */
export function lastSavedAt(storage = defaultStorage()) {
  if (!storage) return null;
  try { return storage.getItem(SAVE_AT_KEY) || null; } catch { return null; }
}

function defaultStorage() {
  try { return (typeof window !== 'undefined' && window.localStorage) || null; } catch { return null; }
}

// Total UTF-8 size, checked before FileReader and before parsing pasted JSON.
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export function withinImportLimit(raw) {
  return typeof raw === 'string' && raw.length <= MAX_IMPORT_BYTES && new TextEncoder().encode(raw).byteLength <= MAX_IMPORT_BYTES;
}
export function downloadState(state, label) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(composeChampionFile(state, label), null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = championFilename(label);
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
