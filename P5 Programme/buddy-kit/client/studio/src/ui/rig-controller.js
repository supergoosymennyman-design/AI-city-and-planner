// src/ui/rig-controller.js
// Rig mode's brain (task 014, spec §1–§3): taps, drags, selection, undo units, the outside
// warning, and scheduling the rebind that runs itself. No DOM here — the toolbar renders `status`,
// main.js feeds it rays — so the Node suite drives every rule.
import * as THREE from 'three';
import { buildSurface, tapPoint, isInside } from '../rig/tap-depth.js';
import { mergeParts } from '../rig/bind.js';
import { COARSE_TARGET } from '../rig/coarse.js';
import { riggableMeshes, partFromMesh } from '../rig/bones.js';

const STAGE_WORDS = {
  reduce: 'making a light copy',
  surface: 'reading the surface',
  visibility: 'finding the bones',
  factor: 'preparing the solve',
  solve: 'solving',
  transfer: 'carrying the answer back',
  done: 'done',
};
const STATUS_FIRST = 'Tap the model to place the first joint.';
const STATUS_ONE = 'Tap the model again to add a second joint — one joint cannot bend.';

function summary(stats, carried) {
  const secs = (stats.totalMs / 1000).toFixed(1);
  let text = `Bending ready: ${stats.finePoints.toLocaleString()} points, ${stats.bones} bone${stats.bones === 1 ? '' : 's'}, ${secs} s`;
  if (stats.reduced) text += ` (solved on ${stats.coarsePoints.toLocaleString()})`;
  if (carried) text += ` · ${carried} shape${carried === 1 ? '' : 's'} with no joint inside ride${carried === 1 ? 's' : ''} the nearest bone`;
  return text;
}

/** The numbers that caught every problem during the trials (spec §3 "what it reports"). */
function details(stats, carried = []) {
  const lines = [
    `${stats.finePoints} points · ${stats.triangles} triangles on the copy (${stats.droppedTriangles} padding dropped) · ${stats.bones} bones`,
    `solver ${stats.solver}${stats.directError ? ` (direct failed: ${stats.directError})` : ''} · factor ${stats.factorMs} ms · surface ${stats.surfaceMs} ms · visibility ${stats.visibilityMs} ms · solve ${stats.solveMs} ms`,
    `${stats.noSourceVertices} points saw no bone · ${stats.fallbackVertices} fell back to the nearest bone · ${stats.verticesOverMax} had more than 4 bones · ${stats.unconvergedBones} bones unconverged`,
    stats.transfer ? `carried back to ${stats.transfer.gearPoints} points in ${stats.transferMs} ms · worst gap ${stats.transfer.worstDistance}` : 'solved on the full mesh',
  ];
  for (const ride of carried) {
    lines.push(`a shape with no joint inside rides bone ${ride.stats.socket ? ride.stats.socket.bone : '?'} (${ride.stats.gearPoints} points, gap ${ride.stats.meanDistance} mean / ${ride.stats.worstDistance} worst)`);
  }
  return lines.join('\n');
}

export class RigController {
  /**
   * @param {import('../scene.js').StudioScene} studio
   * @param {{scheduler: {schedule:Function, cancel:Function}, toast?: {show:Function, error:Function}, camera: THREE.Camera}} deps
   */
  constructor(studio, { scheduler, toast, camera }) {
    if (!scheduler) throw new Error('RigController needs a scheduler');
    this.studio = studio;
    this.scheduler = scheduler;
    this.toast = toast || { show() {}, error() {} };
    this.camera = camera;
    this.status = { state: 'idle', text: STATUS_FIRST, details: '', stats: null, warnings: [], carried: 0 };
    this.statusListeners = [];
    this.cache = { key: null, surface: null, parts: [], perMesh: [], ranges: [], partAt: () => { throw new Error('no tap surface yet'); } };
    this.warnedUnriggable = new Set(); // shape ids already told about (once) in surface() — fix round F7
    this.drag = null;
    this.job = null; // the parts, ranges and carried parts of the run scheduled or in flight
    this.wantedKey = null; // the skeleton+surfaces key the last schedule was for
    studio.on('rig-dirty', () => this.onDirty());
    studio.on('rig-kept', () => this.onKept());
    studio.on('changed', () => this.onChanged());
  }

  onStatus(fn) {
    this.statusListeners.push(fn);
    return () => { this.statusListeners = this.statusListeners.filter((f) => f !== fn); };
  }

  setStatus(patch) {
    this.status = { ...this.status, ...patch };
    for (const fn of this.statusListeners) fn(this.status);
  }

  say(text) { this.toast.show(text); }

  get rig() {
    return this.studio.rig || null;
  }

  /** The selected joint's id, or null when the selection is not one of this rig's bones. */
  get selectedId() {
    const s = this.studio.selected;
    const rig = this.rig;
    return s && s.isBone && rig && rig.bones.get(s.name) === s ? s.name : null;
  }

  // ---------------------------------------------------------------- the surface, and two keys
  /** Changes when a riggable shape is added, removed, MOVED, re-sculpted or swapped for another
   * geometry: the key of the tap-surface cache, whose baked world positions go stale on a move. */
  placementKey() {
    return riggableMeshes(this.studio)
      .map((m) => `${m.userData.id}:${m.geometry.uuid}:${m.geometry.attributes.position.version}:${m.matrixWorld.elements.map((e) => e.toFixed(5)).join(',')}`)
      .join('|');
  }

  /** Changes when the skeleton or a SURFACE changes — never when a shape moves, turns or scales.
   * The joints are local to their shapes and a detached bind follows the shape, so a moved model's
   * weights are the same weights (owner ruling 2): no matrices in here, on purpose. A carried part
   * changes this key through its geometry, not its placement — a carried part that moves keeps its
   * transferred weights. */
  jobKey() {
    const rig = this.rig;
    const surfaces = riggableMeshes(this.studio)
      .map((m) => `${m.userData.id}:${m.geometry.uuid}:${m.geometry.attributes.position.version}`)
      .join('|');
    return `${rig ? rig.graph.structureKey() : ''}#${surfaces}`;
  }

  /** The tap surface (all riggable shapes merged), one surface per shape, the parts, the merge's
   * vertex ranges, and `partAt(faceIndex)` — which part a face of the merged surface belongs to.
   * Cached by placementKey. */
  surface() {
    const key = this.placementKey();
    if (this.cache.key === key) return this.cache;
    const parts = [];
    const perMesh = [];
    for (const mesh of riggableMeshes(this.studio)) {
      const part = partFromMesh(mesh);
      let one = null;
      try {
        one = buildSurface({ position: part.position, index: part.index });
      } catch (err) {
        console.warn(`[rig] ${mesh.name} cannot be rigged: ${err.message}`);
        // Dropped from both the tap surface and the bind below (F7 in the final review): the
        // shape just sits there and never bends, with nothing on screen saying why. Say it once
        // per shape — this recomputes on every placement change, including every frame of an
        // unrelated shape's drag, and the failure is a property of the geometry, not the moment.
        if (!this.warnedUnriggable.has(mesh.userData.id)) {
          this.warnedUnriggable.add(mesh.userData.id);
          this.toast.error(`"${mesh.name || 'A shape'}" is too thin or broken to bend, so it will stay stiff when you pose the model.`);
        }
      }
      if (!one) continue;
      parts.push(part);
      perMesh.push(one);
    }
    let surface = null;
    let ranges = [];
    if (parts.length === 1) {
      surface = perMesh[0];
      ranges = [{ start: 0, count: parts[0].position.length / 3 }];
    } else if (parts.length > 1) {
      const merged = mergeParts(parts);
      surface = buildSurface({ position: merged.position, index: merged.index });
      ranges = merged.ranges;
    }
    // The BVH reorders the merged INDEX in place, but vertex indices are untouched: a face's first
    // corner says which part's range it falls in.
    const partAt = (faceIndex) => {
      const v = surface.index[faceIndex * 3];
      const k = ranges.findIndex((r) => v >= r.start && v < r.start + r.count);
      if (k < 0) throw new Error(`face ${faceIndex} of the tap surface is in no part`);
      return parts[k];
    };
    this.cache = { key, surface, parts, perMesh, ranges, partAt };
    return this.cache;
  }

  /** Split the parts: those with a joint inside are solved as one body; the rest are CARRIED —
   * bound by weight transfer from the body and collapsed onto one bone (owner ruling 3). A part
   * with no joint has no heat source and would leave the solver a singular block (the no-joints
   * failure of 2026-09-20); riding the nearest bone is what the cone and the helmet proved. */
  partsWithJoints() {
    const rig = this.rig;
    const { parts, perMesh } = this.surface();
    const joints = rig ? rig.graph.joints.map((j) => rig.worldOf(j.id)) : [];
    const inside = [];
    const carried = [];
    for (let i = 0; i < parts.length; i++) {
      const has = joints.some((p) => isInside(perMesh[i], p));
      (has ? inside : carried).push(parts[i]);
    }
    return { parts: inside, carried };
  }

  snapshotGraph() {
    const rig = this.rig;
    rig.readPose();
    return rig.graph.toJSON();
  }

  // ---------------------------------------------------------------- taps and selection
  /**
   * A tap in Rig mode. `ray` is a THREE.Ray in world space; `ball` the joint ball under the
   * pointer, or null. Spec §1: ball → select; model → a joint at the first solid span's centre,
   * linked to the selected joint; a miss → nothing, said aloud.
   */
  tap(ray, ball) {
    const rig = this.studio.ensureRig();
    if (ball) {
      this.selectJoint(ball.userData.jointId);
      return { kind: 'select', id: ball.userData.jointId };
    }
    const cache = this.surface();
    const { surface } = cache;
    if (!surface) {
      this.say('There is no model to rig yet. Generate or import one, then tap it.');
      return { kind: 'none' };
    }
    const landing = tapPoint(surface, ray.origin.toArray(), ray.direction.toArray());
    if (!landing) {
      this.say('That tap missed the model. Tap the model to place a joint.');
      return { kind: 'miss' };
    }
    // The shape the tap went INTO is the part owning the first face the ray meets — the entry of
    // the span the joint sits in. The joint is stored in that shape's frame (owner ruling 2); the
    // surface is in document space, so the ray needs no conversion.
    const hit = surface.bvh.raycastFirst(ray, THREE.DoubleSide);
    if (!hit) throw new Error('tapPoint found a span but the tap surface reports no face');
    const shape = cache.partAt(hit.faceIndex).mesh;
    const parent = this.selectedId;
    const before = this.snapshotGraph();
    const id = rig.graph.add(rig.localOf(shape, landing.point), parent, shape.userData.id);
    rig.rebuild();
    this.studio.pushRig(before, this.snapshotGraph());
    this.selectJoint(id);
    this.afterEdit();
    if (!landing.inside) this.say('That joint sits on the skin, not inside the model — drag it in.');
    return { kind: 'add', id, inside: landing.inside };
  }

  /** The same tap from plain arrays (the headed check's seam). */
  tapRay(origin, direction) {
    return this.tap(new THREE.Ray(new THREE.Vector3().fromArray(origin), new THREE.Vector3().fromArray(direction).normalize()), null);
  }

  selectJoint(id) {
    const rig = this.rig;
    const bone = id && rig ? rig.bones.get(id) || null : null;
    this.studio.select(bone);
    if (rig) rig.setSelected(bone ? id : null);
  }

  /** Deselect, so the next tap starts a new chain. */
  newChain() {
    this.selectJoint(null);
    this.say('Tap the model to start a new chain.');
  }

  /** Remove the selected joint and its subtree (spec §1). */
  removeSelected() {
    const rig = this.rig;
    const id = this.selectedId;
    if (!rig || !id) {
      this.say('Tap a joint ball first, then Remove joint.');
      return false;
    }
    const before = this.snapshotGraph();
    const gone = rig.graph.remove(id);
    rig.rebuild();
    this.studio.pushRig(before, this.snapshotGraph());
    this.selectJoint(null);
    this.afterEdit();
    this.say(gone.length === 1 ? 'Removed the joint.' : `Removed ${gone.length} joints.`);
    return true;
  }

  clearSkeleton() {
    const rig = this.rig;
    if (!rig || !rig.graph.size) return false;
    const before = this.snapshotGraph();
    for (const root of rig.graph.roots()) rig.graph.remove(root);
    rig.rebuild();
    this.studio.pushRig(before, this.snapshotGraph());
    this.selectJoint(null);
    this.afterEdit();
    return true;
  }

  // ---------------------------------------------------------------- drags
  /** Pointerdown on a ball. Spec §2: the joint moves in the plane facing the camera. */
  beginDrag(ball, ray) {
    const rig = this.rig;
    if (!rig || !ball || !rig.balls.has(ball.userData.jointId)) return false;
    const id = ball.userData.jointId;
    this.selectJoint(id);
    const start = ball.getWorldPosition(new THREE.Vector3());
    const normal = this.camera.getWorldDirection(new THREE.Vector3());
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, start);
    const hit = ray.intersectPlane(plane, new THREE.Vector3());
    this.drag = { id, plane, offset: hit ? start.clone().sub(hit) : new THREE.Vector3(), before: this.snapshotGraph(), moved: false };
    return true;
  }

  moveDrag(ray) {
    const d = this.drag;
    const rig = this.rig;
    if (!d || !rig) return false;
    const hit = ray.intersectPlane(d.plane, new THREE.Vector3());
    if (!hit) return true;
    hit.add(d.offset);
    // Written back in the joint's own shape's frame; the bones, balls and lines keep their identity
    // across the drag (placeBones re-places them — a joint move changes no bone list).
    rig.graph.move(d.id, rig.localOf(rig.shapeOf(rig.graph.get(d.id)), hit.toArray()));
    rig.placeBones();
    d.moved = true;
    return true;
  }

  endDrag() {
    const d = this.drag;
    if (!d) return false;
    this.drag = null;
    if (d.moved && this.rig) {
      this.studio.pushRig(d.before, this.snapshotGraph());
      this.afterEdit();
    }
    return true;
  }

  // ---------------------------------------------------------------- the rebind that runs itself
  /** After any skeleton edit: warn about joints outside, and let `changed` schedule the rebind. */
  afterEdit() {
    this.checkOutside();
    this.studio.emit('changed');
  }

  onDirty() {
    this.checkOutside();
    this.scheduleRebind();
  }

  /** An imported studio file brought its skeleton AND its weights (owner ruling 4): nothing to
   * solve. The current key is what the document now wants, so `changed` schedules nothing. Any
   * wait already pending is dropped with it — the next edit to the skeleton schedules afresh. */
  onKept() {
    const rig = this.rig;
    if (!rig) return;
    this.scheduler.cancel();
    this.job = null;
    this.wantedKey = this.jobKey();
    this.checkOutside();
    this.setStatus({ state: 'ready', text: 'Skeleton and bending loaded from the file.', details: '', stats: null, carried: 0 });
  }

  /** Anything that changed the skeleton or the model surface since the last schedule is a rebind. */
  onChanged() {
    const rig = this.rig;
    if (!rig) {
      // No rig at all — Clear skeleton, New scene, or an undo/restore to a skeleton-less document.
      // A standing warning would describe a skeleton that is gone, and a standing "Working out the
      // bending…" would describe a solve with nothing left to run against — and nothing else ever
      // cancels the scheduler's wait once the rig itself is destroyed out from under it (final
      // review fix round, F3: reachable via New scene, or an undo to a skeleton-less document).
      this.scheduler.cancel();
      this.job = null;
      const idle = this.status.state === 'idle' && this.status.text === STATUS_FIRST && !this.status.warnings.length;
      if (!idle) this.setStatus({ state: 'idle', text: STATUS_FIRST, details: '', stats: null, warnings: [], carried: 0 });
      return;
    }
    // `status.warnings` is what RigToolbar renders, and checkOutside is its only writer — which runs
    // off skeleton EDITS. A restore that replaces the graph wholesale leaves them untouched, and the
    // RECOVERED restore in snapshot.js deliberately fires no rig-dirty at all, so the toolbar used to
    // go on warning about joints that no longer exist (task 011 carry-over 1). Dropping the names the
    // graph no longer has is one lookup each and needs no tap surface — so this stays cheap enough to
    // sit on 'changed', which every restore path does reach.
    if (this.status.warnings.length) {
      const live = this.status.warnings.filter((id) => rig.graph.get(id));
      if (live.length !== this.status.warnings.length) this.setStatus({ warnings: live });
    }
    if (this.jobKey() !== this.wantedKey) this.scheduleRebind();
  }

  checkOutside() {
    const rig = this.rig;
    if (!rig) {
      if (this.status.warnings.length) this.setStatus({ warnings: [] });
      return;
    }
    const { surface } = this.surface();
    const outside = [];
    if (surface) for (const j of rig.graph.joints) if (!isInside(surface, rig.worldOf(j.id))) outside.push(j.id);
    rig.markOutside(outside);
    this.setStatus({ warnings: outside });
  }

  scheduleRebind() {
    const rig = this.rig;
    if (!rig) return;
    this.wantedKey = this.jobKey();
    if (!rig.linkBones.length) {
      this.scheduler.cancel();
      this.job = null;
      rig.unskinAll();
      this.setStatus({ state: 'idle', text: rig.graph.size === 1 ? STATUS_ONE : STATUS_FIRST, details: '', stats: null });
      return;
    }
    this.setStatus({ state: 'waiting', text: 'Working out the bending…' });
    this.scheduler.schedule(() => this.makeJob());
  }

  /** The job for the scheduler, or null when there is nothing to solve. */
  makeJob() {
    const rig = this.rig;
    if (!rig || !rig.linkBones.length) return null;
    const { parts, carried } = this.partsWithJoints();
    if (!parts.length) {
      // Nothing to transfer FROM either: a carried shape rides the joint-bearing ones.
      this.setStatus({ state: 'idle', text: 'No joint is inside a shape yet — drag the joints into the model.', carried: 0 });
      return null;
    }
    const merged = mergeParts(parts);
    const key = this.jobKey();
    this.job = { parts, ranges: merged.ranges, carried, key };
    return {
      position: merged.position,
      index: merged.index,
      bones: rig.bonesForHeat(),
      target: COARSE_TARGET,
      carried: carried.map((p) => ({ position: p.position, index: p.index })), // the index lets the worker report the piece's size
      key,
    };
  }

  onProgress(fraction, stage) {
    this.setStatus({ state: 'running', text: `Working out the bending… ${STAGE_WORDS[stage] || stage} ${Math.round(fraction * 100)}%` });
  }

  onDone(result) {
    const rig = this.rig;
    const job = this.job;
    if (!rig || !job || result.key !== job.key || job.key !== this.jobKey()) {
      // The skeleton or the model moved on while this answer was computed; a new run is scheduled.
      return;
    }
    // applySkins binds with the CURRENT matrices, so an answer computed before a move is right after it.
    const meshes = rig.applySkins(result, job.parts, job.ranges, job.carried);
    // The skinned meshes replaced the plain ones; keep the cached parts pointing at the live objects.
    for (const p of this.cache.parts) {
      const fresh = meshes.find((m) => m.userData.id === p.mesh.userData.id);
      if (fresh) p.mesh = fresh;
    }
    this.job = null;
    const carried = job.carried.length;
    this.setStatus({ state: 'ready', stats: result.stats, text: summary(result.stats, carried), details: details(result.stats, result.carried || []), carried });
    this.studio.emit('changed');
  }

  onError(message) {
    this.job = null;
    console.error('[rig] the bending could not be worked out:', message);
    this.setStatus({ state: 'error', text: 'The bending could not be worked out. Try moving the joints inside the model, or Undo the last change.', details: String(message) });
  }

  // ---------------------------------------------------------------- seams for the headed check
  /** World bounds of the riggable model, as plain arrays. */
  modelBox() {
    const box = new THREE.Box3();
    for (const m of riggableMeshes(this.studio)) box.expandByObject(m);
    return box.isEmpty() ? null : { min: box.min.toArray(), max: box.max.toArray() };
  }

  /** How far the skin has moved from rest, sampled over the skinned meshes (0 at rest). */
  probeDisplacement(sample = 400) {
    const rig = this.rig;
    if (!rig) return 0;
    rig.root.updateMatrixWorld(true);
    let worst = 0;
    const rest = new THREE.Vector3();
    const posed = new THREE.Vector3();
    for (const mesh of rig.skinnedMeshes()) {
      mesh.updateMatrixWorld(true);
      const count = mesh.geometry.attributes.position.count;
      const step = Math.max(1, Math.floor(count / sample));
      for (let i = 0; i < count; i += step) {
        rest.fromBufferAttribute(mesh.geometry.attributes.position, i);
        posed.copy(rest);
        mesh.applyBoneTransform(i, posed);
        worst = Math.max(worst, posed.distanceTo(rest));
      }
    }
    return worst;
  }
}
