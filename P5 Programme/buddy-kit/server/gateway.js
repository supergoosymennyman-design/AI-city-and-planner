// web/coding agent/server/gateway.js
/**
 * Buddy Gateway — TRANSPORT ONLY, and the trust boundary's front door. It listens, parses a bounded
 * request body, serves the static client + the read-only mounts, hands every /api/turn and
 * /api/tidy-up request straight to `turn.js` (which composes that ONE request's whole world from its
 * own body plus the frozen boot config), pipes the frames back, and maps a thrown `httpError` to a
 * clean status without leaking `e.message`. It holds no chat history, no lesson singleton and no
 * per-child anything: under the Scope Law (docs/superpowers/specs/2026-07-26-buddy-scope-law-design.md
 * §3) every per-request value lives in `runTurn`'s locals, every durable value in the child's own
 * champion file, and the only mutable module state permitted anywhere in server/ is `brake.js`'s
 * deployment-scoped runaway counter — pinned by tests/scope-law.test.js. Boot-time `const`s (the env
 * `config`, the `MEM_SEED` persona/notes snapshot, the default model) are frozen deployment scope, not
 * conversation state. Browser↔gateway is same-origin (the gateway serves the client) → no browser CORS.
 *
 * Safety is by construction and lives in turn.js/engine.js: the engine exposes ONLY the 7 generic,
 * manifest-validated verbs as tools (logic/action-schema.js), every child-visible frame is screened,
 * and a live-engine failure before any text streams reports an honest `source:'error'` frame with no
 * reply text of its own invention and no proposed actions. (There WAS an offline "brain" here that
 * answered in the model's place; it was deleted 2026-07-29 — see turn.js's failure branch for why a
 * canned brain speaking in the buddy's voice is a lie a child cannot detect.) The one screen the
 * gateway still runs itself is on the child's INPUT, because a deflected
 * input must answer with plain JSON before the NDJSON headers go out (see /api/turn below).
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { screen } from './filter.js';
import { readMemory } from './memory.js';
import { routeStaticPath } from './route-static.js';
import { buildModel } from './provider.js';
import { effectiveRegistry, lockedRegistry, byokProviders } from './model-registry.js';
import { loadConfigFromEnv } from './config.js';
import { makeBrake, brakeCeilingFrom } from './brake.js';
import { httpError, meterFor, composeTurnContext, runTurn, runTidyUp } from './turn.js';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { encodeFrame } = require('../logic/stream-frames.js');

const HERE = dirname(fileURLToPath(import.meta.url));
const CLIENT = join(HERE, '..', 'client');
// `client/index.html` loads `logic/*.js` as classic <script> tags so the browser and node:test share
// ONE source of truth for champion-state/action-schema (repo idiom) — those files live in the SIBLING
// `logic/` dir, not under CLIENT, so they need their own contained static root. `../logic/x.js`
// requested from a page at "/" normalizes on the wire to "/logic/x.js" (browsers clamp ".." at the
// origin root), never a literal ".." segment, so this is routed by prefix below, reusing the same
// resolveClientPath containment gate — no secrets live in logic/, only pure whitelisted-op modules.
const LOGIC = join(HERE, '..', 'logic');
// Read-only static mounts so a champion-project page is reachable SAME-ORIGIN from the gateway, not
// just from web/serve.js's dev server: `web/project/<id>/` (the page itself), `web/ml/`
// (self-hosted MediaPipe/tfjs model files) and `web/toolbox/` (camera.js etc — a project page reaches
// it via a `../../toolbox/…` relative path, which normalizes to `/toolbox/…` at this origin). HERE is
// `.../web/coding agent/server`, so these resolve two levels up (to `web/`), not one like CLIENT/LOGIC.
const PROJECT = join(HERE, '..', '..', 'project');
const ML = join(HERE, '..', '..', 'ml');
const TOOLBOX = join(HERE, '..', '..', 'toolbox');
const PORT = Number(process.env.BUDDY_PORT || 8787);
// Baked default persona/notes, read ONCE at boot — the fallback for a turn whose body carries no
// `persona`/`notes` (or carries a value the safety screen rejects). The gateway never re-reads
// Setting.md/User.md off disk per turn after this: `composeTurnMemory` (memory.js, called from
// composeTurnContext) prefers the per-turn request payload and falls back to THIS snapshot.
const MEM_SEED = Object.freeze(readMemory()); // baked default persona/notes, read-only

// `.wasm` is the real registered MIME type (some loaders `WebAssembly.instantiateStreaming` off the
// Content-Type header) — `.tflite`/`.task` have no registered type, so the generic binary type is
// correct and matches this file's own `MIME[ext] || 'application/octet-stream'` fallback below.
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm', '.tflite': 'application/octet-stream', '.task': 'application/octet-stream',
};
// During active development, code assets must never go stale in the browser cache.
// No cache headers → browsers use heuristic caching for the whole session, hiding
// file edits from the user. Explicit no-store keeps every reload fresh.
const NO_CACHE_ASSETS = { 'Cache-Control': 'no-cache, no-store, must-revalidate' };
const MAX_BODY_BYTES = 256 * 1024; // an unauthenticated POST body should never need more than this
const NDJSON_HEADERS = { 'content-type': 'application/x-ndjson', 'cache-control': 'no-cache', 'x-accel-buffering': 'no' };
// Kid-friendly reply for a turn the DEPLOYMENT brake refused (brake.js — a runaway/curl loop, never a
// child: the browser's own day budget sits ~15× lower). Kept inline (the gateway sends reply text
// straight to the client, which owns its own STRINGS) and in the same warm English register as the
// stub replies. Honest wording: the brake is per-DAY, so — unlike the retired per-lesson cap message —
// this one promises tomorrow, and still never promises that anything the child taps restores it.
const BRAKE_REPLY = "Our chat energy here is all used up for today! Your champion is safe and saved — we can keep building, and chat more tomorrow.";

// ── Boot: the deployment scope, frozen (Scope Law §3 row 5) ───────────────────────────────────────
// Read ONCE, straight from `process.env`, and never mutated afterwards. `loadConfigFromEnv` reads the
// op whitelist + the spend cap the CHILD's browser enforces (config.js — there is no teacher-editable
// settings file and nothing to persist). `buildModel` is pure config-from-env: a throw here (a
// malformed BUDDY_MODEL_URL / _CONTEXT) is a deploy misconfiguration and MUST crash loudly at boot
// rather than silently point at the wrong endpoint — see provider.js. `contextLimit` comes straight
// from env/default (no live probe): it backs the Memory Meter's `usage%`, or is `null` (an honest
// "unknown") if configured as 0. Per-request model choice resolves against this default in turn.js's
// `resolveRequestModel`, so switching brains never mutates anything here.
const config = loadConfigFromEnv(process.env);
const defaultModel = buildModel(process.env, createOpenAICompatible);
// `boot` is the ONE object every turn reads, frozen so a handler cannot smuggle state into it — and
// frozen DEEPLY, member by member, because `Object.freeze` is shallow: `ctx.model` is literally
// `boot.defaultModel` on the common path, so a downstream `ctx.model.contextLimit = …` would be the
// retired live-model reassignment bug in a new house — per-request writes landing in deployment scope, and
// INVISIBLE to tests/scope-law.test.js (whose header admits a mutated `const`'s fields are exactly
// what its regex heuristic cannot see). These modules are ESM, hence strict mode, so a smuggled write
// now THROWS at runtime instead of quietly succeeding: the acknowledged blind spot becomes a gate.
Object.freeze(config);
Object.freeze(config.enabledOps);
Object.freeze(config.customModels);
Object.freeze(defaultModel);
const boot = Object.freeze({ env: process.env, memSeed: MEM_SEED, config, defaultModel, createOpenAICompatible });
// The deployment runaway brake — the only mutable state in server/, and deliberately NOT a per-child
// cap (see brake.js's header + spec §7). `Date.now` is the real clock; brake.js takes it injected so
// its own tests can roll the day. The ceiling is resolved ONCE, by brake.js's own `brakeCeilingFrom`
// (never an inline `Number(env.X ?? default)` here — .env templates ship blank lines, and `Number('')`
// is 0, which would SILENTLY DISABLE the only server-side spend protection; '0' stays the explicit
// opt-out and garbage still throws loudly in makeBrake). The boot log below reuses this const rather
// than re-reading the env, so the number we print is always the number we enforce.
const BRAKE_CEILING = brakeCeilingFrom(process.env);
const brake = makeBrake({ ceiling: BRAKE_CEILING, now: Date.now });

/**
 * Buffers a request body and parses it as JSON. Never lets a bad request crash the process: a
 * `JSON.parse` throw inside the `'end'` listener used to escape the request handler's try/catch
 * (different call stack — an EventEmitter listener throw is NOT caught by an `await` above it) and
 * take down the whole server on one malformed POST. Both the size cap and the parse failure now
 * reject with an `httpError` the handler can turn into a clean 400 instead of a process crash.
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<object>} the parsed JSON body, or `{}` for an empty body.
 */
function body(req) {
  return new Promise((res, rej) => {
    // Chunks are COLLECTED and decoded once at the end, never `b += c`. A `data` chunk is a Buffer,
    // and string-concatenating each one decodes it INDEPENDENTLY — so a multi-byte character split
    // across a chunk boundary becomes two U+FFFD replacement chars, silently corrupting the child's
    // text. Not theoretical here: the transcript now rides in every turn body, which makes bodies
    // large enough to span chunks, and this app is English-primary but not English-only (CJK is 3
    // bytes/char). The byte count still uses `c.length` — that is the wire size, which is what the cap
    // is about.
    const chunks = [];
    let bytes = 0;
    let settled = false;
    const fail = (err) => { if (!settled) { settled = true; req.destroy(); rej(err); } };
    req.on('data', (c) => {
      bytes += c.length;
      if (bytes > MAX_BODY_BYTES) return fail(httpError(400, 'request body too large'));
      chunks.push(c);
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      const b = Buffer.concat(chunks).toString('utf8');
      if (!b) return res({});
      try { res(JSON.parse(b)); }
      catch { rej(httpError(400, 'malformed JSON body')); }
    });
    req.on('error', (e) => fail(httpError(400, e.message)));
  });
}
function json(res, code, obj) { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); }

console.log(`[gateway] model: ${defaultModel.modelId} @ ${defaultModel.baseURL}`);
console.log(`[gateway] context limit: ${defaultModel.contextLimit ?? 'unknown (BUDDY_MODEL_CONTEXT=0)'}  ·  daily brake: ${BRAKE_CEILING || 'disabled'} tokens/day  ·  child budget (browser): ${config.spendCap} tokens/day`);

export const server = createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/api/turn') {
      // Everything this turn needs — sanitized manifest/state/memory, the resolved model, the
      // client-carried transcript, the messages array — is composed HERE into ONE local. A malformed
      // transcript throws httpError(400) and lands on the top-level handler below; that is deliberate
      // (loud, never truncated — spec §5).
      const ctx = composeTurnContext(await body(req), boot);
      // The child's input screen, and the brake, both answer with plain JSON — they must run BEFORE
      // the NDJSON headers go out, because once `writeHead` has fired the response can only be frames.
      const inScreen = screen(ctx.message);
      if (!inScreen.ok) {
        return json(res, 200, { reply: inScreen.deflection, actions: [], source: 'filter', meter: meterFor(null, ctx.lastMeterTotal, ctx.model.contextLimit) });
      }
      // Nothing was spent on a deflected/braked turn, so the meter reports the client's last honest
      // reading rather than a false zero (`meterFor(null, …)` — same rule turn.js's error paths use).
      if (!brake.check().ok) {
        return json(res, 200, { reply: BRAKE_REPLY, actions: [], source: 'capped', meter: meterFor(null, ctx.lastMeterTotal, ctx.model.contextLimit) });
      }
      res.writeHead(200, NDJSON_HEADERS);
      // runTurn owns the whole turn — including the exactly-one-terminal-frame guarantee — and gets
      // the wire as an injected `write`, so the transport layer only encodes. It never throws (for
      // any engine/model failure; a synchronous transport-write failure is the gateway's own concern,
      // not turn.js's guarantee): every failure path resolves after writing its one terminal frame
      // (see turn.js).
      await runTurn(ctx, boot, { write: (f) => res.write(encodeFrame(f)), brake });
      return res.end();
    }
    if (req.method === 'POST' && req.url === '/api/tidy-up') {
      // Manual "Tidy Up": summarize the child's client-carried transcript into one line. runTidyUp
      // owns its own degradation (a dead provider resolves to the meter-only no-op, so a Tidy Up
      // button never breaks on a provider outage) — a route-local catch here would only mask the ONE
      // thing that must still surface: a malformed transcript's httpError(400).
      return json(res, 200, await runTidyUp(await body(req), boot, { brake }));
    }
    if (req.method === 'GET' && req.url === '/api/model') {
      // `process.env` is passed so key-gated options (model-registry.js's KEYED_MODELS) appear only
      // when the deployer supplied that provider's key. The env is read for PRESENCE of a key, never
      // serialized — the response carries ids/labels/endpoints, never a credential. `current` is the
      // BOOT default (the server no longer has a "live" model to switch); the picker shows the
      // child's own stored choice, which rides in each turn's body. `spendCap` is the ceiling the
      // child's BROWSER enforces against its day-keyed counter (spec §7.1). `lockedModels`/`byokProviders` are the picker's LOCKED section + the add-any-model provider menu (spec §5.1) — display fields only; a client key never unlocks anything server-side, it just rides each turn.
      return json(res, 200, {
        current: defaultModel.modelId,
        models: effectiveRegistry(config.customModels, process.env.BUDDY_MODEL_ID, process.env),
        lockedModels: lockedRegistry(process.env),
        byokProviders: byokProviders(),
        spendCap: config.spendCap,
      });
    }

    // Every LIVE /api/* route is matched by one of the checks above this point — anything else under
    // /api/ (a retired endpoint like the deleted memory, admin, POST /api/model or /api/fresh-start
    // routes, or a typo) is a genuinely unknown API path and must 404 cleanly. Without this, it would
    // fall through to the static-file lookup below, which resolves to a non-existent path under
    // CLIENT/ and 500s on the ENOENT (the catch-all's `isApi ? 500 : 404` treats an unhandled fs error
    // under /api/ as a server fault, which is right for a route whose OWN handler threw, but wrong for
    // a path with no handler at all). MUST stay the LAST /api/ check in this handler — every real
    // /api/... route above it.
    const apiPath = req.url.split('?')[0];
    if (apiPath.startsWith('/api/')) return json(res, 404, { error: 'not found' });

    // static client — CONTAINED to CLIENT/ (or the LOGIC/·PROJECT/·ML/·TOOLBOX/ siblings, each opted
    // in explicitly by prefix) via the pure routeStaticPath route (route-static.js), itself built on
    // the resolveClientPath containment gate (static-path.js). The gateway holds the model credential
    // + server source, so a path-traversal read here ("/..%2f..%2fserver%2f...") would be a real
    // secret leak, not a nuisance — everything NOT opted in by prefix stays CLIENT-only.
    const reqPath = req.url.split('?')[0];
    let file = routeStaticPath(reqPath, { CLIENT, LOGIC, PROJECT, ML, TOOLBOX });
    if (!file) return json(res, 403, { error: 'forbidden' });
    // A directory request under a mount (e.g. `/project/p5-01-recycle-eye/`) serves ITS index.html —
    // same directory->index.html convention web/serve.js's handle() uses — needed now that /project/
    // mounts a whole folder of per-lesson pages rather than one fixed CLIENT root. Harmless for the
    // pre-existing CLIENT/LOGIC routes: `resolveClientPath` already maps the bare `/` to CLIENT's own
    // index.html directly, so `file` is never a directory there and this stat is a cheap no-op miss.
    // (Request-scoped, so the Scope Law's no-mutable-MODULE-state rule is untouched — this block moves
    // across the rewrite unchanged.)
    try {
      const st = await stat(file);
      if (st.isDirectory()) file = join(file, 'index.html');
    } catch { /* ENOENT etc. — fall through to the readFile below, which 404s via the catch-all */ }
    const data = await readFile(file); // ENOENT etc. fall through to the generic 404 below
    const ext = extname(file);
    const headers = { 'content-type': MIME[ext] || 'application/octet-stream' };
    if (ext === '.js' || ext === '.html' || ext === '.css' || ext === '.json') Object.assign(headers, NO_CACHE_ASSETS);
    res.writeHead(200, headers); res.end(data);
  } catch (e) {
    const isApi = req.url?.startsWith('/api');
    const status = Number.isInteger(e?.status) ? e.status : (isApi ? 500 : 404);
    // Never echo e.message to the client — readFile ENOENT etc. embeds absolute filesystem paths,
    // turning the error response into a filesystem-probing oracle. Real detail stays server-side.
    // The STACK, not the object: an error object's own enumerable properties can carry a request body
    // (an AI-SDK APICallError's `requestBodyValues` is the child's whole conversation), and a
    // deployment log must never pool children's chat content. A stack string is the debuggable part.
    console.error('[gateway]', e?.stack || e);
    const message = status === 400 ? 'bad request' : isApi ? 'internal error' : 'not found';
    json(res, status, { error: message });
  }
});

// Loopback stays the safe local default: this process holds the model credential and serves server/
// source via the /logic/ + client static routes, so binding all interfaces (the bare `listen(PORT)`
// default) would expose it to the whole LAN. A deployment behind a platform proxy sets
// `BUDDY_HOST=0.0.0.0` deliberately (documented in .env.example §4).
server.listen(PORT, process.env.BUDDY_HOST || '127.0.0.1', () => console.log(`Buddy gateway on http://localhost:${PORT}  (model: ${defaultModel.modelId})`));

// Defense-in-depth: the body()/resolveClientPath fixes above remove the known crash paths, but an
// uncaught exception anywhere else in the process must not take the gateway down for every child
// using it. Log and keep serving rather than let Node's default "crash the process" behaviour win.
process.on('uncaughtException', (err) => {
  // The stack, not the object — same reasoning as the request catch-all above: an error's own
  // enumerable fields can embed a request body, and the stack is what an operator actually debugs from.
  console.error('[gateway] uncaughtException — server kept running:', err?.stack || err);
});
