// Deterministic, renderer-free road graph used by ambient traffic and scenery.
// Keeping this geometry here makes junction behaviour testable without three.js.
const EPS = 0.01;
const LANE_OFFSET_FACTOR = 0.22;
const MAX_LANE_OFFSET = 1.8;
const STOP_DECELERATION = 18;
const STOP_BUFFER = 0.75;
const SEAMLESS_DOT = .94;
const SEAM_BLEND_DISTANCE = 8;

function point(x, z) { return { x, z }; }
function length(a, b) { return Math.hypot(b.x - a.x, b.z - a.z); }
function cross(a, b) { return a.x * b.z - a.z * b.x; }
function sub(a, b) { return point(a.x - b.x, a.z - b.z); }
function segmentHit(a, b, c, d) {
  const r = sub(b, a), s = sub(d, c), den = cross(r, s);
  if (Math.abs(den) < 1e-8) return null;
  const q = sub(c, a), t = cross(q, s) / den, u = cross(q, r) / den;
  if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;
  return { t: Math.max(0, Math.min(1, t)), u: Math.max(0, Math.min(1, u)), x: a.x + r.x * t, z: a.z + r.z * t };
}
function seeded(seed = 0x51f15e) {
  let n = seed | 0;
  return () => { n = (n + 0x6D2B79F5) | 0; let t = Math.imul(n ^ n >>> 15, 1 | n); t = (t + Math.imul(t ^ t >>> 7, 61 | t)) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// Passiona is set in Hong Kong: vehicles keep to the left. Keep this single
// convention shared by simulation envelopes and the renderer.
function laneOffset(link) { return Math.min(MAX_LANE_OFFSET, (link.width || 9) * LANE_OFFSET_FACTOR); }
function lanePoint(link, dist) {
  const t = Math.max(0, Math.min(1, dist / Math.max(link.length, EPS)));
  const offset = laneOffset(link);
  return {
    x:
    link.from.x + (link.to.x - link.from.x) * t - link.dz * offset,
    z: link.from.z + (link.to.z - link.from.z) * t + link.dx * offset,
    dx: link.dx, dz: link.dz,
  };
}

function smoothstep(t) { return t * t * (3 - 2 * t); }
function normalize(dx, dz) {
  const l = Math.hypot(dx, dz) || 1;
  return { dx: dx / l, dz: dz / l };
}

// A polyline's adjacent pieces are one physical road, even though their
// lane-centre offsets do not meet at a bend.  Blend that small offset mismatch
// before the shared node.  This keeps the lane pose continuous without adding
// a fake, travelled connector that can pull a car backwards at every corner.
function seamlessLanePoint(link, dist, transition) {
  const pose = lanePoint(link, dist);
  if (!transition?.seamless || transition.from !== link) return pose;
  const blend = Math.min(SEAM_BLEND_DISTANCE, link.length);
  const start = link.length - blend;
  if (dist <= start) return pose;
  const w = smoothstep(Math.max(0, Math.min(1, (dist - start) / Math.max(blend, EPS))));
  const nextPose = lanePoint(transition.to, 0);
  const tangent = normalize(
    link.dx + (transition.to.dx - link.dx) * w,
    link.dz + (transition.to.dz - link.dz) * w,
  );
  return {
    x: pose.x + (nextPose.x - lanePoint(link, link.length).x) * w,
    z: pose.z + (nextPose.z - lanePoint(link, link.length).z) * w,
    ...tangent,
  };
}

function cubic(a, b, c, d, t) {
  const u = 1 - t;
  return point(
    u ** 3 * a.x + 3 * u ** 2 * t * b.x + 3 * u * t ** 2 * c.x + t ** 3 * d.x,
    u ** 3 * a.z + 3 * u ** 2 * t * b.z + 3 * u * t ** 2 * c.z + t ** 3 * d.z,
  );
}

function makeTurnPath(from, to, allowSeamless = false) {
  // A gentle continuation along one authored road is not a junction turn.
  // Keeping this object in the route preserves its one-join-per-link shape,
  // while `seamless` tells the runtime it has zero travelled length.
  if (allowSeamless && from.roadId === to.roadId && from.dx * to.dx + from.dz * to.dz >= SEAMLESS_DOT) {
    return { points: [], cumulative: [0], length: 0, from, to, seamless: true,
      entryDx: from.dx, entryDz: from.dz, exitDx: to.dx, exitDz: to.dz,
      width: Math.min(from.width || 9, to.width || 9), roadId: to.roadId };
  }
  const p0 = lanePoint(from, from.length);
  const p3 = lanePoint(to, 0);
  const chord = Math.hypot(p3.x - p0.x, p3.z - p0.z);
  // A sharper turn needs a shorter handle so the connector does not overshoot
  // the junction pad; a gentle turn can afford a longer, calmer sweep. This is
  // what stops a 90° corner bulging out past the carriageway.
  const turnCos = Math.max(-1, Math.min(1, from.dx * to.dx + from.dz * to.dz));
  const sharpness = Math.acos(turnCos) / Math.PI;      // 0 straight → 1 reversal
  const handle = Math.max(2, Math.min(8, chord * (.75 - sharpness * .35)));
  const p1 = point(p0.x + from.dx * handle, p0.z + from.dz * handle);
  const p2 = point(p3.x - to.dx * handle, p3.z - to.dz * handle);
  const points = [];
  const cumulative = [0];
  // Doubled from 12: a coarse polyline made a text-book turn read as a
  // sequence of straight hops rather than one continuous arc.
  const SEGMENTS = 24;
  for (let i = 0; i <= SEGMENTS; i++) {
    const p = cubic(p0, p1, p2, p3, i / SEGMENTS);
    points.push(p);
    if (i) cumulative.push(cumulative[i - 1] + length(points[i - 1], p));
  }
  return { points, cumulative, length: cumulative.at(-1) || 0, from, to,
    // Heading belongs to the logical lanes, not to the chord between two
    // offset endpoints. This stays forward through a compact bridge even when
    // that chord lies slightly behind the incoming lane at a sharp vertex.
    entryDx: from.dx, entryDz: from.dz, exitDx: to.dx, exitDz: to.dz,
    seamless: false, vehicles: [], width: Math.min(from.width || 9, to.width || 9), roadId: to.roadId };
}

function pathPoint(path, dist) {
  const s = Math.max(0, Math.min(path.length, dist));
  let i = 0;
  while (i < path.cumulative.length - 2 && path.cumulative[i + 1] < s) i++;
  const span = path.cumulative[i + 1] - path.cumulative[i] || 1;
  const t = (s - path.cumulative[i]) / span;
  const a = path.points[i], b = path.points[i + 1];
  // Follow the curve's own tangent. The previous version linearly blended the
  // entry and exit headings across the whole connector, so a car slid/crabbed
  // sideways through a turn while its position travelled the arc. At the two
  // endpoints the tangent equals the logical lane heading (p1 is p0 + entry*handle,
  // p2 is p3 - exit*handle), so this still meets both lanes exactly.
  const heading = normalize(b.x - a.x, b.z - a.z);
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, dx: heading.dx, dz: heading.dz };
}

// The single most "straight ahead" legal continuation from a link. Shared by
// route planning and live junction choice so a straight-only crossing behaves
// the same whether a car is following a plan or improvising.
function straightExit(link) {
  let best = null, bestDot = -Infinity;
  for (const next of link.to.links) {
    if (next === link || next.to === link.from) continue;
    const dot = link.dx * next.dx + link.dz * next.dz;
    if (dot > bestDot || (dot === bestDot && best && next.id < best.id)) { best = next; bestDot = dot; }
  }
  return best;
}

// Ambient traffic is deliberately sized from the usable, *undirected* road
// distance.  Renderer code should not need to guess whether a graph contains
// one or two directed links for every bit of asphalt.
export function trafficRoadLength(network) {
  return (network?.links || []).reduce((sum, link) => sum + link.length, 0) / 2;
}

// Keep the tablet budget separate from desktop.  A short, valid child layout
// still gets a noticeably living street, while a very large one cannot turn a
// low-memory tablet into a vehicle simulator.
export function trafficFleetPlan(network, { mobile = false, density = 1, routePlan = null } = {}) {
  const usableLength = trafficRoadLength(network);
  const safeDensity = Math.max(.25, Number.isFinite(density) ? density : 1);
  const cap = mobile ? 22 : 42;
  // A visible, not crowded compromise: enough moving cars to make a normal
  // city feel lived in, while avoiding redundant streams on children’s roads.
  const baseline = mobile ? 7 : 10;
  const requested = Math.round(usableLength / (mobile ? 42 : 38) * safeDensity);
  // A continuous route has finite, physical headway.  Do not satisfy a visual
  // baseline by stacking cars on a short driveway.
  const routeCapacity = routePlan ? Math.floor((routePlan.routes || []).reduce((sum, route) => sum + route.length, 0) / 12) : Infinity;
  const total = Math.min(cap, routeCapacity, Math.max(baseline, requested));
  return { usableLength, cap, total, cars: total, buses: 0 };
}

// A route is a deliberately small, immutable description of a continuous
// drive.  It is made after roads have been split at their real crossings, so
// traffic never has to invent a direction while it is already in a junction.
// `links` are lane-centred directed road pieces; `transitions[i]` joins link i
// to link i + 1 (wrapping at the end).
function finitePath(path) {
  return path.length > 1 && Number.isFinite(path.length) && path.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.z));
}

function reverseLink(link) {
  return link.to.links.find(candidate => candidate.to === link.from && candidate.roadId === link.roadId) || null;
}

function transitionFitsNetwork(network, path) {
  if (path.seamless) return true;
  if (!finitePath(path) || path.length < 1.5) return false;
  return path.points.every(p => pointInRoadCarriageway(network, p.x, p.z, 0) ||
    network.junctions.some(j => Math.hypot(p.x - j.node.x, p.z - j.node.z) <= j.clearance));
}

function routeFromWalk(walk, componentId, network) {
  if (walk.length < 3) return null;
  if (walk.some((link, index) => !joinsAtNode(link, walk[(index + 1) % walk.length]))) return null;
  const transitions = walk.map((link, index) => makeTurnPath(link, walk[(index + 1) % walk.length], true));
  if (transitions.some(path => !transitionFitsNetwork(network, path))) return null;
  const totalLength = walk.reduce((sum, link) => sum + link.length, 0) + transitions.reduce((sum, path) => sum + path.length, 0);
  if (!Number.isFinite(totalLength) || totalLength < 18) return null;
  return Object.freeze({ componentId, links: Object.freeze([...walk]), transitions: Object.freeze(transitions), length: totalLength,
    minWidth: Math.min(...walk.map(link => link.width || 0)), closed: true });
}

function physicalKey(link) {
  const reverse = reverseLink(link);
  return reverse ? Math.min(link.id, reverse.id) : link.id;
}

function joinsAtNode(from, to) {
  return Math.hypot(from.to.x - to.from.x, from.to.z - to.from.z) < .08;
}

function findDirectedCycle(component, usableSet, { straightOnly = false, kindByNode = null, budget = null } = {}) {
  const maxDepth = Math.max(3, component.length / 2);
  for (const start of [...component].sort((a, b) => a.id - b.id)) {
    if (budget && budget.used >= budget.limit) return null;
    const walk = [start], used = new Set([physicalKey(start)]);
    const visit = (current) => {
      if (budget && ++budget.used > budget.limit) return null;
      let exits = current.to.links.filter(next => usableSet.has(next) && next.from !== next.to && joinsAtNode(current, next) && next.to !== current.from);
      // At a plain crossing only the straight continuation may be used. A
      // component that cannot circulate without turning there (a pure grid)
      // is retried with turns allowed, so no district is left vehicle-free.
      if (straightOnly && kindByNode?.get(current.to.id) === 'cross') {
        const straight = straightExit(current);
        exits = exits.filter(next => next === straight);
      }
      exits.sort((a, b) => a.id - b.id);
      for (const next of exits) {
        if (budget && ++budget.used > budget.limit) return null;
        const key = physicalKey(next);
        // An edge may never be reused — not even to close. Without this a spur
        // could "close" by doubling back on its own reverse, inventing a U-turn
        // lollipop route (out to the dead end and straight back).
        if (used.has(key)) continue;
        if (next.to === start.from) {
          if (walk.length >= 3) return [...walk, next];
          continue;
        }
        if (walk.length >= maxDepth) continue;
        used.add(key); walk.push(next);
        const found = visit(next);
        if (found) return found;
        walk.pop(); used.delete(key);
      }
      return null;
    };
    const found = visit(start);
    if (found) return found;
  }
  return null;
}

/** Bound on independent circuits extracted from one connected district. */
const MAX_LOOPS_PER_COMPONENT = 4;

/**
 * Produce safe, deterministic, closed ambient-traffic routes.  Components do
 * use genuine directed circuits — every independent loop in a district, up to
 * MAX_LOOPS_PER_COMPONENT, so a ring plus an inner roundabout both get cars.
 * Branches and cul-de-sacs without a paved, lane-valid return circuit receive
 * no ambient vehicles rather than a visible U-turn or a disappearing model.
 */
export function planTrafficLoops(roadsOrNetwork, { minLinkLength = 1, minRoadWidth = 5 } = {}) {
  const network = Array.isArray(roadsOrNetwork) ? buildTrafficNetwork(roadsOrNetwork) : roadsOrNetwork;
  // A child's freehand stroke is sampled every ~2-3 m, so a short link is an
  // ordinary continuation of the SAME road, not a broken fragment. Excluding it
  // fragmented a genuine closed ring into 24 pieces and left the city carless.
  // Connectivity is therefore judged by width (a car cannot use a footpath);
  // the length floor only rejects truly degenerate slivers, and vehicle
  // PLACEMENT stays length-guarded separately (initialLoopPlacements refuses a
  // link shorter than a car, and routeFromWalk still demands a real >= 18 m
  // circuit). Widening the floor from 12 m to 1 m recovers hand-drawn rings
  // without changing any authored network (sample city + every road template
  // have zero links under 12 m).
  const usable = (network?.links || []).filter(link => link.length >= minLinkLength && (link.width || 0) >= minRoadWidth);
  const usableSet = new Set(usable);
  // Hard deterministic guard for adversarial dense imports. The physical edge
  // search remains complete for ordinary student networks, but can never fan
  // out indefinitely on a 4,000-point mesh.
  const budget = { used: 0, limit: Math.max(20000, Math.min(120000, usable.length * 40)) };
  const seen = new Set(), components = [], routes = [];
  for (const start of usable) {
    if (seen.has(start)) continue;
    const component = [], stack = [start]; seen.add(start);
    while (stack.length) {
      const link = stack.pop(); component.push(link);
      for (const next of [...link.from.links, ...link.to.links]) if (usableSet.has(next) && !seen.has(next)) { seen.add(next); stack.push(next); }
    }
    components.push(component);
  }
  const kindByNode = network.junctionKindByNode;
  components.forEach((component, componentId) => {
    // A district can hold SEVERAL genuine circuits — e.g. an outer ring with a
    // connected central roundabout. Find each independent loop in turn (bounded),
    // claiming its edges so the next search looks for a different one. This is
    // why both rings of the example city get cars instead of only the outer one.
    const claimed = new Set();
    for (let attempt = 0; attempt < MAX_LOOPS_PER_COMPONENT; attempt++) {
      const available = new Set(component.filter(link => !claimed.has(physicalKey(link))));
      // Prefer the calm straight-only crossing. Only if that leaves this circuit
      // unfound (a pure grid has no way around a block without turning) do we
      // fall back to allowing legal turns there.
      let walked = findDirectedCycle(component, available, { straightOnly: true, kindByNode, budget });
      let route = walked && routeFromWalk(walked, componentId, network);
      if (!route) {
        walked = findDirectedCycle(component, available, { straightOnly: false, kindByNode, budget });
        route = walked && routeFromWalk(walked, componentId, network);
      }
      if (!walked) break;
      for (const link of walked) claimed.add(physicalKey(link));
      if (route) routes.push(route);
    }
  });
  const covered = new Set(routes.flatMap(route => route.links));
  return Object.freeze({ network, routes: Object.freeze(routes), componentCount: components.length,
    coveredComponents: new Set(routes.map(route => route.componentId)).size,
    omittedComponents: components.length - new Set(routes.map(route => route.componentId)).size,
    omittedLinks: usable.length - covered.size, operationCount: budget.used, operationLimit: budget.limit,
    budgetExhausted: budget.used >= budget.limit });
}

/** Deterministic, evenly spread starting positions for a continuous fleet. */
export function initialLoopPlacements(routePlan, count, spawn = null) {
  const routes = routePlan?.routes || [];
  if (!routes.length || count <= 0) return [];
  // Opening bodies live on the interior of ordinary lane links, never on an
  // internal connector or junction mouth. Spread over actual usable lane
  // length rather than route index so a compact roundabout cannot consume half
  // the fleet merely because it is one of two routes.
  const candidates = routes.flatMap(route => route.links.map((link, routeStep) => ({ route, routeStep, link,
    length: Math.max(0, link.length - 8) })).filter(candidate => candidate.length > 0));
  const totalLength = candidates.reduce((sum, candidate) => sum + candidate.length, 0);
  if (!totalLength) return [];
  const placements = [];
  for (let i = 0; i < count; i++) {
    let remaining = (i + .5) / count * totalLength;
    let candidate = candidates.at(-1);
    for (const item of candidates) {
      if (remaining <= item.length) { candidate = item; break; }
      remaining -= item.length;
    }
    placements.push({ route: candidate.route, routeStep: candidate.routeStep, link: candidate.link, dist: 4 + remaining });
  }
  if (!spawn || !placements.length) return placements;

  // The first rendered car should be visible from the Champion, while the
  // physical set of placements remains evenly spread over all admitted loops.
  // Reordering (rather than inventing extra positions) preserves headway and
  // district coverage. Reserve at most two candidates on the nearest circuit.
  let nearestRoute = null, nearestRouteDistance = Infinity;
  for (const route of routes) for (const link of route.links) {
    const near = nearestDistanceOnLink(link, spawn);
    if (near.distance < nearestRouteDistance) { nearestRouteDistance = near.distance; nearestRoute = route; }
  }
  const nearby = placements
    .map((placement, index) => ({ placement, index, ...nearestDistanceOnLink(placement.link, spawn) }))
    .filter((item) => item.placement.route === nearestRoute)
    .sort((a, b) => a.distance - b.distance || a.index - b.index)
    .slice(0, Math.min(2, count));
  if (!nearby.length) return placements;
  const reserved = new Set(nearby.map((item) => item.index));
  return [...nearby.map((item) => item.placement), ...placements.filter((_, index) => !reserved.has(index))];
}

function nearestDistanceOnLink(link, spawn) {
  if (!spawn) return { distance: Infinity, dist: Math.min(Math.max(5, link.length / 2), Math.max(0, link.length - 5)) };
  const dx = link.to.x - link.from.x, dz = link.to.z - link.from.z;
  const l2 = dx * dx + dz * dz || 1;
  const raw = ((spawn.x - link.from.x) * dx + (spawn.z - link.from.z) * dz) / l2;
  const t = Math.max(0, Math.min(1, raw));
  const x = link.from.x + dx * t, z = link.from.z + dz * t;
  return {
    distance: Math.hypot(spawn.x - x, spawn.z - z),
    // Do not place directly on an endpoint: it can make the first frame look
    // like a despawn, and leaves the graph no room to enforce following gaps.
    dist: Math.min(Math.max(4, link.length - 4), Math.max(4, link.length * t)),
  };
}

/**
 * Deterministic opening placement order.  At most two cars are reserved for
 * the Champion's immediate view.  The remaining candidates cycle through
 * physical roads (rather than the two directed links of one segment), with
 * longer roads winning each new cycle.  Admission remains in addVehicle:
 * this is only a safe-to-skip candidate list, never permission to overlap.
 * Cars still enter through createTrafficFlow, so link spacing and junction
 * reservations remain the single source of truth.
 */
export function initialTrafficPlacements(network, count, spawn = null) {
  const links = network?.links || [];
  if (!links.length || count <= 0) return [];
  const ranked = links.map((link) => ({ link, ...nearestDistanceOnLink(link, spawn) }))
    .sort((a, b) => a.distance - b.distance || a.link.id - b.link.id);
  const placements = [];
  const nearbyCount = Math.min(2, count, ranked.length);
  for (let i = 0; i < nearbyCount; i++) placements.push({ link: ranked[i].link, dist: ranked[i].dist });

  const roads = new Map();
  for (const link of links) {
    const road = roads.get(link.roadId) || { roadId: link.roadId, links: [], length: 0 };
    road.links.push(link); road.length += link.length / 2; roads.set(link.roadId, road);
  }
  const roadList = [...roads.values()];
  // Continue a road after its reserved nearby lanes instead of immediately
  // retrying the exact same point (which graph admission would rightly skip).
  const usedOnRoad = new Map();
  for (const placement of placements) usedOnRoad.set(placement.link.roadId, (usedOnRoad.get(placement.link.roadId) || 0) + 1);
  while (placements.length < count) {
    // A weighted ordering gives long roads their fair share while the outer
    // loop guarantees every road is considered before any gets a second car.
    const cycle = [...roadList].sort((a, b) => b.length - a.length || a.roadId - b.roadId);
    for (const road of cycle) {
      if (placements.length >= count) break;
      const use = usedOnRoad.get(road.roadId) || 0;
      const link = road.links[use % road.links.length];
      const near = nearestDistanceOnLink(link, spawn);
      const laneLap = Math.floor(use / road.links.length);
      const dist = Math.min(Math.max(4, link.length - 4), near.dist + laneLap * 13);
      placements.push({ link, dist });
      usedOnRoad.set(road.roadId, use + 1);
    }
  }
  return placements;
}

/** Build a graph whose links stop at every real road intersection. */
export function buildTrafficNetwork(roads = []) {
  const segments = [];
  // Keep the identity of closed polylines: a branch touching one of these is
  // a roundabout merge, not an ordinary mutually-exclusive crossroads.
  const closedRoadIds = new Set(roads.flatMap((road, roadId) => {
    const pts = road.points || [];
    return pts.length > 2 && Math.hypot(pts[0][0] - pts.at(-1)[0], pts[0][1] - pts.at(-1)[1]) < .08 ? [roadId] : [];
  }));
  roads.forEach((road, roadId) => {
    const pts = road.points || [];
    for (let i = 1; i < pts.length; i++) {
      const a = point(pts[i - 1][0], pts[i - 1][1]), b = point(pts[i][0], pts[i][1]);
      if (length(a, b) > EPS) segments.push({ roadId, segmentId: i - 1, a, b, width: road.width || 9, cuts: [0, 1] });
    }
  });
  for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) {
    const A = segments[i], B = segments[j];
    // Adjacent pieces of one polyline already meet at their shared point.
    if (A.roadId === B.roadId && Math.abs(A.segmentId - B.segmentId) <= 1) continue;
    const hit = segmentHit(A.a, A.b, B.a, B.b);
    if (hit) { A.cuts.push(hit.t); B.cuts.push(hit.u); }
  }

  const nodes = [], nodeAt = (p) => {
    const found = nodes.find(n => Math.hypot(n.x - p.x, n.z - p.z) < .08);
    if (found) return found;
    const node = { id: nodes.length, x: p.x, z: p.z, links: [], roads: new Set() }; nodes.push(node); return node;
  };
  const links = [];
  for (const seg of segments) {
    const cuts = [...new Set(seg.cuts.map(v => Math.round(v * 1e6) / 1e6))].sort((a, b) => a - b);
    for (let i = 1; i < cuts.length; i++) {
      const t0 = cuts[i - 1], t1 = cuts[i];
      const a = point(seg.a.x + (seg.b.x - seg.a.x) * t0, seg.a.z + (seg.b.z - seg.a.z) * t0);
      const b = point(seg.a.x + (seg.b.x - seg.a.x) * t1, seg.a.z + (seg.b.z - seg.a.z) * t1);
      const from = nodeAt(a), to = nodeAt(b), len = length(a, b);
      if (len < EPS) continue;
      from.roads.add(seg.roadId); to.roads.add(seg.roadId);
      for (const [start, end] of [[from, to], [to, from]]) {
        const dx = (end.x - start.x) / len, dz = (end.z - start.z) / len;
        const link = { id: links.length, from: start, to: end, length: len, dx, dz, roadId: seg.roadId, width: seg.width, vehicles: [] };
        links.push(link); start.links.push(link);
      }
    }
  }
  // A real junction is where THREE OR MORE arms meet. `n.links` holds outgoing
  // links only, so it counts arms directly: a bend / elbow / through-node has
  // 2, a T has 3, a crossing or 4-way has 4+. Two roads joined end-to-end at an
  // elbow are NOT a junction — reserving them made cars needlessly stop at every
  // corner, and made the road renderer paint a stop line there.
  const junctions = nodes.filter(n => n.links.length >= 3).map(n => {
    const ringRoadIds = [...n.roads].filter(id => closedRoadIds.has(id));
    // A roundabout is a circulated closed ring whose other roads arrive as
    // single-arm stubs. A through road that merely *crosses* a ring (two arms
    // at this node) is an ordinary crossing: treating it as a roundabout made
    // avenues merge onto the outer ring instead of carrying straight across.
    const nonRingRoadIds = [...n.roads].filter(id => !closedRoadIds.has(id));
    const crossedByThroughRoad = nonRingRoadIds.some(id => n.links.filter(l => l.roadId === id).length >= 2);
    const roundabout = ringRoadIds.length > 0 && nonRingRoadIds.length > 0 && !crossedByThroughRoad;
    // A plain X (four or more arms) is signalised straight-only; a T keeps its
    // turn, and a roundabout keeps circulating.
    const kind = roundabout ? 'roundabout' : n.links.length >= 4 ? 'cross' : 't';
    return { node: n, owner: null, queue: [], clearance: Math.max(8, ...n.links.map(l => l.width)),
      ringRoadIds: new Set(ringRoadIds), roundabout, kind, crossedByThroughRoad };
  });
  const junctionByNode = new Map(junctions.map(j => [j.node.id, j]));
  const junctionKindByNode = new Map(junctions.map(j => [j.node.id, j.kind]));
  const entryLinks = links.filter(l => l.from.links.length === 1);
  return { nodes, links, junctions, junctionByNode, junctionKindByNode, entryLinks, segments, closedRoadIds };
}

export function pointInRoadCarriageway(network, x, z, radius = 0) {
  for (const seg of network.segments) {
    const dx = seg.b.x - seg.a.x, dz = seg.b.z - seg.a.z, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - seg.a.x) * dx + (z - seg.a.z) * dz) / l2));
    if (Math.hypot(x - (seg.a.x + dx * t), z - (seg.a.z + dz * t)) < seg.width / 2 + radius) return true;
  }
  return false;
}

// Resolve a circular walker from the actual carriageway ribbons. Applying this
// every movement frame prevents a fast auto-walk target from tunnelling through
// a road while still allowing normal movement along its edge.
export function resolveRoadCarriageway(network, x, z, radius = .5) {
  for (const seg of network.segments) {
    const dx = seg.b.x - seg.a.x, dz = seg.b.z - seg.a.z, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - seg.a.x) * dx + (z - seg.a.z) * dz) / l2));
    const qx = seg.a.x + dx * t, qz = seg.a.z + dz * t;
    let ox = x - qx, oz = z - qz, d = Math.hypot(ox, oz), limit = seg.width / 2 + radius;
    if (d >= limit) continue;
    if (d < 1e-5) { const l = Math.hypot(dx, dz) || 1; ox = -dz / l; oz = dx / l; d = 1; }
    x = qx + ox / d * limit; z = qz + oz / d * limit;
  }
  return { x, z };
}

export function isJunctionClear(network, x, z, pad = 5) {
  return !network.junctions.some(j => Math.hypot(x - j.node.x, z - j.node.z) < j.clearance + pad);
}

// Shared by park/tree placement and browser diagnostics. `radius` is the
// actual planted footprint, rather than merely the trunk centre.
export function isRoadsideSceneryClear(network, x, z, radius = 2.2, junctionPad = 8) {
  return !pointInRoadCarriageway(network, x, z, radius) && isJunctionClear(network, x, z, junctionPad + radius);
}

// Distance from a point to the nearest carriageway EDGE across every road in the
// network. Negative means the point is on the asphalt. Used to guarantee street
// furniture has real verge between it and the traffic.
export function roadEdgeClearance(network, x, z) {
  let best = Infinity;
  for (const seg of network.segments || []) {
    const dx = seg.b.x - seg.a.x, dz = seg.b.z - seg.a.z, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - seg.a.x) * dx + (z - seg.a.z) * dz) / l2));
    const d = Math.hypot(x - (seg.a.x + dx * t), z - (seg.a.z + dz * t)) - (seg.width || 9) / 2;
    if (d < best) best = d;
  }
  return best;
}

function trafficSpotIsClear(network, x, z, propRadius, margin) {
  // Hard guarantee: the prop footprint must miss this road AND every crossing
  // road, with real margin to the kerb. This is the "never in the middle of the
  // road" rule, checked against all ribbons rather than only the host road.
  if (pointInRoadCarriageway(network, x, z, propRadius)) return false;
  return roadEdgeClearance(network, x, z) >= propRadius + margin - 1e-6;
}

/**
 * Sidewalk positions for signal heads at plain X crossings. Renderer-free so
 * the placement rule is unit-testable. For each approach arm it tries both
 * pavements and walks outward until it finds a spot fully outside every road
 * ribbon; if none exists the arm is skipped rather than forced onto asphalt.
 */
export function trafficLightSpots(network, { propRadius = 1.2, margin = 0.6, maxPerJunction = 4, cap = 32 } = {}) {
  const spots = [];
  const crosses = (network?.junctions || []).filter(j => j.kind === 'cross');
  for (const junction of crosses) {
    if (spots.length >= cap) break;
    let placed = 0;
    for (const arm of [...junction.node.links].sort((a, b) => a.id - b.id)) {
      if (placed >= maxPerJunction || spots.length >= cap) break;
      const half = (arm.width || 9) / 2;
      const perpendicular = { x: -arm.dz, z: arm.dx };
      let chosen = null;
      // Near the node the arm-side point is still inside the CROSSING road's
      // ribbon; walking out along the arm reaches the pavement corner.
      for (let d = Math.max(2, propRadius); d <= junction.clearance + 12 && !chosen; d += 1) {
        for (const side of [1, -1]) {
          const x = junction.node.x + arm.dx * d + perpendicular.x * side * (half + margin + propRadius);
          const z = junction.node.z + arm.dz * d + perpendicular.z * side * (half + margin + propRadius);
          if (!trafficSpotIsClear(network, x, z, propRadius, margin)) continue;
          if (spots.some(spot => Math.hypot(spot.x - x, spot.z - z) < propRadius * 2)) continue;
          // Face down the arm, toward oncoming traffic.
          chosen = { x, z, yaw: Math.atan2(-arm.dx, -arm.dz), junctionId: junction.node.id, roadId: arm.roadId };
          break;
        }
      }
      if (chosen) { spots.push(chosen); placed++; }
    }
  }
  return spots;
}

export function createTrafficFlow(roads, { seed = 0x51f15e } = {}) {
  const network = buildTrafficNetwork(roads), rng = seeded(seed);
  const routePlan = planTrafficLoops(network);
  const vehicles = [];
  const chooseNext = (vehicle) => {
    if (vehicle.route) return vehicle.route.links[(vehicle.routeStep + 1) % vehicle.route.links.length];
    const incoming = vehicle.link, exits = incoming.to.links.filter(l => l.to !== incoming.from);
    if (!exits.length) return null;
    const junction = network.junctionByNode.get(incoming.to.id);
    if (junction?.roundabout) {
      const onRing = junction.ringRoadIds.has(incoming.roadId);
      const ringExits = exits.filter(link => junction.ringRoadIds.has(link.roadId));
      if (!onRing && ringExits.length) {
        // At a roundabout, left is the counter-clockwise tangent. This is
        // geometric rather than dependent on how the author drew the ring.
        const ringPoints = network.nodes.filter(node => node.roads.has([...junction.ringRoadIds][0]));
        const cx = ringPoints.reduce((sum, node) => sum + node.x, 0) / ringPoints.length;
        const cz = ringPoints.reduce((sum, node) => sum + node.z, 0) / ringPoints.length;
        return ringExits.map(link => ({ link, turn: (incoming.to.x - cx) * link.dz - (incoming.to.z - cz) * link.dx }))
          .sort((a, b) => b.turn - a.turn || a.link.id - b.link.id)[0].link;
      }
      if (onRing) {
        const continueRing = ringExits.map(link => ({ link, dot: incoming.dx * link.dx + incoming.dz * link.dz }))
          .sort((a, b) => b.dot - a.dot || a.link.id - b.link.id)[0];
        const branchExits = exits.filter(link => !junction.ringRoadIds.has(link.roadId));
        // Let a circulating car relieve an underused valid branch before
        // continuing around a busy ring.  This keeps spokes alive without
        // weakening the merge/following checks below.
        const underused = branchExits.filter(link => canEnter(vehicle, link)
          && link.vehicles.length < (continueRing?.link.vehicles.length || 0))
          .sort((a, b) => a.vehicles.length - b.vehicles.length || a.id - b.id);
        if (underused.length) return underused[0];
        // Otherwise preserve the familiar mostly-circulating behaviour.
        if (!branchExits.length || rng() < .78) return continueRing?.link || null;
        return branchExits[Math.floor(rng() * branchExits.length)];
      }
    }
    // A plain crossing is signalised: carry straight on, never turn across
    // traffic. T-junctions and roundabouts keep the normal choice below.
    if (junction?.kind === 'cross') {
      const straight = straightExit(incoming);
      if (straight && exits.includes(straight)) return straight;
    }
    const scored = exits.map(link => ({ link, dot: incoming.dx * link.dx + incoming.dz * link.dz }));
    scored.sort((a, b) => b.dot - a.dot || a.link.id - b.link.id);
    // Straight ahead is normal; legal turns make the city feel connected.
    const straight = scored[0];
    return rng() < .72 ? straight.link : scored[Math.min(scored.length - 1, 1 + Math.floor(rng() * Math.max(1, scored.length - 1)))].link;
  };
  const spacing = (a, b) => (a.length + b.length) / 2 + 3;
  const vehicleWidth = v => Math.max(.5, v.width || 2.05);
  const routeTransition = (v, link = v.link) => v.route && v.route.links[v.routeStep] === link
    ? v.route.transitions[v.routeStep] : null;
  function poseAt(v, link = v.link, dist = v.dist) {
    if (v.transition && link === v.link) return pathPoint(v.transition, dist);
    return seamlessLanePoint(link, dist, routeTransition(v, link));
  }
  function bodyAt(v, link = v.link, dist = v.dist) {
    const p = poseAt(v, link, dist);
    return { x: p.x, z: p.z, dx: p.dx, dz: p.dz, length: v.length, width: vehicleWidth(v) };
  }
  // Separating-axis test for the actual top-down rendered envelopes. A small
  // margin prevents anti-aliased models visibly kissing at a junction.
  function bodiesOverlap(a, b, margin = .12) {
    const axes = [[a.dx, a.dz], [-a.dz, a.dx], [b.dx, b.dz], [-b.dz, b.dx]];
    const rx = b.x - a.x, rz = b.z - a.z;
    for (const [ax, az] of axes) {
      const projection = Math.abs(rx * ax + rz * az);
      const ra = Math.abs(a.dx * ax + a.dz * az) * a.length / 2 + Math.abs(-a.dz * ax + a.dx * az) * a.width / 2;
      const rb = Math.abs(b.dx * ax + b.dz * az) * b.length / 2 + Math.abs(-b.dz * ax + b.dx * az) * b.width / 2;
      if (projection >= ra + rb + margin) return false;
    }
    return true;
  }
  function junctionBodyClear(v, link, dist) {
    const body = bodyAt(v, link, dist);
    return !network.junctions.some(junction => {
      // Once a normal junction has admitted this vehicle, its reservation is
      // an atomic crossing: a following car may legitimately wait near the
      // mouth, but must not make the owner yield halfway through its turn
      // connector.  This exemption is deliberately limited to the owned
      // junction.  Body overlap still applies above, and every other
      // junction remains clearance-checked as usual.
      if (v.reservation?.junction === junction && junction.owner === v) return false;
      const reach = junction.clearance + body.length / 2 + body.width / 2;
      if (Math.hypot(body.x - junction.node.x, body.z - junction.node.z) >= reach) return false;
      return vehicles.some(other => other !== v && !other.done && (() => {
        const otherBody = bodyAt(other);
        return Math.hypot(otherBody.x - junction.node.x, otherBody.z - junction.node.z) < junction.clearance + otherBody.length / 2 + otherBody.width / 2;
      })());
    });
  }
  function releaseReservation(v) {
    const reservation = v.reservation;
    if (reservation?.junction.owner === v) reservation.junction.owner = null;
    if (reservation?.junction) reservation.junction.queue = reservation.junction.queue.filter(item => item !== v);
    v.reservation = null;
  }
  function leaveQueue(v, junction) {
    if (junction) junction.queue = junction.queue.filter(item => item !== v);
  }
  function canOccupyBody(v, link, dist = 0) {
    const body = bodyAt(v, link, dist);
    if (vehicles.some(other => other !== v && !other.done && bodiesOverlap(body, bodyAt(other)))) return false;
    return junctionBodyClear(v, link, dist);
  }
  function canEnter(v, link, dist = 0) {
    if (link.vehicles.some(other => other !== v && Math.abs(other.dist - dist) < spacing(v, other))) return false;
    return canOccupyBody(v, link, dist);
  }
  function exitHasRoom(v, link) {
    if (!link) return false;
    // The complete vehicle must fit beyond the junction before it is allowed
    // to claim the crossing. This is deliberately stricter than checking only
    // the vehicle nose at link distance zero.
    const clearDistance = v.length / 2 + STOP_BUFFER;
    const nearest = link.vehicles
      .filter(other => other !== v)
      .reduce((best, other) => Math.min(best, other.dist), Infinity);
    return nearest >= clearDistance + spacing(v, { length: nearest === Infinity ? 0 : (link.vehicles.find(o => o !== v && o.dist === nearest)?.length || 0) });
  }
  function safeAdvanceOnLink(v, advance) {
    if (!advance || canOccupyBody(v, v.link, v.dist + advance)) return advance;
    // A vehicle may approach a junction while another arrives from a crossing
    // arm in this same simulation frame. Find the last body-safe point instead
    // of allowing either one to visually enter the other.
    let lo = 0, hi = advance;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      if (canOccupyBody(v, v.link, v.dist + mid)) lo = mid; else hi = mid;
    }
    return lo;
  }
  function canTraverse(v, next, travel = 0) {
    // Test the old endpoint, junction contact and final swept position. This
    // catches a long bus clipping a cross-link during a single frame.
    const samples = [[v.link, v.dist], [next, 0], [next, travel]];
    return samples.every(([link, dist]) => {
      const body = bodyAt(v, link, dist);
      return !vehicles.some(other => other !== v && !other.done && bodiesOverlap(body, bodyAt(other))) && junctionBodyClear(v, link, dist);
    }) && canEnter(v, next, travel);
  }
  function canMergeIntoRing(v, link, junction, travel = 0) {
    if (!canTraverse(v, link, travel)) return false;
    // A vehicle on either side of the contact occupies the same circulating
    // lane. Measure its distance from the merge point so car/bus lengths, not
    // a fixed junction lock, determine the usable gap.
    return !network.links.some(ringLink => junction.ringRoadIds.has(ringLink.roadId) &&
      (ringLink.from === junction.node || ringLink.to === junction.node) && ringLink.vehicles.some(other => {
        if (other === v) return false;
        const fromContact = ringLink.from === junction.node ? other.dist : ringLink.length - other.dist;
        // The entering car may still travel part of this frame after crossing
        // the contact, so reserve that distance as well as its body length.
        return fromContact - (ringLink.from === junction.node ? travel : 0) < spacing(v, other);
      }));
  }
  function addVehicle({ length = 5, width = 2.05, speed = 8, kind = 'car', link = null, dist = 0, route = null, routeStep = 0 } = {}) {
    const chosen = link || route?.links[routeStep] || network.links[Math.floor(rng() * network.links.length)];
    if (!chosen || !canEnter({ length }, chosen, dist)) return null;
    const startDist = Math.min(dist, chosen.length);
    const startPose = seamlessLanePoint(chosen, startDist, route?.transitions[routeStep]);
    const v = { id: vehicles.length, kind, length, width, speed, currentSpeed: speed, link: chosen, dist: startDist, route, routeStep, reservation: null,
      x: startPose.x, z: startPose.z, vx: chosen.dx, vz: chosen.dz,
      // Previous fixed-step pose, for render-side interpolation. Without it a
      // stepped sim would visibly advance at the display refresh rate.
      px: startPose.x, pz: startPose.z, pdx: chosen.dx, pdz: chosen.dz, done: false };
    chosen.vehicles.push(v); vehicles.push(v); return v;
  }
  function enterJoin(v, next, turn, remaining, advance) {
    const old = v.link;
    const at = old.vehicles.indexOf(v);
    if (at >= 0) old.vehicles.splice(at, 1);
    v.link = turn.seamless ? next : turn;
    v.link.vehicles.push(v);
    v.transition = turn.seamless ? null : turn;
    if (v.route) {
      if (turn.seamless) v.routeStep = (v.routeStep + 1) % v.route.links.length;
      else v.pendingRouteStep = (v.routeStep + 1) % v.route.links.length;
    }
    v.dist = 0;
    return advance - remaining;
  }
  function spawnCandidates(length = 5) {
    const roads = new Map();
    for (const link of network.links) {
      // Every physical road is eligible.  canEnter remains the authority on
      // whether this particular directed lane has a legal opening gap.
      const item = roads.get(link.roadId) || { roadId: link.roadId, links: [], occupied: 0 };
      item.links.push(link); roads.set(link.roadId, item);
    }
    for (const v of vehicles) {
      const item = roads.get(v.link.roadId);
      if (item) item.occupied++;
    }
    return [...roads.values()]
      .sort((a, b) => a.occupied - b.occupied || a.roadId - b.roadId)
      .flatMap(road => road.links.sort((a, b) => a.id - b.id)
        .map(link => ({ link, dist: Math.min(Math.max(4, link.length - 4), 4), length })));
  }
  function updateStep(step) {
    // A layout rebuild or short terminating link must never leave a junction
    // owned by a vehicle that has already gone away.
    for (const junction of network.junctions) {
      junction.queue = junction.queue.filter(v => vehicles.includes(v) && !v.done);
      if (junction.owner && (!vehicles.includes(junction.owner) || junction.owner.done)) junction.owner = null;
    }
    for (const link of network.links) link.vehicles.sort((a, b) => b.dist - a.dist);
    for (const v of vehicles) {
      // Keep an endpoint vehicle visible for one render frame before removing
      // it. This prevents the old "vanish just before the road end" effect.
      if (v.done) { v.expired = true; continue; }
      // Snapshot the pose before this slice so the renderer can interpolate
      // between two fixed steps instead of snapping at the display rate.
      v.px = v.x; v.pz = v.z; v.pdx = v.vx; v.pdz = v.vz;
      // Links are sorted far-to-near for rendering/update order; choose the
      // nearest vehicle ahead, not the first (farthest) item in that order.
      const leader = v.link.vehicles.reduce((nearest, other) =>
        other !== v && other.dist > v.dist && (!nearest || other.dist < nearest.dist) ? other : nearest, null);
      const isTransition = !!v.transition;
      if (!Number.isFinite(v.currentSpeed)) v.currentSpeed = 0;
      const approachJunction = !isTransition && v.link.to && network.junctionByNode.has(v.link.to.id);
      if (approachJunction && v.nextLink === undefined) v.nextLink = chooseNext(v);
      const exitBlocked = approachJunction && v.nextLink && !exitHasRoom(v, v.nextLink);
      const desiredSpeed = exitBlocked ? Math.sqrt(Math.max(0, 2 * STOP_DECELERATION * Math.max(0, v.link.length - v.dist - STOP_BUFFER))) : v.speed;
      const acceleration = exitBlocked ? STOP_DECELERATION : 6;
      v.currentSpeed += Math.max(-STOP_DECELERATION, Math.min(acceleration, desiredSpeed - v.currentSpeed)) * step;
      let advance = v.currentSpeed * step;
      if (leader) advance = Math.min(advance, Math.max(0, leader.dist - v.dist - spacing(v, leader)));
      advance = safeAdvanceOnLink(v, advance);
      const remaining = v.link.length - v.dist;
      let reservationAdvance = v.reservation ? advance : 0;
      if (advance >= remaining - 1e-6) {
        if (isTransition) {
          const next = v.transition.to;
          v.link.vehicles.splice(v.link.vehicles.indexOf(v), 1);
          v.link = next;
          next.vehicles.push(v);
          v.dist = 0;
          v.transition = null;
          if (v.pendingRouteStep != null) { v.routeStep = v.pendingRouteStep; v.pendingRouteStep = null; }
          advance -= remaining;
        } else {
        const junction = network.junctionByNode.get(v.link.to.id);
        if (v.nextLink === undefined) v.nextLink = chooseNext(v);
        const next = v.nextLink;
        if (!next) {
          leaveQueue(v, junction); releaseReservation(v);
          advance = remaining; v.dist = v.link.length; v.done = true;
        } else if (junction?.roundabout) {
          const enteringRing = !junction.ringRoadIds.has(v.link.roadId) && junction.ringRoadIds.has(next.roadId);
          const travel = Math.max(0, advance - remaining);
          const clear = enteringRing ? canMergeIntoRing(v, next, junction, travel) : canTraverse(v, next, travel);
          if (!clear) advance = Math.min(advance, Math.max(0, remaining - STOP_BUFFER - v.length / 2));
          else {
            // A roundabout contact is still a real piece of travelled space.
            // Directly swapping lane links here made a car jump a few metres
            // (and look as though it had vanished/reappeared) on every lap.
            const turn = v.route ? v.route.transitions[v.routeStep] : makeTurnPath(v.link, next);
            advance = enterJoin(v, next, turn, remaining, advance); v.nextLink = undefined;
          }
        } else if (junction && !junction.queue.includes(v) && junction.owner !== v) {
          junction.queue.push(v);
          advance = Math.min(advance, Math.max(0, remaining - STOP_BUFFER - v.length / 2));
        } else if (junction && (junction.owner && junction.owner !== v || junction.queue[0] !== v)) {
          advance = Math.min(advance, Math.max(0, remaining - STOP_BUFFER - v.length / 2));
        } else if (!canTraverse(v, next, Math.max(0, advance - remaining))) advance = Math.min(advance, Math.max(0, remaining - STOP_BUFFER - v.length / 2));
        else {
          if (junction) {
            junction.queue.shift(); junction.owner = v;
            v.reservation = { junction, remaining: junction.clearance + v.length / 2 };
          }
          const turn = v.route ? v.route.transitions[v.routeStep] : makeTurnPath(v.link, next);
          advance = enterJoin(v, next, turn, remaining, advance);
          reservationAdvance = v.reservation ? advance : reservationAdvance;
          v.nextLink = undefined;
        }
        }
      }
      if (!v.done) {
        const target = v.transition ? v.link.length : v.link.length;
        v.dist = Math.min(target, v.dist + advance);
      }
      v.currentSpeed = step ? advance / step : 0;
      if (v.reservation) {
        v.reservation.remaining -= reservationAdvance;
        if (v.reservation.remaining <= 0) releaseReservation(v);
      }
      const pose = poseAt(v);
      v.x = pose.x; v.z = pose.z; v.vx = pose.dx; v.vz = pose.dz;
    }
    for (let i = vehicles.length - 1; i >= 0; i--) if (vehicles[i].expired) { const v = vehicles[i]; releaseReservation(v); leaveQueue(v, network.junctionByNode.get(v.link.to.id)); const at = v.link.vehicles.indexOf(v); if (at >= 0) v.link.vehicles.splice(at, 1); vehicles.splice(i, 1); }
  }
  // Fixed simulation slices make connector traversal independent of display
  // frame rate. A slow frame runs several safe slices rather than moving a car
  // far enough to skip a stop line or an internal junction lane.
  let accumulator = 0;
  // Leftover fraction of a fixed step, in [0,1). Exposed so the renderer can
  // place cars between the last two simulated poses (fixed-step interpolation)
  // rather than snapping them forward at the display refresh rate.
  const alpha = () => accumulator / .05;
  function update(dt) {
    accumulator = Math.min(.5, accumulator + Math.max(0, Number.isFinite(dt) ? dt : 0));
    while (accumulator >= .05) { updateStep(.05); accumulator -= .05; }
  }
  return { network, routePlan, vehicles, addVehicle, spawnCandidates, update, alpha,
    vehiclesOverlap: (a, b) => bodiesOverlap(bodyAt(a), bodyAt(b)) };
}
