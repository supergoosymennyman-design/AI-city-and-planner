import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MARKET_CATALOGUE, MARKET_COLLECTIONS, marketItems, marketItem, marketAction } from '../P5 Programme/buddy-kit/client/city-common/market-catalogue.js';
import { emptyEconomy, applyTransaction, purchaseItem, priceOf } from '../P5 Programme/buddy-kit/client/city-common/ledger.js';

// The Champion registry imports three.js, so read it as text (as the links
// mirror test does) and assert every purchasable accessory really equips.
const accessoriesSource = readFileSync(new URL('../P5 Programme/buddy-kit/client/champion-city/accessories.js', import.meta.url), 'utf8');
const accessoryEntries = [...accessoriesSource.matchAll(/\{ id: '([a-z_]+)',[\s\S]*?slot: '([a-z]+)'/g)]
  .map(m => ({ id: m[1], slot: m[2] }));

test('the launch market ships 18 items across the four collections', () => {
  const items = marketItems();
  assert.equal(items.length, 18);
  const byCollection = {};
  for (const entry of items) byCollection[entry.collection] = (byCollection[entry.collection] || 0) + 1;
  assert.deepEqual(byCollection, {
    'champion-accessory': 6, 'city-decoration': 6, prestige: 4, 'champion-finish': 2,
  });
  for (const entry of items) {
    assert.ok(Number.isInteger(entry.price) && entry.price > 0, `${entry.id} needs a whole-number price`);
    assert.ok(entry.name && entry.nameZh, `${entry.id} needs bilingual names`);
  }
  assert.equal(new Set(items.map(i => i.id)).size, 18, 'ids are unique');
});

test('the price ladder matches the plan (two each at 20/40/60, 30/60/90, 120/180, 50)', () => {
  const counts = c => marketItems().filter(i => i.collection === c).map(i => i.price).sort((a, b) => a - b);
  assert.deepEqual(counts('champion-accessory'), [20, 20, 40, 40, 60, 60]);
  assert.deepEqual(counts('city-decoration'), [30, 30, 60, 60, 90, 90]);
  assert.deepEqual(counts('prestige'), [120, 120, 180, 180]);
  assert.deepEqual(counts('champion-finish'), [50, 50]);
});

test('every collection has a bilingual label', () => {
  for (const key of Object.keys(MARKET_COLLECTIONS)) assert.ok(MARKET_COLLECTIONS[key].en && MARKET_COLLECTIONS[key].zh);
});

test('the ledger reads prices straight from the market catalogue', () => {
  assert.equal(priceOf(MARKET_CATALOGUE, 'acc-visor'), 20);
  assert.equal(priceOf(MARKET_CATALOGUE, 'pre-host-a'), 180);
  assert.equal(priceOf(MARKET_CATALOGUE, 'not-an-item'), null);
  const funded = applyTransaction(emptyEconomy(), { id: 'a', type: 'award', amount: 200, title: 'Challenges' });
  const bought = purchaseItem(funded, MARKET_CATALOGUE, 'pre-host-a', 'tx-1');
  assert.equal(bought.purchased, true);
  assert.equal(bought.economy.balance, 20);
  assert.deepEqual(bought.economy.owned, ['pre-host-a']);
});

test('every purchasable accessory maps to a real Champion accessory with the right slot', () => {
  const byId = new Map(accessoryEntries.map(e => [e.id, e.slot]));
  assert.ok(byId.size >= 6, 'the accessory registry should parse');
  for (const entry of marketItems().filter(i => i.kind === 'accessory')) {
    assert.ok(entry.championAccessory, `${entry.id} must name a champion accessory`);
    assert.ok(byId.has(entry.championAccessory), `${entry.championAccessory} is not in the Champion registry`);
    assert.equal(byId.get(entry.championAccessory), entry.slot, `${entry.id} slot must match ${entry.championAccessory}`);
  }
});

test('a card action is Buy, then Equip or Place once owned', () => {
  assert.equal(marketAction('acc-visor', []), 'buy');
  assert.equal(marketAction('acc-visor', ['acc-visor']), 'equip');
  assert.equal(marketAction('dec-planter', ['dec-planter']), 'place');
  assert.equal(marketAction('pre-landmark-a', ['pre-landmark-a']), 'place');
  assert.equal(marketAction('nope', []), null);
  assert.equal(marketItem('acc-visor').kind, 'accessory');
});
