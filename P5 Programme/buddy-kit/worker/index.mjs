// web/coding agent/worker/index.mjs
/**
 * Buddy Gateway — the CLOUDFLARE WORKER shell. The exact sibling of `server/gateway.js` (the Node
 * shell): same three API routes, same pre-stream screens, same one-terminal-frame streaming
 * contract, same "never leak e.message" error mapping — read that file's comments for the full
 * WHY of every rule; this file only re-documents what the WORKER runtime changes.
 *
 * (Port into buddy-kit as part of the worker-unification: this shell was proven on p5-01 and now
 * ships from buddy-kit so there is ONE server implementation instead of two forks.)
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
import { httpError, meterFor, composeTurnContext, runTurn, runTidyUp } from '../server/turn.js';
import { MEM_SEED } from './mem-seed.mjs';
// DEFAULT import of the CJS frame encoder — same interop note as server/turn.js's header.
import streamFramesMod from '../logic/stream-frames.js';
const { encodeFrame } = streamFramesMod;

const MAX_BODY_BYTES = 256 * 1024; // same bound as the Node shell, same reasoning
const NDJSON_HEADERS = { 'content-type': 'application/x-ndjson', 'cache-control': 'no-cache', 'x-accel-buffering': 'no' };
// Same kid-voiced braked-turn reply as the Node shell (gateway.js BRAKE_REPLY — keep in sync).
const BRAKE_REPLY = "Our chat energy here is all used up for today! Your champion is safe and saved — we can keep building, and chat more tomorrow.";

// ── Cloud save/load (Champion File backup across devices/lessons) ────────────
// A student's city state is written to the SAVES KV namespace under a short,
// kid-friendly code they write down (no accounts, no PII — the code is an
// opaque key and the payload is their own city data).
//
// v2 codes are FOUR easy words ("tiger-bamboo-river-umbrella") — much easier for
// a 10-year-old to write down than alphanumerics. Legacy `NOVA-XXXXXX` codes are
// still accepted (and re-saved under their original key) for backward compat.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no I/L/O/0/1
const CODE_LEN = 6;
const CODE_PREFIX = 'NOVA-';
const MAX_SAVE_BYTES = 1024 * 1024; // 1 MB — a city state is a few KB; GLBs are never in the file
// The save label is free text a child types, so it is SCREENED + length-capped before it is stored
// in KV (PII hardening, audit A5/A7 follow-up): a child who ignores the "no real name" copy must not
// be able to park a name in the cloud. Anything flagged or over-long falls back to the neutral
// default rather than erroring — a save must never fail because of its label.
const MAX_LABEL_CHARS = 64;

const WORDS = ('tiger bamboo river umbrella cloud robot rocket star sun moon apple tree lion fox '
  + 'dragon turtle monkey rabbit dolphin whale eagle castle island ocean garden forest planet '
  + 'comet meteor galaxy rocket lantern bubble rocket bridge tunnel tunnel kite balloon camera '
  + 'pencil paper desk chair window door school library museum tower lantern dolphin coral '
  + 'pearl amber opal ruby topaz silver bronze copper iron gold stone pebble shell feather '
  + 'acorn leaf seed flower berry honey bread cheese milk juice mango lemon peach cherry '
  + 'grape melon banana orange apple cookie muffin waffle pancake dumpling noodle rice soup '
  + 'curry salad pizza burger taco sushi toast butter jam cream sugar salt pepper '
  + 'north south east west summer autumn winter spring holiday morning noon evening night '
  + 'friend buddy helper captain pilot sailor farmer baker builder painter dancer singer '
  + 'hero legend champion warden keeper scout hunter ranger knight wizard ninja samurai '
  + 'kite lantern pearl').split(/\s+/).filter((w, i, a) => a.indexOf(w) === i);

function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

/** A 4-word mnemonic code, e.g. "tiger-bamboo-river-umbrella". */
function randomWordCode() {
  const seen = new Set();
  while (seen.size < 4) seen.add(pick(WORDS));
  return [...seen].join('-');
}

function randomLegacyCode() {
  let s = '';
  for (let i = 0; i < CODE_LEN; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return CODE_PREFIX + s;
}

/** Canonical key for a raw code. Accepts legacy NOVA-XXXXXX OR 4-word mnemonics, case-insensitive. */
function normalizeCode(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toLowerCase();
  // Legacy: NOVA-K7M2P3 (strip prefix, 6 unambiguous chars).
  const legacy = s.replace(/^nova-/, '');
  if (new RegExp('^[' + CODE_ALPHABET.toLowerCase() + ']{' + CODE_LEN + '}$').test(legacy)) return legacy;
  // v2: exactly four known words.
  const words = s.split(/[- ]+/);
  if (words.length === 4 && words.every((w) => WORDS.includes(w))) return words.join('-');
  return null;
}

async function savePayload(env, body) {
  const kv = env.SAVES;
  if (!kv) throw httpError(503, 'cloud saves are not available');
  if (!body || typeof body !== 'object' || !body.state || typeof body.state !== 'object' || Array.isArray(body.state)) {
    throw httpError(400, 'bad save body');
  }
  const rawLabel = String(body.label || '').trim();
  const label = (rawLabel && rawLabel.length <= MAX_LABEL_CHARS && screen(rawLabel).ok) ? rawLabel : 'My AI City';
  const raw = JSON.stringify({ label, savedAt: new Date().toISOString(), state: body.state });
  if (new TextEncoder().encode(raw).length > MAX_SAVE_BYTES) throw httpError(413, 'save too large');
  let code = normalizeCode(body.code);
  if (!code) {
    for (let i = 0; i < 6; i++) {
      const c = (i < 4 ? randomWordCode() : randomLegacyCode());
      if (!(await kv.get(c))) { code = c; break; }
    }
    if (!code) throw httpError(500, 'could not allocate a code');
  }
  await kv.put(code, raw);
  return code;
}

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
      // Cloud Champion-File save: POST { label?, code?, state } → { code }.
      if (request.method === 'POST' && path === '/api/save') {
        const code = await savePayload(env, await bodyOf(request));
        return json(200, { code });
      }
      // Cloud Champion-File load: POST { code } → { label, savedAt, state }. The code rides in the
      // BODY, never the query string (audit A7): a URL param lands in browser history, edge/CDN
      // request logs and Referer headers, and the cloud code is the child's only key to their city —
      // it must not be harvestable from an access log. (Was GET /api/load?code=….)
      if (request.method === 'POST' && path === '/api/load') {
        const kv = env.SAVES;
        if (!kv) throw httpError(503, 'cloud saves are not available');
        const code = normalizeCode((await bodyOf(request)).code);
        if (!code) return json(400, { error: 'bad code' });
        const raw = await kv.get(code);
        if (!raw) return json(404, { error: 'no save with that code' });
        let obj;
        try { obj = JSON.parse(raw); } catch { return json(500, { error: 'save corrupted' }); }
        return json(200, obj);
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
