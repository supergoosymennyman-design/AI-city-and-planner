// web/coding agent/server/provider.js
/**
 * Turns env vars into an AI-SDK model config. Pure — never imports `@ai-sdk/openai-compatible`
 * itself; `createFn` is injected (the gateway passes the real `createOpenAICompatible`, tests pass
 * a fake that records its arguments) so this module stays offline-testable.
 *
 * WHY the default URL: `DEFAULT_BASE_URL` below is the ONE brand-adjacent string kept in this
 * codebase — it is the single counsel-swappable external endpoint default (exported so tests
 * reference it instead of retyping the literal). A future teacher-keyed
 * or district-provided model swaps in purely via `BUDDY_MODEL_URL`/`BUDDY_MODEL_ID`/`BUDDY_MODEL_KEY`
 * env vars, with no code change.
 */

export const DEFAULT_BASE_URL = 'https://opencode.ai/zen/v1';
const DEFAULT_MODEL_ID = 'deepseek-v4-flash-free';
const DEFAULT_CONTEXT = 200000;

/**
 * @param {{BUDDY_MODEL_URL?:string, BUDDY_MODEL_ID?:string, BUDDY_MODEL_CONTEXT?:string,
 *   BUDDY_MODEL_KEY?:string}} env
 * @param {(config:{name:string, baseURL:string, apiKey:string|undefined, includeUsage:boolean}) =>
 *   (modelId:string) => object} createFn - injected factory, e.g. createOpenAICompatible.
 * @returns {{model:object, contextLimit:number|null, modelId:string, baseURL:string}}
 */
export function buildModel(env, createFn) {
  const baseURL = env.BUDDY_MODEL_URL || DEFAULT_BASE_URL;
  // Loud failure: a set-but-malformed BUDDY_MODEL_URL must never silently fall back to the
  // default — that would quietly point a counsel-swapped deploy back at the wrong endpoint.
  if (env.BUDDY_MODEL_URL) {
    try {
      // eslint-disable-next-line no-new
      new URL(env.BUDDY_MODEL_URL);
    } catch {
      throw new Error(`buildModel: BUDDY_MODEL_URL is set but not a parseable URL: ${JSON.stringify(env.BUDDY_MODEL_URL)}`);
    }
  }
  const modelId = env.BUDDY_MODEL_ID || DEFAULT_MODEL_ID;
  // Blank means ABSENT, not 0: `.env` templates ship the key as a bare `BUDDY_MODEL_CONTEXT=` line,
  // and `Number('')` is 0 — which this function reads as the deliberate honest-unknown opt-out and
  // would silently switch off every meter percentage for a deployer who just copied .env.example.
  // An explicit '0' still means honest-unknown; garbage still throws below.
  const ctxRaw = env.BUDDY_MODEL_CONTEXT;
  const ctxSet = ctxRaw !== undefined && String(ctxRaw).trim() !== '';
  const rawContext = ctxSet ? Number(ctxRaw) : DEFAULT_CONTEXT;
  // Loud failure, same reasoning as the URL check: a set-but-garbage context limit would feed the
  // Meter NaN/negative math forever, silently.
  if (!Number.isFinite(rawContext) || rawContext < 0) {
    throw new Error(`buildModel: BUDDY_MODEL_CONTEXT is set but not a non-negative number: ${JSON.stringify(env.BUDDY_MODEL_CONTEXT)}`);
  }
  const contextLimit = rawContext === 0 ? null : rawContext; // 0 => honest "unknown", not a real cap
  const provider = createFn({ name: 'buddy-model', baseURL, apiKey: env.BUDDY_MODEL_KEY, includeUsage: true });
  const model = provider(modelId);
  return { model, contextLimit, modelId, baseURL };
}
