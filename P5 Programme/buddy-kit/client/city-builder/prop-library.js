import { restoreActive } from '../city-common/restore-session.js';
// prop-library.js — in-scenario 3D model library + tap-to-place decorator.
//
// Reusable + buildless (copy-verbatim like skins.js / crash-guard.js). Any 3D
// scenario mounts it with ONE call and gets:
//   • a small model-library button (top-left, beside the skin/orbit toggles)
//   • a slide-out panel: categories as tabs, model cards
//   • tap-to-place: the chosen model follows the pointer on the ground (y=0),
//     tap to drop, ↻ Rotate (90° steps), ↩ Undo last, ✓ Done
//   • per-scenario localStorage persistence (device-local, no server; pointers
//     only — the GLB geometry ships with the app and is never persisted)
//
// PLACEMENT MODE takes over input via a full-screen transparent overlay that
// eats pointer events, so the host's orbit controls / building-entry raycasts
// are suppressed with ZERO host pointer-handler edits. The overlay sits above
// the canvas and below the module's own toolbar, and is removed on Done.
//
// Usage (each scenario):
//   import { mountPropLibrary } from './prop-library.js';
//   mountPropLibrary({ scene, camera, renderer,
//                      storageKey: 'hk_ai_city_props_citybuilder_v1' });
//
// Models come from the SHARED catalog (city-common/library.js) and load from
// /library/… via libraryUrl(item) — same source of truth as the scenarios.
import * as THREE from 'three';
import { createGLTFLoader } from '../shared/gltf.js';
import { t, currentLang } from './i18n.js';
import { CITY_ESSENTIALS, essentialName, essentialSearch } from '../city-common/city-essentials.js';
import { LIBRARY, LIBRARY_CATEGORIES, libraryUrl } from '../city-common/library.js';
import { LIBRARY_PACKS, libraryByPack, packForLibraryItem, packAssetState } from '../city-common/asset-packs.js';
import { vehicleTargetLength } from '../city-common/vehicle-scale.js';
import { CUSTOM_MODEL_PREFIX, customModelStore, readCustomManifest, writeCustomManifest, validateGLB } from '../city-common/custom-models.js';

// ─── Curated model library (shared catalog) ────────────────────────────────
// The city-builder's 🧰 reads the SAME catalog the scenarios use
// (city-common/library.js) — one source of truth. GLBs load from /library/.
// Each entry carries a real-world footprint/height; we scale to footprint.
const CATEGORIES = LIBRARY_CATEGORIES.map((id) => ({ id, labelKey: 'props.cat' + id[0].toUpperCase() + id.slice(1) }));

// PROPS = the shared LIBRARY (each item: id, name, emoji, glb, category, footprint, height, anchors)
const PROPS = LIBRARY;

const CAT_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
const PROP_MAP = Object.fromEntries(PROPS.map((p) => [p.id, p]));

// Soft performance warning: once a student places this many props, show a
// gentle "keep it tidy" toast. Informational only — no behaviour change below.
const PLACED_PROP_WARN = 200;

// Per-instance id counter: placed props are matched by a unique uid so moving
// one of several identical props updates THAT instance, not the first match.
let _uidSeq = 1;

// ─── Loading + normalization ───────────────────────────────────────────────
const _loader = createGLTFLoader();
const _cache = new Map();          // propId -> THREE.Group (normalized)

/** Scale a loaded model so its largest dimension fits the item's footprint/height (metres). */
function scaleToFootprint(model, item, extra) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  // Vehicles use their real-world default length (matched to the 3D city's
  // traffic cars / champion), not the small source-unit library footprint.
  const target = (item.category === 'vehicles' ? vehicleTargetLength(item) : Math.max(item.footprint[0], item.footprint[1], item.height || 1)) * (extra || 1);
  const s = target / maxDim;
  model.scale.setScalar(s);
  box.setFromObject(model);
  const cx = (box.min.x + box.max.x) / 2;
  const cz = (box.min.z + box.max.z) / 2;
  model.position.x -= cx;
  model.position.z -= cz;
  model.position.y -= box.min.y;
  return model;
}

/** Load + normalize a library GLB once, then cache it. Resolves null on failure (never throws). */
function loadProp(item) {
  const hit = _cache.get(item.id);
  if (hit) return Promise.resolve(hit);
  return new Promise((resolve) => {
    try {
      _loader.load(libraryUrl(item), (gltf) => {
        const g = gltf.scene || (gltf.scenes && gltf.scenes[0]);
        if (!g) { console.warn('[prop-library] empty model', item.id); return resolve(null); }
        g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
        scaleToFootprint(g, item, 1);
        _cache.set(item.id, g);
        resolve(g);
      }, undefined, (err) => {
        console.warn('[prop-library] load failed', item.id, err);
        resolve(null);
      });
    } catch (e) {
      console.warn('[prop-library] load error', item.id, e);
      resolve(null);
    }
  });
}

/** Deep clone a cached model for placement (shares geometry; own meshes). */
function clonePlaced(model) {
  const g = model.clone(true);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

/** Ghost preview clone — materials are CLONED so the cached model is untouched. */
function cloneGhost(model) {
  const g = model.clone(true);
  g.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = false; o.receiveShadow = false;
    if (!o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const cloned = mats.map((m) => {
      const c = m.clone();
      c.transparent = true;
      c.opacity = 0.55;
      c.depthWrite = false;
      return c;
    });
    o.material = cloned.length === 1 ? cloned[0] : cloned;
  });
  g.frustumCulled = false;
  return g;
}

// ─── Persistence (device-local) ────────────────────────────────────────────
// Keep the original section byte-for-byte until an intentional edit. Unknown
// records remain in the payload, but are never offered to the renderer.
function validRecord(r) {
  return r && typeof r === 'object' && typeof r.id === 'string'
    && ['x', 'y', 'z', 'yaw'].every(k => r[k] === undefined || (typeof r[k] === 'number' && Number.isFinite(r[k])))
    && (r.scale === undefined || (Array.isArray(r.scale) && r.scale.length === 3 && r.scale.every(n => Number.isFinite(n) && n > 0 && n <= 10000)));
}

// ─── Mount ─────────────────────────────────────────────────────────────────
export function mountPropLibrary(opts) {
  // Canonical city-builder props key. (The legacy `hk_ai_city_props_v1` key was
  // the removed per-scenario interiors store — nothing reads it today, so the
  // default never falls back to a dead/legacy key.)
  const { scene, camera, renderer, storageKey = 'hk_ai_city_props_citybuilder_v1' } = opts;
  const onPlacementStart = opts.onPlacementStart || null;
  const onPlacementEnd = opts.onPlacementEnd || null;
  const onPlaced = opts.onPlaced || null;   // (x, z) called after each drop
  const onPlacedMesh = opts.onPlacedMesh || null;   // (mesh, item) after each placed prop is created
  const onPlacementDone = opts.onPlacementDone || null;   // (lastMesh) fired once, when the child presses ✓ Done

  // State
  const state = {
    placing: false,
    panelOpen: false,
    current: null,          // { item, ghost, yaw }
    placed: [],             // ordered { uid, record, mesh }; records exist before loads
  };

  let generation = 0;
  let destroyed = false;
  let raw = null;
  let envelope = null;
  let dirty = false;
  let storageError = false;
  let unreadable = false;
  const loadModel = opts.loadModel || loadProp;
  let customManifest = readCustomManifest();
  const customModels = new Map();
  const customItem = (id) => customModels.get(id) || (() => { const m=customManifest.models.find(m => m.id === id); return m && { id: `${CUSTOM_MODEL_PREFIX}${id}`, name: m.name, emoji: '◆', category: 'prop', footprint: [4,4], height: 4, custom: true }; })();
  function itemFor(id) { return id.startsWith(CUSTOM_MODEL_PREFIX) ? customItem(id.slice(CUSTOM_MODEL_PREFIX.length)) : PROP_MAP[id]; }
  async function loadCustom(item) {
    const hit = _cache.get(item.id); if (hit) return hit;
    const saved = await customModelStore.get(item.id.slice(CUSTOM_MODEL_PREFIX.length));
    if (!saved?.bytes) return null;
    const gltf = await new Promise((resolve, reject) => _loader.parse(saved.bytes.slice(0), '', resolve, reject));
    const g = gltf.scene || gltf.scenes?.[0];
    if (!g || !g.getObjectByProperty('isMesh', true)) return null;
    g.traverse(o => { if (o.isMesh) { o.castShadow=false; o.receiveShadow=false; } });
    scaleToFootprint(g, item, 1); _cache.set(item.id, g); return g;
  }
  function loadAny(item) { return item?.custom ? loadCustom(item) : loadModel(item); }
  function snapshot() {
    if (!dirty) return raw;
    const props = state.placed.map(p => p.record);
    return JSON.stringify(Array.isArray(envelope) ? props : { ...envelope, version: envelope?.version ?? 1, props });
  }
  function persist() {
    dirty = true;
    if (restoreActive || destroyed) return false;
    try {
      localStorage.setItem(storageKey, snapshot());
      if (storageError) toastEl?.classList.remove('show');
      storageError = false;
      return true;
    } catch {
      storageError = true;
      toast(t('props.storageFailed'), true);
      return false;
    }
  }
  function removeMesh(p) {
    if (!p.mesh) return;
    try { opts.onRemovedMesh?.(p.mesh); } catch (e) { console.warn('[prop-library] unregister failed', e); }
    p.mesh.removeFromParent(); // geometry/materials belong to the shared cache
    p.mesh = null;
  }
  function clearGhost() {
    ghost.traverse(o => {
      if (o.isMesh && o.material) for (const m of (Array.isArray(o.material) ? o.material : [o.material])) m.dispose();
    });
    ghost.clear(); // only preview materials are owned; textures/geometry are shared
  }
  function project(p, model) {
    const r = p.record;
    const mesh = clonePlaced(model);
    mesh.position.set(r.x ?? 0, r.y ?? 0, r.z ?? 0);
    mesh.rotation.y = r.yaw ?? 0;
    if (r.scale) mesh.scale.fromArray(r.scale);
    mesh.userData.uid = p.uid;
    p.mesh = mesh;
    scene.add(mesh);
    try { onPlacedMesh?.(mesh, itemFor(r.id)); } catch (e) { console.warn('[prop-library] registration failed', e); }
  }
  function renderRecords() {
    const gen = ++generation;
    for (const p of state.placed) {
      removeMesh(p);
      // Validate BEFORE dereferencing: legacy/corrupt payloads can contain a
      // null or malformed record (kept verbatim for export). One bad entry must
      // never abort the whole restore.
      if (!validRecord(p.record)) {
        toast(t('props.unsupportedSaved'), true);
        continue;
      }
      const item = itemFor(p.record.id);
      if (!item) {
        toast(t('props.unsupportedSaved'), true);
        continue;
      }
      Promise.resolve().then(() => loadAny(item)).then(model => {
        if (destroyed || gen !== generation || !state.placed.includes(p)) return;
        if (!model) { toast(t('props.unsupportedSaved'), true); return; }
        project(p, model);
      }).catch(() => {
        if (!destroyed && gen === generation) toast(t('props.unsupportedSaved'), true);
      });
    }
    renderCount();
  }
  function clearAll() {
    if (destroyed || restoreActive) return;
    ++generation;
    exitPlacement();
    state.placed.forEach(removeMesh);
    state.placed = [];
    if (unreadable) { envelope = null; unreadable = false; }
    if (persist()) toast(t('props.clearedAll'));
    renderCount();
  }

  // Shared raycast bits
  const _raycaster = new THREE.Raycaster();
  const _ndc = new THREE.Vector2();
  const _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const _hit = new THREE.Vector3();

  function groundPoint(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    _ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    _raycaster.setFromCamera(_ndc, camera);
    return _raycaster.ray.intersectPlane(_groundPlane, _hit) ? _hit.clone() : null;
  }

  // ── DOM (self-contained: button, panel, toolbar, overlay, toast) ──
  const style = document.createElement('style');
  style.textContent = `
    .prop-lib-btn {
      position: fixed; top: calc(64px + env(safe-area-inset-top, 0px)); left: calc(128px + env(safe-area-inset-left, 0px)); z-index: 105;
      width: 48px; height: 48px; border-radius: 12px;
      border: 1px solid var(--panel-border, rgba(0,242,254,0.35));
      background: var(--bg, rgba(10,15,29,0.95));
      color: var(--text, #f8fafc); font-size: 22px; line-height: 1;
      cursor: pointer; box-shadow: var(--shadow, 0 8px 24px rgba(0,0,0,0.4));
      display: flex; align-items: center; justify-content: center;
      transition: transform 0.15s ease;
    }
    .prop-lib-btn:active { transform: scale(0.92); }
    .prop-lib-btn.active { border-color: var(--accent, #00f2fe); box-shadow: 0 0 12px rgba(0,242,254,0.4); }
    .prop-lib-panel {
      position: fixed; top: calc(120px + env(safe-area-inset-top, 0px)); left: calc(16px + env(safe-area-inset-left, 0px)); z-index: 105;
      width: min(360px, calc(100vw - 32px)); height: min(620px, calc(100dvh - 144px)); max-height: calc(100dvh - 144px);
      display: flex; flex-direction: column;
      background: #101b29;
      border: 1px solid var(--panel-border, rgba(0,242,254,0.35));
      border-radius: 14px; box-shadow: var(--shadow, 0 8px 24px rgba(0,0,0,0.4));
      padding: 12px; transform: translateX(calc(-100% - 24px)); opacity: 0; visibility: hidden;
      pointer-events: none; transition: transform 0.22s ease, opacity 0.22s ease;
    }
    body.prop-library-open #quest-prompt { visibility: hidden; }
    .prop-lib-panel.open { visibility: visible; transform: translateX(0); opacity: 1; pointer-events: auto; }
    .prop-lib-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .prop-lib-title { font-size: 18px; font-weight: 800; color: #f8fafc; }
    .prop-lib-close { width: 44px; height: 44px; border: 0; border-radius: 8px; background: transparent; color: #f8fafc; font-size: 24px; cursor: pointer; }
    .prop-lib-search, .prop-lib-tabs, .prop-lib-packs { width: 100%; min-height: 44px; flex-shrink: 0; padding: 10px; margin-top: 8px; border: 1px solid #41516a; border-radius: 8px; background: #182638; color: #f8fafc; font: inherit; font-size: 14px; }
    .prop-lib-search::placeholder { color: #b6c4d4; }
    .prop-lib-results { font-size: 12px; color: #b6c4d4; padding: 10px 0; }
    .prop-lib-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-auto-rows: minmax(180px, auto); align-content: start; gap: 8px; overflow-y: auto; min-height: 0; flex: 1; overscroll-behavior: contain; }
    .prop-lib-card { min-height: 180px !important; display: flex; flex-direction: column; align-items: stretch; min-width: 0; padding: 8px; border: 1px solid #334257; border-radius: 10px; background: #1b293a; color: #f8fafc; font: inherit; text-align: left; cursor: pointer; }
    .prop-lib-card:hover { border-color: var(--accent, #00f2fe); background: #23374b; }
    .prop-lib-card:active { background: #2c4459; }
    .prop-lib-panel :focus-visible { outline: 3px solid #ffb84c; outline-offset: -3px; }
    .prop-lib-thumb { flex-shrink: 0; width: 100%; height: 100px; border-radius: 6px; object-fit: contain; background: #263549; }
    .prop-lib-name { font-size: 13px; font-weight: 700; color: #f8fafc; line-height: 1.35; margin-top: 8px; overflow-wrap: anywhere; }
    .prop-lib-place { font-size: 12px; color: #83ded9; margin-top: auto; padding-top: 6px; }
    .prop-lib-empty { grid-column: 1 / -1; color: #b6c4d4; font-size: 14px; padding: 16px 4px; line-height: 1.5; }
    @media (prefers-reduced-motion: reduce) { .prop-lib-panel { transition: none; } }
    .prop-lib-footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 8px; }
    .prop-lib-count { font-size: 14px; color: var(--muted, #94a3b8); }
    .prop-lib-clear {
      min-height: 44px; padding: 6px 10px; border: 1px solid rgba(255,92,122,0.5); border-radius: 8px;
      background: transparent; color: #ff7b93; font-size: 14px; font-weight: 700; cursor: pointer;
    }
    .prop-lib-toolbar {
      position: fixed; bottom: 150px; left: 50%; transform: translateX(-50%);
      /* Above EVERYTHING, including the buddy chat panel (z-index 2147483000),
         so the placement toolbar stays clickable while the chat is open. */
      z-index: 2147483500;
      display: flex; align-items: center; gap: 10px;
      background: var(--bg, rgba(10,15,29,0.97));
      border: 1px solid var(--accent, #00f2fe); border-radius: 999px;
      padding: 8px 14px; box-shadow: var(--shadow, 0 8px 24px rgba(0,0,0,0.4));
    }
    .prop-lib-tb-name { font-size: 14px; font-weight: 700; color: var(--text, #f8fafc); max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .prop-lib-tb-btn {
      min-width: 48px; height: 48px; padding: 0 12px;
      border-radius: 12px; border: 1px solid var(--panel-border, rgba(0,242,254,0.35));
      background: rgba(255,255,255,0.06); color: var(--text, #f8fafc);
      font-size: 15px; font-weight: 700; cursor: pointer;
    }
    .prop-lib-tb-btn.done { background: var(--jade, #00ff9d); border-color: transparent; color: #06283a; }
    .prop-lib-hint {
      position: fixed; bottom: 208px; left: 50%; transform: translateX(-50%);
      z-index: 2147483400;
      color: var(--text, #f8fafc); font-size: 14px; font-weight: 600;
      background: var(--bg, rgba(10,15,29,0.9));
      border: 1px solid var(--panel-border, rgba(0,242,254,0.35));
      border-radius: 999px; padding: 8px 16px; pointer-events: none;
    }
    .prop-lib-overlay {
      /* This is a real input boundary, not just a visual layer.  It must sit
         above HUD/cards and the renderer so a placement tap cannot become an
         orbit, building-entry, or select-mode tap-away. */
      position: fixed; inset: 0; z-index: 2147483390;
      background: transparent; cursor: crosshair; touch-action: none;
    }
    .prop-lib-toast {
      position: fixed; top: 64px; right: 16px; z-index: 200;
      background: var(--bg, rgba(10,15,29,0.95));
      border: 1px solid var(--jade, #00ff9d); border-radius: 10px;
      color: var(--text, #f8fafc); padding: 10px 14px; font-size: 14px; font-weight: 600;
      box-shadow: var(--shadow, 0 8px 24px rgba(0,0,0,0.4));
      pointer-events: none; opacity: 0; transform: translateX(30px);
      transition: opacity 0.3s ease, transform 0.3s ease;
    }
    .prop-lib-toast.show { opacity: 1; transform: translateX(0); }
  `;
  document.head.appendChild(style);

  const button = document.createElement('button');
  button.className = 'prop-lib-btn';
  button.type = 'button';
  button.id = 'prop-toggle';
  button.setAttribute('aria-label', 'Open the model library');
  button.title = 'Model library';
  // Structural icon (3D cube = model library) as monochrome stroke SVG — the
  // last emoji-as-icon-only control; content emojis (items/cards) are kept.
  button.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 20 7.5v9L12 21 4 16.5v-9L12 3Z"/><path d="M4 7.5 12 12l8-4.5"/><path d="M12 12v9"/></g></svg>';
  document.body.appendChild(button);

  const panel = document.createElement('div');
  panel.className = 'prop-lib-panel';
  panel.id = 'prop-library-panel';
  button.setAttribute('aria-controls', panel.id);
  button.setAttribute('aria-expanded', 'false');
  panel.setAttribute('aria-label', 'Model library');
  panel.innerHTML = `
    <div class="prop-lib-head"><div class="prop-lib-title"></div><button type="button" class="prop-lib-close">×</button></div>
    <input type="search" class="prop-lib-search" autocomplete="off" spellcheck="false">
    <select class="prop-lib-packs"></select>
    <select class="prop-lib-tabs"></select>
    <div class="prop-lib-results" role="status" aria-live="polite"></div>
    <div class="prop-lib-list"></div>
    <div class="prop-lib-footer">
      <span class="prop-lib-count"></span>
      <button type="button" class="prop-lib-clear"></button>
    </div>
  `;
  document.body.appendChild(panel);

  const toolbar = document.createElement('div');
  toolbar.className = 'prop-lib-toolbar';
  toolbar.style.display = 'none';
  toolbar.innerHTML = `
    <span class="prop-lib-tb-name"></span>
    <button type="button" class="prop-lib-tb-btn" data-act="rotate" aria-label="${t('common.rotate')}">↻</button>
    <button type="button" class="prop-lib-tb-btn" data-act="undo" aria-label="${t('common.undo')}">↩</button>
    <button type="button" class="prop-lib-tb-btn done" data-act="done" aria-label="${t('common.done')}">✓ ${t('common.done')}</button>
  `;
  document.body.appendChild(toolbar);

  const hint = document.createElement('div');
  hint.className = 'prop-lib-hint';
  hint.style.display = 'none';
  hint.textContent = t('props.tapGroundHint');
  document.body.appendChild(hint);

  const overlay = document.createElement('div');
  overlay.className = 'prop-lib-overlay';
  overlay.style.display = 'none';
  document.body.appendChild(overlay);

  let toastTimer = null;
  let toastEl = null;
  function toast(msg, persistent = false) {
    if (destroyed) return;
    if (storageError) { msg = t('props.storageFailed'); persistent = true; }
    let el = toastEl;
    if (!el) { el = document.createElement('div'); el.className = 'prop-lib-toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); toastEl = el; }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    if (!persistent) toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  // ── Ghost ──
  const ghost = new THREE.Group();
  ghost.visible = false;
  ghost.frustumCulled = false;
  scene.add(ghost);

  // ── Panel rendering ──
  const tabsEl = panel.querySelector('.prop-lib-tabs');
  const packsEl = panel.querySelector('.prop-lib-packs');
  const listEl = panel.querySelector('.prop-lib-list');
  const countEl = panel.querySelector('.prop-lib-count');
  const clearBtn = panel.querySelector('.prop-lib-clear');
  let activeCat = 'essentials';
  let activePack = 'all';
  const searchEl = panel.querySelector('.prop-lib-search');
  const resultsEl = panel.querySelector('.prop-lib-results');
  const closeBtn = panel.querySelector('.prop-lib-close');

  function renderCount() {
    countEl.textContent = `${t('props.myProps')} ${state.placed.length}`;
  }

  function renderTabs() {
    tabsEl.replaceChildren();
    const mine=document.createElement('option');mine.value='mine';mine.textContent=currentLang()==='zh-Hant'?'我的模型':'My Models';tabsEl.appendChild(mine);
    const essentials=document.createElement('option');essentials.value='essentials';essentials.textContent=currentLang()==='zh-Hant'?'城市精選':'City Essentials';tabsEl.appendChild(essentials);
    const all = document.createElement('option');
    all.value = 'all';
    all.textContent = t('props.allCategories');
    tabsEl.appendChild(all);
    for (const cat of CATEGORIES) {
      const option = document.createElement('option');
      option.value = cat.id;
      option.textContent = t(cat.labelKey);
      tabsEl.appendChild(option);
    }
    tabsEl.value = activeCat;
    tabsEl.setAttribute('aria-label', t('props.category'));
    searchEl.placeholder = t('props.search');
    searchEl.setAttribute('aria-label', t('props.search'));
    closeBtn.setAttribute('aria-label', t('props.closeLibrary'));

    packsEl.replaceChildren();
    const allPacks = document.createElement('option'); allPacks.value = 'all'; allPacks.textContent = 'All city packs'; packsEl.appendChild(allPacks);
    for (const pack of LIBRARY_PACKS) {
      const option = document.createElement('option'); option.value = pack.id;
      option.textContent = `${pack.icon} ${pack.label}`; packsEl.appendChild(option);
    }
    packsEl.value = activePack;
    packsEl.setAttribute('aria-label', 'Model pack');
  }
  tabsEl.addEventListener('change', () => { activeCat = tabsEl.value; renderList(); });
  packsEl.addEventListener('change', () => {
    activePack = packsEl.value;
    // Packs are full-library browsing modes, not filters on the small
    // City Essentials shelf.  Make that scope visible in the category picker.
    if (activePack !== 'all') {
      activeCat = 'all';
      tabsEl.value = activeCat;
    }
    renderList();
  });
  searchEl.addEventListener('input', () => { renderList(); });
  closeBtn.addEventListener('click', () => { closePanel(); button.focus(); });
  panel.addEventListener('keydown', (event) => {
    // Typing and native select navigation must not trigger city shortcuts.
    event.stopPropagation();
    if (event.key === 'Escape') { event.stopPropagation(); closePanel(); button.focus(); }
  });

  function renderList() {
    listEl.replaceChildren();
    listEl.scrollTop = 0;
    const query = searchEl.value.trim().toLocaleLowerCase();
    const terms = query.split(/\s+/).filter(Boolean);
    // Search crosses categories so a child can find a tree from Buildings.
    if (!query && activeCat === 'mine') return renderMyModels();
    // City Essentials remains the welcoming starter shelf until a child picks
    // a themed pack.  A pack must always begin with the full shared library:
    // applying it to Essentials hides most themed models, and doing it only
    // without a query lets search leak unrelated models back into the list.
    let source = activePack !== 'all'
      ? libraryByPack(PROPS, activePack)
      : (!query && activeCat === 'essentials'
        ? CITY_ESSENTIALS.map(e => PROP_MAP[e.id]).filter(Boolean)
        : PROPS);
    const items = source.filter(item => {
      if (item.picker === false) return false;
      if (!query) return (activeCat === 'essentials' || activeCat === 'all' || item.category === activeCat) && (activePack === 'all' || packForLibraryItem(item) === activePack);
      const haystack = `${item.name} ${essentialSearch(item)} ${item.id.replaceAll('_', ' ')} ${t(CAT_MAP[item.category]?.labelKey || '')}`.toLocaleLowerCase();
      return terms.every(term => haystack.includes(term));
    });
    resultsEl.textContent = `${items.length} ${t(query ? 'props.searchResults' : 'props.models')}`;
    for (const item of items) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'prop-lib-card';
      card.setAttribute('aria-label', `${t('props.place')} ${essentialName(item,currentLang())}`);
      const state = packAssetState(item, _cache);
      card.innerHTML = `<img class="prop-lib-thumb" src="../library/thumbnails/${item.id}.png" alt="" loading="lazy"><span class="prop-lib-name"></span><span class="prop-lib-place"></span>`;
      card.querySelector('.prop-lib-thumb').addEventListener('error', (event) => { event.target.style.visibility = 'hidden'; });
      card.querySelector('.prop-lib-name').textContent = essentialName(item,currentLang());
      card.querySelector('.prop-lib-place').textContent = state === 'ready' ? t('props.place') : `${t('props.place')} · On demand`;
      card.addEventListener('click', () => startPlacement(item));
      listEl.appendChild(card);
    }
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'prop-lib-empty';
      empty.textContent = t('props.noResults');
      listEl.appendChild(empty);
    }
  }

  function renderMyModels() {
    resultsEl.textContent = `${customManifest.models.length} My Models`;
    const upload = document.createElement('button'); upload.type='button'; upload.className='prop-lib-card';
    upload.innerHTML='<span class="prop-lib-name">＋ Add a GLB model</span><span class="prop-lib-place">Device only · 12 MB each</span>';
    upload.addEventListener('click', () => fileInput.click()); listEl.append(upload);
    for (const meta of customManifest.models) {
      const item = customItem(meta.id); const card=document.createElement('div'); card.className='prop-lib-card';
      card.innerHTML='<span class="prop-lib-name"></span><button type="button" class="prop-lib-tb-btn">Place</button><button type="button" class="prop-lib-tb-btn">Replace file</button><button type="button" class="prop-lib-tb-btn">Building role</button><button type="button" class="prop-lib-tb-btn">Rename</button><button type="button" class="prop-lib-tb-btn">Remove</button>';
      card.querySelector('.prop-lib-name').textContent=`◆ ${item.name}`;
      const [place, replace, role, rename, remove] = card.querySelectorAll('button');
      place.addEventListener('click', () => startPlacement(item));
      replace.addEventListener('click', () => { fileInput.dataset.replace = meta.id; fileInput.click(); });
      role.addEventListener('click', () => { const current=Object.entries(customManifest.overrides).filter(([,id])=>id===meta.id).map(([r])=>r).join(', '); const named=window.prompt(`Use this model for which planner building role?\nExamples: school, hospital, city_central. Leave blank to clear.\nCurrent: ${current||'none'}`,''); if(named===null)return; for(const [r,id] of Object.entries(customManifest.overrides))if(id===meta.id)delete customManifest.overrides[r]; for(const r of named.split(',').map(x=>x.trim()).filter(Boolean))customManifest.overrides[r]=meta.id; writeCustomManifest(customManifest); toast('Building visual saved. Reload the city to see it.'); });
      rename.addEventListener('click', () => { const name=window.prompt('Name this model',meta.name); if(name?.trim()){meta.name=name.trim().slice(0,80);writeCustomManifest(customManifest);renderMyModels();} });
      remove.addEventListener('click', async () => { const uses=state.placed.filter(p=>p.record.id===item.id).length; if(!window.confirm(`Remove ${meta.name}? This also removes ${uses} placed copy${uses===1?'':'ies'}.`))return; state.placed.filter(p=>p.record.id===item.id).forEach(removeMesh); state.placed=state.placed.filter(p=>p.record.id!==item.id); customManifest.models=customManifest.models.filter(m=>m.id!==meta.id); for(const [role,id] of Object.entries(customManifest.overrides))if(id===meta.id)delete customManifest.overrides[role]; writeCustomManifest(customManifest); await customModelStore.remove(meta.id); _cache.delete(item.id); persist();renderCount();renderMyModels(); });
      listEl.append(card);
    }
  }
  const fileInput=document.createElement('input'); fileInput.type='file'; fileInput.accept='.glb,model/gltf-binary'; fileInput.hidden=true; document.body.append(fileInput);
  fileInput.addEventListener('change', async () => {
    const file=fileInput.files?.[0]; const replaceId=fileInput.dataset.replace || ''; delete fileInput.dataset.replace; fileInput.value=''; if(!file)return;
    let all=[]; try{all=await customModelStore.all();}catch{toast('My Models needs browser storage.',true);return;}
    const bytes=await file.arrayBuffer(); const old=replaceId ? all.find(m=>m.id===replaceId) : null; const checked=validateGLB(bytes,{totalBytes:all.reduce((n,m)=>n+(m.bytes?.byteLength||0),0)-(old?.bytes?.byteLength||0)}); if(!checked.ok){toast(checked.error,true);return;}
    const id=replaceId || globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`; const oldMeta=customManifest.models.find(m=>m.id===id); const name=(window.prompt('Name this model',oldMeta?.name||file.name.replace(/\.glb$/i,''))||'').trim(); if(!name)return;
    const item={id:`${CUSTOM_MODEL_PREFIX}${id}`,name:name.slice(0,80),emoji:'◆',category:'prop',footprint:[4,4],height:4,custom:true};
    try { await loadCustomFromBytes(item,bytes); await customModelStore.put({id,bytes,name:item.name,createdAt:new Date().toISOString()}); if(oldMeta){oldMeta.name=item.name; for(const p of state.placed.filter(p=>p.record.id===item.id)){removeMesh(p);project(p,_cache.get(item.id));}} else customManifest.models.push({id,name:item.name,createdAt:new Date().toISOString()}); writeCustomManifest(customManifest); persist(); renderMyModels(); toast(`${item.name} is ready to place.`); } catch { toast('That GLB could not be drawn. Try another model.',true); }
  });
  async function loadCustomFromBytes(item, bytes) { const gltf=await new Promise((resolve,reject)=>_loader.parse(bytes.slice(0),'',resolve,reject)); const g=gltf.scene||gltf.scenes?.[0]; if(!g||!g.getObjectByProperty('isMesh',true))throw new Error('empty'); g.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=false;}}); scaleToFootprint(g,item,1);_cache.set(item.id,g);return g; }

  function openPanel() {
    window.dispatchEvent(new CustomEvent('city:panel-open',{detail:{panel:'library'}}));
    state.panelOpen = true;
    document.body.classList.add('prop-library-open');
    button.classList.add('active');
    button.setAttribute('aria-expanded', 'true');
    panel.classList.add('open');
    panel.querySelector('.prop-lib-title').textContent = t('props.title');
    clearBtn.textContent = t('props.clearAll');
    renderCount();
    if (!tabsEl.children.length) { renderTabs(); renderList(); }
  }
  function closePanel() {
    state.panelOpen = false;
    document.body.classList.remove('prop-library-open');
    button.classList.remove('active');
    button.setAttribute('aria-expanded', 'false');
    panel.classList.remove('open');
  }
  button.addEventListener('click', () => {
    if (state.placing) return;      // toolbar is in charge during placement
    if (state.panelOpen) closePanel(); else openPanel();
  });
  clearBtn.addEventListener('click', () => {
    if (!state.placed.length && !unreadable) { toast(t('props.noPropsToClear')); return; }
    if (!window.confirm(t('props.clearAll') + '?')) return;
    clearAll();
  });

  // ── Placement mode ──
  function startPlacement(item) {
    if (destroyed || restoreActive) return;
    if (unreadable) { toast(t('props.unreadableSaved'), true); return; }
    exitPlacement();
    closePanel();
    state.current = { item, yaw: 0, ghostModel: null };
    state.placing = true;
    toolbar.style.display = 'flex';
    hint.style.display = 'block';
    overlay.style.display = 'block';
    toolbar.querySelector('.prop-lib-tb-name').textContent = item.name;
    if (onPlacementStart) { try { onPlacementStart(); } catch (e) { /* ignore */ } }
    // Load the model for the ghost (lazy). While loading, taps are ignored.
    const current = state.current;
    Promise.resolve().then(() => loadAny(item)).catch(() => null).then((model) => {
      if (destroyed || state.current !== current) return;
      state.current.ghostModel = model;
      if (model) {
        clearGhost();
        ghost.add(cloneGhost(model));
        ghost.rotation.y = 0;
        ghost.visible = false;
      } else {
        toast(t('props.missingModel'));
        exitPlacement();
      }
    });
  }

  function exitPlacement() {
    const wasPlacing = state.placing;
    state.placing = false;
    state.current = null;
    clearGhost();
    ghost.visible = false;
    toolbar.style.display = 'none';
    hint.style.display = 'none';
    overlay.style.display = 'none';
    if (wasPlacing && onPlacementEnd) { try { onPlacementEnd(); } catch (e) { /* ignore */ } }
  }

  function dropAt(x, z) {
    if (!state.current || !state.current.ghostModel) return;
    if (destroyed || restoreActive) return;
    const p = { uid: _uidSeq++, record: { id: state.current.item.id, x, y: 0, z, yaw: state.current.yaw }, mesh: null };
    state.placed.push(p);
    project(p, state.current.ghostModel);
    // Soft performance warning once a city gets crowded (no behaviour change —
    // the cap is informational only; kids can keep placing if they want).
    if (state.placed.length === PLACED_PROP_WARN) toast(t('props.manyProps'));
    persist();
    renderCount();
    if (onPlaced) { try { onPlaced(x, z); } catch (e) { /* ignore */ } }

  }

  function undoLast() {
    if (destroyed || restoreActive) return;
    const last = state.placed.pop();
    if (last) { removeMesh(last); persist(); renderCount(); }
    else toast(t('props.nothingToUndo'));
  }

  // ── Placement input (overlay eats canvas events; host orbit/raycasts are inert) ──
  overlay.addEventListener('pointermove', (e) => {
    e.stopPropagation();
    if (!state.placing || !state.current || !state.current.ghostModel) return;
    const pt = groundPoint(e.clientX, e.clientY);
    if (pt) {
      ghost.visible = true;
      ghost.position.set(pt.x, 0, pt.z);
      ghost.rotation.y = state.current.yaw;
    } else {
      ghost.visible = false;
    }
  });
  overlay.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!state.placing || !state.current || !state.current.ghostModel) return;
    if (!ghost.visible) return;   // ray missed the ground (looking at horizon)
    dropAt(ghost.position.x, ghost.position.z);
    toast(`${t('props.placed')} ${state.current.item.name}!`);
  });
  overlay.addEventListener('pointerup', (e) => { e.stopPropagation(); /* drop already happened on pointerdown */ });

  toolbar.addEventListener('click', (e) => {
    const act = e.target && e.target.dataset ? e.target.dataset.act : null;
    if (!act || !state.placing) return;
    if (act === 'rotate') {
      if (state.current) {
        state.current.yaw += Math.PI / 2;
        if (ghost.visible) ghost.rotation.y = state.current.yaw;
      }
    } else if (act === 'undo') {
      undoLast();
    } else if (act === 'done') {
      const last = state.placed.length ? state.placed[state.placed.length - 1].mesh : null;
      exitPlacement();
      if (onPlacementDone) { try { onPlacementDone(last); } catch (e) { /* ignore */ } }
    }
  });

  // Re-localize open UI when the student flips the language.
  const relocalize = () => {
    hint.textContent = t('props.tapGroundHint');
    if (!state.panelOpen) return;
    panel.querySelector('.prop-lib-title').textContent = t('props.title');
    clearBtn.textContent = t('props.clearAll');
    renderCount();
    renderTabs();
    renderList();
  };
  window.addEventListener('i18n:change', relocalize);

  // Establish all records synchronously; refresh only retries the current
  // projection. Imports reload the page via Session 1's restore transaction.
  try {
    raw = localStorage.getItem(storageKey);
    envelope = raw === null ? null : JSON.parse(raw);
    const records = Array.isArray(envelope) ? envelope : envelope?.props;
    if (Array.isArray(records)) state.placed = records.map(record => ({ uid: _uidSeq++, record, mesh: null }));
    else if (raw !== null) unreadable = true;
  } catch { unreadable = true; }
  if (unreadable) toast(t('props.unreadableSaved'), true);
  renderRecords();

  const api = {
    open: openPanel,
    close: closePanel,
    isOpen: () => state.panelOpen,
    isPlacing: () => state.placing,
    isReadyToPlace: () => !!state.placing && !!state.current?.ghostModel,
    getCount: () => state.placed.length,
    snapshot,
    get storageFailed() { return storageError; },
    /**
     * Bounded City demonstrations share the existing props Champion File
     * section. Updating through this owner prevents a later prop edit from
     * replacing newer metadata with the envelope captured at boot.
     */
    readEnvelope: () => envelope,
    replaceEnvelope(next) {
      if (destroyed || restoreActive || unreadable || !next || typeof next !== 'object' || Array.isArray(next)) return false;
      envelope = next;
      dirty = true;
      try {
        localStorage.setItem(storageKey, snapshot());
        storageError = false;
        return true;
      } catch {
        storageError = true;
        toast(t('props.storageFailed'), true);
        return false;
      }
    },
    /** Committed transforms only: carrying is a preview until onDrop. */
    updateTransform(mesh, scaleOnly = false) {
      if (destroyed || restoreActive || !mesh) return;
      const p = state.placed.find(p => p.uid === mesh.userData.uid);
      if (!p) return;
      const next = { ...p.record, scale: mesh.scale.toArray() };
      if (!scaleOnly) Object.assign(next, { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z, yaw: mesh.rotation.y });
      if (!validRecord(next)) return;
      p.record = next;
      persist();
    },
    moveProp(uidOrId, x, z, yaw) {
      if (destroyed || restoreActive) return;
      const p = state.placed.find(e => e.uid === uidOrId) || state.placed.find(e => e.record?.id === uidOrId);
      if (!p) return;
      const next = { ...p.record, x, z, yaw };
      if (!validRecord(next)) return;
      p.record = next;
      if (p.mesh) { p.mesh.position.x = x; p.mesh.position.z = z; p.mesh.rotation.y = yaw; }
      persist();
    },
    clear: clearAll,
    refresh() {
      if (destroyed || restoreActive) return;
      exitPlacement();
      renderRecords();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      closePanel();
      ++generation;
      exitPlacement();
      state.placed.forEach(removeMesh);
      clearTimeout(toastTimer);
      window.removeEventListener('i18n:change', relocalize);
      [style, button, panel, toolbar, hint, overlay, toastEl, fileInput].forEach(el => el?.remove());
      ghost.removeFromParent();
      if (window.__propLibrary === api) delete window.__propLibrary;
    },
  };
  window.__propLibrary = api;
  return api;
}
