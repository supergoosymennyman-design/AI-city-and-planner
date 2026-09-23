// src/rig/tests/snapshot-rig.spec.js
// What is saved (task 014, spec §5 and §6): joints and pose ride the existing snapshot, weights are
// recomputed on load, and the export carries the skeleton and the skin without the balls.
import * as THREE from 'three';
import { StudioScene } from '../../scene.js';
import { takeSnapshot, restoreSnapshot } from '../../edit/snapshot.js';
import { buildGLB } from '../../io/gltf.js';
import { addTubeShape, chainUpTube, bindNow } from './fixtures.js';

const near = (a, b, tol = 1e-5) => Math.abs(a - b) < tol;

function posedVertex(rig, mesh, i) {
  rig.root.updateMatrixWorld(true);
  mesh.updateMatrixWorld(true);
  const v = new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, i);
  mesh.applyBoneTransform(i, v);
  return v.applyMatrix4(mesh.matrixWorld).toArray();
}

/** The JSON chunk of a binary glTF. */
function glbJson(arrayBuffer) {
  const buf = new Uint8Array(arrayBuffer);
  const len = new DataView(arrayBuffer).getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(buf.subarray(20, 20 + len)));
}

const results = [];
const record = (name, cond) => results.push([name, !!cond]);

async function run() {
  // --- joints and pose ride the snapshot; weights do not ---
  {
    const s = new StudioScene();
    addTubeShape(s);
    const rig = s.ensureRig();
    const [a, , c] = chainUpTube(rig);
    const [skinned] = bindNow(s).meshes;
    rig.bones.get(c).quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    s.select(rig.bones.get(c));
    const top = skinned.geometry.attributes.position.count - 1;
    const bentBefore = posedVertex(rig, skinned, top);
    // NOT JSON.parse(JSON.stringify(...)) — snapshot-size.spec.js #5/#6 already establishes (and
    // persist.js relies on) that a snapshot's geo arrays are typed arrays that only survive
    // structuredClone (what IndexedDB actually uses); raw JSON.stringify flattens a Float32Array to
    // `{"0":..,"1":..}` with no `.length`, which would make restoreSnapshot's `>= 3` guard skip the
    // shape entirely. The `rig` field itself is plain data (SkeletonGraph.toJSON(), already proven
    // JSON-safe by skeleton-graph.spec.js and bones.spec.js) — nothing here needs the round-trip.
    const snap = takeSnapshot(s);
    record('save: the snapshot carries the joints and the pose', !!snap.rig && snap.rig.joints.length === 3 && snap.rig.joints[1].parent === a && near(snap.rig.pose[c][2], Math.SQRT1_2, 1e-6) && snap.selectedBone === c);
    record('save: each saved joint names its shape, by the id the snapshot restores', snap.rig.joints.every((j) => j.shape === skinned.userData.id) && snap.objects[0].id === skinned.userData.id);
    record('save: the snapshot carries no weights', JSON.stringify(snap).indexOf('skinIndex') < 0 && snap.objects[0].geo.positions.length === 986 * 3);
    const fresh = new StudioScene();
    const dirty = [];
    fresh.on('rig-dirty', () => dirty.push(1));
    restoreSnapshot(fresh, snap);
    const rig2 = fresh.rig;
    record('save: restore rebuilds the skeleton and asks for the weights', !!rig2 && rig2.isJointRig === true && rig2.graph.structureKey() === rig.graph.structureKey() && dirty.length === 1);
    record('save: restore keeps the pose and the selection', near(rig2.bones.get(c).quaternion.z, Math.SQRT1_2, 1e-6) && fresh.selected === rig2.bones.get(c));
    record('save: until the weights arrive the model is a plain mesh', fresh.shapes.length === 1 && !fresh.shapes[0].isSkinnedMesh && rig2.skinBones.length === 0);
    const [again] = bindNow(fresh).meshes;
    const bentAfter = posedVertex(rig2, again, top);
    record('save: recomputed weights bend the restored model the same way', bentBefore.every((v, i) => near(v, bentAfter[i], 1e-3)));
  }

  // --- a document without a skeleton, and a full-snapshot undo ---
  {
    const s = new StudioScene();
    addTubeShape(s);
    record('save: no skeleton, no rig field', takeSnapshot(s).rig === null);
    const rig = s.ensureRig();
    chainUpTube(rig);
    bindNow(s);
    s.pushUndo();
    s.addPrimitive('box');
    s.undo();
    record('save: a full-snapshot undo keeps the skeleton and asks for the weights again', !!s.rig && s.rig.graph.size === 3 && s.shapes.length === 1 && !s.shapes[0].isSkinnedMesh);
  }

  // --- export: the skeleton and the skin, without the balls ---
  {
    const s = new StudioScene();
    addTubeShape(s);
    const rig = s.ensureRig();
    chainUpTube(rig);
    bindNow(s);
    const restore = rig.detachHelpers();
    let json = null;
    let error = null;
    try {
      rig.readPose();
      json = glbJson(await buildGLB(s.group, null, rig.graph.toJSON()));
    } catch (e) {
      error = e;
    }
    restore();
    record('export: the document exports as a binary glTF', !!json && !error);
    const skins = (json && json.skins) || [];
    const nodes = (json && json.nodes) || [];
    record('export: one skin with three joints, every joint a real node named by its joint', skins.length === 1 && skins[0].joints.length === 3 && skins[0].joints.every((j) => Number.isInteger(j) && nodes[j] && /^j\d+$/.test(nodes[j].name)));
    record('export: the skinned mesh references the skin', nodes.some((n) => n.mesh !== undefined && n.skin === 0));
    record('export: no joint ball or link rides along', !nodes.some((n) => n.extras && (n.extras.isJointBall || n.extras.isRigLink)));
    record('export: the balls are back after the export', rig.balls.get('j1').parent === rig.bones.get('j1'));
    const root = nodes.find((n) => n.extras && n.extras.rig);
    const shapeIds = nodes.filter((n) => n.mesh !== undefined && n.extras && Number.isInteger(n.extras.id)).map((n) => n.extras.id);
    record('export: the file carries the joint graph in the root\'s extras and the shapes carry their ids', !!root && root.extras.rig.joints.length === 3 && root.extras.rig.joints.every((j) => shapeIds.includes(j.shape)) && s.group.userData.rig === undefined);
  }

  // --- fix round 1: a rig naming a shape that didn't come back must not brick the restore ---
  {
    const s = new StudioScene();
    const tube = addTubeShape(s);
    const rig = s.ensureRig();
    chainUpTube(rig);
    s.select(tube);
    const snap = takeSnapshot(s);
    // Corrupt the saved rig exactly the way a lost/hand-edited document would: every joint names a
    // shape id that is not among the saved objects. The objects list itself is untouched, so the
    // shape (and the selection pointing at it) must still restore even though the rig cannot.
    const corrupted = { ...snap, rig: { ...snap.rig, joints: snap.rig.joints.map((j) => ({ ...j, shape: j.shape + 100000 })) } };
    const fresh = new StudioScene();
    const dirty = [];
    fresh.on('rig-dirty', () => dirty.push(1));
    let error = null;
    try {
      restoreSnapshot(fresh, corrupted);
    } catch (e) {
      error = e;
    }
    record('recover: a rig naming a missing shape does not throw', error === null);
    record('recover: the shape and its selection still come back', fresh.shapes.length === 1 && fresh.shapes[0].userData.id === tube.userData.id && fresh.selected === fresh.shapes[0]);
    record('recover: the rig is left clean, not half-built', !!fresh.rig && fresh.rig.isJointRig === true && fresh.rig.graph.size === 0 && fresh.rig.bones.size === 0);
    record('recover: rig-dirty does not fire for a failed restore', dirty.length === 0);
  }

  // --- a throwing rig-dirty LISTENER is not a failed skeleton restore (task 011 carry-over 2) ---
  // The recovery try used to be one line too wide: it wrapped emit('rig-dirty') as well as
  // restoreGraph, so any unrelated listener that threw was reported as "could not restore the
  // skeleton" AND had its perfectly good graph thrown away and replaced with an empty one.
  {
    const s = new StudioScene();
    addTubeShape(s);
    const rig = s.ensureRig();
    chainUpTube(rig);
    const snap = takeSnapshot(s);

    const fresh = new StudioScene();
    fresh.on('rig-dirty', () => { throw new Error('a listener of my own blew up'); });
    const warned = [];
    const warn = console.warn;
    console.warn = (m) => warned.push(String(m));
    let error = null;
    try {
      restoreSnapshot(fresh, snap);
    } catch (e) {
      error = e;
    } finally {
      console.warn = warn;
    }
    record('recover: a throwing rig-dirty listener surfaces as itself, never as a skeleton failure',
      !!error && /a listener of my own blew up/.test(error.message) && !warned.some((m) => /could not restore the skeleton/.test(m)));
    record('recover: ...and the skeleton it had already restored is kept, not discarded',
      !!fresh.rig && fresh.rig.graph.size === 3 && fresh.rig.bones.size === 3);
  }
}

await run();

export default function (check) {
  for (const [name, cond] of results) check(name, cond);
}
