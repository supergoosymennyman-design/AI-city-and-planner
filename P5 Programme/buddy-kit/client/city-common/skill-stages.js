// skill-stages.js — the second of the plan's three progress forms (plan §2).
//
// Skill stages describe EVIDENCE, not a score: Built → Tested → City-connected →
// Improved. They are DERIVED from what is already recorded in the project
// envelope (published capabilities, installations, bounded decisions, and the
// ledger's evidence references), so they can never be claimed without the
// demonstrated work and they need no storage of their own.
//
// Pure: no DOM, no clock, no randomness. Node-testable.
import { CHALLENGE_IDS, challenge, latestCapability, installationEntries } from './challenges.js';
import { installCapability } from './cap-runtime.js';
import { claimKey, REWARD_CONFIG } from './ledger.js';

export const SKILL_STAGES = Object.freeze([
  {
    id: 'built', order: 1, name: 'Built', nameZh: '已建造',
    blurb: 'You saved a machine that runs.', blurbZh: '你儲存了一台能運作的機器。',
  },
  {
    id: 'tested', order: 2, name: 'Tested', nameZh: '已測試',
    blurb: 'You tested it on data it never saw.', blurbZh: '你用從未見過的資料測試了它。',
  },
  {
    id: 'city-connected', order: 3, name: 'City-connected', nameZh: '已連接城市',
    blurb: 'It is installed and ran a real City test.', blurbZh: '它已安裝並在城市中真實測試過。',
  },
  {
    id: 'improved', order: 4, name: 'Improved', nameZh: '已改良',
    blurb: 'A newer version fixed something it got wrong.', blurbZh: '較新的版本修正了它之前的錯誤。',
  },
]);

export function stageById(idValue) { return SKILL_STAGES.find((s) => s.id === idValue) || null; }

function claimOf(economy, type, challengeId) {
  const reward = REWARD_CONFIG.rewards[type];
  if (!reward) return null;
  try { return claimKey(reward, challengeId); } catch { return null; }
}
function hasClaim(economy, type, challengeId) {
  const key = claimOf(economy, type, challengeId);
  return !!(key && Array.isArray(economy?.claimed) && economy.claimed.includes(key));
}
function evidenceOf(economy, type, challengeId) {
  const key = claimOf(economy, type, challengeId);
  return key ? (economy?.evidence?.[key] || null) : null;
}

/**
 * The evidence-derived stage for one challenge.
 * @returns {null|{challengeId:string, name:string, nameZh:string, skill:string,
 *   stage:string, order:number, steps:object, evidence:object}}
 */
export function stageOf(project, challengeId) {
  const spec = challenge(challengeId);
  if (!spec) return null;

  const latest = latestCapability(project, challengeId);
  let builtEvidence = null;
  let built = false;
  if (latest) {
    const installed = installCapability(latest.cap);
    built = !!(installed.ok && installed.installation?.selftest?.ok);
    builtEvidence = { key: latest.key, revision: Number(latest.cap.revision || 1), selftest: built };
  }

  const tested = hasClaim(project?.economy, 'held-out-eval', challengeId);
  const installs = installationEntries(project, challengeId);
  const cityTested = hasClaim(project?.economy, 'city-install', challengeId)
    || installs.some((inst) => (inst.decisions || []).length > 0);
  const improved = hasClaim(project?.economy, 'revision-fixed', challengeId);

  const steps = {
    built,
    tested: !!tested,
    'city-connected': installs.length > 0 && !!cityTested,
    improved: !!improved,
  };

  const reached = SKILL_STAGES.filter((s) => steps[s.id]);
  const current = reached.length ? reached[reached.length - 1] : null;

  return {
    challengeId,
    name: spec.name,
    nameZh: spec.nameZh,
    skill: spec.skill,
    stage: current ? current.id : 'not-started',
    order: current ? current.order : 0,
    steps,
    evidence: {
      built: builtEvidence,
      tested: evidenceOf(project?.economy, 'held-out-eval', challengeId),
      cityConnected: installs.map((inst) => ({
        installationId: inst.id,
        hostType: inst.hostType || null,
        revision: Number(inst.revision || 1),
        decisions: (inst.decisions || []).length,
      })),
      improved: evidenceOf(project?.economy, 'revision-fixed', challengeId),
    },
  };
}

/** Every registered challenge's stage, keyed by challenge id. */
export function allStages(project) {
  const out = {};
  for (const idValue of CHALLENGE_IDS) out[idValue] = stageOf(project, idValue);
  return out;
}

/** A compact label for a stage, localized (the UI may also use the objects above). */
export function stageLabel(stageId, lang = 'en') {
  const stage = stageById(stageId);
  if (!stage) return lang === 'zh-Hant' ? '未開始' : 'Not started';
  return lang === 'zh-Hant' ? stage.nameZh : stage.name;
}
