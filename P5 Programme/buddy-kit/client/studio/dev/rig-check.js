// Rig check page (dev only, not part of the build): load a generated model and a bone list,
// work out the bending with our bone-heat code in a Worker, skin the mesh in three.js and play
// the same tail / neck wave and walk that Blender showed, so the two can be compared by eye.
//
// A second model can be loaded as GEAR (?gear=). The gear is placed by ?gearFit=scale,tx,ty,tz,
// merged with the body for ONE bone-heat solve, then split back into its own skinned mesh sharing
// the same skeleton — which is how the studio would do it, the body and the gear staying separate
// objects. Bones named jaw / wing*_inner / wing*_outer get their own motion.
//
// Query: ?glb=<url>&bones=<url>&gear=<url>&gearFit=<scale,tx,ty,tz>
// Defaults: dev/inputs/dino.glb and dev/inputs/dino-bones.json, no gear.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const params = new URLSearchParams(location.search);
const GLB = params.get('glb') || './inputs/dino.glb';
const BONES = params.get('bones') || './inputs/dino-bones.json';
const GEAR = params.get('gear') || null;
const GEAR_FIT = (params.get('gearFit') || '1,0,0,0').split(',').map(Number);
// How the gear is bound: 'joints' puts it in the same bone-heat solve (it needs joints of its own,
// which is what a wing wants), 'transfer' copies the body's weights from underneath it (what a
// rigid prop like a helmet wants, and the only rule that works when the gear has no joints).
const GEAR_BIND = ['transfer', 'rigid'].includes(params.get('gearBind')) ? params.get('gearBind') : 'joints';
const state = { ready: false, errors: [], stats: null, playing: true, clay: false, time: 0 };
window.__rigCheck = state;
window.addEventListener('error', (e) => state.errors.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => state.errors.push(String(e.reason)));
const $ = (id) => document.getElementById(id);
const status = (text) => { $('status').textContent = text; };

const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x5c6169);
const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
camera.position.set(2.4, 1.3, 2.6);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x50555c, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 1.8);
sun.position.set(2, 4, 3);
scene.add(sun);
scene.add(new THREE.GridHelper(4, 16, 0x444a52, 0x4c525a).translateY(-0.8));
function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const rad = THREE.MathUtils.degToRad;
const qy = new THREE.Quaternion();
const qx = new THREE.Quaternion();
const qz = new THREE.Quaternion();

/** First mesh in a loaded glTF, as plain arrays. */
function firstMesh(gltf) {
  let found = null;
  gltf.scene.traverse((o) => { if (o.isMesh && !found) found = o; });
  return { position: found.geometry.attributes.position.array, index: found.geometry.index.array };
}

async function main() {
  status('Loading the model…');
  const loader = new GLTFLoader();
  const [gltf, bonesJson, gearGltf] = await Promise.all([
    loader.loadAsync(GLB),
    fetch(BONES).then((r) => r.json()),
    GEAR ? loader.loadAsync(GEAR) : null,
  ]);
  const body = firstMesh(gltf);
  const bones = bonesJson.bones;

  // Place the gear (uniform scale, then translate) and merge it with the body for ONE solve.
  let gear = null;
  if (gearGltf) {
    const raw = firstMesh(gearGltf);
    // Four numbers means one scale for all three axes; six means a separate scale per axis, which
    // generated gear usually needs — a helmet drawn for a person is far deeper than a dino's head.
    const [sx, sy, sz, tx, ty, tz] = GEAR_FIT.length >= 6
      ? GEAR_FIT
      : [GEAR_FIT[0], GEAR_FIT[0], GEAR_FIT[0], GEAR_FIT[1], GEAR_FIT[2], GEAR_FIT[3]];
    const position = new Float32Array(raw.position.length);
    for (let i = 0; i < raw.position.length; i += 3) {
      position[i] = raw.position[i] * sx + tx;
      position[i + 1] = raw.position[i + 1] * sy + ty;
      position[i + 2] = raw.position[i + 2] * sz + tz;
    }
    gear = { position, index: raw.index };
  }
  const bodyCount = body.position.length / 3;
  const inSolve = gear && GEAR_BIND === 'joints';
  let merged = body;
  if (inSolve) {
    const position = new Float32Array(body.position.length + gear.position.length);
    position.set(body.position, 0);
    position.set(gear.position, body.position.length);
    const index = new Uint32Array(body.index.length + gear.index.length);
    index.set(body.index, 0);
    for (let i = 0; i < gear.index.length; i++) index[body.index.length + i] = gear.index[i] + bodyCount;
    merged = { position, index };
  }

  status(`Working out the bending for ${merged.position.length / 3} points and ${bones.length} bones…`);
  const t0 = performance.now();
  const result = await new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./rig-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'progress') status(`Working out the bending… ${m.stage} ${Math.round(m.fraction * 100)}%`);
      else if (m.type === 'done') resolve(m);
      else reject(new Error(m.message));
    };
    worker.onerror = (e) => reject(new Error(e.message || 'worker failed'));
    worker.postMessage({
      position: merged.position.slice(),
      index: merged.index.slice(),
      bones: bones.map((b) => ({ head: b.head, tail: b.tail })),
    });
  });
  const workerMs = Math.round(performance.now() - t0);

  // Gear bound by transfer never entered the solve: it copies the weights of the body surface it
  // was placed on. Its own weights are appended so the rest of the page can treat them alike.
  let transferStats = null;
  if (gear && GEAR_BIND !== 'joints') {
    status('Copying the body weights onto the gear…');
    const { transferWeights } = await import('../src/rig/transfer-weights.js');
    const moved = transferWeights(body, result, gear.position, { rigid: GEAR_BIND === 'rigid' });
    transferStats = moved.stats;
    const gearCount = gear.position.length / 3;
    const skinIndex = new Uint16Array((bodyCount + gearCount) * 4);
    const skinWeight = new Float32Array((bodyCount + gearCount) * 4);
    skinIndex.set(result.skinIndex, 0);
    skinWeight.set(result.skinWeight, 0);
    skinIndex.set(moved.skinIndex, bodyCount * 4);
    skinWeight.set(moved.skinWeight, bodyCount * 4);
    result.skinIndex = skinIndex;
    result.skinWeight = skinWeight;
  }

  // Skeleton: one three.js Bone per bone, sitting at the bone's head, under its parent.
  const byName = new Map(bones.map((b, i) => [b.name, i]));
  const threeBones = bones.map((b) => { const bone = new THREE.Bone(); bone.name = b.name; return bone; });
  const rigRoot = new THREE.Group();
  bones.forEach((b, i) => {
    const bone = threeBones[i];
    if (b.parent != null) {
      const p = bones[byName.get(b.parent)];
      bone.position.set(b.head[0] - p.head[0], b.head[1] - p.head[1], b.head[2] - p.head[2]);
      threeBones[byName.get(b.parent)].add(bone);
    } else {
      bone.position.set(b.head[0], b.head[1], b.head[2]);
      rigRoot.add(bone);
    }
  });
  scene.add(rigRoot);
  rigRoot.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(threeBones);

  // one colour per bone (golden-angle hues, like the Blender picture), blended by weight
  const palette = bones.map((_, i) => new THREE.Color().setHSL((i * 0.618034) % 1, 0.75, 0.62));
  const meshes = [];

  /** One skinned mesh over the slice [from, from+count) of the merged solve. */
  function build(part, from, count, clayColour, twoSided) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(part.position, 3));
    geometry.setIndex(new THREE.BufferAttribute(Uint32Array.from(part.index), 1));
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(result.skinIndex.slice(from * 4, (from + count) * 4), 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(result.skinWeight.slice(from * 4, (from + count) * 4), 4));
    geometry.computeVertexNormals();
    const colour = new Float32Array(count * 3);
    for (let v = 0; v < count; v++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let k = 0; k < 4; k++) {
        const w = result.skinWeight[(from + v) * 4 + k];
        if (!w) continue;
        const c = palette[result.skinIndex[(from + v) * 4 + k]];
        r += w * c.r;
        g += w * c.g;
        b += w * c.b;
      }
      colour[v * 3] = r;
      colour[v * 3 + 1] = g;
      colour[v * 3 + 2] = b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colour, 3));
    const side = twoSided ? THREE.DoubleSide : THREE.FrontSide;
    const coloured = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0, side });
    const clay = new THREE.MeshStandardMaterial({ color: clayColour, roughness: 0.72, metalness: 0, side });
    const mesh = new THREE.SkinnedMesh(geometry, coloured);
    mesh.frustumCulled = false;
    scene.add(mesh);
    mesh.updateMatrixWorld(true);
    mesh.bind(skeleton);
    meshes.push({ mesh, coloured, clay });
  }

  build(body, 0, bodyCount, 0xd9a06a, false);
  if (gear) build(gear, bodyCount, gear.position.length / 3, 0x74b5ad, true);
  scene.add(new THREE.SkeletonHelper(rigRoot));

  // Which bones actually claimed the gear? Evidence for "does gear join the rig".
  let gearReport = '';
  if (gear) {
    const gearCount = gear.position.length / 3;
    const tally = new Map();
    for (let v = bodyCount; v < bodyCount + gearCount; v++) {
      const name = bones[result.skinIndex[v * 4]].name;
      tally.set(name, (tally.get(name) || 0) + 1);
    }
    const top = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    gearReport = `gear (${GEAR_BIND}): ${gearCount} points, strongest bone — ${top.map(([n, c]) => `${n} ${Math.round((c / gearCount) * 100)}%`).join(', ')}`;
    if (transferStats) {
      gearReport += `\ncopied from the body in ${transferStats.transferMs} ms (search tree ${transferStats.bvhMs} ms) · `
        + `gear sits ${transferStats.meanDistance} from the body on average, ${transferStats.worstDistance} at worst`;
      if (transferStats.socket) {
        gearReport += `\nthe whole piece rides one bone: ${bones[transferStats.socket.bone].name}`;
      }
    }
    state.gear = { count: gearCount, bind: GEAR_BIND, transfer: transferStats, dominant: Object.fromEntries(tally) };
  }

  // The same motion as the Blender check — an S-wave down the tail, a sway up the neck with a
  // small nod, the head counter-turning, the legs walking — plus a roar (jaw) and a wing flap.
  function pose(t, still = false) {
    const ph = (2 * Math.PI * t) / 3;
    const flap = (2 * Math.PI * t) / 1.2;
    for (const bone of threeBones) bone.quaternion.identity();
    const set = (name, aboutY, aboutX, aboutZ = 0) => {
      const i = byName.get(name);
      if (i == null) return;
      qy.setFromAxisAngle(Y, aboutY);
      qx.setFromAxisAngle(X, aboutX);
      qz.setFromAxisAngle(Z, aboutZ);
      threeBones[i].quaternion.copy(qy).multiply(qx).multiply(qz);
    };
    // `still` holds the animal steady so one part can be judged on its own.
    if (!still) {
      for (let i = 0; i < 9; i++) set(`tail${i + 1}`, rad(18) * Math.sin(ph - 0.6 * i), 0);
      for (let i = 0; i < 6; i++) set(`neck${i + 1}`, rad(14) * Math.sin(ph - 0.5 * i), rad(5) * Math.sin(2 * ph - 0.5 * i));
      set('head', rad(-20) * Math.sin(ph - 1.5), 0);
      for (const kind of ['front', 'back']) {
        for (const [side, off] of [['L', 0], ['R', Math.PI]]) {
          const o = off + (kind === 'back' ? Math.PI : 0);
          set(`${kind}${side}_upper`, 0, rad(20) * Math.sin(ph + o));
          set(`${kind}${side}_lower`, 0, rad(28) * Math.max(0, Math.cos(ph + o)));
        }
      }
    }
    // Roar: the mouth opens on the same slow cycle. A positive turn about X drops the chin.
    set('jaw', 0, rad(34) * Math.max(0, Math.sin(ph)));
    // Wings: the inner bone lifts, the outer follows a beat later. +Z raises the left wing.
    const beat = Math.sin(flap);
    const beat2 = Math.sin(flap - 0.7);
    set('wingL_inner', 0, 0, rad(26) * beat);
    set('wingR_inner', 0, 0, rad(-26) * beat);
    set('wingL_outer', 0, 0, rad(22) * beat2);
    set('wingR_outer', 0, 0, rad(-22) * beat2);
  }

  $('play').onclick = () => { state.playing = !state.playing; $('play').textContent = state.playing ? 'Pause' : 'Play'; };
  $('look').onclick = () => {
    state.clay = !state.clay;
    for (const m of meshes) m.mesh.material = state.clay ? m.clay : m.coloured;
    $('look').textContent = state.clay ? 'Show weights' : 'Show clay';
  };
  $('rest').onclick = () => { state.playing = false; state.time = 0; pose(0); $('play').textContent = 'Play'; };
  const roar = $('roar');
  if (roar) roar.onclick = () => { state.playing = false; state.time = 0.75; pose(0.75); $('play').textContent = 'Play'; };

  // Hooks for the headed check script: frame a part of the model, and hold one moment.
  state.view = (px, py, pz, tx, ty, tz) => {
    camera.position.set(px, py, pz);
    controls.target.set(tx, ty, tz);
    controls.update();
  };
  state.setTime = (t, still) => { state.playing = false; state.time = t; state.still = !!still; pose(t, still); };

  const s = result.stats;
  state.stats = { ...s, workerMs };
  $('stats').textContent = [
    `${s.vertices} points · ${s.triangles} triangles (${s.droppedTriangles} padding dropped) · ${s.bones} bones`,
    gearReport,
    `bending worked out in ${(workerMs / 1000).toFixed(1)} s: surface ${s.surfaceMs} ms · visibility ${s.visibilityMs} ms · solve ${s.solveMs} ms`,
    `solver ${s.solver}${s.factorNonzeros ? ` · ${(s.factorNonzeros / 1e6).toFixed(1)}M factor entries · factored in ${s.factorMs} ms` : ''}`,
    `${s.noSourceVertices} points saw no bone · ${s.fallbackVertices} fell back to the nearest bone · ${s.verticesOverMax} had more than 4 bones`,
    'drag to orbit · wheel to zoom',
  ].filter(Boolean).join('\n');
  status('Bending with our own weights (bone heat).');
  state.ready = true;

  let last = performance.now();
  renderer.setAnimationLoop(() => {
    const t = performance.now();
    if (state.playing) { state.time += (t - last) / 1000; state.still = false; }
    last = t;
    pose(state.time, state.still);
    controls.update();
    renderer.render(scene, camera);
  });
}

main().catch((err) => {
  state.errors.push(String((err && err.stack) || err));
  status(`Failed: ${err && err.message ? err.message : err}`);
});
