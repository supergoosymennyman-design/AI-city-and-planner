// Dev-only prototype of the generation plan's captureViews (Task 8): four orthographic snapshots
// of the child's build, tiled 2x2 into one square image for a single image-edit call.
// Nothing outside the browser is involved — no Blender, no server.
//
// Layout and direction follow Hunyuan3D-2mv: front top-left, left top-right, back bottom-left,
// right bottom-right, where "left" means the camera stands on the model's left, so the model's
// face points to the image's left. The studio's front is +Z and the model's left is +X.
import * as THREE from 'three';

export const VIEW_ORDER = ['front', 'left', 'back', 'right'];
const DIRECTION = { front: [0, 0, 1], left: [1, 0, 0], back: [0, 0, -1], right: [-1, 0, 0] };

/**
 * Snapshot a group from four sides and tile the shots.
 * @param {THREE.Object3D} group the child's build
 * @param {{cell?: number, background?: number, margin?: number}} [opts]
 * @returns {{grid: string, views: Record<string, string>, size: number}} PNG data URLs
 */
export function captureViews(group, opts = {}) {
  const cell = opts.cell || 512;
  const background = opts.background ?? 0x5c6169;
  const margin = opts.margin ?? 0.62;

  const box = new THREE.Box3().setFromObject(group);
  const centre = box.getCenter(new THREE.Vector3());
  const size = Math.max(...box.getSize(new THREE.Vector3()).toArray()) || 1;

  // The build is borrowed into a bare scene so the grid, the axes and the FRONT label stay out
  // of the picture, then handed straight back.
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(background);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x606468, 1.15));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  scene.add(sun);
  scene.add(sun.target);
  const parent = group.parent;
  scene.add(group);

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(cell, cell, false);
  const half = size * margin;
  const camera = new THREE.OrthographicCamera(-half, half, half, -half, 0.01, size * 12);

  const sheet = document.createElement('canvas');
  sheet.width = cell * 2;
  sheet.height = cell * 2;
  const ctx = sheet.getContext('2d');
  const cells = { front: [0, 0], left: [cell, 0], back: [0, cell], right: [cell, cell] };

  const views = {};
  try {
    for (const name of VIEW_ORDER) {
      const d = DIRECTION[name];
      camera.position.set(centre.x + d[0] * size * 3, centre.y + d[1] * size * 3, centre.z + d[2] * size * 3);
      camera.lookAt(centre);
      camera.updateProjectionMatrix();
      sun.position.copy(camera.position).add(new THREE.Vector3(0, size, 0));
      sun.target.position.copy(centre);
      sun.target.updateMatrixWorld();
      renderer.render(scene, camera);
      const [x, y] = cells[name];
      ctx.drawImage(renderer.domElement, x, y);
      views[name] = renderer.domElement.toDataURL('image/png');
    }
  } finally {
    if (parent) parent.add(group);
    renderer.dispose();
  }
  return { grid: sheet.toDataURL('image/png'), views, size };
}
