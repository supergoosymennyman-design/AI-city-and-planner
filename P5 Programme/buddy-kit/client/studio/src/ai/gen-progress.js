/**
 * gen-progress.js — the live-demo progress bar (design doc §7). Pure maths; the panel draws it.
 *
 * Honest rules: the bar reaches 100% only when the result has arrived (overallFraction caps at 0.99
 * until done=true); a step that reports no progress (Hunyuan3D-2mv) is ESTIMATED from its measured
 * time and never passes 95%; after twice the expected time the text says so.
 */

/** Live timings measured on 20 Sep (Qwen ~64 s, 2mv ~19 s, FLUX ~7 s, Hunyuan 2.1 ~27 s). */
export const EXPECTED_MS = { edit: 64000, views3d: 19000, picture: 7000, picture3d: 27000, texture: 270000 };

/** How much of the bar each step owns, sized by those times. */
export const NO_TEXTURE_ROUTE_WEIGHTS = Object.freeze({
  A: Object.freeze({ edit: 64 / 83, views3d: 19 / 83 }),
  B: Object.freeze({ picture: 7 / 34, picture3d: 27 / 34 }),
});

/** Three-step weights used once a standalone texture model is selected. */
export const ROUTE_WEIGHTS = Object.freeze({
  A: Object.freeze({ edit: 64 / 353, views3d: 19 / 353, texture: 270 / 353 }),
  B: Object.freeze({ picture: 7 / 304, picture3d: 27 / 304, texture: 270 / 304 }),
});

export function routeWeights(route, textureEnabled = false) {
  return (textureEnabled ? ROUTE_WEIGHTS : NO_TEXTURE_ROUTE_WEIGHTS)[route] || null;
}

/** Default per-step timeout (3 minutes). */
export const STEP_TIMEOUT_MS = 180000;

/**
 * How long each step may take before it is given up on.
 *
 * 3D and texture GPU work can exceed the image-step default. The spike timed a texture pass at
 * about 270 s, so all mesh-producing stages get a limit that a slow-but-working run can finish
 * inside. Cancel is always available, so a generous limit costs the child nothing.
 */
export const TIMEOUT_MS = {
  edit: STEP_TIMEOUT_MS,
  picture: STEP_TIMEOUT_MS,
  views3d: 600000,
  picture3d: 600000,
  texture: 600000,
};

/** The words on the bar, for the child. */
export const STEP_WORDS = {
  edit: 'Sculpting your creature…',
  views3d: 'Building it in 3D…',
  picture: 'Drawing your idea…',
  picture3d: 'Building it in 3D…',
  texture: 'Painting your model…',
};

const clamp01 = (v) => Math.min(Math.max(v, 0), 1);

/**
 * Fraction of the whole route, from the current step and how far through it is.
 * @param {'A'|'B'} route
 * @param {string} step a step of that route
 * @param {number} stepFraction 0..1 within the step
 * @param {boolean} [done] true only once the final result has arrived
 */
export function overallFraction(route, step, stepFraction, done = false, textureEnabled = false) {
  const weights = routeWeights(route, textureEnabled);
  if (!weights || !(step in weights)) throw new Error(`overallFraction: unknown step "${route}/${step}"`);
  if (done) return 1;
  let before = 0;
  for (const s of Object.keys(weights)) {
    if (s === step) break;
    before += weights[s];
  }
  const f = Math.min(clamp01(stepFraction || 0), 0.99);
  return Math.min(before + weights[step] * f, 0.99);
}

/** Estimated fraction for a step with no progress reports: 90% at the expected time, never above 95%. */
export function estimatedFraction(elapsedMs, expectedMs) {
  if (!(expectedMs > 0) || !(elapsedMs > 0)) return 0;
  return Math.min(0.95, 1 - Math.exp((-Math.LN10 * elapsedMs) / expectedMs));
}

/** The first usable entry of Gradio's `progress_data` (from gr.Progress / track_tqdm), or null. */
function firstProgress(progressData) {
  if (!Array.isArray(progressData)) return null;
  return progressData.find((d) => d && (Number.isFinite(d.progress) ||
    (Number.isFinite(d.index) && Number.isFinite(d.length) && d.length > 0))) || null;
}

/** Real progress reported by the service, or null when it reports none. */
export function reportedFraction(progressData) {
  const p = firstProgress(progressData);
  if (!p) return null;
  return Number.isFinite(p.progress) ? clamp01(p.progress) : clamp01(p.index / p.length);
}

/** 31000 → '0:31'. */
export function formatElapsed(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** The small text under the bar: queue place or step count, elapsed time, and a slow warning. */
export function detailText({ queuePosition, progressData, elapsedMs, expectedMs }) {
  const parts = [];
  if (Number.isFinite(queuePosition) && queuePosition > 0) parts.push(`Waiting in line: ${queuePosition} ahead`);
  const p = firstProgress(progressData);
  if (p && Number.isFinite(p.index) && Number.isFinite(p.length)) parts.push(`step ${p.index} of ${p.length}`);
  parts.push(formatElapsed(elapsedMs || 0));
  if (expectedMs > 0 && elapsedMs > 2 * expectedMs) parts.push('Taking longer than usual…');
  return parts.join(' · ');
}
