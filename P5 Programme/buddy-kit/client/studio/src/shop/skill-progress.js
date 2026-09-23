/**
 * skill-progress.js — the knowledge-point skill tree's achievement engine
 * (PURE, TOTAL, NON-MUTATING, DETERMINISTIC).
 *
 * This module is the ONE place that decides which tree nodes are *settled*, which
 * are *unlocked*, and what each unlock is worth. It mirrors the discipline of
 * `src/shop/unlock.js` (one writer, a monotonic ratchet, never downgrade, never
 * double-charge) without importing it — the skill tree owns its OWN progress shape
 * and never touches coins/levels directly.
 *
 * HARD RULES (why this file looks the way it does):
 *  - PURE: no DOM, no `fetch`, no `localStorage`, no `three`, no `Math.random` /
 *    `Date.now`. It must import and run under plain Node so the test harness can
 *    exercise it.
 *  - TOTAL: every export accepts hostile input (null/undefined/arrays/strings/NaN/
 *    objects/parent cycles) and returns a safe value — it never throws.
 *  - NO COERCION: only real non-empty string ids are accepted; a number, an object,
 *    or a `String(5)` is NOT an id.
 *  - NO MUTATION: the input `progress` / `config` are never written; every return is
 *    a fresh object with fresh arrays.
 *  - MONOTONIC: once a node is in `unlockedNodes` it can never be removed and its
 *    rewards are never granted a second time — even if the caller later hands back
 *    an `achieved` set from which an ancestor has disappeared.
 *
 * SEMANTICS
 *  - `achieved`      = every known node id an external system has reported.
 *  - settled node    = a node in `achieved` whose whole ancestor chain (resolved via
 *                      the normalized `parent` field) is also in `achieved`.
 *  - `unlockedNodes` = the monotonic set of settled nodes whose TWO rewards
 *                      (`levelReward` + `coinReward`) have been granted exactly once.
 *  - This module only COMPUTES `grantedLevels` / `grantedCoins`. The controller
 *    (Task 17) applies them through the existing economy (`unlock.grantLevel` /
 *    `unlock.grantCoins`); we must never grant here.
 *
 * The engine is ORDER-INDEPENDENT: the progress arrays are kept in canonical
 * (deduped, sorted) order so two set-equivalent states are deep-equal no matter what
 * order the ids arrived in. Evaluation itself follows config order, which the
 * normalizer guarantees is deterministic per branch/node.
 *
 * @module shop/skill-progress
 */

/** Safe all-empty progress used whenever the caller hands us something unusable. */
function baseProgress() {
  return { achieved: [], unlockedNodes: [] };
}

/**
 * Stable `ignored` tag for a value that cannot be an id AT ALL — a non-string (`7`,
 * `null`, `{}`, `NaN`) or an empty string. Never coerced into a node id; every such
 * value collapses to this tag, deduped, so `ignored` stays a `string[]` and the frozen
 * return shape does not grow. A non-empty string id is NEVER replaced by this tag.
 * See `applyAchieved` for the full `ignored` contract.
 */
const INVALID_ID = '[invalid]';

/**
 * True only for a real plain object — arrays and `null` are rejected.
 *
 * @param {*} v - Candidate.
 * @returns {boolean}
 */
function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * True only for a real non-negative integer. Rejects strings, `NaN`, `Infinity`,
 * fractions, and negatives so no reward is ever silently coerced.
 *
 * @param {*} v - Candidate.
 * @returns {boolean}
 */
function isNonNegInt(v) {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

/**
 * Copy a raw set field into a fresh, canonical array: keep only non-empty strings,
 * drop duplicates, then sort. Sorting is what makes two set-equivalent progress
 * states deep-equal, which is how order-independence is proven.
 *
 * @param {*} raw - Candidate `achieved` / `unlockedNodes` field.
 * @returns {string[]} Fresh, deduped, sorted array (empty when not an array).
 */
function canonical(raw) {
  if (!Array.isArray(raw)) return [];
  const set = new Set();
  for (const value of raw) {
    if (typeof value === 'string' && value.length > 0) set.add(value);
  }
  return Array.from(set).sort();
}

/**
 * Resolve a node's `parent` into either a non-empty string or `null` (root).
 * A malformed parent is treated as "no ancestor" so hostile config cannot wedge
 * the walk; the normalizer already guarantees `parent` is a string or `null`.
 *
 * @param {*} parent - Candidate `parent` field.
 * @returns {string|null}
 */
function readParent(parent) {
  return typeof parent === 'string' && parent.length > 0 ? parent : null;
}

/**
 * Read a normalized config into flat lookup maps plus config order. Only plain
 * nodes with a non-empty string `id` are admitted; a duplicate id is first-wins.
 * Absent/malformed rewards default to `0` — never coerced.
 *
 * @param {*} config - Normalized skill-tree config.
 * @returns {{parentOf: Map<string, string|null>, levelRewardOf: Map<string, number>, coinRewardOf: Map<string, number>, order: string[]}}
 */
function readTree(config) {
  const parentOf = new Map();
  const levelRewardOf = new Map();
  const coinRewardOf = new Map();
  const order = [];
  const branches = isPlainObject(config) && Array.isArray(config.branches) ? config.branches : [];

  for (const branch of branches) {
    const nodes = isPlainObject(branch) && Array.isArray(branch.nodes) ? branch.nodes : [];
    for (const node of nodes) {
      if (!isPlainObject(node)) continue;
      const id = node.id;
      if (typeof id !== 'string' || id.length === 0) continue;
      if (parentOf.has(id)) continue; // first occurrence wins (normalized ids are unique anyway)
      parentOf.set(id, readParent(node.parent));
      levelRewardOf.set(id, isNonNegInt(node.levelReward) ? node.levelReward : 0);
      coinRewardOf.set(id, isNonNegInt(node.coinReward) ? node.coinReward : 0);
      order.push(id);
    }
  }

  return { parentOf, levelRewardOf, coinRewardOf, order };
}

/**
 * True when `id`'s entire ancestor chain is present in `achieved`.
 *
 * The walk stops at a root (`null`) or at an unresolvable ancestor. A cycle fails
 * closed (returns `false`) so a poisoned config can never settle a node forever.
 *
 * @param {string} id - A known node id.
 * @param {Map<string, string|null>} parentOf - Resolved parents.
 * @param {Set<string>} achieved - The achieved id set.
 * @returns {boolean}
 */
function isSettled(id, parentOf, achieved) {
  const seen = new Set([id]);
  let cur = id;
  for (;;) {
    // Unknown ancestors resolve to `undefined`; a root is stored as `null`; both mean
    // "no more ancestor gates". Any other non-string value is treated as malformed.
    const parent = parentOf.get(cur);
    if (typeof parent !== 'string' || parent.length === 0) return true;
    if (!achieved.has(parent)) return false;
    if (seen.has(parent)) return false; // cycle: fail closed, never loop forever
    seen.add(parent);
    cur = parent;
  }
}

/**
 * The shop's starting progress: nothing achieved, nothing unlocked.
 *
 * @returns {{achieved: string[], unlockedNodes: string[]}} A fresh progress.
 */
export function initialProgress() {
  return baseProgress();
}

/**
 * Normalize any candidate into valid progress. Non-string/duplicate ids are dropped,
 * both sets are canonical (sorted) so state equality is order-independent, and
 * unknown extra fields are preserved so a caller's round-trip stays deep-equal.
 * Always returns a NEW object with NEW arrays.
 *
 * @param {*} raw - Candidate progress.
 * @returns {{achieved: string[], unlockedNodes: string[]}} Safe progress copy.
 */
export function normalizeProgress(raw) {
  const base = isPlainObject(raw) ? raw : {};
  return {
    ...base,
    achieved: canonical(base.achieved),
    unlockedNodes: canonical(base.unlockedNodes),
  };
}

/**
 * The settled closure: every known node that is in `achieved` and whose whole
 * ancestor chain is also in `achieved`. Returned in config order; a fresh array.
 *
 * @param {*} progress - Candidate progress.
 * @param {*} config - Normalized skill-tree config.
 * @returns {string[]} Settled node ids (config order).
 */
export function closure(progress, config) {
  const p = normalizeProgress(progress);
  const achieved = new Set(p.achieved);
  const tree = readTree(config);
  const settled = [];
  for (const id of tree.order) {
    if (achieved.has(id) && isSettled(id, tree.parentOf, achieved)) settled.push(id);
  }
  return settled;
}

/**
 * Describe a node's state without changing anything.
 *
 *  - `'achieved'`  = already in `unlockedNodes` (monotonic — never re-locked).
 *  - `'available'` = settled (in `achieved` with its full ancestor chain achieved)
 *                    but not yet unlocked.
 *  - `'locked'`    = not settled (or unknown/invalid id).
 *
 * @param {*} progress - Candidate progress.
 * @param {*} config - Normalized skill-tree config.
 * @param {*} id - Candidate node id.
 * @returns {'achieved'|'available'|'locked'}
 */
export function nodeState(progress, config, id) {
  const p = normalizeProgress(progress);
  if (typeof id !== 'string' || id.length === 0) return 'locked';
  if (p.unlockedNodes.includes(id)) return 'achieved';

  const tree = readTree(config);
  if (!tree.parentOf.has(id)) return 'locked';
  const achieved = new Set(p.achieved);
  return achieved.has(id) && isSettled(id, tree.parentOf, achieved) ? 'available' : 'locked';
}

/**
 * Report achieved knowledge points, then settle and unlock whatever that enables.
 *
 * Order-independent: `['b']` then `['a']` reaches the same state as `['a','b']`
 * (given `a` is `b`'s parent). Only known node ids are unioned into `achieved`; every
 * other value is reported in `ignored` and changes nothing. `ignored` is deduped and in
 * first-seen order, and holds `string[]` only:
 *  - an unknown non-empty string id is reported verbatim (e.g. `'zzz'`);
 *  - a value that cannot be an id at all — a non-string (`7`, `null`, `{}`, `NaN`) or an
 *    empty string — is reported as the stable tag `'[invalid]'` (`INVALID_ID`). Such a
 *    value is never coerced into a node id.
 * Every newly settled node is unlocked and its `levelReward` + `coinReward` summed exactly
 * once — re-running with the same ids returns `newlyUnlocked: []` and both grants `0`.
 * Existing `unlockedNodes` are never removed and never re-granted.
 *
 * The input `progress` is never mutated; the returned `progress` is a NEW object.
 *
 * @param {*} progress - Candidate progress.
 * @param {*} config - Normalized skill-tree config.
 * @param {*} ids - Reported node ids (non-array is a safe no-op).
 * @returns {{progress: {achieved: string[], unlockedNodes: string[]}, newlyUnlocked: string[], grantedLevels: number, grantedCoins: number, ignored: string[]}} Result.
 */
export function applyAchieved(progress, config, ids) {
  const p = normalizeProgress(progress);
  const tree = readTree(config);
  const achieved = new Set(p.achieved);
  const unlocked = new Set(p.unlockedNodes);

  const candidates = Array.isArray(ids) ? ids : [];
  const ignoredSeen = new Set();
  const ignored = [];

  for (const id of candidates) {
    // A non-string/empty id can never be a knowledge point, but it must still be
    // reported: `ignored` is contractually "not known OR invalid". We do NOT coerce it
    // into a node id — every such value collapses to the stable INVALID_ID tag.
    if (typeof id !== 'string' || id.length === 0) {
      if (!ignoredSeen.has(INVALID_ID)) {
        ignoredSeen.add(INVALID_ID);
        ignored.push(INVALID_ID);
      }
      continue;
    }
    if (!tree.parentOf.has(id)) {
      if (!ignoredSeen.has(id)) {
        ignoredSeen.add(id);
        ignored.push(id);
      }
      continue;
    }
    achieved.add(id);
  }

  const newlyUnlocked = [];
  let grantedLevels = 0;
  let grantedCoins = 0;

  // Config order makes the grant order deterministic and independent of input order.
  for (const id of tree.order) {
    if (!achieved.has(id) || !isSettled(id, tree.parentOf, achieved)) continue;
    if (unlocked.has(id)) continue;
    unlocked.add(id);
    newlyUnlocked.push(id);
    grantedLevels += tree.levelRewardOf.get(id) || 0;
    grantedCoins += tree.coinRewardOf.get(id) || 0;
  }

  return {
    progress: {
      ...p,
      achieved: canonical(Array.from(achieved)),
      unlockedNodes: canonical(Array.from(unlocked)),
    },
    newlyUnlocked,
    grantedLevels,
    grantedCoins,
    ignored,
  };
}
