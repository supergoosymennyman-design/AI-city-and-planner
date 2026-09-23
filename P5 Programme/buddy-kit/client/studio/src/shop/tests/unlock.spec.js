/**
 * unlock.test.js — pure-node coverage for the model-shop unlock engine.
 *
 * Discovered and invoked by `test.mjs` (and by the standalone runner in the plan)
 * as `export default function unlockTests(check)`. It MUST be synchronous: the
 * harness calls `mod.default(check)` without awaiting.
 *
 * These checks lock the economy invariants the whole shop depends on:
 *   - a coin purchase deducts EXACTLY once and never charges an owned model;
 *   - a failed purchase returns a state deep-equal to the input;
 *   - the input state (even a deeply frozen one) is never mutated;
 *   - `grantLevel` ratchets level models in and never removes an owned id;
 *   - `level+coins` requires BOTH gates;
 *   - `resetEconomy` re-locks everything;
 *   - every function is total under hostile input and deterministic.
 *
 * No I/O, no clock, no RNG — so this file is itself deterministic.
 */

import {
  initialState,
  status,
  purchase,
  applyLevelUnlocks,
  grantCoins,
  grantLevel,
  resetEconomy,
} from '../unlock.js';

/** Structural equality for plain JSON data (the shop state shape). */
function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Independent copy used to prove the engine did not mutate its input. */
function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

// --- fixtures ------------------------------------------------------------------
const CATALOG = {
  startingCoins: 120,
  startingLevel: 1,
  models: [
    { id: 'starter', unlock: { type: 'free' } },
    { id: 'lv2', unlock: { type: 'level', level: 2 } },
    { id: 'lv3', unlock: { type: 'level', level: 3 } },
    { id: 'coin40', unlock: { type: 'coins', coins: 40 } },
    { id: 'combo', unlock: { type: 'level+coins', level: 3, coins: 120 } },
  ],
};

const FREE = CATALOG.models[0];
const LEVEL2 = CATALOG.models[1];
const LEVEL3 = CATALOG.models[2];
const COIN40 = CATALOG.models[3];
const COMBO = CATALOG.models[4];

const HOSTILE = [undefined, null, 0, '', [], NaN, Infinity, -5, 1.5, '{"coins":5}'];

export default function unlockTests(check) {
  // --- initialState ------------------------------------------------------------
  check(
    'unlock: initialState reads starting coins/level and owns nothing',
    deepEqual(initialState(CATALOG), { coins: 120, level: 1, owned: [] }),
  );
  check(
    'unlock: initialState tolerates an invalid catalog',
    deepEqual(initialState(null), { coins: 0, level: 0, owned: [] }) &&
      deepEqual(initialState({ startingCoins: '120', startingLevel: 1.5 }), {
        coins: 0,
        level: 0,
        owned: [],
      }),
  );

  // --- status: the four rules --------------------------------------------------
  const start = initialState(CATALOG);

  const freeStatus = status(start, FREE);
  check(
    'unlock: status of a free model is unlocked with a "free" reason',
    freeStatus.unlocked === true &&
      freeStatus.canBuy === true &&
      freeStatus.coins === 0 &&
      freeStatus.level === 0 &&
      freeStatus.reason === 'free',
  );

  check(
    'unlock: status of a locked level model names the level',
    status(start, LEVEL3).unlocked === false &&
      status(start, LEVEL3).canBuy === false &&
      status(start, LEVEL3).level === 3 &&
      status(start, LEVEL3).reason === 'reach level 3',
  );

  const coinStatus = status({ coins: 38, level: 1, owned: [] }, COIN40);
  check(
    'unlock: status of a short coins model names the shortfall',
    coinStatus.unlocked === false &&
      coinStatus.canBuy === false &&
      coinStatus.coins === 40 &&
      coinStatus.level === 0 &&
      coinStatus.reason === 'need 2 more coins',
  );
  check(
    'unlock: status of an affordable coins model is buyable but not yet unlocked',
    status({ coins: 40, level: 1, owned: [] }, COIN40).unlocked === false &&
      status({ coins: 40, level: 1, owned: [] }, COIN40).canBuy === true,
  );

  check(
    'unlock: status of an unmet level+coins names both gates',
    status({ coins: 100, level: 2, owned: [] }, COMBO).reason ===
      'reach level 3 and pay 120 coins',
  );
  check(
    'unlock: status of an owned model says owned and is not buyable again',
    (() => {
      const st = status({ coins: 0, level: 3, owned: ['combo'] }, COMBO);
      return st.unlocked === true && st.canBuy === false && st.reason === 'owned';
    })(),
  );
  check(
    'unlock: every rule reports a non-empty reason',
    [FREE, LEVEL3, COIN40, COMBO].every(
      (m) => typeof status(start, m).reason === 'string' && status(start, m).reason.length > 0,
    ),
  );

  // --- purchase: free / owned --------------------------------------------------
  const freeRes = purchase(start, FREE);
  check(
    'unlock: free purchase succeeds and leaves the state unchanged',
    freeRes.ok === true && deepEqual(freeRes.state, start),
  );

  // --- purchase: coins deduct EXACTLY once -------------------------------------
  const bought = purchase(start, COIN40);
  check(
    'unlock: coin purchase deducts exactly once',
    bought.ok === true && bought.state.coins === 80 && bought.state.owned.includes('coin40'),
  );
  const boughtAgain = purchase(bought.state, COIN40);
  check(
    'unlock: re-purchasing an owned model does not charge again',
    boughtAgain.ok === true && boughtAgain.state.coins === 80,
  );
  check(
    'unlock: re-purchase does not duplicate the owned id',
    boughtAgain.state.owned.filter((id) => id === 'coin40').length === 1,
  );
  check(
    'unlock: re-purchase state is byte-identical to the prior state',
    deepEqual(boughtAgain.state, bought.state),
  );

  // --- purchase: level ---------------------------------------------------------
  const lockedByLevel = purchase(start, LEVEL2);
  check(
    'unlock: level model is refused below its threshold',
    lockedByLevel.ok === false && deepEqual(lockedByLevel.state, start),
  );
  const levelBought = purchase({ coins: 120, level: 2, owned: [] }, LEVEL2);
  check(
    'unlock: level model unlocks at its threshold with no charge',
    levelBought.ok === true &&
      levelBought.state.coins === 120 &&
      levelBought.state.owned.includes('lv2'),
  );

  // --- purchase: level+coins requires BOTH -------------------------------------
  const comboShortCoins = purchase({ coins: 100, level: 3, owned: [] }, COMBO);
  check(
    'unlock: level+coins refuses when the level is met but coins are short',
    comboShortCoins.ok === false && deepEqual(comboShortCoins.state, { coins: 100, level: 3, owned: [] }),
  );
  const comboShortLevel = purchase({ coins: 200, level: 2, owned: [] }, COMBO);
  check(
    'unlock: level+coins refuses when coins are enough but the level is not',
    comboShortLevel.ok === false && deepEqual(comboShortLevel.state, { coins: 200, level: 2, owned: [] }),
  );
  const comboBought = purchase({ coins: 120, level: 3, owned: [] }, COMBO);
  check(
    'unlock: level+coins succeeds with both gates and deducts exactly once',
    comboBought.ok === true &&
      comboBought.state.coins === 0 &&
      comboBought.state.owned.includes('combo'),
  );

  // --- no mutation: deeply frozen input + insufficient funds -------------------
  const frozenState = Object.freeze({
    coins: 10,
    level: 1,
    owned: Object.freeze(['seed']),
  });
  const frozenClone = clone(frozenState);
  let frozenThrew = null;
  let frozenShortfall;
  try {
    frozenShortfall = purchase(frozenState, COMBO);
  } catch (err) {
    frozenThrew = err;
  }
  check(
    'unlock: insufficient purchase fails without throwing on a frozen input',
    frozenThrew === null && frozenShortfall.ok === false,
  );
  check(
    'unlock: insufficient purchase returns a state deep-equal to the input',
    deepEqual(frozenShortfall.state, frozenClone),
  );
  check(
    'unlock: a frozen input is not mutated by a failed purchase',
    frozenState.coins === 10 &&
      frozenState.level === 1 &&
      frozenState.owned.length === 1 &&
      frozenState.owned[0] === 'seed' &&
      Object.isFrozen(frozenState) &&
      Object.isFrozen(frozenState.owned),
  );

  // A successful purchase must also leave a frozen input untouched.
  const frozenRich = Object.freeze({ coins: 120, level: 1, owned: Object.freeze([]) });
  let richThrew = null;
  let richOut;
  try {
    richOut = purchase(frozenRich, COIN40);
  } catch (err) {
    richThrew = err;
  }
  check(
    'unlock: a successful purchase does not mutate a frozen input',
    richThrew === null && frozenRich.coins === 120 && richOut.state.coins === 80,
  );

  // --- grantCoins --------------------------------------------------------------
  check(
    'unlock: grantCoins adds the amount and keeps owned',
    (() => {
      const g = grantCoins({ coins: 100, level: 1, owned: ['seed'] }, 25);
      return g.coins === 125 && deepEqual(g.owned, ['seed']);
    })(),
  );
  check(
    'unlock: grantCoins ignores every invalid amount',
    HOSTILE.every((v) =>
      deepEqual(grantCoins({ coins: 100, level: 1, owned: [] }, v), {
        coins: 100,
        level: 1,
        owned: [],
      }),
    ),
  );

  // --- grantLevel: ratchet, never remove ---------------------------------------
  const levelled = grantLevel({ coins: 120, level: 1, owned: ['keep-me'] }, CATALOG, 1);
  check(
    'unlock: grantLevel raises the level',
    levelled.level === 2,
  );
  check(
    'unlock: grantLevel auto-unlocks every newly reached level model',
    levelled.owned.includes('lv2') && !levelled.owned.includes('lv3'),
  );
  check(
    'unlock: grantLevel never removes an owned id',
    levelled.owned.includes('keep-me'),
  );
  check(
    'unlock: grantLevel does not gift a level+coins model',
    !levelled.owned.includes('combo'),
  );
  check(
    'unlock: grantLevel ignores an invalid amount',
    deepEqual(grantLevel({ coins: 120, level: 1, owned: [] }, CATALOG, -5), {
      coins: 120,
      level: 1,
      owned: [],
    }),
  );

  // --- applyLevelUnlocks -------------------------------------------------------
  const applied = applyLevelUnlocks({ coins: 120, level: 2, owned: ['keep'] }, CATALOG);
  check(
    'unlock: applyLevelUnlocks adds reached level models without dropping owned ids',
    applied.owned.includes('lv2') && applied.owned.includes('keep') && !applied.owned.includes('lv3'),
  );
  const reapplied = applyLevelUnlocks(applied, CATALOG);
  check(
    'unlock: applyLevelUnlocks is idempotent',
    deepEqual(reapplied.owned, applied.owned),
  );
  const ratcheted = applyLevelUnlocks({ coins: 0, level: 1, owned: ['lv2'] }, CATALOG);
  check(
    'unlock: applyLevelUnlocks never removes an id',
    ratcheted.owned.includes('lv2'),
  );

  // --- resetEconomy re-locks ---------------------------------------------------
  const spent = purchase(start, COIN40).state;
  const reset = resetEconomy(CATALOG);
  check(
    'unlock: resetEconomy restores the starting economy and re-locks everything',
    reset.coins === 120 &&
      reset.level === 1 &&
      reset.owned.length === 0 &&
      !reset.owned.includes('coin40') &&
      deepEqual(reset, initialState(CATALOG)) &&
      spent.coins === 80,
  );

  // --- no string coercion ------------------------------------------------------
  const stringStateResult = purchase('{"coins":5}', COIN40);
  check(
    'unlock: a string passed as state is not coerced into an economic state',
    stringStateResult.ok === false && stringStateResult.state.coins === 0,
  );
  check(
    'unlock: a string coins field is not coerced',
    status({ coins: '999', level: 1, owned: [] }, COIN40).canBuy === false,
  );
  check(
    'unlock: a non-array owned field is treated as empty',
    purchase({ coins: 5, level: 1, owned: 'nope' }, FREE).state.owned.length === 0,
  );

  // --- malformed models fail closed -------------------------------------------
  check(
    'unlock: status of an invalid model is unavailable',
    status(start, null).unlocked === false &&
      status(start, undefined).canBuy === false &&
      status(start, null).reason === 'unavailable',
  );
  check(
    'unlock: purchase of an invalid model fails safely',
    purchase(start, null).ok === false && purchase(start, { id: 'x' }).ok === false,
  );

  // --- totality: hostile inputs never throw ------------------------------------
  let hostileThrew = null;
  outer: for (const v of HOSTILE) {
    try {
      status(v, v);
      purchase(v, v);
      purchase(undefined, COIN40);
      status(undefined, COIN40);
      applyLevelUnlocks(v, v);
      grantCoins(v, v);
      grantCoins(undefined, v);
      grantLevel(v, v, v);
      grantLevel(undefined, CATALOG, v);
      initialState(v);
      resetEconomy(v);
    } catch (err) {
      hostileThrew = err;
      break outer;
    }
  }
  check('unlock: hostile inputs never throw', hostileThrew === null);

  // --- determinism -------------------------------------------------------------
  const detIn = { coins: 120, level: 1, owned: [] };
  check(
    'unlock: purchase is deterministic for the same inputs',
    deepEqual(purchase(detIn, COIN40), purchase(detIn, COIN40)),
  );
  check(
    'unlock: status is deterministic for the same inputs',
    deepEqual(status(detIn, COMBO), status(detIn, COMBO)),
  );
  check(
    'unlock: grantLevel + applyLevelUnlocks are deterministic',
    deepEqual(
      grantLevel(detIn, CATALOG, 2),
      grantLevel(detIn, CATALOG, 2),
    ) &&
      deepEqual(
        applyLevelUnlocks(detIn, CATALOG),
        applyLevelUnlocks(detIn, CATALOG),
      ),
  );
}
