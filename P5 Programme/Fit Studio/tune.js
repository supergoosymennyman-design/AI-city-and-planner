/**
 * tune.js — Champion 3D Spike, "2D look tuning" variant.
 *
 * WHY this file exists as a SEPARATE page from main.js (not an edit of it): a prior in-place edit
 * of main.js was interrupted mid-save while the owner was live-testing index.html and broke the
 * working viewer. This file is a full copy-and-extend of main.js's scene/toon/outline/GLB-loading
 * plumbing (see that file's own header for the toon-shading + outline-mesh rationale — the WHY
 * comments on toonify()/makeOutlineMesh() are reproduced here, not re-derived, because the
 * technique is identical) PLUS four new "2D-ness" dials the owner asked for:
 *
 *   1. Texture posterize  — quantizes each material's .map to N levels/channel on an offscreen
 *      canvas. This is the dial that matters most: an AI-baked texture already carries smooth
 *      shading gradients that fight the toon gradient-map bands no matter how few bands you use.
 *   2. Camera projection  — Perspective <-> Orthographic ("Flat (2D)"), swapped on the SAME
 *      OrbitControls instance so drag/zoom keeps working either way.
 *   3. Band count + ambient/key balance — rebuilds the shared toon gradientMap DataTexture, and
 *      trades hemisphere fill for directional key (or back) out of a fixed lighting budget.
 *   4. Outline thickness — a multiplier on the existing per-mesh inverted-hull displacement,
 *      applied through a live-updatable shader uniform (no material rebuild needed per tick).
 *
 * Everything here is vanilla ESM against the vendored ./vendor/three.module.js — no bundler, no
 * CDN, same as main.js. This folder is explicitly OUT of the `web/games/**` CI gate (README.md).
 */

import * as THREE from 'three';
import { GLTFLoader } from './vendor/loaders/GLTFLoader.js';
import { OrbitControls } from './vendor/controls/OrbitControls.js';
import { TransformControls } from './vendor/controls/TransformControls.js';
import { GLTFExporter } from './vendor/exporters/GLTFExporter.js';
import { FBXLoader } from './vendor/loaders/FBXLoader.js';
import { OBJLoader } from './vendor/loaders/OBJLoader.js';
import * as SkeletonUtils from './vendor/utils/SkeletonUtils.js';
import { saveWardrobe } from './wardrobe-store.js';
import { progressUI, fetchWithProgress } from './progress.js';

// ---------------------------------------------------------------------------------------------
// Renderer / scene / cameras
// ---------------------------------------------------------------------------------------------

const canvas = document.getElementById('viewport');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
} catch (err) {
  // Loud failure, same rationale as main.js: a spike that silently shows a black canvas wastes
  // the reviewer's time more than one that says plainly "WebGL didn't come up here."
  const pre = document.createElement('pre');
  pre.style.cssText = 'color:#ff6a6a;padding:24px;font:13px monospace';
  pre.textContent = 'WebGL renderer failed to initialize: ' + (err && err.message ? err.message : err);
  document.body.textContent = '';
  document.body.appendChild(pre);
  throw err;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0d12);

/** Perspective camera — the default, identical framing to main.js. */
const perspCamera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.05, 100);
perspCamera.position.set(1.6, 1.4, 2.3);

/** Orthographic camera ("Flat (2D)") — frustum bounds are computed from the perspective camera's
 * current distance/fov every time we switch INTO ortho (see syncOrthoFromPerspective), so it
 * always frames the same view the user was just looking at. Bounds are placeholders until then. */
const orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 100);
orthoCamera.position.copy(perspCamera.position);

/** The camera currently attached to the renderer + OrbitControls. Starts perspective per spec
 * ("Default perspective"). */
let camera = perspCamera;
let cameraKind = 'persp'; // 'persp' | 'ortho'

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 0.75, 0);
controls.minDistance = 0.4;
controls.maxDistance = 12;
controls.update();

/**
 * Recompute the orthographic camera's frustum so it shows the SAME view (direction + apparent
 * size) the perspective camera is currently showing, at the perspective camera's current
 * distance from the controls target. Standard "match an ortho frustum to a perspective FOV at a
 * given distance" formula: half-height = tan(fov/2) * distance.
 */
function syncOrthoFromPerspective() {
  const dist = Math.max(perspCamera.position.distanceTo(controls.target), 0.001);
  const vFov = THREE.MathUtils.degToRad(perspCamera.fov);
  const halfH = Math.tan(vFov / 2) * dist;
  const halfW = halfH * perspCamera.aspect;
  orthoCamera.left = -halfW;
  orthoCamera.right = halfW;
  orthoCamera.top = halfH;
  orthoCamera.bottom = -halfH;
  orthoCamera.near = perspCamera.near;
  orthoCamera.far = perspCamera.far;
  orthoCamera.zoom = 1;
  orthoCamera.position.copy(perspCamera.position);
  orthoCamera.quaternion.copy(perspCamera.quaternion);
  orthoCamera.updateProjectionMatrix();
}

/**
 * Swap the active camera on the SAME OrbitControls instance, preserving view direction and
 * distance. Reassigning `controls.object` works because the vendored OrbitControls reads
 * `this.object.position` etc. fresh on every `update()` call (it re-derives its internal
 * spherical coordinates from the object's current position relative to `target` each time) rather
 * than caching the camera reference's transform at construction — see vendor/controls/
 * OrbitControls.js `update()`. No new OrbitControls instance is needed.
 * @param {'persp'|'ortho'} kind
 */
function setCameraKind(kind) {
  if (kind === cameraKind) return;
  if (kind === 'ortho') {
    syncOrthoFromPerspective();
    camera = orthoCamera;
  } else {
    // Coming back from ortho: carry the (possibly orbited/zoomed) ortho position back so the
    // perspective camera resumes from the same vantage point rather than snapping.
    perspCamera.position.copy(orthoCamera.position);
    perspCamera.quaternion.copy(orthoCamera.quaternion);
    perspCamera.updateProjectionMatrix();
    camera = perspCamera;
  }
  controls.object = camera;
  controls.update();
  cameraKind = kind;
  gizmo.camera = camera; // the fit gizmo raycasts through the ACTIVE camera, incl. ortho "Flat (2D)"
}

window.addEventListener('resize', () => {
  perspCamera.aspect = window.innerWidth / window.innerHeight;
  perspCamera.updateProjectionMatrix();
  if (cameraKind === 'ortho') syncOrthoFromPerspective();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------------------------------------
// Lighting — hemisphere fill + one directional key, same fixture as main.js, but now driven by
// the AMBIENT/KEY slider out of a fixed intensity budget (see applyAmbientKey below).
// ---------------------------------------------------------------------------------------------

const hemi = new THREE.HemisphereLight(0x9fd8ff, 0x1a1410, 1.1);
scene.add(hemi);

const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(2.2, 3.4, 1.6);
scene.add(key);

const rim = new THREE.DirectionalLight(0x6fb8ff, 0.5);
rim.position.set(-2, 1.2, -2);
scene.add(rim);

/** Uniform fill used ONLY by FLAT LIGHT mode, and the reason that mode exists: a HemisphereLight
 * is a gradient generator by construction — it lerps sky colour to ground colour across each
 * fragment's normal — so even at full intensity it paints a smooth top-to-bottom ramp and can
 * never read as flat. AmbientLight adds the same value to every fragment regardless of normal,
 * which is the lighting a Blender Shader-to-RGB toon setup assumes. Starts dark; applyAmbientKey
 * routes the whole fill budget to exactly ONE of hemi/ambient depending on the mode. */
const ambient = new THREE.AmbientLight(0xffffff, 0);
scene.add(ambient);

/** Fixed lighting budget captured from the two sliders' starting intensities — the AMBIENT/KEY
 * slider redistributes this total rather than scaling it, so the scene never gets darker or
 * brighter overall, only flatter (more fill) or more contrasty (more directional key). */
const LIGHT_BUDGET = hemi.intensity + key.intensity; // 3.3

/** Rim intensity as authored — FLAT LIGHT zeroes the rim and restores it from here on exit. The
 * rim is a SECOND directional terminator: it carves an independent light/shadow boundary across
 * the silhouette, which reads as dimensional no matter how few toon bands the ramp has. */
const RIM_BASE = rim.intensity;

// Defaults to the APPROVED look (2026-07-30), so this page opens showing what main.js ships
// rather than the pre-tuning fixture. Judge changes against this, not against hemi+rim.
let flatLight = true;
let ambientKeyT = 0;

/**
 * Raise fill intensity while proportionally lowering the directional key, out of the fixed
 * LIGHT_BUDGET. t=0 -> all key (max shading contrast); t=1 -> all fill (flat, shadowless).
 * Which light receives the fill depends on FLAT LIGHT mode (see `ambient` above); flat mode also
 * kills the rim, so the scene is left with exactly one directional source + uniform ambient.
 * @param {number} t - 0..1
 */
function applyAmbientKey(t) {
  const clamped = Math.max(0, Math.min(1, t));
  ambientKeyT = clamped;
  const fill = LIGHT_BUDGET * clamped;
  key.intensity = LIGHT_BUDGET * (1 - clamped);
  hemi.intensity = flatLight ? 0 : fill;
  ambient.intensity = flatLight ? fill : 0;
  rim.intensity = flatLight ? 0 : RIM_BASE;
}

/**
 * Toggle FLAT LIGHT: uniform ambient + single key (on) vs the authored hemisphere + key + rim
 * fixture (off). Re-runs applyAmbientKey so the ambient/key slider position is preserved across
 * the switch — the two controls compose instead of overriding each other.
 * @param {boolean} on
 */
function setFlatLight(on) {
  flatLight = on;
  applyAmbientKey(ambientKeyT);
}

/** Fake blob ground shadow — identical to main.js; not part of the "2D-ness" dials, just scene
 * furniture reused as-is. */
function buildGroundBlob() {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.7, 'rgba(0,0,0,0.28)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(0.7, 32), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.002;
  mesh.renderOrder = -1;
  return mesh;
}
const groundBlob = buildGroundBlob();
scene.add(groundBlob);

// ---------------------------------------------------------------------------------------------
// Toon shading: shared toon gradientMap DataTexture (band count now LIVE-tunable) + a per-mesh
// MeshToonMaterial swap + inverted-hull outline (thickness now LIVE-tunable).
// ---------------------------------------------------------------------------------------------

/** Every MeshToonMaterial we've ever created, across the stand-in, any loaded GLB, and the gear
 * prop. Kept so the BAND COUNT and TEXTURE POSTERIZE sliders can walk every live material and
 * update it in place, instead of requiring a rebuild. Stale entries (mesh since removed from the
 * scene, e.g. a replaced GLB) are harmless no-ops here — they just don't get seen again once
 * their mesh is gone. */
const allToonMaterials = [];

/** Every outline mesh we've ever created (see makeOutlineMesh). Used by the OUTLINE THICKNESS
 * slider the same way allToonMaterials is used by band/posterize: walk + update in place. */
const allOutlineMeshes = [];

/**
 * Build an N-step 1D gradient (dark -> light), sampled by N.L to produce flat toon bands.
 * NearestFilter is required — linear filtering would smear the steps back into a gradient and
 * defeat the banding entirely (same requirement as main.js's fixed 4-band version; generalized
 * here to any band count 2..5 for the BAND COUNT slider).
 * @param {number} bandCount - 2..5
 * @returns {THREE.DataTexture}
 */
function buildGradientMap(bandCount) {
  const n = Math.max(2, Math.min(5, Math.round(bandCount)));
  const low = 50; // floor brightness so the darkest band isn't pure black
  const values = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    values[i] = Math.round(low + ((255 - low) * i) / (n - 1));
  }
  const tex = new THREE.DataTexture(values, n, 1, THREE.RedFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/** The gradient map currently assigned to newly-created toon materials. `let`, not `const` —
 * applyBandCount() reassigns it, and toonify() (below) reads this binding live, so any GLB
 * dropped in after a band-count change already gets the current band count for free. */
let gradientMap = buildGradientMap(5);

/**
 * Rebuild the shared gradient map at a new band count and push it onto every existing toon
 * material (in addition to becoming the default for future ones). The old texture is disposed
 * after the swap so we don't leak a GPU texture per slider drag.
 * @param {number} bandCount - 2..5
 */
function applyBandCount(bandCount) {
  const next = buildGradientMap(bandCount);
  const prev = gradientMap;
  gradientMap = next;
  allToonMaterials.forEach((mat) => { mat.gradientMap = next; });
  prev.dispose();
}

/**
 * Build a matching "inverted hull" outline mesh for `mesh` — copied from main.js's
 * makeOutlineMesh() verbatim for the geometry/skinning handling (see that file for the full WHY:
 * BackSide black shell displaced along the raw `normal` attribute in `begin_vertex`, parented as
 * an identity-transform child so a SkinnedMesh's outline bends with the same animated pose).
 *
 * The one behavioral addition: thickness is stored in a MUTABLE uniform holder object
 * (`thicknessUniform`), not a bare number baked into the shader at compile time. THREE reads
 * `shader.uniforms.uOutlineThickness.value` fresh every frame, so mutating
 * `thicknessUniform.value` after the fact (from applyOutlineThicknessMultiplier below) changes
 * the rendered thickness immediately — no material rebuild, no recompile — even though
 * `onBeforeCompile` itself only runs once, at first compile.
 * @param {THREE.Mesh} mesh - source mesh (Mesh or SkinnedMesh) to outline
 * @returns {THREE.Mesh} the outline mesh, already parented under `mesh`
 */
/** Fraction of the shortest edge touching a vertex that the hull may travel along that vertex's
 * normal. Below 0.5 two shells growing toward each other across an edge cannot meet, so the hull
 * physically cannot self-intersect there. */
const OUTLINE_CLAMP_RATIO = 0.45;

/**
 * Per-vertex ceiling on outline displacement, from the shortest edge incident to each vertex.
 *
 * WHY: a uniform-thickness inverted hull tears on THIN FEATURES. Push every vertex of a lip
 * thinner than 2x the ink out along its own normal, and the two faces of that lip swap sides —
 * the shell turns inside out and reads as a black chip punched through the surface (seen on the
 * 50k champion's visor rim at 10mm ink, while the 1M mesh survived it). It is feature size that
 * decides this, not mesh density, and the shortest incident edge is a direct local measure of it.
 *
 * Deliberately NOT a fraction of the mesh's bounding radius — that formula is the one recorded in
 * the pipeline doc as pothole 4, where a single-mesh GLB gave fingers body-scale ink and swallowed
 * them. This is local: broad plating keeps the full artistic thickness, only fine features thin.
 *
 * O(triangles), one pass, no spatial structure. Result is cached on the geometry because outline
 * meshes SHARE geometry with their source mesh, so a redundant second pass would be pure waste.
 * @param {THREE.BufferGeometry} geometry
 * @returns {THREE.BufferAttribute} float attribute, one clamp distance per vertex
 */
function computeOutlineClamp(geometry) {
  const existing = geometry.getAttribute('aOutlineClamp');
  if (existing) return existing;

  const pos = geometry.attributes.position;
  const index = geometry.index;
  const count = pos.count;
  const clamp = new Float32Array(count).fill(Infinity);
  const triCount = index ? index.count : count;
  const at = (i) => (index ? index.getX(i) : i);

  for (let t = 0; t + 2 < triCount; t += 3) {
    const i0 = at(t);
    const i1 = at(t + 1);
    const i2 = at(t + 2);
    for (let e = 0; e < 3; e++) {
      const a = e === 0 ? i0 : e === 1 ? i1 : i2;
      const b = e === 0 ? i1 : e === 1 ? i2 : i0;
      const dx = pos.getX(a) - pos.getX(b);
      const dy = pos.getY(a) - pos.getY(b);
      const dz = pos.getZ(a) - pos.getZ(b);
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (len > 0) {
        const lim = len * OUTLINE_CLAMP_RATIO;
        if (lim < clamp[a]) clamp[a] = lim;
        if (lim < clamp[b]) clamp[b] = lim;
      }
    }
  }
  // A vertex touched by no edge (degenerate/orphan) keeps Infinity, which would render as garbage
  // through min() — give it a large finite value so it simply takes the uniform thickness.
  for (let i = 0; i < count; i++) if (!isFinite(clamp[i])) clamp[i] = 1e9;

  const attr = new THREE.BufferAttribute(clamp, 1);
  geometry.setAttribute('aOutlineClamp', attr);
  return attr;
}

function makeOutlineMesh(mesh) {
  const geometry = mesh.geometry;
  computeOutlineClamp(geometry);
  // ABSOLUTE world-space ink, not %-of-part-size: champions are normalized to 1.7m at the Blender
  // step, so 1mm is 1mm everywhere. The old radius*0.025 formula sized the hull from the WHOLE
  // mesh's bounding sphere — a single-mesh GLB gave fingers a body-scale outline that swallowed
  // them entirely (owner catch: "even 1 is too thick, i cant see his fingers"). Slider 1..6 now
  // means 1..6 millimeters.
  const baseThickness = 0.001;
  const thicknessUniform = { value: baseThickness * outlineThicknessMultiplier };

  const outlineMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide });
  outlineMat.onBeforeCompile = (shader) => {
    shader.uniforms.uOutlineThickness = thicknessUniform;
    shader.vertexShader =
      'uniform float uOutlineThickness;\nattribute float aOutlineClamp;\n' + shader.vertexShader;
    // See main.js makeOutlineMesh() for why this displaces along the raw `normal` attribute
    // rather than the `objectNormal` local (MeshBasicMaterial only declares `objectNormal` under
    // USE_ENVMAP/USE_SKINNING; `normal` is always declared).
    //
    // min() against the per-vertex clamp is what stops thick ink tearing through thin features
    // (see computeOutlineClamp). Broad surfaces have long edges and a clamp far above the
    // uniform, so they are unaffected and the approved 10mm look is preserved exactly.
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n\ttransformed += normalize( normal ) * min( uOutlineThickness, aOutlineClamp );'
    );
  };

  let outlineMesh;
  if (mesh.isSkinnedMesh) {
    outlineMesh = new THREE.SkinnedMesh(geometry, outlineMat);
    outlineMesh.bind(mesh.skeleton, mesh.bindMatrix);
  } else {
    outlineMesh = new THREE.Mesh(geometry, outlineMat);
  }
  outlineMesh.name = (mesh.name || 'mesh') + '__outline';
  outlineMesh.renderOrder = (mesh.renderOrder || 0) - 1;
  outlineMesh.matrixAutoUpdate = false;
  outlineMesh.userData.baseThickness = baseThickness;
  outlineMesh.userData.thicknessUniform = thicknessUniform;
  mesh.add(outlineMesh);
  allOutlineMeshes.push(outlineMesh);
  return outlineMesh;
}

/**
 * Current OUTLINE THICKNESS multiplier (slider range 1..6, applied to each mesh's own
 * radius-derived base thickness — see makeOutlineMesh). Read live by makeOutlineMesh() at
 * creation time, so a GLB dropped in after the slider moves is outlined at the current setting
 * immediately, no separate re-apply step needed (unlike posterize, which has to repaint existing
 * textures — see applyPosterizeLevel).
 */
let outlineThicknessMultiplier = 30;

/**
 * Push a new OUTLINE THICKNESS multiplier onto every outline mesh created so far. Stale meshes
 * (detached from the scene by a GLB swap) are pruned from the registry first — cheap, and keeps
 * the array from growing unbounded across repeated GLB drops in one session.
 * @param {number} multiplier - 1..6
 */
function applyOutlineThicknessMultiplier(multiplier) {
  outlineThicknessMultiplier = multiplier;
  for (let i = allOutlineMeshes.length - 1; i >= 0; i--) {
    const m = allOutlineMeshes[i];
    if (!m.parent) { allOutlineMeshes.splice(i, 1); continue; } // pruned: source mesh left the scene
    m.userData.thicknessUniform.value = m.userData.baseThickness * multiplier;
  }
}

/**
 * Traverse `root`, replace every Mesh/SkinnedMesh material with a THREE.MeshToonMaterial that
 * keeps the original `.map` texture and `.color`, and attach an inverted-hull outline sibling to
 * each — copied from main.js's toonify() (see that file for the two-pass-not-one-pass rationale:
 * combining collection + mutation in a single `traverse` callback recurses onto the outline mesh
 * it just added as a child and blows the stack).
 *
 * Addition over main.js: each created toon material is (a) registered in `allToonMaterials` so
 * the BAND COUNT / TEXTURE POSTERIZE sliders can reach it later, and (b) remembers its original,
 * un-posterized map in `userData.baseMap` so "posterize: off" can restore it exactly.
 * @param {THREE.Object3D} root
 * @returns {THREE.Mesh[]} the outline meshes created (for outline-visibility toggling)
 */
function toonify(root) {
  const meshes = [];
  root.traverse((obj) => { if (obj.isMesh) meshes.push(obj); });

  const outlines = [];
  meshes.forEach((obj) => {
    const wasArray = Array.isArray(obj.material);
    const sourceMats = wasArray ? obj.material : [obj.material];
    const toonMats = sourceMats.map((src) => {
      const srcMap = (src && src.map) || null;
      const toon = new THREE.MeshToonMaterial({
        color: src && src.color ? src.color.clone() : new THREE.Color(0xffffff),
        map: srcMap,
        gradientMap,
      });
      if (src && src.transparent) { toon.transparent = true; toon.opacity = src.opacity; }
      if (src && src.alphaTest) toon.alphaTest = src.alphaTest;
      if (src && src.side !== undefined) toon.side = src.side;
      toon.userData.baseMap = srcMap; // original, un-posterized texture (or null)
      allToonMaterials.push(toon);
      return toon;
    });
    obj.material = wasArray ? toonMats : toonMats[0];
    outlines.push(makeOutlineMesh(obj));
  });
  return outlines;
}

// ---------------------------------------------------------------------------------------------
// TEXTURE POSTERIZE — the key "2D-ness" dial. AI-baked textures carry smooth gradient shading
// that defeats toon banding no matter how few bands you use; this quantizes the texture ITSELF.
// ---------------------------------------------------------------------------------------------

/** Slider position (0..4) -> levels-per-channel. 0 = "off" (handled separately, restores the
 * original texture rather than building a 1-level posterize, which would just be flat gray). */
const POSTERIZE_LEVELS = { 1: 8, 2: 6, 3: 4, 4: 3 };

/** Cache of posterized CanvasTextures, keyed by `${sourceTexture.uuid}:${level}` — "cache per
 * (texture, level)" per spec, so re-selecting a level already visited this session is instant and
 * we never posterize the same source pixels twice. */
const posterizeCache = new Map();

/**
 * Quantize `value` (0..255) to `levels` evenly-spaced steps spanning the full 0..255 range.
 * @param {number} value
 * @param {number} levels
 * @returns {number}
 */
function quantizeChannel(value, levels) {
  const step = 255 / (levels - 1);
  return Math.round(Math.round(value / step) * step);
}

/**
 * Build (or fetch from cache) a posterized copy of `sourceTexture` at `level` (1..4, see
 * POSTERIZE_LEVELS). Draws the source image to an offscreen canvas, quantizes RGB in place
 * (alpha untouched — posterizing alpha would eat cutout edges), and wraps the result in a
 * THREE.CanvasTexture that copies colorSpace/flipY/wrap/filter from the original so it drops in
 * as a straight `.map` replacement with no color-space or UV surprises.
 * @param {THREE.Texture} sourceTexture
 * @param {number} level - 1..4, indexes POSTERIZE_LEVELS
 * @returns {THREE.CanvasTexture}
 */
function getPosterizedTexture(sourceTexture, level) {
  const key = sourceTexture.uuid + ':' + level;
  const cached = posterizeCache.get(key);
  if (cached) return cached;

  const levels = POSTERIZE_LEVELS[level];
  const img = sourceTexture.image;
  const w = img.width || img.naturalWidth;
  const h = img.height || img.naturalHeight;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);

  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = quantizeChannel(data[i], levels);
    data[i + 1] = quantizeChannel(data[i + 1], levels);
    data[i + 2] = quantizeChannel(data[i + 2], levels);
    // data[i + 3] (alpha) left untouched — see doc comment above.
  }
  ctx.putImageData(imageData, 0, 0);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = sourceTexture.colorSpace;
  tex.flipY = sourceTexture.flipY;
  tex.wrapS = sourceTexture.wrapS;
  tex.wrapT = sourceTexture.wrapT;
  tex.magFilter = sourceTexture.magFilter;
  tex.minFilter = sourceTexture.minFilter;
  tex.needsUpdate = true;

  posterizeCache.set(key, tex);
  return tex;
}

/** Current POSTERIZE slider level: 0 = off, 1..4 = POSTERIZE_LEVELS index. */
let currentPosterizeLevel = 0;
/** FLAT ALBEDO state — declared beside currentPosterizeLevel because the two compose: whichever
 * is toggled second has to reconstruct the other's contribution to `.map` (see applyFlatAlbedo). */
let flatAlbedo = false;

/**
 * Apply `level` to every registered toon material's `.map`. Materials with no texture
 * (`userData.baseMap` is null — true of every stand-in-robot material, which are flat
 * MeshStandardMaterial colors with no baked texture at all) are skipped: there is nothing to
 * posterize on them, by design — see the module header on why textures are the dial that matters.
 * Re-run this after any GLB load (its fresh toon materials start at their raw, un-posterized map).
 * @param {number} level - 0..4
 */
function applyPosterizeLevel(level) {
  currentPosterizeLevel = level;
  if (flatAlbedo) return; // texture is detached; remembered so it restores at this level later
  allToonMaterials.forEach((mat) => {
    if (!mat.userData.baseMap) return;
    mat.map = level === 0 ? mat.userData.baseMap : getPosterizedTexture(mat.userData.baseMap, level);
  });
}

/**
 * Toggle FLAT ALBEDO: detach every material's `.map` so only its flat `.color` feeds the toon
 * ramp. This is the test posterize CANNOT perform. AI textures carry baked 3D-ness — painted
 * gradients, AO, specular hotspots (pipeline doc pothole 5) — and quantizing a painted gradient
 * yields a STEPPED gradient that still describes a round, lit form. Removing the map outright is
 * the only way to see the geometry shaded purely by the cel ramp, i.e. what a Blender toon setup
 * with a flat base colour would give.
 *
 * `needsUpdate` is mandatory here: adding or removing `.map` flips the USE_MAP shader define, so
 * the program must be recompiled — without it the material keeps sampling a texture that is gone.
 * @param {boolean} on
 */
function applyFlatAlbedo(on) {
  flatAlbedo = on;
  allToonMaterials.forEach((mat) => {
    if (!mat.userData.baseMap) return; // stand-in materials are already flat colours
    if (on) {
      mat.map = null;
    } else {
      mat.map = currentPosterizeLevel === 0
        ? mat.userData.baseMap
        : getPosterizedTexture(mat.userData.baseMap, currentPosterizeLevel);
    }
    mat.needsUpdate = true;
  });
}

// ---------------------------------------------------------------------------------------------
// Programmatic stand-in robot — identical to main.js's buildStandInRobot()/animateStandIn().
// ---------------------------------------------------------------------------------------------

/**
 * Build the stand-in robot: an Object3D hierarchy with named joint nodes (Hips, Spine, Head,
 * LeftArm, RightArm, LeftLeg, RightLeg) matching the bone-name vocabulary the real Mixamo rig
 * will use. Copied from main.js verbatim.
 * @returns {{ root: THREE.Group, nodes: Record<string, THREE.Object3D>, baseHipY: number }}
 */
function buildStandInRobot() {
  const nodes = {};
  const root = new THREE.Group();
  root.name = 'StandInRobot';

  const bodyColor = 0x5ac8fa;
  const jointColor = 0x2f80ed;
  const standardMat = (hex) => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.55, metalness: 0.1 });

  const HIP_Y = 0.58;
  const LEG_LEN = 0.5;
  const ARM_LEN = 0.4;

  const hips = new THREE.Object3D();
  hips.name = 'Hips';
  hips.position.set(0, HIP_Y, 0);
  root.add(hips);
  nodes.Hips = hips;

  const pelvisMesh = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.2), standardMat(bodyColor));
  hips.add(pelvisMesh);

  const spine = new THREE.Object3D();
  spine.name = 'Spine';
  spine.position.set(0, 0.1, 0);
  hips.add(spine);
  nodes.Spine = spine;

  const torsoMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.28, 4, 8), standardMat(bodyColor));
  torsoMesh.position.set(0, 0.22, 0);
  spine.add(torsoMesh);
  nodes.torsoMesh = torsoMesh;

  const head = new THREE.Object3D();
  head.name = 'Head';
  head.position.set(0, 0.48, 0);
  spine.add(head);
  nodes.Head = head;

  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.14, 20, 14), standardMat(jointColor));
  head.add(headMesh);
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.05, 0.03),
    new THREE.MeshStandardMaterial({ color: 0x0d1720, roughness: 0.2, metalness: 0.4 })
  );
  visor.position.set(0, 0.01, 0.12);
  head.add(visor);

  function buildLimb(name, side, shoulderY) {
    const pivot = new THREE.Object3D();
    pivot.name = name;
    pivot.position.set(side * 0.24, shoulderY, 0);
    spine.add(pivot);
    nodes[name] = pivot;
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, ARM_LEN - 0.11, 4, 8), standardMat(bodyColor));
    mesh.position.set(0, -ARM_LEN / 2, 0);
    pivot.add(mesh);
    return pivot;
  }
  buildLimb('LeftArm', 1, 0.38);
  buildLimb('RightArm', -1, 0.38);

  function buildLeg(name, side) {
    const pivot = new THREE.Object3D();
    pivot.name = name;
    pivot.position.set(side * 0.1, -0.08, 0);
    hips.add(pivot);
    nodes[name] = pivot;
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, LEG_LEN - 0.15, 4, 8), standardMat(jointColor));
    mesh.position.set(0, -LEG_LEN / 2, 0);
    pivot.add(mesh);
    return pivot;
  }
  buildLeg('LeftLeg', 1);
  buildLeg('RightLeg', -1);

  return { root, nodes, baseHipY: HIP_Y };
}

/**
 * Advance the stand-in's procedural animation by one frame. Copied from main.js verbatim.
 * @param {Record<string, THREE.Object3D>} nodes
 * @param {number} baseHipY
 * @param {'idle'|'walk'} mode
 * @param {number} elapsed - seconds, accumulated from RAF timestamps
 */
function animateStandIn(nodes, baseHipY, mode, elapsed) {
  if (mode === 'walk') {
    const stride = elapsed * 6.0;
    const swing = Math.sin(stride);
    nodes.LeftLeg.rotation.x = swing * 0.55;
    nodes.RightLeg.rotation.x = -swing * 0.55;
    nodes.LeftArm.rotation.x = -swing * 0.45;
    nodes.RightArm.rotation.x = swing * 0.45;
    nodes.LeftArm.rotation.z = 0;
    nodes.RightArm.rotation.z = 0;
    nodes.Hips.position.y = baseHipY + Math.abs(Math.sin(stride)) * 0.035;
    nodes.Spine.rotation.z = Math.sin(stride) * 0.035;
    nodes.Spine.rotation.y = Math.sin(stride) * 0.05;
    nodes.Head.rotation.y = Math.sin(stride * 0.5) * 0.08;
    nodes.torsoMesh.scale.set(1, 1, 1);
  } else {
    const breathe = Math.sin(elapsed * 1.6);
    nodes.torsoMesh.scale.set(1, 1 + breathe * 0.025, 1);
    nodes.Hips.position.y = baseHipY + breathe * 0.008;
    nodes.LeftArm.rotation.x = 0;
    nodes.RightArm.rotation.x = 0;
    nodes.LeftArm.rotation.z = 0.06 + Math.sin(elapsed * 1.1) * 0.03;
    nodes.RightArm.rotation.z = -0.06 - Math.sin(elapsed * 1.1) * 0.03;
    nodes.LeftLeg.rotation.x = 0;
    nodes.RightLeg.rotation.x = 0;
    nodes.Spine.rotation.z = 0;
    nodes.Spine.rotation.y = Math.sin(elapsed * 0.35) * 0.04;
    nodes.Head.rotation.y = Math.sin(elapsed * 0.5) * 0.06;
  }
}

const standIn = buildStandInRobot();
scene.add(standIn.root);
let standInOutlines = toonify(standIn.root);

// ---------------------------------------------------------------------------------------------
// Gear socket prop — identical to main.js.
// ---------------------------------------------------------------------------------------------

function buildGearProp() {
  const group = new THREE.Group();
  group.name = 'GearProp';
  const housing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.065, 0.045, 16),
    new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.4, metalness: 0.5 })
  );
  housing.rotation.x = Math.PI / 2;
  group.add(housing);
  const lens = new THREE.Mesh(
    new THREE.CircleGeometry(0.04, 20),
    new THREE.MeshStandardMaterial({ color: 0x35e0ff, emissive: 0x0ea5c9, emissiveIntensity: 1.1, roughness: 0.2 })
  );
  lens.position.z = 0.024;
  group.add(lens);
  return group;
}
const gearProp = buildGearProp();
toonify(gearProp);
let gearSocketed = false;

function findGearTarget() {
  if (activeIsStandIn) return standIn.nodes.Head || null;
  if (!currentModel) return null;
  let head = null;
  let torso = null;
  currentModel.traverse((o) => {
    if (!o.isBone) return;
    if (!head && /head/i.test(o.name)) head = o;
    if (!torso && /spine|chest/i.test(o.name)) torso = o;
  });
  return head || torso || null;
}

function socketGear() {
  const target = findGearTarget();
  if (!target) {
    showHudMessage('No head/spine node found to socket gear on.');
    return;
  }
  if (gearProp.parent) gearProp.parent.remove(gearProp);
  const worldScale = new THREE.Vector3();
  target.getWorldScale(worldScale);
  const avgScale = (worldScale.x + worldScale.y + worldScale.z) / 3 || 1;
  const correction = 1 / avgScale;
  gearProp.scale.setScalar(correction);
  gearProp.position.set(0, 0.14 * correction, 0.11 * correction);
  gearProp.rotation.set(0, 0, 0);
  target.add(gearProp);
  gearSocketed = true;
  showHudMessage('');
}

function unsocketGear() {
  if (gearProp.parent) gearProp.parent.remove(gearProp);
  gearSocketed = false;
}

// ---------------------------------------------------------------------------------------------
// GEAR FIT KIT — owner-requested home for the fit tooling (moved here from the main viewer's
// spike): load a real gear GLB, seat it (crown-anchor rule for raw props, as-authored for
// pre-fitted ones), adjust with a TransformControls gizmo (Blender keys: G move / R rotate /
// S scale), and bake the result to a downloadable pre-fitted GLB — the in-browser equivalent of
// blender/bake-manual-fit.py. See main.js for the sibling implementation + the recentre-erases-
// baked-fit war story this code inherits its guards from.
// ---------------------------------------------------------------------------------------------

/** Owner's crown-anchor rule: the model's topmost point over its horizontal midpoint — "z is a
 * function of (x,y), sampled at mid-xy" (three.js frame: y up). Set on model load. */
let modelCrown = null;
let modelHeight = 0;
/** The champion's LOWEST point (feet/ground contact), captured in autoFrameCamera. The floor
 * anchor for leg gear (socketFitProp) plants the piece's bottom here — a leg piece that floats
 * above the floor reads "too high" (rover-leg war story, 2026-08-27). */
let modelFloorY = 0;

const FIT_SOCKET_PATTERNS = {
  head: /head/i,
  chest: /spine2|spine1|chest|spine/i,
  shoulderL: /leftshoulder|leftarm/i,
  shoulderR: /rightshoulder|rightarm/i,
  handR: /righthand/i,
  hips: /hips/i,
  legL: /leftupleg|leftleg/i,
  legR: /rightupleg|rightleg/i,
};

/** Art-plan slots (parts/rarity spec §3: anatomy 9 + planner rig + tool hand) -> runtime bone
 * socket. The UI speaks SLOTS so fitters see the plan's taxonomy; championFit keeps storing the
 * BONE key so every existing viewer attaches the export unchanged. Four head slots share one
 * bone — the gizmo placement (crown vs browline vs temples) is what distinguishes them. Aura
 * (L12/L15/L17) is deliberately absent: it is colour/field/sigil channels, not geometry. */
const SLOT_TO_SOCKET = {
  crown: 'head', eye: 'head', visor: 'head', temples: 'head',
  chest: 'chest', shoulderL: 'shoulderL', shoulderR: 'shoulderR',
  hips: 'hips', legL: 'legL', legR: 'legR',
  backRig: 'chest', backRig2: 'chest', backRig3: 'chest', backRig4: 'chest', backRig5: 'chest',
  handR: 'handR',
};
const HEAD_SLOTS = { crown: 1, eye: 1, visor: 1, temples: 1 };

/** Auto-fit target size per SLOT: the piece's bounding-sphere diameter as a fraction of the
 * CHAMPION's height (modelHeight). The old code scaled non-head pieces by a flat 0.35 WORLD
 * units — a small prop got blown up, a big one shrank to a dot — so every slot now sizes
 * relative to the champion, exactly like the head rule already did. */
const SLOT_BASE_SCALE = {
  crown: 0.5, eye: 0.26, visor: 0.3, temples: 0.2,
  chest: 0.34, shoulderL: 0.32, shoulderR: 0.32,
  hips: 0.36, legL: 0.45, legR: 0.45,
  backRig: 0.5, backRig2: 0.5, backRig3: 0.5, backRig4: 0.5, backRig5: 0.5,
  handR: 0.28,
};

/** Auto-fit seat offsets per SLOT, in WORLD axes, in champion units (the champion faces +Z, so
 * "in front" is +z and "behind" is -z; L/R sides mirror on x). They are converted into the
 * socket bone's local frame with worldToLocal, so they stay correct even on rotated bones
 * (shoulders/legs point along their own axes). Offsets are starting points — the gizmo is the
 * taste pass, and Download bakes whatever the fitter settles on. */
const SOCKET_FIT_OFFSETS = {
  eye: { x: 0, y: 0.35, z: 0.24 }, // face, at eye height (the head bone is the skull base)
  visor: { x: 0, y: 0.26, z: 0.26 },
  temples: { x: 0, y: 0.24, z: 0.15 },
  chest: { x: 0, y: 0.05, z: 0.22 },
  backRig: { x: 0, y: 0.1, z: -0.32 }, // sits on the chest BONE but BEHIND the torso
  backRig2: { x: 0, y: -0.02, z: -0.30 }, // planner modules coexist — distinct back seats
  backRig3: { x: 0, y: 0.22, z: -0.34 },
  backRig4: { x: 0, y: 0.1, z: -0.42 },
  backRig5: { x: 0, y: 0.16, z: -0.26 },
  shoulderL: { x: 0.18, y: 0.12, z: 0.02 },
  shoulderR: { x: -0.18, y: 0.12, z: 0.02 },
  hips: { x: 0, y: 0.1, z: 0.16 },
  legL: { x: 0.08, y: 0.05, z: 0.08 },
  legR: { x: -0.08, y: 0.05, z: 0.08 },
  handR: { x: 0.05, y: 0, z: 0.12 },
};

// WARDROBE: the champion wears EVERY earned piece at once (that is the whole art plan), so the
// studio must too. Each loaded gear GLB becomes an entry; the ACTIVE entry is what the gizmo,
// socket select and Download act on. loadedGearProp/gearPristine stay as aliases of the active
// entry so the fit/export plumbing below is untouched.
let wardrobe = []; // [{id, name, group, pristine, slot}]
let wardrobeSeq = 0;
let activeEntry = null;
let loadedGearProp = null;
let gearPristine = null; // untoonified clone of the ACTIVE gear scene, for clean export

const gizmo = new TransformControls(camera, renderer.domElement);
let scaleDragStart = null; // gear scale at drag start — the proportional-scale baseline
gizmo.addEventListener('dragging-changed', (e) => {
  controls.enabled = !e.value;
  scaleDragStart = (e.value && gizmo.mode === 'scale' && loadedGearProp) ? loadedGearProp.scale.clone() : null;
  // One UNDO unit per drag gesture: captured at drag START (state is still pre-drag), closed at
  // drag END. A drag that moved nothing is dropped by endMutation's no-op check.
  if (e.value && loadedGearProp) beginMutation('Adjust ' + (activeEntry ? activeEntry.name : 'piece'));
  // Drag END is a wardrobe save-point: the fit just changed, so the shared store (what the
  // Animation Viewer wears) must follow. Per-frame objectChange is NOT a save-point — baking
  // every worn piece through GLTFExporter mid-drag would stutter the gizmo.
  if (!e.value) {
    endMutation();
    if (loadedGearProp) syncWardrobeStore();
  }
});
// PROPORTIONAL SCALE (2026-08-10): gear must grow/shrink without deforming — a squashed helmet
// is off the art bar. Every scale handle therefore acts uniformly BY DEFAULT: whichever axis was
// dragged, its ratio (the one furthest from 1) is applied to all three axes. Holding SHIFT while
// dragging unlocks per-axis stretch for the times deformation is DELIBERATE (e.g. widening a
// helmet a touch) — accidental squashing stays impossible, intentional shaping stays available.
let stretchUnlocked = false;
window.addEventListener('keydown', (e) => { if (e.key === 'Shift') stretchUnlocked = true; });
window.addEventListener('keyup', (e) => { if (e.key === 'Shift') stretchUnlocked = false; });
gizmo.addEventListener('objectChange', () => {
  if (gizmo.mode !== 'scale' || !loadedGearProp || !scaleDragStart) return;
  if (stretchUnlocked) { scaleDragStart.copy(loadedGearProp.scale); return; }
  const s = loadedGearProp.scale;
  const ratios = [s.x / scaleDragStart.x, s.y / scaleDragStart.y, s.z / scaleDragStart.z];
  const r = ratios.reduce((a, b) => (Math.abs(b - 1) > Math.abs(a - 1) ? b : a), 1);
  s.set(scaleDragStart.x * r, scaleDragStart.y * r, scaleDragStart.z * r);
});
scene.add(gizmo.getHelper());
gizmo.enabled = false;
gizmo.getHelper().visible = false;

function setGizmoMode(gmode) {
  if (!loadedGearProp) { showHudMessage('Load a gear GLB first — the fit tools move that.'); return; }
  if (gmode) {
    gizmo.setMode(gmode);
    gizmo.attach(loadedGearProp);
    gizmo.enabled = true;
    gizmo.getHelper().visible = true;
  } else {
    gizmo.detach();
    gizmo.enabled = false;
    gizmo.getHelper().visible = false;
  }
  ['fitMove', 'fitRotate', 'fitScale'].forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) btn.classList.toggle('hud__btn--active', gmode === btn.dataset.fitMode);
  });
}

function findFitSocketTarget(boneKey) {
  const pattern = FIT_SOCKET_PATTERNS[boneKey];
  let match = null;
  if (activeIsStandIn) {
    Object.keys(standIn.nodes).forEach((name) => {
      if (name === 'torsoMesh') return;
      if (!match && pattern && pattern.test(name)) match = standIn.nodes[name];
    });
  } else if (currentModel) {
    // An EXACT bone-name match wins — a baked piece may name a bone (e.g. "Head") that the
    // pattern table only approximates; the regex is the fallback for synonyms.
    let exact = null;
    currentModel.traverse((o) => {
      if (!o.isBone) return;
      if (!exact && o.name.toLowerCase() === String(boneKey).toLowerCase()) exact = o;
      if (!match && pattern && pattern.test(o.name)) match = o;
    });
    match = exact || match;
  }
  return match;
}

/** Pre-fitted gear: baked coords are relative to the socket bone at (0,0,0) — place at the
 * bone's world position, then attach() (world-preserving reparent) so it rides the animation. */
function attachPrefittedGear(group, fitKey) {
  const target = findFitSocketTarget(fitKey);
  if (!target) {
    showHudMessage('No "' + fitKey + '" bone found on the current model — gear not attached.');
    return false;
  }
  if (group.parent) group.parent.remove(group);
  group.position.set(0, 0, 0);
  group.rotation.set(0, 0, 0);
  group.scale.setScalar(1);
  target.getWorldPosition(group.position);
  scene.add(group);
  target.attach(group);
  showHudMessage('');
  return true;
}

/** Visible-mesh bounding box of an object, in WORLD space. Unlike Box3.setFromObject this
 * (a) refreshes world matrices first — a freshly parsed GLB has stale matrixWorld and measures
 *     ~10x wrong, and (b) skips invisible meshes — Blender exports often carry hidden helpers
 *     that inflate the box and would shrink auto-fit sizing. Outlines hug their mesh (1mm), so
 *     including them is harmless.
 * @param {THREE.Object3D} object
 * @param {THREE.Box3} [out]
 * @returns {THREE.Box3}
 */
function visibleBox(object, out) {
  const box = out || new THREE.Box3();
  box.makeEmpty();
  object.updateWorldMatrix(true, true);
  object.traverse((o) => {
    if (!o.isMesh || o.visible === false || !o.geometry) return;
    o.geometry.computeBoundingBox();
    box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));
  });
  return box;
}

/** True when a piece is a bilateral PAIR authored around the body midline (e.g. "rover-leg"
 * contains BOTH legs, "mood-sense" both ears). Such a piece must NOT be recentred onto one
 * socket — the pair layout IS the design; the auto-fit seats the pair's CENTER at the body
 * midline instead (see socketFitProp). Detection: every mesh center has an x-mirrored partner
 * AND the x spread clearly dominates the other axes.
 * @param {THREE.Object3D} object
 * @param {THREE.Box3} box - the visible box (computed by visibleBox)
 * @returns {boolean}
 */
function isBilateralPair(object, box) {
  const centers = [];
  object.traverse((o) => {
    if (!o.isMesh || o.visible === false || !o.geometry) return;
    o.geometry.computeBoundingBox();
    centers.push(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld).getCenter(new THREE.Vector3()));
  });
  if (centers.length < 2) return false;
  const diag = box.getSize(new THREE.Vector3()).length() || 1e-6;
  const tol = diag * 0.15;
  const mirrored = centers.every((c) => centers.some((c2) =>
    Math.abs(c2.x + c.x) < tol && Math.abs(c2.y - c.y) < tol && Math.abs(c2.z - c.z) < tol));
  if (!mirrored) return false;
  const xs = centers.map((c) => c.x);
  const ys = centers.map((c) => c.y);
  const zs = centers.map((c) => c.z);
  const xSpread = Math.max(...xs) - Math.min(...xs);
  const otherSpread = Math.max(Math.max(...ys) - Math.min(...ys), Math.max(...zs) - Math.min(...zs));
  return xSpread > otherSpread * 1.2;
}

/** Raw gear: parent under the bone with a 1/boneWorldScale correction, then seat the piece so
 * its VISIBLE bbox center hits the anchor point (converted into the bone's local frame via
 * worldToLocal, so rotated bones place it correctly). Anchors: crown pieces at the crown;
 * bilateral PAIRS at the body midline (x=0) at the socket's height/depth so both halves land on
 * the right body sides; everything else at the bone + its per-slot WORLD offset (SOCKET_FIT_
 * OFFSETS — front for chest/hand/face, on top for shoulders/hips/legs, BEHIND the torso for
 * the back rig). The gizmo is the taste pass.
 * @param {string} boneKey - the socket BONE (e.g. 'chest' for backRig)
 * @param {string} slotKey - the art-plan SLOT (crown/eye/…/backRig) — drives which offset applies
 */
function socketFitProp(prop, boneKey, slotKey) {
  const target = findFitSocketTarget(boneKey);
  if (!target) {
    showHudMessage('No "' + boneKey + '" bone found on the current model — gear not attached.');
    return false;
  }
  if (prop.parent) prop.parent.remove(prop);
  const worldScale = new THREE.Vector3();
  target.getWorldScale(worldScale);
  const avgScale = (worldScale.x + worldScale.y + worldScale.z) / 3 || 1;
  const correction = 1 / avgScale;
  prop.scale.setScalar((prop.userData.baseScale || 1) * correction);
  prop.rotation.set(0, 0, 0);
  target.add(prop);
  prop.updateWorldMatrix(true, true);

  const bonePos = target.getWorldPosition(new THREE.Vector3());
  const slot = slotKey || boneKey;
  const off = SOCKET_FIT_OFFSETS[slot] || SOCKET_FIT_OFFSETS[boneKey] || { x: 0, y: 0.05, z: 0.15 };
  const paired = !!prop.userData.paired;
  let anchor = null;
  if (slot === 'crown' && modelCrown && !activeIsStandIn) {
    anchor = modelCrown.clone();
  } else if (paired) {
    // Midline anchor: same height/depth as the socket, but on the body's x=0 plane — a pair
    // (both legs, both ears) must straddle the body, not sit on one side of it.
    anchor = new THREE.Vector3(0, bonePos.y + off.y, bonePos.z + off.z);
  } else {
    anchor = new THREE.Vector3(bonePos.x + off.x, bonePos.y + off.y, bonePos.z + off.z);
  }
  // LEG-SLOT SEAT RULE (2026-08-27, third iteration — the rover-leg war story):
  //   1. UNDO THE MIXAMO LEG-BONE FLIP. The champion's up-leg bones rest at ~180deg about Z
  //      (boneQuat ≈ [0,0,1,0]), so identity-rotated gear renders UPSIDE-DOWN: the rover-leg
  //      blade's narrow foot pointed UP at the thigh while its wide calf block squatted at the
  //      shin, floating. A 180deg spin about the bone's local Z (the piece is a direct child)
  //      cancels the flip: foot down, calf up, halves on the correct sides.
  //   2. PLANT THE PIECE ON THE FLOOR: anchor the box's BOTTOM at the champion's lowest point.
  //      Every earlier anchor (hip-centre, hip-top, knee-centre) left the blade hovering above
  //      the ground — "too high" three times. Leg gear stands on the floor.
  if (slot === 'legL' || slot === 'legR') {
    if (!activeIsStandIn) prop.rotation.set(0, 0, Math.PI);
    anchor.y = (modelFloorY || 0.02) + visibleBox(prop).getSize(new THREE.Vector3()).y / 2;
  }

  // Seat the VISIBLE bbox center on the anchor: compact pieces were recentred at parse (origin
  // == center, so this is the same as before); pairs keep their authored layout, so the whole
  // group shifts by the delta. Either way the anchor lands exactly, in any bone orientation.
  const center = visibleBox(prop).getCenter(new THREE.Vector3());
  const delta = anchor.clone().sub(center);
  const origin = prop.getWorldPosition(new THREE.Vector3());
  prop.position.copy(target.worldToLocal(origin.add(delta)));
  prop.updateWorldMatrix(true, true);
  showHudMessage('');
  return true;
}

function renderWardrobe() {
  const list = document.getElementById('wardrobeList');
  if (!list) return;
  const rm = document.getElementById('btnGear');
  if (rm) rm.hidden = !wardrobe.length; // no dead "Remove" button on an empty wardrobe
  // Auto-fit needs gear ON the champion (2026-08-25, owner rule): it seats gear, so a bare
  // champion has nothing to seat — the button stays disabled until the first piece is worn.
  const af = document.getElementById('autoFitBtn');
  if (af) {
    const empty = !wardrobe.length;
    af.disabled = empty;
    af.setAttribute('aria-disabled', String(empty));
    af.title = empty
      ? 'No gear on the champion yet — use Try on or Load gear first, then Auto-fit it.'
      : 'Auto-fit the gear on the champion — one piece fits right away, several ask which one.';
  }
  list.replaceChildren();
  if (!wardrobe.length) {
    const p = document.createElement('p');
    p.className = 'wardrobe__empty';
    p.textContent = 'Nothing worn yet — load a gear GLB.';
    list.appendChild(p);
    return;
  }
  wardrobe.forEach((entry) => {
    const row = document.createElement('div');
    row.className = 'wardrobe__row' + (entry === activeEntry ? ' wardrobe__row--active' : '');
    const pick = document.createElement('button');
    pick.type = 'button';
    pick.className = 'wardrobe__pick';
    pick.textContent = entry.name + '  ·  ' + entry.slot;
    pick.addEventListener('click', () => setActiveEntry(entry));
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'wardrobe__remove';
    x.setAttribute('aria-label', 'Remove ' + entry.name);
    x.textContent = 'x';
    x.addEventListener('click', () => removeEntry(entry, true));
    row.appendChild(pick);
    row.appendChild(x);
    list.appendChild(row);
  });
}

function setActiveEntry(entry) {
  activeEntry = entry;
  loadedGearProp = entry ? entry.group : null;
  gearPristine = entry ? entry.pristine : null;
  gizmo.detach();
  gizmo.enabled = false;
  gizmo.getHelper().visible = false;
  ['fitMove', 'fitRotate', 'fitScale'].forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) btn.classList.remove('hud__btn--active');
  });
  document.getElementById('fitSection').hidden = !entry;
  // The slot picker must SHOW the active piece's real socket (2026-08-26). It used to keep a
  // stale default ("Eye / browline") for a crown-baked helmet — and even accepted a different
  // choice the change handler then refused. Pre-fitted gear is locked to its baked slot, so the
  // select is disabled and shows it; raw props get the picker back.
  syncGearSlotSelect(entry);
  renderWardrobe();
}

/** Bone-level socket keys (old bakes carry only the championFit bone, no championSlot extra)
 *  map to the closest art-plan slot option. Only "head" is ambiguous — crown is its canonical
 *  slot, and the picker's head options are all on the same bone anyway. */
const BONE_TO_SLOT_OPTION = {
  head: 'crown', chest: 'chest', shoulderL: 'shoulderL', shoulderR: 'shoulderR',
  hips: 'hips', legL: 'legL', legR: 'legR', backRig: 'backRig', handR: 'handR',
};

/** Point #gearBone at the active entry's real slot. Baked pieces cannot be re-seated, so their
 *  select is disabled (the change handler would refuse anyway — say so BEFORE the user tries). */
function syncGearSlotSelect(entry) {
  const select = gearBoneSelect;
  if (!entry) { select.disabled = false; return; }
  const baked = !!entry.group.userData.championFit;
  select.disabled = baked;
  const hasOption = entry.slotKey && Array.from(select.options).some((o) => o.value === entry.slotKey);
  select.value = hasOption ? entry.slotKey : (BONE_TO_SLOT_OPTION[entry.socketKey] || 'crown');
}

function removeEntry(entry, undo) {
  // An explicit user remove is ONE undo step; callers that are already inside a bigger mutation
  // (adoptGearScene's slot eviction, a slot move) pass no flag and stay inside the outer unit.
  if (undo) beginMutation('Remove ' + (entry.name || 'piece'));
  const i = wardrobe.indexOf(entry);
  if (i === -1) return;
  wardrobe.splice(i, 1);
  if (entry.group.parent) entry.group.parent.remove(entry.group);
  if (entry === activeEntry) setActiveEntry(wardrobe[wardrobe.length - 1] || null);
  else renderWardrobe();
  showHudMessage(entry.name + ' removed.');
  syncWardrobeStore(); // save-point: an EXPLICIT remove is the one way a piece leaves the shared wardrobe
  if (undo) endMutation();
}

// ---------------------------------------------------------------------------------------------
// UNDO / REDO (2026-08-25) — the studio's safety net. Fitting used to be destructive with no
// "oops" path: a stray gizmo drag, a slot move that evicted a rival, an accidental remove — all
// permanent. Now every wardrobe mutation (load, remove, slot move, gizmo drag, auto-fit, restore)
// is ONE undo step that restores the full previous wardrobe: which pieces were worn, each piece's
// slot labels, and each piece's local transform under its socket bone. The studio is rest-pose
// only (fits are authored against the T-pose), so bones never move and a stored local TRS restores
// the exact placement. Snapshots hold LIVE entry references — the undo stack is a session-scoped
// record of the wardrobe's membership + transforms, not a copy of the geometry.
// ---------------------------------------------------------------------------------------------

const MAX_UNDO = 50;
let undoStack = [];   // [{label, state}] — state = the wardrobe BEFORE the mutation (top = newest)
let redoStack = [];   // [{label, state}] — mirror entries, see undo()/redo()
let pendingMutation = null; // {label, before} — an in-flight mutation awaiting endMutation()

/** Serializable-enough snapshot of ONE worn piece: identity, slot claims, local TRS under the
 * socket bone, and whether it is a pre-fitted (baked) piece. */
function captureEntryState(entry) {
  const g = entry.group;
  return {
    entry,
    st: {
      slot: entry.slot,
      slotKey: entry.slotKey,
      socketKey: entry.socketKey,
      championFit: entry.group.userData.championFit || null,
      pos: g.position.clone(),
      quat: g.quaternion.clone(),
      scale: g.scale.clone(),
    },
  };
}

/** Snapshot of the WHOLE wardrobe: every worn entry + the current selection (restored by id). */
function captureWardrobeState() {
  return { entries: wardrobe.map(captureEntryState), activeId: activeEntry ? activeEntry.id : null };
}

/** True when two snapshots describe the same wardrobe — used to drop no-op undo entries (a gizmo
 * drag that moved nothing, a slot pick that was already current). */
function wardrobeStateEquals(a, b) {
  if (a.activeId !== b.activeId || a.entries.length !== b.entries.length) return false;
  for (let i = 0; i < a.entries.length; i++) {
    const x = a.entries[i], y = b.entries[i];
    if (x.entry !== y.entry) return false;
    const s = x.st, t = y.st;
    if (s.slot !== t.slot || s.slotKey !== t.slotKey || s.socketKey !== t.socketKey) return false;
    if (!s.pos.equals(t.pos) || !s.quat.equals(t.quat) || !s.scale.equals(t.scale)) return false;
  }
  return true;
}

/** Open an undo unit: capture the state BEFORE the mutation. Multiple mutation points call this
 * (load, remove, slot change, drag start, auto-fit, restore); each must end with endMutation(). */
function beginMutation(label) {
  if (pendingMutation) endMutation(); // safety: never leave an unclosed unit
  pendingMutation = { label, before: captureWardrobeState() };
}

/** Close the undo unit opened by beginMutation. Captures the AFTER state; a no-op mutation (state
 * unchanged) is dropped so the stacks stay free of dead entries. */
function endMutation(keep) {
  if (!pendingMutation) return;
  const after = captureWardrobeState();
  if (keep !== false && !wardrobeStateEquals(pendingMutation.before, after)) {
    undoStack.push({ label: pendingMutation.label, state: pendingMutation.before });
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack.length = 0; // a new mutation invalidates every redo path
  }
  pendingMutation = null;
  updateUndoButtons();
}

/** Re-parent ONE entry onto its stored socket bone with its stored local TRS. No socketFitProp /
 * attachPrefittedGear here — both RESET the transform, and restoring must set it exactly. */
function restoreEntryTransform(entry, st) {
  const target = findFitSocketTarget(st.socketKey);
  if (!target) return false;
  const g = entry.group;
  if (g.parent) g.parent.remove(g);
  g.position.copy(st.pos);
  g.quaternion.copy(st.quat);
  g.scale.copy(st.scale);
  target.add(g);
  g.updateWorldMatrix(true, true);
  return true;
}

/** Tear down the current wardrobe and rebuild it from a snapshot (undo or redo target). */
function restoreWardrobeState(snapshot) {
  while (wardrobe.length) {
    const e = wardrobe.pop();
    if (e.group.parent) e.group.parent.remove(e.group);
  }
  (snapshot.entries || []).forEach(({ entry, st }) => {
    entry.slot = st.slot;
    entry.slotKey = st.slotKey;
    entry.socketKey = st.socketKey;
    if (st.championFit) entry.group.userData.championFit = st.championFit;
    if (restoreEntryTransform(entry, st)) wardrobe.push(entry);
  });
  const active = snapshot.activeId != null
    ? (wardrobe.find((e) => e.id === snapshot.activeId) || wardrobe[wardrobe.length - 1] || null)
    : (wardrobe[wardrobe.length - 1] || null);
  setActiveEntry(active);
  renderWardrobe();
  syncWardrobeStore(); // the shared store (what the Animation viewer wears) follows the undo
}

/** Classic two-stack undo: each stack entry is ONE full wardrobe snapshot. Undo restores the
 * snapshot stored when the mutation BEGAN; the mirror entry handed to the other stack restores
 * whatever was current at undo time (i.e. the mutation's result). */
function undo() {
  if (pendingMutation) endMutation();
  const u = undoStack.pop();
  if (!u) { updateUndoButtons(); return; }
  const current = captureWardrobeState();
  redoStack.push({ label: u.label, state: current });
  restoreWardrobeState(u.state);
  showHudMessage('Undo: ' + u.label + '.');
  updateUndoButtons();
}

function redo() {
  if (pendingMutation) endMutation();
  const r = redoStack.pop();
  if (!r) { updateUndoButtons(); return; }
  const current = captureWardrobeState();
  undoStack.push({ label: r.label, state: current });
  restoreWardrobeState(r.state);
  showHudMessage('Redo: ' + r.label + '.');
  updateUndoButtons();
}

/** Champion swap invalidates every stored transform (the old skeleton's bones are gone) — the
 * undo history cannot outlive the model it was recorded against. */
function clearUndoHistory() {
  undoStack.length = 0;
  redoStack.length = 0;
  pendingMutation = null;
  updateUndoButtons();
}

const btnUndo = document.getElementById('btnUndo');
const btnRedo = document.getElementById('btnRedo');

function updateUndoButtons() {
  if (btnUndo) {
    const can = undoStack.length > 0;
    btnUndo.disabled = !can;
    btnUndo.setAttribute('aria-disabled', String(!can));
    btnUndo.title = can ? 'Undo ' + undoStack[undoStack.length - 1].label + ' (Ctrl+Z)' : 'Nothing to undo';
  }
  if (btnRedo) {
    const can = redoStack.length > 0;
    btnRedo.disabled = !can;
    btnRedo.setAttribute('aria-disabled', String(!can));
    btnRedo.title = can ? 'Redo ' + redoStack[redoStack.length - 1].label + ' (Ctrl+Y)' : 'Nothing to redo';
  }
}

if (btnUndo) btnUndo.addEventListener('click', undo);
if (btnRedo) btnRedo.addEventListener('click', redo);
window.addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  const k = e.key.toLowerCase();
  if (!(e.ctrlKey || e.metaKey) || k !== 'z' && k !== 'y') return;
  e.preventDefault();
  if (k === 'z') { if (e.shiftKey) redo(); else undo(); }
  else redo();
});
updateUndoButtons(); // initial disabled state

/** Champion swap: every worn piece hangs on the OLD skeleton's bones — drop them all. */
function removeLoadedGear() {
  while (wardrobe.length) {
    const e = wardrobe.pop();
    if (e.group.parent) e.group.parent.remove(e.group);
  }
  setActiveEntry(null);
}

/** Post-parse adoption — ONE pipeline for every import format (GLB / GLTF / FBX / OBJ): rigged
 * rejection, pristine clone, toonify, fit detection, normalize, wardrobe entry. `undo=false`
 * suppresses this call's own undo unit — the restore-wardrobe flow wraps a whole batch in one.
  * @param {string} [slotHint] - art-plan slot for a RAW piece (the try-on path passes the
  * manifest slot so concurrent try-ons cannot race through the shared select); when absent the
  * fit panel's select value applies (the manual "Load gear" path, where that IS the intent).
  * @param {boolean} [pairHint] - explicit bilateral-PAIR flag from the manifest (deterministic;
  * a pair like the rover-leg must be seated at the body midline and exported per-side). */
function adoptGearScene(raw, sourceName, undo, slotHint, pairHint) {
        // Gear is a PROP, not a character: a rigged GLB (skeleton inside) cannot round-trip —
        // clone(true) keeps skeleton refs to the ORIGINAL bones, so GLTFExporter writes a skin
        // of null joints (a corrupt file that crashes every loader). Refuse loudly instead.
        let rigged = false;
        raw.traverse((o) => { if (o.isSkinnedMesh || o.isBone) rigged = true; });
        if (rigged) {
          showHudMessage('That GLB contains a skeleton — it is a rigged character, not a gear prop. Gear must be a plain un-rigged mesh (helmet, plate, tool). Nothing was loaded.');
          return;
        }
        // ROBUSTNESS: loading the SAME file twice would silently stack two overlapping copies.
        // With no slot exclusivity, guard against accidental duplicates (double-click, re-try-on).
        if (sourceName && wardrobe.some((e) => e.name === sourceName)) {
          const existing = wardrobe.find((e) => e.name === sourceName);
          setActiveEntry(existing);
          showHudMessage('Already wearing ' + sourceName + ' — remove it first to load a fresh copy.');
          return;
        }
        const pristine = raw.clone(true); // BEFORE toonify: export ships original materials, no outline shells
        toonify(raw);
        applyPosterizeLevel(currentPosterizeLevel);
        if (flatAlbedo) applyFlatAlbedo(true);

        // Pre-fitted gear keeps its authored origin — recentring would erase the baked fit
        // (bbox-centre-on-bone = helmet on the nose; see main.js).
        let fitKey = null;
        raw.traverse((o) => { if (!fitKey && o.userData && o.userData.championFit) fitKey = o.userData.championFit; });
        let slotExtra = null; // championSlot extra — the art-plan slot a baked piece claims
        raw.traverse((o) => { if (!slotExtra && o.userData && o.userData.championSlot) slotExtra = o.userData.championSlot; });

        const group = new THREE.Group();
        group.name = 'GearPropLoaded';
        if (!fitKey) {
          // Visible-mesh box with FRESH world matrices — setFromObject on a just-parsed GLB
          // measures a stale matrixWorld (~10x too big), which made every raw piece auto-fit at
          // ~1/10 scale. Pairs (both legs / both ears in one file) are NOT recentred here: the
          // pair layout is the design, and socketFitProp seats the pair's center on the body
          // midline instead.
          const box = visibleBox(raw);
          const sphere = new THREE.Sphere();
          box.getBoundingSphere(sphere);
          const diameter = Math.max(sphere.radius * 2, 1e-6);
          // Auto-fit sizing: EVERY slot scales relative to the champion's height (the flat
          // 0.35 made pieces arbitrarily tiny/huge depending on their own diameter).
          const championH = modelHeight || 1.2; // stand-in fallback height
          const factor = SLOT_BASE_SCALE[gearBoneSelect.value] || SLOT_BASE_SCALE.eye;
          group.userData.baseScale = (championH * factor) / diameter;
          group.userData.parseDiameter = diameter; // diagnostics (window.__studio.entries)
          group.userData.parseFactor = factor;
          // Manifest pair flag wins; the geometry heuristic is the fallback for un-flagged pieces.
          group.userData.paired = pairHint === true ? true : isBilateralPair(raw, box);
        }
        group.add(raw);
        group.userData.championFit = fitKey;
        group.userData.rawScene = raw;
        group.userData.outlines = [];
        group.traverse((o) => { if (o.isMesh && /__outline$/.test(o.name)) group.userData.outlines.push(o); });

        const slot = slotHint || gearBoneSelect.value || 'eye';
        const boneKey = fitKey || SLOT_TO_SOCKET[slot] || 'head';   // each piece gets a SLOT for seating;
        // pieces COEXIST even when they share a slot or bone (the art plan wears many at once).
        // Baked gear names its slot via the championSlot extra; older bakes carry only the bone.
        const slotKey = fitKey ? (slotExtra || fitKey) : slot;
        // ONE undo unit per adopted piece: loading a piece is a single reversible step.
        if (undo !== false) beginMutation('Load ' + (sourceName || 'gear'));
        const attached = fitKey ? attachPrefittedGear(group, fitKey) : socketFitProp(group, boneKey, slot);
        if (attached) {
          // NO SLOT EXCLUSIVITY: pieces coexist (the art plan wears many at once — loading a
          // second piece never removes the first; duplicates of the SAME file are guarded above).
          // OVERLAP FALLBACK: if another worn piece already claims this slotKey, never block or
          // evict — nudge the newcomer to the side so both are visible, and let the user drag
          // it into place or delete it (wardrobe ✕). Fans out: 2nd → -0.22, 3rd → +0.22, 4th → -0.44…
          const sameSlot = wardrobe.filter((e) => e.slotKey === slotKey);
          if (sameSlot.length) {
            const n = sameSlot.length;
            const dir = (n % 2 === 0) ? 1 : -1;
            const step = 0.22 * Math.ceil(n / 2);
            group.position.x += dir * step;   // bone-local X ≈ left/right for upright sockets
          }
          const entry = {
            id: ++wardrobeSeq,
            name: sourceName || ('gear-' + wardrobeSeq + '.glb'),
            group: group,
            pristine: pristine,
            slot: fitKey ? slotKey + ' (baked)' : slot,
            slotKey: slotKey,
            socketKey: boneKey, // the bone-level socket this piece bakes against
          };
          wardrobe.push(entry);
          setActiveEntry(entry); // shows the fit section + highlights the row
          setOutlinesVisible(group.userData.outlines, outlinesOn);
          showHudMessage(sameSlot.length
            ? 'Loaded ' + entry.name + ' — overlaps ' + sameSlot[0].name + '; nudged aside. Drag it where you want, or delete it (✕).'
            : 'Loaded gear: ' + entry.name + ' — now worn alongside the rest.');
          syncWardrobeStore(); // save-point: the shared wardrobe changed
          if (undo !== false) endMutation();
        } else if (undo !== false) {
          endMutation(false); // nothing was worn — no undo unit worth keeping
        }
}

/** Multi-format gear intake. GLB / GLTF / FBX / OBJ; sidecar files (textures, .bin, .mtl)
 * selected in the SAME file pick become blob URLs that a URL-modifier hands to whichever loader
 * asks — the browser has no folder to resolve "texture.png" against. Blob URLs are deliberately
 * never revoked: textures resolve asynchronously after parse, and a fit session loads a handful
 * of files at most. Export stays GLB-only (the championFit contract) — FBX in, fitted GLB out.
 * @param onDone optional — called exactly once when the intake settles (parsed+adopted, or
 * failed); the try-on path uses it to release its in-flight guard.
  * @param slotHint optional — the art-plan slot the piece should seat on. NULL for manual
  * "Load gear" (the fit panel's select applies); the try-on path passes the manifest slot so
  * concurrent try-ons cannot race through the shared select (2026-08-27).
  * @param pairHint optional — the manifest's explicit bilateral-PAIR flag (deterministic;
  * overrides the geometry heuristic so a pair like the rover-leg is never treated as one piece). */
function loadGearFiles(files, onDone, slotHint, pairHint) {
  const done = () => { if (onDone) onDone(); };
  if (!files || !files.length) { done(); return; }
  const list = Array.from(files);
  const main = list.find((f) => /\.(glb|gltf|fbx|obj)$/i.test(f.name));
  if (!main) { showHudMessage('No .glb / .gltf / .fbx / .obj model among the chosen files.'); done(); return; }
  const blobMap = new Map();
  list.forEach((f) => { if (f !== main) blobMap.set(f.name.toLowerCase(), URL.createObjectURL(f)); });
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    const base = decodeURIComponent(String(url).split(/[\\/]/).pop() || '').toLowerCase();
    return blobMap.get(base) || url;
  });
  const ext = (main.name.split('.').pop() || '').toLowerCase();
  const fail = (err) => {
    showHudMessage('Failed to parse gear ' + ext.toUpperCase() + ': ' + (err && err.message ? err.message : err));
    done();
  };
  const reader = new FileReader();
  reader.onerror = () => { showHudMessage('Could not read the gear file.'); done(); };
  reader.onload = () => {
    try {
      if (ext === 'fbx') {
        adoptGearScene(new FBXLoader(manager).parse(reader.result, ''), main.name, undefined, slotHint, pairHint);
        done();
      } else if (ext === 'obj') {
        adoptGearScene(new OBJLoader(manager).parse(reader.result), main.name, undefined, slotHint, pairHint);
        done();
      } else {
        new GLTFLoader(manager).parse(reader.result, '', (gltf) => {
          try {
            const raw = gltf.scene || (gltf.scenes && gltf.scenes[0]);
            if (!raw) { showHudMessage('Gear file parsed but contained no scene.'); done(); return; }
            adoptGearScene(raw, main.name, undefined, slotHint, pairHint);
            done();
          } catch (err) { fail(err); }
        }, fail);
      }
    } catch (err) {
      // Loaders can THROW synchronously on corrupt input (e.g. a skin with null joints) instead
      // of calling onError — without this catch the failure is silent and the button looks dead.
      fail(err);
    }
  };
  if (ext === 'obj') reader.readAsText(main); else reader.readAsArrayBuffer(main);
}

/** Back-compat shim — the deploy autoload appendix feeds this a single GLB File. */
function loadGearGLB(file) {
  if (file) loadGearFiles([file]);
}

/** Bake ONE wardrobe entry's CURRENT (gizmo-adjusted) placement into a pre-fitted GLB buffer
 * (championFit contract: coords relative to the socket bone, socket name in extras). Shared by
 * the Download button and the live wardrobe-store sync. */
function bakeFittedGLB(entry) {
  return new Promise((resolve, reject) => {
    const boneKey = entry.socketKey || entry.group.userData.championFit || 'head';
    const target = findFitSocketTarget(boneKey);
    if (!target) { reject(new Error('no "' + boneKey + '" bone on the current model')); return; }
    const rawLive = entry.group.userData.rawScene || entry.group;
    rawLive.updateWorldMatrix(true, false);
    const bonePos = target.getWorldPosition(new THREE.Vector3());
    const rel = new THREE.Matrix4()
      .makeTranslation(-bonePos.x, -bonePos.y, -bonePos.z)
      .multiply(rawLive.matrixWorld);
    const root = entry.pristine.clone(true);
    rel.decompose(root.position, root.quaternion, root.scale);
    root.userData = Object.assign({}, root.userData, {
      championFit: boneKey,
      // Slot identity must survive the round trip, or a restored/re-shared piece degrades to
      // bone-level swapping (see the one-piece-per-slot law in adoptGearScene).
      championSlot: entry.slotKey || boneKey,
    });
    new GLTFExporter().parse(root, resolve, reject, { binary: true });
  });
}

function downloadFittedGear() {
  if (!activeEntry) { showHudMessage('Load a gear GLB first.'); return; }
  const entry = activeEntry;
  const fileName = bakedFileName(entry.name);
  bakeFittedGLB(entry).then((buffer) => {
    const blob = new Blob([buffer], { type: 'model/gltf-binary' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    showHudMessage('Saved ' + fileName + ' — pre-fitted to "' + (entry.socketKey || 'head') + '".');
  }).catch((err) => showHudMessage('Export failed: ' + (err && err.message ? err.message : err)));
}

/** "kabuto.fbx" -> "kabuto-fitted.glb". Strips an existing "-fitted" first so a piece restored
 * from the store and saved again does not grow into "-fitted-fitted" on every round trip. */
function bakedFileName(name) {
  return (name || 'gear').replace(/(-fitted)?\.(glb|gltf|fbx|obj)$/i, '') + '-fitted.glb';
}

// ---------------------------------------------------------------------------------------------
// DRESSED CHAMPION EXPORT (2026-08-27; skinned 2026-08-29) — "Download fitted GLB" bakes
// ONE accessory (the team workflow: that file goes onto the shared shelf). The owner also needs
// the whole result: the base champion WITH every worn accessory, as a single GLB. Built from
// pristine copies only: championPristine (captured before toonify — original PBR materials, no
// outline shells) plus each wardrobe entry's pristine gear cloned into it at the CURRENT
// bone-local transform (the live group is a direct child of its socket bone, so
// group.position/quaternion/scale IS the fit). Gear re-attach extras are stripped.
// The output is SKINNED: the Mixamo armature + SkinnedMesh are kept (gear rides the bones), so
// the AI City can ANIMATE the dressed champion with its shared Mixamo clip library. The root is
// normalized (feet at y=0, centred X/Z) so the city's loader grounds it with no further math.
// ---------------------------------------------------------------------------------------------

/** Find a bone in ANY root by the same rules findFitSocketTarget uses (exact name wins, then
 * the slot's pattern) — the dressed export has its own cloned bone hierarchy, so the live
 * lookup cannot be reused. @returns {THREE.Bone|null} */
function findBoneIn(root, boneKey) {
  const pattern = FIT_SOCKET_PATTERNS[boneKey];
  let exact = null;
  let match = null;
  root.traverse((o) => {
    if (!o.isBone) return;
    if (!exact && o.name.toLowerCase() === String(boneKey).toLowerCase()) exact = o;
    if (!match && pattern && pattern.test(o.name)) match = o;
  });
  return exact || match;
}

/** Normalize the dressed champion for export: feet at y=0, centred on X/Z, at the base's
 *  natural meter scale. Box3 reads true world bounds (armature parent + node transforms
 *  included), so this works whether the mesh is under the Armature or a sibling. Moving the
 *  root translates bones + skin + gear together — the GLTFExporter re-serializes inverse bind
 *  matrices from the moved pose, so the file reloads clean. */
function normalizeDressedRoot(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return;
  root.position.x -= (box.min.x + box.max.x) / 2;
  root.position.z -= (box.min.z + box.max.z) / 2;
  root.position.y -= box.min.y;
  root.updateMatrixWorld(true);
}

/** Bake the pristine champion + every worn piece into ONE SKINNED binary GLB.
 *  Keeps the Mixamo armature + SkinnedMesh (with gear as bone children) so the AI City
 *  — or any Mixamo-clip runtime — can ANIMATE the dressed champion. Normalized to feet at
 *  y=0 and centred on X/Z so the city's loader grounds it with no further math.
 *  Resolves with the ArrayBuffer. Rejects when no champion is loaded or the export fails. */
function bakeDressedChampion() {
  return new Promise((resolve, reject) => {
    if (!championPristine) { reject(new Error('no champion loaded')); return; }
    const root = SkeletonUtils.clone(championPristine); // re-bind the skeleton to the cloned bones
    root.updateMatrixWorld(true);   // fresh bone matrixWorld for the pair re-parent below
    wardrobe.forEach((entry) => {
      const boneKey = entry.socketKey || entry.group.userData.championFit || 'head';
      const bone = findBoneIn(root, boneKey);
      if (!bone) return; // socket bone missing on this champion — skip the piece, keep the rest
      const gear = entry.pristine.clone(true);
      gear.traverse((o) => {
        if (o.userData) { delete o.userData.championFit; delete o.userData.championSlot; }
      });
      gear.position.copy(entry.group.position);
      gear.quaternion.copy(entry.group.quaternion);
      gear.scale.copy(entry.group.scale);

      const paired = !!entry.group.userData.paired;
      if (paired && gear.children.length >= 2) {
        // BILATERAL PAIR — split each half to its own L/R socket bone so each side follows
        // its own leg during animation (a pair attached whole to one bone collapses to one
        // side in the city: "one entity, not one per foot"). Each half's placement is taken
        // from the LIVE fit (exactly what the studio shows) and re-parented onto the cloned
        // skeleton, so the world position is preserved.
        entry.group.updateWorldMatrix(true, true);
        const halves = gear.children.slice();
        const tmpW = new THREE.Matrix4();
        const tmpL = new THREE.Matrix4();
        for (const half of halves) {
          const n = String(half.name || '').toLowerCase();
          const side = /legl$|left/.test(n) ? 'legL' : /legr$|right/.test(n) ? 'legR' : null;
          const targetBone = side ? (findBoneIn(root, side) || bone) : bone;
          const liveHalf = entry.group.getObjectByName(half.name) || half;
          liveHalf.updateWorldMatrix(true, false);
          tmpW.copy(liveHalf.matrixWorld);
          targetBone.updateWorldMatrix(true, false);
          tmpL.copy(targetBone.matrixWorld).invert().multiply(tmpW);
          tmpL.decompose(half.position, half.quaternion, half.scale);
          gear.remove(half);
          targetBone.add(half);
        }
      } else {
        bone.add(gear);   // single piece → bone child rides the animation in the city
      }
    });
    normalizeDressedRoot(root);
    new GLTFExporter().parse(root, resolve, reject, { binary: true });
  });
}

/** The download handler for the dressed-champion button: status message up front (the 24 MB
 * base re-encodes its textures — this takes a while), then a binary GLB download. */
function downloadDressedChampion() {
  if (!championPristine) { showHudMessage('The champion is not loaded yet.'); return; }
  showHudMessage('Exporting the dressed champion — the 24 MB base re-encodes, give it a moment…');
  bakeDressedChampion().then((buffer) => {
    const blob = new Blob([buffer], { type: 'model/gltf-binary' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'champion-dressed.glb';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    const n = wardrobe.length;
    showHudMessage('Saved champion-dressed.glb — base champion + ' + n + (n === 1 ? ' worn piece.' : ' worn pieces.'));
  }).catch((err) => {
    showHudMessage('Dressed export failed: ' + (err && err.message ? err.message : err));
  });
}

// LIVE WARDROBE SYNC (2026-08-10) — the studio and the Animation Viewer share ONE wardrobe
// (wardrobe-store.js). Every save-point (piece added, piece removed, gizmo drag finished)
// re-bakes all worn pieces and overwrites the store; the viewer dresses from it on load.
// The studio deliberately does NOT re-dress from the store (2026-08-25) — it opens BARE and
// only wears what the student fits; the store is the viewer's wardrobe, the studio's is live.
let storeSyncBusy = false;   // a bake set is being exported right now
let storeSyncQueued = false; // a save-point landed mid-bake — run once more, last state wins

function syncWardrobeStore() {
  if (storeSyncBusy) { storeSyncQueued = true; return; }
  storeSyncBusy = true;
  (async () => {
    try {
      const pieces = [];
      for (const e of wardrobe) {
        pieces.push({ name: bakedFileName(e.name), buffer: await bakeFittedGLB(e) });
      }
      await saveWardrobe(pieces);
    } catch (err) {
      // Never blocks fitting — the viewer just keeps seeing the previous save.
      console.error('[wardrobe sync]', err);
    } finally {
      storeSyncBusy = false;
      if (storeSyncQueued) { storeSyncQueued = false; syncWardrobeStore(); }
    }
  })();
}

/** Resolves once no wardrobe bake/save is in flight or queued — i.e. the store matches what is
 * on screen. The Animation-viewer link awaits this: a 15 MB piece takes ~seconds to bake
 * (GLTFExporter re-encodes its textures), and navigating mid-bake would dance YESTERDAY's
 * wardrobe. */
function whenWardrobeSynced() {
  return new Promise((resolve) => {
    const tick = () => ((storeSyncBusy || storeSyncQueued) ? setTimeout(tick, 100) : resolve());
    tick();
  });
}

// ---------------------------------------------------------------------------------------------
// RESTORE LAST LOOK (2026-08-25) — the studio opens BARE (owner decision), but a returning
// student who fitted pieces last session would otherwise have to rebuild them by hand while the
// Animation viewer still wears them. This button re-dresses the studio from the SAME IndexedDB
// store the viewer reads: whatever was worn when the session last saved is exactly what comes
// back. It REPLACES the current wardrobe, and like every other change it is ONE undo step —
// "Undo: Restore saved wardrobe" puts the pre-restore look back, so no confirm dialog needed.
// ---------------------------------------------------------------------------------------------

/** Parse ONE stored wardrobe piece (always GLB — bakeFittedGLB exports binary only) and adopt it
 * WITHOUT its own undo unit: the restore flow wraps the whole batch in a single mutation. */
function loadStoredGearGLB(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => { showHudMessage('Could not read ' + file.name + '.'); resolve(false); };
    reader.onload = () => {
      try {
        new GLTFLoader().parse(reader.result, '', (gltf) => {
          const raw = gltf.scene || (gltf.scenes && gltf.scenes[0]);
          if (!raw) { showHudMessage('Stored piece ' + file.name + ' parsed with no scene.'); resolve(false); return; }
          adoptGearScene(raw, file.name, false);
          resolve(true);
        }, (err) => {
          showHudMessage('Stored piece ' + file.name + ' failed to parse: ' + (err && err.message ? err.message : err));
          resolve(false);
        });
      } catch (err) {
        showHudMessage('Stored piece ' + file.name + ' failed to parse: ' + (err && err.message ? err.message : err));
        resolve(false);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

async function restoreWardrobeFromStore() {
  const progress = progressUI();
  try {
    const { loadWardrobe } = await import('./wardrobe-store.js');
    const stored = await loadWardrobe();
    if (!stored || !stored.length) {
      showHudMessage('Nothing saved on this browser yet — fit some gear first, then Restore works.');
      return;
    }
    beginMutation(wardrobe.length ? 'Replace wardrobe with saved look' : 'Restore saved wardrobe');
    if (wardrobe.length) {
      // Clear the current look first (WITHOUT nested undo units — this is part of the restore).
      while (wardrobe.length) {
        const e = wardrobe.pop();
        if (e.group.parent) e.group.parent.remove(e.group);
      }
      setActiveEntry(null);
    }
    let done = 0;
    for (const p of stored) {
      done += 1;
      progress.show('Restoring look — ' + done + ' / ' + stored.length + ' (' + p.name + ')', null);
      await loadStoredGearGLB(new File([p.buffer], p.name));
    }
    endMutation();
    progress.hide();
    showHudMessage('Restored ' + stored.length + ' piece' + (stored.length === 1 ? '' : 's') + ' from your saved look — Undo brings the old look back.');
  } catch (err) {
    // Keep the undo unit if a PARTIAL restore happened (some pieces adopted before the failure)
    // — the student can then Undo the half-restored look. No-op when the mutation never began.
    endMutation();
    progress.hide();
    showHudMessage('Could not restore the saved wardrobe: ' + (err && err.message ? err.message : err));
  }
}

const btnRestoreWardrobe = document.getElementById('btnRestoreWardrobe');
if (btnRestoreWardrobe) btnRestoreWardrobe.addEventListener('click', restoreWardrobeFromStore);

/** Re-dress from the shared store after a champion load. REMOVED 2026-08-25 — the studio opens
 * BARE by owner decision; the store is the Animation viewer's wardrobe now. (Kept as a marker
 * so nobody re-adds the old behavior by accident.) */

// ---------------------------------------------------------------------------------------------
// GLB drop-in — identical flow to main.js, with one addition at the end of the success callback:
// re-apply the current posterize level to the freshly-created toon materials (band count and
// outline thickness are already correct at creation time — see their doc comments above).
// ---------------------------------------------------------------------------------------------

const gltfLoader = new GLTFLoader();
let currentModel = null;
/** Untoonified, out-of-scene clone of the loaded champion — the export source for the dressed
 * champion download (see loadGLBFromArrayBuffer). Null until a champion loads. */
let championPristine = null;
let currentModelOutlines = [];
let mixer = null;
let clipActions = {};
let activeIsStandIn = true;

/** Fit the camera/orbit target to an object's bounding box. Frames the PERSPECTIVE camera (the
 * default) directly; if we're currently in ortho view, also re-syncs the ortho frustum to match
 * so switching camera kinds right after a load still shows the new model correctly framed. */
function autoFrameCamera(object) {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const dist = maxDim * 1.8;
  modelCrown = new THREE.Vector3(center.x, box.max.y, center.z);
  modelHeight = size.y || 0;
  modelFloorY = box.min.y;
  controls.target.copy(center);
  perspCamera.near = Math.max(maxDim / 500, 0.01);
  perspCamera.far = Math.max(maxDim * 200, 100);
  perspCamera.updateProjectionMatrix();
  perspCamera.position.set(center.x + dist * 0.55, center.y + dist * 0.45, center.z + dist * 0.85);
  if (cameraKind === 'ortho') {
    syncOrthoFromPerspective();
  } else {
    controls.update();
  }
  groundBlob.position.set(center.x, box.min.y + 0.002, center.z);
  const groundScale = Math.max(maxDim * 0.9, 0.1);
  groundBlob.scale.setScalar(groundScale / 0.7);
}

function clearClipButtons() {
  const section = document.getElementById('clipSection');
  const wrap = document.getElementById('clipButtons');
  wrap.textContent = '';
  section.hidden = true;
  clipActions = {};
}

function populateClipButtons(clips, root) {
  clearClipButtons();
  if (!clips || !clips.length) return;
  mixer = new THREE.AnimationMixer(root);
  const section = document.getElementById('clipSection');
  const wrap = document.getElementById('clipButtons');
  section.hidden = false;
  clips.forEach((clip) => {
    const action = mixer.clipAction(clip);
    clipActions[clip.name] = action;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'hud__btn';
    btn.textContent = clip.name || 'clip';
    btn.addEventListener('click', () => {
      Object.values(clipActions).forEach((a) => a.stop());
      action.reset().play();
      Array.from(wrap.children).forEach((c) => c.classList.remove('hud__btn--active'));
      btn.classList.add('hud__btn--active');
    });
    wrap.appendChild(btn);
  });
}

function populateBoneList(root) {
  const bones = [];
  root.traverse((o) => { if (o.isBone) bones.push(o.name); });
  const el = document.getElementById('boneList');
  el.textContent = bones.length ? bones.join('\n') : '(model loaded, but no THREE.Bone nodes found — is it rigged?)';
}

function setOutlinesVisible(mesh_outlines, visible) {
  mesh_outlines.forEach((m) => { m.visible = visible; });
}

let outlinesOn = true;

/** GLTFLoader.parse can THROW synchronously on corrupt input instead of calling onError (the
 *  gear path already guards this; the champion fallback path did not — a bad file died as an
 *  uncaught SyntaxError with no HUD message). Every parse goes through here so a bad file always
 *  surfaces via onError, never an uncaught exception (crash-proof I/O law). */
function parseGLBGuarded(buffer, onLoad, onError) {
  try {
    gltfLoader.parse(buffer, '', onLoad, onError);
  } catch (err) {
    if (onError) onError(err);
  }
}

function loadGLBFromArrayBuffer(buffer, sourceName) {
  parseGLBGuarded(
    buffer,
    (gltf) => {
      if (activeIsStandIn) {
        scene.remove(standIn.root);
      } else if (currentModel) {
        scene.remove(currentModel);
      }
      if (gearProp.parent) gearProp.parent.remove(gearProp);
      gearSocketed = false;
      removeLoadedGear(); // the loaded gear prop was socketed to the OLD model's bones — drop it too
      clearUndoHistory(); // stored transforms died with the old skeleton — undo cannot survive a swap
      if (mixer) { mixer.stopAllAction(); mixer = null; }

      currentModel = gltf.scene || (gltf.scenes && gltf.scenes[0]);
      if (!currentModel) {
        showHudMessage('GLB parsed but contained no scene.');
        return;
      }
      // PRISTINE CHAMPION (2026-08-27): a clone of the model taken BEFORE toonify, kept OUT of
      // the scene. It carries the original PBR materials and no outline shells — the export
      // source for the "Download dressed champion" button (the live model is toonified and
      // outlined, which would bake the spike look into the file). SkeletonUtils.clone re-binds
      // the skeleton to the cloned bones, so GLTFExporter can write it out as a valid rig.
      championPristine = SkeletonUtils.clone(currentModel);
      scene.add(currentModel);
      currentModelOutlines = toonify(currentModel);
      applyPosterizeLevel(currentPosterizeLevel); // re-apply: fresh toon materials start un-posterized
      if (flatAlbedo) applyFlatAlbedo(true); // ...and still carry their .map, which flat mode must strip
      setOutlinesVisible(currentModelOutlines, outlinesOn);
      setOutlinesVisible(standInOutlines, false);
      autoFrameCamera(currentModel);
      populateClipButtons(gltf.animations, currentModel);
      populateBoneList(currentModel);
      activeIsStandIn = false;
      document.getElementById('dropZone').classList.add('is-loaded');
      showHudMessage('Loaded ' + (sourceName || 'GLB') + '.');
      // The studio is the FITTING ROOM: it opens BARE (2026-08-25 — owner decision). The shared
      // store still receives every save-point (pieces the student fits bake into it for the
      // Animation viewer to wear), but this page deliberately does NOT re-dress from it on
      // load — gear appears only when the student fits it.
    },
    (err) => {
      showHudMessage('Failed to parse GLB: ' + (err && err.message ? err.message : err));
    }
  );
}

function readFileAsGLB(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => loadGLBFromArrayBuffer(reader.result, file.name);
  reader.onerror = () => showHudMessage('Could not read the dropped file.');
  reader.readAsArrayBuffer(file);
}

// ---------------------------------------------------------------------------------------------
// HUD wiring
// ---------------------------------------------------------------------------------------------

function showHudMessage(msg) {
  document.getElementById('hudMessage').textContent = msg || '';
}

let mode = 'idle';
const btnIdle = document.getElementById('btnIdle');
const btnWalk = document.getElementById('btnWalk');
function setMode(next) {
  mode = next;
  btnIdle.classList.toggle('hud__btn--active', mode === 'idle');
  btnWalk.classList.toggle('hud__btn--active', mode === 'walk');
}
btnIdle.addEventListener('click', () => setMode('idle'));
btnWalk.addEventListener('click', () => setMode('walk'));

const btnOutline = document.getElementById('btnOutline');
btnOutline.addEventListener('click', () => {
  outlinesOn = !outlinesOn;
  setOutlinesVisible(standInOutlines, outlinesOn);
  setOutlinesVisible(currentModelOutlines, outlinesOn);
  setOutlinesVisible(gearProp.userData.outlines || [], outlinesOn);
  btnOutline.textContent = 'Outline: ' + (outlinesOn ? 'on' : 'off');
  btnOutline.classList.toggle('hud__btn--active', outlinesOn);
});

gearProp.userData.outlines = [];
gearProp.traverse((o) => { if (o.isMesh && /__outline$/.test(o.name)) gearProp.userData.outlines.push(o); });

// Repurposed (2026-08-09): this used to socket/remove the PLACEHOLDER test badge (gearProp) —
// useless once real gear loading existed, and confusing because it looked like it acted on the
// loaded gear. Now it removes the LOADED gear so a fitter can start over without reloading.
const btnGear = document.getElementById('btnGear');
btnGear.addEventListener('click', () => {
  if (gearSocketed) unsocketGear(); // clear the legacy test badge too, if one is out
  if (activeEntry) removeEntry(activeEntry, true); // undoable — the safety net covers removals
  else showHudMessage('No gear selected — pick one in the wardrobe.');
  btnGear.classList.remove('hud__btn--active');
});

const bonePanel = document.getElementById('bonePanel');
const btnBones = document.getElementById('btnBones');
const btnBonesClose = document.getElementById('btnBonesClose');
btnBones.addEventListener('click', () => {
  if (activeIsStandIn) {
    document.getElementById('boneList').textContent = Object.keys(standIn.nodes)
      .filter((k) => k !== 'torsoMesh')
      .join('\n') + '\n\n(stand-in — programmatic Object3D nodes, not a real skeleton)';
  }
  bonePanel.hidden = !bonePanel.hidden;
});
btnBonesClose.addEventListener('click', () => { bonePanel.hidden = true; });

// Gear fit HUD wiring — Blender-familiar keys (G/R/S) + buttons; socket select re-seats a raw
// prop, refuses to move a pre-fitted one off its baked socket.
const gearBoneSelect = document.getElementById('gearBone');
gearBoneSelect.addEventListener('change', () => {
  if (!loadedGearProp) return;
  beginMutation('Move to slot ' + gearBoneSelect.value);
  const fitKey = loadedGearProp.userData.championFit;
  if (fitKey) {
    attachPrefittedGear(loadedGearProp, fitKey);
    showHudMessage('This gear is pre-fitted to "' + fitKey + '" — it stays there.');
  } else {
    const slot = gearBoneSelect.value;
    socketFitProp(loadedGearProp, SLOT_TO_SOCKET[slot] || slot, slot);
    if (activeEntry) {
      // NO SLOT EXCLUSIVITY: re-seating a piece never removes a neighbour.
      activeEntry.slot = slot;
      activeEntry.slotKey = slot;
      activeEntry.socketKey = SLOT_TO_SOCKET[slot] || slot;
      renderWardrobe();
      syncWardrobeStore(); // save-point: slot assignment is part of the shared wardrobe
    }
  }
  endMutation();
});
const gearInput = document.getElementById('gearInput');
gearInput.addEventListener('change', (e) => {
  loadGearFiles(e.target.files);
  gearInput.value = '';
});
renderWardrobe(); // initial empty-state hint

/** One-click try-on for a shared fitted piece: fetch it and run it through the normal gear
 * intake — a baked championFit seats it exactly as authored, so it lands worn, not floating.
 * Gear files run up to ~15 MB, so the fetch drives the shared loading-progress bar.
 * GUARDS (2026-08-26): a double-click must not start a second fetch of the same piece, and
 * switching to the Animation viewer mid-intake would silently drop the in-flight piece — the
 * viewer link is blocked while any try-on is in flight (fetch through parse/adoption). */
const tryOnInFlight = new Set(); // piece names being fetched/parsed right now
function tryOnSharedGear(name, slotHint) {
  if (tryOnInFlight.has(name)) return; // already fetching this piece — ignore the second click
  tryOnInFlight.add(name);
  // Resolve the piece's art-plan slot from the manifest BEFORE the fetch (fall back to its
  // category's slot). RACE GUARD (2026-08-27): the slot must travel WITH the fetch, not via
  // the shared gearBoneSelect — two quick try-ons (e.g. rover-leg then helmet) each set the
  // select, and the slower parse would adopt under the SECOND piece's slot and evict it. The
  // select is still set for the fit panel's display, but adoptGearScene reads slotHint.
  const man = sharedGearEntries.find((e) => e.file === name);
  const hint = slotHint || (man && (man.slot || AUTO_SOCKET_BY_CATEGORY[man.category])) || undefined;
  const pairHint = man && man.pair === true;
  if (hint) gearBoneSelect.value = hint;
  showHudMessage('Fetching ' + name + '…');
  const progress = progressUI();
  progress.show('Fetching ' + name, 0);
  fetchWithProgress('./assets/gear/' + encodeURIComponent(name), (p) => progress.show('Fetching ' + name, p))
    .then((buffer) => {
      progress.hide();
      // The in-flight guard covers parse+adoption too (loadGearFiles signals completion via its
      // onDone callback), so a mid-intake page switch cannot silently lose the piece.
      loadGearFiles([new File([buffer], name)], () => tryOnInFlight.delete(name), hint, pairHint);
    })
    .catch((err) => {
      progress.hide();
      tryOnInFlight.delete(name);
      showHudMessage('Could not fetch ' + name + ': ' + (err && err.message ? err.message : err));
    });
}

// ---------------------------------------------------------------------------------------------
// SHARED-GEAR SHELF (2026-08-25): category chips + search + AUTO-FIT. The manifest now carries
// {file, label, category} objects (plain filenames still work — category is derived from the
// name). Chips and the search box filter the SAME list, so a student can find a piece by eye
// (category) or by name; every row keeps Try on (see it worn), gains Auto-fit (see it worn AND
// seated on the right socket), and keeps the download glyph.
// ---------------------------------------------------------------------------------------------

/** Shelf taxonomy mirrors the fit panel's slot groups (Anatomy — Senses etc.), because that is
 * the vocabulary the student has already seen by the time they reach the shelf. */
const GEAR_CATEGORY_ORDER = ['Head', 'Senses', 'Back', 'Shoulders', 'Legs', 'Chest', 'Other'];

/** Raw props seat at the best slot for their category (pre-fitted pieces ignore the select and
 * land on their BAKED socket, which is the whole point of the championFit contract). */
const AUTO_SOCKET_BY_CATEGORY = {
  Head: 'crown', Senses: 'eye', Back: 'backRig',
  Shoulders: 'shoulderL', Legs: 'legL', Chest: 'chest', Other: 'eye',
};

/** Filename -> category fallback for a manifest that still lists plain strings. Keyword order
 * matters: "drone-bay" contains no sense word, "rover-leg" contains "leg" AFTER "rover" — the
 * specific nouns are checked before the generic anatomy terms. */
function deriveGearCategory(file) {
  const n = String(file || '').toLowerCase();
  if (/helmet/.test(n)) return 'Head';
  if (/sense|recycle-eye/.test(n)) return 'Senses';
  if (/planner|warden|brain/.test(n)) return 'Back';
  if (/drone/.test(n)) return 'Shoulders';
  if (/rover/.test(n)) return 'Legs';
  if (/scan/.test(n)) return 'Chest';
  return 'Other';
}

/** Human label for a manifest entry: the manifest's label, else the filename prettified
 * ("mood-sense-2-final-shrunk.glb" -> "Mood Sense 2"). */
function gearEntryLabel(entry) {
  if (entry.label) return entry.label;
  return String(entry.file || '')
    .replace(/\.[^.]+$/, '')
    .replace(/(?:-final|-stamped|-shrunk|-t2|-cutout|\(\d+\))/gi, '')
    .replace(/-+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

let sharedGearEntries = []; // [{file, label, category}] — the full shelf, unfiltered
let sharedGearCategory = 'All';
let sharedGearQuery = '';

/** Re-render the chips + gear rows against the current category/query filters. Cheap enough to
 * run on every chip tap / keystroke: the shelf is a few dozen rows. */
function renderSharedGearShelf() {
  const chips = document.getElementById('assetGearChips');
  const shelf = document.getElementById('assetGearList');
  if (!chips || !shelf) return;

  const q = sharedGearQuery.trim().toLowerCase();
  const visible = sharedGearEntries.filter((e) =>
    (sharedGearCategory === 'All' || e.category === sharedGearCategory) &&
    (!q || e.label.toLowerCase().includes(q) || e.file.toLowerCase().includes(q))
  );

  // Chips: All + every category present in the manifest (in the canonical order), with counts.
  const present = ['All'].concat(GEAR_CATEGORY_ORDER.filter((c) =>
    sharedGearEntries.some((e) => e.category === c)));
  chips.replaceChildren();
  present.forEach((cat) => {
    const count = cat === 'All' ? sharedGearEntries.length : sharedGearEntries.filter((e) => e.category === cat).length;
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'shelf__chip' + (cat === sharedGearCategory ? ' shelf__chip--active' : '');
    chip.textContent = cat;
    chip.title = count + (count === 1 ? ' piece' : ' pieces');
    chip.setAttribute('aria-pressed', cat === sharedGearCategory ? 'true' : 'false');
    chip.addEventListener('click', () => { sharedGearCategory = cat; renderSharedGearShelf(); });
    chips.appendChild(chip);
  });

  // Header count badge — "26 pieces" on the collapsible header row.
  const countBadge = document.getElementById('tryOnCount');
  if (countBadge) {
    const n = sharedGearEntries.length;
    countBadge.textContent = n + (n === 1 ? ' piece' : ' pieces');
  }

  // Rows: [Try on] [↓]. The label is what the student reads; the file name is the tooltip (it
  // is also what the Try-on action loads). The AUTO-FIT button is the single one in the section
  // header now (2026-08-25) — it asks which gear, or fits directly when only one matches.
  shelf.replaceChildren();
  if (!visible.length) {
    const p = document.createElement('p');
    p.className = 'wardrobe__empty';
    p.textContent = sharedGearEntries.length
      ? 'Nothing matches that filter — try another category or a different name.'
      : 'No shared gear yet (assets/gear/manifest.json).';
    shelf.appendChild(p);
    return;
  }
  visible.forEach((entry) => {
    const row = document.createElement('div');
    row.className = 'wardrobe__row';

    const tryBtn = document.createElement('button');
    tryBtn.type = 'button';
    tryBtn.className = 'wardrobe__pick';
    tryBtn.textContent = 'Try on · ' + entry.label;
    tryBtn.title = entry.file;
    tryBtn.addEventListener('click', () => tryOnSharedGear(entry.file));

    const dl = document.createElement('a');
    dl.className = 'wardrobe__remove wardrobe__dl';
    dl.textContent = '↓';
    dl.title = 'Download ' + entry.file;
    dl.href = './assets/gear/' + encodeURIComponent(entry.file);
    dl.setAttribute('download', entry.file);

    row.appendChild(tryBtn);
    row.appendChild(dl);
    shelf.appendChild(row);
  });
}

/** Auto-fit = set the best socket for the piece's category, then load it through the normal
 * intake. Pre-fitted gear (baked championFit) ignores the select and lands exactly as authored;
 * raw props seat at the category's slot with the crown-anchor/scale defaults. Either way the
 * piece becomes the ACTIVE entry, so the student can still fine-tune with Move/Rotate/Scale. */
function autoFitSharedGear(entry) {
  // The manifest's explicit slot wins over the category mapping (e.g. sky-sense is a crown
  // antenna, not an eye piece). The select is set for the fit panel's display; the slot hint
  // travels with the fetch so concurrent try-ons cannot race (see tryOnSharedGear).
  gearBoneSelect.value = entry.slot || AUTO_SOCKET_BY_CATEGORY[entry.category] || 'eye';
  showHudMessage('Auto-fitting ' + entry.label + '…');
  tryOnSharedGear(entry.file, entry.slot || AUTO_SOCKET_BY_CATEGORY[entry.category] || 'eye');
}

// ---------------------------------------------------------------------------------------------
// ONE AUTO-FIT BUTTON (2026-08-25) — the single header button replaces the 26 per-row buttons.
// It acts on the gear WORN ON THE CHAMPION: exactly one piece worn -> fit it straight away
// (2026-08-25 rule); several worn -> the picker dialog asks which one; none -> disabled.
// ---------------------------------------------------------------------------------------------

/** Re-seat ONE worn piece: pre-fitted gear back onto its baked socket (as-authored), raw props
 * through the auto-fit placement. RAW PROPS ALSO MOVE to their category's best slot — Try on
 * may have dropped them on the default eye slot, and auto-fit is the "seat it properly" action,
 * so it fixes the slot AND the seat. */
function autoFitWornEntry(entry) {
  beginMutation('Auto-fit ' + (entry.name || 'piece'));
  const baked = entry.group.userData.championFit;
  if (baked) {
    attachPrefittedGear(entry.group, baked);
  } else {
    const base = entry.name.replace(/-fitted\.glb$/i, '.glb');
    const man = sharedGearEntries.find((m) => m.file === entry.name) || sharedGearEntries.find((m) => m.file === base);
    const cat = man ? man.category : deriveGearCategory(entry.name);
    // The manifest's explicit slot first (2026-08-27): the category mapping alone would drop
    // every Senses piece on 'eye' and evict the previous one — distinct slots are what let the
    // champion wear many pieces at once.
    const slot = (man && man.slot) || AUTO_SOCKET_BY_CATEGORY[cat] || entry.slotKey;
    gearBoneSelect.value = slot;
    entry.slot = slot;
    entry.slotKey = slot;
    entry.socketKey = SLOT_TO_SOCKET[slot] || slot;
    socketFitProp(entry.group, entry.socketKey, entry.slotKey);
    renderWardrobe(); // slot labels on the wardrobe rows changed
  }
  setActiveEntry(entry);
  showHudMessage('Auto-fitted ' + entry.name + '.');
  syncWardrobeStore(); // save-point: placement (and slot) changed
  const label = (sharedGearEntries.find((m) => m.file === entry.name) ||
    sharedGearEntries.find((m) => m.file === entry.name.replace(/-fitted\.glb$/i, '.glb')))?.label
    || gearEntryLabel({ file: entry.name });
  showFitDoneBubble('Done! The ' + label + ' is fitted.');
  endMutation();
}

// ---------------------------------------------------------------------------------------------
// AUTO-FIT DONE BUBBLE (2026-08-25) — the student's confirmation that a fit finished. Appears
// over the canvas for ~3.2s, then fades out; a second auto-fit while one is showing just
// replaces the text and restarts the timer (no stacking).
// ---------------------------------------------------------------------------------------------

let fitDoneBubbleTimer = null;
let fitDoneBubbleHideTimer = null;

function showFitDoneBubble(text) {
  const bubble = document.getElementById('fitDoneBubble');
  const t = document.getElementById('fitDoneBubbleText');
  if (!bubble || !t) return;
  clearTimeout(fitDoneBubbleTimer);
  clearTimeout(fitDoneBubbleHideTimer);
  t.textContent = text;
  bubble.classList.remove('fit-done--out');
  bubble.hidden = false;
  void bubble.offsetWidth; // reflow restarts the entrance animation on repeat fits
  fitDoneBubbleTimer = setTimeout(() => bubble.classList.add('fit-done--out'), 3200);
  fitDoneBubbleHideTimer = setTimeout(() => { bubble.hidden = true; }, 3700);
}

let autoFitDialogItems = []; // [{label, category, slot, entry}] — the WORN pieces to choose from

function openAutoFitDialog(entries) {
  // Map worn wardrobe entries to display items: manifest label/category when known, else derived
  // from the file name; the slot string (e.g. "crown (baked)") shown next to the label.
  autoFitDialogItems = entries.map((e) => {
    const base = e.name.replace(/-fitted\.glb$/i, '.glb');
    const man = sharedGearEntries.find((m) => m.file === e.name) || sharedGearEntries.find((m) => m.file === base);
    return {
      label: man ? man.label : gearEntryLabel({ file: e.name }),
      category: man ? man.category : deriveGearCategory(e.name),
      slot: e.slot,
      entry: e,
    };
  });
  const dlg = document.getElementById('autoFitDialog');
  if (!dlg) return;
  dlg.hidden = false;
  const f = document.getElementById('afDialogFilter');
  if (f) f.value = '';
  renderAutoFitDialog();
  if (f) f.focus();
}

function closeAutoFitDialog() {
  const dlg = document.getElementById('autoFitDialog');
  if (dlg) dlg.hidden = true;
}

/** Re-render the picker list against its own search box — grouped by category so a full rack
 * stays browsable; each row is a big button that re-seats that piece. */
function renderAutoFitDialog() {
  const list = document.getElementById('afDialogList');
  if (!list) return;
  const q = (document.getElementById('afDialogFilter').value || '').trim().toLowerCase();
  const visible = autoFitDialogItems.filter((it) =>
    !q || it.label.toLowerCase().includes(q) || it.entry.name.toLowerCase().includes(q));
  list.replaceChildren();
  if (!visible.length) {
    const p = document.createElement('p');
    p.className = 'wardrobe__empty';
    p.textContent = 'No gear matches that name.';
    list.appendChild(p);
    return;
  }
  GEAR_CATEGORY_ORDER.forEach((cat) => {
    const group = visible.filter((it) => it.category === cat);
    if (!group.length) return;
    const head = document.createElement('div');
    head.className = 'af-dialog__group';
    head.textContent = cat;
    list.appendChild(head);
    group.forEach((it) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'af-dialog__row';
      row.textContent = it.label + '  ·  ' + it.slot;
      row.title = it.entry.name;
      row.addEventListener('click', () => {
        closeAutoFitDialog();
        autoFitWornEntry(it.entry);
      });
      list.appendChild(row);
    });
  });
}

function promptAutoFit() {
  if (!wardrobe.length) { // belt-and-braces: the button is disabled when bare, but guard anyway
    showHudMessage('No gear on the champion yet — use Try on or Load gear first.');
    return;
  }
  // ONE worn piece -> fit it, no question (2026-08-25 rule); several -> ask which one.
  if (wardrobe.length === 1) { autoFitWornEntry(wardrobe[0]); return; }
  openAutoFitDialog(wardrobe.slice());
}

(function wireAutoFitButton() {
  const btn = document.getElementById('autoFitBtn');
  if (btn) btn.addEventListener('click', promptAutoFit);
  const closeBtn = document.getElementById('afDialogClose');
  if (closeBtn) closeBtn.addEventListener('click', closeAutoFitDialog);
  const cancelBtn = document.getElementById('afDialogCancel');
  if (cancelBtn) cancelBtn.addEventListener('click', closeAutoFitDialog);
  const filter = document.getElementById('afDialogFilter');
  if (filter) filter.addEventListener('input', renderAutoFitDialog);
  // Esc closes the picker (never conflicts with the tutorial — it guards its own Esc handler).
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const dlg = document.getElementById('autoFitDialog');
    if (dlg && !dlg.hidden) { closeAutoFitDialog(); e.preventDefault(); }
  });
})();

(function loadSharedGearShelf() {
  const shelf = document.getElementById('assetGearList');
  if (!shelf) return;
  const filter = document.getElementById('assetGearFilter');
  if (filter) {
    filter.addEventListener('input', () => { sharedGearQuery = filter.value; renderSharedGearShelf(); });
  }
  // COLLAPSE (2026-08-25): the shelf folds to its header row — the caret + count tell what is
  // inside, and the state persists for the session so a student who closed it stays tidy.
  const toggle = document.getElementById('tryOnToggle');
  const body = document.getElementById('assetGearBody');
  if (toggle && body) {
    try { toggle.setAttribute('aria-expanded', String(!body.hidden)); } catch (err) { /* noop */ }
    toggle.addEventListener('click', () => {
      const willOpen = body.hidden;
      body.hidden = !willOpen;
      toggle.setAttribute('aria-expanded', String(willOpen));
      const caret = toggle.querySelector('.hud__section-caret');
      if (caret) caret.textContent = willOpen ? '▾' : '▸';
    });
  }
  // ?m= busts the browser's heuristic cache: static hosts send no cache headers, and a stale
  // manifest would hide newly published gear until a hard refresh. ~1 KB, fetched once per load.
  fetch('./assets/gear/manifest.json?m=' + Date.now())
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
    .then((names) => {
      if (!Array.isArray(names) || !names.length) throw new Error('empty manifest');
      // Strings (old manifest) normalize to {file}; objects keep their label/category/slot.
      // `slot` is the art-plan slot (crown/eye/visor/temples/…, spec §3) — the taxonomy key that
      // seats DIFFERENT pieces at DISTINCT positions so they coexist without overlapping; it was
      // added 2026-08-27 so un-baked pieces stop defaulting to the eye slot. Pieces never evict
      // each other (slot is for seating, not exclusivity).
      sharedGearEntries = names.map((n) =>
        typeof n === 'string'
          ? { file: n, label: gearEntryLabel({ file: n }), category: deriveGearCategory(n) }
          : { file: n.file, label: gearEntryLabel(n), category: n.category || deriveGearCategory(n.file), slot: n.slot });
      renderSharedGearShelf();
    })
    .catch(() => {
      const p = document.createElement('p');
      p.className = 'wardrobe__empty';
      p.textContent = 'No shared gear yet (assets/gear/manifest.json).';
      shelf.appendChild(p);
    });
})();
// The viewer link WAITS for any in-flight wardrobe save (see whenWardrobeSynced) — otherwise a
// fitter who adds a big piece and immediately clicks through watches a stale wardrobe dance.
// It also blocks while a try-on fetch/parse is in flight — an early switch would silently drop
// the in-flight piece (2026-08-26).
const viewerLink = document.getElementById('viewerLink');
if (viewerLink) viewerLink.addEventListener('click', (e) => {
  if (tryOnInFlight.size) {
    e.preventDefault();
    showHudMessage('Gear is still loading — wait for it to finish, then open the viewer.');
    return;
  }
  if (!storeSyncBusy && !storeSyncQueued) return; // store already current — plain navigation
  e.preventDefault();
  showHudMessage('Saving the wardrobe for the viewer…');
  whenWardrobeSynced().then(() => { window.location.href = viewerLink.href; });
});

['fitMove', 'fitRotate', 'fitScale'].forEach((id) => {
  document.getElementById(id).addEventListener('click', () => setGizmoMode(document.getElementById(id).dataset.fitMode));
});
document.getElementById('fitDone').addEventListener('click', () => setGizmoMode(null));
document.getElementById('fitDownload').addEventListener('click', downloadFittedGear);
const btnDressedDownload = document.getElementById('btnDressedDownload');
if (btnDressedDownload) btnDressedDownload.addEventListener('click', downloadDressedChampion);
window.addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  if (!loadedGearProp) return;
  const k = e.key.toLowerCase();
  if (k === 'g') setGizmoMode('translate');
  else if (k === 'r') setGizmoMode('rotate');
  else if (k === 's') setGizmoMode('scale');
  else if (k === 'escape') setGizmoMode(null);
});

const fileInput = document.getElementById('fileInput');
fileInput.addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  readFileAsGLB(file);
});

const dropZone = document.getElementById('dropZone');
['dragenter', 'dragover'].forEach((evt) => {
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropZone.classList.add('is-dragover');
  });
});
['dragleave', 'dragend', 'drop'].forEach((evt) => {
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropZone.classList.remove('is-dragover');
  });
});
dropZone.addEventListener('drop', (e) => {
  const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  readFileAsGLB(file);
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  if (dropZone.contains(e.target)) return;
  e.preventDefault();
  const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (file) readFileAsGLB(file);
});

// ---------------------------------------------------------------------------------------------
// 2D LOOK controls — the reason this page exists.
// ---------------------------------------------------------------------------------------------

const posterizeSlider = document.getElementById('posterizeSlider');
const posterizeVal = document.getElementById('posterizeVal');
const POSTERIZE_LABELS = { 0: 'off', 1: '8', 2: '6', 3: '4', 4: '3' };
posterizeSlider.addEventListener('input', () => {
  const level = Number(posterizeSlider.value);
  applyPosterizeLevel(level);
  posterizeVal.textContent = POSTERIZE_LABELS[level];
});

const btnCamera = document.getElementById('btnCamera');
btnCamera.addEventListener('click', () => {
  const next = cameraKind === 'persp' ? 'ortho' : 'persp';
  setCameraKind(next);
  btnCamera.textContent = next === 'ortho' ? 'Flat (2D)' : 'Perspective';
  btnCamera.classList.toggle('hud__btn--active', next === 'ortho');
});

const btnFlatAlbedo = document.getElementById('btnFlatAlbedo');
btnFlatAlbedo.addEventListener('click', () => {
  const next = !flatAlbedo;
  applyFlatAlbedo(next);
  btnFlatAlbedo.textContent = next ? 'Texture: OFF (flat)' : 'Texture: on';
  btnFlatAlbedo.classList.toggle('hud__btn--active', next);
});

const btnFlatLight = document.getElementById('btnFlatLight');
btnFlatLight.addEventListener('click', () => {
  const next = !flatLight;
  setFlatLight(next);
  btnFlatLight.textContent = next ? 'Lights: ambient + key' : 'Lights: hemi + rim';
  btnFlatLight.classList.toggle('hud__btn--active', next);
});

const bandSlider = document.getElementById('bandSlider');
const bandVal = document.getElementById('bandVal');
bandSlider.addEventListener('input', () => {
  const n = Number(bandSlider.value);
  applyBandCount(n);
  bandVal.textContent = String(n);
});

const ambientSlider = document.getElementById('ambientSlider');
const ambientVal = document.getElementById('ambientVal');
ambientSlider.addEventListener('input', () => {
  const t = Number(ambientSlider.value);
  applyAmbientKey(t);
  ambientVal.textContent = t.toFixed(2);
});
// Apply the HUD's stated default once at startup so the lighting matches what the slider shows.
applyAmbientKey(Number(ambientSlider.value));

const outlineThicknessSlider = document.getElementById('outlineThicknessSlider');
const outlineThicknessVal = document.getElementById('outlineThicknessVal');
outlineThicknessSlider.addEventListener('input', () => {
  const n = Number(outlineThicknessSlider.value);
  applyOutlineThicknessMultiplier(n);
  outlineThicknessVal.textContent = String(n);
});
// Push the HUD's stated default onto outlines built during startup, before this wiring ran —
// without this the slider reads 10 while the stand-in is still outlined at whatever the variable
// was initialised to, and the page lies about what it is showing.
applyOutlineThicknessMultiplier(Number(outlineThicknessSlider.value));

// ---------------------------------------------------------------------------------------------
// RAF loop — all timing derives from the RAF timestamp argument, never Date.now().
// ---------------------------------------------------------------------------------------------

let lastTimestamp = null;
let elapsed = 0;
let fpsSmoothed = 0;
const fpsEl = document.getElementById('fps');
const clock = { delta: 0 };

function raf(timestamp) {
  if (lastTimestamp == null) lastTimestamp = timestamp;
  const deltaMs = timestamp - lastTimestamp;
  lastTimestamp = timestamp;
  const delta = Math.min(deltaMs / 1000, 0.1);
  elapsed += delta;
  clock.delta = delta;

  if (activeIsStandIn) {
    animateStandIn(standIn.nodes, standIn.baseHipY, mode, elapsed);
  } else if (mixer) {
    mixer.update(delta);
  }

  controls.update();
  renderer.render(scene, camera);

  if (deltaMs > 0) {
    const instantFps = 1000 / deltaMs;
    fpsSmoothed = fpsSmoothed === 0 ? instantFps : fpsSmoothed * 0.9 + instantFps * 0.1;
    fpsEl.textContent = Math.round(fpsSmoothed) + ' fps';
  }

  requestAnimationFrame(raf);
}
requestAnimationFrame(raf);

// Expose internals for the Playwright verification pass (screenshots + state assertions) without
// changing the module's public surface for real users. Mirrors main.js's window.__champion3d.
window.__champion3d = {
  setMode,
  toggleOutline: () => btnOutline.click(),
  socketGear: () => btnGear.click(),
  get mode() { return mode; },
  get outlinesOn() { return outlinesOn; },
  get gearSocketed() { return gearSocketed; },
  get activeIsStandIn() { return activeIsStandIn; },
  // 2D-look-specific state, for the tuning page's own verification pass.
  get posterizeLevel() { return currentPosterizeLevel; },
  get cameraKind() { return cameraKind; },
  get bandCount() { return gradientMap.image.width; },
  get outlineThicknessMultiplier() { return outlineThicknessMultiplier; },
};

// ---------------------------------------------------------------------------------------------
// INTRO TUTORIAL — RPG-style: on load the page asks whether the student wants a tour (their
// choice every session — no naggy persistence); a Yes walks through every HUD section with a
// spotlight ring on the REAL buttons, not a picture of them. Skippable at any moment (Skip /
// Esc), reopenable from the HUD's Tutorial button. Leaving the tour restores the studio exactly
// as it was — the fit panel this tour force-shows for two steps remembers whether it was hidden.
// ---------------------------------------------------------------------------------------------

const TUTORIAL_STEPS = [
  {
    title: 'Welcome to the Tune Studio',
    text: 'This is where you fit gear onto the champion. I will show you every button — press Next to follow along, or Skip to start fitting right away.',
    center: true,
  },
  {
    title: 'Try on — shared gear',
    target: '#tryOnSection',
    text: 'These are pieces the team already fitted. One tap on a row puts it on the champion instantly, so you can see how it looks before you make anything.',
  },
  {
    title: 'Your gear',
    target: '#loadSection',
    text: 'Bring your own piece — GLB, FBX or OBJ. If its textures are separate files, select them together with the model in the same pick.',
  },
  {
    title: 'Wardrobe — worn now',
    target: '#wardrobeSection',
    text: 'Everything you fit stays worn, all at once. Tap a row to select a piece, tap x to take it off. The wardrobe saves itself as you go.',
  },
  {
    title: 'Fit the selected piece',
    target: '#fitSection',
    forceShow: ['#fitSection'], // hidden until a piece is selected — show it so the tour can point at it
    text: 'Move, Rotate and Scale place the piece — or press G, R, S. Scale keeps proportions; hold Shift to stretch on purpose. Tap Done when it sits right.',
  },
  {
    title: 'Download fitted GLB',
    target: '#fitDownload',
    forceShow: ['#fitSection'],
    text: 'This saves the piece with its fit baked in — it loads pre-fitted on any champion. That file is what you share with the team.',
  },
  {
    title: 'See it move — Animation viewer',
    target: '#viewerLink',
    text: 'Open the Animation viewer to watch the champion dance with everything you fitted. It wears the SAME wardrobe, so switch pages freely — nothing is lost.',
  },
  {
    title: 'In the viewer — clips & motion capture',
    text: 'The viewer plays clips — Idle, Walk, Wave, Silly, Rumba — and rests back on Idle after each one. The "Mirror me (camera)" button makes the champion copy YOUR moves: record up to 15 seconds and download your take as a clip!',
    center: true,
  },
  {
    title: "You're ready!",
    text: 'Every change is saved as you fit, and the champion wears it all. Press Tutorial in the top bar any time to see this tour again. Have fun!',
    center: true,
  },
];

const tut = {
  root: document.getElementById('tutorialRoot'),
  start: document.getElementById('tutStart'),
  dialog: document.getElementById('tutDialog'),
  spot: document.getElementById('tutSpot'),
  title: document.getElementById('tutTitle'),
  text: document.getElementById('tutText'),
  next: document.getElementById('tutNext'),
  back: document.getElementById('tutBack'),
  skip: document.getElementById('tutSkip'),
  progress: document.getElementById('tutProgress'),
};
let tutStep = 0;
let tutOpen = false;
/** HUD sections the tour force-shows (e.g. the fit panel). Each entry remembers whether the
 * section was hidden BEFORE, so leaving the tour restores it exactly (reopening mid-session
 * with gear selected must not hide a fit panel the user already had open). */
const tutForceShown = [];

// ---------------------------------------------------------------------------------------------
// VOICE (TTS) for the tour cards (2026-08-25) — the tutorial text box reads itself aloud when
// the student turns Voice on: speechSynthesis with a kid-friendly English voice (a beat slower,
// a touch brighter), the current card re-read on every step change, cancelled on exit. Pure
// best-effort: a device without speechSynthesis (or with no installed voices) silently shows the
// text tour — narration must never be a dependency, only a layer on top (two-channel rule).
// ---------------------------------------------------------------------------------------------

const TTS_PREF_KEY = 'champion-studio-tts';
// ROBOT PROSODY (2026-08-25): the tour reads in a mechanical register — a low, steady pitch base
// with each SENTENCE stepping to a slightly different pitch (the classic synthesized-sequencer
// cadence, HAL-ish rather than "Microsoft Sam karaoke"), plus a square-wave boop when the robot
// starts talking and a closing blip when the card is done. The voice itself is still the best
// installed one, with novelty robot-named voices preferred when the OS ships them.
const TTS_RATE = 0.9;         // steady, deliberate — robots don't rush
const TTS_PITCH_BASE = 0.72;  // low robot register
const TTS_PITCH_SWING = 0.12; // mechanical step between sentences (0 / + / -)

let ttsEnabled = false;
let ttsVoiceCache = null;
try { ttsEnabled = localStorage.getItem(TTS_PREF_KEY) === '1'; } catch (err) { /* private mode — voice starts off */ }

/** Split a card's text into sentences so each can carry its own pitch step. A sentence is
 * maximal run of non-terminators plus its terminator ("Hi there! Next." -> ["Hi there!", "Next."]). */
function splitSentences(text) {
  const m = String(text).match(/[^.!?]+[.!?]*/g);
  return (m || [String(text)]).map((s) => s.trim()).filter(Boolean);
}

/** A short square-wave blip — the robot's audio "mouth". Lazily-created AudioContext; square
 * wave because that is the classic robot tone. Pure decoration: throws/catches stay silent.
 * @param {number} freq - start frequency (Hz); swept down ~25% over the blip
 * @param {number} dur - seconds
 * @param {number} gain - 0..1, kept low so the blip never barks over the speech
 */
function robotBeep(freq, dur, gain) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!ttsBeepCtx) ttsBeepCtx = new AC();
    if (ttsBeepCtx.state === 'suspended') ttsBeepCtx.resume();
    const osc = ttsBeepCtx.createOscillator();
    const g = ttsBeepCtx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, ttsBeepCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.75, ttsBeepCtx.currentTime + dur);
    g.gain.setValueAtTime(gain, ttsBeepCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ttsBeepCtx.currentTime + dur);
    osc.connect(g);
    g.connect(ttsBeepCtx.destination);
    osc.start();
    osc.stop(ttsBeepCtx.currentTime + dur);
  } catch (err) { /* a device that refuses audio stays silent — speech is the feature */ }
}
let ttsBeepCtx = null; // lazily created on the first user-gesture speak; never closed (short session)

/** Pick the most robotic installed voice: novelty robot/alien voices first (macOS Zarvox /
 * Trinoids / Cellos / Bad News / Ralph, etc.), then a named natural English voice, then any
 * English voice. NO English voice at all -> null, so the utterance uses the browser's DEFAULT
 * voice (which is the one that can actually read English) rather than a random foreign one.
 * getVoices() can return [] until the 'voiceschanged' event fires — hence the cache + listener. */
function ttsPickVoice() {
  if (!('speechSynthesis' in window)) return null;
  try {
    const voices = window.speechSynthesis.getVoices();
    if (!voices || !voices.length) return ttsVoiceCache;
    const en = voices.filter((v) => /^en/i.test(v.lang));
    ttsVoiceCache = en.find((v) => /robot|zarvox|trinoid|cellos|bad news|ralph|junior|pipe|whisper/i.test(v.name))
      || en.find((v) => /google us english|samantha|aria|zira|jenny|natural|premium/i.test(v.name))
      || en[0]
      || null;
  } catch (err) { /* no voice list — fall through to cache */ }
  return ttsVoiceCache;
}
if ('speechSynthesis' in window && typeof window.speechSynthesis.addEventListener === 'function') {
  window.speechSynthesis.addEventListener('voiceschanged', ttsPickVoice);
}

function ttsSupported() {
  return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

function ttsSpeak(text) {
  if (!ttsEnabled || !ttsSupported()) return;
  const sentences = splitSentences(text);
  if (!sentences.length) return;
  try {
    window.speechSynthesis.cancel();
    // Chrome famously drops the FIRST utterance spoken right after cancel() — a 60 ms gap makes
    // the queued robot sentences land reliably. Re-check inside: the student may have flipped
    // Voice off (or advanced cards) in the gap, and a second speak() may have queued its own
    // timer — cancel again here so the two can never interleave.
    setTimeout(() => {
      try {
        if (!ttsEnabled) return;
        window.speechSynthesis.cancel();
        const v = ttsPickVoice();
        const pitchSteps = [0, TTS_PITCH_SWING, -TTS_PITCH_SWING];
        sentences.forEach((s, i) => {
          const u = new SpeechSynthesisUtterance(s);
          if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = 'en-US'; }
          u.rate = TTS_RATE;
          u.pitch = Math.max(0, Math.min(2, TTS_PITCH_BASE + pitchSteps[i % pitchSteps.length]));
          if (i === sentences.length - 1) {
            u.onend = () => robotBeep(880, 0.06, 0.02); // the closing blip when the card is done
          }
          window.speechSynthesis.speak(u);
        });
      } catch (err) { /* best-effort — a device that throws on TTS stays silent */ }
    }, 60);
    robotBeep(520, 0.09, 0.035); // the robot's "I'm talking" boop, right now
  } catch (err) {
    // A device that throws on TTS degrades to the silent text tour — never crash the tutorial.
  }
}

function ttsStop() {
  if (!ttsSupported()) return;
  try { window.speechSynthesis.cancel(); } catch (err) { /* best-effort */ }
}

/** Turn narration on/off, persist the choice, sync the Voice button, and optionally speak the
 * current card immediately (turning ON mid-tour reads the card that is on screen). */
function ttsSetEnabled(on, speakNow) {
  ttsEnabled = !!on;
  try { localStorage.setItem(TTS_PREF_KEY, on ? '1' : '0'); } catch (err) { /* private mode */ }
  const btn = document.getElementById('tutVoice');
  if (btn) {
    btn.textContent = on ? 'Voice: on' : 'Voice: off';
    btn.setAttribute('aria-pressed', String(on));
    btn.title = on ? 'Mute the tour narration' : 'Read the tour cards aloud';
  }
  if (on && speakNow) {
    const t = document.getElementById('tutText');
    if (t) ttsSpeak(t.textContent);
  } else if (!on) {
    ttsStop();
  }
}
ttsSetEnabled(ttsEnabled, false); // sync the button label with the saved preference at startup

const btnTutVoice = document.getElementById('tutVoice');
if (btnTutVoice) btnTutVoice.addEventListener('click', () => {
  const nowOn = !ttsEnabled;
  ttsSetEnabled(nowOn, nowOn); // turning ON reads the current card immediately
});

function tutRestoreForcedSections() {
  while (tutForceShown.length) {
    const f = tutForceShown.pop();
    if (f.el) f.el.hidden = f.wasHidden;
  }
}

/** Position the spotlight ring over the current step's target section, or hide it (steps with
 * no target — pure-welcome cards — get no ring). Re-measured on resize. */
function tutPositionSpotlight() {
  const step = TUTORIAL_STEPS[tutStep];
  const el = step.target ? document.querySelector(step.target) : null;
  if (!el || el.hidden || getComputedStyle(el).display === 'none') { tut.spot.hidden = true; return; }
  const r = el.getBoundingClientRect();
  tut.spot.hidden = false;
  tut.spot.style.left = (r.left - 6) + 'px';
  tut.spot.style.top = (r.top - 6) + 'px';
  tut.spot.style.width = (r.width + 12) + 'px';
  tut.spot.style.height = (r.height + 12) + 'px';
}

function tutRenderStep() {
  const step = TUTORIAL_STEPS[tutStep];
  tut.title.textContent = step.title;
  tut.text.textContent = step.text;
  if (ttsEnabled) ttsSpeak(tut.text.textContent); // Voice ON: each new card reads itself aloud
  tut.progress.textContent = (tutStep + 1) + ' / ' + TUTORIAL_STEPS.length;
  tut.back.disabled = tutStep === 0;
  tut.next.textContent = tutStep === TUTORIAL_STEPS.length - 1 ? 'Finish' : 'Next';

  // Restore sections the previous step force-showed, then apply this step's.
  tutRestoreForcedSections();
  (step.forceShow || []).forEach((sel) => {
    const el = document.querySelector(sel);
    if (el) { tutForceShown.push({ el, wasHidden: el.hidden }); el.hidden = false; }
  });

  if (step.target) {
    const el = document.querySelector(step.target);
    // Instant scroll (not smooth) so the spotlight measures the FINAL position right away.
    if (el) el.scrollIntoView({ block: 'center', inline: 'nearest' });
  }
  tutPositionSpotlight();
  tut.next.focus();
}

function tutShowTutorial(on) {
  tut.root.hidden = !on;
  tutOpen = on;
}

function tutShowStartPrompt(on) {
  tut.start.hidden = !on;
  tut.dialog.hidden = on;
}

/** Begin the walkthrough at step 1 (the HUD's Tutorial button path). */
function tutStartTour() {
  tutToastHide();
  tutStep = 0;
  tutShowTutorial(true);
  tutShowStartPrompt(false);
  tutRenderStep();
}

/**
 * Leave the tour and restore the studio exactly as it was. When the student DECLINED the tour
 * (No / Skip / Esc — remind=true) a brief toast points at the Tutorial button; completing the
 * tour (Finish) needs no reminder — the last card already said it.
 * @param {boolean} remind - show the skip-reminder toast
 */
function tutClose(remind) {
  ttsStop(); // leaving the tour always silences the narration
  tutRestoreForcedSections();
  tut.spot.hidden = true;
  tutShowTutorial(false);
  tutStep = 0;
  if (remind) tutShowReminderToast();
}

function tutNextStep() {
  if (tutStep < TUTORIAL_STEPS.length - 1) { tutStep += 1; tutRenderStep(); }
  else tutClose(false);
}

function tutPrevStep() {
  if (tutStep > 0) { tutStep -= 1; tutRenderStep(); }
}

// ---------------------------------------------------------------------------------------------
// SKIP-REMINDER TOAST — a small non-blocking pill after the student declines the tour. It both
// reminds them WHERE the tour lives (the Tutorial button) and IS a reopen button itself.
// ---------------------------------------------------------------------------------------------

const tutToast = document.getElementById('tutToast');
let tutToastTimer = null;

function tutToastHide() {
  clearTimeout(tutToastTimer);
  if (tutToast) tutToast.hidden = true;
}

/** Show the pill for 8 seconds. A second decline just restarts the timer — never stacks. */
function tutShowReminderToast() {
  if (!tutToast || tutOpen) return;
  tutToast.hidden = false;
  clearTimeout(tutToastTimer);
  tutToastTimer = setTimeout(() => { tutToast.hidden = true; }, 8000);
}
if (tutToast) tutToast.addEventListener('click', () => { tutToast.hidden = true; tutStartTour(); });

document.getElementById('tutYes').addEventListener('click', () => {
  tutMarkAsked();
  // A kid who accepts the tour almost certainly wants it read to them — default Voice ON for
  // the first-timer path (the Tutorial button later honours the saved preference).
  ttsSetEnabled(true, false);
  tutStartTour();
});
document.getElementById('tutNo').addEventListener('click', () => { tutMarkAsked(); tutClose(true); });
document.getElementById('tutNext').addEventListener('click', tutNextStep);
document.getElementById('tutBack').addEventListener('click', tutPrevStep);
document.getElementById('tutSkip').addEventListener('click', () => tutClose(true));
document.getElementById('btnTutorial').addEventListener('click', tutStartTour);

// RPG dialogs answer the keyboard too — arrows walk the tour, Escape leaves it.
window.addEventListener('keydown', (e) => {
  if (!tutOpen) return;
  if (e.key === 'ArrowRight') { e.preventDefault(); tutNextStep(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); tutPrevStep(); }
  else if (e.key === 'Escape') { e.preventDefault(); tutClose(true); }
});

window.addEventListener('resize', tutPositionSpotlight);

// ---------------------------------------------------------------------------------------------
// ONCE PER BROWSER SESSION — the "want a tour?" prompt is per-tab sessionStorage, not per load:
// switching between the studio and the Animation viewer in the same tab must never re-ask; a
// freshly opened tab asks again. The flag is set on the student's ANSWER (Yes or No), so a full
// tour + later Skips never re-prompt mid-session either. try/catch: sessionStorage can throw in
// private-browsing modes, where falling back to "ask every load" is acceptable.
// ---------------------------------------------------------------------------------------------

const TUT_SESSION_KEY = 'champion-studio-tutorial-asked';

function tutAskedThisSession() {
  try { return sessionStorage.getItem(TUT_SESSION_KEY) === '1'; } catch (err) { return false; }
}

function tutMarkAsked() {
  try { sessionStorage.setItem(TUT_SESSION_KEY, '1'); } catch (err) { /* private mode — ask again next load */ }
}

if (!tutAskedThisSession()) {
  tutShowTutorial(true);
  tutShowStartPrompt(true);
  document.getElementById('tutYes').focus();
}

// Test surface for the Playwright verification pass, mirroring window.__champion3d.
window.__tutorial = {
  startTour: tutStartTour,
  next: tutNextStep,
  back: tutPrevStep,
  skip: () => tutClose(true),
  get step() { return tutStep; },
  get open() { return tutOpen; },
  get onStartPrompt() { return tutOpen && !tut.start.hidden; },
  get asked() { return tutAskedThisSession(); },
  get toastVisible() { return !!(tutToast && !tutToast.hidden); },
  // VOICE (TTS): the verification pass can toggle narration and probe what the button says.
  setTts(on) { ttsSetEnabled(!!on, !!on); },
  speak(text) { ttsSpeak(text); },
  get ttsOn() { return ttsEnabled; },
  get voiceSupported() { return ttsSupported(); },
  spotBox() {
    if (tut.spot.hidden) return null;
    const r = tut.spot.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  },
};

// Fit-state test surface (2026-08-25) — lets the verification pass assert WHERE auto-fitted
// gear actually landed (world bbox vs socket-bone position), which a screenshot cannot.
window.__studio = {
  /** One entry per worn piece: slot claims + world-space bbox + local transform. */
  entries() {
    return wardrobe.map((e) => {
      e.group.updateWorldMatrix(true, true);
      const b = new THREE.Box3().setFromObject(e.group);
      return {
        name: e.name,
        slot: e.slot,
        slotKey: e.slotKey,
        pos: e.group.position.toArray(),
        scale: e.group.scale.toArray(),
        quat: e.group.getWorldQuaternion(new THREE.Quaternion()).toArray(),
        parentBone: e.group.parent ? e.group.parent.name : null,
        bboxMin: b.min.toArray(),
        bboxMax: b.max.toArray(),
        parseDiameter: e.group.userData.parseDiameter || null,
        parseFactor: e.group.userData.parseFactor || null,
      };
    });
  },
  /** World position of a socket bone (null when the champion lacks that bone). */
  bone(name) {
    const t = findFitSocketTarget(name);
    return t ? t.getWorldPosition(new THREE.Vector3()).toArray() : null;
  },
  /** World QUATERNION of a socket bone (null when the champion lacks that bone) — lets the
   * verification pass tell WHERE the bone's local axes point (a leg bone tilted 56° explains
   * why a piece whose local -Z is "behind" renders in front of the body). */
  boneQuat(name) {
    const t = findFitSocketTarget(name);
    return t ? t.getWorldQuaternion(new THREE.Quaternion()).toArray() : null;
  },
  /** World SCALE of a socket bone — the auto-fit size correction divides by this. */
  boneScale(name) {
    const t = findFitSocketTarget(name);    if (!t) return null;
    const s = new THREE.Vector3();
    t.getWorldScale(s);
    return s.toArray();
  },
  get champion() {
    return { height: modelHeight, crown: modelCrown ? modelCrown.toArray() : null };
  },
  /** True once the pristine (un-toonified) champion is captured — the export source for the
   * dressed-champion download. Lets the verification pass wait before clicking Download. */
  get championReady() { return !!championPristine; },
  /** Diagnostic: re-measure ONE worn piece's raw box the way adoptGearScene does (setFromObject
   * on the RAW scene incl. outlines) vs. its visible-mesh box — used to verify the auto-fit
   * sizing math, which must use the VISIBLE box (invisible helper meshes inflate setFromObject). */
  probeBox(name) {
    const e = wardrobe.find((x) => x.name === name);
    if (!e) return null;
    const raw = e.group.userData.rawScene || e.group;
    raw.updateWorldMatrix(true, true);
    const full = new THREE.Box3().setFromObject(raw);
    const vis = new THREE.Box3();
    raw.traverse((o) => {
      if (!o.isMesh || o.visible === false || !o.geometry) return;
      o.geometry.computeBoundingBox();
      vis.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));
    });
    const sphere = new THREE.Sphere();
    full.getBoundingSphere(sphere);
    const toA = (b) => ({ min: b.min.toArray().map((v) => +v.toFixed(4)), max: b.max.toArray().map((v) => +v.toFixed(4)), diag: +b.getSize(new THREE.Vector3()).length().toFixed(4) });
    return { full: toA(full), visible: toA(vis), sphereDiameter: +(sphere.radius * 2).toFixed(4), propScale: +e.group.scale.x.toFixed(4) };
  },
  /** GROUND-TRUTH mesh dump (2026-08-27): per-mesh LOCAL geometry bounds, the mesh's own
   * position-attribute min/max, its node-local TRS, and its WORLD box — used to debug why a
   * piece renders where it does (GLB nodes can carry rotations/scales that the accessor
   * min/max don't show). */
  meshTruth(name) {
    const e = wardrobe.find((x) => x.name === name);
    if (!e) return null;
    const raw = e.group.userData.rawScene || e.group;
    raw.updateWorldMatrix(true, true);
    const out = [];
    raw.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      o.geometry.computeBoundingBox();
      const attr = o.geometry.attributes.position;
      let amin = null, amax = null;
      if (attr && attr.count) {
        amin = [Infinity, Infinity, Infinity];
        amax = [-Infinity, -Infinity, -Infinity];
        for (let i = 0; i < attr.count; i += Math.max(1, Math.floor(attr.count / 30000))) {
          for (let c = 0; c < 3; c++) {
            const v = attr.getX(i, c);
            if (v < amin[c]) amin[c] = v;
            if (v > amax[c]) amax[c] = v;
          }
        }
        amin = amin.map((v) => +v.toFixed(3));
        amax = amax.map((v) => +v.toFixed(3));
      }
      const box = o.geometry.boundingBox;
      const wb = new THREE.Box3().setFromObject(o);
      out.push({
        name: o.name,
        posAttrMin: amin,
        posAttrMax: amax,
        geomBoxMin: box.min.toArray().map((v) => +v.toFixed(3)),
        geomBoxMax: box.max.toArray().map((v) => +v.toFixed(3)),
        nodePos: o.position.toArray().map((v) => +v.toFixed(3)),
        nodeQuat: o.quaternion.toArray().map((v) => +v.toFixed(3)),
        nodeScale: o.scale.toArray().map((v) => +v.toFixed(3)),
        worldBoxMin: wb.min.toArray().map((v) => +v.toFixed(3)),
        worldBoxMax: wb.max.toArray().map((v) => +v.toFixed(3)),
      });
    });
    return out;
  },
  /** UNDO / REDO / RESTORE (2026-08-25) — drive the safety net from the verification pass. */
  undo,
  redo,
  restore: restoreWardrobeFromStore,
  get undoCount() { return undoStack.length; },
  get redoCount() { return redoStack.length; },
  /** DRESSED EXPORT (2026-08-27; skinned 2026-08-29) — test surface: resolves with the
   * dressed-champion GLB buffer so the verification pass can assert size and parse the JSON
   * chunk (SKELETON KEPT — skins:1 with 41 Mixamo joints, gear meshes as bone children,
   * no championFit extras, feet grounded at y=0). */
  dressedBuffer: bakeDressedChampion,
};

// ---------------------------------------------------------------------------------------------
// STATIC-DEPLOY AUTOLOAD — appended by the bundler, not present in the repo source.
//
// Same rationale as viewer.html's appendix: deployed over HTTP(S) the page can fetch its own
// base champion, so a teammate opens the URL and only ever touches "Load gear GLB". Fitting is
// a REST-POSE activity (fits are authored against the T-pose; gear attaches before any clip
// fires), so unlike the viewer this page deliberately loads NO clips and NO gear — the gear is
// whatever the teammate brings.
// ---------------------------------------------------------------------------------------------
(async function autoloadChampionBase() {
  const BASE = './assets/champion-base.glb';
  const hud = document.getElementById('hudMessage');
  const say = (m) => { if (hud) hud.textContent = m; };
  const progress = progressUI(); // the 24 MB base gets a real progress bar now (progress.js)

  // Hide the capsule stand-in while the real base arrives; it returns only on failure, where it
  // once again truthfully means "nothing is loaded — use the fallback file picker".
  const standInRoot = (typeof standIn !== 'undefined' && standIn && standIn.root) || null;
  if (standInRoot) standInRoot.visible = false;

  try {
    say('Loading base champion…');
    progress.show('Loading champion', 0);
    const buffer = await fetchWithProgress(BASE, (p) => progress.show('Loading champion', p));
    loadGLBFromArrayBuffer(buffer, 'champion-base.glb');
    // The FETCH is done, but GLTF parse + texture decode of a 24 MB base takes a moment — keep
    // the bar up (indeterminate) until the model actually appears, then hide it. Polls the same
    // flag the verification pass uses; the timeout keeps a failed parse from hanging the bar.
    progress.show('Loading champion', null);
    await new Promise((resolve) => {
      const started = Date.now();
      const tick = setInterval(() => {
        if (!window.__champion3d.activeIsStandIn || Date.now() - started > 30000) {
          clearInterval(tick);
          resolve();
        }
      }, 100);
    });
    progress.hide();
  } catch (err) {
    progress.hide();
    if (standInRoot) standInRoot.visible = true;
    say('Auto-load failed (' + err.message + ') — choose the champion GLB manually.');
    console.error('[autoload base]', err);
  }
})();
