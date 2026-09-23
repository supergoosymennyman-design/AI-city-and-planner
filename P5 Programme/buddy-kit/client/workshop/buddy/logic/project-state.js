'use strict';
/**
 * Generic mechanical reducer + read-model for ANY manifest-driven project (Recycle-Eye,
 * Reflex-Wiring, and future projects the buddy hosts). This module knows NOTHING about a
 * specific project's semantics — only the shapes every project.manifest declares (params /
 * slots[grouped|flat] / checks / readouts) and the five ops that mutate them (setParam /
 * createGroup / addItems / removeItems / runCheck). `undoLast` and `rememberUser` are
 * executor-level (handled by createProjectHost / the browser executor, never by applyAction).
 *
 * WHY throw loudly here: validation of action SHAPE (right types, right fields) is the CALLER's
 * job via action-schema.js (browser executor / engine tool loop validate before ever calling
 * applyAction) — by the time an action reaches applyAction it is assumed well-formed. What
 * applyAction guards against is STRUCTURAL mismatch against a specific project's manifest (an
 * op naming a slot/check the manifest never declared) — that is a bug in the caller or the
 * project definition, not a kid mistake, so it throws per AGENTS.md debuggability ("loud
 * failures — throw with a message") rather than silently no-op'ing.
 *
 * Deterministic: no Math.random / Date.now anywhere — every function here is a pure function
 * of its inputs (repo-wide rule for logic/, AGENTS.md "Determinism = reproducible-from-seed").
 */

/**
 * Applies one action to a project state, returning a NEW state (never mutates `state`).
 * @param {object} state - current project state ({params?, slots?, readouts?}).
 * @param {object} action - `{op, ...}` — already validated by the caller (action-schema.js).
 * @param {object} manifest - the project's manifest ({params, slots, checks, readouts}).
 * @param {object} [checkHandlers] - `{[checkName]: (state) => state}` for `runCheck`.
 * @returns {object} the next state.
 * @throws {Error} on structural mismatch: unknown op, undeclared slot, non-grouped createGroup
 *   target, or a runCheck naming a handler that doesn't exist — always names the op/slot/check.
 */
function applyAction(state, action, manifest, checkHandlers = {}) {
  const slotDef = (name) => (manifest.slots || []).find((s) => s.name === name);
  const s = JSON.parse(JSON.stringify(state)); // clone → immutability (repo idiom, champion-state precedent)
  switch (action.op) {
    case 'setParam':
      s.params = s.params || {};
      s.params[action.name] = action.value;
      return s;
    case 'createGroup': {
      const def = slotDef(action.slot);
      if (!def || !def.grouped) throw new Error(`createGroup: no grouped slot "${action.slot}" in manifest`);
      s.slots = s.slots || {}; s.slots[action.slot] = s.slots[action.slot] || { groups: {} };
      const groups = s.slots[action.slot].groups = s.slots[action.slot].groups || {};
      if (!(action.name in groups)) groups[action.name] = [];
      return s;
    }
    case 'addItems':
    case 'removeItems': {
      const def = slotDef(action.slot);
      if (!def) throw new Error(`${action.op}: no slot "${action.slot}" in manifest`);
      s.slots = s.slots || {}; s.slots[action.slot] = s.slots[action.slot] || (def.grouped ? { groups: {} } : { items: [] });
      const container = def.grouped
        ? ((s.slots[action.slot].groups = s.slots[action.slot].groups || {}), s.slots[action.slot].groups)
        : s.slots[action.slot];
      const key = def.grouped ? action.group : 'items';
      const list = (def.grouped ? container[key] : container.items) || [];
      const next = action.op === 'addItems'
        ? [...list, ...action.ids.filter((id) => !list.includes(id))]
        : list.filter((id) => !action.ids.includes(id));
      if (def.grouped) container[key] = next; else container.items = next;
      return s;
    }
    case 'runCheck': {
      const handler = checkHandlers[action.name];
      if (typeof handler !== 'function') throw new Error(`runCheck: no handler for check "${action.name}"`);
      return handler(s);
    }
    default:
      throw new Error(`applyAction: op "${action.op}" is not a state transition (undoLast/rememberUser are executor-level)`);
  }
}

/**
 * One-line, kid-readable summary of a project's current state, built entirely from the
 * manifest's own labels — this is what the buddy's persona injects so it can talk about the
 * child's real numbers ("Photos {cats: 2}"), and what createProjectHost returns as `note` after
 * every apply. Sections with nothing to show (a param/slot/readout absent from `state`) are
 * omitted entirely rather than rendered as "Speed undefined".
 * @param {object} manifest @param {object} state @returns {string}
 */
function describeProject(manifest, state) {
  const parts = [];
  for (const p of manifest.params || []) {
    const v = state.params ? state.params[p.name] : undefined;
    if (v !== undefined) parts.push(`${p.label} ${v}`);
  }
  for (const slotDef of manifest.slots || []) {
    const slotState = state.slots ? state.slots[slotDef.name] : undefined;
    if (!slotState) continue;
    if (slotDef.grouped) {
      const groups = slotState.groups || {};
      const inner = Object.entries(groups).map(([g, ids]) => `${g}: ${(ids || []).length}`).join(', ');
      parts.push(`${slotDef.label} {${inner}}`);
    } else {
      const items = slotState.items || [];
      parts.push(`${slotDef.label}: ${items.length}`);
    }
  }
  for (const r of manifest.readouts || []) {
    const v = state.readouts ? state.readouts[r.name] : undefined;
    if (v !== undefined) parts.push(`${r.label}: ${v}`);
  }
  return parts.length ? `${manifest.title} — ${parts.join(' · ')}` : manifest.title;
}

/**
 * Kid-readable one-line label for an action card (e.g. an undo-history entry), resolving names
 * to manifest labels — an undeclared name falls back to the machine name itself so a label is
 * always produced. Total: never throws (mirrors server/tool-summary.js's try/catch → op-name
 * idiom) — a malformed action just degrades to its raw `op` string.
 * @param {object} action @param {object} manifest @returns {string}
 */
function actionLabel(action, manifest) {
  // Nullish guard BEFORE the try: the catch's own `action.op` fallback would re-throw on a nullish
  // action, escaping the try — the exact hole server/tool-summary.js guards the same way.
  if (!action || typeof action !== 'object' || typeof action.op !== 'string') return '';
  try {
    const paramLabel = (name) => { const d = (manifest.params || []).find((p) => p.name === name); return d ? d.label : name; };
    const slotLabel = (name) => { const d = (manifest.slots || []).find((sl) => sl.name === name); return d ? d.label : name; };
    const checkLabel = (name) => { const d = (manifest.checks || []).find((c) => c.name === name); return d ? d.label : name; };
    switch (action.op) {
      case 'setParam':
        return `Set ${paramLabel(action.name)} to ${action.value}`;
      case 'createGroup':
        return `New ${slotLabel(action.slot)} group: ${action.name}`;
      case 'addItems':
      case 'removeItems': {
        const verb = action.op === 'addItems' ? 'Add' : 'Remove';
        const n = action.ids.length; // throws if ids is missing → caught below, falls back to op
        if (action.group !== undefined) {
          const prep = action.op === 'addItems' ? 'to' : 'from';
          return `${verb} ${n} ${prep} ${action.group} (${slotLabel(action.slot)})`;
        }
        if (n === 1) return `${verb} "${action.ids[0]}" (${slotLabel(action.slot)})`;
        return `${verb} ${n} (${slotLabel(action.slot)})`;
      }
      case 'runCheck':
        // A group-taking check names its target — this label IS the consent card's text, and a
        // child cannot meaningfully approve "Run Make practice views" without knowing WHICH shelf
        // (two same-op cards in one turn are otherwise identical). By card time `group` has been
        // engine-validated against the sanitizer-screened live groups, and it renders via
        // textContent — safe to show.
        return action.group !== undefined
          ? `Run ${checkLabel(action.name)} — ${action.group}`
          : `Run ${checkLabel(action.name)}`;
      case 'undoLast':
        return 'Undo the last change';
      case 'rememberUser':
        return `Remember: ${action.note}`;
      default:
        return action.op;
    }
  } catch {
    return action.op;
  }
}

/**
 * Wraps ONE `project = {manifest, initialState(), checkHandlers}` as a stateful host: owns the
 * current state (closure, not exposed by reference), an undo stack, and subscriber callbacks.
 * This is the shared engine both the browser executor and any future host page use — a project
 * definition never manages its own state or undo history.
 * @param {{manifest:object, initialState:() => object, checkHandlers?:object}} project
 * @returns {{manifest:object, getState:() => object, apply:(action:object) => {ok:boolean,note:string}, subscribe:(fn:(state:object) => void) => void}}
 */
function createProjectHost(project) {
  let state = project.initialState();
  const stack = [];
  const subs = [];

  function notify() {
    // Subscribers get a CLONE, same as getState() — handing out the live `state` reference would
    // let a naive render callback mutate the host's guts past apply()'s undo bookkeeping.
    for (const fn of subs) fn(getState());
  }

  /** @returns {{ok:boolean,note:string}} never throws — a malformed action or throwing reducer degrades to ok:false. */
  function apply(action) {
    if (!action || typeof action !== 'object' || typeof action.op !== 'string') {
      return { ok: false, note: 'Not a valid action.' };
    }
    if (action.op === 'undoLast') {
      if (stack.length === 0) return { ok: false, note: 'Nothing to undo yet!' };
      state = stack.pop();
      notify();
      return { ok: true, note: describeProject(project.manifest, state) };
    }
    // Attempt FIRST, snapshot after success: pushing the snapshot before the attempt meant a
    // failing action at cap depth shifted away (lost) the oldest undo entry for nothing.
    let next;
    try {
      next = applyAction(state, action, project.manifest, project.checkHandlers);
    } catch (e) {
      return { ok: false, note: String(e.message) };
    }
    stack.push(JSON.parse(JSON.stringify(state)));
    if (stack.length > 20) stack.shift(); // cap history — this is a kid's undo button, not an audit log
    state = next;
    notify();
    return { ok: true, note: describeProject(project.manifest, state) };
  }

  function getState() {
    return JSON.parse(JSON.stringify(state)); // clone out — callers must not mutate the host's state
  }

  function subscribe(fn) {
    subs.push(fn);
  }

  return { manifest: project.manifest, getState, apply, subscribe };
}

// Browser global (classic <script>) — repo idiom so the same file loads in node:test AND the browser.
// Must come BEFORE the module.exports guard: a bare `module.exports = …` throws ReferenceError in a
// classic <script> (no `module` global there), which would abort the file before either export ran.
if (typeof window !== 'undefined') window.ProjectState = { applyAction, describeProject, actionLabel, createProjectHost };
if (typeof module !== 'undefined' && module.exports) module.exports = { applyAction, describeProject, actionLabel, createProjectHost };
