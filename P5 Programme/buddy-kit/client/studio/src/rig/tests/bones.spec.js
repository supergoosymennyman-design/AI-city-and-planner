// src/rig/tests/bones.spec.js
// The three.js side of the rig (task 014): bones at the parent joint, balls at the joint, the skin
// swapped onto the model in place, posing about the parent, re-pointed weights when a joint goes,
// the structure undo unit, the swap that keeps the tree order, joints that ride their shape (owner
// ruling 2), a carried part on one bone (ruling 3) and the lit selected link (ruling 5).
import * as THREE from 'three';
import { StudioScene } from '../../scene.js';
import { riggableMeshes, partFromMesh, BALL_COLOR, BALL_SELECTED, BALL_OUTSIDE, LINK_COLOR, LINK_SELECTED } from '../bones.js';
import { mergeParts, bindMesh } from '../bind.js';
import { transferWeights } from '../transfer-weights.js';
import { addTubeShape, addBoxShape, chainUpTube, bindNow } from './fixtures.js';

const near = (a, b, tol = 1e-5) => Math.abs(a - b) < tol;
const worldOf = (obj) => obj.getWorldPosition(new THREE.Vector3()).toArray();
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(String(e.message)); } };

/** Where vertex `i` of a skinned mesh lands in world space under the current pose. */
function posedVertex(rig, mesh, i) {
  rig.root.updateMatrixWorld(true);
  mesh.updateMatrixWorld(true);
  const v = new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, i);
  mesh.applyBoneTransform(i, v);
  return v.applyMatrix4(mesh.matrixWorld).toArray();
}

export default function (check) {
  // --- a rig lives under the document root and answers the fit engine's questions ---
  {
    const s = new StudioScene();
    const rig = s.ensureRig();
    check('rig: ensureRig makes one JointRig under the document root', rig.isJointRig === true && s.rig === rig && rig.root.parent === s.group && s.ensureRig() === rig);
    check('rig: an empty rig has no bones and no skeleton', rig.bones.size === 0 && rig.skeleton === null && rig.linkBones.length === 0 && rig.graph.size === 0);
  }

  // --- bones sit at the parent joint; balls at the joint; links between ---
  {
    const s = new StudioScene();
    addTubeShape(s);
    const rig = s.ensureRig();
    const [a, b, c] = chainUpTube(rig);
    check('rig: one Bone per joint, named by the joint', rig.bones.size === 3 && rig.bones.get(a).isBone === true && rig.bones.get(b).name === b);
    check('rig: a root bone sits at its joint', near(worldOf(rig.bones.get(a))[1], 0.05));
    check('rig: a link bone sits at its PARENT joint (it rotates about the parent)', near(worldOf(rig.bones.get(b))[1], 0.05) && near(worldOf(rig.bones.get(c))[1], 1));
    check('rig: the ball is drawn at the joint itself', near(worldOf(rig.balls.get(c))[1], 1.95) && near(worldOf(rig.balls.get(a))[1], 0.05));
    check('rig: the bone tree follows the graph', rig.bones.get(b).parent === rig.bones.get(a) && rig.bones.get(c).parent === rig.bones.get(b) && rig.bones.get(a).parent === rig.root);
    check('rig: the skeleton lists link bones in weight order, then the roots', rig.skeleton.bones.map((x) => x.name).join() === `${b},${c},${a}` && rig.bonesForHeat().length === 2 && rig.bonesForHeat()[0].head[1] === 0.05 && near(rig.bonesForHeat()[1].tail[1], 1.95));
    check('rig: links are drawn from a bone to its ball, never for a root', rig.lines.size === 2 && rig.lines.get(b).parent === rig.bones.get(b) && !rig.lines.has(a));
    check('rig: balls are x-ray and carry their joint id for picking', rig.balls.get(a).material.depthTest === false && rig.balls.get(a).renderOrder > 0 && rig.balls.get(a).userData.isJointBall === true && rig.balls.get(a).userData.jointId === a && rig.balls.get(a).userData.boneName === a);
  }

  // --- skinning a mesh swaps it in place ---
  {
    const s = new StudioScene();
    const tube = addTubeShape(s);
    const rig = s.ensureRig();
    const [, b, c] = chainUpTube(rig);
    s.select(tube);
    const { meshes, result } = bindNow(s);
    const skinned = meshes[0];
    check('rig: the model becomes a SkinnedMesh in the same place in the tree', skinned.isSkinnedMesh === true && s.shapes[0] === skinned && s.shapes.length === 1 && !tube.parent && skinned.parent === s.group);
    check('rig: name, id and flags carry over; the geometry is reused', skinned.name === 'tube' && skinned.userData.id === tube.userData.id && skinned.userData.imported === true && skinned.geometry === tube.geometry && result.stats.finePoints === 986);
    check('rig: the selection follows the swap', s.selected === skinned && s.selection.has(skinned) && !s.selection.has(tube) && s.lastShape === skinned);
    check('rig: the rig owns its skinned meshes and remembers which bones the skin indexes', rig.owns(skinned) && rig.skinnedMeshes().length === 1 && rig.skinBones.map((x) => x.name).join() === `${b},${c}` && skinned.bindMode === THREE.DetachedBindMode);
  }

  // --- posing bends the skin about the parent joint ---
  {
    const s = new StudioScene();
    addTubeShape(s);
    const rig = s.ensureRig();
    const [a, , c] = chainUpTube(rig);
    const [skinned] = bindNow(s).meshes;
    const top = skinned.geometry.attributes.position.count - 1; // the top cap centre, (0, 2, 0)
    const rest = posedVertex(rig, skinned, top);
    rig.bones.get(c).quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    const bent = posedVertex(rig, skinned, top);
    check('rig: at rest the skin sits where the geometry is', near(rest[0], 0, 1e-4) && near(rest[1], 2, 1e-4));
    check('rig: turning the bone of joint c swings the top of the tube about joint b', near(bent[0], -1, 1e-3) && near(bent[1], 1, 1e-3));
    rig.readPose();
    check('rig: readPose stores the turned bone and nothing else', rig.graph.pose.size === 1 && near(rig.graph.pose.get(c)[2], Math.SQRT1_2, 1e-6));
    rig.graph.move(a, [0, 0.1, 0]);
    rig.rebuild();
    check('rig: a rebuild keeps the pose and the skin', near(posedVertex(rig, skinned, top)[0], -1, 1e-3) && skinned.isSkinnedMesh && skinned.parent === s.group && rig.owns(skinned));
    rig.rest();
    check('rig: rest straightens every bone and forgets the pose', rig.graph.pose.size === 0 && near(posedVertex(rig, skinned, top)[1], 2, 1e-4) && near(posedVertex(rig, skinned, top)[0], 0, 1e-4));
  }

  // --- removing a joint keeps the model posable with re-pointed weights ---
  {
    const s = new StudioScene();
    addTubeShape(s);
    const rig = s.ensureRig();
    const [, b, c] = chainUpTube(rig);
    const [skinned] = bindNow(s).meshes;
    const top = skinned.geometry.attributes.position.count - 1;
    const wasOnC = skinned.geometry.attributes.skinIndex.array[top * 4] === 1;
    rig.graph.remove(c);
    rig.rebuild();
    check('rig: removing a joint re-points its weights at the surviving parent', wasOnC && skinned.geometry.attributes.skinIndex.array[top * 4] === 0 && skinned.isSkinnedMesh && rig.skinBones.map((x) => x.name).join() === b && rig.skeleton.bones.length === 2);
    rig.graph.remove(b);
    rig.rebuild();
    const plain = s.shapes[0];
    check('rig: with one joint left there is nothing to bend — the model is a plain mesh again', !plain.isSkinnedMesh && plain.name === 'tube' && !plain.geometry.attributes.skinIndex && rig.skinBones.length === 0 && rig.skeleton.bones.length === 1 && rig.skinnedMeshes().length === 0);
  }

  // --- ball colours, visibility, and taking the helpers out for an export ---
  {
    const s = new StudioScene();
    addTubeShape(s);
    const rig = s.ensureRig();
    const [a, b, c] = chainUpTube(rig);
    rig.setSelected(b);
    rig.markOutside([c]);
    check('rig: the selected ball is amber, an outside ball red, the rest cyan', rig.balls.get(b).material.color.getHex() === BALL_SELECTED && rig.balls.get(c).material.color.getHex() === BALL_OUTSIDE && rig.balls.get(a).material.color.getHex() === BALL_COLOR);
    rig.markOutside([b]); // b is now BOTH selected and outside — the two-joint check above never exercises this
    check('rig: outside beats selected when a joint is both', rig.balls.get(b).material.color.getHex() === BALL_OUTSIDE);
    rig.setSelected(null);
    rig.markOutside([]);
    check('rig: colours reset when the selection and the warnings clear', [a, b, c].every((id) => rig.balls.get(id).material.color.getHex() === BALL_COLOR));
    rig.setHelpersVisible(false);
    check('rig: balls and links can hide together (Build mode) while the bones stay', rig.balls.get(a).visible === false && rig.lines.get(b).visible === false && rig.bones.get(a).parent === rig.root);
    const restore = rig.detachHelpers();
    check('rig: detachHelpers takes balls and links out of the bone tree for an export', !rig.balls.get(a).parent && !rig.lines.get(b).parent);
    restore();
    check('rig: and puts them back', rig.balls.get(a).parent === rig.bones.get(a) && rig.lines.get(b).parent === rig.bones.get(b));
  }

  // --- graph restore, the structure undo unit, and clearing ---
  {
    const s = new StudioScene();
    const tube = addTubeShape(s);
    const rig = s.ensureRig();
    const dirty = [];
    s.on('rig-dirty', () => dirty.push(1));
    const before = rig.graph.toJSON();
    const [, , c] = chainUpTube(rig);
    rig.bones.get(c).quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.3);
    rig.readPose();
    const json = JSON.parse(JSON.stringify(rig.graph.toJSON()));
    s.pushRig(before, json);
    check('rig: pushRig records a structure unit, not a snapshot', s.undoStack.length === 1 && s.undoStack[0].kind === 'rig' && s.undoStack[0].after === json && s.redoStack.length === 0);
    s.undo();
    check('rig: undo restores the earlier graph and asks for a rebind', rig.graph.size === 0 && rig.bones.size === 0 && dirty.length === 1 && s.rig === rig);
    s.redo();
    check('rig: redo brings the joints and the pose back', rig.graph.size === 3 && rig.bones.size === 3 && near(rig.bones.get(c).quaternion.x, Math.sin(0.15), 1e-6) && dirty.length === 2);
    const fresh = new StudioScene();
    const freshTube = addTubeShape(fresh);
    freshTube.userData.id = tube.userData.id; // the joints name their shape by id; a snapshot restore brings the ids back the same way (Task 10)
    const rig2 = fresh.ensureRig();
    rig2.restoreGraph(json);
    check('rig: restoreGraph rebuilds bones and applies the pose from plain data', rig2.bones.size === 3 && near(rig2.worldOf(c)[1], 1.95) && near(rig2.bones.get(c).quaternion.x, Math.sin(0.15), 1e-6) && rig2.shapeOf(rig2.graph.get(c)) === freshTube);
    bindNow(s);
    const events = [];
    s.on('before-rig-change', () => events.push('before'));
    s.on('rig-change', (r) => events.push(r === null ? 'gone' : 'rig'));
    s.clearRig();
    check('rig: clearRig unskins the model, disposes the rig and tells the fit engine first', s.rig === null && !s.shapes[0].isSkinnedMesh && !rig.root.parent && events.join() === 'before,gone');
  }

  // --- the rig covers every non-gear shape, in world space ---
  {
    const s = new StudioScene();
    const tube = addTubeShape(s);
    tube.position.set(1, 0, 0);
    s.group.updateMatrixWorld(true);
    const gear = s.addPrimitive('box', null, { silent: true });
    gear.userData.isGear = true;
    const part = partFromMesh(tube);
    check('rig: partFromMesh bakes the world transform', near(part.position[0], tube.geometry.attributes.position.getX(0) + 1) && part.index.length === tube.geometry.index.count && part.mesh === tube);
    const rig = s.ensureRig();
    check('rig: gear is not part of the body', riggableMeshes(s).length === 1 && rig.meshes().length === 1 && rig.parts().length === 1 && rig.parts()[0].mesh === tube);
  }

  // --- swapShape keeps the tree order and the selection ---
  {
    const s = new StudioScene();
    const one = s.addPrimitive('box', null, { silent: true });
    const two = s.addPrimitive('sphere', null, { silent: true });
    const three = s.addPrimitive('cone', null, { silent: true });
    s.select(two);
    const fresh = new THREE.Mesh(two.geometry, two.material);
    fresh.name = 'swapped';
    s.swapShape(two, fresh);
    check('rig: swapShape puts the new object at the old one\'s index', s.group.children.indexOf(fresh) === 1 && !two.parent && s.group.children[0] === one && s.group.children[2] === three);
    check('rig: swapShape carries the selection over', s.selected === fresh && s.selection.has(fresh) && !s.selection.has(two) && s.outlines.has(fresh));
  }

  // --- joints belong to the shape they were tapped inside: move, turn and scale the shape and the
  //     skeleton rides along, the skin follows, and nothing is re-solved (owner ruling 2) ---
  {
    const s = new StudioScene();
    const tube = addTubeShape(s);
    const rig = s.ensureRig();
    const [a, b, c] = chainUpTube(rig);
    check('rig: a joint carries its shape and the rig resolves its world place through it', rig.graph.get(c).shape === tube.userData.id && rig.shapeOf(rig.graph.get(c)) === tube && near(rig.worldOf(c)[1], 1.95) && near(rig.localOf(tube, [0.3, 1.95, 0])[0], 0.3));
    const [skinned] = bindNow(s).meshes;
    const top = skinned.geometry.attributes.position.count - 1; // the top cap centre, (0, 2, 0)
    const indexBefore = skinned.geometry.attributes.skinIndex.array;
    const weightBefore = skinned.geometry.attributes.skinWeight.array;
    const numbers = rig.graph.joints.map((j) => `${j.x},${j.y},${j.z}`).join('|');
    skinned.position.x += 1;
    s.group.updateMatrixWorld(true);
    check('rig: update() notices the moved shape and re-places the bones', rig.update() === true && [a, b, c].every((id) => near(worldOf(rig.bones.get(id))[0], 1)) && near(worldOf(rig.balls.get(c))[0], 1) && near(worldOf(rig.balls.get(c))[1], 1.95));
    check('rig: the skin follows the move without a re-solve', near(posedVertex(rig, skinned, top)[0], 1, 1e-4) && near(posedVertex(rig, skinned, top)[1], 2, 1e-4) && skinned.geometry.attributes.skinIndex.array === indexBefore && skinned.geometry.attributes.skinWeight.array === weightBefore);
    check('rig: the joint numbers are unchanged — they are local to the shape', rig.graph.joints.map((j) => `${j.x},${j.y},${j.z}`).join('|') === numbers && near(rig.localOf(skinned, rig.worldOf(c))[1], 1.95) && near(rig.linkBones[1].tail[0], 1));
    check('rig: update() with nothing moved does nothing', rig.update() === false);
    skinned.position.x -= 1;
    skinned.rotation.z = Math.PI / 2;
    s.group.updateMatrixWorld(true);
    rig.update();
    check('rig: turning the shape turns the skeleton with it', near(worldOf(rig.balls.get(c))[0], -1.95, 1e-4) && near(worldOf(rig.balls.get(c))[1], 0, 1e-4) && near(posedVertex(rig, skinned, top)[0], -2, 1e-4));
    skinned.rotation.z = 0;
    skinned.scale.setScalar(2);
    s.group.updateMatrixWorld(true);
    rig.update();
    check('rig: scaling the shape scales the skeleton, and the skin sits on the scaled geometry', near(worldOf(rig.balls.get(c))[1], 3.9, 1e-4) && near(posedVertex(rig, skinned, top)[1], 4, 1e-4) && near(rig.bonesForHeat()[1].tail[1], 3.9, 1e-4));
    skinned.scale.setScalar(1);
    s.group.updateMatrixWorld(true);
    rig.update();
    rig.bones.get(c).quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    const bent = posedVertex(rig, skinned, top);
    skinned.position.x += 1;
    s.group.updateMatrixWorld(true);
    rig.update();
    const bentMoved = posedVertex(rig, skinned, top);
    check('rig: a pose survives a move — the bent point moved by the same +1', near(bent[0], -1, 1e-3) && near(bentMoved[0], bent[0] + 1, 1e-3) && near(bentMoved[1], bent[1], 1e-3) && near(rig.bones.get(c).quaternion.z, Math.SQRT1_2, 1e-6) && rig.graph.pose.size === 1);
  }

  // --- a shape takes its joints with it when it is deleted; a joint whose shape is gone is loud ---
  {
    const s = new StudioScene();
    addTubeShape(s);
    const rig = s.ensureRig();
    const [, , c] = chainUpTube(rig);
    const box = addBoxShape(s);
    box.position.set(-0.75, 1, 0);
    s.group.updateMatrixWorld(true);
    const d = rig.graph.add(rig.localOf(box, [-0.75, 1, 0]), c, box.userData.id);
    const e = rig.graph.add(rig.localOf(box, [-0.75, 1.1, 0]), d, box.userData.id);
    rig.rebuild();
    const changes = [];
    s.on('changed', () => changes.push(1));
    s.remove(box);
    check('rig: removing a shape takes its joints and their subtree with it', rig.graph.size === 3 && !rig.graph.has(d) && !rig.graph.has(e) && rig.bones.size === 3 && rig.graph.has(c) && s.shapes.length === 1 && changes.length === 1);
    check('rig: a joint whose shape is gone is a loud error, not a silent zero', throws(() => rig.shapeOf({ id: 'j9', shape: 999 }), /joint j9 belongs to a shape that is gone \(999\)/));
  }

  // --- a shape with no joint inside rides the nearest bone: the transferred skin is applied like any other (owner ruling 3) ---
  {
    const s = new StudioScene();
    const tube = addTubeShape(s);
    const rig = s.ensureRig();
    const [, , c] = chainUpTube(rig);
    const box = addBoxShape(s);
    box.position.set(-0.75, 1.6, 0); // beside the top link, 0.2 clear of the tube
    s.group.updateMatrixWorld(true);
    const tubePart = partFromMesh(tube);
    const boxPart = partFromMesh(box);
    const merged = mergeParts([tubePart]);
    const body = bindMesh({ position: merged.position, index: merged.index }, rig.bonesForHeat(), { target: 300 });
    const ride = transferWeights({ position: merged.position, index: merged.index }, body, boxPart.position, { rigid: true });
    const meshes = rig.applySkins({ ...body, carried: [ride] }, [tubePart], merged.ranges, [boxPart]);
    const boxSkin = meshes[1].geometry.attributes;
    let oneBone = true;
    for (let i = 0; i < 8; i++) oneBone = oneBone && boxSkin.skinIndex.array[i * 4] === ride.stats.socket.bone && boxSkin.skinWeight.array[i * 4] === 1;
    check('rig: a carried part is skinned onto the one bone the transfer chose, and the rig owns it', meshes.length === 2 && meshes[1].isSkinnedMesh === true && meshes[1].userData.id === box.userData.id && rig.owns(meshes[1]) && rig.skinnedMeshes().length === 2 && oneBone && ride.stats.socket.bone === 1);
    // bone 1 is joint c's link, hinged at joint b (0, 1, 0): the box corner (-0.9, 1.45, -0.15) turns to (-0.45, 0.1, -0.15)
    rig.bones.get(c).quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    const corner = posedVertex(rig, meshes[1], 0);
    check('rig: the carried part swings rigidly with its bone', near(corner[0], -0.45, 1e-3) && near(corner[1], 0.1, 1e-3) && near(corner[2], -0.15, 1e-3));
    rig.unskinAll();
    check('rig: unskinAll takes the carried skin off too', rig.skinnedMeshes().length === 0 && s.shapes.length === 2 && s.shapes.every((m) => !m.isSkinnedMesh) && rig.skinBones.length === 0);
  }

  // --- the selected joint's link is lit, so the ring at the joint above reads as the hinge (owner ruling 5) ---
  {
    const s = new StudioScene();
    addTubeShape(s);
    const rig = s.ensureRig();
    const [a, b, c] = chainUpTube(rig);
    rig.setSelected(c);
    check('rig: the selected joint\'s link is lit amber and the other link keeps the link colour', LINK_SELECTED === 0xffc857 && rig.lines.get(c).material.color.getHex() === LINK_SELECTED && rig.lines.get(b).material.color.getHex() === LINK_COLOR && !rig.lines.has(a));
    rig.setSelected(null);
    check('rig: deselecting puts every link back', rig.lines.get(b).material.color.getHex() === LINK_COLOR && rig.lines.get(c).material.color.getHex() === LINK_COLOR);
  }
}
