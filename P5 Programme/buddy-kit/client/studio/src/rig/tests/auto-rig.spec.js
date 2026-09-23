import * as THREE from 'three';
import { StudioScene } from '../../scene.js';
import { autoRigTargets, prepareAutoRig, assertAutoRigCurrent, parseAutoRig, applyAutoRig } from '../auto-rig-model.js';
import { riggableMeshes } from '../bones.js';
import { SkeletonGraph } from '../skeleton-graph.js';
import { takeSnapshot, restoreSnapshot } from '../../edit/snapshot.js';
import { buildGLB } from '../../io/gltf.js';
import { bindNow } from './fixtures.js';

const throws = (fn, pattern) => { try { fn(); return false; } catch (e) { return pattern.test(e.message); } };
async function resultFor(capture) {
  const result = await parseAutoRig(capture.bytes);
  const root = new THREE.Bone(), tip = new THREE.Bone();
  tip.position.y = 0.6; root.add(tip); result.add(root);
  return result;
}
async function run(check) {
  const s = new StudioScene();
  check('auto-rig: an empty document asks for a model', throws(() => autoRigTargets(s), /Build or import/));
  const chosen = s.addPrimitive('box', '#446688');
  chosen.position.set(2.7, 1.3, -4); chosen.rotation.z = 0.3; chosen.scale.set(0.7, 1.9, 1.2);
  s.select(null);
  check('auto-rig: sole unselected model is chosen', autoRigTargets(s)[0] === chosen);
  const other = s.addPrimitive('sphere', '#ff8844'); other.position.x = 9;
  s.select(null);
  check('auto-rig: multiple unselected models are ambiguous', throws(() => autoRigTargets(s), /Select the model/));
  s.select(chosen);
  const beforeGeometry = chosen.geometry, beforeMaterial = chosen.material;
  const capture = await prepareAutoRig(s);
  check('auto-rig: the upload contains only the selected shape', capture.targets.length === 1 && capture.targets[0].id === chosen.userData.id && capture.stats.finePoints === chosen.geometry.attributes.position.count);
  s.select(other); // selection alone must never retarget an in-flight request
  const result = await resultFor(capture);
  const count = applyAutoRig(s, capture, result);
  const rig = s.rig;
  const distal = rig.worldOf(rig.graph.joints[1].id);
  const expected = new THREE.Vector3(...capture.center).add(new THREE.Vector3(0, 0.6 * capture.scale, 0));
  check('auto-rig: rotated/scaled/translated model receives joints in the correct frame', new THREE.Vector3(...distal).distanceTo(expected) < 1e-6);
  check('auto-rig: skeleton applies to the frozen target after selection changes', count === 2 && rig.graph.joints.every((j) => j.shape === chosen.userData.id));
  check('auto-rig: original geometry and material are not replaced', chosen.geometry === beforeGeometry && chosen.material === beforeMaterial);
  check('auto-rig: unrelated shape excluded from the actual solver input', riggableMeshes(s).length === 1 && riggableMeshes(s)[0] === chosen);
  bindNow(s);
  check('auto-rig: binding skins the chosen shape only', s.shapes.find((m) => m.userData.id === chosen.userData.id).isSkinnedMesh && !s.shapes.find((m) => m.userData.id === other.userData.id).isSkinnedMesh);
  const snap = takeSnapshot(s);
  s.undo();
  check('auto-rig: a single undo removes both predicted graph and skin', s.rig.graph.size === 0 && s.shapes.every((m) => !m.isSkinnedMesh));
  s.redo();
  check('auto-rig: redo restores its exact target scope', s.rig.graph.size === 2 && riggableMeshes(s).length === 1);
  const restored = new StudioScene(); restoreSnapshot(restored, snap);
  check('auto-rig: persisted snapshot does not capture the unrelated shape into the rig', restored.rig.graph.size === 2 && riggableMeshes(restored).length === 1);
  const graphCopy = SkeletonGraph.fromJSON(s.rig.graph.toJSON());
  check('auto-rig: graph serialization keeps target shape ids', graphCopy.targetShapes.join() === String(chosen.userData.id));

  // Studio-export import renumbers ids: scope must remap too, rather than vanish or cover every shape.
  s.select(null); bindNow(s);
  const restoreHelpers = s.rig.detachHelpers();
  const exported = await buildGLB(s.group, null, s.rig.graph.toJSON()); restoreHelpers();
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const fresh = new StudioScene(); fresh.adoptImportedRig((await new GLTFLoader().parseAsync(exported, '')).scene);
  check('auto-rig: studio GLB import remaps scope with fresh shape ids', fresh.shapes.length === 2 && riggableMeshes(fresh).length === 1 && fresh.rig.graph.joints.every((j) => fresh.rig.graph.targetShapes.includes(j.shape)));

  for (const mutation of ['move', 'delete', 'skeleton']) {
    const scene = new StudioScene(), mesh = scene.addPrimitive('box', '#888888');
    const cap = await prepareAutoRig(scene);
    if (mutation === 'move') mesh.position.x += 1;
    if (mutation === 'delete') scene.remove(mesh);
    if (mutation === 'skeleton') scene.ensureRig().graph.add([0, 0, 0], null, mesh.userData.id);
    check(`auto-rig: stale ${mutation} result is refused before mutation`, throws(() => assertAutoRigCurrent(scene, cap), /changed/));
  }
  const badScene = new StudioScene(); badScene.addPrimitive('box', '#888888');
  const cap = await prepareAutoRig(badScene), bad = await resultFor(cap);
  bad.position.x = 100;
  check('auto-rig: a changed provider coordinate frame never edits the document', throws(() => applyAutoRig(badScene, cap, bad), /frame/) && !badScene.rig);
  const noBones = await parseAutoRig(cap.bytes);
  check('auto-rig: a mesh-only service result never edits the document', throws(() => applyAutoRig(badScene, cap, noBones), /skeleton/) && !badScene.rig);
  const collapsed = await resultFor(cap);
  collapsed.traverse((o) => { if (o.isBone) o.position.set(0, 0, 0); });
  check('auto-rig: a collapsed skeleton cannot be reported as usable', throws(() => applyAutoRig(badScene, cap, collapsed), /connected bones/) && !badScene.rig);
  const a = badScene.shapes[0], b = badScene.addPrimitive('sphere', '#888888');
  const g = badScene.ensureRig().graph, root = g.add([0, 0, 0], null, a.userData.id); g.add([0, 1, 0], root, b.userData.id);
  badScene.select(a);
  let refused = false; try { await prepareAutoRig(badScene); } catch (e) { refused = /all parts/.test(e.message); }
  check('auto-rig: cannot replace only half of a shared skeleton', refused);
}
const results = [];
await run((name, condition) => results.push([name, condition]));
export default function (check) { for (const [name, condition] of results) check(name, condition); }
