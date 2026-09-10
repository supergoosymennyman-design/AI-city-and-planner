// tests/p5-champion-i18n-sync.test.mjs — the champion sidebar must follow the app-wide 中/EN toggle.
//
// Gemini pass-3 (architecture) surfaced that champion-city/i18n.js and city-builder/i18n.js are two
// modules each holding their OWN `_lang`. The city HUD toggle updates only the city-builder copy and
// fires `i18n:change`; without a listener here the champion skin sidebar (which uses THIS module's
// t()) froze in its boot language. This pins the fix.
//
// Run: node --test tests/p5-champion-i18n-sync.test.mjs   (from the repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Minimal browser shims so the module's guarded window/localStorage paths run in Node. Set BEFORE
// the dynamic import so the module-level i18n:change listener is captured.
const listeners = {};
const store = {};
globalThis.window = {
  addEventListener: (ev, fn) => { (listeners[ev] ||= []).push(fn); },
  dispatchEvent: () => {},
};
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
};
// (No navigator shim: Node v26 exposes a read-only global navigator, and the test always sets the
// persisted LANG_KEY, so initI18n never falls through to the browser-locale branch.)

const cc = await import('../P5 Programme/buddy-kit/client/champion-city/i18n.js');

test('champion-city i18n re-reads the language when the app-wide toggle fires', () => {
  store['hk_ai_city_lang_v1'] = 'en';
  cc.initI18n();
  assert.equal(cc.currentLang(), 'en');

  // The city HUD is a DIFFERENT i18n module: it persists the new language and fires i18n:change.
  store['hk_ai_city_lang_v1'] = 'zh-Hant';
  for (const fn of (listeners['i18n:change'] || [])) fn();

  assert.equal(cc.currentLang(), 'zh-Hant', 'the sidebar i18n must re-read the persisted language');
  assert.equal(cc.t('skins.presets'), '造型');
});

test('the sync is idempotent when this module itself toggled', () => {
  store['hk_ai_city_lang_v1'] = 'en';
  for (const fn of (listeners['i18n:change'] || [])) fn();
  assert.equal(cc.currentLang(), 'en');
});
