// city-common/cap-runtime.js — the City's side of the capability bridge.
//
// Reads a Workshop-exported `.cap` bundle (see docs/capability-bridge.md — a
// single JSON file, data-only, versioned, immutable) and returns a safe,
// display-only descriptor. The City NEVER interprets the child's machine — it
// validates the bundle and shows exactly what it declares.
//
// STAGE SPLIT:
//   Stage 1 (this file today): parse + structural validate → capability
//   descriptor. Honest "planted, but not connected to the city yet".
//   Stage 2 (next): runInference() for knn-vector-classifier + selftest gate.
//
// Pure + sync so node:test can exercise it exactly as the browser will.
export const CAP_MAGIC = 'passiona.capability';
export const CAP_SPEC_VERSION = 1;
export const CAP_ALGORITHMS = ['knn-vector-classifier'];
export const CAP_ABSTAIN = '__abstain';

/** Structural parse + validate. Never throws. @returns {{ok:true, capability}|{ok:false,error}} */
export function parseCapability(raw) {
  let obj;
  try {
    obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' };
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ok: false, error: 'That is not a capability bundle.' };
  }
  if (obj.magic !== CAP_MAGIC) {
    return { ok: false, error: 'That does not look like a Passiona capability (.cap).' };
  }
  if (obj.specVersion !== CAP_SPEC_VERSION) {
    return { ok: false, error: `This capability is spec version ${obj.specVersion ?? '?'} — this app knows version ${CAP_SPEC_VERSION}.` };
  }
  if (!obj.id || !obj.name) return { ok: false, error: 'The capability has no id or name.' };

  // v1 supports label classifiers over numeric vectors only.
  if (obj.kind !== 'classifier') {
    return { ok: false, error: `Capability kind "${obj.kind ?? '?'}" is not supported yet (this build: classifier).` };
  }
  if (obj.output?.kind !== 'label' || !Array.isArray(obj.output.labels) || obj.output.labels.length === 0) {
    return { ok: false, error: 'The capability needs an output label set.' };
  }
  const alg = obj.model?.algorithm;
  if (!CAP_ALGORITHMS.includes(alg)) {
    return { ok: false, error: `Algorithm "${alg ?? '?'}" is not supported yet (this build: ${CAP_ALGORITHMS.join(', ')}).` };
  }
  if (typeof obj.model?.threshold !== 'number') {
    return { ok: false, error: 'The capability needs a confidence threshold.' };
  }
  if (!obj.evaluation || typeof obj.evaluation.scores !== 'object') {
    return { ok: false, error: 'The capability needs an evaluation summary (honest scores).' };
  }
  return { ok: true, capability: obj };
}

/** The display-safe descriptor shown in the pod/panel (never raw internals beyond what's honest). */
export function capabilityDescriptor(cap) {
  const ev = cap.evaluation || {};
  const scores = ev.scores || {};
  return {
    id: cap.id,
    revision: cap.revision || 1,
    name: cap.name,
    algorithm: cap.model?.algorithm,
    inputFields: (cap.input?.fields || []).map((f) => f.name),
    labels: cap.output?.labels || [],
    threshold: cap.model?.threshold,
    abstain: cap.output?.abstainLabel || CAP_ABSTAIN,
    split: ev.split || null,
    scores: {
      study: scores.study != null ? Math.round(scores.study * 100) / 100 : null,
      check: scores.check != null ? Math.round(scores.check * 100) / 100 : null,
      sealed: scores.sealed != null ? Math.round(scores.sealed * 100) / 100 : null,
    },
    evidenceCount: Array.isArray(cap.evidence) ? cap.evidence.length : 0,
    hasCityMapping: !!(cap.city && cap.city.mapping),
    mount: cap.city?.mount || null,
    // Stage 1 honesty: we do NOT claim it is governing the city yet.
    connected: false,
  };
}

/** A friendly one-line "why does it exist" for the pod. */
export function stage1Note(zh = false) {
  return zh
    ? '這台機器已種入城市，但尚未連接 — 它還不會控制任何東西。'
    : 'This machine is planted in your city, but not connected yet — it is not controlling anything.';
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 2 — headless inference (numeric k-NN) + self-test gate.
// The City MUST implement this exact algorithm (docs/capability-bridge.md §7),
// not a look-alike. Pure + sync so node:test can verify the exact maths.
// ─────────────────────────────────────────────────────────────────────────────

function b64ToBytes(b64) {
  const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}
function decodeFloat32(b64, count, dim) {
  if (!b64 || !count || !dim) return null;
  const u8 = b64ToBytes(b64);
  if (u8.byteLength < count * dim * 4) return null;
  const dv = new DataView(u8.buffer);
  const out = [];
  for (let i = 0; i < count; i++) {
    const row = [];
    for (let j = 0; j < dim; j++) row.push(dv.getFloat32((i * dim + j) * 4, true));
    out.push(row);
  }
  return out;
}
function decodeUint16(b64, count) {
  if (!b64 || !count) return null;
  const u8 = b64ToBytes(b64);
  if (u8.byteLength < count * 2) return null;
  const dv = new DataView(u8.buffer);
  const out = [];
  for (let i = 0; i < count; i++) out.push(dv.getUint16(i * 2, true));
  return out;
}
const round3 = (n) => Math.round(n * 1000) / 1000;

/** The full inference result shape (decision/confidence/abstained/evidence). */
function resultOf(decision, confidence, abstained, abstainReason, evidence = []) {
  return { decision, confidence: round3(confidence), abstained, abstainReason, evidence };
}
function abstainResult(reason, confidence = 0, evidence = []) {
  return resultOf(CAP_ABSTAIN, confidence, true, reason, evidence);
}

/**
 * Run one event through a planted numeric k-NN classifier.
 * @param {object} cap validated capability bundle
 * @param {object} event city event payload (field name → number)
 * @returns {{decision, confidence, abstained, abstainReason, evidence}}
 */
export function runInference(cap, event, opts = {}) {
  const fields = cap.input?.fields || [];
  const norm = cap.input?.normalization || { type: 'minmax', epsilon: 1e-6, min: [], max: [] };
  const labels = cap.output?.labels || [];
  const model = cap.model || {};

  // 1. Validate: every declared field present + finite.
  const x = [];
  for (const f of fields) {
    const v = event ? event[f.name] : undefined;
    if (typeof v !== 'number' || !Number.isFinite(v)) return abstainResult('missing-fields');
    x.push(v);
  }
  // 2. Normalize with the EXPORTED params (never recomputed from city data).
  const xn = x.map((v, i) => {
    const lo = norm.min && norm.min[i] != null ? norm.min[i] : 0;
    const hi = norm.max && norm.max[i] != null ? norm.max[i] : 1;
    const eps = norm.epsilon != null ? norm.epsilon : 1e-6;
    const n = (v - lo) / (hi - lo + eps);
    return Math.max(0, Math.min(1, n));
  });
  // 3. Decode the stored study vectors + labels.
  const vec = decodeFloat32(model.vectors?.data_b64, model.vectors?.count, model.vectors?.dim);
  const lab = decodeUint16(model.labels?.data_b64, model.labels?.count);
  if (!vec || !lab || vec.length !== lab.length || !labels.length) return abstainResult('invalid-model');
  // 4. Euclidean distances → nearest k.
  const dists = vec.map((v, i) => {
    let s = 0;
    for (let j = 0; j < xn.length && j < v.length; j++) { const d = xn[j] - v[j]; s += d * d; }
    return { d: Math.sqrt(s), labelName: labels[lab[i]] != null ? labels[lab[i]] : String(lab[i]), index: i };
  }).sort((a, b) => a.d - b.d);
  const k = Math.max(1, model.k || 3);
  const neighbours = dists.slice(0, Math.min(k, dists.length));
  if (!neighbours.length) return abstainResult('no-neighbours');
  // 5. Inverse-distance votes → class scores → confidence.
  const eps = model.epsilon != null ? model.epsilon : 1e-6;
  const scores = {};
  let total = 0;
  for (const n of neighbours) { const w = 1 / (n.d + eps); scores[n.labelName] = (scores[n.labelName] || 0) + w; total += w; }
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [top, topScore] = ranked[0];
  const secondScore = ranked[1] ? ranked[1][1] : 0;
  const confidence = total ? topScore / total : 0;
  // 6. Abstain conditions (the child-set threshold is the main one).
  if (confidence < (model.threshold != null ? model.threshold : 0.5)) return abstainResult('below-threshold', confidence, neighbours.slice(0, opts.topK || 3));
  if (model.maxNearestDistance != null && neighbours[0].d > model.maxNearestDistance) return abstainResult('too-far', confidence, neighbours.slice(0, opts.topK || 3));
  if ((model.tiePolicy || 'abstain') === 'abstain' && (topScore - secondScore) < (model.tieEpsilon || 0.05)) return abstainResult('tie', confidence, neighbours.slice(0, opts.topK || 3));
  return resultOf(top, confidence, false, null, neighbours.slice(0, opts.topK || 3).map((n) => ({ exampleIndex: n.index, label: n.labelName, distance: round3(n.d) })));
}

/**
 * Run the bundle's self-test BEFORE any live mount is allowed.
 * @returns {{ok:boolean, failures?:Array}}
 */
export function runSelftest(cap) {
  const cases = cap.selftest?.cases || [];
  if (!cases.length) return { ok: false, failures: [{ name: '(none)', reason: 'bundle declares no self-test cases' }] };
  const failures = [];
  for (const c of cases) {
    const r = runInference(cap, c.input);
    const exp = c.expect || {};
    if (exp.decision === CAP_ABSTAIN || exp.decision === '__abstain') {
      if (!r.abstained) failures.push({ name: c.name, reason: `expected abstain, got "${r.decision}"` });
    } else if (r.abstained) {
      failures.push({ name: c.name, reason: `abstained (${r.abstainReason}), expected "${exp.decision}"` });
    } else if (exp.decision && r.decision !== exp.decision) {
      failures.push({ name: c.name, reason: `expected "${exp.decision}", got "${r.decision}"` });
    }
    if (exp.minConfidence != null && !r.abstained && r.confidence < exp.minConfidence) {
      failures.push({ name: c.name, reason: `confidence ${r.confidence} < ${exp.minConfidence}` });
    }
  }
  return failures.length ? { ok: false, failures } : { ok: true };
}
