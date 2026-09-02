// tests/walkability.test.mjs — road-graph walk reach tests.
//
// Run: node --test tests/walkability.test.mjs   (from the repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeWalkReach, buildWalkGraph, walkPath, WALK_BUDGET } from '../P5 Programme/buddy-kit/client/city-common/walkability.js';
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
