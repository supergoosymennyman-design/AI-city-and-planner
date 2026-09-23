import * as THREE from 'three';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { StudioScene } from '../src/scene.js';
import { buildCityChampion } from '../src/io/city-champion.js';

// Node needs the browser FileReader API used by Three's GLTFExporter.
globalThis.FileReader ||= class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(bytes => { this.result = bytes; this.onloadend?.(); }); }
};

const studio = new StudioScene();
const vertices = [], normals = [], colors = [], indices = [];
const palette = { body: 0x20b0aa, light: 0x69d7c5, face: 0xffdd9f, boot: 0x17334a, eye: 0x14283a, cheek: 0xf08370 };
function piece(geometry, pos, scale, color) {
  geometry.scale(...scale);
  geometry.translate(...pos);
  geometry.computeVertexNormals();
  const offset = vertices.length / 3, p = geometry.attributes.position, n = geometry.attributes.normal;
  const c = new THREE.Color(palette[color]);
  for (let i = 0; i < p.count; i++) {
    vertices.push(p.getX(i), p.getY(i), p.getZ(i));
    normals.push(n.getX(i), n.getY(i), n.getZ(i));
    colors.push(c.r, c.g, c.b);
  }
  for (const index of geometry.index.array) indices.push(index + offset);
  geometry.dispose();
}
function ball(at, size, color) { piece(new THREE.SphereGeometry(1, 14, 10), at, size, color); }
function limb(a, b, radius, color) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), mid = start.clone().add(end).multiplyScalar(.5);
  const geometry = new THREE.CylinderGeometry(1, 1, 1, 12, 5);
  geometry.scale(radius, start.distanceTo(end), radius);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.sub(start).normalize()));
  piece(geometry, mid.toArray(), [1, 1, 1], color);
}

// A small original biped, facing +Z; soles sit at Y=0.
ball([0, 1.37, 0], [.35, .42, .23], 'body');
ball([0, 1.88, 0], [.27, .26, .235], 'face');
ball([0, 1.68, .1], [.15, .08, .14], 'light');
for (const side of [-1, 1]) {
  ball([side * .1, 1.92, .213], [.033, .045, .022], 'eye');
  ball([side * .18, 1.82, .19], [.044, .025, .018], 'cheek');
  limb([side * .32, 1.62, 0], [side * .56, 1.32, .04], .105, 'body');
  limb([side * .56, 1.32, .04], [side * .65, 1.12, .08], .085, 'light');
  ball([side * .65, 1.1, .08], [.1, .1, .1], 'face');
  limb([side * .18, 1.06, 0], [side * .22, .55, 0], .145, 'body');
  limb([side * .22, .55, 0], [side * .22, .14, .02], .115, 'light');
  ball([side * .22, .095, .115], [.155, .095, .25], 'boot');
}
const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
geometry.setIndex(indices);
const body = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .78, metalness: 0, side: THREE.DoubleSide }));
body.name = 'Milo'; body.userData.kind = 'custom'; body.userData.geoCustom = true;
studio.addImported(body);
const rig = studio.ensureRig(), id = body.userData.id;
const joint = (p, parent) => rig.graph.add(p, parent, id);
const hips = joint([0, 1.05, 0], null);
const torso = joint([0, 1.65, 0], hips);
const head = joint([0, 2.06, 0], torso);
const legs = [], feet = [];
const armJoints = [];
for (const side of [-1, 1]) {
  const knee = joint([side * .22, .55, 0], hips);
  const foot = joint([side * .22, .13, .03], knee);
  joint([side * .22, .06, .25], foot);
  legs.push(knee); feet.push(foot);
  const elbow = joint([side * .56, 1.31, .04], torso);
  joint([side * .65, 1.1, .08], elbow);
  armJoints.push(elbow);
}
rig.rebuild();

// The same Studio skinning path as a hand-built character. Vertices blend to
// their two nearest link bones, which keeps elbows and knees flexible.
const segments = rig.linkBones.map((b, index) => ({ index, a: new THREE.Vector3(...b.head), z: new THREE.Vector3(...b.tail) }));
const skinIndex = new Uint16Array(vertices.length / 3 * 4), skinWeight = new Float32Array(skinIndex.length);
const point = new THREE.Vector3();
for (let i = 0; i < vertices.length / 3; i++) {
  point.set(vertices[i * 3], vertices[i * 3 + 1], vertices[i * 3 + 2]);
  const near = segments.map(s => {
    const line = s.z.clone().sub(s.a);
    const t = THREE.MathUtils.clamp(point.clone().sub(s.a).dot(line) / Math.max(line.lengthSq(), 1e-9), 0, 1);
    return { index: s.index, distance: point.distanceTo(s.a.clone().addScaledVector(line, t)) };
  }).sort((a, b) => a.distance - b.distance).slice(0, 2);
  const weights = near.map(n => 1 / Math.max(.025, n.distance) ** 3);
  const sum = weights.reduce((a, b) => a + b, 0);
  for (let k = 0; k < near.length; k++) { skinIndex[i * 4 + k] = near[k].index; skinWeight[i * 4 + k] = weights[k] / sum; }
}
rig.skinMesh(body, { skinIndex, skinWeight });
const settings = { legs, knees: Object.fromEntries(legs.map((leg, i) => [leg, { foot: feet[i], bend: 1, minFlex: 8, maxFlex: 120 }])), roles: { [head]: 'head', ...Object.fromEntries(armJoints.map(id => [id, 'arm'])) }, gait: 'step', softness: .55, stride: 22, duration: 1.15, forward: '+z' };
rig.graph.setMotion(settings);
const restore = rig.detachHelpers();
const { data, metadata } = await buildCityChampion(studio.group, rig, { championId: 'milo-city-demo', studioRevision: 1 });
restore();
const out = fileURLToPath(new URL('../../../../docs/workshop-studio-demo/milo-city-champion.glb', import.meta.url));
await mkdir(fileURLToPath(new URL('../../../../docs/workshop-studio-demo/', import.meta.url)), { recursive: true });
await writeFile(out, Buffer.from(data));
console.log(JSON.stringify({ out, bytes: data.byteLength, metadata }, null, 2));
