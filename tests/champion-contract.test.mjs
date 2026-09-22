import test from 'node:test';
import assert from 'node:assert/strict';
import { colonFreeBoneName, migrateRigDocument, validateStudioChampion } from '../P5 Programme/buddy-kit/client/city-common/champion-contract.js';

const clip = (name, targets = ['Hips', 'LeftFoot']) => ({ name, duration: 1, tracks: targets.map(target => ({ name: `${target}.quaternion` })) });
const metadata = { formatVersion: 1, championId: 'champion-1', studioRevision: 2, rigKind: 'biped', actions: { idle: 'i', walk: 'w', run: 'r' }, height: 1.8, assetHash: 'fnv1a-a' };

test('Studio Champion contract accepts three bone-only actions', () => {
  const result = validateStudioChampion({ metadata, animations: [clip('i'), clip('w'), clip('r')], boneNames: ['Hips', 'LeftFoot'] });
  assert.equal(result.ok, true);
  assert.equal(result.clips.run.name, 'r');
});

test('contract rejects missing clips, missing targets, and unusable feet', () => {
  assert.match(validateStudioChampion({ metadata, animations: [clip('i')], boneNames: ['Hips', 'LeftFoot'] }).error, /walk/);
  assert.match(validateStudioChampion({ metadata, animations: [clip('i'), clip('w', ['Gone']), clip('r')], boneNames: ['Hips', 'LeftFoot'] }).error, /missing bone/);
  assert.match(validateStudioChampion({ metadata, animations: [clip('i', ['Hips']), clip('w', ['Hips']), clip('r', ['Hips'])], boneNames: ['Hips'] }).error, /foot bones/);
});

test('old colon-bearing quadruped documents migrate without losing role mapping', () => {
  const old = { formatVersion: 1, bones: [{ name: 'rig:FrontLeftPaw', role: 'frontLeftFoot' }, { name: 'rig:Spine', role: 'spine' }], roleMap: { frontLeftFoot: 'rig:FrontLeftPaw' } };
  const migrated = migrateRigDocument(old);
  assert.equal(migrated.bones[0].name, 'rig_FrontLeftPaw');
  assert.equal(migrated.roleMap.frontLeftFoot, 'rig_FrontLeftPaw');
  assert.equal(old.bones[0].name, 'rig:FrontLeftPaw');
  assert.equal(colonFreeBoneName('rig:Rear Right'), 'rig_Rear_Right');
});
