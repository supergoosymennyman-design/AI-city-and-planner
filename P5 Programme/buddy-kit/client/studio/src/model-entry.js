// model-entry.js — "Model Studio": the SAME-ORIGIN City ↔ Studio hand-off page.
//
// The City (city-builder/prop-library.js) saves a draft with
// city-common/model-transfer.js and opens `/studio/model.html?transfer=<id>`.
// This page reads that draft, lets the child move / tint / add a part, then
// writes the edited GLB back with `completeModelTransfer` and returns to the
// City with `?studioTransfer=<id>`, where the City swaps it onto that one placed
// object. The transfer store is same-origin IndexedDB, which is exactly why this
// page has to live inside the Vite Studio rather than the separate Fit Studio
// origin.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { readModelTransfer, completeModelTransfer } from '../../city-common/model-transfer.js';

const STR = {
  en: {
    title: 'Edit for AI City',
    intro: 'Move, tint or add a part, then save it back to your city.',
    move: 'Move', rotate: 'Rotate', scale: 'Scale',
    addPart: 'Add a part', undo: 'Undo', redo: 'Redo',
    cancel: 'Back to my city', save: 'Save to my city',
    loading: 'Opening your model…',
    expired: 'This edit has expired. Go back to your city and try again.',
    opened: 'Editing {name}. Click a part to select it.',
    addHint: 'Part added — drag the arrows to place it.',
    badPart: 'That part could not be opened.',
    badModel: 'This model could not be opened safely.',
    saving: 'Saving…',
    saveFail: 'Could not save: {msg}',
    legend: 'Drag to orbit · scroll to zoom · click a part to select',
  },
  'zh-Hant': {
    title: '在造型工作室編輯',
    intro: '移動、上色或加上部件，然後儲存回你的城市。',
    move: '移動', rotate: '旋轉', scale: '縮放',
    addPart: '加上部件', undo: '復原', redo: '重做',
    cancel: '返回我的城市', save: '儲存到我的城市',
    loading: '正在開啟你的模型…',
    expired: '這次編輯已過期，請返回城市再試一次。',
    opened: '正在編輯 {name}。點一下部件來選取。',
    addHint: '已加入部件 — 拖曳箭頭來放置。',
    badPart: '無法開啟這個部件。',
    badModel: '無法安全開啟這個模型。',
    saving: '正在儲存…',
    saveFail: '無法儲存：{msg}',
    legend: '拖曳環繞 · 滾輪縮放 · 點選部件',
  },
};

let lang = 'en';
try { lang = localStorage.getItem('hk_ai_city_lang_v1') || 'en'; } catch { /* private mode */ }
if (!STR[lang]) lang = 'en';
document.documentElement.lang = lang === 'zh-Hant' ? 'zh-Hant' : 'en';
const t = (key, vars) => {
  let out = STR[lang]?.[key] ?? STR.en[key] ?? key;
  if (vars) for (const [name, value] of Object.entries(vars)) out = out.replace(`{${name}}`, String(value));
  return out;
};
for (const el of document.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t);

const id = new URLSearchParams(location.search).get('transfer');
const statusEl = document.getElementById('status');
const setStatus = (text) => { statusEl.textContent = text; };
const controls = ['save', 'undo', 'redo', 'tint', 'parts'].map((key) => document.getElementById(key));

const view = document.getElementById('view');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0c1622);
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 2000);
camera.position.set(7, 5, 9);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
view.append(renderer.domElement);

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.target.set(0, 2, 0);
const transform = new TransformControls(camera, renderer.domElement);
transform.setSize(1.1);
// A transform drag snapshots the PRE-drag state (fired at drag start, before the
// object moves) so undo returns to before the drag.
transform.addEventListener('dragging-changed', (event) => {
  orbit.enabled = !event.value;
  if (event.value) snap();
});
scene.add(transform.getHelper());
scene.add(new THREE.HemisphereLight(0xe9ffff, 0x24313a, 2.4));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
keyLight.position.set(5, 9, 6);
scene.add(keyLight);
scene.add(new THREE.GridHelper(18, 18, 0x386166, 0x203338));

const highlight = new THREE.BoxHelper(new THREE.Object3D(), 0xffd23c);
highlight.visible = false;
scene.add(highlight);

let draft = null, root = null, selected = null;
const undoStack = [], redoStack = [];

function disposeTree(node) {
  node.traverse((o) => {
    o.geometry?.dispose?.();
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) m?.dispose?.();
  });
}

/** The current edit as a GLTF JSON string, for the local undo history. */
const snapshot = () => (root ? JSON.stringify(root.toJSON()) : null);

function snap() {
  const state = snapshot();
  if (!state) return;
  undoStack.push(state);
  if (undoStack.length > 20) undoStack.shift();
  redoStack.length = 0;
}

function selectPart(mesh) {
  selected = mesh?.isMesh ? mesh : null;
  if (selected || root) transform.attach(selected || root);
  if (selected) { highlight.setFromObject(selected); highlight.visible = true; }
  else highlight.visible = false;
}

async function parseScene(source, basePath = '') {
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(source, basePath, (gltf) => resolve(gltf.scene), reject);
  });
}

function mountRoot(node) {
  root = node;
  root.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
  scene.add(root);
  frameCamera();
}

function frameCamera() {
  if (!root) return;
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z, 0.5);
  orbit.target.copy(centre);
  camera.position.set(centre.x + radius * 2.2, centre.y + radius * 1.6, centre.z + radius * 2.6);
  camera.updateProjectionMatrix();
}

/** Replace the document with a saved state (undo/redo). */
async function restoreState(state) {
  if (root) { scene.remove(root); disposeTree(root); }
  selected = null; highlight.visible = false; transform.detach();
  try { mountRoot(await parseScene(state)); selectPart(root.getObjectByProperty('isMesh', true)); }
  catch { setStatus(t('badModel')); }
}

async function undo() {
  const state = undoStack.pop();
  if (!state || !root) return;
  redoStack.push(snapshot());
  await restoreState(state);
}
async function redo() {
  const state = redoStack.pop();
  if (!state || !root) return;
  undoStack.push(snapshot());
  await restoreState(state);
}

// A transform drag snapshots the PRE-drag state so undo returns to before it.
transform.addEventListener('dragging-changed', (event) => {
  if (event.value && !dragSnapped) { dragSnapped = true; }
  if (!event.value) dragSnapped = false;
});
transform.addEventListener('mouseDown', () => { snap(); undoStack.pop(); undoStack.push(undoStack.length ? undoStack[undoStack.length - 1] : snapshot()); });
transform.addEventListener('mouseDown', () => { /* no-op: snap handled below */ });

for (const button of document.querySelectorAll('[data-mode]')) {
  button.addEventListener('click', () => { transform.mode = button.dataset.mode; });
}

document.getElementById('tint').addEventListener('input', (event) => {
  if (!selected) return;
  const mats = Array.isArray(selected.material) ? selected.material : [selected.material];
  for (const m of mats) m?.color?.set(event.target.value);
});

document.getElementById('parts').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file || !root) return;
  try {
    snap();
    const part = await parseScene(await file.arrayBuffer());
    part.position.set(0, 1.5, 0);
    root.add(part);
    selectPart(part.getObjectByProperty('isMesh', true));
    setStatus(t('addHint'));
  } catch { setStatus(t('badPart')); }
});

document.getElementById('undo').addEventListener('click', undo);
document.getElementById('redo').addEventListener('click', redo);
document.getElementById('cancel').addEventListener('click', () => {
  location.assign(draft?.returnTo || '../city-builder/');
});

document.getElementById('save').addEventListener('click', async () => {
  if (!root) { setStatus(t('badModel')); return; }
  document.getElementById('save').disabled = true;
  setStatus(t('saving'));
  try {
    const bytes = await new Promise((resolve, reject) => {
      new GLTFExporter().parse(root, (out) => resolve(out instanceof ArrayBuffer ? out : out.buffer), reject, { binary: true, onlyVisible: true });
    });
    const saved = await completeModelTransfer(id, { bytes });
    if (!saved) { setStatus(t('expired')); return; }
    const back = new URL(draft?.returnTo || '../city-builder/', location.href);
    back.searchParams.set('studioTransfer', id);
    location.assign(back.href);
  } catch (error) {
    setStatus(t('saveFail', { msg: error?.message || 'error' }));
    document.getElementById('save').disabled = false;
  }
});

renderer.domElement.addEventListener('pointerdown', (event) => {
  if (!root || transform.dragging) return;
  const rect = renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObject(root, true).find((h) => h.object.isMesh);
  if (hit) selectPart(hit.object);
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

(function loop() { requestAnimationFrame(loop); renderer.render(scene, camera); })();

(async () => {
  controls.forEach((el) => { if (el) el.disabled = true; });
  if (!id) { setStatus(t('expired')); return; }
  draft = await readModelTransfer(id);
  if (!draft?.sourceBytes) { setStatus(t('expired')); return; }
  try {
    // `sourceUrl` lets a library GLB resolve its external texture URIs; the
    // exporter then embeds them so the saved revision is self-contained. GLTFLoader
    // needs the DIRECTORY as its base path, not the GLB file itself.
    const basePath = draft.sourceUrl ? new URL('.', draft.sourceUrl).href : '';
    mountRoot(await parseScene(draft.sourceBytes, basePath));
    selectPart(root.getObjectByProperty('isMesh', true));
    controls.forEach((el) => { if (el) el.disabled = false; });
    setStatus(t('opened', { name: draft.name || 'your model' }));
  } catch { setStatus(t('badModel')); }
})();
