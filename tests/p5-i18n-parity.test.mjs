// tests/p5-i18n-parity.test.mjs — guards the P5 city i18n dictionaries.
//
// The 2026-09-10 PII/i18n sweep moved a batch of hardcoded English UI strings
// (champion skin + accessory names, in-play toasts, the A6 buddy disclosure) into
// the two dictionaries. This test pins the invariants that keep that sweep honest:
// every key exists in BOTH languages, and tf() interpolates its {tokens}.
//
// Run: node --test tests/p5-i18n-parity.test.mjs   (from the repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DICT as CITY_BUILDER, tf } from '../P5 Programme/buddy-kit/client/city-builder/i18n.js';
import { DICT as CHAMPION_CITY } from '../P5 Programme/buddy-kit/client/champion-city/i18n.js';

const LANG_KEY = 'zh-Hant';

/** Assert en and zh-Hant have exactly the same key set, and report the diff. */
function assertParity(name, dict) {
  const en = Object.keys(dict.en).sort();
  const zh = Object.keys(dict[LANG_KEY]).sort();
  const missingZh = en.filter((k) => !(k in dict[LANG_KEY]));
  const missingEn = zh.filter((k) => !(k in dict.en));
  assert.deepEqual(missingZh, [], `${name}: keys present in en but missing in zh-Hant`);
  assert.deepEqual(missingEn, [], `${name}: keys present in zh-Hant but missing in en`);
  assert.deepEqual(zh, en, `${name}: key sets must match exactly`);
}

test('city-builder i18n: en and zh-Hant dictionaries have identical keys', () => {
  assertParity('city-builder', CITY_BUILDER);
});

test('champion-city i18n: en and zh-Hant dictionaries have identical keys', () => {
  assertParity('champion-city', CHAMPION_CITY);
});

test('A6 disclosure key exists in both languages', () => {
  assert.ok(CITY_BUILDER.en['buddy.disclosure'], 'en buddy.disclosure missing');
  assert.ok(CITY_BUILDER[LANG_KEY]['buddy.disclosure'], 'zh-Hant buddy.disclosure missing');
});

test('A11 custom-skin note + champion sidebar keys exist in both languages', () => {
  for (const key of ['skins.customNote', 'skins.myChampion', 'skins.loading', 'skins.crimson', 'acc.slot.head', 'acc.head_crown']) {
    assert.ok(CHAMPION_CITY.en[key], `champion-city en ${key} missing`);
    assert.ok(CHAMPION_CITY[LANG_KEY][key], `champion-city zh-Hant ${key} missing`);
  }
});

test('tf() interpolates {tokens} and leaves unknown tokens untouched', () => {
  // t() defaults to en when no language was initialised (Node has no localStorage).
  assert.equal(tf('toast.walking', { name: 'Park' }), '🚶 Walking to Park…');
  assert.equal(tf('toast.drivingCar', { name: 'Bus' }).includes('Bus'), true);
  // No vars → the raw string is returned unchanged (no crash on a missing map).
  assert.equal(tf('toast.arrived'), CITY_BUILDER.en['toast.arrived']);
});

test('no dictionary value is an empty string', () => {
  for (const [name, dict] of [['city-builder', CITY_BUILDER], ['champion-city', CHAMPION_CITY]]) {
    for (const lang of ['en', LANG_KEY]) {
      for (const [k, v] of Object.entries(dict[lang])) {
        assert.equal(typeof v, 'string', `${name}.${lang}.${k} must be a string`);
        assert.notEqual(v.trim(), '', `${name}.${lang}.${k} must not be empty`);
      }
    }
  }
});
