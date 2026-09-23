/**
 * chart.js — the WORKSHOP'S PICTURE SURFACE (pure geometry; no DOM, no canvas).
 *
 * WHY THIS EXISTS: the workshop could learn, score and route, but it could never SHOW you
 * anything. Regression was a number in a table ("off by 6.2 cups"), overfitting was two numbers
 * in a table, and the toolkit spec's promised loss curve had nowhere to live. A chart is not
 * decoration here — for regression it IS the lesson: points, a rule drawn through them, and the
 * gaps that are left over.
 *
 * This module turns data into PLACED PIXELS and nothing else, so the geometry is testable in
 * node without a browser: the renderer (chart-art.js) only strokes what this returns.
 *
 * Two plans, because the workshop teaches two kinds of answer:
 *   scatterPlan — a NUMBER answer: x across, truth up, the rule as a path, residual sticks.
 *   matrixPlan  — a YES/NO answer: the four cells as areas you can compare by eye.
 *
 * Determinism: pure functions of their arguments. No Math.random, no Date.now.
 * Globals: window.WorkshopChart. CommonJS-exported for node --test.
 */
(function () {
  'use strict';

  /** Round to a "nice" step (1, 2, 5, 10, 20, 50 …) so axis ticks read like a ruler. */
  function niceStep(span, target) {
    var raw = span / Math.max(1, target);
    if (!(raw > 0) || !Number.isFinite(raw)) return 1;
    var mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    var norm = raw / mag;
    // 2.5 is in the ladder on purpose: without it a 0..97 axis steps by 50 and shows two ticks.
    var step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
    return step * mag;
  }

  /** Ticks from lo to hi on a nice step, inclusive of any that land inside. */
  function ticks(lo, hi, target) {
    var out = [];
    if (!(hi > lo)) return [{ v: lo }];
    var step = niceStep(hi - lo, target || 4);
    var first = Math.ceil(lo / step) * step;
    for (var v = first; v <= hi + step * 1e-9; v += step) {
      out.push({ v: Math.abs(v) < step * 1e-9 ? 0 : v });
      if (out.length > 40) break;
    }
    return out;
  }

  /**
   * A scatter of (x, truth) with the machine's rule drawn through it.
   *
   * @param {object} o
   * @param {Array<{x:number, y:number, guess:(number|null), studied:boolean, pop:string}>} o.points
   *        One per row: x = the feature on the across-axis, y = the TRUTH, guess = what the
   *        machine said (null if it said nothing), studied = whether the brain learned from it,
   *        pop = which POPULATION it belongs to ('studied' | 'fresh' | 'exam'; absent → derived
   *        from `studied`). The renderer colours by `pop`: a sealed-exam row is not a held-out
   *        row, and painting the two alike was how the exam pile vanished into "new" (review I5).
   * @param {Array<{x:number, y:number}>} [o.curve] The rule, already sampled by the caller —
   *        a straight line is two points, a k-NN staircase is many. Drawing a *sampled* curve is
   *        what lets one surface show a line brain and a neighbour brain side by side.
   * @param {number} o.w  @param {number} o.h  plot box in px
   * @param {{l:number,r:number,t:number,b:number}} [o.pad] margins for the axes
   * @returns {{box:object, xTicks:Array, yTicks:Array, pts:Array, path:Array, sticks:Array,
   *            xOf:Function, yOf:Function, empty:boolean}}
   *        `sticks` are the residuals — truth to guess, for rows the machine never studied
   *        (held-out AND sealed-exam), because the gap on a row it studied is not the interesting
   *        gap. Each stick carries its own `pop` so the renderer can tell the two apart.
   */
  function scatterPlan(o) {
    var pts = (o && o.points) || [];
    var pad = (o && o.pad) || { l: 44, r: 12, t: 12, b: 28 };
    var W = Math.max(80, (o && o.w) || 320), H = Math.max(70, (o && o.h) || 200);
    var box = { x: pad.l, y: pad.t, w: Math.max(10, W - pad.l - pad.r), h: Math.max(10, H - pad.t - pad.b) };
    if (!pts.length) return { box: box, xTicks: [], yTicks: [], pts: [], path: [], sticks: [], empty: true, xOf: function () { return box.x; }, yOf: function () { return box.y + box.h; } };

    var xs = [], ys = [];
    for (var i = 0; i < pts.length; i++) {
      xs.push(pts[i].x); ys.push(pts[i].y);
      if (pts[i].guess !== null && pts[i].guess !== undefined && Number.isFinite(pts[i].guess)) ys.push(pts[i].guess);
    }
    var curve = (o && o.curve) || [];
    for (var c = 0; c < curve.length; c++) { xs.push(curve[c].x); ys.push(curve[c].y); }
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    // A flat axis (every row the same x) still needs width, or every point stacks on one pixel.
    if (!(x1 > x0)) { x1 = x0 + 1; x0 -= 1; }
    if (!(y1 > y0)) { y1 = y0 + 1; y0 -= 1; }
    // Breathe: 6 % of the span each side, and let the up-axis reach 0 when it is close, so a
    // child reads "none" as the floor rather than as an arbitrary crop.
    var padY = (y1 - y0) * 0.06, padX = (x1 - x0) * 0.06;
    x0 -= padX; x1 += padX; y0 -= padY; y1 += padY;
    if (y0 > 0 && y0 < (y1 - y0) * 0.35) y0 = 0;

    var xOf = function (x) { return box.x + ((x - x0) / (x1 - x0)) * box.w; };
    var yOf = function (y) { return box.y + box.h - ((y - y0) / (y1 - y0)) * box.h; };

    var placed = [], sticks = [];
    for (var p = 0; p < pts.length; p++) {
      var pt = pts[p];
      var px = xOf(pt.x), py = yOf(pt.y);
      var pop = pt.pop || (pt.studied ? 'studied' : 'fresh');
      placed.push({ x: pt.x, y: pt.y, guess: pt.guess, studied: !!pt.studied, pop: pop, px: px, py: py,
        gy: (pt.guess !== null && pt.guess !== undefined && Number.isFinite(pt.guess)) ? yOf(pt.guess) : null });
      if (!pt.studied && placed[p].gy !== null) sticks.push({ px: px, py: py, gy: placed[p].gy, pop: pop });
    }
    var path = [];
    for (var q = 0; q < curve.length; q++) path.push({ px: xOf(curve[q].x), py: yOf(curve[q].y) });

    return {
      box: box, empty: false,
      xTicks: ticks(x0, x1, 4).map(function (t) { return { v: t.v, px: xOf(t.v) }; }),
      yTicks: ticks(y0, y1, 4).map(function (t) { return { v: t.v, py: yOf(t.v) }; }),
      pts: placed, path: path, sticks: sticks, xOf: xOf, yOf: yOf,
    };
  }

  /**
   * The four cells of a yes/no score as AREAS — the confusion matrix drawn instead of listed.
   * Reading four numbers in a table is arithmetic; seeing one square swell is a fact about the
   * machine. Cell order is the standard 2×2: rows = what the machine SAID, columns = the TRUTH.
   *
   * @param {{TP:number, FP:number, TN:number, FN:number}} cells
   * @param {number} w @param {number} h
   * @returns {{cells:Array<{key:string, n:number, x:number, y:number, w:number, h:number, good:boolean}>, total:number}}
   */
  function matrixPlan(cells, w, h) {
    var c = cells || {};
    var n = { TP: c.TP || 0, FP: c.FP || 0, TN: c.TN || 0, FN: c.FN || 0 };
    var total = n.TP + n.FP + n.TN + n.FN;
    var W = Math.max(80, w || 240), H = Math.max(60, h || 160);
    var cw = W / 2, ch = H / 2;
    var order = [
      { key: 'TP', n: n.TP, col: 0, row: 0, good: true },
      { key: 'FP', n: n.FP, col: 1, row: 0, good: false },
      { key: 'FN', n: n.FN, col: 0, row: 1, good: false },
      { key: 'TN', n: n.TN, col: 1, row: 1, good: true },
    ];
    return {
      total: total,
      cells: order.map(function (o) {
        return { key: o.key, n: o.n, good: o.good, share: total ? o.n / total : 0,
          x: o.col * cw, y: o.row * ch, w: cw, h: ch };
      }),
    };
  }

  var WorkshopChart = { scatterPlan: scatterPlan, matrixPlan: matrixPlan, ticks: ticks, niceStep: niceStep };
  if (typeof module !== 'undefined' && module.exports) module.exports = WorkshopChart;
  if (typeof window !== 'undefined') window.WorkshopChart = WorkshopChart;
})();
