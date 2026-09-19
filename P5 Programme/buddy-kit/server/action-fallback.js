// web/coding agent/server/action-fallback.js
/**
 * JSON-action fallback — insurance so the buddy's [Do it] action cards still fire on models with
 * weak tool-calling (the free model has measured 0/16 real tool-calls across past sessions —
 * see `.superpowers/sdd/task-6-brief.md`). `server/memory/Setting.md` now instructs the model to
 * ALSO emit one fenced ```json block shaped `{"action":{"op":...}}` whenever it proposes a champion
 * change, in addition to (not instead of — see engine.js's real tool path) attempting a real tool
 * call. This module scans the model's FINAL, fully-accumulated reply text for such blocks, validates
 * each one through the SAME `validateAction` the real tool-call path uses (`logic/action-schema.js`,
 * injected here — this file never imports it directly so it stays a plain, dependency-free unit),
 * and strips every matched fence out of the reply so the child never sees raw JSON: `kid-markdown.js`
 * already drops bare ``` fence *lines* when rendering, but the JSON *payload* inside the fence would
 * otherwise still render as an ugly plain-text paragraph.
 *
 * Pure + total: runs on ARBITRARY model text — an unterminated fence, malformed JSON inside an
 * otherwise-well-formed fence, a fence with no `action` key, several/nested-looking fences, or a huge
 * block — and must never throw or return partial garbage. Every failure mode below is a silent skip,
 * exactly mirroring the real tool path's own contract (engine.js's `buildTools`: an action that fails
 * `validateAction` is dropped, never surfaced to the child or the caller).
 */

// A fenced code block opening with ```json (case-insensitive tag, optional trailing spaces/tabs,
// then a newline) and closing with a bare ```. Non-greedy body (`[\s\S]*?`) so N separate blocks in
// one reply are matched as N distinct blocks rather than the first opening fence swallowing
// everything up to the LAST closing fence. An unterminated fence (no closing ```) simply never
// matches — left untouched in `cleanedText`, not thrown on.
const JSON_FENCE_RE = /```json[ \t]*\r?\n([\s\S]*?)```/gi;

/**
 * Scans `text` for fenced ```json blocks carrying an `action` key, validates each candidate action,
 * and returns the valid ones alongside the text with EVERY matched fence removed (valid or not —
 * a block that parses but fails validation, or parses with no `action` key, is still model-authored
 * JSON a 10-year-old should never see verbatim; only a block that isn't even fence-shaped, e.g. an
 * unterminated ```json with no closing fence, survives into `cleanedText` untouched).
 * @param {string} text - the model's full reply text (already fully streamed/accumulated — this is
 *   never called on a mid-stream partial delta, only the finalize-time whole string).
 * @param {(action:object) => {ok:true,action:object}|{ok:false,error:string}} validateAction - the
 *   SAME validator the real tool-call path uses (`logic/action-schema.js`), injected so this module
 *   has zero import surface and stays trivially unit-testable.
 * @returns {{actions:object[], cleanedText:string}}
 */
export function extractJsonActions(text, validateAction) {
  const safeText = typeof text === 'string' ? text : '';
  if (!safeText) return { actions: [], cleanedText: safeText };

  const actions = [];
  JSON_FENCE_RE.lastIndex = 0; // defensive — a shared module-level global regex must not carry state across calls
  let match;
  while ((match = JSON_FENCE_RE.exec(safeText))) {
    let parsed;
    try { parsed = JSON.parse(match[1]); } catch { continue; } // malformed JSON body — drop silently
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !('action' in parsed)) continue;
    let result;
    try { result = validateAction(parsed.action); } catch { continue; } // never trust an injected fn
    if (result && result.ok) actions.push(result.action);
    // else: parsed fine but failed validateAction (unknown op / bad shape) — action dropped, but the
    // fence is STILL removed below (the `.replace` pass runs over the whole regex, independent of
    // whether a given match produced a valid action).
  }
  JSON_FENCE_RE.lastIndex = 0;
  const cleanedText = safeText.replace(JSON_FENCE_RE, '').trim();
  return { actions, cleanedText };
}

/**
 * Stable, key-order-independent equality key for one action object, so a fallback action built from
 * `JSON.parse` (whatever key order the model happened to write) compares equal to a structurally
 * identical action a real tool call produced (`{op, ...input}` spread order in engine.js).
 * @param {*} v
 * @returns {*} `v` with every plain-object's keys sorted, recursively (arrays keep their order).
 */
function sortKeysDeep(v) {
  if (Array.isArray(v)) return v.map(sortKeysDeep);
  if (v && typeof v === 'object') {
    return Object.keys(v).sort().reduce((acc, k) => { acc[k] = sortKeysDeep(v[k]); return acc; }, {});
  }
  return v;
}

/**
 * Filters `candidates` down to the ones that are NOT deep-equal to any action already present in
 * `existing` (and drops duplicates within `candidates` itself) — used by the gateway to merge
 * `proposedActions` (the real tool-call path) with this module's fallback actions into one
 * deduplicated `[Do it]` card list.
 * @param {object[]} existing - actions already on the list (e.g. the engine's real tool-call proposals).
 * @param {object[]} candidates - additional actions to merge in (e.g. this module's fallback actions).
 * @returns {object[]} the subset of `candidates` not already represented in `existing`.
 */
export function dedupeAgainst(existing, candidates) {
  const seen = new Set((existing || []).map((a) => JSON.stringify(sortKeysDeep(a))));
  const out = [];
  for (const a of candidates || []) {
    const key = JSON.stringify(sortKeysDeep(a));
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}
