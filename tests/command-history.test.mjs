import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommandHistory, createSnapshotHistory } from '../P5 Programme/buddy-kit/client/city-common/command-history.js';

test('command history executes, undoes and redoes while clearing the redo branch', () => {
  let value = 0;
  const history = createCommandHistory({ limit: 50 });
  const add = amount => ({ execute: () => { value += amount; }, undo: () => { value -= amount; } });
  history.execute(add(2));
  history.execute(add(3));
  assert.equal(value, 5);
  assert.equal(history.undo().ok, true);
  assert.equal(value, 2);
  assert.equal(history.redo().ok, true);
  assert.equal(value, 5);
  history.undo();
  history.execute(add(7));
  assert.equal(value, 9);
  assert.equal(history.canRedo, false);
});

test('command history is bounded to fifty commands', () => {
  let value = 0;
  const history = createCommandHistory({ limit: 50 });
  for (let i = 0; i < 75; i++) history.execute({ execute: () => value++, undo: () => value-- });
  assert.equal(history.size, 50);
  for (let i = 0; i < 50; i++) assert.equal(history.undo().ok, true);
  assert.equal(value, 25);
  assert.equal(history.undo().ok, false);
});

test('snapshot adapter groups a mutation and restores it in both directions', () => {
  let state = { items: [] };
  const history = createSnapshotHistory({
    snapshot: () => state,
    restore: next => { state = next; },
  });
  history.capture();
  state.items.push('tree');
  assert.equal(history.undo().ok, true);
  assert.deepEqual(state, { items: [] });
  assert.equal(history.redo().ok, true);
  assert.deepEqual(state, { items: ['tree'] });
});

test('snapshot finalisation does not replace live references in an already-applied edit', () => {
  let state = { item: { x: 0 } };
  const history = createSnapshotHistory({ snapshot: () => state, restore: next => { state = next; } });
  history.capture();
  state.item.x = 1;
  const live = state.item;
  history.capture();
  live.x = 2;
  assert.equal(state.item.x, 2);
  history.undo();
  assert.equal(state.item.x, 1);
});

test('snapshot history advertises undo as soon as a gesture begins', () => {
  let value = 0, status;
  const history = createSnapshotHistory({ snapshot: () => value, restore: next => { value = next; }, onChange: next => { status = next; } });
  history.capture();
  assert.equal(status.canUndo, true);
  value = 1;
  assert.equal(history.undo().ok, true);
  assert.equal(value, 0);
});
