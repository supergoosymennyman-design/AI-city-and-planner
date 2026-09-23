// Live feasibility check, deliberately separate from the child's UI until a provider passes.
// Run from the studio: node checks/auto-rig-probe.mjs faisal dev/inputs/dino.glb
// Or: node checks/auto-rig-probe.mjs jasongzy dev/inputs/dino.glb
// Add --coarse for a temporary lightweight upload; the original stays untouched.
// Uploads ONLY the named model to the named public Hugging Face Space.
// Uses HF_TOKEN or the Hugging Face CLI's cached login; never writes the credential.
import { Client, handle_file } from '@gradio/client';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';

const providers = {
  faisal: { space: 'Faisal786U/unirig-api', endpoint: '/rig_model', payload: (file) => ({ input_glb: file }) },
  jasongzy: { space: 'jasongzy/UniRig', endpoint: '/process_pipeline', payload: (file) => ({ input_path: file, output_format: 'glb' }) },
};
const [key, input, option] = process.argv.slice(2);
if (!providers[key] || !input || path.extname(input).toLowerCase() !== '.glb') {
  console.error('Usage: node checks/auto-rig-probe.mjs <faisal|jasongzy> <model.glb> [--coarse]');
  process.exit(2);
}
if (option && option !== '--coarse') throw new Error('The only optional argument is --coarse.');
const provider = providers[key];
const output = path.resolve('dev/auto-rig', key, path.basename(input, '.glb'));
await mkdir(output, { recursive: true });
const started = Date.now();
const report = { provider: provider.space, endpoint: provider.endpoint, input: path.basename(input), started: new Date().toISOString(), events: [], passed: false };
let job;
let client;
let deadline;

function inspectGLB(bytes) {
  if (bytes.length < 20 || bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) {
    throw new Error('Provider did not return a complete GLB 2 file.');
  }
  const size = bytes.readUInt32LE(12);
  if (bytes.readUInt32LE(16) !== 0x4e4f534a || size > bytes.length - 20) throw new Error('Invalid GLB JSON chunk.');
  const json = JSON.parse(bytes.subarray(20, 20 + size).toString('utf8'));
  const skins = json.skins || [];
  const nodes = json.nodes || [];
  const skinned = nodes.filter((n) => Number.isInteger(n.skin) && Number.isInteger(n.mesh));
  if (!skins.length || !skinned.length) throw new Error('Output contains no skinned model.');
  for (const node of skinned) {
    const skin = skins[node.skin];
    if (!skin?.joints?.length || !skin.joints.every((i) => Number.isInteger(i) && nodes[i])) throw new Error('Invalid skeleton joints.');
    const primitives = json.meshes?.[node.mesh]?.primitives;
    if (!primitives?.length || primitives.some((p) => !Number.isInteger(p.attributes?.JOINTS_0) || !Number.isInteger(p.attributes?.WEIGHTS_0))) {
      throw new Error('Output mesh is missing joint indices or skin weights.');
    }
  }
  return { skins: skins.length, skinnedMeshes: skinned.length, jointsPerSkin: skins.map((s) => s.joints.length), bytes: bytes.length };
}

async function probe() {
  let bytes = await readFile(input);
  report.inputBytes = bytes.length;
  if (option === '--coarse') {
    const THREE = await import('three');
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const { coarseCopy } = await import('../src/rig/coarse.js');
    const { buildGLB } = await import('../src/io/gltf.js');
    globalThis.FileReader ??= class {
      readAsArrayBuffer(blob) { blob.arrayBuffer().then((result) => { this.result = result; this.onloadend?.(); }); }
    };
    const { scene } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const meshes = [];
    scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
    // This CLI trial is intentionally limited to the proven single-mesh input path.
    if (meshes.length !== 1 || meshes[0].isSkinnedMesh) throw new Error('--coarse requires one unrigged mesh.');
    const mesh = meshes[0], old = mesh.geometry;
    const copy = coarseCopy({ position: old.attributes.position.array, index: old.index?.array || Uint32Array.from({ length: old.attributes.position.count }, (_, i) => i) }, { target: 5000 });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(copy.position, 3));
    geometry.setIndex(new THREE.BufferAttribute(copy.index, 1));
    geometry.computeVertexNormals();
    mesh.geometry = geometry;
    // Rigging needs geometry; omit texture/UV dependencies from the temporary upload.
    mesh.material = new THREE.MeshStandardMaterial({ color: 0xaaaaaa });
    bytes = Buffer.from(await buildGLB(scene));
    report.reduction = copy.stats;
    await writeFile(path.join(output, 'upload-proxy.glb'), bytes);
  }
  report.uploadBytes = bytes.length;
  let token = process.env.HF_TOKEN?.trim();
  if (!token) {
    const tokenPath = process.env.HF_TOKEN_PATH || path.join(process.env.HF_HOME || path.join(homedir(), '.cache', 'huggingface'), 'token');
    try { token = (await readFile(tokenPath, 'utf8')).trim(); }
    catch (error) { if (error.code !== 'ENOENT') throw new Error('Could not read the Hugging Face login token file.'); }
  }
  report.credentialsProvided = !!token;
  console.log(`Uploading ${path.basename(input)} (${bytes.length} bytes) to ${provider.space}`);
  client = await Client.connect(provider.space, {
    events: ['data', 'status'],
    ...(token ? { token } : {}),
  });
  const info = await client.view_api();
  const endpoint = info.named_endpoints[provider.endpoint];
  if (!endpoint) throw new Error(`Provider no longer publishes ${provider.endpoint}.`);
  report.parameters = endpoint.parameters.map((p) => p.parameter_name);
  const file = handle_file(new File([bytes], path.basename(input), { type: 'model/gltf-binary' }));
  job = client.submit(provider.endpoint, provider.payload(file));
  let result;
  for await (const event of job) {
    if (event.type === 'status') {
      const status = { seconds: Math.round((Date.now() - started) / 1000), stage: event.stage, message: event.message || '', position: event.position };
      report.events.push(status);
      console.log(JSON.stringify(status));
      if (event.stage === 'error' || event.success === false) throw new Error(event.message || 'Provider reported an inference error.');
    }
    if (event.type === 'data') result = event.data;
  }
  if (!result?.[0]?.url) throw new Error(typeof result?.[1] === 'string' ? result[1] : 'Provider finished without a rigged file.');
  // The provider's returned asset URL supplies the download, never our HF credential.
  const url = new URL(result[0].url);
  if (url.protocol !== 'https:') throw new Error('Provider returned a non-HTTPS asset URL.');
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Rig download returned HTTP ${response.status}.`);
  const rigged = Buffer.from(await response.arrayBuffer());
  report.structure = inspectGLB(rigged);
  await writeFile(path.join(output, 'rigged.glb'), rigged);
  report.passed = true;
  report.note = 'Structural check only. Browser import, deformation, appearance and unusual-creature quality still require verification.';
}

try {
  await Promise.race([probe(), new Promise((_, reject) => {
    deadline = setTimeout(() => reject(new Error('Live inference exceeded the 240-second check limit.')), 240000);
  })]);
} catch (error) {
  report.error = String(error.message || error).replace(/hf_[A-Za-z0-9]+/g, '[redacted]').slice(0,12000);
  console.error(report.error);
  try { Promise.resolve(job?.cancel()).catch(() => {}); } catch { /* best effort: no successful result is assumed */ }
} finally {
  clearTimeout(deadline);
  try { client?.close(); } catch { /* sockets must not keep a failed check open */ }
  report.seconds = Math.round((Date.now() - started) / 1000);
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`Report: ${path.join(output, 'report.json')}`);
  process.exit(report.passed ? 0 : 1);
}
