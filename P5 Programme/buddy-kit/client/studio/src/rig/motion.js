import * as THREE from 'three';
import { bakeFootContacts } from './motion-contact.js';

/** Guess proximal leg segments from low terminal joints, in document coordinates. Editable hints. */
export function detectLegs(graph, worldOf) {
  const positions = new Map(graph.joints.map((j) => [j.id, worldOf(j.id)]));
  if (!positions.size) return [];
  const ys = [...positions.values()].map((p) => p[1]);
  const low = Math.min(...ys), height = Math.max(...ys) - low;
  if (height < 1e-6) return [];
  const candidates = new Set();
  for (const leaf of graph.joints) {
    if (graph.children(leaf.id).length || positions.get(leaf.id)[1] > low + height * 0.25) continue;
    let joint = leaf, chosen = null;
    while (joint.parent !== null) {
      const parent = graph.get(joint.parent);
      const y = positions.get(joint.id)[1], py = positions.get(parent.id)[1];
      if (py > low + height * 0.85 || y > py + height * 0.08) break;
      // Stop before promoting an already-found knee onto the body branch.
      if (chosen && graph.children(parent.id).length > 1) break;
      const children = graph.children(joint.id);
      const lowerDrop = children.reduce((drop, id) => Math.max(drop, y - positions.get(id)[1]), 0);
      // A knee must have a lower leg. Short thighs still work when the shin
      // provides the downward evidence; a terminal foot never does.
      if (children.length && (py - y > height * .08 || (!chosen && py - y > height * .01 && lowerDrop > height * .08))) chosen = joint.id;
      if (graph.children(parent.id).length > 1) break;
      joint = parent;
    }
    if (chosen) candidates.add(chosen);
  }
  // One downward body link is not evidence of a leg (snowmen, trunks, tails). Be conservative;
  // a genuinely one-legged creature can still be assigned manually.
  if (candidates.size < 2) return [];
  return [...candidates].sort((a, b) => positions.get(a)[0] - positions.get(b)[0] || positions.get(a)[2] - positions.get(b)[2]);
}

/** Geometry-based role suggestions; callers can correct every assignment. */
export function detectMotionRoles(rig, forward = '+z') {
  const points = rig.graph.joints.map((j) => ({ j, p: rig.worldOf(j.id) }));
  const ys = points.map(({ p }) => p[1]), low = Math.min(...ys), height = Math.max(...ys) - low;
  const roots = points.filter(({ j }) => j.parent === null);
  const centre = roots.reduce((sum, { p }) => sum.add(new THREE.Vector3(...p)), new THREE.Vector3()).divideScalar(Math.max(1, roots.length));
  const legs = new Set(detectLegs(rig.graph, (id) => rig.worldOf(id)));
  const protectedIds = new Set();
  for (const leg of legs) {
    for (const id of rig.graph.subtree(leg)) protectedIds.add(id);
    let p = rig.graph.get(leg).parent;
    while (p !== null) { protectedIds.add(p); p = rig.graph.get(p).parent; }
  }
  const frontAxis = new THREE.Vector3(forward.endsWith('x') ? 1 : 0, 0, forward.endsWith('z') ? 1 : 0).multiplyScalar(forward.startsWith('-') ? -1 : 1);
  const sideAxis = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), frontAxis);
  const roles = {};
  for (const { j, p } of points) {
    if (j.parent === null || protectedIds.has(j.id)) continue;
    const delta = new THREE.Vector3(...p).sub(centre), offset = Math.abs(delta.dot(sideAxis));
    if (p[1] > low + height * .65 && offset < height * .22) roles[j.id] = 'head';
    else if (p[1] > low + height * .4 && offset > height * .16) roles[j.id] = 'arm';
    else if (delta.dot(frontAxis) < -height * .16 && offset < height * .18 && p[1] < low + height * .65) roles[j.id] = 'tail';
  }
  // Animate the first segment of each branch, not every segment cumulatively.
  for (const id of Object.keys(roles)) {
    let parent = rig.graph.get(id).parent;
    while (parent !== null) {
      if (roles[parent] === roles[id]) { delete roles[id]; break; }
      parent = rig.graph.get(parent).parent;
    }
  }
  return roles;
}

/** Smooth authored timing shared by every body shape. Values are dimensionless. */
function curve(t, keys) {
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [a, av] = keys[i - 1], [b, bv] = keys[i];
      const u = (t - a) / (b - a), eased = u * u * (3 - 2 * u);
      return av + (bv - av) * eased;
    }
  }
  return keys.at(-1)[1];
}

/** Reusable body motion plus optional limbs; seconds, radians and document units. */
export function motionClips(rig, { legs = [], knees = {}, forward = '+z', roles = detectMotionRoles(rig, forward), gait = 'auto', softness = .65, stride = 25, duration = 1.2 } = {}) {
  if (!rig?.skinBones.length) throw new Error('Finish rigging the model before animating it.');
  if (!['+z', '-z', '+x', '-x'].includes(forward) || !Number.isFinite(stride) || stride < 1 || stride > 60 || !Number.isFinite(duration) || duration < 0.4 || duration > 4) throw new Error('Invalid motion settings.');
  const unique = [...new Set(legs)];
  if (!['auto', 'step', 'waddle'].includes(gait) || !Number.isFinite(softness) || softness < 0 || softness > 1) throw new Error('Invalid movement style or softness.');
  if (gait === 'step' && !unique.length) throw new Error('Step needs leg segments. Use Waddle for a body without legs.');
  for (const [id, role] of Object.entries(roles)) {
    if (!['head', 'arm', 'tail'].includes(role) || !rig.graph.get(id)?.parent) throw new Error('A body role is invalid for this rig.');
  }
  for (const id of unique) {
    if (!rig.graph.get(id)?.parent || !rig.bones.has(id)) throw new Error('A selected leg is no longer in this rig.');
    if (unique.some((other) => other !== id && rig.graph.subtree(other).includes(id))) throw new Error('Choose one upper segment per leg, not both an upper and lower segment of the same leg.');
  }
  const axis = forward.endsWith('z') ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, -1);
  if (forward.startsWith('-')) axis.negate();
  const waddle = gait === 'waddle' || (gait === 'auto' && !unique.length);
  const forwardAxis = new THREE.Vector3(axis.z * -1, 0, axis.x);
  const sideAxis = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), forwardAxis);
  const angles = THREE.MathUtils.degToRad(stride), samples = 64;
  const times = Array.from({ length: samples + 1 }, (_, i) => duration * i / samples);
  const ys = rig.graph.joints.map((j) => rig.worldOf(j.id)[1]);
  const floor = Math.min(...ys), height = Math.max(1e-4, Math.max(...ys) - floor);
  const body = (kind, t) => {
    const phase = 2 * Math.PI * t;
    if (kind === 'Walk') return {
      roll: Math.sin(phase) * angles * (waddle ? .48 : .13),
      pitch: Math.sin(phase * 2) * angles * .06,
      // A small flexed stance leaves reach for contact correction instead of overextending legs.
      lift: waddle ? (1 - Math.cos(phase * 2)) * height * .022 : ((1 - Math.cos(phase * 2)) * .006 - .035) * height,
      sway: Math.sin(phase) * height * (waddle ? .045 : .015),
      squash: 1 - (1 - Math.cos(phase * 2)) * softness * .018,
    };
    return {
      roll: 0,
      pitch: curve(t, [[0, 0], [.15, -.16], [.3, .12], [.55, -.04], [.76, .15], [.9, -.05], [1, 0]]) * angles,
      lift: curve(t, [[0, 0], [.2, 0], [.48, 1], [.72, 0], [.85, .04], [1, 0]]) * height * .32,
      sway: 0,
      squash: 1 + curve(t, [[0, 0], [.15, -.16], [.28, .1], [.5, 0], [.74, -.2], [.88, .05], [1, 0]]) * softness,
    };
  };
  const build = (kind) => {
    const tracks = [];
    unique.forEach((id, index) => {
      const values = [];
      for (let i = 0; i <= samples; i++) {
        const t = i / samples;
        const phase = unique.length % 2 === 0 ? (index % 2) * Math.PI : index * 2 * Math.PI / unique.length;
        const angle = kind === 'Walk' ? Math.sin(2 * Math.PI * t + phase) * angles : curve(t, [[0, 0], [.15, -.65], [.3, .15], [.55, .1], [.74, -.8], [.9, .1], [1, 0]]) * angles;
        values.push(...new THREE.Quaternion().setFromAxisAngle(axis, angle).toArray());
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(`${rig.bones.get(id).name}.quaternion`, times, values));
    });
    for (const [id, role] of Object.entries(roles)) {
      if (unique.includes(id)) continue;
      const values = [];
      const p = new THREE.Vector3(...rig.worldOf(id));
      const centre = new THREE.Vector3(...rig.worldOf(rig.graph.roots()[0]));
      const side = Math.sign(p.sub(centre).dot(sideAxis)) || 1;
      for (let i = 0; i <= samples; i++) {
        const t = i / samples, phase = 2 * Math.PI * t;
        const b = body(kind, t);
        const lag = kind === 'Walk' ? Math.sin(phase - .55) : curve(t, [[0, 0], [.2, -.5], [.38, 1], [.62, .3], [.8, -.7], [.94, .1], [1, 0]]);
        const q = role === 'tail' ? new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), lag * angles * .3)
          .multiply(new THREE.Quaternion().setFromAxisAngle(axis, -b.pitch * .6)) : role === 'head'
          ? new THREE.Quaternion().setFromAxisAngle(forwardAxis, -b.roll * .65 + (kind === 'Walk' ? Math.sin(phase - .5) * angles * softness * .12 : 0)).multiply(new THREE.Quaternion().setFromAxisAngle(axis, lag * angles * softness * .18))
          : new THREE.Quaternion().setFromAxisAngle(axis, lag * angles * (kind === 'Walk' ? side * .5 : -.8));
        values.push(...q.toArray());
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(`${rig.bones.get(id).name}.quaternion`, times, values));
    }
    for (const id of rig.graph.roots()) {
      const bone = rig.bones.get(id), values = [], rotations = [], scales = [];
      const pivot = new THREE.Vector3(bone.position.x, floor, bone.position.z);
      for (let i = 0; i <= samples; i++) {
        const t = i / samples;
        const b = body(kind, t);
        const q = new THREE.Quaternion().setFromAxisAngle(forwardAxis, b.roll).multiply(new THREE.Quaternion().setFromAxisAngle(axis, b.pitch));
        const scale = new THREE.Vector3(1 / Math.sqrt(b.squash), b.squash, 1 / Math.sqrt(b.squash));
        const position = bone.position.clone().sub(pivot).multiply(scale).applyQuaternion(q).add(pivot).addScaledVector(sideAxis, b.sway);
        position.y += b.lift;
        values.push(...position.toArray()); rotations.push(...q.toArray()); scales.push(...scale.toArray());
      }
      tracks.push(new THREE.VectorKeyframeTrack(`${bone.name}.position`, times, values));
      tracks.push(new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, times, rotations));
      tracks.push(new THREE.VectorKeyframeTrack(`${bone.name}.scale`, times, scales));
    }
    const clip = new THREE.AnimationClip(kind, duration, tracks);
    return waddle ? clip : bakeFootContacts(rig, clip, unique, forwardAxis, stride / 25, knees);
  };
  return [build('Walk'), build('Jump')];
}
