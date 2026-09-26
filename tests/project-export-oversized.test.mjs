// tests/project-export-oversized.test.mjs
//
// The Champion File / envelope export must be COMPLETE: a large, multi-model
// project must round-trip every asset and all progress — "never silently omit
// models or progress". This builds an oversized project (well past a typical
// lesson, still inside the 80 MB archive cap) and proves nothing is dropped.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createProject, exportProjectEnvelope, importProjectEnvelope, attachArchiveAsset,
} from '../P5 Programme/buddy-kit/client/city-common/project-store.js';

const MIB = 1024 * 1024;

function bigProject() {
  const project = createProject('Big City');
  project.revision = 7;
  project.projects.city = { legacyState: { version: 2, buildings: Array.from({ length: 400 }, (_, i) => ({ id: `b${i}`, x: i, z: i * 2 })) } };
  project.projects.workshop = { champion: { name: 'Camera Kid', brain: 'knn' } };
  project.projects.studio = { look: 'sunset' };
  project.projects.planner = { goals: { green: 3 } };
  project.capabilities = { 'cap_drive-knn@2': { id: 'cap_drive-knn', revision: 2, model: { k: 3 } } };
  project.installations = { 'host-car': { id: 'host-car', capabilityRef: 'cap_drive-knn@2', decisions: Array.from({ length: 200 }, () => ({ decision: 'forward' })) } };
  project.progress = { tutorialRooms: { 1: true, 2: true, 3: true }, lastWorkspace: 'city', economyMigrated: true };
  project.projects.badges = { version: 1, tier: 'skeptic', earned: [{ id: 'skeptic', evidence: { heldOut: 8 } }] };
  return project;
}

test('an oversized multi-model project exports every asset and all progress intact', () => {
  const project = bigProject();
  const exported = exportProjectEnvelope(project);
  assert.equal(exported.ok, true, exported.error);

  // Three near-model-size assets: the export must carry all of them, byte-exact.
  const size = 8 * MIB;
  const assets = [];
  for (let i = 0; i < 3; i++) {
    const bytes = new Uint8Array(size);
    bytes[0] = i + 1;
    bytes[size - 1] = 255 - i;
    const added = attachArchiveAsset(exported.archive, { bytes, name: `model-${i}.glb`, role: 'model' });
    assert.equal(added.ok, true, added.error);
    assets.push(added.hash);
  }

  // Genuinely oversized (definitely not a toy), while well under the 80 MB cap.
  const json = JSON.stringify(exported.archive);
  const bytes = new TextEncoder().encode(json);
  assert.ok(bytes.byteLength > 30 * MIB, `export too small to be a real size test (${bytes.byteLength})`);
  assert.ok(bytes.byteLength < 80 * MIB, `export must stay inside the archive cap (${bytes.byteLength})`);

  // Round-trip it exactly as a download→restore would.
  const restored = importProjectEnvelope(JSON.parse(json));
  assert.equal(restored.ok, true, restored.error);

  // Every asset came back, byte-for-byte.
  assert.equal(Object.keys(restored.assets).length, 3);
  for (let i = 0; i < 3; i++) {
    const asset = restored.assets[assets[i]];
    assert.ok(asset, `asset ${i} was omitted by the export`);
    assert.equal(asset.byteLength, size);
    assert.equal(asset.name, `model-${i}.glb`);
    assert.equal(asset.bytes.byteLength, size);
  }

  // Every workspace section and all progress survived.
  assert.equal(restored.project.projects.city.legacyState.buildings.length, 400);
  assert.equal(restored.project.projects.workshop.champion.name, 'Camera Kid');
  assert.equal(restored.project.projects.studio.look, 'sunset');
  assert.equal(restored.project.projects.planner.goals.green, 3);
  assert.equal(restored.project.progress.tutorialRooms[3], true);
  assert.equal(restored.project.progress.lastWorkspace, 'city');
  assert.equal(restored.project.projects.badges.tier, 'skeptic');
  assert.equal(restored.project.capabilities['cap_drive-knn@2'].revision, 2);
  assert.equal(restored.project.installations['host-car'].decisions.length, 200);
  assert.equal(restored.project.revision, 7);
});

test('a damaged oversized asset is refused, never silently dropped', () => {
  const exported = exportProjectEnvelope(bigProject());
  const bytes = new Uint8Array(MIB);
  const added = attachArchiveAsset(exported.archive, { bytes, name: 'model.glb' });
  const tampered = JSON.parse(JSON.stringify(exported.archive));
  tampered.assets[0].data = tampered.assets[0].data.slice(0, -8) + 'AAAAAAA=';
  const restored = importProjectEnvelope(tampered);
  assert.equal(restored.ok, false);
  assert.match(restored.error, /damaged/i);
  assert.ok(added.hash);
});
