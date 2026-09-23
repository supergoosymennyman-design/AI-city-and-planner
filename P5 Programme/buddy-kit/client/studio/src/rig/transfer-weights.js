// src/rig/transfer-weights.js
// Weights from one surface onto the points of another (task 014, spec §3 and §7). Two jobs, one
// piece of code: carrying the coarse copy's answer back up to the full mesh, and giving a placed
// piece of gear the weights of the body under it. For every point, find the closest point on the
// source surface and blend the three corner weights of the triangle it landed on — what Blender's
// Data Transfer and Maya's Copy Skin Weights do. Proven on 2026-09-20: 256,528 helmet points in
// about 3.5 s with a 0.16 s tree build.
//
// `rigid` collapses the whole piece onto the one bone its points agree on most: the socket a
// modeller would have named by hand, worked out from where the child left the piece. Without it a
// helmet's cheek plates follow the jaw and the steel stretches (93,076 points moved in the trial).
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { cleanTriangles, packInfluences, HEAT } from './heat-weights.js';

/**
 * Copy a surface's skin weights onto points resting on it.
 * @param {{position: ArrayLike<number>, index: ArrayLike<number>}} body the skinned surface
 * @param {{skinIndex: ArrayLike<number>, skinWeight: ArrayLike<number>}} skin the body's weights
 * @param {ArrayLike<number>} gearPosition the points to weight, in the body's space
 * @param {{maxInfluences?: number, rigid?: boolean}} [opts] `rigid` collapses the whole piece onto
 *   the one bone its points agree on most. A soft piece (a cape, a saddle) wants the per-point answer.
 * @returns {{skinIndex: Uint16Array, skinWeight: Float32Array, stats: object}}
 */
export function transferWeights(body, skin, gearPosition, opts = {}) {
  const max = opts.maxInfluences || HEAT.MAX_INFLUENCES;
  const t0 = Date.now();
  const index = cleanTriangles(body.index); // the padding triangles must not attract anything
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(
    body.position instanceof Float32Array ? body.position : Float32Array.from(body.position), 3));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  const bvh = new MeshBVH(geometry); // reorders `index` in place; faces are read from that same array
  const buildMs = Date.now() - t0;

  const n = gearPosition.length / 3;
  const perVertex = new Array(n);
  const point = new THREE.Vector3();
  const hit = {};
  let worstDistance = 0;
  let sumDistance = 0;
  const t1 = Date.now();
  for (let i = 0; i < n; i++) {
    point.set(gearPosition[i * 3], gearPosition[i * 3 + 1], gearPosition[i * 3 + 2]);
    bvh.closestPointToPoint(point, hit);
    sumDistance += hit.distance;
    if (hit.distance > worstDistance) worstDistance = hit.distance;
    const f = hit.faceIndex * 3;
    const a = index[f];
    const b = index[f + 1];
    const c = index[f + 2];
    const bary = barycentric(body.position, a, b, c, hit.point);
    const blend = new Map();
    for (let corner = 0; corner < 3; corner++) {
      const share = bary[corner];
      if (share <= 0) continue;
      const v = corner === 0 ? a : corner === 1 ? b : c;
      for (let k = 0; k < 4; k++) {
        const w = skin.skinWeight[v * 4 + k];
        if (!w) continue;
        const bone = skin.skinIndex[v * 4 + k];
        blend.set(bone, (blend.get(bone) || 0) + share * w);
      }
    }
    perVertex[i] = [...blend.entries()];
  }
  let socket = null;
  if (opts.rigid) {
    // One binding for the whole piece: the bone that carries the most weight across it.
    const votes = new Map();
    for (const list of perVertex) for (const [bone, w] of list) votes.set(bone, (votes.get(bone) || 0) + w);
    let best = -1;
    let bestWeight = -1;
    for (const [bone, w] of votes) if (w > bestWeight) { bestWeight = w; best = bone; }
    if (best >= 0) {
      socket = { bone: best, share: +(bestWeight / (n || 1)).toFixed(4) };
      for (let i = 0; i < n; i++) perVertex[i] = [[best, 1]];
    }
  }

  const packed = packInfluences(perVertex, n, max);
  return {
    skinIndex: packed.skinIndex,
    skinWeight: packed.skinWeight,
    stats: {
      gearPoints: n,
      bvhMs: buildMs,
      transferMs: Date.now() - t1,
      meanDistance: +(sumDistance / (n || 1)).toFixed(4),
      worstDistance: +worstDistance.toFixed(4),
      rigid: !!opts.rigid,
      socket,
    },
  };
}

/** Barycentric share of each corner for a point known to lie in triangle a-b-c. */
function barycentric(position, a, b, c, p) {
  const ax = position[a * 3];
  const ay = position[a * 3 + 1];
  const az = position[a * 3 + 2];
  const v0x = position[b * 3] - ax;
  const v0y = position[b * 3 + 1] - ay;
  const v0z = position[b * 3 + 2] - az;
  const v1x = position[c * 3] - ax;
  const v1y = position[c * 3 + 1] - ay;
  const v1z = position[c * 3 + 2] - az;
  const v2x = p.x - ax;
  const v2y = p.y - ay;
  const v2z = p.z - az;
  const d00 = v0x * v0x + v0y * v0y + v0z * v0z;
  const d01 = v0x * v1x + v0y * v1y + v0z * v1z;
  const d11 = v1x * v1x + v1y * v1y + v1z * v1z;
  const d20 = v2x * v0x + v2y * v0y + v2z * v0z;
  const d21 = v2x * v1x + v2y * v1y + v2z * v1z;
  const denom = d00 * d11 - d01 * d01;
  if (!(Math.abs(denom) > 1e-20)) return [1, 0, 0]; // a sliver: take one corner rather than divide
  let v = (d11 * d20 - d01 * d21) / denom;
  let w = (d00 * d21 - d01 * d20) / denom;
  if (v < 0) v = 0;
  if (w < 0) w = 0;
  if (v + w > 1) { const s = v + w; v /= s; w /= s; }
  return [1 - v - w, v, w];
}
