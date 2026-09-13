// tests/license.test.mjs — legacy Academy migration guard.
//
// Run: node --test tests/license.test.mjs   (from the repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CF_KEYS, collectState, composeChampionFile, sanitizeChampionFile, writeState } from '../P5 Programme/buddy-kit/client/city-common/champion-file.js';

function storage() {
  const values = new Map();
  return { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
}

test('Academy Champion File round-trips progress without a license credential', () => {
  const source = storage();
  source.setItem(CF_KEYS.pregame, JSON.stringify({ 1: true, 2: true }));
  const file = composeChampionFile(collectState(source), 'My Academy progress');
  assert.equal('license' in file, false);
  const parsed = sanitizeChampionFile(JSON.parse(JSON.stringify(file)));
  assert.equal(parsed.ok, true);
  const target = storage();
  assert.deepEqual(writeState(parsed.file.state, target), { wrote: 1, total: 1, ok: true, failed: [] });
  assert.equal(target.getItem(CF_KEYS.pregame), source.getItem(CF_KEYS.pregame));
});

test('invalid Champion Files are rejected before any restore writes', () => {
  const target = storage();
  const bad = sanitizeChampionFile({ kind: 'wrong', version: 1, state: {} });
  assert.equal(bad.ok, false);
  assert.equal(target.getItem(CF_KEYS.layout), null);
});
