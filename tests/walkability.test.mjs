// tests/walkability.test.mjs — road-graph walk reach tests.
//
// Run: node --test tests/walkability.test.mjs   (from the repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeWalkReach, buildWalkGraph, walkPath, homeReachRoutes, WALK_BUDGET } from '../P5 Programme/buddy-kit/client/city-common/walkability.js';
import { sanitizeLayout } from '../P5 Programme/buddy-kit/client/city-common/layout.js';
import { computeMetrics } from '../P5 Programme/buddy-kit/client/city-common/metrics.js';

test('no roads: reach is 0 for homes, 1 for no homes', () => {
  const withHomes = sanitizeLayout({
    version: 2, scaleMeters: 2000, roads: [], parks: [],
    buildings: [{ type: 'housing', pos: [1000, 1000], footprint: [20, 20], height: 24 }],
  });
  assert.equal(computeWalkReach(withHomes).reach, 0);

  const empty = sanitizeLayout({ version: 2, scaleMeters: 2000, roads: [], parks: [], buildings: [] });
  assert.equal(computeWalkReach(empty).reach, 1, 'no homes = vacuous 1');
});

test('home on a road can walk to a school within the budget', () => {
  const layout = sanitizeLayout({
    version: 2, scaleMeters: 2000,
    roads: [{ points: [[100, 1000], [1900, 1000]], width: 14, class: 'primary' }],
    parks: [],
    buildings: [
      { type: 'housing', pos: [900, 1000], footprint: [20, 20], height: 24 },
      { type: 'school', pos: [1100, 1000], footprint: [26, 24], height: 20 },
    ],
  });
  const w = computeWalkReach(layout);
  assert.equal(w.homes.length, 1);
  assert.ok(w.homes[0].dist.school <= 400, `school should be within budget (${Math.round(w.homes[0].dist.school)}m)`);
  assert.equal(w.homes[0].ok.school, true);
  assert.ok(w.reach > 0, 'reach should be > 0');
});

test('home 150m from a crossing reaches school 150m away exactly (no node-snap error)', () => {
  const layout = sanitizeLayout({
    version: 2, scaleMeters: 2000,
    roads: [
      { points: [[100, 1000], [1900, 1000]], width: 14, class: 'primary' },
      { points: [[1000, 100], [1000, 1900]], width: 14, class: 'primary' },
    ],
    parks: [],
    buildings: [
      { type: 'housing', pos: [1000, 1000], footprint: [20, 20], height: 24 },
      { type: 'school', pos: [1000, 1150], footprint: [26, 24], height: 20 },
    ],
  });
  const w = computeWalkReach(layout);
  assert.ok(Math.abs(w.homes[0].dist.school - 150) < 5, `expected ~150m walk, got ${w.homes[0].dist.school}`);
});

test('disconnected road components: the school is unreachable', () => {
  const layout = sanitizeLayout({
    version: 2, scaleMeters: 2000,
    roads: [
      { points: [[100, 300], [500, 300]], width: 14, class: 'primary' },
      { points: [[1500, 300], [1900, 300]], width: 14, class: 'primary' },
    ],
    parks: [],
    buildings: [
      { type: 'housing', pos: [300, 300], footprint: [20, 20], height: 24 },
      { type: 'school', pos: [1700, 300], footprint: [26, 24], height: 20 },
    ],
  });
  const w = computeWalkReach(layout);
  assert.equal(w.homes[0].dist.school, Infinity);
  assert.equal(w.homes[0].ok.school, false);
});

test('walkPath returns a coordinate path between connected nodes, null when disconnected', () => {
  const layout = sanitizeLayout({
    version: 2, scaleMeters: 2000,
    roads: [{ points: [[100, 1000], [1900, 1000]], width: 14, class: 'primary' }],
    parks: [],
    buildings: [
      { type: 'housing', pos: [900, 1000], footprint: [20, 20], height: 24 },
      { type: 'school', pos: [1100, 1000], footprint: [26, 24], height: 20 },
    ],
  });
  const g = buildWalkGraph(layout);
  assert.ok(g, 'graph should exist');
  const path = walkPath(g, g.access.buildings[0].node, g.access.buildings[1].node);
  assert.ok(path && path.length >= 2, 'should have a path');
  assert.ok(path.every((p) => Number.isFinite(p.x) && Number.isFinite(p.z)));

  const disconnected = sanitizeLayout({
    version: 2, scaleMeters: 2000,
    roads: [
      { points: [[100, 300], [500, 300]], width: 14, class: 'primary' },
      { points: [[1500, 300], [1900, 300]], width: 14, class: 'primary' },
    ],
    parks: [],
    buildings: [
      { type: 'housing', pos: [300, 300], footprint: [20, 20], height: 24 },
      { type: 'school', pos: [1700, 300], footprint: [26, 24], height: 20 },
    ],
  });
  const g2 = buildWalkGraph(disconnected);
  assert.equal(walkPath(g2, g2.access.buildings[0].node, g2.access.buildings[1].node), null);
});

test('walk reach folds into metrics walkable goal and budget is sane', () => {
  const layout = sanitizeLayout({
    version: 2, scaleMeters: 2000,
    roads: [{ points: [[100, 1000], [1900, 1000]], width: 14, class: 'primary' }],
    parks: [],
    buildings: [
      { type: 'housing', pos: [900, 1000], footprint: [20, 20], height: 24 },
      { type: 'school', pos: [1100, 1000], footprint: [26, 24], height: 20 },
    ],
  });
  const w = computeWalkReach(layout);
  const m = computeMetrics(layout, undefined, undefined, w);
  assert.equal(m.goals.walkable, (m.accessibility + w.reach) / 2);
  assert.ok(WALK_BUDGET > 0 && Number.isInteger(WALK_BUDGET));
});

test('all homes: mean reach is deterministic and bounded', () => {
  const layout = sanitizeLayout({
    version: 2, scaleMeters: 2000,
    roads: [
      { points: [[100, 1000], [1900, 1000]], width: 14, class: 'primary' },
      { points: [[1000, 100], [1000, 1900]], width: 14, class: 'primary' },
    ],
    parks: [{ cx: 1000, cz: 800, radius: 60 }],
    buildings: [
      { type: 'housing', pos: [500, 500], footprint: [20, 20], height: 24 },
      { type: 'housing', pos: [1500, 1500], footprint: [20, 20], height: 24 },
      { type: 'school', pos: [1000, 950], footprint: [26, 24], height: 20 },
      { type: 'shop', pos: [1000, 1050], footprint: [32, 32], height: 26 },
      { type: 'hospital', pos: [900, 1000], footprint: [30, 26], height: 34 },
      { type: 'fire', pos: [1100, 1000], footprint: [22, 20], height: 16 },
      { type: 'police', pos: [1000, 1100], footprint: [22, 20], height: 18 },
      { type: 'water', pos: [1000, 700], footprint: [24, 24], height: 40 },
      { type: 'power', pos: [1000, 1300], footprint: [24, 24], height: 44 },
      { type: 'bus', pos: [800, 1000], footprint: [26, 20], height: 38 },
    ],
  });
  const a = computeWalkReach(layout);
  const b = computeWalkReach(layout);
  assert.equal(a.reach, b.reach, 'deterministic');
  assert.ok(a.reach >= 0 && a.reach <= 1);
  assert.equal(a.homes.length, 2);
});

// ── homeReachRoutes (the planner's visible Dijkstra paths) ──────────────
test('homeReachRoutes returns a real route to a school on the same road', () => {
  const layout = sanitizeLayout({
    version: 2, scaleMeters: 2000,
    roads: [{ points: [[100, 1000], [1900, 1000]], width: 14, class: 'primary' }],
    parks: [],
    buildings: [
      { type: 'housing', pos: [900, 1000], footprint: [20, 20], height: 24 },
      { type: 'school', pos: [1100, 1000], footprint: [26, 24], height: 20 },
    ],
  });
  const w = computeWalkReach(layout);
  const routes = homeReachRoutes(layout, w, 0);
  const school = routes.find((r) => r.type === 'school');
  assert.ok(school, 'expected a school route');
  assert.ok(school.ok, 'school within budget should be ok');
  assert.ok(school.path.length >= 2, 'path should have at least 2 nodes');
  assert.ok(school.dist <= WALK_BUDGET);
});

test('homeReachRoutes marks an out-of-budget need as NOT ok (red)', () => {
  const layout = sanitizeLayout({
    version: 2, scaleMeters: 2000,
    roads: [{ points: [[100, 1000], [1900, 1000]], width: 14, class: 'primary' }],
    parks: [],
    buildings: [
      { type: 'housing', pos: [200, 1000], footprint: [20, 20], height: 24 },
      { type: 'hospital', pos: [1800, 1000], footprint: [30, 26], height: 34 },
    ],
  });
  const w = computeWalkReach(layout);
  const routes = homeReachRoutes(layout, w, 0);
  const hospital = routes.find((r) => r.type === 'hospital');
  assert.ok(hospital, 'hospital route should exist (there is a hospital)');
  assert.equal(hospital.ok, false, '1600m walk must be outside the 400m budget');
  assert.ok(hospital.dist > WALK_BUDGET);
  assert.ok(hospital.path.length >= 2, 'still draws the path — so the child sees WHY');
});

test('homeReachRoutes route path distances match the walk engine distances', () => {
  const layout = sanitizeLayout({
    version: 2, scaleMeters: 2000,
    roads: [
      { points: [[100, 1000], [1900, 1000]], width: 14, class: 'primary' },
      { points: [[1000, 100], [1000, 1900]], width: 14, class: 'primary' },
    ],
    parks: [{ cx: 1000, cz: 700, radius: 60 }],
    buildings: [
      { type: 'housing', pos: [1000, 1200], footprint: [20, 20], height: 24 },
      { type: 'shop', pos: [1000, 900], footprint: [32, 32], height: 26 },
    ],
  });
  const w = computeWalkReach(layout);
  const routes = homeReachRoutes(layout, w, 0);
  // Sum the drawn path's segment lengths — must be ~ the reported dist.
  for (const r of routes.filter((r) => r.path.length)) {
    let sum = 0;
    for (let i = 0; i < r.path.length - 1; i++) {
      sum += Math.hypot(r.path[i + 1].x - r.path[i].x, r.path[i + 1].z - r.path[i].z);
    }
    assert.ok(Math.abs(sum - r.dist) < 8, `${r.type}: drawn path ${Math.round(sum)}m vs reported ${r.dist}m`);
  }
});

test('homeReachRoutes reports no selected home and no road access explicitly', () => {
  const noRoad = sanitizeLayout({
    version: 2, scaleMeters: 2000, roads: [], parks: [],
    buildings: [{ type: 'housing', pos: [1000, 1000], footprint: [20, 20], height: 24 }],
  });
  const wNo = computeWalkReach(noRoad);
  assert.equal(homeReachRoutes(noRoad, wNo, 0).length, 9);
  assert.ok(homeReachRoutes(noRoad, wNo, 0).every((r) => r.status === 'no-road-access' && !r.ok && r.path.length === 0));

  const nonHome = sanitizeLayout({
    version: 2, scaleMeters: 2000,
    roads: [{ points: [[100, 1000], [1900, 1000]], width: 14, class: 'primary' }],
    parks: [], buildings: [{ type: 'school', pos: [1000, 1000], footprint: [26, 24], height: 20 }],
  });
  const wS = computeWalkReach(nonHome);
  assert.deepEqual(homeReachRoutes(nonHome, wS, 0), [{ type: null, status: 'no-selected-home', dist: null, ok: false, path: [] }]);
});
