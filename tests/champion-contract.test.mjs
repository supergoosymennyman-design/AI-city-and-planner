import test from 'node:test';
import assert from 'node:assert/strict';
import { colonFreeBoneName, migrateRigDocument, validateStudioChampion } from '../P5 Programme/buddy-kit/client/city-common/champion-contract.js';

const clip = (name, targets = ['Hips', 'LeftFoot']) => ({ name, duration: 1, tracks: targets.map(target => ({ name: `${target}.quaternion`, times: [0, 1], values: [0, 0, 0, 1, 0, 0, 0, 1] })) });
const metadata = { formatVersion: 1, championId: 'champion-1', studioRevision: 2, rigKind: 'biped', actions: { idle: 'i', walk: 'w', run: 'r' }, height: 1.8, assetHash: 'fnv1a-a' };

test('Studio Champion contract accepts three bone-only actions', () => {
  const result = validateStudioChampion({ metadata, animations: [clip('i'), clip('w'), clip('r')], boneNames: ['Hips', 'LeftFoot'] });
  assert.equal(result.ok, true);
  assert.equal(result.clips.run.name, 'r');
});

test('contract rejects missing clips and missing targets', () => {
  assert.match(validateStudioChampion({ metadata, animations: [clip('i')], boneNames: ['Hips', 'LeftFoot'] }).error, /walk/);
  assert.match(validateStudioChampion({ metadata, animations: [clip('i'), clip('w', ['Gone']), clip('r')], boneNames: ['Hips', 'LeftFoot'] }).error, /missing model part/);
  assert.equal(validateStudioChampion({ metadata, animations: [clip('i', ['Hips']), clip('w', ['Hips']), clip('r', ['Hips'])], boneNames: ['Hips'] }).ok, true);
});

test('contract accepts named actions on nonstandard nodes and rejects malformed clips', () => {
  const dragon = { ...metadata, rigKind: 'other', actions: { idle: 'i', walk: 'w', run: 'r', jump: 'j', dance: 'd' }, extraActions: [{ name: 'Roar', clip: 'roar' }] };
  const animations = ['i', 'w', 'r', 'j', 'd', 'roar'].map(name => clip(name, ['DragonWing']));
  const valid = validateStudioChampion({ metadata: dragon, animations, nodeNames: ['DragonWing'] });
  assert.equal(valid.ok, true);
  assert.equal(valid.extraActions[0].name, 'Roar');
  const malformed = animations.map(item => item.name === 'roar' ? { ...item, tracks: [{ name: 'DragonWing.position', times: [0, 1], values: [0, NaN] }] } : item);
  assert.match(validateStudioChampion({ metadata: dragon, animations: malformed, nodeNames: ['DragonWing'] }).error, /malformed/);
});

test('object and morph animation can bind while root travel stays City-owned', () => {
  const morph = { name: 'roar', duration: 1, tracks: [{ name: 'Jaw.morphTargetInfluences[Open]', times: [0, 1], values: [0, 1] }] };
  const custom = { ...metadata, actions: { idle: 'i', walk: 'w', run: 'r' }, extraActions: [{ name: 'Roar', clip: 'roar' }] };
  const base = [clip('i', ['Tail']), clip('w', ['Tail']), clip('r', ['Tail'])];
  assert.equal(validateStudioChampion({ metadata: custom, animations: [...base, morph], nodeNames: ['Tail', 'Jaw'] }).ok, true);
  const movingRoot = { ...morph, tracks: [{ name: 'Dragon.position', times: [0, 1], values: [0, 0, 0, 10, 0, 0] }] };
  assert.match(validateStudioChampion({ metadata: custom, animations: [...base, movingRoot], nodeNames: ['Tail', 'Jaw', 'Dragon'], rootName: 'Dragon' }).error, /City controls travel/);
});

test('old colon-bearing quadruped documents migrate without losing role mapping', () => {
  const old = { formatVersion: 1, bones: [{ name: 'rig:FrontLeftPaw', role: 'frontLeftFoot' }, { name: 'rig:Spine', role: 'spine' }], roleMap: { frontLeftFoot: 'rig:FrontLeftPaw' } };
  const migrated = migrateRigDocument(old);
  assert.equal(migrated.bones[0].name, 'rig_FrontLeftPaw');
  assert.equal(migrated.roleMap.frontLeftFoot, 'rig_FrontLeftPaw');
  assert.equal(old.bones[0].name, 'rig:FrontLeftPaw');
  assert.equal(colonFreeBoneName('rig:Rear Right'), 'rig_Rear_Right');
});

test('declared foot joints must exist in the exported skeleton', () => {
  const withFeet = { ...metadata, footBones: ['LeftFoot', 'RightFoot'] };
  const animations = [clip('i'), clip('w'), clip('r')];
  assert.equal(validateStudioChampion({ metadata: withFeet, animations, boneNames: ['Hips', 'LeftFoot', 'RightFoot'] }).ok, true);
  assert.match(validateStudioChampion({ metadata: withFeet, animations, boneNames: ['Hips', 'LeftFoot'] }).error, /foot joints/);
});
