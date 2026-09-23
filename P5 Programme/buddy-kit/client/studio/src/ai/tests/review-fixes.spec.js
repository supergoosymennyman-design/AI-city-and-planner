/**
 * review-fixes.spec.js — pure-node coverage for the focused adversarial review.
 *
 * Discovered by `run-tests.mjs`'s `src/ai/tests/*.spec.js` block and replayed
 * synchronously, so every helper here is DOM-free and network-free.
 *
 * What is covered:
 *   - M1: the token budget measures the WIRE messages, and `history` is windowed
 *     so a long session cannot grow every request without bound.
 *   - M2: `validateObjects` splits HARD errors from soft numeric REPAIRS; a
 *     repairable reply is ACCEPTED by `parseAIResponse` (with repairs surfaced)
 *     while `custom`/`geo`/unknown-kind replies are still rejected.
 *   - L2: `estimateTokens` never throws on `undefined` or a circular object.
 *   - L4: `parseAIResponse` returns the COMPUTED `truncated` on success paths.
 *   - L5: `MAX_LOG_NODES` bounds the rendered chat log.
 */
import { validateObjects } from '../schema.js';
import { parseAIResponse } from '../parse.js';
import { estimateTokens, buildMessages } from '../prompt.js';
import {
  TOKEN_THRESHOLD,
  MAX_HISTORY_TURNS,
  MAX_LOG_NODES,
  windowHistory,
  exceedsTokenBudget,
  formatRepairNotice,
} from '../../ui/ai-chat.js';

/**
 * Register this module's checks with the runner.
 * @param {(name: string, cond: boolean) => void} check the runner's PASS/FAIL counter
 * @returns {void}
 */
export default function reviewFixesTests(check) {
  // ---------------------------------------------------------------------------
  // M2 — hard errors vs soft numeric repairs (additive schema contract)
  // ---------------------------------------------------------------------------
  const repaired = validateObjects({
    objects: [{ kind: 'sphere', p: ['x', 1, 2], s: [0, 1, 1] }],
  });
  check(
    'review: a repairable reply has no hardErrors but records numeric repairs',
    repaired.hardErrors.length === 0 &&
      repaired.repairs.length >= 2 &&
      repaired.repairs.some((r) => r.includes('p[0]')) &&
      repaired.repairs.some((r) => r.includes('s[0]')) &&
      repaired.objects.length === 1 &&
      repaired.objects[0].transform.p.join(',') === '0,1,2' &&
      repaired.objects[0].transform.s[0] > 0,
  );
  check(
    'review: the additive split keeps ok/errors backward-compatible',
    repaired.ok === false &&
      repaired.errors.length === repaired.hardErrors.length + repaired.repairs.length,
  );
  check(
    'review: custom/geo/unknown kind are all HARD errors with no repairs',
    validateObjects({ objects: [{ kind: 'custom' }] }).hardErrors.length === 1 &&
      validateObjects({ objects: [{ kind: 'box', geo: {} }] }).hardErrors.length === 1 &&
      validateObjects({ objects: [{ kind: 'banana' }] }).hardErrors.length === 1 &&
      validateObjects({ objects: [{ kind: 'banana' }] }).objects.length === 0,
  );

  const repairableReply =
    '```json\n{"objects":[{"kind":"sphere","name":"head","p":[0,1,0],"s":[0,1,1]}]}\n```';
  const accepted = parseAIResponse(repairableReply);
  check(
    'review: parse ACCEPTS a repairable reply and surfaces its repairs',
    accepted.json !== null &&
      accepted.source === 'fence-json' &&
      accepted.truncated === false &&
      accepted.repairs.length >= 1 &&
      accepted.repairs.some((r) => r.includes('s[0]')) &&
      accepted.errors.length === 0,
  );
  check(
    'review: the accepted repairable reply validates to a previewable object',
    (() => {
      const normalized = validateObjects(accepted.json);
      return (
        normalized.hardErrors.length === 0 &&
        normalized.objects.length === 1 &&
        normalized.objects[0].transform.s[0] > 0
      );
    })(),
  );

  const customReply = parseAIResponse('```json\n{"objects":[{"kind":"custom"}]}\n```');
  const geoReply = parseAIResponse(
    '```json\n{"objects":[{"kind":"box","geo":{"positions":[0,0,0]}}]}\n```',
  );
  const unknownReply = parseAIResponse('```json\n{"objects":[{"kind":"banana"}]}\n```');
  check(
    'review: custom/geo/unknown-kind replies are STILL rejected by parse',
    customReply.json === null &&
      geoReply.json === null &&
      unknownReply.json === null &&
      customReply.repairs.length === 0 &&
      geoReply.repairs.length === 0 &&
      unknownReply.repairs.length === 0,
  );

  check(
    'review: formatRepairNotice is empty with no repairs and names the count otherwise',
    formatRepairNotice([]) === '' &&
      formatRepairNotice(null) === '' &&
      formatRepairNotice(['a']).includes('one small fix') &&
      formatRepairNotice(['a', 'b']).includes('2 small fixes'),
  );

  // ---------------------------------------------------------------------------
  // M1 — budget measures the wire messages; history is windowed
  // ---------------------------------------------------------------------------
  check(
    'review: MAX_HISTORY_TURNS is a positive integer',
    Number.isInteger(MAX_HISTORY_TURNS) && MAX_HISTORY_TURNS > 0,
  );
  const longHistory = Array.from({ length: MAX_HISTORY_TURNS + 8 }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `turn ${i}`,
  }));
  const windowed = windowHistory(longHistory, MAX_HISTORY_TURNS);
  check(
    'review: windowHistory keeps exactly the most recent turns',
    windowed.length === MAX_HISTORY_TURNS &&
      windowed[windowed.length - 1].content === `turn ${longHistory.length - 1}` &&
      windowed[0].content === `turn ${longHistory.length - MAX_HISTORY_TURNS}`,
  );
  check(
    'review: windowHistory copies and tolerates bad input/limits',
    windowed !== longHistory &&
      windowHistory(longHistory, MAX_HISTORY_TURNS) !== windowHistory(longHistory, MAX_HISTORY_TURNS) &&
      windowHistory(null).length === 0 &&
      JSON.stringify(windowHistory([1, 2], NaN)) === '[1,2]',
  );

  const smallPayload = { scope: 'selected', objects: [{ kind: 'box', p: [0, 1, 0] }] };
  const fatHistory = Array.from({ length: 40 }, () => ({
    role: 'assistant',
    content: 'x'.repeat(4000),
  }));
  const wireMessages = buildMessages(
    windowHistory(fatHistory, MAX_HISTORY_TURNS),
    smallPayload,
    'go',
  );
  check(
    'review: the budget measures messages (system + history), not just the payload',
    exceedsTokenBudget(smallPayload, TOKEN_THRESHOLD) === false &&
      exceedsTokenBudget(wireMessages, TOKEN_THRESHOLD) === true &&
      estimateTokens(wireMessages) > estimateTokens(smallPayload),
  );

  // ---------------------------------------------------------------------------
  // L2 — estimateTokens is total
  // ---------------------------------------------------------------------------
  const circular = {};
  circular.self = circular;
  check(
    'review: estimateTokens guards undefined and circular input, returns 0',
    estimateTokens(undefined) === 0 &&
      estimateTokens(circular) === 0 &&
      estimateTokens({ a: 1 }) === Math.ceil(JSON.stringify({ a: 1 }).length / 4),
  );

  // ---------------------------------------------------------------------------
  // L4 — truncated is the computed value on success paths
  // ---------------------------------------------------------------------------
  const unterminatedValid = '```json\n{"objects":[{"kind":"box"}]}';
  const recovered = parseAIResponse(unterminatedValid);
  check(
    'review: a valid-but-unterminated fence reports truncated:true on success',
    recovered.json !== null &&
      recovered.source === 'fence-json' &&
      recovered.truncated === true,
  );

  // ---------------------------------------------------------------------------
  // L5 — rendered log is bounded
  // ---------------------------------------------------------------------------
  check(
    'review: MAX_LOG_NODES is a positive integer',
    Number.isInteger(MAX_LOG_NODES) && MAX_LOG_NODES > 0,
  );
}
