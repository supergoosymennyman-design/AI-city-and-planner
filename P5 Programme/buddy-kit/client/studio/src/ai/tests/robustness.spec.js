/**
 * robustness.spec.js — pure-node coverage for the task-14 hardening guards.
 *
 * Discovered by `run-tests.mjs`'s `src/ai/tests/*.spec.js` block and replayed
 * synchronously, so every helper here is DOM-free and network-free.
 *
 * What is covered:
 *   - schema rejection messages: the offending kind is named AND the allowed
 *     kinds are listed; `custom`/`geo` both say "only primitive shapes".
 *   - parse truncation: an unterminated fence is flagged and its failure message
 *     tells the user to ask for a shorter result (and still names the JSON
 *     problem so the existing phrasing contract holds).
 *   - parse empty `objects`: a friendly "nothing to preview" message.
 *   - the full-geometry size warning (`geometryWarning`/`geometrySummary`).
 *   - the preview render cap (`capPreviewObjects`) and its visible notice.
 */
import { validateObjects, AI_SHAPE_KINDS } from '../schema.js';
import { parseAIResponse, explainParseFailure } from '../parse.js';
import {
  GEO_VERTEX_WARN,
  geometrySummary,
  geometryWarning,
} from '../../ui/ai-chat.js';
import {
  PREVIEW_MAX_OBJECTS,
  capPreviewObjects,
} from '../../ui/ai-preview.js';
import { formatPreviewCapNotice } from '../../ui/ai-panel.js';

/**
 * Register this module's checks with the runner.
 * @param {(name: string, cond: boolean) => void} check the runner's PASS/FAIL counter
 * @returns {void}
 */
export default function robustnessTests(check) {
  // ---------------------------------------------------------------------------
  // schema — rejection messages are specific and actionable
  // ---------------------------------------------------------------------------
  {
    const unknown = validateObjects({ objects: [{ kind: 'banana' }] });
    const joined = unknown.errors.join(' | ');
    check(
      'robustness: unknown kind is named and every allowed kind is listed',
      unknown.ok === false &&
        joined.includes("'banana'") &&
        joined.includes('allowed kinds:') &&
        AI_SHAPE_KINDS.every((k) => joined.includes(k)),
    );
  }
  {
    const custom = validateObjects({ objects: [{ kind: 'custom' }] });
    const geo = validateObjects({ objects: [{ kind: 'box', geo: {} }] });
    check(
      'robustness: custom and geo are rejected with the "only primitive shapes" message',
      custom.ok === false &&
        custom.errors.some((e) => e.includes('only primitive shapes')) &&
        geo.ok === false &&
        geo.errors.some((e) => e.includes('only primitive shapes')),
    );
  }

  // ---------------------------------------------------------------------------
  // parse — empty objects array gets a friendly "nothing" message
  // ---------------------------------------------------------------------------
  {
    const empty = parseAIResponse('```json\n{"objects":[]}\n```');
    const msg = explainParseFailure(empty);
    check(
      'robustness: an empty objects array explains there is nothing to preview',
      empty.json === null &&
        empty.truncated === false &&
        msg.includes('nothing') &&
        !msg.includes('unknown kind'),
    );
  }

  // ---------------------------------------------------------------------------
  // parse — truncated (unterminated) reply is detected and actionable
  // ---------------------------------------------------------------------------
  {
    const truncated = parseAIResponse(
      'Here is the start:\n```json\n{"objects":[{"kind":"box"',
    );
    const msg = explainParseFailure(truncated);
    check(
      'robustness: an unterminated fence is flagged as truncated without throwing',
      truncated.json === null && truncated.truncated === true,
    );
    check(
      'robustness: a truncated reply tells the user to ask for a shorter result',
      msg.includes('not valid JSON') &&
        msg.includes('incomplete') &&
        msg.includes('shorter result'),
    );
  }
  {
    const complete = parseAIResponse('Oops:\n```json\n{oops\n```');
    check(
      'robustness: a complete-but-invalid fence is NOT reported as truncated',
      complete.json === null &&
        complete.truncated === false &&
        !explainParseFailure(complete).includes('shorter result'),
    );
  }

  // ---------------------------------------------------------------------------
  // parse — unknown kind surfaces through explainParseFailure with the whitelist
  // ---------------------------------------------------------------------------
  {
    const bad = parseAIResponse('```json\n{"objects":[{"kind":"banana"}]}\n```');
    const msg = explainParseFailure(bad);
    check(
      'robustness: a bad kind fails with the kind named and the allowed kinds listed',
      bad.json === null && msg.includes('banana') && msg.includes('allowed kinds:'),
    );
  }

  // ---------------------------------------------------------------------------
  // ai-chat — full-geometry size warning
  // ---------------------------------------------------------------------------
  {
    const plain = { objects: [{ kind: 'box', transform: { p: [0, 0, 0] } }] };
    const sculpted = {
      objects: [
        { kind: 'box', geo: { vertexCount: 4000, boundingBox: null } },
        { kind: 'sphere', geo: { positions: new Array(9000).fill(0) } },
      ],
    };
    const summary = geometrySummary(sculpted);
    check(
      'robustness: geometrySummary only counts raw positions, not the bounding-box summary',
      summary.shapesWithGeo === 1 && summary.vertexCount === 3000,
    );
    check(
      'robustness: geometryWarning is silent without raw geometry and names the count with it',
      geometryWarning(plain) === '' &&
        geometryWarning(sculpted, GEO_VERTEX_WARN).includes('3,000') &&
        geometryWarning(sculpted, GEO_VERTEX_WARN).includes('1 shape'),
    );
    check(
      'robustness: geometryWarning falls back to the default limit for a non-finite value',
      geometryWarning(
        { objects: [{ geo: { positions: new Array(GEO_VERTEX_WARN * 3).fill(0) } }] },
        NaN,
      ) !== '',
    );
  }

  // ---------------------------------------------------------------------------
  // ai-preview — preview render cap
  // ---------------------------------------------------------------------------
  {
    const many = new Array(300).fill(null).map((_, i) => ({ kind: 'box', name: `b${i}` }));
    const capped = capPreviewObjects(many);
    check(
      'robustness: capPreviewObjects renders at most PREVIEW_MAX_OBJECTS and reports the total',
      capped.shown.length === PREVIEW_MAX_OBJECTS &&
        capped.total === 300 &&
        capped.capped === true,
    );
    const small = capPreviewObjects(many.slice(0, 3));
    check(
      'robustness: capPreviewObjects leaves a small set untouched and uncapped',
      small.shown.length === 3 && small.total === 3 && small.capped === false,
    );
    check(
      'robustness: capPreviewObjects tolerates non-arrays and a bad limit',
      capPreviewObjects(null).total === 0 &&
        capPreviewObjects(many, 0).shown.length === PREVIEW_MAX_OBJECTS &&
        capPreviewObjects(many, -5).capped === true,
    );
  }

  // ---------------------------------------------------------------------------
  // ai-panel — the cap notice is visible, never silent
  // ---------------------------------------------------------------------------
  check(
    'robustness: formatPreviewCapNotice names shown and total, and is empty when uncapped',
    formatPreviewCapNotice(300, 150) ===
      'The preview shows the first 150 of 300 shapes. All 300 will still be applied.' &&
      formatPreviewCapNotice(3, 3) === '' &&
      formatPreviewCapNotice(0, 0) === '',
  );
}
