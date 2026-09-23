/**
 * shop-resize.js — sidebar width clamp + pointer resize handle for #shop-sidebar.
 *
 * WHY IT LOOKS LIKE THIS:
 *  - The width is applied as the CSS custom property `--shop-w` on the sidebar,
 *    NEVER as an inline `style.width`. Inline width would out-rank the stylesheet's
 *    `.collapsed` 56px rail and the `<1180px` media query (a verified trap: the
 *    sidebar could not collapse or fall back to the rail once dragged).
 *  - The clamp is a PURE function so the geometry rule is provable in plain Node
 *    without a DOM: `clampSidebarWidth(width, viewportWidth, opts) -> integer px`.
 *  - Persistence is the CALLER's job. This module only ever calls `onCommit(width)`
 *    at drag end; it never touches localStorage or the shop store.
 *  - The pointer flow mirrors `src/main.js:850-894` (#splitter): capture the pointer,
 *    remember where inside the handle the drag started (grab offset) so the edge does
 *    not snap under the cursor, then apply on every move.
 *
 * @module ui/shop-resize
 */

/** Default clamp options. Exported so callers/tests share the exact numbers. */
export const SHOP_RESIZE_DEFAULTS = Object.freeze({
  min: 180,
  maxRatio: 0.42,
  canvasFloor: 444,
});

/** The media query whose flip must re-clamp the sidebar (the 56px rail breakpoint). */
export const SHOP_RAIL_MEDIA_QUERY = '(max-width: 1180px)';

/** The CSS custom property the sidebar reads for its expanded width. */
export const SHOP_WIDTH_PROPERTY = '--shop-w';

/**
 * Coerce an option to a finite positive integer, else fall back.
 *
 * @param {*} value - Hostile input tolerated.
 * @param {number} fallback - Value to use when `value` is not a usable positive number.
 * @returns {number} A positive integer.
 */
function positiveInt(value, fallback) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }
  return fallback;
}

/**
 * Coerce an option to a finite ratio in (0, 1), else fall back.
 *
 * @param {*} value - Hostile input tolerated.
 * @param {number} fallback - Value to use when `value` is not a usable ratio.
 * @returns {number} A ratio strictly between 0 and 1.
 */
function unitRatio(value, fallback) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 1) {
    return value;
  }
  return fallback;
}

/**
 * Coerce an option to a finite non-negative integer, else fall back.
 *
 * @param {*} value - Hostile input tolerated.
 * @param {number} fallback - Value to use when `value` is not a usable floor.
 * @returns {number} A non-negative integer.
 */
function nonNegativeInt(value, fallback) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.round(value);
  }
  return fallback;
}

/**
 * Coerce a requested sidebar width to a finite number, NEVER throwing.
 * `Infinity` is treated as "as wide as allowed"; NaN / -Infinity / strings / null /
 * undefined / objects degrade to `min` (the conservative, always-valid request).
 *
 * @param {*} width - Hostile width input.
 * @param {number} min - The resolved minimum (used as the safe degradation value).
 * @returns {number} A finite number (possibly huge), never NaN.
 */
function coerceRequestedWidth(width, min) {
  if (typeof width === 'number') {
    if (Number.isFinite(width)) return width;
    if (width === Infinity) return Number.MAX_SAFE_INTEGER;
  }
  return min;
}

/**
 * Clamp a requested sidebar width to a safe, integer px value.
 *
 * PURE — no DOM, no storage, no randomness. Rules, in order:
 *  1. Hostile `width` coerces to a finite number (see `coerceRequestedWidth`).
 *  2. The result is at least `min`.
 *  3. The effective max is the TIGHTER of two caps:
 *       - the layout cap `availableWidth - canvasFloor`, which keeps the 3D canvas
 *         at its design floor, and
 *       - the share cap `round(availableWidth * maxRatio)`, which limits the sidebar
 *         to its fraction of the shared region.
 *     `maxRatio` therefore really bounds a drag on the measured path, and because it
 *     is combined with `Math.min` it can never RAISE the max above the layout cap —
 *     the canvas floor stays the hard invariant. `min` still wins on a region too
 *     small for both (a sub-min sidebar is worse than a slightly under-floor canvas).
 *     When the available region is unknown/invalid the effective max falls back to a
 *     nominal ratio-derived cap (`min / maxRatio`) so the handle still has a growth
 *     range off-browser.
 *
 * IMPORTANT — what the second argument means: it is the width actually available to
 * the sidebar PLUS the canvas (the region they split), NOT `window.innerWidth`. In
 * the studio that region is `#main`'s content box minus the right `#sidebar` and the
 * flex gaps; measure it with `measureShopAvailableWidth()` and pass the result.
 * Feeding the whole window here is the exact bug that let a max drag collapse
 * `#viewport` to ~84px (the canvas also loses the fixed right sidebar + padding +
 * gaps, none of which `window.innerWidth` accounts for).
 *
 * @param {*} width - Requested width in px (hostile tolerated).
 * @param {*} availableWidth - Width available to the sidebar + canvas region, in px
 *   (hostile tolerated). Use `measureShopAvailableWidth()` to derive it from layout.
 * @param {{min?: number, maxRatio?: number, canvasFloor?: number}} [options] -
 *   Clamp tuning. Defaults: min 180, maxRatio 0.42, canvasFloor 444. `maxRatio` is
 *   the sidebar's maximum share of the shared region (a fraction in (0, 1)).
 * @returns {number} An integer px width in `[min, effectiveMax]`.
 */
export function clampSidebarWidth(width, availableWidth, options) {
  const opts = options !== null && typeof options === 'object' ? options : {};
  const min = positiveInt(opts.min, SHOP_RESIZE_DEFAULTS.min);
  const ratio = unitRatio(opts.maxRatio, SHOP_RESIZE_DEFAULTS.maxRatio);
  const floor = nonNegativeInt(opts.canvasFloor, SHOP_RESIZE_DEFAULTS.canvasFloor);

  const requested = coerceRequestedWidth(width, min);

  const hasViewport =
    typeof availableWidth === 'number' && Number.isFinite(availableWidth) && availableWidth > 0;

  let effectiveMax;
  if (hasViewport) {
    // Two caps, whichever is tighter:
    //  - the layout cap keeps the canvas's design floor (`availableWidth - floor`);
    //  - the share cap limits the sidebar to `maxRatio` of the shared region.
    // `min` wins only on a region too small for both (a sub-min sidebar is worse
    // than a slightly under-floor canvas). Because the share cap is combined with
    // `Math.min`, `maxRatio` can never RAISE the max above the layout cap — the
    // canvas floor stays the hard invariant.
    const layoutCap = Math.floor(availableWidth - floor);
    const shareCap = Math.round(availableWidth * ratio);
    effectiveMax = Math.max(min, Math.min(layoutCap, shareCap));
  } else {
    // No (usable) region to derive from — use the ratio against the minimum so
    // the clamp stays total and still grants a sane drag range.
    effectiveMax = Math.max(min, Math.round(min / ratio));
  }

  const bounded = Math.min(Math.max(requested, min), effectiveMax);
  return Math.round(bounded);
}

/**
 * Read an element's bounding rect, or `null` when it is missing/unreadable.
 *
 * @param {Element} el - Candidate element.
 * @returns {DOMRect|null} The rect when it has a finite width, else `null`.
 */
function rectOf(el) {
  try {
    if (!el || typeof el.getBoundingClientRect !== 'function') return null;
    const rect = el.getBoundingClientRect();
    return rect && Number.isFinite(rect.width) ? rect : null;
  } catch (err) {
    return null;
  }
}

/**
 * Measure the width actually available to `#shop-sidebar` + `#viewport` inside `#main`.
 *
 * `#main` is a flex row (`shop | viewport | 320px right #sidebar`) with a 10px gap. The
 * canvas therefore only gets `#main`'s content-box width MINUS the right `#sidebar` and
 * MINUS the two inter-panel gaps. Clamping a drag against `window.innerWidth` ignored all
 * of that and let a max drag shrink `#viewport` to ~84px (it also re-broke on resize
 * because `reclampCurrent()` re-applied the stale over-wide value).
 *
 * Gaps are read from geometry (each panel's edges) rather than a hardcoded number, so a
 * stylesheet change to `gap` needs no code change here. Missing elements degrade to 0
 * for that term; a missing/zero `#main` yields `undefined` so callers can fall back.
 *
 * @param {object} [deps] - Layout elements; all optional but `mainEl` is required in practice.
 * @param {Element} [deps.mainEl] - `#main`, the flex row owning shop | viewport | sidebar.
 * @param {Element} [deps.rightSidebarEl] - the fixed-width right `#sidebar`.
 * @param {Element} [deps.shopSidebarEl] - `#shop-sidebar` (first child of `#main`).
 * @param {Element} [deps.viewportEl] - `#viewport` (flex:1 middle child of `#main`).
 * @returns {number|undefined} Integer available width in px, or `undefined` if unknown.
 */
export function measureShopAvailableWidth({ mainEl, rightSidebarEl, shopSidebarEl, viewportEl } = {}) {
  const mainRect = rectOf(mainEl);
  if (!mainRect || mainRect.width <= 0) return undefined;

  const rightRect = rectOf(rightSidebarEl);
  const viewportRect = rectOf(viewportEl);
  const shopRect = rectOf(shopSidebarEl);

  // One flex gap sits between #viewport and the right #sidebar, one between
  // #shop-sidebar and #viewport. Reading both from edges keeps the rule tied to the
  // real layout; a missing neighbour contributes 0.
  const gapRight = rightRect && viewportRect ? rightRect.left - viewportRect.right : 0;
  const gapLeft = viewportRect && shopRect ? viewportRect.left - shopRect.right : 0;
  const totalGaps = Math.max(0, gapRight) + Math.max(0, gapLeft);
  const rightWidth = rightRect ? rightRect.width : 0;

  // #main's rect includes its border + padding; the flex children lay out in the
  // content box. #main has neither today, but subtracting keeps the rule honest.
  let hPad = 0;
  let hBorder = 0;
  try {
    if (typeof getComputedStyle === 'function') {
      const view = getComputedStyle(mainEl);
      hPad = (parseFloat(view.paddingLeft) || 0) + (parseFloat(view.paddingRight) || 0);
      hBorder =
        (parseFloat(view.borderLeftWidth) || 0) + (parseFloat(view.borderRightWidth) || 0);
    }
  } catch (err) {
    /* an unreadable computed style leaves border/padding at 0 */
  }

  const available = mainRect.width - hBorder - hPad - rightWidth - totalGaps;
  return available > 0 ? Math.floor(available) : undefined;
}

/**
 * Read the current viewport width, or `undefined` off-browser/if unreadable.
 *
 * @returns {number|undefined} `window.innerWidth` when available and finite.
 */
function readViewportWidth() {
  try {
    if (typeof window !== 'undefined' && Number.isFinite(window.innerWidth)) {
      return window.innerWidth;
    }
  } catch (err) {
    /* a sandboxed window getter may throw — degrade to unknown */
  }
  return undefined;
}

/**
 * Default available-width reader for `attachShopResize` when the caller supplies no
 * `getAvailableWidth`: measure `#main` from the live document, else fall back to
 * `window.innerWidth` (host tests / a document-less environment).
 *
 * @param {HTMLElement} sidebarEl - The sidebar, used when `#shop-sidebar` is absent.
 * @returns {number|undefined} Available width in px, or `undefined` if unreadable.
 */
function measureFromDocument(sidebarEl) {
  try {
    if (typeof document !== 'undefined' && typeof document.getElementById === 'function') {
      const measured = measureShopAvailableWidth({
        mainEl: document.getElementById('main'),
        rightSidebarEl: document.getElementById('sidebar'),
        shopSidebarEl: sidebarEl || document.getElementById('shop-sidebar'),
        viewportEl: document.getElementById('viewport'),
      });
      if (Number.isFinite(measured)) return measured;
    }
  } catch (err) {
    /* fall through to the window-width fallback */
  }
  return readViewportWidth();
}

/**
 * Attach the pointer-driven resize handle to a sidebar.
 *
 * During a drag the helper writes `--shop-w` on `sidebarEl` (never `style.width`)
 * and clamps every move against the width actually available to the sidebar + canvas
 * (see `measureShopAvailableWidth`). It re-clamps whenever the `(max-width: 1180px)`
 * media query flips or the window resizes. At drag end it calls `onCommit(width)` —
 * persistence belongs to the caller. Returns a `destroy()` that removes every
 * listener and restores the cursor it set.
 *
 * Best-effort by design: a missing element or a throwing sensor degrades to a
 * no-op rather than crashing the app.
 *
 * @param {object} deps - Dependencies (all optional except the elements in practice).
 * @param {HTMLElement} deps.handleEl - The `#shop-resize` drag handle.
 * @param {HTMLElement} deps.sidebarEl - The `#shop-sidebar` element the `--shop-w`
 *   custom property is written to.
 * @param {() => number} [deps.getWidth] - Returns the caller's authoritative width
 *   (used when the media query flips); defaults to reading the sidebar's offsetWidth.
 * @param {() => (number|undefined)} [deps.getAvailableWidth] - Returns the live width
 *   available to the sidebar + canvas. Defaults to measuring `#main` in the DOM, then
 *   `window.innerWidth` as a last resort (host tests).
 * @param {(width: number) => void} [deps.onCommit] - Called once with the final
 *   clamped width at drag end.
 * @returns {() => void} `destroy()` — removes every listener and restores state.
 */
export function attachShopResize({ handleEl, sidebarEl, getWidth, getAvailableWidth, onCommit } = {}) {
  if (!handleEl || !sidebarEl) return () => {};

  const readWidth =
    typeof getWidth === 'function'
      ? getWidth
      : () => {
          try {
            return typeof sidebarEl.getBoundingClientRect === 'function'
              ? sidebarEl.getBoundingClientRect().width
              : 0;
          } catch (err) {
            return 0;
          }
      };
  const commit = typeof onCommit === 'function' ? onCommit : () => {};
  const readAvailable =
    typeof getAvailableWidth === 'function'
      ? getAvailableWidth
      : () => measureFromDocument(sidebarEl);

  const viewportOptions = SHOP_RESIZE_DEFAULTS;

  let dragging = false;
  let pointerId = null;
  let dragStartX = 0; // pointer clientX at pointerdown
  let dragStartWidth = 0; // sidebar width at pointerdown (the drag's anchor)
  let lastWidth = 0;

  /** Clamp `raw` against the live available region and write it as `--shop-w`. */
  function applyWidth(raw) {
    const clamped = clampSidebarWidth(raw, readAvailable(), viewportOptions);
    lastWidth = clamped;
    try {
      sidebarEl.style.setProperty(SHOP_WIDTH_PROPERTY, `${clamped}px`);
    } catch (err) {
      /* a detached/read-only style must not break the drag loop */
    }
    return clamped;
  }

  /** Re-clamp the caller's current width (used when the rail media query flips). */
  function reclampCurrent() {
    const current = typeof readWidth === 'function' ? readWidth() : 0;
    if (typeof current === 'number' && Number.isFinite(current)) applyWidth(current);
  }

  /** End the drag, releasing capture and committing the final width once. */
  function endDrag(commitWidth) {
    if (!dragging) return;
    dragging = false;
    if (pointerId !== null && typeof handleEl.releasePointerCapture === 'function') {
      try {
        handleEl.releasePointerCapture(pointerId);
      } catch (err) {
        /* capture may already be gone */
      }
    }
    pointerId = null;
    if (commitWidth) commit(lastWidth);
  }

  function onPointerDown(e) {
    dragging = true;
    pointerId = e && typeof e.pointerId === 'number' ? e.pointerId : null;
    if (pointerId !== null && typeof handleEl.setPointerCapture === 'function') {
      try {
        handleEl.setPointerCapture(pointerId);
      } catch (err) {
        /* a browser without capture still gets move events while pressed */
      }
    }
    // Anchor the drag to the width at pointerdown and move by the pointer DELTA,
    // so the sidebar never snaps under the cursor (the same grab-offset intent as
    // the #splitter drag). Reading the caller's width keeps state authoritative.
    dragStartX = e && typeof e.clientX === 'number' ? e.clientX : 0;
    const measured = typeof readWidth === 'function' ? readWidth() : 0;
    dragStartWidth = Number.isFinite(measured)
      ? measured
      : (typeof sidebarEl.getBoundingClientRect === 'function'
          ? sidebarEl.getBoundingClientRect().width
          : 0);
    applyWidth(dragStartWidth);
  }

  function onPointerMove(e) {
    if (!dragging || !e || typeof e.clientX !== 'number') return;
    applyWidth(dragStartWidth + (e.clientX - dragStartX));
  }

  function onPointerUp() {
    endDrag(true);
  }

  function onPointerCancel() {
    endDrag(true);
  }

  // --- media-query watcher: the rail breakpoint flip must re-clamp ---------------
  let mediaQueryList = null;
  let onMediaChange = null;
  try {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      mediaQueryList = window.matchMedia(SHOP_RAIL_MEDIA_QUERY);
      if (mediaQueryList) {
        onMediaChange = () => reclampCurrent();
        if (typeof mediaQueryList.addEventListener === 'function') {
          mediaQueryList.addEventListener('change', onMediaChange);
        } else if (typeof mediaQueryList.addListener === 'function') {
          mediaQueryList.addListener(onMediaChange); // Safari < 14 fallback
        }
      }
    }
  } catch (err) {
    mediaQueryList = null;
    onMediaChange = null;
  }

  // --- window-resize watcher: a shrink above the 1180px breakpoint must re-clamp ---
  // The media query only fires when the rail threshold is crossed; a plain resize
  // (e.g. 1400 -> 1200) shrinks the available region without crossing it, so the
  // stored width could otherwise stay wider than the new layout allows.
  let onResize = null;
  try {
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      onResize = () => reclampCurrent();
      window.addEventListener('resize', onResize);
    }
  } catch (err) {
    onResize = null;
  }

  // --- cursor: set here so the handle is draggable even before Task 9's CSS ------
  const previousCursor = handleEl.style ? handleEl.style.cursor : '';
  try {
    if (handleEl.style) handleEl.style.cursor = 'col-resize';
  } catch (err) {
    /* ignore */
  }

  handleEl.addEventListener('pointerdown', onPointerDown);
  handleEl.addEventListener('pointermove', onPointerMove);
  handleEl.addEventListener('pointerup', onPointerUp);
  handleEl.addEventListener('pointercancel', onPointerCancel);

  return function destroy() {
    endDrag(false);
    handleEl.removeEventListener('pointerdown', onPointerDown);
    handleEl.removeEventListener('pointermove', onPointerMove);
    handleEl.removeEventListener('pointerup', onPointerUp);
    handleEl.removeEventListener('pointercancel', onPointerCancel);
    if (mediaQueryList && onMediaChange) {
      if (typeof mediaQueryList.removeEventListener === 'function') {
        mediaQueryList.removeEventListener('change', onMediaChange);
      } else if (typeof mediaQueryList.removeListener === 'function') {
        mediaQueryList.removeListener(onMediaChange);
      }
    }
    mediaQueryList = null;
    onMediaChange = null;
    if (onResize && typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      try {
        window.removeEventListener('resize', onResize);
      } catch (err) {
        /* the window may already be gone */
      }
    }
    onResize = null;
    try {
      if (handleEl.style) handleEl.style.cursor = previousCursor;
    } catch (err) {
      /* ignore */
    }
  };
}
