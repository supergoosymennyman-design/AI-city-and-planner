import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCapabilityV2 } from '../P5 Programme/buddy-kit/client/city-common/capability-export.js';
import { publishCapability, installSkill, runSkill, updateAvailable, MAX_DECISIONS } from '../P5 Programme/buddy-kit/client/city-common/skill-registry.js';
import { createProject } from '../P5 Programme/buddy-kit/client/city-common/project-store.js';

const fields = ['left', 'centre', 'right'];
const labels = ['forward', 'stop'];
const selftest = [{ name: 'forward', input: { left: 9, centre: 9, right: 9 }, expect: { decision: 'forward' } }];
const capOf = (revision = 1) => {
  const out = buildCapabilityV2({
    id: 'cap-drive', name: 'Lane keeper', fields, labels, k: 3, threshold: 0.5, revision, selftest,
    examples: [
      { label: 'forward', values: [9, 9, 9] }, { label: 'forward', values: [8, 9, 9] },
      { label: 'stop', values: [1, 1, 9] }, { label: 'stop', values: [1, 1, 8] },
    ],
  });
  assert.equal(out.ok, true, out.error);
  return out.capability;
};

test('publishing is validated, gated by self-test, and immutable per revision', () => {
  const project = createProject();
  const first = publishCapability(project, capOf(1));
  assert.equal(first.ok, true);
  assert.equal(first.published, true);
  assert.ok(project.capabilities['cap-drive@1']);
  // Re-publishing the same revision is a no-op, never an overwrite.
  const again = publishCapability(project, capOf(1));
  assert.equal(again.published, false);
  assert.equal(again.reason, 'already-published');
  // A revision that fails its self-test is refused.
  const broken = capOf(2);
  broken.selftest = { cases: [{ name: 'wrong', input: { left: 9, centre: 9, right: 9 }, expect: { decision: 'stop' } }] };
  const refused = publishCapability(project, broken);
  assert.equal(refused.ok, false);
  assert.equal(project.capabilities['cap-drive@2'], undefined, 'a failing revision is never stored');
});

test('install requires a published capability and honours a host-kind declaration', () => {
  const project = createProject();
  assert.equal(installSkill(project, 'cap-drive@1', 'host-1').ok, false);
  publishCapability(project, capOf(1));
  const installed = installSkill(project, 'cap-drive@1', 'host-1', { hostType: 'sorter', at: 't0' });
  assert.equal(installed.ok, true);
  assert.equal(installed.installation.capabilityRef, 'cap-drive@1');
  // A host declaration that excludes the host kind is refused, not forced.
  project.capabilities['cap-drive@1'].city = { hostTypes: ['mobility'] };
  assert.equal(installSkill(project, 'cap-drive@1', 'host-2', { hostType: 'sorter' }).ok, false);
});

test('runSkill returns the real decision and keeps a bounded decision log', () => {
  const project = createProject();
  publishCapability(project, capOf(1));
  installSkill(project, 'cap-drive@1', 'host-1');
  const hit = runSkill(project, 'host-1', { left: 9, centre: 9, right: 9 }, { at: 't1' });
  assert.equal(hit.ok, true);
  assert.equal(hit.decision, 'forward');
  assert.equal(hit.abstained, false);
  for (let i = 0; i < MAX_DECISIONS + 25; i++) runSkill(project, 'host-1', { left: 9, centre: 9, right: 9 });
  assert.equal(project.installations['host-1'].decisions.length, MAX_DECISIONS);
});

test('a newer revision surfaces as an update but never replaces the installed one', () => {
  const project = createProject();
  publishCapability(project, capOf(1));
  installSkill(project, 'cap-drive@1', 'host-1');
  publishCapability(project, capOf(2));
  const update = updateAvailable(project, 'host-1');
  assert.equal(update.key, 'cap-drive@2');
  // The installation still points at revision 1 until an explicit reinstall.
  assert.equal(project.installations['host-1'].capabilityRef, 'cap-drive@1');
  installSkill(project, update.key, 'host-1');
  assert.equal(project.installations['host-1'].capabilityRef, 'cap-drive@2');
});
