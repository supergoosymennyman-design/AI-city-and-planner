// tests/persistence.test.mjs
//
// Durability helpers are best-effort and must be a guarded no-op under Node.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  requestPersistentStorage, estimateStorage, markDeviceSeen, isReturningDevice,
  envelopeIsEmpty, checkEnvelopeHealth, bootDurability, DEVICE_SEEN_KEY,
} from '../P5 Programme/buddy-kit/client/city-common/persistence.js';

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

test('requestPersistentStorage is a guarded no-op without the Storage API', async () => {
  assert.deepEqual(await requestPersistentStorage({}), { supported: false, granted: false });
  assert.deepEqual(await requestPersistentStorage(null), { supported: false, granted: false });
  assert.equal(await estimateStorage({}), null);
});

test('requestPersistentStorage reports already-persisted and a fresh grant', async () => {
  const already = await requestPersistentStorage({ storage: { persisted: async () => true, persist: async () => true } });
  assert.deepEqual(already, { supported: true, granted: true, already: true });
  const granted = await requestPersistentStorage({ storage: { persisted: async () => false, persist: async () => true } });
  assert.deepEqual(granted, { supported: true, granted: true, already: false });
  const denied = await requestPersistentStorage({ storage: { persisted: async () => false, persist: async () => false } });
  assert.deepEqual(denied, { supported: true, granted: false, already: false });
});

test('estimateStorage reports usage/quota and a ratio', async () => {
  const out = await estimateStorage({ storage: { estimate: async () => ({ usage: 25, quota: 100 }) } });
  assert.deepEqual(out, { usage: 25, quota: 100, ratio: 0.25 });
  assert.equal(await estimateStorage({ storage: { estimate: async () => { throw Error('nope'); } } }), null);
});

test('a device seen before is remembered, and an empty envelope is detected', () => {
  const storage = fakeStorage();
  assert.equal(isReturningDevice(storage), false);
  markDeviceSeen(storage);
  assert.equal(storage.getItem(DEVICE_SEEN_KEY), '1');
  assert.equal(isReturningDevice(storage), true);

  const empty = { version: 1, balance: 0, owned: [], transactions: [], claimed: [], evidence: {} };
  assert.equal(envelopeIsEmpty(empty, { city: {}, workshop: {} }), true);
  assert.equal(envelopeIsEmpty({ ...empty, balance: 10 }, {}), false);
  assert.equal(envelopeIsEmpty(empty, { city: { legacyState: {} } }), false);
});

test('checkEnvelopeHealth offers a restore only on a returning, empty device', async () => {
  const storage = fakeStorage();
  const emptyStore = { readEconomy: async () => ({ balance: 0, owned: [], claimed: [], transactions: [] }), readSection: async () => ({}) };

  // First ever boot: not returning, so no offer.
  assert.deepEqual(await checkEnvelopeHealth(emptyStore, { storage }), { returning: false, empty: true, needsRestore: false });

  // Seen before + empty: offer.
  markDeviceSeen(storage);
  assert.deepEqual(await checkEnvelopeHealth(emptyStore, { storage }), { returning: true, empty: true, needsRestore: true });

  // Seen before + real work: no offer.
  const fullStore = { readEconomy: async () => ({ balance: 30, owned: [], claimed: ['x'], transactions: [] }), readSection: async () => ({}) };
  assert.deepEqual(await checkEnvelopeHealth(fullStore, { storage }), { returning: true, empty: false, needsRestore: false });
});

test('bootDurability requests persistence, marks the device, and fires the offer', async () => {
  const storage = fakeStorage();
  const store = { readEconomy: async () => ({ balance: 0, owned: [], claimed: [], transactions: [] }), readSection: async () => ({}) };
  markDeviceSeen(storage);
  let offered = 0;
  const out = await bootDurability(store, { storage, nav: {}, onNeedsRestore: () => { offered += 1; } });
  assert.equal(out.persistence.supported, false);
  assert.equal(out.needsRestore, true);
  assert.equal(offered, 1);

  // A fresh device is marked seen, so the NEXT boot on an empty envelope offers.
  const fresh = fakeStorage();
  await bootDurability(store, { storage: fresh, nav: {}, onNeedsRestore: () => { offered += 1; } });
  assert.equal(isReturningDevice(fresh), true);
  assert.equal(offered, 1, 'the first boot must not offer a restore');
});
