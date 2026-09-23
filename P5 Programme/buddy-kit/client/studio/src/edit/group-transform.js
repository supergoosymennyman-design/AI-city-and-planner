import * as THREE from 'three';

const _tmp = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scl = new THREE.Vector3();

/**
 * Transforms a set of meshes together as a rigid group.
 * `delta` is the group's current world matrix times the inverse of its start
 * world matrix; `starts` are each mesh's world matrix captured at drag start.
 * Because delta is applied to each mesh's own matrixWorld, every mesh rotates /
 * scales around the SAME pivot point (the group origin), not around itself.
 */
export function applyGroupDelta(meshes, delta, starts) {
  for (let i = 0; i < meshes.length; i++) {
    _tmp.multiplyMatrices(delta, starts[i]);
    _tmp.decompose(_pos, _quat, _scl);
    meshes[i].position.copy(_pos);
    meshes[i].quaternion.copy(_quat);
    meshes[i].scale.copy(_scl);
  }
}
