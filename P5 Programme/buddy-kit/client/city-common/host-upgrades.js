// host-upgrades.js — the two Market "skill-host appearance upgrades" (plan §2).
//
// An upgrade is a cosmetic re-skin of a skill host. It is a PURCHASED item id
// (never a capability revision: installing a skill and dressing its home are
// separate). Pure data + injectable-storage helpers, so Node tests the same
// rules; the tint is applied to a three.js object by duck-typing materials.

import { HOST_UPGRADE_STORAGE_KEY } from './market-catalogue.js';

/**
 * `accent` is the emissive highlight applied to the host's trim, `metalness`
 * the surface feel. An upgrade changes appearance only — the installed,
 * immutable capability revision is never touched.
 */
export const HOST_UPGRADES = Object.freeze({
  flagship: Object.freeze({
    id: 'flagship', name: 'Flagship Skill Host', nameZh: '旗艦技能館',
    accent: 0xf0c068, emissive: 0x7a5a1a, emissiveIntensity: 0.35, metalness: 0.55,
  }),
  crystal: Object.freeze({
    id: 'crystal', name: 'Crystal Skill Host', nameZh: '水晶技能館',
    accent: 0x9fd8ff, emissive: 0x27536b, emissiveIntensity: 0.5, metalness: 0.2,
  }),
});

export function hostUpgradeById(id) { return HOST_UPGRADES[id] || null; }

/** The equipped host upgrade id, or null (never throws on a blocked storage). */
export function readHostUpgrade(storage = globalThis.localStorage) {
  try {
    const id = storage?.getItem(HOST_UPGRADE_STORAGE_KEY);
    return hostUpgradeById(id) ? id : null;
  } catch { return null; }
}

/** Persist an equipped host upgrade; `null` clears it. Returns whether it stuck. */
export function writeHostUpgrade(id, storage = globalThis.localStorage) {
  try {
    if (id == null) { storage?.removeItem(HOST_UPGRADE_STORAGE_KEY); return true; }
    if (!hostUpgradeById(id)) return false;
    storage?.setItem(HOST_UPGRADE_STORAGE_KEY, id);
    return true;
  } catch { return false; }
}

/**
 * Recolour a host visual (duck-typed three.js object). Only emissive trim/metal
 * are touched, so the host stays readable as a building. Idempotent.
 * @returns {boolean} whether any material was upgraded
 */
export function applyHostUpgrade(root, id) {
  const upgrade = hostUpgradeById(id);
  if (!root || typeof root.traverse !== 'function') return false;
  let changed = false;
  root.traverse((node) => {
    if (!node?.isMesh || !node.material) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (!material?.emissive) continue;
      material.emissive.setHex(upgrade ? upgrade.emissive : 0x000000);
      if (material.emissiveIntensity !== undefined) material.emissiveIntensity = upgrade ? upgrade.emissiveIntensity : 0;
      if (material.metalness !== undefined && upgrade) material.metalness = upgrade.metalness;
      changed = true;
    }
  });
  return changed;
}
