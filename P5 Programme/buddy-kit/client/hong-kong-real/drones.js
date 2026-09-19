// drones.js — quadcopter drones that patrol the quest buildings and land on /
// take off from the Drone Air Traffic Control tower. Procedural quadcopters:
// body + 4 arms + rotor discs (emissive, bloom-lit) + a small under-glow.
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { questsForDistrict } from './quests.js';

function withColor(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

function buildDroneBody() {
  const parts = [];
  parts.push(withColor(new THREE.BoxGeometry(0.55, 0.16, 0.55), 0x2a2f36));
  // 4 arms diagonally out
  const arm = new THREE.CylinderGeometry(0.035, 0.035, 0.9, 5);
  for (let i = 0; i < 4; i++) {
    const ang = (Math.PI / 2) * i + Math.PI / 4;
    const a = arm.clone().rotateZ(Math.PI / 2).rotateY(ang);
    a.translate(0, 0, 0); // arm centered, rotated radially
    a.translate(Math.cos(ang) * 0.22, 0, Math.sin(ang) * 0.22);
    parts.push(withColor(a, 0x22262c));
  }
  // rotor hubs at the arm tips
  for (let i = 0; i < 4; i++) {
    const ang = (Math.PI / 2) * i + Math.PI / 4;
    parts.push(withColor(new THREE.CylinderGeometry(0.07, 0.07, 0.1, 6).rotateZ(Math.PI / 2).rotateY(ang).translate(Math.cos(ang) * 0.68, 0.06, Math.sin(ang) * 0.68), 0x14181d));
  }
  return BufferGeometryUtils.mergeGeometries(parts, false);
}

function buildRotorDisc() {
  // flat disc + two blade boxes so the spin is visible via rotation
  const parts = [];
  parts.push(new THREE.CylinderGeometry(0.38, 0.38, 0.02, 14));
  parts.push(new THREE.BoxGeometry(0.7, 0.02, 0.1));
  return BufferGeometryUtils.mergeGeometries(parts, false);
}

export function createDrones(group, districtId, opts = {}) {
  // Stops = places the drones patrol between. Custom stops (from a host app,
  // e.g. the city-builder template) take priority; otherwise derive from the
  // district's quest buildings (ATC tower = home pad when present).
  let stops;
  if (Array.isArray(opts.stops) && opts.stops.length) {
    stops = opts.stops.map((s) => ({ x: s.x, z: s.z, y: s.y, home: !!s.home }));
  } else {
    const quests = questsForDistrict(districtId);
    if (!quests.length) return null;
    stops = quests.map((q) => ({
      x: q.pos[0], z: q.pos[1],
      y: q.id === 18 ? q.height + 1.2 : q.height + 8,
      home: q.id === 18,
    }));
  }

  // Mobile keeps a lighter swarm so tablets hold 60 FPS; desktop gets a dense
  // futuristic drone traffic layer. Both stay fully instanced (3 draw calls).
  // COUNT IS FIXED — independent of how many buildings/stops exist, so a city
  // with few buildings still gets a busy skyline (the user's ask: density
  // should not shrink with the number of relevant buildings).
  const N = opts.mobile ? 28 : 48;

  // Patrol waypoints = building rooftops PLUS an even sky grid over the city
  // bounds, so drones are spread across the whole city regardless of how many
  // buildings there are (a 1-building city still gets a uniform swarm).
  const bounds = opts.bounds || { minX: 0, maxX: 2000, minZ: 0, maxZ: 2000 };
  const gridStops = [];
  const gStep = 320;
  for (let gx = bounds.minX + 120; gx <= bounds.maxX - 80; gx += gStep) {
    for (let gz = bounds.minZ + 120; gz <= bounds.maxZ - 80; gz += gStep) {
      gridStops.push({ x: gx + (Math.random() - 0.5) * 80, z: gz + (Math.random() - 0.5) * 80, y: 70 + Math.random() * 60, home: false });
    }
  }
  stops = stops.concat(gridStops);
  if (!stops.length) return null;

  const bodyGeo = buildDroneBody();
  const rotorGeo = buildRotorDisc();
  const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.4 });
  const rotorMat = new THREE.MeshBasicMaterial({ color: 0xbfe9ff, toneMapped: false, transparent: true, opacity: 0.85 });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });

  const bodyInst = new THREE.InstancedMesh(bodyGeo, bodyMat, N);
  const rotorInst = new THREE.InstancedMesh(rotorGeo, rotorMat, N * 4);   // 4 rotors per drone
  const glowInst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.14, 8, 6), glowMat, N);
  bodyInst.count = N; rotorInst.count = N * 4; glowInst.count = N;
  group.add(bodyInst, rotorInst, glowInst);

  // Give each drone a cyclic route through a few random stops.
  const drones = [];
  for (let i = 0; i < N; i++) {
    const route = [stops[i % stops.length]];
    const used = new Set([i % stops.length]);
    // pick 2-3 extra stops (prefer ATC home so drones cycle through the tower)
    let homeFirst = stops.some(s => s.home) && i % 2 === 0;
    for (let k = 0; k < 3; k++) {
      let idx;
      if (homeFirst && stops.some(s => s.home)) { idx = stops.findIndex(s => s.home); homeFirst = false; }
      else if (used.size >= stops.length) {
        // All stops already in the route — revisit (never spin forever).
        idx = Math.floor(Math.random() * stops.length);
      }
      else {
        do { idx = Math.floor(Math.random() * stops.length); } while (used.has(idx));
      }
      used.add(idx);
      route.push(stops[idx]);
    }
    drones.push({
      route,
      seg: 0,            // current segment index in route
      t: Math.random(),  // progress 0..1 along segment
      speed: 7 + Math.random() * 5,
      phase: Math.random() * Math.PI * 2,
      yaw: Math.random() * Math.PI * 2,   // smoothed heading (no snapping)
      state: 'flying',   // flying | landing | waiting | taking_off
      wait: 0,
    });
  }

  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);

  function update(dt, tNow) {
    for (let i = 0; i < drones.length; i++) {
      const dr = drones[i];
      const A = dr.route[dr.seg];
      const B = dr.route[(dr.seg + 1) % dr.route.length];
      const dx = B.x - A.x, dz = B.z - A.z, dy = B.y - A.y;
      const len = Math.hypot(dx, dz, dy) || 1;

      if (dr.state === 'flying') {
        dr.t += (dr.speed * dt) / len;
        if (dr.t >= 1) {
          // arrived at B
          if (B.home) { dr.state = 'landing'; dr.t = 1; }
          else { dr.state = 'waiting'; dr.t = 1; dr.wait = 1.5 + Math.random() * 2; }
        }
      } else if (dr.state === 'waiting') {
        dr.wait -= dt;
        if (dr.wait <= 0) { dr.state = 'flying'; dr.seg = (dr.seg + 1) % dr.route.length; dr.t = 0; }
      } else if (dr.state === 'landing') {
        // descend to the pad
        dr.t += (dr.speed * 0.6 * dt) / len;
        if (dr.t >= 1) { dr.t = 1; dr.state = 'waiting'; dr.wait = 4 + Math.random() * 3; }
      } else if (dr.state === 'taking_off') {
        dr.t += (dr.speed * 0.8 * dt) / len;
        if (dr.t >= 1) { dr.t = 0; dr.seg = (dr.seg + 1) % dr.route.length; dr.state = 'flying'; }
      }

      // interpolate position
      const tx = A.x + dx * Math.min(1, dr.t);
      const tz = A.z + dz * Math.min(1, dr.t);
      let ty = A.y + dy * Math.min(1, dr.t);
      // hover bob while flying/waiting
      if (dr.state === 'flying' || dr.state === 'waiting') ty += 0.5 * Math.sin(tNow * 1.6 + dr.phase);
      pos.set(tx, ty, tz);

      // Smooth heading: interpolate toward the travel direction so the drone
      // body turns gently instead of snapping between route segments.
      const targetYaw = Math.atan2(dx, dz);
      let yawDiff = targetYaw - dr.yaw;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      dr.yaw += yawDiff * Math.min(1, dt * 3);
      quat.setFromAxisAngle(up, dr.yaw);
      m.compose(pos, quat, scl);
      bodyInst.setMatrixAt(i, m);
      glowInst.setMatrixAt(i, m);

      // 4 rotors at FIXED arm positions (matching the body's arm angles) —
      // each disc spins on its own axis; they never orbit the body.
      const spin = tNow * 40 + i;
      for (let r = 0; r < 4; r++) {
        const ra = (Math.PI / 2) * r + Math.PI / 4;
        const rx = Math.cos(ra) * 0.68, rz = Math.sin(ra) * 0.68;
        pos.set(tx + rx, ty + 0.08, tz + rz);
        quat.setFromAxisAngle(up, spin);
        m.compose(pos, quat, scl);
        rotorInst.setMatrixAt(i * 4 + r, m);
      }
    }
    bodyInst.instanceMatrix.needsUpdate = true;
    rotorInst.instanceMatrix.needsUpdate = true;
    glowInst.instanceMatrix.needsUpdate = true;
  }

  return { update, drones, bodyInst, rotorInst, glowInst };
}
