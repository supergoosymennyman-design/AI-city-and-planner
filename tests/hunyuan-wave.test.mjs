import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EMERALD_RAIN_TREE_CANOPY_METRES, EMERALD_RAIN_TREE_CLEAR_RADIUS,
  HUNYUAN_IDS, WAVE_2_RESIDENTIAL_IDS,
  coordinateKey, emeraldRainTreeCentreFree, emeraldRainTreePlacement,
  selectEmeraldRainTreePark, selectHunyuanBuildingVariants,
} from '../P5 Programme/buddy-kit/client/city-common/hunyuan-wave.js';

function lots(type, count, offset = 0) {
  return Array.from({ length: count }, (_, i) => ({ type, pos: [offset + i * 17 + 1, offset + i * 29 + 2] }));
}

test('Hunyuan quotas are exact, capped, disjoint, and stable across array order', () => {
  const layout = { buildings: [
    ...lots('housing', 20), ...lots('shop', 20, 1000), ...lots('office', 20, 2000),
    ...lots('school', 6, 3000), ...lots('library', 4, 4000),
  ] };
  const first = selectHunyuanBuildingVariants(layout);
  const reordered = selectHunyuanBuildingVariants({ buildings: layout.buildings.slice().reverse() });
  assert.deepEqual(first.assignments, reordered.assignments);
  assert.equal(first.housingKeys.length, 7);
  assert.equal(first.sunstackKeys.length, 4);
  assert.equal(first.bambooMarketKeys.length, 3);
  assert.equal(first.beaconKeys.length, 3);
  assert.equal(first.skygardenKeys.length, 4);
  const all = [...first.housingKeys, ...first.sunstackKeys, ...first.bambooMarketKeys, ...first.beaconKeys, ...first.skygardenKeys];
  assert.equal(new Set(all).size, all.length);
});

test('small cities receive bounded minimums without inventing absent role types', () => {
  const oneShop = selectHunyuanBuildingVariants({ buildings: lots('shop', 1) });
  assert.equal(oneShop.sunstackKeys.length, 1);
  assert.equal(oneShop.bambooMarketKeys.length, 0);
  assert.equal(oneShop.housingKeys.length, 0);
  const small = selectHunyuanBuildingVariants({ buildings: [
    ...lots('housing', 2), ...lots('shop', 2, 100), ...lots('office', 1, 200),
    { type: 'school', pos: [301, 302] }, { type: 'library', pos: [401, 402] },
  ] });
  assert.equal(small.housingKeys.length, 1);
  assert.equal(small.sunstackKeys.length, 1);
  assert.equal(small.bambooMarketKeys.length, 1);
  assert.equal(small.beaconKeys.length, 1);
  assert.equal(small.skygardenKeys.length, 1);
});

test('housing caps at 48 and cycles its three new residences evenly', () => {
  const selected = selectHunyuanBuildingVariants({ buildings: lots('housing', 200) });
  assert.equal(selected.housingKeys.length, 48);
  assert.deepEqual(WAVE_2_RESIDENTIAL_IDS.map((id) => Object.values(selected.assignments).filter((value) => value === id).length), [16, 16, 16]);
});

test('coordinate lookup keeps civic roles and excludes unrelated role types', () => {
  const buildings = [{ type: 'school', pos: [10, 20] }, { type: 'library', pos: [30, 40] }, { type: 'hospital', pos: [50, 60] }];
  const selected = selectHunyuanBuildingVariants({ buildings });
  assert.ok(buildings.some((building) => selected.variantFor(building) === HUNYUAN_IDS.skygardenLearning));
  assert.equal(selected.variantFor({ pos: [50, 60] }), null);
});

test('Emerald Rain Tree selects exactly the largest eligible auto-scenery park with coordinate tie-break', () => {
  const layout = { autoScenery: true, parks: [
    { cx: 80, cz: 10, radius: 42 }, { cx: 10, cz: 20, radius: 42 }, { cx: 1, cz: 1, radius: 39 }, { cx: 30, cz: 30, radius: 55 },
  ] };
  assert.deepEqual(selectEmeraldRainTreePark(layout), { cx: 30, cz: 30, radius: 55 });
  assert.equal(selectEmeraldRainTreePark({ ...layout, autoScenery: false }), null);
  const tie = selectEmeraldRainTreePark({ parks: layout.parks.slice(0, 2) });
  assert.deepEqual(tie, { cx: 10, cz: 20, radius: 42 });
  assert.equal(EMERALD_RAIN_TREE_CANOPY_METRES, 12);
  assert.equal(EMERALD_RAIN_TREE_CLEAR_RADIUS * 2, 8);
});

test('a student prop overlapping the landmark centre takes precedence and freeing it restores the tree', () => {
  const layout = { autoScenery: true, parks: [{ cx: 100, cz: 100, radius: 40 }] };
  const itemFor = () => ({ footprint: [2, 2] });
  assert.deepEqual(emeraldRainTreePlacement(layout, [], itemFor)?.x, 100);
  const centred = [{ id: 'prop_bench', x: 103.8, z: 100 }];
  assert.equal(emeraldRainTreeCentreFree(layout.parks[0], centred, itemFor), false);
  assert.equal(emeraldRainTreePlacement(layout, centred, itemFor), null);
  assert.deepEqual(emeraldRainTreePlacement(layout, [{ id: 'prop_bench', x: 110, z: 100 }], itemFor)?.z, 100);
});
