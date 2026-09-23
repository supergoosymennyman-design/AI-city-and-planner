/**
 * shop-thumbnail.js — offscreen GLB → PNG thumbnail provider for the shop cards.
 *
 * The skill-tree / shop panel renders PURE DOM from state; it cannot draw a 3D
 * model. This module is the seam that turns a catalog model into a small PNG
 * `data:` URL the panel can drop into an `<img>`.
 *
 * CONTEXT BUDGET — THIS IS THE APP'S FIFTH WEBGL CONTEXT. #1 the main
 * `Viewport`, #2 the clay overlay, #3 the AI preview, #4 the shop preview, #5
 * this thumbnail provider. Five is still under the browser's ~16-context cap,
 * and the budget is exactly why this provider follows the same hard rules the
 * shop preview learned:
 *
 *  - SINGLE. One canvas + one `WebGLRenderer` for the whole provider, reused for
 *    every model. Generating N thumbnails never creates N contexts.
 *  - LAZY. The canvas and context do not exist at import time or at
 *    `createThumbnailProvider(...)` time. They are created on the first
 *    `generate()`. A session that never opens the thumbnail view costs zero
 *    contexts.
 *  - DETACHED. The canvas is created with `document.createElement('canvas')`
 *    and is NEVER appended to the DOM. The shop's `preview-render` e2e scenario
 *    asserts ZERO canvases inside `#shop-preview` before a card is selected, and
 *    the panel owns the `<img>` — so this module must never mount anything.
 *
 * LOADING. `loadTemplate(file)` is INJECTED. It is loader-agnostic: the real
 * shop loader hands back an independent clone (per-node geometry/material) that
 * this provider disposes after each render; a raw GLTF importer hands back a
 * `{ scene }` wrapper, which is unwrapped here. This module never imports the
 * loader, the controller, `main.js`, or any shop state — the seam owns all of
 * that and the cache is deliberately the loader's business, not ours.
 *
 * FAILURE DISCIPLINE. Every path resolves to `null` and never throws: no
 * document, no WebGL context, a throwing/rejecting loader, a non-object result,
 * a throwing `setFromObject`, or a throwing `toDataURL`. A failed thumbnail is
 * simply a missing image the panel can lay out around.
 *
 * Pure ESM; only `three` and the pure `computeShopFrame` helper are imported.
 * No DOM access happens until `generate()` is called, so the module imports
 * cleanly under plain Node.
 */

import * as THREE from 'three';
import { computeShopFrame } from './shop-preview.js';

/** The only MIME prefix a valid thumbnail may carry. */
const PNG_PREFIX = 'data:image/png;base64,';

/** Vertical field of view, degrees — matches the live preview so framing reads the same. */
const THUMB_FOV = 45;

/** Fractional breathing room around the model box — matches the live preview. */
const THUMB_PADDING = 0.25;

/** Default thumbnail width in pixels (used by the option default and its fallback). */
const DEFAULT_THUMB_WIDTH = 160;

/** Default thumbnail height in pixels (used by the option default and its fallback). */
const DEFAULT_THUMB_HEIGHT = 120;

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
 * Pick the object to add to the render scene from a loader result.
 *
 * Loader-agnostic on purpose: the shop loader returns a `THREE.Object3D` clone,
 * while a raw GLTF importer returns a `{ scene, animations, ... }` wrapper.
 * `null` when neither shape is usable (a hostile or empty result).
 *
 * @param {*} value - Whatever `loadTemplate` resolved.
 * @returns {import('three').Object3D|null}
 */
function toRenderableRoot(value) {
  if (!value || typeof value !== 'object') return null;
  if (value.isObject3D) return value;
  if (value.scene && value.scene.isObject3D) return value.scene;
  return null;
}

/**
 * Reset a loaded clone's root transform so the authored geometry frames itself.
 *
 * The loader's clone carries whatever normalisation the importer applied (the
 * studio's importer scales the model to ~1.7 tall and re-centres it). For a
 * thumbnail we want the model at its authored origin, so the box and the frame
 * below describe the model itself, not a prior placement. Best-effort: a hostile
 * stub without these members is left as-is.
 *
 * @param {*} root - The renderable root.
 * @returns {void}
 */
function neutraliseRoot(root) {
  try { root.scale?.set?.(1, 1, 1); } catch (err) { /* best-effort */ }
  try { root.position?.set?.(0, 0, 0); } catch (err) { /* best-effort */ }
  try { root.quaternion?.identity?.(); } catch (err) { /* best-effort */ }
}

/**
 * Best-effort dispose of an object graph: geometry and material, per node.
 *
 * `three` classes are intentionally not consulted — the graph is walked
 * generically so a plain test stub is simply left to GC. Never throws; a failed
 * disposal must not abort a thumbnail run.
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
 * The cache key for a catalog entry: `id`, falling back to `file`.
 *
 * @param {*} model - A normalized catalog entry.
 * @returns {string|null} A non-empty string key, or `null` when unusable.
 */
function cacheKeyOf(model) {
  if (!model || typeof model !== 'object') return null;
  if (typeof model.id === 'string' && model.id) return model.id;
  if (typeof model.file === 'string' && model.file) return model.file;
  return null;
}

/**
 * Build an offscreen thumbnail provider bound to one injected template loader.
 *
 * The returned object owns exactly one lazily-created, DETACHED
 * `canvas` + `WebGLRenderer`, plus a `Map` cache of `modelId → PNG data URL`.
 * Nothing touches the DOM until the first `generate()`.
 *
 * @param {object} options
 * @param {(file:string)=>*} options.loadTemplate - Injected template loader
 *   (sync or async). Receives a bare `.glb` filename and must return either an
 *   independent clone (the shop loader does) or a `{ scene }` wrapper (a raw
 *   importer does). When omitted, `generate()` resolves `null`.
 * @param {number} [options.width=160] - Thumbnail pixel width.
 * @param {number} [options.height=120] - Thumbnail pixel height.
 * @returns {{
 *   get: (modelId:string) => (string|null),
 *   generate: (model:object) => Promise<string|null>,
 *   warm: (models:object[]) => Promise<Map<string,string>>,
 *   dispose: () => void,
 * }}
 */
export function createThumbnailProvider({ loadTemplate, width = DEFAULT_THUMB_WIDTH, height = DEFAULT_THUMB_HEIGHT } = {}) {
  const loader = typeof loadTemplate === 'function' ? loadTemplate : null;
  const px = safePixels(width, DEFAULT_THUMB_WIDTH);
  const py = safePixels(height, DEFAULT_THUMB_HEIGHT);

  /** @type {Map<string,string>} modelId → PNG data URL (successes only). */
  const cache = new Map();

  let canvas = null;
  let renderer = null;
  let scene = null;
  let camera = null;
  let disposed = false;
  let contextLost = false;

  /**
   * A lost context cannot be rendered into; remember it so later calls do not
   * pretend to have a canvas. `preventDefault()` lets the browser attempt a
   * restore, though a restored context is not required for a one-shot render.
   *
   * @param {Event} [event] - The `webglcontextlost` event.
   * @returns {void}
   */
  function handleContextLost(event) {
    if (event && typeof event.preventDefault === 'function') {
      try { event.preventDefault(); } catch (err) { /* ignore */ }
    }
    contextLost = true;
  }

  /**
   * Create the single detached canvas + renderer + scene + camera on FIRST use.
   *
   * WHY lazy: this is the app's fifth WebGL context. Creating it eagerly would
   * spend a context on every load, even when no thumbnail is ever requested.
   * Returns `false` — and latches `contextLost` — when no usable context can be
   * created, so callers degrade to `null` rather than throwing.
   *
   * @returns {boolean} True when a usable renderer exists.
   */
  function ensureRenderer() {
    if (renderer) return true;
    if (contextLost || disposed) return false;
    let localCanvas = null;
    try {
      const doc = globalThis.document;
      if (!doc || typeof doc.createElement !== 'function') return false;

      localCanvas = doc.createElement('canvas');
      // DELIBERATELY DETACHED: never appended to the DOM (see module header).

      // May throw when no WebGL context can be created (blocked, exhausted, ...).
      const localRenderer = new THREE.WebGLRenderer({
        canvas: localCanvas,
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
      });
      // Assign immediately so the catch below can dispose a half-built renderer.
      canvas = localCanvas;
      renderer = localRenderer;
      renderer.setPixelRatio(1);

      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(THUMB_FOV, px / py, 0.05, 1000);

      // The same hemisphere + warm key + dim rim rig the live preview uses, so a
      // thumbnail and the preview read as the same model under the same light.
      scene.add(new THREE.HemisphereLight(0xfff4e6, 0x2b3a46, 1.0));
      const key = new THREE.DirectionalLight(0xffffff, 1.9);
      key.position.set(4, 7, 5);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0xcfd8ff, 0.5);
      rim.position.set(-4, 2, -4);
      scene.add(rim);

      canvas.addEventListener('webglcontextlost', handleContextLost, false);
      return true;
    } catch (err) {
      if (renderer) {
        try { renderer.dispose(); } catch (e) { /* best-effort */ }
      }
      canvas = null;
      renderer = null;
      scene = null;
      camera = null;
      contextLost = true;
      return false;
    }
  }

  /**
   * Synchronously read a cached thumbnail.
   *
   * This is the call the PURE panel makes: it must never await, so a hit returns
   * the data URL and a miss returns `null` (the panel renders a placeholder and
   * a later `warm()` fills it in).
   *
   * @param {string} modelId - A catalog `id` (the caching key).
   * @returns {string|null} A `data:image/png;base64,...` URL, or `null`.
   */
  function get(modelId) {
    if (typeof modelId !== 'string' || !modelId) return null;
    const url = cache.get(modelId);
    return typeof url === 'string' ? url : null;
  }

  /**
   * Render one model to a PNG data URL (or `null`).
   *
   * A cached id short-circuits without re-rendering, so repeated calls are cheap.
   * A failure is NOT cached, so a transient failure can be retried by a later
   * `warm`. Every failure path resolves `null`; this method never rejects.
   *
   * @param {{id?:string, file?:string}} model - A normalized catalog entry.
   * @returns {Promise<string|null>}
   */
  async function generate(model) {
    if (disposed) return null;
    const key = cacheKeyOf(model);
    if (!key) return null;
    if (cache.has(key)) return cache.get(key);
    if (!loader || typeof model.file !== 'string' || model.file === '') return null;
    if (!ensureRenderer()) return null;

    let root = null;
    try {
      let loaded;
      try {
        loaded = loader(model.file);
      } catch (err) {
        return null; // a sync-throwing loader
      }

      let result;
      try {
        result = isThenable(loaded) ? await loaded : loaded;
      } catch (err) {
        return null; // a rejecting loader
      }

      if (disposed) {
        disposeGraph(result);
        return null;
      }

      root = toRenderableRoot(result);
      if (!root) return null;

      neutraliseRoot(root);

      try {
        scene.add(root);
      } catch (err) {
        root = null;
        return null;
      }

      // World matrices must be current before the box is measured; the root's
      // own update is enough because it sits at the scene origin.
      root.updateMatrixWorld(true);

      let box;
      try {
        box = new THREE.Box3().setFromObject(root);
      } catch (err) {
        box = new THREE.Box3(); // empty → the helper's fallback cube
      }

      // Reuse the LIVE preview's framing maths so thumbnail and preview agree.
      const fit = computeShopFrame(box, px / py, THUMB_FOV, THUMB_PADDING);
      camera.position.fromArray(fit.position);
      camera.near = fit.near;
      camera.far = fit.far;
      camera.lookAt(fit.target[0], fit.target[1], fit.target[2]);
      camera.updateProjectionMatrix();

      // updateStyle=false: the canvas is detached, so no CSS box is needed.
      renderer.setSize(px, py, false);
      renderer.render(scene, camera);

      const url = canvas.toDataURL('image/png');
      if (typeof url === 'string' && url.startsWith(PNG_PREFIX) && url.length > PNG_PREFIX.length) {
        cache.set(key, url);
        return url;
      }
      return null;
    } catch (err) {
      return null; // setFromObject / toDataURL / render all degrade to null
    } finally {
      if (root) {
        try { scene.remove(root); } catch (err) { /* best-effort */ }
        // The clone is ours (the loader clones it), so disposing it never
        // touches the loader's cache.
        disposeGraph(root);
      }
    }
  }

  /**
   * Generate thumbnails for a list of models, SEQUENTIALLY.
   *
   * Sequential on purpose: one shared context and one shared camera means
   * parallel renders would only add pressure, not throughput. Ids already in
   * the cache are SKIPPED, so `warm` is idempotent and safe to call repeatedly
   * (e.g. on every panel render); a model that fails is skipped without failing
   * the run.
   *
   * @param {Array<{id?:string, file?:string}>} models - Catalog entries.
   * @returns {Promise<Map<string,string>>} A snapshot of the full cache.
   */
  async function warm(models) {
    if (!Array.isArray(models)) return new Map(cache);
    for (const model of models) {
      if (disposed) break;
      const key = cacheKeyOf(model);
      if (!key || cache.has(key)) continue;
      try {
        await generate(model);
      } catch (err) {
        // generate() never rejects, but a hostile injected loader must not
        // abort the remaining models either.
      }
    }
    return new Map(cache);
  }

  /**
   * Tear the provider down: dispose the renderer and release the WebGL context
   * via `forceContextLoss()`. **Idempotent** — a second call is a no-op. The
   * canvas is detached, so there is nothing to remove from the DOM.
   *
   * @returns {void}
   */
  function dispose() {
    if (disposed) return;
    disposed = true;

    if (canvas) {
      try { canvas.removeEventListener('webglcontextlost', handleContextLost, false); } catch (err) { /* ignore */ }
    }
    if (scene) {
      try { scene.clear(); } catch (err) { /* best-effort */ }
    }
    if (renderer) {
      try { renderer.dispose(); } catch (err) { /* best-effort */ }
      // Best-effort: hand the context back promptly instead of waiting for GC.
      try { renderer.forceContextLoss?.(); } catch (err) { /* best-effort */ }
    }

    canvas = null;
    renderer = null;
    scene = null;
    camera = null;
  }

  return { get, generate, warm, dispose };
}
