'use strict';
/**
 * brick-panel.js — a sealed part's OWN SMALL FLOOR (composing-arc "make your own part", task 6;
 * spec §8: "nothing invisible / own small floor / live innards / face shows name+ports"). Tapping
 * the porthole on a placed brick's own face (floor.js's tap router, `isBrickFaceTap`) opens this
 * over the Floor: the def's own pieces, laid out by the SAME `logic/floor-layout.js` the main
 * floor uses, drawn with the SAME `floor-art.js`, LIVE while a run is up — a crate riding through
 * the sealed part is exactly as visible in here as it would have been had the part never been
 * sealed at all.
 *
 * NOT A VIEW MODE (the same law brain-panel.js/board-panel.js state): it opens OVER the Floor,
 * into the same host `WorkshopFloor.mount` already owns, and closes back to live.
 *
 * NEVER reaches into game.js. Ruling R (carried over from brain-panel.js/board-panel.js): every
 * fact this file needs — the def itself, the part's own name, whether a run is up, a def piece's
 * own run-state, which crates ride inside it, a def-internal wire's own glow — arrives as `deps`,
 * closures floor.js's own `openBrickPanel` assembles over its bridge + this file's own `liveFor`.
 * `deps` DOES reach for `window.WorkshopFloorLayout`/`window.WorkshopFloorArt` directly (the same
 * two pure/DOM-drawing modules floor.js itself reads) — that is the "own small floor" the spec
 * asks for, not a peek into game.js.
 *
 * READ-ONLY v1 (the brief's own scope): no plate, no edits from inside. Every tap on a piece
 * SPEAKS instead of acting (fix round 1, MINOR 5 — dead-controls law: this canvas draws real,
 * working-looking art, a gate/track/sense as operable-looking as the main floor's own, and a
 * silent no-op on it would be a control that looks like it does something and does nothing) — a
 * nested brick (a part sealed inside this one) speaks `brick.nested.hint` rather than drilling a
 * second layer deep into a panel that is itself read-only; every other inner piece speaks
 * `brick.sealed.hint` (its own contents are reachable only by Unpack, on the floor). Off-run, the
 * innards show their IDLE faces — the same honest law the main floor already keeps for a stopped
 * machine (liveFor's own `running:false` base object flows straight through; nothing here invents
 * a second "stopped" picture).
 *
 * Deliberately SIMPLER than the main floor's own paint(): a read-only view has no sockets to grab,
 * no marquee to draw, no selection ring, no pan/zoom — belts (`plan.links`), signal cables
 * (`plan.cables`), the blocks themselves (`Art.draw`), and crates in flight (`Art.crate`) are the
 * whole picture, which is everything a child watching it run actually needs to see.
 */
(function () {
  // ---------------------------------------------------------------------------------------------
  // The DOM shell. Everything below touches `document`/`window` and is exercised only by the
  // browser suite (tests/brick-panel-browser.test.js) — this file has no pure logic of its own to
  // export; `cratePos` (where a crate paints) moved into `logic/floor-layout.js` (fix round 1,
  // MINOR 2 — this file and floor.js's own crate loop had grown a byte-identical, untested copy
  // each; both now call the ONE function, pinned by its own direct test there).
  // ---------------------------------------------------------------------------------------------
  const Layout = () => (typeof window !== 'undefined' ? window.WorkshopFloorLayout : null);
  const Art = () => (typeof window !== 'undefined' ? window.WorkshopFloorArt : null);
  const WIRE_TOL = 14; // fingertip tolerance for an inner cable, same as the main floor's

  let root = null;          // the overlay's own DOM root, appended into the host open() was given
  let brickId = null;       // which brick piece this panel is showing
  let panelDeps = null;     // Ruling R's deps
  let plan = null;          // the LAST floorPlan() computed from the def's own table
  let raf = null;
  let previousFocus = null; // what had focus before open() — restored on close()
  const t0 = () => (typeof performance !== 'undefined' ? performance.now() : 0);

  let closeBtn = null, titleEl = null, captionEl = null, canvasEl = null, canvasWrap = null;

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
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }

  /** Match the canvas's backing store to `canvasWrap`'s own box — board-panel.js's own fix (a
   *  canvas percentage-sized against an indefinite ancestor feeds back into its own attribute
   *  height forever); `canvasWrap` is the SAME dedicated, absolutely-positioned-child wrapper
   *  that fix introduced, so the loop cannot exist here either. */
  function fitCanvas() {
    if (!canvasEl || !canvasWrap) return;
    const w = Math.max(240, Math.floor(canvasWrap.clientWidth));
    const h = Math.max(180, Math.floor(canvasWrap.clientHeight));
    if (canvasEl.width !== w || canvasEl.height !== h) {
      canvasEl.width = w; canvasEl.height = h;
      plan = null; // the layout itself depends on {w,h} — force a fresh floorPlan() next paint
    }
  }

  /** The def's own {pieces, snaps, wires} table — READ-ONLY, so this is fetched fresh every call
   *  rather than cached at open() (a def cannot change while its own plate is closed, but reading
   *  it live costs nothing and matches every other panel's own "never stale-cache the machine"
   *  law). Returns null if the brick vanished from under this panel (deleted from elsewhere). */
  function defTable() {
    const def = safeCall(panelDeps.def);
    if (!def || !Array.isArray(def.pieces)) return null;
    return { pieces: def.pieces, snaps: def.snaps || [], wires: def.wires || [] };
  }

  function rebuildPlan() {
    const L = Layout();
    const table = defTable();
    if (!L || !table || !canvasEl) { plan = null; return; }
    // FIX ROUND 3, F1: `board: false` opts this FIT-TO-VIEW floor out of the big board's 2.5x
    // world floor (floor-layout.js's own `worldW`, at its declaration) — this panel never pans, it
    // shrinks the whole picture to fit (fitScale, below), so a wider-than-necessary world only ever
    // pushed that scale down toward its own saturated floor (measured: 0.4, a quartered picture)
    // for no reason. Never leave this off — the main Floor is the one caller that needs the board.
    plan = L.floorPlan(table, { w: canvasEl.width, h: canvasEl.height, ports: panelDeps.ports, board: false });
  }

  /**
   * FIT-TO-VIEW, never pan. The main floor's own `floorPlan` is allowed to grow the WORLD past
   * the room it was given (floor-layout.js's own FIT_MIN floor: a block never shrinks below a
   * readable size, so a machine that does not fit at that floor simply grows past the window
   * instead) — the main floor answers that by panning. This panel has no pan (there is no
   * affordance for one on an already-small overlay, and "own SMALL floor" never promised a
   * scrollable one), so instead the WHOLE picture is scaled to fit the canvas it was drawn at —
   * shrinking only (never enlarging past native size, which would just blur/blockify the art for
   * no legibility gain on an already-small machine). `objectAt`/`onCanvasTap` divide by the SAME
   * factor before hit-testing, so a tap can never disagree with what is drawn at any scale.
   * @returns {number} in (0, 1]
   */
  function fitScale() {
    if (!plan || !plan.world || !canvasEl) return 1;
    return Math.max(0.01, Math.min(1, canvasEl.width / plan.world.w, canvasEl.height / plan.world.h));
  }

  /** Which object (x, y) lands on, in the panel's OWN canvas px — same hit-test the main floor
   *  itself uses, over this panel's own `plan.objects`, corrected for `fitScale()`. */
  function objectAt(x, y) {
    const L = Layout();
    if (!L || !plan) return null;
    const s = fitScale();
    return L.objectAt(plan.objects, x / s, y / s);
  }

  let selectedWire = null;
  /**
   * The polyline this panel actually DRAWS for a cable. `plan.cables` carries the main floor's
   * wall-rail tray, but paint() here calls cable() with no tray — its own default (min(end.y)-30) —
   * so hit-testing and the highlight must use THAT shape or they would disagree with the ink.
   * @param {{from:{x:number,y:number}, to:{x:number,y:number}}} c
   * @returns {Array<{x:number,y:number}>}
   */
  function wirePts(c) {
    const tray = Math.min(c.from.y, c.to.y) - 30;
    return [c.from, { x: c.from.x, y: tray }, { x: c.to.x, y: tray }, c.to];
  }
  /** The inner cable under a panel-canvas point, in the panel's own px (corrected for fitScale).
   *  The tolerance is divided by the same scale: the finger's reach is 14 SCREEN px, and the
   *  geometry is measured in room px — unscaled, a 0.3x fit would shrink the effective grab band
   *  to ~4 px and an inner cable would be all but untappable. */
  function wireAt(x, y) {
    const L = Layout();
    if (!L || !plan || !L.wireAt) return null;
    const s = fitScale();
    const geoms = (plan.cables || []).map((c) => {
      const pts = wirePts(c);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of pts) {
        if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
        if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
      }
      return { id: c.index, from: c.from, to: c.to, geom: { pts, aabb: { x0, y0, x1, y1 } } };
    });
    return L.wireAt(geoms, x / s, y / s, WIRE_TOL / s);
  }

  /**
   * A tap on the panel's OWN small floor. READ-ONLY (no plate, no edits) — but fix round 1, MINOR
   * 5 (dead-controls law): every inner piece here is real, working art (a gate, a track, a sense)
   * that LOOKS exactly as operable as it does on the main floor, so a silent no-op on it is a
   * control that looks like it does something and does nothing — the defect class this workshop
   * has already paid for once. Every tap that lands on a piece now speaks an honest sentence: the
   * nested-brick case (brick.nested.hint) when the piece IS itself a sealed part, else the sealed
   * case (brick.sealed.hint) — this box's own contents can only be reached by Unpack, on the
   * floor, never from in here. A tap on empty space inside the canvas stays a true no-op (there is
   * nothing there to be honest ABOUT).
   */
  function onCanvasTap(ev) {
    const r = canvasEl.getBoundingClientRect();
    const x = (ev.clientX - r.left) * (canvasEl.width / r.width);
    const y = (ev.clientY - r.top) * (canvasEl.height / r.height);
    const w = wireAt(x, y);
    if (w) {
      selectedWire = w.id;
      const oa = plan.objects[w.from.id], ob = plan.objects[w.to.id];
      safeCall(panelDeps.status, tOf('brick.wire.hint', {
        a: oa ? oa.name : w.from.port, b: ob ? ob.name : w.to.port,
      }));
      paint(t0());
      return;
    }
    if (selectedWire !== null) { selectedWire = null; paint(t0()); }
    const o = objectAt(x, y);
    if (!o) return;
    safeCall(panelDeps.status, tOf(o.type === 'brick' ? 'brick.nested.hint' : 'brick.sealed.hint'));
  }

  // Test seam (mirrors floor.js's own `painted`): what the LAST paint() actually drew — a
  // headless drive can prove a crate mid-brick painted here without reading raw canvas pixels.
  let painted = { objects: 0, crates: 0 };
  // Test seam (mirrors floor.js's own `lastLive`, final whole-branch review I1): the live state
  // `deps.innerLive` handed back for each def piece on the LAST paint — a headless drive can
  // prove whether an inner block drew dimmed/live without reading raw canvas pixels.
  let lastLive = {};

  /** Paint one frame: links (belt couplings), cables (signal wires, lit through deps.wireLit),
   *  every block (Art.draw, live state from deps.innerLive), then crates riding through it
   *  (deps.innerCrates, already stripped to this brick's own def ids). */
  function paint(t) {
    if (!canvasEl) return;
    fitCanvas();
    if (!plan) rebuildPlan();
    const ctx = canvasEl.getContext('2d');
    const A = Art();
    ctx.fillStyle = '#0b0d12';
    ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);
    painted = { objects: 0, crates: 0 };
    lastLive = {};
    if (!plan || !A) return;

    // FIT-TO-VIEW (see fitScale's own doc): the whole picture is drawn in WORLD coordinates
    // (exactly what plan.objects/links/cables already carry) inside one uniform ctx.scale — never
    // a per-call recompute, so a machine bigger than this panel's own canvas still shows in full,
    // shrunk, rather than clipping or silently needing a pan this overlay does not have.
    ctx.save();
    const s = fitScale();
    ctx.scale(s, s);

    for (const l of plan.links || []) A.link(ctx, l.a, l.b);
    // `tray` omitted on purpose — cable() defaults it to Math.min(from.y,to.y)-30, exactly the
    // shape a two-block signal wire wants; the main floor's own wall-rail tray lane exists for a
    // ROOM with many parallel cables sharing one strip, which a sealed part's own small floor
    // never needs (Task 6's own def has, at most, a handful of internal wires).
    for (const c of plan.cables || []) {
      A.cable(ctx, c.from, c.to, !!safeCall(panelDeps.wireLit, c.index));
      if (selectedWire === c.index && A.wireSelected) {
        const oa = plan.objects[c.from.id], ob = plan.objects[c.to.id];
        A.wireSelected(ctx, wirePts(c), oa ? oa.name : c.from.port, ob ? ob.name : c.to.port);
      }
    }

    const objs = Object.keys(plan.objects).map((id) => plan.objects[id]);
    const draw = (o) => { const live = safeCall(panelDeps.innerLive, o.id) || {}; lastLive[o.id] = live; A.draw(ctx, o, live, t); painted.objects++; };
    objs.filter((o) => o.kind === 'track').forEach(draw);
    objs.filter((o) => o.kind !== 'track' && !o.over).forEach(draw);
    const crates = safeCall(panelDeps.innerCrates) || [];
    const L = Layout();
    for (const c of crates) {
      const o = plan.objects[c.pieceId];
      if (!o || !L) continue; // a crate whose pieceId has no plan object here — same silent skip law
      const pos = L.cratePos(o, c.progress);
      A.crate(ctx, pos.x, pos.y, c.item, t, { thumbOf: panelDeps.thumbOf });
      painted.crates++;
    }
    objs.filter((o) => o.over).forEach(draw);
    ctx.restore();
  }

  function loopTick(now) {
    raf = null;
    if (!root) return;
    updateChrome();
    paint(now || t0());
    raf = requestAnimationFrame(loopTick);
  }
  function startLoop() { if (!raf) raf = requestAnimationFrame(loopTick); }
  function stopLoop() { if (raf) cancelAnimationFrame(raf); raf = null; }

  /** The chrome that is TEXT, not canvas ink — the heading (carries the part's own name) and the
   *  honest running/idle caption. Mutates existing nodes only (never rebuilds), same law every
   *  other panel here already keeps. */
  function updateChrome() {
    const name = safeCall(panelDeps.name) || tOf('block.brick');
    const heading = tOf('brick.panel.heading', { name });
    if (titleEl.textContent !== heading) titleEl.textContent = heading;
    const aria = tOf('brick.panel.aria', { name });
    if (root.getAttribute('aria-label') !== aria) root.setAttribute('aria-label', aria);
    const running = !!safeCall(panelDeps.running);
    const caption = tOf(running ? 'brick.panel.running' : 'brick.panel.idle');
    if (captionEl.textContent !== caption) captionEl.textContent = caption;
  }

  function onResize() { plan = null; selectedWire = null; }

  function buildShell() {
    root = document.createElement('div');
    root.className = 'brickpanel';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.tabIndex = -1;
    root.addEventListener('keydown', onTrapKey);

    const head = el('div', 'bkhead');
    titleEl = el('h2', 'bktitle', '');
    head.appendChild(titleEl);
    closeBtn = el('button', 'bkclose', tOf('panel.close'));
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', tOf('panel.close'));
    closeBtn.addEventListener('click', close);
    head.appendChild(closeBtn);
    root.appendChild(head);

    captionEl = el('div', 'bkcaption', '');
    root.appendChild(captionEl);

    canvasWrap = el('div', 'bkcanvaswrap');
    root.appendChild(canvasWrap);
    canvasEl = document.createElement('canvas');
    canvasEl.width = 640; canvasEl.height = 400;
    canvasEl.className = 'bkcanvas';
    canvasEl.addEventListener('pointerdown', onCanvasTap);
    canvasWrap.appendChild(canvasEl);
  }

  /** Tab-trap — the same WAI-ARIA APG dialog idiom every panel here keeps (this one has exactly
   *  ONE focusable control, but the trap costs nothing to keep uniform and future-proofs it
   *  against ever growing a second). */
  function onTrapKey(ev) {
    if (ev.key !== 'Tab' || !root) return;
    const nodes = root.querySelectorAll('button, select, input, [tabindex]:not([tabindex="-1"])');
    const focusables = [];
    for (let i = 0; i < nodes.length; i++) { const n = nodes[i]; if (!n.disabled && !n.hidden) focusables.push(n); }
    if (!focusables.length) return;
    const first = focusables[0], last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (ev.shiftKey) { if (active === first || !root.contains(active)) { ev.preventDefault(); last.focus(); } }
    else { if (active === last || !root.contains(active)) { ev.preventDefault(); first.focus(); } }
  }

  /**
   * Open the brick's own small floor over `host` (the same container the Floor renders into).
   * @param {HTMLElement} host
   * @param {string} id  the brick piece's id
   * @param {{t:Function, words:object, name:Function, def:Function, running:Function,
   *   ports:object, thumbOf:Function, status:Function, innerLive:Function, innerCrates:Function,
   *   wireLit:Function}} deps  Ruling R's callbacks — the ONLY facts this file gets.
   * @param {HTMLElement} [returnFocusTo]
   */
  function open(host, id, deps, returnFocusTo) {
    if (!host || !id) return;
    close();
    brickId = id;
    panelDeps = deps || {};
    plan = null;
    previousFocus = (returnFocusTo && typeof returnFocusTo.focus === 'function') ? returnFocusTo : document.activeElement;
    buildShell();
    host.appendChild(root);
    updateChrome();
    paint(t0());
    closeBtn.focus();
    startLoop();
    if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('resize', onResize);
  }

  /** Close back to live — safe to call when nothing is open. */
  function close() {
    stopLoop();
    if (typeof window !== 'undefined' && window.removeEventListener) window.removeEventListener('resize', onResize);
    if (root && root.parentNode) root.parentNode.removeChild(root);
    const toFocus = previousFocus;
    root = null; brickId = null; panelDeps = null; plan = null; painted = { objects: 0, crates: 0 }; selectedWire = null;
    closeBtn = null; titleEl = null; captionEl = null; canvasEl = null; canvasWrap = null;
    previousFocus = null;
    if (toFocus && typeof toFocus.focus === 'function' && document.contains(toFocus)) {
      try { toFocus.focus(); } catch (e) { /* a detached or unfocusable node — nothing to do */ }
    }
  }

  /** Test seam (mirrors WorkshopFloor.debug()'s own `plan`/`painted`): which brick is showing,
   *  its OWN plan (so a headless drive can read object positions/counts without touching canvas
   *  pixels), what the LAST frame actually drew, and the fit-to-view `scale` a driver must apply
   *  to a `plan.objects[id]`'s own cx/cy before clicking it — the panel has no pan, so a machine
   *  bigger than the canvas is drawn shrunk, and a tap must be converted the SAME way `onCanvasTap`
   *  itself converts it (fitScale's own doc). */
  function debug() { return { brickId, open: !!root, plan, selectedWire, painted: Object.assign({}, painted), lastLive: Object.assign({}, lastLive), scale: fitScale() }; }

  const BrickPanel = { open, close, debug };
  if (typeof module !== 'undefined' && module.exports) module.exports = BrickPanel;
  if (typeof window !== 'undefined') window.BrickPanel = BrickPanel;
})();
