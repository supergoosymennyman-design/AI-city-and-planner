import test from 'node:test';
import assert from 'node:assert/strict';
import { studioPrice, studioCatalogue, walletOf } from '../P5 Programme/buddy-kit/client/city-common/studio-wallet.js';
import { purchaseItem, normalizeEconomy } from '../P5 Programme/buddy-kit/client/city-common/ledger.js';

// The Studio's own catalogue, trimmed to the shape the adapter must translate.
const CATALOG = {
  version: 1,
  startingCoins: 120,
  startingLevel: 1,
  models: [
    { id: 'starter-cube', name: 'Starter Cube', unlock: { type: 'free' } },
    { id: 'bouncy-sphere', name: 'Bouncy Sphere', unlock: { type: 'level', level: 2 } },
    { id: 'rocket-cone', name: 'Rocket Cone', unlock: { type: 'coins', coins: 40 } },
    { id: 'golden-cylinder', name: 'Golden Cylinder', unlock: { type: 'level+coins', level: 3, coins: 120 } },
  ],
};

test('studioPrice reads the coin price the unlock engine charges', () => {
  assert.equal(studioPrice({ unlock: { type: 'free' } }), 0);
  assert.equal(studioPrice({ unlock: { type: 'level', level: 4 } }), 0);
  assert.equal(studioPrice({ unlock: { type: 'coins', coins: 40 } }), 40);
  assert.equal(studioPrice({ unlock: { type: 'level+coins', level: 3, coins: 120 } }), 120);
});

test('studioPrice never throws on hostile input', () => {
  for (const bad of [null, undefined, 7, 'x', [], {}, { unlock: null }, { unlock: [] },
    { unlock: { type: 'coins' } }, { unlock: { type: 'coins', coins: -5 } },
    { unlock: { type: 'coins', coins: 3.5 } }, { unlock: { type: 'coins', coins: '40' } }]) {
    assert.equal(studioPrice(bad), 0);
  }
});

test('studioCatalogue maps every usable model and skips the rest', () => {
  const catalogue = studioCatalogue(CATALOG);
  assert.deepEqual(Object.keys(catalogue.items), ['starter-cube', 'bouncy-sphere', 'rocket-cone', 'golden-cylinder']);
  assert.deepEqual(catalogue.items['rocket-cone'], { id: 'rocket-cone', name: 'Rocket Cone', price: 40 });
  assert.equal(catalogue.items['starter-cube'].price, 0);
  assert.equal(catalogue.items['bouncy-sphere'].price, 0);
  assert.equal(catalogue.items['golden-cylinder'].price, 120);
});

test('studioCatalogue tolerates hostile input without throwing', () => {
  for (const bad of [null, undefined, 3, 'x', {}, { models: null }, { models: [null, 1, 'x'] }]) {
    const catalogue = studioCatalogue(bad);
    assert.deepEqual(catalogue.items, {});
    assert.equal(catalogue.version, 1);
  }
});

test('a Studio purchase through the ledger debits the shared wallet exactly once', () => {
  const catalogue = studioCatalogue(CATALOG);
  let economy = normalizeEconomy({ balance: 100, owned: [], transactions: [] });

  const first = purchaseItem(economy, catalogue, 'rocket-cone', 'studio-tx-1');
  assert.equal(first.ok, true);
  assert.equal(first.purchased, true);
  assert.equal(first.economy.balance, 60);
  assert.deepEqual(first.economy.owned, ['rocket-cone']);

  // Replaying the same purchase (same or new tx id) can never charge twice.
  const replay = purchaseItem(first.economy, catalogue, 'rocket-cone', 'studio-tx-2');
  assert.equal(replay.purchased, false);
  assert.equal(replay.reason, 'already-owned');
  assert.equal(replay.economy.balance, 60);

  // An unaffordable Studio model is refused with no debit and no ownership.
  economy = normalizeEconomy({ balance: 10, owned: [], transactions: [] });
  const denied = purchaseItem(economy, catalogue, 'golden-cylinder', 'studio-tx-3');
  assert.equal(denied.ok, false);
  assert.match(denied.error, /Not enough credits/);
  assert.equal(denied.economy.balance, 10);
  assert.deepEqual(denied.economy.owned, []);
});

test('a free/level Studio model is committed as ownership at price 0', () => {
  const catalogue = studioCatalogue(CATALOG);
  const before = normalizeEconomy({ balance: 0, owned: [], transactions: [] });
  const result = purchaseItem(before, catalogue, 'bouncy-sphere', 'studio-tx-free');
  assert.equal(result.ok, true);
  assert.equal(result.purchased, true);
  assert.equal(result.economy.balance, 0);
  assert.deepEqual(result.economy.owned, ['bouncy-sphere']);
});

test('a Studio item absent from the catalogue is refused, never priced by the caller', () => {
  const catalogue = studioCatalogue(CATALOG);
  const economy = normalizeEconomy({ balance: 999, owned: [], transactions: [] });
  const result = purchaseItem(economy, catalogue, 'not-in-catalogue', 'studio-tx-x');
  assert.equal(result.ok, false);
  assert.match(result.error, /not in the catalogue/);
});

test('walletOf reads the Studio {coins, owned} shape defensively', () => {
  assert.deepEqual(walletOf({ balance: 42, owned: ['a', 'b'] }), { coins: 42, owned: ['a', 'b'] });
  assert.deepEqual(walletOf({ balance: 0, owned: [] }), { coins: 0, owned: [] });
  for (const bad of [null, undefined, 3, 'x', [], { balance: -1, owned: 'nope' }]) {
    assert.deepEqual(walletOf(bad), { coins: 0, owned: [] });
  }
  // A bad balance still yields a readable wallet; junk owned ids are dropped.
  assert.deepEqual(walletOf({ balance: 2.5, owned: [1, 'ok', ''] }), { coins: 0, owned: ['ok'] });
});
