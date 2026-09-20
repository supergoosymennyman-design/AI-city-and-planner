import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeState, composeChampionFile, sanitizeChampionFile, MAX_IMPORT_BYTES, withinImportLimit } from '../P5 Programme/buddy-kit/client/city-common/champion-file.js';
import { validateLayout } from '../P5 Programme/buddy-kit/client/city-common/layout.js';
import { allowedGameUrl } from '../P5 Programme/buddy-kit/client/city-common/game-url.js';
import { QUESTS } from '../P5 Programme/buddy-kit/client/hong-kong-real/quests.js';
import { readFileSync } from 'node:fs';
const { WORKSHOP_URL } = await import('data:text/javascript;base64,' + Buffer.from(readFileSync(new URL('../P5 Programme/buddy-kit/client/shared/links.js', import.meta.url), 'utf8')).toString('base64'));

test('restore ignores inherited key names and preserves raw history', () => {
  const writes = [];
  const state = JSON.parse('{"constructor":"x","toString":"y","__proto__":"z"}');
  state.quests = ' { "completed": [1,18,999] } ';
  const res = writeState(state, { setItem: (...args) => writes.push(args) });
  assert.equal(res.total, 1);
  assert.deepEqual(writes, [['hk_ai_city_quests_v1', state.quests]]);
});
test('size checks count UTF-8 bytes and accept legacy-sized files', () => {
  assert.equal(withinImportLimit('x'.repeat(MAX_IMPORT_BYTES)), true);
  assert.equal(withinImportLimit('字'.repeat(MAX_IMPORT_BYTES / 2)), false);
  assert.equal(sanitizeChampionFile(composeChampionFile({ layout: 'x'.repeat(MAX_IMPORT_BYTES) })).ok, false);
  assert.equal(sanitizeChampionFile(composeChampionFile({ layout: '{"version":1}' })).ok, true);
});
test('layout validator is total for malformed JSON values', () => {
  for (const buildings of [[null, { type: 'city_central', pos: [50,50] }], [{type:'city_central', pos:[50,50], footprint:['bad', 20]}]]) {
    assert.equal(validateLayout({ version:2, buildings }).ok, false);
  }
  assert.equal(validateLayout({ version: { toString: null } }).ok, false);
  assert.equal(sanitizeChampionFile({ kind:'passiona-champion-file', version:{toString:null} }).ok, false);
});
test('resolved game URLs require approved origins and destinations, including legacy games', () => {
  const base = 'http://localhost:8377/city-builder/';
  const destinations = [...QUESTS.map(q => q.gameUrl), WORKSHOP_URL];
  for (const url of destinations.filter(Boolean)) assert.equal(allowedGameUrl(url, base, destinations), true, url);
  for (const url of ['//evil.example/', '/\\evil.example/', 'javascript:alert(1)', 'data:text/html,test', 'https://unlisted.ai-education.workers.dev/', '/unapproved/', 'https://falling-tooth-552b.supergoosymennyman.workers.dev/other', 'https://user@falling-tooth-552b.supergoosymennyman.workers.dev/', 'https://falling-tooth-552b.supergoosymennyman.workers.dev:444/']) assert.equal(allowedGameUrl(url, base, destinations), false, url);
});
