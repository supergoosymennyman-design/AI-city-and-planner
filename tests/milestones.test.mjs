// tests/milestones.test.mjs — durable, capability-based city milestones.
//
// Milestones are RECOGNITION, never gates (docs/badges-and-tiers.md): each must
// record a demonstrated CAPABILITY, never a quantity/time/perfect-score chase.
// They live in the Champion File so they travel cross-device, and they are a
// ratchet (never lost). These tests pin the taxonomy rule, the legacy migration,
// the ratchet, and the capability evaluation.
//
// Run: node --test tests/milestones.test.mjs   (from the repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MILESTONES, MILESTONE_IDS, milestone, sanitizeMilestones, defaultMilestoneState,
  awardMilestone, hasMilestone, earnedIds, evaluateMilestones, MILESTONES_KEY,
  milestoneSectionHTML,
} from '../P5 Programme/buddy-kit/client/city-common/milestones.js';
import { CF_KEYS } from '../P5 Programme/buddy-kit/client/city-common/champion-file.js';

// ── Fixtures ────────────────────────────────────────────────────────────
const road = { points: [[100, 1000], [900, 1000]], width: 14, class: 'primary' };
const home = (x, z) => ({ type: 'housing', pos: [x, z], footprint: [20, 20], height: 24 });
const bld = (type, x, z) => ({ type, pos: [x, z], footprint: [24, 24], height: 24 });
const layout = (buildings, roads = [road], parks = []) => ({ version: 2, scaleMeters: 2000, roads, parks, buildings });
const ctx = (l, walk = null, metrics = {}) => ({ layout: l, walk, metrics, params: undefined });

// ── Taxonomy ────────────────────────────────────────────────────────────
test('milestones: unique ids, bilingual labels, no duplicate names', () => {
  const ids = MILESTONES.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length, 'ids must be unique');
  assert.deepEqual(MILESTONE_IDS, ids);
  for (const m of MILESTONES) {
    assert.ok(m.name && m.nameZh, `${m.id} needs EN + ZH names`);
    assert.ok(m.msg && m.msgZh, `${m.id} needs EN + ZH messages`);
    assert.equal(typeof m.test, 'function', `${m.id} needs a test`);
    assert.ok(milestone(m.id) === m, 'milestone(id) lookup');
  }
  assert.equal(milestone('nope'), null);
});

test('milestones: no trigger chases a perfect score (Overfitter\'s Trap guard)', () => {
  // The taxonomy rule: a trigger that is quantity, time, or a perfect score is
  // corrupt. Guard against re-introducing one (the old list had coverage/zoning/
  // spread >= 0.999 and score 95+).
  for (const m of MILESTONES) {
    const src = String(m.test);
    assert.ok(!/\.score/.test(src), `${m.id} must not read a score`);
    assert.ok(!/0\.999|>= *1\b|== *1\b/.test(src), `${m.id} must not demand a perfect ratio`);
  }
});

// ── Storage + migration ─────────────────────────────────────────────────
test('milestones: legacy id-array migrates to dated entries, unknown ids dropped', () => {
  const s = sanitizeMilestones(['first_connection', 'served', 'first_connection', 'brilliant_city']);
  assert.equal(s.version, 2);
  assert.deepEqual(s.earned.map((e) => e.id), ['first_connection'], 'known ids kept, corrupt ones dropped, deduped');
  assert.equal(s.earned[0].date, null, 'legacy entries have no date');
  assert.deepEqual(s.earned[0].evidence, {});
});

test('milestones: sanitize tolerates junk without throwing', () => {
  for (const junk of [null, undefined, 42, 'nope', {}, { earned: 'x' }, [1, 2, 3]]) {
    const s = sanitizeMilestones(junk);
    assert.deepEqual(s.earned, [], `junk ${JSON.stringify(junk)} → empty`);
    assert.equal(s.version, 2);
  }
});

test('milestones: award is a ratchet — never repeats, never lost', () => {
  let s = defaultMilestoneState();
  const a = awardMilestone(s, 'first_connection', { homes: 2 }, '2026-09-10T00:00:00.000Z');
  assert.ok(a.ok);
  s = a.state;
  assert.ok(hasMilestone(s, 'first_connection'));
  const b = awardMilestone(s, 'first_connection', { homes: 9 }, '2026-10-01T00:00:00.000Z');
  assert.ok(!b.ok, 'second award rejected');
  assert.equal(earnedIds(b.state).size, 1, 'still exactly one');
  assert.equal(b.state.earned[0].evidence.homes, 2, 'evidence not overwritten');
  assert.ok(!awardMilestone(s, 'not_a_milestone').ok, 'unknown id rejected');
});

// ── Capability evaluation ───────────────────────────────────────────────
test('milestones: a connected home fires first_connection (but not services_nearby)', () => {
  const l = layout([home(500, 1000), bld('school', 560, 1000)]);
  const ids = evaluateMilestones(ctx(l), defaultMilestoneState()).map((h) => h.id);
  assert.ok(ids.includes('first_connection'), 'home on a road near a service');
  assert.ok(!ids.includes('services_nearby'), 'one service is not three');
});

test('milestones: three different services near one home fires services_nearby', () => {
  const l = layout([home(500, 1000), bld('school', 560, 1000), bld('shop', 500, 940), bld('hospital', 560, 940)]);
  const ids = evaluateMilestones(ctx(l), defaultMilestoneState()).map((h) => h.id);
  assert.ok(ids.includes('services_nearby'));
});

test('milestones: a real road route to school/hospital fires safe_routes', () => {
  const walk = { budget: 400, reach: 0.5, homes: [{ ok: { school: true, hospital: false } }] };
  const l = layout([home(500, 1000), bld('school', 560, 1000)]);
  const ids = evaluateMilestones(ctx(l, walk), defaultMilestoneState()).map((h) => h.id);
  assert.ok(ids.includes('safe_routes'));
  // No walk data → no fire.
  assert.ok(!evaluateMilestones(ctx(l, null), defaultMilestoneState()).some((h) => h.id === 'safe_routes'));
});

test('milestones: a noisy building kept away from homes fires smart_zoning', () => {
  const l = layout([home(500, 1000), bld('delivery', 100, 100)]);
  const ids = evaluateMilestones(ctx(l), defaultMilestoneState()).map((h) => h.id);
  assert.ok(ids.includes('smart_zoning'));
  // A delivery right beside the home must NOT fire.
  const bad = layout([home(500, 1000), bld('delivery', 520, 1000)]);
  assert.ok(!evaluateMilestones(ctx(bad), defaultMilestoneState()).some((h) => h.id === 'smart_zoning'));
});

test('milestones: two same services far apart fire spread_services', () => {
  const l = layout([home(500, 1000), bld('school', 300, 1000), bld('school', 700, 1000)]);
  const ids = evaluateMilestones(ctx(l), defaultMilestoneState()).map((h) => h.id);
  assert.ok(ids.includes('spread_services'));
  // Two schools 100m apart (overlapping coverage) must NOT fire.
  const close = layout([home(500, 1000), bld('school', 300, 1000), bld('school', 400, 1000)]);
  assert.ok(!evaluateMilestones(ctx(close), defaultMilestoneState()).some((h) => h.id === 'spread_services'));
});

test('milestones: a park within reach of a home fires green_nearby', () => {
  const l = layout([home(500, 1000)], [road], [{ cx: 520, cz: 1000, radius: 40 }]);
  const ids = evaluateMilestones(ctx(l), defaultMilestoneState()).map((h) => h.id);
  assert.ok(ids.includes('green_nearby'));
});

test('milestones: an empty city earns nothing (no false positives)', () => {
  const l = layout([], []);
  assert.deepEqual(evaluateMilestones(ctx(l), defaultMilestoneState()), []);
});

test('milestones: already-earned milestones are never re-reported', () => {
  const l = layout([home(500, 1000), bld('school', 560, 1000)]);
  let s = defaultMilestoneState();
  const first = evaluateMilestones(ctx(l), s).map((h) => h.id);
  assert.ok(first.includes('first_connection'));
  s = awardMilestone(s, 'first_connection', {}).state;
  const second = evaluateMilestones(ctx(l), s).map((h) => h.id);
  assert.ok(!second.includes('first_connection'), 'ratchet: not re-reported');
});

// ── Durability ──────────────────────────────────────────────────────────
test('milestones: the store key is owned by the Champion File (cross-device)', () => {
  assert.equal(CF_KEYS.milestones, MILESTONES_KEY, 'Champion File must carry milestones');
});

// ── Logbook rendering (pure, DOM-free) ──────────────────────────────────
test('milestones: Logbook section marks earned vs locked and shows the date', () => {
  const s = awardMilestone(defaultMilestoneState(), 'first_connection', {}, '2026-09-10T00:00:00.000Z').state;
  const html = milestoneSectionHTML(s, 'en');
  assert.match(html, /logbook-ms earned/, 'earned row class');
  assert.match(html, /First Neighbourhood/, 'earned name');
  assert.match(html, /2026-09-10/, 'earned date');
  assert.match(html, /logbook-ms locked/, 'unearned rows are visible, not hidden');
  assert.match(html, /Not earned yet/);
  assert.match(html, /Milestones you earned/, 'section heading');
  // Every milestone has a row (recognition never hides anything).
  assert.equal((html.match(/class="logbook-ms /g) || []).length, MILESTONES.length);
});

test('milestones: Logbook section is bilingual', () => {
  const s = awardMilestone(defaultMilestoneState(), 'green_nearby', {}, '2026-09-10T00:00:00.000Z').state;
  const html = milestoneSectionHTML(s, 'zh-Hant');
  assert.match(html, /你獲得的里程碑/);
  assert.match(html, /綠意就在附近/);
  assert.match(html, /尚未獲得/);
  assert.ok(!/Not earned yet/.test(html), 'no English placeholder in zh');
});
