/**
 * gen-place.js — where a generated model goes (design doc §3, step 6). A model made from captured
 * blocks replaces those exact blocks; a words-only model (or a capture whose blocks were all
 * deleted while generation ran) goes beside the live build. Either commit is one Undo unit.
 *
 * All source submeshes become ONE editable static mesh; no rig is created or adopted.
 * Geometry is prepared before document mutation. All world matrices are captured before baking,
 * including mesh-under-mesh hierarchies; shared source geometry is never modified.
 */
import * as THREE from 'three';

/** Height used when there is no build to match (the studio's rigs are ~1.7 tall). */
export const DEFAULT_HEIGHT = 1.7;
export const GEN_CLAY = 0xf1e3cf;

function validBounds(bounds) {
  return !!bounds && ['min', 'max'].every((k) =>
    Array.isArray(bounds[k]) && bounds[k].length === 3 && bounds[k].every(Number.isFinite)) &&
    !bounds.min.some((v, i) => v > bounds.max[i]);
}

/**
 * @param {{min:number[], max:number[]}|null} build the build's bounding box, or null
 * @param {{min:number[], max:number[]}} model the model's bounding box as it came in
 * @param {number} [gap] space between the build's right side and the model
 * @returns {{scale:number, bottomCentre:number[]}}
 */
export function placeBeside(build, model, gap = 0.3) {
  for (const bounds of [model, ...(build ? [build] : [])]) {
    if (!validBounds(bounds)) throw new Error('placeBeside: invalid bounds');
  }
  if (!Number.isFinite(gap) || gap < 0) throw new Error('placeBeside: invalid gap');
  const modelHeight = model.max[1] - model.min[1];
  if (!(modelHeight > 0)) throw new Error('placeBeside: the model has no height');
  const buildHeight = build ? build.max[1] - build.min[1] : 0;
  const scale = (buildHeight > 0 ? buildHeight : DEFAULT_HEIGHT) / modelHeight;
  if (!build) return { scale, bottomCentre: [0, 0, 0] };
  const halfWidth = ((model.max[0] - model.min[0]) * scale) / 2;
  return {
    scale,
    bottomCentre: [build.max[0] + gap + halfWidth, 0, (build.min[2] + build.max[2]) / 2],
  };
}

/**
 * Place a model on the volume occupied by the photographed shapes. Both boxes are world-space.
 * The generated surface keeps the captured build's height as well as its x/z centre and base.
 * Pure: no Object3D is read or changed here.
 * @param {{min:number[], max:number[]}} replaced photographed shapes' combined bounds
 * @param {{min:number[], max:number[]}} model generated model bounds before this placement
 * @returns {{scale:number, bottomCentre:number[]}}
 */
export function placeReplacement(replaced, model) {
  if (!validBounds(replaced) || !validBounds(model)) throw new Error('placeReplacement: invalid bounds');
  const modelHeight = model.max[1] - model.min[1];
  const replacedHeight = replaced.max[1] - replaced.min[1];
  if (!(modelHeight > 0)) throw new Error('placeReplacement: the model has no height');
  if (!(replacedHeight > 0)) throw new Error('placeReplacement: the photographed shapes have no height');
  return {
    scale: replacedHeight / modelHeight,
    bottomCentre: [
      (replaced.min[0] + replaced.max[0]) / 2,
      replaced.min[1],
      (replaced.min[2] + replaced.max[2]) / 2,
    ],
  };
}

/** Resolve captured shape ids against the live document, dropping anything deleted meanwhile. */
export function replacementShapes(studio, captured) {
  if (!Array.isArray(captured) || !Array.isArray(studio?.shapes)) return [];
  const ids = new Set(captured.map((shape) => shape?.userData?.id).filter((id) => id != null));
  return studio.shapes.filter((shape) => ids.has(shape?.userData?.id));
}

function boundsOf(shapes) {
  if (!shapes.length) return null;
  const box = new THREE.Box3();
  for (const shape of shapes) box.union(new THREE.Box3().setFromObject(shape));
  if (box.isEmpty()) return null;
  return { min: box.min.toArray(), max: box.max.toArray() };
}

/** Apply a pure placement answer to a detached mesh without assuming its current origin. */
function applyPlacement(mesh, placement) {
  const before = new THREE.Box3().setFromObject(mesh);
  if (before.isEmpty()) throw new Error('model is not ready for placement');
  mesh.scale.multiplyScalar(placement.scale);
  mesh.updateWorldMatrix(true, false);
  const after = new THREE.Box3().setFromObject(mesh);
  mesh.position.x += placement.bottomCentre[0] - (after.min.x + after.max.x) / 2;
  mesh.position.y += placement.bottomCentre[1] - after.min.y;
  mesh.position.z += placement.bottomCentre[2] - (after.min.z + after.max.z) / 2;
  mesh.updateWorldMatrix(true, false);
}

/**
 * Validate and copy all triangles into ONE mesh, then place it beside the build.
 *
 * Everything that makes the surface LOOK like what the Space produced travels with the triangles:
 * UVs (nothing to sample without them), the source normals (a recompute over a triangle soup
 * facets every smooth curve), vertex colours, and every painted region's own material with a
 * geometry group pointing at it. Only a source with no appearance at all falls back to studio clay.
 *
 * Capturing every matrix first and never detaching sources avoids hierarchy-order dependence.
 * @param {THREE.Mesh[]} meshes
 * @param {{min:number[], max:number[]}|null} build
 * @returns {THREE.Mesh} one detached model, owned by the caller
 */
export function bakeAndPlace(meshes, build, gap = 0.3) {
  if (!meshes || !meshes.length) throw new Error('bakeAndPlace: no meshes');
  // One RUN per drawn range, not per mesh: a source with two painted regions is two geometry
  // groups sharing one position buffer, and taking material[0] threw the second region away.
  const runs = [];
  for (const mesh of meshes) {
    if (!mesh.isMesh || mesh.isSkinnedMesh || mesh.isInstancedMesh) throw new Error('bakeAndPlace: expected static meshes');
    mesh.updateWorldMatrix(true, false);
    const matrix = mesh.matrixWorld.clone(), g = mesh.geometry, p = g?.attributes.position;
    const elements = g?.index ? g.index.count : p?.count;
    if (!p || p.itemSize !== 3 || !elements || elements % 3 || !matrix.elements.every(Number.isFinite)) throw new Error('bakeAndPlace: invalid triangles');
    for (let i = 0; i < p.count; i++) {
      if (![p.getX(i), p.getY(i), p.getZ(i)].every(Number.isFinite)) throw new Error('bakeAndPlace: nonfinite vertex');
    }
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const groups = g.groups?.length ? g.groups : [{ start: 0, count: elements, materialIndex: 0 }];
    const shared = {
      g, p, matrix, uv: g.attributes.uv, normal: g.attributes.normal, color: g.attributes.color,
      // Inverse-transpose, so normals stay perpendicular under nonuniform scale; for a mirrored
      // source it also flips them, matching the winding reversal below.
      normalMatrix: new THREE.Matrix3().getNormalMatrix(matrix),
      mirrored: matrix.determinant() < 0,
    };
    for (const grp of groups) {
      const start = Math.max(0, grp.start | 0);
      // A group may be open-ended (three.js allows count: Infinity), so clamp before trusting it.
      const count = Math.min(Number.isFinite(grp.count) ? grp.count : elements, elements - start);
      if (count <= 0) continue;
      if (count % 3) throw new Error('bakeAndPlace: invalid triangles');
      runs.push({ ...shared, start, count, material: mats[grp.materialIndex || 0] || mats[0] || null });
    }
  }
  if (!runs.length) throw new Error('bakeAndPlace: invalid triangles');
  const total = runs.reduce((n, r) => n + r.count, 0);
  const positions = new Float32Array(total * 3);
  // A textured mesh is useless without its UVs, so they are carried through the bake. Sources with
  // none contribute (0,0), which only matters for the clay path where no map samples them.
  const uvs = new Float32Array(total * 2);
  // Source normals are kept only when EVERY run has them — a half-filled normal buffer renders
  // black, and a uniform recompute is the honest fallback. Vertex colours default to white, which
  // is the no-op value for a material that multiplies them in.
  const keepNormals = runs.every((r) => r.normal);
  const normals = keepNormals ? new Float32Array(total * 3) : null;
  const colors = runs.some((r) => r.color) ? new Float32Array(total * 3).fill(1) : null;
  let offset = 0, uvOffset = 0, groupStart = 0;
  const v = new THREE.Vector3(), n = new THREE.Vector3(), box = new THREE.Box3();
  for (const run of runs) {
    const { g, p, uv, normal, color, count, start, matrix, normalMatrix, mirrored } = run;
    run.out = groupStart;
    groupStart += count;
    for (let i = 0; i < count; i++) {
      // Reflection reverses triangle winding; preserve outward-facing normals.
      const row = start + (mirrored ? i - i % 3 + [0, 2, 1][i % 3] : i);
      const index = g.index ? g.index.getX(row) : row;
      if (!Number.isInteger(index) || index < 0 || index >= p.count) throw new Error('bakeAndPlace: invalid index');
      v.fromBufferAttribute(p, index).applyMatrix4(matrix);
      if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z)) throw new Error('bakeAndPlace: invalid transform');
      v.toArray(positions, offset);
      if (normals) {
        n.fromBufferAttribute(normal, index).applyMatrix3(normalMatrix);
        if (n.lengthSq() > 0) n.normalize();
        n.toArray(normals, offset);
      }
      if (colors && color) {
        colors[offset] = color.getX(index);
        colors[offset + 1] = color.getY(index);
        colors[offset + 2] = color.getZ(index);
      }
      offset += 3; box.expandByPoint(v);
      uvs[uvOffset++] = uv ? uv.getX(index) : 0;
      uvs[uvOffset++] = uv ? uv.getY(index) : 0;
    }
  }
  const placed = placeBeside(build, { min: box.min.toArray(), max: box.max.toArray() }, gap);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  if (normals) geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  if (colors) geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  geometry.scale(placed.scale, placed.scale, placed.scale);
  if (!geometry.attributes.position.array.every(Number.isFinite)) { geometry.dispose(); throw new Error('bakeAndPlace: invalid placed geometry'); }
  if (!normals) geometry.computeVertexNormals();
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  // A painted source keeps ITS material (that is the whole point of asking the Space to texture);
  // an unpainted one gets the studio's clay, exactly as before. The caller owns whatever is adopted,
  // so it must pass it to disposeModel's `keep` when it frees the parsed scene.
  const painted = runs.some((r) => r.material && (r.material.map || r.material.vertexColors));
  let material;
  if (painted) {
    const unique = [...new Set(runs.map((r) => r.material).filter(Boolean))];
    material = unique.length === 1 ? unique[0] : unique;
    if (unique.length > 1) {
      for (const r of runs) geometry.addGroup(r.out, r.count, Math.max(0, unique.indexOf(r.material)));
    }
  } else {
    material = new THREE.MeshStandardMaterial({ color: GEN_CLAY, roughness: 0.6, metalness: 0.1, side: THREE.DoubleSide });
  }
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.fromArray(placed.bottomCentre);
  Object.assign(mesh.userData, { generated: true, geoCustom: true, kind: 'custom' });
  return mesh;
}

const committed = new WeakSet();
/**
 * Insert a fully prepared model exactly once; no await or parsing inside this boundary.
 * When `replace` is present it is the capture-time scope, never the live selection.
 * @returns {{replaced:number, fallback:boolean}}
 */
export function commitGeneratedModel(studio, mesh, { replace } = {}) {
  if (!mesh?.isMesh || !mesh.userData.generated || mesh.parent || committed.has(mesh)) throw new Error('model is not ready for insertion');
  const replacing = Array.isArray(replace);
  const survivors = replacing ? replacementShapes(studio, replace) : [];
  if (replacing) {
    const modelBox = new THREE.Box3().setFromObject(mesh);
    const modelBounds = { min: modelBox.min.toArray(), max: modelBox.max.toArray() };
    const targetBounds = boundsOf(survivors);
    // A queued capture can outlive every photographed block. That is still a useful model, so put
    // it beside whatever exists now instead of silently replacing nothing or discarding the result.
    const placement = targetBounds
      ? placeReplacement(targetBounds, modelBounds)
      : placeBeside(boundsOf(studio.shapes), modelBounds);
    applyPlacement(mesh, placement);
  }
  studio.pushUndo();
  committed.add(mesh);
  for (const shape of survivors) studio.remove(shape);
  studio.addImported(mesh);
  studio.select(mesh);
  return { replaced: survivors.length, fallback: replacing && survivors.length === 0 };
}

/**
 * Dispose resources owned by an isolated parsed/generated model, including shared resources once.
 * @param {THREE.Object3D} root the scene to free
 * @param {THREE.Material|THREE.Material[]} [keep] material(s) the caller adopted (see bakeAndPlace).
 *   These, and their textures, are spared — freeing them would blank the model that just kept them.
 */
export function disposeModel(root, keep) {
  const kept = new Set([keep].flat().filter(Boolean));
  const keptTextures = new Set();
  for (const m of kept) for (const value of Object.values(m)) if (value?.isTexture) keptTextures.add(value);
  const geometries = new Set(), materials = new Set(), textures = new Set();
  root?.traverse((o) => {
    if (o.geometry) geometries.add(o.geometry);
    for (const m of (Array.isArray(o.material) ? o.material : [o.material]).filter(Boolean)) {
      if (!kept.has(m)) materials.add(m);
      for (const value of Object.values(m)) if (value?.isTexture) textures.add(value);
    }
  });
  for (const t of textures) if (!keptTextures.has(t)) t.dispose();
  for (const m of materials) if (!kept.has(m)) m.dispose();
  for (const g of geometries) g.dispose();
}
