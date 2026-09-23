import { displayName } from '../city-common/display-names.js';
import { installModalOwnership, activeModal, ambientDelta, bindHold } from '../city-common/interface.js';
installModalOwnership();
window.addEventListener('i18n:change', () => {
  applyPlanChip();
  updateDriveButtons();
  document.querySelectorAll('[data-display-type]').forEach(el => { el.textContent = displayName(el.dataset.displayType,currentLang()); });
});
import { PURPOSES } from '../city-common/building-purposes.js';
import { mountMyWork } from './my-work.js';
import { mountFocusedCityUI } from './focused-ui.js';
import { METRIC_KEYS } from '../city-common/metrics.js';
import { allowedGameUrl } from '../city-common/game-url.js';
import { restoreActive, restoreChampion } from '../city-common/restore-session.js';
import { MAX_IMPORT_BYTES, withinImportLimit } from '../city-common/champion-file.js';
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
import { championMetadataFromGLTF, collectRigInfo, validateStudioChampion } from '../city-common/champion-contract.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { design as questDesign } from '../hong-kong-real/quest-buildings.js';
import { QUESTS, recordLegacyActivity } from '../hong-kong-real/quests.js';
import { createChampion, WALK_SPEED } from '../hong-kong-real/champion-real.js';
import { createDrones } from '../hong-kong-real/drones.js';
import { createDecoTaxis } from '../hong-kong-real/deco-taxis.js';
import { createSkySentinels } from '../hong-kong-real/sky-sentinels.js';
import { createFlyingTaxi } from '../champion-city/taxi.js';
import { createTraffic } from './traffic.js';
import { createPedestrians } from './pedestrians.js';
import {createParkLandscape} from './park-landscape.js';
import {batchBuildings,prepareBuildingMaterials} from './building-batches.js';
import { createTimeOfDay } from './time-of-day.js';
import { CITY_LOOK_KEY, CITY_LOOKS, readCityLook, validCityLook, legacyTimeForLook } from './city-looks.js';
import { GROUND_TEXTURES, readGroundTexture, validGroundTexture } from './ground-textures.js';
import { DAY_SKY_KEY, DAY_SKIES, readDaySky, validDaySky } from './day-skies.js';
import { mountAppearancePanel } from './appearance-panel.js';
import { applyExampleAppearance } from './example-appearance.js';
import { CITY_PALETTE as DUSK } from './city-palette.js';
import { createNeighbourhood, createStreetLife } from '../city-common/neighbourhood.js';
import { buildTrafficNetwork, isRoadsideSceneryClear } from '../city-common/traffic-network.js';
import { boxBody, resolveBoxCollisions } from '../city-common/collision.js';
import { advanceGroundRoute, planGroundRoute } from '../city-common/navigation.js';
import { junctionMouthMaskHalf, junctionPadOutline, ribbonNormals, resolveRoadSafePlacement } from '../city-common/road-geometry.js';
import { PARK_VEGETATION_ASSETS, createParkVegetation } from '../city-common/park-vegetation.js';
import { createPublicSpaces } from './public-spaces.js';
import { createClouds } from './clouds.js';
import { createStreetProps } from './street-props.js';
import { scatterStreetDeco } from './street-deco.js';
import { createStreetFurniture } from './street-furniture.js';
import { createMinimap } from './minimap.js';
import { mountCityBuddy } from './buddy.js';
import { mountCityAiNodes } from './ai-nodes.js';
import { createLabelRenderer, updateLabels } from '../champion-city/labels.js';
import { mountSkinSidebar, equipCustomDefault, skinLabel } from '../champion-city/skins.js';
import { preloadAccessories } from '../champion-city/accessories.js';
import { saveCustomSkin, loadCustomSkinBlob, loadCustomSkinMetadata, loadCustomSkinRevisions, blobToObjectUrl, revokeObjectUrl, looksLikeGlb } from '../champion-city/custom-skin.js';
import { playTap, armAudioGestureUnlock } from '../champion-city/sound.js';
import { attachContextLossGuard } from '../champion-city/context-guard.js';
import { ParticlePool } from '../champion-city/particles.js';
import { catalogType, isSpecial } from '../city-common/catalog.js';
import { sanitizeLayout, validateLayout, ROAD_WIDTH, densifyLayout, occupiedBounds, typeSpec } from '../city-common/layout.js';
import { gatewayPositions } from '../city-common/gateway-placement.js';
import { LIBRARY, libraryUrl, libraryItem } from '../city-common/library.js';
import { HUNYUAN_IDS, EMERALD_RAIN_TREE_CANOPY_METRES, coordinateKey, selectHunyuanBuildingVariants, emeraldRainTreePlacement } from '../city-common/hunyuan-wave.js';
import { CITY_CHAMPION_HEIGHT, uniformScaleForBounds, scaledBounds } from '../city-common/model-scale.js';
import { buildSampleCity } from '../city-common/sample-city.js';
import { readExampleDraft, writeExampleDraft } from '../city-common/example-draft.js';
import { isRoadVehicle, vehicleTargetLength, vehicleTargetWidth } from '../city-common/vehicle-scale.js';
import { collectState, composeChampionFile, championFilename, sanitizeChampionFile, rememberSavedAt, lastSavedAt, CF_KEYS } from '../city-common/champion-file.js';
import { readBadges, tierOf, TIERS } from '../city-common/badges.js';
import { readMilestones, milestoneSectionHTML } from '../city-common/milestones.js';
import { parseCapability, capabilityDescriptor, installCapability, stage1Note } from '../city-common/cap-runtime.js';
import { mountPropLibrary } from './prop-library.js';
import { customModelStore, readCustomManifest, resolveCustomOverride } from '../city-common/custom-models.js';
import { createGrabSystem } from '../shared/grab.js';
import { createDrivableCar } from './drive.js';
import { currentLang, initI18n, applyStatic, mountLangToggle, t, tf } from './i18n.js';
import { WORKSHOP_URL } from '../shared/links.js';
import { createBootOwner, createLoadQueue, withDeadline } from './loading-lifecycle.js';
import { createLearningVisuals } from './learning-visuals.js';
import { environmentQuality, loadEnvironmentHDRI } from './environment-assets.js';

const ASSET_BASE = '../champion-city/assets/';
const STORAGE_KEY = 'p5_city_planner_layout_v1';

// Object URL for the child's uploaded "fitted champion" GLB (Fit Studio), if
// any. Created at boot from IndexedDB and handed to spawnChampion + skins.
let _customSkinUrl = null;
let _customSkinMetadata = null;

/** Save a fitted Champion GLB locally and make its object URL available to the
 * current city session. The entry screen and in-city wardrobe deliberately
 * share this path so their validation and privacy behaviour cannot drift. */
async function importCustomChampion(file) {
  if (!await looksLikeGlb(file)) return { ok: false, message: t('ui.skinFile') };
  try {
    const bytes = await file.arrayBuffer();
    const gltf = await new Promise((resolve, reject) => {
      try { createGLTFLoader().parse(bytes, '', resolve, reject); } catch (error) { reject(error); }
    });
    if (!gltf.scene) throw new Error('This Champion has no model.');
    const metadata = championMetadataFromGLTF(gltf);
    if (metadata) {
      const rig = collectRigInfo(gltf.scene);
      const check = validateStudioChampion({ metadata, animations: gltf.animations, boneNames: rig.boneNames, nodeNames: rig.nodeNames, rootName: gltf.scene.name });
      if (!check.ok) return { ok: false, message: check.error };
    }
    const nextUrl = blobToObjectUrl(file);
    if (!nextUrl) throw new Error('Could not create Champion URL');
    try { await saveCustomSkin(file); }
    catch (error) { revokeObjectUrl(nextUrl); throw error; }
    if (_customSkinUrl) revokeObjectUrl(_customSkinUrl);
    _customSkinUrl = nextUrl;
    equipCustomDefault();
    return { ok: true, skin: { url: _customSkinUrl, name: file.name } };
  } catch (e) {
    console.warn('[city-builder] custom skin save failed', e);
    return { ok: false, message: t('ui.skinFail') };
  }
}

// Legacy optional game links remain independent of building purposes.
function questHasGameForType(type) { return Object.hasOwn(PURPOSES, type); }
let myWork = null;
let focusedUI = null;
let learningVisuals = null;
let skinSidebar = null;
function openPurpose(type) { myWork?.open(type); }

// Destinations come from the static registry, including approved legacy games.
function isAllowedMinigameUrl(rawUrl) {
  return allowedGameUrl(rawUrl, window.location.href, [...QUESTS.map(q => q.gameUrl), WORKSHOP_URL]);
}

const IS_MOBILE = ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || window.innerWidth <= 768;
const IS_WEBKIT = /AppleWebKit/i.test(navigator.userAgent) && !/(Chrome|Chromium|CriOS|Edg|OPR|FxiOS)/i.test(navigator.userAgent);

// Low-end devices (school tablets with limited RAM/cores) drop the expensive
// post passes so the city stays smooth instead of sputtering.
const LOW_END = IS_MOBILE && (
  (navigator.deviceMemory && navigator.deviceMemory <= 4) ||
  (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4)
);
const ENV_QUALITY = environmentQuality({ mobile: IS_MOBILE, lowEnd: LOW_END });

// ─── Dynamic resolution governor ──────────────────────────────────────────
// Cap the absolute backing-store size (bigger than devicePixelRatio alone, a
// 2048×1536@1.25 framebuffer is huge on tablets) and adaptively step resolution
// down if sustained FPS drops, back up with hysteresis when it recovers.
const MAX_PIXELS = IS_WEBKIT ? (IS_MOBILE ? 1.5e6 : 3.2e6) : (LOW_END ? 1.6e6 : (IS_MOBILE ? 2.6e6 : 5e6));
let resScale = 1;                    // 0.5..1 adaptive multiplier
let govAcc = 0, govFrames = 0, govFps = 60;

function applyResolution() {
  if (!renderer) return;
  const w = window.innerWidth, h = window.innerHeight;
  const basePr = Math.min(window.devicePixelRatio, IS_WEBKIT ? (IS_MOBILE ? 1 : 1.5) : (LOW_END ? 1 : (IS_MOBILE ? 1.25 : 2)));
  const scale = Math.min(1, Math.sqrt(MAX_PIXELS / Math.max(1, w * h * basePr * basePr)));
  const pr = Math.max(0.5, basePr * resScale * scale);
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h);
  if (composer) composer.setSize(w, h);
}

function adaptQuality(fps) {
  if (fps < 26 && citizens?.reduceAnimationBudget?.()) return;
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
      ctx.fillStyle = lit ? DUSK.window : '#253238';
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
const _grassMats = new Set();
let _cityLook = readCityLook();
let _groundTexture = readGroundTexture();
let _daySky = readDaySky();
let _appearancePanel = null;
let _citySkyTexture = null;
let _citySkyFile = null;
const _environmentTextures = new Map();
// The selected ground map remains the student's choice. Leafy Grass gets a
// deliberately quiet moonlit grade: its real PBR albedo, normal and roughness
// maps still do the work, but the very vivid source scan is softened toward
// olive/brown and broken up by a little world-space terrain colour.
const GRASS_PBR_TREATMENTS = Object.freeze({
  leafy: { saturation: 0.74, albedoMix: 0.90, tint: '#d2c89a', tintStrength: 0.12, terrainNormal: 0.16, parkNormal: 0.12, parkLift: 0.07 },
  sparse: { saturation: 0.90, albedoMix: 0.96, tint: '#ffffff', tintStrength: 0.00, terrainNormal: 0.18, parkNormal: 0.14, parkLift: 0.05 },
  withered: { saturation: 0.86, albedoMix: 0.96, tint: '#e0d0a6', tintStrength: 0.05, terrainNormal: 0.16, parkNormal: 0.13, parkLift: 0.05 },
  // Hardscape choices retain their photographed PBR albedo without the grass
  // grade; normals stay deliberately quiet for a clean aerial city view.
  pavers: { saturation: 1, albedoMix: 1, tint: '#ffffff', tintStrength: 0, terrainNormal: 0.10, parkNormal: 0.12, parkLift: 0 },
  asphalt: { saturation: 1, albedoMix: 1, tint: '#ffffff', tintStrength: 0, terrainNormal: 0.10, parkNormal: 0.12, parkLift: 0 },
});
// Parks always use Leafy Grass detail, but the photographed beige soil must
// not overpower their civic-lawn identity (especially beside asphalt).
const PARK_LAWN_PBR_TREATMENT = Object.freeze({
  saturation: 0.98, albedoMix: 0.18, tint: '#ffffff', tintStrength: 0,
  terrainNormal: 0.16, parkNormal: 0.12, parkLift: 0.04,
});
const PROCEDURAL_GROUND_PALETTES = Object.freeze({
  leafy: ['#33502a','#4c7c3f','#6a8f4e','#9a9450'],
  sparse: ['#56613a','#7a7e4b','#9a9450','#b29a63'],
  withered: ['#645c36','#8a7544','#ae9258','#c1a16a'],
  pavers: ['#50565a','#70757a','#8b8e90','#9fa096'],
  asphalt: ['#303a42','#47545d','#5d6870','#747a7b'],
});

function applyProceduralGroundPalette(id) {
  const colors = PROCEDURAL_GROUND_PALETTES[validGroundTexture(id)] || PROCEDURAL_GROUND_PALETTES.leafy;
  for (const mat of _grassMats) {
    if (mat.userData.grassSurface === 'park') continue;
    mat.userData.proceduralPalette = colors;
    const palette = mat.userData.__uGrassPalette;
    if (palette) {
      palette.moss.value.set(colors[0]); palette.leaf.value.set(colors[1]);
      palette.sun.value.set(colors[2]); palette.dry.value.set(colors[3]);
    }
  }
}

// Old builds stored sky/time labels in the City Look key. Preserve the child's
// intent on first launch of the new appearance system, then normalise it.
function migrateLegacyAppearance() {
  try {
    const raw = localStorage.getItem(CITY_LOOK_KEY);
    const oldLooks = new Set(['dawn', 'blue', 'azure', 'bluebird', 'clouds', 'overcast', 'golden', 'moonlit']);
    if (!oldLooks.has(raw)) return;
    if (!localStorage.getItem('p5_city_time_v1')) localStorage.setItem('p5_city_time_v1', legacyTimeForLook(raw));
    localStorage.setItem(CITY_LOOK_KEY, 'natural');
    _cityLook = 'natural';
  } catch { /* storage is optional */ }
}

function loadEnvironmentTexture(file, { color = false, repeat = 1 } = {}) {
  const key = `${file}|${color}|${repeat}`;
  if (_environmentTextures.has(key)) return _environmentTextures.get(key);
  const pending = new Promise((resolve, reject) => new THREE.TextureLoader().load(file, texture => {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat, repeat);
    texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.anisotropy = Math.min(renderer?.capabilities?.getMaxAnisotropy?.() || 1, IS_MOBILE ? 4 : 8);
    resolve(texture);
  }, undefined, reject));
  _environmentTextures.set(key, pending);
  return pending;
}

function releaseCitySky(nextFile = null) {
  if (_citySkyFile && _citySkyFile !== nextFile) _environmentTextures.delete(`${_citySkyFile}|true|1`);
  if (_citySkyTexture && _citySkyFile !== nextFile) _citySkyTexture.dispose();
  if (_citySkyFile !== nextFile) { _citySkyTexture = null; _citySkyFile = null; }
}

function applyCityLook(id) {
  _cityLook = validCityLook(id);
  const look = CITY_LOOKS[_cityLook];
  const time = timeOfDay?.id || 'day';
  const selectedDaySky = _cityLook === 'natural' && time === 'day' ? DAY_SKIES[_daySky] : null;
  const presentationLook = selectedDaySky ? { ...look, ...selectedDaySky } : look;
  if (_styleGradePass) {
    _styleGradePass.uniforms.tint.value.set(look.grade || '#ffffff');
    _styleGradePass.uniforms.contrast.value = look.contrast ?? 1;
  }
  try { localStorage.setItem(CITY_LOOK_KEY, _cityLook); } catch { /* storage is optional */ }
  if (timeOfDay?.setLook) timeOfDay.setLook(presentationLook);
  if (!look.realistic) {
    releaseCitySky();
    duskSky.visible = true;
    scene.background = new THREE.Color(look.horizon);
    duskSky.material.uniforms.equirectMap.value = null; duskSky.material.uniforms.useEquirect.value = 0;
    _roadMats.sw.map = _roadMats.sw.normalMap = _roadMats.sw.roughnessMap = null; _roadMats.sw.needsUpdate = true;
    return;
  }
  applyGroundTexture(_groundTexture);
  // A 2K panorama is a poor trade on the constrained tablet profile: the
  // procedural sky still carries the selected time and style without spending
  // a large, permanently resident GPU texture.
  if (LOW_END) {
    releaseCitySky();
    duskSky.material.uniforms.equirectMap.value = null;
    duskSky.material.uniforms.useEquirect.value = 0;
    return;
  }
  // Sample the equirectangular JPG on the sky dome itself. Do not assign this
  // to scene.background: Three converts equirect backgrounds into a small cube
  // texture, throwing away the panorama's horizontal detail.
  const skyFile = selectedDaySky
    ? ((!IS_MOBILE && !LOW_END) ? selectedDaySky.desktopSkyFile : selectedDaySky.skyFile)
    : ((!IS_MOBILE && !LOW_END) ? look.desktopSkies?.[time] : look.skies?.[time]);
  if (!skyFile) return;
  const requestedDaySky = _daySky;
  loadEnvironmentTexture(skyFile, { color: true }).then(texture => {
    if (_cityLook !== id || (timeOfDay?.id || 'day') !== time || (time === 'day' && requestedDaySky !== _daySky)) { texture.dispose(); _environmentTextures.delete(`${skyFile}|true|1`); return; }
    // Longitude wraps; latitude must not. Repeating vertically makes the exact
    // zenith interpolate across the image seam and leak the ground band into
    // the top of the sky even when the equirectangular UV itself is correct.
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;
    releaseCitySky(skyFile); _citySkyTexture = texture; _citySkyFile = skyFile; scene.background = new THREE.Color(presentationLook.horizon); duskSky.material.uniforms.equirectMap.value = texture;
    duskSky.material.uniforms.equirectSaturation.value = presentationLook.equirectSaturation ?? 1;
    duskSky.material.uniforms.equirectContrast.value = presentationLook.equirectContrast ?? 1;
    duskSky.material.uniforms.equirectTint.value.set(presentationLook.equirectTint ?? '#ffffff');
    duskSky.material.uniforms.useEquirect.value = 1; duskSky.visible = true;
  }).catch(error => console.warn('[city-look] sky unavailable; using procedural sky', error));
  // Sidewalk maps belong to a realistic City Look. Ground maps are a separate
  // student choice and are deliberately never overwritten here.
  Promise.all([
    loadEnvironmentTexture('assets/textures/concrete_pavers_03_diff_1k.jpg', { color: true, repeat: 24 }),
    loadEnvironmentTexture('assets/textures/concrete_pavers_03_nor_gl_1k.jpg', { repeat: 24 }),
    loadEnvironmentTexture('assets/textures/concrete_pavers_03_rough_1k.jpg', { repeat: 24 }),
  ]).then(([pavers, paversNormal, paversRough]) => {
    if (_cityLook !== id) return;
    _roadMats.sw.map = pavers; _roadMats.sw.normalMap = paversNormal; _roadMats.sw.normalScale.setScalar(0.12); _roadMats.sw.roughnessMap = paversRough; _roadMats.sw.needsUpdate = true;
  }).catch(error => console.warn('[city-look] environment textures unavailable; using procedural surfaces', error));
}

function applyDaySky(id) {
  _daySky = validDaySky(id);
  try { localStorage.setItem(DAY_SKY_KEY, _daySky); } catch { /* storage is optional */ }
  applyCityLook(_cityLook);
}

function applyGroundTexture(id) {
  _groundTexture = validGroundTexture(id);
  const selectedTexture = _groundTexture;
  const terrainChoice = GROUND_TEXTURES[_groundTexture];
  const terrainTreatment = GRASS_PBR_TREATMENTS[_groundTexture];
  // Parks remain welcoming green lawns, even when a student chooses paving or
  // asphalt for the surrounding open city terrain.
  const parkChoice = GROUND_TEXTURES.leafy;
  const parkTreatment = PARK_LAWN_PBR_TREATMENT;
  try { localStorage.setItem('p5_city_ground_texture_v1', _groundTexture); } catch {}
  // Toy Town is intentionally map-free for both open terrain and park lawns.
  if (!CITY_LOOKS[_cityLook]?.realistic) {
    for (const mat of _grassMats) { mat.map = mat.normalMap = mat.roughnessMap = null; mat.userData.grassTextureDetail = 0; mat.userData.__uGrassTextureDetail && (mat.userData.__uGrassTextureDetail.value = 0); mat.needsUpdate = true; }
    applyProceduralGroundPalette(_groundTexture);
    return;
  }
  const root = 'assets/textures/';
  Promise.all([
    loadEnvironmentTexture(root + terrainChoice.files[0], { color: true, repeat: 180 }),
    loadEnvironmentTexture(root + terrainChoice.files[1], { repeat: 180 }),
    loadEnvironmentTexture(root + terrainChoice.files[2], { repeat: 180 }),
    loadEnvironmentTexture(root + parkChoice.files[0], { color: true, repeat: 180 }),
    loadEnvironmentTexture(root + parkChoice.files[1], { repeat: 180 }),
    loadEnvironmentTexture(root + parkChoice.files[2], { repeat: 180 }),
  ]).then(([terrainAlbedo, terrainNormal, terrainRoughness, parkAlbedo, parkNormal, parkRoughness]) => {
    if (_groundTexture !== selectedTexture || !CITY_LOOKS[_cityLook]?.realistic) return;
    for (const mat of _grassMats) {
      const park = mat.userData.grassSurface === 'park';
      const albedo = park ? parkAlbedo : terrainAlbedo;
      const normal = park ? parkNormal : terrainNormal;
      const roughness = park ? parkRoughness : terrainRoughness;
      const treatment = park ? parkTreatment : terrainTreatment;
      mat.map = albedo; mat.normalMap = normal;
      // Keep detail tactile at street level without noisy, repeating normals
      // in the aerial view. Park lawns are mown, so their bump is quieter.
      mat.normalScale.setScalar((IS_MOBILE ? 0.86 : 1) * (park ? treatment.parkNormal : treatment.terrainNormal));
      mat.roughnessMap = roughness; mat.roughness = 1;
      mat.userData.grassTextureDetail = 1;
      mat.userData.grassPbrTreatment = treatment;
      mat.userData.__uGrassTextureDetail && (mat.userData.__uGrassTextureDetail.value = 1);
      mat.userData.__uGrassPbrSaturation && (mat.userData.__uGrassPbrSaturation.value = treatment.saturation);
      mat.userData.__uGrassPbrAlbedoMix && (mat.userData.__uGrassPbrAlbedoMix.value = treatment.albedoMix);
      mat.userData.__uGrassPbrTint && mat.userData.__uGrassPbrTint.value.set(treatment.tint);
      mat.userData.__uGrassPbrTintStrength && (mat.userData.__uGrassPbrTintStrength.value = treatment.tintStrength);
      mat.userData.__uGrassParkLift && (mat.userData.__uGrassParkLift.value = park ? treatment.parkLift : 0);
      mat.needsUpdate = true;
    }
  }).catch(error => console.warn('[ground-texture] maps unavailable; using Toy Town fallback', error));
}
function stylizedGrassMaterial({park=false,distanceFade=false}={}) {
  const material=new THREE.MeshStandardMaterial({color:0xffffff,roughness:1,metalness:0});
  _grassMats.add(material);
  material.addEventListener('dispose',()=>_grassMats.delete(material));
  if(distanceFade)_groundMat=material;
  material.userData.grassSurface=park?'park':'terrain';
  material.userData.grassTextureDetail=0;
  material.userData.grassPbrTreatment=park?PARK_LAWN_PBR_TREATMENT:GRASS_PBR_TREATMENTS.leafy;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFogColor = { value: new THREE.Color(DUSK.horizon) };
    shader.uniforms.uCamPos = { value: new THREE.Vector3(1000, 220, 1000) };
    shader.uniforms.uFadeNear = { value: 800 };
    shader.uniforms.uFadeFar = { value: 1700 };
    shader.uniforms.uGrassNight = { value: 0.55 };
    shader.uniforms.uGrassWarmth = { value: 0.0 };
    shader.uniforms.uGrassWarmthScale = { value: park ? 0.02 : 0.22 };
    shader.uniforms.uGrassDayTint = { value: new THREE.Color(0xffffff) };
    shader.uniforms.uGrassDayBrightness = { value: 0 };
    // Realistic looks keep the PBR albedo's photographed leaf, soil and blade
    // detail. The procedural palette remains only as the map-free Toy Town fallback.
    shader.uniforms.uGrassTextureDetail = { value: material.userData.grassTextureDetail || 0 };
    const treatment = material.userData.grassPbrTreatment;
    shader.uniforms.uGrassPbrSaturation = { value: treatment.saturation };
    shader.uniforms.uGrassPbrAlbedoMix = { value: treatment.albedoMix };
    shader.uniforms.uGrassPbrTint = { value: new THREE.Color(treatment.tint) };
    shader.uniforms.uGrassPbrTintStrength = { value: treatment.tintStrength };
    shader.uniforms.uGrassParkLift = { value: park ? treatment.parkLift : 0 };
    // Shader literals are linear values. Keeping the palette as Three Colors
    // avoids accidentally treating display-space green values as linear (the
    // reason the first pass looked pale under the city's bright daylight).
    const palette = material.userData.proceduralPalette || PROCEDURAL_GROUND_PALETTES.leafy;
    shader.uniforms.uGrassMoss = { value: new THREE.Color(palette[0]) };
    shader.uniforms.uGrassLeaf = { value: new THREE.Color(palette[1]) };
    shader.uniforms.uGrassSun = { value: new THREE.Color(palette[2]) };
    shader.uniforms.uGrassDry = { value: new THREE.Color(palette[3]) };
    // Parks are mown, welcoming lawns: use the same civic greens, but keep
    // their blend distinctly more even than the open city ground.
    shader.uniforms.uParkLawn = { value: new THREE.Color('#168d43') };
    // Keep a live handle to the compiled uniform so the frame loop can move it.
    material.userData.__uCamPos = shader.uniforms.uCamPos;
    material.userData.__uFogColor = shader.uniforms.uFogColor;
    material.userData.__uGrassNight = shader.uniforms.uGrassNight;
    material.userData.__uGrassWarmth = shader.uniforms.uGrassWarmth;
    material.userData.__uGrassDayTint = shader.uniforms.uGrassDayTint;
    material.userData.__uGrassDayBrightness = shader.uniforms.uGrassDayBrightness;
    material.userData.__uGrassTextureDetail = shader.uniforms.uGrassTextureDetail;
    material.userData.__uGrassPbrSaturation = shader.uniforms.uGrassPbrSaturation;
    material.userData.__uGrassPbrAlbedoMix = shader.uniforms.uGrassPbrAlbedoMix;
    material.userData.__uGrassPbrTint = shader.uniforms.uGrassPbrTint;
    material.userData.__uGrassPbrTintStrength = shader.uniforms.uGrassPbrTintStrength;
    material.userData.__uGrassParkLift = shader.uniforms.uGrassParkLift;
    material.userData.__uGrassPalette = {
      moss:shader.uniforms.uGrassMoss,leaf:shader.uniforms.uGrassLeaf,
      sun:shader.uniforms.uGrassSun,dry:shader.uniforms.uGrassDry,
      park:shader.uniforms.uParkLawn,
    };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGndWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvec4 gndW = modelMatrix * vec4(transformed, 1.0); vGndWorld = gndW.xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGndWorld;\nuniform vec3 uFogColor;\nuniform vec3 uCamPos;\nuniform float uFadeNear;\nuniform float uFadeFar;\nuniform float uGrassNight;\nuniform float uGrassWarmth;\nuniform float uGrassWarmthScale;\nuniform vec3 uGrassDayTint;\nuniform float uGrassDayBrightness;\nuniform vec3 uGrassMoss;\nuniform vec3 uGrassLeaf;\nuniform vec3 uGrassSun;\nuniform vec3 uGrassDry;\nuniform vec3 uParkLawn;\nuniform float uGrassPbrSaturation;\nuniform float uGrassPbrAlbedoMix;\nuniform vec3 uGrassPbrTint;\nuniform float uGrassPbrTintStrength;\nuniform float uGrassParkLift;\nfloat grassHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}\nfloat grassNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(grassHash(i),grassHash(i+vec2(1.,0.)),f.x),mix(grassHash(i+vec2(0.,1.)),grassHash(i+vec2(1.)),f.x),f.y);}\nfloat grassFbm(vec2 p){float n=grassNoise(p)*.56;p=mat2(.82,-.57,.57,.82)*p*2.03;n+=grassNoise(p)*.28;p=mat2(.76,.65,-.65,.76)*p*2.01;n+=grassNoise(p)*.16;return n;}')
      .replace('#include <color_fragment>', '#include <color_fragment>\nvec2 grassP=vGndWorld.xz;float grassMacro=grassFbm(grassP*.006);float grassMid=grassFbm(mat2(.84,-.54,.54,.84)*grassP*.045);float grassFine=grassFbm(grassP*.32);vec3 grassTone=mix(uGrassLeaf,uGrassMoss,(1.0-grassMacro)*.18);grassTone=mix(grassTone,uGrassSun,smoothstep(.64,.88,grassMid)*.10);grassTone*=mix(.97,1.03,grassFine);'+(park?'grassTone=mix(grassTone,uParkLawn,.94);':'grassTone=mix(grassTone,uGrassDry,smoothstep(.78,.92,grassFbm(grassP*.009))*.035);')+'grassTone=mix(grassTone,grassTone*vec3(1.08,.96,.82),max(0.0,uGrassWarmth)*uGrassWarmthScale);grassTone=mix(grassTone,grassTone*uGrassDayTint,uGrassDayBrightness);grassTone*=1.0+uGrassDayBrightness;grassTone=mix(grassTone,grassTone*vec3(.55,.67,.63),uGrassNight*.44);vec3 grassDetail=diffuseColor.rgb;grassDetail=mix(vec3(dot(grassDetail,vec3(.2126,.7152,.0722))),grassDetail,uGrassPbrSaturation);grassDetail=mix(grassDetail,grassDetail*uGrassPbrTint,uGrassPbrTintStrength);grassDetail*=1.0+uGrassParkLift;diffuseColor.rgb=mix(grassTone,grassDetail,uGrassTextureDetail*uGrassPbrAlbedoMix);')
      .replace('#include <fog_fragment>',
        '#include <fog_fragment>\n' +
        (distanceFade?
        'float gndDist = distance(vGndWorld.xz, uCamPos.xz);\n' +
        'float gndFade = smoothstep(uFadeNear, uFadeFar, gndDist);\n' +
        'gl_FragColor.rgb = mix(gl_FragColor.rgb, linearToOutputTexel(vec4(uFogColor, 1.0)).rgb, gndFade);':''));
    shader.fragmentShader = shader.fragmentShader.replace('uniform float uGrassDayBrightness;', 'uniform float uGrassDayBrightness;\nuniform float uGrassTextureDetail;');
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
        'float grain = fract(sin(dot(floor(vRoadXZ / 13.0), vec2(269.5, 183.3))) * 43758.5453);\n' +
        'float mottle = (hsh - 0.5) * 0.18 + (grain - 0.5) * 0.055;\n' +
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
function sampleLayout(resetDraft = true) {
  _exampleSession = true;
  applyExampleAppearance();
  showExampleSessionBanner();
  // These values were read before the entry choice. Synchronise them so this
  // boot uses the example preset immediately, not only after a reload.
  _cityLook = readCityLook();
  _daySky = readDaySky();
  _groundTexture = readGroundTexture();
  const sample = buildSampleCity();
  if (resetDraft) writeExampleDraft(sample);
  return sample;
}

// ─── Boot ────────────────────────────────────────────────────────────────
const stage = document.getElementById('stage');
let scene, camera, renderer, composer, labelRenderer;
let timeOfDay = null, parkLandscape=null;
let neighbourhood = null, streetLife = null, publicSpaces = null, duskSky = null, environmentMap = null;
let publicRoads = [], publicCrossings = [], roadBarrierNetwork = null, propObstacleSignature = '';
let obstacleCheckTime = 0;
const environmentProps = new Set();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let _bloomPass = null;   // glow pass ref (altitude backstop drives its strength)
let _styleGradePass = null;
const buildingLabels = [];   // CSS2D building badges — distance-faded every DOM tick
let city = {};            // object passed to champion/buddy (scene/camera/renderer/spawnWorld)
let champion = null;
let sim = null;
let layout = null;
let _bootGen = 0;         // bumped on every boot; stale loops cancel themselves
let _bootOwner = null;     // owns this boot's RAFs, listeners, timers and deferred work
let _bootWatchdog = 0;    // boot-hang guard (see bootInner)
const BOOT_TIMEOUT_MS = 300000; // let assigned models settle before showing the City
const BOOT_SLOW_COPY_MS = 20000;
const CHAMPION_TIMEOUT_MS = 12000;
let _contextPaused = false;

let specialSystem = null; // { beacon, beaconPositions, meshes }
let cityGatewayGroup = null; // permanent Workshop + Fit Studio destinations (not planner buildings)
let championShadow = null;   // low-tier blob shadow under the champion
let goalRing = null;         // green ring marking the next quest building
let _goalTarget = null;      // cached next-quest QUESTS entry
let _lastGoalTs = 0;
const interactMeshes = []; // raycast targets for building entry

// Grab / select / pick-up / move system for placed library models.
let grab = null;
let propLibrary = null;
let placementDust = null;
let disposeResizePanel = null;
function cleanupPropTools() {
  propLibrary?.destroy();
  propLibrary = null;
  grab?.destroy();
  if (window.__grab === grab) delete window.__grab;
  grab = null;
  disposeResizePanel?.();
  disposeResizePanel = null;
  if (placementDust) {
    placementDust.points.removeFromParent();
    placementDust.geometry.dispose();
    placementDust.material.dispose();
    placementDust = null;
  }
}

function cleanupBootSystems() {
  cleanupPropTools();
  _appearancePanel?.destroy?.(); _appearancePanel = null;
  focusedUI?.dispose?.(); focusedUI = null;
  myWork?.dispose?.(); myWork = null;
  learningVisuals?.destroy?.(); learningVisuals = null;
  skinSidebar?.destroy?.(); skinSidebar = null;
  _aiNodes?.dispose?.(); _aiNodes = null;
  timeOfDay?.destroy?.(); timeOfDay = null;
  parkLandscape?.destroy?.(); parkLandscape = null;
  streetProps?.destroy?.(); streetProps = null;
  citizens?.destroy?.(); clouds?.destroy?.();
  publicSpaces?.destroy?.(); streetLife?.destroy?.();
  citizens = clouds = publicSpaces = streetLife = neighbourhood = null;
  minimap?.destroy?.(); minimap = null;
  rareLandmark?.destroy?.(); rareLandmark = null;
  labelRenderer?.domElement?.remove(); labelRenderer = null;
  for (const label of buildingLabels.splice(0)) { label.removeFromParent?.(); label.element?.remove?.(); }
  interactMeshes.length = 0;
  cityGatewayGroup?.removeFromParent(); cityGatewayGroup = null;
  buildingColliders = [];
  buildingPlacementColliders = [];
  specialSystem = null;
  _parkedVehicleState.applied.length = 0;
  environmentProps.clear(); propObstacleSignature = ''; publicRoads = []; publicCrossings = []; roadBarrierNetwork = null;
  // Traffic mounts its dynamic InstancedMeshes directly on the shared scene.
  // Drop those meshes before losing the controller reference; otherwise each
  // example-city rebuild leaves a stale fleet behind to overlap the next one.
  traffic?.destroy?.();
  taxi = decoTaxis = skySentinels = drones = traffic = null;
  drivingCar = null; driveCars = [];
  walkNav = taxiNav = null;
  navObstacleRevision++;
  champion = sim = null;
  for (const key of ['__city','__scene','__layout','__taxi','__drive','__learningVisuals']) {
    try { delete window[key]; } catch { /* diagnostics only */ }
  }
  clearInput();
}
function disposeBootRenderer() {
  try { composer?.dispose?.(); } catch { /* best-effort teardown */ }
  composer = null;
  try { renderer?.dispose?.(); } catch { /* best-effort teardown */ }
  try { renderer?.domElement?.remove(); } catch { /* best-effort teardown */ }
  renderer = null;
  scene = null;
  camera = null;
}
window.addEventListener('pagehide', event => {
  if (!event.persisted) { _bootOwner?.cancel(); cleanupBootSystems(); }
});
let selectMode = false;
let runToggled = false;   // R key — toggle run on/off

// Air traffic
let taxi = null;          // player's flying taxi
let decoTaxis = null;     // decorative skyline taxis
let skySentinels = null;  // high-altitude drifting lights
let drones = null;        // patrol drones
let traffic = null;       // road vehicles
let citizens = null;      // human citizens (posed people) near buildings
let clouds = null;        // drifting clouds in the sky
let streetProps = null;   // streetlights + benches
let minimap = null;
let rareLandmark = null;

// Drivable cars (placed from the model library or the 🚗 Drive chooser).
let drivingCar = null;    // active createDrivableCar instance (null = walking/flying)
let driveCars = [];       // parked drivable car instances (bounded: fresh spawn replaces)
let driveGLBLoader = null; // shared GLTFLoader for spawning cars

// Navigation targets (from Destinations, Home, or the Buddy).
let walkNav = null;       // waypoint route; manual movement always cancels it
let taxiNav = null;       // {x, z, y} — taxi auto-flies here
let navObstacleRevision = 0;

// Densify state (from loadLayout)
let growScale = 1;        // champion scale multiplier (buildings grow too)
let cityBounds = null;    // tightened bounds for minimap + sky traffic
let cityFocusBounds = null; // occupied content only: spawn + first overview
let _exampleSession = false;

function validSavedLayout() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return !!raw && validateLayout(JSON.parse(raw)).ok;
  } catch { return false; }
}

function showExampleSessionBanner() {
  const banner = document.getElementById('example-session-banner');
  const back = document.getElementById('example-return');
  if (!banner || !back) return;
  const hasSavedCity = validSavedLayout();
  const key = hasSavedCity ? 'example.backCity' : 'example.backPlanner';
  back.href = hasSavedCity ? '/city-builder/?resume=1' : '/planner/';
  back.dataset.i18n = key;
  back.textContent = t(key);
  banner.hidden = false;
  const editPlan = document.querySelector('#city-mode-switch a.city-mode');
  if (editPlan) editPlan.href = '/planner/?example=1';
}

// Orbit / input state
// Distances are context-aware: overview (no champion) / walk / taxi ride.
const orbit = {
  theta: 0.6, phi: 1.1, dist: 62, target: new THREE.Vector3(1000, 0, 1000), locked: false,
  distOverview: 62, distWalk: 26, distTaxi: 15, distDrive: 13,
  introUntil: 0,
  lastOrbitTs: 0,          // last manual orbit drag (for idle camera auto-reset)
};
window.__orbit = orbit;    // debug hook — visual QA scripts drive the camera
const input = { x: 0, z: 0, running: false, jump: false, wave: false, dance: false, ascend: false, descend: false };
let keys = {};

// ─── Scene setup (osm-city look) ─────────────────────────────────────────
function setupScene(owner) {
  migrateLegacyAppearance();
  cleanupBootSystems();
  releaseCitySky();
  _bloomPass = null;
  _styleGradePass = null;
  if (environmentMap) { environmentMap.dispose(); environmentMap = null; }
  if(duskSky){duskSky.geometry.dispose();duskSky.material.dispose();duskSky=null;}
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
  for(const st of Object.values(glbState)){st.spots=[];st.fallbacks=[];st.applied=[];}
  scene = new THREE.Scene();
  // Background and fog share one colour so the horizon seam disappears: distant
  // buildings fade into the same tone the sky shows at the ground line (design
  // polish — the old mismatch drew a hard edge at the draw distance).
  scene.background = new THREE.Color(DUSK.horizon);
  scene.fog = new THREE.FogExp2(DUSK.horizon, 0.00065);
  // One untextured sky mesh; the horizon colour is shared with fog and ground.
  // View elevation drives the gradient, so tilting the camera cannot expose a seam.
  duskSky = new THREE.Mesh(new THREE.SphereGeometry(3900, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, toneMapped: false,
    uniforms: { horizon: {value:new THREE.Color(DUSK.horizon)}, zenith:{value:new THREE.Color(DUSK.sky)}, equirectMap:{value:null}, useEquirect:{value:0}, equirectHorizonBlend:{value:new THREE.Vector2(0.05,0.16)}, equirectSaturation:{value:1}, equirectContrast:{value:1}, equirectTint:{value:new THREE.Color(0xffffff)} },
    vertexShader: 'varying vec3 direction; void main(){direction=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    // Direct equirectangular sampler: this deliberately bypasses the renderer's
    // scene.background cube conversion and retains the selected 4K panorama.
    // Three's texture UVs put the top of the source image at v=1. Keep the
    // equirectangular horizon at v=.5 and map an upward ray to that top half;
    // acos(d.y)/PI did the opposite and put the photographed ground overhead.
    fragmentShader: 'uniform vec3 horizon;uniform vec3 zenith;uniform sampler2D equirectMap;uniform float useEquirect;uniform vec2 equirectHorizonBlend;uniform float equirectSaturation;uniform float equirectContrast;uniform vec3 equirectTint;varying vec3 direction;const float PI=3.14159265359;void main(){vec3 d=normalize(direction);vec3 procedural=mix(horizon,zenith,smoothstep(0.0,0.75,d.y));vec2 uv=vec2(atan(d.z,d.x)/(2.0*PI)+0.5,0.5+asin(clamp(d.y,-1.0,1.0))/PI);vec3 panorama=texture2D(equirectMap,uv).rgb;panorama=mix(vec3(dot(panorama,vec3(.2126,.7152,.0722))),panorama,equirectSaturation);panorama=(panorama-.5)*equirectContrast+.5;panorama=clamp(panorama*equirectTint,0.0,1.0);float skyOnly=smoothstep(equirectHorizonBlend.x,equirectHorizonBlend.y,d.y);gl_FragColor=vec4(mix(procedural,panorama,useEquirect*skyOnly),1.0);\n#include <colorspace_fragment>\n}',
  }));
  duskSky.renderOrder=-10000;duskSky.frustumCulled=false;scene.add(duskSky);


  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1.0, 8000);
  const focus = cityFocusBounds || { minX: 0, minZ: 0, maxX: 2000, maxZ: 2000 };
  const focusX = (focus.minX + focus.maxX) / 2, focusZ = (focus.minZ + focus.maxZ) / 2;
  const focusSpan = Math.max(120, focus.maxX - focus.minX, focus.maxZ - focus.minZ);
  const overviewCap = _exampleSession ? 1450 : 2200;
  orbit.distOverview = Math.max(62, Math.min(overviewCap, focusSpan * 1.15));
  orbit.dist = orbit.distOverview;
  orbit.target.set(focusX, 0, focusZ);
  camera.position.set(focusX + focusSpan * 0.32, Math.max(120, focusSpan * 0.48), focusZ + focusSpan * 0.42);
  camera.lookAt(focusX, 10, focusZ);

  renderer = new THREE.WebGLRenderer({ antialias: !IS_WEBKIT });
  applyResolution();
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;  // deep-night blacks, predictable bloom budget (was 1.25)
  renderer.shadowMap.enabled = !LOW_END && !IS_WEBKIT;
  renderer.shadowMap.type = IS_MOBILE ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  stage.appendChild(renderer.domElement);

  // Image-based lighting is enhancement-only. A missing/offline HDRI leaves
  // the tuned hemisphere/sun rig and procedural sky in charge.
  const setEnvironmentPreset = (preset) => {
    if (!ENV_QUALITY.hdriSize) return;
    loadEnvironmentHDRI({ renderer, preset, onError: (error, asset) =>
      console.warn('[environment] HDRI unavailable; using procedural lighting', asset?.file, error)
    }).then((env) => {
      if (!env || renderer !== city.renderer) { env?.dispose(); return; }
      if (environmentMap) environmentMap.dispose();
      environmentMap = env;
      scene.environment = env;
      city.environmentMode = 'hdri';
    });
  };
  city.environmentMode = 'procedural';

  // WebGL context loss (driver crash / memory pressure — the classic iPad
  // failure under a heavy city) → friendly overlay, auto-resume on restore.
  const contextGuard = attachContextLossGuard(renderer, {
    label: t('context.title'), detail: t('context.detail'),
    retryLabel: t('context.retry'), returnLabel: t('context.planner'),
    recoveryMs: window.__CITY_CONTEXT_RECOVERY_MS__ ?? 12000,
    onLost: () => { _contextPaused = true; clearInput(); },
    onRestored: () => { _contextPaused = false; lastT = performance.now(); },
    onRetry: () => { _contextPaused = false; boot(); },
    onReturn: () => { window.location.href = '/planner/'; },
  });
  owner.own(() => contextGuard.destroy());
  window.__contextGuard = true; // diagnostics/test hook

  // Low tier renders straight to the canvas (no EffectComposer at all — the
  // fullscreen passes + render targets are the biggest fill-rate cost on
  // tile-based mobile GPUs). A cheap CSS radial vignette stands in for the
  // shader vignette the composer normally adds.
  if (LOW_END) {
    const v = document.createElement('div');
    v.dataset.cityVignette = 'true';
    v.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:5;' +
      'background:radial-gradient(ellipse at center, transparent 62%, rgba(10,15,29,0.35) 100%);';
    document.body.appendChild(v);
    owner.own(() => v.remove());
  } else {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    // Glow discipline: threshold 0.68 keeps only genuine emitters (windows,
    // beacons, lamp accents) past the bloom gate — reflective road paint,
    // foliage and distant dashes no longer blow out into white haze. Strength
    // scaled down so bloom reads as glow, not glare. Emitters that must keep
    // glowing are re-bumped above the threshold (see facade/beacon passes).
    const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), IS_MOBILE ? DUSK.mobileBloom : DUSK.bloom, 0.4, 0.70);
    bloom.threshold = 0.70;
    bloom.strength = IS_MOBILE ? DUSK.mobileBloom : DUSK.bloom;
    _bloomPass = bloom;
    composer.addPass(bloom);
    const sat = { uniforms: { tDiffuse: { value: null }, amount: { value: 1.025 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'uniform sampler2D tDiffuse; uniform float amount; varying vec2 vUv; const vec3 LUMA=vec3(0.2126,0.7152,0.0722); void main(){ vec4 c=texture2D(tDiffuse,vUv); float luma=dot(c.rgb,LUMA); c.rgb=mix(vec3(luma),c.rgb,amount); gl_FragColor=c; }' };
    composer.addPass(new ShaderPass(sat));
    const grade = { uniforms: { tDiffuse: { value: null }, tint: { value: new THREE.Color('#ffe3c5') }, contrast: { value: .94 } },
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'uniform sampler2D tDiffuse;uniform vec3 tint;uniform float contrast;varying vec2 vUv;void main(){vec4 c=texture2D(tDiffuse,vUv);c.rgb=clamp((c.rgb-.5)*contrast+.5,0.,1.)*tint;gl_FragColor=c;}' };
    _styleGradePass = new ShaderPass(grade); composer.addPass(_styleGradePass);
    const vig = { uniforms: { tDiffuse: { value: null }, intensity: { value: 0.16 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'uniform sampler2D tDiffuse; uniform float intensity; varying vec2 vUv; void main(){ vec4 c=texture2D(tDiffuse,vUv); float d=distance(vUv,vec2(0.5)); float v=1.0-intensity*smoothstep(0.4,0.9,d); gl_FragColor=vec4(c.rgb*v,c.a); }' };
    composer.addPass(new ShaderPass(vig));
    if (!IS_MOBILE) {
      composer.addPass(new SMAAPass(window.innerWidth * renderer.getPixelRatio(), window.innerHeight * renderer.getPixelRatio()));
    }
    composer.addPass(new OutputPass());
  }

  const hemi=new THREE.HemisphereLight(DUSK.skyLight,DUSK.groundLight,2);scene.add(hemi);
  const sun = new THREE.DirectionalLight(DUSK.sun, 2.0);
  sun.position.set(1000, 1600, 1200);
  sun.castShadow = !LOW_END;
  sun.shadow.mapSize.set(IS_MOBILE ? 1024 : 2048, IS_MOBILE ? 1024 : 2048);
  // City-covering frustum (low tier has shadows off entirely). A tight
  // champion-following shadow frustum is a Phase-2 refinement, not worth
  // risking the current working setup for now.
  sun.shadow.camera.left = -1200; sun.shadow.camera.right = 1200;
  sun.shadow.camera.top = 1200; sun.shadow.camera.bottom = -1200;
  scene.add(sun);
  const rim = new THREE.DirectionalLight(DUSK.rim, 0.35);
  rim.position.set(-1400, 900, -1200);
  scene.add(rim);

  // Ground — sized to the ~2000-unit city plus margin. The old 20000-unit plane
  // (with far=30000) collapsed depth-buffer precision on mobile GPUs, making
  // ground-level geometry silently fail the depth test on iPads. The fog already
  // hides anything past ~2000 units, so a 6000-unit plane is invisible loss on
  // desktop and a huge precision win on mobile.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(6000, 6000),
    stylizedGrassMaterial({distanceFade:true})
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.1;
  ground.receiveShadow = true;
  scene.add(ground);

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
      transparent: true, opacity: 0.12, fog: false, depthWrite: false,
    });
    const pts = new THREE.Points(geo, mat);
    pts.userData.timeStars=true;
    pts.position.set(1000, 0, 1000);
    scene.add(pts);
  })();

  timeOfDay=createTimeOfDay({scene,renderer,sky:duskSky,hemi,sun,rim,ground:()=>_groundMat,grasses:()=>_grassMats,reducedMotion:()=>reducedMotion.matches,getClouds:()=>clouds,onPresetChange:id=>{setEnvironmentPreset(id);applyCityLook(_cityLook);},post:{bloom:_bloomPass,saturation:composer?composer.passes.find(p=>p.uniforms?.amount)?.uniforms.amount:null,vignette:composer?composer.passes.find(p=>p.uniforms?.intensity)?.uniforms.intensity:null}});
  city.setTimeOfDay=id=>timeOfDay.setTimeOfDay(id);city.timeOfDay=timeOfDay;
  _appearancePanel = mountAppearancePanel({ style:_cityLook, ground:_groundTexture, time:timeOfDay.id, daySky:_daySky,
    onStyle:id=>{applyCityLook(id);_appearancePanel?.set({style:id});},
    onGround:id=>{applyGroundTexture(id);_appearancePanel?.set({ground:id});},
    onTime:id=>{timeOfDay.setTimeOfDay(id);_appearancePanel?.set({time:id});},
    onDaySky:id=>{applyDaySky(id);_appearancePanel?.set({daySky:id});} });
  city.setCityStyle=id=>applyCityLook(id);city.setGroundTexture=id=>applyGroundTexture(id);city.setDaySky=id=>applyDaySky(id);
  applyCityLook(_cityLook);
  applyGroundTexture(_groundTexture);

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
  city.orbit = orbit;
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
  asphY: 0.12,
  dashW: 0.5,
  dashLen: 4,
  dashGap: 4,
  // Glow discipline (road markings are reflective PAINT, not light sources —
  // they must sit under the 0.68 bloom threshold). Near-white cool dash, dim
  // cool-grey edge line; brightness falls with distance so nothing smears from
  // altitude. The edge line ramps down early (see uRamp* in the marking shader)
  // so thin edge circles dissolve before they alias at altitude.
  dashColor: 0xe8f2ff,
  markY: 0.18,          // markings sit a hair above the asphalt
  glowInset: 0.7,       // glowing edge light: just inside the road edge
  glowW: 0.25,          // thin — reads as a light line, not a band
  glowY: 0.16,
  // Flat sidewalk ribbon: untextured concrete under the asphalt so the road
  // network has figure-ground at altitude without curb geometry.
  swW: 1.8,             // m of pavement on EACH side of the road
  swY: 0.02,            // separated from asphalt to prevent aerial depth flicker
  swColor: DUSK.pavement,    // cool concrete — lighter than asphalt, darker than ground tint
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
  // Junction pad: same asphalt, but biased toward the camera so it always wins
  // over the (lower) ribbon asphalt where they overlap at a crossing.
  pad: asphaltSurfaceDetail(new THREE.MeshStandardMaterial({ color: ROAD_FX.asphColor, roughness: 1, metalness: 0, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })),
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
function loadRoadTextures(gen = _bootGen, targetRenderer = renderer) {
  if (_roadTexLoading) return;
  _roadTexLoading = true;
  const L = new THREE.TextureLoader();
  const cfg = (t, srgb) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    // Anisotropy: 16 is wasted on tile-based mobile GPUs — cap 4 there. Aniso
    // only matters at grazing angles; altitude views are near-vertical and the
    // mips handle them.
    t.anisotropy = Math.min(IS_MOBILE ? 4 : 16, targetRenderer.capabilities.getMaxAnisotropy());
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  Promise.all([
    new Promise((res, rej) => L.load('assets/textures/ground-asphalt.jpg', (t) => res(cfg(t, true)), undefined, rej)),
    new Promise((res, rej) => L.load('assets/textures/aerial_asphalt_01_nor_gl_1k.jpg', (t) => res(cfg(t, false)), undefined, rej)),
    new Promise((res, rej) => L.load('assets/textures/aerial_asphalt_01_rough_1k.jpg', (t) => res(cfg(t, false)), undefined, rej)),
  ]).then(([albedo, normal, rough]) => {
    if(gen!==_bootGen){albedo.dispose();normal.dispose();rough.dispose();_roadTexLoading=false;return;}
    _roadMats.asph.map = albedo;
    _roadMats.asph.normalMap = normal;
    _roadMats.asph.normalScale.set(0.15, 0.15);   // low — kills high-freq normal aliasing at altitude
    _roadMats.asph.roughnessMap = rough;
    _roadMats.asph.roughness = 1;
    _roadMats.asph.needsUpdate = true;
    // Same maps as the roads (including the normal map) so the junction shades
    // exactly like the street it joins.
    _roadMats.pad.map = albedo;
    _roadMats.pad.normalMap = normal;
    _roadMats.pad.normalScale.set(0.15, 0.15);
    _roadMats.pad.roughnessMap = rough;
    _roadMats.pad.roughness = 1;
    _roadMats.pad.needsUpdate = true;
  }).catch((e) => { console.warn('[road-fx] textures failed — staying flat charcoal', e); _roadTexLoading = false; });
}

/** Horizontal perpendicular at every vertex, mitred so bends keep their width
 *  (see ribbonNormals in city-common/road-geometry.js). */
function roadLateral(poly) {
  return ribbonNormals(poly);
}
function offsetRoad(poly, lat, d) {
  return poly.map((p, i) => ({ x: p.x + lat[i].x * d * (lat[i].s ?? 1), z: p.z + lat[i].z * d * (lat[i].s ?? 1) }));
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
    const si = lat[i].s ?? 1, sj = lat[i + 1].s ?? 1;
    const lx0 = -lat[i].x * half * si, lz0 = -lat[i].z * half * si, rx0 = lat[i].x * half * si, rz0 = lat[i].z * half * si;
    const lx1 = -lat[i + 1].x * half * sj, lz1 = -lat[i + 1].z * half * sj, rx1 = lat[i + 1].x * half * sj, rz1 = lat[i + 1].z * half * sj;
    const xL0 = a.x + lx0, zL0 = a.z + lz0, xR0 = a.x + rx0, zR0 = a.z + rz0;
    const xL1 = b.x + lx1, zL1 = b.z + lz1, xR1 = b.x + rx1, zR1 = b.z + rz1;
    Pos.push(xL0, y, zL0, xR0, y, zR0, xL1, y, zL1);
    Pos.push(xL1, y, zL1, xR0, y, zR0, xR1, y, zR1);
    if (wantUv && Uv) {
      // World-aligned asphalt: every independently-authored road and every
      // junction samples the same texel at the same city coordinate. A road's
      // direction can no longer rotate/offset the grain and reveal a join.
      const t = ROAD_FX.tileM;
      Uv.push(xL0 / t, zL0 / t, xR0 / t, zR0 / t, xL1 / t, zL1 / t,
        xL1 / t, zL1 / t, xR0 / t, zR0 / t, xR1 / t, zR1 / t);
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
/** Project a point onto a road polyline in the road's OWN texture frame:
 *  arc-length along the centreline and signed lateral (left +), in metres —
 *  exactly the (u, v) `pushRibbon` uses, so a junction pad continues the same
 *  asphalt at the same grain and scale instead of looking like another material. */
function roadUV(info, P) {
  return { u: P.x / ROAD_FX.tileM, v: P.z / ROAD_FX.tileM };
}

/** Fan-triangulate a star-shaped outline (from junctionPadOutline) about its
 *  node into a flat layer. `uvFor(point)` returns that vertex's road-frame UV
 *  (or null for an untextured layer). Zero-area wedges (the straight-through
 *  diameter of a T/X) are dropped — a degenerate triangle has an undefined
 *  normal and renders as a bright streak. */
function pushFan(Pos, Uv, outline, y, uvFor) {
  const { node, ring } = outline;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const area2 = (a.x - node.x) * (b.z - node.z) - (a.z - node.z) * (b.x - node.x);
    if (Math.abs(area2) < 0.02) continue;        // skip needles that alias a normal map
    Pos.push(node.x, y, node.z, a.x, y, a.z, b.x, y, b.z);
    if (Uv && uvFor) {
      // The node vertex must be measured in THIS triangle's road frame, or its
      // UV jumps to another road's arc and the mouth no longer lines up.
      const un = uvFor({ x: node.x, z: node.z, roadId: a.roadId });
      const ua = uvFor(a), ub = uvFor(b);
      Uv.push(un.u, un.v, ua.u, ua.v, ub.u, ub.v);
    }
  }
}

/** Concrete band between two matching star outlines (inner pad ring → grown
 *  apron ring). Only fills the pavement OUTSIDE the pad, so no light concrete
 *  can show through a thin asphalt wedge. */
function pushRingBand(Pos, inner, outer, y) {
  const n = inner.ring.length;
  if (!n || outer.ring.length !== n) return;
  for (let i = 0; i < n; i++) {
    const a = inner.ring[i], b = inner.ring[(i + 1) % n];
    const A = outer.ring[i], B = outer.ring[(i + 1) % n];
    const area2 = (b.x - a.x) * (B.z - A.z) - (b.z - a.z) * (B.x - A.x);
    if (Math.abs(area2) < 0.02) continue;      // skip needles → no NaN normals
    Pos.push(a.x, y, a.z, b.x, y, b.z, A.x, y, A.z);
    Pos.push(b.x, y, b.z, B.x, y, B.z, A.x, y, A.z);
  }
}

/** Flat pavement mesh. Uses computeVertexNormals exactly like the road ribbons
 *  do (a fixed +Y normal would disagree with the fan's winding and light the
 *  visible face as if it pointed down — i.e. black). Degenerate wedges are
 *  skipped by the pushers, so there is no NaN normal to worry about. */
function addFlatFanMesh(group, Pos, Uv, mat) {
  if (!Pos.length) return;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(Pos, 3));
  if (Uv && Uv.length) geo.setAttribute('uv', new THREE.Float32BufferAttribute(Uv, 2));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  group.add(mesh);
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
/**
 * Mask road markings around every REAL junction, driven by the traffic graph.
 *
 * The graph already splits roads at their true crossings and reports a junction
 * wherever three or more arms meet (T, X, multi-way, roundabout merge); elbows
 * and bends are not junctions. For each incident road we mask a window whose
 * half-width follows the actual mouth — `otherHalf / sin θ` — so an oblique join
 * is masked as wide as it really opens. That stops centre dashes AND the bright
 * edge glow from printing across the crossing street at any angle (previously a
 * 4-way crossing was invisible to this pass and its glow drew a "+").
 *
 * `mouths` lists the terminating approaches that get stop-line/zebra paint: a
 * one-arm road joining a road that carries through traffic. Through roads and
 * 4-way/multi-way crossings are masked only — no paint.
 */
function buildJunctionContacts(infos, network) {
  const masks = infos.map(() => []);
  const mouths = [];
  const junctions = network?.junctions;
  if (!junctions || !junctions.length) return { masks, mouths };

  for (const junction of junctions) {
    const node = junction.node;
    // Group the node's outgoing arms by their physical road.
    const byRoad = new Map();
    for (const link of node.links) {
      const arms = byRoad.get(link.roadId) || [];
      arms.push(link);
      byRoad.set(link.roadId, arms);
    }
    // A "through movement" exists when one road passes the node (two arms).
    const hasThrough = [...byRoad.values()].some((arms) => arms.length >= 2);

    for (const [roadId, arms] of byRoad) {
      const info = infos[roadId];
      if (!info) continue;
      // Mask window measured ALONG this road, from every other incident road.
      let maskHalf = 8;
      for (const [otherId, otherArms] of byRoad) {
        if (otherId === roadId) continue;
        const otherHalf = infos[otherId]?.half ?? 6;
        for (const arm of arms) {
          for (const other of otherArms) {
            maskHalf = Math.max(maskHalf, junctionMouthMaskHalf(info.half, otherHalf, arm, other));
          }
        }
      }
      const hit = nearestArcOnPoly(info.poly, info.cum, node);
      masks[roadId].push({ arc: hit.arc, mask: maskHalf });

      // Terminating approach: one arm at this road's end, joining a through road.
      const atStart = hit.arc <= 0.5;
      const atEnd = hit.arc >= info.total - 0.5;
      if (arms.length === 1 && hasThrough && (atStart || atEnd)) {
        // `setback` is how far the through carriageway reaches along this road:
        // the stop line + zebra belong BEYOND it, on the approach — not inside
        // the junction (which is what happens if we paint from the node itself).
        mouths.push({ roadId, atEnd: atStart ? 'start' : 'end', arc: atStart ? 0 : info.total, half: info.half, setback: maskHalf });
      }
    }
  }
  return { masks, mouths };
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
  const P = { sw: [], asph: [], uv: [], jct: [], dash: [], glow: [], pad: [], padUv: [], apron: [] };

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

  if (!elevated) {
    publicRoads = infos.map(info => ({points: info.poly.map(p => [p.x,p.z]), width:info.half*2}));
    publicCrossings = [];
    roadBarrierNetwork = buildTrafficNetwork(publicRoads);
  }
  // Phase 2 — junction masks (all real junctions) + terminating mouths (paint).
  const { masks, mouths } = buildJunctionContacts(infos, elevated ? null : roadBarrierNetwork);

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
        // Walk by ARC, not by vertex: a junction can sit in the middle of one
        // long segment (a 2-point road), and a merely per-vertex test would let
        // the glowing edge run straight across the intersection.
        for (let s = 0; s < path.length - 1; s++) {
          const a = path[s], b = path[s + 1];
          const segLen = Math.hypot(b.x - a.x, b.z - a.z);
          if (segLen < 1e-4) continue;
          const arc0 = cum[s], arcSpan = cum[s + 1] - cum[s];
          const steps = Math.max(1, Math.ceil(segLen / 4));   // ≤ 4 m pieces
          for (let k = 0; k < steps; k++) {
            const t0 = k / steps, t1 = (k + 1) / steps;
            if (maskedAt(arc0 + arcSpan * (t0 + t1) / 2)) continue;
            pushSegQuad(P.glow,
              { x: a.x + (b.x - a.x) * t0, z: a.z + (b.z - a.z) * t0 },
              { x: a.x + (b.x - a.x) * t1, z: a.z + (b.z - a.z) * t1 },
              ROAD_FX.glowW / 2, yGlow);
          }
        }
      }
    }
  }

  // Phase 3b — junction pavement. A star-shaped asphalt pad hugs each arm's
  // edges and cuts the corners between them with a kerb chord, so the paved
  // surface reads as one intersection at ANY approach angle (and hides the
  // square-cut ribbon ends and overlap slivers). An outward concrete apron fills
  // the corner wedges so the pavement stays continuous. Fan-triangulated from
  // the node — valid because the outline is star-shaped about it.
  if (!elevated && roadBarrierNetwork) {
    const yPad = ROAD_FX.asphY + 0.003;   // ~flush; the material's depth bias resolves the overlap
    for (const j of roadBarrierNetwork.junctions) {
      const arms = j.node.links.map((l) => ({ dx: l.dx, dz: l.dz, half: (l.width || 9) / 2, id: l.roadId }));
      const pad = junctionPadOutline(j.node, arms, { kerb: 5 });
      const apron = junctionPadOutline(j.node, arms, { kerb: 5, grow: ROAD_FX.swW });
      if (pad && apron) pushRingBand(P.apron, pad, apron, ySide);
      if (pad) {
        // Texture the pad in the frame of the road each vertex belongs to, so it
        // is a seamless continuation of that road's asphalt at the mouth.
        const uvFor = (p) => {
          const info = infos[p.roadId];
          return info ? roadUV(info, p) : { u: 0, v: 0 };
        };
        pushFan(P.pad, P.padUv, pad, yPad, uvFor);
      }
    }
  }

  // Phase 4 — junction mouth detail (stop lines + zebra bars). Only for a
  // terminating approach that joins a through road: that reclaims the masked
  // mouth as a painted crossing. Through roads and 4-way/multi-way crossings
  // stay clean (no paint), so a grid does not sprout zebras in every cell.
  if (!elevated && mouths.length) {
    for (const jc of mouths) {
      const termInfo = infos[jc.roadId];
      if (!termInfo) continue;
      // Direction from the mouth INTO the terminating road (where bars sit).
      const inward = jc.atEnd === 'start' ? 1 : -1;
      // Sit the paint clear of the through carriageway (setback = the mouth
      // width along this approach), so it lands on the approach, not the junction.
      const base = jc.arc + inward * (jc.setback || 0);
      // Stop line: single thick bar at stopDist back from the mouth.
      const stopAt = base + inward * ROAD_FX.stopDist;
      pushArcBar(P.jct, termInfo, clampArc(stopAt, termInfo.total), termInfo.half, ROAD_FX.stopLen / 2, yMark);
      // Zebra: thin bars, spaced out from just behind the stop line.
      for (let b = 0; b < 3; b++) {
        const zb = base + inward * (ROAD_FX.stopDist + 1.2 + b * ROAD_FX.zebraGap);
        if (zb < 0 || zb > termInfo.total) continue;
        pushArcBar(P.jct, termInfo, zb, termInfo.half, ROAD_FX.zebraLen / 2, yMark);
        if (b === 1) {
          let si=0; while(si<termInfo.poly.length-2 && termInfo.cum[si+1]<zb)si++;
          const a=termInfo.poly[si],end=termInfo.poly[si+1];
          const len=Math.hypot(end.x-a.x,end.z-a.z)||1;
          const t=(zb-termInfo.cum[si])/len, x=a.x+(end.x-a.x)*t,z=a.z+(end.z-a.z)*t;
          const nx=-(end.z-a.z)/len*(termInfo.half+.95),nz=(end.x-a.x)/len*(termInfo.half+.95);
          publicCrossings.push({a:{x:x+nx,z:z+nz},b:{x:x-nx,z:z-nz},road:jc.roadId});
        }
      }
    }
  }

  // One mesh per layer keeps draw calls low on tablets.
  addFlatFanMesh(group, P.apron, null, _roadMats.sw);
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
  // Exactly the same asphalt material as the road ribbons. The +3 mm layer is
  // only a z-fighting guard, not a visibly raised or differently shaded patch.
  addFlatFanMesh(group, P.pad, P.padUv, _roadMats.asph);
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

// Tree instancing: each GLB pack variant is normalised ONCE into a shared
// single-geometry mesh; addTree() only QUEUES a placement, and flushTrees()
// (called after carving) writes them into per-variant InstancedMeshes. This
// batches placements by variant and source material, rather than one draw
// per tree. Bark and textured leaves retain separate material groups.
let _treeVariants = [];   // [{geo, height}] — normalized, feet on y=0
let _treePlacements = []; // [{x, z, scale, v}] — queued until flush
let _treeSafetyPlacements = []; // retained for debug/browser scenery checks

function loadTreeModels(isCurrent = () => true) {
  return Promise.all([
    _treeLoader.loadAsync('../library/nature/kenney-tree_oak.glb').catch((e) => { console.warn('[city-builder] tree GLB failed', e); return null; }),
    _treeLoader.loadAsync('../library/nature/kenney-tree_default.glb').catch((e) => { console.warn('[city-builder] tree-high GLB failed', e); return null; }),
  ]).then(([a, b]) => {
    if (!isCurrent()) { disposeDetachedModel(a); disposeDetachedModel(b); return null; }
    _treeModels = {};
    if (a) _treeModels.tree = a.scene;
    if (b) _treeModels.treeHigh = b.scene;
    return Object.keys(_treeModels).length ? _treeModels : null;
  });
}
function loadTreePacks(isCurrent = () => true, limit = Infinity) {
  // City canopy trees: the same CC0 Quaternius "Common Tree" models the child
  // sees in the Decorate library (nat_common_tree / nat_common_tree_2), so the
  // auto-grown city matches what they can place by hand. Two variants keep the
  // canopy batched into two InstancedMeshes. Optional — a failed load falls
  // back to the procedural trees in flushTrees(), never blocks city boot.
  const urls = {
    common1: '../library/nature/quaternius-CommonTree_1.glb',
    common2: '../library/nature/quaternius-CommonTree_2.glb',
  };
  const keys = Object.keys(urls).slice(0, Math.max(1, limit));
  return Promise.all(keys.map((key) =>
    _treeLoader.loadAsync(urls[key]).catch((e) => {
      console.warn('[city-builder] detailed tree pack failed', key, e);
      return null;
    })
  )).then((scenes) => {
    if (!isCurrent()) { for (const gltf of scenes) disposeDetachedModel(gltf); return null; }
    _treePacks = {};
    scenes.forEach((gltf, i) => {
      if (gltf?.scene) _treePacks[keys[i]] = gltf.scene;
    });
    return Object.keys(_treePacks).length ? _treePacks : null;
  });
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
// y=0. Returns {geo, materials, height} or null. `height` is the tree's natural height so
// instances can be scaled to a target size like the old clone path did.
function normalizeTreeToGeometry(root) {
  try {
    const clone = root.clone(true);
    clone.updateMatrixWorld(true);
    const geos = [];
    const materials = [];
    const groups = [];
    let indexOffset = 0;
    clone.traverse((o) => {
      if (o.isMesh && o.geometry) {
        const g = deInterleave(o.geometry.clone());
        g.applyMatrix4(o.matrixWorld);
        // Keep source material groups: dropping them strips leaf alpha maps
        // and turns textured foliage into opaque white silhouettes.
        const sourceMaterials = Array.isArray(o.material) ? o.material : [o.material];
        const materialOffset = materials.length;
        for (const source of sourceMaterials) {
          const material = source.clone();
          // Vegetation is matte; some converted FBX packs declare metalness 1.
          material.metalness = 0;
          material.roughness = 0.85;
          materials.push(material);
        }
        const count = g.index ? g.index.count : g.attributes.position.count;
        const sourceGroups = g.groups.length ? g.groups : [{ start: 0, count, materialIndex: 0 }];
        for (const group of sourceGroups) {
          groups.push({ start: indexOffset + group.start, count: group.count,
            materialIndex: materialOffset + group.materialIndex });
        }
        indexOffset += count;
        if (!g.getAttribute('normal')) g.computeVertexNormals();
        geos.push(g);
      }
    });
    if (!geos.length) return null;
    const merged = BufferGeometryUtils.mergeGeometries(geos, false);
    if (!merged) return null;
    for (const group of groups) merged.addGroup(group.start, group.count, group.materialIndex);
    // Centre X/Z on origin, sit base on y=0.
    const b = new THREE.Box3().setFromBufferAttribute(merged.attributes.position);
    const size = new THREE.Vector3(); b.getSize(size);
    const center = new THREE.Vector3(); b.getCenter(center);
    merged.translate(-center.x, -b.min.y, -center.z);
    return { geo: merged, materials, height: Math.max(size.y, 0.5) };
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

function addTree(x, z, scale, park = false) {
  if(layout.autoScenery===false)return;
  const network=roadBarrierNetwork || buildTrafficNetwork(layout.roads||[]);
  // Model canopy extends beyond the trunk: reserve a conservative 2.2m body
  // plus the same junction mouth clearance used by street trees and filler.
  if(!isRoadsideSceneryClear(network,x,z,2.2,8))return;
  _treeSafetyPlacements.push({x,z,radius:2.2,scale});
  // Queue the placement now; the variant is resolved at flush time, AFTER the
  // (deferred) tree GLBs have loaded. addPark()/scatterStreetTrees() run during
  // the synchronous boot, so they cannot know _treeVariants yet.
  _treePlacements.push({ x, z, scale, v: -1, park });
}

// Write queued tree placements into per-variant InstancedMeshes. Call after
// ALL addTree() calls (park trees + street trees) so capacities are exact.
function flushTrees() {
  if (!_treePlacements.length) return;
  const allQueued = _treePlacements; _treePlacements = [];
  // The showcase needs a visible canopy, not hundreds of copies of the same
  // textured geometry. Evenly sample the authored placements so all districts
  // remain represented while Safari stays below the triangle ceiling.
  const cap = _exampleSession ? 108 : Infinity;
  const parkQueued = _exampleSession ? allQueued.filter(p => p.park) : [];
  const otherQueued = _exampleSession ? allQueued.filter(p => !p.park) : allQueued;
  const remaining = Math.max(0, cap - parkQueued.length);
  const sampledOther = otherQueued.length > remaining
    ? Array.from({ length:remaining }, (_, i) => otherQueued[Math.floor(i * otherQueued.length / remaining)])
    : otherQueued;
  const queued = [...parkQueued, ...sampledOther];
  if (_exampleSession) city.exampleParkTrees = parkQueued.length;
  if (!_treeVariants.length) {
    // The tree GLBs failed to load — keep the city green with the procedural
    // trunk+canopy fallback rather than leaving it bare.
    for (const p of queued) {
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.2, 0.8, 8),
        new THREE.MeshStandardMaterial({ color: 0x6d4c2f, roughness: 0.9 })
      );
      trunk.position.set(p.x, 0.4, p.z);
      scene.add(trunk);
      const leaf = new THREE.Mesh(
        new THREE.SphereGeometry(0.7, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0x3d8b4f, roughness: 0.85 })
      );
      leaf.position.set(p.x, 1.1, p.z);
      scene.add(leaf);
    }
    return;
  }
  for (const p of queued) p.v = hashString(`${p.x}|${p.z}`) % _treeVariants.length;
  const counts = new Array(_treeVariants.length).fill(0);
  for (const p of queued) counts[p.v]++;
  const instByVariant = new Map();   // variant index -> InstancedMesh
  _treeVariants.forEach((variant, vi) => {
    if (!counts[vi]) return;
    const inst = new THREE.InstancedMesh(variant.geo, variant.materials, counts[vi]);
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
  for (const p of queued) {
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

// ─── Nature filler (dominant grass, occasional flowers/bushes/rocks) ─────
// Small Kenney Nature Kit (CC0) models scattered inside parks to make the
// green spaces feel lush. Same two-phase pipeline as trees: load → normalize
// each variant once → queue placements → flush into per-variant InstancedMesh.
let _natureVariants = [];     // [{geo, height, kind, weight}]
let _naturePlacements = [];   // [{x, z, scale, rotation, kind}]
let _natureLoaded = false;
let _natureBatches = [];

// These are deliberately applied only to the two Kenney grass GLBs. Their
// authored turquoise is useful nowhere in the city palette, while flowers,
// bushes and rocks retain their shipped colours.
function applyGrassVertexPalette(variant) {
  const position=variant.geo.getAttribute('position');
  if (!position) return;
  const root=new THREE.Color('#33502a');
  // Keep the supplied warm yellow-green as a sparse tip note, rather than
  // letting it turn every blade or the whole lawn yellow.
  const tip=new THREE.Color('#a8c262').lerp(new THREE.Color('#4c7c3f'),.45);
  const colors=new Float32Array(position.count*3);
  const height=Math.max(variant.height,.001);
  const tone=new THREE.Color();
  for(let i=0;i<position.count;i++){
    const h=Math.max(0,Math.min(1,position.getY(i)/height));
    const eased=h*h*(3-2*h);
    tone.copy(root).lerp(tip,eased).toArray(colors,i*3);
  }
  variant.geo.setAttribute('color',new THREE.BufferAttribute(colors,3));
  for(const material of variant.materials){
    material.color?.set(0xffffff);
    material.vertexColors=true;
    material.roughness=.95;
    material.metalness=0;
    material.side=THREE.DoubleSide;
    material.needsUpdate=true;
  }
  variant.grassVertexPalette=true;
}

function loadNatureFiller(gen = _bootGen, assets = PARK_VEGETATION_ASSETS) {
  if (_natureLoaded) return;
  _natureLoaded = true;
  const loader = createGLTFLoader();
  Promise.all(assets.map((asset) =>
    loader.loadAsync(asset.file).catch((e) => { console.warn('[nature-filler] failed', asset.file, e); return null; })
  )).then((gltfs) => {
    if(gen!==_bootGen){for(const gltf of gltfs)disposeDetachedModel(gltf);return;}
    for (let i=0;i<gltfs.length;i++) {
      const gltf=gltfs[i];
      if (!gltf) continue;
      const n = normalizeTreeToGeometry(gltf.scene);
      const asset=assets[i];
      if (n) {
        if (asset.kind.includes('grass')) applyGrassVertexPalette(n);
        _natureVariants.push({...n,...asset});
      }
    }
    // If any variants loaded, flush anything queued before load finished.
    flushNatureFiller();
  });
}

function addNatureFiller(placement) {
  if(layout.autoScenery===false)return;
  _naturePlacements.push(placement);
}

function flushNatureFiller() {
  if (!_natureVariants.length) return;
  const ready = _naturePlacements;
  _naturePlacements = [];
  if (!ready.length) return;
  const counts = new Array(_natureVariants.length).fill(0);
  for (const p of ready) {
    let v=_natureVariants.findIndex(item=>item.kind===p.kind);
    if(v<0)v=hashString(`${p.x}|${p.z}`)%_natureVariants.length;
    p.v=v;counts[v]++;
  }
  const instByVariant = new Map();
  _natureBatches=[];
  _natureVariants.forEach((variant, vi) => {
    if (!counts[vi]) return;
    const inst = new THREE.InstancedMesh(variant.geo, variant.materials, counts[vi]);
    inst.count = 0;
    inst.castShadow = false;                 // tiny props — skip shadow cost
    inst.receiveShadow = false;
    inst.userData.isNatureFiller = true;
    inst.userData.natureKind = variant.kind;
    if(variant.grassVertexPalette){
      inst.userData.grassVertexColors=true;
      inst.userData.grassInstanceColors=true;
    }
    scene.add(inst);
    _natureBatches.push(inst);
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
    const target={grass:.55,'tall-grass':.9,bush:1.25,'flower-red':.62,'flower-yellow':.62,rock:.65}[variant.kind]||.7;
    scl.setScalar((p.scale * target) / h);
    quat.setFromAxisAngle(new THREE.Vector3(0,1,0),p.rotation||0);
    m.compose(pos, quat, scl);
    inst.setMatrixAt(idx, m);
    if(variant.grassVertexPalette){
      // Stable, very slight tint/value changes stop a tiled-looking batch
      // without introducing animation, extra draws, or a new material.
      const jitter=(hashString(`${p.x.toFixed(2)}|${p.z.toFixed(2)}`)%1000)/999;
      inst.setColorAt(idx,new THREE.Color().setRGB(.91+jitter*.06,.95+jitter*.04,.88+jitter*.07));
    }
    inst.count = idx + 1;
    inst.instanceMatrix.needsUpdate = true;
  }
  for(const inst of _natureBatches)if(inst.userData.grassInstanceColors&&inst.instanceColor)inst.instanceColor.needsUpdate=true;
  city.natureScenery={batches:_natureBatches,get drawCalls(){return _natureBatches.length;},get instances(){return _natureBatches.reduce((n,b)=>n+b.count,0);},get triangles(){return _natureBatches.reduce((n,b)=>n+b.count*(b.geometry.index?.count||b.geometry.attributes.position.count)/3,0);}};
}

function addPark(cx, cz, radius) {
  const grass = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 28),
    // The park is deliberately a neutral lawn: children can make its centre
    // their own with a curated or My Models placement.
    stylizedGrassMaterial({park:true})
  );
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(cx, 0.02, cz);
  grass.receiveShadow = true;
  scene.add(grass);
  // A loose outer tree ring frames the park without choosing a universal
  // centrepiece. The deterministic vegetation pass below fills the middle
  // band while preserving the central lawn, loop path, and entrances.
  const count = _exampleSession ? Math.max(22, Math.round(radius / 3.5)) : Math.max(6, Math.round(radius / 8));
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + hashString(i + '') * 0.3;
    const r = radius * (0.69 + 0.16 * ((hashString(i * 7) % 10) / 10));
    addTree(cx + Math.cos(ang) * r, cz + Math.sin(ang) * r, 0.8 + ((hashString(i * 13) % 10) / 10) * 0.6, true);
  }
  if (_exampleSession) {
    const parts = [
      new THREE.BoxGeometry(2.8, 0.16, 0.72).translate(0, 0.72, 0),
      new THREE.BoxGeometry(2.8, 0.8, 0.14).translate(0, 1.12, 0.36),
      new THREE.BoxGeometry(0.16, 0.68, 0.16).translate(-1.08, 0.34, 0),
      new THREE.BoxGeometry(0.16, 0.68, 0.16).translate(1.08, 0.34, 0),
    ];
    const geometry = BufferGeometryUtils.mergeGeometries(parts, false);
    parts.forEach(part => part.dispose());
    if (geometry) {
      const benchCount = 18;
      const benches = new THREE.InstancedMesh(geometry,
        new THREE.MeshStandardMaterial({ color:0x9a633c, roughness:0.85 }), benchCount);
      benches.name = 'Example park benches';
      benches.userData.kind = 'example-park-benches';
      const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion();
      const up = new THREE.Vector3(0, 1, 0);
      for (let i = 0; i < benchCount; i++) {
        const angle = (i + 0.5) * Math.PI * 2 / benchCount;
        quaternion.setFromAxisAngle(up, -angle - Math.PI / 2);
        matrix.compose(new THREE.Vector3(cx + Math.cos(angle) * radius * 0.61, 0,
          cz + Math.sin(angle) * radius * 0.61), quaternion, new THREE.Vector3(1, 1, 1));
        benches.setMatrixAt(i, matrix);
      }
      benches.instanceMatrix.needsUpdate = true;
      scene.add(benches);
    }
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
    const purpose = PURPOSES[b.type];
    const q = purpose && { type: b.type,
      labelZh: b.type === 'recycling' ? '資源回收實驗室' : purpose.zh,
      labelEn: b.type === 'recycling' ? 'Recycling Lab' : purpose.en,
      pos: b.pos };
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
      const st = ensureGlbState(b.type);
      addBuildingPlot(b.type, cx, cz, fp, h);
      const beacon = { x: cx, y: h + 6, z: cz, anchor: h };
      const questRef = { q, cx, cz, top: h };
      beaconPositions.push(beacon);
      questRefs.push(questRef);
      const label = addBuildingLabel(q.labelZh, q.labelEn, cx, 3, cz, b.type === 'recycling' ? 'recycling' : '');
      st.spots.push({ x: cx, z: cz, fp, h, glbType: b.type, label, beacon, questRef });
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
      colour.setHex(0x00f2fe);
      beacon.setColorAt(i, colour);
    });
    beacon.instanceMatrix.needsUpdate = true;
    beacon.instanceColor.needsUpdate = true;
    scene.add(beacon);
    specialSystem = { beacon, beaconPositions, questRefs };
  }

}

function addBuildingLabel(zh, en, x, y, z, kind = '') {
  if (!labelRenderer) return;
  const el = document.createElement('div');
  el.className = `building-label quest-label${kind === 'recycling' ? ' learning-label learning-label-recycling' : kind ? ` gateway-label gateway-label-${kind}` : ''}`;
  el.innerHTML = `<div class="bl-zh">${zh}</div><div class="bl-en">${en}</div>`;
  const label = new CSS2DObject(el);
  label.position.set(x, y, z);
  scene.add(label);
  buildingLabels.push(label);
  return label;
}

// ─── Permanent learning gateways ──────────────────────────────────────────
// These are deliberately outside `layout.buildings`: every city gets exactly
// one of each, students cannot accidentally delete them in the planner, and a
// Hunyuan GLB replaces only this visual root without changing the destination,
// fixed footprint, socket, label or proximity interaction.
const GATEWAY_MODELS = Object.freeze({
  workshop: Object.freeze({
    file: 'assets/models/gateways/passiona-ai-workshop-gateway.glb',
    footprint: Object.freeze([28, 28]),
  }),
  studio: Object.freeze({
    file: 'assets/models/gateways/passiona-fit-studio-gateway.glb',
    footprint: Object.freeze([28, 28]),
  }),
});

function gatewayFallback(kind) {
  const root = new THREE.Group();
  const pale = new THREE.MeshStandardMaterial({ color: kind === 'workshop' ? 0xe7e2d6 : 0xf1e5e0, roughness: .72, metalness: .08 });
  const graphite = new THREE.MeshStandardMaterial({ color: 0x26323a, roughness: .4, metalness: .58 });
  const jade = new THREE.MeshStandardMaterial({ color: 0x00bda8, emissive: 0x007c70, emissiveIntensity: .65, roughness: .3 });
  const warm = new THREE.MeshStandardMaterial({ color: kind === 'workshop' ? 0xf08a4b : 0xe77879, emissive: kind === 'workshop' ? 0x8a3517 : 0x8e293d, emissiveIntensity: .45, roughness: .35 });
  const add = (geo, mat, x, y, z, sy=1) => { const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.scale.y=sy;m.castShadow=true;m.receiveShadow=true;root.add(m);return m; };
  add(new THREE.CylinderGeometry(13, 14, 1.2, 8), graphite, 0,.6,0);
  if (kind === 'workshop') {
    // A public maker hall: three readable bays = input → core → output.
    [-7,0,7].forEach((x,i) => { add(new THREE.BoxGeometry(5.7, 8 + i*1.3, 8), pale, x, 4 + i*.65, 0); add(new THREE.BoxGeometry(4.8,.22,7.1), i===1?jade:warm,x,8.2+i*1.3,0); });
    for (let i=-2;i<=2;i++) { const rib=add(new THREE.BoxGeometry(.45,12,10),graphite,i*4.8,7,0); rib.rotation.z=(i===0?0:i*.08); }
    add(new THREE.BoxGeometry(20,.35,1.1), jade, 0,3.1,4.55); // welcoming entry line
  } else {
    // A fitting pavilion: circular working plinth, part bays and a ribbon roof.
    add(new THREE.CylinderGeometry(6.2,6.2,.8,32), pale, 0,1.3,0);
    add(new THREE.CylinderGeometry(4.4,4.4,.18,32), jade, 0,1.8,0);
    for (let i=0;i<5;i++) { const a=i*Math.PI*2/5; add(new THREE.BoxGeometry(3.1,5.5,1.4), pale, Math.cos(a)*9,3.3,Math.sin(a)*9); }
    for (let i=0;i<3;i++) { const arc=add(new THREE.TorusGeometry(9+i*.8,.28,8,32,Math.PI*1.35), i===1?warm:graphite,0,8+i*.55,0);arc.rotation.x=Math.PI/2;arc.rotation.z=-.65; }
  }
  const socket = add(new THREE.BoxGeometry(3.4,2.4,.45), pale, 0,2.4,13.2);
  socket.userData.gatewaySocket = true;
  const lamp = add(new THREE.CylinderGeometry(.35,.35,.16,16), jade, 0,3.2,13.5); lamp.rotation.x=Math.PI/2;
  lamp.userData.gatewaySocket = true;
  root.name = `passiona-${kind}-gateway-fallback`;
  return root;
}

/** Fit an appearance-only GLB to the protected civic lot. The supplied model
 * stays uniform, centred and grounded; interaction remains on the fixed City
 * hit target so it cannot shift while this asynchronous swap completes. */
function normalizeGatewayAppearance(model, footprint) {
  model.updateMatrixWorld(true);
  const before = new THREE.Box3().setFromObject(model);
  const size = before.getSize(new THREE.Vector3());
  const scale = Math.min(footprint[0] / Math.max(.001, size.x), footprint[1] / Math.max(.001, size.z));
  model.scale.multiplyScalar(scale);
  model.updateMatrixWorld(true);
  const fitted = new THREE.Box3().setFromObject(model);
  const centre = fitted.getCenter(new THREE.Vector3());
  model.position.x -= centre.x;
  model.position.y -= fitted.min.y;
  model.position.z -= centre.z;
  model.updateMatrixWorld(true);
  model.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = !LOW_END;
    node.receiveShadow = true;
  });
  return model;
}

function loadGatewayAppearance(spec, mount, fallback, state, gen, queue) {
  const run = () => createGLTFLoader().loadAsync(spec.model.file);
  state.status = 'loading';
  const request = queue ? queue.add(run, { onStale: disposeDetachedModel }) : run();
  return request.then((gltf) => {
    if (!gltf) return;
    if (gen !== _bootGen || !mount.parent) { disposeDetachedModel(gltf); return; }
    const model = normalizeGatewayAppearance(gltf.scene, spec.model.footprint);
    model.name = `passiona-${spec.id}-gateway-model`;
    model.userData.gatewayAppearance = spec.id;
    mount.add(model);
    // The socket is City-owned and stays visible; only the procedural building
    // body gives way once the decoded model is safely mounted.
    for (const child of fallback.children) child.visible = !!child.userData.gatewaySocket;
    state.status = 'loaded';
    state.model = model;
  }).catch((error) => {
    state.status = 'fallback';
    state.reason = error?.message || String(error);
    console.warn(`[gateway:${spec.id}] flagship GLB unavailable — keeping procedural fallback`, error);
  });
}

function gatewayMarker(kind) {
  const root = new THREE.Group();
  root.name = `passiona-${kind}-gateway-marker`;
  const color = kind === 'workshop' ? 0xffa559 : 0x5fe2d0;
  const material = new THREE.MeshBasicMaterial({ color, transparent:true, opacity:.6, depthWrite:false });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.42,.42,45,8), material);
  shaft.position.y = 35; root.add(shaft);
  const crown = new THREE.Mesh(new THREE.TorusGeometry(4.8,.7,8,24), material);
  crown.rotation.x = Math.PI / 2; crown.position.y = 57; root.add(crown);
  const base = new THREE.Mesh(new THREE.TorusGeometry(15,.55,8,36), material);
  base.rotation.x = Math.PI / 2; base.position.y = 1; root.add(base);
  return root;
}

function buildCityGateways(gen = _bootGen, queue = null) {
  cityGatewayGroup?.removeFromParent();
  cityGatewayGroup = new THREE.Group(); cityGatewayGroup.name = 'permanent-learning-gateways'; scene.add(cityGatewayGroup);
  specialSystem ||= { beacon:null, beaconPositions:[], questRefs:[] };
  const returnTo = new URL(window.location.href); returnTo.searchParams.delete('studioTransfer');
  const specs = [
    { id:'workshop', emoji:'⚙️', en:'AI Workshop', zh:'AI 工坊', model:GATEWAY_MODELS.workshop, url: (()=>{ const u=new URL(WORKSHOP_URL);u.searchParams.set('returnTo',returnTo.href);return u.href; })() },
    { id:'studio', emoji:'✦', en:'Fit Studio', zh:'造型工作室', model:GATEWAY_MODELS.studio, url: new URL(`../studio/?returnTo=${encodeURIComponent(returnTo.href)}`, window.location.href).href },
  ];
  city.gateways = {};
  const positions = gatewayPositions(layout);
  return specs.map((spec,i)=>{
    const p=positions[i], mount=new THREE.Group(), fallback=gatewayFallback(spec.id);
    mount.name=`passiona-${spec.id}-gateway`;mount.position.set(p.x,0,p.z);mount.userData={kind:'gateway-mount',gateway:spec.id,protected:true};
    mount.add(fallback);mount.add(gatewayMarker(spec.id));cityGatewayGroup.add(mount);
    addBuildingLabel(spec.zh,spec.en,p.x,64,p.z,spec.id);
    const q={ type:'gateway', gateway:spec.id, pos:[p.x,p.z], labelZh:spec.zh, labelEn:spec.en, enterZh:`進入${spec.zh}`, enterEn:`Enter ${spec.en}`, directUrl:spec.url };
    specialSystem.questRefs.push({q,cx:p.x,cz:p.z,top:14});
    const hit=new THREE.Mesh(new THREE.CylinderGeometry(14,14,18,10),new THREE.MeshBasicMaterial({transparent:true,opacity:0,colorWrite:false,depthWrite:false}));
    hit.position.set(p.x,9,p.z);hit.userData={kind:'gateway', quest:q};scene.add(hit);interactMeshes.push(hit);
    const state={id:spec.id,status:'placeholder',mount,fallback,model:null,hit,quest:q,position:{x:p.x,z:p.z},footprint:[...spec.model.footprint]};
    city.gateways[spec.id]=state;
    return loadGatewayAppearance(spec,mount,fallback,state,gen,queue);
  });
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
  housing: '../library/buildings/kenney-suburban-a.glb',
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
// Residential variations — each ordinary housing spot renders as a 2×2 block
// of units; all ten compatible CC0 Kenney houses are selected by location.
// The full catalogue remains available on demand in the student picker.
const HOUSING_VARIANTS = ['a','b','c','d','e','f','g','h','i','j'].map(c=>`../library/buildings/kenney-suburban-${c}.glb`);
// Facilities that share the generic model until they get their own GLB.
// Plain facilities without a dedicated GLB — these fall back to the shared
// generic model. Every generic facility has its own CC0 GLB now, so this list
// is empty.
const GENERIC_FACILITY_TYPES = [];
// Mission buildings that use the industrial GLB instead of a procedural design.
// (Legacy — all 18 mission buildings now map via SPECIAL_BUILDING_MODELS.)
const INDUSTRIAL_SPECIALS = [];
const glbState = {};   // type → { model, size, spots:[], fallbacks:[], loading, status, reason }

function ensureGlbState(type) {
  return glbState[type] || (glbState[type] = {
    model: null, size: null, spots: [], fallbacks: [], applied: [], loading: false,
    status: 'idle', reason: null, sourceKey: null,
  });
}

function recordBuildingDiagnostic(type, state = ensureGlbState(type)) {
  if (!city?.loading?.assets?.buildings) return;
  const entries = city.loading.assets.buildings;
  if (!Object.hasOwn(entries, type) && Object.keys(entries).length >= 64) return;
  entries[type] = { state: state.status || 'idle', reason: state.reason || null, instances: state.applied?.length || 0 };
}

function disposeDetachedModel(value) {
  const root = value?.scene || value?.scenes?.[0] || value;
  value?.geometry?.dispose?.();
  const directMaterials = Array.isArray(value?.material) ? value.material : [value?.material];
  for (const material of directMaterials) material?.dispose?.();
  root?.traverse?.((node) => {
    node.geometry?.dispose?.();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) material?.dispose?.();
  });
}

function buildingLoadPriority(spots = []) {
  const spawn = city?.spawnWorld || findSpawn();
  const origin = spawn || { x: 0, z: 0 };
  const distance = spots.reduce((best, spot) => Math.min(best, Math.hypot(spot.x - origin.x, spot.z - origin.z)), Infinity);
  return Number.isFinite(distance) ? 100000 - distance : 0;
}

const FALLBACK_BOX_GEOMETRY = new THREE.BoxGeometry(1, 1, 1);

function addBuildingPlot(type, cx, cz, fp, requestedHeight) {
  const state = ensureGlbState(type);
  const height = Math.max(8, Math.min(90, requestedHeight || Math.max(fp[0], fp[1]) * .8));
  const palette = [0xc7775f, 0xd9b96d, 0x6e9fa1, 0x9a8bb2, 0x86a879, 0xb48a6a];
  const tone = palette[hashString(`${type}|${cx}|${cz}`) % palette.length];
  const width = Math.max(2, fp[0] - 1), depth = Math.max(2, fp[1] - 1);
  const root = new THREE.Group();
  root.name = `building-fallback-${type}`;
  root.position.set(cx, 0, cz);
  const mesh = new THREE.Mesh(
    FALLBACK_BOX_GEOMETRY,
    new THREE.MeshStandardMaterial({ color: tone, roughness: .82, metalness: .04 })
  );
  mesh.scale.set(width, height, depth);
  mesh.position.y = height / 2;
  const windowMaterial = new THREE.MeshStandardMaterial({ color: 0x344a56, roughness: .45 });
  const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x464c4b, roughness: .9 });
  const roof = new THREE.Mesh(FALLBACK_BOX_GEOMETRY, roofMaterial);
  roof.scale.set(width + .4, .6, depth + .4);
  roof.position.y = height + .3;
  root.add(roof);
  const rows = height > 28 ? 2 : 1;
  for (let row = 0; row < rows; row++) {
    const y = (row + 1) * height / (rows + 1);
    const band = new THREE.Mesh(FALLBACK_BOX_GEOMETRY, windowMaterial);
    band.scale.set(width * .72, 1.2, .12);
    band.position.set(0, y, depth / 2 + .08);
    root.add(band);
  }
  mesh.name = `building-fallback-${type}`;
  mesh.userData.kind = 'building-fallback';
  mesh.castShadow = !IS_WEBKIT;
  mesh.receiveShadow = true;
  root.add(mesh);
  scene.add(root);
  state.fallbacks.push(root);
  return root;
}

function clearBuildingPlots(state) {
  for (const root of state.fallbacks) {
    root.removeFromParent();
    root.traverse(node => {
      if (node.geometry !== FALLBACK_BOX_GEOMETRY) node.geometry?.dispose?.();
      node.material?.dispose?.();
    });
  }
  state.fallbacks.length = 0;
}

function showUnavailableBuilding(type) {
  const state = ensureGlbState(type);
  for (const spot of state.spots) {
    if (!spot.label?.element) continue;
    if (!spot.label.element.textContent.includes('Model unavailable')) spot.label.element.textContent += ' · Model unavailable';
    spot.label.element.classList.add('model-unavailable');
  }
}

// Housing variants loader: every residential model shares the same base unit
// scale (Kenney suburban buildings are ~1.3m units), so we load them into a
// common pool keyed by URL. `glbState.housing` keeps the ORIGINAL model for
// the fallback, and this pool provides the per-unit variation.
const housingVariantModels = [];   // [{ model, size }] loaded in order
let housingVariantsLoaded = false;

function loadHousingVariants(gen, queue) {
  if (housingVariantsLoaded) return;
  housingVariantsLoaded = true;
  const loader = createGLTFLoader();
  Promise.all(HOUSING_VARIANTS.map(url=>queue.add(()=>loader.loadAsync(url), { onStale: disposeDetachedModel }).catch(e=>{console.warn('[housing variant]',url,e);return null;}))).then(gltfs=>{
    if(gen!==_bootGen){housingVariantsLoaded=false;for(const gltf of gltfs)disposeDetachedModel(gltf);return;}
    housingVariantModels.length=0;
    for(const gltf of gltfs){if(!gltf)continue;const m=new THREE.Group();m.add(gltf.scene);const box=new THREE.Box3().setFromObject(m),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());gltf.scene.position.x-=center.x;gltf.scene.position.z-=center.z;gltf.scene.position.y-=box.min.y;prepareBuildingMaterials(m, !(_exampleSession && IS_WEBKIT));housingVariantModels.push({model:m,size});}
    applyBuildingModel('housing');
  }).catch(e => console.warn('[city-builder] housing variants unavailable', e));
}

const officeVariantModels=[];
let officeVariantsLoaded=false;
const hunyuanVariantModels = Object.create(null);
let hunyuanVariantsLoaded = false;
let hunyuanSelection = selectHunyuanBuildingVariants(null);
function loadOfficeVariants(gen,queue){if(officeVariantsLoaded)return;officeVariantsLoaded=true;
 Promise.all(['a','b','c'].map(c=>queue.add(()=>createGLTFLoader().loadAsync(`../library/buildings/kenney-skyscraper-${c}.glb`), { onStale: disposeDetachedModel }).catch(()=>null))).then(gltfs=>{
  if(gen!==_bootGen){officeVariantsLoaded=false;for(const gltf of gltfs)disposeDetachedModel(gltf);return;}
  for(const g of gltfs){if(!g)continue;const m=new THREE.Group();m.add(g.scene);const box=new THREE.Box3().setFromObject(m),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());g.scene.position.x-=center.x;g.scene.position.z-=center.z;g.scene.position.y-=box.min.y;prepareBuildingMaterials(m, !(_exampleSession && IS_WEBKIT));officeVariantModels.push({model:m,size});}applyBuildingModel('office');
 }).catch(e => console.warn('[city-builder] office variants unavailable', e));
}

function normalizedBuildingModel(gltf) {
  const model = new THREE.Group(); model.add(gltf.scene);
  const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  gltf.scene.position.x -= center.x; gltf.scene.position.z -= center.z; gltf.scene.position.y -= box.min.y;
  prepareBuildingMaterials(model, !(_exampleSession && IS_WEBKIT)); return { model, size };
}
function loadHunyuanBuildingVariants(gen, queue) {
  if (hunyuanVariantsLoaded) return;
  hunyuanVariantsLoaded = true;
  const entries = Object.values(HUNYUAN_IDS).filter((id) => id !== HUNYUAN_IDS.emeraldRainTree);
  Promise.all(entries.map((id) => queue.add(() => createGLTFLoader().loadAsync(libraryItem(id).glb), { onStale: disposeDetachedModel })
    .then((gltf) => [id, normalizedBuildingModel(gltf)]).catch((error) => { console.warn('[hunyuan variant]', id, error); return [id, null]; })))
    .then((models) => {
      if (gen !== _bootGen) { hunyuanVariantsLoaded = false; return; }
      for (const [id, value] of models) hunyuanVariantModels[id] = value;
      for (const type of ['housing', 'shop', 'office', 'school', 'library']) if (glbState[type]?.spots.length) applyBuildingModel(type);
    }).catch((error) => console.warn('[city-builder] optional building variants unavailable', error));
}

// A single rare landmark, deliberately separate from street-tree and ordinary
// park vegetation pools. Its visibility follows the saved prop records, so a
// child's centred exhibit always gets the stage without mutating their layout.
function mountEmeraldRainTree(gen, queue) {
  const group = new THREE.Group(); group.name = 'Emerald Rain Tree landmark'; scene.add(group);
  let model = null, disposed = false;
  const refresh = (records = []) => {
    const placement = emeraldRainTreePlacement(layout, records, (id) => libraryItem(id));
    group.visible = !!placement && !!model;
    if (placement && model) group.position.set(placement.x, 0, placement.z);
  };
  const item = libraryItem(HUNYUAN_IDS.emeraldRainTree);
  queue.add(() => createGLTFLoader().loadAsync(item.glb), { onStale: disposeDetachedModel }).then((gltf) => {
    if (disposed || gen !== _bootGen) { disposeDetachedModel(gltf); return; }
    model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    model.position.set(-center.x, -box.min.y, -center.z);
    const scale = EMERALD_RAIN_TREE_CANOPY_METRES / Math.max(size.x, size.z, 1);
    model.scale.setScalar(scale); model.traverse((node) => { if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; } });
    group.add(model); refresh(propLibrary?.getRecords?.() || []);
  }).catch((error) => console.warn('[emerald-rain-tree] unavailable', error));
  return { refresh, destroy() { disposed = true; group.removeFromParent(); } };
}

function loadBuildingModel(type, url, gen = _bootGen, queue = null) {
  const st = ensureGlbState(type);
  if (st.sourceKey && st.sourceKey !== url) { st.model = null; st.size = null; }
  if(st.model){st.status='loaded';st.reason=null;if(gen===_bootGen)applyBuildingModel(type);recordBuildingDiagnostic(type,st);return Promise.resolve(st.model);}
  if (st.loading) return Promise.resolve(st.loading).then((value) => {
    if (value && gen === _bootGen) applyBuildingModel(type);
    return value;
  });
  const run = () => createGLTFLoader().loadAsync(url);
  st.loading = true; st.status = 'loading'; st.reason = null; recordBuildingDiagnostic(type, st);
  const promise = (queue ? queue.add(run, { priority: buildingLoadPriority(st.spots), onStale: disposeDetachedModel }) : run())
    .then((gltf) => {
      if (!gltf) return null;
      if (gen !== _bootGen) { disposeDetachedModel(gltf); return null; }
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
      if(GLB_BUILDING_TYPES[type] || SPECIAL_BUILDING_MODELS[type] || libraryItem(type)?.category==='buildings')prepareBuildingMaterials(m, !(_exampleSession && IS_WEBKIT));
      st.model = m; st.size = size; st.sourceKey = url; st.status = 'loaded'; st.reason = null;
      st.loading = false;
      if(gen===_bootGen)applyBuildingModel(type);
      recordBuildingDiagnostic(type, st);
      return m;
    })
    .catch((e) => {
      console.warn(`[${type}] GLB load failed`, e);
      st.model = null;
      st.status = 'failed'; st.reason = (e?.name || 'load-error').slice(0, 48);
      recordBuildingDiagnostic(type, st);
      if (gen === _bootGen) showUnavailableBuilding(type);
      st.loading = false;   // allow a later retry (e.g. re-boot)
      return null;
    });
  st.loading = promise;
  return promise;
}

// Student files stay in IndexedDB; only their chosen role is in localStorage.
// Missing IndexedDB models remain visible as an unavailable state on this device.
function loadCustomBuildingModel(type, customId, gen = _bootGen, queue = null) {
  const st = ensureGlbState(type);
  const sourceKey = `custom:${customId}`;
  if (st.sourceKey && st.sourceKey !== sourceKey) { st.model = null; st.size = null; }
  if (st.model || st.loading) return Promise.resolve(st.model || st.loading);
  const run = async () => {
    const saved = await customModelStore.get(customId);
    if (!saved?.bytes) throw new Error('model is not on this device');
    return new Promise((resolve, reject) => createGLTFLoader().parse(saved.bytes.slice(0), '', resolve, reject));
  };
  st.status = 'loading'; st.reason = null;recordBuildingDiagnostic(type,st);
  st.loading = (queue ? queue.add(run, { priority: buildingLoadPriority(st.spots), onStale: disposeDetachedModel }) : run()).then((gltf) => {
    if (!gltf) return null;
    if (gen !== _bootGen) { disposeDetachedModel(gltf); return null; }
    const m = gltf.scene || gltf.scenes?.[0];
    if (!m || !m.getObjectByProperty('isMesh', true)) throw new Error('no renderable mesh');
    const box=new THREE.Box3().setFromObject(m), size=box.getSize(new THREE.Vector3()), center=box.getCenter(new THREE.Vector3());
    m.position.x-=center.x; m.position.z-=center.z;
    m.traverse(o=>{ if(o.isMesh&&o.geometry)o.geometry.translate(0,-box.min.y,0); });
    prepareBuildingMaterials(m, !(_exampleSession && IS_WEBKIT)); st.model=m; st.size=size; st.sourceKey=sourceKey; st.loading=false;st.status='loaded';st.reason=null;
    if(gen===_bootGen)applyBuildingModel(type);recordBuildingDiagnostic(type,st); return m;
  }).catch((e) => { console.warn(`[${type}] custom GLB unavailable`,e); st.loading=false;st.status='failed';st.reason=(e?.name||'custom-load-error').slice(0,48);recordBuildingDiagnostic(type,st); if(gen===_bootGen){showUnavailableBuilding(type);showToast('Re-add this building GLB to use its custom look.');} return null; });
  return st.loading;
}

function refreshSpecialBeacons() {
  if (!specialSystem?.beacon || !specialSystem.beaconPositions) return;
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 4, .6));
  const scale = new THREE.Vector3(1, 1, 1);
  specialSystem.beaconPositions.forEach((beacon, index) => {
    matrix.compose(position.set(beacon.x, beacon.y, beacon.z), rotation, scale);
    specialSystem.beacon.setMatrixAt(index, matrix);
  });
  specialSystem.beacon.instanceMatrix.needsUpdate = true;
}

function applyRenderedBuildingBounds(spot, bounds) {
  const height = Number(bounds?.height);
  if (!(height > 0)) return;
  spot.renderedBounds = bounds;
  if (spot.label) spot.label.position.y = height + 6;
  if (spot.beacon) {
    spot.beacon.anchor = height;
    spot.beacon.y = height + 6;
  }
  if (spot.questRef) {
    spot.questRef.top = height;
    if (spot.questRef.hit) spot.questRef.hit.position.y = Math.max(12, height / 2);
  }
}

function recordBuildingScale(type, spot, scale, bounds) {
  if (!city) return;
  city.buildingScaleDiagnostics ||= {};
  (city.buildingScaleDiagnostics[type] ||= []).push({
    x: spot.x, z: spot.z, scale, bounds: { ...bounds }, uniform: true,
  });
}

function applyBuildingModel(type) {
  const st = glbState[type];
  if (!st || !st.model) return;
  if (city?.buildingScaleDiagnostics) city.buildingScaleDiagnostics[type] = [];
  // Remove the procedural fallback meshes…
  clearBuildingPlots(st);
  // …and any GLB clones applied by an earlier pass (variants load async, so
  // re-applying must not stack duplicates). Clones share geometry/material with
  // the cached source model (clone(true)) — do NOT dispose them here, or the
  // shared buffers are destroyed and every later clone renders black/broken.
  for (const clone of st.applied || []) {
    scene.remove(clone);clone.traverse(o=>{if(o.isInstancedMesh)o.dispose();});
  }
  st.applied = [];
  // …and place a GLB clone on every spot (geometry shared, cheap).
  for (const spot of st.spots) {
    if (spot.label) spot.label.position.y = (spot.h || 2) + 6;
    // Housing renders as a 2×2 block of four smaller units inside the same
    // footprint — one map icon = one residential block, not one tower. Each
    // unit picks a deterministic variant from the Kenney suburban pool when any have
    // loaded, so a neighbourhood looks varied; otherwise the base housing model.
    if (type === 'housing') {
      const wave2 = spot.variant && hunyuanVariantModels[spot.variant];
      if (wave2) {
        const clone = wave2.model.clone(true);
        const s = uniformScaleForBounds(wave2.size, { width: spot.fp[0], depth: spot.fp[1], height: spot.h || 24 });
        clone.scale.setScalar(s); clone.position.set(spot.x, 0, spot.z);
        const bounds = scaledBounds(wave2.size, s);
        applyRenderedBuildingBounds(spot, bounds);
        recordBuildingScale(type, spot, s, bounds);
        clone.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        scene.add(clone); st.applied.push(clone); continue;
      }
      const unit = spot.fp[0] / 2 - 1;   // half the footprint minus a tiny gap
      const variants = housingVariantModels.length ? housingVariantModels : [{ model: st.model, size: st.size }];
      let renderedHeight = 0;
      for (const [dx, dz] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) {
        const v = variants[hashString(`${spot.x}|${spot.z}|${dx}|${dz}`) % variants.length];
        const s = uniformScaleForBounds(v.size, {
          width: unit, depth: spot.fp[1] / 2 - 1, height: spot.h || 24,
        });
        const clone = v.model.clone(true);
        clone.scale.setScalar(s);
        renderedHeight = Math.max(renderedHeight, v.size.y * s);
        clone.position.set(spot.x + dx * spot.fp[0], 0, spot.z + dz * spot.fp[1]);
        clone.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        scene.add(clone);
        st.applied.push(clone);
      }
      applyRenderedBuildingBounds(spot, { width: spot.fp[0], depth: spot.fp[1], height: renderedHeight });
      recordBuildingScale(type, spot, null, { width: spot.fp[0], depth: spot.fp[1], height: renderedHeight });
      continue;
    }
    const source = spot.variant && hunyuanVariantModels[spot.variant] ? hunyuanVariantModels[spot.variant]
      : type==='office' && officeVariantModels.length ? officeVariantModels[hashString(`${spot.x}|${spot.z}`)%officeVariantModels.length] : st;
    const clone = source.model.clone(true);
    // A door, window, and storey must keep the same proportions in every role.
    // The planner footprint is a containing plot, never a licence to stretch a
    // GLB independently on X/Y/Z.
    const s = uniformScaleForBounds(source.size, {
      width: spot.fp[0], depth: spot.fp[1], height: spot.h || 24,
    });
    clone.scale.setScalar(s);
    const bounds = scaledBounds(source.size, s);
    applyRenderedBuildingBounds(spot, bounds);
    recordBuildingScale(type, spot, s, bounds);
    clone.position.set(spot.x, 0, spot.z);
    clone.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(clone);
    st.applied.push(clone);
  }
  refreshSpecialBeacons();
  if(type==='housing' || type==='office'){const batch=batchBuildings(st.applied);scene.add(batch);st.applied=[batch];}
}

function buildGenericFacilities() {
  const libIdsToLoad = new Set();
  hunyuanSelection = selectHunyuanBuildingVariants(layout);
  for (const b of layout.buildings) {
    if (isSpecial(b.type)) continue;
    const isLib = b.type.startsWith('lib:');
    const spec = isLib ? libraryItem(b.type.slice(4)) : catalogType(b.type);
    if (!spec) continue;
    const cx = b.pos[0];
    const cz = b.pos[1];
    const fp = b.footprint || spec.footprint || [20, 20];
    // The planner's declared metres are authoritative. Model fitting below is
    // uniform, so a role never becomes taller by stretching its windows.
    const h = Math.min(220, Math.max(8, b.height || spec.height || 20));

    // Shared-library models (nature / props / vehicles / themed) render via
    // their library GLB scaled to the footprint; a plain box stands in while
    // the GLB loads (and as a fallback if it fails).
    if (isLib) {
      const libId = b.type.slice(4);
      const state = ensureGlbState(libId);
      libIdsToLoad.add(libId);
      addBuildingPlot(libId, cx, cz, fp, spec.height || h);
      let label = null;
      if (labelRenderer) {
        const el = document.createElement('div');
        el.className = 'building-label';
        el.dataset.displayType = b.type;
        el.textContent = displayName(b.type,currentLang());
        label = new CSS2DObject(el);
        label.position.set(cx, 3, cz);
        scene.add(label);
        buildingLabels.push(label);
      }
      state.spots.push({ x: cx, z: cz, fp, h: spec.height || 2, glbType: libId, label });
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
        el.dataset.displayType = b.type;
        el.textContent = displayName(b.type,currentLang());
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
    if (glbType) {
      const state = ensureGlbState(glbType);
      addBuildingPlot(glbType, cx, cz, fp, h);
      let label = null;
      if (labelRenderer) {
        const el = document.createElement('div');
        el.className = 'building-label';
        el.dataset.displayType = b.type;
        el.textContent = displayName(b.type,currentLang());
        label = new CSS2DObject(el);
        label.position.set(cx, 3, cz);
        scene.add(label);
        buildingLabels.push(label);
      }
      const variant = hunyuanSelection.variantFor([cx, cz]);
      state.spots.push({ x: cx, z: cz, fp, h, glbType, label, variant });
      continue;
    }

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
      mesh.material.userData.timeWindow=true;
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
      el.dataset.displayType = b.type;
        el.textContent = displayName(b.type,currentLang());
      const label = new CSS2DObject(el);
      label.position.set(cx, h + 6, cz);
      scene.add(label);
      buildingLabels.push(label);
    }
  }

  // Load the shared-library GLBs used by this city (each loads once, shared).
  return libIdsToLoad;
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

function loadParkedVehicleModel(key, gen = _bootGen, queue = null) {
  const cfg = PARKED_VEHICLES[key];
  if (!cfg || _parkedVehicleState.models[key] || _parkedVehicleState.loading.has(key)) return;
  _parkedVehicleState.loading.add(key);
  const run=()=>createGLTFLoader().loadAsync(cfg.file);
  (queue?queue.add(run,{onStale:disposeDetachedModel}):run())
    .then((gltf) => {
      if(!gltf)return;
      if(gen!==_bootGen){disposeDetachedModel(gltf);_parkedVehicleState.loading.delete(key);return;}
      _parkedVehicleState.models[key] = gltf.scene;
      _parkedVehicleState.loading.delete(key);
      if(gen===_bootGen)placeParkedVehicles();
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
//   asphalt   +0.12   when inside a road's carriageway (|d| ≤ half width)
//   sidewalk  +0.02   when within the flat sidewalk ribbon beyond the road edge
//   bare      −0.10   everywhere else (the ground plane top)
// These must match the road FX + ground Y values that the meshes actually sit
// at (ROAD_FX.asphY / swY and the ground plane at −0.1), so the champion's feet
// land ON the surface the eye sees.
function groundHeightAt(x, z) {
  const BARE = -0.10;
  const SIDEWALK = ROAD_FX.swY;      // +0.02
  const ASPHALT = ROAD_FX.asphY;     // +0.12
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
  for(const space of neighbourhood?.spaces || []) {
    if(Math.hypot(x-space.x,z-space.z)<space.radius-1.1)return -.05;
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
      // Keep a compact collider beside the rendered model. The dimensions are
      // measured after the same normalisation scale used for the visible car.
      clone.userData.groundVehicleCollider = { width: sx * s, length: sz * s };
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
  for(const placement of createParkVegetation(layout,{mobile:IS_MOBILE}))addNatureFiller(placement);
}

function carveRoads() {
  buildRoadsInto(scene, layout.roads, {});
  scatterStreetTrees();
}

// Scatter trees along both sides of every road (street trees), offset from the
// centreline so they do not sit on the carriageway. Uses loaded tree variants.
function scatterStreetTrees() {
  // Street trees queue regardless of whether the GLBs have loaded yet — the
  // deferred pass flushes them once _treeVariants exists.
  // Intersections are shared with the traffic graph. A tree must clear both
  // the junction mouth and every other road ribbon, not merely its own road.
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
          const tx = x + nx * off, tz = z + nz * off;
          addTree(tx, tz, 0.9 + ((hashString(i * 5 + k * 3) % 10) / 10) * 0.5);
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
// drive), and outside every park (parks carry trees and student decorations — a
// spawn inside the grass could put the champion inside a trunk or placed model). Roads are
// stored as centreline polylines, so we clear the centreline by width/2 +
// SPAWN_ROAD_CLEAR.
const SPAWN_CLEAR = 30;
const SPAWN_ROAD_CLEAR = 5;
const SPAWN_PARK_CLEAR = 4;
function findSpawn() {
  const SCALE = (layout && layout.scaleMeters) || 2000;
  const focus = cityFocusBounds || occupiedBounds(layout || { scaleMeters: SCALE }, { pad: 0 });
  let cx = (focus.minX + focus.maxX) / 2, cz = (focus.minZ + focus.maxZ) / 2;
  // A bounding-box centre can be an empty crossroads between four populated
  // districts. Use the occupied medoid for the walking spawn: it is guaranteed
  // to belong to a real cluster while remaining deterministic.
  const occupied = (layout.buildings || []).map((b) => b.pos);
  if (occupied.length) {
    const medoid = occupied.slice().sort((a, b) => {
      const da = occupied.reduce((sum, p) => sum + Math.hypot(a[0] - p[0], a[1] - p[1]), 0);
      const db = occupied.reduce((sum, p) => sum + Math.hypot(b[0] - p[0], b[1] - p[1]), 0);
      return da - db || a[0] - b[0] || a[1] - b[1];
    })[0];
    cx = medoid[0]; cz = medoid[1];
  }
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

async function spawnChampion(isCurrent = () => true) {
  const spawn = findSpawn();
  city.spawnWorld = new THREE.Vector3(spawn.x, 0, spawn.z);
  try {
    champion = await createChampion(ASSET_BASE, city, {
      targetHeight: CITY_CHAMPION_HEIGHT,
      // Start with the uploaded fitted champion (if any) instead of the bunny.
      initialSkin: _customSkinUrl,
      initialSkinId: '__custom__',
      onChampionWarning: message => showToast(`Champion: ${message}`),
    });
  } catch (e) {
    // Champion GLB failed to load — the city still renders; run without one
    // rather than failing the whole boot.
    console.warn('[city-builder] champion load failed — running without champion', e);
    champion = null;
    return;
  }
  // A deadline/retry may have replaced this boot while the GLB was decoding.
  // Never let that late result attach itself to the newer scene.
  if (!isCurrent()) { champion = null; return; }
  city.champion = champion;     // debug/consumption handle (minimap/buddy/tests)
  updateChampionActionTray();
  champion.addSkinListener?.(updateChampionActionTray);
  // Grow the champion with the densified buildings so proportions stay right.
  if (growScale && growScale !== 1) champion.group.scale.multiplyScalar(growScale);
  scene.add(champion.group);
  // Plant the champion on the spawn surface immediately (spawn may sit on a
  // raised plaza/sidewalk) so the first rendered frame is never a hover.
  if (champion.landAt) champion.landAt(spawn.x, spawn.z);
  const focus = cityFocusBounds || occupiedBounds(layout, { pad: 0 });
  orbit.target.set((focus.minX + focus.maxX) / 2, 0, (focus.minZ + focus.maxZ) / 2);
  orbit.dist = orbit.distOverview;
  orbit.introUntil = performance.now() + (_exampleSession ? 3000 : 15000);
  // Start the idle-camera timer from spawn so the camera doesn't snap on boot.
  orbit.lastOrbitTs = performance.now();

  // Soft blob shadow keeps the champion visually grounded on ALL tiers. The
  // realtime PCF map (high tier) is mushy at ~3 cm/texel on a 4 m character, so
  // the blob is the crisp contact cue everywhere; on high tier it is lighter so
  // it doesn't double-darken with the real shadow.
  {
    championShadow = new THREE.Mesh(
      new THREE.CircleGeometry(.75, 24),
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

  // Orientation ring — marks the nearest enterable gateway. Colour scaled above the 0.68 bloom
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
    // Retain the existing Buddy API name for the nearby gateway command.
    questHasGame(type) { return questHasGameForType(type); },
    walkTo(building) {
      if (!champion || !building || (taxi && taxi.isActive())) return;
      // Get out of the car before auto-walking.
      if (drivingCar && drivingCar.isActive()) { drivingCar.exit(); updateDriveButtons(); }
      taxiNav = null;
      const index = (layout.buildings || []).indexOf(building);
      if (!beginWalkNavigation({ x: building.pos[0], z: building.pos[1] },
        index >= 0 ? `building:${index}` : null, buildingName(building))) return false;
      showToast(tf('toast.walking', { name: buildingName(building) }));
      return true;
    },
    flyTo(building) {
      if (!champion || !building || !taxi) return;
      // Get out of the car before flying.
      if (drivingCar && drivingCar.isActive()) { drivingCar.exit(); updateDriveButtons(); }
      walkNav = null;
      if (!taxi.isActive()) taxi.board(champion);
      const h = building.height || 30;
      taxiNav = { x: building.pos[0], z: building.pos[1], y: h + 14 };
      taxi.setAutoNav(true);
      updateFlyButtons();
      showToast(tf('toast.flying', { name: buildingName(building) }));
      return true;
    },
    // Buddy's /enter follows the same gateway-only path as the floating prompt.
    enterNearQuest() {
      const quest = this.nearQuest;
      if (!quest?.directUrl) return { ok: false, note: 'Walk up to AI Workshop or Fit Studio to enter.' };
      location.assign(quest.directUrl);
      return { ok: true, note: `Entering ${quest.labelEn}` };
    },
  };
}

function updateChampionActionTray() {
  const tray = document.querySelector('#actions-tray > div');
  if (!tray) return;
  tray.querySelectorAll('[data-champion-extra]').forEach(button => button.remove());
  for (const name of champion?.extraActions?.() || []) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'action-btn';
    button.dataset.championExtra = name; button.textContent = name;
    button.addEventListener('click', () => champion?.playExtraAction?.(name));
    tray.append(button);
  }
}

function walkNavigationPlan(target, targetObstacleId = null) {
  if (!champion) return { ok: false, reason: 'unavailable' };
  const scale = Number(layout?.scaleMeters) || 2000;
  return planGroundRoute({
    start: { x: champion.state.pos.x, z: champion.state.pos.z },
    target,
    targetObstacleId,
    obstacles: championStaticObstacles(),
    clearance: CHAMPION_NAV_CLEARANCE,
    bounds: { minX: CHAMPION_NAV_CLEARANCE, minZ: CHAMPION_NAV_CLEARANCE,
      maxX: scale - CHAMPION_NAV_CLEARANCE, maxZ: scale - CHAMPION_NAV_CLEARANCE },
  });
}

function beginWalkNavigation(target, targetObstacleId = null, label = '') {
  const plan = walkNavigationPlan(target, targetObstacleId);
  if (!plan.ok) {
    walkNav = null;
    showToast(t('toast.routeBlocked'));
    return false;
  }
  walkNav = { points: plan.points, index: 0, target: { ...target }, targetObstacleId,
    label, obstacleRevision: navObstacleRevision };
  return true;
}

function replanWalkNavigation() {
  if (!walkNav) return false;
  const previous = walkNav;
  const plan = walkNavigationPlan(previous.target, previous.targetObstacleId);
  if (!plan.ok) {
    walkNav = null;
    showToast(t('toast.routeBlocked'));
    return false;
  }
  walkNav = { ...previous, points: plan.points, index: 0, obstacleRevision: navObstacleRevision };
  return true;
}

function cancelManualNavigation(kind) {
  if (kind === 'taxi') {
    if (!taxiNav) return false;
    taxiNav = null;
    taxi?.setAutoNav(false);
  } else {
    if (!walkNav) return false;
    walkNav = null;
  }
  showToast(t('toast.navigationCancelled'));
  return true;
}

function buildingName(b) {
  const spec = typeSpec(b.type);
  return displayName(b.type,currentLang());
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

function rebuildNeighbourhood(obstacles = []) {
  const previousActors = streetLife?.actors.slice() || [];
  publicSpaces?.destroy(); parkLandscape?.destroy(); streetLife?.destroy();
  // Markings remain visible, but ground residents do not enter carriageways.
  neighbourhood = createNeighbourhood(layout, { mobile: IS_MOBILE, roads: publicRoads,
    crossings: [], obstacles });
  streetLife = createStreetLife(neighbourhood, { mobile: IS_MOBILE, reducedMotion: reducedMotion.matches, previousActors });
  publicSpaces = createPublicSpaces(scene, neighbourhood, {treeVariants: _treeVariants});
  parkLandscape=createParkLandscape(scene,layout,neighbourhood,{mobile:IS_MOBILE});city.parkLandscape=parkLandscape;
  applyGroundTexture(_groundTexture);
  city.neighbourhood = neighbourhood; city.streetLife = streetLife; city.publicSpaces = publicSpaces;
}
function updateNeighbourhoodObstacles(dt) {
  obstacleCheckTime += dt; if(obstacleCheckTime<.75)return; obstacleCheckTime=0;
  const obstacles=[], signature=[];
  for(const mesh of environmentProps) {
    if(!mesh.parent)continue;
    const box=new THREE.Box3().setFromObject(mesh);
    if(!Number.isFinite(box.min.x))continue;
    const rect={x0:box.min.x,x1:box.max.x,z0:box.min.z,z1:box.max.z};
    obstacles.push(rect);signature.push(...Object.values(rect).map(v=>v.toFixed(2)));
  }
  const key=signature.join(',');if(key!==propObstacleSignature){propObstacleSignature=key;rebuildNeighbourhood(obstacles);}
}
function setupRoadTraffic() {
  if (traffic) return traffic;
  try {
    traffic = createTraffic(scene, layout.roads, {
      density: IS_MOBILE ? 0.8 : 1,
      mobile: IS_MOBILE,
      spawn: city.spawnWorld,
      vehicleIds: readTrafficVehicleIds(),
    });
    city.traffic = traffic;
  }
  catch (e) { console.warn('[city-builder] traffic init failed', e); traffic = null; }
  return traffic;
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

  // Road traffic — cars & buses cruising along the student's roads. Its fleet
  // policy uses usable road length with a separate tablet cap; opening cars
  // favour links near the Champion before fanning out across the city.
  setupRoadTraffic();

  // Pedestrians — two instanced populations for the "living city" layer.
  // Only human citizens animate around the city. Robot props/catalogue entries
  // remain placeable; the former sliding ambient robot population is gone.
  rebuildNeighbourhood();
  const crowdGeneration = _bootGen;
  const crowdOpts = { getLife: () => streetLife, camera, mobile: IS_MOBILE, lowEnd: LOW_END,
    groundHeightAt, reducedMotion: () => reducedMotion.matches };
  createPedestrians(scene, layout, { ...crowdOpts, kind: 'human' })
    .then(p => { if(crowdGeneration!==_bootGen){p?.destroy();return;} citizens=p;city.citizens=p; })
    .catch(e => console.warn('[city-builder] citizens init failed', e));

  // Clouds — merged instanced cloud puffs drifting slowly across the sky.
  // Async + graceful: if they fail to load, the city simply has clear skies.
  createClouds(scene, layout, { bounds, camera, mobile:IS_MOBILE, reducedMotion:()=>reducedMotion.matches })
    .then((c) => { if(crowdGeneration!==_bootGen){c?.destroy?.();return;} clouds = c; if (c) city.clouds = c; })
    .catch((e) => console.warn('[city-builder] clouds init failed', e));

  // Expose for the minimap + buddy (read-only consumers)
  city.layout = layout;
  // Champion grounding: analytic surface-height lookup (bare/sidewalk/asphalt).
  city.groundHeightAt = groundHeightAt;
  city.drones = drones;
  buildColliders();

  minimap = createMinimap(city, champion, taxi, { bounds, openDestinations: () => myWork?.open('city_central', 'destinations') });
}

function updateFlyButtons() {
  // `exit()` animates the landing while `active` is still true, so also treat
  // "exiting" as no longer riding — otherwise Climb/Descend linger after landing.
  const ride = taxi && taxi.isActive() && !taxi.isExiting?.();
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
    walkNav = null;
    taxi.board(champion);
    showToast(t('toast.flyControls'));
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
const TRAFFIC_VEHICLES_KEY = CF_KEYS.trafficVehicles;
const DEFAULT_TRAFFIC_VEHICLE_IDS = Object.freeze(['veh_audi_a7', 'veh_audi_rs_q8']);

function validTrafficVehicles(ids) {
  const valid = [...new Set(Array.isArray(ids) ? ids : [])].map((id) => libraryItem(id))
    .filter((item) => item?.category === 'vehicles' && isRoadVehicle(item));
  return valid.length ? valid.map((item) => item.id) : [...DEFAULT_TRAFFIC_VEHICLE_IDS];
}
function readTrafficVehicleIds() {
  try { return validTrafficVehicles(JSON.parse(localStorage.getItem(TRAFFIC_VEHICLES_KEY) || 'null')); }
  catch { return [...DEFAULT_TRAFFIC_VEHICLE_IDS]; }
}

function updateDriveButtons() {
  const driving = drivingCar && drivingCar.isActive();
  const btn = document.getElementById('btn-drive');
  if (!btn) return;
  const emoji = btn.childNodes[0];
  if (emoji) emoji.textContent = driving ? '🚙' : '🚗';
  const label = btn.querySelector('span');
  if (label) label.textContent = driving ? t('ui.exitCar') : t('ctl.drive');
  btn.dataset.contextual = String(!!driving || !!parkedCarNearChampion());
}

function toggleDrive() {
  if (!champion) return;
  if (drivingCar && drivingCar.isActive()) {
    // Driving → exit the current car (it stays parked where it stopped).
    drivingCar.exit();
    navObstacleRevision++;
    showToast(t('toast.parked'));
    updateDriveButtons();
    return;
  }
  // Not driving → if a parked car is nearby, board it; otherwise open the chooser.
  const near = parkedCarNearChampion();
  if (near) {
    walkNav = null; taxiNav = null; navObstacleRevision++;
    near.board(champion);
    showToast(tf('toast.drivingAgain', { name: near.name || 'car' }));
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
  overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label',t('ui.carTitle'));
  overlay.className = 'drive-overlay';
  const panel = document.createElement('div');
  panel.className = 'drive-panel';
  overlay.appendChild(panel);

  const header = document.createElement('div');
  header.className = 'drive-header';
  const title = document.createElement('div');
  title.className = 'drive-title';
  title.textContent = t('ui.carTitle');
  const sub = document.createElement('div');
  sub.className = 'drive-sub';
  sub.textContent = t('ui.carHelp');
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
      <div class="drive-name">${displayName('lib:'+item.id,currentLang())}</div>
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
  close.setAttribute('aria-label', t('ui.close'));close.setAttribute('data-modal-close','');
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
  if (!model) { showToast(t('toast.carLoadFail')); return; }

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
    length: bodyRadius * 2,
    width: Math.max(1.5, bodyRadius * 1.15),
    resolveParking: ({ position, footprint, rotation }) => resolveRoadSafePlacement({
      position, footprint, rotation, roads: layout,
      bounds: [0, 0, layout.scaleMeters || 2000, layout.scaleMeters || 2000],
      obstacles: (layout.buildings || []).map((b) => ({ pos: b.pos, footprint: b.footprint || typeSpec(b.type)?.footprint })),
      maxDistance: 80,
    }),
  });
  car.name = item.name;
  drivingCar = car;
  // Keep at most ONE parked car around for re-boarding; a fresh spawn replaces
  // the previous car's group, so drop the stale controller from the list.
  driveCars.length = 0;
  driveCars.push(car);

  // Board: snap the car just in front of the champion.
  walkNav = null; taxiNav = null; navObstacleRevision++;
  car.board(champion);
  showToast(tf('toast.drivingCar', { name: displayName('lib:'+item.id,currentLang()) }));
  updateDriveButtons();
}

const _camPos = new THREE.Vector3();
const _occupiedFocus = new THREE.Vector3();
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
  const introOverview = !!champion && !driving && !taxiActive && performance.now() < orbit.introUntil;
  const occupiedFocus = cityFocusBounds
    ? _occupiedFocus.set((cityFocusBounds.minX + cityFocusBounds.maxX) / 2, 0, (cityFocusBounds.minZ + cityFocusBounds.maxZ) / 2)
    : orbit.target;
  const focus = introOverview ? occupiedFocus : driving
    ? drivingCar.getPos()
    : taxiActive ? taxi.getPos() : (champion ? champion.state.pos : orbit.target);
  // Ease the zoom toward the mode's distance: overview → walk → taxi → drive (closest).
  const wantDist = driving ? (orbit.distDrive || 13)
    : taxiActive ? orbit.distTaxi
    : (champion && !introOverview ? orbit.distWalk : orbit.distOverview);
  orbit.dist += (wantDist - orbit.dist) * Math.min(1, dt * 2.5);
  if (!reducedMotion.matches && (!champion || orbit.locked)) {
    // gentle auto-orbit when no champion yet / locked view
    orbit.theta += dt * 0.05;
  } else if (!reducedMotion.matches && (!taxiActive && !driving) && (performance.now() - orbit.lastOrbitTs) > 8000) {
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

// ─── Ground collision ─────────────────────────────────────────────────────
// Footprints are oriented boxes in X/Z. Keeping this renderer-free lets every
// champion skin share one predictable body, while rotated buildings and cars
// match the space they visibly occupy.
const CHAMPION_COLLIDER_SIZE = 0.8;
const CHAMPION_NAV_CLEARANCE = Math.hypot(CHAMPION_COLLIDER_SIZE / 2, CHAMPION_COLLIDER_SIZE / 2) + 0.25;
let buildingColliders = [];   // boxBody[]
let buildingPlacementColliders = []; // legacy AABBs for the prop grab UI

function buildColliders() {
  buildingColliders = [];
  buildingPlacementColliders = [];
  if (!city.layout || !city.layout.buildings) return;
  city.layout.buildings.forEach((b, index) => {
    const spec = typeSpec(b.type);
    const fp = b.footprint || (spec && spec.footprint) || [20, 20];
    const width = fp[0] || 20, length = fp[1] || 20;
    buildingColliders.push({ ...boxBody({ x: b.pos[0], z: b.pos[1], width,
      length, yaw: b.rotation || 0 }), id: `building:${index}`, kind: 'building' });
    // The grab library's anchor validator is deliberately axis-aligned. Keep
    // its conservative envelope separate from gameplay's exact rotated box.
    const radius = Math.hypot(width, length) / 2;
    buildingPlacementColliders.push({ minX: b.pos[0] - radius, maxX: b.pos[0] + radius,
      minZ: b.pos[1] - radius, maxZ: b.pos[1] + radius });
  });
  navObstacleRevision++;
}

function championCollisionBody() {
  if (!champion || !champion.group.visible) return null;
  const p = champion.state.pos;
  return boxBody({ x: p.x, z: p.z, width: CHAMPION_COLLIDER_SIZE,
    length: CHAMPION_COLLIDER_SIZE, yaw: champion.state.facing });
}

function trafficCollisionBodies() {
  return (traffic?.vehicles || []).filter(v => !v.done).map(v => boxBody({ x: v.x, z: v.z,
    dx: v.vx, dz: v.vz, length: v.length, width: v.width || 2.05 }));
}

function meshVehicleBody(mesh) {
  const spec = mesh?.userData?.groundVehicleCollider;
  if (!spec || !mesh.visible) return null;
  const scale = Math.max(Math.abs(mesh.scale.x || 1), Math.abs(mesh.scale.z || 1));
  return boxBody({ x: mesh.position.x, z: mesh.position.z, yaw: mesh.rotation.y,
    width: spec.width * scale, length: spec.length * scale });
}

function placedPropBody(mesh) {
  const spec = mesh?.userData?.groundObstacle;
  if (!spec || !mesh.visible || !mesh.parent) return null;
  return { ...boxBody({ x: mesh.position.x, z: mesh.position.z, yaw: mesh.rotation.y,
    width: spec.width * Math.max(0.01, Math.abs(mesh.scale.x || 1) / (spec.baseScale || 1)),
    length: spec.length * Math.max(0.01, Math.abs(mesh.scale.z || 1) / (spec.baseScale || 1)) }),
    id: `prop:${mesh.userData.uid || mesh.uuid}`, kind: spec.kind || 'prop' };
}

function staticGroundObstacleBodies() {
  const bodies = [];
  for (const mesh of _parkedVehicleState.applied) { const body = meshVehicleBody(mesh); if (body) bodies.push(body); }
  for (const mesh of environmentProps) { const body = placedPropBody(mesh); if (body) bodies.push(body); }
  for (const car of driveCars || []) {
    if (!car.isActive?.() && car.isParked?.()) {
      const body = car.getCollisionBody?.();
      if (body) bodies.push({ ...body, id: `parked-car:${car.id || bodies.length}`, kind: 'parked-vehicle' });
    }
  }
  return bodies;
}

function championStaticObstacles() { return [...buildingColliders, ...staticGroundObstacleBodies()]; }

function resolveChampionCollision() {
  const body = championCollisionBody();
  if (!body) return false;
  const result = resolveBoxCollisions(body, [...championStaticObstacles(), ...trafficCollisionBodies()]);
  champion.state.pos.x = result.x;
  champion.state.pos.z = result.z;
  champion.group.position.x = result.x;
  champion.group.position.z = result.z;
  return result.collided;
}

function resolveCarCollision(car) {
  const body = car?.getCollisionBody?.();
  if (!body) return;
  const result = resolveBoxCollisions(body, buildingColliders);
  const pos = car.getPos();
  pos.x = result.x; pos.z = result.z;
  car.group.position.set(result.x, 0, result.z);
}

// ─── Building entry (tap to open minigame) ────────────────────────────────
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const dragState = { on: false, sx: 0, sy: 0, moved: 0 };

// Must be called AFTER setupScene() (renderer/camera exist then).
// Multi-touch guard: only the FIRST pointer (the primary finger/mouse) drives the
// orbit drag and can fire a tap. Extra fingers are ignored so a resting second
// finger can't reset dragState.moved and turn the first finger's release into a
// stray tapAt() (accidental quest/entry or node tap while orbiting).
let _primaryPointerId = null;
function wireRendererInteraction(owner) {
  owner.listen(renderer.domElement, 'pointerdown', (e) => {
    if (_primaryPointerId !== null) return;   // a second pointer must not steal the drag
    _primaryPointerId = e.pointerId;
    orbit.introUntil = 0;
    dragState.on = true;
    dragState.sx = e.clientX; dragState.sy = e.clientY;
    dragState.moved = 0;
  });
  owner.listen(window, 'pointermove', (e) => {
    if (e.pointerId !== _primaryPointerId) return;
    if (!dragState.on) {
      setNodeHoverCursor(e);   // guarded: fine pointers, not grabbing
      return;
    }
    const dx = e.clientX - dragState.sx, dy = e.clientY - dragState.sy;
    dragState.sx = e.clientX; dragState.sy = e.clientY;
    dragState.moved += Math.abs(dx) + Math.abs(dy);
    if (dragState.moved > 6) {
      orbit.lastOrbitTs = performance.now();
      orbit.theta -= dx * 0.006;
      orbit.phi = Math.max(0.25, Math.min(1.45, orbit.phi - dy * 0.006));
    }
  });
  owner.listen(window, 'pointerup', (e) => {
    if (e.pointerId !== _primaryPointerId) return;
    const wasOn = dragState.on;
    _primaryPointerId = null;
    dragState.on = false;
    if (!wasOn) return;
    if (dragState.moved <= 6) tapAt(e.clientX, e.clientY);
  });
  owner.listen(window, 'pointercancel', (e) => {
    // A gesture-cancelled primary (or a second finger that grabbed the gesture)
    // must never leave a stale drag that fires tapAt() on a later pointerup.
    if (e.pointerId !== _primaryPointerId) return;
    _primaryPointerId = null;
    dragState.on = false;
  });
}

/** Register a placed library prop with the grab system so it can be selected,
 *  picked up and moved (🎯 button). Persists the new position on drop. */
function registerGrabbableProp(mesh, item) {  if (!grab || !mesh) return;
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
  // Every placed, ground-based model is solid for both manual collision and
  // automatic walking. Aircraft and rail stock remain decorative because
  // their library footprints do not describe a walkable ground obstruction.
  const airborneOrRail = item?.category === 'vehicles' && !isRoadVehicle(item);
  if (item && !airborneOrRail) {
    mesh.userData.groundObstacle = {
      width: Math.max(0.1, Number(fp[0]) || 1.5),
      length: Math.max(0.1, Number(fp[1]) || 1.5),
      baseScale: Math.max(0.0001, Math.abs(mesh.userData.libraryBaseScale || 1)),
      kind: item.landmark ? 'landmark' : item.host ? 'skill-host' : 'prop',
    };
  }
  // Only road-going library vehicles become solid to the Champion. Aircraft
  // and rail models stay decorative/airborne as elsewhere in the city.
  if (item?.category === 'vehicles' && isRoadVehicle(item)) {
    mesh.userData.groundVehicleCollider = {
      width: vehicleTargetWidth(item),
      length: vehicleTargetLength(item),
    };
  }
  navObstacleRevision++;
}

/** Desktop affordance: show a pointer cursor while hovering an AI machine node
 *  (the tap target that opens its "Try it" panel). No-op on touch — the pulsing
 *  light column is the affordance there. Guarded: fine pointer only, and never
 *  while the user is dragging the orbit camera. */
function setNodeHoverCursor(e) {
  if (typeof matchMedia === 'function' && !matchMedia('(pointer: fine)').matches) return;
  if (!_aiNodes || typeof _aiNodes.tapMeshes !== 'function') return;
  let hit = false;
  try {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    hit = raycaster.intersectObjects(_aiNodes.tapMeshes(), false).length > 0;
  } catch { hit = false; }
  renderer.domElement.style.cursor = hit ? 'pointer' : '';
}

function tapAt(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
  // Grab takes priority: while carrying → place; in select mode → pick a model.
  if (grab) {
    if (grab.mode !== 'idle') { grab.placeAt(ndcX, ndcY); return; }
    if (selectMode) { grab.select(grab.pick(ndcX, ndcY)); return; }
  }
  // Only gateway hit targets open a destination.
  pointer.x = ndcX; pointer.y = ndcY;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(interactMeshes, false);
  if (hits.length && hits[0].object.userData.kind === 'gateway') {
    location.assign(hits[0].object.userData.quest.directUrl);
    return;
  }
  // AI machine nodes (ai-nodes.js): tap a pulsing machine node → open THAT
  // machine's "Try it" panel. Gateway entry takes priority.
  if (_aiNodes && typeof _aiNodes.tapMeshes === 'function') {
    const nMeshes = _aiNodes.tapMeshes();
    if (nMeshes.length) {
      raycaster.setFromCamera(pointer, camera);
      const nHits = raycaster.intersectObjects(nMeshes, false);
      if (nHits.length) {
        let g = nHits[0].object;
        while (g && g.userData && g.userData.capId == null) g = g.parent;
        const capId = g && g.userData && g.userData.capId;
        const cap = capId ? readPlantedCaps().find((c) => c.id === capId) : null;
        if (cap) { openTryPanel(cap); return; }
      }
    }
  }
}

function openMinigame(data) {
  // Guard: a quest with no deployed game (traffic_lab, monitoring, water,
  // power…) must never open a blank overlay. Same for an origin outside the
  // programme-owned allowlist (audit A8) — show a friendly toast instead.
  if (!data || !data.gameUrl || !isAllowedMinigameUrl(data.gameUrl)) {
    showToast(tf('toast.noGame', { name: data?.name || t('hud.mission') }));
    return;
  }
  const overlay = document.getElementById('game-overlay');
  const frame = document.getElementById('game-frame');
  document.getElementById('game-overlay-title').textContent = data.name;
  frame.src = data.gameUrl;
  overlay.classList.remove('hidden');
  // Optional historical activity only; never certify skill or lesson completion.
  document.getElementById('game-overlay-done').onclick = () => {
    frame.src = '';
    overlay.classList.add('hidden');
    if (!data.questId) return; // Tool visits do not certify or mutate legacy history.
    const recorded = recordLegacyActivity(data.questId);
    showToast(recorded ? t('work.activitySaved') : t('work.activityFailed'));
  };
  document.getElementById('game-overlay-close').onclick = () => {
    frame.src = '';
    overlay.classList.add('hidden');
  };
}

// ─── Buddy + skins ────────────────────────────────────────────────────────
function mountChat(owner) {
  if (!champion) return;   // champion failed to load — skip buddy chat
  mountCityBuddy(city, champion, sim, layout, owner);
}

function mountSkins(owner) {
  if (!champion) return;   // champion failed to load — skip skin sidebar
  // Accessories are not needed for first paint. Warm them after the active
  // layout is usable, and cancel the deferred start when this boot is replaced.
  if (!_exampleSession) owner.defer(() => {
    try { Promise.resolve(preloadAccessories(ASSET_BASE)).catch((e) => console.warn('[city-builder] accessories unavailable', e)); }
    catch (e) { console.warn('[city-builder] accessories unavailable', e); }
  }, 1500);
  skinSidebar = mountSkinSidebar(ASSET_BASE, champion, (skin) => showToast(`👑 ${skinLabel(skin)} ${t('toast.skinEquipped')}`),
    _customSkinUrl ? { url: _customSkinUrl, metadata: _customSkinMetadata } : null, {
      onUploadCustom: async (file) => {
        const result = await importCustomChampion(file);
        if (!result.ok) {
          showToast(result.message);
          return null;
        }
        return result.skin;
      },
      editStudioUrl: '../studio/?resume=1',
      onRestoreCustom: async () => {
        const revisions = await loadCustomSkinRevisions(); const previous = revisions.at(-1);
        if (!previous?.buffer) return null;
        const blob = new Blob([previous.buffer], { type: 'model/gltf-binary' });
        await saveCustomSkin(blob, previous.metadata || null);
        if (_customSkinUrl) revokeObjectUrl(_customSkinUrl);
        _customSkinUrl = blobToObjectUrl(blob); _customSkinMetadata = previous.metadata || null;
        return { url: _customSkinUrl, name: 'My Champion', metadata: _customSkinMetadata };
      },
    });
}

// ─── Main loop ────────────────────────────────────────────────────────────
let lastT = performance.now();
function startLoop(owner) {
 const loop = (now) => {
  if (!owner.active || owner.generation !== _bootGen) return;
  owner.raf(loop);
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  const tNow = now / 1000;
  // Keep RAF alive for recovery, but do not compile shaders against a lost GPU context.
  if(document.hidden || _contextPaused || renderer?.getContext().isContextLost())return;

  timeOfDay?.update(dt);
  placementDust?.update(dt);
  updateNeighbourhoodObstacles(dt);
  if(streetLife) {
    const player=drivingCar?.isActive() ? [{x:drivingCar.getPos().x,z:drivingCar.getPos().z,speed:12}] : [];
    streetLife.setReducedMotion(reducedMotion.matches);
    streetLife.setVehicles([...(traffic?.vehicles || []),...player]);
    streetLife.update(reducedMotion.matches ? 0 : dt);
  }
  // Traffic and pedestrians share crossing occupancy, not separate timers.
  // Traffic sees the Champion before its next walking step. Its own fixed-step
  // guard then leaves a 3 m gap if the Champion enters a live lane.
  const trafficBlocker = (!taxi?.isActive?.() && !drivingCar?.isActive?.()) ? championCollisionBody() : null;
  if (traffic) traffic.update(reducedMotion.matches ? 0 : dt, streetLife,
    trafficBlocker ? [trafficBlocker] : []);
  // Pedestrians (floating NPCs)
  if (citizens && ambientDelta(dt)) citizens.update(dt, tNow);
  // Clouds (drifting sky)
  if (clouds && ambientDelta(dt)) clouds.update(dt, tNow);

  // Air traffic
  if (decoTaxis && !reducedMotion.matches) decoTaxis.update(dt, tNow);
  if (skySentinels && !reducedMotion.matches) skySentinels.update(dt, tNow);
  if (drones && !reducedMotion.matches) drones.update(dt, tNow);

  const taxiActive = taxi && taxi.isActive();
  const driveActive = drivingCar && drivingCar.isActive();
  if (driveActive) {
    // ── Driving a ground car ──────────────────────────────────────────────
    // Camera-relative steering (same as walking/taxi). No auto-nav for cars.
    const m = cameraRelativeMove(input.x, input.z, drivingCar.getPos());
    drivingCar.update(dt, { x: m.x, z: m.z, running: input.running || runToggled }, tNow);
    // Building collision — slide the car out of footprints so it never drives
    // through buildings (re-sync the group after pushing the car's pos).
    if (buildingColliders.length) resolveCarCollision(drivingCar);
    sim.nearQuest = null;   // driving — no building is "near" for entering
  } else if (taxiActive) {
    // A child's steering always wins over destination auto-flight.
    let tx = input.x, tz = input.z, ascend = input.ascend, descend = input.descend;
    if (taxiNav && (input.x || input.z || input.ascend || input.descend)) cancelManualNavigation('taxi');
    if (taxiNav) {
      const tp = taxi.getPos();
      const dx = taxiNav.x - tp.x, dz = taxiNav.z - tp.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 16) {
        taxiNav = null;
        taxi.setAutoNav(false);
        showToast(t('toast.arrived'));
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
    // A child's directional input cancels destination walking in this frame.
    let mx = input.x, mz = input.z, mvRunning = input.running || runToggled, mvJump = input.jump;
    if (walkNav && (input.x || input.z)) cancelManualNavigation('walk');
    if (walkNav && walkNav.obstacleRevision !== navObstacleRevision) replanWalkNavigation();
    if (walkNav) {
      const p = champion.state.pos;
      const progress = advanceGroundRoute(walkNav, p);
      walkNav.index = progress.index;
      if (progress.done) {
        walkNav = null;
        showToast(t('toast.walkArrived'));
      } else {
        const dx = progress.waypoint.x - p.x, dz = progress.waypoint.z - p.z;
        const dist = Math.hypot(dx, dz);
        const len = dist || 1;
        mx = dx / len; mz = dz / len; mvRunning = false;
      }
    }
    if (!walkNav) {
      // Camera-relative manual walking (no buddy walk-to override)
      const m = cameraRelativeMove(input.x, input.z, champion.state.pos);
      mx = m.x; mz = m.z;
    }    champion.update(dt, {
      x: mx, z: mz, running: mvRunning, jump: mvJump,
      speedScale: (sim.walkSpeed || 2) / WALK_SPEED,
    });
     // Solid buildings and every ground car share one collision pass. Roads
     // are intentionally absent: the Champion may cross them, while traffic
     // yields from its own predictive safety pass above.
     resolveChampionCollision();
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
  // Goal ring marks the nearest enterable gateway.
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
    updateDriveButtons();
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

  if(duskSky)duskSky.position.copy(camera.position);
  renderer.info.autoReset = false;
  renderer.info.reset();
  if (composer) composer.render();
  else renderer.render(scene, camera);
  city.renderStats = {calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,
    textures:renderer.info.memory.textures,geometries:renderer.info.memory.geometries};
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
    const base = (timeOfDay?.bloom ?? DUSK.bloom) * (IS_MOBILE ? .65 : 1);
    _bloomPass.strength = base * (1 - 0.55 * smooth01(camY, 120, 450));
  }
 };
 lastT = performance.now();
 owner.raf(loop);
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
    `people: ${citizens ? citizens.getCount() : 0} citizens\n` +
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
    if (!ref.q.directUrl) continue;
    const d = Math.hypot(ref.cx - p.x, ref.cz - p.z);
    if (d < bestD) { bestD = d; best = ref; }
  }
  return best ? best.q : null;
}

// Nearby gateway supplies the entry prompt and orientation ring.
function findNextQuest() { return nearestQuest(); }

// ─── Quest enter prompt ──────────────────────────────────────────────────
// Workshop and Fit Studio are the only nearby entry destinations.
const _questPromptEl = document.getElementById('quest-prompt');
const _questPromptLabel = document.getElementById('quest-prompt-label');
const _questPromptBtn = document.getElementById('quest-prompt-btn');

function updateQuestPrompt() {
  if (!_questPromptEl) return;
  const quest = sim && sim.nearQuest;
  if (!quest?.directUrl) { _questPromptEl.classList.add('hidden'); return; }
  _questPromptLabel.textContent = `${quest.gateway === 'studio' ? '✦' : '⚙️'} ${currentLang() === 'zh-Hant' ? quest.labelZh : quest.labelEn}`;
  _questPromptBtn.textContent = currentLang() === 'zh-Hant' ? quest.enterZh : quest.enterEn;
  _questPromptBtn.classList.remove('hidden');
  _questPromptEl.classList.remove('hidden');
}

function wireQuestPrompt() {
  if (!_questPromptBtn || wireQuestPrompt.bound) return;
  wireQuestPrompt.bound = true;
  _questPromptBtn.addEventListener('click', () => {
    const quest = sim && sim.nearQuest;
    if (quest?.directUrl) location.assign(quest.directUrl);
  });
}

const _bc = new THREE.Color();

function updateBeacons(t) {
  if (!specialSystem.beacon) return;
  specialSystem.beaconPositions.forEach((bp, i) => {
    _bc.setHex(0x00f2fe);
    specialSystem.beacon.setColorAt(i, _bc);
  });
  specialSystem.beacon.instanceColor.needsUpdate = true;
}

function showToast(msg) {
  const el = document.createElement('div');
  el.className = 'toast show';
  el.setAttribute('role','status');
  el.textContent = msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), Math.min(8000, 2600 + msg.length * 30));
}

// ─── Input wiring ─────────────────────────────────────────────────────────
function wireInput() {
  if (wireInput.bound) return;
  wireInput.bound = true;
  const isTyping = () => {
    const ae = document.activeElement;
    return ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable);
  };

  window.addEventListener('keydown', (e) => {
    // Don't hijack typing in the buddy chat input (or any text field).
    const k = e.key.toLowerCase();
    const movementKey = ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(k);
    // Modal controls and native select/summary navigation keep their keys. Once
    // a destination panel closes, focus intentionally returns to its HUD
    // opener; movement keys must still hand control straight back to the child.
    if (activeModal() || isTyping() || e.target.closest('select, summary')
      || (e.target.closest('button, a') && !movementKey)) return;
    keys[k] = true;
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
    bindHold(el, () => { keys['dir:up'] = true; if (run) input.running = true; }, () => { keys['dir:up'] = false; if (run) input.running = false; });
  };
  bindHoldMove(document.getElementById('btn-walk'), false);
  bindHoldMove(document.getElementById('btn-run'), true);
  document.getElementById('btn-jump').addEventListener('click', () => { input.jump = true; });
  document.getElementById('btn-wave').addEventListener('click', () => { input.wave = true; });
  document.getElementById('btn-dance').addEventListener('click', () => { input.dance = true; });
  document.getElementById('orbit-toggle').addEventListener('click', () => { orbit.locked = !orbit.locked; });

  // "Take me home" — walk (or fly) the champion back to spawn. Reuses the
  // buddy's walk-to/fly-to navigation so kids never get stranded across a
  // growing city.
  document.getElementById('btn-home').addEventListener('click', () => {
    if (!city.spawnWorld) return;
    // Get out of the car first, then head home.
    if (drivingCar && drivingCar.isActive()) { drivingCar.exit(); updateDriveButtons(); }
    if (taxi && taxi.isActive()) {
      walkNav = null;
      taxiNav = { x: city.spawnWorld.x, z: city.spawnWorld.z, y: 24 };
      taxi.setAutoNav(true);
      updateFlyButtons();
    } else if (champion) {
      taxiNav = null;
      if (!beginWalkNavigation({ x: city.spawnWorld.x, z: city.spawnWorld.z })) return;
    }
    showToast(t('toast.headingHome'));
  });

  document.getElementById('more-example')?.addEventListener('click', () => {
    window.location.href = '/city-builder/?example=1';
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
      else showToast(t('toast.selectToMove'));
      return;
    }
    selectMode = true;
    showToast(t('toast.selectMode'));
  });
  // Tap-away to clear selection.
  document.addEventListener('pointerdown', (e) => {
    if (selectMode && grab && !e.target.closest('#btn-next, #prop-inspector, .resize-panel') && grab.getSelected() && grab.mode === 'idle') {
      grab.clearSelection();
    }
  });

  // Flying taxi controls
  const taxiBtn = document.getElementById('btn-taxi');
  const flyUp = document.getElementById('btn-flyup');
  const flyDown = document.getElementById('btn-flydown');
  taxiBtn?.addEventListener('click', () => toggleTaxi());

  // Drive controls — 🚗 opens the car chooser (default BYD Sealion 7); while
  // driving the same button exits back to walking.
  const driveBtn = document.getElementById('btn-drive');
  driveBtn?.addEventListener('click', () => toggleDrive());
  const hold = (el, key) => {
    bindHold(el, () => { input[key] = true; }, () => { input[key] = false; });
  };
  if (flyUp) hold(flyUp, 'ascend');
  if (flyDown) hold(flyDown, 'descend');

  // sample city / controls sound
  document.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { try { playTap(); } catch (e) { /* no audio */ } }));
  // Defensive: unlock the AudioContext on the first real tap so any beep fired
  // a moment later (e.g. after an async load) is not blocked by autoplay rules.
  try { armAudioGestureUnlock(); } catch (e) { /* no audio */ }
}

function clearInput() {
  for (const key of Object.keys(keys)) keys[key] = false;
  for (const key of ['x','z','running','jump','wave','dance','ascend','descend']) input[key] = 0;
}
window.addEventListener('modal:change', clearInput);
window.addEventListener('blur', clearInput);
document.addEventListener('visibilitychange', clearInput);
function readInput() {
  if (_contextPaused || activeModal() || document.hidden) { clearInput(); return; }
  const k = keys;
  let x = 0, z = 0;
  if (k['arrowup'] || k['w'] || k['dir:up']) z += 1;
  if (k['arrowdown'] || k['s'] || k['dir:down']) z -= 1;
  if (k['arrowleft'] || k['a'] || k['dir:left']) x -= 1;
  if (k['arrowright'] || k['d'] || k['dir:right']) x += 1;
  if (x || z) orbit.introUntil = 0;
  input.x = x; input.z = z;
}

// ─── Layout entry (localStorage / file / paste / sample) ──────────────────
let originalPlanRaw = null;
let retryLayoutRaw = null; // serialized selection survives a failed boot/retry
let retryPending = false;
let originalGoals = null; // Display-only metadata; geometry normalization drops mode/version.
function loadLayout(raw) {
  const v = validateLayout(raw);
  if (!v.ok) {
    showEntryError(t('ui.invalid'));
    return false;
  }
  originalPlanRaw = JSON.stringify(raw);
  retryLayoutRaw = originalPlanRaw;
  retryPending = false;
  layout = sanitizeLayout(raw);
  // Geometry-preserving: densifyLayout no longer grows/compresses the plan, so
  // the 3D city is EXACTLY the layout the child designed in the 2D planner
  // (sizes, positions and road gaps all match). It only computes `bounds` now.
  const dense = densifyLayout(layout);
  layout = dense.layout;
  growScale = dense.grow;
  cityBounds = dense.bounds;
  cityFocusBounds = occupiedBounds(layout, { pad: 0 });

  // Planner AI context survives sanitizeLayout/densifyLayout (which rebuild the
  // layout from known geometry fields and would drop extras). Attached to the
  // final layout object so the entry overlay + Coding Buddy can echo the plan.
  if (raw && typeof raw === 'object') {
    const g = raw.goals && typeof raw.goals === 'object' ? raw.goals : null;
    originalGoals = g;
    layout.goals = g && (g.label || g.weights)
      ? { label: String(g.label || 'Balanced'), weights: g.weights && typeof g.weights === 'object' ? g.weights : null }
      : null;
    layout.plannerScore = Number.isFinite(+raw.plannerScore) ? Math.round(+raw.plannerScore) : null;
    // The planner's weighted breakdown travels too, so the 3D city can show WHY
    // the city scored as it did — not just a number.
    const pp = raw.plannerPlan && typeof raw.plannerPlan === 'object' ? raw.plannerPlan : null;
    layout.plannerPlan = pp && Array.isArray(pp.metrics)
      ? {
          score: Number.isFinite(+pp.score) ? Math.round(+pp.score) : null,
          metrics: pp.metrics
            .filter((r) => r && typeof r.key === 'string' && Number.isFinite(+r.raw) && Number.isFinite(+r.weight))
            .slice(0, 12)
            .map((r) => ({ key: r.key, raw: +r.raw, weight: +r.weight, points: Number.isFinite(+r.points) ? +r.points : 0 })),
        }
      : null;
  } else {
    originalGoals = null;
    layout.goals = null;
    layout.plannerScore = null;
    layout.plannerPlan = null;
  }
  applyPlanChip();
  return true;
}

// Planner metric keys → bilingual names (mirrors the 2D receipt rows).
const PLAN_METRIC_KEYS = METRIC_KEYS;
let _plannerPlan = null;

// Translate structured modes; opaque historical labels remain literal.
function planGoalLabel() {
  const goals=originalGoals || layout?.goals;
  if (goals?.version === 1) {
    if (goals.mode === 'default') return t('plan.balanced');
    if (goals.mode === 'custom') return t('plan.customGoals');
    if (goals.mode === 'mayor' && ['green','healthy','busy','quiet'].includes(goals.mayorId)) return t('plan.mayor.'+goals.mayorId);
  }
  return goals?.label ? String(goals.label) : t('plan.balanced');
}
/** Echo the planner's AI goals + score in the HUD chip (hidden when absent). */
function applyPlanChip() {
  const chip = document.getElementById('plan-ai-chip');
  if (!chip) return;
  _plannerPlan = layout && layout.plannerPlan && Array.isArray(layout.plannerPlan.metrics) && layout.plannerPlan.metrics.length
    ? layout.plannerPlan
    : null;
  const gl = layout && layout.goals && layout.goals.label ? String(layout.goals.label) : null;
  const sc = layout && layout.plannerScore != null ? Math.round(layout.plannerScore) : null;
  if (!gl && sc === null) { chip.hidden = true; return; }
  const name = planGoalLabel();
  const scorePart = sc !== null ? ' · ' + sc : '';
  chip.textContent = '🌆 ' + name + scorePart;
  chip.title = t('entry.planChip') + (sc !== null ? ' · ' + sc : '');
  chip.setAttribute('aria-label', t('plan.buttonAria') + ' — ' + name + (sc !== null ? ' · ' + sc : ''));
  chip.hidden = false;
}

/** Render the planner's weighted score breakdown inside the 3D city. */
function openPlanModal() {
  const modal = document.getElementById('plan-modal');
  const body = document.getElementById('plan-body');
  if (!modal || !body || !_plannerPlan) return;
  window.dispatchEvent(new CustomEvent('city:panel-open',{detail:{panel:'plan'}}));
  const label = planGoalLabel();
  const score = _plannerPlan.score != null ? _plannerPlan.score : (_plannerPlan.metrics.length ? '' : '—');
  // Keep the receipt's row order even if the planner ever sends a subset.
  const byKey = new Map(_plannerPlan.metrics.map((r) => [r.key, r]));
  const rows = PLAN_METRIC_KEYS
    .filter((k) => byKey.has(k))
    .map((k) => {
      const r = byKey.get(k);
      return `<div class="plan-row">
        <span class="plan-row-name">${t('plan.metric.' + k)}</span>
        <span class="plan-row-math">${Math.round(r.raw)}% × ${Math.round(r.weight)}%</span>
        <span class="plan-row-pts">${(Math.round(r.points * 10) / 10).toFixed(1)}</span>
      </div>`;
    }).join('') || `<p class="plan-note">${t('plan.empty')}</p>`;
  body.innerHTML = `
    <div class="plan-head">${t('plan.goalLabel')} <strong data-plan-label></strong> · <strong>${score}</strong>/100</div>
    <p class="plan-note">${t('plan.note')}</p>
    <div class="plan-rows">${rows}</div>`;
  body.querySelector('[data-plan-label]').textContent = label;
  modal.classList.remove('hidden');
}


function showEntryError(msg) {
  // Dedicated slot (#entry-error) — i18n applyStatic() never touches it, so a
  // later re-localize (boot / language toggle) can't wipe the message.
  const el = document.getElementById('entry-error');
  if (el) { el.textContent = '⚠️ ' + msg; el.hidden = false; }
}

// ── Champion File: save / cloud / restore (cross-device backup) ─────────────
const CLOUD_CODE_KEY = 'p5_cloud_code_v1';   // device-local pointer; not in CF_KEYS by design
const SAVE_NAME_KEY = CF_KEYS.cityName;      // single source of truth (was a duplicated literal)

function currentSnapshot() {
  const state = collectState();
  if (propLibrary) {
    const props = propLibrary.snapshot();
    if (props !== null) state.props = props;
  }
  if (originalPlanRaw !== null) {
    // Retain an unchanged storage section byte-for-byte, including whitespace.
    let same = false;
    try { same = JSON.stringify(JSON.parse(state.layout)) === originalPlanRaw; } catch { /* sample or legacy entry */ }
    if (!same) state.layout = originalPlanRaw;
  }
  return state;
}
function downloadChampionFile(label) {
  const file = composeChampionFile(currentSnapshot(), label);
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
  showToast(tf('toast.saved', { file: championFilename(label) }));
}

async function cloudSave(label) {
  const file = composeChampionFile(currentSnapshot(), label);
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
  // POST body, not a query param (audit A7): the cloud code is the child's only key to their city,
  // so it must never land in browser history / request logs / Referer headers.
  const res = await fetch('/api/load', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) throw new Error('load failed (' + res.status + ')');
  return await res.json();
}

/** Import a Champion File: write all state keys, then reload. Returns true if handled. */
function importChampionFile(raw) {
  if (!withinImportLimit(raw)) { showEntryError(t('ui.tooLarge')); return true; }
  if (!raw.trim()) return false;
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return false; }
  const champ = sanitizeChampionFile(parsed);
  if (parsed?.kind === 'passiona-champion-file' && !champ.ok) { showEntryError(t('ui.invalid')); return true; }
  if (!champ.ok) return false;
  restoreChampion(champ.file.state, currentSnapshot);
  return true;
}

let saveUiBound = false;
function wireSaveUi() {
  if (saveUiBound) return;
  saveUiBound = true;
  const modal = document.getElementById('save-modal');
  const nameInput = document.getElementById('save-name');
  const cloudResult = document.getElementById('save-cloud-result');
  const downloadBtn = document.getElementById('save-download');
  const cloudBtn = document.getElementById('save-cloud');
  const cloudModal = document.getElementById('cloud-modal');
  const cloudCode = document.getElementById('cloud-code');
  const cloudLoadBtn = document.getElementById('cloud-load');
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
    cloudBtn.textContent = t('ui.cloudSaving');
    try {
      const code = await cloudSave(name);
      if (cloudResult) {
        cloudResult.hidden = false;
        cloudResult.textContent = tf('ui.cloudSaved', {code});
      }
    } catch (e) {
      console.error('[city-builder] cloud save failed', e);
      if (cloudResult) {
        cloudResult.hidden = false;
        // Kid-first copy: reassure first, then the concrete next step. The
        // HTTP detail stays in the console — never in a child's sentence.
        cloudResult.textContent = t('ui.cloudFail');
      }
    } finally {
      cloudBtn.disabled = false;
      cloudBtn.textContent = t('saveModal.cloud');
    }
  });

  // Open from cloud.
  if (cloudModal && cloudCode && cloudLoadBtn) {
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
      if (cloudLoadBtn.disabled || restoreActive) return;
      const code = cloudCode.value.trim();
      if (!code) { cloudLoadResult.textContent = t('ui.cloudNeed'); return; }
      cloudLoadBtn.disabled = true;
      cloudLoadBtn.textContent = t('ui.cloudLoading');
      try {
        const data = await cloudLoad(code);
        const champ = sanitizeChampionFile(data);
        if (!champ.ok) { cloudLoadResult.textContent = t('ui.invalid'); return; }
        restoreChampion(champ.file.state, currentSnapshot, () => {
          try { localStorage.setItem(CLOUD_CODE_KEY, code); } catch { /* optional device pointer */ }
        });
      } catch (e) {
        cloudLoadResult.textContent = t('ui.cloudLoadFail');
      } finally {
        cloudLoadBtn.disabled = false;
        cloudLoadBtn.textContent = t('cloud.load');
      }
    };
    cloudLoadBtn.addEventListener('click', doLoad);
    cloudCode.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doLoad(); } });
  }
}

// ── Inspector badge: HUD corner emblem + Logbook shell (MVP: lowest tier) ────
function mountBadgeUi() {
  if (mountBadgeUi.bound) return;
  mountBadgeUi.bound = true;
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
        : 'Your badges will light up as you prove your machines — test on data they have never seen, and say "not sure" when you should.'}</div>`
      + milestoneSectionHTML(readMilestones(), zh ? 'zh-Hant' : 'en');
    modal.classList.remove('hidden');
  });
  modal.querySelectorAll('[data-logbook-close]').forEach((el) => el.addEventListener('click', close));
}

// ── Planted machines: Capability Panel (Stage 1 — display only, honest) ──────
const CAPS_KEY = CF_KEYS.caps;       // single source of truth (was a duplicated literal)
const CAP_MAX_BYTES = 200 * 1024; // a numeric .cap is KBs; guard against bloat
// Last "Try my machine" verdict per planted machine id — lets the cap card and
// the Coding Buddy talk about what the machine last decided.
const CAP_LAST_DEC_KEY = 'p5_city_cap_lastdec_v1';

function readLastDecisions() {
  try { const m = JSON.parse(localStorage.getItem(CAP_LAST_DEC_KEY) || '{}'); return (m && typeof m === 'object') ? m : {}; }
  catch { return {}; }
}

let _aiNodes = null;   // visible in-world AI machine nodes (ai-nodes.js)

/** (Re)build the in-world nodes for planted machines. Cheap, additive, safe. */
function refreshAiNodes() {
  try {
    if (_aiNodes && _aiNodes.dispose) _aiNodes.dispose();
    _aiNodes = mountCityAiNodes(scene, city, layout, {paused:()=>_contextPaused,reducedMotion:()=>reducedMotion.matches});
  } catch (e) {
    console.warn('[city-builder] ai-nodes refresh failed', e);
  }
}

function readPlantedCaps() {
  try { const a = JSON.parse(localStorage.getItem(CAPS_KEY) || '[]'); return Array.isArray(a) ? a : []; }
  catch { return []; }
}
function writePlantedCaps(list) {
  try { localStorage.setItem(CAPS_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}
function renderCapPanel() {
  const body = document.getElementById('cap-body');
  if (!body) return;
  const zh = (() => { try { return localStorage.getItem('hk_ai_city_lang_v1') === 'zh-Hant'; } catch { return false; } })();
  const caps = readPlantedCaps();
  const lastDec = readLastDecisions();
  const cards = caps.map((cap) => {
    if (!cap || typeof cap !== 'object' || !Array.isArray(cap.input?.fields) || !Array.isArray(cap.output?.labels)) return `<p>${t('work.unreadableCap')}</p>`;
    const d = capabilityDescriptor(cap);
    const s = d.scores;
    const scoreLine = `study ${s.study ?? '—'} · check ${s.check ?? '—'} · sealed ${s.sealed ?? '—'}`;
    const ld = lastDec[d.id];
    return `<div class="cap-card">
      <div class="cap-name">${esc(d.name)}</div>
      <div class="cap-meta">${esc(d.algorithm)} · ${d.labels.length} labels · threshold ${d.threshold}</div>
      <div class="cap-scores">${esc(scoreLine)}</div>
      ${ld ? `<div class="cap-last">${zh ? '歷史紀錄（未重新驗證）：' : 'Historical record (not reverified): '}<b>${esc(ld.label)}</b></div>` : ''}
      <div class="cap-note">${d.connected ? (zh ? '只供展示 · 自我測試通過；不執行推論' : 'Display-only · self-tests passed; no inference') : (zh ? '只供展示 · 自我測試未通過' : 'Display-only · self-tests did not pass')}</div>
      <button class="cap-try" data-try-cap="${esc(d.id)}">🧪 ${zh ? '查看證據' : 'Inspect evidence'}</button>
    </div>`;
  }).join('');
  body.innerHTML = `<div class="cap-note">${esc(stage1Note(zh))}</div>`
    + (caps.length ? '' : `<div class="cap-empty">${zh
    ? '尚未匯入機器檔案。第一階段只展示資料與證據，不執行推論。'
    : 'No imported machine files yet. Stage 1 displays data and evidence only; it does not run inference.'}</div>`)
    + cards
    + `<div class="cap-actions">
         <button id="cap-plant-btn">📦 ${zh ? '種入機器檔案 (.cap)' : 'Plant a machine file (.cap)'}</button>
       </div>
       <div id="cap-err" class="cap-error" aria-live="polite"></div>`;
  const plant = document.getElementById('cap-plant-btn');
  if (plant) plant.addEventListener('click', () => document.getElementById('cap-file').click());
}
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// Stage 1 node taps inspect imported evidence only; no inference path.
function openTryPanel(cap) {
  if (!cap) return;
  myWork?.open('city_central', 'evidence');
}

function mountCapabilityUi() {
  if (mountCapabilityUi.bound) return;
  mountCapabilityUi.bound = true;
  const btn = document.getElementById('cap-btn');
  const modal = document.getElementById('cap-modal');
  const fileInput = document.getElementById('cap-file');
  if (!btn || !modal || !fileInput) return;

  const zh = (() => { try { return localStorage.getItem('hk_ai_city_lang_v1') === 'zh-Hant'; } catch { return false; } })();
  const close = () => modal.classList.add('hidden');
  btn.addEventListener('click', () => { renderCapPanel(); modal.classList.remove('hidden'); });
  modal.querySelectorAll('[data-cap-close]').forEach((el) => el.addEventListener('click', close));

  // Cards and outdoor nodes inspect the same Stage-1 evidence.
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-try-cap]');
    if (!t) return;
    const caps = readPlantedCaps();
    const cap = caps.find((c) => c?.id === t.getAttribute('data-try-cap'));
    if (cap) openTryPanel(cap);
  });

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
      if (err) err.textContent = t('ui.capInvalid');
      return;
    }
    const caps = readPlantedCaps();
    const installed = installCapability(r.capability);
    const immutableId = installed.ok ? installed.installation.id : `${r.capability.id}@${r.capability.revision || 1}`;
    if (!caps.some((c) => `${c?.id}@${c?.revision || 1}` === immutableId)) {
      if (caps.length >= 12) { if (err) err.textContent = t('work.capLimit'); return; }
      caps.push(r.capability);
      writePlantedCaps(caps);
    }
    if (err) err.textContent = '';
    refreshAiNodes();
    renderCapPanel();
  };
  fileInput.addEventListener('change', () => {
    const f = fileInput.files[0];
    if (!f) return;
    if (f.size > MAX_IMPORT_BYTES) { showEntryError(t('ui.tooLarge')); fileInput.value = ""; return; }
    const reader = new FileReader();
    reader.onerror = () => showEntryError(t('ui.readFail'));
    reader.onload = () => { plant(reader.result); fileInput.value = ''; };
    reader.readAsText(f);
  });
}

let entryBound = false;
let entryStarting = false;
function startEntryFlow() {
  if (entryBound) return;
  entryBound = true;
  const overlay = document.getElementById('entry-overlay');
  const localBtn = document.getElementById('entry-local');
  const exampleBtn = document.getElementById('entry-example');
  const pasteBtn = document.getElementById('entry-paste');
  const fileInput = document.getElementById('file-input');
  const pasteWrap = document.getElementById('paste-wrap');
  const pasteBox = document.getElementById('paste-box');
  const pasteGo = document.getElementById('paste-go');
  const entryMode = new URLSearchParams(location.search);
  const forceExample = entryMode.get('example') === '1';
  const previewExampleDraft = forceExample && entryMode.get('draft') === '1';
  const forceResume = entryMode.get('resume') === '1';

  let saved = null;
  try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) { /* ignore */ }
  if (!saved) {
    // Localized empty-sample label (was hardcoded EN — broke zh-Hant here).
    localBtn.textContent = t('entry.emptySample');
  } else {
    // Resume surface: a returning student sees "Continue my city" + when it was
    // last backed up, instead of a cold "start".
    localBtn.textContent = t('entry.continue');
    if (exampleBtn) exampleBtn.hidden = false;
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
    // Echo the planner's AI choices (goals + score) that travel with the layout.
    const planLine = document.getElementById('entry-plan');
    if (planLine) {
      let peek = null;
      try { peek = JSON.parse(saved); } catch { /* not json */ }
      const gl = peek && peek.goals && peek.goals.label ? String(peek.goals.label) : null;
      const sc = peek && Number.isFinite(+peek.plannerScore) ? Math.round(+peek.plannerScore) : null;
      if (gl || sc !== null) {
        const zh = (() => { try { return localStorage.getItem('hk_ai_city_lang_v1') === 'zh-Hant'; } catch { return false; } })();
        const name = gl || (zh ? '均衡目標' : 'Balanced');
        const line = (zh ? '🌆 規劃師 AI：' : '🌆 Planner AI: ') + name + (sc !== null ? (zh ? ' · 得分 ' : ' · score ') + sc : '');
        planLine.textContent = line;
        planLine.hidden = false;
      }
    }
  }

  const begin = (raw) => {
    if (entryStarting || restoreActive) return;
    if (!loadLayout(raw)) return;
    if (!isWebGLAvailable()) {
      showBootError(t('ui.webgl'));
      return;
    }
    entryStarting = true;
    overlay.classList.add('hidden');
    boot().finally(() => { entryStarting = false; });
  };

  localBtn.addEventListener('click', () => {
    if (retryPending && retryLayoutRaw) {
      try { begin(JSON.parse(retryLayoutRaw)); return; }
      catch (e) { console.warn('[city-builder] retry layout was unreadable', e); }
    }
    if (saved) {
      try { _exampleSession = false; begin(JSON.parse(saved)); }
      catch (e) {
        // Saved city JSON is corrupt — fall back to the sample, but say so so
        // the child isn't silently staring at a city they didn't build.
        showEntryError(t('ui.badSaved'));
        begin(sampleLayout());
      }
    }
    else begin(sampleLayout());
  });
  exampleBtn?.addEventListener('click', () => begin(sampleLayout()));
  // The Champion Hub exposes the example as a permanent, separate choice.
  // Never overwrite the child's stored layout: start a sample session directly
  // even when a saved city exists on this device.
  if (forceExample) {
    if (previewExampleDraft) {
      const draft = readExampleDraft();
      if (!draft) showEntryError('The example draft is missing or invalid. Return to Edit plan to open the example again.');
      else {
        sampleLayout(false); // apply the example presentation and session controls
        begin(draft);
      }
    } else begin(sampleLayout());
  } else if (forceResume) {
    // Resume is intentionally strict: a missing or malformed saved layout stays
    // on the entry screen and never turns into the bundled example silently.
    if (!saved) showEntryError(t('ui.badSaved'));
    else {
      try {
        _exampleSession = false;
        const parsed = JSON.parse(saved);
        if (validateLayout(parsed).ok) begin(parsed);
        else showEntryError(t('ui.badSaved'));
      } catch { showEntryError(t('ui.badSaved')); }
    }
    history.replaceState(null, '', '/city-builder/');
  }
  // The native <label for="file-input"> opens the picker on every browser,
  // including iPad/iOS where a programmatic input.click() fallback would cancel
  // the label's reliable activation and then get silently ignored. So there is
  // deliberately NO click handler here — the change event loads the file.
  fileInput.addEventListener('change', () => {
    const f = fileInput.files[0];
    if (!f) return;
    if (f.size > MAX_IMPORT_BYTES) { showEntryError(t('ui.tooLarge')); fileInput.value = ""; return; }
    const reader = new FileReader();
    reader.onerror = () => showEntryError(t('ui.readFail'));
    reader.onload = () => {
      // Champion File (restore EVERYTHING) or a legacy layout JSON.
      if (!importChampionFile(reader.result)) {
        try { _exampleSession = false; begin(JSON.parse(reader.result)); } catch (e) { showEntryError(t('ui.invalid')); }
      }
    };
    reader.readAsText(f);
  });
  pasteBtn.addEventListener('click', () => { pasteWrap.style.display = pasteWrap.style.display === 'none' ? 'block' : 'none'; });
  pasteGo.addEventListener('click', () => {
    if (!importChampionFile(pasteBox.value)) {
      try { _exampleSession = false; begin(JSON.parse(pasteBox.value)); } catch (e) { showEntryError(t('ui.invalid')); }
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
      const result = await importCustomChampion(f);
      skinStatus.textContent = result.ok ? tf('ui.skinSaved',{name:f.name}) : result.message;
    });
  }
  // Auto-load from the planner handoff (?from=planner) — "build it, then walk
  // into it" with zero extra taps. Same-origin localStorage carries the layout.
  // Fully guarded: corrupt/absent JSON falls through to the normal entry overlay.
  const fromPlanner = entryMode.get('from') === 'planner';
  if (fromPlanner && saved) {
    try {
      _exampleSession = false;
      begin(JSON.parse(saved));
      const mode = new URLSearchParams(location.search).get('mode');
      history.replaceState(null, '', mode === 'decorate' ? '/city-builder/?mode=decorate' : '/city-builder/'); // tidy the URL
    } catch (e) {
      // corrupt save → fall through; the overlay shows "Start my saved city"
    }
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
  entryStarting = false;
  // Never leave the loading spinner frozen: surface a clear error + retry.
  clearTimeout(_bootWatchdog);   // boot failed (or watchdog fired) — no more retries needed
  const loading = document.getElementById('loading');
  const fill = document.getElementById('loading-fill');
  if (fill) fill.style.width = '100%';
  const err = document.getElementById('entry-error');
  if (err) { err.textContent = '⚠️ ' + msg; err.hidden = false; }
  const localBtn = document.getElementById('entry-local');
  if (localBtn) localBtn.textContent = t('ui.retry');
  const overlay = document.getElementById('entry-overlay');
  if (overlay) overlay.classList.remove('hidden');
  if (loading) loading.classList.add('done');   // hide the loading overlay
}

function failBoot(gen, stage, error) {
  if (gen !== _bootGen) return;
  const diagnostic = { stage, reason: error?.message || String(error), generation: gen };
  console.error('[city-builder] boot failed', diagnostic, error);
  window.__bootError = diagnostic;
  retryPending = !!retryLayoutRaw;
  _bootOwner?.cancel();
  cleanupBootSystems();
  disposeBootRenderer();
  showBootError(stage === 'building-model' ? diagnostic.reason : t('ui.bootError'));
}

async function boot() {
  window.__bootError = null;
  try {
    await bootInner();
  } catch (e) {
    if (e && e.name === 'StaleBootError') return;
    failBoot(_bootGen, e?.stage || 'required-city-ready', e);
  }
}

async function bootInner() {
  // Invalidate any previous boot's loop and tear down its scene/renderer.
  const gen = ++_bootGen;
  document.getElementById('loading')?.classList.remove('done');
  const entryError = document.getElementById('entry-error');
  if (entryError) entryError.hidden = true;
  _bootOwner?.cancel();
  const owner = createBootOwner(gen, window);
  _bootOwner = owner;
  const loadingDiagnostics = {
    generation: gen, phase: 'booting', startedAt: Date.now(), completedAt: null,
    queueStats: null, assets: { buildings: {}, traffic: {} }, failures: [],
  };
  const loadQueue = createLoadQueue({
    concurrency: _exampleSession ? 2 : (IS_WEBKIT ? 2 : (IS_MOBILE ? 3 : 4)),
    isActive: () => owner.active && gen === _bootGen,
    onChange: stats => { loadingDiagnostics.queueStats = stats; },
  });
  loadingDiagnostics.queue = () => loadQueue.stats();
  owner.own(() => loadQueue.cancel());
  _contextPaused = false;
  window.__cityHandleGlobalError = (event, error) => {
    if (!owner.active || gen !== _bootGen || loadingDiagnostics.phase !== 'booting') return false;
    event?.preventDefault?.();
    failBoot(gen, 'uncaught-required-boot', error || new Error('uncaught boot failure'));
    return true;
  };
  // Watchdog: if boot hangs (a loadAsync that never settles on a flaky network),
  // surface the retry screen instead of a frozen loading bar. Cleared on success
  // (end of bootInner) and on failure (showBootError).
  clearTimeout(_bootWatchdog);
  _bootWatchdog = owner.timeout(() => {
    const loading = document.getElementById('loading');
    if (loading && !loading.classList.contains('done')) {
      const error = new Error(t('ui.bootSlow'));
      error.stage = 'city-ready-deadline';
      failBoot(gen, error.stage, error);
    }
  }, window.__CITY_BOOT_DEADLINE_MS__ ?? BOOT_TIMEOUT_MS);
  const loadingSub = document.querySelector('#loading .loading-sub');
  if (loadingSub) loadingSub.textContent = currentLang() === 'zh-Hant' ? '正在準備道路、冠軍和建築模型。' : 'Preparing roads, your Champion, and building models.';
  let buildingProgressText = null;
  let slowCopyShown = false;
  owner.timeout(() => {
    if (loadingDiagnostics.phase === 'booting' && loadingSub) {
      slowCopyShown = true;
      loadingSub.textContent = t('ui.bootStillBuilding');
    }
  }, window.__CITY_BOOT_SLOW_COPY_MS__ ?? BOOT_SLOW_COPY_MS);

  // Resilience: one bad model or build step must never take down the whole
  // city. Every step is wrapped — failures log + continue (the city degrades
  // gracefully: missing trees/models rather than a blank boot error).
  const warn = (name, e) => console.warn(`[city-builder] ${name} failed (continuing):`, e);
  const safe = (name, fn) => { try { return fn(); } catch (e) { warn(name, e); return null; } };
  const safeAwait = async (name, p) => { try { const value=await p; return owner.active ? value : null; } catch (e) { warn(name, e); return null; } };
  const assertActive = () => { if (!owner.active || gen !== _bootGen) { const e=new Error('boot replaced');e.name='StaleBootError';throw e; } };

  city = { loading: loadingDiagnostics };
  const primaryAssetPromises = [];
  // Deterministic test seam for the retry lifecycle; never enabled by normal
  // application state.
  const forcedFailure = typeof window.__CITY_FORCE_BOOT_FAILURE__ === 'function'
    ? window.__CITY_FORCE_BOOT_FAILURE__(gen)
    : window.__CITY_FORCE_BOOT_FAILURE__;
  if (forcedFailure) {
    const error = new Error('forced boot failure');
    error.stage = 'renderer-setup';
    throw error;
  }
  _naturePlacements=[];_natureBatches=[];
  _treePlacements=[];_treeSafetyPlacements=[];
  _grassMats.clear();
  city.natureScenery={batches:_natureBatches,get drawCalls(){return _natureBatches.length;},get instances(){return 0;},get triangles(){return 0;}};
  setupScene(owner);
  labelRenderer = createLabelRenderer(stage);
  initI18n();
  applyStatic();
  mountLangToggle();

  const fill = document.getElementById('loading-fill');
  fill.style.width = '25%';
  safe('road-textures', () => loadRoadTextures(gen, renderer));   // async — roads upgrade from flat charcoal to textured asphalt
  if(layout.autoScenery!==false)safe('nature-filler', () => loadNatureFiller(gen,
    _exampleSession ? PARK_VEGETATION_ASSETS.slice(0, 1) : PARK_VEGETATION_ASSETS));
  fill.style.width = '60%';

  safe('tree-variants', buildTreeVariants);
  safe('parks', carveParks);
  safe('roads', carveRoads);
  // (Tree placements are flushed in startDeferredAssets, after the tree GLBs
  // resolve — flushing here would flush before _treeVariants is populated.)
  city.scenery={treePlacements:_treeSafetyPlacements,roadNetwork:roadBarrierNetwork,
    isTreePlacementSafe:(tree)=>isRoadsideSceneryClear(roadBarrierNetwork,tree.x,tree.z,tree.radius,8)};
  safe('flush-nature', flushNatureFiller);  // placements queued during carve; flush what's loaded
  safe('quest-landmarks', buildQuestLandmarks);
  let activeLibraryIds = new Set();
  safe('generic-facilities', () => { activeLibraryIds = buildGenericFacilities() || new Set(); });
  safe('building-shadows', addBuildingContactShadows);
  // Traffic owns only the road graph and the already-known spawn point. Start
  // it before the Champion GLB so simulation and independent Audi streaming do
  // not wait on an unrelated avatar download.
  const initialSpawn = findSpawn();
  city.spawnWorld = new THREE.Vector3(initialSpawn.x, 0, initialSpawn.z);
  safe('road-traffic', setupRoadTraffic);
  fill.style.width = '80%';
  // Start the permanent destinations first. Their readable fallbacks remain
  // available if either appearance file cannot be decoded.
  const gatewayLoads = safe('learning-gateways', () => buildCityGateways(gen, loadQueue)) || [];
  // Queue by distinct model id; repeats at many lots share one loaded GLB.
  const customRoleManifest = readCustomManifest();
  const requiredBuildingLoads = [];
  const loadRoleVisual = (type, url) => {
    const customId = _exampleSession ? null : resolveCustomOverride(type, customRoleManifest);
    return customId ? loadCustomBuildingModel(type, customId, gen, loadQueue) : loadBuildingModel(type, url, gen, loadQueue);
  };
  const jobs = [];
  for (const [type, url] of [...Object.entries(GLB_BUILDING_TYPES), ...Object.entries(SPECIAL_BUILDING_MODELS)]) {
    if (glbState[type]?.spots.length) jobs.push({ type, url, role: true, custom: !_exampleSession && !!resolveCustomOverride(type, customRoleManifest), priority: buildingLoadPriority(glbState[type].spots) });
  }
  for (const id of activeLibraryIds) {
    const item = libraryItem(id);
    if (item) jobs.push({ type: id, url: item.glb, role: false, custom: false, priority: buildingLoadPriority(glbState[id]?.spots) });
  }
  const selectedVariantIds = new Set(Object.values(hunyuanSelection.assignments));
  for (const id of selectedVariantIds) {
    const item = libraryItem(id);
    if (item && !jobs.some(job => job.type === id)) jobs.push({ type: id, url: item.glb, variant: true, custom: false, priority: 0 });
  }
  jobs.sort((a, b) => Number(b.type === 'recycling') - Number(a.type === 'recycling') || b.priority - a.priority || a.type.localeCompare(b.type));
  const openingJobs = jobs;
  let settledBuildings = 0;
  const reportBuildingProgress = () => {
    if (!owner.active || gen !== _bootGen) return;
    fill.style.width = `${80 + Math.round(19 * settledBuildings / Math.max(1, openingJobs.length))}%`;
    buildingProgressText = currentLang() === 'zh-Hant'
      ? `正在載入建築模型 ${settledBuildings}/${openingJobs.length}`
      : `Loading building models ${settledBuildings}/${openingJobs.length}`;
    if (loadingSub && !slowCopyShown) loadingSub.textContent = buildingProgressText;
  };
  reportBuildingProgress();
  for (const job of openingJobs) {
    const promise = (job.role ? loadRoleVisual(job.type, job.url) : loadBuildingModel(job.type, job.url, gen, loadQueue))
      .then(model => {
        if (model && selectedVariantIds.has(job.type)) {
          hunyuanVariantModels[job.type] = { model, size: glbState[job.type].size };
          for (const type of ['housing', 'shop', 'office', 'school', 'library']) {
            if (glbState[type]?.model && glbState[type].spots.some(spot => spot.variant === job.type)) applyBuildingModel(type);
          }
        }
        return model;
      }).finally(() => { settledBuildings++; reportBuildingProgress(); });
    requiredBuildingLoads.push({ job, promise });
    primaryAssetPromises.push(promise);
  }

  // Cosmetic variants, accessories and street decoration wait until after the
  // usable city is mounted. Their starts are owned by this boot.
  const startDeferredAssets = () => {
    // Landscape and sidewalk GLBs are enhancements only. The procedural park,
    // trees and road network were built above, so a slow model must never keep
    // the child on the loading screen.
    const current = () => owner.active && gen === _bootGen;
    const optional = [];
    optional.push(Promise.all([
      _exampleSession ? Promise.resolve(null) : loadTreeModels(current),
      loadTreePacks(current, _exampleSession ? 1 : Infinity),
    ]).then(() => { if (current()) { buildTreeVariants(); flushTrees(); } })
      .catch(e => console.warn('[city-builder] optional landscape unavailable', e)));
    // Keep the example's smaller optional landscape wave.
    if (_exampleSession) return Promise.allSettled(optional);
    optional.push(createStreetProps(scene, layout).then(props => {
      if (!current()) { props?.destroy?.(); return; }
      streetProps = props;
      city.streetProps = props;
    }).catch(e => console.warn('[city-builder] optional street props unavailable', e)));
    // Optional scenery starts only after the required building set is ready.
    if(glbState.housing?.spots.length && !_exampleSession)loadHousingVariants(gen,loadQueue);
    if(glbState.office?.spots.length && !_exampleSession)loadOfficeVariants(gen,loadQueue);
    if (layout.autoScenery !== false && !_exampleSession) {
      rareLandmark = mountEmeraldRainTree(gen, loadQueue);
    }
    if(layout.autoScenery!==false && !_exampleSession) {
      for (const key of Object.keys(PARKED_VEHICLES)) loadParkedVehicleModel(key,gen,loadQueue);
      scatterStreetDeco(scene, layout, {schedule:(task)=>loadQueue.add(task,{onStale:disposeDetachedModel})});
      const plannedSpaces = createNeighbourhood(layout, {mobile:IS_MOBILE, roads:publicRoads, crossings:publicCrossings}).spaces;
      optional.push(createStreetFurniture(scene, layout, {schedule:(task)=>loadQueue.add(task,{onStale:disposeDetachedModel}),exclude:(x,z)=>plannedSpaces.some(p=>Math.hypot(p.x-x,p.z-z)<p.radius+2)})
        .catch((e) => console.warn('[city-builder] street furniture init failed', e)));
    }
    return Promise.allSettled(optional);
  };

  // Load the child's uploaded "fitted champion" GLB (Fit Studio) so it becomes
  // the default skin this session. Read from IndexedDB → object URL.
  const customBlob = await safeAwait('custom-skin', loadCustomSkinBlob());
  _customSkinMetadata = await safeAwait('custom-skin-metadata', loadCustomSkinMetadata());
  assertActive();
  if (customBlob) {
    if (_customSkinUrl) revokeObjectUrl(_customSkinUrl);
    _customSkinUrl = blobToObjectUrl(customBlob);
  }

  let championDeadlineActive = true;
  await safeAwait('champion', withDeadline(
    () => spawnChampion(() => championDeadlineActive && owner.active && gen === _bootGen),
    { owner, ms: window.__CITY_CHAMPION_TIMEOUT_MS__ ?? CHAMPION_TIMEOUT_MS, label: 'champion', onExpire: () => { championDeadlineActive = false; } },
  ));
  assertActive();
  safe('air-traffic', setupAirTraffic);
  safe('renderer-interaction', () => wireRendererInteraction(owner));

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
      <span id="resize-value">100%</span>
      <button type="button" class="resize-remove" hidden></button>`;
    document.body.appendChild(panel);
    const slider = panel.querySelector('#resize-slider');
    const valueEl = panel.querySelector('#resize-value');
    const removeButton = panel.querySelector('.resize-remove');
    removeButton.addEventListener('click', () => propLibrary?.removeSelected());
    slider.addEventListener('pointerdown', () => {
      propLibrary?.beginTransform(grab?.getSelected() || grab?.holding);
    });
    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      valueEl.textContent = Math.round(v * 100) + '%';
      if (grab) {
        grab.setSelectedScale(v);
        propLibrary?.updateTransform(grab.getSelected() || grab.holding, true);
        navObstacleRevision++;
      }
    });
    slider.addEventListener('change', () => propLibrary?.endTransform());
    slider.addEventListener('blur', () => propLibrary?.endTransform());
    const style = document.createElement('style');
    style.textContent = `
      .resize-panel{
        position:fixed; left:50%; bottom:96px; transform:translateX(-50%);
        display:flex; align-items:center; gap:10px; z-index:40;
        background:rgba(8,14,24,.9); border:1px solid rgba(255,255,255,.16);
        border-radius:12px; padding:10px 16px; font:14px/1.2 system-ui,sans-serif; color:#f8fafc;
        box-shadow:0 6px 24px rgba(0,0,0,.35); pointer-events:auto;
      }
      .resize-panel[hidden]{ display:none !important; }
      .resize-panel label{ font-weight:700; color:#cfe9ff; }
      .resize-panel input[type=range]{ width:150px; height:44px; accent-color:#00f2fe; margin:0; }
      .resize-panel input[type=range]::-webkit-slider-thumb{
        -webkit-appearance:none; appearance:none;
        width:28px; height:28px; border-radius:50%;
        background:#00f2fe; border:2px solid #06233a; cursor:pointer;
      }
      .resize-panel input[type=range]::-moz-range-thumb{
        width:28px; height:28px; border-radius:50%;
        background:#00f2fe; border:2px solid #06233a; cursor:pointer;
      }
      .resize-panel span{ min-width:42px; text-align:right; color:#9fd8ff; font-weight:600; }
      .resize-panel .resize-remove{ min-width:74px; min-height:44px; padding:0 12px; border:1px solid #df7084; border-radius:8px; background:#3a1e2a; color:#ffd3db; font:700 14px system-ui,sans-serif; cursor:pointer; }
      .resize-panel .resize-remove:disabled{ opacity:.45; cursor:not-allowed; }
      .resize-panel .resize-remove:focus-visible{ outline:3px solid #ffb84c; outline-offset:2px; }
      @media(max-width:480px){ .resize-panel{ width:calc(100vw - 24px); box-sizing:border-box; padding:8px 10px; gap:7px; } .resize-panel input[type=range]{ width:auto; min-width:60px; flex:1; } }
    `;
    document.head.appendChild(style);
    panel.hidden = true;
    disposeResizePanel = () => { panel.remove(); style.remove(); _resizePanel = null; };
    _resizePanel = {
      panel,
      setVisible(v) { panel.hidden = !v; },
      setModelState(state) {
        panel.hidden = !state;
        removeButton.hidden = !state;
        removeButton.disabled = !!state?.locked;
        slider.disabled = !!state?.locked;
        removeButton.textContent = t('props.remove');
        removeButton.setAttribute('aria-label', t('props.remove'));
      },
      reset() { slider.value = 1; valueEl.textContent = '100%'; },
    };
    return _resizePanel;
  }

  // Grab / select / pick-up / move system for placed library models.
  cleanupPropTools();
  safe('grab', () => {
    const resolveCityPlacement = ({ position, footprint, rotation }) => resolveRoadSafePlacement({
      position, footprint, rotation, roads: layout,
      bounds: [0, 0, layout.scaleMeters || 2000, layout.scaleMeters || 2000],
      obstacles: (layout.buildings || []).map((b) => ({ pos: b.pos, footprint: b.footprint || typeSpec(b.type)?.footprint, rotation: b.rotation || 0 })),
      maxDistance: 60,
    });
    grab = createGrabSystem(scene, {
      getChampion: () => champion,
      getCamera: () => camera,
      getScene: () => scene,
      colliders: buildingPlacementColliders,
      resolvePlacement: resolveCityPlacement,
      onToast: showToast,
      onSelection: (sel) => {
        const rs = mountResizeSlider();
        if (sel) rs.reset();
        propLibrary?.selectMesh(sel);
        if (!propLibrary) rs.setVisible(false);
      },
      onDrop: (item) => {
        propLibrary?.updateTransform(item);
        navObstacleRevision++;
      },
    });
    window.__grab = grab;
    window.__drive = { get active() { return drivingCar ? drivingCar.isActive() : false; }, car: drivingCar };
  });

  safe('chat', () => mountChat(owner));
  safe('badges', mountBadgeUi);
  safe('my-work', () => { myWork?.dispose(); learningVisuals?.destroy?.(); learningVisuals = createLearningVisuals(scene); window.__learningVisuals = learningVisuals; myWork = mountMyWork({
    layout, readPlantedCaps, readLastDecisions, openPlan: openPlanModal,
    hasPlan: () => !!_plannerPlan, openGame: openMinigame,
    navigate: (b, fly) => fly ? sim?.flyTo(b) : sim?.walkTo(b),
    sourceLayout: () => { try { return JSON.parse(originalPlanRaw); } catch { return null; } },
    showVisitorRoute: result => learningVisuals?.showVisitorRoute(result),
    clearVisitorRoute: () => learningVisuals?.clearVisitor(),
    showDelivery: (state, graph) => {
      const depot = layout.buildings.find(b => b.type === 'delivery') || layout.buildings.find(b => b.type === 'drone_routing');
      return learningVisuals?.showDelivery(state, graph, depot ? { x: depot.pos[0], z: depot.pos[1] } : { x: 0, z: 0 });
    },
    getPropsEnvelope: () => propLibrary?.readEnvelope?.(),
    replacePropsEnvelope: next => propLibrary?.replaceEnvelope?.(next) || false,
  }); });
  safe('capabilities', mountCapabilityUi);
  safe('skins', () => mountSkins(owner));
  safe('ai-nodes', () => { try { if (_aiNodes && _aiNodes.dispose) _aiNodes.dispose(); _aiNodes = mountCityAiNodes(scene, city, layout, {paused:()=>_contextPaused,reducedMotion:()=>reducedMotion.matches}); } catch (e) { console.warn('[city-builder] ai-nodes mount failed', e); } });
  safe('input', wireInput);
  safe('quest-prompt', wireQuestPrompt);

  // In-scenario model library: 🧰 button → pick a prop → tap-to-place on the
  // ground. Placements persist per scenario in localStorage. A little dust puff
  // celebrates each placement. Models come from the shared library catalog.
  // Every placed prop is registered with the grab system so it can be selected,
  // picked up and moved around (🎯 button).
  safe('prop-library', () => {
    placementDust = new ParticlePool(scene, 40);
    propLibrary = mountPropLibrary({
      scene, camera, renderer,
      storageKey: 'hk_ai_city_props_citybuilder_v1',
      resolvePlacement: ({ position, footprint, rotation }) => resolveRoadSafePlacement({
        position, footprint, rotation, roads: layout,
        bounds: [0, 0, layout.scaleMeters || 2000, layout.scaleMeters || 2000],
        obstacles: (layout.buildings || []).map((b) => ({ pos: b.pos, footprint: b.footprint || typeSpec(b.type)?.footprint, rotation: b.rotation || 0 })),
        maxDistance: 60,
      }),
      onPlaced: (x, z) => placementDust.spawn({ x, y: 0, z }, 6, 0.8, 1.6),
      onPlacedMesh: (mesh, item) => { environmentProps.add(mesh); registerGrabbableProp(mesh, item); },
      onRemovedMesh: mesh => { environmentProps.delete(mesh); grab?.unregister(mesh); navObstacleRevision++; },
      onChanged: (records) => rareLandmark?.refresh(records),
      onPlacementDone: (mesh) => { if (grab && mesh) grab.select(mesh); },
      onPlacementEnd: () => { if (grab) grab.clearSelection(); },
      onInspectorClearSelection: () => { if (grab) grab.clearSelection(); },
      onSelectedChange: state => mountResizeSlider().setModelState(state),
      getCapabilities: readPlantedCaps,
    });
    rareLandmark?.refresh(propLibrary.getRecords?.() || []);
  });
  safe('focused-ui', () => {
    focusedUI?.dispose?.();
    focusedUI = mountFocusedCityUI({ propLibrary, myWork, onModeChange: (mode) => {
      selectMode = mode === 'decorate';
      if (mode === 'decorate') clearInput();
      if (mode === 'explore') grab?.clearSelection?.();
    }});
    window.__focusedCityUI = focusedUI;
  });

  // Reveal the City after assigned models settle. A failed file keeps its
  // labelled plot, so an asset error never prevents the child from entering.
  await Promise.all([
    Promise.all(requiredBuildingLoads.map(({ promise }) => promise)),
    Promise.allSettled(gatewayLoads),
  ]);
  assertActive();
  document.getElementById('loading').classList.add('done');
  fill.style.width = '100%';
  // The child's first usable frame is the overview. Asset loading can outlast
  // Champion creation, so start the intro clock here (not at GLB completion).
  if (cityFocusBounds) {
    orbit.target.set((cityFocusBounds.minX + cityFocusBounds.maxX) / 2, 0, (cityFocusBounds.minZ + cityFocusBounds.maxZ) / 2);
    orbit.dist = orbit.distOverview;
    orbit.introUntil = performance.now() + (_exampleSession ? 12000 : 15000);
  }
  loadingDiagnostics.phase = 'usable';
  clearTimeout(_bootWatchdog);   // boot completed — disarm the hang guard
  // Non-blocking warning: a city with no roads renders as a bare ground (no
  // streets, streetlights, cars or road trees). Let the child know WHY instead
  // of leaving them confused — pure toast, never blocks or traps.
  if (!(layout.roads || []).length) {
    owner.timeout(() => {
      showToast(t('toast.noRoads'));
    }, 1200);
  } else if (!traffic) {
    // Roads exist but form no closed circuit, so ambient traffic deliberately
    // stays away (no U-turns / vanishing cars). This is a hint, never a block:
    // the city boots and plays normally. The fix lives in the 2D planner.
    owner.timeout(() => {
      showToast(t('toast.noTrafficLoop'));
    }, 1800);
  }
  window.__scene = scene;   // debug hook (harmless)
  window.__layout = layout; // debug hook
  city.navigation = {
    get walking() { return !!walkNav; },
    get flying() { return !!taxiNav; },
    get waypoint() { return walkNav?.points?.[walkNav.index] || null; },
  };
  city.openPurpose = openPurpose; // diagnostics for saved purpose content; no building interaction calls this
  city.sim = sim;
  city.questRefs = specialSystem?.questRefs;
  window.__city = city;     // debug hook (champion/taxi/pedestrians handles)
  startLoop(owner);
  const streamingStatus = document.getElementById('streaming-status');
  const trafficReady = traffic?.realisticFleet?.ready;
  const primaryStreaming = [...primaryAssetPromises, ...(trafficReady ? [trafficReady] : [])];
  loadingDiagnostics.phase = 'streaming';
  if (streamingStatus) { streamingStatus.textContent = t('ui.cityStreaming'); streamingStatus.hidden = false; }
  owner.defer(async () => {
    try {
      const deferred = startDeferredAssets();
      await Promise.allSettled([...primaryStreaming, deferred]);
      await loadQueue.whenIdle();
      if (!owner.active || gen !== _bootGen) return;
      loadingDiagnostics.assets.buildings = Object.fromEntries(Object.entries(glbState).slice(0, 64).map(([id, state]) => [id, {
        state: state.status || (state.model ? 'loaded' : 'idle'), reason: state.reason || null, instances: state.applied?.length || 0,
      }]));
      loadingDiagnostics.assets.traffic = Object.fromEntries(Object.entries(traffic?.realisticFleet?.models || {}).slice(0, 8));
      const failures = [
        ...Object.entries(loadingDiagnostics.assets.buildings).filter(([, value]) => value.state === 'failed').map(([id, value]) => ({ kind: 'building', id, reason: value.reason })),
        ...Object.entries(loadingDiagnostics.assets.traffic).filter(([, value]) => value.state === 'failed').map(([id, value]) => ({ kind: 'traffic', id, reason: value.reason })),
      ].slice(0, 32);
      loadingDiagnostics.failures = failures;
      loadingDiagnostics.phase = failures.length ? 'failed' : 'complete';
      loadingDiagnostics.completedAt = Date.now();
      if (streamingStatus) streamingStatus.hidden = true;
    } catch (error) {
      if (!owner.active || gen !== _bootGen) return;
      loadingDiagnostics.phase = 'failed';
      loadingDiagnostics.failures = [{ kind: 'streaming', id: 'settlement', reason: (error?.name || 'error').slice(0, 48) }];
      if (streamingStatus) streamingStatus.hidden = true;
    }
  }, 1200);
}

// ─── Init ─────────────────────────────────────────────────────────────────
initI18n();          // resolve the saved/browser language BEFORE first paint
applyStatic();       // localize the entry overlay before it's shown
// Planner plan panel: the 🌆 HUD chip opens the weighted breakdown carried
// from the 2D planner, so the child's planning reasoning survives the crossover.
(function wirePlanModal() {
  const chip = document.getElementById('plan-ai-chip');
  const modal = document.getElementById('plan-modal');
  if (chip) chip.addEventListener('click', openPlanModal);
  if (modal) modal.querySelectorAll('[data-plan-close]').forEach((el) => el.addEventListener('click', () => modal.classList.add('hidden')));
})();
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
