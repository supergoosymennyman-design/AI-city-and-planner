'use strict';
/**
 * floor.js — the FLOOR: the child's face of the workshop (spec 2026-08-19-workshop-floor-design.md).
 * One canvas of real objects laid out by logic/floor-layout.js from the SAME table the Blueprint
 * (card grid) edits; a picture SHELF at the bottom (tap → the object joins the machine where a
 * factory would put it); tap an object → its CONTROL PLATE (a DOM popover carrying the block's
 * own rows — dials, brain, Study, Teach, log — rendered by game.js); and CABLES for the few signal
 * wires a machine needs — every block always shows its plugs as brass nubs, and you PULL a lead
 * from one to another (press a nub, drag, release on a fitting socket or anywhere on the target
 * block). Tapping the two ends still works, and the plate keeps a Cable button + an unplug ×, so
 * the aria-hidden canvas has a DOM twin for every wiring action.
 *
 * It owns NO machine state. A bridge from game.js hands it the table, the run, the port tables,
 * add/remove/link, and the row renderers. Every child gesture becomes a table edit through the
 * bridge, so autosave, the champion file, the buddy and the Blueprint see the same machine.
 *
 * PAINTING IS ON DEMAND (task 092): logic/paint-clock.js decides on each wake whether to paint —
 * dirty (something the picture depends on changed), or an animation rate (pointer 60 · running /
 * camera feed / halo 30 · ambient 10 for 30 s, then REST) with a backoff that rests twice each
 * paint's own measured cost — so an idle hall costs nothing and a slow machine's sim is never
 * starved by its own picture (measured 09-13: 98% of the main thread at an empty idle hall, and
 * 1.8 of 10 ticks/s under a 4x CPU throttle, before this). Flash-safe periods (≥2.6 s luminance,
 * belt tread = translation); reduced motion → no RAF at all, a 400 ms repaint with the clock frozen.
 * All controls (shelf, plate) are DOM ≥44 px; the canvas is aria-hidden and every action has a
 * DOM/status-line twin.
 */
(function () {
  const Layout = window.WorkshopFloorLayout;
  const Art = window.WorkshopFloorArt;
  // THE BOARD's pure geometry (Plan 3 task 4) — chartKey only; the pixel plan itself is
  // floor-art.js's job (boardMod there), same split as Layout/Art above.
  const Board = window.WorkshopBoard;
  // WHEN to paint (task 092) — pure, tested in tests/paint-clock.test.js; see facts()/loop() below.
  const Clock = window.WorkshopPaintClock;

  let bridge = null, host = null, cvs = null, ctx = null, shelfEl = null, plateEl = null;
  let wirePlateEl = null; // the cable detail popover (plan Task 7): ports, Delete, Reconnect
  let brickShelfEl = null, chipEl = null;
  let plan = null, planKey = '';
  let tutorialReference = null, tutorialPorts = null, tutorialLead = null, tutorialGeometry = null;
  // TABLE IDENTITY (Task 2, big-board, fix round 2 — BLOCKER 1): the LAST `bridge.tableGen()` seen,
  // as of the last replan(). Task 2's first cut INFERRED a machine swap from the piece-id set
  // (disjoint = new machine), which was blind through an empty table on either side — a
  // custom→custom bring-in, or "Clear" then "Open an example," both land on an empty/near-empty
  // comparison and never re-centered (driven and reproduced: pan, clear, open an example, and the
  // view stayed put over an empty hall while the machine painted off to one side). Fix round 2
  // deletes that guess: game.js now DECLARES identity via `state.tableGen`, bumped ONLY at a
  // genuine full-table swap (setMachine, restore, Clear — never replan/pan/add/deletePiece/a buddy
  // edit/make-a-part), and this just compares against it. `null` means "nothing planned since the
  // last mount" — mount() resets it, so replan()'s very first pass after a mount always centers,
  // which is also how mount-time centering and identity-change centering end up sharing ONE
  // mechanism (see replan()'s own doc). Read by NOTHING outside replan() — module-scope only
  // because replan() itself must survive across calls to compare against.
  let lastTableGen = null;
  // FIX WAVE (2026-09-08 final review, Critical 1a): the last `bridge.running()` value seen as of
  // the last replan() call. A Run/Stop press touches no piece, so it never moves `planKey` — a
  // live chip's Make button (disabled while running, per renderChip()) would otherwise stay
  // showing whatever it rendered LAST, stuck disabled after Stop until some UNRELATED table edit
  // happened to re-render it. replan() compares against this every call (not gated behind the
  // `key === planKey` early return below, since a running flip is exactly the case where the key
  // does NOT change) and re-renders the chip on the actual flip edge only — a rare event, not a
  // per-frame cost. `null` at mount so the very first replan() never fires a false flip.
  let lastRunning = null;
  // FINAL FIX ROUND, finding 3b (spec §11's boundary): the Board's own committed chart must stop
  // painting as LIVE the instant the machine it was built from is superseded — `boardFp` is the
  // memoized `Board.fingerprint(bridge.getTable())`, recomputed only when `planKey` itself
  // changes (replan()'s own "did the table's shape change" gate, already run every frame — this
  // rides it rather than adding a second per-frame JSON.stringify). `planKey`'s own field list
  // already covers most machine-identity changes (dataset, wiring); widened below to also catch
  // brainId/senseId/fileName/row-count, which matter to fingerprint() but never to layout.
  let boardFp = '';
  let raf = null, slow = null, reduced = false;
  let wakeTimer = null;   // a pending setTimeout → RAF wake (paint clock); see schedule()
  let clock = null;       // logic/paint-clock.js state, created at mount
  let paints = 0;         // test seam: how many times paint() ran this mount (debug())
  // idle | pending {id, candidates} | cable {stage:'source'|'target', from:id, source:{id,port,dir,x,y},
  // offers:[fitting sockets], live:{x,y}|null (the finger, while a lead is being pulled),
  // hot:offer|null (where a release would plug in), moved:bool (a pull, not a press)}
  // | bar {id, handle:0|1} — dragging the Splitter's proportion bar (handle 0 divides Training
  // from Validation, 1 divides Validation from Test). Allowed WHILE RUNNING on purpose: a dial is
  // the one thing a child may change on a live machine, and setDial writes the running rig too.
  let mode = { kind: 'idle' };
  let selected = null;
  // WIRE-SELECTABLE (plan tasks 5-8): `selectedWire` is the ONE cable a tap selected (drives the
  // detail popover and its Reconnect); `pickedWires` is the marquee's group (bulk delete only).
  // Ids are the stable endpoint keys game.js's ensureWireIds assigns, so they survive a reorder.
  // Both are cleared by clearPicked() alongside the block group.
  let selectedWire = null;
  let pickedWires = [];
  // TASK 104: the ONE belt link a tap selected, by its out-plug {from, end} (an out-plug goes one
  // place, so the plug names the link). Shares the cable panel element; cleared with it.
  let selectedLink = null;
  // ---------- the marquee + the shelf of made parts (composing-arc "make your own part", task 4) ----------
  // `marquee`: the box a child is ACTIVELY dragging across empty floor (room px, {x0,y0,x1,y1} —
  // corners in DRAG order, not normalized; normMarquee() sorts them for hit-testing/painting).
  // null whenever no drag-select is in progress.
  // `picked`: the ids a marquee's own release chose (>=2 hits) — the multi-selection, DISTINCT
  // from the single `selected` above. Non-empty means picked-mode is live: every one of those
  // objects wears a halo and the action chip is showing. Cleared by ANY ordinary tap (onTap),
  // Escape, the chip's own cancel ×, or a successful make.
  // `chipMode`: what the DOM chip currently shows — 'prompt' (Make this a part / cancel) or
  // 'naming' (the name field / confirm / cancel), entered by tapping the prompt's own button.
  let marquee = null;
  let picked = [];
  let chipMode = 'prompt';
  // task 062 (spec R1/R2): picked-mode with ZERO members must be representable — the Select
  // button opens the mode before anything is picked. `selecting` is true from ANY entry
  // (button, hold, marquee) until clearPicked(); "picked-mode is live" is now
  // `picked.length || selecting`, and dropping the last member no longer ends the mode.
  let selecting = false;
  // task 062 (spec R3, prep for a later task's refusal wording): an inline note the prompt
  // chip shows below the count line when non-empty. Cleared on any membership change
  // (togglePicked) and on clearPicked — a stale refusal must not survive past the state it
  // was about.
  let chipNote = '';
  // FIX WAVE (2026-09-08 final review, finding 4): the chip's own persistent aria-live node —
  // the SAME `.chipcount` DOM element instance, kept attached across repeated PROMPT-mode
  // re-renders (togglePicked, the running-flip re-render, a real table-change re-render) so a
  // screen reader sees an in-place text mutation on a node it already knows about, not a brand
  // new node born already carrying its text (which most AT does not reliably announce). Reset to
  // null whenever the chip leaves prompt mode (naming) or goes fully hidden — renderChip() below
  // is the only place that reads or writes it.
  let chipLiveEl = null;
  // The long-press ARM: an empty-floor press might be a PAN (existing law — any real travel,
  // right away, on a room bigger than the window), a MARQUEE, or a plain miss. A tablet has no
  // modifier key to tell "pan" from "drag-select" apart, so TIME does it instead — the same
  // "hold, then drag" grammar a phone's own multi-select gesture already teaches, and it costs
  // pan nothing: a real pan swipe travels well before this fires, which cancels it (see
  // onPointerMove). `marqueeArm` is the down-point the timer, if it fires, starts the box from.
  let marqueeTimer = null, marqueeArm = null;
  const MARQUEE_HOLD_MS = 350;
  // Where the pointer last was, in ROOM px — kept across pointerup (a completed tap leaves its
  // socket "found" so a touch child who pressed a pin still gets its name once the plate opens;
  // see focusedSocket()). Cleared only when the pointer actually leaves the canvas.
  let lastPointer = null;
  // carrying: task 106 fix round 1 — the tick (run.tick, never Date.now) a brick was last seen
  // holding a crate, so the crate half of live.busy can hold for the same span the signal half
  // already gets from wireGlowLit (game.js's ONE glow source, read through `bridge.wireLit`). See
  // the brick case, below, for why it needs one at all, and `carryingRun` (also below) for how it
  // stays run-scoped.
  let last = { counts: {}, burst: {}, presses: {}, readings: {}, pokes: {}, tol: {}, carrying: {} };
  const t0 = () => (typeof performance !== 'undefined' ? performance.now() : 0);

  // ---------- mount / unmount ----------
  function mount(br, hostEl) {
    bridge = br; host = hostEl;
    // {0,0} is only ever the value BEFORE the first plan exists — onResize() below runs the first
    // replan() synchronously, and replan() itself centers the view on the machine (Task 2,
    // big-board) the instant a real plan lands, well before the RAF loop's first paint() call. No
    // flash of the world's left edge. `lastTableGen = null` is what tells that first replan()
    // "nothing has been planned since this mount" — see its own doc.
    view = { x: 0, y: 0 };
    lastTableGen = null;
    lastRunning = null;
    reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    host.textContent = '';
    cvs = document.createElement('canvas');
    cvs.className = 'floorcanvas';
    cvs.setAttribute('aria-hidden', 'true');
    host.appendChild(cvs);
    ctx = cvs.getContext('2d');
    plateEl = document.createElement('div');
    plateEl.className = 'plate';
    plateEl.id = 'plate';
    plateEl.hidden = true;
    host.appendChild(plateEl);
    wirePlateEl = document.createElement('div');
    wirePlateEl.className = 'wireplate';
    wirePlateEl.id = 'wireplate';
    wirePlateEl.hidden = true;
    host.appendChild(wirePlateEl);
    // THE ACTION CHIP (task 4): a real DOM control over the canvas, same law as the plate — every
    // canvas action keeps a DOM twin. Mutually exclusive with the plate (picked-mode closes it).
    chipEl = document.createElement('div');
    chipEl.className = 'brickchip';
    chipEl.id = 'brickchip';
    chipEl.hidden = true;
    host.appendChild(chipEl);
    shelfEl = document.createElement('div');
    shelfEl.className = 'floorshelf';
    shelfEl.id = 'floorshelf';
    shelfEl.setAttribute('role', 'toolbar');
    shelfEl.setAttribute('aria-label', bridge.t('floor.shelf'));
    host.appendChild(shelfEl);
    buildShelf();
    // task 092: every canvas gesture handler dirties the paint clock once it has run — ONE wrap
    // here rather than an invalidate() after each of their many returns. These listeners die
    // with the canvas on unmount (host.textContent = ''), so no reference is kept for removal.
    cvs.addEventListener('pointerdown', dirtying(onPointerDown));
    cvs.addEventListener('pointermove', dirtying(onPointerMove));
    cvs.addEventListener('pointerup', dirtying(onPointerUp));
    cvs.addEventListener('pointercancel', dirtying(onPointerUp));
    cvs.addEventListener('pointerleave', dirtying(onPointerLeave));
    // task E (desktop nicety): a real file dragged onto a FILES block's footprint feeds it —
    // same commit path as its plate's picker. Listeners die with the canvas on unmount.
    cvs.addEventListener('dragover', onDragOver);
    cvs.addEventListener('drop', onDrop);
    // …and a WINDOW-level net under them (task E fix round 1, review 2026-08-29 Finding 5): the
    // canvas pair alone still let a file dropped just OFF-canvas (shelf rail, open plate, header)
    // navigate the tab away from the child's machine. While OS files are in flight anywhere over
    // the app these claim the browser's default; the canvas handlers above stay the ONE feed
    // path. Removed symmetrically on unmount, beside the resize/key listeners below.
    window.addEventListener('dragover', onWindowFileDrag);
    window.addEventListener('drop', onWindowFileDrag);
    window.addEventListener('resize', onResize);
    // Fix wave (M1): CAPTURE phase, not bubble — onKey's new invitation-Escape arm needs to read
    // "is a drawer/tip currently up" BEFORE the header's OWN bubble-phase Escape listeners
    // (game.js: closeDrawers, dismissTip) have already reacted and mutated that very DOM state out
    // from under it. Every other onKey arm is unaffected by which phase it runs in (each reads
    // state nothing else on this same keydown writes), so moving the whole handler earlier changes
    // nothing else observable — it only fixes the one arm that needed to see the BEFORE state.
    document.addEventListener('keydown', onKeyDirty, true);
    // gesturePointer's valve 1 (see its own doc, above): an app-switch/permission-dialog mid-touch
    // can swallow the owning pointer's own up/cancel entirely — release ownership so the floor
    // never locks up for the rest of the session.
    window.addEventListener('blur', onWindowBlurDirty);
    document.addEventListener('visibilitychange', onVisibilityChangeDirty);
    clock = Clock.create(performance.now());
    onResize();
    if (reduced) slow = setInterval(() => paint(0), 400);
    else schedule(0);
    // task 063: the first paint precedes refresh()'s first real call — render once here too, so
    // a fresh empty hall carries the invitation from the very first frame, not just after the
    // next table edit.
    renderInvite();
  }
  function unmount() {
    if (raf) cancelAnimationFrame(raf); raf = null;
    if (wakeTimer) clearTimeout(wakeTimer); wakeTimer = null;
    clock = null;
    if (slow) clearInterval(slow); slow = null;
    window.removeEventListener('dragover', onWindowFileDrag);
    window.removeEventListener('drop', onWindowFileDrag);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('keydown', onKeyDirty, true); // capture flag must match mount()'s add
    window.removeEventListener('blur', onWindowBlurDirty);
    document.removeEventListener('visibilitychange', onVisibilityChangeDirty);
    if (window.BrainPanel) window.BrainPanel.close(); // never leave the lab open over an unmounted Floor
    if (window.BoardPanel) window.BoardPanel.close(); // same hygiene for the Board's own zoom (task 5)
    if (window.BrickPanel) window.BrickPanel.close(); // same hygiene for a brick's own small floor (task 6)
    abortLift(); // a ghost lives on document.body, so host.textContent = '' below would not take it
    if (host) host.textContent = '';
    bridge = null; host = null; plan = null; planKey = ''; lastTableGen = null; lastRunning = null; mode = { kind: 'idle' }; selected = null;
    clearMarqueeTimer();
    marquee = null; picked = []; chipMode = 'prompt'; selecting = false; chipNote = ''; chipLiveEl = null;
    shelfEl = null; plateEl = null; brickShelfEl = null; chipEl = null; wirePlateEl = null;
    selectedWire = null; pickedWires = [];
    // task 063: the invitation dies with the Floor — it renders on THIS face only (Blueprint view
    // never shows it), so nothing survives an unmount to leak into the next mount's first frame.
    if (inviteEl) { inviteEl.remove(); inviteEl = null; }
  }
  const mounted = () => !!bridge;

  // ---------- layout ----------
  function size() {
    const r = host.getBoundingClientRect();
    return { w: Math.max(320, r.width), h: Math.max(240, r.height - shelfHeight()) };
  }
  function shelfHeight() { return shelfEl ? shelfEl.getBoundingClientRect().height : 0; }
  function onResize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const s = size();
    cvs.width = Math.round(s.w * dpr); cvs.height = Math.round(s.h * dpr);
    // FIX WAVE (2026-09-08 final review — root cause behind making Important 3 safe): whole
    // pixels only. `getBoundingClientRect()` returns SUB-pixel floats that drift by fractions of
    // a px between otherwise-identical layout passes (no real resize at all). Stringifying the
    // raw float here and comparing it byte-for-byte against a FRESH sample in paint()'s own
    // re-sync check (below) made that harmless jitter look like a genuine resize on nearly every
    // frame — onResize() fired constantly, resetting `planKey` to '' each time (a real key can
    // never equal ''), so replan() saw a "table change" on almost every frame regardless of
    // whether anything had actually moved. Diagnosed empirically (a MutationObserver on a live
    // chip showed ~55 full chip rebuilds/second at idle before this fix). Rounding both sides to
    // the nearest px is imperceptible and makes the comparison mean "the size actually changed",
    // not "the browser resampled the identical size with different float noise".
    cvs.style.width = Math.round(s.w) + 'px'; cvs.style.height = Math.round(s.h) + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    planKey = '';
    replan();
    invalidate();
    // task 063 (spec R4): overflow can flip with width alone (no scroll event fires on a resize).
    updatePaddles();
  }
  /** Re-lay the objects when the table changed (cheap key on the table's shape). Widened (final
   *  fix round, finding 3b) to ALSO cover the fields `Board.fingerprint` cares about but layout
   *  never did (brainId/senseId/fileName/row-count) — one shape-key, checked once a frame either
   *  way, now gates both jobs instead of adding a second JSON.stringify pass just for the Board. */
  function replan() {
    if (!mounted()) return;
    // FIX WAVE (Critical 1a): checked on EVERY call, not gated behind the `key === planKey` early
    // return just below — a Run/Stop press changes no piece, so it never moves the table-shape
    // key, and a live chip's Make button (disabled while running) would otherwise stay stuck
    // exactly as it last rendered until some UNRELATED edit happened to touch the chip again. Only
    // the actual flip edge re-renders (see `lastRunning`'s own doc) — no per-frame cost.
    const nowRunning = bridge.running();
    if (nowRunning !== lastRunning) {
      lastRunning = nowRunning;
      if (picked.length || selecting) { renderChip(); placeChip(); }
    }
    const table = bridge.getTable();
    const s = size();
    const rowsOf = (p) => (Array.isArray(p.items) ? p.items.length : (p.parsed && Array.isArray(p.parsed.rows) ? p.parsed.rows.length : ''));
    const key = JSON.stringify([
      s.w, s.h,
      table.pieces.map((p) => [p.id, p.type, p.dataset || '', p.watchPiece || '', p.exits || 0, p.mode || '', p.name || '', p.x, p.y, p.fx, p.fy, p.brainId || '', p.senseId || '', p.fileName || '', rowsOf(p)]),
      table.snaps, table.wires,
    ]);
    if (key === planKey) return;
    planKey = key;
    // Board.fingerprint's OWN inputs (pieces/wires/snaps) are a subset of what just changed the
    // key above, so recomputing it here is exactly "on a real table-shape change", never per RAF
    // frame — see the `boardFp` declaration's own doc.
    boardFp = Board ? Board.fingerprint(table) : '';
    plan = Layout.floorPlan(table, { w: s.w, h: s.h, ports: bridge.ports, reference: tutorialReference });
    if (tutorialReference) {
      for (const p of table.pieces) {
        if (!tutorialReference[p.id] && plan.objects[p.id]) tutorialReference[p.id] = { ...plan.objects[p.id], fx: p.fx, fy: p.fy };
      }
      for (const ref of Object.values(tutorialReference)) {
        plan.world.w = Math.max(plan.world.w, ref.x + ref.w + 80);
        plan.world.h = Math.max(plan.world.h, ref.y + ref.h + 80);
      }
    }
    // CENTER ON THE MACHINE (Task 2, big-board) — but ONLY at mount and on a genuine table-identity
    // change (gallery load / bring-in / new machine), never on an ordinary edit. replan() itself
    // stays clamp-only for every OTHER call (the existing law this task must not break). Fix round
    // 2 (BLOCKER 1): this used to INFER identity from the piece-id set (disjoint = new machine),
    // which was blind through an empty table on either side — a custom→custom bring-in, or "Clear"
    // then "Open an example," both compare against an empty/near-empty set and never re-center
    // (driven and reproduced: pan, clear, open an example, view stays put over an empty hall while
    // the machine paints off to one side). game.js now DECLARES identity instead — `bridge.
    // tableGen()`, bumped ONLY at a genuine full-table swap (setMachine/restore/Clear — see its own
    // doc) — so this is a plain comparison, no guessing. `lastTableGen === null` means nothing has
    // been planned since the last mount() (its own reset), which is how "at mount" and "on identity
    // change" end up sharing this one mechanism.
    const gen = bridge.tableGen();
    if (lastTableGen === null || gen !== lastTableGen) { view = centeredView(plan, s); clampView(); }
    lastTableGen = gen;
    if (selected && !plan.objects[selected]) { selected = null; closePlate(); }
    if (!plateEl.hidden) placePlate();
    // A picked piece that vanished meanwhile (deleted through some other path) drops out of the
    // group. Fix round 1 (M5): this used to clear the WHOLE group once it fell below TWO, back
    // when a marquee's own >=2-hit release was the only way in — a single-piece hold-pick now
    // makes ONE a perfectly valid, live picked-mode (the chip is how it grows), so only a group
    // that fell to NOTHING survives to a full clear. Without this fix, replan() ran every RAF
    // frame and wiped a fresh hold-pick before the child's finger even left the screen (this IS
    // the RAF loop reaching in mid-gesture, not a delete — plan.objects[id] was never false).
    if (picked.length || selecting) {
      picked = picked.filter((id) => plan.objects[id]);
      if (!picked.length && !selecting) { clearPicked(); }
      else {
        // task 062 fix (RAF-loop DOM churn): replan() runs every animation frame (paint() calls
        // it unconditionally), but this whole branch sits BEHIND the `key === planKey` early
        // return above — it only runs on a genuine table-shape change, never per idle frame. The
        // brief's literal `renderChip(); placeChip();` is therefore safe here, not the ~60x/sec
        // churn a truly per-frame call would cause (that WAS the bug the original guard fixed;
        // gating on the real-change branch, not on the picked COUNT, is what actually fixes it).
        //
        // FIX WAVE (2026-09-08 final review, Important 3): this used to re-render only when the
        // picked COUNT itself changed after pruning — but undo/redo, Clear, a gallery load, a
        // plate delete, or a shelf-add can all change the table WITHOUT moving the picked count
        // (a removed piece was never picked; a restored piece re-enters `plan.objects` with the
        // count untouched either way), leaving the chip's add-select stale: a gone piece still
        // listed, or a just-restored piece unreachable by the keyboard/tap-select route. ANY real
        // table change while the chip is live now re-renders it — still gated to genuine changes
        // only (see above), so still no RAF churn.
        renderChip();
        placeChip();
      }
    }
    // Cable selection follows the same law: a wire removed by any path (its own delete, its block
    // deleted, Clear, a gallery load, an undo) drops out, and losing the last one closes the panel.
    if (selectedWire !== null || pickedWires.length) {
      const alive = new Set(((plan && plan.cables) || []).map((c) => c.id));
      pickedWires = pickedWires.filter((id) => alive.has(id));
      if (selectedWire !== null && !alive.has(selectedWire)) selectedWire = null;
      if (!pickedWires.length) { selectedWire = null; closeWirePlate(); }
      else if (selectedWire === null) selectedWire = pickedWires[0];
    }
  }
  function refresh() {
    // MINOR 6 (fix round 1): a public export must never crash a caller that outlived mount — a
    // stale bridge closure calling changed() after unmount (game.js's own `if (window.WorkshopFloor)
    // window.WorkshopFloor.refresh();` has no way to know a PARTICULAR bridge object died) used to
    // read `plateEl.hidden` after unmount() had already nulled it. replan() already guards itself
    // the same way; this makes refresh() match it, the crash-proof-export law applied here too.
    if (!mounted()) return;
    planKey = '';
    replan();
    if (!plateEl.hidden && selected) openPlate(selected, true);
    // The shelf's own made-part section (task 4): rebuilt on the SAME notification path every
    // other floor refresh already rides (bridge.changed() -> WorkshopFloor.refresh()) — a make,
    // an unpack, or a library delete all reach it this way, never a second poll.
    renderBrickShelf();
    renderInvite();
    invalidate();
    if (reduced) paint(0);
  }

  // ---------- task 063 (spec R1): the invitation on the empty hall ----------
  // Chrome, not state: shows when the table is EMPTY and nothing runs; the first piece (from
  // ANY path — tap, undo, gallery, buddy) removes it because refresh() re-renders on every real
  // change. Never intercepts pointers outside its own card. Records nothing.
  let inviteEl = null;
  // Fix wave (M1): session-only dismissal — spec R1 names BOTH the card's own × and Escape as
  // dismiss routes, and says the card "reappears whenever empty", not "reappears the instant you
  // stop looking at it". A bare `inviteEl` guard already keeps a SHOWN card from re-showing
  // itself, but does nothing once the table goes non-empty and empty again (add-then-Clear) — so
  // this flag is the thing dismissal actually sets, cleared the moment the table leaves "empty"
  // (below), earning the invitation back on the NEXT empty-hall arrival.
  let inviteDismissed = false;
  function renderInvite() {
    const empty = bridge.getTable().pieces.length === 0;
    if (!empty) inviteDismissed = false;
    const show = empty && !bridge.running() && !inviteDismissed;
    if (!show) { if (inviteEl) { inviteEl.remove(); inviteEl = null; } return; }
    if (inviteEl) return; // already up — nothing to rebuild
    inviteEl = document.createElement('div');
    inviteEl.className = 'invite';
    const head = document.createElement('div'); head.className = 'invitehead';
    head.appendChild(Object.assign(document.createElement('h2'), { textContent: bridge.t('invite.title') }));
    // The × (spec R1: "or on its own ×") — same aria-label family as every other panel close, no
    // new STRINGS key. dismissInvite (below) is the one writer of inviteDismissed besides onKey's
    // Escape arm, so both routes stay in lockstep.
    const closeBtn = document.createElement('button');
    closeBtn.className = 'invitex';
    closeBtn.type = 'button';
    closeBtn.textContent = '×';
    closeBtn.setAttribute('aria-label', bridge.t('panel.close'));
    closeBtn.addEventListener('click', dismissInvite);
    head.appendChild(closeBtn);
    inviteEl.appendChild(head);
    inviteEl.appendChild(Object.assign(document.createElement('p'), { textContent: bridge.t('invite.build') }));
    const row = document.createElement('div'); row.className = 'inviterow';
    if (!bridge.cameBack()) {
      const load = document.createElement('button');
      load.textContent = bridge.t('invite.load');
      load.addEventListener('click', () => bridge.pickFile());
      row.appendChild(load);
    }
    const how = document.createElement('button');
    how.textContent = bridge.t('invite.how');
    how.addEventListener('click', () => bridge.helpBasics());
    row.appendChild(how);
    inviteEl.appendChild(row);
    host.appendChild(inviteEl);
  }
  /** Dismiss the invitation for the rest of THIS empty stretch (× click or Escape). */
  function dismissInvite() { inviteDismissed = true; renderInvite(); }

  // ---------- the shelf ----------
  function buildShelf() {
    shelfEl.textContent = '';
    // THE CHILD'S OWN LIBRARY GOES FIRST (fix round 1, M4): the reviewer measured a made part
    // landing ~1000px off-screen behind 24 palette tiles with no cue at all — their own parts
    // greet them before the fixed palette does, not after it. A fixed, empty container appended
    // once here so renderBrickShelf() only ever rebuilds ITS OWN children, never the palette.
    brickShelfEl = document.createElement('div');
    brickShelfEl.className = 'floorshelf-bricks';
    shelfEl.appendChild(brickShelfEl);
    renderBrickShelf();
    for (const type of bridge.palette) {
      const b = document.createElement('button');
      b.className = 'shelfobj';
      b.dataset.type = type;
      b.title = bridge.t('job.' + type);
      const ic = document.createElement('canvas');
      ic.width = 112; ic.height = 72; ic.className = 'shelficon'; ic.setAttribute('aria-hidden', 'true');
      const kind = type === 'sense' ? 'reader' : type;
      Art.icon(ic.getContext('2d'), kind, 112, 72, bridge.words);
      b.appendChild(ic);
      const nm = document.createElement('span'); nm.className = 'shelfname'; nm.textContent = bridge.t('block.' + type);
      b.appendChild(nm);
      liftable(b, () => addFromShelf(type), (at) => landFromShelf(type, at));
      shelfEl.appendChild(b);
    }
    // task 063 (spec R4): the strip says there is more — paddles + fades, shown only when that
    // direction can scroll. Chrome; the strip's own overflow-x stays the finger's path. Appended
    // to HOST (not shelfEl) — position:absolute siblings so they never scroll with the strip.
    for (const [dir, glyph] of [['left', '‹'], ['right', '›']]) {
      const p = document.createElement('button');
      p.className = 'shelfpaddle';
      p.dataset.dir = dir;
      p.textContent = glyph;
      p.setAttribute('aria-label', bridge.t('shelf.more.' + dir));
      p.addEventListener('click', () => {
        const delta = dir === 'left' ? -260 : 260;
        // A press that LANDS the strip on (or past) an edge snaps instantly rather than
        // animating: a still-settling 'smooth' scroll's own trailing scroll events fire well
        // after the press (a real gesture and every browser-driven test alike), racing the very
        // next press's own actionability check — measured hanging that check for its full
        // timeout once the strip happened to finish crossing the boundary mid-check. Snapping the
        // edge-landing press removes the trailing animation instead of chasing the timing.
        const max = shelfEl.scrollWidth - shelfEl.clientWidth;
        const target = Math.max(0, Math.min(max, shelfEl.scrollLeft + delta));
        const atEdge = target <= 0 || target >= max;
        shelfEl.scrollBy({ left: delta, behavior: (reduced || atEdge) ? 'auto' : 'smooth' });
      });
      host.appendChild(p);
    }
    // The `scroll` event fires for ANY scroll (finger drag or a paddle's own scrollBy, including
    // mid-flight during a 'smooth' animation) — one source of truth for visibility, no polling.
    shelfEl.addEventListener('scroll', updatePaddles, { passive: true });
    updatePaddles();
  }
  /** Show each paddle only while its own direction still has strip to reveal (4px slack absorbs
   *  sub-pixel scroll-position float noise, same idiom as onResize()'s own rounding above). Driven
   *  by shelfEl's scroll event + onResize() (width changes can flip overflow without a scroll). */
  function updatePaddles() {
    if (!shelfEl) return;
    const canLeft = shelfEl.scrollLeft > 4;
    const canRight = shelfEl.scrollLeft + shelfEl.clientWidth < shelfEl.scrollWidth - 4;
    for (const p of host.querySelectorAll('.shelfpaddle')) {
      p.hidden = p.dataset.dir === 'left' ? !canLeft : !canRight;
    }
  }
  function addFromShelf(type) {
    if (bridge.running()) { bridge.status(bridge.t('hint.editWhileRunning')); return; }
    const res = bridge.add(type); // {id, candidates}
    placed(res, bridge.t('block.' + type));
  }
  /**
   * The step every shelf add ends with, tap or lift (task 089 folded the two tap paths' copies
   * into one): an ambiguous coupling asks the child which end (pending-pick), the table
   * re-lays, and the new piece is revealed, selected and opened.
   * @param {{id:string, candidates:Array}|null} res  what bridge.add / bridge.addBrick returned
   * @param {string} name  the piece's display name for the pick-end sentence
   */
  function placed(res, name) {
    if (res && res.candidates && res.candidates.length > 1) {
      mode = { kind: 'pending', id: res.id, candidates: res.candidates };
      bridge.status(bridge.t('floor.pickEnd', { name }));
    } else {
      mode = { kind: 'idle' };
    }
    refresh();
    if (res && res.id) { revealIfOffscreen(res.id); selected = res.id; openPlate(res.id); }
  }
  /**
   * A LIFTED palette part let go over the floor (task 089): the same add as a tap, then the
   * piece's own position is set to the landing point BEFORE the re-lay, so floorPlan's
   * "the child's own positions win" pass puts its centre under the finger instead of at the
   * computed spot. One history entry (bridge.add's own) — Undo removes the piece, as for a tap.
   * @param {string} type  palette block type
   * @param {{fx:number, fy:number}} at  from Layout.shelfLanding
   */
  function landFromShelf(type, at) {
    if (bridge.running()) { bridge.status(bridge.t('hint.editWhileRunning')); return; }
    const res = bridge.add(type);
    if (res && res.id) bridge.setPos(res.id, at.fx, at.fy);
    placed(res, bridge.t('block.' + type));
    if (res && res.id && mode.kind !== 'pending') bridge.status(bridge.t('floor.landed', { name: bridge.t('block.' + type) }));
  }
  /**
   * Every made part sits on the shelf too (task 4) — a brick is a block now, not a special case.
   * Every entry wears the SAME sealed-box icon (Art.icon('brick', …) draws one shape, always);
   * the child's OWN NAME is the only thing that tells two parts apart (inherited from task 5's
   * review, item c), so it gets the identical bold `.shelfname` weight the palette caption
   * carries, just allowed to wrap (`.brickname` in styles.css) — a made-up name runs longer than
   * a block word. Rebuilt on every refresh() (never cached): the library is cross-machine state
   * a make/unpack/delete anywhere can change under this view at any moment.
   */
  function renderBrickShelf() {
    if (!brickShelfEl) return;
    brickShelfEl.textContent = '';
    const bricks = bridge.bricks ? (bridge.bricks() || {}) : {};
    const ids = Object.keys(bricks);
    brickShelfEl.hidden = false;
    // task 062 (spec R1): the strip is the mechanic's permanent doorway — visible before the
    // first part exists, leading with the one button that opens selection without a gesture.
    const selBtn = document.createElement('button');
    selBtn.className = 'selectbtn';
    selBtn.textContent = bridge.t('select.enter');
    selBtn.addEventListener('click', enterSelectMode);
    brickShelfEl.appendChild(selBtn);
    const label = document.createElement('span');
    label.className = 'floorshelf-bricklabel';
    label.textContent = bridge.t('brick.shelf');
    brickShelfEl.appendChild(label);
    for (const libId of ids) {
      const entry = bricks[libId];
      const wrap = document.createElement('div');
      wrap.className = 'brickobj';
      const b = document.createElement('button');
      b.className = 'brickaddbtn';
      b.title = bridge.t('job.brick');
      const ic = document.createElement('canvas');
      ic.width = 112; ic.height = 72; ic.className = 'shelficon'; ic.setAttribute('aria-hidden', 'true');
      Art.icon(ic.getContext('2d'), 'brick', 112, 72, bridge.words);
      b.appendChild(ic);
      const nm = document.createElement('span'); nm.className = 'shelfname brickname'; nm.textContent = entry.name;
      b.appendChild(nm);
      liftable(b, () => addBrickFromShelf(libId), (at) => landBrickFromShelf(libId, at));
      wrap.appendChild(b);
      const del = document.createElement('button');
      del.className = 'brickdel';
      del.textContent = '×';
      // task 062 (spec R6): honest wording for what deleteBrick actually does — LIBRARY-only;
      // placed bricks keep their own `def`, so copies already on the floor survive.
      del.title = bridge.t('brick.shelfDrop', { name: entry.name });
      del.setAttribute('aria-label', bridge.t('brick.shelfDrop', { name: entry.name }));
      del.addEventListener('click', (ev) => { ev.stopPropagation(); bridge.deleteBrick(libId); renderBrickShelf(); });
      wrap.appendChild(del);
      brickShelfEl.appendChild(wrap);
    }
  }
  /**
   * Drop another copy of a made part onto the table — the SAME pending-pick idiom addFromShelf's
   * own ambiguous-candidates branch already drives (floor.js:174-185 above), now fed by
   * bridge.addBrick's own `{id, candidates}` (inherited from task 5's review, item b: it used to
   * discard `candidates` and always drop the piece uncoupled).
   * @param {string} libId
   */
  function addBrickFromShelf(libId) {
    if (bridge.running()) { bridge.status(bridge.t('hint.editWhileRunning')); return; }
    const res = bridge.addBrick(libId); // {id, candidates} | null (an already-deleted library slot)
    if (!res || !res.id) return;
    placed(res, nameOf(res.id));
  }
  /** landFromShelf's twin for a made part (task 089) — see it for the why. */
  function landBrickFromShelf(libId, at) {
    if (bridge.running()) { bridge.status(bridge.t('hint.editWhileRunning')); return; }
    const res = bridge.addBrick(libId);
    if (!res || !res.id) return;
    bridge.setPos(res.id, at.fx, at.fy);
    placed(res, nameOf(res.id));
    if (mode.kind !== 'pending') bridge.status(bridge.t('floor.landed', { name: nameOf(res.id) }));
  }

  // ---------- lifting a part off the shelf (task 089) ----------
  // A shelf card answers TWO gestures: a tap (its click handler — the part lands at floorPlan's
  // computed spot, exactly as before) and a LIFT — press, travel Layout.LIFT_PX, let go over the
  // floor — which lands it centred under the finger. One gesture for one intention: the team's
  // feedback was that "tap, find it, drag it again" is two.
  // WHY pointer events on the CARD and not HTML5 drag-and-drop: DnD never fires on touch on the
  // tablets this ships to, and everything else on the Floor already speaks pointer events.
  // WHY `touch-action: pan-x` on the cards (styles.css): the strip scrolls sideways under a finger
  // and must keep doing so — a sideways swipe stays the browser's own pan (we get pointercancel
  // and drop the lift), while an upward pull reaches us as pointermove. Playwright drives a mouse,
  // so that split is pinned by computed style, not exercised (see the board, task 089).
  // The tap-vs-lift rule and the landing arithmetic are pure (logic/floor-layout.js shelfLift /
  // shelfLanding) — "extract decisions tests cannot reach".
  //
  // ONE LIFT AT A TIME, one owning pointer — the canvas's own gesturePointer law, applied to the
  // shelf: a second finger's press while a part is in the air is ignored outright. The same two
  // valves the canvas has: window blur / tab hidden drops the lift (an OS dialog can swallow the
  // owner's own up), and `lostpointercapture` does too, so a lost pointerup can never leave a
  // ghost pinned to the screen or the shelf refusing every future lift.
  let lift = null; // {pointerId, btn, sx, sy, up, ghost} — a press on a card, possibly airborne
  /**
   * Wire one shelf button for tap-or-lift. `onTap` is the click path the card always had;
   * `onLand(at)` receives Layout.shelfLanding's {fx, fy} for a release over the floor.
   * @param {HTMLButtonElement} btn
   * @param {() => void} onTap
   * @param {(at:{fx:number, fy:number}) => void} onLand
   */
  function liftable(btn, onTap, onLand) {
    // A completed lift makes the browser fire a click on the SAME button right after pointerup
    // (pointer capture makes the card the click target) — without this, a drop would add the
    // part TWICE: once by landing, once by the click. Reset on every fresh press so a cancelled
    // lift (pointercancel fires no click) never swallows the child's next honest tap.
    let swallowClick = false;
    btn.addEventListener('pointerdown', (ev) => {
      swallowClick = false;
      if (lift || ev.button !== 0 || bridge.running()) return; // running: the tap path speaks hint.editWhileRunning
      lift = { pointerId: ev.pointerId, btn, sx: ev.clientX, sy: ev.clientY, up: false, ghost: null };
      try { btn.setPointerCapture(ev.pointerId); } catch (e) { /* older browsers: the tap still works */ }
    });
    btn.addEventListener('pointermove', (ev) => {
      if (!lift || lift.btn !== btn || ev.pointerId !== lift.pointerId) return;
      if (!lift.up) {
        if (!Layout.shelfLift(lift.sx, lift.sy, ev.clientX, ev.clientY)) return;
        lift.up = true;
        swallowClick = true;
        lift.ghost = makeGhost(btn);
        // Lifting is a promise of a place, so an open plate would only be in the way.
        closePlate();
      }
      moveGhost(lift.ghost, ev.clientX, ev.clientY, !!landingAt(ev.clientX, ev.clientY));
    });
    const end = (ev, cancelled) => {
      if (!lift || lift.btn !== btn || ev.pointerId !== lift.pointerId) return;
      const l = lift; lift = null;
      if (!l.up) return; // a tap: the click that follows does the work, as it always did
      if (l.ghost) l.ghost.remove();
      if (cancelled) return; // the browser took the gesture as a strip scroll — nothing to say
      const at = landingAt(ev.clientX, ev.clientY);
      if (at) onLand(at);
      else bridge.status(bridge.t('floor.liftOff')); // off the floor = put back, said out loud, never a silent no-op
    };
    btn.addEventListener('pointerup', (ev) => end(ev, false));
    btn.addEventListener('pointercancel', (ev) => end(ev, true));
    btn.addEventListener('lostpointercapture', (ev) => { if (lift && lift.btn === btn && ev.pointerId === lift.pointerId) end(ev, true); });
    btn.addEventListener('click', (ev) => {
      if (swallowClick) { swallowClick = false; ev.stopImmediatePropagation(); return; }
      onTap();
    });
  }
  /** Where a release at client (cx, cy) would land — null when off the floor canvas. */
  function landingAt(cx, cy) {
    if (!cvs) return null;
    return Layout.shelfLanding(cvs.getBoundingClientRect(), cx, cy, view, size());
  }
  /** Drop whatever is in the air without landing it (unmount, blur, tab hidden). */
  function abortLift() {
    if (!lift) return;
    if (lift.ghost) lift.ghost.remove();
    lift = null;
  }
  /**
   * The ghost: the card's own icon bitmap and name, riding under the finger. On document.body,
   * not `host` — `position: fixed` inside any transformed ancestor becomes position-relative-to-
   * that-ancestor (the buddy panel taught this once already), and the header/plate stack must
   * never be able to sit on top of a part the child is carrying.
   */
  function makeGhost(btn) {
    const g = document.createElement('div');
    g.className = 'shelfghost';
    g.setAttribute('aria-hidden', 'true');
    const src = btn.querySelector('canvas');
    if (src) {
      const c = document.createElement('canvas');
      c.width = src.width; c.height = src.height; c.className = 'shelficon';
      try { c.getContext('2d').drawImage(src, 0, 0); } catch (e) { /* a tainted/absent bitmap: the name still rides */ }
      g.appendChild(c);
    }
    const nm = btn.querySelector('.shelfname');
    if (nm) g.appendChild(Object.assign(document.createElement('span'), { className: 'shelfname', textContent: nm.textContent }));
    document.body.appendChild(g);
    return g;
  }
  function moveGhost(g, cx, cy, overFloor) {
    if (!g) return;
    g.style.transform = 'translate(' + Math.round(cx) + 'px, ' + Math.round(cy) + 'px) translate(-50%, -50%)';
    g.classList.toggle('shelfghost-off', !overFloor);
  }

  // ---------- hit testing (the geometry itself is pure — logic/floor-layout.js) ----------
  // A fingertip covers ~40 px and a socket ring is ~16 px, so both ends of a wiring gesture are
  // deliberately forgiving: GRAB to take hold of a cable, the wider SNAP to plug it in (by then
  // the child has already declared their intent, so we can afford to be generous).
  const GRAB = 20, SNAP = 46;
  const WIRE_TOL = 14;
  // How far a finger travels across a Car Maker knob to sweep its whole range. One dial's worth of
  // width would make a 216px block's tiny knob unusably twitchy; 220px is a comfortable thumb
  // sweep, the same "one motion sets a dial" idea the Splitter bar's rail already teaches.
  const DIAL_DRAG_PX = 220;
  // Where the window sits over the room. The room is the viewport until a machine outgrows it
  // (logic/floor-layout FIT_MIN: blocks stop shrinking, the plan grows) — then this scrolls.
  let view = { x: 0, y: 0 };
  // TUTOR SEAM (car-gallery tutorial FIX-1): the ids a running tutorial has HIDDEN — the un-placed
  // parts of the example machine. They keep their plan object (so `floorPlan`'s emergent layout never
  // changes when the guided build starts) but are not painted and are not hit-testable. `null` is the
  // default (no tutorial): every rule below is byte-identical to before this seam existed, so free
  // play is unchanged. Set/cleared by `setTutorialHidden()`.
  let tutorialHidden = null;
  /** Is this piece id hidden by the tutorial right now? False outside a tutorial (the default). */
  function isTutorialHidden(id) { return !!(tutorialHidden && tutorialHidden.has(id)); }
  function objectAt(x, y) {
    return plan ? Layout.objectAt(plan.objects, x, y, tutorialHidden ? (o) => !tutorialHidden.has(o.id) : null) : null;
  }
  function socketAt(x, y, r, ok) {
    if (!plan) return null;
    const keep = (id, s) => !isTutorialHidden(id) && (!ok || ok(id, s));
    return Layout.socketNear(plan.sockets, x, y, r, keep);
  }
  // Port AND dir: a belt end and a signal port on one block may share a name (task 104).
  const isOffer = (id, s) => !!(mode.offers || []).some((q) => q.id === id && q.port === s.port && q.dir === s.dir);
  /** A belt socket (task 104) — a square the Floor pulls BELTS from, not a round cable pin. */
  const isItemSock = (s) => !!s && (s.dir === 'item-out' || s.dir === 'item-in');
  /**
   * A plan socket as the shape law's connector {piece, kind, name} — the ONE mapping every cable
   * and belt gesture uses (offersFor, plug), so a new socket dir cannot fall through as 'sig-out'.
   */
  function sockEnd(piece, s) {
    if (isItemSock(s)) return { piece, kind: s.dir, name: s.port };
    if (s.dir === 'dial') return { piece, kind: 'dial', name: s.port.slice(5) };
    return { piece, kind: s.dir === 'in' ? 'sig-in' : 'sig-out', name: s.port };
  }
  /**
   * The socket a bare press takes hold of — GRAB, but never at the cost of the block itself.
   * A scaled-down belt is ~38 px tall, so its centre is only ~19 px from the speed dial on its
   * rim: without this cap, pressing the middle of a belt to open its plate would pull a cable.
   * Plugs live on the RIM, so the rule is simply "closer to the rim than to the middle".
   */
  /** Where the pointer is ON SCREEN (canvas px). */
  function screenAt(ev) { const r = cvs.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; }
  /** Where the pointer is IN THE ROOM — screen plus the pan. Everything below thinks in room px. */
  function at(ev) { const p = screenAt(ev); return { x: p.x + view.x, y: p.y + view.y }; }
  /** Keep the window inside the room (and pinned at 0 when the room fits). */
  function clampView() {
    const s = size(), w = (plan && plan.world) || s;
    view.x = Math.max(0, Math.min(view.x, Math.max(0, w.w - s.w)));
    view.y = Math.max(0, Math.min(view.y, Math.max(0, w.h - s.h)));
  }
  /**
   * The view that opens ON THE MACHINE (Task 2, big-board) — the bounding box of `plan.objects`,
   * mid-window, NOT the world's own center. Since the LEFT START (owner 2026-09-08), floorPlan
   * anchors a freshly-laid machine at the hall's left end, so centering on its bbox clamps to the
   * world's LEFT EDGE — a set-up opens leftmost with the open board running right. A legacy save
   * whose free-dragged `fx`/`fy` pieces sit anywhere else opens on THOSE actual pieces instead —
   * never assume where the machine is. An empty table has no bbox to open on, so it opens at the
   * hall's left end too (where the first block will land). The caller still owes this a
   * `clampView()` — it hands back the raw centered point, unclamped, so the ONE clamp rule stays
   * in ONE place.
   * @param {object} p   a floorPlan() result (.objects, .world)
   * @param {{w:number,h:number}} s   the CURRENT window size (viewport minus the shelf)
   * @returns {{x:number,y:number}}
   */
  function centeredView(p, s) {
    const world = (p && p.world) || s;
    const ids = p ? Object.keys(p.objects) : [];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const id of ids) {
      const o = p.objects[id];
      x0 = Math.min(x0, o.x); y0 = Math.min(y0, o.y);
      x1 = Math.max(x1, o.x + o.w); y1 = Math.max(y1, o.y + o.h);
    }
    // An empty hall opens at its LEFT END (cx = half a window → view.x resolves to exactly 0),
    // matching where floorPlan will anchor the first machine — never mid-void.
    const cx = ids.length ? (x0 + x1) / 2 : s.w / 2;
    const cy = ids.length ? (y0 + y1) / 2 : world.h / 2;
    return { x: cx - s.w / 2, y: cy - s.h / 2 };
  }
  /**
   * MINIMAL-REVEAL (Task 2, big-board, fix round 2 — MAJOR 2, the invisible-action finding): a
   * freshly-added block must never land where the child cannot see it — "Added Lamp — on the
   * wall." while the Lamp sits 400px past the right edge is a real, silent broken promise. This is
   * deliberately NOT a re-center: an add is an ordinary edit (the SAME law that keeps the pan alive
   * across it in replan(), case 6), so a block already inside the window moves the view NOT AT ALL,
   * and one that lands outside slides the view the SHORTEST distance that brings its WHOLE box
   * inside plus a small margin — never further, never toward the machine's own center.
   * @param {string} id  the just-added piece's id
   */
  function revealIfOffscreen(id) {
    const o = plan && plan.objects[id];
    if (!o) return; // a candidate-pick add or a stale id — nothing to reveal yet
    const s = size(), margin = 24;
    let dx = 0, dy = 0;
    if (o.x < view.x) dx = (o.x - margin) - view.x;
    else if (o.x + o.w > view.x + s.w) dx = (o.x + o.w + margin) - (view.x + s.w);
    if (o.y < view.y) dy = (o.y - margin) - view.y;
    else if (o.y + o.h > view.y + s.h) dy = (o.y + o.h + margin) - (view.y + s.h);
    if (!dx && !dy) return; // already fully visible — the view must not move at all
    view.x += dx; view.y += dy;
    clampView();
    invalidate();
  }

  function grabSocketAt(x, y) {
    const s = socketAt(x, y, GRAB);
    if (!s) return null;
    const o = plan.objects[s.id];
    return o && s.d > 0.4 * Math.min(o.w, o.h) ? null : s;
  }
  /**
   * The socket, if any, that a press RIGHT NOW would take hold of — the same rim-not-middle rule
   * `grabSocketAt` already grabs cables with, reused here for PAINTING. Only while idle: mid-cable,
   * mid-bar-drag and mid-pan all have their own meaning for where the pointer is, socketTags does
   * not need a second opinion. `lastPointer` outlives pointerup on purpose, so a tap that landed on
   * a socket still names it once the plate is open — a mouse sweeping past gets the same one word.
   */
  function focusedSocket() {
    return (lastPointer && mode.kind === 'idle') ? grabSocketAt(lastPointer.x, lastPointer.y) : null;
  }

  // ---------- pointer: press a socket = pull a cable; press an object = move it; tap = plate ----------
  let drag = null;   // {id, sx, sy, moved, dx, dy} — moving an OBJECT
  let hover = null;  // the object a mouse is over: its sockets grow + name themselves (desktop discovery)
  // ONE FINGER OWNS THE FLOOR AT A TIME (breaker-fix round, finding #1): the drag/mode/marqueeArm/
  // marqueeTimer/picked state below is a SINGLE mutable slot each, none of it keyed by
  // event.pointerId — but a tablet routinely produces a second, concurrent pointerdown on the
  // SAME canvas (a resting palm, a curious second child), which is not a deliberate two-finger
  // gesture. Without this, the second press silently reassigns drag/mode to whatever IT landed
  // on, discarding the first finger's own in-flight gesture (verified live: an untouched Bin
  // jumped across the floor, dragged by a completely different finger's motion). `gesturePointer`
  // is the id of the pointer that currently owns onPointerDown/Move/Up; null means the floor is
  // free. A second pointerdown while one is already down is IGNORED outright — closing the door
  // on any future two-finger gesture (e.g. pinch-zoom) is a deliberate, ruled-on tradeoff for now,
  // not an oversight.
  //
  // TWO SAFETY VALVES (re-review, MEDIUM): gesturePointer's ONLY reset path was the owner's own
  // pointerup/pointercancel — a real tablet can lose BOTH (an OS permission dialog, an app-switch,
  // any interruption mid-touch), which would otherwise leave the floor locked FOREVER: every
  // future pointer of ANY id silently ignored until reload. Pre-fix, a stale `drag` still let a
  // fresh press through; this fix must not trade that for a worse, permanent dead-end — the
  // crash-proof-I/O law (AGENTS.md) forbids it. `lastOwnerEvent` (performance.now(), UI-code
  // wall-clock — this is floor.js, not logic/) is bumped whenever the OWNING pointer is still
  // heard from; see releaseGesturePointer (valve 1, blur/hidden) and onPointerDown's own
  // self-healing check (valve 2, silence timeout) below.
  let gesturePointer = null;
  let lastOwnerEvent = 0;
  const STALE_OWNER_MS = 2000;
  /**
   * VALVE 1: release ownership on window blur / tab hidden — the "app-switch mid-touch" shape:
   * the OS can swallow a pointer's own up/cancel entirely when a permission dialog or another app
   * takes focus. This only frees the NEXT pointerdown to claim the floor normally; it deliberately
   * does not try to resolve whatever drag/mode was mid-flight (the same shape a lost pointerup
   * already left before this fix, out of THIS fix's scope).
   */
  function releaseGesturePointer() { gesturePointer = null; }
  function onWindowBlur() { releaseGesturePointer(); abortLift(); }
  function onVisibilityChange() { if (document.hidden) { releaseGesturePointer(); abortLift(); } }
  // task 092: the document/window listeners are added AND removed by these same wrapped
  // references (mount/unmount). A tab coming back to the foreground must wake a resting clock,
  // which is exactly what the wrapper's invalidate() does after the handler has run.
  const onWindowBlurDirty = dirtying(onWindowBlur);
  const onVisibilityChangeDirty = dirtying(onVisibilityChange);

  /**
   * Take hold of a cable at socket `s`. The source is picked and every socket that fits lights up
   * IMMEDIATELY — before the finger has moved. (The old flow reached this state only after opening
   * the plate, pressing Cable and tapping twice.) Returns false when nothing fits and the press
   * should fall through to its normal meaning, so a dead socket never eats a tap.
   */
  function grabCable(s, x, y) {
    if (bridge.running()) return false;
    const offers = offersFor(s.id, s);
    if (!offers.length) {
      if (mode.kind === 'cable') { mode = { kind: 'idle' }; bridge.status(bridge.t(isItemSock(s) ? 'floor.beltNoFit' : 'floor.cableNoFit')); return true; }
      return false;
    }
    closePlate();
    mode = { kind: 'cable', stage: 'target', from: s.id, source: s, offers, live: { x, y }, hot: null, moved: false };
    // MINOR (re-review, final round): portWord needs the OWNING piece id as its second arg to
    // reach dialOrPortWord's brick branch (a brick's own suffix-allocated socket, e.g. 'reading2',
    // otherwise speaks the raw key 'port.reading2' instead of its real name) — matching the socket
    // tag pass (~:2036) and the wire list (~:1412), which already pass it.
    bridge.status(isItemSock(s) ? bridge.t('floor.beltTarget', { port: bridge.endWord(s.port, s.id) }) : bridge.t('floor.cableTarget', { port: bridge.portWord(s.port, s.id) }));
    bridge.tip('cable'); // task 063 (spec R3): first cable-grab moment-help.
    return true;
  }
  /**
   * Where a released cable would plug in: the nearest FITTING socket, or else — the forgiving rule
   * that makes this usable by a child — the best socket on the BLOCK under the finger. Aiming at a
   * block ("plug it into the tower") is how a person thinks; aiming at a 16 px pin is how a CAD
   * tool thinks. Nothing is guessed silently: whatever this returns is already drawn HOT, so the
   * child sees the exact socket before they let go.
   */
  function dropTarget(x, y) {
    const near = socketAt(x, y, SNAP, isOffer);
    if (near) return mode.offers.find((q) => q.id === near.id && q.port === near.port && q.dir === near.dir) || null;
    const o = objectAt(x, y);
    if (!o) return null;
    const mine = mode.offers.filter((q) => q.id === o.id);
    if (!mine.length) return null;
    // A signal fits every in-port AND every dial, so a body drop is nearly always a choice. The
    // block's FRONT DOOR wins it: dropping on a lamp means "light up", not "set its seconds dial".
    const rank = (q) => (q.dir === 'in' || q.dir === 'item-in' ? 0 : q.dir === 'out' || q.dir === 'item-out' ? 1 : 2);
    const near2 = (q) => Math.hypot(q.x - x, q.y - y);
    return mine.slice().sort((p, q) => rank(p) - rank(q) || near2(p) - near2(q))[0];
  }
  /** Lay the cable the child is holding into `hit` and drop back to idle. */
  function plug(hit) {
    const s = mode.source;
    bridge.link(sockEnd(mode.from, s), sockEnd(hit.id, hit));
    bridge.status(bridge.t(isItemSock(s) ? 'floor.belted' : 'floor.cabled', { a: nameOf(mode.from), b: nameOf(hit.id) }));
    mode = { kind: 'idle' };
    refresh();
  }

  // Fix round 1, Finding 4: WHO had focus before this press, captured at the very first line of
  // the very first handler a press reaches — the canvas itself is aria-hidden and unfocusable, so
  // a click on it blurs whatever WAS focused (e.g. #runBtn) as part of the browser's own default
  // mousedown handling, and that blur has often already committed by the time a listener as late
  // as openPanel() would run. Captured here, before anything else touches focus, and handed to
  // BrainPanel.open() so a Tab-trapped lab can hand focus back to somewhere real on close.
  let preTapFocus = null;

  /**
   * THE SPLITTER'S LIVE SHARES — the running rig's dials when a run is up, else the hand-set
   * values on the piece. Both exist by design (a dial edit writes both), so EVERY reader goes
   * through this one function: the bar that is drawn and the bar that is dragged must read the
   * same numbers, or a drag mid-run would jump the handle back to the piece's stale value.
   * @returns {{training:number, validation:number}} percent
   */
  function splitterShares(p) {
    const run = bridge.getRun();
    const d = run && run.blocks[p.id] ? run.blocks[p.id].dials : null;
    const pick = (a, b, dflt) => (Number.isFinite(a) ? a : (Number.isFinite(b) ? b : dflt));
    return {
      training: pick(d && d.training, p.training, 60),
      validation: pick(d && d.validation, p.validation, 20),
    };
  }

  /**
   * THE BOARD'S PANEL (Plan 3 task 5): the CURRENT value of an arbitrary (block, prop) dial —
   * run-live first while a run is up (the same rig logic/engine.js's own `dial()` reads at the
   * next act), else the piece's hand-set value. Generalises splitterShares' own "running rig
   * first, piece second" rule to one pair instead of a fixed two, because the panel's live slider
   * must show/drag the SAME number the engine will actually read, not a stale piece-only copy.
   */
  function boardDialValue(blockId, prop) {
    const run = bridge.getRun();
    const rb = run && run.blocks[blockId];
    if (rb && rb.dials && Number.isFinite(rb.dials[prop])) return rb.dials[prop];
    const p = bridge.pieceById(blockId);
    return p && Number.isFinite(p[prop]) ? p[prop] : null;
  }

  /**
   * "The room's act Buttons" (Plan 3 task 5, spec §4): every Button wired into ANY splitter's
   * act in-ports (teach/releaseTraining/releaseValidation/releaseTest) — the Board's panel
   * re-renders these so a child can press them without leaving the zoom. The WIRE stays the
   * authority: this only DISCOVERS which buttons already do something on the table; pressing one
   * from the panel (bridge.poke) pushes the identical extern a floor tap on the same Button does.
   * @returns {Array<{id:string, name:string, port:string}>}
   */
  function boardActButtonsFor() {
    const table = bridge.getTable();
    if (!table) return [];
    const ACT_PORTS = ['teach', 'releaseTraining', 'releaseValidation', 'releaseTest'];
    const splitters = new Set((table.pieces || []).filter((q) => q.type === 'splitter').map((q) => q.id));
    const out = [];
    for (const w of table.wires || []) {
      if (!splitters.has(w.to.block) || ACT_PORTS.indexOf(w.to.port) === -1) continue;
      const bp = bridge.pieceById(w.from.block);
      if (!bp || bp.type !== 'button') continue;
      out.push({ id: bp.id, name: bp.name || bridge.kindLabel(bp), port: w.to.port });
    }
    return out;
  }

  /**
   * Which bar handle, if any, is under this point? The RULE — including the tie-break when the
   * two handles land on the same x — is pure and lives in logic/floor-layout.js, where a test can
   * reach it: a blind "nearest wins" hands the child a PINNED handle at 0/0 and the bar sticks
   * forever (review finding 1). This wrapper only resolves the piece and its live shares.
   */
  function barGrab(o, x, y) {
    if (!o || o.kind !== 'splitter' || !Layout.barHandleAt) return null;
    const p = bridge.pieceById(o.id);
    if (!p) return null;
    // A bar over a DEALT table is drawn at the division the piles actually hold (liveFor's
    // `spent`, above), so the handle a finger reaches for is at the real share — grab from the
    // same numbers the paint used, or the two disagree by exactly the amount the drag is being
    // refused for.
    return Layout.barHandleAt(o, barShares(o.id, p), x, y);
  }
  /** Is this Splitter's bar frozen — every row in, nothing left for a re-cut to change? */
  function barFrozen(id) {
    const l = lastLive[id];
    // task P2b: a Splitter fed by a private collection holds FIXED piles from the start — its bar
    // is a picture of the frozen split, never a control that could re-divide it.
    return !!(l && l.spent) || !!(bridge.splitterFixed && bridge.splitterFixed(id));
  }
  /** The shares the bar is DRAWN and GRABBED at: the dials, or the real division once dealt. */
  function barShares(id, p) {
    const l = lastLive[id];
    // ONE definition of "the shares a dealt table holds" (review M9) — Layout.dealtShares, the
    // same call floor-art.js's splitter() paints from, so the grab band and the ink can never
    // drift apart.
    const dealt = l && l.spent && Layout && Layout.dealtShares ? Layout.dealtShares(l.dealtBy) : null;
    return dealt || splitterShares(p);
  }

  /**
   * The Car Maker knob under a point, resolved against the piece's own declared dials — the knob a
   * child TAPS is the knob floor-art drew (both read Layout.carmakerFace, the barHandle/readerFace
   * precedent's own law). Null for a point off the knobs, so a tap on the block's body still opens
   * the plate. The current value is read run-first / piece-second (boardDialValue's own rule), and
   * the C3 range + tap notch come off the piece's dialSpec.
   */
  function carmakerDial(o, x, y) {
    if (!o || o.kind !== 'carmaker' || !Layout.carmakerDialAt) return null;
    const p = bridge.pieceById(o.id);
    if (!p) return null;
    const hit = Layout.carmakerDialAt(o, x, y);
    if (!hit) return null;
    const d = ((p.dialSpec && p.dialSpec.dials) || []).find((q) => q.id === hit.prop);
    if (!d) return null;
    const min = Number(d.min), max = Number(d.max);
    return {
      prop: d.id,
      value: boardDialValue(o.id, d.id),
      min, max,
      notch: Layout.carmakerNotch(min, max),
    };
  }

  function onPointerDown(ev) {
    // A second, concurrent pointer while one already owns the floor is IGNORED outright — no
    // state touched (not even preTapFocus below), no feedback needed for a resting palm. See
    // gesturePointer's own doc, above.
    if (gesturePointer !== null && ev.pointerId !== gesturePointer) {
      // VALVE 2: self-healing adoption. If the OWNING pointer has gone silent (no move/up/cancel
      // heard from it) for over STALE_OWNER_MS, treat it as abandoned — a real device can lose a
      // pointer's own release entirely (see the two valves' shared doc, above) — and let THIS
      // pointer claim the floor exactly as if it had been idle, rather than ignoring it forever.
      if (performance.now() - lastOwnerEvent > STALE_OWNER_MS) gesturePointer = null;
      else return;
    }
    gesturePointer = ev.pointerId;
    lastOwnerEvent = performance.now();
    preTapFocus = document.activeElement;
    const { x, y } = at(ev);
    lastPointer = { x, y };
    if (bridge.guided && bridge.guided() && objectAt(x, y)) { gesturePointer = null; return; }
    if (mode.kind === 'pending') { drag = { id: null, sx: x, sy: y, moved: false, x, y }; return; }
    // Already holding a half-made cable? The press is aimed at an offer — settled on the way up.
    if (mode.kind === 'cable' && mode.stage === 'target') { drag = { id: null, sx: x, sy: y, moved: false, x, y }; return; }
    // THE SPLITTER'S BAR, claimed before ANY other press. Before the sockets, because the rail's
    // grab band and the block's rim sockets can sit near each other and grabSocketAt's radius is
    // wider (20) than a handle's (12) — the socket would win a press aimed squarely at a handle,
    // and the child would end up holding a cable they never asked for (review finding 2; the rail
    // is also inset now so the two no longer overlap at all). Before the block drag, or a press on
    // a handle would move the whole machine and the proportion could never be touched.
    const barObj = mode.kind === 'idle' ? objectAt(x, y) : null;
    const handle = barGrab(barObj, x, y);
    if (handle !== null && barFrozen(barObj.id)) {
      // A dead control that SAYS it is dead. The press is consumed here on purpose: falling
      // through would drag the whole block across the room, which is not what the finger asked
      // for. The dials still take, and the next Run divides by them — that is what the line says.
      bridge.status(bridge.t(bridge.splitterFixed && bridge.splitterFixed(barObj.id) ? 'splitter.fixed' : 'splitter.dealt'));
      drag = null;
      return;
    }
    if (handle !== null) {
      // `from` is what the shares were when the finger landed — pointer-up compares against it,
      // so a handle TAP (press, no travel) costs no autosave and no replan (review finding 7).
      mode = { kind: 'bar', id: barObj.id, handle, from: splitterShares(bridge.pieceById(barObj.id)) };
      drag = null;
      try { cvs.setPointerCapture(ev.pointerId); } catch (e) { /* older browsers */ }
      return;
    }
    // THE CAR MAKER'S KNOBS, claimed next — before the sockets, exactly as the Splitter's bar is:
    // a knob sits inside the block where a socket's 20 px grab radius can reach, and a press aimed
    // at a dial a child can plainly see must turn it, never pull a cable. `from`/`value` are the
    // dial as it stands this second; pointer-up compares against them so a TAP that changes nothing
    // costs no autosave.
    const dialHit = (barObj && barObj.kind === 'carmaker') ? carmakerDial(barObj, x, y) : null;
    if (dialHit) {
      mode = { kind: 'dial', id: barObj.id, prop: dialHit.prop, from: dialHit.value, value: dialHit.value, min: dialHit.min, max: dialHit.max, notch: dialHit.notch, sx: x, moved: false };
      drag = null;
      try { cvs.setPointerCapture(ev.pointerId); } catch (e) { /* older browsers */ }
      return;
    }
    const s = grabSocketAt(x, y);
    if (s && grabCable(s, x, y)) { try { cvs.setPointerCapture(ev.pointerId); } catch (e) { /* older browsers */ } return; }
    if (mode.kind === 'cable') { drag = { id: null, sx: x, sy: y, moved: false, x, y }; return; }
    // THE WIRE BODY (plan Task 5): sockets have already had their chance above, so a press that
    // lands on a cable's mid-span SELECTS it rather than falling through to the block behind it —
    // "wire over brick" is answered by the wire. Idle only: mid-marquee/mid-cable a press means
    // its own thing. A hit consumes the press (no pan, no block drag). While picked-mode is LIVE
    // the press instead TOGGLES the cable into the wire group — the same membership rule a tap on
    // a piece already follows, so a group is never thrown away by reaching for a cable.
    if (mode.kind === 'idle') {
      // A BELT link (task 104) under the finger: select it so it can be disconnected — the belt
      // twin of the cable-body tap below. Not in picked-mode (a group gathers blocks and cables),
      // and never over a block: a link runs ON the item plane between blocks, so a press on a
      // block's body stays that block's (a cable is different — it hangs in front, see below).
      const l = !(picked.length || selecting) && plan && !objectAt(x, y) ? Layout.linkAt(plan.links, x, y, WIRE_TOL) : null;
      if (l) { selectLink(l); drag = null; return; }
      const c = wireAtPoint(x, y);
      if (c) {
        if (picked.length || selecting) togglePickedWire(c.id);
        else selectWire(c);
        drag = null;
        return;
      }
    }
    const o = objectAt(x, y);
    // Empty floor + a room bigger than the window = a PAN. Screen coords, not room coords: the
    // room moves under the finger, so a room-space delta would chase its own tail.
    //
    // The SAME long-press arm now covers BOTH halves of picked-mode (fix round 1, M5): empty
    // floor still arms the MARQUEE (task 4 — pan already owns "empty floor, real travel, right
    // away", so this needs a hold instead), and a PIECE now arms a single-piece pick — tap-only
    // selection (ui-ux-common §3's "every drag needs a tap equivalent", read the other way: every
    // drag-only gesture here also needs its own tap-free entry). Either way, real travel before
    // MARQUEE_HOLD_MS elapses cancels the arm (onPointerMove) and the press keeps its ORIGINAL
    // meaning — an object drag, a pan, or nothing.
    clearMarqueeTimer();
    marqueeArm = { x, y, pieceId: o ? o.id : null };
    marqueeTimer = setTimeout(() => {
      marqueeTimer = null;
      if (!marqueeArm || !drag || drag.moved) return;
      if (marqueeArm.pieceId) { if (drag.id === marqueeArm.pieceId) startPickedHold(marqueeArm.pieceId); }
      else if (!drag.id) startMarquee(marqueeArm.x, marqueeArm.y);
    }, MARQUEE_HOLD_MS);
    const sc = screenAt(ev);
    drag = { id: o ? o.id : null, sx: x, sy: y, moved: false, dx: o ? x - o.cx : 0, dy: o ? y - o.cy : 0, x, y,
      pan: !o && pannable(), px: sc.x, py: sc.y, vx: view.x, vy: view.y };
    // Captured unconditionally now (it used to skip a non-pannable empty-floor press): a marquee
    // can start from that exact same press, and losing capture mid-hold would drop the drag the
    // instant a finger drifted a pixel off the canvas.
    try { cvs.setPointerCapture(ev.pointerId); } catch (e) { /* older browsers */ }
  }
  function onPointerMove(ev) {
    // A move from a pointer that does not own the current gesture is ignored — see gesturePointer's
    // own doc, above. (gesturePointer === null, no gesture in flight, means a plain hover move
    // still reaches hoverAt below, whatever its pointerId — nothing to protect yet.)
    if (gesturePointer !== null && ev.pointerId !== gesturePointer) return;
    if (gesturePointer !== null) lastOwnerEvent = performance.now(); // the owner is still alive — valve 2's silence clock resets
    const { x, y } = at(ev);
    lastPointer = { x, y };
    // A press still ARMED for a possible marquee OR single-piece pick (see onPointerDown) that
    // travels before the hold elapses has already declared itself something else (a pan, an
    // object drag, or a plain miss) — cancel the arm so a late-firing timer can never
    // second-guess a gesture already under way.
    if (marqueeTimer && marqueeArm && Math.hypot(x - marqueeArm.x, y - marqueeArm.y) > 6) clearMarqueeTimer();
    // The marquee itself, once armed: the box just follows the finger from the ORIGINAL down
    // point (marquee.x0/y0, set once in startMarquee) to wherever it is now. Mutually exclusive
    // with every mode below by construction (it only ever starts from `mode.kind === 'idle'` on
    // empty floor, same as the pan it stands in for).
    if (marquee) { marquee.x1 = x; marquee.y1 = y; if (reduced) paint(0); return; }
    // Turning a Car Maker knob: the value follows the finger's horizontal travel across the dial's
    // range, written through the SAME dial-set path a typed dial takes (bridge.setDial writes the
    // piece AND the running rig). Like the Splitter bar, no changed() mid-drag — pointer-up commits
    // once — and reduced motion silences only the AMBIENT clock, never the child's own hand.
    if (mode.kind === 'dial') {
      const dx = x - mode.sx;
      if (Math.abs(dx) > 3) mode.moved = true;
      const v = Math.max(mode.min, Math.min(mode.max, Math.round(mode.from + (dx / DIAL_DRAG_PX) * (mode.max - mode.min))));
      if (v !== mode.value) { mode.value = v; bridge.setDial(mode.id, mode.prop, v); if (reduced) paint(0); }
      return;
    }
    // Dragging the Splitter's proportion: the shares follow the finger, through the SAME dial-set
    // path a typed dial takes (bridge.setDial writes the piece AND the running rig). No changed()
    // here — autosaving on every pointer-move would be churn; pointer-up commits once.
    if (mode.kind === 'bar') {
      const o = plan && plan.objects[mode.id];
      const p = o && bridge.pieceById(mode.id);
      if (!o || !p) { mode = { kind: 'idle' }; return; }
      const next = Layout.barDrop(o, splitterShares(p), mode.handle, x);
      bridge.setDial(mode.id, 'training', next.training);
      bridge.setDial(mode.id, 'validation', next.validation);
      // Reduced motion silences the AMBIENT clock, not the child's own hand — the same rule the
      // cable lead follows below. With the RAF loop up, the next frame already paints the move.
      if (reduced) paint(0);
      return;
    }
    if (drag && drag.pan) {
      const sc = screenAt(ev);
      if (Math.hypot(sc.x - drag.px, sc.y - drag.py) > 4) drag.moved = true;
      view.x = drag.vx - (sc.x - drag.px);
      view.y = drag.vy - (sc.y - drag.py);
      clampView();
      if (reduced) paint(0);
      return;
    }
    // Pulling a cable: the lead follows the finger and the socket it would land in goes hot.
    if (mode.kind === 'cable' && mode.live) {
      mode.live = { x, y };
      if (!mode.moved && Math.hypot(x - mode.source.x, y - mode.source.y) > 6) mode.moved = true;
      mode.hot = dropTarget(x, y);
      // Reduced motion silences the AMBIENT clock, not the child's own hand: a lead that lagged
      // 400 ms behind the finger would be broken, not calm. Direct manipulation always tracks.
      if (reduced) paint(0);
      return;
    }
    if (!drag || !drag.id) { hoverAt(x, y); return; }
    drag.x = x; drag.y = y;
    if (!drag.moved && Math.hypot(x - drag.sx, y - drag.sy) < 6) return; // a tap wobbles; a drag travels
    if (!drag.moved) { drag.moved = true; closePlate(); }
    const s = size();
    bridge.setPos(drag.id, (x - drag.dx) / s.w, (y - drag.dy) / s.h);
    replan();
    if (reduced) paint(0);
  }
  function onPointerLeave() { hover = null; lastPointer = null; if (cvs) cvs.style.cursor = 'default'; clearMarqueeTimer(); }

  // ---------- a file dropped from the DESKTOP (task E, best-effort nicety) ----------
  // Dragging a real file onto a FILES block's footprint feeds it — the same one commit path the
  // block's own plate picker uses (bridge.feedFiles → game.js filesAccept). Crash-proof by law
  // (AGENTS.md I/O): a throwing reader, a folder, a hostile dataTransfer — all degrade to a
  // quiet no-op or an honest status line; tablets simply use the picker. dragover claims the
  // WHOLE canvas whenever files are in flight (preventDefault is what makes drop fire at all,
  // and a stray drop must never navigate the page away from the child's machine) — the cursor
  // still says no-drop everywhere but over a Files block.
  function onDragOver(ev) {
    try {
      const kinds = ev.dataTransfer ? Array.prototype.slice.call(ev.dataTransfer.types || []) : [];
      if (!kinds.includes('Files')) return;
      ev.preventDefault();
      const { x, y } = at(ev);
      const o = plan && !bridge.running() ? objectAt(x, y) : null;
      const p = o && bridge.pieceById(o.id);
      ev.dataTransfer.dropEffect = (p && p.type === 'files') ? 'copy' : 'none';
    } catch (e) { /* a hostile dataTransfer never breaks the floor */ }
  }
  function onDrop(ev) {
    try {
      ev.preventDefault(); // even a miss must never turn into the browser opening the file
      if (!plan || bridge.running()) return;
      const { x, y } = at(ev);
      const o = objectAt(x, y);
      const p = o && bridge.pieceById(o.id);
      if (!p || p.type !== 'files') return;
      const files = ev.dataTransfer && ev.dataTransfer.files;
      if (!files || !files.length) return;
      // task F: hand the WHOLE pick across, raw — game.js's filesAccept owns the reader and the
      // decision of what the meal is (one table, a set of photos, or an honest refusal of a
      // mixed pick). The plate opens either way so the summary/progress/refusal has a face.
      bridge.feedFiles(p.id, files);
      selected = p.id;
      refresh();
      openPlate(p.id);
    } catch (e) { /* crash-proof: a bad drop is a no-op, never a dead floor */ }
  }
  /**
   * The WINDOW-level stray-file net (task E fix round 1, review 2026-08-29 Finding 5): while OS
   * files are in flight anywhere over the app, claim the browser's default so a drop on the
   * shelf, an open plate, or the header can never navigate the tab. Bubble-phase by nature: the
   * canvas's own onDragOver/onDrop above run first (target phase) and stay the ONE feed path —
   * this only swallows what missed them. Crash-proof: a hostile dataTransfer never breaks the
   * floor; non-file drags (a shelf press, a lead pull) pass through untouched.
   */
  function onWindowFileDrag(ev) {
    try {
      const kinds = ev.dataTransfer ? Array.prototype.slice.call(ev.dataTransfer.types || []) : [];
      if (!kinds.includes('Files')) return;
      ev.preventDefault();
      // Off-canvas the cursor honestly says no-drop — but never overwrite what the canvas
      // handler already set for its own hit-tested target (it ran before this bubble).
      if (ev.type === 'dragover' && ev.target !== cvs) ev.dataTransfer.dropEffect = 'none';
    } catch (e) { /* a hostile dataTransfer never breaks the floor */ }
  }
  /** Mouse only: reveal the sockets of whatever is under the pointer, and say what the press means. */
  function hoverAt(x, y) {
    if (!plan) return;
    // THE BAR IS RESOLVED FIRST, in the SAME order onPointerDown resolves it — the cursor's one
    // job is to promise what the press will actually do (whole-branch review Minor 8). Asking
    // the sockets first, as this did, disagreed with the press over the sliver where a socket's
    // 20 px grab radius and a handle's 12 px one overlap: the cursor showed `crosshair` and the
    // press took hold of the bar. A Splitter handle says "pull me sideways" before it is touched
    // — a bar nobody knows is draggable is a bar nobody drags.
    const idle = mode.kind === 'idle';
    const barObj = idle ? objectAt(x, y) : null;
    const onBar = barGrab(barObj, x, y) !== null;
    // A Car Maker knob promises the same thing the Splitter bar does: press and it turns. Resolved
    // BEFORE the sockets so the cursor tells the truth on the sliver where a knob and a socket
    // overlap (the bar's own Minor 8 fix, applied to the second in-block control on this floor).
    const onDial = (idle && !onBar && barObj) ? !!carmakerDial(barObj, x, y) : false;
    const s = (idle && !onBar && !onDial) ? grabSocketAt(x, y) : null;
    const o = s ? null : (idle ? barObj : objectAt(x, y));
    hover = s ? s.id : (o ? o.id : null);
    cvs.style.cursor = (onBar || onDial) ? 'ew-resize' : (s ? 'crosshair' : (o ? 'grab' : 'default'));
  }
  /**
   * WHY a thin wrapper: `onPointerUpOwned` below has many early returns (marquee/bar/cable/tap),
   * each of which would need its own "release gesturePointer" line duplicated in front of it — one
   * `finally` here does it exactly once, however the owned handler exits. Registered for BOTH
   * pointerup and pointercancel (a lifted finger and a browser-cancelled touch — the touch-action
   * edge case breaker finding #1 also named — must both let the next finger claim the floor).
   */
  function onPointerUp(ev) {
    if (gesturePointer !== null && ev.pointerId !== gesturePointer) return;
    try {
      onPointerUpOwned(ev);
    } finally {
      if (ev.pointerId === gesturePointer) gesturePointer = null;
    }
  }
  function onPointerUpOwned(ev) {
    const u = at(ev); const ux = u.x, uy = u.y;
    clearMarqueeTimer();
    // THE MARQUEE'S OWN RELEASE (task 4): picked = every object whose box intersects the drawn
    // rect. Fewer than two is a no-op with an honest hint — never a mode change, so an EXISTING
    // picked-mode (from an earlier, successful marquee) survives a failed re-try untouched, same
    // as a refused makePart survives below. Two or more REPLACES whatever picked-mode there was.
    if (marquee) {
      const rect = normMarquee(marquee);
      marquee = null; drag = null;
      // M1 (fix round 1): a long hold that never actually TRAVELED is not a drag-select attempt —
      // it is the lingering half of an ordinary deselect tap (the child held still meaning to
      // tap, and the long-press arm fired underneath them before the release). This falls through
      // to the EXACT tap this press would have produced before the marquee existed — never a
      // tooFew scold for a gesture the child never made. Same 6px "did this travel" measure the
      // arm's own cancel-on-move check uses (onPointerMove).
      if (Math.hypot(rect.w, rect.h) < 6) { onTap(ux, uy); return; }
      const hits = objectsInRect(rect);
      // Cables use the STRICTER rule: only a cable whose every vertex sits inside the box counts,
      // never one that merely crosses it — blocks still select on intersection. `rect` is the
      // marquee's own {x,y,w,h}; wiresInRectFully speaks corners, so convert EXPLICITLY — passing
      // the {x,y,w,h} shape through read x0/y0/x1/y1 as undefined and every NaN comparison came
      // back false, silently marking EVERY cable "fully enclosed".
      const wireHits = plan ? Layout.wiresInRectFully(plan.cables, { x0: rect.x, y0: rect.y, x1: rect.x + rect.w, y1: rect.y + rect.h }) : [];
      const wireIds = wireHits.map((c) => c.id).filter(Boolean);
      if (hits.length >= 2) {
        picked = hits;
        pickedWires = wireIds;
        selectedWire = wireIds.length === 1 ? wireIds[0] : null;
        selecting = true;
        chipMode = 'prompt';
        selected = null; bridge.select(null); closePlate();
        bridge.status(bridge.t('brick.hint.picked'));
        renderChip(); placeChip();
        // A box big enough to enclose cables almost always catches their blocks too, so the chip
        // alone would leave a picked cable with no way to delete it. The cable panel opens beside
        // it whenever the box caught any, so both groups stay actionable.
        if (wireIds.length) { selectedWire = wireIds[0]; openWirePlate(wireHits[0]); }
        bridge.tip('select'); // task 063 (spec R3): first picked-mode moment-help (flag no-ops the repeat).
      } else if (wireIds.length) {
        picked = [];
        pickedWires = wireIds;
        selectedWire = wireIds[0];
        selected = null; bridge.select(null); closePlate();
        openWirePlate(wireHits[0]);
        bridge.status(bridge.t('wire.multi', { n: wireIds.length }));
      } else {
        bridge.status(bridge.t('brick.why.tooFew'));
      }
      return;
    }
    // The bar was released: persist ONCE (changed() autosaves and refreshes, which is also what
    // brings an open plate's Training/Validation numbers back in step with the bar).
    if (mode.kind === 'bar') {
      const before = mode.from, id = mode.id;
      mode = { kind: 'idle' }; drag = null;
      const p = bridge.pieceById(id);
      const now = p ? splitterShares(p) : before;
      // Only a real move is worth an autosave + replan + plate reopen; a tap on a handle is not.
      if (!before || now.training !== before.training || now.validation !== before.validation) bridge.changed(bridge.t('hist.changed', { name: nameOf(id) }));
      return;
    }
    if (tutorialLead) {
      const src = (plan.sockets[tutorialLead.id] || []).find(s => s.port === tutorialLead.port);
      const r = cvs.getBoundingClientRect();
      if (src) (isItemSock(src) ? Art.beltLead : Art.rubber)(ctx, src, { x: tutorialLead.x - r.left + view.x, y: tutorialLead.y - r.top + view.y });
    }
    if (mode.kind === 'cable' && mode.live) {
      const pulled = mode.moved;
      mode.live = null; mode.hot = null;
      // A press that never travelled is not a failed drag — it is the first tap of the tap-tap
      // path, which stays because the canvas needs a gesture a keyboard/switch user can mirror.
      // See grabCable's own comment above — same missing piece-id argument, same fix.
      if (!pulled) { const src = mode.source; bridge.status(isItemSock(src) ? bridge.t('floor.beltTarget', { port: bridge.endWord(src.port, src.id) }) : bridge.t('floor.cableTarget', { port: bridge.portWord(src.port, src.id) })); return; }
      const hit = dropTarget(ux, uy);
      if (hit) { plug(hit); return; }
      mode = { kind: 'idle' }; bridge.status(bridge.t('floor.cableOff'));
      return;
    }
    // A Car Maker knob released. A real turn (travel) keeps the value the finger last set and
    // commits once; a TAP (press, no travel) turns the dial one notch, WRAPPING at the ends so every
    // value is reachable by taps alone — the tap-always-works law, and the same tap-vs-drag split
    // the Splitter bar just above keeps (there a tap is a no-op because the bar has no notch).
    if (mode.kind === 'dial') {
      const id = mode.id, prop = mode.prop, from = mode.from, moved = mode.moved, dragged = mode.value;
      const min = mode.min, max = mode.max, notch = mode.notch;
      mode = { kind: 'idle' }; drag = null;
      if (!moved) {
        const next = Layout.carmakerDialStep(from, min, max, notch);
        bridge.setDial(id, prop, next);
        bridge.status(bridge.portWord('dial:' + prop, id) + ' ' + next);
        if (next !== from) bridge.changed(bridge.t('hist.changed', { name: nameOf(id) }));
      } else if (dragged !== from) {
        bridge.changed(bridge.t('hist.changed', { name: nameOf(id) }));
      }
      return;
    }
    const d = drag; drag = null;
    if (!d) return;
    if (d.id && d.moved) {
      // Moving changes position only. Track assignment belongs to the explicit selector.
      bridge.changed(bridge.t('hist.moved', { name: nameOf(d.id) }));
      refresh();
      return;
    }
    onTap(ux, uy);
  }
  function onTap(x, y) {
    if (mode.kind === 'pending') {
      // A pending-candidate pick is a different gesture system than picked-mode entirely — any
      // lingering picked-mode here is stale regardless of what this tap does next.
      clearPicked();
      const o = objectAt(x, y);
      const hit = o && mode.candidates.find((c) => c.piece === o.id);
      // The name must be read BEFORE `mode` resets to idle (pre-existing bug, now charged to this
      // round since a made brick routes through this same pending-pick path): `mode.id` reads as
      // undefined once idle, and the status spoke "Coupled Track to ." with the second name blank.
      if (hit) { const toName = nameOf(mode.id); bridge.coupleTo(hit, mode.id); mode = { kind: 'idle' }; refresh(); bridge.status(bridge.t('floor.coupled', { a: nameOf(hit.piece), b: toName })); }
      else bridge.status(bridge.t('floor.pickEndAgain'));
      return;
    }
    if (mode.kind === 'cable') {
      clearPicked();
      if (mode.stage === 'source') {
        // The plate's Cable button asked "which socket?" — the same forgiving radius as a grab.
        const s = socketAt(x, y, GRAB, (id) => id === mode.from);
        if (s && grabCable(s, x, y)) { if (mode.kind === 'cable') mode.live = null; return; }
      } else {
        const hit = dropTarget(x, y);
        if (hit) { plug(hit); return; }
      }
      mode = { kind: 'idle' }; bridge.status(bridge.t('floor.cableOff'));
      return;
    }
    const o = objectAt(x, y);
    // PICKED-MODE'S OWN TAP LANGUAGE (task 4's "any tap outside clears it", plus fix round 1's
    // M5): while a group is live, a tap on ANY piece TOGGLES its membership instead of performing
    // that piece's ordinary action (poke/select/plate) — the group is what the child is working
    // on. A tap on EMPTY floor is still "outside" and clears the whole group, then falls through
    // to the ordinary empty-tap branch below (deselect) exactly as it always has.
    if (picked.length || selecting) {
      if (o) { togglePicked(o.id); return; }
      clearPicked();
    }
    if (o) {
      clearWirePick();
      // THE THINKING SCREEN (Ruling N, task-7 brief): a tap that lands inside the model's own
      // FACE — the orbit band of a reader arch, ONLY when it is showing a live picture — opens
      // the laboratory instead of today's plate. Anywhere else on the same block still behaves
      // exactly as before: this is a gesture split by WHERE the tap lands, never a second tap
      // system and never a button added to the plate.
      if (o.kind === 'reader' && isFaceTap(o, x, y) && openPanel(o.id)) return;
      // THE BOARD'S OWN LAB (Plan 3 task 5, spec §4: "Tapping it opens full screen"; fix round 1,
      // Escalation B). A tap on the CHART region opens the zoom — the reader's own split, applied
      // to the Board: boardBox() already paints a name-plate HEADER band separate from the chart
      // (logic/floor-layout.js's boardFace(w,h), the SAME function that band is drawn from), so a
      // tap that lands there instead falls through to the ordinary poke+plate path below,
      // restoring Delete/rename/cable reachability from the Floor for a placed Board — the same
      // two routes every other piece type already keeps.
      if (o.type === 'board' && isBoardFaceTap(o, x, y) && openBoardPanel(o.id)) return;
      // A SEALED PART'S OWN PORTHOLE (composing-arc task 6): the reader/Board split, applied to a
      // brick — but a brick has no header/chart to split, only its own small round window
      // (isBrickFaceTap, above), so Task 5's own centre-tap poke+plate case (the whole rest of the
      // body) is untouched by construction, not merely by convention.
      if (o.type === 'brick' && isBrickFaceTap(o, x, y) && openBrickPanel(o.id)) return;
      // openPanel() returning false (fix round 1, Finding 6) falls straight through to the plate
      // path below — a tap must never go silently nowhere just because BrainPanel failed to load
      // or the frozen decision could not be built (both defensive, not-expected-in-practice
      // guards; a tap that lands on nothing is a worse failure than a tap that opens the plate
      // instead of the lab it meant to).
      // A TOY ANSWERS A POKE. Touch the Sound and it plays its note, the Lamp lights, the Button
      // travels — running or not. A block that stays dead until a whole factory is built and wired
      // is a prop; this one line is what makes the shelf feel like objects instead of icons.
      const said = bridge.poke(o.id);
      if (o.type === 'button') last.presses[o.id] = t0();
      // The FRAME (Composing Arc Plan C, task 3) joins the lamp/noisemaker here: its poke is a
      // RE-PRESENTATION — the face brightens what it already holds for a moment (frameBox reads
      // `live.pokedAge`), the same "a touch does the real job, visibly" law, with nothing invented.
      // THE BRICK (composing-arc task 5) joins them for the identical reason: a sealed part has
      // nothing to invent either, only its own name to say again, a little louder (brickBox reads
      // `live.pokedAge` too).
      else if (o.type === 'lamp' || o.type === 'noisemaker' || o.type === 'frame' || o.type === 'brick') last.pokes[o.id] = t0();
      if (reduced) paint(0);
      if (said) bridge.status(said);
      // Mid-run a button is being PLAYED, not configured: no plate over the machine you are driving.
      if (o.type === 'button' && bridge.running()) return;
      if (selected === o.id && !plateEl.hidden) { closePlate(); return; }
      selected = o.id; bridge.select(o.id); openPlate(o.id);
    } else { selected = null; bridge.select(null); closePlate(); clearWirePick(); }
  }
  /**
   * Did (x, y) land inside a reader's own FACE (Ruling N, task-7 brief)? Reuses the SAME
   * geometry the face is drawn from — logic/floor-layout.js's readerFace(w, h), offset by the
   * object's own placement — so a tap can never disagree with what the child sees drawn there.
   * Gated on a LIVE view plan: a reader whose brain declares no view() (three of six brains), or
   * one that has read nothing yet, has no face to tap at all — every tap on it stays the plate,
   * unchanged, exactly as before this task.
   */
  function isFaceTap(o, x, y) {
    if (!bridge.viewPlan || !bridge.viewPlan(o.id)) return false;
    const face = Layout.readerFace(o.w, o.h);
    const ob = face.orbit;
    return x >= o.x + ob.x && x <= o.x + ob.x + ob.w && y >= o.y + ob.y && y <= o.y + ob.y + ob.h;
  }
  /**
   * Did (x, y) land inside a Board's own CHART region (fix round 1, Escalation B)? Reuses the
   * SAME geometry the mini face is drawn from — logic/floor-layout.js's boardFace(w, h), offset
   * by the object's own placement — so a tap can never disagree with what is drawn (the
   * readerFace precedent's own law, applied here). A tap on the HEADER band (the rest of the
   * box) is NOT the face — it falls through to the ordinary poke+plate path.
   */
  function isBoardFaceTap(o, x, y) {
    const face = Layout.boardFace(o.w, o.h);
    const c = face.chart;
    return x >= o.x + c.x && x <= o.x + c.x + c.w && y >= o.y + c.y && y <= o.y + c.y + c.h;
  }
  /**
   * Did (x, y) land inside a brick's own PORTHOLE (composing-arc task 6; fix round 1, MAJOR 1)?
   * A sealed part has no header/chart split — the CENTRE-tap poke+plate case (Task 5's own law,
   * brick-floor-browser.test.js) must survive untouched, so this is deliberately a SMALL circle
   * near the top, never "the whole box" — but the ACCEPT test below reads `porthole.acceptR`
   * (the forgiveness radius), not the smaller `r` the face actually PAINTS — the same drawn-nub
   * vs. grab-radius split every socket on this floor already keeps, sized so the accept region
   * clears the ≥44px touch-target law at native scale (logic/floor-layout.js's `brickFace` own
   * doc + `floor-layout.test.js`'s own pinned test).
   */
  function isBrickFaceTap(o, x, y) {
    if (!Layout.brickFace) return false;
    const p = Layout.brickFace(o.w, o.h).porthole;
    return Math.hypot(x - (o.x + p.cx), y - (o.y + p.cy)) <= p.acceptR;
  }
  /**
   * Open the laboratory over the Floor (Ruling P/R, task-7 brief). `bridge.frozenFor(id)` reads
   * the SAME lastQueryVec the face already draws from, once, at open — brain-panel.js never
   * touches game.js itself, only these bridge callbacks (Ruling R). Closes the plate first: the
   * two are mutually exclusive overlays on the same host, and a tap that opens one should not
   * leave the other sitting underneath it.
   */
  /**
   * @returns {boolean} true if the lab actually opened. False (fix round 1, Finding 6) is the
   *   caller's signal to fall through to the plate instead of the tap doing nothing at all — a
   *   live view plan implies a frozen vec exists, so these guards are defensive, not an expected
   *   path, but "defensive" must never mean "silently eats the tap".
   */
  function openPanel(id) {
    if (!window.BrainPanel || !bridge.frozenFor) return false;
    const frozen = bridge.frozenFor(id);
    if (!frozen) return false;
    closePlate();
    window.BrainPanel.open(host, frozen, {
      sessionFor: bridge.sessionFor,
      planFor: bridge.planFor,
      answerFor: bridge.answerFor,
      brains: bridge.brains ? bridge.brains() : [],
      t: bridge.t,
      // The lab asks for a voter's photo by EXAMPLE ID alone (Ruling R: brain-panel.js gets these
      // five facts and nothing else), but an example id only means something inside the sense that
      // filed it (vision-breaker F1). Bind the frozen reader's own sense here — the panel is frozen
      // on ONE model, so its owner is fixed for the life of this open.
      thumbOf: (exampleId) => bridge.exampleThumb(frozen.senseId, exampleId, frozen.pieceId),
    }, preTapFocus);
    return true;
  }
  /**
   * Open the Board's own zoom (Plan 3 task 5, spec §4). Unlike the reader's lab above (frozen on
   * ONE query vector — Ruling P), the Board's picture stays LIVE the whole time it is open: the
   * child can turn the watched dial and press an act Button from inside it, exactly as the spec
   * asks ("dials down the side so the child can turn and re-run without hunting the room"). Every
   * fact BoardPanel gets arrives through these deps closures (Ruling R, carried over from
   * brain-panel.js) — it never reaches into game.js, and never reads floor.js's own `lastLive`
   * directly either, only what these functions hand it.
   * @returns {boolean} true if the lab actually opened — false is the caller's signal to fall
   *   through to the plate (Finding 6's law, carried over: a tap must never go silently nowhere).
   */
  function openBoardPanel(id) {
    if (!window.BoardPanel) return false;
    const p = bridge.pieceById(id);
    if (!p) return false;
    closePlate();
    window.BoardPanel.open(host, id, {
      t: bridge.t,
      planFor: (points, box) => (window.WorkshopBoard ? window.WorkshopBoard.plan(points, box) : null),
      pointsFor: () => (lastLive[id] && lastLive[id].points) || [],
      // FINAL FIX ROUND, finding 1: the SAME three facts floor-art.js's boardBox() cascade
      // already reads off `live` — `wired`/`feedKind` come straight from bridge.boardFeed
      // (liveFor's board case already computes and caches them every frame; these are new
      // READERS of that existing cache, not a new computation), `heard` from fix round 2's own
      // arrival counter. Lets the panel mirror the floor face's honest-state cascade exactly,
      // instead of falling through to board.empty's "test something" invitation while the face
      // one panel over already says something truer.
      wired: () => !!(lastLive[id] && lastLive[id].wired),
      feedKind: () => (lastLive[id] && lastLive[id].feedKind) || null,
      heard: () => (lastLive[id] && lastLive[id].heard) || 0,
      watching: () => {
        const l = lastLive[id];
        if (!l || !l.watching) return null;
        return {
          block: l.watching.block, dial: l.watching.dial, word: l.watchWord || '',
          value: boardDialValue(l.watching.block, l.watching.dial),
        };
      },
      dials: () => (bridge.boardWatchOptions ? bridge.boardWatchOptions() : []),
      // FINAL FIX ROUND, finding 4 (strings law): an ARCHIVED chart's own `watching` is only ever
      // `{block, dial}` — the raw engine identifiers, never the translated word (`commit()` is
      // pure and has no access to portWord). The live log already gets its word from
      // `watching()`'s own `l.watchWord`; an archived row needs the SAME resolution for a dial
      // that may no longer even be the CURRENT watch — this is that resolver, so the panel never
      // has to render a raw prop name like "degree" where every other row says "Polynomial degree".
      wordFor: (blockId, dial) => bridge.portWord('dial:' + dial, blockId),
      setWatch: (value) => { if (bridge.setBoardWatch) bridge.setBoardWatch(id, value); },
      setDial: (blockId, prop, v) => bridge.setDial(blockId, prop, v),
      // task 061 (spec's found-defect 3): the slider's 'input' ticks setDial per-frame with no
      // commit (the setDial law: no autosave mid-drag); this is the 'change' gesture-end the
      // panel calls once, the SAME idiom as the Splitter bar's own release — ONE labeled entry.
      dialCommitted: () => {
        const l = lastLive[id];
        const word = (l && l.watchWord) || bridge.t('block.board');
        bridge.changed(bridge.t('hist.changed', { name: word }));
      },
      actButtons: () => boardActButtonsFor(),
      press: (btnId) => bridge.poke(btnId),
      archives: () => (bridge.boardCharts ? (bridge.boardCharts(id).chartArchive || []) : []),
      running: () => bridge.running(),
      // FIX ROUND 2 (vision-breaker MAJOR — the fingertip): the panel's own door back to the
      // plate — a convenience now that the header band (isBoardFaceTap's own "elsewhere") is a
      // real 44px target too, never the ONLY route. Closes the zoom, then opens the ordinary
      // plate for this same piece — the exact two-step a header tap already does in one gesture.
      openPlate: () => { if (window.BoardPanel) window.BoardPanel.close(); openPlate(id); },
    }, preTapFocus);
    return true;
  }
  /**
   * Open a sealed part's own small floor (composing-arc task 6, spec §8's "nothing invisible /
   * own small floor / live innards"). Same Ruling R every other panel here keeps: brick-panel.js
   * never reaches into game.js, only these deps closures — READ-ONLY (no plate, no edits; a
   * nested brick inside it draws as a face and speaks brick.nested.hint on tap, never drills
   * further in).
   *
   * `innerLive`/`innerCrates`/`wireLit` are the "liveFor-lite" the brief asks for: real reuse of
   * this file's OWN `liveFor` switch (via its `pieceOverride` param, above) rather than a second,
   * hand-rolled copy — imperfect for the handful of cases that read the OUTER `bridge`/`plan` by
   * bare id internally (a nested reader's own brain-view picture, a nested filter's own cable-glow
   * flag — both silently answer null/false for a piece sealed inside a brick, same as an
   * off-run/never-read block already answers honestly elsewhere on this floor) rather than a
   * second maintained switch that WOULD drift from the real one; every other kind (feeder, track,
   * gate, pen, bin, checker's own count, lamp, noisemaker, timer, counter, button, dice, sign,
   * frame, a nested brick's own poke halo…) reads exactly as it would on the main floor.
   * @param {string} id
   * @param {HTMLElement} [returnFocusTo]  where to restore focus on close — defaults to
   *   `preTapFocus` (the canvas-tap route, unchanged); the PLATE's own "See inside" row (fix
   *   round 1, MAJOR 1's DOM-twin half) passes `document.activeElement` explicitly instead, since
   *   a button click is not a canvas tap and `preTapFocus` would be stale by the time it fires.
   * @returns {boolean} true if the panel actually opened — false is the caller's signal to fall
   *   through to the plate (Finding 6's law, carried over from the reader/Board panels).
   */
  function openBrickPanel(id, returnFocusTo) {
    if (!window.BrickPanel) return false;
    const p = bridge.pieceById(id);
    if (!p || p.type !== 'brick' || !p.def) return false;
    closePlate();
    const prefix = id + '~';
    window.BrickPanel.open(host, id, {
      t: bridge.t,
      words: bridge.words,
      name: () => { const pp = bridge.pieceById(id); return (pp && pp.name) || bridge.t('block.brick'); },
      def: () => { const pp = bridge.pieceById(id); return (pp && pp.def) || null; },
      running: () => bridge.running(),
      ports: bridge.ports,
      thumbOf: bridge.thumbOf,
      status: bridge.status,
      // A def piece's own run-state, through this file's OWN liveFor — see its `pieceOverride`
      // doc, just above, for why a def piece can be handed straight through where every other
      // caller hands `undefined`.
      innerLive: (innerId) => {
        const pp = bridge.pieceById(id);
        const def = pp && pp.def;
        const innerPiece = def && (def.pieces || []).find((q) => q.id === innerId);
        if (!innerPiece) return null;
        const kind = Layout.kindOf(innerPiece);
        return liveFor({ id: prefix + innerId, kind, type: innerPiece.type }, innerPiece);
      },
      // bridge.crates() already resolves EVERY item on the table, inner ones included (their
      // pieceId is namespaced) — the main floor simply never draws one whose id has no entry in
      // ITS OWN plan.objects (floor.js's own paint(), "a crate whose pieceId has no plan object is
      // silently skipped"). This is that same list, filtered to THIS brick's own namespace and
      // stripped back to the def's own bare ids, so they land on the panel's OWN plan.objects.
      innerCrates: () => bridge.crates()
        .filter((c) => typeof c.pieceId === 'string' && c.pieceId.indexOf(prefix) === 0)
        .map((c) => Object.assign({}, c, { pieceId: c.pieceId.slice(prefix.length) })),
      // A def-internal wire's own glow, read straight off state.flatGlow with NAMESPACED keys —
      // the ONE glow source (game.js's own law) stays the one source; this only builds the keys a
      // wire sealed inside a brick actually glows under post-expansion (Brick.expand's own
      // `B.id+'~'+innerId` rule). Positional `bridge.wireLit(i)` cannot answer this: glowAlias is
      // parallel to the OUTER table's own wires array, and a def-internal wire never had a slot in
      // it (Brick.expand's own glowAlias doc: "a wire introduced by a def's own internal wiring
      // gets no slot").
      wireLit: (i) => {
        const pp = bridge.pieceById(id);
        const w = pp && pp.def && (pp.def.wires || [])[i];
        if (!w) return false;
        return bridge.flatGlowLit(prefix + w.from.block + ':' + w.from.port, prefix + w.to.block + ':' + w.to.port);
      },
    }, returnFocusTo || preTapFocus);
    return true;
  }
  function offersFor(fromId, s) {
    const out = [];
    const a = sockEnd(fromId, s);
    for (const id of Object.keys(plan.sockets)) {
      if (id === fromId) continue;
      for (const q of plan.sockets[id]) {
        if (bridge.canLink(a, sockEnd(id, q))) out.push(Object.assign({ id }, q));
      }
    }
    return out;
  }
  const onKeyDirty = dirtying(function onKeyWrapped(e) { return onKey(e); });
  function onKey(e) {
    if (e.key !== 'Escape') return;
    // The lab is a full-screen overlay above everything else on the host — Escape closes it
    // first, same priority order a modal dialog gets everywhere else in this file.
    if (window.BrainPanel && window.BrainPanel.debug().state) { window.BrainPanel.close(); return; }
    if (window.BoardPanel && window.BoardPanel.debug().open) { window.BoardPanel.close(); return; }
    if (window.BrickPanel && window.BrickPanel.debug().open) { window.BrickPanel.close(); return; }
    // Fix wave (M1): the invitation's Escape route. Guarded against a header drawer or a tip
    // being up — both ride their OWN document-level BUBBLE-phase keydown listeners (game.js:
    // closeDrawers, dismissTip), so on a press meant for one of THOSE this arm must stay out of
    // it: a drawer's Escape should only close the drawer, never also snuff an invitation the
    // child never touched. mount() (above) registers onKey in CAPTURE phase specifically so this
    // read happens BEFORE those bubble listeners react and mutate the very state being checked —
    // querying AFTER they ran would always see "already closed" and defeat the guard. (Queried
    // live off the DOM, same style as the BrainPanel/BoardPanel/BrickPanel debug() reads just
    // above — none of those externally-owned surfaces hand floor.js a bridge reader for "am I
    // open".)
    if (inviteEl && !document.querySelector('.drawer:not([hidden])') && !document.querySelector('.tipcard')) {
      dismissInvite();
      return;
    }
    // Picked-mode's own Escape route — the keyboard/switch mirror of the chip's cancel ×.
    if (picked.length || selecting) { clearPicked(); return; }
    // A selected cable's Escape route — the wire panel's own × in keyboard form.
    if (selectedWire !== null || pickedWires.length) { clearWirePick(); return; }
    // A bar drag abandoned by Escape keeps whatever the finger last set (a dial has no half-made
    // state to throw away) and says nothing — the cable-off line below would be a lie about it.
    if (mode.kind === 'bar') {
      const before = mode.from, p = bridge.pieceById(mode.id);
      const now = p ? splitterShares(p) : before;
      mode = { kind: 'idle' }; drag = null;
      if (before && (now.training !== before.training || now.validation !== before.validation)) bridge.changed(bridge.t('hist.changed', { name: nameOf(p.id) }));
      return;
    }
    // The Car Maker knob's own Escape route: a turn already made is KEPT (a dial has no half-made
    // state), committed if it moved, and nothing is said — the cable-off line below would be a lie.
    if (mode.kind === 'dial') {
      const id = mode.id, moved = mode.moved, dragged = mode.value, from = mode.from;
      mode = { kind: 'idle' }; drag = null;
      if (moved && dragged !== from) bridge.changed(bridge.t('hist.changed', { name: nameOf(id) }));
      return;
    }
    if (mode.kind !== 'idle') { mode = { kind: 'idle' }; drag = null; bridge.status(bridge.t('floor.cableOff')); return; }
    if (!plateEl.hidden) closePlate();
  }
  const nameOf = (id) => { const p = bridge.pieceById(id); return p ? (p.name || bridge.kindLabel(p)) : id; };

  // ---------- the marquee + "make this a part" (composing-arc "make your own part", task 4) ----------
  function clearMarqueeTimer() { if (marqueeTimer) clearTimeout(marqueeTimer); marqueeTimer = null; marqueeArm = null; }
  /** Begin drawing the box from the down-point — called once, when the long-press ARMS. */
  function startMarquee(x, y) { marquee = { x0: x, y0: y, x1: x, y1: y }; }
  /** The visible doorway (spec R1): enter picked-mode with nothing picked yet. */
  function enterSelectMode() {
    if (selecting) return; // already open — Cancel/Escape are the way out, not this button
    selecting = true;
    invalidate();
    clearWirePick(); // exclusive selection: entering block-group mode drops any cable highlight
    picked = [];
    chipMode = 'prompt';
    selected = null; bridge.select(null); closePlate();
    bridge.status(bridge.t('select.hint0'));
    renderChip(); placeChip();
    bridge.tip('select'); // task 063 (spec R3): first picked-mode moment-help.
  }
  /**
   * TAP-ONLY SELECTION, the other half (fix round 1, M5): a hold-without-move on a PIECE arms
   * exactly like the marquee's own empty-floor hold, but enters picked-mode with just that one
   * piece instead of drawing a box — the whole reason a marquee ever exists (picking more than
   * one piece by hand) doesn't require a drag gesture at all once picked-mode already knows how
   * to grow (togglePicked, below). A group already live is never discarded by a hold — a hold ADDS
   * (same as a fresh tap on a piece not yet in the group would); only a tap on empty floor, or the
   * chip's own cancel ×, throws the whole group away.
   * @param {string} pieceId
   */
  function startPickedHold(pieceId) {
    drag = null; // the hold WON this press — no object-move should follow it
    selecting = true;
    clearWirePick(); // exclusive selection: a piece hold drops any cable highlight
    invalidate();   // the timer that reaches here is outside the dirtying() handler wrapper
    if (picked.length) {
      if (picked.indexOf(pieceId) === -1) { picked = picked.concat([pieceId]); renderChip(); placeChip(); }
      return;
    }
    picked = [pieceId];
    chipMode = 'prompt';
    selected = null; bridge.select(null); closePlate();
    bridge.status(bridge.t('brick.hint.picked'));
    renderChip(); placeChip();
    bridge.tip('select'); // task 063 (spec R3): first picked-mode moment-help (flag no-ops the repeat).
  }
  /** A tap on a piece WHILE picked-mode is live adds or drops it (M5) — this is what makes a
   *  marquee's own result, or a single hold-picked piece, adjustable without starting over. */
  function togglePicked(id) {
    invalidate();
    const i = picked.indexOf(id);
    picked = i === -1 ? picked.concat([id]) : picked.slice(0, i).concat(picked.slice(i + 1));
    chipNote = ''; // membership change invalidates a stale refusal
    if (!picked.length && !selecting) { clearPicked(); return; }
    renderChip();
    placeChip();
  }
  /** The drag's two corners, sorted into a non-negative {x,y,w,h} rect — painting and hit-testing
   *  both want this shape; the raw `marquee` keeps the drag's OWN order so x1/y1 can just follow
   *  the finger every move without re-sorting on every frame. */
  function normMarquee(m) {
    const x = Math.min(m.x0, m.x1), y = Math.min(m.y0, m.y1);
    return { x, y, w: Math.abs(m.x1 - m.x0), h: Math.abs(m.y1 - m.y0) };
  }
  /** Every object (belts included — a sub-machine is belts and blocks alike) whose box intersects
   *  `rect` (ROOM px). Pure box-overlap, touching edges do not count — logic/floor-layout's own
   *  `overlaps` rule, inlined here since this compares against a RECT the layout never produces. */
  function objectsInRect(rect) {
    if (!plan) return [];
    const ids = [];
    for (const id of Object.keys(plan.objects)) {
      const o = plan.objects[id];
      if (o.x < rect.x + rect.w && o.x + o.w > rect.x && o.y < rect.y + rect.h && o.y + o.h > rect.y) ids.push(id);
    }
    return ids;
  }
  /** Drop picked-mode entirely — the chip and every halo it was driving. The ONE place that
   *  clears `picked`, called by a tap outside (onTap), Escape, the chip's own cancel ×, and a
   *  successful make. */
  function clearPicked() {
    selecting = false;
    picked = [];
    invalidate();
    chipMode = 'prompt';
    chipNote = '';
    if (chipEl) { chipEl.hidden = true; chipEl.textContent = ''; }
    clearWirePick();
  }
  /** The plan's own cable for a wire id, or null when it has gone (deleted, or a new machine). */
  function wireCableById(id) {
    return ((plan && plan.cables) || []).find((c) => c.id === id) || null;
  }
  /** The cable under a room point, within the fingertip tolerance — `plan.cables` carries the
   *  polyline geometry (plan Task 2), so hit-testing is a pure call, no recomputation here. */
  function wireAtPoint(x, y) {
    return plan ? Layout.wireAt(plan.cables, x, y, WIRE_TOL) : null;
  }
  /** Select ONE cable: block selection and the brick chip step aside, the detail popover opens. */
  function selectWire(c) {
    clearPicked();
    selected = null; bridge.select(null); closePlate();
    selectedWire = c.id;
    pickedWires = [c.id];
    openWirePlate(c);
    invalidate();
    bridge.status(bridge.t('wire.selected', { a: nameOf(c.from.id), b: nameOf(c.to.id) }));
  }
  /** Select ONE belt link (task 104): the panel names both ends and offers Reconnect / Disconnect. */
  function selectLink(l) {
    clearPicked();
    selected = null; bridge.select(null); closePlate();
    selectedLink = { from: l.from, end: l.end };
    renderBeltPlate(l);
    invalidate();
    bridge.status(bridge.t('belt.selected', { a: nameOf(l.from), b: nameOf(l.to) }));
  }
  /** The plan's own link for the selected out-plug, or null once it is gone. */
  function selectedLinkNow() {
    return selectedLink && plan ? (plan.links.find((l) => l.from === selectedLink.from && l.end === selectedLink.end) || null) : null;
  }
  /** Drop every cable selection (the empty-floor tap / Escape route). */
  function clearWirePick() {
    if (selectedWire === null && !pickedWires.length && !selectedLink) return;
    selectedWire = null; pickedWires = []; selectedLink = null; closeWirePlate();
    invalidate();
    if (reduced) paint(0);
  }
  /** Add or drop ONE cable from a live wire group (picked-mode's own membership rule, the twin of
   *  togglePicked for blocks). The panel follows the group: one member names both ends and offers
   *  Reconnect, many show the count and bulk Delete only, none close it. */
  function togglePickedWire(id) {
    const i = pickedWires.indexOf(id);
    pickedWires = i === -1 ? pickedWires.concat([id]) : pickedWires.slice(0, i).concat(pickedWires.slice(i + 1));
    selectedWire = pickedWires.length === 1 ? pickedWires[0] : (pickedWires.length ? selectedWire : null);
    invalidate();
    if (!pickedWires.length) { closeWirePlate(); if (reduced) paint(0); return; }
    const c = wireCableById(pickedWires[0]);
    if (c) openWirePlate(c);
    if (reduced) paint(0);
  }
  /** Rebuild the chip's own content for whichever half of the gesture it is currently showing —
   *  the prompt (Make this a part / cancel) or the naming step (a field, maxlength 24, defaulted
   *  to brick.name.default — the plate's own name-field idiom) it swaps to on tap. */
  function renderChip() {
    if (!chipEl) return;
    if (!picked.length && !selecting) {
      chipEl.textContent = '';
      chipEl.hidden = true;
      chipLiveEl = null;
      return;
    }
    chipEl.hidden = false;
    if (chipMode === 'naming') {
      chipEl.textContent = '';
      chipLiveEl = null; // naming mode carries no count/note surface — nothing to keep live
      const nameIn = document.createElement('input');
      nameIn.className = 'chipname';
      nameIn.maxLength = 24;
      nameIn.value = bridge.t('brick.name.default');
      nameIn.setAttribute('aria-label', bridge.t('brick.name.ask'));
      nameIn.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); confirmMake(nameIn.value); } });
      chipEl.appendChild(nameIn);
      const ok = document.createElement('button');
      ok.className = 'chipconfirm';
      ok.textContent = bridge.t('brick.make');
      ok.addEventListener('click', () => confirmMake(nameIn.value));
      chipEl.appendChild(ok);
      const cancel = document.createElement('button');
      cancel.className = 'chipx'; cancel.textContent = '×'; cancel.title = bridge.t('panel.close');
      cancel.setAttribute('aria-label', bridge.t('panel.close'));
      cancel.addEventListener('click', clearPicked);
      chipEl.appendChild(cancel);
      nameIn.focus(); nameIn.select();
    } else {
      // task 062 (spec R3): the chip SHOWS the selection, not just the verbs.
      // FIX WAVE (2026-09-08 final review, finding 4): keep the SAME `.chipcount` node attached
      // across repeated PROMPT-mode renders (togglePicked, the running-flip re-render, a real
      // table-change re-render — see `chipLiveEl`'s own doc) instead of tearing the whole chip
      // down and rebuilding it fresh every time. An in-place text mutation on a node that was
      // ALREADY in the accessibility tree is what aria-live actually announces; a brand-new node
      // born already carrying its text usually is not (which is exactly why `.chipnote`'s own
      // refusal text was going unannounced). Only a genuine mode switch (naming <-> prompt, or
      // the chip becoming live from scratch) starts a fresh node — everything else updates in
      // place.
      const fresh = !chipLiveEl || chipLiveEl.parentNode !== chipEl;
      if (fresh) {
        chipEl.textContent = '';
        chipLiveEl = document.createElement('div');
        chipLiveEl.className = 'chipcount';
        chipLiveEl.setAttribute('aria-live', 'polite');
        chipEl.appendChild(chipLiveEl);
      } else {
        // The live node stays put; drop only what came after it last render, then rebuild that.
        while (chipLiveEl.nextSibling) chipEl.removeChild(chipLiveEl.nextSibling);
      }
      const countText = picked.length
        ? bridge.t(picked.length === 1 ? 'select.countOne' : 'select.count', { n: picked.length })
        : bridge.t('select.count0');
      // The refusal note rides the SAME live node too (an in-place text update, always
      // announced) — the separate `.chipnote` element just below still carries the pure sentence
      // for sighted layout, unchanged.
      chipLiveEl.textContent = chipNote ? (countText + ' — ' + chipNote) : countText;
      if (chipNote) {
        const note = document.createElement('div');
        note.className = 'chipnote';
        note.textContent = chipNote;
        chipEl.appendChild(note);
      }
      const tokens = document.createElement('div'); tokens.className = 'chiptokens';
      for (const id of picked) {
        const tok = document.createElement('span'); tok.className = 'chiptoken';
        const nm = document.createElement('span'); nm.className = 'chiptokname'; nm.textContent = nameOf(id);
        tok.appendChild(nm);
        const x = document.createElement('button'); x.className = 'chiptokx'; x.textContent = '×';
        x.title = bridge.t('select.drop', { name: nameOf(id) });
        x.setAttribute('aria-label', bridge.t('select.drop', { name: nameOf(id) }));
        x.addEventListener('click', () => togglePicked(id));
        tok.appendChild(x);
        tokens.appendChild(tok);
      }
      chipEl.appendChild(tokens);
      // The add-select: the tap/keyboard twin of tapping the canvas. Its universe is EXACTLY
      // the marquee's own (plan.objects — belts included, spec §8), minus what is already in.
      const addSel = document.createElement('select');
      addSel.className = 'chipadd';
      addSel.setAttribute('aria-label', bridge.t('select.add'));
      const ph = document.createElement('option'); ph.value = ''; ph.textContent = bridge.t('select.add');
      addSel.appendChild(ph);
      for (const id of Object.keys((plan && plan.objects) || {})) {
        if (picked.indexOf(id) !== -1) continue;
        const p = bridge.pieceById(id);
        if (!p) continue;
        const o = document.createElement('option');
        o.value = id;
        o.textContent = nameOf(id) + ' — ' + bridge.kindLabel(p);
        addSel.appendChild(o);
      }
      // FIX WAVE (finding 7): zero remaining candidates leaves only the placeholder — an
      // operational-LOOKING but functionally empty dropdown (the dead-controls class: it still
      // looks tappable). Disable it honestly rather than let a child open it onto nothing.
      addSel.disabled = addSel.options.length <= 1;
      addSel.addEventListener('change', () => { if (addSel.value) togglePicked(addSel.value); });
      chipEl.appendChild(addSel);
      const make = document.createElement('button');
      make.className = 'chipmake';
      make.textContent = bridge.t('brick.make');
      if (bridge.running()) {
        // The 061 undo-buttons idiom: disabled with the honest reason as the title.
        make.disabled = true;
        make.title = bridge.t('hint.editWhileRunning');
      } else if (!picked.length) {
        // FIX WAVE (finding 8): 0 picked can never make a part — the tooFew refusal a 1-piece
        // group would still teach (a lone piece IS adjustable) has nothing left to teach at 0.
        // Disabled honestly up front, same idiom as the running case just above, saving the
        // child a wasted naming step for a make that can only ever fail.
        make.disabled = true;
        make.title = bridge.t('brick.why.tooFew');
      } else {
        make.addEventListener('click', () => { chipMode = 'naming'; renderChip(); placeChip(); });
      }
      chipEl.appendChild(make);
      const cancel = document.createElement('button');
      cancel.className = 'chipcancel';
      cancel.textContent = bridge.t('select.cancel');
      cancel.addEventListener('click', clearPicked);
      chipEl.appendChild(cancel);
    }
  }
  /** Position the chip over the picked group's own top edge (ROOM px, minus the pan) — same
   *  clamped-inside-the-floor law placePlate() already keeps, so neither overlay can wander off
   *  the visible window. Called wherever `picked`/the view could have moved (see replan()). */
  function placeChip() {
    // Fix round 1 (M5): a hold-picked group of exactly ONE is now a valid picked-mode (the chip
    // is how it grows from there) — this used to require >=2, the same stale assumption
    // replan()'s own reconciliation carried before this round.
    if (!chipEl || (!picked.length && !selecting) || !plan) return;
    const boxes = picked.map((id) => plan.objects[id]).filter(Boolean);
    const s0 = size();
    const w0 = chipEl.offsetWidth || 180, h0 = chipEl.offsetHeight || 44;
    if (!boxes.length) {
      // Zero members (button entry): dock bottom-center above the shelf until the first pick —
      // there is no group to anchor to yet. Same clamps as everything else in this window.
      chipEl.style.left = Math.max(8, (s0.w - w0) / 2) + 'px';
      chipEl.style.top = Math.max(8, s0.h - h0 - 16) + 'px';
      return;
    }
    const minX = Math.min.apply(null, boxes.map((o) => o.x));
    const maxX = Math.max.apply(null, boxes.map((o) => o.x + o.w));
    const minY = Math.min.apply(null, boxes.map((o) => o.y));
    const maxY = Math.max.apply(null, boxes.map((o) => o.y + o.h));
    const s = size();
    const w = chipEl.offsetWidth || 180, h = chipEl.offsetHeight || 44;
    let x = (minX + maxX) / 2 - w / 2 - view.x;
    x = Math.max(8, Math.min(s.w - w - 8, x));
    // Fix round 1 (discovered testing M5): prefer ABOVE the group, but a group near the room's
    // OWN top edge (every WALL piece — lamp, board, counter… — can sit there) used to just CLAMP
    // there instead, landing the chip squarely on the same row it was picked from and silently
    // swallowing a tap meant for whichever neighbour sat under it (a dead-controls shape: the
    // neighbour still LOOKS tappable). Below the group clears that row entirely; still clamped
    // into the window vertically, same law placePlate() already keeps.
    let y = minY - view.y - h - 12;
    if (y < 8) y = Math.min(s.h - h - 8, maxY - view.y + 12);
    chipEl.style.left = x + 'px';
    chipEl.style.top = y + 'px';
  }
  /**
   * The naming step's own confirm — cuts `picked` into a brick through bridge.makePart (Task 3's
   * pure core, wrapped). Success: picked-mode ends, the new brick becomes the ordinary single
   * `selected` and its plate opens (the SAME "just placed it" idiom addFromShelf/onDrop follow).
   * Refusal: SPOKEN via the three honest sentences (tooFew/watcher/watched) and picked-mode
   * SURVIVES so the child can adjust the group and try again — a 'stale' refusal (a picked piece
   * vanished between the pick and this tap) is already spoken by the bridge itself (a raw,
   * specific error), so this never pastes a second, vaguer status over it.
   *
   * FIX WAVE (2026-09-08 final review, Critical 1b): a fourth refusal, `why === 'running'`, was
   * missing here — reachable whenever the naming step was already open BEFORE Run started (the
   * chipmake button that opens naming only exists while NOT running, but nothing stops a child
   * confirming a name after pressing Run with the box still up). `applyMakePart` already refuses
   * and speaks `hint.editWhileRunning` on the status line, but its `{ok:false, why:'running'}`
   * fell through this function SILENTLY — the chip stayed stuck showing the name field with no
   * brick and no visible reason, dead until some unrelated edit happened to re-render it. Handled
   * the same way as the other three: back to 'prompt', the reason both in the chip and spoken.
   * @param {string} raw  whatever the name field currently holds
   */
  function confirmMake(raw) {
    invalidate();
    const name = (raw || '').trim() || bridge.t('brick.name.default');
    const res = bridge.makePart(picked.slice(), name);
    if (res && res.ok) {
      clearPicked();
      selected = res.id;
      bridge.select(res.id);
      refresh();
      revealNewestBrick();
      openPlate(res.id);
      bridge.status(bridge.t('brick.made', { name }));
      bridge.tip('made'); // task 063 (spec R3): first part-made moment-help.
      return;
    }
    const why = res && res.why;
    if (why === 'tooFew' || why === 'watcher' || why === 'watched') {
      // task 062 (spec R4): the honest sentence renders IN the chip (persistent until the
      // group changes) AND still speaks on the status line — two channels, as everywhere.
      chipNote = bridge.t('brick.why.' + why);
      chipMode = 'prompt';
      bridge.status(chipNote);
      renderChip(); placeChip();
    } else if (why === 'running') {
      chipNote = bridge.t('hint.editWhileRunning');
      chipMode = 'prompt';
      bridge.status(chipNote);
      renderChip(); placeChip();
    }
  }
  /**
   * Fix round 1, M4: a made part used to land wherever the library's own order put it, with no
   * cue at all if that was scrolled off the shelf. `refresh()` (just called by confirmMake) has
   * already rebuilt `brickShelfEl` with the newest entry as its last child — scroll it into the
   * shelf's OWN view (never the page's) the instant it exists, so the child sees exactly what
   * they just made sitting on their shelf.
   */
  function revealNewestBrick() {
    const last = brickShelfEl && brickShelfEl.lastElementChild;
    if (last && last.scrollIntoView) last.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }

  // ---------- the control plate ----------
  function openPlate(id, keepScroll) {
    const p = bridge.pieceById(id);
    if (!p) return;
    invalidate(); // the selection ring and the open block's socket rings are canvas ink
    // task F: switching the plate to ANOTHER piece is a close for the old one — tell the bridge
    // (a Files piece's running photo feed stops with its plate, the Teach panel's own law).
    // Re-opening the SAME plate (refresh's keepScroll path, a widget change) is not a close.
    const prev = plateEl.dataset.id;
    if (prev && prev !== id && bridge.plateGone) { try { bridge.plateGone(prev); } catch (e) { /* crash-proof */ } }
    const scroll = keepScroll ? plateEl.scrollTop : 0;
    plateEl.textContent = '';
    plateEl.hidden = false;
    plateEl.dataset.id = id;
    const head = document.createElement('div'); head.className = 'pbar';
    const nameIn = document.createElement('input');
    nameIn.className = 'pname'; nameIn.value = p.name || ''; nameIn.placeholder = bridge.kindLabel(p);
    nameIn.setAttribute('aria-label', bridge.t('widget.name'));
    nameIn.addEventListener('change', () => { p.name = nameIn.value.trim(); bridge.changed(bridge.t('hist.renamed', { name: nameOf(id) })); });
    head.appendChild(nameIn);
    const kind = document.createElement('span'); kind.className = 'pkind'; kind.textContent = bridge.kindLabel(p);
    head.appendChild(kind);
    const close = document.createElement('button'); close.className = 'pclose'; close.textContent = '×'; close.title = bridge.t('panel.close');
    close.setAttribute('aria-label', bridge.t('panel.close'));
    close.addEventListener('click', closePlate);
    head.appendChild(close);
    plateEl.appendChild(head);
    const body = document.createElement('div'); body.className = 'pbody';
    for (const row of bridge.rowsFor(p)) body.appendChild(row);
    // The Teach block's write target (spec R2): ONE named sense, chosen here, drawn as a tether.
    if (p.type === 'teach') {
      const row = document.createElement('div'); row.className = 'row watchrow';
      const lab = document.createElement('span'); lab.className = 'rlabel'; lab.textContent = bridge.t('floor.teaches');
      row.appendChild(lab);
      const sel = document.createElement('select');
      // Accessible name (axe "select-name", critical) — same reasoning as the watch-select above:
      // hand-built here, not through renderRow, so reuse the row's own visible label text.
      sel.setAttribute('aria-label', bridge.t('floor.teaches'));
      const none = document.createElement('option'); none.value = ''; none.textContent = bridge.t('floor.teachNone'); sel.appendChild(none);
      bridge.trainableSenses().forEach((s) => { const o = document.createElement('option'); o.value = s.id; o.textContent = s.name || bridge.senseName(s); sel.appendChild(o); });
      sel.value = p.teachTarget || '';
      sel.addEventListener('change', () => { bridge.setTeachTarget(p.id, sel.value || null); refresh(); openPlate(p.id, true); });
      row.appendChild(sel);
      body.appendChild(row);
    }
    // Cables touching this object, each removable; and the Cable button.
    const wires = bridge.wiresOf(id);
    if (wires.length) {
      const list = document.createElement('div'); list.className = 'pcables';
      for (const w of wires) {
        const line = document.createElement('div'); line.className = 'pcable';
        const txt = document.createElement('span');
        txt.textContent = nameOf(w.wire.from.block) + ' ' + bridge.portWord(w.wire.from.port, w.wire.from.block) + ' → ' + nameOf(w.wire.to.block) + ' ' + bridge.portWord(w.wire.to.port, w.wire.to.block);
        line.appendChild(txt);
        const x = document.createElement('button'); x.className = 'fdel'; x.textContent = '×'; x.title = bridge.t('floor.uncable');
        x.addEventListener('click', () => { bridge.unlink(w.index); refresh(); openPlate(id, true); });
        line.appendChild(x);
        list.appendChild(line);
      }
      body.appendChild(list);
    }
    const foot = document.createElement('div'); foot.className = 'pfoot';
    // task 062 (spec R5): movement's DOM twin — the drag writes bridge.setPos and commits ONE
    // labeled hist.moved (floor.js's own onPointerMove/onPointerUpOwned pair); each press here
    // does exactly the same, one layout step (logic/floor-layout.js's GAP = 44 — never a new
    // magic number). Deliberately position-only: the drag's drop-near-a-belt watch-coupling
    // stays gesture-only, so a nudge can never silently rewire (connection law).
    const NUDGE = 44;
    const move = document.createElement('div'); move.className = 'moverow';
    for (const [dir, glyph, mx, my] of [['left', '←', -1, 0], ['up', '↑', 0, -1], ['down', '↓', 0, 1], ['right', '→', 1, 0]]) {
      const b = document.createElement('button');
      b.className = 'movebtn';
      b.dataset.dir = dir;
      b.textContent = glyph;
      b.title = bridge.t('floor.move.' + dir, { name: nameOf(id) });
      b.setAttribute('aria-label', bridge.t('floor.move.' + dir, { name: nameOf(id) }));
      b.addEventListener('click', () => {
        const o = plan && plan.objects[id];
        if (!o) return;
        const beforeCx = o.cx, beforeCy = o.cy;
        const s = size();
        bridge.setPos(id, (o.cx + mx * NUDGE) / s.w, (o.cy + my * NUDGE) / s.h);
        // FIX WAVE (2026-09-08 final review, Important 2): re-lay BEFORE deciding whether this
        // was a real move — layout's own wall clamp (Math.max(o.w/2, ...) etc, floor-layout.js)
        // can leave a wall-pinned piece exactly where it started even though setPos just wrote a
        // new fx/fy. Committing `bridge.changed` unconditionally used to pile up "Moved" history
        // entries for a press that moved NOTHING — undo then visibly did nothing, poisoning
        // task 061's honest-undo law. Only a press that actually moved the piece earns history;
        // a blocked one earns an honest status line instead.
        refresh();
        const after = plan && plan.objects[id];
        if (after && after.cx === beforeCx && after.cy === beforeCy) {
          bridge.status(bridge.t('floor.move.blocked', { name: nameOf(id) }));
        } else {
          bridge.changed(bridge.t('hist.moved', { name: nameOf(id) }));
        }
        openPlate(id, true);
        // Fold-in 10: openPlate() just tore the whole row out and rebuilt it — the pressed
        // button's own replacement sits at the SAME data-dir, so hand focus back to IT rather
        // than dropping the child's keyboard/switch cursor to document.body.
        const again = plateEl.querySelector('.movebtn[data-dir="' + dir + '"]');
        if (again) again.focus();
      });
      move.appendChild(b);
    }
    foot.appendChild(move);
    if ((plan.sockets[id] || []).length) {
      const cableBtn = document.createElement('button'); cableBtn.className = 'cablebtn'; cableBtn.textContent = bridge.t('floor.cable');
      cableBtn.addEventListener('click', () => { mode = { kind: 'cable', stage: 'source', from: id }; bridge.status(bridge.t('floor.cableSource', { name: nameOf(id) })); invalidate(); });
      foot.appendChild(cableBtn);
    }
    if (!bridge.running()) {
      const del = document.createElement('button'); del.className = 'pdel'; del.textContent = bridge.t('node.delete');
      del.addEventListener('click', () => { closePlate(); bridge.remove(id); refresh(); });
      foot.appendChild(del);
    }
    body.appendChild(foot);
    plateEl.appendChild(body);
    placePlate();
    plateEl.scrollTop = scroll;
  }
  function closePlate() {
    invalidate();
    // task F: a closing plate says so through the bridge (crash-proof, optional) — a Files
    // piece's running photo feed stops the moment its plate goes away, the stopImport idiom.
    const gone = plateEl.dataset.id;
    plateEl.hidden = true; plateEl.textContent = ''; delete plateEl.dataset.id;
    if (gone && bridge.plateGone) { try { bridge.plateGone(gone); } catch (e) { /* crash-proof */ } }
  }
  /**
   * A cable is not a piece, so it gets its own small panel rather than the piece plate: it names
   * both ends and offers Delete, plus Reconnect — the latter only for a SINGLE cable, since a
   * marquee group has no one target to re-plug, so Reconnect is hidden above one selection.
   * @param {object} c the cable (`plan.cables` entry) whose ends and id this shows
   */
  function renderWirePlate(c) {
    if (!wirePlateEl) return;
    wirePlateEl.textContent = '';
    const rn = bridge.running();
    const head = document.createElement('div'); head.className = 'wptitle';
    head.textContent = bridge.t('wire.title');
    wirePlateEl.appendChild(head);
    const a = document.createElement('div'); a.className = 'wprow';
    a.textContent = bridge.t('wire.end', { block: nameOf(c.from.id), port: bridge.portWord(c.from.port, c.from.id) });
    wirePlateEl.appendChild(a);
    const b = document.createElement('div'); b.className = 'wprow';
    b.textContent = bridge.t('wire.end', { block: nameOf(c.to.id), port: bridge.portWord(c.to.port, c.to.id) });
    wirePlateEl.appendChild(b);
    if (pickedWires.length > 1) {
      const n = document.createElement('div'); n.className = 'wprow wpnote';
      n.textContent = bridge.t('wire.multi', { n: pickedWires.length });
      wirePlateEl.appendChild(n);
    }
    const foot = document.createElement('div'); foot.className = 'wpfoot';
    if (pickedWires.length === 1) {
      const re = document.createElement('button'); re.className = 'wpreconnect'; re.textContent = bridge.t('wire.reconnect');
      re.disabled = rn;
      re.title = rn ? bridge.t('hint.editWhileRunning') : bridge.t('wire.reconnect');
      re.addEventListener('click', () => {
        const cable = wireCableById(selectedWire);
        if (!cable) return;
        bridge.unlinkWire(cable.id);
        selectedWire = null; pickedWires = []; closeWirePlate();
        refresh();
        mode = { kind: 'cable', stage: 'source', from: cable.from.id };
        bridge.status(bridge.t('wire.reconnectFrom', { name: nameOf(cable.from.id) }));
      });
      foot.appendChild(re);
    }
    const del = document.createElement('button'); del.className = 'wpdel';
    del.textContent = bridge.t('node.delete');
    del.disabled = rn;
    del.title = rn ? bridge.t('hint.editWhileRunning') : bridge.t('node.delete');
    del.addEventListener('click', deleteSelectedWires);
    foot.appendChild(del);
    const x = document.createElement('button'); x.className = 'wpx'; x.textContent = '×';
    x.setAttribute('aria-label', bridge.t('panel.close'));
    x.addEventListener('click', clearWirePick);
    foot.appendChild(x);
    wirePlateEl.appendChild(foot);
    placeWirePlate(c);
  }
  function placeWirePlate(c) {
    if (!wirePlateEl || !c || !c.geom) return;
    const p = c.geom.pts[Math.floor(c.geom.pts.length / 2)] || c.from;
    const s = size();
    wirePlateEl.hidden = false;
    const w = wirePlateEl.offsetWidth || 220, h = wirePlateEl.offsetHeight || 120;
    wirePlateEl.style.left = Math.max(8, Math.min(s.w - w - 8, p.x - view.x)) + 'px';
    wirePlateEl.style.top = Math.max(8, Math.min(s.h - h - 8, p.y - view.y + 18)) + 'px';
  }
  function openWirePlate(c) { selectedLink = null; renderWirePlate(c); }
  /**
   * The BELT link's panel (task 104) — the cable panel's twin, in the same element: both ends by
   * block and belt end, Reconnect (pull this out-plug again) and Disconnect. Locked while running.
   * @param {object} l the link (`plan.links` entry)
   */
  function renderBeltPlate(l) {
    if (!wirePlateEl) return;
    wirePlateEl.textContent = '';
    const rn = bridge.running();
    const head = document.createElement('div'); head.className = 'wptitle';
    head.textContent = bridge.t('belt.title');
    wirePlateEl.appendChild(head);
    for (const [id, end] of [[l.from, l.end], [l.to, l.toEnd]]) {
      const r = document.createElement('div'); r.className = 'wprow';
      r.textContent = bridge.t('wire.end', { block: nameOf(id), port: bridge.endWord(end, id) });
      wirePlateEl.appendChild(r);
    }
    const foot = document.createElement('div'); foot.className = 'wpfoot';
    const re = document.createElement('button'); re.className = 'wpreconnect'; re.textContent = bridge.t('wire.reconnect');
    re.disabled = rn;
    re.title = rn ? bridge.t('hint.editWhileRunning') : bridge.t('wire.reconnect');
    re.addEventListener('click', () => {
      const src = (plan.sockets[l.from] || []).find((q) => q.dir === 'item-out' && q.port === l.end);
      clearWirePick();
      // Straight into "choose where it goes": the plug is already in hand, its fitting squares lit.
      // The old link stays until a new one replaces it — Escape leaves the machine as it was.
      if (src && grabCable(Object.assign({ id: l.from }, src), src.x, src.y)) mode.live = null;
      invalidate();
    });
    foot.appendChild(re);
    const del = document.createElement('button'); del.className = 'wpdel';
    del.textContent = bridge.t('belt.disconnect');
    del.disabled = rn;
    del.title = rn ? bridge.t('hint.editWhileRunning') : bridge.t('belt.disconnect');
    del.addEventListener('click', () => {
      if (bridge.running()) { bridge.status(bridge.t('hint.editWhileRunning')); return; }
      const from = l.from, end = l.end;
      clearWirePick();
      bridge.setItemRoute(from, end, null);
      refresh();
      bridge.status(bridge.t('belt.disconnected', { a: nameOf(from), b: nameOf(l.to) }));
    });
    foot.appendChild(del);
    const x = document.createElement('button'); x.className = 'wpx'; x.textContent = '×';
    x.setAttribute('aria-label', bridge.t('panel.close'));
    x.addEventListener('click', clearWirePick);
    foot.appendChild(x);
    wirePlateEl.appendChild(foot);
    const s = size();
    wirePlateEl.hidden = false;
    const w = wirePlateEl.offsetWidth || 220, h = wirePlateEl.offsetHeight || 120;
    const mx = (l.a.x + l.b.x) / 2, my = (l.a.y + l.b.y) / 2;
    wirePlateEl.style.left = Math.max(8, Math.min(s.w - w - 8, mx - view.x - w / 2)) + 'px';
    wirePlateEl.style.top = Math.max(8, Math.min(s.h - h - 8, my - view.y + 18)) + 'px';
  }
  function closeWirePlate() { if (wirePlateEl) { wirePlateEl.hidden = true; wirePlateEl.textContent = ''; } }
  /** Delete every selected cable in ONE history entry — one bulk delete a child undoes once. */
  function deleteSelectedWires() {
    if (bridge.running()) { bridge.status(bridge.t('hint.editWhileRunning')); return; }
    const ids = pickedWires.slice();
    if (!ids.length) return;
    for (const id of ids) bridge.unlinkWire(id, true);
    selectedWire = null; pickedWires = []; closeWirePlate();
    refresh();
    bridge.changed(bridge.t(ids.length === 1 ? 'wire.deletedOne' : 'wire.deleted', { n: ids.length }));
  }
  function placePlate() {
    const id = plateEl.dataset.id;
    const o = id && plan && plan.objects[id];
    if (!o) return;
    const s = size();
    const pw = Math.min(300, s.w - 16), ph = plateEl.offsetHeight || 200;
    // Clamp in viewport coordinates. Clamping room coordinates before subtracting the pan
    // could put the entire destination selector outside the visible floor after a connection.
    // Beside the object (right, else left), clamped inside the floor; never over the shelf.
    // Clear of the rim by more than a socket ring + its label: the plate used to open at +10,
    // directly on top of the out-sockets it was inviting the child to tap.
    let x = o.x - view.x + o.w + 28, y = o.y - view.y;
    if (x + pw > s.w - 8) x = o.x - view.x - pw - 28;
    if (x < 8) x = o.cx - view.x - pw / 2;
    x = Math.max(8, Math.min(s.w - pw - 8, x));
    y = Math.max(8, Math.min(s.h - ph - 8, y));
    plateEl.style.left = x + 'px'; plateEl.style.top = y + 'px'; plateEl.style.width = pw + 'px';
    plateEl.style.maxHeight = (s.h - 16) + 'px';
  }

  // ---------- painting ----------
  /**
   * What is happening right now, for the paint clock — the four facts it rates (logic/paint-clock.js).
   *   pointer: a pointer owns the floor (drag / pan / cable pull / marquee) — 60 Hz while held;
   *   live:    the machine is running, or a camera feed is on a viewfinder — 30 Hz;
   *   pulse:   a pending-candidate or picked halo is breathing — 30 Hz;
   *   hidden:  the tab is not visible — paint nothing until it is.
   * Anything else that changes the picture goes through invalidate() (refresh, resize, the plate,
   * the chip, every wrapped gesture handler) and is painted once, coalesced to the next frame.
   */
  function facts() {
    return {
      hidden: !!document.hidden,
      pointer: gesturePointer !== null || !!drag || !!marquee || (mode.kind === 'cable' && !!mode.live),
      live: !!(bridge && (bridge.running() || (bridge.camActive && bridge.camActive()))),
      pulse: mode.kind === 'pending' || picked.length > 0,
    };
  }
  // THE TRUE COST OF A PAINT (task 092): the draw calls in paint() are the cheap half. The browser
  // rasterises and commits the canvas AFTER paint() returns — on this same thread when the GPU is
  // not helping (headless, a blocklisted GPU, a VM): measured 3 ms of draw calls against ~30 ms of
  // raster per frame at 1x on a 1280x550 canvas, four times that on a throttled CPU. The next
  // animation frame cannot arrive until that work is done, so "paint start → next frame" is the
  // whole cost, and the backoff must rest the raster too or the sim starves anyway. One vsync
  // interval is subtracted so a cheap paint on a GPU machine is not charged the wait for the
  // frame it landed on. `paintStartedAt` is the paint awaiting that measurement.
  const FRAME_MS = 1000 / 60;
  let paintStartedAt = null, paintJsMs = 0;
  /** One wake of the paint loop (a RAF callback). */
  function loop(now) {
    raf = null;
    if (!mounted() || reduced) return;
    if (paintStartedAt !== null) {
      Clock.cost(clock, Math.max(paintJsMs, (performance.now() - paintStartedAt) - FRAME_MS));
      paintStartedAt = null;
    }
    const d = Clock.decide(clock, facts(), now);
    if (d.paint) {
      const t0 = performance.now();
      paint(now);
      const t1 = performance.now();
      Clock.painted(clock, t0, t1); // the draw-call cost; the whole frame's cost lands at the next wake
      paintJsMs = t1 - t0; paintStartedAt = t0;
      paints++;
      schedule(0); // always the very next frame after a paint: it measures, then decides
      return;
    }
    schedule(d.delayMs);
  }
  /** Wake the loop: on the next frame (≤ 16 ms), after a timeout, or never (null — invalidate() wakes it). */
  function schedule(delayMs) {
    if (delayMs === null || raf !== null || wakeTimer !== null) return;
    if (delayMs <= 16) { raf = requestAnimationFrame(loop); return; }
    wakeTimer = setTimeout(() => { wakeTimer = null; if (mounted() && raf === null) raf = requestAnimationFrame(loop); }, delayMs);
  }
  /**
   * Something the picture depends on changed: paint at the next frame (many calls coalesce into
   * one paint). Also what wakes a RESTING floor — the ambient animation resumes for another 30 s.
   * Crash-proof for callers that outlive mount (refresh() is one), and a no-op under reduced
   * motion, whose 400 ms interval never consults the clock.
   */
  function invalidate() {
    if (!mounted() || reduced || !clock) return;
    Clock.invalidate(clock, performance.now());
    if (wakeTimer !== null) { clearTimeout(wakeTimer); wakeTimer = null; }
    if (raf === null) raf = requestAnimationFrame(loop);
  }
  /**
   * TEST SEAM (task 092): paint synchronously, right now, through the very paint() the loop runs.
   * Before the paint clock the floor painted every frame, so a suite that hooked the canvas and
   * waited two frames always caught a paint; an idle floor now paints at 10 Hz and then rests, so
   * a capture must ASK for its paint. Goes through the clock like any other paint (the cost feeds
   * the backoff, the dirt is cleared). Never called by the product.
   * @returns {boolean} false when the floor is not mounted
   */
  function paintNow() {
    if (!mounted()) return false;
    const t0 = performance.now();
    paint(reduced ? 0 : t0);
    if (clock) Clock.painted(clock, t0, performance.now());
    paints++;
    return true;
  }
  /** Wrap a handler so the picture is marked dirty once it has run, whichever branch returned. */
  function dirtying(fn) {
    return function (ev) { try { return fn.call(this, ev); } finally { invalidate(); } };
  }
  let lastLive = {};   // test seam: what the last paint handed each object (see debug())
  // task 092: the table's pieces by id, built once per paint for liveFor() — bridge.pieceById is
  // an Array.find, and one per object per paint was a quadratic sweep. null outside a paint.
  let pieceMap = null;
  // Test seam for the view culling (task 5): what the last frame actually DREW — the ids of the
  // objects painted, plus a count for every other pass. tests/room-void-browser.test.js asserts
  // through it that nothing inside the window is ever culled and that the rest of the room is.
  let painted = { objects: [], links: 0, cables: 0, tethers: 0, crates: 0, sockets: 0 };
  /** Is ANY Splitter in this run dealing a LEARN act right now? The one fact on the floor that
   *  says which act is running — the Evaluator wears it so a Teach pass stops being a dead
   *  surface (vision-breaker 2026-09-02, finding 5).
   *  Answered ONCE PER TICK, not once per Evaluator per frame: liveFor runs inside the RAF loop,
   *  which competes with the engine's own interval for the main thread, and a sweep of every
   *  block sixty times a second buys nothing — the answer cannot change between ticks. */
  let learnAt = -1, learnFlag = false, learnRun = null;
  function anySplitterLearning(run) {
    // Keyed on the RUN as well as the tick (whole-branch review M6): these are module-scoped and
    // nothing reset them between runs, so a fresh run's tick 1 could read a stale answer left by
    // the previous run's tick 1 — a Teach act that looks live on a machine that is not, or the
    // reverse. Comparing the run object itself makes a new run a guaranteed miss.
    if (learnRun === run && learnAt === run.tick) return learnFlag;
    learnRun = run; learnAt = run.tick; learnFlag = false;
    for (const id of run.blockOrder) {
      const b = run.blocks[id];
      if (b && b.pass && b.pass.mode === 'learn') { learnFlag = true; break; }
    }
    return learnFlag;
  }
  // task 106 fix round 1: same staleness class `anySplitterLearning` guards against, one map
  // over — `last.carrying` is module-scoped and nothing reset it between runs, so a fresh run's
  // early ticks could read a tick number the PREVIOUS run left behind and misread it as recent
  // (run.tick resets to a small number every Run; a leftover entry from a long previous run would
  // otherwise misfire as "just carried" for that run's whole opening stretch). Comparing the run
  // object itself, exactly like `learnRun` above, makes a new run a guaranteed clean slate.
  let carryingRun = null;
  /**
   * Hold `busy`'s CRATE half for the same freshness window `wireGlowLit` gives its SIGNAL half
   * (task 106 fix round 1). Without a hold, a brick's `carrying` flag is instantaneous — true only
   * on the exact paint a crate happens to be inside it — so a fast Feeder over a short sealed belt
   * (real gaps between crates) chattered `live.busy` true/false every paint a gap spans. That drove
   * the seam's breathing glow (floor-art.js) past this product's flash-safety floor (never more
   * than 3 changes/second) — a flicker source `live.running`'s old, whole-run-stable gate never had.
   * @param {object} o    the brick's own plan object (keyed by o.id, same key `last.pokes` uses)
   * @param {object} run  the live run (bridge.getRun()) — run.tick is the clock, never Date.now
   *   (banned in this codebase's logic, and the paint clock doesn't tick on it either)
   * @param {boolean} carryingNow  bridge.crates() says a crate is inside it THIS paint
   * @returns {boolean} true on the paint a crate is seen and for FOUR ticks after — `run.tick - at
   *   < 5` spans at..at+4, the same window wireGlowLit uses
   */
  function carryingHeld(o, run, carryingNow) {
    if (carryingRun !== run) { last.carrying = {}; carryingRun = run; } // fresh Run, fresh slate
    if (carryingNow) last.carrying[o.id] = run.tick;
    const at = last.carrying[o.id];
    return at !== undefined && run.tick - at < 5;
  }
  /**
   * THE LIT PATH (task-9 brief, spec §5.3): re-read bridge.litPath() ONCE per paint() call, not
   * once per object (the SAME "answered once per frame, not once per block" discipline
   * anySplitterLearning keeps just above — liveFor runs inside the RAF loop, and the answer
   * cannot change between two objects on the same frame). `blocks` becomes a Set here so every
   * object's own membership check in liveFor() is O(1) instead of re-filtering the table on every
   * call. Null whenever bridge.litPath() is: nothing is being inspected, the inspection went
   * stale (a table edit or a fresh Run — Ruling 3), or nothing from that trail survives on the
   * table (Ruling 5) — bridge.litPath() decides all three; this only caches its answer for the
   * frame.
   */
  let litPathNow = null;
  function refreshLitPath() {
    const raw = bridge.litPath ? bridge.litPath() : null;
    litPathNow = raw ? { blocks: new Set(raw.blocks), exits: raw.exits } : null;
  }
  // TUTOR SEAM (car-gallery tutorial): a Set of the piece ids a running tutorial wants LIT — every
  // object NOT named dims, exactly the way a lit path dims its off-route blocks. `null` is the
  // default (no tutorial): the lit-path rule below is the only dim, byte-identical to before this
  // seam existed, so free play is unchanged. Set/cleared by `setTutorialFocus()`, read once per
  // object in `liveFor()` and given PRECEDENCE over `litPathNow` (a tutorial spotlighting three
  // parts must not have a lit route re-light, or out-dim, its own scene).
  let tutorialFocus = null;
  /**
   * @param {object} o  a plan object — normally one of `plan.objects`, keyed by a real table id
   * @param {object} [pieceOverride]  BrickPanel's own "liveFor-lite" (openBrickPanel, below) reads
   *   the run's live state for a piece SEALED inside a brick's def, which `bridge.pieceById` can
   *   never resolve (it only knows the OUTER `state.table`, and a def piece's bare id was never
   *   placed there — only its NAMESPACED id, `brickId+'~'+innerId`, lives in `run.blocks`). Passing
   *   the def piece straight through skips that one failing lookup; `run.blocks[o.id]` already
   *   reads correctly off the namespaced id with no change at all (Brick.expand's own contract:
   *   every namespaced piece/snap/wire is exactly what `Snap.snapToLayout`/`Engine.createRun`
   *   already accept). Every OTHER call site is unchanged — one argument, `bridge.pieceById(o.id)`,
   *   exactly as before.
   */
  function liveFor(o, pieceOverride) {
    const p = pieceOverride || (pieceMap ? (pieceMap.get(o.id) || null) : bridge.pieceById(o.id));
    const run = bridge.getRun();
    const rs = run && run.blocks[o.id];
    const words = bridge.words;
    const live = { words, running: !!run };
    // THE LIT PATH (task-9 brief, spec §5.3 "the road not taken carries a lot of the lesson"):
    // `litPathNow` is refreshed once per paint() call, not once per object (refreshLitPath's own
    // doc) — every block NOT on the inspected crate's route dims (floor-art.js's `draw()` reads
    // `live.dim`). No lit path being inspected leaves `live.dim` unset on every block, same as
    // before this feature existed.
    //
    // Final whole-branch review, Important I1: `!pieceOverride` guards this — a def piece sealed
    // inside a brick (`openBrickPanel`'s own `innerLive`, above, is the ONE caller that ever hands
    // a pieceOverride) is read against a NAMESPACED id (`brickId+'~'+innerId`), which
    // `currentLitPath()` can never emit (`unwrapBrickId` collapses every trail id back to its
    // outer brick before the set is built). Without this guard, EVERY inner block of EVERY open
    // brick panel dimmed the instant any path was lit anywhere — including the exact Model
    // "See inside" exists to let a child inspect. `litPathNow` only ever describes the OUTER
    // floor's own route; it has no opinion on what is sealed inside a part, so a pieceOverride
    // read skips it entirely rather than answering a question it cannot actually address.
    // TUTOR SEAM takes PRECEDENCE over the lit path: while a tutorial has set `tutorialFocus`, that
    // set ALONE decides who dims — a lit route must not re-light a block the tutorial wants dimmed,
    // nor out-dim the tutorial's own spotlit parts. `null` (the default) falls straight through to
    // the lit-path rule, so free play is byte-identical to before this seam existed.
    if (!pieceOverride && tutorialFocus) { if (!tutorialFocus.has(o.id)) live.dim = true; }
    else if (!pieceOverride && litPathNow && !litPathNow.blocks.has(o.id)) live.dim = true;
    if (!p) return live;
    switch (o.kind) {
      case 'feeder': live.items = bridge.feederItems(p); live.rate = p.rate; break;
      case 'datafeed': { const info = bridge.datasetInfo(p); Object.assign(live, info); break; }
      case 'track': live.speed = p.speed; break;
      // The Camera block shows WHAT IT SEES. bridge.camVideo already returns the webcam element,
      // or the demo reel's canvas when ?demo=1 — one source, both modes, no branch here.
      case 'camera': live.video = bridge.camVideo(p); live.every = p.every; break;
      // The FILES block (task E): the pile it ate and how far the deal has run — rows is the
      // committed table's length, dealt the engine's own cursor while running. The painter
      // (floor-art.js filesBox) shrinks the visible pile as dealt climbs.
      case 'files': {
        // task G: a SAMPLE has no stored rows at all (it is a reference — the run seed generates
        // the table), so its name and pile size come off the registry through the SAME bridge the
        // Data feed pallet reads (datasetInfo), never a second lookup here.
        const sample = p.dataset ? bridge.datasetInfo(p) : null;
        live.fileName = p.libraryData ? bridge.t(window.WorkshopModelLibrary.nameKey(p.libraryData.dataset)) : p.fileName || (p.table && p.table.name) || (sample ? sample.label : '');
        if (p.libraryData) live.rows = p.libraryData.ids.length;
        else if (sample) live.rows = sample.rows;
        else if (p.table) live.rows = p.table.rows.length;
        // task F: a photo meal counts the same pile — the painter's shrinking stack and its
        // "7 / 48" readout are honest for pictures too, art untouched.
        else if (p.photos && p.photos.length) live.rows = p.photos.length;
        if (rs && Number.isFinite(rs.cursor)) live.dealt = rs.cursor;
        break;
      }
      // THE SPLITTER: its whole face is the split it is carrying, so the shares come through the
      // one reader that knows a dial lives in two places (running rig first, piece second).
      //
      // …and WHAT IT IS HOLDING, which is the other half of the block's claim (vision-breaker
      // 2026-09-01, finding 2: two screenshots of this block 1.1 s apart with 48 rows pouring in
      // were byte-identical, while every other block on the floor moved). `held` is each pile's
      // deck size RIGHT NOW and `dealt` is what that pile was ever given — under Plan 2's
      // permanent decks those two are the same number, so `held` no longer carries any drain of
      // its own; it stays as the gauge's "is there a run at all" signal and as the deck size a
      // reader can check the printed count against. All of it comes off the engine's own run
      // state (logic/engine.js's splitter branch), the same path binCount / checkerSummary /
      // lastTally take — never a second source.
      case 'splitter': {
        Object.assign(live, splitterShares(p));
        if (rs && rs.piles && rs.dealt) {
          live.held = { training: rs.piles.training.length, validation: rs.piles.validation.length, test: rs.piles.test.length };
          live.dealtBy = { training: rs.dealt.training, validation: rs.dealt.validation, test: rs.dealt.test };
          // THE ACT, live (Plan 2): which pile is dealing and how far through it is. The gauge
          // draws from this now — the decks are permanent, so "how much is still inside" stopped
          // being a fact that changes; "how far the act got" is the fact that does.
          live.passing = rs.pass
            ? { pile: rs.pass.pile, mode: rs.pass.mode,
                frac: rs.piles[rs.pass.pile].length ? rs.pass.cursor / rs.piles[rs.pass.pile].length : 1 }
            : null;
          // THE TABLE IS DEALT (vision-breaker 2026-09-02, finding 9). Rows are apportioned ON
          // ARRIVAL, so once the source is spent the bar can no longer change anything about the
          // piles this run — and the block was still drawing the DIALS over them. Drag it to
          // 30/50 after the feed finished and the face printed "30% 50% 2…" above the counts
          // 29/10/9 (= 60/21/19 %): the picture, the printed number and the pile it would deal
          // were three different answers at once, on the one block whose whole claim is that the
          // proportion IS a picture. From here on the bar draws what the machine actually holds,
          // and the grab is refused with a word (barFrozen, below) rather than moving a handle
          // that governs nothing.
          const total = bridge.sourceTotal ? bridge.sourceTotal(o.id) : null;
          const n = live.dealtBy.training + live.dealtBy.validation + live.dealtBy.test;
          live.spent = total !== null && n > 0 && rs.taken >= total;
        }
        break;
      }
      // THE BOARD (task 4): its whole face is memory ACROSS runs (spec §10/§11), so liveFor hands
      // it both halves — the piece's own committed record (bridge.boardCharts, task 5's Stop
      // writes it) and this run's own still-forming points (bridge.boardView, live while a run
      // exists, null otherwise) — merged into ONE points list for drawing: committed points for
      // the CURRENT chartKey, the run's own points appended (they can never overlap — a fresh
      // Run starts a fresh `s.acts`, and only Stop ever commits into `p.charts`).
      //
      // `watching` prefers the RUN's own frozen copy while one exists: setBoardWatch (game.js)
      // mirrors the picker into it on every change, so turning the picker mid-run moves the
      // chart's x-axis at once — the same "a dial write must ACT, not just look operational" law
      // every other dial on this floor keeps. Before the first Run there is no frozen copy to
      // read, so this falls back to the PIECE (Task 3's own note: run.byId is a COPY of pieces —
      // live reads come from the run, piece reads from the piece) — otherwise the face would sit
      // blank on `board.noWatch` even after a child had already picked a dial, right up until Run.
      case 'board': {
        const feed = bridge.boardFeed ? bridge.boardFeed(o.id) : { wired: false, kind: null };
        live.wired = feed.wired;
        live.feedKind = feed.kind;
        const view = bridge.boardView ? bridge.boardView(o.id) : null;
        const watchRaw = (view && view.watching) || (p.watchBlock && p.watchDial ? { block: p.watchBlock, dial: p.watchDial } : null);
        // R6 (fix round 1, breaker + review finding): a watch naming a piece the room no longer
        // has must fall to the SAME no-watch state a never-picked Board shows — never keep
        // painting a dead dial's caption or its stale points. game.js's deletePiece already
        // clears watchBlock/watchDial the instant the watched piece is deleted (the same
        // watchPiece/teachTarget idiom every other named reference on this floor already
        // follows), so this is normally a no-op; it is the FLOOR's own backstop against any
        // other path that could leave a stale reference behind (an older save, say) — checked
        // here, not merely assumed upstream.
        const watching = (watchRaw && bridge.pieceById(watchRaw.block)) ? watchRaw : null;
        live.watching = watching;
        // FIX ROUND 2 — the relay-watch lie: how many signals this run heard at `watch` with no
        // usable pass (a relay's own re-emission, always). Read regardless of `watching`, same as
        // `live.wired`/`feedKind` above — it names a property of this Board's INCOMING traffic,
        // not of what it currently watches.
        live.heard = (view && view.heard) || 0;
        // `live.points` only exists at all once `watching` is valid — boardBox's own cascade
        // never reads it before that (its `!live.watching` branch returns first), but leaving a
        // stale run's points sitting on `live` regardless was exactly the shape of bug this fix
        // round closes elsewhere: a fact nothing currently reads is still a fact something LATER
        // could misread (a panel/zoom view, say) — so it is never even assembled here.
        live.points = [];
        if (watching) {
          const wp = bridge.pieceById(watching.block);
          live.watchName = wp ? (wp.name || bridge.kindLabel(wp)) : watching.block;
          live.watchWord = bridge.portWord('dial:' + watching.dial, watching.block);
          const bc = bridge.boardCharts ? bridge.boardCharts(o.id) : { charts: null };
          const key = Board ? Board.chartKey(watching) : null;
          const committedChart = (key && bc.charts && bc.charts[key]) || null;
          // FIX (spec §11's boundary, finding 3b): a committed chart is only "live" while its OWN
          // fp still matches the CURRENT machine. Without this check, rewiring (or swapping the
          // dataset/brain) and NOT yet pressing Stop left the old chart painting as live — face,
          // zoom, and log — right through the entire next run, concatenating old-machine points
          // with new-machine points into exactly the mixed curve §11 calls "a lie a child cannot
          // spot". A stale committed chart is simply excluded here; commit()'s own archive sweep
          // (finding 3a) still runs at the NEXT Stop and keeps it, labelled, forever — this is
          // only about what paints as CURRENT before that Stop happens.
          const committed = (committedChart && committedChart.fp === boardFp) ? committedChart.points : [];
          // FIX ROUND 1 — the mixed-chart honesty bug (spec §3), the LIVE half: a run's own
          // points each carry the watch that was ACTUALLY active when they were stamped
          // (engine.js's boardView, fix round 1). Filtering to only those whose OWN watch
          // matches the CURRENT key is what stops a mid-run picker switch (no Stop) from mixing
          // an earlier dial's readings into the picture the instant the child switches — the
          // exact bug the review drove and confirmed live, one layer above WorkshopBoard.commit's
          // own identical fix.
          const runPointsRaw = (view && view.points) || [];
          const runPoints = key ? runPointsRaw.filter((pt) => Board && Board.chartKey(pt.watch) === key) : [];
          live.points = committed.concat(runPoints);
        }
        break;
      }
      // A gate's live "which way is armed" reads sorter's armedExit, then latch's OWN persistent
      // exit slot (task B — a different field so a sorter's per-item consumption never bleeds into
      // a latch's permanent one), then trapdoor's plain armed flag; grabber draws no arm at all.
      case 'gate': {
        live.armed = rs && rs.armedExit !== null && rs.armedExit !== undefined ? rs.armedExit
          : rs && rs.exit !== null && rs.exit !== undefined ? rs.exit
          : (rs && rs.armed ? 0 : null);
        // THE LIT PATH's own gate exit (task-9 brief, Ruling 4: existing vocabulary only): with
        // no live rig to read an armed exit off, the INSPECTED crate's trail still says which
        // chute it actually took — reuse gate()'s OWN brass-highlighted-arm drawing exactly as a
        // live run already gets it, rather than inventing a second "this exit is lit" primitive.
        // `litPathNow.exits` never names a sibling exit (Ruling 1), so this can only ever pick
        // the one the crate really went down.
        if (live.armed === null && litPathNow) {
          const hit = litPathNow.exits.find((e) => e.gate === o.id);
          if (hit) live.armed = hit.exit - 1; // trail exits are 1-based; `armed`/gate()'s `k` are 0-based
        }
        break;
      }
      // THE PEN (task B): held is the visible pile's size; open is the latch a child reads off
      // the gate's own bars (floor-art.js's pen()) — the same two fields the deal loop mutates.
      case 'pen': live.held = rs ? rs.held.length : 0; live.open = !!(rs && rs.open); break;
      case 'bin': {
        live.count = rs ? rs.count : (bridge.binCount(o.id));
        if (rs && last.counts[o.id] !== undefined && rs.count > last.counts[o.id]) last.burst[o.id] = t0();
        last.counts[o.id] = rs ? rs.count : undefined;
        if (last.burst[o.id]) live.burstAge = t0() - last.burst[o.id];
        break;
      }
      case 'checker': {
        live.count = rs ? rs.count : undefined;
        live.tally = rs ? bridge.checkerSummary(o.id) : bridge.lastTally(o.id);
        live.kind = p.kind || 'labels';
        // THE FILING COUNT (vision-breaker 2026-09-02, finding 5). A Teach act opens 29 crates in
        // front of the child over 15.6 s and this block used to say NOTHING about any of them:
        // engine.js swallowChecked deliberately keeps a filed crate out of `count`, `log` and
        // every tally (correct — teaching is not a test), so every word painted on the face was
        // byte-identical before, during and after. The block HAD the fact and nobody handed it
        // over. `unread` rides along for the same reason: an act that graded nothing because
        // nothing read it must be able to say so on its own face.
        live.filed = rs ? rs.filed : undefined;
        live.unread = rs ? rs.unread : undefined;
        // Is the Splitter dealing a LEARN act right now? That is what makes the filing count the
        // thing to show instead of the score — and it is the only thing on this screen that says
        // which act is running. Read off the run's own splitters, not stored anywhere.
        live.learning = !!(run && anySplitterLearning(run));
        live.filedNote = rs && rs.filed ? bridge.t('tally.filedNote', { n: rs.filed }) : '';
        // …AND THE UNREAD COUNT IS DRAWN, not merely computed (whole-branch review I3). The
        // comment above promised the Evaluator "must be able to say so on its own face" and
        // nothing did: quiz-before-teach dealt 29 crates past a Model that answers null, and for
        // ~15 s the block painted `opened 0` / `Training —` / `Held-out —`, byte-identical
        // to idle. Scoped to the state where it IS the whole story — nothing has ever been
        // graded here — so once a lane carries a real number the lanes do the talking and this
        // steps aside rather than fossilising on the face for the rest of the session.
        live.unreadNote = rs && rs.unread > 0 && !rs.count ? bridge.t('tally.unreadNote', { n: rs.unread }) : '';
        // THE LESSON, IN ONE SENTENCE. On a tablet the scoreboard has no room for both the
        // numbers and a picture worth reading (floor-art keeps the numbers — the owner's ruling),
        // and the best line in the whole lesson was two taps deep on the evidence sheet. It fits
        // here in words, so the block itself says what the two numbers mean.
        // Both sentences below are rebuilt only when the Evaluator has opened another crate: they
        // are string-building inside the RAF loop, and nothing they say can change between
        // swallows. (The same reason the tolerance lookup above is throttled.)
        const seen = rs ? rs.log.length + ':' + rs.filed + ':' + rs.unread : 'idle';
        const cache = last.tol[o.id + '#say'];
        if (cache && cache.seen === seen) {
          live.gapLine = cache.gap; live.verdictWord = cache.word; live.verdict = cache.verdict;
          live.laneWords = cache.caps; live.noKeyKey = cache.caps.noKeyKey;
        } else {
          live.gapLine = live.tally && bridge.gapSentence ? (bridge.gapSentence(live.tally) || '') : '';
          // THE LANE BARS' OWN WORDS (task 108 review, Important 1). Task 108 put the crates that
          // carried no answer key into the lane's count and gave them no segment, so the bar drew
          // a black gap nothing named, under a percentage computed from a smaller pile. The bar
          // now carries a fourth chalk segment (floor-art laneBar) — these are the words for it:
          // a caption that names its own denominator when the two differ, and a key under the
          // lanes for the new colour. Built off the TALLY, not run state, so a stopped machine's
          // bars keep their explanation; cached here with the other two sentences because this is
          // string-building inside the RAF loop.
          live.laneWords = bridge.tallyCaptions ? bridge.tallyCaptions(live.tally) : null;
          live.noKeyKey = live.laneWords ? live.laneWords.noKeyKey : '';
        }
        // The stopped face retains its tally: its explanation must use those same counts.
        live.noKeyNote = live.laneWords ? live.laneWords.noKeyNote : '';
        live.unsureKey = live.laneWords ? live.laneWords.unsureKey : '';
        // The Evaluator grades a NUMBER machine against an allowance (its own tolerance dial, or
        // the crate's stamped one) — the scale the mean-error bars are drawn against, so the bar
        // is a reading of something real rather than of the other bar.
        // Resolved at most twice a second, and only for the kind that draws it: it walks the
        // table's snaps and wires to find this belt's feed, and this runs inside the RAF loop
        // once per Evaluator per frame. A dial write shows up within 500 ms, which is well
        // inside "the dial moved and the face followed".
        if (live.kind === 'number' && bridge.checkerTolerance) {
          const c = last.tol[o.id];
          if (!c || t0() - c.at > 500) last.tol[o.id] = { at: t0(), v: bridge.checkerTolerance(p) };
          live.tolerance = last.tol[o.id].v;
        }
        const lastLog = rs && rs.log.length ? rs.log[rs.log.length - 1] : null;
        // Captioned APART from the count above it (finding 11): "39" is what was opened, this is
        // what the LAST one was — stacked bare they read as one phrase, "39 right", about 39
        // crates three of which were wrong.
        if (!cache || cache.seen !== seen) {
          // `words` is game.js floorWords(), keyed by the TAIL of each string key ('right',
          // 'wrong', 'unsure', 'filed', 'unread', and 'unscorable' since task 108) — the lookup
          // here asked for 'verdict.right' and got undefined, so this caption has been painting
          // "last: undefined" for every verdict. Found while task 108 added the fifth word to the
          // same line; a caption that can only ever be wrong is not a caption.
          if (lastLog) { live.verdict = lastLog.verdict; live.verdictWord = bridge.t('checker.lastCrate', { verdict: words[lastLog.verdict] || '' }); }
          last.tol[o.id + '#say'] = { seen, gap: live.gapLine, word: live.verdictWord, verdict: live.verdict, caps: live.laneWords || { noKeyKey: '' } };
        }
        // THE PICTURE (task 5): guess-vs-truth from the checker's OWN log — passed as a FUNCTION
        // (same pattern as `viewPlan` for the reader, below) so floor-art.js supplies the exact
        // box its own card layout already computed, instead of this file duplicating that math.
        live.plan = bridge.checkerView;
        break;
      }
      case 'reader': {
        live.senseName = bridge.senseName(p);
        live.brain = bridge.brainName(p);
        const r = bridge.lastReading(o.id);
        // An unsure scan stamps with label null (game.js faceStamps): the eye LOOKED and did not
        // name it. Say that, rather than '—', which reads as "nothing has happened here".
        live.reading = r ? (r.label || (r.unsure ? words.notSure : '')) : '';
        live.unsure = !!(r && r.unsure);
        // The face's live picture (spec §5.2). Passed as the FUNCTION itself, called by reader()
        // with the object id, so floor-art.js never needs to know the bridge shape — same
        // pattern as every other bridge call.
        live.viewPlan = bridge.viewPlan;
        break;
      }
      case 'teach': live.shelf = p.shelf; break;
      // THE CAR MAKER (car-galleries task 11): the two knobs and the target, read run-first /
      // piece-second — the same "a dial lives in two places" law splitterShares keeps — so the
      // numbers the knobs print and the numbers the engine will build from cannot disagree
      // mid-run. Only dials the piece itself declares are handed over; a piece with no dialSpec
      // draws none rather than inventing a knob for a control it does not have.
      case 'carmaker': {
        const spec = (p.dialSpec && p.dialSpec.dials) || [];
        const runD = rs && rs.dials ? rs.dials : null;
        live.label = bridge.kindLabel(p);
        live.dials = spec.map((d) => {
          const v = runD && Number.isFinite(runD[d.id]) ? runD[d.id] : (Number.isFinite(p[d.id]) ? p[d.id] : d.def);
          return { prop: d.id, label: d.label || d.id, value: v, min: d.min, max: d.max };
        });
        const tgt = spec.find((d) => d.id === 'target');
        const tv = tgt ? (runD && Number.isFinite(runD.target) ? runD.target : (Number.isFinite(p.target) ? p.target : tgt.def)) : p.target;
        if (Number.isFinite(tv)) live.target = tv;
        break;
      }
      case 'sign': live.shown = rs ? rs.shown : null; break;
      // THE FRAME (Composing Arc Plan C, task 3). Three facts, and the third is the whole reason
      // this case is not one line like the Sign's above:
      //   shown   — the ENGINE's own run memory (run.blocks[id].shown, task 1's `frame:show` ACT
      //             case): {label, value, nearest:{id,display,sense}|null, tick} or null. Read straight,
      //             with no `||` fallback — null means "nothing handed to me in THIS run", which
      //             is a state the face has its own honest sentence for (words.frameEmpty).
      //   caption — the ONE line of words the face paints, composed by game.js's own frameCaption
      //             so the face and the poke status line can never disagree (and so a verbose
      //             brain's sentence is capped before it reaches a 132 px box).
      //   thumb   — RESOLVED AT READ TIME, per painted frame block, THROUGH THE SENSE THAT
      //             ANSWERED. The engine keeps a REFERENCE only (sense + id + display, never
      //             pixels — task 1's own law); turning that reference into a drawable picture is
      //             a host concern, and `bridge.exampleThumb` is the SAME Cam.thumbs map the Teach
      //             panel's own chips and the brain lab's voter photos read. Both halves of the
      //             reference go in: example ids are allocated per brain and every sense owns one,
      //             so a bare id resolved against a flat map painted ANOTHER Model's photograph
      //             (vision-breaker F1, 2026-09-05 — a word Model's Frame showing the camera
      //             Model's cup). null is the ordinary answer, not a failure: a text/number
      //             example never had a photo, and a photo taken in an earlier session is gone by
      //             law (Cam.thumbs is memory-only — the children's-privacy rule), which is
      //             exactly what the face's second state exists to say.
      //
      // THE CULLING LAW (Plan B, task 5): this costs ONE map lookup for ONE block, and liveFor is
      // called only for objects the frame actually paints (paint()'s own inView pass) plus the one
      // or two an open panel keeps alive. Nothing here walks the shelves, the examples, or the
      // other blocks — a room of 360 pieces pays for the Frames on screen and no more.
      case 'frame': {
        const shown = rs ? rs.shown : null;
        live.shown = shown;
        live.caption = bridge.frameCaption(shown);
        live.thumb = (shown && shown.nearest && bridge.exampleThumb) ? bridge.exampleThumb(shown.nearest.sense, shown.nearest.id, shown.nearest.owner) : null;
        const poked = last.pokes[o.id] ? t0() - last.pokes[o.id] : Infinity;
        live.pokedAge = poked;
        break;
      }
      // THE BRICK (composing-arc task 5; busy computation added task 106): a sealed part's face
      // shows the poke halo every piece gets, PLUS its own "alive in there" pulse — `live.busy`,
      // computed below from what is actually crossing the part's OWN boundary this run, never from
      // `live.running` (any run up, whether or not THIS part is doing anything). It takes real
      // per-piece computation because a part can be busy on either of two independent planes:
      //   · a SIGNAL crossed one of its own face ports recently. Read POSITIONALLY off the OUTER
      //     table's own cables — every cable that starts OR ends at this piece (a face port is as
      //     readily an IN port as an OUT one), asked `bridge.wireLit(c.index)`. That is the same
      //     shape `case 'filter':` below already uses for its armature, and it is deliberately
      //     NOT a hand-rebuilt flat key (re-review finding 2): `Brick.expand` RECURSES, so a face
      //     port forwarding into a NESTED part flattens to `outer~mid~lmp:on`, never the one-hop
      //     `outer~mid:on` a key assembled here could produce — so a nested part's face used to
      //     never breathe on a signal at all. `glowAlias` is parallel to the OUTER table's own
      //     `wires` array and already names wherever expansion moved each endpoint, at ANY depth,
      //     so the positional read is depth-proof for free.
      //     It closes the inverse too. A wire sealed WHOLLY INSIDE the def gets no glowAlias slot
      //     (Brick.expand's own doc: "a wire introduced by a def's own internal wiring gets no
      //     slot") and no cable on this floor either — so a part with no outer signal wire at all
      //     can no longer read busy off its own internals, which is exactly what this paragraph
      //     promises and the old `flatGlowLit(key, null)` scan quietly broke.
      //     ONE known limit: a part read through an OPEN BRICK PANEL (liveFor's `pieceOverride`
      //     route) wears a NAMESPACED `o.id` that no outer cable names, so its signal half reads
      //     false there and only the crate half speaks. That is the same limitation `case
      //     'filter':` has always had on that route, and openBrickPanel's own doc already concedes
      //     the class. Be precise about what is lost: NOTHING answers a nested part's busy flag on
      //     that route today. The panel's own `wireLit`, above, paints the def-internal WIRES —
      //     a different question, and not a substitute for this one.
      //   · a CRATE is inside it (bridge.crates() resolves inner crates by their namespaced
      //     'bk~innerId' pieceId — see its own doc, game.js), HELD for the same 5-tick window as
      //     the signal half (carryingHeld, above — fix round 1: an instantaneous read chattered
      //     true/false across the real gaps a fast Feeder over a short belt leaves between crates,
      //     which drove the seam's breathing glow past the 3Hz flash-safety floor).
      // Glow alone would leave every belt-only part looking asleep: the engine emits 'glow' for
      // signal deliveries only (logic/engine.js:969), so a part built to pass crates — the exact
      // thing this feature exists to make possible — would carry a Feeder's whole output and
      // still read as idle.
      case 'brick': {
        const poked = last.pokes[o.id] ? t0() - last.pokes[o.id] : Infinity;
        live.pokedAge = poked;
        if (run) {
          // No plane filter is needed: `plan.cables` is built from `table.wires` alone
          // (floor-layout.js's floorPlan), so it is the SIGNAL plane by construction — a belt
          // coupling lives in `plan.links` and is answered by the crate half below instead.
          const lit = (plan.cables || []).some((c) => (c.from.id === o.id || c.to.id === o.id) && bridge.wireLit(c.index));
          const carryingNow = bridge.crates().some((c) => c.pieceId.indexOf(o.id + '~') === 0);
          live.busy = lit || carryingHeld(o, run, carryingNow);
        }
        break;
      }
      case 'lamp': {
        live.colour = p.colour;
        // Lit by the MACHINE, or by a finger: a poked lamp holds for its own `seconds` dial,
        // so touching it shows exactly what a wire on `on` would do.
        const poked = last.pokes[o.id] ? t0() - last.pokes[o.id] : Infinity;
        live.lit = (!!rs && bridge.isLampLit(o.id)) || poked < (p.seconds || 1) * 1000;
        live.pokedAge = poked;
        break;
      }
      // The horn's rings expand for 600 ms after the note it is ringing for — one shot, not a loop.
      case 'noisemaker': live.rang = t0() - bridge.soundAt(o.id); live.playing = live.rang < 600; break;
      case 'timer': {
        live.seconds = p.seconds;
        if (rs) {
          const n = Math.max(1, Math.round((p.seconds || 1) * 10));
          live.frac = ((run.tick - (rs.lastFire || 0)) % n) / n;
          live.fired = run.tick - (rs.lastFire || 0) < 3;   // the moment it went off
        }
        break;
      }
      case 'counter': live.count = rs ? rs.count : 0; break;
      case 'memory': {
        const s=rs && rs.composition;
        live.valueText=s ? s.stored.label : p.initialLabel;
        live.detailText=String(s ? s.stored.value : p.initialValue); break;
      }
      case 'calculate': case 'join': {
        const s=rs && rs.composition;
        live.valueText=s && s.last ? s.last.label : bridge.t('composition.waiting');
        live.detailText=s && s.notice ? bridge.t('composition.review') : p.type==='join' ? bridge.t('composition.pairs',{n:s ? Object.keys(s.waiting).length : 0}) : bridge.t('opt.'+p.operation);
        break;
      }
      case 'filter': {
        live.rule = bridge.ruleWord(p);
        // The armature CLOSES while a signal is leaving this relay. Read off the block's own
        // out-cable, the same glow the cable itself draws with, so the box and the wire agree.
        live.passed = (plan.cables || []).some((c) => c.from.id === o.id && bridge.wireLit(c.index));
        break;
      }
      // The window draws the numbers it is holding right now — its memory IS its face.
      case 'window': live.win = rs && rs.win ? rs.win.slice() : []; live.says = bridge.optWord(p, 'mode'); break;
      case 'button': if (last.presses[o.id]) live.pressedAge = t0() - last.presses[o.id]; break;
      case 'dice': {
        live.weights = rs && rs.weights ? rs.weights : null;
        // The engine's field is lastPick (0-based; -1 = nothing rolled yet). `lastFace` never existed
        // on run state, so the card always fell back to face 1 / the poke roll while the Display next
        // to it told the truth (audit §2.8) — the one gallery built to teach "watch the weights" lied.
        live.lastFace = rs && Number.isInteger(rs.lastPick) && rs.lastPick >= 0 ? rs.lastPick : null;
        live.face = p.n ? '1–' + p.n : '';
        live.faces = Math.max(1, Math.round(p.n || 2));
        // A poked die tumbles and settles on a SEEDED face (game.js owns the draw, so it stays
        // deterministic and replayable). With a run, the run's own roll wins.
        const dr = bridge.demoRoll(o.id);
        if (dr) { live.rollAge = t0() - dr.at; if (live.lastFace === null || live.lastFace === undefined) live.lastFace = dr.face; }
        break;
      }
      // THE SPEAKER (Composing Arc Plan A, task 3): `speaking` is HOST timing state (task 2's
      // state.voice.speaking, via the bridge) — true only while a speak() promise is actually in
      // flight. `lastSaid` is what the face SHOWS — while speaking, the word ACTUALLY being said
      // right now (state.voice.spokenText, task 3 — the one field a POKE's own speech reaches
      // too, since the engine's run memory never sees a poke, R3); once done, back to the
      // ENGINE's own run memory (rs.lastSaid, task 1's createRun init) — absent before any run
      // exists or before a WIRE has ever said anything, which is exactly the idle "—" state the
      // brief asks for (the Board's own "the run holds the memory" law, applied here — a poke's
      // speech is a demonstration, not a fact the machine remembers once it stops talking).
      case 'speaker': {
        const speaking = bridge.voiceSpeaking(o.id);
        live.speaking = speaking;
        live.lastSaid = speaking ? bridge.voiceSpokenText(o.id) : (rs ? rs.lastSaid : null);
        // task 064 R2c: a DEVICE fact, read live every paint — same idiom the Microphone's own
        // canListen keeps just below (charter 5) — so floor-art.js can tell "no voice at all"
        // apart from an ordinary silent moment between words.
        live.canSpeak = bridge.voiceCanSpeak();
        // task P3b (plan §3): a private session keeps the word off any voice service. A DEVICE
        // fact of the same kind as canSpeak, read live for the same reason.
        live.privateQuiet = bridge.privateBlocksSpeak();
        break;
      }
      // THE MICROPHONE: `heard` stays THREE-VALUED all the way to floor-art.js (undefined = never
      // finished a listen, null = finished and heard nothing, a string = the transcript) — task
      // 2's own R4 contract, read here with no `||` fallback that would collapse it. `consent` is
      // read LIVE every paint (R6: a Task-3 plate flip on ANY mic must show on EVERY mic at once,
      // never only the one that was actually blocked last).
      case 'microphone': {
        live.listening = bridge.voiceListening(o.id);
        live.heard = bridge.voiceHeard(o.id);
        // Fix round 1 (review LOW finding 3): `live.blocked` (the per-block HINT) was computed
        // here every frame and read by nobody — floor-art.js's own cascade has always derived the
        // blocked SENTENCE from `live.consent` (live WorkshopConsent, below), never this hint.
        // Deleted rather than carried "in case a caller wants it" — the dead-controls law.
        live.consent = bridge.consentSTT();
        // task P3b (plan §3): while private examples are held, nothing listens — read live, and
        // ahead of `consent` in floor-art.js's cascade, because it refuses before consent is even
        // consulted (performListen's own first line).
        live.privateBlocked = bridge.privateBlocksListen();
        // Breaker fix round, charter 5: a device fact, not a per-listen one — read live, same as
        // `consent` just above, so floor-art.js can split ITS OWN heard===null branch into
        // "this device can never listen" vs "heard nothing this time" without state.voice.heard
        // losing its established three-valued (undefined/null/string) contract.
        live.canListen = bridge.voiceCanListen();
        break;
      }
      default: break;
    }
    lastLive[o.id] = live;
    return live;
  }
  /** The point on object `o`'s own rectangle boundary nearest a straight line toward (tx, ty) —
   *  the Board's tether (task 4) starts here, not at its centre, so the dashed line visibly
   *  leaves the BLOCK rather than floating from its middle through its own steel body. */
  function boxEdgeToward(o, tx, ty) {
    const dx = tx - o.cx, dy = ty - o.cy;
    if (!dx && !dy) return { x: o.cx, y: o.cy };
    const hw = o.w / 2, hh = o.h / 2;
    const scale = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity, 1);
    return { x: o.cx + dx * scale, y: o.cy + dy * scale };
  }
  /**
   * THE ROOM'S OWN GEOMETRY FOR THIS FRAME — the plan's world-space bands with the pan taken off,
   * so `Art.room` can paint one WINDOW'S worth of hall wherever the window happens to be.
   *
   * WHY the bands travel and the hall's size does not (vision-breaker 2026-09-05, Drive 2,
   * `[major]`): the room used to be painted at CANVAS size *under* `translate(-view.x, -view.y)`,
   * so it existed over world rect (0,0)-(canvas) and nowhere else — pan right on any machine wider
   * than the window and the lit floor, the grid and the hazard strip stopped dead and the child's
   * blocks floated in flat black. Task 2's FIT_MIN law makes rooms bigger than the window the
   * DEFAULT, so that stopped being an edge case. Painting the room over the whole WORLD instead
   * would fix the picture and cost the earth (4519x9363 of gradients and a concrete tile to match);
   * painting a window's worth at the window's own offset costs exactly what it costs today.
   *
   * The three seams stay glued to the blocks that live in them — wall.y, front.y and the belt lane
   * are world values shifted by the pan, never re-anchored to the screen — and the floor stretches
   * to fill everything between them, right down to the room's own bottom edge. At view 0,0 on a
   * machine that fits, every number below is byte-identical to the old call.
   */
  function roomBands(s) {
    const b = plan.bands, world = plan.world || s;
    const beltYs = plan.belts.map((q) => q.y).sort((p, q) => p - q);
    const lane = beltYs.length ? beltYs[Math.floor(beltYs.length / 2)] : null;
    // The front strip keeps the height the LAYOUT gave it — that height is what its shading is
    // composed for, and `placeRow` sized the Buttons standing in it to match. What it also has to
    // do is reach the bottom of the ROOM, or a machine panned to its last row shows a sliver of
    // void under the actors' edge. Those are two different jobs, so they are two numbers:
    // `h` is the strip, `overhang` is the room's own bottom margin below it (floorPlan's world
    // pass always adds ~34 px of socket-tag clearance plus a margin, so this is almost never 0).
    // Folding the overhang into `h` — which is what this did in fix round 1 — stretched the
    // strip's own P.front -> #06080c gradient by ~40 % on a machine that fits the window (measured
    // 111.7 -> 156.9 px at 1024x768), so the visible strip stopped reaching its dark end and the
    // first screen's tone changed on a machine that never pans. floor-art paints the overhang flat
    // in that dark end colour instead (review fix round 3, finding 1).
    const frontH = b.front.h > 0 ? b.front.h : 0;
    const floorBottom = frontH ? b.front.y : world.h;
    return {
      wall: { y: b.wall.y - view.y, h: b.wall.h },
      floor: { y: b.floor.y - view.y, h: Math.max(0, floorBottom - b.floor.y) },
      front: { y: b.front.y - view.y, h: frontH, overhang: frontH ? Math.max(0, world.h - b.front.y - frontH) : 0 },
      lane: lane === null ? null : lane - view.y,
    };
  }

  function paint(now) {
    if (!mounted() || !plan) return;
    replan();
    refreshLitPath();
    const t = reduced ? 0 : now;
    let s = size();
    // The shelf can change height after mount (a gallery with more block kinds adds a row), and
    // onResize only fires on a WINDOW resize — so the canvas would keep painting at the old size
    // while every coordinate was computed at the new one. Re-sync when they disagree. Rounded to
    // whole pixels on BOTH sides (fix wave, see onResize's own doc) — sub-pixel float noise
    // between two `size()` samples must never itself read as "disagree".
    if (cvs.style.width !== Math.round(s.w) + 'px' || cvs.style.height !== Math.round(s.h) + 'px') { onResize(); s = size(); }
    ctx.clearRect(0, 0, s.w, s.h);
    clampView();
    // The hall, in SCREEN space, BEFORE the pan (see roomBands): one window's worth of room at the
    // window's own offset. `view.x` rides along so the repeating texture is laid out in ROOM x —
    // a plaster seam belongs to the wall it is cast in, not to the glass the child looks through.
    Art.room(ctx, s.w, s.h, roomBands(s), t, view.x);
    ctx.save();
    ctx.translate(-view.x, -view.y);
    /* DRAW-ONLY VIEW CULLING (vision-breaker 2026-09-05, Drive 3, `[major]`). At 360 pieces the
       room is 4519x9363 against a 1280x560 window — about 1/58th on screen — and this function
       drew all 58/58ths of it every RAF frame: 6 fps, a 2.7 s Stop, and the engine's own
       setInterval starved to 2.3 of its dialled 10 ticks/s, so belts stamped "10 /s" delivered a
       quarter of that. Every skip below is INK ONLY: `plan`, `plan.sockets`, hit-testing, hover,
       the pan clamps and every piece of machine state still see the whole room. The rule itself is
       pure and tested — logic/floor-layout.js `inView` / `spanBox`. */
    const win = { x: view.x, y: view.y, w: s.w, h: s.h };
    const shown = (box) => Layout.inView(box, win);
    painted = { objects: [], links: 0, cables: 0, tethers: 0, crates: 0, sockets: 0 };
    pieceMap = new Map();
    for (const p of (bridge.getTable().pieces || [])) pieceMap.set(p.id, p);
    // Conveyor links tie the item plane together; then the cables, lit when a signal ran down them
    // this second. Each cable's ROUTE is `plan.cables[].geom.pts` (task 105: the short way round;
    // wall-to-wall cables keep the tray under the wall rail) — drawn as-is, so the paint, the
    // hit-test and the selection glow are one polyline.
    for (const l of plan.links) if (!isTutorialHidden(l.from) && !isTutorialHidden(l.to) && shown(Layout.spanBox([l.a, l.b]))) { Art.link(ctx, l.a, l.b); painted.links++; }
    const selL = selectedLinkNow();
    if (selL) Art.linkSelected(ctx, selL.a, selL.b);
    plan.cables.forEach((c) => {
      if (isTutorialHidden(c.from.id) || isTutorialHidden(c.to.id)) return;
      const g = c.geom;
      const tray = g ? g.tray : (plan.bands.wall.h ? plan.bands.wall.h : plan.bands.floor.y) + 14;
      const pts = (g && g.pts) || [c.from, { x: c.from.x, y: tray }, { x: c.to.x, y: tray }, c.to];
      // A cable is ROUTED through its tray lane, so the tray's own y belongs in the box it is
      // judged by: both ends can sit off screen while the long run across the window is exactly
      // what is being drawn.
      if (!shown(Layout.spanBox(pts))) return;
      Art.cable(ctx, c.from, c.to, bridge.wireLit(c.index), tray, pts);
      if (pickedWires.indexOf(c.id) !== -1) {
        const single = pickedWires.length === 1;
        Art.wireSelected(ctx, pts,
          single ? bridge.portWord(c.from.port, c.from.id) : null,
          single ? bridge.portWord(c.to.port, c.to.id) : null);
      }
      painted.cables++;
    });
    if (selectedWire !== null && wirePlateEl && !wirePlateEl.hidden) {
      const c = wireCableById(selectedWire);
      if (c) placeWirePlate(c);
    }
    // Watcher tethers: every NAMED coupling is DRAWN (spec R2) — teach→its sense, and (task 4)
    // Board→the dial it watches. Walked over the TABLE's own pieces rather than over every object
    // on the floor: the old loop asked `pieceById` — an Array.find over the whole table — once per
    // object per frame, 360x360 comparisons at rig size, for the two or three pieces that can
    // actually own a tether.
    for (const p of (bridge.getTable().pieces || [])) {
      const o = plan.objects[p.id];
      if (!o || isTutorialHidden(p.id)) continue;
      if (p.type === 'teach' && p.teachTarget && plan.objects[p.teachTarget]) {
        const w = plan.objects[p.teachTarget];
        if (isTutorialHidden(p.teachTarget)) continue;
        const a = { x: o.cx, y: o.cy }, b = { x: w.cx, y: w.cy };
        if (shown(Layout.spanBox([a, b]))) { Art.tether(ctx, a, b); painted.tethers++; }
      }
      // THE BOARD'S WATCH (task 4): the ONE relationship on this floor that is neither a wire
      // (the checker:error cable already draws itself) nor a belt coupling — a picked DIAL, on
      // some OTHER block, named by a plate select (setBoardWatch). The connection law says every
      // relationship is drawn, so this is: a dashed line from the Board's own box edge to that
      // dial's diamond socket (floorPlan's own sockets — the SAME points a wire would plug into,
      // read here rather than duplicated), the dial's word riding it.
      if (p.type === 'board' && p.watchBlock && p.watchDial) {
        const sockets = (plan.sockets && plan.sockets[p.watchBlock]) || [];
        const dot = sockets.find((q) => q.port === 'dial:' + p.watchDial);
        if (dot && !isTutorialHidden(p.watchBlock) && shown(Layout.spanBox([{ x: o.cx, y: o.cy }, dot]))) {
          Art.tether(ctx, boxEdgeToward(o, dot.x, dot.y), { x: dot.x, y: dot.y }, bridge.portWord('dial:' + p.watchDial, p.watchBlock));
          painted.tethers++;
        }
      }
    }
    // Objects: belts first (crates ride them), then everything else, readers last (they straddle belts).
    const objs = [];
    for (const id of Object.keys(plan.objects)) {
      const o = plan.objects[id];
      if (!isTutorialHidden(id) && shown(o)) { objs.push(o); painted.objects.push(id); }
    }
    const draw = (o) => Art.draw(ctx, o, liveFor(o), t);
    objs.filter((o) => o.kind === 'track').forEach(draw);
    objs.filter((o) => o.kind !== 'track' && !o.over).forEach(draw);
    // Crates in flight. A crate rides its belt, so a culled belt takes its crates with it.
    for (const c of bridge.crates()) {
      const o = plan.objects[c.pieceId];
      if (!o || isTutorialHidden(c.pieceId) || !shown(o)) continue;
      // Fix round 1, MINOR 2: ONE cratePos (logic/floor-layout.js), not a second hand-copy —
      // brick-panel.js's own crate loop reads the identical function.
      const pos = Layout.cratePos(o, c.progress);
      Art.crate(ctx, pos.x, pos.y, c.item, t, bridge);
      painted.crates++;
    }
    objs.filter((o) => o.over).forEach(draw);
    // Selection, pending candidates.
    if (selected && plan.objects[selected]) Art.selection(ctx, plan.objects[selected]);
    if (mode.kind === 'pending') for (const c of mode.candidates) if (plan.objects[c.piece]) Art.halo(ctx, plan.objects[c.piece], t);
    // Picked-mode (task 4): the SAME pulsing halo a pending candidate wears — "this one is part of
    // what you're about to act on" is exactly the fact both states are showing.
    if (picked.length) for (const id of picked) if (plan.objects[id]) Art.halo(ctx, plan.objects[id], t);
    if (marquee) Art.marquee(ctx, normMarquee(marquee));
    // The lead the child is holding goes UNDER the sockets, so the socket it would land in sits on
    // top of its own plug and stays readable.
    // A belt is pulled as a stiff brass RAIL, a signal as the teal lead — the two planes never read alike.
    if (tutorialLead) {
      const src = (plan.sockets[tutorialLead.id] || []).find(s => s.port === tutorialLead.port);
      const r = cvs.getBoundingClientRect();
      if (src) (isItemSock(src) ? Art.beltLead : Art.rubber)(ctx, src, { x: tutorialLead.x - r.left + view.x, y: tutorialLead.y - r.top + view.y });
    }
    if (mode.kind === 'cable' && mode.live) (isItemSock(mode.source) ? Art.beltLead : Art.rubber)(ctx, mode.source, mode.hot || mode.live);
    // Every socket of every block IN THE WINDOW, every frame (it used to be every block in the
    // room — see the culling note above; a block whose body is culled has no rim on screen for a
    // plug to sit on). The resting 'nub' is the affordance the floor was missing: a machine that
    // shows its plugs teaches "you can wire this" without a word of instruction.
    // Rings first (every lit socket still grows — that affordance is unchanged), then WORDS: at
    // most one per block outside a cable pull (Layout.tagPorts), the socket the finger is actually
    // on — painting every socket's name at once is what put a tag on the block next door (WHY,
    // socketTags in floor-art.js).
    const room = (plan && plan.world) || size();
    const focused = focusedSocket();
    for (const id of Object.keys(plan.sockets)) {
      // A block's plugs ride its own rim (and its tags hang just under it, inside the cull pad),
      // so a culled block has nothing of either on screen.
      const owner = plan.objects[id];
      if (isTutorialHidden(id)) continue;
      if (owner && !shown(owner)) continue;
      const lit = [];
      for (const sk of plan.sockets[id]) {
        const st = socketState(id, sk);
        if (isItemSock(sk)) Art.itemEnd(ctx, sk, st, t); else Art.socket(ctx, sk, st, t);
        if (st !== 'nub') lit.push({ x: sk.x, y: sk.y, dir: sk.dir, port: sk.port, word: isItemSock(sk) ? bridge.endWord(sk.port, id) : bridge.portWord(sk.port, id), state: st });
      }
      painted.sockets++;
      const words = Layout.tagPorts(lit, { cableMode: mode.kind === 'cable', focusedPort: focused && focused.id === id ? focused.port : null });
      if (words.length && owner) Art.socketTags(ctx, words, owner, room);
    }
    // A CULLED BLOCK STILL FEEDS AN OPEN PANEL. `lastLive` is not only ink: the Board's zoom reads
    // its points / watching / wired straight off this cache every frame (openBoardPanel's deps
    // closures), and the Splitter's bar grabs its shares from it. So the one or two blocks a child
    // currently has OPEN are kept live even while they are panned off screen — otherwise a Board
    // panel would quietly freeze the moment its block left the window.
    const openIds = [plateEl.dataset.id, window.BoardPanel ? window.BoardPanel.debug().boardId : null];
    for (const id of openIds) {
      if (id && plan.objects[id] && painted.objects.indexOf(id) === -1) liveFor(plan.objects[id]);
    }
    ctx.restore();
    // A shade on any edge with room behind it: the only honest sign that the machine continues.
    Art.edges(ctx, s, view, (plan && plan.world) || s);
    if (tutorialGeometry) tutorialGeometry();
    pieceMap = null; // a caller outside a paint (a brick panel's innerLive) reads the bridge again
  }
  /** Is there any room outside the window to pan to? */
  function pannable() {
    const s = size(), w = (plan && plan.world) || s;
    return w.w > s.w + 1 || w.h > s.h + 1;
  }
  /** How loud one socket is right now: 'nub' | 'idle' | 'offer' | 'picked' | 'hot'. */
  function socketState(id, sk) {
    if (mode.kind === 'cable') {
      if (mode.stage === 'source') return mode.from === id ? 'offer' : 'nub';
      if (mode.from === id && mode.source.port === sk.port && mode.source.dir === sk.dir) return 'picked';
      if (!isOffer(id, sk)) return 'nub';
      return mode.hot && mode.hot.id === id && mode.hot.port === sk.port && mode.hot.dir === sk.dir ? 'hot' : 'offer';
    }
    if (tutorialPorts && tutorialPorts.has(id)) return 'idle';
    return id === hover || (id === selected && !plateEl.hidden) ? 'idle' : 'nub';
  }

  //  is a TEST SEAM: the live state the last paint handed to each object. It is how a
  // headless drive can prove the Checker's own picture FILLS while the belt runs, rather than
  // snapping in (task 6: this used to be said of the wall Monitor, now deleted — spec §8).
  /**
   * Open a brick's small floor from OUTSIDE the canvas gesture (fix round 1, MAJOR 1's DOM-twin
   * half): the plate's own "See inside" row (game.js's renderRow) calls this directly — a real
   * button, not a canvas tap, so the porthole is no longer the ONLY route in. Honest no-op when
   * the Floor is not mounted (a defensive guard: game.js's own row click handler already ensures
   * Floor view before calling this, so this only ever protects against a race, never the normal
   * path) or the id names anything other than a live brick piece.
   * @param {string} id
   * @returns {boolean} whether the panel actually opened
   */
  function openBrickPanelExternal(id) {
    if (!mounted()) return false;
    return openBrickPanel(id, document.activeElement);
  }
  /**
   * MINIMAL-REVEAL from OUTSIDE the canvas gesture (fix round 3, F2, same idiom as
   * `openBrickPanelExternal` just above): the shelf's own `addFromShelf`/`addBrickFromShelf`
   * already call `revealIfOffscreen` directly, but a buddy [Do it] card lands a piece through
   * game.js's OWN table-edit path — no canvas gesture at all — so it never reached that call.
   * Honest no-op when the Floor is not mounted (the buddy panel can act while the child is on the
   * Blueprint view) or the id names nothing on the current plan (a stale id, or the piece never
   * actually placed — `revealIfOffscreen` itself already guards this, but the mounted() guard is
   * this function's own, matching the sibling above).
   * @param {string} id
   */
  function revealPieceExternal(id) {
    if (!mounted()) return;
    revealIfOffscreen(id);
  }
  /**
   * TUTOR SEAM (car-gallery tutorial, frozen contract T4): the PAGE point of a floor anchor, so the
   * tutorial overlay can ring a real block or socket without guessing pixels. `pieceId` names a plan
   * object; with `port`, the named socket on that object (the SAME shape tests/lib/tutorial-drive.js
   * resolves from `debug().plan.sockets`). Room px → screen = room − `view`, then + the canvas's own
   * bounding-rect offset (the canvas-tap-align law: never assume the canvas sits at the page origin).
   * @param {string} pieceId
   * @param {string} [port]
   * @returns {{x:number,y:number}|null} page coordinates, or null when the piece/socket is not on the
   *   current plan (the caller rings nothing rather than throwing).
   */
  function screenPointFor(pieceId, port) {
    if (!mounted() || !plan) return null;
    let rx, ry;
    if (port) {
      const list = (plan.sockets && plan.sockets[pieceId]) || [];
      const s = list.find((x) => x.port === port);
      if (!s) return null;
      rx = s.x; ry = s.y;
    } else {
      const o = plan.objects && plan.objects[pieceId];
      if (!o) return null;
      rx = typeof o.cx === 'number' ? o.cx : o.x + o.w / 2;
      ry = typeof o.cy === 'number' ? o.cy : o.y + o.h / 2;
    }
    const r = cvs.getBoundingClientRect();
    return { x: r.left + (rx - view.x), y: r.top + (ry - view.y) };
  }
  /**
   * TUTOR SEAM: the PAGE rectangle a plan object occupies — `screenPointFor`'s own conversion applied
   * to the whole box, for a highlight ring around a block rather than a dot at its centre.
   * @param {string} pieceId
   * @returns {{x:number,y:number,w:number,h:number}|null}
   */
  function rectForPiece(pieceId) {
    if (!mounted() || !plan) return null;
    const o = plan.objects && plan.objects[pieceId];
    if (!o) return null;
    const r = cvs.getBoundingClientRect();
    return { x: r.left + (o.x - view.x), y: r.top + (o.y - view.y), w: o.w, h: o.h };
  }
  /**
   * TUTOR SEAM: spotlight `ids` (an array of piece ids) — every object NOT named dims (see the
   * `tutorialFocus` precedence note in `liveFor`), and a lit path no longer overrides it. `null`
   * clears the focus, restoring free-play dim exactly. Inert while no focus is set (the default), so
   * free play is unchanged. Repaints once so the spotlight is visible on the next frame.
   * @param {Array<string>|null} ids
   */
  function setTutorialFocus(ids) {
    tutorialFocus = ids ? new Set(ids) : null;
    invalidate();
  }
  /**
   * TUTOR SEAM (car-gallery tutorial FIX-1): hide the named pieces — and every cable/link/tether
   * whose endpoint is one of them — from the ink AND the hit-test, while leaving their plan objects
   * (and therefore `floorPlan`'s emergent layout) exactly where they were. This is what lets the
   * guided build start on an empty-looking floor without CLEARING the table: the example's layout is
   * fixed at enter, so the highlight the child aims at can never drift from the piece that lands.
   * `null` clears it (free play and the self-test phase, which do their own real table edits).
   * @param {Array<string>|null} ids piece ids to hide, or null to show everything again.
   */
  function setTutorialHidden(ids) {
    tutorialHidden = ids ? new Set(ids) : null;
    invalidate();
  }

  function captureTutorialReference() {
    replan();
    tutorialReference = {};
    for (const p of bridge.getTable().pieces) {
      const o = plan.objects[p.id];
      if (o) tutorialReference[p.id] = { ...o, fx: p.fx, fy: p.fy, sockets: (plan.sockets[p.id] || []).map(s => ({ ...s })) };
    }
    return tutorialReference;
  }
  function referenceRect(id) {
    const o = tutorialReference && tutorialReference[id];
    if (!o || !mounted()) return null;
    const r = cvs.getBoundingClientRect();
    return { x: r.left + o.x - view.x, y: r.top + o.y - view.y, w: o.w, h: o.h };
  }
  function referencePoint(id, port) {
    const o = tutorialReference && tutorialReference[id];
    const point = o && (o.sockets || []).find(s => s.port === port);
    if (!point || !mounted()) return null;
    const r = cvs.getBoundingClientRect();
    return { x: r.left + point.x - view.x, y: r.top + point.y - view.y };
  }
  function revealTutorialTargets(ids) {
    if (!mounted() || !plan) return;
    const s = size();
    // Only wholly invisible targets request movement. If both fit, preserve both ends.
    const boxes = ids.map(id => plan.objects[id]).filter(Boolean);
    if (!boxes.some(o => o.x + o.w <= view.x || o.x >= view.x + s.w || o.y + o.h <= view.y || o.y >= view.y + s.h)) return;
    for (const axis of ['x', 'y']) {
      const extent = axis === 'x' ? 'w' : 'h';
      const lo = Math.min(...boxes.map(o => o[axis]));
      const hi = Math.max(...boxes.map(o => o[axis] + o[extent]));
      if (hi - lo <= s[extent] - 24) view[axis] = Math.max(0, Math.min(lo - 12, Math.max(view[axis], hi + 12 - s[extent])));
      else if (hi <= view[axis]) view[axis] = Math.max(0, hi - 24);
      else if (lo >= view[axis] + s[extent]) view[axis] = lo + 24 - s[extent];
    }
    invalidate();
  }
  const WorkshopFloor = {
    mount, unmount, refresh, mounted, openBrickPanel: openBrickPanelExternal, revealPiece: revealPieceExternal,
    // TUTOR SEAM (car-gallery tutorial, frozen contract T4): page-space geometry + the spotlight dim
    // the tutorial overlay drives. Additive and inert while no focus is set (free play unchanged).
    screenPointFor, rectForPiece, setTutorialFocus,
    captureTutorialReference, referenceRect, referencePoint, revealTutorialTargets,
    restoreView: saved => { if (saved) { view = { ...saved }; clampView(); invalidate(); } },
    resetTutorialInteraction: () => {
      abortLift(); clearMarqueeTimer(); marquee = null;
      mode = { kind: 'idle' }; drag = null; gesturePointer = null; selected = null;
      clearPicked(); closePlate(); closeWirePlate(); tutorialLead = null; invalidate();
    },
    setTutorialGeometry: fn => { tutorialGeometry = fn; invalidate(); },
    setTutorialPorts: ids => { tutorialPorts = ids ? new Set(ids) : null; invalidate(); },
    setTutorialLead: lead => { tutorialLead = lead; if (reduced && mounted()) paint(0); else invalidate(); },
    clearTutorialReference: () => { tutorialReference = null; planKey = ''; },
    // TUTOR SEAM (FIX-1): hide un-placed example parts (ink + hit-test) without touching the table.
    setTutorialHidden,
    // task 061: the keyboard undo must not fire mid-gesture — an uncommitted drag has nothing
    // to undo yet, and yanking the table out from under a held pointer is the hijack class
    // vb-multitouch already polices. True while any pointer owns the floor.
    gestureActive: () => gesturePointer !== null,
    // task 092: the picture changed for a reason the floor cannot see (a bridge-side change that
    // does not go through refresh()). Coalesced; safe to call when unmounted.
    invalidate,
    paintNow,
    debug: () => ({ plan, mode, selected, picked, selectedWire, pickedWires, selectedLink, marquee, lastLive, painted, view, drag, lastPointer, hover, focused: focusedSocket(), gesturePointer, lift: lift ? { up: lift.up, pointerId: lift.pointerId } : null,
      tutorialLead, tutorialPorts: tutorialPorts ? [...tutorialPorts] : [],
      hiddenCount: tutorialHidden ? tutorialHidden.size : 0,
      // task 092 seams: how many paints this mount has made, and the clock's own state (a resting
      // floor shows a stale lastPaintAt and no pending wake).
      paints, clock: clock ? Object.assign({ waking: raf !== null || wakeTimer !== null }, clock) : null }),
  };
  window.WorkshopFloor = WorkshopFloor;
})();
