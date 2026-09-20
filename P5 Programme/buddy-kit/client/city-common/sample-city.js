/**
 * city-common/sample-city.js — the bundled "example AI city" used by the 3D
 * builder when a child taps "Explore an example city".
 *
 * Historically this lived inside city-builder.js as a hard-coded cross + box
 * ring. It now lives here as a PURE generator (no DOM/THREE) so it can be unit
 * tested in node like the rest of city-common, and so the example city can be
 * re-shaped without touching the 3D runtime.
 *
 * The example sits on the "Radial Ring" road template (see road-templates.js)
 * with the primary cross-avenue added on top — the exact hybrid a student can
 * reproduce in the planner by picking 🛤️ Radial Ring and drawing an avenue.
 * (The sample ring is sized so the 18 mission towers have room to ring the
 * central park inside it.)
 *
 * Authored at TRUE 1:1 scale: the 3D builder renders this layout unchanged
 * (densifyLayout is geometry-preserving), so every distance and footprint here
 * is the distance/footprint the child sees in both the planner and the 3D city.
 *
 * Deterministic: no Math.random anywhere, so every boot renders the same city.
 *
 * Layout schema matches layout.js: roads [{points:[[x,z],…], width, class}],
 * parks [{cx, cz, radius}], buildings [{type, pos, footprint, height}].
 * `type` may be a catalog key (housing/school/…) or a shared-library id
 * ('lib:bld_kenney_sky_a', …) — the builder renders both.
 */

import { DEFAULT_SCALE, LAYOUT_VERSION } from './layout.js';
import { catalogType, specialKeys } from './catalog.js';
import { libraryItem } from './library.js';

export const SCALE = DEFAULT_SCALE;      // 2000 m plan
export const CX = SCALE / 2;             // 1000 — the plan centre
export const CZ = SCALE / 2;

// Ring-road geometry (TRUE metres — the 3D city renders this unchanged).
// The mission band (inner/outer rows at ~150–252 m) sits inside the ring and
// outside the roundabout, leaving the 18 towers room to ring the central park.
const RING_R = 300;
const RING_N = 48;
const PARK_R = 85;
// Central roundabout ring around the park island. Its outer edge (ROUND_END)
// is where the cross avenue and diagonal spokes terminate, so no road crosses
// the park. Round ring width 12 → half 6, plus a small margin.
const ROUND_R = 115;
const ROUND_N = 44;
const ROUND_END = ROUND_R + 12;

// ─── Geometry helpers ──────────────────────────────────────────────────────

/** Deterministic hash → [0,1). */
function hash01(x, z, salt = 0) {
  const s = Math.sin(x * 127.1 + z * 311.7 + salt * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Distance from a point to a polyline segment. */
function distSeg(px, pz, x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1, l2 = dx * dx + dz * dz;
  if (l2 === 0) return Math.hypot(px - x1, pz - z1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (pz - z1) * dz) / l2));
  return Math.hypot(px - (x1 + t * dx), pz - (z1 + t * dz));
}

/** Road as a list of {x1,z1,x2,z2,width} segments for clearance checks. */
function roadSegments(road) {
  const pts = road.points;
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    segs.push({ x1: pts[i][0], z1: pts[i][1], x2: pts[i + 1][0], z2: pts[i + 1][1], width: road.width });
  }
  return segs;
}

/** Max horizontal extent of a footprint (square approximation for clears). */
function fpMax(fp) {
  return Math.max(fp && fp[0] || 20, fp && fp[1] || 20);
}

/**
 * True-metre clearances (no densify compensation — the 3D city renders this
 * layout unchanged). These are the gaps a student can reproduce by hand.
 *
 * Direction-aware road clearance: how far a building centre must sit from road
 * segment A→B so the footprint and road ribbon keep a ~2.5 m gap. For angled
 * roads a square building faces the road with a corner, so the half-extent used
 * is the projection of the footprint onto the segment's perpendicular.
 */
function aRoadClearSeg(roadWidth, fp, x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  const nx = len ? -dz / len : 1, nz = len ? dx / len : 0;
  const ext = Math.abs(nx) * (fp[0] / 2) + Math.abs(nz) * (fp[1] / 2);
  return roadWidth / 2 + ext + 2.5;
}
function aParkClear(radius, fp) {
  return radius + fpMax(fp) / 2 + 2.5;
}

/**
 * True when a footprint at (px,pz) is separated from occupied rect `o` along at
 * least one axis (so the two never overlap). Exact rectangle separation: a
 * circular clearance either forbids valid tight packing or lets corners collide.
 * The sample is authored non-overlapping because densifyLayout no longer runs a
 * separation pass.
 */
function bldGapOK(px, pz, fp, o) {
  const ofp = o.fp || [20, 20];
  const gap = 3;
  return Math.abs(px - o.x) >= (fp[0] + ofp[0]) / 2 + gap
      || Math.abs(pz - o.z) >= (fp[1] + ofp[1]) / 2 + gap;
}

/** Closed polyline ring around (cx, cz). */
function ringRoad(cx, cz, r, n, width, cls) {
  const points = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    points.push([Math.round(cx + Math.cos(a) * r), Math.round(cz + Math.sin(a) * r)]);
  }
  return { points, width, class: cls };
}

// ─── Roads ─────────────────────────────────────────────────────────────────

/**
 * The example city's road network: primary cross-avenue + the Radial Ring
 * layout (ring + 4 diagonal spokes), plus a central roundabout ring. The radial
 * template's 4 cardinal spokes are dropped because the cross-avenue supersedes
 * them, and the cross-avenue + diagonal spokes terminate on the roundabout ring
 * so no road crosses the central park island.
 */
export function sampleCityRoads() {
  const ring = ringRoad(CX, CZ, RING_R, RING_N, 20, 'primary');
  const round = ringRoad(CX, CZ, ROUND_R, ROUND_N, 12, 'primary');
  const diag = [];
  for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    // Start on the roundabout ring's OUTER edge (radius ROUND_END along the 45°
    // diagonal) so no spoke asphalt/marking reaches into the ring.
    const off = ROUND_END / Math.SQRT2;
    diag.push({ points: [[CX + dx * off, CZ + dz * off], [CX + dx * 360, CZ + dz * 360]], width: 10, class: 'secondary' });
  }
  // Cross avenue terminates on the roundabout ring's OUTER edge (radius
  // ROUND_END) at the 4 compass points, and runs out through the outer bands.
  const cross = [
    { points: [[CX - 570, CZ], [CX - ROUND_END, CZ]], width: 16, class: 'primary' },
    { points: [[CX + ROUND_END, CZ], [CX + 570, CZ]], width: 16, class: 'primary' },
    { points: [[CX, CZ - 570], [CX, CZ - ROUND_END]], width: 16, class: 'primary' },
    { points: [[CX, CZ + ROUND_END], [CX, CZ + 570]], width: 16, class: 'primary' },
  ];
  // Roundabout ring last so it overlays any approach-road micro-overlap.
  return [...cross, ring, ...diag, round];
}

/** The example city's parks — just the radial template's central park. */
export function sampleCityParks() {
  return [{ cx: CX, cz: CZ, radius: PARK_R }];
}

// ─── Clearance-aware deterministic placer ──────────────────────────────────

/**
 * Place one building of footprint `fp`. Deterministic search: nominal angle
 * `angleDeg` (±16° fan) inside radial band [rMin, rMax], preferring `rPref`.
 * `occupied` = already placed [{x, z, fp}]. Returns {x, z} or null.
 */
function placeOne({ x, z, fp }, angleDeg, rMin, rMax, rPref, roads, parks, occupied) {
  const allRoads = [];
  for (const r of roads) allRoads.push(...roadSegments(r));
  const clearAt = (px, pz) => {
    if (px < 120 || px > SCALE - 120 || pz < 120 || pz > SCALE - 120) return false;
    for (const p of parks) {
      if (Math.hypot(px - p.cx, pz - p.cz) < aParkClear(p.radius, fp)) return false;
    }
    for (const s of allRoads) {
      if (distSeg(px, pz, s.x1, s.z1, s.x2, s.z2) < aRoadClearSeg(s.width, fp, s.x1, s.z1, s.x2, s.z2)) return false;
    }
    for (const o of occupied) {
      if (!bldGapOK(px, pz, fp, o)) return false;
    }
    return true;
  };

  const rad = Math.PI / 180;
  const angleTries = [0, 5, -5, 10, -10, 16, -16, 3, -3, 13, -13, 8, -8];
  const rMid = (rMin + rMax) / 2;
  const pref = (rPref !== undefined) ? Math.max(rMin, Math.min(rMax, rPref)) : rMid;
  const radiusTries = [];
  for (let d = 0; d <= (rMax - rMin) + 40; d += 6) {
    if (pref + d <= rMax) radiusTries.push(pref + d);
    if (pref - d >= rMin) radiusTries.push(pref - d);
  }
  for (const aOff of angleTries) {
    const a = (angleDeg + aOff) * rad;
    for (const r of radiusTries) {
      const px = x + Math.cos(a) * r;
      const pz = z + Math.sin(a) * r;
      if (clearAt(px, pz)) return { x: Math.round(px), z: Math.round(pz) };
    }
  }
  return null;
}

/**
 * Place `items` spread evenly across angular window [aMin, aMax] inside radial
 * band [rMin, rMax]. Items alternate between an inner and an outer radius row.
 */
function scatterRow(items, aMin, aMax, rMin, rMax, cx, cz, roads, parks, occupied, out, rowCount = 2) {
  const span = aMax - aMin;
  const n = items.length;
  for (let i = 0; i < n; i++) {
    const frac = (n === 1) ? 0.5 : i / (n - 1);
    const aDeg = aMin + span * frac;
    const row = (rowCount === 2) ? (i % 2) : Math.min(rowCount - 1, Math.floor((i * rowCount) / n));
    const rPref = rMin + (row + 0.5) * ((rMax - rMin) / rowCount);
    const item = items[i];
    const spec = item.type.startsWith('lib:') ? libraryItem(item.type.slice(4)) : catalogType(item.type);
    const fp = item.fp || spec?.footprint || [20, 20];
    const pos = placeOne({ x: cx, z: cz, fp }, aDeg, rMin, rMax, rPref + (hash01(aDeg, i, 3) - 0.5) * 12, roads, parks, occupied);
    if (!pos) {
      // Defensive fallback: retry across the whole window without stagger.
      const alt = placeOne({ x: cx, z: cz, fp }, aDeg, rMin, rMax, undefined, roads, parks, occupied);
      if (!alt) {
        // A district recipe that cannot fit — the sample test catches this.
        continue;
      }
      out.push({ type: item.type, pos: [alt.x, alt.z], footprint: item.fp || spec?.footprint || [20, 20], ...(item.h ? { height: item.h } : { height: spec?.height || 20 }) });
      occupied.push({ x: alt.x, z: alt.z, fp });
      continue;
    }
    out.push({ type: item.type, pos: [pos.x, pos.z], footprint: item.fp || spec?.footprint || [20, 20], ...(item.h ? { height: item.h } : { height: spec?.height || 20 }) });
    occupied.push({ x: pos.x, z: pos.z, fp });
  }
}

// ─── District recipes ──────────────────────────────────────────────────────

/** All 18 mission (special) types in catalog order. */
function missionTypes() {
  return specialKeys().map((type) => ({ type }));
}

/**
 * Anchor districts:
 *  - Downtown (inside the ring): the 18 mission buildings ring the central
 *    park on two staggered rows.
 *  - Skyline ring (just outside the ring, on the north/east arc): shared-
 *    library towers + a few catalog offices, so the skyline is layered.
 *  - West civic band and east commercial band (outer ring).
 *  - A south-west industrial district (library industrial buildings).
 *
 * The remaining space is filled by sampleCityInfill.
 */
export function buildSampleCityAnchors(roads, parks) {
  const cx = CX, cz = CZ;
  const occupied = [];
  const out = [];
  const place = (items, aMin, aMax, rMin, rMax, rowCount = 2) =>
    scatterRow(items, aMin, aMax, rMin, rMax, cx, cz, roads, parks, occupied, out, rowCount);

  // ── Downtown mission ring ────────────────────────────────────────────────
  // Cross + diagonal spokes sit 45° apart. The 18 missions split into two rows
  // of 9; each row's angles are offset ~11° from a spoke so every tower stays
  // comfortably clear of the avenue lines even close to the park.
  const missions = missionTypes();
  const inner = missions.filter((_, i) => i % 2 === 0);
  const outer = missions.filter((_, i) => i % 2 === 1);
  const rowAngles = (offsetDeg) => Array.from({ length: 9 }, (_, i) => offsetDeg + i * 45);
  // One explicit call per mission keeps every tower's window tight and unique.
  for (let i = 0; i < inner.length; i++) {
    const a = rowAngles(11.25 + 4)[i % 9];
    place([inner[i]], a - 4, a + 4, 150, 200, 1);
  }
  for (let i = 0; i < outer.length; i++) {
    const a = rowAngles(33.75 + 4)[i % 9];
    place([outer[i]], a - 4, a + 4, 208, 258, 1);
  }

  // ── Skyline ring (north/east arc, just outside the ring road) ─────────────
  const skyPicks = ['bld_kenney_sky_a', 'bld_kenney_sky_b', 'bld_kenney_sky_c', 'bld_kenney_sky_d', 'bld_kenney_sky_e'];
  const towerPicks = ['bld_kenney_building_h', 'bld_kenney_building_j', 'bld_kenney_building_l', 'bld_kenney_building_n', 'bld_kenney_widebuilding_b'];
  const skyline = [];
  for (let i = 0; i < 12; i++) {
    if (i % 3 === 2) skyline.push({ type: 'office' });
    else skyline.push({ type: 'lib:' + (i % 2 === 0 ? skyPicks[i % skyPicks.length] : towerPicks[i % towerPicks.length]) });
  }
  // Arcs never wrap across 0° (place() does not handle angle wrap).
  place(skyline.slice(0, 3), 285, 360, 330, 390, 2);
  place(skyline.slice(3, 7), 0, 70, 330, 390, 2);
  place(skyline.slice(7, 12), 75, 135, 330, 390, 2);

  // ── West civic band (schools / hospitals / library / police / fire) ───────
  const civic = [
    { type: 'hospital' }, { type: 'school' }, { type: 'police' }, { type: 'library' },
    { type: 'hospital' }, { type: 'fire' }, { type: 'school' }, { type: 'police' },
    { type: 'hospital' }, { type: 'library' }, { type: 'police' }, { type: 'fire' },
  ];
  place(civic.slice(0, 6), 160, 200, 410, 500, 2);
  place(civic.slice(6), 150, 210, 500, 580, 2);

  // ── East commercial band (shops / offices / stadium) ─────────────────────
  const commercial = [
    { type: 'shop' }, { type: 'office' }, { type: 'shop' }, { type: 'stadium' },
    { type: 'office' }, { type: 'shop' }, { type: 'shop' }, { type: 'office' },
    { type: 'office' }, { type: 'shop' }, { type: 'office' }, { type: 'shop' },
  ];
  place(commercial.slice(0, 6), -45, -8, 410, 500, 2);
  place(commercial.slice(6), 8, 45, 410, 500, 2);

  // ── South-west industrial district ───────────────────────────────────────
  const industrial = [
    'bld_kenney_industrial_a', 'bld_kenney_industrial_b', 'bld_kenney_industrial_c',
    'bld_kenney_industrial_d', 'bld_kenney_industrial_e', 'bld_kenney_industrial_f',
    'bld_kenney_industrial_g', 'bld_kenney_industrial_h',
  ].map((id) => ({ type: 'lib:' + id }));
  place(industrial, 195, 235, 340, 420, 2);

  return out;
}

// ─── Dense infill (blocks of housing + local shops) ─────────────────────────

/**
 * Fill the remaining buildable space with dense, deterministic blocks, mirroring
 * the old sampleCityInfill: uniform ~55 m grid, footprint ~20 m (true scale),
 * placed only where the cell clears roads, parks, and every anchor. A few office
 * towers join the mid/outer ring so the skyline between the anchor districts
 * doesn't read as one flat band.
 */
export function sampleCityInfill(anchors, roads, parks) {
  const occupied = anchors.map((a) => {
    const spec = a.type.startsWith('lib:') ? libraryItem(a.type.slice(4)) : catalogType(a.type);
    return { x: a.pos[0], z: a.pos[1], fp: a.footprint || spec?.footprint || [20, 20] };
  });
  const PITCH = 50;
  const FP = [20, 20];
  const MIN = 420, MAX = SCALE - 420;
  const out = [];
  const distPt = (x, z, px, pz) => Math.hypot(x - px, z - pz);
  const clear = (cx, cz) => {
    for (const p of parks) {
      if (distPt(cx, cz, p.cx, p.cz) < aParkClear(p.radius, FP)) return false;
    }
    for (const r of roads) {
      for (const s of roadSegments(r)) {
        if (distSeg(cx, cz, s.x1, s.z1, s.x2, s.z2) < aRoadClearSeg(r.width, FP, s.x1, s.z1, s.x2, s.z2)) return false;
      }
    }
    for (const o of occupied) {
      if (!bldGapOK(cx, cz, FP, o)) return false;
    }
    return true;
  };
  const seed = (x, z) => hash01(x, z, 11);

  const MAX_TOTAL = 205;   // anchors + infill (tablet draw-call budget)
  // Spread neighbourhoods around the avenues rather than exhausting the cap
  // in the first northern rows. Seeded district order keeps a clear centre.
  const candidates=[];
  const segments=roads.flatMap(r=>roadSegments(r));
  for(let gz=MIN;gz<=MAX;gz+=PITCH)for(let gx=MIN;gx<=MAX;gx+=PITCH){
    const roadDistance=Math.min(...segments.map(s=>distSeg(gx,gz,s.x1,s.z1,s.x2,s.z2)));
    const radius=Math.hypot(gx-CX,gz-CZ);
    candidates.push({gx,gz,score:roadDistance+Math.abs(radius-340)*.13+hash01(gx,gz,73)*70});
  }
  candidates.sort((a,b)=>a.score-b.score);
  for(const {gx,gz} of candidates){
      if(out.length+anchors.length>=MAX_TOTAL)break;
      if (!clear(gx, gz)) continue;
      const dist = Math.hypot(gx - CX, gz - CZ);
      const s = seed(gx, gz);
      let type = 'housing', h = 12 + s * 10;
      if (dist > 600 && s < 0.05) { type = 'office'; h = 60 + s * 30; }
      else if (s < 0.12) { type = 'shop'; h = 11 + s * 7; }
      else if (s < 0.16) { type = 'library'; h = 9 + s * 6; }
      else if (s < 0.20 && dist > 550) { type = 'school'; h = 11 + s * 6; }
      out.push({ type, pos: [gx, gz], footprint: FP, height: Math.round(h) });
      occupied.push({ x: gx, z: gz, fp: FP });
  }
  return out;
}

/**
 * Build the complete example city layout in TRUE 1:1 metres. The 3D builder
 * renders it unchanged (densifyLayout is geometry-preserving), exactly like a
 * student plan drawn in the planner.
 */
export function buildSampleCity() {
  const roads = sampleCityRoads();
  const parks = sampleCityParks();
  const anchors = buildSampleCityAnchors(roads, parks);
  const buildings = anchors.concat(sampleCityInfill(anchors, roads, parks));
  return { version: LAYOUT_VERSION, scaleMeters: SCALE, autoScenery: true, roads, parks, buildings };
}
