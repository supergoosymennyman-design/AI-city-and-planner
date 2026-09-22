import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ROAD_TEMPLATES } from '../P5 Programme/buddy-kit/client/city-common/road-templates.js';
import { sanitizeLayout, occupiedBounds } from '../P5 Programme/buddy-kit/client/city-common/layout.js';
import { compositionTargets, frontageDistricts, METRIC_PARAMS, ratioTargets } from '../P5 Programme/buddy-kit/client/city-common/metrics.js';
import { optimizeLayout, proposeMoves, applyMove, stableSeed } from '../P5 Programme/buddy-kit/client/city-common/optimize.js';
import { catalogType } from '../P5 Programme/buddy-kit/client/city-common/catalog.js';

const templateLayout = (template) => sanitizeLayout({
  version: 2, scaleMeters: 2000, roads: template.roads,
  parks: template.parks || [], buildings: [],
});

test('every road template receives deterministic proportional frontage districts', () => {
  for (const template of ROAD_TEMPLATES) {
    const layout = templateLayout(template);
    const a = frontageDistricts(layout);
    const b = frontageDistricts(layout);
    assert.deepEqual(a, b, `${template.id}: diagnostics are deterministic`);
    assert.ok(a.length >= 1 && a.length <= 4, `${template.id}: 1–4 districts`);
    assert.equal(a.reduce((n, d) => n + d.targetHomes, 0), 40, `${template.id}: all homes allocated`);
    for (const d of a) {
      assert.ok(d.targetHomes >= 1, `${template.id}/${d.id}: eligible district gets a home`);
      assert.ok(Number.isFinite(d.frontageShare) && d.frontageShare > 0);
      assert.ok(Array.isArray(d.anchor) && d.anchor.length === 2);
      assert.ok(d.bounds.minX <= d.bounds.maxX && d.bounds.minZ <= d.bounds.maxZ);
    }
  }
});

test('square grid fills four districts without corner bias', () => {
  const grid = ROAD_TEMPLATES.find((template) => template.id === 'grid');
  const result = optimizeLayout(templateLayout(grid), {}, 7);
  const districts = compositionTargets(result.layout).districts;
  assert.equal(districts.length, 4);
  for (const district of districts) {
    assert.ok(Math.abs(district.actualHomes - district.targetHomes) <= 1,
      `${district.id}: ${district.actualHomes} homes for target ${district.targetHomes}`);
    assert.ok(district.actualHomes >= 8, `${district.id}: no abandoned quadrant`);
  }
  const biggest = Math.max(...districts.map((d) => d.actualHomes));
  assert.ok(biggest / 40 < 0.4, 'one corner cannot absorb most of the city');
});

test('optimized template districts have services, utilities and green space', () => {
  for (const template of ROAD_TEMPLATES) {
    const result = optimizeLayout(templateLayout(template), {}, 7);
    const c = compositionTargets(result.layout);
    assert.equal(c.distributionScore >= 0.9, true, `${template.id}: balanced distribution`);
    for (const district of c.districts.filter((d) => d.actualHomes > 0)) {
      for (const [kind, missing] of Object.entries(district.localCoverageDeficits)) {
        if (kind === 'green') continue;
        assert.equal(missing, 0, `${template.id}/${district.id}: ${kind} coverage`);
      }
      assert.ok(result.layout.parks.some((park) => {
        const nearest = c.districts.slice().sort((a, b) =>
          Math.hypot(park.cx - a.anchor[0], park.cz - a.anchor[1])
          - Math.hypot(park.cx - b.anchor[0], park.cz - b.anchor[1]))[0];
        return nearest.id === district.id;
      }), `${template.id}/${district.id}: allocated green space`);
    }
  }
});

test('ordinary composition follows the role contract and never invents landmarks', () => {
  for (const homes of [1, 8, 20, 40]) {
    const targets = ratioTargets(homes);
    assert.equal(targets.school, Math.max(1, Math.ceil(homes / 12)));
    assert.equal(targets.shop, Math.max(1, Math.ceil(homes / 8)));
    assert.equal(targets.hospital, Math.max(1, Math.ceil(homes / 20)));
    assert.equal(targets.office, homes >= 4 ? Math.ceil(homes / 10) : 0);
    assert.equal(targets.library, homes >= 8 ? Math.ceil(homes / 15) : 0);
    assert.equal(targets.stadium, homes >= 20 ? Math.ceil(homes / 20) : 0);
  }
  const grid = ROAD_TEMPLATES.find((template) => template.id === 'grid');
  const result = optimizeLayout(templateLayout(grid), {}, 7);
  const automaticSpecials = result.diff.filter((d) => d.action === 'add'
    && catalogType(d.what)?.category === 'special'
    && !METRIC_PARAMS.utilityTypes.includes(d.what));
  assert.deepEqual(automaticSpecials, []);
});

test('district optimisation preserves roads, parks, landmarks and sound ordinary work', () => {
  const grid = templateLayout(ROAD_TEMPLATES.find((template) => template.id === 'grid'));
  grid.buildings.push(
    { type: 'city_central', pos: [520, 520], footprint: [28, 28], height: 100 },
    { type: 'housing', pos: [550, 520], footprint: [20, 20], height: 24 },
  );
  const roads = JSON.stringify(grid.roads), parks = JSON.stringify(grid.parks), buildings = JSON.stringify(grid.buildings);
  const result = optimizeLayout(grid, {}, 17);
  assert.equal(JSON.stringify(result.layout.roads), roads);
  assert.equal(JSON.stringify(result.layout.parks.slice(0, grid.parks.length)), parks);
  for (const building of JSON.parse(buildings)) {
    assert.ok(result.layout.buildings.some((candidate) => JSON.stringify(candidate) === JSON.stringify(building)),
      `${building.type} remains byte-identical`);
  }
});

test('My Move exposes the first decisions from the same full plan', () => {
  const grid = templateLayout(ROAD_TEMPLATES.find((template) => template.id === 'grid'));
  const seed = stableSeed(grid, null);
  const full = optimizeLayout(grid, {}, seed);
  const moves = proposeMoves(grid, {}, 3, seed);
  assert.deepEqual(moves.map((m) => [m.action, m.what, m.from, m.to]),
    full.diff.slice(0, moves.length).map((m) => [m.action, m.what, m.from, m.to]));
  const stepped = applyMove(grid, moves[0]);
  assert.equal(stepped.buildings.length + stepped.parks.length,
    grid.buildings.length + grid.parks.length + 1);
  assert.ok(moves.every((m) => m.objective && Number.isFinite(m.viabilityChange)));
});

test('occupied bounds frame built content while preserving every coordinate', () => {
  const layout = sanitizeLayout({
    version: 2, scaleMeters: 2000,
    roads: [{ points: [[0, 0], [2000, 0]], width: 10 }], parks: [],
    buildings: [{ type: 'housing', pos: [220, 320], footprint: [20, 20], height: 24 }],
  });
  const snapshot = JSON.stringify(layout);
  const bounds = occupiedBounds(layout, { pad: 0 });
  assert.deepEqual(bounds, { minX: 210, minZ: 310, maxX: 230, maxZ: 330 });
  assert.equal(JSON.stringify(layout), snapshot);
});
