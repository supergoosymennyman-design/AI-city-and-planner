/** gen-progress.spec.js — the live-demo progress bar maths (src/ai/gen-progress.js), pure Node. */
import {
  EXPECTED_MS, ROUTE_WEIGHTS, NO_TEXTURE_ROUTE_WEIGHTS, routeWeights, STEP_TIMEOUT_MS, TIMEOUT_MS, STEP_WORDS, overallFraction, estimatedFraction,
  reportedFraction, formatElapsed, detailText,
} from '../gen-progress.js';

const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;

export default function genProgressTests(check) {
  check('gen-progress: 20 Sep live times include the future texture stage', EXPECTED_MS.edit === 64000 &&
    EXPECTED_MS.views3d === 19000 && EXPECTED_MS.picture === 7000 && EXPECTED_MS.picture3d === 27000 && EXPECTED_MS.texture === 270000);
  check("gen-progress: both two-step and three-step routes add up to the whole bar",
    [ROUTE_WEIGHTS, NO_TEXTURE_ROUTE_WEIGHTS].every((set) =>
      ['A', 'B'].every((r) => near(Object.values(set[r]).reduce((a, b) => a + b, 0), 1))));
  check('gen-progress: default no-texture route follows the measured 64/19 split',
    near(routeWeights('A').edit, 64 / 83) && near(routeWeights('A').views3d, 19 / 83) && !Object.hasOwn(routeWeights('A'), 'texture'));
  check('gen-progress: enabled texture receives a non-zero weighted stage',
    routeWeights('A', true).texture > 0 && routeWeights('B', true).texture > 0);
  check('gen-progress: 3-minute default step timeout', STEP_TIMEOUT_MS === 180000);
  // /generation_all textures the mesh as well as building it, which the spike timed at ~270 s —
  // longer than the 3-minute default, so the 3D steps get their own limit or they always time out.
  check('gen-progress: the textured 3D steps get a longer limit than the image steps',
    TIMEOUT_MS.views3d > STEP_TIMEOUT_MS && TIMEOUT_MS.picture3d > STEP_TIMEOUT_MS && TIMEOUT_MS.texture === 600000 &&
    TIMEOUT_MS.views3d >= 480000 && TIMEOUT_MS.edit === STEP_TIMEOUT_MS && TIMEOUT_MS.picture === STEP_TIMEOUT_MS);
  check('gen-progress: child-friendly words for every step',
    ['edit', 'views3d', 'picture', 'picture3d', 'texture'].every((s) => typeof STEP_WORDS[s] === 'string' && STEP_WORDS[s].length > 3));
  check('gen-progress: halfway through the redesign follows its measured weight', near(overallFraction('A', 'edit', 0.5), 32 / 83));
  check('gen-progress: halfway through the 3D step follows its measured weight', near(overallFraction('A', 'views3d', 0.5), 73.5 / 83));
  check('gen-progress: never 100% before the result', overallFraction('A', 'views3d', 1) < 1 && overallFraction('A', 'views3d', 5) < 1);
  check('gen-progress: 100% only when done', overallFraction('A', 'views3d', 0.2, true) === 1);
  check('gen-progress: texture progress uses the optional three-stage route',
    overallFraction('A', 'texture', 0, false, true) > 0 && overallFraction('A', 'texture', 1, false, true) < 1);
  let threw = false;
  try {
    overallFraction('A', 'picture', 0.5);
  } catch (err) {
    threw = /unknown/.test(err.message);
  }
  check('gen-progress: a step from the other route throws', threw);
  check('gen-progress: estimate starts at 0', estimatedFraction(0, 30000) === 0);
  check('gen-progress: estimate is 90% at the expected time', near(estimatedFraction(30000, 30000), 0.9, 1e-6));
  check('gen-progress: estimate never passes 95%', estimatedFraction(10 * 30000, 30000) === 0.95);
  check('gen-progress: reported progress from Gradio progress_data', reportedFraction([{ index: 12, length: 40 }]) === 0.3);
  check('gen-progress: reported progress from a plain progress value', reportedFraction([{ progress: 0.25 }]) === 0.25);
  check('gen-progress: no progress data → null', reportedFraction(undefined) === null &&
    reportedFraction([]) === null && reportedFraction([{ index: null, length: null }]) === null);
  check('gen-progress: elapsed as m:ss', formatElapsed(31000) === '0:31' && formatElapsed(125400) === '2:05');
  const queued = detailText({ queuePosition: 2, elapsedMs: 5000, expectedMs: 74000 });
  check('gen-progress: queue position is shown', queued.includes('Waiting in line: 2 ahead') && queued.includes('0:05'));
  const stepping = detailText({ progressData: [{ index: 12, length: 40 }], elapsedMs: 31000, expectedMs: 74000 });
  check('gen-progress: steps are shown', stepping.includes('step 12 of 40') && stepping.includes('0:31'));
  check('gen-progress: "taking longer" only after twice the expected time',
    !detailText({ elapsedMs: 59000, expectedMs: 30000 }).includes('longer') &&
    detailText({ elapsedMs: 61000, expectedMs: 30000 }).includes('Taking longer than usual'));
}
