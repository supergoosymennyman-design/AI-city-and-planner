// tests/road-templates.test.mjs — pre-built road networks sanity checks.
//
// Run: node --test tests/road-templates.test.mjs   (from the repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROAD_TEMPLATES, getRoadTemplate, roadTemplateThumbnailSvg } from '../P5 Programme/buddy-kit/client/city-common/road-templates.js';
import { sanitizeLayout, validateLayout } from '../P5 Programme/buddy-kit/client/city-common/layout.js';
import { roadBands, rectRoadClearance, ROAD_CLEARANCE_MARGIN } from '../P5 Programme/buddy-kit/client/city-common/road-geometry.js';
import { auditRoadTemplate } from '../P5 Programme/buddy-kit/client/city-common/road-template-audit.js';

const SCALE = 2000;

test('there are at least 6 road templates', () => {
  assert.ok(ROAD_TEMPLATES.length >= 6, `expected 6+, got ${ROAD_TEMPLATES.length}`);
});

test('eight stable templates have chooser metadata without unsupported mayor claims', () => {
  const ids = new Set();
  assert.deepEqual(ROAD_TEMPLATES.map((t) => t.id), ['grid', 'radial', 'superblocks', 'culdesacs', 'twincenters', 'rivercity', 'coastal', 'diagonal']);
  for (const t of ROAD_TEMPLATES) {
    assert.ok(t.id && typeof t.id === 'string');
    assert.ok(!ids.has(t.id), `duplicate id ${t.id}`);
    ids.add(t.id);
    assert.ok(t.name && typeof t.name === 'string');
    assert.ok(t.emoji && typeof t.emoji === 'string');
    assert.ok(t.note && typeof t.note === 'string');
    assert.equal('goodFor' in t, false, `${t.id}: chooser must not promise a mayor outcome`);
    assert.ok(Array.isArray(t.roads) && t.roads.length >= 2, `${t.id}: needs >= 2 roads`);
  }
});

test('template previews are generated from each template geometry', () => {
  for (const template of ROAD_TEMPLATES) {
    const svg = roadTemplateThumbnailSvg(template);
    assert.match(svg, /<svg/);
    assert.equal((svg.match(/<polyline/g) || []).length, template.roads.length, template.id);
    assert.equal((svg.match(/<circle/g) || []).length, (template.parks || []).length, template.id);
  }
});

test('parks have their radius plus road clearance clear of asphalt', () => {
  for (const template of ROAD_TEMPLATES) {
    const bands = roadBands(template.roads);
    for (const park of template.parks || []) {
      assert.ok(rectRoadClearance(park.cx, park.cz, [0, 0], bands) >= park.radius + ROAD_CLEARANCE_MARGIN,
        `${template.id}: park touches a road ribbon`);
    }
  }
});

test('template quality audit keeps every starter city connected, buildable and close to streets', () => {
  for (const template of ROAD_TEMPLATES) {
    const audit = auditRoadTemplate(template);
    assert.equal(audit.connected, true, `${template.id}: disconnected walking graph`);
    assert.ok(audit.trafficCircuits >= 1, `${template.id}: no traffic circuit`);
    assert.equal(audit.capacityHomes, 40, `${template.id}: cannot reach 40 homes`);
    assert.ok(audit.pads44x40 >= 80, `${template.id}: only ${audit.pads44x40} home pads`);
    assert.ok(audit.civic60 >= 12, `${template.id}: only ${audit.civic60} civic pads`);
    assert.ok(audit.farthestRoad <= 350, `${template.id}: land too far from a road`);
    assert.ok(audit.parkClearance >= ROAD_CLEARANCE_MARGIN, `${template.id}: park clearance`);
  }
});

test('every template validates and sanitizes cleanly', () => {
  for (const t of ROAD_TEMPLATES) {
    const layout = sanitizeLayout({ version: 2, scaleMeters: SCALE, roads: t.roads, parks: t.parks || [] });
    const v = validateLayout(layout);
    assert.ok(v.ok, `${t.id}: ${v.errors[0]}`);
    assert.equal(layout.roads.length, t.roads.length, `${t.id}: road count`);
  }
});

test('every template is in-bounds with a sensible extent (covers most of the map)', () => {
  for (const t of ROAD_TEMPLATES) {
    const layout = sanitizeLayout({ version: 2, scaleMeters: SCALE, roads: t.roads, parks: t.parks || [] });
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const r of layout.roads) {
      for (const [x, z] of r.points) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }
    }
    assert.ok(minX >= 0 && maxX <= SCALE && minZ >= 0 && maxZ <= SCALE, `${t.id}: out of bounds`);
    const span = Math.max(maxX - minX, maxZ - minZ);
    assert.ok(span > SCALE * 0.5, `${t.id}: network should span most of the map (spans ${Math.round(span)}m)`);
  }
});

test('getRoadTemplate handles unknown ids safely', () => {
  assert.equal(getRoadTemplate('nope'), null);
  assert.equal(getRoadTemplate('grid').id, 'grid');
});
