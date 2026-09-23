import * as THREE from 'three';
import { makeTorus } from '../scene.js';
import { SkeletonGraph } from '../rig/skeleton-graph.js';
import { primaryColorHex, describeAppearance, materialFromAppearance } from './material-ops.js';

/**
 * One stored copy per (attribute, version). A 50-deep undo history of a 900k-face generated model
 * used to hold fifty separate `Array.from()` copies of the same 8.5M vertices — hundreds of
 * megabytes of boxed doubles for a document nobody edited. Snapshots are read-only once taken, so
 * every snapshot of an UNCHANGED attribute can point at the same typed array.
 *
 * `version` is the invalidation signal: three.js bumps it on `needsUpdate = true`, which every
 * in-place geometry write in this studio performs (the clay brush, the gizmo bakes, the rig) —
 * it has to, or the GPU would not see the edit either. A changed buffer therefore misses the
 * cache and is copied afresh, leaving older snapshots holding the values they were taken with.
 *
 * WeakMap-keyed, so a copy dies with the geometry it came from: the cost is one spare copy per
 * live attribute, bounded by the document rather than by the length of the history.
 */
const storedArrays = new WeakMap();

/**
 * A snapshot-owned copy of a BufferAttribute's data, shared with earlier snapshots when it has
 * not changed. Typed, not boxed: half the bytes of `Array.from`, and IndexedDB clones it natively.
 * @param {THREE.BufferAttribute|undefined} attribute
 * @returns {ArrayBufferView|null}
 */
function snapshotArray(attribute) {
  if (!attribute || !attribute.array) return null;
  const stored = storedArrays.get(attribute);
  if (stored && stored.version === attribute.version) return stored.copy;
  const copy = attribute.array.slice();
  storedArrays.set(attribute, { version: attribute.version, copy });
  return copy;
}

export function takeSnapshot(studio) {
  const objects = [];
  const jointTransforms = new Map();
  for (const shape of studio.shapes) {
    // Wardrobe persistence owns gear geometry and bone-local transforms. Saving
    // it again as a champion shape creates detached duplicates on reload.
    if (shape.userData.isGear) continue;
    // Static imports can have a normalized root and nested transformed groups.
    // Restore flattens these shapes into studio.group, so preserve the entire
    // ancestor transform. Bake its linear part instead of decomposing TRS: a
    // rotated child under nonuniform scale can contain shear.
    let ancestorTransform = null;
    if (shape.userData.imported && shape.parent !== studio.group) {
      let parent = shape.parent;
      while (parent && parent !== studio.group && !parent.isBone) parent = parent.parent;
      if (parent === studio.group) {
        shape.updateWorldMatrix(true, false);
        ancestorTransform = studio.group.matrixWorld.clone().invert().multiply(shape.matrixWorld);
      }
    }
    const obj = {
      id: shape.userData.id,
      name: shape.name,
      kind: shape.userData.kind || 'custom',
      imported: !!shape.userData.imported,
      generated: !!shape.userData.generated,
      color: primaryColorHex(shape.material) ?? 0xffffff,
      transform: {
        p: shape.position.toArray(),
        r: [shape.rotation.x, shape.rotation.y, shape.rotation.z],
        s: shape.scale.toArray(),
      },
      torus: shape.userData.torus ? { ...shape.userData.torus } : undefined,
    };
    if (ancestorTransform) {
      obj.transform = { p: new THREE.Vector3().setFromMatrixPosition(ancestorTransform).toArray(), r: [0, 0, 0], s: [1, 1, 1] };
      ancestorTransform.setPosition(0, 0, 0);
      jointTransforms.set(shape.userData.id, ancestorTransform.clone());
    }
    // Sculpted / imported / otherwise-custom shapes can't be rebuilt from a
    // primitive `kind` — store their actual geometry so undo, redo and reload
    // all preserve the sculpt. Painted shapes carry the baked equirect map too.
    if (shape.userData.sculpted || shape.userData.imported || shape.userData.geoCustom || shape.userData.kind === 'custom') {
      const g = ancestorTransform ? shape.geometry.clone().applyMatrix4(ancestorTransform) : shape.geometry;
      const p = g.attributes.position;
      obj.kind = 'custom';
      obj.geo = {
        positions: snapshotArray(p),
        index: snapshotArray(g.index),
        basePos: snapshotArray(g.attributes.basePos),
        paint: shape.userData.paint || null,
        // A textured model is only as good as the attributes that address its texture. Storing
        // them is what makes undo/redo/reload return the SAME surface rather than flat clay:
        // without uv there is nowhere to sample, and a recompute turns a smooth mesh faceted.
        uv: snapshotArray(g.attributes.uv),
        normals: snapshotArray(g.attributes.normal),
        colors: snapshotArray(g.attributes.color),
      };
      // The look itself — texture bytes, per-region materials, their geometry groups. Null for an
      // ordinary clay shape, which `color` above already describes, so normal documents stay small.
      const appearance = describeAppearance(shape);
      if (appearance) obj.appearance = appearance;
    }
    objects.push(obj);
  }

  // The tapped skeleton (task 014): joints and pose, never weights — they are recomputed on load.
  let rig = null;
  if (studio.rig && studio.rig.graph.size) {
    studio.rig.readPose(); // the bones hold the live pose; the graph is its serialised form
    rig = studio.rig.graph.toJSON();
    // Joint coordinates share their owner's local geometry frame. Flattening an
    // imported parent must transform both, otherwise reloaded sockets drift.
    rig.joints = rig.joints.map(j => {
      const matrix = jointTransforms.get(j.shape);
      if (!matrix) return j;
      const p = new THREE.Vector3(j.x, j.y, j.z).applyMatrix4(matrix);
      return { ...j, x: p.x, y: p.y, z: p.z };
    });
    if (rig.motion) rig.motion = { ...rig.motion, key: SkeletonGraph.fromJSON({ ...rig, motion: undefined }).structureKey() };
  }

  return {
    objects,
    rig,
    // The AI payload (src/ai/prompt.js) names these three keys and its tests assert they exist;
    // the template rig they used to carry is gone (task 014), so they are always null now.
    bones: null,
    template: null,
    axisFamily: null,
    // The whole multi-selection (shape ids), plus the primary (id or joint id).
    selectedIds: [...studio.selection].filter((m) => m.isMesh).map((m) => m.userData.id),
    selectedId: studio.selected && !studio.selected.isBone ? studio.selected.userData.id ?? null : null,
    selectedBone: studio.selected?.isBone ? studio.selected.name : null,
  };
}

export function restoreSnapshot(studio, snap) {
  studio.resetDocument();

  for (const o of snap.objects) {
    if (o.geo && o.geo.positions && o.geo.positions.length >= 3) {
      // Custom (sculpted or imported) geometry: rebuild from the stored arrays,
      // then retransform exactly like a primitive below.
      const geo2 = new THREE.BufferGeometry();
      const posAttr = new THREE.BufferAttribute(new Float32Array(o.geo.positions), 3);
      geo2.setAttribute('position', posAttr);
      if (o.geo.index && o.geo.index.length) geo2.setIndex(new THREE.BufferAttribute(new Uint32Array(o.geo.index), 1));
      if (o.geo.basePos && o.geo.basePos.length) {
        geo2.setAttribute('basePos', new THREE.BufferAttribute(new Float32Array(o.geo.basePos), 3));
      }
      if (o.geo.uv && o.geo.uv.length) geo2.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(o.geo.uv), 2));
      if (o.geo.colors && o.geo.colors.length) geo2.setAttribute('color', new THREE.BufferAttribute(new Float32Array(o.geo.colors), 3));
      if (o.geo.normals && o.geo.normals.length) {
        geo2.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(o.geo.normals), 3));
      } else {
        // An older document (or a shape that never had them) stores positions + index only —
        // recompute so it still shades correctly. The crease-split topology Done hands out keeps
        // hard box edges flat; shared (smooth) regions stay smooth.
        geo2.computeVertexNormals();
      }
      // Rebuild the recorded look — textures, per-region materials — falling back to the flat
      // studio clay colour for every ordinary shape.
      const rebuilt = materialFromAppearance(o.appearance);
      const mat = rebuilt ? rebuilt.material : new THREE.MeshStandardMaterial({
        color: o.color ?? 0xffffff,
        roughness: 0.6,
        metalness: 0.1,
        side: THREE.DoubleSide,
      });
      if (rebuilt && Array.isArray(o.appearance.groups)) {
        for (const grp of o.appearance.groups) geo2.addGroup(grp.start, grp.count, grp.materialIndex || 0);
      }
      const mesh = new THREE.Mesh(geo2, mat);
      mesh.name = o.name;
      mesh.userData.id = o.id;
      mesh.userData.kind = 'custom';
      mesh.userData.sculpted = true;
      mesh.userData.geoCustom = true;
      mesh.userData.imported = o.imported;
      mesh.userData.generated = !!o.generated;
      studio.group.add(mesh);
      mesh.position.fromArray(o.transform.p);
      mesh.rotation.set(o.transform.r[0], o.transform.r[1], o.transform.r[2]);
      mesh.scale.fromArray(o.transform.s);
      if (o.geo.basePos && o.geo.paint && o.geo.paint.dataUrl) {
        mesh.userData.paint = o.geo.paint;
        studio.bakePaint(mesh, o.geo.paint);
      }
      continue;
    }
    if (!o.kind || o.kind === 'custom') {
      // A custom shape only reaches here when its stored geometry didn't restore (the `>= 3` check
      // above failed — e.g. `geo.positions` came back missing or too short). Loud, not silent (fix
      // round 1): the shape is dropped from the document, but the rest of the restore still runs.
      if (o.kind === 'custom') console.warn(`[snapshot] shape "${o.name || o.id}" has no usable stored geometry — dropped from the restored document.`);
      continue;
    }
    const mesh = studio.addPrimitive(o.kind, o.color, { silent: true });
    mesh.name = o.name;
    mesh.userData.id = o.id;
    if (o.kind === 'torus' && o.torus) {
      mesh.userData.torus = { ...o.torus };
      mesh.geometry.dispose();
      mesh.geometry = makeTorus(o.torus);
    }
    mesh.position.fromArray(o.transform.p);
    mesh.rotation.set(o.transform.r[0], o.transform.r[1], o.transform.r[2]);
    mesh.scale.fromArray(o.transform.s);
  }

  // The tapped skeleton: rebuilt from joints and pose; the weights are recomputed by the rig
  // controller, which listens for rig-dirty (spec §5: never stored). This runs on undo/redo and
  // boot, not just a fresh load — a joint naming a shape that didn't come back (a corrupted document,
  // or the drop just above) must not brick the rest of the restore, and must not leave a HALF-BUILT
  // rig behind: restoreGraph throws partway through rebuild(), after bones/balls/lines are cleared
  // but before the graph is validated against what actually exists, so a bare throw here would leave
  // `graph` populated while `bones` stays empty — a standing mismatch that re-throws on the very next
  // rig-touching call (fix round 1). Caught, warned loudly by name (persist.js:92's precedent), then
  // put back to a clean, empty, self-consistent rig — never left half-built. `rig-dirty` does NOT
  // fire on this path: there is nothing to bind, and firing it would claim otherwise. An empty rig is
  // exactly the state a brand-new document already sits in without ever emitting rig-dirty, so this
  // keeps the two cases consistent.
  if (snap.rig && Array.isArray(snap.rig.joints) && snap.rig.joints.length) {
    // The try covers the RESTORE ONLY. It used to wrap `emit('rig-dirty')` too, so a throw from an
    // unrelated rig-dirty listener was reported as a skeleton-restore failure AND threw away a graph
    // that had restored perfectly (task 011 carry-over 2). `restored` is what decides whether the
    // listeners are told, and the emit is outside the catch so its own errors surface as themselves.
    let restored = true;
    try {
      studio.ensureRig().restoreGraph(snap.rig);
    } catch (err) {
      restored = false;
      console.warn('[snapshot] could not restore the skeleton (' + (err && err.message) + ') — the document opens without one.');
      studio.rig.restoreGraph({ joints: [], pose: {}, nextId: 1 });
    }
    if (restored) studio.emit('rig-dirty');
  }

  // Restore the whole (possibly multi-) selection, so Undo/Redo keep the exact
  // selection instead of collapsing it to the primary.
  const meshes = [];
  if (snap.selectedIds && snap.selectedIds.length) {
    for (const id of snap.selectedIds) {
      const m = studio.shapes.find((s) => s.userData.id === id);
      if (m) meshes.push(m);
    }
  }
  let primary = null;
  if (snap.selectedBone && studio.rig) {
    primary = studio.rig.bones.get(snap.selectedBone) || null;
  }
  if (!primary && snap.selectedId != null) {
    primary = studio.shapes.find((m) => m.userData.id === snap.selectedId) || null;
  }
  if (primary && primary.isMesh && !meshes.includes(primary)) meshes.push(primary);
  studio.setSelection(meshes, primary);
}
