/**
 * gen-config.js — the AI-generation settings store: which model fills each generation step, and
 * each provider's reusable connection fields (design doc §6).
 *
 * Keys are device-held secrets: an adult types them into Settings and they live only in
 * `localStorage['studio.gen.config']` on this device — never committed, logged or shown back in full.
 * Storage access is guarded exactly like `config.js`: private-mode browsers, disabled storage, quota
 * failures and plain Node (no `localStorage`) all degrade to an in-memory copy instead of throwing.
 */

import {
  DEFAULT_MODELS, MODEL_CATALOGUE, PROVIDER_CATALOGUE, defaultControlValues, modelById, resolveModelControls,
} from './gen-models.js';

/** localStorage key under which the settings object is serialized. */
const STORAGE_KEY = 'studio.gen.config';

/** Four generation operations plus the optional texture seam. */
export const GEN_STEPS = ['edit', 'views3d', 'picture', 'picture3d', 'texture'];

/** The steps each route runs, in order. Route A: build → edit → 3D. Route B: words → picture → 3D. */
export const ROUTE_STEPS = { A: ['edit', 'views3d', 'texture'], B: ['picture', 'picture3d', 'texture'] };

/** Factory-fresh model choices and empty provider connections (real keys are never committed). */
export const GEN_DEFAULTS = Object.freeze({
  models: DEFAULT_MODELS,
  connections: Object.freeze(Object.fromEntries(Object.entries(PROVIDER_CATALOGUE).map(([id, provider]) =>
    [id, Object.freeze(Object.fromEntries(provider.fields.map((field) => [field.id, ''])))]))),
  controls: Object.freeze(Object.fromEntries(MODEL_CATALOGUE.filter((model) => model.controls)
    .map((model) => [model.id, Object.freeze(defaultControlValues(model))]))),
});

/** Last serialized settings when real storage is unavailable or failing. */
let memoryValue = null;
// Ported from src/ai/config.js at 0b9098c6: a failed mutation outranks stale storage.
let memoryOverride = false;

/** The usable localStorage, or null. Reading the global can itself throw in sandboxed contexts. */
function getStorage() {
  try {
    const ls = globalThis.localStorage;
    if (!ls || typeof ls.getItem !== 'function' || typeof ls.setItem !== 'function' ||
        typeof ls.removeItem !== 'function') {
      return null;
    }
    return ls;
  } catch (err) {
    return null;
  }
}

/** The stored string, falling back to the in-memory mirror. Never throws. */
function readStored() {
  if (memoryOverride) return memoryValue;
  try {
    const ls = getStorage();
    if (ls) {
      memoryValue = ls.getItem(STORAGE_KEY);
      return memoryValue; // null also mirrors a deletion from another tab
    }
  } catch (err) {
    /* fall through to the in-memory mirror */
  }
  return memoryValue;
}

/** Persist to storage AND memory; memory first so a failing setItem still keeps this session's value. */
function writeStored(json) {
  memoryValue = json;
  memoryOverride = true;
  try {
    const ls = getStorage();
    if (ls) { ls.setItem(STORAGE_KEY, json); memoryOverride = false; }
  } catch (err) {
    /* in-memory only — storage is unavailable */
  }
}

/** Drop the stored entry and the mirror. Never throws. */
function clearStored() {
  memoryValue = null;
  memoryOverride = true;
  try {
    const ls = getStorage();
    if (ls) { ls.removeItem(STORAGE_KEY); memoryOverride = false; }
  } catch (err) {
    /* nothing else to clear */
  }
}

const isPlain = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** A mutable copy of the defaults. */
function fresh() {
  return {
    models: { ...GEN_DEFAULTS.models },
    connections: Object.fromEntries(Object.entries(GEN_DEFAULTS.connections).map(([id, value]) => [id, { ...value }])),
    controls: Object.fromEntries(Object.entries(GEN_DEFAULTS.controls).map(([id, value]) => [id, { ...value }])),
  };
}

/**
 * Load the settings: defaults overlaid with whatever valid fields are stored.
 * Never throws — absent, corrupt or wrongly-shaped storage returns the defaults.
 * @returns {{models: Record<string,string>, connections: Record<string,Record<string,string>>}}
 */
export function loadGenConfig() {
  const out = fresh();
  const raw = readStored();
  if (raw == null) return out;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return out;
  }
  if (!isPlain(parsed)) return out;
  if (isPlain(parsed.models)) {
    for (const step of GEN_STEPS) {
      const id = parsed.models[step];
      if (typeof id === 'string' && id.trim()) out.models[step] = id.trim();
    }
  } else if (isPlain(parsed.providers)) {
    // Migrate the old provider-per-step schema. hf-spaces was its only working adapter, so each
    // such selection becomes the proven default model for that step.
    for (const step of GEN_STEPS) {
      if (parsed.providers[step] === 'hf-spaces') out.models[step] = DEFAULT_MODELS[step];
    }
  }
  if (isPlain(parsed.connections)) {
    for (const [providerId, fields] of Object.entries(parsed.connections)) {
      if (!isPlain(fields)) continue;
      out.connections[providerId] ||= {};
      for (const [fieldId, value] of Object.entries(fields)) {
        if (typeof value === 'string') out.connections[providerId][fieldId] = value;
      }
    }
  }
  if (isPlain(parsed.controls)) for (const [modelId, values] of Object.entries(parsed.controls)) {
    const model = modelById(modelId);
    if (model?.controls && isPlain(values)) out.controls[modelId] = resolveModelControls(model, values);
  }
  // Migrate the provider-key schema used by the first catalogue build.
  if (isPlain(parsed.keys)) for (const [providerId, key] of Object.entries(parsed.keys)) {
    if (typeof key === 'string' && !out.connections[providerId]?.key) {
      out.connections[providerId] ||= {};
      out.connections[providerId].key = key;
    }
  }
  return out;
}

/**
 * Merge `partial` ({models?, connections?, controls?}) into the stored settings and persist.
 * Untouched fields keep their value — saving one key must not wipe the others.
 * @param {{models?: object, connections?: object, controls?: object}} [partial]
 * @returns {{models: Record<string,string>, connections: Record<string,Record<string,string>>, controls: Record<string,Record<string,number>>}} the merged settings
 */
export function saveGenConfig(partial) {
  const current = loadGenConfig();
  const patch = isPlain(partial) ? partial : {};
  const connections = Object.fromEntries(Object.entries(current.connections).map(([id, value]) => [id, { ...value }]));
  if (isPlain(patch.connections)) for (const [id, fields] of Object.entries(patch.connections)) {
    if (isPlain(fields)) connections[id] = { ...(connections[id] || {}), ...fields };
  }
  const controls = Object.fromEntries(Object.entries(current.controls).map(([id, value]) => [id, { ...value }]));
  if (isPlain(patch.controls)) for (const [id, values] of Object.entries(patch.controls)) {
    if (isPlain(values) && controls[id]) controls[id] = { ...controls[id], ...values };
  }
  const next = { models: { ...current.models, ...(isPlain(patch.models) ? patch.models : {}) }, connections, controls };
  writeStored(JSON.stringify(next));
  return loadGenConfig();
}

/** Forget settings in this session; persistent deletion is best-effort if storage rejects it. */
export function resetGenConfig() {
  clearStored();
  return fresh();
}

/**
 * The trimmed key of the provider that fills `step`, or '' when there is none.
 * @param {object} cfg settings from loadGenConfig()
 * @param {string} step one of GEN_STEPS
 */
export function keyFor(cfg, step) {
  if (!isPlain(cfg) || !isPlain(cfg.models)) return '';
  const model = modelById(cfg.models[step]);
  const key = model?.provider ? connectionFor(cfg, model.provider).key : '';
  return typeof key === 'string' ? key.trim() : '';
}

/** A provider connection, including migration support for the old flat key map. */
export function connectionFor(cfg, providerId) {
  if (!isPlain(cfg)) return {};
  if (isPlain(cfg.connections?.[providerId])) return cfg.connections[providerId];
  const legacy = isPlain(cfg.keys) && typeof cfg.keys[providerId] === 'string' ? cfg.keys[providerId] : '';
  return legacy ? { key: legacy } : {};
}

/** Every saved secret field, for redaction at the service and panel boundaries. */
export function credentialValues(cfg) {
  if (!isPlain(cfg)) return [];
  const values = [];
  for (const [providerId, provider] of Object.entries(PROVIDER_CATALOGUE)) {
    const connection = connectionFor(cfg, providerId);
    for (const field of provider.fields) if (field.secret) values.push(connection[field.id]);
  }
  return values.filter((value) => typeof value === 'string' && value.trim());
}

/** Whether a provider has the connection fields its adapter requires. */
export function isConnectionReady(cfg, providerId) {
  const provider = PROVIDER_CATALOGUE[providerId];
  if (!provider) return false;
  const connection = connectionFor(cfg, providerId);
  const has = (id) => typeof connection[id] === 'string' && connection[id].trim() !== '';
  const required = provider.fields.filter((field) => field.required).map((field) => field.id);
  return required.every(has) && (!provider.requiredAny || provider.requiredAny.some(has));
}

/** Whether one configured step can run (or is the explicit no-op model). */
export function isStepReady(cfg, step) {
  const model = modelById(cfg?.models?.[step]);
  return !!model?.available && model.steps.includes(step) &&
    (model.provider === null || isConnectionReady(cfg, model.provider));
}

/**
 * Whether every step has an available model and every non-no-op model has its provider key.
 * @param {object} cfg settings from loadGenConfig()
 * @param {'A'|'B'} route
 */
export function isRouteReady(cfg, route) {
  const steps = ROUTE_STEPS[route];
  return !!steps && steps.every((step) => isStepReady(cfg, step));
}
