// city-common/champ-recipe.js — the `.champ` champion recipe (handoff side).
//
// The champion authoring tools (Fit Studio + Rigger, external team) will export a
// TINY recipe JSON describing a child's custom creature — base primitive parts +
// rig + gait + sockets + premade gear ids — instead of a heavy baked GLB
// (docs/champion-recipe.md). The City rebuilds the creature from a SHARED
// primitive/gear library (stable ids).
//
// This module is OUR side of the contract TODAY: it parses + validates a recipe
// and describes what it would build. The actual 3D assembler is a follow-up that
// waits for the authoring tool's real export shape (no speculative 3D build).
//
// Pure + sync so node:test can exercise it exactly as the browser will.
export const CHAMP_MAGIC = 'passiona.champion';
export const CHAMP_SPEC_VERSION = 1;

/** Shapes the City can build procedurally (no GLB needed for the base body). */
export const SHAPES = ['box', 'sphere', 'capsule', 'cylinder', 'cone'];

/** Rig kinds the recipe may declare (procedural skeletons/gaits). */
export const RIGS = ['2-leg', '4-leg', 'skeletonized'];
export const GAITS = ['walk', 'trot', 'pace', 'gallop', 'run', 'idle'];

/** Stable premade gear ids the shared library hosts (gear goes here over time). */
export const PREMADE_GEAR = [
  'premade:helmet_01', 'premade:helmet_04', 'premade:visor_02', 'premade:shoulder_01',
  'premade:jetpack_01', 'premade:knit-cap_01', 'premade:antenna_01', 'premade:scarf_01',
];

/** Parse + validate a `.champ` recipe. Never throws. @returns {{ok:true, recipe}|{ok:false, error}} */
export function parseChampRecipe(raw) {
  let obj;
  try { obj = typeof raw === 'string' ? JSON.parse(raw) : raw; }
  catch { return { ok: false, error: 'That is not valid JSON.' }; }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, error: 'That is not a champion recipe.' };
  if (obj.magic !== CHAMP_MAGIC) return { ok: false, error: 'That does not look like a Passiona champion (.champ).' };
  if (obj.specVersion !== CHAMP_SPEC_VERSION) return { ok: false, error: `Recipe spec ${obj.specVersion ?? '?'} — this app knows ${CHAMP_SPEC_VERSION}.` };
  if (!Array.isArray(obj.parts) || !obj.parts.length) return { ok: false, error: 'A champion recipe needs parts.' };
  const seen = new Set();
  for (const p of obj.parts) {
    if (!p || !p.id || seen.has(p.id)) return { ok: false, error: 'Every part needs a unique id.' };
    seen.add(p.id);
    if (!SHAPES.includes(p.shape)) return { ok: false, error: `Part shape "${p.shape ?? '?'}" is not supported.` };
    const dims = ['w', 'h', 'd'].every((k) => typeof p[k] === 'number' && p[k] > 0);
    const pos = ['x', 'y', 'z'].every((k) => typeof p[k] === 'number');
    if (!dims || !pos) return { ok: false, error: `Part "${p.id}" needs positive w/h/d and numeric x/y/z.` };
  }
  const rig = obj.rig || {};
  if (rig.kind && !RIGS.includes(rig.kind)) return { ok: false, error: `Rig "${rig.kind}" is not supported.` };
  if (rig.gait && !GAITS.includes(rig.gait)) return { ok: false, error: `Gait "${rig.gait}" is not supported.` };
  if (Array.isArray(obj.gear)) {
    for (const g of obj.gear) {
      if (typeof g.item !== 'string') return { ok: false, error: 'Gear items must be string ids.' };
      if (g.item.startsWith('premade:') && !PREMADE_GEAR.includes(g.item)) {
        return { ok: false, error: `Gear "${g.item}" is not in the shared library.` };
      }
    }
  }
  return { ok: true, recipe: obj };
}

/** A display-safe summary of what the recipe builds (for the UI / handoff tests). */
export function champSummary(recipe) {
  return {
    name: recipe.name || 'My champion',
    parts: recipe.parts.length,
    shapes: [...new Set(recipe.parts.map((p) => p.shape))],
    rig: recipe.rig?.kind || null,
    gait: recipe.rig?.gait || null,
    gearCount: Array.isArray(recipe.gear) ? recipe.gear.length : 0,
    customGear: Array.isArray(recipe.gear) ? recipe.gear.filter((g) => !g.item.startsWith('premade:')).map((g) => g.item) : [],
  };
}
