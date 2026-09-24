// tests/workshop-publish.test.mjs
//
// Stage 4: the Workshop host seam that turns a placed library photo model into plain
// publish data. This is the bridge the recycling station depends on: the Workshop
// publishes, the City runs. It must read ONLY the shipped curated photos — a child's
// private/uploaded examples must never reach a published capability.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { buildImageCapabilityV2 } from '../P5 Programme/buddy-kit/client/city-common/capability-export.js';
import { parseCapability, installCapability } from '../P5 Programme/buddy-kit/client/city-common/cap-runtime.js';
import { checkCompatibility, RECYCLING_PREPROCESSING, RECYCLING_DIMENSION } from '../P5 Programme/buddy-kit/client/city-common/recycling.js';

const require = createRequire(import.meta.url);
const G = require('../P5 Programme/buddy-kit/client/workshop/game.js');
const Library = require('../P5 Programme/buddy-kit/client/workshop/logic/model-library.js');

// A 1024-dim unit vector that is 1 on one axis (a stand-in for a curated photo feature).
const axis = (i) => { const v = new Array(1024).fill(0); v[i] = 1; return v; };

/** A TrashNet k-NN library model exactly as the Workshop stores one on a sense piece. */
function photoModel(overrides = {}) {
  return {
    version: 1, id: 'trashnet-v1-knn-test', name: 'My sorter',
    dataset: 'trashnet-v1', preprocessing: Library.PHOTO_FEATURES, brain: 'knn',
    options: { k: 3, seed: 42 }, input: { id: 'trashnet-v1', features: Library.PHOTO_FEATURES, dimension: 1024 },
    trainingIds: ['cardboard1', 'cardboard10', 'glass1', 'glass10'],
    state: {
      shelves: {
        cardboard: [{ id: 'library:cardboard1', label: 'cardboard', vec: axis(0) }, { id: 'library:cardboard10', label: 'cardboard', vec: axis(1) }],
        glass: [{ id: 'library:glass1', label: 'glass', vec: axis(2) }, { id: 'library:glass10', label: 'glass', vec: axis(3) }],
      },
    },
    ...overrides,
  };
}
const piece = (libraryModel, extra = {}) => ({ id: 's1', type: 'sense', senseId: 'cam', libraryModel, ...extra });

test('the seam returns the placed photo model as publish data', () => {
  const table = { pieces: [piece(photoModel())], wires: [] };
  const model = G.publishImageModel(null, table);
  assert.ok(model);
  assert.equal(model.dataset, 'trashnet-v1');
  assert.equal(model.k, 3);
  assert.deepEqual(model.labels.sort(), ['cardboard', 'glass', 'metal', 'paper', 'plastic', 'trash']);
  assert.equal(model.examples.length, 4);
  assert.ok(model.examples.every((e) => e.vector.length === 1024 && model.labels.includes(e.label)));
  assert.equal(model.examples[0].source.id, 'library:cardboard1');
});

test('the seam can pick a specific model and otherwise returns the first photo model', () => {
  const a = piece(photoModel({ id: 'm-a' }), { id: 's-a' });
  const b = piece(photoModel({ id: 'm-b' }), { id: 's-b' });
  const table = { pieces: [a, b], wires: [] };
  assert.equal(G.publishImageModel(null, table).id, 'm-a');
  assert.equal(G.publishImageModel('m-b', table).id, 'm-b');
});

test('the seam ignores non-photo data models, non-sense pieces, and empty shelves', () => {
  const iris = { ...photoModel(), id: 'iris', dataset: 'iris-v1' };
  const beltBrain = { id: 's2', type: 'sense', senseId: 'cam' }; // no libraryModel (a belt-taught brain)
  const button = { id: 'b1', type: 'button' };
  const empty = piece(photoModel({ id: 'empty', state: { shelves: { cardboard: [] } } }));
  const table = { pieces: [iris, beltBrain, button, empty], wires: [] };
  assert.equal(G.publishImageModel(null, table), null);
  assert.equal(G.publishImageModel(null, { pieces: [] }), null);
  assert.equal(G.publishImageModel(null, undefined), null);
});

test('a model without a photo dataset is never mistaken for an image classifier', () => {
  const iris = { ...photoModel(), id: 'iris', dataset: 'iris-v1' };
  assert.equal(G.publishImageModel('iris', { pieces: [piece(iris)], wires: [] }), null);
});

test('the seam output builds an installable v2 image capability the City accepts', () => {
  const model = G.publishImageModel(null, { pieces: [piece(photoModel())], wires: [] });
  const out = buildImageCapabilityV2({
    id: model.id, name: model.name, labels: model.labels,
    preprocessing: RECYCLING_PREPROCESSING, dimension: RECYCLING_DIMENSION, k: model.k, threshold: 0.2,
    examples: model.examples.map((e) => ({ label: e.label, vector: e.vector, source: e.source })),
    workshop: { dataset: model.dataset },
  });
  assert.equal(out.ok, true, out.error);
  assert.equal(parseCapability(out.capability).ok, true);
  assert.equal(installCapability(out.capability).ok, true);
  assert.equal(checkCompatibility(out.capability).ok, true);
});
