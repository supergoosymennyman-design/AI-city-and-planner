import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { buildCapabilityV2 } from '../P5 Programme/buddy-kit/client/city-common/capability-export.js';
import { parseCapability, runInference, runSelftest, installCapability, CAP_ABSTAIN, CAP_ALGORITHM_V2, CAP_SPEC_VERSION_2 } from '../P5 Programme/buddy-kit/client/city-common/cap-runtime.js';
import { unitVec } from '../P5 Programme/buddy-kit/client/city-common/knn-vector.js';

const require = createRequire(import.meta.url);
const Brain = require('../P5 Programme/buddy-kit/client/workshop/logic/brain.js');

const fields = ['left', 'centre', 'right'];
const labels = ['forward', 'left', 'right', 'slow', 'stop'];
// A tiny labelled sensor set: raw [left, centre, right] distances in metres.
const examples = [
  { label: 'forward', values: [9, 9, 9] },
  { label: 'forward', values: [8, 9, 9] },
  { label: 'left',    values: [1, 8, 9] },
  { label: 'left',    values: [2, 7, 8] },
  { label: 'right',   values: [9, 8, 1] },
  { label: 'stop',    values: [1, 1, 9] },
  { label: 'stop',    values: [1, 1, 8] },
  { label: 'slow',    values: [4, 4, 9] },
  { label: 'slow',    values: [5, 5, 8] },
];

function build(extra = {}) {
  const out = buildCapabilityV2({ id: 'cap-test', name: 'Sensor sorter', fields, labels, examples, k: 3, threshold: 0.5, ...extra });
  assert.equal(out.ok, true, out.error);
  return out.capability;
}

test('a v2 bundle parses, installs, and declares the shared algorithm', () => {
  const cap = build({ selftest: [{ name: 'forward', input: { left: 9, centre: 9, right: 9 }, expect: { decision: 'forward' } }] });
  assert.equal(cap.specVersion, CAP_SPEC_VERSION_2);
  assert.equal(cap.model.algorithm, CAP_ALGORITHM_V2);
  const parsed = parseCapability(cap);
  assert.equal(parsed.ok, true, parsed.error);
  const installed = installCapability(cap);
  assert.equal(installed.ok, true);
  assert.equal(installed.installation.capabilityId, 'cap-test');
  assert.equal(installed.installation.mode, 'live-running');
});

test('the City v2 runtime reproduces the Workshop brain on a seeded grid', () => {
  // Build the Workshop brain with the SAME transform the bundle stores.
  const brain = Brain.createBrain();
  for (const ex of examples) Brain.addExample(brain, ex.label, unitVec([...ex.values]), ex.label);
  const cap = build();
  const rnd = (() => { let s = 7; return () => (s = (s * 48271) % 2147483647) / 2147483647; })();
  for (let i = 0; i < 400; i++) {
    const obs = { left: rnd() * 10, centre: rnd() * 10, right: rnd() * 10 };
    const workshop = Brain.classify(brain, unitVec([obs.left, obs.centre, obs.right]), 3);
    const city = runInference(cap, obs);
    const workshopSim = 1 - (workshop.evidence[0].distance ** 2) / 2;
    if (workshopSim < 0.5) {
      assert.equal(city.abstained, true, `expected abstain at sim ${workshopSim}`);
      assert.equal(city.abstainReason, 'below-threshold');
    } else {
      assert.equal(city.abstained, false);
      assert.equal(city.decision, workshop.label);
      assert.ok(Math.abs(city.voteShare - workshop.value) < 1e-9 || city.voteShare === Math.round(workshop.value * 1000) / 1000);
    }
  }
});

test('the sure line abstains below the bundle threshold', () => {
  const strict = build({ threshold: 0.999 });
  // A fresh point far from every example: nearest similarity below the threshold.
  const r = runInference(strict, { left: 5, centre: 0, right: 0 });
  assert.equal(r.abstained, true);
  assert.equal(r.abstainReason, 'below-threshold');
  // A point sitting on a training vector is fully sure.
  const sure = build({ threshold: 0.5 });
  const hit = runInference(sure, { left: 9, centre: 9, right: 9 });
  assert.equal(hit.abstained, false);
  assert.equal(hit.decision, 'forward');
});

test('malformed input abstains honestly instead of guessing', () => {
  const cap = build();
  assert.equal(runInference(cap, { left: 9, centre: 9 }).abstainReason, 'missing-fields');
  assert.equal(runInference(cap, { left: NaN, centre: 9, right: 9 }).abstainReason, 'missing-fields');
  assert.equal(runInference(cap, null).abstainReason, 'missing-fields');
});

test('a dimension mismatch is rejected as an invalid model, not compared on a prefix', () => {
  const cap = build();
  cap.model.vectors.dim = 7; // claim a different feature width
  const r = runInference(cap, { left: 9, centre: 9, right: 9 });
  assert.equal(r.abstained, true);
  assert.equal(r.abstainReason, 'invalid-model');
});

test('the self-test is the gate: it passes matching cases and fails a wrong one', () => {
  const good = build({ selftest: [
    { name: 'clear forward', input: { left: 9, centre: 9, right: 9 }, expect: { decision: 'forward', minConfidence: 0.5 } },
    { name: 'missing field abstains', input: { left: 9, centre: 9 }, expect: { decision: CAP_ABSTAIN } },
  ] });
  assert.equal(runSelftest(good).ok, true);
  const bad = build({ selftest: [{ name: 'wrong claim', input: { left: 9, centre: 9, right: 9 }, expect: { decision: 'stop' } }] });
  assert.equal(runSelftest(bad).ok, false);
  assert.match(runSelftest(bad).failures[0].reason, /stop/);
  // A bundle with no cases can never go live.
  assert.equal(runSelftest(build()).ok, false);
});

test('the bias constant is applied exactly once, before unit-normalizing', () => {
  const biasCap = build({ plusConstant: 10 });
  assert.equal(biasCap.model.vectors.dim, fields.length + 1);
  assert.equal(biasCap.input.plusConstant, 10);
  // Same decision as the unbiased build for a point on a training vector.
  const a = runInference(build(), { left: 1, centre: 8, right: 9 });
  const b = runInference(biasCap, { left: 1, centre: 8, right: 9 });
  assert.equal(a.decision, b.decision);
  assert.equal(a.abstained, b.abstained);
});
