// deco-taxis.js — decorative background flying taxis patrolling the skyline.
// Purely visual: they cruise fixed high-altitude routes and never interact with
// the player's own taxi, the champion, or anything on the ground. Fully
// instanced (1 draw call for any count once the taxi GLB loads), so the
// futuristic theme costs almost nothing on tablets.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildTaxiGeometry } from '../champion-city/taxi.js';

// Shared taxi model — loaded once, instanced for every background taxi. Same
// look as the player's taxi (no rotor, static). Falls back to the procedural
// saucer if the GLB fails to load.
const TAXI_GLB = '../champion-city/assets/models/taxi.glb';
let _taxiModelPromise = null;
function loadTaxiModel() {
  if (_taxiModelPromise) return _taxiModelPromise;
  _taxiModelPromise = new GLTFLoader().loadAsync(TAXI_GLB)
    .then((gltf) => {
      let mesh = null;
      gltf.scene.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
      if (!mesh) throw new Error('no mesh in taxi GLB');
      return { geometry: mesh.geometry, material: mesh.material };
    })
    .catch((e) => {
      _taxiModelPromise = null;
      console.warn('[deco-taxi] GLB failed, keeping procedural saucers', e);
      return null;
    });
  return _taxiModelPromise;
}

/**
 * Create `count` decorative flying taxis patrolling the sky above `bounds`.
 * @param {THREE.Group} group - the district group to add the taxis to
 * @param {number} count - how many taxis to spawn (0 → returns null)
 * @param {{bounds?:{minX:number,maxX:number,minZ:number,maxZ:number}, scale?:number}} opts
 * @returns {{update:(dt:number, tNow:number)=>void}|null}
 */
export function createDecoTaxis(group, count, opts = {}) {
  count = Math.max(0, Math.floor(count || 0));
  if (count === 0) return null;
  const b = opts.bounds || { minX: -600, maxX: 600, minZ: -600, maxZ: 600 };
  const scale = opts.scale || 0.6;

  // Procedural fallback saucer (no underbody ring / landing light).
  const { bodyGeo, accGeo, rotorGeo } = buildTaxiGeometry({ decorative: true });
  const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.5 });
  const accMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, transparent: true, opacity: 0.7 });
  const rotorMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });

  const bodyInst = new THREE.InstancedMesh(bodyGeo, bodyMat, count);
  const accInst = new THREE.InstancedMesh(accGeo, accMat, count);
  const rotorInst = new THREE.InstancedMesh(rotorGeo, rotorMat, count);
  group.add(bodyInst, accInst, rotorInst);

  let glbInst = null;   // set when the taxi GLB finishes loading
  loadTaxiModel().then((res) => {
    if (!res || glbInst) return;
    glbInst = new THREE.InstancedMesh(res.geometry, res.material, count);
    glbInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.remove(bodyInst, accInst, rotorInst);
    group.add(glbInst);
    bodyInst.geometry.dispose(); bodyInst.material.dispose();
    accInst.geometry.dispose(); accInst.material.dispose();
    rotorInst.geometry.dispose(); rotorInst.material.dispose();
  });

  // Each taxi loops through 4-6 random waypoints at 80–200m altitude — above
  // mid-rises, below the skyline crowns, and well clear of the player taxi's
  // 0–130m flight band (so they never visually collide with the player's ride).
  const taxis = [];
  const bw = b.maxX - b.minX, bd = b.maxZ - b.minZ;
  for (let i = 0; i < count; i++) {
    const n = 4 + Math.floor(Math.random() * 3);
    const waypoints = [];
    for (let k = 0; k < n; k++) {
      waypoints.push({
        x: b.minX + Math.random() * bw,
        z: b.minZ + Math.random() * bd,
        y: 80 + Math.random() * 120,
      });
    }
    taxis.push({
      waypoints,
      seg: Math.floor(Math.random() * n),
      t: Math.random(),
      speed: 8 + Math.random() * 7,
      phase: Math.random() * Math.PI * 2,
      yaw: Math.random() * Math.PI * 2,
    });
  }

  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3(scale, scale, scale);
  const gscl = new THREE.Vector3(1, 1, 1);   // scratch — avoid per-frame allocs
  const up = new THREE.Vector3(0, 1, 0);
  const rotorY = 1.15 * scale;   // rotor sits above the saucer, in scaled units

  function update(dt, tNow) {
    for (let i = 0; i < taxis.length; i++) {
      const tx = taxis[i];
      const A = tx.waypoints[tx.seg];
      const B = tx.waypoints[(tx.seg + 1) % tx.waypoints.length];
      const dx = B.x - A.x, dz = B.z - A.z, dy = B.y - A.y;
      const len = Math.hypot(dx, dz, dy) || 1;
      tx.t += (tx.speed * dt) / len;
      if (tx.t >= 1) { tx.t = 0; tx.seg = (tx.seg + 1) % tx.waypoints.length; }
      const k = Math.min(1, tx.t);
      const x = A.x + dx * k;
      const z = A.z + dz * k;
      const y = A.y + dy * k + 0.25 * Math.sin(tNow * 1.3 + tx.phase);   // hover bob

      // face the direction of travel, smoothing the turn between segments
      const targetYaw = Math.atan2(dx, dz);
      let diff = targetYaw - tx.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      tx.yaw += diff * Math.min(1, dt * 2.5);

      if (glbInst) {
        // GLB taxi: single instanced mesh at the saucer scale
        pos.set(x, y, z);
        quat.setFromAxisAngle(up, tx.yaw);
        m.compose(pos, quat, gscl);
        glbInst.setMatrixAt(i, m);
      } else {
        // Procedural saucer: body + accent at (x,y,z), spinning rotor above
        pos.set(x, y, z);
        quat.setFromAxisAngle(up, tx.yaw);
        m.compose(pos, quat, scl);
        bodyInst.setMatrixAt(i, m);
        accInst.setMatrixAt(i, m);

        pos.set(x, y + rotorY, z);
        quat.setFromAxisAngle(up, tNow * 18 + tx.phase);
        m.compose(pos, quat, scl);
        rotorInst.setMatrixAt(i, m);
      }
    }
    if (glbInst) {
      glbInst.instanceMatrix.needsUpdate = true;
    } else {
      bodyInst.instanceMatrix.needsUpdate = true;
      accInst.instanceMatrix.needsUpdate = true;
      rotorInst.instanceMatrix.needsUpdate = true;
    }
  }

  return { update, taxis };
}
