// web/coding agent/server/ai-compat.js
/**
 * Re-export seam for the ONE npm symbol the Worker shell needs directly. WHY this file exists:
 * npm packages resolve by walking UP from the IMPORTING file, and `ai`/`@ai-sdk/*` live in
 * `server/node_modules` (repo dev) or `buddy/node_modules` (packed bundle) — both on server/'s
 * walk-up path, neither on `worker/`'s in the repo layout. A `worker/index.mjs` that imported
 * '@ai-sdk/openai-compatible' directly would bundle in the packed bundle but FAIL to resolve in
 * repo dev; importing it through this server-local file resolves identically in both. gateway.js
 * (the Node shell) now imports from here too, so the two shells provably share one provider factory.
 *
 * (Added to buddy-kit as part of the worker-unification: p5-01 had this file; buddy-kit did not.)
 */
export { createOpenAICompatible } from '@ai-sdk/openai-compatible';
