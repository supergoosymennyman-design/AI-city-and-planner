// tests/recycling.test.mjs
//
// Stage 4: the recycling station's two laws.
//   1. The PREDICTION selects the bin. Ground truth rides along for SCORING only
//      and never routes — a wrong prediction visibly enters the wrong bin.
//   2. Changing the student's published model changes the observed sorting.
//
// Geometry note: the v2 sure line is `1 − d²/2`, so a threshold of `t` admits
// neighbours with `d ≤ sqrt(2(1−t))`. In 1024-dim the same-class median distance
// is ~1.23 and cross-class ~1.35, so real-feature bundles are built with a tuned
// threshold; the synthetic 4-dim bundles below use exact geometry.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildImageCapabilityV2 } from '../P5 Programme/buddy-kit/client/city-common/capability-export.js';
import {
  BINS, BIN_FOR_LABEL, RECYCLING_PREPROCESSING, RECYCLING_DIMENSION, CONFUSING_LABELS,
  checkCompatibility, routeDecision, routeItem, runConveyor, scoreRun, selectItems, setSizeFor,
} from '../P5 Programme/buddy-kit/client/city-common/recycling.js';
import { examplesFor, trashnetCatalogue } from './helpers/workshop-features.mjs';

const DIM = 4;
const basis = (i, n = DIM) => Array.from({ length: n }, (_, j) => (j === i ? 1 : 0));

// Two synthetic image bundles over the SAME labels but SWAPPED study rows, so a
// query lands in a different bin under each. Small width keeps the geometry exact.
function imageCap({ id = 'cap-a', cardboard = basis(0), glass = basis(1), threshold = 0.5 } = {}) {
  const out = buildImageCapabilityV2({
    id, name: id, labels: ['cardboard', 'glass'], dimension: DIM,
    preprocessing: RECYCLING_PREPROCESSING, k: 1, threshold,
    examples: [{ label: 'cardboard', vector: cardboard }, { label: 'glass', vector: glass }],
  });
  assert.equal(out.ok, true, out.error);
  return out.capability;
}

test('compatibility rejects a mismatched extractor, dimension, or non-image bundle', () => {
  const good = imageCap();
  assert.equal(checkCompatibility(good, { dimension: DIM }).ok, true);
  assert.equal(checkCompatibility(good, { dimension: RECYCLING_DIMENSION }).error, 'incompatible-dimension');

  const wrongPre = imageCap({ id: 'cap-b' });
  wrongPre.input.preprocessing = 'some-other-extractor-v9';
  assert.equal(checkCompatibility(wrongPre).error, 'incompatible-preprocessing');

  assert.equal(checkCompatibility({ input: { kind: 'vector', fields: [] } }).error, 'not-an-image-classifier');
  assert.equal(checkCompatibility(null).error, 'missing-capability');
});

test('routeDecision sends an unknown or abstained answer to the human-check tray', () => {
  assert.deepEqual(routeDecision('glass', false), { category: 'glass', bin: BIN_FOR_LABEL.glass });
  assert.deepEqual(routeDecision('__abstain', true), { category: '__abstain', bin: 'human-check' });
  // An abstain flag wins even if a label slipped through; an unknown label is honest too.
  assert.equal(routeDecision('glass', true).bin, 'human-check');
  assert.equal(routeDecision('unicorn', false).bin, 'human-check');
});

test('the PREDICTION selects the bin — ground truth never routes', () => {
  const cap = imageCap();
  // The model predicts "cardboard" but the crate's truth is "glass".
  const result = routeItem(cap, { id: 'item-1', label: 'glass', vector: basis(0) });
  assert.equal(result.decision, 'cardboard');
  assert.equal(result.bin, 'bin-cardboard');
  assert.equal(result.truth, 'glass');
  assert.equal(result.routedBy, 'prediction');
});

test('changing only the ground-truth labels never changes any routing', () => {
  const cap = imageCap();
  const vectors = [basis(0), basis(1), basis(2)];
  const truthsA = ['cardboard', 'glass', 'paper'];
  const truthsB = ['glass', 'cardboard', 'trash'];
  const runA = runConveyor(cap, vectors.map((v, i) => ({ id: `i${i}`, label: truthsA[i], vector: v })));
  const runB = runConveyor(cap, vectors.map((v, i) => ({ id: `i${i}`, label: truthsB[i], vector: v })));
  assert.deepEqual(runA.map((r) => [r.decision, r.bin]), runB.map((r) => [r.decision, r.bin]));
  assert.notDeepEqual(runA.map((r) => r.truth), runB.map((r) => r.truth));
});

test('an abstention goes to the human-check tray, not a guessed bin', () => {
  const strict = imageCap({ threshold: 0.999 });
  const result = routeItem(strict, { id: 'x', label: 'cardboard', vector: basis(2) });
  assert.equal(result.abstained, true);
  assert.equal(result.abstainReason, 'below-threshold');
  assert.equal(result.decision, '__abstain');
  assert.equal(result.bin, 'human-check');
});

test('changing the model changes the observed sorting of the same items', () => {
  const a = imageCap({ id: 'cap-left' });                                   // cardboard = basis0
  const b = imageCap({ id: 'cap-right', cardboard: basis(1), glass: basis(0) }); // swapped
  const items = [{ id: 'can', label: 'glass', vector: basis(0) }];
  const ra = routeItem(a, items[0]);
  const rb = routeItem(b, items[0]);
  assert.equal(ra.bin, 'bin-cardboard');
  assert.equal(rb.bin, 'bin-glass');
  assert.notEqual(ra.bin, rb.bin);
  // …and neither one moved because of the crate's ground truth.
  assert.equal(ra.truth, rb.truth);
});

test('scoreRun reports correct/wrong/abstained against truth without touching routing', () => {
  const cap = imageCap();
  const results = runConveyor(cap, [
    { id: 'right', label: 'cardboard', vector: basis(0) }, // predicts cardboard → correct
    { id: 'wrong', label: 'cardboard', vector: basis(1) }, // predicts glass → wrong
    { id: 'unsure', label: 'glass', vector: basis(2) },    // abstains → human-check
  ]);
  const binsBefore = results.map((r) => r.bin);
  const score = scoreRun(results);
  assert.deepEqual({ total: score.total, correct: score.correct, wrong: score.wrong, abstained: score.abstained, humanChecked: score.humanChecked },
    { total: 3, correct: 1, wrong: 1, abstained: 1, humanChecked: 1 });
  assert.equal(score.accuracy, Math.round((1 / 3) * 1000) / 1000);
  assert.deepEqual(results.map((r) => r.bin), binsBefore, 'scoring must not re-route');
});

test('every result bin is exactly the bin its decision names (or the tray)', () => {
  const cap = imageCap({ threshold: 0.2 });
  const results = runConveyor(cap, [basis(0), basis(1), basis(2), basis(0, 8)].map((v, i) => ({ id: `i${i}`, label: 'glass', vector: v })));
  for (const r of results) {
    if (r.abstained) assert.equal(r.bin, 'human-check');
    else assert.equal(r.bin, BIN_FOR_LABEL[r.decision]);
  }
  assert.equal(BINS.find((b) => b.id === 'human-check').label, '__abstain');
});

test('selectItems is fixed-seed deterministic and kind-aware', () => {
  const rows = trashnetCatalogue().photos;
  const a = selectItems(rows, { seed: 7, kind: 'normal', count: 8 });
  const b = selectItems(rows, { seed: 7, kind: 'normal', count: 8 });
  assert.deepEqual(a.map((r) => r.id), b.map((r) => r.id));
  assert.ok(a.length > 0 && a.length <= 8);

  const confusing = selectItems(rows, { seed: 3, kind: 'confusing', count: 6 });
  assert.ok(confusing.length > 0);
  assert.ok(confusing.every((r) => CONFUSING_LABELS.includes(r.label)));

  // Unfamiliar = classes this model was never taught.
  const taught = ['cardboard', 'glass', 'metal', 'paper', 'plastic'];
  const unfamiliar = selectItems(rows, { seed: 5, kind: 'unfamiliar', count: 6, modelLabels: taught });
  assert.ok(unfamiliar.length > 0);
  assert.ok(unfamiliar.every((r) => !taught.includes(r.label)));

  // Teaching every class falls back to the mixed "trash" class rather than inventing one.
  const fallback = selectItems(rows, { seed: 5, kind: 'unfamiliar', count: 6, modelLabels: [...taught, 'trash'] });
  assert.ok(fallback.every((r) => r.label === 'trash'));

  assert.equal(selectItems([], { seed: 1 }).length, 0);
  assert.equal(setSizeFor('normal'), 8);
  assert.equal(setSizeFor('confusing'), 6);
});

test('the real curated TrashNet features load and route by prediction', () => {
  const labels = ['cardboard', 'glass', 'metal', 'paper', 'plastic', 'trash'];
  const train = examplesFor(labels, 'train', 16);
  const out = buildImageCapabilityV2({
    id: 'cap_trashnet', name: 'Trash sorter', labels,
    preprocessing: RECYCLING_PREPROCESSING, dimension: RECYCLING_DIMENSION, k: 3, threshold: 0.2,
    examples: train.map((e) => ({ label: e.label, vector: e.vector })),
  });
  assert.equal(out.ok, true, out.error);
  assert.equal(checkCompatibility(out.capability).ok, true);

  const test = examplesFor(labels, 'test', 1);
  const results = runConveyor(out.capability, test.map((e) => ({ id: e.row.id, label: e.label, vector: e.vector })));
  assert.equal(results.length, test.length);
  assert.ok(scoreRun(results).answered >= 1, 'a trained model should make at least one non-abstained call');
  for (const r of results) {
    assert.equal(r.routedBy, 'prediction');
    assert.equal(r.bin, r.abstained ? 'human-check' : BIN_FOR_LABEL[r.decision]);
  }
});
