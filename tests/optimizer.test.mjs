// tests/optimizer.test.mjs — property tests for the 2D city optimizer.
//
// The optimizer is the most safety-critical piece of the planner (it rewrites
// the student's city). These tests pin its invariants so a future change can't
// silently make cities worse, break roads, or delete mission buildings.
//
// Run: node --test tests/optimizer.test.mjs   (from the repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { optimizeLayout, preservesExistingWork } from '../P5 Programme/buddy-kit/client/city-common/optimize.js';
import { computeMetrics, ratioTargets } from '../P5 Programme/buddy-kit/client/city-common/metrics.js';
import { validateLayout, sanitizeLayout, densifyLayout } from '../P5 Programme/buddy-kit/client/city-common/layout.js';
import { specialKeys, catalogType } from '../P5 Programme/buddy-kit/client/city-common/catalog.js';
import { proposeMoves, applyMove, stableSeed } from '../P5 Programme/buddy-kit/client/city-common/optimize.js';
import { computeWalkReach } from '../P5 Programme/buddy-kit/client/city-common/walkability.js';
import { onRoadBuildingIndices, roadBands, rectRoadClearance, ROAD_CLEARANCE_MARGIN } from '../P5 Programme/buddy-kit/client/city-common/road-geometry.js';

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

test('optimizer promises the same road-aware score the planner displays after Apply', () => {
  const layout = sanitizeLayout({
    version: 2, scaleMeters: 2000,
    roads: [{ points: [[100, 1000], [1900, 1000]], width: 14, class: 'primary' }],
    parks: [],
    buildings: [
      { type: 'housing', pos: [600, 1000], footprint: [20, 20], height: 24 },
      { type: 'school', pos: [1300, 1000], footprint: [26, 24], height: 20 },
    ],
  });
  const result = optimizeLayout(layout, {}, 20260913);
  const displayedBefore = computeMetrics(layout, undefined, null, computeWalkReach(layout)).score;
  const displayedAfter = computeMetrics(result.layout, undefined, null, computeWalkReach(result.layout)).score;
  assert.equal(result.before.score, displayedBefore, 'shown plan start equals current UI score');
  assert.equal(result.after.score, displayedAfter, 'shown plan result equals UI score after Apply');
});

test('already-well-balanced city: only the mandatory road fix, nothing else', () => {
  // A city whose homes are near all 5 required services + utilities, spread and
  // quiet. The buildings here sit ON the crossing (as they always did); the one
  // legitimate change is the hard rule that a building may not sit on a road.
  // The optimizer must make NO other change to such a balanced city.
  const raw = {
    version: 2, scaleMeters: 2000,
    roads: [
      { points: [[100, 1000], [1900, 1000]], width: 14, class: 'primary' },
      { points: [[1000, 100], [1000, 1900]], width: 14, class: 'primary' },
    ],
    parks: [{ cx: 800, cz: 800, radius: 80 }, { cx: 1300, cz: 1300, radius: 80 }],
    buildings: [
      { type: 'city_central', pos: [1000, 1000], footprint: [28, 28], height: 100 },
      // homes on the crossing, near every service + utility
      { type: 'housing', pos: [960, 1000], footprint: [20, 20], height: 24 },
      { type: 'housing', pos: [1040, 1000], footprint: [20, 20], height: 24 },
      { type: 'school', pos: [1000, 950], footprint: [26, 24], height: 20 },
      { type: 'shop', pos: [940, 1000], footprint: [32, 32], height: 26 },
      { type: 'hospital', pos: [1000, 1050], footprint: [30, 26], height: 34 },
      { type: 'fire', pos: [1000, 920], footprint: [22, 20], height: 16 },
      { type: 'police', pos: [1000, 1080], footprint: [22, 20], height: 18 },
      { type: 'water', pos: [1000, 700], footprint: [24, 24], height: 40 },
      { type: 'power', pos: [1000, 1300], footprint: [24, 24], height: 44 },
      { type: 'bus', pos: [760, 1000], footprint: [26, 20], height: 38 },
      { type: 'office', pos: [1060, 1000], footprint: [20, 20], height: 40 },
    ],
  };
  const layout = sanitizeLayout(raw);
  const before = computeMetrics(layout);
  const { layout: out, diff } = optimizeLayout(layout, {}, 42);
  assert.ok(before.accessibility >= 0.9, 'fixture should be road-adjacent');
  assert.ok(before.coverage >= 0.9, 'fixture should have all services near homes');
  assert.ok(before.utilities >= 0.9, 'fixture should have utilities near homes');
  assert.ok(diff.length > 0, 'the on-road buildings must be moved off the roads');
  assert.ok(diff.every((d) => d.kind === 'off-road'),
    `a balanced city should only get road fixes (got ${diff.map((d) => d.action + ' ' + d.what + (d.kind ? '/' + d.kind : '')).join(', ')})`);
  assert.equal(out.buildings.length, layout.buildings.length);
  assert.ok(validateLayout(out).ok);
  assert.equal(JSON.stringify(out.roads), JSON.stringify(layout.roads), 'roads must stay byte-identical');
  assert.ok(computeMetrics(out).score >= before.score - 1e-9, 'score must not decrease');
  // The invariant actually holds after Optimise: no UNPROTECTED building on a road.
  const onRoadUnprotected = onRoadBuildingIndices(out)
    .filter((i) => { const b = out.buildings[i]; return !(b.locked || SPECIAL_SET.has(b.type)); });
  assert.deepEqual(onRoadUnprotected, [], 'no unprotected building may remain on a road');
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

test('park-only homes: optimizer adds missing services + utilities, not "already good"', () => {
  // The bug that started this: homes near a park alone read as 100% covered,
  // so the optimizer said "already good". Now a park is only a half-weight
  // bonus — homes still need school/shop/hospital/fire/police + utilities.
  const raw = {
    version: 2, scaleMeters: 2000,
    roads: [{ points: [[100, 1000], [1900, 1000]], width: 14, class: 'primary' }],
    parks: [{ cx: 1000, cz: 1000, radius: 70 }],
    buildings: [
      { type: 'city_central', pos: [1000, 1000], footprint: [28, 28], height: 100 },
      { type: 'housing', pos: [900, 1000], footprint: [20, 20], height: 24 },
      { type: 'housing', pos: [1100, 1000], footprint: [20, 20], height: 24 },
      { type: 'housing', pos: [1000, 900], footprint: [20, 20], height: 24 },
      { type: 'housing', pos: [1000, 1100], footprint: [20, 20], height: 24 },
    ],
  };
  const layout = sanitizeLayout(raw);
  const before = computeMetrics(layout);
  const { layout: out, diff } = optimizeLayout(layout, {}, 1);
  const m = computeMetrics(out);
  assert.ok(before.coverage < 0.4, 'park alone should NOT satisfy coverage');
  assert.ok(m.coverage > before.coverage + 0.2, `coverage should improve (${(before.coverage * 100).toFixed(0)} -> ${(m.coverage * 100).toFixed(0)}%)`);
  assert.ok(diff.some((d) => d.action === 'add' && d.what === 'school'), 'should add a school');
  assert.ok(diff.some((d) => d.action === 'add' && d.what === 'shop'), 'should add a shop');
  assert.ok(diff.some((d) => d.action === 'add' && d.what === 'hospital'), 'should add a hospital');
  assert.ok(diff.length >= 3, 'should make several additions, not be "already good"');
  assert.ok(validateLayout(out).ok);
});

test('utilities far away: propose additions while preserving the existing water building', () => {
  const raw = {
    version: 2, scaleMeters: 2000,
    roads: [
      { points: [[100, 1000], [1900, 1000]], width: 14, class: 'primary' },
      { points: [[1000, 100], [1000, 1900]], width: 14, class: 'primary' },
    ],
    parks: [],
    buildings: [
      { type: 'city_central', pos: [1000, 1000], footprint: [28, 28], height: 100 },
      { type: 'housing', pos: [900, 1000], footprint: [20, 20], height: 24 },
      { type: 'housing', pos: [1100, 1000], footprint: [20, 20], height: 24 },
      { type: 'school', pos: [1000, 950], footprint: [26, 24], height: 20 },
      { type: 'shop', pos: [940, 1000], footprint: [32, 32], height: 26 },
      { type: 'hospital', pos: [1000, 1050], footprint: [30, 26], height: 34 },
      { type: 'fire', pos: [880, 1000], footprint: [22, 20], height: 16 },
      { type: 'police', pos: [1120, 1000], footprint: [22, 20], height: 18 },
      // water is 700m away from homes — clearly too far to serve them
      { type: 'water', pos: [300, 1700], footprint: [24, 24], height: 40 },
    ],
  };
  const layout = sanitizeLayout(raw);
  const before = computeMetrics(layout);
  const { layout: out, diff } = optimizeLayout(layout, {}, 5);
  const m = computeMetrics(out);
  const water = out.buildings.find((b) => b.type === 'water');
  assert.ok(water, 'water should never be removed');
  assert.ok(before.utilities < 1, 'fixture should have a utility gap');
  assert.ok(m.utilities > before.utilities + 1e-9, `utilities should improve (${(before.utilities * 100).toFixed(0)} -> ${(m.utilities * 100).toFixed(0)}%)`);
  assert.ok(preservesExistingWork(layout, out));
  assert.ok(diff.some((d) => d.action === 'add' && d.what === 'water'), 'additional water is an explicit proposal');
  assert.ok(validateLayout(out).ok);
});

test('noisy-near-homes city: retain the noisy special and report remaining conflict', () => {
  const raw = {
    version: 2, scaleMeters: 2000,
    roads: [{ points: [[100, 1000], [1900, 1000]], width: 14, class: 'primary' }],
    parks: [],
    buildings: [
      { type: 'city_central', pos: [1000, 1000], footprint: [28, 28], height: 100 },
      { type: 'housing', pos: [400, 1000], footprint: [20, 20], height: 24 },
      { type: 'housing', pos: [600, 1000], footprint: [20, 20], height: 24 },
      { type: 'delivery', pos: [410, 1000], footprint: [26, 22], height: 44 },   // noisy next to homes
    ],
  };
  const layout = sanitizeLayout(raw);
  const before = computeMetrics(layout);
  const { layout: out, diff } = optimizeLayout(layout, {}, 7);
  const m = computeMetrics(out);
  assert.ok(before.zoning < 0.8, 'fixture should have a zoning conflict');
  assert.ok(preservesExistingWork(layout, out));
  assert.ok(m.goalProblems.peaceful.length > 0, 'remaining conflict is visible');
  assert.ok(!diff.some((d) => d.action === 'move' && NOISY.has(d.what)));
  assert.ok(validateLayout(out).ok);
});

test('power-next-to-home: existing power stays exactly in place', () => {
  const raw = {
    version: 2, scaleMeters: 2000,
    roads: [{ points: [[100, 1000], [1900, 1000]], width: 14, class: 'primary' }],
    parks: [],
    buildings: [
      { type: 'city_central', pos: [1000, 1000], footprint: [28, 28], height: 100 },
      { type: 'housing', pos: [400, 1000], footprint: [20, 20], height: 24 },
      { type: 'power', pos: [410, 1000], footprint: [24, 24], height: 44 },     // 10m from home
    ],
  };
  const layout = sanitizeLayout(raw);
  const before = computeMetrics(layout);
  const { layout: out, diff } = optimizeLayout(layout, {}, 11);
  const m = computeMetrics(out);
  assert.ok(preservesExistingWork(layout, out));
  // Existing power is preserved.
  assert.ok(out.buildings.some((b) => b.type === 'power'), 'power should never be removed');
  // Other allowed changes must not worsen zoning in this fixture.
  assert.ok(m.zoning >= before.zoning, `zoning should not regress (${(before.zoning * 100).toFixed(0)} -> ${(m.zoning * 100).toFixed(0)}%)`);
  assert.ok(validateLayout(out).ok);
});

test('clustered-specials city: preserve the cluster while improving through allowed proposals', () => {
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
  assert.ok(preservesExistingWork(layout, out));
  assert.ok(!diff.some((d) => SPECIAL_SET.has(d.what) && d.action !== 'add'));
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

test('random layouts: every existing special instance survives unchanged', () => {
  // Utilities (water/power/bus) legitimately GROW — the optimizer adds them to
  // serve homes, so they're excluded from the count-grew check.
  // All existing special instances are protected, including duplicates.
  const UTILITIES = new Set(['water', 'power', 'bus']);
  for (const seed of SEEDS) {
    const layout = sanitizeLayout(randomLayout(seed * 7919));
    const { layout: out } = optimizeLayout(layout, {}, seed * 104729);
    assert.ok(preservesExistingWork(layout, out));
    const inS = layout.buildings.filter((b) => SPECIAL_SET.has(b.type));
    const outS = out.buildings.filter((b) => SPECIAL_SET.has(b.type));
    for (const b of inS) {
      const inCount = inS.filter((x) => x.type === b.type).length;
      const outCount = outS.filter((x) => x.type === b.type).length;
      // Every special keeps at least one copy.
      assert.ok(outCount >= 1, `seed ${seed}: special ${b.type} vanished entirely`);
      // Mission specials never grow; utilities may (coverage-driven adds).
      if (!UTILITIES.has(b.type)) {
        assert.equal(outCount, inCount, `seed ${seed}: special ${b.type} count grew`);
        if (inCount === 1) assert.equal(outCount, 1, `seed ${seed}: unique special ${b.type} removed`);
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

// ── Adversarial / robustness fixtures ──────────────────────────────────
test('zero homes + buildings: low score, "add homes" hint, optimizer adds housing', () => {
  const raw = {
    version: 2, scaleMeters: 2000,
    roads: [{ points: [[100, 1000], [1900, 1000]], width: 14, class: 'primary' }],
    parks: [],
    buildings: [
      { type: 'finance_tower', pos: [500, 1000], footprint: [24, 24], height: 80 },
      { type: 'treasury', pos: [700, 1000], footprint: [22, 22], height: 50 },
      { type: 'sentiment_lab', pos: [900, 1000], footprint: [22, 22], height: 45 },
      { type: 'city_central', pos: [1100, 1000], footprint: [28, 28], height: 100 },
    ],
  };
  const layout = sanitizeLayout(raw);
  const m = computeMetrics(layout);
  assert.ok(m.score < 60, `zero-home city should score low (got ${m.score})`);
  assert.ok(m.problems.some((p) => /homes/i.test(p)), 'should hint to add homes');
  const { layout: out, diff } = optimizeLayout(layout, {}, 1);
  assert.ok(diff.some((d) => d.action === 'add' && d.what === 'housing'), 'optimizer should add housing');
  assert.ok(out.buildings.some((b) => b.type === 'housing'), 'output should contain housing');
  assert.ok(validateLayout(out).ok);
});

test('sanitizeLayout drops NaN/Infinity coords instead of poisoning', () => {
  const layout = sanitizeLayout({
    version: 2, scaleMeters: 2000, roads: [], parks: [],
    buildings: [
      { type: 'housing', pos: ['abc', 50], footprint: [20, 20], height: 24 },
      { type: 'housing', pos: [Infinity, 50], footprint: [20, 20], height: 24 },
      { type: 'school', pos: [1000, 1000], footprint: [26, 24], height: 20 },
    ],
  });
  assert.equal(layout.buildings.length, 1, 'NaN/Infinity buildings should be dropped');
  assert.ok(Number.isFinite(layout.buildings[0].pos[0]) && Number.isFinite(layout.buildings[0].pos[1]));
  const m = computeMetrics(layout);
  assert.ok(Number.isFinite(m.score), 'score must be finite after sanitize');
});

test('sanitizeLayout clamps out-of-bounds + huge park radius + negative footprint', () => {
  const layout = sanitizeLayout({
    version: 2, scaleMeters: 2000, roads: [], parks: [{ cx: 1000, cz: 1000, radius: 1e9 }],
    buildings: [
      { type: 'housing', pos: [-5000, 99999], footprint: [-20, 0], height: 24 },
    ],
  });
  const b = layout.buildings[0];
  assert.ok(b.pos[0] >= 0 && b.pos[0] <= 2000 && b.pos[1] >= 0 && b.pos[1] <= 2000, 'pos clamped to bounds');
  // negative/zero footprint is dropped -> catalog default applies downstream
  assert.ok(b.footprint === undefined || (b.footprint[0] > 0 && b.footprint[1] > 0), 'footprint repaired or defaulted');
  assert.ok(layout.parks[0].radius <= 2000, 'park radius clamped');
  assert.ok(validateLayout(layout).ok);
});

test('zero roads: accessibility is 0, not NaN', () => {
  const layout = sanitizeLayout({
    version: 2, scaleMeters: 2000, roads: [], parks: [],
    buildings: [
      { type: 'housing', pos: [1000, 1000], footprint: [20, 20], height: 24 },
      { type: 'school', pos: [1000, 1050], footprint: [26, 24], height: 20 },
    ],
  });
  const m = computeMetrics(layout);
  assert.equal(m.accessibility, 0);
  assert.ok(Number.isFinite(m.score));
  const { layout: out } = optimizeLayout(layout, {}, 1);
  assert.ok(validateLayout(out).ok);
});

test('stacked duplicate buildings: deterministic and both identical instances preserved', () => {
  const raw = {
    version: 2, scaleMeters: 2000,
    roads: [{ points: [[100, 1000], [1900, 1000]], width: 14, class: 'primary' }],
    parks: [],
    buildings: [
      { type: 'housing', pos: [400, 1000], footprint: [20, 20], height: 24 },
      { type: 'delivery', pos: [410, 1000], footprint: [26, 22], height: 44 },
      { type: 'delivery', pos: [410, 1000], footprint: [26, 22], height: 44 },
    ],
  };
  const layout = sanitizeLayout(raw);
  const a = optimizeLayout(layout, {}, 3);
  const b = optimizeLayout(layout, {}, 3);
  assert.equal(JSON.stringify(a.layout), JSON.stringify(b.layout), 'deterministic');
  // Both saved delivery instances remain, even at identical coordinates.
  const outDel = a.layout.buildings.filter((x) => x.type === 'delivery').length;
  assert.equal(outDel, 2, 'both duplicate deliveries retained');
  assert.ok(preservesExistingWork(layout, a.layout));
  assert.ok(validateLayout(a.layout).ok);
});

test('spread-out homes: each cluster gets its own services/utilities (no ratio cap)', () => {
  // Two homes ~2000m apart, on a grid road, no services. The old ratio cap
  // ("1 school per 10 homes") left one home permanently unserved because
  // coverage is spatial (150m). Now the optimizer adds per-cluster services.
  const raw = {
    version: 2, scaleMeters: 2000,
    roads: [
      { points: [[100, 1000], [1900, 1000]], width: 14, class: 'primary' },
      { points: [[1000, 100], [1000, 1900]], width: 14, class: 'primary' },
    ],
    parks: [],
    buildings: [
      { type: 'housing', pos: [300, 300], footprint: [20, 20], height: 24 },
      { type: 'housing', pos: [1700, 1700], footprint: [20, 20], height: 22 },
    ],
  };
  const layout = sanitizeLayout(raw);
  const { layout: out } = optimizeLayout(layout, {}, 1);
  const m = computeMetrics(out);
  assert.ok(m.coverage > 0.9, `coverage should reach ~1.0 for spread homes (got ${(m.coverage * 100).toFixed(0)}%)`);
  assert.ok(m.utilities > 0.9, `utilities should reach ~1.0 for spread homes (got ${(m.utilities * 100).toFixed(0)}%)`);
  assert.ok(out.buildings.filter((b) => b.type === 'school').length >= 2, 'should add a school per home cluster');
  assert.ok(validateLayout(out).ok);
});

test('12 traffic labs: every instance survives with its original geometry', () => {
  const buildings = [];
  for (let i = 0; i < 12; i++) {
    buildings.push({ type: 'traffic_lab', pos: [500 + (i % 4) * 40, 500 + Math.floor(i / 4) * 40], footprint: [22, 20], height: 40 });
  }
  buildings.push({ type: 'housing', pos: [1400, 1400], footprint: [20, 20], height: 24 });
  buildings.push({ type: 'housing', pos: [1440, 1440], footprint: [20, 20], height: 22 });
  const raw = {
    version: 2, scaleMeters: 2000,
    roads: [
      { points: [[150, 1000], [1850, 1000]], width: 14, class: 'primary' },
      { points: [[1000, 150], [1000, 1850]], width: 14, class: 'primary' },
    ],
    parks: [],
    buildings,
  };
  const layout = sanitizeLayout(raw);
  const before = computeMetrics(layout);
  const { layout: out, diff } = optimizeLayout(layout, {}, 1);
  const labs = out.buildings.filter((b) => b.type === 'traffic_lab').length;
  const m = computeMetrics(out);
  assert.equal(labs, 12);
  assert.ok(preservesExistingWork(layout, out));
  assert.ok(!diff.some((d) => d.action === 'remove' && d.what === 'traffic_lab'));
  assert.ok(m.score > before.score, `score should improve (${before.score} -> ${m.score})`);
  assert.ok(validateLayout(out).ok);
});

// ── Goal weights ────────────────────────────────────────────────────────
test('weights change the score: a mayor who loves peace scores a quiet city higher', () => {
  const raw = {
    version: 2, scaleMeters: 2000,
    roads: [{ points: [[100, 1000], [1900, 1000]], width: 14, class: 'primary' }],
    parks: [{ cx: 1000, cz: 1000, radius: 70 }],
    buildings: [
      { type: 'housing', pos: [900, 1000], footprint: [20, 20], height: 24 },
      { type: 'housing', pos: [1100, 1000], footprint: [20, 20], height: 24 },
      { type: 'school', pos: [1000, 950], footprint: [26, 24], height: 20 },
      { type: 'shop', pos: [940, 1000], footprint: [32, 32], height: 26 },
      { type: 'delivery', pos: [1700, 1000], footprint: [26, 22], height: 44 },   // noisy but far from homes
    ],
  };
  const layout = sanitizeLayout(raw);
  const balanced = computeMetrics(layout);
  const peaceHeavy = computeMetrics(layout, undefined, { peaceful: 0.7, happy: 0.1, walkable: 0.1, spread: 0.1 });
  const happyHeavy = computeMetrics(layout, undefined, { happy: 0.7, peaceful: 0.1, walkable: 0.1, spread: 0.1 });
  assert.ok(peaceHeavy.score !== balanced.score || happyHeavy.score !== balanced.score,
    'weights should change the score');
  assert.ok(Object.keys(computeMetrics(layout).goals).length === 4, 'goals object has 4 keys');
});

test('goal weights change the optimizer objective (a green mayor gets parks added)', () => {
  const raw = {
    version: 2, scaleMeters: 2000,
    roads: [{ points: [[100, 1000], [1900, 1000]], width: 14, class: 'primary' }],
    parks: [],
    buildings: [
      { type: 'housing', pos: [900, 1000], footprint: [20, 20], height: 24 },
      { type: 'housing', pos: [1100, 1000], footprint: [20, 20], height: 24 },
      { type: 'school', pos: [1000, 950], footprint: [26, 24], height: 20 },
      { type: 'shop', pos: [940, 1000], footprint: [32, 32], height: 26 },
    ],
  };
  const layout = sanitizeLayout(raw);
  // A green mayor weights happy (parks/green) heavily — the optimizer should
  // find a park worth adding even though the balanced score barely rewards it.
  const green = { happy: 0.6, walkable: 0.15, peaceful: 0.15, spread: 0.10 };
  const res = optimizeLayout(layout, { weights: green }, 3);
  assert.ok(res.diff.some((d) => d.action === 'add_park'), 'green mayor should add a park');
  assert.ok(validateLayout(res.layout).ok);
});

test('weights: output still validates + score never decreases under a mayor', () => {
  for (const seed of [3, 11, 31, 53]) {
    const layout = sanitizeLayout(randomLayout(seed * 7919));
    const weights = { happy: 0.4, walkable: 0.2, peaceful: 0.2, spread: 0.2 };
    const before = computeMetrics(layout, undefined, weights);
    const res = optimizeLayout(layout, { weights }, seed * 104729);
    assert.ok(validateLayout(res.layout).ok, `seed ${seed}`);
    const after = computeMetrics(res.layout, undefined, weights);
    assert.ok(after.score >= before.score - 1e-9, `seed ${seed}: weighted score decreased`);
    // Roads still sacred under weights.
    assert.equal(JSON.stringify(layout.roads), JSON.stringify(res.layout.roads), `seed ${seed}: roads changed`);
  }
});

// ── Explore strategy (multi-restart) ────────────────────────────────────
test('explore: never worse than greedy on the same seed, often better', () => {
  let better = 0;
  for (const seed of SEEDS) {
    const layout = sanitizeLayout(randomLayout(seed * 7919));
    const greedy = optimizeLayout(layout, {}, seed * 104729);
    const explore = optimizeLayout(layout, { strategy: 'explore' }, seed * 104729);
    assert.equal(explore.strategy, 'explore');
    assert.ok(explore.after.score >= greedy.after.score - 1e-9,
      `seed ${seed}: explore (${explore.after.score}) below greedy (${greedy.after.score})`);
    if (explore.after.score > greedy.after.score + 1e-9) better++;
  }
  assert.ok(better >= 5, `explore should beat greedy on several random cities (got ${better})`);
});

test('explore: deterministic for a given seed + roads byte-identical', () => {
  for (const seed of [3, 17, 41, 101]) {
    const layout = sanitizeLayout(randomLayout(seed * 7919));
    const a = optimizeLayout(layout, { strategy: 'explore' }, seed * 104729);
    const b = optimizeLayout(layout, { strategy: 'explore' }, seed * 104729);
    assert.equal(JSON.stringify(a.layout), JSON.stringify(b.layout), `seed ${seed}: nondeterministic`);
    assert.equal(JSON.stringify(a.diff), JSON.stringify(b.diff), `seed ${seed}: nondeterministic diff`);
    assert.equal(JSON.stringify(layout.roads), JSON.stringify(a.layout.roads), `seed ${seed}: explore must never touch roads`);
    assert.ok(validateLayout(a.layout).ok, `seed ${seed}`);
  }
});

test('explore: output never worse than input + never removes last special', () => {
  for (const seed of SEEDS.slice(0, 12)) {
    const layout = sanitizeLayout(randomLayout(seed * 7919));
    const before = computeMetrics(layout);
    const { layout: out } = optimizeLayout(layout, { strategy: 'explore' }, seed * 104729);
    const after = computeMetrics(out);
    assert.ok(after.score >= before.score - 1e-9, `seed ${seed}: explore made the city worse`);
    for (const b of layout.buildings.filter((x) => SPECIAL_SET.has(x.type))) {
      const outCount = out.buildings.filter((x) => x.type === b.type).length;
      assert.ok(outCount >= 1, `seed ${seed}: special ${b.type} vanished`);
    }
  }
});

test('explore: respects goal weights (green mayor still gets a park)', () => {
  const raw = {
    version: 2, scaleMeters: 2000,
    roads: [{ points: [[100, 1000], [1900, 1000]], width: 14, class: 'primary' }],
    parks: [],
    buildings: [
      { type: 'housing', pos: [900, 1000], footprint: [20, 20], height: 24 },
      { type: 'housing', pos: [1100, 1000], footprint: [20, 20], height: 24 },
      { type: 'school', pos: [1000, 950], footprint: [26, 24], height: 20 },
      { type: 'shop', pos: [940, 1000], footprint: [32, 32], height: 26 },
    ],
  };
  const layout = sanitizeLayout(raw);
  const green = { happy: 0.6, walkable: 0.15, peaceful: 0.15, spread: 0.10 };
  const res = optimizeLayout(layout, { strategy: 'explore', weights: green }, 3);
  assert.ok(res.diff.some((d) => d.action === 'add_park'), 'green mayor + explore should add a park');
  assert.ok(validateLayout(res.layout).ok);
});

test('explore: restarts option bounds runtime (respects a small restart cap)', () => {
  const layout = sanitizeLayout(randomLayout(17 * 7919));
  const t0 = performance.now();
  const res = optimizeLayout(layout, { strategy: 'explore', restarts: 2 }, 99);
  const ms = performance.now() - t0;
  assert.ok(validateLayout(res.layout).ok);
  assert.ok(ms < 900, `explore(restarts:2) took ${ms.toFixed(0)}ms`);
  assert.ok(res.after.score >= computeMetrics(layout).score - 1e-9);
});

// ── Locks ───────────────────────────────────────────────────────────────
test('locked buildings are never moved or removed', () => {
  const raw = {
    version: 2, scaleMeters: 2000,
    roads: [{ points: [[100, 1000], [1900, 1000]], width: 14, class: 'primary' }],
    parks: [],
    buildings: [
      { type: 'housing', pos: [400, 1000], footprint: [20, 20], height: 24 },
      { type: 'housing', pos: [600, 1000], footprint: [20, 20], height: 24 },
      { type: 'delivery', pos: [410, 1000], footprint: [26, 22], height: 44, locked: true },   // noisy + locked
    ],
  };
  const layout = sanitizeLayout(raw);
  assert.equal(layout.buildings.find((b) => b.type === 'delivery').locked, true, 'sanitize preserves locked');
  const { layout: out, diff } = optimizeLayout(layout, {}, 7);
  const movedOrRemoved = diff.some((d) => d.what === 'delivery' && (d.action === 'move' || d.action === 'remove'));
  assert.ok(!movedOrRemoved, 'locked noisy building should stay put');
  const outDelivery = out.buildings.find((b) => b.type === 'delivery');
  assert.ok(outDelivery, 'locked delivery should still exist');
  assert.deepEqual(outDelivery.pos, layout.buildings.find((b) => b.type === 'delivery').pos, 'position unchanged');
});

test('locked utility is not repositioned', () => {
  const raw = {
    version: 2, scaleMeters: 2000,
    roads: [
      { points: [[100, 1000], [1900, 1000]], width: 14, class: 'primary' },
      { points: [[1000, 100], [1000, 1900]], width: 14, class: 'primary' },
    ],
    parks: [],
    buildings: [
      { type: 'housing', pos: [900, 1000], footprint: [20, 20], height: 24 },
      { type: 'housing', pos: [1100, 1000], footprint: [20, 20], height: 24 },
      { type: 'school', pos: [1000, 950], footprint: [26, 24], height: 20 },
      { type: 'shop', pos: [940, 1000], footprint: [32, 32], height: 26 },
      { type: 'hospital', pos: [1000, 1050], footprint: [30, 26], height: 34 },
      { type: 'fire', pos: [880, 1000], footprint: [22, 20], height: 16 },
      { type: 'police', pos: [1120, 1000], footprint: [22, 20], height: 18 },
      { type: 'water', pos: [300, 1700], footprint: [24, 24], height: 40, locked: true },   // far + locked
    ],
  };
  const layout = sanitizeLayout(raw);
  const { diff } = optimizeLayout(layout, {}, 5);
  const movedWater = diff.some((d) => d.action === 'move' && d.what === 'water');
  assert.ok(!movedWater, 'locked water should not be repositioned');
});

test('locked and unlocked special duplicates all survive', () => {
  const raw = {
    version: 2, scaleMeters: 2000,
    roads: [{ points: [[100, 1000], [1900, 1000]], width: 14, class: 'primary' }],
    parks: [],
    buildings: [
      { type: 'housing', pos: [1400, 1400], footprint: [20, 20], height: 24 },
      { type: 'traffic_lab', pos: [500, 500], footprint: [22, 20], height: 40, locked: true },
      { type: 'traffic_lab', pos: [540, 500], footprint: [22, 20], height: 40 },
      { type: 'traffic_lab', pos: [580, 500], footprint: [22, 20], height: 40 },
    ],
  };
  const layout = sanitizeLayout(raw);
  const { layout: out } = optimizeLayout(layout, {}, 3);
  const labs = out.buildings.filter((b) => b.type === 'traffic_lab');
  const lockedStillThere = labs.some((b) => b.locked && b.pos[0] === 500 && b.pos[1] === 500);
  assert.ok(lockedStillThere, 'the locked traffic lab must survive');
  assert.ok(labs.length >= 1, 'at least the locked one remains');
  assert.equal(labs.length, 3);
  assert.ok(preservesExistingWork(layout, out));
});

// ── Step mode ──────────────────────────────────────────────────────────
test('step mode (maxIter 1) is a sub-plan of full optimize and never regresses', () => {
  for (const seed of [3, 17, 41, 89]) {
    const layout = sanitizeLayout(randomLayout(seed * 7919));
    const stepRes = optimizeLayout(layout, { maxIter: 1 }, seed * 104729);
    const fullRes = optimizeLayout(layout, {}, seed * 104729);
    assert.ok(validateLayout(stepRes.layout).ok, `seed ${seed}`);
    assert.ok(stepRes.after.score >= stepRes.before.score - 1e-9, `seed ${seed}: step regressed`);
    assert.ok(stepRes.after.score <= fullRes.after.score + 1e-9,
      `seed ${seed}: full optimize should be >= one step (${stepRes.after.score} vs ${fullRes.after.score})`);
  }
});

// ── proposeMoves ─────────────────────────────────────────────────────────
test('proposeMoves: returns <= k diverse moves, each improving, deterministic', () => {
  for (const seed of [3, 17, 41, 89]) {
    const layout = sanitizeLayout(randomLayout(seed * 7919));
    const moves = proposeMoves(layout, {}, 3, seed * 104729);
    assert.ok(moves.length <= 3, `seed ${seed}: <= 3 moves`);
    // Deterministic for same seed.
    const again = proposeMoves(layout, {}, 3, seed * 104729);
    assert.deepEqual(moves.map((m) => m.action + m.what + m.deltaScore.toFixed(3)), again.map((m) => m.action + m.what + m.deltaScore.toFixed(3)), `seed ${seed}: deterministic`);
    const before = computeMetrics(layout).score;
    for (const m of moves) {
      assert.ok(m.deltaScore > 0, `seed ${seed}: delta should be positive`);
      assert.ok(m.action && m.what, 'move has action + what');
      assert.ok(Array.isArray(m.improved), 'move has improved list');
      // Applying the move must produce a valid layout with score >= before.
      const applied = applyMove(layout, m);
      assert.ok(validateLayout(applied).ok, `seed ${seed}: applied layout validates`);
      assert.ok(computeMetrics(applied).score >= before - 1e-9, `seed ${seed}: applied score not lower`);
    }
  }
});

test('proposeMoves: top move is the best (highest delta) single change', () => {
  for (const seed of [3, 31, 61]) {
    const layout = sanitizeLayout(randomLayout(seed * 7919));
    const moves = proposeMoves(layout, {}, 5, seed);
    if (moves.length < 2) continue;
    const sorted = moves.slice().sort((a, b) => b.deltaScore - a.deltaScore);
    assert.equal(sorted[0], moves[0], `seed ${seed}: first move has the top delta`);
  }
});

test('proposeMoves: respects locks (no locked building moved/removed)', () => {
  const raw = {
    version: 2, scaleMeters: 2000,
    roads: [{ points: [[100, 1000], [1900, 1000]], width: 14, class: 'primary' }],
    parks: [],
    buildings: [
      { type: 'housing', pos: [400, 1000], footprint: [20, 20], height: 24 },
      { type: 'housing', pos: [600, 1000], footprint: [20, 20], height: 24 },
      { type: 'delivery', pos: [410, 1000], footprint: [26, 22], height: 44, locked: true },
    ],
  };
  const layout = sanitizeLayout(raw);
  const moves = proposeMoves(layout, {}, 5, 7);
  const touchedLocked = moves.some((m) => m.what === 'delivery' && (m.action === 'move' || m.action === 'remove'));
  assert.ok(!touchedLocked, 'locked delivery should not be moved/removed in any proposal');
});

test('proposeMoves: respects goal weights (a green mayor proposes a park)', () => {
  const raw = {
    version: 2, scaleMeters: 2000,
    roads: [{ points: [[100, 1000], [1900, 1000]], width: 14, class: 'primary' }],
    parks: [],
    buildings: [
      { type: 'housing', pos: [900, 1000], footprint: [20, 20], height: 24 },
      { type: 'housing', pos: [1100, 1000], footprint: [20, 20], height: 24 },
      { type: 'school', pos: [1000, 950], footprint: [26, 24], height: 20 },
      { type: 'shop', pos: [940, 1000], footprint: [32, 32], height: 26 },
    ],
  };
  const layout = sanitizeLayout(raw);
  const green = { happy: 0.6, walkable: 0.15, peaceful: 0.15, spread: 0.10 };
  const moves = proposeMoves(layout, { weights: green }, 5, 3);
  // A green mayor's proposals must include a park-add at some point.
  const parkMove = moves.find((m) => m.action === 'add_park');
  assert.ok(parkMove, 'green mayor should propose a park');
  // Regression guard: `green` is 20% of the happy goal, so a park move's
  // MEASURED improved list must contain it (it used to be untracked, leaving
  // the reason question unanswerable). reasonMetric must narrate it too.
  assert.equal(parkMove.reasonMetric, 'green', 'park move narrates the green metric');
  assert.ok(parkMove.improved.includes('green'),
    `park move measured improved list includes green (got ${JSON.stringify(parkMove.improved)})`);
});

test('proposeMoves: every move carries a valid reasonMetric (reason always answerable)', () => {
  const VALID = new Set(['accessibility', 'coverage', 'utilities', 'zoning', 'spread', 'balance', 'green', 'walkability']);
  for (const seed of [3, 17, 41, 89]) {
    const layout = sanitizeLayout(randomLayout(seed * 7919));
    const moves = proposeMoves(layout, {}, 3, seed * 104729);
    assert.ok(moves.length <= 3, `seed ${seed}: <= 3 moves`);
    for (const m of moves) {
      assert.ok(m.action && m.what, `seed ${seed}: move has action + what`);
      assert.ok(VALID.has(m.reasonMetric),
        `seed ${seed}: ${m.action}:${m.what} reasonMetric must be a tracked metric (got ${m.reasonMetric})`);
      assert.ok(Array.isArray(m.improved), `seed ${seed}: move has improved list`);
      for (const met of m.improved) {
        assert.ok(VALID.has(met), `seed ${seed}: improved entry "${met}" is a tracked metric`);
      }
    }
  }
});

test('applyMove: add/move/remove/add_park each mutate correctly', () => {
  const base = sanitizeLayout({
    version: 2, scaleMeters: 2000,
    roads: [{ points: [[100, 1000], [1900, 1000]], width: 14, class: 'primary' }],
    parks: [],
    buildings: [
      { type: 'housing', pos: [900, 1000], footprint: [20, 20], height: 24 },
      { type: 'school', pos: [1000, 950], footprint: [26, 24], height: 20 },
    ],
  });
  // add
  let out = applyMove(base, { action: 'add', what: 'shop', to: [1100, 1000] });
  assert.ok(out.buildings.some((b) => b.type === 'shop' && b.pos[0] === 1100));
  // move
  out = applyMove(base, { action: 'move', what: 'school', from: [1000, 950], to: [1300, 1000] });
  const moved = out.buildings.find((b) => b.type === 'school');
  assert.deepEqual(moved.pos, [1300, 1000]);
  // remove
  out = applyMove(base, { action: 'remove', what: 'school', from: [1000, 950] });
  assert.ok(!out.buildings.some((b) => b.type === 'school'));
  // add_park
  out = applyMove(base, { action: 'add_park', to: [500, 500] });
  assert.equal(out.parks.length, 1);
  assert.equal(out.parks[0].cx, 500);
  // no-op on a missing target does not throw
  assert.doesNotThrow(() => applyMove(base, { action: 'move', what: 'nope', from: [0, 0], to: [1, 1] }));
});

// ── Deterministic Optimise seed (Sprint C) ──────────────────────────────
// The planner used to seed with Date.now()^Math.random(), so every Optimise
// press produced different plans and Greedy-vs-Explore was an unstable
// comparison. stableSeed() makes the same city + goals reproduce the same two
// plans. These tests pin that property and prove Explore can genuinely beat
// Greedy on a realistic hand-placed town (not randomLayout noise).
test('stableSeed: same city + goals → same seed; different input → different seed', () => {
  const a = sanitizeLayout(randomLayout(3 * 7919));
  const b = sanitizeLayout(randomLayout(3 * 7919));
  assert.equal(stableSeed(a, null), stableSeed(b, null), 'same layout → same seed');
  assert.equal(stableSeed(a, { happy: 0.5 }), stableSeed(a, { happy: 0.5 }), 'same weights → same seed');
  assert.notEqual(stableSeed(a, null), stableSeed(a, { happy: 0.5 }), 'changing goals changes the seed');
  assert.notEqual(stableSeed(a, null), stableSeed(sanitizeLayout(randomLayout(7 * 7919)), null), 'different city → different seed');
  const s = stableSeed(a, null);
  assert.ok(Number.isInteger(s) && s > 0 && s <= 0xffffffff, `seed must be a positive uint32 (got ${s})`);
});

test('stableSeed: building/road order does not change the seed (canonical JSON)', () => {
  const a = childTown();
  const b = JSON.parse(JSON.stringify(a));
  b.buildings = b.buildings.slice().reverse();
  assert.equal(stableSeed(a, null), stableSeed(b, null), 'reordering buildings must not change the seed');
  const c = JSON.parse(JSON.stringify(a));
  c.roads = c.roads.slice().reverse();
  assert.equal(stableSeed(a, null), stableSeed(c, null), 'reordering roads must not change the seed');
  // A real edit (nudging one building) MUST change the seed.
  const d = JSON.parse(JSON.stringify(a));
  d.buildings[0].pos = [d.buildings[0].pos[0] + 25, d.buildings[0].pos[1]];
  assert.notEqual(stableSeed(a, null), stableSeed(d, null), 'moving a building must change the seed');
});

test('optimise is reproducible for a city + goals (same two plans every press)', () => {
  const layout = sanitizeLayout(randomLayout(41 * 7919));
  const weights = { happy: 0.4, walkable: 0.2, peaceful: 0.2, spread: 0.2 };
  const seed = stableSeed(layout, weights);
  const g1 = optimizeLayout(layout, { weights }, seed);
  const g2 = optimizeLayout(layout, { weights }, stableSeed(layout, weights));
  const e1 = optimizeLayout(layout, { weights, strategy: 'explore' }, seed);
  const e2 = optimizeLayout(layout, { weights, strategy: 'explore' }, stableSeed(layout, weights));
  assert.equal(JSON.stringify(g1.layout), JSON.stringify(g2.layout), 'Greedy must be stable across presses');
  assert.equal(JSON.stringify(e1.layout), JSON.stringify(e2.layout), 'Explore must be stable across presses');
  // Shared seed ⇒ Explore's first restart reproduces Greedy, so Explore can
  // never score below the Greedy plan the child just saw.
  assert.ok(e1.after.score >= g1.after.score - 1e-9, 'Explore never below Greedy on the shared seed');
});

/**
 * A realistic hand-placed child town (NOT randomLayout noise): a main street
 * with two cross streets, eight homes in a row, every service bunched at the
 * west end (so the eastern homes are underserved), the mission buildings
 * stacked in the centre, utilities stranded in corners, one noisy delivery
 * beside a home, and a park far to the east. This is what a 10-year-old's
 * first plan actually looks like.
 */
function childTown() {
  return sanitizeLayout({
    version: 2, scaleMeters: 2000,
    roads: [
      { points: [[150, 1000], [1850, 1000]], width: 14, class: 'primary' },
      { points: [[700, 250], [700, 1750]], width: 12, class: 'secondary' },
      { points: [[1300, 250], [1300, 1750]], width: 12, class: 'secondary' },
    ],
    parks: [{ cx: 1630, cz: 700, radius: 70 }],
    buildings: [
      { type: 'city_central', pos: [1000, 1030], footprint: [28, 28], height: 100 },
      { type: 'finance_tower', pos: [1040, 1060], footprint: [24, 24], height: 80 },
      { type: 'treasury', pos: [1080, 1090], footprint: [22, 22], height: 50 },
      { type: 'sentiment_lab', pos: [1120, 1120], footprint: [22, 22], height: 45 },
      { type: 'housing', pos: [400, 980], footprint: [20, 20], height: 24 },
      { type: 'housing', pos: [550, 980], footprint: [20, 20], height: 24 },
      { type: 'housing', pos: [680, 980], footprint: [20, 20], height: 24 },
      { type: 'housing', pos: [850, 980], footprint: [20, 20], height: 24 },
      { type: 'housing', pos: [1000, 980], footprint: [20, 20], height: 24 },
      { type: 'housing', pos: [1150, 980], footprint: [20, 20], height: 24 },
      { type: 'housing', pos: [1320, 980], footprint: [20, 20], height: 24 },
      { type: 'housing', pos: [1450, 980], footprint: [20, 20], height: 24 },
      { type: 'school', pos: [380, 910], footprint: [26, 24], height: 20 },
      { type: 'shop', pos: [520, 1150], footprint: [32, 32], height: 26 },
      { type: 'hospital', pos: [300, 970], footprint: [30, 26], height: 34 },
      { type: 'fire', pos: [1000, 960], footprint: [22, 20], height: 16 },
      { type: 'police', pos: [900, 1230], footprint: [22, 20], height: 18 },
      { type: 'delivery', pos: [1270, 1040], footprint: [26, 22], height: 44 },
      { type: 'water', pos: [200, 1800], footprint: [24, 24], height: 40 },
      { type: 'power', pos: [1800, 300], footprint: [24, 24], height: 44 },
      { type: 'bus', pos: [1800, 1700], footprint: [26, 20], height: 38 },
    ],
  });
}

test('explore honestly beats greedy on a realistic hand-placed child town', () => {
  const layout = childTown();
  const seed = stableSeed(layout, null);
  const greedy = optimizeLayout(layout, {}, seed);
  const explore = optimizeLayout(layout, { strategy: 'explore' }, seed);
  // Former exact scores depended on moving protected specials. Keep the
  // strict Explore advantage and independently verify the revised objective.
  for (const result of [greedy, explore]) {
    assert.ok(preservesExistingWork(layout, result.layout));
    assert.equal(result.after.score, computeMetrics(result.layout, undefined, null, computeWalkReach(result.layout)).score);
  }
  assert.ok(explore.after.score > greedy.after.score + 0.5,
    `Explore must strictly beat Greedy here (got ${greedy.after.score} vs ${explore.after.score})`);
  // Invariants still hold in both strategies.
  assert.ok(explore.after.score >= computeMetrics(layout).score - 1e-9, 'never worse than input');
  assert.equal(JSON.stringify(layout.roads), JSON.stringify(explore.layout.roads), 'roads are sacred');
  assert.ok(validateLayout(explore.layout).ok, 'explore output validates');
});

test('proposeMoves: optimal city proposes nothing (or very little)', () => {
  // The well-balanced fixture should yield at most 1 weak proposal; often 0.
  const raw = {
    version: 2, scaleMeters: 2000,
    roads: [
      { points: [[100, 1000], [1900, 1000]], width: 14, class: 'primary' },
      { points: [[1000, 100], [1000, 1900]], width: 14, class: 'primary' },
    ],
    parks: [{ cx: 800, cz: 800, radius: 80 }, { cx: 1300, cz: 1300, radius: 80 }],
    buildings: [
      { type: 'city_central', pos: [1000, 1000], footprint: [28, 28], height: 100 },
      { type: 'housing', pos: [960, 1045], footprint: [20, 20], height: 24 },
      { type: 'housing', pos: [1040, 1045], footprint: [20, 20], height: 24 },
      { type: 'school', pos: [955, 950], footprint: [26, 24], height: 20 },
      { type: 'shop', pos: [940, 1045], footprint: [32, 32], height: 26 },
      { type: 'hospital', pos: [1045, 1050], footprint: [30, 26], height: 34 },
      { type: 'fire', pos: [975, 960], footprint: [22, 20], height: 16 },
      { type: 'police', pos: [1050, 1080], footprint: [22, 20], height: 18 },
      { type: 'water', pos: [945, 700], footprint: [24, 24], height: 40 },
      { type: 'power', pos: [1055, 1300], footprint: [24, 24], height: 44 },
      { type: 'bus', pos: [760, 1045], footprint: [26, 20], height: 38 },
      { type: 'office', pos: [1060, 1045], footprint: [20, 20], height: 40 },
    ],
  };
  const layout = sanitizeLayout(raw);
  const moves = proposeMoves(layout, {}, 3, 42);
  assert.ok(moves.length <= 1, `balanced city should propose ~nothing (got ${moves.length})`);
});

// ── Buildings on roads (bad road logic) ─────────────────────────────────
test('building on a road: moved fully off, roads byte-identical, score not worse', () => {
  const raw = {
    version: 2, scaleMeters: 2000,
    roads: [{ points: [[100, 1000], [1900, 1000]], width: 14, class: 'primary' }],
    parks: [],
    buildings: [
      { type: 'housing', pos: [600, 1000], footprint: [20, 20], height: 24 },   // dead centre on the road
      { type: 'school', pos: [900, 1000], footprint: [26, 24], height: 20 },    // on the road
      { type: 'police', pos: [1500, 1000], footprint: [22, 20], height: 18 },   // on the road
    ],
  };
  const layout = sanitizeLayout(raw);
  const before = computeMetrics(layout);
  const { layout: out, diff } = optimizeLayout(layout, {}, 7);
  const bands = roadBands(out);
  for (const b of out.buildings) {
    assert.ok(rectRoadClearance(b.pos[0], b.pos[1], b.footprint || [20, 20], bands) >= ROAD_CLEARANCE_MARGIN,
      `${b.type} must be moved fully off the road (clearance ${rectRoadClearance(b.pos[0], b.pos[1], b.footprint || [20, 20], bands).toFixed(2)})`);
  }
  assert.equal(diff.filter((d) => d.kind === 'off-road').length, 3, 'each on-road building is reported');
  assert.ok(computeMetrics(out).score >= before.score - 1e-9, 'score must not decrease');
  assert.equal(JSON.stringify(out.roads), JSON.stringify(layout.roads), 'roads must stay byte-identical');
  assert.ok(validateLayout(out).ok, 'output validates');
});

test('a LOCKED building on a road is left exactly where the student pinned it', () => {
  const raw = {
    version: 2, scaleMeters: 2000,
    roads: [{ points: [[100, 1000], [1900, 1000]], width: 14, class: 'primary' }],
    parks: [],
    buildings: [
      { type: 'housing', pos: [600, 1000], footprint: [20, 20], height: 24, locked: true },
      { type: 'shop', pos: [900, 1000], footprint: [32, 32], height: 26 },
    ],
  };
  const layout = sanitizeLayout(raw);
  const { layout: out, diff } = optimizeLayout(layout, {}, 3);
  const lockedHome = out.buildings.find((b) => b.type === 'housing');
  assert.deepEqual(lockedHome.pos, [600, 1000], 'locked building never moves');
  assert.ok(!diff.some((d) => d.kind === 'off-road' && d.what === 'housing'), 'locked building is not reported as moved');
  // The unprotected shop IS fixed.
  const shop = out.buildings.find((b) => b.type === 'shop');
  assert.ok(rectRoadClearance(shop.pos[0], shop.pos[1], shop.footprint, roadBands(out)) >= ROAD_CLEARANCE_MARGIN);
});

test('random layouts: after Optimise no UNPROTECTED building sits on a road', () => {
  for (const seed of SEEDS) {
    const layout = sanitizeLayout(randomLayout(seed * 7919));
    const { layout: out } = optimizeLayout(layout, {}, seed * 104729);
    const onRoadUnprotected = onRoadBuildingIndices(out)
      .filter((i) => { const b = out.buildings[i]; return !(b.locked || SPECIAL_SET.has(b.type)); });
    assert.deepEqual(onRoadUnprotected, [], `seed ${seed}: an unprotected building was left on a road`);
  }
});

test('proposeMoves: never proposes an add/move onto a road ribbon', () => {
  for (const seed of [3, 17, 41, 89]) {
    const layout = sanitizeLayout(randomLayout(seed * 7919));
    const bands = roadBands(layout);
    for (const m of proposeMoves(layout, {}, 3, seed * 104729)) {
      if (!m.to || (m.action !== 'add' && m.action !== 'move')) continue;
      const fp = m.action === 'add'
        ? (catalogType(m.what)?.footprint || [20, 20])
        : (layout.buildings.find((b) => b.type === m.what && Math.abs(b.pos[0] - m.from[0]) < 1 && Math.abs(b.pos[1] - m.from[1]) < 1)?.footprint || [20, 20]);
      assert.ok(rectRoadClearance(m.to[0], m.to[1], fp, bands) >= ROAD_CLEARANCE_MARGIN,
        `seed ${seed}: proposal ${m.action} ${m.what} -> ${m.to} lands on a road`);
    }
  }
});

// ── Cross-module: the planner's score must describe the 3D city ──────────
test('Optimise output stays road-clean after the 3D builder step (densify)', () => {
  // Regression for "I pressed Optimise, then the 3D city had buildings on the
  // roads": densifyLayout used to grow footprints ×1.5 and compress positions
  // ×0.6, which could drop a planner-clear building onto a road in 3D. It is
  // now geometry-preserving, so the optimiser's guarantee holds end to end.
  for (const seed of [3, 7, 17, 41, 89, 103]) {
    const layout = sanitizeLayout(randomLayout(seed * 7919));
    const { layout: optimized } = optimizeLayout(layout, {}, seed * 104729);
    const rendered = densifyLayout(JSON.parse(JSON.stringify(optimized))).layout;
    const onRoad = onRoadBuildingIndices(rendered)
      .filter((i) => { const b = rendered.buildings[i]; return !(b.locked || SPECIAL_SET.has(b.type)); });
    assert.deepEqual(onRoad, [], `seed ${seed}: a building ends up on a road in the 3D city`);
  }
});
