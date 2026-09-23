/**
 * store.test.js — synchronous node coverage for the shop state store (`src/shop/store.js`).
 *
 * Node has no `localStorage`, so the default run exercises the module's in-memory mirror
 * directly. Every remaining block installs a `globalThis.localStorage` stub to prove the
 * degradation paths (corrupt JSON, wrong version, a throwing `setItem`, storage absent
 * entirely, and a storage whose very *read* throws) resolve to safe values without
 * throwing — and each stub is torn down in a `finally` so the global is restored even if
 * an assertion helper misbehaves.
 *
 * Called by `test.mjs`'s discovery as `export default function (check)`; the harness does
 * NOT await the call, so this module must stay synchronous.
 */

import {
  SHOP_KEY,
  SHOP_VERSION,
  loadShopState,
  saveShopState,
  resetShopState,
} from '../store.js';

/** Economy defaults the controller would pass in (coins/level come from the catalog). */
const DEFAULTS = { coins: 120, level: 1 };

/** The exact fallback shape: defaults + empty shop-only fields + current version. */
const SAFE = {
  coins: 120,
  level: 1,
  version: SHOP_VERSION,
  owned: [],
  placed: [],
  nextPlacementId: 1,
  collapsed: false,
  sidebarWidth: 240,
  achieved: [],
  unlockedNodes: [],
};

/** Structural deep-equality that works for plain JSON-shaped values. */
function deepEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
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
  if (HAD_LOCAL_STORAGE) {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: PREV_LOCAL_STORAGE,
    });
  } else {
    removeStorage();
  }
}

/**
 * Minimal localStorage double. `failSet` makes `setItem` throw like a quota/private-mode
 * error; `value` pre-seeds the single key the store uses; `failGet` makes reads throw.
 */
function makeStub({ failSet = false, failGet = false, value = null } = {}) {
  const store = new Map();
  if (value != null) store.set(SHOP_KEY, value);
  return {
    getItem: (k) => {
      if (failGet) {
        const err = new Error('SecurityError');
        err.name = 'SecurityError';
        throw err;
      }
      return store.has(k) ? store.get(k) : null;
    },
    setItem: (k, v) => {
      if (failSet) {
        const err = new Error('QuotaExceededError');
        err.name = 'QuotaExceededError';
        throw err;
      }
      store.set(k, v);
    },
    removeItem: (k) => { store.delete(k); },
    _store: store,
  };
}

/** A representative, fully well-formed state. */
function sampleState() {
  return {
    coins: 80,
    level: 3,
    owned: ['starter-cube', 'rocket-cone'],
    placed: [
      { id: 1, modelId: 'starter-cube', p: [1, 0, -2], q: [0, 0, 0, 1], s: [1, 1, 1] },
      { id: 2, modelId: 'rocket-cone', p: [0, 0.5, 0], q: [0, 0.707, 0, 0.707], s: [2, 2, 2] },
    ],
    nextPlacementId: 3,
    collapsed: true,
    sidebarWidth: 280,
    achieved: ['first-steps', 'collector'],
    unlockedNodes: ['node-root', 'node-branch'],
  };
}

export default function storeTests(check) {
  // 1. The frozen key/version constants.
  check(
    'store: key and version constants are frozen',
    SHOP_KEY === 'studio.shop.v1' && SHOP_VERSION === 1,
  );

  // 2. Round-trip: save -> load is deep-equal, with the version forced to SHOP_VERSION.
  try {
    installStorage(makeStub());
    resetShopState();
    const state = sampleState();
    let threw = null;
    try {
      saveShopState(state);
    } catch (err) {
      threw = err;
    }
    const loaded = loadShopState(DEFAULTS);
    check(
      'store: save -> load round-trips deep-equal with the version forced',
      threw === null && deepEqual(loaded, { ...state, version: SHOP_VERSION }),
    );
  } finally {
    restoreStorage();
  }

  // 3. Corrupt JSON in storage -> safe defaults, never throws.
  try {
    installStorage(makeStub({ value: '{not valid json' }));
    let threw = null;
    let loaded;
    try {
      loaded = loadShopState(DEFAULTS);
    } catch (err) {
      threw = err;
    }
    check('store: corrupt stored JSON returns safe defaults without throwing',
      threw === null && deepEqual(loaded, SAFE));
  } finally {
    restoreStorage();
  }

  // 4. Non-object / array / primitive stored JSON -> safe defaults.
  for (const value of ['[]', 'null', '1', '"x"']) {
    try {
      installStorage(makeStub({ value }));
      let threw = null;
      let loaded;
      try {
        loaded = loadShopState(DEFAULTS);
      } catch (err) {
        threw = err;
      }
      check(`store: stored ${JSON.stringify(value)} returns safe defaults without throwing`,
        threw === null && deepEqual(loaded, SAFE));
    } finally {
      restoreStorage();
    }
  }

  // 5. A version mismatch is ignored loudly (no throw, no migration) -> safe defaults.
  try {
    const stale = JSON.stringify({
      version: 99,
      coins: 5,
      level: 9,
      owned: ['ghost-model'],
      placed: [{
        id: 1, modelId: 'starter-cube', p: [0, 0, 0], q: [0, 0, 0, 1], s: [1, 1, 1],
      }],
      nextPlacementId: 4,
      collapsed: true,
    });
    installStorage(makeStub({ value: stale }));
    let threw = null;
    let loaded;
    try {
      loaded = loadShopState(DEFAULTS);
    } catch (err) {
      threw = err;
    }
    check('store: version 99 returns safe defaults without throwing',
      threw === null && deepEqual(loaded, SAFE));
  } finally {
    restoreStorage();
  }

  // 6. A throwing setItem (quota / private mode) still keeps the in-session value.
  try {
    installStorage(makeStub({ failSet: true }));
    resetShopState();
    const state = sampleState();
    let threw = null;
    try {
      saveShopState(state);
    } catch (err) {
      threw = err;
    }
    const loaded = loadShopState(DEFAULTS);
    check(
      'store: a throwing setItem degrades to the memory mirror without throwing',
      threw === null &&
        deepEqual(loaded, { ...state, version: SHOP_VERSION }) &&
        globalThis.localStorage.getItem(SHOP_KEY) === null,
    );
  } finally {
    restoreStorage();
  }

  // 6b. A FAILED write makes the in-memory mirror authoritative: an older value still
  //     in storage must NOT win over the newer accepted in-session value.
  try {
    removeStorage();
    resetShopState();
    const older = JSON.stringify({ ...sampleState(), coins: 5, version: SHOP_VERSION });
    installStorage(makeStub({ failSet: true, value: older }));
    const newer = { ...sampleState(), coins: 80 };
    let threw = null;
    try {
      saveShopState(newer);
    } catch (err) {
      threw = err;
    }
    const loaded = loadShopState(DEFAULTS);
    check(
      'store: a failed setItem keeps the newer in-session value over older stored state',
      threw === null &&
        loaded.coins === 80 &&
        globalThis.localStorage.getItem(SHOP_KEY) === older,
    );
  } finally {
    restoreStorage();
  }

  // 7. Storage entirely absent (plain Node): save + load still round-trip in memory.
  try {
    removeStorage();
    resetShopState();
    const state = sampleState();
    let threw = null;
    try {
      saveShopState(state);
      saveShopState({ ...state, coins: 71 });
    } catch (err) {
      threw = err;
    }
    const loaded = loadShopState(DEFAULTS);
    check(
      'store: absent localStorage round-trips in memory without throwing',
      threw === null &&
        typeof globalThis.localStorage === 'undefined' &&
        deepEqual(loaded, { ...state, coins: 71, version: SHOP_VERSION }),
    );
  } finally {
    restoreStorage();
  }

  // 8. Merely reading the storage global throws (sandboxed context): mirror still works.
  try {
    removeStorage();
    resetShopState();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() { throw new Error('SecurityError'); },
    });
    const state = sampleState();
    let threw = null;
    try {
      saveShopState(state);
    } catch (err) {
      threw = err;
    }
    const loaded = loadShopState(DEFAULTS);
    check(
      'store: a storage global whose read throws falls back to memory without throwing',
      threw === null && deepEqual(loaded, { ...state, version: SHOP_VERSION }),
    );
  } finally {
    restoreStorage();
  }

  // 9. Field sanitization: bad scalars fall back, malformed placements are dropped,
  //    and nextPlacementId is recomputed from the placements that survived.
  try {
    const dirty = JSON.stringify({
      version: SHOP_VERSION,
      coins: -5,
      level: 2.5,
      owned: ['ok', '', 7, null, 'also-ok'],
      placed: [
        { id: 4, modelId: 'golden-cylinder', p: [1, 2, 3], q: [0, 0, 0, 1], s: [1, 1, 1] },
        { id: -1, modelId: 'bad-id', p: [0, 0, 0], q: [0, 0, 0, 1], s: [1, 1, 1] },
        { id: 5, modelId: 'short-vector', p: [0, 0], q: [0, 0, 0, 1], s: [1, 1, 1] },
        { id: 6, modelId: 'not-finite', p: [0, 0, NaN], q: [0, 0, 0, 1], s: [1, 1, 1] },
        { id: 7, modelId: 9, p: [0, 0, 0], q: [0, 0, 0, 1], s: [1, 1, 1] },
        'nope',
        null,
      ],
      nextPlacementId: 2,
      collapsed: 'yes',
      sidebarWidth: 'wide',
    });
    // A fresh session has an empty in-memory mirror; clear it first so this block
    // reads the seeded storage rather than a value left by an earlier block.
    resetShopState();
    installStorage(makeStub({ value: dirty }));
    const loaded = loadShopState(DEFAULTS);
    check(
      'store: malformed fields are sanitized instead of trusted',
      deepEqual(loaded, {
        coins: 120,
        level: 1,
        version: SHOP_VERSION,
        owned: ['ok', 'also-ok'],
        placed: [{
          id: 4, modelId: 'golden-cylinder', p: [1, 2, 3], q: [0, 0, 0, 1], s: [1, 1, 1],
        }],
        nextPlacementId: 5,
        collapsed: false,
        sidebarWidth: 240,
        achieved: [],
        unlockedNodes: [],
      }),
    );
  } finally {
    restoreStorage();
  }

  // 9b. Duplicate placement ids are dropped: a poisoned blob with 1000 copies of one id
  //     would otherwise render 1000 meshes that can never be fully deleted.
  try {
    const withDuplicates = JSON.stringify({
      version: SHOP_VERSION,
      coins: 120,
      level: 1,
      owned: [],
      placed: [
        { id: 7, modelId: 'starter-cube', p: [1, 0, 0], q: [0, 0, 0, 1], s: [1, 1, 1] },
        { id: 7, modelId: 'starter-cube', p: [2, 0, 0], q: [0, 0, 0, 1], s: [1, 1, 1] },
        { id: 7, modelId: 'rocket-cone', p: [3, 0, 0], q: [0, 0, 0, 1], s: [1, 1, 1] },
        { id: 8, modelId: 'rocket-cone', p: [0, 0, 0], q: [0, 0, 0, 1], s: [1, 1, 1] },
      ],
      nextPlacementId: 0,
      collapsed: false,
    });
    // Fresh-session mirror, same isolation rule as section 9.
    resetShopState();
    installStorage(makeStub({ value: withDuplicates }));
    const loaded = loadShopState(DEFAULTS);
    check('store: duplicate placement ids are dropped, first occurrence wins',
      loaded.placed.length === 2 &&
        loaded.placed.map((entry) => entry.id).join(',') === '7,8' &&
        deepEqual(loaded.placed[0].p, [1, 0, 0]));
    check('store: nextPlacementId is recomputed from the surviving max id',
      loaded.nextPlacementId === 9);

    const poisoned = JSON.stringify({
      version: SHOP_VERSION,
      coins: 120,
      level: 1,
      owned: [],
      placed: Array.from({ length: 1000 }, () => ({
        id: 7, modelId: 'starter-cube', p: [0, 0, 0], q: [0, 0, 0, 1], s: [1, 1, 1],
      })),
      nextPlacementId: 0,
      collapsed: false,
    });
    installStorage(makeStub({ value: poisoned }));
    const loadedPoisoned = loadShopState(DEFAULTS);
    check('store: 1000 duplicate-id placements collapse to exactly one',
      loadedPoisoned.placed.length === 1 && loadedPoisoned.placed[0].id === 7);
  } finally {
    restoreStorage();
  }

  // 10. The defaults argument is never mutated.
  try {
    installStorage(makeStub({ value: '{broken' }));
    const defaults = { coins: 7, level: 2 };
    const snapshot = JSON.stringify(defaults);
    loadShopState(defaults);
    check('store: loadShopState never mutates the defaults argument',
      JSON.stringify(defaults) === snapshot);
  } finally {
    restoreStorage();
  }

  // 11. resetShopState clears both the stored entry and the mirror.
  try {
    const stub = makeStub();
    installStorage(stub);
    saveShopState(sampleState());
    const wasStored = stub.getItem(SHOP_KEY) !== null;
    resetShopState();
    check(
      'store: reset clears the stored entry and the memory mirror',
      wasStored && stub.getItem(SHOP_KEY) === null && deepEqual(loadShopState(DEFAULTS), SAFE),
    );
  } finally {
    restoreStorage();
  }

  // 12. Hostile inputs to load/save never throw.
  try {
    removeStorage();
    resetShopState();
    let threw = null;
    try {
      for (const input of [undefined, null, 0, '', [], [1], () => {}]) {
        loadShopState(input);
        saveShopState(input);
      }
    } catch (err) {
      threw = err;
    }
    check('store: hostile defaults/state inputs never throw', threw === null);
  } finally {
    restoreStorage();
  }

  // 13. sidebarWidth: fresh defaults, a legacy (no-field) document, round-trip, garbage.
  try {
    removeStorage();
    resetShopState();
    installStorage(makeStub());
    check('store: fresh defaults include sidebarWidth 240',
      loadShopState(DEFAULTS).sidebarWidth === 240);

    // A document written before this field existed must NOT be treated as corrupt:
    // coins/level/owned survive and sidebarWidth gains the safe default.
    const legacy = JSON.stringify({
      version: SHOP_VERSION,
      coins: 77,
      level: 4,
      owned: ['starter-cube', 'rocket-cone'],
      placed: [],
      nextPlacementId: 1,
      collapsed: true,
    });
    resetShopState();
    installStorage(makeStub({ value: legacy }));
    const migrated = loadShopState(DEFAULTS);
    check(
      'store: legacy document keeps coins/level/owned and gains sidebarWidth 240',
      migrated.coins === 77 && migrated.level === 4 &&
        deepEqual(migrated.owned, ['starter-cube', 'rocket-cone']) &&
        migrated.sidebarWidth === 240,
    );

    installStorage(makeStub());
    resetShopState();
    saveShopState({ ...sampleState(), sidebarWidth: 280 });
    check('store: sidebarWidth round-trips through save/load',
      loadShopState(DEFAULTS).sidebarWidth === 280);

    for (const bad of ['wide', null, NaN, Infinity, -Infinity, {}, []]) {
      resetShopState();
      installStorage(makeStub({
        value: JSON.stringify({ ...sampleState(), sidebarWidth: bad }),
      }));
      check(`store: sidebarWidth ${String(bad)} is sanitized to 240`,
        loadShopState(DEFAULTS).sidebarWidth === 240);
    }
  } finally {
    restoreStorage();
  }

  // 14. Persisting sidebarWidth never disturbs the monotonic `owned` set.
  try {
    installStorage(makeStub());
    resetShopState();
    saveShopState({ coins: 10, level: 2, owned: ['a', 'b'], sidebarWidth: 300 });
    const first = loadShopState(DEFAULTS);
    saveShopState({ ...first, sidebarWidth: 260 });
    const second = loadShopState(DEFAULTS);
    check('store: changing sidebarWidth preserves the monotonic owned set',
      deepEqual(second.owned, ['a', 'b']) && second.sidebarWidth === 260);
  } finally {
    restoreStorage();
  }

  // 15. achieved/unlockedNodes (Wave B): fresh defaults, a legacy (no-field) document,
  //     round-trip, garbage sanitization, and `owned` monotonicity staying untouched.
  try {
    removeStorage();
    resetShopState();
    installStorage(makeStub());
    const fresh = loadShopState(DEFAULTS);
    check('store: fresh defaults include empty achieved/unlockedNodes',
      deepEqual(fresh.achieved, []) && deepEqual(fresh.unlockedNodes, []));

    // A Wave A document (sidebarWidth present, but no achieved/unlockedNodes) must NOT be
    // treated as corrupt/reset: coins/level/owned/sidebarWidth survive, new fields default.
    const waveA = JSON.stringify({
      version: SHOP_VERSION,
      coins: 77,
      level: 4,
      owned: ['starter-cube', 'rocket-cone'],
      placed: [],
      nextPlacementId: 1,
      collapsed: true,
      sidebarWidth: 300,
    });
    resetShopState();
    installStorage(makeStub({ value: waveA }));
    const legacy = loadShopState(DEFAULTS);
    check(
      'store: Wave A document keeps coins/level/owned/sidebarWidth and gains empty new sets',
      legacy.coins === 77 && legacy.level === 4 &&
        deepEqual(legacy.owned, ['starter-cube', 'rocket-cone']) &&
        legacy.sidebarWidth === 300 &&
        deepEqual(legacy.achieved, []) && deepEqual(legacy.unlockedNodes, []),
    );

    // Round-trip: both sets survive save -> load.
    installStorage(makeStub());
    resetShopState();
    saveShopState({ ...sampleState(), achieved: ['a', 'b'], unlockedNodes: ['n1', 'n2'] });
    const roundTripped = loadShopState(DEFAULTS);
    check('store: achieved/unlockedNodes round-trip through save/load',
      deepEqual(roundTripped.achieved, ['a', 'b']) &&
        deepEqual(roundTripped.unlockedNodes, ['n1', 'n2']));

    // Garbage is dropped and duplicates collapse (first occurrence wins).
    resetShopState();
    installStorage(makeStub({
      value: JSON.stringify({
        ...sampleState(),
        version: SHOP_VERSION,
        achieved: ['keep', 'keep', '', 7, null, 'keep2'],
        unlockedNodes: ['u', 'u', {}, []],
      }),
    }));
    const sanitized = loadShopState(DEFAULTS);
    check('store: achieved garbage is dropped and deduped',
      deepEqual(sanitized.achieved, ['keep', 'keep2']));
    check('store: unlockedNodes garbage is dropped and deduped',
      deepEqual(sanitized.unlockedNodes, ['u']));

    // Non-array values fall back to empty arrays (same policy as `owned`).
    for (const bad of ['nope', 7, {}, null]) {
      resetShopState();
      installStorage(makeStub({
        value: JSON.stringify({ ...sampleState(), version: SHOP_VERSION, achieved: bad, unlockedNodes: bad }),
      }));
      const loaded = loadShopState(DEFAULTS);
      check(`store: achieved/unlockedNodes ${JSON.stringify(bad)} fall back to []`,
        deepEqual(loaded.achieved, []) && deepEqual(loaded.unlockedNodes, []));
    }

    // Persisting the new sets never disturbs the monotonic `owned` set.
    installStorage(makeStub());
    resetShopState();
    saveShopState({ coins: 10, level: 2, owned: ['a', 'b'] });
    const first = loadShopState(DEFAULTS);
    saveShopState({
      ...first,
      achieved: ['earned-1'],
      unlockedNodes: ['node-1'],
    });
    const second = loadShopState(DEFAULTS);
    check('store: persisting achievements preserves the monotonic owned set',
      deepEqual(second.owned, ['a', 'b']) &&
        deepEqual(second.achieved, ['earned-1']) &&
        deepEqual(second.unlockedNodes, ['node-1']));
  } finally {
    restoreStorage();
  }
}
