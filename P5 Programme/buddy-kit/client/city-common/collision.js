// collision.js — small renderer-free X/Z collision helpers for the AI City.
// These deliberately model only ground contact: the Champion, buildings and
// road vehicles all remain free to use their own Three.js visuals and height.

const EPSILON = 1e-4;

/** A footprint whose `length` follows {dx,dz}; `width` is perpendicular. */
export function boxBody({ x = 0, z = 0, dx, dz, yaw = 0, length = 1, width = 1 } = {}) {
  if (!Number.isFinite(dx) || !Number.isFinite(dz)) { dx = Math.sin(yaw); dz = Math.cos(yaw); }
  const magnitude = Math.hypot(dx, dz) || 1;
  return { x, z, dx: dx / magnitude, dz: dz / magnitude,
    length: Math.max(EPSILON, length), width: Math.max(EPSILON, width) };
}

function axes(body) { return [[body.dx, body.dz], [-body.dz, body.dx]]; }
function radiusOn(body, ax, az) {
  return Math.abs(body.dx * ax + body.dz * az) * body.length / 2
    + Math.abs(-body.dz * ax + body.dx * az) * body.width / 2;
}

/** True when two oriented ground footprints overlap (or touch with margin). */
export function boxesOverlap(a, b, margin = 0) {
  for (const [ax, az] of [...axes(a), ...axes(b)]) {
    const distance = Math.abs((b.x - a.x) * ax + (b.z - a.z) * az);
    if (distance >= radiusOn(a, ax, az) + radiusOn(b, ax, az) + margin) return false;
  }
  return true;
}

/**
 * Push `moving` out of `fixed` by the smallest SAT separation vector.  The
 * returned position is safe to write directly to the owning game state.
 */
export function separateBoxes(moving, fixed, padding = EPSILON) {
  let best = null;
  for (const [ax, az] of [...axes(moving), ...axes(fixed)]) {
    const delta = (moving.x - fixed.x) * ax + (moving.z - fixed.z) * az;
    const overlap = radiusOn(moving, ax, az) + radiusOn(fixed, ax, az) - Math.abs(delta);
    if (overlap <= 0) return { x: moving.x, z: moving.z, collided: false };
    if (!best || overlap < best.overlap) best = { ax, az, overlap, sign: delta < 0 ? -1 : 1 };
  }
  return {
    x: moving.x + best.ax * best.sign * (best.overlap + padding),
    z: moving.z + best.az * best.sign * (best.overlap + padding),
    collided: true,
  };
}

/** Resolve a moving box against a stable list, allowing it to slide at walls. */
export function resolveBoxCollisions(moving, fixedBodies, passes = 4) {
  let body = moving;
  let collided = false;
  for (let pass = 0; pass < passes; pass++) {
    let changed = false;
    for (const fixed of fixedBodies || []) {
      if (!fixed) continue;
      const result = separateBoxes(body, fixed);
      if (!result.collided) continue;
      body = { ...body, x: result.x, z: result.z };
      collided = changed = true;
    }
    if (!changed) break;
  }
  return { x: body.x, z: body.z, collided };
}

/**
 * Signed bumper-to-body gap in front of `vehicle`. Infinity means the blocker
 * is behind it or outside its lane corridor. A negative result is overlap.
 */
export function forwardBodyGap(vehicle, blocker, lateralMargin = 0.25) {
  const forward = (blocker.x - vehicle.x) * vehicle.dx + (blocker.z - vehicle.z) * vehicle.dz;
  const lateral = (blocker.x - vehicle.x) * -vehicle.dz + (blocker.z - vehicle.z) * vehicle.dx;
  const blockerForward = radiusOn(blocker, vehicle.dx, vehicle.dz);
  const blockerSide = radiusOn(blocker, -vehicle.dz, vehicle.dx);
  if (forward + blockerForward <= 0) return Infinity;
  if (Math.abs(lateral) > vehicle.width / 2 + blockerSide + lateralMargin) return Infinity;
  return forward - vehicle.length / 2 - blockerForward;
}
