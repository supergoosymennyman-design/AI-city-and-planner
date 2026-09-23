// src/rig/tests/fixtures.js
// Small closed meshes with exact answers, shared by the rig specs. Not a spec file.

/** Closed tube along +Y from y=0 to y=length: `radial` verts per ring, `rings` rings, capped. */
export function makeTube(radius, length, radial = 24, rings = 40) {
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
export function makeBox(min, max) {
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

/** One open quad in the plane z=0, facing +z, spanning [-1,1] on x and y. */
export function makeQuad() {
  return {
    position: new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]),
    index: new Uint32Array([0, 1, 2, 0, 2, 3]),
  };
}

export function mergeMeshes(a, b) {
  const offset = a.position.length / 3;
  const position = new Float32Array(a.position.length + b.position.length);
  position.set(a.position);
  position.set(b.position, a.position.length);
  const index = new Uint32Array(a.index.length + b.index.length);
  index.set(a.index);
  for (let i = 0; i < b.index.length; i++) index[a.index.length + i] = b.index[i] + offset;
  return { position, index };
}

/** A moved copy. */
export function translate(mesh, dx, dy, dz) {
  const position = Float32Array.from(mesh.position);
  for (let i = 0; i < position.length; i += 3) {
    position[i] += dx;
    position[i + 1] += dy;
    position[i + 2] += dz;
  }
  return { position, index: Uint32Array.from(mesh.index) };
}

// ---- studio-level fixtures (Task 7 onward): a model in a scene, a chain up it, a synchronous bind ----
import * as THREE from 'three';
import { mergeParts, bindMesh } from '../bind.js';

/** Put a closed tube into a studio the way an imported model arrives: a custom shape with its own geometry. */
export function addTubeShape(studio, radius = 0.4, length = 2, radial = 24, rings = 40) {
  const tube = makeTube(radius, length, radial, rings);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(tube.position, 3));
  geometry.setIndex(new THREE.BufferAttribute(tube.index, 1));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xd9a06a, side: THREE.DoubleSide }));
  mesh.name = 'tube';
  mesh.userData.kind = 'custom';
  mesh.userData.geoCustom = true;
  studio.addImported(mesh); // gives it an id, flags it imported, adds it to the document, emits 'changed'
  return mesh;
}

/** A closed box centred on its own origin, as a custom shape; the caller places it with `position`. */
export function addBoxShape(studio, half = 0.15) {
  const box = makeBox([-half, -half, -half], [half, half, half]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(box.position, 3));
  geometry.setIndex(new THREE.BufferAttribute(box.index, 1));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x6ab0d9, side: THREE.DoubleSide }));
  mesh.name = 'box';
  mesh.userData.kind = 'custom';
  mesh.userData.geoCustom = true;
  studio.addImported(mesh);
  return mesh;
}

/** Three joints up the tube's axis — a root near the bottom, one in the middle, one near the top —
 * owned by the tube and written in ITS frame (the tube sits at identity, so the numbers are the
 * same either way; going through localOf keeps the fixture honest if a test moves the tube first). */
export function chainUpTube(rig, length = 2) {
  const tube = rig.meshes().find((m) => m.name === 'tube') || rig.meshes()[0];
  if (!tube) throw new Error('chainUpTube needs a shape in the studio — call addTubeShape first');
  const shape = tube.userData.id;
  const a = rig.graph.add(rig.localOf(tube, [0, 0.05, 0]), null, shape);
  const b = rig.graph.add(rig.localOf(tube, [0, length / 2, 0]), a, shape);
  const c = rig.graph.add(rig.localOf(tube, [0, length - 0.05, 0]), b, shape);
  rig.rebuild();
  return [a, b, c];
}

/** Work out and apply the bending synchronously, the way the worker does it for the page — every
 * riggable shape as one body (the fixture scenes have one shape). */
export function bindNow(studio, target = 300) {
  const rig = studio.rig;
  const parts = rig.parts();
  const merged = mergeParts(parts);
  const result = bindMesh({ position: merged.position, index: merged.index }, rig.bonesForHeat(), { target });
  return { meshes: rig.applySkins(result, parts, merged.ranges), result };
}

// ---- non-watertight fixture (final review fix round, F1) ----------------------------------
// Appended, not inserted: makeTube/makeBox/makeQuad and every export above are unchanged.

/** Like makeBox, but missing one face (the -z one) — NOT edge-manifold (isClosed === false), yet
 * still unambiguously has an inside. An AI-generated model is routinely open like this — the
 * studio's own shipped sample (public/samples/dino/model.glb) is — and isInside() must still work
 * on it (final-review.md F1: it used to veto on `!surface.isClosed`). */
export function makeOpenBox(min, max) {
  const box = makeBox(min, max);
  return { position: box.position, index: box.index.slice(6) }; // drop the first face's 2 triangles (-z, see makeBox)
}

/** A box like addBoxShape, but built from makeOpenBox — the non-watertight case, in a studio. */
export function addOpenBoxShape(studio, half = 0.15) {
  const box = makeOpenBox([-half, -half, -half], [half, half, half]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(box.position, 3));
  geometry.setIndex(new THREE.BufferAttribute(box.index, 1));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xd9986a, side: THREE.DoubleSide }));
  mesh.name = 'openbox';
  mesh.userData.kind = 'custom';
  mesh.userData.geoCustom = true;
  studio.addImported(mesh);
  return mesh;
}
