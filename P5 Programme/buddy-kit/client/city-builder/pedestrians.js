// pedestrians.js — people milling around the city.
// Procedural capsule people (body + head) rendered via InstancedMesh — no GLB
// files, so they appear instantly and never depend on network loads. Walkers
// roam freely (crossing roads is fine), steer around building footprints, and
// glide along the ground with a gentle bob. Matches the champion's world scale.
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

const WALK_SPEED = 2.2;           // m/s
const TURN_ANIM = 0.35;           // seconds to face the new heading
const REACH_DIST = 1.6;           // m — close enough to advance to next target
const DEFAULT_COUNT = 56;
const PERSON_RADIUS = 1.1;        // m — collision radius vs buildings
const PERSON_HEIGHT = 1.5;        // m — adult height, matches cars
const BOB_AMPLITUDE = 0.12;       // m — gentle glide bob
const BOB_SPEED = 2.2;            // rad/s

// Coats / outfits — people read as distinct from the surroundings.
const PERSON_COLORS = [0xd98b6a, 0x8caaba, 0x5a7d8c, 0xc77b6a, 0x9a8ba8, 0x7d9a6a, 0xb86a6a, 0x6a8ab8];

/** One shared merged geometry: tapered body + head. Vertex-colored per variant. */
function buildPersonGeometry() {
  const body = new THREE.CylinderGeometry(0.26, 0.34, 1.05, 10).translate(0, 0.72, 0);
  const head = new THREE.SphereGeometry(0.19, 10, 8).translate(0, 1.42, 0);
  return BufferGeometryUtils.mergeGeometries([body, head], false);
}

function withColor(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** Building footprints as expanded rects (margin = person radius). */
function buildingRects(buildings) {
  return (buildings || []).map((b) => {
    const fp = b.footprint || [20, 20];
    return {
      x0: b.pos[0] - fp[0] / 2 - PERSON_RADIUS,
      x1: b.pos[0] + fp[0] / 2 + PERSON_RADIUS,
      z0: b.pos[1] - fp[1] / 2 - PERSON_RADIUS,
      z1: b.pos[1] + fp[1] / 2 + PERSON_RADIUS,
    };
  });
}

// Coarse spatial hash over building rects so pointBlocked is O(cells in range)
// instead of O(all buildings) per query. Buildings are static — build once.
const GRID_CELL = 180;   // metres per cell (bigger than any footprint)
function buildRectGrid(rects) {
  const grid = new Map();
  for (const r of rects) {
    const cx0 = Math.floor(r.x0 / GRID_CELL), cx1 = Math.floor(r.x1 / GRID_CELL);
    const cz0 = Math.floor(r.z0 / GRID_CELL), cz1 = Math.floor(r.z1 / GRID_CELL);
    for (let gx = cx0; gx <= cx1; gx++) {
      for (let gz = cz0; gz <= cz1; gz++) {
        const key = gx + ':' + gz;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(r);
      }
    }
  }
  return grid;
}

function pointBlocked(grid, x, z) {
  const cell = grid.get(Math.floor(x / GRID_CELL) + ':' + Math.floor(z / GRID_CELL));
  if (!cell) return false;
  for (const r of cell) if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) return true;
  return false;
}

/** Sample a random wander target inside the city bounds, clear of buildings. */
function wanderTarget(grid, bounds, rng) {
  const pad = 30;
  const minX = bounds.minX + pad, maxX = bounds.maxX - pad;
  const minZ = bounds.minZ + pad, maxZ = bounds.maxZ - pad;
  for (let i = 0; i < 30; i++) {
    const x = minX + rng() * (maxX - minX);
    const z = minZ + rng() * (maxZ - minZ);
    if (!pointBlocked(grid, x, z)) return { x, z };
  }
  return { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };
}

/**
 * A spawn/wander point biased toward the city centre (where the champion and
 * camera are), so walkers are actually visible around the player instead of
 * scattered one-per-300m across a 2km city. `spread` is the std-dev in metres;
 * a smaller spread keeps people near the middle.
 */
function centerBiasedTarget(grid, bounds, rng, spread) {
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  for (let i = 0; i < 30; i++) {
    // Box–Muller-ish: average of two uniforms gives a centre-heavy distribution.
    const u = (rng() + rng()) / 2 - 0.5;   // ~[-0.5, 0.5], peaked at 0
    const v = (rng() + rng()) / 2 - 0.5;
    const x = cx + u * 2 * spread;
    const z = cz + v * 2 * spread;
    if (!pointBlocked(grid, x, z)) return { x, z };
  }
  return wanderTarget(grid, bounds, rng);
}

/**
 * A pedestrian system — procedural, instant, no GLB dependency.
 * Each walker is one instance in a colour-variant InstancedMesh; the walker
 * array holds state (pos, target, heading) and writes the instance matrix.
 */
export function createPedestrians(scene, layout, opts = {}) {
  const count = opts.count ?? DEFAULT_COUNT;
  const grid = buildRectGrid(buildingRects(layout.buildings || []));
  const bounds = opts.bounds || { minX: 0, maxX: 2000, minZ: 0, maxZ: 2000 };
  const rng = (opts.seed != null) ? mulberry32(opts.seed) : Math.random;

  // One InstancedMesh per colour variant; capacity spread evenly.
  const perVariant = Math.ceil(count / PERSON_COLORS.length);
  const insts = PERSON_COLORS.map((hex) => {
    const geo = withColor(buildPersonGeometry(), hex);
    const inst = new THREE.InstancedMesh(
      geo,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.1 }),
      perVariant
    );
    inst.count = 0;
    scene.add(inst);
    return inst;
  });

  const walkers = [];
  function spawnWalker(forcePos) {
    const start = forcePos || centerBiasedTarget(grid, bounds, rng, 260);
    const inst = insts[walkers.length % insts.length];
    const slot = Math.floor(walkers.length / insts.length);
    walkers.push({
      pos: new THREE.Vector3(start.x, 0, start.z),
      target: centerBiasedTarget(grid, bounds, rng, 260),
      heading: rng() * Math.PI * 2,
      phase: rng() * Math.PI * 2,
      inst, slot,
      active: true, stuck: 0,
    });
    inst.count = walkers.filter((w) => w.inst === inst).length;
  }

  // Initial population: half near the centre (where the camera is), the rest
  // spread wider so the city still feels lived-in beyond the plaza.
  for (let i = 0; i < count; i++) {
    const spread = (i % 2 === 0) ? 200 : 700;
    const p = centerBiasedTarget(grid, bounds, rng, spread);
    spawnWalker(pointBlocked(grid, p.x, p.z) ? undefined : p);
  }

  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const scl = new THREE.Vector3(1, 1, 1);

  function update(dt, tNow) {
    const bob = BOB_AMPLITUDE * Math.sin((tNow || 0) * BOB_SPEED);
    for (const w of walkers) {
      if (!w.active) continue;
      const dx = w.target.x - w.pos.x, dz = w.target.z - w.pos.z;
      const dist = Math.hypot(dx, dz);

      if (dist < REACH_DIST) {
        w.target = centerBiasedTarget(grid, bounds, rng, 260);
        w.heading += (rng() - 0.5) * 1.4;
        w.stuck = 0;
      } else {
        const targetHeading = Math.atan2(dx, dz);
        let diff = targetHeading - w.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        w.heading += diff * Math.min(1, dt / TURN_ANIM);

        const nx = dx / dist, nz = dz / dist;
        const step = WALK_SPEED * dt;
        const px = w.pos.x + nx * step, pz = w.pos.z + nz * step;

        if (pointBlocked(grid, px, pz)) {
          const slideX = !pointBlocked(grid, px, w.pos.z);
          const slideZ = !pointBlocked(grid, w.pos.x, pz);
          if (slideX) w.pos.x = px;
          else if (slideZ) w.pos.z = pz;
          else {
            w.stuck++;
            w.heading += (rng() - 0.5) * 2.2;
            if (w.stuck > 25) { w.target = wanderTarget(grid, bounds, rng); w.stuck = 0; }
          }
        } else {
          w.pos.x = px; w.pos.z = pz;
        }
      }

      pos.set(w.pos.x, PERSON_HEIGHT / 2 + bob * Math.sin(w.phase), w.pos.z);
      quat.setFromAxisAngle(up, w.heading);
      m.compose(pos, quat, scl);
      w.inst.setMatrixAt(w.slot, m);
      w.inst.instanceMatrix.needsUpdate = true;
    }
  }

  return { update, getCount: () => walkers.length };
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
