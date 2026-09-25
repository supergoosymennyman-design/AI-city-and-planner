// tests/market-handoff.test.mjs — the City end of a Market "Place in City"
// hand-off. Ownership must be the gate (a URL cannot place an unbought item),
// and the placement must go through the real prop-library commit path.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readPlaceId, placePurchasedItem, clearPlaceRequest, PLACE_QUERY_KEY } from '../P5 Programme/buddy-kit/client/city-builder/market-handoff.js';

function fakePropLibrary() {
  const calls = [];
  return {
    calls,
    async insertProp(propId, transform) { calls.push(['insertProp', propId, transform]); return 'instance-prop'; },
    async insertLandmark(templateId, transform) { calls.push(['insertLandmark', templateId, transform]); return 'instance-landmark'; },
  };
}
const storeWith = (owned) => ({ readEconomy: async () => ({ owned }) });

test('the hand-off reads and clears only the place query param', () => {
  assert.equal(readPlaceId('?place=dec-bench'), 'dec-bench');
  assert.equal(readPlaceId('?x=1&place=pre-landmark-b'), 'pre-landmark-b');
  assert.equal(readPlaceId('?demoPerf=1'), null);
  assert.equal(readPlaceId(''), null);
  const history = { replaced: null, replaceState(_a, _b, url) { this.replaced = url; } };
  assert.equal(clearPlaceRequest('http://x/city-builder/?place=dec-bench&keep=1', history), true);
  assert.equal(history.replaced, 'http://x/city-builder/?keep=1');
});

test('an unowned item cannot be placed from a URL', async () => {
  const propLibrary = fakePropLibrary();
  const result = await placePurchasedItem({ id: 'dec-bench', propLibrary, store: storeWith([]) });
  assert.deepEqual(result, { ok: false, error: 'not-owned' });
  assert.equal(propLibrary.calls.length, 0);
});

test('an owned decoration places the mapped library prop', async () => {
  const propLibrary = fakePropLibrary();
  const result = await placePurchasedItem({ id: 'dec-bench', propLibrary, store: storeWith(['dec-bench']), position: { x: 3, z: 4 } });
  assert.equal(result.ok, true);
  assert.equal(result.kind, 'decoration');
  assert.deepEqual(propLibrary.calls, [['insertProp', 'prop_bench', { x: 3, z: 4 }]]);
});

test('an owned landmark places the mapped landmark template', async () => {
  const propLibrary = fakePropLibrary();
  const result = await placePurchasedItem({ id: 'pre-landmark-b', propLibrary, store: storeWith(['pre-landmark-b']) });
  assert.equal(result.ok, true);
  assert.equal(result.kind, 'landmark');
  assert.deepEqual(propLibrary.calls, [['insertLandmark', 'festival-plaza', { x: 0, z: 0 }]]);
});

test('a non-placeable item is refused even when owned', async () => {
  const propLibrary = fakePropLibrary();
  const result = await placePurchasedItem({ id: 'acc-visor', propLibrary, store: storeWith(['acc-visor']) });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'unknown-item');
  assert.equal(propLibrary.calls.length, 0);
});
