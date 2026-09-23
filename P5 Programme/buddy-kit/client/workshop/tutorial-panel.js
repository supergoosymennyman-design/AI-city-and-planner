'use strict';
/**
 * tutorial-panel.js — the tutorial's VISUAL PRIMITIVES (car-gallery tutorial, plan task 3,
 * `.omo/plans/car-gallery-tutorial.md`).
 *
 * WHAT THIS IS. A factory of drawing/overlay primitives — a scrim, a spotlight that dims
 * everything except one target, a highlight ring, a slow-fading Next key, and a ghost cursor that
 * rides the drag a child is about to make. Nothing else. The step model (which part is next), the
 * gallery knowledge, the scoring and `state.mode` all live elsewhere: T9–T11 compose these
 * primitives into the controller, and T6's `game.js` owns the mode/persistence firewall. Keeping
 * this file ignorant of all of that is what lets it stay a tiny, testable render layer.
 *
 * WHY A LAYER, NOT A SCATTER OF NODES. Every overlay rides one `.tutorial-layer` fixed to the
 * viewport, so z-ordering is decided in one place and the whole layer can be made transparent to
 * the pointer with ONE `pointer-events: none` — the tap path must never be trapped behind a
 * decorative dim. The Next key is the one child that re-enables `pointer-events: auto`: it is the
 * only element that says "press me". The ghost cursor sits on `document.body` instead (a literal
 * `position: fixed`, same reasoning floor.js's `.shelfghost` records: fixed inside any transformed
 * ancestor stops meaning fixed).
 *
 * FLASH SAFETY. The blink is a slow fade — one full cycle every 2.4 s (≈0.42 cycles/s), an order
 * of magnitude under the WCAG 2.3.1 ceiling of 3 flashes/s. Its REST state is full opacity, which
 * is the correct frame when animation is off. Under `prefers-reduced-motion: reduce` every
 * animation here is killed by an explicit rule in styles.css (the layer lives on `document.body`,
 * OUTSIDE the `.app` blanket kill at styles.css ~988, so it needs its own mirror), and
 * `ghostCursor` checks the media query in JS and lands the ghost statically rather than animating
 * it.
 *
 * CANVAS REPAINTS. This module paints nothing on a canvas. If a caller ever needs the floor to
 * repaint after an overlay change it passes `deps.requestRepaint`, which game.js wires to the
 * floor's own paint clock (`logic/paint-clock.js`) — never a private `requestAnimationFrame` loop
 * started here. DOM animations use CSS keyframes (the blink) or the Web Animations API (the ghost).
 *
 * No DOM access at load: the file is `require`-able in node for tests; only `create()` touches the
 * document, and only when a browser is actually present.
 *
 * Usage:
 *   const panel = window.WorkshopTutorial.create({ host: document.body, t: t });
 *   panel.showScrim();
 *   panel.dimOthers(true);
 *   panel.highlightRect({ x: 300, y: 240, w: 120, h: 80 }, { label: 'Place the Motor' });
 *   panel.nextButton({ label: 'Next', onClick: advance });
 *   panel.ghostCursor({ x: 200, y: 180 }, { x: 520, y: 360 }, { via: [{ x: 360, y: 200 }] });
 *   panel.hideAll();
 */
(function () {
  /** One full fade cycle of the blink, in ms (2.4 s → 0.42 cycles/s, far under 3 flashes/s). */
  const NEXT_FADE_MS = 2400;
  /** The house tap-target floor (docs/standards/ui-ux-common.md §3) — the Next key and any
   *  highlight ring are never drawn smaller than this. */
  const MIN_TARGET = 44;

  /** A finite {x,y} page point. */
  function isPoint(p) {
    return !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
  }

  /**
   * The padded box a highlight ring (and the dim's spotlight hole) is drawn in, centred on `rect`
   * and never smaller than MIN_TARGET on either side. Page coordinates (a getBoundingClientRect
   * shape), because the layer is `position: fixed; inset: 0`.
   * @param {{x:number,y:number,w:number,h:number}} rect
   * @param {number} [pad]
   * @returns {{left:number,top:number,w:number,h:number}}
   */
  function boxFor(rect, pad) {
    pad = Number.isFinite(pad) ? pad : 10;
    const w = Math.max(MIN_TARGET, (rect.w || 0) + pad * 2);
    const h = Math.max(MIN_TARGET, (rect.h || 0) + pad * 2);
    const cx = rect.x + (rect.w || 0) / 2;
    const cy = rect.y + (rect.h || 0) / 2;
    return { left: Math.round(cx - w / 2), top: Math.round(cy - h / 2), w: Math.round(w), h: Math.round(h) };
  }

  /** Write a boxFor() result onto an absolutely-positioned element. */
  function place(el, box) {
    el.style.left = box.left + 'px';
    el.style.top = box.top + 'px';
    el.style.width = box.w + 'px';
    el.style.height = box.h + 'px';
  }

  /**
   * The reduced-motion predicate used when JS must decide (the ghost animation). CSS handles the
   * keyframe side; this is only for the Web Animations API, which a stylesheet cannot switch off.
   * Crash-proof: a browser without matchMedia says "no preference", the safe default for playback.
   */
  function defaultReducedMotion() {
    try {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) {
      return false;
    }
  }

  /**
   * Build one panel bound to `deps.host` (default `document.body`).
   *
   * @param {object} [deps]
   * @param {Element} [deps.host] container the overlay layer mounts into (default body).
   * @param {function} [deps.t] translate(key, vars) — used only as the Next key's default label.
   * @param {function} [deps.reducedMotion] () => boolean, override for tests/dev.
   * @param {function} [deps.requestRepaint] () => void, the floor's paint-clock invalidate (game.js
   *   wires this); never a private rAF here.
   * @returns {object} the primitives (see each function's JSDoc).
   */
  function create(deps) {
    if (typeof document === 'undefined') throw new Error('WorkshopTutorial.create needs a DOM');
    deps = deps || {};
    const doc = document;
    const host = deps.host || doc.body;
    const t = typeof deps.t === 'function' ? deps.t : null;
    const reducedMotion = typeof deps.reducedMotion === 'function' ? deps.reducedMotion : defaultReducedMotion;
    const requestRepaint = typeof deps.requestRepaint === 'function' ? deps.requestRepaint : function () {};

    // One panel per host: drop any earlier instance so re-creating can never stack two overlays
    // (the same duplicate-overlay trap task 7's re-entrancy guard covers on the button side).
    const staleLayer = host.querySelector('.tutorial-layer');
    if (staleLayer) staleLayer.remove();
    const staleGhost = doc.querySelector('.tutorial-ghost');
    if (staleGhost) staleGhost.remove();

    const layer = doc.createElement('div');
    layer.className = 'tutorial-layer';
    layer.setAttribute('aria-hidden', 'false');
    host.appendChild(layer);

    /** Create a decorative (aria-hidden) child of the layer. */
    const make = (tag, cls, parent) => {
      const n = doc.createElement(tag);
      if (cls) n.className = cls;
      n.setAttribute('aria-hidden', 'true');
      (parent || layer).appendChild(n);
      return n;
    };

    const scrim = make('div', 'tutorial-scrim');
    const dim = make('div', 'tutorial-dim');
    const spot = make('div', 'tutorial-spot', dim);
    const highlight = make('div', 'tutorial-highlight');
    ['tl', 'tr', 'bl', 'br'].forEach((c) => make('span', 'tutorial-tick tutorial-tick-' + c, highlight));
    const hlLabel = make('span', 'tutorial-hl-label', highlight);

    // The Next key is the ONE interactive child, so it is NOT aria-hidden and NOT built by make().
    const next = doc.createElement('button');
    next.type = 'button';
    next.className = 'tutorial-next';
    const nextArrow = doc.createElement('span');
    nextArrow.className = 'tutorial-next-arrow';
    nextArrow.setAttribute('aria-hidden', 'true');
    const nextText = doc.createElement('span');
    nextText.className = 'tutorial-next-text';
    next.append(nextArrow, nextText);
    layer.appendChild(next);

    const state = { rect: null, dim: false };
    let activeGhost = null;

    /** Repaint the dim's two modes: a uniform wash, or a spotlight hole when a target is set. */
    function syncDim() {
      const hasSpot = !!(state.dim && state.rect);
      dim.classList.toggle('on', state.dim);
      dim.classList.toggle('has-spot', hasSpot);
      if (hasSpot) place(spot, state.rect);
    }

    /**
     * A dim scrim above the floor canvas. Based on `.overlay`/`.overlay.open` but deliberately
     * lighter: the tutorial previews the FINISHED machine behind it, and at modal strength the
     * child would be looking at a dark room. Non-interactive (the layer owns pointer-events).
     */
    function showScrim() { scrim.classList.add('open'); }
    function hideScrim() { scrim.classList.remove('open'); }

    /**
     * Dim everything except the highlighted target. With no highlight ring shown this is a plain
     * uniform wash; the moment `highlightRect` sets a target it becomes a spotlight (a shadow cast
     * OUT of the target's own box), so the ring reads as "everything but this".
     * @param {boolean} on
     */
    function dimOthers(on) { state.dim = !!on; syncDim(); }

    /**
     * A highlight ring over a page rect. Always at least MIN_TARGET (44px) visually, with a dashed
     * rim AND four corner brackets so the cue is a SHAPE, never colour alone.
     * @param {{x:number,y:number,w:number,h:number}} rect page coordinates (getBoundingClientRect shape)
     * @param {{pad?:number, label?:string, pulse?:boolean}} [opts]
     * @returns {Element|null} the ring, or null when `rect` is not a complete box.
     */
    function highlightRect(rect, opts) {
      opts = opts || {};
      if (!rect || !Number.isFinite(rect.x) || !Number.isFinite(rect.y) ||
          !Number.isFinite(rect.w) || !Number.isFinite(rect.h)) {
        hideHighlight();
        return null;
      }
      const box = boxFor(rect, opts.pad);
      state.rect = box;                       // the padded box drives both the ring and the spot
      place(highlight, box);
      highlight.classList.add('on');
      const canPulse = opts.pulse !== false && !reducedMotion();
      highlight.classList.toggle('pulse', canPulse);
      if (opts.label != null && opts.label !== '') {
        hlLabel.textContent = String(opts.label);
        hlLabel.hidden = false;
      } else {
        hlLabel.textContent = '';
        hlLabel.hidden = true;
      }
      syncDim();
      return highlight;
    }

    function hideHighlight() {
      state.rect = null;
      highlight.classList.remove('on', 'pulse');
      hlLabel.textContent = '';
      hlLabel.hidden = true;
      syncDim();
    }

    /**
     * Toggle the slow blink on any element. The fade is defined by `.tutorial-blink` in the
     * stylesheet (2.4 s per cycle) and is killed under reduced motion there.
     * @param {Element} el
     * @param {boolean} on
     */
    function blink(el, on) {
      if (!el || !el.classList) return;
      el.classList.toggle('tutorial-blink', !!on);
    }

    /**
     * Show the Next key: a ≥44px pill centred in the thumb zone by default, blinking with a slow
     * fade. It is the only element on the layer that takes the pointer.
     * @param {{label?:string, onClick?:function, x?:number, y?:number, blink?:boolean}} [opts]
     * @returns {Element} the button (reused between calls — one key, restyled).
     */
    function nextButton(opts) {
      opts = opts || {};
      const label = (opts.label != null && opts.label !== '')
        ? String(opts.label)
        : (t ? t('tutorial.next') : 'Next');
      nextText.textContent = label;
      next.onclick = (typeof opts.onClick === 'function')
        ? function (ev) { try { opts.onClick(ev); } catch (e) { console.error('WorkshopTutorial next onClick failed', e); } }
        : null;
      if (Number.isFinite(opts.x) && Number.isFinite(opts.y)) {
        next.classList.remove('tutorial-next-center');
        next.style.left = Math.round(opts.x) + 'px';
        next.style.top = Math.round(opts.y) + 'px';
      } else {
        next.classList.add('tutorial-next-center');
        next.style.left = '';
        next.style.top = '';
      }
      next.classList.add('on');
      blink(next, opts.blink !== false);
      return next;
    }

    /**
     * A fixed-position ghost cursor that animates along a path from `from` to `to`. Never a hit
     * target. Under reduced motion it does NOT animate — it lands statically at `to` (still the
     * useful landmark: where the piece should go) and reports done on a microtask.
     * @param {{x:number,y:number}} from page coords
     * @param {{x:number,y:number}} to page coords
     * @param {{via?:Array<{x:number,y:number}>, duration?:number, delay?:number, easing?:string,
     *   iterations?:number, keep?:boolean, onDone?:function}} [opts]
     * @returns {{el:Element, anim:Animation|null, cancel:function}|null}
     */
    function ghostCursor(from, to, opts) {
      opts = opts || {};
      if (!isPoint(from) || !isPoint(to)) return null;
      if (activeGhost) { try { activeGhost.cancel(); } catch (e) { /* already gone */ } activeGhost = null; }

      const g = doc.createElement('div');
      g.className = 'tutorial-ghost';
      g.setAttribute('aria-hidden', 'true');
      const ring = doc.createElement('span');
      ring.className = 'tutorial-ghost-ring';
      ring.setAttribute('aria-hidden', 'true');
      const dot = doc.createElement('span');
      dot.className = 'tutorial-ghost-dot';
      dot.setAttribute('aria-hidden', 'true');
      g.append(ring, dot);
      doc.body.appendChild(g);

      const pts = [from]
        .concat(Array.isArray(opts.via) ? opts.via.filter(isPoint) : [])
        .concat([to]);
      const at = (p) => 'translate(' + Math.round(p.x) + 'px, ' + Math.round(p.y) + 'px)';
      const finish = () => {
        if (typeof opts.onDone === 'function') { try { opts.onDone(); } catch (e) { console.error('WorkshopTutorial ghost onDone failed', e); } }
      };
      const record = { el: g, anim: null, cancel: null };
      record.cancel = function () {
        if (record.anim) { try { record.anim.cancel(); } catch (e) { /* already finished */ } }
        try { g.remove(); } catch (e) { /* detached */ }
        if (activeGhost === record) activeGhost = null;
      };

      if (reducedMotion()) {
        // No animation: place the landmark where the drag must end and be done.
        g.style.transform = at(to);
        g.classList.add('tutorial-ghost-static');
        requestRepaint();
        if (typeof queueMicrotask === 'function') queueMicrotask(finish); else finish();
        activeGhost = record;
        return record;
      }

      const keyframes = pts.map((p, i) => ({
        transform: at(p),
        offset: pts.length > 1 ? i / (pts.length - 1) : 0,
      }));
      let anim = null;
      try {
        anim = g.animate(keyframes, {
          duration: Number.isFinite(opts.duration) ? opts.duration : 2100,
          delay: Number.isFinite(opts.delay) ? opts.delay : 0,
          easing: opts.easing || 'cubic-bezier(0.22, 0.61, 0.36, 1)',
          // Default ONE pass: a looping ghost would be an endless animation (and a flash risk).
          iterations: Number.isFinite(opts.iterations) ? opts.iterations : 1,
          fill: 'both',
        });
      } catch (e) {
        anim = null;                          // no Web Animations API: land it honestly, no anim
      }
      record.anim = anim;

      if (anim) {
        anim.addEventListener('finish', () => {
          finish();
          if (opts.keep !== true) record.cancel();
        });
      } else {
        g.style.transform = at(to);
        finish();
        if (opts.keep !== true) record.cancel();
      }
      requestRepaint();
      activeGhost = record;
      return record;
    }

    /** Hide every primitive at once (keeps the nodes for reuse; cancels any live ghost). */
    function hideAll() {
      hideScrim();
      state.dim = false;
      hideHighlight();
      next.classList.remove('on');
      blink(next, false);
      next.onclick = null;
      if (activeGhost) { try { activeGhost.cancel(); } catch (e) { /* already gone */ } activeGhost = null; }
      syncDim();
      requestRepaint();
    }

    return {
      showScrim: showScrim,
      hideScrim: hideScrim,
      dimOthers: dimOthers,
      highlightRect: highlightRect,
      nextButton: nextButton,
      blink: blink,
      ghostCursor: ghostCursor,
      hideAll: hideAll,
      // The namespaced nodes, for tests and for T9–T11's own composition. Read-only by convention.
      el: { layer: layer, scrim: scrim, dim: dim, spot: spot, highlight: highlight, next: next },
    };
  }

  // ================= car-gallery tutorial CONTROLLER (plan task 9) =================
  // The step model (T1), the visual primitives above, the mode firewall (T6) and the floor geometry
  // seams (T8) all exist; this is what drives them in order: preview → clear → part-by-part build.
  // It owns NO game state directly — game.js hands it clearTable / place / setPhase and the
  // state.tutorial record it keeps current, so the panel stays a renderer+sequencer and the host
  // keeps its firewall.

  /** Preview input-lock: the finished example is on show and every control is gated for this long. */
  const LOCK_MS = 2000;
  /** After the lock, how long the blinking Next may be ignored before the rest of the screen dims. */
  const IDLE_MS = 4000;
  /** How close (page px) a released piece must be to its slot to count as placed (D6 acceptance). */
  const DROP_RADIUS = 80;
  /** Travel that separates a deliberate drag from a tap (floor.js's own LIFT_PX is 8). */
  const DRAG_PX = 8;
  /** D3's weights: a restored part is worth 3, a restored connection (snap or wire) 1. */
  const TEST_WEIGHTS = { part: 3, wire: 1 };

  const rectCenter = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
  const elCenter = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  /**
   * Build the controller bound to a host. All deps are optional; the workshop boot supplies them.
   * @param {object} [deps]
   * @param {function} [deps.t]
   * @param {function} [deps.status]        (msg) => void, the host's one-line hint
   * @param {Element}  [deps.host]          overlay layer container (default body)
   * @param {object}   [deps.floor]         window.WorkshopFloor (screenPointFor/rectForPiece/setTutorialFocus)
   * @param {function} [deps.setPhase]      (phase) => void, the host's tutorialSetPhase
   * @param {function} [deps.clearTable]    () => boolean, empty the tutorial floor
   * @param {function} [deps.place]         (piece) => id|null, clone a configured piece onto the floor
   * @param {function} [deps.connect]       (step) => boolean, apply ONE exact snap/wire edge (T10 host
   *   seam `api.tutorialConnect`). The controller only ever passes the CURRENT step's exact from/to,
   *   so a connection the child did not make can never be invented.
   * @param {function} [deps.tableOf]       () => table, the LIVE table (T10's completion match)
   * @param {object}   [deps.score]         window.WorkshopTutorialScore (topology/classify)
   * @param {function} [deps.startTest]     () => void, the Test-yourself press (T11; absent ⇒ the
   *   revealed key is inert but the reveal itself still happens)
   * @param {object}   [deps.tutorialState] the host's state.tutorial record to keep current
   * @param {function} [deps.reducedMotion]
   * @param {function} [deps.requestRepaint]
   * @param {object}   [deps.script]        window.WorkshopTutorialScript (buildSteps/propsKey)
   * @param {function} [deps.seed]          () => number, the host's state.seed (T11's D2/D10 seed)
   * @param {function} [deps.exit]          () => void, leave the tutorial + restore free play (the
   *   always-available Exit/Return door; T11)
   * @param {number}   [deps.lockMs] @param {number} [deps.idleMs] @param {number} [deps.dropRadius]
   * @returns {{enter:function, exit:function, advance:function, placeCurrent:function, debug:function,
   *   submit:function, beginTest:function}}
   */
  function createController(deps) {
    if (typeof document === 'undefined') throw new Error('WorkshopTutorial.createController needs a DOM');
    deps = deps || {};
    const doc = document;
    const t = typeof deps.t === 'function' ? deps.t : function (k) { return k; };
    const status = typeof deps.status === 'function' ? deps.status : function () {};
    const floor = deps.floor || {};
    const tutorialState = deps.tutorialState || {};
    const setPhase = typeof deps.setPhase === 'function' ? deps.setPhase : function () {};
    const clearTable = typeof deps.clearTable === 'function' ? deps.clearTable : function () { return false; };
    const placePiece = typeof deps.place === 'function' ? deps.place : function () { return null; };
    const connectStep = typeof deps.connect === 'function' ? deps.connect : null;
    // FIX-1: the build no longer clears the table — it HIDES every example piece (keeping the layout
    // fixed) and reveals one per part step. `hideAll` is that host seam; it falls back to `clearTable`
    // for a host that has not wired it, so the controller still runs.
    const hideAll = typeof deps.hideAll === 'function' ? deps.hideAll : clearTable;
    const hiddenCountOf = typeof deps.hiddenCountOf === 'function' ? deps.hiddenCountOf : null;
    const revealedCountOf = typeof deps.revealedCountOf === 'function' ? deps.revealedCountOf : null;
    const tableOf = typeof deps.tableOf === 'function' ? deps.tableOf : null;
    const scoreLib = deps.score || (typeof window !== 'undefined' ? window.WorkshopTutorialScore : null);
    const startTest = typeof deps.startTest === 'function' ? deps.startTest : null;
    const script = deps.script || (typeof window !== 'undefined' ? window.WorkshopTutorialScript : null);
    // T11: the host's seed (D2/D10) and its leave-the-tutorial action (the always-available Exit).
    const seedOf = typeof deps.seed === 'function'
      ? deps.seed
      : function () { return Number.isFinite(deps.seed) ? deps.seed : 42; };
    const exitToFreePlay = typeof deps.exit === 'function' ? deps.exit : null;
    const lockMs = Number.isFinite(deps.lockMs) ? deps.lockMs : LOCK_MS;
    const idleMs = Number.isFinite(deps.idleMs) ? deps.idleMs : IDLE_MS;
    const dropRadius = Number.isFinite(deps.dropRadius) ? deps.dropRadius : DROP_RADIUS;
    const panel = create({
      host: deps.host, t: deps.t, reducedMotion: deps.reducedMotion, requestRepaint: deps.requestRepaint,
    });

    // Session-only state: all of it dies with exit(). Nothing here is persisted or undoable.
    let active = false, kind = null, phase = 'none';
    let steps = [], pieceById = {};
    // T10: the pristine example, kept for the completion match (the host clears the live table, so
    // the answer key must be captured by value at enter). The two connection anchors are live page
    // points read from T8's screenPointFor each step — never captured, because by the connection
    // phase every involved piece already stands on the floor and a pan can move it.
    let originalTable = null;
    let anchors = null, anchorFrom = null, anchorTo = null;
    // The live Floor rect is shared by the visual cue and drop acceptance.
    let currentSlotRect = null;
    let stepIndex = 0, stepCount = 0, nextVisible = false, dimmed = false, locked = false, armed = false;
    let placedIds = [];
    let lockTimer = null, idleTimer = null;
    let down = null, connDown = null, dropHandled = false;
    let bound = false, slotBtn = null, lockBadge = null;
    // --- T11 "Test yourself": the seeded restore challenge ---------------------------------
    // testSeed is frozen for the duration of one attempt (D10); retry re-rolls it. testTarget is
    // the removed set used for the scoring denominator. The full graph remains the answer key.
    let testSeed = null, testTarget = null, testResult = null;
    let submitted = false, everSubmitted = false, testRevealed = false;
    let marks = [];
    let testBar = null, submitBtn = null, retryBtn = null, exitBtn = null, scoreEl = null;
    const guidedPhase = () => phase === 'tutorial-build';

    const appRoot = () => doc.querySelector('.app') || doc.body;
    const safeFloor = (fn) => { try { return fn ? fn() : null; } catch (e) { return null; } };
    const rectOf = (id) => safeFloor(() => floor.rectForPiece && floor.rectForPiece(id));

    /** The floor canvas's own page rect, or null when it is not mounted. */
    function canvasRect() {
      const cvs = doc.querySelector('.floorcanvas');
      return cvs ? cvs.getBoundingClientRect() : null;
    }
    /** Is a page rect fully inside the floor canvas? Unmeasurable ⇒ true (never pan on a guess). */
    function rectInCanvas(rect) {
      const c = canvasRect();
      if (!c || !rect) return true;
      return rect.x + rect.w > c.left && rect.y + rect.h > c.top
        && rect.x < c.right && rect.y < c.bottom;
    }
    /** FIX-1: pan the floor to `pieceId` ONLY when its live rect is off the canvas. An on-screen
     *  target must never move the view (the guided build's own "no jumping" rule). */
    function panIfOffscreen(pieceId) {
      if (!pieceId) return;
      if (rectInCanvas(rectOf(pieceId))) return;
      safeFloor(() => floor.revealTutorialTargets && floor.revealTutorialTargets([pieceId]));
    }

    /** JSON deep clone for table data (the same idiom the script module uses — table data is
     *  JSON-serialisable, so a browser without structuredClone still works). */
    const clonePlain = (v) => JSON.parse(JSON.stringify(v));

    /**
     * THE HAZARD (problems.md): score()'s `target` is the REMOVED SET as a TABLE-LIKE object with
     * FULL pieces — never T1's removal record (its `parts[]` carry only a propsKey and its
     * snaps/wires are index arrays). Look each removed part id up in the pristine example, and each
     * removed snap/wire index up in the example's arrays.
     * @param {object} original the pristine example captured at enter
     * @param {object} removed T1's effective removal record ({parts,snaps,wires})
     * @returns {{pieces:Array, snaps:Array, wires:Array}}
     */
    function targetTableFrom(original, removed) {
      const src = original || {};
      const byId = {};
      for (const p of (src.pieces || [])) byId[p.id] = p;
      const pieces = ((removed && removed.parts) || []).map((p) => byId[p.id]).filter(Boolean).map(clonePlain);
      const snaps = ((removed && removed.snaps) || []).map((i) => (src.snaps || [])[i]).filter(Boolean).map(clonePlain);
      const wires = ((removed && removed.wires) || []).map((i) => (src.wires || [])[i]).filter(Boolean).map(clonePlain);
      return { pieces: pieces, snaps: snaps, wires: wires };
    }

    /** Rebuild the pruned floor through the SAME host seams the build used (clear + exact-props
     *  place + exact-edge connect), so the test needs no new host operation. */
    function renderPruned(pruned) {
      clearTable();
      for (const p of ((pruned && pruned.pieces) || [])) placePiece(clonePlain(p));
      if (!connectStep) return;
      for (const s of ((pruned && pruned.snaps) || [])) {
        try { connectStep({ phase: 'snap', from: s.from, to: s.to }); } catch (e) { /* best effort */ }
      }
      for (const w of ((pruned && pruned.wires) || [])) {
        try { connectStep({ phase: 'wire', from: w.from, to: w.to }); } catch (e) { /* best effort */ }
      }
    }

    function report() {
      tutorialState.stepIndex = stepIndex;
      tutorialState.stepCount = stepCount;
      tutorialState.nextVisible = nextVisible;
      tutorialState.dimmed = dimmed;
      tutorialState.locked = locked;
      tutorialState.lockMs = lockMs;
    }

    const SHELF_TILE = '.floorshelf .shelfobj';
    const shelfTile = (type) => doc.querySelector(SHELF_TILE + '[data-type="' + type + '"]')
      || doc.querySelector('.shelfobj[data-type="' + type + '"]');

    /** Ring the shelf card the next part comes from (the ring primitive owns ONE target; the shelf
     *  card is marked with a class instead so both cues can stand at once). */
    function markTile(type) {
      clearTileMarks();
      const tile = shelfTile(type);
      if (tile) {
        tile.classList.add('tutorial-tile');
        try { tile.scrollIntoView({ inline: 'center', block: 'nearest' }); } catch (e) { /* older browser */ }
      }
      return tile;
    }
    function clearTileMarks() {
      for (const el of doc.querySelectorAll('.shelfobj.tutorial-tile')) el.classList.remove('tutorial-tile');
    }

    /** The tappable target over the current slot — the a11y tap path's second half. A real button on
     *  the decorative layer (inline pointer-events beat the layer's blanket `none`). */
    function ensureSlotButton() {
      if (slotBtn) return slotBtn;
      slotBtn = doc.createElement('button');
      slotBtn.type = 'button';
      slotBtn.className = 'tutorial-slot';
      slotBtn.style.pointerEvents = 'auto';
      slotBtn.style.display = 'none';
      slotBtn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (!active || !guidedPhase()) return;
        const step = steps[stepIndex];
        if (step && step.phase === 'part') acceptPart(step);
      });
      ((panel.el && panel.el.layer) || doc.body).appendChild(slotBtn);
      return slotBtn;
    }
    function showSlot(rect, step) {
      const b = ensureSlotButton();
      b.style.left = Math.round(rect.x) + 'px';
      b.style.top = Math.round(rect.y) + 'px';
      b.style.width = Math.round(Math.max(MIN_TARGET, rect.w)) + 'px';
      b.style.height = Math.round(Math.max(MIN_TARGET, rect.h)) + 'px';
      b.style.display = 'block';
      // No new copy: the part's own existing name is the target's accessible name.
      b.setAttribute('aria-label', t('block.' + step.type));
    }
    function hideSlot() { if (slotBtn) slotBtn.style.display = 'none'; }

    // --- T10 connection anchors: the source and target ends a snap/wire step joins --------------
    // A step's endpoint is `{piece,end}` (snap) or `{block,port}` (wire); both normalise to an
    // id+port pair for T8's screenPointFor. A snap's item ends are not signal sockets, so the exact
    // port resolves to null and the piece's own centre is the honest fallback — never a guess.
    function endpointOf(step, which) {
      const e = step && step[which];
      if (!e) return null;
      if (step.phase === 'snap') return { id: e.piece, port: e.end };
      return { id: e.block, port: e.port };
    }

    /** The exact port's page point when it is a signal socket, else the piece's own centre. */
    function anchorPointOf(endpoint) {
      if (!endpoint) return null;
      let pt = safeFloor(() => floor.screenPointFor && floor.screenPointFor(endpoint.id, endpoint.port));
      if (!pt) pt = safeFloor(() => floor.screenPointFor && floor.screenPointFor(endpoint.id));
      return pt;
    }

    /** The two tappable anchors — real buttons (accessible names, focusable) so the tap path is the
     *  same gesture as the drag: tap the source, then the target. One per role, reused across steps. */
    function ensureAnchors() {
      if (anchors) return anchors;
      const mk = (role) => {
        const b = doc.createElement('button');
        b.type = 'button';
        b.className = 'tutorial-anchor tutorial-anchor-' + role;
        b.dataset.role = role;
        // Inline so the anchor reads as a glowing target without a stylesheet entry: the layer's
        // blanket pointer-events:none is beaten by the inline `auto` (the same trick `.tutorial-slot`
        // uses), and the ring shape (dashed → solid when armed) is the non-colour cue.
        b.style.cssText = 'position:absolute;display:none;padding:0;margin:0;border-radius:50%;'
          + 'background:rgba(95,227,220,0.04);border:1px dashed #80aaa8;box-shadow:none;'
          + 'pointer-events:auto;cursor:pointer;';
        const dot = doc.createElement('span');
        dot.className = 'tutorial-anchor-dot';
        dot.setAttribute('aria-hidden', 'true');
        b.appendChild(dot);
        const layer = panel.el && panel.el.layer;
        (layer || doc.body).appendChild(b);
        b.addEventListener('click', role === 'from' ? onAnchorFrom : onAnchorTo);
        return b;
      };
      anchors = { from: mk('from'), to: mk('to') };
      return anchors;
    }
    function placeAnchor(btn, pt, label) {
      btn.style.left = Math.round(pt.x - MIN_TARGET / 2) + 'px';
      btn.style.top = Math.round(pt.y - MIN_TARGET / 2) + 'px';
      btn.style.width = MIN_TARGET + 'px';
      btn.style.height = MIN_TARGET + 'px';
      btn.style.display = 'block';
      if (label) btn.setAttribute('aria-label', label);
    }
    /** The endpoint's own block name is its accessible name (the same existing copy a card shows). */
    function anchorLabel(endpoint) {
      const p = endpoint && pieceById[endpoint.id];
      return p ? t('block.' + p.type) : String((endpoint && endpoint.id) || '');
    }
    /** Both rings retain their physical centres; only the current stage takes input. */
    function showAnchors(step, pa, pb) {
      const els = ensureAnchors();
      const a = endpointOf(step, 'from'), b = endpointOf(step, 'to');
      const pts = { from: pa, to: pb };
      placeAnchor(els.from, pts.from, anchorLabel(a));
      placeAnchor(els.to, pts.to, anchorLabel(b));
      els.from.classList.add('on');
      els.to.classList.add('on');
    }
    function hideAnchors() {
      safeFloor(() => floor.setTutorialLead && floor.setTutorialLead(null));
      safeFloor(() => floor.setTutorialPorts && floor.setTutorialPorts(null));
      if (!anchors) return;
      anchors.from.style.display = 'none';
      anchors.to.style.display = 'none';
      anchors.from.classList.remove('on', 'tutorial-anchor-armed');
      anchors.to.classList.remove('on');
    }
    function markAnchorArmed(on) {
      if (!anchors) return;
      anchors.from.classList.toggle('tutorial-anchor-armed', !!on);
      anchors.from.style.borderStyle = on ? 'solid' : 'dashed';
      anchors.from.style.pointerEvents = on ? 'none' : 'auto';
      anchors.to.style.pointerEvents = on ? 'auto' : 'none';
    }

    /** The lock badge — a CSS-drawn padlock (zero emoji) that stands while the 2 s input lock holds. */
    function ensureLockBadge() {
      if (lockBadge) return lockBadge;
      lockBadge = doc.createElement('div');
      lockBadge.className = 'tutorial-lock';
      lockBadge.setAttribute('aria-hidden', 'true');
      lockBadge.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">'
        + '<path d="M7 10V7a5 5 0 0 1 10 0v3" fill="none" stroke="#b6fff8" stroke-width="2.4" stroke-linecap="round"/>'
        + '<rect x="4" y="10" width="16" height="11" rx="2.4" fill="#b6fff8"/></svg>';
      const layer = panel.el && panel.el.layer;
      (layer || doc.body).appendChild(lockBadge);
      return lockBadge;
    }
    function showLockBadge(on) {
      const b = ensureLockBadge();
      b.classList.toggle('on', !!on);
      appRoot().classList.toggle('tutorial-lock', !!on);
    }

    /** Light the current part step: the shelf card for its type, the target slot, the ghost cursor
     *  from one to the other, and the tappable slot over it. */
    function showPartStep(i) {
      const step = steps[i];
      if (!step || step.phase !== 'part') return false;
      // FIX-1: the piece is already on the (never-cleared) plan, so its LIVE page rect IS the target
      // the highlight is drawn on — and the piece that will be revealed there. Pan ONLY when that
      // rect is genuinely outside the canvas (an on-screen step must never move the view).
      panIfOffscreen(step.pieceId);
      const tile = markTile(step.type);
      armed = false;
      const slotRect = rectOf(step.pieceId) || safeFloor(() => floor.referenceRect(step.pieceId));
      if (!slotRect) { currentSlotRect = null; panel.highlightRect(null); hideSlot(); report(); return false; }

      currentSlotRect = slotRect;
      // pad 0: the ring is the piece's OWN box, so the target the child sees is exactly the piece
      // that lands there (FIX-1's whole point — box and part coincide).
      panel.highlightRect(slotRect, { pad: 0, label: t('block.' + step.type) });
      showSlot(slotRect, step);
      const to = rectCenter(slotRect);
      if (tile) panel.ghostCursor(elCenter(tile), to, { duration: 2100 });
      else panel.ghostCursor(to, to, { duration: 450 });
      report();
      return true;
    }

    /** The part phase is spent (T10 takes over the snap/wire steps). Leave a clean, honest state. */
    function endOfParts() {
      clearTileMarks();
      hideSlot();
      panel.highlightRect(null);
      currentSlotRect = null;
      armed = false;
      report();
    }

    /**
     * Light the current connection step: both endpoints as tappable anchors, the target piece brought
     * into view, the two involved pieces spotlit, and a ghost cursor riding source → target. The
     * exact ports are read LIVE from T8's `screenPointFor` (a pan can move them between steps), and
     * the item ends a snap joins are not signal sockets, so they fall back to the piece's own centre.
     * @param {number} i
     * @returns {boolean} whether a connection guide was shown.
     */
    function showConnectionStep(i) {
      const step = steps[i];
      if (!step || (step.phase !== 'snap' && step.phase !== 'wire')) return false;
      endOfParts();
      const a = endpointOf(step, 'from');
      const b = endpointOf(step, 'to');
      anchorFrom = a;
      anchorTo = b;
      safeFloor(() => floor.revealTutorialTargets && floor.revealTutorialTargets([a.id, b.id]));
      safeFloor(() => floor.setTutorialPorts && floor.setTutorialPorts([a.id, b.id]));
      const pa = anchorPointOf(a);
      const pb = anchorPointOf(b);
      if (pa && pb) {
        safeFloor(() => floor.setTutorialFocus && floor.setTutorialFocus([a.id, b.id]));
        showAnchors(step, pa, pb);
        markAnchorArmed(false);
        panel.ghostCursor(pa, pb, { duration: 2100 });
      } else {
        hideAnchors();
      }
      status(t(step.textKey));
      report();
      return true;
    }

    /**
     * Show the guide for the CURRENT step whatever its phase; when the list is spent, run the
     * completion match and reveal the self-test.
     * @returns {boolean} whether anything was shown (or the payoff revealed).
     */
    function showCurrent() {
      const step = steps[stepIndex];
      if (!step) return finish();
      if (step.phase === 'part') return showPartStep(stepIndex);
      if (step.phase === 'snap' || step.phase === 'wire') return showConnectionStep(stepIndex);
      return false;
    }

    /**
     * Accept the current connection: the host applies the step's EXACT edge (snap or wire) and says
     * whether it took. The controller never invents an edge — a refusal (or a phase mismatch) leaves
     * the step exactly where it was.
     * @returns {boolean} whether the step advanced.
     */
    function acceptConnection(step) {
      if (!step || (step.phase !== 'snap' && step.phase !== 'wire')) return false;
      if (!connectStep) return false;
      let ok = false;
      try { ok = !!connectStep(step); } catch (e) { ok = false; }
      if (!ok) return false;
      hideAnchors();
      stepIndex += 1;
      nextVisible = false;
      dimmed = false;
      armed = false;
      report();
      showCurrent();
      return true;
    }

    /**
     * All steps are spent. Compare the LIVE table to the pristine example captured at enter: a
     * fully-correct rebuild is CLEAN and reveals the self-test; a machine that does not match gets an
     * honest hint instead and nothing is revealed.
     * @returns {boolean} whether the completion was clean.
     */
    function finish() {
      endOfParts();
      hideAnchors();
      panel.highlightRect(null);
      safeFloor(() => floor.setTutorialFocus && floor.setTutorialFocus(null));
      nextVisible = false;
      dimmed = false;
      report();
      const live = tableOf ? safeFloor(tableOf) : null;
      let clean = false;
      if (live && originalTable && scoreLib && typeof scoreLib.classify === 'function') {
        const c = scoreLib.classify(originalTable, live);
        clean = c.missing.length === 0 && c.wrong.length === 0 && c.extra.length === 0;
      }
      if (!clean) { status(t('hint.link.bad')); return false; }
      revealTestYourself();
      return true;
    }

    /** The completion payoff: the self-test key, labelled and blinking, with NO scrim and NO dim —
     *  the spec's highlight-only reveal. Its press runs the host's startTest when one is wired (T11). */
    function revealTestYourself() {
      // T11: the reveal is what ARMS the challenge — beginTest() and advance() both gate on this
      // flag, so it must flip the moment the self-test key appears.
      testRevealed = true;
      nextVisible = true;
      dimmed = false;
      panel.dimOthers(false);
      panel.nextButton({
        label: t('tutorial.testYourself'),
        onClick: startTest ? function () { startTest(); } : null,
        blink: true,
      });
      report();
    }

    // --- T11 "Test yourself": seeded removal → restore → submit → score → retry/return -----------

    /**
     * T11 — the Test-yourself press. Pick a SEEDED removal (D2), apply it (pure), render the pruned
     * floor, move to `tutorial-test`, and release ordinary editing. The revealed key's host hook
     * (`deps.startTest`) delegates here; `advance()` also calls it so the frozen Next seam can start
     * the test. Retry re-enters through the same door with a re-rolled seed (D10).
     * @param {number} [seedOverride] the retry's re-rolled seed; the host seed otherwise
     * @returns {boolean} whether the test began
     */
    function beginTest(seedOverride) {
      if (!active || !testRevealed) return false;
      if (phase !== 'tutorial-build' && phase !== 'tutorial-test') return false;
      if (!script || typeof script.pickRemoval !== 'function' || typeof script.applyRemoval !== 'function') return false;
      if (!originalTable) return false;
      testSeed = Number.isFinite(seedOverride) ? seedOverride : (Number.isFinite(seedOf()) ? seedOf() : 42);
      const removal = script.pickRemoval(originalTable, kind, testSeed);
      const applied = script.applyRemoval(originalTable, removal);
      // Enter the test phase FIRST: every host seam below (clearTable/place/connect) gates on
      // tutorialActive(), so the mode must already say so.
      safeFloor(() => floor.resetTutorialInteraction && floor.resetTutorialInteraction());
      phase = 'tutorial-test';
      setPhase('tutorial-test');
      panel.hideAll();
      clearTileMarks();
      hideSlot();
      hideAnchors();
      clearMarks();
      renderPruned(applied.table);
      testTarget = targetTableFrom(originalTable, applied.removed);
      testResult = null;
      submitted = false;
      tutorialState.removed = clonePlain(applied.removed);
      tutorialState.score = null;
      tutorialState.missing = [];
      tutorialState.wrong = [];
      tutorialState.extra = [];
      steps = [];
      stepCount = steps.length;
      stepIndex = 0;
      nextVisible = false;
      dimmed = false;
      locked = false;
      armed = false;
      anchorFrom = null;
      anchorTo = null;
      safeFloor(() => floor.setTutorialFocus && floor.setTutorialFocus(null));
      report();
      showTestBar();
      status('');
      currentSlotRect = null;
      down = null; connDown = null;
      return true;
    }

    /**
     * Submit: compare the complete graph, using the removed set as the scoring denominator, and mark
     * every error on the canvas. The score is session-only — never persisted, never identifies the
     * child.
     * @returns {boolean} whether a score was produced
     */
    function submitTest() {
      if (!active || phase !== 'tutorial-test') return false;
      if (!scoreLib || typeof scoreLib.score !== 'function' || !testTarget) return false;
      const live = tableOf ? safeFloor(tableOf) : null;
      if (!live) return false;
      const result = scoreLib.score(originalTable, live, TEST_WEIGHTS, testTarget);
      testResult = result;
      submitted = true;
      everSubmitted = true;
      tutorialState.score = result.score;
      tutorialState.missing = clonePlain(result.missing);
      tutorialState.wrong = clonePlain(result.wrong);
      tutorialState.extra = clonePlain(result.extra);
      endOfParts();
      hideAnchors();
      panel.highlightRect(null);
      status('');
      markErrors(result);
      showTestBar();
      report();
      return true;
    }

    /** Retry: re-roll the seed (D10) and re-enter with a fresh removal. */
    function retryTest() {
      if (!active || phase !== 'tutorial-test') return false;
      return beginTest((Number.isFinite(testSeed) ? testSeed : 42) + 1);
    }

    /** The test bar's Exit and Return are the same door: leave the tutorial and restore free play
     *  byte-identically (the host owns the restore; `exit()` alone is the fallback). */
    function leaveToFreePlay() {
      if (exitToFreePlay) { try { exitToFreePlay(); return; } catch (e) { /* fall through */ } }
      exit();
    }

    /** Build the test control bar once: Exit (always), Submit (before a result), Retry + Return
     *  (once a result has been shown), and the score readout. Real buttons on the decorative layer
     *  (inline pointer-events beat the layer's blanket `none`). */
    function ensureTestBar() {
      if (testBar) return testBar;
      testBar = doc.createElement('div');
      testBar.className = 'tutorial-testbar';
      const mk = (cls, key, fn) => {
        const b = doc.createElement('button');
        b.type = 'button';
        b.className = cls;
        b.style.pointerEvents = 'auto';
        b.textContent = t(key);
        b.addEventListener('click', (ev) => {
          if (ev) { ev.preventDefault(); ev.stopPropagation(); }
          fn();
        });
        testBar.appendChild(b);
        return b;
      };
      exitBtn = mk('tutorial-exit', 'tutorial.exit', leaveToFreePlay);
      retryBtn = mk('tutorial-retry', 'tutorial.retry', retryTest);
      submitBtn = mk('tutorial-submit', 'tutorial.submit', submitTest);
      scoreEl = doc.createElement('span');
      scoreEl.className = 'tutorial-score';
      scoreEl.setAttribute('aria-live', 'polite');
      scoreEl.hidden = true;
      testBar.appendChild(scoreEl);
      const layer = panel.el && panel.el.layer;
      appRoot().appendChild(testBar);
      testBar.appendChild(panel.el.next);
      return testBar;
    }

    /** Sync the bar to the phase: Exit always; Submit until a result; Retry + Return once a result
     *  has been shown (they stay across a Retry, so the child is never trapped). */
    function showTestBar() {
      const bar = ensureTestBar();
      bar.classList.add('on');
      const inTest = phase === 'tutorial-test';
      exitBtn.hidden = false;
      submitBtn.hidden = !inTest;
      retryBtn.hidden = !(inTest && everSubmitted);
      const showScore = !!(inTest && submitted && testResult);
      scoreEl.hidden = !showScore;
      if (showScore) scoreEl.textContent = t('tutorial.score', { n: testResult.score });
    }

    function hideTestBar() { if (testBar) testBar.classList.remove('on'); }

    /** Drop every error mark (rebuilt on each submit). */
    function clearMarks() {
      for (const m of marks) { try { m.remove(); } catch (e) { /* detached */ } }
      marks = [];
    }

    /** The page rect an error mark should sit on: a part's own slot (missing/wrong) or live box
     *  (extra), or an edge's first resolvable endpoint piece. Null when nothing can be measured. */
    function rectForBucketItem(item, bucket) {
      if (!item) return null;
      if (item.kind === 'part') {
        if (bucket === 'missing') return safeFloor(() => floor.referenceRect(item.slotKey));
        return rectOf(item.actualSlotKey || item.slotKey);
      }
      const point = key => {
        const split = key.lastIndexOf(':');
        const id = key.slice(0, split), port = key.slice(split + 1);
        return safeFloor(() => floor.screenPointFor(id, port)) || safeFloor(() => floor.referencePoint(id, port)) || (() => {
          const r = safeFloor(() => floor.referenceRect(id));
          return r && rectCenter(r);
        })();
      };
      const a = point(item.actualFrom || item.from), b = point(item.actualTo || item.to);
      if (!a && !b) return null;
      const c = a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : a || b;
      return { x: c.x - 22, y: c.y - 22, w: 44, h: 44 };
    }

    function syncGeometry() {
      if (!active) return;
      const canvas = canvasRect();
      if (canvas) panel.el.layer.style.clipPath = `inset(${canvas.top}px ${Math.max(0, window.innerWidth - canvas.right)}px ${Math.max(0, window.innerHeight - canvas.bottom)}px ${canvas.left}px)`;
      if (phase === 'tutorial-test') {
        for (const mark of marks) {
          const r = rectForBucketItem(mark._item, mark._bucket);
          mark.hidden = !r;
          if (r) place(mark, { left: r.x, top: r.y, w: r.w, h: r.h });
        }
        return;
      }
      if (!guidedPhase()) return;
      const step = steps[stepIndex];
      if (!step) return;
      if (step.phase === 'part') {
        const r = rectOf(step.pieceId);
        if (r) { currentSlotRect = r; panel.highlightRect(r, { pad: 0, label: t('block.' + step.type) }); showSlot(r, step); }
      } else {
        const a = anchorPointOf(anchorFrom), b = anchorPointOf(anchorTo);
        if (a && b) { showAnchors(step, a, b); markAnchorArmed(armed); }
      }
    }

    /** The block's own existing name is a part mark's text cue (never new copy). Edges get none. */
    function bucketLabel(item) {
      if (!item || item.kind !== 'part') return '';
      const type = item.type || (item.expected && item.expected.type);
      return type ? t('block.' + type) : '';
    }

    /**
     * Mark the errors on the canvas. Colour is NEVER the only cue: each bucket carries its own
     * SHAPE (missing = dashed ring with a hollow square, wrong = solid ring with a cross, extra =
     * dotted ring with a filled dot) plus, for parts, the block's own name. Static — no animation,
     * so it adds nothing to the flash budget.
     * @param {{missing:Array, wrong:Array, extra:Array}} result the scorer's buckets
     */
    function markErrors(result) {
      clearMarks();
      const layer = panel.el && panel.el.layer;
      if (!layer) return;
      const specs = [];
      const push = (item, kind) => {
        const rect = rectForBucketItem(item, kind);
        if (rect) specs.push({ rect: rect, kind: kind, item, label: bucketLabel(item) });
      };
      for (const m of (result.missing || [])) push(m, m.kind === 'part' ? 'missing' : 'missing-edge');
      for (const w of (result.wrong || [])) push(w, 'wrong');
      for (const e of (result.extra || [])) push(e, e.kind === 'part' ? 'extra' : 'extra-edge');
      for (const sp of specs) {
        const box = sp.rect;
        const mark = doc.createElement('div');
        mark._item = sp.item; mark._bucket = sp.kind;
        mark.className = 'tutorial-mark tutorial-mark-' + sp.kind;
        mark.setAttribute('role', 'img');
        if (sp.label) mark.setAttribute('aria-label', sp.label);
        mark.style.left = Math.round(box.x) + 'px';
        mark.style.top = Math.round(box.y) + 'px';
        mark.style.width = Math.round(Math.max(MIN_TARGET, box.w)) + 'px';
        mark.style.height = Math.round(Math.max(MIN_TARGET, box.h)) + 'px';
        if (sp.label) {
          const lab = doc.createElement('span');
          lab.className = 'tutorial-mark-label';
          lab.textContent = sp.label;
          mark.appendChild(lab);
        }
        layer.appendChild(mark);
        marks.push(mark);
      }
    }

    /** Accept the current part: clone the EXACT example piece (D6 — never a bare defaultBlock),
     *  say its purpose (the existing man.<type>.what copy), then light the next step. The purpose is
     *  the persistent status line, so the next guide is armed the same tick — no dead window. */
    function acceptPart(step) {
      const example = pieceById[step.pieceId];
      if (!example) return false;
      const placedId = placePiece(JSON.parse(JSON.stringify(example)));
      if (!placedId) return false;
      placedIds.push(placedId);
      safeFloor(() => floor.setTutorialFocus && floor.setTutorialFocus(placedIds.slice()));
      status(t(step.textKey));
      stepIndex += 1;
      nextVisible = false;
      dimmed = false;
      report();
      showCurrent();
      return true;
    }

    /** The blinking Next's own handler: a press inside the 2 s lock is deliberately ignored. */
    function onNext() { if (locked) return; advance(); }

    /**
     * The frozen seam's Next. In preview it clears the floor and starts the guided build; T10 extends
     * it for the connection phases and the completion reveal.
     * @returns {boolean} whether the tutorial moved.
     */
    function advance() {
      if (!active) return false;
      if (phase === 'tutorial-preview') {
        if (lockTimer) { window.clearTimeout(lockTimer); lockTimer = null; }
        if (idleTimer) { window.clearTimeout(idleTimer); idleTimer = null; }
        locked = false;
        showLockBadge(false);
        panel.hideAll();
        dimmed = false;
        clearTileMarks();
        hideSlot();
        if (!hideAll()) return false;
        phase = 'tutorial-build';
        setPhase('tutorial-build');
        stepIndex = 0;
        nextVisible = false;
        report();
        showCurrent();
        return true;
      }
      // T11: the revealed Test-yourself key is the build's own Next — the frozen seam starts the
      // test the same way a press does (via the host hook, or directly when none is wired).
      if (phase === 'tutorial-build' && testRevealed) {
        if (startTest) { try { return !!startTest(); } catch (e) { return false; } }
        return beginTest();
      }
      return false;
    }

    /**
     * The frozen seam's "do the current step for me", for ANY phase: a part step places the exact
     * example piece (D6 props), a snap/wire step applies its exact edge. Always advances on success.
     * @returns {boolean} whether a step was performed.
     */
    function placeCurrent() {
      if (!active || !guidedPhase()) return false;
      const step = steps[stepIndex];
      if (!step) return false;
      if (step.phase === 'part') return acceptPart(step);
      if (step.phase === 'snap' || step.phase === 'wire') return acceptConnection(step);
      return false;
    }

    /** A pristine example is on the floor (T6 loaded it). Start preview: lock, blinking Next, and the
     *  idle-dim if Next goes unpressed. @returns {boolean} */
    function enter(k, table) {
      if (active) return false;
      if (!script || typeof script.buildSteps !== 'function') return false;
      active = true;
      kind = k;
      steps = script.buildSteps(table, k) || [];
      stepCount = steps.length;
      // The answer key for T10's completion match: the pristine example captured BY VALUE before the
      // host's CLEAR empties the live table. Never a live reference — the host mutates state.table.
      originalTable = table ? JSON.parse(JSON.stringify(table)) : null;
      // T11: a fresh tutorial starts with no test state; the bar shows only Exit until the build is
      // done and the child presses Test yourself.
      testSeed = null; testTarget = null; testResult = null;
      submitted = false; everSubmitted = false; testRevealed = false;
      clearMarks();
      tutorialState.removed = { parts: [], snaps: [], wires: [] };
      tutorialState.score = null;
      tutorialState.missing = []; tutorialState.wrong = []; tutorialState.extra = [];
      anchorFrom = null;
      anchorTo = null;
      connDown = null;
      hideAnchors();
      pieceById = {};
      for (const p of ((table && table.pieces) || [])) pieceById[p.id] = p;
      placedIds = [];
      stepIndex = 0;
      nextVisible = true;
      dimmed = false;
      locked = true;
      armed = false;
      phase = 'tutorial-preview';
      appRoot().classList.add('tutorial-active');
      showTestBar();
      safeFloor(() => floor.paintNow && floor.paintNow());
      safeFloor(() => floor.captureTutorialReference && floor.captureTutorialReference());
      safeFloor(() => floor.setTutorialGeometry && floor.setTutorialGeometry(syncGeometry));
      bind();
      setPhase('tutorial-preview');
      panel.dimOthers(false);
      panel.highlightRect(null);
      panel.nextButton({ label: t('tutorial.next'), onClick: onNext, blink: true });
      showLockBadge(true);
      showTestBar();
      report();
      if (lockTimer) { window.clearTimeout(lockTimer); lockTimer = null; }
      if (idleTimer) { window.clearTimeout(idleTimer); idleTimer = null; }
      lockTimer = window.setTimeout(() => {
        lockTimer = null;
        if (!active || phase !== 'tutorial-preview') return;
        locked = false;
        showLockBadge(false);
        report();
        idleTimer = window.setTimeout(() => {
          idleTimer = null;
          if (!active || phase !== 'tutorial-preview') return;
          dimmed = true;
          report();
          // Spotlight the Next key: with a target rect the dim becomes a hole around it, so the one
          // live control is the one lit thing on screen (and the ring carries the shape cue too).
          const nb = panel.el && panel.el.next;
          const nr = (nb && nb.getBoundingClientRect) ? nb.getBoundingClientRect() : null;
          if (nr && nr.width && nr.height) {
            panel.highlightRect({ x: nr.left, y: nr.top, w: nr.width, h: nr.height }, { pad: 12, pulse: false });
          }
          panel.dimOthers(true);
        }, idleMs);
      }, lockMs);
      return true;
    }

    /** Tear every overlay and timer down; the host restores free play right after. @returns {boolean} */
    function exit() {
      if (lockTimer) { window.clearTimeout(lockTimer); lockTimer = null; }
      if (idleTimer) { window.clearTimeout(idleTimer); idleTimer = null; }
      if (!active) { panel.hideAll(); hideAnchors(); return false; }
      active = false;
      safeFloor(() => floor.resetTutorialInteraction && floor.resetTutorialInteraction());
      safeFloor(() => floor.setTutorialGeometry && floor.setTutorialGeometry(null));
      safeFloor(() => floor.clearTutorialReference && floor.clearTutorialReference());
      locked = false;
      showLockBadge(false);
      appRoot().classList.remove('tutorial-active');
      panel.hideAll();
      clearTileMarks();
      hideSlot();
      hideAnchors();
      currentSlotRect = null;
      safeFloor(() => floor.setTutorialFocus && floor.setTutorialFocus(null));
      down = null;
      connDown = null;
      dropHandled = false;
      armed = false;
      anchorFrom = null;
      anchorTo = null;
      originalTable = null;
      clearMarks();
      hideTestBar();
      testSeed = null; testTarget = null; testResult = null;
      submitted = false; everSubmitted = false; testRevealed = false;
      tutorialState.removed = { parts: [], snaps: [], wires: [] };
      tutorialState.score = null;
      tutorialState.missing = []; tutorialState.wrong = []; tutorialState.extra = [];
      steps = []; stepCount = 0; stepIndex = 0;
      phase = 'none';
      stepIndex = 0;
      nextVisible = false;
      dimmed = false;
      report();
      return true;
    }

    /** The controller's own observable state (the global debug seam is the host's tutorialDebug). */
    function debug() {
      const step = steps[stepIndex];
      return {
        active: active, kind: kind, phase: phase,
        stepIndex: stepIndex, stepCount: stepCount,
        nextVisible: nextVisible, dimmed: dimmed, locked: locked, lockMs: lockMs,
        armed: armed, stepType: (step && step.type) || null, stepPhase: (step && step.phase) || null,
        connectFrom: anchorFrom ? anchorFrom.id + ':' + anchorFrom.port : null,
        connectTo: anchorTo ? anchorTo.id + ':' + anchorTo.port : null,
        testRevealed: testRevealed, submitted: submitted, testSeed: testSeed,
        hiddenCount: hiddenCountOf ? hiddenCountOf() : 0,
        revealedCount: revealedCountOf ? revealedCountOf() : 0,
      };
    }

    // --- input interception: the drag's release and the shelf tap both feed the same acceptance ---
    /** Tap path, half one: tapping/pressing the source anchor arms the connection (dashed → solid). */
    function onAnchorFrom(ev) {
      if (ev) { ev.preventDefault(); ev.stopPropagation(); }
      if (!active || !guidedPhase() || dropHandled) return;
      const step = steps[stepIndex];
      if (!step || (step.phase !== 'snap' && step.phase !== 'wire')) return;
      armed = true;
      markAnchorArmed(true);
      const pt = anchorPointOf(anchorFrom);
      if (pt) safeFloor(() => floor.setTutorialLead && floor.setTutorialLead({ ...anchorFrom, ...pt }));
      status(t(step.textKey));
    }
    /** Tap path, half two: the target anchor completes the step — only after the source was armed,
     *  and only the step's exact edge is ever applied (a wrong port can never be reached this way). */
    function onAnchorTo(ev) {
      if (ev) { ev.preventDefault(); ev.stopPropagation(); }
      if (!active || !guidedPhase() || dropHandled) return;
      const step = steps[stepIndex];
      if (!step || (step.phase !== 'snap' && step.phase !== 'wire')) return;
      if (!armed) { status(t(step.textKey)); return; } // the source must be tapped first
      acceptConnection(step);
    }
    function onPointerDown(ev) {
      dropHandled = false;
      down = null;
      connDown = null;
      if (!active || !guidedPhase()) return;
      const elem = ev.target;
      const step = steps[stepIndex];
      if (step && (step.phase === 'snap' || step.phase === 'wire')
        && elem && elem.closest && elem.closest('.tutorial-anchor-from')) {
        connDown = { x: ev.clientX, y: ev.clientY };
        onAnchorFrom(null); // a press on the source arms it, exactly like the tap
        return;
      }
      const tile = elem && elem.closest ? elem.closest('.shelfobj') : null;
      if (tile) down = { type: tile.dataset.type || null, x: ev.clientX, y: ev.clientY };
    }
    function onPointerCancel() {
      down = null; connDown = null; armed = false;
      markAnchorArmed(false);
      safeFloor(() => floor.setTutorialLead && floor.setTutorialLead(null));
    }
    function onPointerMove(ev) {
      if (!active || !guidedPhase() || !armed || !anchorFrom) return;
      safeFloor(() => floor.setTutorialLead && floor.setTutorialLead({ ...anchorFrom, x: ev.clientX, y: ev.clientY }));
    }
    function onPointerUp(ev) {
      const d = down;
      const cd = connDown;
      down = null;
      connDown = null;
      if (!active || !guidedPhase()) return;
      const step = steps[stepIndex];
      if (cd && step && (step.phase === 'snap' || step.phase === 'wire')) {
        const travelled = Math.hypot(ev.clientX - cd.x, ev.clientY - cd.y) >= DRAG_PX;
        // Source was armed on pointerdown. Consume its synthetic click so an
        // overlapping destination cannot complete the wire on that same tap.
        dropHandled = true;
        if (!travelled) return;
        const toEl = anchors && anchors.to;
        const c = toEl ? elCenter(toEl) : null;
        if (c && Math.hypot(ev.clientX - c.x, ev.clientY - c.y) <= dropRadius) acceptConnection(step);
        else { onPointerCancel(); status(t('hint.link.bad')); } // wrong port: nothing connected — say so, do not advance
        return;
      }
      if (!d) return;
      if (!step || step.phase !== 'part') return;
      const moved = Math.hypot(ev.clientX - d.x, ev.clientY - d.y) >= DRAG_PX;
      if (!moved) return; // a tap: the click path owns it
      dropHandled = true;
      if (d.type !== step.type) { status(t('floor.liftOff')); return; }
      const slot = currentSlotRect;
      if (!slot) return;
      const c = rectCenter(slot);
      if (Math.hypot(ev.clientX - c.x, ev.clientY - c.y) <= dropRadius) acceptPart(step);
      else status(t('floor.liftOff')); // wrong spot: nothing was placed — bounce, say so, do not advance
    }
    function onClickCapture(ev) {
      if (!active || !guidedPhase()) return;
      if (dropHandled) {
        dropHandled = false;
        if (ev.detail) { ev.preventDefault(); ev.stopImmediatePropagation(); return; }
      }
      const step = steps[stepIndex];
      if (!step || step.phase !== 'part') return;
      const elem = ev.target;
      const tile = elem && elem.closest ? elem.closest('.shelfobj') : null;
      if (!tile) return;
      if (tile.dataset.type === step.type) {
        armed = true;
        markTile(step.type);
        status(t(step.textKey)); // the purpose, said on pick-up (the existing man.<type>.what copy)
      }
    }
    /** T12: Escape is the keyboard twin of the Exit key — the always-available door. It fires in
     *  every phase (preview, build, test) because a keyboard child must never be trapped; when no
     *  tutorial is active it does nothing, so every other overlay keeps its own Escape behaviour. */
    function onKeydown(ev) {
      if (!active) return;
      if (ev.key !== 'Escape' && ev.key !== 'Esc') return;
      if (phase === 'tutorial-test' && safeFloor(() => floor.debug().mode.kind) === 'cable') return;
      ev.preventDefault();
      if (armed && anchorFrom) { onPointerCancel(); return; }
      leaveToFreePlay();
    }
    function bind() {
      if (bound) return;
      bound = true;
      doc.addEventListener('pointerdown', onPointerDown, true);
      doc.addEventListener('pointermove', onPointerMove, true);
      doc.addEventListener('pointerup', onPointerUp, true);
      doc.addEventListener('pointercancel', onPointerCancel, true);
      doc.addEventListener('click', onClickCapture, true);
      // Capture phase: the Exit/Escape door must win over decorative Escape handlers while a tutorial
      // is up (it no-ops when none is active, so all other Escape routes are untouched).
      doc.addEventListener('keydown', onKeydown, true);
    }

    return { enter: enter, exit: exit, advance: advance, placeCurrent: placeCurrent, debug: debug,
      submit: submitTest, beginTest: beginTest };
  }

  const WorkshopTutorial = {
    create: create, createController: createController,
    NEXT_FADE_MS: NEXT_FADE_MS, MIN_TARGET: MIN_TARGET,
    LOCK_MS: LOCK_MS, IDLE_MS: IDLE_MS, DROP_RADIUS: DROP_RADIUS,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = WorkshopTutorial;
  if (typeof window !== 'undefined') window.WorkshopTutorial = WorkshopTutorial;
})();
