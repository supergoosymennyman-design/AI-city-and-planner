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
  // A city whose buildings are all genuinely road-adjacent + covered + quiet:
  // the optimizer should find nothing worth changing.
  const raw = {
    version: 2, scaleMeters: 2000,
    roads: [
      { points: [[100, 1000], [1900, 1000]], width: 14, class: 'primary' },
      { points: [[1000, 100], [1000, 1900]], width: 14, class: 'primary' },
    ],
    parks: [{ cx: 800, cz: 800, radius: 80 }, { cx: 1300, cz: 1300, radius: 80 }],
    buildings: [
      { type: 'city_central', pos: [1000, 1000], footprint: [28, 28], height: 100 },
      // homes on the crossing roads, near services + parks
      { type: 'housing', pos: [960, 1000], footprint: [20, 20], height: 24 },
      { type: 'housing', pos: [1040, 1000], footprint: [20, 20], height: 24 },
      { type: 'school', pos: [1000, 960], footprint: [26, 24], height: 20 },
      { type: 'hospital', pos: [1000, 1040], footprint: [30, 26], height: 34 },
      { type: 'shop', pos: [940, 1000], footprint: [32, 32], height: 26 },
      { type: 'office', pos: [1060, 1000], footprint: [20, 20], height: 40 },
    ],
  };
  const layout = sanitizeLayout(raw);
  const before = computeMetrics(layout);
  const { layout: out, diff } = optimizeLayout(layout, {}, 42);
  assert.ok(before.accessibility >= 0.9, 'fixture should be road-adjacent');
  assert.ok(before.coverage >= 0.9, 'fixture should be covered');
  assert.equal(diff.length, 0, 'a balanced city should need no changes');
  assert.equal(out.buildings.length, layout.buildings.length);
  assert.ok(validateLayout(out).ok);
});

test('road-poor city: accessibility and score materially improve (not 1-tweak)', () => {
  // Buildings clustered far from the only road — the classic "so far from
  // optimal" case. The optimizer must move them closer (not just add a park).
  const raw = {
    version: 2, scaleMeters: 2000,
    roads: [{ points: [[100, 1900], [1900, 1900]], width: 14, class: 'primary' }],
    parks: [],
    buildings: [
      { type: 'housing', pos: [120, 120], footprint: [20, 20], height: 24 },
      { type: 'housing', pos: [140, 140], footprint: [20, 20], height: 24 },
      { type: 'housing', pos: [160, 120], footprint: [20, 20], height: 24 },
      { type: 'housing', pos: [120, 160], footprint: [20, 20], height: 24 },
      { type: 'school', pos: [300, 140], footprint: [26, 24], height: 20 },
      { type: 'hospital', pos: [340, 140], footprint: [30, 26], height: 34 },
      { type: 'power', pos: [150, 150], footprint: [24, 24], height: 44 },
      { type: 'city_central', pos: [1800, 120], footprint: [28, 28], height: 100 },
    ],
  };
  const layout = sanitizeLayout(raw);
  const before = computeMetrics(layout);
  const { layout: out, diff, after } = optimizeLayout(layout, {}, 1);
  const m = computeMetrics(out);
  assert.ok(before.accessibility < 0.2, 'fixture should be road-poor');
  assert.ok(m.accessibility > before.accessibility + 0.2,
    `accessibility should materially improve (${(before.accessibility * 100).toFixed(0)} -> ${(m.accessibility * 100).toFixed(0)}%)`);
  assert.ok(after.score > before.score + 15, 'score should materially improve');
  const moves = diff.filter((d) => d.action === 'move');
  assert.ok(moves.length >= 3, 'should move several stranded buildings, not one');
  assert.ok(validateLayout(out).ok);
});

test('noisy-near-homes city: zoning materially improves (noisy building moved)', () => {
  const raw = {
    version: 2, scaleMeters: 2000,
    roads: [{ points: [[100, 1000], [1900, 1000]], width: 14, class: 'primary' }],
    parks: [],
    buildings: [
      { type: 'city_central', pos: [1000, 1000], footprint: [28, 28], height: 100 },
      { type: 'housing', pos: [400, 1000], footprint: [20, 20], height: 24 },
      { type: 'housing', pos: [600, 1000], footprint: [20, 20], height: 24 },
      { type: 'power', pos: [410, 1000], footprint: [24, 24], height: 44 },   // noisy next to homes
    ],
  };
  const layout = sanitizeLayout(raw);
  const before = computeMetrics(layout);
  const { layout: out, diff } = optimizeLayout(layout, {}, 7);
  const m = computeMetrics(out);
  assert.ok(before.zoning < 0.8, 'fixture should have a zoning conflict');
  assert.ok(m.zoning > before.zoning + 0.1, `zoning should improve (${(before.zoning * 100).toFixed(0)} -> ${(m.zoning * 100).toFixed(0)}%)`);
  assert.ok(diff.some((d) => d.action === 'move' && NOISY.has(d.what)), 'the noisy building should be moved');
  assert.ok(validateLayout(out).ok);
});

test('clustered-specials city: spread improves (specials moved apart, none removed)', () => {
  const raw = {
    version: 2, scaleMeters: 2000,
    roads: [
      { points: [[100, 1000], [1900, 1000]], width: 14, class: 'primary' },
      { points: [[1000, 100], [1000, 1900]], width: 14, class: 'primary' },
    ],
    parks: [{ cx: 600, cz: 600, radius: 70 }],
    buildings: [
      { type: 'city_central', pos: [1000, 1000], footprint: [28, 28], height: 100 },
      { type: 'finance_tower', pos: [1000, 1030], footprint: [24, 24], height: 80 },
      { type: 'treasury', pos: [1000, 1060], footprint: [22, 22], height: 50 },
      { type: 'sentiment_lab', pos: [1000, 1090], footprint: [22, 22], height: 45 },
      { type: 'health', pos: [1000, 1120], footprint: [24, 20], height: 42 },
      { type: 'housing', pos: [700, 700], footprint: [20, 20], height: 24 },
      { type: 'housing', pos: [1300, 700], footprint: [20, 20], height: 24 },
      { type: 'school', pos: [700, 900], footprint: [26, 24], height: 20 },
      { type: 'hospital', pos: [1300, 900], footprint: [30, 26], height: 34 },
    ],
  };
  const layout = sanitizeLayout(raw);
  const before = computeMetrics(layout);
  const { layout: out, diff } = optimizeLayout(layout, {}, 5);
  const m = computeMetrics(out);
  assert.ok(before.spread < 0.2, 'fixture should have clustered specials');
  assert.ok(m.spread > before.spread + 0.2, `spread should improve (${(before.spread * 100).toFixed(0)} -> ${(m.spread * 100).toFixed(0)}%)`);
  assert.ok(m.score > before.score, `score should improve (${before.score} -> ${m.score})`);
  // Specials never removed — count of each type preserved.
  for (const b of layout.buildings.filter((x) => SPECIAL_SET.has(x.type))) {
    const inC = layout.buildings.filter((x) => x.type === b.type).length;
    const outC = out.buildings.filter((x) => x.type === b.type).length;
    assert.equal(outC, inC, `special ${b.type} count changed`);
  }
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

test('random layouts: specials are never removed', () => {
  for (const seed of SEEDS) {
    const layout = sanitizeLayout(randomLayout(seed * 7919));
    const { layout: out } = optimizeLayout(layout, {}, seed * 104729);
    const inS = layout.buildings.filter((b) => SPECIAL_SET.has(b.type));
    const outS = out.buildings.filter((b) => SPECIAL_SET.has(b.type));
    for (const b of inS) {
      const inCount = inS.filter((x) => x.type === b.type).length;
      const outCount = outS.filter((x) => x.type === b.type).length;
      assert.ok(outCount >= inCount, `seed ${seed}: special ${b.type} removed`);
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
