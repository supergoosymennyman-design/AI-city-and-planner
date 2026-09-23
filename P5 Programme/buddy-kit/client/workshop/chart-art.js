/**
 * chart-art.js — paints what logic/chart.js placed. Canvas only: every number it draws was
 * computed by the pure planner, so the geometry is testable in node and this file is just ink.
 *
 * The two pictures the workshop needs:
 *   scatter — the regression lesson. Studied rows are HOLLOW rings (the machine saw these), new
 *             rows are FILLED dots (it did not), the rule is a line through them, and a thin
 *             stick joins each new row's truth to what the machine said. Those sticks are the
 *             error — the thing "off by 6.2 cups" was hiding.
 *   matrix  — the four cells as areas: the confusion matrix drawn instead of listed.
 *
 * Colours come from the hall's six (styles.css): SIGNAL teal is what the machine thinks, LAMP
 * amber is truth/data, CHALK is ink on the dark instrument face.
 *
 * Deterministic; no clock, no randomness. Globals: window.WorkshopChartArt.
 */
(function () {
  'use strict';

  /**
   * The shared canvas font stack (task 085). ONE copy lives in floor-art.js (its FAMILY const);
   * this reads it LAZILY because floor-art.js loads AFTER this file in index.html — a constant
   * captured at closure-build time would be undefined. A canvas never inherits the page font, so
   * without this the belt would draw Traditional Chinese in HK faces while these pictures fell
   * back to whatever the browser picked last.
   * @returns {string} a CSS font-family list, no leading space (callers write `'12px ' + FAM()`).
   */
  function FAM() {
    const shared = (typeof window !== 'undefined' && window.WorkshopFloorArt && window.WorkshopFloorArt.FAMILY) || '';
    return shared ? shared.trim() : 'system-ui, "Segoe UI", "PingFang HK", "Microsoft JhengHei", sans-serif';
  }


  var C = {
    face: '#0b1016', grid: 'rgba(146,164,182,0.18)', axis: 'rgba(203,214,226,0.45)',
    ink: '#cbd6e2', dim: '#8b98a6',
    truth: '#ffc24b',        // LAMP — the world's answer
    guess: '#4fd1c5',        // SIGNAL — what the machine thinks
    miss: 'rgba(224,85,77,0.85)',
    good: 'rgba(47,191,113,0.55)', bad: 'rgba(224,85,77,0.5)',
  };

  function fmt(n) {
    var r = Math.round(Number(n) * 100) / 100;
    return String(Number.isInteger(r) ? r : r.toFixed(2).replace(/0+$/, '').replace(/\.$/, ''));
  }

  /** Size a canvas for the device pixel ratio and return its 2-D context in CSS pixels. */
  function prep(cv, w, h) {
    var dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    var ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = C.face;
    ctx.fillRect(0, 0, w, h);
    return ctx;
  }

  /**
   * @param {HTMLCanvasElement} cv
   * @param {object} plan from Chart.scatterPlan
   * @param {{w:number, h:number, xLabel:string, yLabel:string, emptyText:string}} o
   */
  function scatter(cv, plan, o) {
    var ctx = prep(cv, o.w, o.h);
    var b = plan.box;
    if (plan.empty) {
      ctx.fillStyle = C.dim; ctx.font = '12px ' + FAM(); ctx.textAlign = 'center';
      ctx.fillText(o.emptyText || '', o.w / 2, o.h / 2);
      return;
    }
    ctx.font = '10px ui-monospace, Consolas, monospace';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (var i = 0; i < plan.yTicks.length; i++) {
      var t = plan.yTicks[i];
      ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(b.x, Math.round(t.py) + 0.5); ctx.lineTo(b.x + b.w, Math.round(t.py) + 0.5); ctx.stroke();
      ctx.fillStyle = C.dim; ctx.fillText(fmt(t.v), b.x - 6, t.py);
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (var j = 0; j < plan.xTicks.length; j++) {
      var xt = plan.xTicks[j];
      ctx.strokeStyle = C.grid;
      ctx.beginPath(); ctx.moveTo(Math.round(xt.px) + 0.5, b.y); ctx.lineTo(Math.round(xt.px) + 0.5, b.y + b.h); ctx.stroke();
      ctx.fillStyle = C.dim; ctx.fillText(fmt(xt.v), xt.px, b.y + b.h + 5);
    }
    ctx.strokeStyle = C.axis; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(b.x + 0.5, b.y); ctx.lineTo(b.x + 0.5, b.y + b.h + 0.5); ctx.lineTo(b.x + b.w, b.y + b.h + 0.5);
    ctx.stroke();

    // The residuals first, UNDER everything: they are the background truth of the picture.
    ctx.strokeStyle = C.miss; ctx.lineWidth = 1.5;
    for (var s = 0; s < plan.sticks.length; s++) {
      var st = plan.sticks[s];
      ctx.beginPath(); ctx.moveTo(st.px, st.py); ctx.lineTo(st.px, st.gy); ctx.stroke();
    }
    // The rule — this is always the identity diagonal (checkerView's only caller here), same
    // curve the legend calls "the dashed line is being exactly right". Dashed to match the
    // card's own paint of it (floor-art.js) — a solid line here (finding I1) told the legend's
    // reader to look for a mark that was never drawn.
    if (plan.path.length > 1) {
      ctx.strokeStyle = C.guess; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.shadowColor = 'rgba(79,209,197,0.55)'; ctx.shadowBlur = 8;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(plan.path[0].px, plan.path[0].py);
      for (var q = 1; q < plan.path.length; q++) ctx.lineTo(plan.path[q].px, plan.path[q].py);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;
    }
    // The rows. Hollow = it studied this one; filled = it had never seen it.
    for (var p = 0; p < plan.pts.length; p++) {
      var pt = plan.pts[p];
      ctx.beginPath(); ctx.arc(pt.px, pt.py, pt.studied ? 3.4 : 4, 0, 6.2832);
      if (pt.studied) { ctx.strokeStyle = C.truth; ctx.lineWidth = 1.6; ctx.stroke(); }
      else { ctx.fillStyle = C.truth; ctx.fill(); }
    }
    // Axis names, in the corners where they cannot cover a point.
    ctx.fillStyle = C.ink; ctx.font = '10px ' + FAM();
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    if (o.xLabel) ctx.fillText(o.xLabel, b.x + b.w, o.h - 1);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    if (o.yLabel) ctx.fillText(o.yLabel, 2, 1);
  }

  /**
   * @param {HTMLCanvasElement} cv
   * @param {object} plan from Chart.matrixPlan
   * @param {{w:number, h:number, labels:object, emptyText:string}} o labels keyed TP/FP/TN/FN
   */
  function matrix(cv, plan, o) {
    var ctx = prep(cv, o.w, o.h);
    if (!plan.total) {
      ctx.fillStyle = C.dim; ctx.font = '12px ' + FAM(); ctx.textAlign = 'center';
      ctx.fillText(o.emptyText || '', o.w / 2, o.h / 2);
      return;
    }
    for (var i = 0; i < plan.cells.length; i++) {
      var c = plan.cells[i];
      // The cell's FILL carries its share — a swollen wrong cell is visible before it is read.
      ctx.fillStyle = c.good ? C.good : C.bad;
      ctx.globalAlpha = 0.18 + 0.72 * c.share;
      ctx.fillRect(c.x + 1, c.y + 1, c.w - 2, c.h - 2);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(203,214,226,0.28)'; ctx.lineWidth = 1;
      ctx.strokeRect(c.x + 0.5, c.y + 0.5, c.w - 1, c.h - 1);
      ctx.fillStyle = '#f3ecdc';
      ctx.font = '700 20px ui-monospace, Consolas, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(String(c.n), c.x + c.w / 2, c.y + c.h / 2 + 4);
      ctx.fillStyle = C.dim; ctx.font = '9px ' + FAM(); ctx.textBaseline = 'top';
      var label = (o.labels && o.labels[c.key]) || c.key;
      ctx.fillText(label, c.x + c.w / 2, c.y + c.h / 2 + 10);
    }
  }

  var WorkshopChartArt = { scatter: scatter, matrix: matrix };
  if (typeof window !== 'undefined') window.WorkshopChartArt = WorkshopChartArt;
  if (typeof module !== 'undefined' && module.exports) module.exports = WorkshopChartArt;
})();
