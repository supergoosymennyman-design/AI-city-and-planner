// city-common/recycling.js — the RECYCLING STATION's pure rules.
//
// The station runs the student's published IMAGE classifier and the PREDICTION
// selects the bin. This module is pure + deterministic (no DOM, no clock, no
// randomness) so `node --test` can prove the two laws the plan cares about:
//
//   1. The prediction routes the item. Ground truth is copied onto the result
//      for SCORING ONLY and is never read by `routeItem`/`routeDecision`.
//   2. Changing the model changes the observed sorting — the same items through
//      a different published bundle land in different bins.
//
// The City does NOT run MobileNet live: it feeds the curated library feature
// vectors (the same vectors the Workshop extractor produced) and rejects a
// bundle whose extractor identity does not match the ones it holds.
import { runInference, CAP_ABSTAIN, CAP_INPUT_IMAGE, CAP_IMAGE_DIMENSION, CAP_ALGORITHM_V2 } from './cap-runtime.js';

/** The pinned extractor identity. A bundle naming anything else is refused. */
export const RECYCLING_PREPROCESSING = 'mobilenet-v3-small-224-squash-f32-unit-v1';
export const RECYCLING_DIMENSION = CAP_IMAGE_DIMENSION;

export const RECYCLING_LABELS = Object.freeze(['cardboard', 'glass', 'metal', 'paper', 'plastic', 'trash']);

/** Material classes the model tends to confuse: glass looks like plastic, paper like cardboard. */
export const CONFUSING_LABELS = Object.freeze(['glass', 'plastic', 'paper', 'cardboard']);

/** The bins the prediction can choose — plus the honest human-check tray. */
export const BINS = Object.freeze([
  { id: 'bin-cardboard', label: 'cardboard', emoji: '📦', color: '#b07a3c' },
  { id: 'bin-glass',     label: 'glass',     emoji: '🍾', color: '#2f9e8f' },
  { id: 'bin-metal',     label: 'metal',     emoji: '🥫', color: '#7f8c99' },
  { id: 'bin-paper',     label: 'paper',     emoji: '📄', color: '#c9b458' },
  { id: 'bin-plastic',   label: 'plastic',   emoji: '🧴', color: '#3d7ec2' },
  { id: 'bin-trash',     label: 'trash',     emoji: '🗑️', color: '#6b6b6b' },
  { id: 'human-check',   label: CAP_ABSTAIN, emoji: '🙋', color: '#e08b2f' },
]);

export const BIN_FOR_LABEL = Object.freeze(Object.fromEntries(
  BINS.filter((b) => b.label !== CAP_ABSTAIN).map((b) => [b.label, b.id]),
));

export const SET_KINDS = Object.freeze(['normal', 'confusing', 'unfamiliar']);

const hashInt = (text) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};

/** Is this a v2 image bundle the station can run? */
export function isImageCapability(cap) {
  return !!cap && cap.input?.kind === CAP_INPUT_IMAGE;
}

/** Reject a bundle whose extractor/dimension does not match the curated features. */
export function checkCompatibility(cap, {
  preprocessing = RECYCLING_PREPROCESSING,
  dimension = RECYCLING_DIMENSION,
} = {}) {
  if (!cap || typeof cap !== 'object') return { ok: false, error: 'missing-capability' };
  if (cap.input?.kind !== CAP_INPUT_IMAGE) return { ok: false, error: 'not-an-image-classifier' };
  if (cap.model?.algorithm !== CAP_ALGORITHM_V2) return { ok: false, error: 'unsupported-algorithm' };
  if (cap.input.preprocessing !== preprocessing) {
    return { ok: false, error: 'incompatible-preprocessing', expected: preprocessing, got: cap.input.preprocessing };
  }
  if (Number(cap.input.dimension) !== dimension) {
    return { ok: false, error: 'incompatible-dimension', expected: dimension, got: cap.input.dimension };
  }
  return { ok: true };
}

/**
 * Route one predicted decision to a bin. The prediction is the ONLY input — the
 * `abstained` flag (or an unknown label) sends the item to the human-check tray.
 * Ground truth is deliberately NOT a parameter here.
 */
export function routeDecision(decision, abstained, mapping = BIN_FOR_LABEL) {
  const category = (!abstained && decision && decision !== CAP_ABSTAIN) ? decision : CAP_ABSTAIN;
  const bin = category === CAP_ABSTAIN ? 'human-check' : (mapping[category] || 'human-check');
  return { category, bin };
}

/**
 * Shape one raw inference result into a routed conveyor result. This is the ONE
 * place a decision becomes a bin, so the pure `runInference` path and the store's
 * `runSkill` path (which returns the same fields) can never drift.
 */
export function routeResult(result, item) {
  const routed = routeDecision(result?.decision, result?.abstained);
  return {
    id: item?.id || null,
    truth: item?.label || null,
    decision: result?.decision || CAP_ABSTAIN,
    abstained: !!result?.abstained,
    abstainReason: result?.abstainReason || null,
    confidence: Number.isFinite(result?.confidence) ? result.confidence : 0,
    voteShare: Number.isFinite(result?.voteShare) ? result.voteShare : 0,
    nearestDistance: Number.isFinite(result?.nearestDistance) ? result.nearestDistance : null,
    evidence: Array.isArray(result?.evidence) ? result.evidence : [],
    bin: routed.bin,
    binCategory: routed.category,
    routedBy: 'prediction',
  };
}

/**
 * Run one conveyor item through the model and choose its bin from the PREDICTION.
 * @param {object} cap   a v2 image bundle
 * @param {{id:string, label:string, vector:number[]}} item  (label = ground truth, for scoring only)
 */
export function routeItem(cap, item) {
  return routeResult(runInference(cap, { vector: item?.vector }), item);
}

/** Run a whole batch. `items` each carry a vector; ground truth rides along for scoring. */
export function runConveyor(cap, items) {
  return (items || []).map((item) => routeItem(cap, item));
}

/**
 * Score a finished batch against GROUND TRUTH. This is reported separately from
 * routing and never feeds it: a wrong prediction still went in the bin the MODEL
 * chose, and an abstention still went to the human-check tray.
 */
export function scoreRun(results) {
  const total = (results || []).length;
  const correct = results.filter((r) => !r.abstained && r.decision === r.truth).length;
  const wrong = results.filter((r) => !r.abstained && r.decision !== r.truth).length;
  const abstained = results.filter((r) => r.abstained).length;
  const humanChecked = results.filter((r) => r.bin === 'human-check').length;
  return {
    total,
    correct,
    wrong,
    abstained,
    humanChecked,
    // Only the model's non-abstained calls can be "right" or "wrong"; an abstention is honest.
    answered: total - abstained,
    accuracy: total ? Math.round((correct / total) * 1000) / 1000 : 0,
  };
}

/**
 * Deterministically choose a fixed-seed conveyor batch from catalogue rows.
 * Same (rows, seed, kind) always yields the same ids, so two students compare
 * the same items and a revision is re-run against the SAME batch.
 *
 * Kinds:
 *   normal     — a balanced draw from the frozen held-out (test) split
 *   confusing  — the material classes that look alike (glass/plastic, paper/cardboard)
 *   unfamiliar — classes the model was NOT taught (or, failing that, the most
 *                mixed "trash" class) — the honest way to reach an abstention
 */
export function selectItems(rows, { seed = 1, kind = 'normal', count = 8, modelLabels = null } = {}) {
  if (!Array.isArray(rows) || !rows.length) return [];
  let pool = rows.filter((r) => r && r.id && r.label);
  if (kind === 'confusing') {
    pool = pool.filter((r) => CONFUSING_LABELS.includes(r.label));
  } else if (kind === 'unfamiliar') {
    const trained = new Set(Array.isArray(modelLabels) && modelLabels.length ? modelLabels : RECYCLING_LABELS);
    const unseen = pool.filter((r) => !trained.has(r.label));
    pool = unseen.length ? unseen : pool.filter((r) => r.label === 'trash');
    if (!pool.length) pool = rows.filter((r) => r && r.id && r.label);
  } else {
    const test = pool.filter((r) => r.split === 'test');
    if (test.length) pool = test;
  }
  if (!pool.length) return [];
  const ranked = pool
    .map((r) => ({ r, k: hashInt(`${r.id}|${seed}|${kind}`) }))
    .sort((a, b) => a.k - b.k || (a.r.id < b.r.id ? -1 : a.r.id > b.r.id ? 1 : 0))
    .map((x) => x.r);
  const classCount = new Set(ranked.map((r) => r.label)).size || 1;
  const perClass = Math.max(1, Math.ceil(count / classCount));
  const taken = Object.create(null);
  const out = [];
  for (const r of ranked) {
    if (out.length >= count) break;
    if ((taken[r.label] || 0) >= perClass) continue;
    taken[r.label] = (taken[r.label] || 0) + 1;
    out.push(r);
  }
  return out.slice(0, count);
}

/** A small deterministic helper so the UI can name a set without a second rule. */
export function setSizeFor(kind) {
  if (kind === 'confusing') return 6;
  if (kind === 'unfamiliar') return 6;
  return 8;
}
