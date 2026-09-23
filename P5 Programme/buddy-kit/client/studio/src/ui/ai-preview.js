/**
 * ai-preview.js — the miniature three.js preview of an AI result.
 *
 * When the AI replies with a set of shapes, the panel shows a small rendered
 * preview of EXACTLY what would be inserted, before the user commits. That
 * "exactly" is the whole point: a preview that disagrees with the inserted
 * shape is worse than no preview, so this module reproduces `addPrimitive`'s
 * geometry + material faithfully (see the FACTORY NOTE below).
 *
 * It owns a THIRD WebGL context. `Viewport` owns #1 (the main scene) and
 * `clay/clay.js` owns #2 (the sculpt overlay). Measured in a real browser
 * during the task-8 verification: 3 live `webgl`/`webgl2` contexts total on a
 * default studio load, comfortably under the browser's ~16-context cap. This
 * renderer must NEVER be swapped for, or disposed along with, the viewport's —
 * they are independent by design.
 *
 * FACTORY NOTE — why the kinds are mirrored here instead of imported.
 * `PRIMITIVES` in `src/scene.js` is module-private (only `makeTorus` is
 * exported), so it cannot be imported; and importing `StudioScene` to get at
 * it would construct a second full document (a Group + rig + undo stacks) just
 * to read a geometry map — explicitly out of bounds. So `PREVIEW_PRIMITIVES`
 * below mirrors `scene.js`'s map VERBATIM, except for the torus, which is built
 * through the real exported `makeTorus` + the same `TORUS_DEFAULTS` so that one
 * kind is guaranteed identical. To keep the mirror honest, the Node suite
 * (`src/ai/tests/ai-preview.spec.js`) builds every kind through the REAL
 * `StudioScene.addPrimitive` on a headless scene and asserts the resulting
 * geometry (constructor name + every `.parameters` entry) and material equal
 * `PREVIEW_PRIMITIVES` / `PREVIEW_MATERIAL_PARAMS` — so editing `PRIMITIVES` in
 * `scene.js` makes that test fail. The allowed-kind whitelist is imported
 * (`AI_SHAPE_KINDS`) so the preview never advertises a kind the scene cannot
 * build.
 *
 * The transform semantics also mirror the insertion seam: `insert.js` calls
 * `addPrimitive(kind, color, {silent:true})` and THEN overwrites position /
 * rotation / scale from the payload. So the two addPrimitive side-effects (the
 * ground-snap `position.y` and the plane's baked `rotation.x = -PI/2`) are
 * overwritten by the payload and must NOT be re-applied here — the preview
 * objects carry exactly `transform.p/r/s`, and nothing else.
 *
 * Pure ESM. The class only touches DOM/WebGL inside its constructor/methods, so
 * this module still loads in plain Node for the pure-logic tests.
 */

import * as THREE from 'three';
import { makeTorus } from '../scene.js';
import { AI_SHAPE_KINDS } from '../ai/schema.js';
import { MAX_AI_OBJECTS } from '../ai/limits.js';

/**
 * The torus parameters `scene.js` uses for a freshly-created torus. Mirrored
 * (not exported there) but the GEOMETRY itself is built by the exported
 * `makeTorus`, so this object only has to agree on the numbers.
 */
const TORUS_DEFAULTS = Object.freeze({
  radius: 0.4,
  tube: 0.16,
  radialSegments: 16,
  tubularSegments: 48,
});

/**
 * Kind → geometry factory, mirroring `scene.js`'s private `PRIMITIVES`.
 *
 * Frozen and exported so the Node suite can assert each entry produces the
 * exact constructor + parameters `addPrimitive` uses. Keep this in lockstep
 * with `src/scene.js:13-21`.
 *
 * @type {Readonly<Record<string, () => THREE.BufferGeometry>>}
 */
export const PREVIEW_PRIMITIVES = Object.freeze({
  box: () => new THREE.BoxGeometry(1, 1, 1),
  sphere: () => new THREE.SphereGeometry(0.5, 32, 24),
  cylinder: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 32),
  cone: () => new THREE.ConeGeometry(0.5, 1, 32),
  torus: () => makeTorus(TORUS_DEFAULTS),
  octahedron: () => new THREE.OctahedronGeometry(0.6),
  plane: () => new THREE.PlaneGeometry(1, 1),
});

/**
 * The material parameters `addPrimitive` uses, shared by every preview mesh so
 * the preview can never drift from the inserted shape. `side: DoubleSide` is
 * required because primitive normals can be flipped by negative-scale edits.
 *
 * @type {Readonly<{roughness: number, metalness: number, side: THREE.Side}>}
 */
export const PREVIEW_MATERIAL_PARAMS = Object.freeze({
  roughness: 0.6,
  metalness: 0.1,
  side: THREE.DoubleSide,
});

/** Unit vector the preview camera sits along (slightly elevated 3/4 view). */
const VIEW_DIR = new THREE.Vector3(1, 0.62, 1.35).normalize();

/**
 * Most preview meshes that are ever RENDERED for one result.
 *
 * A model can legitimately return hundreds of primitives; each preview mesh is
 * its own geometry + material + transform, so an unbounded set can stall the
 * sidebar's render loop. The cap keeps the preview responsive — the count above
 * the cap is reported via {@link AIPreview.getCapInfo} so the panel can disclose
 * the truncation.
 *
 * This is the SAME value the apply path enforces (`ai-panel.js` slices the
 * objects it hands to the scene to `MAX_AI_OBJECTS`), so what the preview
 * promises and what actually lands in the scene cannot drift apart. It is an
 * alias of the shared constant rather than a second literal.
 *
 * @type {number}
 */
export const PREVIEW_MAX_OBJECTS = MAX_AI_OBJECTS;

/**
 * Split an AI object list into the previewed head and the totals.
 *
 * Pure so the Node suite can prove the cap without a WebGL context.
 *
 * @param {*} objects - Candidate AI object array.
 * @param {number} [max] - Maximum shown (defaults to {@link PREVIEW_MAX_OBJECTS});
 *   a non-finite/≤0 value falls back to the default.
 * @returns {{shown: Array, total: number, capped: boolean}} head slice + totals.
 */
export function capPreviewObjects(objects, max = PREVIEW_MAX_OBJECTS) {
  const list = Array.isArray(objects) ? objects : [];
  const limit = Number.isFinite(max) && max > 0 ? Math.floor(max) : PREVIEW_MAX_OBJECTS;
  return { shown: list.slice(0, limit), total: list.length, capped: list.length > limit };
}

// Scratch objects reused by the pure helpers (never returned by reference).
const _center = new THREE.Vector3();
const _size = new THREE.Vector3();

/**
 * Coerce an AI colour into a three.js decimal int.
 *
 * Accepts a decimal int (what `schema.js` produces), `#rrggbb`, `#rgb`, or the
 * bare (no `#`) forms. Anything else falls back to white so a bad colour never
 * blocks the preview — mirrors `schema.js`'s `parseColor` tolerance.
 *
 * @param {*} raw - The colour from the AI payload.
 * @returns {number} Decimal int in `0x000000..0xffffff`.
 */
export function previewColor(raw) {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.min(Math.max(Math.round(raw), 0), 0xffffff);
  }
  if (typeof raw === 'string') {
    const s = raw.trim();
    const long = /^#?([0-9a-fA-F]{6})$/.exec(s);
    if (long) return parseInt(long[1], 16);
    const short = /^#?([0-9a-fA-F]{3})$/.exec(s);
    if (short) {
      const [r, g, b] = short[1];
      return parseInt(r + r + g + g + b + b, 16);
    }
  }
  return 0xffffff;
}

/**
 * Build a fresh preview geometry for a kind, mirroring `addPrimitive`.
 *
 * @param {string} kind - One of `AI_SHAPE_KINDS`.
 * @returns {THREE.BufferGeometry} A new geometry with its bounding box computed.
 * @throws {Error} When `kind` is not a known primitive (callers catch + skip).
 */
export function buildPreviewGeometry(kind) {
  const factory = PREVIEW_PRIMITIVES[kind];
  if (!factory) {
    throw new Error(`AIPreview: unknown primitive kind '${String(kind)}'`);
  }
  const geometry = factory();
  geometry.computeBoundingBox();
  return geometry;
}

/**
 * Build a preview material matching `addPrimitive`'s mesh material.
 *
 * @param {*} color - AI colour (int or hex string); see {@link previewColor}.
 * @returns {THREE.MeshStandardMaterial}
 */
export function makePreviewMaterial(color) {
  return new THREE.MeshStandardMaterial({
    color: previewColor(color),
    roughness: PREVIEW_MATERIAL_PARAMS.roughness,
    metalness: PREVIEW_MATERIAL_PARAMS.metalness,
    side: PREVIEW_MATERIAL_PARAMS.side,
  });
}

/**
 * Pure camera-fitting maths: where to put a perspective camera so a bounding
 * box (plus ~20% padding by default) fills the view, and the near/far planes
 * that contain it.
 *
 * Kept out of the class so the Node suite can exercise it without WebGL: feed
 * it a `THREE.Box3` and read plain arrays back.
 *
 * @param {THREE.Box3|null|undefined} box - Bounds to frame. Empty/absent falls
 *   back to a 1.5-unit cube at the origin so an empty scene still renders.
 * @param {number} aspect - Canvas width / height. Non-finite/≤0 falls back to 1.
 * @param {number} fovDeg - Vertical field of view, degrees (preview uses 45).
 * @param {number} [padding=0.2] - Fractional breathing room (0.2 = +20%).
 * @returns {{target: number[], position: number[], distance: number, radius: number, near: number, far: number}}
 *   `target` is the box centre, `position` the camera position, `near`/`far`
 *   finite perspective planes guaranteed to bracket the sphere. Never throws.
 */
export function computePreviewFrame(box, aspect, fovDeg, padding = 0.2) {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const safeFov = Number.isFinite(fovDeg) && fovDeg > 1 && fovDeg < 179 ? fovDeg : 45;
  const safePad = Number.isFinite(padding) && padding >= 0 ? padding : 0.2;

  // Start from the fallback framing for an empty scene. A non-empty box whose
  // centre/size came back non-finite (e.g. an extreme `1e308` coordinate, or a
  // NaN transform) is treated EXACTLY like an empty one: a hostile reply must
  // never produce a `[Infinity,Infinity,Infinity]` camera. `schema.js` clamps
  // coordinates upstream, so this is the defence-in-depth backstop.
  const center = [0, 0, 0];
  let radius = 0.75; // fallback half-size for an empty scene
  if (box && typeof box.isEmpty === 'function' && !box.isEmpty()) {
    box.getCenter(_center);
    box.getSize(_size);
    const c = [_center.x, _center.y, _center.z];
    // A flat plane (one zero axis) still needs a non-zero sphere radius.
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
  // The nearest point of the bounding sphere sits at distance - radius; keep the
  // near plane in front of that and the far plane behind the whole sphere.
  let near = Math.max(0.01, (distance - radius) * 0.5);
  if (!Number.isFinite(near) || near <= 0) near = Math.max(0.01, radius * 0.01);
  let far = Math.max(near + 1, distance + radius * 3);
  if (!Number.isFinite(far) || far <= near) far = near + radius * 3 + 1;

  return { target: center, position, distance, radius, near, far };
}

/**
 * Coerce a raw 3-vector into a finite length-3 array with per-axis defaults.
 * Mirrors `insert.js`'s `vec3` so the preview applies the same values the
 * insertion will (missing/non-finite components keep their identity default).
 *
 * @param {*} raw - Candidate `[x,y,z]`.
 * @param {number} dx - Default x.
 * @param {number} dy - Default y.
 * @param {number} dz - Default z.
 * @returns {number[]} A finite length-3 array.
 */
function previewVec3(raw, dx, dy, dz) {
  const a = Array.isArray(raw) ? raw : [];
  const pick = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  return [pick(a[0], dx), pick(a[1], dy), pick(a[2], dz)];
}

/**
 * Miniature three.js preview of an AI shape set, drawn into an existing canvas.
 *
 * Lifecycle (driven by the panel, Task 12):
 * `setObjects(objs)` → `frameCamera()` → `start()`; on panel close `stop()`;
 * on teardown `dispose()`. `start()` is a no-op loop when there are no objects,
 * so the preview never burns a rAF while empty or closed.
 *
 * @example
 * const preview = new AIPreview(document.getElementById('ai-preview'));
 * preview.setObjects(parsed.objects);
 * preview.frameCamera();
 * preview.start();
 */
export class AIPreview {
  /**
   * @param {HTMLCanvasElement} canvasEl - The (already in-DOM) canvas to render
   *   into. Its CSS size drives the drawing-buffer size.
   * @throws {Error} When no canvas is supplied.
   */
  constructor(canvasEl) {
    if (!canvasEl) throw new Error('AIPreview: a canvas element is required');
    this.canvas = canvasEl;

    // WebGL context budget: #1 = main Viewport, #2 = clay overlay, #3 = this.
    // Measured live during the task-8 browser check: 3 contexts total, far under
    // the browser's ~16 per-page cap. Never reuse the viewport's renderer.
    this.renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true });
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x060d1a);
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.05, 200);

    /** All preview meshes live under this group so clearing never touches lights. */
    this.group = new THREE.Group();
    this.group.name = 'AIPreviewRoot';
    this.scene.add(this.group);

    /** @type {THREE.Mesh[]} Live preview meshes, in payload order. */
    this._meshes = [];
    /** @type {{total: number, shown: number, capped: boolean}} last setObjects cap outcome. @private */
    this._capInfo = { total: 0, shown: 0, capped: false };
    this._raf = 0;
    this._running = false;
    this._disposed = false;

    this._addLights();
    this._addGrid();

    // Track the canvas's CSS box. Guarded for non-browser environments (Node).
    this._resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => this.resize())
        : null;
    if (this._resizeObserver) this._resizeObserver.observe(canvasEl);

    this.resize();
    this.frameCamera();
    this.render();
  }

  /**
   * Add the lighting rig so shapes read against the dark UI background:
   * a hemisphere fill + a key directional + a dim rim directional (still a
   * `DirectionalLight`).
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
   * Add the subtle ground grid that makes scale + floor orientation legible.
   * Re-positioned/rescaled by {@link frameCamera} to sit on the framed bounds.
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
   * Rebuild the preview from an AI object set.
   *
   * Clears the existing meshes (disposing their geometries/materials) and
   * builds a `THREE.Mesh` per entry using the mirrored primitive factory +
   * `addPrimitive`'s material, then applies `transform.p/r/s`. Entries with an
   * unknown kind or a construction failure are skipped silently (the validator
   * upstream reports those); non-array input clears to empty. At most
   * {@link PREVIEW_MAX_OBJECTS} are built — the rest are counted by
   * {@link AIPreview.getCapInfo} so the UI can explain the truncation. Never throws.
   *
   * @param {Array<{kind: string, color?: number|string, transform?: {p: number[], r: number[], s: number[]}}>} objects
   *   Validated/normalized AI objects (see `src/ai/schema.js`).
   * @returns {number} How many meshes were built (fed to `hasObjects()`).
   */
  setObjects(objects) {
    if (this._disposed) return 0;
    this._clearMeshes();
    const { shown, total, capped } = capPreviewObjects(objects);
    this._capInfo = { total, shown: shown.length, capped };
    for (const o of shown) {
      const mesh = this._buildMesh(o);
      if (mesh) {
        this.group.add(mesh);
        this._meshes.push(mesh);
      }
    }
    // Paint immediately so the preview is correct even before start() is called.
    this.render();
    this._syncLoop();
    return this._meshes.length;
  }

  /**
   * How the last `setObjects` interacted with the preview cap.
   * @returns {{total: number, shown: number, capped: boolean}} requested count,
   *   meshes built, and whether anything was dropped from the RENDER only.
   */
  getCapInfo() {
    return { ...this._capInfo };
  }

  /**
   * Build one preview mesh from an AI object, mirroring the insertion seam
   * (geometry + material like `addPrimitive`, then the payload's transform).
   *
   * @private
   * @param {*} o - One AI object entry.
   * @returns {THREE.Mesh|null} The mesh, or `null` when the entry is unusable.
   */
  _buildMesh(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
    let geometry = null;
    try {
      geometry = buildPreviewGeometry(o.kind);
      const material = makePreviewMaterial(o.color);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = typeof o.name === 'string' && o.name ? o.name : String(o.kind);
      mesh.userData.kind = o.kind;

      // Faithful to insert.js: a torus payload carrying explicit params is
      // rebuilt through the real makeTorus.
      if (o.kind === 'torus' && o.torus) {
        try {
          geometry.dispose();
          geometry = makeTorus(o.torus);
          mesh.geometry = geometry;
        } catch {
          // Keep the default torus geometry if the stored params are malformed.
        }
      }

      const t = o.transform && typeof o.transform === 'object' ? o.transform : {};
      mesh.position.fromArray(previewVec3(t.p, 0, 0, 0));
      const r = previewVec3(t.r, 0, 0, 0);
      mesh.rotation.set(r[0], r[1], r[2]);
      mesh.scale.fromArray(previewVec3(t.s, 1, 1, 1));
      return mesh;
    } catch {
      geometry?.dispose();
      return null;
    }
  }

  /**
   * Frame the current meshes: position the camera to fit their bounding box
   * with ~20% padding, aimed at its centre, and lay the ground grid on the
   * box's floor. An empty preview still frames the fallback cube so the panel
   * shows a sensible (empty) stage.
   *
   * @returns {void}
   */
  frameCamera() {
    if (this._disposed) return;
    const box = new THREE.Box3();
    if (this._meshes.length) {
      this.group.updateMatrixWorld(true);
      box.setFromObject(this.group);
    }
    const fit = computePreviewFrame(box, this.camera.aspect, this.camera.fov, 0.2);
    this.camera.position.fromArray(fit.position);
    this.camera.near = fit.near;
    this.camera.far = fit.far;
    this.camera.lookAt(fit.target[0], fit.target[1], fit.target[2]);
    this.camera.updateProjectionMatrix();

    // Sit the grid on the framed floor, centred under the group, scaled so it
    // reads at any object size. A non-finite box min.y (extreme coordinates)
    // must not put the grid at NaN; fall back to the origin floor.
    const floorY = box.isEmpty() || !Number.isFinite(box.min.y) ? 0 : box.min.y;
    this.grid.position.set(fit.target[0], floorY, fit.target[2]);
    this.grid.scale.setScalar(Math.max(1, fit.radius));
    this.render();
  }

  /**
   * Fit the drawing buffer + camera aspect to the canvas's CSS box.
   *
   * Uses `updateStyle=false` so the inline style never overrides the
   * stylesheet, which is what lets the ResizeObserver observe the CSS box
   * without an observe → setStyle → observe feedback loop.
   *
   * @param {number} [w] - Explicit CSS width; defaults to the canvas's.
   * @param {number} [h] - Explicit CSS height; defaults to the canvas's.
   * @returns {void}
   */
  resize(w, h) {
    if (this._disposed) return;
    const width = Math.max(1, Math.round(Number.isFinite(w) ? w : this.canvas.clientWidth || 1));
    const height = Math.max(1, Math.round(Number.isFinite(h) ? h : this.canvas.clientHeight || 1));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Render one frame synchronously. Public so callers/tests can force a paint
   * without waiting for the rAF loop.
   *
   * @returns {void}
   */
  render() {
    if (this._disposed) return;
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Start the render loop. It only actually loops while the preview has
   * objects; with an empty set it paints one frame and stays idle, so a panel
   * left open on an empty preview does not burn a rAF forever.
   *
   * @returns {void}
   */
  start() {
    if (this._disposed) return;
    this._running = true;
    this._syncLoop();
  }

  /**
   * Stop the render loop and cancel the pending frame. Safe to call when
   * already stopped.
   *
   * @returns {void}
   */
  stop() {
    this._running = false;
    if (this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = 0;
    }
  }

  /**
   * Whether the preview currently holds at least one mesh. The panel uses this
   * to enable/disable its action buttons.
   *
   * @returns {boolean}
   */
  hasObjects() {
    return this._meshes.length > 0;
  }

  /**
   * Start/stop the rAF loop to match the current running + object state. The
   * single place that decides whether a frame is scheduled.
   *
   * @private
   * @returns {void}
   */
  _syncLoop() {
    const shouldLoop = this._running && !this._disposed && this.hasObjects();
    if (shouldLoop && !this._raf) {
      const tick = () => {
        if (!this._running || this._disposed) {
          this._raf = 0;
          return;
        }
        this.render();
        this._raf = requestAnimationFrame(tick);
      };
      this._raf = requestAnimationFrame(tick);
    } else if (!shouldLoop && this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = 0;
    }
    // Empty (but open) preview still paints its framed stage once.
    if (this._running && !this.hasObjects()) this.render();
  }

  /**
   * Remove + dispose every preview mesh. Geometry and material are per-mesh
   * (never shared), so each is disposed individually.
   *
   * @private
   * @returns {void}
   */
  _clearMeshes() {
    for (const mesh of this._meshes) {
      this.group.remove(mesh);
      mesh.geometry?.dispose?.();
      if (Array.isArray(mesh.material)) {
        for (const m of mesh.material) m?.dispose?.();
      } else {
        mesh.material?.dispose?.();
      }
    }
    this._meshes = [];
  }

  /**
   * Tear the preview down: stop the loop, disconnect the resize observer,
   * dispose all meshes, the grid and the renderer, and release the WebGL
   * context. **Idempotent** — repeated calls are no-ops. Deliberately does NOT
   * touch the viewport's renderer or context.
   *
   * @returns {void}
   */
  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this.stop();

    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }

    this._clearMeshes();

    this.grid.geometry?.dispose?.();
    this.grid.material?.dispose?.();
    this.scene.remove(this.grid);

    this.scene.remove(this.group);
    this.scene.clear();

    this.renderer.dispose();
    // Best-effort: hand the context back promptly instead of waiting for GC.
    try {
      this.renderer.forceContextLoss?.();
    } catch {
      /* best-effort teardown */
    }
  }
}
