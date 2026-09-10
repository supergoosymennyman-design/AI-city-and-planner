// web/coding agent/server/turn.js
/**
 * Pure per-request turn orchestration — the Scope Law's request scope (spec §3 row 1). Everything a
 * turn needs is composed HERE, from the request body + the frozen boot config, into locals: no
 * module-level state exists in this file, so nothing can leak between two children's requests.
 * gateway.js is transport (parse body, pipe frames); this file is the whole trust boundary's logic:
 * sanitize → compose context → engine → screen → exactly one terminal frame.
 */
import { generateText } from 'ai';
import { screen, screenOutput } from './filter.js';
import { sanitizeBuddyName, sanitizeManifest, sanitizeProjectState } from './manifest-sanitize.js';
import { sanitizeTranscript } from './transcript-sanitize.js';
import { composeTurnMemory, composeInjection, projectMarkdown } from './memory.js';
import { opsInstruction } from './ops-instruction.js';
import { effectiveRegistry, findProvider, byokCapable, resolveProvider, KEYED_MODELS } from './model-registry.js';
import { buildModel } from './provider.js';
import { runEngineTurn } from './engine.js';
import { screenAction } from './action-safety.js';
import { extractJsonActions, dedupeAgainst } from './action-fallback.js';
import { toolSummary } from './tool-summary.js';
import { meterFrom } from '../logic/meter.js';
// CJS-dual logic modules: DEFAULT import (Worker-safe — no createRequire) — same pattern as
// engine.js / config.js.
import projectStateMod from '../logic/project-state.js';
const { describeProject } = projectStateMod;
import actionSchemaMod from '../logic/action-schema.js';
const { validateAction } = actionSchemaMod;

/** Tags an Error with an HTTP status so the gateway's top-level handler can respond without leaking `e.message`. */
export function httpError(status, message) { return Object.assign(new Error(message), { status }); }

/**
 * Every secret value worth scrubbing from a log line: this request's BYOK key PLUS any deployment
 * credential configured on the boot env (any `*_API_KEY` / `*_KEY` / `*_TOKEN` / `*_SECRET` name).
 * WHY both: an AI-SDK `APICallError`'s message (or `.url`) can embed the Authorization header it
 * used, and the turn may have run on a DEPLOYER key — the boot default or a registry model's
 * `keyEnv` — not only the child's BYOK key. Scrubbing `byokKey` alone left the deployment credential
 * exposed (audit F1). Values shorter than 8 chars are ignored (too generic to replace safely).
 * @param {Record<string,string|undefined>} env @param {string|null|undefined} byokKey
 * @returns {string[]}
 */
export function secretValues(env, byokKey) {
  const out = [];
  // An EXPLICITLY supplied BYOK key is scrubbed regardless of length (Gemini pass-2 F4): we know it
  // is a secret, so a short one must not slip into a log. Env values keep the >=8 guard, which only
  // exists to avoid replacing generic short strings that are not keys.
  if (typeof byokKey === 'string' && byokKey.length > 0) out.push(byokKey);
  for (const [k, v] of Object.entries(env || {})) {
    if (!/(_API_KEY|_KEY|_TOKEN|_SECRET)$/i.test(k)) continue;
    if (typeof v === 'string' && v.length >= 8) out.push(v);
  }
  return out;
}

/** Replace every secret with `[key]` and cap the result — the ONE rule every log line in this file
 *  obeys (a deployment log must never carry a child's chat or a provider key). */
export function scrubSecrets(text, secrets, cap = 200) {
  let s = String(text ?? '');
  for (const secret of secrets) s = s.split(secret).join('[key]');
  return s.slice(0, cap);
}

/** Model ids a request may name on the BYOK path — OpenRouter slugs (`author/model`), alias forms
 *  (`~author/model-latest`), vendor ids (`deepseek-v4-pro`). Anything outside is a loud 400. */
const MODEL_ID_RE = /^[\w./~:-]{1,128}$/;

/**
 * Extracts + validates the BYOK fields from one untrusted body (spec §5.2). Absent → null (the
 * common no-key path). Present-but-malformed → loud httpError(400): a garbage key or provider must
 * never silently fall back to the deployer-paid default. The fields come together or not at all —
 * a key with no provider is unroutable, and a provider with no key hides a client bug. The key's
 * actual VALIDITY is the provider's call: an upstream 401 lands on the turn's normal error path.
 * @param {object} body @returns {{providerKey:string, modelProvider:string}|null}
 */
export function byokFrom(body) {
  const key = body?.providerKey;
  const prov = body?.modelProvider;
  if (key === undefined && prov === undefined) return null;
  if (typeof key !== 'string' || !key.trim() || key.length > 512) throw httpError(400, 'invalid providerKey');
  if (typeof prov !== 'string' || !byokCapable(findProvider(prov))) throw httpError(400, 'unknown provider');
  if (typeof body.model !== 'string' || !MODEL_ID_RE.test(body.model)) throw httpError(400, 'invalid model id');
  return { providerKey: key, modelProvider: prov };
}

/**
 * Sums an AI-SDK usage object's `inputTokens + outputTokens`. Ported verbatim from the retired
 * history.js: returns null (not 0, not NaN) for a missing/malformed usage — a CUT turn's usage is
 * null by design, and a bad reading must never become a corrupt meter total.
 * @param {{inputTokens?:number, outputTokens?:number}|null|undefined} usage
 * @returns {number|null}
 */
export function usageTotal(usage) {
  if (!usage || typeof usage !== 'object') return null;
  const i = Number(usage.inputTokens);
  const o = Number(usage.outputTokens);
  if (!Number.isFinite(i) || !Number.isFinite(o)) return null;
  return i + o;
}

/**
 * The Memory Meter for one turn. Fresh usage wins; a turn with no usable usage (cut/error) reports
 * the client-echoed `fallbackTotal` instead — the conversation didn't shrink, we just have no fresh
 * measurement, and the next real turn corrects it (same reasoning the retired history.pushTurn
 * documented). The fallback is client-supplied and therefore forgeable — acceptable, because the
 * meter is the child's own display and nothing else reads it.
 * @param {object|null|undefined} usage @param {number|undefined} fallbackTotal @param {number|null} limit
 * @returns {{total:number, limit:(number|null), usage:(number|null), cost:number}}
 */
export function meterFor(usage, fallbackTotal, limit) {
  const fresh = usageTotal(usage);
  const fb = Number(fallbackTotal);
  const total = fresh ?? (Number.isFinite(fb) && fb >= 0 ? fb : 0);
  return meterFrom([{ role: 'assistant', tokens: { total }, cost: 0 }], limit ?? null);
}

/**
 * Resolves the model ONE request runs on. The id comes from the request body (the child's picker
 * choice, stored client-side); it is only ever an id INTO the same registry whitelist that used to
 * back POST /api/model — never a URL or key, so key custody never moves. Unknown/stale/absent id →
 * the boot default; the caller reports the id actually used in the done frame, so a fallback is
 * visible to the child, never silent. Overlay precedence (context override, entry baseURL/keyEnv)
 * is ported verbatim from the retired POST /api/model handler.
 * BYOK (spec §6): a device-held key rides the request as `byok` and is used for THIS call only —
 * never stored, never logged. Rule order: registry hit (env credential — deployer's deliberate
 * spend, `byok` ignored) → BYOK hit (fixed registry endpoint + the request's key) → boot default.
 * @param {string|undefined} id @param {object} boot the gateway's frozen boot config.
 * @param {{providerKey:string, modelProvider:string}|null} [byok] this request's BYOK fields (from `byokFrom`).
 * @returns {{model:object, modelId:string, contextLimit:(number|null), baseURL:string}}
 */
export function resolveRequestModel(id, boot, byok = null) {
  if (typeof id !== 'string' || !id.trim() || id === boot.defaultModel.modelId) return boot.defaultModel;
  const entry = effectiveRegistry(boot.config.customModels, boot.env.BUDDY_MODEL_ID, boot.env).find((m) => m.id === id);
  const ctxEnv = String(boot.env.BUDDY_MODEL_CONTEXT ?? '').trim();
  if (entry) {
    // An EXPLICIT teacher env override (including "0" = honest-unknown meter) survives every switch;
    // the registry's per-model default applies only when the teacher set nothing. "Set nothing" must
    // include the BLANK line every .env template ships (`BUDDY_MODEL_CONTEXT=`) — a `??` alone treats
    // `''` as a deliberate choice, which would beat the registry figure on every model switch and (via
    // provider.js) silently hand the meter the 200000 default for a model whose real limit is known.
    const ctxOverride = ctxEnv !== '' ? ctxEnv : String(entry.contextLimit);
    return buildModel({
      ...boot.env,
      BUDDY_MODEL_ID: entry.id,
      BUDDY_MODEL_CONTEXT: ctxOverride,
      BUDDY_MODEL_URL: entry.baseURL ?? boot.env.BUDDY_MODEL_URL,
      BUDDY_MODEL_KEY: (entry.keyEnv ? boot.env[entry.keyEnv] : undefined) ?? boot.env.BUDDY_MODEL_KEY,
    }, boot.createOpenAICompatible);
  }
  if (byok && byok.providerKey) {
    const provider = findProvider(byok.modelProvider);
    // byokFrom already gated the provider; this re-check keeps the function safe for any caller.
    if (byokCapable(provider)) {
      // Endpoint from OUR registry (env baseUrlEnv override respected — deployer-scope config);
      // NEVER from the client. That single line is the SSRF gate (spec §7.4).
      const { baseURL } = resolveProvider(provider, boot.env);
      const curated = KEYED_MODELS.find((m) => m.id === id && m.provider === provider.id);
      const ctxOverride = ctxEnv !== '' ? ctxEnv : String(curated ? curated.contextLimit : 0); // 0 → honest-unknown meter
      return buildModel({
        ...boot.env,
        BUDDY_MODEL_ID: id,
        BUDDY_MODEL_CONTEXT: ctxOverride,
        BUDDY_MODEL_URL: baseURL,
        BUDDY_MODEL_KEY: byok.providerKey,
      }, boot.createOpenAICompatible);
    }
  }
  return boot.defaultModel;
}

/**
 * Composes everything one /api/turn request needs, as locals. Sanitization order matches the old
 * gateway exactly (buddyName → manifest → state → memory), so every downstream consumer sees the
 * one screened value. `body.childName` is deliberately IGNORED: its only server-side consumer (the
 * deleted audit trail) is gone, so the child's name now never transits into any server value.
 * @param {object} body the parsed, size-capped request body — completely untrusted.
 * @param {object} boot the gateway's frozen boot config.
 * @returns {object} ctx — see the test file for the exact shape.
 * @throws {Error} httpError(400) on a malformed transcript (loud, never truncated).
 */
export function composeTurnContext(body, boot) {
  const t = sanitizeTranscript(body.transcript, screen);
  if (!t.ok) throw httpError(400, t.error);
  const buddyName = sanitizeBuddyName(body.buddyName, screen);
  const safeManifest = sanitizeManifest(body.manifest, screen);
  const safeState = sanitizeProjectState(body.projectState, safeManifest, screen);
  // The champion snapshot: the client freezes its state at mount / Fresh Start and carries it here;
  // running it through the SAME sanitizer as the live state means a forged snapshot obeys the same
  // rules. projectMarkdown reads only params/slots/readouts, so the sanitizer's `findings` are inert.
  const lessonStart = body.lessonStartState !== undefined
    ? sanitizeProjectState(body.lessonStartState, safeManifest, screen)
    : safeState;
  const championMd = projectMarkdown(safeManifest, lessonStart);
  const turnMem = composeTurnMemory({ notes: body.notes, persona: body.persona }, boot.memSeed, screen);
  const byok = byokFrom(body);
  const model = resolveRequestModel(body.model, boot, byok);
  const system = {
    role: 'system',
    content: composeInjection({
      setting: turnMem.setting, user: turnMem.user, champion: championMd, buddyName,
      opsBlock: opsInstruction(boot.config.enabledOps, safeManifest),
    }),
  };
  const message = typeof body.message === 'string' ? body.message : '';
  const userText = [`Project right now: ${describeProject(safeManifest, safeState)}.`, message].join('\n\n');
  const lmt = Number(body.lastMeterTotal);
  return {
    buddyName, safeManifest, safeState, championMd, turnMem, model,
    messages: [system, ...t.transcript, { role: 'user', content: userText }],
    userText, message,
    lastMeterTotal: Number.isFinite(lmt) && lmt >= 0 ? lmt : 0,
    transcriptDropped: t.dropped,
    // The turn's OWN device key, carried only so a failure log can provably scrub it (spec §7.2) —
    // never re-sent anywhere, never logged itself. `null` on the common no-key path.
    byokKey: byok ? byok.providerKey : null,
  };
}

/**
 * Runs ONE streaming turn — engine → screen → **exactly one terminal frame**, always. Ported from
 * the gateway's `/api/turn` orchestration block (its comments and case analysis ARE the one-terminal
 * guarantee's documentation, so they moved here with the code).
 *
 * The caller has already screened the child's input and checked the brake: an input deflection and a
 * braked turn both answer with plain JSON BEFORE the NDJSON headers go out (see gateway.js), so
 * every call that reaches this function streams. Nothing here touches module state — every value is
 * a local derived from `ctx`/`boot`, which is what makes two children's interleaved turns unable to
 * see each other (Scope Law, spec §3 row 1).
 * @param {object} ctx - `composeTurnContext`'s return: this request's every local.
 * @param {object} boot - the gateway's frozen boot config.
 * @param {{write:(frame:object)=>void, brake:object, engine?:Function}} io -
 *   `write` takes ready-to-encode frame objects (the gateway encodes + pipes them); `brake` is the
 *   deployment runaway brake (brake.js); `engine` defaults to the real `runEngineTurn` and is
 *   injected by tests so every path runs keyless and offline.
 * @returns {Promise<void>} resolves once exactly one terminal frame (`done` or `cut`) has been written.
 */
export async function runTurn(ctx, boot, io) {
  const engine = io.engine ?? runEngineTurn;
  if (ctx.transcriptDropped) console.warn('[turn] transcript sanitizer dropped', ctx.transcriptDropped, 'entries this turn'); // count only — NEVER the content (this file's rule: logs never carry a child's chat)
  // Belt-and-braces op gate: the SAME `validateAction` the engine's real tool path uses, but
  // pre-rejecting any op the deployment has DISABLED. Passed to `extractJsonActions` at every
  // json-fallback call site so a disabled op can't slip through the fallback path (the real tool-call
  // path is already gated by construction — engine.js's `buildTools` never builds a disabled op).
  // Scope Law: it closes over THIS request's `ctx.safeManifest`. The retired gateway closed over a
  // process-global `lesson.manifest` that every request reassigned — with two children interleaving,
  // child A's proposed action was validated against child B's project. That was the correctness leak;
  // a function-scoped closure makes it unreachable (spec §1).
  const gatedValidate = (a) => (boot.config.enabledOps.includes(a?.op) ? validateAction(a, ctx.safeManifest) : { ok: false, error: 'op disabled' });

  // The engine relays screened text deltas straight to the wire, but the terminal `done` frame is
  // reconstructed by us AFTER the turn (with screened actions + the post-turn meter) — so the
  // engine's own `done` frame is dropped here. We also mirror every delta into `streamedText` so
  // the mid-stream error path has a best-effort reply without reaching into the engine's internals.
  let streamedText = '';
  let sawDelta = false;
  // Positive guard for the one-terminal guarantee (not just case analysis): if a `cut` already
  // went out and the engine's promise THEN rejects during stream teardown, the catch below must
  // not emit a second terminal.
  let wroteTerminal = false;
  const write = (frame) => {
    if (frame.type === 'done') return; // reconstructed below
    if (frame.type === 'delta') { streamedText += frame.text; sawDelta = true; }
    // A `cut` IS this turn's terminal (the engine already screened it and wrote its deflection).
    // The retired gateway also captured `frame.deflection` to record as the assistant turn in the
    // process-global history; with the transcript now owned by the client, there is nothing left to
    // capture — flipping the guard is all this branch still does.
    else if (frame.type === 'cut') { wroteTerminal = true; }
    io.write(frame); // delta + cut go straight to the wire
  };
  // finalize runs inside the engine (via runStreamingTurn) once the stream ends: it screens the
  // full reply and yields the reply decision, which we capture here to reconstruct the done frame.
  // JSON-action fallback: extract any fenced ```json action block FIRST, then screen the CLEANED
  // text — that is what the child actually sees, so it must be the thing the full-reply screen
  // judges. WHY this order is still safe: a flagged phrase living ONLY inside a stripped json block
  // can no longer flag the (now-clean) visible reply, but the ACTION it carried is not let off the
  // hook — it flows into `fallbackActions` below and is screened again, individually, via the SAME
  // `screenAction` the tool-call path uses (see the done path). Both the visible text and every
  // action — whichever path proposed it — stay screened; only the ORDER differs.
  let finResult = null;
  const finalize = async (fullText) => {
    const { actions: fallbackActions, cleanedText } = extractJsonActions(fullText, gatedValidate);
    const full = screenOutput(cleanedText);
    finResult = full.ok
      ? { reply: cleanedText || '…', ok: true, fallbackActions }
      : { reply: full.deflection, ok: false, fallbackActions: [] }; // a deflected reply drops fallback actions too — the same rule the done path below applies to tool-call actions
    return finResult; // (dropped by `write`; we only need the captured decision)
  };
  try {
    // `projectState: ctx.safeState` is what makes a read-only check a READ instead of a constant:
    // engine.js's `runCheck` branch reads `state.findings` from it. It is the SAME already-sanitized
    // object composeTurnContext's champion markdown/describeProject used (screened once, on entry) —
    // no second trust boundary, no second sanitize.
    const out = await engine({ model: ctx.model.model, messages: ctx.messages, screen, write, finalize, enabledOps: boot.config.enabledOps, manifest: ctx.safeManifest, projectState: ctx.safeState });
    if (out.terminal === 'cut') {
      // The engine already wrote the single `cut` terminal to the wire; no done frame follows. Only
      // the deployment brake still needs feeding (usage is null on a cut by design — `brake.add`
      // tolerates that and adds 0). Same reasoning as the `spent` line below: `totalTokens` may be
      // genuinely ABSENT while input/output are present, and a brake fed 0 on every such turn is a
      // brake that never trips — the one server-side spend protection, silently off.
      io.brake.add(out.usage?.totalTokens ?? usageTotal(out.usage));
    } else {
      const fin = finResult ?? { reply: '…', ok: true, fallbackActions: [] };
      // Merge tool-call proposals with the json-fallback ones, deduped — a model that BOTH called
      // a real tool AND echoed the same op as a json block (belt-and-braces persona instruction)
      // must not double up the child's [Do it] card list.
      const fallbackOnly = dedupeAgainst(out.proposedActions, fin.fallbackActions);
      // JSON-fallback actions only exist once the full reply is parsed, so their agent-style
      // tool lines land here (end of stream) instead of mid-stream — same frame, same screen
      // rule as the engine's tool-call path.
      for (const a of fallbackOnly) {
        const raw = toolSummary(a, ctx.safeManifest); // this request's manifest, for the same reason gatedValidate uses it
        const summary = raw && screen(raw).ok ? raw : a.op;
        io.write({ type: 'tool', op: a.op, summary, source: 'fallback' });
      }
      const mergedProposed = [...out.proposedActions, ...fallbackOnly];
      // The retired `recordDoneTurn`'s screening loop, inlined: a deflected final reply (the
      // full-reply screen failed — `fin.ok` false) drops ALL actions. Its other two jobs are gone —
      // there is no history to push (the client records its own transcript from what it streamed)
      // and the per-lesson spend cap became the deployment brake below.
      const actions = [];
      if (fin.ok) {
        for (const a of mergedProposed) {
          // Belt-and-braces op-whitelist gate at the FINAL merge: the real tool path can't build a
          // disabled op and the json-fallback path is gatedValidate-screened, but if a disabled op
          // ever reaches here anyway, DROP it (never surface a tool the deployment switched off).
          if (!boot.config.enabledOps.includes(a?.op)) continue;
          const v = screenAction(a, screen);
          if (!v.ok) continue;
          actions.push(a);
        }
      }
      // Same `totalTokens`-may-be-absent reasoning as the `spent` line below — a brake that reads 0
      // on every provider omitting the field is a brake that never trips.
      io.brake.add(out.usage?.totalTokens ?? usageTotal(out.usage));
      // The one-terminal guarantee, made LOCAL rather than contract-dependent: `write` above flips
      // this flag on a `cut`, and the catch below re-checks it, but nothing structurally stopped a
      // future edit from reaching this line twice. Guarding the write itself means the guarantee
      // holds by construction here, not only because the surrounding case analysis is still correct.
      if (!wroteTerminal) {
        wroteTerminal = true;
        // `spent` + `model` are the additive done-frame fields (spec §5): the child's browser owns the
        // day-keyed budget now, so it needs THIS turn's cost, and a model fallback (stale picker id)
        // must be visible rather than silent. `spent` falls back to `usageTotal` because some providers
        // report inputTokens/outputTokens but NO totalTokens — trusting totalTokens alone would bill the
        // child 0 on every such turn, silently starving their budget of the spend it actually made.
        io.write({
          type: 'done', reply: fin.reply, actions,
          meter: meterFor(out.usage, ctx.lastMeterTotal, ctx.model.contextLimit),
          spent: Number(out.usage?.totalTokens) || usageTotal(out.usage) || 0, model: ctx.model.modelId, source: 'live',
        });
      }
    }
  } catch (e) {
    // The engine does NOT catch (its error contract) — a throw here rejected AFTER 0+ delta frames
    // and BEFORE any terminal. Guarantee exactly ONE terminal:
    //  - deltas already streamed ⇒ close with the best-effort screened streamed text (source
    //    still 'live'; the real model did partly answer).
    //  - nothing streamed ⇒ a pre-stream failure (e.g. no model key) ⇒ the labelled offline stub.
    // NEVER the error object: an AI-SDK APICallError carries `requestBodyValues` as an own enumerable
    // property, and that body IS the child's conversation (system prompt + whole transcript + their
    // message). `console.error(…, e)` would pool children's chat content into the deployment log of a
    // product that promises no PII. Name/message/status/url is everything an operator needs to debug a
    // provider failure, and none of it is the child's.
    // `message` may embed request context (some SDK error messages echo headers/keys). Scrub EVERY
    // configured secret — this turn's BYOK key AND any deployment key the model ran on (audit F1:
    // byokKey alone left the deployer credential exposed) — from the message AND the url, which can
    // also carry a query-string key. The 200-char cap bounds whatever else a provider dumps in.
    // statusCode+url+name carry the debug value.
    const secrets = secretValues(boot.env, ctx.byokKey);
    const safeMsg = scrubSecrets(e?.message, secrets);
    console.error('[turn] engine turn failed', { name: e?.name, message: safeMsg, statusCode: e?.statusCode, url: scrubSecrets(e?.url, secrets, 300) });
    if (wroteTerminal) {
      // A terminal (cut, or the reconstructed done) already reached the wire before the throw —
      // emitting anything more would break the exactly-one-terminal contract. Just close.
    } else if (sawDelta) {
      // Same json-fallback strip as the happy path (above) — a mid-stream error can still land
      // AFTER the model already streamed a fenced action block, and this reconstructed reply is
      // built straight from the raw streamed text. No actions are salvaged here on purpose: this
      // is an error-recovery path with no engine.js proposedActions to merge against, and a
      // never-finalized turn is exactly the kind of half-finished output the actions pipeline
      // should stay conservative about (never surfaced, matching a cut turn's fail-closed rule).
      const { cleanedText } = extractJsonActions(streamedText, gatedValidate);
      const full = screenOutput(cleanedText);
      const reply = full.ok ? (cleanedText || '…') : full.deflection;
      // No fresh usage exists for a turn that never finished, so the meter reports the client-echoed
      // last honest reading instead of a false zero (`spent: 0` — we cannot bill what we can't read).
      io.write({
        type: 'done', reply, actions: [], meter: meterFor(null, ctx.lastMeterTotal, ctx.model.contextLimit),
        spent: 0, model: ctx.model.modelId, source: 'live',
      });
    } else {
      // THE ENGINE COULD NOT BE REACHED, SO THE BUDDY SAYS SO. Nothing else.
      //
      // There used to be an offline "brain" here (`server/model-stub.js`, deleted 2026-07-29) that
      // answered in the real model's place — reading the child's manifest and state, producing a
      // confident diagnosis, and proposing a real [Do it] card with invented item ids. Live testing
      // found it: a nonsense API key 401'd, and the child was shown what looked exactly like an AI
      // answer, from a hardcoded function, one tap away from writing fabricated photos into their
      // project.
      //
      // The owner's ruling was to delete it outright rather than make it more honest: ANY canned
      // brain speaking in the buddy's voice is a lie a child cannot detect, however carefully it is
      // labelled. A child who cannot tell "the AI looked at my work" from "a function read my state"
      // has been misled, and this product's entire subject is teaching them what an AI actually is.
      //
      // So: one honest sentence, `actions: []` unconditionally, and `source:'error'` so the client
      // can say out loud that the answer did not come from the brain they picked.
      const rawReply = "I couldn't reach my AI brain just now, so I can't help with this one yet.";
      const outScreen = screen(rawReply);
      // Nothing was spent — no model call succeeded — so the meter holds the last honest reading and
      // `spent` is a true 0. `model` still reports the id this turn RESOLVED to, so a stale picker id
      // is corrected even on a failed turn.
      io.write({
        type: 'done', reply: outScreen.ok ? rawReply : outScreen.deflection, actions: [],
        meter: meterFor(null, ctx.lastMeterTotal, ctx.model.contextLimit),
        spent: 0, model: ctx.model.modelId, source: 'error',
        // ADDITIVE (spec as-built delta): the upstream HTTP status, when one exists — the client
        // uses 401/402/403 + "I sent a key" to say "that key didn't work" instead of a generic error.
        ...(Number.isInteger(e?.statusCode) ? { upstreamStatus: e.statusCode } : {}),
      });
    }
  }
}

/** The one-shot summarize instruction — kid-legible, ported verbatim from the retired summarizeHistory. */
const SUMMARIZE_PROMPT = 'Summarize our whole chat so far in 2-3 short, friendly sentences a 10-year-old would understand, so we can keep going with less to remember.';

/**
 * Manual "Tidy Up" for one child's client-carried transcript. Summarizes the TRANSCRIPT ONLY —
 * the system prompt is rebuilt fresh every turn from the champion file + payload memory, so
 * compressing it into the summary (the old behavior) duplicated the persona (spec §5, deliberate
 * delta). The summary is screened before it is returned: it becomes the child's visible transcript
 * AND future model context, so a flagged summary is withheld (`summary` omitted — the client keeps
 * its transcript unchanged, an honest no-op) rather than deflected into the child's history.
 * A summarize call that THROWS degrades honestly instead of erroring the child's button: the retired
 * route answered `200 {meter}` on a failed summarize, so a dead provider must still resolve to the
 * meter-only shape (the client keeps its transcript, exactly as for the empty/braked cases) — a 500
 * would surface a provider outage as a broken Tidy Up button. Only a MALFORMED REQUEST still throws.
 * @param {object} body - `{transcript, model?, lastMeterTotal?}`, untrusted.
 * @param {object} boot - the gateway's frozen boot config.
 * @param {{brake:object, generate?:Function}} deps - `generate` defaults to ai's generateText.
 * @returns {Promise<{summary?:string, spent?:number, meter:object}>} `summary` is omitted (never
 *   null/empty) whenever there is nothing honest to return: empty transcript, braked, flagged summary,
 *   or a failed call. `spent` (additive) rides along whenever a model call actually happened, so the
 *   child's browser can bill this button against their day budget like any other turn.
 * @throws {Error} httpError(400) on a malformed transcript — the ONE failure that is the caller's bug.
 */
export async function runTidyUp(body, boot, deps) {
  const generate = deps.generate ?? generateText;
  const t = sanitizeTranscript(body.transcript, screen);
  if (!t.ok) throw httpError(400, t.error);
  const model = resolveRequestModel(body.model, boot, byokFrom(body));
  const lmt = Number(body.lastMeterTotal);
  const fallback = Number.isFinite(lmt) && lmt >= 0 ? lmt : 0;
  if (t.transcript.length === 0 || !deps.brake.check().ok) {
    return { meter: meterFor(null, fallback, model.contextLimit) }; // no summary: nothing to compact, or braked
  }
  let res;
  try {
    res = await generate({ model: model.model, messages: [...t.transcript, { role: 'user', content: SUMMARIZE_PROMPT }] });
  } catch (e) {
    // Honest degradation, not a swallow: the throw is LOGGED for the operator, and the child gets the
    // same meter-only no-op the empty/braked branches return, so their transcript survives untouched.
    // Never the error object — an APICallError's `requestBodyValues` embeds the child's conversation
    // (this route posts their WHOLE transcript), so logging `e` would pool chat content into the
    // deployment log. Fields only, same set as the runTurn catch above — including the same
    // secretValues scrub of EVERY configured key (audit F1), not just the request's BYOK key.
    const bk = typeof body?.providerKey === 'string' ? body.providerKey : null;
    const secrets = secretValues(boot.env, bk);
    const safeMsg = scrubSecrets(e?.message, secrets);
    console.error('[turn] tidy-up summarize failed', { name: e?.name, message: safeMsg, statusCode: e?.statusCode, url: scrubSecrets(e?.url, secrets, 300) });
    return { meter: meterFor(null, fallback, model.contextLimit) };
  }
  // Same absent-totalTokens tolerance as runTurn's brake feeds — see the comment there.
  deps.brake.add(res.usage?.totalTokens ?? usageTotal(res.usage));
  const out = screen(res.text);
  // `spent` is ADDITIVE (spec §5, same field the done frame carries): a Tidy Up is a real model call
  // on the child's behalf, so it must be billed to the day budget their BROWSER now enforces —
  // otherwise the one button that costs tokens is the one spend the budget can't see. Same
  // totalTokens-may-be-absent fallback as the turn path, and `|| 0` so an unreadable usage bills
  // nothing rather than NaN.
  const spent = Number(res.usage?.totalTokens) || usageTotal(res.usage) || 0;
  return out.ok
    ? { summary: res.text, spent, meter: meterFor(res.usage, fallback, model.contextLimit) }
    : { spent, meter: meterFor(res.usage, fallback, model.contextLimit) };
}
