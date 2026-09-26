// achievements.js — badges promoted from OBSERVED evidence (plan §2, §3).
//
// The Inspector's tiers already exist (badges.js) but `promote()` was never
// called by anything. This module is the missing, PURE bridge: it reads the
// project's real evidence (published capabilities, installations, claims) and
// says which tier — if any — the evidence has earned, plus the evidence card to
// show. It never awards a tier it cannot point at.
//
// Pure: no DOM, no clock, no randomness. Node-testable.
import { CHALLENGE_IDS, installationEntries } from './challenges.js';
import { TIERS, promote as promoteBadge, sanitizeBadges } from './badges.js';
import { claimKey, REWARD_CONFIG } from './ledger.js';

export const ACHIEVEMENT_VERSION = 1;

function claimOf(type, challengeId) {
  const reward = REWARD_CONFIG.rewards[type];
  return reward ? claimKey(reward, challengeId) : null;
}
function evidenceOf(economy, type, challengeId) {
  const key = claimOf(type, challengeId);
  return key ? (economy?.evidence?.[key] || null) : null;
}
function hasClaim(economy, type, challengeId) {
  const key = claimOf(type, challengeId);
  return !!(key && Array.isArray(economy?.claimed) && economy.claimed.includes(key));
}

/**
 * The highest tier the project's evidence justifies, and the card to show.
 * `builder` is the default state (a runnable machine), so the ladder starts at
 * `skeptic` — which is the first tier that needs held-out evidence.
 * @returns {{tier:string|null, evidence:object}}
 */
export function badgeAchievement(project) {
  const economy = project?.economy;
  // The ladder is TIER-level, not per-challenge: each rung must be evidenced
  // somewhere in the project before a higher rung is granted. (Owner decision —
  // a tier is a statement about the child's demonstrated practice, not a
  // per-machine checklist; don't tighten this to per-challenge without asking.)
  const connected = CHALLENGE_IDS.filter((id) => installationEntries(project, id).length > 0);
  const tested = CHALLENGE_IDS.filter((id) => evidenceOf(economy, 'held-out-eval', id));
  const limits = CHALLENGE_IDS.filter((id) => evidenceOf(economy, 'abstain-demo', id));

  // architect — composed BOTH skills into the City, on top of the WHOLE ladder
  // below it: every rung must already be satisfied (a machine that was tested,
  // and one whose limits were found). Connected-but-untested cannot jump to the top.
  if (connected.length === CHALLENGE_IDS.length && tested.length > 0 && limits.length > 0) {
    const total = connected.reduce((n, id) => n + installationEntries(project, id).length, 0);
    return { tier: 'architect', evidence: { heldOut: total, abstainRate: null, threshold: null, challenges: [...connected] } };
  }

  // auditor — found the limits with an honest "not sure", which only counts once
  // a held-out evaluation exists to find them in (the rung below).
  if (limits.length > 0 && tested.length > 0) {
    const id = limits[0];
    const demo = evidenceOf(economy, 'abstain-demo', id);
    const abstained = Number(demo.abstained) || 1;
    return { tier: 'auditor', evidence: { heldOut: abstained, abstainRate: 1, threshold: null, challengeId: id } };
  }

  // skeptic — ran a held-out evaluation and inspected it.
  if (tested.length > 0) {
    const id = tested[0];
    const held = evidenceOf(economy, 'held-out-eval', id);
    const heldOut = Number(held.total) || Number(held.steps) || 1;
    const abstained = Number(held.abstained) || 0;
    return { tier: 'skeptic', evidence: { heldOut, abstainRate: heldOut ? Math.round((abstained / heldOut) * 100) / 100 : null, threshold: null, challengeId: id } };
  }

  return { tier: null, evidence: {} };
}

/**
 * Apply the evidence-derived promotion to a badge state (ratchet — never
 * downgrades). Returns the badge state to persist.
 * @returns {{ok:boolean, state:object, tier:string|null, evidence:object, reason?:string}}
 */
export function promoteFromEvidence(project, state) {
  const { tier, evidence } = badgeAchievement(project);
  const current = sanitizeBadges(state);
  if (!tier) return { ok: false, state: current, tier: null, evidence, reason: 'no-held-out-evidence' };
  const result = promoteBadge(current, tier, evidence);
  if (!result.ok) return { ok: false, state: current, tier: null, evidence, reason: result.error };
  return { ok: true, state: result.state, tier, evidence };
}

/** The tier list with each tier's earned/current state, for the Logbook render. */
export function tierRows(state) {
  const s = sanitizeBadges(state);
  return TIERS.map((t) => ({ ...t, current: t.id === s.tier, reached: t.order <= (TIERS.find((x) => x.id === s.tier)?.order || 1) }));
}

/** Pure HTML evidence card for each earned badge (what the child actually did). */
export function badgeEvidenceHTML(state, lang = 'en') {
  const zh = lang === 'zh-Hant';
  const s = sanitizeBadges(state);
  if (!s.earned.length) return '';
  const rows = s.earned.map((b) => {
    const tier = TIERS.find((t) => t.id === b.id);
    const e = b.evidence || {};
    const fields = [
      ['held-out items', 'heldOut'], ['not-sure rate', 'abstainRate'], ['challenges', 'challenges'],
    ].filter(([, k]) => e[k] != null)
      .map(([label, k]) => `<span>${label}: ${Array.isArray(e[k]) ? e[k].join(', ') : String(e[k])}</span>`).join('');
    return `<div class="logbook-badge-evidence">
        <div class="be-name">${tier ? (zh ? tier.nameZh : tier.name) : b.id}${b.earnedAt ? ` · ${String(b.earnedAt).slice(0, 10)}` : ''}</div>
        <div class="be-fields">${fields}</div>
      </div>`;
  }).join('');
  return `<div class="logbook-section-title">${zh ? '你證明了甚麼' : 'What you proved'}</div>${rows}`;
}
