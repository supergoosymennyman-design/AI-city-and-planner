import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  createBrain as sharedCreate, addExample as sharedAdd, classify as sharedClassify,
  kVoters as sharedKVoters, unitVec, numberVec, surenessOf,
} from '../P5 Programme/buddy-kit/client/city-common/knn-vector.js';

const require = createRequire(import.meta.url);
// The Workshop's own classifier, loaded exactly as the app ships it.
const Brain = require('../P5 Programme/buddy-kit/client/workshop/logic/brain.js');

// Deterministic RNG so a failure is reproducible.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pairUp(examples) {
  const a = Brain.createBrain();
  const b = sharedCreate();
  for (const ex of examples) {
    Brain.addExample(a, ex.label, ex.vec, ex.display);
    sharedAdd(b, ex.label, ex.vec, ex.display);
  }
  return { a, b };
}

function sameResult(workshop, shared) {
  if (workshop === null || shared === null) return workshop === shared;
  assert.equal(shared.label, workshop.label);
  assert.equal(shared.value, workshop.value);
  assert.equal(shared.evidence.length, workshop.evidence.length);
  for (let i = 0; i < workshop.evidence.length; i++) {
    assert.equal(shared.evidence[i].id, workshop.evidence[i].id);
    assert.equal(shared.evidence[i].label, workshop.evidence[i].label);
    assert.equal(shared.evidence[i].distance, workshop.evidence[i].distance);
  }
  return true;
}

test('the shared k-NN agrees with the Workshop brain on a seeded grid', () => {
  const rnd = mulberry32(20260924);
  const dim = 6;
  const labels = ['red', 'green', 'blue', 'up', 'down'];
  const examples = [];
  for (let i = 0; i < 60; i++) {
    const raw = Array.from({ length: dim }, () => rnd() * 2 - 1);
    examples.push({ label: labels[i % labels.length], vec: unitVec(raw), display: `ex${i}` });
  }
  const { a, b } = pairUp(examples);
  const ks = [undefined, 0, 0.4, 1, 2, 3, 5, 12, -3];
  for (let q = 0; q < 200; q++) {
    const query = unitVec(Array.from({ length: dim }, () => rnd() * 2 - 1));
    for (const k of ks) {
      assert.ok(sameResult(Brain.classify(a, query, k), sharedClassify(b, query, k)), `k=${k}`);
    }
  }
});

test('distance ties break by example id and vote ties by the nearer voter, identically', () => {
  // Two identical vectors at equal distance: workshop sorts by id ascending.
  const examples = [
    { label: 'left', vec: [1, 0], display: 'L' },
    { label: 'right', vec: [1, 0], display: 'R' },
    { label: 'far', vec: [0, 1], display: 'F' },
  ];
  const { a, b } = pairUp(examples);
  const query = [1, 0];
  for (const k of [2, 3, 1]) {
    assert.ok(sameResult(Brain.classify(a, query, k), sharedClassify(b, query, k)), `k=${k}`);
  }
  // A clean 1-1-1 vote tie must resolve to the nearer voter in both.
  const tie = [
    { label: 'a', vec: [1, 0.0], display: 'A' },
    { label: 'b', vec: [1, 5], display: 'B' },
    { label: 'c', vec: [1, 9], display: 'C' },
  ];
  const { a: ta, b: tb } = pairUp(tie);
  assert.ok(sameResult(Brain.classify(ta, [1, 0], 3), sharedClassify(tb, [1, 0], 3)));
});

test('an empty brain says nothing in both implementations', () => {
  assert.equal(Brain.classify(Brain.createBrain(), [1, 2], 3), null);
  assert.equal(sharedClassify(sharedCreate(), [1, 2], 3), null);
});

test('the shared helpers match the Workshop host conventions', () => {
  // kVoters is the single definition of voter count.
  for (const [k, n] of [[0, 5], [0.4, 5], [3, 2], [-1, 4], [undefined, 3], [10, 4]]) {
    assert.equal(sharedKVoters(k, n), Brain.kVoters(k, n), `kVoters(${k},${n})`);
  }
  // numberVec appends the bias constant then unit-normalizes.
  assert.deepEqual(numberVec([3, 4], 10), unitVec([3, 4, 10]));
  // sureness = 1 − d²/2 on unit vectors; identical vectors are fully sure.
  assert.equal(sharedClassify((() => { const br = sharedCreate(); sharedAdd(br, 'x', [1, 0], 'x'); return br; })(), [1, 0], 3).value, 1);
  assert.equal(surenessOf({ value: 1, evidence: [{ distance: 0 }] }), 1);
  assert.ok(Math.abs(surenessOf({ value: 0.5, evidence: [{ distance: Math.SQRT2 }] })) < 1e-12);
});
