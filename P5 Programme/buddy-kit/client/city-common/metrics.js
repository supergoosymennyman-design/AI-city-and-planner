/**
 * city-common/metrics.js — live city-planning metrics (client-side, offline).
 *
 * Common-sense city-planning rules, each scored 0..1 and folded into a single
 * 0-100 "City Score". The sub-scores also roll up into four kid-named GOALS so
 * the student can see *what* makes a good city and choose what to prioritise:
 *
 *   happy    — homes have school/shop/hospital/fire/police + water/power/bus + parks
 *   walkable — buildings are near roads, and people can actually walk to needs
 *   peaceful — noisy places (traffic/delivery/recycling/power) kept away from homes
 *   spread   — mission buildings not clustered; a sensible building mix
 *
 * Weights: `computeMetrics(layout, params, weights, walk)` accepts an optional
 * `weights` object over the four goal keys (or over the six metric keys
 * directly). When weights are given, the score is the weighted blend of the
 * sub-metrics (normalised to 0-100) so the student's priorities change BOTH
 * the displayed score AND the optimizer's objective. When weights are omitted
 * the original fixed blend is used (backwards compatible).
 *
 * Rules (a home is "served" by each of these within range):
 *   services  — school, shop, hospital, fire station, police station
 *   utilities — water, power, bus stop  (district-scale range)
 *   green     — a park (half-weight bonus; a park never substitutes for a
 *               required service)
 * Plus: accessibility (near roads), zoning (noisy away from homes; power has a
 * mild setback), spread (mission buildings not clustered), balance (building
 * mix matches sensible ratios).
 */

import { catalogType } from './catalog.js';
import { resolveRoadSafePlacement, roadHalfWidth, orientedFootprint, roadBands } from './road-geometry.js';

export const METRIC_PARAMS = {
  accessibleDist: 60,     // a building is "accessible" if within 60m of a road
  coverageDist: 150,      // a home is "served" if within 150m of a required service
  utilityDist: 400,       // a home is served by water/power/bus within 400m
  clusterDist: 120,       // two specials closer than this = clustered
  zoningDist: 100,        // noisy building within this of housing = zoning conflict
  powerSetbackDist: 50,   // power has a mild hum — don't sit right next to a home
  noisyTypes: ['traffic_lab', 'traffic_emergency', 'delivery', 'recycling'],
  serviceTypes: ['school', 'shop', 'hospital', 'fire', 'police'],
  utilityTypes: ['water', 'power', 'bus'],
};

// ── Goal model ──────────────────────────────────────────────────────────
// The four kid-named goals. Each goal maps onto one or more of the raw
// sub-metrics; the GOAL_METRIC_SPLIT says how a goal's weight is distributed
// over its metrics when the student picks a mayor or moves a slider.

export const GOAL_KEYS = ['happy', 'walkable', 'peaceful', 'spread'];

/** How a goal weight is split across the raw sub-metrics (shares sum to 1). */
export const GOAL_METRIC_SPLIT = {
  happy: { coverage: 0.5, utilities: 0.3, green: 0.2 },
  walkable: { accessibility: 0.7, walkability: 0.3 },
  peaceful: { zoning: 1 },
  spread: { spread: 0.5, balance: 0.5 },
};

/**
 * Normalise a weights object into metric-level weights that sum to 1.
 * Accepts either goal keys ({happy, walkable, peaceful, spread}) or the raw
 * metric keys ({accessibility, coverage, utilities, zoning, spread, balance,
 * green, walkability}). Returns null when weights are absent/empty — callers
 * then fall back to the fixed default blend.
 */
export function normalizeWeights(weights) {
  if (!weights || typeof weights !== 'object') return null;
  const keys = Object.keys(weights);
  if (!keys.length) return null;
  // 'spread' is BOTH a goal key and a metric key, so detect metric-level
  // objects by the presence of any metric-only key. Goal-level objects (from
  // mayors/sliders) use only the four goal keys.
  const METRIC_ONLY_KEYS = ['accessibility', 'coverage', 'utilities', 'zoning', 'balance', 'green', 'walkability'];
  const hasGoal = !keys.some((k) => METRIC_ONLY_KEYS.includes(k)) && keys.some((k) => GOAL_KEYS.includes(k));
  const out = {};
  if (hasGoal) {
    for (const g of GOAL_KEYS) {
      const wg = Number(weights[g]);
      if (!Number.isFinite(wg) || wg <= 0) continue;
      const split = GOAL_METRIC_SPLIT[g];
      for (const m of Object.keys(split)) out[m] = (out[m] || 0) + wg * split[m];
    }
  } else {
    for (const m of METRIC_KEYS) {
      const w = Number(weights[m]);
      if (Number.isFinite(w) && w > 0) out[m] = (out[m] || 0) + w;
    }
  }
  let sum = 0;
  for (const m of Object.keys(out)) sum += out[m];
  if (!(sum > 0) || !Number.isFinite(sum)) return null;
  for (const m of Object.keys(out)) out[m] /= sum;
  return out;
}

/** Shared receipt order. Zero-weight metrics remain visible as evidence. */
export const METRIC_DESCRIPTORS = [
  { key: 'accessibility', emoji: '🛣️' }, { key: 'coverage', emoji: '🏘️' },
  { key: 'utilities', emoji: '💧' }, { key: 'zoning', emoji: '🤫' },
  { key: 'spread', emoji: '🧩' }, { key: 'balance', emoji: '⚖️' },
  { key: 'green', emoji: '🌳' }, { key: 'walkability', emoji: '🚶' },
];
export const METRIC_KEYS = METRIC_DESCRIPTORS.map(({ key }) => key);

export function metricReceipt(metrics, weights = null) {
  const mw = normalizeWeights(weights) || defaultMetricWeights();
  return {
    basis: 'original-plan', version: 1, score: metrics.score,
    metrics: METRIC_KEYS.map((key) => ({
      key, raw: metrics[key] * 100, weight: (mw[key] || 0) * 100,
      points: metrics[key] * (mw[key] || 0) * 100,
    })),
  };
}

/** Default metric-level weights (the fixed blend, normalised to sum to 1). */
export function defaultMetricWeights() {
  return { accessibility: 0.30, coverage: 0.25, utilities: 0.10, zoning: 0.15, spread: 0.10, balance: 0.10 };
}

/** Star rating (0..5 whole stars) from a 0..1 score. */
export function stars(score01) {
  const s = Number(score01);
  if (!Number.isFinite(s)) return 0;
  return Math.max(0, Math.min(5, Math.round(s * 5)));
}

/** Total road centreline length (metres) — the student's own drawn design. */
export function roadLengthOf(layout) {
  let total = 0;
  for (const r of (layout && layout.roads) || []) {
    const pts = (r && r.points) || [];
    for (let i = 0; i < pts.length - 1; i++) {
      total += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    }
  }
  return total;
}

/** How much road a town needs per home — sets the scale of the fill. */
export const METRES_OF_ROAD_PER_HOME = 180;
/** Hard ceiling on how large a town the optimiser will fill. */
export const MAX_CAPACITY_HOMES = 40;

const FRONTAGE_STEP = 60;
// A frontage sample is only a geometric opportunity, not permission to pack a
// house into every 60 m slot: civic buildings, gardens and access gaps share
// the same edge. Twenty viable samples per target home produces a bounded
// hamlet→district band for the authored templates (roughly 14–25 homes).
// A frontage sample is deliberately conservative (it excludes junction mouths,
// parks and any road-clearance collision). Seven such samples per home keeps
// small hand-drawn hamlets modest while allowing a complete 11–18 km starter
// network to reach the planner's 40-home ceiling.
const FRONTAGE_SLOTS_PER_HOME = 6;
const FRONTAGE_CACHE = new Map();
const FRONTAGE_CACHE_LIMIT = 96;

function pointInPark(x, z, parks, radius = 16) {
  return (parks || []).some((p) => Math.hypot(x - p.cx, z - p.cz) < (p.radius || 0) + radius);
}

function pointInObject(x, z, object, margin = 0) {
  const polygon = orientedFootprint(object.pos, object.footprint || catalogType(object.type)?.footprint || [20, 20], object.rotation ?? object.yaw ?? 0);
  // Convex polygon point test; a small centre-distance margin covers the slot's
  // nominal home half-width without coupling metrics to renderer geometry.
  let sign = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const cross = (b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]);
    if (Math.abs(cross) < 1e-9) continue;
    if (sign && Math.sign(cross) !== sign) return false;
    sign = Math.sign(cross);
  }
  if (sign) return true;
  return Math.hypot(x - object.pos[0], z - object.pos[1]) <= margin;
}

/**
 * Deterministic usable roadside frontage samples. Both sides are sampled, but
 * nearby/parallel roads share a quantised slot so capacity cannot be inflated
 * by drawing the same street repeatedly. Junction mouths, parks, bounds and
 * parks and bounds are excluded. Buildings are checked by the placement
 * evaluator, not capacity sampling, so adding a utility cannot move a district.
 */
export function buildableFrontage(layout, opts = {}) {
  const slots = [], used = new Set(), roads = layout?.roads || [];
  const scale = layout?.scaleMeters || 2000;
  const step = opts.step || FRONTAGE_STEP;
  // District capacity belongs to the road/park plan and must not drift as the
  // optimiser adds utility buildings (three utilities are also mission types
  // in the legacy catalog). Real placement still checks every building later.
  const protectedObjects = [];
  const signature = JSON.stringify([step, scale, roads, layout?.parks || []]);
  const cached = FRONTAGE_CACHE.get(signature);
  if (cached) return cached;
  const bands = roadBands(roads);
  const nodeDegree = new Map();
  for (const road of roads) for (const p of road.points || []) {
    const key = `${Math.round(p[0] * 2) / 2},${Math.round(p[1] * 2) / 2}`;
    nodeDegree.set(key, (nodeDegree.get(key) || 0) + 1);
  }
  const junctionPoints = [...nodeDegree].filter(([, degree]) => degree >= 2).map(([key]) => key.split(',').map(Number));
  let sampled = 0;
  for (const road of roads) for (let i = 1; i < (road.points || []).length; i++) {
    const a = road.points[i - 1], b = road.points[i];
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
    if (!(len > 1)) continue;
    const count = Math.max(1, Math.floor(len / step));
    const half = roadHalfWidth(road), offset = half + 3 + 10;
    for (let k = 0; k < count; k++) for (const side of [-1, 1]) {
      sampled++;
      const along = (k + .5) / count;
      const cx = a[0] + dx * along, cz = a[1] + dz * along;
      // Leave the complete mouth around topology-derived junctions.
      const nearJunction = junctionPoints.some(([x, z]) => Math.hypot(cx - x, cz - z) < half + 12);
      if (nearJunction) continue;
      const x = cx - dz / len * offset * side, z = cz + dx / len * offset * side;
      const dedupe = `${Math.round(x / 30)},${Math.round(z / 30)}`;
      if (used.has(dedupe) || pointInPark(x, z, layout.parks, 12)) continue;
      if (protectedObjects.some((o) => pointInObject(x, z, o, 12))) continue;
      const safe = resolveRoadSafePlacement({ position: [x, z], footprint: [20, 20], roads: layout, bands,
        bounds: [0, 0, scale, scale], obstacles: protectedObjects, search: false });
      if (!safe.ok) continue;
      used.add(dedupe); slots.push({ position: safe.position, roadClass: road.class || 'residential', roadWidth: road.width || 0 });
    }
  }
  const result = { slots, sampled, viableSlots: slots.length, metres: slots.length * step / 2 };
  FRONTAGE_CACHE.set(signature, result);
  if (FRONTAGE_CACHE.size > FRONTAGE_CACHE_LIMIT) FRONTAGE_CACHE.delete(FRONTAGE_CACHE.keys().next().value);
  return result;
}

/**
 * Homes the STUDENT'S road network can support. This is the heart of tailoring
 * the optimiser to the child's design: a big drawn network supports a big town,
 * a short lane supports a hamlet, and no roads support nothing. Length is
 * measured from the actual polylines, so scaleMeters and drawing effort both
 * count.
 */
export function townCapacity(layout) {
  if (!roadLengthOf(layout)) return 0;
  const slots = buildableFrontage(layout).viableSlots;
  if (!slots) return 0;
  return Math.max(1, Math.min(MAX_CAPACITY_HOMES, Math.round(slots / FRONTAGE_SLOTS_PER_HOME)));
}

/**
 * Extra building kinds a town of this size should show. Gated by the student's
 * own capacity so a one-street hamlet is never asked for a stadium, while a
 * district-sized network earns the full mix. The 5 required services are scored
 * separately by `coverage`; these are the kinds nothing else ever adds.
 */
export const MIX_KINDS = [
  { type: 'office', minHomes: 4 },
  { type: 'library', minHomes: 8 },
  { type: 'stadium', minHomes: 20 },
];

export function mixTargetKinds(layout) {
  const homes = (layout.buildings || []).filter((b) => b.type === 'housing').length;
  const scale = Math.max(townCapacity(layout), homes);
  return MIX_KINDS.filter((k) => scale >= k.minHomes).map((k) => k.type);
}

/** Fraction of the design-appropriate mix kinds the city already has (0..1). */
export function mixScore(layout) {
  const kinds = mixTargetKinds(layout);
  if (!kinds.length) return 1;
  const present = kinds.filter((t) => (layout.buildings || []).some((b) => b.type === t));
  return present.length / kinds.length;
}

/** Per-housing ratio targets (what a city of H homes should have). */
export function ratioTargets(H) {
  return {
    school: Math.max(1, Math.ceil(H / 12)),
    hospital: Math.max(1, Math.ceil(H / 20)),
    shop: Math.max(1, Math.ceil(H / 8)),
    office: H >= 4 ? Math.ceil(H / 10) : 0,
    library: H >= 8 ? Math.ceil(H / 15) : 0,
    fire: Math.max(1, Math.ceil(H / 20)),
    police: Math.max(1, Math.ceil(H / 20)),
    stadium: H >= 20 ? Math.ceil(H / 20) : 0,
  };
}

const ORDINARY_DISTRIBUTION_TYPES = new Set([
  'school', 'shop', 'hospital', 'fire', 'police', 'office', 'library',
  'stadium', 'water', 'power', 'bus',
]);

function nearestDistrictIndex(pos, anchors) {
  let best = 0, bestDistance = Infinity;
  for (let i = 0; i < anchors.length; i++) {
    const d = dist(pos, anchors[i]);
    if (d < bestDistance - 1e-9) { best = i; bestDistance = d; }
  }
  return best;
}

function allocateByShare(total, counts) {
  if (!counts.length || total <= 0) return counts.map(() => 0);
  const sum = counts.reduce((a, b) => a + b, 0) || counts.length;
  const allocation = counts.map(() => total >= counts.length ? 1 : 0);
  let left = total - allocation.reduce((a, b) => a + b, 0);
  const exact = counts.map((count, i) => Math.max(0, total * count / sum - allocation[i]));
  while (left-- > 0) {
    let pick = 0;
    for (let i = 1; i < counts.length; i++) {
      const gain = exact[i] - Math.floor(exact[i]);
      const bestGain = exact[pick] - Math.floor(exact[pick]);
      if (Math.floor(exact[i]) > 0 && Math.floor(exact[pick]) <= 0) pick = i;
      else if ((Math.floor(exact[i]) > 0) === (Math.floor(exact[pick]) > 0)
        && (gain > bestGain + 1e-9 || (Math.abs(gain - bestGain) <= 1e-9 && counts[i] > counts[pick]))) pick = i;
    }
    allocation[pick]++;
    exact[pick] = Math.max(0, exact[pick] - 1);
  }
  return allocation;
}

/**
 * Split usable road frontage into at most four deterministic districts.
 * Anchors use farthest-point sampling; every diagnostic is plain JSON so it can
 * be displayed, saved in a review receipt, and asserted without renderer code.
 */
export function frontageDistricts(layout, targetHomes = townCapacity(layout)) {
  const frontage = buildableFrontage(layout);
  const points = frontage.slots.map((slot) => slot.position.slice())
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (!points.length || !targetHomes) return [];
  const wanted = Math.min(4, Math.ceil(targetHomes / 10), points.length);
  let anchors = [points[0]];
  const minSeparation = Math.max(120, (layout?.scaleMeters || 2000) * 0.10);
  while (anchors.length < wanted) {
    let pick = null, pickDistance = -1;
    for (const point of points) {
      const nearest = Math.min(...anchors.map((anchor) => dist(point, anchor)));
      if (nearest > pickDistance + 1e-9) { pick = point; pickDistance = nearest; }
    }
    if (!pick || pickDistance < minSeparation) break;
    anchors.push(pick);
  }
  // Farthest-point sampling chooses stable, separated seeds. Recenter those
  // seeds onto the medoid of their frontage cells so a district represents the
  // usable neighbourhood itself, not an extreme map-edge sample.
  for (let iteration = 0; iteration < 4; iteration++) {
    const cells = anchors.map(() => []);
    for (const point of points) cells[nearestDistrictIndex(point, anchors)].push(point);
    anchors = cells.map((cell, i) => {
      if (!cell.length) return anchors[i];
      const cx = cell.reduce((sum, point) => sum + point[0], 0) / cell.length;
      const cz = cell.reduce((sum, point) => sum + point[1], 0) / cell.length;
      return cell.slice().sort((a, b) =>
        Math.hypot(a[0] - cx, a[1] - cz) - Math.hypot(b[0] - cx, b[1] - cz)
        || a[0] - b[0] || a[1] - b[1])[0];
    });
  }
  const groups = anchors.map(() => []);
  for (const point of points) groups[nearestDistrictIndex(point, anchors)].push(point);
  const allocations = allocateByShare(targetHomes, groups.map((group) => group.length));
  const actualHomes = anchors.map(() => 0);
  const actualOrdinary = anchors.map(() => 0);
  for (const building of layout?.buildings || []) {
    const district = nearestDistrictIndex(building.pos, anchors);
    if (building.type === 'housing') actualHomes[district]++;
    else if (ORDINARY_DISTRIBUTION_TYPES.has(building.type)) actualOrdinary[district]++;
  }
  const ordinaryTotal = actualOrdinary.reduce((a, b) => a + b, 0);
  const ordinaryTargets = allocateByShare(ordinaryTotal, groups.map((group) => group.length));
  const homes = (layout?.buildings || []).filter((b) => b.type === 'housing');
  return anchors.map((anchor, i) => {
    const group = groups[i];
    const districtHomes = homes.filter((home) => nearestDistrictIndex(home.pos, anchors) === i);
    const deficits = {};
    for (const type of METRIC_PARAMS.serviceTypes) deficits[type] = districtHomes.filter((home) =>
      !(layout.buildings || []).some((b) => b.type === type && dist(home.pos, b.pos) <= METRIC_PARAMS.coverageDist)).length;
    for (const type of METRIC_PARAMS.utilityTypes) deficits[type] = districtHomes.filter((home) =>
      !(layout.buildings || []).some((b) => b.type === type && dist(home.pos, b.pos) <= METRIC_PARAMS.utilityDist)).length;
    deficits.green = districtHomes.filter((home) => !(layout.parks || []).some((p) =>
      dist(home.pos, [p.cx, p.cz]) <= METRIC_PARAMS.coverageDist)).length;
    const xs = group.map((p) => p[0]), zs = group.map((p) => p[1]);
    return {
      id: `district-${i + 1}`,
      anchor: anchor.slice(),
      bounds: { minX: Math.min(...xs), minZ: Math.min(...zs), maxX: Math.max(...xs), maxZ: Math.max(...zs) },
      frontageSlots: group.length,
      frontageShare: group.length / points.length,
      targetHomes: allocations[i],
      actualHomes: actualHomes[i],
      targetOrdinary: ordinaryTargets[i],
      actualOrdinary: actualOrdinary[i],
      distributionScore: allocations[i]
        ? Math.max(0, 1 - Math.abs(actualHomes[i] - allocations[i]) / allocations[i])
        : 1,
      localCoverageDeficits: deficits,
    };
  });
}

export function districtDistributionScore(layout) {
  const districts = frontageDistricts(layout);
  if (!districts.length) return 1;
  const targetHomes = districts.reduce((n, d) => n + d.targetHomes, 0);
  const actualHomes = districts.reduce((n, d) => n + d.actualHomes, 0);
  const ordinary = districts.reduce((n, d) => n + d.actualOrdinary, 0);
  const homeError = districts.reduce((n, d) => n + Math.abs(d.actualHomes - d.targetHomes * actualHomes / Math.max(1, targetHomes)), 0);
  const ordinaryError = districts.reduce((n, d) => n + Math.abs(d.actualOrdinary - ordinary * d.frontageShare), 0);
  const homeScore = actualHomes ? Math.max(0, 1 - homeError / (2 * actualHomes)) : 0;
  const ordinaryScore = ordinary ? Math.max(0, 1 - ordinaryError / (2 * ordinary)) : homeScore;
  return 0.75 * homeScore + 0.25 * ordinaryScore;
}

/** Full optimizer composition contract, with target/actual/unresolved fields. */
export function compositionTargets(layout) {
  const homes = townCapacity(layout);
  const actual = {};
  for (const b of layout?.buildings || []) actual[b.type] = (actual[b.type] || 0) + 1;
  const ordinary = homes ? ratioTargets(homes) : {};
  const service = Object.fromEntries(METRIC_PARAMS.serviceTypes.map((type) => [type, ordinary[type] || 0]));
  // Utilities are district-scale and must cover geography, not merely exist.
  // One of each serves a small neighbourhood; larger frontage earns another
  // catchment approximately every twelve homes.
  const districts = frontageDistricts(layout, homes);
  const utilityCount = homes ? Math.max(1, districts.length) : 0;
  const utilities = Object.fromEntries(METRIC_PARAMS.utilityTypes.map((type) => [type, utilityCount]));
  const targets = {
    housing: homes,
    ...service,
    ...utilities,
    office: ordinary.office || 0,
    library: ordinary.library || 0,
    stadium: ordinary.stadium || 0,
    parks: homes ? Math.max(1, Math.ceil(homes / 10)) : 0,
  };
  const actualVector = { ...actual, parks: (layout?.parks || []).length };
  const unresolved = Object.fromEntries(Object.entries(targets)
    .map(([type, target]) => [type, Math.max(0, target - (actualVector[type] || 0))])
    .filter(([, missing]) => missing > 0));
  return {
    capacityHomes: homes,
    frontage: buildableFrontage(layout),
    targets,
    actual: actualVector,
    unresolved,
    districts,
    distributionScore: districtDistributionScore(layout),
  };
}

/** Euclidean distance between two [x,y] points. */
export function dist(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/** Distance from point (px, pz) to segment a→b. */
export function distToSegment(px, pz, a, b) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz;
  if (l2 === 0) return Math.hypot(px - a[0], pz - a[1]);
  let t = ((px - a[0]) * dx + (pz - a[1]) * dz) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a[0] + t * dx), pz - (a[1] + t * dz));
}

/** Flatten layout roads into an array of segments (plan coords). */
export function roadSegments(layout) {
  const segs = [];
  for (const r of layout.roads || []) {
    const pts = r.points || [];
    for (let i = 0; i < pts.length - 1; i++) segs.push([pts[i], pts[i + 1]]);
  }
  return segs;
}

/** Distance from a point to the nearest road segment (Infinity if no roads). */
export function distToRoads(x, y, segs) {
  if (!segs.length) return Infinity;
  let best = Infinity;
  for (const s of segs) {
    const d = distToSegment(x, y, s[0], s[1]);
    if (d < best) best = d;
  }
  return best;
}

/** Which of the required service types a home is within range of. */
export function servicesNear(layout, home, params = METRIC_PARAMS) {
  const buildings = layout.buildings || [];
  const near = [];
  for (const t of params.serviceTypes) {
    if (buildings.some((b) => b.type === t && dist(home.pos, b.pos) <= params.coverageDist)) {
      near.push(t);
    }
  }
  return near;
}

/** Which of the utility types a home is within range of. */
export function utilitiesNear(layout, home, params = METRIC_PARAMS) {
  const buildings = layout.buildings || [];
  const near = [];
  for (const t of params.utilityTypes) {
    if (buildings.some((b) => b.type === t && dist(home.pos, b.pos) <= params.utilityDist)) {
      near.push(t);
    }
  }
  return near;
}

/** Gross balance: how far the generic mix is from ratio targets (1 = balanced).
 * Only GROSS imbalance is penalized — a small town isn't marked down for being
 * small (no forced library/stadium/office for 2 homes), but 8 fire stations or
 * 30 offices next to 3 homes IS clearly wrong. Under-supply of a *required*
 * service is already handled by the services metric, so here we focus on the
 * over-supply / domination side. */
function balanceScore(layout, params = METRIC_PARAMS) {
  const buildings = layout.buildings || [];
  const housing = buildings.filter((b) => b.type === 'housing');
  const H = housing.length;
  if (!H) return 1;
  const targets = ratioTargets(H);
  const generic = Object.keys(targets);
  let over = 0;
  for (const t of generic) {
    const have = buildings.filter((b) => b.type === t).length;
    const want = targets[t];
    // Only penalize clear over-supply (more than 2x the sensible target).
    if (have > want * 2) over += have - want * 2;
  }
  // Also penalize gross domination: a single building type being the majority
  // of all buildings (e.g. 30 offices next to 3 homes, or 12 Traffic Labs in a
  // 14-building city) is clearly wrong. Includes MISSION buildings (specials) —
  // a city isn't "balanced" because its ten identical labs all happen to be
  // specials the optimizer is forbidden to remove.
  const maxType = {};
  for (const b of buildings) maxType[b.type] = (maxType[b.type] || 0) + 1;
  let maxTypeCount = 0;
  for (const t of Object.keys(maxType)) {
    if (maxType[t] > maxTypeCount) maxTypeCount = maxType[t];
  }
  const total = buildings.length;
  if (maxTypeCount > total * 0.5 && total > 4) over += maxTypeCount - total * 0.5;

  // Homes-share: a town shouldn't be all facilities and ONE home. If the civic
  // facilities outnumber homes by more than 3:1, penalize the surplus — a real
  // town needs residents, not just buildings. (The 3:1 threshold deliberately
  // leaves the well-served small town of 2 homes + 6 facilities alone.)
  const civic = Object.keys(targets);
  const civicCount = civic.reduce((n, t) => n + buildings.filter((b) => b.type === t).length, 0);
  if (civicCount > H * 3) over += (civicCount - H * 3) * 0.5;

  const imbalance = over;
  const supply = Math.max(0, 1 - imbalance / Math.max(1, H));
  // Completeness of the mix the student's OWN road network can support. Kept a
  // minority share (25%) so gross over-supply / domination still dominates the
  // signal — this only nudges a well-served but too-sparse town to grow into a
  // full one, and it never asks a tiny town for kinds its roads can't support.
  return 0.75 * supply + 0.25 * mixScore(layout);
}

/**
 * Compute all planning metrics for a layout.
 * Returns { score, accessibility, coverage, utilities, balance, spread,
 *           zoning, green, walkability, goals, problems, goalHints, goalProblems,
 *           missingServices }.
 * score ∈ [0,100]; each component/goal ∈ [0,1].
 *
 * `weights` — optional goal-level or metric-level weights (see normalizeWeights).
 * When given, `score` is the weighted blend; when omitted, the fixed default
 * blend is used.
 *
 * `walk` — optional precomputed walkability result {reach} from
 * walkability.js. When given, the walkable goal and the weighted score use the
 * real walk-reach value (instead of falling back to accessibility).
 */
export function computeMetrics(layout, params = METRIC_PARAMS, weights = null, walk = null, lang = 'en') {
  const zh = lang === 'zh-Hant';
  const tagged = [];            // {goal|null, text}
  const problem = (goal, text) => tagged.push({ goal, text });
  const segs = roadSegments(layout);
  const buildings = layout.buildings || [];
  const parks = layout.parks || [];

  // Traditional Chinese names for the small fixed service/utility sets (used in
  // the problem sentences). Broader catalog names stay English inside zh copy —
  // HK bilingual classrooms read "6 座 Traffic Lab" naturally.
  const svcZh = { school: '學校', shop: '商店', hospital: '醫院', fire: '消防局', police: '警局' };
  const utilZh = { water: '自來水', power: '電力', bus: '巴士站' };

  const d2r = (x, y) => distToRoads(x, y, segs);

  if (!buildings.length) {
    return {
      score: 0, accessibility: 0, coverage: 0, utilities: 0, balance: 1,
      spread: 0, zoning: 0, green: 0, walkability: walk ? walk.reach : 0,
      goals: { happy: 0, walkable: 0, peaceful: 0, spread: 0 },
      problems: [zh ? '先放一些建築物，看看你的城市得分吧！' : 'Place some buildings to see your city score!'],
      goalHints: {}, goalProblems: {}, missingServices: {},
    };
  }

  // Accessibility — % of buildings within road range
  let accessible = 0;
  for (const b of buildings) {
    if (d2r(b.pos[0], b.pos[1]) <= params.accessibleDist) accessible++;
  }
  const accessibility = accessible / buildings.length;
  if (accessibility < 0.8) {
    problem('walkable', zh
      ? `${buildings.length - accessible} 座建築物離道路太遠 — 在它們附近加些道路吧。`
      : `${buildings.length - accessible} buildings are far from any road — add roads near them.`);
  }

  // Services coverage — a home needs school, shop, hospital, fire, police.
  const housing = buildings.filter((b) => b.type === 'housing');
  const parkCenters = parks.map((p) => [p.cx, p.cz]);
  let serviceSum = 0;
  let greenSum = 0;
  const missingByService = {};
  for (const t of params.serviceTypes) missingByService[t] = 0;
  for (const h of housing) {
    const near = servicesNear(layout, h, params);
    serviceSum += near.length / params.serviceTypes.length;
    for (const t of params.serviceTypes) {
      if (!near.includes(t)) missingByService[t]++;
    }
    const nearPark = parkCenters.some((pc) => dist(h.pos, pc) <= params.coverageDist);
    if (nearPark) greenSum++;
  }
  // A city with buildings but NO homes is incomplete — the home-centric
  // metrics must not default to "perfect". Score them 0 and tell the student
  // to add housing; the optimizer bootstraps with a housing move.
  if (housing.length === 0 && buildings.length > 0) {
    problem('happy', zh
      ? '城市需要住宅 — 放一些 🏠 住宅，讓居民可以入住吧！'
      : 'A city needs homes — place some 🏠 Housing so people can live there!');
  }
  const coverage = housing.length ? serviceSum / housing.length : (buildings.length ? 0 : 1);
  const green = housing.length ? greenSum / housing.length : (buildings.length ? 0 : 1);
  // Structured per-service missing counts (used by the planner's hint chips).
  // Filled whenever homes exist, regardless of the coverage threshold.
  const missingServices = {};
  for (const t of params.serviceTypes) {
    const n = missingByService[t] || 0;
    if (n > 0) missingServices[t] = n;
  }
  if (housing.length && coverage < 0.8) {
    const missing = params.serviceTypes.filter((t) => (missingByService[t] || 0) > 0);
    if (missing.length) {
      const names = zh
        ? missing.map((t) => svcZh[t] || (catalogType(t)?.name || t))
        : missing.map((t) => (catalogType(t)?.name || t).toLowerCase());
      problem('happy', zh
        ? `有些住宅無法到達${names.join('、')} — 補上缺少的設施吧。`
        : `Some homes can't reach a ${names.join(', ')} — add the missing ones.`);
    }
  }

  // Utilities — homes need water, power, bus within district range.
  let utilSum = 0;
  const missingUtil = {};
  for (const t of params.utilityTypes) missingUtil[t] = 0;
  for (const h of housing) {
    const near = utilitiesNear(layout, h, params);
    utilSum += near.length / params.utilityTypes.length;
    for (const t of params.utilityTypes) {
      if (!near.includes(t)) missingUtil[t]++;
    }
  }
  const utilities = housing.length ? utilSum / housing.length : (buildings.length ? 0 : 1);
  if (housing.length && utilities < 0.8) {
    const missing = params.utilityTypes.filter((t) => (missingUtil[t] || 0) > 0);
    if (missing.length) {
      const names = zh
        ? missing.map((t) => utilZh[t] || t)
        : missing.map((t) => ({ water: 'water', power: 'power', bus: 'a bus stop' })[t] || t);
      problem('happy', zh
        ? `有些住宅離${names.join('、')}太遠 — 補上缺少的設施吧。`
        : `Some homes are far from ${names.join(', ')} — add the missing ones.`);
    }
  }

  // Spread — district land-use distribution first; mission landmark
  // anti-clustering remains a smaller, secondary signal.
  const specials = buildings.filter((b) => catalogType(b.type)?.category === 'special');
  let clusterPairs = 0;
  for (let i = 0; i < specials.length; i++) {
    for (let j = i + 1; j < specials.length; j++) {
      if (dist(specials[i].pos, specials[j].pos) < params.clusterDist) clusterPairs++;
    }
  }
  const landmarkSpread = specials.length > 1 ? Math.max(0, 1 - clusterPairs / Math.max(1, specials.length)) : 1;
  const distribution = districtDistributionScore(layout);
  const spread = 0.8 * distribution + 0.2 * landmarkSpread;
  if (specials.length > 1 && spread < 0.6) {
    problem('spread', zh
      ? '有些任務建築聚在一起 — 把它們分散到城市各處吧。'
      : 'Some mission buildings are clustered together — spread them out across the city.');
  }

  // Zoning — noisy buildings near housing; power has a mild setback.
  const noisySet = new Set(params.noisyTypes);
  let conflicts = 0;
  for (const h of housing) {
    for (const b of buildings) {
      if (b === h) continue;
      const d = dist(h.pos, b.pos);
      if (noisySet.has(b.type) && d < params.zoningDist) { conflicts++; break; }
      if (b.type === 'power' && d < params.powerSetbackDist) { conflicts += 0.5; }
    }
  }
  const zoning = housing.length ? Math.max(0, 1 - conflicts / Math.max(1, housing.length)) : (buildings.length ? 0 : 1);
  if (conflicts > 0) {
    problem('peaceful', zh
      ? `${Math.round(conflicts)} 間住宅挨著嘈吵設施（交通/送貨/回收），或就在電力網旁邊。`
      : `${Math.round(conflicts)} home(s) are next to noisy facilities (traffic/delivery/recycling) or right beside the power grid.`);
  }

  const balance = balanceScore(layout, params);

  // Homes-share problem: too many facilities per home looks like a town with
  // no residents. Only surfaces at the extreme (civic > homes * 3) so a
  // well-served small town isn't nagged.
  if (housing.length) {
    const civicTypes = Object.keys(ratioTargets(1));
    const civicCount = civicTypes.reduce((n, t) => n + buildings.filter((b) => b.type === t).length, 0);
    if (civicCount > housing.length * 3) {
      problem('spread', zh
        ? `只有 ${housing.length} 間住宅，卻有 ${civicCount} 座設施 — 真實小鎮需要更多住宅。加些 🏠 住宅吧！`
        : `Only ${housing.length} home${housing.length === 1 ? '' : 's'} for ${civicCount} facilities — a real town needs more homes. Add some 🏠 Housing!`);
    }
  }

  // Over-supply of ONE type (mission or generic): 10+ Traffic Labs in a small
  // city is clearly wrong, and the optimizer can't delete the child's mission
  // buildings — so say it plainly instead of pretending the city is optimal.
  const typeCounts = {};
  for (const b of buildings) typeCounts[b.type] = (typeCounts[b.type] || 0) + 1;
  for (const t of Object.keys(typeCounts)) {
    if (typeCounts[t] >= 6 && typeCounts[t] > buildings.length * 0.5) {
      const name = catalogType(t)?.name || t;
      problem('spread', zh
        ? `你放了 ${typeCounts[t]} 座 ${name} — 同一種建築太多。真正的城市會把不同建築分散開。`
        : `You have ${typeCounts[t]} ${name}s — that's a lot of one building. A real city spreads different buildings around.`);
    }
  }

  // ── Goals: roll the raw sub-metrics up into the four kid-named goals. ──
  const goals = {
    happy: (coverage + utilities + green) / 3,
    walkable: walk ? (accessibility + walk.reach) / 2 : accessibility,
    peaceful: zoning,
    spread: (spread + balance) / 2,
  };

  // ── Score: weighted blend (when weights given) or the fixed default. ──
  const mw = normalizeWeights(weights);
  let score;
  if (mw) {
    const walkVal = walk ? walk.reach : accessibility;
    score = Math.round(100 * (
      (mw.accessibility || 0) * accessibility +
      (mw.coverage || 0) * coverage +
      (mw.utilities || 0) * utilities +
      (mw.zoning || 0) * zoning +
      (mw.spread || 0) * spread +
      (mw.balance || 0) * balance +
      (mw.green || 0) * green +
      (mw.walkability || 0) * walkVal
    ));
  } else {
    score = Math.round(100 * (
      0.30 * accessibility +
      0.25 * coverage +
      0.10 * utilities +
      0.15 * zoning +
      0.10 * spread +
      0.10 * balance
    ));
  }

  // ── Problems: keep the flat list (backwards compatible) + goal-tagged. ──
  const problems = [];
  const goalProblems = {};
  for (const { goal, text } of tagged) {
    problems.push(text);
    if (goal) (goalProblems[goal] = goalProblems[goal] || []).push(text);
  }
  const goalHints = {};
  for (const g of GOAL_KEYS) {
    const texts = goalProblems[g];
    if (texts && texts.length) goalHints[g] = texts[0];
  }

  return { score, accessibility, coverage, utilities, balance, spread, zoning, green, walkability: walk ? walk.reach : accessibility, goals, problems, goalHints, goalProblems, missingServices };
}
