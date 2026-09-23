// champion-contract.js — the small, versioned contract between Studio and City.
// Kept free of three.js so City imports and node:test use the same validator.
export const CHAMPION_FORMAT_VERSION = 1;
export const CHAMPION_ACTIONS = ['idle', 'walk', 'run'];
export const OPTIONAL_CHAMPION_ACTIONS = ['jump', 'wave', 'dance'];
export const SUPPORTED_RIGS = ['biped', 'quadruped'];

const finitePositive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const trackTarget = name => String(name || '').startsWith('.') ? '' : String(name || '').split('.')[0];

export function championMetadataFromGLTF(gltf) {
  const direct = gltf?.scene?.userData?.passionaChampion || gltf?.parser?.json?.asset?.extras?.passionaChampion;
  if (direct) return direct;
  let nested = null;
  gltf?.scene?.traverse?.(node => { if (!nested && node?.userData?.passionaChampion) nested = node.userData.passionaChampion; });
  return nested;
}

/** Validate mappings against clips and nodes in the same GLB. Never throws. */
export function validateStudioChampion({ metadata, animations = [], boneNames = [], nodeNames = boneNames, rootName = '', meshBounds = null } = {}) {
  if (!metadata) return { ok: false, legacy: true, error: 'No Studio movement information was found.' };
  if (!Array.isArray(animations) || !Array.isArray(boneNames) || !Array.isArray(nodeNames)) return { ok: false, error: 'The Champion animation data is malformed.' };
  if (metadata.formatVersion !== CHAMPION_FORMAT_VERSION) return { ok: false, error: 'This Champion was made by an unsupported Studio version.' };
  if (!metadata.championId || !Number.isInteger(metadata.studioRevision) || metadata.studioRevision < 1) return { ok: false, error: 'The Champion identity or revision is missing.' };
  if (metadata.rigKind && ![...SUPPORTED_RIGS, 'other'].includes(metadata.rigKind)) return { ok: false, error: `Rig kind “${metadata.rigKind}” is not supported.` };
  if (!finitePositive(metadata.height)) return { ok: false, error: 'The Champion height is missing or invalid.' };
  if (!metadata.assetHash || typeof metadata.assetHash !== 'string') return { ok: false, error: 'The Champion asset hash is missing.' };
  const byName = new Map(animations.map(clip => [clip?.name, clip]));
  if (byName.size !== animations.length) return { ok: false, error: 'The Champion has duplicate clip names.' };
  const targets = new Set([...boneNames, ...nodeNames]);
  const clips = {};
  const mappings = CHAMPION_ACTIONS.map(state => [state, metadata.actions?.[state]]);
  for (const state of OPTIONAL_CHAMPION_ACTIONS) if (metadata.actions?.[state]) mappings.push([state, metadata.actions[state]]);
  if (metadata.extraActions !== undefined && !Array.isArray(metadata.extraActions)) return { ok: false, error: 'Extra actions must be a list.' };
  const extraActions = [];
  for (const extra of metadata.extraActions || []) {
    const label = typeof extra?.name === 'string' ? extra.name.trim() : '';
    if (!label || label.length > 24 || !extra.clip || [...CHAMPION_ACTIONS, ...OPTIONAL_CHAMPION_ACTIONS, '__proto__', 'constructor', 'prototype'].includes(label.toLowerCase()) ||
        extraActions.some(item => item.name.toLowerCase() === label.toLowerCase())) return { ok: false, error: 'An extra action has an invalid or duplicate name.' };
    extraActions.push({ name: label, clip: extra.clip });
    mappings.push([label, extra.clip]);
  }
  if (extraActions.length > 8) return { ok: false, error: 'Too many extra actions (maximum 8).' };
  for (const [state, name] of mappings) {
    const clip = byName.get(name);
    if (!name || !clip) return { ok: false, error: `The ${state} movement clip is missing.` };
    if (!finitePositive(clip.duration) || clip.duration > 30) return { ok: false, error: `The ${state} movement clip has an invalid duration.` };
    if (!Array.isArray(clip.tracks) || !clip.tracks.length) return { ok: false, error: `The ${state} movement clip has no animation tracks.` };
    const bad = clip.tracks.find(track => !track?.name || !track.times?.length || !track.values?.length ||
      (track.times && Array.from(track.times).some(t => !Number.isFinite(t))) ||
      (track.values && Array.from(track.values).some(v => !Number.isFinite(v))));
    if (bad) return { ok: false, error: `The ${state} movement clip has malformed keyframes.` };
    if (clip.tracks.some(track => (track.name === '.position' || (rootName && track.name === `${rootName}.position`))))
      return { ok: false, error: `The ${state} clip moves the whole Champion; City controls travel.` };
    const missing = clip.tracks.map(track => trackTarget(track.name)).filter(target => target && !targets.has(target));
    if (missing.length) return { ok: false, error: `The ${state} movement targets a missing model part: ${missing[0]}.` };
    clips[state] = clip;
  }
  const feet = boneNames.filter(name => /(foot|paw|hoof)/i.test(name));
  if (meshBounds && (!finitePositive(meshBounds.height) || meshBounds.minY < -metadata.height * 0.2)) return { ok: false, error: 'The Champion cannot be grounded safely.' };
  return { ok: true, metadata, clips, footBoneNames: feet, extraActions };
}

export function collectRigInfo(root) {
  const boneNames = [];
  const nodeNames = [];
  let skeletonCount = 0;
  root?.traverse?.(node => {
    if (node?.isBone && node.name) boneNames.push(node.name);
    if (node?.name) nodeNames.push(node.name);
    if (node?.isSkinnedMesh && node.skeleton) skeletonCount++;
  });
  return { boneNames, nodeNames, skeletonCount };
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
