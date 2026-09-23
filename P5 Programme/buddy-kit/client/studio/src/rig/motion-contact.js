import * as THREE from 'three';

/** Bake contact-aware rotations into a clip, using a disposable bone-only copy of the rig. */
export function bakeFootContacts(rig, clip, legs, forward, amount, knees = {}) {
  if (!legs.length) return clip;
  const group = new THREE.Group(), bones = new Map();
  for (const [id, source] of rig.bones) {
    const bone = new THREE.Bone(); bone.name = source.name; bone.position.copy(source.position); bones.set(id, bone);
  }
  for (const j of rig.graph.joints) (j.parent === null ? group : bones.get(j.parent)).add(bones.get(j.id));
  const v = (id) => new THREE.Vector3(...rig.worldOf(id));
  const chains = legs.map((id) => {
    const children = rig.graph.children(id).sort((a, b) => v(a).y - v(b).y);
    const settings = knees[id] || {};
    let end = settings.foot || children[0];
    if (!rig.graph.subtree(id).includes(end) || end === id) throw new Error(`Leg ${id} needs a knee and a foot below it. Choose a higher knee segment or correct its foot.`);
    // Legacy mappings pointed to the lowest toe. The ankle is the FIRST joint below the knee;
    // combining a hock/toe into the shin makes a nominal knee limit anatomically meaningless.
    while (rig.graph.get(end).parent !== id) end = rig.graph.get(end).parent;
    const ids = [end];
    while (ids[0] !== id) ids.unshift(rig.graph.get(ids[0]).parent);
    const rest = v(end), offset = rest.clone().sub(v(rig.graph.get(end).parent));
    const reach = rest.distanceTo(v(rig.graph.get(id).parent));
    const upper = v(id).sub(v(rig.graph.get(id).parent)), lower = rest.clone().sub(v(id));
    if (upper.length() < 1e-6 || lower.length() < 1e-6) throw new Error(`Leg ${id} has a zero-length thigh or lower leg. Correct its joints before animating.`);
    const minFlex = settings.minFlex ?? 8, maxFlex = settings.maxFlex ?? 120, bend = settings.bend ?? 1;
    if (![1, -1].includes(bend) || !Number.isFinite(minFlex) || !Number.isFinite(maxFlex) || minFlex < 3 || maxFlex > 150 || minFlex >= maxFlex) throw new Error(`Invalid knee limits on ${id}.`);
    return { id, end, ids, toes: rig.graph.children(end), rest, offset, reach, upper, lower, minFlex, maxFlex, bend };
  });
  const centre = chains.reduce((sum, c) => sum.add(c.rest), new THREE.Vector3()).divideScalar(chains.length);
  const side = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), forward);
  const samplers = clip.tracks.map((track) => {
    const split = track.name.lastIndexOf('.');
    return { bone: group.getObjectByName(track.name.slice(0, split)), property: track.name.slice(split + 1), sample: track.createInterpolant() };
  });
  const count = 64, times = Array.from({ length: count + 1 }, (_, i) => clip.duration * i / count);
  const values = new Map(chains.flatMap((c) => [...c.ids, ...c.toes]).map((id) => [id, []]));
  let maxContactError = 0;
  const endpoint = (c) => bones.get(c.end).localToWorld(c.offset.clone());
  for (let frame = 0; frame <= count; frame++) {
    for (const [id, bone] of bones) { bone.position.copy(rig.bones.get(id).position); bone.quaternion.identity(); bone.scale.setScalar(1); }
    for (const s of samplers) s.bone[s.property].fromArray(s.sample.evaluate(times[frame]));
    group.updateMatrixWorld(true);
    for (let k = 0; k < chains.length; k++) {
      const c = chains[k], t = frame / count;
      const delta = c.rest.clone().sub(centre);
      const phase = chains.length === 4 ? (delta.dot(side) * delta.dot(forward) >= 0 ? 0 : .5)
        : chains.length === 2 ? k * .5 : k / chains.length;
      const step = (t + phase) % 1;
      const grounded = clip.name === 'Walk' ? step < .6 : t <= .2 || t >= .72;
      const target = clip.name !== 'Walk' && !grounded ? endpoint(c) : c.rest.clone();
      if (clip.name === 'Walk') {
        // In-place forward locomotion: contact travels front-to-back relative to
        // the body; the lifted foot returns back-to-front. A full sine during
        // swing retraces the path and reads as a backward step.
        const u = grounded ? step / .6 : (step - .6) / .4;
        const eased = u * u * (3 - 2 * u);
        target.addScaledVector(forward, (grounded ? 1 - 2 * eased : 2 * eased - 1) * c.reach * amount * .12);
        if (!grounded) target.y += Math.sin(u * Math.PI) ** 2 * c.reach * amount * .18;
      }
      const upperBone = bones.get(c.id), lowerBone = bones.get(c.ids[1]);
      const hip = upperBone.position.clone(), desired = upperBone.parent.worldToLocal(target.clone()).sub(hip);
      const a = c.upper.length(), b = c.lower.length();
      const reachAt = (degrees) => Math.sqrt(a * a + b * b + 2 * a * b * Math.cos(THREE.MathUtils.degToRad(degrees)));
      const distance = THREE.MathUtils.clamp(desired.length(), reachAt(c.maxFlex), reachAt(c.minFlex));
      const direction = desired.lengthSq() > 1e-12 ? desired.normalize() : c.upper.clone().add(c.lower).normalize();
      // The authored rest bend defines the knee's side. A straight chain needs an explicit fallback
      // pole (forward by default, reversible in the panel), never a fresh guess on each frame.
      const restAxis = c.upper.clone().add(c.lower).normalize();
      let pole = c.upper.clone().addScaledVector(restAxis, -c.upper.dot(restAxis));
      if (pole.lengthSq() < 1e-8) pole.copy(forward);
      pole.addScaledVector(direction, -pole.dot(direction));
      if (pole.lengthSq() < 1e-8) pole.copy(side).addScaledVector(direction, -side.dot(direction));
      pole.normalize().multiplyScalar(c.bend);
      const along = (a * a - b * b + distance * distance) / (2 * distance);
      const middle = direction.clone().multiplyScalar(along).addScaledVector(pole, Math.sqrt(Math.max(0, a * a - along * along)));
      upperBone.quaternion.setFromUnitVectors(c.upper.clone().normalize(), middle.clone().normalize());
      const lowerDirection = direction.clone().multiplyScalar(distance).sub(middle).applyQuaternion(upperBone.quaternion.clone().invert()).normalize();
      lowerBone.quaternion.setFromUnitVectors(c.lower.clone().normalize(), lowerDirection);
      group.updateMatrixWorld(true);
      // Keep trailing foot segments oriented consistently through lift-off too; switching this
      // correction on only at touchdown produces an ankle snap even with a well-behaved knee.
      for (const id of c.toes) {
        const toe = bones.get(id);
        toe.quaternion.copy(toe.parent.getWorldQuaternion(new THREE.Quaternion()).invert());
      }
      group.updateMatrixWorld(true);
      if (grounded) maxContactError = Math.max(maxContactError, endpoint(c).distanceTo(target));
    }
    for (const [id, output] of values) output.push(...bones.get(id).quaternion.toArray());
  }
  const replaced = new Set([...values.keys()].map((id) => `${bones.get(id).name}.quaternion`));
  const tracks = clip.tracks.filter((track) => !replaced.has(track.name));
  for (const [id, output] of values) tracks.push(new THREE.QuaternionKeyframeTrack(`${bones.get(id).name}.quaternion`, times, output));
  const baked = new THREE.AnimationClip(clip.name, clip.duration, tracks);
  baked.contactError = maxContactError; // verification seam, in document units; not a visual-quality score
  return baked;
}
