/**
 * Gear-fit slot taxonomy — the art-plan slots used by the Fit toolbar, mapped to
 * runtime BONE sockets on the CURRENT model's rig (whatever the user built or
 * imported). Bone names match the studio's base names (Head, LeftShoulder,
 * LeftUpLeg, ...) AND imported Mixamo names (mixamorig:Head), via regex.
 */

/** Semantics of each SLOT_LIST entry.
 * key    - the art-plan slot id (what the UI chooses)
 * label  - what the dropdown shows
 * group  - optgroup label in the slot dropdown
 * socket - bone-family key, see SLOT_TO_SOCKET
 * baseScale - piece bounding-diameter as a fraction of the MODEL's height
 * offset - seat offset in world axes (champion faces +Z), applied via the bone's
 *          local frame so it stays correct on rotated bones
 */
export const SLOT_LIST = [
  // Anatomy — Senses
  { key: 'crown', label: 'Crown — antenna', group: 'Senses', socket: 'head', baseScale: 0.5, offset: null },
  { key: 'eye', label: 'Eye / browline — lens', group: 'Senses', socket: 'head', baseScale: 0.26, offset: { x: 0, y: 0.35, z: 0.24 } },
  { key: 'visor', label: 'Visor (layers over eye)', group: 'Senses', socket: 'head', baseScale: 0.3, offset: { x: 0, y: 0.26, z: 0.26 } },
  { key: 'temples', label: 'Temples — audio rings', group: 'Senses', socket: 'head', baseScale: 0.2, offset: { x: 0, y: 0.24, z: 0.15 } },
  // Anatomy — Body
  { key: 'chest', label: 'Chest — sensor', group: 'Body', socket: 'chest', baseScale: 0.34, offset: { x: 0, y: 0.05, z: 0.22 } },
  { key: 'shoulderL', label: 'Shoulder L — drone bay', group: 'Body', socket: 'shoulderL', baseScale: 0.32, offset: { x: 0.18, y: 0.12, z: 0.02 } },
  { key: 'shoulderR', label: 'Shoulder R — drone bay', group: 'Body', socket: 'shoulderR', baseScale: 0.32, offset: { x: -0.18, y: 0.12, z: 0.02 } },
  { key: 'hips', label: 'Hips — cargo rack', group: 'Body', socket: 'hips', baseScale: 0.36, offset: { x: 0, y: 0.1, z: 0.16 } },
  { key: 'legL', label: 'Leg L — rover', group: 'Body', socket: 'legL', baseScale: 0.45, offset: { x: 0.08, y: 0.05, z: 0.08 } },
  { key: 'legR', label: 'Leg R — rover', group: 'Body', socket: 'legR', baseScale: 0.45, offset: { x: -0.08, y: 0.05, z: 0.08 } },
  // Gear
  { key: 'backRig', label: 'Back — rig module', group: 'Back', socket: 'chest', baseScale: 0.5, offset: { x: 0, y: 0.1, z: -0.32 } },
  // Other
  { key: 'handR', label: 'Hand R — held tool', group: 'Other', socket: 'handR', baseScale: 0.28, offset: { x: 0.05, y: 0, z: 0.12 } },
];

/** Canonical slot -> bone-family key. Several slots (the four head slots, the
 * back rig) share one underlying bone; the gizmo seat offset distinguishes them. */
export const SLOT_TO_SOCKET = Object.fromEntries(SLOT_LIST.map((s) => [s.key, s.socket]));

/** The four slots that share the head bone — a second visor evicts the first
 * visor but not a crown (each head slot is its own wardrobe seat). */
export const HEAD_SLOTS = SLOT_LIST.filter((s) => s.socket === 'head');

/** Regex, keyed by bone-family key, matched (case-insensitively) against bone
 * names. `quest` entries let a slot prefer a specific bone (leg slots prefer the
 * FOOT because the foot stays planted in Idle); `fallback` covers the family. */
export const FIT_SOCKET_PATTERNS = {
  head: /head/i,
  chest: /spine2|spine1|chest|spine/i,
  shoulderL: { first: /leftshoulder/i, fallback: /leftarm/i },
  shoulderR: { first: /rightshoulder/i, fallback: /rightarm/i },
  handR: /righthand/i,
  hips: /hips/i,
  legL: { first: /leftfoot/i, fallback: /leftupleg|leftleg|leftfoot/i },
  legR: { first: /rightfoot/i, fallback: /rightupleg|rightleg|rightfoot/i },
};

/** Strip the Mixamo prefix, then map a bone name to its family key (or null). */
const STRIP = /^mixamorig:/i;
const BACKWARD = {
  head: 'head', chest: 'chest', hips: 'hips',
  righthand: 'handR', righthand1: 'handR', righthand2: 'handR', righthand3: 'handR',
  leftshoulder: 'shoulderL', rightshoulder: 'shoulderR',
  leftupleg: 'legL', leftleg: 'legL', leftfoot: 'legL',
  rightupleg: 'legR', rightleg: 'legR', rightfoot: 'legR',
};

export function boneFamily(name) {
  const base = String(name || '').replace(STRIP, '');
  return BACKWARD[base.toLowerCase()] || null;
}

export function socketSlots(socket) {
  return SLOT_LIST.filter((s) => s.socket === socket);
}

export function slotByKey(key) {
  return SLOT_LIST.find((s) => s.key === key) || null;
}

export const DEFAULT_GEAR_SCALE = 0.3;