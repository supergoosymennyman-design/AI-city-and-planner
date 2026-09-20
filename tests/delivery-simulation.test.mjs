import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceDelivery, deliveryRecordFromEnvelope, planDelivery, replayDelivery, startDelivery, withDeliveryRecord,
} from '../P5 Programme/buddy-kit/client/city-common/delivery-simulation.js';

test('battery-aware replay is deterministic, uses a charging stop and completes one delivery', () => {
  const settings = { target: 'harbour', strategy: 'battery-aware', initialBattery: 70, payloadKg: 1, respectNoFly: true, allowCharging: true };
  const a = replayDelivery(settings), b = replayDelivery(settings);
  assert.deepEqual(a, b);
  assert.equal(a.status, 'delivered');
  assert.equal(a.deliveries, 1);
  assert.equal(a.chargeStops, 1);
  assert.deepEqual(a.route, ['depot', 'charger', 'harbour']);
  assert.equal(a.distance, 80);
  assert.equal(a.battery, 25);
  assert.equal(a.elapsedSeconds, 36); // 80 m at 5 m/s + one 20 s charge
});

test('shortest allowed route can strand honestly while battery-aware search rejects it', () => {
  const settings = { target: 'harbour', initialBattery: 70, payloadKg: 1, respectNoFly: true, allowCharging: false };
  const stranded = replayDelivery({ ...settings, strategy: 'shortest' });
  assert.equal(stranded.status, 'stranded');
  assert.equal(stranded.deliveries, 0);
  assert.equal(stranded.battery, 0);
  assert.ok(stranded.distance > 35 && stranded.distance < 80);
  const infeasible = startDelivery({ ...settings, strategy: 'battery-aware' });
  assert.equal(infeasible.status, 'infeasible');
  assert.equal(infeasible.reason, 'no-feasible-route');
});

test('battery boundary, charging, payload policy and no-fly rules affect the result exactly', () => {
  const boundary = replayDelivery({ target: 'harbour', strategy: 'shortest', initialBattery: 65, payloadKg: 1, respectNoFly: false, allowCharging: false });
  assert.equal(boundary.status, 'delivered');
  assert.equal(boundary.battery, 0);
  assert.deepEqual(boundary.route, ['depot', 'ridge', 'harbour']);
  const heavy = replayDelivery({ target: 'harbour', strategy: 'battery-aware', initialBattery: 70, payloadKg: 2, respectNoFly: true, allowCharging: true });
  assert.equal(heavy.status, 'delivered');
  assert.equal(heavy.chargeStops, 1);
  assert.equal(startDelivery({ payloadKg: 3 }).reason, 'payload-policy');
  assert.deepEqual(planDelivery({ target: 'park', strategy: 'shortest', respectNoFly: false }).route, ['depot', 'park']);
  assert.deepEqual(planDelivery({ target: 'park', strategy: 'shortest', respectNoFly: true }).route, ['depot', 'charger', 'park']);
});

test('one-leg interruption resumes to the same deterministic outcome', () => {
  const settings = { target: 'harbour', strategy: 'battery-aware', initialBattery: 70, payloadKg: 1, respectNoFly: true, allowCharging: true };
  const paused = advanceDelivery(startDelivery(settings));
  assert.equal(paused.status, 'paused');
  const restored = JSON.parse(JSON.stringify(paused));
  const resumed = advanceDelivery(restored);
  assert.deepEqual(resumed, replayDelivery(settings));
});

test('delivery record round-trips additively inside the existing props envelope', () => {
  const state = advanceDelivery(startDelivery({ target: 'park' }));
  const legacyProps = [{ id: 'prop_tree', x: 1, z: 2 }];
  const wrapped = withDeliveryRecord(legacyProps, state);
  assert.deepEqual(wrapped.props, legacyProps);
  assert.deepEqual(deliveryRecordFromEnvelope(JSON.parse(JSON.stringify(wrapped))), state);
  const future = withDeliveryRecord({ version: 7, props: legacyProps, future: { keep: true }, demonstrations: { futureDemo: 'keep' } }, state);
  assert.deepEqual(future.future, { keep: true });
  assert.equal(future.demonstrations.futureDemo, 'keep');
});
