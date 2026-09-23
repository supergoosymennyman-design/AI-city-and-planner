// src/rig/tests/rig-controller.spec.js
// Rig mode's brain (task 014, spec §1–§3), driven without a DOM: taps grow a chain, balls select,
// drags move in the camera plane, edits are undo units, the rebind is scheduled, stale answers are
// dropped, joints outside the model are flagged, a joint belongs to the shape it was tapped inside
// (owner ruling 2), and a shape with no joint inside rides the nearest bone (ruling 3).
import * as THREE from 'three';
import { StudioScene } from '../../scene.js';
import { RigController } from '../../ui/rig-controller.js';
import { bindMesh } from '../bind.js';
import { handleBindMessage } from '../bind-worker.js';
import { buildSurface } from '../tap-depth.js';
import { BALL_OUTSIDE } from '../bones.js';
import { addTubeShape, addBoxShape, addOpenBoxShape } from './fixtures.js';

const near = (a, b, tol = 1e-5) => Math.abs(a - b) < tol;
const rayAt = (y, z = 0) => new THREE.Ray(new THREE.Vector3(5, y, z), new THREE.Vector3(-1, 0, 0));

/** Where vertex `i` of a skinned mesh lands in world space under the current pose. */
function posedVertex(rig, mesh, i) {
  rig.root.updateMatrixWorld(true);
  mesh.updateMatrixWorld(true);
  const v = new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, i);
  mesh.applyBoneTransform(i, v);
  return v.applyMatrix4(mesh.matrixWorld).toArray();
}

function setup({ box = false } = {}) {
  const s = new StudioScene();
  const tube = addTubeShape(s);
  let second = null;
  if (box) {
    // a small box beside the tube on the far side from the taps (the taps come from +x), 0.2 clear of it
    second = addBoxShape(s);
    second.position.set(-0.75, 1, 0);
    s.group.updateMatrixWorld(true);
  }
  const scheduler = { scheduled: [], cancelled: 0, schedule(f) { this.scheduled.push(f); }, cancel() { this.cancelled++; } };
  const toasts = [];
  const toast = { show: (t) => toasts.push(t), error: (t) => toasts.push(t) };
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(5, 1, 0);
  camera.lookAt(0, 1, 0);
  camera.updateMatrixWorld(true);
  const c = new RigController(s, { scheduler, toast, camera });
  return { s, tube, box: second, scheduler, toasts, camera, c };
}

export default function (check) {
  // --- tap to grow a chain ---
  {
    const { s, scheduler, toasts, c } = setup();
    const first = c.tap(rayAt(0.3), null);
    const rig = s.rig;
    check('controller: the first tap starts a chain at the centre of the model', first.kind === 'add' && first.inside === true && rig.graph.size === 1 && near(rig.graph.get(first.id).x, 0, 1e-3) && near(rig.graph.get(first.id).y, 0.3, 1e-3) && rig.graph.get(first.id).parent === null);
    check('controller: the new joint is selected', c.selectedId === first.id && s.selected === rig.bones.get(first.id));
    check('controller: one joint cannot bend, so nothing is scheduled and the status says so', scheduler.scheduled.length === 0 && c.status.state === 'idle' && /second joint/.test(c.status.text));
    const second = c.tap(rayAt(1.0), null);
    check('controller: the next tap links to the selected joint', second.kind === 'add' && rig.graph.get(second.id).parent === first.id && rig.linkBones.length === 1);
    check('controller: the rebind is scheduled once two joints exist', scheduler.scheduled.length === 1 && c.status.state === 'waiting');
    const job = scheduler.scheduled[0]();
    check('controller: the job carries the merged model, the bones and a key', !!job && job.position.length === 986 * 3 && job.bones.length === 1 && near(job.bones[0].head[1], 0.3, 1e-3) && job.target === 20000 && typeof job.key === 'string');
    check('controller: every tap is one undo unit', s.undoStack.length === 2 && s.undoStack.every((u) => u.kind === 'rig'));
    c.tap(rayAt(1.7), null);
    c.tap(rayAt(1.7), rig.balls.get(first.id));
    check('controller: tapping a ball selects that joint', c.selectedId === first.id && rig.graph.size === 3);
    const branch = c.tap(rayAt(0.6), null);
    check('controller: the next tap branches from the selected joint', rig.graph.get(branch.id).parent === first.id && rig.graph.children(first.id).length === 2);
    check('controller: a miss places nothing and says so', c.tap(rayAt(5), null).kind === 'miss' && rig.graph.size === 4 && toasts.some((t) => /missed/.test(t)));
  }

  // --- remove, clear, new chain ---
  {
    const { s, scheduler, c } = setup();
    const a = c.tap(rayAt(0.3), null).id;
    const b = c.tap(rayAt(1.0), null).id;
    const d = c.tap(rayAt(1.7), null).id;
    const rig = s.rig;
    c.selectJoint(b);
    check('controller: remove takes the selected joint and everything below it', c.removeSelected() === true && rig.graph.size === 1 && !rig.graph.has(d) && c.selectedId === null && s.undoStack[s.undoStack.length - 1].kind === 'rig');
    check('controller: with one joint left the scheduler is cancelled', scheduler.cancelled > 0 && c.status.state === 'idle');
    check('controller: remove with nothing selected refuses', c.removeSelected() === false && rig.graph.size === 1);
    c.selectJoint(a);
    c.newChain();
    const root2 = c.tap(rayAt(1.5), null).id;
    check('controller: New chain deselects, so the next tap starts a second root', c.selectedId === root2 && rig.graph.get(root2).parent === null && rig.graph.roots().length === 2);
    check('controller: clear empties the skeleton in one undo unit', c.clearSkeleton() === true && rig.graph.size === 0 && rig.bones.size === 0 && s.undoStack[s.undoStack.length - 1].kind === 'rig');
    s.undo();
    check('controller: undo of the clear brings both roots back', rig.graph.size === 2 && rig.graph.roots().length === 2);
  }

  // --- drag in the plane facing the camera ---
  {
    const { s, c } = setup();
    c.tap(rayAt(0.3), null);
    const b = c.tap(rayAt(1.0), null).id;
    const rig = s.rig;
    const ball = rig.balls.get(b);
    // the camera looks down -x, so the facing plane is x = 0: dragging changes y and z only
    const grab = new THREE.Ray(new THREE.Vector3(5, 1.0, 0), new THREE.Vector3(-1, 0, 0));
    check('controller: pointerdown on a ball starts a drag and selects it', c.beginDrag(ball, grab) === true && c.selectedId === b);
    c.moveDrag(new THREE.Ray(new THREE.Vector3(5, 1.3, 0.1), new THREE.Vector3(-1, 0, 0)));
    const j = rig.graph.get(b);
    check('controller: the joint follows the pointer in the camera plane', near(j.y, 1.3, 1e-6) && near(j.z, 0.1, 1e-6) && near(j.x, 0, 1e-6) && near(rig.balls.get(b).getWorldPosition(new THREE.Vector3()).y, 1.3, 1e-6));
    const units = s.undoStack.length;
    check('controller: releasing records one undo unit for the whole drag', c.endDrag() === true && s.undoStack.length === units + 1 && c.drag === null);
    check('controller: a drag that never moved records nothing', c.beginDrag(rig.balls.get(b), grab) === true && c.endDrag() === true && s.undoStack.length === units + 1);
    s.undo();
    check('controller: undo puts the joint back', near(rig.graph.get(b).y, 1.0, 1e-6));
  }

  // --- the outside warning, the ready status and stale answers ---
  {
    const { s, scheduler, c } = setup();
    c.tap(rayAt(0.3), null);
    const b = c.tap(rayAt(1.0), null).id;
    const rig = s.rig;
    rig.graph.move(b, [3, 1, 0]);
    rig.rebuild();
    c.afterEdit();
    check('controller: a joint outside the model is flagged in colour and in words', c.status.warnings.length === 1 && c.status.warnings[0] === b && rig.balls.get(b).material.color.getHex() === BALL_OUTSIDE);
    rig.graph.move(b, [0, 1, 0]);
    rig.rebuild();
    c.afterEdit();
    check('controller: dragging it back inside clears the warning', c.status.warnings.length === 0);
    const job = scheduler.scheduled[scheduler.scheduled.length - 1]();
    const result = bindMesh({ position: job.position, index: job.index }, job.bones, { target: 300 });
    c.onProgress(0.5, 'solve');
    check('controller: progress is shown in plain words', c.status.state === 'running' && /solving/.test(c.status.text) && /50%/.test(c.status.text));
    c.onDone({ ...result, key: 'stale' });
    check('controller: an answer for another skeleton is dropped', !s.shapes[0].isSkinnedMesh);
    // The model moves while the worker is still busy: the joints ride with it (they are local to the
    // shape) and the weights it is computing are still the right weights.
    const scheduledBefore = scheduler.scheduled.length;
    const placementBefore = c.placementKey();
    s.shapes[0].position.x += 0.5;
    s.group.updateMatrixWorld(true);
    s.emit('changed');
    check('controller: moving the model changes no job key and schedules nothing', c.jobKey() === job.key && c.placementKey() !== placementBefore && scheduler.scheduled.length === scheduledBefore);
    c.onDone({ ...result, key: job.key });
    rig.update(); // what animate() does next frame
    const top = s.shapes[0].geometry.attributes.position.count - 1; // the top cap centre, (0, 2, 0) before the move
    check('controller: the answer for the current skeleton skins the model and reports the numbers', s.shapes[0].isSkinnedMesh === true && c.status.state === 'ready' && /Bending ready/.test(c.status.text) && c.status.stats.finePoints === 986 && /fell back/.test(c.status.details) && c.status.carried === 0);
    check('controller: an answer computed before the move is still right after it — the skin sits on the moved model', near(posedVertex(rig, s.shapes[0], top)[0], 0.5, 1e-4) && near(posedVertex(rig, s.shapes[0], top)[1], 2, 1e-4) && near(rig.worldOf(b)[0], 0.5, 1e-6));
    s.emit('changed');
    check('controller: a change that leaves the model and skeleton alone does not rebind', scheduler.scheduled.length === scheduledBefore);
    s.shapes[0].geometry.attributes.position.needsUpdate = true; // a sculpt: the SURFACE changed, so the weights must
    s.emit('changed');
    check('controller: a sculpt changes the key and schedules a rebind', c.jobKey() !== job.key && scheduler.scheduled.length === scheduledBefore + 1);
    c.onError('boom');
    check('controller: a failed solve is said in plain words', c.status.state === 'error' && /could not/.test(c.status.text));
  }

  // --- a shape with no joint inside rides the nearest bone (owner ruling 3) ---
  {
    const { s, tube, box, scheduler, c } = setup({ box: true });
    c.tap(rayAt(0.3), null);
    c.tap(rayAt(1.0), null);
    c.tap(rayAt(1.7), null);
    const split = c.partsWithJoints();
    check('controller: a shape with no joint inside is carried, not solved', split.parts.length === 1 && split.parts[0].mesh === tube && split.carried.length === 1 && split.carried[0].mesh === box);
    const job = scheduler.scheduled[scheduler.scheduled.length - 1]();
    check('controller: the job carries the box for the worker, beside the merged body', job.position.length === 986 * 3 && job.carried.length === 1 && job.carried[0].position.length === 24 && job.carried[0].index.length === 36);
    const posted = [];
    handleBindMessage({ ...job, type: 'bind', runId: 1, target: 300 }, (m) => posted.push(m));
    const done = posted.find((m) => m.type === 'done');
    c.onDone({ ...done, key: job.key });
    check('controller: the box is skinned onto one bone and the status says so', s.shapes.length === 2 && s.shapes.every((m) => m.isSkinnedMesh && s.rig.owns(m)) && done.carried[0].skinWeight[0] === 1 && c.status.carried === 1 && /1 shape with no joint inside rides the nearest bone/.test(c.status.text));
  }

  // --- a joint is stored in the frame of the shape the tap went into (owner ruling 2) ---
  {
    const { s, box, c } = setup({ box: true });
    c.tap(rayAt(0.3), null);
    const inBox = c.tap(new THREE.Ray(new THREE.Vector3(-5, 1, 0), new THREE.Vector3(1, 0, 0)), null); // from -x: the box is the first solid span
    const j = s.rig.graph.get(inBox.id);
    check('controller: a tap into the second shape gives the joint to that shape, in its own frame', inBox.kind === 'add' && j.shape === box.userData.id && near(j.x, 0, 1e-3) && near(j.y, 0, 1e-3) && near(s.rig.worldOf(inBox.id)[0], -0.75, 1e-3) && near(s.rig.worldOf(inBox.id)[1], 1, 1e-3));
    const split = c.partsWithJoints();
    check('controller: with a joint inside each, both shapes are solved and none is carried', split.parts.length === 2 && split.carried.length === 0);
  }

  // --- a rig undo unit holds local positions, so it stays right wherever the shape now stands ---
  {
    const { s, c } = setup();
    c.tap(rayAt(0.3), null);
    c.tap(rayAt(1.0), null);
    c.tap(rayAt(1.7), null);
    const rig = s.rig;
    s.shapes[0].position.x += 1;
    s.group.updateMatrixWorld(true);
    rig.update();
    s.undo(); // the last tap
    const balls = [...rig.balls.values()].map((ball) => ball.getWorldPosition(new THREE.Vector3()));
    check('controller: undo of a tap after the model moved leaves the remaining balls on the moved model', rig.graph.size === 2 && balls.length === 2 && balls.every((p) => near(p.x, 1, 1e-6)) && near(balls[1].y, 1.0, 1e-3));
  }

  // --- a warning never outlives the joint it names (task 011 carry-over 1) ---
  // checkOutside is the only writer of status.warnings and it runs off skeleton EDITS. A restore
  // that replaces the graph wholesale left them standing — and RigToolbar renders straight from
  // that field, so the recovered restore in snapshot.js (which fires no rig-dirty at all, on
  // purpose) used to leave the toolbar warning about joints that no longer existed.
  {
    const { s, c } = setup();
    const a = c.tap(rayAt(0.3), null);
    c.tap(rayAt(1.0), null);
    // Drag the second joint out of the model so a real warning is standing.
    const outside = c.selectedId;
    const rig = s.rig;
    rig.graph.move(outside, rig.localOf(rig.shapeOf(rig.graph.get(outside)), [4, 1, 0]));
    rig.placeBones();
    c.checkOutside();
    check('controller: a joint dragged outside the model is warned about', c.status.warnings.length === 1 && c.status.warnings[0] === outside && a.id !== outside);

    // What the recovered restore does: the graph is replaced wholesale and NO rig-dirty is fired.
    rig.restoreGraph({ joints: [], pose: {}, nextId: 1 });
    s.emit('changed');
    check('controller: emptying the skeleton without a rig-dirty clears the standing warning', c.status.warnings.length === 0);

    // And the same holds when the rig goes away entirely.
    c.setStatus({ warnings: ['j99'] });
    s.clearRig();
    s.emit('changed');
    check('controller: clearing the rig clears the standing warning too', c.status.warnings.length === 0);
  }

  // --- an imported studio file needs no solve (rig-kept) ---
  {
    const { s, scheduler, c } = setup();
    c.tap(rayAt(0.3), null);
    c.tap(rayAt(1.0), null);
    scheduler.scheduled.length = 0;
    const cancelledBefore = scheduler.cancelled;
    s.emit('rig-kept');
    check('controller: rig-kept cancels any pending wait and asks for no new solve',
      scheduler.scheduled.length === 0 && scheduler.cancelled === cancelledBefore + 1 && c.job === null);
    check('controller: rig-kept marks the current skeleton as the one we want, so changed schedules nothing',
      c.wantedKey === c.jobKey() && c.status.state === 'ready' && /loaded from the file/.test(c.status.text));
    s.emit('changed');
    check('controller: ...and the very next changed really does schedule nothing', scheduler.scheduled.length === 0);
  }

  // --- seams for the headed check ---
  {
    const { s, c } = setup();
    const box = c.modelBox();
    check('controller: modelBox reports the model bounds', !!box && near(box.min[1], 0, 1e-6) && near(box.max[1], 2, 1e-6) && near(box.max[0], 0.4, 1e-3));
    const r = c.tapRay([5, 0.3, 0], [-1, 0, 0]);
    check('controller: tapRay taps from plain arrays', r.kind === 'add' && s.rig.graph.size === 1);
  }

  // --- F1 (final review fix round): a non-watertight model can still be rigged ---
  // final-review.md F1: isInside() used to veto on !surface.isClosed, so on a model that is not
  // edge-manifold (the studio's own shipped sample is one) every joint read "outside" no matter
  // where it was tapped, checkOutside/partsWithJoints refused the model, and no drag could ever
  // fix it. Driven through the REAL RigController, since that is where the child-visible failure
  // lived — not through isInside/tapPoint directly (see tap-depth.spec.js for that invariant).
  {
    const s = new StudioScene();
    const shape = addOpenBoxShape(s, 1); // half=1: like makeBox([-1,-1,-1],[1,1,1]) minus one face
    const openSurface = buildSurface({ position: shape.geometry.attributes.position.array, index: shape.geometry.index.array });
    check('controller: the F1 fixture really is not edge-manifold', openSurface.isClosed === false);
    const scheduler = { scheduled: [], cancelled: 0, schedule(f) { this.scheduled.push(f); }, cancel() { this.cancelled++; } };
    const toast = { show() {}, error() {} };
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(5, 0, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const c = new RigController(s, { scheduler, toast, camera });
    const a = c.tap(new THREE.Ray(new THREE.Vector3(5, 0, 0), new THREE.Vector3(-1, 0, 0)), null);
    check('controller: a tap lands INSIDE the non-watertight model', a.kind === 'add' && a.inside === true);
    const b = c.tap(new THREE.Ray(new THREE.Vector3(5, 0.3, 0), new THREE.Vector3(-1, 0, 0)), null);
    check('controller: a second, linked joint also lands inside', b.kind === 'add' && b.inside === true);
    check('controller: NEITHER joint is reported outside on a non-watertight model (F1)', c.status.warnings.length === 0);
    const job = scheduler.scheduled[scheduler.scheduled.length - 1]();
    check('controller: the bind is NOT refused — makeJob returns a real job, not null (F1)', !!job && typeof job.key === 'string');
  }

  // --- F3 (final review fix round): clearRig cancels the scheduler and un-freezes the status ---
  // final-review.md F3 (PROBE A): onChanged()'s no-rig branch cleared status.warnings but left
  // state/text and the scheduler alone, so New scene (or an undo to a skeleton-less document) froze
  // Rig mode's status on "Working out the bending…" forever and never told the scheduler to give
  // up its wait.
  {
    const { s, scheduler, c } = setup();
    c.tap(rayAt(0.3), null);
    c.tap(rayAt(1.0), null);
    check('controller: two linked joints leave the status "waiting" (PROBE A set-up)', c.status.state === 'waiting' && /Working out the bending/.test(c.status.text));
    const cancelledBefore = scheduler.cancelled;
    s.clearRig();
    check('controller: clearRig actually destroys the rig', s.rig === null);
    check('controller: the scheduler is told to give up its wait (F3)', scheduler.cancelled > cancelledBefore);
    check('controller: status is un-frozen, not left reading "Working out the bending…" (F3)', c.status.state === 'idle' && /place the first joint/.test(c.status.text) && c.status.warnings.length === 0);
  }

  // --- F7 (final review fix round): an unriggable shape says so where the child can see it ---
  // final-review.md F7: rig-controller.js's surface() dropped a shape it could not build a tap
  // surface for with only a console.warn — removed from both the tap surface and the bind, with
  // nothing on screen. The child just sees a shape that never bends, with no explanation why.
  {
    const { s, c, toasts } = setup();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3));
    // One vertex, one degenerate "triangle" (all three corners the same index) -> cleanTriangles
    // drops it -> buildSurface throws 'a tap surface needs at least one real triangle'.
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array([0, 0, 0]), 1));
    const sliver = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
    sliver.name = 'sliver';
    s.addImported(sliver);
    const cache = c.surface();
    check('controller: an unriggable shape is dropped from the tap surface', cache.parts.every((p) => p.mesh !== sliver));
    check('controller: ...and the child is told, not just the console (F7)', toasts.length === 1 && /sliver/.test(toasts[0]));
    // Force a real recompute (surface() rebuilds on every placement change) without touching the
    // sliver itself — the same failure recurs every time, but the child should be told ONCE.
    s.shapes.find((m) => m.name === 'tube').position.x += 0.1;
    s.group.updateMatrixWorld(true);
    c.surface();
    check('controller: the same broken shape is not re-announced on every recompute (F7)', toasts.length === 1);
  }

  // --- an answer that lands MID-DRAG is dropped ---
  // `result.key !== job.key` catches an answer for a DIFFERENT job; it cannot catch this one. A
  // drag rewrites the graph on every pointermove but emits nothing (only endDrag calls afterEdit),
  // so the run in flight is never abandoned and comes back carrying its own job's key while the
  // joints it solved for have already moved. `job.key !== this.jobKey()` is the only clause that
  // separates those two, and no test had ever built the state where they disagree: an answer
  // arriving while a ball is still held. Without it the child sees a flash of the wrong bending
  // and a status that says "ready" about a skeleton that no longer exists.
  {
    const { s, scheduler, c } = setup();
    c.tap(rayAt(0.3), null);
    const b = c.tap(rayAt(1.0), null).id;
    const rig = s.rig;
    const job = scheduler.scheduled[scheduler.scheduled.length - 1]();
    const result = bindMesh({ position: job.position, index: job.index }, job.bones, { target: 300 });
    const scheduledBefore = scheduler.scheduled.length;
    const grab = new THREE.Ray(new THREE.Vector3(5, 1.0, 0), new THREE.Vector3(-1, 0, 0));
    c.beginDrag(rig.balls.get(b), grab);
    c.moveDrag(new THREE.Ray(new THREE.Vector3(5, 1.45, 0), new THREE.Vector3(-1, 0, 0)));
    check('controller: a drag in progress moves the joint without abandoning the run in flight',
      c.drag !== null && c.jobKey() !== job.key && c.job !== null && c.job.key === job.key
      && scheduler.scheduled.length === scheduledBefore);
    c.onDone({ ...result, key: job.key });
    check('controller: an answer that lands mid-drag is dropped — the joints it solved for have moved',
      !s.shapes[0].isSkinnedMesh && c.status.state !== 'ready' && c.job !== null);
    check('controller: releasing the ball then schedules the rebind that replaces it',
      c.endDrag() === true && scheduler.scheduled.length === scheduledBefore + 1);
  }
}
