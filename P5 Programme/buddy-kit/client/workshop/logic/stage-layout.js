'use strict';
/**
 * stage-layout.js — the pure half of the Stage (Demo B rung 1: the machine IS the world).
 *
 * Turns the kid's TABLE (pieces + snaps) into a scene plan the stage renderer draws as a
 * living factory: item-plane pieces (feeder / track / gate / bin) become hopper / belt /
 * switch-tower / container, laid out left-to-right by flow depth; the machine's VOICES
 * (sign, lamps, camera eyes, noisemakers) are collected for the gantry. Signal plumbing
 * (filters, counters, wires) is deliberately absent — the stage shows what the machine
 * DOES; the workshop shows how.
 *
 * Pure: no DOM, no state, no randomness. Coordinates are 0..1 fractions of the stage.
 */

// pen (task B): a waiting room, the same item-plane standing as a track or a gate — belongs in
// the flow-depth layout beside them, never dropped to a "stray" wall placement.
// brick (composing-arc task 5): a made part can carry items straight through it — it joins the
// SAME list, in BOTH this file and logic/floor-layout.js's own copy (the two have never shared
// one array; see that file's own note), so a brick counts toward flow depth exactly like a bin.
// carmaker (car-galleries task 11): an ITEM SOURCE, a feeder's own standing — one `go` builds one
// car crate onto a track. It joins this list for the same reason a feeder does (it is the START of
// a flow), so it is drawn on the belt line and counted in flow depth rather than parked on the wall
// by logic/floor-layout.js's stray sweep.
const ITEM_TYPES = ['feeder', 'track', 'gate', 'pen', 'bin', 'checker', 'brick', 'carmaker'];

/**
 * @param {{pieces:Array, snaps:Array}} table — the workshop table (UI shape, not layout)
 * @returns {{nodes:Object, edges:Array, voices:Object, cols:number}}
 *   nodes: id → {id,type,name,x,y,exits} with x,y in 0..1 (centres)
 *   edges: [{from,to}] item-plane couplings between placed nodes
 *   voices: {signs, lamps, cams, noise} — each [{id,name,...}]
 */
function stagePlan(table) {
  const pieces = table.pieces || [];
  const byId = {};
  for (const p of pieces) byId[p.id] = p;
  const nodes = pieces.filter((p) => ITEM_TYPES.includes(p.type));
  const edges = (table.snaps || [])
    .map((s) => ({ from: s.from.piece, to: s.to.piece }))
    .filter((e) => byId[e.from] && byId[e.to]
      && ITEM_TYPES.includes(byId[e.from].type) && ITEM_TYPES.includes(byId[e.to].type));

  // Flow depth: LONGEST PATH over the couplings — cycle-safe, one visit per node and edge
  // (Kahn's algorithm plus a deterministic stall-break for cycles).
  //
  // WHY not BFS-with-a-guard (the shape this replaces): a belt LOOP — three tracks coupled in
  // a circle, four pieces, buildable from the shelf — re-enqueued itself at depth+1 forever;
  // the old `guard < 10000` burned, reported maxD ≈ 9800, and floorPlan laid the room across a
  // 727,029-px world (measured 2026-09-05). A guard is a ceiling wearing a safety's clothes.
  // Here a cycle cannot spin the walk at all: when nothing has indegree 0 and unvisited nodes
  // remain, the stall-break pops the unvisited node a popped ancestor has already reached (the
  // loop's ENTRY — smallest depth wins, the pieces' own stable order breaks ties), so the loop
  // unrolls exactly once past its entry and the walk moves on. A DAG never stalls, so every
  // acyclic machine lays out exactly as before.
  const out = {}, indeg = {};
  for (const n of nodes) { out[n.id] = []; indeg[n.id] = 0; }
  for (const e of edges) { out[e.from].push(e.to); indeg[e.to] += 1; }
  const depth = {}, queuedUp = {};
  const ready = [];
  for (const n of nodes) if (!indeg[n.id]) { ready.push(n.id); queuedUp[n.id] = true; depth[n.id] = 0; }
  let head = 0;
  while (head < ready.length || ready.length < nodes.length) {
    if (head >= ready.length) {
      // Stalled: everything unvisited sits on (or behind) a cycle. Break at the entry.
      let pick = null, best = Infinity;
      for (const n of nodes) {
        if (queuedUp[n.id]) continue;
        const d = depth[n.id] !== undefined ? depth[n.id] : Infinity;
        if (d < best) { best = d; pick = n.id; }
      }
      if (pick === null) { // no reached node left: a free-floating loop — take the first, at 0
        for (const n of nodes) if (!queuedUp[n.id]) { pick = n.id; break; }
      }
      if (pick === null) break; // cannot happen (the while condition), but never loop blind
      if (depth[pick] === undefined) depth[pick] = 0;
      ready.push(pick); queuedUp[pick] = true;
    }
    const id = ready[head++];
    for (const to of out[id]) {
      // Never raise a node already in the queue: its depth is decided (that freeze IS the
      // one-time unroll — a back edge cannot re-open a settled column).
      if (!queuedUp[to] && (depth[to] === undefined || depth[to] < depth[id] + 1)) depth[to] = depth[id] + 1;
      if (--indeg[to] === 0 && !queuedUp[to]) { ready.push(to); queuedUp[to] = true; }
    }
  }
  for (const n of nodes) if (depth[n.id] === undefined) depth[n.id] = 0;

  const maxD = Math.max(0, ...nodes.map((n) => depth[n.id]));
  const cols = {};
  for (const n of nodes) (cols[depth[n.id]] = cols[depth[n.id]] || []).push(n);
  const placed = {};
  for (const d of Object.keys(cols)) {
    // Siblings keep the kid's own top-to-bottom order — their table, their world.
    const col = cols[d].slice().sort((a, b) => (a.y || 0) - (b.y || 0));
    col.forEach((n, i) => {
      placed[n.id] = {
        id: n.id,
        type: n.type,
        name: n.name || '',
        x: (Number(d) + 0.5) / (maxD + 1),
        y: (i + 0.5) / col.length,
        exits: n.type === 'gate' ? (n.exits || 1) : 0,
      };
    });
  }

  // The machine's VOICES and HANDS — everything the stage shows or lets a person touch
  // besides the belt. Order = the kid's own top-to-bottom order on the table.
  const byY = (a, b) => (a.y || 0) - (b.y || 0);
  const of = (pred, map) => pieces.filter(pred).slice().sort(byY).map(map);
  const voices = {
    signs: of((p) => p.type === 'sign', (p) => ({ id: p.id, name: p.name || '', mode: p.mode || 'label' })),
    lamps: of((p) => p.type === 'lamp', (p) => ({ id: p.id, name: p.name || '', colour: p.colour || 'red' })),
    // Every LIVE sense (camera, pose, …) is a scanner screen; the first is the hero.
    cams: of((p) => p.type === 'sense' && (p.senseId === 'cam' || p.senseId === 'pose'), (p) => ({ id: p.id, name: p.name || '', senseId: p.senseId })),
    noise: of((p) => p.type === 'noisemaker', (p) => ({ id: p.id, name: p.name || '' })),
    // Counters are gauges on the gantry; Buttons are the machine's HANDS — real tappable
    // controls on the stage HUD (a person is an input; a stage you cannot press is a film).
    counters: of((p) => p.type === 'counter', (p) => ({ id: p.id, name: p.name || '', n: p.n })),
    buttons: of((p) => p.type === 'button', (p) => ({ id: p.id, name: p.name || '' })),
  };
  // A ROOM machine (no belt at all — the impatient pet is the one gallery shape left like this;
  // the watchdog had this shape too until task 10 gave it a belt, so it no longer qualifies) has
  // no floor to draw: the stage promotes the scanner to the hero and the voices to centre stage.
  const roomMachine = nodes.length === 0;
  return { nodes: placed, edges, voices, cols: maxD + 1, roomMachine };
}

const api = { stagePlan, ITEM_TYPES };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.WorkshopStageLayout = api;
