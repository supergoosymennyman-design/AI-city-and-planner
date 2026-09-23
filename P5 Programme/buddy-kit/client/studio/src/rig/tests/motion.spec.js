import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { StudioScene } from '../../scene.js';
import { SkeletonGraph } from '../skeleton-graph.js';
import { detectLegs, detectMotionRoles, motionClips } from '../motion.js';
import { addTubeShape, bindNow } from './fixtures.js';
import { buildGLB } from '../../io/gltf.js';

const results = [];
const check = (name, ok) => results.push([name, ok]);
const snowman = new SkeletonGraph();
const waist = snowman.add([0, 0.65, 0], null, 1);
snowman.add([0, 0, 0], waist, 1);
snowman.add([0, 1.7, 0], waist, 1);
for (const side of [-1, 1]) {
  const shoulder = snowman.add([side * .35, 1.1, 0], waist, 1);
  snowman.add([side * .8, 1.2, 0], shoulder, 1);
}
check('motion: snowman body and arms are not auto-selected as legs', detectLegs(snowman, (id) => { const j = snowman.get(id); return [j.x, j.y, j.z]; }).length === 0);
const snowRoles = detectMotionRoles({ graph: snowman, worldOf: (id) => { const j = snowman.get(id); return [j.x, j.y, j.z]; } });
check('motion: geometry suggests one head and two proximal arms on snowman', Object.values(snowRoles).filter((r) => r === 'head').length === 1 && Object.values(snowRoles).filter((r) => r === 'arm').length === 2);
for (const count of [2, 3, 4]) {
  const graph = new SkeletonGraph();
  const root = graph.add([0, 1.3, 0], null, 1);
  graph.add([0, 2, 0], root, 1);
  const legs = [];
  for (let i = 0; i < count; i++) {
    const x = Math.cos(i * Math.PI * 2 / count) * 0.3;
    const z = Math.sin(i * Math.PI * 2 / count) * 0.3;
    const knee = graph.add([x, 0.6, z], root, 1); legs.push(knee);
    graph.add([x, 0, z], knee, 1);
  }
  const found = detectLegs(graph, (id) => { const j = graph.get(id); return [j.x, j.y, j.z]; });
  check(`motion: detects ${count} legs without a humanoid template`, found.length === count && legs.every((id) => found.includes(id)));
}
const s = new StudioScene(), mesh = addTubeShape(s);
// Short upper legs under a tall body: the old height threshold selected terminal
// feet as knees, so Play threw instead of starting either animation.
{
  const graph = new SkeletonGraph();
  const spine = graph.add([0, 1, 0], null, 1);
  graph.add([0, 3, 0], spine, 1);
  const expected = [];
  for (const x of [-.3, .3]) for (const z of [-.5, .5]) {
    const hip = graph.add([x, .7, z], spine, 1);
    const knee = graph.add([x, .55, z], hip, 1); expected.push(knee);
    graph.add([x, 0, z], knee, 1);
  }
  const found = detectLegs(graph, id => { const j = graph.get(id); return [j.x, j.y, j.z]; });
  check('motion: short thighs select usable knees rather than terminal feet', found.length === 4 && expected.every(id => found.includes(id)));
}
const rig = s.ensureRig(), root = rig.graph.add([0, 1.5, 0], null, mesh.userData.id);
const leg = rig.graph.add([0, 0.5, 0], root, mesh.userData.id);
const foot = rig.graph.add([0, 0, 0], leg, mesh.userData.id);
rig.rebuild(); bindNow(s);
const clips = motionClips(rig, { legs: [leg] });
rig.graph.setMotion({ legs: [leg], roles: {}, gait: 'auto', softness: .65, forward: '+z', stride: 25, duration: 1.2 });
const saved = rig.graph.toJSON(), reopened = SkeletonGraph.fromJSON(saved);
check('motion: saved animation settings survive graph serialization', reopened.motion?.settings.legs[0] === leg);
reopened.move(foot, [0, -.1, 0]);
check('motion: editing skeleton invalidates stale animation mappings', !reopened.toJSON().motion);
check('motion: both named clips have non-empty tracks and duration', clips.map((c) => c.name).join() === 'Walk,Jump' && clips.every((c) => c.duration === 1.2 && c.tracks.length > 0));
const mixer = new THREE.AnimationMixer(s.group);
mixer.clipAction(clips[0]).play(); mixer.setTime(0.3);
rig.root.updateMatrixWorld(true);
const footPosition = rig.bones.get(foot).localToWorld(new THREE.Vector3(0, -.5, 0));
check('motion: stance foot stays at ground height as the body moves', Math.abs(footPosition.y) < .02);
check('motion: contact baking reports a bounded stance residual', clips[0].contactError < .02);
check('motion: baked leg tracks loop without a pose discontinuity', clips[0].tracks.every((track) => { const size = track.getValueSize(), v = track.values; return Array.from(v.slice(0, size)).every((value, i) => Math.abs(value - v[v.length - size + i]) < 1e-5); }));
mixer.stopAllAction();
const y = rig.bones.get(root).position.y;
mixer.clipAction(clips[1]).play(); mixer.setTime(0.6);
check('motion: Jump actually lifts the rig', rig.bones.get(root).position.y > y + 0.2);
mixer.stopAllAction();
check('motion: stopping restores the original root and rotations', Math.abs(rig.bones.get(root).position.y - y) < 1e-6 && Math.abs(rig.bones.get(leg).quaternion.x) < 1e-6);
const legless = motionClips(rig, { legs: [] });
check('motion: a legless model gets Walk and Jump', legless.map(c => c.name).join() === 'Walk,Jump');
mixer.clipAction(legless[0]).play(); mixer.setTime(.3);
check('motion: Waddle rocks and shifts the body without fake legs', Math.abs(rig.bones.get(root).quaternion.z) > .05 && Math.abs(rig.bones.get(root).position.x) > .02);
mixer.stopAllAction();
mixer.clipAction(legless[1]).play(); mixer.setTime(.18);
check('motion: Jump anticipates with compression before takeoff', rig.bones.get(root).scale.y < .95 && rig.bones.get(root).position.y < y);
mixer.setTime(.9);
check('motion: Jump compresses on landing', rig.bones.get(root).scale.y < .95);
mixer.stopAllAction();
check('motion: stopping also restores scale', rig.bones.get(root).scale.distanceTo(new THREE.Vector3(1, 1, 1)) < 1e-6);
check('motion: every track loops continuously', legless.every(c => c.tracks.every(track => { const size = track.getValueSize(), v = track.values; return Array.from(v.slice(0, size)).every((x, i) => Math.abs(x - v[v.length - size + i]) < 1e-5); })));
const doubled = { graph: rig.graph, skinBones: rig.skinBones, worldOf: (id) => rig.worldOf(id).map((v) => v * 2), bones: new Map([...rig.bones].map(([id, b]) => { const c = b.clone(false); c.position.multiplyScalar(2); return [id, c]; })) };
const large = motionClips(doubled, { legs: [], roles: {} });
const small = motionClips(rig, { legs: [], roles: {} });
const track = (clips) => clips[0].tracks.find((t) => t.name === `${root}.position`).values;
check('motion: same body curves scale to a different model size', Array.from(track(small)).every((v, i) => Math.abs(track(large)[i] - v * 2) < 1e-5));
let rejected = false;
try { motionClips(rig, { legs: [leg, foot] }); } catch { rejected = true; }
check('motion: rejects overlapping upper/lower selections', rejected);
const restore = rig.detachHelpers();
const bytes = await buildGLB(s.group, clips, rig.graph.toJSON()); restore();
const loaded = await new GLTFLoader().parseAsync(bytes, '');
check('motion: GLB round-trip contains both clips and a skin', loaded.animations.length === 2 && loaded.animations.some((c) => c.name === 'Walk') && loaded.animations.some((c) => c.name === 'Jump') && (() => { let skin = false; loaded.scene.traverse((o) => { skin ||= !!o.isSkinnedMesh; }); return skin; })());
const importedMixer = new THREE.AnimationMixer(loaded.scene);
const importedRoot = loaded.scene.getObjectByName(root), restY = importedRoot.position.y;
importedMixer.clipAction(loaded.animations.find((c) => c.name === 'Jump')).play(); importedMixer.setTime(0.6);
check('motion: exported Jump plays after reloading GLB', importedRoot.position.y > restY + 0.2);
importedMixer.stopAllAction();
importedMixer.clipAction(loaded.animations.find((c) => c.name === 'Walk')).play(); importedMixer.setTime(.3);
loaded.scene.updateMatrixWorld(true);
check('motion: exported Walk preserves stance height after GLB reload', Math.abs(loaded.scene.getObjectByName(foot).localToWorld(new THREE.Vector3(0, -.5, 0)).y) < .02);
importedMixer.stopAllAction();
// Check actual endpoint travel, including serialized animation, not quaternion signs.
const travel = (animationMixer, scene, footBone, clip, axis) => {
  animationMixer.clipAction(clip).play();
  const sample = (phase) => {
    animationMixer.setTime(clip.duration * phase); scene.updateMatrixWorld(true);
    return footBone.localToWorld(new THREE.Vector3(0, -.5, 0)).dot(axis);
  };
  const stance = sample(.45) - sample(.15), swing = sample(.9) - sample(.7);
  animationMixer.stopAllAction();
  return stance < -.05 && swing > .05;
};
check('motion: exported forward walk pushes back in stance and returns forward in swing', travel(importedMixer, loaded.scene, loaded.scene.getObjectByName(foot), loaded.animations.find(c => c.name === 'Walk'), new THREE.Vector3(0, 0, 1)));
for (const [forward, axis] of [['+z', [0, 0, 1]], ['-z', [0, 0, -1]], ['+x', [1, 0, 0]], ['-x', [-1, 0, 0]]]) {
  const walk = motionClips(rig, { legs: [leg], forward })[0];
  check(`motion: ${forward} facing controls stance and swing direction`, travel(mixer, s.group, rig.bones.get(foot), walk, new THREE.Vector3(...axis)));
}
let leastBend = Infinity, mostBend = 0, leastPole = Infinity;
for (const clip of loaded.animations) {
  importedMixer.clipAction(clip).play();
  for (let i = 0; i <= 128; i++) {
    importedMixer.setTime(clip.duration * i / 128); loaded.scene.updateMatrixWorld(true);
    const thigh = loaded.scene.getObjectByName(leg), shin = loaded.scene.getObjectByName(foot);
    const local = (p) => thigh.parent.worldToLocal(p);
    const hip = local(thigh.getWorldPosition(new THREE.Vector3()));
    const knee = local(shin.getWorldPosition(new THREE.Vector3()));
    const ankle = local(shin.localToWorld(new THREE.Vector3(0, -.5, 0)));
    const bend = THREE.MathUtils.radToDeg(knee.clone().sub(hip).angleTo(ankle.clone().sub(knee)));
    const axis = ankle.clone().sub(hip).normalize(), offset = knee.clone().sub(hip);
    const pole = offset.addScaledVector(axis, -offset.dot(axis));
    leastBend = Math.min(leastBend, bend); mostBend = Math.max(mostBend, bend); leastPole = Math.min(leastPole, pole.z);
  }
  importedMixer.stopAllAction();
}
check('motion: exported knees retain extension/flexion limits between baked samples', leastBend >= 7.5 && mostBend <= 120.5);
check('motion: exported knees never flip to the opposite bend side', leastPole > 0);
const reversed = motionClips(rig, { legs: [leg], knees: { [leg]: { foot, bend: -1, minFlex: 8, maxFlex: 120 } } });
mixer.clipAction(reversed[0]).play(); mixer.setTime(.3); rig.root.updateMatrixWorld(true);
const reversedKnee = rig.bones.get(leg).parent.worldToLocal(rig.bones.get(foot).getWorldPosition(new THREE.Vector3()));
check('motion: manual knee bend reversal changes the pole side', reversedKnee.z < 0);
mixer.stopAllAction();
export default function (assert) { for (const [name, ok] of results) assert(name, ok); }
