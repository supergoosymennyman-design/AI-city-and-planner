// sky-sentinels.js — high-altitude glowing objects drifting across the sky.
// They read as distant futuristic "orbital transit" lights. Purely decorative,
// instanced (1 draw call), way above the player taxi / deco taxis so they never
// interfere with gameplay. A bright bloomed sphere is the honest representation
// at 300–600m altitude — a detailed satellite mesh would be invisible at this
// distance and only waste GPU budget.
import * as THREE from 'three';

/**
 * Create `count` slowly drifting bright lights at 300–600m altitude.
 * @param {THREE.Group} group - district group to add to
 * @param {number} count - number of sentinels (0 → null)
 * @param {{bounds?:{minX:number,maxX:number,minZ:number,maxZ:number}}} opts
 * @returns {{update:(dt:number, tNow:number)=>void}|null}
 */
export function createSkySentinels(group, count, opts = {}) {
  count = Math.max(0, Math.floor(count || 0));
  if (count === 0) return null;
  const b = opts.bounds || { minX: -600, maxX: 600, minZ: -600, maxZ: 600 };
  const bw = b.maxX - b.minX, bd = b.maxZ - b.minZ;

  const inst = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.5, 6, 4),
    new THREE.MeshBasicMaterial({ color: 0x00f2fe, toneMapped: false, transparent: true, opacity: 0.9 }),
    count
  );
  group.add(inst);

  // Each sentinel drifts on a slow straight path across the sky at 300–600m.
  const sentinels = [];
  for (let i = 0; i < count; i++) {
    const y = 300 + Math.random() * 300;
    // start anywhere in the bounds, heading roughly east-west or north-south
    const heading = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 2;
    sentinels.push({
      x: b.minX + Math.random() * bw,
      z: b.minZ + Math.random() * bd,
      y,
      heading,
      speed,
      phase: Math.random() * Math.PI * 2,
    });
  }

  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);

  function update(dt, tNow) {
    for (let i = 0; i < sentinels.length; i++) {
      const s = sentinels[i];
      // slow drift in heading direction; wrap around the bounds
      s.x += Math.sin(s.heading) * s.speed * dt;
      s.z += Math.cos(s.heading) * s.speed * dt;
      if (s.x < b.minX) s.x += bw; else if (s.x > b.maxX) s.x -= bw;
      if (s.z < b.minZ) s.z += bd; else if (s.z > b.maxZ) s.z -= bd;
      // gentle twinkle
      const tw = 0.8 + 0.2 * Math.sin(tNow * 1.1 + s.phase);
      pos.set(s.x, s.y + 0.3 * Math.sin(tNow * 0.7 + s.phase), s.z);
      quat.setFromAxisAngle(up, s.heading);
      scl.setScalar(tw);
      m.compose(pos, quat, scl);
      inst.setMatrixAt(i, m);
    }
    inst.instanceMatrix.needsUpdate = true;
  }

  return { update, sentinels };
}
