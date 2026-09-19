// web/coding agent/server/config.js
/**
 * Buddy settings: which of the 7 universal project verbs the buddy may propose, an (currently
 * always-empty) roster of custom models, and the per-lesson spend cap. The stateless-buddy plan
 * deleted the settings JSON file this module used to read/write on disk, along with the admin PUT
 * routes that used to edit it (an earlier step in that same plan deleted the admin panel itself) —
 * there is no teacher-editable settings file anymore, no runtime persistence, and therefore nothing
 * here to validate/load/save. `loadConfigFromEnv` is the ONLY export: it reads `enabledOps`/
 * `spendCap` straight from `process.env` ONCE at boot (see gateway.js). `customModels` has no
 * env-var equivalent (there is no more admin UI to add one) and is hardcoded to `[]` — kept in the
 * returned shape only because `model-registry.js`'s `effectiveRegistry(customModels, envModelId)`
 * still takes it as a parameter.
 */

// logic/action-schema.js is CommonJS (shared with the browser + node:test suite — see its own
// header comment); DEFAULT import (Worker-safe — no createRequire), same pattern as engine.js,
// rather than retyping the 7 verb names here.
import actionSchemaMod from '../logic/action-schema.js';
const { OPS } = actionSchemaMod;

/** The child's per-day chat budget when the deployer says nothing at all. */
const DEFAULT_SPEND_CAP = 120000;

/**
 * Resolves the child's day budget from the environment — the ONE place
 * `BUDDY_MAX_TOKENS_PER_LESSON` is parsed. Mirrors `brake.js`'s `brakeCeilingFrom`, for the same
 * reason and against the same trap: `.env` templates ship their keys as BLANK lines
 * (`BUDDY_MAX_TOKENS_PER_LESSON=`), and `Number('')` is `0` — which `GET /api/model` advertises as
 * `spendCap: 0`, which the client's `setSpendCap` reads as "no cap known" and therefore NEVER
 * refuses a turn. A deployer who copied `.env.example` and filled in only what they had would have
 * silently deleted the child's whole budget. Blank/absent now means DEFAULT; an explicit `'0'` stays
 * the deliberate "no child budget" opt-out (symmetric with the brake's 0 = disabled, and already
 * what the client treats as no-cap); garbage throws LOUDLY at boot rather than being papered over —
 * a deploy misconfiguration must never quietly mean "unlimited".
 * @param {NodeJS.ProcessEnv|object} env - typically `process.env`; injected for testability.
 * @returns {number} tokens/day the child's browser budgets against.
 * @throws {Error} when the value is set but not a non-negative finite number.
 */
export function spendCapFrom(env) {
  const raw = env.BUDDY_MAX_TOKENS_PER_LESSON;
  if (raw === undefined || String(raw).trim() === '') return DEFAULT_SPEND_CAP;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`loadConfigFromEnv: BUDDY_MAX_TOKENS_PER_LESSON is set but not a non-negative number (0 = no child budget), got ${JSON.stringify(raw)}`);
  }
  return n;
}

/**
 * Reads the buddy's op whitelist + spend cap from the process environment. Never touches disk — this
 * is the ONLY config source now (stateless-buddy Task 5). The one way it throws is a garbage
 * `BUDDY_MAX_TOKENS_PER_LESSON` (see `spendCapFrom`), which is a deploy misconfiguration and must
 * crash at boot rather than hand every child a silently wrong budget.
 * @param {NodeJS.ProcessEnv|object} env - typically `process.env`; injected for testability.
 * @returns {{enabledOps:string[], customModels:Array<object>, spendCap:number}}
 *   `enabledOps`: all 7 `OPS` unless `BUDDY_ENABLED_OPS` (comma-separated) restricts it — an entry
 *   outside the `OPS` whitelist is silently dropped (an unrecognized op name in the env var must
 *   never smuggle a non-whitelisted string into the model's tool set).
 *   `spendCap`: `BUDDY_MAX_TOKENS_PER_LESSON` via `spendCapFrom` (blank/absent → 120000, `'0'` → a
 *   deliberate no-budget opt-out, garbage → a loud boot throw) — under the Scope Law this is
 *   no longer a server-enforced ceiling; it is the CHILD'S OWN per-day chat budget, advertised via
 *   `GET /api/model`'s `spendCap` field and enforced entirely client-side (the browser's day-keyed
 *   Lesson store). The server itself spends nothing against this number — `server/brake.js`'s
 *   deployment-wide runaway brake is the only spend limit still enforced here.
 */
export function loadConfigFromEnv(env) {
  const raw = (env.BUDDY_ENABLED_OPS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const enabledOps = raw.length ? OPS.filter((op) => raw.includes(op)) : [...OPS];
  const spendCap = spendCapFrom(env);
  return { enabledOps, customModels: [], spendCap };
}
