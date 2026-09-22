import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeRoadTopology, repairRoadTopology } from '../P5 Programme/buddy-kit/client/city-common/road-topology.js';

test('topology readiness distinguishes loops, repairable gaps and genuine trees', () => {
  const loop = { scaleMeters: 500, roads: [{ width: 9, points: [[50, 50], [450, 50], [450, 450], [50, 450], [50, 50]] }] };
  assert.equal(analyzeRoadTopology(loop).readiness, 'cars-ready');
  const gapped = { scaleMeters: 500, roads: [{ width: 9, points: [[50, 50], [450, 50], [450, 450], [50, 450], [50, 70]] }] };
  const repaired = repairRoadTopology(gapped, { touchTolerance: 30 });
  assert.equal(repaired.before.readiness, 'connect-this-gap');
  assert.equal(repaired.after.readiness, 'cars-ready');
  assert.equal(repaired.reversible, true);
  assert.deepEqual(repaired.snapshot, gapped.roads);
  const tree = { scaleMeters: 500, roads: [{ width: 9, points: [[50, 250], [450, 250]] }, { width: 9, points: [[250, 250], [250, 450]] }] };
  assert.equal(analyzeRoadTopology(tree).readiness, 'draw-a-loop');
});

test('topology offers a bounded same-component circuit connector', () => {
  const almost = { scaleMeters: 500, roads: [{ width: 9, points: [[50, 50], [400, 50], [400, 400], [80, 400]] },
    { width: 9, points: [[80, 400], [50, 400], [50, 100]] }] };
  const report = analyzeRoadTopology(almost, { touchTolerance: 20, maxRepairDistance: 60 });
  assert.equal(report.readiness, 'connect-this-gap');
  assert.ok(report.suggestedConnectors[0].distance <= 60);
});
