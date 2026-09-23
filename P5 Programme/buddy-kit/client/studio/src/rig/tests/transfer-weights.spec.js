// src/rig/tests/transfer-weights.spec.js
// Weights carried from one surface to another (task 014, spec §3 and §7). Exact answers on a quad
// whose four corners each own one bone, plus the property the coarse-to-fine path relies on: a
// surface transferred onto itself returns its own weights.
import { transferWeights } from '../transfer-weights.js';
import { computeHeatWeights } from '../heat-weights.js';
import { makeTube, makeQuad } from './fixtures.js';

const near = (a, b, tol = 1e-4) => Math.abs(a - b) < tol;

/** Weight of `bone` at packed vertex `i`, or 0. */
function weightOf(out, i, bone) {
  for (let k = 0; k < 4; k++) if (out.skinWeight[i * 4 + k] > 0 && out.skinIndex[i * 4 + k] === bone) return out.skinWeight[i * 4 + k];
  return 0;
}

/** A quad whose corner v owns bone v at full weight. */
function cornerSkin() {
  const skinIndex = new Uint16Array(16);
  const skinWeight = new Float32Array(16);
  for (let v = 0; v < 4; v++) { skinIndex[v * 4] = v; skinWeight[v * 4] = 1; }
  return { skinIndex, skinWeight };
}

export default function (check) {
  // --- a surface onto itself: the same weights come back ---
  {
    const tube = makeTube(0.4, 4, 24, 48);
    const heat = computeHeatWeights(tube, [{ head: [0, 0, 0], tail: [0, 2, 0] }, { head: [0, 2, 0], tail: [0, 4, 0] }]);
    const out = transferWeights(tube, heat, tube.position);
    const n = tube.position.length / 3;
    let sameDominant = true;
    let worst = 0;
    for (let i = 0; i < n; i++) {
      if (out.skinIndex[i * 4] !== heat.skinIndex[i * 4]) sameDominant = false;
      for (const bone of [0, 1]) worst = Math.max(worst, Math.abs(weightOf(out, i, bone) - weightOf(heat, i, bone)));
    }
    check('transfer: onto itself, every vertex keeps its strongest bone', sameDominant);
    check('transfer: onto itself, the weights match to 1e-4', worst < 1e-4 && out.stats.worstDistance < 1e-4);
  }

  // --- a point above a triangle gets that triangle's blend ---
  {
    const quad = makeQuad();
    // (0.2,-0.4) lies in the triangle (-1,-1),(1,-1),(1,1): barycentric 0.4 / 0.3 / 0.3
    const out = transferWeights(quad, cornerSkin(), new Float32Array([0.2, -0.4, 0.5]));
    check('transfer: the blend is the barycentric share of the three corners', near(weightOf(out, 0, 0), 0.4) && near(weightOf(out, 0, 1), 0.3) && near(weightOf(out, 0, 2), 0.3) && weightOf(out, 0, 3) === 0);
    check('transfer: the weights sum to one', near(out.skinWeight[0] + out.skinWeight[1] + out.skinWeight[2] + out.skinWeight[3], 1));
    check('transfer: it reports how far the point sits from the surface', out.stats.gearPoints === 1 && near(out.stats.meanDistance, 0.5) && near(out.stats.worstDistance, 0.5) && out.stats.rigid === false && out.stats.socket === null);
  }

  // --- rigid: the whole piece collapses onto the bone it agrees on most ---
  {
    const quad = makeQuad();
    // three points: two near corner 0 (bone 0 heavy), one near corner 2 (bone 2 heavy)
    const points = new Float32Array([-0.9, -0.9, 0.1, -0.5, -0.9, 0.1, 0.9, 0.9, 0.1]);
    const soft = transferWeights(quad, cornerSkin(), points);
    check('transfer: per point, the far point follows its own corner', soft.skinIndex[2 * 4] === 2 && weightOf(soft, 2, 2) > 0.9);
    const rigid = transferWeights(quad, cornerSkin(), points, { rigid: true });
    let allOnSocket = true;
    for (let i = 0; i < 3; i++) allOnSocket = allOnSocket && rigid.skinIndex[i * 4] === 0 && rigid.skinWeight[i * 4] === 1 && rigid.skinWeight[i * 4 + 1] === 0;
    check('transfer: rigid puts every point on the winning bone at full weight', allOnSocket);
    check('transfer: rigid names the socket and its share of the vote', rigid.stats.rigid === true && rigid.stats.socket.bone === 0 && near(rigid.stats.socket.share, 0.5833, 1e-3));
    check('transfer: rigid keeps the distance report', near(rigid.stats.meanDistance, 0.1) && near(rigid.stats.worstDistance, 0.1));
  }

  // --- padding triangles on the body are ignored ---
  {
    const quad = makeQuad();
    const padded = { position: quad.position, index: new Uint32Array([...quad.index, 0, 0, 0, 3, 3, 3]) };
    const a = transferWeights(quad, cornerSkin(), new Float32Array([0.2, -0.4, 0.5]));
    const b = transferWeights(padded, cornerSkin(), new Float32Array([0.2, -0.4, 0.5]));
    check('transfer: degenerate padding triangles change nothing', a.skinIndex.every((v, i) => v === b.skinIndex[i]) && a.skinWeight.every((v, i) => near(v, b.skinWeight[i])));
  }

  // --- a degenerate triangle that would WIN the closest-point search ---
  // The check above cannot fail: its padding faces (0,0,0) and (3,3,3) sit at far corners, so the
  // real surface is nearer anyway and dropping cleanTriangles changes nothing. The defect only
  // shows when a zero-area face is the closest thing to the query point — which is exactly what a
  // merged surface's padding can be. Here a spur vertex at (1.5,1.5,0) carries a bone of its own:
  // stripped, the point takes corner 2's bone from 1.414 away; kept, the zero-area face wins from
  // 0.707 away and the piece is bound to a bone no real triangle ever mentions.
  {
    const position = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0, 1.5, 1.5, 0]);
    const skinIndex = new Uint16Array(20);
    const skinWeight = new Float32Array(20);
    for (let v = 0; v < 4; v++) { skinIndex[v * 4] = v; skinWeight[v * 4] = 1; }
    skinIndex[4 * 4] = 7;
    skinWeight[4 * 4] = 1;
    const skin = { skinIndex, skinWeight };
    const query = new Float32Array([2, 2, 0]);
    const spur = { position, index: new Uint32Array([0, 1, 2, 0, 2, 3, 4, 4, 4]) };
    const out = transferWeights(spur, skin, query);
    check('transfer: a zero-area face nearer than the surface never wins the closest-point search',
      out.skinIndex[0] === 2 && near(out.skinWeight[0], 1) && near(out.stats.worstDistance, Math.SQRT2));
    const honest = transferWeights({ position, index: new Uint32Array([0, 1, 2, 0, 2, 3]) }, skin, query);
    check('transfer: ...so the padded surface answers exactly as the surface without padding',
      out.skinIndex.every((v, i) => v === honest.skinIndex[i]) && out.skinWeight.every((v, i) => near(v, honest.skinWeight[i])));
  }

  // --- maxInfluences trims and renormalises ---
  {
    const quad = makeQuad();
    const out = transferWeights(quad, cornerSkin(), new Float32Array([0.2, -0.4, 0.5]), { maxInfluences: 2 });
    check('transfer: maxInfluences keeps the strongest bones only', out.skinIndex.length === 2 && out.skinIndex[0] === 0 && out.skinIndex[1] === 1 && out.skinWeight.length === 2);
    check('transfer: the trimmed weights still sum to one', near(out.skinWeight[0] + out.skinWeight[1], 1) && near(out.skinWeight[0], 0.4 / 0.7));
    check('transfer: timings are reported', out.stats.bvhMs >= 0 && out.stats.transferMs >= 0);
  }
}
