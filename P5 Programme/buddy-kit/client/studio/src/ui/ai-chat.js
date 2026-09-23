/**
 * ai-chat.js — the AI panel's chat surface.
 *
 * This is the conversational half of the AI panel: it owns four existing elements
 * from `index.html` (added by task 7) and nothing else:
 *
 *   - `#ai-chat-log`  the message list (`<ul>`, one `li.ai-msg` per bubble)
 *   - `#ai-prompt`    the `<textarea>` the child types into
 *   - `#ai-send`      the Send button
 *   - `#ai-stop`      the Stop button (revealed only while a request is in flight)
 *
 * What it does:
 *   - Keeps `history` — the exact `[{role, content}]` array re-sent on every turn,
 *     which is what makes multi-turn context work (see `buildMessages` in
 *     `../ai/prompt.js`).
 *   - Builds the scene context with `buildPayload()` and sends one NON-streaming
 *     chat completion through `chatCompletion()` (`../ai/client.js`).
 *   - Parses the reply with `parseAIResponse()` and reports a valid result through
 *     `onResult({raw, parsed, payload})`; a parse failure becomes an error bubble
 *     while the turn is KEPT so the child can ask for the JSON block next turn.
 *   - Routes a typed `AIError` to `onError` and renders a friendly bubble; a failed
 *     (or cancelled) request's user turn is rolled back out of `history` so a
 *     retry never re-sends a turn that failed.
 *   - HTML-escapes every model-generated string via `renderProse()`; raw model text
 *     is never written with `innerHTML`.
 *
 * Design constraints (measured elsewhere in this subtree, do not re-derive):
 *   - NO streaming/SSE is requested (the client sends `stream:false`).
 *   - A fresh `AbortController` is created per request (a stale one is never
 *     reused); `stop()` aborts it and the resulting `kind:'aborted'` error is
 *     swallowed as a user cancel (no error bubble).
 *   - A child clicking Send twice must not double-charge the endpoint, so `send()`
 *     is a no-op while busy or while a large-payload confirmation is pending, and
 *     there is NO auto-retry.
 *   - `config` may be a plain object OR a function returning the current settings.
 *     The function form matters because the panel composes `AIControls` (task 10)
 *     whose settings change at runtime; a captured object would go stale.
 *
 * Pure ESM. Only the class methods touch the DOM, so the hostile logic — escape,
 * refuse conditions, token budget, turn bookkeeping — is exported and testable in
 * plain Node (`src/ai/tests/ai-chat.spec.js`).
 */

import { chatCompletion } from '../ai/client.js';
import { isConfigured } from '../ai/config.js';
import { buildPayload, buildMessages, estimateTokens } from '../ai/prompt.js';
import { parseAIResponse, explainParseFailure } from '../ai/parse.js';
import { asAIError } from './ai-controls.js';

/**
 * Payload size (in estimated tokens) above which `send()` asks for confirmation
 * instead of firing the request silently.
 * @type {number}
 */
export const TOKEN_THRESHOLD = 20000;

/**
 * Total vertex count (across all payload objects carrying raw geometry) above
 * which `send()` warns before shipping full geometry. A single sculpted shape is
 * already ~6k–12k vertices (see HIDDEN-FEATURES item 69), so one such shape
 * trips this and the user is told the count before a slow request goes out.
 * @type {number}
 */
export const GEO_VERTEX_WARN = 2000;

/**
 * Most recent history turns re-sent on the wire. Older turns stay in memory (the
 * full log is still shown and `getHistory()` still returns everything) but are
 * NOT re-sent, so a long session cannot silently grow every request without
 * bound. The token guard would eventually catch an unbounded history anyway;
 * windowing keeps ordinary long conversations cheap.
 * @type {number}
 */
export const MAX_HISTORY_TURNS = 24;

/**
 * Maximum number of `<li>` bubbles kept in the chat log. Older nodes are
 * dropped from the DOM (history is untouched) so a long session cannot grow the
 * DOM without bound. Matches the spirit of `MAX_HISTORY_TURNS`.
 * @type {number}
 */
export const MAX_LOG_NODES = 200;

/**
 * The most recent `maxTurns` history entries, as a fresh array.
 *
 * What: returns a sliced COPY (never the original array) so a caller can hand it
 * to `buildMessages` without mutating the live history. Why: the wire request
 * must be bounded even when `history` keeps growing. Non-array input yields `[]`;
 * a non-finite/`<= 0` limit falls back to {@link MAX_HISTORY_TURNS}.
 *
 * @param {Array<{role: string, content: string}>} history the full history.
 * @param {number} [maxTurns] maximum entries to keep (most recent).
 * @returns {Array<{role: string, content: string}>} a copy of the last `maxTurns` entries.
 */
export function windowHistory(history, maxTurns = MAX_HISTORY_TURNS) {
  if (!Array.isArray(history)) return [];
  const max =
    Number.isFinite(maxTurns) && maxTurns > 0 ? Math.floor(maxTurns) : MAX_HISTORY_TURNS;
  return history.length > max ? history.slice(history.length - max) : history.slice();
}

/**
 * The non-fatal, child-facing notice for a reply that needed numeric repairs.
 *
 * What: a short plain-language line naming the count and the first repair. Why:
 * M2 accepts a repairable reply (clamped scale, substituted coordinate) instead
 * of discarding it, but the adjustment must be visible — never silent.
 *
 * @param {string[]} repairs repair messages from `parseAIResponse`.
 * @returns {string} the notice text, or `''` when there is nothing to report.
 */
export function formatRepairNotice(repairs) {
  const list = Array.isArray(repairs) ? repairs : [];
  if (list.length === 0) return '';
  const first = String(list[0]);
  if (list.length === 1) {
    return `The AI's reply needed one small fix (${first}), so it was adjusted and previewed anyway.`;
  }
  return `The AI's reply needed ${list.length} small fixes (${first}), so it was adjusted and previewed anyway.`;
}

/**
 * Sum the raw-geometry vertices a payload would send.
 *
 * What: counts `payload.objects[*].geo.positions` — a key that only exists when
 * the geo toggle passed geometry through unchanged (`prompt.js` replaces it with
 * a `{vertexCount,boundingBox}` summary otherwise). Why: the chat must warn
 * about a huge request BEFORE spending the round-trip, and the vertex count is
 * the number a user can actually reason about.
 *
 * @param {*} payload a `buildPayload()` result (or anything).
 * @returns {{vertexCount: number, shapesWithGeo: number}} vertices (integer) and
 *   how many objects carried raw positions.
 */
export function geometrySummary(payload) {
  const objects = payload && Array.isArray(payload.objects) ? payload.objects : [];
  let vertexCount = 0;
  let shapesWithGeo = 0;
  for (const o of objects) {
    if (!o || typeof o !== 'object') continue;
    const geo = o.geo;
    const positions = geo && Array.isArray(geo.positions) ? geo.positions : null;
    if (!positions || positions.length === 0) continue;
    shapesWithGeo += 1;
    vertexCount += Math.floor(positions.length / 3);
  }
  return { vertexCount, shapesWithGeo };
}

/**
 * The child-facing warning for a payload carrying full geometry, or '' when it
 * is small enough to send silently.
 *
 * @param {*} payload a `buildPayload()` result.
 * @param {number} [limit] vertex threshold (defaults to {@link GEO_VERTEX_WARN});
 *   a non-finite value falls back to the default.
 * @returns {string} a plain-text warning naming the vertex count, or ''.
 */
export function geometryWarning(payload, limit = GEO_VERTEX_WARN) {
  const { vertexCount, shapesWithGeo } = geometrySummary(payload);
  const max = Number.isFinite(limit) ? limit : GEO_VERTEX_WARN;
  if (shapesWithGeo === 0 || vertexCount < max) return '';
  return `This request sends the full geometry of ${shapesWithGeo} shape${
    shapesWithGeo === 1 ? '' : 's'
  } (${vertexCount.toLocaleString()} vertices) and may take a while.`;
}

/** One character per the five HTML-significant characters. @type {Record<string,string>} */
const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Characters that are significant inside HTML text/attribute contexts. @type {RegExp} */
const HTML_UNSAFE_RE = /[&<>"']/g;

/**
 * Escape every HTML-significant character in arbitrary text.
 *
 * What: `&`, `<`, `>`, `"` and `'` become their entity forms.
 * Why: model replies and user prompts are untrusted; this is the single choke point
 * that stops `<img src=x onerror=…>` from ever becoming a DOM element.
 *
 * @param {*} text any value (non-strings are coerced; null/undefined become '')
 * @returns {string} text safe to place in an HTML text/attribute context
 */
export function escapeHTML(text) {
  if (text == null) return '';
  return String(text).replace(HTML_UNSAFE_RE, (ch) => HTML_ESCAPES[ch]);
}

/**
 * Render model/user prose for display inside a chat bubble.
 *
 * What: returns the HTML-escaped text. Escaping happens BEFORE any markup is added,
 * so no tag in the source can survive; the bubble's `white-space: pre-wrap` CSS
 * (task 7) preserves the original line breaks without needing `<br>`.
 * Why: callers assign the result to `innerHTML`; escaping first is what makes that
 * assignment safe.
 *
 * @param {*} text raw model or user text
 * @returns {string} escaped text (empty string for null/undefined)
 */
export function renderProse(text) {
  return escapeHTML(text);
}

/**
 * Normalize an untrusted config's `scope` field.
 *
 * What: the literal `'scene'` maps to `'scene'`; everything else maps to `'selected'`.
 * Why: `buildPayload()` already treats anything-but-`'scene'` as selected, so this
 * keeps the refusal logic consistent with what is actually sent.
 *
 * @param {*} config a settings object (or anything else)
 * @returns {'selected'|'scene'} a valid scope
 */
export function scopeOf(config) {
  const raw = config && typeof config === 'object' ? config.scope : undefined;
  return raw === 'scene' ? 'scene' : 'selected';
}

/**
 * Count the EDITABLE shapes currently selected in a studio.
 *
 * What: prefers the live `studio.selection` Set, intersecting it with
 * `studio.shapes` (which excludes joint balls / helpers / outlines) so a
 * bone-only selection counts as zero editable shapes. Falls back to the selection's
 * `size`/`length`, then to `studio.selected`, then to 0.
 * Why: `scope:'selected'` with no editable shape would send an empty payload and
 * waste a request — `send()` refuses instead.
 *
 * @param {*} studio a `StudioScene`-like object (only read)
 * @returns {number} number of selected editable shapes (integer, >= 0)
 */
export function selectedShapeCount(studio) {
  if (!studio || typeof studio !== 'object') return 0;
  const selection = studio.selection;
  if (!selection) {
    return studio.selected && typeof studio.selected === 'object' ? 1 : 0;
  }
  const size = typeof selection.size === 'number' ? selection.size : null;
  const shapes = studio.shapes;
  if (size !== null && Array.isArray(shapes) && typeof selection.has === 'function') {
    let count = 0;
    for (const shape of shapes) {
      if (selection.has(shape)) count += 1;
    }
    return count;
  }
  if (size !== null) return size;
  if (Array.isArray(selection)) return selection.length;
  return 0;
}

/**
 * Zero-width / invisible characters that `String.prototype.trim()` does NOT strip.
 *
 * U+200B..U+200D (zero-width space/joiner), U+2060 (word joiner), U+FEFF (BOM) and
 * U+00AD (soft hyphen) render as nothing but are non-empty to `.trim()`. A prompt
 * made only of them would otherwise be dispatched as a real (billable) request.
 *
 * @type {RegExp}
 */
const INVISIBLE_RE = /[\u200B-\u200D\u2060\uFEFF\u00AD]/g;

/**
 * Normalize untrusted prompt text for the blank check.
 *
 * What: strips {@link INVISIBLE_RE} characters, then trims. Why: `checkSendable`
 * must treat a zero-width-only prompt as blank, and this is the single place that
 * rule lives. Non-strings become ''.
 *
 * @param {*} text candidate prompt text.
 * @returns {string} the visible text without leading/trailing whitespace.
 */
export function normalizePromptText(text) {
  if (typeof text !== 'string') return '';
  return text.replace(INVISIBLE_RE, '').trim();
}

/**
 * Decide whether a send may proceed, and why not when it may not.
 *
 * What: pure refusal gate covering the three cases the panel must never send for —
 * an incomplete config, a blank prompt, and `scope:'selected'` with nothing selected.
 * Why: `send()` must make NO network request in these cases, and this function is
 * the single place that rule lives (so it can be unit-tested without a DOM).
 *
 * @param {{configured?: boolean, text?: string, scope?: string, hasSelection?: boolean}} [state]
 * @returns {{ok: boolean, message: string}} `ok:true` with an empty message when sendable;
 *   otherwise `ok:false` with a child-facing explanation.
 */
export function checkSendable(state = {}) {
  const text = normalizePromptText(state.text);
  if (state.configured !== true) {
    return {
      ok: false,
      message: 'Add your server URL, API key and model in AI settings first.',
    };
  }
  if (text === '') {
    return { ok: false, message: 'Type a message before sending.' };
  }
  const needsSelection = state.scope !== 'scene';
  if (needsSelection && state.hasSelection !== true) {
    return {
      ok: false,
      message: 'Select a shape first, or switch Context to the whole scene.',
    };
  }
  return { ok: true, message: '' };
}

/**
 * Whether a payload is too large to send without confirmation.
 *
 * @param {*} payload any JSON-serializable payload
 * @param {number} [limit] token limit (defaults to {@link TOKEN_THRESHOLD})
 * @returns {boolean} true when the estimate is STRICTLY greater than the limit
 */
export function exceedsTokenBudget(payload, limit = TOKEN_THRESHOLD) {
  const max = Number.isFinite(limit) ? limit : TOKEN_THRESHOLD;
  return estimateTokens(payload) > max;
}

/**
 * Append one `{role, content}` turn to a history array, in place.
 *
 * What: the canonical way this module records a turn.
 * Why: history must be mutated in exactly one place so the rollback helper
 * (`popTurnIfLast`) and the send flow stay symmetric.
 *
 * @param {Array<{role: string, content: string}>} history the history array
 * @param {'user'|'assistant'} role the turn's author
 * @param {string} content the turn text
 * @returns {Array<{role: string, content: string}>} the same array (for chaining)
 */
export function pushTurn(history, role, content) {
  if (!Array.isArray(history)) return history;
  history.push({ role, content });
  return history;
}

/**
 * Remove the LAST history turn when it matches exactly, in place.
 *
 * What: rolls back the optimistic user turn of a request that failed or was
 * cancelled. It is deliberately conditional — if the last entry is not the exact
 * turn that failed, nothing is removed (so a successful assistant turn can never be
 * popped by a late error).
 *
 * @param {Array<{role: string, content: string}>} history the history array
 * @param {'user'|'assistant'} role expected role of the last turn
 * @param {string} content expected content of the last turn
 * @returns {boolean} true when a turn was removed
 */
export function popTurnIfLast(history, role, content) {
  if (!Array.isArray(history) || history.length === 0) return false;
  const last = history[history.length - 1];
  if (!last || last.role !== role || last.content !== content) return false;
  history.pop();
  return true;
}

/**
 * Whether a settled request was a user cancel (Stop) rather than a real failure.
 *
 * What: true when the caller's own controller was aborted, or the error is the
 * client's `kind:'aborted'` / an `AbortError`.
 * Why: a cancel must show NO error bubble; a timeout is a real failure and must NOT
 * be mistaken for one.
 *
 * @param {*} err the caught error (any shape)
 * @param {AbortController|null} [controller] the controller for this request
 * @returns {boolean}
 */
export function isCancel(err, controller) {
  if (controller && controller.signal && controller.signal.aborted === true) return true;
  if (!err || typeof err !== 'object') return false;
  if (err.kind === 'aborted') return true;
  return err.name === 'AbortError';
}

/**
 * The AI panel's chat surface: log rendering, multi-turn history, send/stop state.
 *
 * Owns `#ai-chat-log`, `#ai-prompt`, `#ai-send`, `#ai-stop`. It never applies a
 * result to the scene itself — it reports `{raw, parsed, payload}` through
 * `onResult` and errors through `onError`; the panel (task 12) decides what to do.
 */
export class AIChat {
  /**
   * @param {HTMLElement|Document} root element containing the AI section (used to
   *   scope the id lookups; falls back to `document.getElementById`)
   * @param {object} [options]
   * @param {object|(() => object)} [options.config] settings object, or a function
   *   returning the current settings (use the function form when the settings can
   *   change after construction, e.g. `() => controls.getConfig()`)
   * @param {object} [options.studio] the `StudioScene` to read scene context from
   * @param {(result: {raw: string, parsed: object, payload: object}) => void} [options.onResult]
   *   called with a VALID parsed result (never called on a parse failure)
   * @param {(err: import('../ai/client.js').AIError) => void} [options.onError]
   *   called with a typed error on a non-cancel failure
   * @param {(busy: boolean) => void} [options.onBusyChange] called whenever the
   *   in-flight state toggles (lets the panel disable its own controls)
   * @param {(detail: {parsed?: object, error?: object}) => void} [options.onInvalid]
   *   called when a turn fails (parse failure or request error, never a cancel)
   *   so the panel can drop any stale preview and disable its apply buttons
   */
  constructor(root, { config, studio, onResult, onError, onBusyChange, onInvalid } = {}) {
    this.root = root || (typeof document !== 'undefined' ? document : null);
    this.studio = studio || null;
    this._configSource = typeof config === 'function' || (config && typeof config === 'object')
      ? config
      : null;
    this.onResult = typeof onResult === 'function' ? onResult : () => {};
    this.onError = typeof onError === 'function' ? onError : () => {};
    this.onBusyChange = typeof onBusyChange === 'function' ? onBusyChange : () => {};
    this.onInvalid = typeof onInvalid === 'function' ? onInvalid : () => {};

    /** @type {Array<{role: 'user'|'assistant', content: string}>} multi-turn context, re-sent verbatim. */
    this.history = [];
    /** @type {boolean} whether a chat request is currently in flight. */
    this.busy = false;
    /** @type {AbortController|null} the controller for the in-flight request (never reused). @private */
    this._controller = null;
    /** @type {{raw: string, parsed: object, payload: object}|null} last VALID result. @private */
    this._lastResult = null;
    /** @type {HTMLElement|null} the "thinking…" bubble while a request is in flight. @private */
    this._thinking = null;
    /** @type {{text: string, payload: object, messages: object[], box?: HTMLElement}|null} a large payload awaiting confirmation. @private */
    this._pending = null;
    /** @type {boolean} set by `destroy()`; cleared by `reopen()`. @private */
    this._destroyed = false;
    /** @type {boolean} whether the DOM listeners are currently attached. @private */
    this._wired = false;
    /** @type {Array<() => void>} listener removers installed by `_wire()`. @private */
    this._unsubs = [];

    this.log = this._require('ai-chat-log');
    this.prompt = this._require('ai-prompt');
    this.sendBtn = this._require('ai-send');
    this.stopBtn = this._require('ai-stop');

    this._wire();
    this._syncBusyUI();
  }

  /**
   * Look up one of the owned ids inside `root`, falling back to the document.
   * @param {string} id element id (without '#')
   * @returns {HTMLElement|null}
   * @private
   */
  _el(id) {
    if (this.root && typeof this.root.querySelector === 'function') {
      const found = this.root.querySelector(`#${id}`);
      if (found) return found;
    }
    return typeof document !== 'undefined' ? document.getElementById(id) : null;
  }

  /**
   * Like `_el`, but fails loudly on a missing contract id.
   * @param {string} id element id (without '#')
   * @returns {HTMLElement}
   * @private
   */
  _require(id) {
    const el = this._el(id);
    if (!el) throw new Error(`AIChat: required element #${id} is missing`);
    return el;
  }

  /** Attach the Send/Stop/Enter handlers. Idempotent; `destroy()` removes them. @private */
  _wire() {
    if (this._wired) return;
    this._wired = true;

    const onSend = () => this.send(this.prompt.value);
    const onStop = () => this.stop();
    const onKeydown = (event) => {
      // Enter sends; Shift+Enter keeps the textarea's native newline. `isComposing`
      // guards an IME candidate window so composing a word never fires a send.
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        this.send(this.prompt.value);
      }
    };

    this.sendBtn.addEventListener('click', onSend);
    this.stopBtn.addEventListener('click', onStop);
    this.prompt.addEventListener('keydown', onKeydown);
    this._unsubs = [
      () => this.sendBtn.removeEventListener('click', onSend),
      () => this.stopBtn.removeEventListener('click', onStop),
      () => this.prompt.removeEventListener('keydown', onKeydown),
    ];
  }

  /**
   * Resolve the current settings to a plain copy.
   *
   * When the constructor was given a function, it is re-invoked on every call (so
   * edits made in the settings UI are picked up); a throwing source degrades to an
   * empty object, which `send()` then refuses as unconfigured.
   *
   * @returns {object} a shallow copy of the current config (empty when unavailable)
   */
  getConfig() {
    let source = this._configSource;
    if (typeof source === 'function') {
      try {
        source = source();
      } catch (_err) {
        source = null;
      }
    }
    return source && typeof source === 'object' && !Array.isArray(source) ? { ...source } : {};
  }

  /** @returns {boolean} whether a request is currently in flight. */
  isBusy() {
    return this.busy;
  }

  /**
   * Why the current prompt cannot be sent, or null when it can.
   * @param {string} text the candidate prompt
   * @returns {string|null} a child-facing refusal message, or null
   * @private
   */
  _refusal(text) {
    const config = this.getConfig();
    const check = checkSendable({
      configured: isConfigured(config),
      text,
      scope: scopeOf(config),
      hasSelection: selectedShapeCount(this.studio) > 0,
    });
    return check.ok ? null : check.message;
  }

  /**
   * Send one turn.
   *
   * Flow: refuse (no request) → append the user bubble and optimistically record the
    * user turn → build payload + messages → confirm when the WHOLE request exceeds
    * {@link TOKEN_THRESHOLD} → otherwise dispatch. The user turn is popped back out
    * of `history` if the request fails or is cancelled, so a failed turn is never
    * re-sent later.
    *
    * The budget check measures the wire `messages` (system prompt + windowed
    * history + user text + payload), not just the payload, because that is what is
    * actually sent.
    *
    * @param {string} text the child's prompt
    * @returns {boolean} true when a request was dispatched (or a confirmation shown)
    */
  send(text) {
    // No double-send: while busy, while a large-payload confirmation is pending,
    // or after teardown, a click must not fire another (billable) request. A
    // click while a Stop is still settling (busy flips false only when the abort
    // resolves) must not be a SILENT no-op — tell the user what happened.
    if (this._destroyed) return false;
    if (this.busy) {
      this._appendMsg('notice', 'Still finishing the last request — wait a moment, then send again.');
      return false;
    }
    if (this._pending) return false;

    const prompt = typeof text === 'string' ? text : '';
    const refusal = this._refusal(prompt);
    if (refusal) {
      this._appendMsg('notice', refusal);
      return false;
    }

    const config = this.getConfig();
    const scope = scopeOf(config);
    const includeGeo = config.includeGeo === true;

    // Build the messages from the WINDOWED history BEFORE the current turn:
    // `buildMessages` appends the current user text + payload itself, so passing a
    // history that already contains it would duplicate the turn on the wire.
    const priorHistory = windowHistory(this.history, MAX_HISTORY_TURNS);
    this._appendMsg('user', prompt);
    pushTurn(this.history, 'user', prompt);

    let payload;
    let messages;
    try {
      payload = buildPayload(this.studio, { scope, includeGeo });
      messages = buildMessages(priorHistory, payload, prompt, { scope });
    } catch (err) {
      popTurnIfLast(this.history, 'user', prompt);
      const wrapped = asAIError(err);
      this._appendMsg('error', wrapped.message);
      this._reportError(wrapped);
      return false;
    }

    this.prompt.value = '';

    // Two independent reasons to confirm before spending the round-trip: the whole
    // request (messages incl. system prompt + history) over the token budget, and a
    // payload carrying full geometry whose vertex count is large enough to be slow.
    // Both are shown together.
    const geometryNote = geometryWarning(payload, GEO_VERTEX_WARN);
    if (exceedsTokenBudget(messages, TOKEN_THRESHOLD) || geometryNote) {
      this._showConfirm(prompt, payload, messages, { geometryNote });
      return true;
    }

    void this._request(prompt, payload, messages);
    return true;
  }

  /**
   * Render the confirm-before-send state for a large request.
   *
   * The user turn is already in `history`. "Send anyway" dispatches it; "Cancel"
   * rolls the turn back out and clears `_pending`, so the confirm can never
   * latch. While `_pending` is set any other `send()` is blocked.
   *
   * @param {string} text the user turn text
   * @param {object} payload the built payload
   * @param {object[]} messages the built messages
   * @param {{geometryNote?: string}} [notes] extra warning lines (full-geometry size)
   * @private
   */
  _showConfirm(text, payload, messages, { geometryNote = '' } = {}) {
    const box = this._appendMsg('assistant', '');
    this._pending = { text, payload, messages, box };

    const note = document.createElement('p');
    note.className = 'ai-confirm-note';
    note.textContent = `This request is large (about ${estimateTokens(messages).toLocaleString()} tokens).`;
    if (geometryNote) {
      const geo = document.createElement('p');
      geo.className = 'ai-confirm-note';
      geo.textContent = geometryNote;
      box.append(geo);
    }
    const question = document.createElement('p');
    question.textContent = 'Send it anyway?';

    const sendAnyway = document.createElement('button');
    sendAnyway.type = 'button';
    sendAnyway.className = 'ai-confirm-send';
    sendAnyway.textContent = 'Send anyway';
    sendAnyway.addEventListener('click', () => {
      // A stale button from a torn-down/replaced confirm must not dispatch: only
      // the CURRENT pending latch, while the chat is alive, may fire.
      if (this._destroyed) return;
      const pending = this._pending;
      if (!pending || pending.box !== box) return;
      this._pending = null;
      this._removeConfirmBox(pending);
      void this._request(text, payload, messages);
    });

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'ai-confirm-cancel';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => this._cancelPending());

    box.append(note, question, sendAnyway, cancel);
    this._scrollToEnd();
  }

  /**
   * Drop the pending confirmation without sending, rolling back its user turn.
   *
   * This is the H1 escape hatch: after it runs `_pending` is null, so the next
   * `send()` dispatches normally. Idempotent — a no-op when nothing is pending.
   * @returns {void}
   * @private
   */
  _cancelPending() {
    const pending = this._pending;
    if (!pending) return;
    this._pending = null;
    this._removeConfirmBox(pending);
    popTurnIfLast(this.history, 'user', pending.text);
    this._appendMsg('notice', 'Cancelled — nothing was sent.');
  }

  /**
   * Remove a confirm bubble from the log, if it is still attached.
   * @param {{box?: HTMLElement}|null} pending the pending state that owns the box
   * @returns {void}
   * @private
   */
  _removeConfirmBox(pending) {
    const box = pending && pending.box;
    if (box && box.parentNode) box.parentNode.removeChild(box);
  }

  /**
   * Run one chat-completion request under a fresh `AbortController`.
   *
   * Commits the turn to `history` only when the network reply arrives (a parse
   * failure still commits, so the child can ask for the JSON block next turn); a
   * failure or cancel rolls the user turn back out.
   *
   * @param {string} text the user turn text
   * @param {object} payload the built scene payload
   * @param {object[]} messages the OpenAI-compatible messages array
   * @returns {Promise<void>}
   * @private
   */
  async _request(text, payload, messages) {
    // Never start a second concurrent request, even if a caller reaches this
    // method directly (the Send-anyway button and `send()` both funnel here).
    if (this._destroyed || this.busy) return;

    this._setBusy(true);
    const controller = new AbortController();
    this._controller = controller;
    this._renderThinking();

    try {
      const config = this.getConfig();
      const reply = await chatCompletion({
        baseUrl: config.baseUrl,
        key: config.key,
        model: config.model,
        messages,
        temperature: config.temperature,
        signal: controller.signal,
      });

      // Stop pressed (or the panel torn down) in the same tick the reply landed:
      // treat it as a cancel and do not commit the turn.
      if (this._destroyed || controller.signal.aborted) {
        popTurnIfLast(this.history, 'user', text);
        return;
      }

      const content = reply && typeof reply.content === 'string' ? reply.content : '';
      pushTurn(this.history, 'assistant', content);
      this._appendMsg('assistant', content);

      const parsed = parseAIResponse(content);
      if (parsed.json) {
        const result = { raw: content, parsed, payload };
        this._lastResult = result;
        this._emitResult(result);
        // An accepted reply may have needed numeric repairs; report them as a
        // NON-FATAL notice so the adjustment is never silent.
        const repairNotice = formatRepairNotice(parsed.repairs);
        if (repairNotice) this._appendMsg('notice', repairNotice);
      } else {
        // Keep BOTH turns: the child can reply "please return the JSON block" and
        // the model sees its own malformed attempt in context.
        this._appendMsg('error', explainParseFailure(parsed));
        this._emitInvalid({ parsed });
      }
    } catch (err) {
      // The failed turn is never kept, so a later retry cannot re-send it.
      popTurnIfLast(this.history, 'user', text);
      if (!this._destroyed && !isCancel(err, controller)) {
        const wrapped = asAIError(err);
        this._appendMsg('error', wrapped.message || 'Something went wrong. Try again.');
        this._reportError(wrapped);
        this._emitInvalid({ error: wrapped });
      }
      // A cancel shows no bubble by design.
    } finally {
      this._removeThinking();
      if (this._controller === controller) this._controller = null;
      this._setBusy(false);
    }
  }

  /**
   * Abort the in-flight request as a user cancel, and drop any pending
   * confirmation (so a latch can never survive a Stop).
   *
   * The rejection surfaces as `kind:'aborted'`, which `_request` swallows (no error
   * bubble). Safe to call when nothing is in flight.
   * @returns {void}
   */
  stop() {
    if (this._pending) this._cancelPending();
    const controller = this._controller;
    if (controller && controller.signal.aborted !== true) controller.abort();
  }

  /**
   * Empty the log and forget the conversation.
   *
   * Also drops any pending confirmation / last result so a cleared panel cannot
   * resurface stale state. An in-flight request is left to settle via `stop()`.
   * @returns {void}
   */
  clear() {
    const pending = this._pending;
    this.history = [];
    this._lastResult = null;
    this._pending = null;
    this._removeConfirmBox(pending);
    this._removeThinking();
    if (this.log) this.log.innerHTML = '';
    this._scrollToEnd();
  }

  /**
   * Tear the chat down: abort the in-flight request, drop any pending
   * confirmation, and remove the DOM listeners. Idempotent. `reopen()` restores
   * the chat after a teardown, so a panel `destroy()`→`open()` still works.
   * @returns {void}
   */
  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    const pending = this._pending;
    this._pending = null;
    // Remove the confirm bubble too: leaving it attached left a stale "Send
    // anyway" clickable across a later reopen() (MT-6).
    this._removeConfirmBox(pending);
    const controller = this._controller;
    if (controller && controller.signal.aborted !== true) controller.abort();
    this._removeThinking();
    for (const off of this._unsubs.splice(0)) {
      try {
        off();
      } catch {
        /* already gone — nothing to undo */
      }
    }
    this._wired = false;
  }

  /**
   * Undo a `destroy()`: re-attach listeners and clear the teardown flag so the
   * chat can be used again (the panel calls this from `open()`).
   * @returns {void}
   */
  reopen() {
    this._destroyed = false;
    this._wire();
    this._syncBusyUI();
  }

  /**
   * Point the chat at a (possibly new) studio without rebuilding it.
   * @param {object} studio the `StudioScene` to read context from
   * @returns {void}
   */
  setStudio(studio) {
    this.studio = studio || null;
  }

  /**
   * A defensive copy of the multi-turn history.
   * @returns {Array<{role: 'user'|'assistant', content: string}>} copied entries
   */
  getHistory() {
    return this.history.map((entry) => ({ ...entry }));
  }

  /**
   * The most recent VALID result (a parse success), or null.
   * @returns {{raw: string, parsed: object, payload: object}|null}
   */
  getLastResult() {
    return this._lastResult;
  }

  /**
   * Append a bubble to the log and scroll to it.
   * @param {'user'|'assistant'|'error'|'notice'|'thinking'} kind bubble class suffix
   * @param {string} text raw text (escaped before insertion)
   * @returns {HTMLElement} the created `<li>`
   * @private
   */
  _appendMsg(kind, text) {
    const li = document.createElement('li');
    li.className = `ai-msg ${kind}`.trim();
    li.setAttribute('data-role', kind);
    const prose = document.createElement('div');
    prose.className = 'ai-prose';
    // Escape FIRST: `renderProse` returns entity-only text, so no model string can
    // ever introduce an element here.
    prose.innerHTML = renderProse(text);
    li.appendChild(prose);
    this.log.appendChild(li);
    // Bound the rendered DOM: history is unaffected, but a very long session
    // cannot grow the log's node count without limit.
    while (this.log.childNodes.length > MAX_LOG_NODES && this.log.firstChild) {
      this.log.removeChild(this.log.firstChild);
    }
    this._scrollToEnd();
    return li;
  }

  /** Render the transient "thinking…" bubble (idempotent). @private */
  _renderThinking() {
    this._removeThinking();
    this._thinking = this._appendMsg('thinking', 'Thinking…');
  }

  /** Remove the "thinking…" bubble, if present. Idempotent. @private */
  _removeThinking() {
    if (this._thinking) {
      if (this._thinking.parentNode) this._thinking.parentNode.removeChild(this._thinking);
      this._thinking = null;
    }
  }

  /** Scroll the log to the newest message. @private */
  _scrollToEnd() {
    if (this.log && typeof this.log.scrollTop === 'number') {
      this.log.scrollTop = this.log.scrollHeight;
    }
  }

  /** Push the busy flag into the Send/Stop controls. @private */
  _syncBusyUI() {
    if (this._destroyed) return;
    this.sendBtn.disabled = this.busy;
    this.stopBtn.hidden = !this.busy;
    if (this.log && typeof this.log.setAttribute === 'function') {
      this.log.setAttribute('aria-busy', this.busy ? 'true' : 'false');
    }
  }

  /**
   * Set the busy flag, update the controls, and notify `onBusyChange`.
   * @param {boolean} busy whether a request is in flight
   * @private
   */
  _setBusy(busy) {
    this.busy = busy === true;
    if (this._destroyed) return;
    this._syncBusyUI();
    try {
      this.onBusyChange(this.busy);
    } catch (_err) {
      /* the callback is the panel's concern; chat state is already consistent */
    }
  }

  /** Route a valid result to `onResult`; a throwing callback must not corrupt state. @private */
  _emitResult(result) {
    try {
      this.onResult(result);
    } catch (_err) {
      /* the callback is the panel's concern */
    }
  }

  /** Route a failure to `onError`; a throwing callback must not corrupt state. @private */
  _reportError(err) {
    try {
      this.onError(err);
    } catch (_err) {
      /* the callback is the panel's concern */
    }
  }

  /** Tell `onInvalid` a turn produced nothing usable (parse failure or error). @private */
  _emitInvalid(detail) {
    try {
      this.onInvalid(detail);
    } catch (_err) {
      /* the callback is the panel's concern */
    }
  }
}
