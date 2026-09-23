/**
 * gen-service.js — runs ONE generation step through the provider Settings names for it (design doc §6),
 * with a timeout, cancellation, progress callbacks and plain-language errors.
 *
 * The panel calls steps one at a time because the child chooses "Use this" / "Try again" between them.
 * Providers are injected (`providers[id] = (key, model) => provider`), so tests use a fake and nothing here
 * touches the network. A key is only ever handed to its own provider, and is redacted from every
 * error detail before it can reach the screen.
 */
import { EXPECTED_MS, STEP_TIMEOUT_MS, TIMEOUT_MS } from './gen-progress.js';
import { GEN_STEPS, connectionFor, credentialValues, isConnectionReady, keyFor } from './gen-config.js';
import { modelById } from './gen-models.js';

/** The provider method that fills each step (the design doc's interface names). */
export const STEP_METHOD = {
  edit: 'editViews', views3d: 'viewsTo3D', picture: 'wordsToPicture',
  picture3d: 'pictureTo3D', texture: 'textureMesh',
};

/** What the child (and the adult nearby) is told. The key never appears in any of these. */
export const ERROR_TEXT = {
  'no-key': 'An adult needs to set up the AI connection in Settings first.',
  'bad-key': 'The AI key was not accepted. An adult can check it in Settings.',
  quota: "Today's AI time is used up. Try again later, or show the sample.",
  busy: 'The AI service is busy. Try again, or show the sample.',
  timeout: 'The AI service is busy. Try again, or show the sample.',
  down: "The AI service can't be reached right now. Try again, or show the sample.",
  cancelled: 'Stopped.',
  failed: 'Something went wrong making this. Try again, or show the sample.',
};

export class GenError extends Error {
  /**
   * @param {string} code a key of ERROR_TEXT (anything else becomes 'failed')
   * @param {string} [detail] extra text for adults — already redacted
   */
  constructor(code, detail = '') {
    const known = Object.prototype.hasOwnProperty.call(ERROR_TEXT, code);
    super(known ? ERROR_TEXT[code] : ERROR_TEXT.failed);
    this.name = 'GenError';
    this.code = known ? code : 'failed';
    this.detail = String(detail || '');
  }
}

/** Remove the key (and anything shaped like a Hugging Face token) from a message. */
export function redact(text, keyOrKeys) {
  let out = String(text ?? '');
  const keys = (Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys])
    .filter((k) => typeof k === 'string' && k.trim()).flatMap((k) => [k, k.trim()]);
  // One regex pass prevents a short key matching inside a previously inserted marker.
  const escaped = [...new Set(keys)].sort((a, b) => b.length - a.length)
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (escaped.length) out = out.replace(new RegExp(escaped.join('|'), 'g'), '[key]');
  return out.replace(/hf_[A-Za-z0-9]{8,}/g, '[key]');
}

/** Map a raw provider error to a GenError code. */
export function classify(err) {
  if (err instanceof GenError) return err.code;
  if (err && err.name === 'AbortError') return 'cancelled';
  const m = String((err && err.message) || err || '').toLowerCase();
  if (/zerogpu|quota|runs limit|exceeded your/.test(m)) return 'quota';
  if (/\b401\b|\b403\b|unauthori[sz]ed|forbidden|invalid (user )?(access )?token|token is invalid/.test(m)) return 'bad-key';
  if (/queue is full|too many requests|\b429\b|\b503\b|busy/.test(m)) return 'busy';
  if (/failed to fetch|networkerror|network error|could not connect|could not resolve|econnrefused|enotfound|space (is )?(sleeping|paused)/.test(m)) return 'down';
  return 'failed';
}

/** Unknown errors have no detail by default (especially if reading settings itself failed). */
export function safeGenError(err, keys = [], allowDetail = false) {
  try {
    return new GenError(classify(err), allowDetail
      ? redact(err instanceof GenError ? err.detail : err?.message || err, keys) : '');
  } catch { return new GenError('failed'); }
}

export const CHECK_TIMEOUT_MS = 15000;

/** Reject promptly even when work ignores abort; observe late rejections and clear all guards. */
export async function bounded(work, { signal, timeoutMs, timers = globalThis }) {
  if (signal?.aborted) throw new GenError('cancelled');
  const inner = new AbortController();
  let rejectGuard;
  const guard = new Promise((_, reject) => { rejectGuard = reject; });
  const stop = (code) => { rejectGuard(new GenError(code)); inner.abort(); };
  const onAbort = () => stop('cancelled');
  signal?.addEventListener('abort', onAbort, { once: true });
  const timer = timers.setTimeout(() => stop('timeout'), timeoutMs);
  guard.catch(() => {});
  try {
    if (signal?.aborted) { onAbort(); throw new GenError('cancelled'); }
    return await Promise.race([Promise.resolve(work(inner.signal)), guard]);
  } finally {
    timers.clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * @param {{providers: Record<string, (key: string, model: object) => object>, config: () => object, timers?: {setTimeout: Function, clearTimeout: Function}}} deps
 */
export function createGenService({ providers, config, timers = globalThis }) {
  if (!providers || typeof config !== 'function') {
    throw new Error('createGenService: providers and config() are required');
  }

  function providerFor(cfg, step) {
    const model = modelById(cfg.models?.[step]);
    if (!model) throw new GenError('failed', `unknown model "${cfg.models?.[step] || ''}"`);
    if (!model.available) throw new GenError('failed', `the model "${model.name}" is not connected`);
    if (!model.steps.includes(step)) throw new GenError('failed', `the model "${model.name}" cannot do this step`);
    if (!model.provider) throw new GenError('failed', `the "${model.name}" step must be skipped`);
    const connection = connectionFor(cfg, model.provider);
    if (!isConnectionReady(cfg, model.provider)) throw new GenError('no-key');
    const key = keyFor(cfg, step);
    const make = providers[model.provider];
    if (typeof make !== 'function') throw new GenError('failed', `no provider called "${model.provider}"`);
    return make(key, model, { ...connection, controlValues: cfg.controls?.[model.id] });
  }

  /**
   * Run one step. Resolves with the provider's result (a Blob in the app), rejects with a GenError.
   * @param {string} step one of STEP_METHOD's keys
   * @param {object} input the step's input (see the provider contract)
   * @param {{onProgress?: Function, signal?: AbortSignal}} [opts]
   */
  async function runStep(step, input, { onProgress = () => {}, signal } = {}) {
    let keys = [], configured = false, active = true;
    const started = Date.now();
    try {
      if (signal?.aborted) throw new GenError('cancelled');
      const cfg = config();
      keys = credentialValues(cfg);
      configured = true;
      const method = Object.hasOwn(STEP_METHOD, step) ? STEP_METHOD[step] : null;
      if (!method) throw new GenError('failed', 'unknown step');
      const result = await bounded((innerSignal) => {
        const provider = providerFor(cfg, step); // factory and method getters are inside the boundary
        if (typeof provider?.[method] !== 'function') throw new GenError('failed', 'the provider cannot do this step');
        const report = (status) => {
          if (active && !innerSignal.aborted) onProgress({ ...status, step, elapsedMs: Date.now() - started, expectedMs: EXPECTED_MS[step] });
        };
        report({ stage: 'starting' });
        return provider[method](input, { onStatus: report, signal: innerSignal });
      }, { signal, timeoutMs: TIMEOUT_MS[step] || STEP_TIMEOUT_MS, timers });
      onProgress({ step, elapsedMs: Date.now() - started, expectedMs: EXPECTED_MS[step], stage: 'done' });
      return result;
    } catch (err) {
      throw safeGenError(err, keys, configured);
    } finally {
      active = false;
    }
  }

  /** Check every step's provider, for the "Test the AI services" button. Never throws. */
  async function checkAll({ signal } = {}) {
    let cfg, keys;
    try {
      cfg = config();
      keys = credentialValues(cfg);
    } catch {
      return GEN_STEPS.map((step) => ({ step, provider: '', ok: false, detail: ERROR_TEXT.failed }));
    }
    const rows = [];
    for (const step of GEN_STEPS) {
      const model = modelById(cfg?.models?.[step]);
      const id = redact(model?.id || cfg?.models?.[step] || '', keys);
      try {
        if (signal?.aborted) throw new GenError('cancelled');
        if (model?.provider === null) {
          rows.push({ step, provider: id, ok: true, detail: 'skipped' });
          continue;
        }
        if (!isConnectionReady(cfg, model?.provider)) { rows.push({ step, provider: id, ok: false, detail: 'no connection' }); continue; }
        const r = await bounded((innerSignal) => {
          const p = providerFor(cfg, step);
          if (typeof p?.check !== 'function') throw new GenError('failed', 'this provider has no check');
          return p.check(step, { signal: innerSignal });
        }, { signal, timeoutMs: CHECK_TIMEOUT_MS, timers });
        rows.push({ step, provider: id, ok: !!r?.ok, detail: redact(r?.detail || '', keys) });
      } catch (err) {
        const e = safeGenError(err, keys, true);
        rows.push({ step, provider: id, ok: false, detail: e.detail || e.message });
      }
    }
    return rows;
  }

  return { runStep, checkAll };
}
