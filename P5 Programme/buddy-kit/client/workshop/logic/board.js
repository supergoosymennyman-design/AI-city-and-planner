'use strict';
/**
 * board.js — the BOARD'S pure half: a machine fingerprint, an archive that never deletes, and
 * one chart plan shared by both renderers (the floor's mini face and the panel's zoom).
 *
 * WHY THIS EXISTS: spec §4 (2026-08-31-investigation-lab-design.md) breaks "Run is a fresh
 * experiment" on purpose — the Board must remember ACROSS runs while the learner resets every
 * whistle. §11 draws the line for what "remembering" means, verbatim: "Turning dials keeps the
 * chart: that is the experiment. Changing the dataset, or rewiring the machine, starts a fresh
 * chart, because a curve built from two different setups is a lie a child cannot spot. The
 * superseded chart is KEPT and labelled, never silently deleted." This module IS that line, made
 * testable: `fingerprint` decides same-machine-or-not, `commit` is the archive-never-delete
 * mechanics, `plan` turns committed points into pixels for both places a chart is drawn.
 *
 * Determinism: pure functions of their arguments. No Math.random, no Date.now.
 * Globals: window.WorkshopBoard. CommonJS-exported for node --test.
 */

const WorkshopChart = (typeof require === 'function') ? require('./chart.js') : window.WorkshopChart;

/**
 * The piece's chart storage is keyed by WHAT is being watched, not by anything else — so
 * turning the picker to a different dial starts a different picture (spec §3: "One chart per
 * dial — changing a different knob starts a different picture").
 * @param {{block:string,dial:string}|null} watching
 * @returns {string|null} `'block:dial'`, or null when nothing (or only half) is watched.
 */
function chartKey(watching) {
  return (watching && watching.block && watching.dial) ? (watching.block + ':' + watching.dial) : null;
}

/**
 * A stable signature for "the same experiment" — the MACHINE and the DATA feeding it, never the
 * dials or the furniture. §11's sentence is the whole law: turning a dial IS the experiment (the
 * chart survives it); rewiring, or swapping the dataset or the brain, STARTS a different one (the
 * old chart is superseded — archived by `commit`, never erased).
 *
 * EXCLUDED on purpose: dial VALUES (the x-axis this fingerprint exists to protect — hashing them
 * would invalidate the chart on the very gesture §11 says must not); x/y positions and display
 * names (moving furniture around the room is not a different machine).
 *
 * @param {{pieces:Array<object>, wires:Array<{from,to}>, snaps:Array<{from,to}>}} table
 *   the host's table shape (state.table).
 * @returns {string} stable and order-independent — everything is sorted before joining, so a
 *   shuffled `pieces` array (or wire/snap list) produces the identical string.
 */
function fingerprint(table) {
  const t = table || {};
  const pieces = (t.pieces || []).map((p) => {
    // The only "how much data" signal that belongs in a MACHINE fingerprint is shape, not
    // content: how many rows a Files/Feeder piece is currently holding. Reading it from
    // whichever field the piece actually carries (items for a fed piece, parsed.rows for an
    // imported table) — absent on a piece that never held any is an empty string, same as
    // every other absent field below, so "no field" and "field present but zero" stay distinct.
    const rows = Array.isArray(p.items) ? p.items.length
      : (p.parsed && Array.isArray(p.parsed.rows)) ? p.parsed.rows.length : '';
    return [p.id, p.type, p.brainId || '', p.senseId || '', p.dataset || '', p.fileName || '', p.mode || '', rows].join(':');
  }).sort();
  const wires = (t.wires || []).map((w) => {
    const f = w.from || {}, to = w.to || {};
    return f.block + ':' + f.port + '>' + to.block + ':' + to.port;
  }).sort();
  const snaps = (t.snaps || []).map((s) => {
    const f = s.from || {}, to = s.to || {};
    return f.piece + ':' + f.end + '>' + to.piece + ':' + to.end;
  }).sort();
  return 'P[' + pieces.join('|') + ']W[' + wires.join('|') + ']S[' + snaps.join('|') + ']';
}

/**
 * Merges THIS run's plottable points into the piece's committed chart(s), first archiving every
 * chart the current fingerprint has superseded — not just the one(s) this commit touches, because
 * a machine/data change invalidates every dial's curve at once (§11). Mutates `piece`; the host
 * owns persistence (state.tallies / save-load), this function only knows the shape.
 *
 * FIX ROUND 1 — the mixed-chart honesty bug (spec §3, confirmed by driving a real run): points
 * are grouped by EACH POINT'S OWN `chartKey(pt.watch)`, never by `view.watching` (the board's
 * pick AT STOP TIME). A child who switches the panel's picker mid-run, with no Stop in between,
 * produces a run whose points span two different watched dials — the old single-key design filed
 * every one of them under whichever dial happened to be watched when Stop was finally pressed,
 * silently relabelling every earlier point's x as if it had come from a dial it never touched. A
 * fresh `p.charts[key]` this function creates takes its `watching` METADATA from that group's own
 * key too (never `view.watching`) — otherwise an archived/committed chart's own label would still
 * lie about which dial it holds, one layer up from the point-mixing bug just described.
 *
 * A point with NO `.watch` field at all (data committed before this fix existed, or loaded from
 * an old save) is left OUT of every group — it is not retroactively re-split or reassigned; it
 * simply stays wherever it already landed. Never crashes, never drops a pre-existing chart's own
 * points because a NEW commit's points happen to lack `.watch`.
 *
 * @param {object} piece  the Board piece (a state.table.pieces entry) — gains/keeps `.charts`
 *   (an object keyed by `chartKey`, each `{fp, watching, points}`) and `.chartArchive` (an
 *   append-only array of `{key, watching, points, fp, label}`).
 * @param {{watching:{block:string,dial:string}|null, points:Array<{seq,pile,x,y,n,watch:({block,dial}|null)}>}} view
 *   `WorkshopEngine.boardView`'s return for this run. `view.watching` is read only by the HOST
 *   (the panel's live picture, the caption) — this function never reads it; every filing decision
 *   comes from each point's own `.watch`.
 * @param {string} fp  `fingerprint(table)` for THIS run's machine — one value for every group;
 *   §11 fingerprints the MACHINE, not any one dial, so a run spanning two watched dials still has
 *   exactly one fingerprint.
 * @param {string} archiveLabel  the label stamped on any chart archived by this commit.
 * @returns {{archived:boolean, added:number}} whether anything was archived this call, and how
 *   many of this run's points actually landed across every group — x===null (R6, a stale/missing
 *   watch target), n<=0 (an act nothing scored), or no `.watch` at all (unattributable) are
 *   skipped, so `added` only ever counts a real, filed point.
 */
function commit(piece, view, fp, archiveLabel) {
  const p = piece || {};
  const v = view || {};
  const points = v.points || [];

  const groups = new Map(); // chartKey -> { watching:{block,dial}, points:[] }
  for (const pt of points) {
    if (pt.x === null || pt.x === undefined || !(pt.n > 0)) continue;
    const key = chartKey(pt.watch);
    if (!key) continue; // no per-point watch to attribute this one to — Hole 2, left untouched
    if (!groups.has(key)) groups.set(key, { watching: pt.watch, points: [] });
    groups.get(key).points.push({ seq: pt.seq, pile: pt.pile, x: pt.x, y: pt.y, n: pt.n });
  }

  // FINAL FIX ROUND, finding 3a — spec §11's boundary must hold even on a Stop that files NO new
  // points: the archive sweep now runs BEFORE the "nothing to commit" early return, so a rewire
  // followed by Run/Stop with nothing tested yet still archives the stale chart(s) THAT STOP —
  // not several Stops later, whenever a commit finally happens to also carry a point. Guarded on
  // `p.charts` already existing: a genuinely fresh piece (never committed to) has nothing to
  // archive, so it is left exactly as it was (`undefined`) rather than seeded with empty storage
  // on a true no-op — the SAME "no init on a real no-op" law the original single-branch version
  // kept.
  let archived = false;
  if (p.charts) {
    if (!p.chartArchive) p.chartArchive = [];
    // Archive-then-delete EVERY stale chart that actually holds points — "KEPT and labelled,
    // never silently deleted" (§11) applies to every dial's history, not only the one(s) this
    // commit is about to grow. A stale chart with zero points has nothing worth keeping, so it is
    // simply replaced below.
    Object.keys(p.charts).forEach((k) => {
      const c = p.charts[k];
      if (c && c.fp !== fp && c.points && c.points.length) {
        p.chartArchive.push({ key: k, watching: c.watching, points: c.points, fp: c.fp, label: archiveLabel });
        delete p.charts[k];
        archived = true;
      }
    });
  }

  if (!groups.size) return { archived, added: 0 };

  if (!p.charts) p.charts = {};
  if (!p.chartArchive) p.chartArchive = [];

  let added = 0;
  groups.forEach((group, key) => {
    let chart = p.charts[key];
    // Three cases land here: the key never existed; it just got archived above; or it existed
    // with a stale fp but zero points (nothing to archive). All three mean "start fresh, stamped
    // with the CURRENT fp and THIS GROUP'S OWN watching" (Hole 1 — never `v.watching`). A chart
    // already at the current fp falls through and keeps growing — that is how "Run again, act,
    // Stop" accumulates points across runs (§4's stated exception).
    if (!chart || chart.fp !== fp) chart = p.charts[key] = { fp, watching: group.watching, points: [] };
    for (const pt of group.points) { chart.points.push(pt); added += 1; }
  });
  return { archived, added };
}

/**
 * Geometry for ONE chart, shared by the floor's mini face and the panel's big one — the same
 * plan drawn at two sizes. `points` is a flat list (typically a committed chart's `.points`,
 * plus the live run's `boardView().points` appended by the caller — merging is the host's job).
 *
 * @param {Array<{x:(number|null),y:number,pile:string,n:number}>} points
 *   pile `'training'` -> the studied series; `'validation'` -> the fresh (held-out) series; any
 *   other pile value is ignored (R1: the exam pile never reaches the Board's watch port — but a
 *   stray value here degrades to "ignored", never a crash). `x` MAY be `null` — R6's own shape
 *   for a stale/missing watch target (engine.js's `dial()` returns null when `watchBlock`/
 *   `watchDial` no longer resolves to a real dial) — and every such row is dropped, never plotted
 *   (fix round 1, breaker finding: `Math.min`/`Math.max` coerce a bare `null` to `0`, so without
 *   this guard a stale watch fabricated a real-looking dot sitting at x=0 — data the child never
 *   produced, on a picture whose whole claim is that every dot is a real test).
 * @param {{w:number,h:number,pad:{l:number,r:number,t:number,b:number}}} [o]
 *   `pad` defaults exactly like `logic/chart.js`'s `scatterPlan`.
 * @returns {{box:object, xTicks:Array<{x:number,px:number}>, yTicks:Array<{y:number,py:number}>,
 *   series:{studied:{dots:Array<{px:number,py:number,n:number}>,line:Array<{px:number,py:number}>},
 *   fresh:{dots:Array,line:Array}}, empty:boolean}}
 */
function plan(points, o) {
  const opt = o || {};
  const pad = opt.pad || { l: 44, r: 12, t: 12, b: 28 };
  const W = Math.max(80, opt.w || 320), H = Math.max(70, opt.h || 200);
  const box = { x: pad.l, y: pad.t, w: Math.max(10, W - pad.l - pad.r), h: Math.max(10, H - pad.t - pad.b) };
  const emptyPlan = () => ({ box, xTicks: [], yTicks: [], series: { studied: { dots: [], line: [] }, fresh: { dots: [], line: [] } }, empty: true });

  const studiedPts = [], freshPts = [];
  for (const pt of (points || [])) {
    // R6: a stale/missing watch scores x:null — unplottable by definition, and MUST be dropped
    // here (the pure layer), not merely upstream, or `Math.min.apply(null, [null, 1, 2])` (===0)
    // silently paints a fabricated dot no test ever produced.
    if (pt.x === null || pt.x === undefined || !Number.isFinite(pt.x)) continue;
    if (pt.pile === 'training') studiedPts.push(pt);
    else if (pt.pile === 'validation') freshPts.push(pt);
    // else: an unrecognised pile is dropped silently — plan() degrades, it never throws.
  }
  const all = studiedPts.concat(freshPts);
  if (!all.length) return emptyPlan();

  const xs = all.map((pt) => pt.x), ys = all.map((pt) => pt.y);
  let x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
  // Only one dial value tested so far still needs width, or the one dot sits on a zero-width
  // axis — same breathing-room idiom as chart.js's scatterPlan.
  if (!(x1 > x0)) { x1 = x0 + 1; x0 -= 1; }
  const padX = (x1 - x0) * 0.06;
  x0 -= padX; x1 += padX;

  // y-domain 0..max*1.15, floor at 0 ("how far off" is never negative) — with a minimum span so
  // an all-zero-error series (every guess exactly right so far) still has an axis to draw on
  // instead of collapsing max===0 into a zero-height domain.
  const yMax = Math.max.apply(null, ys);
  const y0 = 0;
  let y1 = yMax * 1.15;
  if (!(y1 > y0)) y1 = 1;

  const xOf = (x) => box.x + ((x - x0) / (x1 - x0)) * box.w;
  const yOf = (y) => box.y + box.h - ((y - y0) / (y1 - y0)) * box.h;

  /** One series' dots (every point, honestly — even repeats) + its per-x-mean line. */
  function seriesPlan(pts) {
    const dots = pts.map((pt) => ({ px: xOf(pt.x), py: yOf(pt.y), n: pt.n }));
    // The line is a per-x MEAN, not raw connect-the-dots: a child who tests the same dial value
    // twice gets two dots (both kept — the chart never hides a real attempt) but the curve
    // reads as one place at that x, or a repeat press saw-tooths the very U-shape the Lab
    // exists to show. A line only draws with >=2 distinct x — one x is a dot, not a curve.
    const byX = new Map();
    for (const pt of pts) {
      const g = byX.get(pt.x) || { sum: 0, n: 0 };
      g.sum += pt.y; g.n += 1;
      byX.set(pt.x, g);
    }
    const xsDistinct = Array.from(byX.keys()).sort((a, b) => a - b);
    const line = xsDistinct.length >= 2
      ? xsDistinct.map((x) => ({ px: xOf(x), py: yOf(byX.get(x).sum / byX.get(x).n) }))
      : [];
    return { dots, line };
  }

  return {
    box, empty: false,
    xTicks: WorkshopChart.ticks(x0, x1, 4).map((t) => ({ x: t.v, px: xOf(t.v) })),
    yTicks: WorkshopChart.ticks(y0, y1, 4).map((t) => ({ y: t.v, py: yOf(t.v) })),
    series: { studied: seriesPlan(studiedPts), fresh: seriesPlan(freshPts) },
  };
}

const WorkshopBoard = { chartKey, fingerprint, commit, plan };
if (typeof module !== 'undefined' && module.exports) module.exports = WorkshopBoard;
if (typeof window !== 'undefined') window.WorkshopBoard = WorkshopBoard;
