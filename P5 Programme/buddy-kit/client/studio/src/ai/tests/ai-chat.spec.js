/**
 * ai-chat.spec.js — pure-node coverage for the chat surface's hostile logic
 * (`src/ui/ai-chat.js`).
 *
 * Discovered by `run-tests.mjs`'s `src/ai/tests/*.spec.js` block, which calls
 * `mod.default(check)` SYNCHRONOUSLY and then immediately `process.exit()`s. Every
 * helper under test here is synchronous and DOM-free, so no top-level-await/replay
 * workaround is needed (that pattern is only for async suites — see client.spec.js).
 *
 * What is covered:
 *   - HTML escaping (`escapeHTML` / `renderProse`) — the XSS defence.
 *   - The three refusal conditions (`checkSendable`) and exact messages.
 *   - The token budget (`exceedsTokenBudget` / `TOKEN_THRESHOLD`).
 *   - Selection counting (`selectedShapeCount`).
 *   - Turn bookkeeping (`pushTurn` / `popTurnIfLast`) — failed turns roll back.
 *   - Cancel classification (`isCancel`) — a timeout is NOT a cancel.
 *   - The multi-turn wire contract: `buildMessages` receives the PRIOR history so the
 *     current turn is not duplicated, and prior turns are passed verbatim.
 *
 * The DOM-driven behaviour (buttons, bubbles, Enter/Shift+Enter, auto-scroll) is
 * exercised in the real-browser QA, not here.
 */

import {
  AIChat,
  TOKEN_THRESHOLD,
  escapeHTML,
  renderProse,
  scopeOf,
  selectedShapeCount,
  checkSendable,
  exceedsTokenBudget,
  pushTurn,
  popTurnIfLast,
  isCancel,
} from '../../ui/ai-chat.js';
import { buildMessages, estimateTokens } from '../prompt.js';

/**
 * Exercise `check` and count results the same way the runner does.
 * @param {(name: string, cond: boolean) => void} check the runner's PASS/FAIL counter
 */
export default function aiChatTests(check) {
  // ---------------------------------------------------------------------------
  // HTML escaping — the XSS defence
  // ---------------------------------------------------------------------------
  check(
    'ai-chat: escapeHTML escapes all five HTML-significant characters',
    escapeHTML('&<>"\'') === '&amp;&lt;&gt;&quot;&#39;',
  );
  check(
    'ai-chat: renderProse neutralises an injected <img onerror> payload',
    renderProse('<img src=x onerror=alert(1)>') ===
      '&lt;img src=x onerror=alert(1)&gt;' &&
      !renderProse('<img src=x onerror=alert(1)>').includes('<img'),
  );
  check(
    'ai-chat: renderProse leaves no raw angle bracket for a script/closing-tag payload',
    renderProse('</div><script>alert(1)</script>') ===
      '&lt;/div&gt;&lt;script&gt;alert(1)&lt;/script&gt;' &&
      !renderProse('</div><script>alert(1)</script>').includes('<'),
  );
  check(
    'ai-chat: renderProse coerces null/undefined/non-strings to text',
    renderProse(null) === '' && renderProse(undefined) === '' && renderProse(42) === '42',
  );
  check(
    'ai-chat: renderProse escapes ampersands before entity-looking text (no double-decode)',
    renderProse('&lt;img&gt;') === '&amp;lt;img&amp;gt;',
  );

  // ---------------------------------------------------------------------------
  // scopeOf
  // ---------------------------------------------------------------------------
  check(
    'ai-chat: scopeOf accepts only the literal scene, else selected',
    scopeOf({ scope: 'scene' }) === 'scene' &&
      scopeOf({ scope: 'selected' }) === 'selected' &&
      scopeOf({ scope: 'nonsense' }) === 'selected' &&
      scopeOf(null) === 'selected' &&
      scopeOf(undefined) === 'selected',
  );

  // ---------------------------------------------------------------------------
  // selectedShapeCount
  // ---------------------------------------------------------------------------
  {
    const a = { id: 'a' };
    const b = { id: 'b' };
    const bone = { id: 'bone' };
    check(
      'ai-chat: selectedShapeCount counts only selected entries that are real shapes',
      selectedShapeCount({ shapes: [a, b], selection: new Set([a, bone]) }) === 1,
    );
    check(
      'ai-chat: selectedShapeCount is 0 for an empty selection',
      selectedShapeCount({ shapes: [a, b], selection: new Set() }) === 0,
    );
    check(
      'ai-chat: selectedShapeCount is 0 when only helpers (non-shapes) are selected',
      selectedShapeCount({ shapes: [a], selection: new Set([bone]) }) === 0,
    );
    check(
      'ai-chat: selectedShapeCount falls back to selection size when shapes are absent',
      selectedShapeCount({ selection: new Set([a, bone]) }) === 2,
    );
    check(
      'ai-chat: selectedShapeCount falls back to studio.selected and handles null studio',
      selectedShapeCount({ selected: a }) === 1 &&
        selectedShapeCount(null) === 0 &&
        selectedShapeCount({}) === 0,
    );
    check(
      'ai-chat: selectedShapeCount reads an array-shaped selection',
      selectedShapeCount({ selection: [a, b] }) === 2,
    );
  }

  // ---------------------------------------------------------------------------
  // checkSendable — the three refusals
  // ---------------------------------------------------------------------------
  check(
    'ai-chat: checkSendable allows a configured prompt with a selected shape',
    checkSendable({ configured: true, text: 'make it taller', scope: 'selected', hasSelection: true })
      .ok === true,
  );
  check(
    'ai-chat: checkSendable refuses an incomplete config with the exact settings message',
    checkSendable({ configured: false, text: 'hi', scope: 'scene', hasSelection: true }).ok ===
      false &&
      checkSendable({ configured: false, text: 'hi', scope: 'scene', hasSelection: true })
        .message === 'Add your server URL, API key and model in AI settings first.',
  );
  check(
    'ai-chat: checkSendable refuses a blank/whitespace prompt with the exact message',
    checkSendable({ configured: true, text: '   \n\t ', scope: 'scene', hasSelection: true }).ok ===
      false &&
      checkSendable({ configured: true, text: '', scope: 'scene', hasSelection: true }).message ===
        'Type a message before sending.',
  );
  check(
    'ai-chat: checkSendable refuses scope:selected with no selection and names the fix',
    checkSendable({ configured: true, text: 'hi', scope: 'selected', hasSelection: false }).ok ===
      false &&
      checkSendable({ configured: true, text: 'hi', scope: 'selected', hasSelection: false })
        .message === 'Select a shape first, or switch Context to the whole scene.',
  );
  check(
    'ai-chat: checkSendable allows scope:scene with no selection',
    checkSendable({ configured: true, text: 'hi', scope: 'scene', hasSelection: false }).ok === true,
  );
  check(
    'ai-chat: checkSendable treats a missing scope as selected',
    checkSendable({ configured: true, text: 'hi', hasSelection: false }).ok === false,
  );
  check(
    'ai-chat: checkSendable handles an empty argument object without throwing',
    checkSendable().ok === false && checkSendable().message.length > 0,
  );

  // ---------------------------------------------------------------------------
  // Token budget
  // ---------------------------------------------------------------------------
  check(
    'ai-chat: TOKEN_THRESHOLD is 20000',
    TOKEN_THRESHOLD === 20000,
  );
  {
    const payload = { objects: [{ kind: 'box', p: [0, 0, 0] }] };
    const tokens = estimateTokens(payload);
    check(
      'ai-chat: exceedsTokenBudget is false at the limit and true just above it',
      exceedsTokenBudget(payload, tokens) === false &&
        exceedsTokenBudget(payload, tokens - 1) === true,
    );
    check(
      'ai-chat: exceedsTokenBudget defaults to TOKEN_THRESHOLD',
      exceedsTokenBudget(payload) === false &&
        exceedsTokenBudget({ big: 'x'.repeat(TOKEN_THRESHOLD * 4 + 16) }) === true,
    );
    check(
      'ai-chat: exceedsTokenBudget falls back to the default for a non-finite limit',
      exceedsTokenBudget({ big: 'x'.repeat(TOKEN_THRESHOLD * 4 + 16) }, NaN) === true,
    );
  }

  // ---------------------------------------------------------------------------
  // Turn bookkeeping — failed turns must roll back
  // ---------------------------------------------------------------------------
  {
    const history = [];
    pushTurn(history, 'user', 'first');
    pushTurn(history, 'assistant', 'reply');
    check(
      'ai-chat: pushTurn appends {role,content} entries in order',
      history.length === 2 &&
        history[0].role === 'user' &&
        history[0].content === 'first' &&
        history[1].role === 'assistant' &&
        history[1].content === 'reply',
    );

    const removed = popTurnIfLast(history, 'user', 'ghost');
    check(
      'ai-chat: popTurnIfLast refuses to remove a non-matching turn',
      removed === false && history.length === 2,
    );

    pushTurn(history, 'user', 'failed prompt');
    const rolled = popTurnIfLast(history, 'user', 'failed prompt');
    check(
      'ai-chat: popTurnIfLast rolls back the exact failed user turn',
      rolled === true && history.length === 2 && history[history.length - 1].role === 'assistant',
    );

    check(
      'ai-chat: popTurnIfLast on an empty history is a no-op',
      popTurnIfLast([], 'user', 'x') === false &&
        popTurnIfLast(null, 'user', 'x') === false,
    );
    check(
      'ai-chat: pushTurn tolerates a non-array history',
      pushTurn(null, 'user', 'x') === null,
    );
  }

  // ---------------------------------------------------------------------------
  // Cancel classification
  // ---------------------------------------------------------------------------
  {
    const aborted = new AbortController();
    aborted.abort();
    const live = new AbortController();
    check(
      'ai-chat: isCancel is true when the caller controller aborted',
      isCancel(null, aborted) === true && isCancel(null, live) === false,
    );
    check(
      'ai-chat: isCancel recognises kind:aborted and AbortError by name',
      isCancel({ kind: 'aborted' }) === true && isCancel({ name: 'AbortError' }) === true,
    );
    check(
      'ai-chat: isCancel does NOT treat a timeout or a network error as a cancel',
      isCancel({ kind: 'timeout' }) === false &&
        isCancel({ kind: 'network' }) === false &&
        isCancel({ name: 'TimeoutError' }) === false &&
        isCancel(null) === false &&
        isCancel('boom') === false,
    );
  }

  // ---------------------------------------------------------------------------
  // Multi-turn wire contract
  // ---------------------------------------------------------------------------
  {
    const prior = [
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'reply' },
    ];
    const payload = { scope: 'selected', includeGeo: false, editableIds: [3], objects: [] };
    const messages = buildMessages(prior, payload, 'second', { scope: 'selected' });
    check(
      'ai-chat: buildMessages lays out [system, ...priorHistory, currentUserTurn]',
      messages.length === 4 &&
        messages[0].role === 'system' &&
        messages[1].role === 'user' &&
        messages[2].role === 'assistant' &&
        messages[3].role === 'user',
    );
    check(
      'ai-chat: prior history entries are re-sent verbatim by reference',
      messages[1] === prior[0] && messages[2] === prior[1],
    );
    check(
      'ai-chat: the current turn is carried once with the payload (never duplicated)',
      messages.filter((m) => m.role === 'user' && m.content.startsWith('second')).length === 1 &&
        messages[3].content.includes('<selected_shapes>') &&
        messages[3].content.includes(JSON.stringify(payload)),
    );

    // Reproduce the send() flow: snapshot prior, push the user turn, build from the
    // snapshot — this is what keeps a 2nd request from duplicating the 2nd user turn.
    const live = prior.slice();
    pushTurn(live, 'user', 'second');
    const fromSnapshot = buildMessages(live.slice(0, -1), payload, 'second', { scope: 'selected' });
    pushTurn(live, 'assistant', 'done');
    const secondUserTurns = fromSnapshot.filter(
      (m) => m.role === 'user' && m.content.startsWith('second'),
    );
    check(
      'ai-chat: the send() snapshot keeps exactly one wire copy of the current turn',
      fromSnapshot.length === 4 && secondUserTurns.length === 1,
    );
    check(
      'ai-chat: a successful turn is recorded as user-then-assistant',
      live.length === 4 && live[2].role === 'user' && live[3].role === 'assistant',
    );
  }

  // ---------------------------------------------------------------------------
  // Class surface (no DOM needed to inspect the export)
  // ---------------------------------------------------------------------------
  check(
    'ai-chat: AIChat is a class whose prototype exposes the public API',
    typeof AIChat === 'function' &&
      ['send', 'stop', 'clear', 'setStudio', 'getHistory', 'getLastResult', 'getConfig', 'isBusy'].every(
        (name) => typeof AIChat.prototype[name] === 'function',
      ),
  );
}
