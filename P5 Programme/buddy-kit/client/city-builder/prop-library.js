// prop-library.js — in-scenario 3D model library + tap-to-place decorator.
//
// Reusable + buildless (copy-verbatim like skins.js / crash-guard.js). Any 3D
// scenario mounts it with ONE call and gets:
//   • a small 🧰 button (top-left, beside the skin/orbit toggles)
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
import { t } from './i18n.js';
import { LIBRARY, LIBRARY_CATEGORIES, libraryByCategory, libraryUrl } from '../city-common/library.js';
import { vehicleTargetLength } from '../city-common/vehicle-scale.js';

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
function loadSaved(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : (Array.isArray(data.props) ? data.props : []);
  } catch (e) { return []; }
}
function saveSaved(key, props) {
  try { localStorage.setItem(key, JSON.stringify({ version: 1, props })); } catch (e) { /* ignore */ }
}

// ─── Mount ─────────────────────────────────────────────────────────────────
export function mountPropLibrary(opts) {
  const { scene, camera, renderer, storageKey = 'hk_ai_city_props_v1' } = opts;
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
    placed: [],             // [{ id, x, z, yaw, mesh }] — mesh not persisted
  };

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
      position: fixed; top: 64px; left: 128px; z-index: 105;
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
      position: fixed; top: 120px; left: 16px; z-index: 105;
      width: min(280px, 82vw); max-height: calc(100vh - 200px);
      display: flex; flex-direction: column;
      background: var(--bg, rgba(10,15,29,0.97));
      border: 1px solid var(--panel-border, rgba(0,242,254,0.35));
      border-radius: 14px; box-shadow: var(--shadow, 0 8px 24px rgba(0,0,0,0.4));
      padding: 12px; transform: translateX(-320px); opacity: 0;
      pointer-events: none; transition: transform 0.22s ease, opacity 0.22s ease;
    }
    .prop-lib-panel.open { transform: translateX(0); opacity: 1; pointer-events: auto; }
    .prop-lib-title { font-family: var(--font-display, "Fredoka One", "Nunito", sans-serif); font-size: 14px; font-weight: 400; color: var(--accent, #00f2fe); margin-bottom: 8px; }
    .prop-lib-tabs { display: flex; flex-wrap: wrap; gap: 8px; row-gap: 8px; margin-bottom: 10px; }
    .prop-lib-tab {
      flex: 0 1 auto; white-space: nowrap;
      display: inline-flex; align-items: center; justify-content: center;
      min-height: 44px; padding: 0 14px; border: 1px solid var(--panel-border, rgba(0,242,254,0.35));
      border-radius: 999px; background: transparent; color: var(--text, #f8fafc);
      font-size: 13px; font-weight: 700; cursor: pointer; line-height: 1.2;
    }
    .prop-lib-tab.active { background: var(--accent, #00f2fe); color: #06233a; border-color: var(--accent, #00f2fe); }
    .prop-lib-list { display: flex; flex-direction: column; gap: 6px; overflow-y: auto; min-height: 0; flex: 1; }
    .prop-lib-card {
      display: flex; align-items: center; justify-content: space-between;
      min-height: 52px; padding: 6px 8px; border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05);
      cursor: pointer; transition: background 0.15s ease, border-color 0.15s ease;
      content-visibility: auto; contain-intrinsic-size: 60px;
    }
    .prop-lib-card:hover { border-color: var(--accent, #00f2fe); }
    .prop-lib-card:active { background: rgba(0,242,254,0.15); }
    .prop-lib-left { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .prop-lib-thumb { width: 36px; height: 36px; border-radius: 8px; object-fit: cover; background: rgba(255,255,255,0.06); flex-shrink: 0; }
    .prop-lib-name { font-size: 13px; font-weight: 600; color: var(--text, #f8fafc); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .prop-lib-place {
      display: inline-flex; align-items: center; justify-content: center;
      min-height: 44px; min-width: 44px; padding: 0 14px; border: none; border-radius: 10px;
      background: var(--accent, #00f2fe); color: #06233a;
      font-size: 13px; font-weight: 700; cursor: pointer;
    }
    .prop-lib-footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 8px; }
    .prop-lib-count { font-size: 11px; color: var(--muted, #94a3b8); }
    .prop-lib-clear {
      padding: 6px 10px; border: 1px solid rgba(255,92,122,0.5); border-radius: 8px;
      background: transparent; color: #ff7b93; font-size: 12px; font-weight: 700; cursor: pointer;
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
    .prop-lib-tb-name { font-size: 13px; font-weight: 700; color: var(--text, #f8fafc); max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .prop-lib-tb-btn {
      min-width: 40px; height: 36px; padding: 0 10px;
      border-radius: 10px; border: 1px solid var(--panel-border, rgba(0,242,254,0.35));
      background: rgba(255,255,255,0.06); color: var(--text, #f8fafc);
      font-size: 14px; font-weight: 700; cursor: pointer;
    }
    .prop-lib-tb-btn.done { background: var(--jade, #00ff9d); border-color: transparent; color: #06283a; }
    .prop-lib-hint {
      position: fixed; bottom: 208px; left: 50%; transform: translateX(-50%);
      z-index: 2147483400;
      color: var(--text, #f8fafc); font-size: 13px; font-weight: 600;
      background: var(--bg, rgba(10,15,29,0.9));
      border: 1px solid var(--panel-border, rgba(0,242,254,0.35));
      border-radius: 999px; padding: 6px 14px; pointer-events: none;
    }
    .prop-lib-overlay {
      position: fixed; inset: 0; z-index: 90;
      background: transparent; cursor: crosshair; touch-action: none;
    }
    .prop-lib-toast {
      position: fixed; top: 64px; right: 16px; z-index: 200;
      background: var(--bg, rgba(10,15,29,0.95));
      border: 1px solid var(--jade, #00ff9d); border-radius: 10px;
      color: var(--text, #f8fafc); padding: 10px 14px; font-size: 13px; font-weight: 600;
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
  button.textContent = '🧰';
  button.title = 'Model library';
  document.body.appendChild(button);

  const panel = document.createElement('div');
  panel.className = 'prop-lib-panel';
  panel.setAttribute('aria-label', 'Model library');
  panel.innerHTML = `
    <div class="prop-lib-title"></div>
    <div class="prop-lib-tabs"></div>
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
  function toast(msg) {
    let el = document.querySelector('.prop-lib-toast');
    if (!el) { el = document.createElement('div'); el.className = 'prop-lib-toast'; document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  // ── Ghost ──
  const ghost = new THREE.Group();
  ghost.visible = false;
  ghost.frustumCulled = false;
  scene.add(ghost);

  // ── Panel rendering ──
  const tabsEl = panel.querySelector('.prop-lib-tabs');
  const listEl = panel.querySelector('.prop-lib-list');
  const countEl = panel.querySelector('.prop-lib-count');
  const clearBtn = panel.querySelector('.prop-lib-clear');
  let activeCat = CATEGORIES[0].id;

  function renderCount() {
    countEl.textContent = `${t('props.myProps')} ${state.placed.length}`;
  }

  function renderTabs() {
    tabsEl.innerHTML = '';
    for (const cat of CATEGORIES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'prop-lib-tab' + (cat.id === activeCat ? ' active' : '');
      b.textContent = t(cat.labelKey);
      b.addEventListener('click', () => { activeCat = cat.id; renderTabs(); renderList(); });
      tabsEl.appendChild(b);
    }
  }

  function renderList() {
    listEl.innerHTML = '';
    for (const item of PROPS) {
      if (item.category !== activeCat) continue;
      const card = document.createElement('div');
      card.className = 'prop-lib-card';
      card.innerHTML = `<div class="prop-lib-left"><img class="prop-lib-thumb" src="../library/thumbnails/${item.id}.png" alt="" loading="lazy" onerror="this.style.display='none'"><span class="prop-lib-name"></span></div><button type="button" class="prop-lib-place"></button>`;
      card.querySelector('.prop-lib-name').textContent = item.name;
      card.querySelector('.prop-lib-place').textContent = t('props.place');
      card.querySelector('.prop-lib-place').addEventListener('click', () => startPlacement(item));
      card.addEventListener('click', (e) => {
        if (e.target !== card && e.target.closest('.prop-lib-place')) return; // button already handled
        startPlacement(item);
      });
      listEl.appendChild(card);
    }
    if (!listEl.children.length) {
      const empty = document.createElement('div');
      empty.className = 'prop-lib-name';
      empty.textContent = '…';
      listEl.appendChild(empty);
    }
  }

  function openPanel() {
    state.panelOpen = true;
    button.classList.add('active');
    panel.classList.add('open');
    panel.querySelector('.prop-lib-title').textContent = t('props.title');
    clearBtn.textContent = t('props.clearAll');
    renderCount();
    if (!tabsEl.children.length) { renderTabs(); renderList(); }
  }
  function closePanel() {
    state.panelOpen = false;
    button.classList.remove('active');
    panel.classList.remove('open');
  }
  button.addEventListener('click', () => {
    if (state.placing) return;      // toolbar is in charge during placement
    if (state.panelOpen) closePanel(); else openPanel();
  });
  clearBtn.addEventListener('click', () => {
    if (!state.placed.length) { toast(t('props.noPropsToClear')); return; }
    if (!window.confirm(t('props.clearAll') + '?')) return;
    for (const p of state.placed) scene.remove(p.mesh);
    state.placed = [];
    saveSaved(storageKey, []);
    renderCount();
    toast(t('props.clearedAll'));
  });

  // ── Placement mode ──
  function startPlacement(item) {
    closePanel();
    state.current = { item, yaw: 0, ghostModel: null };
    state.placing = true;
    toolbar.style.display = 'flex';
    hint.style.display = 'block';
    overlay.style.display = 'block';
    toolbar.querySelector('.prop-lib-tb-name').textContent = item.name;
    if (onPlacementStart) { try { onPlacementStart(); } catch (e) { /* ignore */ } }
    // Load the model for the ghost (lazy). While loading, taps are ignored.
    loadProp(item).then((model) => {
      if (!state.placing || state.current.item.id !== item.id) return;
      state.current.ghostModel = model;
      if (model) {
        ghost.clear();
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
    state.placing = false;
    state.current = null;
    ghost.clear();
    ghost.visible = false;
    toolbar.style.display = 'none';
    hint.style.display = 'none';
    overlay.style.display = 'none';
    if (onPlacementEnd) { try { onPlacementEnd(); } catch (e) { /* ignore */ } }
  }

  function dropAt(x, z) {
    if (!state.current || !state.current.ghostModel) return;
    const clone = clonePlaced(state.current.ghostModel);
    clone.position.set(x, 0, z);
    clone.rotation.y = state.current.yaw;
    const uid = _uidSeq++;
    clone.userData.uid = uid;
    scene.add(clone);
    state.placed.push({ uid, id: state.current.item.id, x, z, yaw: state.current.yaw, mesh: clone });
    // Soft performance warning once a city gets crowded (no behaviour change —
    // the cap is informational only; kids can keep placing if they want).
    if (state.placed.length === PLACED_PROP_WARN) toast(t('props.manyProps'));
    saveSaved(storageKey, state.placed.map((p) => ({ id: p.id, x: round2(p.x), z: round2(p.z), yaw: round2(p.yaw) })));
    renderCount();
    if (onPlaced) { try { onPlaced(x, z); } catch (e) { /* ignore */ } }
    if (onPlacedMesh) { try { onPlacedMesh(clone, state.current.item); } catch (e) { /* ignore */ } }
  }

  function undoLast() {
    const last = state.placed.pop();
    if (last) { scene.remove(last.mesh); saveSaved(storageKey, state.placed.map((p) => ({ id: p.id, x: round2(p.x), z: round2(p.z), yaw: round2(p.yaw) }))); renderCount(); }
    else toast(t('props.nothingToUndo'));
  }

  // ── Placement input (overlay eats canvas events; host orbit/raycasts are inert) ──
  overlay.addEventListener('pointermove', (e) => {
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
    if (!state.placing || !state.current || !state.current.ghostModel) return;
    if (!ghost.visible) return;   // ray missed the ground (looking at horizon)
    dropAt(ghost.position.x, ghost.position.z);
    toast(`${t('props.placed')} ${state.current.item.name}!`);
  });
  overlay.addEventListener('pointerup', () => { /* no-op: drop already happened on pointerdown */ });

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
  window.addEventListener('i18n:change', () => {
    hint.textContent = t('props.tapGroundHint');
    if (!state.panelOpen) return;
    panel.querySelector('.prop-lib-title').textContent = t('props.title');
    clearBtn.textContent = t('props.clearAll');
    renderCount();
    renderTabs();
    renderList();
  });

  // ── Restore persisted props (lazy, non-blocking) ──
  function restore() {
    const saved = loadSaved(storageKey);
    if (!saved.length) return;
    let loaded = 0;
    for (const rec of saved) {
      const item = PROP_MAP[rec.id];
      if (!item) { console.warn('[prop-library] unknown saved prop', rec.id); continue; }
      loadProp(item).then((model) => {
        if (!model) return;
        const clone = clonePlaced(model);
        clone.position.set(Number(rec.x) || 0, 0, Number(rec.z) || 0);
        clone.rotation.y = Number(rec.yaw) || 0;
        const uid = _uidSeq++;
        clone.userData.uid = uid;
        scene.add(clone);
        state.placed.push({ uid, id: item.id, x: Number(rec.x) || 0, z: Number(rec.z) || 0, yaw: Number(rec.yaw) || 0, mesh: clone });
        if (onPlacedMesh) { try { onPlacedMesh(clone, item); } catch (e) { /* ignore */ } }
        loaded++;
        if (loaded === saved.length && state.panelOpen) renderCount();
      });
    }
  }
  restore();

  function round2(n) { return Math.round(n * 100) / 100; }

  const api = {
    isPlacing: () => state.placing,
    /** True once the selected model is loaded and the ghost can follow the pointer. */
    isReadyToPlace: () => !!state.placing && !!state.current && !!state.current.ghostModel,
    getCount: () => state.placed.length,
    /** Update a placed prop's persisted position (after a grab move). Matches
     *  by unique instance uid (falling back to library id for legacy records). */
    moveProp(uidOrId, x, z, yaw) {
      const p = state.placed.find((e) => e.uid === uidOrId) || state.placed.find((e) => e.id === uidOrId);
      if (!p) return;
      p.x = round2(x); p.z = round2(z); p.yaw = round2(yaw);
      saveSaved(storageKey, state.placed.map((q) => ({ id: q.id, x: q.x, z: q.z, yaw: q.yaw })));
    },
    refresh: () => {
      for (const p of state.placed) scene.remove(p.mesh);
      state.placed = [];
      restore();
    },
    destroy: () => {
      exitPlacement();
      [style, button, panel, toolbar, hint, overlay].forEach((el) => el.remove());
      scene.remove(ghost);
    },
  };
  window.__propLibrary = api;   // host code can consult isPlacing()
  return api;
}
