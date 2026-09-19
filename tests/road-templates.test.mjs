// tests/road-templates.test.mjs — pre-built road networks sanity checks.
//
// Run: node --test tests/road-templates.test.mjs   (from the repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROAD_TEMPLATES, getRoadTemplate } from '../P5 Programme/buddy-kit/client/city-common/road-templates.js';
import { sanitizeLayout, validateLayout } from '../P5 Programme/buddy-kit/client/city-common/layout.js';

const SCALE = 2000;

test('there are at least 6 road templates', () => {
  assert.ok(ROAD_TEMPLATES.length >= 6, `expected 6+, got ${ROAD_TEMPLATES.length}`);
});

test('every template has unique id, name, emoji, note and goodFor', () => {
  const ids = new Set();
  for (const t of ROAD_TEMPLATES) {
    assert.ok(t.id && typeof t.id === 'string');
    assert.ok(!ids.has(t.id), `duplicate id ${t.id}`);
    ids.add(t.id);
    assert.ok(t.name && typeof t.name === 'string');
    assert.ok(t.emoji && typeof t.emoji === 'string');
    assert.ok(t.note && typeof t.note === 'string');
    assert.ok(t.goodFor && typeof t.goodFor === 'string');
    assert.ok(Array.isArray(t.roads) && t.roads.length >= 2, `${t.id}: needs >= 2 roads`);
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
