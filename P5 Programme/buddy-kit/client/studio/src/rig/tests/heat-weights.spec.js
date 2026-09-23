// Bone heat weights: the bending maths for the new rig (task 014). Pure geometry in, per-vertex
// bone influences out. These tests use small synthetic meshes; the full-size comparison against
// Blender's own weights on the generated dino is an evidence check outside the suite.
import {
  cleanTriangles,
  buildSurfaceLaplacian,
  limitWeight,
  packInfluences,
  createVisibility,
  computeHeatWeights,
} from '../heat-weights.js';

/** Closed tube along +Y from y=0 to y=length: `radial` verts per ring, `rings` rings, capped. */
function makeTube(radius, length, radial = 24, rings = 40) {
  const pos = [];
  const idx = [];
  for (let r = 0; r <= rings; r++) {
    const y = (length * r) / rings;
    for (let s = 0; s < radial; s++) {
      const a = (2 * Math.PI * s) / radial;
      pos.push(radius * Math.cos(a), y, radius * Math.sin(a));
    }
  }
  const ring = (r, s) => r * radial + (s % radial);
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < radial; s++) {
      // outward-facing: counter-clockwise seen from outside
      idx.push(ring(r, s), ring(r + 1, s), ring(r, s + 1));
      idx.push(ring(r, s + 1), ring(r + 1, s), ring(r + 1, s + 1));
    }
  }
  const bottom = pos.length / 3;
  pos.push(0, 0, 0);
  const top = pos.length / 3;
  pos.push(0, length, 0);
  for (let s = 0; s < radial; s++) {
    idx.push(bottom, ring(0, s), ring(0, s + 1));
    idx.push(top, ring(rings, s + 1), ring(rings, s));
  }
  return { position: new Float32Array(pos), index: new Uint32Array(idx) };
}

/** Axis-aligned closed box [min, max] with outward faces. */
function makeBox(min, max) {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  const position = new Float32Array([
    x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0,
    x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1,
  ]);
  const index = new Uint32Array([
    0, 2, 1, 0, 3, 2, // -z
    4, 5, 6, 4, 6, 7, // +z
    0, 1, 5, 0, 5, 4, // -y
    3, 7, 6, 3, 6, 2, // +y
    0, 4, 7, 0, 7, 3, // -x
    1, 2, 6, 1, 6, 5, // +x
  ]);
  return { position, index };
}

function mergeMeshes(a, b) {
  const offset = a.position.length / 3;
  const position = new Float32Array(a.position.length + b.position.length);
  position.set(a.position);
  position.set(b.position, a.position.length);
  const index = new Uint32Array(a.index.length + b.index.length);
  index.set(a.index);
  for (let i = 0; i < b.index.length; i++) index[a.index.length + i] = b.index[i] + offset;
  return { position, index };
}

export default function (check) {
  // --- cleanTriangles drops degenerate and duplicate triangles, keeps order ---
  {
    const cleaned = cleanTriangles(new Uint32Array([0, 1, 2, 2, 2, 5, 1, 2, 0, 3, 4, 5, 4, 3, 5]));
    check('heat: cleanTriangles keeps the first copy of each triangle and drops degenerate ones',
      Array.from(cleaned).join(',') === '0,1,2,3,4,5');
  }

  // --- the surface Laplacian: rows sum to zero, symmetric, positive vertex areas ---
  {
    const tube = makeTube(0.5, 3);
    const lap = buildSurfaceLaplacian(tube.position, tube.index);
    const n = tube.position.length / 3;
    let maxRowSum = 0;
    let asym = 0;
    let minArea = Infinity;
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let k = lap.rowPtr[i]; k < lap.rowPtr[i + 1]; k++) {
        sum += lap.value[k];
        const j = lap.col[k];
        // find (j, i)
        let back = null;
        for (let m = lap.rowPtr[j]; m < lap.rowPtr[j + 1]; m++) if (lap.col[m] === i) back = lap.value[m];
        asym = Math.max(asym, back == null ? Infinity : Math.abs(back - lap.value[k]));
      }
      maxRowSum = Math.max(maxRowSum, Math.abs(sum));
      minArea = Math.min(minArea, lap.area[i]);
    }
    check('heat: Laplacian rows sum to zero (constants are in the null space)', maxRowSum < 1e-6);
    check('heat: Laplacian is symmetric', asym < 1e-9);
    check('heat: every vertex has a positive area', minArea > 0);
  }

  // --- Blender's clean-up ramp: below 0.025 → 0, 0.025..0.05 → ramp to 0.05, above unchanged ---
  {
    check('heat: limitWeight ramp', limitWeight(0.01) === 0 && limitWeight(0.025) === 0 &&
      Math.abs(limitWeight(0.0375) - 0.025) < 1e-9 && limitWeight(0.05) === 0.05 && limitWeight(0.7) === 0.7);
  }

  // --- packInfluences keeps the four strongest, renormalised, strongest first ---
  {
    const per = [[[3, 0.05], [1, 0.4], [0, 0.3], [4, 0.15], [2, 0.1]], [], [[7, 0.2]]];
    const { skinIndex, skinWeight } = packInfluences(per, 3, 4);
    const w0 = Array.from(skinWeight.slice(0, 4));
    check('heat: packInfluences orders strongest first and drops the fifth',
      Array.from(skinIndex.slice(0, 4)).join(',') === '1,0,4,2');
    check('heat: packInfluences renormalises to 1', Math.abs(w0.reduce((a, b) => a + b, 0) - 1) < 1e-6 &&
      Math.abs(w0[0] - 0.4 / 0.95) < 1e-6);
    check('heat: packInfluences leaves an unweighted vertex all-zero',
      Array.from(skinWeight.slice(4, 8)).every((v) => v === 0));
    check('heat: a single influence packs to weight 1', skinIndex[8] === 7 && skinWeight[8] === 1);
  }

  // --- visibility: exiting the body does not block; re-entering it does (Blender's rule) ---
  {
    const box = makeBox([-1, -1, -1], [1, 1, 1]);
    const blocker = makeBox([2, -1, -1], [3, 1, 1]);
    const visible = createVisibility(box.position, box.index);
    // vertex 0 is (-1,-1,-1); a target outside beyond the +x face: the ray only EXITS the box
    check('heat: a target past the far wall is still visible (exits are ignored)', visible(0, [5, 0, 0]) === true);
    const two = mergeMeshes(box, blocker);
    const visible2 = createVisibility(two.position, two.index);
    check('heat: a target inside another body is hidden (the ray re-enters a surface)',
      visible2(0, [2.5, 0, 0]) === false);
    check('heat: a target inside the same body is visible', visible2(0, [0.5, -0.5, -0.5]) === true);
  }

  // --- one bone: every vertex follows it fully ---
  {
    const tube = makeTube(0.5, 3);
    const out = computeHeatWeights(tube, [{ head: [0, 0, 0], tail: [0, 3, 0] }]);
    const n = tube.position.length / 3;
    let ok = true;
    for (let i = 0; i < n; i++) ok = ok && out.skinIndex[i * 4] === 0 && Math.abs(out.skinWeight[i * 4] - 1) < 1e-6;
    check('heat: one bone gets weight 1 everywhere', ok);
    check('heat: stats report vertices, triangles and timing',
      out.stats.vertices === n && out.stats.triangles === tube.index.length / 3 && out.stats.ms >= 0);
  }

  // --- two bones end to end: a smooth, monotone hand-over at the middle ---
  {
    const L = 4;
    const tube = makeTube(0.4, L, 24, 48);
    const out = computeHeatWeights(tube, [
      { head: [0, 0, 0], tail: [0, L / 2, 0] },
      { head: [0, L / 2, 0], tail: [0, L, 0] },
    ]);
    const n = tube.position.length / 3;
    const w0 = new Float32Array(n);
    let sumErr = 0;
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let k = 0; k < 4; k++) {
        s += out.skinWeight[i * 4 + k];
        if (out.skinWeight[i * 4 + k] > 0 && out.skinIndex[i * 4 + k] === 0) w0[i] = out.skinWeight[i * 4 + k];
      }
      sumErr = Math.max(sumErr, Math.abs(s - 1));
    }
    check('heat: two-bone weights sum to 1', sumErr < 1e-5);
    const byY = [];
    for (let i = 0; i < n; i++) byY.push([tube.position[i * 3 + 1], w0[i]]);
    byY.sort((a, b) => a[0] - b[0]);
    let monotone = true;
    for (let i = 1; i < byY.length; i++) if (byY[i][1] > byY[i - 1][1] + 1e-3) monotone = false;
    check('heat: bone 0 influence never increases along the tube', monotone);
    const bottom = byY.slice(0, 24).map((e) => e[1]);
    const top = byY.slice(-24).map((e) => e[1]);
    check('heat: bone 0 owns the bottom end', Math.min(...bottom) > 0.95);
    check('heat: bone 0 lets go of the top end', Math.max(...top) < 0.05);
    const mid = byY.filter((e) => Math.abs(e[0] - L / 2) < 1e-6).map((e) => e[1]);
    check('heat: the hand-over is about half way at the middle ring',
      mid.length > 0 && Math.abs(mid.reduce((a, b) => a + b, 0) / mid.length - 0.5) < 0.15);
    const seam = byY.filter((e) => Math.abs(e[0] - L / 2) < L / 48 + 1e-6);
    const spread = Math.max(...seam.map((e) => e[1])) - Math.min(...seam.map((e) => e[1]));
    check('heat: the hand-over is gradual, not a hard cut', spread < 0.6);
  }

  // --- the direct solver is the default and agrees with the iterative one ---
  {
    const L = 4;
    const tube = makeTube(0.4, L, 24, 48);
    const bones = [{ head: [0, 0, 0], tail: [0, L / 2, 0] }, { head: [0, L / 2, 0], tail: [0, L, 0] }];
    const direct = computeHeatWeights(tube, bones);
    const iterative = computeHeatWeights(tube, bones, { solver: 'cg', tolerance: 1e-10 });
    let diff = 0;
    let sameIndex = true;
    for (let i = 0; i < direct.skinWeight.length; i++) {
      diff = Math.max(diff, Math.abs(direct.skinWeight[i] - iterative.skinWeight[i]));
      if (direct.skinIndex[i] !== iterative.skinIndex[i]) sameIndex = false;
    }
    check('heat: the direct solver is the default and reports its factor',
      direct.stats.solver === 'direct' && direct.stats.factorNonzeros > 0 && direct.stats.directError === null && direct.stats.iterations.length === 0);
    check('heat: direct and iterative solves give the same weights', sameIndex && diff < 1e-5);
    check('heat: the iterative solver reports its iterations', iterative.stats.solver === 'cg' && iterative.stats.iterations.length === 2);
  }

  // --- side by side bodies: the bone in the other body does not bleed across the gap ---
  {
    const a = makeTube(0.3, 2, 16, 20);
    const b = makeTube(0.3, 2, 16, 20);
    for (let i = 0; i < b.position.length; i += 3) b.position[i] += 1.0; // shift along +X
    const two = mergeMeshes(a, b);
    const out = computeHeatWeights(two, [
      { head: [0, 0, 0], tail: [0, 2, 0] },
      { head: [1, 0, 0], tail: [1, 2, 0] },
    ]);
    const nA = a.position.length / 3;
    const nAll = two.position.length / 3;
    let okA = true;
    let okB = true;
    for (let i = 0; i < nA; i++) okA = okA && out.skinIndex[i * 4] === 0 && out.skinWeight[i * 4] > 0.99;
    for (let i = nA; i < nAll; i++) okB = okB && out.skinIndex[i * 4] === 1 && out.skinWeight[i * 4] > 0.99;
    check('heat: each separate body follows its own bone', okA && okB);
  }
}
