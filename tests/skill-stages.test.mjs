// tests/skill-stages.test.mjs
//
// Stage 6: skill stages are EVIDENCE-derived (plan §2), and a reward's scope is
// the CHALLENGE, never a machine — so copying or renaming a machine cannot mint
// fresh eligibility.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildImageCapabilityV2, buildDriveCapability } from '../P5 Programme/buddy-kit/client/city-common/capability-export.js';
import { publishCapability, installSkill } from '../P5 Programme/buddy-kit/client/city-common/skill-registry.js';
import { recordLearningEvent } from '../P5 Programme/buddy-kit/client/city-common/ledger.js';
import { REWARD_SCOPES } from '../P5 Programme/buddy-kit/client/city-common/ledger.js';
import { createProject } from '../P5 Programme/buddy-kit/client/city-common/project-store.js';
import { RECYCLING_PREPROCESSING } from '../P5 Programme/buddy-kit/client/city-common/recycling.js';
import {
  CHALLENGE_IDS, CHALLENGES, challengeOfCapability, capabilityEntries, latestCapability,
  installationEntries, emptyChallengeRuns, recordRun, fixedAgainst, wrongIdsOf, gradedIdsOf,
} from '../P5 Programme/buddy-kit/client/city-common/challenges.js';
import { SKILL_STAGES, stageOf, allStages, stageLabel } from '../P5 Programme/buddy-kit/client/city-common/skill-stages.js';

const DIM = 4;
const basis = (i) => Array.from({ length: DIM }, (_, j) => (j === i ? 1 : 0));

function imageCap({ id = 'cap_trashnet-knn', revision = 1 } = {}) {
  const out = buildImageCapabilityV2({
    id, name: 'Curated TrashNet sorter', revision,
    labels: ['cardboard', 'glass'], dimension: DIM, preprocessing: RECYCLING_PREPROCESSING,
    k: 1, threshold: 0.5,
    examples: [{ label: 'cardboard', vector: basis(0) }, { label: 'glass', vector: basis(1) }],
    city: { hostTypes: ['sorter'], dataset: 'trashnet' },
  });
  assert.equal(out.ok, true, out.error);
  return out.capability;
}

function driveCap({ id = 'cap_drive-knn', revision = 1 } = {}) {
  const out = buildDriveCapability({
    id, name: 'Driving Model', revision, k: 1, threshold: 0.5,
    examples: [
      { label: 'forward', values: [9, 9, 9, 0, 0, 6, 0, 0] },
      { label: 'stop', values: [1, 1, 1, 0, 0, 0, 0, 0] },
    ],
  });
  assert.equal(out.ok, true, out.error);
  return out.capability;
}

function claim(project, type, scopeId, evidence = { at: 't' }) {
  const res = recordLearningEvent(project.economy, { type, scopeId, evidence });
  assert.equal(res.ok, true, res.error);
  project.economy = res.economy;
  return res;
}

test('a capability is classified into its challenge, and unknown bundles belong to none', () => {
  assert.equal(challengeOfCapability(imageCap()), 'image-sorter');
  assert.equal(challengeOfCapability(driveCap()), 'driver');
  assert.equal(challengeOfCapability({ input: { kind: 'vector', fields: ['a'] } }), null);
  assert.equal(challengeOfCapability(null), null);
  assert.deepEqual(CHALLENGE_IDS, ['image-sorter', 'driver']);
  assert.equal(CHALLENGES.driver.hostType, 'driver');
});

test('capability and installation lookups stay scoped to their challenge, ordered by revision', () => {
  const project = createProject();
  publishCapability(project, imageCap({ revision: 1 }));
  publishCapability(project, imageCap({ revision: 2 }));
  publishCapability(project, driveCap());
  installSkill(project, 'cap_trashnet-knn@2', 'host-demo-sorter', { hostType: 'sorter' });

  const rows = capabilityEntries(project, 'image-sorter');
  assert.deepEqual(rows.map((r) => r.key), ['cap_trashnet-knn@1', 'cap_trashnet-knn@2']);
  assert.equal(latestCapability(project, 'image-sorter').key, 'cap_trashnet-knn@2');
  assert.equal(latestCapability(project, 'driver').key, 'cap_drive-knn@1');
  assert.deepEqual(installationEntries(project, 'image-sorter').map((i) => i.id), ['host-demo-sorter']);
  assert.deepEqual(installationEntries(project, 'driver'), []);
});

test('a run records what it got wrong, and only a NEWER revision on the same scenario can fix it', () => {
  const first = recordRun(emptyChallengeRuns(), {
    challengeId: 'image-sorter', revision: 1, scenario: { kind: 'normal', seed: 7 },
    wrongIds: ['a', 'b'], gradedIds: ['a', 'b', 'c'],
  });
  assert.deepEqual(first.fixedIds, [], 'the first run fixes nothing');

  // Same revision re-run: not an improvement.
  const replay = recordRun(first.state, {
    challengeId: 'image-sorter', revision: 1, scenario: { kind: 'normal', seed: 7 },
    wrongIds: ['a'], gradedIds: ['a', 'b', 'c'],
  });
  assert.deepEqual(replay.fixedIds, []);

  // A newer revision that gets 'a' right and leaves 'b' wrong fixes exactly 'a'.
  const improved = recordRun(first.state, {
    challengeId: 'image-sorter', revision: 2, scenario: { kind: 'normal', seed: 7 },
    wrongIds: ['b'], gradedIds: ['a', 'b', 'c'],
  });
  assert.deepEqual(improved.fixedIds, ['a']);

  // A different seed is a different scenario — its history is separate.
  const other = recordRun(first.state, {
    challengeId: 'image-sorter', revision: 2, scenario: { kind: 'normal', seed: 8 },
    wrongIds: [], gradedIds: ['a'],
  });
  assert.deepEqual(other.fixedIds, []);
});

test('fixedAgainst ignores an item that vanished from the batch', () => {
  const previous = { revision: 1, wrongIds: ['a', 'b'] };
  assert.deepEqual(fixedAgainst(previous, ['b'], ['b', 'c']), [], 'a was not graded again, so it is not "fixed"');
  assert.deepEqual(fixedAgainst(previous, [], ['a', 'b']), ['a', 'b']);
  assert.deepEqual(fixedAgainst(null, [], []), []);
});

test('wrongIdsOf/gradedIdsOf read ground truth for scoring only, and never count an abstention', () => {
  const results = [
    { id: 'a', truth: 'glass', decision: 'glass', abstained: false },
    { id: 'b', truth: 'glass', decision: 'cardboard', abstained: false },
    { id: 'c', truth: 'glass', decision: '__abstain', abstained: true },
  ];
  assert.deepEqual(wrongIdsOf(results), ['b']);
  assert.deepEqual(gradedIdsOf(results), ['a', 'b']);
});

test('skill stages climb Built → Tested → City-connected → Improved from evidence alone', () => {
  const project = createProject();
  assert.equal(stageOf(project, 'image-sorter').stage, 'not-started');
  assert.equal(stageOf(project, 'nope'), null);

  publishCapability(project, imageCap());
  assert.equal(stageOf(project, 'image-sorter').stage, 'built');

  claim(project, 'held-out-eval', 'image-sorter', { batch: 'normal', seed: 1 });
  assert.equal(stageOf(project, 'image-sorter').stage, 'tested');

  installSkill(project, 'cap_trashnet-knn@1', 'host-demo-sorter', { hostType: 'sorter' });
  // Installed but no City test yet: still Tested, not City-connected.
  assert.equal(stageOf(project, 'image-sorter').stage, 'tested');
  claim(project, 'city-install', 'image-sorter', { installationId: 'host-demo-sorter' });
  assert.equal(stageOf(project, 'image-sorter').stage, 'city-connected');

  claim(project, 'revision-fixed', 'image-sorter', { fixedIds: ['a'], fromRevision: 1, toRevision: 2 });
  assert.equal(stageOf(project, 'image-sorter').stage, 'improved');

  const stages = allStages(project);
  assert.deepEqual(Object.keys(stages), [...CHALLENGE_IDS]);
  assert.equal(stages.driver.stage, 'not-started');
  assert.equal(stages['image-sorter'].order, SKILL_STAGES.length);
});

test('a bounded decision log alone marks City-connected (an install that really ran)', () => {
  const project = createProject();
  publishCapability(project, imageCap());
  installSkill(project, 'cap_trashnet-knn@1', 'host-demo-sorter', { hostType: 'sorter' });
  assert.equal(stageOf(project, 'image-sorter').stage, 'built');
  project.installations['host-demo-sorter'].decisions.push({ at: 't', decision: 'glass', abstained: false });
  assert.equal(stageOf(project, 'image-sorter').stage, 'city-connected');
});

test('stages are labelled in both languages, including the not-started case', () => {
  assert.equal(stageLabel('improved'), 'Improved');
  assert.equal(stageLabel('improved', 'zh-Hant'), '已改良');
  assert.equal(stageLabel('nope', 'zh-Hant'), '未開始');
});

test('the ledger reward-scope allow-list cannot drift from the challenge registry', () => {
  // The ledger owns reward rules; challenges.js owns challenge identity. Two
  // copies of the same list is a drift bug waiting to happen, so pin them.
  assert.deepEqual([...REWARD_SCOPES.challenge], [...CHALLENGE_IDS]);
});
