// street-props.js — streetlights + benches scattered around the city.
// Streetlights line both sides of every road (offset from the centreline so
// they sit on the pavement); benches gather around parks. All static and cheap:
// each prop type is ONE InstancedMesh (per normalized model), not a clone per
// placement — ~250-450 streetlights become a single draw call.
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { createGLTFLoader } from '../shared/gltf.js';

const STREETLIGHT_EVERY = 30;   // m between streetlights along a road
const STREETLIGHT_OFFSET = 3.2; // m from road centreline to the lamp post
const STREETLIGHT_SCALE = 0.018; // model is 100× FBX units; ~1.8m tall real
const BENCH_PARK_DIST = 6;      // m from park edge, just inside
const BENCH_SCALE = 1.0;        // bench model is already real-world scale

/** Load the shared streetlight + bench models, then scatter them. */
export async function createStreetProps(scene, layout) {
  const loader = createGLTFLoader();
  const [lightGltf, benchGltf] = await Promise.all([
    loader.loadAsync('assets/models/street/streetlight.glb').catch((e) => { console.warn('[street-props] streetlight failed', e); return null; }),
    loader.loadAsync('assets/models/street/bench.glb').catch((e) => { console.warn('[street-props] bench failed', e); return null; }),
  ]);
  const lightModel = normalize(lightGltf?.scene, STREETLIGHT_SCALE);
  const benchModel = normalize(benchGltf?.scene, BENCH_SCALE);

  // Queue placements, then flush into instanced meshes at the end.
  const placements = [];   // {type:0|1, x, z, yaw}

  if (lightModel) scatterLights();
  if (benchModel) scatterBenches();
  flushProps();

  function scatterLights() {
    for (const road of layout.roads || []) {
      const half = (road.width || 9) / 2;
      const off = half + STREETLIGHT_OFFSET;
      for (const side of [1, -1]) {
        const pts = road.points;
        for (let i = 0; i < pts.length - 1; i++) {
          const [x0, z0] = pts[i];
          const [x1, z1] = pts[i + 1];
          const len = Math.hypot(x1 - x0, z1 - z0);
          const n = Math.max(0, Math.floor(len / STREETLIGHT_EVERY));
          for (let k = 0; k < n; k++) {
            const t = (k + 0.5) / n;
            const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
            let dx = x1 - x0, dz = z1 - z0;
            const dl = Math.hypot(dx, dz) || 1;
            dx /= dl; dz /= dl;
            const nx = -dz * side, nz = dx * side;
            placements.push({ type: 0, x: x + nx * off, z: z + nz * off, yaw: Math.atan2(dx, dz) });
          }
        }
      }
    }
  }

  function scatterBenches() {
    for (const p of layout.parks || []) {
      const ring = Math.max(2, Math.round((p.radius * 2 * Math.PI) / 18));
      for (let i = 0; i < ring; i++) {
        const a = (i / ring) * Math.PI * 2 + 0.3;
        const r = Math.max(3, p.radius - BENCH_PARK_DIST);
        placements.push({ type: 1, x: p.cx + Math.cos(a) * r, z: p.cz + Math.sin(a) * r, yaw: a + Math.PI / 2 });
      }
    }
  }

  function flushProps() {
    const models = [lightModel, benchModel];
    const counts = [0, 0];
    for (const pl of placements) counts[pl.type]++;
    const insts = [null, null];
    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const scl = new THREE.Vector3(1, 1, 1);
    const written = [0, 0];
    for (let t = 0; t < 2; t++) {
      if (!models[t] || !counts[t]) continue;
      const geo = mergeModelGeometry(models[t]);
      if (!geo) continue;
      const inst = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }), counts[t]);
      inst.count = 0;
      inst.castShadow = true;
      inst.userData.isStreetProp = t === 0 ? 'streetlight' : 'bench';
      scene.add(inst);
      insts[t] = inst;
    }
    for (const pl of placements) {
      const inst = insts[pl.type];
      if (!inst) continue;
      pos.set(pl.x, 0, pl.z);
      quat.setFromAxisAngle(up, pl.yaw);
      m.compose(pos, quat, scl);
      const i = written[pl.type]++;
      inst.setMatrixAt(i, m);
      inst.count = i + 1;
      inst.instanceMatrix.needsUpdate = true;
    }
  }

  return { getCount: () => ({ lights: written[0], benches: written[1] }) };
}

/** Convert interleaved-buffer attributes to plain BufferAttributes (merge-safe). */
function deInterleave(geo) {
  const names = Object.keys(geo.attributes);
  for (const name of names) {
    const attr = geo.attributes[name];
    if (attr && attr.isInterleavedBufferAttribute) {
      const itemSize = attr.itemSize, count = attr.count;
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

/** Bake a normalized model into ONE merged geometry (all sub-meshes). */
function mergeModelGeometry(model) {
  try {
    const clone = model.clone(true);
    clone.updateMatrixWorld(true);
    const geos = [];
    clone.traverse((o) => {
      if (o.isMesh && o.geometry) {
        const g = deInterleave(o.geometry.clone());
        g.applyMatrix4(o.matrixWorld);
        if (!g.getAttribute('normal')) g.computeVertexNormals();
        geos.push(g);
      }
    });
    if (!geos.length) return null;
    const merged = BufferGeometryUtils.mergeGeometries(geos, false);
    if (merged) {
      // Centre X/Z on origin (model is already feet-on-y=0 from normalize()).
      const b = new THREE.Box3().setFromBufferAttribute(merged.attributes.position);
      const c = new THREE.Vector3(); b.getCenter(c);
      merged.translate(-c.x, 0, -c.z);
    }
    return merged;
  } catch (e) {
    console.warn('[street-props] merge failed', e);
    return null;
  }
}

/** Centre a model on origin, feet on y=0, apply uniform scale. */
function normalize(model, scale) {
  if (!model) return null;
  model.scale.setScalar(scale);
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  model.position.sub(center);
  model.position.y -= size.y / 2;
  return model;
}
