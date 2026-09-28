import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  EMERALD_RAIN_TREE_CANOPY_METRES, EMERALD_RAIN_TREE_CLEAR_RADIUS,
  HUNYUAN_IDS,
  emeraldRainTreeCentreFree, emeraldRainTreePlacement, selectEmeraldRainTreePark,
} from '../P5 Programme/buddy-kit/client/city-common/hunyuan-wave.js';

const client = new URL('../P5 Programme/buddy-kit/client/', import.meta.url);

test('the Hunyuan presentation wave no longer auto-places any building', () => {
  const wave = readFileSync(new URL('city-common/hunyuan-wave.js', client), 'utf8');
  assert.doesNotMatch(wave, /selectHunyuanBuildingVariants/);
  const builder = readFileSync(new URL('city-builder/city-builder.js', client), 'utf8');
  assert.doesNotMatch(builder, /selectHunyuanBuildingVariants|hunyuanSelection|hunyuanVariantModels/);
  // The only Hunyuan asset still placed automatically is the landmark tree.
  assert.match(builder, /HUNYUAN_IDS\.emeraldRainTree/);
  // Housing variety comes from the Kenney pool, not a Hunyuan substitution.
  assert.match(builder, /HOUSING_VARIANTS/);
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
  assert.equal(HUNYUAN_IDS.emeraldRainTree, 'nat_passiona_emerald_rain_tree');
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
