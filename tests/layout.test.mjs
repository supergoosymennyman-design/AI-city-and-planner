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
