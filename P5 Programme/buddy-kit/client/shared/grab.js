// grab.js — grab / carry / move for interior shells (game-feel).
// Explicit flow: tap 👉 Select → tap an object to SELECT it (yellow outline
// box) → press ✋ Pick up to carry it (small at chest, large in front) → tap
// anywhere to PLACE it on that surface. Everything moves with damped-spring
// smoothing; picking up works from any distance (the object flies to you).
import * as THREE from 'three';
import { nearestAnchor, validatePlacement, updateAnchorHighlights, snapRotation } from './anchors.js';

export function createGrabSystem(scene, opts) {
  const interactables = [];
  const meshes = [];           // raycastable leaf meshes → their interactable group
  const surfaces = [];         // placement raycast targets (floor + tabletops)
  const floors = [];           // floor-only targets (for large items)
  let holding = null;
  let mode = 'idle';           // 'idle' | 'carry' | 'move'
  let selected = null;
  const _v = new THREE.Vector3();
  const _fwd = new THREE.Vector3();
  const _b = new THREE.Box3();

  // Selection outline box — a yellow wireframe box around the selected object.
  const selBox = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
    new THREE.LineBasicMaterial({ color: 0xffd23c })
  );
  selBox.visible = false;
  scene.add(selBox);

  function collectMeshes(group, ref) {
    group.traverse((o) => {
      if (o.isMesh && o.geometry) { o.userData._interact = ref; meshes.push(o); }
    });
  }

  /** Register an interactable group. cfg: footprint, types, tabletop, movable. */
  function register(group, cfg = {}) {
    group.userData.interactable = true;
    group.userData.footprint = cfg.footprint || [0.6, 0.6];
    group.userData.types = cfg.types || ['hero', 'counter', 'storage', 'seat', 'nature'];
    group.userData.tabletop = cfg.tabletop !== false;
    group.userData.movable = !!cfg.movable;
    group.userData.baseY = group.position.y;
    group.userData.colliderRef = null;
    group.userData._rotTarget = group.rotation.y;
    collectMeshes(group, group);
    interactables.push(group);
    return group;
  }

  /** Add meshes (or a group) to the placement-raycast lists. cfg.floor → also floor-only. */
  function addSurfaces(list, cfg = {}) {
    const items = Array.isArray(list) ? list : [list];
    for (const item of items) {
      if (!item) continue;
      if (item.isMesh) {
        surfaces.push(item);
        if (cfg.floor) floors.push(item);
      } else if (item.traverse) {
        item.traverse((o) => { if (o.isMesh) { surfaces.push(o); if (cfg.floor) floors.push(o); } });
      }
    }
  }

  function isPartOf(mesh, group) {
    let o = mesh;
    while (o) { if (o === group) return true; o = o.parent; }
    return false;
  }

  // ---- selection (explicit: 👉 Select mode → tap an object) ----
  function select(obj) {
    selected = (obj && obj.userData && obj.userData.interactable) ? obj : null;
    selBox.visible = !!selected;
    if (selected) selected.userData._baseScale = selected.scale.x ?? 1;
    if (opts.onSelection) opts.onSelection(selected);
  }
  function clearSelection() { selected = null; selBox.visible = false; if (opts.onSelection) opts.onSelection(null); }
  function getSelected() { return selected; }

  /** Uniformly resize the selected (or held) object by `multiplier` relative to
   *  the size it had when it was selected. Library models can ship at the wrong
   *  size, so the student calibrates with a slider (0.2×–5×, clamped 0.05–20). */
  function setSelectedScale(multiplier) {
    const g = selected || holding;
    if (!g) return;
    if (!isFinite(multiplier)) return;
    const base = g.userData._baseScale ?? g.scale.x ?? 1;
    g.scale.setScalar(Math.max(0.05, Math.min(20, base * multiplier)));
  }

  /**
   * ✋ Pick up — carries the SELECTED object (small at chest, large in front),
   * from any distance (the spring pulls it to the champion). If nothing is
   * selected, grabs the nearest interactable in reach. While holding, it drops.
   */
  function pickUp() {
    const champion = opts.getChampion();
    if (!champion) return;
    if (mode !== 'idle') { drop(); return; }
    let g = selected;
    if (!g) {
      let best = null, bestD = 3;
      for (const x of interactables) {
        const d = x.position.distanceTo(champion.state.pos);
        if (d < bestD) { bestD = d; best = x; }
      }
      g = best;
    }
    if (!g) { opts.onToast && opts.onToast('👀 Tap 👉 Select, then tap an object to pick up.'); return; }
    clearSelection();
    if (g.userData.movable) startMove(g); else startCarry(g);
  }

  function startCarry(g) {
    const champion = opts.getChampion();
    scene.remove(g);
    champion.group.add(g);
    g.rotation.set(0, 0, 0);
    g.userData._rotTarget = 0;
    detachCollider(g);
    holding = g;
    mode = 'carry';
    opts.onToast && opts.onToast('✋ Picked it up!');
  }

  function startMove(g) {
    const champion = opts.getChampion();
    g.userData._rotTarget = g.rotation.y;
    detachCollider(g);
    holding = g;
    mode = 'move';
    opts.onToast && opts.onToast('🚚 Carrying it — tap to put it down!');
  }

  function drop() {
    if (mode === 'carry') placeSmall();
    else if (mode === 'move') placeLarge();
  }

  function placeSmall() {
    const champion = opts.getChampion();
    const item = holding;
    const p = champion.state.pos;
    const anchor = nearestAnchor(opts.anchors, p.x, p.z, item.userData.types);
    const collidersToCheck = item.userData.tabletop ? [] : (opts.colliders || []);
    const valid = anchor && validatePlacement(anchor, item.userData.footprint, collidersToCheck).ok;
    let x, y, z, ry;
    if (anchor && valid) {
      x = anchor.x; y = (anchor.y || 0) + 0.02; z = anchor.z;
      ry = THREE.MathUtils.degToRad(snapRotation(0));
    } else {
      _fwd.set(Math.sin(champion.state.facing), 0, Math.cos(champion.state.facing));
      x = p.x + _fwd.x * 1.5; y = 0.2; z = p.z + _fwd.z * 1.5; ry = champion.state.facing;
    }
    champion.group.remove(item);
    scene.add(item);
    item.position.set(x, y, z);
    item.rotation.y = ry;
    item.userData.baseY = y;
    holding = null;
    mode = 'idle';
    opts.onToast && opts.onToast(valid ? '✅ Slotted it!' : '✅ Placed.');
  }

  function placeLarge() {
    const item = holding;
    const fp = item.userData.footprint;
    const blocked = overlapsCollider(item.position.x, item.position.z, fp);
    if (blocked) {
      opts.onToast && opts.onToast('❌ Too close to something — tap somewhere clear.');
      return;   // keep carrying so the child repositions
    }
    attachCollider(item);
    item.userData.baseY = item.position.y;
    holding = null;
    mode = 'idle';
    opts.onToast && opts.onToast('✅ Put it down!');
    opts.onDrop && opts.onDrop(item);
  }

  /** Settle the held item at an exact world point (remove from champion, add to scene). */
  function placeHeldAt(x, y, z) {
    const item = holding;
    const champion = opts.getChampion();
    if (!champion) return;
    // Reject blocked spots BEFORE committing the item to the scene, so a
    // blocked tap keeps the item carried (consistent with placeLarge).
    if (item.userData.movable && overlapsCollider(x, z, item.userData.footprint)) {
      opts.onToast && opts.onToast('❌ Too close to something — tap somewhere clear.');
      return;   // keep carrying
    }
    if (item.parent === champion.group) champion.group.remove(item);
    scene.add(item);
    item.position.set(x, y, z);
    item.userData.baseY = y;
    if (item.userData.movable) {
      attachCollider(item);
    }
    holding = null;
    mode = 'idle';
    opts.onToast && opts.onToast('✅ Placed!');
    opts.onDrop && opts.onDrop(item);
  }

  /**
   * Tap-to-place: while carrying, raycast the tapped screen point and settle the
   * held item onto whatever surface is under the finger (tabletop or floor).
   * Small items land on any surface + magnet-snap to a nearby anchor; large items
   * land on the floor only. Walls/ceilings are rejected (fall back to drop).
   */
  function placeAt(ndcX, ndcY) {
    if (mode === 'idle' || !holding) return;
    const camera = opts.getCamera && opts.getCamera();
    if (!camera) { drop(); return; }
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    const held = holding;
    const upCheck = (h) => !h.face || h.face.normal.y >= 0.4;

    if (held.userData.movable) {
      const targets = floors.filter((m) => !isPartOf(m, held));
      const hits = ray.intersectObjects(targets, true);
      if (!hits.length || !upCheck(hits[0])) { drop(); return; }
      placeHeldAt(hits[0].point.x, held.userData.baseY, hits[0].point.z);
      return;
    }

    const targets = surfaces.filter((m) => !isPartOf(m, held));
    const hits = ray.intersectObjects(targets, true);
    if (!hits.length || !upCheck(hits[0])) { drop(); return; }
    const h = hits[0];
    // Anchor magnet: snap small items to a valid anchor within 0.4 m.
    const anchor = nearestAnchor(opts.anchors, h.point.x, h.point.z, held.userData.types);
    if (anchor && Math.hypot(anchor.x - h.point.x, anchor.z - h.point.z) < 0.4) {
      placeHeldAt(anchor.x, (anchor.y || 0) + 0.02, anchor.z);
    } else {
      placeHeldAt(h.point.x, h.point.y + 0.02, h.point.z);
    }
  }

  // ---- collider management for movable items ----
  function attachCollider(g) {
    if (g.userData.colliderRef || !opts.colliders) return;
    const fp = g.userData.footprint;
    const c = { minX: g.position.x - fp[0] / 2, maxX: g.position.x + fp[0] / 2, minZ: g.position.z - fp[1] / 2, maxZ: g.position.z + fp[1] / 2 };
    g.userData.colliderRef = c;
    opts.colliders.push(c);
  }
  function detachCollider(g) {
    if (g.userData.colliderRef && opts.colliders) {
      const i = opts.colliders.indexOf(g.userData.colliderRef);
      if (i >= 0) opts.colliders.splice(i, 1);
      g.userData.colliderRef = null;
    }
  }
  function overlapsCollider(x, z, fp) {
    for (const c of (opts.colliders || [])) {
      if (x > c.minX - fp[0] / 2 && x < c.maxX + fp[0] / 2 && z > c.minZ - fp[1] / 2 && z < c.maxZ + fp[1] / 2) return true;
    }
    return false;
  }

  /** Rotate the held/moving object 90° (smooth tween toward the target). */
  function rotateHeld() {
    if (!holding) return;
    const cur = holding.userData._rotTarget ?? holding.rotation.y;
    holding.userData._rotTarget = cur + Math.PI / 2;
  }

  /** Pick the interactable under a pointer (NDC −1..1). Walls occlude; furniture doesn't. */
  function pick(ndcX, ndcY) {
    const camera = opts.getCamera && opts.getCamera();
    const sceneRef = opts.getScene && opts.getScene();
    if (!camera || !sceneRef) return null;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    const hits = ray.intersectObjects(meshes, false);
    if (!hits.length) return null;
    const g = hits[0].object.userData._interact;
    if (!g) return null;
    // Occlusion: a wall closer than the object blocks selection.
    const all = ray.intersectObjects(sceneRef.children, true);
    if (all.length) {
      const first = all[0];
      if (first.object.userData.wall && first.distance < hits[0].distance - 0.05) return null;
    }
    return g;
  }

  function update(dt, now) {
    const champion = opts.getChampion();
    const k = 1 - Math.exp(-10 * dt);   // spring damping (smooth follow)

    if (holding && champion) {
      if (mode === 'carry') {
        // Smooth carry at chest height in front of the champion.
        const s = champion.group.scale.x || 1;
        _v.set(0, (1.05 - champion.group.position.y) / s, 0.9);
        holding.position.lerp(_v, k);
        const rt = holding.userData._rotTarget ?? 0;
        holding.rotation.y += (rt - holding.rotation.y) * Math.min(1, dt * 8);
      } else if (mode === 'move') {
        // Carry in front, grounded, following the champion's facing.
        _fwd.set(Math.sin(champion.state.facing), 0, Math.cos(champion.state.facing));
        _v.set(champion.state.pos.x + _fwd.x * 1.4, holding.userData.baseY, champion.state.pos.z + _fwd.z * 1.4);
        holding.position.lerp(_v, k);
        const rt = holding.userData._rotTarget ?? holding.rotation.y;
        holding.rotation.y += (rt - holding.rotation.y) * Math.min(1, dt * 8);
      }
      selBox.visible = false;
    }

    // Selection outline box follows the selected object.
    if (selected) {
      _b.setFromObject(selected);
      const sz = _b.getSize(_v);
      const c = _b.getCenter(_fwd);
      selBox.position.copy(c);
      selBox.scale.set(sz.x + 0.14, sz.y + 0.14, sz.z + 0.14);
      selBox.visible = true;
    } else {
      selBox.visible = false;
    }

    // Anchor highlights while carrying a small item.
    const nearest = (champion && holding && mode === 'carry')
      ? nearestAnchor(opts.anchors, champion.state.pos.x, champion.state.pos.z, holding.userData.types)
      : null;
    if (opts.onHighlight) opts.onHighlight(nearest, mode === 'carry');
    else if (opts.pads) updateAnchorHighlights(opts.pads, !!nearest, nearest);
  }

  return {
    register,
    pickUp,
    grabOrPlace: pickUp,       // backward-compat alias for spaceship/station ✋
    pick,
    select,
    clearSelection,
    getSelected,
    setSelectedScale,
    placeAt,
    rotateHeld,
    addSurfaces,
    attach: attachCollider,
    detach: detachCollider,
    update,
    get holding() { return holding; },
    get mode() { return mode; },
    get interactables() { return interactables; },
    get grabbables() { return interactables; },   // backward-compat alias
  };
}
