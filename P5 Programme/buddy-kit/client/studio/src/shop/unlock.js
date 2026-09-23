/**
 * unlock.js — the model shop's single "unlock law" (PURE, TOTAL, DETERMINISTIC).
 *
 * This module is the ONE place that decides whether a model is usable and what
 * it costs. Every economy transition (buy, grant, level-up, reset) flows through
 * here so no path can double-charge a model or silently re-lock one. It mirrors
 * the discipline of `web/project/champion/logic/parts.js` (one writer, a
 * monotonic ratchet, never downgrade) without importing it.
 *
 * HARD RULES (why this file looks the way it does):
 *  - PURE: no DOM, no `fetch`, no `localStorage`, no `import.meta.env`, no `three`,
 *    no `Math.random` / `Date.now`. It must import and run under plain Node so the
 *    test harness can exercise it.
 *  - TOTAL: every export accepts hostile input (null/undefined/arrays/strings/NaN/
 *    Infinity/fractions) and returns a safe value — it never throws.
 *  - NO COERCION: only real plain objects and real non-negative integers are
 *    accepted; a string like `'5'` is NOT a number.
 *  - NO MUTATION: the input `state` (and its `owned` array) is never written; every
 *    return is a fresh object with a fresh `owned` array.
 *
 * STATE SHAPE (this module only): `{ coins: number, level: number, owned: string[] }`.
 * The `placed[]` / `collapsed` UI fields belong to `store.js`, not here.
 *
 * @module shop/unlock
 */

/**
 * The canonical unlock rule types. `level+coins` is a distinct rule requiring
 * BOTH gates, not a shortcut for either one. Exported as the single source of truth
 * for `catalog.js`'s validation error message.
 *
 * @type {ReadonlyArray<'free'|'level'|'coins'|'level+coins'>}
 */
export const UNLOCK_TYPES = ['free', 'level', 'coins', 'level+coins'];

/** Safe all-zero state used whenever the caller hands us something unusable. */
function baseState() {
  return { coins: 0, level: 0, owned: [] };
}

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
 * fractions, and negatives so no value is ever silently coerced.
 *
 * @param {*} v - Candidate.
 * @returns {boolean}
 */
function isNonNegInt(v) {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

/**
 * Copy a raw `owned` value into a fresh array of non-empty strings, dropping
 * anything else. Never mutates the input array.
 *
 * @param {*} raw - Candidate `owned` field.
 * @returns {string[]} Fresh, filtered array (empty when not an array).
 */
function normalizeOwned(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const id of raw) {
    if (typeof id === 'string' && id.length > 0) out.push(id);
  }
  return out;
}

/**
 * Normalize any candidate into a valid state. Invalid fields fall back to safe
 * zeros; unknown extra fields are preserved so a caller's round-trip stays
 * deep-equal. Always returns a NEW object with a NEW `owned` array.
 *
 * @param {*} state - Candidate state.
 * @returns {{coins: number, level: number, owned: string[]}} Safe state copy.
 */
function normalizeState(state) {
  if (!isPlainObject(state)) return baseState();
  return {
    ...state,
    coins: isNonNegInt(state.coins) ? state.coins : 0,
    level: isNonNegInt(state.level) ? state.level : 0,
    owned: normalizeOwned(state.owned),
  };
}

/**
 * Read a model's canonical `id`, or `null` when absent/invalid.
 *
 * @param {*} model - Candidate model.
 * @returns {string|null}
 */
function modelId(model) {
  if (isPlainObject(model) && typeof model.id === 'string' && model.id.length > 0) {
    return model.id;
  }
  return null;
}

/**
 * Decode and validate a model's unlock rule into a flat shape:
 * `{ type, coins, level }` with `coins`/`level` zero when not required.
 * Returns `null` for a malformed rule so callers can fail closed.
 *
 * @param {*} model - Candidate model.
 * @returns {{type: string, coins: number, level: number}|null}
 */
function readUnlock(model) {
  if (!isPlainObject(model)) return null;
  const u = model.unlock;
  if (!isPlainObject(u)) return null;

  switch (u.type) {
    case 'free':
      return { type: 'free', coins: 0, level: 0 };
    case 'level':
      return isNonNegInt(u.level)
        ? { type: 'level', coins: 0, level: u.level }
        : null;
    case 'coins':
      return isNonNegInt(u.coins)
        ? { type: 'coins', coins: u.coins, level: 0 }
        : null;
    case 'level+coins':
      return isNonNegInt(u.level) && isNonNegInt(u.coins)
        ? { type: 'level+coins', coins: u.coins, level: u.level }
        : null;
    default:
      // Unknown or missing rule: fail closed (never silently free).
      return null;
  }
}

/**
 * Build the shop's starting economy from a catalog.
 *
 * @param {*} catalog - Normalized catalog (`{ startingCoins, startingLevel }`).
 * @returns {{coins: number, level: number, owned: string[]}} A fresh state.
 */
export function initialState(catalog) {
  const c = isPlainObject(catalog) ? catalog : {};
  return {
    coins: isNonNegInt(c.startingCoins) ? c.startingCoins : 0,
    level: isNonNegInt(c.startingLevel) ? c.startingLevel : 0,
    owned: [],
  };
}

/**
 * Describe a model's availability without changing anything.
 *
 * `unlocked` means "usable right now": free, owned, or a `level` rule whose
 * threshold is met. A `coins` / `level+coins` model is NOT unlocked until it has
 * actually been purchased (otherwise the UI could place it without paying).
 * `canBuy` means "a `purchase` call would succeed".
 *
 * `coins` / `level` are the model's REQUIREMENTS (`0` when that gate is unused),
 * and `reason` is a short human string for the UI.
 *
 * @param {*} state - Candidate state.
 * @param {*} model - Candidate model with an `id` and `unlock` rule.
 * @returns {{unlocked: boolean, canBuy: boolean, coins: number, level: number, reason: string}} Availability.
 */
export function status(state, model) {
  const s = normalizeState(state);
  const info = readUnlock(model);
  const id = modelId(model);
  if (!info || !id) {
    return { unlocked: false, canBuy: false, coins: 0, level: 0, reason: 'unavailable' };
  }

  if (s.owned.includes(id)) {
    return { unlocked: true, canBuy: false, coins: info.coins, level: info.level, reason: 'owned' };
  }

  if (info.type === 'free') {
    return { unlocked: true, canBuy: true, coins: 0, level: 0, reason: 'free' };
  }

  if (info.type === 'level') {
    if (s.level >= info.level) {
      return { unlocked: true, canBuy: true, coins: 0, level: info.level, reason: 'free' };
    }
    return {
      unlocked: false,
      canBuy: false,
      coins: 0,
      level: info.level,
      reason: `reach level ${info.level}`,
    };
  }

  if (info.type === 'coins') {
    if (s.coins >= info.coins) {
      return {
        unlocked: false,
        canBuy: true,
        coins: info.coins,
        level: 0,
        reason: `pay ${info.coins} coins`,
      };
    }
    return {
      unlocked: false,
      canBuy: false,
      coins: info.coins,
      level: 0,
      reason: `need ${info.coins - s.coins} more coins`,
    };
  }

  // level+coins: BOTH gates must be satisfied before a purchase can succeed.
  const levelOk = s.level >= info.level;
  const coinsOk = s.coins >= info.coins;
  if (levelOk && coinsOk) {
    return {
      unlocked: false,
      canBuy: true,
      coins: info.coins,
      level: info.level,
      reason: `pay ${info.coins} coins`,
    };
  }
  if (!levelOk && !coinsOk) {
    return {
      unlocked: false,
      canBuy: false,
      coins: info.coins,
      level: info.level,
      reason: `reach level ${info.level} and pay ${info.coins} coins`,
    };
  }
  return {
    unlocked: false,
    canBuy: false,
    coins: info.coins,
    level: info.level,
    reason: levelOk ? `need ${info.coins - s.coins} more coins` : `reach level ${info.level}`,
  };
}

/**
 * Attempt to acquire a model. This is the ONLY place coins may be deducted.
 *
 * Outcomes:
 *  - malformed model     -> `{ ok:false, state }` (fail closed)
 *  - already owned       -> `{ ok:true, state }` — NO second charge, ever
 *  - free                -> `{ ok:true, state }` — state unchanged
 *  - level (met)         -> `{ ok:true, state }` — adds to `owned`, no deduction
 *  - coins (affordable)  -> `{ ok:true, state }` — deducts EXACTLY once, adds id
 *  - level+coins (both)  -> `{ ok:true, state }` — deducts EXACTLY once, adds id
 *  - requirement unmet   -> `{ ok:false, state }` — state deep-equal to the input
 *
 * The input state is never mutated; on failure the returned state is deep-equal
 * to the input.
 *
 * @param {*} state - Candidate state.
 * @param {*} model - Candidate model.
 * @returns {{ok: boolean, state: object, reason: string}} Result.
 */
export function purchase(state, model) {
  const s = normalizeState(state);
  const info = readUnlock(model);
  const id = modelId(model);
  if (!info || !id) return { ok: false, state: s, reason: 'unavailable' };

  // Owned check FIRST: an owned model can never be charged again.
  if (s.owned.includes(id)) return { ok: true, state: s, reason: 'owned' };

  if (info.type === 'free') return { ok: true, state: s, reason: 'free' };

  if (info.type === 'level') {
    if (s.level < info.level) {
      return { ok: false, state: s, reason: `reach level ${info.level}` };
    }
    return { ok: true, state: { ...s, owned: s.owned.concat(id) }, reason: 'free' };
  }

  if (info.type === 'coins') {
    if (s.coins < info.coins) {
      return { ok: false, state: s, reason: `need ${info.coins - s.coins} more coins` };
    }
    return {
      ok: true,
      state: { ...s, coins: s.coins - info.coins, owned: s.owned.concat(id) },
      reason: 'purchased',
    };
  }

  // level+coins: require BOTH gates, then deduct exactly once.
  const levelOk = s.level >= info.level;
  const coinsOk = s.coins >= info.coins;
  if (!levelOk && !coinsOk) {
    return {
      ok: false,
      state: s,
      reason: `reach level ${info.level} and pay ${info.coins} coins`,
    };
  }
  if (!levelOk) return { ok: false, state: s, reason: `reach level ${info.level}` };
  if (!coinsOk) return { ok: false, state: s, reason: `need ${info.coins - s.coins} more coins` };
  return {
    ok: true,
    state: { ...s, coins: s.coins - info.coins, owned: s.owned.concat(id) },
    reason: 'purchased',
  };
}

/**
 * Ratchet every `level`-rule model whose threshold the state has reached into
 * `owned`. Only the pure `level` rule is granted — a `level+coins` model still
 * requires payment. This never removes an id.
 *
 * @param {*} state - Candidate state.
 * @param {*} catalog - Catalog with a `models` array.
 * @returns {{coins: number, level: number, owned: string[]}} A NEW state.
 */
export function applyLevelUnlocks(state, catalog) {
  const s = normalizeState(state);
  const models = isPlainObject(catalog) && Array.isArray(catalog.models) ? catalog.models : [];
  const owned = s.owned.slice();
  const seen = new Set(owned);

  for (const model of models) {
    const info = readUnlock(model);
    const id = modelId(model);
    if (!info || !id) continue;
    if (info.type !== 'level') continue;
    if (s.level >= info.level && !seen.has(id)) {
      owned.push(id);
      seen.add(id);
    }
  }
  return { ...s, owned };
}

/**
 * Grant coins. `n` is accepted only as a real non-negative integer; anything
 * else is a no-op that still returns a fresh state.
 *
 * @param {*} state - Candidate state.
 * @param {*} n - Amount to add.
 * @returns {{coins: number, level: number, owned: string[]}} A NEW state.
 */
export function grantCoins(state, n) {
  const s = normalizeState(state);
  if (!isNonNegInt(n)) return { ...s, owned: s.owned.slice() };
  return { ...s, coins: s.coins + n, owned: s.owned.slice() };
}

/**
 * Raise the level by `n` (a real non-negative integer, else no-op), then ratchet
 * in any newly reached `level` models via {@link applyLevelUnlocks}.
 *
 * @param {*} state - Candidate state.
 * @param {*} catalog - Catalog with a `models` array.
 * @param {*} n - Levels to add.
 * @returns {{coins: number, level: number, owned: string[]}} A NEW state.
 */
export function grantLevel(state, catalog, n) {
  const s = normalizeState(state);
  if (!isNonNegInt(n)) return { ...s, owned: s.owned.slice() };
  const raised = { ...s, level: s.level + n, owned: s.owned.slice() };
  return applyLevelUnlocks(raised, catalog);
}

/**
 * Wipe the economy back to the catalog's starting values. This is the ONLY path
 * allowed to re-lock a model.
 *
 * @param {*} catalog - Normalized catalog.
 * @returns {{coins: number, level: number, owned: string[]}} A fresh state.
 */
export function resetEconomy(catalog) {
  return initialState(catalog);
}
