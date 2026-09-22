// tests/road-geometry.test.mjs — pure geometry for road clearance + tidying.
//
// This module is the safety net under two risky features: the optimiser moving
// buildings off roads, and the planner's Straight/Curve/Tidy road tools. Every
// function here is pure and deterministic, so it is pinned exhaustively.
//
// Run: node --test tests/road-geometry.test.mjs   (from the repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  distPointToSegment, pointToSegment, segmentIntersectsRect, rectSegmentDistance,
  roadBands, roadHalfWidth, rectRoadClearance, isOnRoad, onRoadBuildingIndices,
  clearanceOffset, simplifyPolyline, softSnapAngles, connectEndpoints, tidyRoads,
  sampleCatmullRom, footprintOf, TIDY_DEFAULTS,
  detectJunctions, materializeJunctions, junctionNodes, junctionMouthMaskHalf, junctionPadOutline,
  ribbonNormals, RIBBON_MITRE_LIMIT,
  resolveRoadSafePlacement, repairLegacyRoadOverlaps, orientedFootprint,
} from '../P5 Programme/buddy-kit/client/city-common/road-geometry.js';
import { createTrafficFlow } from '../P5 Programme/buddy-kit/client/city-common/traffic-network.js';

const EPS = 1e-6;
const near = (a, b, e = 1e-3) => Math.abs(a - b) <= e;

// ── primitives ──────────────────────────────────────────────────────────
test('distPointToSegment: a point off the middle, at an end, and degenerate', () => {
  assert.ok(near(distPointToSegment(0, 5, -10, 0, 10, 0), 5), 'perpendicular distance');
  assert.ok(near(distPointToSegment(20, 0, -10, 0, 10, 0), 10), 'clamped past the end');
  assert.ok(near(distPointToSegment(3, 4, 3, 4, 3, 4), 0), 'zero-length segment to itself');
  const p = pointToSegment(5, 5, 0, 0, 10, 0);
  assert.ok(near(p.x, 5) && near(p.z, 0) && near(p.t, 0.5));
});

test('segments: rect piercing is distance 0 (corner-only checks would miss it)', () => {
  // Footprint 20x20 centred at origin; road runs straight through it.
  assert.ok(segmentIntersectsRect(-50, 0, 50, 0, 0, 0, 10, 10), 'pierces the middle');
  assert.ok(near(rectSegmentDistance(0, 0, [20, 20], -50, 0, 50, 0), 0), 'piercing distance is 0');
  // Fully inside.
  assert.ok(segmentIntersectsRect(-3, -3, 3, 3, 0, 0, 10, 10));
  // Disjoint, measured from an endpoint to the nearest rect edge.
  assert.ok(near(rectSegmentDistance(0, 0, [20, 20], 30, 0, 40, 0), 20), 'disjoint: 30 - half(10)');
  // Disjoint diagonally from a corner.
  assert.ok(rectSegmentDistance(0, 0, [20, 20], 30, 30, 40, 40) > 0);
});

test('roadHalfWidth: saved width wins, then class, then residential', () => {
  assert.equal(roadHalfWidth({ width: 20, class: 'primary' }), 10);
  assert.equal(roadHalfWidth({ class: 'primary' }), 7);
  assert.equal(roadHalfWidth({}), 3.5);
  assert.equal(roadHalfWidth({ width: -5, class: 'secondary' }), 5.5);
});

test('footprintOf: saved valid footprint, else the 20x20 default', () => {
  assert.deepEqual(footprintOf({ footprint: [30, 12] }), [30, 12]);
  assert.deepEqual(footprintOf({ footprint: [0, 12] }), [20, 20]);
  assert.deepEqual(footprintOf(null), [20, 20]);
});

test('roadBands: drops zero-length segments and uses per-road width', () => {
  const bands = roadBands([
    { points: [[0, 0], [100, 0]], width: 10, class: 'primary' },
    { points: [[200, 0], [200, 0]], width: 10, class: 'primary' },   // zero-length
  ]);
  assert.equal(bands.length, 1);
  assert.equal(bands[0].half, 5);
});

// ── clearance ───────────────────────────────────────────────────────────
test('rectRoadClearance / isOnRoad: on-road, near-road and far-road', () => {
  const bands = roadBands([{ points: [[-500, 0], [500, 0]], width: 10, class: 'primary' }]);
  // Centre on the road: gap = 0 - half(5) = -5.
  assert.ok(near(rectRoadClearance(0, 0, [20, 20], bands), -5));
  assert.ok(isOnRoad(0, 0, [20, 20], bands));
  // Centre 15m up: footprint edge at 5m, ribbon edge at 5m → gap 0.
  assert.ok(near(rectRoadClearance(0, 15, [20, 20], bands), 0));
  // Centre 30m up: gap 15 → clear of the 3m margin.
  assert.ok(rectRoadClearance(0, 30, [20, 20], bands) >= 3);
  assert.ok(!isOnRoad(0, 30, [20, 20], bands));
  // No roads.
  assert.equal(rectRoadClearance(0, 0, [20, 20], []), Infinity);
});

test('onRoadBuildingIndices: finds exactly the offending buildings', () => {
  const layout = {
    roads: [{ points: [[-500, 0], [500, 0]], width: 10, class: 'primary' }],
    buildings: [
      { type: 'housing', pos: [0, 0], footprint: [20, 20] },     // ON
      { type: 'school', pos: [0, 40], footprint: [20, 20] },     // clear (gap 25)
      { type: 'shop', pos: [100, 5], footprint: [20, 20] },      // ON
    ],
  };
  assert.deepEqual(onRoadBuildingIndices(layout), [0, 2]);
});

test('clearanceOffset: smallest nudge fully clears the road, in bounds, no overlap', () => {
  const bands = roadBands([{ points: [[-500, 0], [500, 0]], width: 14, class: 'primary' }]);
  const b = { type: 'housing', pos: [0, 0], footprint: [20, 20] };
  const cand = clearanceOffset(b, [], bands, { scale: 2000 });
  assert.ok(cand, 'a spot must be found');
  assert.ok(rectRoadClearance(cand.x, cand.z, [20, 20], bands) >= 3, 'fully clear of the ribbon+margin');
  assert.ok(cand.x >= 0 && cand.x <= 2000 && cand.y === undefined && cand.z >= 0 && cand.z <= 2000, 'in bounds');
  // Minimal-ish: should not fly far away (search prefers the smallest radius).
  assert.ok(Math.hypot(cand.x, cand.z) < 60, `nudge should be local (got ${Math.hypot(cand.x, cand.z).toFixed(1)}m)`);
  // Deterministic.
  const again = clearanceOffset(b, [], bands, { scale: 2000 });
  assert.deepEqual(again, cand);
});

test('clearanceOffset: returns null when already clear', () => {
  const bands = roadBands([{ points: [[-500, 0], [500, 0]], width: 10, class: 'primary' }]);
  assert.equal(clearanceOffset({ pos: [0, 200], footprint: [20, 20] }, [], bands), null);
  assert.equal(clearanceOffset({ pos: [0, 0], footprint: [20, 20] }, [], []), null);
});

test('clearanceOffset: never stacks onto another building', () => {
  const bands = roadBands([{ points: [[-500, 0], [500, 0]], width: 14, class: 'primary' }]);
  const b = { type: 'housing', pos: [0, 5], footprint: [20, 20] };
  // Wall the building in with neighbours at every 40m in the whole search box.
  const others = [];
  for (let x = -60; x <= 60; x += 40) for (let z = -60; z <= 60; z += 40) {
    if (x === 0 && z === 0) continue;
    others.push({ type: 'shop', pos: [x, z], footprint: [30, 30] });
  }
  const cand = clearanceOffset(b, others, bands, { scale: 2000 });
  if (cand) {
    for (const o of others) {
      const bad = Math.abs(cand.x - o.pos[0]) < (20 + 30) / 2 + 4 && Math.abs(cand.z - o.pos[1]) < (20 + 30) / 2 + 4;
      assert.ok(!bad, `overlaps a neighbour at ${o.pos}`);
    }
  }
});

test('clearanceOffset: a footprint larger than a short road still clears', () => {
  // 60m building sitting on a 100m road.
  const bands = roadBands([{ points: [[450, 500], [550, 500]], width: 12, class: 'primary' }]);
  const b = { pos: [500, 500], footprint: [60, 60] };
  const cand = clearanceOffset(b, [], bands, { scale: 2000 });
  assert.ok(cand, 'must find a clear spot beside a short road');
  assert.ok(rectRoadClearance(cand.x, cand.z, [60, 60], bands) >= 3);
});

// ── simplify + snap ─────────────────────────────────────────────────────
test('simplifyPolyline: jitter collapses, real corners survive, ends kept', () => {
  const jittery = [];
  for (let i = 0; i <= 40; i++) jittery.push([i * 20, (i % 2 ? 1.5 : -1.5)]);
  const out = simplifyPolyline(jittery, 10);
  assert.ok(out.length <= 3, `jittery line simplifies to its ends (got ${out.length})`);
  assert.deepEqual(out[0], [0, jittery[0][1]]);
  assert.deepEqual(out[out.length - 1], jittery[jittery.length - 1]);

  const L = [[0, 0], [100, 2], [200, -2], [200, 200]];
  const out2 = simplifyPolyline(L, 10);
  assert.ok(out2.length >= 3, 'the 90° corner is preserved');
  assert.deepEqual(out2[0], [0, 0]);
  assert.deepEqual(out2[out2.length - 1], [200, 200]);
});

test('simplifyPolyline: <=2 points are returned unchanged and never aliased', () => {
  const p = [[0, 0], [10, 10]];
  const out = simplifyPolyline(p, 10);
  assert.deepEqual(out, p);
  assert.notEqual(out, p);
  assert.deepEqual(simplifyPolyline([[5, 5]], 10), [[5, 5]]);
});

test('softSnapAngles: near-horizontal/vertical/diagonal snap, far angles do not', () => {
  const h = softSnapAngles([[0, 0], [100, 4]], 10);          // ~2.3° → horizontal
  assert.equal(h[1][1], 0);
  const v = softSnapAngles([[0, 0], [4, 100]], 10);          // ~87.7° → vertical
  assert.equal(v[1][0], 0);
  const diag = softSnapAngles([[0, 0], [100, 92]], 10);       // ~42.6° → 45°
  assert.ok(near(Math.abs(diag[1][0]), Math.abs(diag[1][1]), 0.5), 'diagonal becomes |dx|≈|dz|');
  const free = softSnapAngles([[0, 0], [100, 60]], 10);       // ~31° → untouched
  assert.deepEqual(free[1], [100, 60]);
  // Short segments are left alone.
  const short = softSnapAngles([[0, 0], [4, 0.2]], 10);
  assert.deepEqual(short[1], [4, 0.2]);
});

// ── connect ─────────────────────────────────────────────────────────────
test('connectEndpoints: near endpoints merge to one shared coordinate', () => {
  const roads = [
    { points: [[0, 0], [100, 0]], width: 10, class: 'primary' },
    { points: [[125, 0], [225, 0]], width: 10, class: 'primary' },   // 25m gap
  ];
  const { roads: out, stats } = connectEndpoints(roads, { connectDist: 30 });
  assert.equal(out[0].points[1][0], out[1].points[0][0]);
  assert.equal(out[0].points[1][1], out[1].points[0][1]);
  assert.ok(stats.endpointMerges >= 1);
});

test('connectEndpoints: a dangling endpoint becomes a real T-junction (target split)', () => {
  const roads = [
    { points: [[0, 0], [400, 0]], width: 10, class: 'primary' },     // the through road
    { points: [[200, 15], [200, 300]], width: 10, class: 'secondary' }, // ends near the middle
  ];
  const { roads: out, stats } = connectEndpoints(roads, { connectDist: 5, tJunctionDist: 20 });
  assert.ok(stats.tJunctions >= 1, 'a T-junction was made');
  const through = out.find((r) => r.width === 10 && r.points.some((p) => p[0] === 400));
  assert.ok(through.points.length >= 3, 'the through road was split at the junction');
  const junction = through.points.find((p) => p[1] === 0 && p[0] > 0 && p[0] < 400);
  assert.ok(junction, 'the junction vertex exists on the through road');
  const spur = out.find((r) => r.points[0][1] === 0 && r.points[0][0] === junction[0]);
  assert.ok(spur, 'the spur endpoint landed on the junction');
});

test('connectEndpoints: never closes one road onto itself', () => {
  const roads = [{ points: [[0, 0], [100, 0], [100, 100], [0, 100], [0, 5]], width: 10, class: 'primary' }];
  const { roads: out } = connectEndpoints(roads, { connectDist: 30 });
  assert.notDeepEqual(out[0].points[0], out[0].points[out[0].points.length - 1]);
  assert.ok(out[0].points.length >= 2);
});

// ── tidy pipeline ───────────────────────────────────────────────────────
test('tidyRoads: a messy freehand network gets straighter, connected and valid', () => {
  const messy = {
    version: 2, scaleMeters: 2000,
    parks: [],
    buildings: [],
    roads: [
      { points: [[100, 500], [140, 503], [180, 497], [220, 502], [260, 500]], width: 10, class: 'primary' },
      { points: [[255, 505], [255, 900], [258, 1000]], width: 10, class: 'secondary' },
      { points: [[180, 1200], [300, 1210], [420, 1195]], width: 10, class: 'tertiary' },
    ],
  };
  const { roads, stats } = tidyRoads(messy);
  assert.equal(roads.length, messy.roads.length, 'no road is dropped');
  for (const r of roads) {
    assert.ok(r.points.length >= 2, 'every road keeps >= 2 points');
    for (const [x, z] of r.points) {
      assert.ok(x >= 0 && x <= 2000 && z >= 0 && z <= 2000, 'in bounds');
      assert.ok(Number.isInteger(x) && Number.isInteger(z), 'integer coords');
    }
  }
  assert.ok(stats.pointsAfter <= stats.pointsBefore, 'tidy never adds jitter back');
  assert.ok(roads[0].points.length < messy.roads[0].points.length, 'first road simplified');
  // Deterministic.
  assert.deepEqual(tidyRoads(messy).roads, roads);
});

test('tidyRoads: never routes a tidied road over a protected building', () => {
  const layout = {
    version: 2, scaleMeters: 2000, parks: [],
    buildings: [{ type: 'housing', pos: [500, 240], footprint: [20, 20] }],
    roads: [{ points: [[500, 200], [500, 280]], width: 10, class: 'primary' }],
  };
  // A "protected" footprint sitting on the original road. Tidy must not make it
  // worse — the road keeps its original geometry if the tidy would cover it.
  const { roads } = tidyRoads(layout, { protectedFootprints: [{ pos: [500, 240], footprint: [20, 20] }] });
  const bands = roadBands(roads);
  // The protected building may already overlap the ORIGINAL road; the guarantee
  // is only that tidy does not introduce a NEW overlap beyond the original.
  const origClear = rectRoadClearance(500, 240, [20, 20], roadBands(layout.roads));
  const tidyClear = rectRoadClearance(500, 240, [20, 20], bands);
  assert.ok(tidyClear >= origClear - 1e-9, 'tidy must not cover the protected building more');
});

test('tidyRoads: respects the point cap by coarsening rather than exceeding it', () => {
  const pts = [];
  for (let i = 0; i <= 400; i++) pts.push([i * 5, 100 + Math.sin(i / 3) * 20 + (i % 2 ? 3 : -3)]);
  const layout = { version: 2, scaleMeters: 2000, parks: [], buildings: [], roads: [{ points: pts, width: 10, class: 'primary' }] };
  const { roads } = tidyRoads(layout, { maxRoadPoints: 60 });
  const total = roads.reduce((n, r) => n + r.points.length, 0);
  assert.ok(total <= 60, `point cap respected (got ${total})`);
});

// ── junction detection + opt-in weld ────────────────────────────────────
/** A square drawn as four separate straight roads with a `gap` at every corner. */
function gappyRect(gap, width = 7) {
  return [
    { points: [[500, 500], [1500 - gap, 500]], width, class: 'residential' },
    { points: [[1500, 500 + gap], [1500, 1500 - gap]], width, class: 'residential' },
    { points: [[1500 - gap, 1500], [500 + gap, 1500]], width, class: 'residential' },
    { points: [[500, 1500 - gap], [500, 500 + gap]], width, class: 'residential' },
  ];
}

test('detectJunctions: reports loose corners/T ends/crossings without mutating', () => {
  const layout = { scaleMeters: 2000, roads: gappyRect(3) };
  const before = JSON.stringify(layout);
  const { candidates, stats } = detectJunctions(layout);
  assert.equal(candidates.length, 4);
  assert.equal(stats.endpointMerges, 4);
  assert.deepEqual(candidates.map((c) => c.kind), ['L', 'L', 'L', 'L']);
  assert.equal(JSON.stringify(layout), before, 'detection is read-only');

  // A T end (a spur stopping short of a through road).
  const t = detectJunctions({ scaleMeters: 2000, roads: [
    { points: [[0, 100], [400, 100]], width: 10 },
    { points: [[200, 118], [200, 300]], width: 10 },
  ] });
  assert.deepEqual(t.candidates.map((c) => c.kind), ['T']);

  // A crossing.
  const x = detectJunctions({ scaleMeters: 2000, roads: [
    { points: [[0, 100], [400, 100]], width: 10 },
    { points: [[200, 0], [200, 400]], width: 10 },
  ] });
  assert.deepEqual(x.candidates.map((c) => c.kind), ['X']);
});

test('materializeJunctions: gappy corners weld into one routable loop', () => {
  const layout = { scaleMeters: 2000, roads: gappyRect(3) };
  const before = JSON.stringify(layout);
  const { roads, junctions, stats } = materializeJunctions(layout, { closeLoops: true });
  assert.equal(JSON.stringify(layout), before, 'input is never mutated');
  assert.equal(stats.endpointMerges, 4);
  assert.equal(junctions.length, 4);
  // Each adjoining pair now shares an EXACT corner coordinate.
  assert.deepEqual(roads[0].points[roads[0].points.length - 1], roads[1].points[0]);
  assert.deepEqual(roads[1].points[roads[1].points.length - 1], roads[2].points[0]);
  assert.deepEqual(roads[2].points[roads[2].points.length - 1], roads[3].points[0]);
  assert.deepEqual(roads[3].points[roads[3].points.length - 1], roads[0].points[0]);
  // And the network is now a real directed circuit with ambient traffic.
  assert.ok(createTrafficFlow(roads).routePlan.routes.length >= 1, 'welded city gets cars');
  // Deterministic.
  assert.deepEqual(materializeJunctions(layout, { closeLoops: true }).roads, roads);
});

test('materializeJunctions: a deliberately wide gap is left disconnected', () => {
  for (const gap of [40, 80, 150]) {
    const { candidates } = detectJunctions({ scaleMeters: 2000, roads: gappyRect(gap) });
    assert.equal(candidates.length, 0, `a ${gap} m gap is not welded`);
  }
});

test('materializeJunctions: a crossing becomes a shared node on BOTH roads', () => {
  const layout = { scaleMeters: 2000, roads: [
    { points: [[0, 100], [400, 100]], width: 10 },
    { points: [[200, 0], [200, 400]], width: 10 },
  ] };
  const { roads, stats } = materializeJunctions(layout);
  assert.equal(stats.crossings, 1);
  assert.equal(roads[0].points.length, 3);
  assert.equal(roads[1].points.length, 3);
  assert.deepEqual(roads[0].points[1], [200, 100]);
  assert.deepEqual(roads[1].points[1], [200, 100]);
});

test('materializeJunctions: a drawn ring closes only when asked', () => {
  const layout = { scaleMeters: 2000, roads: [
    { points: [[500, 500], [1500, 500], [1500, 1500], [500, 1500], [500, 510]], width: 7, class: 'residential' },
  ] };
  assert.deepEqual(detectJunctions(layout).candidates.map((c) => c.kind), ['loop']);
  const open = materializeJunctions(layout, { closeLoops: false }).roads;
  const closed = materializeJunctions(layout, { closeLoops: true }).roads;
  assert.notDeepEqual(open[0].points[0], open[0].points[open[0].points.length - 1]);
  assert.deepEqual(closed[0].points[0], closed[0].points[closed[0].points.length - 1]);
  assert.equal(createTrafficFlow(open).routePlan.routes.length, 0, 'an open stroke is vehicle-free');
  assert.ok(createTrafficFlow(closed).routePlan.routes.length >= 1, 'a closed ring gets cars');
});

test('materializeJunctions: honours the point cap and protected landmarks', () => {
  // The crossing weld raises the vertex count from 4 to 6; a cap of 5 must make
  // it fall back to the safe original geometry instead of exceeding the budget.
  const cross = { scaleMeters: 2000, roads: [
    { points: [[0, 100], [400, 100]], width: 10 },
    { points: [[200, 0], [200, 400]], width: 10 },
  ] };
  const capped = materializeJunctions(cross, { maxRoadPoints: 5 });
  assert.ok(capped.roads.reduce((n, r) => n + r.points.length, 0) <= 5, 'cap respected');

  // A protected landmark at the join: the welded road must not newly cover it.
  const layout = { scaleMeters: 2000, roads: [
    { points: [[0, 0], [400, 0]], width: 10, class: 'primary' },
    { points: [[200, 60], [200, 25]], width: 10, class: 'secondary' },
  ] };
  const protectedFootprints = [{ pos: [200, 12], footprint: [20, 20] }];
  const { roads } = materializeJunctions(layout, { tJunctionDist: 30, protectedFootprints });
  const welded = rectRoadClearance(200, 12, [20, 20], roadBands(roads));
  const original = rectRoadClearance(200, 12, [20, 20], roadBands(layout.roads));
  assert.ok(welded >= original - 1e-9, 'the weld never covers a protected landmark more');
});

test('junctionNodes: reports shared vertices and closed-loop nodes', () => {
  const welded = materializeJunctions({ scaleMeters: 2000, roads: gappyRect(3) }).roads;
  assert.equal(junctionNodes(welded).length, 4);
  const ring = materializeJunctions({
    scaleMeters: 2000,
    roads: [{ points: [[500, 500], [900, 500], [900, 900], [500, 900], [500, 510]], width: 7 }],
  }, { closeLoops: true }).roads;
  assert.equal(junctionNodes(ring).length, 1, 'a closed ring is one node');
});

test('materializeJunctions: a spoke near a ring VERTEX joins that vertex (no chord split)', () => {
  const ring = [];
  for (let i = 0; i <= 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    ring.push([Math.round(1000 + Math.cos(a) * 120), Math.round(1000 + Math.sin(a) * 120)]);
  }
  const layout = { scaleMeters: 2000, roads: [
    { points: ring, width: 12, class: 'primary' },
    // Runs radially inward and stops ~10 m beyond the ring's 90° vertex (1000,1120).
    { points: [[1000, 1400], [1000, 1130]], width: 12, class: 'secondary' },
  ] };
  // The suggestion pass must SEE the vertex join too, or the planner never offers it.
  const detect = detectJunctions(layout);
  assert.equal(detect.candidates.length, 1);
  assert.equal(detect.candidates[0].kind, 'T');
  assert.deepEqual([detect.candidates[0].x, detect.candidates[0].z], [1000, 1120]);
  const { roads, stats } = materializeJunctions(layout);
  const vertex = roads[0].points.find((p) => Math.abs(p[0] - 1000) < 1 && Math.abs(p[1] - 1120) < 1);
  assert.ok(vertex, 'the ring vertex exists');
  assert.deepEqual(roads[1].points[1], vertex, 'the spoke snapped onto the existing ring vertex');
  assert.equal(stats.tJunctions, 1);
  assert.equal(roads[0].points.length, ring.length, 'the ring keeps its vertex count (no chord split)');
});

// ── junction mouth masking ─────────────────────────────────────────────
test('junctionMouthMaskHalf: perpendicular = other width, oblique wider, near-parallel capped', () => {
  const E = { x: 1, z: 0 }, N = { x: 0, z: 1 };
  const perp = junctionMouthMaskHalf(7, 7, E, N, { kerb: 6 });
  assert.ok(Math.abs(perp - 13) < 1e-9, 'a 90° join opens exactly the other road width + kerb');
  const diag = junctionMouthMaskHalf(7, 7, E, { x: Math.SQRT1_2, z: Math.SQRT1_2 }, { kerb: 6 });
  assert.ok(Math.abs(diag - (7 / Math.SQRT1_2 + 6)) < 1e-9, 'a 45° join opens wider by 1/sin θ');
  assert.ok(diag > perp, 'shallower angles open wider');
  const near = junctionMouthMaskHalf(7, 7, E, E, { kerb: 6 });
  assert.ok(Math.abs(near - (7 / Math.sin(Math.PI / 12) + 6)) < 1e-9, 'a near-parallel pair uses the sinMin floor');
  assert.ok(near <= (7 + 7) * 2 + 18, 'never masks more than the cap');
  const capped = junctionMouthMaskHalf(7, 7, E, E, { kerb: 6, sinMin: 0.05 });
  assert.equal(capped, (7 + 7) * 2 + 18, 'the cap wins at extreme angles');
  // Traffic-graph links carry `{dx,dz}`, not `{x,z}` — the helper must accept both.
  const linkForm = junctionMouthMaskHalf(6, 6, { dx: 1, dz: 0 }, { dx: 0, dz: 1 }, { kerb: 6 });
  assert.ok(Math.abs(linkForm - 12) < 1e-9, 'link-shaped directions are read correctly');
});

// ── junction pad outline ───────────────────────────────────────────────
test('junctionPadOutline: star-shaped ring per arm, corners chorded, apron grows', () => {
  const node = { x: 0, z: 0 };
  const cross = [
    { dx: 1, dz: 0, half: 6 }, { dx: -1, dz: 0, half: 6 },
    { dx: 0, dz: 1, half: 6 }, { dx: 0, dz: -1, half: 6 },
  ];
  const pad = junctionPadOutline(node, cross, { kerb: 5 });
  assert.equal(pad.ring.length, 8, 'two edge points per arm');
  assert.equal(pad.radius, 11);
  // Every ring point sits at the arm mouth distance, so the ring is sorted by
  // angle around the node (the precondition for a valid node fan).
  for (const p of pad.ring) assert.ok(Math.abs(Math.hypot(p.x, p.z) - Math.hypot(11, 6)) < 1e-9);
  const angles = pad.ring.map((p) => Math.atan2(p.z, p.x)).sort((a, b) => a - b);
  assert.deepEqual(angles, pad.ring.map((p) => Math.atan2(p.z, p.x)), 'ring is angularly ordered');
  const apron = junctionPadOutline(node, cross, { kerb: 5, grow: 3.6 });
  assert.ok(apron.radius > pad.radius, 'the apron grows outward');
  // A T (through + spur) keeps the opposite-arm diameter; a 3-arm half-plane fan cannot.
  const t = junctionPadOutline(node, [{ dx: 1, dz: 0, half: 6 }, { dx: -1, dz: 0, half: 6 }, { dx: 0, dz: 1, half: 4 }], { kerb: 5 });
  assert.equal(t.ring.length, 6);
  const halfPlane = junctionPadOutline(node, [{ dx: 1, dz: 0, half: 6 }, { dx: 0.87, dz: 0.5, half: 6 }, { dx: 0.5, dz: 0.87, half: 6 }]);
  assert.equal(halfPlane, null, 'all arms in one half-plane is rejected');
  assert.equal(junctionPadOutline(node, [{ dx: 1, dz: 0, half: 6 }]), null, 'needs three arms');
  // Each ring vertex is tagged with its OWN road so the pad can be textured in
  // that road's frame (same look as the ribbon it meets).
  const tagged = junctionPadOutline(node, [
    { dx: 1, dz: 0, half: 6, id: 7 }, { dx: -1, dz: 0, half: 6, id: 8 }, { dx: 0, dz: 1, half: 6, id: 9 },
  ]);
  assert.deepEqual([...new Set(tagged.ring.map((p) => p.roadId))].sort(), [7, 8, 9]);
  assert.equal(tagged.node.roadId, 7);
});

// ── ribbon mitre ───────────────────────────────────────────────────────
test('ribbonNormals: straight lines keep width, bends mitre, U-turns clamp', () => {
  // Straight along +x: left normal is (0,1), scale 1, endpoints unmitred.
  const line = [{ x: 0, z: 0 }, { x: 100, z: 0 }, { x: 200, z: 0 }];
  const nl = ribbonNormals(line);
  for (const n of nl) { assert.ok(Math.abs(n.x) < 1e-9 && Math.abs(n.z - 1) < 1e-9); assert.equal(n.s, 1); }
  // A 90° corner mitres by 1/cos(45°) = √2.
  const corner = [{ x: 0, z: 0 }, { x: 100, z: 0 }, { x: 100, z: 100 }];
  const nc = ribbonNormals(corner);
  assert.equal(nc[0].s, 1, 'endpoint is unmitred');
  assert.ok(Math.abs(nc[1].s - Math.SQRT2) < 1e-9, '90° corner mitres by √2');
  assert.ok(Math.abs(nc[2].s - 1) < 1e-9);
  assert.ok(Math.abs(Math.hypot(nc[1].x, nc[1].z) - 1) < 1e-9, 'still a unit normal');
  // A near-U-turn clamps instead of firing a long sliver, and never inverts.
  const hairpin = [{ x: 0, z: 0 }, { x: 100, z: 0 }, { x: 0, z: 1 }];
  const nh = ribbonNormals(hairpin);
  assert.equal(nh[1].s, RIBBON_MITRE_LIMIT);
  assert.ok(nh.every((n) => n.s >= 1 && n.s <= RIBBON_MITRE_LIMIT));
  // Deterministic + custom limit honoured.
  assert.deepEqual(ribbonNormals(hairpin), nh);
  assert.equal(ribbonNormals(hairpin, { mitreLimit: 1.5 })[1].s, 1.5);
  assert.deepEqual(ribbonNormals([]), [], 'no points → no normals');
  assert.deepEqual(ribbonNormals([{ x: 3, z: 4 }]), [{ x: 0, z: 0, s: 1 }], 'a lone point degrades safely');
});

// ── curve sampling ──────────────────────────────────────────────────────
test('sampleCatmullRom: hits the endpoints, stays in the control bbox, smooth + deterministic', () => {
  const ctrl = [[0, 0], [100, 200], [250, 120], [400, 300]];
  const out = sampleCatmullRom(ctrl, { minSpacing: 8 });
  assert.ok(out.length > ctrl.length, 'produces a real polyline');
  assert.deepEqual(out[0], [0, 0]);
  assert.deepEqual(out[out.length - 1], [400, 300]);
  const xs = ctrl.map((p) => p[0]), zs = ctrl.map((p) => p[1]);
  for (const [x, z] of out) {
    assert.ok(x >= Math.min(...xs) && x <= Math.max(...xs), 'x inside bbox');
    assert.ok(z >= Math.min(...zs) && z <= Math.max(...zs), 'z inside bbox');
  }
  assert.deepEqual(sampleCatmullRom(ctrl, { minSpacing: 8 }), out, 'deterministic');
});

test('sampleCatmullRom: 1 or 2 control points degrade safely', () => {
  assert.deepEqual(sampleCatmullRom([[3, 4]]), [[3, 4]]);
  assert.deepEqual(sampleCatmullRom([[0, 0], [50, 50]]), [[0, 0], [50, 50]]);
  assert.deepEqual(sampleCatmullRom([]), []);
});

test('resolveRoadSafePlacement handles rotated footprints, bounds and obstacles', () => {
  const roads = [{ width: 12, points: [[0, 100], [300, 100]] }];
  const result = resolveRoadSafePlacement({ position: [150, 100], footprint: [40, 12], rotation: Math.PI / 4,
    roads, bounds: [0, 0, 300, 300], obstacles: [{ pos: [150, 70], footprint: [25, 25] }] });
  assert.ok(result.ok && result.moved, 'an on-road rotated object gets the nearest safe nudge');
  const check = resolveRoadSafePlacement({ position: result.position, footprint: [40, 12], rotation: Math.PI / 4,
    roads, bounds: [0, 0, 300, 300], obstacles: [{ pos: [150, 70], footprint: [25, 25] }], search: false });
  assert.ok(check.ok, 'resolved pose clears the full ribbon and obstacle');
  assert.equal(resolveRoadSafePlacement({ position: [2, 2], footprint: [30, 30], roads: [], bounds: [0, 0, 10, 10], maxDistance: 10 }).ok, false);
  assert.equal(orientedFootprint([0, 0], [20, 10], Math.PI / 2).length, 4);
});

test('legacy road-overlap repair is deterministic and reversible', () => {
  const items = [{ id: 'tree', pos: [100, 100], footprint: [8, 8], locked: true }, { id: 'bench', pos: [180, 180], footprint: [8, 4] }];
  const options = { roads: [{ width: 10, points: [[0, 100], [200, 100]] }], bounds: [0, 0, 250, 250] };
  const a = repairLegacyRoadOverlaps(items, options), b = repairLegacyRoadOverlaps(items, options);
  assert.equal(a.moved, 1, 'only the overlapping item moves');
  assert.deepEqual(a, b, 'repair is deterministic');
  assert.deepEqual(a.snapshot[0].pos, items[0].pos, 'original position remains available for recovery');
  assert.equal(a.changes[0].locked, true, 'road safety is allowed to minimally nudge a lock');
});
