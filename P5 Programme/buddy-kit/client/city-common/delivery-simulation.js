export const DELIVERY_RECORD_VERSION = 1;
export const DELIVERY_BATTERY_CAPACITY = 70;
export const DELIVERY_MAX_PAYLOAD_KG = 2;
export const DELIVERY_CHARGE_SECONDS = 20;
export const DELIVERY_SPEED_MPS = 5;

export const DELIVERY_GRAPH = Object.freeze({
  nodes: Object.freeze({
    depot: Object.freeze({ x: 0, z: 0, kind: 'depot' }),
    ridge: Object.freeze({ x: 30, z: 0, kind: 'waypoint' }),
    charger: Object.freeze({ x: 0, z: 35, kind: 'charger' }),
    harbour: Object.freeze({ x: 65, z: 0, kind: 'customer' }),
    park: Object.freeze({ x: 30, z: 45, kind: 'customer' }),
  }),
  edges: Object.freeze([
    Object.freeze({ from: 'depot', to: 'ridge', distance: 30 }),
    Object.freeze({ from: 'ridge', to: 'harbour', distance: 35, noFly: true }),
    Object.freeze({ from: 'depot', to: 'charger', distance: 35 }),
    Object.freeze({ from: 'charger', to: 'harbour', distance: 45 }),
    Object.freeze({ from: 'ridge', to: 'park', distance: 45 }),
    Object.freeze({ from: 'charger', to: 'park', distance: 30 }),
    Object.freeze({ from: 'depot', to: 'park', distance: 55, noFly: true }),
  ]),
});

const VALID_TARGETS = new Set(['harbour', 'park']);
const VALID_STRATEGIES = new Set(['shortest', 'battery-aware']);

export function energyForEdge(distance, payloadKg) {
  return Math.ceil(Number(distance) * (1 + Math.max(0, Number(payloadKg) - 1) * 0.35));
}

export function normalizeDeliverySettings(value = {}) {
  const payloadKg = Number(value.payloadKg);
  const initialBattery = Math.round(Number(value.initialBattery));
  return {
    target: VALID_TARGETS.has(value.target) ? value.target : 'harbour',
    strategy: VALID_STRATEGIES.has(value.strategy) ? value.strategy : 'battery-aware',
    payloadKg: Number.isFinite(payloadKg) ? Math.max(0, Math.min(3, payloadKg)) : 1,
    initialBattery: Number.isFinite(initialBattery) ? Math.max(0, Math.min(DELIVERY_BATTERY_CAPACITY, initialBattery)) : DELIVERY_BATTERY_CAPACITY,
    respectNoFly: value.respectNoFly !== false,
    allowCharging: value.allowCharging !== false,
  };
}

function neighbours(graph, node, respectNoFly) {
  const out = [];
  for (const edge of graph.edges || []) {
    if (respectNoFly && edge.noFly) continue;
    if (edge.from === node) out.push({ node: edge.to, edge });
    else if (edge.to === node) out.push({ node: edge.from, edge });
  }
  return out.sort((a, b) => a.node.localeCompare(b.node));
}

function edgeBetween(graph, a, b) {
  return (graph.edges || []).find(e => (e.from === a && e.to === b) || (e.from === b && e.to === a)) || null;
}

function reconstruct(previous, key) {
  const route = [];
  while (key) {
    const [node] = key.split('|');
    route.push(node);
    key = previous.get(key) || null;
  }
  return route.reverse();
}

function shortestRoute(settings, graph) {
  const dist = new Map([['depot', 0]]), previous = new Map(), done = new Set();
  for (;;) {
    let current = null, best = Infinity;
    for (const [node, d] of dist) if (!done.has(node) && d < best) { current = node; best = d; }
    if (!current) return null;
    if (current === settings.target) {
      const route = [];
      for (let n = current; n; n = previous.get(n) || null) route.push(n);
      return route.reverse();
    }
    done.add(current);
    for (const next of neighbours(graph, current, settings.respectNoFly)) {
      const candidate = best + next.edge.distance;
      if (candidate < (dist.get(next.node) ?? Infinity)) { dist.set(next.node, candidate); previous.set(next.node, current); }
    }
  }
}

function feasibleRoute(settings, graph) {
  const startKey = `depot|${settings.initialBattery}`;
  const dist = new Map([[startKey, 0]]), previous = new Map(), done = new Set();
  for (;;) {
    let currentKey = null, best = Infinity;
    for (const [key, d] of dist) if (!done.has(key) && d < best) { currentKey = key; best = d; }
    if (!currentKey) return null;
    const [node, batteryRaw] = currentKey.split('|'), battery = Number(batteryRaw);
    if (node === settings.target) return reconstruct(previous, currentKey);
    done.add(currentKey);
    for (const next of neighbours(graph, node, settings.respectNoFly)) {
      const energy = energyForEdge(next.edge.distance, settings.payloadKg);
      if (energy > battery) continue;
      let remaining = battery - energy;
      if (next.node === 'charger' && settings.allowCharging) remaining = DELIVERY_BATTERY_CAPACITY;
      const nextKey = `${next.node}|${remaining}`;
      const candidate = best + next.edge.distance;
      if (candidate < (dist.get(nextKey) ?? Infinity)) { dist.set(nextKey, candidate); previous.set(nextKey, currentKey); }
    }
  }
}

export function planDelivery(rawSettings, graph = DELIVERY_GRAPH) {
  const settings = normalizeDeliverySettings(rawSettings);
  if (settings.payloadKg <= 0 || settings.payloadKg > DELIVERY_MAX_PAYLOAD_KG) {
    return { ok: false, reason: 'payload-policy', settings, route: [] };
  }
  const route = settings.strategy === 'battery-aware' ? feasibleRoute(settings, graph) : shortestRoute(settings, graph);
  if (!route) return { ok: false, reason: 'no-feasible-route', settings, route: [] };
  return { ok: true, reason: null, settings, route };
}

export function startDelivery(rawSettings, graph = DELIVERY_GRAPH) {
  const plan = planDelivery(rawSettings, graph);
  return {
    version: DELIVERY_RECORD_VERSION,
    settings: plan.settings,
    route: plan.route,
    routeIndex: 0,
    currentNode: 'depot',
    battery: plan.settings.initialBattery,
    distance: 0,
    energyUsed: 0,
    elapsedSeconds: 0,
    chargeStops: 0,
    deliveries: 0,
    status: plan.ok ? 'ready' : 'infeasible',
    reason: plan.reason,
    stranded: null,
  };
}

export function advanceDelivery(input, graph = DELIVERY_GRAPH) {
  const state = sanitizeDeliveryState(input);
  if (!state || !['ready', 'paused'].includes(state.status)) return state || startDelivery({});
  const from = state.route[state.routeIndex], to = state.route[state.routeIndex + 1];
  if (!from || !to) return { ...state, status: state.currentNode === state.settings.target ? 'delivered' : 'infeasible', reason: 'route-ended' };
  const edge = edgeBetween(graph, from, to);
  if (!edge || (state.settings.respectNoFly && edge.noFly)) return { ...state, status: 'infeasible', reason: 'route-changed' };
  const energy = energyForEdge(edge.distance, state.settings.payloadKg);
  if (energy > state.battery) {
    const fraction = energy ? state.battery / energy : 0;
    return {
      ...state,
      battery: 0,
      distance: state.distance + edge.distance * fraction,
      energyUsed: state.energyUsed + state.battery,
      elapsedSeconds: state.elapsedSeconds + (edge.distance * fraction) / DELIVERY_SPEED_MPS,
      status: 'stranded',
      reason: 'battery-empty',
      stranded: { from, to, fraction },
    };
  }
  let battery = state.battery - energy, chargeStops = state.chargeStops;
  if (to === 'charger' && state.settings.allowCharging) { battery = DELIVERY_BATTERY_CAPACITY; chargeStops++; }
  const delivered = to === state.settings.target;
  return {
    ...state,
    routeIndex: state.routeIndex + 1,
    currentNode: to,
    battery,
    distance: state.distance + edge.distance,
    energyUsed: state.energyUsed + energy,
    elapsedSeconds: state.elapsedSeconds + edge.distance / DELIVERY_SPEED_MPS + (to === 'charger' && state.settings.allowCharging ? DELIVERY_CHARGE_SECONDS : 0),
    chargeStops,
    deliveries: delivered ? 1 : state.deliveries,
    status: delivered ? 'delivered' : 'paused',
    reason: null,
    stranded: null,
  };
}

export function replayDelivery(settings, graph = DELIVERY_GRAPH) {
  let state = startDelivery(settings, graph), guard = 0;
  while (['ready', 'paused'].includes(state.status) && guard++ < 20) state = advanceDelivery(state, graph);
  return state;
}

export function deliveryPosition(state, graph = DELIVERY_GRAPH) {
  if (!state) return graph.nodes.depot;
  if (state.stranded) {
    const a = graph.nodes[state.stranded.from], b = graph.nodes[state.stranded.to], t = state.stranded.fraction;
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
  }
  return graph.nodes[state.currentNode] || graph.nodes.depot;
}

export function sanitizeDeliveryState(value) {
  if (!value || typeof value !== 'object' || value.version !== DELIVERY_RECORD_VERSION) return null;
  const settings = normalizeDeliverySettings(value.settings);
  const clean = startDelivery(settings);
  if (!Array.isArray(value.route) || value.route.length > 8 || value.route.some(n => !Object.hasOwn(DELIVERY_GRAPH.nodes, n))) return clean;
  const statuses = new Set(['ready', 'paused', 'delivered', 'stranded', 'infeasible']);
  return {
    ...clean,
    route: value.route.slice(),
    routeIndex: Math.max(0, Math.min(value.route.length - 1, Math.round(Number(value.routeIndex) || 0))),
    currentNode: Object.hasOwn(DELIVERY_GRAPH.nodes, value.currentNode) ? value.currentNode : 'depot',
    battery: Math.max(0, Math.min(DELIVERY_BATTERY_CAPACITY, Number(value.battery) || 0)),
    distance: Math.max(0, Number(value.distance) || 0),
    energyUsed: Math.max(0, Number(value.energyUsed) || 0),
    elapsedSeconds: Math.max(0, Number(value.elapsedSeconds) || 0),
    chargeStops: Math.max(0, Math.min(4, Math.round(Number(value.chargeStops) || 0))),
    deliveries: value.deliveries === 1 ? 1 : 0,
    status: statuses.has(value.status) ? value.status : clean.status,
    reason: typeof value.reason === 'string' ? value.reason.slice(0, 40) : null,
    stranded: value.stranded && Object.hasOwn(DELIVERY_GRAPH.nodes, value.stranded.from) && Object.hasOwn(DELIVERY_GRAPH.nodes, value.stranded.to)
      ? { from: value.stranded.from, to: value.stranded.to, fraction: Math.max(0, Math.min(1, Number(value.stranded.fraction) || 0)) }
      : null,
  };
}

/** Add bounded demo state inside the existing props section, preserving props and unknown fields. */
export function withDeliveryRecord(envelope, state) {
  const safeState = sanitizeDeliveryState(state);
  if (!safeState) return null;
  const base = Array.isArray(envelope)
    ? { version: 1, props: envelope }
    : (envelope && typeof envelope === 'object' ? envelope : { version: 1, props: [] });
  const demonstrations = base.demonstrations && typeof base.demonstrations === 'object' && !Array.isArray(base.demonstrations)
    ? base.demonstrations : {};
  return { ...base, demonstrations: { ...demonstrations, deliveryV1: safeState } };
}

export function deliveryRecordFromEnvelope(envelope) {
  if (!envelope || Array.isArray(envelope) || typeof envelope !== 'object') return null;
  return sanitizeDeliveryState(envelope.demonstrations?.deliveryV1);
}
