// web/coding agent/server/engine.js
/**
 * The buddy's OWN engine: a Vercel AI SDK `streamText` tool-loop that slots in behind the
 * existing, already-tested streaming orchestration (`stream-turn.js` + `stream-screen.js`).
 * Nothing about the relay/cut/finalize sequencing is reimplemented here — this module's only job
 * is to adapt `streamText`'s `fullStream` (an async iterable of typed chunks) to the injected-
 * selector contract `runStreamingTurn` already expects, and to turn the 7 generic, manifest-
 * validated verbs into AI-SDK tools whose calls are collected as PROPOSED actions (never
 * auto-applied; the gateway remains the place that screens/applies them, exactly as today).
 *
 * ONE class of tool call is NOT a proposal: a `runCheck` naming a check the manifest declares
 * `readOnly: true` returns the turn's real findings and files nothing (spec §11b.3 — see
 * `findingsText` and `buildTools` below). Looking changes nothing, so there is no consent gate to
 * respect, and pretending otherwise made the buddy tell a child to approve something already done.
 * Note the safety consequence: unlike every other tool result, a read result is written EXPECTING
 * the model to relay it — so only sanitizer-screened fields are ever interpolated into it.
 *
 * Kid-safety fail-closed rule: `isPartForUs` below matches ONLY the exact chunk type
 * `'text-delta'`. Confirmed live (see `.superpowers/sdd/task-1-report.md` + this task's own
 * probing): `reasoning-delta` chunks carry a `.text` field too (same rename `streamText` applies
 * to text deltas), so matching on the presence of `.text` instead of the exact `type` would leak
 * the model's private reasoning to the child. Tool/tool-error/step/finish chunks are never
 * forwarded either — only an exact `type === 'text-delta'` chunk ever reaches the child.
 *
 * Usage total: `result.usage` is LAST-STEP-ONLY (a real gotcha, verified in Task 1's probe); a
 * multi-step tool-calling turn would silently under-count if the engine read that field. The
 * top-level `finish` chunk's `.totalUsage` is the cross-step sum (also verified) and is the ONLY
 * chunk of type `'finish'` on `fullStream`, emitted once, last — so it's captured here by
 * intercepting that one chunk while relaying the stream through unchanged.
 */

import { streamText, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { runStreamingTurn } from './stream-turn.js';
import { createStreamScreen } from './stream-screen.js';
import { toolSummary } from './tool-summary.js';

// logic/action-schema.js is CommonJS (shared with the browser + node:test suite — see its own
// header comment for why); DEFAULT import (Worker-safe — no createRequire) rather than
// duplicating the op rules here.
import actionSchemaMod from '../logic/action-schema.js';
const { validateAction, OPS } = actionSchemaMod;

/** Max tool-loop steps per turn (propose-a-few-things-then-answer, not an unbounded loop). */
const MAX_STEPS = 4;

/**
 * Zod input schemas for the 7 generic verbs — deliberately mirror `validateAction`'s own SHAPE
 * constraints (non-empty strings, numeric value, non-empty id arrays). These are STRUCTURAL only
 * (a project's actual param bounds / declared slot·check names are unknown at schema-definition
 * time — they live in the manifest); `validateAction(action, manifest)` is still called on every
 * tool execution as the authoritative re-check (a schema mismatch or a model quirk must never be
 * the only thing standing between a malformed or manifest-invalid action and `proposedActions`).
 */
const OP_SCHEMAS = {
  setParam: z.object({ name: z.string().min(1), value: z.number() }),
  createGroup: z.object({ slot: z.string().min(1), name: z.string().min(1) }),
  addItems: z.object({ slot: z.string().min(1), group: z.string().min(1).optional(), ids: z.array(z.string().min(1)).min(1) }),
  removeItems: z.object({ slot: z.string().min(1), group: z.string().min(1).optional(), ids: z.array(z.string().min(1)).min(1) }),
  runCheck: z.object({ name: z.string().min(1) }),
  undoLast: z.object({}),
  rememberUser: z.object({ note: z.string().min(1) }),
};

const OP_DESCRIPTIONS = {
  setParam: 'Propose changing one of the project\'s tunable settings.',
  createGroup: 'Propose creating a new named group in a grouped collection.',
  addItems: 'Propose adding the child\'s items (by id) to a collection.',
  removeItems: 'Propose removing items (by id) from a collection.',
  runCheck: 'Propose running one of the project\'s checks (train/test/try it).',
  undoLast: 'Propose undoing the last applied change.',
  rememberUser: 'Propose remembering a short note about the child for later turns.',
};

/**
 * One-line manifest vocabulary appended to a tool description so the model knows THIS project's
 * real names (built from the sanitized manifest — already screened at the gateway door). Total: a
 * missing/garbage manifest, or a category the manifest declares nothing for, yields `''` (the base
 * `OP_DESCRIPTIONS` text alone) — never a throw.
 * @param {string} op @param {object} [manifest] @returns {string}
 */
function manifestHint(op, manifest) {
  const m = manifest && typeof manifest === 'object' ? manifest : {};
  const list = (xs, f) => (Array.isArray(xs) && xs.length ? xs.map(f).join(' · ') : '');
  if (op === 'setParam') { const s = list(m.params, (p) => `"${p.name}" = ${p.label} (${p.min}..${p.max})`); return s ? ` Valid: ${s}.` : ''; }
  if (op === 'createGroup') { const s = list((m.slots || []).filter((x) => x.grouped), (x) => `"${x.name}" = ${x.label}`); return s ? ` Grouped slots: ${s}.` : ''; }
  if (op === 'addItems' || op === 'removeItems') { const s = list(m.slots, (x) => `"${x.name}" = ${x.label} (${x.grouped ? 'grouped' : 'flat'})`); return s ? ` Slots: ${s}.` : ''; }
  if (op === 'runCheck') { const s = list(m.checks, (c) => `"${c.name}" = ${c.label}`); return s ? ` Valid: ${s}.` : ''; }
  return '';
}

const PROPOSED_MESSAGE = 'Proposed to the child — waiting for their approval.';

/**
 * The check entry `manifest` declares under `name`, or `null`. Mirrors `action-schema.js`'s own
 * `entryIn` lookup rather than reaching into it, and is TOTAL over a missing/garbage manifest — by
 * the time this runs `validateAction` has already proved the name is declared, so `null` here means
 * only "no manifest to ask", never "undeclared".
 * @param {object} [manifest] @param {string} name @returns {object|null}
 */
function declaredCheck(manifest, name) {
  const checks = manifest && typeof manifest === 'object' && Array.isArray(manifest.checks) ? manifest.checks : [];
  return checks.find((c) => c && c.name === name) || null;
}

/**
 * The usable strings in `xs`, or `[]`. NOT a screen — `sanitizeProjectState`'s `okId` already ran
 * `screen()` over every kept `groups`/`ids` entry; this is only shape defence for a caller that
 * hands `buildTools` an unsanitized state directly (it is an exported, unit-testable function).
 * @param {*} xs @returns {string[]}
 */
const usableStrings = (xs) => (Array.isArray(xs) ? xs.filter((v) => typeof v === 'string' && v.length > 0) : []);

/**
 * Renders this turn's sanitized `findings` as compact, kid-readable LINES — the tool RESULT a
 * read-only check hands back instead of `PROPOSED_MESSAGE` (spec §11b.3). Never raw JSON: the model
 * reads this and explains it to a child, so it has to be quotable as sentences.
 *
 * WHY THIS EXISTS AT ALL: `PROPOSED_MESSAGE` told the model it was awaiting approval, so — observed
 * live in a child's playtest — it asked "Can you tap Yes or OK to let it check?" for a look that had
 * ALREADY run, and could only parrot a 60-char readout when asked why. A look changes nothing, so
 * there is no approval to wait for; every branch below says exactly that, in as many words.
 *
 * HONESTY IS THE POINT (spec §11b.5). Three facts a lazier renderer would collapse into one empty
 * string are kept DISTINCT, because a child told "your photos are fine" when nobody actually looked
 * has been lied to — which is the very failure this feature exists to remove:
 *   1. no state, or no `findings` array → the check has NOT run this turn (say so; don't guess).
 *   2. `findings: []`                   → it DID run, and found nothing wrong.
 *   3. `findings: [...]`                → it ran, and here is what it found.
 * A fourth, defence-in-depth branch (a non-empty array whose entries are all unreadable) gets its
 * own sentence rather than silently degrading into #2 — same dishonesty, quieter cause.
 *
 * WHAT IS INTERPOLATED, AND NOTHING ELSE: every character returned here is model-visible and can
 * reach the child through the reply, so only fields the sanitizers already ran `screen()` over are
 * pasted in — the check's `label` (`okLabel`), each finding's `note`, and its `groups`/`ids`
 * (`okId`). A finding's `kind` is DELIBERATELY omitted: `sanitizeProjectState` only regex-bounds it
 * (`/^[a-z][a-zA-Z]{0,20}$/`) and never screens it, and a letters-only token can still be a word no
 * child should read. It is also not needed — the `note` already carries the meaning in the project's
 * own voice, and a kind→English table here would drag one cluster's taxonomy into the
 * project-agnostic layer (spec §14: "generalise the SHAPE, never the MATH").
 *
 * @param {{label?:string}} check - the manifest's own entry for the check that was called.
 * @param {object} [state] - this turn's sanitized project state (`sanitizeProjectState`'s return).
 * @returns {string}
 */
function findingsText(check, state) {
  const label = typeof check.label === 'string' && check.label.length > 0 ? `"${check.label}"` : 'This check';
  // Present on EVERY branch — this clause is what stops the model asking a child to approve a look.
  // The SCOPE sentence is the second half of the same job, added after an owner playtest: a check
  // reports only what it measured, and the model must not dress that up into a broader verdict.
  const head = `${label} is a look-only check: running it changes nothing, so there is nothing for the child to approve.`
    + ' It compares the child\'s own items against each other and reports only what it measured —'
    + ' it cannot see picture quality, lighting, focus or framing, so never describe those.';

  const raw = state && typeof state === 'object' && !Array.isArray(state) ? state.findings : undefined;
  if (!Array.isArray(raw)) {
    return `${head} No results for it came through this turn, so nothing has actually been looked at yet. Do not guess what it would have found — ask the child to run it in the app first.`;
  }
  if (raw.length === 0) {
    // NEVER say "healthy"/"clear"/"fine" here. This exact branch used to end "everything it looks at
    // is healthy right now", and in an owner playtest the buddy relayed it to a child as "All 4
    // photos are clear and healthy" — a claim about IMAGE QUALITY that nothing measured and nothing
    // could measure. The model was not hallucinating; it was repeating us. An all-clear means only
    // that no checked-for problem crossed a threshold, and the wording has to stop exactly there.
    return `${head} It ran this turn and none of the problems it looks for turned up.`
      + ' Report only that. "Nothing I check for turned up" is honest;'
      + ' "everything is fine / clear / healthy / good" claims more than the check measured.';
  }

  const lines = [];
  for (const f of raw) {
    if (!f || typeof f !== 'object' || Array.isArray(f)) continue;
    if (typeof f.note !== 'string' || f.note.length === 0) continue; // the note IS the finding
    const groups = usableStrings(f.groups);
    const ids = usableStrings(f.ids);
    const evidence = [
      groups.length ? `groups: ${groups.join(', ')}` : '',
      ids.length ? `items: ${ids.join(', ')}` : '',
    ].filter(Boolean).join('; ');
    lines.push(`${lines.length + 1}. ${f.note}${evidence ? ` (${evidence})` : ''}`);
  }
  if (lines.length === 0) {
    return `${head} It ran this turn and reported ${raw.length} ${raw.length === 1 ? 'result' : 'results'}, but none of them came through readable — say that plainly rather than inventing what they said.`;
  }
  return `${head} It ran this turn and found ${lines.length === 1 ? '1 thing' : `${lines.length} things`}:\n${lines.join('\n')}`;
}

/**
 * Builds the enabled-subset of the 7 generic-verb tools, scoped to the current turn's project via
 * `manifest`. Every WRITE tool's `execute` is identical shape: validate `{op, ...input}` against
 * `validateAction(action, manifest)`, collect it via `onValidAction` ONLY if valid (an invalid
 * action — whether schema-passing-but-manifest-invalid, e.g. an undeclared param name, or one
 * `validateAction` itself rejects for any other reason — is dropped silently; it is never
 * surfaced to the child or the caller), then return the same fixed acknowledgement string
 * regardless (that string is a tool RESULT, not a `text-delta`, so it never reaches the child
 * either way — see the fail-closed note above).
 *
 * THE ONE EXCEPTION — read-only checks (spec §11b.3): a `runCheck` whose check the manifest declares
 * `readOnly: true` proposes NOTHING (no `onValidAction`, so no `[Do it]` card) and returns real data
 * — `findingsText(check, projectState)` — instead of the constant. It DOES still announce itself via
 * the separate display-only `onReadAction` hook, so the agent console can show the child that the
 * buddy went and looked (see that parameter's doc below). "Don't
 * auto-apply WRITES" is a sound rule that had over-generalised into "no tool returns ANYTHING",
 * which killed reads too; a read has no approval problem, because looking changes nothing. Keeping
 * the constant here did not merely stop the model learning, it made the model say something FALSE
 * to a child ("tap Yes to let it check" for a check that had already run). `validateAction` still
 * runs FIRST, so an undeclared check name is still rejected exactly as before, and the read branch
 * is reached only for a name the manifest itself declared. `readOnly === true` is a literal-boolean
 * test on purpose (the same trust boundary `manifest-sanitize.js` enforces): a truthy-but-not-`true`
 * value must never turn a WRITE check into an unapproved one.
 * The set of ops actually built is the intersection of the whitelist (`OPS`) and `enabledOps` (the
 * teacher's admin config, defaulting to ALL ops so every existing caller/test is unchanged). A
 * disabled op is simply NEVER offered to the model as a tool — the strongest possible enforcement:
 * the model can't call a tool that does not exist, so a disabled op cannot reach `proposedActions`
 * via the real tool-call path at all. (The gateway still belt-and-braces gates the json-fallback +
 * final-merge paths against the same `enabledOps` — see gateway.js.)
 * Exported (in addition to being used internally by `runEngineTurn`) so it is directly unit-
 * testable without needing to reach through a mock model's `doStream` call.
 * @param {(action:object)=>void} onValidAction
 * @param {string[]} [enabledOps] - ops the admin has switched on; defaults to the full whitelist.
 * @param {object} [manifest] - the current turn's project manifest; threaded into both each tool's
 *   generated description (`manifestHint`) and the `execute` recheck (`validateAction`). A
 *   missing/garbage manifest degrades every op except `undoLast`/`rememberUser` to permanently
 *   invalid (see `logic/action-schema.js`) — never a throw.
 * @param {object} [projectState] - this turn's already-sanitized project state
 *   (`sanitizeProjectState`), read ONLY by the read-only-check branch, for `state.findings`.
 *   OPTIONAL and inert by design: omit it (the three-argument call every pre-existing call site and
 *   test uses) and a read-only check simply reports honestly that nothing was looked at this turn —
 *   it never throws, and no other op observes the parameter at all.
 * @param {(action:object)=>void} [onReadAction] - DISPLAY-ONLY notification that a read-only check
 *   ran. Deliberately a SECOND callback rather than a reuse of `onValidAction`: that one's whole job
 *   is filing the approval card, which is exactly what a read must not do. This one exists because
 *   the console frame used to ride along inside `onValidAction`, so skipping it for reads made a
 *   read completely invisible — the buddy just silently knew things. "It went and looked at my
 *   photos" is the most honest and most teachable moment in the exchange for a child learning what
 *   an AI actually does, so it is shown; silent omniscience is the wrong lesson. Optional: omit it
 *   and the read still returns its findings, just without the console line.
 * @returns {Record<string, ReturnType<typeof tool>>}
 */
export function buildTools(onValidAction, enabledOps = OPS, manifest, projectState, onReadAction) {
  const enabled = new Set(enabledOps);
  const tools = {};
  for (const op of OPS) {
    if (!enabled.has(op)) continue; // disabled op — never advertised as a callable tool
    tools[op] = tool({
      description: OP_DESCRIPTIONS[op] + manifestHint(op, manifest),
      inputSchema: OP_SCHEMAS[op],
      execute: async (input) => {
        const action = { op, ...input };
        const result = validateAction(action, manifest);
        if (!result.ok) return PROPOSED_MESSAGE; // dropped silently, exactly as before
        // READ branch — proposes nothing, returns data. See the `readOnly` note in the doc above.
        // The hook fires only AFTER `validateAction` passed and only for a declared-readOnly check,
        // so the console can never show a look that did not actually happen.
        const check = op === 'runCheck' ? declaredCheck(manifest, result.action.name) : null;
        if (check && check.readOnly === true) {
          if (onReadAction) onReadAction(result.action); // display only — no card, no proposal
          return findingsText(check, projectState);
        }
        onValidAction(result.action);
        return PROPOSED_MESSAGE;
      },
    });
  }
  return tools;
}

/**
 * Runs one buddy turn through the AI SDK's `streamText` tool-loop, relaying it through the
 * existing `runStreamingTurn`/`createStreamScreen` pipeline unchanged.
 *
 * ERROR CONTRACT: this function does NOT catch — a mid-stream `fullStream` or `finalize` throw
 * rejects the returned promise, possibly AFTER delta frames were already written and WITHOUT a
 * terminal frame. The one-terminal-frame guarantee is the CALLER's (the gateway wraps this call
 * and closes the stream with a best-effort terminal on throw, exactly as it did for the previous
 * engine).
 * @param {{model:object, system?:string, messages:Array<object>, screen:(text:string)=>({ok:true}|{ok:false,reason:string,deflection:string}),
 *   write:(frame:object)=>void, finalize:(fullText:string)=>Promise<object>, enabledOps?:string[],
 *   manifest?:object, projectState?:object}} deps - `manifest` is the current turn's
 *   (already-sanitized) project manifest, threaded into `buildTools` (tool descriptions + the
 *   execute-time `validateAction` recheck) and into `toolSummary` (kid-readable mid-stream tool-call
 *   labels). `projectState` is the matching sanitized state, threaded into `buildTools` so a
 *   read-only check can return its real `findings`; OPTIONAL — omitting it (as every pre-existing
 *   caller does) leaves every write path byte-identical and only makes a read-only check report
 *   honestly that nothing was looked at this turn.
 * @returns {Promise<{text:string, proposedActions:object[], usage:object|null, terminal:'done'|'cut'}>}
 */
export async function runEngineTurn({ model, system, messages, screen, write, finalize, enabledOps, manifest, projectState }) {
  const proposedActions = [];
  /**
   * Agent-console visibility: surface a tool call the moment it happens (mid-stream), the way a real
   * coding agent shows its tool use. Display only — approval still happens on the card. The summary
   * carries model-originated text (group names, notes) so it is screened like any other child-visible
   * string; a flagged summary degrades to the bare op name (never blocks the call — the ACTION itself
   * is separately screened by the gateway's screenAction path).
   * ONE function serves BOTH classes of call — a proposal and a read — so the two frames can never
   * drift apart in shape, or in whether their text got screened. Only `source` differs, and it is
   * the field that tells a renderer whether a [Do it] card is coming: `'tool-call'` will be answered
   * by one, `'read'` never will (looking changes nothing, so there is nothing to approve).
   * @param {object} action already `validateAction`-approved @param {'tool-call'|'read'} source
   */
  const writeToolFrame = (action, source) => {
    const raw = toolSummary(action, manifest);
    const summary = raw && screen(raw).ok ? raw : action.op;
    write({ type: 'tool', op: action.op, summary, source });
  };
  const tools = buildTools((action) => {
    proposedActions.push(action);
    writeToolFrame(action, 'tool-call');
  }, enabledOps, manifest, projectState, (action) => writeToolFrame(action, 'read'));

  // The SDK's default onError prints the complete provider error, including
  // requestBodyValues. Our gateway logs only bounded, scrubbed fields below.
  const result = streamText({ model, system, messages, tools, stopWhen: stepCountIs(MAX_STEPS), onError: () => {} });

  // Cross-step usage total, captured off the one-time `finish` chunk while relaying `fullStream`
  // through untouched (see file header — `result.usage` alone would under-count a tool-calling
  // turn). Stays null if the turn is cut before the stream naturally reaches `finish` (a cut walks
  // away from the rest of the model's output on purpose — there is no honest total to report).
  let usage = null;
  async function* relayFullStream() {
    for await (const chunk of result.fullStream) {
      // A provider failure mid-call arrives as an `error` CHUNK, not a rejection (seen live: the
      // free endpoint's "Streaming response failed"). Silently dropping it would let the turn
      // "complete" with empty text — the child would see a blank "…" reply instead of the
      // gateway's honest fallback. Throw instead: the gateway's catch turns a pre-delta failure
      // into the labelled stub and a post-delta one into a best-effort close (its error contract).
      if (chunk.type === 'error') {
        // WHY Object.assign, not a plain `new Error(...)`: the underlying failure is usually an
        // AI-SDK `APICallError` carrying real `statusCode`/`url` own properties (e.g. a BYOK
        // provider's 401). Burying it in the message string alone loses those fields — and
        // `server/turn.js`'s catch reads `e.statusCode`/`e.url` directly (its `upstreamStatus` on
        // the done frame, which is what makes the client's spec-§3.5 "that key didn't work" copy
        // ever fire) plus logs `e.url` for operators. Carrying them through the wrap as real
        // properties is what keeps that path alive on a REAL upstream failure, not just in a test
        // that hands the engine a pre-shaped statusCode.
        const info = chunk.error ?? chunk;
        throw Object.assign(new Error(`model stream error: ${String(info?.name || 'provider failure')}`), {
          statusCode: info?.statusCode,
          url: info?.url,
        });
      }
      if (chunk.type === 'finish') usage = chunk.totalUsage ?? null;
      yield chunk;
    }
  }

  const streamScreen = createStreamScreen(screen);
  const outcome = await runStreamingTurn({
    events: relayFullStream(),
    streamScreen,
    isPartForUs: (chunk) => chunk.type === 'text-delta', // exact-type match — see file header WHY
    deltaOf: (chunk) => chunk.text ?? '',
    isIdle: () => false, // the stream simply ends; natural exhaustion is a proven stream-turn path
    finalize,
  }, write);

  // A cut turn returns NO proposals: actions harvested before the flagged phrase came from a turn
  // the screen just rejected — handing the gateway a live proposal list from a cut turn would
  // invite acting on output the child was never allowed to finish seeing. Fail closed.
  return {
    text: streamScreen.text(),
    proposedActions: outcome.cut ? [] : proposedActions,
    usage,
    terminal: outcome.cut ? 'cut' : 'done',
  };
}
