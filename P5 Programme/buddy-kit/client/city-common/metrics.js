/**
 * city-common/metrics.mjs — live city-planning metrics (client-side, offline).
 *
 * Common-sense city-planning rules, each scored 0..1 and folded into a single
 * 0-100 "City Score". The rules are deliberately NOT shown as individual bars
 * in the UI — the student gets one score + plain-language hints — so the
 * scoring stays a discovery, not a checklist.
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

/** Per-housing ratio targets (what a city of H homes should have). */
export function ratioTargets(H) {
  return {
    school: Math.max(1, Math.ceil(H / 10)),
    hospital: Math.max(1, Math.ceil(H / 15)),
    shop: Math.max(1, Math.ceil(H / 8)),
    office: Math.max(1, Math.ceil(H / 6)),
    library: Math.max(1, Math.ceil(H / 12)),
    fire: Math.max(1, Math.ceil(H / 12)),
    police: Math.max(1, Math.ceil(H / 12)),
    stadium: Math.max(1, Math.ceil(H / 20)),
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
  // Also penalize gross domination: a single generic type being the majority
  // of all buildings (e.g. 30 offices, 3 homes) is clearly wrong.
  let maxGeneric = 0;
  for (const t of generic) {
    const have = buildings.filter((b) => b.type === t).length;
    if (have > maxGeneric) maxGeneric = have;
  }
  const total = buildings.length;
  if (maxGeneric > total * 0.5 && total > 4) over += maxGeneric - total * 0.5;

  const imbalance = over;
  return Math.max(0, 1 - imbalance / Math.max(1, H));
}

/**
 * Compute all planning metrics for a layout.
 * Returns { score, accessibility, coverage, utilities, balance, spread,
 *           zoning, green, problems }.
 * score ∈ [0,100]; each component ∈ [0,1].
 */
export function computeMetrics(layout, params = METRIC_PARAMS) {
  const problems = [];
  const segs = roadSegments(layout);
  const buildings = layout.buildings || [];
  const parks = layout.parks || [];

  const d2r = (x, y) => distToRoads(x, y, segs);

  if (!buildings.length) {
    return {
      score: 0, accessibility: 0, coverage: 0, utilities: 0, balance: 1,
      spread: 0, zoning: 0, green: 0,
      problems: ['Place some buildings to see your city score!'],
    };
  }

  // Accessibility — % of buildings within road range
  let accessible = 0;
  for (const b of buildings) {
    if (d2r(b.pos[0], b.pos[1]) <= params.accessibleDist) accessible++;
  }
  const accessibility = accessible / buildings.length;
  if (accessibility < 0.8) {
    problems.push(`${buildings.length - accessible} building(s) are far from any road — add roads near them.`);
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
    problems.push('A city needs homes — place some 🏠 Housing so people can live there!');
  }
  const coverage = housing.length ? serviceSum / housing.length : (buildings.length ? 0 : 1);
  const green = housing.length ? greenSum / housing.length : (buildings.length ? 0 : 1);
  if (housing.length && coverage < 0.8) {
    const lines = [];
    for (const t of params.serviceTypes) {
      const n = missingByService[t] || 0;
      if (n > 0) lines.push(`${n} home${n > 1 ? 's' : ''} ${n > 1 ? 'have' : 'has'} no ${catalogType(t)?.name || t} nearby`);
    }
    if (lines.length) problems.push(lines.join('; ') + '.');
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
    const lines = [];
    for (const t of params.utilityTypes) {
      const n = missingUtil[t] || 0;
      if (n > 0) lines.push(`${n} home${n > 1 ? 's' : ''} ${n > 1 ? 'are' : 'is'} far from the ${catalogType(t)?.name || t}`);
    }
    if (lines.length) problems.push(lines.join('; ') + '.');
  }

  // Spread — how spread out the special buildings are (anti-clustering)
  const specials = buildings.filter((b) => catalogType(b.type)?.category === 'special');
  let clusterPairs = 0;
  for (let i = 0; i < specials.length; i++) {
    for (let j = i + 1; j < specials.length; j++) {
      if (dist(specials[i].pos, specials[j].pos) < params.clusterDist) clusterPairs++;
    }
  }
  const spread = specials.length > 1 ? Math.max(0, 1 - clusterPairs / Math.max(1, specials.length)) : 1;
  if (specials.length > 1 && spread < 0.6) {
    problems.push('Some mission buildings are clustered together — spread them out across the city.');
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
    problems.push(`${Math.round(conflicts)} home(s) are next to noisy facilities (traffic/delivery/recycling) or right beside the power grid.`);
  }

  const balance = balanceScore(layout, params);

  const score = Math.round(100 * (
    0.30 * accessibility +
    0.25 * coverage +
    0.10 * utilities +
    0.15 * zoning +
    0.10 * spread +
    0.10 * balance
  ));

  return { score, accessibility, coverage, utilities, balance, spread, zoning, green, problems };
}
