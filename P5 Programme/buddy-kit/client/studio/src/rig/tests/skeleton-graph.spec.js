// src/rig/tests/skeleton-graph.spec.js
// The skeleton the child builds: a joint graph with no three.js in it (task 014, spec §1). Every
// joint belongs to a shape (owner ruling 2): the graph stores the shape's id and the joint's
// position in that shape's local frame, and never learns what a shape is.
import { SkeletonGraph, toBones } from '../skeleton-graph.js';

const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(String(e.message)); } };

export default function (check) {
  // --- adding joints grows chains; the first joint of a chain has no parent ---
  {
    const g = new SkeletonGraph();
    const a = g.add([0, 0, 0], null, 1);
    const b = g.add([0, 1, 0], a, 1);
    const c = g.add([0, 2, 0], b, 1);
    check('graph: ids count up from j1', a === 'j1' && b === 'j2' && c === 'j3');
    check('graph: a root has no parent', g.get(a).parent === null && g.get(b).parent === a);
    check('graph: size counts joints', g.size === 3 && g.has('j2') && !g.has('j9'));
    check('graph: children lists direct children only', g.children(a).join() === 'j2' && g.children(c).length === 0);
    check('graph: an unknown parent is refused', throws(() => g.add([1, 1, 1], 'nope', 1), /unknown parent/));
    check('graph: a bad position is refused', throws(() => g.add([1, NaN, 1], null, 1), /three finite numbers/) && throws(() => g.add([1, 2], null, 1), /three finite numbers/));
    check('graph: a joint needs a shape', throws(() => g.add([1, 1, 1], null), /joint needs a shape/) && throws(() => g.add([1, 1, 1], null, 'tube'), /joint needs a shape/) && throws(() => g.add([1, 1, 1], null, 1.5), /joint needs a shape/));
    check('graph: a joint remembers its shape', g.get(a).shape === 1 && g.get(c).shape === 1 && g.add([0, 0, 0], null, 7) === 'j4' && g.get('j4').shape === 7);
  }

  // --- moving a joint changes only that joint ---
  {
    const g = new SkeletonGraph();
    const a = g.add([0, 0, 0], null, 1);
    const b = g.add([0, 1, 0], a, 1);
    g.move(b, [0.5, 1.5, -0.2]);
    const j = g.get(b);
    check('graph: move writes the new position', j.x === 0.5 && j.y === 1.5 && j.z === -0.2 && g.get(a).y === 0);
    check('graph: move keeps the shape', j.shape === 1 && j.parent === a);
    check('graph: moving an unknown joint is refused', throws(() => g.move('j7', [0, 0, 0]), /unknown joint/));
  }

  // --- removing a joint removes everything hanging off it (spec §1) ---
  {
    const g = new SkeletonGraph();
    const a = g.add([0, 0, 0], null, 1);
    const b = g.add([0, 1, 0], a, 1);
    const c = g.add([0, 2, 0], b, 1);
    const d = g.add([1, 1, 0], b, 1);
    const e = g.add([-1, 0, 0], a, 1);
    const gone = g.remove(b);
    check('graph: remove returns the subtree, joint first', gone[0] === b && gone.length === 3 && gone.includes(c) && gone.includes(d));
    check('graph: the rest of the graph survives', g.size === 2 && g.has(a) && g.has(e) && g.children(a).join() === e);
    check('graph: removing a root removes its chain', g.remove(a).length === 2 && g.size === 0);
    check('graph: removing an unknown joint is refused', throws(() => g.remove('j1'), /unknown joint/));
  }

  // --- roots and subtree order ---
  {
    const g = new SkeletonGraph();
    const a = g.add([0, 0, 0], null, 1);
    g.add([0, 1, 0], a, 1);
    const r2 = g.add([5, 0, 0], null, 1);
    g.add([5, 1, 0], r2, 1);
    check('graph: roots lists every chain start in order', g.roots().join() === `${a},${r2}`);
    check('graph: subtree is depth-first from the joint', g.subtree(a).join() === 'j1,j2');
  }

  // --- the pose is a rotation per joint, stored as data ---
  {
    const g = new SkeletonGraph();
    const a = g.add([0, 0, 0], null, 1);
    const b = g.add([0, 1, 0], a, 1);
    const q = [0, 0.7071, 0, 0.7071];
    g.setPose(b, q);
    q[0] = 9; // the graph must hold its own copy
    check('graph: setPose stores a copy', g.pose.get(b)[0] === 0 && g.pose.size === 1);
    g.setPose(b, null);
    check('graph: setPose(null) forgets the rotation', g.pose.size === 0);
    g.setPose(a, [0, 0, 0, 1]);
    g.clearPose();
    check('graph: clearPose empties the pose', g.pose.size === 0);
    check('graph: a pose on an unknown joint is refused', throws(() => g.setPose('j9', [0, 0, 0, 1]), /unknown joint/));
  }

  // --- structureKey changes with joints, positions and shapes, not with the pose ---
  {
    const g = new SkeletonGraph();
    const a = g.add([0, 0, 0], null, 1);
    const k1 = g.structureKey();
    g.setPose(a, [0, 1, 0, 0]);
    check('graph: the pose does not change the structure key', g.structureKey() === k1);
    g.move(a, [0, 0.1, 0]);
    check('graph: a move changes the structure key', g.structureKey() !== k1);
    const other = new SkeletonGraph();
    other.add([0, 0.1, 0], null, 2);
    check('graph: the shape is part of the structure key', other.structureKey() !== g.structureKey() && /:1$|:1\|/.test(g.structureKey()));
  }

  // --- serialise and restore, ids keep counting ---
  {
    const g = new SkeletonGraph();
    const a = g.add([0, 0, 0], null, 1);
    const b = g.add([0, 1, 0], a, 3);
    g.setPose(b, [0, 0, 0.5, 0.866]);
    const json = JSON.parse(JSON.stringify(g.toJSON()));
    check('graph: toJSON is plain data, shape included', Array.isArray(json.joints) && json.joints[1].parent === a && json.joints[1].shape === 3 && json.joints[0].shape === 1 && json.pose[b][2] === 0.5 && json.nextId === 3);
    const back = SkeletonGraph.fromJSON(json);
    check('graph: fromJSON restores joints, shapes and pose', back.size === 2 && back.get(b).parent === a && back.get(b).shape === 3 && back.pose.get(b)[3] === 0.866);
    check('graph: ids continue after a restore', back.add([1, 1, 1], null, 1) === 'j3');
    check('graph: fromJSON rejects a joint without a shape', throws(() => SkeletonGraph.fromJSON({ joints: [{ id: 'j1', x: 0, y: 0, z: 0, parent: null, shape: 1 }, { id: 'j3', x: 0, y: 1, z: 0, parent: 'j1' }], pose: {}, nextId: 4 }), /joint j3 has no shape/));
    check('graph: fromJSON rejects an unknown parent', throws(() => SkeletonGraph.fromJSON({ joints: [{ id: 'j1', x: 0, y: 0, z: 0, parent: 'j5', shape: 1 }], pose: {}, nextId: 2 }), /unknown parent/));
    check('graph: fromJSON rejects a cycle', throws(() => SkeletonGraph.fromJSON({ joints: [{ id: 'j1', x: 0, y: 0, z: 0, parent: 'j2', shape: 1 }, { id: 'j2', x: 0, y: 1, z: 0, parent: 'j1', shape: 1 }], pose: {}, nextId: 3 }), /cycle|unknown parent/));
    check('graph: fromJSON of an empty document is an empty graph', SkeletonGraph.fromJSON({ joints: [], pose: {}, nextId: 1 }).size === 0);
    check('graph: fromJSON tolerates a missing pose and nextId', SkeletonGraph.fromJSON({ joints: [{ id: 'j4', x: 0, y: 0, z: 0, parent: null, shape: 1 }] }).add([0, 1, 0], null, 1) === 'j5');
    check('graph: validate is happy with a good graph', g.validate().ok === true && g.validate().problems.length === 0);
  }

  // --- toBones: links between joints, head at the parent, tail at the child ---
  {
    const g = new SkeletonGraph();
    check('bones: no joints, no bones', toBones(g).length === 0);
    const a = g.add([0, 0, 0], null, 1);
    check('bones: one joint, no bones (the UI must handle this state)', toBones(g).length === 0);
    const b = g.add([0, 1, 0], a, 1);
    const c = g.add([0, 2, 0.5], b, 1);
    const bones = toBones(g);
    check('bones: a chain of three joints yields two bones', bones.length === 2);
    check('bones: the first bone runs from j1 to j2 and has no parent',
      bones[0].name === b && bones[0].from === a && bones[0].head.join() === '0,0,0' && bones[0].tail.join() === '0,1,0' && bones[0].parent === null);
    check('bones: the second bone runs from j2 to j3 and its parent is the first',
      bones[1].name === c && bones[1].from === b && bones[1].head.join() === '0,1,0' && bones[1].tail.join() === '0,2,0.5' && bones[1].parent === b);
    const d = g.add([1, 0, 0], a, 1);
    check('bones: a branch from the root is a second parentless bone', toBones(g).find((x) => x.name === d).parent === null);
    check('bones: heads and tails are copies, not the joint objects', !Array.isArray(g.get(a)) && bones[0].head !== bones[0].tail);
    // the rig resolves each joint into document space; the graph just asks the resolver
    const shifted = toBones(g, (j) => [j.x + 10, j.y, j.z]);
    check('bones: a resolver supplies the frame the heads and tails are in', shifted[0].head.join() === '10,0,0' && shifted[0].tail.join() === '10,1,0' && shifted[1].tail.join() === '10,2,0.5' && g.get(a).x === 0);
  }
}
