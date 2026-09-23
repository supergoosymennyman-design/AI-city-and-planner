/** gen-place.spec.js — beside-the-build placement, baked into geometry (src/ai/gen-place.js), Node + three.js. */
import * as THREE from 'three';
import {
  DEFAULT_HEIGHT, placeBeside, placeReplacement, replacementShapes,
  bakeAndPlace, commitGeneratedModel, disposeModel,
} from '../gen-place.js';
import { StudioScene } from '../../scene.js';
import { takeSnapshot, restoreSnapshot } from '../../edit/snapshot.js';

const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

export default function genPlaceTests(check) {
  const build = { min: [-1, 0, -0.5], max: [1, 2, 0.5] };
  const p = placeBeside(build, { min: [-0.5, -1, -0.5], max: [0.5, 1, 0.5] });
  check('gen-place: the model is scaled to the build height', near(p.scale, 1));
  check('gen-place: it stands beside the build, a gap to the right',
    near(p.bottomCentre[0], 1 + 0.3 + 0.5) && near(p.bottomCentre[1], 0) && near(p.bottomCentre[2], 0));
  const q = placeBeside(null, { min: [0, 0, 0], max: [1, 3.4, 1] });
  check('gen-place: with no build it is 1.7 tall at the origin', near(q.scale, DEFAULT_HEIGHT / 3.4) && q.bottomCentre.join() === '0,0,0');
  let threw = false;
  try {
    placeBeside(build, { min: [0, 1, 0], max: [1, 1, 1] });
  } catch (err) {
    threw = /no height/.test(err.message);
  }
  check('gen-place: a flat model throws a clear error', threw);

  const replacement = placeReplacement(
    { min: [4, 2, -5], max: [10, 8, 3] },
    { min: [-2, -1, -4], max: [2, 2, 2] },
  );
  check('gen-place: replacement placement matches height, x/z centre and base',
    near(replacement.scale, 2) && replacement.bottomCentre.join() === '7,2,-1');

  // A nested, scaled, offset mesh — the way importGLBFile hands it over — comes out flat and placed.
  const root = new THREE.Group();
  root.scale.setScalar(3);
  root.position.set(10, 10, 10);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 1));
  mesh.position.set(1, 1, 1);
  root.add(mesh);
  const generated = bakeAndPlace([mesh], build);
  check('gen-place: returns a new detached editable mesh', generated.isMesh && !generated.isSkinnedMesh && generated.parent === null && generated !== mesh);
  check('gen-place: source hierarchy is untouched', mesh.parent === root && root.scale.x === 3);
  check('gen-place: rotation and scale are baked', generated.rotation.x === 0 && generated.scale.x === 1 && generated.scale.y === 1);
  const box = new THREE.Box3().setFromObject(generated);
  check('gen-place: baked height equals the build height', near(box.max.y - box.min.y, 2));
  check('gen-place: it stands on the floor', near(box.min.y, 0));
  check('gen-place: its left edge is a 0.3 gap right of the build', near(box.min.x, 1.3));
  check('gen-place: it is centred on the build front-to-back', near((box.min.z + box.max.z) / 2, 0));
  check('gen-place: generated flag is set', generated.userData.generated === true);
  let threw2 = false;
  try {
    bakeAndPlace([], build);
  } catch (err) {
    threw2 = /no meshes/.test(err.message);
  }
  check('gen-place: no meshes throws', threw2);

  // Mesh-under-mesh, shared geometry and nonuniform transforms: compare EVERY output vertex.
  const child = new THREE.Mesh(mesh.geometry);
  child.position.set(4, 2, -1); child.rotation.z = 0.4;
  mesh.scale.set(1, 2, 0.5); mesh.add(child);
  root.updateMatrixWorld(true);
  const originals = [mesh, child].map((m) => ({ parent: m.parent, matrix: m.matrix.toArray(), positions: Array.from(m.geometry.attributes.position.array) }));
  const points = [mesh, child].flatMap((m) => {
    const g = m.geometry;
    return Array.from({ length: g.index.count }, (_, i) =>
      new THREE.Vector3().fromBufferAttribute(g.attributes.position, g.index.getX(i)).applyMatrix4(m.matrixWorld));
  });
  const sourceBox = new THREE.Box3().setFromPoints(points);
  const placement = placeBeside(build, { min: sourceBox.min.toArray(), max: sourceBox.max.toArray() });
  const centre = sourceBox.getCenter(new THREE.Vector3()); centre.y = sourceBox.min.y;
  const combined = bakeAndPlace([mesh, child], build);
  const output = combined.geometry.attributes.position;
  check('gen-place: all submeshes become ONE geometry with all triangles', output.count === points.length && combined.children.length === 0);
  check('gen-place: nesting preserves every world-space triangle', points.every((v, i) => {
    const expected = v.clone().sub(centre).multiplyScalar(placement.scale).add(new THREE.Vector3(...placement.bottomCentre));
    return expected.distanceTo(new THREE.Vector3().fromBufferAttribute(output, i).add(combined.position)) < 1e-5;
  }));
  check('gen-place: shared source geometry and transforms remain unchanged', [mesh, child].every((m, i) =>
    m.parent === originals[i].parent && m.matrix.toArray().every((v, j) => v === originals[i].matrix[j]) &&
    Array.from(m.geometry.attributes.position.array).every((v, j) => v === originals[i].positions[j])));

  const studio = new StudioScene();
  const block = studio.addPrimitive('box');
  const before = JSON.stringify(takeSnapshot(studio).objects);
  const undoBefore = studio.undoStack.length;
  combined.name = 'test model';
  commitGeneratedModel(studio, combined);
  check('gen-place: one insertion and one undo entry', studio.shapes.length === 2 && studio.undoStack.length === undoBefore + 1);
  check('gen-place: source blocks are unchanged', JSON.stringify(takeSnapshot(studio).objects.filter((o) => o.id === block.userData.id)) === before);
  let twice = false;
  try { commitGeneratedModel(studio, combined); } catch { twice = true; }
  check('gen-place: committing a prepared model twice is refused without another undo', twice && studio.undoStack.length === undoBefore + 1);
  const placedBounds = new THREE.Box3().setFromObject(combined);
  studio.undo();
  check('gen-place: one undo removes only the generated model', studio.shapes.length === 1 && !studio.shapes.some((m) => m.userData.generated));
  studio.redo();
  restoreSnapshot(studio, takeSnapshot(studio));
  const restored = studio.shapes.filter((m) => m.userData.generated);
  check('gen-place: redo/reload retain ONE generated mesh and its placement', restored.length === 1 &&
    new THREE.Box3().setFromObject(restored[0]).min.distanceTo(placedBounds.min) < 1e-5 &&
    new THREE.Box3().setFromObject(restored[0]).max.distanceTo(placedBounds.max) < 1e-5);

  // The photographed scope, not today's selection, is the replacement authority. Resolve by the
  // captured ids so a live rig swap can replace a Mesh object without losing the child's scope.
  {
    const replacing = new StudioScene();
    const left = replacing.addPrimitive('box');
    left.position.set(-3, 2, 4); left.scale.set(2, 3, 1);
    const right = replacing.addPrimitive('sphere');
    right.position.set(5, 1, -2); right.scale.setScalar(2);
    const bystander = replacing.addPrimitive('cone');
    bystander.position.set(20, 0.5, 0);
    replacing.select(bystander); // the child clicked elsewhere after the snapshot
    replacing.group.updateMatrixWorld(true);
    const captured = [left, right];
    const expected = new THREE.Box3().setFromObject(left).union(new THREE.Box3().setFromObject(right));
    const model = bakeAndPlace([new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1))], null);
    const undoCount = replacing.undoStack.length;
    const result = commitGeneratedModel(replacing, model, { replace: captured });
    const landed = new THREE.Box3().setFromObject(model);
    check('gen-place: commit replaces the photographed shapes, never the live selection',
      result.replaced === 2 && replacing.shapes.includes(model) && !replacing.shapes.includes(left) &&
      !replacing.shapes.includes(right) && replacing.shapes.includes(bystander));
    check('gen-place: replacement lands on the photographed bounds',
      near((landed.min.x + landed.max.x) / 2, (expected.min.x + expected.max.x) / 2) &&
      near((landed.min.z + landed.max.z) / 2, (expected.min.z + expected.max.z) / 2) &&
      near(landed.min.y, expected.min.y) && near(landed.max.y - landed.min.y, expected.max.y - expected.min.y));
    check('gen-place: remove plus insert is one undo unit', replacing.undoStack.length === undoCount + 1);
    replacing.undo();
    check('gen-place: one undo restores both photographed shapes and removes the model',
      replacing.shapes.length === 3 && replacing.shapes.some((m) => m.userData.id === left.userData.id) &&
      replacing.shapes.some((m) => m.userData.id === right.userData.id) &&
      !replacing.shapes.some((m) => m.userData.generated));
  }

  // A captured object may be detached or replaced while the queued generation runs. Deleted ids
  // are dropped, but a surviving id resolves to the current live Mesh; zero survivors means Add.
  {
    const guarded = new StudioScene();
    const gone = guarded.addPrimitive('box');
    const survivor = guarded.addPrimitive('sphere');
    const survivorId = survivor.userData.id;
    guarded.remove(gone);
    const swapped = new THREE.Mesh(survivor.geometry, survivor.material);
    swapped.userData = { ...survivor.userData };
    guarded.swapShape(survivor, swapped);
    check('gen-place: captured scope filters deletions and resolves a swapped live shape by id',
      replacementShapes(guarded, [gone, survivor]).length === 1 &&
      replacementShapes(guarded, [gone, survivor])[0] === swapped && swapped.userData.id === survivorId);
    swapped.removeFromParent();
    const fallback = bakeAndPlace([new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1))], null);
    const outcome = commitGeneratedModel(guarded, fallback, { replace: [gone, survivor] });
    const fallbackBox = new THREE.Box3().setFromObject(fallback);
    check('gen-place: no surviving photographed shapes falls back to beside placement',
      outcome.replaced === 0 && outcome.fallback === true && guarded.shapes.includes(fallback) &&
      near(fallbackBox.min.y, 0));
  }

  // Texture (owner ruling 09-20): a painted source must keep its material and UVs, or the coloured
  // mesh the Space took minutes to make arrives as flat clay.
  {
    const texture = new THREE.Texture();
    const painted = new THREE.MeshStandardMaterial({ map: texture });
    const src = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), painted);
    const out = bakeAndPlace([src], build);
    check('gen-place: a painted source keeps its own material', out.material === painted);
    check('gen-place: ...and its UVs, one per output vertex',
      !!out.geometry.attributes.uv && out.geometry.attributes.uv.count === out.geometry.attributes.position.count);
    check('gen-place: an unpainted source still comes out as one clay mesh',
      bakeAndPlace([new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1))], build).material.color.getHex() === 0xf1e3cf);

    // The parsed scene is disposed right after baking; whatever the model kept must survive that.
    let materialDisposed = 0, textureDisposed = 0;
    painted.dispose = () => { materialDisposed++; };
    texture.dispose = () => { textureDisposed++; };
    const scene = new THREE.Group();
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(), painted));
    disposeModel(scene, out.material);
    check('gen-place: disposing the parsed scene spares the kept material and its texture',
      materialDisposed === 0 && textureDisposed === 0);
    const other = new THREE.MeshStandardMaterial();
    let otherDisposed = 0;
    other.dispose = () => { otherDisposed++; };
    const scene2 = new THREE.Group();
    scene2.add(new THREE.Mesh(new THREE.BoxGeometry(), other));
    disposeModel(scene2, out.material);
    check('gen-place: ...but still disposes everything the model did not keep', otherDisposed === 1);
  }

  for (const bad of [new THREE.BufferGeometry(), (() => {
    const g = new THREE.BoxGeometry(); g.attributes.position.setX(0, NaN); return g;
  })(), (() => {
    const g = new THREE.BoxGeometry(); g.index.setX(0, 999999); return g;
  })()]) {
    const count = studio.shapes.length, undoCount = studio.undoStack.length;
    let rejected = false;
    try { bakeAndPlace([new THREE.Mesh(bad)], build); } catch { rejected = true; }
    check('gen-place: invalid/empty output never changes the document or undo stack', rejected && studio.shapes.length === count && studio.undoStack.length === undoCount);
  }
}
