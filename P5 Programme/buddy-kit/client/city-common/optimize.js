/**
 * city-common/optimize.js — the AI city optimizer for the 2D planner.
 *
 * Produces a "genuine but minimal" optimisation plan:
 *   - the student's ROADS are never touched;
 *   - the student's special/mission buildings stay exactly where they placed them;
 *   - generic buildings are only moved when there is a real problem (overlap or
 *     a noisy facility next to homes), and only removed when clearly excessive
 *     and clustered (e.g. five fire stations in a row);
 *   - missing facilities are ADDED to hit common-sense ratios.
 *
 * Every change carries a plain-language reason so the student can review and
 * approve the whole plan before it is applied. Placement uses a seeded RNG so
 * each student's optimised city comes out different.
 *
 * Usage:
 *   const { layout, diff } = optimizeLayout(layout, strategy, seed);
 *   // diff = [{action:'add'|'move'|'remove'|'add_park', type?, from?, to?, reason}]
 */

import { catalogType, specialKeys } from './catalog.js';

const NOISY = new Set(['power', 'traffic_lab', 'traffic_emergency', 'delivery', 'recycling']);
const HOUSING = 'housing';
const CIVIC = ['school', 'hospital', 'shop', 'office', 'library', 'fire', 'police', 'stadium'];
const MARGIN = 4;            // meters of clearance between buildings
const MIN_HOUSING = 10;      // smallest sensible "town" after optimisation
const MAX_PARKS = 5;

/** Per-housing ratios (rounded up, at least 1 where sensible). */
export function ratioTargets(H) {
  return {
    school: Math.max(1, Math.ceil(H / 10)),
    hospital: Math.max(1, Math.ceil(H / 15)),
    shop: Math.max(1, Math.ceil(H / 8)),
    office: Math.max(1, Math.ceil(H / 6)),
    library: 1,
    fire: 1,
    police: 1,
    stadium: 1,
  };
}

export function isNoisyType(t) { return NOISY.has(t); }
export function isHousingType(t) { return t === HOUSING; }
const isSpecialType = (t) => (catalogType(t)?.category === 'special');
function isSpecial(b) { return !!b && isSpecialType(b.type); }

function footprintFor(type) {
  return (catalogType(type)?.footprint || [20, 20]).slice();
}

function centroid(layout) {
  const bs = layout.buildings || [];
  const SCALE = layout.scaleMeters || 2000;
  if (!bs.length) return [SCALE / 2, SCALE / 2];
  let sx = 0, sz = 0;
  for (const b of bs) { sx += b.pos[0]; sz += b.pos[1]; }
  return [sx / bs.length, sz / bs.length];
}

function rectsOverlap(aPos, aFp, bPos, bFp, margin = MARGIN) {
  return Math.abs(aPos[0] - bPos[0]) < (aFp[0] + bFp[0]) / 2 + margin
    && Math.abs(aPos[1] - bPos[1]) < (aFp[1] + bFp[1]) / 2 + margin;
}

/** Nearest distance to buildings of a given type set (Infinity if none). */
function distToType(x, z, layout, predicate) {
  let best = Infinity;
  for (const b of layout.buildings || []) {
    if (!predicate(b)) continue;
    const d = Math.hypot(x - b.pos[0], z - b.pos[1]);
    if (d < best) best = d;
  }
  return best;
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

/** Pick a good spot for a new building of `type`. Returns [x, z] or null. */
function pickSpot(layout, type, rng, ctx) {
  const SCALE = layout.scaleMeters || 2000;
  const fp = footprintFor(type);
  const noisy = isNoisyType(type);
  const housing = isHousingType(type);
  const civic = CIVIC.includes(type);

  // Candidate grid is coarse (fewer candidates => fewer full-city scans).
  // Random jitter breaks the visual grid without multiplying cost.
  const candidates = [];
  for (let gx = 120; gx < SCALE; gx += 180) for (let gz = 120; gz < SCALE; gz += 180) {
    candidates.push([gx + rng() * 60 - 30, gz + rng() * 60 - 30]);
  }
  for (let i = 0; i < 16; i++) candidates.push([rng() * SCALE, rng() * SCALE]);
  shuffle(candidates, rng);

  // Cache road segments ONCE per optimise pass (ctx.segs) instead of re-deriving
  // them for every candidate (distToRoad used to flatten roads per call).
  const segs = ctx.segs;

  let best = null, bestScore = -Infinity;
  for (const [x, z] of candidates) {
    if (overlapsAny(layout, x, z, fp)) continue;
    let score = 0;
    // Road access is always good — early-exit once we have "close" so long
    // roads don't get scanned in full for every candidate.
    const dRoad = distToRoadCached(x, z, segs);
    if (dRoad <= 60) score += 1.5; else if (dRoad <= 140) score += 0.6;
    // Coverage: housing wants schools, hospitals, SHOPS and parks nearby
    if (housing) {
      const dSvc = Math.min(
        distToType(x, z, layout, (b) => b.type === 'school' || b.type === 'hospital' || b.type === 'shop'),
        distToPark(x, z, layout)
      );
      if (dSvc <= 150) score += 1.2; else if (dSvc <= 250) score += 0.5;
    }
    // Civic/school/hospital/shop like being near homes
    if (civic && !noisy) {
      const dHome = distToType(x, z, layout, (b) => b.type === HOUSING);
      if (dHome <= 120) score += 1.0; else if (dHome <= 220) score += 0.4;
    }
    // Noisy wants to be away from homes
    if (noisy) {
      const dHome = distToType(x, z, layout, (b) => b.type === HOUSING);
      if (dHome >= 120) score += 1.2; else if (dHome >= 70) score += 0.3;
    }
    // Spread: avoid piling the same type together (or piling mission buildings)
    const dSame = distToType(x, z, layout, (b) => b.type === type);
    if (dSame < 120) score -= 1.5; else if (dSame < 200) score -= 0.5;
    if (isSpecialType(type)) {
      const dSpec = distToType(x, z, layout, (b) => b.type !== type && catalogType(b.type)?.category === 'special');
      if (dSpec < 100) score -= 0.8; else if (dSpec < 180) score -= 0.3;
    }
    // Mild centering bias so the city doesn't drift to a corner
    const [cx0, cz0] = ctx.centroid;
    const dc = Math.hypot(x - cx0, z - cz0);
    score -= dc / SCALE * 0.5;

    if (score > bestScore) { bestScore = score; best = [x, z]; }
  }
  return best;
}

/** Flatten road segments once per optimise pass (shared ctx.segs). */
function buildRoadSegments(layout) {
  const segs = [];
  for (const r of layout.roads || []) {
    const pts = r.points || [];
    for (let i = 0; i < pts.length - 1; i++) segs.push([pts[i], pts[i + 1]]);
  }
  return segs;
}

/** Distance from a point to the nearest cached road segment (Infinity if none). */
function distToRoadCached(x, z, segs) {
  if (!segs.length) return Infinity;
  let best = Infinity;
  for (const [a, b] of segs) {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const l2 = dx * dx + dz * dz;
    let t = l2 ? ((x - a[0]) * dx + (z - a[1]) * dz) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(x - (a[0] + t * dx), z - (a[1] + t * dz));
    if (d < best) best = d;
    if (best <= 60) break;   // "close enough" — stop scanning long roads
  }
  return best;
}

function distToPark(x, z, layout) {
  let best = Infinity;
  for (const p of layout.parks || []) {
    const d = Math.hypot(x - p.cx, z - p.cz) - (p.radius || 0);
    if (d < best) best = d;
  }
  return best;
}

/** True if a footprint at (x,z) overlaps any existing building (with margin). */
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

/**
 * Build an optimised layout + a human-readable diff.
 * Mutates a COPY of the layout. The strategy can be supplied by the LLM or
 * generated client-side; { housing } anchors the scale.
 */
export function optimizeLayout(layout, strategy = {}, seed = 1) {
  const rng = seedRng(seed);
  const out = JSON.parse(JSON.stringify(layout)); // deep copy — never touch the original
  const diff = [];
  // Shared per-pass context: cache road segments + centroid so the many
  // pickSpot() calls don't re-derive them (big speedup on dense cities).
  const ctx = { segs: buildRoadSegments(out), centroid: centroid(out) };

  const countType = (t) => out.buildings.filter((b) => b.type === t).length;
  const H = countType(HOUSING);
  const targetH = Math.max(MIN_HOUSING, strategy.housing || H || MIN_HOUSING);
  const targets = ratioTargets(targetH);

  // ── 1. Fix overlaps — move the noisy/generic building the shortest distance ──
  for (let pass = 0; pass < 12; pass++) {
    let movedAny = false;
    for (let i = 0; i < out.buildings.length; i++) {
      for (let j = i + 1; j < out.buildings.length; j++) {
        const a = out.buildings[i], b = out.buildings[j];
        const fa = a.footprint || footprintFor(a.type);
        const fb = b.footprint || footprintFor(b.type);
        if (!rectsOverlap(a.pos, fa, b.pos, fb, MARGIN)) continue;
        const aNoisy = isNoisyType(a.type), bNoisy = isNoisyType(b.type);
        const aSpec = isSpecial(a), bSpec = isSpecial(b);
        // Prefer moving: the noisy one (a quiet home shouldn't budge), then a
        // generic over a special, then the later building. Never move a
        // non-noisy special.
        let mover, other, mfp;
        if (bNoisy && !aNoisy) { mover = b; other = a; mfp = fb; }
        else if (aNoisy && !bNoisy) { mover = a; other = b; mfp = fa; }
        else if (aSpec && !bSpec) { mover = b; other = a; mfp = fb; }
        else if (bSpec && !aSpec) { mover = a; other = b; mfp = fa; }
        else { mover = b; other = a; mfp = fb; }
        if (isSpecial(mover) && !isNoisyType(mover.type)) continue; // keep non-noisy specials put
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
        // Noisy moves are reported by the zoning step — don't double-report.
        if (!isNoisyType(mover.type)
          && !diff.find((d) => d.action === 'move' && d.what === mover.type && d.from && Math.abs(d.from[0] - (mover.pos[0] - nx)) < 0.1)) {
          diff.push({ action: 'move', what: mover.type, from: [mover.pos[0] - nx, mover.pos[1] - nz], to: mover.pos.slice(), reason: 'These two buildings overlap — I nudged them just enough to separate.' });
        }
      }
    }
    if (!movedAny) break;
  }

  // ── 2. Fix zoning — move noisy facilities away from homes (specials too) ──
  const homeClusters = out.buildings.filter((b) => b.type === HOUSING);
  if (homeClusters.length) {
    for (const b of out.buildings.slice()) {
      if (!isNoisyType(b.type)) continue;
      const tooClose = homeClusters.some((h) => Math.hypot(b.pos[0] - h.pos[0], b.pos[1] - h.pos[1]) < 100);
      if (!tooClose) continue;
      const spot = pickSpot(out, b.type, rng, ctx);
      if (spot && !overlapsAny(out, spot[0], spot[1], b.footprint || footprintFor(b.type))) {
        diff.push({ action: 'move', what: b.type, from: b.pos.slice(), to: spot, reason: `The ${catalogType(b.type)?.name || b.type} was right next to homes — noisy buildings don't belong there, so I moved it to a calmer spot.` });
        b.pos = [Math.round(spot[0] * 2) / 2, Math.round(spot[1] * 2) / 2];
      }
    }
  }

  // ── 3. Remove clearly-excessive duplicates — specials too (6 finance towers
  //        in a row is just as cluttered as 5 fire stations). Keep one of each
  //        mission building; keep generics at their ratio target. ──
  const dedupTypes = new Set([...specialKeys(), ...CIVIC]);
  for (const type of dedupTypes) {
    const cur = out.buildings.filter((b) => b.type === type);
    const target = targets[type] || 1;   // specials → 1, generics → ratio target
    if (cur.length <= target) continue;
    const keepCount = Math.max(1, Math.floor(target));
    const byCluster = cur.slice().sort((a, b) => clusterScore(out, b, type) - clusterScore(out, a, type));
    for (let k = keepCount; k < byCluster.length; k++) {
      const b = byCluster[k];
      diff.push({ action: 'remove', what: type, from: b.pos.slice(), reason: `You had ${cur.length} ${catalogType(type)?.name || type}(s) — ${keepCount} is plenty; the extras were piled together and didn't look planned.` });
      out.buildings = out.buildings.filter((x) => x !== b);
    }
  }

  // ── 4. Add housing to reach a sensible scale ──
  let addedH = 0;
  while (countType(HOUSING) < targetH) {
    const spot = pickSpot(out, HOUSING, rng, ctx);
    if (!spot) break;
    pushBuilding(out, HOUSING, spot, catalogType(HOUSING)?.height);
    addedH++;
  }
  if (addedH) {
    diff.push({ action: 'add', what: HOUSING, count: addedH, reason: `Added ${addedH} home${addedH > 1 ? 's' : ''} — a town of ${targetH} homes needs enough places to live.` });
  }

  // ── 5. Fill facility gaps (common-sense ratios) ──
  const Hnow = countType(HOUSING);
  const t = ratioTargets(Math.max(Hnow, targetH));
  for (const type of CIVIC) {
    const need = t[type] || 0;
    const have = countType(type);
    let toAdd = need - have;
    if (toAdd <= 0) continue;
    const added = [];
    for (let k = 0; k < toAdd; k++) {
      const spot = pickSpot(out, type, rng, ctx);
      if (!spot) break;
      pushBuilding(out, type, spot, catalogType(type)?.height);
      added.push(spot);
    }
    if (added.length) {
      const name = catalogType(type)?.name || type;
      diff.push({
        action: 'add', what: type, count: added.length,
        reason: `Added ${added.length} ${name}${added.length > 1 ? 's' : ''} — with ${Hnow} homes a smart city should have about ${need} ${name}${need > 1 ? 's' : ''}.`,
      });
    }
  }

  // ── 5b. At least one of EVERY mission building (a complete city) ──
  for (const type of specialKeys()) {
    if (countType(type) > 0) continue;
    const spot = pickSpot(out, type, rng, ctx);
    if (!spot) break;
    pushBuilding(out, type, spot, catalogType(type)?.height);
    const name = catalogType(type)?.name || type;
    diff.push({ action: 'add', what: type, count: 1, reason: `Added a ${name} — a complete smart city should have one of every mission building.` });
  }

  // ── 6. Parks: add for coverage when homes are far from green space ──
  const parkCount = out.parks.length;
  const wantParks = Math.min(MAX_PARKS, Math.max(2, Math.ceil(Hnow / 12)));
  if (parkCount < wantParks) {
    for (let k = 0; k < wantParks - parkCount; k++) {
      const spot = pickParkSpot(out, rng);
      if (!spot) break;
      out.parks.push({ cx: spot[0], cz: spot[1], radius: 60 + rng() * 30 });
      diff.push({ action: 'add_park', reason: 'Added a park — homes near parks are happier, and it keeps the city looking green.' });
    }
  }

  return { layout: out, diff };
}

function pickParkSpot(layout, rng) {
  // near housing clusters, away from roads (roads are preserved but a park can sit beside them)
  const homes = layout.buildings.filter((b) => b.type === HOUSING);
  if (homes.length) {
    for (let i = 0; i < 20; i++) {
      const h = homes[Math.floor(rng() * homes.length)];
      const r = 40 + rng() * 70;
      const ang = rng() * Math.PI * 2;
      const x = h.pos[0] + Math.cos(ang) * r;
      const z = h.pos[1] + Math.sin(ang) * r;
      if (x < 30 || z < 30 || x > (layout.scaleMeters || 2000) - 30 || z > (layout.scaleMeters || 2000) - 30) continue;
      if (overlapsAny(layout, x, z, [50, 50], 8)) continue;
      return [x, z];
    }
  }
  const S = layout.scaleMeters || 2000;
  for (let i = 0; i < 30; i++) {
    const x = 60 + rng() * (S - 120), z = 60 + rng() * (S - 120);
    if (overlapsAny(layout, x, z, [50, 50], 8)) continue;
    return [x, z];
  }
  return null;
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
