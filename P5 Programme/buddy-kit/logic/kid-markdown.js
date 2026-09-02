// web/coding agent/logic/kid-markdown.js
'use strict';
/**
 * A pure, streaming-safe markdown-ish parser for the buddy's chat replies. Turns raw model text
 * into a plain data structure (Block[]) — NEVER an HTML string — so the client can build real DOM
 * nodes with createElement/textContent and stay XSS-proof by construction (model output must never
 * touch innerHTML/insertAdjacentHTML; see AGENTS.md + the task-9 spec's hard safety constraint).
 *
 * Block = { type:'p',  spans:Span[] }
 *       | { type:'h',  spans:Span[] }            // any #/##/### heading — one visual style
 *       | { type:'ul', items:Span[][] }          // "- x" / "* x" bullets
 *       | { type:'ol', items:Span[][] }          // "1. x" numbered
 * Span  = { text:string, bold?:true, code?:true }
 *
 * Called on the FULL accumulated reply after every streamed token (see client/buddy.js `paint`), so
 * it must be robust on partial/truncated markdown mid-stream: never throw, and never let a dangling
 * `**`/`` ` ``/`*`/`_` marker show up literally in a span's text (an unterminated marker is treated
 * as plain text with the marker stripped, not as literal punctuation).
 */

// Matches, in priority order (first alternative that matches at a given start index wins — see
// tokenizeSpans below): inline code, **bold**, __bold__, [label](url), *italic*, _italic_. A
// partial/unterminated marker (e.g. an odd number of `**`) simply fails every alternative and falls
// through as plain text, which stripMarkers() then cleans of stray marker characters.
const INLINE_RE = /`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|\[([^\]]*)\]\(([^)]*)\)|\*([^*]+)\*|_([^_]+)_/g;

// A line that is ONLY '-', '*' or '_' repeated 3+ times — a markdown horizontal rule. Must be
// checked BEFORE the bullet regex, or "---" parses as an (empty) bullet item.
const HR_RE = /^(-{3,}|\*{3,}|_{3,})$/;
const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const BULLET_RE = /^[-*]\s+(.*)$/;
const ORDERED_RE = /^\d+\.\s+(.*)$/;
const FENCE_RE = /^```/;

/**
 * Strips any marker characters that survived inline tokenizing WITHOUT forming a complete pair —
 * i.e. an unterminated `**bold`, a lone trailing backtick, etc. Deliberate design choice (see
 * task-9 report): this also strips single stray `*`/`_` that are never part of a valid pair, which
 * is the same rule the spec asks for ("unterminated marker → plain text, marker removed") applied
 * uniformly, at the small cost of also eating a truly-literal lone underscore/asterisk in prose —
 * an acceptable trade for a young child's chat bubble never showing raw markdown punctuation.
 * @param {string} raw
 * @returns {string}
 */
function stripMarkers(raw) {
  return raw.replace(/\*\*/g, '').replace(/__/g, '').replace(/`/g, '').replace(/\*/g, '').replace(/_/g, '');
}

/**
 * Parses ONE line's worth of already-unwrapped text (heading hashes / bullet markers already
 * stripped by the caller) into inline spans: bold, code, and plain (links keep only their label;
 * single-asterisk/underscore italics are unwrapped to plain since there is no italic style here).
 * @param {string} line
 * @returns {Array<{text:string, bold?:true, code?:true}>}
 */
function tokenizeSpans(line) {
  const spans = [];
  const pushPlain = (raw) => { const cleaned = stripMarkers(raw); if (cleaned) spans.push({ text: cleaned }); };
  INLINE_RE.lastIndex = 0;
  let last = 0, m;
  while ((m = INLINE_RE.exec(line))) {
    if (m.index > last) pushPlain(line.slice(last, m.index));
    if (m[1] !== undefined) spans.push({ text: m[1], code: true });       // `code`
    else if (m[2] !== undefined) spans.push({ text: m[2], bold: true });  // **bold**
    else if (m[3] !== undefined) spans.push({ text: m[3], bold: true });  // __bold__
    else if (m[4] !== undefined) spans.push({ text: m[4] });              // [label](url) — url (m[5]) dropped
    else if (m[6] !== undefined) spans.push({ text: m[6] });              // *italic* → plain
    else if (m[7] !== undefined) spans.push({ text: m[7] });              // _italic_ → plain
    last = INLINE_RE.lastIndex;
  }
  if (last < line.length) pushPlain(line.slice(last));
  return spans;
}

/**
 * Parses raw buddy reply text into a flat list of render-ready Blocks. Pure and total: any string
 * input (including '', undefined-ish, or badly-truncated mid-stream markdown) returns a valid
 * (possibly empty) array and never throws — required because this runs after every streamed token.
 * @param {string} raw
 * @returns {Array<object>} Block[] — see file header for the shape.
 */
function toBlocks(raw) {
  const text = typeof raw === 'string' ? raw : '';
  const lines = text.split('\n');
  const blocks = [];
  let current = null; // { type:'p', lines:string[] } | { type:'ul'|'ol', items:string[] }
  let inFence = false;

  const flush = () => {
    if (!current) return;
    if (current.type === 'p') {
      const spans = tokenizeSpans(current.lines.join(' '));
      if (spans.length) blocks.push({ type: 'p', spans });
    } else {
      blocks.push({ type: current.type, items: current.items.map(tokenizeSpans) });
    }
    current = null;
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (FENCE_RE.test(trimmed)) { flush(); inFence = !inFence; continue; } // ``` fence marker — dropped, never rendered

    if (inFence) {
      // Fenced CONTENT is dropped entirely, not rendered as plain text. Fences in buddy replies are
      // the machine channel (the persona instructs the model to put `{"action":…}` JSON in a ```json
      // block, and forbids fences for child-visible prose), and this parser repaints the ACCUMULATED
      // text after every streamed token — before the server-side strip in finalize can run — so
      // rendering in-fence lines would type raw JSON into the child's bubble mid-stream and then
      // vanish it on the final frame. Once an opening fence appears, everything after it stays
      // hidden until the fence closes (or the stream ends), streaming-safe by construction.
      continue;
    }

    if (trimmed === '') { flush(); continue; }
    if (HR_RE.test(trimmed)) { flush(); continue; } // horizontal rule — dropped entirely; MUST run before BULLET_RE

    const heading = HEADING_RE.exec(trimmed);
    if (heading) { flush(); blocks.push({ type: 'h', spans: tokenizeSpans(heading[2]) }); continue; }

    const bullet = BULLET_RE.exec(trimmed);
    if (bullet) {
      if (!current || current.type !== 'ul') { flush(); current = { type: 'ul', items: [] }; }
      current.items.push(bullet[1]);
      continue;
    }

    const ordered = ORDERED_RE.exec(trimmed);
    if (ordered) {
      if (!current || current.type !== 'ol') { flush(); current = { type: 'ol', items: [] }; }
      current.items.push(ordered[1]);
      continue;
    }

    if (!current || current.type !== 'p') { flush(); current = { type: 'p', lines: [] }; }
    current.lines.push(trimmed);
  }
  flush();
  return blocks;
}

// NOTE: uniquely named, NOT a bare `const api`. index.html loads every logic/*.js as a classic
// <script>, so these files SHARE ONE GLOBAL SCOPE — two modules each declaring `const api` is a
// SyntaxError ("Identifier 'api' has already been declared") that kills the second script silently
// in the browser while `node --test` (separate module scope per file) still passes. Keep this name
// module-specific.
const kidMarkdownApi = { toBlocks };
if (typeof module !== 'undefined' && module.exports) module.exports = kidMarkdownApi;
if (typeof window !== 'undefined') window.KidMarkdown = kidMarkdownApi;
