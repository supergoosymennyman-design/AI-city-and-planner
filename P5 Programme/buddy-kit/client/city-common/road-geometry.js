/**
 * city-common/road-geometry.js — pure road geometry shared by the 2D planner
 * and the city optimiser.
 *
 * Two jobs, one place so the maths is tested once:
 *
 *   1. CLEARANCE — is a building footprint sitting on (or too close to) a road
 *      ribbon? And if so, where can it move with the SMALLEST nudge to clear
 *      every road and every other building? Used by optimize.js to fix the
 *      "house on a road" class of bad road logic.
 *
 *   2. DRAWING/TIDY — simplify freehand strokes (Ramer–Douglas–Peucker),
 *      soft-snap near-45° segments, merge/project road endpoints into real
 *      junctions (T-junctions split the target polyline), and sample a smooth
 *      centripetal Catmull-Rom curve for the Curved road tool.
 *
 * Everything here is pure and deterministic: no randomness, no time, no DOM,
 * no global state. Every mutating-looking helper returns fresh arrays.
 *
 * Coordinate space: plan (x, y) metres, in-bounds [0, layout.scaleMeters].
 */

import { ROAD_WIDTH } from './layout.js';

/** Clear ground (metres) a footprint must keep beyond the road ribbon edge. */
export const ROAD_CLEARANCE_MARGIN = 3;

/** Must stay in step with optimize.js MARGIN (building-to-building gap). */
export const BUILDING_OVERLAP_MARGIN = 4;

/** Tidy defaults. Exposed so tests and the planner can tune without guessing. */
export const TIDY_DEFAULTS = {
  simplifyEps: 10,       // RDP epsilon (metres)
  angleTolDeg: 10,       // snap a segment to the nearest 45° if within this
  connectDist: 30,       // endpoint→endpoint merge distance (metres)
  tJunctionDist: 20,     // endpoint→other-road projection distance (metres)
  minAngleSegLen: 8,     // don't angle-snap segments shorter than this
  minSpacing: 8,         // sampled-curve + cleanup minimum vertex spacing
  maxRoadPoints: 4000,   // matches layout.js MAX_ROAD_POINTS
};

// ─── Small primitives ───────────────────────────────────────────────────

/** Closest point on segment A→B to P. t is clamped to [0,1]. */
export function pointToSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
  const x = ax + t * dx, z = az + t * dz;
  return { x, z, t, d: Math.hypot(px - x, pz - z) };
}

/** Distance from P to segment A→B (handles a zero-length segment). */
export function distPointToSegment(px, pz, ax, az, bx, bz) {
  if (ax === bx && az === bz) return Math.hypot(px - ax, pz - az);
  return pointToSegment(px, pz, ax, az, bx, bz).d;
}

/** Clamp P to the axis-aligned rect centred (cx,cz) with half-extents hw,hh. */
function clampToRect(px, pz, cx, cz, hw, hh) {
  return { x: Math.max(cx - hw, Math.min(cx + hw, px)), z: Math.max(cz - hh, Math.min(cz + hh, pz)) };
}

function distPointToRect(px, pz, cx, cz, hw, hh) {
  const p = clampToRect(px, pz, cx, cz, hw, hh);
  return Math.hypot(px - p.x, pz - p.z);
}

/**
 * Does segment A→B intersect the axis-aligned rect? Liang–Barsky slab clip.
 * Correct for a segment fully inside the rect too.
 */
export function segmentIntersectsRect(ax, az, bx, bz, cx, cz, hw, hh) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  const p = [-dx, dx, -dz, dz];
  const q = [ax - (cx - hw), (cx + hw) - ax, az - (cz - hh), (cz + hh) - az];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;          // parallel and outside this slab
    } else {
      const r = q[i] / p[i];
      if (p[i] < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
      else { if (r < t0) return false; if (r < t1) t1 = r; }
    }
  }
  return t0 <= t1;
}

/**
 * Exact distance between an axis-aligned rect (centre cx,cz; footprint [w,h])
 * and a segment A→B. 0 when they intersect. Disjoint convex shapes attain the
 * minimum at a vertex→edge pair, so checking segment endpoints against the rect
 * and the 4 rect corners against the segment is exact.
 */
export function rectSegmentDistance(cx, cz, fp, ax, az, bx, bz) {
  const hw = fp[0] / 2, hh = fp[1] / 2;
  if (segmentIntersectsRect(ax, az, bx, bz, cx, cz, hw, hh)) return 0;
  let d = Math.min(
    distPointToRect(ax, az, cx, cz, hw, hh),
    distPointToRect(bx, bz, cx, cz, hw, hh),
  );
  const corners = [[cx - hw, cz - hh], [cx + hw, cz - hh], [cx + hw, cz + hh], [cx - hw, cz + hh]];
  for (const [vx, vz] of corners) d = Math.min(d, distPointToSegment(vx, vz, ax, az, bx, bz));
  return d;
}

/** Footprint of a building (saved footprint, else the 20×20 default). */
export function footprintOf(b) {
  const fp = b && b.footprint;
  return Array.isArray(fp) && fp.length === 2 && fp[0] > 0 && fp[1] > 0 ? fp : [20, 20];
}

/** Road half-width from a valid saved width, else its class, else residential. */
export function roadHalfWidth(road) {
  let w = road && Number.isFinite(road.width) && road.width > 0 ? road.width : 0;
  if (!w) w = (road && ROAD_WIDTH[road.class]) || ROAD_WIDTH.residential;
  return w / 2;
}

/** Flatten a layout (or a road list) into road bands with per-segment half-width. */
export function roadBands(roadsOrLayout) {
  const roads = Array.isArray(roadsOrLayout) ? roadsOrLayout : (roadsOrLayout && roadsOrLayout.roads) || [];
  const bands = [];
  for (const r of roads) {
    if (!r || !Array.isArray(r.points)) continue;
    const half = roadHalfWidth(r);
    const pts = r.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (!a || !b) continue;
      if (a[0] === b[0] && a[1] === b[1]) continue;   // zero-length — skip
      bands.push({ ax: a[0], az: a[1], bx: b[0], bz: b[1], half });
    }
  }
  return bands;
}

// ─── Clearance ──────────────────────────────────────────────────────────

/** Gap (metres) between a footprint and the nearest road EDGE. Infinity = no roads. */
export function rectRoadClearance(cx, cz, fp, bands) {
  let best = Infinity;
  for (const bd of bands) {
    const d = rectSegmentDistance(cx, cz, fp, bd.ax, bd.az, bd.bx, bd.bz) - bd.half;
    if (d < best) best = d;
    if (best <= 0) break;   // already on a road — can't get smaller
  }
  return best;
}

/** True when a footprint is on / too close to any road ribbon. */
export function isOnRoad(cx, cz, fp, bands, margin = ROAD_CLEARANCE_MARGIN) {
  return rectRoadClearance(cx, cz, fp, bands) < margin;
}

/** Indices of buildings whose footprint is on / too close to a road. */
export function onRoadBuildingIndices(layout, margin = ROAD_CLEARANCE_MARGIN) {
  const bands = roadBands(layout.roads);
  if (!bands.length) return [];
  const out = [];
  (layout.buildings || []).forEach((b, i) => {
    if (b && Array.isArray(b.pos) && isOnRoad(b.pos[0], b.pos[1], footprintOf(b), bands, margin)) out.push(i);
  });
  return out;
}

function rectsOverlap(ax, az, afp, bx, bz, bfp, margin) {
  return Math.abs(ax - bx) < (afp[0] + bfp[0]) / 2 + margin
    && Math.abs(az - bz) < (afp[1] + bfp[1]) / 2 + margin;
}

/** Nearest band to a footprint (by rect distance); null when there are none. */
function nearestBand(cx, cz, fp, bands) {
  let best = null, bestD = Infinity;
  for (const bd of bands) {
    const d = rectSegmentDistance(cx, cz, fp, bd.ax, bd.az, bd.bx, bd.bz);
    if (d < bestD) { bestD = d; best = bd; }
  }
  return best;
}

/**
 * Find the smallest deterministic nudge that moves `b` fully clear of every
 * road band (>= margin to the ribbon edge) without overlapping any building in
 * `others`. Candidates are snapped to the 0.5 m grid (matching optimize.js) so
 * the result is stable across engines. Returns {x,z} or null when no spot
 * exists inside the search cap (caller should leave the building and flag it).
 *
 * `others` must EXCLUDE `b` itself.
 */
export function clearanceOffset(b, others, bands, opts = {}) {
  const fp = footprintOf(b);
  const cx0 = b.pos[0], cz0 = b.pos[1];
  const margin = opts.margin ?? ROAD_CLEARANCE_MARGIN;
  const overlapMargin = opts.overlapMargin ?? BUILDING_OVERLAP_MARGIN;
  const scale = opts.scale ?? 2000;
  const start = rectRoadClearance(cx0, cz0, fp, bands);
  if (start >= margin) return null;                       // already clear

  // Correct the deficit for the footprint's own half-extent: a building whose
  // centre is ON a road must move by (roadHalf + margin + halfFootprint) at
  // least, so seed the search above the worst-case axis half-extent.
  const deficit = margin - start;
  const seed = Math.max(2, Math.ceil((deficit + Math.max(fp[0], fp[1]) / 2) / 5) * 5);
  const maxRadius = seed + 60;

  // Prefer stepping off SIDEWAYS from the nearest road, then fan out.
  const near = nearestBand(cx0, cz0, fp, bands);
  const angles = [];
  if (near) {
    const ang = Math.atan2(near.bz - near.az, near.bx - near.ax) + Math.PI / 2;
    angles.push(ang, ang + Math.PI);
    for (let k = 1; k <= 8; k++) {
      const off = k * (Math.PI / 12);   // 15°
      angles.push(ang + off, ang - off, ang + Math.PI + off, ang + Math.PI - off);
    }
  } else {
    for (let k = 0; k < 24; k++) angles.push(k * (Math.PI / 12));
  }

  const snap = (v) => Math.round(v * 2) / 2;
  for (let r = seed; r <= maxRadius; r += 5) {
    for (const ang of angles) {
      const x = snap(cx0 + Math.cos(ang) * r);
      const z = snap(cz0 + Math.sin(ang) * r);
      if (x < 0 || z < 0 || x > scale || z > scale) continue;
      if (rectRoadClearance(x, z, fp, bands) < margin) continue;
      let bad = false;
      for (const o of others || []) {
        if (!o || !Array.isArray(o.pos)) continue;
        if (rectsOverlap(x, z, fp, o.pos[0], o.pos[1], footprintOf(o), overlapMargin)) { bad = true; break; }
      }
      if (!bad) return { x, z };
    }
  }
  return null;
}

// ─── Simplification + angle snap ────────────────────────────────────────

/**
 * Ramer–Douglas–Peucker simplification. Endpoints are always kept; returns a
 * fresh array. A polyline of <= 2 points is returned unchanged (copied).
 */
export function simplifyPolyline(points, eps = TIDY_DEFAULTS.simplifyEps) {
  const pts = (points || []).map((p) => [p[0], p[1]]);
  if (pts.length <= 2 || !(eps > 0)) return pts;
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    let maxD = -1, idx = -1;
    for (let k = i + 1; k < j; k++) {
      const d = distPointToSegment(pts[k][0], pts[k][1], pts[i][0], pts[i][1], pts[j][0], pts[j][1]);
      if (d > maxD) { maxD = d; idx = k; }
    }
    if (maxD > eps && idx > i) {
      keep[idx] = true;
      stack.push([i, idx], [idx, j]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

function angleSnapSegmentLength(points, i) {
  return Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]);
}

/**
 * Soft-snap each segment to the nearest multiple of 45° when it is within
 * `tolDeg`. Works on COORDINATES (no trig) so the polyline stays continuous and
 * the shift is tiny. Short segments are left alone.
 */
export function softSnapAngles(points, tolDeg = TIDY_DEFAULTS.angleTolDeg, minLen = TIDY_DEFAULTS.minAngleSegLen) {
  const pts = (points || []).map((p) => [p[0], p[1]]);
  if (pts.length < 2 || !(tolDeg > 0)) return pts;
  const tol = (tolDeg * Math.PI) / 180;
  const step = Math.PI / 4;
  for (let i = 0; i < pts.length - 1; i++) {
    if (angleSnapSegmentLength(pts, i) < minLen) continue;
    const dx = pts[i + 1][0] - pts[i][0];
    const dz = pts[i + 1][1] - pts[i][1];
    if (!dx && !dz) continue;
    const ang = Math.atan2(dz, dx);
    const k = Math.round(ang / step);
    if (Math.abs(ang - k * step) > tol) continue;
    const q = ((k % 4) + 4) % 4;
    if (q === 0) {
      pts[i + 1][1] = pts[i][1];                 // 0° / 180° → horizontal
    } else if (q === 2) {
      pts[i + 1][0] = pts[i][0];                 // 90° / 270° → vertical
    } else {                                     // 45° / 135° → equal |dx|,|dz|
      const m = (Math.abs(dx) + Math.abs(dz)) / 2;
      pts[i + 1][0] = pts[i][0] + (dx < 0 ? -1 : 1) * m;
      pts[i + 1][1] = pts[i][1] + (dz < 0 ? -1 : 1) * m;
    }
  }
  return pts;
}

// ─── Endpoint merging + T-junction projection ───────────────────────────

/** Remove consecutive duplicates/near-duplicates; guarantees rounding later. */
function cleanPolyline(points, minSpacing) {
  const out = [];
  for (const p of points) {
    const x = p[0], z = p[1];
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    const last = out[out.length - 1];
    if (last && Math.hypot(x - last[0], z - last[1]) < minSpacing) continue;
    out.push([x, z]);
  }
  return out;
}

function roundPoint(p) { return [Math.round(p[0]), Math.round(p[1])]; }

/**
 * Connect rough roads into a real network:
 *   1. merge endpoints of DIFFERENT roads within `connectDist` to the first
 *      endpoint seen (deterministic, no centroid maths → nothing leaves bounds);
 *   2. project each endpoint that lands within `tJunctionDist` of another
 *      road onto that road and INSERT the point as a vertex there — an explicit
 *      shared node for the walk graph and the 3D junction builder.
 * Never closes a single road onto itself. Returns fresh roads + stats.
 */
export function connectEndpoints(roads, opts = {}) {
  const connectDist = opts.connectDist ?? TIDY_DEFAULTS.connectDist;
  const tJunctionDist = opts.tJunctionDist ?? TIDY_DEFAULTS.tJunctionDist;
  const scale = opts.scale ?? 2000;
  const list = (roads || []).map((r) => ({
    width: r.width, class: r.class,
    points: (r.points || []).map((p) => [p[0], p[1]]),
  })).filter((r) => r.points.length >= 2);

  const stats = { endpointMerges: 0, tJunctions: 0 };

  // 1. Endpoint merge (different roads only).
  const reps = [];   // { x, z, road, end }
  for (let ri = 0; ri < list.length; ri++) {
    const pts = list[ri].points;
    for (const end of [0, pts.length - 1]) {
      const p = pts[end];
      let found = null;
      for (const rep of reps) {
        if (rep.road === ri) continue;                     // never self-close
        if (Math.hypot(rep.x - p[0], rep.z - p[1]) <= connectDist) { found = rep; break; }
      }
      if (found) {
        if (p[0] !== found.x || p[1] !== found.z) { list[ri].points[end] = [found.x, found.z]; stats.endpointMerges++; }
      } else {
        reps.push({ x: p[0], z: p[1], road: ri, end });
      }
    }
  }

  // 2. T-junction projection. Collect first, then apply (so segment indices are stable).
  const inserts = new Map();   // targetRoadIndex -> [{ seg, t, x, z }]
  for (let ri = 0; ri < list.length; ri++) {
    const pts = list[ri].points;
    for (const end of [0, pts.length - 1]) {
      const p = pts[end];
      let best = null;
      for (let rj = 0; rj < list.length; rj++) {
        if (rj === ri) continue;
        const tp = list[rj].points;
        for (let k = 0; k < tp.length - 1; k++) {
          const proj = pointToSegment(p[0], p[1], tp[k][0], tp[k][1], tp[k + 1][0], tp[k + 1][1]);
          if (proj.d > tJunctionDist) continue;
          if (proj.t <= 0.02 || proj.t >= 0.98) continue;   // don't double-snap an end
          if (!best || proj.d < best.d) best = { d: proj.d, road: rj, seg: k, t: proj.t, x: proj.x, z: proj.z };
        }
      }
      if (!best) continue;
      // Move the endpoint onto the target road (0.5 m grid, in bounds).
      let x = Math.round(best.x * 2) / 2, z = Math.round(best.z * 2) / 2;
      x = Math.max(0, Math.min(scale, x)); z = Math.max(0, Math.min(scale, z));
      list[ri].points[end] = [x, z];
      const arr = inserts.get(best.road) || [];
      arr.push({ seg: best.seg, t: best.t, x, z });
      inserts.set(best.road, arr);
      stats.tJunctions++;
    }
  }
  for (const [rj, arr] of inserts) {
    const tp = list[rj].points;
    const bySeg = new Map();
    for (const it of arr) {
      const key = it.seg;
      const bucket = bySeg.get(key) || [];
      // Skip an insertion that duplicates an existing vertex of this road.
      if (tp.some((v) => Math.hypot(v[0] - it.x, v[1] - it.z) < 0.5)) continue;
      bucket.push(it);
      bySeg.set(key, bucket);
    }
    if (!bySeg.size) continue;
    const rebuilt = [];
    for (let k = 0; k < tp.length - 1; k++) {
      rebuilt.push(tp[k]);
      const bucket = bySeg.get(k);
      if (bucket) {
        bucket.sort((a, b) => a.t - b.t);
        for (const it of bucket) rebuilt.push([it.x, it.z]);
      }
    }
    rebuilt.push(tp[tp.length - 1]);
    list[rj].points = rebuilt;
  }

  return { roads: list, stats };
}

// ─── Junction detection + opt-in weld ───────────────────────────────────
// The planner stores roads as independent polylines, so a child who "joins"
// two roads by eye leaves a few metres of air between them. These two helpers
// find those loose connections (corners, T ends, crossings, unclosed loops)
// and — only when the caller explicitly asks — weld them into one network with
// real shared vertices. Because the vertices then match exactly, the traffic
// graph, the walk graph and the junction painter all agree on where roads meet.
//
// Nothing here ever runs by itself: the planner shows the child WHAT it found
// and waits for approval. A deliberate gap wider than the tolerance is left
// alone, so a student can still build disconnected roads on purpose.

/** Normalise a layout (or plain roads array) into indexed working roads. */
function roadListOf(layoutOrRoads) {
  const roads = Array.isArray(layoutOrRoads) ? layoutOrRoads : (layoutOrRoads && layoutOrRoads.roads) || [];
  const out = [];
  roads.forEach((r, roadId) => {
    if (!r || !Array.isArray(r.points) || r.points.length < 2) return;
    out.push({
      roadId, width: r.width, class: r.class, half: roadHalfWidth(r),
      points: r.points.map((p) => [p[0], p[1]]),
    });
  });
  return out;
}

/** Axis-aligned bounds of a road polyline, padded. */
function roadBounds(points, pad = 0) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of points) {
    if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
    if (p[1] < minZ) minZ = p[1]; if (p[1] > maxZ) maxZ = p[1];
  }
  return { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad };
}
function boundsOverlap(a, b) {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
}
function boundsOverlapPad(a, b, pad) {
  return a.minX - pad <= b.maxX && a.maxX + pad >= b.minX && a.minZ - pad <= b.maxZ && a.maxZ + pad >= b.minZ;
}

/** Width-aware snap radius, capped so two wide roads never join from far away. */
function snapRadius(base, halfA, halfB, cap = 60) {
  return Math.min(cap, Math.max(base, (halfA || 0) + (halfB || 0)));
}

/** Proper interior crossing of two segments (null for parallel or end-touches,
 *  which the endpoint/T passes handle instead). */
function crossingPoint(a, b, c, d) {
  const rx = b[0] - a[0], rz = b[1] - a[1];
  const sx = d[0] - c[0], sz = d[1] - c[1];
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const qx = c[0] - a[0], qz = c[1] - a[1];
  const t = (qx * sz - qz * sx) / den;
  const u = (qx * rz - qz * rx) / den;
  if (t <= 0.02 || t >= 0.98 || u <= 0.02 || u >= 0.98) return null;
  return { x: a[0] + rx * t, z: a[1] + rz * t, t, u };
}

const halfSnap = (v) => Math.round(v * 2) / 2;

/**
 * Find every place where two roads nearly join (or cross) WITHOUT changing
 * anything. Read-only, deterministic, safe to call on every planner render.
 * Returns { candidates:[{x,z,kind,roadIds,distance}], stats }.
 */
export function detectJunctions(layoutOrRoads, opts = {}) {
  const roads = roadListOf(layoutOrRoads);
  const scale = opts.scale ?? (layoutOrRoads && layoutOrRoads.scaleMeters) ?? 2000;
  const endpointBase = opts.endpointDist ?? TIDY_DEFAULTS.connectDist;
  const tBase = opts.tJunctionDist ?? TIDY_DEFAULTS.tJunctionDist;
  const candidates = [];
  const seen = new Set();
  const push = (x, z, kind, roadIds, distance) => {
    const cx = halfSnap(Math.max(0, Math.min(scale, x)));
    const cz = halfSnap(Math.max(0, Math.min(scale, z)));
    const k = `${cx},${cz}|${kind}`;
    if (seen.has(k)) return;
    seen.add(k);
    candidates.push({ x: cx, z: cz, kind, roadIds, distance });
  };
  const bounds = roads.map((r) => roadBounds(r.points));

  // Corners / straight joins: two different road ends near each other.
  for (let i = 0; i < roads.length; i++) {
    for (let j = i + 1; j < roads.length; j++) {
      const dist = snapRadius(endpointBase, roads[i].half, roads[j].half);
      if (!boundsOverlapPad(bounds[i], bounds[j], dist)) continue;
      const a = roads[i].points, b = roads[j].points;
      for (const ea of [0, a.length - 1]) {
        for (const eb of [0, b.length - 1]) {
          const d = Math.hypot(a[ea][0] - b[eb][0], a[ea][1] - b[eb][1]);
          if (d > 1e-9 && d <= dist) push((a[ea][0] + b[eb][0]) / 2, (a[ea][1] + b[eb][1]) / 2, 'L', [roads[i].roadId, roads[j].roadId], d);
        }
      }
    }
  }

  // T-junctions: a road end near the MIDDLE of another road.
  for (let i = 0; i < roads.length; i++) {
    for (const ei of [0, roads[i].points.length - 1]) {
      const p = roads[i].points[ei];
      const near = roadBounds([p], snapRadius(tBase, roads[i].half, roads[i].half));
      for (let j = 0; j < roads.length; j++) {
        if (j === i) continue;
        if (!boundsOverlap(near, bounds[j])) continue;
        const tp = roads[j].points;
        const dist = snapRadius(tBase, roads[i].half, roads[j].half);
        for (let k = 0; k < tp.length - 1; k++) {
          const proj = pointToSegment(p[0], p[1], tp[k][0], tp[k][1], tp[k + 1][0], tp[k + 1][1]);
          if (proj.t <= 0.02 || proj.t >= 0.98) continue;
          if (proj.d > dist) continue;
          push(proj.x, proj.z, 'T', [roads[i].roadId, roads[j].roadId], proj.d);
        }
      }
    }
  }

  // Crossings: two roads properly cross.
  for (let i = 0; i < roads.length; i++) {
    for (let j = i + 1; j < roads.length; j++) {
      if (!boundsOverlap(bounds[i], bounds[j])) continue;
      const a = roads[i].points, b = roads[j].points;
      for (let ai = 0; ai < a.length - 1; ai++) {
        for (let bi = 0; bi < b.length - 1; bi++) {
          const hit = crossingPoint(a[ai], a[ai + 1], b[bi], b[bi + 1]);
          if (hit) push(hit.x, hit.z, 'X', [roads[i].roadId, roads[j].roadId], 0);
        }
      }
    }
  }

  // Unclosed loops: one road whose two ends nearly meet (a drawn ring/rectangle).
  for (let i = 0; i < roads.length; i++) {
    const p = roads[i].points;
    const d = Math.hypot(p[0][0] - p[p.length - 1][0], p[0][1] - p[p.length - 1][1]);
    if (d > 1e-9 && d <= snapRadius(endpointBase, roads[i].half, roads[i].half)) {
      push((p[0][0] + p[p.length - 1][0]) / 2, (p[0][1] + p[p.length - 1][1]) / 2, 'loop', [roads[i].roadId], d);
    }
  }

  const stats = { endpointMerges: 0, tJunctions: 0, crossings: 0, loops: 0, total: candidates.length };
  for (const c of candidates) {
    if (c.kind === 'L') stats.endpointMerges++;
    else if (c.kind === 'T') stats.tJunctions++;
    else if (c.kind === 'X') stats.crossings++;
    else stats.loops++;
  }
  return { candidates, stats };
}

/**
 * Weld every detected junction into the roads, returning fresh roads with real
 * shared vertices plus the junction list for display. Pure: never mutates the
 * input. `opts.closeLoops` (default false) also snaps a road's own two ends
 * together so a drawn ring becomes a closed loop. Honours the same point cap
 * and landmark protection as tidyRoads.
 */
export function materializeJunctions(layoutOrRoads, opts = {}) {
  const scale = opts.scale ?? (layoutOrRoads && layoutOrRoads.scaleMeters) ?? 2000;
  const endpointBase = opts.endpointDist ?? TIDY_DEFAULTS.connectDist;
  const tBase = opts.tJunctionDist ?? TIDY_DEFAULTS.tJunctionDist;
  const closeLoops = !!opts.closeLoops;
  const maxPoints = opts.maxRoadPoints ?? TIDY_DEFAULTS.maxRoadPoints;
  const protectedFootprints = opts.protectedFootprints || [];

  const source = roadListOf(layoutOrRoads);
  const originals = source.map((r) => ({ width: r.width, class: r.class, points: r.points.map((p) => [p[0], p[1]]) }));
  if (!source.length) return { roads: [], junctions: [], stats: emptyWeldStats() };
  const list = source.map((r) => ({ width: r.width, class: r.class, half: r.half, points: r.points.map((p) => [p[0], p[1]]) }));
  const record = [];
  const addRecord = (x, z, kind, roadIds) => record.push({ x: halfSnap(Math.max(0, Math.min(scale, x))), z: halfSnap(Math.max(0, Math.min(scale, z))), kind, roadIds });

  // 1. Close a drawn ring (opt-in) — never a tiny spur that happens to touch.
  if (closeLoops) {
    for (let i = 0; i < list.length; i++) {
      const p = list[i].points;
      const d = Math.hypot(p[0][0] - p[p.length - 1][0], p[0][1] - p[p.length - 1][1]);
      if (d < 1e-9 || d > snapRadius(endpointBase, list[i].half, list[i].half)) continue;
      let len = 0;
      for (let k = 0; k < p.length - 1; k++) len += Math.hypot(p[k + 1][0] - p[k][0], p[k + 1][1] - p[k][1]);
      if (len < Math.max(40, d * 4)) continue;
      p[p.length - 1] = [p[0][0], p[0][1]];
      addRecord(p[0][0], p[0][1], 'loop', [source[i].roadId]);
    }
  }

  // 2. Merge near endpoints of DIFFERENT roads (corners / straight joins).
  const reps = [];
  for (let i = 0; i < list.length; i++) {
    const p = list[i].points;
    for (const end of [0, p.length - 1]) {
      const pt = p[end];
      let found = null;
      for (const rep of reps) {
        if (rep.road === i) continue;
        if (Math.hypot(rep.x - pt[0], rep.z - pt[1]) <= snapRadius(endpointBase, list[i].half, rep.half)) { found = rep; break; }
      }
      if (found) {
        if (pt[0] !== found.x || pt[1] !== found.z) { p[end] = [found.x, found.z]; addRecord(found.x, found.z, 'L', [found.roadId, source[i].roadId]); }
      } else {
        reps.push({ x: pt[0], z: pt[1], road: i, roadId: source[i].roadId, half: list[i].half });
      }
    }
  }

  // 3. Project a loose end onto another road body (T-junctions), splitting it.
  const applyInserts = (roadIdx, arr) => {
    const tp = list[roadIdx].points;
    const bySeg = new Map();
    for (const it of arr) {
      if (tp.some((v) => Math.hypot(v[0] - it.x, v[1] - it.z) < 0.5)) continue;
      const bucket = bySeg.get(it.seg) || [];
      bucket.push(it);
      bySeg.set(it.seg, bucket);
    }
    if (!bySeg.size) return;
    const rebuilt = [];
    for (let k = 0; k < tp.length - 1; k++) {
      rebuilt.push(tp[k]);
      const bucket = bySeg.get(k);
      if (bucket) {
        bucket.sort((a, b) => a.t - b.t);
        for (const it of bucket) rebuilt.push([it.x, it.z]);
      }
    }
    rebuilt.push(tp[tp.length - 1]);
    list[roadIdx].points = rebuilt;
  };
  const tInserts = new Map();
  for (let i = 0; i < list.length; i++) {
    const p = list[i].points;
    for (const end of [0, p.length - 1]) {
      const pt = p[end];
      let best = null;
      for (let j = 0; j < list.length; j++) {
        if (j === i) continue;
        const dist = snapRadius(tBase, list[i].half, list[j].half);
        const tp = list[j].points;
        for (let k = 0; k < tp.length - 1; k++) {
          const proj = pointToSegment(pt[0], pt[1], tp[k][0], tp[k][1], tp[k + 1][0], tp[k + 1][1]);
          if (proj.t <= 0.02 || proj.t >= 0.98 || proj.d > dist) continue;
          if (!best || proj.d < best.d) best = { d: proj.d, road: j, seg: k, t: proj.t, x: proj.x, z: proj.z };
        }
      }
      if (!best) continue;
      const x = halfSnap(Math.max(0, Math.min(scale, best.x)));
      const z = halfSnap(Math.max(0, Math.min(scale, best.z)));
      p[end] = [x, z];
      const arr = tInserts.get(best.road) || [];
      arr.push({ seg: best.seg, t: best.t, x, z });
      tInserts.set(best.road, arr);
      addRecord(x, z, 'T', [source[i].roadId, source[best.road].roadId]);
    }
  }
  for (const [rj, arr] of tInserts) applyInserts(rj, arr);

  // 4. Split proper crossings so BOTH roads carry the shared node.
  const xInserts = new Map();
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const A = list[i].points, B = list[j].points;
      for (let ai = 0; ai < A.length - 1; ai++) {
        for (let bi = 0; bi < B.length - 1; bi++) {
          const hit = crossingPoint(A[ai], A[ai + 1], B[bi], B[bi + 1]);
          if (!hit) continue;
          const x = halfSnap(Math.max(0, Math.min(scale, hit.x)));
          const z = halfSnap(Math.max(0, Math.min(scale, hit.z)));
          const ka = xInserts.get(i) || []; ka.push({ seg: ai, t: hit.t, x, z }); xInserts.set(i, ka);
          const kb = xInserts.get(j) || []; kb.push({ seg: bi, t: hit.u, x, z }); xInserts.set(j, kb);
          addRecord(x, z, 'X', [source[i].roadId, source[j].roadId]);
        }
      }
    }
  }
  for (const [ri, arr] of xInserts) applyInserts(ri, arr);

  // 5. Clean + clamp + round. A dropped near-duplicate vertex is harmless: the
  //    moved endpoint still lies exactly on the target segment, so the runtime
  //    graph re-derives that node from geometry anyway.
  let roads = list.map((r, i) => {
    let pts = cleanPolyline(r.points, 1).map((p) => [Math.max(0, Math.min(scale, p[0])), Math.max(0, Math.min(scale, p[1]))]);
    pts = cleanPolyline(pts, 1).map(roundPoint);
    if (pts.length < 2) pts = originals[i].points.map(roundPoint);
    return { width: r.width, class: r.class, points: pts };
  });

  // Hard point cap: if welding exploded the vertex count, keep the safe original.
  const total = roads.reduce((n, r) => n + r.points.length, 0);
  if (total > maxPoints) roads = originals.map((r) => ({ width: r.width, class: r.class, points: r.points.map(roundPoint) }));

  // Never route a welded road over a protected landmark it did not already cover.
  if (protectedFootprints.length) {
    const guarded = protectedFootprints.map((p) => ({ pos: p.pos, footprint: footprintOf(p) }));
    roads = roads.map((r, i) => {
      const covers = guarded.some((b) => rectRoadClearance(b.pos[0], b.pos[1], b.footprint, roadBands([r])) < 0);
      if (!covers) return r;
      const already = guarded.some((b) => rectRoadClearance(b.pos[0], b.pos[1], b.footprint, roadBands([originals[i]])) < 0);
      return already ? r : { width: r.width, class: r.class, points: originals[i].points.map(roundPoint) };
    });
  }

  const stats = {
    endpointMerges: record.filter((r) => r.kind === 'L').length,
    tJunctions: record.filter((r) => r.kind === 'T').length,
    crossings: record.filter((r) => r.kind === 'X').length,
    loops: record.filter((r) => r.kind === 'loop').length,
    pointsBefore: originals.reduce((n, r) => n + r.points.length, 0),
    pointsAfter: roads.reduce((n, r) => n + r.points.length, 0),
  };
  return { roads, junctions: dedupeJunctions(record), stats };
}

function emptyWeldStats() {
  return { endpointMerges: 0, tJunctions: 0, crossings: 0, loops: 0, pointsBefore: 0, pointsAfter: 0 };
}

function dedupeJunctions(record) {
  const map = new Map();
  for (const j of record) {
    const k = `${j.x},${j.z}`;
    const found = map.get(k);
    if (found) { for (const id of j.roadIds) found.roadIds.add(id); }
    else map.set(k, { x: j.x, z: j.z, kind: j.kind, roadIds: new Set(j.roadIds) });
  }
  return [...map.values()].map((j) => ({ x: j.x, z: j.z, kind: j.kind, roadIds: [...j.roadIds] }));
}

/**
 * Shared vertices of a welded network — the intersection dots the planner
 * draws. A coordinate used by two or more roads is a node; a road whose first
 * and last vertex coincide is a closed loop node. Read-only.
 */
export function junctionNodes(layoutOrRoads) {
  const roads = roadListOf(layoutOrRoads);
  const map = new Map();
  const loops = new Map();
  const add = (x, z, roadId) => {
    const k = `${Math.round(x)},${Math.round(z)}`;
    const found = map.get(k) || { x: Math.round(x), z: Math.round(z), roadIds: new Set() };
    found.roadIds.add(roadId);
    map.set(k, found);
  };
  roads.forEach((r, i) => {
    const id = r.roadId ?? i;
    for (const [x, z] of r.points) add(x, z, id);
    const p = r.points;
    if (p.length > 2 && Math.hypot(p[0][0] - p[p.length - 1][0], p[0][1] - p[p.length - 1][1]) < 0.08) {
      const k = `${Math.round(p[0][0])},${Math.round(p[0][1])}`;
      loops.set(k, { x: Math.round(p[0][0]), z: Math.round(p[0][1]), roadIds: [id] });
    }
  });
  const nodes = [...map.values()]
    .filter((n) => n.roadIds.size >= 2)
    .map((n) => ({ x: n.x, z: n.z, roadIds: [...n.roadIds] }));
  for (const [k, loop] of loops) if (!map.get(k) || map.get(k).roadIds.size < 2) nodes.push(loop);
  return nodes;
}

/**
 * Run the full tidy pipeline: simplify → soft-snap → connect → clean → clamp.
 * `opts.protectedFootprints` is a list of {pos,[footprint]} that must never end
 * up under a road: any tidied road that would cover one is reverted to its
 * ORIGINAL geometry, so a landmark never blocks the rest of the tidy.
 * `opts.maxRoadPoints` bounds the total vertex count.
 */
export function tidyRoads(layout, opts = {}) {
  const scale = layout.scaleMeters || 2000;
  const eps = opts.simplifyEps ?? TIDY_DEFAULTS.simplifyEps;
  const tolDeg = opts.angleTolDeg ?? TIDY_DEFAULTS.angleTolDeg;
  const maxPoints = opts.maxRoadPoints ?? TIDY_DEFAULTS.maxRoadPoints;
  const protectedFootprints = opts.protectedFootprints || [];

  const originals = (layout.roads || []).map((r) => ({
    width: r.width, class: r.class,
    points: (r.points || []).map((p) => [p[0], p[1]]),
  }));

  let roads = originals.map((r) => ({
    width: r.width, class: r.class,
    points: softSnapAngles(simplifyPolyline(r.points, eps), tolDeg),
  }));

  const connected = connectEndpoints(roads, {
    connectDist: opts.connectDist,
    tJunctionDist: opts.tJunctionDist,
    scale,
  });
  roads = connected.roads;

  // Clean + clamp + round; fall back to the original if a road collapsed.
  roads = roads.map((r, i) => {
    let pts = cleanPolyline(r.points, 1).map((p) => [Math.max(0, Math.min(scale, p[0])), Math.max(0, Math.min(scale, p[1]))]);
    pts = cleanPolyline(pts, 1).map(roundPoint);
    if (pts.length < 2) pts = originals[i].points.map(roundPoint);
    return { width: r.width, class: r.class, points: pts };
  });

  // Never route a tidied road over a protected building: revert those roads.
  if (protectedFootprints.length) {
    const protectedBuildings = protectedFootprints.map((p) => ({ pos: p.pos, footprint: footprintOf(p) }));
    roads = roads.map((r, i) => {
      const bands = roadBands([r]);
      const covers = protectedBuildings.some((b) => rectRoadClearance(b.pos[0], b.pos[1], b.footprint, bands) < 0);
      return covers ? { width: r.width, class: r.class, points: originals[i].points.map(roundPoint) } : r;
    });
  }

  // Hard point cap: if tidy grew past it, drop T-junction vertices by reverting
  // roads to their simplified (pre-connect) form, then to the RDP form.
  const total = roads.reduce((n, r) => n + r.points.length, 0);
  if (total > maxPoints) {
    const simplified = originals.map((r) => ({
      width: r.width, class: r.class,
      points: simplifyPolyline(r.points, eps).map(roundPoint),
    }));
    const simplifiedTotal = simplified.reduce((n, r) => n + r.points.length, 0);
    if (simplifiedTotal <= maxPoints) {
      roads = simplified;
    } else {
      // Coarsen further in bounded steps.
      let coarsened = null;
      for (const e of [eps * 2, eps * 4, eps * 8, eps * 16]) {
        const c = originals.map((r) => ({
          width: r.width, class: r.class,
          points: simplifyPolyline(r.points, e).map(roundPoint),
        }));
        if (c.reduce((n, r) => n + r.points.length, 0) <= maxPoints) { coarsened = c; break; }
      }
      roads = coarsened || originals.map((r) => ({ width: r.width, class: r.class, points: r.points.map(roundPoint) }));
    }
  }

  const pointsBefore = originals.reduce((n, r) => n + r.points.length, 0);
  const pointsAfter = roads.reduce((n, r) => n + r.points.length, 0);
  return {
    roads,
    stats: {
      endpointMerges: connected.stats.endpointMerges,
      tJunctions: connected.stats.tJunctions,
      pointsBefore,
      pointsAfter,
    },
  };
}

// ─── Smooth curve sampling (Curved road tool) ───────────────────────────

/**
 * Centripetal Catmull–Rom through `points`, sampled at >= minSpacing metres.
 * Reflects the end tangents (no duplicated control points) and clamps the
 * result to the control-point bounding box so the curve can never overshoot.
 * Returns a fresh integer polyline (>= 2 points).
 */
export function sampleCatmullRom(points, opts = {}) {
  const pts = (points || []).map((p) => [p[0], p[1]]);
  if (pts.length < 2) return pts;
  if (pts.length === 2) return [roundPoint(pts[0]), roundPoint(pts[1])];
  const minSpacing = opts.minSpacing ?? TIDY_DEFAULTS.minSpacing;
  const alpha = opts.alpha ?? 0.5;

  // Reflected phantom endpoints.
  const p0 = pts[0], pN = pts[pts.length - 1];
  const ext = [ [2 * p0[0] - pts[1][0], 2 * p0[1] - pts[1][1]], ...pts,
    [2 * pN[0] - pts[pts.length - 2][0], 2 * pN[1] - pts[pts.length - 2][1]] ];

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of pts) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }

  const out = [];
  const push = (x, z) => {
    x = Math.max(minX, Math.min(maxX, x));
    z = Math.max(minZ, Math.min(maxZ, z));
    const last = out[out.length - 1];
    if (last && Math.hypot(x - last[0], z - last[1]) < minSpacing * 0.5) return;
    out.push([x, z]);
  };
  push(pts[0][0], pts[0][1]);

  for (let i = 1; i < ext.length - 2; i++) {
    const a = ext[i - 1], b = ext[i], c = ext[i + 1], d = ext[i + 2];
    const tj = (pi, pj) => Math.max(1e-4, Math.pow(Math.hypot(pj[0] - pi[0], pj[1] - pi[1]), alpha));
    const t0 = 0, t1 = t0 + tj(a, b), t2 = t1 + tj(b, c), t3 = t2 + tj(c, d);
    const steps = Math.max(2, Math.ceil(Math.hypot(c[0] - b[0], c[1] - b[1]) / minSpacing));
    for (let s = 1; s <= steps; s++) {
      const t = t1 + (t2 - t1) * (s / steps);
      const A1 = [ (t1 - t) / (t1 - t0) * a[0] + (t - t0) / (t1 - t0) * b[0], (t1 - t) / (t1 - t0) * a[1] + (t - t0) / (t1 - t0) * b[1] ];
      const A2 = [ (t2 - t) / (t2 - t1) * b[0] + (t - t1) / (t2 - t1) * c[0], (t2 - t) / (t2 - t1) * b[1] + (t - t1) / (t2 - t1) * c[1] ];
      const A3 = [ (t3 - t) / (t3 - t2) * c[0] + (t - t2) / (t3 - t2) * d[0], (t3 - t) / (t3 - t2) * c[1] + (t - t2) / (t3 - t2) * d[1] ];
      const B1 = [ (t2 - t) / (t2 - t0) * A1[0] + (t - t0) / (t2 - t0) * A2[0], (t2 - t) / (t2 - t0) * A1[1] + (t - t0) / (t2 - t0) * A2[1] ];
      const B2 = [ (t3 - t) / (t3 - t1) * A2[0] + (t - t1) / (t3 - t1) * A3[0], (t3 - t) / (t3 - t1) * A2[1] + (t - t1) / (t3 - t1) * A3[1] ];
      const Cx = (t2 - t) / (t2 - t1) * B1[0] + (t - t1) / (t2 - t1) * B2[0];
      const Cz = (t2 - t) / (t2 - t1) * B1[1] + (t - t1) / (t2 - t1) * B2[1];
      push(Cx, Cz);
    }
  }
  push(pts[pts.length - 1][0], pts[pts.length - 1][1]);

  // Ensure the exact endpoints survive, then round.
  const rounded = cleanPolyline(out.map(roundPoint), 1);
  if (rounded.length < 2) return [roundPoint(pts[0]), roundPoint(pts[pts.length - 1])];
  rounded[0] = roundPoint(pts[0]);
  rounded[rounded.length - 1] = roundPoint(pts[pts.length - 1]);
  return rounded;
}
