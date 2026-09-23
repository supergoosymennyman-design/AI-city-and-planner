// src/rig/tests/bind.spec.js
// The binding pipeline (task 014, spec §3): the merge of the model's parts, the coarse solve, the
// transfer back to the fine mesh, and the re-pointing of an old skin at a changed bone list.
import { mergeParts, splitSkin, remapSkinIndex, bindMesh } from '../bind.js';
import { computeHeatWeights } from '../heat-weights.js';
import { makeBox, makeTube, translate } from './fixtures.js';

const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(String(e.message)); } };
const near = (a, b, tol = 1e-4) => Math.abs(a - b) < tol;

function weightOf(out, i, bone) {
  for (let k = 0; k < 4; k++) if (out.skinWeight[i * 4 + k] > 0 && out.skinIndex[i * 4 + k] === bone) return out.skinWeight[i * 4 + k];
  return 0;
}

export default function (check) {
  // --- mergeParts: two boxes become one soup with ranges ---
  {
    const a = makeBox([-1, -1, -1], [1, 1, 1]);
    const b = translate(a, 3, 0, 0);
    const m = mergeParts([a, b]);
    check('bind: mergeParts concatenates the points', m.position.length === 48 && m.position[0] === -1 && m.position[24] === 2);
    check('bind: mergeParts offsets the second part\'s triangles', m.index.length === 72 && m.index[0] === a.index[0] && m.index[36] === b.index[0] + 8);
    check('bind: mergeParts records each part\'s range', m.ranges.length === 2 && m.ranges[0].start === 0 && m.ranges[0].count === 8 && m.ranges[1].start === 8 && m.ranges[1].count === 8);
    check('bind: mergeParts refuses a part without an index, and no parts', throws(() => mergeParts([{ position: a.position }]), /index/) && throws(() => mergeParts([]), /at least one/));
  }

  // --- splitSkin: back to one slice per part ---
  {
    const skin = { skinIndex: Uint16Array.from({ length: 64 }, (_, i) => i), skinWeight: Float32Array.from({ length: 64 }, (_, i) => i / 64) };
    const parts = splitSkin(skin, [{ start: 0, count: 8 }, { start: 8, count: 8 }]);
    check('bind: splitSkin hands each part its own slice', parts.length === 2 && parts[0].skinIndex.length === 32 && parts[1].skinIndex[0] === 32 && near(parts[1].skinWeight[0], 32 / 64));
    parts[0].skinIndex[0] = 99;
    check('bind: the slices are copies, not views', skin.skinIndex[0] === 0);
    // The line above only ever wrote to skinIndex, and only to the part starting at 0 — so a
    // slice() that turned into a subarray() on skinWeight (or on any part after the first) left
    // every part aliasing the merged buffer with the suite still green. Posing one part would
    // then silently rewrite its neighbours' weights.
    parts[0].skinWeight[0] = 9;
    parts[1].skinIndex[0] = 98;
    parts[1].skinWeight[0] = 8;
    check('bind: every slice is a copy — skinWeight too, and the parts after the first',
      skin.skinIndex[0] === 0 && skin.skinWeight[0] === 0
      && skin.skinIndex[32] === 32 && near(skin.skinWeight[32], 32 / 64));
  }

  // --- remapSkinIndex: a joint was removed, the skin stays usable ---
  {
    const old = [{ name: 'j2', parent: null }, { name: 'j3', parent: 'j2' }, { name: 'j4', parent: 'j3' }];
    const skin = {
      skinIndex: new Uint16Array([2, 0, 0, 0, 1, 2, 0, 0, 0, 0, 0, 0]),
      skinWeight: new Float32Array([1, 0, 0, 0, 0.5, 0.5, 0, 0, 1, 0, 0, 0]),
    };
    const out = remapSkinIndex(skin, old, [{ name: 'j2', parent: null }, { name: 'j3', parent: 'j2' }]);
    check('bind: a removed bone\'s weight climbs to its nearest surviving ancestor', out.skinIndex[0] === 1 && out.skinWeight[0] === 1);
    check('bind: weights that meet on one bone are merged and renormalised', out.skinIndex[4] === 1 && near(out.skinWeight[4], 1) && out.skinWeight[5] === 0);
    check('bind: an untouched vertex keeps its bone', out.skinIndex[8] === 0 && out.skinWeight[8] === 1 && out.moved === 2 && out.lost === 0);
    const gone = remapSkinIndex(skin, old, [{ name: 'j9', parent: null }]);
    check('bind: a vertex whose bones all vanished goes to the first bone rather than collapsing to the origin', gone.lost === 3 && gone.skinIndex[0] === 0 && gone.skinWeight[0] === 1 && gone.skinIndex[8] === 0 && gone.skinWeight[8] === 1);
    const same = remapSkinIndex(skin, old, old);
    check('bind: the same bone list changes nothing', same.moved === 0 && same.lost === 0 && same.skinIndex.every((v, i) => v === skin.skinIndex[i]) && same.skinWeight.every((v, i) => near(v, skin.skinWeight[i])));
  }

  // --- bindMesh on a mesh under the budget: plain heat weights ---
  {
    const tube = makeTube(0.5, 3, 24, 40); // 986 points
    const bones = [{ head: [0, 0, 0], tail: [0, 1.5, 0] }, { head: [0, 1.5, 0], tail: [0, 3, 0] }];
    const direct = computeHeatWeights(tube, bones);
    const out = bindMesh(tube, bones);
    check('bind: a small mesh is solved as it is', out.stats.reduced === false && out.stats.coarsePoints === 986 && out.stats.finePoints === 986 && out.stats.transfer === null);
    check('bind: and its weights are the plain heat weights', out.skinIndex.every((v, i) => v === direct.skinIndex[i]) && out.skinWeight.every((v, i) => near(v, direct.skinWeight[i], 1e-6)));
  }

  // --- bindMesh over the budget: coarse solve, transferred back ---
  {
    const tube = makeTube(0.4, 4, 24, 48);
    const bones = [{ head: [0, 0, 0], tail: [0, 2, 0] }, { head: [0, 2, 0], tail: [0, 4, 0] }];
    const progress = [];
    const out = bindMesh(tube, bones, { target: 300, onProgress: (fraction, stage) => progress.push([fraction, stage]) });
    const n = tube.position.length / 3;
    check('bind: the solve ran on the coarse copy', out.stats.reduced === true && out.stats.coarsePoints <= 300 && out.stats.finePoints === n && out.stats.vertices === out.stats.coarsePoints && out.stats.reduction.coarsePoints === out.stats.coarsePoints);
    let sumErr = 0;
    let bottom = true;
    let top = true;
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += out.skinWeight[i * 4 + k];
      sumErr = Math.max(sumErr, Math.abs(s - 1));
      const y = tube.position[i * 3 + 1];
      const w0 = weightOf(out, i, 0);
      if (y < 0.3) bottom = bottom && w0 > 0.9;
      if (y > 3.7) top = top && w0 < 0.1;
    }
    check('bind: every fine point has weights summing to one', sumErr < 1e-5);
    check('bind: bone 0 owns the bottom of the fine mesh, bone 1 the top', bottom && top);
    check('bind: the transfer and the timings are reported', !!out.stats.transfer && out.stats.transfer.gearPoints === n && out.stats.transfer.worstDistance < out.stats.reduction.cellSize * 2 && out.stats.reduceMs >= 0 && out.stats.heatMs >= 0 && out.stats.transferMs >= 0 && out.stats.totalMs >= 0);
    const fractions = progress.map((p) => p[0]);
    const stages = progress.map((p) => p[1]);
    check('bind: progress climbs from 0 to 1 through the stages', fractions[0] === 0 && fractions[fractions.length - 1] === 1 && fractions.every((f, i) => i === 0 || f >= fractions[i - 1]) && stages[0] === 'reduce' && stages.includes('solve') && stages.includes('transfer') && stages[stages.length - 1] === 'done');
    check('bind: no bones is refused loudly', throws(() => bindMesh(tube, []), /bone/));
  }
}
