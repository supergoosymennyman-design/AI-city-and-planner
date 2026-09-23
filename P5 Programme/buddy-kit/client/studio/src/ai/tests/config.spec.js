/**
 * config.spec.js — pure-node coverage for the AI settings store (`src/ai/config.js`).
 *
 * There is no `localStorage` in Node, so the default run exercises the module's
 * in-memory fallback directly. The remaining blocks install a `globalThis.localStorage`
 * stub to prove the failure paths (corrupt JSON, a throwing `setItem`, storage absent
 * entirely) degrade to defaults without throwing — and every stub is removed in a
 * `finally` so the global is restored even if an assertion helper misbehaves.
 *
 * The file is discovered and called by `run-tests.mjs`'s `src/ai/tests/*.spec.js` block:
 * `export default function configTests(check)` where `check(name, cond)` counts PASS/FAIL.
 */

import {
  AI_DEFAULTS,
  loadAIConfig,
  saveAIConfig,
  resetAIConfig,
  isConfigured,
} from '../config.js';

/** Compare two configs field-for-field (all fields are primitives). */
const KEYS = Object.keys(AI_DEFAULTS);
function sameConfig(a, b) {
  return !!a && !!b && KEYS.every((k) => Object.is(a[k], b[k]));
}

// --- global localStorage stub plumbing ------------------------------------------
const HAD_LOCAL_STORAGE = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage');
const PREV_LOCAL_STORAGE = globalThis.localStorage;

/** Install a fake `localStorage`. */
function installStorage(stub) {
  globalThis.localStorage = stub;
}

/** Remove the global entirely (the plain-Node case). */
function removeStorage() {
  try {
    delete globalThis.localStorage;
  } catch (err) {
    /* nothing more we can do */
  }
}

/** Put the real global back exactly as it was. */
function restoreStorage() {
  if (HAD_LOCAL_STORAGE) globalThis.localStorage = PREV_LOCAL_STORAGE;
  else removeStorage();
}

/**
 * Minimal localStorage double. `failSet` makes `setItem` throw like a quota/private-mode
 * error; `value` pre-seeds the single key the store uses.
 */
function makeStub({ failSet = false, failRemove = false, value = null } = {}) {
  const store = new Map();
  if (value != null) store.set('studio.ai.config', value);
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => {
      if (failSet) {
        const err = new Error('QuotaExceededError');
        err.name = 'QuotaExceededError';
        throw err;
      }
      store.set(k, v);
    },
    removeItem: (k) => {
      if (failRemove) throw new Error('Storage is read-only');
      store.delete(k);
    },
    _store: store,
  };
}

export default function configTests(check) {
  // 1. No secret is committed and the defaults have the documented shape.
  check(
    'config: defaults ship without a hardcoded key or server',
    AI_DEFAULTS.key === '' &&
      AI_DEFAULTS.model === '' &&
      AI_DEFAULTS.baseUrl === '' &&
      AI_DEFAULTS.scope === 'selected' &&
      AI_DEFAULTS.includeGeo === false &&
      AI_DEFAULTS.temperature === 0.4,
  );

  // 2. No localStorage at all (the Node case): defaults, in-memory save, reset.
  try {
    removeStorage();
    resetAIConfig();
    check(
      'config: absent localStorage — load returns defaults',
      typeof globalThis.localStorage === 'undefined' && sameConfig(loadAIConfig(), AI_DEFAULTS),
    );

    let saveThrew = null;
    let saved;
    try {
      saved = saveAIConfig({ key: 'sk-memory' });
    } catch (err) {
      saveThrew = err;
    }
    check(
      'config: absent localStorage — save does not throw and returns the merge',
      saveThrew === null && !!saved && saved.key === 'sk-memory' &&
        saved.model === AI_DEFAULTS.model && saved.baseUrl === AI_DEFAULTS.baseUrl,
    );
    check(
      'config: absent localStorage — the in-memory value survives a reload',
      loadAIConfig().key === 'sk-memory',
    );

    const afterReset = resetAIConfig();
    check(
      'config: reset clears the in-memory value and returns defaults',
      sameConfig(afterReset, AI_DEFAULTS) && loadAIConfig().key === '',
    );
  } finally {
    restoreStorage();
  }

  // 3. Partial saves merge over what is already stored (untouched fields intact).
  try {
    installStorage(makeStub());
    resetAIConfig();
    saveAIConfig({ key: 'sk-abc' });
    const merged = saveAIConfig({ model: 'gpt-test' });
    const loaded = loadAIConfig();
    check(
      'config: partial save merges and leaves untouched fields intact',
      merged.key === 'sk-abc' &&
        merged.model === 'gpt-test' &&
        merged.baseUrl === AI_DEFAULTS.baseUrl &&
        merged.scope === 'selected' &&
        merged.includeGeo === false &&
        merged.temperature === 0.4 &&
        loaded.key === 'sk-abc' &&
        loaded.model === 'gpt-test',
    );
    const again = saveAIConfig({ model: 'gpt-test' });
    check(
      'config: saving the same partial twice is idempotent',
      sameConfig(again, loaded),
    );
  } finally {
    restoreStorage();
  }

  // 4. Corrupt / non-object stored JSON degrades to defaults (never throws).
  try {
    installStorage(makeStub({ value: '{not valid json' }));
    let loadThrew = null;
    let corrupt;
    try {
      corrupt = loadAIConfig();
    } catch (err) {
      loadThrew = err;
    }
    check(
      'config: corrupt stored JSON returns defaults without throwing',
      loadThrew === null && sameConfig(corrupt, AI_DEFAULTS),
    );

    installStorage(makeStub({ value: '[1,2,3]' }));
    check(
      'config: non-object stored JSON returns defaults',
      sameConfig(loadAIConfig(), AI_DEFAULTS),
    );
  } finally {
    restoreStorage();
  }

  // 5. A storage that throws on write (quota / private mode) still works in memory.
  try {
    installStorage(makeStub({ failSet: true }));
    resetAIConfig();
    let saveThrew = null;
    let saved;
    try {
      saved = saveAIConfig({ key: 'sk-quota' });
    } catch (err) {
      saveThrew = err;
    }
    check(
      'config: a throwing setItem degrades to memory without throwing',
      saveThrew === null && !!saved && saved.key === 'sk-quota' &&
        loadAIConfig().key === 'sk-quota',
    );
  } finally {
    restoreStorage();
  }

  // 6. resetAIConfig really removes the persisted entry.
  try {
    const stub = makeStub();
    installStorage(stub);
    saveAIConfig({ key: 'sk-clear' });
    const wasStored = stub.getItem('studio.ai.config') !== null;
    const returned = resetAIConfig();
    check(
      'config: reset clears the stored entry and returns defaults',
      wasStored &&
        stub.getItem('studio.ai.config') === null &&
        sameConfig(returned, AI_DEFAULTS) &&
        loadAIConfig().key === '',
    );
  } finally {
    restoreStorage();
  }

  // 7. isConfigured gates on baseUrl + key + model (whitespace is not a value).
  try {
    const stub = makeStub({ value: JSON.stringify({ key: 'sk-old', model: 'old-model' }), failSet: true });
    installStorage(stub);
    saveAIConfig({ key: 'sk-new' });
    check('config: failed replacement uses the new key instead of stale storage', loadAIConfig().key === 'sk-new');
    saveAIConfig({ model: 'new-model' });
    check('config: successive failed writes merge the current session settings',
      loadAIConfig().key === 'sk-new' && loadAIConfig().model === 'new-model');
    resetAIConfig();

    installStorage(makeStub({ value: JSON.stringify({ key: 'sk-old' }), failRemove: true, failSet: true }));
    resetAIConfig();
    check('config: failed removal does not resurrect the old key in this session', loadAIConfig().key === '');
    saveAIConfig({ model: 'after-reset' });
    check('config: a save after failed reset cannot merge the forgotten key back in', loadAIConfig().key === '');

    const recovered = makeStub();
    installStorage(recovered);
    saveAIConfig({ key: 'sk-recovered' });
    check('config: a later successful write persists the session value',
      JSON.parse(recovered.getItem('studio.ai.config')).key === 'sk-recovered');
    recovered.removeItem('studio.ai.config');
    check('config: clearing working storage in another tab does not resurrect the mirror', loadAIConfig().key === '');

    recovered.setItem('studio.ai.config', JSON.stringify({ key: 'sk-read' }));
    loadAIConfig();
    recovered.getItem = () => { throw new Error('Storage blocked'); };
    check('config: a successful read is mirrored if storage later becomes unreadable', loadAIConfig().key === 'sk-read');
  } finally {
    installStorage(makeStub());
    resetAIConfig();
    restoreStorage();
  }

  check(
    'config: isConfigured is false until baseUrl, key and model are all set',
    isConfigured(AI_DEFAULTS) === false && // key + model still empty
      isConfigured({ ...AI_DEFAULTS, key: 'sk-1' }) === false && // model empty
      isConfigured({ ...AI_DEFAULTS, model: 'm-1' }) === false && // key empty
      isConfigured({ baseUrl: '', key: 'sk-1', model: 'm-1' }) === false && // baseUrl empty
      isConfigured({ baseUrl: '   ', key: 'sk-1', model: 'm-1' }) === false && // whitespace baseUrl
      isConfigured({ baseUrl: 'https://x.example/v1', key: '   ', model: 'm-1' }) === false && // whitespace key
      isConfigured(null) === false,
  );
  check(
    'config: isConfigured is true once baseUrl, key and model are all non-empty',
    isConfigured({ baseUrl: 'https://x.example/v1', key: 'sk-1', model: 'm-1' }) === true,
  );
}
