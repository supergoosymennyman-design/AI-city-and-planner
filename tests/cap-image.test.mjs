// tests/cap-image.test.mjs
//
// Stage 4: the v2 IMAGE classifier contract. An image bundle is a v2 k-NN whose
// input is ONE pinned feature-extractor vector instead of named numeric fields.
// These tests pin the two things that make the recycling station honest:
//   • the extractor identity travels IN the bundle, so a mismatched extractor is
//     refused rather than silently compared;
//   • inference uses the same shared k-NN and sure line as the numeric path.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildImageCapabilityV2 } from '../P5 Programme/buddy-kit/client/city-common/capability-export.js';
import {
  parseCapability, capabilityDescriptor, runInference, runSelftest, installCapability,
  CAP_ABSTAIN, CAP_INPUT_IMAGE, CAP_ALGORITHM_V2, CAP_SPEC_VERSION_2,
} from '../P5 Programme/buddy-kit/client/city-common/cap-runtime.js';

const PRE = 'mobilenet-v3-small-224-squash-f32-unit-v1';
const DIM = 4; // a small synthetic width — the contract does not hard-code 1024

// Four orthogonal unit rows; a query equal to a row is distance 0 from it.
const basis = (i, n = DIM) => Array.from({ length: n }, (_, j) => (j === i ? 1 : 0));

const examples = [
  { label: 'red',  vector: basis(0) },
  { label: 'blue', vector: basis(1) },
];

function build(extra = {}) {
  const out = buildImageCapabilityV2({
    id: 'cap-image', name: 'Recycling sorter', labels: ['red', 'blue'],
    dimension: DIM, preprocessing: PRE, k: 1, threshold: 0.5, examples, ...extra,
  });
  assert.equal(out.ok, true, out.error);
  return out.capability;
}

test('an image bundle declares its pinned extractor and parses as v2', () => {
  const cap = build();
  assert.equal(cap.specVersion, CAP_SPEC_VERSION_2);
  assert.equal(cap.model.algorithm, CAP_ALGORITHM_V2);
  assert.equal(cap.input.kind, CAP_INPUT_IMAGE);
  assert.equal(cap.input.preprocessing, PRE);
  assert.equal(cap.input.dimension, DIM);
  const parsed = parseCapability(cap);
  assert.equal(parsed.ok, true, parsed.error);
  const descriptor = capabilityDescriptor(cap);
  assert.equal(descriptor.inputKind, CAP_INPUT_IMAGE);
  assert.equal(descriptor.preprocessing, PRE);
  assert.equal(descriptor.dimension, DIM);
  assert.deepEqual(descriptor.inputFields, [`image ×${DIM}`]);
});

test('the extractor identity is mandatory: a bundle without one is refused', () => {
  assert.equal(buildImageCapabilityV2({ id: 'x', name: 'x', labels: ['a', 'b'], dimension: DIM, examples }).ok, false);
  const cap = build();
  delete cap.input.preprocessing;
  const parsed = parseCapability(cap);
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /extractor/i);
});

test('a bad dimension is refused at publish and at parse', () => {
  assert.equal(buildImageCapabilityV2({ id: 'x', name: 'x', labels: ['a', 'b'], dimension: 0, preprocessing: PRE, examples }).ok, false);
  const cap = build();
  cap.input.dimension = 0;
  assert.equal(parseCapability(cap).ok, false);
});

test('an unknown input kind is refused rather than guessed', () => {
  const cap = build();
  cap.input.kind = 'lidar';
  const parsed = parseCapability(cap);
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /lidar/);
});

test('publish rejects an unknown label and a wrong-width vector', () => {
  const badLabel = buildImageCapabilityV2({
    id: 'x', name: 'x', labels: ['red', 'blue'], dimension: DIM, preprocessing: PRE,
    examples: [{ label: 'green', vector: basis(0) }],
  });
  assert.equal(badLabel.ok, false);
  assert.match(badLabel.error, /green/);
  const badWidth = buildImageCapabilityV2({
    id: 'x', name: 'x', labels: ['red', 'blue'], dimension: DIM, preprocessing: PRE,
    examples: [{ label: 'red', vector: basis(0, DIM + 1) }],
  });
  assert.equal(badWidth.ok, false);
  assert.match(badWidth.error, new RegExp(String(DIM)));
});

test('the self-test is the publish gate and re-runs stored study examples', () => {
  const cap = build();
  assert.equal(cap.selftest.cases.length, 2); // one reproducible case per label
  const installed = installCapability(cap);
  assert.equal(installed.ok, true);
  assert.equal(installed.installation.selftest.ok, true);
  // A bundle whose only claimed case cannot reproduce is refused outright.
  const broken = buildImageCapabilityV2({
    id: 'x', name: 'x', labels: ['red', 'blue'], dimension: DIM, preprocessing: PRE,
    examples, selftest: [{ name: 'lies', input: { studyIndex: 0 }, expect: { decision: 'blue' } }],
  });
  assert.equal(broken.ok, false);
  assert.match(broken.error, /reproduce/i);
});

test('inference accepts a {vector} event, a bare array, and a studyIndex replay', () => {
  const cap = build();
  const byWrap = runInference(cap, { vector: basis(0) });
  const byArray = runInference(cap, basis(1));
  const byIndex = runInference(cap, { studyIndex: 0 });
  assert.equal(byWrap.decision, 'red');
  assert.equal(byArray.decision, 'blue');
  assert.equal(byIndex.decision, 'red');
  assert.equal(byWrap.abstained, false);
  assert.equal(byWrap.confidence, 1);
});

test('missing, non-finite, or wrong-width vectors abstain honestly', () => {
  const cap = build();
  assert.equal(runInference(cap, {}).abstainReason, 'missing-fields');
  assert.equal(runInference(cap, null).abstainReason, 'missing-fields');
  assert.equal(runInference(cap, { vector: basis(0).map((v, i) => (i ? v : NaN)) }).abstainReason, 'missing-fields');
  assert.equal(runInference(cap, { vector: basis(0, DIM + 2) }).abstainReason, 'invalid-model');
});

test('a falsely claimed model width is treated as an invalid model, not compared on a prefix', () => {
  const cap = build();
  cap.model.vectors.dim = DIM + 3;
  assert.equal(runInference(cap, basis(0)).abstainReason, 'invalid-model');
});

test('the sure line abstains below the bundle threshold', () => {
  const strict = build({ threshold: 0.999 });
  const far = runInference(strict, { vector: basis(2) }); // orthogonal to every study row
  assert.equal(far.abstained, true);
  assert.equal(far.abstainReason, 'below-threshold');
  assert.equal(far.decision, CAP_ABSTAIN);
});

test('the self-test runner honours an expected abstention', () => {
  const cap = build({ threshold: 0.999, selftest: [{ name: 'far away', input: { vector: basis(3) }, expect: { decision: CAP_ABSTAIN } }] });
  assert.equal(runSelftest(cap).ok, true);
});

test('changing the study set changes the decision for the same input', () => {
  const a = build({ examples: [{ label: 'red', vector: basis(0) }, { label: 'blue', vector: basis(1) }] });
  const b = build({ examples: [{ label: 'red', vector: basis(1) }, { label: 'blue', vector: basis(0) }] });
  assert.equal(runInference(a, basis(0)).decision, 'red');
  assert.equal(runInference(b, basis(0)).decision, 'blue');
});
