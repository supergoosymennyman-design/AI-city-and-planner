/**
 * ai-controls.spec.js — pure-Node coverage for the AI panel controls
 * (`src/ui/ai-controls.js`).
 *
 * Discovered by `run-tests.mjs`'s `src/ai/tests/*.spec.js` block, which calls
 * `mod.default(check)` SYNCHRONOUSLY and then immediately `process.exit()`s. The
 * helpers under test are all synchronous, so no top-level-await replay dance is
 * needed here (unlike `client.spec.js`). Everything asserted is DOM-free: the
 * `AIControls` class is only inspected, never constructed — constructing it
 * needs a real document, and the browser check covers that path instead.
 *
 * Assertions are EXACT values, not truthiness: `check(name, cond)` only counts,
 * so a loose check would silently pass a regression.
 */

import {
  AI_SCOPES,
  KEY_STORAGE_HINT,
  AIControls,
  asAIError,
  normalizeConfig,
  normalizeScope,
  pickModel,
} from '../../ui/ai-controls.js';
import { AI_DEFAULTS } from '../config.js';
import { AIError } from '../client.js';

/**
 * Run the synchronous checks.
 * @param {(name: string, cond: boolean) => void} check the runner's PASS/FAIL counter
 */
export default function aiControlsTests(check) {
  // ---------------------------------------------------------------------------
  // normalizeScope — only the literal 'scene' is accepted as scene
  // ---------------------------------------------------------------------------
  check(
    'ai-controls: AI_SCOPES is exactly [selected, scene]',
    AI_SCOPES.length === 2 && AI_SCOPES[0] === 'selected' && AI_SCOPES[1] === 'scene',
  );
  check(
    'ai-controls: normalizeScope accepts the two valid literals',
    normalizeScope('selected') === 'selected' && normalizeScope('scene') === 'scene',
  );
  check(
    'ai-controls: normalizeScope falls back to selected for junk',
    normalizeScope('SCENE') === 'selected' &&
      normalizeScope(undefined) === 'selected' &&
      normalizeScope(null) === 'selected' &&
      normalizeScope(5) === 'selected' &&
      normalizeScope({}) === 'selected' &&
      normalizeScope('') === 'selected',
  );

  // ---------------------------------------------------------------------------
  // normalizeConfig — trimming, typing, forward-compat
  // ---------------------------------------------------------------------------
  {
    const cfg = normalizeConfig({
      baseUrl: '  https://host/v1  ',
      key: '  sk-abc  ',
      model: '  gemini-x  ',
      scope: 'scene',
      includeGeo: true,
      temperature: 0.9,
    });
    check(
      'ai-controls: normalizeConfig trims the string fields',
      cfg.baseUrl === 'https://host/v1' && cfg.key === 'sk-abc' && cfg.model === 'gemini-x',
    );
    check(
      'ai-controls: normalizeConfig passes through scope/includeGeo/temperature',
      cfg.scope === 'scene' && cfg.includeGeo === true && cfg.temperature === 0.9,
    );
  }
  {
    const cfg = normalizeConfig({
      baseUrl: 42,
      key: null,
      model: undefined,
      scope: 'nope',
      includeGeo: 1,
      temperature: 'hot',
    });
    check(
      'ai-controls: normalizeConfig coerces non-strings to empty strings',
      cfg.baseUrl === '' && cfg.key === '' && cfg.model === '',
    );
    check(
      'ai-controls: normalizeConfig is strict about includeGeo (1 is not true)',
      cfg.includeGeo === false,
    );
    check(
      'ai-controls: normalizeConfig falls back to the default temperature',
      cfg.temperature === AI_DEFAULTS.temperature,
    );
  }
  {
    const cfg = normalizeConfig({ futureField: 'kept', baseUrl: 'x' });
    check(
      'ai-controls: normalizeConfig preserves unknown keys (forward compatible)',
      cfg.futureField === 'kept' && cfg.baseUrl === 'x',
    );
  }
  {
    const cfg = normalizeConfig(undefined);
    check(
      'ai-controls: normalizeConfig of undefined yields the defaults shape',
      cfg.baseUrl === '' && cfg.key === '' && cfg.model === '' && cfg.scope === 'selected' &&
        cfg.includeGeo === false && cfg.temperature === AI_DEFAULTS.temperature,
    );
  }
  {
    const cfg = normalizeConfig(['not', 'an', 'object']);
    check(
      'ai-controls: normalizeConfig ignores an array input',
      cfg.baseUrl === '' && cfg.scope === 'selected',
    );
  }

  // ---------------------------------------------------------------------------
  // pickModel — saved-if-available, else first, else nothing
  // ---------------------------------------------------------------------------
  check(
    'ai-controls: pickModel keeps a saved model that is still offered',
    pickModel(['alpha', 'beta', 'gamma'], 'beta') === 'beta',
  );
  check(
    'ai-controls: pickModel falls back to the first id when the saved model is gone',
    pickModel(['alpha', 'beta'], 'zzz') === 'alpha',
  );
  check(
    'ai-controls: pickModel falls back to the first id when nothing is saved',
    pickModel(['alpha', 'beta'], '') === 'alpha',
  );
  check(
    'ai-controls: pickModel returns empty for an empty list',
    pickModel([], 'alpha') === '' && pickModel(null, 'alpha') === '' && pickModel(undefined, undefined) === '',
  );
  check(
    'ai-controls: pickModel does not mutate the input list',
    (() => {
      const ids = ['a', 'b'];
      pickModel(ids, 'b');
      return ids.length === 2 && ids[0] === 'a' && ids[1] === 'b';
    })(),
  );

  // ---------------------------------------------------------------------------
  // asAIError — always a typed error; never leaks error text into detail
  // ---------------------------------------------------------------------------
  {
    const original = new AIError('boom', { kind: 'auth', status: 401 });
    check(
      'ai-controls: asAIError passes a real AIError through unchanged',
      asAIError(original) === original,
    );
  }
  {
    const wrapped = asAIError(new TypeError('Failed to fetch'));
    check(
      'ai-controls: asAIError wraps a TypeError as a network-kind AIError',
      wrapped instanceof AIError && wrapped.kind === 'network' && wrapped.status === undefined,
    );
    check(
      'ai-controls: asAIError keeps the error name (not the message) as detail',
      wrapped.detail === 'unexpected: TypeError',
    );
  }
  {
    const secret = 'sk-do-not-leak-me';
    const wrapped = asAIError(new Error(`request failed for key ${secret}`));
    check(
      'ai-controls: asAIError never embeds raw error text (key cannot leak)',
      wrapped instanceof AIError &&
        typeof wrapped.detail === 'string' &&
        !wrapped.detail.includes(secret) &&
        !String(wrapped.message).includes(secret),
    );
  }
  {
    const wrapped = asAIError('a bare string');
    check(
      'ai-controls: asAIError handles a non-Error throw',
      wrapped instanceof AIError && wrapped.kind === 'network' && wrapped.detail === 'unexpected: UnknownError',
    );
  }

  // ---------------------------------------------------------------------------
  // Class surface — the public methods the panel composes
  // ---------------------------------------------------------------------------
  check('ai-controls: AIControls is a class constructor', typeof AIControls === 'function');
  check(
    'ai-controls: AIControls exposes the public API',
    typeof AIControls.prototype.refreshModels === 'function' &&
      typeof AIControls.prototype.setBusy === 'function' &&
      typeof AIControls.prototype.getConfig === 'function' &&
      typeof AIControls.prototype.getModels === 'function' &&
      typeof AIControls.prototype.setCollapsed === 'function' &&
      typeof AIControls.prototype.isCollapsed === 'function',
  );
  check(
    'ai-controls: the key hint copy mentions this browser only',
    KEY_STORAGE_HINT === 'The key is stored only in this browser.',
  );
}
