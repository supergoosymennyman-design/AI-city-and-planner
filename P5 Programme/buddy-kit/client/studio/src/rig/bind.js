// src/rig/bind.js
// The binding pipeline (task 014, spec §3): model parts merged into one surface, a coarse copy,
// bone heat on the copy, the answer carried back to the fine mesh, and the numbers that caught
// every problem during the trials. Pure: arrays in, arrays out, so the worker and the Node suite
// run the same code.
import { computeHeatWeights, packInfluences } from './heat-weights.js';
import { coarseCopy, COARSE_TARGET } from './coarse.js';
import { transferWeights } from './transfer-weights.js';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * Concatenate parts into one triangle soup. The bind solves the model as ONE surface (a wing is
 * just more chain, spec §7), and the skin is split back per part afterwards.
 * @param {Array<{position: ArrayLike<number>, index: ArrayLike<number>}>} parts
 * @returns {{position: Float32Array, index: Uint32Array, ranges: Array<{start:number,count:number}>}}
 */
export function mergeParts(parts) {
  if (!Array.isArray(parts) || !parts.length) throw new Error('mergeParts needs at least one part');
  let points = 0;
  let indices = 0;
  for (const p of parts) {
    if (!p || !p.position || !p.index) throw new Error('every part needs position and index arrays');
    points += p.position.length / 3;
    indices += p.index.length;
  }
  const position = new Float32Array(points * 3);
  const index = new Uint32Array(indices);
  const ranges = [];
  let vertexOffset = 0;
  let indexOffset = 0;
  for (const p of parts) {
    const count = p.position.length / 3;
    position.set(p.position, vertexOffset * 3);
    for (let i = 0; i < p.index.length; i++) index[indexOffset + i] = p.index[i] + vertexOffset;
    ranges.push({ start: vertexOffset, count });
    vertexOffset += count;
    indexOffset += p.index.length;
  }
  return { position, index, ranges };
}

/** Slice a merged skin back into one copy per part. */
export function splitSkin(skin, ranges) {
  return ranges.map(({ start, count }) => ({
    skinIndex: skin.skinIndex.slice(start * 4, (start + count) * 4),
    skinWeight: skin.skinWeight.slice(start * 4, (start + count) * 4),
  }));
}

/**
 * Re-point a skin at a changed bone list so the model stays posable with the weights it already
 * has (spec §3) while the new ones are computed. A vanished bone's weight climbs to its nearest
 * surviving ancestor; a vertex that loses everything goes to bone 0 at weight 1, because an
 * all-zero skin vertex is drawn at the origin.
 * @param {{skinIndex: ArrayLike<number>, skinWeight: ArrayLike<number>}} skin
 * @param {Array<{name:string, parent:string|null}>} oldBones the list the skin indexes
 * @param {Array<{name:string, parent:string|null}>} newBones the list it must index now
 * @returns {{skinIndex: Uint16Array, skinWeight: Float32Array, moved: number, lost: number}}
 */
export function remapSkinIndex(skin, oldBones, newBones) {
  const n = skin.skinIndex.length / 4;
  const newIndex = new Map(newBones.map((b, i) => [b.name, i]));
  const oldParent = new Map(oldBones.map((b) => [b.name, b.parent]));
  const target = oldBones.map((b) => {
    let name = b.name;
    let hops = 0;
    while (name != null && !newIndex.has(name) && hops++ <= oldBones.length) name = oldParent.has(name) ? oldParent.get(name) : null;
    return name != null && newIndex.has(name) ? newIndex.get(name) : -1;
  });
  const perVertex = new Array(n);
  let moved = 0;
  let lost = 0;
  for (let i = 0; i < n; i++) {
    const blend = new Map();
    let changed = false;
    for (let k = 0; k < 4; k++) {
      const w = skin.skinWeight[i * 4 + k];
      if (!(w > 0)) continue;
      const old = skin.skinIndex[i * 4 + k];
      const t = old < target.length ? target[old] : -1;
      if (t < 0) { changed = true; continue; }
      if (newIndex.get(oldBones[old].name) !== t) changed = true;
      blend.set(t, (blend.get(t) || 0) + w);
    }
    if (!blend.size) {
      lost++;
      perVertex[i] = newBones.length ? [[0, 1]] : [];
    } else {
      perVertex[i] = [...blend.entries()];
    }
    if (changed) moved++;
  }
  const packed = packInfluences(perVertex, n, 4);
  return { skinIndex: packed.skinIndex, skinWeight: packed.skinWeight, moved, lost };
}

/**
 * Work out the bending of one merged surface: coarse copy → bone heat → transfer back.
 * @param {{position: ArrayLike<number>, index: ArrayLike<number>}} mesh the fine surface
 * @param {Array<{head:number[], tail:number[]}>} bones in weight order
 * @param {{target?: number, onProgress?: (fraction:number, stage:string)=>void, solver?: string}} [opts]
 * @returns {{skinIndex: Uint16Array, skinWeight: Float32Array, stats: object}}
 */
export function bindMesh(mesh, bones, opts = {}) {
  if (!Array.isArray(bones) || !bones.length) throw new Error('bindMesh needs at least one bone');
  const progress = opts.onProgress || (() => {});
  const t0 = now();
  progress(0, 'reduce');
  const coarse = coarseCopy(mesh, { target: opts.target === undefined ? COARSE_TARGET : opts.target });
  const t1 = now();
  const heat = computeHeatWeights(coarse, bones, {
    solver: opts.solver,
    onProgress: (fraction, stage) => progress(0.05 + 0.85 * fraction, stage),
  });
  const t2 = now();
  let skinIndex = heat.skinIndex;
  let skinWeight = heat.skinWeight;
  let transfer = null;
  if (coarse.reduced) {
    progress(0.9, 'transfer');
    const moved = transferWeights(coarse, heat, mesh.position);
    skinIndex = moved.skinIndex;
    skinWeight = moved.skinWeight;
    transfer = moved.stats;
  }
  const t3 = now();
  progress(1, 'done');
  return {
    skinIndex,
    skinWeight,
    stats: {
      ...heat.stats,
      finePoints: mesh.position.length / 3,
      coarsePoints: coarse.stats.coarsePoints,
      reduced: coarse.reduced,
      reduction: coarse.stats,
      transfer,
      reduceMs: Math.round(t1 - t0),
      heatMs: Math.round(t2 - t1),
      transferMs: Math.round(t3 - t2),
      totalMs: Math.round(t3 - t0),
    },
  };
}
