// src/rig/tests/import-rig.spec.js
// Import keeps the skeleton (task 014, owner ruling 4 of 20 September). A file this studio
// exported comes back exactly — joints, pose and the weights as they were, no solve. A rigged file
// from elsewhere gets joints from its bones and a fresh solve — the one import case that
// recomputes. A plain file is covered in run-tests.mjs (import-plain).
//
// Both fixtures here are deliberately AWKWARD, because the easy versions could not fail (fix round
// 1): the studio file is imported into a document that ALREADY has a skeleton, so the file's joint
// ids really are renumbered and `remapSkinIndex` really has work to do; and the foreign file is
// POSED, so collapsing its skin is not the identity.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { StudioScene } from '../../scene.js';
import { RigController } from '../../ui/rig-controller.js';
import { buildGLB } from '../../io/gltf.js';
import { addTubeShape, chainUpTube, bindNow } from './fixtures.js';

const near = (a, b, tol = 1e-5) => Math.abs(a - b) < tol;
const centreOf = (m) => new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3());

function posedVertex(rig, mesh, i) {
  rig.root.updateMatrixWorld(true);
  mesh.updateMatrixWorld(true);
  const v = new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, i);
  mesh.applyBoneTransform(i, v);
  return v.applyMatrix4(mesh.matrixWorld).toArray();
}

/** A controller on a fake scheduler, so the test can see whether an import asked for a solve.
 * `pending` is what actually matters: `cancel()` drops the outstanding wait, and adding the import
 * to the document legitimately starts one before `rig-kept` arrives to call it off. */
function watch(s) {
  const scheduler = {
    scheduled: [],
    cancelled: 0,
    pending: 0,
    schedule(f) { this.scheduled.push(f); this.pending++; },
    cancel() { this.cancelled++; this.pending = 0; },
  };
  const dirty = [];
  s.on('rig-dirty', () => dirty.push(1));
  const controller = new RigController(s, { scheduler, camera: new THREE.PerspectiveCamera() });
  return { scheduler, dirty, controller };
}

/**
 * A studio-like export from elsewhere, WITHOUT a joint graph — the old `import-fix` fixture, with
 * two things the review of round 1 required:
 *  - TWO skinned meshes on DIFFERENT bones (the old fixture had two; mine had shrunk to one), of
 *    different vertex counts, so "the joints go to the largest non-gear mesh" can actually fail;
 *  - the head bone TURNED after the Skeleton captured its rest inverses, so collapsing the skin is
 *    no longer the identity and `bakeSkinnedToParent`'s inner loop is genuinely exercised.
 */
function foreignDoc() {
  const doc = new THREE.Group();
  doc.name = 'DocumentRoot';
  doc.scale.setScalar(0.5);
  doc.position.set(0, 1, 0);
  const rigRoot = new THREE.Group();
  doc.add(rigRoot);
  const torso = new THREE.Bone();
  torso.name = 'Torso0';
  torso.position.set(0, 0.9, 0);
  rigRoot.add(torso);
  const head = new THREE.Bone();
  head.name = 'Head5';
  head.position.set(0, 1.1, 0.2);
  torso.add(head);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.1), new THREE.MeshBasicMaterial());
  ball.userData.isJointBall = true;
  head.add(ball);
  doc.updateMatrixWorld(true);
  // The Skeleton takes its inverse bind matrices HERE, at rest — before the pose below.
  const skel = new THREE.Skeleton([torso, head]);

  /** One skinned mesh with every vertex on `boneIndex`. */
  const skinTo = (geom, boneIndex, name) => {
    const n = geom.attributes.position.count;
    const si = new Uint16Array(n * 4);
    const sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { si[i * 4] = boneIndex; sw[i * 4] = 1; }
    geom.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    geom.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    const mesh = new THREE.SkinnedMesh(geom, new THREE.MeshStandardMaterial({ color: 0x4dabf7 }));
    mesh.name = name;
    mesh.bindMode = THREE.DetachedBindMode;
    mesh.bind(skel, new THREE.Matrix4());
    mesh.position.set(0, 0.9, 0);
    rigRoot.add(mesh);
    return mesh;
  };
  const body = skinTo(new THREE.BoxGeometry(0.4, 1, 0.4), 1, 'box-1'); // 24 points, on the HEAD bone
  const badge = skinTo(new THREE.PlaneGeometry(0.3, 0.3), 0, 'badge'); // 4 points, on the TORSO bone

  const gear = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3), new THREE.MeshStandardMaterial({ color: 0xffd94a }));
  gear.name = 'helmet';
  gear.userData.isGear = true;
  gear.position.set(0.2, 0.3, 0.4);
  head.add(gear);
  doc.updateMatrixWorld(true);

  // POSE: turn the head a quarter turn. Only the head moves, so the head-weighted mesh must bake
  // away from its rest place while the torso-weighted one must not move at all.
  head.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
  doc.updateMatrixWorld(true);
  skel.update();
  return { doc, torso, head, gear, body, badge };
}

const results = [];
const record = (name, cond) => results.push([name, !!cond]);

async function run() {
  // --- a studio export comes back exactly: joints, shapes, weights — and no solve ---
  {
    const s = new StudioScene();
    addTubeShape(s);
    const rig = s.ensureRig();
    const [a, b, c] = chainUpTube(rig);
    const [skinned] = bindNow(s).meshes;
    const top = skinned.geometry.attributes.position.count - 1; // the top cap centre, (0, 2, 0)
    const worldBefore = [a, b, c].map((id) => rig.worldOf(id));
    rig.bones.get(c).quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    const bentBefore = posedVertex(rig, skinned, top); // (-1, 1, 0)
    rig.rest();
    rig.readPose();
    const restore = rig.detachHelpers();
    const bytes = await buildGLB(s.group, null, rig.graph.toJSON());
    restore();
    const gltf = await new GLTFLoader().parseAsync(bytes, '');

    // The document we import INTO already has a skeleton of its own, so the file's ids are
    // renumbered on the way in (j1-j3 → j4-j6) and its bones land at indices 2-3 of OUR link list.
    // Into an empty scene the id map is the identity and remapSkinIndex is a no-op, which is what
    // made this check unfalsifiable in round 1.
    const fresh = new StudioScene();
    const sitting = addTubeShape(fresh);
    sitting.name = 'already-here'; // so chainUpTube and the lookups below cannot confuse the two
    const sittingIds = chainUpTube(fresh.ensureRig());
    const { scheduler, dirty, controller } = watch(fresh);

    const kind = fresh.adoptImportedRig(gltf.scene);
    const rig2 = fresh.rig;
    const mesh = fresh.shapes.find((m) => m.name === 'tube');
    const ids = rig2 && mesh ? rig2.graph.joints.filter((j) => j.shape === mesh.userData.id).map((j) => j.id) : [];
    record('import: a studio file brings its skeleton back — three more joints, and no solve is asked for',
      kind === 'studio' && !!rig2 && rig2.graph.size === 6 && ids.length === 3
      && dirty.length === 0 && scheduler.pending === 0 && scheduler.cancelled >= 1);
    record('import: the file\'s joint ids are renumbered past the ones the document already had',
      sittingIds.join(',') === 'j1,j2,j3' && ids.join(',') === 'j4,j5,j6'
      && !!rig2 && rig2.linkBones.map((l) => l.name).join(',') === 'j2,j3,j5,j6');
    record('import: the joints sit where they were, to 1e-4',
      ids.length === 3 && ids.every((id, i) => rig2.worldOf(id).every((v, k) => near(v, worldBefore[i][k], 1e-4))));
    record('import: the shape is a studio shape with a fresh id, skinned by the rig with the file\'s weights',
      fresh.shapes.length === 2 && !!mesh && mesh.isSkinnedMesh === true && rig2.owns(mesh)
      && rig2.skinBones.length === 4 && mesh.userData.id !== sitting.userData.id);
    const scheduledBefore = scheduler.scheduled.length;
    fresh.emit('changed');
    record('import: nothing schedules afterwards — the skeleton in hand is the one the document wants',
      controller.wantedKey === controller.jobKey() && scheduler.scheduled.length === scheduledBefore);
    rig2.bones.get(ids[2]).quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    const bentAfter = posedVertex(rig2, mesh, top);
    // Used raw, the file's skinIndex 0/1 would address j2/j3 — the OTHER model's bones — and the
    // top would not move at all. This is the check that pins remapSkinIndex into adoptStudioRig.
    record('import: the top bends the same way — the file\'s weights are re-pointed at OUR bone order, never used raw',
      bentBefore.every((v, i) => near(v, bentAfter[i], 1e-3)));
  }

  // --- a studio file whose graph names a shape the file lacks is refused aloud, then imported as it is ---
  {
    const s = new StudioScene();
    const doc = new THREE.Group();
    doc.userData.rig = { joints: [{ id: 'j1', x: 0, y: 0, z: 0, parent: null, shape: 99 }], pose: {}, nextId: 2 };
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    mesh.userData.id = 1;
    doc.add(mesh);
    const warned = [];
    const warn = console.warn;
    console.warn = (m) => warned.push(String(m));
    let kind;
    try { kind = s.adoptImportedRig(doc); } finally { console.warn = warn; }
    record('import: a graph naming a shape the file lacks is logged and the file imports without joints',
      kind === null && s.rig == null && s.shapes.length === 1 && warned.some((m) => /the file's skeleton names a shape that is not in it/.test(m)));
  }

  // --- a foreign rigged file: joints from its bones, the skins baked AT THEIR POSE, OUR solve asked for ---
  {
    const s = new StudioScene();
    const { dirty } = watch(s);
    const { doc, torso, head, gear } = foreignDoc();
    const gearWorld = gear.getWorldPosition(new THREE.Vector3());
    const torsoWorld = torso.getWorldPosition(new THREE.Vector3()); // (0, 1.45, 0)
    const headWorld = head.getWorldPosition(new THREE.Vector3()); // (0, 2, 0.1) — the head TURNED, it did not move
    const kind = s.adoptImportedRig(doc);
    const rig = s.rig;
    const box = s.shapes.find((m) => m.name === 'box-1');
    const badge = s.shapes.find((m) => m.name === 'badge');
    const joints = rig ? rig.graph.joints : [];
    record('import: a foreign rigged file gets one joint per bone, parented like the bones, all on the BIGGEST non-gear mesh',
      kind === 'foreign' && joints.length === 2 && joints[0].parent === null && joints[1].parent === joints[0].id
      && !!box && !!badge && box.geometry.attributes.position.count > badge.geometry.attributes.position.count
      && joints.every((j) => j.shape === box.userData.id && j.shape !== badge.userData.id));
    record('import: the joints sit at the bones\' places',
      joints.length === 2 && near(rig.worldOf(joints[0].id)[1], torsoWorld.y, 1e-4)
      && near(rig.worldOf(joints[1].id)[1], headWorld.y, 1e-4) && near(rig.worldOf(joints[1].id)[2], headWorld.z, 1e-4));
    // The head is turned, so a skin collapsed properly lands well away from where the un-skinned
    // node sits. Skip the collapse and this mesh stays at its rest place, (0, 1.45, 0).
    const bodyCentre = box ? centreOf(box) : null;
    record('import: a skin is baked AT ITS POSE — the head-weighted mesh lands at (1, 2.45, 0), not at its rest (0, 1.45, 0)',
      !!box && !box.isSkinnedMesh && !rig.owns(box)
      && near(bodyCentre.x, 1, 1e-3) && near(bodyCentre.y, 2.45, 1e-3) && near(bodyCentre.z, 0, 1e-3));
    const badgeCentre = badge ? centreOf(badge) : null;
    record('import: ...and the torso-weighted mesh does NOT move, because its own bone did not — the collapse is per-bone',
      !!badge && !badge.isSkinnedMesh && !rig.owns(badge)
      && near(badgeCentre.x, 0, 1e-3) && near(badgeCentre.y, 1.45, 1e-3) && near(badgeCentre.z, 0, 1e-3));
    record('import: the baked model awaits our solve — rig-dirty fired once', dirty.length === 1);
    let bones = 0;
    let balls = 0;
    doc.traverse((o) => { if (o.isBone) bones++; if (o.userData && o.userData.isJointBall) balls++; });
    const helmet = s.shapes.find((m) => m.name === 'helmet');
    record('import: the file\'s bones and exported joint balls are gone; gear that rode a bone keeps its world place',
      bones === 0 && balls === 0 && !!helmet && helmet.userData.isGear === true
      && helmet.getWorldPosition(new THREE.Vector3()).distanceTo(gearWorld) < 1e-4);
  }
}

await run();

export default function (check) {
  for (const [name, cond] of results) check(name, cond);
}
