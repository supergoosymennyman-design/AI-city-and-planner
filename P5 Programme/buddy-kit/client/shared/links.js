// links.js — canonical absolute route/origin constants for the city-sim apps.
//
// Single source of truth for the hardcoded `.workers.dev` origins/URLs used in
// navigation (back-to-hub, quest minigame hosts, external tools). A rename or
// worker migration is now one edit instead of a repo-wide string hunt.
//
// ⚠️ VALUES ARE THE LIVE ORIGINS (2026-09). Changing them re-points every app,
// so edit deliberately and verify the live routes still answer afterwards.
//
// NOTE: the home worker (Champion Hub) is a SEPARATE deploy that ships only its
// own folder, so it cannot import this module — `home/links.js` mirrors these
// exact values and must be kept in sync (see its header comment).

export const HOME_URL = 'https://p5-home.clover-marquis.workers.dev/';
export const CITY_SIM_URL = 'https://p5-city-sim.clover-marquis.workers.dev';
const localDemo = typeof location !== 'undefined' && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
export const WORKSHOP_URL = localDemo ? '/workshop/' : 'https://workshop.ai-education.workers.dev/';
export const FIT_STUDIO_URL = localDemo ? '/studio/' : 'https://floral-bread-9885.prestonip005.workers.dev/';

/** Build a city-sim route URL: citySim('planner/') → CITY_SIM_URL + '/planner/'. */
export function citySim(path) {
  return CITY_SIM_URL + '/' + String(path).replace(/^\/+/, '');
}
