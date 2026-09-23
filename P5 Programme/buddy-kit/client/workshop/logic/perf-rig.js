'use strict';
/**
 * perf-rig.js — the seeded machine generator behind the no-ceilings perf gates (composing-arc
 * spec §9: "deterministically generate a machine of a few hundred blocks"). ONE generator, two
 * consumers: tests/perf.test.js (pure node canary, validate:local) and tests/perf-browser.test.js
 * (frame-budget gate, CI). Pure: no DOM, no Math.random, no Date.now — the determinism law binds
 * this file like any other logic/ module.
 *
 * The machine is `lines` production lines — feeder(2 crates, rate 600) → track(len 12) →
 * sorter gate → 2 bins — with wall devices and buttons sprinkled at fixed strides so the wall
 * and front bands carry real load too. Everything is derived from (lines, seed); the same call
 * returns the same machine forever.
 */
(function () {
// composing-arc "make your own part", task 6's own scale proof: buildBricked() below cuts every
// line into its own brick via Brick.makePart, the same eager-resolve idiom every other logic/*.js
// module here already uses for its sibling requires.
const Brick = (typeof require === 'function') ? require('./brick.js') : (typeof window !== 'undefined' ? window.WorkshopBrick : null);

/** mulberry32 — the repo's stock tiny seeded rng (same shape logic/datasets.js uses). */
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LABELS = ['apple', 'sock', 'boot', 'pear'];

/**
 * Build the rig machine.
 * @param {number} lines  production lines (each is 6 pieces: feeder·track·gate·2 bins·1 extra)
 * @param {number} seed   integer seed — same (lines, seed) = same machine, forever
 * @returns {{save: {v:number, seed:number, pieces:Array, snaps:Array, wires:Array},
 *            layout: {blocks:Array, wires:Array}}}
 */
function build(lines, seed) {
  const r = rng(seed);
  const pieces = [], snaps = [], wires = [], blocks = [], ewires = [];
  for (let i = 0; i < lines; i++) {
    const f = 'f' + i, t = 't' + i, g = 'g' + i, b1 = 'b1_' + i, b2 = 'b2_' + i;
    const contents = [
      { label: LABELS[Math.floor(r() * LABELS.length)], value: 1 + Math.floor(r() * 9) },
      { label: LABELS[Math.floor(r() * LABELS.length)], value: 1 + Math.floor(r() * 9) },
    ];
    // the SAVE (floor) shape — x/y are blueprint order, the bands sort by them. The feeder
    // carries its crates as `items`, and the app's field holds TAG STRINGS, not {label, value}
    // objects (game.js reads them through String(s).trim(), so an object becomes an
    // "[object Object]" crate on every belt — vision-breaker, 2026-09-05, RED test
    // tests/perf-rig-shape.test.js). The engine block below keeps the full {label, value}
    // contents; only the save side flattens to labels.
    pieces.push({ id: f, type: 'feeder', x: i, y: 0, rate: 600, items: contents.map((c) => c.label) });
    pieces.push({ id: t, type: 'track', x: i, y: 1, speed: 10 });
    pieces.push({ id: g, type: 'gate', mode: 'sorter', exits: 2, x: i, y: 2 });
    pieces.push({ id: b1, type: 'bin', x: i, y: 3 });
    pieces.push({ id: b2, type: 'bin', x: i, y: 4 });
    snaps.push({ from: { piece: f, end: 'out' }, to: { piece: t, end: 'in' } });
    snaps.push({ from: { piece: t, end: 'out' }, to: { piece: g, end: 'in' } });
    snaps.push({ from: { piece: g, end: 'exit1' }, to: { piece: b1, end: 'in' } });
    snaps.push({ from: { piece: g, end: 'exit2' }, to: { piece: b2, end: 'in' } });
    // the ENGINE shape — dials are TOP-LEVEL fields (createRun lifts `s.dials[d] = b[d]` off the
    // block itself, engine.js ~395-400; the real pipeline's snapToLayout spreads piece keys the
    // same way), never a nested `dials: {...}` object. A nested wrapper is silently ignored and
    // the block falls back to its engine default (feeder rate 12, track speed 5) — exactly the
    // MAJOR a reviewer caught here (fix round 1, 2026-09-05): the canary was pinning a near-idle
    // machine while claiming "rate 600".
    blocks.push({ id: f, type: 'feeder', to: t, rate: 600, contents });
    blocks.push({ id: t, type: 'track', length: 12, to: g, speed: 10 });
    blocks.push({ id: g, type: 'gate', mode: 'sorter', exits: [b1, b2] });
    blocks.push({ id: b1, type: 'bin' });
    blocks.push({ id: b2, type: 'bin' });
    // every 2nd line: a counter wired off the feeder (signal-plane load in DELIVER)
    if (i % 2 === 0) {
      const c = 'c' + i;
      pieces.push({ id: c, type: 'counter', x: 100 + i, y: 0 });
      blocks.push({ id: c, type: 'counter' });
      wires.push({ from: { block: f, port: 'emitted' }, to: { block: c, port: 'plus' } });
      ewires.push({ from: { block: f, port: 'emitted' }, to: { block: c, port: 'plus' } });
    } else if (i % 4 === 1) {
      const l = 'lp' + i;
      pieces.push({ id: l, type: 'lamp', x: 100 + i, y: 0 });
      blocks.push({ id: l, type: 'lamp' });
    } else if (i % 8 === 3) {
      const b = 'bt' + i;
      pieces.push({ id: b, type: 'button', x: 200 + i, y: 0 });
      blocks.push({ id: b, type: 'button' });
    } else {
      const s = 'sg' + i;
      pieces.push({ id: s, type: 'sign', x: 100 + i, y: 0 });
      blocks.push({ id: s, type: 'sign' });
    }
  }
  return { save: { v: 1, seed, pieces, snaps, wires }, layout: { blocks, wires: ewires } };
}

/**
 * A feeder's SAVE-side `items` (raw tag strings — what a real child's table/restore() carries)
 * compiled into the ENGINE's own `contents` field ({label, data:{tag}} per row — game.js's
 * `itemOf()`, for a plain row with no '='), the one step `build()`'s own SAVE shape leaves for
 * game.js's `toTable()` to do at Run time (build()'s own doc: "only the save side flattens to
 * labels"). `buildBricked` below needs it BEFORE `Snap.snapToLayout` ever sees the table (this
 * file has no game.js to lean on, and never should — game.js pulls this file in, not the other
 * way around), so it is compiled once, right here, rather than a second hand-rolled copy per
 * caller.
 * @param {{pieces:Array, snaps:Array, wires:Array}} table
 * @returns {{pieces:Array, snaps:Array, wires:Array}}
 */
function compileFeeders(table) {
  return {
    pieces: table.pieces.map((p) => (p.type === 'feeder' && Array.isArray(p.items))
      ? Object.assign({}, p, { contents: p.items.map((tag) => ({ label: tag, data: { tag } })) })
      : p),
    snaps: table.snaps, wires: table.wires,
  };
}

/**
 * The SAME (lines, seed) machine `build()` returns, with every line's own 6 pieces
 * (feeder·track·gate·2 bins·1 wall extra) sealed into its OWN brick via `Brick.makePart`, applied
 * straight to the SAVE table — the scale proof's own fixture (composing-arc "make your own part",
 * task 6, spec §9). Every line here is topologically SELF-CONTAINED (no snap or wire ever crosses
 * from one line to another — build()'s own doc: "production lines", plural, never wired
 * together), so cutting one always produces a brick with ZERO ports; that is the honest shape
 * 160 independent lines already had, not a simplification invented for this proof.
 * @param {number} lines · @param {number} seed  same contract as build()
 * @returns {{table:{pieces:Array, snaps:Array, wires:Array}}}
 */
function buildBricked(lines, seed) {
  if (!Brick) throw new Error('[perf-rig] buildBricked: logic/brick.js is not loaded');
  const { save } = build(lines, seed);
  let table = compileFeeders(save);
  for (let i = 0; i < lines; i++) {
    const extra = i % 2 === 0 ? 'c' + i : i % 4 === 1 ? 'lp' + i : i % 8 === 3 ? 'bt' + i : 'sg' + i;
    const ids = ['f' + i, 't' + i, 'g' + i, 'b1_' + i, 'b2_' + i, extra];
    const res = Brick.makePart(table, ids, 'Line ' + i);
    if (!res.ok) throw new Error(`[perf-rig] buildBricked: makePart refused line ${i}: ${res.why}`);
    const inside = new Set(ids);
    const brickPiece = { id: 'brick' + i, type: 'brick', x: i, y: 0, name: 'Line ' + i, def: res.def };
    // Every line here is self-contained (see doc above) — this always finds zero crossings — but
    // the rewrite is written generally rather than assuming that, so a future rig that DOES wire
    // lines together would still flatten correctly instead of silently dropping a cable.
    const rewriteSnapEnd = (end) => (inside.has(end.piece) ? { piece: brickPiece.id, end: res.portFor['item|' + end.piece + '|' + end.end] } : end);
    const rewriteWireEnd = (end) => (inside.has(end.block) ? { block: brickPiece.id, port: res.portFor['signal|' + end.block + '|' + end.port] } : end);
    table = {
      pieces: table.pieces.filter((p) => !inside.has(p.id)).concat([brickPiece]),
      snaps: table.snaps.filter((s) => !(inside.has(s.from.piece) && inside.has(s.to.piece))).map((s) => ({ from: rewriteSnapEnd(s.from), to: rewriteSnapEnd(s.to) })),
      wires: table.wires.filter((w) => !(inside.has(w.from.block) && inside.has(w.to.block))).map((w) => ({ from: rewriteWireEnd(w.from), to: rewriteWireEnd(w.to) })),
    };
  }
  return { table };
}

const WorkshopPerfRig = { build, buildBricked, compileFeeders };
if (typeof module !== 'undefined' && module.exports) module.exports = WorkshopPerfRig;
if (typeof window !== 'undefined') window.WorkshopPerfRig = WorkshopPerfRig;
})();
