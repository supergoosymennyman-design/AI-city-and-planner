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
 * Every `{` that could begin a bare (UNFENCED) `{"action": …}` object. Only the opening brace is
 * matched here — where the object ENDS needs brace counting, not a regex (see `scanObjectEnd`).
 *
 * WHY THIS EXISTS (owner playtest, 2026-08-04 — a live leak in front of the child): the free model
 * answered "data augment my data bro" with a friendly paragraph and then, verbatim in the bubble,
 * `{"action": {"op":"runCheck","name":"toughenShelf"}}`. The fence regex above requires ```json, so
 * an unfenced object never matched, never got stripped, and rendered as a plain-text paragraph. This
 * module's header promises "the child never sees raw JSON" — that promise was only ever kept for
 * models that remember the fence, and the weak free models this fallback exists FOR are exactly the
 * ones that forget it.
 */
const BARE_ACTION_RE = /\{\s*"action"\s*:/g;

/**
 * Index just past the JSON object starting at `open` (which must be a `{`), or -1 if it never
 * closes. Counts brace depth while SKIPPING braces inside JSON strings — `{"ids":["if {wall} then
 * turn"]}` must not end at the brace inside the string value — and honours backslash escapes so a
 * `\"` inside a string doesn't look like the string's end.
 * @param {string} s @param {number} open index of the opening `{`
 * @returns {number} index one past the matching `}`, or -1
 */
function scanObjectEnd(s, open) {
  let depth = 0, inStr = false, esc = false;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i + 1;
  }
  return -1;   // unterminated — leave the text completely alone (never guess where it ended)
}

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
  let cleanedText = safeText.replace(JSON_FENCE_RE, '');

  // SECOND PASS — bare, unfenced `{"action": …}` objects (see BARE_ACTION_RE). Runs over the
  // fence-stripped text so a fenced block is never scanned twice. Same contract as the fence pass:
  // a candidate that parses is REMOVED whether or not it validates (invalid JSON is still JSON a
  // child must not read), and anything that does not parse cleanly is left exactly as the model
  // wrote it — prose containing braces ("your champion said {maybe}") must survive untouched, so
  // the bar for cutting text is a real, terminated, parseable object carrying an `action` key.
  const cuts = [];
  BARE_ACTION_RE.lastIndex = 0;
  let open;
  while ((open = BARE_ACTION_RE.exec(cleanedText))) {
    const end = scanObjectEnd(cleanedText, open.index);
    if (end === -1) continue;                       // unterminated — not ours to cut
    let parsed;
    try { parsed = JSON.parse(cleanedText.slice(open.index, end)); } catch { continue; }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
    const a = parsed.action;
    if (!a || typeof a !== 'object' || Array.isArray(a)) continue;   // `{"action":"hi"}` is prose, not an action
    cuts.push([open.index, end]);
    let result;
    try { result = validateAction(a); } catch { continue; }
    if (result && result.ok) actions.push(result.action);
    BARE_ACTION_RE.lastIndex = end;                 // resume AFTER this object, never inside it
  }
  BARE_ACTION_RE.lastIndex = 0;
  // Splice back-to-front so earlier indices stay valid. An object sitting ALONE on its own line
  // takes the whole line with it — otherwise removing it leaves a blank line the model never wrote,
  // turning "Sure!\n{...}\nAll set." into a stray paragraph break. Only whitespace may be absorbed:
  // an object with prose beside it ("Do this: {...} ok?") cuts just the object.
  for (let i = cuts.length - 1; i >= 0; i--) {
    let [start, end] = cuts[i];
    const lineStart = cleanedText.lastIndexOf('\n', start - 1) + 1;   // 0 when on the first line
    if (!cleanedText.slice(lineStart, start).trim()) start = lineStart;
    let lineEnd = cleanedText.indexOf('\n', end);
    if (lineEnd === -1) lineEnd = cleanedText.length;
    if (!cleanedText.slice(end, lineEnd).trim()) end = Math.min(lineEnd + 1, cleanedText.length);
    cleanedText = cleanedText.slice(0, start) + cleanedText.slice(end);
  }
  return { actions, cleanedText: cleanedText.trim() };
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
