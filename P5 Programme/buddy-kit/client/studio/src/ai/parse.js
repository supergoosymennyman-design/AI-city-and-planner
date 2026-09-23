/**
 * AI reply parser — pull the model's fenced JSON block out of a chat reply and
 * turn it into a validated result.
 *
 * This module is PURE ESM: no DOM, no network, no `three`. It loads in plain
 * Node so the hand-rolled test harness can exercise it directly. The ONLY
 * sibling it touches is `./schema.js`, whose `validateObjects` is the arbiter of
 * whether a parsed block is the real answer.
 *
 * The regex extractor is deliberately hand-written (no markdown dependency):
 * models wrap their JSON in ``` fences, and the exact fence grammar is small
 * enough to state once, here.
 */

import { validateObjects } from './schema.js';

/**
 * The one fence grammar this module understands: an opening run of backticks,
 * an optional language tag, a newline, then a LAZY body up to the next closing
 * run of backticks. Global so `matchAll` can enumerate every block.
 *
 * The lazy body (`[\s\S]*?`) is important: given several fences it stops at the
 * next closing fence instead of swallowing them all.
 *
 * @type {RegExp}
 */
const FENCE_RE = /```[ \t]*([A-Za-z0-9_-]*)[ \t]*\r?\n([\s\S]*?)```/g;

/**
 * The same opener, but anchored to the end of the text instead of a closing
 * fence. Used to recover an UNTERMINATED final fence (a stream that got cut off
 * mid-block). Anchored because an unterminated fence, by definition, runs to the
 * end of the reply; we only ever apply it to the tail after the last complete
 * fence, so an earlier opener cannot shadow a later complete one.
 *
 * @type {RegExp}
 */
const UNTERMINATED_OPENER_RE = /```[ \t]*([A-Za-z0-9_-]*)[ \t]*\r?\n([\s\S]*)$/;

/**
 * Remove every fenced block from a reply, including an unterminated final one.
 *
 * A complete fence is removed together with the single newline that follows it
 * (when present). That is what keeps "prose\n\n```json … ```\nDone!" from
 * leaving a stranded blank line behind — the surrounding paragraph break
 * survives, the fence's own trailing line break does not. The unterminated case
 * is removed from its opener to the end of the reply.
 *
 * @param {string} text - The raw reply.
 * @returns {string} The reply with all fences gone, trimmed.
 */
function stripFences(text) {
  // `String.replace` with a global regex always restarts at index 0, so reusing
  // the shared instance is safe here.
  const withoutComplete = text.replace(
    /```[ \t]*[A-Za-z0-9_-]*[ \t]*\r?\n[\s\S]*?```[ \t]*\r?\n?/g,
    '',
  );
  const open = UNTERMINATED_OPENER_RE.exec(withoutComplete);
  return (open ? withoutComplete.slice(0, open.index) : withoutComplete).trim();
}

/**
 * Extract every fenced code block from a reply, in document order.
 *
 * Handles the tags that matter in practice: a tagged fence (```json), a bare
 * fence (``` with no tag → `lang` is the empty string), CRLF or LF line endings,
 * and arbitrary prose before/between/after the fences. An UNTERMINATED final
 * fence is tolerated: its remainder becomes the block body, because a truncated
 * reply should be diagnosable rather than silently ignored.
 *
 * @param {string} text - The raw reply (non-strings yield an empty array).
 * @returns {Array<{lang: string, body: string}>} One entry per fence, in order.
 */
export function extractFencedBlocks(text) {
  const blocks = [];
  if (typeof text !== 'string' || text.length === 0) return blocks;

  // `String.prototype.matchAll` internally clones the regex, so the shared
  // global FENCE_RE's `lastIndex` is never mutated — the classic /g `exec` bug
  // cannot happen here.
  let lastEnd = 0;
  for (const match of text.matchAll(FENCE_RE)) {
    blocks.push({ lang: match[1] || '', body: match[2] });
    lastEnd = match.index + match[0].length;
  }

  // Recover a trailing fence that never closed (anywhere in the tail). The block
  // is flagged `unterminated` so callers can tell a truncated reply (token cap
  // mid-fence) apart from a genuinely malformed one and advise a shorter result.
  const tail = text.slice(lastEnd);
  const open = UNTERMINATED_OPENER_RE.exec(tail);
  if (open) blocks.push({ lang: open[1] || '', body: open[2], unterminated: true });

  return blocks;
}

/**
 * JSON.parse a block body, returning a tagged outcome instead of throwing.
 *
 * @param {string} body - The raw fenced block body.
 * @returns {{ok: true, value: *} | {ok: false}} Parse outcome.
 */
function tryParseJson(body) {
  try {
    return { ok: true, value: JSON.parse(body) };
  } catch {
    return { ok: false };
  }
}

/** Longest excerpt of a bad block quoted back in an error message. */
const SNIPPET_LEN = 120;

/** Appended when the failing block came from an UNTERMINATED (truncated) fence. */
const TRUNCATION_ADVICE =
  ' The reply looks incomplete — it was cut off before the end. Ask for a shorter result and try again.';

/**
 * One failed attempt at a block, as a descriptive error string. Kept in the
 * exact phrasing `explainParseFailure` recognises.
 *
 * @param {{lang: string, body: string, unterminated?: boolean}} block - The block that failed.
 * @param {boolean} parsed - Whether it got past `JSON.parse` (shapes were bad).
 * @param {string[]} [shapeErrors] - Validator errors when `parsed` is true.
 * @returns {string} Human-readable error entry.
 */
function describeBlockFailure(block, parsed, shapeErrors) {
  const advice = block && block.unterminated ? TRUNCATION_ADVICE : '';
  if (parsed) {
    const joined = shapeErrors && shapeErrors.length ? shapeErrors.join('; ') : 'unknown validation error';
    return `The JSON parsed but the shapes were invalid: ${joined}${advice}`;
  }
  return `Found a code block but it was not valid JSON: ${block.body.slice(0, SNIPPET_LEN)}${advice}`;
}

/**
 * The HARD errors of a `validateObjects` result.
 *
 * A repairable reply (a clamped scale, a substituted non-finite coordinate) is
 * USABLE — only hard errors (bad shape, `custom`/`geo`, unknown kind) reject it.
 * Falls back to `errors` when an older validator result has no `hardErrors`, so
 * this stays correct against either shape.
 *
 * @param {*} validated - A `validateObjects` result.
 * @returns {string[]} hard error messages (empty when the reply is usable).
 */
function hardErrorsOf(validated) {
  if (validated && Array.isArray(validated.hardErrors)) return validated.hardErrors;
  return validated && Array.isArray(validated.errors) ? validated.errors : [];
}

/**
 * The non-fatal numeric REPAIRS of a `validateObjects` result (safe default `[]`).
 *
 * @param {*} validated - A `validateObjects` result.
 * @returns {string[]} repair messages (e.g. "objects[1]: s[0] must be > 0").
 */
function repairsOf(validated) {
  return validated && Array.isArray(validated.repairs) ? validated.repairs : [];
}

/**
 * Try to turn one fenced block into a validated reply.
 *
 * Accepts when the validated reply has NO HARD errors: a reply that only needed
 * numeric repairs is returned with its `repairs` list attached (surfaced
 * non-fatally by the caller) instead of being discarded.
 *
 * @param {{lang: string, body: string}} block - Candidate block.
 * @returns {{ok: true, value: *, repairs: string[]} | {ok: false, error: string}} Outcome.
 */
function tryBlock(block) {
  const parsed = tryParseJson(block.body);
  if (!parsed.ok) return { ok: false, error: describeBlockFailure(block, false) };

  const validated = validateObjects(parsed.value);
  if (hardErrorsOf(validated).length > 0) {
    return { ok: false, error: describeBlockFailure(block, true, validated.errors) };
  }
  return { ok: true, value: parsed.value, repairs: repairsOf(validated) };
}

/**
 * Parse a model reply into prose + a validated JSON payload.
 *
 * Selection order is the whole point of this function, and it is exact:
 *   1. `lang === 'json'` blocks, in order — first body that `JSON.parse`s AND
 *      passes `validateObjects` wins (`source: 'fence-json'`).
 *   2. otherwise the remaining blocks regardless of language, same test
 *      (`source: 'fence-any'`).
 *   3. otherwise `JSON.parse` of the whole trimmed reply (`source: 'raw-json'`).
 *   4. otherwise `json: null`, with one descriptive `errors` entry per attempt.
 *
 * WHY this order matters: models frequently print an *example* block before the
 * real answer (a shape in the wrong kind, a doc snippet, a copy of the input).
 * "First block that actually validates" therefore beats both "first block" and
 * "last block" — it is robust to a bad example on either side. Pass 1 prefers an
 * explicitly `json`-tagged block so a later doc/snippet block (e.g. ```js) can
 * never be mistaken for the answer while a valid JSON block exists.
 *
 * Never throws: malformed JSON, a truncated reply, or a non-string input all
 * return a well-formed result with `json: null`.
 *
 * @param {string} text - The raw assistant message.
 * @returns {{prose: string, code: string, json: * | null, errors: string[], repairs: string[], source: 'fence-json'|'fence-any'|'raw-json'|null, truncated: boolean}}
 *   `prose` is the reply with fences stripped; `code` is the exact text the
 *   payload came from (the winning block body, or the trimmed reply for
 *   `raw-json`); `json` is the parsed-but-unvalidated reply; `errors` holds one
 *   entry per failed attempt; `repairs` lists non-fatal numeric fixes applied to
 *   an accepted reply (empty on a clean success or a failure); `truncated` is
 *   true when the reply ended inside an unterminated fence (a token cap cut the
 *   model off mid-block), including when the recovered tail happened to be valid.
 */
export function parseAIResponse(text) {
  const reply = typeof text === 'string' ? text : '';
  const errors = [];
  const blocks = extractFencedBlocks(reply);
  const prose = stripFences(reply);
  const truncated = blocks.some((block) => block.unterminated === true);

  // Pass 1: explicitly json-tagged blocks, in document order.
  for (const block of blocks) {
    if (block.lang.toLowerCase() !== 'json') continue;
    const attempt = tryBlock(block);
    if (attempt.ok) {
      return {
        prose,
        code: block.body,
        json: attempt.value,
        errors,
        repairs: attempt.repairs || [],
        source: 'fence-json',
        truncated,
      };
    }
    errors.push(attempt.error);
  }

  // Pass 2: every remaining block, whatever its (or its missing) language tag.
  for (const block of blocks) {
    if (block.lang.toLowerCase() === 'json') continue;
    const attempt = tryBlock(block);
    if (attempt.ok) {
      return {
        prose,
        code: block.body,
        json: attempt.value,
        errors,
        repairs: attempt.repairs || [],
        source: 'fence-any',
        truncated,
      };
    }
    errors.push(attempt.error);
  }

  // Pass 3: the reply IS the JSON (no fence at all).
  const trimmed = reply.trim();
  const raw = tryParseJson(trimmed);
  if (raw.ok) {
    const validated = validateObjects(raw.value);
    if (hardErrorsOf(validated).length === 0) {
      return {
        prose,
        code: trimmed,
        json: raw.value,
        errors,
        repairs: repairsOf(validated),
        source: 'raw-json',
        truncated,
      };
    }
    errors.push(
      `The JSON parsed but the shapes were invalid: ${
        validated.errors.length ? validated.errors.join('; ') : 'unknown validation error'
      }`,
    );
  } else {
    errors.push(
      blocks.length === 0
        ? 'The reply contained no JSON code block.'
        : 'The whole reply was not valid JSON either.',
    );
  }

  return { prose, code: '', json: null, errors, repairs: [], source: null, truncated };
}

/**
 * Turn a failed `parseAIResponse` result into one short, child-appropriate line
 * for the chat log. Returns an empty string when the result actually succeeded,
 * so callers can use it as a "should I show an error?" test.
 *
 * @param {ReturnType<typeof parseAIResponse>} result - The parse result.
 * @returns {string} A human-readable explanation, or `''` on success.
 */
export function explainParseFailure(result) {
  if (!result || result.json) return '';

  const errors = Array.isArray(result.errors) ? result.errors : [];

  // Prefer the most actionable failure: a block that parsed as JSON but whose
  // shapes were wrong tells the user exactly what to fix.
  const shapeError = errors.find((e) =>
    e.startsWith('The JSON parsed but the shapes were invalid'),
  );
  if (shapeError) {
    if (shapeError.includes('non-empty array')) {
      return 'The reply did not include any shapes, so there is nothing to preview. Ask again and describe the shapes you want.';
    }
    return shapeError;
  }

  const jsonError = errors.find((e) =>
    e.startsWith('Found a code block but it was not valid JSON'),
  );
  if (jsonError) return jsonError;

  return 'The reply contained no JSON code block.';
}
