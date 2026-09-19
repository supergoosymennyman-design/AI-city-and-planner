// tests/metrics.test.mjs — goal-weight resolution + the score receipt.
//
// Run: node --test tests/metrics.test.mjs   (from the repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultMetricWeights, normalizeWeights } from '../P5 Programme/buddy-kit/client/city-common/metrics.js';

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
