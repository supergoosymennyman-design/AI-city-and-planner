// quest-buildings.js — the 18 custom-designed lesson buildings.
// Each quest building is a distinctive futuristic structure (not a plain box):
// leaning twin towers with an energy bridge, floating crystal vault, disc+dome,
// energy spire with floating rings, traffic-light roof, wave roof, drone pad,
// medical helix pod, levitating transport loop, loop ring, monitoring eyes,
// holographic water orb, energy coil tower, recycling silos, radar dish,
// grid maze, swarm dots, and the ATC control tower.
//
// Bodies are merged into ONE vertex-coloured MeshStandardMaterial mesh; the
// glowing accents into ONE emissive MeshBasicMaterial mesh (bloom-lit). Beacons
// are diamond InstancedMesh above each building, coloured by lock state.
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { QUESTS, questsForDistrict, loadQuestState, questStatus } from './quests.js';

function withColor(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  // mergeGeometries requires every geometry to be indexed or none to be — the
  // polyhedron pieces (OctahedronGeometry etc.) build non-indexed while the
  // box/cylinder/torus pieces are indexed. Normalize to non-indexed so the
  // merged body/accent meshes never hit incompatible-attribute errors.
  if (geo.index) geo = geo.toNonIndexed();
  return geo;
}
const B = (geo, hex) => withColor(geo, hex);     // body piece
const A = (geo, hex) => withColor(geo, hex);     // accent piece

// --- each design pushes {b:[body geoms], a:[accent geoms]} -----------------
export function design(id, px, pz) {
  const out = { b: [], a: [] };
  switch (id) {
    case 1: { // twin leaning towers + energy bridge (Tokenomics)
      out.b.push(B(new THREE.BoxGeometry(8, 40, 8).translate(px - 8, 20, pz).rotateZ(0.12), 0x2d4a75));
      out.b.push(B(new THREE.BoxGeometry(8, 40, 8).translate(px + 8, 20, pz).rotateZ(-0.12), 0x3a5a8c));
      // glowing energy bridge between the tips
      out.a.push(A(new THREE.BoxGeometry(15, 1.2, 2).translate(px, 36, pz), 0x00f2fe));
      // glowing vertical strips on each tower
      for (const sx of [-8, 8]) out.a.push(A(new THREE.BoxGeometry(0.6, 36, 0.6).translate(px + sx, 18, pz + 4.2), 0x00f2fe));
      // floating token coins above the bridge
      for (let i = 0; i < 3; i++) out.a.push(A(new THREE.CylinderGeometry(1.6, 1.6, 0.5, 12).rotateX(Math.PI / 2).translate(px - 5 + i * 5, 40 + (i % 2) * 1.5, pz), 0xffb84c));
      break;
    }
    case 2: { // floating crystal vault (Treasury)
      out.b.push(B(new THREE.BoxGeometry(14, 4, 14).translate(px, 2, pz), 0x5a5450));
      out.b.push(B(new THREE.BoxGeometry(9, 4, 9).translate(px, 6, pz), 0x4a4440));
      // glowing vault crystal floating above a beam of light
      out.a.push(A(new THREE.OctahedronGeometry(4.5, 0).translate(px, 14, pz), 0xffd166));
      out.a.push(A(new THREE.CylinderGeometry(0.35, 0.35, 8, 8).translate(px, 10, pz), 0xffd166));
      out.a.push(A(new THREE.TorusGeometry(5.2, 0.25, 8, 20).rotateX(Math.PI / 2).translate(px, 14, pz), 0xffb84c));
      break;
    }
    case 3: { // disc + dome (Sentiment)
      out.b.push(B(new THREE.CylinderGeometry(9, 11, 12, 20).translate(px, 6, pz), 0x6b6f76));
      out.b.push(B(new THREE.SphereGeometry(7, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2).translate(px, 12, pz), 0x5a5e66));
      out.a.push(A(new THREE.TorusGeometry(7.4, 0.5, 8, 24).rotateX(Math.PI / 2).translate(px, 13, pz), 0xff2f7f));
      break;
    }
    case 4: { // energy spire + floating rings (AI City Central capstone)
      out.b.push(B(new THREE.BoxGeometry(12, 46, 12).translate(px, 23, pz), 0x2d3640));
      out.b.push(B(new THREE.BoxGeometry(7, 18, 7).translate(px, 55, pz), 0x3a4658));
      out.b.push(B(new THREE.ConeGeometry(4, 10, 6).translate(px, 69, pz), 0x8caaba));
      // floating energy rings at three heights
      for (const [ry, r] of [[34, 10], [48, 8], [62, 6.5]]) out.a.push(A(new THREE.TorusGeometry(r, 0.4, 8, 24).rotateX(Math.PI / 2).translate(px, ry, pz), 0x00f2fe));
      // glowing core orb near the top
      out.a.push(A(new THREE.SphereGeometry(2.2, 12, 10).translate(px, 60, pz), 0x00ff9d));
      // vertical light strips
      for (let y = 8; y < 44; y += 9) out.a.push(A(new THREE.BoxGeometry(12.6, 0.4, 0.5).translate(px, y, pz + 6), 0x00f2fe));
      break;
    }
    case 5: { // traffic light roof
      out.b.push(B(new THREE.BoxGeometry(16, 14, 12).translate(px, 7, pz), 0x7a7f85));
      out.b.push(B(new THREE.CylinderGeometry(0.6, 0.8, 8, 8).translate(px, 20, pz), 0x44484e));
      out.a.push(A(new THREE.CylinderGeometry(1.4, 1.4, 0.4, 16).rotateX(Math.PI / 2).translate(px, 24.5, pz), 0xff2030));
      out.a.push(A(new THREE.CylinderGeometry(1.4, 1.4, 0.4, 16).rotateX(Math.PI / 2).translate(px, 22.6, pz), 0xffb84c));
      out.a.push(A(new THREE.CylinderGeometry(1.4, 1.4, 0.4, 16).rotateX(Math.PI / 2).translate(px, 20.7, pz), 0x00ff9d));
      break;
    }
    case 6: { // wave roof (Traffic)
      out.b.push(B(new THREE.BoxGeometry(18, 10, 12).translate(px, 5, pz), 0x5a6168));
      for (let i = 0; i < 5; i++) {
        const x = px - 7 + i * 3.5;
        out.b.push(B(new THREE.BoxGeometry(2.4, 3 + ((i * 37) % 3), 12.6).translate(x, 11 + ((i * 37) % 3) / 2, pz), 0x4a5056));
      }
      out.a.push(A(new THREE.BoxGeometry(18.4, 0.35, 0.5).translate(px, 15.5, pz + 6), 0x00f2fe));
      break;
    }
    case 7: { // drone landing pad
      out.b.push(B(new THREE.BoxGeometry(12, 18, 12).translate(px, 9, pz), 0x4a4f56));
      out.b.push(B(new THREE.CylinderGeometry(7, 7, 1, 18).translate(px, 18.6, pz), 0x3a3f46));
      for (const [dx, dz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) {
        out.b.push(B(new THREE.BoxGeometry(0.8, 0.3, 0.8).translate(px + dx, 19.3, pz + dz), 0x14181d));
      }
      out.a.push(A(new THREE.CylinderGeometry(6.6, 6.6, 0.06, 18).translate(px, 19.2, pz), 0x00f2fe));
      break;
    }
    case 8: { // medical helix pod (Health)
      const pod = new THREE.SphereGeometry(6, 16, 12);
      pod.scale(1, 1.3, 1);
      out.b.push(B(pod.translate(px, 10, pz), 0x9ab8c8));
      // glowing helix ribbons (two offset tori)
      out.a.push(A(new THREE.TorusGeometry(6.6, 0.4, 8, 24).rotateX(Math.PI / 2).translate(px, 10, pz), 0x00ff9d));
      out.a.push(A(new THREE.TorusGeometry(6.6, 0.4, 8, 24).rotateX(Math.PI / 2).rotateY(Math.PI / 2).translate(px, 10, pz), 0x00f2fe));
      // glowing cross above the pod
      out.a.push(A(new THREE.BoxGeometry(3, 0.8, 0.6).translate(px, 19, pz), 0x00ff9d));
      out.a.push(A(new THREE.BoxGeometry(0.8, 3, 0.6).translate(px, 19, pz), 0x00ff9d));
      break;
    }
    case 9: { // levitating transport loop (Bus)
      // maglev loop track + pylons
      out.b.push(B(new THREE.BoxGeometry(1, 10, 1).translate(px - 7, 5, pz), 0x6b7078));
      out.b.push(B(new THREE.BoxGeometry(1, 10, 1).translate(px + 7, 5, pz), 0x6b7078));
      out.a.push(A(new THREE.TorusGeometry(9, 0.7, 10, 28).rotateX(Math.PI / 2).translate(px, 12, pz), 0x00f2fe));
      // floating pod on the loop
      out.b.push(B(new THREE.BoxGeometry(2.4, 1.2, 5).translate(px, 16, pz), 0xd4b060));
      out.b.push(B(new THREE.BoxGeometry(2.4, 1.2, 4).translate(px, 17.2, pz + 0.4), 0xd4b060));
      // amber guide ring
      out.a.push(A(new THREE.TorusGeometry(9.4, 0.15, 8, 28).rotateX(Math.PI / 2).translate(px, 9, pz), 0xffb84c));
      break;
    }
    case 10: { // loop ring
      const w = 6, gap = 5, side = 16;
      out.b.push(B(new THREE.BoxGeometry(w, 12, side).translate(px - 11, 6, pz), 0x6b6f76));
      out.b.push(B(new THREE.BoxGeometry(w, 12, side).translate(px + 11, 6, pz), 0x6b6f76));
      out.b.push(B(new THREE.BoxGeometry(side, 12, w).translate(px, 6, pz - 11), 0x5f636a));
      out.b.push(B(new THREE.BoxGeometry(side, 12, w).translate(px, 6, pz + 11), 0x5f636a));
      out.a.push(A(new THREE.BoxGeometry(w + 0.6, 0.5, 0.5).translate(px - 11, 12.5, pz + 8), 0x00f2fe));
      out.a.push(A(new THREE.BoxGeometry(w + 0.6, 0.5, 0.5).translate(px + 11, 12.5, pz + 8), 0x00f2fe));
      break;
    }
    case 11: { // monitoring eyes
      out.b.push(B(new THREE.BoxGeometry(14, 26, 12).translate(px, 13, pz), 0x4a5056));
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 4; c++) {
          const ex = px - 5 + c * 3.4, ey = 3 + r * 4.8, ez = pz + 6;
          out.b.push(B(new THREE.SphereGeometry(0.7, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(ex, ey, ez), 0x14181d));
          out.a.push(A(new THREE.CircleGeometry(0.22, 8).translate(ex, ey, ez + 0.01), 0x00f2fe));
        }
      }
      break;
    }
    case 12: { // holographic water orb (Water)
      out.b.push(B(new THREE.BoxGeometry(10, 6, 10).translate(px, 3, pz), 0x5a6168));
      const orb = new THREE.SphereGeometry(7, 18, 14);
      orb.scale(1, 0.85, 1);
      out.b.push(B(orb.translate(px, 14, pz), 0x2a7fbf));
      // glowing rings: equator + tilted orbit
      out.a.push(A(new THREE.TorusGeometry(7.4, 0.35, 8, 24).rotateX(Math.PI / 2).translate(px, 14, pz), 0x00f2fe));
      out.a.push(A(new THREE.TorusGeometry(7.4, 0.35, 8, 24).rotateX(0.4).translate(px, 14, pz), 0x00aaff));
      // droplet above
      out.a.push(A(new THREE.SphereGeometry(1.2, 10, 8).translate(px, 23, pz), 0x00f2fe));
      break;
    }
    case 13: { // energy coil tower (Power / Tesla)
      out.b.push(B(new THREE.BoxGeometry(10, 4, 10).translate(px, 2, pz), 0x4a5056));
      out.b.push(B(new THREE.BoxGeometry(3, 30, 3).translate(px, 15, pz), 0x5a6168));
      // glowing coil rings
      for (let y = 10; y <= 26; y += 8) out.a.push(A(new THREE.TorusGeometry(4.5, 0.4, 8, 20).rotateX(Math.PI / 2).translate(px, y, pz), 0xffb84c));
      // energy orb on top + arc spikes
      out.a.push(A(new THREE.SphereGeometry(1.8, 10, 8).translate(px, 32, pz), 0x00ff9d));
      for (let i = 0; i < 6; i++) {
        const ang = i * Math.PI / 3;
        out.a.push(A(new THREE.ConeGeometry(0.6, 2.2, 6).rotateX(Math.PI / 2).translate(px + Math.cos(ang) * 2.5, 32, pz + Math.sin(ang) * 2.5), 0x00f2fe));
      }
      break;
    }
    case 14: { // recycling silos + holo rings — lighter concrete base so the
      // silos read as sitting ON a building instead of floating above the road.
      out.b.push(B(new THREE.BoxGeometry(12, 10, 12).translate(px, 5, pz), 0x9aa0a8));
      const cols = [0x3a7bd5, 0xd4b060, 0x8a5a34, 0x2d7a3a];
      for (let i = 0; i < 4; i++) {
        out.b.push(B(new THREE.CylinderGeometry(1.8, 1.8, 7, 12).translate(px - 4 + i * 2.7, 13.5, pz), cols[i]));
        // glowing ring around each silo
        out.a.push(A(new THREE.TorusGeometry(2.0, 0.15, 6, 14).rotateX(Math.PI / 2).translate(px - 4 + i * 2.7, 16, pz), 0x00ff9d));
      }
      break;
    }
    case 15: { // subsurface radar
      out.b.push(B(new THREE.BoxGeometry(12, 12, 12).translate(px, 6, pz), 0x4a5056));
      out.b.push(B(new THREE.ConeGeometry(7, 4, 16).rotateX(-Math.PI).translate(px, 14, pz), 0x3a3f46));
      out.a.push(A(new THREE.ConeGeometry(4.5, 16, 12, 1, true).rotateX(Math.PI).translate(px, 8, pz), 0x00f2fe));
      break;
    }
    case 16: { // grid maze
      out.b.push(B(new THREE.BoxGeometry(14, 14, 12).translate(px, 7, pz), 0x5a6168));
      for (let gx = 0; gx < 5; gx++) out.a.push(A(new THREE.BoxGeometry(0.4, 0.4, 12.4).translate(px - 5 + gx * 2.5, 14.4, pz), 0x00f2fe));
      for (let gz = 0; gz < 5; gz++) out.a.push(A(new THREE.BoxGeometry(14.4, 0.4, 0.4).translate(px, 14.4, pz - 5 + gz * 2.5), 0x00f2fe));
      out.b.push(B(new THREE.BoxGeometry(1.6, 1.6, 0.6).translate(px - 3, 15.6, pz), 0x14181d));
      out.b.push(B(new THREE.BoxGeometry(1.6, 1.6, 0.6).translate(px + 2, 15.6, pz), 0x14181d));
      break;
    }
    case 17: { // swarm dots
      out.b.push(B(new THREE.BoxGeometry(14, 22, 12).translate(px, 11, pz), 0x4a5056));
      for (let i = 0; i < 24; i++) {
        const sx = px - 5 + ((i * 53) % 10), sy = 2 + ((i * 37) % 18), sz = pz + 6;
        out.a.push(A(new THREE.SphereGeometry(0.28, 6, 6).translate(sx, sy, sz), 0x00f2fe));
      }
      break;
    }
    case 18: { // ATC control tower
      out.b.push(B(new THREE.CylinderGeometry(3.4, 5, 50, 10).translate(px, 25, pz), 0x3a4658));
      out.b.push(B(new THREE.CylinderGeometry(7.5, 7.5, 8, 10).translate(px, 54, pz), 0x8caaba));
      out.b.push(B(new THREE.CylinderGeometry(0.7, 0.7, 6, 6).translate(px, 60, pz), 0x6b7078));
      out.a.push(A(new THREE.CylinderGeometry(7.9, 7.9, 0.5, 10).translate(px, 50.2, pz), 0x00f2fe));
      out.a.push(A(new THREE.CylinderGeometry(7.9, 7.9, 0.5, 10).translate(px, 58.2, pz), 0x00f2fe));
      out.a.push(A(new THREE.CylinderGeometry(2.6, 2.6, 0.15, 16).translate(px, 60.4, pz), 0xffb84c)); // landing pad ring
      break;
    }
  }
  return out;
}

export function buildQuestBuildings(group, districtId) {
  const quests = questsForDistrict(districtId);
  const bodyGeoms = [], accentGeoms = [];
  const beaconPositions = [];
  for (const q of quests) {
    const [px, pz] = q.pos;
    const d = design(q.id, px, pz);
    bodyGeoms.push(...d.b);
    accentGeoms.push(...d.a);
    // The declared `q.height` is a rough landmark value — the ACTUAL geometry
    // top varies per design (e.g. the recycling silos reach 17m while height
    // says 20). Compute the real top so the beacon pillar anchors to visible
    // geometry instead of hanging in midair.
    const maxY = (arr) => {
      let m = -Infinity;
      for (const g of arr) {
        if (!g.boundingBox) g.computeBoundingBox();
        if (g.boundingBox) m = Math.max(m, g.boundingBox.max.y);
      }
      return m;
    };
    const top = Math.max(maxY(d.b), maxY(d.a));
    const anchor = Number.isFinite(top) ? top : q.height;
    // Beacon floats a little above the real top; pillar runs down to it.
    beaconPositions.push({ q, x: px, y: anchor + 6, z: pz, anchor });
  }
  const bodiesMesh = bodyGeoms.length
    ? new THREE.Mesh(BufferGeometryUtils.mergeGeometries(bodyGeoms, false), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 }))
    : null;
  const accentsMesh = accentGeoms.length
    ? new THREE.Mesh(BufferGeometryUtils.mergeGeometries(accentGeoms, false), new THREE.MeshBasicMaterial({
        vertexColors: true,
        toneMapped: false,
        // Glow discipline: bloom threshold is 0.68 (linear luminance). Accent
        // vertex colours like 0x00f2fe sit around 0.62–0.67 linear and would go
        // dark under the raised gate, so scale the emitted radiance up past it —
        // three multiplies material.color into vertex colours, so this pushes
        // the cyan/green/amber accents back into bloom as genuine emitters.
        color: new THREE.Color(1.9, 1.9, 1.9),
      }))
    : null;
  if (bodiesMesh) group.add(bodiesMesh);
  if (accentsMesh) group.add(accentsMesh);

  // Diamond beacons above each quest building (rotated cube = octahedron).
  const state = loadQuestState();
  const beacon = new THREE.InstancedMesh(
    new THREE.OctahedronGeometry(1.8, 0),
    new THREE.MeshBasicMaterial({ toneMapped: false, color: new THREE.Color(2.0, 2.0, 2.0) }),
    beaconPositions.length
  );
  const m = new THREE.Matrix4(), v = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  const colour = new THREE.Color();
  beaconPositions.forEach((bp, i) => {
    v.set(bp.x, bp.y, bp.z);
    q.setFromEuler(new THREE.Euler(0, Math.PI / 4, 0.6));   // rotated cube diamond
    m.compose(v, q, s.set(1, 1, 1));
    beacon.setMatrixAt(i, m);
    const st = questStatus(bp.q, state);
    colour.setHex(st === 'completed' ? 0x00ff9d : st === 'unlocked' ? 0x00f2fe : st === 'coming_soon' ? 0xffb84c : 0x3a3f46);
    beacon.setColorAt(i, colour);
  });
  beacon.instanceMatrix.needsUpdate = true;
  beacon.instanceColor.needsUpdate = true;
  group.add(beacon);

  // Thin cyan pillar from each diamond down to its building top — visually
  // anchors the floating marker so it never reads as stray geometry.
  if (beaconPositions.length) {
    const pillarPts = [];
    for (const bp of beaconPositions) {
      pillarPts.push(bp.x, bp.y, bp.z, bp.x, bp.anchor + 0.1, bp.z);
    }
    const pillarGeo = new THREE.BufferGeometry();
    pillarGeo.setAttribute('position', new THREE.Float32BufferAttribute(pillarPts, 3));
    const pillar = new THREE.LineSegments(pillarGeo, new THREE.LineBasicMaterial({ color: 0x00f2fe, transparent: true, opacity: 0.65 }));
    group.add(pillar);
  }

  return { bodiesMesh, accentsMesh, beacon, beaconPositions, quests };
}

// Pulse unlocked/completed beacons; locked + coming-soon stay dim-ish.
const _beaconColour = new THREE.Color();
export function updateQuestBeacons(system, t) {
  if (!system || !system.beacon) return;
  const state = loadQuestState();
  for (let i = 0; i < system.beaconPositions.length; i++) {
    const st = questStatus(system.beaconPositions[i].q, state);
    if (st === 'locked' || st === 'coming_soon') {
      // locked = static dim grey; coming soon = soft amber (visible, but clearly
      // not a live mission yet)
      _beaconColour.setHex(st === 'coming_soon' ? 0x8a6420 : 0x3a3f46);
    } else {
      const pulse = 0.55 + 0.45 * Math.sin(t * 3 + i);
      const base = st === 'completed' ? 0x00ff9d : 0x00f2fe;
      const c = new THREE.Color(base);
      _beaconColour.copy(c).multiplyScalar(pulse);
    }
    system.beacon.setColorAt(i, _beaconColour);
  }
  system.beacon.instanceColor.needsUpdate = true;
}
