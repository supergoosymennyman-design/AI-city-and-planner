// street-deco.js — playground equipment (parks) + street furniture
// (intersections): swing set, slide, fountain in green spaces; traffic lights
// and stop signs at road junctions. Static, small, fire-and-forget — each
// model loads async and is placed once per spot; a load failure is silently
// skipped (no crash, no hang).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const PLAYGROUND = [
  { file: 'assets/models/playground/swing-set.glb',      name: 'swing set' },
  { file: 'assets/models/playground/slide-opt.glb',      name: 'slide' },
  { file: 'assets/models/playground/fountain-opt.glb',   name: 'fountain' },
];
const STREET_DECO = [
  { file: 'assets/models/street-deco/traffic-light.glb', name: 'traffic light' },
  { file: 'assets/models/street-deco/stop-sign.glb',     name: 'stop sign' },
];

/**
 * Scatter playground + street deco. Parks get a swing/slide/fountain near the
 * centre; road intersections get a traffic light + stop sign. All async and
 * non-blocking.
 */
export function scatterStreetDeco(scene, layout) {
  const loader = new GLTFLoader();
  const parkSpots = (layout.parks || []).map((p) => ({ x: p.cx, z: p.cz, radius: p.radius || 40 }));

  // Playground: one random piece per park (if it has room).
  for (const spot of parkSpots) {
    const def = PLAYGROUND[Math.floor(Math.random() * PLAYGROUND.length)];
    place(loader, scene, def, spot.x, spot.z, Math.min(6, spot.radius * 0.25));
  }

  // Street deco: at each road midpoint-ish junction we just pick a few
  // points along primary roads (cheap, no real intersection detection).
  const roads = layout.roads || [];
  const primary = roads.filter((r) => r.class === 'primary' || (r.points || []).length >= 2);
  let decoCount = 0;
  for (const r of primary) {
    const pts = r.points;
    if (!pts || pts.length < 2 || decoCount >= 6) continue;
    // Midpoint of the first segment — a sensible "junction-ish" spot.
    const a = pts[0], b = pts[1];
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    const def = STREET_DECO[decoCount % STREET_DECO.length];
    place(loader, scene, def, mx, mz, 0);
    decoCount++;
  }
}

function place(loader, scene, def, x, z, targetScale) {
  loader.loadAsync(def.file)
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
      model.position.set(x, 0, z);
      model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      scene.add(model);
    })
    .catch((e) => { console.warn('[street-deco]', def.name, 'failed:', e); });
}
