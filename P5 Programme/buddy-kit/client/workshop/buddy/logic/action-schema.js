'use strict';
/**
 * Validates buddy-proposed PROJECT actions against a per-project manifest. Single source of truth
 * for the 7 generic verb shapes, imported by the engine's tool loop, the gateway's json-fallback
 * gate, and the browser executor. Validation is STRUCTURAL (against the manifest declaration);
 * existence against live state (does group "foil" exist right now?) stays the client executor's
 * job — the same split the classifier-era schema used.
 * WHY manifest-aware: the buddy is project-agnostic — these verbs cover every P5 project; WHAT
 * they may touch is declared per-project (docs/superpowers/specs/2026-07-21-…-design.md §2).
 * WHY here (logic/, commonjs): both the ESM server code and the commonjs tests must consume it.
 */
const OPS = ['setParam', 'createGroup', 'addItems', 'removeItems', 'runCheck', 'undoLast', 'rememberUser'];
const MAX_NAME = 40;
const isName = (v) => typeof v === 'string' && v.length > 0 && v.length <= MAX_NAME;
const isText = (v) => typeof v === 'string' && v.length > 0;
const allNames = (a) => Array.isArray(a) && a.length > 0 && a.every(isName);
// Total over a possibly-absent manifest: null/garbage just "declares nothing" (only undoLast/
// rememberUser remain valid) — never a throw.
const entryIn = (list, name) => (Array.isArray(list) ? list.find((x) => x && x.name === name) : undefined);

/** @returns {{ok:true,action:object}|{ok:false,error:string}} */
function validateAction(action, manifest) {
  if (!action || typeof action !== 'object') return { ok: false, error: 'action must be an object' };
  const m = manifest && typeof manifest === 'object' ? manifest : {};
  const { op } = action;
  if (!OPS.includes(op)) return { ok: false, error: `unknown op: ${op}` };
  switch (op) {
    case 'setParam': {
      const p = entryIn(m.params, action.name);
      if (!p) return { ok: false, error: `setParam: "${action.name}" is not a declared param` };
      if (typeof action.value !== 'number' || !Number.isFinite(action.value)) return { ok: false, error: 'setParam: value must be a finite number' };
      if (action.value < p.min || action.value > p.max) return { ok: false, error: `setParam: value must be ${p.min}..${p.max}` };
      return { ok: true, action };
    }
    case 'createGroup': {
      const s = entryIn(m.slots, action.slot);
      if (!s) return { ok: false, error: `createGroup: "${action.slot}" is not a declared slot` };
      if (!s.grouped) return { ok: false, error: `createGroup: slot "${action.slot}" is not grouped` };
      return isName(action.name) ? { ok: true, action } : { ok: false, error: 'createGroup needs a 1..40-char name' };
    }
    case 'addItems':
    case 'removeItems': {
      const s = entryIn(m.slots, action.slot);
      if (!s) return { ok: false, error: `${op}: "${action.slot}" is not a declared slot` };
      if (!allNames(action.ids)) return { ok: false, error: `${op} needs a non-empty ids[] of 1..40-char strings` };
      if (s.grouped && !isName(action.group)) return { ok: false, error: `${op}: slot "${action.slot}" is grouped — group name required` };
      if (!s.grouped && action.group !== undefined) return { ok: false, error: `${op}: slot "${action.slot}" is flat — no group allowed` };
      return { ok: true, action };
    }
    case 'runCheck': {
      const c = entryIn(m.checks, action.name);
      if (!c) return { ok: false, error: `runCheck: "${action.name}" is not a declared check` };
      // Literal-true law (matches manifest-sanitize's readOnly): a truthy string never enables it.
      if (c.takesGroup === true) {
        if (!isName(action.group)) return { ok: false, error: `runCheck: "${action.name}" needs a group name (1..40 chars)` };
      } else if (action.group !== undefined) {
        return { ok: false, error: `runCheck: "${action.name}" takes no group` };
      }
      return { ok: true, action };
    }
    case 'undoLast':
      return { ok: true, action };
    case 'rememberUser':
      return isText(action.note) ? { ok: true, action } : { ok: false, error: 'rememberUser needs a note' };
  }
}
/**
 * Does `group` name a group that exists in the live sanitized project state RIGHT NOW?
 *
 * The live-state half of validating a group-taking action, kept here (beside the structural half)
 * so EVERY path that can raise an action card asks the same question. It used to live inline in
 * engine.js's tool loop only — and an owner playtest walked straight through the hole: the free
 * model this gateway ships with makes ~0 real tool calls, so its actions arrive through the JSON
 * fallback (`server/action-fallback.js`), whose validator was structural-only. An invented shelf
 * name therefore passed, raised a [Do it] card, and the child tapped it only to be told
 * "I don't see a shelf called that." The check existed; the path the model actually uses skipped it.
 *
 * @param {*} projectState sanitized state (`sanitizeProjectState` output shape)
 * @param {*} group the model-supplied group name
 * @returns {boolean} true iff some slot declares exactly that group
 */
function groupExistsInState(projectState, group) {
  const slots = (projectState && typeof projectState === 'object' && projectState.slots) || {};
  return Object.values(slots).some((s) => s && s.groups && typeof s.groups === 'object'
    && Object.prototype.hasOwnProperty.call(s.groups, group));
}

/** Every group name the live state actually holds — the ONLY safe source for a "did you mean" list
 *  (these keys already passed `sanitizeProjectState`'s `okId`/`screen`; the model's own string never
 *  has, so it must never be echoed back). @param {*} projectState @returns {string[]} */
function groupsInState(projectState) {
  const slots = (projectState && typeof projectState === 'object' && projectState.slots) || {};
  return Object.values(slots).flatMap((s) => (s && s.groups && typeof s.groups === 'object') ? Object.keys(s.groups) : []);
}

/** Host opt-in for ordinary reversible edits. Deletion and durable memory still use cards.
 * Validation remains mandatory at the gateway and host; this only chooses the interaction. */
function isDirectAction(action, manifest) {
  if (!action || !manifest || manifest.directEdits !== true) return false;
  return ['addItems', 'setParam', 'undoLast'].includes(action.op)
    || (action.op === 'runCheck' && ['run', 'stop'].includes(action.name));
}

// Browser global (classic <script>) — repo idiom so the same file loads in node:test AND the browser.
// Must come BEFORE the module.exports guard: a bare `module.exports = …` throws ReferenceError in a
// classic <script> (no `module` global there), which would abort the file before either export ran.
if (typeof window !== 'undefined') window.ActionSchema = { validateAction, OPS, groupExistsInState, groupsInState, isDirectAction };
if (typeof module !== 'undefined' && module.exports) module.exports = { validateAction, OPS, groupExistsInState, groupsInState, isDirectAction };
