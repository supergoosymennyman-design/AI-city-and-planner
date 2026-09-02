// tests/champ-recipe.test.mjs — the `.champ` champion recipe parser (handoff side).
//
// Run: node --test tests/champ-recipe.test.mjs   (from the repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChampRecipe, champSummary, CHAMP_MAGIC } from '../P5 Programme/buddy-kit/client/city-common/champ-recipe.js';

function validRecipe(overrides = {}) {
  return {
    magic: CHAMP_MAGIC, specVersion: 1, name: 'Boxy',
    parts: [
      { id: 'body', shape: 'box', w: 0.6, h: 0.7, d: 0.4, x: 0, y: 1.0, z: 0 },
      { id: 'head', shape: 'box', w: 0.4, h: 0.4, d: 0.4, x: 0, y: 1.8, z: 0 },
    ],
    rig: { kind: '2-leg', gait: 'walk' },
    gear: [{ socket: 'head', item: 'premade:helmet_04' }],
    ...overrides,
  };
}

test('accepts a valid recipe and summarises it', () => {
  const r = parseChampRecipe(JSON.stringify(validRecipe()));
  assert.equal(r.ok, true);
  const s = champSummary(r.recipe);
  assert.equal(s.name, 'Boxy');
  assert.equal(s.parts, 2);
  assert.deepEqual(s.shapes, ['box']);
  assert.equal(s.rig, '2-leg');
  assert.equal(s.gait, 'walk');
  assert.equal(s.gearCount, 1);
});

test('rejects bad magic / version / empty or duplicate parts / bad shapes or dims', () => {
  assert.equal(parseChampRecipe('nope').ok, false);
  assert.equal(parseChampRecipe(validRecipe({ magic: 'other' })).ok, false);
  assert.equal(parseChampRecipe(validRecipe({ specVersion: 7 })).ok, false);
  assert.equal(parseChampRecipe(validRecipe({ parts: [] })).ok, false);
  assert.equal(parseChampRecipe(validRecipe({ parts: [validRecipe().parts[0], validRecipe().parts[0]] })).ok, false, 'duplicate ids');
  assert.equal(parseChampRecipe(validRecipe({ parts: [{ id: 'a', shape: 'torus', w: 1, h: 1, d: 1, x: 0, y: 0, z: 0 }] })).ok, false, 'unknown shape');
  assert.equal(parseChampRecipe(validRecipe({ parts: [{ id: 'a', shape: 'box', w: 0, h: 1, d: 1, x: 0, y: 0, z: 0 }] })).ok, false, 'non-positive dim');
  assert.equal(parseChampRecipe(validRecipe({ rig: { kind: 'wheeled' } })).ok, false, 'unknown rig');
});

test('rejects premade gear that is not in the shared library', () => {
  const r = parseChampRecipe(validRecipe({ gear: [{ socket: 'head', item: 'premade:not-a-real-gear' }] }));
  assert.equal(r.ok, false);
});

test('custom (non-premade) gear is allowed — it is the Hunyuan hardcore path', () => {
  const r = parseChampRecipe(validRecipe({ gear: [{ socket: 'head', item: 'custom:my-helmet' }] }));
  assert.equal(r.ok, true);
  assert.deepEqual(champSummary(r.recipe).customGear, ['custom:my-helmet']);
});
