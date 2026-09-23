/**
 * BrainAdapter_knn — the app's memory brain (logic/brain.js) spoken in the BRAIN ADAPTER
 * contract (model-library kit, ADAPTER.md §3b): learn(examples) → state, answer(state, vec,
 * {k}) → {label, value, evidence} | null.
 *
 * WHY THIS FILE EXISTS: the toolkit is general purpose (owner 2026-08-17) — the KNN is ONE brain,
 * not THE brain. Wrapping it in the same contract every other brain must meet is what makes the
 * slot pluggable: the app talks to "a brain", and this happens to be the first one.
 *
 * What it is: k-nearest-neighbour over the child's examples. Instant, explainable (Evidence =
 * the exact voters), never generalises past what it was shown. Deterministic — logic/brain.js
 * owns the tie-break rules; nothing here adds randomness or a clock.
 *
 * Globals: window.BrainAdapter_knn. CommonJS-exported for node --test and the kit checker.
 */
(function () {
  'use strict';

  // brain.js sits at logic/brain.js in the app and beside this file in the intern kit — this
  // file is a byte copy in both places (a test pins it), so it resolves either.
  var Brain = null;
  if (typeof module !== 'undefined' && module.exports) {
    try { Brain = require('../logic/brain.js'); } catch (e) { Brain = require('../brain.js'); }
  } else if (typeof window !== 'undefined') Brain = window.WorkshopBrain;

  // Same dual resolution as Brain above — this file is a byte copy in app + kit, and a test
  // pins that (see the file's header comment), so BrainView must resolve the same way.
  var BrainView = null;
  if (typeof module !== 'undefined' && module.exports) {
    try { BrainView = require('../logic/brain-view.js'); } catch (e) { BrainView = require('../brain-view.js'); }
  } else if (typeof window !== 'undefined') BrainView = window.WorkshopBrainView;

  /**
   * Rebuild shelves from the flat example list. Cheap (O(n)); runs on every teach.
   * @param {Array<{label:string, vec:number[], id:number, display?:string}>} examples
   * @returns {{shelves: object, nextId: number}} plain JSON — the same shape brain.js uses
   */
  function learn(examples) {
    var state = Brain.createBrain();
    var maxId = 0;
    for (var i = 0; i < (examples || []).length; i++) {
      var ex = examples[i];
      if (!ex || typeof ex.label !== 'string' || !Array.isArray(ex.vec)) continue;
      if (!Object.prototype.hasOwnProperty.call(state.shelves, ex.label)) {
        Object.defineProperty(state.shelves, ex.label, { value: [], enumerable: true, writable: true, configurable: true });
      }
      var shelf = state.shelves[ex.label];
      shelf.push({ id: ex.id, vec: ex.vec, display: ex.display === undefined ? '' : String(ex.display) });
      if (ex.id > maxId) maxId = ex.id;
    }
    state.nextId = maxId + 1;
    return state;
  }

  /**
   * @param {object} state  from learn()
   * @param {number[]} vec
   * @param {{k?: number}} [opts]
   * @returns {{label:string, value:number, evidence:Array}|null}
   */
  function answer(state, vec, opts) {
    try {
      if (!state || !state.shelves || !Array.isArray(vec) || !vec.length) return null;
      return Brain.classify(state, vec, opts && Number.isFinite(opts.k) ? opts.k : 3);
    } catch (e) {
      return null;
    }
  }

  /**
   * The Memory brain's own picture (spec §5.5): the query at the centre, EVERY example at its
   * true distance, the k nearest marked as voting. Optional by contract (§6.1) — a brain that
   * declares none falls back to the Evidence list.
   * @returns {object|null} an orbit plan, or null when there is nothing taught yet
   */
  function view(state, vec, ans, opts) {
    try {
      if (!state || !state.shelves || !Array.isArray(vec) || !vec.length) return null;
      var plan = BrainView.orbitPlan({
        shelves: state.shelves, vec: vec,
        k: opts && Number.isFinite(opts.k) ? opts.k : 3,
        box: (opts && opts.box) || { w: 180, h: 130 },
        seed: (opts && opts.seed) || 1,
        answer: ans || null,
      });
      return plan.empty ? null : plan;
    } catch (e) {
      return null;
    }
  }

  /** Kit-only fixture: two shelves, a query nearer one of them, the expected label. */
  function sampleCase() {
    return {
      examples: [
        { id: 1, label: 'up', vec: [1, 0, 0] }, { id: 2, label: 'up', vec: [0.9, 0.1, 0] },
        { id: 3, label: 'down', vec: [0, 1, 0] }, { id: 4, label: 'down', vec: [0.1, 0.9, 0] },
      ],
      query: [0.8, 0.2, 0],
      expectLabel: 'up',
    };
  }

  var adapter = {
    id: 'knn',
    // The dials this brain READS, so the app only ever offers a control that can move
    // something (the same contract line.js uses for penalty/degree): k is the neighbourhood
    // it votes with.
    dials: ['k'],
    // this brain's answer() names a REAL stored example (evidence[0].id) — the sense may offer the nearest port (spec 2026-09-04 §7)
    nearest: true,
    // this brain's evidence is ONE ROW PER VOTER (the k nearest examples, a label can repeat
    // across rows) — the app's debugging walk may show a real vote-share runner-up (final
    // whole-branch review, I2 completion; ADAPTER.md's own "Optional declarations")
    votes: true,
    name: 'Memory brain',
    note: 'Remembers every example and answers with its k nearest ones. Never generalises past what it was shown — and shows you exactly which examples voted.',
    learn: learn,
    answer: answer,
    view: view,
    sampleCase: sampleCase,
  };
  if (typeof window !== 'undefined') window.BrainAdapter_knn = adapter;
  if (typeof module !== 'undefined' && module.exports) module.exports = adapter;
})();
