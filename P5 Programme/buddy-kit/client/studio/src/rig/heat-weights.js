// Bone heat weights — the bending maths for the new rig (task 014).
//
// Method: Baran & Popović, "Automatic Rigging and Animation of 3D Characters", SIGGRAPH 2007,
// §4 "Skin attachment": treat the skin as a heat-conducting surface, hold one bone at
// temperature 1 and the others at 0, and each vertex's equilibrium temperature is its weight for
// that bone. Heat enters at each vertex from its NEAREST VISIBLE bone with strength 1/d². This is
// the method behind Blender's "With Automatic Weights"; the constants, the distance rule (a vertex
// facing away from a bone counts as farther), the visibility rule (a ray may leave the body but
// not re-enter it) and the clean-up ramp follow Blender's behaviour so results match it. The code
// is our own — nothing is copied from Blender (GPL).
//
// In: a triangle mesh with shared vertices, and bones as line segments.
// Out: for every vertex, its strongest bone influences in three.js's skinIndex / skinWeight layout.
//
// Only pure geometry lives here — no scene objects, no UI. Heavy but synchronous; callers run it
// in a Worker for big meshes.
import { BufferGeometry, BufferAttribute, Ray, Vector3, FrontSide } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { choleskyFactor, choleskySolve } from './sparse-cholesky.js';

export const HEAT = Object.freeze({
  C_WEIGHT: 1.0, //        source strength: h = (nearest bones) · C / d²
  LIMIT_START: 0.05, //    weights above this are kept as they are
  LIMIT_END: 0.025, //     weights below this are dropped; between, a linear ramp
  DISTANCE_EPSILON: 1e-4, // bones within (1+ε)·nearest distance all count as nearest
  MIN_DISTANCE: 1e-4, //   floor for d in 1/d²
  MAX_INFLUENCES: 4, //    three.js skins with four bones per vertex
  TOLERANCE: 1e-8, //      conjugate gradient: |D⁻¹·residual| ≤ tolerance · |D⁻¹·rhs| (diagonal-scaled)
  MAX_ITERATIONS: 6000,
});

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Drop degenerate triangles (a repeated corner) and repeated triangles (any winding), keeping the
 * first copy in order. AI meshes often carry padding triangles; Blender drops them on import. */
export function cleanTriangles(index) {
  let n = 0;
  for (let i = 0; i < index.length; i++) if (index[i] >= n) n = index[i] + 1;
  const numeric = n < 200000; // n³ must stay exact in a double
  const seen = new Set();
  const out = [];
  for (let t = 0; t + 2 < index.length; t += 3) {
    const a = index[t];
    const b = index[t + 1];
    const c = index[t + 2];
    if (a === b || b === c || a === c) continue;
    let lo = a;
    let mid = b;
    let hi = c;
    if (lo > mid) [lo, mid] = [mid, lo];
    if (mid > hi) [mid, hi] = [hi, mid];
    if (lo > mid) [lo, mid] = [mid, lo];
    const key = numeric ? (lo * n + mid) * n + hi : `${lo},${mid},${hi}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a, b, c);
  }
  return Uint32Array.from(out);
}

/** cot of the angle at p between (a − p) and (b − p); 0 for a degenerate corner. */
function cotAt(px, py, pz, ax, ay, az, bx, by, bz) {
  const ux = ax - px;
  const uy = ay - py;
  const uz = az - pz;
  const vx = bx - px;
  const vy = by - py;
  const vz = bz - pz;
  const cx = uy * vz - uz * vy;
  const cy = uz * vx - ux * vz;
  const cz = ux * vy - uy * vx;
  const c = Math.sqrt(cx * cx + cy * cy + cz * cz);
  return c > 1e-20 ? (ux * vx + uy * vy + uz * vz) / c : 0;
}

/**
 * Cotangent Laplacian of the surface as a symmetric sparse matrix in CSR form, with each vertex's
 * mixed Voronoi area. Each edge weight is the sum over the faces on that edge of cot(opposite
 * angle) / (faces on the edge), so a boundary edge counts once and a manifold edge averages its
 * two faces. Rows: the diagonal entry (Σ weights) comes first, then the neighbours (−weight).
 * `area` is in the doubled convention (obtuse corner → whole triangle area, others → half) that
 * the heat solve's row scaling expects.
 * @returns {{n:number,rowPtr:Int32Array,col:Int32Array,value:Float64Array,area:Float64Array}}
 */
export function buildSurfaceLaplacian(position, index) {
  const n = position.length / 3;
  const tri = index.length / 3;
  const edgeKey = (i, j) => (i < j ? i * n + j : j * n + i);
  const faceCount = new Map();
  for (let t = 0; t < tri; t++) {
    const a = index[t * 3];
    const b = index[t * 3 + 1];
    const c = index[t * 3 + 2];
    for (const k of [edgeKey(a, b), edgeKey(b, c), edgeKey(c, a)]) faceCount.set(k, (faceCount.get(k) || 0) + 1);
  }
  const weight = new Map();
  const area = new Float64Array(n);
  const addWeight = (k, w) => weight.set(k, (weight.get(k) || 0) + w);
  for (let t = 0; t < tri; t++) {
    const i1 = index[t * 3];
    const i2 = index[t * 3 + 1];
    const i3 = index[t * 3 + 2];
    const x1 = position[i1 * 3], y1 = position[i1 * 3 + 1], z1 = position[i1 * 3 + 2];
    const x2 = position[i2 * 3], y2 = position[i2 * 3 + 1], z2 = position[i2 * 3 + 2];
    const x3 = position[i3 * 3], y3 = position[i3 * 3 + 1], z3 = position[i3 * 3 + 2];
    const t1 = cotAt(x1, y1, z1, x2, y2, z2, x3, y3, z3); // angle at v1, opposite edge (v2,v3)
    const t2 = cotAt(x2, y2, z2, x3, y3, z3, x1, y1, z1); // angle at v2, opposite edge (v3,v1)
    const t3 = cotAt(x3, y3, z3, x1, y1, z1, x2, y2, z2); // angle at v3, opposite edge (v1,v2)
    // mixed Voronoi area (Meyer et al. 2003), doubled
    const d1 = (x2 - x1) * (x3 - x1) + (y2 - y1) * (y3 - y1) + (z2 - z1) * (z3 - z1); // <0: obtuse at v1
    const d2 = (x3 - x2) * (x1 - x2) + (y3 - y2) * (y1 - y2) + (z3 - z2) * (z1 - z2);
    const d3 = (x1 - x3) * (x2 - x3) + (y1 - y3) * (y2 - y3) + (z1 - z3) * (z2 - z3);
    if (d1 < 0 || d2 < 0 || d3 < 0) {
      const cx = (y2 - y1) * (z3 - z1) - (z2 - z1) * (y3 - y1);
      const cy = (z2 - z1) * (x3 - x1) - (x2 - x1) * (z3 - z1);
      const cz = (x2 - x1) * (y3 - y1) - (y2 - y1) * (x3 - x1);
      const full = 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz);
      area[i1] += d1 < 0 ? full : full * 0.5;
      area[i2] += d2 < 0 ? full : full * 0.5;
      area[i3] += d3 < 0 ? full : full * 0.5;
    } else {
      const l1 = (x2 - x3) ** 2 + (y2 - y3) ** 2 + (z2 - z3) ** 2; // |v2−v3|², opposite v1
      const l2 = (x1 - x3) ** 2 + (y1 - y3) ** 2 + (z1 - z3) ** 2;
      const l3 = (x1 - x2) ** 2 + (y1 - y2) ** 2 + (z1 - z2) ** 2;
      area[i1] += (t2 * l2 + t3 * l3) * 0.25;
      area[i2] += (t1 * l1 + t3 * l3) * 0.25;
      area[i3] += (t1 * l1 + t2 * l2) * 0.25;
    }
    addWeight(edgeKey(i2, i3), t1 / faceCount.get(edgeKey(i2, i3)));
    addWeight(edgeKey(i3, i1), t2 / faceCount.get(edgeKey(i3, i1)));
    addWeight(edgeKey(i1, i2), t3 / faceCount.get(edgeKey(i1, i2)));
  }
  const degree = new Int32Array(n);
  for (const k of weight.keys()) {
    const lo = Math.floor(k / n);
    degree[lo]++;
    degree[k - lo * n]++;
  }
  const rowPtr = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) rowPtr[i + 1] = rowPtr[i] + 1 + degree[i];
  const col = new Int32Array(rowPtr[n]);
  const value = new Float64Array(rowPtr[n]);
  const next = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    col[rowPtr[i]] = i;
    next[i] = rowPtr[i] + 1;
  }
  for (const [k, w] of weight) {
    const lo = Math.floor(k / n);
    const hi = k - lo * n;
    col[next[lo]] = hi;
    value[next[lo]++] = -w;
    col[next[hi]] = lo;
    value[next[hi]++] = -w;
    value[rowPtr[lo]] += w;
    value[rowPtr[hi]] += w;
  }
  return { n, rowPtr, col, value, area };
}

/** Unit vertex normals: the normalised sum of the unit normals of the faces around each vertex. */
export function vertexNormals(position, index) {
  const n = position.length / 3;
  const normal = new Float64Array(n * 3);
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t];
    const b = index[t + 1];
    const c = index[t + 2];
    const ux = position[b * 3] - position[a * 3];
    const uy = position[b * 3 + 1] - position[a * 3 + 1];
    const uz = position[b * 3 + 2] - position[a * 3 + 2];
    const vx = position[c * 3] - position[a * 3];
    const vy = position[c * 3 + 1] - position[a * 3 + 1];
    const vz = position[c * 3 + 2] - position[a * 3 + 2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len < 1e-20) continue;
    nx /= len;
    ny /= len;
    nz /= len;
    for (const i of [a, b, c]) {
      normal[i * 3] += nx;
      normal[i * 3 + 1] += ny;
      normal[i * 3 + 2] += nz;
    }
  }
  for (let i = 0; i < n; i++) {
    const len = Math.hypot(normal[i * 3], normal[i * 3 + 1], normal[i * 3 + 2]);
    if (len > 0) {
      normal[i * 3] /= len;
      normal[i * 3 + 1] /= len;
      normal[i * 3 + 2] /= len;
    }
  }
  return normal;
}

/**
 * Visibility test for heat sources, built on a BVH of the mesh. `visible(vertex, point)` casts a
 * ray from the vertex to the point and reports true unless the ray RE-ENTERS the body (hits a
 * front-facing triangle) on the way. Leaving the body does not block: a bone poking slightly out
 * of the skin still counts. The ray starts a hair inside and stops a hair short of the point so
 * the vertex's own faces and the bone's surroundings do not register.
 * @returns {(vertex:number, point:ArrayLike<number>) => boolean}
 */
export function createVisibility(position, index) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(position, 3));
  geometry.setIndex(new BufferAttribute(index, 1));
  const bvh = new MeshBVH(geometry);
  const ray = new Ray();
  return function visible(vertex, point) {
    const vx = position[vertex * 3];
    const vy = position[vertex * 3 + 1];
    const vz = position[vertex * 3 + 2];
    const dx = point[0] - vx;
    const dy = point[1] - vy;
    const dz = point[2] - vz;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-9) return true;
    ray.origin.set(vx + dx * 1e-5, vy + dy * 1e-5, vz + dz * 1e-5);
    ray.direction.set(dx / len, dy / len, dz / len);
    return bvh.raycastFirst(ray, FrontSide, 0, len * (1 - 2e-5)) === null;
  };
}

/**
 * Where heat enters the surface. For each vertex: the distance to every bone (with the facing
 * rule), the nearest visible bones, and the source strength.
 * @param {Float64Array} normal unit vertex normals
 * @param {Array<{head:number[], tail:number[]}>} bones
 * @param {(vertex:number, point:number[]) => boolean} visible
 */
export function heatSources(position, normal, bones, visible) {
  const n = position.length / 3;
  const m = bones.length;
  const seg = new Float64Array(m * 6);
  for (let j = 0; j < m; j++) {
    seg.set(bones[j].head, j * 6);
    seg.set(bones[j].tail, j * 6 + 3);
  }
  const H = new Float64Array(n);
  const P = new Float64Array(n);
  const nearest = new Int32Array(n);
  const sources = new Array(n);
  const dist = new Float64Array(m);
  const closest = new Float64Array(m * 3);
  let noSource = 0;
  for (let i = 0; i < n; i++) {
    const vx = position[i * 3];
    const vy = position[i * 3 + 1];
    const vz = position[i * 3 + 2];
    let minDist = Infinity;
    for (let j = 0; j < m; j++) {
      const ax = seg[j * 6], ay = seg[j * 6 + 1], az = seg[j * 6 + 2];
      const bx = seg[j * 6 + 3] - ax, by = seg[j * 6 + 4] - ay, bz = seg[j * 6 + 5] - az;
      const bb = bx * bx + by * by + bz * bz;
      let t = bb > 0 ? ((vx - ax) * bx + (vy - ay) * by + (vz - az) * bz) / bb : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const cx = ax + bx * t;
      const cy = ay + by * t;
      const cz = az + bz * t;
      closest[j * 3] = cx;
      closest[j * 3 + 1] = cy;
      closest[j * 3 + 2] = cz;
      const dx = vx - cx;
      const dy = vy - cy;
      const dz = vz - cz;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      let scaled = 0;
      if (d > 0) {
        // a vertex whose normal points away from the bone is treated as farther from it
        const cosine = (dx * normal[i * 3] + dy * normal[i * 3 + 1] + dz * normal[i * 3 + 2]) / d;
        scaled = d / (0.5 * (cosine + 1.001));
      }
      dist[j] = scaled;
      if (scaled < minDist) {
        minDist = scaled;
        nearest[i] = j;
      }
    }
    const list = [];
    const limit = minDist * (1 + HEAT.DISTANCE_EPSILON);
    for (let j = 0; j < m; j++) {
      if (dist[j] <= limit && visible(i, closest.subarray(j * 3, j * 3 + 3))) list.push(j);
    }
    sources[i] = list;
    if (list.length) {
      const d = Math.max(minDist, HEAT.MIN_DISTANCE);
      P[i] = 1 / list.length;
      H[i] = (list.length * HEAT.C_WEIGHT) / (d * d);
    } else {
      noSource++;
    }
  }
  return { H, P, nearest, sources, noSource };
}

/** Blender's clean-up: tiny weights go, small ones ramp in, the rest stay. */
export function limitWeight(w) {
  if (w < HEAT.LIMIT_END) return 0;
  if (w < HEAT.LIMIT_START) return ((w - HEAT.LIMIT_END) / (HEAT.LIMIT_START - HEAT.LIMIT_END)) * HEAT.LIMIT_START;
  return w;
}

/**
 * Keep each vertex's `max` strongest influences, strongest first, renormalised to sum to 1.
 * @param {Array<Array<[number, number]>>} perVertex [bone, weight] pairs per vertex
 * @returns {{skinIndex: Uint16Array, skinWeight: Float32Array}} n·max each
 */
export function packInfluences(perVertex, n, max = HEAT.MAX_INFLUENCES) {
  const skinIndex = new Uint16Array(n * max);
  const skinWeight = new Float32Array(n * max);
  for (let i = 0; i < n; i++) {
    const list = perVertex[i];
    if (!list || !list.length) continue;
    const top = list.slice().sort((a, b) => b[1] - a[1]).slice(0, max);
    let sum = 0;
    for (const pair of top) sum += pair[1];
    if (!(sum > 0)) continue;
    for (let k = 0; k < top.length; k++) {
      skinIndex[i * max + k] = top[k][0];
      skinWeight[i * max + k] = top[k][1] / sum;
    }
  }
  return { skinIndex, skinWeight };
}

/** Jacobi-preconditioned conjugate gradient on (offdiagonal(lap) + diag) x = b.
 * Convergence is judged on the diagonally scaled residual D⁻¹r against D⁻¹b: a vertex sitting on
 * a bone carries a source of ~1e8 (the 1e-4 distance floor), and measured raw that one spike
 * would make the whole system look solved after a single step. */
export function conjugateGradient(lap, diag, b, tolerance, maxIterations) {
  const { n, rowPtr, col, value } = lap;
  const x = new Float64Array(n);
  const r = Float64Array.from(b);
  const z = new Float64Array(n);
  const p = new Float64Array(n);
  const q = new Float64Array(n);
  let target = 0;
  for (let i = 0; i < n; i++) {
    const zi = b[i] / diag[i];
    target += zi * zi;
  }
  if (target === 0) return { x, iterations: 0, converged: true };
  target = tolerance * Math.sqrt(target);
  let rz = 0;
  for (let i = 0; i < n; i++) {
    z[i] = r[i] / diag[i];
    p[i] = z[i];
    rz += r[i] * z[i];
  }
  let it = 0;
  let converged = false;
  while (it < maxIterations) {
    it++;
    let pq = 0;
    for (let i = 0; i < n; i++) {
      let s = diag[i] * p[i];
      for (let k = rowPtr[i] + 1; k < rowPtr[i + 1]; k++) s += value[k] * p[col[k]];
      q[i] = s;
      pq += p[i] * s;
    }
    const alpha = rz / pq;
    let rzNext = 0;
    let zNorm = 0;
    for (let i = 0; i < n; i++) {
      x[i] += alpha * p[i];
      r[i] -= alpha * q[i];
      z[i] = r[i] / diag[i];
      rzNext += r[i] * z[i];
      zNorm += z[i] * z[i];
    }
    if (Math.sqrt(zNorm) <= target) {
      converged = true;
      break;
    }
    const beta = rzNext / rz;
    rz = rzNext;
    for (let i = 0; i < n; i++) p[i] = z[i] + beta * p[i];
  }
  return { x, iterations: it, converged };
}

/**
 * Bone heat weights for a mesh.
 * @param {{position: Float32Array|Float64Array, index: ArrayLike<number>}} mesh shared-vertex triangles
 * @param {Array<{head:number[], tail:number[]}>} bones
 * @param {{maxInfluences?:number, solver?:'direct'|'cg', tolerance?:number, maxIterations?:number,
 *          visible?:(vertex:number, point:number[])=>boolean, onProgress?:(fraction:number, stage:string)=>void}} [opts]
 *   solver: 'direct' (default) factors the system once and back-substitutes per bone; 'cg' iterates
 *   per bone. The direct solver falls back to 'cg' if the matrix turns out not positive definite.
 * @returns {{skinIndex: Uint16Array, skinWeight: Float32Array, stats: object}}
 */
export function computeHeatWeights(mesh, bones, opts = {}) {
  const t0 = now();
  const position = mesh.position;
  const n = position.length / 3;
  const index = cleanTriangles(mesh.index);
  const maxInfluences = opts.maxInfluences ?? HEAT.MAX_INFLUENCES;
  const tolerance = opts.tolerance ?? HEAT.TOLERANCE;
  const maxIterations = opts.maxIterations ?? HEAT.MAX_ITERATIONS;
  const progress = opts.onProgress || (() => {});

  progress(0, 'surface');
  const lap = buildSurfaceLaplacian(position, index);
  const normal = vertexNormals(position, index);
  const t1 = now();
  progress(0.05, 'visibility');
  const visible = opts.visible || createVisibility(position, index);
  const src = heatSources(position, normal, bones, visible);
  const t2 = now();

  // Symmetric form of the heat equation on the surface: (L + M·H) w = M·H·p, where M = 2·area
  // (the inverse of the row scaling 0.5/area that makes L a proper Laplacian). Isolated vertices
  // (no faces, no source) get a unit diagonal so the system stays solvable; they fall back below.
  const diag = new Float64Array(n);
  const mass = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    mass[i] = 2 * lap.area[i] * src.H[i];
    diag[i] = lap.value[lap.rowPtr[i]] + mass[i];
    if (!(diag[i] > 0)) diag[i] = 1;
  }
  // Factor once (the matrix is the same for every bone), then one solve per bone.
  let solver = opts.solver || 'direct';
  let factor = null;
  let directError = null;
  const tFactor = now();
  if (solver === 'direct') {
    progress(0.1, 'factor');
    try {
      factor = choleskyFactor(n, lap.rowPtr, lap.col, lap.value, diag, position);
    } catch (err) {
      directError = String(err && err.message ? err.message : err);
      solver = 'cg';
    }
  }
  const factorMs = Math.round(now() - tFactor);
  const rhs = new Float64Array(n);
  const perVertex = new Array(n);
  for (let i = 0; i < n; i++) perVertex[i] = [];
  const iterations = [];
  let unconverged = 0;
  for (let j = 0; j < bones.length; j++) {
    rhs.fill(0);
    for (let i = 0; i < n; i++) if (src.sources[i].includes(j)) rhs[i] = mass[i] * src.P[i];
    let x;
    if (factor) {
      x = choleskySolve(factor, rhs, rhs);
    } else {
      const cg = conjugateGradient(lap, diag, rhs, tolerance, maxIterations);
      x = cg.x;
      iterations.push(cg.iterations);
      if (!cg.converged) unconverged++;
    }
    for (let i = 0; i < n; i++) {
      const w = limitWeight(x[i]);
      if (w > 0) perVertex[i].push([j, w]);
    }
    progress(0.2 + (0.8 * (j + 1)) / bones.length, 'solve');
  }
  const t3 = now();
  let fallback = 0;
  for (let i = 0; i < n; i++) {
    if (!perVertex[i].length) {
      fallback++;
      perVertex[i].push([src.nearest[i], 1]);
    }
  }
  const { skinIndex, skinWeight } = packInfluences(perVertex, n, maxInfluences);
  let over = 0;
  for (let i = 0; i < n; i++) if (perVertex[i].length > maxInfluences) over++;
  return {
    skinIndex,
    skinWeight,
    stats: {
      vertices: n,
      triangles: index.length / 3,
      droppedTriangles: mesh.index.length / 3 - index.length / 3,
      bones: bones.length,
      noSourceVertices: src.noSource,
      fallbackVertices: fallback,
      verticesOverMax: over,
      solver,
      directError,
      factorNonzeros: factor ? factor.nonzeros : 0,
      factorMs,
      iterations,
      unconvergedBones: unconverged,
      surfaceMs: Math.round(t1 - t0),
      visibilityMs: Math.round(t2 - t1),
      solveMs: Math.round(t3 - t2 - factorMs),
      ms: Math.round(now() - t0),
    },
  };
}
