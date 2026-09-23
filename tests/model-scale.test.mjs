import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY } from '../P5 Programme/buddy-kit/client/city-common/library.js';
import {
  CITY_CHAMPION_HEIGHT, itemTargetBounds, scaledBounds, uniformScaleForBounds,
} from '../P5 Programme/buddy-kit/client/city-common/model-scale.js';

test('building fit uses one uniform scale and stays inside its physical box', () => {
  const source = { x: 2, y: 4, z: 1 };
  const target = { width: 12, height: 18, depth: 8 };
  const scale = uniformScaleForBounds(source, target);
  const rendered = scaledBounds(source, scale);
  assert.equal(scale, 4.5);
  assert.deepEqual(rendered, { width: 9, height: 18, depth: 4.5 });
  assert.ok(rendered.width <= target.width && rendered.depth <= target.depth);
});

test('all built-in buildings expose positive metre targets', () => {
  const buildings = LIBRARY.filter((item) => item.category === 'buildings');
  assert.equal(buildings.length, 88);
  for (const item of buildings) {
    const target = itemTargetBounds(item);
    assert.ok(target.width > 0, `${item.id} width`);
    assert.ok(target.depth > 0, `${item.id} depth`);
    assert.ok(target.height > 0, `${item.id} height`);
  }
});

test('Quaternius homes and flats are no longer toy-sized beside a human Champion', () => {
  const homes = LIBRARY.filter((item) => /^bld_(?:house|flat)_q/.test(item.id));
  assert.equal(CITY_CHAMPION_HEIGHT, 1.8);
  assert.equal(homes.length, 7);
  for (const item of homes) {
    assert.ok(item.height >= 4, `${item.id} is at least a plausible one-storey building`);
    assert.ok(Math.min(...item.footprint) >= 3.6, `${item.id} has a usable human-scale footprint`);
  }
});
