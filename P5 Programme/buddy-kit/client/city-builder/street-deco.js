// street-deco.js — playground equipment (parks) + street furniture
// (intersections): swing set, slide, fountain in green spaces; traffic lights
// and stop signs at road junctions. Static, small, fire-and-forget — each
// model loads async and is placed once per spot; a load failure is silently
// skipped (no crash, no hang).
import * as THREE from 'three';
import { createGLTFLoader } from '../shared/gltf.js';
import { buildTrafficNetwork, isRoadsideSceneryClear } from '../city-common/traffic-network.js';

// CC0-only street/playground deco. Playground equipment (swing/slide) is still
// pending CC0 replacements, but parks get a CC0 fountain (Poly Pizza, Isa
// Lousberg). Street furniture comes from Kenney City Kit (Roads), CC0 —
// stop/warning/street signs, cones, barriers, dumpsters, electricity poles and
// traffic-light variants.
const PLAYGROUND = [
  { file: 'assets/models/street-deco/fountain.glb', name: 'fountain' },
  { file: 'assets/models/street-deco/ferris-wheel.glb', name: 'ferris wheel' },
  { file: 'assets/models/street-deco/gazebo.glb', name: 'gazebo' },
];
const STREET_DECO = [
  { file: 'assets/models/street-deco/traffic-light.glb', name: 'traffic light' },
  { file: 'assets/models/street-deco/stop-sign.glb', name: 'stop sign' },
  { file: 'assets/models/street-deco/warning-sign.glb', name: 'warning sign' },
  { file: 'assets/models/street-deco/street-sign.glb', name: 'street sign' },
  { file: 'assets/models/street-deco/construction-cone.glb', name: 'traffic cone' },
  { file: 'assets/models/street-deco/construction-barrier.glb', name: 'barrier' },
  { file: 'assets/models/street-deco/dumpster.glb', name: 'dumpster' },
  { file: 'assets/models/street-deco/electricity-pole.glb', name: 'electricity pole' },
  { file: 'assets/models/street-deco/traffic-light-vertical.glb', name: 'vertical traffic light' },
  { file: 'assets/models/street-deco/traffic-light-horizontal.glb', name: 'horizontal traffic light' },
  { file: 'assets/models/street-deco/post-lantern.glb', name: 'post lantern' },
  { file: 'assets/models/street-deco/market-stand.glb', name: 'market stand' },
];

/**
 * Scatter playground + street deco. Parks get a swing/slide/fountain near the
 * centre; road intersections get a traffic light + stop sign. All async and
 * non-blocking.
 */
export function scatterStreetDeco(scene, layout, opts = {}) {
  const loader = createGLTFLoader();
  const schedule = opts.schedule || ((task) => task());
  const parkSpots = (layout.parks || []).map((p) => ({ x: p.cx, z: p.cz, radius: p.radius || 40 }));

  // Playground: one random piece per park (if any CC0 playground models exist).
  for (const spot of parkSpots) {
    if (!PLAYGROUND.length) break;
    const def = PLAYGROUND[Math.floor(Math.random() * PLAYGROUND.length)];
    place(loader, scene, def, spot.x, spot.z, Math.min(6, spot.radius * 0.25), 0, schedule);
  }

  // Street deco: placed along roads but OFFSET onto the pavement. Roads are
  // stored as centreline polylines, so a bare segment midpoint sits in the
  // middle of the carriageway (cars drive the centreline) — and where roads
  // cross, even a one-road perpendicular offset can land on the OTHER road.
  // So pick a spot along the first segment that is a real sidewalk: perpendicular
  // to the host road by half its width + a margin, AND clear of every road's
  // carriageway. Orient items along the street (same pavement math as
  // street-props.js).
  const roads = layout.roads || [];
  const roadNetwork = buildTrafficNetwork(roads);
  const primary = roads.filter((r) => r.class === 'primary' || (r.points || []).length >= 2);
  let decoCount = 0;
  let busStops = 0;
  for (const r of primary) {
    const pts = r.points;
    if (!pts || pts.length < 2 || decoCount >= 12) continue;
    const spot = findSidewalkSpot(r, roads);
    if (!spot) continue;
    const spotRadius = 2.2;
    if (!isRoadsideSceneryClear(roadNetwork, spot.x, spot.z, spotRadius, 8)) continue;
    if (busStops < 3 && decoCount % 3 === 0) {
      buildBusStop(scene, spot.x, spot.z, spot.yaw);   // procedural bus shelter (HK-blue roof)
      busStops++;
      decoCount++;
      continue;
    }
    const def = STREET_DECO[Math.floor(Math.random() * STREET_DECO.length)];
    // Models are loaded asynchronously, so use a conservative footprint for
    // every item. This keeps the placement safe before the GLB dimensions are
    // known and prevents junction-mouth clutter from appearing on the road.
    place(loader, scene, def, spot.x, spot.z, 0, spot.yaw, schedule);
    decoCount++;
  }
}

/** Distance from a point to a road polyline's nearest segment. */
function distToRoad(px, pz, road) {
  const pts = road.points;
  if (!pts || pts.length < 2) return Infinity;
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, z1] = pts[i];
    const [x2, z2] = pts[i + 1];
    const dx = x2 - x1, dz = z2 - z1;
    const l2 = dx * dx + dz * dz;
    let t = l2 ? ((px - x1) * dx + (pz - z1) * dz) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = x1 + t * dx, cz = z1 + t * dz;
    const d = Math.hypot(px - cx, pz - cz);
    if (d < best) best = d;
  }
  return best;
}

/**
 * Find a pavement position beside `road` that is clear of EVERY road's
 * carriageway (this one plus any roads crossing it). Returns {x, z, yaw} or
 * null if no candidate clears all carriageways.
 */
function findSidewalkSpot(road, allRoads) {
  const pts = road.points;
  const a = pts[0], b = pts[1];
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const segLen = Math.hypot(dx, dz) || 1;
  const nx = -dz / segLen, nz = dx / segLen;     // unit perpendicular
  const ownHalf = (road.width || 12) / 2;
  const margin = 2.0;                            // sidewalk breathing room
  let best = null;
  // Walk a few fractions along the segment (not just the midpoint — the
  // midpoint of a long segment is often where another road crosses) and try
  // both pavements. Prefer the spot with the most clearance to any road edge.
  const fractions = [0.28, 0.42, 0.58, 0.72];
  for (const side of [1, -1]) {
    for (const t of fractions) {
      const x = a[0] + (b[0] - a[0]) * t + nx * side * (ownHalf + margin);
      const z = a[1] + (b[1] - a[1]) * t + nz * side * (ownHalf + margin);
      // Clearance beyond the road EDGE for every road in the layout.
      let clear = Infinity;
      for (const other of allRoads) {
        const otherHalf = (other.width || 12) / 2;
        clear = Math.min(clear, distToRoad(x, z, other) - otherHalf);
      }
      if (clear >= 1.2 && (!best || clear > best.clear)) {
        best = { x, z, clear, yaw: Math.atan2(side * nx, side * nz) };
      }
    }
  }
  return best ? { x: best.x, z: best.z, yaw: best.yaw } : null;
}

/**
 * buildBusStop — a small procedural bus shelter (roof + posts + bench + route
 * sign). No clean CC0 bus-stop model exists, so this is built with primitives.
 * `yaw` rotates the shelter so its opening faces the street (see scatterStreetDeco).
 */
function buildBusStop(scene, x, z, yaw) {
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x2e6fd8, roughness: 0.5, metalness: 0.3 });
  const postMat = new THREE.MeshStandardMaterial({ color: 0x9aa4b2, roughness: 0.7, metalness: 0.25 });
  const benchMat = new THREE.MeshStandardMaterial({ color: 0xcfd6dd, roughness: 0.8 });
  const g = new THREE.Group();
  for (const dx of [-1.4, 1.4]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.6, 0.15), postMat);
    post.position.set(dx, 1.3, 0);
    g.add(post);
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.18, 1.5), roofMat);
  roof.position.set(0, 2.75, 0);
  g.add(roof);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.35, 0.08), roofMat);
  sign.position.set(0, 2.9, 0.82);
  g.add(sign);
  const bench = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.5), benchMat);
  bench.position.set(0, 0.5, 0.6);
  g.add(bench);
  const back = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.55, 0.08), benchMat);
  back.position.set(0, 0.85, 0.9);
  g.add(back);
  g.position.set(x, 0, z);
  g.rotation.y = yaw || 0;
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(g);
}

function place(loader, scene, def, x, z, targetScale, yaw = 0, schedule = (task) => task()) {
  schedule(() => loader.loadAsync(def.file))
    .then((gltf) => {
      const model = gltf.scene;
      // Centre X/Z on origin, feet on y=0 (models come in raw units).
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      model.position.sub(center);
      model.position.y -= box.min.y;
      // Scale to a sensible world size.
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const target = targetScale > 0 ? targetScale : 2.0;
      model.scale.setScalar(target / maxDim);
      model.rotation.y = yaw || 0;
      model.position.set(x, 0, z);
      model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      scene.add(model);
    })
    .catch((e) => { console.warn('[street-deco]', def.name, 'failed:', e); });
}
