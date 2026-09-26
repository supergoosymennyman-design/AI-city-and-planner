// challenges.js — the registered release-one challenges.
//
// A CHALLENGE is the STABLE scope a student earns against and the unit a skill
// stage is reported for (implementation plan §2). It is deliberately NOT a
// machine id: copying or renaming a machine cannot mint a new scope, so it can
// never manufacture fresh reward eligibility. One challenge per real skill the
// City can run.
//
// This module also owns the run RECORD used to detect an honest improvement: a
// newer immutable revision that corrects something the same recorded scenario
// got wrong before. The record is data, not a score, and the comparison is pure.
//
// Pure: no DOM, no clock, no randomness, no storage.
import { CAP_INPUT_IMAGE } from './cap-runtime.js';
import { DRIVE_HOST_TYPE } from './driving.js';

export const CHALLENGES_VERSION = 1;
export const CHALLENGE_RUNS_VERSION = 1;

export const CHALLENGES = Object.freeze({
  'image-sorter': Object.freeze({
    id: 'image-sorter',
    name: 'Recycling Sorter',
    nameZh: '回收分類器',
    skill: 'image',
    hostType: 'sorter',
    blurb: 'Your photo classifier sorts real recycling.',
    blurbZh: '你的相片分類器會分類真實回收物。',
  }),
  driver: Object.freeze({
    id: 'driver',
    name: 'Self-Driving Car',
    nameZh: '自動駕駛汽車',
    skill: 'drive',
    hostType: DRIVE_HOST_TYPE,
    blurb: 'Your sensor model drives a car.',
    blurbZh: '你的感應器模型會駕駛汽車。',
  }),
});

export const CHALLENGE_IDS = Object.freeze(Object.keys(CHALLENGES));

export function challenge(idValue) { return CHALLENGES[idValue] || null; }

/** Which challenge a published capability belongs to, or null when it belongs to none. */
export function challengeOfCapability(cap) {
  if (!cap || typeof cap !== 'object') return null;
  if (cap.input?.kind === CAP_INPUT_IMAGE) return 'image-sorter';
  const hosts = cap.city?.hostTypes;
  if (Array.isArray(hosts) && hosts.includes(DRIVE_HOST_TYPE)) return 'driver';
  return null;
}

/** Every published revision of a challenge, oldest first. */
export function capabilityEntries(project, challengeId) {
  if (!challenge(challengeId)) return [];
  const out = [];
  for (const [key, cap] of Object.entries(project?.capabilities || {})) {
    if (challengeOfCapability(cap) === challengeId) out.push({ key, cap });
  }
  return out.sort((a, b) => (Number(a.cap.revision || 1) - Number(b.cap.revision || 1)) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** The newest published revision of a challenge, or null. */
export function latestCapability(project, challengeId) {
  const all = capabilityEntries(project, challengeId);
  return all.length ? all[all.length - 1] : null;
}

/** Installations of a challenge, resolved through their capability ref. */
export function installationEntries(project, challengeId) {
  const caps = project?.capabilities || {};
  return Object.values(project?.installations || {}).filter((inst) => {
    const cap = caps[inst?.capabilityRef];
    return !!cap && challengeOfCapability(cap) === challengeId;
  });
}

// ── run records: what a scenario got wrong, so a later revision can fix it ────

export function emptyChallengeRuns() { return { version: CHALLENGE_RUNS_VERSION, runs: {} }; }

export function normalizeChallengeRuns(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyChallengeRuns();
  const runs = raw.runs && typeof raw.runs === 'object' && !Array.isArray(raw.runs) ? raw.runs : {};
  return { version: CHALLENGE_RUNS_VERSION, runs };
}

/** A scenario is identified by what it is and its fixed seed — never by revision. */
export function scenarioKey(scenario) {
  return `${scenario?.kind || 'normal'}:${scenario?.seed ?? 1}`;
}

/** Items the model answered WRONG (ground truth known, not abstained, not matching). */
export function wrongIdsOf(results) {
  return (results || [])
    .filter((r) => r && r.id && !r.abstained && r.truth != null && r.decision !== r.truth)
    .map((r) => r.id);
}

/** Items the model actually ANSWERED and for which ground truth exists. */
export function gradedIdsOf(results) {
  return (results || [])
    .filter((r) => r && r.id && !r.abstained && r.truth != null)
    .map((r) => r.id);
}

/** Items the model ANSWERED CORRECTLY (ground truth known, not abstained, matching). */
export function correctIdsOf(results) {
  return (results || [])
    .filter((r) => r && r.id && !r.abstained && r.truth != null && r.decision === r.truth)
    .map((r) => r.id);
}

/**
 * A newer revision that makes a previously-wrong item right on the SAME recorded
 * scenario. Requires the item to be graded again — an item that simply vanished
 * from the batch is not a fix.
 */
export function fixedAgainst(previous, wrongIds, gradedIds) {
  if (!previous || !Array.isArray(previous.wrongIds)) return [];
  const nowWrong = new Set(wrongIds || []);
  const graded = new Set(gradedIds || []);
  return previous.wrongIds.filter((itemId) => graded.has(itemId) && !nowWrong.has(itemId));
}

/**
 * Fold one completed run into the record and report what it fixed. PURE: returns
 * a NEW state; the input is never mutated. Same-revision replays never count as a
 * fix — only a step UP in revision can.
 * @returns {{state:object, previous:object|null, fixedIds:string[]}}
 */
export function recordRun(state, { challengeId, revision, scenario, wrongIds = [], gradedIds = [] } = {}) {
  const base = normalizeChallengeRuns(state);
  const runs = { ...base.runs };
  const byScenario = { ...(runs[challengeId] || {}) };
  const key = scenarioKey(scenario);
  const previous = byScenario[key] || null;
  const rev = Number(revision) || 1;
  const wrong = [...new Set(wrongIds)];
  const fixedIds = previous && rev > (Number(previous.revision) || 1)
    ? fixedAgainst(previous, wrong, gradedIds)
    : [];
  byScenario[key] = {
    revision: rev,
    scenario: { kind: scenario?.kind || 'normal', seed: scenario?.seed ?? 1 },
    wrongIds: wrong,
    graded: (gradedIds || []).length,
  };
  runs[challengeId] = byScenario;
  return { state: { version: CHALLENGE_RUNS_VERSION, runs }, previous, fixedIds };
}
