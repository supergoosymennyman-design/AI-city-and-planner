// street-furniture.js — small sidewalk props from the SHARED library:
// fire hydrants, rubbish bins, mailboxes, planters/pots, parked bicycles and
// café parasols. Streets otherwise read empty between the bigger streetlights/
// benches already placed by street-props.js.
//
// Same budget story as the rest of the street dressing: every model is tiny
// (6–150 KB) and is normalised ONCE into a shared geometry + material, then
// driven as a single InstancedMesh per model — a few hundred small props still
// cost ~10 draw calls and a few hundred KB.
//
// Placement is deterministic (hash-based, no Math.random) so the city is
// identical on every boot. Each model loads async and a load failure simply
// skips that model — the city degrades gracefully, never hangs.
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { createGLTFLoader } from '../shared/gltf.js';
import { libraryItem } from '../city-common/library.js';
import { catalogType } from '../city-common/catalog.js';
import { buildTrafficNetwork, isRoadsideSceneryClear } from '../city-common/traffic-network.js';

const STEP = 30;        // m between furniture slots along a road
const SIDEWALK = 2.4;   // m from the road edge to the prop (small props)
const MAX_TOTAL = 150;  // cap on placed pieces (plenty; keeps tiny cities tidy)

// Curated CC0 street furniture. `w` is the relative weight when rolling which
// piece fills a slot; `scale` scales the library footprint target (the library
// "parasol" reads oversized at 1.0, so it is toned down).
const FURNITURE = [
  { id: 'prop_firehydrant', w: 0.20, scale: 1.0 },
  { id: 'prop_trash_a',     w: 0.15, scale: 1.0 },
  { id: 'prop_trash_b',     w: 0.15, scale: 1.0 },
  { id: 'prop_mailbox',     w: 0.10, scale: 1.0 },
  { id: 'prop_pot',         w: 0.10, scale: 1.0 },
  { id: 'nat_planter',      w: 0.10, scale: 1.0 },
  { id: 'prop_bicycle',     w: 0.06, scale: 1.0 },
  { id: 'prop_parasol_a',   w: 0.08, scale: 0.8 },
];

// ── Geometry + material normalisation (shared per model) ───────────────────
const _loader = createGLTFLoader();
const _cache = new Map();    // prop id -> { geometry, material } | null

function deInterleave(geo) {
  for (const name of Object.keys(geo.attributes)) {
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

/** Normalise a prop GLB into ONE geometry + material for instancing. */
function normalizeProp(root, item, scale) {
  const clone = root.clone(true);
  clone.updateMatrixWorld(true);

  // Count how many distinct materials the prop uses.
  const uniqueMats = [];
  clone.traverse((o) => {
    if (!o.isMesh) return;
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    if (mat && !uniqueMats.includes(mat)) uniqueMats.push(mat);
  });

  // One material across the whole prop → merge geometry + reuse that material.
  if (uniqueMats.length === 1) {
    const geos = [];
    clone.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      const g = deInterleave(o.geometry.clone());
      g.applyMatrix4(o.matrixWorld);
      if (!g.getAttribute('normal')) g.computeVertexNormals();
      geos.push(g);
    });
    if (!geos.length) return null;
    const geometry = finishGeometry(BufferGeometryUtils.mergeGeometries(geos, false), item, scale);
    if (!geometry) return null;
    const material = uniqueMats[0].clone();
    material.vertexColors = false;
    return { geometry, material };
  }

  // Multiple flat materials → bake each part's colour into vertex colours so a
  // single instanced material preserves the look (hydrant red, bin green…).
  return rebuildColoredGeometry(clone, item, scale);
}

/** Multi-material props: rebuild one geometry whose vertices carry COLORS. */
function rebuildColoredGeometry(clone, item, scale) {
  const geos = [];
  clone.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = deInterleave(o.geometry.clone());
    g.applyMatrix4(o.matrixWorld);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    const c = (mat && mat.color) ? mat.color : new THREE.Color(0xffffff);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    geos.push(g);
  });
  if (!geos.length) return null;
  const geometry = finishGeometry(BufferGeometryUtils.mergeGeometries(geos, false), item, scale);
  if (!geometry) return null;
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.7, metalness: 0.05 });
  return { geometry, material };
}

/** Centre X/Z, sit on y=0, scale so largest dimension == library target. */
function finishGeometry(geometry, item, scale) {
  try {
    geometry.computeBoundingBox();
    const bb = new THREE.Box3().setFromBufferAttribute(geometry.attributes.position);
    const size = bb.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    // Library footprints are in metres (hydrant 0.8, bin 1.0, mailbox 1.4…).
    const lib = item ? libraryItem(item.id) : null;
    const target = Math.max(
      (lib && lib.footprint && lib.footprint[0]) || 1,
      (lib && lib.footprint && lib.footprint[1]) || 1,
      (lib && lib.height) || 1
    ) * (scale || 1);
    geometry.scale(target / maxDim, target / maxDim, target / maxDim);
    geometry.computeBoundingBox();
    const b = new THREE.Box3().setFromBufferAttribute(geometry.attributes.position);
    const c = b.getCenter(new THREE.Vector3());
    geometry.translate(-c.x, -b.min.y, -c.z);
    geometry.computeBoundingSphere();
    return geometry;
  } catch (e) {
    console.warn('[street-furniture] geometry finalise failed', e);
    return null;
  }
}

function loadPropAsync(entry) {
  if (_cache.has(entry.id)) return _cache.get(entry.id);
  const item = libraryItem(entry.id);
  if (!item) { _cache.set(entry.id, null); return null; }
  const p = _loader.loadAsync(item.glb)
    .then((gltf) => {
      const root = gltf.scene || (gltf.scenes && gltf.scenes[0]);
      const norm = root ? normalizeProp(root, item, entry.scale) : null;
      _cache.set(entry.id, norm);
      return norm;
    })
    .catch((e) => {
      console.warn(`[street-furniture] ${item.id} load failed — skipping`, e);
      _cache.set(entry.id, null);
      return null;
    });
  _cache.set(entry.id, p);   // cache the promise so concurrent calls share
  return p;
}

// ── Deterministic scatter ───────────────────────────────────────────────────
function hash01(x, z, salt = 0) {
  const v = Math.sin(x * 127.1 + z * 311.7 + salt * 74.7) * 43758.5453;
  return v - Math.floor(v);
}

/** Distance from a point to the nearest point on a road polyline. */
function distToRoad(px, pz, road) {
  const pts = road.points || [];
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, z1] = pts[i], [x2, z2] = pts[i + 1];
    const dx = x2 - x1, dz = z2 - z1, l2 = dx * dx + dz * dz;
    let t = l2 ? ((px - x1) * dx + (pz - z1) * dz) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    best = Math.min(best, Math.hypot(px - (x1 + t * dx), pz - (z1 + t * dz)));
  }
  return best;
}

/** Nearest building zone near a point (commercial / civic / residential / ''). */
function zoneNear(x, z, buildings) {
  let zone = '', best = Infinity;
  for (const b of buildings || []) {
    const d = Math.hypot(b.pos[0] - x, b.pos[1] - z);
    if (d < best) { best = d; zone = catalogType(b.type)?.zone || ''; }
  }
  if (best > 55) zone = '';   // too far from any building to matter
  return zone;
}

/** Weighted pick from the furniture table. */
function pickModel(roll, zone) {
  // Zone context tilts the mix: cafés get parasols, civic gets planters, homes
  // get bikes. Otherwise the default street mix (hydrants/bins/mailboxes/pots).
  if (zone === 'commercial' && roll < 0.5) return FURNITURE[7];       // parasol
  if (zone === 'civic' && roll >= 0.5 && roll < 0.8) return FURNITURE[4]; // pot
  if (zone === 'civic' && roll >= 0.8 && roll < 0.97) return FURNITURE[5]; // planter
  if (zone === 'residential' && roll >= 0.5 && roll < 0.85) return FURNITURE[6]; // bike
  // default: weighted roll across the table
  const total = FURNITURE.reduce((s, f) => s + f.w, 0);
  let acc = 0, r2 = hash01(Math.round(roll * 1e5), 0, 7);   // second deterministic roll
  r2 = (r2 + roll) % 1;
  for (const f of FURNITURE) {
    acc += f.w / total;
    if (r2 <= acc) return f;
  }
  return FURNITURE[1];
}

/**
 * Scatter sidewalk furniture. Async + fire-and-forget; callers just let it run.
 * @returns {Promise<{count:number, models:string[]}>}
 */
export async function loadStreetFurnitureEntry(entry) { return loadPropAsync(entry); }

export async function createStreetFurniture(scene, layout, { exclude = () => false, schedule = (task) => task() } = {}) {
  const buildings = (layout && layout.buildings) || [];
  const roads = (layout && layout.roads) || [];
  if (!roads.length) return { count: 0, models: [] };
  const roadNetwork = buildTrafficNetwork(roads);

  // Preload all models (parallel); any failure just drops that model.
  const entries = await Promise.all(FURNITURE.map((f) => schedule(() => loadPropAsync(f)).then((n) => ({ f, n }))));

  const placements = [];   // { modelIdx, x, z, yaw }
  for (const r of roads) {
    const half = (r.width || 9) / 2;
    const pts = r.points || [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 30) continue;
      const n = Math.min(Math.floor(len / STEP), 40);
      for (let k = 0; k < n && placements.length < MAX_TOTAL; k++) {
        const t = (k + 0.5) / n;
        const bx = x0 + (x1 - x0) * t, bz = z0 + (z1 - z0) * t;
        let dx = x1 - x0, dz = z1 - z0;
        const dl = Math.hypot(dx, dz) || 1;
        dx /= dl; dz /= dl;
        // Alternate pavements deterministically; small jitter along the kerb.
        const side = hash01(bx, bz, 1) < 0.5 ? 1 : -1;
        const jitter = (hash01(bx, bz, 2) - 0.5) * 4;
        const px = bx + (-dz * side) * (half + SIDEWALK) + dx * jitter;
        const pz = bz + (dx * side) * (half + SIDEWALK) + dz * jitter;

        // Use the same full road + junction geometry as lamps, trees and
        // traffic. Checking only "other" centre lines missed junction mouths.
        if (!isRoadsideSceneryClear(roadNetwork, px, pz, .9, 8) || exclude(px, pz)) continue;

        const zone = zoneNear(px, pz, buildings);
        const roll = hash01(px, pz, 3);
        const model = pickModel(roll, zone);
        if (!model) continue;
        // Low chance the slot stays empty (street feels punctuated, not paved).
        if (hash01(px, pz, 4) < 0.25) continue;
        placements.push({ model, x: Math.round(px), z: Math.round(pz), yaw: Math.atan2(dx, dz) });
      }
    }
  }
  if (!placements.length) return { count: 0, models: [] };

  // Flush into one InstancedMesh per loaded model.
  const counts = new Map();
  for (const pl of placements) {
    const key = pl.model.id;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const insts = new Map();
  for (const { f, n } of entries) {
    if (!n || !counts.has(f.id)) continue;
    const inst = new THREE.InstancedMesh(n.geometry, n.material, counts.get(f.id));
    inst.count = 0;
    inst.castShadow = true;
    inst.userData.isStreetFurniture = f.id;
    scene.add(inst);
    insts.set(f.id, inst);
  }
  const written = new Map();
  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const scl = new THREE.Vector3(1, 1, 1);
  for (const pl of placements) {
    const inst = insts.get(pl.model.id);
    if (!inst) continue;
    pos.set(pl.x, 0, pl.z);
    quat.setFromAxisAngle(up, pl.yaw);
    m.compose(pos, quat, scl);
    const i = written.get(pl.model.id) || 0;
    written.set(pl.model.id, i + 1);
    inst.setMatrixAt(i, m);
    inst.count = i + 1;
    inst.instanceMatrix.needsUpdate = true;
  }
  return { count: placements.length, models: [...written.keys()] };
}
