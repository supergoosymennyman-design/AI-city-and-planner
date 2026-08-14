// tests/optimizer.test.mjs — property tests for the 2D city optimizer.
//
// The optimizer is the most safety-critical piece of the planner (it rewrites
// the student's city). These tests pin its invariants so a future change can't
// silently make cities worse, break roads, or delete mission buildings.
//
// Run: node --test tests/optimizer.test.mjs   (from the repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { optimizeLayout, ratioTargets } from '../P5 Programme/buddy-kit/client/city-common/optimize.js';
import { computeMetrics } from '../P5 Programme/buddy-kit/client/city-common/metrics.js';
import { validateLayout, sanitizeLayout } from '../P5 Programme/buddy-kit/client/city-common/layout.js';
import { specialKeys } from '../P5 Programme/buddy-kit/client/city-common/catalog.js';

const NOISY = new Set(['power', 'traffic_lab', 'traffic_emergency', 'delivery', 'recycling']);
const SPECIAL_SET = new Set(specialKeys());

/** Deterministic PRNG (mulberry32) so the suite is reproducible. */
function rng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Build a random-but-valid layout from a seed (never duplicates positions). */
function randomLayout(seed) {
  const r = rng(seed);
  const types = [...specialKeys(), 'housing', 'housing', 'housing',
    'school', 'hospital', 'shop', 'office', 'library', 'fire', 'police', 'stadium'];
  const buildings = [];
  const used = new Set();
  const n = 3 + Math.floor(r() * 30);
  for (let i = 0; i < n; i++) {
    let pos;
    let guard = 0;
    do {
      pos = [Math.round(r() * 1800 + 100), Math.round(r() * 1800 + 100)];
      guard++;
    } while (used.has(pos.join(',')) && guard < 50);
    used.add(pos.join(','));
    buildings.push({
      type: types[Math.floor(r() * types.length)],
      pos,
      footprint: [18 + Math.floor(r() * 14), 18 + Math.floor(r() * 14)],
      height: 15 + Math.floor(r() * 50),
    });
  }
  const roads = [];
  const nr = 1 + Math.floor(r() * 3);
  for (let i = 0; i < nr; i++) {
    const y = Math.round(r() * 1600 + 200);
    roads.push({ points: [[100, y], [1900, y]], width: 14, class: 'primary' });
  }
  const parks = [];
  const np = Math.floor(r() * 3);
  for (let i = 0; i < np; i++) {
    parks.push({ cx: Math.round(r() * 1800 + 100), cz: Math.round(r() * 1800 + 100), radius: 50 + Math.floor(r() * 50) });
  }
  return { version: 2, scaleMeters: 2000, roads, parks, buildings };
}

// ── Fixed edge cases ────────────────────────────────────────────────────
test('empty-ish layout is safe (no throw, valid, score non-decreasing)', () => {
  const raw = { version: 2, scaleMeters: 2000, roads: [], parks: [], buildings: [] };
  const layout = sanitizeLayout(raw);
  const res = optimizeLayout(layout, {}, 1);
  assert.ok(validateLayout(res.layout).ok);
  assert.ok(computeMetrics(res.layout).score >= computeMetrics(layout).score - 1e-9);
});

test('already-well-balanced city stays untouched', () => {
  const raw = {
    version: 2, scaleMeters: 2000,
    roads: [
      { points: [[100, 1000], [1900, 1000]], width: 14, class: 'primary' },
      { points: [[1000, 100], [1000, 1900]], width: 14, class: 'primary' },
    ],
    parks: [{ cx: 800, cz: 800, radius: 80 }, { cx: 1300, cz: 1300, radius: 80 }],
    buildings: [
      { type: 'city_central', pos: [1000, 1000], footprint: [28, 28], height: 100 },
      { type: 'housing', pos: [700, 700], footprint: [20, 20], height: 24 },
      { type: 'housing', pos: [1300, 1300], footprint: [20, 20], height: 24 },
      { type: 'school', pos: [900, 700], footprint: [26, 24], height: 20 },
      { type: 'hospital', pos: [1100, 1300], footprint: [30, 26], height: 34 },
      { type: 'shop', pos: [700, 1300], footprint: [32, 32], height: 26 },
      { type: 'office', pos: [1300, 700], footprint: [20, 20], height: 40 },
    ],
  };
  const layout = sanitizeLayout(raw);
  const { layout: out, diff } = optimizeLayout(layout, {}, 42);
  assert.equal(diff.length, 0, 'a balanced city should need no changes');
  assert.equal(out.buildings.length, layout.buildings.length);
  assert.ok(validateLayout(out).ok);
});

// ── Property tests over random layouts ─────────────────────────────────
const SEEDS = [3, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97, 101, 103];

test('random layouts: output validates + score never decreases', () => {
  for (const seed of SEEDS) {
    const layout = sanitizeLayout(randomLayout(seed * 7919));
    const before = computeMetrics(layout);
    const res = optimizeLayout(layout, {}, seed * 104729);
    const v = validateLayout(res.layout);
    assert.ok(v.ok, `seed ${seed}: ${v.errors[0]}`);
    const after = computeMetrics(res.layout);
    assert.ok(after.score >= before.score - 1e-9, `seed ${seed}: score ${before.score}->${after.score} decreased`);
    assert.equal(after.score, res.after.score, 'returned after matches recomputed');
  }
});

test('random layouts: roads are byte-identical', () => {
  for (const seed of SEEDS) {
    const layout = sanitizeLayout(randomLayout(seed * 7919));
    const { layout: out } = optimizeLayout(layout, {}, seed * 104729);
    assert.equal(JSON.stringify(layout.roads), JSON.stringify(out.roads), `seed ${seed}: roads changed`);
  }
});

test('random layouts: specials are never removed and non-noisy specials never move', () => {
  for (const seed of SEEDS) {
    const layout = sanitizeLayout(randomLayout(seed * 7919));
    const { layout: out } = optimizeLayout(layout, {}, seed * 104729);
    const inS = layout.buildings.filter((b) => SPECIAL_SET.has(b.type));
    const outS = out.buildings.filter((b) => SPECIAL_SET.has(b.type));
    for (const b of inS) {
      const inCount = inS.filter((x) => x.type === b.type).length;
      const outCount = outS.filter((x) => x.type === b.type).length;
      assert.ok(outCount >= inCount, `seed ${seed}: special ${b.type} removed`);
      if (!NOISY.has(b.type)) {
        assert.ok(
          outS.some((x) => x.type === b.type && Math.hypot(x.pos[0] - b.pos[0], x.pos[1] - b.pos[1]) < 0.1),
          `seed ${seed}: non-noisy special ${b.type} moved`
        );
      }
    }
  }
});

test('random layouts: no NEW overlaps introduced', () => {
  for (const seed of SEEDS) {
    const layout = sanitizeLayout(randomLayout(seed * 7919));
    const { layout: out } = optimizeLayout(layout, {}, seed * 104729);
    // The optimizer must never introduce an overlap that wasn't there before.
    // (A pre-existing overlap between two NON-NOISY SPECIALS is deliberately
    // left alone — the hard rule says never move non-noisy specials.)
    const inOverlaps = overlapPairs(layout);
    const outOverlaps = overlapPairs(out);
    for (const pair of outOverlaps) {
      assert.ok(
        inOverlaps.some((p) => p[0] === pair[0] && p[1] === pair[1]),
        `seed ${seed}: NEW overlap ${pair[0]}+${pair[1]} introduced`
      );
    }
  }
});

/** List of overlapping type pairs (sorted) in a layout. */
function overlapPairs(layout) {
  const pairs = [];
  const bs = layout.buildings || [];
  for (let i = 0; i < bs.length; i++) {
    for (let j = i + 1; j < bs.length; j++) {
      const a = bs[i], b = bs[j];
      const fa = a.footprint || [20, 20], fb = b.footprint || [20, 20];
      const ox = Math.abs(a.pos[0] - b.pos[0]) < (fa[0] + fb[0]) / 2 + 4;
      const oz = Math.abs(a.pos[1] - b.pos[1]) < (fa[1] + fb[1]) / 2 + 4;
      if (ox && oz) pairs.push([a.type, b.type].sort().join('+'));
    }
  }
  return pairs.sort();
}

test('random layouts: deterministic for a given seed', () => {
  for (const seed of SEEDS) {
    const layout = sanitizeLayout(randomLayout(seed * 7919));
    const a = optimizeLayout(layout, {}, seed * 104729);
    const b = optimizeLayout(layout, {}, seed * 104729);
    assert.equal(JSON.stringify(a.layout), JSON.stringify(b.layout), `seed ${seed}: nondeterministic`);
    assert.equal(JSON.stringify(a.diff), JSON.stringify(b.diff), `seed ${seed}: nondeterministic diff`);
  }
});

test('random layouts: bounded runtime (< 500ms each)', () => {
  for (const seed of SEEDS) {
    const layout = sanitizeLayout(randomLayout(seed * 7919));
    const t0 = performance.now();
    optimizeLayout(layout, {}, seed * 104729);
    const ms = performance.now() - t0;
    assert.ok(ms < 500, `seed ${seed}: took ${ms.toFixed(0)}ms`);
  }
});

test('ratioTargets is sane for a range of housing counts', () => {
  for (const H of [0, 1, 5, 10, 12, 20, 50]) {
    const t = ratioTargets(H);
    assert.ok(Number.isInteger(t.school) && t.school >= 1);
    assert.ok(Number.isInteger(t.hospital) && t.hospital >= 1);
    assert.ok(Number.isInteger(t.library) && t.library >= 1);
    assert.ok(Number.isInteger(t.fire) && t.fire >= 1);
    assert.ok(Number.isInteger(t.police) && t.police >= 1);
  }
});
