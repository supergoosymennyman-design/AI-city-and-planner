// web/coding agent/server/tool-summary.js
/**
 * Kid-readable one-liner for an agent tool call — shown in the client as the agent-style
 * `● op(summary) — waiting for your OK` line. Input is an ALREADY-validated action
 * (logic/action-schema.js) plus the current project's manifest, used to resolve machine names
 * (`speed`, `photos`) to their kid-facing labels (`Speed`, `Photos`) the same way
 * `logic/project-state.js`'s `actionLabel` resolves them for the undo-history card — but stays
 * total anyway: a malformed action, or a name/slot/check absent from the manifest, degrades
 * gracefully (machine name, or ultimately the bare op name) rather than a throw — this runs inside
 * the streaming hot path. The caller screens the result before it reaches the wire (group names /
 * notes are model- or child-originated text).
 * @param {object|null|undefined} a
 * @param {object} [manifest] - the current project's manifest; a missing/garbage manifest degrades
 *   every label to its machine name (see `labelOf`) rather than throwing.
 * @returns {string}
 */
export function toolSummary(a, manifest) {
  if (!a || typeof a !== 'object' || typeof a.op !== 'string') return '';
  const m = manifest && typeof manifest === 'object' ? manifest : {};
  const labelOf = (list, name) => {
    const found = Array.isArray(list) ? list.find((e) => e && e.name === name) : undefined;
    return found ? found.label : name;
  };
  try {
    switch (a.op) {
      case 'setParam':
        return `Set ${labelOf(m.params, a.name)} to ${a.value}`;
      case 'createGroup':
        return `New ${labelOf(m.slots, a.slot)} group: ${a.name}`;
      case 'addItems':
      case 'removeItems': {
        const verb = a.op === 'addItems' ? 'Add' : 'Remove';
        const slotDef = Array.isArray(m.slots) ? m.slots.find((s) => s && s.name === a.slot) : undefined;
        // Grouped-ness prefers the manifest's own declaration (the structural source of truth); a
        // slot absent from the manifest (shouldn't happen for an already-validated action, but this
        // module stays defensive) falls back to reading the action's own shape.
        const grouped = slotDef ? !!slotDef.grouped : a.group !== undefined;
        const slotLabel = slotDef ? slotDef.label : a.slot;
        const n = a.ids.length; // throws if ids is missing/not an array → caught below, falls back to op
        if (grouped) {
          const prep = a.op === 'addItems' ? 'to' : 'from';
          return `${verb} ${n} ${prep} ${a.group} (${slotLabel})`;
        }
        if (n === 1) return `${verb} "${a.ids[0]}" (${slotLabel})`;
        return `${verb} ${n} (${slotLabel})`;
      }
      case 'runCheck':
        return `Run ${labelOf(m.checks, a.name)}`;
      case 'undoLast':
        return 'Undo the last change';
      case 'rememberUser':
        // UNCHANGED format (not the manifest-labeled style above): the client's remember-card copy
        // relies on the note being present in exactly this shape — see `client/buddy.js`'s own
        // separate `Remember: ${a.note}` card-label rendering, which this summary line feeds
        // alongside (agent-console log line, not the card itself).
        return `rememberUser: ${a.note}`;
      default:
        return a.op;
    }
  } catch { return a.op; }
}
