// tests/cap-inference.test.mjs — the numeric k-NN runtime + self-test gate.
//
// Run: node --test tests/cap-inference.test.mjs   (from the repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInference, runSelftest, CAP_ABSTAIN, CAP_MAGIC } from '../P5 Programme/buddy-kit/client/city-common/cap-runtime.js';

/** 1-dim study set: vector 0 → "open" at 0.0, vector 1 → "hold" at 1.0. */
function base64F32(values) {
  const buf = new ArrayBuffer(values.length * 4);
  const dv = new DataView(buf);
  values.forEach((v, i) => dv.setFloat32(i * 4, v, true));
  const u8 = new Uint8Array(buf);
  let s = '';
  for (const b of u8) s += String.fromCharCode(b);
  return typeof btoa === 'function' ? btoa(s) : Buffer.from(u8).toString('base64');
}
function base64U16(values) {
  const buf = new ArrayBuffer(values.length * 2);
  const dv = new DataView(buf);
  values.forEach((v, i) => dv.setUint16(i * 2, v, true));
  const u8 = new Uint8Array(buf);
  let s = '';
  for (const b of u8) s += String.fromCharCode(b);
  return typeof btoa === 'function' ? btoa(s) : Buffer.from(u8).toString('base64');
}

function cap1d(overrides = {}) {
  return {
    magic: CAP_MAGIC, specVersion: 1, kind: 'classifier', id: 'cap_knn_1', name: '1D sorter',
    input: { kind: 'vector', fields: [{ name: 'x', type: 'float32', required: true }], normalization: { type: 'minmax', epsilon: 1e-6, min: [0], max: [1] } },
    output: { kind: 'label', labels: ['open', 'hold'], abstainLabel: CAP_ABSTAIN },
    model: {
      algorithm: 'knn-vector-classifier', k: 1, epsilon: 1e-6, threshold: 0.62, tiePolicy: 'abstain', tieEpsilon: 0.05,
      vectors: { dtype: 'float32le', count: 2, dim: 1, data_b64: base64F32([0, 1]) },
      labels: { dtype: 'uint16le', count: 2, data_b64: base64U16([0, 1]) },
    },
    evaluation: { scores: { study: 1, check: 0.5, sealed: 0.5 } },
    evidence: [], selftest: { cases: [] },
    ...overrides,
  };
}

test('k-NN decision: x=0.1 → nearest study vector 0.0 → "open", high confidence', () => {
  const r = runInference(cap1d(), { x: 0.1 });
  assert.equal(r.abstained, false);
  assert.equal(r.decision, 'open');
  assert.ok(r.confidence > 0.95, `confidence ${r.confidence}`);
});

test('abstains on a tie between labels (tie policy)', () => {
  // k=2, threshold disabled: at x=0.5 the two study vectors are equidistant →
  // equal votes → tie policy abstains.
  const cap = cap1d({ model: { ...cap1d().model, k: 2, threshold: 0.0, tiePolicy: 'abstain', tieEpsilon: 0.05 } });
  const r = runInference(cap, { x: 0.5 });
  assert.equal(r.abstained, true);
  assert.equal(r.abstainReason, 'tie');
});

test('abstains below the confidence threshold', () => {
  // k=2 at x=0.5 with tie policy disabled (tieEpsilon 0): equal votes →
  // confidence 0.5 < 0.62 → below-threshold.
  const cap = cap1d({ model: { ...cap1d().model, k: 2, threshold: 0.62, tiePolicy: 'abstain', tieEpsilon: 0.0 } });
  const r = runInference(cap, { x: 0.5 });
  assert.equal(r.abstained, true);
  assert.equal(r.abstainReason, 'below-threshold');
});

test('abstains on a missing / non-finite field', () => {
  const r = runInference(cap1d(), {});
  assert.equal(r.abstained, true);
  assert.equal(r.abstainReason, 'missing-fields');
  assert.equal(runInference(cap1d(), { x: 'hot' }).abstainReason, 'missing-fields');
});

test('abstains when the nearest neighbour is too far (maxNearestDistance)', () => {
  // One study vector at 0.5; event at 0.0 → distance 0.5 > 0.2 → too-far.
  const cap = cap1d({
    model: { ...cap1d().model, k: 1, maxNearestDistance: 0.2, threshold: 0.0 },
    input: { ...cap1d().input },
  });
  cap.model.vectors.data_b64 = base64F32([0.5]);
  cap.model.labels.data_b64 = base64U16([0]);
  cap.model.vectors.count = 1; cap.model.labels.count = 1;
  const r = runInference(cap, { x: 0 });
  assert.equal(r.abstained, true);
  assert.equal(r.abstainReason, 'too-far');
});

test('evidence returns the nearest study examples with distances', () => {
  const r = runInference(cap1d(), { x: 0.1 });
  assert.ok(r.evidence.length >= 1);
  assert.equal(r.evidence[0].label, 'open');
  assert.equal(typeof r.evidence[0].distance, 'number');
});

test('runSelftest passes a correct bundle and fails a lying one', () => {
  const good = cap1d({ selftest: { cases: [
    { name: 'near open', input: { x: 0.1 }, expect: { decision: 'open', minConfidence: 0.5 } },
    { name: 'abstain on missing', input: {}, expect: { decision: CAP_ABSTAIN } },
  ] } });
  assert.equal(runSelftest(good).ok, true);

  const lying = cap1d({ selftest: { cases: [
    { name: 'claims hold at 0.1', input: { x: 0.1 }, expect: { decision: 'hold' } },
  ] } });
  const bad = runSelftest(lying);
  assert.equal(bad.ok, false);
  assert.ok(bad.failures.length >= 1);
});

test('a bundle with no selftest cases cannot go live', () => {
  const r = runSelftest(cap1d());
  assert.equal(r.ok, false);
});
