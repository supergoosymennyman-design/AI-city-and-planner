import test from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY, libraryItem, libraryUrl } from '../P5 Programme/buddy-kit/client/city-common/library.js';
import { LIBRARY_PACKS, libraryByPack, packAssetState, packForLibraryItem } from '../P5 Programme/buddy-kit/client/city-common/asset-packs.js';
import { CITY_ESSENTIALS } from '../P5 Programme/buddy-kit/client/city-common/city-essentials.js';

test('themed model packs are derived metadata and preserve library records', () => {
  assert.deepEqual(LIBRARY_PACKS.map((p) => p.id), ['green', 'science', 'rescue', 'transport']);
  const firetruck = libraryItem('veh_firetruck');
  assert.ok(firetruck);
  assert.equal(packForLibraryItem(firetruck), 'rescue');
  assert.equal(libraryByPack(LIBRARY, 'rescue').includes(firetruck), true);
  assert.equal(libraryUrl(firetruck), firetruck.glb);
});

test('every declared pack has models in the full shared library, not only City Essentials', () => {
  const essentialIds = new Set(CITY_ESSENTIALS.map(({ id }) => id));
  for (const pack of LIBRARY_PACKS) {
    const items = libraryByPack(LIBRARY, pack.id).filter((item) => item.picker !== false);
    assert.ok(items.length > 0, `${pack.label} needs at least one visible model`);
    assert.equal(items.every((item) => LIBRARY.includes(item)), true);
    assert.ok(items.some((item) => !essentialIds.has(item.id)), `${pack.label} must extend beyond City Essentials`);
  }
});

test('pack asset state stays on-demand until the normalized session cache owns it', () => {
  const item = libraryItem('veh_firetruck');
  assert.equal(packAssetState(item, new Map()), 'on-demand');
  assert.equal(packAssetState(item, new Map([[item.id, {}]])), 'ready');
  assert.equal(packAssetState(null, new Map()), 'unavailable');
});
