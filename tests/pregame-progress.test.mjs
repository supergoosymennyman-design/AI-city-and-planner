// tests/pregame-progress.test.mjs — the Academy's versioned checkpoint must stay
// backward compatible with legacy flat saves and round-trip through the
// Champion File (no new localStorage key / CF_KEY).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHECKPOINT_KEY, CHECKPOINT_V, parseProgress, mergeProgress } from '../P5 Programme/buddy-kit/client/city-common/pregame-progress.js';
import { CF_KEYS } from '../P5 Programme/buddy-kit/client/city-common/champion-file.js';

const ROOMS = 4;

test('legacy flat saves are read as completed rooms (no checkpoint)', () => {
  const { completed, checkpoint } = parseProgress({ 1: true, 2: true, 4: false }, ROOMS);
  assert.deepEqual(completed, { 1: true, 2: true });
  assert.equal(checkpoint, null);
});

test('checkpoint is read back with room + hint levels', () => {
  const stored = { 1: true, [CHECKPOINT_KEY]: { v: CHECKPOINT_V, currentRoom: 2, hintLevel: { 2: 1 } } };
  const { completed, checkpoint } = parseProgress(stored, ROOMS);
  assert.deepEqual(completed, { 1: true });
  assert.deepEqual(checkpoint, { v: CHECKPOINT_V, currentRoom: 2, hintLevel: { 2: 1 } });
});

test('malformed values never produce impossible progress', () => {
  for (const raw of [null, undefined, 'nope', 42, [1, 2, 3], { 0: true, 99: true, x: true }]) {
    const { completed, checkpoint } = parseProgress(raw, ROOMS);
    assert.deepEqual(completed, {});
    assert.equal(checkpoint, null);
  }
  const { checkpoint } = parseProgress({ [CHECKPOINT_KEY]: { currentRoom: 99, hintLevel: 'bad', v: 'x' } }, ROOMS);
  assert.equal(checkpoint.currentRoom, null);
  assert.deepEqual(checkpoint.hintLevel, {});
  assert.equal(checkpoint.v, CHECKPOINT_V);
});

test('merge preserves other tabs\' completions and rewrites the checkpoint', () => {
  const base = { 2: true, [CHECKPOINT_KEY]: { v: 1, currentRoom: 2, hintLevel: {} } };
  const next = mergeProgress(base, { 1: true, 3: false }, { currentRoom: 3, hintLevel: { 3: 2 } });
  assert.equal(next[2], true, "another tab's Room 2 is preserved");
  assert.equal(next[1], true);
  assert.equal(next[3], undefined, 'falsy completion is not written');
  assert.deepEqual(next[CHECKPOINT_KEY], { v: CHECKPOINT_V, currentRoom: 3, hintLevel: { 3: 2 } });
  // Round-trips through the parser unchanged.
  const { completed, checkpoint } = parseProgress(next, ROOMS);
  assert.deepEqual(completed, { 1: true, 2: true });
  assert.deepEqual(checkpoint, { v: CHECKPOINT_V, currentRoom: 3, hintLevel: { 3: 2 } });
});

test('checkpoint uses a reserved non-numeric key inside the existing pregame CF_KEY', () => {
  assert.equal(CF_KEYS.pregame, 'p5_pregame_progress');
  assert.ok(Number.isNaN(Number(CHECKPOINT_KEY)), '__checkpoint is not a room number');
  const next = mergeProgress({}, {}, null);
  assert.deepEqual(Object.keys(next), [CHECKPOINT_KEY], 'no new top-level keys beyond rooms + __checkpoint');
  assert.equal(next[CHECKPOINT_KEY].currentRoom, null);
});
