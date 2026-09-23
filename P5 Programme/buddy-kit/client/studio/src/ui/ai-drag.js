/**
 * ai-drag.js — pointer-drag of an AI preview result onto the main viewport.
 *
 * After the AI replies, `#ai-preview` shows a miniature of what *would* be
 * inserted. This module lets the child drag that preview out of the sidebar and
 * drop it into the 3-D scene: press the preview, move past {@link DRAG_TOL}
 * pixels, see a floating ghost chip follow the pointer and the viewport light
 * up, then release over the viewport to commit.
 *
 * WHY POINTER EVENTS + `setPointerCapture`, NOT HTML5 DRAG-AND-DROP.
 * This app targets tablets, and HTML5 DnD (`dragstart`/`dataTransfer`/`drop`)
 * has poor, inconsistent touch support — it often never fires on a touch
 * screen at all. The clay brush (`src/clay/clay.js:411-452`) is this project's
 * only proven pointer-drag implementation and already handles touch and
 * multi-touch, so this module follows its shape: `setPointerCapture` on press,
 * a `Map`-free single active pointer id, and every exit path funnelling through
 * one cleanup function.
 *
 * DECOUPLING. `raycastToWorld` is INJECTED, so this module never imports the
 * camera, the scene graph, or `StudioScene`. It only knows pixels in and a
 * world point out; insertion is `onDrop`'s job (wired by the panel in plan task
 * 13, not here). That keeps the whole thing Node-testable and swappable.
 *
 * TAP vs DRAG. `PICK_TOL = 5` in `main.js:264` proves the codebase deliberately
 * separates a click from a drag; `DRAG_TOL` follows the same convention so a
 * tap on the preview never re-inserts shapes.
 */

/**
 * Movement (px) a pointer must travel before a press becomes a drag.
 *
 * Mirrors `main.js`'s `PICK_TOL` convention: `Math.hypot(dx, dy) > DRAG_TOL`.
 * A press of exactly `DRAG_TOL` px is still a tap.
 *
 * @type {number}
 */
export const DRAG_TOL = 6;

/**
 * Class toggled on the drop-target element while the pointer is over it
 * mid-drag. The rule is injected at runtime (see {@link STYLE_ID}) so this
 * module needs no edit to `style.css`.
 *
 * @type {string}
 */
export const DROP_TARGET_CLASS = 'ai-drop-target';

/**
 * Class of the floating ghost chip appended to `document.body` during a drag.
 * It is `pointer-events:none` so it can never steal the pointer from the drop
 * target underneath it.
 *
 * @type {string}
 */
export const GHOST_CLASS = 'ai-drag-ghost';

/** id of the `<style>` element this module injects for its two classes. */
const STYLE_ID = 'ai-drag-style';

/** How far (px) the ghost chip sits down/right of the pointer (finger cover). */
const GHOST_OFFSET = 14;

/**
 * The stylesheet this module injects once, while at least one drag is
 * attached. Colours come from the studio's own CSS custom properties
 * (`style.css:2-19`) with hard fallbacks, so the affordances match the theme
 * without touching the stylesheet.
 */
const STYLE_CSS = `
.${GHOST_CLASS} {
  position: fixed;
  left: 0;
  top: 0;
  z-index: 9999;
  pointer-events: none;
  padding: 8px 14px;
  border-radius: var(--radius, 8px);
  border: 1px solid var(--teal, #00e5ff);
  background: rgba(6, 20, 36, 0.92);
  color: var(--text, #d9f7ff);
  font-family: var(--font-head, "Orbitron", sans-serif);
  font-size: 13px;
  letter-spacing: 0.6px;
  white-space: nowrap;
  box-shadow: 0 6px 20px rgba(0, 229, 255, 0.35);
  will-change: transform;
}
.${DROP_TARGET_CLASS} {
  outline: 3px solid var(--teal, #00e5ff);
  outline-offset: -3px;
  box-shadow: inset 0 0 0 3px rgba(0, 229, 255, 0.45), 0 0 22px var(--glow, rgba(0, 229, 255, 0.35));
}
`;

/**
 * The injected `<style>` element, shared by every attached drag, plus a simple
 * user count so the last {@link detach} removes it. Module-level because two
 * panels could in principle attach at once.
 */
let styleEl = null;
let styleUsers = 0;

/**
 * Log a caught error by NAME only — never the error object. The drag paths are
 * geometry-only (no key/body can reach them), but this matches
 * `ai-panel.js:_reportError` so a caught value can never spray a larger object
 * into the console. A guarded `console` must never break drag cleanup.
 *
 * @param {*} err - The caught value.
 * @param {string} what - Short label of the operation that failed.
 * @returns {void}
 */
function warnCaught(err, what) {
  const name = err && typeof err.name === 'string' && err.name ? err.name : typeof err;
  try {
    console.warn(`[ai-drag] ${what}: ${name}`);
  } catch {
    /* a guarded console must never break drag cleanup */
  }
}

/** Create the shared stylesheet if absent (idempotent). */
function acquireStyle() {
  if (!styleEl || !styleEl.isConnected) {
    styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    styleEl.textContent = STYLE_CSS;
    document.head.appendChild(styleEl);
    styleUsers = 0;
  }
  styleUsers++;
}

/** Drop one reference; remove the stylesheet when the last user detaches. */
function releaseStyle() {
  styleUsers = Math.max(0, styleUsers - 1);
  if (styleUsers === 0 && styleEl) {
    styleEl.remove();
    styleEl = null;
  }
}

/**
 * Whether a viewport-space point lies inside a `DOMRect`-shaped box.
 *
 * Pure geometry, deliberately kept out of the DOM so the Node suite can pin
 * the boundary rule. Edges are inclusive (`left`/`top`/`right`/`bottom` all
 * count as "inside"). Accepts a real `DOMRect` (`right`/`bottom`) or a plain
 * `{left, top, width, height}` (falls back to `left + width`); any missing or
 * non-finite bound, or a non-finite point, is `false`.
 *
 * @param {number} x - Pointer client X.
 * @param {number} y - Pointer client Y.
 * @param {{left: number, top: number, right?: number, bottom?: number, width?: number, height?: number}|null|undefined} rect
 *   The target's bounding box (`Element.getBoundingClientRect()`).
 * @returns {boolean} `true` when the point is within (or on) the box.
 */
export function isPointInRect(x, y, rect) {
  if (!rect || !Number.isFinite(x) || !Number.isFinite(y)) return false;
  const left = Number(rect.left);
  const top = Number(rect.top);
  let right = Number(rect.right);
  let bottom = Number(rect.bottom);
  if (!Number.isFinite(right)) right = left + Number(rect.width);
  if (!Number.isFinite(bottom)) bottom = top + Number(rect.height);
  if (![left, top, right, bottom].every(Number.isFinite)) return false;
  return x >= left && x <= right && y >= top && y <= bottom;
}

/**
 * Whether the pointer has moved far enough to count as a drag.
 *
 * Pure geometry (Euclidean distance), extracted so the threshold rule is
 * asserted in Node without a browser. Strictly greater than `tol`: a movement
 * of exactly `DRAG_TOL` px is still a tap.
 *
 * @param {number} startX - Pointer client X at `pointerdown`.
 * @param {number} startY - Pointer client Y at `pointerdown`.
 * @param {number} x - Current pointer client X.
 * @param {number} y - Current pointer client Y.
 * @param {number} [tol=DRAG_TOL] - Threshold in px.
 * @returns {boolean} `true` once `hypot(x-startX, y-startY) > tol`.
 */
export function exceedsDragThreshold(startX, startY, x, y, tol = DRAG_TOL) {
  return Math.hypot(x - startX, y - startY) > tol;
}

/**
 * Wire a pointer-drag so an AI preview canvas can be dropped onto a viewport.
 *
 * The returned `detach()` removes every listener this call added (and any
 * in-flight ghost/highlight), so a later press does nothing.
 *
 * Exit paths and their guarantees:
 * - `pointerup` over the viewport → `raycastToWorld(x, y)` then `onDrop(worldPoint)`
 *   exactly once. If `raycastToWorld` returns a falsy value (ray missed) or
 *   throws, `onDrop` is skipped — never called with `null`.
 * - `pointerup` anywhere else, `pointercancel`, `lostpointercapture`, `Escape`,
 *   and `detach()` → clean cancel with **zero** `onDrop` calls.
 * - Every path removes the ghost chip, clears the viewport highlight, and
 *   releases the pointer capture.
 * - A drag that actually began fires `onDragStateChange(false)` exactly once
 *   on the way out (and `true` once on the way in), including on cancel.
 *
 * @param {object} options
 * @param {HTMLCanvasElement} options.canvasEl - The preview canvas that starts
 *   the drag. Receives `touch-action:none` (restored by `detach()`) so a touch
 *   drag is not stolen by the sidebar's scroll.
 * @param {HTMLElement} options.viewportEl - The drop target. Gets
 *   {@link DROP_TARGET_CLASS} while the pointer is over it mid-drag.
 * @param {(clientX: number, clientY: number) => (THREE.Vector3|null|undefined)} options.raycastToWorld
 *   Injected ray caster: converts viewport-space pixels to a world point.
 *   Returns a `THREE.Vector3` (or any truthy value `onDrop` accepts); `null`
 *   when the ray misses. This module never imports a camera or scene graph.
 * @param {(worldPoint: any) => void} options.onDrop - Called once with the
 *   world point when a completed drag is released over the viewport. Owns
 *   insertion; this module never mutates the scene.
 * @param {(dragging: boolean) => void} [options.onDragStateChange] - Notified
 *   `true` when a drag begins and `false` on every exit (cancel included).
 * @param {string} [options.ghostLabel='Drop to place'] - Text on the ghost chip.
 * @returns {() => void} `detach()` — removes all listeners + leftover DOM.
 * @throws {Error} When a required element or callback is missing (loud, so a
 *   wiring mistake surfaces immediately rather than as a silent dead drag).
 */
export function attachPreviewDrag({
  canvasEl,
  viewportEl,
  raycastToWorld,
  onDrop,
  onDragStateChange,
  ghostLabel = 'Drop to place',
} = {}) {
  // Validate BEFORE touching the DOM so a mis-wired call throws loudly (and the
  // Node suite can test the contract without a document).
  if (!canvasEl) throw new Error('attachPreviewDrag: canvasEl is required');
  if (!viewportEl) throw new Error('attachPreviewDrag: viewportEl is required');
  if (typeof raycastToWorld !== 'function') {
    throw new Error('attachPreviewDrag: raycastToWorld must be a function');
  }
  if (typeof onDrop !== 'function') {
    throw new Error('attachPreviewDrag: onDrop must be a function');
  }

  const pick = raycastToWorld;
  const drop = onDrop;
  const notify = typeof onDragStateChange === 'function' ? onDragStateChange : null;

  acquireStyle();
  const previousTouchAction = canvasEl.style.touchAction;
  // touch-action:none is what makes a touch drag authoritative: without it the
  // browser starts panning the scrollable sidebar and fires pointercancel.
  canvasEl.style.touchAction = 'none';

  let detached = false;
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastY = 0;
  let dragging = false;
  let overTarget = false;
  let ghostEl = null;
  // Snapshot of the drop target's box, taken at drag start (per the plan). The
  // pointer is captured for the whole gesture, so the sidebar cannot scroll
  // mid-drag and the snapshot stays valid.
  let targetRect = null;

  /** Call a caller-supplied callback without letting it break our cleanup. */
  const safeNotify = (value) => {
    if (!notify) return;
    try {
      notify(value);
    } catch (err) {
      warnCaught(err, 'onDragStateChange threw');
    }
  };

  /** Create the floating chip and put it under the pointer. */
  function createGhost() {
    const el = document.createElement('div');
    el.className = GHOST_CLASS;
    el.setAttribute('aria-hidden', 'true');
    el.textContent = ghostLabel;
    // Critical layout inline so the chip tracks the pointer even if the shared
    // stylesheet has not applied yet; the look itself lives in STYLE_CSS.
    el.style.position = 'fixed';
    el.style.left = '0';
    el.style.top = '0';
    el.style.pointerEvents = 'none';
    el.style.zIndex = '9999';
    document.body.appendChild(el);
    ghostEl = el;
    positionGhost();
  }

  /** Move the ghost chip to just past the current pointer position. */
  function positionGhost() {
    if (!ghostEl) return;
    ghostEl.style.transform = `translate3d(${lastX + GHOST_OFFSET}px, ${lastY + GHOST_OFFSET}px, 0)`;
  }

  /** Release the capture, swallowing the "no active pointer" throw. */
  function releaseCapture(id) {
    if (id == null) return;
    try {
      canvasEl.releasePointerCapture(id);
    } catch {
      /* pointer already gone — nothing to release */
    }
  }

  /**
   * Tear down a gesture: logical state first (so a re-entrant
   * `lostpointercapture` is a no-op), then DOM, then the capture, then the
   * `false` notification. Safe to call on every exit path and when idle.
   *
   * @param {number|null} [pid] - Pointer id to release; defaults to the active one.
   * @returns {void}
   */
  function cleanup(pid = pointerId) {
    const wasDragging = dragging;
    const id = pid != null ? pid : pointerId;

    pointerId = null;
    dragging = false;
    overTarget = false;
    targetRect = null;

    if (ghostEl) {
      ghostEl.remove();
      ghostEl = null;
    }
    viewportEl.classList.remove(DROP_TARGET_CLASS);
    releaseCapture(id);

    // After the state flip, so an event fired synchronously by the release
    // cannot double-notify.
    if (wasDragging) safeNotify(false);
  }

  function onPointerDown(e) {
    if (detached) return;
    if (e.button !== 0) return; // left mouse / touch / pen only
    if (pointerId !== null) return; // one active pointer per attached drag
    pointerId = e.pointerId;
    startX = lastX = e.clientX;
    startY = lastY = e.clientY;
    dragging = false;
    overTarget = false;
    targetRect = null;
    try {
      canvasEl.setPointerCapture(e.pointerId);
    } catch {
      /* capture is an optimisation; direct events still drive the drag */
    }
  }

  function onPointerMove(e) {
    if (detached || e.pointerId !== pointerId) return;
    lastX = e.clientX;
    lastY = e.clientY;

    if (!dragging) {
      if (!exceedsDragThreshold(startX, startY, e.clientX, e.clientY, DRAG_TOL)) return;
      // Threshold crossed: the press is now a drag.
      targetRect = viewportEl.getBoundingClientRect();
      dragging = true;
      createGhost();
      safeNotify(true);
    }

    positionGhost();
    if (e.cancelable) e.preventDefault();

    const over = isPointInRect(e.clientX, e.clientY, targetRect);
    if (over !== overTarget) {
      overTarget = over;
      viewportEl.classList.toggle(DROP_TARGET_CLASS, over);
    }
  }

  function onPointerUp(e) {
    if (detached || e.pointerId !== pointerId) return;
    const id = e.pointerId;
    // Resolve the world point BEFORE cleanup so the callback order is
    // raycast → cleanup → onDrop (the ghost is gone when the scene changes).
    let worldPoint = null;
    if (dragging && isPointInRect(e.clientX, e.clientY, targetRect)) {
      try {
        worldPoint = pick(e.clientX, e.clientY);
      } catch (err) {
        warnCaught(err, 'raycastToWorld threw');
        worldPoint = null;
      }
    }

    cleanup(id);

    if (worldPoint) {
      try {
        drop(worldPoint);
      } catch (err) {
        warnCaught(err, 'onDrop threw');
      }
    }
  }

  function onPointerCancel(e) {
    if (detached || e.pointerId !== pointerId) return;
    cleanup(e.pointerId);
  }

  function onLostPointerCapture(e) {
    if (detached || e.pointerId !== pointerId) return;
    cleanup(e.pointerId);
  }

  function onKeyDown(e) {
    if (detached) return;
    if (e.key !== 'Escape' && e.key !== 'Esc') return;
    if (pointerId === null && !dragging) return;
    cleanup();
  }

  canvasEl.addEventListener('pointerdown', onPointerDown);
  canvasEl.addEventListener('pointermove', onPointerMove);
  canvasEl.addEventListener('pointerup', onPointerUp);
  canvasEl.addEventListener('pointercancel', onPointerCancel);
  canvasEl.addEventListener('lostpointercapture', onLostPointerCapture);
  document.addEventListener('keydown', onKeyDown);

  /**
   * Remove every listener added above, cancel any in-flight drag (ghost,
   * highlight, capture), restore the canvas's `touch-action`, and drop this
   * instance's reference to the shared stylesheet. Idempotent.
   *
   * @returns {void}
   */
  return function detach() {
    if (detached) return;
    detached = true;

    canvasEl.removeEventListener('pointerdown', onPointerDown);
    canvasEl.removeEventListener('pointermove', onPointerMove);
    canvasEl.removeEventListener('pointerup', onPointerUp);
    canvasEl.removeEventListener('pointercancel', onPointerCancel);
    canvasEl.removeEventListener('lostpointercapture', onLostPointerCapture);
    document.removeEventListener('keydown', onKeyDown);

    cleanup();

    if (previousTouchAction) canvasEl.style.touchAction = previousTouchAction;
    else canvasEl.style.removeProperty('touch-action');

    releaseStyle();
  };
}
