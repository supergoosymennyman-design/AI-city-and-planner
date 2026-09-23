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

import vm from 'node:vm';
const parse = (rel, hostname) => vm.runInNewContext(
  readFileSync(new URL('../' + rel, import.meta.url), 'utf8').replace(/export /g, '')
    + ';({HOME_URL,CITY_SIM_URL,WORKSHOP_URL,FIT_STUDIO_URL})', { location: { hostname } });

for (const hostname of ['localhost','127.0.0.1','p5-home.clover-marquis.workers.dev']) {
  test('home/links.js mirrors shared/links.js on ' + hostname, () => {
    const shared = parse('P5 Programme/buddy-kit/client/shared/links.js', hostname);
    const home = parse('P5 Programme/buddy-kit/client/home/links.js', hostname);
    for (const k of ['HOME_URL', 'CITY_SIM_URL', 'WORKSHOP_URL', 'FIT_STUDIO_URL']) {
      assert.ok(shared[k], `shared/links.js is missing ${k}`);
      assert.equal(home[k], shared[k], `${k} drifted between shared/links.js and home/links.js`);
    }
    if (hostname === 'localhost') { assert.equal(shared.WORKSHOP_URL, '/workshop/'); assert.equal(shared.FIT_STUDIO_URL, '/studio/'); }
    else if (hostname.endsWith('.dev')) assert.match(shared.WORKSHOP_URL, /^https:/);
  });
}
