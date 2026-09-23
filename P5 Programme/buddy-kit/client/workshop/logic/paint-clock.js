'use strict';
/**
 * paint-clock.js — WHEN the floor paints (task 092, spec
 * docs/superpowers/specs/2026-09-13-lowend-paint-clock-design.md §3.1).
 *
 * WHY THIS EXISTS. Until task 092, floor.js repainted its whole canvas on every animation frame,
 * forever — whether a machine was running, a finger was down, or nothing at all had changed.
 * Measured 2026-09-13 (headless Chromium, software raster, tablet viewport): 98% of the main
 * thread at an EMPTY, IDLE hall; and under a 4x CPU throttle the setInterval sim starved from its
 * dialled 10 ticks/s to 1.8, because the paint loop owned the thread. Switching the loop off
 * (prefers-reduced-motion's 400 ms interval) dropped the idle thread to 2%.
 *
 * So this module answers two questions, purely, from facts the floor hands it:
 *   1. paint on this wake?   — yes when something is DIRTY (the picture changed) or an animation
 *      rate is due;
 *   2. wake again when?      — the next frame, a timeout, or NOT AT ALL (rest) when nothing
 *      animates and nothing is dirty.
 *
 * Rates. A held gesture (drag / pan / cable / marquee / lift) paints at 60 Hz — the finger must
 * feel followed. A running machine, a live camera feed or a pulsing halo paints at 30 Hz —
 * crates step once per 100 ms tick anyway, so 60 buys nothing the eye can see. With nothing
 * happening the room's ambient life (the breathing lamp pool, dust, the skylight sweep) runs at
 * 10 Hz for 30 s after the last activity, then RESTS: a workshop nobody is touching costs
 * nothing. Reduced motion never reaches this module — floor.js keeps its frozen 400 ms path.
 *
 * Backoff. The floor is one canvas painted on the same thread the sim ticks on. On a slow
 * machine a single paint can cost longer than a whole tick, so every paint is followed by a rest
 * of at least TWICE its own measured cost (BACKOFF = 3, counted from the paint's start): the floor
 * can never take more than a third of the thread, whatever the hardware, and the belts stamped
 * "10 /s" keep delivering ten. Capped at MAX_DELAY_MS so a monstrous paint never silences the
 * floor for more than a second while something is animating.
 *
 * Pure by the determinism law: no DOM, no Date.now — `now` is the caller's RAF timestamp
 * (performance.now() based), so every rule is pinned in tests/paint-clock.test.js in node.
 */
(function () {
  /** Paint rates in Hz, by what is happening. */
  const RATE = { pointer: 60, live: 30, ambient: 10 };
  /** The ambient animation keeps going this long after the last activity, then the floor rests. */
  const AMBIENT_REST_MS = 30000;
  /** A paint may never be followed by more than this much silence while something animates. */
  const MAX_DELAY_MS = 1000;
  /** Minimum interval between paint STARTS as a multiple of the last paint's cost (3 = rest 2x). */
  const BACKOFF = 3;

  /**
   * A new clock. Dirty at birth, so the first wake paints.
   * @param {number} now the caller's clock (ms)
   * @returns {{dirty:boolean, lastPaintAt:number, lastPaintMs:number, lastActivityAt:number}}
   */
  function create(now) {
    return { dirty: true, lastPaintAt: -Infinity, lastPaintMs: 0, lastActivityAt: now || 0 };
  }

  /**
   * Something the picture depends on changed (a table edit, a pointer event, a resize, a plate
   * opening…). Also counts as activity, so the ambient animation stays awake for another 30 s.
   * @param {object} c the clock
   * @param {number} now
   */
  function invalidate(c, now) {
    c.dirty = true;
    if (now > c.lastActivityAt) c.lastActivityAt = now;
  }

  /**
   * A paint just happened: remember when it started and what it cost, and clear the dirt.
   * @param {object} c the clock
   * @param {number} startedAt
   * @param {number} endedAt
   */
  function painted(c, startedAt, endedAt) {
    c.dirty = false;
    c.lastPaintAt = startedAt;
    c.lastPaintMs = Math.max(0, endedAt - startedAt);
  }

  /**
   * The paint's TRUE cost, learned later: the draw calls are the cheap half — the browser rasterises
   * and commits the canvas AFTER paint() returns, on the same thread when the GPU is not helping
   * (measured 2026-09-13: ~3 ms of draw calls, ~30 ms of raster per frame at 1x on a 1280x550
   * canvas). The floor measures "paint start → next animation frame" and reports it here; the
   * backoff then rests the raster too. Only ever RAISES the recorded cost, never lowers it.
   * @param {object} c the clock
   * @param {number} ms the whole frame's cost, in ms
   */
  function cost(c, ms) {
    if (ms > c.lastPaintMs) c.lastPaintMs = ms;
  }

  /** The rate the current facts ask for, in Hz; 0 means nothing animates (rest). */
  function rateFor(c, facts, now) {
    if (facts.pointer) return RATE.pointer;
    if (facts.live || facts.pulse) return RATE.live;
    return (now - c.lastActivityAt < AMBIENT_REST_MS) ? RATE.ambient : 0;
  }

  /**
   * Paint on this wake? And when should the loop wake next?
   * @param {object} c the clock (mutated: activity is recorded)
   * @param {{hidden?:boolean, pointer?:boolean, live?:boolean, pulse?:boolean}} facts
   *   hidden — the document is not visible (paint nothing, sleep until an invalidate);
   *   pointer — a pointer currently owns the floor; live — the machine is running or a camera
   *   feed is on screen; pulse — a pending/picked halo is breathing.
   * @param {number} now the wake's timestamp (ms)
   * @returns {{paint:boolean, delayMs:(number|null)}} delayMs: 0 = next animation frame, N = wake
   *   in N ms, null = do not wake (an invalidate will).
   */
  function decide(c, facts, now) {
    facts = facts || {};
    if (facts.hidden) return { paint: false, delayMs: null };
    // Dirt and any live animation are activity: they keep the ambient life awake.
    if (c.dirty || facts.pointer || facts.live || facts.pulse) {
      if (now > c.lastActivityAt) c.lastActivityAt = now;
    }
    const rate = rateFor(c, facts, now);
    if (!c.dirty && rate === 0) return { paint: false, delayMs: null };   // resting
    const base = rate > 0 ? 1000 / rate : 0;
    const backoff = Math.min(MAX_DELAY_MS, BACKOFF * c.lastPaintMs);
    // Dirt waits ONLY for the backoff — a changed picture is shown at the next frame a slow machine
    // can afford, never held for the ambient animation's own interval. A rate-driven frame waits
    // for whichever is longer, its own interval or the backoff.
    const rateInterval = Math.min(MAX_DELAY_MS, Math.max(base, backoff));
    const minInterval = c.dirty ? backoff : rateInterval;
    const elapsed = now - c.lastPaintAt;   // Infinity for a clock that has never painted
    if (elapsed < minInterval) return { paint: false, delayMs: Math.max(1, Math.ceil(minInterval - elapsed)) };
    // Paint now. The next wake is one rate interval from now — estimated from the LAST paint's
    // cost; the wake after this paint re-decides with the fresh cost, so a slow paint still rests.
    const next = rate > 0 ? Math.round(rateInterval) : null;
    return { paint: true, delayMs: next };
  }

  const PaintClock = { create, invalidate, painted, cost, decide, RATE, AMBIENT_REST_MS, MAX_DELAY_MS, BACKOFF };
  if (typeof module !== 'undefined' && module.exports) module.exports = PaintClock;
  if (typeof window !== 'undefined') window.WorkshopPaintClock = PaintClock;
})();
