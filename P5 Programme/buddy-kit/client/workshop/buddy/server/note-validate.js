// web/coding agent/server/note-validate.js
/**
 * Pure, testable gate on a client-supplied `note` before it becomes durable memory. Mirrors
 * `champion-sanitize.js` / `action-safety.js`'s split: the gateway (trust boundary) still owns the
 * real kid-safety `screen()` from `filter.js`, but the DECISION of what makes a note acceptable —
 * and how a missing/oversized/flagged note is handled — lives here as a pure, unit-testable
 * function that never touches the network, the real filter, or the filesystem.
 *
 * WHY this exists: `POST /api/memory`'s `note` arrives in an unauthenticated POST body and, once
 * accepted, is appended VERBATIM to `memory/User.md` — a curated file that is (a) teacher-visible
 * and (b) re-injected as durable engine context on EVERY future lesson via
 * `readMemory()`/`composeInjection()` (see `memory.js`). Unlike a single turn's transcript, this
 * cost is paid forever: an oversized note permanently inflates the Fresh-Start/Tidy-Up baseline
 * this whole feature exists to keep small, and a malformed/absent note (`{}` body → `note`
 * undefined, or a non-string note) would previously append the literal string "undefined" or
 * "[object Object]" to the child's memory file. `screen(undefined)` alone does not catch this: the
 * real filter coerces its input with `String(text || '')`, so a missing note SAILS THROUGH the
 * safety screen as "ok" and only becomes visible as a bug once it's already on disk. So presence,
 * type, and length are validated HERE, before the note ever reaches `screen()` or gets written to disk.
 *
 * Stateless-buddy Task 2 deleted `POST /api/memory` (and the disk-writer it called) — `validateNote`
 * has no current caller, but is kept (and still unit-tested — see note-validate.test.js) because the
 * same shape of problem — an unauthenticated caller's raw note needing validation before it becomes
 * durable, teacher-visible memory — resurfaces on the champion-file write path a later stateless-buddy
 * task adds.
 */

/**
 * Validate (and screen) a candidate durable-memory note.
 * @param {*} note - client-supplied note (should be a non-empty string after trim; the client can
 *   send anything in an unauthenticated POST body, including `undefined`, an object, or an
 *   oversized string).
 * @param {(text:string) => {ok:true}|{ok:false,reason:string,deflection:string}} screen - the
 *   kid-safety filter to run the trimmed note through (injected, like `champion-sanitize.js`'s
 *   `screen` param, so this stays pure/testable without importing the real `filter.js`; the gateway
 *   passes the real `screen`).
 * @param {number} [maxLen=280] - trimmed notes longer than this are rejected as `too-long`. 280
 *   keeps a single note a small fraction of `memory.js`'s `USER_BUDGET` (~1400 chars) for the whole
 *   file, so a handful of notes can accumulate before the buddy needs to propose consolidation —
 *   one oversized note should never alone blow the budget.
 * @returns {{ok:true, note:string}|{ok:false, reason:'empty'|'too-long'|'flagged'}} on success, the
 *   TRIMMED note (never the raw input) so callers never persist incidental leading/trailing
 *   whitespace.
 */
export function validateNote(note, screen, maxLen = 280) {
  if (typeof note !== 'string') return { ok: false, reason: 'empty' };
  const trimmed = note.trim();
  if (trimmed.length === 0) return { ok: false, reason: 'empty' };
  if (trimmed.length > maxLen) return { ok: false, reason: 'too-long' };
  if (!screen(trimmed).ok) return { ok: false, reason: 'flagged' };
  return { ok: true, note: trimmed };
}

/**
 * Validate + screen the two BULK memory fields a portable buddy carries (notes → User.md,
 * persona → Setting.md) before they REPLACE those files. Same trust rationale as validateNote:
 * both arrive in an UNAUTHENTICATED POST body (the child brings their own champion) and both are
 * re-injected as durable engine context — persona is literally the system prompt. Each field is
 * INDEPENDENT: a flagged / oversized / non-string field is dropped (recorded in `rejected`) while a
 * clean sibling still passes, so one bad field never blocks the whole import. Unlike validateNote,
 * the value is NOT trimmed — these are multi-line markdown files whose leading `#` heading and
 * newlines are meaningful; only length + screen gate them.
 * @param {{notes?:*, persona?:*}} payload client-supplied
 * @param {(text:string)=>{ok:boolean}} screen injected kid-safety filter (gateway passes the real one)
 * @param {number} [maxLen=8192] per-field hard cap — matches Setting.md's own persona-length bound
 *   (the admin route that used to enforce this same cap on a teacher's direct edit was deleted in
 *   stateless-buddy Task 3; this validator is now the only place that bound is enforced)
 * @returns {{notes?:string, persona?:string, rejected:{notes?:'empty'|'too-long'|'flagged', persona?:'empty'|'too-long'|'flagged'}}}
 */
export function validateImport(payload, screen, maxLen = 8192) {
  const out = { rejected: {} };
  const p = payload || {};
  for (const field of ['notes', 'persona']) {
    const raw = p[field];
    if (raw == null) continue;                                  // absent → nothing to write (not an error)
    if (typeof raw !== 'string') { out.rejected[field] = 'empty'; continue; }
    if (raw.trim().length === 0) { out.rejected[field] = 'empty'; continue; }
    if (raw.length > maxLen) { out.rejected[field] = 'too-long'; continue; }
    if (!screen(raw).ok) { out.rejected[field] = 'flagged'; continue; }
    out[field] = raw;
  }
  return out;
}
