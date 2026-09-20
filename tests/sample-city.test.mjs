// tests/sample-city.test.mjs — the bundled example AI city generator.
//
// The example city must always be a *safe, readable* city:
//   - valid layout that survives sanitize + densify (densify is now
//     geometry-preserving, so the authored layout IS the rendered 3D layout),
//   - every one of the 18 mission buildings present exactly once,
//   - no building sitting on a road,
//   - no building overlapping another or the central park,
//   - deterministic (same city on every boot).
//
// Run: node --test tests/sample-city.test.mjs   (from the repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSampleCity, sampleCityRoads, sampleCityParks, CX, CZ,
} from '../P5 Programme/buddy-kit/client/city-common/sample-city.js';
import { buildTrafficNetwork, planTrafficLoops } from '../P5 Programme/buddy-kit/client/city-common/traffic-network.js';
import { validateLayout, sanitizeLayout, densifyLayout, ROAD_WIDTH } from '../P5 Programme/buddy-kit/client/city-common/layout.js';
import { specialKeys } from '../P5 Programme/buddy-kit/client/city-common/catalog.js';
import { libraryItem } from '../P5 Programme/buddy-kit/client/city-common/library.js';

// ── 2D rectangle overlap via SAT ───────────────────────────────────────────
function rectOverlaps(ptsA, ptsB) {
  const axes = [];
  for (const pts of [ptsA, ptsB]) {
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      axes.push([-(q[1] - p[1]), q[0] - p[0]]);
    }
  }
  for (const [ax, ay] of axes) {
    const len = Math.hypot(ax, ay) || 1;
    const proj = (pts) => {
      let mn = Infinity, mx = -Infinity;
      for (const [x, y] of pts) {
        const v = (x * ax + y * ay) / len;
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
      return [mn, mx];
    };
    const [a1, a2] = proj(ptsA);
    const [b1, b2] = proj(ptsB);
    if (a2 < b1 || b2 < a1) return false;
  }
  return true;
}

function buildingCorners(b) {
  const fp = b.footprint || [20, 20];
  const x = b.pos[0], z = b.pos[1];
  return [
    [x - fp[0] / 2, z - fp[1] / 2],
    [x + fp[0] / 2, z - fp[1] / 2],
    [x + fp[0] / 2, z + fp[1] / 2],
    [x - fp[0] / 2, z + fp[1] / 2],
  ];
}

function roadSegmentCorners(a, b, half) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const len = Math.hypot(dx, dz) || 1;
  const nx = (-dz / len) * half, nz = (dx / len) * half;
  return [
    [a[0] + nx, a[1] + nz], [b[0] + nx, b[1] + nz],
    [b[0] - nx, b[1] - nz], [a[0] - nx, a[1] - nz],
  ];
}

function postCheck(buildings, roads, parks) {
  const problems = [];
  for (let bi = 0; bi < buildings.length; bi++) {
    const b = buildings[bi];
    const bc = buildingCorners(b);
    // building ↔ road ribbon
    for (const r of roads) {
      const half = (r.width || ROAD_WIDTH[r.class] || 9) / 2;
      const pts = r.points;
      for (let i = 0; i < pts.length - 1; i++) {
        const rc = roadSegmentCorners(pts[i], pts[i + 1], half);
        if (rectOverlaps(bc, rc)) {
          problems.push(`building[${bi}] ${b.type} @(${b.pos[0]},${b.pos[1]}) overlaps road ${r.class}`);
          break;
        }
      }
    }
    // building ↔ building
    for (let bj = bi + 1; bj < buildings.length; bj++) {
      if (rectOverlaps(bc, buildingCorners(buildings[bj]))) {
        problems.push(`building[${bi}] ${b.type} overlaps building[${bj}] ${buildings[bj].type}`);
      }
    }
    // building ↔ park circle
    for (const p of parks) {
      const d = Math.hypot(b.pos[0] - p.cx, b.pos[1] - p.cz);
      const fp = b.footprint || [20, 20];
      const half = Math.max(fp[0], fp[1]) / 2;
      if (d < (p.radius || 0) + half - 1) {
        problems.push(`building[${bi}] ${b.type} too close to park`);
      }
    }
  }
  return problems;
}

test('sample city: valid layout, roads+park shape, deterministic', () => {
  const c1 = buildSampleCity();
  const v = validateLayout(c1);
  assert.equal(v.ok, true, v.errors.join('; '));
  assert.equal(sampleCityRoads().length, 10, '4 cross segments + outer ring + central roundabout + 4 diagonal spokes');
  assert.equal(sampleCityParks().length, 1);
  assert.deepEqual(buildSampleCity(), c1, 'sample city must be deterministic');
});

test('sample city: all 18 mission buildings present exactly once, lib ids resolve', () => {
  const c = buildSampleCity();
  const counts = {};
  for (const b of c.buildings) {
    counts[b.type] = (counts[b.type] || 0) + 1;
    if (b.type.startsWith('lib:')) {
      assert.ok(libraryItem(b.type.slice(4)), `lib id ${b.type} must exist in library.js`);
    }
  }
  for (const key of specialKeys()) {
    assert.equal(counts[key], 1, `mission ${key} present exactly once`);
  }
  assert.ok(c.buildings.length >= 150, `sample should read as a full city (got ${c.buildings.length})`);
});

test('sample city: the central roundabout is really joined to every approach', () => {
  const roads = sampleCityRoads();
  const net = buildTrafficNetwork(roads);
  // 8 approach junctions on the central ring (4 cross arms + 4 diagonals).
  const central = net.nodes.filter((n) => Math.hypot(n.x - CX, n.z - CZ) < 140 && n.roads.size > 1);
  assert.ok(central.length >= 8, `central ring joins 8 branches (got ${central.length})`);
  // And a real traffic loop circulates it — the roundabout is the last road.
  const roundRoadId = roads.length - 1;
  const plan = planTrafficLoops(net);
  assert.ok(plan.routes.some((r) => r.links.some((l) => l.roadId === roundRoadId)),
    'a loop drives around the central roundabout');
});

test('sample city: no building sits on a road, overlaps a neighbour, or hits the park (post-densify)', () => {
  const raw = buildSampleCity();
  const layout = sanitizeLayout(raw);
  const dense = densifyLayout(layout);
  const problems = postCheck(dense.layout.buildings, dense.layout.roads, dense.layout.parks);
  assert.deepEqual(problems, []);
});
