/**
 * ai-controls.js — the AI panel's model / context / settings control cluster.
 *
 * This is the "form" half of the AI panel: it OWNS six existing elements from
 * `index.html` (added by task 7) and nothing else:
 *
 *   - `#ai-model-select`     the model dropdown
 *   - `#ai-refresh-models`   the "load models" button
 *   - `#ai-scope-toggle`     context scope ('selected' | 'scene')
 *   - `#ai-geo-toggle`       whether full geometry is sent
 *   - `#ai-base-url`         the endpoint root
 *   - `#ai-key`              the API key (a masked `<input type="password">`)
 *
 * plus the `#ai-settings` disclosure (native `<details>`) and the
 * `#ai-collapse` / `#ai-body` panel fold. The chat log, prompt and preview are
 * someone else's job (tasks 11/8); this class only reads/writes settings.
 *
 * Persistence: every field edit is written through `saveAIConfig()` (task 3),
 * so the model, key, scope and geometry flag all survive a page reload. The key
 * is a secret: it is only ever read from / written to the masked input and
 * `localStorage` — it is NEVER logged, never used as an accessible label, and
 * never put into the DOM as visible text.
 *
 * Async policy — NO fetch on page load. `refreshModels()` exists but the class
 * does NOT call it in the constructor: hitting the network on startup would
 * slow a children's app down for a control most sessions never use. The panel
 * (task 12) decides when to load (first panel open or first Refresh click).
 * The only wire-up here is the Refresh button, which calls `refreshModels()`.
 *
 * Pure ESM. Only DOM-touching code lives inside the class methods, so this
 * module still imports cleanly in plain Node for the helper tests
 * (`src/ai/tests/ai-controls.spec.js`).
 */

import { listModels, AIError } from '../ai/client.js';
import { AI_DEFAULTS, loadAIConfig, saveAIConfig } from '../ai/config.js';

/**
 * The valid values of the context-scope control.
 * @type {ReadonlyArray<string>}
 */
export const AI_SCOPES = Object.freeze(['selected', 'scene']);

/** Inline hint shown under the key field. Also lives in `index.html`; this is the
 * fallback copy when the markup does not already provide one. */
export const KEY_STORAGE_HINT = 'The key is stored only in this browser.';

/**
 * Coerce any stored value to a valid scope.
 *
 * What: the ONLY way to obtain a scope from an untrusted value (stored config,
 * DOM select). Why: a corrupt/forward-version localStorage entry must never put
 * the client into an unknown scope, so anything other than the literal 'scene'
 * falls back to 'selected'.
 * @param {unknown} value candidate scope
 * @returns {'selected'|'scene'} a valid scope
 */
export function normalizeScope(value) {
  return value === 'scene' ? 'scene' : 'selected';
}

/**
 * Normalize a settings object into the exact typed shape the controls work with.
 *
 * What: trims the three string fields, resolves the scope, coerces the geometry
 * flag to a strict boolean, and fills in a finite temperature.
 * Why: `loadAIConfig()` is forward-compatible by design (it preserves arbitrary
 * keys and trusts stored types), so the UI needs one place that makes the values
 * safe to render and to send. Unknown keys are preserved (spread first) so a
 * future writer's settings survive a round-trip through this control.
 *
 * @param {object} [raw] settings, typically from `loadAIConfig()`
 * @returns {{baseUrl: string, key: string, model: string, scope: 'selected'|'scene', includeGeo: boolean, temperature: number}} normalized copy
 */
export function normalizeConfig(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    ...src,
    baseUrl: typeof src.baseUrl === 'string' ? src.baseUrl.trim() : '',
    key: typeof src.key === 'string' ? src.key.trim() : '',
    model: typeof src.model === 'string' ? src.model.trim() : '',
    scope: normalizeScope(src.scope),
    includeGeo: src.includeGeo === true,
    temperature: Number.isFinite(src.temperature) ? src.temperature : AI_DEFAULTS.temperature,
  };
}

/**
 * Choose which model id the dropdown should show after a successful refresh.
 *
 * What: the saved model when the endpoint still offers it, otherwise the first
 * id, otherwise the empty string (an empty list selects nothing).
 * Why: a user's saved choice must not be silently replaced by whatever the
 * server sorts first, but a model that has disappeared must not leave the
 * dropdown pointing at a stale id.
 *
 * @param {unknown} ids model ids returned by `listModels`
 * @param {unknown} savedModel previously persisted model id
 * @returns {string} the id to select (may be the empty string)
 */
export function pickModel(ids, savedModel) {
  const list = Array.isArray(ids) ? ids : [];
  const saved = typeof savedModel === 'string' ? savedModel : '';
  if (saved && list.includes(saved)) return saved;
  return list.length > 0 ? list[0] : '';
}

/**
 * Guarantee a typed {@link AIError} for anything the refresh path throws.
 *
 * What: passes an existing `AIError` through untouched; wraps anything else in a
 * `network`-kind `AIError` whose `detail` is the error's NAME only.
 * Why: the panel branches on `err.kind`, and a stray `TypeError` from a broken
 * injection must not escape as a non-AIError. The `detail` deliberately omits
 * `err.message`: message text is attacker/endpoint-influenced and the API key
 * must never be able to leak into an error stream through it.
 *
 * @param {unknown} err the caught value
 * @returns {AIError} a typed error safe to hand to `onError`
 */
export function asAIError(err) {
  if (err instanceof AIError) return err;
  const name = err && typeof err.name === 'string' && err.name ? err.name : 'UnknownError';
  return new AIError('Could not reach the AI service. Check the connection and try again.', {
    kind: 'network',
    detail: `unexpected: ${name}`,
  });
}

/**
 * The AI panel's settings control cluster.
 *
 * Owns the model dropdown + refresh button, the scope/geo controls and the
 * endpoint/key fields, persists every edit via `saveAIConfig()`, and reports
 * changes / failures through the injected callbacks. It does not fetch on
 * construction (see the module note) and it never calls `alert()`.
 */
export class AIControls {
  /**
   * @param {HTMLElement|Document} root element containing the AI section (used to
   *   scope the id lookups; falls back to `document.getElementById`)
   * @param {object} [options]
   * @param {object} [options.config] initial settings; defaults to `loadAIConfig()`
   * @param {(config: object) => void} [options.onChange] called with the current
   *   config after every successful field save
   * @param {(err: AIError) => void} [options.onError] called with a typed error
   *   on every failed model load
   */
  constructor(root, { config, onChange, onError } = {}) {
    this.root = root || (typeof document !== 'undefined' ? document : null);
    this.onChange = typeof onChange === 'function' ? onChange : () => {};
    this.onError = typeof onError === 'function' ? onError : () => {};

    const base = loadAIConfig();
    const overrides = config && typeof config === 'object' && !Array.isArray(config) ? config : {};
    /** @type {ReturnType<typeof normalizeConfig>} current (persisted) settings. */
    this._config = normalizeConfig({ ...base, ...overrides });

    /** Session cache of the last fetched model ids. @type {string[]} */
    this._models = [];
    /** Chat-request busy flag owned by `setBusy()`. @private */
    this._busy = false;
    /** Model-list fetch in flight. @private */
    this._fetching = false;
    /** The in-flight `refreshModels()` promise (de-dupes double clicks). @private */
    this._fetchPromise = null;

    this.modelSelect = this._require('ai-model-select');
    this.refreshBtn = this._require('ai-refresh-models');
    this.scopeSelect = this._require('ai-scope-toggle');
    this.geoCheck = this._require('ai-geo-toggle');
    this.baseUrlInput = this._require('ai-base-url');
    this.keyInput = this._require('ai-key');
    this.settings = this._el('ai-settings');
    this.collapseBtn = this._el('ai-collapse');
    this.body = this._el('ai-body');

    this._refreshLabel = (this.refreshBtn.textContent || '').trim() || 'Refresh';
    this._collapsed = !!(this.body && this.body.hidden);

    this._populate();
    this._wire();
    this._ensureKeyHint();
    this._applyCollapse();
    this._wireCollapse();
    this._syncDisabled();
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
    if (!el) throw new Error(`AIControls: required element #${id} is missing`);
    return el;
  }

  /** Render the persisted settings into the DOM. The saved model is offered as
   * a provisional option so it is visible before the list is fetched. @private */
  _populate() {
    this.modelSelect.innerHTML = '';
    if (this._config.model) {
      const opt = document.createElement('option');
      opt.value = this._config.model;
      opt.textContent = this._config.model;
      opt.selected = true;
      this.modelSelect.appendChild(opt);
    }
    this.scopeSelect.value = this._config.scope;
    this.geoCheck.checked = this._config.includeGeo;
    this.baseUrlInput.value = this._config.baseUrl;
    // A password input masks this at the browser level; the value is never
    // written anywhere else and the key is never logged.
    this.keyInput.value = this._config.key;
  }

  /** Attach the change handlers. Every one persists then reports. @private */
  _wire() {
    this.modelSelect.addEventListener('change', () => {
      this._save({ model: this.modelSelect.value });
    });
    this.scopeSelect.addEventListener('change', () => {
      this._save({ scope: this.scopeSelect.value });
    });
    this.geoCheck.addEventListener('change', () => {
      this._save({ includeGeo: this.geoCheck.checked === true });
    });
    this.baseUrlInput.addEventListener('change', () => {
      this._save({ baseUrl: this.baseUrlInput.value });
    });
    this.keyInput.addEventListener('change', () => {
      this._save({ key: this.keyInput.value });
    });
    this.refreshBtn.addEventListener('click', () => {
      // Fire-and-forget from the DOM; failures are routed through onError.
      void this.refreshModels();
    });
  }

  /**
   * Persist a patch, refresh the in-memory config, and notify `onChange`.
   * @param {object} patch field(s) to save
   * @private
   */
  _save(patch) {
    const clean = {};
    if ('model' in patch) clean.model = String(patch.model == null ? '' : patch.model).trim();
    if ('baseUrl' in patch) clean.baseUrl = String(patch.baseUrl == null ? '' : patch.baseUrl).trim();
    if ('key' in patch) clean.key = String(patch.key == null ? '' : patch.key).trim();
    if ('scope' in patch) clean.scope = normalizeScope(patch.scope);
    if ('includeGeo' in patch) clean.includeGeo = patch.includeGeo === true;
    this._config = normalizeConfig(saveAIConfig(clean));
    this.onChange(this.getConfig());
  }

  /** Add the "stored only in this browser" hint under the key field when the
   * markup does not already contain one. @private */
  _ensureKeyHint() {
    if (!this.settings || !this.keyInput) return;
    if (this.settings.querySelector('.ai-hint')) return;
    const hint = document.createElement('p');
    hint.className = 'ai-hint';
    hint.textContent = KEY_STORAGE_HINT;
    const field = typeof this.keyInput.closest === 'function' ? this.keyInput.closest('.ai-field') : null;
    if (field && field.parentNode) field.parentNode.insertBefore(hint, field.nextSibling);
    else this.settings.appendChild(hint);
  }

  /** Wire the `#ai-collapse` fold. @private */
  _wireCollapse() {
    if (!this.collapseBtn || !this.body) return;
    this.collapseBtn.addEventListener('click', () => this.setCollapsed(!this._collapsed));
  }

  /** Push `this._collapsed` into the DOM (fold + `aria-expanded` + glyph). @private */
  _applyCollapse() {
    if (this.body) this.body.hidden = this._collapsed;
    if (this.collapseBtn) {
      this.collapseBtn.setAttribute('aria-expanded', String(!this._collapsed));
      this.collapseBtn.textContent = this._collapsed ? '+' : '\u2212';
    }
  }

  /** Sync the disabled state from `_busy || _fetching`. Pure function of flags,
   * so no caller can leave the controls stuck. @private */
  _syncDisabled() {
    const disabled = this._busy || this._fetching;
    this.refreshBtn.disabled = disabled;
    this.modelSelect.disabled = disabled;
    this.refreshBtn.setAttribute('aria-busy', disabled ? 'true' : 'false');
    this.modelSelect.setAttribute('aria-busy', disabled ? 'true' : 'false');
  }

  /** Progress affordance while a fetch is in flight: the button becomes a small
   * ellipsis and both model controls disable. @private */
  _setFetchingUI(fetching) {
    this.refreshBtn.textContent = fetching ? '\u2026' : this._refreshLabel;
    this.refreshBtn.title = fetching
      ? 'Loading models\u2026'
      : 'Load the model list from the server';
    this._syncDisabled();
  }

  /** Route a failure to `onError`; a throwing callback must not corrupt state. @private */
  _reportError(err) {
    try {
      this.onError(err);
    } catch (_callbackErr) {
      /* the callback is the app's concern; control state is already consistent */
    }
  }

  /**
   * Load the model list from the endpoint and populate the dropdown.
   *
   * What: `GET {baseUrl}/models` via `listModels()`; on success caches the ids in
   * memory, re-renders the options, and selects the saved model when still
   * present (else the first id); persists that selection. On failure the previous
   * options are left untouched and the typed `AIError` goes to `onError`.
   * Why: the panel decides WHEN to call this (never on page load).
   *
   * `_fetching` is cleared in `finally`, so a failure — or even a throwing
   * `onError` — can never leave the refresh button or the dropdown stuck
   * disabled. Concurrent calls share one in-flight promise.
   *
   * @returns {Promise<string[]>} the fetched ids (empty on failure)
   */
  async refreshModels() {
    if (this._fetching && this._fetchPromise) return this._fetchPromise;

    this._fetching = true;
    this._setFetchingUI(true);
    this._fetchPromise = (async () => {
      try {
        const { baseUrl, key } = this.getConfig();
        const ids = await listModels({ baseUrl, key });
        const list = Array.isArray(ids) ? ids.slice() : [];
        this._models = list;
        if (list.length === 0) return list;

        const chosen = pickModel(list, this._config.model);
        this._renderModels(list, chosen);
        if (chosen && chosen !== this._config.model) {
          this._config = normalizeConfig(saveAIConfig({ model: chosen }));
          this.onChange(this.getConfig());
        }
        return list;
      } catch (err) {
        this._reportError(asAIError(err));
        return [];
      } finally {
        this._fetching = false;
        this._fetchPromise = null;
        this._setFetchingUI(false);
      }
    })();
    return this._fetchPromise;
  }

  /**
   * Rebuild the model `<option>`s and select `chosen` (falling back to the first
   * id when `chosen` is not in the list).
   * @param {string[]} ids ids to render
   * @param {string} chosen id to select
   * @private
   */
  _renderModels(ids, chosen) {
    this.modelSelect.innerHTML = '';
    for (const id of ids) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = id;
      this.modelSelect.appendChild(opt);
    }
    this.modelSelect.value = ids.includes(chosen) ? chosen : ids[0];
  }

  /**
   * Disable (true) or enable (false) the model controls for the duration of a
   * chat request. Safe to call at any time and idempotent; it can never get
   * stuck because the fetch/finally path clears its own flag independently.
   * @param {boolean} busy whether a chat request is in flight
   * @returns {void}
   */
  setBusy(busy) {
    this._busy = busy === true;
    this._syncDisabled();
  }

  /**
   * The current settings, as visible to the user right now.
   *
   * What: a typed shallow copy of the persisted values (plus any unknown keys a
   * future writer stored). Why: callers must not be able to mutate internal
   * state, and the chat client needs exactly this object.
   * @returns {{baseUrl: string, key: string, model: string, scope: 'selected'|'scene', includeGeo: boolean, temperature: number}}
   */
  getConfig() {
    return { ...this._config };
  }

  /**
   * The model ids cached from the last successful refresh (session-lived).
   * @returns {string[]} a copy of the cached ids (empty before the first success)
   */
  getModels() {
    return this._models.slice();
  }

  /**
   * Fold or unfold the AI panel body.
   * @param {boolean} collapsed when true the `#ai-body` is hidden
   * @returns {void}
   */
  setCollapsed(collapsed) {
    this._collapsed = collapsed === true;
    this._applyCollapse();
  }

  /** @returns {boolean} whether the panel body is currently folded. */
  isCollapsed() {
    return this._collapsed;
  }
}
