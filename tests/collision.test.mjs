import test from 'node:test';
import assert from 'node:assert/strict';
import { boxBody, boxesOverlap, forwardBodyGap, resolveBoxCollisions } from '../P5 Programme/buddy-kit/client/city-common/collision.js';
import { createTrafficFlow } from '../P5 Programme/buddy-kit/client/city-common/traffic-network.js';

test('oriented ground boxes resolve a champion out of a rotated building', () => {
  const building = boxBody({ x: 10, z: 10, width: 8, length: 18, yaw: Math.PI / 4 });
  const champion = boxBody({ x: 10, z: 10, width: 1.6, length: 1.6 });
  const result = resolveBoxCollisions(champion, [building]);
  assert.equal(result.collided, true);
  assert.equal(boxesOverlap({ ...champion, x: result.x, z: result.z }, building), false);
});

test('forward clearance ignores a blocker in a neighbouring lane', () => {
  const car = boxBody({ x: 0, z: 0, dx: 1, dz: 0, width: 2.05, length: 5 });
  const ahead = boxBody({ x: 10, z: 0, width: 1.6, length: 1.6 });
  const beside = boxBody({ x: 10, z: 8, width: 1.6, length: 1.6 });
  assert.ok(forwardBodyGap(car, ahead) < 10);
  assert.equal(forwardBodyGap(car, beside), Infinity);
});

test('traffic stops three metres before the champion and resumes after clearance', () => {
  const flow = createTrafficFlow([{ width: 10, points: [[0, 0], [100, 0]] }]);
  const link = flow.network.links.find((candidate) => candidate.dx > .9);
  const car = flow.addVehicle({ link, dist: 20, length: 5, width: 2.05, speed: 8 });
  assert.ok(car);
  // The traffic graph offsets this eastbound lane to the left of the road.
  const champion = boxBody({ x: 40, z: car.z, width: 1.6, length: 1.6 });
  for (let i = 0; i < 260; i++) flow.update(.05, [champion]);
  const carBody = boxBody({ x: car.x, z: car.z, dx: car.vx, dz: car.vz, length: car.length, width: car.width });
  assert.ok(forwardBodyGap(carBody, champion) >= 2.99, 'car retains the 3 m safety gap');
  assert.ok(car.currentSpeed <= .01, 'car comes to a complete yield');
  flow.update(.5, []);
  assert.ok(car.currentSpeed > 0, 'car resumes once the champion has cleared the lane');
});
