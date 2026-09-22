/**
 * city-common/optimize.js — the AI city optimizer for the 2D planner.
 *
 * A preservation-first district planner. It repairs concrete safety/access
 * problems, derives 1–4 districts from usable road frontage, and completes a
 * bounded home + coverage sequence in the most under-target district. Scalar
 * score remains evidence, but hard viability deficits outrank a local score
 * dip and are reported explicitly in every surfaced move.
 * The result:
 *
 *   - the student's ROADS are never touched;
 *   - special/mission buildings are never removed or moved;
 *   - the city NEVER gets worse (score is non-decreasing);
 *   - the student's scale is respected — we fill genuine gaps, we don't
 *     force a fixed minimum town size;
 *   - everything is deterministic for a given seed (reproducible, testable).
 *
 * Two search strategies (opts.strategy):
 *   - 'greedy' (default): ONE measured hill-climb. Fast and reviewable, but
 *     stops at the first local optimum it reaches.
 *   - 'explore': MULTI-RESTART — several independent greedy climbs from the
 *     SAME input with different deterministic seeds; the best result wins.
 *     This is the Academy's "restart from a brand-new spot and climb again"
 *     lesson made real: each restart samples candidate moves differently, so
 *     it explores a different path up the hill and can escape local optima.
 *
 * Every accepted move carries a measured `improved` list (which sub-metrics
 * rose) + before/after scores so the UI can explain the WHY in kid terms.
 *
 * Usage:
 *   const { layout, diff, before, after, strategy } = optimizeLayout(layout, opts);
 *   // strategy: 'greedy' | 'explore'
 *   // diff = [{ action:'add'|'move'|'remove'|'add_park', what?, count?,
 *   //           from?, to?, reason, improved:[...], fromScore, toScore }]
 */

import { catalogType } from './catalog.js';
import { computeMetrics, roadSegments, METRIC_PARAMS, ratioTargets, servicesNear, utilitiesNear, townCapacity, compositionTargets, frontageDistricts } from './metrics.js';
import { computeWalkReach } from './walkability.js';
import { roadBands, rectRoadClearance, clearanceOffset, ROAD_CLEARANCE_MARGIN } from './road-geometry.js';

// Heavy-noisy facilities kept away from homes. POWER is NOT in this set — it is
// a required utility (homes need it nearby) with only a mild setback (see
// METRIC_PARAMS.powerSetbackDist), matching real-world practice.
const NOISY = new Set(METRIC_PARAMS.noisyTypes);
const HOUSING = 'housing';
const CIVIC = ['school', 'hospital', 'shop', 'office', 'library', 'fire', 'police', 'stadium'];
const MARGIN = 4;            // meters of clearance between buildings
const MAX_ITERATIONS = 40;   // hard bound on hill-climb passes (runtime safety)
const MAX_CANDIDATES = 160;  // candidate spots per placement search

/**
 * Canonical, order-independent JSON for a layout-ish value. Object keys are
 * sorted; arrays of plain objects (buildings, roads, parks) are sorted by their
 * canonical form so the SAME physical city always stringifies identically no
 * matter what order the child added buildings in. Arrays of primitives/arrays
 * (a road's `points` polyline, a footprint) keep their order because that order
 * IS the shape.
 */
export function canonicalJSON(value) {
  return JSON.stringify(canon(value));
}

function canon(v) {
  if (Array.isArray(v)) {
    const items = v.map(canon);
    // Sort only arrays of plain objects (unordered collections). A polyline
    // (array of [x,z] arrays) or a footprint (array of numbers) is ordered.
    if (v.length && v.every((e) => e && typeof e === 'object' && !Array.isArray(e))) {
      const keys = items.map((it) => JSON.stringify(it));
      const order = items.map((_, i) => i).sort((a, b) => (keys[a] < keys[b] ? -1 : keys[a] > keys[b] ? 1 : a - b));
      return order.map((i) => items[i]);
    }
    return items;
  }
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = canon(v[k]);
    return out;
  }
  return v;
}

/**
 * Stable 32-bit seed derived from arbitrary inputs (a layout, goal weights, …).
 * FNV-1a over a CANONICAL JSON string: the SAME city + goals always produce the
 * SAME seed, so Optimise/Explore are reproducible and directly comparable from
 * one press to the next. (The planner used to seed with
 * `Date.now() ^ Math.random()`, which made every press a fresh lottery and made
 * Greedy-vs-Explore an unstable comparison.) Canonicalisation matters: a plain
 * `JSON.stringify(layout)` changes when buildings are re-ordered even if the
 * city is visually identical.
 *
 * Callers pass the SAME seed to greedy and explore. Explore's first restart
 * reproduces the greedy run exactly — that is what guarantees Explore can never
 * score below Greedy (see exploreLayout). Folding the strategy name into the
 * seed would break that guarantee, so strategy is deliberately NOT an input.
 */
export function stableSeed(...parts) {
  const str = parts
    .map((p) => (typeof p === 'string' ? p : canonicalJSON(p ?? null)))
    .join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) || 1;
}

export function isNoisyType(t) { return NOISY.has(t); }
export function isHousingType(t) { return t === HOUSING; }
const isSpecialType = (t) => (catalogType(t)?.category === 'special');
function isSpecial(b) { return !!b && isSpecialType(b.type); }
function protectedBuilding(b) { return !!b && (b.locked || isSpecial(b)); }

// Multiset containment preserves indistinguishable duplicates as well as all
// saved fields. Utility additions are allowed only as explicit add proposals.
export function preservesExistingWork(before, after) {
  if (JSON.stringify(before.roads) !== JSON.stringify(after.roads)) return false;
  const parks = (after.parks || []).map((p) => canonicalJSON(p));
  for (const park of before.parks || []) {
    const i = parks.indexOf(canonicalJSON(park));
    if (i < 0) return false;
    parks.splice(i, 1);
  }
  const available = (after.buildings || []).map((b) => b);
  const bandsBefore = roadBands(before);
  const bandsAfter = roadBands(after);
  for (const b of (before.buildings || []).filter(protectedBuilding)) {
    let i = available.findIndex((candidate) => canonicalJSON(candidate) === canonicalJSON(b));
    if (i < 0) {
      // Road safety is the one lock exception. Every non-position field must
      // survive byte-for-byte, the original must actually obstruct a road, the
      // result must be clear, and the nudge is bounded.
      const withoutPos = (value) => { const copy = { ...value }; delete copy.pos; return canonicalJSON(copy); };
      i = available.findIndex((candidate) => withoutPos(candidate) === withoutPos(b)
        && rectRoadClearance(b.pos[0], b.pos[1], b.footprint || footprintFor(b.type), bandsBefore) < ROAD_CLEARANCE_MARGIN
        && rectRoadClearance(candidate.pos[0], candidate.pos[1], candidate.footprint || footprintFor(candidate.type), bandsAfter) >= ROAD_CLEARANCE_MARGIN
        && Math.hypot(candidate.pos[0] - b.pos[0], candidate.pos[1] - b.pos[1]) <= 100);
    }
    if (i < 0) return false;
    available.splice(i, 1);
  }
  return true;
}

function footprintFor(type) {
  return (catalogType(type)?.footprint || [20, 20]).slice();
}

function seedRng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rectsOverlap(aPos, aFp, bPos, bFp, margin = MARGIN) {
  return Math.abs(aPos[0] - bPos[0]) < (aFp[0] + bFp[0]) / 2 + margin
    && Math.abs(aPos[1] - bPos[1]) < (aFp[1] + bFp[1]) / 2 + margin;
}

/** Distance from a point to the nearest road segment (Infinity if none). */
function distToRoad(x, z, segs) {
  if (!segs.length) return Infinity;
  let best = Infinity;
  for (const [a, b] of segs) {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const l2 = dx * dx + dz * dz;
    let t = l2 ? ((x - a[0]) * dx + (z - a[1]) * dz) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(x - (a[0] + t * dx), z - (a[1] + t * dz));
    if (d < best) best = d;
    if (best <= 60) break;
  }
  return best;
}

function distToPark(x, z, parks) {
  let best = Infinity;
  for (const p of parks) {
    const d = Math.hypot(x - p.cx, z - p.cz) - (p.radius || 0);
    if (d < best) best = d;
  }
  return best;
}

function distToType(x, z, buildings, predicate) {
  let best = Infinity;
  for (const b of buildings) {
    if (!predicate(b)) continue;
    const d = Math.hypot(x - b.pos[0], z - b.pos[1]);
    if (d < best) best = d;
  }
  return best;
}

function nearestDistrict(pos, districts) {
  let best = 0, distance = Infinity;
  for (let i = 0; i < districts.length; i++) {
    const d = Math.hypot(pos[0] - districts[i].anchor[0], pos[1] - districts[i].anchor[1]);
    if (d < distance - 1e-9) { best = i; distance = d; }
  }
  return best;
}

function viabilityDeficit(layout) {
  const c = compositionTargets(layout);
  let deficit = Object.values(c.unresolved).reduce((n, value) => n + value, 0);
  for (const district of c.districts) {
    deficit += Math.max(0, district.targetHomes - district.actualHomes) * 12;
    if (district.actualHomes > 0) {
      deficit += Object.values(district.localCoverageDeficits).filter((value) => value > 0).length;
    }
  }
  return deficit;
}

/** True if a footprint at (x,z) overlaps any existing building. */
function overlapsAny(layout, x, z, fp, margin = MARGIN) {
  for (const b of layout.buildings || []) {
    const fp2 = b.footprint || footprintFor(b.type);
    if (rectsOverlap([x, z], fp, b.pos, fp2, margin)) return true;
  }
  return false;
}

/**
 * Move every building that is sitting on a road ribbon fully clear
 * of it (sideways, by the smallest amount), without overlapping any other
 * building. This is the "bad road logic" fix: roads are sacred (byte-identical)
 * and road safety is the sole lock/mission exception, so the building receives
 * the smallest possible nudge and remains protected from every later stage.
 *
 * Returns true when anything moved; appends one `kind:'off-road'` diff entry per
 * moved building so the child can see the fix in the plan. A building that
 * cannot be cleared inside the search cap is left where it is and surfaces via
 * the city problems list instead.
 */
function resolveRoadOverlaps(layout, bands, diffOut) {
  if (!bands || !bands.length) return false;
  const scale = layout.scaleMeters || 2000;
  let movedAny = false;
  // Iterate a snapshot of the buildings; each move is checked against the
  // CURRENT layout so two on-road neighbours can't be nudged onto each other.
  const buildings = layout.buildings || [];
  for (const b of buildings.slice()) {
    if (!b) continue;
    const fp = b.footprint || footprintFor(b.type);
    if (rectRoadClearance(b.pos[0], b.pos[1], fp, bands) >= ROAD_CLEARANCE_MARGIN) continue;
    const others = buildings.filter((o) => o !== b);
    const cand = clearanceOffset(b, others, bands, { scale });
    if (!cand) continue;   // no clear spot nearby — leave it, flag it instead
    const from = b.pos.slice();
    b.pos = [Math.round(cand.x * 2) / 2, Math.round(cand.z * 2) / 2];
    const name = catalogType(b.type)?.name || b.type;
    diffOut.push({
      action: 'move', what: b.type, count: 1, from, to: b.pos.slice(),
      kind: 'off-road', improved: [], fromScore: null, toScore: null,
      safetyNudge: protectedBuilding(b),
      reason: `Moved the ${name} the smallest safe distance off the road — buildings belong beside the street, not blocking it.`,
    });
    movedAny = true;
  }
  return movedAny;
}

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pushBuilding(layout, type, pos, height) {
  layout.buildings.push({
    type,
    pos: [Math.round(pos[0] * 2) / 2, Math.round(pos[1] * 2) / 2],
    footprint: footprintFor(type),
    height: height || catalogType(type)?.height || 24,
  });
}

/** Match the exact saved instance shape, including its lock and footprint. */
function findBuildingAt(layout, b) {
  return (layout.buildings || []).find(
    (x) => canonicalJSON(x) === canonicalJSON(b)
  );
}

/** Service types a home is missing (of METRIC_PARAMS.serviceTypes). */
function missingServices(layout, home) {
  const near = servicesNear(layout, home);
  return METRIC_PARAMS.serviceTypes.filter((t) => !near.includes(t));
}

/** Utility types a home is missing (of METRIC_PARAMS.utilityTypes). */
function missingUtilities(layout, home) {
  const near = utilitiesNear(layout, home);
  return METRIC_PARAMS.utilityTypes.filter((t) => !near.includes(t));
}

/**
 * Propose candidate spots for a new building of `type`. Returns an array of
 * [x, z] (bounded), best-scored first. Deterministic for a given rng.
 */
function candidateSpots(layout, type, rng, segs, bands, fpOverride) {
  const SCALE = layout.scaleMeters || 2000;
  const fp = fpOverride || footprintFor(type);
  const noisy = isNoisyType(type);
  const housing = isHousingType(type);
  const civic = CIVIC.includes(type);
  const parks = layout.parks || [];
  const buildings = layout.buildings || [];

  const candidates = [];
  for (let gx = 120; gx < SCALE; gx += 180) for (let gz = 120; gz < SCALE; gz += 180) {
    candidates.push([gx + rng() * 60 - 30, gz + rng() * 60 - 30]);
  }
  for (let i = 0; i < 16; i++) candidates.push([rng() * SCALE, rng() * SCALE]);
  // Dense rings AROUND each home so services/utilities can always find a spot
  // within coverage range of a needy home. The coarse 180m grid alone can miss
  // a home whose nearest non-overlapping grid point is >150m away (coverage
  // radius), leaving homes permanently unserved in spread-out cities.
  if (housing) {
    // Densify around the town that already exists: a new home should appear in
    // the same neighbourhood as existing homes AND the services/utilities built
    // for them, so growth stays walkable instead of sprawling into service
    // deserts that each demand their own school, shop, fire station…
    const anchors = buildings.filter((b) =>
      b.type === HOUSING || METRIC_PARAMS.serviceTypes.includes(b.type) || METRIC_PARAMS.utilityTypes.includes(b.type));
    for (const a of anchors) {
      for (let k = 0; k < 6; k++) {
        const rad = 30 + rng() * 110;
        const ang = rng() * Math.PI * 2;
        const x = a.pos[0] + Math.cos(ang) * rad;
        const z = a.pos[1] + Math.sin(ang) * rad;
        if (x < 10 || z < 10 || x > SCALE - 10 || z > SCALE - 10) continue;  // stay in bounds
        candidates.push([x, z]);
      }
    }
  } else {
    const homes = buildings.filter((b) => b.type === HOUSING);
    for (const h of homes) {
      for (let k = 0; k < 8; k++) {
        const rad = 55 + rng() * 85;          // 55-140m from the home
        const ang = rng() * Math.PI * 2;
        const x = h.pos[0] + Math.cos(ang) * rad;
        const z = h.pos[1] + Math.sin(ang) * rad;
        if (x < 10 || z < 10 || x > SCALE - 10 || z > SCALE - 10) continue;  // stay in bounds
        candidates.push([x, z]);
      }
    }
  }
  shuffle(candidates, rng);

  const scored = [];
  for (const [rawX, rawZ] of candidates) {
    // Snap to the SAME 0.5 m grid that pushBuilding/move use, so a spot that
    // passes the road/overlap checks is exactly the spot that gets placed.
    // (Checking the raw float let rounding nudge a building onto a road.)
    const x = Math.round(rawX * 2) / 2;
    const z = Math.round(rawZ * 2) / 2;
    if (overlapsAny(layout, x, z, fp)) continue;
    // Never place a building on a road: reject any spot whose footprint comes
    // within the clearance margin of a road ribbon. The <=60m accessibility
    // bonus below still rewards sitting right beside a street.
    if (bands && bands.length && rectRoadClearance(x, z, fp, bands) < ROAD_CLEARANCE_MARGIN) continue;
    let score = 0;
    const dRoad = distToRoad(x, z, segs);
    if (dRoad <= 60) score += 1.5; else if (dRoad <= 140) score += 0.6;
    if (housing) {
      const dSvc = Math.min(
        distToType(x, z, buildings, (b) => b.type === 'school' || b.type === 'hospital' || b.type === 'shop'),
        distToPark(x, z, parks)
      );
      if (dSvc <= 150) score += 1.2; else if (dSvc <= 250) score += 0.5;
    }
    if (civic && !noisy) {
      const dHome = distToType(x, z, buildings, (b) => b.type === HOUSING);
      if (dHome <= 120) score += 1.0; else if (dHome <= 220) score += 0.4;
    }
    if (noisy) {
      const dHome = distToType(x, z, buildings, (b) => b.type === HOUSING);
      if (dHome >= 120) score += 1.2; else if (dHome >= 70) score += 0.3;
    }
    const dSame = distToType(x, z, buildings, (b) => b.type === type);
    if (dSame < 120) score -= 1.5; else if (dSame < 200) score -= 0.5;
    if (isSpecialType(type)) {
      const dSpec = distToType(x, z, buildings, (b) => b.type !== type && isSpecialType(b.type));
      if (dSpec < 100) score -= 0.8; else if (dSpec < 180) score -= 0.3;
    }
    scored.push({ x, z, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_CANDIDATES).map((s) => [s.x, s.z]);
}

/** Snapshot of the tracked sub-metrics as a comparable tuple. `green` is
 * included because a park can be the ONLY thing a move improves (it is 20% of
 * the happy goal) — without it an `add_park` move would show an empty
 * `improved` list and the child could not answer the reason question. */
function metricTuple(m) {
  return [m.accessibility, m.coverage, m.utilities, m.spread, m.zoning, m.balance, m.green, m.walkability];
}

function metricDeltas(before, after) {
  // Order MUST match metricTuple().
  const names = ['accessibility', 'coverage', 'utilities', 'spread', 'zoning', 'balance', 'green', 'walkability'];
  const improved = [];
  const tb = metricTuple(before), ta = metricTuple(after);
  for (let i = 0; i < names.length; i++) if (ta[i] > tb[i] + 1e-9) improved.push(names[i]);
  return improved;
}

/**
 * Build an optimised layout via measured hill-climbing.
 *
 * `opts.strategy` chooses the search:
 *   - 'greedy' (default) — ONE measured greedy hill-climb (the original). Fast,
 *     reviewable, but stops at the first local optimum it reaches.
 *   - 'explore' — MULTI-RESTART: run several independent greedy climbs from the
 *     SAME input with different deterministic seeds (each seeds the candidate
 *     sampling differently, so each follows a different path up the hill), and
 *     return the best result. Genuinely escapes local optima — this is exactly
 *     the "restart from a brand-new spot and climb again" idea the Academy
 *     teaches. Roads stay sacred in BOTH strategies.
 *
 * Everything else is unchanged: deterministic per seed, never worse than the
 * input, reviewable diff, locks + specials respected.
 *
 * @param {object} layout - a validated layout (not mutated)
 * @param {{housing?:number, maxAdd?:number, maxIter?:number, strategy?:string, restarts?:number}} opts
 * @returns {{layout, diff, before, after, strategy}}
 */
export function optimizeLayout(layout, opts = {}, seed = 1) {
  const strategy = opts?.strategy === 'explore' ? 'explore' : 'greedy';
  const result = strategy === 'explore' ? exploreLayout(layout, opts, seed) : { ...greedyLayout(layout, opts, seed), strategy };
  const composition = compositionTargets(result.layout);
  return {
    ...result,
    composition,
    targetComposition: composition.targets,
    actualComposition: composition.actual,
    unresolvedComposition: composition.unresolved,
    recommendation: composition.capacityHomes ? null : 'Draw a road loop or choose a road template before Optimise builds the city.',
  };
}

/**
 * Multi-restart local search. Runs `restarts` (default 3) independent greedy
 * climbs from the same input; each restart uses a seed derived from the input
 * seed so candidate sampling differs (different routes up the hill). Keeps the
 * run with the best final score; ties → leaner city (fewer buildings added).
 * Deterministic for a given seed. Never worse than the input because every
 * greedy run is already non-decreasing and we keep the best of them.
 */
function exploreLayout(layout, opts = {}, seed = 1) {
  const restarts = Math.min(6, Math.max(2, opts?.restarts ?? 3));
  const seedMul = opts?.seedStep ?? 1009;   // spread derived seeds apart
  let best = null;
  for (let i = 0; i < restarts; i++) {
    // Restart 0 uses the caller's exact seed, so the plain greedy result is
    // ALWAYS one candidate: Explore can never score below Greedy on the same
    // seed (only ever equal or better) — a child trying both never sees
    // Explore "do worse" than the Greedy they just ran.
    const rs = i === 0 ? (seed >>> 0 || 1) : ((Math.imul(seed >>> 0, seedMul) + i * 977) >>> 0 || (i + 1));
    const r = greedyLayout(layout, opts, rs);
    if (!best) { best = r; continue; }
    const better = r.after.score > best.after.score + 1e-9;
    const tiedLeaner = Math.abs(r.after.score - best.after.score) <= 1e-9
      && r.layout.buildings.length < best.layout.buildings.length;
    if (better || tiedLeaner) best = r;
  }
  return { ...best, strategy: 'explore' };
}

function greedyLayout(layout, opts = {}, seed = 1) {
  const rng = seedRng(seed);
  // Goal weights (mayor / custom sliders) change the optimizer's objective —
  // passed through to every trial score. When null the fixed default blend is
  // used (identical to the pre-goals behaviour).
  const weights = opts?.weights || null;
  // The planner displays the road-based walk score. The optimizer must optimise
  // that exact same objective or its promised score can disagree after Apply.
  const measure = (l) => computeMetrics(l, METRIC_PARAMS, weights, computeWalkReach(l));
  // Working copy — never touch the caller's layout.
  const out = JSON.parse(JSON.stringify(layout));
  const diff = [];
  const segs = roadSegments(out);
  const buildings = () => out.buildings;
  const countType = (t) => buildings().filter((b) => b.type === t).length;
  out.parks ||= [];

  let before = measure(out);
  let after = before;

  const maxIter = Math.min(MAX_ITERATIONS, Math.max(4, opts.maxIter ?? MAX_ITERATIONS));
  // Additions are coverage-driven (no ratio cap), so a city with homes spread
  // far apart may need many services/utilities. Size the safety cap with the
  // town the STUDENT'S roads can support (capacity), not a fixed number, so a
  // roads-only plan can actually be filled out; a student who already built a
  // lot leaves little (or no) room to add. Preserved utilities cannot follow a
  // relocated neighbourhood. Reserve room for explicit replacement coverage
  // through additions, within the layout cap.
  const fillCapacity = townCapacity(out);
  const maxAdd = Math.min(Math.max(0, 400 - out.buildings.length), Math.max(14, opts.maxAdd ?? (12 * countType(HOUSING) + 20), 2 * fillCapacity + 20));

  // ── 1. Resolve movable overlaps; protected overlaps must remain.
  //    Nudge only an unprotected generic member; never a special; never a
  //    LOCKED building (the student pinned it — leave it and move the other).
  for (let pass = 0; pass < 8; pass++) {
    let movedAny = false;
    for (let i = 0; i < buildings().length; i++) {
      for (let j = i + 1; j < buildings().length; j++) {
        const a = buildings()[i], b = buildings()[j];
        const fa = a.footprint || footprintFor(a.type);
        const fb = b.footprint || footprintFor(b.type);
        if (!rectsOverlap(a.pos, fa, b.pos, fb, MARGIN)) continue;
        const aLock = protectedBuilding(a), bLock = protectedBuilding(b);
        if (aLock && bLock) continue;                 // both pinned — leave it
        const aNoisy = isNoisyType(a.type), bNoisy = isNoisyType(b.type);
        const aSpec = isSpecial(a), bSpec = isSpecial(b);
        let mover, other, mfp;
        if (bLock) { mover = a; other = b; mfp = fa; }
        else if (aLock) { mover = b; other = a; mfp = fb; }
        else if (bNoisy && !aNoisy) { mover = b; other = a; mfp = fb; }
        else if (aNoisy && !bNoisy) { mover = a; other = b; mfp = fa; }
        else if (aSpec && !bSpec) { mover = b; other = a; mfp = fb; }
        else if (bSpec && !aSpec) { mover = a; other = b; mfp = fa; }
        else { mover = b; other = a; mfp = fb; }
        if (protectedBuilding(mover)) continue;
        const dx = mover.pos[0] - other.pos[0], dz = mover.pos[1] - other.pos[1];
        const minX = (mfp[0] + (other.footprint || footprintFor(other.type))[0]) / 2 + MARGIN;
        const minZ = (mfp[1] + (other.footprint || footprintFor(other.type))[1]) / 2 + MARGIN;
        const adx = Math.abs(dx), adz = Math.abs(dz);
        let nx = 0, nz = 0;
        if (minX - adx < minZ - adz) nx = (dx >= 0 ? 1 : -1) * (minX - adx + 0.5);
        else nz = (dz >= 0 ? 1 : -1) * (minZ - adz + 0.5);
        if (dx === 0 && dz === 0) nx = minX / 2 + 0.5;
        mover.pos[0] += nx; mover.pos[1] += nz;
        movedAny = true;
      }
    }
    if (!movedAny) break;
  }
  // 1b. Bad road logic: move unprotected buildings that sit ON a road fully off
  //     it (roads are sacred, so the building is what moves). Runs AFTER the
  //     overlap pass so a building nudged by it can't stay on a road; the
  //     clearance search already avoids every other building.
  const bands = roadBands(out);
  const offRoadDiff = [];
  resolveRoadOverlaps(out, bands, offRoadDiff);
  // Re-measure after overlap + road fixes.
  after = measure(out);
  // When a road-overlap fix ran, the city may have lost a fraction of a point
  // (a building stepped sideways off the street). That fix is a HARD geometric
  // invariant, so it becomes the baseline the hill-climb must not fall below,
  // and the safety net below always keeps the CLEANED layout — never the raw
  // on-road input. Roads stay byte-identical either way.
  const cleanedScore = after.score;
  const cleanedSnapshot = offRoadDiff.length ? JSON.parse(JSON.stringify(out)) : null;

  let addedTotal = 0;
  let lastImprovedIter = 0;

  // ── 2. Hill-climb: try each move type, keep only strictly-improving moves.
  for (let iter = 0; iter < maxIter; iter++) {
    const prevScore = after.score;
    let didImprove = false;

    // 2a. Add missing SERVICES near homes that lack them (school, shop,
    //     hospital, fire, police). Each service is required independently —
    //     a park can't substitute. Also add missing UTILITIES (water, power,
    //     bus) at district range. Accessibility-only gains do NOT drive adds.
    //     NO ratio cap: coverage is spatial (150m/400m), so homes spread far
    //     apart each need their own service/utility — the ratio target is for
    //     the balance score, not a hard ceiling on what coverage requires.
    const H = countType(HOUSING);
    const want = ratioTargets(H);
    if (addedTotal < maxAdd) {
      const homes = buildings().filter((b) => b.type === HOUSING);
      // 2a-i. Services: for each home, figure out which service it lacks, then
      //        try adding that service near such homes.
      const missingByType = {};
      for (const t of METRIC_PARAMS.serviceTypes) missingByType[t] = [];
      for (const h of homes) {
        for (const t of missingServices(out, h)) missingByType[t].push(h);
      }
      for (const t of METRIC_PARAMS.serviceTypes) {
        if (addedTotal >= maxAdd) break;
        const needy = missingByType[t];
        if (!needy.length) continue;
        const spots = candidateSpots(out, t, rng, segs, bands);
        for (const [sx, sz] of spots) {
          if (!needy.some((h) => Math.hypot(h.pos[0] - sx, h.pos[1] - sz) <= METRIC_PARAMS.coverageDist)) continue;
          const trial = JSON.parse(JSON.stringify(out));
          pushBuilding(trial, t, [sx, sz], catalogType(t)?.height);
          const m = measure(trial);
          if (m.coverage > after.coverage + 1e-9) {
            const improved = metricDeltas(after, m);
            const name = catalogType(t)?.name || t;
            const nFixed = needy.filter((h) => Math.hypot(h.pos[0] - sx, h.pos[1] - sz) <= METRIC_PARAMS.coverageDist).length;
            diff.push({
              action: 'add', what: t, count: 1,
              from: null, to: [sx, sz],
              reason: `Added a ${name} so ${nFixed === 1 ? 'a home' : nFixed + ' homes'} nearby has a ${name} to reach — services improved.`,
              improved, fromScore: after.score, toScore: m.score,
            });
            out.buildings = trial.buildings;
            after = m;
            addedTotal++;
            didImprove = true;
            break;   // one add per type per iteration
          }
        }
      }
      // 2a-ii. Utilities (water/power/bus) — homes need these within district
      //        range. Only added if a home genuinely lacks them.
      const missingUtilByType = {};
      for (const t of METRIC_PARAMS.utilityTypes) missingUtilByType[t] = [];
      for (const h of homes) {
        for (const t of missingUtilities(out, h)) missingUtilByType[t].push(h);
      }
      for (const t of METRIC_PARAMS.utilityTypes) {
        if (addedTotal >= maxAdd) break;
        const needy = missingUtilByType[t];
        if (!needy.length) continue;
        const spots = candidateSpots(out, t, rng, segs, bands);
        for (const [sx, sz] of spots) {
          if (!needy.some((h) => Math.hypot(h.pos[0] - sx, h.pos[1] - sz) <= METRIC_PARAMS.utilityDist)) continue;
          const trial = JSON.parse(JSON.stringify(out));
          pushBuilding(trial, t, [sx, sz], catalogType(t)?.height);
          const m = measure(trial);
          if (m.utilities > after.utilities + 1e-9) {
            const improved = metricDeltas(after, m);
            const name = catalogType(t)?.name || t;
            const nFixed = needy.filter((h) => Math.hypot(h.pos[0] - sx, h.pos[1] - sz) <= METRIC_PARAMS.utilityDist).length;
            diff.push({
              action: 'add', what: t, count: 1,
              from: null, to: [sx, sz],
              reason: `Added the ${name} so ${nFixed === 1 ? 'a home' : nFixed + ' homes'} nearby have ${catalogType(t)?.name || t.toLowerCase()} — utilities improved.`,
              improved, fromScore: after.score, toScore: m.score,
            });
            out.buildings = trial.buildings;
            after = m;
            addedTotal++;
            didImprove = true;
            break;
          }
        }
      }
    }

    // Relocate unprotected generic buildings for road access.
    if (!didImprove) {
      const farList = buildings().filter((b) => !protectedBuilding(b) &&
        distToRoad(b.pos[0], b.pos[1], segs) > METRIC_PARAMS.accessibleDist * 2.5
      );
      for (const b of farList) {
        const spots = candidateSpots(out, b.type, rng, segs, bands, b.footprint || footprintFor(b.type));
        const fp = b.footprint || footprintFor(b.type);
        for (const [sx, sz] of spots) {
          // The new spot must be near a road (that's the whole point).
          if (distToRoad(sx, sz, segs) > METRIC_PARAMS.accessibleDist) continue;
          const trial = JSON.parse(JSON.stringify(out));
          const tb = findBuildingAt(trial, b);
          if (!tb) continue;
          // The spot must not overlap ANY building in the trial (including
          // pre-existing ones and buildings moved earlier in this pass).
          const overlaps = trial.buildings.some((o) => {
            if (o === tb) return false;
            const ofp = o.footprint || footprintFor(o.type);
            return Math.abs(o.pos[0] - sx) < (ofp[0] + fp[0]) / 2 + MARGIN &&
                   Math.abs(o.pos[1] - sz) < (ofp[1] + fp[1]) / 2 + MARGIN;
          });
          if (overlaps) continue;
          const from = tb.pos.slice();
          tb.pos = [Math.round(sx * 2) / 2, Math.round(sz * 2) / 2];
          const m = measure(trial);
          if (m.accessibility > after.accessibility + 1e-9) {
            const improved = metricDeltas(after, m);
            const name = catalogType(b.type)?.name || b.type;
            const distBefore = Math.round(distToRoad(from[0], from[1], segs));
            const distAfter = Math.round(distToRoad(tb.pos[0], tb.pos[1], segs));
            diff.push({
              action: 'move', what: b.type, count: 1, from, to: tb.pos.slice(),
              reason: `Moved the ${name} closer to a road (${distBefore}m → ${distAfter}m away) so people can actually reach it — road access improved.`,
              improved, fromScore: after.score, toScore: m.score,
            });
            out.buildings = trial.buildings;
            after = m;
            didImprove = true;
            break;
          }
        }
        if (didImprove) break;
      }
    }

    // 2c. Move a noisy building away from homes (zoning). Only the noisy/
    //     generic member. Acceptance is by ZONING improvement (not strict
    //     composite score): moving a noisy building away from homes usually
    //     moves it off the road, which drops accessibility (40%) and nets the
    //     composite score to ~zero — so a strict `score >` gate rejects the
    //     fix almost every time. We accept when zoning clearly improves and
    //     the composite doesn't meaningfully drop.
    if (!didImprove) {
      const noisyList = buildings().filter((b) => !protectedBuilding(b) && isNoisyType(b.type));
      for (const b of noisyList) {
        const tooClose = buildings().some((h) => h.type === HOUSING && Math.hypot(b.pos[0] - h.pos[0], b.pos[1] - h.pos[1]) < 100);
        if (!tooClose) continue;
        const spots = candidateSpots(out, b.type, rng, segs, bands, b.footprint || footprintFor(b.type));
        const fp = b.footprint || footprintFor(b.type);
        for (const [sx, sz] of spots) {
          const trial = JSON.parse(JSON.stringify(out));
          const tb = findBuildingAt(trial, b);
          if (!tb) continue;
          // The spot must not overlap ANY building in the trial.
          const overlaps = trial.buildings.some((o) => {
            if (o === tb) return false;
            const ofp = o.footprint || footprintFor(o.type);
            return Math.abs(o.pos[0] - sx) < (ofp[0] + fp[0]) / 2 + MARGIN &&
                   Math.abs(o.pos[1] - sz) < (ofp[1] + fp[1]) / 2 + MARGIN;
          });
          if (overlaps) continue;
          const from = tb.pos.slice();
          tb.pos = [Math.round(sx * 2) / 2, Math.round(sz * 2) / 2];
          const m = measure(trial);
          if (m.zoning > after.zoning + 1e-9 && m.score >= after.score - 2) {
            const improved = metricDeltas(after, m);
            const name = catalogType(b.type)?.name || b.type;
            diff.push({
              action: 'move', what: b.type, count: 1, from, to: tb.pos.slice(),
              reason: `Moved the ${name} away from nearby homes — quieter streets, better zoning.`,
              improved, fromScore: after.score, toScore: m.score,
            });
            out.buildings = trial.buildings;
            after = m;
            didImprove = true;
            break;
          }
        }
        if (didImprove) break;
      }
    }

    // Trim only unprotected generic duplicates; all special instances stay.
    if (!didImprove) {
      const keepFloor = (t) => {
        if (t === HOUSING) return Infinity;
        if (isSpecialType(t)) return Infinity;
        const applicable = compositionTargets(out).targets[t] ?? want[t] ?? 1;
        return Math.max(1, 2 * applicable);
      };
      for (let guard = 0; guard < 24; guard++) {
        // Find the first over-floor type; pick its most-clustered victim.
        const allTypes = new Set(buildings().map((b) => b.type));
        let t = null, victim = null;
        for (const tt of allTypes) {
          if (countType(tt) > keepFloor(tt)) {
            const list = buildings().filter((b) => !protectedBuilding(b) && b.type === tt);
            if (!list.length) continue;   // every copy is locked — can't trim
            victim = list.slice().sort((x, y) => clusterScore(out, y, tt) - clusterScore(out, x, tt))[0];
            t = tt;
            break;
          }
        }
        if (!t || !victim) break;
        const trial = JSON.parse(JSON.stringify(out));
        const real = findBuildingAt(trial, victim);
        if (!real) break;
        const from = real.pos.slice();
        trial.buildings.splice(trial.buildings.indexOf(real), 1);
        const m = measure(trial);
        // NEVER remove a service/utility that any home depends on — the score
        // gate alone is too permissive (removing a stranded school can leave
        // coverage equal if other metrics offset it). A needed facility must
        // not vanish just because the composite score held.
        const isService = METRIC_PARAMS.serviceTypes.includes(t);
        const isUtility = METRIC_PARAMS.utilityTypes.includes(t);
        if (isService && m.coverage < after.coverage - 1e-9) break;
        if (isUtility && m.utilities < after.utilities - 1e-9) break;
        // Allow a small score dip: trimming an absurd duplicate (e.g. 12
        // traffic labs) is clearly right even if accessibility nudges down a
        // point by removing one road-adjacent building. The final safety net
        // still reverts if the WHOLE optimization ends worse than the input.
        if (!(m.score >= after.score - 2 && trial.buildings.length < out.buildings.length)) break;
        const improved = metricDeltas(after, m);
        const name = catalogType(t)?.name || t;
        const isSpecialDup = catalogType(t)?.category === 'special';
        diff.push({
          action: 'remove', what: t, count: 1, from, to: null,
          reason: isSpecialDup
            ? `Removed an extra ${name} — this city only needs one; the rest were clutter.`
            : `Removed an extra ${name} — one is enough. This may trade away a point or two, but a leaner city was worth it.`,
          improved, fromScore: after.score, toScore: m.score,
        });
        out.buildings = trial.buildings;
        after = m;
        didImprove = true;
        // Continue — there may be more excess of the same type.
      }
    }

    if (prevScore === after.score && !didImprove) {      lastImprovedIter++;
      if (lastImprovedIter >= 2) break;   // converged — two quiet passes
    } else {
      lastImprovedIter = 0;
    }
  }

  // ── 2b. Deterministic district plan. Each addition goes to the most
  // under-target frontage district. A step may be score-neutral while it
  // reduces a hard viability deficit; the receipt records that distinction.
  if (segs.length && out.buildings.length < 400) {
    const contract = compositionTargets(out);
    const target = contract.targets;
    const anchors = contract.districts;
    const addAt = (type, spot, reason, objective = `composition:${type}`) => {
      const fromScore = after.score;
      const beforeDeficit = viabilityDeficit(out);
      pushBuilding(out, type, [spot[0], spot[1]], catalogType(type)?.height);
      const next = measure(out);
      const viabilityChange = beforeDeficit - viabilityDeficit(out);
      diff.push({ action: 'add', what: type, count: 1, from: null, to: [spot[0], spot[1]],
        reason, improved: metricDeltas(after, next), fromScore, toScore: next.score,
        stage: 'district', objective, deficitId: objective, viabilityChange });
      after = next;
    };
    const bestHousingSpot = (districtIndex) => {
      const spots = candidateSpots(out, HOUSING, rng, segs, bands);
      let best = null, bestDistance = Infinity, bestMissing = Infinity;
      for (const spot of spots) {
        if (distToRoad(spot[0], spot[1], segs) > METRIC_PARAMS.accessibleDist) continue;
        if (nearestDistrict(spot, anchors) !== districtIndex) continue;
        const d = Math.hypot(spot[0] - anchors[districtIndex].anchor[0], spot[1] - anchors[districtIndex].anchor[1]);
        const missing = METRIC_PARAMS.serviceTypes.filter((type) => !out.buildings.some((building) =>
          building.type === type && Math.hypot(building.pos[0] - spot[0], building.pos[1] - spot[1]) <= METRIC_PARAMS.coverageDist)).length;
        if (missing < bestMissing || (missing === bestMissing && d < bestDistance)) {
          best = spot; bestDistance = d; bestMissing = missing;
        }
      }
      return best;
    };
    const coverUnservedHomes = () => {
      for (const type of [...METRIC_PARAMS.serviceTypes, ...METRIC_PARAMS.utilityTypes]) {
        const radius = METRIC_PARAMS.utilityTypes.includes(type) ? METRIC_PARAMS.utilityDist : METRIC_PARAMS.coverageDist;
        for (let guard = 0; guard < 40 && out.buildings.length < 400; guard++) {
          const uncovered = buildings().filter((b) => b.type === HOUSING
            && !buildings().some((o) => o.type === type && Math.hypot(o.pos[0] - b.pos[0], o.pos[1] - b.pos[1]) <= radius));
          if (!uncovered.length) break;
          let pick = null, cover = 0, coverRadius = Infinity;
          for (const spot of candidateSpots(out, type, rng, segs, bands)) {
            const reached = uncovered.filter((h) => Math.hypot(h.pos[0] - spot[0], h.pos[1] - spot[1]) <= radius);
            const n = reached.length;
            const farthest = n ? Math.max(...reached.map((h) => Math.hypot(h.pos[0] - spot[0], h.pos[1] - spot[1]))) : Infinity;
            if (n > cover || (n === cover && farthest < coverRadius)) {
              pick = spot; cover = n; coverRadius = farthest;
            }
          }
          if (!pick || !cover) break;
          const district = nearestDistrict(pick, anchors);
          addAt(type, pick, `Added ${catalogType(type)?.name || type} where it covers ${cover} unserved home${cover === 1 ? '' : 's'}.`,
            `coverage:${anchors[district]?.id || 'city'}:${type}`);
        }
      }
    };
    while (countType(HOUSING) < target.housing && out.buildings.length < 400) {
      const districts = frontageDistricts(out, target.housing);
      const eligible = districts.map((d, i) => ({ ...d, i, deficit: d.targetHomes - d.actualHomes }))
        .filter((d) => d.deficit > 0)
        .sort((a, b) => b.deficit / Math.max(1, b.targetHomes) - a.deficit / Math.max(1, a.targetHomes)
          || b.deficit - a.deficit || a.i - b.i);
      let chosen = null, spot = null;
      for (const district of eligible) {
        spot = bestHousingSpot(district.i);
        if (spot) { chosen = district; break; }
      }
      if (!spot) break;
      addAt(HOUSING, spot,
        `Added a home toward ${chosen.id}'s frontage target (${chosen.actualHomes + 1}/${chosen.targetHomes}).`,
        `district-homes:${chosen.id}`);
      // Complete this bounded neighbourhood step before opening another
      // district. Re-running My Move therefore chooses the same next decision
      // as this full plan instead of leaving a trail of unserved homes.
      coverUnservedHomes();
    }

    // Coverage first: choose the placement that reaches the most currently
    // uncovered homes. This may exceed a global ratio when districts are far
    // apart; geographic service is more important than a misleading count.
    coverUnservedHomes();

    // Complete the full target vector (ordinary civic ratios + minimum
    // utility quantities). Existing buildings already counted above.
    for (const type of ['school', 'shop', 'hospital', 'fire', 'police', 'water', 'power', 'bus', 'office', 'library', 'stadium']) {
      while (countType(type) < (target[type] || 0) && out.buildings.length < 400) {
        const districts = frontageDistricts(out, target.housing).filter((d) => d.actualHomes > 0);
        const under = districts.slice().sort((a, b) =>
          a.actualOrdinary / Math.max(1, a.targetHomes) - b.actualOrdinary / Math.max(1, b.targetHomes)
          || a.id.localeCompare(b.id))[0];
        const wanted = under ? anchors.findIndex((d) => d.id === under.id) : 0;
        const spot = candidateSpots(out, type, rng, segs, bands)
          .filter(([x, z]) => distToRoad(x, z, segs) <= METRIC_PARAMS.accessibleDist)
          .sort((a, b) => (nearestDistrict(a, anchors) === wanted ? 0 : 1) - (nearestDistrict(b, anchors) === wanted ? 0 : 1))[0];
        if (!spot) break;
        addAt(type, spot, `Added ${catalogType(type)?.name || type} to complete the city-size target.`, `composition:${type}`);
      }
    }
    const parkSpotFor = (home) => {
      for (let radius = 45; radius <= 135; radius += 15) for (let step = 0; step < 24; step++) {
        const angle = step * Math.PI * 2 / 24;
        const spot = [Math.round(home.pos[0] + Math.cos(angle) * radius), Math.round(home.pos[1] + Math.sin(angle) * radius)];
        if (spot[0] < 40 || spot[1] < 40 || spot[0] > (out.scaleMeters || 2000) - 40 || spot[1] > (out.scaleMeters || 2000) - 40) continue;
        if (overlapsAny(out, spot[0], spot[1], [70, 70], 8)) continue;
        if (rectRoadClearance(spot[0], spot[1], [0, 0], bands) < 35 + ROAD_CLEARANCE_MARGIN) continue;
        if (out.parks.some((p) => Math.hypot(p.cx - spot[0], p.cz - spot[1]) < p.radius + 45)) continue;
        return spot;
      }
      return null;
    };
    const districtWithoutPark = () => {
      const populated = frontageDistricts(out, target.housing).filter((d) => d.actualHomes > 0);
      return populated.find((district) => !out.parks.some((park) =>
        anchors[nearestDistrict([park.cx, park.cz], anchors)]?.id === district.id));
    };
    while (out.parks.length < (target.parks || 0) || districtWithoutPark()) {
      const homes = buildings().filter((b) => b.type === HOUSING);
      const missingDistrict = districtWithoutPark();
      const needy = missingDistrict
        ? homes.filter((home) => anchors[nearestDistrict(home.pos, anchors)]?.id === missingDistrict.id)
        : homes.filter((h) => !out.parks.some((p) => Math.hypot(p.cx - h.pos[0], p.cz - h.pos[1]) <= METRIC_PARAMS.coverageDist));
      let home = null, spot = null;
      const choices = needy.length ? needy : homes.slice(out.parks.length % Math.max(1, homes.length));
      for (const candidate of choices) {
        const candidateSpot = parkSpotFor(candidate);
        if (candidateSpot) { home = candidate; spot = candidateSpot; break; }
      }
      if (!spot || out.parks.length >= 20) break;
      const fromScore = after.score;
      const beforeDeficit = viabilityDeficit(out);
      out.parks.push({ cx: Math.round(spot[0]), cz: Math.round(spot[1]), radius: 35 });
      const next = measure(out);
      const objective = `green:${anchors[nearestDistrict(spot, anchors)]?.id || 'city'}`;
      diff.push({ action: 'add_park', what: 'park', count: 1, from: null, to: spot,
        reason: 'Added green space to complete the neighbourhood bundle.', improved: metricDeltas(after, next),
        fromScore, toScore: next.score, stage: 'district', objective, deficitId: objective,
        viabilityChange: beforeDeficit - viabilityDeficit(out) });
      after = next;
    }
  }

  // ── 3. Hard safety: if anything went wrong, a score is non-finite, or the
  //    result is worse, return the best SAFE layout (never make the city
  //    worse, never let NaN through). When a road-overlap fix ran, that fix is
  //    the floor: bumping a building off a road is non-negotiable, so fall back
  //    to the cleaned layout rather than the raw on-road input.
  const baseline = offRoadDiff.length ? cleanedScore : before.score;
  const fallback = () => (cleanedSnapshot
    ? { layout: cleanedSnapshot, diff: offRoadDiff.slice(), before, after: { ...before, score: cleanedScore } }
    : { layout: JSON.parse(JSON.stringify(layout)), diff: [], before, after: before });
  try {
    const final = measure(out);
    const baselineLayout = cleanedSnapshot || layout;
    const hardProgress = viabilityDeficit(out) < viabilityDeficit(baselineLayout);
    if (!preservesExistingWork(layout, out) || !Number.isFinite(final.score)
      || (final.score < baseline - 1e-9 && !hardProgress)) {
      return fallback();
    }
    after = final;
  } catch (e) {
    return fallback();
  }

  return { layout: out, diff: [...offRoadDiff, ...diff], before, after };
}

function clusterScore(layout, b, type) {
  let s = 0;
  for (const o of layout.buildings) {
    if (o === b || o.type !== type) continue;
    const d = Math.hypot(b.pos[0] - o.pos[0], b.pos[1] - o.pos[1]);
    if (d < 90) s += 2 - d / 90;
  }
  return s;
}

// ── proposeMoves: expose the optimizer's next steps (for the "My move" round)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Expose the next move from the same deterministic plan used by full Optimise,
 * WITHOUT committing it. Repeating Apply + My Move therefore follows the full
 * planner's viability direction one decision at a time.
 *
 * Each move: { action:'add'|'move'|'remove'|'add_park', what, from, to, reason,
 *              reasonMetric, deltaScore, improved:[metricNames], beforeScore,
 *              afterScore }. `reasonMetric` is the metric the reason string
 *              narrates — the reveal uses it as the fallback when a move's
 *              measured `improved` is empty, so the reason question is always
 *              answerable.
 * Deterministic for a given seed. Respects locks + goal weights. The `k`
 * argument remains accepted for API compatibility, but this one-step teaching
 * interaction returns at most one move.
 */
export function proposeMoves(layout, opts = {}, k = 3, seed = 1) {
  // My Move is a window onto the exact same ordered plan as full Optimise.
  // Re-running after Apply recalculates the remaining district deficits, so it
  // follows the same deterministic direction instead of a second hill-climb.
  const plan = optimizeLayout(layout, { ...opts, strategy: 'greedy' }, seed);
  const reasonFor = (move) => {
    const objective = move.objective || move.deficitId || '';
    if (objective.startsWith('coverage:')) {
      return METRIC_PARAMS.utilityTypes.includes(move.what) ? 'utilities' : 'coverage';
    }
    if (objective.startsWith('green:') || move.action === 'add_park') return 'green';
    if (objective.startsWith('district-homes:')) return 'spread';
    if (objective.startsWith('composition:')) return 'balance';
    if (move.kind === 'off-road') return 'accessibility';
    return move.improved?.[0] || (move.action === 'move' ? 'accessibility' : 'balance');
  };
  let cursor = JSON.parse(JSON.stringify(layout));
  const measured = [];
  for (const move of plan.diff.slice(0, Math.min(1, Math.max(0, k)))) {
    const beforeMetric = computeMetrics(cursor, METRIC_PARAMS, opts?.weights || null, computeWalkReach(cursor));
    const beforeDeficit = viabilityDeficit(cursor);
    const next = applyMove(cursor, move);
    const afterMetric = computeMetrics(next, METRIC_PARAMS, opts?.weights || null, computeWalkReach(next));
    const inferredObjective = move.objective || move.deficitId || `metric:${reasonFor(move)}`;
    measured.push({
      ...move,
      objective: inferredObjective,
      deficitId: move.deficitId || inferredObjective,
      viabilityChange: beforeDeficit - viabilityDeficit(next),
      reasonMetric: move.reasonMetric || reasonFor(move),
      deltaScore: Number((afterMetric.score - beforeMetric.score).toFixed(3)),
      beforeScore: beforeMetric.score,
      afterScore: afterMetric.score,
    });
    cursor = next;
  }
  return measured;
}

/**
 * Apply a single proposed move to a deep-copied layout. Returns the new
 * layout (caller may commit it). Moves that reference a building that no
 * longer exists (e.g. after an undo) are no-ops.
 */
export function applyMove(layout, move) {
  const out = JSON.parse(JSON.stringify(layout));
  if (!move) return out;
  if (move.action === 'add') {
    pushBuilding(out, move.what, move.to, catalogType(move.what)?.height);
  } else if (move.action === 'remove' && move.from) {
    const idx = out.buildings.findIndex((b) => !protectedBuilding(b) && b.type === move.what && Math.hypot(b.pos[0] - move.from[0], b.pos[1] - move.from[1]) < 1);
    if (idx >= 0 && !protectedBuilding(out.buildings[idx])) out.buildings.splice(idx, 1);
  } else if (move.action === 'move' && move.to) {
    const tb = out.buildings.find((b) => (move.safetyNudge || !protectedBuilding(b)) && b.type === move.what
      && Math.hypot(b.pos[0] - move.from[0], b.pos[1] - move.from[1]) < 1);
    if (tb && (move.safetyNudge || !protectedBuilding(tb))) tb.pos = [Math.round(move.to[0] * 2) / 2, Math.round(move.to[1] * 2) / 2];
  } else if (move.action === 'add_park' && move.to) {
    out.parks.push({ cx: Math.round(move.to[0]), cz: Math.round(move.to[1]), radius: 60 });
  }
  return out;
}
