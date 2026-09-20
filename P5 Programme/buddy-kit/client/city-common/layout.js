/**
 * city-common/layout.js — shared layout schema, validation and helpers for the
 * city planner + 3D template.
 *
 * Layout JSON (v2):
 * {
 *   "version": 2,
 *   "scaleMeters": 2000,
 *   "roads": [ { "points": [[x,y], ...], "width": 12, "class": "primary" } ],
 *   "parks": [ { "cx": 500, "cz": 500, "radius": 80 } ],
 *   "buildings": [ { "type": "finance_tower", "pos": [420, 380],
 *                    "footprint": [30, 30], "height": 80 } ]
 * }
 *
 * Coordinate space: plan (x, y) == world (x, 0, y) in local meters [0, scale].
 */

import { catalogType } from './catalog.js';
import { libraryItem } from './library.js';

// Resolve the spec for a building type — a city-catalog type OR a shared-library
// item ('lib:<id>'). Returns null for unknown types.
export function typeSpec(type) {
  if (!type || typeof type !== 'string') return null;
  if (type.startsWith('lib:')) return libraryItem(type.slice(4));
  return catalogType(type);
}

export const LAYOUT_VERSION = 2;
export const DEFAULT_SCALE = 2000;
// Sanity bounds on the plan size: a student city is ~2000m. A pasted JSON with
// scaleMeters=1e12 would pass a naive >0 check but make the optimizer's grid
// search iterate billions of cells (hang). Clamp to a sane range.
export const MIN_SCALE = 200;
export const MAX_SCALE = 20000;

/** Clamp a raw scale value to [MIN_SCALE, MAX_SCALE] (default when invalid). */
function clampScale(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_SCALE;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, n));
}

/** Road width by class (matches fabric generator roadWidth). */
export const ROAD_WIDTH = {
  primary: 14,
  secondary: 11,
  tertiary: 9,
  residential: 7,
  service: 5,
};

/** Build an empty default layout. */
export function defaultLayout() {
  return {
    version: LAYOUT_VERSION,
    scaleMeters: DEFAULT_SCALE,
    roads: [],
    parks: [],
    buildings: [],
  };
}

/**
 * Validate a layout object. Never throws — returns { ok, errors, warnings }.
 * Errors are blocking; warnings are cosmetic (e.g. overlapping footprints).
 */
export function validateLayout(raw) {
  try { return validateLayoutValue(raw); } catch { return { ok: false, errors: ['Invalid layout values'], warnings: [] }; }
}
function validateLayoutValue(raw) {
  const errors = [];
  const warnings = [];

  if (!raw || typeof raw !== 'object') {
    return { ok: false, errors: ['Layout is not an object'], warnings: [] };
  }

  // version
  const version = raw.version;
  if (version !== 1 && version !== 2) {
    errors.push(`Unsupported layout version: ${version}`);
    return { ok: false, errors, warnings: [] };
  }

  const scale = clampScale(raw.scaleMeters);
  const inBounds = (v) => Number.isFinite(v) && v >= 0 && v <= scale + 0.5;

  // Pathological-layout caps: a student city is bounded; a pasted JSON with
  // hundreds of buildings / road points would O(n²) the overlap pass below and
  // stall boot on a tablet. Reject early with a clear error instead.
  const MAX_BUILDINGS = 400;
  const MAX_ROAD_POINTS = 4000;
  const buildings = Array.isArray(raw.buildings) ? raw.buildings : [];
  if (buildings.length > MAX_BUILDINGS) {
    errors.push(`Too many buildings (${buildings.length}, max ${MAX_BUILDINGS}) — this doesn't look like a student city.`);
    return { ok: false, errors, warnings: [] };
  }
  const roads = Array.isArray(raw.roads) ? raw.roads : [];
  let roadPointCount = 0;
  for (const r of roads) roadPointCount += Array.isArray(r?.points) ? r.points.length : 0;
  if (roadPointCount > MAX_ROAD_POINTS) {
    errors.push(`Too many road points (${roadPointCount}, max ${MAX_ROAD_POINTS}) — this doesn't look like a student city.`);
    return { ok: false, errors, warnings: [] };
  }
  const parks = Array.isArray(raw.parks) ? raw.parks : [];
  if (parks.length > 50) {
    errors.push(`Too many parks (${parks.length}, max 50) — this doesn't look like a student city.`);
    return { ok: false, errors, warnings: [] };
  }

  // buildings
  const seenTypes = new Map();
  buildings.forEach((b, i) => {
    const tag = `building[${i}]`;
    if (!b || typeof b !== 'object') { errors.push(`${tag} not an object`); return; }
    if (typeof b.type !== 'string' || !typeSpec(b.type)) {
      errors.push(`${tag}: unknown type "${b.type}"`);
      return;
    }
    if (!Array.isArray(b.pos) || b.pos.length !== 2 || !inBounds(b.pos[0]) || !inBounds(b.pos[1])) {
      errors.push(`${tag}: invalid pos ${JSON.stringify(b.pos)}`);
      return;
    }
    const fp = b.footprint;
    if (fp !== undefined && (!Array.isArray(fp) || fp.length !== 2 || !Number.isFinite(fp[0]) || !Number.isFinite(fp[1]) || fp[0] <= 0 || fp[1] <= 0)) {
      errors.push(`${tag}: invalid footprint ${JSON.stringify(fp)}`);
    }
    if (b.height !== undefined && (!Number.isFinite(b.height) || b.height <= 0 || b.height > 300)) {
      errors.push(`${tag}: invalid height ${b.height}`);
    }
    // Overlap warning (same type duplicates + footprint overlap with others)
    const key = `${b.type}`;
    seenTypes.set(key, (seenTypes.get(key) || 0) + 1);
  });
  buildings.forEach((b, i) => {
    for (let j = i + 1; j < buildings.length; j++) {
      const c = buildings[j];
      if (!b?.pos || !c?.pos) continue;
      const fp1 = b.footprint || (typeSpec(b.type)?.footprint || [20, 20]);
      const fp2 = c.footprint || (typeSpec(c.type)?.footprint || [20, 20]);
      const overlapX = Math.abs(b.pos[0] - c.pos[0]) < (fp1[0] + fp2[0]) / 2;
      const overlapY = Math.abs(b.pos[1] - c.pos[1]) < (fp1[1] + fp2[1]) / 2;
      if (overlapX && overlapY) {
        warnings.push(`building[${i}] (${b.type}) overlaps building[${j}] (${c.type})`);
      }
    }
  });

  // roads
  roads.forEach((r, i) => {
    const tag = `road[${i}]`;
    if (!r || !Array.isArray(r.points) || r.points.length < 2) {
      errors.push(`${tag}: needs >= 2 points`);
      return;
    }
    r.points.forEach((p, pi) => {
      if (!Array.isArray(p) || p.length !== 2 || !inBounds(p[0]) || !inBounds(p[1])) {
        errors.push(`${tag}.points[${pi}] out of bounds`);
      }
    });
    if (r.class !== undefined && !ROAD_WIDTH[r.class]) {
      errors.push(`${tag}: unknown class "${r.class}"`);
    }
    if (r.width !== undefined && (!Number.isFinite(r.width) || r.width <= 0)) {
      errors.push(`${tag}: invalid width`);
    }
  });

  // parks
  parks.forEach((p, i) => {
    const tag = `park[${i}]`;
    if (!p || !inBounds(p.cx) || !inBounds(p.cz) || !(Number(p.radius) > 0)) {
      errors.push(`${tag}: invalid center/radius`);
    }
  });

  return { ok: errors.length === 0, errors, warnings };
}

/** Coerce a validated (or partially valid) layout into a safe, clean shape. */
export function sanitizeLayout(raw) {
  const base = defaultLayout();
  const scale = clampScale(raw?.scaleMeters);
  base.scaleMeters = scale;
  base.autoScenery = raw?.autoScenery !== false;
  base.version = LAYOUT_VERSION;

  if (Array.isArray(raw?.buildings)) {
    const clamp = (v) => Math.max(0, Math.min(scale, v));
    base.buildings = raw.buildings
      .filter((b) => b && typeof b.type === 'string' && typeSpec(b.type))
      .map((b) => {
        // Coordinates must be finite numbers — a NaN/Infinity/string coord would
        // poison metrics, densify and the 3D renderer. Drop invalid buildings
        // rather than let a broken value through.
        const px = Array.isArray(b.pos) && b.pos.length === 2 ? +b.pos[0] : NaN;
        const pz = Array.isArray(b.pos) && b.pos.length === 2 ? +b.pos[1] : NaN;
        if (!Number.isFinite(px) || !Number.isFinite(pz)) return null;
        const fp =
          Array.isArray(b.footprint) && b.footprint.length === 2 &&
          Number.isFinite(+b.footprint[0]) && Number.isFinite(+b.footprint[1]) &&
          +b.footprint[0] > 0 && +b.footprint[1] > 0
            ? [+b.footprint[0], +b.footprint[1]]
            : undefined;
        return {
          type: b.type,
          pos: [clamp(px), clamp(pz)],
          ...(fp ? { footprint: fp } : {}),
          ...(Number.isFinite(b.height) ? { height: +b.height } : {}),
          ...(typeof b.locked === 'boolean' ? { locked: b.locked } : {}),
        };
      })
      .filter((b) => b !== null);
  }

  if (Array.isArray(raw?.roads)) {
    base.roads = raw.roads
      .filter((r) => r && Array.isArray(r.points) && r.points.length >= 2)
      .map((r) => {
        const clamp = (v) => Math.max(0, Math.min(scale, v));
        const points = r.points
          .filter((p) => Array.isArray(p) && p.length === 2 && Number.isFinite(+p[0]) && Number.isFinite(+p[1]))
          .map((p) => [clamp(+p[0]), clamp(+p[1])]);
        return {
          points,
          width: ROAD_WIDTH[r.class] || (Number.isFinite(+r.width) && +r.width > 0 ? +r.width : ROAD_WIDTH.residential),
          class: ROAD_WIDTH[r.class] ? r.class : 'residential',
        };
      })
      .filter((r) => r.points.length >= 2);
  }

  if (Array.isArray(raw?.parks)) {
    base.parks = raw.parks
      .filter((p) => p && Number.isFinite(+p.cx) && Number.isFinite(+p.cz) && Number(+p.radius) > 0)
      .map((p) => {
        const clamp = (v) => Math.max(0, Math.min(scale, v));
        return { cx: clamp(+p.cx), cz: clamp(+p.cz), radius: Math.min(+p.radius, scale) };
      });
  }

  return base;
}

/** Plan (x, y) → world (x, 0, z). */
export function planToWorld(x, y) {
  return { x, y: 0, z: y };
}

/**
 * Prepare a sanitized layout for the 3D builder.
 *
 * IMPORTANT: this is now GEOMETRY-PRESERVING. It no longer grows footprints /
 * heights / road widths, compresses positions toward the centroid, separates
 * buildings or re-centres. The old transform made a building that was clearly
 * clear of a road in the 2D planner overlap that road in 3D (sizes ×1.5 while
 * distances shrank ×0.6) — the planner must not lie about what the child built.
 *
 * Kept as a named step because the builder + tests call it and read:
 *   - `grow`   — the champion scale multiplier (now always 1)
 *   - `bounds` — minimap + sky-traffic extent (content bounds + padding)
 *
 * @param {object} layout - sanitized layout (NOT mutated)
 * @param {{pad?:number}} opts
 * @returns {{layout:object, grow:number, bounds:{minX,minZ,maxX,maxZ}}}
 */
export function densifyLayout(layout, opts = {}) {
  const pad = opts.pad ?? 120;
  const SCALE = layout.scaleMeters || DEFAULT_SCALE;
  const bbox = contentBounds(layout, SCALE);
  const bounds = {
    minX: Math.max(0, bbox.minX - pad),
    minZ: Math.max(0, bbox.minZ - pad),
    maxX: Math.min(SCALE, bbox.maxX + pad),
    maxZ: Math.min(SCALE, bbox.maxZ + pad),
  };
  return { layout, grow: 1, bounds };
}

/** Content bounding box (buildings ± footprint, road points, parks ± radius). */
function contentBounds(layout, SCALE) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  const consider = (x, z) => {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  };
  for (const b of layout.buildings || []) {
    const fp = b.footprint || [20, 20];
    consider(b.pos[0] - fp[0] / 2, b.pos[1] - fp[1] / 2);
    consider(b.pos[0] + fp[0] / 2, b.pos[1] + fp[1] / 2);
  }
  for (const r of layout.roads || []) for (const [x, z] of r.points) consider(x, z);
  for (const p of layout.parks || []) {
    consider(p.cx - p.radius, p.cz - p.radius);
    consider(p.cx + p.radius, p.cz + p.radius);
  }
  if (!Number.isFinite(minX)) { minX = minZ = 0; maxX = maxZ = SCALE; }
  return { minX, maxX, minZ, maxZ };
}
