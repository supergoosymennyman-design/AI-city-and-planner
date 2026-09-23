'use strict';
/**
 * board-panel.js — THE ZOOM (spec 2026-08-31-investigation-lab-design.md §4; Plan 3 task 5).
 * Tapping a Board on the Floor (floor.js's tap router, mirroring brain-panel.js's own reader-face
 * routing) opens it full screen: "chart large, dials down the side so the child can turn and
 * re-run without hunting the room, log underneath" (spec §4's own sentence — binding).
 *
 * NOT A VIEW MODE (same law brain-panel.js states): it opens OVER the Floor, into the same host
 * `WorkshopFloor.mount` already owns, and closes back to live.
 *
 * NEVER reaches into game.js. Ruling R (carried over from brain-panel.js/task-7): every fact this
 * file needs — the merged committed+live points, the watched dial and its live value, the picker's
 * options, the room's act Buttons, the archive list, whether a run is up — arrives as `deps`,
 * closures floor.js's own `openBoardPanel` assembles over its bridge + its `lastLive` cache. That
 * keeps this file requireable with no DOM and honest about never having peeked at game.js.
 *
 * THE ONE WAY THIS DIFFERS FROM THE MODEL'S LAB: that screen freezes ONE decision on purpose
 * (Ruling P) — a query vector that must never drift while the belt keeps moving. The Board's
 * picture is the opposite kind of honest: it is memory ACROSS runs (spec §4/§11), so it must stay
 * LIVE the whole time this panel is open — a still-scoring act's point has to visibly climb, the
 * watched dial has to visibly move when turned, and a fresh archive has to appear the moment a
 * Stop creates one. There is no frozen state to reduce here, only a small view toggle (live vs. a
 * past archive, read-only) — so instead of brain-panel's pure `reduce`, this file runs a light
 * `requestAnimationFrame` loop for as long as it is open, re-reading every dep function each
 * frame (mirroring floor.js's own "the floor repaints itself from its own loop" idiom) and
 * touching only the CONTENT of already-built DOM nodes — never recreating the interactive controls
 * (the picker `<select>`, the live dial `<input>`, the act buttons, Close) — so a drag, an open
 * dropdown, or a finger mid-press on a Button is never interrupted by the next tick.
 */
(function () {
  /**
   * Per-dial slider bounds for the small, well-known set of dials this Lab actually turns (the
   * bias/variance knobs the spec names by name: Polynomial degree, Regularisation/penalty, k,
   * the Splitter's own shares — spec's "What we already own" section) plus a couple of other
   * common dials. NOT a universal law — this workshop has no generic min/max metadata for an
   * arbitrary dial (grep confirms: the plate's own number widget is a plain unranged
   * `<input type="number">`, see game.js's widgetControl) — so a prop outside this table falls
   * back to an ADAPTIVE range in rangeFor() below, built from the value actually on screen, which
   * can never clamp the current reading out of its own slider.
   */
  var RANGE_HINTS = {
    k: { min: 1, max: 30, step: 1 },
    degree: { min: 1, max: 3, step: 1 },
    // 0..1 (final fix round, finding 6): matches logic/engine.js's own clampDial('penalty') —
    // "Math.max(0, Math.min(1, value))" — the bound a WIRE write actually enforces. The old 0..2
    // advertised a range no wire could ever set the dial to.
    penalty: { min: 0, max: 1, step: 0.05 },
    sure: { min: 0, max: 1, step: 0.05 },
    training: { min: 0, max: 100, step: 1 },
    validation: { min: 0, max: 100, step: 1 },
    tolerance: { min: 0, max: 20, step: 0.5 },
  };

  /**
   * @param {string} prop  a dial's own prop name (e.g. 'degree', 'rate')
   * @param {number} current  the dial's CURRENT value — the fallback range always contains it
   * @returns {{min:number, max:number, step:number}}
   */
  function rangeFor(prop, current) {
    var hint = RANGE_HINTS[prop];
    if (hint) return hint;
    var v = Number.isFinite(Number(current)) ? Number(current) : 0;
    var span = Math.max(10, Math.abs(v) * 2);
    return { min: Math.min(0, v - span), max: Math.max(v + span, span), step: 'any' };
  }

  /**
   * Task 4's own residue (report: "the per-dot crate-count labels are new surface area... could
   * crowd" on the small floor face): the geometry (`WorkshopBoard.plan`) is SHARED between the
   * floor's mini face and this big panel — legibility is therefore a DRAW-layer decision, made
   * separately by each renderer, never a change to the shared geometry itself. The panel's canvas
   * is far bigger than the floor's 176×118 face, so its threshold is generous, but a child who
   * tests the same dial many times over a session still needs a readable picture, not a wall of
   * overlapping digits.
   * @param {number} totalDots  studied + fresh dot count
   * @returns {boolean} whether per-dot crate-count labels stay legible at this density
   */
  function labelsFit(totalDots) { return totalDots <= 24; }

  /** Pure 2dp rounding, trailing zeros trimmed — mirrors game.js's own `fmtNum` (a trivial,
   *  stateless formatting rule; kept local rather than threaded through `deps` since duplicating
   *  three lines of pure math carries none of the drift risk the dial-picker's OWN option list
   *  does — see boardWatchOptions' doc in game.js for the rule this is NOT). */
  function fmtNum(n) {
    var v = Number(n);
    if (!Number.isFinite(v)) return '';
    var r = Math.round(v * 100) / 100;
    return String(Number.isInteger(r) ? r : r.toFixed(2).replace(/0+$/, '').replace(/\.$/, ''));
  }

  /** The Evaluator's own inks (floor-art.js's P.signal/P.warn) — "the SAME words name the same
   *  populations everywhere, not just the same colours" (Task 4's report). Read defensively: a
   *  page that somehow loaded this file without floor-art.js still draws SOMETHING, in the right
   *  ballpark, rather than throwing. */
  function boardInk() {
    var P = (typeof window !== 'undefined' && window.WorkshopFloorArt && window.WorkshopFloorArt.P) || {};
    return { signal: P.signal || '#5fe3dc', warn: P.warn || '#e8a13c' };
  }

  // ---------------------------------------------------------------------------------------------
  // The DOM shell. Everything below touches `document`/`window` and is exercised only by the
  // browser suite (tests/board-panel-browser.test.js) — node --test only ever requires the pure
  // helpers above off the module.exports guard at the bottom.
  // ---------------------------------------------------------------------------------------------
  var root = null;          // the overlay's own DOM root, appended into the host open() was given
  var boardId = null;       // which Board piece this panel is showing
  var panelDeps = null;     // Ruling R's deps
  var viewingEntry = null;  // null = live; else a `deps.archives()` entry — read-only, "a way back"
  var lastWatching = null;  // the most recent watching() read — the slider handler's own target
  var raf = null;           // the live-refresh loop's rAF handle
  var previousFocus = null; // what had focus before open() — restored on close()
  var archivesCount = -1;   // last-rendered archives().length — the archive list only rebuilds on a real change

  var closeBtn = null, openPlateBtn = null, canvasEl = null, canvasWrap = null, captionEl = null, archiveBand = null, archiveBandText = null, backBtn = null;
  var pickerSel = null, sliderRow = null, sliderLabelText = null, sliderIn = null;
  var actsListEl = null, noActsEl = null, actButtonEls = [];
  var logListEl = null, noLogEl = null;
  var archivesBox = null, archivesListEl = null;

  /** Call a deps function defensively; any throw, or a non-function dep, is an honest fallback
   *  (crash-proof I/O law — a broken/missing dep must never take the panel down with it). */
  function safeCall(fn, a, b, c) {
    if (typeof fn !== 'function') return null;
    try { return fn(a, b, c); } catch (e) { return null; }
  }
  function tOf(key, vars) {
    try { return panelDeps && typeof panelDeps.t === 'function' ? panelDeps.t(key, vars) : key; }
    catch (e) { return key; }
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }

  /**
   * Match the canvas's backing store to `canvasWrap`'s own box.
   *
   * FIX ROUND 1, CRITICAL — the unbounded canvas-resize feedback loop (found by the reviewer
   * while checking "nothing below the fold at 1024×768"; measured canvas.height climbing
   * 896 -> 2036 -> 3356 -> 4863px over 3.5s). ROOT CAUSE: `.bpcanvas` used to be styled
   * `height:100%` directly inside `.bpchart`, which had NO definite CSS height of its own
   * (`display:flex;flex-direction:column`, sized by its CONTENT). A percentage height against an
   * indefinite ancestor resolves to `auto` — and for a `<canvas>` (a replaced element), an `auto`
   * CSS height falls back to its own ATTRIBUTE height. So `.bpchart`'s measured `clientHeight` was
   * itself driven by whatever `canvasEl.height` happened to be — every rAF tick's fitCanvas() read
   * a value ONE tick's own write had just produced, then wrote something slightly LARGER (the real
   * padding/gap/caption together always exceeded the constants this function used to guess), for
   * as long as the panel stayed open (its whole designed lifetime).
   *
   * THE FIX: `canvasWrap` (a dedicated wrapper div, `position:relative`, CSS `flex:1 1 auto` +
   * `min-height:0` inside `.bpchart`, which itself now gets a DEFINITE height by stretching to
   * fill `.bpbody`'s own flex-row cross-axis) holds ONLY the absolutely-positioned canvas
   * (`.bpcanvas{position:absolute;inset:0}`) — an absolutely-positioned element is taken OUT of
   * normal flow and can NEVER contribute to its containing block's own auto-sizing, by definition.
   * `canvasWrap.clientWidth/clientHeight` are therefore CSS-flex-computed values with ZERO
   * dependency on `canvasEl.width/height`, for any content whatsoever inside it — the loop cannot
   * exist structurally, not merely "usually converges". No more guessed padding constants either:
   * `canvasWrap` has no padding of its own, so its clientWidth/clientHeight ARE the available box.
   */
  function fitCanvas() {
    if (!canvasEl || !canvasWrap) return;
    var w = Math.max(240, Math.floor(canvasWrap.clientWidth));
    var h = Math.max(180, Math.floor(canvasWrap.clientHeight));
    if (canvasEl.width !== w) canvasEl.width = w;
    if (canvasEl.height !== h) canvasEl.height = h;
  }

  /**
   * Paint the chart: axes/ticks, both series' dots + per-x mean lines, in the Evaluator's own
   * inks (studied teal, fresh amber — the SAME meaning as the floor face and the Tally). Honest
   * about having nothing to draw: a null/empty plan simply clears the canvas — the CAPTION beside
   * it (update(), below) is what says WHY, in the same words the floor face already uses.
   */
  function drawChart(ctx, w, h, plan) {
    ctx.clearRect(0, 0, w, h);
    if (!plan || plan.empty) return;
    var P = boardInk();
    ctx.strokeStyle = 'rgba(185,203,219,0.35)'; ctx.lineWidth = 1;
    ctx.strokeRect(plan.box.x + 0.5, plan.box.y + 0.5, plan.box.w, plan.box.h);

    ctx.fillStyle = 'rgba(226,232,238,0.6)'; ctx.font = '11px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (var i = 0; i < plan.xTicks.length; i++) {
      var xt = plan.xTicks[i];
      ctx.fillText(fmtNum(xt.x), xt.px, plan.box.y + plan.box.h + 6);
    }
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (var j = 0; j < plan.yTicks.length; j++) {
      var yt = plan.yTicks[j];
      ctx.fillText(fmtNum(yt.y), plan.box.x - 6, yt.py);
    }

    var totalDots = plan.series.studied.dots.length + plan.series.fresh.dots.length;
    var showLabels = labelsFit(totalDots);
    var seriesList = [{ s: plan.series.studied, ink: P.signal }, { s: plan.series.fresh, ink: P.warn }];
    for (var s2 = 0; s2 < seriesList.length; s2++) {
      var entry = seriesList[s2], series = entry.s, ink = entry.ink;
      if (series.line.length > 1) {
        ctx.strokeStyle = ink; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(series.line[0].px, series.line[0].py);
        for (var k = 1; k < series.line.length; k++) ctx.lineTo(series.line[k].px, series.line[k].py);
        ctx.stroke();
      }
      for (var d = 0; d < series.dots.length; d++) {
        var dot = series.dots[d];
        ctx.beginPath(); ctx.arc(dot.px, dot.py, 5, 0, Math.PI * 2); ctx.fillStyle = ink; ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(11,13,18,0.6)'; ctx.stroke();
        if (showLabels) {
          ctx.fillStyle = ink; ctx.font = '700 10px sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
          ctx.fillText(String(dot.n), dot.px, dot.py - 8);
        }
      }
    }
  }

  function onCanvasResize() { fitCanvas(); }

  function buildShell() {
    root = document.createElement('div');
    root.className = 'boardpanel';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', tOf('board.aria'));
    root.tabIndex = -1;
    root.addEventListener('keydown', onTrapKey);

    var head = el('div', 'bphead');
    head.appendChild(el('h2', 'bptitle', tOf('board.heading')));
    // FIX ROUND 2 (vision-breaker MAJOR — the fingertip): a second, always-easy door to the
    // ordinary plate (Delete/rename/cable) — the header band tap still works too (its own 44px
    // floor, logic/floor-layout.js's boardFace), this is a convenience, never the only route.
    openPlateBtn = el('button', 'bpopenplate', tOf('board.openPlate'));
    openPlateBtn.type = 'button';
    openPlateBtn.setAttribute('aria-label', tOf('board.openPlate'));
    openPlateBtn.addEventListener('click', function () { safeCall(panelDeps.openPlate); });
    head.appendChild(openPlateBtn);
    closeBtn = el('button', 'bpclose', tOf('panel.close'));
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', tOf('panel.close'));
    closeBtn.addEventListener('click', close);
    head.appendChild(closeBtn);
    root.appendChild(head);

    var body = el('div', 'bpbody');
    root.appendChild(body);

    // ---- the chart, large ----
    var chartCol = el('div', 'bpchart');
    body.appendChild(chartCol);
    // Read TOP TO BOTTOM (fix round 1): an archive banner (when viewing one), then the chart
    // itself (canvasWrap: a flex-stretched, definite-height region whose size never depends on
    // the canvas inside it — see fitCanvas()'s own doc), then the caption underneath.
    archiveBand = el('div', 'bparchiveband');
    archiveBand.hidden = true;
    archiveBandText = el('span', '', '');
    archiveBand.appendChild(archiveBandText);
    backBtn = el('button', 'bpback', tOf('board.backToLive'));
    backBtn.type = 'button';
    backBtn.setAttribute('aria-label', tOf('board.backToLive'));
    backBtn.addEventListener('click', function () { viewingEntry = null; update(); });
    archiveBand.appendChild(backBtn);
    chartCol.appendChild(archiveBand);

    canvasWrap = el('div', 'bpcanvaswrap');
    chartCol.appendChild(canvasWrap);
    canvasEl = document.createElement('canvas');
    canvasEl.width = 640; canvasEl.height = 360;
    canvasEl.className = 'bpcanvas';
    canvasWrap.appendChild(canvasEl);

    captionEl = el('div', 'bpcaption', '');
    chartCol.appendChild(captionEl);

    // ---- dials down the side ----
    var side = el('div', 'bpside');
    body.appendChild(side);

    var pickerRow = el('label', 'bppicker');
    pickerRow.appendChild(el('span', '', tOf('board.watch')));
    pickerSel = document.createElement('select');
    pickerSel.className = 'bpselect';
    pickerSel.setAttribute('aria-label', tOf('board.watch'));
    var blank = document.createElement('option'); blank.value = ''; blank.textContent = '—'; pickerSel.appendChild(blank);
    var options = (panelDeps && typeof panelDeps.dials === 'function') ? safeCall(panelDeps.dials) || [] : [];
    for (var oi = 0; oi < options.length; oi++) {
      var d = options[oi];
      var opt = document.createElement('option'); opt.value = d.value; opt.textContent = d.label;
      pickerSel.appendChild(opt);
    }
    pickerSel.addEventListener('change', function () { safeCall(panelDeps.setWatch, pickerSel.value); update(); });
    pickerRow.appendChild(pickerSel);
    side.appendChild(pickerRow);

    sliderRow = el('div', 'bpslider');
    sliderRow.hidden = true;
    var sliderLabel = el('span', 'bpsliderlabel');
    sliderLabelText = document.createTextNode('');
    sliderLabel.appendChild(sliderLabelText);
    sliderRow.appendChild(sliderLabel);
    sliderIn = document.createElement('input');
    sliderIn.type = 'range'; sliderIn.className = 'bpsliderin';
    sliderIn.addEventListener('input', function () {
      if (!lastWatching) return;
      safeCall(panelDeps.setDial, lastWatching.block, lastWatching.dial, Number(sliderIn.value));
    });
    sliderIn.addEventListener('change', function () {
      // task 061: 'input' fires per tick and deliberately skips autosave (the setDial law);
      // 'change' is the gesture end — the ONE commit, exactly like the Splitter bar's release.
      safeCall(panelDeps.dialCommitted);
    });
    sliderRow.appendChild(sliderIn);
    side.appendChild(sliderRow);

    var actsBox = el('div', 'bpacts');
    actsBox.appendChild(el('h3', '', tOf('board.acts')));
    actsListEl = el('div', 'bpactlist');
    actsBox.appendChild(actsListEl);
    noActsEl = el('div', 'hint', tOf('board.noActs'));
    actsBox.appendChild(noActsEl);
    side.appendChild(actsBox);

    actButtonEls = [];
    var buttons = (panelDeps && typeof panelDeps.actButtons === 'function') ? safeCall(panelDeps.actButtons) || [] : [];
    for (var bi = 0; bi < buttons.length; bi++) {
      (function (act) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'bpactbtn'; b.textContent = act.name;
        b.setAttribute('aria-label', act.name);
        b.addEventListener('click', function () { safeCall(panelDeps.press, act.id); });
        actsListEl.appendChild(b);
        actButtonEls.push({ id: act.id, el: b });
      })(buttons[bi]);
    }
    noActsEl.hidden = buttons.length !== 0;

    // ---- the log, underneath ----
    var logBox = el('div', 'bplog');
    logBox.appendChild(el('h3', '', tOf('board.log')));
    logListEl = el('div', 'bplogrows');
    logBox.appendChild(logListEl);
    noLogEl = el('div', 'hint', tOf('board.empty'));
    logBox.appendChild(noLogEl);
    root.appendChild(logBox);

    // ---- the archives, beneath the log ----
    archivesBox = el('div', 'bparchives');
    archivesBox.appendChild(el('h3', '', tOf('board.archives')));
    archivesListEl = el('div', 'bparchivelist');
    archivesBox.appendChild(archivesListEl);
    root.appendChild(archivesBox);
  }

  /** Rebuild the archive-row list — cheap, and only actually called when the COUNT changed
   *  (update(), below), so a finger mid-press on a "View" button is never pulled out from under
   *  it by the routine live-refresh tick; only a genuinely NEW archive (a Stop, while this panel
   *  happens to be open) triggers a rebuild at all. */
  function rebuildArchives(list) {
    archivesListEl.textContent = '';
    for (var i = 0; i < list.length; i++) {
      (function (entry) {
        var row = el('div', 'bparchiverow');
        row.appendChild(el('span', '', tOf('board.archiveRow', { label: entry.label || '', n: (entry.points || []).length })));
        var viewBtn = document.createElement('button');
        viewBtn.type = 'button'; viewBtn.className = 'bpviewbtn'; viewBtn.textContent = tOf('board.viewArchive');
        viewBtn.setAttribute('aria-label', tOf('board.viewArchive') + ' — ' + (entry.label || ''));
        viewBtn.addEventListener('click', function () { viewingEntry = entry; update(); });
        row.appendChild(viewBtn);
        archivesListEl.appendChild(row);
      })(list[i]);
    }
    archivesBox.hidden = list.length === 0;
  }

  /**
   * Mutate the existing shell to match current state. Called once immediately after every
   * discrete action (picker change, View/Back press) AND every rAF tick while the panel is open
   * (the live-refresh loop) — safe to call as often as needed; it never recreates an interactive
   * control's DOM identity, only its content/attributes (brain-panel.js's own "the shell is built
   * once" law, Finding 1).
   */
  function update() {
    if (!root) return;
    fitCanvas();

    var points = viewingEntry ? (viewingEntry.points || []) : (safeCall(panelDeps.pointsFor) || []);
    var watching = viewingEntry ? null : safeCall(panelDeps.watching);
    lastWatching = watching;
    // R6: a still-forming act can carry x:null (a stale/missing watch) — logic/board.js's own
    // plan() drops these before they become a fabricated dot; the caption/log below must agree
    // with the CHART about what counts as "nothing real yet", so this filter runs once, up front,
    // and both readers share it (never committed, so this only ever touches a LIVE run's rows).
    var loggable = points.filter(function (pt) { return pt.x !== null && pt.x !== undefined && Number.isFinite(pt.x); });

    var plan = safeCall(panelDeps.planFor, points, { w: canvasEl.width, h: canvasEl.height });
    var ctx = canvasEl.getContext('2d');
    drawChart(ctx, canvasEl.width, canvasEl.height, plan);

    // THE CAPTION — mirrors floor-art.js's boardBox() cascade EXACTLY (final fix round, finding
    // 1): before this fix the panel only ever knew noWatch/empty, so a relay-fed (or unwired, or
    // label-Evaluator) Board's zoom kept inviting "Test something" — board.empty's own words —
    // while the FLOOR FACE one panel over already said the honest thing. Same states, same order,
    // same vocabulary as the face: unwired -> noWire; wired, nothing watched -> noWatch; watching
    // a non-numeric line -> noNumbers; watching a numeric line, signals arrive but none are a
    // test act -> noAct; watching, genuinely nothing tested yet -> empty; else the dial's word. A
    // read-only archive view names itself instead (board.viewingArchive) — an archive is always a
    // complete, real chart, so none of these states can ever apply to one.
    var wired = viewingEntry ? true : !!safeCall(panelDeps.wired);
    var feedKind = viewingEntry ? null : safeCall(panelDeps.feedKind);
    var heard = viewingEntry ? 0 : (safeCall(panelDeps.heard) || 0);
    var honestKey = null;
    if (viewingEntry) {
      captionEl.textContent = tOf('board.viewingArchive', { label: viewingEntry.label || '' });
    } else if (!wired) {
      honestKey = 'board.noWire'; captionEl.textContent = tOf(honestKey);
    } else if (!watching) {
      honestKey = 'board.noWatch'; captionEl.textContent = tOf(honestKey);
    } else if (feedKind && feedKind !== 'number') {
      honestKey = 'board.noNumbers'; captionEl.textContent = tOf(honestKey);
    } else if (!loggable.length && heard > 0) {
      honestKey = 'board.noAct'; captionEl.textContent = tOf(honestKey);
    } else if (!loggable.length) {
      honestKey = 'board.empty'; captionEl.textContent = tOf(honestKey);
    } else {
      captionEl.textContent = watching.word || '';
    }

    archiveBand.hidden = !viewingEntry;
    if (viewingEntry) archiveBandText.textContent = tOf('board.viewingArchive', { label: viewingEntry.label || '' });

    // THE PICKER — never rebuilds its <option> list after open (the machine cannot be rewired
    // while this full-screen overlay blocks the Floor's own canvas), only its selected value, and
    // only when it actually needs to move (never fight an open dropdown mid-interaction).
    var wantSel = watching ? (watching.block + ':' + watching.dial) : '';
    if (pickerSel.value !== wantSel) pickerSel.value = wantSel;

    // THE LIVE DIAL — hidden with nothing watched; otherwise a real slider bounded to a sane
    // range (rangeFor) that always contains the CURRENT value, so opening it never silently
    // clamps a reading nobody asked to change. Never overwritten while the finger is on it.
    sliderRow.hidden = !watching;
    if (watching) {
      var range = rangeFor(watching.dial, watching.value);
      sliderIn.min = String(range.min); sliderIn.max = String(range.max); sliderIn.step = String(range.step);
      var label = tOf('board.dialLive', { dial: watching.word || watching.dial, value: fmtNum(watching.value) });
      sliderLabelText.data = label;
      sliderIn.setAttribute('aria-label', label);
      if (document.activeElement !== sliderIn) {
        var valStr = Number.isFinite(watching.value) ? String(watching.value) : String(range.min);
        if (sliderIn.value !== valStr) sliderIn.value = valStr;
      }
    }

    // THE ACT BUTTONS — pressing plays the running machine, not configures it (the same "mid-run
    // a Button is being PLAYED, not configured" law floor.js's own onTap already keeps): disabled,
    // not hidden, while nothing is running, so the room stays legible even when idle.
    var running = !!safeCall(panelDeps.running);
    for (var i = 0; i < actButtonEls.length; i++) actButtonEls[i].el.disabled = !running;

    // THE LOG — newest first (R2): points arrive chronologically (committed points are appended
    // run after run; a live run's own points build in seq order), so reversing the merged array
    // puts the most recent test at the top with no cross-run sequence numbers to invent.
    logListEl.textContent = '';
    // FINAL FIX ROUND, finding 4 (strings law): an archived chart's `watching` is only ever the
    // raw `{block, dial}` the engine stamped (`commit()` is pure, no access to portWord) — reading
    // `.dial` straight would render "degree 2 · Training 5.72 · 29 crates" where the LIVE log
    // already says "Polynomial degree 2 · …". Resolved through the SAME word-lookup the live case
    // uses (deps.wordFor, threaded rather than storing the word at commit time — commit() has no
    // way to resolve it, and threading keeps the resolution current even for an archive naming a
    // since-renamed or since-deleted block, via portWord's own graceful fallback).
    var dialWord = viewingEntry
      ? (viewingEntry.watching ? (safeCall(panelDeps.wordFor, viewingEntry.watching.block, viewingEntry.watching.dial) || viewingEntry.watching.dial) : '')
      : ((watching && watching.word) || '');
    var reversed = loggable.slice().reverse();
    for (var r = 0; r < reversed.length; r++) {
      var pt = reversed[r];
      var rowText = tOf('board.pointRow', {
        dial: dialWord, x: fmtNum(pt.x), pile: tOf('splitter.' + pt.pile), y: fmtNum(pt.y), n: pt.n,
      });
      logListEl.appendChild(el('div', 'bplogrow', rowText));
    }
    // The log's own empty-state hint now mirrors the SAME honestKey the caption just showed
    // (final fix round, finding 1 — this used to be hardcoded to board.empty, so a relay-fed
    // Board's log kept saying "Test something" too, right underneath a caption that (post-fix)
    // finally didn't). Falls back to board.empty for the one path with no honestKey at all
    // (viewing an archive that happens to be empty — never reachable in practice, since commit()
    // never archives a chart with zero points, but a real word beats an undefined one regardless).
    noLogEl.textContent = tOf(honestKey || 'board.empty');
    noLogEl.hidden = reversed.length !== 0;

    // THE ARCHIVES — rebuilt only when the count actually changed (a Stop that archived a stale
    // chart while this panel happened to be open is the only way this grows mid-session).
    var archiveList = safeCall(panelDeps.archives) || [];
    if (archiveList.length !== archivesCount) {
      archivesCount = archiveList.length;
      rebuildArchives(archiveList);
    }
  }

  function loopTick() {
    raf = null;
    if (!root) return;
    update();
    raf = requestAnimationFrame(loopTick);
  }
  function startLoop() { if (!raf) raf = requestAnimationFrame(loopTick); }
  function stopLoop() { if (raf) cancelAnimationFrame(raf); raf = null; }

  /** Tab-trap — keep focus inside the panel while it is open (WAI-ARIA APG dialog pattern, the
   *  exact idiom brain-panel.js already keeps). */
  function onTrapKey(ev) {
    if (ev.key !== 'Tab' || !root) return;
    var nodes = root.querySelectorAll('button, select, input, [tabindex]:not([tabindex="-1"])');
    var focusables = [];
    for (var i = 0; i < nodes.length; i++) { var n = nodes[i]; if (!n.disabled && !n.hidden) focusables.push(n); }
    if (!focusables.length) return;
    var first = focusables[0], last = focusables[focusables.length - 1];
    var active = document.activeElement;
    if (ev.shiftKey) { if (active === first || !root.contains(active)) { ev.preventDefault(); last.focus(); } }
    else { if (active === last || !root.contains(active)) { ev.preventDefault(); first.focus(); } }
  }

  /**
   * Open the Board's zoom over `host` (the same container the Floor renders into).
   * @param {HTMLElement} host
   * @param {string} id  the Board piece's id
   * @param {{t:Function, planFor:Function, pointsFor:Function, watching:Function, dials:Function,
   *   setWatch:Function, setDial:Function, dialCommitted:Function, actButtons:Function, press:Function,
   *   archives:Function, running:Function, openPlate:Function, wired:Function, feedKind:Function,
   *   heard:Function, wordFor:Function}} deps  Ruling R's callbacks — the ONLY facts this file
   *   gets about the machine. `openPlate` (fix round 2): closes this zoom and opens the piece's
   *   ordinary plate (Delete/rename/cable) — the panel's own convenience door back, never the
   *   only route (the Floor's header-band tap still works too). `wired`/`feedKind`/`heard`
   *   (final fix round, finding 1): the SAME three facts the floor face's own honest-state
   *   cascade reads, so the panel can mirror it exactly instead of falling back to board.empty's
   *   "test something" invitation. `wordFor(block, dial)` (finding 4): resolves an ARCHIVED
   *   chart's raw `{block, dial}` to its display word, the same way the live `watching().word`
   *   already is — an archive stores no word of its own. `dialCommitted` (task 061): the slider's
   *   'change' (gesture end) fires this — ONE labeled history entry per drag, never one per tick.
   * @param {HTMLElement} [returnFocusTo]  where to restore focus on close (floor.js's preTapFocus)
   */
  function open(host, id, deps, returnFocusTo) {
    if (!host || !id) return;
    close();
    boardId = id;
    panelDeps = deps || {};
    viewingEntry = null;
    archivesCount = -1;
    previousFocus = (returnFocusTo && typeof returnFocusTo.focus === 'function') ? returnFocusTo : document.activeElement;
    buildShell();
    host.appendChild(root);
    update();
    closeBtn.focus();
    startLoop();
    if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('resize', onCanvasResize);
  }

  /** Close back to live — safe to call when nothing is open. */
  function close() {
    stopLoop();
    if (typeof window !== 'undefined' && window.removeEventListener) window.removeEventListener('resize', onCanvasResize);
    if (root && root.parentNode) root.parentNode.removeChild(root);
    var toFocus = previousFocus;
    root = null; boardId = null; panelDeps = null; viewingEntry = null; lastWatching = null;
    closeBtn = null; openPlateBtn = null; canvasEl = null; canvasWrap = null; captionEl = null; archiveBand = null; archiveBandText = null; backBtn = null;
    pickerSel = null; sliderRow = null; sliderLabelText = null; sliderIn = null;
    actsListEl = null; noActsEl = null; actButtonEls = [];
    logListEl = null; noLogEl = null; archivesBox = null; archivesListEl = null; archivesCount = -1;
    previousFocus = null;
    if (toFocus && typeof toFocus.focus === 'function' && document.contains(toFocus)) {
      try { toFocus.focus(); } catch (e) { /* a detached or unfocusable node — nothing to do */ }
    }
  }

  /** Test seam: which Board (if any) is showing, and whether it is viewing a read-only archive. */
  function debug() {
    return {
      boardId: boardId,
      open: !!root,
      viewingArchive: viewingEntry ? { key: viewingEntry.key, label: viewingEntry.label } : null,
    };
  }

  var BoardPanel = { open: open, close: close, debug: debug, rangeFor: rangeFor, labelsFit: labelsFit, fmtNum: fmtNum };
  if (typeof module !== 'undefined' && module.exports) module.exports = BoardPanel;
  if (typeof window !== 'undefined') window.BoardPanel = BoardPanel;
})();
