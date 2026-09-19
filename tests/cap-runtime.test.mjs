// tests/cap-runtime.test.mjs — the City's .cap parser (Stage 1: display-only).
//
// Run: node --test tests/cap-runtime.test.mjs   (from the repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCapability, capabilityDescriptor, CAP_MAGIC } from '../P5 Programme/buddy-kit/client/city-common/cap-runtime.js';

/** A minimal valid numeric k-NN classifier bundle (shape from docs/capability-bridge.md). */
function validCap(overrides = {}) {
  return {
    magic: CAP_MAGIC,
    specVersion: 1,
    kind: 'classifier',
    id: 'cap_test_0001',
    revision: 3,
    name: 'Gate watcher',
    workshop: { appVersion: '0.9.2', graphName: 'Park gate sorter' },
    input: {
      kind: 'vector',
      fields: [
        { name: 'queueLength', type: 'float32', required: true },
        { name: 'tempC', type: 'float32', required: true },
      ],
      normalization: { type: 'minmax', epsilon: 1e-6, min: [0, 10], max: [50, 40] },
    },
    output: { kind: 'label', labels: ['open', 'hold'], abstainLabel: '__abstain' },
    model: {
      algorithm: 'knn-vector-classifier',
      k: 3, distance: 'euclidean', threshold: 0.62,
      vectors: { dtype: 'float32le', count: 2, dim: 2, data_b64: 'AAAAAABpQkAA' },
      labels: { dtype: 'uint16le', count: 2, data_b64: 'AAAAAA==' },
    },
    evaluation: {
      split: { study: 20, check: 6, sealed: 6 },
      scores: { study: 0.94, check: 0.75, sealed: 0.71 },
    },
    evidence: [
      { index: 0, id: 'ex_1', label: 'open', split: 'study', display: { queueLength: 8, tempC: 24 } },
      { index: 1, id: 'ex_2', label: 'hold', split: 'study', display: { queueLength: 36, tempC: 31 } },
    ],
    selftest: { cases: [] },
    city: { mount: 'park_gate_01', mapping: { open: {}, hold: {}, __abstain: {} } },
    ...overrides,
  };
}

test('accepts a valid numeric k-NN classifier bundle', () => {
  const r = parseCapability(JSON.stringify(validCap()));
  assert.equal(r.ok, true);
  assert.equal(r.capability.name, 'Gate watcher');
});

test('rejects wrong magic / version / kind / algorithm / missing threshold', () => {
  assert.equal(parseCapability('not json').ok, false);
  assert.equal(parseCapability(null).ok, false);
  assert.equal(parseCapability(validCap({ magic: 'other' })).ok, false);
  assert.equal(parseCapability(validCap({ specVersion: 9 })).ok, false);
  assert.equal(parseCapability(validCap({ kind: 'forecaster' })).ok, false, 'only classifier supported in v1');
  assert.equal(parseCapability(validCap({ model: { ...validCap().model, algorithm: 'neural-net' } })).ok, false);
  assert.equal(parseCapability(validCap({ model: { ...validCap().model, threshold: undefined } })).ok, false);
  assert.equal(parseCapability(validCap({ evaluation: null })).ok, false);
  assert.equal(parseCapability(validCap({ output: { kind: 'label' } })).ok, false, 'labels required');
});

test('capabilityDescriptor is display-safe and honest about Stage 1', () => {
  const { capability } = parseCapability(validCap());
  const d = capabilityDescriptor(capability);
  assert.equal(d.name, 'Gate watcher');
  assert.deepEqual(d.inputFields, ['queueLength', 'tempC']);
  assert.deepEqual(d.labels, ['open', 'hold']);
  assert.equal(d.threshold, 0.62);
  assert.equal(d.scores.sealed, 0.71);
  assert.equal(d.evidenceCount, 2);
  assert.equal(d.hasCityMapping, true);
  assert.equal(d.connected, false, 'Stage 1 must never claim it is governing');
});
