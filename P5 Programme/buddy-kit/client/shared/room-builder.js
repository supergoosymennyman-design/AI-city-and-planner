// shared/room-builder.js — premium multi-room interior builder ("solar-cyber").
//
// Extracted + generalized from lab/lab-room.js. Builds large, connected indoor
// spaces that the AI champion walks through and explores:
//   • floor  — one grid mesh, colour-coded per ROOM (each zone gets its own
//              floor + accent inlay + entry walkway), perimeter AO + baked
//              furniture AO
//   • walls  — 4 banded outer walls (baseboard / wainscot / neon trim rail /
//              upper) with a main entry door, PLUS internal partition walls
//              with door gaps — every wall is a separate mesh tagged
//              `userData.wall` + `wallSide` so the shared wall-fade works
//   • ceiling— plane + recessed light panels + cove glow, one merged group
//   • colliders — outer perimeter + each partition segment (door gaps walkable)
//
// Everything is vertex-coloured + merged (Lambert), zero shadows — cheap on
// school tablets and matches the anti-slop playbook.
//
// Usage (a template config):
//   import { buildMultiRoom, bakeFloorAO, aoListFromFurniture } from '../shared/room-builder.js';
//   buildRoom: (scene, cfg) => {
//     const shell = buildMultiRoom(scene, cfg.plan);
//     bakeFloorAO(shell.floor, aoListFromFurniture(cfg));
//     return shell;
//   }
//
// `cfg.plan` shape:
//   {
//     w, d, h,                       // outer footprint (metres)
//     hull: { wall, baseboard, trim, ceiling, lightPanel, cove, frame },  // neutral shell palette
//     rooms: [                       // per-zone rectangles for floor colour + lights
//       { id, x, z, w, d, palette, ringR },  // palette: { floor, inlay, walk, ring, accent, emissive, lightPanel }
//     ],
//     partitions: [                  // internal walls WITH door gaps
//       { x, z, w, d, side, door: { cx, cw } },   // w/d are the full wall dims; door gap carved
//     ],
//     entryDoor: { side: 's', cx: 0, cw: 2.0 },  // outer entry (null = none)
//     gridStep: 1.0,                 // floor grid spacing (0 disables)
//   }
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { vertexInteriorMaterial, glowMaterial, interiorMaterial, LAB_DIMS } from './interior.js';
import { libraryItem } from '../city-common/library.js';
export { LAB_DIMS, anchorDisc, makeActiveRing, makeChampionDisc, updateWallFade, updateCeilingFade, resolveCollision, addCollider, setupInteriorLights } from './interior.js';

const TH = 0.2;                 // wall thickness
const AO_EDGE_COLOR = new THREE.Color('#0A1020');

// ── geometry helpers (flat vertex-coloured, uv stripped) ───────────────────
function boxGeo(w, h, d, color, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  return tintGeo(g, color, x, y, z);
}
function tintGeo(geo, color, x = 0, y = 0, z = 0) {
  geo.deleteAttribute('uv');
  const count = geo.attributes.position.count;
  const c = new Float32Array(count * 3);
  const col = new THREE.Color(color);
  for (let i = 0; i < count; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  geo.translate(x, y, z);
  return geo;
}
function merge(geos) { return mergeGeometries(geos, false); }

/** Band scheme for a wall segment: baseboard / wainscot / neon trim / upper. */
function bandsFor(h, p) {
  return [
    { from: 0.0, to: 0.12, color: p.baseboard },
    { from: 0.12, to: 0.95, color: p.wall },
    { from: 0.95, to: 1.01, color: p.trim },   // neon accent rail — wayfinding
    { from: 1.01, to: h, color: p.wall },
  ];
}
function bandBoxes(bands, w, x, z) {
  return bands.map((b) => boxGeo(w, b.to - b.from, TH, b.color, x, (b.from + b.to) / 2, z));
}

// ── floor ────────────────────────────────────────────────────────────────────
/** Grid floor colour-coded per room: zone floor + grout grid + accent inlay + walk. */
function buildFloor(plan, rooms) {
  const { w, d, gridStep } = plan;
  const segX = Math.round(w / 0.25), segZ = Math.round(d / 0.25);
  const geo = new THREE.PlaneGeometry(w, d, segX, segZ);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const innerX = w / 2 - TH / 2, innerZ = d / 2 - TH / 2;
  const step = gridStep || 0;

  const roomAt = (x, z) => rooms.find((r) => Math.abs(x - r.x) <= r.w / 2 && Math.abs(z - r.z) <= r.d / 2);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const room = roomAt(x, z);
    const p = room ? room.palette : plan.hull;

    const onGrid = step > 0 && (Math.abs(x - Math.round(x / step) * step) < 0.07 || Math.abs(z - Math.round(z / step) * step) < 0.07);
    if (onGrid) {
      c.setHex(p.grout || p.trim);
    } else {
      c.setHex(p.floor);
      const n = Math.sin(i * 12.9898 + 4.14) * 43758.5453;
      c.multiplyScalar(1 + (n - Math.floor(n) - 0.5) * 0.04);
    }
    // Zone accent inlay near each room's centre (a "stage" spot).
    if (room) {
      const rx = (x - room.x) / (room.w / 2), rz = (z - room.z) / (room.d / 2);
      const dist = Math.hypot(rx, rz);
      if (dist <= 0.55) c.setHex(p.inlay || p.accent);
    }
    // Entry walkway from the main door toward the room centres.
    if (plan.entryDoor && Math.abs(x) < 1.2 && z > innerZ - 4) c.setHex(p.walk || p.floor);
    const aoEdge = Math.max(0, Math.min(1,
      Math.max((Math.abs(x) - (innerX - 0.45)) / 0.45, (Math.abs(z) - (innerZ - 0.45)) / 0.45)
    ));
    if (aoEdge > 0) c.lerp(AO_EDGE_COLOR, aoEdge * 0.5);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return new THREE.Mesh(geo, vertexInteriorMaterial());
}

/** Bake soft AO under static furniture by darkening floor vertices. */
export function bakeFloorAO(floor, aoList) {
  if (!floor || !aoList || !aoList.length) return;
  const pos = floor.geometry.attributes.position;
  const colors = floor.geometry.attributes.color;
  const c = new THREE.Color(), target = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    let dark = 0, bestColor = null;
    for (const a of aoList) {
      const dx = (x - a.x) / a.rx, dz = (z - a.z) / a.rz;
      const d2 = dx * dx + dz * dz;
      if (d2 < 1) {
        const k = (1 - d2) * (a.strength || 0.5);
        if (k > dark) { dark = k; bestColor = a.color; }
      }
    }
    if (dark > 0 && bestColor) {
      c.setRGB(colors.getX(i), colors.getY(i), colors.getZ(i));
      target.set(bestColor);
      c.lerp(target, dark);
      colors.setXYZ(i, c.r, c.g, c.b);
    }
  }
  colors.needsUpdate = true;
}

// ── ceiling ──────────────────────────────────────────────────────────────────
/** Ceiling group: plane + recessed light panels (per room) + cove glow. */
function buildCeiling(plan) {
  const { w, d, h } = plan;
  const g = new THREE.Group();
  g.position.y = h;
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    interiorMaterial(plan.hull.ceiling)
  );
  plane.rotation.x = Math.PI / 2;
  g.add(plane);

  const glowParts = [];
  const rooms = plan.rooms || [];
  // One light panel cluster per room (2×2), tinted the room accent.
  for (const room of rooms) {
    const rows = room.d / 2 - 0.8;
    if (rows < 0.2) rows = 0.2;
    for (const px of [-room.w / 4, room.w / 4]) {
      for (const pz of [-rows, rows]) {
        glowParts.push(boxGeo(1.2, 0.04, 0.7, room.palette.lightPanel || room.palette.emissive, room.x + px, -0.03, room.z + pz));
      }
    }
  }
  if (glowParts.length) g.add(new THREE.Mesh(merge(glowParts), glowMaterial()));
  return g;
}

/** Per-zone stage ring (one opaque draw) — the "you are here" floor ring. */
function roomRings(rooms, scene) {
  for (const room of rooms) {
    const r = room.ringR || 0.8;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(r, r + 0.08, 48),
      new THREE.MeshBasicMaterial({ color: room.palette.ring || room.palette.accent, toneMapped: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(room.x, 0.006, room.z);
    scene.add(ring);
  }
}

// ── wall segment builders ────────────────────────────────────────────────────
/** A banded wall mesh spanning from x0..x1 on a fixed z centre line. */
function hWall(bands, x0, x1, z) {
  const wl = Math.abs(x1 - x0);
  if (wl < 0.01) return null;
  return merge(bands.map((b) => boxGeo(wl, b.to - b.from, TH, b.color, (x0 + x1) / 2, (b.from + b.to) / 2, z)));
}
/** A banded wall mesh spanning from z0..z1 on a fixed x centre line. */
function vWall(bands, z0, z1, x) {
  const wl = Math.abs(z1 - z0);
  if (wl < 0.01) return null;
  return merge(bands.map((b) => boxGeo(TH, b.to - b.from, wl, b.color, x, (b.from + b.to) / 2, (z0 + z1) / 2)));
}

// ── room entry ───────────────────────────────────────────────────────────────
/**
 * Build the whole multi-room interior shell.
 * Returns { walls, ceiling, colliders, floor, dims } — compatible with the
 * shared fade/collision systems. Walls carry userData.wallSide.
 */
export function buildMultiRoom(scene, plan) {
  const w = plan.w, d = plan.d, h = plan.h || 4;
  const hw = w / 2, hd = d / 2;
  const hull = plan.hull;
  const bands = bandsFor(h, hull);
  const walls = [];
  const colliders = [];
  const mkWall = (geo, side) => {
    if (!geo) return;
    const m = new THREE.Mesh(geo, vertexInteriorMaterial());
    m.userData.wall = true;
    m.userData.wallSide = side;
    scene.add(m);
    walls.push(m);
  };

  // ── Outer shell with an entry door gap on the chosen side ──
  const door = plan.entryDoor || null;
  const doorSide = door ? door.side : null;
  const doorCx = door ? (door.cx || 0) : 0;
  const doorCw = door ? (door.cw || 2.0) : 0;
  const lintel = (x0, x1, z, side) => {
    const wl = Math.abs(x1 - x0);
    if (wl < 0.01) return;
    mkWall(merge(bands.map((b) => boxGeo(wl, b.to - b.from, TH, b.color, (x0 + x1) / 2, (b.from + b.to) / 2, z))), side);
  };

  // North (−hd)
  if (doorSide === 'n') {
    mkWall(hWall(bands, -hw, doorCx - doorCw / 2, -hd), 'n');
    mkWall(hWall(bands, doorCx + doorCw / 2, hw, -hd), 'n');
    lintel(doorCx - doorCw / 2, doorCx + doorCw / 2, -hd, 'n');
  } else {
    mkWall(hWall(bands, -hw, hw, -hd), 'n');
  }
  // South (+hd)
  if (doorSide === 's') {
    mkWall(hWall(bands, -hw, doorCx - doorCw / 2, hd), 's');
    mkWall(hWall(bands, doorCx + doorCw / 2, hw, hd), 's');
    lintel(doorCx - doorCw / 2, doorCx + doorCw / 2, hd, 's');
  } else {
    mkWall(hWall(bands, -hw, hw, hd), 's');
  }
  // West / East
  mkWall(vWall(bands, -hd, hd, -hw), 'w');
  mkWall(vWall(bands, -hd, hd, hw), 'e');

  // Outer colliders (keep door gap walkable — the visual door opening must be
  // mirrored in the collider, or the entry becomes an invisible wall).
  const eDoorCx = plan.entryDoor?.cx ?? 0, eDoorCw = plan.entryDoor?.cw ?? 0;
  const eDoorSide = plan.entryDoor?.side ?? 's';
  const pushSideCollider = (minX, maxX, minZ, maxZ) => colliders.push({ minX, maxX, minZ, maxZ });
  const pushDoorGapWall = (side, minA, maxA, wallZ) => {
    // Horizontal wall at fixed z (north/south); split around the door gap.
    if (side === 'n' || side === 's') {
      pushSideCollider(minA, eDoorCx - eDoorCw / 2, wallZ - 0.3, wallZ);
      pushSideCollider(eDoorCx + eDoorCw / 2, maxA, wallZ - 0.3, wallZ);
    } else {
      // Vertical wall at fixed x (west/east); no door on these sides.
      pushSideCollider(wallZ - 0.3, wallZ + 0.3, minA, maxA);
    }
  };
  if (eDoorSide === 'n') {
    pushDoorGapWall('n', -hw, hw, -hd);
    pushSideCollider(-hw, hw, hd - 0.3, hd);            // south solid
  } else {
    pushSideCollider(-hw, hw, -hd, -hd + 0.3);          // north solid
    pushDoorGapWall('s', -hw, hw, hd);
  }
  pushSideCollider(-hw, -hw + 0.3, -hd, hd);            // west
  pushSideCollider(hw - 0.3, hw, -hd, hd);              // east

  // ── Internal partition walls with door gaps ──
  for (const part of (plan.partitions || [])) {
    const pd = part.door || null;
    const pCx = pd ? pd.cx : 0, pCw = pd ? (pd.cw || 1.6) : 0;
    const axis = part.axis || (Math.abs(part.w - TH) < 0.01 ? 'z' : 'x');
    const side = part.side || 'e';
    if (axis === 'z') {
      // Vertical wall at fixed x, spanning z0..z1 (along depth)
      const z0 = part.z - part.d / 2, z1 = part.z + part.d / 2;
      const x = part.x;
      if (pd) {
        mkWall(vWall(bands, z0, pCx - pCw / 2, x), side);
        mkWall(vWall(bands, pCx + pCw / 2, z1, x), side);
        mkWall(merge(bands.map((b) => boxGeo(TH, b.to - b.from, pCw, b.color, x, (b.from + b.to) / 2, pCx))), side);
        colliders.push({ minX: x - 0.15, maxX: x + 0.15, minZ: z0, maxZ: pCx - pCw / 2 });
        colliders.push({ minX: x - 0.15, maxX: x + 0.15, minZ: pCx + pCw / 2, maxZ: z1 });
      } else {
        mkWall(vWall(bands, z0, z1, x), side);
        colliders.push({ minX: x - 0.15, maxX: x + 0.15, minZ: z0, maxZ: z1 });
      }
    } else {
      // Horizontal wall at fixed z, spanning x0..x1
      const x0 = part.x - part.w / 2, x1 = part.x + part.w / 2;
      const z = part.z;
      if (pd) {
        mkWall(hWall(bands, x0, pCx - pCw / 2, z), side);
        mkWall(hWall(bands, pCx + pCw / 2, x1, z), side);
        mkWall(merge(bands.map((b) => boxGeo(pCw, b.to - b.from, TH, b.color, pCx, (b.from + b.to) / 2, z))), side);
        colliders.push({ minX: x0, maxX: pCx - pCw / 2, minZ: z - 0.15, maxZ: z + 0.15 });
        colliders.push({ minX: pCx + pCw / 2, maxX: x1, minZ: z - 0.15, maxZ: z + 0.15 });
      } else {
        mkWall(hWall(bands, x0, x1, z), side);
        colliders.push({ minX: x0, maxX: x1, minZ: z - 0.15, maxZ: z + 0.15 });
      }
    }
  }

  // ── Floor + ceiling + stage rings ──
  const floor = buildFloor(plan, plan.rooms || []);
  scene.add(floor);
  const ceiling = buildCeiling(plan);
  scene.add(ceiling);
  roomRings(plan.rooms || [], scene);

  // ── Solid raised platforms (+ stairs/ramp) ──
  // Each platform: { x, z, w, d, topY, stairSide?, stairW? }.
  // - The top surface is walkable (champion stands at y=topY).
  // - `stairSide` ('n'|'s'|'e'|'w') adds a walkable ramp up one side.
  // Colliders: the platform footprint gets a low "wall" collider (topY) so the
  // champion can't walk through it at floor level, and each stair adds a
  // stepped collider. The returned `platforms` list feeds the shared
  // height-aware movement in scenario.js (groundHeightAt + step/fall).
  const platformData = [];
  for (const pf of (plan.platforms || [])) {
    const topY = pf.topY || 1.2;
    const pw = pf.w, pd = pf.d;
    const px = pf.x, pz = pf.z;
    const hw = pw / 2, hd = pd / 2;
    const platColor = pf.color || plan.hull.trim;
    const stepColor = pf.stepColor || plan.hull.trim;
    // Platform slab (solid box, top at topY)
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(pw, topY, pd),
      vertexInteriorMaterial({ color: 0xffffff, vertexColors: true })
    );
    // Give the slab flat vertex colours (sides darker, top = trim).
    {
      const g = slab.geometry;
      g.deleteAttribute('uv');
      const n = g.attributes.position.count;
      const c = new Float32Array(n * 3);
      const top = new THREE.Color(plan.hull.floor);
      const side = new THREE.Color(platColor);
      const col = new THREE.Color();
      for (let i = 0; i < n; i++) {
        const y = g.attributes.position.getY(i);
        col.copy(y > topY - 0.05 ? top : side);
        c[i*3] = col.r; c[i*3+1] = col.g; c[i*3+2] = col.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    }
    slab.position.set(px, topY / 2, pz);
    scene.add(slab);
    // Neon top edge ring (emissive) so the platform reads as a lit surface.
    const edge = new THREE.Mesh(
      new THREE.BoxGeometry(pw + 0.08, 0.06, pd + 0.08),
      glowMaterial()
    );
    {
      const g = edge.geometry;
      g.deleteAttribute('uv');
      const n = g.attributes.position.count;
      const c = new Float32Array(n * 3);
      const cc = new THREE.Color(pf.emissive || plan.hull.trim);
      for (let i = 0; i < n; i++) { c[i*3]=cc.r; c[i*3+1]=cc.g; c[i*3+2]=cc.b; }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    }
    edge.position.set(px, topY + 0.03, pz);
    scene.add(edge);

    // Footprint low wall collider (blocks at floor level, walkable on top).
    colliders.push({ minX: px - hw, maxX: px + hw, minZ: pz - hd, maxZ: pz + hd, topY });

    // Stairs / ramp up the chosen side. Steps climb toward the platform:
    // i=0 is the FARTHEST + LOWEST step, i=nSteps-1 touches the platform edge.
    const stairs = [];
    if (pf.stairSide) {
      const stairW = pf.stairW || Math.min(pw, pd) * 0.7;
      const nSteps = Math.max(2, Math.round(topY / 0.4));
      const stepH = topY / nSteps;
      const stepD = 0.5;
      for (let i = 0; i < nSteps; i++) {
        const h = (i + 1) * stepH;                       // rises toward platform
        const off = (nSteps - i) * stepD;                // farthest = lowest
        const sc = new THREE.Color(stepColor);
        const g = new THREE.BoxGeometry(stairW, stepH, stepD);
        g.deleteAttribute('uv');
        const cn = g.attributes.position.count;
        const c = new Float32Array(cn * 3);
        for (let j = 0; j < cn; j++) { c[j*3]=sc.r; c[j*3+1]=sc.g; c[j*3+2]=sc.b; }
        g.setAttribute('color', new THREE.BufferAttribute(c, 3));
        const m = new THREE.Mesh(g, vertexInteriorMaterial());
        if (pf.stairSide === 's') { m.position.set(px, h - stepH / 2, pz + hd + off); }
        else if (pf.stairSide === 'n') { m.position.set(px, h - stepH / 2, pz - hd - off); }
        else if (pf.stairSide === 'e') { m.position.set(px + hw + off, h - stepH / 2, pz); }
        else { m.position.set(px - hw - off, h - stepH / 2, pz); }
        scene.add(m);
        stairs.push(m);
        // NOTE: no step collider — the stair band is walkable via
        // groundHeightAt() in scenario.js (continuous ramp). Only the platform
        // footprint gets a low wall collider, so the champion can't walk
        // through the platform itself at floor level.
      }
    }
    platformData.push({ x: px, z: pz, w: pw, d: pd, topY, stairSide: pf.stairSide, stairW: pf.stairW || Math.min(pw, pd) * 0.7, stairs, slab, edge });
  }

  return { walls, ceiling, colliders, floor, dims: { w, d, h }, platforms: platformData };
}

/** AO list from a template's furniture (static ground items only). */
export function aoListFromFurniture(config) {
  const list = [];
  for (const f of (config.furniture || [])) {
    if (f.id.startsWith('__') || f.wall || f.y > 0 || f.collider === false) continue;
    const item = libraryItem(f.id);
    if (!item) continue;
    const [w, d] = item.footprint;
    const s = f.scale || 1;
    list.push({ x: f.x, z: f.z, rx: w * s * 0.6 + 0.15, rz: d * s * 0.6 + 0.15, color: '#0A1020', strength: 0.5 });
  }
  return list;
}
