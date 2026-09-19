// interior.js — shared indoor-room helpers for the scenario shells.
// Enclosed walkable rooms: Lambert+vertexColor materials (cheap on tablets),
// 0.2m walls with single-sided wall-fade, ceiling auto-fade, hemisphere +
// one champion point-light, AABB colliders.
import * as THREE from 'three';

/** Cheap lit material for interiors (Lambert, not Standard — big tablet win). */
export function interiorMaterial(color, opts = {}) {
  return new THREE.MeshLambertMaterial({ color, ...opts });
}

/** Cheap unlit material for emissive screens/lamps. */
export function emissiveMaterial(color) {
  return new THREE.MeshBasicMaterial({ color });
}

/** White Lambert that reads vertex colors — for merged banded architecture. */
export function vertexInteriorMaterial(opts = {}) {
  return new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, ...opts });
}

/** Unlit glow material driven by vertex colors (screens, panels, anchor glow). */
export function glowMaterial(opts = {}) {
  return new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, toneMapped: false, ...opts });
}

/**
 * Build the room shell (walls/floor/ceiling) + wall colliders.
 * `palette`: { wall, floor, ceiling } hex colours.
 * Returns { walls, ceiling, colliders }.
 */
export function buildRoomShell(scene, { w, d, h, palette, doorGap = 2.4 }) {
  const hw = w / 2, hd = d / 2;
  const walls = [];
  const colliders = [];
  const mkWall = (x, y, z, bw, bh, bd) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), interiorMaterial(palette.wall, { transparent: true }));
    m.position.set(x, y, z);
    m.userData.wall = true;
    scene.add(m);
    walls.push(m);
    return m;
  };

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), interiorMaterial(palette.floor));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  // Front (-z) has the doorway gap; back, left, right are solid.
  mkWall(0, h / 2, -hd, w, h, 0.2);
  mkWall(0, h / 2, hd, w, h, 0.2);
  mkWall(-hw, h / 2, 0, 0.2, h, d - doorGap);
  mkWall(hw, h / 2, 0, 0.2, h, d);

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(w, d), interiorMaterial(palette.ceiling, { transparent: true }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = h;
  scene.add(ceiling);

  colliders.push({ minX: -hw, maxX: hw, minZ: -hd, maxZ: -hd + 0.3 });
  colliders.push({ minX: -hw, maxX: hw, minZ: hd - 0.3, maxZ: hd });
  colliders.push({ minX: -hw, maxX: -hw + 0.3, minZ: -hd, maxZ: hd });
  colliders.push({ minX: hw - 0.3, maxX: hw, minZ: -hd, maxZ: hd });

  return { walls, ceiling, colliders };
}

/** Push an axis-aligned collider (centre cx,cz + footprint [w,d]). Optional
 *  per-collider `radius` lets furniture collide tighter than walls. */
export function addCollider(list, cx, cz, fp, radius) {
  const c = { minX: cx - fp[0] / 2, maxX: cx + fp[0] / 2, minZ: cz - fp[1] / 2, maxZ: cz + fp[1] / 2 };
  if (radius != null) c.radius = radius;
  list.push(c);
  return c;
}

/** Hemisphere + one point-light; returns the point light (follow the champion). */
export function setupInteriorLights(scene, { hemiSky, hemiGround, hemiIntensity, pointColor, pointIntensity, distance = 9, decay = 2 }) {
  const hemi = new THREE.HemisphereLight(hemiSky, hemiGround, hemiIntensity);
  scene.add(hemi);
  const point = new THREE.PointLight(pointColor, pointIntensity, distance, decay);
  point.position.set(0, 2, 0);
  point.userData.hemi = hemi;   // let scenarios re-tint the ambient per zone
  scene.add(point);
  return point;
}

/**
 * Fade the walls between camera and the focus (champion). Fades ONLY the
 * blocking wall group. Pass the returned `faded` set back in each frame.
 *
 * Walls may carry `userData.wallSide` ('n'|'s'|'e'|'w'). Wall-mounted props
 * (displays, lamps, switches, halos) that share the same `wallSide` and have
 * `userData.wallProp = true` are hidden while that wall is faded, so glow does
 * not float on an invisible wall. Pass the props list as `wallProps`.
 */
export function updateWallFade(camera, focus, walls, ray, faded, wallProps = null) {
  const fadedSides = new Set();
  for (const m of faded) {
    m.material.opacity = 1;
    m.material.transparent = false;
    m.material.depthWrite = true;
    m.renderOrder = 0;
  }
  faded.clear();
  const dir = new THREE.Vector3().subVectors(focus, camera.position);
  const dist = dir.length();
  if (dist < 0.01) return;
  ray.set(camera.position, dir.normalize());
  ray.far = dist;
  const hits = ray.intersectObjects(walls, false);
  for (const h of hits) {
    if (h.object.userData.wall) {
      h.object.material.opacity = 0.12;
      h.object.material.transparent = true;
      h.object.material.depthWrite = false;
      h.object.renderOrder = 20;
      faded.add(h.object);
      if (h.object.userData.wallSide) fadedSides.add(h.object.userData.wallSide);
    }
  }
  if (wallProps) {
    for (const p of wallProps) {
      if (!p.userData || !p.userData.wallProp) continue;
      p.visible = !fadedSides.has(p.userData.wallSide);
    }
  }
}

/**
 * Hide the ceiling group when the camera rises above it so the orbit cam never
 * clips. The ceiling is hidden (visible=false), not faded — that keeps the
 * ceiling plane + recessed light panels + cove at zero transparent draws.
 */
export function updateCeilingFade(camera, ceiling, fadeBelow = 0.5) {
  if (!ceiling) return;
  ceiling.visible = camera.position.y <= ceiling.position.y - fadeBelow;
}

/** Slide a point out of the nearest inflated AABB (champion = circle). */
/**
 * Resolve champion/furniture collision. Iterates to convergence (bounded) so a
 * position squeezed between two colliders — or a collider + a wall — settles
 * instead of jittering forever, and each collider may carry its own `radius`
 * (furniture uses a smaller one than walls so tight gaps stay walkable).
 */
export function resolveCollision(x, z, r, colliders) {
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (const c of colliders) {
      const cr = (c.radius ?? r) || r;
      const minX = c.minX - cr, maxX = c.maxX + cr, minZ = c.minZ - cr, maxZ = c.maxZ + cr;
      if (x <= minX || x >= maxX || z <= minZ || z >= maxZ) continue;
      const dxL = x - minX, dxR = maxX - x, dzL = z - minZ, dzR = maxZ - z;
      const m = Math.min(dxL, dxR, dzL, dzR);
      if (m === dxL) x = minX;
      else if (m === dxR) x = maxX;
      else if (m === dzL) z = minZ;
      else z = maxZ;
      moved = true;
    }
    if (!moved) break;
  }
  return { x, z };
}

// ── shared interior visuals (moved from lab-room) ──
export const LAB_DIMS = { w: 14, d: 10, h: 4 };
function flatDisc(radii, colors) {
  const SEG = 24;
  const pos = [0, 0, 0];
  const c0 = new THREE.Color(colors[0]);
  const cols = [c0.r, c0.g, c0.b];
  const idx = [];
  for (let r = 0; r < radii.length; r++) {
    for (let s = 0; s <= SEG; s++) {
      const a = (s / SEG) * Math.PI * 2;
      const ang = a < Math.PI ? a : a - Math.PI * 2;
      const bump = (r === radii.length - 1 && Math.abs(ang) < 0.13) ? 1.28 : 1; // notch at +z
      pos.push(Math.cos(a) * radii[r] * bump, Math.sin(a) * radii[r] * bump, 0);
      const c = new THREE.Color(colors[r]);
      cols.push(c.r, c.g, c.b);
    }
  }
  for (let s = 0; s < SEG; s++) idx.push(0, 1 + s + 1, 1 + s);
  for (let r = 0; r < radii.length - 1; r++) {
    const base = 1 + r * (SEG + 1), next = 1 + (r + 1) * (SEG + 1);
    for (let s = 0; s < SEG; s++) {
      idx.push(base + s, next + s, base + s + 1);
      idx.push(next + s, next + s + 1, base + s + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.rotateX(-Math.PI / 2);
  return g;
}

/** Anchor pad mesh (recessed disc: dark centre → mid → accent ring → surface edge). */
export function anchorDisc(radius, surfaceColor, accent) {
  const radii = [0, radius * 0.35, radius * 0.55, radius * 0.72, radius * 0.92, radius];
  const colors = ['#5F717D', '#5F717D', '#6E8290', accent, surfaceColor, surfaceColor];
  const mesh = new THREE.Mesh(flatDisc(radii, colors), glowMaterial());
  mesh.userData.anchorRadius = radius;
  return mesh;
}

/** One shared highlight ring, shown + scaled over the target pad while carrying. */
export function makeActiveRing(radius = 0.28) {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.62, radius * 0.86, 32),
    new THREE.MeshBasicMaterial({ color: '#FFE08A', toneMapped: false, side: THREE.DoubleSide })
  );
  m.rotation.x = -Math.PI / 2;
  m.visible = false;
  return m;
}

/** Champion grounding disc — opaque, vertex-coloured, z-fighting-safe. */
export function makeChampionDisc() {
  const geo = new THREE.CircleGeometry(0.36, 20);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const inner = new THREE.Color('#A2B4C0'), outer = new THREE.Color('#DFE9EF');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getZ(i)) / 0.36;
    c.copy(inner).lerp(outer, r);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true }));
  m.position.y = 0.003;
  m.renderOrder = 1;
  m.material.polygonOffset = true;
  m.material.polygonOffsetFactor = -1;
  return m;
}
