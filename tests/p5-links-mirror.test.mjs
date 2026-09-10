// tests/p5-links-mirror.test.mjs — drift guard for the two links modules.
//
// Gemini pass-3 flagged client/home/links.js as a manual mirror of client/shared/links.js (the home
// worker ships only its own folder, so it cannot import the shared one). This test reads both as
// text and asserts the URL constants stay identical, so a rename/migration cannot silently update
// only one app. (Text-parsed on purpose: importing would need a package.json in each dir, and these
// files are tiny and stable.)
//
// Run: node --test tests/p5-links-mirror.test.mjs   (from the repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const RE = /export const (\w+) = '([^']*)'/g;
const parse = (rel) => Object.fromEntries(
  [...readFileSync(new URL('../' + rel, import.meta.url), 'utf8').matchAll(RE)].map((m) => [m[1], m[2]]),
);

test('home/links.js mirrors shared/links.js (drift guard)', () => {
  const shared = parse('P5 Programme/buddy-kit/client/shared/links.js');
  const home = parse('P5 Programme/buddy-kit/client/home/links.js');
  for (const k of ['HOME_URL', 'CITY_SIM_URL', 'WORKSHOP_URL', 'FIT_STUDIO_URL']) {
    assert.ok(shared[k], `shared/links.js is missing ${k}`);
    assert.equal(home[k], shared[k], `${k} drifted between shared/links.js and home/links.js`);
  }
});
