// tests/badges.test.mjs — the Inspector's badge model (retroactive diploma).
//
// Run: node --test tests/badges.test.mjs   (from the repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultBadgeState, sanitizeBadges, readBadges, writeBadges, tierOf, promote, BADGES_KEY } from '../P5 Programme/buddy-kit/client/city-common/badges.js';

function fakeStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

test('default state is Builder (lowest tier) with no earned badges', () => {
  const s = defaultBadgeState();
  assert.equal(s.tier, 'builder');
  assert.deepEqual(s.earned, []);
  assert.equal(tierOf(s).name, 'Builder');
});

test('sanitizeBadges never throws and recovers from garbage', () => {
  assert.equal(sanitizeBadges(null).tier, 'builder');
  assert.equal(sanitizeBadges('junk').tier, 'builder');
  assert.equal(sanitizeBadges([]).tier, 'builder');
  assert.equal(sanitizeBadges({ tier: 'not-a-tier' }).tier, 'builder');
  assert.equal(sanitizeBadges({ tier: 'architect', earned: [{ id: 'architect' }] }).tier, 'architect');
  assert.equal(sanitizeBadges({ tier: 'architect', earned: [{ id: 'junk' }, { id: 'skeptic' }] }).earned.length, 1);
});

test('readBadges/writeBadges round-trip through storage', () => {
  const storage = fakeStorage();
  writeBadges({ tier: 'skeptic', earned: [] }, storage);
  assert.equal(readBadges(storage).tier, 'skeptic');
  assert.equal(storage.getItem(BADGES_KEY) !== null, true);
});

test('readBadges on corrupt JSON falls back to Builder', () => {
  const storage = fakeStorage({ [BADGES_KEY]: '{not json' });
  assert.equal(readBadges(storage).tier, 'builder');
});

test('promote is a pure ratchet: no downgrade, needs held-out evidence', () => {
  const base = defaultBadgeState();
  assert.equal(promote(base, 'builder', { heldOut: 0.9 }).ok, false);          // not a step up
  assert.equal(promote(base, 'architect').ok, false);                          // missing evidence
  assert.equal(promote(base, 'not-a-tier', { heldOut: 0.9 }).ok, false);       // unknown tier
  const up = promote(base, 'skeptic', { heldOut: 0.92, abstainRate: 0.1, threshold: 0.62 });
  assert.equal(up.ok, true);
  assert.equal(up.state.tier, 'skeptic');
  assert.equal(up.state.earned.length, 1);
  assert.equal(up.state.earned[0].evidence.heldOut, 0.92);
  // ratchet: cannot go back down, and a repeat of the same tier adds nothing
  assert.equal(promote(up.state, 'builder', { heldOut: 0.9 }).ok, false);
  const again = promote(up.state, 'skeptic', { heldOut: 0.95 });
  assert.equal(again.ok, false); // already on skeptic
  // a further step up works
  const arch = promote(up.state, 'architect', { heldOut: 0.8 });
  assert.equal(arch.ok, true);
  assert.equal(arch.state.tier, 'architect');
  assert.equal(arch.state.earned.length, 2);
});

test('earned badges carry evidence, never just an icon', () => {
  const up = promote(defaultBadgeState(), 'auditor', { heldOut: 0.71, abstainRate: 0.08, threshold: 0.55 });
  assert.equal(up.state.earned[0].evidence.heldOut, 0.71);
  assert.equal(up.state.earned[0].evidence.threshold, 0.55);
});
