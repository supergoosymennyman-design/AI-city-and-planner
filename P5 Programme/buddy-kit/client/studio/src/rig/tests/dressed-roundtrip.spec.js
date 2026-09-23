import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { StudioScene } from '../../scene.js';
import { FitController } from '../../fit/fit-controller.js';
import { bakeDressed } from '../../fit/fit.js';
import { takeSnapshot, restoreSnapshot } from '../../edit/snapshot.js';
import { addTubeShape, chainUpTube, bindNow } from './fixtures.js';

const results = [];
const check = (name, ok) => results.push([`dressed round-trip: ${name}`, ok]);
const controller = s => new FitController(s, { detach() {} }, { show() {}, error() {} });
const centre = group => new THREE.Box3().setFromObject(group).getCenter(new THREE.Vector3());
const prop = name => {
  const group = new THREE.Group(); group.name = name;
  group.add(new THREE.Mesh(new THREE.BoxGeometry(.15, .2, .25), new THREE.MeshStandardMaterial()));
  return group;
};
const source = new StudioScene(); addTubeShape(source);
const rig = source.ensureRig(), ids = chainUpTube(rig); bindNow(source);
const fit = controller(source); fit.addGear(prop('hat'));
fit.seatToBone(fit.wardrobe[0], rig.bones.get(ids[2]));
fit.wardrobe[0].group.position.set(.13, .2, -.1);
fit.wardrobe[0].group.rotation.set(.1, .2, .3);
fit.wardrobe[0].group.scale.set(.7, .8, .9);
rig.graph.setMotion({ legs: [], roles: {}, gait: 'waddle', softness: .65, forward: '+z', stride: 25, duration: 1.2 });
source.select(source.shapes.find(o => !o.userData.isGear));
let buffer = await bakeDressed(source, fit.wardrobe);
let loaded = await new GLTFLoader().parseAsync(buffer, '');
{
  const legacy = await new GLTFLoader().parseAsync(buffer, '');
  legacy.scene.traverse(o => { delete o.userData.rig; delete o.userData.studioGear; });
  const old = new StudioScene(), oldFit = controller(old);
  check('older dressed files recover their bone-parented gear', old.adoptImportedRig(legacy.scene) === 'foreign' && oldFit.wardrobe.length === 1 && oldFit.wardrobe[0].group.parent.isBone);
}
let helpers = 0; loaded.scene.traverse(o => { if (o.userData.isOutline || o.userData.isJointBall || o.userData.isRigLink) helpers++; });
check('no outlines or joint helpers in selected-model export', helpers === 0);
check('saved Walk and Jump clips included', loaded.animations.map(c => c.name).join() === 'Walk,Jump');
{
  let accessory; loaded.scene.traverse(o => { if (o.userData.studioGear) accessory = o; });
  const before = accessory.getWorldPosition(new THREE.Vector3());
  const mixer = new THREE.AnimationMixer(loaded.scene);
  mixer.clipAction(loaded.animations.find(c => c.name === 'Jump')).play(); mixer.setTime(.55);
  loaded.scene.updateMatrixWorld(true);
  check('exported gear moves with exported Jump', accessory.getWorldPosition(new THREE.Vector3()).distanceTo(before) > .05);
  mixer.stopAllAction();
}
for (let generation = 0; generation < 2; generation++) {
  // Exercise the real import normalization and import into an existing document
  // where joint IDs must be remapped, not just parsing a glTF scene.
  loaded.scene.scale.setScalar(.6); loaded.scene.position.set(.3, -.4, .2); loaded.scene.updateMatrixWorld(true);
  const before = [];
  loaded.scene.traverse(o => { if (o.userData.studioGear) before.push(o.matrixWorld.clone()); });
  const s = new StudioScene(), fc = controller(s);
  addTubeShape(s); const existing = s.ensureRig(); chainUpTube(existing); bindNow(s);
  check(`generation ${generation}: restores Studio rig without re-solving`, s.adoptImportedRig(loaded.scene) === 'studio');
  s.group.updateMatrixWorld(true);
  check(`generation ${generation}: restores editable wardrobe`, fc.wardrobe.length === generation + 1);
  check(`generation ${generation}: gear placement survives normalization and ID remap`, fc.wardrobe.every((e, i) => e.group.matrixWorld.elements.every((v, k) => Math.abs(v - before[i].elements[k]) < 1e-5)));
  check(`generation ${generation}: every fitted group attached to remapped bone`, fc.wardrobe.every(e => e.group.parent === s.rig.bones.get(e.boneKey)));
  const entry = fc.wardrobe[0], bone = s.rig.bones.get(entry.boneKey);
  const beforePose = entry.group.getWorldPosition(new THREE.Vector3());
  bone.rotation.z += .4; s.group.updateMatrixWorld(true);
  check(`generation ${generation}: gear follows posing`, entry.group.getWorldPosition(new THREE.Vector3()).distanceTo(beforePose) > .01);
  if (generation === 0) {
    fc.addGear(prop('glasses')); fc.seatToBone(fc.wardrobe.at(-1), bone);
    check('adding another accessory on the same bone keeps both', fc.wardrobe.length === 2 && fc.wardrobe.every(e => e.group.parent));
    buffer = await bakeDressed(s, fc.wardrobe);
    loaded = await new GLTFLoader().parseAsync(buffer, '');
  }
}
{
  const s = new StudioScene(), fc = controller(s);
  const parsed = await new GLTFLoader().parseAsync(await bakeDressed(source, fit.wardrobe), '');
  parsed.scene.scale.setScalar(.65); parsed.scene.position.y = -.4;
  s.adoptImportedRig(parsed.scene); s.group.updateMatrixWorld(true);
  const before = centre(fc.wardrobe[0].group);
  const snap = takeSnapshot(s), pieces = await fc.serializeWardrobe();
  check('champion snapshot excludes separately saved accessories', snap.objects.length === 1);
  const restored = new StudioScene(), wardrobe = controller(restored);
  restoreSnapshot(restored, snap); await wardrobe.restoreWardrobePieces(pieces);
  check('reload preserves socket position and animation settings', centre(wardrobe.wardrobe[0].group).distanceTo(before) < 1e-5 && !!restored.rig.graph.motion);
  wardrobe.unbindActive();
  const looseBefore = centre(wardrobe.wardrobe[0].group);
  const loose = await wardrobe.serializeWardrobe();
  const again = new StudioScene(), againFit = controller(again);
  restoreSnapshot(again, takeSnapshot(restored)); await againFit.restoreWardrobePieces(loose);
  check('unbound accessories remain unbound after reload', againFit.wardrobe.length === 1 && againFit.wardrobe[0].boneKey === null && centre(againFit.wardrobe[0].group).distanceTo(looseBefore) < 1e-5);
}
export default assert => { for (const [name, ok] of results) assert(name, ok); };
