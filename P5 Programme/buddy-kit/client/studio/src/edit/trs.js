// src/edit/trs.js
// An object's local transform as plain numbers, and the question "did it actually move?".
//
// Extracted from main.js so it can be tested: main.js builds a WebGLRenderer at module scope, so
// Node can never import it, and every decision left inside it is unreachable by the suite. This
// one decides whether a gizmo drag becomes an undo unit at all — too loose and a child's small
// nudge is silently dropped from the history, too tight and simply clicking a shape records an
// empty unit that Undo then appears to ignore.

/** How far a component must move to count as a change. A quaternion component is the tightest of
 * the three (a rotation of ~1e-6 rad), which is what sets the floor here. */
export const TRS_EPSILON = 1e-6;

/** Snapshot an object's local TRS as plain arrays (position, quaternion, scale).
 * @param {{position: {toArray: Function}, quaternion: {toArray: Function}, scale: {toArray: Function}}} obj
 * @returns {{p: number[], q: number[], s: number[]}}
 */
export function captureTRS(obj) {
  return {
    p: obj.position.toArray(),
    q: obj.quaternion.toArray(),
    s: obj.scale.toArray(),
  };
}

/** Did the transform change by more than TRS_EPSILON in any component?
 * A missing snapshot counts as changed: there is nothing to compare against, and dropping the
 * unit would lose the edit entirely. */
export function trsChanged(a, b) {
  if (!a || !b) return true;
  for (let i = 0; i < 3; i++) if (Math.abs(a.p[i] - b.p[i]) > TRS_EPSILON) return true;
  for (let i = 0; i < 4; i++) if (Math.abs(a.q[i] - b.q[i]) > TRS_EPSILON) return true;
  for (let i = 0; i < 3; i++) if (Math.abs(a.s[i] - b.s[i]) > TRS_EPSILON) return true;
  return false;
}
