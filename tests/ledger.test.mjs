import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyEconomy, normalizeEconomy, validateEconomy, applyTransaction,
  recordLearningEvent, purchaseItem, priceOf, claimKey, REWARD_CONFIG,
} from '../P5 Programme/buddy-kit/client/city-common/ledger.js';

const catalogue = {
  version: 1,
  items: {
    'acc-visor': { id: 'acc-visor', name: 'Visor', price: 20 },
    'city-planter': { id: 'city-planter', name: 'Planter', price: 30 },
  },
};

test('a new economy starts at zero with the achievement books empty', () => {
  const e = emptyEconomy();
  assert.equal(e.version, 1);
  assert.equal(e.balance, 0);
  assert.deepEqual(e.owned, []);
  assert.deepEqual(e.transactions, []);
  assert.deepEqual(e.claimed, []);
  assert.deepEqual(e.evidence, {});
  assert.equal(validateEconomy(e), e);
});

test('a legacy economy normalizes without losing its shipped fields', () => {
  const e = normalizeEconomy({ version: 1, balance: 50, owned: ['hat'], transactions: [], legacyImported: true });
  assert.equal(e.balance, 50);
  assert.deepEqual(e.owned, ['hat']);
  assert.deepEqual(e.claimed, []);
  assert.equal(e.legacyImported, true);
});

test('applyTransaction is pure and keeps the shipped award/purchase rules', () => {
  const start = emptyEconomy();
  const funded = applyTransaction(start, { id: 'a', type: 'award', amount: 50, title: 'Inspect errors' });
  assert.equal(start.balance, 0, 'the input economy is never mutated');
  assert.equal(funded.balance, 50);
  assert.equal(funded.transactions.length, 1);
  // Idempotent by transaction ID.
  assert.deepEqual(applyTransaction(funded, { id: 'a', type: 'award', amount: 50, title: 'Inspect errors' }), funded);
  assert.throws(() => applyTransaction(funded, { id: 'a', type: 'award', amount: 30, title: 'Inspect errors' }));
  // Whole-number, positive awards only.
  for (const amount of [-1, 0, 1.5, Infinity, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => applyTransaction(funded, { id: 'x', type: 'award', amount, title: 'x' }));
  }
  const bought = applyTransaction(funded, { id: 'p', type: 'purchase', item: 'acc-visor', amount: 20, title: 'Visor' });
  assert.equal(bought.balance, 30);
  assert.deepEqual(bought.owned, ['acc-visor']);
  assert.deepEqual(applyTransaction(bought, { id: 'p2', type: 'purchase', item: 'acc-visor', amount: 20, title: 'Visor' }), bought, 'never double-charges');
});

test('a future economy version is preserved but cannot be mutated', () => {
  const e = normalizeEconomy({ version: 9, opaque: 'keep' });
  assert.equal(e.version, 9);
  assert.throws(() => applyTransaction(e, { id: 'a', type: 'award', amount: 1, title: 'A' }));
});

test('the reward config has stable IDs and the six plan amounts', () => {
  assert.equal(REWARD_CONFIG.version, 1);
  const byAmount = Object.fromEntries(Object.values(REWARD_CONFIG.rewards).map(r => [r.id, r.credits]));
  assert.deepEqual(byAmount, {
    'tutorial-task': 10, 'skill-saved': 20, 'held-out-eval': 30,
    'city-install': 40, 'revision-fixed': 30, 'abstain-demo': 20,
  });
});

test('recordLearningEvent credits once per scope and replays harmlessly', () => {
  let e = emptyEconomy();
  const event = { type: 'held-out-eval', scopeId: 'ch-recycle', evidence: { heldOut: 0.92, total: 14 } };
  const first = recordLearningEvent(e, event);
  assert.equal(first.ok, true);
  assert.equal(first.claimed, true);
  assert.equal(first.amount, 30);
  assert.equal(first.economy.balance, 30);
  assert.deepEqual(first.economy.claimed, ['held-out-eval:ch-recycle']);
  assert.deepEqual(first.economy.evidence['held-out-eval:ch-recycle'], { heldOut: 0.92, total: 14 });
  // Replay: harmless, no new credits.
  const replay = recordLearningEvent(first.economy, { ...event, id: 'different-event-id' });
  assert.equal(replay.claimed, false);
  assert.equal(replay.reason, 'already-claimed');
  assert.equal(replay.economy.balance, 30);
  // A different challenge gets its own reward.
  const other = recordLearningEvent(first.economy, { ...event, scopeId: 'ch-drive' });
  assert.equal(other.claimed, true);
  assert.equal(other.economy.balance, 60);
});

test('a learning event cannot name its own credits', () => {
  const e = emptyEconomy();
  const result = recordLearningEvent(e, { type: 'unknown-type', scopeId: 's', evidence: { x: 1 }, amount: 9999 });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'Unknown learning event.');
  assert.equal(e.balance, 0);
});

test('a learning event without evidence is refused', () => {
  const e = emptyEconomy();
  for (const evidence of [undefined, null, {}, [], 'text']) {
    const result = recordLearningEvent(e, { type: 'skill-saved', scopeId: 's', evidence });
    assert.equal(result.ok, false);
    assert.match(result.error, /evidence/i);
  }
  assert.equal(e.claimed.length, 0);
});

test('a mirrored reward transaction is booked without re-minting', () => {
  const paid = applyTransaction(emptyEconomy(), {
    id: 'reward:city-install:ch-recycle', type: 'award', amount: 40, title: 'Installed and tested in the City',
  });
  const result = recordLearningEvent(paid, { type: 'city-install', scopeId: 'ch-recycle', evidence: { runs: 3 } });
  assert.equal(result.ok, true);
  assert.equal(result.claimed, false);
  assert.equal(result.reason, 'already-paid');
  assert.equal(result.economy.balance, 40, 'the mirrored payment is not credited twice');
  assert.deepEqual(result.economy.claimed, ['city-install:ch-recycle']);
});

test('purchaseItem takes the price from the catalogue, never the caller', () => {
  const funded = applyTransaction(emptyEconomy(), { id: 'a', type: 'award', amount: 50, title: 'Tutorial' });
  const bought = purchaseItem(funded, catalogue, 'acc-visor', 'buy-1');
  assert.equal(bought.purchased, true);
  assert.equal(bought.economy.balance, 30);
  assert.deepEqual(bought.economy.owned, ['acc-visor']);
  // Unknown item, missing transaction id, insufficient funds.
  assert.equal(purchaseItem(funded, catalogue, 'nope', 'buy-2').ok, false);
  assert.equal(purchaseItem(funded, catalogue, 'acc-visor', '').ok, false);
  const poor = purchaseItem(applyTransaction(emptyEconomy(), { id: 'b', type: 'award', amount: 5, title: 'x' }), catalogue, 'acc-visor', 'buy-3');
  assert.equal(poor.ok, false);
  assert.equal(poor.error, 'Not enough credits.');
  // Ownership is idempotent: buying again is a no-op, not a charge.
  const again = purchaseItem(bought.economy, catalogue, 'acc-visor', 'buy-4');
  assert.equal(again.purchased, false);
  assert.equal(again.reason, 'already-owned');
  assert.equal(again.economy.balance, 30);
});

test('priceOf understands both catalogue shapes', () => {
  assert.equal(priceOf(catalogue, 'acc-visor'), 20);
  assert.equal(priceOf({ items: [{ id: 'x', price: 60 }] }, 'x'), 60);
  assert.equal(priceOf({ items: [] }, 'x'), null);
});

test('claimKey is stable and scoped', () => {
  assert.equal(claimKey(REWARD_CONFIG.rewards['tutorial-task'], 'tut-01'), 'tutorial-task:tut-01');
  assert.throws(() => claimKey(REWARD_CONFIG.rewards['tutorial-task'], ''));
});
