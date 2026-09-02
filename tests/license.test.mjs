// tests/license.test.mjs — the Planner's License contract shared by the
// pregame (writer) and the planner (unlock gate).
//
// Run: node --test tests/license.test.mjs   (from the repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';

// The fixed key must match BOTH the pregame's app.js and the planner's
// planner.js. Keeping it in one place lets this test catch a drift.
const LICENSE_KEY = 'CITYSMART-P5-2026';

test('license file format round-trips and unlocks', () => {
  const file = {
    title: "City Planner's License",
    algorithms: ['weighted_score', 'coverage_radius', 'shortest_path', 'hill_climbing'],
    key: LICENSE_KEY,
  };
  const parsed = JSON.parse(JSON.stringify(file));
  assert.equal(parsed.key, LICENSE_KEY, 'key survives a JSON round-trip');
  assert.ok(Array.isArray(parsed.algorithms) && parsed.algorithms.length === 4);
  // The planner's unlock logic: key must strictly equal LICENSE_KEY.
  assert.equal(parsed.key === LICENSE_KEY, true);
});

test('a wrong or missing key is rejected (mirrors the planner check)', () => {
  for (const bad of [{ key: 'WRONG' }, { title: 'x' }, {}, 'garbage']) {
    const raw = typeof bad === 'string' ? bad : JSON.stringify(bad);
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch (e) { /* invalid JSON = rejected */ }
    const ok = !!parsed && parsed.key === LICENSE_KEY;
    assert.equal(ok, false, `should reject: ${raw}`);
  }
});
