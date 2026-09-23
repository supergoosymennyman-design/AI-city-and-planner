/**
 * shop-panel.js — the Model Shop's sidebar renderer (DOM ONLY).
 *
 * WHY IT LOOKS LIKE THIS:
 *  - The controller is the single owner of shop state. This panel is a PURE
 *    RENDERER: it takes a `view` snapshot, rebuilds the LIST from it, and reports
 *    user intent through injected callbacks. It never reads the scene, never
 *    imports the controller, and never mutates anything but its own subtree.
 *  - Rebuild, don't patch: `render()` clears the scrolling list region and
 *    rebuilds it, so the list is always a pure function of
 *    `(state, catalog, query, category)`. No stale nodes.
 *  - The TOOLBAR is the exception: `#shop-search` / `#shop-categories` live
 *    OUTSIDE the rebuilt list (markup in `index.html`) and their listeners are
 *    attached ONCE in the constructor. A render only writes their state (input
 *    value, active chip) — it never rebuilds them, so typing survives a
 *    re-render with focus intact.
 *  - All text goes through `textContent` (catalog strings are developer-authored
 *    but still untrusted) — this module never parses markup into the DOM.
 *  - The unlock decision is NOT duplicated here: it comes from the pure
 *    `unlock.status()` engine, so this panel can never disagree with `purchase()`.
 *    Filtering/grouping likewise comes from the pure `search` module.
 *  - Wave B adds a SECOND view (the bottom-up skill tree) to the same panel. The
 *    node STATE still is not computed here: it arrives as a `nodeStates` map the
 *    controller derived from the pure `skill-progress` engine, so the tree can
 *    never disagree with the reward ledger. The view toggle is persistent toolbar
 *    state like the chips — its listener is bound ONCE and a render only writes
 *    `aria-pressed`/`.active`; the tree subtree is rebuilt only when its own
 *    signature changes, and search/category filtering is intentionally inert in
 *    the tree (the toolbar is shop-list-only).
 *
 * Owned DOM (from `index.html`, added by Task 8 / Task 19):
 *   - `#shop-coins` / `#shop-level`   the wallet readout
 *   - `#shop-toggle`                  the collapse control
 *   - `#shop-search` / `#shop-categories`  the persistent toolbar
 *   - `#shop-view-toggle`             the Shop ⇄ Tree segmented control (persistent)
 *   - `#shop-status`                  request errors + the Retry button
 *   - `#shop-body`                    one `.shop-card` per visible catalog model
 *   - `#shop-tree`                    one `.skill-node[data-node-id][data-state]` per node
 *   - `#shop-debug`                   the developer-tools strip
 *
 * The only dependencies this module imports are the pure `unlock` and `search`
 * engines (no DOM, no `three`, no scene); every state mutation happens in the
 * controller.
 *
 * @module ui/shop-panel
 */

import * as unlock from '../shop/unlock.js';
import * as search from '../shop/search.js';
import { layoutSkillTree } from '../shop/tree-layout.js';

/** Label for a usable model's action. */
const PLACE_LABEL = 'Add';
/** Prefix for an unlocked-but-unpaid coin model's action. */
const BUY_PREFIX = 'Unlock';
/** Label for the error-retry control. */
const RETRY_LABEL = 'Retry';
/** Status text shown while the catalog request is in flight. */
const LOADING_LABEL = 'Loading models…';
/** Category id of the always-present "show everything" chip. */
const ALL_CATEGORY = 'all';
/** Label for the `all` chip. */
const ALL_LABEL = 'All';
/** Visible label on an unlocked card's drag handle (pointer-only affordance). */
const DRAG_LABEL = 'Drag';
/** Empty-state text when the active query/category matches no model. */
export const EMPTY_LABEL = 'No models match';
/** The default (model-list) view id. */
export const VIEW_SHOP = 'shop';
/** The skill-tree view id. */
export const VIEW_TREE = 'tree';
/** Empty-state text when the config carries no usable nodes. */
export const TREE_EMPTY_LABEL = 'No skill tree';
/** Fallback message when the skill-tree load failed without a usable description. */
export const TREE_ERROR_LABEL = 'Skill tree unavailable';
/** The one-shot highlight class the unlock feedback applies (styling is Task 21). */
export const NEWLY_ACHIEVED_CLASS = 'is-newly-achieved';
/** Milliseconds after which the one-shot highlight is force-removed. The CSS
 *  animation is 0.9s; this is a safety net for `prefers-reduced-motion: reduce`,
 *  where no `animationend` ever fires. */
const HIGHLIGHT_FALLBACK_MS = 1200;
/** Milliseconds after which an edge fill is force-finished. The CSS animation is
 *  700ms; this is the safety net for `prefers-reduced-motion: reduce`, where no
 *  `animationend` ever fires. */
const EDGE_FILL_FALLBACK_MS = 900;
/** The one-shot class that starts the edge fill (styling is Task 21). */
const EDGE_FILLING_CLASS = 'is-filling';

/**
 * Remove every child of an element without parsing markup.
 *
 * @param {Element} el - Element to empty.
 * @returns {void}
 */
function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/**
 * Map an `unlock.status()` result to a card's action descriptor (PURE — no DOM,
 * exported so the branch logic is asserted in plain Node).
 *
 * The three outcomes are frozen by the task:
 *  - unlocked (free or owned)      -> `place`, label `Add`
 *  - locked but affordable         -> `buy`,   label `Unlock · N coins`
 *  - locked and not affordable      -> `locked`, DISABLED, label = the engine's
 *    `reason` (never invented here), mirrored into `aria-label`.
 *
 * @param {*} status - Result of `unlock.status(state, model)` (hostile input is
 *   tolerated and degrades to a locked card).
 * @returns {{action: 'place'|'buy'|'locked', label: string, disabled: boolean, ariaLabel: string|null}}
 */
export function cardAction(status) {
  const s = status !== null && typeof status === 'object' ? status : {};

  if (s.unlocked === true) {
    return { action: 'place', label: PLACE_LABEL, disabled: false, ariaLabel: null };
  }

  if (s.canBuy === true) {
    const coins = typeof s.coins === 'number' ? s.coins : 0;
    const label = `${BUY_PREFIX} · ${coins} coins`;
    return { action: 'buy', label, disabled: false, ariaLabel: null };
  }

  // Locked: the requirement text comes verbatim from the unlock engine so the
  // panel can never drift from `purchase()`'s decision.
  const reason = typeof s.reason === 'string' ? s.reason : '';
  return { action: 'locked', label: reason, disabled: true, ariaLabel: reason };
}

/**
 * Derive the toolbar's chip descriptors from a category taxonomy (PURE — no DOM,
 * exported so the chip contract is asserted in plain Node).
 *
 * The `all` chip always comes first. Category chips keep taxonomy order, drop
 * blank ids, collapse case-insensitive duplicates (first wins), tolerate hostile
 * input, and fall back to the id when a category has no label. Wave A passes
 * `search.categoriesFromCatalog(models)`; Wave B passes the config taxonomy — the
 * shape is identical, so the panel does not care which.
 *
 * The authored `icon` travels on the descriptor too (defaulted to `''`), so the
 * renderer can paint it as a CSS marker. The icon is NEVER concatenated into the
 * label text: the chip's label stays exactly the taxonomy label, and the `all`
 * chip carries no icon.
 *
 * @param {unknown} categories - Normalized `{id,label,icon,order}` taxonomy.
 * @returns {Array<{id: string, label: string, icon: string}>} Chip descriptors, `all` first.
 */
export function categoryChips(categories) {
  const list = Array.isArray(categories) ? categories : [];
  const chips = [{ id: ALL_CATEGORY, label: ALL_LABEL, icon: '' }];
  const seen = new Set([ALL_CATEGORY]);

  for (const cat of list) {
    if (!cat || typeof cat !== 'object') continue;
    const rawId = typeof cat.id === 'string' ? cat.id.trim() : '';
    if (rawId === '') continue;
    const key = rawId.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const label = typeof cat.label === 'string' && cat.label.trim() !== '' ? cat.label.trim() : rawId;
    const icon = typeof cat.icon === 'string' ? cat.icon.trim() : '';
    chips.push({ id: rawId, label, icon });
  }

  return chips;
}

/**
 * The single filtering pass the list uses (PURE — no DOM, exported so it can be
 * asserted without a browser). Composes `search.filterModels` (query + category,
 * AND-combined) with `search.groupByCategory` (taxonomy order, `Other` last), so
 * the panel never re-implements the matching rules.
 *
 * @param {unknown} models - Catalog models.
 * @param {unknown} categories - Normalized category taxonomy.
 * @param {unknown} query - Raw search string.
 * @param {unknown} categoryId - Active chip id (`all` = no filter).
 * @returns {Array<{categoryId: string, label: string, models: Array<object>}>}
 */
export function filterGroups(models, categories, query, categoryId) {
  const filtered = search.filterModels(models, { query, categoryId, categories });
  return search.groupByCategory(filtered, categories);
}

/**
 * Format a node's reward as one readable line (PURE — no DOM). Only positive
 * integers are shown; `0`/malformed values collapse to `no reward` rather than a
 * noisy `+0`, so a reward-less node still carries a non-empty `.skill-node-reward`.
 *
 * @param {unknown} levelReward - Normalized node level reward.
 * @param {unknown} coinReward - Normalized node coin reward.
 * @returns {string} e.g. `+1 level · +50 coins`.
 */
export function rewardText(levelReward, coinReward) {
  const parts = [];
  if (typeof levelReward === 'number' && Number.isInteger(levelReward) && levelReward > 0) {
    parts.push(`+${levelReward} level${levelReward === 1 ? '' : 's'}`);
  }
  if (typeof coinReward === 'number' && Number.isInteger(coinReward) && coinReward > 0) {
    parts.push(`+${coinReward} coin${coinReward === 1 ? '' : 's'}`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'no reward';
}

/**
 * Read one node's state out of the controller-built `nodeStates` map (PURE).
 * Accepts either a `Map` or a plain object; an absent/unknown/garbage value fails
 * closed to `locked`. This panel never derives the state itself — it only reads
 * what `skill-progress.nodeState` produced.
 *
 * @param {Map<string,string>|object|null} nodeStates - Controller-built map.
 * @param {string} id - Node id.
 * @returns {'locked'|'available'|'achieved'}
 */
function readNodeState(nodeStates, id) {
  let value;
  if (nodeStates instanceof Map) value = nodeStates.get(id);
  else if (nodeStates !== null && typeof nodeStates === 'object') value = nodeStates[id];
  return value === 'achieved' || value === 'available' || value === 'locked' ? value : 'locked';
}

/**
 * Build one node's render descriptor from the normalized config (PURE). Hostile
 * input (non-objects, blank ids) degrades to `null` so callers can skip it.
 *
 * @param {unknown} node - A raw normalized node.
 * @param {Map<string,string>|object|null} nodeStates - Node id -> state.
 * @param {string} branchId - Owning branch id (carried through for diagnostics).
 * @returns {object|null} The descriptor, or `null` when the node is unusable.
 */
function nodeDescriptor(node, nodeStates, branchId) {
  if (node === null || typeof node !== 'object') return null;
  const id = typeof node.id === 'string' ? node.id : '';
  if (id === '') return null;
  const levelReward = Number.isInteger(node.levelReward) && node.levelReward > 0 ? node.levelReward : 0;
  const coinReward = Number.isInteger(node.coinReward) && node.coinReward > 0 ? node.coinReward : 0;
  const depth = Number.isInteger(node.depth) && node.depth >= 0 ? node.depth : 0;
  const parent = typeof node.parent === 'string' && node.parent !== '' ? node.parent : null;
  return {
    id,
    name: typeof node.name === 'string' ? node.name : '',
    depth,
    parent,
    state: readNodeState(nodeStates, id),
    levelReward,
    coinReward,
    rewardText: rewardText(levelReward, coinReward),
    branchId,
  };
}

/**
 * Group the normalized skill-tree config into ONE render descriptor PER BRANCH
 * (PURE — no DOM, exported so the multi-branch contract is asserted in plain
 * Node). Config order is preserved within a branch (a parent always precedes its
 * children) and hostile input degrades to `[]`.
 *
 * WHY PER-BRANCH: the tree view gives each branch its own absolutely-positioned
 * `.skill-branch` lane (one column) with the SVG edge layer drawing a straight
 * line from each parent to its child. Flattening every branch into ONE lane
 * collapsed the branches into a single stack and made the edge set assume a
 * single chain. A lane per branch keeps each chain (and its edges) independent,
 * so every branch renders in its own column.
 *
 * @param {unknown} skillTree - Normalized config (`{branches:[{id,name,nodes}]}`).
 * @param {Map<string,string>|object|null} nodeStates - Node id -> state.
 * @returns {Array<{id:string,name:string,nodes:Array<object>}>} One descriptor per
 *   usable branch, each `nodes` in config order.
 */
export function treeBranches(skillTree, nodeStates) {
  const branches = skillTree !== null && typeof skillTree === 'object' && Array.isArray(skillTree.branches) ? skillTree.branches : [];
  const out = [];

  for (const branch of branches) {
    if (branch === null || typeof branch !== 'object') continue;
    const branchId = typeof branch.id === 'string' ? branch.id : '';
    const name = typeof branch.name === 'string' ? branch.name : '';
    const descriptors = [];
    const list = Array.isArray(branch.nodes) ? branch.nodes : [];

    for (const node of list) {
      const descriptor = nodeDescriptor(node, nodeStates, branchId);
      if (descriptor !== null) descriptors.push(descriptor);
    }

    out.push({ id: branchId, name, nodes: descriptors });
  }

  return out;
}

/**
 * Flatten the per-branch descriptors into one config-order node list (PURE — no
 * DOM, exported so the flat tree contract is asserted in plain Node). Kept for
 * flat consumers (the unlock toast names) and the single-chain tests; the tree
 * view itself groups by branch via `treeBranches`.
 *
 * @param {unknown} skillTree - Normalized config (`{branches:[{nodes:[...]}]}`).
 * @param {Map<string,string>|object|null} nodeStates - Node id -> state.
 * @returns {Array<{id:string,name:string,depth:number,state:'locked'|'available'|'achieved',levelReward:number,coinReward:number,rewardText:string,branchId:string}>}
 */
export function treeNodes(skillTree, nodeStates) {
  const nodes = [];
  for (const branch of treeBranches(skillTree, nodeStates)) {
    for (const node of branch.nodes) nodes.push(node);
  }
  return nodes;
}

/**
 * Build the unlock toast text for a batch of newly achieved node ids (PURE — no
 * DOM). Names come from the config; ids with no matching node fall back to the id
 * itself so feedback is never silently dropped.
 *
 * @param {unknown} ids - Newly unlocked node ids.
 * @param {unknown} skillTree - Normalized config.
 * @returns {string} `''` when there is nothing to announce.
 */
export function unlockToast(ids, skillTree) {
  const list = Array.isArray(ids) ? ids.filter((id) => typeof id === 'string' && id !== '') : [];
  if (list.length === 0) return '';

  const names = new Map();
  for (const node of treeNodes(skillTree, null)) names.set(node.id, node.name);
  const labels = list.map((id) => names.get(id) || id);
  if (labels.length === 1) return `Skill unlocked: ${labels[0]}`;
  return `${labels.length} skills unlocked: ${labels.join(', ')}`;
}

/**
 * Callback-driven renderer for the Model Shop sidebar.
 *
 * The controller owns persistent state; this class paints a `view` snapshot and
 * forwards intent. It also owns the shop's TRANSIENT filter state (the search
 * text and the active category), because that state belongs to the persistent
 * toolbar and must survive the list being rebuilt on every render.
 *
 * Every callback is optional (guarded with `?.`), so the panel is safe to
 * construct in tests or before the controller has wired it up.
 */
export class ShopPanel {
  /**
   * Query the panel's owned elements and attach the persistent listeners.
   * No DOM is touched until `render()` is called, and nothing throws when the
   * host element is absent (Node tests construct with `null`).
   *
   * @param {Element|null} element - The `#shop-sidebar` host element.
   * @param {object} [callbacks] - Injected intent handlers (all optional):
   *   `onPlace(model)`, `onBuy(model)`, `onSelectModel(model)`,
   *   `onDragStart(model, event)`, `onGrantCoins()`, `onGrantLevel()`,
   *   `onReset()`, `onToggleCollapse(collapsed)`, `onRetry()`,
   *   `onViewChange(view)`, `onToast(message)`,
   *   `getThumbnail(modelId)`.
   *   `getThumbnail` is a SYNCHRONOUS cache read (`(id) => dataUrl|null`) injected
   *   by the controller — the panel never awaits it, never imports the thumbnail
   *   provider, and renders a placeholder on a miss.
   */
  constructor(element, callbacks) {
    this.element = element || null;
    this.callbacks = callbacks || {};

    const find = (selector) => (this.element ? this.element.querySelector(selector) : null);
    this.coinsEl = find('#shop-coins');
    this.levelEl = find('#shop-level');
    this.toggleEl = find('#shop-toggle');
    this.searchEl = find('#shop-search');
    this.categoriesEl = find('#shop-categories');
    this.viewToggleEl = find('#shop-view-toggle');
    this.statusEl = find('#shop-status');
    this.bodyEl = find('#shop-body');
    this.treeEl = find('#shop-tree');
    this.debugEl = find('#shop-debug');

    /** Last failure seen, so a plain state re-render cannot hide an error the
     *  user is looking at (see `render`). */
    this._lastError = null;

    // Transient toolbar state. It lives here (not in the controller) because the
    // DOM controls that own it are persistent; render() only mirrors it back.
    this._query = '';
    this._categoryId = ALL_CATEGORY;
    this._categories = [];
    this._categoriesSignature = null;
    this._chipEls = new Map();
    /** Latest normalized snapshot, so an input event can repaint the list
     *  without waiting for the controller to re-render. */
    this._lastRender = null;

    // Wave B transient view state + the tree's rebuild signature. The tree subtree
    // is only touched when its signature changes, so a wallet re-render never
    // disturbs the nodes; the unlock signature makes the toast/highlight fire once
    // per newly-unlocked batch.
    this._view = VIEW_SHOP;
    this._treeSignature = null;
    this._nodeEls = new Map();
    this._edgeEls = new Map();
    this._lastUnlockSignature = null;
    this._highlightTimers = new Set();
    /** The batch (ids + layout) of an unlock FX that arrived while the tree was
     *  hidden, played once on the next switch into the Tree view. */
    this._pendingFx = null;
    /** Identity token for the in-flight FX chain; a rebuild/replay replaces it so
     *  stale `animationend`/timeout callbacks can never touch the new DOM. */
    this._fxToken = null;
    /** Elements currently carrying an FX class, so a cancel can strip them. */
    this._fxEls = new Set();

    // Flip the visual state, keep `aria-expanded` honest, and tell the
    // controller so it can persist the choice.
    this._onToggle = () => {
      if (!this.element) return;
      const next = !this._visuallyCollapsed();
      this.element.classList.toggle('collapsed', next);
      if (this._isNarrow()) this.element.classList.toggle('user-expanded', !next);
      this._syncAria();
      this.callbacks?.onToggleCollapse?.(next);
    };

    // Below the breakpoint the rail is the default (no `.collapsed`), so the
    // visual state flips with the viewport alone — keep `aria-expanded` honest.
    this._onViewportChange = () => this._syncAria();

    // Delegated retry handler on the persistent status region: the button is
    // rebuilt every render, so the listener must live on its container.
    this._onStatusClick = (event) => {
      const target = event && event.target;
      const button = target && typeof target.closest === 'function' ? target.closest('[data-action="retry"]') : null;
      if (button && this.statusEl && this.statusEl.contains(button)) this.callbacks?.onRetry?.();
    };

    // Same delegation for the tree's failure retry (the tree is rebuilt too).
    this._onTreeClick = (event) => {
      const target = event && event.target;
      const button = target && typeof target.closest === 'function' ? target.closest('[data-action="retry"]') : null;
      if (button && this.treeEl && this.treeEl.contains(button)) this.callbacks?.onRetry?.();
    };

    // Delegated developer-tools handler on the static strip.
    this._onDebugClick = (event) => {
      const target = event && event.target;
      const button = target && typeof target.closest === 'function' ? target.closest('[data-debug]') : null;
      if (!button || !this.debugEl || !this.debugEl.contains(button)) return;
      const kind = button.getAttribute('data-debug');
      if (kind === 'coins') this.callbacks?.onGrantCoins?.();
      else if (kind === 'level') this.callbacks?.onGrantLevel?.();
      else if (kind === 'reset') this.callbacks?.onReset?.();
    };

    // Persistent toolbar listeners, attached ONCE. The chips inside
    // `#shop-categories` are (re)built only when the taxonomy itself changes, so
    // a plain re-render never touches these listeners or the search input.
    this._onSearchInput = (event) => {
      const el = event && event.target ? event.target : this.searchEl;
      this._query = el && typeof el.value === 'string' ? el.value : '';
      this._paintModels();
    };
    this._onCategoryClick = (event) => {
      const target = event && event.target;
      const chip = target && typeof target.closest === 'function' ? target.closest('.shop-cat-chip[data-category]') : null;
      if (!chip || !this.categoriesEl || !this.categoriesEl.contains(chip)) return;
      const id = chip.getAttribute('data-category');
      this._categoryId = typeof id === 'string' && id !== '' ? id : ALL_CATEGORY;
      this._syncActiveChip();
      this._paintModels();
    };

    // The Shop ⇄ Tree toggle lives in the persistent `.shop-tools` region, so the
    // listener is bound ONCE and a render only rewrites `aria-pressed`/`.active`.
    this._onViewClick = (event) => {
      const target = event && event.target;
      const option = target && typeof target.closest === 'function' ? target.closest('.shop-view-opt[data-view]') : null;
      if (!option || !this.viewToggleEl || !this.viewToggleEl.contains(option)) return;
      const view = option.getAttribute('data-view');
      if (view !== VIEW_SHOP && view !== VIEW_TREE) return;
      this._view = view;
      this._syncViewToggle();
      this._applyView();
      this.callbacks?.onViewChange?.(view);
    };

    if (this.toggleEl) this.toggleEl.addEventListener('click', this._onToggle);
    if (this.statusEl) this.statusEl.addEventListener('click', this._onStatusClick);
    if (this.treeEl) this.treeEl.addEventListener('click', this._onTreeClick);
    if (this.debugEl) this.debugEl.addEventListener('click', this._onDebugClick);
    if (this.searchEl) this.searchEl.addEventListener('input', this._onSearchInput);
    if (this.categoriesEl) this.categoriesEl.addEventListener('click', this._onCategoryClick);
    if (this.viewToggleEl) this.viewToggleEl.addEventListener('click', this._onViewClick);

    this._mql =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(max-width: 1180px)')
        : null;
    if (this._mql) this._mql.addEventListener('change', this._onViewportChange);
  }

  /** True below the responsive breakpoint, where the shop defaults to the rail. */
  _isNarrow() {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(max-width: 1180px)').matches
    );
  }

  /** The state the user actually sees: a rail (collapsed) or the full panel. */
  _visuallyCollapsed() {
    const el = this.element;
    if (!el) return true;
    return this._isNarrow() ? !el.classList.contains('user-expanded') : el.classList.contains('collapsed');
  }

  /** Keep aria-expanded honest for the VISUAL state. */
  _syncAria() {
    if (this.toggleEl) this.toggleEl.setAttribute('aria-expanded', String(!this._visuallyCollapsed()));
  }

  /** Apply a persisted collapsed flag from state. Render must NOT turn a fresh
   *  `collapsed: false` into an expanded panel below the breakpoint: the rail is
   *  the default there and only an explicit toggle sets `.user-expanded`. */
  _applyCollapse(collapsed) {
    const el = this.element;
    if (!el) return;
    el.classList.toggle('collapsed', collapsed === true);
    if (collapsed === true) el.classList.remove('user-expanded');
    this._syncAria();
  }

  /** Paint the persistent view toggle from `_view` (`aria-pressed` + `.active`). */
  _syncViewToggle() {
    if (!this.viewToggleEl) return;
    const options = this.viewToggleEl.querySelectorAll('.shop-view-opt[data-view]');
    for (const option of options) {
      const active = option.getAttribute('data-view') === this._view;
      if (option.classList) option.classList.toggle('active', active);
      option.setAttribute('aria-pressed', String(active));
    }
  }

  /** Show one view region and hide the other; both stay in the DOM so their
   *  persistent listeners survive the swap. Entering Tree flushes an unlock FX
   *  that was deferred while the tree was hidden (once, using its stored layout). */
  _applyView() {
    const inTree = this._view === VIEW_TREE;
    if (this.searchEl) this.searchEl.hidden = inTree;
    if (this.categoriesEl) this.categoriesEl.hidden = inTree;
    if (this.bodyEl) this.bodyEl.hidden = inTree;
    if (this.treeEl) this.treeEl.hidden = !inTree;
    if (inTree && this._pendingFx) {
      const pending = this._pendingFx;
      this._pendingFx = null;
      this._playUnlockFx(pending.ids, pending.layout);
    }
  }

  /**
   * Rebuild `#shop-tree` from the config + the controller's `nodeStates` map, but
   * ONLY when its signature changed (a wallet-only re-render leaves the nodes
   * alone). The geometry comes from the pure `layoutSkillTree` engine: one
   * absolutely-placed `.skill-branch` lane per NON-EMPTY branch, an SVG edge layer
   * of straight parent-top -> child-bottom lines, and `.skill-node`s placed at
   * their depth-derived row. A `skillFail` shows an explicit error + Retry.
   *
   * Search/category are deliberately NOT consulted — the tree is the full graph.
   *
   * @param {unknown} skillTree - Normalized config from the view.
   * @param {Map<string,string>|object|null} nodeStates - Node id -> state.
   * @param {unknown} skillFail - Error string/flag from the skill-tree load.
   * @param {unknown} newlyUnlocked - Node ids newly achieved this render.
   * @returns {void}
   */
  _renderTree(skillTree, nodeStates, skillFail, newlyUnlocked) {
    if (!this.treeEl) return;
    const branches = treeBranches(skillTree, nodeStates);
    const nodes = [];
    for (const branch of branches) for (const node of branch.nodes) nodes.push(node);

    let fail = '';
    if (typeof skillFail === 'string') fail = skillFail.trim();
    else if (skillFail && typeof skillFail.message === 'string') fail = skillFail.message;
    else if (skillFail) fail = TREE_ERROR_LABEL;

    // The canvas at least fills the live scroll container so the columns spread
    // across the sidebar. While the tree is hidden this reads 0 and the layout
    // falls back to its content width; the next visible render re-lays it out.
    const canvasWidth = this.treeEl.clientWidth || 0;
    const layout = layoutSkillTree(branches, { minCanvasWidth: canvasWidth });

    const nodeSig = (n) =>
      `${n.id}\u0000${n.state}\u0000${n.name}\u0000${n.depth}\u0000${n.levelReward}\u0000${n.coinReward}\u0000${n.parent}`;
    const signature =
      `${fail}\u0002${canvasWidth}\u0002${layout.edges.length}\u0002` +
      branches.map((b) => `${b.id}\u0000${b.name}\u0003${b.nodes.map(nodeSig).join('\u0001')}`).join('\u0004');

    if (signature !== this._treeSignature) {
      this._treeSignature = signature;
      // A structure/width change rebuilds the tree, so any in-flight or deferred
      // FX is meaningless: cancel it before the old elements are discarded.
      this._cancelUnlockFx();
      this._nodeEls = new Map();
      this._edgeEls = new Map();
      clear(this.treeEl);

      if (fail !== '') {
        const line = document.createElement('div');
        line.className = 'shop-empty';
        line.textContent = fail;
        this.treeEl.appendChild(line);
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.setAttribute('data-action', 'retry');
        retry.textContent = RETRY_LABEL;
        this.treeEl.appendChild(retry);
      } else if (nodes.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'shop-empty';
        empty.textContent = TREE_EMPTY_LABEL;
        this.treeEl.appendChild(empty);
      } else {
        const canvas = document.createElement('div');
        canvas.className = 'skill-tree-canvas';
        canvas.style.width = `${layout.width}px`;
        canvas.style.height = `${layout.height}px`;

        // Edge layer UNDER every lane. SVG is built with createElementNS and
        // attribute-by-attribute (never innerHTML); `pathLength="1"` pairs with the
        // CSS `stroke-dasharray:1` so the one-shot `edge-fill` is visible and its
        // `animationend` fires.
        const svgNS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('class', 'skill-tree-edges');
        for (const edge of layout.edges) {
          const line = document.createElementNS(svgNS, 'line');
          line.setAttribute('id', edge.id);
          line.setAttribute('data-edge', '');
          line.setAttribute('data-child-id', edge.childId);
          line.setAttribute('data-state', edge.childState === 'achieved' ? 'lit' : 'dim');
          line.setAttribute('x1', String(edge.x1));
          line.setAttribute('y1', String(edge.y1));
          line.setAttribute('x2', String(edge.x2));
          line.setAttribute('y2', String(edge.y2));
          line.setAttribute('pathLength', '1');
          svg.appendChild(line);
          this._edgeEls.set(edge.id, line);
        }
        canvas.appendChild(svg);

        // One lane per NON-EMPTY branch, absolutely placed at its column's centre
        // so every node in a branch shares one centerX. The lane's top is 0, so a
        // node's `top` is the canvas-absolute y the layout computed.
        const descriptorById = new Map();
        for (const branch of branches) for (const node of branch.nodes) descriptorById.set(node.id, node);
        const columnByBranch = new Map();
        for (const column of layout.columns) columnByBranch.set(column.branchId, column);

        for (const branch of branches) {
          if (branch.nodes.length === 0) continue;
          const column = columnByBranch.get(branch.id);
          const lane = document.createElement('div');
          lane.className = 'skill-branch';
          lane.setAttribute('data-branch-id', branch.id);
          if (column) lane.style.left = `${column.centerX - layout.nodeWidth / 2}px`;
          lane.style.width = `${layout.nodeWidth}px`;
          if (branch.name !== '') {
            lane.setAttribute('role', 'group');
            lane.setAttribute('aria-label', branch.name);
          }
          for (const placed of layout.nodes) {
            if (placed.branchId !== branch.id) continue;
            const descriptor = descriptorById.get(placed.id);
            if (descriptor === undefined) continue;
            const el = this._buildNode(descriptor);
            el.style.top = `${placed.y}px`;
            el.style.left = '0px';
            el.style.width = `${placed.width}px`;
            el.style.height = `${placed.height}px`;
            lane.appendChild(el);
            this._nodeEls.set(placed.id, el);
          }
          canvas.appendChild(lane);
        }
        this.treeEl.appendChild(canvas);
      }
    }

    // The gate: only a GENUINE unlock batch (a truthy return) may play the FX, so
    // re-passing the same batch on an unrelated re-render can never replay it.
    const fired = this._applyUnlockHighlight(newlyUnlocked, skillTree);
    if (fired) this._playUnlockFx(newlyUnlocked, layout);
  }

  /**
   * Build one `.skill-node` from a descriptor. Every string is written with
   * `textContent`; the class/data attributes are the frozen Task 21 styling hooks.
   *
   * @param {object} node - A descriptor from `treeNodes`.
   * @returns {HTMLElement} The node element.
   */
  _buildNode(node) {
    const el = document.createElement('div');
    el.className = 'skill-node';
    el.setAttribute('data-node-id', node.id);
    el.setAttribute('data-state', node.state);
    el.setAttribute('data-depth', String(node.depth));

    const name = document.createElement('div');
    name.className = 'skill-node-name';
    name.textContent = node.name;
    el.appendChild(name);

    const reward = document.createElement('div');
    reward.className = 'skill-node-reward';
    reward.textContent = node.rewardText;
    el.appendChild(reward);

    return el;
  }

  /**
   * Unlock feedback (decision 12): toast once per batch and RETURN whether this
   * render carried a genuine, not-yet-seen batch. The one-shot node pulse and the
   * edge fill are NOT applied here — `_playUnlockFx` is their single owner, so a
   * re-render that re-passes the same batch can never double-pulse a node. The
   * toast is app-level feedback, so it fires even while the tree is not showing.
   *
   * @param {unknown} newlyUnlocked - Node ids newly achieved this render.
   * @param {unknown} skillTree - Normalized config (for the toast names).
   * @returns {boolean} `true` only when a non-empty, new-signature batch fired.
   */
  _applyUnlockHighlight(newlyUnlocked, skillTree) {
    const ids = Array.isArray(newlyUnlocked) ? newlyUnlocked.filter((id) => typeof id === 'string' && id !== '') : [];
    if (ids.length === 0) {
      // An empty batch is a legitimate no-op render: a plain wallet re-render
      // (the controller re-primes its diff), a persisted reload, or a reset that
      // CLEARED the achievement ledger. Forget the last batch signature so a
      // later GENUINE unlock of the same node id — e.g. re-achieving `a` after
      // "Reset progress" — fires the toast + one-shot highlight again. This
      // cannot re-announce a reload or a re-render: those always deliver an empty
      // batch (the diff was re-primed), so nothing is announced here.
      this._lastUnlockSignature = null;
      return false;
    }

    const signature = ids.slice().sort().join('\u0000');
    if (signature === this._lastUnlockSignature) return false;
    this._lastUnlockSignature = signature;

    const message = unlockToast(ids, skillTree);
    if (message !== '') this.callbacks?.onToast?.(message);
    return true;
  }

  /**
   * P5: the SINGLE owner of the node pulse AND the edge fill, so the two can never
   * fight over the same DOM. Plays only while the tree is on screen; otherwise the
   * batch (and the layout that owns its edge ids) is deferred and replayed once on
   * the next switch into the Tree view. Ids run in the order given; a node with a
   * parent edge fills that line first and only pulses AFTER the fill ends, then
   * the chain advances — a root has no edge and just pulses.
   *
   * @param {unknown} newlyUnlocked - Node ids from the genuine unlock batch.
   * @param {object|null} layout - The layout whose `edges[]` describe the lines.
   * @returns {void}
   */
  _playUnlockFx(newlyUnlocked, layout) {
    const ids = Array.isArray(newlyUnlocked) ? newlyUnlocked.filter((id) => typeof id === 'string' && id !== '') : [];
    if (ids.length === 0) return;

    if (!this.treeEl || this.treeEl.hidden !== false) {
      // Not on screen: remember the batch and play it ONCE on entry to Tree. The
      // toast already fired from `_applyUnlockHighlight`.
      this._pendingFx = { ids, layout };
      return;
    }

    this._cancelUnlockFx();
    const token = {};
    this._fxToken = token;

    const edges = layout !== null && typeof layout === 'object' && Array.isArray(layout.edges) ? layout.edges : [];
    const edgeByChild = new Map();
    for (const edge of edges) {
      if (edge !== null && typeof edge === 'object' && typeof edge.childId === 'string') edgeByChild.set(edge.childId, edge);
    }

    let index = 0;
    const next = () => {
      if (this._fxToken !== token) return;
      if (index >= ids.length) return;
      const id = ids[index];
      index += 1;
      const node = this._nodeEls.get(id);
      if (!node || !node.classList) {
        next();
        return;
      }
      const edge = edgeByChild.get(id);
      const line = edge !== undefined && this._edgeEls ? this._edgeEls.get(edge.id) : null;
      if (line && line.classList) {
        line.classList.add(EDGE_FILLING_CLASS);
        this._fxEls.add(line);
        let settled = false;
        let timer = null;
        const finish = () => {
          if (settled || this._fxToken !== token) return;
          settled = true;
          if (timer !== null) {
            clearTimeout(timer);
            this._highlightTimers.delete(timer);
          }
          line.classList.remove(EDGE_FILLING_CLASS);
          this._pulseNode(node, token, next);
        };
        line.addEventListener('animationend', finish, { once: true });
        timer = setTimeout(finish, EDGE_FILL_FALLBACK_MS);
        this._highlightTimers.add(timer);
        return;
      }
      this._pulseNode(node, token, next);
    };
    next();
  }

  /**
   * Run one flash-safe node pulse: add the one-shot class, then remove it on
   * `animationend` (with a timeout fallback for reduced-motion), then advance the
   * FX chain. A stale chain (token changed by a rebuild/replay) is a no-op.
   *
   * @param {Element} node - The mounted `.skill-node`.
   * @param {object} token - Identity of the FX chain that owns this pulse.
   * @param {Function} after - Callback to run when the pulse settles.
   * @returns {void}
   */
  _pulseNode(node, token, after) {
    if (this._fxToken !== token) return;
    node.classList.add(NEWLY_ACHIEVED_CLASS);
    this._fxEls.add(node);
    let settled = false;
    let timer = null;
    const finish = () => {
      if (settled || this._fxToken !== token) return;
      settled = true;
      if (timer !== null) {
        clearTimeout(timer);
        this._highlightTimers.delete(timer);
      }
      node.classList.remove(NEWLY_ACHIEVED_CLASS);
      if (typeof after === 'function') after();
    };
    node.addEventListener('animationend', finish, { once: true });
    timer = setTimeout(finish, HIGHLIGHT_FALLBACK_MS);
    this._highlightTimers.add(timer);
  }

  /**
   * Cancel an in-flight or deferred unlock FX: invalidate the chain token, clear
   * every pending timer, and strip the FX classes off tracked elements. Called
   * whenever `_treeSignature` changes, so a re-render can never restart an
   * animation and the steady look comes from `data-state` alone.
   *
   * @returns {void}
   */
  _cancelUnlockFx() {
    this._fxToken = null;
    this._pendingFx = null;
    for (const timer of this._highlightTimers) clearTimeout(timer);
    this._highlightTimers.clear();
    for (const el of this._fxEls) {
      if (!el || !el.classList) continue;
      el.classList.remove(NEWLY_ACHIEVED_CLASS);
      el.classList.remove(EDGE_FILLING_CLASS);
    }
    this._fxEls.clear();
  }

  /**
   * Reconcile the persistent toolbar with the current taxonomy and filter state.
   * Chips are built from `categoryChips` ONLY when the taxonomy signature
   * changes; every other render just writes the input value and the active chip,
   * so focus in `#shop-search` is never disturbed.
   *
   * @param {unknown} categories - Normalized taxonomy from the view.
   * @returns {void}
   */
  _syncToolbar(categories) {
    this._categories = Array.isArray(categories) ? categories : [];
    const chips = categoryChips(this._categories);
    const signature = chips.map((c) => `${c.id}\u0000${c.label}\u0000${c.icon}`).join('\u0001');

    if (this.categoriesEl && signature !== this._categoriesSignature) {
      this._categoriesSignature = signature;
      this._chipEls = new Map();
      clear(this.categoriesEl);
      for (const chip of chips) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'shop-cat-chip';
        button.setAttribute('data-category', chip.id);
        // The authored icon rides a `data-icon` CSS marker (`content: attr()`), so
        // the chip's text stays exactly the label — never "icon + label".
        if (chip.icon !== '') button.setAttribute('data-icon', chip.icon);
        button.setAttribute('aria-pressed', 'false');
        button.textContent = chip.label;
        this.categoriesEl.appendChild(button);
        this._chipEls.set(chip.id, button);
      }
    }

    // A persisted selection that vanished from the taxonomy falls back to `all`.
    if (!this._chipEls.has(this._categoryId)) this._categoryId = ALL_CATEGORY;

    if (this.searchEl) this.searchEl.value = this._query;
    this._syncActiveChip();
  }

  /** Paint the active chip class + `aria-pressed` from `_categoryId`. */
  _syncActiveChip() {
    for (const [id, chip] of this._chipEls) {
      const active = id === this._categoryId;
      if (chip.classList) chip.classList.toggle('active', active);
      chip.setAttribute('aria-pressed', String(active));
    }
  }

  /** Repaint the list from the last snapshot (used by the toolbar listeners so a
   *  filter change does not need a controller round-trip). */
  _paintModels() {
    if (!this._lastRender) return;
    const { state, models, hasState } = this._lastRender;
    this._renderModels(state, models, hasState);
  }

  /**
   * Rebuild the whole sidebar from a state snapshot (no incremental patching of
   * the list; the persistent toolbar is reconciled in place).
   *
   * @param {object} [view] - Snapshot from the controller:
   *   `{ state, catalog, categories, errors, fetchError, loading, resolved }`.
   *   `resolved:true` marks a completed catalog load (clears a stale error banner).
   *   `categories` is optional in Wave A and degrades to just the `all` chip.
   *   Wave B adds `{ view, skillTree, nodeStates, skillFail, newlyUnlocked }`;
   *   absent `view` keeps the current one (default `shop`).
   * @returns {void}
   */
  render(view) {
    const v = view !== null && typeof view === 'object' ? view : {};
    const hasState = v.state !== null && typeof v.state === 'object';
    const state = hasState ? v.state : {};
    const catalog = v.catalog !== null && typeof v.catalog === 'object' ? v.catalog : {};
    const models = Array.isArray(catalog.models) ? catalog.models : [];
    const errors = Array.isArray(v.errors) ? v.errors : [];
    const fetchError = v.fetchError || null;
    const loading = v.loading === true;

    // A failure must survive re-renders that carry no error (a state change such
    // as expanding the rail calls `render` with `fetchError:null`), so it stays
    // until a render actually reports a RESOLVED load. `resolved` is set only by
    // the successful catalog render, so a valid-but-empty catalog still clears the
    // banner while a subscriber's no-error re-render cannot hide a real failure.
    if (fetchError || errors.length) this._lastError = { errors, fetchError };
    else if (v.resolved === true) this._lastError = { errors: [], fetchError: null };
    const shown = this._lastError || { errors: [], fetchError: null };

    // Rail signal: a catalog failure must be visible even while the panel is
    // collapsed (the status region is hidden in the rail), so `render` owns a
    // `has-error` class that CSS turns into a red toggle + "!" badge.
    if (this.element) {
      this.element.classList.toggle('has-error', Boolean(shown.fetchError) || shown.errors.length > 0);
    }

    // Wallet readout.
    if (this.coinsEl) this.coinsEl.textContent = String(state.coins ?? 0);
    if (this.levelEl) this.levelEl.textContent = `Lv ${state.level ?? 0}`;

    // Persisted collapse flag; below the breakpoint the rail stays the default
    // unless the user explicitly toggled it open (see `_applyCollapse`).
    this._applyCollapse(state.collapsed);

    // View switch (persistent toggle): a render may carry a view, otherwise the
    // panel keeps whatever the user last chose. Only classes/aria/hidden change —
    // the toolbar itself is never rebuilt.
    if (v.view === VIEW_TREE || v.view === VIEW_SHOP) this._view = v.view;
    this._syncViewToggle();
    this._applyView();

    // Toolbar first: it establishes `_categories` used by the list filter.
    this._syncToolbar(v.categories);
    this._lastRender = { state, models, hasState };
    this._renderStatus(shown.errors, shown.fetchError, loading);
    this._renderModels(state, models, hasState);
    this._renderTree(v.skillTree, v.nodeStates, v.skillFail, v.newlyUnlocked);
  }

  /**
   * Paint `#shop-status`: request error(s) + a Retry control take precedence,
   * otherwise a loading note, otherwise the region is cleared.
   *
   * @param {Array<*>} errors - Per-entry catalog errors.
   * @param {*} fetchError - Network/parse failure message.
   * @param {boolean} loading - Whether the catalog request is in flight.
   * @returns {void}
   */
  _renderStatus(errors, fetchError, loading) {
    if (!this.statusEl) return;
    clear(this.statusEl);

    const messages = [];
    if (fetchError) messages.push(String(fetchError));
    for (const error of errors) if (error) messages.push(String(error));

    if (messages.length) {
      for (const message of messages) {
        const line = document.createElement('div');
        line.textContent = message;
        this.statusEl.appendChild(line);
      }
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.setAttribute('data-action', 'retry');
      retry.textContent = RETRY_LABEL;
      this.statusEl.appendChild(retry);
      return;
    }

    if (loading) {
      const line = document.createElement('div');
      line.textContent = LOADING_LABEL;
      this.statusEl.appendChild(line);
    }
  }

  /**
   * Rebuild `#shop-body` from the active query/category: one `.shop-category`
   * heading per non-empty bucket (taxonomy order, `Other` last) and one card per
   * model. When nothing matches, render an explicit `.shop-empty` note instead of
   * a blank region.
   *
   * @param {object} state - Economy/UI state.
   * @param {Array<object>} models - Catalog models.
   * @param {boolean} hasState - Whether `state` is a real controller state (not a
   *   pre-init placeholder); when false NO cards are built, so the unlock engine is
   *   never asked to judge a model against a fake empty economy.
   * @returns {void}
   */
  _renderModels(state, models, hasState) {
    if (!this.bodyEl) return;
    clear(this.bodyEl);
    if (!hasState) return;

    const groups = filterGroups(models, this._categories, this._query, this._categoryId);

    if (groups.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'shop-empty';
      empty.textContent = EMPTY_LABEL;
      this.bodyEl.appendChild(empty);
      return;
    }

    for (const group of groups) {
      const heading = document.createElement('h3');
      heading.className = 'shop-category';
      heading.setAttribute('data-category', group.categoryId);
      heading.textContent = group.label;
      this.bodyEl.appendChild(heading);

      for (const model of group.models) {
        if (model === null || typeof model !== 'object') continue;
        this.bodyEl.appendChild(this._buildCard(state, model));
      }
    }
  }

  /**
   * Build one `.shop-card` for a model, using the pure unlock engine for its state.
   *
   * A click anywhere on the card (outside its own controls) reports selection via
   * `onSelectModel` — locked cards are previewable. The drag handle is rendered
   * ONLY for models the unlock engine reports as `unlocked`, and reports intent
   * via `onDragStart(model, event)`; the `Add`/`Unlock` button stays the
   * tap/keyboard fallback.
   *
   * Regions, top to bottom: the fixed-aspect `.shop-card-preview` media box (an
   * `<img class="shop-card-thumb">` when `getThumbnail` has a cached data URL,
   * otherwise a `.shop-card-thumb-placeholder` — never blank), then
   * `.shop-card-name`, `.shop-badge`, and (for unlocked models) the drag handle
   * and the action button.
   *
   * @param {object} state - Economy/UI state.
   * @param {object} model - Catalog model.
   * @returns {HTMLElement} The card.
   */
  _buildCard(state, model) {
    const info = unlock.status(state, model);
    const action = cardAction(info);
    const id = typeof model.id === 'string' ? model.id : '';

    const card = document.createElement('div');
    card.className = 'shop-card';
    card.setAttribute('data-model-id', id);
    if (action.action === 'locked') card.classList.add('is-locked');

    // Card buttons/handles are transient (the card is rebuilt every render), so
    // their listeners die with the node. The click is delegated manually by
    // checking the event target, so the action button and drag handle never also
    // trigger a preview.
    card.addEventListener('click', (event) => {
      const target = event && event.target;
      const control =
        target && typeof target.closest === 'function' ? target.closest('[data-action], [data-drag-handle]') : null;
      if (control) return;
      this.callbacks?.onSelectModel?.(model);
    });

    // Preview region: a fixed-aspect media box that is the card's FIRST child,
    // above the name. The panel is a PURE renderer, so the thumbnail is a
    // SYNCHRONOUS cache read via `getThumbnail(modelId)` — never an await, never
    // an import. A hit renders `<img class="shop-card-thumb">`; a miss (or
    // non-string result) renders a neutral CSS `.shop-card-thumb-placeholder`,
    // so the region is NEVER empty. The region is deliberately neither
    // `[data-action]` nor `[data-drag-handle]`, so a tap on it still routes to
    // `onSelectModel` through the delegated card click bound above.
    const preview = document.createElement('div');
    preview.className = 'shop-card-preview';
    const thumbUrl = this.callbacks?.getThumbnail?.(model.id);
    if (typeof thumbUrl === 'string' && thumbUrl !== '') {
      const thumb = document.createElement('img');
      thumb.className = 'shop-card-thumb';
      thumb.setAttribute('src', thumbUrl);
      thumb.setAttribute('alt', '');
      thumb.setAttribute('aria-hidden', 'true');
      preview.appendChild(thumb);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'shop-card-thumb-placeholder';
      placeholder.setAttribute('aria-hidden', 'true');
      preview.appendChild(placeholder);
    }
    card.appendChild(preview);

    const name = document.createElement('div');
    name.className = 'shop-card-name';
    name.textContent = typeof model.name === 'string' ? model.name : '';
    card.appendChild(name);

    // The badge carries the engine's own words ("free", "owned", "reach level 2",
    // "pay 40 coins") — never authored here.
    const badge = document.createElement('span');
    badge.className = 'shop-badge';
    badge.textContent = typeof info.reason === 'string' ? info.reason : '';
    card.appendChild(badge);

    // Drag handle: ONLY for usable (unlocked) models, so a locked model can never
    // be dragged out. It is pointer-only and intentionally not focusable —
    // `aria-hidden` keeps it out of the a11y tree (the Add button is the path).
    if (info.unlocked === true) {
      const handle = document.createElement('div');
      handle.className = 'shop-drag-handle';
      handle.setAttribute('data-drag-handle', id);
      handle.setAttribute('aria-hidden', 'true');
      handle.textContent = DRAG_LABEL;
      handle.addEventListener('pointerdown', (event) => this.callbacks?.onDragStart?.(model, event));
      card.appendChild(handle);
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'shop-action';
    button.setAttribute('data-action', action.action);
    button.textContent = action.label;
    button.disabled = action.disabled;
    if (action.ariaLabel !== null) button.setAttribute('aria-label', action.ariaLabel);
    button.addEventListener('click', () => {
      if (action.action === 'place') this.callbacks?.onPlace?.(model);
      else if (action.action === 'buy') this.callbacks?.onBuy?.(model);
    });
    card.appendChild(button);

    return card;
  }

  /**
   * Detach the listeners this panel added (toggle, status retry, tree retry,
   * debug strip, search, categories, view toggle) and cancel any pending
   * highlight timers so repeated construction cannot leak. Idempotent.
   *
   * @returns {void}
   */
  destroy() {
    if (this.toggleEl) this.toggleEl.removeEventListener('click', this._onToggle);
    if (this.statusEl) this.statusEl.removeEventListener('click', this._onStatusClick);
    if (this.treeEl) this.treeEl.removeEventListener('click', this._onTreeClick);
    if (this.debugEl) this.debugEl.removeEventListener('click', this._onDebugClick);
    if (this.searchEl) this.searchEl.removeEventListener('input', this._onSearchInput);
    if (this.categoriesEl) this.categoriesEl.removeEventListener('click', this._onCategoryClick);
    if (this.viewToggleEl) this.viewToggleEl.removeEventListener('click', this._onViewClick);
    if (this._mql) this._mql.removeEventListener('change', this._onViewportChange);
    this._cancelUnlockFx();
    this.callbacks = {};
  }
}
