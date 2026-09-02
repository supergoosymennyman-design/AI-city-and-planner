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
    for (const m of keys) {
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
  return Math.max(0, 1 - imbalance / Math.max(1, H));
}

/**
 * Compute all planning metrics for a layout.
 * Returns { score, accessibility, coverage, utilities, balance, spread,
 *           zoning, green, goals, problems, goalHints, goalProblems }.
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
export function computeMetrics(layout, params = METRIC_PARAMS, weights = null, walk = null) {
  const tagged = [];            // {goal|null, text}
  const problem = (goal, text) => tagged.push({ goal, text });
  const segs = roadSegments(layout);
  const buildings = layout.buildings || [];
  const parks = layout.parks || [];

  const d2r = (x, y) => distToRoads(x, y, segs);

  if (!buildings.length) {
    return {
      score: 0, accessibility: 0, coverage: 0, utilities: 0, balance: 1,
      spread: 0, zoning: 0, green: 0,
      goals: { happy: 0, walkable: 0, peaceful: 0, spread: 0 },
      problems: ['Place some buildings to see your city score!'],
      goalHints: {}, goalProblems: {},
    };
  }

  // Accessibility — % of buildings within road range
  let accessible = 0;
  for (const b of buildings) {
    if (d2r(b.pos[0], b.pos[1]) <= params.accessibleDist) accessible++;
  }
  const accessibility = accessible / buildings.length;
  if (accessibility < 0.8) {
    problem('walkable', `${buildings.length - accessible} building(s) are far from any road — add roads near them.`);
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
    problem('happy', 'A city needs homes — place some 🏠 Housing so people can live there!');
  }
  const coverage = housing.length ? serviceSum / housing.length : (buildings.length ? 0 : 1);
  const green = housing.length ? greenSum / housing.length : (buildings.length ? 0 : 1);
  if (housing.length && coverage < 0.8) {
    const lines = [];
    for (const t of params.serviceTypes) {
      const n = missingByService[t] || 0;
      if (n > 0) lines.push(`${n} home${n > 1 ? 's' : ''} ${n > 1 ? 'have' : 'has'} no ${catalogType(t)?.name || t} nearby`);
    }
    if (lines.length) problem('happy', lines.join('; ') + '.');
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
    if (lines.length) problem('happy', lines.join('; ') + '.');
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
    problem('spread', 'Some mission buildings are clustered together — spread them out across the city.');
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
    problem('peaceful', `${Math.round(conflicts)} home(s) are next to noisy facilities (traffic/delivery/recycling) or right beside the power grid.`);
  }

  const balance = balanceScore(layout, params);

  // Homes-share problem: too many facilities per home looks like a town with
  // no residents. Only surfaces at the extreme (civic > homes * 3) so a
  // well-served small town isn't nagged.
  if (housing.length) {
    const civicTypes = Object.keys(ratioTargets(1));
    const civicCount = civicTypes.reduce((n, t) => n + buildings.filter((b) => b.type === t).length, 0);
    if (civicCount > housing.length * 3) {
      problem('spread', `Only ${housing.length} home${housing.length === 1 ? '' : 's'} for ${civicCount} facilities — a real town needs more homes. Add some 🏠 Housing!`);
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
      problem('spread', `You have ${typeCounts[t]} ${name}s — that's a lot of one building. A real city spreads different buildings around.`);
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

  return { score, accessibility, coverage, utilities, balance, spread, zoning, green, goals, problems, goalHints, goalProblems };
}
