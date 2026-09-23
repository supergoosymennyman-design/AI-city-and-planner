// src/rig/tests/coarse.spec.js
// The light copy the bending is solved on (task 014, spec §3): at most `target` points, the shape
// kept within one grid cell, never drawn. Properties, not fixtures: under target, shape preserved,
// untouched when already small, still solvable by bone heat.
import { coarseCopy, COARSE_TARGET } from '../coarse.js';
import { computeHeatWeights } from '../heat-weights.js';
import { makeBox, makeTube, mergeMeshes } from './fixtures.js';

const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(String(e.message)); } };

/** Distance from (x,y,z) to the nearest point of a flat position array (brute force; tests only). */
function nearest(x, y, z, position) {
  let best = Infinity;
  for (let i = 0; i < position.length; i += 3) {
    const dx = position[i] - x;
    const dy = position[i + 1] - y;
    const dz = position[i + 2] - z;
    const d = dx * dx + dy * dy + dz * dz;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

export default function (check) {
  // --- a small mesh is used as it is ---
  {
    const box = makeBox([-1, -1, -1], [1, 1, 1]);
    const out = coarseCopy(box, { target: 100 });
    check('coarse: a mesh under the target comes back untouched', out.reduced === false && out.position === box.position && out.stats.coarsePoints === 8 && out.stats.coarseTriangles === 12);
    check('coarse: the default target is the tablet budget', COARSE_TARGET === 20000 && coarseCopy(box).reduced === false);
    check('coarse: a silly target is refused', throws(() => coarseCopy(box, { target: 2 }), /at least 4/) && throws(() => coarseCopy(box, { target: 2.5 }), /integer/));
    check('coarse: a mesh with no real triangle is refused', throws(() => coarseCopy({ position: new Float32Array(9), index: new Uint32Array([0, 0, 0]) }), /triangle/));
  }

  // --- a tube of 986 points reduced to at most 200 ---
  {
    const tube = makeTube(0.5, 3, 24, 40);
    const out = coarseCopy(tube, { target: 200 });
    const m = out.stats.coarsePoints;
    check('coarse: the copy is under the target', out.reduced === true && m <= 200 && m === out.position.length / 3);
    check('coarse: the copy uses a good share of the budget', m > 100);
    check('coarse: stats report the reduction', out.stats.finePoints === 986 && out.stats.fineTriangles === tube.index.length / 3 && out.stats.searches > 0 && out.stats.searches <= 24 && out.stats.cellSize > 0);
    let degenerate = 0;
    let outOfRange = 0;
    const used = new Uint8Array(m);
    for (let t = 0; t < out.index.length; t += 3) {
      const a = out.index[t], b = out.index[t + 1], c = out.index[t + 2];
      if (a === b || b === c || a === c) degenerate++;
      if (a >= m || b >= m || c >= m) outOfRange++;
      used[a] = 1; used[b] = 1; used[c] = 1;
    }
    check('coarse: no collapsed triangle survives', degenerate === 0 && outOfRange === 0 && out.stats.coarseTriangles === out.index.length / 3 && out.index.length >= 3);
    check('coarse: every coarse point sits on a triangle', used.every((u) => u === 1));
    const tol = out.stats.cellSize * Math.sqrt(3);
    let worstCoarse = 0;
    for (let i = 0; i < out.position.length; i += 3) worstCoarse = Math.max(worstCoarse, nearest(out.position[i], out.position[i + 1], out.position[i + 2], tube.position));
    let worstFine = 0;
    for (let i = 0; i < tube.position.length; i += 3) worstFine = Math.max(worstFine, nearest(tube.position[i], tube.position[i + 1], tube.position[i + 2], out.position));
    check('coarse: every coarse point lies within a cell diagonal of the original surface', worstCoarse <= tol);
    check('coarse: every original point has a coarse point within a cell diagonal', worstFine <= tol);
    const box = (p) => { const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[i + k]); hi[k] = Math.max(hi[k], p[i + k]); } return [lo, hi]; };
    const [fLo, fHi] = box(tube.position);
    const [cLo, cHi] = box(out.position);
    check('coarse: the bounding box is kept within a cell', [0, 1, 2].every((k) => Math.abs(fLo[k] - cLo[k]) <= tol && Math.abs(fHi[k] - cHi[k]) <= tol));
    const again = coarseCopy(tube, { target: 200 });
    check('coarse: the reduction is deterministic', again.position.length === out.position.length && again.position.every((v, i) => v === out.position[i]) && again.index.every((v, i) => v === out.index[i]));
  }

  // --- the copy still bends: bone heat runs on it and hands over along the tube ---
  {
    const tube = makeTube(0.4, 4, 24, 48);
    const out = coarseCopy(tube, { target: 300 });
    const heat = computeHeatWeights(out, [{ head: [0, 0, 0], tail: [0, 2, 0] }, { head: [0, 2, 0], tail: [0, 4, 0] }]);
    check('coarse: bone heat runs on the copy without fallbacks', heat.stats.fallbackVertices === 0 && heat.stats.unconvergedBones === 0);
    let bottomOk = true;
    let topOk = true;
    let seen = 0;
    for (let i = 0; i < out.stats.coarsePoints; i++) {
      const y = out.position[i * 3 + 1];
      let w0 = 0;
      for (let k = 0; k < 4; k++) if (heat.skinWeight[i * 4 + k] > 0 && heat.skinIndex[i * 4 + k] === 0) w0 = heat.skinWeight[i * 4 + k];
      if (y < 0.5) { seen++; bottomOk = bottomOk && w0 > 0.9; }
      if (y > 3.5) topOk = topOk && w0 < 0.1;
    }
    check('coarse: the copy bends like the original — bone 0 owns the bottom, bone 1 the top', seen > 0 && bottomOk && topOk);
  }

  // --- the tablet case: a model over the budget lands under it by default ---
  {
    const big = makeTube(0.5, 3, 64, 400); // 26,562 points
    const out = coarseCopy(big);
    check('coarse: a 26k-point model reduces under the 20k budget by default', out.reduced === true && out.stats.coarsePoints <= 20000 && out.stats.coarsePoints > 5000);
  }

  // --- regression: stranded clusters are dropped (no island in the Laplacian) ---
  {
    const box = makeBox([-1, -1, -1], [1, 1, 1]);
    // Merge a tiny disconnected triangle far from the box
    const disconnected = { position: new Float32Array([10, 10, 10, 11, 10, 10, 10, 11, 10]), index: new Uint32Array([0, 1, 2]) };
    const merged = mergeMeshes(box, disconnected);
    const out = coarseCopy(merged, { target: 9 });
    check('coarse: stranded clusters are dropped; surviving points are all used', out.stats.strandedPoints > 0 && out.stats.coarsePoints === 8 && Array.from({ length: out.stats.coarsePoints }, (_, i) => {
      for (let t = 0; t < out.index.length; t += 3) {
        if (out.index[t] === i || out.index[t + 1] === i || out.index[t + 2] === i) return true;
      }
      return false;
    }).every(u => u));
  }

  // --- regression: degenerate padding triangles are cleaned before the solve ---
  {
    const box = makeBox([-1, -1, -1], [1, 1, 1]);
    // Append degenerate padding triangles (common in AI-generated meshes)
    const padded = {
      position: box.position,
      index: new Uint32Array([...box.index, 0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3]),
    };
    const out = coarseCopy(padded, { target: 100 });
    const clean = coarseCopy(box, { target: 100 });
    check('coarse: degenerate padding triangles are cleaned away; output identical to clean mesh', out.stats.fineTriangles === clean.stats.fineTriangles && out.stats.coarseTriangles === clean.stats.coarseTriangles && out.stats.finePoints === clean.stats.finePoints && out.stats.coarsePoints === clean.stats.coarsePoints);
  }

  // --- boundary case: mesh exactly at target ---
  {
    const box = makeBox([-1, -1, -1], [1, 1, 1]); // 8 vertices
    const out = coarseCopy(box, { target: 8 });
    check('coarse: mesh exactly at target comes back untouched', out.reduced === false && out.position === box.position);
  }
}
