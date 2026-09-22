import { CF_KEYS, collectState } from './champion-file.js';
import { validateLayout } from './layout.js';
import { createProjectStore } from './project-store.js';

export const PROJECT_CHANGE_EVENT = 'passiona:project-change';
export const RECOVERY_SNAPSHOT_KEY = 'p5_city_recovery_snapshot_v1';

function knownEntries(state) {
  return Object.entries(state || {}).filter(([key, raw]) =>
    Object.hasOwn(CF_KEYS, key) && typeof raw === 'string');
}

export function validateProjectState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return { ok: false, error: 'Saved project state is missing.' };
  }
  for (const [key, raw] of Object.entries(state)) {
    if (!Object.hasOwn(CF_KEYS, key)) continue;
    if (typeof raw !== 'string') return { ok: false, error: `Saved section "${key}" is invalid.` };
  }
  if (typeof state.layout === 'string') {
    let layout;
    try { layout = JSON.parse(state.layout); }
    catch { return { ok: false, error: 'The city layout is not valid JSON.' }; }
    const result = validateLayout(layout);
    if (!result.ok) return { ok: false, error: `The city layout is invalid: ${result.errors?.[0] || 'unknown layout error'}` };
  }
  return { ok: true };
}

export function createProjectStateCoordinator({
  storage = safeStorage(),
  eventTarget = globalThis.window,
  now = () => new Date().toISOString(),
} = {}) {
  let memoryRecovery = null;
  let mirrorTimer = null;

  // Legacy keys remain the City runtime's compatibility mirror. Mirror a
  // completed transaction into the broader project without blocking a child.
  function mirrorCitySection() {
    if (mirrorTimer || storage !== safeStorage()) return;
    mirrorTimer = setTimeout(async () => {
      mirrorTimer = null;
      try {
        const store = createProjectStore({ storage });
        const project = await store.openActiveProject();
        await store.commitSection('city', { legacyState: collectState(storage) }, project.revision);
      } catch { /* IndexedDB is an extra recovery layer, never a blocker. */ }
    }, 350);
  }

  function emit(detail) {
    if (!eventTarget?.dispatchEvent) return;
    const EventCtor = globalThis.CustomEvent;
    if (typeof EventCtor === 'function') eventTarget.dispatchEvent(new EventCtor(PROJECT_CHANGE_EVENT, { detail }));
    else eventTarget.dispatchEvent({ type: PROJECT_CHANGE_EVENT, detail });
  }

  function storeRecovery(state, reason) {
    const record = { version: 1, savedAt: now(), reason, state };
    memoryRecovery = record;
    try { storage?.setItem(RECOVERY_SNAPSHOT_KEY, JSON.stringify(record)); } catch { /* memory copy remains */ }
    return record;
  }

  function readRecovery() {
    try {
      const parsed = JSON.parse(storage?.getItem(RECOVERY_SNAPSHOT_KEY) || 'null');
      if (parsed?.version === 1 && validateProjectState(parsed.state).ok) return parsed;
    } catch { /* use the session copy */ }
    return memoryRecovery;
  }

  function commit(nextState, { source = 'unknown', recovery = true } = {}) {
    const valid = validateProjectState(nextState);
    if (!valid.ok) return { ...valid, wrote: 0, failed: [] };
    const entries = knownEntries(nextState);
    const before = collectState(storage);
    if (recovery) storeRecovery(before, `before:${source}`);
    const touched = [];
    try {
      for (const [key, raw] of entries) {
        storage.setItem(CF_KEYS[key], raw);
        touched.push(key);
      }
    } catch (error) {
      const rollbackFailed = [];
      for (const key of touched.reverse()) {
        try {
          if (Object.hasOwn(before, key)) storage.setItem(CF_KEYS[key], before[key]);
          else storage.removeItem(CF_KEYS[key]);
        } catch { rollbackFailed.push(key); }
      }
      return {
        ok: false, wrote: 0, failed: entries.map(([key]) => key), rollbackFailed,
        error: rollbackFailed.length
          ? 'Restore failed and some sections could not be rolled back.'
          : (error?.message || 'Restore failed; your previous city was kept.'),
      };
    }
    emit({ source, keys: entries.map(([key]) => key), savedAt: now() });
    mirrorCitySection();
    return { ok: true, wrote: entries.length, total: entries.length, failed: [], rollbackFailed: [] };
  }

  function saveSection(key, raw, { source = 'autosave' } = {}) {
    if (!Object.hasOwn(CF_KEYS, key) || typeof raw !== 'string') {
      return { ok: false, error: 'Unknown or invalid project section.' };
    }
    return commit({ [key]: raw }, { source, recovery: false });
  }

  return { commit, saveSection, readRecovery, storeRecovery, snapshot: () => collectState(storage) };
}

function safeStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}
