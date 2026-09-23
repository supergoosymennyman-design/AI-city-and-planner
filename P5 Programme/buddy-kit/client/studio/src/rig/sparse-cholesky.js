// Sparse Cholesky (L·Lᵀ) for symmetric positive definite systems, with a geometric
// nested-dissection ordering. Built for the bone-heat solve (heat-weights.js): the matrix is the
// same for every bone, so factor it once and each bone is one cheap forward/back substitution.
//
// Ordering: the mesh's vertex positions are known, so instead of a graph-theoretic ordering the
// vertex set is split in halves along its longest axis, recursively; the vertices on one side of
// each cut that touch the other side form the separator and are numbered last. On a surface mesh
// this keeps the factor to roughly n·log n entries.
//
// Factorisation: up-looking Cholesky row by row, using the elimination tree to find each row's
// pattern (Davis, "Direct Methods for Sparse Linear Systems", ch. 4). Our own implementation.
//
// Matrix input: the symmetric off-diagonal part as CSR (rowPtr / col / value; any entry whose
// column equals its row is ignored) plus a separate diagonal array.

/**
 * Geometric nested-dissection ordering.
 * @param {number} n
 * @param {Int32Array} rowPtr CSR row pointers of the (symmetric) adjacency
 * @param {Int32Array} col CSR column indices
 * @param {ArrayLike<number>} position xyz per vertex
 * @param {number} [leafSize] sets this small are ordered as they come
 * @returns {{perm: Int32Array, inv: Int32Array}} perm[new] = old, inv[old] = new
 */
export function nestedDissectionOrder(n, rowPtr, col, position, leafSize = 48) {
  const perm = new Int32Array(n);
  const inv = new Int32Array(n);
  const stamp = new Int32Array(n); // each split marks its two sides with fresh ids
  let filled = 0;
  let nextId = 1;
  const all = new Int32Array(n);
  for (let i = 0; i < n; i++) all[i] = i;
  const stack = [{ ids: all }];
  while (stack.length) {
    const task = stack.pop();
    if (task.emit) {
      perm.set(task.emit, filled);
      filled += task.emit.length;
      continue;
    }
    const S = task.ids;
    const m = S.length;
    if (m <= leafSize) {
      perm.set(S, filled);
      filled += m;
      continue;
    }
    // longest axis of the set's bounding box
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let t = 0; t < m; t++) {
      const v = S[t] * 3;
      for (let a = 0; a < 3; a++) {
        const c = position[v + a];
        if (c < min[a]) min[a] = c;
        if (c > max[a]) max[a] = c;
      }
    }
    let axis = 0;
    for (let a = 1; a < 3; a++) if (max[a] - min[a] > max[axis] - min[axis]) axis = a;
    if (!(max[axis] - min[axis] > 0)) {
      perm.set(S, filled); // coincident points: nothing to split
      filled += m;
      continue;
    }
    const sorted = Int32Array.from(S).sort((a, b) => position[a * 3 + axis] - position[b * 3 + axis]);
    const half = m >> 1;
    const id = nextId++;
    const sideA = id * 2;
    const sideB = id * 2 + 1;
    for (let t = 0; t < half; t++) stamp[sorted[t]] = sideA;
    for (let t = half; t < m; t++) stamp[sorted[t]] = sideB;
    // the smaller of the two boundaries is the separator
    const boundaryA = [];
    const boundaryB = [];
    for (let t = 0; t < half; t++) {
      const v = sorted[t];
      for (let p = rowPtr[v]; p < rowPtr[v + 1]; p++) if (stamp[col[p]] === sideB) { boundaryA.push(v); break; }
    }
    for (let t = half; t < m; t++) {
      const v = sorted[t];
      for (let p = rowPtr[v]; p < rowPtr[v + 1]; p++) if (stamp[col[p]] === sideA) { boundaryB.push(v); break; }
    }
    const separator = boundaryA.length <= boundaryB.length ? boundaryA : boundaryB;
    for (const v of separator) stamp[v] = -id;
    const partA = [];
    const partB = [];
    for (let t = 0; t < m; t++) {
      const v = sorted[t];
      if (stamp[v] === sideA) partA.push(v);
      else if (stamp[v] === sideB) partB.push(v);
    }
    // depth-first: A first, then B, the separator last
    if (separator.length) stack.push({ emit: Int32Array.from(separator) });
    if (partB.length) stack.push({ ids: Int32Array.from(partB) });
    if (partA.length) stack.push({ ids: Int32Array.from(partA) });
  }
  if (filled !== n) throw new Error(`ordering lost vertices: ${filled} of ${n}`);
  for (let k = 0; k < n; k++) inv[perm[k]] = k;
  return { perm, inv };
}

/** Row pattern of L via the elimination tree: returns `top`; s[top..n) lists the columns of
 * row k of L in an order that lets the triangular solve run straight through. */
function reach(k, Cp, Ci, parent, s, mark) {
  const n = parent.length;
  let top = n;
  mark[k] = k;
  for (let p = Cp[k]; p < Cp[k + 1]; p++) {
    let i = Ci[p];
    if (i > k) continue;
    let len = 0;
    for (; mark[i] !== k; i = parent[i]) {
      s[len++] = i;
      mark[i] = k;
    }
    while (len > 0) s[--top] = s[--len];
  }
  return top;
}

/**
 * Factor A = L·Lᵀ where A = offdiagonal(CSR) + diag(diag).
 * @param {number} n
 * @param {Int32Array} rowPtr
 * @param {Int32Array} col
 * @param {Float64Array} value off-diagonal values (entries with col === row are ignored)
 * @param {Float64Array} diag the system's diagonal
 * @param {ArrayLike<number>} position xyz per vertex, for the ordering
 * @param {{perm?: Int32Array}} [opts] a ready ordering (perm[new] = old) instead of computing one
 * @returns {{n:number, perm:Int32Array, inv:Int32Array, Lp:Int32Array, Li:Int32Array, Lx:Float64Array, nonzeros:number}}
 * @throws {Error} when the matrix is not positive definite
 */
export function choleskyFactor(n, rowPtr, col, value, diag, position, opts = {}) {
  let perm;
  let inv;
  if (opts.perm) {
    perm = opts.perm;
    inv = new Int32Array(n);
    for (let k = 0; k < n; k++) inv[perm[k]] = k;
  } else {
    ({ perm, inv } = nestedDissectionOrder(n, rowPtr, col, position));
  }
  // C = P·A·Pᵀ, upper triangle including the diagonal, column-compressed (CSC); for a symmetric
  // matrix the CSR of the rows is the CSC of the columns.
  const Cp = new Int32Array(n + 1);
  for (let k = 0; k < n; k++) {
    const r = perm[k];
    let count = 1;
    for (let p = rowPtr[r]; p < rowPtr[r + 1]; p++) {
      const c = col[p];
      if (c !== r && inv[c] < k) count++;
    }
    Cp[k + 1] = Cp[k] + count;
  }
  const Ci = new Int32Array(Cp[n]);
  const Cx = new Float64Array(Cp[n]);
  for (let k = 0; k < n; k++) {
    const r = perm[k];
    let q = Cp[k];
    Ci[q] = k;
    Cx[q++] = diag[r];
    for (let p = rowPtr[r]; p < rowPtr[r + 1]; p++) {
      const c = col[p];
      if (c !== r && inv[c] < k) {
        Ci[q] = inv[c];
        Cx[q++] = value[p];
      }
    }
  }
  // elimination tree
  const parent = new Int32Array(n).fill(-1);
  const ancestor = new Int32Array(n).fill(-1);
  for (let k = 0; k < n; k++) {
    for (let p = Cp[k]; p < Cp[k + 1]; p++) {
      let i = Ci[p];
      while (i !== -1 && i < k) {
        const next = ancestor[i];
        ancestor[i] = k;
        if (next === -1) parent[i] = k;
        i = next;
      }
    }
  }
  // symbolic pass: how many entries each column of L holds
  const s = new Int32Array(n);
  const mark = new Int32Array(n).fill(-1);
  const count = new Int32Array(n).fill(1);
  for (let k = 0; k < n; k++) {
    const top = reach(k, Cp, Ci, parent, s, mark);
    for (let p = top; p < n; p++) count[s[p]]++;
  }
  const Lp = new Int32Array(n + 1);
  for (let k = 0; k < n; k++) Lp[k + 1] = Lp[k] + count[k];
  const nonzeros = Lp[n];
  const Li = new Int32Array(nonzeros);
  const Lx = new Float64Array(nonzeros);
  const next = Int32Array.from(Lp.subarray(0, n));
  const x = new Float64Array(n);
  mark.fill(-1);
  // numeric pass, row by row
  for (let k = 0; k < n; k++) {
    const top = reach(k, Cp, Ci, parent, s, mark);
    for (let p = Cp[k]; p < Cp[k + 1]; p++) x[Ci[p]] = Cx[p];
    let d = x[k];
    x[k] = 0;
    for (let t = top; t < n; t++) {
      const i = s[t];
      const lki = x[i] / Lx[Lp[i]];
      x[i] = 0;
      for (let p = Lp[i] + 1; p < next[i]; p++) x[Li[p]] -= Lx[p] * lki;
      d -= lki * lki;
      const q = next[i]++;
      Li[q] = k;
      Lx[q] = lki;
    }
    if (!(d > 0)) throw new Error(`matrix is not positive definite (pivot ${d} at ${k})`);
    const q = next[k]++;
    Li[q] = k;
    Lx[q] = Math.sqrt(d);
  }
  return { n, perm, inv, Lp, Li, Lx, nonzeros };
}

/**
 * Solve A·x = b with a factor from choleskyFactor.
 * @param {ReturnType<typeof choleskyFactor>} factor
 * @param {Float64Array} b
 * @param {Float64Array} [x] output (may be b itself)
 * @returns {Float64Array}
 */
export function choleskySolve(factor, b, x = new Float64Array(b.length)) {
  const { n, perm, Lp, Li, Lx } = factor;
  const y = new Float64Array(n);
  for (let k = 0; k < n; k++) y[k] = b[perm[k]];
  for (let j = 0; j < n; j++) { // L·y = P·b
    const yj = (y[j] /= Lx[Lp[j]]);
    for (let p = Lp[j] + 1; p < Lp[j + 1]; p++) y[Li[p]] -= Lx[p] * yj;
  }
  for (let j = n - 1; j >= 0; j--) { // Lᵀ·z = y
    let v = y[j];
    for (let p = Lp[j] + 1; p < Lp[j + 1]; p++) v -= Lx[p] * y[Li[p]];
    y[j] = v / Lx[Lp[j]];
  }
  for (let k = 0; k < n; k++) x[perm[k]] = y[k];
  return x;
}
