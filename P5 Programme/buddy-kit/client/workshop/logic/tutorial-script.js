/**
 * tutorial-script.js — the PURE step model for the car-gallery tutorials (task 1).
 *
 * Two jobs, both deterministic and DOM-free:
 *   1. `buildSteps(table, kind)` turns an authored gallery table into ONE ordered list of things to
 *      place: every part (phase 'part'), then every item-band coupling (phase 'snap'), then every
 *      signal wire (phase 'wire') — the exact order the tutorial walks (tasks 9–10).
 *   2. `pickRemoval` / `applyRemoval` strip a SEEDED subset of parts + connections for the
 *      "test yourself" challenge (task 11) and rebuild a pristine machine to hand the child.
 *
 * Purity law: the input table is READ-ONLY here. `applyRemoval` clones, never mutates — the child's
 * own machine must survive a tutorial byte-for-byte. Randomness is `logic/rng.js` ONLY (no
 * `Math.random`/`Date.now`; the seed is echoed so a retry re-rolls reproducibly).
 *
 * The table shape is snap.js §9-13:
 *   { pieces: [{id,type,x,y,...config}], snaps: [{from:{piece,end},to:{piece,end}}],
 *     wires: [{from:{block,port},to:{block,port}}] }
 */

(function () {
  'use strict';

const Rng = (typeof require === 'function') ? require('./rng.js') : window.WorkshopRng;

/** The two galleries that ship a tutorial (D1). */
const TUTORIAL_KINDS = ['designcar', 'mysterycar'];

// Config props a piece's identity depends on — geometry (x/y) and id are deliberately NOT here:
// task 2 matches machines topologically, and `Layout.unoverlap` bumps y, so position can never be
// part of an identity. The list is the plan's propsKey contract plus the extra fields the real
// galleries carry (schema, leftName/rightName, exits, …), so a copy compares equal to its example.
const PROP_KEYS = [
  'target', 'test', 'n', 'senseId', 'brainId', 'watchPiece', 'watchBlock', 'watchDial',
  'name', 'field', 'colour', 'seconds', 'operation', 'left', 'leftName', 'right', 'rightName',
  'mode', 'items', 'rate', 'speed', 'penalty', 'exits', 'arm',
  'schema', 'libraryData', 'dataset', 'split', 'kind', 'label', 'min', 'max', 'value',
  'training', 'validation', 'power', 'weight',
];

/** Recursively sort object keys so the same config always serialises to the same string. */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = canonical(value[k]);
    return out;
  }
  return value;
}

/**
 * A stable canonical string of a piece's CONFIG (no id, no x/y) so task 2 can compare a rebuilt
 * piece against the example's piece across tables. undefined props are omitted (a default and an
 * explicit `undefined` are the same machine).
 * @param {object} piece a table piece
 * @returns {string} canonical JSON of the whitelisted config props
 */
function propsKey(piece) {
  const picked = {};
  for (const k of PROP_KEYS.slice().sort()) {
    if (piece && piece[k] !== undefined) picked[k] = canonical(piece[k]);
  }
  return JSON.stringify(picked);
}

/** Deep clone for the pruned table — table data is JSON-serialisable (it is saved to champion files). */
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * The tutorial's ordered to-do list for one gallery.
 * Parts first (authored piece order), then snaps, then wires; `i` is 0-based across the WHOLE list.
 * @param {object} table a gallery table (pass `galleryTable(kind)` output — it applies unoverlap)
 * @param {string} kind gallery kind (recorded for callers; the table is the source of truth)
 * @returns {Array<{i:number, phase:'part'|'snap'|'wire', pieceId?:string, type?:string,
 *   from?:object, to?:object, textKey:string}>}
 */
function buildSteps(table, kind) {
  const pieces = (table && table.pieces) || [];
  const snaps = (table && table.snaps) || [];
  const wires = (table && table.wires) || [];
  const steps = [];
  let i = 0;
  for (const p of pieces) {
    // Purpose callout reuses the existing man.<type>.what copy (task 9 resolves it) — never authored here.
    steps.push({ i: i++, phase: 'part', pieceId: p.id, type: p.type, textKey: 'man.' + p.type + '.what' });
  }
  for (const s of snaps) {
    steps.push({ i: i++, phase: 'snap', from: s.from, to: s.to, textKey: 'tutorial.connect.snap' });
  }
  for (const w of wires) {
    steps.push({ i: i++, phase: 'wire', from: w.from, to: w.to, textKey: 'tutorial.connect.wire' });
  }
  return steps;
}

/** The ids a connection endpoint touches — snaps name `piece`, wires name `block`. */
function endpointsOf(conn) {
  const from = conn && conn.from;
  const to = conn && conn.to;
  const fromId = from ? (from.piece !== undefined ? from.piece : from.block) : undefined;
  const toId = to ? (to.piece !== undefined ? to.piece : to.block) : undefined;
  return [fromId, toId];
}

/**
 * Pick a deterministic seeded subset to remove for the challenge (D2).
 *
 * Counts default to parts = ceil(nParts/3), wires = ceil(nWires/3), snaps = 1 (D2's applied default)
 * and `opts` may override any of them. The returned removal is CASCADE-CLOSED: any connection
 * incident to a removed part is included, so `applyRemoval` can never leave a dangling edge. The
 * requested count is therefore a minimum for connections — the random draw tops it up and the
 * cascade can raise it.
 * @param {object} table a gallery table
 * @param {string} kind gallery kind
 * @param {number} seed rng seed (echoed verbatim for the retry re-roll)
 * @param {{parts?:number, snaps?:number, wires?:number}} [opts]
 * @returns {{kind:string, seed:number, parts:Array, snaps:number[], wires:number[]}}
 */
function pickRemoval(table, kind, seed, opts) {
  const pieces = (table && table.pieces) || [];
  const snaps = (table && table.snaps) || [];
  const wires = (table && table.wires) || [];
  const o = opts || {};
  const wantParts = o.parts !== undefined ? o.parts : Math.ceil(pieces.length / 3);
  const wantSnaps = o.snaps !== undefined ? o.snaps : 1;
  const wantWires = o.wires !== undefined ? o.wires : Math.ceil(wires.length / 3);

  let state = Rng.seed(seed);
  let order;
  [order, state] = Rng.shuffle(pieces.map((_, i) => i), state);
  const partIdx = order.slice(0, Math.min(Math.max(0, wantParts), pieces.length)).sort((a, b) => a - b);
  const removedPartIds = new Set(partIdx.map((idx) => pieces[idx].id));

  // A connection is FORCED out when either endpoint is a removed part — removing it is the only way
  // to keep the machine coherent (a snap/wire to a vanished piece is a dangling edge).
  const forcedSnaps = [];
  snaps.forEach((s, idx) => {
    const [a, b] = endpointsOf(s);
    if (removedPartIds.has(a) || removedPartIds.has(b)) forcedSnaps.push(idx);
  });
  const forcedWires = [];
  wires.forEach((w, idx) => {
    const [a, b] = endpointsOf(w);
    if (removedPartIds.has(a) || removedPartIds.has(b)) forcedWires.push(idx);
  });

  // Then top the counts up from the connections the cascade did NOT already claim, randomly.
  const forcedSnapSet = new Set(forcedSnaps);
  const forcedWireSet = new Set(forcedWires);
  const freeSnaps = snaps.map((_, i) => i).filter((i) => !forcedSnapSet.has(i));
  const freeWires = wires.map((_, i) => i).filter((i) => !forcedWireSet.has(i));

  let snapDraw;
  [snapDraw, state] = Rng.shuffle(freeSnaps, state);
  const extraSnaps = snapDraw.slice(0, Math.max(0, wantSnaps - forcedSnaps.length));

  let wireDraw;
  [wireDraw, state] = Rng.shuffle(freeWires, state);
  const extraWires = wireDraw.slice(0, Math.max(0, wantWires - forcedWires.length));

  const snapIdx = forcedSnaps.concat(extraSnaps).sort((a, b) => a - b);
  const wireIdx = forcedWires.concat(extraWires).sort((a, b) => a - b);

  return {
    kind,
    seed,
    parts: partIdx.map((idx) => {
      const p = pieces[idx];
      return { id: p.id, type: p.type, propsKey: propsKey(p), slot: { x: p.x, y: p.y } };
    }),
    snaps: snapIdx,
    wires: wireIdx,
  };
}

/**
 * Rebuild a table with a removal applied. Pure: the input is never touched (a fresh table + fresh
 * pieces are returned), and any connection whose endpoint vanished is cascaded away even if the
 * removal did not name it — so the result can never carry a dangling edge.
 * @param {object} table the source table
 * @param {object} removal a `pickRemoval` result (or any `{parts,snaps,wires}` record)
 * @returns {{table:object, removed:object}} the pruned table + the effective removal record
 */
function applyRemoval(table, removal) {
  const r = removal || {};
  const parts = r.parts || [];
  const removedIds = new Set(parts.map((p) => p.id));
  const namedSnaps = new Set(r.snaps || []);
  const namedWires = new Set(r.wires || []);

  const keptPieces = ((table && table.pieces) || [])
    .filter((p) => !removedIds.has(p.id))
    .map(clone);

  const removedSnaps = [];
  const keptSnaps = [];
  ((table && table.snaps) || []).forEach((s, idx) => {
    const [a, b] = endpointsOf(s);
    if (namedSnaps.has(idx) || removedIds.has(a) || removedIds.has(b)) removedSnaps.push(idx);
    else keptSnaps.push(clone(s));
  });

  const removedWires = [];
  const keptWires = [];
  ((table && table.wires) || []).forEach((w, idx) => {
    const [a, b] = endpointsOf(w);
    if (namedWires.has(idx) || removedIds.has(a) || removedIds.has(b)) removedWires.push(idx);
    else keptWires.push(clone(w));
  });

  const pruned = Object.assign({}, table, { pieces: keptPieces, snaps: keptSnaps, wires: keptWires });
  return {
    table: pruned,
    removed: {
      kind: r.kind,
      seed: r.seed,
      parts: clone(parts),
      snaps: removedSnaps,
      wires: removedWires,
    },
  };
}

// Dual environment: node --test loads via require; the browser via a classic <script> tag.
const WorkshopTutorialScript = { TUTORIAL_KINDS, buildSteps, pickRemoval, applyRemoval, propsKey };
if (typeof module !== 'undefined' && module.exports) module.exports = WorkshopTutorialScript;
if (typeof window !== 'undefined') window.WorkshopTutorialScript = WorkshopTutorialScript;
})();
