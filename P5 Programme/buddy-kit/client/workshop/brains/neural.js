/**
 * BrainAdapter_neural — the NEURAL brain: a small trained network as a brain swap (owner
 * 2026-08-18: "we can add it now"). Same shelves, same Sense — a fourth kind of learner.
 *
 * WHAT IT IS: one hidden layer (ReLU) and a softmax over the shelf names, trained from scratch
 * on the child's examples by full-batch gradient descent, every time learn() is called. Deep
 * learning at the smallest honest scale — the same maths as the big nets, in ~120 lines a
 * teacher can read.
 *
 * WHY IT MATTERS BESIDE THE MEMORY BRAIN (the interpretability lesson, spec §"Professor gallery"):
 * the memory brain KEEPS the examples and points at them ("photo 3 voted"); this one keeps only
 * WEIGHTS — after training the examples are gone. Its Evidence can only be "how sure of each
 * shelf" (a probability per shelf), never "which example". A child who tries both on the same
 * shelves sees the trade: the net generalises smoothly and answers fast, and it cannot show
 * its working. That contrast is the whole reason this brain ships.
 *
 * Deterministic: seeded weight init (mulberry32, fixed seed), fixed epochs, no clock — the same
 * examples always train to the SAME state (kit rule 5.5; the checker trains twice and diffs).
 * State is plain JSON (weights as flat arrays). learn() memoises the last few trainings by a
 * fingerprint of its input: the app calls learn(ALL examples) on every read (kit rule — no hidden
 * state), and a Sense on a running belt reads ten times a second; retraining a net each read
 * would stall the belt. The memo returns byte-identical state for identical input, so it changes
 * nothing observable — it is a cache, not state.
 *
 * NOT tfjs on purpose: the brain contract is synchronous, kit-copyable and node-testable, and a
 * dozen shelves of ≤1024-dim vectors do not need a tensor library. A bigger net (conv layers, GPU)
 * would come in as a whole-model or a tfjs-backed brain later — this file is the shape.
 *
 * Globals: window.BrainAdapter_neural. CommonJS-exported for node --test and the kit checker.
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

  var HIDDEN = 12;      // hidden units — enough to bend a few shelves apart, small enough to train in ms
  var EPOCHS = 150;     // full-batch steps; fixed so training is a pure function of the examples
  var LR = 0.5;         // learning rate on mean cross-entropy (inputs are unit vectors, so this is tame)
  var L2 = 1e-4;        // a whisper of weight decay — keeps a two-example shelf from going to ±∞
  var SEED = 20260818;  // weight-init seed. Fixed: the checker trains twice and diffs the states.
  var MEMO_MAX = 4;     // learn() memo depth (one per Sense × brain pair a machine is likely to run)

  /** mulberry32 — a tiny seeded PRNG so init is deterministic everywhere (no Math.random). */
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function unit(v) {
    var n = 0, i;
    for (i = 0; i < v.length; i++) n += v[i] * v[i];
    n = Math.sqrt(n) || 1;
    var out = new Array(v.length);
    for (i = 0; i < v.length; i++) out[i] = v[i] / n;
    return out;
  }
  /** A cheap, order-sensitive fingerprint of the examples: ids, labels, dims and a value hash. */
  function fingerprint(examples) {
    var h = 2166136261, i, j, ex, v;
    var parts = [];
    for (i = 0; i < examples.length; i++) {
      ex = examples[i];
      parts.push(String(ex.id) + '=' + String(ex.label) + ':' + ex.vec.length);
      for (j = 0; j < ex.vec.length; j++) {
        v = Math.round(ex.vec[j] * 1e6) | 0;
        h = Math.imul(h ^ v, 16777619) >>> 0;
      }
    }
    return parts.join('|') + '#' + h;
  }
  var memo = []; // [{key, state}] most recent last

  function forward(st, x) {
    // hidden = relu(W1 x + b1); logits = W2 hidden + b2; probs = softmax(logits)
    var H = st.hidden, D = st.dim, C = st.classes.length, i, j, s;
    var h = new Array(H);
    for (i = 0; i < H; i++) {
      s = st.b1[i];
      var row = i * D;
      for (j = 0; j < D; j++) s += st.W1[row + j] * x[j];
      h[i] = s > 0 ? s : 0;
    }
    var z = new Array(C), max = -Infinity;
    for (i = 0; i < C; i++) {
      s = st.b2[i];
      var r2 = i * H;
      for (j = 0; j < H; j++) s += st.W2[r2 + j] * h[j];
      z[i] = s; if (s > max) max = s;
    }
    var p = new Array(C), sum = 0;
    for (i = 0; i < C; i++) { p[i] = Math.exp(z[i] - max); sum += p[i]; }
    for (i = 0; i < C; i++) p[i] /= sum;
    return { h: h, p: p };
  }

  /**
   * Train from scratch on ALL examples. Examples with a mismatched vector length are dropped
   * (a shelf mixing two senses' vectors is a bug upstream, not a reason to throw).
   * @returns {{classes:string[], dim:number, hidden:number, W1:number[], b1:number[], W2:number[], b2:number[], epochs:number, loss:number, n:number}}
   */
  function learn(examples) {
    var exs = [], i, j, k;
    for (i = 0; i < (examples || []).length; i++) {
      var ex = examples[i];
      if (ex && Array.isArray(ex.vec) && ex.vec.length && ex.label !== undefined && ex.label !== null) exs.push(ex);
    }
    exs.sort(function (a, b) { return (a.id || 0) - (b.id || 0); });
    if (!exs.length) return { classes: [], dim: 0, hidden: HIDDEN, W1: [], b1: [], W2: [], b2: [], epochs: 0, loss: 0, n: 0, lossHistory: [] };
    var dim = exs[0].vec.length;
    exs = exs.filter(function (e) { return e.vec.length === dim; });
    var key = fingerprint(exs);
    for (i = 0; i < memo.length; i++) if (memo[i].key === key) return JSON.parse(JSON.stringify(memo[i].state));

    var classes = [];
    for (i = 0; i < exs.length; i++) if (classes.indexOf(String(exs[i].label)) < 0) classes.push(String(exs[i].label));
    classes.sort();
    var C = classes.length, H = HIDDEN, D = dim, N = exs.length;
    var X = exs.map(function (e) { return unit(e.vec); });
    var Y = exs.map(function (e) { return classes.indexOf(String(e.label)); });
    var rand = rng(SEED);
    var st = { classes: classes, dim: D, hidden: H, W1: new Array(H * D), b1: new Array(H), W2: new Array(C * H), b2: new Array(C), epochs: 0, loss: 0, n: N };
    var s1 = Math.sqrt(2 / D), s2 = Math.sqrt(2 / H);
    for (i = 0; i < H * D; i++) st.W1[i] = (rand() * 2 - 1) * s1;
    for (i = 0; i < H; i++) st.b1[i] = 0;
    for (i = 0; i < C * H; i++) st.W2[i] = (rand() * 2 - 1) * s2;
    for (i = 0; i < C; i++) st.b2[i] = 0;
    if (C < 2) { // one shelf: nothing to tell apart — no training, answer() says so
      st.loss = 0; st.epochs = 0; st.lossHistory = []; // MEMOISATION TRAP: set before remember(), never after — a cached read must see the same (empty) curve a fresh one would
      remember(key, st);
      return JSON.parse(JSON.stringify(st));
    }
    var gW1 = new Array(H * D), gb1 = new Array(H), gW2 = new Array(C * H), gb2 = new Array(C);
    var epoch, loss = 0;
    st.lossHistory = []; // one entry per epoch, pushed below — set before remember() for the same reason as the C<2 branch above
    for (epoch = 0; epoch < EPOCHS; epoch++) {
      for (i = 0; i < H * D; i++) gW1[i] = 0;
      for (i = 0; i < H; i++) gb1[i] = 0;
      for (i = 0; i < C * H; i++) gW2[i] = 0;
      for (i = 0; i < C; i++) gb2[i] = 0;
      loss = 0;
      for (k = 0; k < N; k++) {
        var x = X[k], y = Y[k];
        var f = forward(st, x);
        loss -= Math.log(Math.max(1e-12, f.p[y]));
        // dL/dz = p − onehot(y)
        var dz = f.p.slice(); dz[y] -= 1;
        var dh = new Array(H);
        for (i = 0; i < H; i++) dh[i] = 0;
        for (i = 0; i < C; i++) {
          gb2[i] += dz[i];
          for (j = 0; j < H; j++) { gW2[i * H + j] += dz[i] * f.h[j]; dh[j] += dz[i] * st.W2[i * H + j]; }
        }
        for (i = 0; i < H; i++) {
          if (f.h[i] <= 0) continue; // relu gate
          gb1[i] += dh[i];
          var row = i * D;
          for (j = 0; j < D; j++) gW1[row + j] += dh[i] * x[j];
        }
      }
      var inv = LR / N;
      for (i = 0; i < H * D; i++) st.W1[i] -= inv * gW1[i] + LR * L2 * st.W1[i];
      for (i = 0; i < H; i++) st.b1[i] -= inv * gb1[i];
      for (i = 0; i < C * H; i++) st.W2[i] -= inv * gW2[i] + LR * L2 * st.W2[i];
      for (i = 0; i < C; i++) st.b2[i] -= inv * gb2[i];
      st.epochs = epoch + 1;
      // ALREADY COMPUTED (brief §"Step 3"): `loss` above is this epoch's own full-batch sum, over
      // the weights this epoch trained WITH (computed before this epoch's update, same convention
      // st.loss below already used) — pushing it here is genuinely two lines, not a second pass.
      st.lossHistory.push(Math.round((loss / N) * 1e6) / 1e6);
      if (loss / N < 0.01) break; // fit — stopping here is deterministic too (same data, same path)
    }
    st.loss = Math.round((loss / N) * 1e6) / 1e6;
    // Round the weights so the JSON state is stable across engines' last-bit float differences.
    for (i = 0; i < st.W1.length; i++) st.W1[i] = Math.round(st.W1[i] * 1e9) / 1e9;
    for (i = 0; i < st.W2.length; i++) st.W2[i] = Math.round(st.W2[i] * 1e9) / 1e9;
    for (i = 0; i < st.b1.length; i++) st.b1[i] = Math.round(st.b1[i] * 1e9) / 1e9;
    for (i = 0; i < st.b2.length; i++) st.b2[i] = Math.round(st.b2[i] * 1e9) / 1e9;
    remember(key, st);
    return JSON.parse(JSON.stringify(st));
  }
  function remember(key, st) {
    memo.push({ key: key, state: JSON.parse(JSON.stringify(st)) });
    while (memo.length > MEMO_MAX) memo.shift();
  }

  /**
   * @returns {{label:string, value:number, evidence:Array<{label:string, display:string}>}|null}
   *   label = the most probable shelf; value = its probability (0..1); evidence = every shelf
   *   with its probability, most likely first — a NET has no examples to point at.
   */
  function answer(state, vec, opts) {
    try {
      if (!state || !Array.isArray(state.classes) || !state.classes.length) return null;
      if (!Array.isArray(vec) || vec.length !== state.dim) return null;
      var C = state.classes.length, i;
      if (C < 2) {
        return { label: state.classes[0], value: 1, evidence: [{ label: state.classes[0], display: state.classes[0] + ' — the only shelf; a net needs two to learn a difference' }] };
      }
      var f = forward(state, unit(vec));
      var order = [];
      for (i = 0; i < C; i++) order.push(i);
      order.sort(function (a, b) { return f.p[b] - f.p[a] || a - b; });
      var best = order[0];
      return {
        label: state.classes[best],
        value: Math.max(0, Math.min(1, f.p[best])),
        evidence: order.map(function (ci) {
          return { label: state.classes[ci], display: state.classes[ci] + ' ' + Math.round(100 * f.p[ci]) + '% — weights only, no example to show' };
        }),
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * The Neural brain's own picture (spec §5.5, "the one brain whose learning is a PROCESS worth
   * watching" — the loss curve is this brain's face, not only a panel extra): the per-epoch
   * training loss, straight from `state.lossHistory` (Step 3, above) — never recomputed,
   * smoothed, or re-run here. The face retains the training history. The panel additionally
   * receives the current query's hidden responses and output scores from forward(). An
   * untrained net (`C < 2`, `lossHistory` empty) draws nothing, same honesty every other brain's
   * view() holds for "untaught".
   * @param {object} state  learned weights and recorded training history
   * @param {number[]} vec  current query; changes responses, never the training curve
   * @param {object|null} ans  current answer, carried into the view plan
   * @param {object} [opts]  translated training-axis words; no model dial is read
   * @returns {object|null} a loss plan, or null when nothing was ever trained
   */
  function view(state, vec, ans, opts) {
    try {
      if (!state || !Array.isArray(state.lossHistory)) return null;
      var plan = BrainView.lossPlan({
        history: state.lossHistory, answer: ans || null,
        epochsWord: opts && opts.epochsWord, lossWord: opts && opts.lossWord,
      });
      // Query responses come from the SAME forward pass as answer(), never an illustrative net.
      // This adds a read-only view; learning, stored weights and prediction arithmetic are unchanged.
      if (state.classes.length > 1 && Array.isArray(vec) && vec.length === state.dim) {
        var response = forward(state, unit(vec));
        plan.network = { hidden: response.h.slice(), outputs: state.classes.map(function (label, i) {
          return { label: label, value: response.p[i] };
        }) };
      }
      return plan.empty ? null : plan;
    } catch (e) {
      return null;
    }
  }

  /** Kit-only fixture: two shelves in a 2-D world that a straight line separates; the query
   *  sits on the "b" side. Any working net says b. */
  function sampleCase() {
    return {
      examples: [
        { id: 1, label: 'a', vec: [1, 0] }, { id: 2, label: 'a', vec: [0.9, 0.1] }, { id: 3, label: 'a', vec: [0.8, -0.1] },
        { id: 4, label: 'b', vec: [0, 1] }, { id: 5, label: 'b', vec: [0.1, 0.9] }, { id: 6, label: 'b', vec: [-0.1, 0.8] },
      ],
      query: [0.2, 0.9],
      expectLabel: 'b',
    };
  }

  var adapter = {
    id: 'neural',
    name: 'Neural brain',
    note: 'A small neural network trained from your shelves. It keeps WEIGHTS, not examples — it can say how sure it is of each shelf, but never which example made it think so.',
    learn: learn,
    answer: answer,
    view: view,
    sampleCase: sampleCase,
  };
  if (typeof window !== 'undefined') window.BrainAdapter_neural = adapter;
  if (typeof module !== 'undefined' && module.exports) module.exports = adapter;
})();
