import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultLayout } from '../P5 Programme/buddy-kit/client/city-common/layout.js';
import { CF_KEYS } from '../P5 Programme/buddy-kit/client/city-common/champion-file.js';
import { createProjectStateCoordinator, PROJECT_CHANGE_EVENT } from '../P5 Programme/buddy-kit/client/city-common/project-state-coordinator.js';

function fakeStorage(initial = {}, failOn = null) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem(key, value) {
      if (key === failOn) throw new Error('quota exceeded');
      values.set(key, String(value));
    },
    removeItem: key => values.delete(key),
    values,
  };
}

test('transactional commit validates before changing storage', () => {
  const old = JSON.stringify(defaultLayout());
  const storage = fakeStorage({ [CF_KEYS.layout]: old });
  const coordinator = createProjectStateCoordinator({ storage, eventTarget: null });
  const result = coordinator.commit({ layout: '{bad json' }, { source: 'test' });
  assert.equal(result.ok, false);
  assert.equal(storage.getItem(CF_KEYS.layout), old);
});

test('a failed multi-section commit rolls every written section back', () => {
  const oldLayout = JSON.stringify(defaultLayout());
  const storage = fakeStorage({ [CF_KEYS.layout]: oldLayout, [CF_KEYS.props]: 'old props' }, CF_KEYS.props);
  const coordinator = createProjectStateCoordinator({ storage, eventTarget: null });
  const nextLayout = { ...defaultLayout(), name: 'New city' };
  const result = coordinator.commit({ layout: JSON.stringify(nextLayout), props: 'new props' }, { source: 'import' });
  assert.equal(result.ok, false);
  assert.deepEqual(result.rollbackFailed, []);
  assert.equal(storage.getItem(CF_KEYS.layout), oldLayout);
  assert.equal(storage.getItem(CF_KEYS.props), 'old props');
});

test('successful commit emits one project change after all writes', () => {
  const storage = fakeStorage();
  const events = [];
  const eventTarget = { dispatchEvent: event => events.push(event) };
  const coordinator = createProjectStateCoordinator({ storage, eventTarget, now: () => '2026-09-21T00:00:00.000Z' });
  const result = coordinator.commit({ layout: JSON.stringify(defaultLayout()), props: '[]' }, { source: 'planner' });
  assert.equal(result.ok, true);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, PROJECT_CHANGE_EVENT);
  assert.deepEqual(events[0].detail.keys, ['layout', 'props']);
  assert.equal(storage.getItem(CF_KEYS.props), '[]');
});
