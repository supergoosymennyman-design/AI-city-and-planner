import test from 'node:test';
import assert from 'node:assert/strict';
import { attachArchiveAsset, createProject, validateProject, migrateChampionFile, exportProjectEnvelope, importProjectEnvelope, simpleHash } from '../P5 Programme/buddy-kit/client/city-common/project-store.js';
import { composeChampionFile } from '../P5 Programme/buddy-kit/client/city-common/champion-file.js';

test('Passiona envelope is versioned and preserves independent workspace sections', () => {
  const project = createProject('Ada’s City');
  project.projects.workshop = { machines: [{ id: 'm1', name: 'Gate helper' }], unknownForeignSection: { keep: true } };
  project.projects.city = { instances: [{ instanceId: 'city-1' }] };
  assert.equal(validateProject(project).ok, true);
  const exported = exportProjectEnvelope(project);
  assert.equal(exported.ok, true);
  const imported = importProjectEnvelope(exported.archive);
  assert.equal(imported.ok, true);
  assert.deepEqual(imported.project.projects.workshop.unknownForeignSection, { keep: true });
  assert.equal(imported.project.projects.city.instances[0].instanceId, 'city-1');
});

test('City Champion File migrates without changing original raw sections', () => {
  const champion = composeChampionFile({ layout: '{"version":2}', props: '[{"id":"prop_bench"}]', future: 'keep' }, 'Ada');
  const result = migrateChampionFile(champion);
  assert.equal(result.ok, true);
  assert.equal(result.project.projects.city.legacyState.future, 'keep');
  assert.equal(result.project.projects.city.legacyState.props, '[{"id":"prop_bench"}]');
});

test('archive rejects an integrity mismatch', () => {
  const project = createProject();
  const archive = { kind: 'passiona-project', version: 1, integrity: simpleHash('{}'), project };
  assert.equal(importProjectEnvelope(archive).ok, false);
});

test('portable archive carries a content-addressed Champion GLB', () => {
  const project = createProject('Portable city');
  project.projects.studio = { revision: 4, wardrobe: [{ name: 'visor' }], unknown: { keep: true } };
  const out = exportProjectEnvelope(project);
  const attached = attachArchiveAsset(out.archive, { bytes: new Uint8Array([0x67, 0x6c, 0x54, 0x46]), role: 'champion-glb', name: 'champion.glb' });
  assert.equal(attached.ok, true);
  const restored = importProjectEnvelope(out.archive);
  assert.equal(restored.ok, true);
  assert.deepEqual([...new Uint8Array(restored.assets[attached.hash].bytes)], [0x67, 0x6c, 0x54, 0x46]);
  assert.deepEqual(restored.project.projects.studio.unknown, { keep: true });
});
