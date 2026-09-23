'use strict';
/**
 * brain-view.js — PURE view plans: what a brain's own picture contains, as data.
 *
 * The split follows logic/chart.js: geometry here, pixels in brain-view-art.js. That is what
 * makes six bespoke algorithm pictures testable under node --test with no canvas.
 *
 * THE HONESTY RULE (spec 2026-08-19 §5.1): no projection may draw a distance that disagrees
 * with the distance the algorithm used. Camera vectors are ~1024-d; a PCA/t-SNE scatter puts
 * points near each other that are far apart in reality. This whole spec exists because the game
 * misled a child, so a misleading picture is disqualified however textbook it looks.
 *
 * The ORBIT satisfies the rule BY CONSTRUCTION: the query sits at the centre and every example
 * is placed at radius = its true distance. Angle carries NO meaning — it is spread for
 * legibility only, seeded and stable so the picture never jitters between frames.
 */
(function () {
  var Brain = null;
  if (typeof module !== 'undefined' && module.exports) Brain = require('./brain.js');
  else if (typeof window !== 'undefined') Brain = window.WorkshopBrain;

  /**
   * A stable angle for one example. NOT rng — logic/ may not use Math.random (determinism law),
   * and a jittering picture would be unreadable anyway. A cheap integer hash spreads ids that
   * arrive in order (1,2,3...) around the ring instead of clumping them.
   * @param {number} id  @param {number} seed  @returns {number} radians
   */
  function angleFor(id, seed) {
    var stableId = typeof id === 'number' ? id : hashLabel(String(id));
    var h = ((stableId | 0) * 2654435761 + (seed | 0) * 40503) >>> 0;
    return ((h % 3600) / 3600) * Math.PI * 2;
  }

  /**
   * The Memory / Prototype family picture: the query at the centre, examples at TRUE distance.
   * @param {object} o
   * @param {object} o.shelves  {label: [{id, vec, display}]}
   * @param {number[]} o.vec    the query
   * @param {number} o.k        how many vote
   * @param {{w:number,h:number}} o.box
   * @param {number} o.seed     stable angle spread
   * @returns {{kind:string, points:Array, rings:Array, kCut:number, maxDistance:number,
   *            answer:object|null, empty:boolean}}
   *          `r` is 0..1 of the usable radius; `distance` is the TRUE distance, so a renderer
   *          can label it and a test can assert the two never disagree.
   */
  function orbitPlan(o) {
    var shelves = (o && o.shelves) || {};
    var vec = (o && o.vec) || [];
    var seed = (o && o.seed) || 0;
    var all = [];
    for (var label in shelves) {
      if (!Object.prototype.hasOwnProperty.call(shelves, label)) continue;
      var shelf = shelves[label] || [];
      for (var i = 0; i < shelf.length; i++) {
        var ex = shelf[i];
        if (!ex || !Array.isArray(ex.vec)) continue;
        all.push({ exampleId: ex.id, label: label, display: ex.display || '', distance: Brain.distance(vec, ex.vec) });
      }
    }
    if (!all.length || !vec.length) {
      return { kind: 'orbit', points: [], rings: [], kCut: 0, maxDistance: 0, answer: null, empty: true };
    }
    // Same ordering rule classify() uses (distance, then id) so the voters here ARE the voters
    // that answered — a picture that disagreed with the vote would be its own kind of lie.
    all.sort(function (a, b) { return a.distance - b.distance || a.exampleId - b.exampleId; });
    // Brain.kVoters is the SINGLE definition classify() also calls (reviewer round 3: two
    // textually-identical-but-separate copies had already drifted once — k=0.4 diverged, a
    // picture glowing one example while three actually decided — and Tasks 4/6 add three more
    // view plans that need the same count, so it must be one function, not a pattern to copy).
    var kk = Brain.kVoters(o && o.k, all.length);
    var maxD = all[all.length - 1].distance || 1;
    var points = all.map(function (e, idx) {
      return {
        exampleId: e.exampleId, label: e.label, display: e.display,
        distance: e.distance,
        r: maxD > 0 ? e.distance / maxD : 0,   // 0..1 of the usable radius — monotonic in distance
        angle: angleFor(e.exampleId, seed),
        voting: idx < kk,
      };
    });
    var cutD = all[kk - 1].distance;
    return {
      kind: 'orbit',
      points: points,
      rings: [{ r: maxD > 0 ? cutD / maxD : 0, label: 'k' }],
      kCut: maxD > 0 ? cutD / maxD : 0,
      maxDistance: maxD,
      answer: (o && o.answer) || null,
      empty: false,
    };
  }

  /**
   * A deterministic integer hash of a label string. logic/ may not use Math.random (determinism
   * law), and a centroid has no example id to key angleFor off (Ruling C, task-4 brief §4: the
   * orbit keys its angle off exampleId; a prototype stands for a whole shelf, not one example —
   * there is no id to reuse). Integer arithmetic only, same djb2-style mix Brain.textVec already
   * uses for its trigram hash, so this is not a new pattern in the codebase.
   * @param {string} s  @returns {number} a non-negative 32-bit integer
   */
  function hashLabel(s) {
    var str = String(s === undefined || s === null ? '' : s);
    var h = 5381;
    for (var i = 0; i < str.length; i++) {
      h = (Math.imul(h, 33) ^ str.charCodeAt(i)) >>> 0;
    }
    return h >>> 0;
  }

  /**
   * The Prototype brain's own picture (spec §5.5): the query at the centre, ONE point per SHELF
   * — its centroid — at radius = the distance the ADAPTER already measured.
   *
   * Ruling A (task-4 brief): proto (and number) use cosine distance, not Brain.distance — this
   * module owns no metric for either of them, and must never import or invent one. The caller
   * hands in centroids whose `distance` was already computed with the brain's own ruler; this
   * function only turns an existing distance into a radius (r = distance / max distance), the
   * same honesty-by-construction the orbit uses. Reaching for Brain.distance here would draw a
   * radius the algorithm never computed — precisely what the honesty rule (§5.1) forbids, in the
   * very task that adds the picture.
   *
   * Ruling C: `angle` reuses angleFor for a stable, legible spread — NOT because it agrees with
   * the orbit's angle for the same label (it cannot: the orbit keys off exampleId, a centroid has
   * none). Angle carries no meaning here either.
   * @param {object} o
   * @param {Array<{label:string, count:number, distance:number}>} o.centroids  adapter-measured
   * @param {number} o.seed  stable angle spread, see hashLabel/angleFor
   * @param {object|null} o.answer
   * @returns {{kind:string, points:Array, rings:Array, kCut:number, maxDistance:number,
   *            answer:object|null, empty:boolean}}
   */
  function centroidPlan(o) {
    var centroids = (o && o.centroids) || [];
    var seed = (o && o.seed) || 0;
    if (!centroids.length) {
      return { kind: 'centroids', points: [], rings: [], kCut: 0, maxDistance: 0, answer: null, empty: true };
    }
    // Deterministic tie-break: distance, then label — two prototypes can legitimately tie.
    var sorted = centroids.slice().sort(function (a, b) {
      return a.distance - b.distance || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0);
    });
    var maxD = sorted[sorted.length - 1].distance || 1;
    var points = sorted.map(function (c, idx) {
      return {
        label: c.label, count: c.count, distance: c.distance,
        r: maxD > 0 ? c.distance / maxD : 0,   // 0..1 of the usable radius — monotonic in true distance
        angle: angleFor(hashLabel(c.label), seed),
        isCentroid: true,
        // Nearest-centroid classification: EXACTLY ONE prototype decides — the nearest one
        // (idx 0 after the sort above). Unlike the orbit, `k` has no meaning for this brain, so
        // this is NOT a k-cut and must not call Brain.kVoters (spec §5.5).
        voting: idx === 0,
      };
    });
    var nearestR = points[0].r;
    return {
      kind: 'centroids',
      points: points,
      rings: [{ r: nearestR, label: 'winner' }],
      kCut: nearestR,
      maxDistance: maxD,
      answer: (o && o.answer) || null,
      empty: false,
    };
  }

  /**
   * The Number brain's own picture (spec §5.5): the predicted number and its voting neighbours
   * placed on a shared line, each neighbour's position `t` (0..1) proportional to its VALUE — not
   * its distance — so "the average landed between its neighbours" is something a child can see.
   *
   * Ruling A applies here too even though there is no metric to reach for: `value`/`weight`/
   * `distance` all arrive pre-computed by the adapter; this function only turns numbers that
   * already exist into positions on a line. Ruling B (task-4 brief): `o.value` must be the
   * PREDICTED NUMBER, parsed by the caller from the answer's own label — never recomputed here.
   * @param {object} o
   * @param {Array<{value:number, weight:number, distance:number}>} o.neighbours  adapter-supplied
   * @param {number} o.value  the predicted number (NOT the adapter's 0..1 confidence — Ruling B)
   * @returns {{kind:string, neighbours:Array, answer:object|null, lo:number, hi:number, empty:boolean}}
   */
  function numberLinePlan(o) {
    var neighbours = (o && o.neighbours) || [];
    var value = o && o.value;
    if (!neighbours.length || !Number.isFinite(value)) {
      return { kind: 'numberline', neighbours: [], answer: null, lo: 0, hi: 0, empty: true };
    }
    var lo = value, hi = value;
    for (var i = 0; i < neighbours.length; i++) {
      if (neighbours[i].value < lo) lo = neighbours[i].value;
      if (neighbours[i].value > hi) hi = neighbours[i].value;
    }
    if (hi === lo) {
      // Every neighbour (and the answer) landed on the SAME number — a real machine (a shelf
      // taught one repeated value), not a corner case to special-case away. Without this, every
      // position is (v-lo)/(hi-lo) = 0/0. Widen symmetrically so the line still has a width.
      var pad = Math.max(1, Math.abs(lo) * 0.1);
      lo -= pad; hi += pad;
    }
    var span = hi - lo;
    // Sort by value (position on the line), then distance, for a deterministic draw order.
    var sorted = neighbours.slice().sort(function (a, b) {
      return a.value - b.value || a.distance - b.distance;
    });
    var points = sorted.map(function (n) {
      return { value: n.value, weight: n.weight, distance: n.distance, t: (n.value - lo) / span };
    });
    return {
      kind: 'numberline',
      neighbours: points,
      answer: { value: value, t: (value - lo) / span },
      lo: lo, hi: hi,
      empty: false,
    };
  }

  /**
   * The Grouper's own picture (spec §5.5): the query at the centre, ONE point per PILE the
   * k-means already invented — at radius = the distance answer() already measured to that
   * pile's centre. GEOMETRY ONLY (binding ruling, task-6 brief §2): the caller hands in piles
   * whose `distance`/`count` were already computed by the adapter's own cluster() call inside
   * answer() — this function never clusters, never re-measures, and owns no metric of its own,
   * the same discipline centroidPlan holds for the Prototype brain (Ruling A there applies here
   * too: reaching for a metric here would draw a radius the algorithm never computed — precisely
   * what the honesty rule, §5.1, forbids).
   *
   * `id` is the pile's own 1-based number (the same number its label already carries, "pile N")
   * — NOT an index into this function's input array, so a caller that reorders/filters piles
   * before calling still gets a `snapTo` that names the actual pile, not a position.
   * @param {object} o
   * @param {Array<{id:number, distance:number, count:number}>} o.piles  adapter-measured
   * @param {number|null} [o.snapTo]  the pile id the query joined (answer()'s own winner)
   * @param {number} [o.seed]  stable angle spread, see angleFor
   * @param {object|null} [o.answer]
   * @returns {{kind:string, piles:Array, query:{snapTo:number|null}, answer:object|null, empty:boolean}}
   */
  function pilePlan(o) {
    var piles = (o && o.piles) || [];
    var seed = (o && o.seed) || 0;
    if (!piles.length) {
      return { kind: 'piles', piles: [], query: { snapTo: null }, answer: null, empty: true };
    }
    var maxD = 0;
    for (var i = 0; i < piles.length; i++) if (piles[i].distance > maxD) maxD = piles[i].distance;
    maxD = maxD || 1;
    var out = piles.map(function (p) {
      return {
        id: p.id,
        r: p.distance / maxD,   // 0..1 of the usable radius — monotonic in true distance (maxD is `|| 1`, never 0, above)
        angle: angleFor(p.id, seed),
        count: p.count,
        isCentroid: true,
      };
    });
    return {
      kind: 'piles',
      piles: out,
      query: { snapTo: (o && o.snapTo !== undefined ? o.snapTo : null) },
      answer: (o && o.answer) || null,
      empty: false,
    };
  }

  /**
   * The Neural brain's own picture (spec §5.5, "the one brain whose learning is a process worth
   * watching"): the loss curve neural.learn() already traced, one number per epoch, unchanged.
   * GEOMETRY ONLY, same discipline as every other plan here — this function draws no distance
   * and invents no shape; it only turns an existing array of numbers into a plan a renderer can
   * scale to a box. The honesty law (§5.1) applies to a PROCESS here, not a position: the curve
   * drawn must be the real per-epoch loss neural.js measured, never a smoothed or invented one —
   * `history` is carried through by value, unmodified.
   * `epochsWord`/`lossWord` are the panel readout's two connective ENGLISH WORDS ("N epochs ·
   * loss X") — same STRINGS/t() discipline line.js's ruleSentence() already holds (this file has
   * no reachable t() of its own): threaded in by the caller (neural.view()) from opts, carried
   * through unchanged, with a plain-English fallback for a bare kit user or a pure test that
   * skips the opt — same pattern as line.js's `baseWord`/`rsqWord`.
   * @param {object} o
   * @param {number[]} o.history  one entry per epoch, in training order
   * @param {object|null} [o.answer]
   * @param {string} [o.epochsWord]
   * @param {string} [o.lossWord]
   * @returns {{kind:string, history:number[], epochs:number, final:number|null, epochsWord:string, lossWord:string, answer:object|null, empty:boolean}}
   */
  function lossPlan(o) {
    var history = (o && o.history) || [];
    if (!history.length) {
      return { kind: 'loss', history: [], epochs: 0, final: null, epochsWord: '', lossWord: '', answer: null, empty: true };
    }
    return {
      kind: 'loss',
      history: history.slice(),
      epochs: history.length,
      final: history[history.length - 1],
      epochsWord: (o && o.epochsWord) || 'epochs',
      lossWord: (o && o.lossWord) || 'loss',
      answer: (o && o.answer) || null,
      empty: false,
    };
  }

  var WorkshopBrainView = {
    orbitPlan: orbitPlan, angleFor: angleFor, hashLabel: hashLabel,
    centroidPlan: centroidPlan, numberLinePlan: numberLinePlan,
    pilePlan: pilePlan, lossPlan: lossPlan,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = WorkshopBrainView;
  if (typeof window !== 'undefined') window.WorkshopBrainView = WorkshopBrainView;
})();
