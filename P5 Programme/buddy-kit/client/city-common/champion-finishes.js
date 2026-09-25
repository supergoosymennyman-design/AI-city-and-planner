// champion-finishes.js — the two market "material palettes" (plan §2).
//
// A finish is a cosmetic recolor of the Champion. It is a PURCHASED item id, so
// it is dedicated to the plan's `champion-finish` collection — never confusable
// with a Champion skin or a reward. Pure data + storage helpers (injectable, so
// Node can test them); the actual tint is applied to a three.js object by
// `applyFinishToObject`, which duck-types meshes/materials and imports no THREE.

export const FINISH_STORAGE_KEY = 'hk_ai_city_champion_finish_v1';

/**
 * `color` is the base body tint, `accent` the emissive highlight, and the
 * metalness/roughness pair sets the material feel. A finish is a palette, not a
 * score, and equipping one never changes gameplay.
 */
export const CHAMPION_FINISHES = Object.freeze({
  sunset: Object.freeze({
    id: 'sunset', name: 'Sunset Finish', nameZh: '日落塗裝',
    color: 0xff8a5c, accent: 0xffd28a, metalness: 0.35, roughness: 0.5,
  }),
  circuit: Object.freeze({
    id: 'circuit', name: 'Circuit Finish', nameZh: '電路塗裝',
    color: 0x4fd1c5, accent: 0x8be9fd, metalness: 0.6, roughness: 0.35,
  }),
});

export function finishById(id) { return CHAMPION_FINISHES[id] || null; }

/** The equipped finish id, or null (never a throw on a blocked localStorage). */
export function readFinish(storage = globalThis.localStorage) {
  try {
    const id = storage?.getItem(FINISH_STORAGE_KEY);
    return finishById(id) ? id : null;
  } catch { return null; }
}

/** Persist an equipped finish; `null` clears it. Returns whether it stuck. */
export function writeFinish(id, storage = globalThis.localStorage) {
  try {
    if (id == null) { storage?.removeItem(FINISH_STORAGE_KEY); return true; }
    if (!finishById(id)) return false;
    storage?.setItem(FINISH_STORAGE_KEY, id);
    return true;
  } catch { return false; }
}

/**
 * Tint an object graph (a Champion group) with a finish. Duck-typed against
 * three.js objects so this module stays import-free and Node-testable. Removes
 * any previous tint on the same material first, so re-equipping is idempotent.
 * @returns {boolean} whether any material was tinted
 */
export function applyFinishToObject(root, finishId) {
  const finish = finishById(finishId);
  if (!root || typeof root.traverse !== 'function') return false;
  let tinted = false;
  root.traverse((node) => {
    if (!node?.isMesh || !node.material) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (!material) continue;
      material.userData = material.userData || {};
      if (material.userData.__finishBase === undefined) {
        material.userData.__finishBase = {
          color: material.color ? material.color.getHex() : null,
          emissive: material.emissive ? material.emissive.getHex() : null,
          metalness: material.metalness,
          roughness: material.roughness,
        };
      }
      const base = material.userData.__finishBase;
      if (!finish) {
        if (base.color != null && material.color) material.color.setHex(base.color);
        if (base.emissive != null && material.emissive) material.emissive.setHex(base.emissive);
        if (base.metalness !== undefined) material.metalness = base.metalness;
        if (base.roughness !== undefined) material.roughness = base.roughness;
        continue;
      }
      if (material.color) material.color.setHex(finish.color);
      if (material.emissive) material.emissive.setHex(finish.accent);
      if (material.metalness !== undefined) material.metalness = finish.metalness;
      if (material.roughness !== undefined) material.roughness = finish.roughness;
      tinted = true;
    }
  });
  return tinted;
}
