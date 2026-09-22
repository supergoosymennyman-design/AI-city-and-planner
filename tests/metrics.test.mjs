// tests/metrics.test.mjs — goal-weight resolution + the score receipt.
//
// Run: node --test tests/metrics.test.mjs   (from the repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultMetricWeights, normalizeWeights, townCapacity, mixTargetKinds, mixScore, computeMetrics, buildableFrontage, compositionTargets } from '../P5 Programme/buddy-kit/client/city-common/metrics.js';

test('defaultMetricWeights returns the fixed metric blend, summed to 1', () => {
  const w = defaultMetricWeights();
  const sum = Object.values(w).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, `weights should sum to 1, got ${sum}`);
  assert.equal(w.accessibility, 0.30);
  assert.equal(w.coverage, 0.25);
  assert.equal(w.utilities, 0.10);
  assert.equal(w.zoning, 0.15);
  assert.equal(w.spread, 0.10);
  assert.equal(w.balance, 0.10);
});

test('normalizeWeights handles raw metric weights even when a key is named "spread"', () => {
  // This is the regression: 'spread' is BOTH a goal key and a metric key, so a
  // metric-level object used to be misread as goal-level and collapsed to 50/50.
  const w = normalizeWeights({
    accessibility: 0.30, coverage: 0.25, utilities: 0.10,
    zoning: 0.15, spread: 0.10, balance: 0.10,
  });
  assert.equal(w.accessibility, 0.30);
  assert.equal(w.coverage, 0.25);
  assert.ok(Math.abs(w.spread - 0.10) < 1e-9);
  assert.ok(Math.abs(w.balance - 0.10) < 1e-9);
});

test('normalizeWeights still maps goal-level weights through the goal split', () => {
  const w = normalizeWeights({ happy: 0.5, spread: 0.5 });
  // happy -> coverage 0.5 / utilities 0.3 / green 0.2; spread -> spread 0.5 / balance 0.5
  assert.ok(Math.abs(w.coverage - 0.25) < 1e-9);
  assert.ok(Math.abs(w.utilities - 0.15) < 1e-9);
  assert.ok(Math.abs(w.green - 0.10) < 1e-9);
  assert.ok(Math.abs(w.spread - 0.25) < 1e-9);
  assert.ok(Math.abs(w.balance - 0.25) < 1e-9);
});

test('townCapacity scales with the student\'s own drawn roads', () => {
  const withRoads = (len) => ({ version: 2, scaleMeters: 2000, roads: [{ points: [[0, 0], [len, 0]], width: 10, class: 'residential' }], parks: [], buildings: [] });
  assert.equal(townCapacity({ roads: [], buildings: [] }), 0, 'no roads → no town capacity');
  assert.ok(townCapacity(withRoads(3600)) > townCapacity(withRoads(900)), 'a longer network supports a bigger town');
  assert.ok(townCapacity(withRoads(100000)) <= 40, 'capacity is bounded (perf + world size)');
});

test('mix kinds are gated by the design scale, not a fixed town size', () => {
  const layout = (len, homes) => ({
    version: 2, scaleMeters: 2000,
    roads: [{ points: [[0, 0], [len, 0]], width: 10, class: 'residential' }], parks: [],
    buildings: Array.from({ length: homes }, (_, i) => ({ type: 'housing', pos: [10 + i * 30, 10], footprint: [20, 20], height: 24 })),
  });
  assert.deepEqual(mixTargetKinds(layout(300, 1)), [], 'a one-lane hamlet is not asked for a library');
  const district = mixTargetKinds(layout(3600, 20));
  for (const t of ['office', 'library', 'stadium']) assert.ok(district.includes(t), `district earns a ${t}`);
});

test('balance rewards the mix a design-sized town can support', () => {
  const build = (extra) => {
    const l = {
      version: 2, scaleMeters: 2000,
      roads: [{ points: [[0, 0], [3600, 0]], width: 10, class: 'residential' }], parks: [],
      buildings: Array.from({ length: 20 }, (_, i) => ({ type: 'housing', pos: [40 + i * 60, 40], footprint: [20, 20], height: 24 })),
    };
    for (const t of ['school', 'shop', 'hospital', 'fire', 'police', 'water', 'power', 'bus']) l.buildings.push({ type: t, pos: [1800, 41], footprint: [24, 24], height: 24 });
    return l;
  };
  const sparse = build();
  const complete = build();
  for (const t of ['office', 'library', 'stadium']) complete.buildings.push({ type: t, pos: [1800, 400], footprint: [24, 24], height: 30 });
  assert.ok(computeMetrics(complete).balance > computeMetrics(sparse).balance + 1e-9,
    'a town with its design-appropriate mix scores better on balance');
  assert.ok(mixScore(sparse) < 1 && mixScore(complete) === 1);
});

test('frontage capacity deduplicates parallel roads and composition is diagnostic', () => {
  const one = { scaleMeters: 2000, roads: [{ width: 10, points: [[100, 1000], [1900, 1000]] }], parks: [], buildings: [] };
  const duplicate = { ...one, roads: [...one.roads, { width: 10, points: [[100, 1002], [1900, 1002]] }] };
  assert.ok(buildableFrontage(one).viableSlots > 0);
  assert.ok(townCapacity(duplicate) <= townCapacity(one) + 1, 'near-duplicate frontage cannot double capacity');
  const c = compositionTargets(one);
  assert.equal(c.targets.housing, c.capacityHomes);
  for (const key of ['school', 'shop', 'hospital', 'fire', 'police', 'water', 'power', 'bus', 'office', 'library', 'stadium', 'parks']) {
    assert.ok(Number.isInteger(c.targets[key]) && c.targets[key] >= 0, `${key} has a target`);
  }
  assert.equal(c.unresolved.housing, c.targets.housing);
});
