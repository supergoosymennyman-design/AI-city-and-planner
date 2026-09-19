// web/coding agent/server/action-safety.js
/**
 * Pure content-safety screen for ONE buddy-proposed action. Mirrors `static-path.js` /
 * `route-static.js`'s split: the gateway (trust boundary) still calls the real kid-safety
 * `screen()` from `filter.js`, but the DECISION of which fields on which action shapes are
 * screened — and which are deliberately left alone — lives here as a pure, unit-testable
 * function that never touches the network or the real filter.
 *
 * Screens ONLY the action's user-facing STRING fields, i.e. the ones that get rendered verbatim
 * onto the child's [Do it] card:
 *   - `createGroup.name`
 *   - `addItems`/`removeItems`: `group` (when present — grouped slots only) and EVERY string in
 *     `ids` (ids are now child-visible prose on a FLAT slot's card/label — e.g. a rule the child
 *     typed — not the opaque sample identifiers the classifier-era `ids` were; a single flagged id
 *     pushes the field `'ids'` once, however many ids in the array are actually flagged).
 *   - `rememberUser.note`
 * Deliberately NEVER screens:
 *   - `setParam.name` / `runCheck.name` — manifest-whitelisted MACHINE names (already validated
 *     structurally against the manifest by `logic/action-schema.js`'s `validateAction`), never
 *     free-form model/child prose.
 *   - `value` (`setParam`) — a number, not a string; nothing for `screen()` to see.
 *   - `undoLast` — carries no user-facing string fields at all.
 * A flagged field is dropped by the CALLER (gateway.js), not here — this module only reports
 * which fields (if any) failed, matching the shape of `logic/action-schema.js`'s `validateAction`.
 */

/**
 * Screen one buddy-proposed action's user-facing string field(s) through the injected `screen`.
 * @param {{op:string, name?:string, slot?:string, group?:string, ids?:string[], value?:number, note?:string}} action - a
 *   `{op, ...}` action as returned by `extractActions` (already `validateAction`-clean).
 * @param {(text:string) => {ok:true}|{ok:false,reason:string,deflection:string}} screen - the
 *   kid-safety filter to run each candidate string through (injected so this unit is testable
 *   without importing the real `filter.js`; the gateway passes the real `screen`).
 * @returns {{ok:true}|{ok:false, fields:string[]}} `ok:false` names every offending field.
 */
export function screenAction(action, screen) {
  const fields = [];
  const op = action?.op;
  if (op === 'createGroup' && typeof action.name === 'string' && !screen(action.name).ok) {
    fields.push('name');
  }
  if (op === 'addItems' || op === 'removeItems') {
    if (typeof action.group === 'string' && !screen(action.group).ok) {
      fields.push('group');
    }
    if (Array.isArray(action.ids) && action.ids.some((id) => typeof id === 'string' && !screen(id).ok)) {
      fields.push('ids'); // pushed ONCE regardless of how many ids in the array are flagged
    }
  }
  if (op === 'rememberUser' && typeof action.note === 'string' && !screen(action.note).ok) {
    fields.push('note');
  }
  return fields.length ? { ok: false, fields } : { ok: true };
}
