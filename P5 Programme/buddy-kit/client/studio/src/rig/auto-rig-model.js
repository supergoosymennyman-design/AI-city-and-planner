import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildGLB } from '../io/gltf.js';
import { partFromMesh } from './bones.js';
import { mergeParts } from './bind.js';
import { coarseCopy } from './coarse.js';
import { SkeletonGraph } from './skeleton-graph.js';

/** Explicit selection wins; multiple unselected shapes are never silently one creature. */
export function autoRigTargets(studio) {
  const shapes = studio.shapes.filter((m) => !m.userData?.isGear);
  const selected = shapes.filter((m) => studio.selection.has(m));
  if (selected.length) return selected;
  if (shapes.length === 1) return shapes;
  throw new Error(shapes.length ? 'Select the model or all its parts in Build mode first.' : 'Build or import a model first.');
}

function graphKey(studio) {
  studio.rig?.readPose();
  return JSON.stringify(studio.rig?.graph.toJSON() || null);
}
function meshKey(mesh) {
  mesh.updateWorldMatrix(true, false);
  return [mesh.geometry.uuid, ...Object.values(mesh.geometry.attributes).map((a) => a.version), mesh.geometry.index?.version, ...mesh.matrixWorld.elements].join(':');
}

/** Capture immutable identity/placement before upload; original geometry never leaves the document. */
export async function prepareAutoRig(studio, targets = autoRigTargets(studio)) {
  const ids = new Set(targets.map((m) => m.userData.id));
  const graph = studio.rig?.graph;
  // The studio has one shared skeleton/heat solve. Replacing only some of its models
  // would silently recompute weights on the others, so require its whole existing scope.
  if (graph?.size && (graph.joints.some((j) => !ids.has(j.shape)) || studio.rig.skinnedMeshes().some((m) => !ids.has(m.userData.id)))) {
    throw new Error('Select all parts of the existing rig before replacing its skeleton. Unrigged models can stay unselected.');
  }
  if (graph) for (const j of graph.joints) {
    if (j.parent !== null && ids.has(j.shape) !== ids.has(graph.get(j.parent).shape)) throw new Error('Select all parts that share this skeleton before auto-rigging.');
  }
  const capture = { targets: targets.map((m) => ({ id: m.userData.id, key: meshKey(m) })), graphKey: graphKey(studio), name: targets.length === 1 ? targets[0].name || 'model' : `${targets.length} selected parts` };
  const merged = mergeParts(targets.map(partFromMesh));
  const box = new THREE.Box3().setFromArray(merged.position);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const scale = Math.max(size.x, size.y, size.z) / 2;
  if (!(scale > 1e-8) || !Number.isFinite(scale)) throw new Error('The model has no usable volume.');
  for (let i = 0; i < merged.position.length; i += 3) {
    for (let k = 0; k < 3; k++) merged.position[i + k] = (merged.position[i + k] - center.getComponent(k)) / scale;
  }
  const copy = coarseCopy(merged, { target: 5000 });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(copy.position, 3));
  geometry.setIndex(new THREE.BufferAttribute(copy.index, 1));
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ color: 0xaaaaaa });
  const root = new THREE.Group();
  root.add(new THREE.Mesh(geometry, material));
  try {
    capture.bytes = await buildGLB(root);
    capture.center = center.toArray();
    capture.scale = scale;
    const proxyBox = new THREE.Box3().setFromArray(copy.position);
    capture.bounds = { min: proxyBox.min.toArray(), max: proxyBox.max.toArray() };
    capture.stats = copy.stats;
    return capture;
  } finally { geometry.dispose(); material.dispose(); }
}

/** Reject stale results after edits, undo, deletion or document replacement, even if ids are reused. */
export function assertAutoRigCurrent(studio, capture) {
  if (graphKey(studio) !== capture.graphKey || capture.targets.some(({ id, key }) => {
    const mesh = studio.shapes.find((m) => m.userData.id === id);
    return !mesh || meshKey(mesh) !== key;
  })) throw new Error('The model or skeleton changed while auto-rigging. Try again with the current model.');
}

/** Parse only a self-contained service GLB; do not let a provider result fetch extra resources. */
export async function parseAutoRig(bytes) {
  const data = new DataView(bytes);
  if (bytes.byteLength < 20 || data.getUint32(0, true) !== 0x46546c67 || data.getUint32(8, true) !== bytes.byteLength || data.getUint32(16, true) !== 0x4e4f534a) throw new Error('The service returned an invalid GLB.');
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, data.getUint32(12, true))));
  if ((json.buffers || []).some((b) => b.uri) || (json.images || []).some((i) => i.uri)) throw new Error('The returned rig must be a self-contained GLB.');
  // Surface materials are unnecessary when reading joints, and image decoding can hang on a bad image.
  delete json.images; delete json.textures; delete json.materials;
  for (const mesh of json.meshes || []) for (const p of mesh.primitives) delete p.material;
  // Rebuild the GLB JSON chunk without materials; preserve its embedded binary body.
  const binaryOffset = 20 + data.getUint32(12, true);
  if (json.buffers?.length) {
    if (binaryOffset + 8 > bytes.byteLength || data.getUint32(binaryOffset + 4, true) !== 0x004e4942) throw new Error('The returned rig has no binary mesh data.');
    const bin = new Uint8Array(bytes, binaryOffset + 8, data.getUint32(binaryOffset, true));
    // Loader.parse accepts GLB directly; rebuild the JSON chunk with materials stripped instead.
    const encoded = new TextEncoder().encode(JSON.stringify(json));
    const padded = Math.ceil(encoded.length / 4) * 4;
    const clean = new ArrayBuffer(12 + 8 + padded + 8 + bin.length);
    const view = new DataView(clean), out = new Uint8Array(clean);
    view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, clean.byteLength, true);
    view.setUint32(12, padded, true); view.setUint32(16, 0x4e4f534a, true);
    out.fill(32, 20, 20 + padded); out.set(encoded, 20);
    view.setUint32(20 + padded, bin.length, true); view.setUint32(24 + padded, 0x004e4942, true); out.set(bin, 28 + padded);
    return (await new GLTFLoader().parseAsync(clean, '')).scene;
  }
  throw new Error('The returned rig has no mesh data.');
}

/** Build the new graph before any mutation. Preserve unrelated skeletons and all original surfaces. */
export function applyAutoRig(studio, capture, result) {
  assertAutoRigCurrent(studio, capture);
  result.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(result);
  if (box.isEmpty() || ['min', 'max'].some((side) => box[side].toArray().some((v, k) => !Number.isFinite(v) || Math.abs(v - capture.bounds[side][k]) > 0.08))) throw new Error('The service changed the model frame. Your original model is unchanged.');
  const bones = [];
  result.traverse((o) => { if (o.isBone) bones.push(o); });
  if (bones.length < 2 || bones.length > 256) throw new Error('The service returned no usable skeleton (2–256 joints required).');
  if (!bones.some((b) => b.parent?.isBone && b.getWorldPosition(new THREE.Vector3()).distanceTo(b.parent.getWorldPosition(new THREE.Vector3())) > 1e-6)) {
    throw new Error('The returned skeleton has no usable connected bones.');
  }
  const before = studio.rig?.graph.toJSON() || new SkeletonGraph().toJSON();
  const next = SkeletonGraph.fromJSON(before);
  const targets = capture.targets.map(({ id }) => studio.shapes.find((m) => m.userData.id === id));
  const targetIds = new Set(capture.targets.map((m) => m.id));
  for (const j of [...next.joints]) if (targetIds.has(j.shape) && next.has(j.id)) next.remove(j.id);
  const previousSkinned = studio.shapes.filter((m) => m.userData.rigSkin).map((m) => m.userData.id);
  next.targetShapes = [...new Set([...(next.targetShapes || []), ...previousSkinned, ...next.joints.map((j) => j.shape), ...targetIds])];
  const map = new Map();
  const targetBoxes = targets.map((m) => {
    m.geometry.computeBoundingBox();
    return m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld);
  });
  for (const bone of bones) {
    const p = bone.getWorldPosition(new THREE.Vector3());
    if (!p.toArray().every(Number.isFinite) || p.length() > 5) throw new Error('The service returned a joint far outside the model.');
    p.multiplyScalar(capture.scale).add(new THREE.Vector3(...capture.center));
    // Give a joint to the closest selected part so later part transforms carry its joints along.
    let owner = 0;
    for (let i = 1; i < targets.length; i++) if (targetBoxes[i].distanceToPoint(p) < targetBoxes[owner].distanceToPoint(p)) owner = i;
    const local = targets[owner].worldToLocal(p.clone()).toArray();
    const parent = bone.parent?.isBone ? map.get(bone.parent) : null;
    if (bone.parent?.isBone && !parent) throw new Error('The returned skeleton has an invalid hierarchy.');
    map.set(bone, next.add(local, parent, targets[owner].userData.id));
  }
  const after = next.toJSON();
  studio.ensureRig().restoreGraph(after);
  studio.pushRig(before, after);
  studio.select(null); // Leave the new joints visible without the old model-selection outline.
  studio.emit('rig-dirty');
  studio.emit('changed');
  return bones.length;
}

/** Release the temporary returned mesh after reading its skeleton. */
export function disposeAutoRigResult(root) {
  root?.traverse((o) => { o.geometry?.dispose(); for (const m of (Array.isArray(o.material) ? o.material : [o.material])) m?.dispose(); });
}
