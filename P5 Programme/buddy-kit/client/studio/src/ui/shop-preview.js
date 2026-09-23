/**
 * shop-preview.js — the model-shop's shared, single-model preview canvas.
 *
 * One small DOM+three widget that renders whichever shop model the child taps in
 * the shop. It is deliberately NOT the AI preview (`ai-preview.js`): that one
 * reproduces the AI reply's primitive set, this one shows an imported GLB.
 *
 * It owns a FOURTH WebGL context: #1 the main `Viewport`, #2 the clay overlay,
 * #3 the AI preview, #4 this. Four live contexts is still far under the
 * browser's ~16-context cap, but the budget is why this widget is built for a
 * short life:
 *
 *  - CONSTRUCTION IS LAZY. No canvas, no `WebGLRenderer`, no context exists at
 *    import time or at `new ShopPreview(...)` time. The first `show(model)`
 *    creates them. A shop the child never opens costs zero contexts.
 *  - `hide()` only PAUSES the render loop; the context is kept so re-opening the
 *    preview is instant.
 *  - `dispose()` is the hard teardown: it stops the loop, disposes the model's
 *    geometry/material, disposes the renderer and calls `forceContextLoss()` to
 *    hand the context back promptly instead of waiting for GC. Idempotent.
 *
 * LOADING. `show(model)` loads through the INJECTED `loadTemplate(model.file)`.
 * That injected function is the shop loader's `loadTemplate`, which returns a
 * fresh deep clone (per-node geometry/material cloned) and never hands out the
 * cached template. This module therefore never imports the loader, never touches
 * its cache, and never needs to clone anything itself — the seam owns that.
 *
 * FALLBACK (decision 7). There is NO per-model preview artwork. When the context
 * cannot be created, is lost, or a model fails to load, the widget hides the
 * canvas and shows a generic in-DOM placeholder: the model's name plus a neutral
 * DOM/CSS icon (no emoji, no asset). Every failure path degrades to that
 * placeholder and never throws and never leaves a stale model on screen.
 *
 * LOCKED MODELS ARE PREVIEWABLE. `show()` does NOT consult `unlock.status()`:
 * looking at a model the child cannot yet afford is the point of a shop. Only
 * the drag/place affordance is gated on ownership (Tasks 6/7).
 *
 * Pure ESM; only `three` is imported. Nothing here touches the DOM until a
 * method is called, so the module imports cleanly under plain Node.
 */

import * as THREE from 'three';

/**
 * Most meshes ever rendered for one shop model preview.
 *
 * A GLB can legitimately contain hundreds of meshes; each one is drawn every
 * frame, so an unbounded set stalls the preview's render loop. The cap keeps the
 * preview responsive. The excess is not built into the draw: it is MARKED
 * invisible (never removed, so the hierarchy stays intact) and reported via
 * {@link ShopPreview.getCapInfo} so the UI can disclose the truncation. This is
 * a preview cap only — it never affects what `placeModel` puts in the scene.
 *
 * @type {number}
 */
export const PREVIEW_MAX_OBJECTS = 40;

/** How fast the preview model turns, radians per second (slow, calm idle). */
const IDLE_SPIN = 0.4;

/** Unit vector the preview camera sits along (slightly elevated 3/4 view). */
const VIEW_DIR = new THREE.Vector3(1, 0.62, 1.35).normalize();

/** Reusable scratch vectors for the pure camera maths (never returned by ref). */
const _center = new THREE.Vector3();
const _size = new THREE.Vector3();

/**
 * Coerce a value into a finite, positive pixel dimension (minimum 1).
 *
 * @param {*} value - Candidate width/height.
 * @param {*} fallback - Used when `value` is not a finite number.
 * @returns {number} A rounded integer ≥ 1.
 */
function safePixels(value, fallback) {
  const n = Number.isFinite(value) ? value : fallback;
  return Math.max(1, Math.round(Number.isFinite(n) ? n : 1));
}

/**
 * Work out where to put a perspective camera so a bounding box fills the view,
 * plus the near/far planes that contain it.
 *
 * Mirrors `ai-preview.js`'s `computePreviewFrame` (same maths, same guarantees)
 * but stays self-contained: importing the AI preview here would pull the AI
 * module and its scene import into the shop chunk for no reason. An empty or
 * non-finite box falls back to a 1.5-unit cube at the origin so the stage still
 * renders; a hostile transform must never produce a NaN camera. Never throws.
 *
 * @param {THREE.Box3|null|undefined} box - Bounds to frame.
 * @param {number} aspect - Canvas width / height. Non-finite/≤0 falls back to 1.
 * @param {number} fovDeg - Vertical field of view, degrees.
 * @param {number} [padding=0.25] - Fractional breathing room (0.25 = +25%).
 * @returns {{target:number[], position:number[], radius:number, near:number, far:number}}
 */
export function computeShopFrame(box, aspect, fovDeg, padding = 0.25) {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const safeFov = Number.isFinite(fovDeg) && fovDeg > 1 && fovDeg < 179 ? fovDeg : 45;
  const safePad = Number.isFinite(padding) && padding >= 0 ? padding : 0.25;

  const center = [0, 0, 0];
  let radius = 0.75; // fallback half-size for an empty scene
  if (box && typeof box.isEmpty === 'function' && !box.isEmpty()) {
    box.getCenter(_center);
    box.getSize(_size);
    const c = [_center.x, _center.y, _center.z];
    const r = Math.max(_size.length() * 0.5, 0.25);
    if (c.every((v) => Number.isFinite(v)) && Number.isFinite(r) && r > 0) {
      center[0] = c[0];
      center[1] = c[1];
      center[2] = c[2];
      radius = r;
    }
  }

  const halfV = (safeFov * Math.PI) / 180 / 2;
  const halfH = Math.atan(Math.tan(halfV) * safeAspect);
  let distance = (radius * (1 + safePad)) / Math.sin(Math.min(halfV, halfH));
  if (!Number.isFinite(distance) || distance <= 0) distance = radius * 3;

  const position = [
    center[0] + VIEW_DIR.x * distance,
    center[1] + VIEW_DIR.y * distance,
    center[2] + VIEW_DIR.z * distance,
  ];
  let near = Math.max(0.01, (distance - radius) * 0.5);
  if (!Number.isFinite(near) || near <= 0) near = Math.max(0.01, radius * 0.01);
  let far = Math.max(near + 1, distance + radius * 3);
  if (!Number.isFinite(far) || far <= near) far = near + radius * 3 + 1;

  return { target: center, position, radius, near, far };
}

/**
 * Is `value` a thenable (a real Promise, or a duck-typed one used by tests)?
 *
 * @param {*} value - Candidate.
 * @returns {boolean}
 */
function isThenable(value) {
  return (
    value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof value.then === 'function'
  );
}

/**
 * Best-effort dispose of an object graph: geometry and material, per node.
 *
 * three.js is intentionally not consulted for classes here — the graph is walked
 * generically so a plain test stub (no `isMesh`, no `dispose`) is simply left to
 * GC. Never throws; a failed disposal must not abort a preview swap.
 *
 * @param {*} root - The object graph to release.
 * @returns {void}
 */
function disposeGraph(root) {
  if (!root || typeof root !== 'object') return;
  const disposeNode = (node) => {
    if (!node || typeof node !== 'object') return;
    const geometry = node.geometry;
    if (geometry && typeof geometry.dispose === 'function') {
      try { geometry.dispose(); } catch (err) { /* best-effort */ }
    }
    const material = node.material;
    if (Array.isArray(material)) {
      for (const entry of material) {
        if (entry && typeof entry.dispose === 'function') {
          try { entry.dispose(); } catch (err) { /* best-effort */ }
        }
      }
    } else if (material && typeof material.dispose === 'function') {
      try { material.dispose(); } catch (err) { /* best-effort */ }
    }
  };
  if (typeof root.traverse === 'function') {
    try { root.traverse(disposeNode); } catch (err) { /* best-effort */ }
  } else {
    disposeNode(root);
  }
}

/**
 * The shared shop preview widget.
 *
 * @example
 * const preview = new ShopPreview(document.getElementById('shop-preview'), {
 *   loadTemplate: shopLoader.loadTemplate,
 * });
 * preview.show(model);   // creates the canvas/context on first call
 * preview.hide();        // pause
 * preview.dispose();     // release the context
 */
export class ShopPreview {
  /**
   * @param {HTMLElement} containerEl - The in-DOM box the canvas/placeholder is
   *   mounted into. Required.
   * @param {object} [deps]
   * @param {(file:string)=>*} [deps.loadTemplate] - Injected template loader
   *   (sync or async). It MUST return an independent clone; the real shop loader
   *   does. When omitted, `show()` degrades to the generic placeholder.
   * @throws {Error} When no container is supplied.
   */
  constructor(containerEl, { loadTemplate } = {}) {
    if (!containerEl) throw new Error('ShopPreview: a container element is required');
    this.container = containerEl;
    this.loadTemplate = typeof loadTemplate === 'function' ? loadTemplate : null;

    // Everything below is created lazily by `_ensureRenderer`, except the flags.
    this.canvas = null;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.group = null;
    this.grid = null;

    this._placeholder = null;
    this._placeholderName = null;
    this._model = null;
    this._capInfo = { total: 0, shown: 0, capped: false };
    this._resizeObserver = null;
    this._raf = 0;
    this._running = false;
    this._disposed = false;
    this._contextLost = false;
    /** Fences in-flight async loads: only the latest `show()` may land. @private */
    this._token = 0;
    /** Last model label, so a context loss can re-show the right placeholder. @private */
    this._label = '';
    this._lastTime = 0;
    this._onContextLost = this._onContextLost.bind(this);
  }

  /**
   * Create the canvas, WebGLRenderer, scene and camera on FIRST use.
   *
   * WHY lazy: this is the app's fourth WebGL context. Creating it eagerly (at
   * import or construction) would spend one of the browser's limited contexts on
   * every load, even for children who never open the shop. Returns `false` — and
   * leaves `_contextLost` set — when the context cannot be created, so every
   * caller degrades to the placeholder rather than throwing.
   *
   * @private
   * @returns {boolean} True when a usable renderer exists.
   */
  _ensureRenderer() {
    if (this.renderer) return true;
    if (this._contextLost) return false;
    let canvas = null;
    try {
      canvas = this.container.ownerDocument.createElement('canvas');
      canvas.className = 'shop-preview-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      this.container.appendChild(canvas);

      // May throw when no WebGL context can be created (blocked, exhausted, ...).
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));

      this.canvas = canvas;
      this.renderer = renderer;
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(45, 1, 0.05, 500);
      this.group = new THREE.Group();
      this.group.name = 'ShopPreviewRoot';
      this.scene.add(this.group);
      this._addLights();
      this._addGrid();

      // A lost context cannot be rendered into; fall back to the placeholder and
      // remember why, so a later `show()` does not pretend to have a canvas.
      canvas.addEventListener('webglcontextlost', this._onContextLost, false);

      if (typeof ResizeObserver !== 'undefined') {
        this._resizeObserver = new ResizeObserver(() => this.resize());
        this._resizeObserver.observe(canvas);
      }

      this.resize();
      return true;
    } catch (err) {
      // Clean up the half-built canvas before reporting the failure.
      if (this.renderer) {
        try { this.renderer.dispose(); } catch (e) { /* best-effort */ }
        this.renderer = null;
      }
      if (canvas && canvas.parentNode) {
        try { canvas.removeEventListener('webglcontextlost', this._onContextLost, false); } catch (e) { /* ignore */ }
        try { canvas.parentNode.removeChild(canvas); } catch (e) { /* ignore */ }
      }
      this.canvas = null;
      this.scene = null;
      this.camera = null;
      this.group = null;
      this._contextLost = true;
      return false;
    }
  }

  /**
   * Add the lighting rig so an imported model reads against the shop's panel
   * background: a hemisphere fill + a warm key + a dim rim.
   *
   * @private
   * @returns {void}
   */
  _addLights() {
    this.scene.add(new THREE.HemisphereLight(0xfff4e6, 0x2b3a46, 1.0));
    const key = new THREE.DirectionalLight(0xffffff, 1.9);
    key.position.set(4, 7, 5);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xcfd8ff, 0.5);
    rim.position.set(-4, 2, -4);
    this.scene.add(rim);
  }

  /**
   * Add the subtle ground grid that makes scale legible. Re-seated under the
   * framed model by {@link ShopPreview.frameCamera}.
   *
   * @private
   * @returns {void}
   */
  _addGrid() {
    this.grid = new THREE.GridHelper(10, 20, 0x1c4a66, 0x123a52);
    this.grid.position.y = 0;
    this.scene.add(this.grid);
  }

  /**
   * Build (once) and show the generic placeholder: the model's name plus a
   * neutral DOM/CSS icon. No per-model art, no emoji, no external asset.
   *
   * @private
   * @param {string} label - The model name to print.
   * @returns {void}
   */
  _showPlaceholder(label) {
    if (this._disposed) return;
    this._label = typeof label === 'string' && label ? label : 'Model';
    if (this.canvas) this.canvas.style.display = 'none';

    if (!this._placeholder) {
      const box = document.createElement('div');
      box.className = 'shop-preview-placeholder';
      box.setAttribute('role', 'img');

      // A neutral "shape" glyph drawn with two nested outlined squares, styled
      // inline so the widget needs no stylesheet entry of its own.
      const icon = document.createElement('div');
      icon.className = 'shop-preview-placeholder-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.style.cssText =
        'width:46px;height:46px;box-sizing:border-box;border:2px solid rgba(207,216,255,.55);' +
        'border-radius:10px;display:flex;align-items:center;justify-content:center;';
      const inner = document.createElement('div');
      inner.style.cssText =
        'width:16px;height:16px;box-sizing:border-box;border:2px solid rgba(207,216,255,.55);' +
        'border-radius:3px;transform:rotate(45deg);';
      icon.appendChild(inner);

      const name = document.createElement('div');
      name.className = 'shop-preview-placeholder-name';
      name.style.cssText = 'margin-top:10px;font-size:13px;line-height:1.3;text-align:center;';

      box.appendChild(icon);
      box.appendChild(name);
      this.container.appendChild(box);
      this._placeholder = box;
      this._placeholderName = name;
    }

    this._placeholderName.textContent = this._label;
    this._placeholder.setAttribute('aria-label', `Preview of ${this._label}`);
    this._placeholder.style.display = 'flex';
  }

  /**
   * Hide the generic placeholder (the canvas, if any, takes over).
   *
   * @private
   * @returns {void}
   */
  _hidePlaceholder() {
    if (this._placeholder) this._placeholder.style.display = 'none';
    if (this.canvas) this.canvas.style.display = 'block';
  }

  /**
   * Swap in a loaded model: clear the previous graph, cap the mesh count, mount
   * it, frame it, and start the idle loop. Never throws.
   *
   * @private
   * @param {object} obj - The freshly-cloned model root.
   * @returns {void}
   */
  _setModel(obj) {
    if (this._disposed || !this.group) return;
    this._clearModel();
    this._hidePlaceholder();

    // Cap: the first PREVIEW_MAX_OBJECTS meshes stay visible; the rest are
    // marked invisible but kept, so the hierarchy stays intact.
    const meshes = [];
    if (typeof obj.traverse === 'function') obj.traverse((n) => { if (n && n.isMesh) meshes.push(n); });
    const total = meshes.length;
    let shown = total;
    if (total > PREVIEW_MAX_OBJECTS) {
      for (let i = PREVIEW_MAX_OBJECTS; i < total; i += 1) meshes[i].visible = false;
      shown = PREVIEW_MAX_OBJECTS;
    }
    this._capInfo = { total, shown, capped: total > PREVIEW_MAX_OBJECTS };

    // A fresh orientation so the framing is deterministic, not stacked on the
    // previous model's idle rotation.
    this.group.rotation.y = 0;
    this.group.add(obj);
    this._model = obj;
    this.frameCamera();
    this.start();
  }

  /**
   * Remove and dispose the current model graph (if any). The clone's geometry
   * and materials are its own (the loader clones them), so disposing them here
   * never touches the loader's cache.
   *
   * @private
   * @returns {void}
   */
  _clearModel() {
    if (this._model) {
      if (this.group) {
        try { this.group.remove(this._model); } catch (err) { /* best-effort */ }
      }
      disposeGraph(this._model);
      this._model = null;
    }
    this._capInfo = { total: 0, shown: 0, capped: false };
    if (this.group) this.group.rotation.y = 0;
  }

  /**
   * Frame the current model: position the camera to fit its bounding box with
   * padding, aim it at the centre, and lay the ground grid on the box floor. An
   * empty preview still frames the fallback cube so the stage reads sensibly.
   *
   * @returns {void}
   */
  frameCamera() {
    if (this._disposed || !this.camera) return;
    const box = new THREE.Box3();
    if (this._model) {
      try {
        this.group.updateMatrixWorld(true);
        box.setFromObject(this._model);
      } catch (err) {
        box.makeEmpty();
      }
    }
    const fit = computeShopFrame(box, this.camera.aspect, this.camera.fov, 0.25);
    this.camera.position.fromArray(fit.position);
    this.camera.near = fit.near;
    this.camera.far = fit.far;
    this.camera.lookAt(fit.target[0], fit.target[1], fit.target[2]);
    this.camera.updateProjectionMatrix();

    if (this.grid) {
      const floorY = box.isEmpty() || !Number.isFinite(box.min.y) ? 0 : box.min.y;
      this.grid.position.set(fit.target[0], floorY, fit.target[2]);
      this.grid.scale.setScalar(Math.max(1, fit.radius));
    }
    this.render();
  }

  /**
   * Load a catalog model and show it. Locked models are previewable: this method
   * never consults the unlock engine. The load goes through the injected
   * `loadTemplate`, which returns an independent clone — the loader's cache is
   * never read, mutated, or disposed here.
   *
   * Every failure path (no loader, a throwing/rejecting load, a non-object
   * result, a context that cannot be created) degrades to the generic
   * placeholder and never throws and never leaves the previous model on screen.
   *
   * @param {{file?:string, name?:string}} model - A normalized catalog entry.
   * @returns {Promise<void>} Resolves once the model or placeholder is shown.
   */
  async show(model) {
    if (this._disposed) return;
    const label =
      model && typeof model.name === 'string' && model.name
        ? model.name
        : model && typeof model.file === 'string'
          ? model.file
          : 'Model';

    if (!model || typeof model.file !== 'string' || model.file === '' || !this.loadTemplate) {
      this._clearModel();
      this._showPlaceholder(label);
      return;
    }

    // Newest `show()` wins: a later call invalidates this one's result.
    const token = (this._token += 1);

    if (!this._ensureRenderer()) {
      this._clearModel();
      this._showPlaceholder(label);
      return;
    }

    let loaded;
    try {
      loaded = this.loadTemplate(model.file);
    } catch (err) {
      this._clearModel();
      this._showPlaceholder(label);
      return;
    }

    try {
      const obj = isThenable(loaded) ? await loaded : loaded;
      if (token !== this._token || this._disposed) {
        // Superseded or torn down: release the orphan clone and stop.
        disposeGraph(obj);
        return;
      }
      if (!obj || typeof obj !== 'object') {
        this._clearModel();
        this._showPlaceholder(label);
        return;
      }
      this._setModel(obj);
    } catch (err) {
      if (token !== this._token || this._disposed) return;
      this._clearModel();
      this._showPlaceholder(label);
    }
  }

  /**
   * Pause the render loop. The context (if any) is kept, so a later `show()`
   * resumes instantly. Safe to call when never started.
   *
   * @returns {void}
   */
  hide() {
    this._running = false;
    if (this._raf) {
      try { cancelAnimationFrame(this._raf); } catch (err) { /* ignore */ }
      this._raf = 0;
    }
  }

  /**
   * Start (or resume) the idle render loop. A no-op when there is no model or no
   * renderer — an empty or context-lost preview does not burn a frame.
   *
   * @returns {void}
   */
  start() {
    if (this._disposed || !this.renderer || this._contextLost) return;
    this._running = true;
    this._syncLoop();
  }

  /**
   * Start/stop the rAF loop to match the current running + model state. The
   * single place that decides whether a frame is scheduled. The loop also
   * applies the slow idle spin.
   *
   * @private
   * @returns {void}
   */
  _syncLoop() {
    const shouldLoop =
      this._running && !this._disposed && !this._contextLost && !!this.renderer && !!this._model;
    if (shouldLoop && !this._raf) {
      const tick = (time) => {
        if (!this._running || this._disposed) {
          this._raf = 0;
          return;
        }
        // rAF's own timestamp drives the delta — no clock read, no Date.now().
        if (!this._lastTime) this._lastTime = time;
        const dt = Math.min(0.05, Math.max(0, (time - this._lastTime) / 1000));
        this._lastTime = time;
        if (this.group) this.group.rotation.y += IDLE_SPIN * dt;
        this.render();
        this._raf = requestAnimationFrame(tick);
      };
      this._raf = requestAnimationFrame(tick);
    } else if (!shouldLoop && this._raf) {
      try { cancelAnimationFrame(this._raf); } catch (err) { /* ignore */ }
      this._raf = 0;
    }
  }

  /**
   * Render one frame synchronously. Public so a caller can force a paint without
   * waiting for the loop.
   *
   * @returns {void}
   */
  render() {
    if (this._disposed || !this.renderer || this._contextLost) return;
    try {
      this.renderer.render(this.scene, this.camera);
    } catch (err) {
      // A rendering failure must never break the shop UI.
    }
  }

  /**
   * Fit the drawing buffer + camera aspect to the canvas's CSS box. Uses
   * `updateStyle=false` so the inline style never fights the stylesheet (which
   * is what keeps the ResizeObserver from feeding back on itself).
   *
   * @param {number} [w] - Explicit CSS width; defaults to the canvas's.
   * @param {number} [h] - Explicit CSS height; defaults to the canvas's.
   * @returns {void}
   */
  resize(w, h) {
    if (this._disposed || !this.renderer) return;
    const width = safePixels(w, this.canvas ? this.canvas.clientWidth : 1);
    const height = safePixels(h, this.canvas ? this.canvas.clientHeight : 1);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /**
   * How the last successful `show()` interacted with the preview cap.
   *
   * @returns {{total:number, shown:number, capped:boolean}} Requested mesh count,
   *   meshes drawn, and whether anything was hidden from the DRAW only.
   */
  getCapInfo() {
    return { ...this._capInfo };
  }

  /**
   * Handle a lost WebGL context: stop rendering and fall back to the generic
   * placeholder. `preventDefault()` lets the browser attempt a restore; until
   * then the canvas is unusable, so the placeholder is the honest UI.
   *
   * @private
   * @param {Event} [event] - The `webglcontextlost` event.
   * @returns {void}
   */
  _onContextLost(event) {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    this._contextLost = true;
    this.hide();
    this._clearModel();
    this._showPlaceholder(this._label);
  }

  /**
   * Tear the widget down: stop the loop, disconnect the observer, dispose the
   * model graph, the grid and the renderer, then release the WebGL context via
   * `forceContextLoss()`. **Idempotent** — a second call is a no-op. Deliberately
   * never touches the viewport's renderer or context.
   *
   * @returns {void}
   */
  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this._token += 1;
    this.hide();

    if (this._resizeObserver) {
      try { this._resizeObserver.disconnect(); } catch (err) { /* ignore */ }
      this._resizeObserver = null;
    }
    if (this.canvas) {
      try { this.canvas.removeEventListener('webglcontextlost', this._onContextLost, false); } catch (err) { /* ignore */ }
    }

    this._clearModel();

    if (this.grid) {
      this.grid.geometry?.dispose?.();
      this.grid.material?.dispose?.();
      this.grid = null;
    }
    if (this.scene) {
      try { this.scene.clear(); } catch (err) { /* best-effort */ }
    }

    if (this.renderer) {
      try { this.renderer.dispose(); } catch (err) { /* best-effort */ }
      // Best-effort: hand the context back promptly instead of waiting for GC.
      try { this.renderer.forceContextLoss?.(); } catch (err) { /* best-effort */ }
    }

    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.group = null;
  }
}

/**
 * Convenience factory mirroring the class, so callers can build the widget
 * without importing the class binding.
 *
 * @param {HTMLElement} containerEl - The mount box.
 * @param {object} [deps] - See {@link ShopPreview}.
 * @returns {ShopPreview} A new, un-started (context-free) preview.
 */
export function createShopPreview(containerEl, deps) {
  return new ShopPreview(containerEl, deps);
}
