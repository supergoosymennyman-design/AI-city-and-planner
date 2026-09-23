// shared/scenario.js — the scenario shell shared by lab / spaceship / station.
// mountScenario(config) boots one scenario: room (GLB or procedural buildRoom),
// champion, the 👉 Select → ✋ Pick up → tap-to-place interaction, 🔄 rotate,
// 📏 resize, 👁️ first-person, 🤖 skins and the AI champion chatbox.
// Each scenario is a config; the lab adds a template picker on top.
import * as THREE from 'three';
import { createGLTFLoader } from './gltf.js';
import { createChampion } from '../hong-kong-real/champion-real.js';
import {
  addCollider, setupInteriorLights, updateWallFade, updateCeilingFade, resolveCollision,
  makeChampionDisc, anchorDisc, makeActiveRing, LAB_DIMS,
} from './interior.js';
import { createGrabSystem } from './grab.js';
import { nearestAnchor } from './anchors.js';
import { openLibraryPicker } from './library-picker.js';
import { libraryUrl, libraryItem } from '../city-common/library.js';
import { itemTargetBounds, uniformScaleForBounds } from '../city-common/model-scale.js';
import { mountSkinSidebar } from '../champion-city/skins.js';
import { preloadAccessories } from '../champion-city/accessories.js';
import { mountScenarioBuddy } from './scenario-buddy.js';
import { attachContextLossGuard } from '../champion-city/context-guard.js';
import { HOME_URL } from './links.js';

const ASSET_BASE = '../champion-city/assets/';
const CHAMPION_SCALE = 1.0;   // legacy multiplier; city requests an exact 1.8 m height

const IS_MOBILE = ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || window.innerWidth <= 768;
const LOW_END = IS_MOBILE && (
  (navigator.deviceMemory && navigator.deviceMemory <= 4) ||
  (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4)
);

let scene, camera, renderer;
let cfg = null;
let roomDims = LAB_DIMS;
let champion = null;
let championPoint = null;
let championDisc = null;
let activeRing = null;
let colliders = [];
let walls = [];
let platforms = [];   // walkable raised platforms (from buildMultiRoom)
let wallProps = [];
let anchors = [];
let pads = [];
let floorMesh = null;
let grab = null;
let _ceiling = null;
let orbit = { theta: 0.6, phi: 1.0, dist: 8, locked: false };
let viewMode = 'orbit';
let lookPitch = 0;
let selectMode = false;
let zone = null;               // two-zone scenarios (station): 'outside' | 'inside'
let zoneGroups = {};
let zoneColliders = {};
let zoneFillLights = {};
let zoneDoors = {};            // zone -> {x, z} door/airlock position (proximity-gated enter/exit)
const input = { x: 0, z: 0, running: false };
let keys = {};

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.getElementById('toasts').appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 2200);
}

/** Boot a scenario config (sets HUD, builds the scene, spawns the champion). */
export function mountScenario(config) {
  cfg = config;
  if (config.zones) zone = config.initialZone || 'outside';   // initial zone before spawn
  document.getElementById('hud-title').textContent = `${config.emoji || '🧪'} ${config.title}`;
  document.getElementById('hud-chip').textContent = config.blurb || '';
  const d0 = config.dims || LAB_DIMS;
  orbit.dist = config.orbitDist || Math.max(5, Math.min(8, Math.min(d0.w, d0.d) * 0.55));
  if (config.defaultView === 'first') {
    viewMode = 'first';
    document.getElementById('view-toggle')?.classList.add('active');
    document.getElementById('view-toggle')?.setAttribute('aria-pressed', 'true');
  }
  setupScene(config);
  // Start the loop even if the champion fails to load — the room still renders
  // and the child isn't stuck on a black screen (champion simply absent).
  spawnChampion().then(
    () => requestAnimationFrame(loop),
    (e) => { console.warn('[scenario] champion load failed — running without champion', e); requestAnimationFrame(loop); }
  );
}

// ── Scene setup ────────────────────────────────────────────────────────────
function setupScene(config) {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(config.lights.hemiSky);
  scene.fog = new THREE.Fog(config.lights.hemiSky, config.fogNear ?? 18, config.fogFar ?? 46);

  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 80);
  const d0 = config.dims || LAB_DIMS;
  camera.position.set(0, d0.h * 0.95, d0.d * 0.72);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, LOW_END ? 1 : (IS_MOBILE ? 1.25 : 2)));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = false;
  document.getElementById('stage').appendChild(renderer.domElement);

  // WebGL context loss (memory pressure on tablets) → friendly overlay, auto-resume.
  attachContextLossGuard(renderer, { label: 'The room paused' });
  window.__contextGuard = true; // diagnostics/test hook

  if (config.zones) {
    setupZonesScene(config);
  } else if (config.kind === 'room') {
    setupRoomScene(config, scene, colliders);
  } else if (config.buildRoom) {
    setupProceduralScene(config);
  }

  championPoint = setupInteriorLights(scene, config.lights);

  buildAnchorsAndGrabbables(config, config.zones ? zoneGroups.inside : scene);

  championDisc = makeChampionDisc();
  scene.add(championDisc);

  grab = createGrabSystem(scene, {
    getChampion: () => champion,
    getCamera: () => camera,
    getScene: () => scene,
    anchors,
    colliders,
    pads,
    onToast: toast,
    onHighlight: highlightAnchors,
  });
  window.__grab = grab;

  if (floorMesh) grab.addSurfaces([floorMesh], { floor: true });
  if (config.zones && zoneGroups.outside && zoneGroups.outside.userData.deck) {
    grab.addSurfaces([zoneGroups.outside.userData.deck], { floor: true });   // outside deck is placeable
  }

  wireOrbitDrag();
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  if (config.zones) {
    // Read per-zone door/airlock positions for the proximity-gated Enter/Exit.
    zoneDoors.outside = (config.zones.outside && config.zones.outside.door) || null;
    zoneDoors.inside = (config.zones.inside && config.zones.inside.door) || null;
    applyZone(cfg.initialZone || 'outside', config);
    // Enter/Exit button starts hidden; shown only when the champion nears the door.
    const zt = document.getElementById('zone-toggle');
    if (zt) zt.style.display = 'none';
  }

  toast(`🧪 Welcome to ${config.title}!`);
}

/** Anchors/pads/grabbables go into `parent` (scene for single-zone, inside group for zones). */
function buildAnchorsAndGrabbables(config, parent) {
  anchors = config.anchors || [];
  pads = [];
  for (const a of anchors) {
    const disc = anchorDisc(a.r, a.y > 0 ? 0xD9E7EF : 0xDFE9EF, config.accent || 0x18a9d6);
    disc.position.set(a.x, a.y + (cfg.walkY || 0) + 0.003, a.z);
    disc.userData.anchor = a;
    parent.add(disc);
    pads.push(disc);
  }
  activeRing = makeActiveRing(0.28);
  scene.add(activeRing);
  buildGrabbables(config, parent);
}

/** Procedural scenario: parameterised room shell + placed furniture. */
function setupProceduralScene(config) {
  const shell = config.buildRoom(scene, config);
  roomDims = shell.dims || LAB_DIMS;
  walls = shell.walls || [];
  _ceiling = shell.ceiling || null;
  colliders = shell.colliders || [];
  floorMesh = shell.floor || null;
  wallProps = [];
  platforms = shell.platforms || [];
  loadGrouped(config);
}

/** Room scenario: load the imported room GLB, champion walks through. */
function setupRoomScene(config, parentGroup, collidersTarget) {
  const parent = parentGroup || scene;
  const colTarget = collidersTarget || colliders;
  roomDims = config.dims || LAB_DIMS;
  walls = [];
  _ceiling = null;
  colTarget.length = 0;
  floorMesh = null;
  wallProps = [];
  const item = libraryItem(config.roomId);
  if (!item) { console.warn('[scenario] missing room item', config.roomId); return; }
  const loader = createGLTFLoader();
  loader.load(libraryUrl(item), (gltf) => {
    const g = gltf.scene;
    scaleToFootprint(g, item, 1);
    g.userData.libraryId = item.id;
    window.__roomGroup = g;
    parent.add(g);
    const prev = colliders; colliders = colTarget;
    deriveRoomColliders(g, roomDims);
    colliders = prev;
    settleSpawn(g);
    if (grab) grab.addSurfaces(g, { floor: true });
  }, undefined, (e) => console.warn('[scenario] room load failed', config.roomId, e));
}

// ── Two-zone scenarios (station: outside space deck ↔ inside room) ─────────
function makeFillLight(fl) {
  const l = new THREE.PointLight(fl.color, fl.intensity, fl.distance, fl.decay || 2);
  l.position.set(fl.x, fl.y, fl.z);
  l.visible = false;
  scene.add(l);
  return l;
}

function setupZonesScene(config) {
  const z = config.zones;
  zoneGroups.outside = new THREE.Group();
  zoneGroups.inside = new THREE.Group();
  scene.add(zoneGroups.outside);
  scene.add(zoneGroups.inside);

  // Inside = the room (hangar) + its grabbables/anchors (added to the inside group).
  zoneColliders.inside = [];
  const prevColliders = colliders;
  colliders = zoneColliders.inside;
  setupRoomScene({ ...config, roomId: z.inside.roomId || config.roomId, dims: z.inside.dims || config.dims, walkY: z.inside.walkY || 0 }, zoneGroups.inside, zoneColliders.inside);
  colliders = prevColliders;

  // Outside = space deck + station backdrop + stars.
  zoneColliders.outside = [];
  buildOutsideZone(config, zoneGroups.outside);

  // Per-zone fill lights.
  zoneFillLights.outside = (z.outside.fillLights || []).map(makeFillLight);
  zoneFillLights.inside = (z.inside.fillLights || config.fillLights || []).map(makeFillLight);

  // Enter/Exit button.
  const btn = document.getElementById('zone-toggle');
  if (btn) btn.addEventListener('click', () => {
    const next = zone === 'outside' ? 'inside' : 'outside';
    applyZone(next, config);
    toast(next === 'outside' ? '🚀 Exited to space!' : '🛰️ Entered the station!');
  });
}

function buildOutsideZone(config, group) {
  const z = config.zones.outside;
  const r = z.deckRadius || 12;
  // flat deck (square platform — simple collision)
  const deck = new THREE.Mesh(
    new THREE.PlaneGeometry(r * 2, r * 2),
    new THREE.MeshLambertMaterial({ color: z.deckColor || 0x3a4a52 })
  );
  deck.rotation.x = -Math.PI / 2;
  deck.position.y = 0;
  group.add(deck);
  group.userData.deck = deck;   // placeable surface
  // deck edge ring
  const edge = new THREE.Mesh(
    new THREE.BoxGeometry(r * 2, 0.4, 0.4),
    new THREE.MeshLambertMaterial({ color: z.edgeColor || 0x2c3a42 })
  );
  for (const [ex, ez, ry] of [[0, r, 0], [0, -r, 0], [r, 0, Math.PI / 2], [-r, 0, Math.PI / 2]]) {
    const e = edge.clone();
    e.position.set(ex, 0.2, ez);
    e.rotation.y = ry;
    group.add(e);
  }
  // deck perimeter colliders
  zoneColliders.outside.push({ minX: -r, maxX: r, minZ: -r, maxZ: -r + 0.3 });
  zoneColliders.outside.push({ minX: -r, maxX: r, minZ: r - 0.3, maxZ: r });
  zoneColliders.outside.push({ minX: -r, maxX: -r + 0.3, minZ: -r, maxZ: r });
  zoneColliders.outside.push({ minX: r - 0.3, maxX: r, minZ: -r, maxZ: r });

  // station backdrop
  if (z.backdrop) {
    const item = libraryItem(z.backdrop);
    if (item) {
      const loader = createGLTFLoader();
      loader.load(libraryUrl(item), (gltf) => {
        const b = gltf.scene;
        scaleToFootprint(b, item, 1);
        const off = z.backdropOffset || { x: 0, y: 0, z: 0 };
        b.position.set(off.x, off.y, off.z);
        group.add(b);
      }, undefined, (e) => console.warn('[scenario] backdrop load failed', z.backdrop, e));
    }
  }

  // starfield
  const starCount = z.stars !== false ? 600 : 0;
  if (starCount) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(60 + Math.random() * 80);
      pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.6, sizeAttenuation: false }));
    group.add(stars);
  }
}

function applyZone(next, config) {
  zone = next;
  const zcfg = config.zones[next];
  zoneGroups.outside.visible = (next === 'outside');
  zoneGroups.inside.visible = (next === 'inside');
  colliders.length = 0;
  if (zoneColliders[next]) colliders.push(...zoneColliders[next]);
  roomDims = zcfg.dims || (config.dims || LAB_DIMS);
  if (champion) {
    const sp = zcfg.spawn || { x: 0, z: 0 };
    champion.state.pos.x = sp.x; champion.state.pos.z = sp.z;
    champion.group.position.x = sp.x; champion.group.position.z = sp.z;
  }
  const bg = zcfg.background || config.lights.hemiSky;
  scene.background = new THREE.Color(bg);
  scene.fog = new THREE.Fog(bg, config.fogNear ?? 18, config.fogFar ?? 46);
  if (championPoint && championPoint.userData.hemi) {
    const hemi = championPoint.userData.hemi;
    hemi.color.setHex(zcfg.hemiSky || config.lights.hemiSky);
    hemi.groundColor.setHex(zcfg.hemiGround || config.lights.hemiGround);
    hemi.intensity = zcfg.hemiIntensity ?? config.lights.hemiIntensity;
  }
  for (const zname of ['outside', 'inside']) {
    for (const l of (zoneFillLights[zname] || [])) l.visible = (zname === next);
  }
  const btn = document.getElementById('zone-toggle');
  if (btn) {
    btn.textContent = next === 'outside' ? '🚪 Enter' : '🚪 Exit';
    btn.classList.toggle('active', next === 'inside');
  }
}

/** Derive AABB colliders from an imported room GLB (perimeter + solid obstacles). */
function deriveRoomColliders(group, dims) {
  const hw = dims.w / 2, hd = dims.d / 2;
  const roomArea = dims.w * dims.d;
  colliders.push({ minX: -hw, maxX: hw, minZ: -hd, maxZ: -hd + 0.3 });
  colliders.push({ minX: -hw, maxX: hw, minZ: hd - 0.3, maxZ: hd });
  colliders.push({ minX: -hw, maxX: -hw + 0.3, minZ: -hd, maxZ: hd });
  colliders.push({ minX: hw - 0.3, maxX: hw, minZ: -hd, maxZ: hd });

  const boxes = [];
  const _b = new THREE.Box3();
  scene.updateMatrixWorld(true);
  group.traverse((m) => {
    if (!m.isMesh || !m.geometry) return;
    _b.setFromObject(m);
    const w = _b.max.x - _b.min.x, d = _b.max.z - _b.min.z, h = _b.max.y - _b.min.y;
    if (w < 0.35 || d < 0.35 || h < 1.2) return;
    if (_b.min.y > 1.1) return;
    if (_b.max.y < 0.35 || _b.min.y > dims.h - 0.6) return;
    if (w * d > roomArea * 0.35) return;
    boxes.push({ minX: _b.min.x, maxX: _b.max.x, minZ: _b.min.z, maxZ: _b.max.z });
  });
  boxes.sort((a, b) => (b.maxX - b.minX) * (b.maxZ - b.minZ) - (a.maxX - a.minX) * (a.maxZ - a.minZ));
  for (const bx of boxes.slice(0, 40)) colliders.push(bx);
  console.log(`[scenario] room colliders: ${colliders.length} (${boxes.length} obstacles)`);
}

/** Nudge the champion to a clear spot if its spawn overlaps a collider. */
let _settlePending = false;   // room loaded before champion — re-run after spawn
function settleSpawn(roomGroup) {
  if (!champion) {
    // Room GLB finished before the champion was ready — retry once the
    // champion resolves so the spawn nudge isn't silently skipped.
    _settlePending = true;
    return;
  }
  _settlePending = false;
  const p = champion.state.pos;
  const overlaps = (x, z) => {
    const r = 0.5;
    for (const c of colliders) {
      if (x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r) return true;
    }
    return false;
  };
  if (!overlaps(p.x, p.z)) return;
  const candidates = [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2], [3, 3], [-3, 3], [3, -3], [-3, -3]];
  const cx = roomDims.w / 2 - 2, cz = roomDims.d / 2 - 2;
  for (const [x, z] of candidates) {
    const wx = Math.max(-cx, Math.min(cx, x));
    const wz = Math.max(-cz, Math.min(cz, z));
    if (!overlaps(wx, wz)) {
      champion.state.pos.x = wx; champion.state.pos.z = wz;
      champion.group.position.x = wx; champion.group.position.z = wz;
      console.log('[scenario] spawn nudged to', wx, wz);
      return;
    }
  }
}

// ── Furniture placement (procedural + added items) ─────────────────────────
function loadGrouped(config) {
  const groups = {};
  for (const f of (config.furniture || [])) {
    if (f.id.startsWith('__')) { placeSynthetic(f); continue; }
    (groups[f.id] = groups[f.id] || []).push(f);
  }
  for (const [id, spots] of Object.entries(groups)) {
    const item = libraryItem(id);
    if (!item) { console.warn('[scenario] unknown library id', id); continue; }
    const loader = createGLTFLoader();
    loader.load(libraryUrl(item), (gltf) => {
      if (spots.length === 1 || spots.some((s) => s.wall)) {
        for (const s of spots) placeSingle(item, s, gltf.scene.clone(true));
      } else {
        placeInstanced(item, spots, gltf.scene);
      }
    }, undefined, (e) => console.warn('[scenario] load failed', id, e));
  }
}

function scaleToFootprint(g, item, extra) {
  const box = new THREE.Box3().setFromObject(g);
  const size = box.getSize(new THREE.Vector3());
  if (item.category === 'buildings') {
    g.scale.setScalar(uniformScaleForBounds(size, itemTargetBounds(item), extra || 1));
    return;
  }
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const target = Math.max(item.footprint[0], item.footprint[1], item.height || 1) * (extra || 1);
  g.scale.setScalar(target / maxDim);
}

// Furniture collides a touch tighter than the walls (0.5) so the champion can
// still slip between closely-placed items instead of wedging in every gap.
const FURNITURE_COLLIDER_RADIUS = 0.4;

/** Footprint for a furniture collider, honouring the item's rotY (90/270 swap
 *  width/depth so the collider matches the rotated mesh instead of over-blocking
 *  one axis and under-blocking the other). */
function furnitureFootprint(item, f) {
  const s = f.scale || 1;
  const rot = ((f.rotY || 0) % 360 + 360) % 360;
  const [w, d] = item.footprint;
  const fp = (rot === 90 || rot === 270) ? [d * s, w * s] : [w * s, d * s];
  return fp;
}

function tagWall(f, g) {
  if (f.wall) {
    g.userData.wallProp = true;
    g.userData.wallSide = f.wall;
    wallProps.push(g);
  }
}

function placeSingle(item, f, g) {
  scaleToFootprint(g, item, f.scale);
  g.rotation.y = THREE.MathUtils.degToRad(f.rotY || 0);
  const box = new THREE.Box3().setFromObject(g);
  const c = box.getCenter(new THREE.Vector3());
  const h = box.max.y - box.min.y;
  g.position.set(f.x - c.x, f.wall ? (f.y - h / 2) : (f.y || 0), f.z - c.z);
  g.userData.libraryId = item.id;
  tagWall(f, g);
  scene.add(g);
  if (grab) grab.addSurfaces(g);
  if (!f.wall && !(f.y > 0) && f.collider !== false) {
    addCollider(colliders, f.x, f.z, furnitureFootprint(item, f), FURNITURE_COLLIDER_RADIUS);
  }
}

function placeInstanced(item, spots, scene0) {
  scene0.updateMatrixWorld(true);
  const leaves = [];
  scene0.traverse((o) => { if (o.isMesh) leaves.push(o); });
  const fallback = leaves.length === 0 || leaves.some((l) => Array.isArray(l.material));
  if (fallback) {
    for (const s of spots) placeSingle(item, s, scene0.clone(true));
    return;
  }
  const box = new THREE.Box3().setFromObject(scene0);
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z) || 1;
  const target = Math.max(item.footprint[0], item.footprint[1], item.height || 1) * (spots[0].scale || 1);
  const norm = target / maxDim;
  const Y_AXIS = new THREE.Vector3(0, 1, 0);
  const dummy = new THREE.Object3D();
  const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _qY = new THREE.Quaternion();
  for (const leaf of leaves) {
    leaf.matrixWorld.decompose(_p, _q, _s);
    const inst = new THREE.InstancedMesh(leaf.geometry, leaf.material, spots.length);
    inst.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    spots.forEach((f, i) => {
      const rotY = THREE.MathUtils.degToRad(f.rotY || 0);
      _qY.setFromAxisAngle(Y_AXIS, rotY);
      const lp = _p.clone().applyQuaternion(_qY);
      const rc = center.clone().applyQuaternion(_qY);
      dummy.position.set(f.x + lp.x - rc.x, (f.y || 0) + lp.y, f.z + lp.z - rc.z);
      dummy.quaternion.copy(_qY).multiply(_q);
      dummy.scale.copy(_s).multiplyScalar(norm);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    });
    inst.instanceMatrix.needsUpdate = true;
    inst.userData.libraryId = item.id;
    scene.add(inst);
    if (grab) grab.addSurfaces([inst]);
  }
  for (const f of spots) {
    if (f.collider !== false) {
      addCollider(colliders, f.x, f.z, furnitureFootprint(item, f), FURNITURE_COLLIDER_RADIUS);
    }
  }
}

function placeSynthetic(f) {
  if (f.id === '__halo__') {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(f.w, f.h, 0.03),
      new THREE.MeshBasicMaterial({ color: cfg.emissive, toneMapped: false })
    );
    m.position.set(f.x, f.y, f.z);
    m.userData.wallProp = true;
    m.userData.wallSide = f.wall;
    wallProps.push(m);
    scene.add(m);
  } else if (f.id === '__ring__') {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(f.r, f.r + 0.05, 48),
      new THREE.MeshBasicMaterial({ color: f.color, toneMapped: false })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(f.x, 0.007, f.z);
    scene.add(m);
  }
}

export function aoListFromFurniture(config) {
  const list = [];
  for (const f of (config.furniture || [])) {
    if (f.id.startsWith('__') || f.wall || f.y > 0 || f.collider === false) continue;
    const item = libraryItem(f.id);
    if (!item) continue;
    const [w, d] = item.footprint;
    const s = f.scale || 1;
    list.push({ x: f.x, z: f.z, rx: w * s * 0.6 + 0.15, rz: d * s * 0.6 + 0.15, color: '#C2D0DA', strength: 0.5 });
  }
  return list;
}

function highlightAnchors(nearest, carrying) {
  if (!activeRing) return;
  if (nearest && carrying) {
    activeRing.visible = true;
    const pad = pads.find((p) => p.userData.anchor === nearest);
    const r = (pad && pad.userData.anchorRadius) || 0.28;
    activeRing.userData.baseScale = r / 0.28;
    activeRing.position.set(nearest.x, (nearest.y || 0) + (cfg.walkY || 0) + 0.015, nearest.z);
  } else {
    activeRing.visible = false;
  }
}

function buildGrabbables(config, parent) {
  const target = parent || scene;
  for (const gb of (config.grabbables || [])) {
    const item = libraryItem(gb.id);
    if (!item) continue;
    const loader = createGLTFLoader();
    loader.load(libraryUrl(item), (gltf) => {
      const g = gltf.scene;
      scaleToFootprint(g, item, 1.1);
      g.position.set(gb.x, gb.y + (cfg.walkY || 0), gb.z);
      g.rotation.y = THREE.MathUtils.degToRad(gb.rotY || 0);
      g.userData.libraryId = item.id;
      target.add(g);
      grab.register(g, { footprint: [0.3, 0.3], types: gb.types, tabletop: gb.y > 0.1 });
    }, undefined, (e) => console.warn('[scenario] grabbable load failed', gb.id, e));
  }
}

// ── Champion ───────────────────────────────────────────────────────────────
async function spawnChampion() {
  const s = (cfg.zones ? ((cfg.zones[zone] || cfg.zones.outside).spawn || { x: 0, z: 0 }) : (cfg.spawn || { x: 0, z: 3 }));
  champion = await createChampion(ASSET_BASE, {
    spawnWorld: new THREE.Vector3(s.x, 0, s.z),
    scale: CHAMPION_SCALE,
  });
  scene.add(champion.group);
  window.__champion = champion;   // debug / test handle
  orbit.theta = Math.PI;
  // The room GLB may have loaded before the champion was ready; if its spawn
  // still overlaps a collider, nudge now.
  if (_settlePending) settleSpawn(null);

  window.__mountSkinSidebar = () => {
    if (!champion) return;
    mountSkinSidebar(ASSET_BASE, champion, (skin) => toast(`👑 ${skin.name} equipped!`));
  };
  window.__mountLabBuddy = () => {
    if (!champion) return;
    mountScenarioBuddy(cfg.buddy, champion, grab, toast);
  };
  // Preload Hunyuan accessory GLBs so equipping doesn't silently no-op.
  preloadAccessories(ASSET_BASE);
  window.__mountSkinSidebar();
  window.__mountLabBuddy();
}

// ── Input ──────────────────────────────────────────────────────────────────
function readInput() {
  let x = 0, z = 0;
  if (keys['w'] || keys['dir:up']) z += 1;
  if (keys['s']) z -= 1;
  if (keys['a']) x -= 1;
  if (keys['d']) x += 1;
  input.x = x; input.z = z;
}
window.addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  keys[e.key.toLowerCase()] = true;
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) e.preventDefault();
});
window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

const bindHoldMove = (el, run) => {
  if (!el) return;
  const on = (e) => { e.preventDefault(); keys['dir:up'] = true; if (run) input.running = true; };
  const off = (e) => { e.preventDefault(); keys['dir:up'] = false; if (run) input.running = false; };
  el.addEventListener('pointerdown', on);
  el.addEventListener('pointerup', off);
  el.addEventListener('pointercancel', off);
  el.addEventListener('pointerleave', off);
};
bindHoldMove(document.getElementById('btn-walk'), false);
bindHoldMove(document.getElementById('btn-run'), true);
document.getElementById('btn-grab').addEventListener('click', (e) => { e.preventDefault(); grab.grabOrPlace(); });
document.getElementById('btn-add').addEventListener('click', (e) => {
  e.preventDefault();
  openLibraryPicker({ onSelect: (item) => addLibraryItem(item), title: 'Add to this scene' });
});
document.getElementById('view-toggle').addEventListener('click', () => {
  viewMode = viewMode === 'first' ? 'orbit' : 'first';
  document.getElementById('view-toggle').classList.toggle('active', viewMode === 'first');
  document.getElementById('view-toggle').setAttribute('aria-pressed', String(viewMode === 'first'));
  document.getElementById('view-toggle').setAttribute('aria-label', viewMode === 'first' ? 'Switch to third person view' : 'Switch to first person view');
  toast(viewMode === 'first' ? '👁️ First person — drag to look around!' : '🎥 Third person view');
});
document.getElementById('rotate-toggle').addEventListener('click', () => {
  if (grab) grab.rotateHeld();
});
document.getElementById('select-toggle').addEventListener('click', () => {
  selectMode = !selectMode;
  document.getElementById('select-toggle').classList.toggle('active', selectMode);
  document.getElementById('select-toggle').setAttribute('aria-pressed', String(selectMode));
  if (!selectMode && grab) grab.clearSelection();
  toast(selectMode ? '👉 Select mode: tap an object, then ✋ Pick up' : 'Selection off');
});

// Resize tool
let lastAdded = null;
function wireResizeTool() {
  const btn = document.getElementById('resize-toggle');
  const panel = document.getElementById('resize-panel');
  const slider = document.getElementById('resize-slider');
  const val = document.getElementById('resize-val');
  const done = document.getElementById('resize-done');
  btn.addEventListener('click', () => {
    if (!lastAdded) { toast('👀 Add something from the library first!'); return; }
    panel.classList.toggle('open');
    const cur = lastAdded.mult || 1;
    slider.value = cur;
    val.textContent = cur.toFixed(2) + '×';
  });
  slider.addEventListener('input', () => {
    if (!lastAdded) return;
    const mult = parseFloat(slider.value);
    lastAdded.mult = mult;
    lastAdded.group.scale.setScalar(lastAdded.base * mult);
    val.textContent = mult.toFixed(2) + '×';
  });
  done.addEventListener('click', () => { panel.classList.remove('open'); });
}
wireResizeTool();

// ── Prompt bubble ──────────────────────────────────────────────────────────
// ── Home / hub button ───────────────────────────────────────────────────────
// Small 🏠 button (top-right corner) that returns to the hub site. Shared by
// every scenario (hospital / spaceship / station / lab) — no per-app wiring.
(function addHomeButton() {
  const btn = document.createElement('button');
  btn.id = 'hub-toggle';
  btn.setAttribute('aria-label', 'Back to home');
  btn.title = 'Back to home';
  btn.innerHTML = '🏠';
  Object.assign(btn.style, {
    position: 'fixed', top: '12px', right: '16px', zIndex: '60',
    width: '40px', height: '40px', borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(10,15,29,0.85)',
    color: '#eaf2f8', fontSize: '18px', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'border-color 0.15s ease, transform 0.1s ease',
  });
  btn.addEventListener('mouseenter', () => { btn.style.borderColor = '#00ff9d'; });
  btn.addEventListener('mouseleave', () => { btn.style.borderColor = 'rgba(255,255,255,0.25)'; });
  btn.addEventListener('mousedown', () => { btn.style.transform = 'scale(0.92)'; });
  btn.addEventListener('mouseup', () => { btn.style.transform = 'scale(1)'; });
  btn.addEventListener('click', () => {
    window.location.href = HOME_URL;
  });
  document.body.appendChild(btn);
})();

// ── Prompt bubble ──────────────────────────────────────────────────────────
const promptEl = document.createElement('div');
promptEl.id = 'interact-prompt';
document.body.appendChild(promptEl);
const _proj = new THREE.Vector3();
function showHint(text) {
  promptEl.style.display = 'block';
  promptEl.style.left = '50%';
  promptEl.style.top = '64px';
  promptEl.style.transform = 'translateX(-50%)';
  promptEl.textContent = text;
}
function updatePrompt() {
  if (!grab || !champion) { promptEl.style.display = 'none'; return; }
  if (grab.mode !== 'idle' && grab.holding) {
    const obj = grab.holding;
    obj.updateWorldMatrix(true, false);
    _proj.setFromMatrixPosition(obj.matrixWorld);
    if (camera) _proj.project(camera);
    if (_proj.z > 1) { promptEl.style.display = 'none'; return; }
    const x = (_proj.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-_proj.y * 0.5 + 0.5) * window.innerHeight;
    promptEl.style.display = 'block';
    promptEl.style.left = x + 'px';
    promptEl.style.top = (y - 46) + 'px';
    promptEl.style.transform = 'translateX(-50%)';
    promptEl.textContent = '✋ Tap to place';
    return;
  }
  if (selectMode) {
    showHint(grab.getSelected() ? '👉 Selected — press ✋ Pick up' : '👉 Tap an object to select it');
    return;
  }
  promptEl.style.display = 'none';
}

const CATEGORY_ANCHOR = {
  buildings: ['glass', 'sample'], nature: ['glass', 'sample'],
  props: ['glass', 'sample', 'storage'], vehicles: ['storage'],
  characters: ['glass', 'sample'], scenarios: ['glass', 'sample', 'storage'],
};

function addLibraryItem(item) {
  try {
    const loader = createGLTFLoader();
    loader.load(libraryUrl(item), (gltf) => {
      try {
        const g = gltf.scene;
        scaleToFootprint(g, item, 1);
        const types = CATEGORY_ANCHOR[item.category] || ['glass', 'sample'];
        const anchor = nearestAnchor(anchors, champion.state.pos.x, champion.state.pos.z, types);
        const small = (item.footprint[0] * item.footprint[1]) < 0.5 && (item.height || 1) < 0.6;
        const wy = cfg.walkY || 0;
        const fp = [Math.min(item.footprint[0], 4), Math.min(item.footprint[1], 4)];

        if (anchor && anchor.y > 0) {
          g.position.set(anchor.x, anchor.y + wy, anchor.z);
        } else if (anchor) {
          g.position.set(anchor.x, wy, anchor.z);
        } else {
          const fwd = new THREE.Vector3(Math.sin(champion.state.facing), 0, Math.cos(champion.state.facing));
          g.position.set(champion.state.pos.x + fwd.x * 1.6, wy, champion.state.pos.z + fwd.z * 1.6);
        }
        g.userData.libraryId = item.id;
        scene.add(g);
        if (grab) grab.addSurfaces(g);
        lastAdded = { group: g, base: g.scale.x || 1, mult: 1 };
        if (small) {
          grab.register(g, { footprint: item.footprint, types, tabletop: !!(anchor && anchor.y > 0) });
        } else {
          grab.register(g, { footprint: fp, types, movable: true, tabletop: false });
          grab.attach(g);
        }
        toast(`✅ Added ${item.name}!`);
      } catch (err) {
        console.error('[scenario] error placing', item.id, err);
        toast(`⚠️ Couldn't place ${item.name}`);
      }
    }, undefined, () => toast(`⚠️ Couldn't load ${item.name}`));
  } catch (err) {
    console.error('[scenario] error loading', item.id, err);
    toast(`⚠️ Couldn't load ${item.name}`);
  }
}

// ── Drag / tap ─────────────────────────────────────────────────────────────
const dragState = { on: false, sx: 0, sy: 0, moved: 0 };
const tapState = { x: 0, y: 0, t: 0 };
function wireOrbitDrag() {
  renderer.domElement.addEventListener('pointerdown', (e) => {
    dragState.on = true; dragState.sx = e.clientX; dragState.sy = e.clientY; dragState.moved = 0;
    tapState.x = e.clientX; tapState.y = e.clientY; tapState.t = performance.now();
  });
  window.addEventListener('pointermove', (e) => {
    if (!dragState.on) return;
    const dx = e.clientX - dragState.sx, dy = e.clientY - dragState.sy;
    dragState.sx = e.clientX; dragState.sy = e.clientY;
    dragState.moved += Math.abs(dx) + Math.abs(dy);
    if (dragState.moved > 6) {
      if (viewMode === 'first') {
        if (champion) champion.state.facing -= dx * 0.006;
        lookPitch = Math.max(-1.2, Math.min(1.2, lookPitch - dy * 0.006));
      } else if (!orbit.locked) {
        orbit.theta -= dx * 0.006;
        orbit.phi = Math.max(0.2, Math.min(1.55, orbit.phi - dy * 0.006));
      }
    }
  });
  window.addEventListener('pointerup', (e) => {
    dragState.on = false;
    const dx = e.clientX - tapState.x, dy = e.clientY - tapState.y;
    if (Math.hypot(dx, dy) > 8 || performance.now() - tapState.t > 500) return;
    const rect = renderer.domElement.getBoundingClientRect();
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    if (grab && grab.mode !== 'idle') {
      grab.placeAt(ndcX, ndcY);
    } else if (grab && selectMode) {
      grab.select(grab.pick(ndcX, ndcY));
    }
  });
}

function cameraRelativeMove(ix, iz) {
  const fx = champion.state.pos.x - camera.position.x;
  const fz = champion.state.pos.z - camera.position.z;
  const len = Math.hypot(fx, fz) || 1;
  const Fx = fx / len, Fz = fz / len;
  const Rx = -Fz, Rz = Fx;
  return { x: Fx * iz + Rx * ix, z: Fz * iz + Rz * ix };
}

// ── Height-aware movement (raised platforms + stairs) ───────────────────────
// Returns the walkable ground height at (x,z): platform top, stair top, or 0.
const STEP_MAX = 1.5;    // max rise the champion auto-steps (platform/stairs)
function groundHeightAt(x, z) {
  const R = 0.5;   // champion radius — platform top is walkable up to its edge
  let h = 0;
  for (const p of platforms) {
    const hw = p.w / 2, hd = p.d / 2;
    // Platform top: expanded by the champion radius so the champion can stand
    // at the very edge without falling off (they fall only when clearly past).
    if (x > p.x - hw - R && x < p.x + hw + R && z > p.z - hd - R && z < p.z + hd + R) {
      if (p.topY > h) h = p.topY;
    }
    // Stair steps: continuous ramp toward the platform wall's outer face.
    // The champion (radius R=0.5) can't pass the platform wall until y ≈ topY,
    // so the ramp must reach full height at z = platformEdge ∓ R. t=0 at the
    // FAR (outer) end, t=1 at the wall face — the champion climbs UP as they
    // approach the platform, then steps over the now-inactive wall collider.
    if (p.stairSide) {
      const sw = p.stairW / 2;
      const R = 0.5;   // champion radius
      let inBand = false, t = 0;
      if (p.stairSide === 's') {
        const zEnd = p.z + p.d / 2 + R;                 // wall face (t=1)
        const zStart = zEnd + p.topY;                   // far end (t=0)
        inBand = x > p.x - sw && x < p.x + sw && z < zStart && z >= zEnd;
        t = (zStart - z) / p.topY;
      } else if (p.stairSide === 'n') {
        const zEnd = p.z - p.d / 2 - R;                 // wall face (t=1)
        const zStart = zEnd - p.topY;                   // far end (t=0)
        inBand = x > p.x - sw && x < p.x + sw && z > zStart && z <= zEnd;
        t = (z - zStart) / p.topY;
      } else if (p.stairSide === 'e') {
        const xEnd = p.x + p.w / 2 + R;                 // wall face (t=1)
        const xStart = xEnd + p.topY;                   // far end (t=0)
        inBand = z > p.z - sw && z < p.z + sw && x < xStart && x >= xEnd;
        t = (xStart - x) / p.topY;
      } else if (p.stairSide === 'w') {
        const xEnd = p.x - p.w / 2 - R;                 // wall face (t=1)
        const xStart = xEnd - p.topY;                   // far end (t=0)
        inBand = z > p.z - sw && z < p.z + sw && x > xStart && x <= xEnd;
        t = (x - xStart) / p.topY;
      }
      if (inBand) {
        const sh = Math.min(p.topY, Math.max(0, t) * p.topY);
        if (sh > h) h = sh;
      }
    }
  }
  return h;
}

function firstPersonMove(ix, iz) {
  const f = champion.state.facing;
  const Fx = Math.sin(f), Fz = Math.cos(f);
  const Rx = -Fz, Rz = Fx;
  return { x: Fx * iz + Rx * ix, z: Fz * iz + Rz * ix };
}

// ── Main loop ──────────────────────────────────────────────────────────────
const _camPos = new THREE.Vector3();
const _look = new THREE.Vector3();
const _ray = new THREE.Raycaster();
const _faded = new Set();
let lastT = performance.now();

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;

  if (champion) {
    readInput();
    const m = viewMode === 'first' ? firstPersonMove(input.x, input.z) : cameraRelativeMove(input.x, input.z);
    champion.update(dt, { x: m.x, z: m.z, running: input.running, speedScale: cfg.walkSpeed ?? 0.5 });
    const r = 0.5;
    // Height-aware collision: platform/step colliders (those carrying `topY`)
    // only block while the champion is BELOW their top — once on top, they can
    // stand on and walk across the platform.
    const activeColliders = colliders.filter((c) => !(c.topY !== undefined && champion.state.y >= c.topY - 0.05));
    const c = resolveCollision(champion.state.pos.x, champion.state.pos.z, r, activeColliders);
    const hw = roomDims.w / 2 - 0.6, hd = roomDims.d / 2 - 0.4;
    champion.state.pos.x = Math.max(-hw, Math.min(hw, c.x));
    champion.state.pos.z = Math.max(-hd + 0.4, Math.min(hd - 0.1, c.z));
    const wy = cfg.walkY || 0;

    // Height-aware ground: snap to platform/stair top when grounded, auto-step
    // up stairs (≤ STEP_MAX rise), and fall off edges via existing gravity.
    if (platforms.length) {
      const gh = groundHeightAt(champion.state.pos.x, champion.state.pos.z);
      const grounded = champion.state.isGrounded;
      if (grounded) {
        if (gh > champion.state.y + 0.01) {
          if (gh - champion.state.y <= STEP_MAX) {
            champion.state.y = gh;                    // step up stair/platform
          }
          // else: too tall a step — blocked by the platform side collider.
        } else if (gh < champion.state.y - 0.01) {
          champion.state.isGrounded = false;          // walked off an edge — fall
          champion.state.yVel = 0;
        } else {
          champion.state.y = gh;
        }
      } else if (champion.state.y <= gh && champion.state.yVel <= 0) {
        champion.state.y = gh;                        // landed on a platform
        champion.state.isGrounded = true;
      }
    }

    champion.group.position.set(c.x, champion.state.y + wy, c.z);
    if (championPoint) championPoint.position.set(c.x, wy + champion.state.y + 1.1, c.z + 0.15);
    if (championDisc) championDisc.position.set(c.x, wy + champion.state.y + 0.003, c.z);
    champion.group.visible = viewMode !== 'first';
  }

  if (champion) {
    const focus = champion.state.pos;
    if (viewMode === 'first') {      const wy = cfg.walkY || 0;
      const eye = wy + 1.6;
      _camPos.set(focus.x, eye, focus.z);
      camera.position.lerp(_camPos, Math.min(1, dt * 12));
      const f = champion.state.facing, cp = Math.cos(lookPitch), sp = Math.sin(lookPitch);
      _look.set(focus.x + Math.sin(f) * cp * 10, eye + sp * 10, focus.z + Math.cos(f) * cp * 10);
      camera.lookAt(_look);
    } else {
      const cosP = Math.cos(orbit.phi);
      _camPos.set(
        focus.x + orbit.dist * Math.sin(orbit.theta) * Math.sin(orbit.phi),
        focus.y + orbit.dist * cosP,
        focus.z + orbit.dist * Math.cos(orbit.theta) * Math.sin(orbit.phi)
      );
      camera.position.lerp(_camPos, Math.min(1, dt * 5));
      camera.lookAt(focus.x, focus.y + 1.4, focus.z);
    }
  }

  updateWallFade(camera, champion ? champion.state.pos : new THREE.Vector3(0, 1, 0), walls, _ray, _faded, wallProps);
  updateCeilingFade(camera, _ceiling);
  if (grab) {
    grab.update(dt, now);
    updatePrompt();
    const rotBtn = document.getElementById('rotate-toggle');
    if (rotBtn) rotBtn.style.display = (grab.mode !== 'idle') ? 'flex' : 'none';
  }
  if (activeRing && activeRing.visible) {
    const base = activeRing.userData.baseScale || 1;
    activeRing.scale.setScalar(base * (1 + 0.12 * Math.sin(now * 0.004)));
  }

  // Proximity-gated Enter/Exit: show the 🚪 button only when the champion is
  // near the current zone's door/airlock position.
  if (cfg.zones && champion) {
    const zt = document.getElementById('zone-toggle');
    if (zt) {
      const door = zoneDoors[zone];
      if (door) {
        const p = champion.state.pos;
        const near = Math.hypot(p.x - door.x, p.z - door.z) < 2.2;
        zt.style.display = near ? '' : 'none';
      }
    }
  }

  renderer.render(scene, camera);
}

// ── Debug hooks ────────────────────────────────────────────────────────────
window.__scenarioDebug = () => ({
  title: cfg ? cfg.title : null,
  drawCalls: renderer ? renderer.info.render.calls : null,
  triangles: renderer ? renderer.info.render.triangles : null,
  geometries: renderer ? renderer.info.memory.geometries : null,
  championY: champion ? champion.group.position.y : null,
  stateY: champion ? +champion.state.y.toFixed(2) : null,
  groundHeight: champion ? +groundHeightAt(champion.state.pos.x, champion.state.pos.z).toFixed(2) : null,
  feetY: champion ? (() => { const b = new THREE.Box3().setFromObject(champion.group); return b.min.y; })() : null,
  championPos: champion ? [champion.state.pos.x, champion.state.pos.z] : null,
  platforms: platforms.length,
  walls: walls.length,
  wallProps: wallProps.length,
  grabbables: grab ? grab.grabbables.length : null,
  holding: grab ? (grab.holding ? grab.holding.userData.libraryId || 'labware' : null) : null,
  heldWorldY: (grab && grab.holding && champion) ? +(champion.group.position.y + grab.holding.position.y * (champion.group.scale.x || 1)).toFixed(2) : null,
  anchors: anchors.length,
  colliders: colliders.map((c) => ({ x: [c.minX, c.maxX], z: [c.minZ, c.maxZ] })),
  ceilingVisible: _ceiling ? _ceiling.visible : null,
  cameraY: camera ? camera.position.y : null,
  lookPitch: viewMode === 'first' ? +lookPitch.toFixed(2) : null,
  cameraRotX: camera ? +camera.rotation.x.toFixed(2) : null,
  wallOpacities: walls.map((w) => +(w.material.opacity).toFixed(2)),
  hiddenProps: wallProps.filter((p) => !p.visible).map((p) => p.userData.wallSide || '?'),
});
window.__labDebug = window.__scenarioDebug;   // alias for compat
window.__scenarioDebug.tilt = (phi) => { if (orbit) orbit.phi = Math.max(0.3, Math.min(1.35, phi)); };
window.__scenarioDebug.orbit = (theta) => { if (orbit) orbit.theta = theta; };
window.__scenarioDebug.project = (x, y, z) => {
  if (!camera) return null;
  const v = new THREE.Vector3(x, y, z).project(camera);
  return [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)];
};
window.__scenarioDebug.tp = (x, z) => { if (champion) { champion.state.pos.x = x; champion.state.pos.z = z; } };
window.__scenarioDebug.itemBox = (id) => {
  const box = new THREE.Box3();
  let found = null;
  scene.traverse((o) => { if (!found && o.userData && o.userData.libraryId === id) found = o; });
  if (!found) return null;
  box.setFromObject(found);
  return { min: [box.min.x, box.min.y, box.min.z], max: [box.max.x, box.max.y, box.max.z] };
};
window.__scenarioDebug.roomBoxes = () => {
  if (!window.__roomGroup) return null;
  const out = [];
  window.__roomGroup.traverse((m) => {
    if (!m.isMesh || !m.geometry) return;
    const b = new THREE.Box3().setFromObject(m);
    out.push({
      name: (m.material && m.material.name) || m.name || '?',
      min: [b.min.x, b.min.y, b.min.z].map((v) => +v.toFixed(1)),
      max: [b.max.x, b.max.y, b.max.z].map((v) => +v.toFixed(1)),
    });
  });
  return out;
};
