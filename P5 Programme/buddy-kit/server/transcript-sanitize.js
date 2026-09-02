/**
 * Validates + screens the client-carried conversation transcript (spec §5). Sibling of
 * manifest-sanitize.js: the transcript is an unauthenticated request-body field that rides straight
 * into the model's context, so it gets the same treatment as notes/persona — re-screened on entry,
 * every time, even though every entry was screened when it was first produced (a forged body never
 * saw that first screening).
 *
 * Two distinct failure modes, deliberately not merged:
 *  - MALFORMED (wrong shape/size) → `{ok:false}` → the route 400s, loudly. Truncating or coercing
 *    would silently rewrite the child's conversation; failing loud is the honest option.
 *  - FLAGGED content in a well-formed entry → that entry AND its adjacent pair partner are dropped
 *    (a kept answer to a dropped question — or vice versa — is an incoherent orphan), and the turn
 *    proceeds. Content flags are expected traffic (the filter is conservative); they must not brick
 *    a whole conversation.
 */

export const MAX_TRANSCRIPT_ENTRIES = 240;
export const MAX_ENTRY_CHARS = 16384;
const ROLES = new Set(['user', 'assistant']);

/**
 * @param {*} raw - the request body's `transcript` field, completely untrusted.
 * @param {(t: string) => {ok: boolean}} screen - the kid-safety filter (filter.js's `screen`).
 * @returns {{ok: true, transcript: Array<{role: 'user'|'assistant', content: string}>, dropped: number}
 *          |{ok: false, error: string}} `dropped` counts screen-dropped entries (for logging);
 *          `transcript` entries carry ONLY role+content — any extra fields a forged body smuggled
 *          alongside them are stripped here, before anything downstream can read them.
 */
export function sanitizeTranscript(raw, screen) {
  if (raw === undefined || raw === null) return { ok: true, transcript: [], dropped: 0 };
  if (!Array.isArray(raw)) return { ok: false, error: 'transcript must be an array' };
  if (raw.length > MAX_TRANSCRIPT_ENTRIES) return { ok: false, error: `transcript exceeds ${MAX_TRANSCRIPT_ENTRIES} entries` };
  for (const e of raw) {
    if (!e || typeof e !== 'object' || Array.isArray(e)) return { ok: false, error: 'transcript entry must be an object' };
    if (!ROLES.has(e.role)) return { ok: false, error: 'transcript role must be "user" or "assistant"' };
    if (typeof e.content !== 'string' || e.content.length === 0 || e.content.length > MAX_ENTRY_CHARS) {
      return { ok: false, error: `transcript content must be a string of 1..${MAX_ENTRY_CHARS} chars` };
    }
  }
  const drop = new Set();
  raw.forEach((e, i) => {
    if (screen(e.content).ok) return;
    drop.add(i);
    // Pair semantics: a user question owns the assistant reply right after it; an assistant reply
    // owns the user question right before it. Set-based so adjacent flags can't double-count.
    if (e.role === 'user' && raw[i + 1] && raw[i + 1].role === 'assistant') drop.add(i + 1);
    if (e.role === 'assistant' && raw[i - 1] && raw[i - 1].role === 'user') drop.add(i - 1);
  });
  const transcript = raw.filter((_, i) => !drop.has(i)).map((e) => ({ role: e.role, content: e.content }));
  return { ok: true, transcript, dropped: drop.size };
}
