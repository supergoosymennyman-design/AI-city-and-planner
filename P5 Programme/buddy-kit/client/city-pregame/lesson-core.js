/**
 * city-pregame/lesson-core.js — PURE logic for the City Planning Academy rooms.
 *
 * No DOM, no localStorage, no randomness that isn't seeded. Kept separate from
 * app.js so the algorithm teaching can be unit-tested (tests/pregame-lesson.test.mjs).
 *
 * Exports:
 *   - WEIGHT_LAB      config for the Room 1 "feel what a weight does" lab
 *   - weightLabTotal(split, scores)   weighted total for a two-part split
 *   - dijkstraReveal(graph, start)    ordered Dijkstra reveal steps (Room 3)
 *   - DIJKSTRA_LESSON / BUS_DIST      the Room 3 ant-trail graph + expected answer
 */

// ── Room 1 — Weight Lab ─────────────────────────────────────────────
// A two-part split teaches what a weight DOES: bigger share = bigger say.
// scores[0] = sub-score of the left subject, scores[1] = sub-score of the right.
// split ∈ [0,1] = share given to the left subject.
export const WEIGHT_LAB = {
  left: { name: 'Near roads', score: 90 },
  right: { name: 'Parks', score: 50 },
};

export function weightLabTotal(split, scores) {
  const s = Number(split);
  if (!Number.isFinite(s)) return NaN;
  const c = Math.max(0, Math.min(1, s));
  return Math.round((scores[0] * c + scores[1] * (1 - c)) * 10) / 10;
}

// ── Room 3 — Dijkstra reveal ─────────────────────────────────────────
// The ant map as a small graph. `x`/`z` are SVG pixel positions (for the map in
// app.js); `len` is the teaching distance in metres (NOT pixel distance — the
// map is stylised). H = HOME, BUS = the bus stop. Edges match the three routes
// shown in the room: A = 150+100+100=350, B = 200+250=450, C = 120+180+120=420.
export const DIJKSTRA_LESSON = {
  start: 'H',
  nodes: {
    H: { x: 90, z: 62, label: 'HOME', dist: 0 },
    A1: { x: 240, z: 62, label: 'A' },
    A2: { x: 240, z: 152, label: 'A' },
    C1: { x: 210, z: 62, label: 'C' },
    C2: { x: 210, z: 112, label: 'C' },
    B1: { x: 90, z: 232, label: 'B' },
    BUS: { x: 392, z: 152, label: 'BUS' },
  },
  edges: [
    ['H', 'A1', 150],
    ['A1', 'A2', 100],
    ['A2', 'BUS', 100],
    ['H', 'C1', 120],
    ['C1', 'C2', 180],
    ['C2', 'BUS', 120],
    ['H', 'B1', 200],
    ['B1', 'BUS', 250],
  ],
};

/** Expected shortest distance HOME → BUS (route A: 350m, inside the 400m budget). */
export const DIJKSTRA_BUS_DIST = 350;

/**
 * Run Dijkstra and return an ordered list of REVEAL events for teaching.
 * The child watches the search "expand to the closest un-fixed crossing", mark
 * neighbours, settle the closest, and finally reach BUS — the honest algorithm,
 * not a magic path. Every event:
 *   { kind:'settle'|'mark', node, dist }
 * 'settle' = this node is now fixed (closest of the frontier).
 * 'mark'   = a neighbour has a new best *tentative* distance (may lower later).
 * Deterministic; ties broken by node id order.
 *
 * Order guarantee (what makes it teachable): a node is announced SETTLED before
 * its neighbours are marked, so the child never sees the search spread past a
 * crossing that hasn't been confirmed yet. H's neighbours are marked right
 * after H itself settles.
 */
export function dijkstraReveal(graph = DIJKSTRA_LESSON, start = 'H') {
  const { nodes, edges } = graph;
  const dist = {};
  const done = {};
  const reveals = [];
  for (const id of Object.keys(nodes)) dist[id] = Infinity;
  dist[start] = 0;
  done[start] = true;
  reveals.push({ kind: 'settle', node: start, dist: 0 });

  const relax = (u) => {
    for (const [a, b, len] of edges) {
      const other = a === u ? b : b === u ? a : null;
      if (other === null || done[other]) continue;
      const nd = dist[u] + len;
      if (nd < dist[other]) {
        dist[other] = nd;
        reveals.push({ kind: 'mark', node: other, dist: nd });
      }
    }
  };
  relax(start);

  for (;;) {
    // Pick the closest unsettled node.
    let u = null;
    let best = Infinity;
    const ids = Object.keys(nodes).sort(); // deterministic tie-break
    for (const id of ids) {
      if (!done[id] && dist[id] < best) { best = dist[id]; u = id; }
    }
    if (u === null) break;
    done[u] = true;
    reveals.push({ kind: 'settle', node: u, dist: dist[u] });
    relax(u);
  }

  return { reveals, dist };
}

/** Winner id: route of the shortest HOME→BUS path ('A'|'B'|'C'), by edge prefix. */
export function dijkstraWinner(dist) {
  if (Math.abs(dist.BUS - 350) < 1e-9) return 'A';
  if (Math.abs(dist.BUS - 450) < 1e-9) return 'B';
  if (Math.abs(dist.BUS - 420) < 1e-9) return 'C';
  return null;
}
