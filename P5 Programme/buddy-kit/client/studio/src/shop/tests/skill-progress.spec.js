/**
 * skill-progress.test.js — pure-node coverage for the skill-tree achievement engine.
 *
 * Discovered and invoked by `test.mjs` as `export default function skillProgressTests(check)`.
 * It MUST be synchronous: the harness calls `mod.default(check)` without awaiting.
 *
 * These checks lock the invariants the whole skill tree depends on:
 *   - out-of-order achievement is lock-safe (a child unlocks only once every ancestor
 *     is achieved) and grants BOTH rewards exactly once;
 *   - duplicate / unknown / non-array ids never double-grant or throw;
 *   - level and coin sums are exact, including across branches;
 *   - `unlockedNodes` is monotonic — removing an id from `achieved` never re-locks or
 *     re-grants an already unlocked node;
 *   - the input `progress`/`config` (even deeply frozen) are never mutated;
 *   - the engine is total under hostile input and deterministic.
 *
 * No I/O, no clock, no RNG — so this file is itself deterministic.
 */

import {
  initialProgress,
  normalizeProgress,
  closure,
  nodeState,
  applyAchieved,
} from '../skill-progress.js';

/** Structural equality for plain JSON data (the progress/config shapes). */
function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Independent copy used to prove the engine did not mutate its input. */
function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

// --- fixtures ------------------------------------------------------------------
const CHAIN = {
  branches: [
    {
      id: 'br',
      name: 'B',
      nodes: [
        { id: 'a', name: 'A', levelReward: 1, coinReward: 10, depth: 0, parent: null },
        { id: 'b', name: 'B', levelReward: 2, coinReward: 25, depth: 1, parent: 'a' },
        { id: 'c', name: 'C', levelReward: 3, coinReward: 30, depth: 2, parent: 'b' },
      ],
    },
  ],
};

// Two branches so reward sums and cross-branch order can be exercised.
const TWO_BRANCHES = {
  branches: [
    { id: 'br1', name: 'One', nodes: [
      { id: 'a', name: 'A', levelReward: 1, coinReward: 10, parent: null },
      { id: 'b', name: 'B', levelReward: 2, coinReward: 25, parent: 'a' },
    ] },
    { id: 'br2', name: 'Two', nodes: [
      { id: 'd', name: 'D', levelReward: 3, coinReward: 5, parent: null },
      { id: 'e', name: 'E', levelReward: 4, coinReward: 20, parent: 'd' },
    ] },
  ],
};

// A cyclic parent chain: neither node can ever settle (fail closed).
const CYCLE = {
  branches: [
    { id: 'cy', name: 'Cycle', nodes: [
      { id: 'x', name: 'X', levelReward: 1, coinReward: 1, parent: 'y' },
      { id: 'y', name: 'Y', levelReward: 1, coinReward: 1, parent: 'x' },
    ] },
  ],
};

const HOSTILE = [undefined, null, 0, '', [], NaN, Infinity, -5, 1.5, '{"achieved":5}', {}, true];

export default function skillProgressTests(check) {
  // --- initialProgress ---------------------------------------------------------
  check(
    'skill-progress: initialProgress is empty and fresh',
    deepEqual(initialProgress(), { achieved: [], unlockedNodes: [] }) &&
      initialProgress() !== initialProgress(),
  );

  // --- closure: full ancestor chain required -----------------------------------
  check(
    'skill-progress: closure is empty with nothing achieved',
    deepEqual(closure(initialProgress(), CHAIN), []),
  );
  check(
    'skill-progress: closure requires the whole ancestor chain',
    deepEqual(closure({ achieved: ['b'], unlockedNodes: [] }, CHAIN), []) &&
      deepEqual(closure({ achieved: ['b', 'a'], unlockedNodes: [] }, CHAIN), ['a', 'b']) &&
      deepEqual(
        closure({ achieved: ['c', 'a', 'b'], unlockedNodes: [] }, CHAIN),
        ['a', 'b', 'c'],
      ),
  );
  check(
    'skill-progress: closure ignores unknown achieved ids and hostile config',
    deepEqual(closure({ achieved: ['ghost', 'a'], unlockedNodes: [] }, CHAIN), ['a']) &&
      deepEqual(closure(initialProgress(), null), []) &&
      deepEqual(closure(initialProgress(), { branches: 'nope' }), []),
  );

  // --- nodeState ---------------------------------------------------------------
  check(
    'skill-progress: nodeState is locked until settled, available when settled, achieved when unlocked',
    nodeState(initialProgress(), CHAIN, 'a') === 'locked' &&
      nodeState({ achieved: ['a'], unlockedNodes: [] }, CHAIN, 'a') === 'available' &&
      nodeState({ achieved: ['a'], unlockedNodes: ['a'] }, CHAIN, 'a') === 'achieved' &&
      nodeState(initialProgress(), CHAIN, 'zzz') === 'locked' &&
      nodeState(initialProgress(), CHAIN, 5) === 'locked',
  );

  // --- out-of-order: child first stays locked ----------------------------------
  const childFirst = applyAchieved(initialProgress(), CHAIN, ['b']);
  check(
    'skill-progress: a child reported before its parent stays locked and grants nothing',
    deepEqual(childFirst.newlyUnlocked, []) &&
      childFirst.grantedLevels === 0 &&
      childFirst.grantedCoins === 0 &&
      nodeState(childFirst.progress, CHAIN, 'b') === 'locked',
  );

  // --- parent arrives: both unlock, rewards granted exactly once ---------------
  const parentThen = applyAchieved(childFirst.progress, CHAIN, ['a']);
  check(
    'skill-progress: the parent arriving unlocks the child too',
    deepEqual(parentThen.newlyUnlocked, ['a', 'b']),
  );
  check(
    'skill-progress: both rewards are summed exactly once',
    parentThen.grantedLevels === 3 && parentThen.grantedCoins === 35,
  );
  check(
    'skill-progress: nodeState reports both nodes achieved after the parent arrives',
    nodeState(parentThen.progress, CHAIN, 'a') === 'achieved' &&
      nodeState(parentThen.progress, CHAIN, 'b') === 'achieved' &&
      nodeState(parentThen.progress, CHAIN, 'c') === 'locked',
  );

  // --- re-running the same ids grants nothing ----------------------------------
  const rerun = applyAchieved(parentThen.progress, CHAIN, ['a', 'b']);
  check(
    'skill-progress: re-running with the same ids grants 0 levels and 0 coins',
    deepEqual(rerun.newlyUnlocked, []) &&
      rerun.grantedLevels === 0 &&
      rerun.grantedCoins === 0 &&
      deepEqual(rerun.progress, parentThen.progress),
  );

  // --- duplicate ids are deduped -----------------------------------------------
  const dupes = applyAchieved(initialProgress(), CHAIN, ['a', 'a', 'b', 'a']);
  check(
    'skill-progress: duplicate ids never double-unlock or double-grant',
    deepEqual(dupes.newlyUnlocked, ['a', 'b']) &&
      dupes.grantedLevels === 3 &&
      dupes.grantedCoins === 35 &&
      deepEqual(dupes.ignored, []),
  );

  // --- unknown ids are ignored -------------------------------------------------
  const unknown = applyAchieved(initialProgress(), CHAIN, ['ghost', 'a', 'ghost', 42, null, '']);
  check(
    'skill-progress: unknown string ids are reported verbatim, invalid ids as one [invalid] tag',
    deepEqual(unknown.ignored, ['ghost', '[invalid]']) &&
      deepEqual(unknown.newlyUnlocked, ['a']) &&
      !unknown.progress.achieved.includes('ghost') &&
      !unknown.progress.achieved.includes('[invalid]'),
  );

  // --- invalid ids are surfaced, never silently dropped or coerced -------------
  const invalid = applyAchieved(initialProgress(), CHAIN, [7, null, {}, '', NaN, 'a', 'zzz']);
  check(
    'skill-progress: non-string / empty ids collapse to one deduped [invalid] tag in first-seen order',
    deepEqual(invalid.ignored, ['[invalid]', 'zzz']) &&
      deepEqual(invalid.newlyUnlocked, ['a']) &&
      !invalid.progress.achieved.includes('[invalid]') &&
      !invalid.progress.achieved.includes('7'),
  );
  check(
    'skill-progress: an invalid id is never coerced into a node id',
    (() => {
      const r = applyAchieved(initialProgress(), CHAIN, [7, 'b']);
      // `7` is invalid; `'b'` IS a known node id, so it is accepted (still locked, not
      // ignored). Only the invalid value shows up, under the tag, never as `7`/`'7'`.
      return deepEqual(r.ignored, ['[invalid]']) && deepEqual(r.newlyUnlocked, []);
    })(),
  );
  check(
    'skill-progress: the [invalid] tag sits at its first-seen position among ignored ids',
    deepEqual(
      applyAchieved(initialProgress(), CHAIN, ['zzz', null, 'ghost']).ignored,
      ['zzz', '[invalid]', 'ghost'],
    ),
  );

  // --- non-array input is a safe no-op -----------------------------------------
  const base = { achieved: ['a'], unlockedNodes: ['a'] };
  check(
    'skill-progress: non-array ids is a safe no-op that still returns fresh arrays',
    [undefined, null, 0, 'not-an-array', {}, true].every((bad) => {
      const r = applyAchieved(base, CHAIN, bad);
      return (
        deepEqual(r.progress, base) &&
        deepEqual(r.newlyUnlocked, []) &&
        r.grantedLevels === 0 &&
        r.grantedCoins === 0 &&
        deepEqual(r.ignored, [])
      );
    }),
  );

  // --- exact sums across branches ---------------------------------------------
  const bothBranches = applyAchieved(initialProgress(), TWO_BRANCHES, ['a', 'b', 'd', 'e']);
  check(
    'skill-progress: rewards from two branches sum exactly',
    deepEqual(bothBranches.newlyUnlocked, ['a', 'b', 'd', 'e']) &&
      bothBranches.grantedLevels === 10 &&
      bothBranches.grantedCoins === 60,
  );

  // --- order independence ------------------------------------------------------
  const forward = applyAchieved(initialProgress(), CHAIN, ['a', 'b']);
  const reverse = applyAchieved(applyAchieved(initialProgress(), CHAIN, ['b']).progress, CHAIN, ['a']);
  check(
    'skill-progress: child-then-parent reaches the same final state as parent-then-child',
    deepEqual(reverse.progress, forward.progress) &&
      reverse.grantedLevels === forward.grantedLevels &&
      reverse.grantedCoins === forward.grantedCoins,
  );
  check(
    'skill-progress: progress sets are canonical (order-independent deep equality)',
    deepEqual(
      normalizeProgress({ achieved: ['b', 'a', 'a'], unlockedNodes: ['b'] }),
      normalizeProgress({ achieved: ['a', 'b'], unlockedNodes: ['b'] }),
    ),
  );

  // --- monotonic: removal never re-locks and never re-grants -------------------
  const removed = applyAchieved(
    { achieved: [], unlockedNodes: parentThen.progress.unlockedNodes },
    CHAIN,
    [],
  );
  check(
    'skill-progress: removing an id from achieved never re-locks an unlocked node',
    removed.progress.unlockedNodes.includes('a') &&
      removed.progress.unlockedNodes.includes('b') &&
      nodeState(removed.progress, CHAIN, 'b') === 'achieved',
  );
  const reclaimed = applyAchieved(removed.progress, CHAIN, ['a']);
  check(
    'skill-progress: a re-reported id never re-grants an already unlocked node',
    deepEqual(reclaimed.newlyUnlocked, []) &&
      reclaimed.grantedLevels === 0 &&
      reclaimed.grantedCoins === 0,
  );

  // --- cyclic config fails closed ----------------------------------------------
  const cycle = applyAchieved(initialProgress(), CYCLE, ['x', 'y']);
  check(
    'skill-progress: a parent cycle never settles and never throws',
    deepEqual(cycle.newlyUnlocked, []) &&
      cycle.grantedLevels === 0 &&
      cycle.grantedCoins === 0,
  );

  // --- no mutation: deeply frozen input + JSON snapshots -----------------------
  const frozen = Object.freeze({
    achieved: Object.freeze(['a']),
    unlockedNodes: Object.freeze([]),
  });
  const frozenSnapshot = clone(frozen);
  let frozenThrew = null;
  let frozenOut;
  try {
    frozenOut = applyAchieved(frozen, CHAIN, ['a']);
  } catch (err) {
    frozenThrew = err;
  }
  check(
    'skill-progress: a deeply frozen progress is not mutated and does not throw',
    frozenThrew === null &&
      frozenOut.grantedLevels === 1 &&
      deepEqual(frozen, frozenSnapshot) &&
      Object.isFrozen(frozen) &&
      Object.isFrozen(frozen.achieved),
  );
  check(
    'skill-progress: a returned progress never aliases the input arrays',
    frozenOut.progress.achieved !== frozen.achieved &&
      frozenOut.progress.unlockedNodes !== frozen.unlockedNodes,
  );

  const configSnapshot = clone(CHAIN);
  const progressSnapshot = clone(parentThen.progress);
  applyAchieved(parentThen.progress, CHAIN, ['a', 'b', 'c']);
  check(
    'skill-progress: the input config and progress are never mutated',
    deepEqual(CHAIN, configSnapshot) && deepEqual(parentThen.progress, progressSnapshot),
  );

  // --- no coercion -------------------------------------------------------------
  check(
    'skill-progress: a numeric reward is not coerced from a string',
    (() => {
      const cfg = {
        branches: [{ id: 'n', name: 'N', nodes: [
          { id: 'a', name: 'A', levelReward: '9', coinReward: '9', parent: null },
        ] }],
      };
      const r = applyAchieved(initialProgress(), cfg, ['a']);
      return r.grantedLevels === 0 && r.grantedCoins === 0;
    })(),
  );

  // --- totality: hostile input never throws ------------------------------------
  let hostileThrew = null;
  outer: for (const v of HOSTILE) {
    try {
      initialProgress(v);
      normalizeProgress(v);
      closure(v, v);
      nodeState(v, v, v);
      applyAchieved(v, v, v);
      applyAchieved(undefined, CHAIN, [v]);
      applyAchieved(initialProgress(), v, ['a']);
      applyAchieved(initialProgress(), CHAIN, [v]);
      closure(initialProgress(), CYCLE);
    } catch (err) {
      hostileThrew = err;
      break outer;
    }
  }
  check('skill-progress: hostile inputs never throw', hostileThrew === null);
  check(
    'skill-progress: normalizeProgress always yields two fresh arrays',
    HOSTILE.every((v) => {
      const q = normalizeProgress(v);
      return Array.isArray(q.achieved) && Array.isArray(q.unlockedNodes);
    }),
  );

  // --- determinism -------------------------------------------------------------
  check(
    'skill-progress: applyAchieved is deterministic for the same inputs',
    deepEqual(
      applyAchieved({ achieved: ['a'], unlockedNodes: [] }, CHAIN, ['a', 'b']),
      applyAchieved({ achieved: ['a'], unlockedNodes: [] }, CHAIN, ['a', 'b']),
    ),
  );
  check(
    'skill-progress: closure and nodeState are deterministic for the same inputs',
    deepEqual(closure(base, CHAIN), closure(base, CHAIN)) &&
      nodeState(base, CHAIN, 'a') === nodeState(base, CHAIN, 'a'),
  );

  // --- no currency/level economy leak ------------------------------------------
  check(
    'skill-progress: the result never exposes coins/level state, only reward sums',
    (() => {
      const r = applyAchieved(initialProgress(), CHAIN, ['a']);
      return (
        r.progress.coins === undefined &&
        r.progress.level === undefined &&
        typeof r.grantedLevels === 'number' &&
        typeof r.grantedCoins === 'number'
      );
    })(),
  );
}
