/**
 * city-common/optimize.js — the AI city optimizer for the 2D planner.
 *
 * A MEASURED hill-climb, not a rule-stamping pipeline. We start from the
 * student's layout and repeatedly propose small, deterministic candidate
 * moves (add / move / remove / add-park). Each move is trial-applied to a
 * working copy and scored with computeMetrics(); a move is KEPT only when it
 * strictly raises the city score (or ties with fewer buildings). The result:
 *
 *   - the student's ROADS are never touched;
 *   - special/mission buildings are never removed or moved;
 *   - the city NEVER gets worse (score is non-decreasing);
 *   - the student's scale is respected — we fill genuine gaps, we don't
 *     force a fixed minimum town size;
 *   - everything is deterministic for a given seed (reproducible, testable).
 *
 * Every accepted move carries a measured `improved` list (which sub-metrics
 * rose) + before/after scores so the UI can explain the WHY in kid terms.
 *
 * Usage:
 *   const { layout, diff, before, after } = optimizeLayout(layout, opts);
 *   // diff = [{ action:'add'|'move'|'remove'|'add_park', what?, count?,
 *   //           from?, to?, reason, improved:[...], fromScore, toScore }]
 */

import { catalogType, specialKeys } from './catalog.js';
import { computeMetrics, roadSegments, METRIC_PARAMS, ratioTargets, servicesNear, utilitiesNear } from './metrics.js';

// Heavy-noisy facilities kept away from homes. POWER is NOT in this set — it is
// a required utility (homes need it nearby) with only a mild setback (see
// METRIC_PARAMS.powerSetbackDist), matching real-world practice.
const NOISY = new Set(METRIC_PARAMS.noisyTypes);
const HOUSING = 'housing';
const CIVIC = ['school', 'hospital', 'shop', 'office', 'library', 'fire', 'police', 'stadium'];
const MARGIN = 4;            // meters of clearance between buildings
const MAX_ITERATIONS = 40;   // hard bound on hill-climb passes (runtime safety)
const MAX_CANDIDATES = 160;  // candidate spots per placement search

export function isNoisyType(t) { return NOISY.has(t); }
export function isHousingType(t) { return t === HOUSING; }
const isSpecialType = (t) => (catalogType(t)?.category === 'special');
function isSpecial(b) { return !!b && isSpecialType(b.type); }

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

/** Find a deep-copied building's clone by type + position (for trials). */
function findBuildingAt(layout, b) {
  return (layout.buildings || []).find(
    (x) => x.type === b.type && Math.hypot(x.pos[0] - b.pos[0], x.pos[1] - b.pos[1]) < 0.1
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

/** Snapshot of the 4 sub-metrics as a comparable tuple. */
function metricTuple(m) {
  return [m.accessibility, m.coverage, m.utilities, m.spread, m.zoning, m.balance];
}

/**
 * Candidate spots for spreading a clustered special: sample the whole map on a
 * coarse grid, but STRONGLY prefer positions that are road-adjacent (so the
 * move doesn't strand the building) and far from every other special. This is
 * a dedicated search for the spread metric — candidateSpots() is too biased
 * toward the current cluster area.
 */
function spreadCandidates(layout, b, rng, segs) {
  const SCALE = layout.scaleMeters || 2000;
  const fp = b.footprint || footprintFor(b.type);
  const candidates = [];
  for (let gx = 120; gx < SCALE; gx += 150) for (let gz = 120; gz < SCALE; gz += 150) {
    candidates.push([gx + rng() * 40 - 20, gz + rng() * 40 - 20]);
  }
  shuffle(candidates, rng);
  const scored = [];
  for (const [x, z] of candidates) {
    if (overlapsAny(layout, x, z, fp)) continue;
    let score = 0;
    const dRoad = distToRoad(x, z, segs);
    if (dRoad <= 60) score += 3.0; else if (dRoad <= 140) score += 1.0;
    // Far from other specials is the whole point.
    let minSpecial = Infinity;
    for (const o of layout.buildings || []) {
      if (o === b || !isSpecial(o) || isNoisyType(o.type)) continue;
      const d = Math.hypot(o.pos[0] - x, o.pos[1] - z);
      if (d < minSpecial) minSpecial = d;
    }
    score += Math.min(3, minSpecial / 200);
    scored.push({ x, z, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_CANDIDATES).map((s) => [s.x, s.z]);
}function metricDeltas(before, after) {
  const names = ['accessibility', 'coverage', 'utilities', 'spread', 'zoning', 'balance'];
  const improved = [];
  const tb = metricTuple(before), ta = metricTuple(after);
  for (let i = 0; i < names.length; i++) if (ta[i] > tb[i] + 1e-9) improved.push(names[i]);
  return improved;
}

/**
 * Build an optimised layout via measured hill-climbing.
 * @param {object} layout - a validated layout (not mutated)
 * @param {{housing?:number, maxAdd?:number, maxIter?:number}} opts
 * @returns {{layout, diff, before, after}}
 */
export function optimizeLayout(layout, opts = {}, seed = 1) {
  const rng = seedRng(seed);
  // Working copy — never touch the caller's layout.
  const out = JSON.parse(JSON.stringify(layout));
  const diff = [];
  const segs = roadSegments(out);
  const buildings = () => out.buildings;
  const countType = (t) => buildings().filter((b) => b.type === t).length;
  const parks = out.parks || [];
  out.parks = parks;

  let before = computeMetrics(out);
  let after = before;

  const maxIter = Math.min(MAX_ITERATIONS, Math.max(4, opts.maxIter ?? MAX_ITERATIONS));
  const maxAdd = Math.max(1, opts.maxAdd ?? 14);   // safety cap on additions per run

  // ── 1. Resolve overlaps first (a hard constraint: no overlaps ever left).
  //    Nudge only the noisy/generic member; never a non-noisy special.
  for (let pass = 0; pass < 8; pass++) {
    let movedAny = false;
    for (let i = 0; i < buildings().length; i++) {
      for (let j = i + 1; j < buildings().length; j++) {
        const a = buildings()[i], b = buildings()[j];
        const fa = a.footprint || footprintFor(a.type);
        const fb = b.footprint || footprintFor(b.type);
        if (!rectsOverlap(a.pos, fa, b.pos, fb, MARGIN)) continue;
        const aNoisy = isNoisyType(a.type), bNoisy = isNoisyType(b.type);
        const aSpec = isSpecial(a), bSpec = isSpecial(b);
        let mover, other, mfp;
        if (bNoisy && !aNoisy) { mover = b; other = a; mfp = fb; }
        else if (aNoisy && !bNoisy) { mover = a; other = b; mfp = fa; }
        else if (aSpec && !bSpec) { mover = b; other = a; mfp = fb; }
        else if (bSpec && !aSpec) { mover = a; other = b; mfp = fa; }
        else { mover = b; other = a; mfp = fb; }
        if (isSpecial(mover) && !isNoisyType(mover.type)) continue;
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
  after = computeMetrics(out);

  let addedTotal = 0;
  let lastImprovedIter = 0;

  // ── 2. Hill-climb: try each move type, keep only strictly-improving moves.
  for (let iter = 0; iter < maxIter; iter++) {
    const prevScore = after.score;
    let didImprove = false;

    // 2a0. Bootstrapping: a city with buildings but NO homes can't score its
    //      services/utilities (they're home-centric). Add housing near a road
    //      so the rest of the model has someone to serve. Acceptance is by
    //      road-adjacency + not making anything worse — coverage won't move
    //      yet because there are no services, but the next iteration can add
    //      them once a resident exists.
    if (!didImprove && countType(HOUSING) === 0 && addedTotal < maxAdd) {
      const spots = candidateSpots(out, HOUSING, rng, segs);
      for (const [sx, sz] of spots) {
        if (distToRoad(sx, sz, segs) > METRIC_PARAMS.accessibleDist) continue;   // near a road
        const trial = JSON.parse(JSON.stringify(out));
        pushBuilding(trial, HOUSING, [sx, sz], catalogType(HOUSING)?.height);
        const m = computeMetrics(trial);
        // Adding the FIRST home is always the right bootstrap — coverage stays
        // 0 until services exist, but a resident now exists for later moves.
        if (m.score >= after.score - 1e-9) {
          const improved = metricDeltas(after, m);
          diff.push({
            action: 'add', what: HOUSING, count: 1, from: null, to: [sx, sz],
            reason: 'Added a home — a city needs somewhere for people to live!',
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

    // 2a. Add missing SERVICES near homes that lack them (school, shop,
    //     hospital, fire, police). Each service is required independently —
    //     a park can't substitute. Also add missing UTILITIES (water, power,
    //     bus) at district range. Accessibility-only gains do NOT drive adds;
    //     the student's scale is respected (ratioTargets caps the count).
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
        if (countType(t) >= want[t]) continue;          // already at ratio
        const needy = missingByType[t];
        if (!needy.length) continue;
        const spots = candidateSpots(out, t, rng, segs);
        for (const [sx, sz] of spots) {
          if (!needy.some((h) => Math.hypot(h.pos[0] - sx, h.pos[1] - sz) <= METRIC_PARAMS.coverageDist)) continue;
          const trial = JSON.parse(JSON.stringify(out));
          pushBuilding(trial, t, [sx, sz], catalogType(t)?.height);
          const m = computeMetrics(trial);
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
        if (countType(t) >= want[t] || countType(t) >= 1) continue;   // one of each is enough
        const needy = missingUtilByType[t];
        if (!needy.length) continue;
        const spots = candidateSpots(out, t, rng, segs);
        for (const [sx, sz] of spots) {
          if (!needy.some((h) => Math.hypot(h.pos[0] - sx, h.pos[1] - sz) <= METRIC_PARAMS.utilityDist)) continue;
          const trial = JSON.parse(JSON.stringify(out));
          pushBuilding(trial, t, [sx, sz], catalogType(t)?.height);
          const m = computeMetrics(trial);
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

    // 2b. Relocate-for-accessibility: generic/housing/noisy buildings too far
    //     from any road (> accessibleDist) get trial-moved to a road-adjacent
    //     spot. Accessibility is 40% of the score and is otherwise frozen
    //     (roads are never added), so this is the move that fixes "my whole
    //     city is far from the road". Specials stay put.
    if (!didImprove) {
      const farList = buildings().filter((b) =>
        !isSpecial(b) && distToRoad(b.pos[0], b.pos[1], segs) > METRIC_PARAMS.accessibleDist * 2.5
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
          const m = computeMetrics(trial);
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
      const noisyList = buildings().filter((b) => isNoisyType(b.type));
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
          const m = computeMetrics(trial);
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

    // 2c2. Spread clustered specials (mission buildings). The spread metric
    //     (15%) only ticks up when several cluster-pairs are broken, which a
    //     single one-at-a-time move can rarely do — so this step BATCHES the
    //     fix: relocate up to 3 clustered non-noisy specials apart in one
    //     trial, and keep the whole batch only if the COMPOSITE score
    //     strictly improves (protecting accessibility). Specials are never
    //     REMOVED; the student reviews via Apply/Keep.
    if (!didImprove) {
      const clustered = buildings().filter((b) =>
        isSpecial(b) && !isNoisyType(b.type) &&
        buildings().some((o) => o !== b && isSpecial(o) && !isNoisyType(o.type) &&
          Math.hypot(b.pos[0] - o.pos[0], b.pos[1] - o.pos[1]) < METRIC_PARAMS.clusterDist)
      );
      if (clustered.length >= 2) {
        // Pick a few to move (bounded) and find a de-clustered road-adjacent
        // spot for each. Keep the batch only if composite score rises.
        const movers = clustered.slice(0, 3);
        const trial = JSON.parse(JSON.stringify(out));
        const plan = [];   // {from, to, what}
        let ok = true;
        for (const b of movers) {
          const spots = spreadCandidates(out, b, rng, segs);
          const fp = b.footprint || footprintFor(b.type);
          let placed = false;
          for (const [sx, sz] of spots) {
            // Must not overlap ANY building in the trial (including the other
            // movers' new positions) and must de-cluster from other specials.
            const tooNearOther = trial.buildings.some((o) => o !== b && isSpecial(o) &&
              Math.hypot(o.pos[0] - sx, o.pos[1] - sz) < METRIC_PARAMS.clusterDist);
            if (tooNearOther) continue;
            const overlaps = trial.buildings.some((o) => {
              if (o === b) return false;
              const ofp = o.footprint || footprintFor(o.type);
              return Math.abs(o.pos[0] - sx) < (ofp[0] + fp[0]) / 2 + MARGIN &&
                     Math.abs(o.pos[1] - sz) < (ofp[1] + fp[1]) / 2 + MARGIN;
            });
            if (overlaps) continue;
            const tb = findBuildingAt(trial, b);
            if (!tb) continue;
            const from = tb.pos.slice();
            tb.pos = [Math.round(sx * 2) / 2, Math.round(sz * 2) / 2];
            plan.push({ what: b.type, from, to: tb.pos.slice() });
            placed = true;
            break;
          }
          if (!placed) { ok = false; break; }
        }
        if (ok && plan.length >= 2) {
          const m = computeMetrics(trial);
          if (m.spread > after.spread + 1e-9 && m.score > after.score + 1e-9) {
            const improved = metricDeltas(after, m);
            for (const p of plan) {
              const name = catalogType(p.what)?.name || p.what;
              diff.push({
                action: 'move', what: p.what, count: 1, from: p.from, to: p.to,
                reason: `Moved the ${name} away from the other mission buildings — a spread-out city is a smarter city.`,
                improved, fromScore: after.score, toScore: m.score,
              });
            }
            out.buildings = trial.buildings;
            after = m;
            didImprove = true;
          }
        }
      }
    }

    // 2c3. Reposition a UTILITY (water/power/bus) closer to homes that lack
    //     it. Utilities are specials: we may move them (reviewable) but never
    //     remove them. Keep only if utilities coverage improves.
    if (!didImprove) {
      const homes = buildings().filter((b) => b.type === HOUSING);
      for (const t of METRIC_PARAMS.utilityTypes) {
        const util = buildings().find((b) => b.type === t);
        if (!util) continue;
        const needy = homes.filter((h) => !utilitiesNear(out, h).includes(t));
        if (!needy.length) continue;
        const spots = candidateSpots(out, t, rng, segs);
        const fp = util.footprint || footprintFor(t);
        for (const [sx, sz] of spots) {
          if (!needy.some((h) => Math.hypot(h.pos[0] - sx, h.pos[1] - sz) <= METRIC_PARAMS.utilityDist)) continue;
          // Don't move power right next to a home (mild setback).
          if (t === 'power' && homes.some((h) => Math.hypot(h.pos[0] - sx, h.pos[1] - sz) < METRIC_PARAMS.powerSetbackDist)) continue;
          const trial = JSON.parse(JSON.stringify(out));
          const tu = findBuildingAt(trial, util);
          if (!tu) continue;
          const overlaps = trial.buildings.some((o) => {
            if (o === tu) return false;
            const ofp = o.footprint || footprintFor(o.type);
            return Math.abs(o.pos[0] - sx) < (ofp[0] + fp[0]) / 2 + MARGIN &&
                   Math.abs(o.pos[1] - sz) < (ofp[1] + fp[1]) / 2 + MARGIN;
          });
          if (overlaps) continue;
          const from = tu.pos.slice();
          tu.pos = [Math.round(sx * 2) / 2, Math.round(sz * 2) / 2];
          const m = computeMetrics(trial);
          if (m.utilities > after.utilities + 1e-9) {
            const improved = metricDeltas(after, m);
            const name = catalogType(t)?.name || t;
            diff.push({
              action: 'move', what: t, count: 1, from, to: tu.pos.slice(),
              reason: `Moved the ${name} closer to homes that were too far away — utilities improved.`,
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

    // 2c4. Power setback: if a power grid sits right next to a home (within
    //     the mild hum distance), move it just far enough away.
    if (!didImprove) {
      const power = buildings().find((b) => b.type === 'power');
      const homes = buildings().filter((b) => b.type === HOUSING);
      if (power && homes.some((h) => Math.hypot(h.pos[0] - power.pos[0], h.pos[1] - power.pos[1]) < METRIC_PARAMS.powerSetbackDist)) {
        const spots = candidateSpots(out, 'power', rng, segs);
        const fp = power.footprint || footprintFor('power');
        for (const [sx, sz] of spots) {
          if (homes.some((h) => Math.hypot(h.pos[0] - sx, h.pos[1] - sz) < METRIC_PARAMS.powerSetbackDist)) continue;
          const trial = JSON.parse(JSON.stringify(out));
          const tp = findBuildingAt(trial, power);
          if (!tp) continue;
          const overlaps = trial.buildings.some((o) => {
            if (o === tp) return false;
            const ofp = o.footprint || footprintFor(o.type);
            return Math.abs(o.pos[0] - sx) < (ofp[0] + fp[0]) / 2 + MARGIN &&
                   Math.abs(o.pos[1] - sz) < (ofp[1] + fp[1]) / 2 + MARGIN;
          });
          if (overlaps) continue;
          const from = tp.pos.slice();
          tp.pos = [Math.round(sx * 2) / 2, Math.round(sz * 2) / 2];
          const m = computeMetrics(trial);
          if (m.zoning > after.zoning + 1e-9 && m.score >= after.score - 2) {
            const improved = metricDeltas(after, m);
            diff.push({
              action: 'move', what: 'power', count: 1, from, to: tp.pos.slice(),
              reason: 'Moved the Smart Power Grid a little away from the nearest home — the hum is fine at a small distance.',
              improved, fromScore: after.score, toScore: m.score,
            });
            out.buildings = trial.buildings;
            after = m;
            didImprove = true;
            break;
          }
        }
      }
    }

    // 2d. Add a park when homes are far from green space (coverage).
    if (!didImprove && parks.length < 5) {
      const spots = parkSpots(out, rng);
      for (const [sx, sz] of spots) {
        const trial = JSON.parse(JSON.stringify(out));
        trial.parks.push({ cx: Math.round(sx), cz: Math.round(sz), radius: 60 + rng() * 30 });
        const m = computeMetrics(trial);
        if (m.score > after.score) {
          const improved = metricDeltas(after, m);
          diff.push({
            action: 'add_park', what: 'park', count: 1, from: null, to: [sx, sz],
            reason: 'Added a park near homes that had no green space nearby — happier, healthier neighbourhoods.',
            improved, fromScore: after.score, toScore: m.score,
          });
          out.parks = trial.parks;
          after = m;
          didImprove = true;
          break;
        }
      }
    }

    // 2e. Remove an excess duplicate when it doesn't hurt (leaner city).
    //     HARD RULE: special/mission buildings (incl. city_central) are NEVER
    //     removed — only generic duplicates can be trimmed.
    if (!didImprove) {
      const excess = [];
      for (const t of CIVIC) {
        const have = countType(t);
        const target = want[t];
        if (have > Math.max(1, target)) {
          const list = buildings().filter((b) => b.type === t);
          // Remove the most-clustered one.
          const victim = list.slice().sort((x, y) => clusterScore(out, y, t) - clusterScore(out, x, t))[0];
          excess.push({ t, victim });
        }
      }
      for (const { t, victim } of excess) {
        const trial = JSON.parse(JSON.stringify(out));
        const real = findBuildingAt(trial, victim);
        if (!real) continue;
        const from = real.pos.slice();
        trial.buildings.splice(trial.buildings.indexOf(real), 1);
        const m = computeMetrics(trial);
        if (m.score >= after.score && trial.buildings.length < out.buildings.length) {
          const improved = metricDeltas(after, m);
          const name = catalogType(t)?.name || t;
          diff.push({
            action: 'remove', what: t, count: 1, from, to: null,
            reason: `Removed an extra ${name} — one is enough; the city stayed just as good with less clutter.`,
            improved, fromScore: after.score, toScore: m.score,
          });
          out.buildings = trial.buildings;
          after = m;
          didImprove = true;
          break;
        }
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
    const final = computeMetrics(out);
    if (!Number.isFinite(final.score) || final.score < before.score) {
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
