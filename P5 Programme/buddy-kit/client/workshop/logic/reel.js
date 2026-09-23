'use strict';
/**
 * reel.js — the PICTURE REEL: an ordered loop of photographs that stands in for the webcam.
 *
 * WHY (owner 2026-08-20, "replace the webcam with image loops of the entire data set"): Camera
 * sense is the one sense a child cannot rehearse. A webcam shows a different room every time, so a
 * camera lesson cannot be scripted, cannot be filmed twice, and cannot run at all on a tablet with
 * no camera or a denied permission. The reel replaces ONLY the frame source — the embedder, the
 * brain, the sure line, the belt and the Tally are all untouched — so what the child watches is a
 * REAL classification of a real photograph, not a puppet show. That honesty is the whole point:
 * the machine can still be wrong, and it still says "not sure" when it should.
 *
 * A shot is `{src, label, role}`:
 *   role 'train' — offered for teaching; these are the ones a child snaps onto shelves.
 *   role 'test'  — never teachable. Held back so "studied vs new" means something (the same
 *                  train/test split the Data lab teaches, now with pictures).
 *   role 'odd'   — label null. Never taught, nothing to teach it AS. Exists so the sure line has
 *                  something honest to refuse, which is how a child learns a model only knows
 *                  what it was shown.
 *
 * Pure: no DOM, no clock, no Math.random (logic/ determinism law — seeded via logic/rng.js).
 * The DOM half — loading the images and drawing the 224 crop the embedder wants — is in game.js.
 */
// WRAPPED, and it must stay wrapped: classic <script> tags share ONE global scope, so a bare
// top-level `const Rng` here collides with the identical declaration in logic/datasets.js and
// throws "Identifier 'Rng' has already been declared" — which kills this file and blanks the app.
// node --test never sees it (each require gets its own module scope), so only a browser catches it.
(function () {
  'use strict';
  const Rng = (typeof require === 'function') ? require('./rng.js') : window.WorkshopRng;

/**
 * Seeded Fisher-Yates over indices. Same seed → same order (a filmed take replays exactly);
 * another seed → another fair order (Depth Law: endless seeded eval).
 */
function shuffled(n, seed) {
  const idx = [];
  for (let i = 0; i < n; i++) idx.push(i);
  let st = Rng.seed(seed);
  for (let i = n - 1; i > 0; i--) {
    const [f, s] = Rng.next(st);
    st = s;
    const j = Math.floor(f * (i + 1));
    const t = idx[i]; idx[i] = idx[j]; idx[j] = t;
  }
  return idx;
}

/**
 * Push apart neighbours that share a label. Three paper photos in a row teaches nothing and reads
 * as a stuck machine — a belt of mixed rubbish is what makes sorting look like sorting. Greedy and
 * deterministic: walk the order, and where a shot matches the one before it, swap in the nearest
 * later shot that does not. Best-effort by design — a set that is 90 % paper CANNOT be spread, and
 * pretending otherwise would mean refusing to play a legal reel.
 */
function spread(order, shots) {
  const out = order.slice();
  const labelAt = (k) => (shots[out[k]] ? shots[out[k]].label : null);
  for (let i = 1; i < out.length; i++) {
    if (labelAt(i) === null || labelAt(i) !== labelAt(i - 1)) continue;
    for (let j = i + 1; j < out.length; j++) {
      const cand = shots[out[j]] ? shots[out[j]].label : null;
      if (cand === labelAt(i - 1)) continue;                       // no better than what we have
      if (j + 1 < out.length && cand === labelAt(j + 1)) continue; // do not create a new pair
      const t = out[i]; out[i] = out[j]; out[j] = t;
      break;
    }
  }
  return out;
}

/**
 * Build a reel.
 * @param {Array<{src:string,label:?string,role:string}>} shots the whole picture set
 * @param {number} seed
 * @returns {{shots:Array, order:number[]}} `order` indexes `shots`; every shot appears exactly once
 */
function plan(shots, seed) {
  const list = Array.isArray(shots) ? shots : [];
  return { shots: list, order: spread(shufflewrap(list.length, seed), list) };
}
/** Guard n===0 (Fisher-Yates on an empty list is fine, but be explicit about the empty reel). */
function shufflewrap(n, seed) { return n > 0 ? shuffled(n, seed) : []; }

/**
 * The shot showing at step `i`, wrapping forever in both directions. A reel never runs out and
 * never returns undefined: an empty reel is honestly `null`, not a crash and not a phantom frame.
 * @returns {?{src:string,label:?string,role:string}}
 */
function at(plan_, i) {
  const n = plan_ && plan_.order ? plan_.order.length : 0;
  if (!n) return null;
  const k = ((Math.floor(i) % n) + n) % n; // negative-safe modulo — a rewound reel is legal
  return plan_.shots[plan_.order[k]] || null;
}

/** The shots a child may snap onto a shelf: TRAIN only. A taught test picture is not a test. */
function teachable(plan_) {
  if (!plan_ || !plan_.shots) return [];
  return plan_.shots.filter((s) => s && s.role === 'train');
}

  const WorkshopReel = { plan, at, teachable };
  if (typeof module !== 'undefined' && module.exports) module.exports = WorkshopReel;
  if (typeof window !== 'undefined') window.WorkshopReel = WorkshopReel;
}());
