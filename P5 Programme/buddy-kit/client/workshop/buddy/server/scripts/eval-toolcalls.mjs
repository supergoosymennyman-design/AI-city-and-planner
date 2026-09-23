#!/usr/bin/env node
// web/coding agent/server/scripts/eval-toolcalls.mjs
/**
 * Scripted tool-call reliability eval for the buddy's OWN engine (universal-projects closeout).
 *
 * WHY THIS EXISTS: `logic/action-schema.js` whitelists 7 generic, manifest-validated verbs
 * (`setParam`, `createGroup`, `addItems`, `removeItems`, `runCheck`, `undoLast`, `rememberUser`),
 * but only a MODEL that reliably emits real tool calls (or, failing that, the
 * `action-fallback.js` fenced-json block — see `server/ops-instruction.js`'s generated "WHEN YOU
 * PROPOSE A PROJECT CHANGE" persona block) turns those verbs into a `[Do it]` card the child can
 * actually tap. This script runs 16 fixed, action-shaped prompts across the 4 verb families a
 * child's own words would plausibly trigger against the **Recycle-Eye** project — create-a-group
 * (`createGroup`), add/remove-samples (`addItems`/`removeItems`), set-the-unsure-line
 * (`setParam`), train-and-test (`runCheck`) (4 prompts each) — through the REAL `runEngineTurn` +
 * message-array wiring `server/turn.js` itself uses, and tallies whether each turn produced a real
 * tool-call action, a json-fallback action, or neither. It is a MEASUREMENT tool, not a pass/fail
 * gate — there is no "correct" count to assert against; a free/weak model's reliability is exactly
 * the honest thing this script exists to report (see README FINDINGS).
 *
 * MIRRORS THE REAL TURN SHAPE, not a simplified one, so the numbers describe reality:
 *  - Same system prompt as the live turn path: `composeInjection({setting, user, champion,
 *    buddyName, opsBlock})` over `projectMarkdown(manifest, state)`, reading the SAME three memory
 *    files (`server/memory/*.md`) via `readMemory()` (memory.js), with the SAME
 *    generated "WHEN YOU PROPOSE A PROJECT CHANGE" persona block `server/ops-instruction.js`
 *    produces for the real system prompt (`opsInstruction(OPS, manifest)` — the verb
 *    shapes AND this project's real param/slot/check vocabulary, exactly as `turn.js` derives
 *    it from `config.enabledOps` + this request's manifest every turn). Without this block the model
 *    would not even know it may propose a change, so it is NOT optional scaffolding here.
 *  - Same per-turn user-message shape as `/api/turn`: `"Project right now: <live
 *    numbers>.\n\n<child's message>"` (`logic/project-state.js`'s `describeProject(manifest,
 *    state)`), and the running conversation accumulates turn-to-turn in the same `[system, ...turns,
 *    {user}]` array `turn.js` builds, exactly as a real lesson would (a single continuous session of
 *    16 turns, not 16 isolated one-shots) — so later turns see the same growing-context reality a
 *    real 16-message lesson would.
 *  - Same finalize hook as the live turn path: `extractJsonActions(fullText, validateAction)` bound to
 *    THIS project's manifest (`turn.js`'s own `gatedValidate` closes over `ctx.safeManifest` the
 *    same way) — the SAME fallback extractor + validator the real finalize uses (action-fallback.js).
 *  - Same real `screen()` (filter.js) gates every streamed delta + the final reply, exactly as live.
 *
 * RUN: `node server/scripts/eval-toolcalls.mjs` from `web/coding agent/` (or anywhere — paths below
 * are import-relative, not cwd-relative). Env: `BUDDY_MODEL_URL` / `BUDDY_MODEL_ID` /
 * `BUDDY_MODEL_KEY` / `BUDDY_MODEL_CONTEXT` configure the provider exactly as the gateway does (see
 * `provider.js`); the default endpoint answers without a key today (see README FINDINGS), so this
 * script needs NO setup to produce a real live table.
 *
 * FAILURE HANDLING: no `Math.random`/`Date.now` anywhere in this script (the prompt list and the
 * project-state snapshots are fixed, deterministic literals — AGENTS.md determinism rule) — the
 * only non-determinism is the live model's own answer, which is the whole point of measuring it.
 * Each turn is wrapped in its own try/catch: a network failure, a timeout, or any other engine
 * throw records that ONE turn as `'error'` (tool:0, fallback:0) and the eval moves on to the next
 * turn rather than aborting the whole 16-turn run over one bad network blip.
 */
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createRequire } from 'node:module';
import { buildModel } from '../provider.js';
import { runEngineTurn } from '../engine.js';
import { extractJsonActions } from '../action-fallback.js';
import { readMemory, composeInjection, projectMarkdown } from '../memory.js';
import { opsInstruction } from '../ops-instruction.js';
import { screen } from '../filter.js';

// logic/*.js are CommonJS (shared with the browser + node:test suite — see their own header
// comments for why); interop via createRequire exactly as engine.js and gateway.js already do.
const require = createRequire(import.meta.url);
const { validateAction, OPS } = require('../../logic/action-schema.js');
const { describeProject } = require('../../logic/project-state.js');
const { manifest, initialState } = require('../../logic/projects/recycle-eye.js');

const BUDDY_NAME = 'Buddy';

/** Deep-clones a project state (repo idiom — see logic/project-state.js's own applyAction). */
const cloneState = (s) => JSON.parse(JSON.stringify(s));

/**
 * Builds one Recycle-Eye project-state snapshot (the manifest's own shape: `params.threshold` +
 * a grouped `samples` slot with `foil`/`can` id lists + `accuracy`/`confusions` readouts) —
 * plausible numbers a child would actually be looking at when asking that kind of question (an
 * imbalance for add/remove-items, an already-balanced set for setParam, etc.), same rationale +
 * same numbers as this eval always used, just reshaped into the generic project-state envelope
 * (`logic/projects/recycle-eye.js`'s `initialState()` shape) instead of the retired
 * `champion-state.js` one. Fixed literals, not derived from any prior turn's (unapplied)
 * proposals — this eval measures tool-call RELIABILITY, not project simulation, so each situation
 * type gets the context that best surfaces its own ask.
 * @param {number} foilCount @param {number} canCount @param {string} accuracy
 * @param {string} confusions @param {number} threshold
 */
function situationState(foilCount, canCount, accuracy, confusions, threshold) {
  const s = cloneState(initialState());
  s.params.threshold = threshold;
  s.slots.samples.groups = {
    foil: Array.from({ length: foilCount }, (_, i) => `f${i + 1}`),
    can: Array.from({ length: canCount }, (_, i) => `c${i + 1}`),
  };
  s.readouts.accuracy = accuracy;
  s.readouts.confusions = confusions;
  return s;
}

const STATES = {
  createGroup: situationState(6, 9, '78%', 'none', 0.5),
  addRemoveItems: situationState(2, 9, '62%', 'foil↔can', 0.5),
  setParam: situationState(9, 9, '81%', 'none', 0.5),
  runCheck: situationState(9, 9, '74%', 'none', 0.6),
};

/**
 * 16 fixed prompts, 4 per situation type, each phrased the way a real 10-year-old chatting with
 * their buddy would ask it (first-person, casual, referencing the champion) rather than a
 * developer-shaped imperative — matching `server/memory/Setting.md`'s own kid-register persona and
 * the wording style `tests/drive.mjs`'s header comment documents as the reliable, action-shaped
 * phrasing this project has already found works for eliciting a proposal. The wording itself
 * predates the verb rename and needs no change: a child asking to "teach it a new one called
 * bottle" is exactly a `createGroup` ask on the `samples` slot, "add samples s10... to foil" is
 * exactly an `addItems` ask, etc. — only the underlying op names + state shape changed.
 */
const TURNS = [
  // --- createGroup (4) ---
  { type: 'createGroup', prompt: 'My champion only knows foil and can right now. Can we teach it a brand new one called bottle?' },
  { type: 'createGroup', prompt: "There's another kind of trash, paper, that we haven't taught it yet. Can you make a class called paper?" },
  { type: 'createGroup', prompt: 'Can we add a whole new group for glass jars? Let\'s call the class glass.' },
  { type: 'createGroup', prompt: 'I want it to learn batteries too — can you create a new category for that?' },
  // --- addItems / removeItems (4) ---
  { type: 'addRemoveItems', prompt: 'My champion has foil:2 and can:9 and they mix up. Please add samples s10,s11,s12,s13 to foil.' },
  { type: 'addRemoveItems', prompt: 'Foil only has a couple pictures. Add s20, s21, and s22 to foil so it learns better.' },
  { type: 'addRemoveItems', prompt: 'I think some of the can photos are bad, ids c8 and c9 — can you take those out of can?' },
  { type: 'addRemoveItems', prompt: 'Can we remove samples c1 and c2 from can? I think they were blurry.' },
  // --- setParam (4) ---
  { type: 'setParam', prompt: 'The champion keeps guessing even when it should say unsure. Can we raise the confidence threshold to 0.8?' },
  { type: 'setParam', prompt: "It says unsure way too much. Can you lower the threshold to 0.3?" },
  { type: 'setParam', prompt: 'Can we set the confidence level to 0.6 so it is a little more careful?' },
  { type: 'setParam', prompt: 'I want it to only answer when it is really sure — set the threshold super high, like 0.9.' },
  // --- runCheck (4) ---
  { type: 'runCheck', prompt: 'I think we added enough photos now. Can we train it and see how it does?' },
  { type: 'runCheck', prompt: "Let's test the champion and check its accuracy!" },
  { type: 'runCheck', prompt: 'Can you train and evaluate it for me?' },
  { type: 'runCheck', prompt: "I'm ready — go ahead and retrain the champion so we can see the new score." },
];

/**
 * Classifies one turn's outcome for the per-turn table + totals.
 * @param {number} toolCount - real tool-call actions the engine's own `proposedActions` carried.
 * @param {number} fallbackCount - json-fallback actions `extractJsonActions` found in the final text.
 * @returns {'tool'|'fallback'|'none'}
 */
function classify(toolCount, fallbackCount) {
  if (toolCount > 0) return 'tool';
  if (fallbackCount > 0) return 'fallback';
  return 'none';
}

async function main() {
  const { model, modelId, baseURL, contextLimit } = buildModel(process.env, createOpenAICompatible);
  console.log('=== eval-toolcalls: 16-turn tool-call reliability eval (Recycle-Eye) ===');
  console.log(`model: ${modelId} @ ${baseURL}`);
  console.log(`context limit: ${contextLimit ?? 'unknown (BUDDY_MODEL_CONTEXT=0)'}\n`);

  // `validateAction` takes `(action, manifest)` — the real turn path's own `gatedValidate` closes over
  // `ctx.safeManifest` the same way (see turn.js); this script has exactly one project for its
  // whole run, so the closure is just the Recycle-Eye manifest, bound once.
  const boundValidateAction = (a) => validateAction(a, manifest);

  // Same real wiring the live turn path uses: ONE continuous conversation held as a plain messages
  // array — `[system, ...turns, {user}]`, exactly the literal `server/turn.js`'s `composeTurnContext`
  // builds per request now that the Scope-Law refactor deleted history.js and its per-lesson singleton
  // (spec §3). The system prompt is composed from the SAME three memory files (Setting/User/Champion)
  // live on disk right now, PLUS the same generated op-proposal persona block (opsInstruction) turn.js
  // derives from the enabled ops + this turn's manifest — every one of the 7 verbs enabled, matching
  // config.js's loadConfigFromEnv default (all of OPS, absent a BUDDY_ENABLED_OPS restriction).
  // This eval has no per-turn request payload, so the live `readMemory()` read IS this run's memory
  // (matching the eval's own "reading the SAME three memory files" claim above) — unchanged behavior.
  const mem = readMemory();
  const system = {
    role: 'system',
    content: composeInjection({
      setting: mem.setting,
      user: mem.user,
      champion: projectMarkdown(manifest, STATES.createGroup),
      buddyName: BUDDY_NAME,
      opsBlock: opsInstruction(OPS, manifest),
    }),
  };
  const turns = []; // grows user/assistant pair by pair, exactly as one continuous 16-turn lesson would

  const rows = [];
  for (let i = 0; i < TURNS.length; i += 1) {
    const turn = TURNS[i];
    const state = STATES[turn.type];
    const userText = `Project right now: ${describeProject(manifest, state)}.\n\n${turn.prompt}`;

    let fallbackActions = [];
    const finalize = async (fullText) => {
      const { actions, cleanedText } = extractJsonActions(fullText, boundValidateAction);
      fallbackActions = actions;
      const full = screen(cleanedText);
      return full.ok ? { reply: cleanedText || '…', ok: true } : { reply: full.deflection, ok: false };
    };

    let row;
    try {
      const out = await runEngineTurn({
        model,
        messages: [system, ...turns, { role: 'user', content: userText }],
        screen,
        write: () => {}, // discard delta/cut frames — this eval only cares about the terminal tally
        finalize,
        enabledOps: OPS,
        manifest,
      });
      const toolCount = out.terminal === 'cut' ? 0 : out.proposedActions.length;
      const fallbackCount = out.terminal === 'cut' ? 0 : fallbackActions.length;
      row = { n: i + 1, type: turn.type, terminal: out.terminal, tool: toolCount, fallback: fallbackCount, kind: classify(toolCount, fallbackCount) };
      // Record the turn so the NEXT one sees real accumulated context, exactly like a real lesson.
      // A cut turn's `out.text` can be empty; the `|| '…'` placeholder is THIS script's own defensive
      // choice (the retired history.pushTurn stored the raw text as given) — an empty assistant message
      // is rejected outright by some providers, which would abort the remaining turns of the eval.
      turns.push({ role: 'user', content: userText }, { role: 'assistant', content: out.text || '…' });
    } catch (e) {
      console.error(`  turn ${i + 1} (${turn.type}) FAILED — network/engine error, recording 'error' and continuing: ${e.message}`);
      row = { n: i + 1, type: turn.type, terminal: 'error', tool: 0, fallback: 0, kind: 'error' };
    }
    rows.push(row);
  }

  // ── per-turn table ──────────────────────────────────────────────────────────────────────────
  console.log('  #  type                 terminal  tool  fallback  kind');
  console.log('  -  -------------------  --------  ----  --------  -------');
  for (const r of rows) {
    console.log(
      `  ${String(r.n).padStart(2)}  ${r.type.padEnd(19)}  ${r.terminal.padEnd(8)}  ${String(r.tool).padStart(4)}  ${String(r.fallback).padStart(8)}  ${r.kind}`,
    );
  }

  // ── totals ──────────────────────────────────────────────────────────────────────────────────
  const totals = rows.reduce(
    (acc, r) => {
      acc.tool += r.kind === 'tool' ? 1 : 0;
      acc.fallback += r.kind === 'fallback' ? 1 : 0;
      acc.none += r.kind === 'none' ? 1 : 0;
      acc.error += r.kind === 'error' ? 1 : 0;
      return acc;
    },
    { tool: 0, fallback: 0, none: 0, error: 0 },
  );
  console.log('\n=== totals (16 turns) ===');
  console.log(`  tool-call: ${totals.tool}   json-fallback: ${totals.fallback}   none: ${totals.none}   error: ${totals.error}`);

  // Per-situation-type breakdown — a model can be reliable for one verb family and not another;
  // the flat total alone would hide that (see README FINDINGS for how this is reported honestly).
  console.log('\n=== by situation type ===');
  for (const type of ['createGroup', 'addRemoveItems', 'setParam', 'runCheck']) {
    const forType = rows.filter((r) => r.type === type);
    const t = forType.filter((r) => r.kind === 'tool').length;
    const f = forType.filter((r) => r.kind === 'fallback').length;
    const n = forType.filter((r) => r.kind === 'none').length;
    const e = forType.filter((r) => r.kind === 'error').length;
    console.log(`  ${type.padEnd(18)} tool:${t}  fallback:${f}  none:${n}  error:${e}`);
  }
  console.log('\n=== eval-toolcalls: done ===');
}

main().catch((err) => {
  // A throw here means main() itself blew up OUTSIDE the per-turn try/catch (e.g. buildModel's
  // loud-failure config validation) — that is a real setup problem worth a non-zero exit, unlike a
  // single turn's network hiccup (handled per-turn above).
  console.error('eval-toolcalls FAILED:', err);
  process.exitCode = 1;
});
