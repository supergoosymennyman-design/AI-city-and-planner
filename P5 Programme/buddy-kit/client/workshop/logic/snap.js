'use strict';
/**
 * The snap mapper — turns a free TABLE (pieces anywhere, typed connectors coupled
 * explicitly) into the signal engine's connectivity layout. Replaces the grid
 * compiler: contract §3 (amended 2026-08-16) — no grid; item-plane connectivity is
 * EXPLICIT, recorded when connectors couple, never inferred from position. Positions
 * are the UI's business; this module never reads x/y.
 *
 * Table model:
 *   table = { pieces: [ {id, type, x?, y?, watchPiece?, ...config} ],
 *             snaps:  [ {from:{piece,end}, to:{piece,end}} ],   // fat ITEM couplings
 *             wires:  [ {from:{block,port}, to:{block,port}} ] } // signal wires, engine-validated
 *
 * Item ends per type (the puzzle shapes):
 *   feeder: out · track: in/out · gate: in/straight/turn · pen: in/out · bin: in · checker: in
 * An out-plug couples to exactly ONE socket (a track goes one way).
 * An in-socket may accept SEVERAL plugs (streams merge).
 */

const ITEM_ENDS = {
  feeder: { out: ['out'], in: [] },
  track: { out: ['out'], in: ['in'] },
  gate: { out: null /* dynamic — see outEndsOf */, in: ['in'] },
  bin: { out: [], in: ['in'] },
  checker: { out: [], in: ['in'] }, // a bin that opens the crate (spec 2026-08-18 data-feed)
  // The PEN (task B): a waiting room — one way in, one way out, same shape as a track.
  pen: { out: ['out'], in: ['in'] },
  // The CAR MAKER (car-galleries, Tasks 4/7/10): a feeder's item-out shape — one out-plug, NO
  // in-socket (items are MADE here, never received). Registered so snapToLayout resolves its `to`
  // track exactly like a feeder's, and a coupling from its `out` compiles instead of failing
  // "has no out-plug" (its `to` is what the engine's mustLead check then validates).
  carmaker: { out: ['out'], in: [] },
  // The FILES block (task E): NO belt plugs at all — it sits off the item graph and reaches the
  // belt only through a signal wire (row → a feeder's drop). Declared explicitly so the shape
  // law refuses a coupling attempt loudly, and so nothing here ever demands an out-coupling
  // from a block that has no item ends (a feeder must still lead somewhere; a Files block never
  // "leads" anywhere — the item-plane walk simply never visits it).
  files: { out: [], in: [] },
};

/** A gate's out-plugs are dynamic: exit1..exitN in sorter AND latch mode (owner 2026-08-16;
 *  task B — a latch is a sorter with a persistent arm, the SAME dynamic shape, never a bespoke
 *  fixed pair), exit1 otherwise (trapdoor/grabber). */
function outEndsOf(p) {
  if (p.type === 'gate') {
    const mode = p.mode || 'sorter';
    if (mode === 'sorter' || mode === 'latch') {
      const n = Math.min(6, Math.max(2, p.exits || 2));
      return Array.from({ length: n }, (_, i) => 'exit' + (i + 1));
    }
    return ['exit1'];
  }
  return (ITEM_ENDS[p.type] || { out: [] }).out;
}
// Fields that belong to the table, not the engine.
const TABLE_KEYS = ['x', 'y', 'watchPiece', 'fx', 'fy', 'teachTarget']; // fx/fy = the Floor's own position (fractions), never the engine's business. `watchBlock` (spec R1, the Monitor's named Checker) left this list with the block it coupled — task 6, spec §8. `teachTarget` (spec R2): a Teach's named sense is host-side resolution (game.js applyTeachEffect/teachTargetError read state.table.pieces directly) — the engine never needs to know it.

function fail(msg) {
  throw new Error('[snap] ' + msg);
}

/**
 * @param {object} table  see model above
 * @returns {{layout: object, meta: {segPieces: Object<string,string[]>}}}
 *   meta.segPieces maps each track-segment id to its ordered piece ids so the UI can
 *   draw an engine item at {track, index} back onto the table.
 */
function snapToLayout(table) {
  if (!table || !Array.isArray(table.pieces)) fail('table.pieces must be an array');
  const snaps = table.snaps || [];
  const byId = {};
  for (const p of table.pieces) {
    if (!p.id) fail('every piece needs an id');
    if (byId[p.id]) fail(`duplicate piece id "${p.id}"`);
    byId[p.id] = p;
  }
  const name = (id) => {
    const p = byId[id];
    return `${p.type} "${id}"`;
  };

  // --- 1. Register couplings ------------------------------------------------------
  const succ = {};    // "piece:end" (an out-plug) → target pieceId
  const sources = {}; // track/gate/bin pieceId → [source pieceIds] into its in-socket
  for (const s of snaps) {
    const f = s.from, t = s.to;
    if (!f || !t || !byId[f.piece] || !byId[t.piece]) fail(`coupling references an unknown piece: ${JSON.stringify(s)}`);
    const fp = byId[f.piece], tp = byId[t.piece];
    if (!outEndsOf(fp).includes(f.end)) fail(`${name(f.piece)} has no "${f.end}" out-plug`);
    if (!(ITEM_ENDS[tp.type] || { in: [] }).in.includes(t.end)) fail(`${name(t.piece)} has no "${t.end}" in-socket`);
    const plug = f.piece + ':' + f.end;
    if (succ[plug]) fail(`the "${f.end}" plug of ${name(f.piece)} is already coupled — an out-plug goes ONE place`);
    succ[plug] = t.piece;
    (sources[t.piece] = sources[t.piece] || []).push(f.piece);
  }

  // --- 2. Chain track pieces into engine segments ---------------------------------
  // A head starts a segment: its in-socket is empty, fed by a non-track (feeder/gate),
  // or fed by MORE than one plug (a merge point must be addressable at index 0).
  const isTrack = (id) => byId[id] && byId[id].type === 'track';
  const isHead = (id) => {
    if (!isTrack(id)) return false;
    const src = sources[id] || [];
    return src.length !== 1 || !isTrack(src[0]);
  };
  const segId = (headId) => 'seg_' + headId;
  const segPieces = {};
  const segOf = {}; // track pieceId → {seg, index}
  for (const p of table.pieces) {
    if (!isHead(p.id)) continue;
    const chain = [p.id];
    let cur = p.id;
    for (;;) {
      const nxt = succ[cur + ':out'];
      if (!nxt) fail(`${name(cur)} leads nowhere — couple its out-plug to a track, gate, or bin`);
      if (isTrack(nxt) && !isHead(nxt)) { chain.push(nxt); cur = nxt; continue; }
      break;
    }
    segPieces[segId(p.id)] = chain;
    chain.forEach((id, i) => { segOf[id] = { seg: segId(p.id), index: i }; });
  }
  for (const p of table.pieces) {
    if (p.type === 'track' && !segOf[p.id]) {
      fail(`the track ring through ${name(p.id)} has no way in — couple a feeder or a gate exit into it`);
    }
  }

  // --- 3. Resolve where an out-plug delivers, in engine terms ---------------------
  const resolve = (fromDesc, plugKey) => {
    const target = succ[plugKey];
    if (!target) fail(`${fromDesc} is not coupled to anything`);
    if (isTrack(target)) return segOf[target].seg; // heads by construction (fed by non-track)
    return target; // gate or bin — ITEM_ENDS already vetted the socket
  };

  // --- 4. Emit engine blocks ------------------------------------------------------
  const blocks = [];
  for (const p of table.pieces) {
    if (p.type === 'track') continue; // emitted as segments below
    const out = {};
    for (const k of Object.keys(p)) {
      if (!TABLE_KEYS.includes(k)) out[k] = p[k];
    }
    if (p.type === 'feeder') out.to = resolve(`the plug of ${name(p.id)}`, p.id + ':out');
    // The CAR MAKER (car-galleries, Tasks 4/7/10): a feeder's item-out shape — its `to` is where a
    // built crate enters, resolved exactly like a feeder's or a pen's own out-plug. The engine's
    // mustLead check then validates that target the same way for every item source.
    if (p.type === 'carmaker') out.to = resolve(`the plug of ${name(p.id)}`, p.id + ':out');
    // The PEN (task B): one out-plug, resolved exactly like a feeder's or a track's own `to`.
    if (p.type === 'pen') out.to = resolve(`the plug of ${name(p.id)}`, p.id + ':out');
    if (p.type === 'gate') {
      const mode = p.mode || 'sorter';
      // Sorter's N-way exits and the latch's own N-way exits compile to the SAME `exits` array
      // shape — the engine tells them apart by mode, not by field name (task B: a latch is a
      // sorter with a persistent arm, never a bespoke fixed pair the way Split used to be).
      if (mode === 'sorter' || mode === 'latch') {
        out.exits = outEndsOf(p).map((end, i) => resolve(`the exit ${i + 1} plug of ${name(p.id)}`, p.id + ':' + end));
      } else out.straightTo = resolve(`the plug of ${name(p.id)}`, p.id + ':exit1');
    }
    if ((p.type === 'sense' || p.type === 'teach') && p.watchPiece) {
      if (!isTrack(p.watchPiece)) fail(`${name(p.id)} watches "${p.watchPiece}" — but that is not a track piece`);
      out.spot = { track: segOf[p.watchPiece].seg, index: segOf[p.watchPiece].index };
      if (p.type === 'sense') out.mode = 'spot';
    } else if (p.type === 'sense' && !p.watchPiece) {
      // Room mode left the app 2026-08-27 (spec 2026-08-27 §4.3). An eye reads the crate standing
      // in front of it; an eye standing nowhere reads nothing. The ENGINE still accepts
      // mode:'room' so old champion files load — this is the app declining to produce it.
      fail(`${name(p.id)} needs to sit on a track piece — drop it onto one so it can read what rides past`);
    } else if (p.type === 'teach' && !p.watchPiece) {
      fail(`${name(p.id)} needs to sit on a track piece — drop it onto one so it can file the item standing there`);
    }
    blocks.push(out);
  }
  for (const id of Object.keys(segPieces).sort()) {
    const head = byId[segPieces[id][0]];
    const seg = { id, type: 'track', length: segPieces[id].length, to: resolve(`${name(segPieces[id][segPieces[id].length - 1])}`, segPieces[id][segPieces[id].length - 1] + ':out') };
    if (head.speed !== undefined) seg.speed = head.speed;
    blocks.push(seg);
  }

  return { layout: { blocks, wires: table.wires || [] }, meta: { segPieces } };
}

/**
 * Every piece on the same ITEM LINE as startId: the connected component of the snaps graph,
 * walked both ways — one physical machine, feeder through gates to bins (spec R3: "the belt
 * line a block physically sits on" is a visible relationship; "the first one in the table"
 * is not). Senses and Teach stand on tracks via watchPiece, which is a coupling, not a snap —
 * a caller wanting "the reader on this line" tests sense.watchPiece against this set.
 * @returns {Set<string>} piece ids, startId included.
 */
function lineOf(table, startId) {
  const adj = {};
  for (const s of ((table && table.snaps) || [])) {
    if (!s.from || !s.to) continue;
    (adj[s.from.piece] = adj[s.from.piece] || []).push(s.to.piece);
    (adj[s.to.piece] = adj[s.to.piece] || []).push(s.from.piece);
  }
  const seen = new Set([startId]);
  const queue = [startId];
  while (queue.length) {
    const id = queue.shift();
    for (const n of adj[id] || []) if (!seen.has(n)) { seen.add(n); queue.push(n); }
  }
  return seen;
}

const WorkshopSnap = { snapToLayout, ITEM_ENDS, lineOf };
if (typeof module !== 'undefined' && module.exports) module.exports = WorkshopSnap;
if (typeof window !== 'undefined') window.WorkshopSnap = WorkshopSnap;
