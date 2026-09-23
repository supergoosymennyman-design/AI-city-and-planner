/**
 * ai-drag.spec.js — coverage for `src/ui/ai-drag.js` (preview → viewport drag).
 *
 * Discovered by `run-tests.mjs`'s `src/ai/tests/*.spec.js` block, which calls
 * `mod.default(check)` SYNCHRONOUSLY. Everything here is synchronous: the pure
 * geometry helpers are asserted directly, and the DOM state machine is driven
 * with a tiny hand-rolled fake DOM installed as `globalThis.document`. No
 * browser and no test library are needed.
 *
 * The `attachPreviewDrag` module is deliberately dependency-free and validates
 * its arguments before touching the DOM, so the contract tests run WITHOUT any
 * document installed by design.
 */

import { readFileSync } from 'node:fs';
import {
  attachPreviewDrag,
  isPointInRect,
  exceedsDragThreshold,
  DRAG_TOL,
  DROP_TARGET_CLASS,
  GHOST_CLASS,
} from '../../ui/ai-drag.js';

const STYLE_ID = 'ai-drag-style';

// ---------------------------------------------------------------------------
// Minimal fake DOM (only what the module touches).
// ---------------------------------------------------------------------------

const kebabToCamel = (name) => String(name).replace(/-([a-z])/g, (_, c) => c.toUpperCase());

function makeStyle() {
  const style = {};
  style.removeProperty = (name) => {
    delete style[kebabToCamel(name)];
  };
  return style;
}

class FakeElement {
  constructor(tag = 'div') {
    this.tagName = String(tag).toUpperCase();
    this.id = '';
    this.className = '';
    this.attributes = {};
    this.parentNode = null;
    this.childNodes = [];
    this.style = makeStyle();
    this.textContent = '';
    this.isConnected = false;
    this.rect = { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 };
    this.captureCalls = [];
    this.releaseCalls = [];
    this._classes = new Set();
    this._listeners = new Map();
  }

  get classList() {
    const self = this;
    return {
      add: (...names) => names.forEach((n) => self._classes.add(n)),
      remove: (...names) => names.forEach((n) => self._classes.delete(n)),
      contains: (name) => self._classes.has(name),
      toggle: (name, force) => {
        const on = force === undefined ? !self._classes.has(name) : !!force;
        if (on) self._classes.add(name);
        else self._classes.delete(name);
        return on;
      },
    };
  }

  setAttribute(key, value) {
    this.attributes[key] = String(value);
  }

  getAttribute(key) {
    return key in this.attributes ? this.attributes[key] : null;
  }

  appendChild(child) {
    child.parentNode = this;
    this.childNodes.push(child);
    child.isConnected = true;
    return child;
  }

  removeChild(child) {
    const i = this.childNodes.indexOf(child);
    if (i >= 0) this.childNodes.splice(i, 1);
    child.parentNode = null;
    child.isConnected = false;
    return child;
  }

  remove() {
    if (this.parentNode) this.parentNode.removeChild(this);
    else this.isConnected = false;
  }

  addEventListener(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, []);
    this._listeners.get(type).push(fn);
  }

  removeEventListener(type, fn) {
    const list = this._listeners.get(type);
    if (!list) return;
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  }

  dispatchEvent(evt) {
    const list = this._listeners.get(evt.type);
    if (list) for (const fn of list.slice()) fn(evt);
    return true;
  }

  setPointerCapture(id) {
    this.captureCalls.push(id);
  }

  releasePointerCapture(id) {
    this.releaseCalls.push(id);
  }

  getBoundingClientRect() {
    return this.rect;
  }
}

class FakeDocument {
  constructor() {
    this.head = new FakeElement('head');
    this.body = new FakeElement('body');
    this._listeners = new Map();
  }

  createElement(tag) {
    return new FakeElement(tag);
  }

  addEventListener(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, []);
    this._listeners.get(type).push(fn);
  }

  removeEventListener(type, fn) {
    const list = this._listeners.get(type);
    if (!list) return;
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  }

  dispatchEvent(evt) {
    const list = this._listeners.get(evt.type);
    if (list) for (const fn of list.slice()) fn(evt);
    return true;
  }
}

/** Build a DOMRect-shaped box. */
const rect = (left, top, width, height) => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});

/** Build a pointer/keyboard event object the fake nodes can dispatch. */
function ev(type, props = {}) {
  return {
    type,
    pointerId: 1,
    button: 0,
    clientX: 0,
    clientY: 0,
    cancelable: true,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    ...props,
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

export default function aiDragTests(check) {
  // --- constants ---------------------------------------------------------
  check('ai-drag: DRAG_TOL is 6 px', DRAG_TOL === 6);
  check('ai-drag: DROP_TARGET_CLASS exported', DROP_TARGET_CLASS === 'ai-drop-target');
  check('ai-drag: GHOST_CLASS exported', GHOST_CLASS === 'ai-drag-ghost');

  // --- pure helper: isPointInRect ---------------------------------------
  const box = rect(200, 100, 400, 300); // 200..600 x, 100..400 y
  check('ai-drag: isPointInRect centre true', isPointInRect(300, 250, box) === true);
  check('ai-drag: isPointInRect left-of false', isPointInRect(199, 250, box) === false);
  check('ai-drag: isPointInRect right-of false', isPointInRect(601, 250, box) === false);
  check('ai-drag: isPointInRect above false', isPointInRect(300, 99, box) === false);
  check('ai-drag: isPointInRect below false', isPointInRect(300, 401, box) === false);
  check('ai-drag: isPointInRect edges inclusive', isPointInRect(200, 100, box) && isPointInRect(600, 400, box));
  check('ai-drag: isPointInRect null rect false', isPointInRect(0, 0, null) === false);
  check('ai-drag: isPointInRect non-finite point false', isPointInRect(NaN, 0, box) === false);
  check(
    'ai-drag: isPointInRect width/height fallback',
    isPointInRect(50, 50, { left: 0, top: 0, width: 100, height: 100 }) === true,
  );
  check(
    'ai-drag: isPointInRect missing bounds false',
    isPointInRect(50, 50, { left: 0, top: 0 }) === false,
  );

  // --- pure helper: exceedsDragThreshold --------------------------------
  check('ai-drag: 3px move is not a drag', exceedsDragThreshold(0, 0, 3, 0) === false);
  check('ai-drag: 6px move is still a tap', exceedsDragThreshold(0, 0, 6, 0) === false);
  check('ai-drag: 6.5px move is a drag', exceedsDragThreshold(0, 0, 6.5, 0) === true);
  check('ai-drag: diagonal 3-4-5 is not a drag', exceedsDragThreshold(0, 0, 3, 4) === false);
  check('ai-drag: diagonal 4-5-6.4 is a drag', exceedsDragThreshold(0, 0, 4, 5) === true);
  check('ai-drag: custom tol respected', exceedsDragThreshold(0, 0, 3, 4, 4) === true);

  // --- argument contract (no DOM needed) --------------------------------
  const threw = (fn, re) => {
    try {
      fn();
      return false;
    } catch (err) {
      return re.test(String(err.message));
    }
  };
  check('ai-drag: missing canvasEl throws', threw(() => attachPreviewDrag(), /canvasEl/));
  check(
    'ai-drag: missing viewportEl throws',
    threw(() => attachPreviewDrag({ canvasEl: {} }), /viewportEl/),
  );
  check(
    'ai-drag: missing raycastToWorld throws',
    threw(() => attachPreviewDrag({ canvasEl: {}, viewportEl: {} }), /raycastToWorld/),
  );
  check(
    'ai-drag: missing onDrop throws',
    threw(
      () => attachPreviewDrag({ canvasEl: {}, viewportEl: {}, raycastToWorld: () => null }),
      /onDrop/,
    ),
  );

  // --- module is decoupled: no imports at all ---------------------------
  const src = readFileSync(new URL('../../ui/ai-drag.js', import.meta.url), 'utf8');
  // Comments legitimately NAME what we avoid (HTML5 DnD, StudioScene) to explain
  // why; assert on the code only.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  check('ai-drag: module has zero import statements', !/^\s*import\b/m.test(src));
  check('ai-drag: module never touches the scene graph', !/StudioScene|scene\.js|viewport\.js/.test(code));
  check(
    'ai-drag: module never uses HTML5 drag-and-drop',
    !/dragstart|dragend|dragover|dataTransfer|['"]drop['"]/.test(code),
  );

  // --- DOM state machine (fake DOM) -------------------------------------
  const previousDocument = globalThis.document;
  const doc = new FakeDocument();
  globalThis.document = doc;

  const makeViewport = () => {
    const v = doc.createElement('div');
    v.rect = rect(200, 100, 400, 300);
    return v;
  };

  /** Attach a fresh drag to a fresh canvas + viewport and expose spy arrays. */
  const mount = (overrides = {}) => {
    const canvas = doc.createElement('canvas');
    canvas.rect = rect(0, 0, 100, 50);
    const viewport = overrides.viewport || makeViewport();
    const calls = { rays: [], drops: [], states: [] };
    const detach = attachPreviewDrag({
      canvasEl: canvas,
      viewportEl: viewport,
      raycastToWorld:
        overrides.raycast ||
        ((x, y) => {
          calls.rays.push([x, y]);
          return { x, y, z: 0 };
        }),
      onDrop:
        overrides.onDrop ||
        ((p) => {
          calls.drops.push(p);
        }),
      onDragStateChange: (b) => calls.states.push(b),
      ...(overrides.ghostLabel ? { ghostLabel: overrides.ghostLabel } : {}),
    });
    const ghosts = () => doc.body.childNodes.filter((c) => c.className === GHOST_CLASS);
    return { canvas, viewport, calls, detach, ghosts };
  };

  const styleNode = () => doc.head.childNodes.find((n) => n.id === STYLE_ID) || null;

  try {
    // (1) tap never starts a drag ----------------------------------------
    {
      const env = mount();
      env.canvas.dispatchEvent(ev('pointerdown', { clientX: 10, clientY: 10 }));
      env.canvas.dispatchEvent(ev('pointerup', { clientX: 10, clientY: 10 }));
      check('ai-drag: tap fires no drag state', env.calls.states.length === 0);
      check('ai-drag: tap drops nothing', env.calls.drops.length === 0);
      check('ai-drag: tap leaves no ghost', env.ghosts().length === 0);
      check('ai-drag: tap releases pointer capture', env.canvas.releaseCalls.includes(1));
      env.detach();
    }

    // (2) sub-threshold move (3px) is still a tap ------------------------
    {
      const env = mount();
      env.canvas.dispatchEvent(ev('pointerdown', { clientX: 10, clientY: 10 }));
      env.canvas.dispatchEvent(ev('pointermove', { clientX: 13, clientY: 13 }));
      env.canvas.dispatchEvent(ev('pointerup', { clientX: 13, clientY: 13 }));
      check('ai-drag: 3px move fires no drag state', env.calls.states.length === 0);
      check('ai-drag: 3px move drops nothing', env.calls.drops.length === 0);
      check('ai-drag: 3px move leaves no ghost', env.ghosts().length === 0);
      env.detach();
    }

    // (3) drag-success: exactly one drop, ghost + highlight cleaned ------
    {
      const env = mount({ ghostLabel: 'Drop it' });
      env.canvas.dispatchEvent(ev('pointerdown', { clientX: 10, clientY: 10 }));
      env.canvas.dispatchEvent(ev('pointermove', { clientX: 40, clientY: 40 }));
      check('ai-drag: crossing threshold starts drag', env.calls.states.length === 1 && env.calls.states[0] === true);
      check('ai-drag: ghost appears on drag', env.ghosts().length === 1);
      check('ai-drag: ghost uses custom label', env.ghosts()[0].textContent === 'Drop it');
      check('ai-drag: ghost is pointer-events:none', env.ghosts()[0].style.pointerEvents === 'none');
      check('ai-drag: not-over viewport has no highlight', env.viewport.classList.contains(DROP_TARGET_CLASS) === false);

      const overMove = ev('pointermove', { clientX: 300, clientY: 250 });
      env.canvas.dispatchEvent(overMove);
      check('ai-drag: move preventDefaults mid-drag', overMove.defaultPrevented === true);
      check('ai-drag: over viewport adds highlight', env.viewport.classList.contains(DROP_TARGET_CLASS) === true);
      check(
        'ai-drag: ghost follows pointer',
        env.ghosts()[0].style.transform === 'translate3d(314px, 264px, 0)',
      );

      env.canvas.dispatchEvent(ev('pointerup', { clientX: 300, clientY: 250 }));
      check('ai-drag: one raycast at release point', env.calls.rays.length === 1 && env.calls.rays[0][0] === 300 && env.calls.rays[0][1] === 250);
      check('ai-drag: onDrop called exactly once', env.calls.drops.length === 1);
      check('ai-drag: onDrop gets the world point', env.calls.drops[0].x === 300 && env.calls.drops[0].y === 250);
      check('ai-drag: drag state true then false', env.calls.states.join(',') === 'true,false');
      check('ai-drag: ghost removed after drop', env.ghosts().length === 0);
      check('ai-drag: highlight removed after drop', env.viewport.classList.contains(DROP_TARGET_CLASS) === false);
      check('ai-drag: capture released after drop', env.canvas.releaseCalls.includes(1));
      env.detach();
    }

    // (4) release outside the viewport cancels with no side effects ------
    {
      const env = mount();
      env.canvas.dispatchEvent(ev('pointerdown', { clientX: 10, clientY: 10 }));
      env.canvas.dispatchEvent(ev('pointermove', { clientX: 300, clientY: 250 }));
      env.canvas.dispatchEvent(ev('pointermove', { clientX: 50, clientY: 50 }));
      check('ai-drag: leaving viewport clears highlight', env.viewport.classList.contains(DROP_TARGET_CLASS) === false);
      env.canvas.dispatchEvent(ev('pointerup', { clientX: 50, clientY: 50 }));
      check('ai-drag: drop outside casts no ray', env.calls.rays.length === 0);
      check('ai-drag: drop outside drops nothing', env.calls.drops.length === 0);
      check('ai-drag: drop outside still notifies false', env.calls.states.join(',') === 'true,false');
      check('ai-drag: drop outside removes ghost', env.ghosts().length === 0);
      env.detach();
    }

    // (5) Escape cancels cleanly -----------------------------------------
    {
      const env = mount();
      env.canvas.dispatchEvent(ev('pointerdown', { clientX: 10, clientY: 10 }));
      env.canvas.dispatchEvent(ev('pointermove', { clientX: 300, clientY: 250 }));
      doc.dispatchEvent(ev('keydown', { key: 'Escape' }));
      check('ai-drag: Escape drops nothing', env.calls.drops.length === 0);
      check('ai-drag: Escape notifies false', env.calls.states.join(',') === 'true,false');
      check('ai-drag: Escape removes ghost', env.ghosts().length === 0);
      check('ai-drag: Escape clears highlight', env.viewport.classList.contains(DROP_TARGET_CLASS) === false);
      check('ai-drag: Escape releases capture', env.canvas.releaseCalls.includes(1));
      env.detach();
    }

    // (6) pointercancel cancels cleanly ----------------------------------
    {
      const env = mount();
      env.canvas.dispatchEvent(ev('pointerdown', { clientX: 10, clientY: 10 }));
      env.canvas.dispatchEvent(ev('pointermove', { clientX: 300, clientY: 250 }));
      env.canvas.dispatchEvent(ev('pointercancel', { pointerId: 1 }));
      check('ai-drag: pointercancel drops nothing', env.calls.drops.length === 0);
      check('ai-drag: pointercancel notifies false', env.calls.states.join(',') === 'true,false');
      check('ai-drag: pointercancel removes ghost', env.ghosts().length === 0);
      env.detach();
    }

    // (7) lostpointercapture is a safety net -----------------------------
    {
      const env = mount();
      env.canvas.dispatchEvent(ev('pointerdown', { clientX: 10, clientY: 10 }));
      env.canvas.dispatchEvent(ev('pointermove', { clientX: 300, clientY: 250 }));
      env.canvas.dispatchEvent(ev('lostpointercapture', { pointerId: 1 }));
      check('ai-drag: lostpointercapture removes ghost', env.ghosts().length === 0);
      check('ai-drag: lostpointercapture notifies false', env.calls.states.join(',') === 'true,false');
      env.detach();
    }

    // (8) raycast returning null skips onDrop ----------------------------
    {
      const env = mount({ raycast: () => null });
      env.canvas.dispatchEvent(ev('pointerdown', { clientX: 10, clientY: 10 }));
      env.canvas.dispatchEvent(ev('pointermove', { clientX: 300, clientY: 250 }));
      env.canvas.dispatchEvent(ev('pointerup', { clientX: 300, clientY: 250 }));
      check('ai-drag: null raycast drops nothing', env.calls.drops.length === 0);
      check('ai-drag: null raycast still cleans up', env.ghosts().length === 0);
      env.detach();
    }

    // (9) a throwing onDrop cannot leak the ghost ------------------------
    {
      const env = mount({
        onDrop: () => {
          throw new Error('boom');
        },
      });
      env.canvas.dispatchEvent(ev('pointerdown', { clientX: 10, clientY: 10 }));
      env.canvas.dispatchEvent(ev('pointermove', { clientX: 300, clientY: 250 }));
      let escaped = false;
      try {
        env.canvas.dispatchEvent(ev('pointerup', { clientX: 300, clientY: 250 }));
      } catch {
        escaped = true;
      }
      check('ai-drag: throwing onDrop does not escape', escaped === false);
      check('ai-drag: throwing onDrop still removes ghost', env.ghosts().length === 0);
      env.detach();
    }

    // (10) a second pointer is ignored -----------------------------------
    {
      const env = mount();
      env.canvas.dispatchEvent(ev('pointerdown', { pointerId: 1, clientX: 10, clientY: 10 }));
      env.canvas.dispatchEvent(ev('pointerdown', { pointerId: 2, clientX: 300, clientY: 250 }));
      env.canvas.dispatchEvent(ev('pointermove', { pointerId: 2, clientX: 300, clientY: 250 }));
      env.canvas.dispatchEvent(ev('pointerup', { pointerId: 2, clientX: 300, clientY: 250 }));
      check('ai-drag: second pointer starts nothing', env.calls.states.length === 0 && env.calls.drops.length === 0);
      env.canvas.dispatchEvent(ev('pointerup', { pointerId: 1, clientX: 10, clientY: 10 }));
      check('ai-drag: first pointer still ends cleanly', env.calls.drops.length === 0 && env.ghosts().length === 0);
      env.detach();
    }

    // (11) stray move/up with no press do nothing ------------------------
    {
      const env = mount();
      env.canvas.dispatchEvent(ev('pointermove', { clientX: 300, clientY: 250 }));
      env.canvas.dispatchEvent(ev('pointerup', { clientX: 300, clientY: 250 }));
      check('ai-drag: stray events start nothing', env.calls.states.length === 0 && env.calls.drops.length === 0);
      env.detach();
    }

    // (12) non-primary button is ignored ---------------------------------
    {
      const env = mount();
      env.canvas.dispatchEvent(ev('pointerdown', { button: 2, clientX: 10, clientY: 10 }));
      env.canvas.dispatchEvent(ev('pointermove', { clientX: 300, clientY: 250 }));
      env.canvas.dispatchEvent(ev('pointerup', { button: 2, clientX: 300, clientY: 250 }));
      check('ai-drag: right button starts nothing', env.calls.states.length === 0 && env.calls.drops.length === 0);
      env.detach();
    }

    // (13) detach() mid-drag cleans up and kills future drags ------------
    {
      const env = mount();
      env.canvas.dispatchEvent(ev('pointerdown', { clientX: 10, clientY: 10 }));
      env.canvas.dispatchEvent(ev('pointermove', { clientX: 300, clientY: 250 }));
      env.detach();
      check('ai-drag: detach mid-drag removes ghost', env.ghosts().length === 0);
      check('ai-drag: detach mid-drag clears highlight', env.viewport.classList.contains(DROP_TARGET_CLASS) === false);
      check('ai-drag: detach mid-drag notifies false', env.calls.states.join(',') === 'true,false');
      check('ai-drag: detach restores touch-action', env.canvas.style.touchAction === undefined);
      check('ai-drag: detach leaves no keydown listener', doc._listeners.get('keydown').length === 0);

      const statesBefore = env.calls.states.length;
      env.canvas.dispatchEvent(ev('pointerdown', { clientX: 10, clientY: 10 }));
      env.canvas.dispatchEvent(ev('pointermove', { clientX: 300, clientY: 250 }));
      env.canvas.dispatchEvent(ev('pointerup', { clientX: 300, clientY: 250 }));
      doc.dispatchEvent(ev('keydown', { key: 'Escape' }));
      check('ai-drag: post-detach drag does nothing', env.calls.states.length === statesBefore && env.calls.drops.length === 0);
      check('ai-drag: post-detach leaves no ghost', env.ghosts().length === 0);
      env.detach(); // idempotent
    }

    // (14) detach before any interaction works ---------------------------
    {
      const env = mount();
      env.detach();
      env.detach();
      check('ai-drag: detach is idempotent', true);
      check('ai-drag: detach without touch-action leaves it unset', env.canvas.style.touchAction === undefined);
    }

    // (15) shared stylesheet refcount ------------------------------------
    {
      const a = mount();
      const b = mount();
      check('ai-drag: stylesheet present while attached', styleNode() !== null);
      a.detach();
      check('ai-drag: stylesheet survives one of two detaches', styleNode() !== null);
      b.detach();
      check('ai-drag: stylesheet removed when last detaches', styleNode() === null);
    }
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
}
