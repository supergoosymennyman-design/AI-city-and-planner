/**
 * city-common/optimize.js — the AI city optimizer for the 2D planner.
 *
 * A MEASURED hill-climb, not a rule-stamping pipeline. We start from the
 * student's layout and repeatedly propose small, deterministic candidate
 * moves (add / move / remove / add-park). Each move is trial-applied to a
 * working copy and scored with computeMetrics(); a move is KEPT when it
 * strictly raises the city score (or ties with fewer buildings). A few
 * reviewable moves that fix something real (quieter zoning, decluttering) may
 * keep a tiny score dip of up to 2 points — the plan text says so honestly.
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
import { computeMetrics, roadSegments, METRIC_PARAMS, ratioTargets, servicesNear, utilitiesNear } from './metrics.js';
import { computeWalkReach } from './walkability.js';

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
  const available = (after.buildings || []).map((b) => canonicalJSON(b));
  for (const b of (before.buildings || []).filter(protectedBuilding)) {
    const i = available.indexOf(canonicalJSON(b));
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

/** True if a footprint at (x,z) overlaps any existing building. */
function overlapsAny(layout, x, z, fp, margin = MARGIN) {
  for (const b of layout.buildings || []) {
    const fp2 = b.footprint || footprintFor(b.type);
    if (rectsOverlap([x, z], fp, b.pos, fp2, margin)) return true;
  }
  return false;
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
function candidateSpots(layout, type, rng, segs) {
  const SCALE = layout.scaleMeters || 2000;
  const fp = footprintFor(type);
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
  if (!housing) {
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
  for (const [x, z] of candidates) {
    if (overlapsAny(layout, x, z, fp)) continue;
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
  if (strategy === 'explore') return exploreLayout(layout, opts, seed);
  const r = greedyLayout(layout, opts, seed);
  return { ...r, strategy };
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
  const parks = out.parks || [];
  out.parks = parks;

  let before = measure(out);
  let after = before;

  const maxIter = Math.min(MAX_ITERATIONS, Math.max(4, opts.maxIter ?? MAX_ITERATIONS));
  // Additions are now coverage-driven (no ratio cap), so a city with homes
  // spread far apart may need many services/utilities. Size the safety cap
  // with the home count so spread-out cities aren't starved of budget.
  // Preserved utilities cannot follow a relocated neighbourhood. Reserve room
  // for explicit replacement coverage through additions, within the layout cap.
  const maxAdd = Math.min(Math.max(0, 400 - out.buildings.length), Math.max(14, opts.maxAdd ?? (12 * countType(HOUSING) + 20)));

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
  // Re-measure after overlap fixes.
  after = measure(out);

  let addedTotal = 0;
  let lastImprovedIter = 0;

  // ── 2. Hill-climb: try each move type, keep only strictly-improving moves.
  for (let iter = 0; iter < maxIter; iter++) {
    const prevScore = after.score;
    let didImprove = false;

    // 2a0. Housing: a city needs residents. Bootstrap from zero homes, then
    //      grow to a small healthy minimum so a city isn't all facilities and
    //      one home. CAPPED at 3 — this is a minimum, not a moving target:
    //      letting it scale with civicCount would spiral (each added service
    //      raises the target, each added home needs more services, coverage
    //      never catches up). Acceptance is by composite score — a home that
    //      would tank coverage or zoning is rejected.
    if (!didImprove && addedTotal < maxAdd) {
      const H = countType(HOUSING);
      const civicCount = CIVIC.reduce((n, t) => n + countType(t), 0);
      const targetHomes = Math.min(3, Math.max(1, Math.ceil(civicCount / 3)));
      if (H === 0 || H < targetHomes) {
        const bootstrap = H === 0;
        const spots = candidateSpots(out, HOUSING, rng, segs);
        for (const [sx, sz] of spots) {
          if (distToRoad(sx, sz, segs) > METRIC_PARAMS.accessibleDist) continue;   // near a road
          const trial = JSON.parse(JSON.stringify(out));
          pushBuilding(trial, HOUSING, [sx, sz], catalogType(HOUSING)?.height);
          const m = measure(trial);
          if (m.score >= after.score - 1e-9) {
            const improved = metricDeltas(after, m);
            diff.push({
              action: 'add', what: HOUSING, count: 1, from: null, to: [sx, sz],
              reason: bootstrap
                ? 'Added a home — a city needs somewhere for people to live!'
                : `Added a home — ${civicCount} facilities need more residents to feel like a real town!`,
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
        const spots = candidateSpots(out, t, rng, segs);
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
        const spots = candidateSpots(out, t, rng, segs);
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
        const spots = candidateSpots(out, b.type, rng, segs);
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
        const spots = candidateSpots(out, b.type, rng, segs);
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

    // 2d. Add a park when homes are far from green space (coverage).
    if (!didImprove && parks.length < 5) {
      const spots = parkSpots(out, rng);
      for (const [sx, sz] of spots) {
        const trial = JSON.parse(JSON.stringify(out));
        trial.parks.push({ cx: Math.round(sx), cz: Math.round(sz), radius: 60 + rng() * 30 });
        const m = measure(trial);
        if (m.score > after.score) {
          const improved = metricDeltas(after, m);
          diff.push({
            action: 'add_park', what: 'park', count: 1, from: null, to: [sx, sz],
            reason: 'Added a park near homes that had no green space close by — now they have somewhere green to walk to.',
            improved, fromScore: after.score, toScore: m.score,
          });
          out.parks = trial.parks;
          after = m;
          didImprove = true;
          break;
        }
      }
    }

    // Trim only unprotected generic duplicates; all special instances stay.
    if (!didImprove) {
      const keepFloor = (t) => {
        if (t === HOUSING) return Infinity;
        if (isSpecialType(t)) return Infinity;
        return Math.max(1, want[t] ?? 1);
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

    if (prevScore === after.score && !didImprove) {
      lastImprovedIter++;
      if (lastImprovedIter >= 2) break;   // converged — two quiet passes
    } else {
      lastImprovedIter = 0;
    }
  }

  // ── 3. Hard safety: if anything went wrong, a score is non-finite, or the
  //    result is worse, return the input layout untouched (never make the city
  //    worse, never let NaN through).
  try {
    const final = measure(out);
    if (!preservesExistingWork(layout, out) || !Number.isFinite(final.score) || final.score < before.score) {
      return { layout: JSON.parse(JSON.stringify(layout)), diff: [], before, after: before };
    }
    after = final;
  } catch (e) {
    return { layout: JSON.parse(JSON.stringify(layout)), diff: [], before, after: before };
  }

  return { layout: out, diff, before, after };
}

function parkSpots(layout, rng) {
  const S = layout.scaleMeters || 2000;
  const homes = layout.buildings.filter((b) => b.type === HOUSING);
  if (homes.length) {
    for (let i = 0; i < 20; i++) {
      const h = homes[Math.floor(rng() * homes.length)];
      const r = 40 + rng() * 70;
      const ang = rng() * Math.PI * 2;
      const x = h.pos[0] + Math.cos(ang) * r;
      const z = h.pos[1] + Math.sin(ang) * r;
      if (x < 30 || z < 30 || x > S - 30 || z > S - 30) continue;
      if (overlapsAny(layout, x, z, [50, 50], 8)) continue;
      return [[x, z]];
    }
  }
  for (let i = 0; i < 30; i++) {
    const x = 60 + rng() * (S - 120), z = 60 + rng() * (S - 120);
    if (overlapsAny(layout, x, z, [50, 50], 8)) continue;
    return [[x, z]];
  }
  return [];
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
 * Generate the top-k single moves that would most improve the current layout,
 * WITHOUT committing any. These are the greedy hill-climb choices the optimizer
 * would take next, surfaced so the student can predict/choose instead of the
 * optimizer silently acting.
 *
 * Each move: { action:'add'|'move'|'remove'|'add_park', what, from, to, reason,
 *              reasonMetric, deltaScore, improved:[metricNames], beforeScore,
 *              afterScore }. `reasonMetric` is the metric the reason string
 *              narrates — the reveal uses it as the fallback when a move's
 *              measured `improved` is empty, so the reason question is always
 *              answerable.
 * Deterministic for a given seed. Respects locks + goal weights. Returns
 * <= k moves, diverse (not all the same type), sorted by deltaScore desc.
 */
export function proposeMoves(layout, opts = {}, k = 3, seed = 1) {
  const rng = seedRng(seed);
  const weights = opts?.weights || null;
  // Keep "My move" on the same road-aware objective as Optimise and the UI.
  const measure = (l) => computeMetrics(l, METRIC_PARAMS, weights, computeWalkReach(l));
  const out = JSON.parse(JSON.stringify(layout));
  const segs = roadSegments(out);
  const buildings = () => out.buildings;
  const countType = (t) => buildings().filter((b) => b.type === t).length;
  const before = measure(out);
  const candidates = [];

  const record = (trial, action, what, from, to, reason, reasonMetric) => {
    const m = measure(trial);
    const deltaScore = m.score - before.score;
    if (deltaScore <= 0) return;
    candidates.push({
      action, what, from, to, reason, reasonMetric,
      deltaScore, improved: metricDeltas(before, m),
      beforeScore: before.score, afterScore: m.score,
    });
  };

  // Candidate spots for a single move of `type` — trial the top few and record
  // the one with the best actual (measured) score delta.
  const bestSpotFor = (type, pickSpot) => {
    const spots = pickSpot(type) || [];
    const fp = footprintFor(type);
    const trial = JSON.parse(JSON.stringify(out));
    let bestMove = null;
    for (const [sx, sz] of spots.slice(0, 6)) {
      const t = JSON.parse(JSON.stringify(out));
      pushBuilding(t, type, [sx, sz], catalogType(type)?.height);
      const m = measure(t);
      if (m.score - before.score > (bestMove ? bestMove.deltaScore : -Infinity)) {
        bestMove = { t, sx, sz, delta: m.score - before.score, improved: metricDeltas(before, m), afterScore: m.score };
      }
    }
    return bestMove;
  };

  // ── 1. Add housing (only when a city lacks residents) ──
  const civicCount = CIVIC.reduce((n, t) => n + countType(t), 0);
  const targetHomes = Math.min(3, Math.max(1, Math.ceil(civicCount / 3)));
  if (countType(HOUSING) < targetHomes) {
    const bm = bestSpotFor(HOUSING, () => candidateSpots(out, HOUSING, rng, segs).filter(([sx, sz]) => distToRoad(sx, sz, segs) <= METRIC_PARAMS.accessibleDist));
    if (bm) record(bm.t, 'add', HOUSING, null, [bm.sx, bm.sz],
      countType(HOUSING) === 0 ? 'Add a home — a city needs somewhere for people to live!' : 'Add a home — a real town needs more residents!',
      'balance');
  }

  // ── 2. Add a missing service (best across all missing service types) ──
  {
    const homes = buildings().filter((b) => b.type === HOUSING);
    const missingByType = {};
    for (const t of METRIC_PARAMS.serviceTypes) missingByType[t] = [];
    for (const h of homes) for (const t of missingServices(out, h)) missingByType[t].push(h);
    for (const t of METRIC_PARAMS.serviceTypes) {
      const needy = missingByType[t];
      if (!needy.length) continue;
      const bm = bestSpotFor(t, () => candidateSpots(out, t, rng, segs).filter(([sx, sz]) =>
        needy.some((h) => Math.hypot(h.pos[0] - sx, h.pos[1] - sz) <= METRIC_PARAMS.coverageDist)));
      if (bm) record(bm.t, 'add', t, null, [bm.sx, bm.sz],
        `Add a ${catalogType(t)?.name || t} so homes nearby have one to reach — services improve.`, 'coverage');
    }
  }

  // ── 3. Add a missing utility (best across all missing utility types) ──
  {
    const homes = buildings().filter((b) => b.type === HOUSING);
    const missingByType = {};
    for (const t of METRIC_PARAMS.utilityTypes) missingByType[t] = [];
    for (const h of homes) for (const t of missingUtilities(out, h)) missingByType[t].push(h);
    for (const t of METRIC_PARAMS.utilityTypes) {
      const needy = missingByType[t];
      if (!needy.length) continue;
      const bm = bestSpotFor(t, () => candidateSpots(out, t, rng, segs).filter(([sx, sz]) =>
        needy.some((h) => Math.hypot(h.pos[0] - sx, h.pos[1] - sz) <= METRIC_PARAMS.utilityDist)));
      if (bm) record(bm.t, 'add', t, null, [bm.sx, bm.sz],
        `Add the ${catalogType(t)?.name || t} so homes nearby have ${catalogType(t)?.name || t.toLowerCase()} — utilities improve.`, 'utilities');
    }
  }

  // ── 4. Relocate a stranded building closer to a road (accessibility) ──
  for (const b of buildings()) {
    if (protectedBuilding(b)) continue;
    if (distToRoad(b.pos[0], b.pos[1], segs) <= METRIC_PARAMS.accessibleDist * 2.5) continue;
    const spots = candidateSpots(out, b.type, rng, segs).filter(([sx, sz]) => distToRoad(sx, sz, segs) <= METRIC_PARAMS.accessibleDist);
    const fp = b.footprint || footprintFor(b.type);
    for (const [sx, sz] of spots.slice(0, 4)) {
      if (overlapsAny(out, sx, sz, fp)) continue;
      const trial = JSON.parse(JSON.stringify(out));
      const tb = findBuildingAt(trial, b);
      if (!tb) continue;
      const from = tb.pos.slice();
      tb.pos = [Math.round(sx * 2) / 2, Math.round(sz * 2) / 2];
      record(trial, 'move', b.type, from, tb.pos.slice(),
        `Move the ${catalogType(b.type)?.name || b.type} closer to a road so people can reach it — road access improves.`, 'accessibility');
      break;   // one relocation per stranded building
    }
  }

  // ── 5. Move a noisy building away from homes (zoning) ──
  for (const b of buildings()) {
    if (protectedBuilding(b) || !isNoisyType(b.type)) continue;
    const tooClose = buildings().some((h) => h.type === HOUSING && Math.hypot(b.pos[0] - h.pos[0], b.pos[1] - h.pos[1]) < 100);
    if (!tooClose) continue;
    const spots = candidateSpots(out, b.type, rng, segs);
    const fp = b.footprint || footprintFor(b.type);
    for (const [sx, sz] of spots.slice(0, 4)) {
      if (overlapsAny(out, sx, sz, fp)) continue;
      const trial = JSON.parse(JSON.stringify(out));
      const tb = findBuildingAt(trial, b);
      if (!tb) continue;
      const from = tb.pos.slice();
      tb.pos = [Math.round(sx * 2) / 2, Math.round(sz * 2) / 2];
      record(trial, 'move', b.type, from, tb.pos.slice(),
        `Move the ${catalogType(b.type)?.name || b.type} away from nearby homes — quieter streets, better zoning.`, 'zoning');
      break;
    }
  }

  // ── 8. Add a park near homes with no green space ──
  {
    const spots = parkSpots(out, rng);
    for (const [sx, sz] of spots) {
      const trial = JSON.parse(JSON.stringify(out));
      trial.parks.push({ cx: Math.round(sx), cz: Math.round(sz), radius: 60 + rng() * 30 });
      record(trial, 'add_park', 'park', null, [sx, sz],
        'Add a park near homes with no green space close by — now they have somewhere green to walk to.', 'green');
      break;
    }
  }

  // ── 9. Remove an excess duplicate (leaner city) ──
  {
    const want = ratioTargets(countType(HOUSING));
    for (const t of new Set(buildings().map((b) => b.type))) {
      const keepFloor = t === HOUSING ? Infinity : isSpecialType(t) ? Infinity : Math.max(1, want[t] ?? 1);
      if (countType(t) <= keepFloor) continue;
      const list = buildings().filter((b) => !protectedBuilding(b) && b.type === t);
      if (!list.length) continue;
      const victim = list.slice().sort((x, y) => clusterScore(out, y, t) - clusterScore(out, x, t))[0];
      const trial = JSON.parse(JSON.stringify(out));
      const real = findBuildingAt(trial, victim);
      if (!real) continue;
      const from = real.pos.slice();
      trial.buildings.splice(trial.buildings.indexOf(real), 1);
      const m = measure(trial);
      const isService = METRIC_PARAMS.serviceTypes.includes(t);
      const isUtility = METRIC_PARAMS.utilityTypes.includes(t);
      if (isService && m.coverage < before.coverage - 1e-9) continue;
      if (isUtility && m.utilities < before.utilities - 1e-9) continue;
      record(trial, 'remove', t, from, null,
        catalogType(t)?.category === 'special'
          ? `Remove an extra ${catalogType(t)?.name || t} — this city only needs one; the rest were clutter.`
          : `Remove an extra ${catalogType(t)?.name || t} — one is enough; cutting the clutter keeps the score strong.`,
        'balance');
    }
  }

  // ── Sort by delta desc, prefer diversity, cap at k. ──
  // Pass 0: one of each ACTION (add/move/remove/park) so the student reasons
  // across genuinely different kinds of change. Pass 1: one of each WHAT
  // (building type). Pass 2: whatever is left.
  candidates.sort((a, b) => b.deltaScore - a.deltaScore);
  const picked = [];
  const seenAction = new Set();
  const seenWhat = new Set();
  let pass = 0;
  while (picked.length < k && pass < 3) {
    let added = false;
    for (const c of candidates) {
      if (picked.includes(c)) continue;
      const want = pass === 0 ? !seenAction.has(c.action) : pass === 1 ? !seenWhat.has(c.what) : true;
      if (!want) continue;
      picked.push(c);
      seenAction.add(c.action);
      seenWhat.add(c.what);
      added = true;
      if (picked.length >= k) break;
    }
    if (!added) break;
    pass++;
  }
  return picked;
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
    const tb = out.buildings.find((b) => !protectedBuilding(b) && b.type === move.what && Math.hypot(b.pos[0] - move.from[0], b.pos[1] - move.from[1]) < 1);
    if (tb && !protectedBuilding(tb)) tb.pos = [Math.round(move.to[0] * 2) / 2, Math.round(move.to[1] * 2) / 2];
  } else if (move.action === 'add_park' && move.to) {
    out.parks.push({ cx: Math.round(move.to[0]), cz: Math.round(move.to[1]), radius: 60 });
  }
  return out;
}
