import test from 'node:test';
import assert from 'node:assert/strict';
import { boxBody } from '../P5 Programme/buddy-kit/client/city-common/collision.js';
import { advanceGroundRoute, planGroundRoute, routeHasClearance } from '../P5 Programme/buddy-kit/client/city-common/navigation.js';

test('ground navigation uses a direct route when the way is clear', () => {
  const result = planGroundRoute({ start: { x: 0, z: 0 }, target: { x: 20, z: 0 } });
  assert.equal(result.ok, true);
  assert.deepEqual(result.points, [{ x: 20, z: 0 }]);
});

test('ground navigation detours around a rotated building with Champion clearance', () => {
  const obstacle = { ...boxBody({ x: 10, z: 0, width: 8, length: 12, yaw: Math.PI / 4 }), id: 'block' };
  const result = planGroundRoute({ start: { x: 0, z: 0 }, target: { x: 25, z: 0 }, obstacles: [obstacle], clearance: 1.4 });
  assert.equal(result.ok, true);
  assert.ok(result.points.length >= 2, 'route has at least one detour waypoint');
  assert.equal(routeHasClearance([{ x: 0, z: 0 }, ...result.points], [obstacle], 1.4), true);
});

test('building destinations end at a reachable perimeter rather than the blocked centre', () => {
  const destination = { ...boxBody({ x: 30, z: 0, width: 16, length: 20 }), id: 'destination' };
  const result = planGroundRoute({ start: { x: 0, z: 0 }, target: { x: 30, z: 0 }, obstacles: [destination], targetObstacleId: 'destination', clearance: 1.4 });
  assert.equal(result.ok, true);
  assert.notDeepEqual(result.approach, { x: 30, z: 0 });
  assert.ok(Math.hypot(result.approach.x - 30, result.approach.z) >= 9);
});

test('selecting a destination from its safe approach zone is already arrived', () => {
  const destination = { ...boxBody({ x: 30, z: 0, width: 16, length: 20 }), id: 'destination' };
  const result = planGroundRoute({ start: { x: 38.5, z: 0 }, target: { x: 30, z: 0 },
    obstacles: [destination], targetObstacleId: 'destination', clearance: 1.4 });
  assert.equal(result.ok, true);
  assert.deepEqual(result.points, []);
  assert.equal(result.distance, 0);
});

test('ground navigation reports an enclosed destination as unreachable', () => {
  const obstacles = [
    { ...boxBody({ x: 10, z: 0, width: 4, length: 30 }), id: 'east' },
    { ...boxBody({ x: -10, z: 0, width: 4, length: 30 }), id: 'west' },
    { ...boxBody({ x: 0, z: 10, width: 30, length: 4 }), id: 'north' },
    { ...boxBody({ x: 0, z: -10, width: 30, length: 4 }), id: 'south' },
  ];
  const result = planGroundRoute({ start: { x: 30, z: 0 }, target: { x: 0, z: 0 }, obstacles, clearance: 1 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'unreachable');
});

test('waypoint advancement skips reached points and finishes cleanly', () => {
  const route = { index: 0, points: [{ x: 1, z: 0 }, { x: 5, z: 0 }] };
  assert.deepEqual(advanceGroundRoute(route, { x: 1, z: 0 }, 0.2), { done: false, index: 1, waypoint: { x: 5, z: 0 } });
  assert.equal(advanceGroundRoute({ ...route, index: 1 }, { x: 5, z: 0 }, 0.2).done, true);
});
