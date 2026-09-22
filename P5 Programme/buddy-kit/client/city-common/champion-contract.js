// champion-contract.js — the small, versioned contract between Studio and City.
// Kept free of three.js so Studio, City and node:test use the same validator.
export const CHAMPION_FORMAT_VERSION = 1;
export const CHAMPION_ACTIONS = ['idle', 'walk', 'run'];
export const SUPPORTED_RIGS = ['biped', 'quadruped'];

const finitePositive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const trackTarget = name => String(name || '').replace(/^\./, '').split('.')[0];

export function championMetadataFromGLTF(gltf) {
  const direct = gltf?.scene?.userData?.passionaChampion || gltf?.parser?.json?.asset?.extras?.passionaChampion;
  if (direct) return direct;
  let nested = null;
  gltf?.scene?.traverse?.(node => { if (!nested && node?.userData?.passionaChampion) nested = node.userData.passionaChampion; });
  return nested;
}

/** Validate metadata and the actual clips/bones loaded from a GLB. Never throws. */
export function validateStudioChampion({ metadata, animations = [], boneNames = [], meshBounds = null } = {}) {
  if (!metadata) return { ok: false, legacy: true, error: 'No Studio movement information was found.' };
  if (metadata.formatVersion !== CHAMPION_FORMAT_VERSION) return { ok: false, error: 'This Champion was made by an unsupported Studio version.' };
  if (!metadata.championId || !Number.isInteger(metadata.studioRevision) || metadata.studioRevision < 1) return { ok: false, error: 'The Champion identity or revision is missing.' };
  if (!SUPPORTED_RIGS.includes(metadata.rigKind)) return { ok: false, error: `Rig kind “${metadata.rigKind || 'unknown'}” is not supported.` };
  if (!finitePositive(metadata.height)) return { ok: false, error: 'The Champion height is missing or invalid.' };
  if (!metadata.assetHash || typeof metadata.assetHash !== 'string') return { ok: false, error: 'The Champion asset hash is missing.' };
  const byName = new Map(animations.map(clip => [clip?.name, clip]));
  const bones = new Set(boneNames);
  const clips = {};
  for (const state of CHAMPION_ACTIONS) {
    const name = metadata.actions?.[state];
    const clip = byName.get(name);
    if (!name || !clip) return { ok: false, error: `The ${state} movement clip is missing.` };
    if (!finitePositive(clip.duration) || clip.duration > 30) return { ok: false, error: `The ${state} movement clip has an invalid duration.` };
    if (!Array.isArray(clip.tracks) || !clip.tracks.length) return { ok: false, error: `The ${state} movement clip has no bone movement.` };
    const missing = clip.tracks.map(track => trackTarget(track.name)).filter(name => name && !bones.has(name));
    if (missing.length) return { ok: false, error: `The ${state} movement targets a missing bone: ${missing[0]}.` };
    clips[state] = clip;
  }
  const feet = boneNames.filter(name => /(foot|paw|hoof)/i.test(name));
  const minimumFeet = metadata.rigKind === 'quadruped' ? 2 : 1;
  if (feet.length < minimumFeet) return { ok: false, error: 'The rig has no usable foot bones for City grounding.' };
  if (meshBounds && (!finitePositive(meshBounds.height) || meshBounds.minY < -metadata.height * 0.2)) return { ok: false, error: 'The Champion cannot be grounded safely.' };
  return { ok: true, metadata, clips, footBoneNames: feet };
}

export function collectRigInfo(root) {
  const boneNames = [];
  let skeletonCount = 0;
  root?.traverse?.(node => {
    if (node?.isBone && node.name) boneNames.push(node.name);
    if (node?.isSkinnedMesh && node.skeleton) skeletonCount++;
  });
  return { boneNames, skeletonCount };
}

/** GLTFLoader strips colons in some versions. Make names stable before export. */
export function colonFreeBoneName(name) {
  return String(name || '').replace(/:/g, '_').replace(/[^A-Za-z0-9_-]/g, '_');
}

export function migrateRigDocument(document) {
  if (!document || typeof document !== 'object') return document;
  const copy = typeof structuredClone === 'function' ? structuredClone(document) : JSON.parse(JSON.stringify(document));
  const roleMap = { ...(copy.roleMap || {}) };
  for (const bone of copy.bones || []) {
    const oldName = bone.name;
    const nextName = colonFreeBoneName(oldName);
    if (oldName !== nextName) bone.name = nextName;
    if (bone.role && !roleMap[bone.role]) roleMap[bone.role] = nextName;
    for (const [role, mapped] of Object.entries(roleMap)) if (mapped === oldName) roleMap[role] = nextName;
  }
  copy.roleMap = roleMap;
  copy.formatVersion = Math.max(2, Number(copy.formatVersion) || 0);
  return copy;
}
