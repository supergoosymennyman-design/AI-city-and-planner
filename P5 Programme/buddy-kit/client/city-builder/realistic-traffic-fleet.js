// Instanced renderer for normalized commercial vehicle GLBs. It never clones
// scene graphs per moving car: every GLTF primitive/material group gets one
// bounded InstancedMesh for the whole variant. A failed GLB simply contributes
// no renderer, leaving that model's assigned traffic slots invisible.
import * as THREE from 'three';
import { createGLTFLoader } from '../shared/gltf.js';
import { libraryUrl } from '../city-common/library.js';
import { vehicleTargetLength } from '../city-common/vehicle-scale.js';

function load(item) {
  return new Promise((resolve, reject) => createGLTFLoader().load(
    libraryUrl(item),
    (gltf) => resolve(gltf.scene || gltf.scenes?.[0] || null),
    undefined,
    reject,
  ));
}

function geometryForMaterialGroup(geometry, sourceGroup) {
  if (!sourceGroup) return geometry.clone();
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const start = sourceGroup.start;
  const count = sourceGroup.count;
  if (!Number.isInteger(start) || !Number.isInteger(count) || count <= 0 || start + count > source.attributes.position.count) return null;
  const primitive = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) {
    // GLTF vertex attributes (including UVs, colours, tangents, and skin data)
    // have one item per vertex, so retain the exact range for this primitive.
    // copyAt also handles the interleaved attributes emitted by some GLBs.
    const target = new THREE.BufferAttribute(new attribute.array.constructor(count * attribute.itemSize), attribute.itemSize, attribute.normalized);
    for (let index = 0; index < count; index++) target.copyAt(index, attribute, start + index);
    primitive.setAttribute(name, target);
  }
  return primitive;
}

function primitiveMaterialGroups(node) {
  const materials = Array.isArray(node.material) ? node.material : [node.material];
  if (!materials.length || materials.some((material) => !material?.isMaterial)) return null;
  if (materials.length === 1) return [{ geometry: node.geometry.clone(), material: materials[0] }];
  if (!node.geometry.groups.length) return null;
  const groups = node.geometry.groups.map((sourceGroup) => {
    const material = materials[sourceGroup.materialIndex];
    const geometry = material?.isMaterial ? geometryForMaterialGroup(node.geometry, sourceGroup) : null;
    return geometry ? { geometry, material } : null;
  });
  return groups.every(Boolean) ? groups : null;
}

export function rendererFromScene(group, item, scene, capacity) {
  scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(scene);
  const size = bounds.getSize(new THREE.Vector3());
  // Accepted intake assets are normalized Y-up and length-along-Z. Reject an
  // accidental upright/sideways conversion rather than putting it on a road.
  if (!(size.z > 0 && size.z >= size.x && size.z >= size.y)) return null;
  const scale = vehicleTargetLength(item) / size.z;
  const centreX = (bounds.min.x + bounds.max.x) / 2;
  const centreZ = (bounds.min.z + bounds.max.z) / 2;
  const sources = [];
  let meshIndex = 0;
  let valid = true;
  scene.traverse((node) => {
    if (!valid || !node.isMesh || !node.geometry) return;
    const primitiveGroups = primitiveMaterialGroups(node);
    if (!primitiveGroups) { valid = false; return; }
    for (let groupIndex = 0; groupIndex < primitiveGroups.length; groupIndex++) {
      const source = primitiveGroups[groupIndex];
      source.geometry.applyMatrix4(node.matrixWorld);
      source.geometry.scale(scale, scale, scale);
      source.geometry.translate(-centreX * scale, -bounds.min.y * scale, -centreZ * scale);
      const semantic = source.material?.name === 'traffic-paint' ? 'paint' : source.material?.name || 'primitive';
      sources.push({ ...source, key: `${semantic}_${meshIndex}_${groupIndex}` });
    }
    meshIndex++;
  });
  // A partially batched model is more damaging than the low-poly fallback:
  // missing primitives remove windows, wheels, or textured body panels.
  if (!valid || !sources.length) return null;
  const batches = {};
  for (const { geometry, material, key } of sources) {
    // The derived Audi LODs expose semantic material names. Enable per-instance
    // colour only for paint so traffic can alternate red/black without adding
    // another material batch or duplicating the mesh.
    const batchMaterial = material?.name === 'traffic-paint' ? material.clone() : material;
    if (batchMaterial?.name === 'traffic-paint') {
      batchMaterial.vertexColors = true;
      batchMaterial.needsUpdate = true;
    }
    const inst = new THREE.InstancedMesh(geometry, batchMaterial, capacity);
    inst.name = `traffic-realistic-${item.id}-${key}`;
    inst.count = 0;
    inst.frustumCulled = false;
    inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(inst);
    batches[key] = inst;
  }
  return { kind: `realistic-${item.id}`, modelId: item.id, capacity, batches };
}

export async function preloadRealisticTrafficFleet(group, items, capacity, { onSettle = () => {}, isActive = () => true } = {}) {
  const settle = async (item) => {
    try {
      const scene = await load(item);
      const renderer = scene ? rendererFromScene(group, item, scene, capacity) : null;
      const result = { item, renderer, reason: renderer ? null : 'invalid-material-batches' };
      if (!isActive() && renderer) {
        for (const inst of Object.values(renderer.batches)) { inst.removeFromParent(); inst.dispose(); }
        result.renderer = null; result.reason = 'stale-generation';
      }
      onSettle(result);
      return result;
    } catch (error) {
      const result = { item, renderer: null, reason: 'load-failed', error };
      onSettle(result);
      return result;
    }
  };
  return Promise.all(items.map(settle));
}
