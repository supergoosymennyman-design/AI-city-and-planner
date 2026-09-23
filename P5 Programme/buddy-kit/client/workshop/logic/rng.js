'use strict';
/**
 * Seeded, serialisable PRNG (mulberry32 core) for the signal engine.
 *
 * WHY numeric state, not a closure: a run must be able to save into the champion
 * file and resume byte-identically. Closures can't serialise; one uint32 can.
 * Callers thread the returned state forward — nothing in here mutates.
 * Determinism law (contract §7): this is the ONLY randomness in the engine.
 */

/** Normalise any number into a non-zero uint32 seed state. */
function seed(n) {
  const s = n >>> 0;
  return s === 0 ? 0x9e3779b9 : s;
}

/**
 * One draw. Returns [float in [0,1), nextState].
 * mulberry32: passes basic statistical tests, one Math.imul pipeline, fast on tablets.
 */
function next(state) {
  const s = (state + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, s];
}

/** Fisher–Yates on a COPY. Returns [shuffled, nextState]. Used for feeder contents order. */
function shuffle(arr, state) {
  const a = arr.slice();
  let st = state;
  for (let i = a.length - 1; i > 0; i--) {
    let f;
    [f, st] = next(st);
    const j = Math.floor(f * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return [a, st];
}

// Dual environment: node --test loads via require; the browser via a classic <script> tag.
const WorkshopRng = { seed, next, shuffle };
if (typeof module !== 'undefined' && module.exports) module.exports = WorkshopRng;
if (typeof window !== 'undefined') window.WorkshopRng = WorkshopRng;
