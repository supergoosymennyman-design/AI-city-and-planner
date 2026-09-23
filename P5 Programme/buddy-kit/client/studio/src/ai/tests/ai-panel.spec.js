/**
 * ai-panel.spec.js — pure-node coverage for `src/ui/ai-panel.js` (the panel shell).
 *
 * Discovered by `run-tests.mjs`'s `src/ai/tests/*.spec.js` block, which calls
 * `mod.default(check)` SYNCHRONOUSLY and then immediately `process.exit()`s.
 * Everything here is therefore synchronous: the panel's DOM is awkward to unit
 * test, so the task extracts every pure DECISION (the enable/disable rule, the
 * selection-count wording, the lazy-load rule, the apply/toast summaries, the
 * raw→internal object bridge) and asserts exact values here. The composed,
 * DOM-dependent flow is proven in a real browser (task-12 verification), not in
 * this suite.
 *
 * The class itself is exercised only for its public surface + source
 * guardrails: this class must NEVER reach into the scene, and the source scan
 * below (comments stripped, exactly like `ai-drag.spec.js`) is the tripwire.
 */

import { readFileSync } from 'node:fs';
import {
  AIPanel,
  formatSelectionHint,
  applyButtonState,
  shouldLoadModels,
  configHasKey,
  summarizeApply,
  formatApplyToast,
  objectsFromParsed,
} from '../../ui/ai-panel.js';

/**
 * Register this module's checks with the runner.
 * @param {(name: string, cond: boolean) => void} check the runner's PASS/FAIL counter
 */
export default function aiPanelTests(check) {
  // ---------------------------------------------------------------------------
  // formatSelectionHint — exact child-facing wording (no emoji)
  // ---------------------------------------------------------------------------
  check('ai-panel: formatSelectionHint(0) reads as "No shapes selected"', formatSelectionHint(0) === 'No shapes selected');
  check('ai-panel: formatSelectionHint(1) uses the singular', formatSelectionHint(1) === '1 shape selected');
  check('ai-panel: formatSelectionHint(2) uses the plural', formatSelectionHint(2) === '2 shapes selected');
  check('ai-panel: formatSelectionHint(5) uses the plural', formatSelectionHint(5) === '5 shapes selected');
  check('ai-panel: formatSelectionHint clamps a negative to zero', formatSelectionHint(-3) === 'No shapes selected');
  check('ai-panel: formatSelectionHint treats a non-number as zero', formatSelectionHint('nope') === 'No shapes selected' && formatSelectionHint(undefined) === 'No shapes selected');
  check('ai-panel: formatSelectionHint truncates a fractional count', formatSelectionHint(2.9) === '2 shapes selected');

  // ---------------------------------------------------------------------------
  // applyButtonState — the enable/disable rule
  // ---------------------------------------------------------------------------
  {
    const a = applyButtonState({ hasObjects: true, selectionCount: 2 });
    check('ai-panel: a result + a selection enables BOTH actions', a.replace === true && a.add === true);
  }
  {
    const a = applyButtonState({ hasObjects: true, selectionCount: 0 });
    check('ai-panel: a result with NO selection disables Replace but enables Add', a.replace === false && a.add === true);
  }
  {
    const a = applyButtonState({ hasObjects: false, selectionCount: 2 });
    check('ai-panel: an empty result set disables BOTH actions (even with a selection)', a.replace === false && a.add === false);
  }
  {
    const a = applyButtonState({ hasObjects: false, selectionCount: 0 });
    check('ai-panel: no result + no selection disables BOTH actions', a.replace === false && a.add === false);
  }
  {
    const a = applyButtonState();
    check('ai-panel: applyButtonState() defaults to both disabled', a.replace === false && a.add === false);
  }
  {
    const a = applyButtonState({ hasObjects: true, selectionCount: '3' });
    check('ai-panel: applyButtonState coerces a numeric string selection count', a.replace === true && a.add === true);
  }

  // ---------------------------------------------------------------------------
  // shouldLoadModels — lazy-load rule
  // ---------------------------------------------------------------------------
  check(
    'ai-panel: shouldLoadModels fires with a key, a trigger and no prior attempt',
    shouldLoadModels({ keyPresent: true, triggered: true, attempted: false }) === true,
  );
  check(
    'ai-panel: shouldLoadModels is one-shot (blocked after an attempt)',
    shouldLoadModels({ keyPresent: true, triggered: true, attempted: true }) === false,
  );
  check(
    'ai-panel: shouldLoadModels needs a trigger (no fetch on page load)',
    shouldLoadModels({ keyPresent: true, triggered: false, attempted: false }) === false,
  );
  check(
    'ai-panel: shouldLoadModels never fires without a key',
    shouldLoadModels({ keyPresent: false, triggered: true, attempted: false }) === false,
  );
  check('ai-panel: shouldLoadModels defaults to false when called empty', shouldLoadModels() === false);
  check(
    'ai-panel: shouldLoadModels treats an absent attempted flag as not-yet-attempted',
    shouldLoadModels({ keyPresent: true, triggered: true }) === true,
  );

  // ---------------------------------------------------------------------------
  // configHasKey
  // ---------------------------------------------------------------------------
  check('ai-panel: configHasKey accepts a non-blank key', configHasKey({ key: 'sk-abc' }) === true);
  check('ai-panel: configHasKey rejects a whitespace-only key', configHasKey({ key: '   ' }) === false);
  check('ai-panel: configHasKey rejects null / non-string keys', configHasKey({ key: 123 }) === false && configHasKey(null) === false);
  check('ai-panel: configHasKey rejects a missing key field', configHasKey({ model: 'm' }) === false);

  // ---------------------------------------------------------------------------
  // summarizeApply — {meshes, skipped} → counts
  // ---------------------------------------------------------------------------
  {
    const s = summarizeApply({ meshes: [{}, {}], skipped: [{}] });
    check('ai-panel: summarizeApply counts meshes and skipped', s.applied === 2 && s.skipped === 1);
  }
  {
    const s = summarizeApply({ applied: 3 });
    check('ai-panel: summarizeApply falls back to a numeric applied', s.applied === 3 && s.skipped === 0);
  }
  {
    const s = summarizeApply({ meshes: [], skipped: [{}, {}, {}] });
    check('ai-panel: summarizeApply reports a fully-skipped result as 0 applied', s.applied === 0 && s.skipped === 3);
  }
  {
    const s = summarizeApply(undefined);
    check('ai-panel: summarizeApply tolerates an undefined callback result', s.applied === 0 && s.skipped === 0);
  }
  {
    const s = summarizeApply({ meshes: 'nope', skipped: 'nope' });
    check('ai-panel: summarizeApply ignores non-array mesh/skipped values', s.applied === 0 && s.skipped === 0);
  }

  // ---------------------------------------------------------------------------
  // formatApplyToast — exact strings
  // ---------------------------------------------------------------------------
  check('ai-panel: apply toast (add) reads "Added 3 shapes."', formatApplyToast('add', 3, 0) === 'Added 3 shapes.');
  check('ai-panel: apply toast (add) uses the singular', formatApplyToast('add', 1, 0) === 'Added 1 shape.');
  check('ai-panel: apply toast (replace) reads "Replaced with 2 shapes."', formatApplyToast('replace', 2, 0) === 'Replaced with 2 shapes.');
  check(
    'ai-panel: apply toast reports skipped shapes as a second sentence',
    formatApplyToast('add', 2, 1) === 'Added 2 shapes. 1 shape could not be built.',
  );
  check(
    'ai-panel: apply toast reports an all-skipped add without blocking',
    formatApplyToast('add', 0, 2) === 'Nothing was added. 2 shapes could not be built.',
  );
  check('ai-panel: apply toast for an empty replace reads "Nothing was replaced."', formatApplyToast('replace', 0, 0) === 'Nothing was replaced.');
  check(
    'ai-panel: apply toast pluralises the skipped count',
    formatApplyToast('add', 1, 2) === 'Added 1 shape. 2 shapes could not be built.',
  );

  // ---------------------------------------------------------------------------
  // objectsFromParsed — the raw (flat) → internal bridge
  // ---------------------------------------------------------------------------
  {
    const parsed = {
      json: {
        summary: 'x',
        objects: [{ kind: 'box', name: 'h', color: '#ff6b6b', p: [0, 1.2, 0], r: [0, 0, 0], s: [1, 1, 1] }],
      },
    };
    const objs = objectsFromParsed(parsed);
    check(
      'ai-panel: objectsFromParsed normalizes the flat LLM object to the internal schema',
      objs.length === 1 &&
        objs[0].kind === 'box' &&
        objs[0].name === 'h' &&
        objs[0].color === 16739179 &&
        Array.isArray(objs[0].transform.p) &&
        objs[0].transform.p[0] === 0 &&
        objs[0].transform.p[1] === 1.2 &&
        objs[0].transform.p[2] === 0 &&
        objs[0].transform.s[0] === 1 &&
        objs[0].id === null &&
        objs[0].imported === false,
    );
  }
  {
    const objs = objectsFromParsed({ json: { objects: [{ kind: 'custom' }] } });
    check('ai-panel: objectsFromParsed drops an unsupported kind', objs.length === 0);
  }
  check('ai-panel: objectsFromParsed([]) returns an empty array', objectsFromParsed({ json: { objects: [] } }).length === 0);
  check('ai-panel: objectsFromParsed(null) returns an empty array', objectsFromParsed(null).length === 0);
  check('ai-panel: objectsFromParsed({}) returns an empty array', objectsFromParsed({}).length === 0);
  {
    const parsed = {
      json: {
        objects: [
          { kind: 'box', p: [0, 0, 0] },
          { kind: 'sphere', p: [0, 1, 0] },
        ],
      },
    };
    const objs = objectsFromParsed(parsed);
    check(
      'ai-panel: objectsFromParsed preserves object order and count',
      objs.length === 2 && objs[0].kind === 'box' && objs[1].kind === 'sphere',
    );
  }

  // ---------------------------------------------------------------------------
  // Class public surface
  // ---------------------------------------------------------------------------
  check(
    'ai-panel: AIPanel is a class exposing the documented public methods',
    typeof AIPanel === 'function' &&
      ['open', 'close', 'destroy', 'isOpen', 'showResult', 'getObjects', 'applyAddFromPreview', 'detachDrag'].every(
        (m) => typeof AIPanel.prototype[m] === 'function',
      ),
  );

  // ---------------------------------------------------------------------------
  // Source guardrails — this class never mutates the scene, never auto-applies
  // ---------------------------------------------------------------------------
  {
    const src = readFileSync(new URL('../../ui/ai-panel.js', import.meta.url), 'utf8');
    // Comments legitimately NAME what is forbidden (to explain the design), so
    // assert on the code only.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    check(
      'ai-panel: never calls studio.addPrimitive / studio.remove (callbacks own mutation)',
      !/studio\.(addPrimitive|remove|pushUndo|duplicate|select|setSelection)\s*\(/.test(code),
    );
    check(
      'ai-panel: never imports insert.js or scene.js directly',
      !/from\s+['"][^'"]*\/insert\.js['"]/.test(code) && !/from\s+['"][^'"]*\/scene\.js['"]/.test(code),
    );
    check(
      'ai-panel: disposes neither the preview nor a WebGL context (destroy() stays reopenable)',
      !/preview\.dispose\s*\(/.test(code) && !/forceContextLoss/.test(code),
    );
    check(
      'ai-panel: wires the drag through attachPreviewDrag',
      /attachPreviewDrag\s*\(/.test(code) && /detach\s*\(/.test(code),
    );
  }
}
