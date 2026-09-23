// src/rig/coarse.js
// A light copy of the model for the bending solve (task 014, spec §3 "on a coarse copy, for
// tablets"). Vertex clustering on a grid: every point snaps to a cell, each occupied cell keeps one
// representative (the centroid of its points), triangles are re-pointed at the representatives and
// the ones that collapse are dropped. The cell size is searched so the copy has at most `target`
// points. The copy is never drawn: it only has to carry the shape for the heat solve, and the answer
// is carried back to the full mesh by transfer-weights.js.
import { cleanTriangles } from './heat-weights.js';

/** The tablet budget for the solve: a mesh at or under this many points is used as it is. */
export const COARSE_TARGET = 20000;
const SEARCH_STEPS = 24; // bisection steps on the cell size (log scale)
const FINEST_DIVISIONS = 4096; // the finest grid tried: the bounding diagonal split this many times

/** Snap every point to a grid of `cell`. Returns each point's cluster and the clusters' sums. */
function cluster(position, n, min, extent, cell) {
  const nx = Math.floor(extent[0] / cell) + 1;
  const ny = Math.floor(extent[1] / cell) + 1;
  const cellOf = new Int32Array(n);
  const ids = new Map(); // grid key → cluster id
  const sum = [];
  const count = [];
  for (let i = 0; i < n; i++) {
    const x = position[i * 3];
    const y = position[i * 3 + 1];
    const z = position[i * 3 + 2];
    const key = Math.floor((x - min[0]) / cell) + nx * (Math.floor((y - min[1]) / cell) + ny * Math.floor((z - min[2]) / cell));
    let id = ids.get(key);
    if (id === undefined) {
      id = count.length;
      ids.set(key, id);
      sum.push(0, 0, 0);
      count.push(0);
    }
    cellOf[i] = id;
    sum[id * 3] += x;
    sum[id * 3 + 1] += y;
    sum[id * 3 + 2] += z;
    count[id]++;
  }
  return { cellOf, sum, count, clusters: count.length };
}

/**
 * Reduce a mesh to at most `target` points. The smallest grid cell that stays under the target wins,
 * so the copy keeps as much shape as the budget allows.
 * @param {{position: ArrayLike<number>, index: ArrayLike<number>}} mesh
 * @param {{target?: number}} [opts]
 * @returns {{position: Float32Array, index: Uint32Array, reduced: boolean, stats: object}}
 */
export function coarseCopy(mesh, opts = {}) {
  const target = opts.target === undefined ? COARSE_TARGET : opts.target;
  if (!Number.isInteger(target) || target < 4) throw new Error(`coarse target must be an integer of at least 4, got ${target}`);
  const position = mesh.position instanceof Float32Array ? mesh.position : Float32Array.from(mesh.position);
  const n = position.length / 3;
  const index = cleanTriangles(mesh.index);
  if (index.length < 3) throw new Error('a coarse copy needs at least one real triangle');
  if (n <= target) {
    return {
      position,
      index,
      reduced: false,
      stats: { finePoints: n, coarsePoints: n, fineTriangles: index.length / 3, coarseTriangles: index.length / 3, cellSize: 0, searches: 0, strandedPoints: 0 },
    };
  }

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) {
      const v = position[i * 3 + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }
  const extent = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const diagonal = Math.hypot(extent[0], extent[1], extent[2]) || 1;

  // Bisection on the cell size, on the log scale. A cell a hair bigger than the whole model holds
  // every point (one cluster, always under target); the finest cell is the diagonal split
  // FINEST_DIVISIONS times. The smallest cell that stays under target wins.
  let lo = diagonal / FINEST_DIVISIONS;
  let hi = diagonal * 1.001;
  let best = null;
  let bestCell = hi;
  let searches = 0;
  for (let step = 0; step < SEARCH_STEPS && hi / lo > 1.01; step++) {
    const cell = Math.sqrt(lo * hi);
    const c = cluster(position, n, min, extent, cell);
    searches++;
    if (c.clusters <= target) {
      best = c;
      bestCell = cell;
      hi = cell;
    } else {
      lo = cell;
    }
  }
  if (!best) {
    best = cluster(position, n, min, extent, hi);
    bestCell = hi;
    searches++;
  }

  // Triangles re-pointed at the clusters; collapsed and now-duplicate ones go.
  const { cellOf, sum, count, clusters } = best;
  const remapped = new Uint32Array(index.length);
  for (let i = 0; i < index.length; i++) remapped[i] = cellOf[index[i]];
  const survivors = cleanTriangles(remapped);
  if (survivors.length < 3) throw new Error('the coarse copy lost every triangle — the model is too small for the grid');
  // A cluster no surviving triangle touches would be an island in the Laplacian: drop it.
  const used = new Uint8Array(clusters);
  for (let i = 0; i < survivors.length; i++) used[survivors[i]] = 1;
  const compact = new Int32Array(clusters).fill(-1);
  let m = 0;
  for (let c = 0; c < clusters; c++) if (used[c]) compact[c] = m++;
  const coarsePosition = new Float32Array(m * 3);
  for (let c = 0; c < clusters; c++) {
    const k = compact[c];
    if (k < 0) continue;
    coarsePosition[k * 3] = sum[c * 3] / count[c];
    coarsePosition[k * 3 + 1] = sum[c * 3 + 1] / count[c];
    coarsePosition[k * 3 + 2] = sum[c * 3 + 2] / count[c];
  }
  const coarseIndex = new Uint32Array(survivors.length);
  for (let i = 0; i < survivors.length; i++) coarseIndex[i] = compact[survivors[i]];
  return {
    position: coarsePosition,
    index: coarseIndex,
    reduced: true,
    stats: {
      finePoints: n,
      coarsePoints: m,
      fineTriangles: index.length / 3,
      coarseTriangles: coarseIndex.length / 3,
      cellSize: bestCell,
      searches,
      strandedPoints: clusters - m,
    },
  };
}
