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
import { createGLTFLoader } from '../shared/gltf.js';
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
import { createClouds } from './clouds.js';
import { createStreetProps } from './street-props.js';
import { scatterStreetDeco } from './street-deco.js';
import { createStreetFurniture } from './street-furniture.js';
import { createMinimap } from './minimap.js';
import { mountCityBuddy } from './buddy.js';
import { createLabelRenderer, updateLabels } from '../champion-city/labels.js';
import { mountSkinSidebar, equipCustomDefault } from '../champion-city/skins.js';
import { preloadAccessories } from '../champion-city/accessories.js';
import { saveCustomSkin, loadCustomSkinBlob, blobToObjectUrl, revokeObjectUrl, looksLikeGlb } from '../champion-city/custom-skin.js';
import { playTap } from '../champion-city/sound.js';
import { attachContextLossGuard } from '../champion-city/context-guard.js';
import { ParticlePool } from '../champion-city/particles.js';
import { catalogType, isSpecial } from '../city-common/catalog.js';
import { sanitizeLayout, validateLayout, ROAD_WIDTH, densifyLayout, typeSpec } from '../city-common/layout.js';
import { LIBRARY, libraryUrl, libraryItem } from '../city-common/library.js';
import { buildSampleCity } from '../city-common/sample-city.js';
import { isRoadVehicle, vehicleTargetLength } from '../city-common/vehicle-scale.js';
import { collectState, composeChampionFile, championFilename, sanitizeChampionFile, writeState, rememberSavedAt, lastSavedAt } from '../city-common/champion-file.js';
import { readBadges, tierOf, TIERS } from '../city-common/badges.js';
import { parseCapability, capabilityDescriptor, stage1Note, runInference } from '../city-common/cap-runtime.js';
import { mountPropLibrary } from './prop-library.js';
import { createGrabSystem } from '../shared/grab.js';
import { createDrivableCar } from './drive.js';
import { initI18n, applyStatic, mountLangToggle, t } from './i18n.js';

const ASSET_BASE = '../champion-city/assets/';
const STORAGE_KEY = 'p5_city_planner_layout_v1';

// Object URL for the child's uploaded "fitted champion" GLB (Fit Studio), if
// any. Created at boot from IndexedDB and handed to spawnChampion + skins.
let _customSkinUrl = null;

// The recycling centre opens the Workshop platform (where the student builds
// the recycling-sorting AI) instead of the shared P3 waste-sorters demo.
const QUEST_GAME_URL_OVERRIDES = {
  14: 'https://workshop.ai-education.workers.dev/', // Recycling Lab → Workshop platform
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

// Low-end devices (school tablets with limited RAM/cores) drop the expensive
// post passes so the city stays smooth instead of sputtering.
const LOW_END = IS_MOBILE && (
  (navigator.deviceMemory && navigator.deviceMemory <= 4) ||
  (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4)
);

// ─── Dynamic resolution governor ──────────────────────────────────────────
// Cap the absolute backing-store size (bigger than devicePixelRatio alone, a
// 2048×1536@1.25 framebuffer is huge on tablets) and adaptively step resolution
// down if sustained FPS drops, back up with hysteresis when it recovers.
const MAX_PIXELS = LOW_END ? 1.6e6 : (IS_MOBILE ? 2.6e6 : 5e6);   // backing-store px
let resScale = 1;                    // 0.5..1 adaptive multiplier
let govAcc = 0, govFrames = 0, govFps = 60;

function applyResolution() {
  if (!renderer) return;
  const w = window.innerWidth, h = window.innerHeight;
  const basePr = Math.min(window.devicePixelRatio, LOW_END ? 1 : (IS_MOBILE ? 1.25 : 2));
  const scale = Math.min(1, Math.sqrt(MAX_PIXELS / Math.max(1, w * h * basePr * basePr)));
  const pr = Math.max(0.5, basePr * resScale * scale);
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h);
  if (composer) composer.setSize(w, h);
}

function adaptQuality(fps) {
  if (fps < 26 && resScale > 0.5) { resScale = Math.max(0.5, resScale - 0.15); applyResolution(); }
  else if (fps > 55 && resScale < 1) { resScale = Math.min(1, resScale + 0.15); applyResolution(); }
}

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

// Inverted window grid used as a bumpMap: walls stay mid-grey, window cells are
// dark, so the shared lit-window canvas also reads as recessed frames under the
// key light instead of a flat sticker. Same 14×22 grid + repeat wrapping so the
// relief lines up with the emissive pattern.
let _windowBumpTex = null;
function getWindowBumpTexture() {
  if (_windowBumpTex) return _windowBumpTex;
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#7f7f7f';
  ctx.fillRect(0, 0, size, size);
  const cols = 14, rows = 22, cw = size / cols, ch = size / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = ((r * 7 + c * 13) % 5) < 4;
      // Window glass darker than the surrounding wall → recess in the bump map.
      ctx.fillStyle = lit ? '#3c4a55' : '#141c26';
      ctx.fillRect(c * cw + 3, r * ch + 3, cw - 6, ch - 6);
    }
  }
  _windowBumpTex = new THREE.CanvasTexture(canvas);
  _windowBumpTex.wrapS = _windowBumpTex.wrapT = THREE.RepeatWrapping;
  return _windowBumpTex;
}

// Ground distance-fade: the 6000×6000 ground plane's far edge must melt into
// the fog colour *before* FogExp2's residual (~86% at 2 km) could expose the
// seam against the sky. Mixes the textured albedo toward the fog colour past
// ~800 m from the camera, so the "world ends in a straight line" artefact can
// never reappear regardless of exposure or lighting on the ground.
let _groundMat = null;   // ref for the per-frame camera uniform
function groundDistanceFade(material) {
  _groundMat = material;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFogColor = { value: new THREE.Color(0x1c2b5a) };
    shader.uniforms.uCamPos = { value: new THREE.Vector3(1000, 220, 1000) };
    shader.uniforms.uFadeNear = { value: 800 };
    shader.uniforms.uFadeFar = { value: 1700 };
    // Keep a live handle to the compiled uniform so the frame loop can move it.
    material.userData.__uCamPos = shader.uniforms.uCamPos;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGndWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvec4 gndW = modelMatrix * vec4(transformed, 1.0); vGndWorld = gndW.xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGndWorld;\nuniform vec3 uFogColor;\nuniform vec3 uCamPos;\nuniform float uFadeNear;\nuniform float uFadeFar;')
      .replace('#include <color_fragment>',
        '#include <color_fragment>\n' +
        'float gndDist = distance(vGndWorld.xz, uCamPos.xz);\n' +
        'float gndFade = smoothstep(uFadeNear, uFadeFar, gndDist);\n' +
        'diffuseColor.rgb = mix(diffuseColor.rgb, uFogColor, gndFade);');
  };
  return material;
}

// Ground-AO gradient injected into MeshStandardMaterial: facade colour fades
// from ~62% at street level to full brightness above ~12 m, grounding buildings
// and hiding the 8-bit banding where flat walls meet the fog. Applied per-pixel
// on world Y so it never touches the emissive window layer.
function groundFacadeAO(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vGroundAO;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvec4 aoWorld = modelMatrix * vec4(transformed, 1.0); vGroundAO = aoWorld.y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGroundAO;')
      .replace('#include <color_fragment>',
        '#include <color_fragment>\n' +
        'float aoAmt = smoothstep(0.0, 12.0, vGroundAO);\n' +
        'diffuseColor.rgb *= mix(0.62, 1.0, aoAmt);');
  };
  return material;
}

// Patch-mottle for asphalt (the "black paper" fix): a large-scale value-noise
// from world XZ varies albedo ±~12% and roughness ±~0.08 so the road reads as
// worn tarmac instead of one uniform black ribbon. Uses only standard varyings
// (modelMatrix × transformed → world XZ) — no custom attributes, safe on the
// shared road material. Wheel-track sheen is intentionally deferred: it needs a
// per-vertex lateral attribute across varying road widths that can't be QA'd
// blind on a built-in material.
function asphaltSurfaceDetail(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vRoadXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvec4 rdW = modelMatrix * vec4(transformed, 1.0); vRoadXZ = rdW.xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vRoadXZ;')
      .replace('#include <color_fragment>',
        '#include <color_fragment>\n' +
        'vec2 rp = floor(vRoadXZ / 90.0);\n' +
        'float hsh = fract(sin(dot(rp, vec2(127.1, 311.7))) * 43758.5453);\n' +
        'float mottle = (hsh - 0.5) * 0.24;\n' +
        'diffuseColor.rgb *= 1.0 + mottle;')
      .replace('#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\n' +
        'roughnessFactor = clamp(roughnessFactor + (hsh - 0.5) * 0.16, 0.6, 1.0);');
  };
  return material;
}

// Contact-shadow texture for grounding buildings: a soft radial dark blob that
// visually pins each footprint to the ground (realtime shadows are off on the
// low tier and weak at altitude even where they exist). Generated once, shared
// by every footprint quad.
let _contactShadowTex = null;
function getContactShadowTexture() {
  if (_contactShadowTex) return _contactShadowTex;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.05, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.50)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.28)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  _contactShadowTex = new THREE.CanvasTexture(canvas);
  return _contactShadowTex;
}
// One merged mesh of soft shadow quads under every building footprint — grounds
// GLB and procedural buildings alike (fixes "floating boxes" in the aerial and
// street views) for a single draw call. Shadow quads sit just above the ground,
// below roads/buildings, and are depth-tested only against the ground plane so
// they never smear over roads or the champion's feet.
let _buildingShadows = null;
function addBuildingContactShadows() {
  if (_buildingShadows) { scene.remove(_buildingShadows); _buildingShadows.geometry && _buildingShadows.geometry.dispose(); _buildingShadows = null; }
  const buildings = (layout && layout.buildings) || [];
  if (!buildings.length) return;
  const mat = new THREE.MeshBasicMaterial({
    map: getContactShadowTexture(),
    transparent: true, opacity: 1,
    depthWrite: false,
  });
  // Blend so multiple overlapping shadow quads don't fully blacken.
  mat.blending = THREE.MultiplyBlending;
  const geometry = new THREE.PlaneGeometry(1, 1);
  const mesh = new THREE.InstancedMesh(geometry, mat, buildings.length);
  const m = new THREE.Matrix4(), s = new THREE.Vector3(), p = new THREE.Vector3(), q = new THREE.Quaternion();
  let i = 0;
  for (const b of buildings) {
    const spec = b.type.startsWith('lib:') ? libraryItem(b.type.slice(4)) : catalogType(b.type);
    const fp = b.footprint || spec?.footprint || [20, 20];
    const h = Math.max(fp[0], fp[1]);
    const over = 2.5;                    // bleed past the footprint
    s.set(h / 2 + over, 1, h / 2 + over);
    p.set(b.pos[0], 0.015, b.pos[1]);
    m.compose(p, q, s);
    mesh.setMatrixAt(i++, m);
  }
  mesh.count = i;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.renderOrder = -1;
  mesh.userData.kind = 'building-contact-shadow';
  scene.add(mesh);
  _buildingShadows = mesh;
  // Re-apply once the champion spawns (shadows render under everything by
  // renderOrder, no per-frame work).
  return mesh;
}

function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// ─── Sample layout (bundled so the whole thing is testable without the planner) ──
// Generation lives in city-common/sample-city.js (pure, node-testable) so the 3D
// builder and the unit tests share one source of truth. The example city is the
// Radial Ring template + cross avenue with shared-library model variety baked in.
function sampleLayout() {
  return buildSampleCity();
}

// ─── Boot ────────────────────────────────────────────────────────────────
const stage = document.getElementById('stage');
let scene, camera, renderer, composer, labelRenderer;
let _bloomPass = null;   // glow pass ref (altitude backstop drives its strength)
const buildingLabels = [];   // CSS2D building badges — distance-faded every DOM tick
let city = {};            // object passed to champion/buddy (scene/camera/renderer/spawnWorld)
let champion = null;
let sim = null;
let layout = null;
let _bootGen = 0;         // bumped on every boot; stale loops cancel themselves
let _rafId = 0;           // active requestAnimationFrame id (cancelled on re-boot)
let _bootWatchdog = 0;    // boot-hang guard (see bootInner)
const BOOT_TIMEOUT_MS = 60000; // a hung GLB fetch (flaky Wi-Fi) must never leave the loader frozen

let specialSystem = null; // { beacon, beaconPositions, meshes }
let championShadow = null;   // low-tier blob shadow under the champion
let goalRing = null;         // green ring marking the next quest building
let _goalTarget = null;      // cached next-quest QUESTS entry
let _lastGoalTs = 0;
const interactMeshes = []; // raycast targets for building entry

// Grab / select / pick-up / move system for placed library models.
let grab = null;
let selectMode = false;
let runToggled = false;   // R key — toggle run on/off

// Air traffic
let taxi = null;          // player's flying taxi
let decoTaxis = null;     // decorative skyline taxis
let skySentinels = null;  // high-altitude drifting lights
let drones = null;        // patrol drones
let traffic = null;       // road vehicles
let pedestrians = null;   // background robot NPCs floating around the city
let citizens = null;      // human citizens (posed people) near buildings
let clouds = null;        // drifting clouds in the sky
let streetProps = null;   // streetlights + benches
let minimap = null;

// Drivable cars (placed from the model library or the 🚗 Drive chooser).
let drivingCar = null;    // active createDrivableCar instance (null = walking/flying)
let driveCars = [];       // parked drivable car instances (bounded: fresh spawn replaces)
let driveGLBLoader = null; // shared GLTFLoader for spawning cars

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
  distWalk: 26, distTaxi: 15, distDrive: 13,
  lastOrbitTs: 0,          // last manual orbit drag (for idle camera auto-reset)
};
window.__orbit = orbit;    // debug hook — visual QA scripts drive the camera
const input = { x: 0, z: 0, running: false, jump: false, wave: false, dance: false, ascend: false, descend: false };
let keys = {};

// ─── Scene setup (osm-city look) ─────────────────────────────────────────
function setupScene() {
  // Re-boot after a failure: dispose the previous renderer/composer so a stale
  // canvas and its GL context don't leak alongside the new one.
  if (renderer) {
    try {
      if (composer) { composer.dispose(); composer = null; }
      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    } catch (e) { /* best-effort teardown */ }
  }
  scene = new THREE.Scene();
  // Background and fog share one colour so the horizon seam disappears: distant
  // buildings fade into the same tone the sky shows at the ground line (design
  // polish — the old mismatch drew a hard edge at the draw distance).
  scene.background = new THREE.Color(0x1c2b5a);
  scene.fog = new THREE.FogExp2(0x1c2b5a, 0.0007);

  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1.0, 8000);
  camera.position.set(1000, 220, 1350);
  camera.lookAt(1000, 10, 1000);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  applyResolution();
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;  // deep-night blacks, predictable bloom budget (was 1.25)
  renderer.shadowMap.enabled = !LOW_END;      // no realtime shadows on low tier
  renderer.shadowMap.type = IS_MOBILE ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  stage.appendChild(renderer.domElement);

  // WebGL context loss (driver crash / memory pressure — the classic iPad
  // failure under a heavy city) → friendly overlay, auto-resume on restore.
  attachContextLossGuard(renderer, { label: 'The city paused' });
  window.__contextGuard = true; // diagnostics/test hook

  // Low tier renders straight to the canvas (no EffectComposer at all — the
  // fullscreen passes + render targets are the biggest fill-rate cost on
  // tile-based mobile GPUs). A cheap CSS radial vignette stands in for the
  // shader vignette the composer normally adds.
  if (LOW_END) {
    const v = document.createElement('div');
    v.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:5;' +
      'background:radial-gradient(ellipse at center, transparent 62%, rgba(10,15,29,0.35) 100%);';
    document.body.appendChild(v);
  } else {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    // Glow discipline: threshold 0.68 keeps only genuine emitters (windows,
    // beacons, lamp accents) past the bloom gate — reflective road paint,
    // foliage and distant dashes no longer blow out into white haze. Strength
    // scaled down so bloom reads as glow, not glare. Emitters that must keep
    // glowing are re-bumped above the threshold (see facade/beacon passes).
    const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), IS_MOBILE ? 0.55 : 0.7, 0.4, 0.68);
    bloom.threshold = 0.68;
    bloom.strength = IS_MOBILE ? 0.55 : 0.7;
    _bloomPass = bloom;
    composer.addPass(bloom);
    const sat = { uniforms: { tDiffuse: { value: null }, amount: { value: IS_MOBILE ? 1.15 : 1.28 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'uniform sampler2D tDiffuse; uniform float amount; varying vec2 vUv; const vec3 LUMA=vec3(0.2126,0.7152,0.0722); void main(){ vec4 c=texture2D(tDiffuse,vUv); float luma=dot(c.rgb,LUMA); c.rgb=mix(vec3(luma),c.rgb,amount); gl_FragColor=c; }' };
    composer.addPass(new ShaderPass(sat));
    const vig = { uniforms: { tDiffuse: { value: null }, intensity: { value: 0.42 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'uniform sampler2D tDiffuse; uniform float intensity; varying vec2 vUv; void main(){ vec4 c=texture2D(tDiffuse,vUv); float d=distance(vUv,vec2(0.5)); float v=1.0-intensity*smoothstep(0.4,0.9,d); gl_FragColor=vec4(c.rgb*v,c.a); }' };
    composer.addPass(new ShaderPass(vig));
    if (!IS_MOBILE) {
      composer.addPass(new SMAAPass(window.innerWidth * renderer.getPixelRatio(), window.innerHeight * renderer.getPixelRatio()));
    }
    composer.addPass(new OutputPass());
  }

  scene.add(new THREE.HemisphereLight(0x33406e, 0x1a2440, 1.15));
  const sun = new THREE.DirectionalLight(0xffd9b3, 1.5);
  sun.position.set(1000, 1600, 1200);
  sun.castShadow = !LOW_END;
  sun.shadow.mapSize.set(IS_MOBILE ? 1024 : 2048, IS_MOBILE ? 1024 : 2048);
  // City-covering frustum (low tier has shadows off entirely). A tight
  // champion-following shadow frustum is a Phase-2 refinement, not worth
  // risking the current working setup for now.
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
    groundDistanceFade(new THREE.MeshStandardMaterial({ color: 0x141a2e, roughness: 0.9 }))
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.1;
  ground.receiveShadow = true;
  scene.add(ground);

  // Ground texture (Polyhaven CC0 "Aerial Asphalt 01", 1k) — dark-tinted so it
  // reads as night asphalt instead of a flat colour. Loaded async; the flat
  // colour stays until it arrives.
  new THREE.TextureLoader().load(
    'assets/textures/ground-asphalt.jpg',
    (tex) => {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(300, 300);            // ~20 m per tile across the 6000 m plane
      tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      ground.material.map = tex;
      ground.material.color.set(0x3a4650); // night tint over the grey asphalt
      ground.material.needsUpdate = true;
    },
    undefined,
    () => console.warn('[ground] texture failed — keeping flat colour')
  );

  // Night sky: a subtle starfield (PointsMaterial ignores fog so it shows
  // through the atmospheric haze at the horizon).
  (function addStars() {
    const N = 320;
    const pos = new Float32Array(N * 3);
    const r = 1900;
    for (let i = 0; i < N; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(1 - Math.random() * 0.55);   // above the horizon band
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.cos(phi);
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xcfe4ff, size: 1.8, sizeAttenuation: true,
      transparent: true, opacity: 0.55, fog: false, depthWrite: false,
    });
    const pts = new THREE.Points(geo, mat);
    pts.position.set(1000, 0, 1000);
    scene.add(pts);
  })();

  // Distance/grid gauge for driving is debug-only: at altitude it reads as a
  // faint cyan artefact in the "toy screenshot" sense, so ship builds skip it.
  // QA/dev can opt back in with ?grid=1.
  if (new URLSearchParams(location.search).get('grid') === '1') {
    const grid = new THREE.GridHelper(2000, 20, 0x00f2fe, 0x00f2fe);
    grid.material.transparent = true;
    grid.material.opacity = 0.06;
    grid.position.y = 0.02;
    scene.add(grid);
  }

  city.scene = scene;
  city.camera = camera;
  city.renderer = renderer;
  city.resize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    applyResolution();
  };
}

function darken(hex, factor) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  const r = Math.round(((n >> 16) & 255) * factor);
  const g = Math.round(((n >> 8) & 255) * factor);
  const b = Math.round((n & 255) * factor);
  return (r << 16) | (g << 8) | b;
}

// ─── Road FX: swept-ribbon PBR roads ───────────────────────────────────────
// Dark-charcoal asphalt (clearly darker than the ground), CC0 albedo + normal +
// roughness maps, arc-length centre dashes, and a single cool edge light on each
// side (below the bloom gate — reflective paint, not neon). A flat concrete
// sidewalk ribbon sits a hair below the asphalt so roads read as asphalt-inside-
// concrete even from the taxi with zero markings. Junction mouths get baked
// zebra + stop-line geometry (masking alone left black holes).
const ROAD_FX = {
  tileM: 16,            // world metres per texture tile along the road (coarser
                        // than the old 8 m — fewer repeats reduce altitude aliasing)
  asphColor: 0x242a30,  // dark charcoal tint (road stays darker than the ground)
  asphY: 0.03,
  dashW: 0.5,
  dashLen: 4,
  dashGap: 4,
  // Glow discipline (road markings are reflective PAINT, not light sources —
  // they must sit under the 0.68 bloom threshold). Near-white cool dash, dim
  // cool-grey edge line; brightness falls with distance so nothing smears from
  // altitude. The edge line ramps down early (see uRamp* in the marking shader)
  // so thin edge circles dissolve before they alias at altitude.
  dashColor: 0xe8f2ff,
  markY: 0.05,          // markings sit a hair above the asphalt
  glowInset: 0.7,       // glowing edge light: just inside the road edge
  glowW: 0.25,          // thin — reads as a light line, not a band
  glowY: 0.045,
  // Flat sidewalk ribbon: untextured concrete under the asphalt so the road
  // network has figure-ground at altitude without curb geometry.
  swW: 1.8,             // m of pavement on EACH side of the road
  swY: 0.02,            // a hair below asphalt (0.03) so asphalt sits on it
  swColor: 0x3a4149,    // cool concrete — lighter than asphalt, darker than ground tint
  // Junction mouth details (baked geometry, one merged layer city-wide).
  zebraGap: 1.2,        // m — spacing between zebra bars along the through road
  zebraLen: 0.45,       // m — bar thickness along the through road
  zebraDist: 2.6,       // m — zebra zone starts this far back from the mouth
  stopDist: 2.0,        // m — stop line sits this far before the terminating end
  stopLen: 0.5,         // m — stop line thickness
};
// Distance fade for road markings: full brightness up close, fades to zero by
// `fadeFar` so from the flying-taxi altitude the edge glow/dashes don't smear
// into a white fog (and don't trip the bloom at distance).
const FADE_NEAR = 140;   // m — full brightness up to here
const FADE_FAR = 360;    // m — completely gone beyond here
// Marking LOD: above the taxi altitude the fade window tightens so sub-pixel
// markings dissolve before they alias (the sidewalk + asphalt value carry the
// network read above ~300 m).
const FADE_FAR_HIGH = 220;   // m — fade window shrinks to this at altitude
function makeMarkingMaterial(colorHex, intensity, rampMin = 1.0) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(colorHex) },
      uIntensity: { value: intensity },
      uFadeNear: { value: FADE_NEAR },
      uFadeFar: { value: FADE_FAR },
      uRampMin: { value: rampMin },          // multiply toward this past uRampNear
      uRampNear: { value: 140 },
      uRampFar: { value: 300 },
    },
    vertexShader: `
      varying float vDist;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uIntensity;
      uniform float uFadeNear; uniform float uFadeFar;
      uniform float uRampMin; uniform float uRampNear; uniform float uRampFar;
      varying float vDist;
      void main() {
        float f = 1.0 - smoothstep(uFadeNear, uFadeFar, vDist);
        // Optional early intensity ramp: edge lines fall off before the fade so
        // thin lines never hang around long enough to alias into dotted rings.
        float r = mix(1.0, uRampMin, smoothstep(uRampNear, uRampFar, vDist));
        gl_FragColor = vec4(uColor * (uIntensity * f * r), 1.0);
      }`,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  return mat;
}
const _roadMats = {
  asph: asphaltSurfaceDetail(new THREE.MeshStandardMaterial({ color: ROAD_FX.asphColor, roughness: 1, metalness: 0, side: THREE.DoubleSide })),
  // Flat concrete sidewalk — one untextured standard material, merged city-wide.
  sw: new THREE.MeshStandardMaterial({ color: ROAD_FX.swColor, roughness: 0.95, metalness: 0, side: THREE.DoubleSide }),
  // Markings are unlit flat colour shaders with polygonOffset (robust at
  // distance) and a camera-distance fade (no white smear from the taxi).
  // Intensities are paint-level (well under the 0.68 bloom gate) so the lines
  // read as reflective road markings, not glowing tubes. The edge line gets an
  // early distance ramp so it dissolves cleanly before it aliases at altitude.
  dash: makeMarkingMaterial(ROAD_FX.dashColor, 0.5),
  glow: makeMarkingMaterial(0xbfd4e6, 0.25, 0.18),
  // Junction details (zebra bars + stop lines) — same paint shader as markings.
  jct: makeMarkingMaterial(ROAD_FX.dashColor, 0.5),
};
let _roadTexLoading = false;
// CC0 asphalt albedo (ground-asphalt.jpg) + matching normal + roughness maps.
// Roads render flat charcoal until the maps arrive (same async pattern as the
// ground texture). Maps are Polyhaven "Aerial Asphalt 01", CC0.
function loadRoadTextures() {
  if (_roadTexLoading) return;
  _roadTexLoading = true;
  const L = new THREE.TextureLoader();
  const cfg = (t, srgb) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    // Anisotropy: 16 is wasted on tile-based mobile GPUs — cap 4 there. Aniso
    // only matters at grazing angles; altitude views are near-vertical and the
    // mips handle them.
    t.anisotropy = Math.min(IS_MOBILE ? 4 : 16, renderer.capabilities.getMaxAnisotropy());
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  Promise.all([
    new Promise((res, rej) => L.load('assets/textures/ground-asphalt.jpg', (t) => res(cfg(t, true)), undefined, rej)),
    new Promise((res, rej) => L.load('assets/textures/aerial_asphalt_01_nor_gl_1k.jpg', (t) => res(cfg(t, false)), undefined, rej)),
    new Promise((res, rej) => L.load('assets/textures/aerial_asphalt_01_rough_1k.jpg', (t) => res(cfg(t, false)), undefined, rej)),
  ]).then(([albedo, normal, rough]) => {
    _roadMats.asph.map = albedo;
    _roadMats.asph.normalMap = normal;
    _roadMats.asph.normalScale.set(0.15, 0.15);   // low — kills high-freq normal aliasing at altitude
    _roadMats.asph.roughnessMap = rough;
    _roadMats.asph.roughness = 1;
    _roadMats.asph.needsUpdate = true;
  }).catch((e) => { console.warn('[road-fx] textures failed — staying flat charcoal', e); _roadTexLoading = false; });
}

/** Horizontal perpendicular to a polyline, averaged at vertices (for offsets). */
function roadLateral(poly) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    let nx = 0, nz = 0;
    const add = (a, b) => {
      const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
      nx += -dz / l; nz += dx / l;
    };
    if (i > 0) add(poly[i - 1], poly[i]);
    if (i < poly.length - 1) add(poly[i], poly[i + 1]);
    const l = Math.hypot(nx, nz) || 1;
    out.push({ x: nx / l, z: nz / l });
  }
  return out;
}
function offsetRoad(poly, lat, d) {
  return poly.map((p, i) => ({ x: p.x + lat[i].x * d, z: p.z + lat[i].z * d }));
}
/** Push a swept ribbon (two triangles per segment) into Pos (+ optional Uv). */
function pushRibbon(Pos, Uv, path, width, y, wantUv) {
  const half = width / 2;
  if (path.length < 2) return;
  const lat = roadLateral(path);
  const cum = [0];
  for (let i = 1; i < path.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z));
  }
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const lx0 = -lat[i].x * half, lz0 = -lat[i].z * half, rx0 = lat[i].x * half, rz0 = lat[i].z * half;
    const lx1 = -lat[i + 1].x * half, lz1 = -lat[i + 1].z * half, rx1 = lat[i + 1].x * half, rz1 = lat[i + 1].z * half;
    const xL0 = a.x + lx0, zL0 = a.z + lz0, xR0 = a.x + rx0, zR0 = a.z + rz0;
    const xL1 = b.x + lx1, zL1 = b.z + lz1, xR1 = b.x + rx1, zR1 = b.z + rz1;
    Pos.push(xL0, y, zL0, xR0, y, zR0, xL1, y, zL1);
    Pos.push(xL1, y, zL1, xR0, y, zR0, xR1, y, zR1);
    if (wantUv && Uv) {
      const u0 = cum[i] / ROAD_FX.tileM, u1 = cum[i + 1] / ROAD_FX.tileM;
      const vL = -half / ROAD_FX.tileM, vR = half / ROAD_FX.tileM;
      Uv.push(u0, vL, u0, vR, u1, vL, u1, vL, u0, vR, u1, vR);
    }
  }
}
function pointAtPoly(poly, cum, d) {
  let lo = 0, hi = poly.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] <= d) lo = m + 1; else hi = m; }
  const i = Math.max(0, lo - 1);
  const segLen = cum[i + 1] - cum[i] || 1;
  const t = Math.max(0, Math.min(1, (d - cum[i]) / segLen));
  return { x: poly[i].x + (poly[i + 1].x - poly[i].x) * t, z: poly[i].z + (poly[i + 1].z - poly[i].z) * t };
}
/** Centre dashes as short quads placed by arc length. skipArc(midArc) → boolean. */
function pushDashes(Pos, poly, cum, y, skipArc) {
  const total = cum[cum.length - 1];
  const half = ROAD_FX.dashW / 2;
  for (let s = 0; s < total; s += ROAD_FX.dashLen + ROAD_FX.dashGap) {
    const d0 = Math.min(s + ROAD_FX.dashLen, total);
    if (d0 - s < 0.3) continue;
    if (skipArc && skipArc((s + d0) / 2)) continue;
    const a = pointAtPoly(poly, cum, s), b = pointAtPoly(poly, cum, d0);
    let dx = b.x - a.x, dz = b.z - a.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const nx = -dz * half, nz = dx * half;
    Pos.push(a.x + nx, y, a.z + nz, a.x - nx, y, a.z - nz, b.x + nx, y, b.z + nz);
    Pos.push(b.x + nx, y, b.z + nz, a.x - nx, y, a.z - nz, b.x - nx, y, b.z - nz);
  }
}
/** Push a two-triangle quad between centreline points a→b (per-segment, maskable). */
function pushSegQuad(Pos, a, b, half, y) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-4) return;
  const nx = (-dz / len) * half, nz = (dx / len) * half;
  const x1 = a.x + nx, z1 = a.z + nz, x2 = a.x - nx, z2 = a.z - nz;
  const x3 = b.x + nx, z3 = b.z + nz, x4 = b.x - nx, z4 = b.z - nz;
  Pos.push(x1, y, z1, x2, y, z2, x3, y, z3);
  Pos.push(x3, y, z3, x2, y, z2, x4, y, z4);
}

// ── Junction masking (generic) ───────────────────────────────────────────────
// Roads that terminate on another road (a roundabout ring, a T-junction) get
// their centre dashes + edge glow masked a few metres before the join, and the
// "through" road's markings are masked across the approach mouth. Asphalt is
// left full-length so roads still connect.
function nearestArcOnPoly(poly, cum, P) {
  let bestArc = 0, bestDist = Infinity;
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i], b = poly[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
    const segLen = cum[i + 1] - cum[i] || 1;
    let t = l2 ? ((P.x - a.x) * dx + (P.z - a.z) * dz) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    const qx = a.x + dx * t, qz = a.z + dz * t;
    const d = Math.hypot(P.x - qx, P.z - qz);
    if (d < bestDist) { bestDist = d; bestArc = cum[i] + segLen * t; }
  }
  return { arc: bestArc, dist: bestDist };
}
/** Signed arc distance between two arc positions, wrapping for closed loops. */
function arcDelta(arc, c, total, closed) {
  let d = Math.abs(arc - c);
  if (closed) d = Math.min(d, Math.abs(arc - (c + total)), Math.abs(arc - (c - total)));
  return d;
}
function buildJunctionContacts(infos) {
  // infos: [{poly, cum, total, half, closed}]
  // Returns masks (per-road {arc, mask} for marking culling) AND junctions
  // (structured records used to draw zebra + stop-line detail at each mouth).
  const masks = infos.map(() => []);
  const junctions = [];
  for (let i = 0; i < infos.length; i++) {
    const A = infos[i];
    const ends = [
      { x: A.poly[0].x, z: A.poly[0].z, at: 0, atEnd: 'start' },
      { x: A.poly[A.poly.length - 1].x, z: A.poly[A.poly.length - 1].z, at: A.total, atEnd: 'end' },
    ];
    for (const end of ends) {
      for (let j = 0; j < infos.length; j++) {
        if (i === j) continue;
        const B = infos[j];
        const hit = nearestArcOnPoly(B.poly, B.cum, end);
        if (hit.dist < B.half + 2.5) {
          // On the terminating road i: mask markings near its end (extra room so
          // the zebra/stop detail we draw there isn't clobbered by a leftover
          // dash edge). On the through road j: mask across the approach mouth
          // (extended past the contact so no dash survives inside the junction).
          masks[i].push({ arc: end.at, mask: 8 });
          masks[j].push({ arc: hit.arc, mask: A.half + 6 });
          junctions.push({
            term: i, termEnd: end.atEnd, termArc: end.at,
            thru: j, thruArc: hit.arc,
            termHalf: A.half, thruHalf: B.half,
            thruTotal: B.total, thruClosed: B.closed,
            endX: end.x, endZ: end.z,
          });
        }
      }
    }
  }
  return { masks, junctions };
}
function makeMaskTest(masks, total, closed) {
  if (!masks || !masks.length) return null;
  return (arc) => masks.some((m) => arcDelta(arc, m.arc, total, closed) < m.mask);
}
function addFlatMesh(group, arr, mat, receive) {
  if (!arr.length) return;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat);
  if (receive) mesh.receiveShadow = true;
  group.add(mesh);
}

function buildRoadsInto(group, roads, opts = {}) {
  const elevated = !!opts.elevated;
  const P = { sw: [], asph: [], uv: [], jct: [], dash: [], glow: [] };

  // Phase 1 — collect road geometry (poly, arc info, half widths).
  const infos = [];
  for (const road of roads) {
    const width = road.width || ROAD_WIDTH[road.class] || ROAD_WIDTH.residential;
    const poly = road.points.map(([x, z]) => ({ x, z }));
    if (poly.length < 2) continue;
    const cum = [0];
    for (let i = 1; i < poly.length; i++) {
      cum.push(cum[i - 1] + Math.hypot(poly[i].x - poly[i - 1].x, poly[i].z - poly[i - 1].z));
    }
    const total = cum[cum.length - 1];
    if (total < 0.5) continue;
    const first = poly[0], last = poly[poly.length - 1];
    infos.push({
      width, half: width / 2, poly, cum, total,
      closed: Math.hypot(last.x - first.x, last.z - first.z) < 1,
    });
  }

  // Phase 2 — junction contacts (which roads terminate on which).
  const { masks, junctions } = buildJunctionContacts(infos);

  // Phase 3 — emit layers, masking dashes + glow near junction contacts.
  const yAsph = elevated ? 0.07 : ROAD_FX.asphY;
  const yMark = elevated ? 0.095 : ROAD_FX.markY;
  const yGlow = elevated ? 0.085 : ROAD_FX.glowY;
  const ySide = ROAD_FX.swY;

  for (let k = 0; k < infos.length; k++) {
    const { width, half, poly, cum, total, closed } = infos[k];
    const lat = roadLateral(poly);
    const skip = makeMaskTest(masks[k], total, closed);
    const maskedAt = (arc) => (skip ? skip(arc) : false);

    // Flat sidewalk ribbon — a wider concrete band under the asphalt so the
    // road network keeps figure-ground at altitude (no curb geometry needed).
    if (!elevated) pushRibbon(P.sw, null, poly, width + ROAD_FX.swW * 2, ySide, false);
    // Asphalt ribbon (with texture UVs) — full length, no masking.
    pushRibbon(P.asph, P.uv, poly, width, yAsph, true);
    // Centre dashes by arc length (masked near junctions).
    pushDashes(P.dash, poly, cum, yMark, maskedAt);
    // White glowing edge light per side (masked near junctions), skipped on the
    // elevated/lane variant which uses plain colour lanes instead.
    if (!elevated) {
      const gOff = half - ROAD_FX.glowInset - ROAD_FX.glowW / 2;
      for (const side of [1, -1]) {
        const path = offsetRoad(poly, lat, gOff * side);
        // Per-segment so masked arcs leave clean gaps.
        for (let s = 0; s < path.length - 1; s++) {
          if (maskedAt((cum[s] + cum[s + 1]) / 2)) continue;
          pushSegQuad(P.glow, path[s], path[s + 1], ROAD_FX.glowW / 2, yGlow);
        }
      }
    }
  }

  // Phase 4 — junction mouth detail (stop lines + zebra bars). Reclaims the
  // masked mouths so they read as painted crossings, not black holes. Each
  // terminating approach gets a stop line near its join plus zebra bars before
  // it (crossing the approach arm, pointing at approaching traffic).
  if (!elevated && junctions.length) {
    for (const jc of junctions) {
      const termInfo = infos[jc.term];
      // Direction from the mouth INTO the terminating road (where bars sit).
      const inward = jc.termEnd === 'start' ? 1 : -1;
      // Stop line: single thick bar at stopDist back from the mouth.
      const stopAt = jc.termArc + inward * ROAD_FX.stopDist;
      pushArcBar(P.jct, termInfo, clampArc(stopAt, termInfo.total), termInfo.half, ROAD_FX.stopLen / 2, yMark);
      // Zebra: thin bars, spaced out from just behind the stop line.
      for (let b = 0; b < 3; b++) {
        const zb = jc.termArc + inward * (ROAD_FX.stopDist + 1.2 + b * ROAD_FX.zebraGap);
        if (zb < 0 || zb > termInfo.total) continue;
        pushArcBar(P.jct, termInfo, zb, termInfo.half, ROAD_FX.zebraLen / 2, yMark);
      }
    }
  }

  // One mesh per layer keeps draw calls low on tablets.
  if (P.sw.length) addFlatMesh(group, P.sw, _roadMats.sw, true);
  if (P.asph.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P.asph, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(P.uv, 2));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, _roadMats.asph);
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  addFlatMesh(group, P.jct, _roadMats.jct, false);
  addFlatMesh(group, P.dash, _roadMats.dash, false);
  addFlatMesh(group, P.glow, _roadMats.glow, false);
}

function clampArc(a, total) { return Math.max(0, Math.min(total, a)); }

/** Push a bar ACROSS a road (perpendicular to its centreline) at arc position
 *  `arc`, spanning the road width (half*2) and `halfThick` deep along it.
 *  Used for stop lines + zebra bars at junction mouths. */
function pushArcBar(Pos, info, arc, half, halfThick, y) {
  const { poly, cum } = info;
  // Find the segment containing `arc` and its unit tangent.
  let lo = 0, hi = poly.length - 2;
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1;
    if (cum[m] <= arc) lo = m; else hi = m - 1;
  }
  const i = Math.max(0, Math.min(poly.length - 2, lo));
  const a = poly[i], b = poly[i + 1];
  const segLen = cum[i + 1] - cum[i] || 1;
  let dx = b.x - a.x, dz = b.z - a.z;
  const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
  const t = Math.max(0, Math.min(1, (arc - cum[i]) / segLen));
  const px = a.x + (b.x - a.x) * t, pz = a.z + (b.z - a.z) * t;
  // Across (perpendicular to travel) endpoints; bar thickness is along travel.
  const nx = -dz * half, nz = dx * half;
  pushSegQuad(Pos,
    { x: px + nx, z: pz + nz },
    { x: px - nx, z: pz - nz },
    halfThick, y);
}

// ─── Fabric: parks (grass + trees) ────────────────────────────────────────
const _treeLoader = createGLTFLoader();
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
  const loader = createGLTFLoader();
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

    // Mission buildings backed by a real CC0 GLB: push a spot (placeholder box
    // until the GLB loads) but keep the beacon + label so they still read as
    // quest buildings. Every mission building is mapped today; the procedural
    // questDesign path below is the fallback for any unmapped type.
    const missionUrl = SPECIAL_BUILDING_MODELS[b.type];
    if (missionUrl) {
      const st = (glbState[b.type] || (glbState[b.type] = { model: null, size: null, spots: [], fallbacks: [], applied: [], loading: false }));
      st.spots.push({ x: cx, z: cz, fp, h, glbType: b.type });
      // Plain placeholder until the GLB loads (or if it never does).
      const ph = new THREE.Mesh(
        new THREE.BoxGeometry(fp[0], h, fp[1]),
        new THREE.MeshStandardMaterial({ color: 0x4a5560, roughness: 0.8, metalness: 0.3 })
      );
      ph.position.set(cx, h / 2, cz);
      ph.castShadow = true;
      scene.add(ph);
      st.fallbacks.push(ph);
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
      new THREE.MeshBasicMaterial({ toneMapped: false, color: new THREE.Color(2.0, 2.0, 2.0) }),
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
  buildingLabels.push(label);
}

// ─── Generic facilities (realistic facades + label) ───────────────────────
// GLB-backed building types. Each renders as a facade extrusion immediately,
// then swaps to the GLB clone when it loads. Only CC0-licensed GLBs are
// referenced here (Kenney/Quaternius/custom); everything else stays procedural.
// `fire` uses the CC0 fire-station model; housing uses the Kenney suburban kit.
// The facility models below are Kenney City Kit (Commercial) GLBs (CC0):
//   office → skyscraper-b (tall tower)  shop → wide low-detail (mall)
//   hospital → building-i (big block)   school → building-c (low block)
//   library → building-a (mid civic)    police → building-d (mid civic)
// Stadium deliberately has NO GLB here (procedural facade + label) — the
// Poly Pizza Colosseum stand-in looked bad and was removed.
const GLB_BUILDING_TYPES = {
  fire: 'assets/models/fire-station.glb',
  housing: 'assets/models/housing-variants/housing-a.glb',
  school: 'assets/models/school.glb',
  hospital: 'assets/models/hospital.glb',
  shop: 'assets/models/shop.glb',
  office: 'assets/models/office.glb',
  library: 'assets/models/library.glb',
  police: 'assets/models/police.glb',
};
// Special/mission buildings — real CC0 GLBs (Kenney City Kit). Each keeps its
// quest beacon + label; only the building body is swapped in place of the old
// procedural/dark-box look.
const SPECIAL_BUILDING_MODELS = {
  finance_tower: 'assets/models/mission/finance-tower.glb',
  treasury: 'assets/models/mission/treasury.glb',
  sentiment_lab: 'assets/models/mission/sentiment-lab.glb',
  city_central: 'assets/models/mission/city-central.glb',
  traffic_lab: 'assets/models/mission/traffic-lab.glb',
  traffic_emergency: 'assets/models/mission/traffic-emergency.glb',
  drone_routing: 'assets/models/mission/drone-routing.glb',
  health: 'assets/models/mission/health.glb',
  bus: 'assets/models/mission/bus.glb',
  delivery: 'assets/models/mission/delivery.glb',
  monitoring: 'assets/models/mission/monitoring.glb',
  water: 'assets/models/mission/water.glb',
  power: 'assets/models/mission/power.glb',
  recycling: 'assets/models/mission/recycling.glb',
  subsurface: 'assets/models/mission/subsurface.glb',
  robot_grid: 'assets/models/mission/robot-grid.glb',
  swarm: 'assets/models/mission/swarm.glb',
  atc: 'assets/models/mission/atc.glb',
};
// Residential variations — each housing spot renders as a 2×2 block of units;
// each unit picks a RANDOM variant so a neighbourhood looks lived-in instead of
// cloned. All CC0: 21 Kenney City Kit (Suburban) houses + 8 extra residential
// models (Quaternius town houses/houses, CreativeTrio cottage, Kenney 2-storey).
const HOUSING_VARIANTS = [
  'assets/models/housing-variants/housing-a.glb',
  'assets/models/housing-variants/housing-b.glb',
  'assets/models/housing-variants/housing-c.glb',
  'assets/models/housing-variants/housing-d.glb',
  'assets/models/housing-variants/housing-e.glb',
  'assets/models/housing-variants/housing-f.glb',
  'assets/models/housing-variants/housing-g.glb',
  'assets/models/housing-variants/housing-h.glb',
  'assets/models/housing-variants/housing-i.glb',
  'assets/models/housing-variants/housing-j.glb',
  'assets/models/housing-variants/housing-k.glb',
  'assets/models/housing-variants/housing-l.glb',
  'assets/models/housing-variants/housing-m.glb',
  'assets/models/housing-variants/housing-n.glb',
  'assets/models/housing-variants/housing-o.glb',
  'assets/models/housing-variants/housing-p.glb',
  'assets/models/housing-variants/housing-q.glb',
  'assets/models/housing-variants/housing-r.glb',
  'assets/models/housing-variants/housing-s.glb',
  'assets/models/housing-variants/housing-t.glb',
  'assets/models/housing-variants/housing-u.glb',
  'assets/models/housing-variants/housing-extra-townhouse-a.glb',
  'assets/models/housing-variants/housing-extra-townhouse-b.glb',
  'assets/models/housing-variants/housing-extra-townhouse-c.glb',
  'assets/models/housing-variants/housing-extra-townhouse-large.glb',
  'assets/models/housing-variants/housing-extra-house-a.glb',
  'assets/models/housing-variants/housing-extra-house-b.glb',
  'assets/models/housing-variants/housing-extra-cottage.glb',
  'assets/models/housing-variants/housing-extra-2story-a.glb',
];
// Facilities that share the generic model until they get their own GLB.
// Plain facilities without a dedicated GLB — these fall back to the shared
// generic model. Every generic facility has its own CC0 GLB now, so this list
// is empty.
const GENERIC_FACILITY_TYPES = [];
// Mission buildings that use the industrial GLB instead of a procedural design.
// (Legacy — all 18 mission buildings now map via SPECIAL_BUILDING_MODELS.)
const INDUSTRIAL_SPECIALS = [];
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
  const loader = createGLTFLoader();
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
  createGLTFLoader().loadAsync(url)
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
      st.loading = false;   // allow a later retry (e.g. re-boot)
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
  // re-applying must not stack duplicates). Clones share geometry/material with
  // the cached source model (clone(true)) — do NOT dispose them here, or the
  // shared buffers are destroyed and every later clone renders black/broken.
  for (const clone of st.applied || []) {
    scene.remove(clone);
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
    // Facility + mission buildings stretch to fill their footprint AND catalog
    // height (non-uniform) so e.g. an office tower or the Finance Tower actually
    // reads as a tower. Shared library items (nature / props / vehicles via
    // lib:) keep uniform scaling so they are never distorted.
    const stretch = GLB_BUILDING_TYPES[spot.glbType] || SPECIAL_BUILDING_MODELS[spot.glbType];
    if (stretch) {
      clone.scale.set(
        spot.fp[0] / st.size.x,
        (spot.h || 24) / st.size.y,
        spot.fp[1] / st.size.z
      );
    } else {
      const s = Math.min(
        spot.fp[0] / st.size.x,
        spot.fp[1] / st.size.z,
        (spot.h || 24) / st.size.y
      );
      clone.scale.setScalar(s);
    }
    clone.position.set(spot.x, 0, spot.z);
    clone.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(clone);
    st.applied.push(clone);
  }
}

function buildGenericFacilities() {
  const libIdsToLoad = new Set();
  for (const b of layout.buildings) {
    if (isSpecial(b.type)) continue;
    const isLib = b.type.startsWith('lib:');
    const spec = isLib ? libraryItem(b.type.slice(4)) : catalogType(b.type);
    if (!spec) continue;
    const cx = b.pos[0];
    const cz = b.pos[1];
    const fp = b.footprint || spec.footprint || [20, 20];
    // GLB-backed types can read too short if the source layout kept the small
    // catalog height — office towers should look like towers next to specials.
    // Declared up top: the stadium branch below also needs the building height.
    const MIN_H = { office: 110 };
    const h = Math.min(220, Math.max(8, MIN_H[b.type] ?? (b.height || spec.height || 20)));

    // Shared-library models (nature / props / vehicles / themed) render via
    // their library GLB scaled to the footprint; a plain box stands in while
    // the GLB loads (and as a fallback if it fails).
    if (isLib) {
      const libId = b.type.slice(4);
      (glbState[libId] || (glbState[libId] = { model: null, size: null, spots: [], fallbacks: [], applied: [], loading: false })).spots.push({ x: cx, z: cz, fp, h: spec.height || 2, glbType: libId });
      libIdsToLoad.add(libId);
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(fp[0], spec.height || 2, fp[1]),
        new THREE.MeshStandardMaterial({ color: 0x9aa4b2, roughness: 0.85 })
      );
      box.position.set(cx, (spec.height || 2) / 2, cz);
      scene.add(box);
      glbState[libId].fallbacks.push(box);
      if (labelRenderer) {
        const el = document.createElement('div');
        el.className = 'building-label';
        el.innerHTML = `<div class="bl-en">${spec.name}</div>`;
        const label = new CSS2DObject(el);
        label.position.set(cx, (spec.height || 2) + 1.5, cz);
        label.userData.mesh = box;
        scene.add(label);
        buildingLabels.push(label);
      }
      continue;
    }

    // Stadium — no good CC0 stadium GLB exists, so build a proper low-poly
    // arena instead of the generic lit-window facade cuboid: green pitch at
    // ground level, four tiered stands rising around it, corner floodlights.
    if (b.type === 'stadium') {
      const standMat = new THREE.MeshStandardMaterial({ color: 0x93a7b3, roughness: 0.75, metalness: 0.15 });
      const tierMat = new THREE.MeshStandardMaterial({ color: 0x6f8493, roughness: 0.7, metalness: 0.2 });
      const fieldMat = new THREE.MeshStandardMaterial({ color: 0x3f9b4f, roughness: 0.9 });
      const lightMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });

      const [w, d] = fp;
      const standH = h * 0.75;               // stands rise most of the way up
      const fw = w * 0.5, fd = d * 0.5;      // pitch size
      const add = (mesh) => { mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh); };

      // Green pitch on the ground.
      const field = new THREE.Mesh(new THREE.BoxGeometry(fw, 0.3, fd), fieldMat);
      field.position.set(cx, 0.15, cz);
      add(field);

      // Four tiered stands — three steps each, rising and stepping outward.
      const tierH = standH / 3;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const length = dx !== 0 ? w * 0.92 : d * 0.92;     // along the side
        const depth = (dx !== 0 ? w : d) * 0.25 / 3;       // per-tier depth
        for (let t = 0; t < 3; t++) {
          const off = (dx !== 0 ? w : d) * 0.25 + depth * (t + 0.5); // from centre
          const stand = new THREE.Mesh(
            new THREE.BoxGeometry(dx !== 0 ? length : depth, tierH, dz !== 0 ? length : depth),
            t === 2 ? tierMat : standMat
          );
          stand.position.set(cx + dx * off, tierH * (t + 0.5), cz + dz * off);
          add(stand);
        }
      }

      // Corner floodlight towers.
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const px = cx + sx * (w / 2 - 1.5);
        const pz = cz + sz * (d / 2 - 1.5);
        const pole = new THREE.Mesh(new THREE.BoxGeometry(0.6, h + 3, 0.6), tierMat);
        pole.position.set(px, (h + 3) / 2, pz);
        add(pole);
        const light = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.1, 0.5), lightMat);
        light.position.set(px, h + 4, pz);
        add(light);
      }

      // Name label.
      if (labelRenderer) {
        const el = document.createElement('div');
        el.className = 'building-label';
        el.innerHTML = `<div class="bl-en">${spec.name}</div>`;
        const label = new CSS2DObject(el);
        label.position.set(cx, h + 6, cz);
        scene.add(label);
        buildingLabels.push(label);
      }
      continue;
    }

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
        groundFacadeAO(new THREE.MeshStandardMaterial({
          color: facade, roughness: cfg.roughness, metalness: cfg.metalness,
          emissive: 0xffffff, emissiveMap: getWindowTexture(),
          // Windows re-bumped toward the 0.68 bloom threshold so mid/high-rise
          // still read as a lit skyline (bloom now reserved for genuine emitters).
          emissiveIntensity: Math.min(1.45, Math.max(0.25, cfg.intensity * 2.55)),
          bumpMap: getWindowBumpTexture(), bumpScale: 0.02,
        }))
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
      buildingLabels.push(label);
    }
  }

  // Load the shared-library GLBs used by this city (each loads once, shared).
  for (const id of libIdsToLoad) {
    const item = libraryItem(id);
    if (item) loadBuildingModel(id, item.glb);
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
  createGLTFLoader().loadAsync(cfg.file)
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

// Analytic ground-height lookup for the champion's feet (no raycast).
// Returns the TOP of the walkable surface at (x,z):
//   asphalt   +0.03   when inside a road's carriageway (|d| ≤ half width)
//   sidewalk  +0.02   when within the flat sidewalk ribbon beyond the road edge
//   bare      −0.10   everywhere else (the ground plane top)
// These must match the road FX + ground Y values that the meshes actually sit
// at (ROAD_FX.asphY / swY and the ground plane at −0.1), so the champion's feet
// land ON the surface the eye sees.
function groundHeightAt(x, z) {
  const BARE = -0.10;
  const SIDEWALK = ROAD_FX.swY;      // +0.02
  const ASPHALT = ROAD_FX.asphY;     // +0.03
  let bestDist = Infinity;
  let bestSide = 0;
  for (const r of layout.roads || []) {
    const pts = r.points || [];
    if (pts.length < 2) continue;
    const width = r.width || ROAD_WIDTH[r.class] || ROAD_WIDTH.residential;
    const half = width / 2;
    const side = half + ROAD_FX.swW;   // carriageway + sidewalk ribbon
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const l2 = dx * dx + dz * dz || 1;
      let t = ((x - a[0]) * dx + (z - a[1]) * dz) / l2;
      t = Math.max(0, Math.min(1, t));
      const px = a[0] + dx * t, pz = a[1] + dz * t;
      const d = Math.hypot(x - px, z - pz);
      if (d < bestDist) { bestDist = d; bestSide = side; }
      if (d <= half) return ASPHALT;   // inside the carriageway
    }
  }
  if (bestDist === Infinity) return BARE;           // no roads anywhere
  return bestDist <= bestSide ? SIDEWALK : BARE;    // on the pavement ribbon?
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
// Find a clear spawn point: at least SPAWN_CLEAR metres from the edge of every
// building (the champion's follow camera orbits ~26m out, so spawning next to
// or inside a building starts the camera inside its walls — looks bad), off
// every road carriageway (spawning in a lane puts the champion where cars
// drive), and outside every park (parks carry trees + a centre model — a spawn
// inside the grass would put the champion inside a fountain/trunk). Roads are
// stored as centreline polylines, so we clear the centreline by width/2 +
// SPAWN_ROAD_CLEAR.
const SPAWN_CLEAR = 30;
const SPAWN_ROAD_CLEAR = 5;
const SPAWN_PARK_CLEAR = 4;
function findSpawn() {
  const SCALE = (layout && layout.scaleMeters) || 2000;
  const cx = SCALE / 2, cz = SCALE / 2;
  const boxes = (layout.buildings || []).map((b) => {
    const fp = b.footprint || [20, 20];
    return {
      minX: b.pos[0] - fp[0] / 2 - SPAWN_CLEAR, maxX: b.pos[0] + fp[0] / 2 + SPAWN_CLEAR,
      minZ: b.pos[1] - fp[1] / 2 - SPAWN_CLEAR, maxZ: b.pos[1] + fp[1] / 2 + SPAWN_CLEAR,
    };
  });
  // Road clearance bands: distance from a point to a road segment must exceed
  // the road's half-width plus a small sidewalk margin.
  const roadBands = (layout.roads || []).flatMap((r) => {
    const w = (r.width || ROAD_WIDTH[r.class] || 9) / 2 + SPAWN_ROAD_CLEAR;
    const pts = r.points || [];
    const segs = [];
    for (let i = 0; i < pts.length - 1; i++) {
      segs.push({ x1: pts[i][0], z1: pts[i][1], x2: pts[i + 1][0], z2: pts[i + 1][1], w });
    }
    return segs;
  });
  const parkCircles = (layout.parks || []).map((p) => ({
    cx: p.cx, cz: p.cz,
    r: (Number(p.radius) || 0) + SPAWN_PARK_CLEAR,
  }));
  const distToSeg = (px, pz, x1, z1, x2, z2) => {
    const dx = x2 - x1, dz = z2 - z1, l2 = dx * dx + dz * dz;
    if (l2 === 0) return Math.hypot(px - x1, pz - z1);
    let t = Math.max(0, Math.min(1, ((px - x1) * dx + (pz - z1) * dz) / l2));
    return Math.hypot(px - (x1 + t * dx), pz - (z1 + t * dz));
  };
  const clearAt = (x, z) => {
    if (x < SPAWN_CLEAR || x > SCALE - SPAWN_CLEAR || z < SPAWN_CLEAR || z > SCALE - SPAWN_CLEAR) return false;
    for (const b of boxes) if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) return false;
    for (const s of roadBands) if (distToSeg(x, z, s.x1, s.z1, s.x2, s.z2) < s.w) return false;
    for (const p of parkCircles) if (Math.hypot(x - p.cx, z - p.cz) < p.r) return false;
    return true;
  };
  if (clearAt(cx, cz)) return { x: cx, z: cz };
  // Walk outward in ~12m rings until an open point is found (max ~360m out).
  for (let ring = 1; ring <= 30; ring++) {
    const r = ring * 12;
    for (let a = 0; a < 32; a++) {
      const ang = (a / 32) * Math.PI * 2;
      const x = Math.round(cx + Math.cos(ang) * r);
      const z = Math.round(cz + Math.sin(ang) * r);
      if (clearAt(x, z)) return { x, z };
    }
  }
  return { x: cx, z: cz };
}

async function spawnChampion() {
  const spawn = findSpawn();
  city.spawnWorld = new THREE.Vector3(spawn.x, 0, spawn.z);
  try {
    champion = await createChampion(ASSET_BASE, city, {
      // Start with the uploaded fitted champion (if any) instead of the bunny.
      initialSkin: _customSkinUrl,
      initialSkinId: '__custom__',
    });
  } catch (e) {
    // Champion GLB failed to load — the city still renders; run without one
    // rather than failing the whole boot.
    console.warn('[city-builder] champion load failed — running without champion', e);
    champion = null;
    return;
  }
  city.champion = champion;     // debug/consumption handle (minimap/buddy/tests)
  // Grow the champion with the densified buildings so proportions stay right.
  if (growScale && growScale !== 1) champion.group.scale.multiplyScalar(growScale);
  scene.add(champion.group);
  orbit.target.copy(city.spawnWorld);
  // Start the idle-camera timer from spawn so the camera doesn't snap on boot.
  orbit.lastOrbitTs = performance.now();

  // Soft blob shadow keeps the champion visually grounded on ALL tiers. The
  // realtime PCF map (high tier) is mushy at ~3 cm/texel on a 4 m character, so
  // the blob is the crisp contact cue everywhere; on high tier it is lighter so
  // it doesn't double-darken with the real shadow.
  {
    championShadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.5, 24),
      new THREE.MeshBasicMaterial({
        map: getContactShadowTexture(),
        transparent: true,
        opacity: LOW_END ? 0.45 : 0.35,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      })
    );
    championShadow.rotation.x = -Math.PI / 2;
    championShadow.position.y = 0.015;
    scene.add(championShadow);
  }

  // Goal ring — marks the current "next quest" building so there's always one
  // clear nonverbal objective in the world. Colour scaled above the 0.68 bloom
  // gate so the ring keeps its glow (it must read as a target, not a decal).
  goalRing = new THREE.Mesh(
    new THREE.RingGeometry(1.7, 2.1, 28),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0x00ff9d).multiplyScalar(1.9), transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
  );
  goalRing.rotation.x = -Math.PI / 2;
  goalRing.visible = false;
  scene.add(goalRing);
  sim = {
    walkSpeed: 5,   // m/s — the champion walks ~5 m/s (was 2: too slow to cross a 2000m city)
    nearQuest: null,
    // Does a building type have a playable game to enter? (Chat uses this to
    // decide whether to offer an Enter button.)
    questHasGame(type) { return questHasGameForType(type); },
    walkTo(building) {
      if (!champion || !building || (taxi && taxi.isActive())) return;
      // Get out of the car before auto-walking.
      if (drivingCar && drivingCar.isActive()) { drivingCar.exit(); updateDriveButtons(); }
      walkNav = { x: building.pos[0], z: building.pos[1] };
      showToast(`🚶 Walking to ${buildingName(building)}…`);
    },
    flyTo(building) {
      if (!champion || !building || !taxi) return;
      // Get out of the car before flying.
      if (drivingCar && drivingCar.isActive()) { drivingCar.exit(); updateDriveButtons(); }
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
  const spec = typeSpec(b.type);
  return spec ? spec.name : b.type;
}

/**
 * sampleCrowdSpots — open, camera-visible ground spots for the crowd: a small
 * diagonal cluster at the central spawn plaza, sidewalks along the primary
 * roads, and just inside each park's rim. Every spot is filtered to stay clear
 * of building footprints AND road carriageways, so a figure never clips a wall
 * or stands in the path of a car. The final list is deterministically shuffled
 * so round-robin placement spreads the crowd across the whole city instead of
 * dumping everyone at the plaza. Returns [{x, z}] in world metres (layout
 * coords — already densified).
 */
function sampleCrowdSpots(layout) {
  const spots = [];
  const clearOfBuilding = (x, z) => {
    for (const b of layout.buildings || []) {
      const fp = b.footprint || [20, 20];
      if (Math.abs(x - b.pos[0]) < fp[0] / 2 + 2.5 && Math.abs(z - b.pos[1]) < fp[1] / 2 + 2.5) return false;
    }
    return true;
  };
  const distToRoad = (x, z, road) => {
    const pts = road.points;
    let best = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, z1] = pts[i], [x2, z2] = pts[i + 1];
      const dx = x2 - x1, dz = z2 - z1, l2 = dx * dx + dz * dz;
      if (l2 === 0) continue;
      let t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / l2));
      best = Math.min(best, Math.hypot(x - (x1 + t * dx), z - (z1 + t * dz)));
    }
    return best;
  };
  const clearOfRoad = (x, z) => {
    for (const r of layout.roads || []) {
      if (distToRoad(x, z, r) < (r.width || 9) / 2 + 1.5) return false;
    }
    return true;
  };
  const push = (x, z) => { if (clearOfBuilding(x, z) && clearOfRoad(x, z)) spots.push({ x, z }); };

  // 1. A small diagonal ring around the central spawn plaza (the cross roads
  //    eat the N/E/S/W points, so only the 45° diagonals stay clear). Kept
  //    small so the plaza has a little life without hogging the whole crowd.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 4;
    push(1000 + Math.cos(a) * 32, 1000 + Math.sin(a) * 32);
  }

  // 2. Sidewalks along each primary road (both sides, every ~20 m).
  for (const road of layout.roads || []) {
    if (road.class !== 'primary' || !road.points || road.points.length < 2) continue;
    const pts = road.points;
    const half = (road.width || 14) / 2;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, z1] = pts[i], [x2, z2] = pts[i + 1];
      const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len, nz = dx / len;
      const n = Math.max(1, Math.floor(len / 20));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        for (const side of [1, -1]) {
          push(x1 + dx * t + nx * side * (half + 3), z1 + dz * t + nz * side * (half + 3));
        }
      }
    }
  }

  // 3. Just inside each park's rim.
  for (const p of layout.parks || []) {
    const ring = Math.max(6, Math.round(((p.radius * 2 * Math.PI) || 0) / 30));
    for (let i = 0; i < ring; i++) {
      const a = (i / ring) * Math.PI * 2 + 0.4;
      const rr = Math.max(3, (p.radius || 30) - 4);
      push(p.cx + Math.cos(a) * rr, p.cz + Math.sin(a) * rr);
    }
  }

  // Deterministic shuffle (mulberry32 seeded by a fixed constant) so round-robin
  // placement samples the whole city, not just whatever was pushed first.
  const seedShuffle = (arr) => {
    let s = 0x9e3779b9 >>> 0;
    const rnd = () => {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  return seedShuffle(spots);
}

function setupAirTraffic() {
  // Flying taxi: board → rise to cruise height (240 m, clearing the 220 m
  // skyline), then the pilot climbs/descends freely. Buddy "fly to X" auto-nav
  // cruises a little higher (260 m) so it clears every building en route.
  taxi = createFlyingTaxi(scene, { walkSpeed: 18, runSpeed: 70, autoNavFloor: 260, cruiseFloor: 240 });
  window.__taxi = taxi;   // debug hook (harmless) — verify taxi boarding/state

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
    const h = b.height || typeSpec(b.type)?.height || 30;
    return { x: b.pos[0], z: b.pos[1], y: h + 8, home: b.type === 'atc' };
  });
  drones = stops.length ? createDrones(scene, 'central', { stops, bounds, mobile: IS_MOBILE }) : null;

  // Road traffic — cars & buses cruising along the student's roads. Counts are
  // density-based (proportional to total road length) so every design looks
  // equally busy; tablets just get a lighter multiplier.
  try { traffic = createTraffic(scene, layout.roads, { density: IS_MOBILE ? 0.55 : 1 }); }
  catch (e) { console.warn('[city-builder] traffic init failed', e); traffic = null; }

  // Pedestrians — two instanced populations for the "living city" layer.
  // Robots + people spawn spread across the open spots and glide between them
  // at a walking pace (see pedestrians.js). Async + graceful: if a model fails
  // to load, that population just spawns fewer members; the city still runs.
  const crowdSpots = sampleCrowdSpots(layout);
  createPedestrians(scene, layout, { bounds, count: 90, spots: crowdSpots })
    .then((p) => {
      pedestrians = p;
      if (p) city.pedestrians = p;
    })
    .catch((e) => console.warn('[city-builder] pedestrians init failed', e));
  // Citizens are a separate population so robots and people coexist (and stay
  // cheap: each is its own set of InstancedMeshes). The module-level `citizens`
  // handle must be set too — the per-frame update loop drives it, so without
  // this the people spawn but never move.
  createPedestrians(scene, layout, { kind: 'human', bounds, count: 60, spots: crowdSpots })
    .then((p) => { if (p) { city.citizens = p; citizens = p; } })
    .catch((e) => console.warn('[city-builder] citizens init failed', e));

  // Clouds — merged instanced cloud puffs drifting slowly across the sky.
  // Async + graceful: if they fail to load, the city simply has clear skies.
  createClouds(scene, layout, { bounds })
    .then((c) => { clouds = c; if (c) city.clouds = c; })
    .catch((e) => console.warn('[city-builder] clouds init failed', e));

  // Expose for the minimap + buddy (read-only consumers)
  city.layout = layout;
  // Champion grounding: analytic surface-height lookup (bare/sidewalk/asphalt).
  city.groundHeightAt = groundHeightAt;
  city.drones = drones;
  buildColliders();

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
  // Driving a car and flying are mutually exclusive — exit the car first.
  if (drivingCar && drivingCar.isActive()) drivingCar.exit();
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

// ─── Drive a car ──────────────────────────────────────────────────────────
// The 🚗 Drive button opens a car chooser (default: BYD Sealion 7). Picking a
// car spawns it in front of the champion and boards them, mirroring the taxi
// but on the ground. The champion exits back to walking with the car parked.

/** Drivable cars shown in the 🚗 chooser (road vehicles from the shared library). */
function drivableCars() {
  return LIBRARY.filter((it) => it.category === 'vehicles' && isRoadVehicle(it));
}

let _driveOverlay = null;   // car chooser overlay element (created on demand)

function updateDriveButtons() {
  const driving = drivingCar && drivingCar.isActive();
  const btn = document.getElementById('btn-drive');
  if (!btn) return;
  const emoji = btn.childNodes[0];
  if (emoji) emoji.textContent = driving ? '🚙' : '🚗';
  const label = btn.querySelector('span');
  if (label) label.textContent = driving ? 'Exit' : 'Drive';
}

function toggleDrive() {
  if (!champion) return;
  if (drivingCar && drivingCar.isActive()) {
    // Driving → exit the current car (it stays parked where it stopped).
    drivingCar.exit();
    showToast('🚗 Parked! Walk back and press 🚗 to drive it again.');
    updateDriveButtons();
    return;
  }
  // Not driving → if a parked car is nearby, board it; otherwise open the chooser.
  const near = parkedCarNearChampion();
  if (near) {
    near.board(champion);
    showToast(`🚗 Driving the ${near.name || 'car'} again!`);
    updateDriveButtons();
    return;
  }
  openCarChooser();
}

/** Find a parked (exited) car within re-boarding range of the champion. */
function parkedCarNearChampion() {
  if (!champion || !driveCars || !driveCars.length) return null;
  const p = champion.state.pos;
  for (const car of driveCars) {
    if (!car.isActive() && car.isParked()) {
      const cp = car.getPos();
      const dx = cp.x - p.x, dz = cp.z - p.z;
      if (dx * dx + dz * dz < 8 * 8) return car;   // within 8 m
    }
  }
  return null;
}

/** Build + show the car chooser overlay (🚗 Drive → pick a car). */
function openCarChooser() {
  if (!champion || drivingCar && drivingCar.isActive()) return;
  closeDriveOverlay();
  const overlay = document.createElement('div');
  overlay.id = 'drive-overlay';
  overlay.className = 'drive-overlay';
  const panel = document.createElement('div');
  panel.className = 'drive-panel';
  overlay.appendChild(panel);

  const header = document.createElement('div');
  header.className = 'drive-header';
  const title = document.createElement('div');
  title.className = 'drive-title';
  title.textContent = '🚗 Choose your car';
  const sub = document.createElement('div');
  sub.className = 'drive-sub';
  sub.textContent = 'Pick a car to drive around your city!';
  header.appendChild(title);
  header.appendChild(sub);
  panel.appendChild(header);

  const grid = document.createElement('div');
  grid.className = 'drive-grid';
  for (const item of drivableCars()) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'drive-card';
    card.style.setProperty('--accent', '#00F2FE');
    card.innerHTML = `
      <div class="drive-emoji" aria-hidden="true">${item.emoji}</div>
      <div class="drive-name">${item.name}</div>
    `;
    card.addEventListener('click', () => {
      closeDriveOverlay();
      spawnDriveCar(item);
    });
    grid.appendChild(card);
  }
  panel.appendChild(grid);

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'drive-close';
  close.textContent = '✕';
  close.setAttribute('aria-label', 'Close');
  close.addEventListener('click', closeDriveOverlay);
  panel.appendChild(close);

  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeDriveOverlay(); });
  document.body.appendChild(overlay);
  _driveOverlay = overlay;

  const style = document.createElement('style');
  style.textContent = `
    .drive-overlay {
      position: fixed; inset: 0; z-index: 2147483300;
      display: flex; align-items: center; justify-content: center;
      background: rgba(4, 8, 22, 0.72);
      padding: 24px;
    }
    .drive-panel {
      position: relative;
      width: min(640px, 94vw); max-height: 84vh; overflow-y: auto;
      background: #0d1730;
      border: 1px solid rgba(0, 242, 254, 0.4);
      border-radius: 18px;
      padding: 22px 24px;
      box-shadow: 0 14px 40px rgba(0, 0, 0, 0.5);
    }
    .drive-header { text-align: center; margin-bottom: 18px; }
    .drive-title { font-family: var(--font-display, inherit); font-size: 22px; font-weight: 800; color: #f8fafc; }
    .drive-sub { margin-top: 6px; font-size: 13px; color: #8aa0c0; }
    .drive-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
    .drive-card {
      min-height: 96px; border-radius: 14px;
      border: 1px solid rgba(0, 255, 157, 0.3);
      background: #12203c; color: #f8fafc;
      cursor: pointer; text-align: center;
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
      transition: transform 0.15s ease, background 0.15s ease, border-color 0.15s ease;
    }
    .drive-card:hover, .drive-card:active { background: #19305a; transform: translateY(-1px); border-color: #00F2FE; }
    .drive-emoji { font-size: 34px; line-height: 1; }
    .drive-name { font-size: 14px; font-weight: 800; }
    .drive-close {
      position: absolute; top: 10px; right: 12px;
      border: none; background: transparent; color: #8aa0c0;
      font-size: 18px; cursor: pointer; min-width: 44px; min-height: 44px;
    }
    @media (prefers-reduced-motion: reduce) { .drive-card { transition: none; } }
  `;
  document.head.appendChild(style);
}

function closeDriveOverlay() {
  if (_driveOverlay) { _driveOverlay.remove(); _driveOverlay = null; }
}

/** Load a library vehicle GLB once, cache it, and return the normalized group. */
function loadDriveModel(item) {
  if (!driveGLBLoader) driveGLBLoader = createGLTFLoader();
  const cacheKey = item.id;
  if (_driveModelCache && _driveModelCache[cacheKey]) return Promise.resolve(_driveModelCache[cacheKey]);
  return new Promise((resolve) => {
    try {
      driveGLBLoader.load(libraryUrl(item), (gltf) => {
        const g = gltf.scene || (gltf.scenes && gltf.scenes[0]);
        if (!g) { console.warn('[drive] empty model', item.id); return resolve(null); }
        // Normalize: scale to footprint, sit base on y=0, centre on X/Z.
        //
        // IMPORTANT: the scale + centering + "lift to y=0" are baked into an
        // INNER container group, NOT onto `g` itself. drive.js board()/update()
        // overwrite the top-level group's position/rotation to drive on y=0, so
        // any correction stored on `g` gets wiped and cars whose model origin
        // sits above the wheels (e.g. byd-sealion7: origin at the roof) sink
        // into the ground. The inner group survives those writes.
        const box = new THREE.Box3().setFromObject(g);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        // Real-world default length (metres) by vehicle kind — matched to the
        // road traffic (cars ~5 m / buses ~9 m) and the ~4 m AI champion, not
        // the library's small source-unit footprint.
        const target = vehicleTargetLength(item);
        const s = target / maxDim;
        const cx = (box.min.x + box.max.x) / 2;
        const cz = (box.min.z + box.max.z) / 2;
        const lift = -box.min.y;
        const inner = new THREE.Group();
        inner.name = '__carBody__';
        while (g.children.length) inner.add(g.children[0]);
        inner.scale.setScalar(s);
        inner.position.set(-cx, lift, -cz);
        g.add(inner);
        g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        if (!_driveModelCache) _driveModelCache = {};
        _driveModelCache[cacheKey] = g;
        resolve(g);
      }, undefined, (err) => {
        console.warn('[drive] load failed', item.id, err);
        resolve(null);
      });
    } catch (e) { console.warn('[drive] load error', item.id, e); resolve(null); }
  });
}
let _driveModelCache = null;
let _driveReqSeq = 0;   // monotonically increasing pick token — stale picks lose

/** Spawn a car of the chosen type in front of the champion and board them. */
async function spawnDriveCar(item) {
  if (!champion || !scene) return;
  const req = ++_driveReqSeq;
  const model = await loadDriveModel(item);
  // A newer car pick superseded this one while its GLB was loading — drop it.
  if (req !== _driveReqSeq) return;
  if (!model) { showToast('⚠️ Could not load that car — try another!'); return; }

  // If we already had a car, remove it (fresh spawn each time).
  if (drivingCar && drivingCar.group && drivingCar.group.parent) {
    drivingCar.reset();
    drivingCar.group.parent.remove(drivingCar.group);
  }
  drivingCar = null;

  const carGroup = model.clone(true);
  scene.add(carGroup);
  // Collision radius from the model's REAL (post-normalize) footprint — the
  // car was scaled to its default length in loadDriveModel, so measure that,
  // not the library's small source-unit footprint.
  const _bb = new THREE.Box3().setFromObject(model);
  const _bsz = _bb.getSize(new THREE.Vector3());
  const bodyRadius = Math.max(_bsz.x, _bsz.z) / 2 * 0.9 + 0.3;
  const car = createDrivableCar(scene, carGroup, {
    walkSpeed: 15, runSpeed: 30,
    radius: bodyRadius,
  });
  car.name = item.name;
  drivingCar = car;
  // Keep at most ONE parked car around for re-boarding; a fresh spawn replaces
  // the previous car's group, so drop the stale controller from the list.
  driveCars.length = 0;
  driveCars.push(car);

  // Board: snap the car just in front of the champion.
  car.board(champion);
  showToast(`🚗 Driving the ${item.name}! Use 🚶/🏃 to go, 🚗 to exit.`);
  updateDriveButtons();
}

const _camPos = new THREE.Vector3();
function updateCamera(dt, taxiActive, driveActive) {
  // QA hook: visual-test scripts pin an exact viewpoint for screenshots.
  // `pos`/`target` may be THREE.Vector3 or [x,y,z] arrays.
  const over = window.__camOverride;
  if (over && over.pos) {
    if (over.pos.isVector3) camera.position.copy(over.pos);
    else camera.position.set(over.pos[0], over.pos[1], over.pos[2]);
    if (over.target) {
      if (over.target.isVector3) camera.lookAt(over.target);
      else camera.lookAt(over.target[0], over.target[1], over.target[2]);
    }
    return;
  }
  const driving = driveActive && drivingCar;
  const focus = driving
    ? drivingCar.getPos()
    : taxiActive ? taxi.getPos() : (champion ? champion.state.pos : orbit.target);
  // Ease the zoom toward the mode's distance: overview → walk → taxi → drive (closest).
  const wantDist = driving ? (orbit.distDrive || 13)
    : taxiActive ? orbit.distTaxi
    : (champion ? orbit.distWalk : 62);
  orbit.dist += (wantDist - orbit.dist) * Math.min(1, dt * 2.5);
  if (!champion || orbit.locked) {
    // gentle auto-orbit when no champion yet / locked view
    orbit.theta += dt * 0.05;
  } else if ((!taxiActive && !driving) && (performance.now() - orbit.lastOrbitTs) > 8000) {
    // Idle camera auto-reset: after a while without orbit input, ease the
    // camera back behind the champion's heading so walk-forward feels natural
    // (the "where did my camera go" problem for young kids).
    const targetTheta = champion.state.facing + Math.PI;
    let dTheta = targetTheta - orbit.theta;
    while (dTheta > Math.PI) dTheta -= Math.PI * 2;
    while (dTheta < -Math.PI) dTheta += Math.PI * 2;
    orbit.theta += dTheta * Math.min(1, dt * 1.2);
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

// ─── Camera-relative movement ─────────────────────────────────────────────
// Rotate raw direct input (iz = forward, ix = right) into world space relative
// to the camera. The camera always lookAt `focus`, so the ground-forward is
// focus − camera.position, projected onto XZ. Auto-navigation (walkNav/taxiNav)
// already supplies world-space vectors and must NOT pass through here.
function cameraRelativeMove(ix, iz, focus) {
  const fx = focus.x - camera.position.x;
  const fz = focus.z - camera.position.z;
  const len = Math.hypot(fx, fz) || 1;
  const Fx = fx / len, Fz = fz / len;
  const Rx = -Fz, Rz = Fx;                    // ground-right (Y-up, right-handed)
  return { x: Fx * iz + Rx * ix, z: Fz * iz + Rz * ix };
}

// ─── Champion building collision ──────────────────────────────────────────
// Building footprints become AABBs (built once from the layout). The champion
// is a circle that slides out along the axis of least penetration, so it never
// walks through buildings but still glides along their walls.
let buildingColliders = [];   // [{minX, maxX, minZ, maxZ}]

function buildColliders() {
  buildingColliders = [];
  if (!city.layout || !city.layout.buildings) return;
  for (const b of city.layout.buildings) {
    const spec = typeSpec(b.type);
    const fp = b.footprint || (spec && spec.footprint) || [20, 20];
    const cx = b.pos[0], cz = b.pos[1];
    const hw = (fp[0] || 20) / 2, hd = (fp[1] || 20) / 2;
    buildingColliders.push({ minX: cx - hw, maxX: cx + hw, minZ: cz - hd, maxZ: cz + hd });
  }
}

function resolveCollision(x, z, r) {
  for (const c of buildingColliders) {
    const minX = c.minX - r, maxX = c.maxX + r, minZ = c.minZ - r, maxZ = c.maxZ + r;
    if (x < minX || x > maxX || z < minZ || z > maxZ) continue;
    const dxL = x - minX, dxR = maxX - x, dzL = z - minZ, dzR = maxZ - z;
    const m = Math.min(dxL, dxR, dzL, dzR);
    if (m === dxL) x = minX;
    else if (m === dxR) x = maxX;
    else if (m === dzL) z = minZ;
    else z = maxZ;
  }
  return { x, z };
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
      orbit.lastOrbitTs = performance.now();
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

/** Register a placed library prop with the grab system so it can be selected,
 *  picked up and moved (🎯 button). Persists the new position on drop. */
function registerGrabbableProp(mesh, item) {
  if (!grab || !mesh) return;
  const fp = (item && item.footprint) || [1.5, 1.5];
  grab.register(mesh, {
    footprint: fp,
    types: ['nature', 'prop', 'vehicle', 'character', 'scenario', 'building'],
    movable: true,
    tabletop: false,
  });
  grab.attach(mesh);
  grab.addSurfaces(mesh);
  // Keep the per-instance uid (assigned by prop-library) for move persistence;
  // fall back to the library id so legacy records still match by id.
  mesh.userData.propId = item ? item.id : (mesh.userData.propId || null);
  mesh.userData.uid = mesh.userData.uid || (item ? item.id : (mesh.userData.uid || null));
}

function tapAt(clientX, clientY) {  const rect = renderer.domElement.getBoundingClientRect();
  const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
  // Grab takes priority: while carrying → place; in select mode → pick a model.
  if (grab) {
    if (grab.mode !== 'idle') { grab.placeAt(ndcX, ndcY); return; }
    if (selectMode) { grab.select(grab.pick(ndcX, ndcY)); return; }
  }
  // Normal building-entry raycast.
  pointer.x = ndcX; pointer.y = ndcY;
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
      refreshQuestStateCache();
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
  if (!champion) return;   // champion failed to load — skip buddy chat
  mountCityBuddy(city, champion, sim, layout);
}

function mountSkins() {
  if (!champion) return;   // champion failed to load — skip skin sidebar
  // Preload Hunyuan accessory GLBs so equipping doesn't silently no-op.
  preloadAccessories(ASSET_BASE);
  mountSkinSidebar(ASSET_BASE, champion, (skin) => showToast(`👑 ${skin.name} ${t('toast.skinEquipped')}`),
    _customSkinUrl ? { url: _customSkinUrl, name: 'My Champion' } : null);
}

// ─── Main loop ────────────────────────────────────────────────────────────
let lastT = performance.now();
function loop(now) {
  // A newer boot() superseded this loop — stop without re-registering so the
  // old RAF + renderer/composer don't keep running under the new scene.
  const gen = _bootGen;
  _rafId = requestAnimationFrame(loop);
  if (gen !== _bootGen) return;
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  const tNow = now / 1000;

  // Road traffic
  if (traffic) traffic.update(dt);
  // Pedestrians (floating NPCs)
  if (pedestrians) pedestrians.update(dt, tNow);
  if (citizens) citizens.update(dt, tNow);
  // Clouds (drifting sky)
  if (clouds) clouds.update(dt, tNow);

  // Air traffic
  if (decoTaxis) decoTaxis.update(dt, tNow);
  if (skySentinels) skySentinels.update(dt, tNow);
  if (drones) drones.update(dt, tNow);

  const taxiActive = taxi && taxi.isActive();
  const driveActive = drivingCar && drivingCar.isActive();
  if (driveActive) {
    // ── Driving a ground car ──────────────────────────────────────────────
    // Camera-relative steering (same as walking/taxi). No auto-nav for cars.
    const m = cameraRelativeMove(input.x, input.z, drivingCar.getPos());
    drivingCar.update(dt, { x: m.x, z: m.z, running: input.running || runToggled }, tNow);
    // Building collision — slide the car out of footprints so it never drives
    // through buildings (re-sync the group after pushing the car's pos).
    if (buildingColliders.length) {
      const c = resolveCollision(drivingCar.getPos().x, drivingCar.getPos().z, drivingCar.radius);
      drivingCar.getPos().x = c.x;
      drivingCar.getPos().z = c.z;
      drivingCar.group.position.set(c.x, 0, c.z);
    }
    sim.nearQuest = null;   // driving — no building is "near" for entering
  } else if (taxiActive) {
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
    } else {
      // Camera-relative manual steering (no buddy auto-fly override)
      const m = cameraRelativeMove(input.x, input.z, taxi.getPos());
      tx = m.x; tz = m.z;
    }
    taxi.update(dt, { x: tx, z: tz, running: true, ascend, descend }, tNow);
    sim.nearQuest = null;   // flying — no building is "near" for entering
  } else if (champion) {
    // Walk navigation (buddy "walk to X") steers toward the target.
    let mx = input.x, mz = input.z, mvRunning = input.running || runToggled, mvJump = input.jump;
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
    } else {
      // Camera-relative manual walking (no buddy walk-to override)
      const m = cameraRelativeMove(input.x, input.z, champion.state.pos);
      mx = m.x; mz = m.z;
    }    champion.update(dt, {
      x: mx, z: mz, running: mvRunning, jump: mvJump,
      speedScale: (sim.walkSpeed || 2) / WALK_SPEED,
    });
     // Building collision — slide out of footprints so the champion never walks
     // through buildings. Only x/z move here — the grounded Y set by
     // champion.update() must be preserved (surface-aware, sole on the ground).
     if (buildingColliders.length) {
       const r = 0.5 * (champion.group.scale.x || 1);
       const c = resolveCollision(champion.state.pos.x, champion.state.pos.z, r);
       champion.state.pos.x = c.x;
       champion.state.pos.z = c.z;
       champion.group.position.x = c.x;
       champion.group.position.z = c.z;
     }
      // Blob shadow follows the champion, on the surface under it (all tiers).
      if (championShadow) {
        championShadow.position.x = champion.state.pos.x;
        championShadow.position.z = champion.state.pos.z;
        championShadow.position.y = groundHeightAt(champion.state.pos.x, champion.state.pos.z) + 0.015;
      }
     input.jump = false;
     if (input.wave) { input.wave = false; champion.wave(); }
     if (input.dance) { input.dance = false; champion.dance(); }
     sim.nearQuest = nearestQuest();
   }

  updateQuestPrompt();
  updateCamera(dt, taxiActive, driveActive);
  if (grab) grab.update(dt, tNow);
  // Goal ring → the next uncompleted quest building (recomputed ~2.5×/s, and
  // only when not riding the taxi). Gives the child one clear nonverbal target.
  if ((now - _lastGoalTs) > 400) {
    _lastGoalTs = now;
    _goalTarget = findNextQuest();
  }
  if (goalRing) {
    if (_goalTarget && champion && !taxiActive && !driveActive) {
      goalRing.visible = true;
      goalRing.position.set(_goalTarget.pos[0], 2.2, _goalTarget.pos[1]);
      const gs = 1 + 0.15 * Math.sin(now * 0.006);
      goalRing.scale.setScalar(gs);
    } else {
      goalRing.visible = false;
    }
  }
  if (specialSystem) updateBeacons(now);
  // CSS2D labels + minimap + HUD are DOM/canvas writes — throttle to ~30 Hz
  // (every other frame) so they never contend with the GL render for the main
  // thread on a tablet.
  if ((now - _lastDomUpdate) > 33) {
    _lastDomUpdate = now;
    if (labelRenderer) {
      updateLabels(buildingLabels, camera);
      labelRenderer.render(scene, camera);
    }
    if (minimap) minimap.update();
    updateDebugHud();
  }

  // Adaptive quality governor — watch sustained FPS and step resolution down
  // (with hysteresis) so a struggling tablet degrades gracefully instead of
  // sputtering.
  govAcc += dt; govFrames++;
  if (govAcc >= 2) {
    govFps = govFrames / govAcc;
    govAcc = 0; govFrames = 0;
    adaptQuality(govFps);
  }

  // Road + facade LOD — uniforms driven from camera height once per frame
  // (cheap sets; keeps the marking fade window + asphalt normal detail + window
  // emissive altitude-correct).
  updateRoadLod(camera);

  if (composer) composer.render();
  else renderer.render(scene, camera);
}
let _lastDomUpdate = 0;

// Altitude-driven LOD for the shared road materials: tighten the marking fade
// window and drop asphalt normal strength as the taxi climbs, so sub-pixel
// markings dissolve before they alias and the normal map stops shimmering.
// Also fades GLB facade window emissive toward a dim average glow above ~250 m
// so lit cells stop speckling into coloured noise at taxi altitude (mip
// averaging can't fix that — a flat per-building glow can).
function updateRoadLod(cam) {
  const mats = _roadMats;
  const camY = cam ? cam.position.y : 0;
  if (mats.dash) {
    const ff = FADE_FAR_HIGH + (FADE_FAR - FADE_FAR_HIGH) * (1 - smooth01(camY, 120, 400));
    mats.dash.uniforms.uFadeFar.value = ff;
    mats.glow.uniforms.uFadeFar.value = ff;
    mats.jct.uniforms.uFadeFar.value = ff;
  }
  if (mats.asph && mats.asph.normalMap) {
    // Normal detail reads up close, shimmer-free from the taxi.
    const ns = 0.5 - 0.35 * smooth01(camY, 100, 320);
    mats.asph.normalScale.set(ns, ns);
  }
  // Ground seam guard: feed the camera XZ so the plane's albedo fades to the
  // fog colour around the viewpoint (uniform set is cheap).
  if (_groundMat && _groundMat.userData.__uCamPos) {
    _groundMat.userData.__uCamPos.value.set(cam.position.x, cam.position.y, cam.position.z);
  }
  // Bloom altitude backstop: from the taxi the residual glow of far emitters
  // can re-veil the city — scale strength down as the camera climbs.
  if (_bloomPass) {
    const base = IS_MOBILE ? 0.55 : 0.7;
    _bloomPass.strength = base * (1 - 0.55 * smooth01(camY, 120, 450));
  }
}
/** 0→1 smoothstep between two world heights. */
function smooth01(v, a, b) {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// ─── Debug HUD (people / vehicles / drones live counts) ────────────────────
// A small readout in the corner so we can see at a glance whether the living
// city systems are actually running. DEV-ONLY: hidden unless the URL carries
// ?debug=1 (a child's payoff screen must never show "drones: ?" telemetry).
// 'd' still toggles it while visible.
let _debugHud = null;
let _debugShow = new URLSearchParams(window.location.search).has('debug');
function updateDebugHud() {
  if (!_debugShow) return;
  if (!_debugHud) {
    _debugHud = document.createElement('div');
    _debugHud.style.cssText = 'position:fixed;right:10px;bottom:10px;z-index:9999;background:rgba(0,0,0,0.75);color:#7dffb0;font:12px ui-monospace,monospace;padding:6px 10px;border-radius:8px;pointer-events:none;white-space:pre;';
    document.body.appendChild(_debugHud);
  }
  const gd = (champion && champion.groundDebug) || null;
  _debugHud.textContent =
    `people: ${pedestrians ? pedestrians.getCount() : 'null'} + ${citizens ? citizens.getCount() : 'null'} citizens\n` +
    `cars/buses: ${traffic ? traffic.vehicles.length : 'null'}\n` +
    `drones: ${drones ? (drones.getCount ? drones.getCount() : '?') : 'null'}\n` +
    (gd
      ? `ground: surf ${gd.surface.toFixed(2)} sole ${gd.soleY.toFixed(2)} gap ${gd.gap.toFixed(3)} soleOff ${gd.soleOff.toFixed(3)}\n`
      : '') +
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

// Nearest quest building the child has NOT completed yet — the "next quest".
// Falls back to the nearest quest when everything is done.
function findNextQuest() {
  if (!champion || !specialSystem) return null;
  const p = champion.state.pos;
  const st = loadQuestState();
  let best = null, bestD = Infinity;
  for (const ref of specialSystem.questRefs) {
    const q = QUESTS.find((x) => x.id === ref.q.id);
    if (!q || st.completed.includes(q.id)) continue;
    const d = Math.hypot(ref.cx - p.x, ref.cz - p.z);
    if (d < bestD) { bestD = d; best = q; }
  }
  return best || nearestQuest();
}

// ─── Quest enter prompt ──────────────────────────────────────────────────
// When the champion stands near a mission building that has a playable
// mini-game, show a visible "🎮 Enter" button (the invisible tap-target alone
// wasn't discoverable for children). Locked / coming-soon buildings show the
// label without the button.
const _questPromptEl = document.getElementById('quest-prompt');
const _questPromptLabel = document.getElementById('quest-prompt-label');
const _questPromptBtn = document.getElementById('quest-prompt-btn');

function updateQuestPrompt() {
  if (!_questPromptEl) return;
  const quest = sim && sim.nearQuest;
  if (!quest) { _questPromptEl.classList.add('hidden'); return; }
  const st = questStatus(quest, questStateCached());
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
let _questStateCache = null;   // refreshed on quest completion (invalidation)
function refreshQuestStateCache() {
  _questStateCache = loadQuestState();
}
function questStateCached() {
  if (!_questStateCache) refreshQuestStateCache();
  return _questStateCache;
}
function updateBeacons(t) {
  if (!specialSystem.beacon) return;
  const state = questStateCached();
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
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k) || ['w', 'a', 's', 'd', 'r'].includes(k)) e.preventDefault();
    if (k === ' ') input.jump = true;
    if (k === 'r') runToggled = !runToggled;
  });
  window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

  // Walk / Run — hold to move the champion forward (camera-relative). There
  // are no arrow buttons: the champion walks the way the camera faces, and the
  // child steers by orbiting the camera (drag to look around).
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
  document.getElementById('btn-jump').addEventListener('pointerdown', (e) => { e.preventDefault(); input.jump = true; });
  document.getElementById('btn-wave').addEventListener('pointerdown', (e) => { e.preventDefault(); input.wave = true; });
  document.getElementById('btn-dance').addEventListener('pointerdown', (e) => { e.preventDefault(); input.dance = true; });
  document.getElementById('orbit-toggle').addEventListener('click', () => { orbit.locked = !orbit.locked; });

  // "Take me home" — walk (or fly) the champion back to spawn. Reuses the
  // buddy's walk-to/fly-to navigation so kids never get stranded across a
  // growing city.
  document.getElementById('btn-home').addEventListener('click', () => {
    if (!city.spawnWorld) return;
    // Get out of the car first, then head home.
    if (drivingCar && drivingCar.isActive()) { drivingCar.exit(); updateDriveButtons(); }
    if (taxi && taxi.isActive()) {
      taxiNav = { x: city.spawnWorld.x, z: city.spawnWorld.z, y: 24 };
      taxi.setAutoNav(true);
      updateFlyButtons();
    } else if (champion) {
      walkNav = { x: city.spawnWorld.x, z: city.spawnWorld.z };
    }    showToast('🏠 Heading home…');
  });

  // Small button back to the master site (hub / portal).
  document.getElementById('btn-hub').addEventListener('click', () => {
    window.location.href = 'https://p5-home.clover-marquis.workers.dev/';
  });

  // 🎯 button — select / pick-up / move placed library models (single-button
  // cycle: enter select mode → tap a model → 🎯 to pick up → tap to place).
  document.getElementById('btn-next').addEventListener('click', () => {
    if (!grab) return;
    if (grab.mode !== 'idle') {
      grab.grabOrPlace();           // carrying → drop/place
      return;
    }
    if (selectMode) {
      const sel = grab.getSelected();
      if (sel) grab.grabOrPlace();  // selected → pick up
      else showToast('👀 Tap a model to select it, then 🎯 to pick it up.');
      return;
    }
    selectMode = true;
    showToast('👉 Select mode: tap a model, then 🎯 to pick it up and move it.');
  });
  // Tap-away to clear selection.
  document.addEventListener('pointerdown', (e) => {
    if (selectMode && grab && !e.target.closest('#btn-next') && grab.getSelected() && grab.mode === 'idle') {
      grab.clearSelection();
    }
  });

  // Flying taxi controls
  const taxiBtn = document.getElementById('btn-taxi');
  const flyUp = document.getElementById('btn-flyup');
  const flyDown = document.getElementById('btn-flydown');
  taxiBtn?.addEventListener('pointerdown', (e) => { e.preventDefault(); toggleTaxi(); });

  // Drive controls — 🚗 opens the car chooser (default BYD Sealion 7); while
  // driving the same button exits back to walking.
  const driveBtn = document.getElementById('btn-drive');
  driveBtn?.addEventListener('pointerdown', (e) => { e.preventDefault(); toggleDrive(); });
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

// ── Champion File: save / cloud / restore (cross-device backup) ─────────────
const CLOUD_CODE_KEY = 'p5_cloud_code_v1';
const SAVE_NAME_KEY = 'p5_city_save_name_v1';

function downloadChampionFile(label) {
  const file = composeChampionFile(collectState(), label);
  const json = JSON.stringify(file, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = championFilename(label);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  rememberSavedAt();   // resume surface: "last saved …"
  showToast(`💾 Saved "${championFilename(label)}" — it's in your tablet's Files app › Downloads. Next lesson: start screen → 📁 Open my city file.`);
}

async function cloudSave(label) {
  const file = composeChampionFile(collectState(), label);
  let lastCode = null;
  try { lastCode = localStorage.getItem(CLOUD_CODE_KEY); } catch { /* ignore */ }
  const res = await fetch('/api/save', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ label: file.label, state: file.state, code: lastCode || undefined }),
  });
  if (!res.ok) throw new Error('save failed (' + res.status + ')');
  const data = await res.json();
  try { localStorage.setItem(CLOUD_CODE_KEY, data.code); } catch { /* ignore */ }
  rememberSavedAt();   // resume surface: "last saved …"
  return data.code;
}

async function cloudLoad(code) {
  const res = await fetch('/api/load?code=' + encodeURIComponent(code));
  if (!res.ok) throw new Error('load failed (' + res.status + ')');
  return await res.json();
}

/** Import a Champion File: write all state keys, then reload. Returns true if handled. */
function importChampionFile(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return false;
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return false; }
  const champ = sanitizeChampionFile(parsed);
  if (!champ.ok) return false;
  const n = writeState(champ.file.state);
  showToast(`📂 Restored your Champion File${champ.file.label ? ' — ' + champ.file.label : ''} (${n} saved items). Reloading…`);
  setTimeout(() => window.location.reload(), 600);
  return true;
}

function wireSaveUi() {
  const modal = document.getElementById('save-modal');
  const nameInput = document.getElementById('save-name');
  const cloudResult = document.getElementById('save-cloud-result');
  const downloadBtn = document.getElementById('save-download');
  const cloudBtn = document.getElementById('save-cloud');
  const cloudModal = document.getElementById('cloud-modal');
  const cloudCode = document.getElementById('cloud-code');
  const cloudLoad = document.getElementById('cloud-load');
  const cloudLoadResult = document.getElementById('cloud-load-result');
  const openers = ['entry-save', 'entry-cloud-save', 'btn-save-hud']
    .map((id) => document.getElementById(id)).filter(Boolean);

  if (!modal || !nameInput) return;
  const close = () => modal.classList.add('hidden');
  const open = () => {
    try { const last = localStorage.getItem(SAVE_NAME_KEY); if (last) nameInput.value = last; } catch { /* ignore */ }
    if (cloudResult) { cloudResult.hidden = true; cloudResult.textContent = ''; }
    modal.classList.remove('hidden');
    nameInput.focus();
    nameInput.select();
  };
  openers.forEach((el) => el.addEventListener('click', open));
  modal.querySelectorAll('[data-save-close]').forEach((el) => el.addEventListener('click', close));

  if (downloadBtn) downloadBtn.addEventListener('click', () => {
    const name = nameInput.value.trim() || 'my-ai-city';
    try { localStorage.setItem(SAVE_NAME_KEY, name); } catch { /* ignore */ }
    downloadChampionFile(name);
    close();
  });

  if (cloudBtn) cloudBtn.addEventListener('click', async () => {
    const name = nameInput.value.trim() || 'my-ai-city';
    try { localStorage.setItem(SAVE_NAME_KEY, name); } catch { /* ignore */ }
    cloudBtn.disabled = true;
    cloudBtn.textContent = '☁️ Saving…';
    try {
      const code = await cloudSave(name);
      if (cloudResult) {
        cloudResult.hidden = false;
        cloudResult.innerHTML = 'Saved! Your cloud code is <b>' + code + '</b> — write it down to open this city on any device.';
      }
    } catch (e) {
      console.error('[city-builder] cloud save failed', e);
      if (cloudResult) {
        cloudResult.hidden = false;
        // Kid-first copy: reassure first, then the concrete next step. The
        // HTTP detail stays in the console — never in a child's sentence.
        cloudResult.textContent = '⚠️ The cloud isn\u2019t reachable right now — your city is still safe on this tablet, nothing is lost. Tap 💾 Download to keep a backup file you can hold.';
      }
    } finally {
      cloudBtn.disabled = false;
      cloudBtn.textContent = '☁️ Save to cloud';
    }
  });

  // Open from cloud.
  if (cloudModal && cloudCode && cloudLoad) {
    const closeCloud = () => cloudModal.classList.add('hidden');
    cloudModal.querySelectorAll('[data-cloud-close]').forEach((el) => el.addEventListener('click', closeCloud));
    const openCloud = document.getElementById('entry-cloud-open');
    if (openCloud) openCloud.addEventListener('click', () => {
      try { const last = localStorage.getItem(CLOUD_CODE_KEY); if (last) cloudCode.value = last; } catch { /* ignore */ }
      cloudLoadResult.textContent = '';
      cloudModal.classList.remove('hidden');
      cloudCode.focus();
      cloudCode.select();
    });
    const doLoad = async () => {
      const code = cloudCode.value.trim();
      if (!code) { cloudLoadResult.textContent = 'Type your code first.'; return; }
      cloudLoad.disabled = true;
      cloudLoad.textContent = '☁️ Loading…';
      try {
        const data = await cloudLoad(code);
        const champ = sanitizeChampionFile(data);
        if (!champ.ok) { cloudLoadResult.textContent = '⚠️ ' + champ.error; return; }
        const n = writeState(champ.file.state);
        cloudLoadResult.textContent = '✅ Restored (' + n + ' saved items). Reloading…';
        try { localStorage.setItem(CLOUD_CODE_KEY, code); } catch { /* ignore */ }
        setTimeout(() => window.location.reload(), 700);
      } catch (e) {
        cloudLoadResult.textContent = '⚠️ Could not load (' + e.message + '). Check the code.';
      } finally {
        cloudLoad.disabled = false;
        cloudLoad.textContent = '☁️ Load my city';
      }
    };
    cloudLoad.addEventListener('click', doLoad);
    cloudCode.addEventListener('keydown', (e) => { if (e.key === 'Enter') doLoad(); });
  }
}

// ── Inspector badge: HUD corner emblem + Logbook shell (MVP: lowest tier) ────
function mountBadgeUi() {
  const emblem = document.getElementById('badge-emblem');
  if (!emblem) return;
  const modal = document.getElementById('logbook-modal');
  const body = document.getElementById('logbook-body');
  if (!modal || !body) return;

  const zh = (() => { try { return localStorage.getItem('hk_ai_city_lang_v1') === 'zh-Hant'; } catch { return false; } })();
  const state = readBadges();
  const tier = tierOf(state);

  // Emblem: small corner badge showing the current tier name (lowest for now).
  const tag = document.createElement('span');
  tag.className = 'badge-tag';
  tag.textContent = zh ? tier.nameZh : tier.name;
  emblem.appendChild(tag);
  emblem.setAttribute('aria-label', zh ? `檢查員徽章：${tier.nameZh}` : `Inspector badge: ${tier.name}`);

  const close = () => modal.classList.add('hidden');
  emblem.addEventListener('click', () => {
    const rows = TIERS.map((t) => {
      const current = t.id === state.tier;
      const reached = t.order <= tierOf(state).order;
      const medal = t.order === 1 ? '🏗️' : t.order === 2 ? '🔍' : t.order === 3 ? '🛡️' : '🏛️';
      return `<div class="logbook-tier ${current ? 'current' : ''} ${reached ? '' : 'locked'}">
        <div class="tier-medal" aria-hidden="true">${medal}</div>
        <div>
          <div class="tier-name">${zh ? t.nameZh : t.name}${current ? ' ✓' : ''}</div>
          <div class="tier-blurb">${zh ? t.blurbZh : t.blurb}</div>
        </div>
      </div>`;
    }).join('');
    body.innerHTML = rows
      + `<div class="logbook-note">${zh
        ? '你的徽章會在你證明你的機器後亮起 — 用留出的資料測試，並在「不確定」時說出來。'
        : 'Your badges will light up as you prove your machines — test on data they have never seen, and say "not sure" when you should.'}</div>`;
    modal.classList.remove('hidden');
  });
  modal.querySelectorAll('[data-logbook-close]').forEach((el) => el.addEventListener('click', close));
}

// ── Planted machines: Capability Panel (Stage 1 — display only, honest) ──────
const CAPS_KEY = 'p5_city_capabilities_v1';
const CAP_MAX_BYTES = 200 * 1024; // a numeric .cap is KBs; guard against bloat

function readPlantedCaps() {
  try { const a = JSON.parse(localStorage.getItem(CAPS_KEY) || '[]'); return Array.isArray(a) ? a : []; }
  catch { return []; }
}
function writePlantedCaps(list) {
  try { localStorage.setItem(CAPS_KEY, JSON.stringify(list.slice(0, 12))); } catch { /* ignore */ }
}
function renderCapPanel() {
  const body = document.getElementById('cap-body');
  if (!body) return;
  const zh = (() => { try { return localStorage.getItem('hk_ai_city_lang_v1') === 'zh-Hant'; } catch { return false; } })();
  const caps = readPlantedCaps();
  const cards = caps.map((cap) => {
    const d = capabilityDescriptor(cap);
    const s = d.scores;
    const scoreLine = `study ${s.study ?? '—'} · check ${s.check ?? '—'} · sealed ${s.sealed ?? '—'}`;
    return `<div class="cap-card">
      <div class="cap-name">${esc(d.name)}</div>
      <div class="cap-meta">${esc(d.algorithm)} · ${d.labels.length} labels · threshold ${d.threshold}</div>
      <div class="cap-scores">${scoreLine}</div>
      <div class="cap-note">${esc(stage1Note(zh))}</div>
      <button class="cap-try" data-try-cap="${esc(d.id)}">🧪 ${zh ? '試試它' : 'Try it'}</button>
    </div>`;
  }).join('');
  body.innerHTML = (caps.length ? '' : `<div class="cap-empty">${zh
    ? '還沒有種入的 AI 機器。AI 機器會「思考」——它是在 Workshop（另一個 App）裡造好、存成 .cap 小檔案，再種到這裡。'
    : 'No planted AI machines yet. An AI machine is a building that thinks — you build it in the Workshop (a separate app), save it as a small .cap file, then plant it here.'}</div>`)
    + cards
    + `<div class="cap-actions">
         <button id="cap-plant-btn">📦 ${zh ? '種入機器檔案 (.cap)' : 'Plant a machine file (.cap)'}</button>
       </div>
       <div id="cap-err" class="cap-error" aria-live="polite"></div>`;
  const plant = document.getElementById('cap-plant-btn');
  if (plant) plant.addEventListener('click', () => document.getElementById('cap-file').click());
}
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function mountCapabilityUi() {
  const btn = document.getElementById('cap-btn');
  const modal = document.getElementById('cap-modal');
  const fileInput = document.getElementById('cap-file');
  if (!btn || !modal || !fileInput) return;

  const zh = (() => { try { return localStorage.getItem('hk_ai_city_lang_v1') === 'zh-Hant'; } catch { return false; } })();
  const close = () => modal.classList.add('hidden');
  btn.addEventListener('click', () => { renderCapPanel(); modal.classList.remove('hidden'); });
  modal.querySelectorAll('[data-cap-close]').forEach((el) => el.addEventListener('click', close));

  // "Try my machine" — feed a planted capability a real input, see the honest answer.
  const tryModal = document.getElementById('cap-try-modal');
  const tryBody = document.getElementById('cap-try-body');
  const tryClose = () => tryModal && tryModal.classList.add('hidden');
  if (tryModal && tryBody) {
    tryModal.querySelectorAll('[data-captry-close]').forEach((el) => el.addEventListener('click', tryClose));
    // delegate "Try it" clicks from freshly-rendered cap cards.
    document.addEventListener('click', (e) => {
      const t = e.target.closest('[data-try-cap]');
      if (!t) return;
      const caps = readPlantedCaps();
      const cap = caps.find((c) => c.id === t.getAttribute('data-try-cap'));
      if (!cap) return;
      openTry(cap);
    });
  }

  function openTry(cap) {
    const fields = (cap.input && cap.input.fields) || [];
    const labels = (cap.output && cap.output.labels) || [];
    const norm = (cap.input && cap.input.normalization) || {};
    if (!tryModal || !tryBody) return;
    const mid = (i) => { const lo = norm.min && norm.min[i] != null ? norm.min[i] : 0; const hi = norm.max && norm.max[i] != null ? norm.max[i] : 1; return Math.round(((lo + hi) / 2) * 100) / 100; };
    const inputs = fields.map((f, i) => `
      <label class="try-field">${esc(f.name)}
        <input type="number" step="any" id="try-in-${i}" value="${mid(i)}" aria-label="${esc(f.name)}">
      </label>`).join('');
    tryBody.innerHTML = `
      <p class="save-intro">${zh ? '給機器一些真實輸入，看看它會怎麼想。' : 'Give the machine a real input and watch what it decides.'}</p>
      <div class="try-inputs">${inputs || (zh ? '（沒有輸入欄位）' : '(no input fields)')}</div>
      <div class="goals-actions"><button id="try-run" class="plan-apply">⚙️ ${zh ? '讓機器思考' : 'Run the machine'}</button></div>
      <div id="try-result" class="try-result" aria-live="polite"></div>
      <div class="cap-note">${zh ? '「不確定」也是正確答案 — 當信心不足時，機器不猜。' : 'Saying "not sure" is a correct answer — when confidence is too low, the machine does not guess.'}</div>`;
    const run = document.getElementById('try-run');
    if (run) run.addEventListener('click', () => {
      const event = {};
      fields.forEach((f, i) => {
        const el = document.getElementById('try-in-' + i);
        event[f.name] = el ? Number(el.value) : NaN;
      });
      const res = runInference(cap, event);
      const out = document.getElementById('try-result');
      if (!out) return;
      if (res.abstained) {
        out.innerHTML = `<div class="try-decision abstain">${zh ? '🤔 不確定' : '🤔 Not sure'}</div>
          <div class="try-detail">${zh ? '信心' : 'Confidence'} ${Math.round(res.confidence * 100)}%${res.abstainReason === 'missing-fields' ? ' — ' + (zh ? '輸入不完整' : 'incomplete input') : ' — ' + (zh ? '機器選擇不猜' : 'the machine chose not to guess')}</div>`;
      } else {
        out.innerHTML = `<div class="try-decision">${zh ? '它說' : 'It says'}: <b>${esc(res.decision)}</b></div>
          <div class="try-detail">${zh ? '信心' : 'Confidence'} ${Math.round(res.confidence * 100)}% · ${zh ? '門檻' : 'threshold'} ${Math.round((cap.model && cap.model.threshold || 0) * 100)}%</div>
          ${res.evidence && res.evidence.length ? '<div class="try-evidence">' + (zh ? '最近的例子' : 'Nearest examples') + ':</div>' + res.evidence.map((ev) => `<div class="try-evidence-row">• ${esc(ev.label)} — ${zh ? '距離' : 'distance'} ${ev.distance}</div>`).join('') : ''}`;
      }
    });
    tryModal.classList.remove('hidden');
  }

  const plant = (raw) => {
    if (!raw) return;
    if (new TextEncoder().encode(raw).length > CAP_MAX_BYTES) {
      const err = document.getElementById('cap-err');
      if (err) err.textContent = zh ? '⚠️ 這個檔案太大（.cap 應為小 JSON）。' : '⚠️ That bundle is too large (.cap should be a small JSON).';
      return;
    }
    const r = parseCapability(raw);
    const err = document.getElementById('cap-err');
    if (!r.ok) {
      if (err) err.textContent = '⚠️ ' + r.error;
      return;
    }
    const caps = readPlantedCaps();
    if (!caps.some((c) => c.id === r.capability.id)) {
      caps.push(r.capability);
      writePlantedCaps(caps);
    }
    if (err) err.textContent = '';
    renderCapPanel();
  };
  fileInput.addEventListener('change', () => {
    const f = fileInput.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => { plant(reader.result); fileInput.value = ''; };
    reader.readAsText(f);
  });
}

function startEntryFlow() {
  const overlay = document.getElementById('entry-overlay');
  const localBtn = document.getElementById('entry-local');
  const pasteBtn = document.getElementById('entry-paste');
  const fileInput = document.getElementById('file-input');
  const pasteWrap = document.getElementById('paste-wrap');
  const pasteBox = document.getElementById('paste-box');
  const pasteGo = document.getElementById('paste-go');

  let saved = null;
  try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) { /* ignore */ }
  if (!saved) {
    // Localized empty-sample label (was hardcoded EN — broke zh-Hant here).
    localBtn.textContent = t('entry.emptySample');
  } else {
    // Resume surface: a returning student sees "Continue my city" + when it was
    // last backed up, instead of a cold "start".
    localBtn.textContent = t('entry.continue');
    const savedAt = lastSavedAt();
    const resumeNote = document.getElementById('entry-resume');
    if (savedAt && resumeNote) {
      let dateStr = '';
      try {
        dateStr = new Date(savedAt).toLocaleDateString(localStorage.getItem('hk_ai_city_lang_v1') === 'zh-Hant' ? 'zh-HK' : 'en-GB', { day: 'numeric', month: 'short' });
      } catch { /* ignore */ }
      if (dateStr) {
        resumeNote.textContent = `↩ ${t('entry.resumeLabel')}: ${dateStr}`;
        resumeNote.hidden = false;
      }
    }
  }

  const begin = (raw) => {
    if (!loadLayout(raw)) return;
    if (!isWebGLAvailable()) {
      showBootError('This device can\u2019t run the 3D view (WebGL is off or blocked). Go back to the 2D planner — your city is saved!');
      return;
    }
    overlay.classList.add('hidden');
    boot();
  };

  // Auto-load from the planner handoff (?from=planner) — "build it, then walk
  // into it" with zero extra taps. Same-origin localStorage carries the layout.
  // Fully guarded: corrupt/absent JSON falls through to the normal entry overlay.
  const fromPlanner = new URLSearchParams(location.search).get('from') === 'planner';
  if (fromPlanner && saved) {
    try {
      begin(JSON.parse(saved));
      history.replaceState(null, '', '/city-builder/'); // tidy the URL
      return;
    } catch (e) {
      // corrupt save → fall through; the overlay shows "Start my saved city"
    }
  }

  localBtn.addEventListener('click', () => {
    if (saved) {
      try { begin(JSON.parse(saved)); }
      catch (e) {
        // Saved city JSON is corrupt — fall back to the sample, but say so so
        // the child isn't silently staring at a city they didn't build.
        showEntryError('Your saved city could not be read — showing the sample instead. You can rebuild it in the planner.');
        begin(sampleLayout());
      }
    }
    else begin(sampleLayout());
  });
  // The native <label for="file-input"> opens the picker on every browser,
  // including iPad/iOS where a programmatic input.click() fallback would cancel
  // the label's reliable activation and then get silently ignored. So there is
  // deliberately NO click handler here — the change event loads the file.
  fileInput.addEventListener('change', () => {
    const f = fileInput.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      // Champion File (restore EVERYTHING) or a legacy layout JSON.
      if (!importChampionFile(reader.result)) {
        try { begin(JSON.parse(reader.result)); } catch (e) { showEntryError('That file is not valid JSON.'); }
      }
    };
    reader.readAsText(f);
  });
  pasteBtn.addEventListener('click', () => { pasteWrap.style.display = pasteWrap.style.display === 'none' ? 'block' : 'none'; });
  pasteGo.addEventListener('click', () => {
    if (!importChampionFile(pasteBox.value)) {
      try { begin(JSON.parse(pasteBox.value)); } catch (e) { showEntryError('That JSON did not parse.'); }
    }
  });

  // ── Save / cloud (Champion File backup) ────────────────────────────────────
  wireSaveUi();

  // ── Optional: upload a "fitted champion" GLB from Fit Studio ──────────────
  // The file is stored in IndexedDB (never uploaded anywhere) and becomes the
  // champion's default skin for this and future sessions. Purely optional —
  // pressing Start without uploading uses the saved/preset champion.
  const skinInput = document.getElementById('skin-input');
  const skinStatus = document.getElementById('skin-status');
  if (skinInput && skinStatus) {
    // The native <label for="skin-input"> opens the picker (see #entry-file
    // note about iPad/iOS). No programmatic .click() fallback here.
    skinInput.addEventListener('change', async () => {
      const f = skinInput.files[0];
      skinInput.value = '';             // allow re-picking the same file later
      if (!f) return;
      const ok = await looksLikeGlb(f);
      if (!ok) {
        skinStatus.textContent = '⚠️ Please pick a .glb champion file (under 64 MB).';
        return;
      }
      try {
        await saveCustomSkin(f);
        if (_customSkinUrl) revokeObjectUrl(_customSkinUrl);
        _customSkinUrl = blobToObjectUrl(f);
        equipCustomDefault();           // make it the default next boot
        skinStatus.textContent = `✅ ${f.name} saved — press Start to wear it!`;
      } catch (e) {
        console.warn('[city-builder] custom skin save failed', e);
        skinStatus.textContent = '⚠️ Could not save that champion — try again.';
      }
    });
  }
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
  clearTimeout(_bootWatchdog);   // boot failed (or watchdog fired) — no more retries needed
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
    window.__bootError = e;   // diagnostics hook — check in the console/Playwright
    showBootError('Something went wrong building your city — tap to try again.');
  }
}

async function bootInner() {
  // Invalidate any previous boot's loop and tear down its scene/renderer.
  _bootGen += 1;
  if (_rafId) { cancelAnimationFrame(_rafId); _rafId = 0; }
  // Watchdog: if boot hangs (a loadAsync that never settles on a flaky network),
  // surface the retry screen instead of a frozen loading bar. Cleared on success
  // (end of bootInner) and on failure (showBootError).
  clearTimeout(_bootWatchdog);
  _bootWatchdog = setTimeout(() => {
    const loading = document.getElementById('loading');
    if (loading && !loading.classList.contains('done')) {
      showBootError('Building your city is taking too long — check your connection and tap to try again.');
    }
  }, BOOT_TIMEOUT_MS);

  // Resilience: one bad model or build step must never take down the whole
  // city. Every step is wrapped — failures log + continue (the city degrades
  // gracefully: missing trees/models rather than a blank boot error).
  const warn = (name, e) => console.warn(`[city-builder] ${name} failed (continuing):`, e);
  const safe = (name, fn) => { try { fn(); } catch (e) { warn(name, e); } };
  const safeAwait = async (name, p) => { try { return await p; } catch (e) { warn(name, e); return null; } };

  setupScene();
  labelRenderer = createLabelRenderer(stage);
  initI18n();
  applyStatic();
  mountLangToggle();

  const fill = document.getElementById('loading-fill');
  fill.style.width = '25%';
  await safeAwait('trees', loadTreeModels());
  await safeAwait('tree-packs', loadTreePacks());
  await safeAwait('park', loadParkModel());
  safe('road-textures', loadRoadTextures);   // async — roads upgrade from flat charcoal to textured asphalt
  safe('nature-filler', () => loadNatureFiller());   // async — bushes/flowers/rocks for parks
  fill.style.width = '60%';

  safe('tree-variants', buildTreeVariants);
  safe('parks', carveParks);
  safe('roads', carveRoads);
  safe('flush-trees', flushTrees);
  safe('flush-nature', flushNatureFiller);  // placements queued during carve; flush what's loaded
  safe('quest-landmarks', buildQuestLandmarks);
  safe('generic-facilities', buildGenericFacilities);
  safe('building-shadows', addBuildingContactShadows);
  fill.style.width = '80%';
  // Street furniture (streetlights along roads, benches around parks).
  streetProps = await safeAwait('street-props', createStreetProps(scene, layout));
  city.streetProps = streetProps;
  // Playground + street deco (async, non-blocking).
  safe('street-deco', () => scatterStreetDeco(scene, layout));
  // Sidewalk furniture from the shared library (hydrants/bins/mailboxes/
  // planters/parasols) — async, instanced, tiny; degrades per-model on failure.
  safe('street-furniture', () => {
    createStreetFurniture(scene, layout).catch((e) => console.warn('[city-builder] street furniture init failed', e));
  });
  // Async — replace procedural GLB-backed buildings (office towers, housing) when ready.
  safe('facility-glbs', () => { for (const [type, url] of Object.entries(GLB_BUILDING_TYPES)) loadBuildingModel(type, url); });
  // Mission buildings — real GLBs for every special type (finance tower, industrial missions…).
  safe('mission-glbs', () => { for (const [type, url] of Object.entries(SPECIAL_BUILDING_MODELS)) loadBuildingModel(type, url); });
  safe('housing-variants', loadHousingVariants);
  // Parked vehicles (ambulance/firetruck/police/bus) — async, decorative.
  safe('parked-vehicles', () => { for (const key of Object.keys(PARKED_VEHICLES)) loadParkedVehicleModel(key); });

  // Load the child's uploaded "fitted champion" GLB (Fit Studio) so it becomes
  // the default skin this session. Read from IndexedDB → object URL.
  const customBlob = await safeAwait('custom-skin', loadCustomSkinBlob());
  if (customBlob) {
    if (_customSkinUrl) revokeObjectUrl(_customSkinUrl);
    _customSkinUrl = blobToObjectUrl(customBlob);
  }

  await safeAwait('champion', spawnChampion());
  safe('renderer-interaction', wireRendererInteraction);

  // Selected-object resize slider (2026-08-29): library models can ship at the
  // wrong size, so let the student calibrate with a slider. Shown while a placed
  // object is selected (🎯 select mode → tap); hidden on deselect. Created once,
  // then just toggled. Scaling is relative to the size the object had when it
  // was selected (0.2×–5×).
  let _resizePanel = null;
  function mountResizeSlider() {
    if (_resizePanel) return _resizePanel;
    const panel = document.createElement('div');
    panel.className = 'resize-panel';
    panel.innerHTML = `
      <label for="resize-slider">Size</label>
      <input type="range" id="resize-slider" min="0.2" max="5" step="0.05" value="1" aria-label="Resize selected object">
      <span id="resize-value">100%</span>`;
    document.body.appendChild(panel);
    const slider = panel.querySelector('#resize-slider');
    const valueEl = panel.querySelector('#resize-value');
    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      valueEl.textContent = Math.round(v * 100) + '%';
      if (grab) grab.setSelectedScale(v);
    });
    const style = document.createElement('style');
    style.textContent = `
      .resize-panel{
        position:fixed; left:50%; bottom:96px; transform:translateX(-50%);
        display:flex; align-items:center; gap:10px; z-index:40;
        background:rgba(8,14,24,.9); border:1px solid rgba(255,255,255,.16);
        border-radius:10px; padding:8px 14px; font:12px/1 system-ui,sans-serif; color:#f8fafc;
        box-shadow:0 6px 24px rgba(0,0,0,.35); pointer-events:auto;
      }
      .resize-panel[hidden]{ display:none !important; }
      .resize-panel input[type=range]{ width:150px; accent-color:#00f2fe; }
      .resize-panel span{ min-width:42px; text-align:right; color:#9fd8ff; font-weight:600; }
    `;
    document.head.appendChild(style);
    panel.hidden = true;
    _resizePanel = {
      panel,
      setVisible(v) { panel.hidden = !v; },
      reset() { slider.value = 1; valueEl.textContent = '100%'; },
    };
    return _resizePanel;
  }

  // Grab / select / pick-up / move system for placed library models.
  safe('grab', () => {
    grab = createGrabSystem(scene, {
      getChampion: () => champion,
      getCamera: () => camera,
      getScene: () => scene,
      colliders: buildingColliders,
      onToast: showToast,
      onSelection: (sel) => {
        const rs = mountResizeSlider();
        rs.setVisible(!!sel);
        if (sel) rs.reset();
      },
      onDrop: (item) => {
        // Persist the moved prop's new position — match by unique instance uid
        // first, falling back to the library id for legacy records.
        const api = window.__propLibrary;
        const id = item && (item.userData.uid || item.userData.propId || item.userData.libraryId);
        if (api && id) api.moveProp(id, item.position.x, item.position.z, item.rotation.y);
      },
    });
    window.__grab = grab;
    window.__drive = { get active() { return drivingCar ? drivingCar.isActive() : false; }, car: drivingCar };
  });

  safe('chat', mountChat);
  safe('badges', mountBadgeUi);
  safe('capabilities', mountCapabilityUi);
  safe('skins', mountSkins);
  safe('input', wireInput);
  safe('quest-prompt', wireQuestPrompt);

  // In-scenario model library: 🧰 button → pick a prop → tap-to-place on the
  // ground. Placements persist per scenario in localStorage. A little dust puff
  // celebrates each placement. Models come from the shared library catalog.
  // Every placed prop is registered with the grab system so it can be selected,
  // picked up and moved around (🎯 button).
  safe('prop-library', () => {
    const placementDust = new ParticlePool(scene, 40);
    mountPropLibrary({
      scene, camera, renderer,
      storageKey: 'hk_ai_city_props_citybuilder_v1',
      onPlaced: (x, z) => placementDust.spawn({ x, y: 0, z }, 6, 0.8, 1.6),
      onPlacedMesh: (mesh, item) => registerGrabbableProp(mesh, item),
      onPlacementDone: (mesh) => { if (grab && mesh) grab.select(mesh); },
      onPlacementEnd: () => { if (grab) grab.clearSelection(); },
    });
  });

  document.getElementById('loading').classList.add('done');
  fill.style.width = '100%';
  clearTimeout(_bootWatchdog);   // boot completed — disarm the hang guard
  // Non-blocking warning: a city with no roads renders as a bare ground (no
  // streets, streetlights, cars or road trees). Let the child know WHY instead
  // of leaving them confused — pure toast, never blocks or traps.
  if (!(layout.roads || []).length) {
    setTimeout(() => {
      showToast('⚠️ This city has no roads — streets, lights and cars won\'t appear. Open the planner, draw roads (or use 🛤️ Roads), then Generate again.');
    }, 1200);
  }
  window.addEventListener('resize', () => city.resize());
  window.__scene = scene;   // debug hook (harmless)
  window.__layout = layout; // debug hook
  window.__city = city;     // debug hook (champion/taxi/pedestrians handles)
  requestAnimationFrame(loop);
}

// ─── Init ─────────────────────────────────────────────────────────────────
applyStatic();       // localize the entry overlay before it's shown
startEntryFlow();
window.addEventListener('resize', () => {
  if (renderer && camera) {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    applyResolution();
  }
});

// Update input each animation frame (cheap)
setInterval(readInput, 50);
