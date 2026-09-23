'use strict';
/**
 * datasets.js — the AUTHORED, SEEDED datasets that ride the belt as crates (spec
 * docs/superpowers/specs/2026-08-18-data-feed-ml-course-design.md §3).
 *
 * WHY authored (owner 2026-08-18): a child should meet regression, train/test and overfitting on
 * DATA — "an actual ML course in uni but made for kids" — and each table must teach ONE idea
 * cleanly, which real public sets rarely do at 10. So every dataset is a small RULE plus seeded
 * noise: same seed → the same table (a run replays), another seed → another fair table (Depth
 * Law: endless seeded eval). Nothing is stored; nothing is personal; no images.
 *
 * Every dataset declares its SCHEMA (features with ranges/options, the answer kind) so the UI
 * draws the crate face and the Tally without knowing the story, and `vec()` turns a row into the
 * unit vector every brain reads: numeric features scaled to 0..1, option features one-hot, plus a
 * constant 1 (the LEVEL — on the unit sphere "sun 1 water 1" and "sun 3 water 3" would otherwise
 * be the same direction; the constant keeps them apart — the numberVec trick, same reason).
 *
 * The four tables, one lesson each (see the spec):
 *   plants        — thirsty yes/no      → first data machine; TP / FP / TN / FN
 *   buses         — late yes/no + noise → the studied-vs-new gap (train vs test)
 *   icecream      — cups (number)       → regression with the Number brain; mean error
 *   icecream-tiny — 12 noisy rows       → overfitting: k=1 memorises, k=5 generalises
 *
 * Determinism: logic/rng.js only. Pure; no DOM. window.WorkshopDatasets + module.exports.
 */
const Rng = (typeof require === 'function') ? require('./rng.js') : window.WorkshopRng;

/** L2-normalise. */
function unit(v) {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map((x) => x / n);
}

/** Uniform integer in [lo, hi] from a threaded rng state → [value, state]. */
function int(lo, hi, st) {
  const [f, s] = Rng.next(st);
  return [lo + Math.floor(f * (hi - lo + 1)), s];
}
/** Pick one option → [value, state]. */
function pick(options, st) {
  const [i, s] = int(0, options.length - 1, st);
  return [options[i], s];
}
/** Symmetric noise in [-amp, amp] (uniform) → [value, state]. */
function noise(amp, st) {
  const [f, s] = Rng.next(st);
  return [(f * 2 - 1) * amp, s];
}

/**
 * The registry. `gen(st)` draws ONE row's features + true answer from the rng state and returns
 * [{features, answer, value?}, state]. Noise/flip amounts are TUNED so datasets.test.js holds
 * (plants learnable > 75 %; icecream-tiny overfits with k=1 vs k=5) — change them WITH the test.
 */
const DATASETS = {
  plants: {
    id: 'plants', kind: 'yesno', size: 60, studyDefault: 0.6,
    nameKey: 'dataset.plants.name', storyKey: 'dataset.plants.story', teachesKey: 'dataset.plants.teaches',
    features: [
      { id: 'sun', nameKey: 'feature.sun', min: 0, max: 5 },
      { id: 'water', nameKey: 'feature.water', min: 0, max: 5 },
      { id: 'pot', nameKey: 'feature.pot', options: ['S', 'M', 'L'] },
    ],
    answer: { nameKey: 'answer.thirsty', labels: ['yes', 'no'] },
    gen(st) {
      let sun, water, pot, f;
      [sun, st] = int(0, 5, st);
      [water, st] = int(0, 5, st);
      [pot, st] = pick(['S', 'M', 'L'], st);
      // The rule: lots of sun and little water = thirsty; a bigger pot holds more water.
      const held = water + (pot === 'S' ? 0 : 1);
      let thirsty = sun * 2 - held > 2;
      [f, st] = Rng.next(st);
      if (f < 0.05) thirsty = !thirsty; // 5 % of plants are just contrary — real data has noise
      return [{ features: { sun, water, pot }, answer: thirsty ? 'yes' : 'no' }, st];
    },
  },
  buses: {
    id: 'buses', kind: 'yesno', size: 80, studyDefault: 0.6,
    nameKey: 'dataset.buses.name', storyKey: 'dataset.buses.story', teachesKey: 'dataset.buses.teaches',
    features: [
      { id: 'rain', nameKey: 'feature.rain', min: 0, max: 3 },
      { id: 'hour', nameKey: 'feature.hour', min: 7, max: 18 },
      { id: 'route', nameKey: 'feature.route', options: ['A', 'B', 'C'] },
    ],
    answer: { nameKey: 'answer.late', labels: ['yes', 'no'] },
    gen(st) {
      let rain, hour, route, f;
      [rain, st] = int(0, 3, st);
      [hour, st] = int(7, 18, st);
      [route, st] = pick(['A', 'B', 'C'], st);
      // Heavy rain, rush hour, or the long route in any rain → late. 10 % surprises: a
      // memory brain with k=1 learns the surprises too — and pays for it on the new crates.
      let late = rain >= 2 || hour === 8 || hour === 17 || (route === 'C' && rain >= 1);
      [f, st] = Rng.next(st);
      if (f < 0.10) late = !late;
      return [{ features: { rain, hour, route }, answer: late ? 'yes' : 'no' }, st];
    },
  },
  icecream: {
    id: 'icecream', kind: 'number', size: 48, studyDefault: 0.6, // 26 temps × 2 = 52 distinct days; 48 leaves room
    nameKey: 'dataset.icecream.name', storyKey: 'dataset.icecream.story', teachesKey: 'dataset.icecream.teaches',
    features: [
      { id: 'temp', nameKey: 'feature.temp', min: 10, max: 35 },
      { id: 'weekend', nameKey: 'feature.weekend', options: ['no', 'yes'] },
    ],
    // tolerance dropped 6 -> 3 alongside the curve below: the old ±6 was tuned against a MUCH
    // bigger straight-line spread (up to 75 cups); the new curve's typical miss near the sweet
    // spot (degree 2) is closer to 2-3 cups, so 6 graded almost everything "right" and the
    // Evaluator's tolerance-band percentages went flat at ~100% (see the gen() note below). 3, not
    // 2: the Evaluator reads the SAME tolerance through two different gauges — the right/wrong
    // percentage (wants tolerance near the typical miss, or it saturates 0/100) AND the error-band
    // bars (`errorBand`, floor-art.js — "how much of the allowance was spent", clamped at 100%,
    // so it needs tolerance ABOVE the typical miss or every degree clips to 100% and the two bars
    // stop separating). 3 is the value where both stay legible at seed 42's degree-2 fit (studied
    // ~2.1, held ~2.7): right/wrong reads ~90%/~50%, the allowance bars read ~70%/~90% — neither
    // gauge saturates, and both still read WORSE for degree 3 (overfit) than degree 2.
    answer: { nameKey: 'answer.cups', unit: 'cups', tolerance: 3 },
    gen(st) {
      let temp, weekend, n;
      [temp, st] = int(10, 35, st);
      [weekend, st] = pick(['no', 'yes'], st);
      [n, st] = noise(5, st);
      // Curved, not straight (fix round, .superpowers/sdd/2026-09-03-investigation-lab-3-board/
      // breaker-final.md finding 1): a degree-1 (straight) fit used to have NOTHING to underfit —
      // "3 more cups per degree" was exactly the line a degree-1 rule already finds, so turning
      // Polynomial degree only ever chased noise and the Board's held-out line only ever rose,
      // never fell. Real ice-cream stands don't sell in a straight line either: cups ACCELERATE as
      // it gets hotter — a cool 10°C morning barely sells any, a blazing 35°C afternoon is mobbed,
      // and the jump from 30°C to 35°C sells far more than the jump from 10°C to 15°C ever did.
      // 0.12 cups per SQUARED degree above 10, plus the same weekend bump as before, plus noise —
      // a degree-1 line now has real curvature to miss (a genuine underfit: studied AND held-out
      // both read badly), degree-2 recovers almost all of it (the minimum — both numbers drop),
      // and degree-3's extra, unearned power term chases noise past that minimum on held-out rows
      // while studied error keeps drifting down (a genuine overfit). Tuned against a seed sweep,
      // not by eye — see sweep-icecream.cjs and fix-a-report.md in that same folder: the shipped
      // seed (42) shows a clean U; roughly two-thirds of seeds do (the held-out pile is only 10
      // rows, so a single extra-parameter's overfit signal against 10 samples is a genuinely noisy
      // read — the SAME reason a real validation split of this size is noisy in practice).
      const cups = Math.max(0, Math.round(0.12 * (temp - 10) * (temp - 10) + (weekend === 'yes' ? 15 : 0) + n));
      return [{ features: { temp, weekend }, answer: String(cups), value: cups }, st];
    },
  },
  'icecream-tiny': {
    id: 'icecream-tiny', kind: 'number', size: 12, studyDefault: 0.5,
    nameKey: 'dataset.icecreamTiny.name', storyKey: 'dataset.icecreamTiny.story', teachesKey: 'dataset.icecreamTiny.teaches',
    features: [
      { id: 'temp', nameKey: 'feature.temp', min: 10, max: 35 },
      { id: 'weekend', nameKey: 'feature.weekend', options: ['no', 'yes'] },
    ],
    answer: { nameKey: 'answer.cups', unit: 'cups', tolerance: 8 },
    gen(st) {
      let temp, weekend, n;
      [temp, st] = int(10, 35, st);
      [weekend, st] = pick(['no', 'yes'], st);
      [n, st] = noise(12, st);
      // Same stand, twelve noisy days: k=1 copies the noise of the nearest day and is far off on a
      // new day; k=5 averages the noise away. Noise ±12 vs slope 3/degree is what makes that show.
      const cups = Math.max(0, Math.round(3 * (temp - 10) + (weekend === 'yes' ? 15 : 0) + n));
      return [{ features: { temp, weekend }, answer: String(cups), value: cups }, st];
    },
  },
};
const ORDER = ['plants', 'buses', 'icecream', 'icecream-tiny'];

/**
 * Loud on an unknown dataset id — a save from a future build must not silently feed nothing.
 *
 * Task D (bring-your-own-data, spec 2026-08-27-data-course-v2-design.md §3): an UPLOADED table has
 * no entry in the authored DATASETS registry above — its schema is built once (table-import.js's
 * buildSchema) and carried on the feeder piece itself, never registered here. Rather than teach
 * every caller below (vec/rawVec/dims/face) a second "is this a registered id or an inline schema"
 * branch, this ONE function accepts either: a known id STRING (the authored path, unchanged) or an
 * already-built schema OBJECT (features[]/answer/kind — buildSchema's own return shape, which is
 * exactly this function's own return shape) — passed straight through. Every other function here
 * calls schema(id) first and only, so this one duck-type check is the whole of the change.
 */
function schema(id) {
  if (id && typeof id === 'object') return id;
  const s = DATASETS[id];
  if (!s) throw new Error('datasets: unknown dataset "' + id + '" (have ' + ORDER.join(', ') + ')');
  return s;
}

/**
 * The crate FACE — what a child reads on the crate: every feature, never the answer.
 * An uploaded feature carries its own `name` (the real column header, table-import.js's
 * buildSchema); an authored one only has `nameKey` and falls back to its bare `id` here — the
 * same fallback dims() below uses, so a crate's face and its brain's evidence chips agree.
 * @returns {string} e.g. "sun 3 · water 2 · pot M"
 */
function face(id, features) {
  return schema(id).features.map((f) => (f.name !== undefined ? f.name : f.id) + ' ' + features[f.id]).join(' · ');
}

/**
 * The whole table for a seed. Row order is the deal order (a feeder deals it as-is unless the
 * child asks for a shuffle). Each row: { i, features, answer, value?, face }.
 * @param {string} id
 * @param {number} seed
 */
function rows(id, seed) {
  const s = schema(id);
  // Mix the dataset id into the seed so two datasets at the same seed are not the same draws.
  let st = Rng.seed((seed >>> 0) ^ hash(id));
  const out = [];
  const seen = new Set();
  // No two rows with the SAME features: a duplicate day with a different answer is a trap for
  // the "k=1 memorises" lesson (its nearest neighbour would be its twin, not itself) and teaches
  // nothing a child can see. Bounded redraws; loud if a dataset is too small for its size.
  let tries = 0;
  while (out.length < s.size) {
    let row;
    [row, st] = s.gen(st);
    const key = face(id, row.features);
    if (seen.has(key)) { if (++tries > s.size * 50) throw new Error('datasets: "' + id + '" cannot fill ' + s.size + ' distinct rows'); continue; }
    seen.add(key);
    const r = { i: out.length, features: row.features, answer: row.answer, face: key };
    if (row.value !== undefined) r.value = row.value;
    out.push(r);
  }
  return out;
}
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/**
 * Mark a seeded fraction of rows `studied` (the training set) — the rest are the NEW crates the
 * Tally scores separately. Row ORDER is untouched (the seal on the crate is what differs, not
 * where it sits in the deal); which rows are studied is a seeded shuffle so a re-split at
 * another seed picks other rows. Returns copies; the input is not mutated.
 * @param {Array} rowsArr  from rows()
 * @param {number} fraction 0..1
 * @param {number} seed
 */
function split(rowsArr, fraction, seed) {
  const n = Math.round(rowsArr.length * Math.max(0, Math.min(1, fraction)));
  const [order] = Rng.shuffle(rowsArr.map((_, i) => i), Rng.seed(((seed >>> 0) * 31 + 7) >>> 0));
  const studied = new Set(order.slice(0, n));
  return rowsArr.map((r, i) => Object.assign({}, r, { studied: studied.has(i) }));
}

/**
 * A row's features → the unit vector every brain reads. Numeric → (x − min)/(max − min);
 * options → one-hot; then the level constant 1; then unit-normalised. Same dataset ⇒ same
 * length, always — two datasets never share shelves (the host empties them on a switch).
 */
function vec(id, features) {
  const s = schema(id);
  const v = [];
  for (const f of s.features) {
    const x = features[f.id];
    if (f.options) { for (const o of f.options) v.push(x === o ? 1 : 0); }
    else v.push(f.max === f.min ? 0 : (Number(x) - f.min) / (f.max - f.min));
  }
  v.push(1);
  return unit(v);
}

/**
 * The RAW feature vector — the same numbers as vec() but WITHOUT the unit step.
 *
 * WHY BOTH EXIST: every distance brain (memory, prototype, grouper, neural) needs unit vectors,
 * because the sure line is a cosine floor and must mean the same thing for every sense. But a
 * LINE brain fitted on unit vectors cannot say "3 more cups per degree" — dividing each row by
 * its own length makes the model non-linear in the features a child can see, which kills the
 * only lesson a line is there to teach. So the data sense hands the line brain THIS vector.
 * Layout is identical to vec(): scaled numbers · one-hot options · the level constant 1.
 */
function rawVec(id, features) {
  const s = schema(id);
  const v = [];
  for (const f of s.features) {
    const x = features[f.id];
    if (f.options) { for (const o of f.options) v.push(x === o ? 1 : 0); }
    else v.push(f.max === f.min ? 0 : (Number(x) - f.min) / (f.max - f.min));
  }
  v.push(1);
  return v;
}

/**
 * What each slot of vec()/rawVec() MEANS, so a fitted coefficient can be read out loud in the
 * child's own units. `span` is (max − min) for a scaled number, so a weight w on that slot is
 * `w / span` per real unit ("3 cups per degree"); options and the level constant have span 1.
 *
 * `unitKey` (an authored feature's translation key) and `unitName` (task D: an UPLOADED feature's
 * plain text straight off the file, table-import.js's buildSchema — there is nothing to
 * translate) are mutually exclusive, mirroring the schema's own nameKey|name split; a reader
 * (game.js) prefers unitName when present, falling back to translating unitKey.
 * @returns {Array<{name:string, unitKey:string|null, unitName:string|null, span:number, feature:string|null, option:string|null, level?:boolean}>}
 */
function dims(id) {
  const s = schema(id);
  const out = [];
  for (const f of s.features) {
    const label = { unitKey: f.nameKey || null, unitName: f.name !== undefined ? f.name : null };
    if (f.options) {
      for (const o of f.options) out.push(Object.assign({ name: o, span: 1, feature: f.id, option: o }, label));
    } else {
      out.push(Object.assign({ name: f.name !== undefined ? f.name : f.id, span: (f.max - f.min) || 1, feature: f.id, option: null }, label));
    }
  }
  out.push({ name: 'level', unitKey: null, unitName: null, span: 1, feature: null, option: null, level: true });
  return out;
}

const WorkshopDatasets = { DATASETS, ORDER, schema, rows, split, vec, rawVec, dims, face };
if (typeof module !== 'undefined' && module.exports) module.exports = WorkshopDatasets;
if (typeof window !== 'undefined') window.WorkshopDatasets = WorkshopDatasets;
