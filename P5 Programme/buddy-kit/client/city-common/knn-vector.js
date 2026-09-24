// knn-vector.js — the SHARED pure k-NN, the one inference implementation the
// Workshop and the City both run.
//
// This is a byte-for-byte mirror of the Workshop's `logic/brain.js` classify
// rules (unit vectors, Euclidean distance, k-nearest, MAJORITY vote, distance
// ties broken by example id, vote ties broken by the nearer voter). The
// capability contract's v2 runtime reproduces THESE rules — the plan's rule that
// a student's Workshop k-NN behaviour "must not be silently replaced" by the
// City's older minmax/inverse-distance k-NN (which stays for v1 bundles).
//
// Pure: no DOM, no clock, no randomness. Classification is a deterministic
// function of (examples, vector, k), so a published capability replays exactly.
//
// `tests/knn-vector-parity.test.mjs` asserts this agrees with the Workshop's
// own brain.js on a seeded grid, including distance ties and vote ties.

/** A fresh, empty brain. Shelves: label → [{ id, vec, display }]. */
export function createBrain() {
  return { shelves: {}, nextId: 1 };
}

export function addExample(brain, label, vec, display, id) {
  const shelf = brain.shelves[label] || (brain.shelves[label] = []);
  const example = { id: id ?? brain.nextId++, vec: Array.from(vec), display };
  shelf.push(example);
  return example.id;
}

/** Euclidean distance over the shared prefix — identical to brain.js. */
export function distance(a, b) {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { const d = a[i] - b[i]; s += d * d; }
  return Math.sqrt(s);
}

/**
 * How many examples vote, for a given k and how many examples exist.
 * Non-integer/undefined k rounds to 3 (round-then-fallback).
 */
export function kVoters(k, n) {
  return Math.max(1, Math.min(Math.round(k) || 3, n));
}

/**
 * Classify a vector by its k nearest examples. Identical semantics to the
 * Workshop brain's classify().
 * @returns null when there are no examples, else { label, value, evidence }.
 */
export function classify(brainOrExamples, vec, k) {
  const all = [];
  const shelves = Array.isArray(brainOrExamples)
    ? groupByLabel(brainOrExamples)
    : brainOrExamples.shelves;
  for (const label of Object.keys(shelves)) {
    for (const ex of shelves[label]) {
      all.push({ id: ex.id, label, display: ex.display, distance: distance(vec, ex.vec) });
    }
  }
  if (!all.length) return null;
  all.sort((a, b) => a.distance - b.distance || a.id - b.id);
  const kk = kVoters(k, all.length);
  const voters = all.slice(0, kk);
  const tally = Object.create(null);
  const firstAt = Object.create(null);
  voters.forEach((v, i) => {
    tally[v.label] = (tally[v.label] || 0) + 1;
    if (firstAt[v.label] === undefined) firstAt[v.label] = i;
  });
  let best = null;
  for (const label of Object.keys(tally)) {
    if (!best || tally[label] > tally[best] || (tally[label] === tally[best] && firstAt[label] < firstAt[best])) {
      best = label;
    }
  }
  return { label: best, value: tally[best] / kk, evidence: voters };
}

function groupByLabel(examples) {
  const shelves = {};
  for (const ex of examples) (shelves[ex.label] ||= []).push({ id: ex.id, vec: ex.vec, display: ex.display });
  return shelves;
}

/** L2 unit-normalize (norm 0 → all zeros), the Workshop's scale-free convention. */
export function unitVec(v) {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map((x) => x / n);
}

/** The numeric-sense vector: numbers, a bias constant, then unit-normalized. */
export function numberVec(values, bias = 10) {
  return unitVec([...values, bias]);
}

/** The Workshop's "sure line": d² = |a−b|² on unit vectors; similarity = 1 − d²/2. */
export function surenessOf(result) {
  if (!result) return null;
  const ev = result.evidence && result.evidence[0];
  const sim = ev && Number.isFinite(ev.distance) ? 1 - (ev.distance * ev.distance) / 2 : result.value;
  return Number.isFinite(sim) ? sim : null;
}
