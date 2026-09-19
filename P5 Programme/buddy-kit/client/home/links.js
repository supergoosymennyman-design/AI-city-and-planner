// links.js — Champion Hub mirror of client/shared/links.js.
//
// The hub (p5-home) is a SEPARATE Cloudflare worker that ships only this
// folder (+ vendor/), so it cannot import `../shared/links.js` like the
// city-sim apps do. These values MUST stay identical to `shared/links.js`
// (same live origins, 2026-09) — keep the two files in sync when a URL
// changes; the import-graph checker (scripts/check-imports.mjs) and the
// deploy copy list both reference this file.

export const HOME_URL = 'https://p5-home.clover-marquis.workers.dev/';
export const CITY_SIM_URL = 'https://p5-city-sim.clover-marquis.workers.dev';
export const WORKSHOP_URL = 'https://workshop.ai-education.workers.dev/';
export const FIT_STUDIO_URL = 'https://floral-bread-9885.prestonip005.workers.dev/';

/** Build a city-sim route URL: citySim('planner/') → CITY_SIM_URL + '/planner/'. */
export function citySim(path) {
  return CITY_SIM_URL + '/' + String(path).replace(/^\/+/, '');
}
