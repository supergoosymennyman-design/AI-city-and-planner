import * as THREE from 'three';

/** Commit a static catalogue model in Studio units; one Add is one Undo unit. */
export function insertShopModel(studio, object, model, point) {
  if (!object?.isObject3D) throw new Error('The model could not be opened.');
  const meshes = [];
  object.traverse((node) => {
    if (node.isSkinnedMesh || node.isBone) throw new Error('Shop models must be static meshes. Import rigged models through Import GLB.');
    if (node.isMesh) meshes.push(node);
  });
  if (!meshes.length) throw new Error('This model has no shapes.');
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty() || ![...box.min.toArray(), ...box.max.toArray()].every(Number.isFinite)) {
    throw new Error('This model has invalid dimensions.');
  }
  const target = point?.isVector3 ? point.toArray() : point;
  if (target && (!Array.isArray(target) || target.length !== 3 || !target.every(Number.isFinite))) {
    throw new Error('The placement point is invalid.');
  }
  const build = studio.shapes.length ? new THREE.Box3().setFromObject(studio.group) : null;
  const at = target || (build && !build.isEmpty()
    ? [build.max.x + 0.3 + (box.max.x - box.min.x) / 2, 0, (build.min.z + build.max.z) / 2]
    : [0, 0, 0]);
  object.position.x += at[0] - (box.min.x + box.max.x) / 2;
  object.position.y += at[1] - box.min.y;
  object.position.z += at[2] - (box.min.z + box.max.z) / 2;
  meshes.forEach((mesh, index) => { mesh.name = meshes.length === 1 ? model.name : `${model.name} ${index + 1}`; });
  // Imported geometry/materials already round-trip in the Studio snapshot. No shop tags,
  // second placement ledger or adoption of the retired template-rig API is necessary.
  studio.pushUndo();
  studio.addImported(object);
  studio.select(meshes[0]);
  return object;
}
