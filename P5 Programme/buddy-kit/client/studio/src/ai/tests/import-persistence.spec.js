/** Import regressions exercised without a browser, file loader or network. */
import * as THREE from 'three';
import { StudioScene } from '../../scene.js';
import { takeSnapshot, restoreSnapshot } from '../../edit/snapshot.js';

function vertices(mesh) {
  mesh.updateWorldMatrix(true, false);
  return Array.from({ length: mesh.geometry.attributes.position.count }, (_, i) =>
    new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, i).applyMatrix4(mesh.matrixWorld));
}

const sameVertices = (mesh, expected) => !!mesh && vertices(mesh).every((v, i) => v.distanceTo(expected[i]) < 1e-5);

/** Prove snapshots preserve nested transforms and duplicated imported geometry. */
export default function importPersistenceTests(check) {
  const studio = new StudioScene();
  const root = new THREE.Group();
  root.position.set(2, 1, -3);
  root.scale.set(0.2, 0.3, 0.4);
  root.rotation.y = 0.6;
  const nested = new THREE.Group();
  nested.rotation.z = 0.4; // nonuniform parent scale + child rotation produce shear
  root.add(nested);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  mesh.name = 'nested-import';
  mesh.position.set(1, 2, 3);
  nested.add(mesh);
  studio.addImported(root);
  const expected = vertices(mesh);
  const originalPositions = Array.from(mesh.geometry.attributes.position.array);
  const snapshot = takeSnapshot(studio);
  check('import-persistence: taking a snapshot does not modify live geometry',
    originalPositions.every((v, i) => v === mesh.geometry.attributes.position.array[i]));
  restoreSnapshot(studio, snapshot);
  check('import-persistence: nested import keeps every vertex on reload, including shear',
    sameVertices(studio.shapes.find((m) => m.name === mesh.name), expected));
  studio.pushUndo();
  studio.addPrimitive('sphere');
  studio.undo();
  check('import-persistence: another edit and undo keep the imported model in place',
    sameVertices(studio.shapes.find((m) => m.name === mesh.name), expected));
  studio.redo();
  check('import-persistence: redo keeps the imported model in place',
    sameVertices(studio.shapes.find((m) => m.name === mesh.name), expected));

  const fresh = new StudioScene();
  const direct = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  fresh.addImported(direct);
  const copy = fresh.duplicate(direct);
  const copyVertices = vertices(copy);
  restoreSnapshot(fresh, takeSnapshot(fresh));
  check('import-persistence: duplicated import survives reload with its geometry',
    fresh.shapes.length === 2 && sameVertices(fresh.shapes.find((m) => m.name === copy.name), copyVertices));
}
