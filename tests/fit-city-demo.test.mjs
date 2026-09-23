import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from '../P5 Programme/buddy-kit/client/studio/node_modules/three/build/three.module.js';
import { GLTFLoader } from '../P5 Programme/buddy-kit/client/studio/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { championMetadataFromGLTF, collectRigInfo, validateStudioChampion } from '../P5 Programme/buddy-kit/client/city-common/champion-contract.js';

const url = new URL('../P5 Programme/docs/workshop-studio-demo/milo-city-champion.glb', import.meta.url);

test('Studio demo GLB reloads with a skinned biped and four City actions', async () => {
  const bytes = await readFile(url);
  const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const gltf = await new GLTFLoader().parseAsync(data, '');
  const metadata = championMetadataFromGLTF(gltf);
  const rig = collectRigInfo(gltf.scene);
  const check = validateStudioChampion({ metadata, animations: gltf.animations, boneNames: rig.boneNames, nodeNames: rig.nodeNames, rootName: gltf.scene.name });
  assert.equal(check.ok, true, check.error);
  assert.ok(rig.skeletonCount > 0);
  assert.equal(metadata.formatVersion, 2);
  assert.equal(metadata.animationMode, 'studio');
  assert.deepEqual(Object.keys(check.clips), ['idle', 'walk', 'run', 'jump']);
  assert.ok(metadata.groundContacts.every(contact => rig.nodeNames.includes(contact.node) && contact.point.every(Number.isFinite)));
  const mixer = new THREE.AnimationMixer(gltf.scene);
  const hip = gltf.scene.getObjectByName('j1');
  const rest = hip.position.y;
  mixer.clipAction(check.clips.jump).play(); mixer.setTime(check.clips.jump.duration * .5);
  assert.ok(hip.position.y > rest + .15, 'Jump lifts the hips');
  mixer.stopAllAction();
  const arm = gltf.scene.getObjectByName('j7');
  mixer.clipAction(check.clips.walk).play(); mixer.setTime(check.clips.walk.duration * .25);
  assert.ok(Math.abs(arm.quaternion.x) > .01, 'Walk swings an arm');
  mixer.stopAllAction();
  for (const action of ['idle', 'walk', 'run']) {
    const clip = check.clips[action];
    mixer.clipAction(clip).play(); mixer.setTime(clip.duration * .25);
    gltf.scene.updateMatrixWorld(true);
    assert.ok(Number.isFinite(hip.getWorldPosition(new THREE.Vector3()).y), `${action} pose is finite`);
    mixer.stopAllAction();
  }
});
