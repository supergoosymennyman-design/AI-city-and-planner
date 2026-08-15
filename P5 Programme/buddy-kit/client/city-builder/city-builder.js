/**
 * city-builder/city-builder.js — Realistic 3D template for a student-designed city.
 *
 * Pipeline:
 *   1. Render the student's layout DIRECTLY as a realistic city (no prefab):
 *        - buildings → facade palette + lit-window texture + roof caps
 *        - special/mission buildings → distinctive designs + beacons + labels
 *        - roads → asphalt ribbons + neon edges + centerlines
 *        - parks → grass + trees
 *   2. Spawn the champion + buddy + skins + minigame overlay (full sim features).
 *
 * The student layout comes from localStorage (set by the 2D planner), a file
 * upload, pasted JSON, or a bundled sample.
 */

import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { design as questDesign } from '../hong-kong-real/quest-buildings.js';
import { QUESTS, loadQuestState, questStatus, questTheme, questComplete, invalidateQuestState } from '../hong-kong-real/quests.js';
import { createChampion, WALK_SPEED } from '../hong-kong-real/champion-real.js';
import { createDrones } from '../hong-kong-real/drones.js';
import { createDecoTaxis } from '../hong-kong-real/deco-taxis.js';
import { createSkySentinels } from '../hong-kong-real/sky-sentinels.js';
import { createFlyingTaxi } from '../champion-city/taxi.js';
import { createTraffic } from './traffic.js';
import { createPedestrians } from './pedestrians.js';
import { createStreetProps } from './street-props.js';
import { scatterStreetDeco } from './street-deco.js';
import { createMinimap } from './minimap.js';
import { mountCityBuddy } from './buddy.js';
import { createLabelRenderer } from '../champion-city/labels.js';
import { mountSkinSidebar } from '../champion-city/skins.js';
import { playTap } from '../champion-city/sound.js';
import { catalogType, isSpecial } from '../city-common/catalog.js';
import { sanitizeLayout, validateLayout, ROAD_WIDTH, densifyLayout } from '../city-common/layout.js';

const ASSET_BASE = '../champion-city/assets/';
const STORAGE_KEY = 'p5_city_planner_layout_v1';

// The recycling centre opens the P5 Lesson 1 example game (Recycle-Eye —
// Recycling Dataset Tycoon) instead of the shared P3 waste-sorters demo.
// Scoped to THIS 3D simulation only; the HK topography sim keeps its own URL.
const QUEST_GAME_URL_OVERRIDES = {
  14: 'https://p5-project-01.ai-education.workers.dev/', // Recycling Lab → P5 Lesson 1 example game
};

// Resolve the playable game URL for a quest id (override wins, else the
// quest's own gameUrl). Returns null when there is no game yet.
function questGameUrl(questId) {
  if (QUEST_GAME_URL_OVERRIDES[questId]) return QUEST_GAME_URL_OVERRIDES[questId];
  const q = QUESTS.find((qq) => qq.id === questId);
  return q && q.gameUrl ? q.gameUrl : null;
}

// Does this building type have a playable game to enter?
function questHasGameForType(type) {
  const spec = catalogType(type);
  if (!spec || !spec.questId) return false;
  return !!questGameUrl(spec.questId);
}

const IS_MOBILE = ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || window.innerWidth <= 768;

// ─── osm-city facade palette (kept in sync — single aesthetic source) ─────
const FACADE_PALETTE = [
  { max: 15,  roughness: 0.90, metalness: 0.02, intensity: 0.00, colors: [0xe2d5c0, 0xd4c2a8, 0xc8af90] },
  { max: 30,  roughness: 0.85, metalness: 0.05, intensity: 0.10, colors: [0xb8a188, 0xa89882, 0xb3a691] },
  { max: 60,  roughness: 0.80, metalness: 0.10, intensity: 0.20, colors: [0x878e91, 0x968d7f, 0x7d8a8e] },
  { max: 120, roughness: 0.35, metalness: 0.30, intensity: 0.38, colors: [0x7a9ba5, 0x8caaba, 0x6b8f9e] },
  { max: 999, roughness: 0.25, metalness: 0.45, intensity: 0.55, colors: [0x4a5f70, 0x3a4a58, 0x2d3640] },
];

let _windowTex = null;
function getWindowTexture() {
  if (_windowTex) return _windowTex;
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#060a18';
  ctx.fillRect(0, 0, size, size);
  const cols = 14, rows = 22, cw = size / cols, ch = size / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = ((r * 7 + c * 13) % 5) < 4;
      ctx.fillStyle = lit ? '#00f2fe' : '#12203a';
      ctx.globalAlpha = lit ? 0.4 + 0.4 * (((r * 31 + c * 17) % 10) / 10) : 1;
      ctx.fillRect(c * cw + 3, r * ch + 3, cw - 6, ch - 6);
    }
  }
  ctx.globalAlpha = 1;
  _windowTex = new THREE.CanvasTexture(canvas);
  _windowTex.wrapS = _windowTex.wrapT = THREE.RepeatWrapping;
  _windowTex.colorSpace = THREE.SRGBColorSpace;
  return _windowTex;
}

function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// ─── Sample layout (bundled so the whole thing is testable without the planner)
function sampleLayout() {
  return {
    version: 2,
    scaleMeters: 2000,
    roads: [
      { points: [[200, 1000], [1800, 1000]], width: 14, class: 'primary' },
      { points: [[1000, 200], [1000, 1800]], width: 14, class: 'primary' },
      { points: [[600, 550], [600, 1450]], width: 9, class: 'tertiary' },
      { points: [[1400, 550], [1400, 1450]], width: 9, class: 'tertiary' },
      { points: [[550, 700], [1450, 700]], width: 7, class: 'residential' },
      { points: [[550, 1300], [1450, 1300]], width: 7, class: 'residential' },
    ],
    parks: [
      { cx: 1400, cz: 1400, radius: 120 },
      { cx: 500, cz: 500, radius: 110 },
      { cx: 800, cz: 1550, radius: 80 },
    ],
    buildings: [
      // mission buildings
      { type: 'city_central', pos: [1000, 1000], footprint: [28, 28], height: 100 },
      { type: 'finance_tower', pos: [760, 1080], footprint: [24, 24], height: 80 },
      { type: 'sentiment_lab', pos: [1230, 900], footprint: [22, 22], height: 45 },
      { type: 'atc', pos: [1360, 1180], footprint: [20, 20], height: 70 },
      { type: 'water', pos: [820, 620], footprint: [24, 24], height: 40 },
      { type: 'power', pos: [1380, 620], footprint: [24, 24], height: 44 },
      { type: 'traffic_lab', pos: [720, 900], footprint: [22, 20], height: 40 },
      { type: 'recycling', pos: [1280, 1080], footprint: [24, 20], height: 36 },
      { type: 'drone_routing', pos: [1180, 1280], footprint: [24, 24], height: 55 },
      { type: 'health', pos: [900, 1280], footprint: [24, 20], height: 42 },
      // housing + facilities
      { type: 'housing', pos: [700, 700], footprint: [20, 20], height: 24 },
      { type: 'housing', pos: [730, 740], footprint: [20, 20], height: 22 },
      { type: 'housing', pos: [1300, 1300], footprint: [20, 20], height: 26 },
      { type: 'housing', pos: [1330, 1340], footprint: [20, 20], height: 24 },
      { type: 'housing', pos: [500, 1200], footprint: [20, 20], height: 22 },
      { type: 'housing', pos: [1500, 800], footprint: [20, 20], height: 24 },
      { type: 'school', pos: [1100, 700], footprint: [26, 24], height: 20 },
      { type: 'hospital', pos: [900, 1300], footprint: [30, 26], height: 34 },
      { type: 'shop', pos: [1120, 760], footprint: [32, 32], height: 26 },
      { type: 'library', pos: [880, 1240], footprint: [22, 20], height: 18 },
      { type: 'office', pos: [860, 960], footprint: [20, 20], height: 40 },
      { type: 'stadium', pos: [600, 1500], footprint: [36, 30], height: 30 },
      { type: 'fire', pos: [1500, 1500], footprint: [22, 20], height: 16 },
      { type: 'police', pos: [500, 900], footprint: [22, 20], height: 18 },
    ],
  };
}

// ─── Boot ────────────────────────────────────────────────────────────────
const stage = document.getElementById('stage');
let scene, camera, renderer, composer, labelRenderer;
let city = {};            // object passed to champion/buddy (scene/camera/renderer/spawnWorld)
let champion = null;
let sim = null;
let layout = null;

let specialSystem = null; // { beacon, beaconPositions, meshes }
const interactMeshes = []; // raycast targets for building entry

// Air traffic
let taxi = null;          // player's flying taxi
let decoTaxis = null;     // decorative skyline taxis
let skySentinels = null;  // high-altitude drifting lights
let drones = null;        // patrol drones
let traffic = null;       // road vehicles
let pedestrians = null;   // people walking along the sidewalks
let streetProps = null;   // streetlights + benches
let minimap = null;

// Navigation targets (from the buddy's walk/fly actions)
let walkNav = null;       // {x, z} — champion auto-walks here
let taxiNav = null;       // {x, z, y} — taxi auto-flies here

// Densify state (from loadLayout)
let growScale = 1;        // champion scale multiplier (buildings grow too)
let cityBounds = null;    // tightened bounds for minimap + sky traffic

// Orbit / input state
// Distances are context-aware: overview (no champion) / walk / taxi ride.
const orbit = {
  theta: 0.6, phi: 1.1, dist: 62, target: new THREE.Vector3(1000, 0, 1000), locked: false,
  distWalk: 26, distTaxi: 15,
};
const input = { x: 0, z: 0, running: false, jump: false, wave: false, dance: false, ascend: false, descend: false };
let keys = {};

// ─── Scene setup (osm-city look) ─────────────────────────────────────────
function setupScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x16224a);
  scene.fog = new THREE.FogExp2(0x16224a, 0.0007);

  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1.0, 8000);
  camera.position.set(1000, 220, 1350);
  camera.lookAt(1000, 10, 1000);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, IS_MOBILE ? 1.25 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = IS_MOBILE ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  stage.appendChild(renderer.domElement);

  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), IS_MOBILE ? 0.85 : 1.1, 0.5, 0.35);
  bloom.threshold = 0.35;
  bloom.strength = IS_MOBILE ? 0.85 : 1.1;
  composer.addPass(bloom);
  const sat = { uniforms: { tDiffuse: { value: null }, amount: { value: IS_MOBILE ? 1.15 : 1.28 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'uniform sampler2D tDiffuse; uniform float amount; varying vec2 vUv; const vec3 LUMA=vec3(0.2126,0.7152,0.0722); void main(){ vec4 c=texture2D(tDiffuse,vUv); float luma=dot(c.rgb,LUMA); c.rgb=mix(vec3(luma),c.rgb,amount); gl_FragColor=c; }' };
  composer.addPass(new ShaderPass(sat));
  const vig = { uniforms: { tDiffuse: { value: null }, intensity: { value: 0.42 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'uniform sampler2D tDiffuse; uniform float intensity; varying vec2 vUv; void main(){ vec4 c=texture2D(tDiffuse,vUv); float d=distance(vUv,vec2(0.5)); float v=1.0-intensity*smoothstep(0.4,0.9,d); gl_FragColor=vec4(c.rgb*v,c.a); }' };
  composer.addPass(new ShaderPass(vig));
  // Mobile: renderer MSAA is already on — skip the extra SMAA pass (double AA).
  // Desktop: SMAA cleans up edges cheaply at 2x pixel ratio.
  if (!IS_MOBILE) {
    composer.addPass(new SMAAPass(window.innerWidth * renderer.getPixelRatio(), window.innerHeight * renderer.getPixelRatio()));
  }
  composer.addPass(new OutputPass());

  scene.add(new THREE.HemisphereLight(0x33406e, 0x1a2440, 1.15));
  const sun = new THREE.DirectionalLight(0xffd9b3, 1.5);
  sun.position.set(1000, 1600, 1200);
  sun.castShadow = true;
  sun.shadow.mapSize.set(IS_MOBILE ? 1024 : 2048, IS_MOBILE ? 1024 : 2048);
  sun.shadow.camera.left = -1200; sun.shadow.camera.right = 1200;
  sun.shadow.camera.top = 1200; sun.shadow.camera.bottom = -1200;
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x00f2fe, 0.5);
  rim.position.set(-1400, 900, -1200);
  scene.add(rim);

  // Ground — sized to the ~2000-unit city plus margin. The old 20000-unit plane
  // (with far=30000) collapsed depth-buffer precision on mobile GPUs, making
  // ground-level geometry silently fail the depth test on iPads. The fog already
  // hides anything past ~2000 units, so a 6000-unit plane is invisible loss on
  // desktop and a huge precision win on mobile.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(6000, 6000),
    new THREE.MeshStandardMaterial({ color: 0x141a2e, roughness: 0.9 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.1;
  ground.receiveShadow = true;
  scene.add(ground);

  city.scene = scene;
  city.camera = camera;
  city.renderer = renderer;
  city.resize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
  };
}

function darken(hex, factor) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  const r = Math.round(((n >> 16) & 255) * factor);
  const g = Math.round(((n >> 8) & 255) * factor);
  const b = Math.round((n & 255) * factor);
  return (r << 16) | (g << 8) | b;
}

function buildRoadsInto(group, roads, opts = {}) {
  const asphGeos = [];
  const edgeGeos = [];
  const laneGeos = [];
  for (const road of roads) {
    const half = (road.width || ROAD_WIDTH[road.class] || ROAD_WIDTH.residential) / 2;
    const pts = road.points.map(([x, z]) => new THREE.Vector3(x, 0, z));
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.01) continue;
      const nx = (-dz / len) * half, nz = (dx / len) * half;
      const y = opts.elevated ? 0.07 : 0.03;
      const edgeY = opts.elevated ? 0.09 : 0.06;
      asphGeos.push(buildQuad(a, b, nx, nz, y));
      edgeGeos.push(linePair(a, b, nx, nz, edgeY));
      laneGeos.push([a.x, laneY(opts), a.z, b.x, laneY(opts), b.z]);
    }
  }
  if (asphGeos.length) {
    const merged = BufferGeometryUtils.mergeGeometries(asphGeos, false);
    const color = opts.elevated ? 0x2f3b57 : 0x232c44;
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.2 });
    const mesh = new THREE.Mesh(merged, mat);
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  if (edgeGeos.length) {
    const pts = [];
    for (const g of edgeGeos) pts.push(...g);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const mat = new THREE.LineBasicMaterial({ color: opts.elevated ? 0xffffff : 0x00f2fe, transparent: true, opacity: opts.elevated ? 0.85 : 0.7 });
    group.add(new THREE.LineSegments(geo, mat));
  }
  if (laneGeos.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(laneGeos.flat(), 3));
    const mat = new THREE.LineBasicMaterial({ color: opts.elevated ? 0x00ff9d : 0xffffff, transparent: true, opacity: opts.elevated ? 0.9 : 0.5 });
    group.add(new THREE.LineSegments(geo, mat));
  }
}

function laneY(opts) { return opts.elevated ? 0.1 : 0.08; }

function buildQuad(a, b, nx, nz, y) {
  const p = [];
  p.push(a.x + nx, y, a.z + nz, a.x - nx, y, a.z - nz, b.x + nx, y, b.z + nz);
  p.push(b.x + nx, y, b.z + nz, a.x - nx, y, a.z - nz, b.x - nx, y, b.z - nz);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  geo.computeVertexNormals();
  return geo;
}

function linePair(a, b, nx, nz, y) {
  return [
    a.x + nx, y, a.z + nz, b.x + nx, y, b.z + nz,
    a.x - nx, y, a.z - nz, b.x - nx, y, b.z - nz,
  ];
}

// ─── Fabric: parks (grass + trees) ────────────────────────────────────────
const _treeLoader = new GLTFLoader();
let _treeModels = null;
let _treePacks = null;    // Quaternius tree packs (each holds 5 named variants)
let _parkModel = null;   // shared park GLB (trees + benches + fountain)

// Tree instancing: each GLB pack variant is normalised ONCE into a shared
// single-geometry mesh; addTree() only QUEUES a placement, and flushTrees()
// (called after carving) writes them into per-variant InstancedMeshes. This
// collapses ~300 separate tree clones into ~10 instanced draw calls.
let _treeVariants = [];   // [{geo, height}] — normalized, feet on y=0
let _treePlacements = []; // [{x, z, scale, v}] — queued until flush

function loadTreeModels() {
  return Promise.all([
    _treeLoader.loadAsync(ASSET_BASE + 'models/tree.glb').catch((e) => { console.warn('[city-builder] tree GLB failed', e); return null; }),
    _treeLoader.loadAsync(ASSET_BASE + 'models/tree-high.glb').catch((e) => { console.warn('[city-builder] tree-high GLB failed', e); return null; }),
  ]).then(([a, b]) => {
    _treeModels = {};
    if (a) _treeModels.tree = a.scene;
    if (b) _treeModels.treeHigh = b.scene;
    return Object.keys(_treeModels).length ? _treeModels : null;
  });
}
function loadTreePacks() {
  const urls = {
    normal: 'assets/models/nature/tree-normal.glb',
    pine: 'assets/models/nature/tree-pine.glb',
    birch: 'assets/models/nature/tree-birch.glb',
    maple: 'assets/models/nature/tree-maple.glb',
    dead: 'assets/models/nature/tree-dead.glb',
  };
  const keys = Object.keys(urls);
  return Promise.all(keys.map((k) => _treeLoader.loadAsync(urls[k]).catch((e) => { console.warn('[city-builder] tree pack failed', k, e); return null; })))
    .then((scenes) => {
      _treePacks = {};
      scenes.forEach((s, i) => { if (s) _treePacks[keys[i]] = s.scene; });
      return _treePacks;
    });
}
function loadParkModel() {
  return _treeLoader.loadAsync('assets/models/park.glb')
    .then((gltf) => {
      const m = gltf.scene;
      const box = new THREE.Box3().setFromObject(m);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      m.position.sub(center);            // centre the model on its origin
      m.position.y -= size.y / 2;        // sit its base on y=0
      m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      _parkModel = m;
      return m;
    })
    .catch((e) => { console.warn('[city-builder] park GLB failed', e); _parkModel = null; return null; });
}

// Convert any interleaved-buffer attributes to plain BufferAttributes so
// BufferGeometryUtils.mergeGeometries can merge them (it refuses interleaved).
// Read through the attribute's own getX/getY/getZ/getW accessors — they
// correctly handle interleaved/normalized storage (raw array offsets in the
// shared buffer are NOT plain float positions, e.g. GLB interleaved UV/index
// data, so never index .array directly).
function deInterleave(geo) {
  const names = Object.keys(geo.attributes);
  for (const name of names) {
    const attr = geo.attributes[name];
    if (attr && attr.isInterleavedBufferAttribute) {
      const itemSize = attr.itemSize;
      const count = attr.count;
      const arr = new Float32Array(count * itemSize);
      const getters = [attr.getX.bind(attr), attr.getY.bind(attr), attr.getZ.bind(attr), attr.getW.bind(attr)];
      for (let i = 0; i < count; i++) {
        for (let s = 0; s < itemSize && s < 4; s++) arr[i * itemSize + s] = getters[s](i);
      }
      geo.setAttribute(name, new THREE.BufferAttribute(arr, itemSize));
    }
  }
  return geo;
}

// Normalise one tree model into a single shared geometry: bake the clone's
// transforms into the vertices, merge sub-meshes, centre on origin, feet on
// y=0. Returns {geo, height} or null. `height` is the tree's natural height so
// instances can be scaled to a target size like the old clone path did.
function normalizeTreeToGeometry(root) {
  try {
    const clone = root.clone(true);
    clone.updateMatrixWorld(true);
    const geos = [];
    let maxY = -Infinity;
    clone.traverse((o) => {
      if (o.isMesh && o.geometry) {
        const g = deInterleave(o.geometry.clone());
        g.applyMatrix4(o.matrixWorld);
        const box = new THREE.Box3().setFromBufferAttribute(g.attributes.position);
        if (box.max.y > maxY) maxY = box.max.y;
        if (!g.getAttribute('normal')) g.computeVertexNormals();
        geos.push(g);
      }
    });
    if (!geos.length) return null;
    const merged = BufferGeometryUtils.mergeGeometries(geos, false);
    if (!merged) return null;
    // Centre X/Z on origin, sit base on y=0.
    const b = new THREE.Box3().setFromBufferAttribute(merged.attributes.position);
    const size = new THREE.Vector3(); b.getSize(size);
    const center = new THREE.Vector3(); b.getCenter(center);
    merged.translate(-center.x, -b.min.y, -center.z);
    return { geo: merged, height: Math.max(size.y, 0.5) };
  } catch (e) {
    console.warn('[city-builder] tree normalise failed', e);
    return null;
  }
}

function buildTreeVariants() {
  _treeVariants = [];
  // Packs first (richest visuals); each pack has 5 variant nodes.
  if (_treePacks && Object.keys(_treePacks).length) {
    for (const packKey of Object.keys(_treePacks)) {
      const pack = _treePacks[packKey];
      const variantNodes = (pack.children || []).filter((c) => c.isMesh || (c.children && c.children.length));
      for (const v of variantNodes) {
        const n = normalizeTreeToGeometry(v);
        if (n) _treeVariants.push(n);
      }
    }
  }
  // Fallback simple tree models (tree.glb / tree-high.glb).
  if (!_treeVariants.length && _treeModels) {
    for (const key of ['tree', 'treeHigh']) {
      if (_treeModels[key]) {
        const n = normalizeTreeToGeometry(_treeModels[key]);
        if (n) _treeVariants.push(n);
      }
    }
  }
}

function addTree(x, z, scale) {
  if (_treeVariants.length) {
    const v = Math.floor(Math.random() * _treeVariants.length);
    _treePlacements.push({ x, z, scale, v });
    return;
  }
  // No GLB trees at all — procedural fallback stays as individual meshes.
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.2, 0.8, 8),
    new THREE.MeshStandardMaterial({ color: 0x6d4c2f, roughness: 0.9 })
  );
  trunk.position.set(x, 0.4, z);
  scene.add(trunk);
  const leaf = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0x3d8b4f, roughness: 0.85 })
  );
  leaf.position.set(x, 1.1, z);
  scene.add(leaf);
}

// Write queued tree placements into per-variant InstancedMeshes. Call after
// ALL addTree() calls (park trees + street trees) so capacities are exact.
function flushTrees() {
  if (!_treePlacements.length) return;
  const counts = new Array(_treeVariants.length).fill(0);
  for (const p of _treePlacements) counts[p.v]++;
  const mats = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
  const instByVariant = new Map();   // variant index -> InstancedMesh
  _treeVariants.forEach((variant, vi) => {
    if (!counts[vi]) return;
    const inst = new THREE.InstancedMesh(variant.geo, mats, counts[vi]);
    inst.count = 0;
    inst.castShadow = true;
    inst.receiveShadow = false;
    inst.userData.isCityTree = true;   // debug/verify hook
    scene.add(inst);
    instByVariant.set(vi, inst);
  });
  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const placed = new Array(_treeVariants.length).fill(0);
  for (const p of _treePlacements) {
    const inst = instByVariant.get(p.v);
    if (!inst) continue;
    const variant = _treeVariants[p.v];
    const idx = placed[p.v]++;
    pos.set(p.x, 0, p.z);
    const h = variant.height || 1;
    scl.setScalar((p.scale * 4) / h);
    quat.identity();
    m.compose(pos, quat, scl);
    inst.setMatrixAt(idx, m);
    inst.count = idx + 1;
    inst.instanceMatrix.needsUpdate = true;
  }
  _treePlacements = [];
}

// ─── Nature filler (bushes/flowers/rocks) ────────────────────────────────
// Small Kenney Nature Kit (CC0) models scattered inside parks to make the
// green spaces feel lush. Same two-phase pipeline as trees: load → normalize
// each variant once → queue placements → flush into per-variant InstancedMesh.
const NATURE_FILLER_FILES = [
  'plant_bush.glb', 'plant_bushDetailed.glb', 'plant_bushTriangle.glb',
  'flower_yellowA.glb', 'flower_yellowB.glb', 'flower_purpleA.glb', 'flower_purpleB.glb',
  'grass_leafs.glb', 'grass_leafsLarge.glb',
  'rock_smallA.glb', 'rock_smallB.glb', 'mushroom_redTall.glb',
];
let _natureVariants = [];     // [{geo, height}]
let _naturePlacements = [];   // [{x, z, scale, v}]
let _natureLoaded = false;

function loadNatureFiller() {
  if (_natureLoaded) return;
  _natureLoaded = true;
  const loader = new GLTFLoader();
  Promise.all(NATURE_FILLER_FILES.map((f) =>
    loader.loadAsync('assets/models/nature-filler/' + f).catch((e) => { console.warn('[nature-filler] failed', f, e); return null; })
  )).then((gltfs) => {
    for (const gltf of gltfs) {
      if (!gltf) continue;
      const n = normalizeTreeToGeometry(gltf.scene);
      if (n) _natureVariants.push(n);
    }
    // If any variants loaded, flush anything queued before load finished.
    flushNatureFiller();
  });
}

function addNatureFiller(x, z, scale) {
  if (_natureVariants.length) {
    const v = Math.floor(Math.random() * _natureVariants.length);
    _naturePlacements.push({ x, z, scale, v });
    return;
  }
  // Variants not ready yet (async load) — queue; flush runs when they arrive.
  _naturePlacements.push({ x, z, scale, v: -1 });
}

function flushNatureFiller() {
  if (!_natureVariants.length) return;
  const ready = _naturePlacements.filter((p) => p.v >= 0);
  const pending = _naturePlacements.filter((p) => p.v < 0);
  // Assign any pending (queued-before-load) placements to random variants.
  for (const p of pending) { p.v = Math.floor(Math.random() * _natureVariants.length); ready.push(p); }
  _naturePlacements = [];
  if (!ready.length) return;
  const counts = new Array(_natureVariants.length).fill(0);
  for (const p of ready) counts[p.v]++;
  const mats = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
  const instByVariant = new Map();
  _natureVariants.forEach((variant, vi) => {
    if (!counts[vi]) return;
    const inst = new THREE.InstancedMesh(variant.geo, mats, counts[vi]);
    inst.count = 0;
    inst.castShadow = false;                 // tiny props — skip shadow cost
    inst.userData.isNatureFiller = true;
    scene.add(inst);
    instByVariant.set(vi, inst);
  });
  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const placed = new Array(_natureVariants.length).fill(0);
  for (const p of ready) {
    const inst = instByVariant.get(p.v);
    if (!inst) continue;
    const variant = _natureVariants[p.v];
    const idx = placed[p.v]++;
    pos.set(p.x, 0, p.z);
    const h = variant.height || 1;
    scl.setScalar((p.scale * 4) / h);
    quat.identity();
    m.compose(pos, quat, scl);
    inst.setMatrixAt(idx, m);
    inst.count = idx + 1;
    inst.instanceMatrix.needsUpdate = true;
  }
}

function addPark(cx, cz, radius) {
  const grass = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 28),
    // Matches the ground texture of the park GLB (dominant #386800 olive green)
    // so the circle blends into the park model instead of clashing with it.
    new THREE.MeshStandardMaterial({ color: 0x386800, roughness: 0.95 })
  );
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(cx, 0.02, cz);
  grass.receiveShadow = true;
  scene.add(grass);
  // Shared park model (trees + benches + fountain) in the middle of the circle.
  if (_parkModel) {
    const clone = _parkModel.clone(true);
    // Scale so the model's footprint (~2.6×2.5m after the baked rotation) fits
    // comfortably inside the circle — about 60% of the diameter.
    const target = radius * 0.6;
    const box = new THREE.Box3().setFromObject(clone);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    clone.scale.setScalar(target / maxDim);
    clone.position.set(cx, 0, cz);
    scene.add(clone);
  }
  // trees ring — denser, and fill the empty inner band so the green circle
  // reads as a lush park, not a sparse lawn. Keep the middle clear where the
  // park model (fountain/benches) sits.
  const count = Math.max(6, Math.round(radius / 8));
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + hashString(i + '') * 0.3;
    const r = radius * (0.4 + 0.55 * ((hashString(i * 7) % 10) / 10));
    addTree(cx + Math.cos(ang) * r, cz + Math.sin(ang) * r, 0.8 + ((hashString(i * 13) % 10) / 10) * 0.6);
  }
  // Fill the mid band (between the centre model and the outer ring).
  const fillCount = Math.max(3, Math.round(radius / 12));
  for (let i = 0; i < fillCount; i++) {
    const ang = hashString(i * 31 + Math.round(cx)) * 0.7 + i * 1.7;
    const r = radius * (0.18 + 0.28 * ((hashString(i * 17 + Math.round(cz)) % 10) / 10));
    addTree(cx + Math.cos(ang) * r, cz + Math.sin(ang) * r, 0.7 + ((hashString(i * 23) % 10) / 10) * 0.5);
  }
  // Nature filler: bushes, flowers, rocks, grass tufts — denser near the
  // centre model (fountain), sparser toward the ring so the park reads lush
  // but the trees still stand out.
  const fillN = Math.max(4, Math.round(radius / 6));
  for (let i = 0; i < fillN; i++) {
    const ang = hashString(i * 41 + Math.round(cx * 7)) * 0.9 + i * 2.3;
    const r = radius * (0.15 + 0.5 * ((hashString(i * 29 + Math.round(cz * 3)) % 10) / 10));
    addNatureFiller(cx + Math.cos(ang) * r, cz + Math.sin(ang) * r, 0.5 + ((hashString(i * 11) % 10) / 10) * 0.7);
  }
}

// ─── Special/quest buildings (design + beacons + labels) ──────────────────
function buildQuestLandmarks() {
  const bodyGeoms = [];
  const accentGeoms = [];
  const beaconPositions = [];
  const questRefs = [];

  for (const b of layout.buildings) {
    if (!isSpecial(b.type)) continue;
    const spec = catalogType(b.type);
    const q = QUESTS.find((qq) => qq.id === spec.questId);
    if (!q) continue;
    // Student intent is exact — place at the layout position.
    const cx = b.pos[0];
    const cz = b.pos[1];
    const fp = b.footprint || spec.footprint || [22, 22];
    const h = Math.min(220, Math.max(8, b.height || spec.height || 30));

    // Industrial mission buildings (water, power, recycling…) render the shared
    // industrial GLB instead of a procedural design — but keep their beacon and
    // label so they still read as mission buildings.
    if (INDUSTRIAL_SPECIALS.includes(b.type)) {
      (glbState.industrial || (glbState.industrial = { model: null, size: null, spots: [], fallbacks: [], applied: [], loading: false })).spots.push({ x: cx, z: cz, fp, h, glbType: 'industrial' });
      // Plain placeholder until the GLB loads (or if it never does).
      const ph = new THREE.Mesh(
        new THREE.BoxGeometry(fp[0], h, fp[1]),
        new THREE.MeshStandardMaterial({ color: 0x3a4650, roughness: 0.85, metalness: 0.3 })
      );
      ph.position.set(cx, h / 2, cz);
      ph.castShadow = true;
      scene.add(ph);
      glbState.industrial.fallbacks.push(ph);
      beaconPositions.push({ x: cx, y: h + 6, z: cz, anchor: h });
      questRefs.push({ q, cx, cz, top: h });
      addBuildingLabel(q.labelZh, q.labelEn, cx, h + 14, cz);
      continue;
    }

    // AI Finance Tower uses the skyscraper GLB (with window sparkles).
    if (b.type === 'finance_tower') {
      (glbState.skyscraper || (glbState.skyscraper = { model: null, size: null, spots: [], fallbacks: [], applied: [], loading: false })).spots.push({ x: cx, z: cz, fp, h, glbType: 'skyscraper' });
      // Placeholder until the GLB loads.
      const ph = new THREE.Mesh(
        new THREE.BoxGeometry(fp[0], h, fp[1]),
        new THREE.MeshStandardMaterial({ color: 0x2d3640, roughness: 0.7, metalness: 0.4 })
      );
      ph.position.set(cx, h / 2, cz);
      ph.castShadow = true;
      scene.add(ph);
      glbState.skyscraper.fallbacks.push(ph);
      beaconPositions.push({ x: cx, y: h + 6, z: cz, anchor: h });
      questRefs.push({ q, cx, cz, top: h });
      addBuildingLabel(q.labelZh, q.labelEn, cx, h + 14, cz);
      continue;
    }

    const d = questDesign(spec.questId, cx, cz);
    bodyGeoms.push(...d.b);
    accentGeoms.push(...d.a);

    // real top for beacon anchor
    const maxY = (arr) => { let m = -Infinity; for (const g of arr) { if (!g.boundingBox) g.computeBoundingBox(); if (g.boundingBox) m = Math.max(m, g.boundingBox.max.y); } return m; };
    const top = Math.max(maxY(d.b), maxY(d.a));
    const anchor = Number.isFinite(top) ? top : (b.height || 30);
    beaconPositions.push({ x: cx, y: anchor + 6, z: cz, anchor });
    questRefs.push({ q, cx, cz, top: anchor });

    // CSS2D label
    addBuildingLabel(q.labelZh, q.labelEn, cx, anchor + 14, cz);
  }

  if (bodyGeoms.length) {
    const bodies = new THREE.Mesh(
      BufferGeometryUtils.mergeGeometries(bodyGeoms, false),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 })
    );
    bodies.castShadow = true;
    scene.add(bodies);
  }
  if (accentGeoms.length) {
    const accents = new THREE.Mesh(
      BufferGeometryUtils.mergeGeometries(accentGeoms, false),
      new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })
    );
    scene.add(accents);
  }

  // Beacons
  if (beaconPositions.length) {
    const state = loadQuestState();
    const beacon = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(2.2, 0),
      new THREE.MeshBasicMaterial({ toneMapped: false }),
      beaconPositions.length
    );
    const m = new THREE.Matrix4(), v = new THREE.Vector3(), qq = new THREE.Quaternion(), ss = new THREE.Vector3();
    const colour = new THREE.Color();
    beaconPositions.forEach((bp, i) => {
      v.set(bp.x, bp.y, bp.z);
      qq.setFromEuler(new THREE.Euler(0, Math.PI / 4, 0.6));
      m.compose(v, qq, ss.set(1, 1, 1));
      beacon.setMatrixAt(i, m);
      const st = questStatus(questRefs[i].q, state);
      colour.setHex(st === 'completed' ? 0x00ff9d : st === 'unlocked' ? 0x00f2fe : 0x3a3f46);
      beacon.setColorAt(i, colour);
    });
    beacon.instanceMatrix.needsUpdate = true;
    beacon.instanceColor.needsUpdate = true;
    scene.add(beacon);
    specialSystem = { beacon, beaconPositions, questRefs };
  }

  // Register special buildings for tap interaction — an invisible hit-sphere
  // (colorWrite off so it never renders) centred on the building.
  for (const ref of questRefs) {
    const q = ref.q;
    if (q.gameUrl) {
      const hit = new THREE.Mesh(
        new THREE.SphereGeometry(12, 6, 5),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, colorWrite: false, depthWrite: false })
      );
      hit.position.set(ref.cx, Math.max(12, ref.top / 2), ref.cz);
      hit.userData = { kind: 'quest', questId: q.id, name: q.labelEn, gameUrl: QUEST_GAME_URL_OVERRIDES[q.id] || q.gameUrl };
      scene.add(hit);
      interactMeshes.push(hit);
    }
  }
}

function addBuildingLabel(zh, en, x, y, z) {
  if (!labelRenderer) return;
  const el = document.createElement('div');
  el.className = 'building-label quest-label';
  el.innerHTML = `<div class="bl-zh">${zh}</div><div class="bl-en">${en}</div>`;
  const label = new CSS2DObject(el);
  label.position.set(x, y, z);
  scene.add(label);
}

// ─── Generic facilities (realistic facades + label) ───────────────────────
// GLB-backed building types. Each renders as a facade extrusion immediately,
// then swaps to the GLB clone when it loads. The shared `generic` model is used
// for the plain facilities (school, hospital, shop, …) that don't have their
// own dedicated building yet.
const GLB_BUILDING_TYPES = {
  office: 'assets/models/office-tower.glb',
  housing: 'assets/models/housing.glb',
  shop: 'assets/models/mall.glb',
  generic: 'assets/models/generic.glb',
  industrial: 'assets/models/industrial.glb',
  skyscraper: 'assets/models/skyscraper.glb',
  hospital: 'assets/models/hospital.glb',
  fire: 'assets/models/fire-station.glb',
  stadium: 'assets/models/stadium.glb',
};
// Residential variations (Kenney City Kit Suburban, CC0): each housing spot
// renders as a 2×2 block of units; each unit picks a RANDOM variant so a
// student's neighbourhood looks lived-in instead of cloned.
const HOUSING_VARIANTS = [
  'assets/models/housing-variants/housing-a.glb',
  'assets/models/housing-variants/housing-c.glb',
  'assets/models/housing-variants/housing-h.glb',
  'assets/models/housing-variants/housing-j.glb',
  'assets/models/housing-variants/housing-n.glb',
  'assets/models/housing-variants/housing-u.glb',
];
// Facilities that share the generic model until they get their own GLB.
// Plain facilities without a dedicated GLB — these fall back to the shared
// generic model. (hospital/fire/stadium have their own models now.)
const GENERIC_FACILITY_TYPES = ['school', 'library', 'police'];
// Mission buildings that use the industrial GLB instead of a procedural design.
const INDUSTRIAL_SPECIALS = ['water', 'power', 'recycling', 'delivery', 'traffic_lab', 'traffic_emergency', 'subsurface', 'monitoring'];
const glbState = {};   // type → { model, size, spots:[], fallbacks:[], loading }

// Housing variants loader: every residential model shares the same base unit
// scale (Kenney suburban buildings are ~1.3m units), so we load them into a
// common pool keyed by URL. `glbState.housing` keeps the ORIGINAL model for
// the fallback, and this pool provides the per-unit variation.
const housingVariantModels = [];   // [{ model, size }] loaded in order
let housingVariantsLoaded = false;

function loadHousingVariants() {
  if (housingVariantsLoaded) return;
  housingVariantsLoaded = true;
  const loader = new GLTFLoader();
  for (const url of HOUSING_VARIANTS) {
    loader.loadAsync(url)
      .then((gltf) => {
        const m = gltf.scene;
        const box = new THREE.Box3().setFromObject(m);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        m.position.sub(center);        // centre on origin, feet near y=0
        m.position.y -= box.min.y;     // sit base on y=0
        housingVariantModels.push({ model: m, size });
        applyBuildingModel('housing'); // re-apply so new units use available variants
      })
      .catch((e) => { console.warn('[housing variant] GLB load failed:', url, e); });
  }
}

function loadBuildingModel(type, url) {
  const st = glbState[type] || (glbState[type] = { model: null, size: null, spots: [], fallbacks: [], applied: [], loading: false });
  if (st.loading) return;
  st.loading = true;
  new GLTFLoader().loadAsync(url)
    .then((gltf) => {
      const m = gltf.scene;
      const box = new THREE.Box3().setFromObject(m);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      // Centre the model horizontally, then BAKE the base onto y=0 by moving
      // every mesh's geometry (not the root position — applyBuildingModel later
      // sets clone.position to the spot and would clobber a root offset). Some
      // source GLBs are centred, some base-anchored; baking normalises all of
      // them so every building sits on the ground.
      m.position.x -= center.x;
      m.position.z -= center.z;
      const lift = -box.min.y;
      m.traverse((o) => {
        if (o.isMesh && o.geometry) {
          o.geometry.translate(0, lift, 0);
        }
      });
      st.model = m; st.size = size;
      applyBuildingModel(type);
    })
    .catch((e) => {
      console.warn(`[${type}] GLB load failed — keeping procedural`, e);
      st.model = null;
    });
}

function applyBuildingModel(type) {
  const st = glbState[type];
  if (!st || !st.model) return;
  // Remove the procedural fallback meshes…
  for (const mesh of st.fallbacks) {
    scene.remove(mesh);
    mesh.geometry && mesh.geometry.dispose();
    mesh.material && mesh.material.dispose();
  }
  st.fallbacks.length = 0;
  // …and any GLB clones applied by an earlier pass (variants load async, so
  // re-applying must not stack duplicates).
  for (const clone of st.applied || []) {
    scene.remove(clone);
    clone.traverse((o) => {
      if (o.isMesh) {
        o.geometry && o.geometry.dispose();
        if (o.material) { if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose()); else o.material.dispose(); }
      }
    });
  }
  st.applied = [];
  // …and place a GLB clone on every spot (geometry shared, cheap).
  for (const spot of st.spots) {
    // Housing renders as a 2×2 block of four smaller units inside the same
    // footprint — one map icon = one residential block, not one tower. Each
    // unit picks a RANDOM variant from the Kenney suburban pool when any have
    // loaded, so a neighbourhood looks varied; otherwise the base housing model.
    if (type === 'housing') {
      const unit = spot.fp[0] / 2 - 1;   // half the footprint minus a tiny gap
      const variants = housingVariantModels.length ? housingVariantModels : [{ model: st.model, size: st.size }];
      for (const [dx, dz] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) {
        const v = variants[Math.floor(Math.random() * variants.length)];
        const s = Math.min(
          unit / v.size.x,
          unit / v.size.z,
          (spot.h || 24) / v.size.y
        );
        const clone = v.model.clone(true);
        clone.scale.setScalar(s);
        clone.position.set(spot.x + dx * spot.fp[0], 0, spot.z + dz * spot.fp[1]);
        clone.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        scene.add(clone);
        st.applied.push(clone);
      }
      continue;
    }
    const clone = st.model.clone(true);
    const s = Math.min(
      spot.fp[0] / st.size.x,
      spot.fp[1] / st.size.z,
      (spot.h || 24) / st.size.y
    );
    clone.scale.setScalar(s);
    clone.position.set(spot.x, 0, spot.z);
    clone.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(clone);
    st.applied.push(clone);
    // Skyscraper (AI Finance Tower): sprinkle window sparkles on the tower
    // faces — small emissive points that twinkle in the main loop.
    if (spot.glbType === 'skyscraper') addSkyscraperSparkles(spot, s, st.size);
  }
}

// ─── Skyscraper window sparkles (AI Finance Tower) ─────────────────────────
// Small emissive points scattered over the tower's four faces that twinkle in
// the main loop — "sparkle a bit / have a few lights" on the finance tower.
const skyscraperSparkles = [];   // { points, base, phase } — updated each frame
function addSkyscraperSparkles(spot, s, modelSize) {
  const w = modelSize.x * s, h = modelSize.y * s, d = modelSize.z * s;
  const count = 90;
  const positions = new Float32Array(count * 3);
  const baseAlpha = new Float32Array(count);
  const phase = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    // Pick a face (0..3) and a random spot on it, slightly proud of the surface.
    const face = Math.floor(Math.random() * 4);
    const u = (Math.random() * 2 - 1) * 0.46;
    const v = (Math.random() * 0.92 + 0.04) * h;   // spread up the tower
    const inset = 0.3;
    switch (face) {
      case 0: positions.set([spot.x + u * w, v, spot.z + d / 2 + inset], i * 3); break;   // +Z
      case 1: positions.set([spot.x + u * w, v, spot.z - d / 2 - inset], i * 3); break;   // -Z
      case 2: positions.set([spot.x + w / 2 + inset, v, spot.z + u * d], i * 3); break;   // +X
      case 3: positions.set([spot.x - w / 2 - inset, v, spot.z + u * d], i * 3); break;   // -X
    }
    baseAlpha[i] = 0.3 + Math.random() * 0.7;
    phase[i] = Math.random() * Math.PI * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xfff2c8, size: 0.9, sizeAttenuation: true,
    transparent: true, opacity: 0.9, toneMapped: false,
    depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  scene.add(points);
  skyscraperSparkles.push({ points, baseAlpha, phase, count, h });
}

function updateSkyscraperSparkles(tNow) {
  for (const sp of skyscraperSparkles) {
    sp.points.material.opacity = 0.55 + 0.35 * Math.sin(tNow * 0.8 + sp.phase[0]);
  }
}

function buildGenericFacilities() {
  for (const b of layout.buildings) {
    if (isSpecial(b.type)) continue;
    const spec = catalogType(b.type);
    if (!spec) continue;
    const cx = b.pos[0];
    const cz = b.pos[1];
    const fp = b.footprint || spec.footprint || [20, 20];
    // GLB-backed types can read too short if the source layout kept the small
    // catalog height — office towers should look like towers next to specials.
    const MIN_H = { office: 110 };
    const h = Math.min(220, Math.max(8, MIN_H[b.type] ?? (b.height || spec.height || 20)));

    // Route each facility to its GLB slot: dedicated (office/housing) or the
    // shared generic model for the plain facilities.
    const glbType = GLB_BUILDING_TYPES[b.type] ? b.type : (GENERIC_FACILITY_TYPES.includes(b.type) ? 'generic' : null);
    if (glbType) (glbState[glbType] || (glbState[glbType] = { model: null, size: null, spots: [], fallbacks: [], applied: [], loading: false })).spots.push({ x: cx, z: cz, fp, h, glbType });

    // Facade colour by height band (osm-city palette), with the lit-window
    // emissive texture on mid/high-rise so the student's own buildings read
    // as a real city, not toy boxes.
    const band = FACADE_PALETTE.findIndex((p) => h <= p.max);
    const cfg = FACADE_PALETTE[band];
    const facade = cfg.colors[hashString(b.type + '|' + cx) % cfg.colors.length];
    // Housing = one residential block of four units; everything else = one box.
    const quad = b.type === 'housing';
    const units = quad ? [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]] : [[0, 0]];
    const unitFp = quad ? [fp[0] / 2 - 1, fp[1] / 2 - 1] : fp;
    for (const [dx, dz] of units) {
      const ux = cx + dx * fp[0];
      const uz = cz + dz * fp[1];
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(unitFp[0], h, unitFp[1]),
        new THREE.MeshStandardMaterial({
          color: facade, roughness: cfg.roughness, metalness: cfg.metalness,
          emissive: 0xffffff, emissiveMap: getWindowTexture(), emissiveIntensity: Math.max(0.15, cfg.intensity),
        })
      );
      mesh.position.set(ux, h / 2, uz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      if (glbType) glbState[glbType].fallbacks.push(mesh);

      // Roof cap
      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(unitFp[0] + 0.12, 0.22, unitFp[1] + 0.12),
        new THREE.MeshStandardMaterial({ color: darken(facade, 0.55), roughness: 0.6, metalness: 0.25 })
      );
      cap.position.set(ux, h + 0.11, uz);
      cap.castShadow = true;
      scene.add(cap);
      if (glbType) glbState[glbType].fallbacks.push(cap);
    }

    // Name label
    if (labelRenderer) {
      const el = document.createElement('div');
      el.className = 'building-label';
      el.innerHTML = `<div class="bl-en">${spec.name}</div>`;
      const label = new CSS2DObject(el);
      label.position.set(cx, h + 6, cz);
      scene.add(label);
    }
  }
}

// ─── Parked vehicles (static, beside department buildings) ───────────────
// A few vehicles sit outside the facilities they belong to, so the city reads
// as alive even at a glance: ambulance → hospital, firetruck → fire station,
// police car → police station, bus → bus scheduler. Purely decorative; they
// never drive or block anything.
const PARKED_VEHICLES = {
  hospital: { file: 'assets/models/vehicles/ambulance.glb',   count: 2, size: [1.5, 1.8, 3.25], rotY: 0 },
  fire:     { file: 'assets/models/vehicles/firetruck.glb',   count: 1, size: [1.5, 1.7, 3.4],  rotY: 0 },
  police:   { file: 'assets/models/vehicles/police.glb',      count: 2, size: [1.78, 1.24, 3.73], rotY: 0 },
  bus:      { file: 'assets/models/vehicles/bus.glb',         count: 1, size: [4.09, 1.68, 1.74], rotY: Math.PI / 2 },
};

const _parkedVehicleState = { models: {}, applied: [], loading: new Set() };

function loadParkedVehicleModel(key) {
  const cfg = PARKED_VEHICLES[key];
  if (!cfg || _parkedVehicleState.models[key] || _parkedVehicleState.loading.has(key)) return;
  _parkedVehicleState.loading.add(key);
  new GLTFLoader().loadAsync(cfg.file)
    .then((gltf) => {
      _parkedVehicleState.models[key] = gltf.scene;
      placeParkedVehicles();
    })
    .catch((e) => {
      console.warn(`[parked:${key}] GLB load failed — skipping parked vehicles`, e);
      _parkedVehicleState.loading.delete(key);
    });
}

/** Find the road segment nearest to (x,z) — for parking orientation. */
function nearestRoadDir(x, z) {
  let best = Infinity, dir = { dx: 1, dz: 0 };
  for (const r of layout.roads || []) {
    const pts = r.points || [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const t = ((x - a[0]) * (b[0] - a[0]) + (z - a[1]) * (b[1] - a[1])) /
        (Math.hypot(b[0] - a[0], b[1] - a[1]) ** 2 || 1);
      const tc = Math.max(0, Math.min(1, t));
      const px = a[0] + tc * (b[0] - a[0]), pz = a[1] + tc * (b[1] - a[1]);
      const d = Math.hypot(x - px, z - pz);
      if (d < best) { best = d; dir = { dx: b[0] - a[0], dz: b[1] - a[1] }; }
    }
  }
  const len = Math.hypot(dir.dx, dir.dz) || 1;
  return { dx: dir.dx / len, dz: dir.dz / len };
}

function placeParkedVehicles() {
  // Clear any clones from an earlier pass (models load async).
  for (const o of _parkedVehicleState.applied) { scene.remove(o); }
  _parkedVehicleState.applied = [];
  for (const b of layout.buildings) {
    // Parked vehicles are configured per building type; for facilities AND
    // mission buildings (e.g. the AI Bus Scheduler) alike, as long as a
    // vehicle is configured for that type.
    const cfg = PARKED_VEHICLES[b.type];
    if (!cfg || !_parkedVehicleState.models[b.type]) continue;
    const model = _parkedVehicleState.models[b.type];
    const fp = b.footprint || [20, 20];
    const spec = catalogType(b.type);
    const h = b.height || spec?.height || 20;
    // Park along the side of the building that faces the road. Vehicles sit on
    // y=0, offset a little past the footprint edge so they read as "out front".
    const { dx, dz } = nearestRoadDir(b.pos[0], b.pos[1]);
    const perpX = -dz, perpZ = dx;   // perpendicular toward the road side
    for (let i = 0; i < cfg.count; i++) {
      const clone = model.clone(true);
      const [sx, sy, sz] = cfg.size;
      const targetLen = 4.4;   // ~car length in plan metres
      const s = targetLen / Math.max(sx, sz);
      clone.scale.setScalar(s);
      // Offset perpendicular from the building edge; nudge along the road for
      // multiple vehicles so they don't stack exactly on top of each other.
      const edge = Math.max(fp[0], fp[1]) / 2 + 2.2;
      const along = (i - (cfg.count - 1) / 2) * 4.6;
      const px = b.pos[0] + perpX * edge + dx * along;
      const pz = b.pos[1] + perpZ * edge + dz * along;
      clone.position.set(px, sy * s / 2, pz);   // base on y=0
      clone.rotation.y = Math.atan2(dx, dz) + (cfg.rotY || 0);   // face along the road
      clone.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      scene.add(clone);
      _parkedVehicleState.applied.push(clone);
    }
  }
}

// ─── Student parks + roads ────────────────────────────────────────────────
function carveParks() {
  for (const p of layout.parks) {
    addPark(p.cx, p.cz, p.radius);
  }
}

function carveRoads() {
  buildRoadsInto(scene, layout.roads, {});
  scatterStreetTrees();
}

// Scatter trees along both sides of every road (street trees), offset from the
// centreline so they don't sit on the carriageway. Uses the Quaternius packs.
function scatterStreetTrees() {
  if (!_treePacks) return;
  for (const road of layout.roads || []) {
    const half = (road.width || ROAD_WIDTH[road.class] || ROAD_WIDTH.residential) / 2;
    const off = half + 3.5;
    for (const side of [1, -1]) {
      const pts = road.points;
      for (let i = 0; i < pts.length - 1; i++) {
        const [x0, z0] = pts[i];
        const [x1, z1] = pts[i + 1];
        const len = Math.hypot(x1 - x0, z1 - z0);
        const n = Math.max(1, Math.floor(len / 28));   // one tree ~every 28m
        for (let k = 0; k < n; k++) {
          const t = ((k + 0.5) / n + (hashString(road.points.length * 31 + i * 7 + side * 13 + k) % 100) / 1000) % 1;
          const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
          // perpendicular offset to the side
          let dx = x1 - x0, dz = z1 - z0;
          const dl = Math.hypot(dx, dz) || 1;
          dx /= dl; dz /= dl;
          const nx = -dz * side, nz = dx * side;
          addTree(x + nx * off, z + nz * off, 0.9 + ((hashString(i * 5 + k * 3) % 10) / 10) * 0.5);
        }
      }
    }
  }
}

// ─── Champion + camera + input ────────────────────────────────────────────
function findSpawn() {
  const central = layout.buildings.find((b) => b.type === 'city_central');
  if (central) return { x: central.pos[0], z: central.pos[1] };
  return { x: 1000, z: 1000 };
}

async function spawnChampion() {
  const spawn = findSpawn();
  city.spawnWorld = new THREE.Vector3(spawn.x, 0, spawn.z);
  champion = await createChampion(ASSET_BASE, city);
  // Grow the champion with the densified buildings so proportions stay right.
  if (growScale && growScale !== 1) champion.group.scale.multiplyScalar(growScale);
  scene.add(champion.group);
  orbit.target.copy(city.spawnWorld);
  sim = {
    walkSpeed: 2,
    nearQuest: null,
    // Does a building type have a playable game to enter? (Chat uses this to
    // decide whether to offer an Enter button.)
    questHasGame(type) { return questHasGameForType(type); },
    walkTo(building) {
      if (!champion || !building || (taxi && taxi.isActive())) return;
      walkNav = { x: building.pos[0], z: building.pos[1] };
      showToast(`🚶 Walking to ${buildingName(building)}…`);
    },
    flyTo(building) {
      if (!champion || !building || !taxi) return;
      if (!taxi.isActive()) taxi.board(champion);
      const h = building.height || 30;
      taxiNav = { x: building.pos[0], z: building.pos[1], y: h + 14 };
      taxi.setAutoNav(true);
      updateFlyButtons();
      showToast(`🚀 Flying to ${buildingName(building)}…`);
    },
    // Enter the quest building the champion is standing near (used by the
    // buddy chat's /enter command + Enter buttons — same path as the floating
    // 🎮 Enter prompt).
    enterNearQuest() {
      const quest = this.nearQuest;
      if (!quest) return { ok: false, note: 'Walk up to a mission building first, then I can open it!' };
      const url = questGameUrl(quest.id);
      if (!url) return { ok: false, note: `The ${quest.labelEn} doesn't have a game yet — try a mission building like the ♻️ Recycling Lab!` };
      openMinigame({ questId: quest.id, name: quest.labelEn, gameUrl: url });
      return { ok: true, note: `🎮 Opening the ${quest.labelEn}…` };
    },
  };
  setupAirTraffic();
}

function buildingName(b) {
  const spec = catalogType(b.type);
  return spec ? spec.name : b.type;
}

function setupAirTraffic() {
  // Landing zones = student parks (open areas) + the city centre plaza.
  const landingZones = (layout.parks || []).map((p) => ({ x: p.cx, z: p.cz, radius: Math.max(p.radius, 40) }));
  landingZones.push({ x: 1000, z: 1000, radius: 60 });

  taxi = createFlyingTaxi(scene, { walkSpeed: 18, runSpeed: 70, landingZones, autoNavFloor: 260 });

  // Decorative skyline traffic + sentinels over the densified city footprint.
  // Tablets get a lighter swarm — these are pure decoration and each one is a
  // per-frame update + instance write.
  const bounds = cityBounds || { minX: 0, maxX: 2000, minZ: 0, maxZ: 2000 };
  decoTaxis = createDecoTaxis(scene, IS_MOBILE ? 12 : 24, { bounds });
  skySentinels = createSkySentinels(scene, IS_MOBILE ? 8 : 14, { bounds });

  // Patrol drones visit the student's major buildings AND generic facilities.
  // The drone COUNT is fixed (density independent of building count); the
  // bounds seed an even sky grid so the swarm covers the whole city.
  const stops = layout.buildings.map((b) => {
    const h = b.height || catalogType(b.type)?.height || 30;
    return { x: b.pos[0], z: b.pos[1], y: h + 8, home: b.type === 'atc' };
  });
  drones = stops.length ? createDrones(scene, 'central', { stops, bounds, mobile: IS_MOBILE }) : null;

  // Road traffic — cars & buses cruising along the student's roads. Counts are
  // density-based (proportional to total road length) so every design looks
  // equally busy; tablets just get a lighter multiplier.
  try { traffic = createTraffic(scene, layout.roads, { density: IS_MOBILE ? 0.55 : 1 }); }
  catch (e) { console.warn('[city-builder] traffic init failed', e); traffic = null; }

  // Pedestrians — people milling around the city. Density is area-based so a
  // big footprint gets proportionally more people; tablets use a lighter scale.
  try { pedestrians = createPedestrians(scene, layout, { bounds, density: IS_MOBILE ? 0.55 : 1 }); }
  catch (e) { console.warn('[city-builder] pedestrians init failed', e); pedestrians = null; }
  city.pedestrians = pedestrians;

  // Expose for the minimap + buddy (read-only consumers)
  city.layout = layout;
  city.drones = drones;

  minimap = createMinimap(city, champion, taxi, { bounds });
}

function updateFlyButtons() {
  const ride = taxi && taxi.isActive();
  const up = document.getElementById('btn-flyup');
  const down = document.getElementById('btn-flydown');
  if (up) up.classList.toggle('hidden', !ride);
  if (down) down.classList.toggle('hidden', !ride);
}

function toggleTaxi() {
  if (!taxi || !champion) return;
  if (taxi.isActive()) {
    taxiNav = null;
    taxi.setAutoNav(false);
    taxi.exit();
  } else {
    taxi.board(champion);
    showToast('🚕 Flying! Use ⬆️ ⬇️ to climb, exit with 🚕 again.');
  }
  updateFlyButtons();
}

const _camPos = new THREE.Vector3();
function updateCamera(dt, taxiActive) {
  const focus = taxiActive ? taxi.getPos() : (champion ? champion.state.pos : orbit.target);
  // Ease the zoom toward the mode's distance: overview → walk → taxi (closest).
  const wantDist = taxiActive ? orbit.distTaxi : (champion ? orbit.distWalk : 62);
  orbit.dist += (wantDist - orbit.dist) * Math.min(1, dt * 2.5);
  if (!champion || orbit.locked) {
    // gentle auto-orbit when no champion yet / locked view
    orbit.theta += dt * 0.05;
  }
  const cosP = Math.cos(orbit.phi);
  _camPos.set(
    focus.x + orbit.dist * Math.sin(orbit.theta) * Math.sin(orbit.phi),
    focus.y + orbit.dist * cosP,
    focus.z + orbit.dist * Math.cos(orbit.theta) * Math.sin(orbit.phi)
  );
  camera.position.lerp(_camPos, Math.min(1, dt * 6));
  camera.lookAt(focus.x, focus.y + 2, focus.z);
  orbit.target.lerp(focus, Math.min(1, dt * 3));
}

// ─── Building entry (tap to open minigame) ────────────────────────────────
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const dragState = { on: false, sx: 0, sy: 0, moved: 0 };

// Must be called AFTER setupScene() (renderer/camera exist then).
function wireRendererInteraction() {
  renderer.domElement.addEventListener('pointerdown', (e) => {
    dragState.on = true;
    dragState.sx = e.clientX; dragState.sy = e.clientY;
    dragState.moved = 0;
  });
  window.addEventListener('pointermove', (e) => {
    if (!dragState.on) return;
    const dx = e.clientX - dragState.sx, dy = e.clientY - dragState.sy;
    dragState.sx = e.clientX; dragState.sy = e.clientY;
    dragState.moved += Math.abs(dx) + Math.abs(dy);
    if (dragState.moved > 6) {
      orbit.theta -= dx * 0.006;
      orbit.phi = Math.max(0.25, Math.min(1.45, orbit.phi - dy * 0.006));
    }
  });
  window.addEventListener('pointerup', (e) => {
    if (!dragState.on) return;
    dragState.on = false;
    if (dragState.moved <= 6) tapAt(e.clientX, e.clientY);
  });
}

function tapAt(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(interactMeshes, false);
  if (hits.length && hits[0].object.userData.kind === 'quest') {
    const data = hits[0].object.userData;
    openMinigame(data);
  }
}

function openMinigame(data) {
  // Guard: a quest with no deployed game (traffic_lab, monitoring, water,
  // power…) must never open a blank overlay. Show a friendly toast instead.
  if (!data || !data.gameUrl) {
    showToast(`⏳ ${data?.name || 'This building'} doesn't have a game yet — try a mission building!`);
    return;
  }
  const overlay = document.getElementById('game-overlay');
  const frame = document.getElementById('game-frame');
  document.getElementById('game-overlay-title').textContent = data.name;
  frame.src = data.gameUrl;
  overlay.classList.remove('hidden');
  // mark quest as unlocked/complete-ish flow (keep simple: toast on Done)
  document.getElementById('game-overlay-done').onclick = () => {
    frame.src = '';
    overlay.classList.add('hidden');
    const st = loadQuestState();
    if (!st.completed.includes(data.questId)) {
      st.completed.push(data.questId);
      try { localStorage.setItem('hk_ai_city_quests_v1', JSON.stringify(st)); } catch (err) { /* ignore */ }
      invalidateQuestState();
    }
    showToast(`✅ ${data.name} complete!`);
  };
  document.getElementById('game-overlay-close').onclick = () => {
    frame.src = '';
    overlay.classList.add('hidden');
  };
}

// ─── Buddy + skins ────────────────────────────────────────────────────────
function mountChat() {
  mountCityBuddy(city, champion, sim, layout);
}

function mountSkins() {
  mountSkinSidebar(ASSET_BASE, champion, (skin) => showToast(`👑 ${skin.name} equipped!`));
}

// ─── Main loop ────────────────────────────────────────────────────────────
let lastT = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  const tNow = now / 1000;

  // Road traffic
  if (traffic) traffic.update(dt);
  // Pedestrians
  if (pedestrians) pedestrians.update(dt, tNow);

  // Air traffic
  if (decoTaxis) decoTaxis.update(dt, tNow);
  if (skySentinels) skySentinels.update(dt, tNow);
  if (drones) drones.update(dt, tNow);

  const taxiActive = taxi && taxi.isActive();
  if (taxiActive) {
    // Auto-fly to a building (buddy "fly to X") overrides manual steering.
    let tx = input.x, tz = input.z, ascend = input.ascend, descend = input.descend;
    if (taxiNav) {
      const tp = taxi.getPos();
      const dx = taxiNav.x - tp.x, dz = taxiNav.z - tp.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 16) {
        taxiNav = null;
        taxi.setAutoNav(false);
        showToast('📍 Arrived! Tap 🚕 to land.');
      } else {
        const len = dist || 1;
        tx = dx / len; tz = dz / len;
        const dy = taxiNav.y - tp.y;
        if (dy > 2) ascend = true; else if (dy < -2) descend = true;
      }
    }
    taxi.update(dt, { x: tx, z: tz, running: true, ascend, descend }, tNow);
    sim.nearQuest = null;   // flying — no building is "near" for entering
  } else if (champion) {
    // Walk navigation (buddy "walk to X") steers toward the target.
    let mx = input.x, mz = input.z, mvRunning = input.running, mvJump = input.jump;
    if (walkNav) {
      const p = champion.state.pos;
      const dx = walkNav.x - p.x, dz = walkNav.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 4) {
        walkNav = null;
      } else {
        const len = dist || 1;
        mx = dx / len; mz = dz / len; mvRunning = false;
      }
    }    champion.update(dt, {
      x: mx, z: mz, running: mvRunning, jump: mvJump,
      speedScale: (sim.walkSpeed || 2) / WALK_SPEED,
    });
    input.jump = false;
    if (input.wave) { input.wave = false; champion.wave(); }
    if (input.dance) { input.dance = false; champion.dance(); }
    sim.nearQuest = nearestQuest();
  }

  updateQuestPrompt();
  updateCamera(dt, taxiActive);
  if (specialSystem) updateBeacons(now);
  if (skyscraperSparkles.length) updateSkyscraperSparkles(tNow);
  // CSS2D labels + minimap + HUD are DOM/canvas writes — throttle to ~30 Hz
  // (every other frame) so they never contend with the GL render for the main
  // thread on a tablet.
  if ((now - _lastDomUpdate) > 33) {
    _lastDomUpdate = now;
    if (labelRenderer) labelRenderer.render(scene, camera);
    if (minimap) minimap.update();
    updateDebugHud();
  }
  composer.render();
}
let _lastDomUpdate = 0;

// ─── Debug HUD (people / vehicles / drones live counts) ────────────────────
// A small readout in the corner so we can see at a glance whether the living
// city systems are actually running. Auto-shows after boot; 'd' toggles it.
let _debugHud = null;
let _debugShow = true;
function updateDebugHud() {
  if (!_debugShow) return;
  if (!_debugHud) {
    _debugHud = document.createElement('div');
    _debugHud.style.cssText = 'position:fixed;right:10px;bottom:10px;z-index:9999;background:rgba(0,0,0,0.75);color:#7dffb0;font:12px ui-monospace,monospace;padding:6px 10px;border-radius:8px;pointer-events:none;white-space:pre;';
    document.body.appendChild(_debugHud);
  }
  _debugHud.textContent =
    `people: ${pedestrians ? pedestrians.getCount() : 'null'}\n` +
    `cars/buses: ${traffic ? traffic.vehicles.length : 'null'}\n` +
    `drones: ${drones ? (drones.getCount ? drones.getCount() : '?') : 'null'}\n` +
    `loading: ${document.getElementById('loading').classList.contains('done') ? 'done' : '…'}`;
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'd' || e.key === 'D') _debugShow = !_debugShow;
});

function nearestQuest() {
  if (!champion || !specialSystem) return null;
  const p = champion.state.pos;
  let best = null, bestD = 80;
  for (const ref of specialSystem.questRefs) {
    const d = Math.hypot(ref.cx - p.x, ref.cz - p.z);
    if (d < bestD) { bestD = d; best = ref; }
  }
  return best ? QUESTS.find((q) => q.id === best.q.id) : null;
}

// ─── Quest enter prompt ──────────────────────────────────────────────────
// When the champion stands near a mission building that has a playable
// mini-game, show a visible "🎮 Enter" button (the invisible tap-target alone
// wasn't discoverable for children). Locked / coming-soon buildings show the
// label without the button, matching the HK topography flow.
const _questPromptEl = document.getElementById('quest-prompt');
const _questPromptLabel = document.getElementById('quest-prompt-label');
const _questPromptBtn = document.getElementById('quest-prompt-btn');

function updateQuestPrompt() {
  if (!_questPromptEl) return;
  const quest = sim && sim.nearQuest;
  if (!quest) { _questPromptEl.classList.add('hidden'); return; }
  const st = questStatus(quest, loadQuestState());
  if (st === 'locked') {
    _questPromptLabel.textContent = `🔒 ${quest.labelZh} ${quest.labelEn}`;
    _questPromptBtn.classList.add('hidden');
  } else if (!quest.gameUrl) {
    // No game deployed for this department yet — show the label but no Enter.
    _questPromptLabel.textContent = `⏳ ${quest.labelZh} ${quest.labelEn}`;
    _questPromptBtn.classList.add('hidden');
  } else {
    _questPromptLabel.textContent = `🏛️ ${quest.labelZh} ${quest.labelEn}`;
    _questPromptBtn.classList.remove('hidden');
  }
  _questPromptEl.classList.remove('hidden');
}

function wireQuestPrompt() {
  if (!_questPromptBtn) return;
  _questPromptBtn.addEventListener('pointerdown', () => {
    const quest = sim && sim.nearQuest;
    if (!quest) return;
    const url = questGameUrl(quest.id);
    if (!url) return;
    openMinigame({ questId: quest.id, name: quest.labelEn, gameUrl: url });
  });
}

const _bc = new THREE.Color();
function updateBeacons(t) {
  if (!specialSystem.beacon) return;
  const state = loadQuestState();
  specialSystem.beaconPositions.forEach((bp, i) => {
    const st = questStatus(specialSystem.questRefs[i].q, state);
    if (st === 'locked') { _bc.setHex(0x3a3f46); }
    else if (st === 'coming_soon') { _bc.setHex(0x8a6420); }
    else {
      const pulse = 0.55 + 0.45 * Math.sin(t * 0.003 + i);
      _bc.setHex(st === 'completed' ? 0x00ff9d : 0x00f2fe).multiplyScalar(pulse);
    }
    specialSystem.beacon.setColorAt(i, _bc);
  });
  specialSystem.beacon.instanceColor.needsUpdate = true;
}

function showToast(msg) {
  const el = document.createElement('div');
  el.className = 'toast show';
  el.textContent = msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

// ─── Input wiring ─────────────────────────────────────────────────────────
function wireInput() {
  const isTyping = () => {
    const ae = document.activeElement;
    return ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable);
  };

  window.addEventListener('keydown', (e) => {
    // Don't hijack typing in the buddy chat input (or any text field).
    if (isTyping()) return;
    keys[e.key.toLowerCase()] = true;
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k) || ['w', 'a', 's', 'd'].includes(k)) e.preventDefault();
    if (k === ' ') input.jump = true;
  });
  window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

  document.querySelectorAll('.dpad-btn').forEach((btn) => {
    const dir = btn.dataset.dir;
    const on = (e) => { e.preventDefault(); keys['dir:' + dir] = true; };
    const off = (e) => { e.preventDefault(); keys['dir:' + dir] = false; };
    btn.addEventListener('pointerdown', on);
    btn.addEventListener('pointerup', off);
    btn.addEventListener('pointerleave', off);
  });
  document.getElementById('btn-run').addEventListener('pointerdown', (e) => { e.preventDefault(); input.running = true; });
  document.getElementById('btn-run').addEventListener('pointerup', () => { input.running = false; });
  document.getElementById('btn-jump').addEventListener('pointerdown', (e) => { e.preventDefault(); input.jump = true; });
  document.getElementById('btn-wave').addEventListener('pointerdown', (e) => { e.preventDefault(); input.wave = true; });
  document.getElementById('btn-dance').addEventListener('pointerdown', (e) => { e.preventDefault(); input.dance = true; });
  document.getElementById('orbit-toggle').addEventListener('click', () => { orbit.locked = !orbit.locked; });

  // Flying taxi controls
  const taxiBtn = document.getElementById('btn-taxi');
  const flyUp = document.getElementById('btn-flyup');
  const flyDown = document.getElementById('btn-flydown');
  taxiBtn?.addEventListener('pointerdown', (e) => { e.preventDefault(); toggleTaxi(); });
  const hold = (el, key) => {
    const on = (e) => { e.preventDefault(); input[key] = true; };
    const off = (e) => { e.preventDefault(); input[key] = false; };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off);
    el.addEventListener('pointerleave', off);
  };
  if (flyUp) hold(flyUp, 'ascend');
  if (flyDown) hold(flyDown, 'descend');

  // sample city / controls sound
  document.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { try { playTap(); } catch (e) { /* no audio */ } }));
}

function readInput() {
  const k = keys;
  let x = 0, z = 0;
  if (k['arrowup'] || k['w'] || k['dir:up']) z += 1;
  if (k['arrowdown'] || k['s'] || k['dir:down']) z -= 1;
  if (k['arrowleft'] || k['a'] || k['dir:left']) x -= 1;
  if (k['arrowright'] || k['d'] || k['dir:right']) x += 1;
  input.x = x; input.z = z;
}

// ─── Layout entry (localStorage / file / paste / sample) ──────────────────
function loadLayout(raw) {
  const v = validateLayout(raw);
  if (!v.ok) {
    showEntryError(v.errors[0]);
    return false;
  }
  layout = sanitizeLayout(raw);
  // Densify: grow buildings/roads/parks + pull positions closer (no overlap).
  const dense = densifyLayout(layout);
  layout = dense.layout;
  growScale = dense.grow;
  cityBounds = dense.bounds;
  return true;
}

function showEntryError(msg) {
  const sub = document.querySelector('.entry-card p');
  if (sub) sub.textContent = '⚠️ ' + msg;
}

function startEntryFlow() {
  const overlay = document.getElementById('entry-overlay');
  const localBtn = document.getElementById('entry-local');
  const fileBtn = document.getElementById('entry-file');
  const pasteBtn = document.getElementById('entry-paste');
  const sampleBtn = document.getElementById('entry-sample');
  const fileInput = document.getElementById('file-input');
  const pasteWrap = document.getElementById('paste-wrap');
  const pasteBox = document.getElementById('paste-box');
  const pasteGo = document.getElementById('paste-go');

  let saved = null;
  try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) { /* ignore */ }
  if (!saved) localBtn.textContent = '▶ Start with an empty sample';

  const begin = (raw) => {
    if (!loadLayout(raw)) return;
    if (!isWebGLAvailable()) {
      showBootError('This device can\u2019t run the 3D view (WebGL is off or blocked). Go back to the 2D planner — your city is saved!');
      return;
    }
    overlay.classList.add('hidden');
    boot();
  };

  localBtn.addEventListener('click', () => {
    if (saved) { try { begin(JSON.parse(saved)); } catch (e) { begin(sampleLayout()); } }
    else begin(sampleLayout());
  });
  // Native <label for="file-input"> already opens the picker on every browser
  // (including tablets/iOS where programmatic .click() on a hidden input is
  // unreliable). This JS handler is a fallback for browsers that block label
  // activation; the change event itself is what actually loads the file.
  fileBtn.addEventListener('click', (e) => {
    if (e.defaultPrevented) return;   // label already handled it
    e.preventDefault();
    fileInput.click();
  });
  fileInput.addEventListener('change', () => {
    const f = fileInput.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => { try { begin(JSON.parse(reader.result)); } catch (e) { showEntryError('That file is not valid JSON.'); } };
    reader.readAsText(f);
  });
  pasteBtn.addEventListener('click', () => { pasteWrap.style.display = pasteWrap.style.display === 'none' ? 'block' : 'none'; });
  pasteGo.addEventListener('click', () => {
    try { begin(JSON.parse(pasteBox.value)); } catch (e) { showEntryError('That JSON did not parse.'); }
  });
  // "Try a sample city" → the existing Hong Kong topography 3D simulation.
  sampleBtn.addEventListener('click', () => {
    window.location.href = '/hong-kong-real/';
  });
}

// ─── Boot ─────────────────────────────────────────────────────────────────
// Cheap WebGL support check. Returns true if a context can be created at all
// (we don't keep it — setupScene() creates the real one).
function isWebGLAvailable() {
  try {
    const test = document.createElement('canvas');
    const gl = test.getContext('webgl2') || test.getContext('webgl') || test.getContext('experimental-webgl');
    return !!gl;
  } catch (e) {
    return false;
  }
}

function showBootError(msg) {
  // Never leave the loading spinner frozen: surface a clear error + retry.
  const loading = document.getElementById('loading');
  const fill = document.getElementById('loading-fill');
  if (fill) fill.style.width = '100%';
  const sub = document.querySelector('.entry-card p');
  if (sub) sub.textContent = '⚠️ ' + msg;
  const localBtn = document.getElementById('entry-local');
  if (localBtn) localBtn.textContent = '↻ Try again';
  const overlay = document.getElementById('entry-overlay');
  if (overlay) overlay.classList.remove('hidden');
  if (loading) loading.classList.add('done');   // hide the loading overlay
}

async function boot() {
  try {
    await bootInner();
  } catch (e) {
    console.error('[city-builder] boot failed:', e);
    showBootError('Something went wrong building your city — tap to try again.');
  }
}

async function bootInner() {
  setupScene();
  labelRenderer = createLabelRenderer(stage);

  const fill = document.getElementById('loading-fill');
  fill.style.width = '25%';
  await loadTreeModels();
  await loadTreePacks();
  await loadParkModel();
  loadNatureFiller();   // async — bushes/flowers/rocks for parks
  fill.style.width = '60%';

  buildTreeVariants();
  carveParks();
  carveRoads();
  flushTrees();
  flushNatureFiller();  // placements queued during carve; flush what's loaded
  buildQuestLandmarks();
  buildGenericFacilities();
  fill.style.width = '80%';
  // Street furniture (streetlights along roads, benches around parks).
  streetProps = await createStreetProps(scene, layout);
  city.streetProps = streetProps;
  // Playground + street deco (async, non-blocking).
  scatterStreetDeco(scene, layout);
  // Async — replace procedural GLB-backed buildings (office towers, housing) when ready.
  for (const [type, url] of Object.entries(GLB_BUILDING_TYPES)) loadBuildingModel(type, url);
  loadHousingVariants();
  // Parked vehicles (ambulance/firetruck/police/bus) — async, decorative.
  for (const key of Object.keys(PARKED_VEHICLES)) loadParkedVehicleModel(key);

  await spawnChampion();
  wireRendererInteraction();
  mountChat();
  mountSkins();
  wireInput();
  wireQuestPrompt();

  document.getElementById('loading').classList.add('done');
  fill.style.width = '100%';
  window.addEventListener('resize', () => city.resize());
  window.__scene = scene;   // debug hook (harmless)
  window.__layout = layout; // debug hook
  window.__city = city;     // debug hook (champion/taxi/pedestrians handles)
  requestAnimationFrame(loop);
}

// ─── Init ─────────────────────────────────────────────────────────────────
startEntryFlow();
window.addEventListener('resize', () => {
  if (renderer && camera) { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); if (composer) composer.setSize(window.innerWidth, window.innerHeight); }
});

// Update input each animation frame (cheap)
setInterval(readInput, 50);
