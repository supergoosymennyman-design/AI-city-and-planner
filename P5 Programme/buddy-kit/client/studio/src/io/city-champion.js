import * as THREE from 'three';
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

/** City owns travel. All four clips animate bones in place. */
export function cityMotionClips(rig) {
  if (!rig?.skinBones?.length) throw new Error('Finish bending the skeleton before exporting for AI City.');
  const saved = rig.graph.motion?.key === rig.graph.structureKey() ? rig.graph.motion.settings : null;
  const legs = saved?.legs || detectLegs(rig.graph, id => rig.worldOf(id));
  if (legs.length !== 2) throw new Error('AI City export needs a biped with two leg joints.');
  const settings = saved || { legs, knees: {}, roles: detectMotionRoles(rig), gait: 'step', softness: .65, stride: 25, duration: 1.2, forward: '+z' };
  const [walk, jump] = motionClips(rig, settings);
  const [fastWalk] = motionClips(rig, { ...settings, stride: Math.min(60, settings.stride * 1.35), duration: Math.max(.4, settings.duration * .67) });
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

/** Build the same GLB the Studio download button supplies, for tests and the demo artifact. */
export async function buildCityChampion(group, rig, { championId, studioRevision = 1 } = {}) {
  const clips = cityMotionClips(rig);
  const box = new THREE.Box3().setFromObject(group);
  if (box.isEmpty()) throw new Error('The Champion has no visible body.');
  const metadata = {
    formatVersion: 1,
    championId: championId || group.uuid,
    studioRevision,
    rigKind: 'biped',
    height: box.getSize(new THREE.Vector3()).y,
    assetHash: hashModel(group, clips),
    actions: { idle: 'Idle', walk: 'Walk', run: 'Run', jump: 'Jump' },
    // Studio bones sit at their parent joint. Use the bone below each ankle
    // when there is a toe joint, so City's grounding measures the ankle.
    footBones: (rig.graph.motion?.settings?.legs || detectLegs(rig.graph, id => rig.worldOf(id)))
      .map(id => rig.graph.children(id)[0]).filter(Boolean)
      .map(id => rig.graph.children(id)[0] || id)
      .map(id => rig.bones.get(id)?.name).filter(Boolean),
    extraActions: [],
  };
  const info = collectRigInfo(group);
  if (!info.skeletonCount) throw new Error('AI City needs a skinned body.');
  const check = validateStudioChampion({ metadata, animations: clips, boneNames: info.boneNames, nodeNames: info.nodeNames, rootName: group.name });
  if (!check.ok) throw new Error(check.error);
  const graph = rig.graph.toJSON(); graph.pose = {};
  return { data: await buildGLB(group, clips, graph, metadata), metadata, clips };
}
