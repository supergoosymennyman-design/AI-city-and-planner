/**
 * ai-preview.spec.js — pure-logic coverage for `src/ui/ai-preview.js`.
 *
 * A real `THREE.WebGLRenderer` cannot run under plain Node, so this suite only
 * touches the module's pure surface: the mirrored kind→geometry map, the
 * material parameters, the colour coercion, and the camera-fitting maths.
 * The actual rendered output (lit/non-blank/framed, dispose idempotence) is
 * proven in a real browser instead.
 *
 * Auto-discovered by `run-tests.mjs` (it walks `src/ai/tests/*.spec.js`); the
 * default export is replayed synchronously by the runner.
 */

import * as THREE from 'three';
import { StudioScene } from '../../scene.js';
import {
  AI_SHAPE_KINDS,
} from '../schema.js';
import {
  PREVIEW_PRIMITIVES,
  PREVIEW_MATERIAL_PARAMS,
  previewColor,
  buildPreviewGeometry,
  makePreviewMaterial,
  computePreviewFrame,
} from '../../ui/ai-preview.js';

/**
 * @param {(name: string, cond: boolean) => void} check - Runner's `check(name, cond)`.
 * @returns {void}
 */
export default function aiPreviewTests(check) {
  // ---- kind → geometry mapping (the mirrored PRIMITIVES) -------------------
  const kinds = Object.keys(PREVIEW_PRIMITIVES).sort();
  check(
    'ai-preview: mirrors every AI_SHAPE_KIND and nothing more',
    kinds.length === AI_SHAPE_KINDS.length &&
      AI_SHAPE_KINDS.every((k) => PREVIEW_PRIMITIVES[k]),
  );

  const params = (kind) => buildPreviewGeometry(kind).parameters;

  check(
    'ai-preview: box geometry matches BoxGeometry(1,1,1)',
    params('box').width === 1 && params('box').height === 1 && params('box').depth === 1,
  );
  check(
    'ai-preview: sphere geometry matches SphereGeometry(0.5,32,24)',
    params('sphere').radius === 0.5 &&
      params('sphere').widthSegments === 32 &&
      params('sphere').heightSegments === 24,
  );
  check(
    'ai-preview: cylinder geometry matches CylinderGeometry(0.5,0.5,1,32)',
    params('cylinder').radiusTop === 0.5 &&
      params('cylinder').radiusBottom === 0.5 &&
      params('cylinder').height === 1 &&
      params('cylinder').radialSegments === 32,
  );
  check(
    'ai-preview: cone geometry matches ConeGeometry(0.5,1,32)',
    params('cone').radius === 0.5 &&
      params('cone').height === 1 &&
      params('cone').radialSegments === 32,
  );
  check(
    'ai-preview: torus geometry matches TorusGeometry(0.4,0.16,16,48)',
    params('torus').radius === 0.4 &&
      params('torus').tube === 0.16 &&
      params('torus').radialSegments === 16 &&
      params('torus').tubularSegments === 48,
  );
  check(
    'ai-preview: octahedron geometry matches OctahedronGeometry(0.6)',
    params('octahedron').radius === 0.6,
  );
  check(
    'ai-preview: plane geometry matches PlaneGeometry(1,1)',
    params('plane').width === 1 && params('plane').height === 1,
  );

  // buildPreviewGeometry must compute the bbox (frameCamera relies on it).
  const allHaveBox = AI_SHAPE_KINDS.every(
    (k) => buildPreviewGeometry(k).boundingBox !== null,
  );
  check('ai-preview: every geometry comes with a computed bounding box', allHaveBox);

  // ---- REAL drift tripwire: the mirror must equal what addPrimitive BUILDS --
  // The literal checks above pin the mirror against a copy of the expected
  // numbers, so a silent edit to scene.js's private PRIMITIVES map could still
  // slide through. These checks close that hole: they build every kind through
  // the REAL `StudioScene.addPrimitive` on a headless scene (exactly like
  // run-tests.mjs does) and compare the resulting geometry (constructor name + each
  // `.parameters` entry) and material against the mirror. If scene.js's map
  // diverges, this fails — which is the actual guarantee the FACTORY NOTE in
  // ai-preview.js claims.
  const realScene = new StudioScene();
  for (const kind of AI_SHAPE_KINDS) {
    const real = realScene.addPrimitive(kind, 0xffffff, { silent: true });
    const mirror = PREVIEW_PRIMITIVES[kind]();

    const realParams = real.geometry.parameters || {};
    const mirrorParams = mirror.parameters || {};
    const keys = [...new Set([...Object.keys(realParams), ...Object.keys(mirrorParams)])];
    const sameConstructor = real.geometry.constructor.name === mirror.constructor.name;
    const sameParameters =
      keys.length > 0 && keys.every((k) => realParams[k] === mirrorParams[k]);

    check(
      `ai-preview: real addPrimitive('${kind}') geometry (ctor + params) equals PREVIEW_PRIMITIVES`,
      sameConstructor && sameParameters,
    );

    const realMat = real.material;
    check(
      `ai-preview: real addPrimitive('${kind}') material equals PREVIEW_MATERIAL_PARAMS`,
      realMat.roughness === PREVIEW_MATERIAL_PARAMS.roughness &&
        realMat.metalness === PREVIEW_MATERIAL_PARAMS.metalness &&
        realMat.side === PREVIEW_MATERIAL_PARAMS.side,
    );
  }

  let unknownThrew = false;
  try {
    buildPreviewGeometry('banana');
  } catch {
    unknownThrew = true;
  }
  check('ai-preview: unknown kind throws instead of building nothing', unknownThrew);

  // ---- material parameters (must equal addPrimitive) -----------------------
  check(
    'ai-preview: material params match addPrimitive (roughness .6 / metalness .1)',
    PREVIEW_MATERIAL_PARAMS.roughness === 0.6 && PREVIEW_MATERIAL_PARAMS.metalness === 0.1,
  );
  check(
    'ai-preview: material is DoubleSide (matches addPrimitive)',
    PREVIEW_MATERIAL_PARAMS.side === THREE.DoubleSide,
  );

  const mat = makePreviewMaterial(0xff6b6b);
  check(
    'ai-preview: built material is a MeshStandardMaterial with those params',
    mat.isMeshStandardMaterial &&
      mat.roughness === 0.6 &&
      mat.metalness === 0.1 &&
      mat.side === THREE.DoubleSide,
  );
  check(
    'ai-preview: built material takes the payload colour',
    mat.color.getHex() === 0xff6b6b,
  );
  mat.dispose();

  // ---- colour coercion -----------------------------------------------------
  check('ai-preview: colour int passes through', previewColor(0xff6b6b) === 0xff6b6b);
  check('ai-preview: #rrggbb string parses', previewColor('#ff6b6b') === 0xff6b6b);
  check('ai-preview: bare rrggbb string parses', previewColor('ff6b6b') === 0xff6b6b);
  check('ai-preview: #rgb shorthand parses', previewColor('#f6b') === 0xff66bb);
  check('ai-preview: garbage colour falls back to white', previewColor('plaid') === 0xffffff);
  check(
    'ai-preview: out-of-range colour int is clamped',
    previewColor(0x1ffffff) === 0xffffff && previewColor(-5) === 0,
  );

  // ---- camera fitting maths ------------------------------------------------
  const box = new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
  const fit = computePreviewFrame(box, 4 / 3, 45, 0.2);

  check(
    'ai-preview: frame targets the box centre',
    fit.target.every((v, i) => Math.abs(v - 0) < 1e-9) && fit.target.length === 3,
  );
  check(
    'ai-preview: frame radius is half the box diagonal',
    Math.abs(fit.radius - Math.sqrt(3)) < 1e-9,
  );
  const camDist = Math.hypot(
    fit.position[0] - fit.target[0],
    fit.position[1] - fit.target[1],
    fit.position[2] - fit.target[2],
  );
  check('ai-preview: camera sits exactly `distance` from the target', Math.abs(camDist - fit.distance) < 1e-6);
  check(
    'ai-preview: camera direction is the elevated 3/4 view (all positive)',
    fit.position[0] > 0 && fit.position[1] > 0 && fit.position[2] > 0,
  );
  check('ai-preview: camera looks at the target (position − target points back)', camDist > 0);
  check(
    'ai-preview: near plane is in front of the bounding sphere',
    fit.near > 0 && fit.near <= fit.distance - fit.radius,
  );
  check(
    'ai-preview: far plane contains the whole bounding sphere',
    fit.far >= fit.distance + fit.radius,
  );

  const halfV = (45 * Math.PI) / 180 / 2;
  const subtended = Math.asin(Math.min(1, fit.radius / fit.distance));
  check(
    'ai-preview: 20% padding leaves the sphere strictly inside the vertical FOV',
    subtended < halfV - 1e-6,
  );

  const noPad = computePreviewFrame(box, 4 / 3, 45, 0);
  const subtendedNoPad = Math.asin(Math.min(1, noPad.radius / noPad.distance));
  check(
    'ai-preview: padding 0 makes the sphere exactly touch the FOV',
    Math.abs(subtendedNoPad - halfV) < 1e-6,
  );

  // Wide aspect must not be framed by the (larger) horizontal FOV alone.
  const tall = computePreviewFrame(box, 0.5, 45, 0.2);
  const wide = computePreviewFrame(box, 4, 45, 0.2);
  check(
    'ai-preview: narrower aspect pushes the camera further back',
    tall.distance > wide.distance,
  );

  // ---- degenerate inputs must never throw or produce NaN -------------------
  const empty = new THREE.Box3();
  const fallback = computePreviewFrame(empty, 1, 45, 0.2);
  check(
    'ai-preview: empty box falls back to finite framing',
    fallback.position.every(Number.isFinite) &&
      fallback.near > 0 &&
      fallback.far > fallback.near,
  );

  const weird = computePreviewFrame(null, Number.NaN, Number.NaN, Number.NaN);
  check(
    'ai-preview: null box / NaN aspect / NaN fov stays finite',
    weird.position.every(Number.isFinite) && Number.isFinite(weird.distance),
  );

  const flat = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 4));
  const flatFit = computePreviewFrame(flat, 1, 45, 0.2);
  check(
    'ai-preview: a zero-volume plane still gets a non-zero radius',
    flatFit.radius > 0 && flatFit.distance > 0,
  );
}
