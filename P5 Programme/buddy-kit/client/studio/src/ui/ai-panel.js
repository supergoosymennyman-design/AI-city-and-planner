/**
 * ai-panel.js — the AI Optimization panel shell (the composition root).
 *
 * This module is deliberately thin: it OWNS no chat, no model fetching and no
 * preview rendering — those live in `ai-chat.js` (Task 11), `ai-controls.js`
 * (Task 10) and `ai-preview.js` (Task 8). What it does is *compose* them and own
 * the one thing none of them can own alone: the panel's lifecycle and the two
 * apply actions.
 *
 * Owned DOM (all from `index.html`, added by Task 7):
 *   - `#ai-replace` / `#ai-add`  the two apply buttons (start disabled)
 *   - `#ai-preview`              the preview canvas AIPreview renders into
 *   - `#ai-section` / `.ai-head` the header, into which a live selection hint is
 *                                inserted (the hint element is created here — no
 *                                `index.html` / `style.css` edit is needed)
 * Everything else inside the section belongs to the composed sub-panels.
 *
 * WHAT THIS CLASS GUARANTEES
 *   - It NEVER mutates the scene. All mutation goes through the injected
 *     `onApplyAdd(objects, { worldPoint })` / `onApplyReplace(objects)` callbacks
 *     (Task 13 owns `studio.pushUndo()` + `insert.js`). Searching this file for
 *     `studio.addPrimitive` / `studio.remove` should find nothing but comments.
 *   - It NEVER auto-applies a result. A result only fills the preview; the user
 *     must click Replace/Add or drag the preview.
 *   - Applying KEEPS the result in the preview, so the same reply can be added
 *     repeatedly without another (billable) request.
 *   - A result that reports some skipped shapes is still applied for its valid
 *     subset; the skipped count is toasted, never a blocker.
 *   - `close()`/`destroy()` stop the preview rAF and detach the drag listeners;
 *     `destroy()` is idempotent. The panel is reusable (open after close/destroy)
 *     because the preview WebGL context is intentionally NOT disposed here —
 *     `AIPreview.dispose()` is the caller's last-resort teardown.
 *
 * LAZY MODEL LOADING — the design decision (documented per the task).
 * The panel performs ZERO network I/O on construction/page load. It loads the
 * model list only when a *trigger* fires — the first `open()` OR the first
 * `#ai-refresh-models` click — AND only when an API key is present. Rationale:
 * (a) a children's modelling app must not hit the network on startup for a
 * control most sessions never touch; (b) an unauthenticated `/models` request is
 * guaranteed to 401, so firing it without a key only produces a confusing error
 * (the panel therefore intercepts the Refresh click at CAPTURE phase and blocks
 * it, with a friendly toast, when no key is set); (c) `AIControls` deliberately
 * never fetches on construction, so the trigger must live here. The trigger is
 * one-shot (`shouldLoadModels`) so `open()` cannot re-fetch on every open, while
 * a conscious Refresh click after the first load still refreshes via AIControls.
 *
 * Pure ESM. Only the class methods touch the DOM, so every decision helper is
 * exported and asserted in plain Node (`src/ai/tests/ai-panel.spec.js`).
 */

import { AIControls } from './ai-controls.js';
import { AIChat, selectedShapeCount } from './ai-chat.js';
import { AIPreview } from './ai-preview.js';
import { attachPreviewDrag } from './ai-drag.js';
import { validateObjects } from '../ai/schema.js';
import { MAX_AI_OBJECTS } from '../ai/limits.js';

/**
 * Format the header hint for a selection count.
 *
 * What: `0` → "No shapes selected", `1` → "1 shape selected", else
 * "N shapes selected". Why: one exact place decides the child-facing wording, so
 * the label can never disagree with the count it reports. Non-finite / negative
 * inputs read as zero.
 *
 * @param {*} count number of selected editable shapes.
 * @returns {string} the header hint text.
 */
export function formatSelectionHint(count) {
  const n = Number.isFinite(Number(count)) ? Math.max(0, Math.trunc(Number(count))) : 0;
  if (n === 0) return 'No shapes selected';
  if (n === 1) return '1 shape selected';
  return `${n} shapes selected`;
}

/**
 * The enable/disable rule for the two apply buttons.
 *
 * What: `add` is enabled exactly when there is a previewable result; `replace` is
 * enabled only when there is a result AND something is selected to replace.
 * Why: this is the subtle part of the panel's state machine, and it must be
 * testable without a DOM. A result with no selection can still be *added*, but
 * replacing nothing is meaningless — hence the asymmetry.
 *
 * @param {{hasObjects?: boolean, selectionCount?: *}} [state]
 * @returns {{replace: boolean, add: boolean}} `true` = enabled.
 */
export function applyButtonState(state = {}) {
  const hasObjects = state.hasObjects === true;
  const selected =
    Number.isFinite(Number(state.selectionCount)) && Number(state.selectionCount) > 0;
  return { replace: hasObjects && selected, add: hasObjects };
}

/**
 * Whether the panel should proactively load the model list.
 *
 * What: true only when a key is present, a trigger has fired (panel open or a
 * Refresh click) AND no attempt has been made yet. Why: encodes the "lazy load"
 * rule in one pure function so the "no fetch on load / no fetch without a key /
 * fetch once" guarantees are provable in Node.
 *
 * @param {{keyPresent?: boolean, triggered?: boolean, attempted?: boolean}} [state]
 * @returns {boolean}
 */
export function shouldLoadModels(state = {}) {
  return state.keyPresent === true && state.triggered === true && state.attempted !== true;
}

/**
 * Whether a settings object carries a usable (non-blank) API key.
 *
 * @param {*} config a settings object (or anything).
 * @returns {boolean} true only for a non-empty trimmed string `key`.
 */
export function configHasKey(config) {
  return !!(
    config &&
    typeof config === 'object' &&
    typeof config.key === 'string' &&
    config.key.trim() !== ''
  );
}

/**
 * Count what an apply callback actually did.
 *
 * What: `meshes.length` (Task 6/13's `{meshes, skipped}`) with a numeric
 * `applied` fallback, plus `skipped.length`. Why: the panel must report the
 * applied and skipped counts even though the mutation lives in an injected
 * callback, and it must tolerate a callback that returns nothing.
 *
 * @param {*} result the value returned by `onApplyAdd` / `onApplyReplace`.
 * @returns {{applied: number, skipped: number}} non-negative integer counts.
 */
export function summarizeApply(result) {
  const r = result && typeof result === 'object' ? result : {};
  const applied = Array.isArray(r.meshes)
    ? r.meshes.length
    : Number.isFinite(r.applied)
      ? Math.max(0, Math.trunc(r.applied))
      : 0;
  const skipped = Array.isArray(r.skipped) ? r.skipped.length : 0;
  return { applied, skipped };
}

/**
 * Build the single toast message shown after an apply.
 *
 * What: "Added 3 shapes." / "Replaced with 2 shapes.", with a second sentence
 * for skipped shapes ("1 shape could not be built."). Why: the task requires
 * reporting both counts without blocking; one combined string survives a toast
 * implementation that replaces its text on each call (which `Toast` does).
 *
 * @param {'add'|'replace'|string} action which apply path ran.
 * @param {*} applied number of shapes applied.
 * @param {*} skipped number of shapes the AI could not build.
 * @returns {string} the toast text.
 */
export function formatApplyToast(action, applied, skipped) {
  const replace = action === 'replace';
  const a = Number.isFinite(Number(applied)) ? Math.max(0, Math.trunc(Number(applied))) : 0;
  const s = Number.isFinite(Number(skipped)) ? Math.max(0, Math.trunc(Number(skipped))) : 0;
  const parts = [];
  if (a > 0) {
    parts.push(`${replace ? 'Replaced with' : 'Added'} ${a} shape${a === 1 ? '' : 's'}.`);
  } else {
    parts.push(replace ? 'Nothing was replaced.' : 'Nothing was added.');
  }
  if (s > 0) parts.push(`${s} shape${s === 1 ? '' : 's'} could not be built.`);
  return parts.join(' ');
}

/**
 * The notice shown when the preview had to drop shapes to stay responsive.
 *
 * What: names how many of how many are rendered, and reassures that applying
 * still uses every shape. Why: the preview cap must be visible, never silent —
 * a child seeing 150 of 300 shapes could otherwise think shapes were lost.
 *
 * @param {*} total number of validated shapes in the result.
 * @param {*} shown number of shapes actually rendered.
 * @returns {string} the plain-text notice, or '' when nothing was dropped.
 */
export function formatPreviewCapNotice(total, shown) {
  const t = Number.isFinite(Number(total)) ? Math.max(0, Math.trunc(Number(total))) : 0;
  const s = Number.isFinite(Number(shown)) ? Math.max(0, Math.trunc(Number(shown))) : 0;
  if (t <= s) return '';
  return `The preview shows the first ${s} of ${t} shapes. All ${t} will still be applied.`;
}

/**
 * The notice shown when a result exceeded the APPLY cap.
 *
 * What: tells the child, at the moment a result arrives, how many of how many
 * shapes can actually be used. Why: since MT-1 the apply payload is capped too,
 * so a reply with more shapes than {@link MAX_AI_OBJECTS} is truncated — that
 * must be visible before the child clicks Apply, never silent. Empty when the
 * result fits.
 *
 * @param {*} total number of validated shapes in the reply.
 * @param {*} applied number that will actually be applied.
 * @returns {string} the plain-text notice, or '' when nothing is truncated.
 */
export function formatResultCapNotice(total, applied) {
  const t = Number.isFinite(Number(total)) ? Math.max(0, Math.trunc(Number(total))) : 0;
  const a = Number.isFinite(Number(applied)) ? Math.max(0, Math.trunc(Number(applied))) : 0;
  if (t <= a) return '';
  return `The AI returned ${t} shapes — only the first ${a} will be applied.`;
}

/**
 * The truncation sentence appended to an apply toast.
 *
 * @param {*} total number of validated shapes in the reply.
 * @param {*} applied number that were actually applied.
 * @returns {string} e.g. "Applied the first 150 of 20,000 shapes.", or ''.
 */
export function formatApplyCapNotice(total, applied) {
  const t = Number.isFinite(Number(total)) ? Math.max(0, Math.trunc(Number(total))) : 0;
  const a = Number.isFinite(Number(applied)) ? Math.max(0, Math.trunc(Number(applied))) : 0;
  if (t <= a) return '';
  return `Applied the first ${a} of ${t} shapes.`;
}

/**
 * Extract preview-ready (internal-schema) objects from a parsed chat result.
 *
 * What: reads `parsed.json` (the RAW LLM object, flat: `color:"#rrggbb"`,
 * top-level `p`/`r`/`s`) and runs it through `validateObjects`, returning the
 * normalized internal objects (`color` int, nested `transform`). Why: the preview
 * and `insert.js` both consume the INTERNAL shape, so the raw reply must be
 * bridged exactly once, here. An absent/invalid/empty set returns `[]`.
 *
 * @param {{json?: *}|null|undefined} parsed the `parseAIResponse()` result.
 * @returns {object[]} normalized objects (empty array when there is nothing usable).
 */
export function objectsFromParsed(parsed) {
  const json = parsed && typeof parsed === 'object' ? parsed.json : null;
  if (!json) return [];
  const result = validateObjects(json);
  return Array.isArray(result.objects) ? result.objects.slice() : [];
}

/**
 * The AI Optimization panel shell.
 *
 * Composes `AIControls` + `AIChat` + `AIPreview` + the preview drag and owns the
 * selection hint, the apply buttons and the panel lifecycle. See the module
 * comment for the guarantees and the lazy-loading decision.
 */
export class AIPanel {
  /**
   * @param {HTMLElement|Document} root element containing the AI section (used to
   *   scope every id lookup; falls back to `document`).
   * @param {object} [options]
   * @param {object} [options.studio] the `StudioScene` to read the selection from
   *   and to subscribe to (`select` / `changed`). Never mutated by this class.
   * @param {{show: Function, error?: Function}} [options.toast] the app's toast.
   * @param {(objects: object[], meta: {worldPoint?: any}) => object} [options.onApplyAdd]
   *   apply the previewed objects as NEW shapes; returns `{meshes, skipped}`.
   * @param {(objects: object[]) => object} [options.onApplyReplace]
   *   replace the current selection with the previewed objects.
   * @param {HTMLElement} [options.viewportEl] the drop target for the preview
   *   drag; defaults to `#viewport`.
   * @param {(clientX: number, clientY: number) => any} [options.raycastToWorld]
   *   injected ray caster for the drag (Task 13 supplies the camera-based one).
   *   When absent the drag is simply not attached and `applyAddFromPreview()`
   *   stays available for the caller to wire.
   * @param {(dragging: boolean) => void} [options.onDragStateChange] forwarded to
   *   the drag for its start/stop affordance.
   */
  constructor(
    root,
    { studio, toast, onApplyReplace, onApplyAdd, viewportEl, raycastToWorld, onDragStateChange } = {},
  ) {
    this.root = root || (typeof document !== 'undefined' ? document : null);
    this.studio = studio || null;
    this.toast = toast || null;
    this.onApplyReplace = typeof onApplyReplace === 'function' ? onApplyReplace : () => {};
    this.onApplyAdd = typeof onApplyAdd === 'function' ? onApplyAdd : () => {};
    this.viewportEl = viewportEl || this._el('viewport');
    this.raycastToWorld = typeof raycastToWorld === 'function' ? raycastToWorld : null;
    this._onDragStateChange = typeof onDragStateChange === 'function' ? onDragStateChange : null;

    /** @type {object[]} the applyable (capped) normalized objects of the last result. @private */
    this._objects = [];
    /** @type {number} how many objects the last reply actually carried (pre-cap). @private */
    this._totalObjects = 0;
    /** @type {boolean} whether `open()` is in effect. @private */
    this._open = false;
    /** @type {boolean} set by `destroy()`; cleared by `open()`. @private */
    this._destroyed = false;
    /** @type {boolean} one-shot guard for the lazy model load. @private */
    this._modelsAttempted = false;
    /** @type {(() => void)|null} the drag's detach function. @private */
    this._dragDetach = null;
    /** @type {Array<() => void>} studio + DOM unsubscribes. @private */
    this._unsubs = [];

    this.replaceBtn = this._require('ai-replace');
    this.addBtn = this._require('ai-add');
    this.previewCanvas = this._require('ai-preview');
    this._hint = this._ensureHint();
    this._clearBtn = this._ensureClearButton();

    // The composed sub-panels. `config` is a FUNCTION so runtime settings edits
    // (made in the controls below) are picked up by every chat turn.
    this.controls = new AIControls(this.root, { onError: (err) => this._reportError(err) });
    this.preview = new AIPreview(this.previewCanvas);
    this.chat = new AIChat(this.root, {
      config: () => this.controls.getConfig(),
      studio: this.studio,
      onResult: (result) => this.showResult(result),
      onError: (err) => this._reportError(err),
      onInvalid: () => this.clearResult(),
      onBusyChange: (busy) => this.controls.setBusy(busy),
    });

    this._subscribe();
    this._sync();
    // Attach the drag immediately when the ray-cast seam is available, so the
    // panel is interactive before `open()` is ever called. No network, no rAF:
    // attaching only adds listeners + a stylesheet.
    this._attachDrag();
  }

  // ---------------------------------------------------------------------------
  // DOM helpers
  // ---------------------------------------------------------------------------

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
    if (!el) throw new Error(`AIPanel: required element #${id} is missing`);
    return el;
  }

  /**
   * Create (once) the live selection hint in the panel header.
   *
   * The element is inserted before the collapse button so it sits in `.ai-head`;
   * it is announced politely for screen readers. Created here rather than in
   * `index.html` so this task touches no markup/CSS file.
   *
   * @returns {HTMLElement|null} the hint element (null outside a document).
   * @private
   */
  _ensureHint() {
    const section = this._el('ai-section');
    const head = section && typeof section.querySelector === 'function' ? section.querySelector('.ai-head') : null;
    const host = head || section || (typeof document !== 'undefined' ? document.body : null);
    let hint =
      host && typeof host.querySelector === 'function' ? host.querySelector('.ai-selection-hint') : null;
    if (!hint && typeof document !== 'undefined') {
      hint = document.createElement('span');
      hint.className = 'ai-selection-hint';
      hint.setAttribute('role', 'status');
      hint.setAttribute('aria-live', 'polite');
      if (host) {
        const collapse = typeof host.querySelector === 'function' ? host.querySelector('.ai-collapse') : null;
        if (collapse && collapse.parentNode) collapse.parentNode.insertBefore(hint, collapse);
        else host.appendChild(hint);
      }
    }
    if (hint && hint.style) {
      hint.style.fontSize = '12px';
      hint.style.color = 'var(--muted)';
      hint.style.whiteSpace = 'nowrap';
    }
    return hint || null;
  }

  /**
   * Create (once) the panel's Clear escape hatch next to Send/Stop.
   *
   * What: a small "Clear" button that empties the chat (log + history + any
   * pending confirmation) and drops the preview result. Why: the large-request
   * confirmation can block `send()`; this guarantees the input loop can ALWAYS be
   * reset from the panel itself, so the chat state can never latch dead. Built
   * here (no markup/CSS edit) and wired to `AIChat.clear()`.
   *
   * @returns {HTMLElement|null} the button (null outside a document).
   * @private
   */
  _ensureClearButton() {
    const stop = this._el('ai-stop');
    const host = stop && stop.parentNode ? stop.parentNode : this._el('ai-section');
    if (!host || typeof document === 'undefined') return null;
    let btn =
      typeof host.querySelector === 'function' ? host.querySelector('.ai-clear') : null;
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ai-clear';
      btn.textContent = 'Clear';
      btn.title = 'Clear the chat and the preview';
      if (stop && stop.parentNode === host) host.insertBefore(btn, stop.nextSibling);
      else host.appendChild(btn);
    }
    btn.addEventListener('click', () => this._clearChat());
    return btn;
  }

  /**
   * Reset the chat surface: stop any in-flight request, clear the log/history and
   * any pending confirmation, and drop the preview result so nothing stale is
   * applyable. The single "escape hatch" action behind the Clear button.
   * @returns {void}
   * @private
   */
  _clearChat() {
    try {
      if (this.chat.isBusy()) this.chat.stop();
      this.chat.clear();
    } catch (err) {
      this._reportError(err);
    }
    this.clearResult();
  }

  // ---------------------------------------------------------------------------
  // Subscriptions / lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Wire the studio events and the apply/refresh DOM handlers.
   *
   * Idempotent: a second call while already subscribed is a no-op, so `open()`
   * after `destroy()` can safely re-arm everything exactly once.
   *
   * @returns {void}
   * @private
   */
  _subscribe() {
    if (this._unsubs.length) return;

    if (this.studio && typeof this.studio.on === 'function') {
      for (const event of ['select', 'changed']) {
        const off = this.studio.on(event, () => this._sync());
        if (typeof off === 'function') this._unsubs.push(off);
      }
    }

    const dom = (el, type, fn, opts) => {
      if (!el || typeof el.addEventListener !== 'function') return;
      el.addEventListener(type, fn, opts);
      this._unsubs.push(() => el.removeEventListener(type, fn, opts));
    };
    dom(this.replaceBtn, 'click', () => this._apply('replace'));
    dom(this.addBtn, 'click', () => this._apply('add'));
    // CAPTURE phase on the section: this runs BEFORE AIControls' own Refresh
    // click handler, which lets the panel veto a keyless fetch (below).
    dom(this.root, 'click', (event) => this._onSectionClickCapture(event), true);
  }

  /**
   * Remove every studio + DOM subscription added by `_subscribe()`.
   * @returns {void}
   * @private
   */
  _unsubscribe() {
    for (const off of this._unsubs.splice(0)) {
      try {
        off();
      } catch {
        /* already gone — nothing to undo */
      }
    }
  }

  /**
   * Show/open the panel.
   *
   * What: marks the panel open, (re-)arms subscriptions and the preview drag,
   * unfolds the controls, restarts the preview loop when a result is present,
   * and triggers the ONE-shot lazy model load when a key is configured. Why:
   * `open()` is the panel's "become active" transition; it is safe to call
   * repeatedly and after `close()`/`destroy()`.
   *
   * @returns {void}
   */
  open() {
    this._destroyed = false;
    this._open = true;
    this.chat.reopen();
    this._subscribe();
    this.controls.setCollapsed(false);
    this._attachDrag();
    if (this.preview.hasObjects()) this.preview.start();
    this._sync();
    this._maybeLoadModels(true);
  }

  /**
   * Hide/deactivate the panel.
   *
   * Stops the preview render loop and detaches the drag listeners (the two hard
   * requirements) and marks the panel closed. The chat log, settings and last
   * result are preserved, so a later `open()` resumes exactly where it left off.
   *
   * @returns {void}
   */
  close() {
    this._open = false;
    this.preview.stop();
    this.detachDrag();
  }

  /**
   * Tear the panel down. Idempotent — calling it twice is safe.
   *
   * What: stops the preview loop, detaches the drag listeners, and removes every
   * studio + DOM subscription. Why: this is the app's teardown hook (e.g. a
   * `beforeunload`). It deliberately does NOT `dispose()` the preview, so the
   * panel can be reopened; call `preview.dispose()` directly for the final,
   * non-reversible WebGL teardown (AIPreview owns exactly one context per page).
   *
   * @returns {void}
   */
  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this.close();
    this._unsubscribe();
    // Tear the chat down too so an in-flight request cannot outlive the panel.
    // `open()` calls `chat.reopen()`, so destroy→open still works.
    if (this.chat && typeof this.chat.destroy === 'function') this.chat.destroy();
  }

  /**
   * Whether the panel is currently open (`open()` called without a later `close()`).
   * @returns {boolean}
   */
  isOpen() {
    return this._open;
  }

  // ---------------------------------------------------------------------------
  // Result + apply
  // ---------------------------------------------------------------------------

  /**
   * Display a parsed chat result in the preview.
   *
   * What: normalizes `result.parsed.json` via `objectsFromParsed()`, then CAPS
   * the applyable set to {@link MAX_AI_OBJECTS} (the same constant the preview
   * renders) so a hostile/over-large reply can never freeze the main thread when
   * applied. The preview still receives the full list and renders its own head;
   * the camera is framed, the loop starts, the action buttons re-sync, and a
   * truncation notice is toasted when shapes were dropped. Why: this is the ONLY
   * entry point for a result — `AIChat.onResult` forwards here, and tests/task 13
   * can inject a result directly. Nothing is applied to the scene here.
   *
   * @param {{parsed?: object}|null} result a valid `{raw, parsed, payload}` result.
   * @returns {number} the number of APPLYABLE (capped) objects.
   */
  showResult(result) {
    if (this._destroyed) return 0;
    const parsed = result && typeof result === 'object' ? result.parsed : null;
    const all = objectsFromParsed(parsed);
    this._totalObjects = all.length;
    this._objects = all.slice(0, MAX_AI_OBJECTS);
    this.preview.setObjects(all);
    this.preview.frameCamera();
    this.preview.start();
    this._sync();
    const capNotice = formatResultCapNotice(this._totalObjects, this._objects.length);
    if (capNotice) this.toast?.show?.(capNotice);
    return this._objects.length;
  }

  /**
   * Drop the current preview result and disable both apply buttons.
   *
   * What: clears `_objects` and the preview, then re-syncs. Why: a failed turn
   * (parse failure or request error, wired via `AIChat.onInvalid`) must not leave
   * a stale result applyable — the buttons have to read disabled until a NEW
   * valid reply arrives. Callers may also invoke this directly.
   *
   * @returns {void}
   */
  clearResult() {
    this._objects = [];
    this._totalObjects = 0;
    if (this.preview && typeof this.preview.setObjects === 'function') {
      this.preview.setObjects([]);
    }
    this._sync();
  }

  /**
   * The last result's normalized objects (a defensive copy).
   * @returns {object[]}
   */
  getObjects() {
    return this._objects.slice();
  }

  /**
   * Apply the current preview result as NEW shapes at a world point.
   *
   * Public so a drag wired outside this class (or a test) can use the exact same
   * path as `#ai-add`. Delegates to the injected `onApplyAdd`; never mutates the
   * scene itself.
   *
   * @param {any} [worldPoint] the drop point from the drag's `raycastToWorld`.
   * @returns {boolean} true when an apply callback was invoked.
   */
  applyAddFromPreview(worldPoint) {
    return this._apply('add', worldPoint);
  }

  /**
   * Run one apply action through the injected callback and report the outcome.
   *
   * The result is INTENTIONALLY left in the preview: the child can apply the same
   * reply repeatedly without another request. A callback's `{meshes, skipped}` is
   * summarized into a toast; skipped shapes are reported, never a blocker.
   *
   * @param {'add'|'replace'} action which apply path to run.
   * @param {any} [worldPoint] drop point (add path only).
   * @returns {boolean} true when the callback ran.
   * @private
   */
  _apply(action, worldPoint) {
    if (this._destroyed) return false;
    const objects = this._objects;
    if (!Array.isArray(objects) || objects.length === 0) return false;
    const isAdd = action !== 'replace';
    // Respect the disabled state so a programmatic call cannot bypass the rule.
    if (isAdd ? this.addBtn.disabled : this.replaceBtn.disabled) return false;

    let result;
    try {
      result = isAdd ? this.onApplyAdd(objects, { worldPoint }) : this.onApplyReplace(objects);
    } catch (err) {
      this._reportError(err);
      return false;
    }

    const { applied, skipped } = summarizeApply(result);
    const base = formatApplyToast(isAdd ? 'add' : 'replace', applied, skipped);
    const capNotice = formatApplyCapNotice(this._totalObjects, objects.length);
    this.toast?.show?.(capNotice ? `${base} ${capNotice}` : base);
    this._sync();
    return true;
  }

  /**
   * Recompute the header hint and the apply-button enabled states from the live
   * selection + the current result. Pure function of state; safe to call often.
   * @returns {void}
   * @private
   */
  _sync() {
    const count = selectedShapeCount(this.studio);
    if (this._hint) this._hint.textContent = formatSelectionHint(count);
    const state = applyButtonState({ hasObjects: this._objects.length > 0, selectionCount: count });
    this.replaceBtn.disabled = !state.replace;
    this.addBtn.disabled = !state.add;
  }

  // ---------------------------------------------------------------------------
  // Lazy model loading
  // ---------------------------------------------------------------------------

  /**
   * Veto or allow a Refresh click before `AIControls` sees it.
   *
   * What: when the Refresh button is clicked with NO key configured, the event is
   * stopped at capture phase (so `AIControls`' click handler cannot fire a
   * guaranteed-401 `/models` request) and a friendly toast is shown. With a key
   * present the click flows on normally and also serves as the one-shot lazy
   * trigger. Why: the task requires "no fetch without a key".
   *
   * @param {Event} event the capture-phase click.
   * @returns {void}
   * @private
   */
  _onSectionClickCapture(event) {
    const btn = this.controls && this.controls.refreshBtn;
    if (!btn || !event || !event.target) return;
    const target = event.target;
    const hit = target === btn || (typeof btn.contains === 'function' && btn.contains(target));
    if (!hit) return;

    if (configHasKey(this.controls.getConfig())) {
      this._maybeLoadModels(true);
      return; // let AIControls' own handler do the (de-duplicated) fetch/refresh
    }

    if (typeof event.stopPropagation === 'function') event.stopPropagation();
    if (typeof event.preventDefault === 'function') event.preventDefault();
    this.toast?.error?.('Add your API key in AI settings first.');
  }

  /**
   * One-shot lazy model load: fires only with a key, only on a trigger, once.
   * @param {boolean} triggered whether a load trigger (open / Refresh click) happened.
   * @returns {void}
   * @private
   */
  _maybeLoadModels(triggered) {
    if (this._destroyed) return;
    const keyPresent = configHasKey(this.controls.getConfig());
    if (!shouldLoadModels({ keyPresent, triggered, attempted: this._modelsAttempted })) return;
    this._modelsAttempted = true;
    // Fire-and-forget: AIControls routes any failure to its onError.
    void this.controls.refreshModels();
  }

  // ---------------------------------------------------------------------------
  // Drag lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Attach the preview→viewport drag (idempotent). Requires a `raycastToWorld`
   * seam and a viewport element; if either is absent this is a no-op.
   * @returns {void}
   * @private
   */
  _attachDrag() {
    if (this._dragDetach || this._destroyed) return;
    if (typeof this.raycastToWorld !== 'function') return;
    if (!this.previewCanvas || !this.viewportEl) return;
    try {
      this._dragDetach = attachPreviewDrag({
        canvasEl: this.previewCanvas,
        viewportEl: this.viewportEl,
        raycastToWorld: this.raycastToWorld,
        onDrop: (worldPoint) => this.applyAddFromPreview(worldPoint),
        onDragStateChange: this._onDragStateChange || undefined,
        ghostLabel: 'Drop to add',
      });
    } catch (err) {
      this._dragDetach = null;
      this._reportError(err);
    }
  }

  /**
   * Detach the drag listeners and remove any leftover ghost/highlight. Safe to
   * call when no drag is attached and safe to call twice.
   * @returns {void}
   */
  detachDrag() {
    const detach = this._dragDetach;
    this._dragDetach = null;
    if (typeof detach === 'function') {
      try {
        detach();
      } catch {
        /* already detached — nothing to undo */
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Errors
  // ---------------------------------------------------------------------------

  /**
   * Surface a failure from a composed sub-panel: toast its message, and warn to
   * the console ONLY for developer-actionable anomalies.
   *
   * A typed `AIError` (401/403/404/429/5xx/network/timeout) is an expected,
   * user-facing runtime condition, so it is never logged. Anything else is an
   * unexpected bug worth a warning. Only the error's NAME is logged — never the
   * error object and never the config — so the API key can never reach the
   * console. A throwing/absent toast must never break the panel.
   *
   * @param {*} err the caught value.
   * @returns {void}
   * @private
   */
  _reportError(err) {
    if (!(err && err.name === 'AIError')) {
      const name = err && typeof err.name === 'string' && err.name ? err.name : typeof err;
      try {
        console.warn(`[ai-panel] unexpected error: ${name}`);
      } catch {
        /* a guarded console must never break error reporting */
      }
    }
    const message =
      err && typeof err.message === 'string' && err.message
        ? err.message
        : 'The AI request failed. Try again.';
    try {
      this.toast?.error?.(message);
    } catch {
      /* the toast is best-effort; the panel state is already consistent */
    }
  }
}
