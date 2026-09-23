// Permanent learning destinations occupy real, clear lots in the plan's metre grid.
import { occupiedBounds, typeSpec, ROAD_WIDTH } from './layout.js';

export const GATEWAY_FOOTPRINT = Object.freeze([28, 28]);
const HALF = 14;
const GAP = 3;

function segmentHitsBox(a, b, minX, minZ, maxX, maxZ) {
  let lo = 0, hi = 1;
  const dx = b[0] - a[0], dz = b[1] - a[1];
  for (const [p, d, min, max] of [[a[0], dx, minX, maxX], [a[1], dz, minZ, maxZ]]) {
    if (!d) { if (p >= min && p <= max) continue; return false; }
    const t1 = (min - p) / d, t2 = (max - p) / d;
    lo = Math.max(lo, Math.min(t1, t2));
    hi = Math.min(hi, Math.max(t1, t2));
    if (lo > hi) return false;
  }
  return true;
}

export function gatewayLotClear(layout, x, z, reserved = []) {
  const scale = Number(layout?.scaleMeters) || 2000;
  if (x - HALF < 0 || z - HALF < 0 || x + HALF > scale || z + HALF > scale) return false;
  for (const b of layout?.buildings || []) {
    const fp = b.footprint || typeSpec(b.type)?.footprint || [20, 20];
    if (Math.abs(x - b.pos[0]) < HALF + fp[0] / 2 + GAP &&
        Math.abs(z - b.pos[1]) < HALF + fp[1] / 2 + GAP) return false;
  }
  for (const p of layout?.parks || []) {
    const closestX = Math.max(x - HALF - GAP, Math.min(p.cx, x + HALF + GAP));
    const closestZ = Math.max(z - HALF - GAP, Math.min(p.cz, z + HALF + GAP));
    if (Math.hypot(p.cx - closestX, p.cz - closestZ) < p.radius + GAP) return false;
  }
  for (const r of layout?.roads || []) {
    const pad = (Number(r.width) || ROAD_WIDTH[r.class] || 9) / 2 + GAP;
    for (let i = 1; i < (r.points?.length || 0); i++) {
      if (segmentHitsBox(r.points[i - 1], r.points[i], x - HALF - pad, z - HALF - pad, x + HALF + pad, z + HALF + pad)) return false;
    }
  }
  return reserved.every(p => Math.abs(x - p.x) >= 28 + GAP || Math.abs(z - p.z) >= 28 + GAP);
}

export function gatewayPositions(layout) {
  const scale = Number(layout?.scaleMeters) || 2000;
  const bounds = occupiedBounds(layout, { pad: 0 });
  const cx = (bounds.minX + bounds.maxX) / 2, cz = (bounds.minZ + bounds.maxZ) / 2;
  const span = Math.max(120, bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
  // The opening camera is southeast (+X,+Z) of occupiedBounds. Keep the pair
  // together on that visible side, then search a deterministic grid outward.
  const anchors = [{ x: cx + span * .20, z: cz + span * .22 }, { x: cx + span * .35, z: cz + span * .08 }];
  const grid = [];
  const step = Math.max(16, Math.ceil(scale / 125));
  for (let z = HALF + 2; z <= scale - HALF; z += step)
    for (let x = HALF + 2; x <= scale - HALF; x += step) grid.push({ x, z });
  const placed = [];
  for (const anchor of anchors) {
    const sorted = grid.slice().sort((a, b) => {
      const score = p => Math.hypot(p.x - anchor.x, p.z - anchor.z) +
        (placed.length ? Math.max(0, Math.hypot(p.x - placed[0].x, p.z - placed[0].z) - 110) * 3 : 0);
      return score(a) - score(b) || a.z - b.z || a.x - b.x;
    });
    const spot = sorted.find(p => gatewayLotClear(layout, p.x, p.z, placed));
    if (!spot) throw new Error('City has no clear lot for both learning gateways');
    placed.push(spot);
  }
  return placed;
}
