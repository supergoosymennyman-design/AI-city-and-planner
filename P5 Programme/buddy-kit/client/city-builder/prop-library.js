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
import { itemTargetBounds, uniformScaleForBounds } from '../city-common/model-scale.js';
import { CUSTOM_MODEL_PREFIX, customModelStore, readCustomManifest, writeCustomManifest, validateGLB } from '../city-common/custom-models.js';
import { newModelTransferId, saveModelTransfer, consumeModelTransfer } from '../city-common/model-transfer.js';
import { createCommandHistory } from '../city-common/command-history.js';
import { SKILL_HOST_PREFIX, SKILL_HOSTS, skillHostItem, newSkillHostRecord, createSkillHostRoot, editSkillHostDialog, workshopUrl } from './skill-hosts.js';

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

// One release gate for the optional workshop. Landmark code and Champion data
// are still lazy: enabling this only adds the shelf label until it is opened.
export const LANDMARK_WORKSHOP_ENABLED = true;
const LANDMARK_PREFIX = 'landmark:';
const LANDMARK_STUBS = Object.freeze({
  'champion-plaza': { emoji:'🏆', en:'Champion Plaza', zh:'冠軍廣場', footprint:[8,8] },
  'pixel-mural': { emoji:'🎨', en:'Pixel Mural', zh:'像素壁畫', footprint:[7,2] },
  'festival-plaza': { emoji:'🏮', en:'Festival Plaza', zh:'節慶廣場', footprint:[9,9] },
  'smart-gate': { emoji:'💡', en:'Smart Lamp / Gate', zh:'智能燈／閘門', footprint:[7,3] },
});
let _landmarkModulePromise = null;
const landmarkModule = () => _landmarkModulePromise ||= import('./landmark-workshop.js');
function landmarkStub(id) { const key=id?.startsWith(LANDMARK_PREFIX)?id.slice(LANDMARK_PREFIX.length):'';if(!key)return null;const s=LANDMARK_STUBS[key];return {id,name:s?(currentLang()==='zh-Hant'?s.zh:s.en):(currentLang()==='zh-Hant'?'未知地標':'Unknown landmark'),emoji:s?.emoji||'⚠️',category:'landmarks',footprint:s?.footprint||[4,4],height:6,landmark:true,unknown:!s,templateId:key}; }

// Per-instance id counter: placed props are matched by a unique uid so moving
// one of several identical props updates THAT instance, not the first match.
let _uidSeq = 1;
const instanceId = () => `city-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;

// ─── Loading + normalization ───────────────────────────────────────────────
const _loader = createGLTFLoader();
const _cache = new Map();          // propId -> THREE.Group (normalized)

/** Scale a loaded model so its largest dimension fits the item's footprint/height (metres). */
function scaleToFootprint(model, item, extra) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  let s;
  if (item.category === 'buildings') {
    // Buildings are a physical-scale promise: contain the authored model in
    // its width/depth/height box without stretching doors or window rows.
    s = uniformScaleForBounds(size, itemTargetBounds(item), extra || 1);
  } else {
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    // Vehicles use their real-world default length (matched to traffic), while
    // the established prop behaviour keeps its largest declared dimension.
    const target = (item.category === 'vehicles' ? vehicleTargetLength(item) : Math.max(item.footprint[0], item.footprint[1], item.height || 1)) * (extra || 1);
    s = target / maxDim;
  }
  model.scale.setScalar(s);
  // Preserve the catalog-normalized scale so gameplay footprints can apply a
  // later student resize as a multiplier instead of scaling the footprint a
  // second time by the GLB's source-unit conversion.
  model.userData.libraryBaseScale = s;
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
    && (r.scale === undefined || (Array.isArray(r.scale) && r.scale.length === 3 && r.scale.every(n => Number.isFinite(n) && n > 0 && n <= 10000)))
    && (r.locked === undefined || typeof r.locked === 'boolean');
}
function withInstanceId(record) {
  // Older Champion Files did not have a stable object identity. Assign one on
  // first write so a later Studio handoff can target this exact chair/tree,
  // rather than every copy of the same catalog model.
  if (!validRecord(record)) return record;
  return record?.instanceId ? record : { ...record, instanceId: instanceId() };
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
  const onChanged = opts.onChanged || null; // (records) after a committed prop edit
  const onPlacementDone = opts.onPlacementDone || null;   // (lastMesh) fired once, when the child presses ✓ Done
  const resolvePlacement = typeof opts.resolvePlacement === 'function' ? opts.resolvePlacement : null;
  const onInspectorClearSelection = opts.onInspectorClearSelection || null;
  const getCapabilities = typeof opts.getCapabilities === 'function' ? opts.getCapabilities : (() => []);

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
  let selectedUid = null;
  let inspectorScaleBefore = null;
  let transformBefore = null;
  const loadModel = opts.loadModel || loadProp;
  let customManifest = readCustomManifest();
  const customModels = new Map();
  let myModelsRenderGeneration = 0;
  const customItem = (id) => customModels.get(id) || (() => { const m=customManifest.models.find(m => m.id === id); return m && { id: `${CUSTOM_MODEL_PREFIX}${id}`, name: m.name, emoji: '◆', category: 'prop', footprint: [4,4], height: 4, custom: true }; })();
  function itemFor(id) { return id?.startsWith(SKILL_HOST_PREFIX) ? skillHostItem(id,currentLang()) : id?.startsWith(LANDMARK_PREFIX) ? landmarkStub(id) : id?.startsWith(CUSTOM_MODEL_PREFIX) ? customItem(id.slice(CUSTOM_MODEL_PREFIX.length)) : PROP_MAP[id]; }
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
  async function loadAny(item) {
    if (item?.host) return null;
    if (item?.landmark) {
      const mod=await landmarkModule(),record=mod.makeLandmarkRecord(item.templateId);
      const root=mod.createLandmarkRoot(record);root.userData.defaultLandmarkRecord=record;return root;
    }
    return item?.custom ? loadCustom(item) : loadModel(item);
  }
  async function bytesFor(p, item) {
    const customId = p.record.visualSource?.kind === 'custom' ? p.record.visualSource.modelId : (item?.custom ? item.id.slice(CUSTOM_MODEL_PREFIX.length) : null);
    if (customId) return (await customModelStore.get(customId))?.bytes || null;
    const response = await fetch(libraryUrl(item));
    if (!response.ok) return null;
    return await response.arrayBuffer();
  }
  function snapshot() {
    if (!dirty) return raw;
    const props = state.placed.map(p => p.record);
    return JSON.stringify(Array.isArray(envelope) ? props : { ...envelope, version: envelope?.version ?? 1, props });
  }
  function notifyChanged() {
    try { onChanged?.(state.placed.map((p) => ({ ...p.record }))); } catch (e) { console.warn('[prop-library] change listener failed', e); }
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
    try { p.mesh.userData?.dispose?.(); } catch (e) { console.warn('[prop-library] landmark cleanup failed', e); }
    p.mesh.removeFromParent(); // ordinary geometry/materials belong to shared cache
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
    mesh.userData.locked = !!r.locked;
    p.mesh = mesh;
    scene.add(mesh);
    try { onPlacedMesh?.(mesh, itemFor(r.id)); } catch (e) { console.warn('[prop-library] registration failed', e); }
  }
  async function projectSkillHost(p, gen=generation) {
    if(destroyed||gen!==generation||!state.placed.includes(p))return;
    const customId=p.record.visualSource?.kind==='custom' ? p.record.visualSource.modelId : null;
    let customMissing=false;
    if(customId){ try { customMissing=!(await customModelStore.get(customId))?.bytes; } catch { customMissing=true; } }
    const mesh=createSkillHostRoot(p.record,{capabilities:getCapabilities(),statusOverride:customMissing?'attention':null});
    mesh.position.set(p.record.x??0,p.record.y??0,p.record.z??0);mesh.rotation.y=p.record.yaw??0;
    if(p.record.scale)mesh.scale.fromArray(p.record.scale);
    mesh.userData.uid=p.uid;mesh.userData.locked=!!p.record.locked;p.mesh=mesh;scene.add(mesh);
    if(customId){
      try { const custom=await loadCustom(customItem(customId)); if(destroyed||gen!==generation||p.mesh!==mesh||!custom)throw new Error('missing'); const old=mesh.getObjectByName('skill-host-visual'); if(old){const replacement=clonePlaced(custom);replacement.name='skill-host-visual';old.removeFromParent();mesh.add(replacement);} }
      catch { mesh.userData.customModelMissing=true; } // flagship visual remains as a recoverable fallback
    } else if (['mobility','showcase','universal'].includes(p.record.hostType)) {
      // Reviewed Wave-3 models are optional flagship appearances;
      // the socket and capability record remain outside the GLB.
      const path={mobility:'./assets/models/skill-hosts/passiona-smart-mobility-stop.glb',showcase:'./assets/models/skill-hosts/passiona-champion-skill-pavilion.glb',universal:'./assets/models/skill-hosts/passiona-ai-skill-workshop-pod.glb'}[p.record.hostType];
      try { const gltf=await _loader.loadAsync(path); const model=gltf.scene||gltf.scenes?.[0]; if(!model||destroyed||gen!==generation||p.mesh!==mesh)throw new Error('unavailable'); scaleToFootprint(model,itemFor(p.record.id),1); const old=mesh.getObjectByName('skill-host-visual'); if(old){model.name='skill-host-visual';old.removeFromParent();mesh.add(model);} }
      catch { mesh.userData.flagshipFallback=true; }
    }
    try{onPlacedMesh?.(mesh,itemFor(p.record.id));}catch(e){console.warn('[prop-library] registration failed',e);}
  }
  async function projectLandmark(p, gen=generation) {
    const mod=await landmarkModule();
    if(destroyed||gen!==generation||!state.placed.includes(p))return;
    const mesh=mod.createLandmarkRoot(p.record,{onRepair:message=>toast(message,true)});
    mesh.position.set(p.record.x??0,p.record.y??0,p.record.z??0);mesh.rotation.y=p.record.yaw??0;
    if(p.record.scale)mesh.scale.fromArray(p.record.scale);
    mesh.userData.uid=p.uid;mesh.userData.locked=!!p.record.locked;p.mesh=mesh;scene.add(mesh);
    try{onPlacedMesh?.(mesh,itemFor(p.record.id));}catch(e){console.warn('[prop-library] registration failed',e);}
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
      if(item.host){projectSkillHost(p,gen).catch(()=>toast(t('props.unsupportedSaved'),true));continue;}
      if(item.landmark){projectLandmark(p,gen).catch(()=>toast(t('props.unsupportedSaved'),true));continue;}
      const override=p.record.visualSource?.kind==='custom' ? customItem(p.record.visualSource.modelId) : null;
      Promise.resolve().then(() => override ? loadCustom(override) : loadAny(item)).then(model => {
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
    const before = cloneRecords();
    const wasUnreadable = unreadable;
    ++generation;
    exitPlacement();
    state.placed.forEach(removeMesh);
    state.placed = [];
    if (unreadable) { envelope = null; unreadable = false; }
    // An explicit Clear is the one deliberate recovery action allowed for an
    // unreadable legacy section. It must replace the bad raw string with an
    // empty, exportable envelope even though both record arrays are empty.
    if (wasUnreadable) {
      dirty = true;
      if (persist()) toast(t('props.clearedAll'));
    } else if (commitRecords(before)) toast(t('props.clearedAll'));
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
    .prop-lib-toast.has-action { pointer-events: auto; display:flex; align-items:center; gap:12px; }
    .prop-lib-toast button { min-width:44px; min-height:44px; padding:0 12px; border:1px solid #00f2fe; border-radius:8px; background:#173746; color:#f8fafc; font:700 14px system-ui,sans-serif; cursor:pointer; }
    .prop-inspector {
      position:fixed; right:calc(16px + env(safe-area-inset-right, 0px)); bottom:calc(88px + env(safe-area-inset-bottom, 0px)); z-index:106;
      width:min(310px, calc(100vw - 32px)); padding:12px; border-radius:14px;
      color:#f8fafc; background:#101b29; border:1px solid var(--panel-border, rgba(0,242,254,.35));
      box-shadow:var(--shadow, 0 8px 24px rgba(0,0,0,.4)); font:14px/1.3 system-ui,sans-serif;
    }
    .prop-inspector[hidden] { display:none; }
    .prop-inspector-head { display:flex; align-items:center; justify-content:space-between; gap:8px; }
    .prop-inspector-name { font-weight:800; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .prop-inspector-grid { display:grid; grid-template-columns:repeat(3, 1fr); gap:7px; margin-top:10px; }
    .prop-inspector button { min-height:44px; border:1px solid #41516a; border-radius:8px; background:#182638; color:#f8fafc; font:inherit; font-weight:700; cursor:pointer; }
    .prop-inspector button:disabled { opacity:.45; cursor:not-allowed; }
    .prop-inspector .danger { color:#ff9aae; border-color:rgba(255,92,122,.55); }
    .prop-inspector-scale { display:grid; grid-template-columns:auto 1fr auto; align-items:center; gap:8px; margin-top:10px; }
    .prop-inspector-scale input { min-height:44px; width:100%; accent-color:#00f2fe; }
    .prop-inspector-lock { display:flex; gap:8px; align-items:center; margin-top:10px; color:#cfe9ff; }
    .prop-inspector-lock input { width:22px; height:22px; }
    .prop-inspector :focus-visible { outline:3px solid #ffb84c; outline-offset:2px; }
    .prop-inspector-customize { width:100%; margin-top:10px; border-color:#00bfc9 !important; }
    .landmark-dialog { width:min(520px,calc(100vw - 32px)); max-height:calc(100dvh - 32px); overflow:auto; color:#f8fafc; background:#101b29; border:2px solid #00bfc9; border-radius:16px; padding:20px; }
    .landmark-dialog::backdrop { background:rgba(3,10,20,.72); }
    .landmark-dialog h2 { margin:0 0 16px; font:800 20px system-ui; }
    .landmark-dialog label { display:grid; gap:6px; margin:12px 0; font:700 14px system-ui; }
    .landmark-dialog select,.landmark-dialog input,.landmark-dialog button { min-height:44px; border:1px solid #52647b; border-radius:9px; background:#182638; color:#f8fafc; font:700 14px system-ui; padding:8px; }
    .landmark-dialog menu { display:flex; justify-content:flex-end; gap:10px; padding:12px 0 0; margin:0; }
    .landmark-dialog .primary { background:#00d89a; color:#06283a; border-color:transparent; }
    .landmark-dialog canvas { width:min(256px,100%); aspect-ratio:1; image-rendering:pixelated; border:2px solid #8797aa; touch-action:none; }
    .skill-socket { display:flex; align-items:center; gap:6px; max-width:190px; padding:7px 9px; border:2px solid var(--socket-color); border-radius:8px; background:#10232a; color:#fff; font:700 12px system-ui; box-shadow:0 3px 10px #0008; cursor:pointer; }
    .skill-socket span { display:grid; place-items:center; width:19px; height:19px; border-radius:50%; background:var(--socket-color); color:#11252d; font-weight:900; }
    .skill-host-dialog { width:min(460px,calc(100vw - 30px)); color:#edf7f4; background:#13252b; border:2px solid #35b7a8; border-radius:16px; padding:20px; }
    .skill-host-dialog::backdrop { background:#061216b8; }.skill-host-dialog h2 { margin:0 0 8px; }.skill-host-dialog label { display:grid; gap:6px; margin:13px 0; font-weight:800; }.skill-host-dialog select,.skill-host-dialog button { min-height:44px; border-radius:8px; padding:8px; font:inherit; }.skill-host-dialog select { background:#fffdf7; color:#17262a; border:0; }.skill-host-dialog menu { display:flex; gap:8px; justify-content:flex-end; padding:8px 0 0; margin:0; }.skill-host-dialog .primary { background:#42c7ad; color:#09242a; border:0; font-weight:800; }.skill-host-dialog .secondary { background:#274e55; color:#fff; border:1px solid #7dc8c1; }.skill-host-state { color:#cceae5; font-weight:800; }
    @media (max-width:640px) { .prop-inspector { bottom:174px; right:16px; max-height:calc(100dvh - 250px); overflow-y:auto; } }
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

  // One contextual inspector keeps decoration controls near the selected prop
  // instead of scattering fixed buttons across the city HUD.
  const inspector = document.createElement('aside');
  inspector.className = 'prop-inspector';
  inspector.id = 'prop-inspector';
  inspector.hidden = true;
  inspector.setAttribute('aria-label', 'Selected decoration');
  inspector.innerHTML = `
    <div class="prop-inspector-head"><span class="prop-inspector-name"></span><span class="prop-inspector-history" aria-live="polite"></span></div>
    <div class="prop-inspector-grid">
      <button type="button" data-inspect="rotate-left" aria-label="Rotate left 15 degrees">↶ 15°</button>
      <button type="button" data-inspect="rotate-right" aria-label="Rotate right 15 degrees">↷ 15°</button>
      <button type="button" data-inspect="rotate-90" aria-label="Rotate 90 degrees">↻ 90°</button>
      <button type="button" data-inspect="duplicate">Duplicate</button>
      <button type="button" class="danger" data-inspect="delete"></button>
      <button type="button" data-inspect="undo">Undo</button>
      <button type="button" data-inspect="redo">Redo</button>
    </div>
    <button type="button" class="prop-inspector-customize" data-inspect="customize" hidden>Customize landmark / 自訂地標</button>
    <button type="button" class="prop-inspector-customize" data-inspect="fit-studio">Edit model in Fit Studio / 在造型工作室編輯</button>
    <label class="prop-inspector-scale">Size <input type="range" min="0.2" max="5" step="0.05" value="1" aria-label="Decoration size"><span>100%</span></label>
    <label class="prop-inspector-lock"><input type="checkbox"> Lock this decoration</label>
  `;
  document.body.appendChild(inspector);

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
  let undoToastVersion = null;
  function toast(msg, persistent = false, action = null) {
    if (destroyed) return;
    if (storageError) { msg = t('props.storageFailed'); persistent = true; action = null; }
    if (!action) undoToastVersion = null;
    let el = toastEl;
    if (!el) { el = document.createElement('div'); el.className = 'prop-lib-toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); toastEl = el; }
    el.replaceChildren(document.createTextNode(msg));
    el.classList.toggle('has-action', !!action);
    if (action) {
      const undoButton = document.createElement('button');
      undoButton.type = 'button';
      undoButton.textContent = t('common.undo');
      undoButton.addEventListener('click', () => { action(); el.classList.remove('show', 'has-action'); }, { once: true });
      el.appendChild(undoButton);
    }
    el.classList.add('show');
    clearTimeout(toastTimer);
    if (!persistent) toastTimer = setTimeout(() => el.classList.remove('show', 'has-action'), action ? 6000 : 2400);
  }

  // History is intentionally session-only. The durable props payload is saved
  // after each successful command, while undo/redo never reaches across a
  // reload or a switch back to the 2D planner.
  const cloneRecords = () => state.placed.map((p) => ({ uid: p.uid, record: JSON.parse(JSON.stringify(p.record)) }));
  const sameRecords = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function restoreRecords(records, save = true) {
    const previousSelection = selectedUid;
    // Keep surviving instances (and their in-flight loads) alive. A history
    // action such as undoing one newly placed bush must never blank/reload the
    // rest of a child's city just to restore a small record snapshot.
    const existing = new Map(state.placed.map((p) => [p.uid, p]));
    const next = [];
    const introduced = [];
    for (const { uid, record } of records) {
      const prior = existing.get(uid);
      const copy = withInstanceId(JSON.parse(JSON.stringify(record)));
      if (prior && prior.record?.id === copy?.id) {
        prior.record = copy;
        if (prior.mesh) {
          prior.mesh.position.set(copy.x ?? 0, copy.y ?? 0, copy.z ?? 0);
          prior.mesh.rotation.y = copy.yaw ?? 0;
          if (copy.scale) prior.mesh.scale.fromArray(copy.scale);
          prior.mesh.userData.locked = !!copy.locked;
        }
        next.push(prior);
        existing.delete(uid);
      } else {
        if (prior) { removeMesh(prior); existing.delete(uid); }
        const added = { uid, record: copy, mesh: null };
        next.push(added); introduced.push(added);
      }
    }
    existing.forEach(removeMesh);
    state.placed = next;
    _uidSeq = Math.max(_uidSeq, ...state.placed.map((p) => p.uid + 1), 1);
    selectedUid = state.placed.some((p) => p.uid === previousSelection) ? previousSelection : null;
    if (save) persist();
    const gen = generation;
    for (const p of introduced) {
      if (!validRecord(p.record)) continue;
      const item = itemFor(p.record.id); if (!item) continue;
      if(item.host){projectSkillHost(p,gen).catch(()=>{});continue;}
      if(item.landmark){projectLandmark(p,gen).catch(()=>{});continue;}
      Promise.resolve().then(() => loadAny(item)).then((model) => {
        if (destroyed || gen !== generation || !state.placed.includes(p) || !model) return;
        project(p, model);
      }).catch(() => {});
    }
    renderCount();
    renderInspector();
    notifyChanged();
  }
  let history = null;
  let historyVersion = 0;
  history = createCommandHistory({ limit: 50, onChange: () => {
    historyVersion++;
    if (undoToastVersion !== null && undoToastVersion !== historyVersion) {
      toastEl?.classList.remove('show', 'has-action');
      undoToastVersion = null;
    }
    renderInspector();
  } });
  function commitRecords(before) {
    const after = cloneRecords();
    if (sameRecords(before, after)) return true;
    // Keep an unsaved edit in memory for the Champion File recovery path when
    // device storage is full. It is deliberately not added to undo history:
    // no durable write succeeded, but the child can still download the latest
    // snapshot instead of losing the work they just made.
    if (!persist()) return false;
    history.record({
      execute: () => restoreRecords(after),
      undo: () => restoreRecords(before),
      redo: () => restoreRecords(after),
    });
    notifyChanged();
    return true;
  }
  function selectedProp() { return state.placed.find((p) => p.uid === selectedUid) || null; }
  function renderInspector() {
    const p = selectedProp();
    inspector.hidden = !p;
    opts.onSelectedChange?.(p ? { locked: !!p.record.locked } : null);
    if (!p) return;
    const locked = !!p.record.locked;
    const item = itemFor(p.record.id);
    inspector.querySelector('.prop-inspector-name').textContent = item?.name || p.record.id;
    inspector.querySelector('.prop-inspector-history').textContent = `${history?.size || 0}/50`;
    const scale = Array.isArray(p.record.scale) ? p.record.scale[0] : 1;
    const scaleInput = inspector.querySelector('input[type="range"]');
    scaleInput.value = String(Math.max(.2, Math.min(5, scale)));
    inspector.querySelector('.prop-inspector-scale span').textContent = `${Math.round(scale * 100)}%`;
    inspector.querySelector('.prop-inspector-lock input').checked = locked;
    inspector.querySelector('[data-inspect="delete"]').textContent = t('props.remove');
    const customize=inspector.querySelector('[data-inspect="customize"]');
    customize.hidden=!(item?.landmark||item?.host);customize.disabled=locked;customize.textContent=item?.host?(currentLang()==='zh-Hant'?'連接技能／外觀':'Connect skill / appearance'):item?.unknown?(currentLang()==='zh-Hant'?'修復地標':'Repair landmark'):'Customize landmark / 自訂地標';
    const fit=inspector.querySelector('[data-inspect="fit-studio"]');
    fit.disabled=locked || !!item?.landmark; fit.hidden=!!item?.landmark;
    for (const button of inspector.querySelectorAll('[data-inspect]')) {
      const action = button.dataset.inspect;
      button.disabled = (locked && !['undo', 'redo'].includes(action)) || (action === 'undo' && !history?.canUndo) || (action === 'redo' && !history?.canRedo);
    }
  }

  // ── Ghost ──
  const ghost = new THREE.Group();
  ghost.visible = false;
  ghost.frustumCulled = false;
  scene.add(ghost);

  function changeSelected(mutator) {
    const p = selectedProp();
    if (!p || p.record.locked) return false;
    const before = cloneRecords();
    mutator(p);
    if (!validRecord(p.record)) { restoreRecords(before, false); return false; }
    return commitRecords(before);
  }
  function removeSelected() {
    const p = selectedProp();
    if (!p || p.record.locked || destroyed || restoreActive) return false;
    const before = cloneRecords();
    removeMesh(p);
    state.placed = state.placed.filter((entry) => entry !== p);
    selectedUid = null;
    onInspectorClearSelection?.();
    const saved = commitRecords(before);
    renderCount(); renderInspector();
    if (saved) {
      const removalVersion = historyVersion;
      undoToastVersion = removalVersion;
      toast(t('props.removed'), true, () => {
        undoToastVersion = null;
        if (historyVersion === removalVersion && history.undo().ok) renderCount();
      });
    }
    return saved;
  }
  inspector.addEventListener('click', (event) => {
    const action = event.target?.closest?.('[data-inspect]')?.dataset.inspect;
    if (!action) return;
    if (action === 'undo') { history.undo(); return; }
    if (action === 'redo') { history.redo(); return; }
    if (action === 'customize') {
      const p=selectedProp();if(!p||p.record.locked)return;
      if(itemFor(p.record.id)?.host){ editSkillHostDialog(p.record,getCapabilities(),currentLang(),customManifest.models).then(async result=>{if(!result)return;if(result.openWorkshop){location.href=workshopUrl(p.record);return;}if(!result.value||destroyed||!state.placed.includes(p))return;const before=cloneRecords();p.record=result.value;removeMesh(p);await projectSkillHost(p);commitRecords(before);renderInspector();}).catch(()=>toast('Could not open the Skill Socket.',true));return; }
      if(!itemFor(p.record.id)?.landmark)return;
      landmarkModule().then(async mod=>{const before=cloneRecords();if(itemFor(p.record.id)?.unknown){const repaired=mod.makeLandmarkRecord('champion-plaza',p.record);p.record={...repaired,instanceId:p.record.instanceId,scale:p.record.scale,locked:p.record.locked};}else{const next=await mod.customizeLandmarkDialog(p.record,currentLang());if(!next||destroyed||!state.placed.includes(p))return;p.record={...p.record,landmark:{...p.record.landmark,config:next}};}removeMesh(p);await projectLandmark(p);commitRecords(before);renderInspector();}).catch(()=>toast(t('props.unsupportedSaved'),true));
      return;
    }
    if (action === 'fit-studio') {
      const p=selectedProp(), item=itemFor(p?.record.id); if(!p||!item||p.record.locked||item.landmark)return;
      (async()=>{try{
        const bytes=await bytesFor(p,item);if(!bytes)throw new Error('missing');
        const transfer=await saveModelTransfer({id:newModelTransferId(),instanceId:p.record.instanceId,baseId:p.record.id,baseVisualSource:p.record.visualSource||null,sourceBytes:bytes,name:item.name||p.record.id,returnTo:location.href});
        const u=new URL('../studio/model.html',location.href);u.searchParams.set('transfer',transfer.id);location.assign(u.href);
      }catch{toast('This model is not available on this device yet.',true);}})();return;
    }
    if (action === 'delete') {
      removeSelected();
      return;
    }
    if (action === 'duplicate') {
      const p = selectedProp(); if (!p || p.record.locked) return;
      const before = cloneRecords();
      const copy = { uid: _uidSeq++, record: withInstanceId({ ...JSON.parse(JSON.stringify(p.record)), instanceId:null, x: (p.record.x || 0) + .8, z: (p.record.z || 0) + .8, locked: false }), mesh: null };
      state.placed.push(copy);
      const item = itemFor(copy.record.id);
      if(item?.host)projectSkillHost(copy).catch(()=>{});
      else if(item?.landmark)projectLandmark(copy).catch(()=>{});
      else if (item) Promise.resolve(loadAny(item)).then((model) => { if (model && state.placed.includes(copy)) project(copy, model); });
      selectedUid = copy.uid;
      if (commitRecords(before)) renderCount();
      renderInspector();
      return;
    }
    const turn = action === 'rotate-left' ? -Math.PI / 12 : action === 'rotate-right' ? Math.PI / 12 : Math.PI / 2;
    changeSelected((p) => {
      p.record = { ...p.record, yaw: (p.record.yaw || 0) + turn };
      if (p.mesh) p.mesh.rotation.y = p.record.yaw;
    });
    renderInspector();
  });
  const inspectorScale = inspector.querySelector('input[type="range"]');
  inspectorScale.addEventListener('pointerdown', () => { inspectorScaleBefore = cloneRecords(); });
  inspectorScale.addEventListener('input', () => {
    const p = selectedProp(); if (!p || p.record.locked) return;
    if (!inspectorScaleBefore) inspectorScaleBefore = cloneRecords();
    const value = Number(inspectorScale.value);
    p.record = { ...p.record, scale: [value, value, value] };
    if (p.mesh) p.mesh.scale.setScalar(value);
    inspector.querySelector('.prop-inspector-scale span').textContent = `${Math.round(value * 100)}%`;
  });
  const finishInspectorScale = () => {
    if (!inspectorScaleBefore) return;
    const before = inspectorScaleBefore; inspectorScaleBefore = null;
    commitRecords(before); renderInspector();
  };
  inspectorScale.addEventListener('change', finishInspectorScale);
  inspectorScale.addEventListener('blur', finishInspectorScale);
  inspector.querySelector('.prop-inspector-lock input').addEventListener('change', (event) => {
    const p = selectedProp(); if (!p) return;
    const before = cloneRecords();
    p.record = { ...p.record, locked: !!event.target.checked };
    if (p.mesh) p.mesh.userData.locked = p.record.locked;
    commitRecords(before); renderInspector();
  });

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
    const hosts=document.createElement('option');hosts.value='skill-hosts';hosts.textContent=currentLang()==='zh-Hant'?'技能之家':'Skill Homes';tabsEl.appendChild(hosts);
    if(LANDMARK_WORKSHOP_ENABLED){const landmarks=document.createElement('option');landmarks.value='landmarks';landmarks.textContent=currentLang()==='zh-Hant'?'地標工作坊':'Landmark Workshop';tabsEl.appendChild(landmarks);}
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
    if (!query && activeCat === 'landmarks' && LANDMARK_WORKSHOP_ENABLED) {
      resultsEl.textContent=currentLang()==='zh-Hant'?'4 個可自訂地標':'4 customizable landmarks';
      landmarkModule().then(mod=>{
        if(destroyed||activeCat!=='landmarks'||searchEl.value.trim())return;
        listEl.replaceChildren();
        for(const item of mod.landmarkItems(currentLang())){const card=document.createElement('button');card.type='button';card.className='prop-lib-card landmark-card';card.setAttribute('aria-label',`${t('props.place')} ${item.name}`);card.innerHTML='<span class="prop-lib-thumb" aria-hidden="true" style="display:grid;place-items:center;font-size:52px"></span><span class="prop-lib-name"></span><span class="prop-lib-place"></span>';card.querySelector('.prop-lib-thumb').textContent=item.emoji;card.querySelector('.prop-lib-name').textContent=item.name;card.querySelector('.prop-lib-place').textContent=`${t('props.place')} · ${item.complexity}★`;card.addEventListener('click',()=>startPlacement(item));listEl.append(card);}
      }).catch(()=>{resultsEl.textContent=t('props.unsupportedSaved');});
      return;
    }
    if (!query && activeCat === 'skill-hosts') {
      resultsEl.textContent=currentLang()==='zh-Hant'?'5 個永久技能位置':'5 permanent skill homes';
      for(const [type,host] of Object.entries(SKILL_HOSTS)){const item=skillHostItem(`${SKILL_HOST_PREFIX}${type}`,currentLang());const card=document.createElement('button');card.type='button';card.className='prop-lib-card landmark-card';card.innerHTML='<span class="prop-lib-thumb" aria-hidden="true" style="display:grid;place-items:center;font-size:52px"></span><span class="prop-lib-name"></span><span class="prop-lib-place"></span>';card.querySelector('.prop-lib-thumb').textContent=host.emoji;card.querySelector('.prop-lib-name').textContent=item.name;card.querySelector('.prop-lib-place').textContent=currentLang()==='zh-Hant'?'放置永久技能位置':'Place permanent skill home';card.addEventListener('click',()=>startPlacement(item));listEl.append(card);}return;
    }
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

  async function renderMyModels() {
    const renderGeneration=++myModelsRenderGeneration;
    let stored=[];
    try { stored=await customModelStore.all(); }
    catch { /* The cards still render and explain that their files are unavailable. */ }
    if(destroyed||renderGeneration!==myModelsRenderGeneration||activeCat!=='mine')return;
    listEl.replaceChildren();
    const available=new Set(stored.filter(record=>record?.bytes).map(record=>record.id));
    resultsEl.textContent = `${customManifest.models.length} My Models`;
    const upload = document.createElement('button'); upload.type='button'; upload.className='prop-lib-card';
    upload.innerHTML='<span class="prop-lib-name">＋ Add a GLB model</span><span class="prop-lib-place">Device only · 12 MB each</span>';
    upload.addEventListener('click', () => fileInput.click()); listEl.append(upload);
    for (const meta of customManifest.models) {
      const item = customItem(meta.id); const missing=!available.has(meta.id); const card=document.createElement('div'); card.className='prop-lib-card';
      card.dataset.modelState=missing?'missing':'ready';
      card.innerHTML='<span class="prop-lib-name"></span><button type="button" class="prop-lib-tb-btn">Place</button><button type="button" class="prop-lib-tb-btn">Replace file</button><button type="button" class="prop-lib-tb-btn">Building role</button><button type="button" class="prop-lib-tb-btn">Rename</button><button type="button" class="prop-lib-tb-btn">Remove</button>';
      card.querySelector('.prop-lib-name').textContent=`◆ ${item.name}${missing?' · file needed':''}`;
      const [place, replace, role, rename, remove] = card.querySelectorAll('button');
      place.disabled=missing;
      replace.textContent=missing?'Re-add file':'Replace file';
      place.addEventListener('click', () => startPlacement(item));
      replace.addEventListener('click', () => { fileInput.dataset.replace = meta.id; fileInput.click(); });
      role.addEventListener('click', () => { const current=Object.entries(customManifest.overrides).filter(([,id])=>id===meta.id).map(([r])=>r).join(', '); const named=window.prompt(`Use this model for which planner building role?\nExamples: school, hospital, city_central. Leave blank to clear.\nCurrent: ${current||'none'}`,''); if(named===null)return; for(const [r,id] of Object.entries(customManifest.overrides))if(id===meta.id)delete customManifest.overrides[r]; for(const r of named.split(',').map(x=>x.trim()).filter(Boolean))customManifest.overrides[r]=meta.id; writeCustomManifest(customManifest); toast('Building visual saved. Reload the city to see it.'); });
      rename.addEventListener('click', () => { const name=window.prompt('Name this model',meta.name); if(name?.trim()){meta.name=name.trim().slice(0,80);writeCustomManifest(customManifest);renderMyModels();} });
      remove.addEventListener('click', async () => { const uses=state.placed.filter(p=>p.record.id===item.id).length; if(!window.confirm(`Remove ${meta.name}? This also removes ${uses} placed copy${uses===1?'':'ies'}.`))return; state.placed.filter(p=>p.record.id===item.id).forEach(removeMesh); state.placed=state.placed.filter(p=>p.record.id!==item.id); customManifest.models=customManifest.models.filter(m=>m.id!==meta.id); for(const [role,id] of Object.entries(customManifest.overrides))if(id===meta.id)delete customManifest.overrides[role]; writeCustomManifest(customManifest); await customModelStore.remove(meta.id); _cache.delete(item.id); persist();renderCount();renderMyModels(); });
      listEl.append(card);
    }
  }
  const fileInput=document.createElement('input'); fileInput.type='file'; fileInput.accept='.glb,model/gltf-binary'; fileInput.hidden=true; document.body.append(fileInput);
  const onSkillSocket = (event) => {
    const button=event.target?.closest?.('[data-skill-host]'); if(!button)return;
    const p=state.placed.find(entry=>entry.record?.instanceId===button.dataset.skillHost); if(!p)return;
    editSkillHostDialog(p.record,getCapabilities(),currentLang(),customManifest.models).then(async result=>{if(!result)return;if(result.openWorkshop){location.href=workshopUrl(p.record);return;}if(!result.value||p.record.locked)return;const before=cloneRecords();p.record=result.value;removeMesh(p);await projectSkillHost(p);commitRecords(before);renderInspector();}).catch(()=>toast('Could not open this skill.',true));
  };
  document.addEventListener('click',onSkillSocket);
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
    Promise.resolve().then(() => item.host ? createSkillHostRoot(newSkillHostRecord(item.hostType),{capabilities:getCapabilities()}) : loadAny(item)).catch(() => null).then((model) => {
      if (destroyed || state.current !== current) return;
      state.current.ghostModel = model;
      if(item.landmark)current.landmarkRecord=model?.userData?.defaultLandmarkRecord;
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
    let proposed = state.current.item.host ? newSkillHostRecord(state.current.item.hostType)
      : state.current.item.landmark && state.current.landmarkRecord
      ? { ...JSON.parse(JSON.stringify(state.current.landmarkRecord)), x, y:0, z, yaw:state.current.yaw }
      : { id: state.current.item.id, x, y: 0, z, yaw: state.current.yaw };
    const resolved = resolvePlacement ? resolvePlacement({ position: [x, z], footprint: state.current.item.footprint || [2, 2],
      rotation: state.current.yaw, item: state.current.item, record: proposed, context: 'new' }) : { ok: true, position: [x, z] };
    if (resolved === false || (resolved && resolved.ok === false)) { toast('🚧 That spot blocks a road — try the verge or another clear space.', true); return; }
    const position = Array.isArray(resolved) ? resolved : resolved?.position || [x, z];
    proposed.x = position[0]; proposed.z = position[1];
    const before = cloneRecords();
    const p = { uid: _uidSeq++, record: withInstanceId(proposed), mesh: null };
    state.placed.push(p);
    if(state.current.item.host)projectSkillHost(p).catch(()=>toast(t('props.unsupportedSaved'),true));
    else if(state.current.item.landmark)projectLandmark(p).catch(()=>toast(t('props.unsupportedSaved'),true));
    else project(p, state.current.ghostModel);
    // Soft performance warning once a city gets crowded (no behaviour change —
    // the cap is informational only; kids can keep placing if they want).
    if (state.placed.length === PLACED_PROP_WARN) toast(t('props.manyProps'));
    if (!commitRecords(before)) return;
    renderCount();
    if (onPlaced) { try { onPlaced(position[0], position[1]); } catch (e) { /* ignore */ } }

  }

  function undoLast() {
    if (destroyed || restoreActive) return;
    if (history.undo().ok) { renderCount(); }
    else toast(t('props.nothingToUndo'));
  }

  // ── Placement input (overlay eats canvas events; host orbit/raycasts are inert) ──
  overlay.addEventListener('pointermove', (e) => {
    e.stopPropagation();
    if (!state.placing || !state.current || !state.current.ghostModel) return;
    const pt = groundPoint(e.clientX, e.clientY);
    if (pt) {
      const resolved = resolvePlacement ? resolvePlacement({ position: [pt.x, pt.z], footprint: state.current.item.footprint || [2, 2],
        rotation: state.current.yaw, item: state.current.item, context: 'preview' }) : { ok: true, position: [pt.x, pt.z] };
      ghost.visible = !(resolved === false || resolved?.ok === false);
      const position = Array.isArray(resolved) ? resolved : resolved?.position || [pt.x, pt.z];
      ghost.position.set(position[0], 0, position[1]);
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
    renderInspector();
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
    if (Array.isArray(records)) state.placed = records.map(record => ({ uid: _uidSeq++, record: withInstanceId(record), mesh: null }));
    else if (raw !== null) unreadable = true;
  } catch { unreadable = true; }
  // Legacy records are repaired once through the optional host resolver. Keep
  // an in-memory recovery snapshot and expose one-tap restore through the API.
  let safetyRepair = null;
  if (!unreadable && resolvePlacement && state.placed.length) {
    const original = state.placed.map((p) => ({ ...p.record }));
    let moved = 0;
    for (const p of state.placed) {
      if (!validRecord(p.record)) continue;
      const item = itemFor(p.record.id); if (!item) continue;
      const result = resolvePlacement({ position: [p.record.x || 0, p.record.z || 0], footprint: item.footprint || [2, 2],
        rotation: p.record.yaw || 0, item, record: p.record, context: 'restore' });
      if (!result || result.ok === false) continue;
      const position = Array.isArray(result) ? result : result.position;
      if (position && (position[0] !== p.record.x || position[1] !== p.record.z)) { p.record.x = position[0]; p.record.z = position[1]; moved++; }
    }
    if (moved) { safetyRepair = { moved, original }; persist(); toast(`🛣️ Moved ${moved} saved item${moved === 1 ? '' : 's'} off the road.`, true); }
  }
  if (unreadable) toast(t('props.unreadableSaved'), true);
  renderRecords();
  // Returning from Model Studio is an explicit one-instance commit. A stale,
  // cancelled, or mismatched draft is ignored and leaves the city untouched.
  (async () => {
    const transferId=new URLSearchParams(location.search).get('studioTransfer'); if(!transferId)return;
    try {
      const transfer=await consumeModelTransfer(transferId);
      const p=transfer && state.placed.find(entry=>entry.record?.instanceId===transfer.instanceId);
      if(!p || p.record.id!==transfer.baseId) return;
      const all=await customModelStore.all(); const used=all.reduce((n,m)=>n+(m.bytes?.byteLength||0),0);
      const checked=validateGLB(transfer.result.bytes,{totalBytes:used}); if(!checked.ok){toast(checked.error,true);return;}
      const modelId=`studio-${transfer.id}`;
      await customModelStore.put({id:modelId,bytes:transfer.result.bytes,name:`${transfer.name||'My model'} — revision`,createdAt:new Date().toISOString()});
      if(!customManifest.models.some(m=>m.id===modelId))customManifest.models.push({id:modelId,name:`${transfer.name||'My model'} — revision`,createdAt:new Date().toISOString()});
      writeCustomManifest(customManifest);
      const before=cloneRecords();
      p.record={...p.record,visualSource:{kind:'custom',modelId},studioHistory:[...(p.record.studioHistory||[]),p.record.visualSource||null].slice(-5)};
      removeMesh(p); const item=itemFor(p.record.id);
      if(item?.host)await projectSkillHost(p);else { const model=await loadCustom(customItem(modelId));if(model)project(p,model); }
      commitRecords(before);renderInspector();toast('Saved to this city object. Undo is ready here.');
      const clean=new URL(location.href);clean.searchParams.delete('studioTransfer');history.replaceState({},'',clean.href);
    } catch { toast('Your Model Studio draft could not be restored. The original is safe.',true); }
  })();

  const api = {
    open: openPanel,
    close: closePanel,
    isOpen: () => state.panelOpen,
    isPlacing: () => state.placing,
    isReadyToPlace: () => !!state.placing && !!state.current?.ghostModel,
    getCount: () => state.placed.length,
    getRecords: () => state.placed.map((p) => ({ ...p.record })),
    getSafetyRepair: () => safetyRepair && { moved: safetyRepair.moved },
    restoreSafetyRepair() {
      if (!safetyRepair || safetyRepair.original.length !== state.placed.length) return false;
      state.placed.forEach((p, i) => { p.record = { ...safetyRepair.original[i] }; });
      safetyRepair = null; persist(); renderRecords(); notifyChanged(); return true;
    },
    snapshot,
    get storageFailed() { return storageError; },
    /**
     * Bounded City demonstrations share the existing props Champion File
     * section. Updating through this owner prevents a later prop edit from
     * replacing newer metadata with the envelope captured at boot.
     */
    readEnvelope: () => envelope,
    async insertLandmark(templateId, transform={}) {
      if(destroyed||restoreActive||!LANDMARK_WORKSHOP_ENABLED)return null;
      const mod=await landmarkModule(),record=mod.makeLandmarkRecord(templateId,transform);if(!record)return null;
      const before=cloneRecords(),p={uid:_uidSeq++,record:withInstanceId(record),mesh:null};state.placed.push(p);await projectLandmark(p);if(!commitRecords(before)){removeMesh(p);state.placed=state.placed.filter(x=>x!==p);return null;}renderCount();return p.record.instanceId;
    },
    async updateLandmark(instanceIdValue, config) {
      const p=state.placed.find(e=>e.record?.instanceId===instanceIdValue);if(!p||p.record.locked||!itemFor(p.record.id)?.landmark)return false;
      const mod=await landmarkModule(),checked=mod.validateLandmarkRecord({...p.record,landmark:{...p.record.landmark,config}});if(!checked.ok)return false;
      const before=cloneRecords();p.record={...p.record,landmark:{...p.record.landmark,config:checked.config}};removeMesh(p);await projectLandmark(p);return commitRecords(before);
    },
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
    beginTransform(mesh) {
      if (!mesh || mesh.userData.locked || transformBefore) return;
      transformBefore = cloneRecords();
    },
    endTransform() {
      if (!transformBefore) return;
      const before = transformBefore; transformBefore = null;
      commitRecords(before); renderInspector();
    },
    updateTransform(mesh, scaleOnly = false) {
      if (destroyed || restoreActive || !mesh) return;
      const p = state.placed.find(p => p.uid === mesh.userData.uid);
      if (!p || p.record.locked) return;
      const before = transformBefore || cloneRecords();
      const next = { ...p.record, scale: mesh.scale.toArray() };
      if (!scaleOnly) Object.assign(next, { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z, yaw: mesh.rotation.y });
      if (!validRecord(next)) return;
      p.record = next;
      if (!transformBefore) commitRecords(before);
      renderInspector();
    },
    moveProp(uidOrId, x, z, yaw) {
      if (destroyed || restoreActive) return;
      const p = state.placed.find(e => e.uid === uidOrId) || state.placed.find(e => e.record?.id === uidOrId);
      if (!p || p.record.locked) return;
      const before = cloneRecords();
      const next = { ...p.record, x, z, yaw };
      if (!validRecord(next)) return;
      p.record = next;
      if (p.mesh) { p.mesh.position.x = x; p.mesh.position.z = z; p.mesh.rotation.y = yaw; }
      commitRecords(before);
    },
    clear: clearAll,
    selectMesh(mesh) {
      selectedUid = mesh?.userData?.uid ?? null;
      renderInspector();
    },
    removeSelected,
    undo() { const result = history.undo(); if (result.ok) renderCount(); return result; },
    redo() { const result = history.redo(); if (result.ok) renderCount(); return result; },
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
      document.removeEventListener('click', onSkillSocket);
      [style, button, panel, toolbar, inspector, hint, overlay, toastEl, fileInput].forEach(el => el?.remove());
      ghost.removeFromParent();
      if (window.__propLibrary === api) delete window.__propLibrary;
    },
  };
  window.__propLibrary = api;
  return api;
}
