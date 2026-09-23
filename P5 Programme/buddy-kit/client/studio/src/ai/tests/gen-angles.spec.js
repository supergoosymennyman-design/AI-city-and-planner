/** gen-angles.spec.js — the four snapshot camera directions (src/ai/gen-angles.js), pure Node. */
import {
  VIEW_YAW, MAX_TILT, normaliseTurn, clampTilt, viewDirection, anglesFromDirection,
} from '../gen-angles.js';
import { VIEW_DIRECTIONS, VIEW_ORDER } from '../gen-snapshot.js';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const sameVec = (a, b, eps = 1e-9) => a.length === b.length && a.every((v, i) => near(v, b[i], eps));
const unit = (v) => Math.hypot(...v);

export default function genAnglesTests(check) {
  // The default MUST still be the convention checked against Hunyuan3D-2mv's own example sheets.
  // If this drifts, every generated model silently comes out facing the wrong way.
  check('gen-angles: turn 0 / tilt 0 reproduces the original fixed table for all four views',
    VIEW_ORDER.every((v) => sameVec(viewDirection(v, 0, 0), VIEW_DIRECTIONS[v], 1e-12)));
  check('gen-angles: the yaw table is 90 degrees apart, front first',
    VIEW_YAW.front === 0 && VIEW_YAW.left === 90 && VIEW_YAW.back === 180 && VIEW_YAW.right === 270);
  check('gen-angles: every direction is unit length at an awkward turn and tilt',
    VIEW_ORDER.every((v) => near(unit(viewDirection(v, 37, 17)), 1)));

  // A turn must move the whole set rigidly, or Hunyuan3D-2mv is being fed views that are no longer
  // 90 degrees apart — which it answers with a melted mesh and no error.
  check('gen-angles: turning by 90 moves front onto where left was',
    sameVec(viewDirection('front', 90, 0), VIEW_DIRECTIONS.left, 1e-12));
  check('gen-angles: turning by 90 moves left onto where back was',
    sameVec(viewDirection('left', 90, 0), VIEW_DIRECTIONS.back, 1e-12));
  check('gen-angles: turning by 90 wraps right onto where front was',
    sameVec(viewDirection('right', 90, 0), VIEW_DIRECTIONS.front, 1e-12));
  const turned = VIEW_ORDER.map((v) => viewDirection(v, 41, 13));
  const dots = turned.map((d, i) => {
    const n = turned[(i + 1) % turned.length];
    return d[0] * n[0] + d[1] * n[1] + d[2] * n[2];
  });
  check('gen-angles: neighbouring views stay 90 degrees apart at any turn and tilt',
    dots.every((d) => near(d, Math.sin(13 * Math.PI / 180) ** 2, 1e-9)));

  // Tilt raises the camera. Sign matters: a positive tilt that looked UP from below would send
  // Hunyuan a worm's-eye sheet while the slider said "above".
  check('gen-angles: a positive tilt raises the camera above the model', viewDirection('front', 0, 20)[1] > 0);
  check('gen-angles: a negative tilt drops it below', viewDirection('front', 0, -20)[1] < 0);
  check('gen-angles: tilt 0 keeps every camera exactly at eye level',
    VIEW_ORDER.every((v) => viewDirection(v, 123, 0)[1] === 0));

  check('gen-angles: tilt is clamped to MAX_TILT either way and MAX_TILT is 30',
    MAX_TILT === 30 && clampTilt(90) === 30 && clampTilt(-90) === -30 && clampTilt(12) === 12);
  check('gen-angles: a tilt past the clamp really does stop moving the camera',
    sameVec(viewDirection('front', 0, 80), viewDirection('front', 0, MAX_TILT), 1e-12));
  check('gen-angles: turn wraps instead of running away',
    normaliseTurn(370) === 10 && normaliseTurn(-90) === 270 && normaliseTurn(360) === 0);
  check('gen-angles: rubbish angles become 0 rather than NaN camera positions',
    normaliseTurn(NaN) === 0 && normaliseTurn(undefined) === 0 && clampTilt('x') === 0 &&
    viewDirection('front', NaN, NaN).every(Number.isFinite));

  let threw = false;
  try {
    viewDirection('top', 0, 0);
  } catch (err) {
    threw = /unknown view/.test(err.message);
  }
  check('gen-angles: an unknown view throws rather than aiming at the origin', threw);

  // "Use my view as the front" is exactly this round trip, so it has to close.
  for (const [turn, tilt] of [[0, 0], [37, 0], [180, 12], [305, -22], [90, 30]]) {
    const back = anglesFromDirection(viewDirection('front', turn, tilt));
    check(`gen-angles: turn ${turn} / tilt ${tilt} survives the round trip through a direction`,
      near(back.turn, normaliseTurn(turn), 1e-9) && near(back.tilt, tilt, 1e-9));
  }
  check('gen-angles: the round trip ignores the length of the direction it is given',
    near(anglesFromDirection([5, 0, 5]).turn, 45) && near(anglesFromDirection([0.001, 0, 0.001]).turn, 45));
  check('gen-angles: a direction from straight behind reads as a half turn',
    near(anglesFromDirection([0, 0, -3]).turn, 180));
  check('gen-angles: a direction on the model\'s own left reads as a quarter turn',
    near(anglesFromDirection([2, 0, 0]).turn, 90));

  // The studio camera sits well above eye level by default, so this clamp is the common path,
  // not an edge case: the turn must survive it even though the tilt does not.
  const steep = anglesFromDirection([0, 10, 10]);
  check('gen-angles: a steeply raised studio view keeps its turn and only has its tilt clamped',
    near(steep.turn, 0) && steep.tilt === MAX_TILT);
  check('gen-angles: a zero-length direction falls back to the default rather than NaN',
    anglesFromDirection([0, 0, 0]).turn === 0 && anglesFromDirection([0, 0, 0]).tilt === 0);
  check('gen-angles: rubbish input falls back to the default',
    anglesFromDirection(null).turn === 0 && anglesFromDirection(['a', 'b', 'c']).tilt === 0);
}
