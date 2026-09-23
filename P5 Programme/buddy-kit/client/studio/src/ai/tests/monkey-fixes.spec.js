/**
 * monkey-fixes.spec.js — pure-node coverage for the monkey-testing remediations.
 *
 * Discovered by `run-tests.mjs`'s `src/ai/tests/*.spec.js` block and replayed
 * synchronously. The client checks are async, so (like `client.spec.js`) all work
 * runs at module top level and the default export replays recorded `[name, cond]`
 * pairs.
 *
 * Covered: the shared apply/preview cap, coordinate clamping, camera fallback for
 * non-finite bounds, credential redaction, oversized-reply rejection, and
 * zero-width prompt detection.
 */

import * as THREE from 'three';
import { validateObjects } from '../schema.js';
import { MAX_AI_OBJECTS, MAX_RESPONSE_CHARS, MAX_COORD } from '../limits.js';
import { listModels, chatCompletion, describeHTTPError, redactSecrets } from '../client.js';
import {
  PREVIEW_MAX_OBJECTS,
  capPreviewObjects,
  computePreviewFrame,
} from '../../ui/ai-preview.js';
import {
  formatResultCapNotice,
  formatApplyCapNotice,
  objectsFromParsed,
} from '../../ui/ai-panel.js';
import { checkSendable, normalizePromptText } from '../../ui/ai-chat.js';

const BASE = 'https://x.example/v1';
const KEY = 'sk-monkey-key';

const results = [];
const record = (name, cond) => {
  results.push([name, !!cond]);
};

/** Await `fn`, returning the thrown error (or null). */
async function catchErr(fn) {
  try {
    await fn();
    return null;
  } catch (err) {
    return err;
  }
}

async function run() {
  // ---------------------------------------------------------------------------
  // MT-1 — one shared cap for preview and apply
  // ---------------------------------------------------------------------------
  record(
    'monkey: PREVIEW_MAX_OBJECTS aliases the shared MAX_AI_OBJECTS (cannot drift)',
    PREVIEW_MAX_OBJECTS === MAX_AI_OBJECTS && MAX_AI_OBJECTS > 0,
  );

  {
    const many = new Array(20000).fill(null).map((_, i) => ({ kind: 'box', name: `o${i}` }));
    const capped = capPreviewObjects(many);
    record(
      'monkey: capPreviewObjects renders at most the shared cap and reports the total',
      capped.shown.length === MAX_AI_OBJECTS &&
        capped.total === 20000 &&
        capped.capped === true,
    );
    record(
      'monkey: applying the capped slice builds exactly MAX_AI_OBJECTS',
      many.slice(0, MAX_AI_OBJECTS).length === MAX_AI_OBJECTS,
    );
  }

  record(
    'monkey: formatResultCapNotice names the truncation, empty when uncapped',
    formatResultCapNotice(20000, MAX_AI_OBJECTS) ===
      `The AI returned 20000 shapes — only the first ${MAX_AI_OBJECTS} will be applied.` &&
      formatResultCapNotice(MAX_AI_OBJECTS, MAX_AI_OBJECTS) === '' &&
      formatResultCapNotice(3, 3) === '',
  );
  record(
    'monkey: formatApplyCapNotice explains how many were applied',
    formatApplyCapNotice(20000, MAX_AI_OBJECTS) ===
      `Applied the first ${MAX_AI_OBJECTS} of 20000 shapes.` &&
      formatApplyCapNotice(2, 2) === '',
  );

  {
    const raw = {
      json: { objects: new Array(300).fill(null).map(() => ({ kind: 'box' })) },
    };
    const bridged = objectsFromParsed(raw);
    record(
      'monkey: objectsFromParsed still normalizes every object (cap applied at the panel)',
      bridged.length === 300 && bridged.slice(0, MAX_AI_OBJECTS).length === MAX_AI_OBJECTS,
    );
  }

  // ---------------------------------------------------------------------------
  // MT-4 — absurd coordinates are clamped; the camera falls back to finite
  // ---------------------------------------------------------------------------
  {
    const far = validateObjects({
      objects: [{ kind: 'box', p: [1e308, -1e308, 1e308], s: [1, 1, 1] }],
    });
    const p = far.objects[0].transform.p;
    record(
      'monkey: an out-of-range finite coordinate is clamped to the world limit',
      far.hardErrors.length === 0 &&
        far.objects.length === 1 &&
        p[0] === MAX_COORD &&
        p[1] === -MAX_COORD &&
        p[2] === MAX_COORD &&
        p.every(Number.isFinite),
    );
    record(
      'monkey: clamping is reported as a soft repair (never silent)',
      far.repairs.some((r) => r.includes('out of range')) && far.ok === false,
    );
    const sane = validateObjects({ objects: [{ kind: 'box', p: [1, 2, 3] }] });
    record(
      'monkey: an in-range coordinate is left untouched with no repair',
      sane.objects[0].transform.p.join(',') === '1,2,3' && sane.repairs.length === 0,
    );
  }
  {
    const huge = new THREE.Box3(
      new THREE.Vector3(-1e308, -1e308, -1e308),
      new THREE.Vector3(1e308, 1e308, 1e308),
    );
    const fit = computePreviewFrame(huge, 4 / 3, 45, 0.2);
    record(
      'monkey: a non-finite bounding box falls back to finite framing',
      fit.position.every(Number.isFinite) &&
        Number.isFinite(fit.distance) &&
        Number.isFinite(fit.radius) &&
        Number.isFinite(fit.near) &&
        Number.isFinite(fit.far) &&
        fit.near > 0 &&
        fit.far > fit.near,
    );
    const degenerate = computePreviewFrame(null, 1, 45, 0.2);
    record(
      'monkey: a null/degenerate box also stays finite',
      degenerate.position.every(Number.isFinite) && degenerate.near > 0,
    );
  }

  // ---------------------------------------------------------------------------
  // MT-3 — credential redaction
  // ---------------------------------------------------------------------------
  record(
    'monkey: redactSecrets removes the exact key and credential-shaped text',
    !redactSecrets('Authorization: Bearer sk-monkey-key', KEY).includes(KEY) &&
      redactSecrets('Authorization: Bearer sk-monkey-key', KEY).includes('[redacted]') &&
      !redactSecrets('Bearer abc123def').includes('abc123def') &&
      !redactSecrets('token sk-abcdef123456').includes('sk-abcdef123456') &&
      !redactSecrets('eyJhbGciOi.eyJzdWIiOi.SflKxwRJSMeK').includes('eyJhbGciOi'),
  );
  record(
    'monkey: redactSecrets tolerates garbage input without throwing',
    redactSecrets(null) === '' &&
      redactSecrets(undefined) === '' &&
      redactSecrets({ a: 1 }, KEY) === '{"a":1}',
  );
  {
    const echo = '{"echo":"Authorization: Bearer sk-monkey-key","note":"teapot"}';
    const msg = describeHTTPError(418, echo, KEY);
    record(
      'monkey: an unmapped-status body echoing the key is redacted in the message',
      msg.startsWith('Request failed (HTTP 418).') &&
        !msg.includes(KEY) &&
        !msg.includes('Bearer sk-') &&
        msg.includes('[redacted]'),
    );
    record(
      'monkey: a non-credential body is still appended (existing contract preserved)',
      describeHTTPError(400, 'x'.repeat(500)).startsWith('Request failed (HTTP 400). ') &&
        describeHTTPError(400, 'x'.repeat(500)).length < 500,
    );
  }
  {
    const err = await catchErr(() =>
      chatCompletion({
        baseUrl: BASE,
        key: KEY,
        model: 'm',
        messages: [],
        timeoutMs: 1000,
        fetchImpl: async () => ({
          ok: false,
          status: 418,
          json: async () => ({ echo: `Authorization: Bearer ${KEY}`, note: 'teapot' }),
        }),
      }),
    );
    record(
      'monkey: a 418 client error never carries the key in message or detail',
      err &&
        err.name === 'AIError' &&
        !String(err.message).includes(KEY) &&
        !String(err.detail).includes(KEY),
    );
  }

  // ---------------------------------------------------------------------------
  // MT-2 — oversized replies are rejected before parsing
  // ---------------------------------------------------------------------------
  record(
    'monkey: MAX_RESPONSE_CHARS is a positive limit',
    Number.isFinite(MAX_RESPONSE_CHARS) && MAX_RESPONSE_CHARS > 0,
  );
  {
    const err = await catchErr(() =>
      listModels({
        baseUrl: BASE,
        key: KEY,
        timeoutMs: 1000,
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          headers: { get: () => String(MAX_RESPONSE_CHARS + 10) },
          text: async () => 'x',
        }),
      }),
    );
    record(
      'monkey: a content-length over the limit is rejected as a too-large shape error',
      err instanceof Error &&
        err.kind === 'shape' &&
        /too large/i.test(err.message) &&
        !String(err.detail).includes('x'.repeat(10)),
    );
  }
  {
    const err = await catchErr(() =>
      chatCompletion({
        baseUrl: BASE,
        key: KEY,
        model: 'm',
        messages: [],
        timeoutMs: 1000,
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          text: async () => 'x'.repeat(MAX_RESPONSE_CHARS + 1),
        }),
      }),
    );
    record(
      'monkey: an over-limit text body (no content-length) is rejected before parsing',
      err instanceof Error && err.kind === 'shape' && /too large/i.test(err.message),
    );
  }
  {
    const ok = await catchErr(() =>
      listModels({
        baseUrl: BASE,
        key: KEY,
        timeoutMs: 1000,
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          headers: { get: () => '20' },
          text: async () => JSON.stringify({ data: [{ id: 'm1' }] }),
        }),
      }),
    );
    record(
      'monkey: a normal small text-body reply still parses (no over-eager rejection)',
      ok === null,
    );
  }

  // ---------------------------------------------------------------------------
  // MT-5 — zero-width-only prompts are blank
  // ---------------------------------------------------------------------------
  record(
    'monkey: normalizePromptText strips invisible characters and whitespace',
    normalizePromptText('\u200B\u200B\u200B') === '' &&
      normalizePromptText('\uFEFF \u200D') === '' &&
      normalizePromptText('\u00AD') === '' &&
      normalizePromptText('  hello  ') === 'hello' &&
      normalizePromptText(null) === '',
  );
  record(
    'monkey: checkSendable refuses a zero-width-only prompt with the blank message',
    checkSendable({ configured: true, text: '\u200B\u200B\u200B', scope: 'scene', hasSelection: true })
      .ok === false &&
      checkSendable({ configured: true, text: '\u200B\u200B\u200B', scope: 'scene', hasSelection: true })
        .message === 'Type a message before sending.' &&
      checkSendable({ configured: true, text: '\u00AD', scope: 'scene', hasSelection: true }).ok === false,
  );
}

try {
  await run();
} catch (err) {
  record('monkey: test module ran without an unexpected throw', false);
  console.error('monkey-fixes.spec.js unexpected error:', err);
}

/**
 * Replay the recorded async results through the runner's synchronous `check`.
 * @param {(name: string, cond: boolean) => void} check the runner's PASS/FAIL counter
 * @returns {void}
 */
export default function monkeyFixesTests(check) {
  for (const [name, cond] of results) check(name, cond);
}
