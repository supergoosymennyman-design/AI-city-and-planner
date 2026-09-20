// tests/layout.test.mjs — layout schema validation + sanitization.
//
// Run: node --test tests/layout.test.mjs   (from the repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUT_VERSION, DEFAULT_SCALE, defaultLayout, validateLayout, sanitizeLayout } from '../P5 Programme/buddy-kit/client/city-common/layout.js';

test('defaultLayout is valid and versioned', () => {
  const l = defaultLayout();
  assert.equal(l.version, LAYOUT_VERSION);
  const r = validateLayout(l);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
});

test('validateLayout rejects malformed inputs without throwing', () => {
  assert.equal(validateLayout(null).ok, false);
  assert.equal(validateLayout({}).ok, false);
  assert.equal(validateLayout({ version: 999 }).ok, false, 'unknown version should fail');
});

test('sanitizeLayout recovers a safe default from garbage', () => {
  const s = sanitizeLayout(null);
  assert.equal(s.version, LAYOUT_VERSION);
  assert.equal(typeof s.scaleMeters, 'number');
  const r = validateLayout(s);
  assert.equal(r.ok, true);
});

test('default layout scale is the documented default', () => {
  assert.equal(DEFAULT_SCALE, 2000);
});

test('validateLayout accepts an intentionally disconnected road network', () => {
  // Product rule: a child may deliberately build roads that do not touch. The
  // planner only ever ADVISES (join suggestion + no-cars hint); nothing here
  // may turn connectivity into a blocking error.
  const raw = {
    ...defaultLayout(),
    roads: [
      { points: [[100, 100], [300, 100]], width: 7, class: 'residential' },
      { points: [[1200, 1200], [1300, 1300]], width: 7, class: 'residential' },
    ],
  };
  const r = validateLayout(raw);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
});

test('sanitization preserves explicit true/false locks and duplicate saved instances', () => {
  const buildings = [true, false, undefined].map((locked) => ({
    type: 'traffic_lab', pos: [500, 500], footprint: [31, 29], height: 47,
    ...(locked === undefined ? {} : { locked }),
  }));
  const raw = { ...defaultLayout(), buildings };
  assert.deepEqual(sanitizeLayout(raw).buildings, buildings);
  assert.deepEqual(raw.buildings, buildings);
});

// ── densifyLayout is geometry-preserving (the 2D planner must not lie) ─────
import { densifyLayout } from '../P5 Programme/buddy-kit/client/city-common/layout.js';

test('densifyLayout leaves every building, road and park byte-identical', () => {
  const layout = sanitizeLayout({
    version: 2, scaleMeters: 2000,
    roads: [
      { points: [[150, 1000], [1850, 1000]], width: 14, class: 'primary' },
      { points: [[700, 400], [900, 700], [1200, 900]], width: 10, class: 'secondary' },
    ],
    parks: [{ cx: 800, cz: 800, radius: 70 }],
    buildings: [
      { type: 'housing', pos: [600, 1030], footprint: [20, 20], height: 24 },
      { type: 'school', pos: [900, 1030], footprint: [26, 24], height: 20 },
      { type: 'city_central', pos: [1200, 1030], footprint: [28, 28], height: 100 },
    ],
  });
  const snapshot = JSON.stringify(layout);
  const dense = densifyLayout(layout);
  assert.equal(JSON.stringify(dense.layout), snapshot, 'geometry must be untouched');
  assert.equal(dense.grow, 1, 'no champion scale-up');
  for (const k of ['minX', 'minZ', 'maxX', 'maxZ']) {
    assert.ok(Number.isFinite(dense.bounds[k]), `bounds.${k} is finite`);
  }
  assert.ok(dense.bounds.minX <= dense.bounds.maxX && dense.bounds.minZ <= dense.bounds.maxZ);
});

test('densifyLayout never moves a building onto a road (it moves nothing at all)', async () => {
  const { roadBands, rectRoadClearance } = await import('../P5 Programme/buddy-kit/client/city-common/road-geometry.js');
  const layout = sanitizeLayout({
    version: 2, scaleMeters: 2000,
    roads: [{ points: [[100, 1000], [1900, 1000]], width: 14, class: 'primary' }],
    parks: [],
    buildings: [
      { type: 'housing', pos: [400, 1030], footprint: [20, 20], height: 24 },  // 30 m off centreline
      { type: 'shop', pos: [800, 1040], footprint: [32, 32], height: 26 },
    ],
  });
  const before = layout.buildings.map((b) => rectRoadClearance(b.pos[0], b.pos[1], b.footprint, roadBands(layout.roads)));
  const dense = densifyLayout(layout).layout;
  const after = dense.buildings.map((b) => rectRoadClearance(b.pos[0], b.pos[1], b.footprint, roadBands(dense.roads)));
  assert.deepEqual(after, before, 'road gaps are unchanged by densify');
});
