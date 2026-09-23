// Sparse Cholesky + geometric ordering: the direct solver behind the bone-heat weights.
import { nestedDissectionOrder, choleskyFactor, choleskySolve } from '../sparse-cholesky.js';
import { buildSurfaceLaplacian, conjugateGradient } from '../heat-weights.js';

/** A w×h grid of vertices in the XY plane, triangulated — a small "surface". */
function makeGrid(w, h) {
  const pos = [];
  const idx = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) pos.push(x, y, 0);
  const at = (x, y) => y * w + x;
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      idx.push(at(x, y), at(x + 1, y), at(x, y + 1));
      idx.push(at(x + 1, y), at(x + 1, y + 1), at(x, y + 1));
    }
  }
  return { position: new Float32Array(pos), index: new Uint32Array(idx) };
}

/** A = offdiag(lap) + diag: multiply. */
function multiply(lap, diag, x) {
  const out = new Float64Array(lap.n);
  for (let i = 0; i < lap.n; i++) {
    let s = diag[i] * x[i];
    for (let k = lap.rowPtr[i] + 1; k < lap.rowPtr[i + 1]; k++) s += lap.value[k] * x[lap.col[k]];
    out[i] = s;
  }
  return out;
}

export default function (check) {
  const grid = makeGrid(40, 40);
  const lap = buildSurfaceLaplacian(grid.position, grid.index);
  const n = lap.n;
  const diag = new Float64Array(n);
  for (let i = 0; i < n; i++) diag[i] = lap.value[lap.rowPtr[i]] + 0.05 * (1 + (i % 7)); // SPD: Laplacian + positive mass

  // --- ordering is a permutation ---
  {
    const { perm, inv } = nestedDissectionOrder(n, lap.rowPtr, lap.col, grid.position);
    const seen = new Uint8Array(n);
    let ok = true;
    for (let k = 0; k < n; k++) { if (seen[perm[k]]) ok = false; seen[perm[k]] = 1; if (inv[perm[k]] !== k) ok = false; }
    check('cholesky: nested dissection returns a permutation with a consistent inverse', ok && seen.every((v) => v === 1));
  }

  // --- the direct solve is exact (residual at round-off) and agrees with the iterative solve ---
  {
    const b = new Float64Array(n);
    for (let i = 0; i < n; i++) b[i] = Math.sin(i * 0.37) + (i % 5 === 0 ? 2 : 0);
    const factor = choleskyFactor(n, lap.rowPtr, lap.col, lap.value, diag, grid.position);
    const x = choleskySolve(factor, b);
    const ax = multiply(lap, diag, x);
    let residual = 0;
    let bNorm = 0;
    for (let i = 0; i < n; i++) { residual += (ax[i] - b[i]) ** 2; bNorm += b[i] * b[i]; }
    check('cholesky: A·x = b to round-off', Math.sqrt(residual / bNorm) < 1e-12);
    const cg = conjugateGradient(lap, diag, b, 1e-12, 20000);
    let diff = 0;
    for (let i = 0; i < n; i++) diff = Math.max(diff, Math.abs(cg.x[i] - x[i]));
    check('cholesky: direct and conjugate-gradient solutions agree', cg.converged && diff < 1e-7);
    check('cholesky: the factor reports its size', factor.nonzeros > n && factor.Lp[n] === factor.nonzeros);
  }

  // --- the geometric ordering keeps the factor small; a naive order fills in far more ---
  {
    const identity = new Int32Array(n);
    for (let i = 0; i < n; i++) identity[i] = i;
    const naive = choleskyFactor(n, lap.rowPtr, lap.col, lap.value, diag, grid.position, { perm: identity });
    const ordered = choleskyFactor(n, lap.rowPtr, lap.col, lap.value, diag, grid.position);
    check('cholesky: nested dissection cuts the fill-in well below the natural order',
      ordered.nonzeros < naive.nonzeros * 0.8);
    const b = new Float64Array(n).fill(1);
    const x1 = choleskySolve(naive, b);
    const x2 = choleskySolve(ordered, b);
    let diff = 0;
    for (let i = 0; i < n; i++) diff = Math.max(diff, Math.abs(x1[i] - x2[i]));
    check('cholesky: both orderings give the same solution', diff < 1e-9);
  }

  // --- a matrix that is not positive definite is refused, not silently mangled ---
  {
    const bad = Float64Array.from(diag);
    bad[123] = -5;
    let threw = false;
    try { choleskyFactor(n, lap.rowPtr, lap.col, lap.value, bad, grid.position); } catch (e) { threw = /positive definite/.test(e.message); }
    check('cholesky: a non-positive-definite matrix throws', threw);
  }

  // --- solving in place works ---
  {
    const factor = choleskyFactor(n, lap.rowPtr, lap.col, lap.value, diag, grid.position);
    const b = new Float64Array(n).fill(0.5);
    const expected = choleskySolve(factor, b);
    const inPlace = choleskySolve(factor, b, b);
    let diff = 0;
    for (let i = 0; i < n; i++) diff = Math.max(diff, Math.abs(expected[i] - inPlace[i]));
    check('cholesky: solving into the right-hand side array gives the same answer', inPlace === b && diff === 0);
  }
}
