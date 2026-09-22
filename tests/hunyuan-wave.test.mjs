import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EMERALD_RAIN_TREE_CANOPY_METRES, EMERALD_RAIN_TREE_CLEAR_RADIUS,
  coordinateKey, emeraldRainTreeCentreFree, emeraldRainTreePlacement,
  selectEmeraldRainTreePark, selectHunyuanBuildingVariants,
} from '../P5 Programme/buddy-kit/client/city-common/hunyuan-wave.js';

test('Hunyuan building variants choose one stable shop and at most one stable office', () => {
  const layout = { buildings: [
    { type: 'shop', pos: [90, 40] }, { type: 'shop', pos: [10, 60] },
    { type: 'office', pos: [80, 30] }, { type: 'office', pos: [20, 40] },
  ] };
  const first = selectHunyuanBuildingVariants(layout);
  const reordered = selectHunyuanBuildingVariants({ buildings: layout.buildings.slice().reverse() });
  assert.deepEqual(first, reordered);
  assert.ok([coordinateKey([90, 40]), coordinateKey([10, 60])].includes(first.sunstackKey));
  assert.ok([coordinateKey([80, 30]), coordinateKey([20, 40])].includes(first.beaconKey));
  assert.equal(selectHunyuanBuildingVariants({ buildings: [{ type: 'shop', pos: [1, 2] }] }).beaconKey, null);
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
