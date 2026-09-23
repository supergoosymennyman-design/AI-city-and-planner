// web/coding agent/server/ops-instruction.js
/**
 * Generates the persona's "when you propose a project change" instruction FROM the admin-configured
 * enabled-ops set AND the current project's (already-sanitized) manifest, instead of it living as
 * static prose in `server/memory/Setting.md`.
 *
 * WHY generated, not hand-maintained text:
 *  - A disabled op must never be advertised to the model. If the instruction were static text in
 *    Setting.md, an admin turning an op off (admin backend) would have no way to also silence the
 *    model's own knowledge that the op exists — the model would keep proposing json blocks for an
 *    op nothing downstream will execute. Generating from `enabledOps` makes "disabled" mean
 *    disabled everywhere at once.
 *  - Setting.md must never be able to DRIFT from the real action contract. The op shapes below are
 *    copied verbatim from the block this module replaces (which was itself hand-authored prose) and
 *    their NAMES are cross-checked against `logic/action-schema.js`'s `OPS` — the single source of
 *    truth `validateAction` actually enforces — by `tests/ops-instruction.test.js` importing the
 *    same `OPS` array. If an 8th op is ever added to action-schema.js without a matching entry in
 *    `SHAPES` below, that op is simply never advertised (silently omitted, never thrown) — a safe
 *    failure mode, not a crash.
 *  - The model is project-agnostic: it only knows a project's real param/slot/check NAMES if we
 *    tell it. The generated "THIS PROJECT is..." vocabulary section (built from the manifest) is
 *    what lets the buddy say "your Unsure line" instead of a generic "a setting", and lets it emit
 *    the exact `name`/`slot` strings `validateAction` will actually accept.
 *
 * Total + never throws: `enabledOps` is untrusted-ish (round-trips through admin config); a
 * non-array, null/undefined, or an array containing unknown op names is all treated as "no ops
 * enabled" (unknown names are silently filtered out, never surfaced as an error). `manifest` is
 * likewise untrusted-ish (round-trips through admin/gateway plumbing, and — until every caller is
 * updated — may simply be omitted entirely): anything that isn't a plain object degrades to "no
 * vocabulary section" (the shapes-only block), never a throw — see
 * `tests/ops-instruction.test.js`'s garbage-input + garbage-manifest cases.
 */

// Verbatim shape strings for the 7 generic verbs — the exact `{"op":...}` example JSON the model
// must copy the shape of. Keyed by op name so `opsInstruction` can filter down to only the enabled
// subset while keeping every shape string byte-identical across the whole enabled/disabled matrix.
const SHAPES = {
  setParam: '{"op":"setParam","name":"<param>","value":<number>}',
  createGroup: '{"op":"createGroup","slot":"<slot>","name":"<string>"}',
  addItems: '{"op":"addItems","slot":"<slot>","group":"<group, only for grouped slots>","ids":["<string>",...]}',
  removeItems: '{"op":"removeItems","slot":"<slot>","group":"<group, only for grouped slots>","ids":["<string>",...]}',
  runCheck: '{"op":"runCheck","name":"<check>"}',
  undoLast: '{"op":"undoLast"}',
  rememberUser: '{"op":"rememberUser","note":"<string>"}',
};

// Canonical op order the shape list is always rendered in, independent of the order `enabledOps`
// happens to list them in — keeps the generated text deterministic (AGENTS.md determinism rule
// applies in spirit here too: same enabled set + manifest in, same string out, regardless of input
// array order).
const OP_ORDER = Object.keys(SHAPES);

// Emitted when NO op is enabled: the model may still propose changes to the project in its normal
// spoken reply, it just must not emit a json action block nobody downstream would execute.
const WORDS_ONLY_INSTRUCTION = [
  'WHEN YOU PROPOSE A PROJECT CHANGE:',
  '- Propose it in words only. Do NOT emit a json action code block of any kind — no project',
  '  change is wired up to run automatically right now, so one would just be silently ignored.',
].join('\n');

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const nonEmptyEntries = (xs) => (Array.isArray(xs) ? xs.filter((e) => e && typeof e === 'object') : []);

/** One `setParam name` vocabulary entry: `"name" = Label (min..max[, step N])`. */
const paramEntry = (p) => `"${p.name}" = ${p.label} (${p.min}..${p.max}${p.step ? `, step ${p.step}` : ''})`;
/** One `slot` vocabulary entry: `"name" = Label (grouped|flat list)`. */
const slotEntry = (s) => `"${s.name}" = ${s.label} (${s.grouped ? 'grouped' : 'flat list'})`;
/** One `runCheck name` vocabulary entry: `"name" = Label`, plus how to call it when it needs more. */
const checkEntry = (c) => {
  let s = `"${c.name}" = ${c.label}`;
  if (c.readOnly === true) s += ' (read-only: use supplied findings now, no permission request)';
  if (c.takesGroup === true) s += ` (send "group": one of the child's group names)`;
  if (c.slow === true) s += ` (runs a while on the child's device — the child sees progress and can stop it)`;
  return s;
};

/**
 * Builds the "THIS PROJECT is..." vocabulary lines from a (hopefully already-sanitized) manifest —
 * the real param/slot/check names + kid labels the model should use, so it can talk about the
 * child's actual project and emit action shapes `validateAction` will accept. Total: a non-object
 * manifest (including `undefined` — see file header) returns `[]` (no vocabulary section at all,
 * not even the header line); any OTHER internal shape surprise (a malformed entry that isn't even
 * an object) is filtered out rather than thrown on. Empty categories (no params/slots/checks) are
 * omitted line-by-line — only the "THIS PROJECT is ..." header is unconditional once `manifest`
 * itself is a valid object.
 * @param {unknown} manifest
 * @returns {string[]}
 */
function vocabularyLines(manifest) {
  if (!isPlainObject(manifest)) return [];
  try {
    const kidJobPart = manifest.kidJob ? ` — the child's job: ${manifest.kidJob}` : '';
    const lines = [`- THIS PROJECT is "${manifest.title || 'Project'}"${kidJobPart}.`];
    const params = nonEmptyEntries(manifest.params);
    const slots = nonEmptyEntries(manifest.slots);
    const checks = nonEmptyEntries(manifest.checks);
    if (params.length) lines.push(`  Settings (setParam name): ${params.map(paramEntry).join('  ·  ')}.`);
    if (slots.length) lines.push(`  Collections (slot): ${slots.map(slotEntry).join('  ·  ')}.`);
    if (checks.length) lines.push(`  Checks (runCheck name): ${checks.map(checkEntry).join('  ·  ')}.`);
    // The child's-eye view of the REAL screen: which on-screen buttons/flow do what. Without this the
    // model knows the machine vocabulary above but not the actual UI, so it invents controls ("look
    // for an Add Photo button") that don't exist. Emitted last so it grounds everything above.
    if (typeof manifest.guide === 'string' && manifest.guide) {
      lines.push(`  How the child uses it — point them at THESE real controls, never invent buttons: ${manifest.guide}`);
    }
    return lines;
  } catch {
    return []; // never let a malformed manifest field take down the whole persona injection
  }
}

/**
 * @param {unknown} enabledOps - the ops the admin has switched on (expected: array of op-name
 *   strings from `logic/action-schema.js`'s `OPS`). Anything else (null/undefined/non-array) is
 *   treated as an empty set, never thrown on.
 * @param {unknown} [manifest] - the current project's already-sanitized manifest. Omitted or
 *   garbage (non-object) degrades to a shapes-only block with no project vocabulary — see file
 *   header (this covers the not-yet-updated gateway caller that passes only `enabledOps`).
 * @returns {string} the "WHEN YOU PROPOSE A PROJECT CHANGE" persona block for exactly the enabled
 *   ops (+ this project's vocabulary, when available), or the words-only instruction when no op is
 *   enabled.
 */
function opsInstruction(enabledOps, manifest) {
  const enabled = new Set(Array.isArray(enabledOps) ? enabledOps : []);
  const shapes = OP_ORDER.filter((op) => enabled.has(op)).map((op) => SHAPES[op]);
  const coaching = [
    'COACHING AND CONTEXT:',
    '- Using Buddy authorizes discussing the context supplied with this message with the selected provider. Do not repeatedly ask permission to read it, explain it or perform a declared read-only check.',
    '- Answer the question first. Connect one actual observation to the concept it teaches and suggest one useful next experiment. A check finding no wiring problems is not evidence of model accuracy.',
    '- Ask a prediction or reasoning question when it helps learning, not a permission question after every answer. This replaces any blanket instruction to end every reply with a question.',
    '- Use only supplied evidence. If context is missing, explain the specific limit once and give useful steps; never claim to see withheld examples or request that private contents be pasted into chat.',
    ...(manifest && manifest.directEdits === true ? [
      '- This host applies requested additions, wiring, setting changes, Run/Stop and Undo directly. Emit those actions only when the learner requests the change; for explanations or suggested experiments, use words without actions. Do not ask for a second approval or a Do it click for those edits.',
      '- Work one small step at a time. Tell the learner what the requested edit is for. Actions are queued until the app reports their result; never claim success in advance. Deletion and remembering still have confirmation cards.',
    ] : []),
  ];
  if (shapes.length === 0) return [WORDS_ONLY_INSTRUCTION, ...coaching].join('\n');
  return [
    'WHEN YOU PROPOSE A PROJECT CHANGE:',
    '- ALSO include exactly one fenced ```json block shaped {"action":{"op":...}} — this is read by the',
    '  app, not shown to the child (it is removed before they ever see your reply), so it is NOT a',
    '  violation of "Do NOT use ... code fences" above, which is about the visible chat text only.',
    '- Use exactly one of these ops/shapes, matching the change you just proposed in words:',
    `  ${shapes.join(' · ')}.`,
    ...vocabularyLines(manifest),
    ...coaching,
  ].join('\n');
}

export { opsInstruction };
