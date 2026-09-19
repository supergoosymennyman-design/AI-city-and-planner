// web/coding agent/logic/command-parse.js
'use strict';
/**
 * Pure slash-command parser for the buddy's agent console. A message is a command iff its FIRST
 * character is '/' (leading whitespace is trimmed first — but text with a slash elsewhere is chat).
 * Known commands mirror real coding agents on purpose (the lesson teaches the real vocabulary):
 * /clear /compact /model /help. Anything else starting with '/' is unknown-command — the client
 * shows a gentle hint and NEVER sends it to the model.
 */
const KNOWN = ['clear', 'compact', 'model', 'help'];

/** One lowercase word, max 16 chars. Deliberately narrower than a manifest `name`: this string is
 *  what a child TYPES after a slash, so it has to be short and unambiguous at a keyboard. */
const HOST_CMD_RE = /^[a-z][a-z0-9-]{0,15}$/;
/** `desc` renders in the palette beside the command, on a tablet, to a 10-year-old. */
const DESC_MAX = 40;

/**
 * @param {string} inputText
 * @param {string[]} [extra] host-declared command words (see sanitizeHostCommands). Anything that
 *   is not an array of strings is ignored — a malformed `extra` must never make a word "known",
 *   because an unknown word is the ONE thing guaranteed never to reach the model.
 * @returns {{kind:'chat'}|{kind:'command',cmd:string,args:string}|{kind:'unknown-command',word:string}}
 */
function parseCommand(inputText, extra) {
  const text = typeof inputText === 'string' ? inputText.trim() : '';
  if (!text.startsWith('/')) return { kind: 'chat' };
  const body = text.slice(1);
  const sp = body.indexOf(' ');
  const word = (sp === -1 ? body : body.slice(0, sp)).toLowerCase();
  const args = sp === -1 ? '' : body.slice(sp + 1).trim();
  if (KNOWN.includes(word)) return { kind: 'command', cmd: word, args };
  // `word &&` first: a lone '/' has an empty word, and a host passing [''] must not turn that into
  // a command. Built-ins are checked BEFORE this, so a host word can never shadow one even if
  // sanitizeHostCommands were bypassed.
  if (word && Array.isArray(extra)
      && extra.some((e) => typeof e === 'string' && e.toLowerCase() === word)) {
    return { kind: 'command', cmd: word, args };
  }
  return { kind: 'unknown-command', word };
}

/**
 * Validates a host's `commands` array ONCE at mount, so a project can add its own slash command
 * without editing any file inside the kit — the whole point being that a host stays updatable when
 * a new kit version is sent to them.
 *
 * Fail-closed WITH A MESSAGE, mirroring the gateway's manifest sanitizer: a bad entry is dropped
 * and the reason is RETURNED for the caller to log. Silence is the wrong failure here — a silently
 * dropped command is indistinguishable, from the host developer's chair, from a command that runs
 * and does nothing. Pure (no console, no DOM) so it stays testable; buddy.js does the warning.
 *
 * @param {*} raw the host's `opts.commands` (absent/garbage is normal, not an error)
 * @returns {{commands: {cmd:string, desc:string, run:Function}[], dropped: {cmd:string, reason:string}[]}}
 */
function sanitizeHostCommands(raw) {
  const commands = [];
  const dropped = [];
  const seen = new Set();
  for (const e of Array.isArray(raw) ? raw : []) {
    if (!e || typeof e !== 'object' || Array.isArray(e)) {
      dropped.push({ cmd: String(e), reason: 'not an object — expected {cmd, desc, run}' });
      continue;
    }
    // Printable label for the report even when `cmd` is the thing that is wrong.
    const label = (typeof e.cmd === 'string' && e.cmd) ? e.cmd : String(e.cmd);
    if (typeof e.cmd !== 'string' || !HOST_CMD_RE.test(e.cmd)) {
      dropped.push({ cmd: label, reason: 'cmd must be one lowercase word, max 16 chars (/^[a-z][a-z0-9-]{0,15}$/)' });
    } else if (KNOWN.includes(e.cmd)) {
      // Reserved so a host cannot shadow the vocabulary the lesson deliberately teaches.
      dropped.push({ cmd: label, reason: `'${e.cmd}' is a reserved built-in command` });
    } else if (seen.has(e.cmd)) {
      dropped.push({ cmd: label, reason: 'duplicate cmd — the first one wins' });
    } else if (typeof e.desc !== 'string' || e.desc.length === 0 || e.desc.length > DESC_MAX) {
      dropped.push({ cmd: label, reason: `desc must be a string of 1..${DESC_MAX} characters` });
    } else if (typeof e.run !== 'function') {
      dropped.push({ cmd: label, reason: 'run must be a function' });
    } else {
      seen.add(e.cmd);
      // Rebuilt, never passed through by reference: only these three keys reach the buddy's
      // internals, so a host cannot smuggle extra fields into the palette or the dispatch chain.
      commands.push({ cmd: e.cmd, desc: e.desc, run: e.run });
    }
  }
  return { commands, dropped };
}

// Uniquely named export object — logic/*.js share ONE browser global scope (classic <script>);
// a bare `const api` here collides and silently kills the second script. See stream-frames.js.
const commandParseApi = { parseCommand, sanitizeHostCommands, KNOWN, HOST_CMD_RE, DESC_MAX };
if (typeof window !== 'undefined') window.CommandParse = commandParseApi;
if (typeof module !== 'undefined' && module.exports) module.exports = commandParseApi;
