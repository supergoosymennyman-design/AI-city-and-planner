// tests/buddy-logic.test.mjs — pure buddy-kit logic: memory meter + action schema.
//
// Run: node --test tests/buddy-logic.test.mjs   (from the repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { meterFrom } from '../P5 Programme/buddy-kit/logic/meter.js';
import { validateAction, OPS } from '../P5 Programme/buddy-kit/logic/action-schema.js';

// ── meterFrom ────────────────────────────────────────────────────────────────
test('meterFrom reads the LAST assistant token total and sums cost', () => {
  const messages = [
    { role: 'user', text: 'hi' },
    { role: 'assistant', tokens: { total: 100 }, cost: 0.01 },
    { role: 'user', text: 'more' },
    { role: 'assistant', tokens: { total: 250 }, cost: 0.02 },
  ];
  const m = meterFrom(messages, 1000);
  assert.equal(m.total, 250);
  assert.equal(m.cost, 0.03);
  assert.equal(m.usage, 25);
  assert.equal(m.limit, 1000);
});

test('meterFrom returns 0/null gracefully on empty or unknown-limit input', () => {
  const m = meterFrom([], null);
  assert.equal(m.total, 0);
  assert.equal(m.cost, 0);
  assert.equal(m.usage, null);
  assert.equal(m.limit, null);
  assert.equal(meterFrom(undefined, 100).total, 0);
});

// ── validateAction ───────────────────────────────────────────────────────────
const manifest = {
  params: [{ name: 'threshold', min: 0, max: 1 }],
  slots: [
    { name: 'groups', grouped: true },
    { name: 'items', grouped: false },
  ],
  checks: [{ name: 'accuracy' }],
};

test('OPS is exactly the seven bounded verbs', () => {
  assert.deepEqual([...OPS].sort(), ['addItems', 'createGroup', 'rememberUser', 'removeItems', 'runCheck', 'setParam', 'undoLast']);
});

test('setParam validates range against the manifest', () => {
  assert.equal(validateAction({ op: 'setParam', name: 'threshold', value: 0.5 }, manifest).ok, true);
  assert.equal(validateAction({ op: 'setParam', name: 'threshold', value: 1.5 }, manifest).ok, false);
  assert.equal(validateAction({ op: 'setParam', name: 'nope', value: 0.5 }, manifest).ok, false);
  assert.equal(validateAction({ op: 'setParam', name: 'threshold', value: 'high' }, manifest).ok, false);
});

test('createGroup requires a declared grouped slot and a name', () => {
  assert.equal(validateAction({ op: 'createGroup', slot: 'groups', name: 'Metal' }, manifest).ok, true);
  assert.equal(validateAction({ op: 'createGroup', slot: 'items', name: 'Metal' }, manifest).ok, false, 'flat slot is not groupable');
  assert.equal(validateAction({ op: 'createGroup', slot: 'groups', name: '' }, manifest).ok, false);
  assert.equal(validateAction({ op: 'createGroup', slot: 'groups', name: 'x'.repeat(41) }, manifest).ok, false);
});

test('addItems/removeItems enforce group rules and non-empty ids', () => {
  assert.equal(validateAction({ op: 'addItems', slot: 'items', ids: ['a'] }, manifest).ok, true);
  assert.equal(validateAction({ op: 'addItems', slot: 'items', ids: ['a'], group: 'Metal' }, manifest).ok, false, 'flat slot rejects group');
  assert.equal(validateAction({ op: 'addItems', slot: 'groups', ids: ['a'], group: 'Metal' }, manifest).ok, true);
  assert.equal(validateAction({ op: 'addItems', slot: 'groups', ids: ['a'] }, manifest).ok, false, 'grouped slot requires group');
  assert.equal(validateAction({ op: 'addItems', slot: 'items', ids: [] }, manifest).ok, false);
});

test('runCheck / undoLast / rememberUser / unknown op', () => {
  assert.equal(validateAction({ op: 'runCheck', name: 'accuracy' }, manifest).ok, true);
  assert.equal(validateAction({ op: 'runCheck', name: 'nope' }, manifest).ok, false);
  assert.equal(validateAction({ op: 'undoLast' }, manifest).ok, true);
  assert.equal(validateAction({ op: 'rememberUser', note: 'likes blue' }, manifest).ok, true);
  assert.equal(validateAction({ op: 'rememberUser' }, manifest).ok, false);
  assert.equal(validateAction({ op: 'flyAway' }, manifest).ok, false);
  assert.equal(validateAction(null, manifest).ok, false);
});

test('null/garbage manifest never throws (declares nothing)', () => {
  assert.equal(validateAction({ op: 'undoLast' }, null).ok, true);
  assert.equal(validateAction({ op: 'setParam', name: 'x', value: 1 }, null).ok, false);
  assert.doesNotThrow(() => validateAction({ op: 'createGroup', slot: 's', name: 'n' }, 'garbage'));
});
