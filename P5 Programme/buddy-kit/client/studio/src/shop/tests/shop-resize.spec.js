/**
 * shop-resize.test.js — synchronous node coverage for `src/ui/shop-resize.js`.
 *
 * Two layers, no browser:
 *  1. The PURE `clampSidebarWidth` is driven directly: min/floor enforcement, the
 *     viewport-derived max, total hostile-input coercion, and the unknown-viewport
 *     fallback. This is the correctness-critical geometry.
 *  2. `attachShopResize` is driven against a tiny fake Element/`matchMedia` double so
 *     the drag contract is asserted without jsdom: `--shop-w` is written (never
 *     `style.width`), every move is clamped, the media query flip re-clamps, the
 *     commit fires once at drag end, and `destroy()` removes every listener.
 *
 * Discovered and called by `test.mjs` as `export default function (check)`; the
 * harness does NOT await the call, so this module is entirely SYNCHRONOUS.
 */

import { readFileSync } from 'node:fs';
import {
  SHOP_RESIZE_DEFAULTS,
  SHOP_RAIL_MEDIA_QUERY,
  SHOP_WIDTH_PROPERTY,
  clampSidebarWidth,
  measureShopAvailableWidth,
  attachShopResize,
} from '../../ui/shop-resize.js';

const OPTS = { min: 180, maxRatio: 0.42, canvasFloor: 444 };
const MIN = 180;
const FLOOR = 444;
/**
 * The ratio-bounded max for a 1400px region: the layout cap is `1400 - 444 = 956`
 * and the share cap is `round(1400 * 0.42) = 588`; the tighter share cap wins.
 */
const MAX_1400 = 588;

// --- tiny DOM doubles ---------------------------------------------------------

/** A minimal Element: listeners, a live style bag, a rect, and pointer capture. */
function makeElement({ left = 0, width = 240 } = {}) {
  const listeners = new Map();
  const style = {
    cursor: '',
    _props: Object.create(null),
    setProperty(name, value) { style._props[name] = value; },
    getPropertyValue(name) { return style._props[name] || ''; },
    removeProperty(name) { delete style._props[name]; },
    // Deliberately NO `width` field: touching `style.width` leaves a visible trace.
  };
  return {
    style,
    _rect: { left, right: left + width, top: 0, bottom: 600, width, height: 600 },
    getBoundingClientRect() { return this._rect; },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const list = listeners.get(type);
      if (!list) return;
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    },
    dispatch(type, event = {}) {
      for (const fn of [...(listeners.get(type) || [])]) fn(event);
    },
    _listenerCount(type) { return (listeners.get(type) || []).length; },
    _captured: new Set(),
    setPointerCapture(id) { this._captured.add(id); },
    releasePointerCapture(id) { this._captured.delete(id); },
  };
}

/** A minimal MediaQueryList that records its change listeners. */
function makeMql() {
  const handlers = new Set();
  return {
    matches: false,
    addEventListener(type, fn) { if (type === 'change') handlers.add(fn); },
    removeEventListener(type, fn) { if (type === 'change') handlers.delete(fn); },
    addListener(fn) { handlers.add(fn); },
    removeListener(fn) { handlers.delete(fn); },
    fire(matches) {
      this.matches = matches;
      for (const fn of [...handlers]) fn({ matches });
    },
    _count() { return handlers.size; },
  };
}

/** Install a fake `window` for the duration of `fn`, restoring the previous one. */
function withWindow(win, fn) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'window');
  const prev = globalThis.window;
  globalThis.window = win;
  try {
    fn();
  } finally {
    if (had) globalThis.window = prev;
    else delete globalThis.window;
  }
}

export default function shopResizeTests(check) {
  // =========================================================================
  // 1. Pure clamp — constants and the headline rules
  // =========================================================================
  check(
    'shop-resize: clamp defaults are the frozen plan numbers',
    SHOP_RESIZE_DEFAULTS.min === 180 &&
      SHOP_RESIZE_DEFAULTS.maxRatio === 0.42 &&
      SHOP_RESIZE_DEFAULTS.canvasFloor === 444 &&
      SHOP_RAIL_MEDIA_QUERY === '(max-width: 1180px)' &&
      SHOP_WIDTH_PROPERTY === '--shop-w',
  );

  check('shop-resize: below-min clamps up to min', clampSidebarWidth(10, 1400, OPTS) === MIN);
  check('shop-resize: a value already in range passes through', clampSidebarWidth(300, 1400, OPTS) === 300);
  check(
    'shop-resize: above-max clamps to the ratio-bounded max',
    clampSidebarWidth(9999, 1400, OPTS) === MAX_1400,
  );
  check(
    'shop-resize: Infinity clamps to the ratio-bounded max',
    clampSidebarWidth(Infinity, 1400, OPTS) === MAX_1400,
  );
  check('shop-resize: -Infinity clamps up to min', clampSidebarWidth(-Infinity, 1400, OPTS) === MIN);

  // maxRatio is the live bound on the measured path: tighter lowers the max, looser
  // raises it up to (never past) the canvas-floor layout cap. The old dead-option bug
  // returned 956 for BOTH 0.42 and 0.95.
  check(
    'shop-resize: maxRatio really bounds the measured max (0.42 -> 588, 0.95 -> 956)',
    clampSidebarWidth(9999, 1400, { ...OPTS, maxRatio: 0.42 }) === 588 &&
      clampSidebarWidth(9999, 1400, { ...OPTS, maxRatio: 0.95 }) === 956,
  );

  // A loose maxRatio must NEVER raise the max above `availableWidth - canvasFloor`.
  const maxAtLooseRatio = clampSidebarWidth(9999, 1400, { ...OPTS, maxRatio: 0.95 });
  check(
    'shop-resize: the canvas floor still holds at the loosest maxRatio',
    maxAtLooseRatio === 1400 - FLOOR && 1400 - maxAtLooseRatio === FLOOR,
  );

  // 1024px region: layout cap = 580, share cap = round(1024 * 0.42) = 430 -> 430,
  // and the canvas still has 594px (above the 444 floor).
  const max1024 = 430;
  check(
    'shop-resize: 1024px region takes the ratio cap and still clears the canvas floor',
    clampSidebarWidth(9999, 1024, OPTS) === max1024 && 1024 - max1024 >= FLOOR,
  );

  // A custom min/canvasFloor pair proves the caps are not hard-coded to the defaults.
  check(
    'shop-resize: custom min/canvasFloor derive the max from the region (ratio-bounded)',
    clampSidebarWidth(50, 1000, { min: 200, canvasFloor: 400 }) === 200 &&
      clampSidebarWidth(9999, 1000, { min: 200, canvasFloor: 400 }) === Math.round(1000 * 0.42),
  );
  check(
    'shop-resize: a loose maxRatio lets the floor-derived custom max win',
    clampSidebarWidth(9999, 1000, { min: 200, canvasFloor: 400, maxRatio: 0.99 }) === 600,
  );

  // =========================================================================
  // 2. Pure clamp — hostile input totality
  // =========================================================================
  const hostileWidths = [NaN, Infinity, -Infinity, 'x', '', null, undefined, -5, -0.4, {}, [], true, false, () => {}];
  let allSafe = true;
  let allThrew = false;
  try {
    for (const hostile of hostileWidths) {
      const v = clampSidebarWidth(hostile, 1024, OPTS);
      if (!Number.isInteger(v) || v < MIN || v > max1024) allSafe = false;
    }
  } catch (err) {
    allThrew = true;
  }
  check('shop-resize: every hostile width yields an in-range integer', allSafe && !allThrew);

  const hostileViewports = [undefined, null, 'x', NaN, Infinity, -Infinity, 0, -10, {}, []];
  let viewportTotal = true;
  try {
    for (const vp of hostileViewports) {
      const v = clampSidebarWidth(240, vp, OPTS);
      if (!Number.isInteger(v) || v < MIN) viewportTotal = false;
    }
  } catch (err) {
    viewportTotal = false;
  }
  check('shop-resize: every hostile viewport degrades without throwing', viewportTotal);

  const hostileOptions = [null, undefined, 'x', 5, [], { min: 'x', maxRatio: 5, canvasFloor: -1 }, { min: NaN }];
  let optionsTotal = true;
  try {
    for (const o of hostileOptions) {
      const v = clampSidebarWidth(300, 1400, o);
      if (!Number.isInteger(v) || v < MIN || v > MAX_1400) optionsTotal = false;
    }
  } catch (err) {
    optionsTotal = false;
  }
  check('shop-resize: every hostile options bag degrades without throwing', optionsTotal);

  // Unknown viewport: no canvas floor derivable, but the result must still be a
  // finite integer >= min and a too-small request still clamps up.
  const unknownOk = [undefined, null, 'x', NaN, 0].every((vp) => {
    const v = clampSidebarWidth(240, vp, OPTS);
    return Number.isInteger(v) && v >= MIN && Number.isFinite(v);
  });
  check('shop-resize: unknown viewport falls back to a finite in-range cap', unknownOk);
  check('shop-resize: unknown viewport still enforces min', clampSidebarWidth(100, undefined, OPTS) === MIN);

  // Degenerate tiny viewport: min must win rather than go negative/zero.
  const tiny = clampSidebarWidth(9999, 300, OPTS);
  check('shop-resize: a viewport smaller than min+floor keeps min (no negative width)', tiny === MIN && tiny > 0);

  // =========================================================================
  // 3. DOM handler — pointer drag writes --shop-w (never style.width)
  // =========================================================================
  {
    const sidebar = makeElement({ left: 0, width: 240 });
    const handle = makeElement({ left: 240, width: 8 });
    const committed = [];
    let destroyed = null;
    withWindow({ innerWidth: 1400, matchMedia: () => null }, () => {
      const destroy = attachShopResize({
        handleEl: handle,
        sidebarEl: sidebar,
        getWidth: () => 240,
        onCommit: (w) => committed.push(w),
      });
      destroyed = destroy;

      check('shop-resize: attach returns a destroy function', typeof destroy === 'function');
      check('shop-resize: handle cursor is col-resize', handle.style.cursor === 'col-resize');

      // Drag start: grab the handle, width tracks without jumping.
      handle.dispatch('pointerdown', { clientX: 240, pointerId: 7 });
      check('shop-resize: pointerdown captures the pointer', handle._captured.has(7));
      check('shop-resize: pointerdown applies the current width', sidebar.style.getPropertyValue('--shop-w') === '240px');

      // Move right: grows. Move far right: clamps to the ratio-bounded 1400px max.
      handle.dispatch('pointermove', { clientX: 340, pointerId: 7 });
      check('shop-resize: pointermove applies the clamped width', sidebar.style.getPropertyValue('--shop-w') === '340px');
      handle.dispatch('pointermove', { clientX: 9999, pointerId: 7 });
      check(
        'shop-resize: pointermove clamps to the ratio-bounded max',
        sidebar.style.getPropertyValue('--shop-w') === `${MAX_1400}px`,
      );

      // The trap: inline width would defeat the rail/media-query rules.
      check('shop-resize: the handler NEVER assigns style.width', sidebar.style.width === undefined);
      check(
        'shop-resize: no width property surfaced anywhere on the style bag',
        !Object.prototype.hasOwnProperty.call(sidebar.style, 'width'),
      );

      check('shop-resize: onCommit is not called mid-drag', committed.length === 0);

      // Drag end: commit exactly once with the final clamped width.
      handle.dispatch('pointerup', { pointerId: 7 });
      check('shop-resize: pointerup commits the final width once', committed.length === 1 && committed[0] === MAX_1400);
      check('shop-resize: pointerup releases the pointer', !handle._captured.has(7));
      handle.dispatch('pointerup', { pointerId: 7 });
      check('shop-resize: a second pointerup does not re-commit', committed.length === 1);
      handle.dispatch('pointercancel', { pointerId: 7 });
      check('shop-resize: pointercancel after pointerup does not re-commit', committed.length === 1);

      destroy();
      check('shop-resize: destroy removes every handle listener',
        handle._listenerCount('pointerdown') === 0 &&
          handle._listenerCount('pointermove') === 0 &&
          handle._listenerCount('pointerup') === 0 &&
          handle._listenerCount('pointercancel') === 0);
      check('shop-resize: destroy restores the previous cursor', handle.style.cursor === '');

      // Post-destroy, pointer input is inert.
      handle.dispatch('pointerdown', { clientX: 300, pointerId: 9 });
      check('shop-resize: destroyed handler ignores pointerdown', !handle._captured.has(9));
    });
  }

  // =========================================================================
  // 4. DOM handler — media-query flip re-clamps; destroy detaches it
  // =========================================================================
  {
    const sidebar = makeElement({ left: 0, width: 956 });
    const handle = makeElement({ left: 956, width: 8 });
    const mql = makeMql();
    const committed = [];
    withWindow({ innerWidth: 1024, matchMedia: (q) => (q === SHOP_RAIL_MEDIA_QUERY ? mql : null) }, () => {
      const destroy = attachShopResize({
        handleEl: handle,
        sidebarEl: sidebar,
        getWidth: () => 956, // caller still holds a wide value from a desktop session
        onCommit: (w) => committed.push(w),
      });

      check('shop-resize: attach registers one media-query listener', mql._count() === 1);
      mql.fire(true);
      check(
        'shop-resize: media-query change re-clamps against the new viewport',
        sidebar.style.getPropertyValue('--shop-w') === `${max1024}px`,
      );
      check('shop-resize: media-query re-clamp does not commit', committed.length === 0);

      destroy();
      check('shop-resize: destroy removes the media-query listener', mql._count() === 0);
      mql.fire(false);
      check('shop-resize: no re-clamp after destroy', sidebar.style.getPropertyValue('--shop-w') === `${max1024}px`);
    });
  }

  // =========================================================================
  // 5. DOM handler — best-effort degradation
  // =========================================================================
  {
    let ok = true;
    try {
      const d1 = attachShopResize({});
      check('shop-resize: attach without elements returns a no-op destroy', typeof d1 === 'function');
      d1();
      const d2 = attachShopResize();
      d2();
      const d3 = attachShopResize({ handleEl: makeElement(), sidebarEl: null });
      d3();
    } catch (err) {
      ok = false;
    }
    check('shop-resize: malformed attach inputs never throw', ok);
  }
  {
    // A throwing matchMedia must not break attach.
    const sidebar = makeElement();
    const handle = makeElement();
    let ok = true;
    withWindow({ innerWidth: 1400, matchMedia: () => { throw new Error('blocked'); } }, () => {
      try {
        const destroy = attachShopResize({ handleEl: handle, sidebarEl: sidebar, onCommit: () => {} });
        handle.dispatch('pointerdown', { clientX: 240, pointerId: 1 });
        destroy();
      } catch (err) {
        ok = false;
      }
    });
    check('shop-resize: a throwing matchMedia degrades without throwing', ok);
  }

  // =========================================================================
  // 6. Layout-aware available width (the max-drag canvas-floor bug)
  // =========================================================================
  {
    // 1400x768: #main content box is 1380px (window 1400 - #app padding 20), the right
    // #sidebar is 320px, and #main's 10px gap sits on each side of #viewport:
    //   shop [0,240) | gap | viewport [250,1050) | gap | right [1060,1380)
    const main = makeElement({ left: 0, width: 1380 });
    const right = makeElement({ left: 1060, width: 320 });
    const shop = makeElement({ left: 0, width: 240 });
    const viewport = makeElement({ left: 250, width: 800 });

    const available = measureShopAvailableWidth({
      mainEl: main,
      rightSidebarEl: right,
      shopSidebarEl: shop,
      viewportEl: viewport,
    });
    check(
      'shop-resize: available width measures #main minus the right #sidebar and both gaps',
      available === 1040,
    );

    // 1040px region: layout cap = 1040 - 444 = 596, share cap = round(1040 * 0.42) = 437.
    const maxShare = Math.round(1040 * 0.42);
    const max = clampSidebarWidth(Infinity, available, OPTS);
    check(
      'shop-resize: max drag takes the ratio cap and still clears the 444px floor (1400x768)',
      max === maxShare && max === 437 && available - max >= OPTS.canvasFloor,
    );

    // A width persisted on a wider screen must NOT be re-applied over-wide at boot.
    const reclamped = clampSidebarWidth(956, available, OPTS);
    check(
      'shop-resize: a persisted over-wide width re-clamps to the ratio-bounded max',
      reclamped === maxShare && available - reclamped >= OPTS.canvasFloor,
    );

    check('shop-resize: measure returns undefined without #main', measureShopAvailableWidth({}) === undefined);
    const missingRight = measureShopAvailableWidth({
      mainEl: main,
      shopSidebarEl: shop,
      viewportEl: viewport,
    });
    check(
      'shop-resize: measure tolerates a missing right #sidebar',
      Number.isInteger(missingRight) && missingRight > 0,
    );
    let hostileOk = true;
    try {
      measureShopAvailableWidth({ mainEl: {}, rightSidebarEl: 42, shopSidebarEl: 'x', viewportEl: null });
    } catch (err) {
      hostileOk = false;
    }
    check('shop-resize: measure never throws on hostile elements', hostileOk);

    // The handler must clamp against getAvailableWidth, not window.innerWidth.
    withWindow({ innerWidth: 1400, matchMedia: () => null }, () => {
      const sidebar = makeElement({ left: 0, width: 240 });
      const handle = makeElement({ left: 240, width: 8 });
      const destroy = attachShopResize({
        handleEl: handle,
        sidebarEl: sidebar,
        getWidth: () => 240,
        getAvailableWidth: () => available,
        onCommit: () => {},
      });
      handle.dispatch('pointerdown', { clientX: 240, pointerId: 3 });
      handle.dispatch('pointermove', { clientX: 9999, pointerId: 3 });
      check(
        'shop-resize: drag clamps to the layout-derived max, not window.innerWidth',
        sidebar.style.getPropertyValue('--shop-w') === `${maxShare}px`,
      );
      destroy();
    });
  }

  // =========================================================================
  // 7. Source hygiene — the plan's hard constraints live in the source itself
  // =========================================================================
  try {
    const src = readFileSync(new URL('../../ui/shop-resize.js', import.meta.url), 'utf8');
    check('shop-resize: source never assigns .style.width', !/\.style\.width/.test(src));
    check('shop-resize: source writes the --shop-w custom property', /setProperty\(/.test(src) && src.includes('SHOP_WIDTH_PROPERTY'));
    check('shop-resize: source has no innerHTML', !/innerHTML/.test(src));
    check(
      'shop-resize: pure module has no storage access',
      !/(?:localStorage|sessionStorage)\s*[.[]/.test(src),
    );
  } catch (err) {
    check('shop-resize: source is readable', false);
  }
}
