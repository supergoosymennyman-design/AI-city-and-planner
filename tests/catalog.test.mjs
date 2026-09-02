// tests/catalog.test.mjs — integrity of the shared building catalog.
//
// Run: node --test tests/catalog.test.mjs   (from the repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, CATALOG_ORDER, catalogType, isSpecial, specialKeys } from '../P5 Programme/buddy-kit/client/city-common/catalog.js';

test('catalog has exactly 18 special mission buildings with unique quest ids 1..18', () => {
  const specials = Object.entries(CATALOG).filter(([, v]) => v.category === 'special');
  assert.equal(specials.length, 18);
  const ids = specials.map(([, v]) => v.questId).sort((a, b) => a - b);
  assert.deepEqual(ids, Array.from({ length: 18 }, (_, i) => i + 1));
});

test('every CATALOG_ORDER key exists in CATALOG, and every special is in order', () => {
  for (const key of CATALOG_ORDER) assert.ok(CATALOG[key], `CATALOG_ORDER references missing key ${key}`);
  const specialOrder = specialKeys();
  const catalogOrderSpecials = CATALOG_ORDER.filter((k) => CATALOG[k].category === 'special');
  assert.deepEqual(specialOrder, catalogOrderSpecials);
});

test('every catalog entry has a footprint, height and emoji', () => {
  for (const [key, v] of Object.entries(CATALOG)) {
    assert.ok(Array.isArray(v.footprint) && v.footprint.length === 2 && v.footprint.every((n) => n > 0), `${key} footprint`);
    assert.ok(typeof v.height === 'number' && v.height > 0, `${key} height`);
    assert.ok(typeof v.emoji === 'string' && v.emoji.length > 0, `${key} emoji`);
    assert.ok(['special', 'generic'].includes(v.category), `${key} category`);
  }
});

test('catalogType / isSpecial handle unknown keys safely', () => {
  assert.equal(catalogType('not_a_building'), null);
  assert.equal(isSpecial('not_a_building'), false);
  assert.equal(isSpecial('city_central'), true);
  assert.equal(isSpecial('housing'), false);
});
