import * as THREE from 'three';
import { clone as cloneRiggedScene } from 'three/addons/utils/SkeletonUtils.js';
import { motionClips, detectLegs, detectMotionRoles } from '../rig/motion.js';
import { buildGLB } from './gltf.js';
import { validateStudioChampion, collectRigInfo } from '../../../city-common/champion-contract.js';

function hashModel(group, clips) {
  let hash = 2166136261;
  const feed = value => { hash ^= value; hash = Math.imul(hash, 16777619); };
  const number = value => {
    const bytes = new ArrayBuffer(4);
    new DataView(bytes).setFloat32(0, value, true);
    for (const byte of new Uint8Array(bytes)) feed(byte);
  };
  group.traverse(node => {
    if (!node.isMesh) return;
    for (const value of node.geometry.attributes.position.array) number(value);
    for (const value of node.geometry.index?.array || []) number(value);
  });
  for (const clip of clips) {
    for (const char of clip.name) feed(char.charCodeAt(0));
    for (const track of clip.tracks) for (const value of track.values) number(value);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

const isHelper = node => node.name === '__outline' || node.userData?.isOutline || node.userData?.isJointBall || node.userData?.isRigLink || node.userData?.isSkeletonHelper;

/** Clone first, then remove editor-only nodes. The live document is never modified. */
export function copyForCity(source) {
  const detached = [];
  source.traverse(node => {
    if (node !== source && isHelper(node) && node.parent && !isHelper(node.parent))
      detached.push({ node, parent: node.parent, index: node.parent.children.indexOf(node) });
  });
  for (const item of detached) item.node.removeFromParent();
  let copy;
  try { copy = cloneRiggedScene(source); }
  finally {
    for (const item of detached) {
      item.parent.add(item.node);
      item.parent.children.splice(item.parent.children.indexOf(item.node), 1);
      item.parent.children.splice(item.index, 0, item.node);
    }
  }
  const remove = [];
  copy.traverse(node => { if (isHelper(node)) remove.push(node); });
  for (const node of remove) node.removeFromParent();
  copy.visible = true;
  return copy;
}

/** Rotate the export root so the selected front becomes City's +Z. */
export function faceCityFront(copy, forward = '+z') {
  const angle = { '+z': 0, '-z': Math.PI, '+x': -Math.PI / 2, '-x': Math.PI / 2 }[forward];
  if (angle === undefined) throw new Error('Choose a valid front direction.');
  copy.rotation.y += angle;
  copy.updateMatrixWorld(true);
  return copy;
}

/** Flatten the current visible pose to ordinary textured meshes, including fitted gear. */
export function bakeCityStatue(source, forward = '+z') {
  const posed = copyForCity(source);
  posed.updateMatrixWorld(true);
  const root = new THREE.Group(); root.name = 'City creation';
  const inverse = posed.matrixWorld.clone().invert();
  posed.traverse(node => {
    if (!node.isMesh || !node.geometry?.attributes?.position) return;
    for (let ancestor = node; ancestor && ancestor !== posed.parent; ancestor = ancestor.parent) {
      if (!ancestor.visible) return;
    }
    const geometry = node.geometry.clone();
    if (node.isSkinnedMesh) {
      const positions = geometry.attributes.position;
      const vertex = new THREE.Vector3();
      for (let i = 0; i < positions.count; i++) {
        vertex.fromBufferAttribute(positions, i);
        node.applyBoneTransform(i, vertex);
        positions.setXYZ(i, vertex.x, vertex.y, vertex.z);
      }
      positions.needsUpdate = true;
      geometry.deleteAttribute('skinIndex'); geometry.deleteAttribute('skinWeight');
      if (geometry.attributes.normal) geometry.computeVertexNormals();
    }
    geometry.applyMatrix4(inverse.clone().multiply(node.matrixWorld));
    const mesh = new THREE.Mesh(geometry, node.material);
    mesh.name = node.name || 'Part'; mesh.castShadow = node.castShadow; mesh.receiveShadow = node.receiveShadow;
    root.add(mesh);
  });
  if (!root.children.length) throw new Error('Add a visible model before exporting.');
  return faceCityFront(root, forward);
}

export async function buildCityPlacement(source, { forward = '+z' } = {}) {
  return buildGLB(bakeCityStatue(source, forward));
}

/** City owns travel; Studio clips animate bones in place for any usable rig. */
export function cityMotionClips(rig, settingsOverride = null) {
  if (!rig?.skinBones?.length) throw new Error('Finish bending the skeleton before exporting animated movement.');
  const saved = settingsOverride || (rig.graph.motion?.key === rig.graph.structureKey() ? rig.graph.motion.settings : null);
  const legs = saved?.legs || detectLegs(rig.graph, id => rig.worldOf(id));
  const settings = saved || { legs, knees: {}, roles: detectMotionRoles(rig), gait: legs.length ? 'step' : 'waddle', softness: .65, stride: 25, duration: 1.2, forward: '+z' };
  let walk, jump, fastWalk;
  try {
    [walk, jump] = motionClips(rig, settings);
    [fastWalk] = motionClips(rig, { ...settings, stride: Math.min(60, settings.stride * 1.35), duration: Math.max(.4, settings.duration * .67) });
  } catch (error) {
    throw new Error(`${error.message} Correct the motion mapping in Animate, or choose solid-object movement.`);
  }
  fastWalk.name = 'Run';
  const root = rig.bones.get(rig.graph.roots()[0]);
  if (!root) throw new Error('The skeleton has no root bone.');
  const p = root.position;
  const breath = Math.max(.004, new THREE.Box3().setFromObject(rig.studio.group).getSize(new THREE.Vector3()).y * .006);
  const idle = new THREE.AnimationClip('Idle', 2, [
    new THREE.VectorKeyframeTrack(`${root.name}.position`, [0, 1, 2], [p.x, p.y, p.z, p.x, p.y + breath, p.z, p.x, p.y, p.z]),
  ]);
  return [idle, walk, fastWalk, jump];
}

function rigKind(count) { return count === 2 ? 'biped' : count === 4 ? 'quadruped' : 'other'; }

function groundContacts(copy, rig, settings, box) {
  const result = [];
  const ids = settings?.legs || detectLegs(rig.graph, id => rig.worldOf(id));
  copy.updateMatrixWorld(true);
  for (const id of ids) {
    const foot = settings?.knees?.[id]?.foot || rig.graph.children(id)[0];
    if (!foot || !rig.graph.has(foot)) continue;
    const name = rig.bones.get(foot)?.name;
    const node = name && copy.getObjectByName(name);
    if (!node) continue;
    const joint = new THREE.Vector3(...rig.worldOf(foot));
    const local = node.worldToLocal(new THREE.Vector3(joint.x, box.min.y, joint.z));
    result.push({ node: name, point: local.toArray() });
  }
  return result;
}

/** Build an export from a disposable scene copy; no document graph or pose changes. */
export async function buildCityChampion(source, rig, { championId, studioRevision = 1, forward, animationMode, motionSettings } = {}) {
  const settings = motionSettings || (rig && rig.graph.motion?.key === rig.graph.structureKey() ? rig.graph.motion.settings : null);
  const mode = animationMode || (rig?.skinBones?.length ? 'studio' : 'static');
  if (!['studio', 'static'].includes(mode)) throw new Error('Choose a valid movement mode.');
  const front = forward || settings?.forward || '+z';
  const copy = mode === 'static' ? bakeCityStatue(source, front) : copyForCity(source);
  const box = new THREE.Box3().setFromObject(copy);
  if (box.isEmpty()) throw new Error('The Champion has no visible body.');
  const clips = mode === 'studio' ? cityMotionClips(rig, settings) : [];
  const metadata = {
    formatVersion: 2, animationMode: mode,
    championId: championId || source.uuid, studioRevision,
    rigKind: mode === 'studio' ? rigKind((settings?.legs || detectLegs(rig.graph, id => rig.worldOf(id))).length) : 'other',
    height: box.getSize(new THREE.Vector3()).y,
    assetHash: hashModel(copy, clips),
    groundContacts: mode === 'studio' ? groundContacts(copy, rig, settings, box) : [],
    ...(mode === 'studio' ? { actions: { idle: 'Idle', walk: 'Walk', run: 'Run', jump: 'Jump' } } : {}),
    extraActions: [],
  };
  if (mode === 'studio') copy.traverse(node => { if (node.isBone) node.quaternion.identity(); });
  if (mode === 'studio') faceCityFront(copy, front);
  const info = collectRigInfo(copy);
  if (mode === 'studio' && !info.skeletonCount) throw new Error('Animated movement needs a skinned body. Choose solid-object movement instead.');
  const check = validateStudioChampion({ metadata, animations: clips, boneNames: info.boneNames, nodeNames: info.nodeNames, rootName: copy.name });
  if (!check.ok) throw new Error(check.error);
  const graph = mode === 'studio' ? rig.graph.toJSON() : null;
  if (graph) graph.pose = {};
  return { data: await buildGLB(copy, clips, graph, metadata), metadata, clips };
}
