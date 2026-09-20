/**
 * city-common/walkability.js — can a home actually WALK to what it needs?
 *
 * The planner's other metrics check *proximity* ("is this within 60m of a
 * road?") but not *reachability* ("can a person walk along the roads from
 * home A to school B?"). This module builds a graph from the continuous road
 * polylines and runs Dijkstra to answer the walk question properly:
 *
 *   - nodes: road endpoints + intersections (deduped to a 1m grid)
 *   - edges: sub-segments along each road between consecutive nodes
 *   - every building/park attaches to its nearest node on the road network
 *   - for each home, the shortest walking distance to each of its needs
 *     (school/shop/hospital/fire/police + water/power/bus + a park) is
 *     measured against WALK_BUDGET (metres)
 *
 * Pure client-side, deterministic, no external deps. Safe for cities with no
 * roads (reach = 0), disconnected road components (unreachable homes), or no
 * homes (vacuous 1 — nothing to test).
 *
 * Usage:
 *   const walk = computeWalkReach(layout);       // {reach, homes, budget}
 *   computeMetrics(layout, undefined, weights, walk);
 */

import { METRIC_PARAMS } from './metrics.js';

/** A home's walking budget to reach a single need, in metres. */
export const WALK_BUDGET = 400;

const SERVICE_TYPES = METRIC_PARAMS.serviceTypes;   // school, shop, hospital, fire, police
const UTILITY_TYPES = METRIC_PARAMS.utilityTypes;   // water, power, bus

/** Round a coordinate to the nearest 1m so near-identical points dedupe. */
function key(x, z) {
  return `${Math.round(x)},${Math.round(z)}`;
}

/**
 * Build the road graph from a layout.
 * Returns { nodes: [{x,z}], nodeIndex: Map<key, idx>, edges: [[idxA, idxB, length]],
 *          access: [{x, z, node}] } or null when there are no roads.
 */
export function buildWalkGraph(layout) {
  const roads = layout.roads || [];
  if (!roads.length) return null;

  // 1. Segment endpoints + pairwise intersections become nodes.
  const nodeMap = new Map();       // key -> idx
  const nodeList = [];
  const addNode = (x, z) => {
    const k = key(x, z);
    if (nodeMap.has(k)) return nodeMap.get(k);
    nodeMap.set(k, nodeList.length);
    nodeList.push({ x, z });
    return nodeList.length - 1;
  };

  // Collect all polyline points first (they are guaranteed nodes).
  const polylines = roads.map((r) => r.points.map(([px, pz]) => [px, pz]));
  for (const pl of polylines) for (const [px, pz] of pl) addNode(px, pz);

  // Intersections between non-adjacent segments (robust enough: sub-metre
  // resolution, roads are straight-ish). O(n²) over segments is fine — a
  // student city has < 100 road segments.
  const segs = [];
  for (const pl of polylines) {
    for (let i = 0; i < pl.length - 1; i++) segs.push([pl[i], pl[i + 1]]);
  }
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const pt = segmentIntersection(segs[i][0], segs[i][1], segs[j][0], segs[j][1]);
      if (pt) addNode(pt.x, pt.z);
    }
  }

  // 2. Edges: walk each polyline, splitting at every node that lies on it.
  const edgeSet = new Set();
  const edges = [];
  const addEdge = (a, b) => {
    if (a === b) return;
    const k = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (edgeSet.has(k)) return;
    edgeSet.add(k);
    const na = nodeList[a], nb = nodeList[b];
    const len = Math.hypot(nb.x - na.x, nb.z - na.z);
    edges.push([a, b, len]);
  };
  for (const pl of polylines) {
    // Project every point onto the polyline and order by arc length.
    const walk = [{ key: key(pl[0][0], pl[0][1]), arc: 0 }];
    let cum = 0;
    for (let i = 0; i < pl.length - 1; i++) {
      const seg = Math.hypot(pl[i + 1][0] - pl[i][0], pl[i + 1][1] - pl[i][1]);
      cum += seg;
      walk.push({ key: key(pl[i + 1][0], pl[i + 1][1]), arc: cum });
    }
    // Include any graph node that lies ON this polyline (intersections).
    for (const [k, idx] of nodeMap) {
      const [x, z] = k.split(',').map(Number);
      if (pointOnPolyline(x, z, pl)) {
        const arc = arcAt(x, z, pl);
        if (arc > 0.001 && arc < cum - 0.001) walk.push({ key: k, arc });
      }
    }
    walk.sort((a, b) => a.arc - b.arc);
    // Collapse duplicates (same node at same arc) then chain edges.
    const uniq = [];
    for (const w of walk) {
      const last = uniq[uniq.length - 1];
      if (!last || last.key !== w.key) uniq.push(w);
    }
    for (let i = 0; i < uniq.length - 1; i++) {
      addEdge(nodeMap.get(uniq[i].key), nodeMap.get(uniq[i + 1].key));
    }
  }

  // 3. Building/park access points: project onto the nearest edge and INSERT
  //    the projection as a node (splitting that edge), so walking distances
  //    are exact rather than snapped to the nearest block-end node. When the
  //    projection coincides with an existing node (e.g. a home at a crossing)
  //    the dedupe just reuses it.
  const access = { buildings: [], parks: [] };
  const splitEdge = (ai, bi, x, z) => {
    const k = key(x, z);
    if (nodeMap.has(k)) return nodeMap.get(k);
    const idx = nodeList.length;
    nodeMap.set(k, idx);
    nodeList.push({ x, z });
    // Remove the original edge, add the two halves.
    const eIdx = edges.findIndex((e) => (e[0] === ai && e[1] === bi) || (e[0] === bi && e[1] === ai));
    if (eIdx >= 0) edges.splice(eIdx, 1);
    addEdge(ai, idx);
    addEdge(idx, bi);
    return idx;
  };
  const attach = (x, z) => {
    let bestEdge = null, best = null, bestDist = Infinity;
    for (const [ai, bi] of edges) {
      const a = nodeList[ai], b = nodeList[bi];
      const p = pointOnSegment(x, z, a.x, a.z, b.x, b.z);
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bestDist) { bestDist = d; best = p; bestEdge = [ai, bi]; }
    }
    if (!best || !bestEdge) return null;
    const node = splitEdge(bestEdge[0], bestEdge[1], best.x, best.z);
    return { x: best.x, z: best.z, node };
  };

  for (const b of layout.buildings || []) {
    const a = attach(b.pos[0], b.pos[1]);
    access.buildings.push(a ? { type: b.type, ...a, pos: b.pos } : null);
  }
  for (const p of layout.parks || []) {
    const a = attach(p.cx, p.cz);
    access.parks.push(a ? { x: a.x, z: a.z, node: a.node, cx: p.cx, cz: p.cz } : null);
  }

  // Rebuild adjacency (edges changed after splitting).
  const adj = Array.from({ length: nodeList.length }, () => []);
  for (const [a, b, len] of edges) {
    adj[a].push([b, len]);
    adj[b].push([a, len]);
  }

  return { nodes: nodeList, edges, adj, access };
}

/** Smallest t (0..1) of the closest point on segment A→B to (x,z). */
function pointOnSegment(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return { x: ax + t * dx, z: az + t * dz };
}

/** True when (x,z) lies on the polyline (within 0.5m). */
function pointOnPolyline(x, z, pl) {
  for (let i = 0; i < pl.length - 1; i++) {
    const a = pl[i], b = pl[i + 1];
    const p = pointOnSegment(x, z, a[0], a[1], b[0], b[1]);
    if (Math.hypot(p.x - x, p.z - z) <= 0.5) return true;
  }
  return false;
}

/** Distance along the polyline from its start to the projection of (x,z). */
function arcAt(x, z, pl) {
  let cum = 0;
  for (let i = 0; i < pl.length - 1; i++) {
    const a = pl[i], b = pl[i + 1];
    const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const p = pointOnSegment(x, z, a[0], a[1], b[0], b[1]);
    if (Math.hypot(p.x - x, p.z - z) <= 0.5) return cum + Math.hypot(p.x - a[0], p.z - a[1]);
    cum += segLen;
  }
  return cum;
}

/** Segment-segment intersection point (or null). Handles collinear overlap. */
function segmentIntersection(a, b, c, d) {
  const rX = b[0] - a[0], rY = b[1] - a[1];
  const sX = d[0] - c[0], sY = d[1] - c[1];
  const denom = rX * sY - rY * sX;
  const eps = 1e-6;
  if (Math.abs(denom) < eps) {
    // Parallel — check if c lies on segment a-b (collinear overlap).
    if (Math.abs((c[0] - a[0]) * rY - (c[1] - a[1]) * rX) < eps
      && pointOnSegT(a, b, c)) return { x: c[0], z: c[1] };
    return null;
  }
  const t = ((c[0] - a[0]) * sY - (c[1] - a[1]) * sX) / denom;
  const u = ((c[0] - a[0]) * rY - (c[1] - a[1]) * rX) / denom;
  if (t >= -eps && t <= 1 + eps && u >= -eps && u <= 1 + eps) {
    return { x: a[0] + t * rX, z: a[1] + t * rY };
  }
  return null;
}

function pointOnSegT(a, b, p) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz;
  if (!l2) return Math.hypot(p[0] - a[0], p[1] - a[1]) < 1e-6;
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2;
  return t >= -1e-6 && t <= 1 + 1e-6;
}

/**
 * Dijkstra from `start` over the graph. Returns dist[] (Infinity for
 * unreachable) and prev[] for path reconstruction.
 */
function dijkstra(graph, start) {
  const { adj, nodes } = graph;
  const n = nodes.length;
  const dist = new Array(n).fill(Infinity);
  const prev = new Array(n).fill(-1);
  const done = new Array(n).fill(false);
  dist[start] = 0;
  for (;;) {
    let u = -1, best = Infinity;
    for (let i = 0; i < n; i++) {
      if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
    }
    if (u === -1) break;
    done[u] = true;
    for (const [v, w] of adj[u]) {
      if (done[v]) continue;
      const nd = dist[u] + w;
      if (nd < dist[v]) { dist[v] = nd; prev[v] = u; }
    }
  }
  return { dist, prev };
}

/** Reconstruct node path [startIdx … endIdx] from prev[]. */
function reconstruct(prev, end) {
  const path = [];
  let cur = end;
  while (cur !== -1) {
    path.push(cur);
    cur = prev[cur];
  }
  return path.reverse();
}

/**
 * Compute walkability for a layout.
 * Returns { reach: 0..1, budget, homes: [...] , graph }.
 *  - homes[i] = { dist: {type: metres}, ok: {type: bool}, reach: 0..1 }
 *    (homes with no road attachment get reach 0)
 *  - reach = mean per-home share of needs within budget (1 when no homes)
 */
export function computeWalkReach(layout) {
  const graph = buildWalkGraph(layout);
  if (!graph) {
    const homes = (layout.buildings || []).filter((b) => b.type === 'housing');
    return {
      reach: homes.length ? 0 : 1,
      budget: WALK_BUDGET,
      homes: homes.map(() => ({ dist: {}, ok: {}, reach: 0 })),
      graph: null,
    };
  }

  const needs = [...SERVICE_TYPES, ...UTILITY_TYPES, 'park'];
  const buildings = layout.buildings || [];
  const parks = layout.parks || [];

  // Target node sets per need type.
  const targetNodes = {};
  for (const t of needs) targetNodes[t] = [];
  buildings.forEach((b, i) => {
    const acc = graph.access.buildings[i];
    if (acc) targetNodes[b.type] = targetNodes[b.type] || [];
    if (acc && targetNodes[b.type]) targetNodes[b.type].push(acc.node);
  });
  parks.forEach((p, i) => {
    const acc = graph.access.parks[i];
    if (acc) targetNodes.park.push(acc.node);
  });

  const homesOut = [];
  const housingIdxs = buildings
    .map((b, i) => (b.type === 'housing' ? i : -1))
    .filter((i) => i >= 0);

  let reachSum = 0;
  for (const hi of housingIdxs) {
    const acc = graph.access.buildings[hi];
    const home = { dist: {}, ok: {}, reach: 0 };
    if (acc) {
      const { dist, prev } = dijkstra(graph, acc.node);
      let okCount = 0;
      for (const t of needs) {
        let best = Infinity;
        for (const tn of targetNodes[t] || []) {
          if (dist[tn] < best) best = dist[tn];
        }
        home.dist[t] = best;
        home.ok[t] = best <= WALK_BUDGET;
        if (home.ok[t]) okCount++;
      }
      home.reach = needs.length ? okCount / needs.length : 1;
    }
    reachSum += home.reach;
    homesOut.push(home);
  }

  return {
    reach: housingIdxs.length ? reachSum / housingIdxs.length : 1,
    budget: WALK_BUDGET,
    homes: homesOut,
    graph,
  };
}

/** Shortest node-coordinate path from `from` to `to` for drawing (or null). */
export function walkPath(graph, fromIdx, toIdx) {
  if (!graph || fromIdx < 0 || toIdx < 0) return null;
  const { dist, prev } = dijkstra(graph, fromIdx);
  if (!Number.isFinite(dist[toIdx])) return null;
  return reconstruct(prev, toIdx).map((i) => ({ x: graph.nodes[i].x, z: graph.nodes[i].z }));
}

/**
 * Per-home routes for the planner's Walk view — the VISIBLE algorithm.
 *
 * Given a walk result and a HOME building index, return the real walking route
 * from that home to the nearest reachable instance of each need (service /
 * utility / park) INSIDE the walk budget:
 *
 *   [{ type:'school', dist: 320, ok: true, path:[{x,z}, …] }, …]
 *
 * `ok` is true when the nearest instance is within WALK_BUDGET (the route is
 * drawn green) and false when the closest is too far (drawn red — the child
 * sees WHY the home is unserved). Unavailable destinations have explicit statuses and empty paths.
 * No selected home returns one no-selected-home status.
 */
export function homeReachRoutes(layout, walk, homeIdx) {
  const graph = walk && walk.graph;
  const buildings = layout.buildings || [];
  const parks = layout.parks || [];
  const home = buildings[homeIdx];
  const unavailable = (type, status) => ({ type, status, dist: null, ok: false, path: [] });
  if (!home || home.type !== 'housing') return [unavailable(null, 'no-selected-home')];
  const needs = [...SERVICE_TYPES, ...UTILITY_TYPES, 'park'];
  const acc = graph?.access.buildings[homeIdx];
  if (!acc) return needs.map((type) => unavailable(type, 'no-road-access'));

  // Node index of every instance of each need (so we can find the nearest).
  const targetNodes = {};
  for (const t of needs) targetNodes[t] = [];
  buildings.forEach((b, i) => {
    const a = graph.access.buildings[i];
    // Only target actual need types (never another home).
    if (a && b.type !== 'housing' && Object.prototype.hasOwnProperty.call(targetNodes, b.type)) {
      targetNodes[b.type].push(a.node);
    }
  });
  parks.forEach((p, i) => {
    const a = graph.access.parks[i];
    if (a) targetNodes.park.push(a.node);
  });

  const { dist, prev } = dijkstra(graph, acc.node);
  const routes = [];
  for (const t of needs) {
    const nodes = targetNodes[t];
    if (!nodes.length) {
      const exists = t === 'park' ? parks.length > 0 : buildings.some((b) => b.type === t);
      routes.push(unavailable(t, exists ? 'no-road-access' : 'absent-destination'));
      continue;
    }
    let bestIdx = -1;
    let best = Infinity;
    for (const n of nodes) {
      if (dist[n] < best) { best = dist[n]; bestIdx = n; }
    }
    if (bestIdx < 0 || !Number.isFinite(best)) { routes.push(unavailable(t, 'disconnected')); continue; }
    const path = reconstruct(prev, bestIdx).map((i) => ({ x: graph.nodes[i].x, z: graph.nodes[i].z }));
    routes.push({ type: t, status: best <= WALK_BUDGET ? 'reachable' : 'over-budget', dist: Math.round(best), ok: best <= WALK_BUDGET, path });
  }
  return routes;
}
