import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateLayout } from '../P5 Programme/buddy-kit/client/city-common/layout.js';

const layout = JSON.parse(await readFile(new URL('../P5 Programme/docs/showcases/woven-delta-ai-city.json', import.meta.url), 'utf8'));

test('Woven Delta showcase is a valid, bounded marketing layout', () => {
  const result = validateLayout(layout);
  assert.equal(result.ok, true, result.errors.join('; '));
  assert.ok(layout.buildings.length >= 260 && layout.buildings.length <= 300);
  assert.ok(layout.buildings.length < 400);
});

test('Woven Delta uses open curved and angled routes, never a radial ring', () => {
  assert.ok(layout.roads.every(road => JSON.stringify(road.points[0]) !== JSON.stringify(road.points.at(-1))), 'no road closes into a ring');
  assert.ok(layout.roads.some(road => road.points.length >= 6), 'has a curved multi-segment boulevard');
  assert.ok(layout.roads.some(road => {
    const [a, b] = road.points;
    return a[0] !== b[0] && a[1] !== b[1];
  }), 'has angled connectors');
  assert.ok(layout.parks.length >= 5, 'has small civic green pockets');
});
