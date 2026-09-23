// src/rig/tests/pose.spec.js
// Posing (task 014, spec §4): a gizmo turn is a transform unit on a bone, undo and redo keep the
// graph's pose in step, Rest is one unit over every bone, the pose survives mode changes and
// skeleton edits, and the root's bone turns the whole model (owner ruling 5).
import * as THREE from 'three';
import { StudioScene } from '../../scene.js';
import { Toolbar } from '../../ui/toolbar.js';
import { addTubeShape, chainUpTube, bindNow } from './fixtures.js';

const near = (a, b, tol = 1e-5) => Math.abs(a - b) < tol;
const trs = (o) => ({ p: o.position.toArray(), q: o.quaternion.toArray(), s: o.scale.toArray() });

function posedVertex(rig, mesh, i) {
  rig.root.updateMatrixWorld(true);
  mesh.updateMatrixWorld(true);
  const v = new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, i);
  mesh.applyBoneTransform(i, v);
  return v.applyMatrix4(mesh.matrixWorld).toArray();
}

// A tiny hand-rolled fake DOM (the src/ai/tests/ai-drag.spec.js pattern), just enough for
// Toolbar.btn()/hint(): createElement, textContent/className, appendChild, addEventListener/click.
// Used ONLY by the carry-over regression below, to drive the REAL Toolbar.renderPose() in plain Node.
class FakeNode {
  constructor(tag) {
    this.tagName = String(tag || 'div').toUpperCase();
    this.textContent = '';
    this.className = '';
    this.childNodes = [];
    this._listeners = {};
  }
  appendChild(child) {
    this.childNodes.push(child);
    return child;
  }
  addEventListener(type, fn) {
    (this._listeners[type] = this._listeners[type] || []).push(fn);
  }
  click() {
    for (const fn of this._listeners.click || []) fn();
  }
  set innerHTML(_) { this.childNodes = []; }
  get innerHTML() { return ''; }
}

export default function (check) {
  const s = new StudioScene();
  addTubeShape(s);
  const rig = s.ensureRig();
  const [a, , c] = chainUpTube(rig);
  const [skinned] = bindNow(s).meshes;
  const top = skinned.geometry.attributes.position.count - 1;

  // a gizmo turn on joint c's bone, recorded the way main.js records a drag: one transform unit
  const bone = rig.bones.get(c);
  const before = trs(bone);
  bone.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
  s.pushTransform([{ mesh: bone, before, after: trs(bone) }]);
  s.emit('changed');
  check('pose: turning a bone bends the skin about its parent joint', near(posedVertex(rig, skinned, top)[0], -1, 1e-3));
  s.undo();
  check('pose: undo of the turn straightens the bone and the graph forgets the rotation', near(bone.quaternion.w, 1, 1e-9) && rig.graph.pose.size === 0 && near(posedVertex(rig, skinned, top)[1], 2, 1e-4));
  s.redo();
  check('pose: redo bends it again and the graph records it', near(bone.quaternion.z, Math.SQRT1_2, 1e-6) && rig.graph.pose.size === 1 && near(rig.graph.pose.get(c)[2], Math.SQRT1_2, 1e-6));

  // Rest, the way main.js does it: one transform unit over every bone that moved
  const ops = [...rig.bones.values()].map((b) => ({ mesh: b, before: trs(b) }));
  rig.rest();
  s.pushTransform(ops.map((op) => ({ ...op, after: trs(op.mesh) })).filter((op) => op.before.q.some((v, i) => Math.abs(v - op.after.q[i]) > 1e-6)));
  const unit = s.undoStack[s.undoStack.length - 1];
  check('pose: Rest straightens every joint in one unit', rig.graph.pose.size === 0 && near(posedVertex(rig, skinned, top)[0], 0, 1e-4) && unit.kind === 'transform' && unit.ops.length === 1);
  s.undo();
  check('pose: undo of Rest brings the pose back', near(bone.quaternion.z, Math.SQRT1_2, 1e-6) && rig.graph.pose.size === 1);
  s.setMode('pose');
  check('pose: entering Pose mode keeps the pose (it is part of the document)', near(bone.quaternion.z, Math.SQRT1_2, 1e-6));
  s.setMode('rig');
  const beforeTap = rig.graph.toJSON();
  rig.graph.add([0.1, 1.5, 0], c, skinned.userData.id);
  rig.rebuild();
  s.pushRig(beforeTap, rig.graph.toJSON());
  check('pose: a skeleton edit keeps the pose on the bones that survive', rig.graph.size === 4 && near(rig.bones.get(c).quaternion.z, Math.SQRT1_2, 1e-6) && rig.graph.pose.size === 1);

  // The root: its bone sits at the root joint (0, 0.05, 0) and is the parent of every first-level
  // bone, so turning it turns the whole model about that point — no special case anywhere.
  rig.rest();
  rig.bones.get(a).quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
  const turned = posedVertex(rig, skinned, top); // (0, 2, 0) about (0, 0.05, 0) → (-1.95, 0.05, 0)
  const bottom = posedVertex(rig, skinned, 0); // the first ring point (0.4, 0, 0) → (0.05, 0.45, 0): the bottom turned too
  check('pose: turning the root joint\'s bone turns the whole model', near(turned[0], -1.95, 1e-3) && near(turned[1], 0.05, 1e-3) && near(bottom[0], 0.05, 1e-3) && near(bottom[1], 0.45, 1e-3));
  rig.readPose();
  check('pose: readPose records the root\'s turn as one entry, for the root', rig.graph.pose.size === 1 && rig.graph.pose.has(a) && near(rig.graph.pose.get(a)[2], Math.SQRT1_2, 1e-6));

  // ---- carry-over (task 8 review, MANDATORY): the Pose toolbar's reset control on a JointRig ----
  // Task 8's review found a reachable crash: the OLD renderPose() always wired its single button to
  // `this.studio.rig?.resetPose()`, a method that exists only on the OLD-style Rig — JointRig has
  // `rest()` instead (src/rig/bones.js) — so tapping "Reset pose" in Pose mode on a tapped skeleton
  // threw TypeError: rig.resetPose is not a function. Nothing gates entry to Pose mode, so this was
  // fully reachable — a "dead control" (looks operational, cannot act, invisible to a happy-path
  // suite). This drives the REAL Toolbar.renderPose() (not a re-implementation) under a tiny fake
  // `document`, the way src/ai/tests/ai-drag.spec.js drives other DOM-dependent modules in Node.
  {
    const s2 = new StudioScene();
    addTubeShape(s2);
    const rig2 = s2.ensureRig();
    const [, , c2] = chainUpTube(rig2);
    bindNow(s2);
    const bone2 = rig2.bones.get(c2);
    bone2.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 3);
    rig2.readPose();
    check('pose: carry-over fixture has a posed bone before Rest is pressed', rig2.graph.pose.size === 1);
    s2.mode = 'pose'; // enter Pose mode directly with a JointRig already tapped and posed

    const previousDocument = globalThis.document;
    let threw = null;
    let onRestCalls = 0;
    try {
      globalThis.document = { createElement: (tag) => new FakeNode(tag) };
      const container = new FakeNode('div');
      new Toolbar(container, s2, {}, {
        onRest: () => {
          onRestCalls++;
          // the way main.js's onRest does it: one transform unit over every bone that moved
          const restOps = [...rig2.bones.values()].map((b) => ({ mesh: b, before: trs(b) }));
          rig2.rest();
          s2.pushTransform(restOps.map((op) => ({ ...op, after: trs(op.mesh) })).filter((op) => op.before.q.some((v, i) => Math.abs(v - op.after.q[i]) > 1e-6)));
          s2.emit('changed');
        },
      });
      const restBtn = container.childNodes.find((n) => n.tagName === 'BUTTON');
      if (!restBtn) throw new Error('renderPose() did not render a reset/Rest button for a posed JointRig');
      restBtn.click();
    } catch (err) {
      threw = err;
    } finally {
      if (previousDocument === undefined) delete globalThis.document;
      else globalThis.document = previousDocument;
    }
    check(`pose: the Pose toolbar reset/Rest control does not throw on a JointRig (carry-over, task 8)${threw ? ' — ' + threw.message : ''}`, !threw);
    check('pose: pressing it calls onRest and puts every bone back to rest', !threw && onRestCalls === 1 && [...rig2.bones.values()].every((b) => near(b.quaternion.w, 1, 1e-9)) && rig2.graph.pose.size === 0);
  }

  // ---- Fix round 1, Finding 1 (BLOCKING, the plan's error): a posed bone's undo must not go
  // silently inert after a LATER skeleton edit. rebuild() (src/rig/bones.js) makes a NEW THREE.Bone
  // for every joint on ANY skeleton edit, so a transform-ledger op recorded before the edit holds a
  // now-detached Bone (removeFromParent()'d by the next rebuild); applyTransform's
  // `if (!mesh || !mesh.parent) continue;` guard then skipped that op SILENTLY. Reachable flow: pose
  // a joint -> edit the skeleton anywhere -> Undo the edit -> Undo the pose, expecting the bone back
  // at rest -> nothing happened, and nothing was said. This drives BOTH undos on the COMBINED state;
  // every pose check above only drives the forward direction, or a single undo with no edit between.
  {
    const s3 = new StudioScene();
    addTubeShape(s3);
    const rig3 = s3.ensureRig();
    const [, , c3] = chainUpTube(rig3);
    const [skinned3] = bindNow(s3).meshes;
    const top3 = skinned3.geometry.attributes.position.count - 1;

    // Pose joint c3's bone (one transform unit, the way a gizmo drag records it), then sync the
    // live pose onto the graph the way RigController.snapshotGraph() does before every Rig-mode
    // action (`rig.readPose(); return rig.graph.toJSON();`) — so the edit's "before" snapshot below
    // carries it, matching what a real pose-in-Pose-mode-then-edit-in-Rig-mode session would do.
    const bone3 = rig3.bones.get(c3);
    const restTRS = trs(bone3);
    bone3.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    s3.pushTransform([{ mesh: bone3, before: restTRS, after: trs(bone3) }]);
    s3.emit('changed');
    rig3.readPose();
    check('pose(regression): the pose is on the graph before the skeleton edit', rig3.graph.pose.size === 1 && rig3.graph.pose.has(c3));

    // Edit the skeleton (adds a 4th joint under c3) — rebuild() replaces EVERY Bone object, c3's included.
    const beforeEdit = rig3.graph.toJSON();
    rig3.graph.add([0.1, 1.5, 0], c3, skinned3.userData.id);
    rig3.rebuild();
    s3.pushRig(beforeEdit, rig3.graph.toJSON());
    check('pose(regression): the edit replaced the bone object (rebuild() semantics)', rig3.bones.get(c3) !== bone3);
    check('pose(regression): the pose still shows on the new bone right after the edit', near(rig3.bones.get(c3).quaternion.z, Math.SQRT1_2, 1e-6));

    // Undo the edit (the pose predates the edit, so it should still show — it isn't what's being undone)...
    s3.undo();
    check('pose(regression): after undoing the edit the pose is still showing', near(rig3.bones.get(c3).quaternion.z, Math.SQRT1_2, 1e-6));
    // ...then undo the pose itself: this is exactly where the stale-Bone-reference bug bit.
    s3.undo();
    const restBone3 = rig3.bones.get(c3);
    check('pose(regression): a second Undo actually straightens the bone (not silently skipped)', near(restBone3.quaternion.w, 1, 1e-9) && rig3.graph.pose.size === 0);
    const backAtRest = posedVertex(rig3, skinned3, top3);
    check('pose(regression): the skin follows — the tube tip is back at its rest position', near(backAtRest[0], 0, 1e-3) && near(backAtRest[1], 2, 1e-4));
  }

  // ---- Final review fix round, F2 (BLOCKING): Pose mode must learn a bind FAILED or was REFUSED,
  // not just repeat "still working" forever. toolbar.js:131 used to branch ONLY on
  // rig.skinBones.length, which nothing writes on RigController.onError() or on a refusal
  // (makeJob() -> null): after c.onError(...), Rig mode's status read {state:"error", …} while
  // Pose mode kept rendering "you can pose as soon as it is ready.", permanently, with no route to
  // the truth (final-review.md PROBE B/C). Drives the REAL Toolbar.renderPose() under the same
  // fake-document stub the carry-over test above uses — not a re-implementation.
  {
    const s4 = new StudioScene();
    addTubeShape(s4);
    const rig4 = s4.ensureRig();
    chainUpTube(rig4); // 3 joints -> rig4.bones.size > 0, but no bindNow() -> skinBones stays []
    check('pose(F2): fixture has bones placed but no bind yet (skinBones empty)', rig4.bones.size === 3 && rig4.skinBones.length === 0);
    s4.mode = 'pose'; // enter Pose mode directly, the way a child who just tapped joints would

    const previousDocument = globalThis.document;
    const renderPoseHint = (rigController) => {
      let hintText = null;
      let threw = null;
      try {
        globalThis.document = { createElement: (tag) => new FakeNode(tag) };
        const container = new FakeNode('div');
        new Toolbar(container, s4, {}, { rigController });
        const hint = container.childNodes.find((n) => n.className === 'hint');
        hintText = hint ? hint.textContent : null;
      } catch (err) {
        threw = err;
      } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
      }
      return { hintText, threw };
    };

    // Back-compat: a caller that passes no controller at all (as the carry-over test above does)
    // must not throw, and keeps the old best-guess text.
    const none = renderPoseHint(undefined);
    check('pose(F2): with no controller given, the old best-guess hint is kept and nothing throws', !none.threw && /you can pose as soon as it is ready/.test(none.hintText));

    // The bind FAILED — the exact status RigController.onError() sets (rig-controller.js:430).
    const errored = renderPoseHint({ status: { state: 'error', text: 'The bending could not be worked out. Try moving the joints inside the model, or Undo the last change.' }, onStatus() {} });
    check('pose(F2): after an error, Pose mode says the bending FAILED, not "still working" (PROBE B)',
      !errored.threw && /could not be worked out/.test(errored.hintText) && !/as soon as it is ready/.test(errored.hintText));
    check('pose(F2): ...and points the child back to where it can be fixed', /Rig mode/.test(errored.hintText));

    // The bind was REFUSED — F1's own failure mode: makeJob() -> null lands the controller on
    // 'idle' with this exact text (rig-controller.js:387).
    const refused = renderPoseHint({ status: { state: 'idle', text: 'No joint is inside a shape yet — drag the joints into the model.' }, onStatus() {} });
    check('pose(F2): after a refusal, Pose mode says so, not "still working" (PROBE C)',
      !refused.threw && /No joint is inside/.test(refused.hintText) && !/as soon as it is ready/.test(refused.hintText));
    check('pose(F2): ...and it too points back to Rig mode', /Rig mode/.test(refused.hintText));

    // Genuinely still solving: the "still working" line is honest here, so it is kept, not replaced.
    const waiting = renderPoseHint({ status: { state: 'waiting', text: 'Working out the bending…' }, onStatus() {} });
    check('pose(F2): while genuinely solving, the "still working" hint is kept (not a lie in this state)', !waiting.threw && /as soon as it is ready/.test(waiting.hintText));
  }
}
