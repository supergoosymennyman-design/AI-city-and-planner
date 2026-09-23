import * as THREE from 'three';
import { Viewport } from '../../viewport.js';

// Importing the class does not construct a renderer. Its real camera methods can run with the
// rendering-only constructor skipped, so tests cover projection planes as well as pure maths.
function view() {
  const v = Object.create(Viewport.prototype);
  v.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  v.camera.position.set(5, 4, 6);
  v.controls = {
    target: new THREE.Vector3(0, 1, 0),
    update() { v.camera.lookAt(this.target); v.camera.updateMatrixWorld(); },
  };
  return v;
}

export default function (check) {
  for (const size of [0.001, 2, 10000]) {
    const v = view();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size));
    mesh.position.set(2, 3, 4);
    v.frameContents(mesh);
    let visible = true;
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
      const point = new THREE.Vector3(x, y, z).multiplyScalar(size / 2).add(mesh.position).project(v.camera);
      visible &&= [point.x, point.y, point.z].every((n) => Number.isFinite(n) && Math.abs(n) < 1);
    }
    check(`viewport: framing a ${size}-unit model keeps every corner inside the camera frustum`, visible);
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
  const v = view();
  v.documentRoot = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry());
  mesh.position.set(20, 3, 4);
  v.documentRoot.add(mesh);
  v.resetView();
  check('viewport: Reset view frames the current document at the default angle',
    v.controls.target.distanceTo(mesh.position) < 1e-9
    && v.camera.position.clone().sub(v.controls.target).normalize().distanceTo(new THREE.Vector3(5, 3, 6).normalize()) < 1e-9);
  v.documentRoot.clear();
  v.resetView();
  check('viewport: Reset view still works for an empty document',
    v.camera.position.equals(new THREE.Vector3(5, 4, 6)) && v.controls.target.equals(new THREE.Vector3(0, 1, 0)));
  mesh.geometry.dispose();
  mesh.material.dispose();
}
