// Canonical, renderer-free road topology used by planner guidance, walking and
// traffic diagnostics. Geometry changes remain opt-in: analysis never mutates
// the student's roads; `repairRoadTopology` returns a preview/result for a
// caller-controlled Tidy/Connect confirmation.
import { detectJunctions, junctionNodes, materializeJunctions, roadBands, rectRoadClearance, footprintOf, TIDY_DEFAULTS } from './road-geometry.js';
import { buildTrafficNetwork, planTrafficLoops } from './traffic-network.js';

function nodeComponents(network) {
  const seen = new Set(), components = [];
  for (const start of network.nodes) {
    if (seen.has(start)) continue;
    const nodes = [], stack = [start]; seen.add(start);
    while (stack.length) {
      const node = stack.pop(); nodes.push(node);
      for (const link of node.links) if (!seen.has(link.to)) { seen.add(link.to); stack.push(link.to); }
    }
    components.push({ id: components.length, nodes, roadIds: [...new Set(nodes.flatMap((n) => [...n.roads]))] });
  }
  return components;
}
function connectorCrossesProtected(a, b, protectedFootprints, width) {
  const band = roadBands([{ width, points: [[a.x, a.z], [b.x, b.z]] }]);
  return (protectedFootprints || []).some((item) => {
    const pos = item.pos || item.position;
    return pos && rectRoadClearance(pos[0], pos[1], footprintOf(item), band) < 0;
  });
}

function suggestedCircuitConnector(network, components, opts) {
  const maxDistance = opts.maxRepairDistance ?? 90;
  const endpoints = network.nodes.filter((n) => n.links.length === 1);
  const componentByNode = new Map(components.flatMap((c) => c.nodes.map((n) => [n, c.id])));
  let best = null;
  for (let i = 0; i < endpoints.length; i++) for (let j = i + 1; j < endpoints.length; j++) {
    const a = endpoints[i], b = endpoints[j];
    // Joining two leaves of the SAME tree creates a real circuit. Joining two
    // districts only creates a larger tree, so it is not advertised as a car fix.
    if (componentByNode.get(a) !== componentByNode.get(b)) continue;
    const distance = Math.hypot(a.x - b.x, a.z - b.z);
    if (!(distance > .08 && distance <= maxDistance)) continue;
    const width = Math.min(...[...a.links, ...b.links].map((l) => l.width || 9));
    if (connectorCrossesProtected(a, b, opts.protectedFootprints, width)) continue;
    if (!best || distance < best.distance) best = {
      kind: 'circuit-connector', from: [a.x, a.z], to: [b.x, b.z], width, distance,
      reversible: true,
    };
  }
  return best;
}

/** Read-only canonical topology diagnostics for one road layout. */
export function analyzeRoadTopology(layoutOrRoads, opts = {}) {
  const roads = Array.isArray(layoutOrRoads) ? layoutOrRoads : layoutOrRoads?.roads || [];
  const network = buildTrafficNetwork(roads);
  const routePlan = planTrafficLoops(network, opts.traffic);
  const components = nodeComponents(network);
  const loose = detectJunctions(layoutOrRoads, {
    endpointDist: opts.touchTolerance ?? TIDY_DEFAULTS.connectDist,
    tJunctionDist: opts.touchTolerance ?? TIDY_DEFAULTS.tJunctionDist,
  }).candidates;
  const connector = routePlan.routes.length ? null : suggestedCircuitConnector(network, components, opts);
  const readiness = routePlan.routes.length ? 'cars-ready' : connector ? 'connect-this-gap' : roads.length ? 'draw-a-loop' : 'draw-roads';
  return {
    roads, network, junctions: junctionNodes(roads), components,
    trafficCircuits: [...routePlan.routes], routePlan, looseJoins: loose,
    suggestedConnectors: connector ? [connector] : [], readiness,
    operationCount: network.segments.length ** 2 + network.links.length,
  };
}

/** Return a bounded, reversible topology repair result; never mutates input. */
export function repairRoadTopology(layoutOrRoads, opts = {}) {
  const before = Array.isArray(layoutOrRoads) ? { roads: layoutOrRoads } : layoutOrRoads;
  const repaired = materializeJunctions(layoutOrRoads, {
    closeLoops: opts.closeLoops !== false,
    endpointDist: opts.touchTolerance,
    tJunctionDist: opts.touchTolerance,
    protectedFootprints: opts.protectedFootprints,
    maxRoadPoints: opts.maxRoadPoints,
  });
  const afterLayout = { ...(before || {}), roads: repaired.roads };
  return {
    ...repaired,
    before: analyzeRoadTopology(layoutOrRoads, opts),
    after: analyzeRoadTopology(afterLayout, opts),
    snapshot: JSON.parse(JSON.stringify((before && before.roads) || [])),
    reversible: true,
  };
}
