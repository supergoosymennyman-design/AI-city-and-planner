/**
 * The model menu: WHICH provider endpoints exist (`PROVIDERS`) and WHICH models are offered on each
 * (`MODELS` / `KEYED_MODELS`). `effectiveRegistry` is the one function that turns those into the list
 * the child's picker shows — and the SAME list `server/turn.js`'s `resolveRequestModel` validates
 * every `/api/turn` request against, so the picker and the whitelist can never disagree.
 *
 * DESIGN — provider first, model second (the shape Hermes Agent's PROVIDER_REGISTRY uses, and the
 * reason it scales past one vendor): endpoint + credential live ONCE on the provider; a model entry
 * just names its provider. Adding a second model from the same vendor is then one line, not a copy of
 * the endpoint config. `effectiveRegistry` RESOLVES each offered model down to a flat entry still
 * carrying `baseURL` + `keyEnv`, which is exactly what `gateway.js`'s live `/api/model` switch and
 * `verify-models.mjs`'s `resolveEndpoint` already read — so this refactor needs no call-site changes.
 *
 * WE SHIP NO KEYS, AND WE RESTRICT NO MARKET. Every provider is an empty slot the deployer fills (see
 * `server/.env.example`). A model behind a key bills that key's owner. Which providers suit a given
 * school is the deployer's call, which is why this file offers everything rather than choosing for them.
 *
 * NAMING IS HONEST — real model name + who made it. This product teaches AI literacy and the
 * Definition of Done requires "AI representation honest", so the picker must not hide GPT behind a
 * mascot name. A child reading "Gemini 3.5 Flash · Google · very fast" learns three true things: AI
 * comes from companies, models differ, and this one is Google's. Cute names delete that lesson.
 * `maker` is omitted where we could not verify the attribution — never guessed.
 */

/**
 * Provider endpoints. `baseURL` is the verified default; `baseUrlEnv` overrides it (required when
 * there IS no fixed default — see `alibaba`). `keyEnvs` is a LIST because deployers arrive with a
 * key already exported under one of several conventional names; the first non-blank one wins.
 *
 * Availability (see `providerAvailable`): `alwaysOn` providers are always offered — that keeps the
 * zero-config default working with an empty `.env`. Every other provider appears only once the
 * deployer supplies a key (or, for a keyless/self-hosted endpoint, its base URL). Fail-closed: an
 * un-configured provider's models reach neither the picker nor the whitelist, so nothing a child can
 * tap is able to 401 mid-lesson.
 *
 * Every `baseURL` here was read from the provider's own docs on 2026-07-25 — none from memory.
 */
export const PROVIDERS = Object.freeze([
  Object.freeze({
    id: 'zen', label: 'Zen', alwaysOn: true,
    baseURL: 'https://opencode.ai/zen/v1', baseUrlEnv: 'ZEN_BASE_URL', keyEnvs: [],
    note: 'the built-in no-key default — free models, no account needed',
  }),
  Object.freeze({
    id: 'openrouter', label: 'OpenRouter',
    baseURL: 'https://openrouter.ai/api/v1', baseUrlEnv: 'OPENROUTER_BASE_URL',
    keyEnvs: ['OPENROUTER_API_KEY'],
    note: 'aggregator — one key reaches hundreds of models across many vendors',
  }),
  Object.freeze({
    id: 'deepseek', label: 'DeepSeek',
    baseURL: 'https://api.deepseek.com', baseUrlEnv: 'DEEPSEEK_BASE_URL',
    keyEnvs: ['DEEPSEEK_API_KEY'],
    note: 'direct from DeepSeek',
  }),
  Object.freeze({
    // No fixed baseURL exists: Alibaba's OpenAI-compatible URL embeds the account's own workspace id
    // (`https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1`), and the region
    // differs per deployment (Singapore vs Beijing). So the deployer MUST supply it — the single
    // clearest reason every provider needs a base-URL env override, not just self-hosted ones.
    id: 'alibaba', label: 'Alibaba Model Studio', requiresBaseUrl: true,
    baseURL: null, baseUrlEnv: 'ALIBABA_BASE_URL',
    keyEnvs: ['DASHSCOPE_API_KEY', 'ALIBABA_API_KEY'],
    note: 'Qwen models; workspace- and region-specific URL, so ALIBABA_BASE_URL is required',
  }),
]);

/** @param {string} id @returns {object|undefined} */
export const findProvider = (id) => PROVIDERS.find((p) => p.id === id);

/** An env var counts as SUPPLIED only when it holds non-blank text. `OPENROUTER_API_KEY=` (empty) is
 *  a common deploy slip; treating it as set would surface options that can only 401. */
const supplied = (env, name) => typeof env?.[name] === 'string' && env[name].trim() !== '';

/**
 * Resolve a provider's live endpoint + credential from the environment.
 * @param {object} provider @param {Record<string,string|undefined>} env
 * @returns {{baseURL:string|null, apiKey:string|undefined, keyEnv:string|undefined}}
 */
export function resolveProvider(provider, env = {}) {
  const baseURL = supplied(env, provider.baseUrlEnv) ? env[provider.baseUrlEnv].trim() : provider.baseURL;
  // Report WHICH key env was used, not the secret: gateway.js re-reads it from process.env by name,
  // so the key value never has to travel through the registry or out over /api/model.
  const keyEnv = (provider.keyEnvs ?? []).find((name) => supplied(env, name));
  return { baseURL, apiKey: keyEnv ? env[keyEnv] : undefined, keyEnv };
}

/**
 * Is this provider offered? `alwaysOn` → yes (preserves the zero-config default). Otherwise it needs
 * a key, or — for a keyless/self-hosted endpoint — its base URL, since that is the deployer's signal
 * that the endpoint exists. A `requiresBaseUrl` provider additionally needs one, having no default.
 * @param {object} provider @param {Record<string,string|undefined>} env @returns {boolean}
 */
export function providerAvailable(provider, env = {}) {
  const hasUrl = supplied(env, provider.baseUrlEnv) || Boolean(provider.baseURL);
  if (provider.requiresBaseUrl && !supplied(env, provider.baseUrlEnv)) return false;
  if (!hasUrl) return false;
  if (provider.alwaysOn) return true;
  return (provider.keyEnvs ?? []).some((name) => supplied(env, name)) || supplied(env, provider.baseUrlEnv);
}

/**
 * BYOK-capable (spec §5.2/§7.4): a provider a CLIENT may bring its own key for. Requires a fixed,
 * verified `baseURL` (endpoints must never be client-supplied — the SSRF gate) and a real key slot
 * (`keyEnvs` non-empty: Zen is keyless, so there is nothing to bring). `requiresBaseUrl` providers
 * (alibaba) are excluded for the same SSRF reason — their endpoint is per-account.
 * @param {object|undefined} provider @returns {boolean}
 */
export const byokCapable = (provider) =>
  Boolean(provider) && !provider.requiresBaseUrl && Boolean(provider.baseURL) && (provider.keyEnvs ?? []).length > 0;

/** The client's "add any model" provider menu — ids + labels only, never endpoints or env names. */
export function byokProviders() {
  return PROVIDERS.filter(byokCapable).map((p) => ({ id: p.id, label: p.label }));
}

/**
 * The picker's LOCKED section (spec §5.1): curated `KEYED_MODELS` on a BYOK-capable provider the
 * deployer did NOT enable — the client renders these dimmed with "needs a key". Env-enabled
 * providers are absent (their models already ride `effectiveRegistry`, unlocked for everyone).
 * Display fields only: `keyEnv`/`baseURL` deliberately never leave the server.
 * @param {Record<string,string|undefined>} [env={}] @returns {Array<object>} frozen entries
 */
export function lockedRegistry(env = {}) {
  return KEYED_MODELS
    .filter((m) => { const p = findProvider(m.provider); return byokCapable(p) && !providerAvailable(p, env); })
    .map((m) => Object.freeze({
      id: m.id, label: m.label, ...(m.maker ? { maker: m.maker } : {}), kidNote: m.kidNote,
      provider: m.provider, providerLabel: findProvider(m.provider).label, contextLimit: m.contextLimit,
    }));
}

/**
 * The always-available models: no key, no account, so they lead the picker and keep an empty `.env`
 * working. Ids are Zen's own naming; `label`/`maker` name the real underlying model — the free list
 * CHURNS (hy3-free passed 2026-07-20, gone by 07-21), so re-check before a session with
 * `node server/scripts/verify-models.mjs`. contextLimit 200000 is Zen's documented default.
 */
export const MODELS = Object.freeze([
  Object.freeze({ id: 'deepseek-v4-flash-free', provider: 'zen', label: 'DeepSeek V4 Flash', maker: 'DeepSeek', kidNote: 'fast and chatty — the usual buddy brain', contextLimit: 200000 }),
  // maker omitted: MiMo's vendor was not verified from a primary source, and a guessed attribution
  // would break the honest-naming rule this file exists to keep.
  Object.freeze({ id: 'mimo-v2.5-free', provider: 'zen', label: 'MiMo v2.5', kidNote: 'quick and playful', contextLimit: 200000 }),
  Object.freeze({ id: 'nemotron-3-ultra-free', provider: 'zen', label: 'Nemotron 3 Ultra', maker: 'NVIDIA', kidNote: 'big and thoughtful', contextLimit: 200000 }),
  Object.freeze({ id: 'north-mini-code-free', provider: 'zen', label: 'North Mini Code', maker: 'Cohere', kidNote: 'small brain that loves code', contextLimit: 200000 }),
]);

/**
 * Models on a provider the deployer must enable first.
 *
 * WHY THESE IDS — routers and aliases wherever they exist, because the ids that name a version rot:
 *   1. CANNOT ROT: `openrouter/free` (Free Models Router — auto-routes to whichever free model is up)
 *      and `~author/model-latest` (OpenRouter's documented alias form, always the family's newest).
 *      Prefer these; add a family this way when its alias exists.
 *   2. CAN ROT: a concrete `author/model` slug or a vendor's own model id, used where no alias exists.
 *      `node server/scripts/check-openrouter-slugs.mjs` verifies the OpenRouter ones against the live
 *      public model list — no API key needed, so it runs in CI or on a fresh checkout.
 * Every id below was read from the provider's own docs or live model list on 2026-07-25.
 *
 * WHY contextLimit 0: 0 means honest-unknown (provider.js maps it to `null`, and the Memory Meter
 * shows "unknown" instead of a fabricated percentage). Routers and aliases genuinely vary per
 * request, and the vendors' real windows were not measured here — a number would be a guess.
 * A deployer who pins one model can set `BUDDY_MODEL_CONTEXT` to its real figure.
 */
export const KEYED_MODELS = Object.freeze([
  // OpenRouter — one key, many vendors. The two aliases are how GPT and Claude stay current for free.
  Object.freeze({ id: 'openrouter/free', provider: 'openrouter', label: 'Free Router', maker: 'OpenRouter', kidNote: 'picks whichever free model is awake', contextLimit: 0 }),
  Object.freeze({ id: '~openai/gpt-latest', provider: 'openrouter', label: 'GPT (latest)', maker: 'OpenAI', kidNote: 'strong all-rounder', contextLimit: 0 }),
  Object.freeze({ id: '~anthropic/claude-opus-latest', provider: 'openrouter', label: 'Claude Opus (latest)', maker: 'Anthropic', kidNote: 'deep thinker — takes its time', contextLimit: 0 }),
  Object.freeze({ id: 'google/gemini-3.5-flash', provider: 'openrouter', label: 'Gemini 3.5 Flash', maker: 'Google', kidNote: 'very fast with a huge memory', contextLimit: 0 }),
  // DeepSeek direct — ids from api-docs.deepseek.com.
  Object.freeze({ id: 'deepseek-v4-flash', provider: 'deepseek', label: 'DeepSeek V4 Flash', maker: 'DeepSeek', kidNote: 'fast and low cost', contextLimit: 0 }),
  Object.freeze({ id: 'deepseek-v4-pro', provider: 'deepseek', label: 'DeepSeek V4 Pro', maker: 'DeepSeek', kidNote: 'stronger, costs more', contextLimit: 0 }),
  // Alibaba Model Studio — id from their OpenAI-compatibility docs.
  Object.freeze({ id: 'qwen-plus', provider: 'alibaba', label: 'Qwen Plus', maker: 'Alibaba', kidNote: 'strong in Chinese', contextLimit: 0 }),
]);

/** True for ids that CANNOT rot: `openrouter/…` routers and `~author/model-latest` aliases.
 *  Everything else is a concrete id the rot-check script verifies against the live list. */
export const isStableModelId = (id) => id.startsWith('~') || id.startsWith('openrouter/');

/**
 * @param {string} id
 * @param {Array<object>} [customModels] admin-added entries (school/district models); only ones
 *   with `verified===true` count — an unverified custom entry must never resolve, even by id.
 * @returns {object|null} the registry entry (curated OR verified custom), or null if neither.
 *   NOTE: this does NOT resolve `KEYED_MODELS`, and the request-time whitelist is
 *   `effectiveRegistry` (called from `turn.js`'s `resolveRequestModel`) — not this function.
 *   A key-gated id therefore returns null here, which fails CLOSED (refused) rather than open;
 *   keep it that way if you ever wire this into an auth path.
 */
export function findModel(id, customModels = []) {
  const curatedHit = MODELS.find((m) => m.id === id);
  if (curatedHit) return curatedHit;
  return customModels.find((m) => m.id === id && m.verified === true) ?? null;
}

/** Flatten a model + its provider into the shape every consumer already expects: the model's own
 *  fields plus a resolved `baseURL` and the NAME of the key env to read. Keeps `gateway.js` and
 *  `verify-models.mjs` working unchanged across the provider refactor. */
function resolveModel(model, env) {
  const provider = findProvider(model.provider);
  if (!provider) return null; // a model naming a provider that doesn't exist is dropped, never thrown
  const { baseURL, keyEnv } = resolveProvider(provider, env);
  return Object.freeze({ ...model, providerLabel: provider.label, baseURL, keyEnv });
}

/**
 * The full list the picker shows — and the SAME list `turn.js`'s `resolveRequestModel` validates
 * every turn's `model` field against.
 *
 * Order: always-available models first (no key needed), then the models whose provider the deployer
 * has enabled, then verified custom entries, then — if the teacher's env-configured default model is
 * in none of those — a synthesized entry so the picker can still show and return to it (env
 * overrides must keep working per provider.js's contract).
 *
 * Collision rules (silent-drop, never throw — a misconfiguration must not crash the picker): a
 * custom id matching a listed id is dropped (listed wins, being pinned to a known-good endpoint);
 * a duplicated custom id keeps only its first occurrence.
 *
 * @param {Array<object>} [customModels] admin-added entries; only `verified===true` ones are used.
 * @param {string} [envModelId] the BUDDY_MODEL_ID env value, if the teacher set one.
 * @param {Record<string,string|undefined>} [env={}] the environment, read only to decide which
 *   providers are enabled and to resolve their endpoints. Defaults to `{}` so an un-updated call site
 *   offers the always-available models and nothing needing a key it cannot see — the safe direction.
 * @returns {Array<object>}
 */
export function effectiveRegistry(customModels = [], envModelId, env = {}) {
  const list = [];
  const seenIds = new Set();
  const add = (entry) => { if (entry && !seenIds.has(entry.id)) { seenIds.add(entry.id); list.push(entry); } };

  for (const m of MODELS) add(resolveModel(m, env));
  // Provider-gated models: offered only where the deployer enabled that provider. Placed after the
  // always-available ones so the picker reads free-and-ready → what this school turned on → custom.
  for (const m of KEYED_MODELS) {
    const provider = findProvider(m.provider);
    if (!provider || !providerAvailable(provider, env)) continue; // not enabled → never offered, never whitelisted
    add(resolveModel(m, env));
  }
  for (const entry of customModels) {
    if (entry.verified !== true) continue; // unverified custom entries never reach the picker
    add(entry);
  }
  if (envModelId && !seenIds.has(envModelId)) {
    add({ id: envModelId, label: envModelId, kidNote: 'teacher-configured', contextLimit: 200000 });
  }
  return list;
}

/**
 * Always-available models + an env-configured default id, with no custom entries and no
 * provider-gated options (it passes no `env`, so every non-`alwaysOn` provider stays off). A thin
 * convenience wrapper for callers that only have an env model id; the gateway's `/api/model` routes
 * call `effectiveRegistry` directly with `process.env` so their menu and whitelist include whatever
 * the deployer enabled.
 * @param {string|undefined} envModelId @returns {Array<object>}
 */
export function registryFor(envModelId) {
  return effectiveRegistry([], envModelId);
}
