// tests/champion-finishes.test.mjs — the market finishes must be a real,
// persisted, reversible Champion palette (review: a purchasable item with no
// working action is not allowed).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHAMPION_FINISHES, FINISH_STORAGE_KEY, finishById, readFinish, writeFinish, applyFinishToObject,
} from '../P5 Programme/buddy-kit/client/city-common/champion-finishes.js';

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

function fakeColor(hex) { return { hex, getHex() { return this.hex; }, setHex(v) { this.hex = v; } }; }
function fakeMaterial() { return { color: fakeColor(0x111111), emissive: fakeColor(0x000000), metalness: 0.1, roughness: 0.9, userData: {} }; }
function fakeChampion() {
  const material = fakeMaterial();
  return { material, traverse(fn) { fn({ isMesh: true, material }); } };
}

test('the two plan finishes exist with a colour palette', () => {
  assert.deepEqual(Object.keys(CHAMPION_FINISHES).sort(), ['circuit', 'sunset']);
  for (const finish of Object.values(CHAMPION_FINISHES)) {
    assert.ok(finish.name && finish.nameZh, `${finish.id} needs bilingual names`);
    assert.ok(Number.isInteger(finish.color) && Number.isInteger(finish.accent));
  }
});

test('a finish equips, persists, and clears through injectable storage', () => {
  const storage = fakeStorage();
  assert.equal(readFinish(storage), null);
  assert.equal(writeFinish('sunset', storage), true);
  assert.equal(storage.getItem(FINISH_STORAGE_KEY), 'sunset');
  assert.equal(readFinish(storage), 'sunset');
  assert.equal(writeFinish('not-a-finish', storage), false, 'an unknown finish cannot be equipped');
  assert.equal(readFinish(storage), 'sunset');
  assert.equal(writeFinish(null, storage), true);
  assert.equal(readFinish(storage), null);
});

test('applying a finish tints the Champion and is reversible', () => {
  const champion = fakeChampion();
  const base = champion.material.color.getHex();
  assert.equal(applyFinishToObject(champion, 'sunset'), true);
  assert.equal(champion.material.color.getHex(), CHAMPION_FINISHES.sunset.color);
  assert.equal(champion.material.emissive.getHex(), CHAMPION_FINISHES.sunset.accent);
  // Re-applying another finish is idempotent; clearing restores the base.
  applyFinishToObject(champion, 'circuit');
  assert.equal(champion.material.color.getHex(), CHAMPION_FINISHES.circuit.color);
  applyFinishToObject(champion, null);
  assert.equal(champion.material.color.getHex(), base);
});
