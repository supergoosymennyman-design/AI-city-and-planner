// clouds.js — drifting clouds for the 3D city sky.
// Four untextured cloud GLBs are merged (per type) into ONE InstancedMesh
// each — the multi-mesh GLBs would otherwise cost hundreds of draw calls on a
// tablet. Rendered with a cheap unlit white material (MeshBasicMaterial) and a
// subtle per-instance tint, then a handful of clouds drift slowly across the
// sky. Async + graceful: no clouds if the models fail to load.
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { createGLTFLoader } from '../shared/gltf.js';

const CLOUD_MODELS = [
  'assets/models/cloud-a.glb',
  'assets/models/cloud-b.glb',
  'assets/models/cloud-c.glb',
  'assets/models/cloud-d.glb',
];

const CLOUDS_PER_TYPE = 6;       // ~24 clouds total (fuller sky)
const CLOUD_FOOTPRINT = 90;      // m — target horizontal size per cloud
const Y_MIN = 150, Y_MAX = 320;  // m — sky height band
const DRIFT_MIN = 2, DRIFT_MAX = 7;   // m/s — slow drift

// Make a geometry safe for merging: keep only position/normal/uv.
function normalizeGeo(geo) {
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const pos = geo.attributes.position;
  const keep = { position: pos, normal: geo.attributes.normal };
  if (geo.attributes.uv) keep.uv = geo.attributes.uv;
  else keep.uv = new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2);
  for (const name of Object.keys(geo.attributes)) {
    if (!keep[name]) geo.deleteAttribute(name);
  }
  return geo;
}

export async function createClouds(scene, layout, opts = {}) {
  const bounds = opts.bounds || { minX: 0, maxX: 2000, minZ: 0, maxZ: 2000 };
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  const spread = Math.max(600, (bounds.maxX - bounds.minX) * 0.45);

  const loader = createGLTFLoader();
  const settled = await Promise.all(
    CLOUD_MODELS.map((f) => loader.loadAsync(f).catch((e) => { console.warn('[clouds] cloud model failed', f, e); return null; }))
  );
  const gltfs = settled.filter(Boolean);
  if (!gltfs.length) {
    console.warn('[clouds] all cloud models failed to load — no clouds');
    return null;
  }

  // Merge each cloud type into one geometry (baking node transforms first —
  // the GLBs store clusters of small puffs with node scale/rotation).
  const insts = [];
  const typeMeta = [];
  for (const gltf of gltfs) {
    gltf.scene.updateMatrixWorld(true);
    const geos = [];
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const mm = new THREE.Matrix4().copy(o.matrixWorld);
      mm.elements[12] = mm.elements[13] = mm.elements[14] = 0;   // drop translation
      const geo = normalizeGeo(o.geometry.clone());
      geo.applyMatrix4(mm);
      geos.push(geo);
    });
    if (!geos.length) continue;
    const merged = geos.length > 1 ? BufferGeometryUtils.mergeGeometries(geos, false) : geos[0];
    merged.computeBoundingBox();
    const bb = merged.boundingBox;
    const footprint = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z);
    if (!Number.isFinite(footprint) || footprint <= 0) {
      console.warn('[clouds] skipped a cloud type (bad geometry)');
      continue;
    }
    const scale = CLOUD_FOOTPRINT / footprint;

    const inst = new THREE.InstancedMesh(
      merged,
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
      CLOUDS_PER_TYPE
    );
    inst.count = 0;
    inst.frustumCulled = false;      // clouds drift across the whole sky — never cull
    scene.add(inst);
    insts.push(inst);
    typeMeta.push({ scale });
  }
  if (!insts.length) return null;
  const numTypes = insts.length;

  // Build the cloud instances: position in the sky band, slow velocity.
  const clouds = [];
  for (let i = 0; i < numTypes * CLOUDS_PER_TYPE; i++) {
    const t = i % numTypes;
    const sc = typeMeta[t].scale * (0.65 + Math.random() * 0.7);
    clouds.push({
      type: t,
      x: cx + (Math.random() * 2 - 1) * spread,
      z: cz + (Math.random() * 2 - 1) * spread,
      y: Y_MIN + Math.random() * (Y_MAX - Y_MIN),
      vx: (Math.random() * 2 - 1) * (DRIFT_MAX - DRIFT_MIN) + (Math.random() < 0.5 ? -DRIFT_MIN : DRIFT_MIN),
      vz: (Math.random() * 2 - 1) * (DRIFT_MAX - DRIFT_MIN) + (Math.random() < 0.5 ? -DRIFT_MIN : DRIFT_MIN),
      scale: sc,
    });
  }

  // Subtle per-instance tint — soft slate blues so clouds read as moonlit
  // shapes, NOT glowing white (the scene has an UnrealBloom pass, so bright
  // whites blow out).
  const TINTS = [0x7d8fa8, 0x8ea2c0, 0x6f81a0, 0x93a7c4];
  for (let t = 0; t < numTypes; t++) {
    for (let j = 0; j < CLOUDS_PER_TYPE; j++) {
      insts[t].setColorAt(j, new THREE.Color(TINTS[(t + j) % TINTS.length]));
    }
    if (insts[t].instanceColor) insts[t].instanceColor.needsUpdate = true;
  }

  const M = new THREE.Matrix4();
  const P = new THREE.Vector3();
  const Q = new THREE.Quaternion();
  const S = new THREE.Vector3();
  const wrap = spread + 250;

  // ── Stars: tiny twinkling points far above the city ──
  const STAR_COUNT = 600;
  const starPos = new Float32Array(STAR_COUNT * 3);
  const starPhase = new Float32Array(STAR_COUNT);
  const starSize = new Float32Array(STAR_COUNT);
  for (let i = 0; i < STAR_COUNT; i++) {
    const theta = Math.random() * Math.PI * 2;
    // Upper dome: phi 0° (zenith) .. ~81° (near horizon).
    const phi = Math.acos(0.15 + Math.random() * 0.85);
    const r = 2200 + Math.random() * 1000;
    starPos[i * 3] = cx + r * Math.sin(phi) * Math.cos(theta);
    starPos[i * 3 + 1] = r * Math.cos(phi) + 80;
    starPos[i * 3 + 2] = cz + r * Math.sin(phi) * Math.sin(theta);
    starPhase[i] = Math.random();
    starSize[i] = 14 + Math.random() * 22;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('phase', new THREE.BufferAttribute(starPhase, 1));
  starGeo.setAttribute('size', new THREE.BufferAttribute(starSize, 1));
  const starMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      attribute float phase;
      attribute float size;
      varying float vPhase;
      void main() {
        vPhase = phase;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (260.0 / max(1.0, -mv.z));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying float vPhase;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        if (d > 0.5) discard;
        float tw = 0.55 + 0.45 * sin(uTime * 1.6 + vPhase * 6.28318);
        float a = smoothstep(0.5, 0.02, d) * tw;
        if (a < 0.01) discard;
        gl_FragColor = vec4(1.0, 1.0, 1.0, a);
      }
    `,
  });
  const stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false;
  scene.add(stars);

  function writeMatrices() {
    for (let t = 0; t < numTypes; t++) {
      const tInsts = insts[t];
      let k = 0;
      for (const c of clouds) {
        if (c.type !== t) continue;
        Q.identity();
        P.set(c.x, c.y, c.z);
        S.set(c.scale, c.scale, c.scale);
        M.compose(P, Q, S);
        tInsts.setMatrixAt(k++, M);
      }
      tInsts.count = CLOUDS_PER_TYPE;
      tInsts.instanceMatrix.needsUpdate = true;
    }
  }
  writeMatrices();

  function update(dt, tNow) {
    for (const c of clouds) {
      c.x += c.vx * dt;
      c.z += c.vz * dt;
      // Wrap around the sky box so they never drift away.
      if (c.x > cx + wrap) c.x -= wrap * 2;
      else if (c.x < cx - wrap) c.x += wrap * 2;
      if (c.z > cz + wrap) c.z -= wrap * 2;
      else if (c.z < cz - wrap) c.z += wrap * 2;
    }
    starMat.uniforms.uTime.value = tNow || 0;
    writeMatrices();
  }

  return { update, getCount: () => clouds.length };
}
