// src/rig/bones.js
// The three.js side of the new rig (task 014): the joint graph as THREE.Bone objects, the joint
// balls and links, the Skeleton, and the skin swapped onto the model's meshes in place. DOM-free so
// the Node suite drives it. One Bone per joint, sitting at the joint's PARENT (plan decision 1): the
// bone named after joint C is the link parent(C)→C, it rotates about the parent, and the ball drawn
// at C is its tail. A chain root's bone sits at the root and carries no weights.
//
// Joints are LOCAL to the shape they were tapped inside (owner ruling 2, 20 September); the graph
// stores the shape's id and this file resolves every joint into document space through the shape's
// matrixWorld. When a shape moves, turns or scales, `update()` (once per frame) re-places the bones
// from the new matrix and rebinds the skins where they stand — no weights are recomputed, because
// a detached bind with fresh inverses sits exactly on the geometry wherever the shape now is.
import * as THREE from 'three';
import { SkeletonGraph, toBones } from './skeleton-graph.js';
import { remapSkinIndex, splitSkin } from './bind.js';

export const BALL_RADIUS = 0.04;
export const BALL_COLOR = 0x00e5ff;
export const BALL_SELECTED = 0xffc857;
export const BALL_OUTSIDE = 0xff5c5c;
export const LINK_COLOR = 0x7ff9ff;
// The selected joint's link, in the ball's amber: the piece the ring swings is lit, so the ring at
// the joint above reads as the hinge (owner ruling 5).
export const LINK_SELECTED = 0xffc857;
// Drawn last with the depth test off: every joint of a bent model is inside the mesh, and a ball
// hidden by the surface could never be tapped again (plan decision 4).
const RIG_RENDER_ORDER = 999;

const _v = new THREE.Vector3();

/** The meshes the rig covers: every shape in the document except fitted gear (spec §7). */
export function riggableMeshes(studio) {
  const graph = studio.rig?.graph;
  const scope = graph?.size && graph.targetShapes ? new Set(graph.targetShapes) : null;
  return studio.shapes.filter((m) => !m.userData?.isGear && (!scope || scope.has(m.userData.id)));
}

/** A mesh as a world-space triangle soup — the form the tap surface and the bind consume.
 * World space IS document space: `studio.group` (the document root) is created at identity and
 * nothing transforms it. If that ever changes, this is the one place to multiply by its inverse. */
export function partFromMesh(mesh) {
  const geometry = mesh.geometry;
  const attr = geometry && geometry.attributes && geometry.attributes.position;
  if (!attr) throw new Error(`${mesh.name || 'shape'} has no positions to rig`);
  mesh.updateWorldMatrix(true, false);
  const position = new Float32Array(attr.count * 3);
  for (let i = 0; i < attr.count; i++) {
    _v.fromBufferAttribute(attr, i).applyMatrix4(mesh.matrixWorld);
    position[i * 3] = _v.x;
    position[i * 3 + 1] = _v.y;
    position[i * 3 + 2] = _v.z;
  }
  let index;
  if (geometry.index) {
    index = Uint32Array.from(geometry.index.array);
  } else {
    index = new Uint32Array(attr.count);
    for (let i = 0; i < attr.count; i++) index[i] = i;
  }
  return { position, index, mesh };
}

/** What a shape keeps when its class changes (Mesh ↔ SkinnedMesh). userData is SHARED, not copied. */
function copyIdentity(from, to) {
  to.name = from.name;
  to.userData = from.userData;
  to.position.copy(from.position);
  to.quaternion.copy(from.quaternion);
  to.scale.copy(from.scale);
  to.visible = from.visible;
  to.renderOrder = from.renderOrder;
  to.castShadow = from.castShadow;
  to.receiveShadow = from.receiveShadow;
}

export class JointRig {
  constructor(studio) {
    this.isJointRig = true;
    this.studio = studio;
    this.graph = new SkeletonGraph();
    this.root = new THREE.Group();
    this.root.name = 'RigRoot';
    this.root.userData.isRigRoot = true;
    /** @type {Map<string, THREE.Bone>} joint id → bone; what the fit engine reads */
    this.bones = new Map();
    /** @type {Map<string, THREE.Mesh>} joint id → ball */
    this.balls = new Map();
    /** @type {Map<string, THREE.Line>} joint id → the link from its bone to its ball (no root entries) */
    this.lines = new Map();
    this.skeleton = null;
    /** the toBones(graph, worldOf) list of the current build, in DOCUMENT space: skinIndex k means linkBones[k] */
    this.linkBones = [];
    /** {name, parent} per link the CURRENT SKIN indexes; [] when no mesh is skinned */
    this.skinBones = [];
    /** @type {Map<number, Float64Array>} owning shape id → its matrixWorld as the bones were last placed */
    this.shapeMatrices = new Map();
    this.selectedId = null;
    this.outside = new Set();
    this.helpersVisible = true;
    this.ballGeometry = new THREE.SphereGeometry(BALL_RADIUS, 20, 14);
    this.linkMaterial = new THREE.LineBasicMaterial({ color: LINK_COLOR, depthTest: false, depthWrite: false, transparent: true, opacity: 0.9 });
    this.selectedLinkMaterial = new THREE.LineBasicMaterial({ color: LINK_SELECTED, depthTest: false, depthWrite: false, transparent: true, opacity: 1 });
  }

  meshes() { return riggableMeshes(this.studio); }
  parts() { return this.meshes().map(partFromMesh); }
  skinnedMeshes() { return this.studio.shapes.filter((m) => this.owns(m)); }
  /** Bones and Skeletons are recreated on every rebuild, so ownership is a flag, not identity. */
  owns(mesh) { return !!(mesh && mesh.isSkinnedMesh && mesh.userData && mesh.userData.rigSkin === true); }
  /** The links in the form computeHeatWeights consumes, in skinIndex order, in document space. */
  bonesForHeat() { return this.linkBones.map((b) => ({ head: b.head.slice(), tail: b.tail.slice() })); }

  // ---------------------------------------------------------------- frames: the graph is local, the bones are not
  /** The shape a joint belongs to. Loud when it is gone: the studio removes a shape's joints before
   * the shape (scene.remove), so a dangling joint is a programming error, never a user state. */
  shapeOf(joint) {
    const shape = this.studio.shapes.find((m) => m.userData && m.userData.id === joint.shape);
    if (!shape) throw new Error(`joint ${joint.id} belongs to a shape that is gone (${joint.shape})`);
    return shape;
  }

  /** A joint's place in document space: its local numbers through its shape's matrixWorld. */
  worldOf(id) {
    const joint = this.graph.get(id);
    if (!joint) throw new Error(`unknown joint ${id}`);
    const shape = this.shapeOf(joint);
    shape.updateWorldMatrix(true, false);
    return shape.localToWorld(_v.set(joint.x, joint.y, joint.z)).toArray();
  }

  /** A document-space point in `shape`'s local frame — what the graph stores. */
  localOf(shape, worldPoint) {
    shape.updateWorldMatrix(true, false);
    return shape.worldToLocal(_v.fromArray(worldPoint)).toArray();
  }

  /** Where each joint's bone sits, in document space: at its parent joint, or at itself for a root. */
  bonePlaces() {
    const world = new Map();
    for (const j of this.graph.joints) world.set(j.id, this.worldOf(j.id));
    const at = new Map();
    for (const j of this.graph.joints) at.set(j.id, world.get(j.parent === null ? j.id : j.parent));
    return { world, at };
  }

  /** Remember each owning shape's matrixWorld, so update() can tell when one moved. */
  rememberShapes() {
    this.shapeMatrices = new Map();
    for (const j of this.graph.joints) {
      if (this.shapeMatrices.has(j.shape)) continue;
      const shape = this.shapeOf(j);
      shape.updateWorldMatrix(true, false);
      this.shapeMatrices.set(j.shape, Float64Array.from(shape.matrixWorld.elements));
    }
  }

  /** Rebuild every three.js object from the graph. Keeps the pose (read from the old bones first
   * unless `readPose` is false) and keeps the skin, re-pointing it if the bone list changed. */
  rebuild(opts = {}) {
    const selectedJoint = this.studio.selected?.isBone && this.bones.get(this.studio.selected.name) === this.studio.selected ? this.studio.selected.name : null;
    if (opts.readPose !== false) this.readPose();
    const previous = this.skinBones;
    for (const bone of this.bones.values()) bone.removeFromParent();
    for (const ball of this.balls.values()) ball.material.dispose();
    for (const line of this.lines.values()) line.geometry.dispose();
    this.bones.clear();
    this.balls.clear();
    this.lines.clear();
    this.linkBones = toBones(this.graph, (j) => this.worldOf(j.id));

    const { world, at } = this.bonePlaces();
    for (const j of this.graph.joints) {
      const bone = new THREE.Bone();
      bone.name = j.id;
      bone.userData.jointId = j.id;
      this.bones.set(j.id, bone);
    }
    for (const j of this.graph.joints) {
      const bone = this.bones.get(j.id);
      const here = at.get(j.id);
      const self = world.get(j.id);
      if (j.parent === null) {
        bone.position.set(here[0], here[1], here[2]);
        this.root.add(bone);
      } else {
        const up = at.get(j.parent);
        bone.position.set(here[0] - up[0], here[1] - up[1], here[2] - up[2]);
        this.bones.get(j.parent).add(bone);
      }
      const ball = new THREE.Mesh(this.ballGeometry, new THREE.MeshBasicMaterial({ color: BALL_COLOR, depthTest: false, depthWrite: false, transparent: true, opacity: 0.95 }));
      ball.renderOrder = RIG_RENDER_ORDER;
      ball.userData.isJointBall = true;
      ball.userData.boneName = j.id;
      ball.userData.jointId = j.id;
      ball.position.set(self[0] - here[0], self[1] - here[1], self[2] - here[2]);
      ball.visible = this.helpersVisible;
      bone.add(ball);
      this.balls.set(j.id, ball);
      if (j.parent !== null) {
        const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), ball.position.clone()]);
        const line = new THREE.Line(geometry, this.linkMaterial);
        line.renderOrder = RIG_RENDER_ORDER - 1;
        line.frustumCulled = false;
        line.userData.isRigLink = true;
        line.visible = this.helpersVisible;
        bone.add(line);
        this.lines.set(j.id, line);
      }
    }
    this.root.updateMatrixWorld(true);
    // The Skeleton takes its inverse bind matrices NOW, at rest, before any pose is applied.
    const ordered = [...this.linkBones.map((l) => this.bones.get(l.name)), ...this.graph.roots().map((id) => this.bones.get(id))];
    this.skeleton = ordered.length ? new THREE.Skeleton(ordered) : null;
    this.applyPose();
    this.retargetSkin(previous);
    this.paintBalls();
    this.paintLinks();
    this.rememberShapes();
    if (selectedJoint) this.studio.select(this.bones.get(selectedJoint) || null);
  }

  /** The cheap path when a shape (or a joint) moved: every bone, ball and link re-placed from
   * `worldOf`, fresh bind inverses, the skins rebound where the shapes now stand, the pose put
   * back. Objects keep their identity (the gizmo may hold one); nothing is re-solved — the
   * weights belong to the surface, only the rest placement and the bind matrices change. */
  placeBones() {
    if (!this.bones.size) return;
    this.readPose(); // the live pose is on the bones; keep it across the identity reset below
    this.linkBones = toBones(this.graph, (j) => this.worldOf(j.id));
    const { world, at } = this.bonePlaces();
    for (const j of this.graph.joints) {
      const bone = this.bones.get(j.id);
      const here = at.get(j.id);
      const self = world.get(j.id);
      bone.quaternion.identity();
      if (j.parent === null) {
        bone.position.set(here[0], here[1], here[2]);
      } else {
        const up = at.get(j.parent);
        bone.position.set(here[0] - up[0], here[1] - up[1], here[2] - up[2]);
      }
      const ball = this.balls.get(j.id);
      ball.position.set(self[0] - here[0], self[1] - here[1], self[2] - here[2]);
      const line = this.lines.get(j.id);
      if (line) {
        line.geometry.attributes.position.setXYZ(1, ball.position.x, ball.position.y, ball.position.z);
        line.geometry.attributes.position.needsUpdate = true;
      }
    }
    this.root.updateMatrixWorld(true);
    if (this.skeleton) this.skeleton.calculateInverses(); // inverses at the NEW rest
    for (const mesh of this.skinnedMeshes()) this.bindSkinned(mesh);
    this.applyPose();
    this.rememberShapes();
  }

  /** Once per frame (main.js animate(), before syncOutlines): did a shape that owns joints move,
   * turn or scale since the bones were placed? Then place them again. Catches the gizmo (per
   * frame, so the skin follows the drag), the Details panel, undo/redo and a snapshot restore
   * without auditing every writer. Returns true when the bones were re-placed. */
  update() {
    if (!this.shapeMatrices.size) return false;
    const byId = new Map();
    for (const m of this.studio.shapes) byId.set(m.userData.id, m);
    let moved = false;
    for (const [shapeId, was] of this.shapeMatrices) {
      const shape = byId.get(shapeId);
      if (!shape) throw new Error(`a joint belongs to a shape that is gone (${shapeId})`);
      shape.updateWorldMatrix(true, false);
      const now = shape.matrixWorld.elements;
      for (let i = 0; i < 16 && !moved; i++) if (now[i] !== was[i]) moved = true;
      if (moved) break;
    }
    if (moved) this.placeBones();
    return moved;
  }

  /** A shape is leaving the document: its joints (and their subtrees) go first, then a rebuild.
   * Called by scene.remove() AFTER the shape left the tree and BEFORE its geometry is disposed.
   * Returns the removed joint ids. */
  dropShape(mesh) {
    const shape = mesh && mesh.userData ? mesh.userData.id : undefined;
    const gone = [];
    for (const j of [...this.graph.joints]) {
      if (j.shape === shape && this.graph.has(j.id)) gone.push(...this.graph.remove(j.id));
    }
    if (gone.length) this.rebuild();
    return gone;
  }

  /** Keep the skinned meshes bound: same bone list → rebind only; changed list → re-point first. */
  retargetSkin(previous) {
    const skinned = this.skinnedMeshes();
    if (!skinned.length) {
      this.skinBones = [];
      return;
    }
    const next = this.linkBones.map((b) => ({ name: b.name, parent: b.parent }));
    if (!next.length) {
      this.unskinAll();
      return;
    }
    const same = previous.length === next.length && previous.every((b, i) => b.name === next[i].name);
    for (const mesh of skinned) {
      if (!same) {
        const geometry = mesh.geometry;
        const moved = remapSkinIndex({ skinIndex: geometry.attributes.skinIndex.array, skinWeight: geometry.attributes.skinWeight.array }, previous, next);
        geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(moved.skinIndex, 4));
        geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(moved.skinWeight, 4));
      }
      this.bindSkinned(mesh);
    }
    this.skinBones = next;
  }

  /** Bind a SkinnedMesh to the current skeleton where it stands (detached bind, bindMatrix = its world matrix). */
  bindSkinned(mesh) {
    mesh.bindMode = THREE.DetachedBindMode;
    mesh.updateMatrixWorld(true);
    mesh.bind(this.skeleton, mesh.matrixWorld.clone());
  }

  /** Put a bind result onto the meshes it was computed for. `parts` are the partFromMesh() entries
   * in merge order, `ranges` the merge's ranges; `carried` are the partFromMesh() entries that rode
   * the nearest bone by transfer (owner ruling 3), in the order of `result.carried`, each of which
   * is `{skinIndex, skinWeight, stats}` for that part. Returns the (possibly swapped) meshes:
   * the solved parts first, then the carried ones. */
  applySkins(result, parts, ranges, carried = []) {
    if (!this.skeleton) throw new Error('applySkins needs a skeleton — rebuild the rig first');
    const skins = result.carried || [];
    if (skins.length !== carried.length) throw new Error(`the answer carries ${skins.length} transferred skins for ${carried.length} carried shapes`);
    const slices = splitSkin(result, ranges);
    const out = [];
    for (let i = 0; i < parts.length; i++) out.push(this.skinMesh(parts[i].mesh, slices[i]));
    for (let i = 0; i < carried.length; i++) out.push(this.skinMesh(carried[i].mesh, skins[i]));
    this.skinBones = this.linkBones.map((b) => ({ name: b.name, parent: b.parent }));
    return out;
  }

  /** Give one mesh a skin that indexes the CURRENT link list. A plain Mesh becomes a SkinnedMesh
   * in its place in the tree. `skinBones` is set here too, so a skin applied on its own (an
   * imported file's, Task 11) is re-pointed correctly by the next rebuild. */
  skinMesh(mesh, skin) {
    if (!mesh.parent) throw new Error(`cannot skin ${mesh.name || 'a shape'}: it is no longer in the scene`);
    const count = mesh.geometry.attributes.position.count;
    if (skin.skinIndex.length !== count * 4) throw new Error(`the skin for ${mesh.name} covers ${skin.skinIndex.length / 4} points, the mesh has ${count}`);
    mesh.geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skin.skinIndex, 4));
    mesh.geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skin.skinWeight, 4));
    let target = mesh;
    if (!mesh.isSkinnedMesh) {
      target = new THREE.SkinnedMesh(mesh.geometry, mesh.material);
      copyIdentity(mesh, target);
      this.studio.swapShape(mesh, target);
    }
    target.userData.rigSkin = true;
    target.frustumCulled = false; // a bent model leaves its rest-pose bounds
    this.bindSkinned(target);
    this.skinBones = this.linkBones.map((b) => ({ name: b.name, parent: b.parent }));
    return target;
  }

  /** Take the skin off one mesh: back to a plain Mesh in the same place. */
  unskinMesh(mesh) {
    if (!mesh.isSkinnedMesh || !mesh.parent) return mesh;
    mesh.geometry.deleteAttribute('skinIndex');
    mesh.geometry.deleteAttribute('skinWeight');
    const plain = new THREE.Mesh(mesh.geometry, mesh.material);
    copyIdentity(mesh, plain);
    delete plain.userData.rigSkin;
    this.studio.swapShape(mesh, plain);
    return plain;
  }

  unskinAll() {
    for (const m of this.skinnedMeshes()) this.unskinMesh(m);
    this.skinBones = [];
  }

  /** Replace the graph from plain data (a snapshot, an undo unit) and rebuild. */
  restoreGraph(json) {
    this.graph = SkeletonGraph.fromJSON(json);
    const scope = new Set(this.meshes());
    for (const mesh of this.skinnedMeshes()) if (!scope.has(mesh)) this.unskinMesh(mesh);
    this.rebuild({ readPose: false });
  }

  /** graph.pose → bone quaternions. */
  applyPose() {
    for (const j of this.graph.joints) {
      const bone = this.bones.get(j.id);
      const q = this.graph.pose.get(j.id);
      if (q) bone.quaternion.fromArray(q);
      else bone.quaternion.identity();
    }
    this.root.updateMatrixWorld(true);
  }

  /** bone quaternions → graph.pose (an unrotated bone is stored as no entry). */
  readPose() {
    for (const [id, bone] of this.bones) {
      if (!this.graph.has(id)) continue;
      const q = bone.quaternion;
      const identity = Math.abs(q.x) < 1e-9 && Math.abs(q.y) < 1e-9 && Math.abs(q.z) < 1e-9 && Math.abs(Math.abs(q.w) - 1) < 1e-9;
      this.graph.setPose(id, identity ? null : q.toArray());
    }
  }

  /** Every joint back to its unrotated state (spec §4 Rest). */
  rest() {
    for (const bone of this.bones.values()) bone.quaternion.identity();
    this.graph.clearPose();
    this.root.updateMatrixWorld(true);
  }

  /** Select a joint: its ball goes amber and so does its link — the lit piece is the one the ring
   * (at the joint above) swings. A root has no link. */
  setSelected(id) {
    this.selectedId = id && this.balls.has(id) ? id : null;
    this.paintBalls();
    this.paintLinks();
  }

  /** Joints that sit outside the model (spec §1: a defect, said in plain words and colour). */
  markOutside(ids) {
    this.outside = new Set(ids);
    this.paintBalls();
  }

  paintBalls() {
    for (const [id, ball] of this.balls) {
      ball.material.color.setHex(this.outside.has(id) ? BALL_OUTSIDE : id === this.selectedId ? BALL_SELECTED : BALL_COLOR);
    }
  }

  paintLinks() {
    for (const [id, line] of this.lines) line.material = id === this.selectedId ? this.selectedLinkMaterial : this.linkMaterial;
  }

  /** Balls and links show in Rig and Pose modes only; the bones themselves always stay. */
  setHelpersVisible(flag) {
    this.helpersVisible = !!flag;
    for (const ball of this.balls.values()) ball.visible = this.helpersVisible;
    for (const line of this.lines.values()) line.visible = this.helpersVisible;
  }

  /** Take the balls and links out of the bone tree (for an export) and return the function that puts them back. */
  detachHelpers() {
    const removed = [];
    for (const ball of this.balls.values()) { removed.push([ball, ball.parent]); ball.removeFromParent(); }
    for (const line of this.lines.values()) { removed.push([line, line.parent]); line.removeFromParent(); }
    return () => { for (const [o, parent] of removed) if (parent) parent.add(o); };
  }

  dispose() {
    for (const ball of this.balls.values()) ball.material.dispose();
    for (const line of this.lines.values()) line.geometry.dispose();
    this.ballGeometry.dispose();
    this.linkMaterial.dispose();
    this.selectedLinkMaterial.dispose();
    this.root.removeFromParent();
    this.bones.clear();
    this.balls.clear();
    this.lines.clear();
    this.shapeMatrices.clear();
    this.skeleton = null;
    this.linkBones = [];
    this.skinBones = [];
  }
}
