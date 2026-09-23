/**
 * BrainAdapter_number — the NUMBER brain: REGRESSION as a brain swap (owner 2026-08-17: prove
 * the box is general past classification — a brain need not answer with a word).
 *
 * WHAT IT DOES: it reads the shelf NAMES as numbers. Answering, it finds the k nearest examples
 * and returns the distance-weighted average of their shelves' numbers — a NUMBER the shelves
 * never literally contained. Shelves "10", "20", "40" and a query halfway between the "10" and
 * "20" examples answer about 15. That is k-nearest-neighbour regression.
 *
 * WHY IT MATTERS BESIDE THE OTHER BRAINS: same Sense, same shelves — the memory brain can only
 * ever repeat a shelf name; this one interpolates. Wire its answer (a Display set to "the
 * word" shows the number; Only-if "more than 12" routes on it) and the machine PREDICTS.
 * With the Number sense (windows of numbers → a next number) it is the price guesser: shelves
 * named by "what came next", a query window, an honest guess — and the Scored Test showing
 * how little a random walk can be predicted.
 *
 * Shelves whose names are not numbers are ignored (a "cat" shelf teaches this brain nothing).
 * value (0..1) = closeness of the nearest voter (cos mapped to 0..1). Evidence = the voters
 * with their numbers and weights, so a child can see the average being taken.
 *
 * Deterministic (no randomness, no clock); state is plain JSON.
 * Globals: window.BrainAdapter_number. CommonJS-exported for node --test and the kit checker.
 */
(function () {
  'use strict';

  // brain-view.js sits at logic/brain-view.js in the app and beside this file in the intern kit
  // — this file is a byte copy in both places (kit law, tests/brains.test.js pins it), so it
  // must resolve either path, same dual resolution knn.js's view() uses.
  var BrainView = null;
  if (typeof module !== 'undefined' && module.exports) {
    try { BrainView = require('../logic/brain-view.js'); } catch (e) { BrainView = require('../brain-view.js'); }
  } else if (typeof window !== 'undefined') BrainView = window.WorkshopBrainView;

  function unit(v) {
    var n = 0;
    for (var i = 0; i < v.length; i++) n += v[i] * v[i];
    n = Math.sqrt(n) || 1;
    var out = new Array(v.length);
    for (var j = 0; j < v.length; j++) out[j] = v[j] / n;
    return out;
  }
  function dist(a, b) {
    var s = 0, n = Math.min(a.length, b.length);
    for (var i = 0; i < n; i++) s += a[i] * b[i];
    return Math.sqrt(Math.max(0, 2 - 2 * s)); // unit vectors: d² = 2 − 2cos
  }
  function parseNumber(label) {
    var s = String(label === undefined || label === null ? '' : label).trim().replace(/,/g, '');
    if (!s || !/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return null;
    var n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  function fmt(n) {
    // Say the number the way a child would read it: whole if whole, else two decimals.
    var r = Math.round(n * 100) / 100;
    return String(Number.isInteger(r) ? r : r.toFixed(2).replace(/0+$/, '').replace(/\.$/, ''));
  }
  /**
   * Inverse-distance weight: an exact match dominates, far voters barely count. Extracted to a
   * module-local function (task-4 brief, Ruling B) because answer() and view() both need it —
   * two independent copies of the SAME formula have already drifted once elsewhere in this game
   * (the kVoters bug, logic/brain.js:80); this is that mistake, prevented before it happens.
   * @param {number} d  distance, >= 0
   * @returns {number} weight, > 0
   */
  function weightOf(d) {
    return 1 / (d + 0.05);
  }

  /**
   * Keep only examples whose shelf name is a number, unit-normalised, id order.
   * @returns {{examples: Array<{id:number, y:number, label:string, vec:number[], display:string}>}}
   */
  function learn(examples) {
    var out = [];
    for (var i = 0; i < (examples || []).length; i++) {
      var ex = examples[i];
      if (!ex || !Array.isArray(ex.vec) || !ex.vec.length) continue;
      var y = parseNumber(ex.label);
      if (y === null) continue;
      out.push({ id: ex.id, y: y, label: String(ex.label), vec: unit(ex.vec), display: ex.display });
    }
    out.sort(function (a, b) { return (a.id || 0) - (b.id || 0); });
    return { examples: out };
  }

  /**
   * The k nearest examples to a query, nearest first — the EXACT selection answer() votes with.
   * Extracted (task-4 brief, Ruling B) so view() can reuse the SAME neighbourhood answer() used,
   * never a separately-recomputed one: `k = Math.max(1, Math.min(Math.round(k) || 3, n))` is the
   * same expression answer() used inline before this refactor, kept as one function so it cannot
   * silently diverge (module-local only — this is not the app-wide Brain.kVoters; this brain's
   * k-selection formula happens to read the same, but each brain owns its own decision rule).
   * @param {object} state  from learn()
   * @param {number[]} vec
   * @param {number} [k]
   * @returns {Array<{ex:object, d:number}>|null}  null when untaught or vec is junk
   */
  function nearestVoters(state, vec, k) {
    if (!state || !Array.isArray(state.examples) || !state.examples.length) return null;
    if (!Array.isArray(vec) || !vec.length) return null;
    var q = unit(vec);
    var scored = [];
    for (var i = 0; i < state.examples.length; i++) {
      var ex = state.examples[i];
      if (ex.vec.length !== q.length) continue;
      scored.push({ ex: ex, d: dist(q, ex.vec) });
    }
    if (!scored.length) return null;
    scored.sort(function (a, b) { return a.d - b.d || (a.ex.id || 0) - (b.ex.id || 0); });
    var kk = Math.max(1, Math.min(Math.round(k) || 3, scored.length));
    return scored.slice(0, kk);
  }

  /**
   * @returns {{label:string, value:number, evidence:Array<{id:number, label:string, distance:number, display:string}>}|null}
   *   label = the predicted number as text; evidence = the k voters nearest first, each showing
   *   its number and its share of the average.
   *
   * Each voter carries its own `id` — the STORED EXAMPLE it is, not just what it looked like.
   * This adapter declares `nearest: true` (above), and the workshop only offers a sense's nearest
   * port for a brain whose evidence[0] can name a real example; without the id the declaration
   * would be a socket nothing could ever come down (spec 2026-09-04 §7, the dead-controls law).
   * learn() has kept the id all along — it simply never travelled this far.
   */
  function answer(state, vec, opts) {
    try {
      var voters = nearestVoters(state, vec, opts && opts.k);
      if (!voters) return null;
      // Inverse-distance weights (an exact match dominates; far voters barely count).
      var wsum = 0, ysum = 0;
      var weights = voters.map(function (v) { var w = weightOf(v.d); wsum += w; ysum += w * v.ex.y; return w; });
      var yhat = ysum / wsum;
      var value = Math.max(0, Math.min(1, 1 - (voters[0].d * voters[0].d) / 2)); // cos of the nearest, 0..1
      return {
        label: fmt(yhat),
        value: value,
        evidence: voters.map(function (v, i) {
          return {
            id: v.ex.id, label: v.ex.label, distance: v.d,
            display: (v.ex.display || v.ex.label) + ' → ' + fmt(v.ex.y) + ' (' + Math.round(100 * weights[i] / wsum) + '% of the average)',
          };
        }),
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * The Number brain's own picture (spec §5.5): a number line carrying the SAME k voters
   * answer() used (nearestVoters, above — never a separately-chosen set), each a tick sized by
   * its WEIGHT, and the predicted number marked at its position.
   *
   * Ruling B (task-4 brief): the predicted number is PARSED from ans.label — the literal text
   * shown to the child — never recomputed from the voters here. `ans.value` is a 0..1 closeness
   * score, NOT the predicted number; drawing a marker at ans.value would land it nowhere near the
   * ticks it claims to average. If ans is null or its label doesn't parse, the picture is honestly
   * absent rather than guessing.
   *
   * `penalty` is deliberately NOT read: this brain's answer() never used it (task-4 brief,
   * binding from Task 3) — a picture that fed it anywhere would show an input the answer ignored.
   * @returns {object|null} a numberline plan, or null when untaught / the answer doesn't parse
   */
  function view(state, vec, ans, opts) {
    try {
      var voters = nearestVoters(state, vec, opts && opts.k);
      if (!voters) return null;
      var neighbours = voters.map(function (v) {
        return { value: v.ex.y, weight: weightOf(v.d), distance: v.d };
      });
      var value = ans && typeof ans.label === 'string' ? parseNumber(ans.label) : null;
      var plan = BrainView.numberLinePlan({ neighbours: neighbours, value: value });
      return plan.empty ? null : plan;
    } catch (e) {
      return null;
    }
  }

  /** Kit-only fixture: one "10", one "20", a query exactly between them → 15 (a number no shelf
   *  is named). The "cat" shelf is there to be ignored. Any k answers the same (it clamps to 2). */
  function sampleCase() {
    return {
      examples: [
        { id: 1, label: '10', vec: [1, 0] },
        { id: 2, label: '20', vec: [0, 1] },
        { id: 3, label: 'cat', vec: [-1, 0] },
      ],
      query: [1, 1],
      expectLabel: '15',
    };
  }

  var adapter = {
    id: 'number',
    // The dials this brain READS: k, the number of nearest examples it averages.
    dials: ['k'],
    // this brain's answer() names a REAL stored example (evidence[0].id) — the sense may offer the nearest port (spec 2026-09-04 §7)
    nearest: true,
    // this brain's evidence is ONE ROW PER VOTER too (nearestVoters, above — the k nearest
    // examples, unweighted in the evidence list itself; a label can repeat across rows exactly
    // like knn's) — the app's debugging walk may show a real vote-share runner-up (final
    // whole-branch review, I2 completion; ADAPTER.md's own "Optional declarations")
    votes: true,
    name: 'Number brain',
    note: 'Reads shelf names as NUMBERS and answers with the average of the nearest ones — a number the shelves never contained. It predicts instead of naming.',
    learn: learn,
    answer: answer,
    view: view,
    sampleCase: sampleCase,
  };
  if (typeof window !== 'undefined') window.BrainAdapter_number = adapter;
  if (typeof module !== 'undefined' && module.exports) module.exports = adapter;
})();
