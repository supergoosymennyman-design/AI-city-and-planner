// tests/layout.test.mjs — layout schema validation + sanitization.
//
// Run: node --test tests/layout.test.mjs   (from the repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUT_VERSION, DEFAULT_SCALE, defaultLayout, validateLayout, sanitizeLayout } from '../P5 Programme/buddy-kit/client/city-common/layout.js';

test('defaultLayout is valid and versioned', () => {
  const l = defaultLayout();
  assert.equal(l.version, LAYOUT_VERSION);
  const r = validateLayout(l);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
});

test('validateLayout rejects malformed inputs without throwing', () => {
  assert.equal(validateLayout(null).ok, false);
  assert.equal(validateLayout({}).ok, false);
  assert.equal(validateLayout({ version: 999 }).ok, false, 'unknown version should fail');
});

test('sanitizeLayout recovers a safe default from garbage', () => {
  const s = sanitizeLayout(null);
  assert.equal(s.version, LAYOUT_VERSION);
  assert.equal(typeof s.scaleMeters, 'number');
  const r = validateLayout(s);
  assert.equal(r.ok, true);
});

test('default layout scale is the documented default', () => {
  assert.equal(DEFAULT_SCALE, 2000);
});

test('sanitization preserves explicit true/false locks and duplicate saved instances', () => {
  const buildings = [true, false, undefined].map((locked) => ({
    type: 'traffic_lab', pos: [500, 500], footprint: [31, 29], height: 47,
    ...(locked === undefined ? {} : { locked }),
  }));
  const raw = { ...defaultLayout(), buildings };
  assert.deepEqual(sanitizeLayout(raw).buildings, buildings);
  assert.deepEqual(raw.buildings, buildings);
});
