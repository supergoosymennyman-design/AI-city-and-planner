/**
 * city-builder/traffic.js — cars & buses driving along the student's roads.
 *
 * Each road polyline becomes a driving path; procedural box-cars and
 * double-decker buses (instanced per colour) cruise along them in a loop,
 * keeping to the right-hand lane and facing the direction of travel. No GLB
 * files — purely procedural, so vehicles appear instantly and reliably.
 */

import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

const CAR_COLORS = [0xcfd6dd, 0x28303a, 0xb3392f, 0x2f5d3a, 0x3a5a8c, 0xe8e2d8, 0x8c5a3c];
const BUS_COLORS = [0xd4b060, 0xa83030, 0x2d7a3a];

function withColor(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

function buildCarGeometry(color) {
  const body = withColor(new THREE.BoxGeometry(2.0, 0.5, 4.4).translate(0, 0.78, -0.1), color);
  const cabin = withColor(new THREE.BoxGeometry(1.6, 0.45, 2.0).translate(0, 1.12, 0.4), color);
  const trunk = withColor(new THREE.BoxGeometry(1.9, 0.22, 0.7).translate(0, 1.0, -1.85), color);
  const grille = withColor(new THREE.BoxGeometry(1.7, 0.15, 0.08).translate(0, 0.5, 2.18), 0x14181d);
  const wheel = new THREE.CylinderGeometry(0.42, 0.42, 0.35, 8).rotateZ(Math.PI / 2);
  const parts = [body, cabin, trunk, grille];
  for (const [wx, wz] of [[-0.85, 1.35], [0.85, 1.35], [-0.85, -1.35], [0.85, -1.35]]) {
    parts.push(withColor(wheel.clone().translate(wx, 0.42, wz), 0x14181d));
  }
  return BufferGeometryUtils.mergeGeometries(parts, false);
}

function buildBusGeometry(color) {
  const lower = withColor(new THREE.BoxGeometry(2.5, 1.1, 8.0).translate(0, 0.85, 0), color);
  const upper = withColor(new THREE.BoxGeometry(2.5, 1.0, 7.2).translate(0, 1.9, 0.2), color);
  const wind = withColor(new THREE.BoxGeometry(2.3, 0.55, 0.06).translate(0, 1.0, 4.02), 0x1a2430);
  const wheel = new THREE.CylinderGeometry(0.45, 0.45, 0.4, 8).rotateZ(Math.PI / 2);
  const parts = [lower, upper, wind];
  for (const [wx, wz] of [[-0.85, 2.9], [0.85, 2.9], [-0.85, 0.2], [0.85, 0.2], [-0.85, -2.9], [0.85, -2.9]]) {
    parts.push(withColor(wheel.clone().translate(wx, 0.42, wz), 0x14181d));
  }
  return BufferGeometryUtils.mergeGeometries(parts, false);
}

/**
 * Create road traffic from the student's layout roads.
 * @param {THREE.Group|THREE.Scene} group
 * @param {Array} roads - layout roads [{points:[[x,z],...], width, class}]
 * @param {{carCount?:number, busCount?:number}} opts
 * @returns {{update:(dt:number)=>void, vehicles:Array}|null}
 */
export function createTraffic(group, roads, opts = {}) {
  const paths = [];
  for (const r of roads) {
    const pts = (r.points || []).map(([x, z]) => ({ x, z }));
    if (pts.length < 2) continue;
    let len = 0;
    for (let i = 0; i < pts.length - 1; i++) len += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
    if (len < 50) continue;                    // skip stub roads
    pts._len = len;
    pts._half = (r.width || 7) / 2;            // lane offset basis
    // Cumulative segment lengths so per-frame position lookup is a binary
    // search, not a linear walk over every point of a long polyline.
    pts._cum = new Float64Array(pts.length);
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      acc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
      pts._cum[i] = acc;
    }
    paths.push(pts);
  }
  if (!paths.length) return null;

  // Density-based counts when the caller doesn't pass explicit numbers: cars
  // scale with total road length so ANY road network — a 2-road stub or a
  // 20-road grid — looks equally busy (the user's ask: same density regardless
  // of buildings or bus stops). Buses are rarer but also proportional.
  // `opts.density` scales the result (tablets pass ~0.55 for the frame budget).
  const density = opts.density ?? 1;
  const totalLen = paths.reduce((s, p) => s + p._len, 0);
  const carCount = opts.carCount ?? Math.max(8, Math.min(64, Math.round(totalLen / 45 * density)));
  const busCount = opts.busCount ?? Math.max(1, Math.min(8, Math.round(totalLen / 600 * density)));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.4 });

  const perVariant = Math.ceil(carCount / CAR_COLORS.length);
  const carInsts = CAR_COLORS.map((hex) => {
    const inst = new THREE.InstancedMesh(buildCarGeometry(hex), mat, perVariant);
    inst.count = 0;
    group.add(inst);
    return inst;
  });
  const perBus = Math.ceil(busCount / BUS_COLORS.length);
  const busInsts = BUS_COLORS.map((hex) => {
    const inst = new THREE.InstancedMesh(buildBusGeometry(hex), mat, perBus);
    inst.count = 0;
    group.add(inst);
    return inst;
  });

  const vehicles = [];
  const pushVehicle = (kind, speedMin, speedMax, insts, count) => {
    for (let i = 0; i < count; i++) {
      const path = paths[i % paths.length];
      const inst = insts[i % insts.length];
      const slot = Math.floor(i / insts.length);
      vehicles.push({
        kind, path,
        dist: Math.random() * path._len,
        speed: speedMin + Math.random() * (speedMax - speedMin),
        inst, slot,
        lane: (i % 2 === 0) ? 1 : -1,
      });
    }
  };
  pushVehicle('car', 6, 11, carInsts, carCount);
  pushVehicle('bus', 4, 6, busInsts, busCount);

  // Enable exactly the instance slots used per colour.
  carInsts.forEach((inst, ci) => { inst.count = vehicles.filter((v) => v.inst === inst).length; });
  busInsts.forEach((inst) => { inst.count = vehicles.filter((v) => v.inst === inst).length; });

  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const scl = new THREE.Vector3(1, 1, 1);

  function update(dt) {
    for (const v of vehicles) {
      const pts = v.path;
      const total = pts._len;
      v.dist += v.speed * dt;
      if (v.dist >= total) v.dist -= total;

      // Binary search the segment containing v.dist over the precomputed
      // cumulative lengths (O(log n) per vehicle instead of O(points)).
      const cum = pts._cum;
      let lo = 0, hi = pts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cum[mid] <= v.dist) lo = mid + 1; else hi = mid;
      }
      let i = Math.max(0, lo - 1);
      const a = pts[i], b = pts[i + 1];
      const segLen = cum[i + 1] - cum[i] || 1;
      const k = Math.max(0, Math.min(1, (v.dist - cum[i]) / segLen));
      const x = a.x + (b.x - a.x) * k;
      const z = a.z + (b.z - a.z) * k;

      // right-hand lane offset
      const dx = b.x - a.x, dz = b.z - a.z;
      const len = Math.hypot(dx, dz) || 1;
      const off = v.lane * Math.min(1.8, pts._half * 0.45);
      pos.set(x + (-dz / len) * off, 0.5, z + (dx / len) * off);

      const yaw = Math.atan2(dx, dz);
      quat.setFromAxisAngle(up, yaw);
      m.compose(pos, quat, scl);
      v.inst.setMatrixAt(v.slot, m);
      v.inst.instanceMatrix.needsUpdate = true;
    }
  }

  return { update, vehicles };
}
