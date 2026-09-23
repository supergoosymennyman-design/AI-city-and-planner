// web/coding agent/worker/index.mjs
/**
 * Buddy Gateway — the CLOUDFLARE WORKER shell. The exact sibling of `server/gateway.js` (the Node
 * shell): same three API routes, same pre-stream screens, same one-terminal-frame streaming
 * contract, same "never leak e.message" error mapping — read that file's comments for the full
 * WHY of every rule; this file only re-documents what the WORKER runtime changes.
 *
 * WHAT CHANGES HERE, AND NOTHING ELSE:
 *   - `node:http` server → `export default { fetch }`. Workers hand us a Request and take a
 *     Response; the NDJSON stream rides a ReadableStream instead of `res.write`.
 *   - Static files → the platform. There is NO static-serving code and NO path-containment gate
 *     here because there are no file reads at all: every non-API request is delegated to the
 *     assets binding (`env.ASSETS`), which serves the deployed bundle and cannot escape it.
 *   - Boot scope → per-isolate, lazily. Node reads `process.env` once at module load; a Worker
 *     only receives `env` inside `fetch`, so the frozen boot object is built on first request and
 *     memoized. Same Scope-Law shape: boot consts are deployment scope, everything per-request
 *     stays in `runTurn`'s locals, and the ONLY mutable state is the brake — which on Workers is
 *     PER-ISOLATE (many isolates = a softer ceiling; brake.js's header + spec §7.2 already
 *     documented exactly this serverless behavior; the child's browser-side day budget is the
 *     primary limiter).
 *   - Memory seed → `mem-seed.mjs` (generated from server/memory/*.md — no filesystem here).
 *
 * Env vars/secrets: the same BUDDY_* names as the Node shell (see server/README.md), set as
 * Worker variables/secrets instead of a .env file. All optional — with none set, the buddy runs
 * on the keyless free default exactly like `node gateway.js` with a blank .env.
 */
import { createOpenAICompatible } from '../server/ai-compat.js';
import { screen } from '../server/filter.js';
import { loadConfigFromEnv } from '../server/config.js';
import { buildModel } from '../server/provider.js';
import { effectiveRegistry, lockedRegistry, byokProviders } from '../server/model-registry.js';
import { makeBrake, brakeCeilingFrom } from '../server/brake.js';
import { httpError, meterFor, composeTurnContext, runTurn, runTidyUp, runAsk, runSend } from '../server/turn.js';
import { MEM_SEED } from './mem-seed.mjs';
// DEFAULT import of the CJS frame encoder — same interop note as server/turn.js's header.
import streamFramesMod from '../logic/stream-frames.js';
const { encodeFrame } = streamFramesMod;

const MAX_BODY_BYTES = 256 * 1024; // same bound as the Node shell, same reasoning
const NDJSON_HEADERS = { 'content-type': 'application/x-ndjson', 'cache-control': 'no-cache', 'x-accel-buffering': 'no' };
// Same kid-voiced braked-turn reply as the Node shell (gateway.js BRAKE_REPLY — keep in sync).
const BRAKE_REPLY = "Our chat energy here is all used up for today! Your champion is safe and saved — we can keep building, and chat more tomorrow.";

/**
 * The frozen per-isolate deployment scope, built from `env` on first request. Mirrors gateway.js's
 * boot block member for member (config, default model, deep freezes, brake) — a throw here (a
 * malformed BUDDY_MODEL_URL/_CONTEXT var) fails every request loudly with a 500 rather than
 * silently pointing at the wrong endpoint, the Worker equivalent of "crash loudly at boot".
 */
let cached = null;
function bootFor(env) {
  if (cached) return cached;
  const config = loadConfigFromEnv(env);
  const defaultModel = buildModel(env, createOpenAICompatible);
  Object.freeze(config);
  Object.freeze(config.enabledOps);
  Object.freeze(config.customModels);
  Object.freeze(defaultModel);
  const boot = Object.freeze({ env, memSeed: MEM_SEED, config, defaultModel, createOpenAICompatible });
  const brake = makeBrake({ ceiling: brakeCeilingFrom(env), now: Date.now });
  cached = { boot, brake };
  return cached;
}

/**
 * Size-capped JSON body parse — the Worker twin of gateway.js's `body()`. The runtime already
 * buffered the request, so this is a cap-check + parse, not stream plumbing; the byte count uses
 * the ENCODED length so the bound means the same thing it means on the Node side (wire bytes,
 * where CJK is 3 bytes/char — `text.length` alone would under-count exactly those bodies).
 * @param {Request} request @returns {Promise<object>} parsed body, `{}` for an empty one.
 */
async function bodyOf(request) {
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) throw httpError(400, 'request body too large');
  if (!text) return {};
  try { return JSON.parse(text); }
  catch { throw httpError(400, 'malformed JSON body'); }
}

const json = (code, obj) => new Response(JSON.stringify(obj), { status: code, headers: { 'content-type': 'application/json' } });

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    try {
      if (request.method === 'POST' && path === '/api/turn') {
        const { boot, brake } = bootFor(env);
        const ctx = composeTurnContext(await bodyOf(request), boot);
        // Input screen + brake answer with plain JSON BEFORE any stream exists — same order and
        // same meter rule as the Node shell (nothing spent on a deflected/braked turn).
        const inScreen = screen(ctx.message);
        if (!inScreen.ok) {
          return json(200, { reply: inScreen.deflection, actions: [], source: 'filter', meter: meterFor(null, ctx.lastMeterTotal, ctx.model.contextLimit) });
        }
        if (!brake.check().ok) {
          return json(200, { reply: BRAKE_REPLY, actions: [], source: 'capped', meter: meterFor(null, ctx.lastMeterTotal, ctx.model.contextLimit) });
        }
        const enc = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            // runTurn's own contract is "never throws" (every failure path writes its one terminal
            // frame) — this catch is belt-and-braces for a transport-layer enqueue failure only,
            // mirroring how the Node shell treats a synchronous res.write throw as its own concern.
            try {
              await runTurn(ctx, boot, { write: (f) => controller.enqueue(enc.encode(encodeFrame(f))), brake });
            } catch (e) {
              console.error('[worker] stream transport failed', e?.stack || e);
            }
            try { controller.close(); } catch { /* already closed/errored — nothing left to do */ }
          },
        });
        return new Response(stream, { headers: NDJSON_HEADERS });
      }
      if (request.method === 'POST' && path === '/api/tidy-up') {
        const { boot, brake } = bootFor(env);
        return json(200, await runTidyUp(await bodyOf(request), boot, { brake }));
      }
      // The AI-Machines workshop's power blocks — same handlers, same degradation contracts as
      // the Node shell (see gateway.js's route comments).
      if (request.method === 'POST' && path === '/api/ask') {
        const { boot, brake } = bootFor(env);
        return json(200, await runAsk(await bodyOf(request), boot, { brake }));
      }
      if (request.method === 'POST' && path === '/api/send') {
        const { boot } = bootFor(env);
        // No `lookup` here on purpose: Workers have no dns module, and the platform's own egress
        // cannot reach private ranges — the literal-IP + name checks inside runSend still apply.
        return json(200, await runSend(await bodyOf(request), boot, {}));
      }
      if (request.method === 'GET' && path === '/api/model') {
        const { boot } = bootFor(env);
        // Same shape + same "env read for key PRESENCE, never serialized" rule as the Node shell.
        return json(200, {
          current: boot.defaultModel.modelId,
          models: effectiveRegistry(boot.config.customModels, env.BUDDY_MODEL_ID, env),
          lockedModels: lockedRegistry(env),
          byokProviders: byokProviders(),
          spendCap: boot.config.spendCap,
        });
      }
      // Unknown /api/* path → clean 404 (same last-API-check rule as the Node shell).
      if (path.startsWith('/api/')) return json(404, { error: 'not found' });
      // Everything else is a static file — the platform's job, contained by construction. BUT the
      // buddy CLIENT must answer at the ROOT, exactly as the Node gateway serves it (buddy-boot.js
      // derives every dependency URL from its own src, and the game loads `<base>/buddy-boot.js`
      // with base='' once the /api/model probe succeeds at this origin). In the deployed bundle the
      // kit lives under /buddy/, so a root-path MISS retries the same two mounts route-static.js
      // gives the Node shell: `/logic/*` → the kit's logic dir, anything else → the kit's client
      // dir. Only on a miss — the game's own files at the root always win first — and only via the
      // assets binding, so containment is the platform's, not ours.
      if (env.ASSETS) {
        const direct = await env.ASSETS.fetch(request);
        if (direct.status !== 404 || request.method !== 'GET' || path.startsWith('/buddy/')) return direct;
        const mounted = path.startsWith('/logic/') ? '/buddy' + path : '/buddy/client' + path;
        const retry = await env.ASSETS.fetch(new Request(new URL(mounted, request.url), request));
        return retry.status === 404 ? direct : retry;
      }
      return json(404, { error: 'not found' });
    } catch (e) {
      const isApi = path.startsWith('/api');
      const status = Number.isInteger(e?.status) ? e.status : (isApi ? 500 : 404);
      // The STACK, never the object — an AI-SDK error's own fields can carry a child's whole
      // conversation, and a deployment log must never pool chat content (gateway.js's rule).
      console.error('[worker]', e?.stack || e);
      const message = status === 400 ? 'bad request' : isApi ? 'internal error' : 'not found';
      return json(status, { error: message });
    }
  },
};
