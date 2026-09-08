// tests/champion-file.test.mjs — the Champion File round-trip (save → restore).
//
// Run: node --test tests/champion-file.test.mjs   (from the repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHAMPION_FILE_KIND, CHAMPION_FILE_VERSION, CF_KEYS,
  collectState, writeState, composeChampionFile, sanitizeChampionFile, championFilename,
} from '../P5 Programme/buddy-kit/client/city-common/champion-file.js';

/** A fake storage that mimics localStorage's getItem/setItem surface. */
function fakeStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    _map: map,
  };
}

test('CF_KEYS covers the full student-data surface (layout, quests, props, skin, flags)', () => {
  assert.equal(CF_KEYS.layout, 'p5_city_planner_layout_v1');
  assert.equal(CF_KEYS.quests, 'hk_ai_city_quests_v1');
  assert.equal(CF_KEYS.props, 'hk_ai_city_props_citybuilder_v1');
  assert.equal(CF_KEYS.skin, 'hk_ai_city_skin_v2');
  assert.equal(CF_KEYS.plannerUnlocked, 'p5_planner_unlocked');
});

test('CF_KEYS covers planted AI machines (caps) and the city name — data-loss safety net', () => {
  // Regression guard: a child's planted .cap machines and city label must
  // travel inside the Champion File (iOS Safari evicts localStorage ~7 days).
  assert.equal(CF_KEYS.caps, 'p5_city_capabilities_v1');
  assert.equal(CF_KEYS.cityName, 'p5_city_save_name_v1');
});

test('collectState reads only the keys that are present, as raw strings', () => {
  const storage = fakeStorage({
    p5_city_planner_layout_v1: '{"version":2}',
    hk_ai_city_skin_v2: 'crimson',
    p5_planner_unlocked: '1',
  });
  const state = collectState(storage);
  assert.deepEqual(state, {
    layout: '{"version":2}',
    skin: 'crimson',
    plannerUnlocked: '1',
  });
});

test('composeChampionFile produces a kind-tagged, versioned, labelled file', () => {
  const file = composeChampionFile({ layout: '{"version":2}' }, 'Jason week 3');
  assert.equal(file.kind, CHAMPION_FILE_KIND);
  assert.equal(file.version, CHAMPION_FILE_VERSION);
  assert.equal(file.label, 'Jason week 3');
  assert.equal(file.state.layout, '{"version":2}');
  assert.ok(file.savedAt);
});

test('round-trip: compose → sanitize → writeState restores every key', () => {
  const seed = {
    p5_city_planner_layout_v1: '{"version":2,"buildings":[]}',
    hk_ai_city_quests_v1: '{"1":true}',
    hk_ai_city_props_citybuilder_v1: '[]',
    hk_ai_city_skin_v2: 'dragon',
    hk_ai_city_lang_v1: 'zh',
    p5_planner_unlocked: '1',
    p5_city_planner_coach_v1: '1',
    p5_pregame_progress: '{"1":true,"2":true,"3":true,"4":true}',
    p5_city_badges_v1: '{"current":"builder"}',
    p5_city_capabilities_v1: '[{"id":"m1","name":"My Classifier"}]',
    p5_city_save_name_v1: 'Jason week 3',
  };
  const file = composeChampionFile(collectState(fakeStorage(seed)), 'Round trip');
  const parsed = JSON.parse(JSON.stringify(file)); // simulate file download/upload
  const res = sanitizeChampionFile(parsed);
  assert.equal(res.ok, true, res.error);
  const restored = fakeStorage();
  writeState(res.file.state, restored);
  for (const [k, v] of Object.entries(seed)) assert.equal(restored.getItem(k), v, `key ${k}`);
});

test('sanitizeChampionFile rejects wrong kind / wrong version / bad state — never throws', () => {
  assert.equal(sanitizeChampionFile(null).ok, false);
  assert.equal(sanitizeChampionFile('garbage').ok, false);
  assert.equal(sanitizeChampionFile({ kind: 'other', version: 1, state: {} }).ok, false);
  assert.equal(sanitizeChampionFile({ kind: CHAMPION_FILE_KIND, version: 99, state: {} }).ok, false);
  assert.equal(sanitizeChampionFile({ kind: CHAMPION_FILE_KIND, version: 1, state: 'nope' }).ok, false);
  assert.equal(sanitizeChampionFile({ kind: CHAMPION_FILE_KIND, version: 1, state: { layout: 123 } }).ok, false);
  assert.doesNotThrow(() => sanitizeChampionFile(undefined));
  // unknown keys in state are allowed (forward-compat — the apps ignore what they don't know)
  const ok = sanitizeChampionFile({ kind: CHAMPION_FILE_KIND, version: 1, state: { futureKey: 'x' } });
  assert.equal(ok.ok, true);
});

test('championFilename sanitizes a label into a safe filename', () => {
  assert.equal(championFilename('Jason week 3'), 'Jason-week-3.champion.json');
  assert.equal(championFilename('a/b\\c:d*e?f'), 'abcdef.champion.json');
  assert.equal(championFilename(''), 'my-ai-city.champion.json');
  assert.ok(championFilename('x'.repeat(200)).length < 100, 'caps length');
});
