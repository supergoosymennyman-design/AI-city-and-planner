// tests/pregame-i18n.test.mjs — City Planning Academy bilingual dictionary guard.
//
// The Academy is shipped in EN + zh-Hant. The two tables must stay in lockstep:
// every key present in one language must exist in the other, no value may be
// empty, and every `{placeholder}` must survive translation (a dropped
// placeholder would silently print a broken sentence to a child).
// Run: node --test tests/pregame-i18n.test.mjs   (from the repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DICT } from '../P5 Programme/buddy-kit/client/city-pregame/i18n.js';

const EN = DICT.en;
const ZH = DICT['zh-Hant'];

test('pregame i18n: en and zh-Hant expose identical, non-empty keys', () => {
  const ek = Object.keys(EN).sort();
  const zk = Object.keys(ZH).sort();
  assert.deepEqual(zk, ek, 'zh-Hant keys must mirror en exactly');
  for (const k of ek) {
    assert.equal(typeof EN[k], 'string', `en[${k}] must be a string`);
    assert.equal(typeof ZH[k], 'string', `zh[${k}] must be a string`);
    assert.ok(EN[k].trim().length > 0, `en[${k}] is empty`);
    assert.ok(ZH[k].trim().length > 0, `zh[${k}] is empty`);
  }
});

test('pregame i18n: placeholders and HTML tags survive translation', () => {
  const ph = (s) => (String(s).match(/\{[a-zA-Z0-9_]+\}/g) || []).sort().join(',');
  const tags = (s) => (String(s).match(/<\/?(strong|code)>/g) || []).sort().join(',');
  for (const k of Object.keys(EN)) {
    assert.equal(ph(ZH[k]), ph(EN[k]), `placeholder mismatch in ${k}`);
    assert.equal(tags(ZH[k]), tags(EN[k]), `HTML tag mismatch in ${k}`);
  }
});

test('pregame i18n: the four room bridges and Dijkstra narration are translated', () => {
  // The Sprint B acceptance set — these must not silently fall back to English.
  for (const key of ['room.1.bridge', 'room.2.bridge', 'room.3.bridge', 'room.4.bridge',
    'c3.markReach', 'c3.markFound', 'c3.settleNode', 'c3.busReached',
    'c4.escape.reveal', 'pg.room.pathAria', 'c1.lab.title']) {
    assert.notEqual(ZH[key], EN[key], `${key} was not translated`);
    assert.ok(/[\u3400-\u9fff]/.test(ZH[key]), `${key} has no Chinese characters`);
  }
});
