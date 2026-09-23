import test from 'node:test';
import assert from 'node:assert/strict';
import { readNewCityDraft, writeNewCityDraft, resetNewCityDraft } from '../P5 Programme/buddy-kit/client/city-common/new-city-draft.js';

test('new city draft is empty, survives reads, and resets independently', () => {
  const values = new Map();
  const storage = { getItem:key => values.get(key) ?? null, setItem:(key,value) => values.set(key,value) };
  const first = resetNewCityDraft(storage);
  assert.equal(first.buildings.length, 0);
  first.buildings.push({ type:'housing', pos:[200,200] });
  assert.equal(writeNewCityDraft(first, storage), true);
  assert.equal(readNewCityDraft(storage).buildings.length, 1);
  assert.equal(resetNewCityDraft(storage).buildings.length, 0);
  assert.equal(readNewCityDraft(storage).buildings.length, 0);
});
