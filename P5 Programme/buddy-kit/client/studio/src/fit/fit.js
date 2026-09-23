/**
 * Fit engine — load a gear GLB/GLTF/OBJ/FBX, auto-seat it on a socket bone of the
 * CURRENT rig, fine-tune with the gizmo, and bake the result to a downloadable
 * "pre-fitted" GLB (or a full dressed-model GLB with everything worn at once).
 *
 * Fits are relative to whatever model the user is working on — there is no
 * bundled champion. A downloaded pre-fitted piece stores its bone key and re-attaches
 * cleanly to any later model that has that same bone name.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { SLOT_TO_SOCKET, FIT_SOCKET_PATTERNS, DEFAULT_GEAR_SCALE } from './slots.js';
import { motionClips } from '../rig/motion.js';

/** A piece is a bilateral PAIR authored around the body midline (e.g. a set of two
 * legs, two ears). Such a piece must not be recentred onto one socket — the pair
 * layout IS the design; auto-fit seats the pair's CENTER on the midline instead. */
export function isBilateralPair(object, box) {
  const centers = [];
  object.traverse((o) => {
    if (!o.isMesh || o.visible === false || !o.geometry) return;
    o.geometry.computeBoundingBox();
    centers.push(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld).getCenter(new THREE.Vector3()));
  });
  if (centers.length < 2) return false;
  const diag = box.getSize(new THREE.Vector3()).length() || 1e-6;
  const tol = diag * 0.15;
  const mirrored = centers.every((c) => centers.some((c2) =>
    Math.abs(c2.x + c.x) < tol && Math.abs(c2.y - c.y) < tol && Math.abs(c2.z - c.z) < tol));
  if (!mirrored) return false;
  const xs = centers.map((c) => c.x);
  const ys = centers.map((c) => c.y);
  const zs = centers.map((c) => c.z);
  const xSpread = Math.max(...xs) - Math.min(...xs);
  const otherSpread = Math.max(Math.max(...ys) - Math.min(...ys), Math.max(...zs) - Math.min(...zs));
  return xSpread > otherSpread * 1.2;
}

/** Visible-mesh bounding box in WORLD space. Refreshes world matrices first (a
 * freshly parsed model has stale matrixWorld and measures ~10x wrong) and skips
 * invisible meshes + outline shells. */
export function visibleBox(object, out) {
  const box = out || new THREE.Box3();
  box.makeEmpty();
  object.updateWorldMatrix(true, true);
  object.traverse((o) => {
    if (!o.isMesh || o.visible === false || !o.geometry || o.userData.isOutline) return;
    o.geometry.computeBoundingBox();
    box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));
  });
  return box;
}

/** Refuse rigged characters — gear is a prop. A skinned/boned upload would export
 * a skin of null joints and corrupt every consumer. */
export function isRigged(object) {
  let rigged = false;
  object.traverse((o) => {
    if (o.isSkinnedMesh || o.isBone) rigged = true;
  });
  return rigged;
}

/** Find a socket bone on the current rig by bone-family key. Exact base-name match
 * wins; otherwise the first bone matching the family's regex (case-insensitive). */
export function findSocketBone(rig, socket) {
  if (!rig) return null;
  const pat = FIT_SOCKET_PATTERNS[socket];
  let first = null;
  let fallback = null;
  for (const [name, bone] of rig.bones) {
    const base = name.replace(/^mixamorig:/i, '');
    if (String(socket).toLowerCase() === base.toLowerCase()) return bone;
    if (!pat) continue;
    if (pat instanceof RegExp) {
      if (!first && pat.test(name)) first = bone;
    } else {
      if (!first && pat.first && pat.first.test(name)) first = bone;
      if (!fallback && pat.fallback && pat.fallback.test(name)) fallback = bone;
    }
  }
  return first || fallback || null;
}

/** Compute the model's height, crown (topmost point over horizontal midpoint) and
 * floor (lowest point), used for champion-relative sizing and seat anchors. */
export function measureModel(studio) {
  const box = visibleBox(studio.group);
  if (box.isEmpty()) return null;
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  return {
    height: size.y || 1,
    crown: new THREE.Vector3(center.x, box.max.y, center.z),
    floorY: box.min.y,
  };
}

/** True when the model looks like a humanoid/biped champion (it has both a chest
 * family socket and leg-family sockets). Used only for the download hint text. */
export function hasHumanoidSockets(rig) {
  if (!rig) return false;
  return !!(findSocketBone(rig, 'chest') && findSocketBone(rig, 'legL'));
}

/**
 * Auto-fit a gear prop onto a named BONE of the current rig.
 * @param {object} args - { rig, measure, boneKey, group, paired, activeIsStandIn }
 * @returns {object|null} the socket bone, or null if none matched
 */
export function socketFitProp({ rig, measure, boneKey, group, paired, activeIsStandIn }) {
  const target = findSocketBone(rig, boneKey);
  if (!target) return null;
  if (group.parent) group.parent.remove(group);

  const worldScale = new THREE.Vector3();
  target.getWorldScale(worldScale);
  const avgScale = (worldScale.x + worldScale.y + worldScale.z) / 3 || 1;
  const correction = 1 / avgScale;
  group.scale.setScalar((group.userData.baseScale || 1) * correction);
  group.quaternion.copy(target.getWorldQuaternion(new THREE.Quaternion()).invert());
  target.add(group);
  group.updateWorldMatrix(true, true);

  const bonePos = target.getWorldPosition(new THREE.Vector3());
  let anchor = null;
  if (paired) {
    anchor = new THREE.Vector3(0, bonePos.y, bonePos.z);
  } else {
    anchor = new THREE.Vector3(bonePos.x, bonePos.y, bonePos.z);
  }
  // Seat the piece's visible centre on the anchor, converted into the bone's local frame.
  const c = visibleBox(group).getCenter(new THREE.Vector3());
  const delta = anchor.clone().sub(c);
  const o = group.getWorldPosition(new THREE.Vector3());
  group.position.copy(target.worldToLocal(o.clone().add(delta)));
  group.updateMatrixWorld(true, true);
  return target;
}

/** Guess a sensible bone to seat a freshly-loaded piece onto, without a slot.
 * Prefers chest, then head, then hips, then the first bone in the rig. */
export function guessBone(rig) {
  if (!rig || !rig.bones) return null;
  return findSocketBone(rig, 'chest')
    || findSocketBone(rig, 'head')
    || findSocketBone(rig, 'hips')
    || rig.bones.values().next().value || null;
}

/** Read pre-fitted bake metadata (written by bakeFittedGLB) off a loaded piece.
 * Format-3 bakes carry the socket BONE key + a LOCAL piece transform under that
 * bone (pose-invariant), so re-loading must attach at that exact TRS — a generic
 * re-seat would reset the fitter's gizmo fine-tuning. */
export function readPrefitMeta(group) {
  let meta = { fitLocal: false };
  group.traverse((o) => {
    const u = o.userData || {};
    if (!u.championFit) return;
    meta = {
      fitKey: u.championFit,
      slot: u.championSlot || null,
      fitLocal: !!u.fitLocal,
    };
  });
  return meta;
}

/** Attach gear that was baked as pre-fitted (it carries championFit + fitLocal).
 * fitLocal bakes: whole attach is parenting under the socket bone — the baked
 * TRS IS the local transform, so re-attaching keeps the exact authored pose.
 * Legacy world-relative bakes fall back to the world-preserving attach (their
 * TRS is relative to the bone origin, not a fitLocal local frame). */
export function attachPrefittedGroup(group, rig, fitKey) {
  const target = findSocketBone(rig, fitKey);
  if (!target) return null;
  if (group.parent) group.parent.remove(group);
  if (group.userData.fitLocal || readPrefitMeta(group).fitLocal) {
    target.add(group);
  } else {
    group.position.set(0, 0, 0);
    group.rotation.set(0, 0, 0);
    group.scale.setScalar(1);
    target.getWorldPosition(group.position);
    group.updateWorldMatrix(true, false);
    target.attach(group);
  }
  group.updateWorldMatrix(true, true);
  return target;
}

/** Parse a GLB/GLTF ArrayBuffer back into a THREE.Group. Used to restore a gear
 * piece that was persisted as a baked fitted GLB. */
export function parseGLBBuffer(buffer) {
  return new Promise((res, rej) => {
    new GLTFLoader().parse(buffer, '', (gltf) => res(gltf.scene), rej);
  });
}

/** Load a gear file (GLB/GLTF/OBJ/FBX) plus any sidecar textures/bin/mtl picked in
 * the same file dialog. Resolves the raw THREE.Group (not yet fitted). */
export function loadGearFiles(files) {
  const list = Array.from(files);
  const main = list.find((f) => /\.(glb|gltf|fbx|obj)$/i.test(f.name));
  if (!main) return Promise.reject(new Error('No .glb / .gltf / .fbx / .obj model among the chosen files.'));

  const blobMap = new Map();
  list.forEach((f) => {
    if (f !== main) blobMap.set(f.name.toLowerCase(), URL.createObjectURL(f));
  });
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    const base = decodeURIComponent(String(url).split(/[\\/]/).pop() || '').toLowerCase();
    return blobMap.get(base) || url;
  });

  const ext = main.name.split('.').pop().toLowerCase();
  const read = (asText) =>
    new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload = () => res(reader.result);
      reader.onerror = () => rej(reader.error);
      if (asText) reader.readAsText(main);
      else reader.readAsArrayBuffer(main);
    });

  return read(ext === 'obj').then((data) => {
    let root;
    if (ext === 'obj') root = new OBJLoader(manager).parse(data);
    else if (ext === 'fbx') root = new FBXLoader(manager).parse(data, '');
    else {
      return new Promise((res, rej) => {
        new GLTFLoader(manager).parse(data, '', (gltf) => res(gltf.scene), rej);
      });
    }
    return root;
  }).then((root) => {
    root.name = main.name.replace(/\.(glb|gltf|fbx|obj)$/i, '');
    return root;
  });
}

/** Build a pristine clone of the gear (original materials, no outline shells) and
 * size its baseScale so the piece fits the model height at the default gear scale. */
export function prepareGear(raw, measure) {
  const box = visibleBox(raw);
  const sphere = new THREE.Sphere();
  box.getBoundingSphere(sphere);
  const diameter = Math.max(sphere.radius * 2, 1e-6);
  const baseScale = ((measure ? measure.height : 1.2) * DEFAULT_GEAR_SCALE) / diameter;
  raw.userData.baseScale = baseScale;
  raw.userData.paired = isBilateralPair(raw, box);
  return { box, baseScale };
}

/* Bake ONE fitted piece to a downloadable "pre-fitted" GLB. Stores the socket's
 * bone key + the LOCAL transform under that bone (pose-invariant), so it re-attaches
 * to any later model with the same bone name.
 */
export function bakeFittedGLB(entry, rig) {
  return new Promise((resolve, reject) => {
    const target = rig.bones.get(entry.boneKey);
    if (!target && entry.boneKey !== null) return reject(new Error('Socket bone no longer exists: ' + entry.boneKey));
    rig.root.updateMatrixWorld(true);
    target?.updateWorldMatrix(true, true);
    entry.group.updateMatrixWorld(true, true);
    const matrixWorld = entry.group.matrixWorld.clone();

    const rel = target ? new THREE.Matrix4().copy(target.matrixWorld).invert().multiply(matrixWorld) : matrixWorld;
    const root = entry.pristine.clone(true);
    root.traverse(o => {
      delete o.userData.championFit; delete o.userData.championSlot;
      delete o.userData.fitLocal; delete o.userData.studioGear;
    });
    rel.decompose(root.position, root.quaternion, root.scale);
    root.userData = Object.assign({}, root.userData, {
      championFit: entry.boneKey,
      championSlot: entry.boneKey,
      fitLocal: true,
    });
    remapSkeletonBones(root);
    new GLTFExporter().parse(root, resolve, reject, { binary: true });
  });
}

/** Temporarily detach editor-only objects while cloning; always restore the live scene. */
function detachDuring(source, predicate, fn) {
  const removed = [];
  source.traverse((o) => {
    if (predicate(o) && o.parent) removed.push([o, o.parent]);
  });
  for (const [o] of removed) o.removeFromParent();
  let result;
  try {
    result = fn();
  } finally {
    for (const [o, parent] of removed) parent.add(o);
  }
  return result;
}

/* Three r185's SkinnedMesh.copy() SHARES `this.skeleton` with the source mesh.
 * After a deep clone (bakeDressed/bakeFittedGLB) every skinned mesh therefore
 * still points at the ORIGINAL live bones, which are not in the exported clone's
 * node map — GLTFExporter then writes `skin.joints` as `[null, null, ...]`, an
 * invalid glTF that Blender refuses to open. Re-map each clone onto the CLONED
 * bones (matched by name) while keeping the live inverse-bind matrices. */
function remapSkeletonBones(root) {
  const clonedBones = new Map();
  root.traverse((o) => {
    if (o.isBone && !clonedBones.has(o.name)) clonedBones.set(o.name, o);
  });
  root.traverse((o) => {
    if (!o.isSkinnedMesh || !o.skeleton) return;
    const live = o.skeleton;
    const mapped = live.bones.map((b) => clonedBones.get(b.name));
    if (mapped.length !== live.bones.length || mapped.some((b) => !b)) return;
    o.skeleton = new THREE.Skeleton(mapped, live.boneInverses);
  });
}

/** Export a reusable champion with editable attachments, rig metadata and saved motion. */
export async function bakeDressed(studio, entries) {
  studio.rig?.readPose();
  const graph = studio.rig?.graph.toJSON();
  const clips = graph?.motion ? motionClips(studio.rig, graph.motion.settings) : [];
  return new Promise((resolve, reject) => {
    const isHelper = (o) => o.name === '__outline' || o.userData && (o.userData.isSkeletonHelper || o.userData.isOutline || o.userData.isJointBall || o.userData.isRigLink);
    // The live gear groups ALREADY ride their socket bones inside studio.group, so
    // a straight scene clone would export each piece twice (once as the live copy,
    // once as the pristine re-add below). Detach the live gear during the clone,
    // then re-attach exactly ONE pristine copy per piece under its bone.
    const isLiveGear = (o) => entries.some((e) => e.group === o);
    const root = detachDuring(studio.group, (o) => isHelper(o) || isLiveGear(o), () => studio.group.clone(true));
    for (const entry of entries) {
      const bone = findBoneIn(root, entry.boneKey);
      const gear = entry.pristine.clone(true);
      gear.traverse((o) => {
        if (o.userData) {
          delete o.userData.studioGear;
          delete o.userData.championFit;
          delete o.userData.championSlot;
          delete o.userData.fitLocal;
        }
      });
      // The pristine snapshot predates the isGear flag, so re-apply it — a dressed
      // champion re-imported later must land back under the Gear submenu, never the
      // Shapes list.
      gear.traverse((o) => {
        if (o.isMesh || o === gear) o.userData = Object.assign({}, o.userData, { isGear: true });
      });
      gear.position.copy(entry.group.position);
      gear.quaternion.copy(entry.group.quaternion);
      gear.scale.copy(entry.group.scale);
      gear.userData.studioGear = { bone: bone?.name || null, name: entry.name };
      if (bone) bone.add(gear);
      else {
        entry.group.updateWorldMatrix(true, false);
        entry.group.matrixWorld.decompose(gear.position, gear.quaternion, gear.scale);
        root.add(gear);
      }
    }
    remapSkeletonBones(root);
    if (clips.length) { root.traverse(o => { if (o.isBone) o.quaternion.identity(); }); graph.pose = {}; }
    if (graph) root.userData.rig = graph;
    new GLTFExporter().parse(root, resolve, reject, { binary: true, animations: clips });
  });
}

function findBoneIn(root, name) {
  let found = null;
  root.traverse((o) => {
    if (!found && o.name === name) found = o;
  });
  return found;
}

export function bakedFileName(name) {
  return (name || 'gear').replace(/(-fitted)?\.(glb|gltf|fbx|obj)$/i, '') + '-fitted.glb';
}

export { SLOT_TO_SOCKET };
