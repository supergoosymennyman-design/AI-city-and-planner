// src/ui/frame.js
// Where to put the camera so the model fills the view.
//
// WHY: resetView() has always been a hardcoded camera position — (5, 4, 6) looking at (0, 1, 0) —
// chosen for the 1-unit starter box, and nothing ever re-framed after an import. A model that
// arrives at a different size renders wherever that fixed distance happens to leave it: the test
// dinosaur (1.7 units tall) came out about a sixth of the frame height, a grey speck on a large
// empty grid, and the 🏠 button returned to the same fixed spot, so there was no way to frame it
// but to scroll-zoom by hand. For a child whose model has just arrived from "Make it real", that
// is the first thing they see.
//
// Plain maths independent of renderer setup. Viewport's class can be imported in Node; only its
// constructor needs WebGL. main.js calls that constructor during module evaluation.

/** Breathing room around the model: 1 would touch the frame edges exactly. */
export const FRAME_MARGIN = 1.25;

/**
 * How far a perspective camera must sit from a sphere of `radius` for it to fit on screen.
 *
 * The tighter of the two half-angles wins: a tall narrow window is limited horizontally, a wide
 * one vertically. Using the vertical angle alone would push a portrait window's model off the
 * sides — which is the tablet case, so it is not hypothetical.
 *
 * @param {number} radius bounding-sphere radius, world units
 * @param {number} fovDeg the camera's VERTICAL field of view, degrees
 * @param {number} aspect width / height
 * @param {number} [margin]
 * @returns {number} distance from the model's centre
 */
export function fitDistance(radius, fovDeg, aspect, margin = FRAME_MARGIN) {
  const vHalf = (fovDeg * Math.PI) / 360;
  const hHalf = Math.atan(Math.tan(vHalf) * Math.max(aspect, 1e-6));
  return (radius / Math.sin(Math.min(vHalf, hHalf))) * margin;
}

/** Half the diagonal of a box: the radius of a sphere that holds it whatever way it is turned. */
export function boundingRadius(box) {
  const dx = box.max[0] - box.min[0];
  const dy = box.max[1] - box.min[1];
  const dz = box.max[2] - box.min[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz) / 2;
}

/**
 * Camera position and target that frame `box`, keeping the direction the camera already looks
 * from — so framing changes how CLOSE the view is, never the angle. The child keeps their bearings
 * (the FRONT marker stays where they left it) and only the distance and centre move.
 *
 * A box with no size at all (a single point, an empty scene) still gets a usable answer rather
 * than a divide-by-zero: it is framed as though it had a small radius.
 *
 * @param {{min:number[], max:number[]}} box world-space bounds
 * @param {{fovDeg:number, aspect:number, direction:number[], margin?:number}} view
 * @returns {{position:number[], target:number[], distance:number, radius:number}}
 */
export function frameBox(box, { fovDeg, aspect, direction, margin = FRAME_MARGIN }) {
  const target = [
    (box.min[0] + box.max[0]) / 2,
    (box.min[1] + box.max[1]) / 2,
    (box.min[2] + box.max[2]) / 2,
  ];
  const radius = Math.max(boundingRadius(box), 1e-3);
  const distance = fitDistance(radius, fovDeg, aspect, margin);
  const length = Math.hypot(direction[0], direction[1], direction[2]) || 1;
  const unit = [direction[0] / length, direction[1] / length, direction[2] / length];
  return {
    position: [
      target[0] + unit[0] * distance,
      target[1] + unit[1] * distance,
      target[2] + unit[2] * distance,
    ],
    target,
    distance,
    radius,
  };
}

/**
 * A far plane that cannot clip the model we just framed. An imported GLB may be any size, and a
 * model beyond the far plane is not small — it is invisible, which reads as "the import failed".
 * Never shrinks below the camera's existing far.
 */
export function farPlaneFor(distance, radius, currentFar) {
  return Math.max(currentFar, (distance + radius) * 2);
}
