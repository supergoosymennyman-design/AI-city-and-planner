// Dev-only: render four orthographic views of any GLB, using the same captureViews the snapshot
// step will use. Handy for looking at a generated piece and for making evidence sheets.
// Query: ?glb=<url>&clay=<hex>&cell=<px>
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { captureViews } from './capture-views.js';

const params = new URLSearchParams(location.search);
const GLB = params.get('glb') || './inputs/wings.glb';
const CLAY = params.get('clay') ? Number.parseInt(params.get('clay'), 16) : 0xd9a06a;
const CELL = Number(params.get('cell') || 512);
const state = { ready: false, errors: [] };
window.__look = state;
window.addEventListener('error', (e) => state.errors.push(String(e.message)));
const hud = document.getElementById('hud');

(async () => {
  hud.textContent = 'Loading…';
  const gltf = await new GLTFLoader().loadAsync(GLB);
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: CLAY, roughness: 0.72, metalness: 0, side: THREE.DoubleSide });
  let vertices = 0;
  let triangles = 0;
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    vertices += o.geometry.attributes.position.count;
    triangles += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
    const mesh = new THREE.Mesh(o.geometry, material);
    mesh.applyMatrix4(o.matrixWorld);
    group.add(mesh);
  });
  const shot = captureViews(group, { cell: CELL });
  document.getElementById('sheet').src = shot.grid;
  state.grid = shot.grid;
  state.views = shot.views;
  state.stats = { vertices, triangles, size: +shot.size.toFixed(3) };
  hud.textContent = `${vertices} points · ${triangles} triangles · ${shot.size.toFixed(2)} across`;
  state.ready = true;
})().catch((err) => {
  state.errors.push(String((err && err.stack) || err));
  hud.textContent = `Failed: ${err && err.message ? err.message : err}`;
});
