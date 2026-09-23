// Restore a single-mesh model's original detail using the EXISTING weight-transfer code.
// Usage: node checks/auto-rig-detail.mjs original.glb rigged-proxy.glb output.glb
// Local prototype utility, not a UI integration. Inputs must describe the same model/frame.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { transferWeights } from '../src/rig/transfer-weights.js';
import { buildGLB } from '../src/io/gltf.js';

const [originalPath, proxyPath, outputPath] = process.argv.slice(2);
if (!outputPath || [originalPath, proxyPath].some((p) => path.resolve(p) === path.resolve(outputPath))) {
  throw new Error('Provide original.glb, rigged-proxy.glb and a separate output.glb path.');
}
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then((result) => { this.result = result; this.onloadend?.(); }); }
};
async function load(file) {
  const bytes = await readFile(file);
  return (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
}
const original = await load(originalPath);
const proxy = await load(proxyPath);
original.updateMatrixWorld(true);
proxy.updateMatrixWorld(true);
const fine = [], coarse = [];
original.traverse((o) => { if (o.isMesh) fine.push(o); });
proxy.traverse((o) => { if (o.isMesh) coarse.push(o); });
if (fine.length !== 1 || coarse.length !== 1 || !coarse[0].isSkinnedMesh || fine[0].isSkinnedMesh) {
  throw new Error('This prototype detail-transfer check requires one plain original mesh and one skinned proxy mesh.');
}
const source = coarse[0];
const surface = source.geometry;
if (!surface.index) throw new Error('The rigged proxy needs indexed triangles.');
const geometry = fine[0].geometry.clone().applyMatrix4(new THREE.Matrix4().copy(source.matrixWorld).invert().multiply(fine[0].matrixWorld));
const transferred = transferWeights({ position: surface.attributes.position.array, index: surface.index.array }, {
  skinIndex: surface.attributes.skinIndex.array, skinWeight: surface.attributes.skinWeight.array,
}, geometry.attributes.position.array);
geometry.computeBoundingBox();
const diagonal = geometry.boundingBox.getSize(new THREE.Vector3()).length();
if (transferred.stats.worstDistance > diagonal * 0.05) throw new Error('The proxy and original are too far apart to transfer this rig reliably.');
geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(transferred.skinIndex, 4));
geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(transferred.skinWeight, 4));
source.geometry = geometry;
source.material = fine[0].material;
source.skeleton.update();
let maxRestDrift = 0;
for (let i = 0; i < geometry.attributes.position.count; i++) {
  const p = new THREE.Vector3().fromBufferAttribute(geometry.attributes.position, i);
  const posed = source.applyBoneTransform(i, p.clone());
  if (!posed.toArray().every(Number.isFinite)) throw new Error('Transferred rig produced non-finite vertices.');
  maxRestDrift = Math.max(maxRestDrift, p.distanceTo(posed));
}
if (maxRestDrift > diagonal * 1e-4) throw new Error('The transferred rig moved the original surface at rest.');
await writeFile(outputPath, Buffer.from(await buildGLB(proxy)), { flag: 'wx' });
const report = { vertices: geometry.attributes.position.count, joints: source.skeleton.bones.length, maxRestDrift, transfer: transferred.stats };
await writeFile(outputPath + '.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
