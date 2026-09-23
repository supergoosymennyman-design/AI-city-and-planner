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

/**
 * brain-view-art.js — pixels for a view plan. The plan (logic/brain-view.js) is the truth;
 * this file only strokes it, exactly as chart-art.js strokes a chart plan.
 *
 * ONE PLAN, TWO SIZES (spec §5.4). The face (~180x130 on the reader arch) and the expanded
 * panel (~900x600 over the Floor) are the SAME plan at different detail budgets — not two
 * designs. That is why the face costs almost nothing, and why they can never disagree.
 */
(function () {
  /** Below this width a box cannot carry text; it gets the face budget. */
  var FACE_MAX_W = 320;

  /** @param {{w:number,h:number}} box @returns {'face'|'panel'} */
  function budgetFor(box) {
    return (box && box.w) > FACE_MAX_W ? 'panel' : 'face';
  }

  /**
   * Draw a view plan into a box.
   * @param {CanvasRenderingContext2D} ctx
   * @param {object|null} plan  from a brain's view(); null/empty draws nothing (honest blank)
   * @param {{x:number,y:number,w:number,h:number}} box
   * @param {{budget?:'face'|'panel', palette?:object}} [opts]
   */
  function draw(ctx, plan, box, opts) {
    if (!plan || plan.empty || !box) return;
    var budget = (opts && opts.budget) || budgetFor(box);
    if (plan.kind === 'orbit') return orbit(ctx, plan, box, budget);
    if (plan.kind === 'centroids') return centroids(ctx, plan, box, budget);
    if (plan.kind === 'numberline') return numberline(ctx, plan, box, budget);
    if (plan.kind === 'fitline') return fitline(ctx, plan, box, budget);
    if (plan.kind === 'piles') return piles(ctx, plan, box, budget);
    if (plan.kind === 'loss') return loss(ctx, plan, box, budget);
    // An unknown kind draws NOTHING. A brain may declare a plan this renderer has not learned
    // yet (the kit is open, §6.1) — silence beats guessing at someone else's picture.
  }

  /**
   * The dashed ring shared by every polar picture (orbit + centroids) — the gate between "kept"
   * and "did not". Extracted so centroids() reuses it rather than restating it (task-4 brief).
   */
  function ring(ctx, cx, cy, r) {
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(126,240,194,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, Math.max(2, r), 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  /**
   * The query dot at the centre of every polar picture (orbit + centroids) — the thing being
   * asked about. Extracted so centroids() reuses it rather than restating it (task-4 brief).
   */
  function centreDot(ctx, cx, cy, panel) {
    ctx.beginPath(); ctx.arc(cx, cy, panel ? 9 : 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd76a'; ctx.fill();
  }

  /**
   * Screen positions for every point in an ORBIT plan, at a given box/budget — the ONE formula
   * (cx/cy = box centre, rMax, px/py = cx/cy + cos/sin(angle) * r * rMax). `orbit()` below draws
   * from this; brain-panel.js's tap-a-voter hit-test (pointAt) calls it too, so the two can never
   * quietly drift apart the way `logic/floor-layout.js`'s `readerFace()` docstring warns a SECOND
   * copy of the same layout math always eventually does (fix round 1, Finding 5 — brain-panel.js
   * used to keep its own copy of these three lines; that duplication is what this fixes).
   * Pure geometry, no drawing: a non-orbit plan (no exampleId to position meaningfully) or a
   * missing box returns `[]` rather than guessing.
   * @param {object} plan  an ORBIT-kind view plan (logic/brain-view.js orbitPlan())
   * @param {{x:number,y:number,w:number,h:number}} box
   * @param {'face'|'panel'} [budget]
   * @returns {Array<{exampleId:number, label:string, distance:number, voting:boolean, px:number, py:number}>}
   */
  /** Rounded-rect path — label chips behind voter names, so a name stays legible over a dot. */
  function roundRectPath(ctx, x, y, w, h, r) {
    var rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  /**
   * The usable radius of a polar picture in `box`. THE single definition — orbit(), orbitPoints()
   * and centroids() all call it, and logic/floor-layout.js's readerFace test asserts the circle it
   * yields fits inside the arch's drawable panel. Three textually-identical copies lived here
   * before; the arch's beam then got re-proportioned around a number none of them knew about, and
   * the picture spilled over the steelwork at every scale (owner, 2026-08-20: "still overflow").
   * @param {{w:number,h:number}} box  @param {string} budget 'face' | 'panel'
   * @returns {number} radius in px
   */
  function faceRadius(box, budget) {
    if (!box) return 6;
    return Math.max(6, Math.min(box.w, box.h) / 2 - (budget === 'panel' ? 34 : 8));
  }

  function orbitPoints(plan, box, budget) {
    if (!plan || plan.kind !== 'orbit' || !Array.isArray(plan.points) || !box) return [];
    var b = budget || budgetFor(box);
    var cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    var rMax = faceRadius(box, b);
    return plan.points.map(function (p) {
      var r = p.r * rMax;
      var out = {};
      for (var k in p) if (Object.prototype.hasOwnProperty.call(p, k)) out[k] = p[k];
      out.px = cx + Math.cos(p.angle) * r;
      out.py = cy + Math.sin(p.angle) * r;
      return out;
    });
  }

  /** The orbit: query at the centre, examples at true distance, a dashed ring at the k cut. */
  function orbit(ctx, plan, box, budget) {
    var cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    var rMax = faceRadius(box, budget);
    var panel = budget === 'panel';
    var positioned = orbitPoints(plan, box, budget);

    ring(ctx, cx, cy, plan.kCut * rMax);

    // The FACE shows the voters plus a sampled remainder; the PANEL shows every example. Same
    // plan, smaller budget — the reason a face is cheap enough to be always-on. faceSample only
    // ever reads `.voting`, so it works the same over the positioned array as it did over the
    // raw points.
    var pts = panel ? positioned : faceSample(positioned);
    // Non-voters first, voters last, so the examples that DECIDED are never drawn under the ones
    // that did not.
    var order = pts.slice().sort(function (a, b) { return (a.voting ? 1 : 0) - (b.voting ? 1 : 0); });
    for (var i = 0; i < order.length; i++) {
      var p = order[i];
      var px = p.px, py = p.py;
      ctx.beginPath();
      ctx.arc(px, py, p.voting ? (panel ? 7 : 3.5) : (panel ? 4.5 : 2), 0, Math.PI * 2);
      ctx.fillStyle = p.voting ? 'rgba(126,240,194,0.95)' : 'rgba(255,255,255,0.30)';
      ctx.fill();
      // ONLY THE VOTERS ARE NAMED (owner, 2026-08-20: the panel was unreadable). Labelling all 33
      // examples piled the words on top of each other and told the child nothing — the k examples
      // that actually decided are the answer's evidence, and the rest are context. Naming
      // everything is not more honest, it is less legible, and legibility IS the feature here.
    }
    // Near-identical examples legitimately overlap. Move their LABELS, never their measured
    // radii, into separate rows with leaders so a child can still count the voters.
    if(panel) [false,true].forEach(function(right){
      var labels=positioned.filter(function(p){return p.voting&&(p.px>=cx)===right;}).sort(function(a,b){return a.py-b.py;});
      var spacing=Math.min(21,(box.h-24)/Math.max(1,labels.length));
      var last=box.y-20;
      labels.forEach(function(p,i){
        var y=Math.max(last+spacing,box.y+12,Math.min(p.py,box.y+box.h-12-(labels.length-1-i)*spacing));last=y;
        var x=right?box.x+box.w-106:box.x+4;
        ctx.strokeStyle='rgba(126,240,194,0.5)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(p.px,p.py);ctx.lineTo(right?x-3:x+101,y);ctx.stroke();
        var txt=String(p.label);if(txt.length>15)txt=txt.slice(0,14)+'…';
        ctx.fillStyle='rgba(8,12,16,0.9)';roundRectPath(ctx,x,y-9,102,18,4);ctx.fill();
        ctx.font='600 12px ' + FAM();ctx.fillStyle='rgba(190,247,255,0.96)';ctx.fillText(txt,x+4,y+4);
      });
    });

    centreDot(ctx, cx, cy, panel);

  }

  /**
   * The Prototype brain's picture: the SAME polar layout as the orbit (query at the centre,
   * points at their true distance, a dashed ring at the winner's radius), but far fewer points —
   * one per SHELF, not one per example — so they are drawn BIGGER, and the winner (the nearest
   * centroid — the one that decided) is emphasised. At panel budget each dot carries the count of
   * examples it averages, because that numeral is what makes a centroid read as "a type" rather
   * than just another point.
   */
  function centroids(ctx, plan, box, budget) {
    var cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    var rMax = faceRadius(box, budget);
    var panel = budget === 'panel';

    ring(ctx, cx, cy, plan.kCut * rMax);

    for (var i = 0; i < plan.points.length; i++) {
      var p = plan.points[i];
      var r = p.r * rMax;
      var px = cx + Math.cos(p.angle) * r, py = cy + Math.sin(p.angle) * r;
      // Bigger than the orbit's dots at every budget — a centroid stands for a whole shelf.
      var radius = p.voting ? (panel ? 12 : 6.5) : (panel ? 8 : 5);
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fillStyle = p.voting ? 'rgba(126,240,194,0.95)' : 'rgba(255,255,255,0.5)';
      ctx.fill();
      if (panel) {
        ctx.fillStyle = 'rgba(10,14,22,0.9)';
        ctx.font = '600 10px ' + FAM();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(p.count), px, py); // how many examples this prototype averages
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.font = '10px ' + FAM();
        ctx.fillText(String(p.label), px + radius + 4, py + 3);
      }
    }

    centreDot(ctx, cx, cy, panel);

    if (panel && plan.answer) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = '600 14px ' + FAM();
      ctx.fillText(String(plan.answer.label), box.x + 12, box.y + 20);
    }
  }

  /**
   * The Grouper's picture (spec §5.5): the SAME polar layout as centroids (query at the centre,
   * points at their true distance), one dot per PILE it invented — but there is no k-cut ring
   * here, because there is no k to cut: k-means picks exactly one winning pile (nearest-centre),
   * never a top-k vote, so `plan.query.snapTo` (not a per-pile `voting` flag, unlike orbit/
   * centroids) says which dot to emphasise. Panel budget numbers each dot with its member count,
   * same convention as a Prototype's centroid — "how many things did the machine put in here".
   */
  function piles(ctx, plan, box, budget) {
    var cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    var rMax = faceRadius(box, budget);
    var panel = budget === 'panel';
    var snapTo = plan.query && plan.query.snapTo;

    for (var i = 0; i < plan.piles.length; i++) {
      var p = plan.piles[i];
      var r = p.r * rMax;
      var px = cx + Math.cos(p.angle) * r, py = cy + Math.sin(p.angle) * r;
      var winning = p.id === snapTo;
      var radius = winning ? (panel ? 12 : 6.5) : (panel ? 8 : 5);
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fillStyle = winning ? 'rgba(126,240,194,0.95)' : 'rgba(255,255,255,0.5)';
      ctx.fill();
      if (panel) {
        ctx.fillStyle = 'rgba(10,14,22,0.9)';
        ctx.font = '600 10px ' + FAM();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(p.count), px, py); // how many examples landed in this pile
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      }
    }

    centreDot(ctx, cx, cy, panel);

    if (panel && plan.answer) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = '600 14px ' + FAM();
      ctx.fillText(String(plan.answer.label), box.x + 12, box.y + 20);
    }
  }

  /**
   * The Neural brain's picture (spec §5.5: the one brain whose LEARNING is a process worth
   * watching — this is its face, not only a panel extra). A falling line, one point per epoch,
   * straight from `plan.history` — x is epoch ORDER (not a scaled time), y is the loss itself
   * (high near the top, low near the bottom), so "the line falls" is a literal reading of the
   * numbers neural.js measured, drawn at BOTH budgets (fix round 1 precedent: fitline's test
   * marks stay always-on for the same reason — the one picture this task exists to ship must not
   * hide behind the panel-only gate every OTHER kind's text does).
   */
  function loss(ctx, plan, box, budget) {
    var panel = budget === 'panel';
    var pad = panel ? 28 : 14;
    var x0 = box.x + pad, x1 = box.x + box.w - pad;
    var y0 = box.y + box.h - pad, y1 = box.y + pad; // y0 = low loss (bottom), y1 = high loss (top)
    var n = plan.history.length;
    if (!n) return;
    // Final whole-branch review, Important I3: `lo` is CROSS-ENTROPY'S OWN TRUE FLOOR (0), never
    // the curve's own scanned minimum. Auto-scaling y to `[min(history), max(history)]` drew a net
    // that never learned anything (150 epochs stuck at the ln2 coin-flip floor, span 0.0017) as a
    // full box-height fall — "it learned beautifully" over an algorithm that sat at chance the
    // whole time. `hi` stays the scanned max, so a real drop still fills the box; a stalled net
    // now draws flat near the top (high loss) instead.
    var lo = 0, hi = plan.history[0], i;
    for (i = 1; i < n; i++) {
      if (plan.history[i] > hi) hi = plan.history[i];
    }
    var span = hi - lo || 1; // a flat curve (every epoch tied) still gets a line, not a divide-by-zero
    var px = function (idx) { return n > 1 ? x0 + (idx / (n - 1)) * (x1 - x0) : (x0 + x1) / 2; };
    var py = function (v) { return y0 - ((v - lo) / span) * (y0 - y1); };

    ctx.beginPath();
    ctx.moveTo(px(0), py(plan.history[0]));
    for (i = 1; i < n; i++) ctx.lineTo(px(i), py(plan.history[i]));
    ctx.strokeStyle = 'rgba(126,240,194,0.9)';
    ctx.lineWidth = panel ? 2.5 : 2;
    ctx.stroke();

    // the curve's own endpoint — the SAME final loss plan.final carries, marked distinctly (the
    // gold this file reserves for "the number being read right now", same role the orbit/
    // centroids/numberline query markers already play).
    ctx.beginPath();
    ctx.arc(px(n - 1), py(plan.history[n - 1]), panel ? 6 : 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd76a';
    ctx.fill();

    if (panel) {
      // The two connective words ("epochs" / "loss") are ENGLISH, not numbers — plan.epochsWord/
      // plan.lossWord (threaded in by neural.view() from game.js's t(), same mechanism as
      // fitline's baseWord/rsqWord) carry them here so this file never hardcodes UI text; a bare
      // kit user or pure test that skips the opt still gets lossPlan()'s own English fallback.
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = '10px ' + FAM();
      ctx.textAlign = 'left';
      ctx.fillText(String(plan.epochs) + ' ' + plan.epochsWord, x0, box.y + box.h - 4);
      ctx.textAlign = 'right';
      ctx.fillText(plan.lossWord + ' ' + String(plan.final), x1, box.y + box.h - 4);
      ctx.textAlign = 'left';
    }
  }

  /**
   * The Number brain's picture: a horizontal number line from lo to hi, a tick per voting
   * neighbour placed at its `t` and SIZED BY ITS WEIGHT — that is what makes "a weighted average"
   * visible, not just a scatter of numbers — and the predicted answer marked distinctly at
   * `answer.t`. Panel budget adds the numeric labels and the lo/hi end labels; face budget draws
   * no text at all, same budget line every other kind holds.
   */
  function numberline(ctx, plan, box, budget) {
    var panel = budget === 'panel';
    var pad = panel ? 28 : 14;
    var x0 = box.x + pad, x1 = box.x + box.w - pad;
    var y = box.y + box.h / 2;
    var span = Math.max(1, x1 - x0);

    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
    ctx.restore();

    var maxW = 0;
    for (var i = 0; i < plan.neighbours.length; i++) maxW = Math.max(maxW, plan.neighbours[i].weight);
    maxW = maxW || 1;

    for (var j = 0; j < plan.neighbours.length; j++) {
      var n = plan.neighbours[j];
      var nx = x0 + n.t * span;
      // Tick height is proportional to the neighbour's WEIGHT (not a fixed size) — the whole
      // point of drawing it is to make the weighting a child can otherwise only read as a number.
      var h = (panel ? 10 : 5) + (panel ? 16 : 8) * (n.weight / maxW);
      ctx.beginPath();
      ctx.moveTo(nx, y - h / 2); ctx.lineTo(nx, y + h / 2);
      ctx.strokeStyle = 'rgba(126,240,194,0.85)';
      ctx.lineWidth = panel ? 3 : 2;
      ctx.stroke();
      if (panel) {
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = '10px ' + FAM();
        ctx.textAlign = 'center';
        ctx.fillText(String(n.value), nx, y + h / 2 + 12);
        ctx.textAlign = 'left';
      }
    }

    if (plan.answer) {
      var ax = x0 + plan.answer.t * span;
      ctx.beginPath();
      ctx.arc(ax, y, panel ? 8 : 5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd76a';
      ctx.fill();
      if (panel) {
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.font = '600 14px ' + FAM();
        ctx.textAlign = 'center';
        ctx.fillText(String(plan.answer.value), ax, y - 14);
        ctx.textAlign = 'left';
      }
    }

    if (panel) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = '10px ' + FAM();
      ctx.textAlign = 'left';
      ctx.fillText(String(plan.lo), box.x + 4, box.y + box.h - 4);
      ctx.textAlign = 'right';
      ctx.fillText(String(plan.hi), box.x + box.w - 4, box.y + box.h - 4);
      ctx.textAlign = 'left';
    }
  }

  // The Line brain's group colours — literally the SAME hex values as floor-art.js's own hall
  // palette `P` (signal teal · warn amber · lamp light-blue · ok green), copied rather than
  // required in: brain-view-art.js has no OTHER dependency on floor-art.js (which, the other
  // direction, calls INTO this file dynamically via window.WorkshopBrainViewArt, never a static
  // require), and adding one just for four hex strings would be a new coupling this task does not
  // need. "No new hues outside P" (spec §5.5a) is honoured by literal identity, not by import.
  var GROUP_COLORS = ['#5fe3dc', '#e8a13c', '#b6fff8', '#4ad991'];

  // The TEST-OVERLAY mark's colour (owner day-one ask, part 2: "the test set arrives in its own
  // colour"): floor-art.js's own P.kraft — the CRATE colour, not a signal hue (§ above: "no new
  // hues outside P"). Apt, not arbitrary — a test mark literally IS a crate landing on the chart,
  // never a studied dot (GROUP_COLORS) and never the current query (the '#ffd76a' gold every other
  // kind in this file reserves for "the answer being asked about right now").
  var TEST_MARK_COLOR = 'rgba(192,139,69,0.85)';

  /** The test-overlay mark's own shape — a small diamond, deliberately NOT a circle (studied dots
   *  and the query are both circles; a distinct MARK CLASS, not just a colour, is what the brief
   *  asks for). Shared by the marks themselves and the panel legend's swatch. */
  function diamond(ctx, cx, cy, r) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy);
    ctx.closePath();
    ctx.fill();
  }

  // A stick is drawn only past THIS residual — not zero. brains/line.js's solve() adds a tiny
  // (1e-8) diagonal jitter so a near-singular system (one-hot columns that sum to the level
  // constant, see line.js's own comment) always solves; on an otherwise-exact fixture that jitter
  // alone produces residuals around 1e-6-1e-7 — real, but nothing a child could ever see as a
  // stick. 1e-3 sits comfortably above that numerical floor and comfortably below any residual
  // worth drawing (this game's answers are whole-ish numbers of cups, minutes, etc).
  var STICK_EPS = 1e-3;

  /** Two-decimal, whole-when-whole — the same "how a child reads a number" rule line.js's own
   *  fmt() uses, restated here because this file has no dependency on brains/line.js. */
  function fmtTick(n) {
    var r = Math.round(n * 100) / 100;
    return String(Number.isInteger(r) ? r : r.toFixed(2).replace(/0+$/, '').replace(/\.$/, ''));
  }

  /**
   * The data extent a fitline plan actually occupies — EVERY x/y a coordinate will be drawn at:
   * every group's line samples, every point (and the ON-THE-LINE y a stick's far end needs,
   * `p.y - p.resid` — never re-derived from a curve, straight from the honest number the plan
   * already carries), and the query. Box-independent, same as the plan itself; `fitline()` maps
   * this onto `box` at draw time.
   */
  function fitlineExtent(plan) {
    var xs = [], ys = [];
    plan.groups.forEach(function (g) {
      g.line.forEach(function (p) { xs.push(p.x); ys.push(p.yhat); });
      g.points.forEach(function (p) { xs.push(p.x); ys.push(p.y); ys.push(p.y - p.resid); });
    });
    if (plan.query) { xs.push(plan.query.x); ys.push(plan.query.yhat); }
    // TEST MARKS (owner day-one ask, part 2): a guess riding out past every studied row's own
    // range must still fit on the plot — the whole point of showing them is a child watching a
    // prediction land somewhere the training dots never reached.
    if (Array.isArray(plan.testMarks)) plan.testMarks.forEach(function (m) { xs.push(m.x); ys.push(m.yhat); });
    if (!xs.length) return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
    return {
      xMin: Math.min.apply(null, xs), xMax: Math.max.apply(null, xs),
      yMin: Math.min.apply(null, ys), yMax: Math.max.apply(null, ys),
    };
  }

  /**
   * The rule as one line a child can read — the panel-only readout Step 5 calls for. Built
   * straight from `plan.rule` (terms/base/r2 — pure numbers the brain fitted, never anything this
   * file invents), joined with the '·' separator (punctuation, not a word — needs no STRINGS
   * entry, the same way orbit/centroids/numberline join distance/weight numbers with bare spaces).
   *
   * FIX ROUND 1 (reviewer-caught): the two CONNECTIVE ENGLISH WORDS this sentence needs — "base"
   * and "R²" — are not numbers, so drawing them as bare string literals here was the exact STRINGS
   * violation every other kind avoids (they draw pure numbers or child-typed labels, never an
   * English word, so citing their precedent for this was wrong). Fixed the same way
   * `axisGuessName` already solves the identical wiring problem: `line.js`'s view() receives
   * `opts.baseWord`/`opts.rsqWord` — translated via t() by game.js's viewPlan/panelPlanFor, the
   * only two places that actually have a `t()` in scope — and carries them on `plan.rule` itself
   * (`rule.baseWord`/`rule.rsqWord`), so this file never needs a t() of its own. The `|| 'base'` /
   * `|| 'R²'` fallbacks below are for a caller that skips that opt (a bare kit user, a pure test),
   * not a second, competing source of English text.
   *
   * The fuller, bump-grouped sentence a child sees on the sense's own "rule" card (game.js's
   * ruleText()) stays that card's job; this is the picture's own honest, mechanical echo of the
   * same numbers.
   */
  function ruleSentence(rule) {
    if (!rule || !Array.isArray(rule.terms)) return '';
    var baseWord = rule.baseWord || 'base';
    var rsqWord = rule.rsqWord || 'R²';
    var parts = rule.terms
      .filter(function (t) { return Math.abs(t.weight) >= 0.005; })
      .sort(function (a, b) { return Math.abs(b.weight) - Math.abs(a.weight); })
      .slice(0, 3)
      .map(function (t) { return (t.weight >= 0 ? '+' : '') + fmtTick(t.weight) + ' ' + t.name; });
    parts.push(baseWord + ' ' + fmtTick(rule.base));
    parts.push(rsqWord + ' ' + Math.round((rule.r2 || 0) * 100) + '%');
    return parts.join(' · ');
  }

  /**
   * The Line brain's picture (spec §5.5a — replaces the withdrawn `kind: 'scatter'` painter):
   * data points, the best-fit line per group, residual sticks, the query riding its own line.
   *
   * BOX-INDEPENDENT BY CONSTRUCTION, unlike the withdrawn attempt (Finding 1): `line.js`'s plan
   * carries no pixel at all, only real x/y in the child's own units (or the model's own guess).
   * Every coordinate here is computed from the plan's own DATA EXTENT (fitlineExtent, above) and
   * mapped into `box` inside a SINGLE `ctx.translate(box.x, box.y)` — so this is correct for the
   * reader arch's face (a NONZERO offset into a shared canvas, floor-art.js) exactly as it is for
   * brain-panel.js's own panel canvas sitting at (0,0). Removing the translate would draw every
   * primitive box.x/box.y short of where it belongs — the exact class of bug this file's own test
   * suite now pins by recording drawn coordinates and asserting they land INSIDE `box`.
   *
   * A stick is only drawn where the fit actually missed (`Math.abs(resid) >= STICK_EPS`) — a
   * point exactly on its line (or off by only the solver's own numerical jitter) draws no stick,
   * because there is nothing honest to show at length zero.
   */
  function fitline(ctx, plan, box, budget) {
    if (!Array.isArray(plan.groups) || !plan.groups.length) return;
    var panel = budget === 'panel';
    var ext = fitlineExtent(plan);
    var pad = panel ? 30 : 10;
    var x0 = pad, x1 = Math.max(pad + 1, box.w - pad);
    var y0 = Math.max(pad + 1, box.h - pad), y1 = pad; // y flips: canvas y grows downward
    var xspan = Math.max(1e-9, ext.xMax - ext.xMin), yspan = Math.max(1e-9, ext.yMax - ext.yMin);
    var px = function (x) { return x0 + ((x - ext.xMin) / xspan) * (x1 - x0); };
    var py = function (y) { return y0 - ((y - ext.yMin) / yspan) * (y0 - y1); };

    ctx.save();
    ctx.translate(box.x, box.y);

    for (var gi = 0; gi < plan.groups.length; gi++) {
      var g = plan.groups[gi];
      var color = GROUP_COLORS[gi % GROUP_COLORS.length];
      var pi, p;

      // sticks under everything else — one per point that MISSED, never one that landed exactly.
      for (pi = 0; pi < g.points.length; pi++) {
        p = g.points[pi];
        if (Math.abs(p.resid) < STICK_EPS) continue;
        ctx.beginPath();
        ctx.moveTo(px(p.x), py(p.y));
        ctx.lineTo(px(p.x), py(p.y - p.resid)); // the far end sits ON the fitted line, honestly
        ctx.strokeStyle = 'rgba(255,255,255,0.30)';
        ctx.lineWidth = panel ? 1.5 : 1;
        ctx.stroke();
      }

      // the fitted line itself
      ctx.beginPath();
      ctx.moveTo(px(g.line[0].x), py(g.line[0].yhat));
      for (var li = 1; li < g.line.length; li++) ctx.lineTo(px(g.line[li].x), py(g.line[li].yhat));
      ctx.strokeStyle = color;
      ctx.lineWidth = panel ? 2.5 : 2;
      ctx.stroke();

      // the studied points, on top of their own line and its sticks
      for (pi = 0; pi < g.points.length; pi++) {
        p = g.points[pi];
        ctx.beginPath();
        ctx.arc(px(p.x), py(p.y), panel ? 4 : 2.5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }

      if (panel) {
        ctx.fillStyle = color;
        ctx.font = '600 11px ' + FAM();
        ctx.fillText(g.name, px(g.line[g.line.length - 1].x) + 6, py(g.line[g.line.length - 1].yhat) + 4);
      }
    }

    // TEST MARKS (owner day-one ask, part 2): the reader's own GUESSES on crates it was never fed
    // the truth for — never a studied dot, never the query ring (connection law: no truth/residual
    // here, the Checker's face keeps that picture) — a small kraft DIAMOND, distinct in colour AND
    // shape from every other mark this picture draws. Drawn under the query (a live crate's own
    // ring stays the most prominent thing on the plate) but over the fitted lines, at BOTH budgets
    // — this is the whole deliverable, so it stays visible on the always-on face, not panel-only.
    if (Array.isArray(plan.testMarks) && plan.testMarks.length) {
      ctx.fillStyle = TEST_MARK_COLOR;
      var tSize = panel ? 4 : 2.5;
      for (var ti = 0; ti < plan.testMarks.length; ti++) {
        var tm = plan.testMarks[ti];
        diamond(ctx, px(tm.x), py(tm.yhat), tSize);
      }
    }

    // the query — a ring + fill distinct from every studied point, sitting exactly at the number
    // the brain answered (line.js's honesty pin: query.yhat is PARSED from ans.label, never a
    // separate computation this file could disagree with).
    if (plan.query) {
      var qx = px(plan.query.x), qy = py(plan.query.yhat);
      ctx.beginPath();
      ctx.arc(qx, qy, panel ? 9 : 5, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffd76a';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(qx, qy, panel ? 5 : 3, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd76a';
      ctx.fill();
    }

    if (panel) {
      // the axis name, in the child's own units — no ticks/labels at face budget (same "the face
      // has no room for text" rule every other kind here holds).
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = '10px ' + FAM();
      ctx.textAlign = 'left';
      ctx.fillText(plan.axis.name + (plan.axis.unit ? ' (' + plan.axis.unit + ')' : ''), x0, box.h - 4);
      ctx.fillText(fmtTick(ext.xMin), x0, y0 + 14);
      ctx.textAlign = 'right';
      ctx.fillText(fmtTick(ext.xMax), x1, y0 + 14);
      ctx.textAlign = 'left';

      // the rule sentence — what the picture is a picture OF.
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.font = '600 12px ' + FAM();
      ctx.fillText(ruleSentence(plan.rule), x0, 14);

      // the test-overlay LEGEND — a tiny swatch + word naming the diamonds, panel-only (same "no
      // text at face budget" rule the axis labels above hold). Top-right corner: the rule sentence
      // already owns the top-left, and the axis min/max own the bottom row.
      if (Array.isArray(plan.testMarks) && plan.testMarks.length && plan.testMarksWord) {
        var swx = x1 - 4, swy = 10;
        ctx.fillStyle = TEST_MARK_COLOR;
        diamond(ctx, swx, swy, 4);
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.font = '10px ' + FAM();
        ctx.textAlign = 'right';
        ctx.fillText(plan.testMarksWord, swx - 8, swy + 4);
        ctx.textAlign = 'left';
      }
    }

    ctx.restore();
  }

  /**
   * The face's sample: every voter, plus a thin, DETERMINISTIC slice of the rest so the ring
   * still reads as a cloud. Deterministic because a face that reshuffled each frame would be
   * unreadable — and because logic/ may not use rng anyway.
   *
   * The invariant this exists to hold: whenever there is at least one non-voter to drop, the
   * face drops at least one — it never shows ALL of them, however few there are. (Coordinator
   * review round 2: a fixed minimum stride of 2 still included a lone leftover non-voter
   * whenever `others.length === 1`, because the loop always starts at j=0 — the "at most 8,
   * never all" guarantee had a hole at exactly that count, and `k` values in this game are
   * small enough that a shelf holding exactly k+1 examples is a plausible machine, not a
   * corner case.) `target` is capped at 8 for a large plan and is always < others.length for
   * any others.length >= 1 (floor(n/2) < n), so the sampled count — bounded by target via the
   * step below — can never equal the full remainder.
   */
  function faceSample(points) {
    var out = [], others = [];
    for (var i = 0; i < points.length; i++) (points[i].voting ? out : others).push(points[i]);
    var target = Math.min(8, Math.floor(others.length / 2));
    if (target > 0) {
      var step = Math.max(1, Math.ceil(others.length / target));
      for (var j = 0; j < others.length; j += step) out.push(others[j]);
    }
    return out;
  }

  var WorkshopBrainViewArt = { draw: draw, budgetFor: budgetFor, faceSample: faceSample, orbitPoints: orbitPoints, faceRadius: faceRadius };
  if (typeof module !== 'undefined' && module.exports) module.exports = WorkshopBrainViewArt;
  if (typeof window !== 'undefined') window.WorkshopBrainViewArt = WorkshopBrainViewArt;
})();
