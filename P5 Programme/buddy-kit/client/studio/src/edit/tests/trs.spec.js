/**
 * trs.spec.js — "did it actually move?", the decision that turns a gizmo drag into an undo unit.
 *
 * This lived in main.js, which builds a WebGLRenderer at module scope and so can never be imported
 * in Node: no check in the 1296 could reach it, whatever it asserted. Both failure directions are
 * child-facing and silent — too loose and a small nudge never reaches the history, so Undo appears
 * to skip a step; too tight and merely clicking a shape records an empty unit, so Undo appears to
 * do nothing at all.
 */
import * as THREE from 'three';
import { captureTRS, trsChanged, TRS_EPSILON } from '../trs.js';

export default function (check) {
  const obj = new THREE.Object3D();
  obj.position.set(1, 2, 3);
  obj.quaternion.set(0, 0, 0, 1);
  obj.scale.set(1, 1, 1);
  const before = captureTRS(obj);

  check('trs: a snapshot is plain arrays, not live THREE objects',
    Array.isArray(before.p) && Array.isArray(before.q) && Array.isArray(before.s)
    && before.p.length === 3 && before.q.length === 4 && before.s.length === 3
    && before.p[0] === 1 && before.p[2] === 3);

  // The snapshot must not track the object it came from: undo replays the BEFORE state, so a
  // snapshot that aliased the live object would replay whatever the drag ended on.
  obj.position.set(9, 9, 9);
  check('trs: the snapshot is detached from the object it was taken from', before.p[0] === 1);
  obj.position.set(1, 2, 3);

  check('trs: an unmoved object reports no change', trsChanged(before, captureTRS(obj)) === false);

  // Each of the three components on its own, at both sides of the threshold. A single
  // "it changed" check would pass even if two of the three loops were deleted.
  const nudge = (axis, field, by) => {
    const o = new THREE.Object3D();
    o.position.set(1, 2, 3);
    if (field === 'p') o.position[axis] += by;
    if (field === 'q') o.quaternion[axis] += by;
    if (field === 's') o.scale[axis] += by;
    return trsChanged(before, captureTRS(o));
  };
  // These inputs must not move with the production threshold: changing that threshold to 0.01
  // used to pass while dropping real small edits from Undo.
  check('trs: the documented component tolerance is one millionth', TRS_EPSILON === 1e-6);
  const big = 1e-5;
  const tiny = 1e-7;
  check('trs: a move past the threshold is a change, on every position axis',
    nudge('x', 'p', big) && nudge('y', 'p', big) && nudge('z', 'p', big));
  check('trs: a turn past the threshold is a change, on every quaternion component',
    nudge('x', 'q', big) && nudge('y', 'q', big) && nudge('z', 'q', big) && nudge('w', 'q', big));
  check('trs: a scale past the threshold is a change, on every scale axis',
    nudge('x', 's', big) && nudge('y', 's', big) && nudge('z', 's', big));
  check('trs: a wobble below the threshold is not a change, in any component',
    !nudge('x', 'p', tiny) && !nudge('y', 'q', tiny) && !nudge('z', 's', tiny));

  // A click that selects without dragging leaves no snapshot. Treating that as "unchanged" would
  // drop a real edit whenever the capture was missed, so the absent case is deliberately "changed".
  check('trs: a missing snapshot counts as changed, either side',
    trsChanged(null, before) === true && trsChanged(before, null) === true && trsChanged(null, null) === true);
}
