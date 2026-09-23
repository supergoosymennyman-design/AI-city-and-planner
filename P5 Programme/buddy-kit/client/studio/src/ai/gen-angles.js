/**
 * gen-angles.js — which way the four snapshot cameras look.
 *
 * WHY this is its own module: the four directions used to be a frozen table inside gen-snapshot.js,
 * so "front" meant the world's +Z and could mean nothing else. An imported model whose front is not
 * +Z had its flank sent to the AI as its face, and there was no way for the child to say otherwise —
 * they could orbit the studio camera all they liked and the snapshot cameras never moved. A rule
 * like that, buried in a render call, is one nothing can assert; here it is pure and pinned.
 *
 * Turn and tilt move all four cameras TOGETHER, and that is deliberate. Hunyuan3D-2mv is trained on
 * views 90 degrees apart: four independently aimed cameras still return a GLB, just a melted one,
 * with no error anywhere to explain why. Keeping the set rigid is what makes this safe to expose.
 */

/** Where each view sits on the turntable: degrees about +Y, measured from the studio's FRONT. */
export const VIEW_YAW = Object.freeze({ front: 0, left: 90, back: 180, right: 270 });

/**
 * How far off eye level a view may be tilted.
 *
 * Hunyuan3D-2mv's own example sheets (assets/example_mv_images) are all shot level with the subject.
 * A steeply raised set still generates, and still looks plausible in the four pictures, so nothing
 * on screen would warn the child that they have walked outside what the model was trained on.
 */
export const MAX_TILT = 30;

const RAD = Math.PI / 180;

/** Any angle to [0, 360). Non-numbers become 0 rather than poisoning a camera position with NaN. */
export function normaliseTurn(deg) {
  const n = Number(deg);
  if (!Number.isFinite(n)) return 0;
  return ((n % 360) + 360) % 360;
}

/** Tilt held inside MAX_TILT. Non-numbers become 0, for the same reason as normaliseTurn. */
export function clampTilt(deg) {
  const n = Number(deg);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-MAX_TILT, Math.min(MAX_TILT, n));
}

/**
 * The unit direction a view's camera sits in, measured from the model's centre.
 *
 * At turn 0 / tilt 0 this reproduces the original fixed table exactly — front +Z, left +X, back -Z,
 * right -X — so the convention checked against Hunyuan3D-2mv's own example images stays the default.
 *
 * @param {'front'|'left'|'back'|'right'} view
 * @param {number} [turn] degrees the whole set is rotated about +Y
 * @param {number} [tilt] degrees the whole set is raised above eye level
 * @returns {number[]} [x, y, z], unit length
 */
export function viewDirection(view, turn = 0, tilt = 0) {
  const yaw = VIEW_YAW[view];
  if (yaw === undefined) throw new Error(`viewDirection: unknown view "${view}"`);
  const a = (yaw + normaliseTurn(turn)) * RAD;
  const t = clampTilt(tilt) * RAD;
  const flat = Math.cos(t);
  return [Math.sin(a) * flat, Math.sin(t), Math.cos(a) * flat].map(snap);
}

/**
 * Math.cos(Math.PI / 2) is 6.1e-17, not 0, so the default four views would come out a hair off the
 * axes they are defined to be on. The offset is far too small to see, but it makes the plain
 * statement "front is +Z" untestable without a tolerance — and a tolerance is how a real drift
 * later hides. Snapping below 1e-12 costs nothing at any angle a child can set.
 */
function snap(n) {
  return Math.abs(n) < 1e-12 ? 0 : n;
}

/**
 * The turn and tilt that would make `direction` the FRONT view.
 *
 * This is the whole of "use my view as the front": feed it the studio camera's offset from its orbit
 * target and the four snapshot cameras line up with what the child is already looking at. A
 * direction steeper than MAX_TILT keeps its turn and has only its tilt clamped, so aiming from above
 * still points the set the right way round instead of refusing.
 *
 * @param {number[]} direction any non-zero vector; length is ignored
 * @returns {{turn: number, tilt: number}}
 */
export function anglesFromDirection(direction) {
  const [x, y, z] = (Array.isArray(direction) ? direction : []).map(Number);
  const length = Math.hypot(x, y, z);
  if (!Number.isFinite(length) || length < 1e-9) return { turn: 0, tilt: 0 };
  return {
    turn: normaliseTurn(Math.atan2(x, z) / RAD),
    tilt: clampTilt(Math.asin(Math.max(-1, Math.min(1, y / length))) / RAD),
  };
}
