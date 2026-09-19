// web/coding agent/logic/stream-frames.js
'use strict';
/**
 * Shared NDJSON frame codec for the streaming buddy turn — one JSON object per '\n'-terminated line.
 * Lives in logic/ because BOTH the gateway (encode) and the browser client (decode) use it (repo
 * idiom: commonjs module.exports + a window global, loaded as a classic <script> in index.html).
 */
/** @param {object} frame @returns {string} the frame as a single newline-terminated JSON line. */
function encodeFrame(frame) { return JSON.stringify(frame) + '\n'; }

/**
 * A stateful decoder that turns a stream of arbitrary string chunks into whole frames, buffering a
 * partial trailing line across chunk boundaries. A line that fails to parse is skipped (never
 * throws) — a corrupt frame must not kill the child's whole reply stream.
 * @returns {{push:(chunk:string)=>object[], flush:()=>object[]}}
 */
function createFrameDecoder() {
  let buf = '';
  const drain = (finalLine) => {
    const out = [];
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
      if (line.trim()) { try { out.push(JSON.parse(line)); } catch { /* skip malformed */ } }
    }
    if (finalLine && buf.trim()) { try { out.push(JSON.parse(buf)); } catch { /* skip */ } buf = ''; }
    return out;
  };
  return { push(chunk) { buf += chunk; return drain(false); }, flush() { return drain(true); } };
}

// NOTE: uniquely named, NOT a bare `const api` — index.html loads every logic/*.js as a classic
// <script>, so these files SHARE ONE GLOBAL SCOPE and two modules declaring `const api` is a
// SyntaxError that silently kills the second script in the browser (node --test still passes,
// since each file gets its own module scope). Keep this name module-specific.
const streamFramesApi = { encodeFrame, createFrameDecoder };
if (typeof module !== 'undefined' && module.exports) module.exports = streamFramesApi;
if (typeof window !== 'undefined') window.StreamFrames = streamFramesApi;
