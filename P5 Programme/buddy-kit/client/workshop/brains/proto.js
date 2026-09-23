/**
 * BrainAdapter_proto — the PROTOTYPE brain: the second learner in the toolkit, and the proof
 * that the brain slot is pluggable (model-library kit, ADAPTER.md §3b).
 *
 * WHAT IT DOES: for every shelf it remembers ONE point — the average (centroid) of the shelf's
 * examples, unit-normalised. To answer, it measures the query against every centroid and picks
 * the closest. That is nearest-centroid classification.
 *
 * WHY IT IS WORTH HAVING BESIDE THE KNN (the lesson a child can SEE, not just be told):
 *   - It GENERALISES: three wobbly "paper" photos become one "typical paper", so a fourth wobbly
 *     paper lands right even if none of the three individually was closest. KNN cannot do that.
 *   - It FORGETS the individuals: its Evidence is "how close to each shelf's average", never
 *     "which photo voted" — a real trade: explanation-by-example vs explanation-by-type.
 *   - One rogue example barely moves an average; it can single-handedly win a KNN vote.
 *   - Its answer time does not grow with the number of examples (KNN's does).
 * A child who teaches the same shelves to both brains and watches them disagree has learned
 * more about machine learning than any explanation gives.
 *
 * value (0..1) = the SOFTMAX-free honest margin: cosine to the best centroid, mapped so a query
 * sitting exactly on the centroid reads 1 and orthogonal reads 0. The app's sure line applies on
 * top (ADAPTER.md §3b) — this file draws no threshold of its own.
 *
 * Deterministic (no randomness, no clock); state is plain JSON.
 * Globals: window.BrainAdapter_proto. CommonJS-exported for node --test and the kit checker.
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
  function cosine(a, b) {
    var s = 0, n = Math.min(a.length, b.length);
    for (var i = 0; i < n; i++) s += a[i] * b[i];
    return s;
  }

  /**
   * One centroid per label. Recomputed from ALL examples every call (kit rule: no hidden state,
   * so removing an example is trivially right).
   * @param {Array<{label:string, vec:number[], id:number}>} examples
   * @returns {{protos: Array<{label:string, vec:number[], n:number}>}} plain JSON
   */
  function learn(examples) {
    // Internal label maps have no inherited entries; the returned state remains plain JSON.
    var sums = Object.create(null), counts = Object.create(null), dims = Object.create(null);
    for (var i = 0; i < (examples || []).length; i++) {
      var ex = examples[i];
      if (!ex || typeof ex.label !== 'string' || !Array.isArray(ex.vec) || !ex.vec.length) continue;
      var v = unit(ex.vec); // average of DIRECTIONS, so a big-norm example cannot dominate
      if (!sums[ex.label]) { sums[ex.label] = new Array(v.length).fill(0); counts[ex.label] = 0; dims[ex.label] = v.length; }
      if (v.length !== dims[ex.label]) continue; // a wrong-length vector is skipped, not summed
      for (var d = 0; d < v.length; d++) sums[ex.label][d] += v[d];
      counts[ex.label] += 1;
    }
    var protos = [];
    var labels = Object.keys(sums).sort(); // deterministic order
    for (var l = 0; l < labels.length; l++) {
      var label = labels[l];
      var mean = sums[label].map(function (x) { return x / counts[label]; });
      protos.push({ label: label, vec: unit(mean), n: counts[label] });
    }
    return { protos: protos };
  }

  /**
   * @returns {{label:string, value:number, evidence:Array<{label:string, distance:number, display:string}>}|null}
   *   evidence = every centroid, nearest first — "how close to each TYPE", the brain's honest why.
   */
  function answer(state, vec, opts) {
    try {
      if (!state || !Array.isArray(state.protos) || !state.protos.length) return null;
      if (!Array.isArray(vec) || !vec.length) return null;
      var q = unit(vec);
      var scored = [];
      for (var i = 0; i < state.protos.length; i++) {
        var p = state.protos[i];
        if (p.vec.length !== q.length) continue;
        var c = cosine(q, p.vec);
        // Same distance convention as the KNN's Evidence (unit vectors: d² = 2 − 2cos), so the
        // app's sure line reads both brains the same way.
        scored.push({ label: p.label, distance: Math.sqrt(Math.max(0, 2 - 2 * c)), cos: c, display: 'the typical ' + p.label + ' (' + p.n + ')' });
      }
      if (!scored.length) return null;
      scored.sort(function (a, b) { return a.distance - b.distance || (a.label < b.label ? -1 : 1); });
      var best = scored[0];
      var value = Math.max(0, Math.min(1, best.cos)); // on the centroid → 1; orthogonal → 0
      return {
        label: best.label,
        value: value,
        evidence: scored.map(function (s) { return { label: s.label, distance: s.distance, display: s.display }; }),
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * The Prototype brain's own picture (spec §5.5): the query at the centre, ONE dot per shelf —
   * its centroid — at the SAME cosine distance answer()'s Evidence reports (Ruling A, task-4
   * brief: this brain's metric is cosine on unit vectors, not Brain.distance, so the RADIUS must
   * be measured HERE, with the brain's own ruler — logic/brain-view.js owns no metric for this
   * brain and must never be asked to invent one). Optional by contract (§6.1) — an untaught brain
   * returns null, honestly, same as classify-family brains.
   *
   * `penalty` is deliberately NOT read: proto's answer() never used it, so a picture that fed it
   * anywhere would be showing an input the answer ignored (task-4 brief, binding from Task 3).
   * @returns {object|null} a centroids plan, or null when there is nothing taught yet
   */
  function view(state, vec, ans, opts) {
    try {
      if (!state || !Array.isArray(state.protos) || !state.protos.length) return null;
      if (!Array.isArray(vec) || !vec.length) return null;
      var q = unit(vec);
      var centroids = [];
      for (var i = 0; i < state.protos.length; i++) {
        var p = state.protos[i];
        if (p.vec.length !== q.length) continue;
        var c = cosine(q, p.vec);
        // Same distance convention as answer()'s Evidence (unit vectors: d² = 2 − 2cos) — the
        // picture and the Evidence panel must never disagree about how far a centroid is.
        centroids.push({ label: p.label, count: p.n, distance: Math.sqrt(Math.max(0, 2 - 2 * c)) });
      }
      if (!centroids.length) return null;
      var plan = BrainView.centroidPlan({ centroids: centroids, seed: (opts && opts.seed) || 1, answer: ans || null });
      return plan.empty ? null : plan;
    } catch (e) {
      return null;
    }
  }

  /** Kit-only fixture. NOTE the query is one that KNN k=1 gets WRONG and the prototype gets
   *  right: 'up' has a rogue example near 'down'; the average still points 'up'. */
  function sampleCase() {
    return {
      examples: [
        { id: 1, label: 'up', vec: [1, 0] }, { id: 2, label: 'up', vec: [0.95, 0.05] }, { id: 3, label: 'up', vec: [0.3, 0.7] },
        { id: 4, label: 'down', vec: [0, 1] }, { id: 5, label: 'down', vec: [0.05, 0.95] },
      ],
      query: [0.6, 0.45],
      expectLabel: 'up',
    };
  }

  var adapter = {
    id: 'proto',
    name: 'Prototype brain',
    note: 'Remembers the AVERAGE of each shelf and picks the closest average. It generalises — and it forgets which example was which.',
    learn: learn,
    answer: answer,
    view: view,
    sampleCase: sampleCase,
  };
  if (typeof window !== 'undefined') window.BrainAdapter_proto = adapter;
  if (typeof module !== 'undefined' && module.exports) module.exports = adapter;
})();
