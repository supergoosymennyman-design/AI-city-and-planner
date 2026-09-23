'use strict';
/**
 * The memory brain — KNN over shelves of examples, with Evidence. Spec §5: instant,
 * explainable, never generalises past its examples; the default brain behind every
 * trainable sense. Pure logic: no DOM, no clock, no randomness — classification is
 * a deterministic function of (shelves, vector, k), so Scored Test replays hold.
 *
 * A sense = feature extractor + brain. The extractor turns the modality's raw data
 * into a vector (text here; MobileNet embeddings for the camera eye later) — the
 * brain never knows which modality fed it. That split IS the one sense interface.
 */

function fail(msg) {
  throw new Error('[brain] ' + msg);
}

/** A fresh, empty brain. Shelves: label → [{id, vec, display}]. */
function createBrain() {
  return { shelves: {}, nextId: 1 };
}

/** File one example onto a shelf. `display` is what Evidence shows a child. */
function addExample(brain, label, vec, display, raw, belt) {
  if (typeof label !== 'string' || !label.trim()) fail('an example needs a shelf label');
  if (!Array.isArray(vec) || !vec.length) fail('an example needs a feature vector');
  // Shelf names are user words, including inherited object names. Keep ordinary JSON objects
  // but create an own data property so __proto__ cannot invoke the prototype setter.
  if (!Object.prototype.hasOwnProperty.call(brain.shelves, label)) {
    Object.defineProperty(brain.shelves, label, { value: [], enumerable: true, writable: true, configurable: true });
  }
  const shelf = brain.shelves[label];
  const ex = { id: brain.nextId++, vec, display: display === undefined ? '' : String(display) };
  // OPTIONAL raw vector: the same row WITHOUT the unit step. Distance brains must have unit
  // vectors (the sure line is a cosine floor), but a LINE brain fitted on unit vectors cannot
  // say "3 cups per degree" — dividing each row by its own length makes the model non-linear in
  // the features a child can see. Only senses that can produce one set it; everything else is
  // untouched, and the field is simply absent (so saved files do not grow for other senses).
  if (Array.isArray(raw) && raw.length) ex.raw = raw;
  // OPTIONAL belt marker (owner-caught bug, data-course v2 morning fixes): true only when the
  // BELT filed this example (game.js applyTeachEffect, from an engine 'teach' effect) — never
  // set by the Teach screen's hand path (snap/word-add). A Run is a fresh experiment for
  // belt-fed knowledge; game.js's resetBeltLearning reads this flag to sweep only the belt's
  // own filings at the whistle, leaving hand-taught shelves untouched. Absent (not `false`) on
  // every hand-taught example, same convention as `raw` above.
  if (belt) ex.belt = true;
  shelf.push(ex);
  return ex.id;
}

/** Remove one example by id. Empty shelves disappear (a label with no examples is nothing). */
function removeExample(brain, id) {
  for (const label of Object.keys(brain.shelves)) {
    const shelf = brain.shelves[label];
    const i = shelf.findIndex((ex) => ex.id === id);
    if (i !== -1) {
      shelf.splice(i, 1);
      if (!shelf.length) delete brain.shelves[label];
      return true;
    }
  }
  return false;
}

/**
 * OPTIONAL `brain.waiting`: [{label, ex}] — examples whose feature numbers are not loaded yet.
 * A Data library photo is SAVED as a reference (model-library.js shelvesForSave), so a reopened
 * machine parks it here until the catalogue features load (detachRefs/attachRefs). A waiting
 * example cannot vote, but it is still the child's work: every operation below that answers
 * "what does this brain hold" or "remove it" reaches it too. Absent when empty.
 */
function eachExample(brain, fn) {
  for (const label of Object.keys(brain.shelves)) for (const ex of brain.shelves[label]) fn(ex, label);
  if (Array.isArray(brain.waiting)) for (const w of brain.waiting) fn(w.ex, w.label);
}

/** How many examples the BELT filed this Run and nobody has kept yet. */
function beltCount(brain) {
  let n = 0;
  eachExample(brain, (ex) => { if (ex.belt) n += 1; });
  return n;
}

/**
 * Keep what the belt taught: the child's explicit accept (owner ruling 2026-08-29 — an accept
 * is the child's own curation). The mark is DELETED, never set false: an absent mark is the
 * hand-taught convention addExample documents. Returns how many were kept.
 */
function keepAll(brain) {
  let n = 0;
  eachExample(brain, (ex) => { if (ex.belt) { delete ex.belt; n += 1; } });
  return n;
}

/**
 * The Run whistle's sweep: a Run is a fresh experiment for belt-fed knowledge, so every unkept
 * belt filing goes — including one still waiting for its features, which would otherwise come
 * back after the sweep. Emptied shelves (and an emptied waiting list) disappear; nextId is
 * never rewound. Returns how many were cleared.
 */
function sweepBelt(brain) {
  let n = 0;
  for (const label of Object.keys(brain.shelves)) {
    const kept = brain.shelves[label].filter((ex) => !ex.belt);
    n += brain.shelves[label].length - kept.length;
    if (kept.length) brain.shelves[label] = kept;
    else delete brain.shelves[label];
  }
  if (Array.isArray(brain.waiting)) {
    const kept = brain.waiting.filter((w) => !w.ex.belt);
    n += brain.waiting.length - kept.length;
    if (kept.length) brain.waiting = kept;
    else delete brain.waiting;
  }
  return n;
}

/**
 * Remove a whole shelf — the bulk remove a bulk filing needs (every add needs a remove).
 * Waiting examples under the same label go too. Returns the removed ids, ascending, so the
 * host can drop their thumbnails. A label that is not an OWN shelf ("constructor") is absent.
 */
function removeShelf(brain, label) {
  const ids = [];
  if (Object.prototype.hasOwnProperty.call(brain.shelves, label)) {
    for (const ex of brain.shelves[label]) ids.push(ex.id);
    delete brain.shelves[label];
  }
  if (Array.isArray(brain.waiting)) {
    const kept = brain.waiting.filter((w) => {
      if (w.label !== label) return true;
      ids.push(w.ex.id);
      return false;
    });
    if (kept.length) brain.waiting = kept;
    else delete brain.waiting;
  }
  return ids.sort((a, b) => a - b);
}

/** {label: exampleCount} — the honest size of what it knows. */
function counts(brain) {
  const out = {};
  for (const label of Object.keys(brain.shelves)) {
    Object.defineProperty(out, label, { value: brain.shelves[label].length, enumerable: true, writable: true, configurable: true });
  }
  return out;
}

function distance(a, b) {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { const d = a[i] - b[i]; s += d * d; }
  return Math.sqrt(s);
}

/**
 * How many examples vote, for a given k and how many examples exist. THE single definition —
 * classify() below and every view plan (logic/brain-view.js's orbitPlan, and whatever
 * centroidPlan/numberLinePlan/pilePlan Tasks 4/6 add) must call THIS, not a parallel expression
 * that happens to agree on integers. Two copies drifted apart once already (k=0.4: classify kept
 * 3 voters, a hand-duplicated formula in orbitPlan kept 1) — a picture glowing the wrong examples
 * is precisely the bug the whole view-plan feature exists to prevent. Non-integer/undefined k
 * rounds to 3 (round-then-fallback, in that order — rounding a fraction to 0 must not survive as
 * "0 voters", it must fall back to the default).
 * @param {number} k  requested voter count (may be undefined, 0, negative, or non-integer)
 * @param {number} n  how many examples exist to vote at all
 * @returns {number} an integer in [1, n]
 */
function kVoters(k, n) {
  return Math.max(1, Math.min(Math.round(k) || 3, n));
}

/**
 * Classify a vector by its k nearest examples.
 * @returns null if the brain has NO examples (an untaught sense honestly says nothing),
 *   else { label, value, evidence } — value = the winning share of the k votes (sureness,
 *   0..1), evidence = the voters [{id, label, display, distance}] nearest-first: the
 *   exact examples that decided, ready to show a child.
 * Deterministic: ties in distance break by example id; ties in votes break by whichever
 * tied label has the nearer voter.
 */
function classify(brain, vec, k) {
  const all = [];
  for (const label of Object.keys(brain.shelves)) {
    for (const ex of brain.shelves[label]) {
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

/**
 * Text → 64-dim vector: hashed character trigrams (padded, lowercased), L2-normalised.
 * Crude on purpose — near spellings land near each other ("apple"/"apples"), which is
 * all the memory brain needs to demonstrate learning-from-examples honestly.
 */
function textVec(text) {
  const s = ' ' + String(text).toLowerCase().trim() + ' ';
  const v = new Array(64).fill(0);
  for (let i = 0; i + 2 < s.length; i++) {
    let h = 5381;
    for (let j = i; j < i + 3; j++) h = (Math.imul(h, 33) ^ s.charCodeAt(j)) >>> 0;
    v[h % 64] += 1;
  }
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  return v.map((x) => x / norm);
}

const WorkshopBrain = { createBrain, addExample, removeExample, counts, classify, textVec, distance, kVoters,
  eachExample, beltCount, keepAll, sweepBelt, removeShelf };
if (typeof module !== 'undefined' && module.exports) module.exports = WorkshopBrain;
if (typeof window !== 'undefined') window.WorkshopBrain = WorkshopBrain;
