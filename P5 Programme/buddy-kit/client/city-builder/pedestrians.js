// pedestrians.js — robots + human citizens populating the city.
// Robots glide around (neon emissive, no rig); posed human citizens stand,
// walk, sit and wave near buildings (instanced static, no glow). Each type is
// instanced (one InstancedMesh per material group — multi-mesh GLBs are
// merged per material) so both populations stay cheap on tablets. Both spawn
// just outside a building's footprint, glide/wander toward near-building
// targets, turn to face their direction, and steer around building footprints.
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { createGLTFLoader } from '../shared/gltf.js';

// Add a new robot by dropping its GLB into assets/models/robots/ and appending
// here. (CC0-only: the previous MagicaVoxel/itch robots were removed — see
// library/CC0-MANIFEST.md. An empty list means no robots spawn.)
// All models are CC0 / public-domain (Kenney-style + Quaternius/Poly Pizza):
// humanoid robots, mechs, an android and a cute bot — no rig, no animation.
const ROBOT_MODELS = [
  '../library/characters/polypizza-robot.glb',      // humanoid robot (Quaternius)
  'assets/models/robots/robot-pm.glb',              // humanoid robot (Polygonal Mind)
  'assets/models/robots/robot-enemy.glb',           // combat robot (Quaternius)
  'assets/models/robots/mech-a.glb',                // mech (Quaternius)
  'assets/models/robots/robot-enemy-large.glb',     // large robot (Quaternius)
  'assets/models/robots/android-bot.glb',           // android bot (Armory_3D)
  'assets/models/robots/rolie.glb',                 // cute robot (scaranto)
];

// Human citizens — static posed people from the shared library (Quaternius,
// CC0, Blender-normalized so they're already grounded + natural poses). These
// are the "city is alive" layer: standing/walking/sitting/waving figures
// clustered around buildings, no robot glow, no rig needed (instanced static).
const CITIZEN_MODELS = [
  '../library/characters/quaternius-posed-male-standing.glb',
  '../library/characters/quaternius-posed-male-walking.glb',
  '../library/characters/quaternius-posed-male-sitting.glb',
  '../library/characters/quaternius-posed-male-waving.glb',
  '../library/characters/quaternius-posed-male-cheering.glb',
  '../library/characters/quaternius-posed-female-standing.glb',
  '../library/characters/quaternius-posed-female-walking.glb',
  '../library/characters/quaternius-posed-female-sitting.glb',
  '../library/characters/quaternius-posed-woman-waving.glb',
  '../library/characters/quaternius-posed-female-cheering.glb',
  '../library/characters/quaternius-animchar-chef-male.glb',
  '../library/characters/quaternius-animchar-doctor-male.glb',
  '../library/characters/quaternius-animchar-worker-male.glb',
  '../library/characters/quaternius-animchar-casual-male.glb',
  '../library/characters/quaternius-animchar-casual-female.glb',
];

const MIN_ROBOT_H = 1.0;         // m — small models are scaled up to at least this
const MAX_ROBOT_H = 4.5;         // m — big models are scaled down to at most this
const TURN_ANIM = 0.35;          // s — time to face a new direction
const REACH_DIST = 1.6;          // m — close enough to pick a new target

// Convert an InterleavedBufferAttribute to a plain BufferAttribute. three.js's
// BufferGeometryUtils cannot merge interleaved attributes, and Blender/glTF
// exports often interleave position/normal/uv — without this, robot GLBs fail
// the merge step.
function deinterleave(attr) {
  if (!attr || !attr.isInterleavedBufferAttribute) return attr;
  const src = attr.array;
  const count = attr.count, itemSize = attr.itemSize, stride = attr.stride, offset = attr.offset;
  const out = new (attr.array.constructor)(count * itemSize);
  for (let i = 0; i < count; i++) {
    for (let j = 0; j < itemSize; j++) out[i * itemSize + j] = src[i * stride + offset + j];
  }
  return new THREE.BufferAttribute(out, itemSize);
}

// Make a geometry safe for merging: keep only position/normal/uv, all as plain
// (non-interleaved) BufferAttributes.
function normalizeGeo(geo) {
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const pos = geo.attributes.position;
  const keep = { position: deinterleave(pos), normal: deinterleave(geo.attributes.normal) };
  if (geo.attributes.uv) keep.uv = deinterleave(geo.attributes.uv);
  else keep.uv = new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2);
  for (const name of Object.keys(geo.attributes)) {
    if (!keep[name]) geo.deleteAttribute(name);
  }
  for (const name of Object.keys(keep)) geo.setAttribute(name, keep[name]);
  return geo;
}

/**
 * Load every model of the given kind, merge each into one InstancedMesh per
 * material group, and spread `count` figures evenly across the types. Async +
 * graceful: returns null if the models fail so the city still runs.
 *
 * opts.kind: 'robot' (default — gliding patrol robots with a neon emissive
 * glow) or 'human' (static posed citizens, no glow). The two are separate
 * instanced populations, so both can coexist cheaply.
 */
export async function createPedestrians(scene, layout, opts = {}) {
  const kind = opts.kind === 'human' ? 'human' : 'robot';
  const MODELS = kind === 'human' ? CITIZEN_MODELS : ROBOT_MODELS;
  const bounds = opts.bounds || { minX: 0, maxX: 2000, minZ: 0, maxZ: 2000 };
  const area = Math.max(1, (bounds.maxX - bounds.minX) * (bounds.maxZ - bounds.minZ));
  const count = opts.count ?? Math.max(30, Math.min(120, Math.round(area / (25000 * (opts.density ?? 1)))));
  const rng = (opts.seed != null) ? mulberry32(opts.seed) : Math.random;

  // Load every model (each GLB may have many meshes/parts). One bad GLB
  // must not drop the whole crowd — load per-item and keep the ones that work.
  const loader = createGLTFLoader();
  const settled = await Promise.all(
    MODELS.map((f) => loader.loadAsync(f).catch((e) => { console.warn(`[pedestrians] ${kind} model failed`, f, e); return null; }))
  );
  const gltfs = settled.filter(Boolean);
  if (!gltfs.length) {
    console.warn(`[pedestrians] all ${kind} models failed to load — no ${kind}s`);
    return null;
  }

  // Build one type per GLB: merge meshes per material, bake node transforms
  // (the GLBs store models tiny with big node scale/rotation), clamp the
  // natural size into the height band, and create the InstancedMeshes.
  const types = [];     // { baseScale, baseMinY }
  const insts = [];     // per type: [InstancedMesh per material group]
  for (const gltf of gltfs) {
    gltf.scene.updateMatrixWorld(true);
    const meshObjs = [];
    gltf.scene.traverse((o) => { if (o.isMesh) meshObjs.push(o); });
    if (!meshObjs.length) continue;

    // Bake node transforms into each mesh's geometry (the GLBs store models
    // tiny with big node scale/rotation — without this, instances are
    // microscopic specks).
    const pieces = [];
    for (const m of meshObjs) {
      const mm = new THREE.Matrix4().copy(m.matrixWorld);
      mm.elements[12] = mm.elements[13] = mm.elements[14] = 0;   // drop translation
      const geo = normalizeGeo(m.geometry.clone());
      geo.applyMatrix4(mm);
      const mat = Array.isArray(m.material) ? m.material[0] : m.material;
      pieces.push({ geo, mat });
    }

    // Distinct materials used by this model.
    const mats = [];
    for (const p of pieces) if (!mats.includes(p.mat)) mats.push(p.mat);

    const groups = [];
    if (mats.length <= 1) {
      // Single material — merge geometries and keep it (textures preserved).
      const geos = pieces.map((p) => p.geo);
      const merged = geos.length > 1 ? BufferGeometryUtils.mergeGeometries(geos, false) : geos[0];
      if (mats[0] && kind === 'robot') { mats[0].emissive = new THREE.Color(0x244a78); mats[0].emissiveIntensity = 0.35; mats[0].needsUpdate = true; }
      groups.push({ geometry: merged, material: mats[0] });
    } else {
      // Multi-material model — bake each mesh's material colour into vertex
      // colours and merge into ONE geometry with one vertex-coloured material,
      // so the type stays a single InstancedMesh (draw call). Humans keep
      // their natural colours; robots get the neon emissive push.
      const geos = [];
      for (const p of pieces) {
        const g = p.geo;
        const color = (p.mat && p.mat.color) ? p.mat.color : new THREE.Color(0x8a8a8a);
        const n = g.attributes.position.count;
        const vc = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { vc[i * 3] = color.r; vc[i * 3 + 1] = color.g; vc[i * 3 + 2] = color.b; }
        g.setAttribute('color', new THREE.BufferAttribute(vc, 3));
        geos.push(g);
      }
      const merged = geos.length > 1 ? BufferGeometryUtils.mergeGeometries(geos, false) : geos[0];
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true });
      if (kind === 'robot') { mat.emissive = new THREE.Color(0x244a78); mat.emissiveIntensity = 0.35; }
      groups.push({ geometry: merged, material: mat });
    }

    const bb = new THREE.Box3();
    for (const gr of groups) {
      gr.geometry.computeBoundingBox();
      if (gr.geometry.boundingBox) bb.union(gr.geometry.boundingBox);
    }
    const H = bb.max.y - bb.min.y;
    if (!groups.length || !Number.isFinite(H) || H <= 0) {
      console.warn('[pedestrians] skipped a robot type (bad geometry)');
      continue;
    }
    const baseScale = Math.min(MAX_ROBOT_H, Math.max(MIN_ROBOT_H, H)) / H;
    const baseMinY = bb.min.y;

    const cap = Math.ceil(count / MODELS.length);
    const tInsts = groups.map((gr) => {
      const inst = new THREE.InstancedMesh(gr.geometry, gr.material, cap);
      inst.count = 0;
      inst.frustumCulled = false;      // robots span the whole city — never cull
      inst.castShadow = true;
      inst.receiveShadow = true;
      inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(inst);
      return inst;
    });

    types.push({ baseScale, baseMinY });
    insts.push(tInsts);
  }
  if (!types.length) return null;
  const numTypes = types.length;

  // Building footprints (with a 2 m margin) — robots avoid standing inside and
  // steer around them while gliding.
  const blds = (layout.buildings || []).map((b) => {
    const fp = b.footprint || [20, 20];
    return {
      x0: b.pos[0] - fp[0] / 2 - 2, x1: b.pos[0] + fp[0] / 2 + 2,
      z0: b.pos[1] - fp[1] / 2 - 2, z1: b.pos[1] + fp[1] / 2 + 2,
    };
  });
  const insideBuilding = (x, z) => blds.some((b) => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1);
  const boundsOk = (x, z) => x > bounds.minX + 20 && x < bounds.maxX - 20 && z > bounds.minZ + 20 && z < bounds.maxZ - 20;
  const clearSpot = () => {
    for (let i = 0; i < 20; i++) {
      const x = bounds.minX + 30 + rng() * (bounds.maxX - bounds.minX - 60);
      const z = bounds.minZ + 30 + rng() * (bounds.maxZ - bounds.minZ - 60);
      if (!insideBuilding(x, z)) return { x, z };
    }
    return { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 };
  };

  // Robots cluster around buildings (like the patrol drones): pick a random
  // building and a point just outside its footprint on clear ground.
  const nearBuildingSpot = () => {
    const buildings = layout.buildings || [];
    for (let tries = 0; tries < 30; tries++) {
      const b = buildings[Math.floor(rng() * buildings.length)];
      if (!b) continue;
      const fp = b.footprint || [20, 20];
      const side = Math.floor(rng() * 4);
      const margin = 3 + rng() * 12;             // 3–15 m off the wall
      let x, z;
      if (side === 0) { x = b.pos[0] + fp[0] / 2 + margin; z = b.pos[1] + (rng() - 0.5) * fp[1]; }
      else if (side === 1) { x = b.pos[0] - fp[0] / 2 - margin; z = b.pos[1] + (rng() - 0.5) * fp[1]; }
      else if (side === 2) { z = b.pos[1] + fp[1] / 2 + margin; x = b.pos[0] + (rng() - 0.5) * fp[0]; }
      else { z = b.pos[1] - fp[1] / 2 - margin; x = b.pos[0] + (rng() - 0.5) * fp[0]; }
      if (!boundsOk(x, z)) continue;
      if (insideBuilding(x, z)) continue;
      return { x, z };
    }
    return clearSpot();
  };

  // Even spread: round-robin robots across the types.
  const typeRobots = types.map(() => []);
  for (let i = 0; i < count; i++) {
    const t = i % numTypes;
    const start = nearBuildingSpot();
    typeRobots[t].push({
      pos: new THREE.Vector3(start.x, 0, start.z),
      target: nearBuildingSpot(),
      heading: rng() * Math.PI * 2,
      speed: 1.0 + rng() * 1.4,          // glide speed
      scale: types[t].baseScale * (0.9 + rng() * 0.25),
    });
  }

  const M = new THREE.Matrix4();
  const P = new THREE.Vector3();
  const Q = new THREE.Quaternion();
  const UP = new THREE.Vector3(0, 1, 0);
  const S = new THREE.Vector3();

  function writeMatrices() {
    for (let t = 0; t < numTypes; t++) {
      const robotsT = typeRobots[t];
      const tInsts = insts[t];
      for (let j = 0; j < robotsT.length; j++) {
        const r = robotsT[j];
        const sc = r.scale;
        Q.setFromAxisAngle(UP, r.heading);
        P.set(r.pos.x, -types[t].baseMinY * sc, r.pos.z);
        S.set(sc, sc, sc);
        M.compose(P, Q, S);
        for (const inst of tInsts) inst.setMatrixAt(j, M);
      }
      for (const inst of tInsts) {
        inst.count = robotsT.length;
        inst.instanceMatrix.needsUpdate = true;
      }
    }
  }
  writeMatrices();

  function update(dt) {
    for (let t = 0; t < numTypes; t++) {
      for (const r of typeRobots[t]) {
        const dx = r.target.x - r.pos.x, dz = r.target.z - r.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist < REACH_DIST) {
          r.target = nearBuildingSpot();
        } else {
          const targetHeading = Math.atan2(dx, dz);
          let diff = targetHeading - r.heading;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          r.heading += diff * Math.min(1, dt / TURN_ANIM);

          const nx = dx / dist, nz = dz / dist;
          const step = r.speed * dt;
          const px = r.pos.x + nx * step, pz = r.pos.z + nz * step;
          if (insideBuilding(px, pz)) {
            // Steer: slide along the wall if possible, else turn away.
            const slideX = !insideBuilding(px, r.pos.z);
            const slideZ = !insideBuilding(r.pos.x, pz);
            if (slideX) r.pos.x = px;
            else if (slideZ) r.pos.z = pz;
            else r.heading += (rng() - 0.5) * 1.6;
          } else {
            r.pos.x = px; r.pos.z = pz;
          }
        }
      }
    }
    writeMatrices();
  }

  return { update, getCount: () => count };
}

/** Deterministic PRNG (mulberry32) so headless tests can reproduce runs. */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
