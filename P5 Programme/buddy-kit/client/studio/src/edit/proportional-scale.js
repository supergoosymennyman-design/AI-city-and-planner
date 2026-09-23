const AXES = ['x', 'y', 'z'];
const EPSILON = 1e-8;

/**
 * Return the scale that keeps an object's starting X:Y:Z ratio.
 *
 * TransformControls changes one or more axes before emitting `objectChange`.
 * The axis whose ratio moved furthest from 1 is therefore the child's intended
 * scale amount; applying that amount to every starting axis preserves the
 * object's shape, including an object that was already stretched.
 *
 * @param {{x:number,y:number,z:number}} current scale written by the gizmo
 * @param {{x:number,y:number,z:number}} start scale captured at drag start
 * @returns {{x:number,y:number,z:number}}
 */
export function scaleWithProportions(current, start) {
  let factor = 1;
  let largestChange = -1;
  let found = false;

  for (const axis of AXES) {
    const before = Number(start?.[axis]);
    const after = Number(current?.[axis]);
    if (!Number.isFinite(before) || !Number.isFinite(after) || Math.abs(before) <= EPSILON) continue;
    const ratio = after / before;
    if (!Number.isFinite(ratio)) continue;
    const change = Math.abs(ratio - 1);
    if (change > largestChange) {
      factor = ratio;
      largestChange = change;
      found = true;
    }
  }

  if (!found) return { x: current.x, y: current.y, z: current.z };
  return {
    x: start.x * factor,
    y: start.y * factor,
    z: start.z * factor,
  };
}
