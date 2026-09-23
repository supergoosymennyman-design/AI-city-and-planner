/**
 * BrainAdapter_grouper — the GROUPER: unsupervised learning as a brain swap (spec §5 "The
 * Grouper"; owner 2026-08-17: the toolkit is general purpose, prove it past classification).
 *
 * WHAT IT DOES: it IGNORES the shelf names. It takes every example the Sense has been given,
 * pours them together, and finds k piles of things that look alike (k-means on unit vectors).
 * To answer, it says which pile the query is closest to: "pile 1", "pile 2", … The child
 * never told it what the piles are — it invented them, and the child names the bins AFTER.
 *
 * WHY IT MATTERS BESIDE THE MEMORY / PROTOTYPE BRAINS: same Sense, same shelves, one combo
 * change, and the sorter becomes "the machine that invented its own bins". Honest
 * unsupervised learning, child in charge: put everything on ONE shelf, pick the Grouper,
 * set the piles dial, run — then look in the bins and decide what it found.
 *
 * k = opts.k, the Sense's own dial (the app labels it "piles" when this brain is worn).
 * Labels are ordered by pile size (biggest = pile 1), ties by the smallest example id, so a
 * pile's name is stable while its members are. Evidence = the query's nearest examples IN
 * its pile, plus every pile's centre — "how far to each pile", the brain's honest why.
 *
 * Deterministic: farthest-first seeding from the lowest example id, fixed iteration cap, ties
 * by index — no randomness, no clock. State is plain JSON ({examples}); the clustering runs
 * in answer() because that is where k arrives (kit: learn gets ALL examples, no hidden state).
 * Globals: window.BrainAdapter_grouper. CommonJS-exported for node --test and the kit checker.
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

  var MAX_ITERS = 12;

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
  function dist(a, b) { return Math.sqrt(Math.max(0, 2 - 2 * cosine(a, b))); } // unit vectors: d² = 2 − 2cos

  /** Keep the examples, cleaned and unit-normalised, in id order. Nothing else is decided here. */
  function learn(examples) {
    var out = [];
    for (var i = 0; i < (examples || []).length; i++) {
      var ex = examples[i];
      if (!ex || !Array.isArray(ex.vec) || !ex.vec.length) continue;
      out.push({ id: ex.id, label: typeof ex.label === 'string' ? ex.label : '', vec: unit(ex.vec), display: ex.display });
    }
    out.sort(function (a, b) { return (a.id || 0) - (b.id || 0); });
    // Same length only — a wrong-length vector cannot be averaged with the rest.
    var dims = out.length ? out[0].vec.length : 0;
    return { examples: out.filter(function (e) { return e.vec.length === dims; }) };
  }

  /**
   * k-means over the examples' unit vectors. Returns piles ordered biggest-first:
   * [{ centre:number[], members:number[] (indexes into examples) }].
   */
  function cluster(examples, k) {
    var n = examples.length;
    if (!n) return [];
    k = Math.max(1, Math.min(Math.floor(k) || 1, n));
    // Farthest-first seeding: start at the lowest id, then repeatedly the example farthest
    // from every centre so far — deterministic, and it spreads the seeds.
    var centres = [examples[0].vec];
    while (centres.length < k) {
      var bestI = -1, bestD = -1;
      for (var i = 0; i < n; i++) {
        var dmin = Infinity;
        for (var c = 0; c < centres.length; c++) dmin = Math.min(dmin, dist(examples[i].vec, centres[c]));
        if (dmin > bestD) { bestD = dmin; bestI = i; }
      }
      centres.push(examples[bestI].vec);
    }
    var assign = new Array(n).fill(-1);
    for (var it = 0; it < MAX_ITERS; it++) {
      var changed = false;
      for (var e = 0; e < n; e++) {
        var best = 0, bd = Infinity;
        for (var cc = 0; cc < centres.length; cc++) {
          var d = dist(examples[e].vec, centres[cc]);
          if (d < bd) { bd = d; best = cc; }
        }
        if (assign[e] !== best) { assign[e] = best; changed = true; }
      }
      // Recompute centres as the unit mean of their members; an emptied centre keeps its place.
      var sums = centres.map(function (cv) { return new Array(cv.length).fill(0); });
      var counts = new Array(centres.length).fill(0);
      for (var m = 0; m < n; m++) {
        var v = examples[m].vec, s = sums[assign[m]];
        for (var dd = 0; dd < v.length; dd++) s[dd] += v[dd];
        counts[assign[m]] += 1;
      }
      for (var ci = 0; ci < centres.length; ci++) if (counts[ci]) centres[ci] = unit(sums[ci]);
      if (!changed) break;
    }
    var piles = centres.map(function (cv, idx) {
      var members = [];
      for (var q = 0; q < n; q++) if (assign[q] === idx) members.push(q);
      return { centre: cv, members: members };
    }).filter(function (p) { return p.members.length; });
    piles.sort(function (a, b) {
      return b.members.length - a.members.length || (examples[a.members[0]].id || 0) - (examples[b.members[0]].id || 0);
    });
    return piles;
  }

  /**
   * @returns {{label:string, value:number, evidence:Array<{label:string, distance:number, display:string}>}|null}
   *   label = "pile N" (1-based, biggest pile first). evidence = the nearest examples inside the
   *   answering pile (so a child sees WHAT the pile is made of), then every pile's centre.
   */
  function answer(state, vec, opts) {
    try {
      if (!state || !Array.isArray(state.examples) || !state.examples.length) return null;
      if (!Array.isArray(vec) || !vec.length) return null;
      var k = opts && Number.isFinite(opts.k) ? opts.k : 2;
      var examples = state.examples;
      var piles = cluster(examples, k);
      if (!piles.length) return null;
      var q = unit(vec);
      if (q.length !== examples[0].vec.length) return null;
      var bestP = 0, bestD = Infinity;
      for (var p = 0; p < piles.length; p++) {
        var d = dist(q, piles[p].centre);
        if (d < bestD) { bestD = d; bestP = p; }
      }
      var pile = piles[bestP];
      var label = 'pile ' + (bestP + 1);
      // Nearest members of the winning pile — the pile explained by what is in it.
      var members = pile.members.map(function (i) {
        var ex = examples[i];
        return { label: label, distance: dist(q, ex.vec), display: (ex.display || ex.label || ('example ' + ex.id)) + ' (in ' + label + ')' };
      }).sort(function (a, b) { return a.distance - b.distance; }).slice(0, 3);
      // `count` is a STRUCTURED field, not just a number baked into `display`'s English sentence
      // — pilePlan (view(), below) reads it directly rather than parsing the sentence back apart,
      // and it is what distinguishes a "centre" evidence entry from a "member" one (members carry
      // no `count`). Both are computed from the SAME `piles` this answer() call already built;
      // adding the field exposes data that already exists, it does not cluster a second time.
      var centres = piles.map(function (pl, idx) {
        return { label: 'pile ' + (idx + 1), distance: dist(q, pl.centre), count: pl.members.length, display: 'the middle of pile ' + (idx + 1) + ' (' + pl.members.length + ')' };
      });
      var value = Math.max(0, Math.min(1, cosine(q, pile.centre)));
      return { label: label, value: value, evidence: members.concat(centres) };
    } catch (e) {
      return null;
    }
  }

  /** A pile's 1-based number, parsed back out of its own label ("pile 3" → 3) — the SAME text
   *  answer() already writes, never a re-derived index. Used by view() to name both a pile's id
   *  and the winner, so the plan can never disagree with the label the child already reads. */
  function pileIdFrom(label) {
    var m = /pile (\d+)/.exec(String(label === undefined || label === null ? '' : label));
    return m ? Number(m[1]) : null;
  }

  /**
   * The Grouper's own picture (spec §5.5): the query at the centre, ONE point per PILE it
   * invented, at the distance answer() already measured — and which pile the query joined.
   *
   * BINDING RULING (task-6 brief §2): this function MUST NOT re-cluster. It never calls
   * cluster() — the k-means that decided the piles runs exactly once, inside answer(). Everything
   * drawn here comes straight from `ans.evidence`, the SAME evidence tail a child already reads
   * (brains/grouper.js's own answer(), above: every pile's centre distance + member count, then
   * the winning pile's nearest members before them). The "centre" entries are the ones that carry
   * a `count` field (members never do — that is the whole reason `count` was added to answer()'s
   * evidence rather than left inside `display`'s English sentence); filtering on that is reading
   * structured data the adapter already reported, not re-deriving a decision.
   *
   * A view with no answer (untaught, or a query answer() rejected) draws nothing — honest, same
   * as proto/number.
   * @param {object} state  from learn() — unused directly; the answer already carries everything
   * @param {number[]} vec  unused directly, same reason
   * @param {{label:string, value:number, evidence:Array}|null} ans  from answer(), same call
   * @param {{seed?:number}} [opts]
   * @returns {object|null} a piles plan, or null when there is nothing taught / answered yet
   */
  function view(state, vec, ans, opts) {
    try {
      if (!ans || !Array.isArray(ans.evidence)) return null;
      var centres = ans.evidence.filter(function (e) { return typeof e.count === 'number'; });
      if (!centres.length) return null;
      var piles = centres.map(function (c) { return { id: pileIdFrom(c.label), distance: c.distance, count: c.count }; });
      var snapTo = pileIdFrom(ans.label);
      var plan = BrainView.pilePlan({ piles: piles, seed: (opts && opts.seed) || 1, snapTo: snapTo, answer: ans });
      return plan.empty ? null : plan;
    } catch (e) {
      return null;
    }
  }

  /** Kit-only fixture: two obvious clumps, labels deliberately WRONG — the grouper must not
   *  read them. The query sits in the clump the shelf names call "b"; the answer is a pile. */
  function sampleCase() {
    return {
      examples: [
        { id: 1, label: 'a', vec: [1, 0] }, { id: 2, label: 'a', vec: [0.98, 0.1] }, { id: 3, label: 'a', vec: [0.95, 0.2] },
        { id: 4, label: 'b', vec: [0, 1] }, { id: 5, label: 'b', vec: [0.1, 0.98] },
      ],
      query: [0.05, 0.9],
      k: 2,
      expectLabel: 'pile 2',
    };
  }

  var adapter = {
    id: 'grouper',
    // The dials this brain READS: k, which it spends as the number of piles to invent.
    dials: ['k'],
    name: 'Grouper',
    note: 'Ignores the shelf names. Pours every example together and finds k piles that look alike — then says which pile a thing belongs to. Nobody taught it the piles: it invented them. Name your bins after you look inside.',
    learn: learn,
    answer: answer,
    view: view,
    sampleCase: sampleCase,
  };
  if (typeof window !== 'undefined') window.BrainAdapter_grouper = adapter;
  if (typeof module !== 'undefined' && module.exports) module.exports = adapter;
})();
