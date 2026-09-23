/**
 * gen-snapshot.js — the four snapshots of a build that route A sends (design doc §4).
 *
 * The first half is pure maths (tested in Node): which way each camera looks, one orthographic scale
 * for all four views, the background colour, and the 2x2 tiling. The browser capture (captureViews,
 * splitGridBlob) is appended below and uses these same constants.
 *
 * View convention: the studio builds face +Z (its FRONT marker). 'left' is the camera on the model's
 * OWN left (+X), so the face points to the picture's left — Hunyuan3D-2mv's convention (checked
 * against its example images, 19 Sep).
 */
import * as THREE from 'three';
import { colourDistance } from './gen-prompt.js';
import { viewDirection, normaliseTurn, clampTilt } from './gen-angles.js';

export const VIEW_ORDER = ['front', 'left', 'back', 'right'];
/**
 * The four directions at turn 0 / tilt 0 — the studio's own axes, and still the default.
 * Any other angle comes from gen-angles.js viewDirection(); this table is what it must reproduce.
 */
export const VIEW_DIRECTIONS = { front: [0, 0, 1], left: [1, 0, 0], back: [0, 0, -1], right: [-1, 0, 0] };
export const CELL = 512;
export const GRID_SIZE = 1024;
/** Top-left corner of each view in the grid — must match the order the route A prompt describes. */
export const GRID_CELLS = { front: [0, 0], left: [512, 0], back: [0, 512], right: [512, 512] };
/** Flat grounds, never white or black: white parts vanish on white; a floor or shadow becomes geometry. */
export const BACKGROUNDS = [0xa0a4aa, 0xb3c7e6, 0xc5e1bd];
/** A background closer than this (RGB distance) to any build colour counts as clashing. */
export const MIN_CONTRAST = 60;

/**
 * Breathing room around the build, as a fraction of its largest extent.
 *
 * This was 0.1, which left the build filling 91% of the frame and touching the edges — a lone
 * cylinder came out as a rectangle of colour with a hairline border. Two reasons that is wrong:
 * Hunyuan3D-2mv's own example sheets (assets/example_mv_images) all sit around 78% of the frame
 * with clear space on every side, and route A asks the Space for background removal
 * (check_box_rembg), which needs background to cut against. 0.3 puts the build at ~77%.
 */
export const FIT_MARGIN = 0.3;

/**
 * One square orthographic view that holds the whole build from every side, plus a margin.
 * Using the largest extent over all three axes keeps the SAME scale in all four views.
 * @param {number[]} min build bounding-box min [x,y,z]
 * @param {number[]} max build bounding-box max [x,y,z]
 * @param {number} [margin] fraction added around the build
 * @returns {{center:number[], halfSize:number}}
 */
export function fitOrtho(min, max, margin = FIT_MARGIN) {
  const center = [0, 1, 2].map((i) => (min[i] + max[i]) / 2);
  const extent = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  if (!(extent > 0)) throw new Error('fitOrtho: the build is empty');
  return { center, halfSize: (extent / 2) * (1 + margin) };
}

/**
 * Where the camera sits for one view: 4 half-sizes out along the view direction, looking at the centre.
 *
 * `up` stays world up. That is safe only because tilt is clamped well short of overhead (gen-angles
 * MAX_TILT): a camera looking straight down has no usable up vector and the view would flip.
 *
 * @param {'front'|'left'|'back'|'right'} view
 * @param {number[]} center
 * @param {number} halfSize
 * @param {{turn?: number, tilt?: number}} [angles] rotates and raises all four cameras together
 */
export function cameraPose(view, center, halfSize, angles = {}) {
  if (!VIEW_DIRECTIONS[view]) throw new Error(`cameraPose: unknown view "${view}"`);
  const d = viewDirection(view, angles.turn || 0, angles.tilt || 0);
  const dist = halfSize * 4;
  return {
    position: [center[0] + d[0] * dist, center[1] + d[1] * dist, center[2] + d[2] * dist],
    target: [...center],
    up: [0, 1, 0],
  };
}

/**
 * The first background far enough from every build colour; if all clash, the least-bad one.
 * @param {number[]} hexes the build's colours
 */
export function chooseBackground(hexes, candidates = BACKGROUNDS) {
  let best = candidates[0];
  let bestMin = -1;
  for (const c of candidates) {
    const closest = Math.min(Infinity, ...(hexes || []).map((h) => colourDistance(c, h)));
    if (closest >= MIN_CONTRAST) return c;
    if (closest > bestMin) {
      bestMin = closest;
      best = c;
    }
  }
  return best;
}

/**
 * Visible-area proxy per colour: each shape's bounding-box surface area, summed by colour.
 * @param {{hex:number, size:number[]}[]} items
 * @returns {{hex:number, area:number}[]}
 */
export function colourAreas(items) {
  const byHex = new Map();
  for (const { hex, size } of items || []) {
    const [x, y, z] = size;
    byHex.set(hex, (byHex.get(hex) || 0) + 2 * (x * y + y * z + x * z));
  }
  return [...byHex.entries()].map(([hex, area]) => ({ hex, area }));
}

/** 0xa0a4aa → '#a0a4aa'. */
export function hexToCss(hex) {
  return `#${(hex >>> 0).toString(16).padStart(6, '0').slice(-6)}`;
}

// ---- Browser capture (WebGL + canvas; not used by the Node tests) ----

/** Resolve a canvas to a PNG Blob. */
function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('the snapshot could not be read'))), 'image/png');
  });
}

/**
 * Render the build from the four fixed cameras and tile the 2x2 grid (design doc §4).
 *
 * Uses its OWN small renderer (disposed at the end): the viewport's renderer clears its drawing buffer
 * after compositing, so a late toDataURL/toBlob on it comes back black (three.js manual, "Taking a
 * screenshot"). Here preserveDrawingBuffer is on and each view is read straight after render().
 * Shapes are drawn as plain meshes sharing the studio's geometry/material (never disposed here), so
 * the grid, axes, labels, joint balls, outlines and gizmo are simply not in this scene.
 * @param {THREE.Mesh[]} shapes the shapes to picture — the child's selection, or the whole build
 * @param {{turn?: number, tilt?: number}} [options] the angle the four cameras are set to
 */
export async function captureViews(shapes, options = {}) {
  const turn = normaliseTurn(options.turn);
  const tilt = clampTilt(options.tilt);
  if (!shapes || !shapes.length) throw new Error('captureViews: add at least one shape first');
  const scene = new THREE.Scene();
  const box = new THREE.Box3();
  const hexes = [];
  const sized = [];
  for (const shape of shapes) {
    shape.updateWorldMatrix(true, false);
    const copy = new THREE.Mesh(shape.geometry, shape.material);
    copy.matrixAutoUpdate = false;
    copy.matrix.copy(shape.matrixWorld);
    copy.matrixWorldNeedsUpdate = true;
    scene.add(copy);
    const b = new THREE.Box3().setFromObject(shape);
    box.union(b);
    const mat = Array.isArray(shape.material) ? shape.material[0] : shape.material;
    const hex = mat && mat.color && typeof mat.color.getHex === 'function' ? mat.color.getHex() : null;
    if (Number.isFinite(hex)) {
      hexes.push(hex);
      sized.push({ hex, size: b.getSize(new THREE.Vector3()).toArray() });
    }
  }
  const background = chooseBackground(hexes);
  scene.background = new THREE.Color(background);
  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const light = new THREE.DirectionalLight(0xffffff, 1.4);
  scene.add(light, light.target);

  const { center, halfSize } = fitOrtho(box.min.toArray(), box.max.toArray());
  const camera = new THREE.OrthographicCamera(-halfSize, halfSize, halfSize, -halfSize, 0.01, halfSize * 10);
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(CELL, CELL, false);
  const views = {};
  try {
    for (const view of VIEW_ORDER) {
      const pose = cameraPose(view, center, halfSize, { turn, tilt });
      camera.position.fromArray(pose.position);
      camera.up.fromArray(pose.up);
      camera.lookAt(center[0], center[1], center[2]);
      camera.updateProjectionMatrix();
      light.position.set(pose.position[0], pose.position[1] + halfSize * 2, pose.position[2]); // light from the camera side
      light.target.position.fromArray(center);
      renderer.render(scene, camera);
      views[view] = await canvasToBlob(renderer.domElement);
    }
  } finally {
    renderer.dispose();
    renderer.forceContextLoss();
  }

  const grid = document.createElement('canvas');
  grid.width = GRID_SIZE;
  grid.height = GRID_SIZE;
  const ctx = grid.getContext('2d');
  ctx.fillStyle = hexToCss(background);
  ctx.fillRect(0, 0, GRID_SIZE, GRID_SIZE);
  for (const view of VIEW_ORDER) {
    const bitmap = await createImageBitmap(views[view]);
    ctx.drawImage(bitmap, GRID_CELLS[view][0], GRID_CELLS[view][1], CELL, CELL);
    bitmap.close();
  }
  return { views, grid: await canvasToBlob(grid), background, colours: colourAreas(sized), turn, tilt, shapeCount: shapes.length };
}

/**
 * Cut an edited 2x2 grid back into its four views (any size; each view is a quarter).
 * @param {Blob} gridBlob
 * @returns {Promise<{front: Blob, left: Blob, back: Blob, right: Blob}>}
 */
export async function splitGridBlob(gridBlob) {
  const bitmap = await createImageBitmap(gridBlob);
  const w = Math.floor(bitmap.width / 2);
  const h = Math.floor(bitmap.height / 2);
  const out = {};
  try {
    for (const view of VIEW_ORDER) {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const [gx, gy] = GRID_CELLS[view];
      c.getContext('2d').drawImage(bitmap, (gx / CELL) * w, (gy / CELL) * h, w, h, 0, 0, w, h);
      out[view] = await canvasToBlob(c);
    }
  } finally {
    bitmap.close();
  }
  return out;
}
