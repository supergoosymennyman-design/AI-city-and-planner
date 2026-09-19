// city-assets.js — External GLB model loading for AI City Architect 3D.
// Loads open-source CC0/CC-BY low-poly models (Quaternius etc.) from ./assets/models/
// and provides calibrated clones + animation mixers for the simulation layer.
//
// Scale contract (matches the procedural world):
//   - Champion robot is ~1.8 units tall.
//   - Building meshes are ~2 units tall on a 4-unit tile.
//   - Vehicles move along roads (vehicle origin sits at its feet, y≈0.3 above ground).
//   - Citizens are ~1.6–1.8 units tall, feet at y=0.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();

// Registry: source file, and a calibration { scale, rotY } so every model lands
// at a sane size and faces +Z in the game. Calibrated from actual GLB bounds.
// Scale reference (matches the old procedural/gLB proportions that drove fine):
//   - old bus: 0.8w × 2.5l × 0.78h  → new bus3 (3.0×4.0×1.05) needs scale ≈ 0.55
//   - old truck: 1.5w × 2.9l × 1.6h → new dumptruck (6.0×10.5×5.2) needs scale ≈ 0.28
//   - cars: ~1.1w × 2.5l × 0.8h     → police (1.78×3.73×1.24) 0.67, taxi (1.81×4.22×1.31) 0.6
export const ASSETS = {
  bus:       { file: 'assets/models/bus.glb',        scale: 0.55,  rotY: -Math.PI / 2 },
  truck:     { file: 'assets/models/dumptruck.glb',  scale: 0.28,  rotY: 0 },
  police:    { file: 'assets/models/police.glb',     scale: 0.67,  rotY: 0 },
  taxi:      { file: 'assets/models/taxi.glb',       scale: 0.6,   rotY: 0 },
  ambulance: { file: 'assets/models/vehicles/ambulance.glb',  scale: 0.78,  rotY: 0 },
  firetruck: { file: 'assets/models/vehicles/firetruck.glb',  scale: 0.75,  rotY: 0 },
  trash:     { file: 'assets/models/trash.glb',      scale: 1.0,   rotY: 0 },
  // props (not pooled — placed once by the renderer)
  props: {
    trafficlight: { file: 'assets/models/trafficlight.glb', scale: 1.8, rotY: 0 },
    streetlight:  { file: 'assets/models/streetlight.glb',  scale: 0.45, rotY: 0 },
    bench:        { file: 'assets/models/bench.glb',        scale: 2.0, rotY: 0 },
    hydrant:      { file: 'assets/models/hydrant.glb',      scale: 0.01, rotY: 0 },
    trashcan:     { file: 'assets/models/trashcan.glb',     scale: 0.02, rotY: 0 },
    tree:         { file: 'assets/models/tree.glb',         scale: 0.8,  rotY: 0 },
    treePine:     { file: 'assets/models/tree-pine.glb',    scale: 1.6,  rotY: 0 },
    treeK:        { file: 'assets/models/trees/tree-k.glb',       scale: 1.1,  rotY: 0 },
    treeHigh:     { file: 'assets/models/trees/tree-high.glb',    scale: 0.9,  rotY: 0 },
    stopsign:     { file: 'assets/models/stopsign.glb',     scale: 0.01, rotY: 0 },
    busstop:      { file: 'assets/models/busstop.glb',      scale: 0.05, rotY: 0 },
    landingpad:   { file: 'assets/models/bldg_drone.glb',   scale: 1,    rotY: 0 },
  },
  citizens: [
    { file: 'assets/models/citizen-man.glb',     scale: 0.85, rotY: 0 },
    { file: 'assets/models/citizen-woman.glb',   scale: 0.85, rotY: 0 },
    { file: 'assets/models/citizen-worker.glb',  scale: 0.85, rotY: 0 },
    { file: 'assets/models/citizen-business.glb', scale: 0.85, rotY: 0 },
    { file: 'assets/models/citizen-casual.glb',  scale: 0.85, rotY: 0 },
    { file: 'assets/models/citizen-punk.glb',    scale: 0.85, rotY: 0 },
  ],
  // Buildings modelled in Blender at game scale (1 unit ≈ 1 tile-metre).
  // scale 1: the GLB is already at game scale, feet at y=0, origin at tile centre.
  buildings: {
    wind:     { file: 'assets/models/bldg_wind.glb',     scale: 1, rotY: 0 },
    water:    { file: 'assets/models/bldg_water.glb',    scale: 1, rotY: 0 },
    solar:    { file: 'assets/models/bldg_solar.glb',    scale: 1, rotY: 0 },
    hosp:     { file: 'assets/models/bldg_hosp.glb',     scale: 1, rotY: 0 },
    data:     { file: 'assets/models/bldg_data.glb',     scale: 1, rotY: 0 },
    emerg:    { file: 'assets/models/bldg_emerg.glb',    scale: 1, rotY: 0 },
    auditor:  { file: 'assets/models/bldg_auditor.glb',  scale: 1, rotY: 0 },
    recycle:  { file: 'assets/models/bldg_recycle.glb',  scale: 1, rotY: 0 },
    clinic:   { file: 'assets/models/bldg_clinic.glb',   scale: 1, rotY: 0 },
    depot:    { file: 'assets/models/bldg_depot.glb',    scale: 1, rotY: 0 },
    town:     { file: 'assets/models/bldg_town.glb',     scale: 1, rotY: 0 },
    collect:  { file: 'assets/models/bldg_collect.glb',  scale: 1, rotY: 0 },
    school:   { file: 'assets/models/bldg_school.glb',   scale: 0.2, rotY: 0 },
  },
};

// Animation name → clip lookup (the Quaternius armature uses "HumanArmature|X").
const ANIM_MAP = {
  idle: /Idle/i, walk: /Walk/i, run: /Run/i,
};

const cache = {};      // url -> Promise<gltf>
const clips = {};      // url -> Map<name, AnimationClip>
const assetsReady = new Promise((resolve, reject) => {
  const urls = [
    ASSETS.bus.file, ASSETS.truck.file, ASSETS.police.file, ASSETS.taxi.file,
    ASSETS.ambulance.file, ASSETS.firetruck.file, ASSETS.trash.file,
    ...Object.values(ASSETS.props).map(p => p.file),
    ...ASSETS.citizens.map(c => c.file),
    ...Object.values(ASSETS.buildings).map(b => b.file),
  ];
  let remaining = urls.length;
  urls.forEach(url => {
    cache[url] = loader.loadAsync(url)
      .then(gltf => {
        // index animations by clip name
        clips[url] = new Map();
        for (const c of gltf.animations) clips[url].set(c.name, c);
        return gltf;
      })
      .then(gltf => { if (--remaining === 0) resolve(); return gltf; })
      .catch(err => { console.warn('[assets] failed to load', url, err); if (--remaining === 0) resolve(); });
  });
});

export const whenAssetsReady = () => assetsReady;

// ---- Cloning helpers ----

// Clone the GLB scene once, apply calibration scale + rotation, and return a
// THREE.Group whose origin sits at the model's feet and faces +Z.
function makeClone(url, cfg) {
  return cache[url].then(gltf => {
    // A GLB that failed to load resolves to undefined here (the loader's catch
    // returns implicitly). Never crash on it — return a hidden empty group so
    // the simulation keeps running and the vehicle just doesn't render.
    if (!gltf || !gltf.scene) {
      console.warn('[assets] skipping failed clone for', url);
      const empty = new THREE.Group();
      empty.visible = false;
      empty.userData.clips = new Map();
      empty.userData.height = 1;
      return empty;
    }
    const root = gltf.scene.clone(true);
    root.traverse(o => {
      if (o.isMesh) o.castShadow = true;
    });
    const g = new THREE.Group();
    g.add(root);
    // Centre the clone horizontally and drop the feet to y=0, BEFORE applying
    // scale: Box3 in world space == local space here because g is unscaled yet.
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    root.position.x -= center.x;
    root.position.z -= center.z;
    root.position.y -= box.min.y;
    // apply calibration transform to the (now centred) group
    g.scale.setScalar(cfg.scale);
    g.rotation.y = cfg.rotY;
    // attach shared clip lookup
    g.userData.clips = clips[url];
    g.userData.height = size.y * cfg.scale;
    return g;
  });
}

// Pre-cached clone promises per URL.
const cloneCache = {};
function cloneOf(url, cfg) {
  if (!cloneCache[url]) cloneCache[url] = makeClone(url, cfg);
  return cloneCache[url];
}

// Public: return a Promise for a fresh clone of a named asset.
export function getVehicle(type) {
  const cfg = ASSETS[type];
  if (!cfg) return Promise.reject(new Error('unknown asset ' + type));
  return cloneOf(cfg.file, cfg).then(template => {
    const inst = template.clone(true);
    inst.userData.clips = template.userData.clips;
    inst.userData.height = template.userData.height;
    return inst;
  });
}

// Public: return a Promise for a fresh clone of a random citizen.
// ~15% are "children": the same rigged model scaled to 0.72, so walk animation
// still deforms correctly while reading clearly as a kid.
export function getCitizen() {
  const cfg = ASSETS.citizens[Math.floor(Math.random() * ASSETS.citizens.length)];
  return cloneOf(cfg.file, cfg).then(template => {
    const inst = template.clone(true);
    inst.userData.clips = template.userData.clips;
    inst.userData.height = template.userData.height;
    if (Math.random() < 0.15) {
      inst.scale.multiplyScalar(0.72);
      inst.userData.height *= 0.72;
      inst.userData.isChild = true;
    }
    // random starting Y-rotation so citizens face different directions
    inst.rotation.y = Math.random() * Math.PI * 2;
    return inst;
  });
}

// Public: return a Promise for a fresh clone of a named building GLB
// (already at game scale, origin at tile centre, feet at y=0).
export function getBuilding(type) {
  const cfg = ASSETS.buildings[type];
  if (!cfg) return Promise.reject(new Error('no building asset for ' + type));
  return cloneOf(cfg.file, cfg).then(template => {
    const inst = template.clone(true);
    inst.userData.height = template.userData.height;
    return inst;
  });
}

// Public: which building types have an external GLB model?
export function hasBuildingModel(type) {
  return !!ASSETS.buildings[type];
}

// Public: return a Promise for a fresh clone of a named prop GLB.
export function getProp(type) {
  const cfg = ASSETS.props[type];
  if (!cfg) return Promise.reject(new Error('no prop asset for ' + type));
  return cloneOf(cfg.file, cfg).then(template => {
    const inst = template.clone(true);
    inst.userData.height = template.userData.height;
    return inst;
  });
}

// Build an AnimationMixer for a clone and play a named animation.
export function playAnim(clone, name) {
  const clipsMap = clone.userData.clips;
  if (!clipsMap) return null;
  const re = ANIM_MAP[name];
  if (!re) return null;
  let clip = null;
  for (const [key, c] of clipsMap) { if (re.test(key)) { clip = c; break; } }
  if (!clip) return null;
  const mixer = new THREE.AnimationMixer(clone);
  const action = mixer.clipAction(clip);
  action.play();
  return mixer;
}
