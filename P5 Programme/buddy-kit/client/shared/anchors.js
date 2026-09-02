// anchors.js — the "pegboard" placement system for interior shells.
// Rooms are a fixed shell + typed anchor slots. Kids fill slots (4 rotations
// only), not free chaos — that keeps walkable lanes and the camera working.
import * as THREE from 'three';
import { interiorMaterial } from './interior.js';

/** 4-rotation snap — the only allowed furniture rotations. */
export function snapRotation(deg) {
  return Math.round(deg / 90) * 90;
}

/**
 * Render the anchor pads (subtle floor decals) for a list of anchors.
 * anchors: [{ id, x, z, w, d, type, rot }]
 */
export function createAnchorPads(scene, anchors, accent) {
  const pads = [];
  for (const a of anchors) {
    const pad = new THREE.Mesh(
      new THREE.PlaneGeometry(a.w, a.d),
      interiorMaterial(accent, { transparent: true, opacity: 0.22 })
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(a.x, 0.02, a.z);
    pad.userData.anchor = a;
    scene.add(pad);
    pads.push(pad);
  }
  return pads;
}

/** Nearest anchor of the matching type(s), or null. */
export function nearestAnchor(anchors, x, z, types) {
  let best = null, bestD = Infinity;
  for (const a of anchors) {
    if (types && !types.includes(a.type)) continue;
    const d = (a.x - x) ** 2 + (a.z - z) ** 2;
    if (d < bestD) { bestD = d; best = a; }
  }
  return best;
}

/**
 * Validate dropping an item of footprint [w,d] onto an anchor:
 * fits the slot, and (if colliders given) doesn't overlap another collider
 * (excluding the anchor's own footprint).
 */
export function validatePlacement(anchor, footprint, colliders = [], ignore = null) {
  const [w, d] = footprint || [1, 1];
  if (w > anchor.w || d > anchor.d) return { ok: false, reason: 'too big for this slot' };
  if (colliders.length) {
    const minX = anchor.x - w / 2, maxX = anchor.x + w / 2, minZ = anchor.z - d / 2, maxZ = anchor.z + d / 2;
    for (const c of colliders) {
      if (c === ignore) continue;
      if (minX < c.maxX && maxX > c.minX && minZ < c.maxZ && maxZ > c.minZ) {
        return { ok: false, reason: 'overlaps something' };
      }
    }
  }
  return { ok: true };
}

/**
 * Highlight pads while the child carries an item: the nearest valid anchor
 * pulses green; everything else dims to the accent.
 */
export function updateAnchorHighlights(pads, carrying, nearest, validColor = 0x58f0a5, idleAccent = 0x18a9d6) {
  for (const pad of pads) {
    const isTarget = carrying && nearest === pad.userData.anchor;
    pad.material.opacity = isTarget ? 0.55 : 0.22;
    pad.material.color.setHex(isTarget ? validColor : idleAccent);
  }
}
