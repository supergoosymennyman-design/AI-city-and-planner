/**
 * frame.spec.js — where the camera goes so the model fills the view.
 *
 * The bug this exists for: resetView() is a hardcoded (5, 4, 6) looking at (0, 1, 0), picked for
 * the 1-unit starter box, and nothing re-framed after an import. The test dinosaur (1.7 units
 * tall) came out about a sixth of the frame height, and 🏠 returned to the same fixed spot, so a
 * child had no way to frame their own model but to scroll-zoom by hand. Caught by LOOKING at the
 * page check's screenshots — all 31 of its checks passed, because every one of them asserts a
 * number and none of them asks how big the model is on screen.
 */
import { frameBox, fitDistance, boundingRadius, farPlaneFor, FRAME_MARGIN } from '../frame.js';

const near = (a, b, tol = 1e-6) => Math.abs(a - b) < tol;
/** The fraction of the frame's HEIGHT a sphere of `radius` covers at `distance`. */
const screenShare = (radius, distance, fovDeg) =>
  (2 * radius) / (2 * distance * Math.tan((fovDeg * Math.PI) / 360));

export default function (check) {
  // The real numbers: the shipped dino's bounds, as the page check reported them.
  const dino = { min: [-0.4638621941731806, -0.85, -1.0972539126191392], max: [0.46386219417318064, 0.8500000000000001, 1.0972539126191394] };
  const FOV = 60;
  const ASPECT = 930 / 662; // the studio's viewport at 1280x800, measured

  check('frame: the radius holds the box however it is turned',
    near(boundingRadius({ min: [-1, -1, -1], max: [1, 1, 1] }), Math.sqrt(12) / 2));

  // The regression itself, stated as a number rather than an impression.
  {
    const framed = frameBox(dino, { fovDeg: FOV, aspect: ASPECT, direction: [5, 3, 6] });
    const before = screenShare(framed.radius, Math.hypot(5, 3, 6), FOV); // the old fixed distance
    const after = screenShare(framed.radius, framed.distance, FOV);
    check('frame: the model fills a useful share of the frame, not a corner of it',
      after > 0.6 && after < 1, { after: Math.round(after * 100) / 100 });
    check('frame: ...which is a real improvement on the fixed camera distance',
      after > before * 2, { before: Math.round(before * 100) / 100 });
  }

  // Framing changes how CLOSE the view is, never the angle — the child keeps their bearings and
  // the FRONT marker stays where they left it.
  {
    const direction = [5, 3, 6];
    const framed = frameBox(dino, { fovDeg: FOV, aspect: ASPECT, direction });
    const toCamera = [
      framed.position[0] - framed.target[0],
      framed.position[1] - framed.target[1],
      framed.position[2] - framed.target[2],
    ];
    const len = Math.hypot(...toCamera);
    const dlen = Math.hypot(...direction);
    check('frame: the camera keeps the direction it was already looking from',
      near(toCamera[0] / len, direction[0] / dlen) && near(toCamera[1] / len, direction[1] / dlen)
      && near(toCamera[2] / len, direction[2] / dlen));
    check('frame: the camera sits exactly the fitted distance from the centre',
      near(len, framed.distance, 1e-9));
    check('frame: it looks at the middle of the model, not the world origin',
      near(framed.target[0], 0, 1e-9) && near(framed.target[1], 0, 1e-9) && near(framed.target[2], 0, 1e-9));
  }

  // An off-centre model must be centred too — the old camera always stared at (0, 1, 0), so a
  // model placed beside the build sat at the edge of the frame or outside it.
  {
    const moved = { min: [9, 4, -1], max: [11, 6, 1] };
    const framed = frameBox(moved, { fovDeg: FOV, aspect: ASPECT, direction: [5, 3, 6] });
    check('frame: an off-centre model is centred, not left at the edge',
      near(framed.target[0], 10) && near(framed.target[1], 5) && near(framed.target[2], 0));
  }

  // A portrait window is limited by its WIDTH. Using the vertical angle alone would push the
  // model off the sides, and the studio runs on tablets, so this is not hypothetical.
  check('frame: a narrow window backs further off than a wide one',
    fitDistance(1, FOV, 0.5) > fitDistance(1, FOV, 2));
  check('frame: past square, the vertical angle is the binding one and the distance settles',
    near(fitDistance(1, FOV, 2), fitDistance(1, FOV, 5)));

  // Scale-free: twice the model at twice the distance looks identical.
  check('frame: distance scales with the model, so any size frames the same',
    near(fitDistance(2, FOV, ASPECT), 2 * fitDistance(1, FOV, ASPECT)));
  check('frame: the margin is breathing room, not a fudge — it scales the distance exactly',
    near(fitDistance(1, FOV, ASPECT, 1) * FRAME_MARGIN, fitDistance(1, FOV, ASPECT, FRAME_MARGIN)));

  // A degenerate box (an empty scene, a single point) must still answer usably: a zero radius
  // would put the camera AT the target, and OrbitControls with a zero-length offset renders
  // nothing at all — which reads as "the import failed".
  {
    const point = { min: [1, 1, 1], max: [1, 1, 1] };
    const framed = frameBox(point, { fovDeg: FOV, aspect: ASPECT, direction: [5, 3, 6] });
    check('frame: a zero-size box still puts the camera somewhere finite, away from the target',
      Number.isFinite(framed.distance) && framed.distance > 0
      && framed.position.every(Number.isFinite));
  }

  // A model beyond the far plane is not small, it is invisible.
  check('frame: the far plane grows to clear a huge model',
    farPlaneFor(5000, 2000, 1000) >= 7000);
  check('frame: ...and never shrinks below the camera default for a small one',
    farPlaneFor(3.7, 1.5, 1000) === 1000);
}
