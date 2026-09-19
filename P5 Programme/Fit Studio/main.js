/**
 * main.js — Champion 3D Spike.
 *
 * WHY this file exists: a time-boxed EXPLORATION (not gated product code) probing whether the
 * P5 champion system should pivot from its current 2D puppet to a cel-shaded 3D viewer. It must
 * work TODAY with a programmatic stand-in robot and accept the real rigged GLB (Hunyuan mesh ->
 * Mixamo auto-rig -> Blender export) the moment it exists, via the drop zone / file picker below.
 *
 * Everything here is vanilla ESM against the vendored ./vendor/three.module.js — no bundler, no
 * CDN. See ../../../CLAUDE.md / AGENTS.md for the repo's build rules; this folder is explicitly
 * OUT of the `web/games/**` CI gate (see README.md in this folder).
 */

import * as THREE from 'three';
import { GLTFLoader } from './vendor/loaders/GLTFLoader.js';
import { OrbitControls } from './vendor/controls/OrbitControls.js';
import { initMocap } from './mocap.js?v=20260826a';
import { progressUI, fetchWithProgress } from './progress.js';

// ---------------------------------------------------------------------------------------------
// Renderer / scene / camera
// ---------------------------------------------------------------------------------------------

const canvas = document.getElementById('viewport');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
} catch (err) {
  // Loud failure: a spike that silently shows a black canvas wastes the reviewer's time more
  // than a spike that says plainly "WebGL didn't come up here." Built via DOM methods (not
  // innerHTML) even though the message is our own string — cheap habit, no reason not to.
  const pre = document.createElement('pre');
  pre.style.cssText = 'color:#ff6a6a;padding:24px;font:13px monospace';
  pre.textContent = 'WebGL renderer failed to initialize: ' + (err && err.message ? err.message : err);
  document.body.textContent = '';
  document.body.appendChild(pre);
  throw err;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0d12);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.05, 100);
camera.position.set(1.6, 1.4, 2.3);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 0.75, 0);
controls.minDistance = 0.4;
controls.maxDistance = 12;
controls.update();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------------------------------------
// Lighting — UNIFORM AMBIENT ONLY. This is the owner-approved 2D look, settled 2026-07-30 in
// tune.html and transplanted here; do not "restore" a key light without re-running that page.
//
// WHY THERE IS NO DIRECTIONAL LIGHT AT ALL. The champion's shading is already PAINTED INTO its
// texture by the image-to-3D stage, and that art is what should be seen. Any runtime directional
// light adds a SECOND, differently-angled shading pass on top of the painted one, and two
// disagreeing light directions is precisely what read as "still looks 3D". Removing every
// directional source leaves the albedo untouched, which is exactly how a 2D sprite is displayed.
//
// The earlier fixture was HemisphereLight + key + rim. A HemisphereLight is a gradient generator
// by construction (it lerps sky colour to ground colour across the surface normal), so it could
// never be flat at any intensity, and the rim added a second terminator across the silhouette.
// AmbientLight adds the same value to every fragment regardless of normal — the only genuinely
// flat option.
//
// CONSEQUENCE, worth knowing before tuning further: with no directional light, N·L is constant,
// so the toon gradientMap below collapses to a single band and the band count no longer does
// anything. It is retained because it costs nothing and immediately becomes live again if a key
// light is ever reintroduced. Shape now reads from the inverted-hull OUTLINE and the painted
// texture, not from shading.
// ---------------------------------------------------------------------------------------------

/** 3.3 = the full lighting budget the tuning page redistributed between fill and key; at the
 * approved ambient/key = 1.00 the key received none of it, so all of it lands here. */
const ambient = new THREE.AmbientLight(0xffffff, 3.3);
scene.add(ambient);

/** Fake blob ground shadow: a soft radial-gradient disc drawn on a runtime canvas (offline, no
 * external asset) and placed flat at the robot's feet. Not a real shadow map — a cheap, honest
 * stand-in the spike doesn't need to justify further. */
function buildGroundBlob() {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.7, 'rgba(0,0,0,0.28)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(0.7, 32), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.002; // avoid z-fighting with anything sitting exactly at y=0
  mesh.renderOrder = -1;
  return mesh;
}
const groundBlob = buildGroundBlob();
scene.add(groundBlob);

// ---------------------------------------------------------------------------------------------
// Toon shading: shared 4-step gradient map + a per-mesh MeshToonMaterial swap.
// ---------------------------------------------------------------------------------------------

/** A 4-step 1D gradient (dark -> light) sampled by N.L to produce flat toon bands. NearestFilter
 * is required — linear filtering would smear the steps back into a gradient and defeat the
 * banding entirely. */
function buildGradientMap() {
  // 5 bands, floor 50, evenly spaced — the approved setting, generated the same way tune.js does
  // so the two pages produce byte-identical ramps. Inert while the scene is ambient-only (see the
  // lighting block); kept correct so it is right the moment a key light returns.
  const n = 5;
  const low = 50;
  const values = new Uint8Array(n);
  for (let i = 0; i < n; i++) values[i] = Math.round(low + ((255 - low) * i) / (n - 1));
  const tex = new THREE.DataTexture(values, values.length, 1, THREE.RedFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}
const gradientMap = buildGradientMap();

/**
 * Build a matching "inverted hull" outline mesh for `mesh`: same geometry (shared, not cloned —
 * the outline never edits vertices on the CPU), BackSide black MeshBasicMaterial, with the shell
 * pushed outward by displacing each vertex along its own normal in the vertex shader
 * (onBeforeCompile). This is the classic toon-outline trick, picked over a scaled clone because
 * it is skinning-safe: injecting the displacement into `begin_vertex` runs BEFORE the skinning
 * chunk applies bone matrices, so a SkinnedMesh's outline bends with the same animated pose
 * instead of drifting off a uniformly-scaled copy.
 *
 * The outline mesh is added as a CHILD of `mesh` with an identity local transform, so its
 * matrixWorld is exactly mesh.matrixWorld — the shader then sees the same modelViewMatrix as the
 * source mesh and only the shell offset differs. Thickness is derived from the mesh's own
 * bounding-sphere radius so one constant works for both the meter-scale stand-in and a
 * differently-scaled dropped-in GLB.
 * @param {THREE.Mesh} mesh - source mesh (Mesh or SkinnedMesh) to outline
 * @returns {THREE.Mesh} the outline mesh, already parented under `mesh`
 */
/** Fraction of the shortest edge touching a vertex that the hull may travel along that vertex's
 * normal. Below 0.5 two shells growing toward each other across an edge cannot meet, so the hull
 * physically cannot self-intersect there. */
const OUTLINE_CLAMP_RATIO = 0.45;

/**
 * Per-vertex ceiling on outline displacement, from the shortest edge incident to each vertex.
 *
 * WHY: a uniform-thickness inverted hull tears on THIN FEATURES. Push every vertex of a lip
 * thinner than 2x the ink out along its own normal and the two faces of that lip swap sides — the
 * shell turns inside out and reads as a black chip punched through the surface (seen on the 50k
 * champion's visor rim at 10mm ink, while the denser 1M mesh survived it). Feature size decides
 * this, not mesh density, and the shortest incident edge is a direct local measure of it. With the
 * clamp in place the thickness slider survives being pushed to 30mm without tearing.
 *
 * Deliberately NOT a fraction of the mesh's bounding radius — that is pothole 4 in the pipeline
 * doc, where a single-mesh GLB gave fingers body-scale ink and swallowed them. This is local:
 * broad plating keeps the full artistic thickness, only fine features thin.
 *
 * O(triangles), one pass, no spatial structure. Cached on the geometry because outline meshes
 * SHARE geometry with their source mesh, so a second pass would be pure waste.
 * @param {THREE.BufferGeometry} geometry
 * @returns {THREE.BufferAttribute} float attribute, one clamp distance per vertex
 */
function computeOutlineClamp(geometry) {
  const existing = geometry.getAttribute('aOutlineClamp');
  if (existing) return existing;

  const pos = geometry.attributes.position;
  const index = geometry.index;
  const count = pos.count;
  const clamp = new Float32Array(count).fill(Infinity);
  const triCount = index ? index.count : count;
  const at = (i) => (index ? index.getX(i) : i);

  for (let t = 0; t + 2 < triCount; t += 3) {
    const i0 = at(t);
    const i1 = at(t + 1);
    const i2 = at(t + 2);
    for (let e = 0; e < 3; e++) {
      const a = e === 0 ? i0 : e === 1 ? i1 : i2;
      const b = e === 0 ? i1 : e === 1 ? i2 : i0;
      const dx = pos.getX(a) - pos.getX(b);
      const dy = pos.getY(a) - pos.getY(b);
      const dz = pos.getZ(a) - pos.getZ(b);
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (len > 0) {
        const lim = len * OUTLINE_CLAMP_RATIO;
        if (lim < clamp[a]) clamp[a] = lim;
        if (lim < clamp[b]) clamp[b] = lim;
      }
    }
  }
  // A vertex touched by no edge (degenerate/orphan) keeps Infinity, which would render as garbage
  // through min() — give it a large finite value so it simply takes the uniform thickness.
  for (let i = 0; i < count; i++) if (!isFinite(clamp[i])) clamp[i] = 1e9;

  const attr = new THREE.BufferAttribute(clamp, 1);
  geometry.setAttribute('aOutlineClamp', attr);
  return attr;
}

function makeOutlineMesh(mesh) {
  const geometry = mesh.geometry;
  computeOutlineClamp(geometry);
  // ABSOLUTE 30mm world-space ink (champions are normalized to 1.7m at the Blender step), the
  // owner-approved value dialled in on tune.html 2026-07-31 (slider multiplier 30 x 1mm base).
  // Only survivable because of the per-vertex clamp above — at 30mm an unclamped hull tears
  // straight through the visor rim and the finger gaps.
  // The earlier %-of-bounding-radius formulas sized the hull from the WHOLE single-mesh body,
  // which swallowed fingers whole (owner catch). tune.html carries the live slider if this needs
  // re-judging — change it THERE first, then transplant, so the two pages can't silently diverge.
  //
  // Ink this heavy is doing real work now: with no directional light (see the lighting block),
  // the outline is the primary shape cue, so it is deliberately much thicker than the 1.2mm the
  // spike started with.
  const thickness = 0.03;

  const outlineMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide });
  outlineMat.onBeforeCompile = (shader) => {
    shader.uniforms.uOutlineThickness = { value: thickness };
    shader.vertexShader =
      'uniform float uOutlineThickness;\nattribute float aOutlineClamp;\n' + shader.vertexShader;
    // Deliberately displace along the RAW `normal` attribute, not the `objectNormal` local
    // three.js normally computes in <beginnormal_vertex> — MeshBasicMaterial's vertex shader
    // only emits that chunk (and declares the `objectNormal` variable) when USE_ENVMAP or
    // USE_SKINNING is defined; a non-skinned, non-envmapped mesh (every stand-in primitive)
    // compiles with neither, so `objectNormal` doesn't exist there and the shader failed to
    // link ("no valid shader program in use") when this used objectNormal. `normal` itself is
    // ALWAYS declared (WebGLProgram emits `attribute vec3 normal;` unconditionally), so this
    // works for skinned and non-skinned meshes alike — for a skinned mesh the displacement is
    // computed in bind-pose orientation rather than the live post-skin orientation, a small
    // approximation that's fine for an outline shell (it still rides the same bone transform as
    // the rest of the vertex via <skinning_vertex> right after this).
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n\ttransformed += normalize( normal ) * min( uOutlineThickness, aOutlineClamp );'
    );
  };

  let outlineMesh;
  if (mesh.isSkinnedMesh) {
    outlineMesh = new THREE.SkinnedMesh(geometry, outlineMat);
    outlineMesh.bind(mesh.skeleton, mesh.bindMatrix);
  } else {
    outlineMesh = new THREE.Mesh(geometry, outlineMat);
  }
  outlineMesh.name = (mesh.name || 'mesh') + '__outline';
  outlineMesh.renderOrder = (mesh.renderOrder || 0) - 1;
  outlineMesh.matrixAutoUpdate = false; // identity local transform, never touched again
  mesh.add(outlineMesh);
  return outlineMesh;
}

/**
 * Traverse `root`, replace every Mesh/SkinnedMesh material with a THREE.MeshToonMaterial that
 * keeps the original `.map` texture and `.color`, and attach an inverted-hull outline sibling to
 * each. Works on any loaded object — the programmatic stand-in today, a dropped-in GLB later.
 *
 * Collects the mesh list in a first pass, THEN mutates in a second pass — deliberately, not
 * combined into one `root.traverse` callback. THREE.Object3D#traverse re-reads `this.children`
 * (the live array, by reference) right after invoking the callback for a node; adding an outline
 * mesh as a child from inside the same traversal callback puts that new child into the very
 * array traverse is about to recurse into, so it visits the fresh outline too, tries to outline
 * IT, and recurses forever — a real RangeError: Maximum call stack size exceeded hit while
 * building this spike. Two passes sidesteps it entirely.
 * @param {THREE.Object3D} root
 * @returns {THREE.Mesh[]} the outline meshes created (for outline-visibility toggling)
 */
function toonify(root) {
  const meshes = [];
  root.traverse((obj) => { if (obj.isMesh) meshes.push(obj); });

  const outlines = [];
  meshes.forEach((obj) => {
    const wasArray = Array.isArray(obj.material);
    const sourceMats = wasArray ? obj.material : [obj.material];
    const toonMats = sourceMats.map((src) => {
      const toon = new THREE.MeshToonMaterial({
        color: src && src.color ? src.color.clone() : new THREE.Color(0xffffff),
        map: src && src.map ? src.map : null,
        gradientMap,
      });
      if (src && src.transparent) { toon.transparent = true; toon.opacity = src.opacity; }
      if (src && src.alphaTest) toon.alphaTest = src.alphaTest;
      if (src && src.side !== undefined) toon.side = src.side;
      return toon;
    });
    obj.material = wasArray ? toonMats : toonMats[0];
    outlines.push(makeOutlineMesh(obj));
  });
  return outlines;
}

// ---------------------------------------------------------------------------------------------
// Programmatic stand-in robot: a named joint hierarchy of toon-shaded primitives, animated in
// code (no baked clips — this IS the "no GLB yet" placeholder).
// ---------------------------------------------------------------------------------------------

/**
 * Build the stand-in robot: an Object3D hierarchy with named joint nodes (Hips, Spine, Head,
 * LeftArm, RightArm, LeftLeg, RightLeg) matching the bone-name vocabulary the real Mixamo rig
 * will use, so the idle/walk animator and the gear-socket search both already know what to look
 * for once a real GLB replaces this.
 * @returns {{ root: THREE.Group, nodes: Record<string, THREE.Object3D> }}
 */
function buildStandInRobot() {
  const nodes = {};
  const root = new THREE.Group();
  root.name = 'StandInRobot';

  const bodyColor = 0x5ac8fa;
  const jointColor = 0x2f80ed;
  const standardMat = (hex) => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.55, metalness: 0.1 });

  const HIP_Y = 0.58;
  const LEG_LEN = 0.5;   // total capsule height (radius*2 + mid length)
  const ARM_LEN = 0.4;

  const hips = new THREE.Object3D();
  hips.name = 'Hips';
  hips.position.set(0, HIP_Y, 0);
  root.add(hips);
  nodes.Hips = hips;

  const pelvisMesh = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.2), standardMat(bodyColor));
  hips.add(pelvisMesh);

  const spine = new THREE.Object3D();
  spine.name = 'Spine';
  spine.position.set(0, 0.1, 0);
  hips.add(spine);
  nodes.Spine = spine;

  const torsoMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.28, 4, 8), standardMat(bodyColor));
  torsoMesh.position.set(0, 0.22, 0);
  spine.add(torsoMesh);
  nodes.torsoMesh = torsoMesh; // not a "bone" — kept only for the idle breathing scale

  const head = new THREE.Object3D();
  head.name = 'Head';
  head.position.set(0, 0.48, 0);
  spine.add(head);
  nodes.Head = head;

  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.14, 20, 14), standardMat(jointColor));
  head.add(headMesh);
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.05, 0.03),
    new THREE.MeshStandardMaterial({ color: 0x0d1720, roughness: 0.2, metalness: 0.4 })
  );
  visor.position.set(0, 0.01, 0.12);
  head.add(visor);

  function buildLimb(name, side, shoulderY) {
    const pivot = new THREE.Object3D();
    pivot.name = name;
    pivot.position.set(side * 0.24, shoulderY, 0);
    spine.add(pivot);
    nodes[name] = pivot;
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, ARM_LEN - 0.11, 4, 8), standardMat(bodyColor));
    mesh.position.set(0, -ARM_LEN / 2, 0);
    pivot.add(mesh);
    return pivot;
  }
  buildLimb('LeftArm', 1, 0.38);
  buildLimb('RightArm', -1, 0.38);

  function buildLeg(name, side) {
    const pivot = new THREE.Object3D();
    pivot.name = name;
    pivot.position.set(side * 0.1, -0.08, 0);
    hips.add(pivot);
    nodes[name] = pivot;
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, LEG_LEN - 0.15, 4, 8), standardMat(jointColor));
    mesh.position.set(0, -LEG_LEN / 2, 0);
    pivot.add(mesh);
    return pivot;
  }
  buildLeg('LeftLeg', 1);
  buildLeg('RightLeg', -1);

  return { root, nodes, baseHipY: HIP_Y };
}

/**
 * Advance the stand-in's procedural animation by one frame.
 * @param {Record<string, THREE.Object3D>} nodes
 * @param {number} baseHipY - rest hip height, so bob oscillates around it rather than drifting
 * @param {'idle'|'walk'} mode
 * @param {number} elapsed - seconds, accumulated from RAF timestamps (see raf() below)
 */
function animateStandIn(nodes, baseHipY, mode, elapsed) {
  if (mode === 'walk') {
    const stride = elapsed * 6.0;
    const swing = Math.sin(stride);
    // X-axis rotation = forward/back swing (the character faces +Z), NOT a sideways Y/Z twist.
    nodes.LeftLeg.rotation.x = swing * 0.55;
    nodes.RightLeg.rotation.x = -swing * 0.55;
    nodes.LeftArm.rotation.x = -swing * 0.45;
    nodes.RightArm.rotation.x = swing * 0.45;
    nodes.LeftArm.rotation.z = 0;
    nodes.RightArm.rotation.z = 0;
    nodes.Hips.position.y = baseHipY + Math.abs(Math.sin(stride)) * 0.035;
    nodes.Spine.rotation.z = Math.sin(stride) * 0.035;
    nodes.Spine.rotation.y = Math.sin(stride) * 0.05;
    nodes.Head.rotation.y = Math.sin(stride * 0.5) * 0.08;
    nodes.torsoMesh.scale.set(1, 1, 1);
  } else {
    const breathe = Math.sin(elapsed * 1.6);
    nodes.torsoMesh.scale.set(1, 1 + breathe * 0.025, 1);
    nodes.Hips.position.y = baseHipY + breathe * 0.008;
    nodes.LeftArm.rotation.x = 0;
    nodes.RightArm.rotation.x = 0;
    nodes.LeftArm.rotation.z = 0.06 + Math.sin(elapsed * 1.1) * 0.03;
    nodes.RightArm.rotation.z = -0.06 - Math.sin(elapsed * 1.1) * 0.03;
    nodes.LeftLeg.rotation.x = 0;
    nodes.RightLeg.rotation.x = 0;
    nodes.Spine.rotation.z = 0;
    nodes.Spine.rotation.y = Math.sin(elapsed * 0.35) * 0.04;
    nodes.Head.rotation.y = Math.sin(elapsed * 0.5) * 0.06;
  }
}

const standIn = buildStandInRobot();
scene.add(standIn.root);
let standInOutlines = toonify(standIn.root);

// ---------------------------------------------------------------------------------------------
// Loaded gear prop: a REAL static GLB (Hunyuan visor/lens/shoulder-pod export, arbitrary scale +
// orientation), toonified + size-normalized on load, then socketed to a bone picked from the
// HUD's "Gear socket" <select>. This is now the ONLY gear path: the programmatic placeholder
// prop ("Test lens") was removed once real gear GLBs existed.
// ---------------------------------------------------------------------------------------------

/** Target world-space diameter (metres) a loaded gear prop is rescaled to. Head/chest/shoulder
 * gear all read as "sensible" around a third of a metre against a ~1.7m champion — eyeball-tuned,
 * not derived. Bump this if a real Hunyuan export reads too small/large across the board. */
const GEAR_PROP_TARGET_DIAMETER_M = 0.35;

/** Bone-name search patterns per socket key, tested case-insensitively against every THREE.Bone
 * in a loaded GLB skeleton (Mixamo-style names, e.g. "mixamorigLeftArm") AND against the stand-in
 * robot's plain named Object3D joints (e.g. "LeftArm") — see findSocketTarget(). The `spine`
 * alternative on `chest` is an addition beyond the Mixamo-specific spine1/spine2/chest tokens
 * solely so the stand-in's single "Spine" joint also resolves; it doesn't change which Mixamo
 * bone wins since regex .test() has no alternative-priority, only match/no-match. handR has no
 * stand-in equivalent (the stand-in has no hand joint) — it correctly falls back to a HUD message
 * there until a real skeleton is loaded. */
const SOCKET_PATTERNS = {
  head: /head/i,
  chest: /spine2|spine1|chest|spine/i,
  shoulderL: /leftshoulder|leftarm/i,
  shoulderR: /rightshoulder|rightarm/i,
  handR: /righthand/i,
  hips: /hips/i,
  legL: /leftupleg|leftleg/i,
  legR: /rightupleg|rightleg/i,
};

/** Small outward position offset per socket key, in WORLD-scale metres (converted to the target
 * bone's local space by the same 1/boneWorldScale correction socketProp applies to scale).
 * Eyeball-tuned against the stand-in's proportions — head sits slightly forward, chest sits
 * slightly forward, shoulders sit outward along the body's own +X (LeftArm)/-X (RightArm) axis
 * matching buildLimb()'s `side` sign above, hand sits a touch below the wrist. */
const SOCKET_OFFSET = {
  head: { x: 0, y: 0.02, z: 0.12 },
  chest: { x: 0, y: 0, z: 0.1 },
  shoulderL: { x: 0.1, y: 0, z: 0 },
  shoulderR: { x: -0.1, y: 0, z: 0 },
  handR: { x: 0, y: -0.05, z: 0 },
  hips: { x: 0, y: 0, z: 0.1 },
  legL: { x: 0.05, y: 0, z: 0.05 },
  legR: { x: -0.05, y: 0, z: 0.05 },
};

let loadedGearProp = null; // the MOST-RECENTLY loaded gear prop (socket-select target), or null
let gearWardrobe = []; // EVERY loaded gear prop — the champion wears all of them at once (art plan)
let gearWearSeq = 0; // counts every successful adopt — awaiting length is wrong once slot-swaps exist
let championRestPose = []; // [{bone,p,q,s}] captured at champion load — the fit-attach baseline

/** Resolve the bone/node to socket `boneKey` gear onto for whichever model is currently active —
 * the stand-in's named Object3D joints, or a dropped-in GLB's THREE.Bone skeleton. Mirrors
 * Searches all 5 SOCKET_PATTERNS keys, not just head-then-torso.
 * @param {string} boneKey - one of the SOCKET_PATTERNS keys
 * @returns {THREE.Object3D|null}
 */
function findSocketTarget(boneKey) {
  const pattern = SOCKET_PATTERNS[boneKey];
  if (!pattern) return null;
  let match = null;
  if (activeIsStandIn) {
    Object.keys(standIn.nodes).forEach((name) => {
      if (name === 'torsoMesh') return; // not a joint, just the breathing mesh reference
      if (!match && pattern.test(name)) match = standIn.nodes[name];
    });
  } else if (currentModel) {
    currentModel.traverse((o) => {
      if (match || !o.isBone) return;
      if (pattern.test(o.name)) match = o;
    });
  }
  return match;
}

/**
 * Attach `prop` to the bone resolved for `boneKey` on the currently active model, compensating
 * for the bone's own world scale (Mixamo
 * skeletons are commonly authored at a tiny world scale — dividing by it is what keeps a
 * normalized-to-metres prop from shrinking to invisibility once parented under the bone).
 * `prop.userData.baseScale` — set by loadGearGLB when it normalizes the prop to
 * GEAR_PROP_TARGET_DIAMETER_M at an assumed scale of 1 — is multiplied back in here so the final
 * apparent world size stays ~constant across bones/models regardless of their own scale.
 * @param {THREE.Object3D} prop - the prop group to socket (already toonified + normalized)
 * @param {string} boneKey - one of the SOCKET_PATTERNS keys
 * @returns {boolean} true if a target bone was found and the prop was attached
 */
function socketProp(prop, boneKey) {
  const target = findSocketTarget(boneKey);
  if (!target) {
    showHudMessage('No "' + boneKey + '" bone found on the current model — gear not attached.');
    return false;
  }
  if (prop.parent) prop.parent.remove(prop);
  const worldScale = new THREE.Vector3();
  target.getWorldScale(worldScale);
  const avgScale = (worldScale.x + worldScale.y + worldScale.z) / 3 || 1;
  const correction = 1 / avgScale;
  const baseScale = prop.userData.baseScale || 1;
  prop.scale.setScalar(baseScale * correction);
  const offset = SOCKET_OFFSET[boneKey] || { x: 0, y: 0, z: 0 };
  prop.position.set(offset.x * correction, offset.y * correction, offset.z * correction);
  prop.rotation.set(0, 0, 0);
  target.add(prop);
  showHudMessage('');
  return true;
}

/**
 * Attach a PRE-FITTED gear prop (gear-fit.py baked scale/orientation/seat into the GLB, with
 * world origin = the socket bone's rest position, flagged via the `championFit` glTF extra).
 * Place it at the bone's current world position, then `attach()` — which reparents under the
 * bone while PRESERVING the world transform — so it rides the animated head afterward with no
 * per-prop constants web-side. This is the wardrobe contract: gear ships ready-to-wear.
 * @param {THREE.Group} group - prop wrapper (already toonified)
 * @param {string} fitKey - socket the asset was fitted for (a SOCKET_PATTERNS key, e.g. 'head')
 * @returns {boolean} true if the socket bone existed and the prop was attached
 */
function attachPrefittedGear(group, fitKey) {
  const target = findSocketTarget(fitKey);
  if (!target) {
    showHudMessage('No "' + fitKey + '" bone found on the current model — gear not attached.');
    return false;
  }
  if (group.parent) group.parent.remove(group);
  group.position.set(0, 0, 0);
  group.rotation.set(0, 0, 0);
  group.scale.setScalar(1);
  target.getWorldPosition(group.position); // authored offsets are mesh-baked, relative to the bone
  scene.add(group);
  target.attach(group);
  showHudMessage('');
  return true;
}

/** Drop EVERY worn gear prop — used when the champion model itself is swapped out (the props
 * would otherwise dangle attached to bones that are no longer in the scene graph). */
function removeLoadedGear() {
  gearWardrobe.forEach((g) => { if (g.parent) g.parent.remove(g); });
  gearWardrobe = [];
  loadedGearProp = null;
}

/** Run `fn` with the champion frozen at its REST pose. attach() bakes the bone->gear local
 * transform from the bone's CURRENT world matrix — attaching mid-Idle bakes that animated-pose
 * error into the fit permanently (the misplaced-kabuto bug: gear loaded after clips started).
 * Restoring the captured rest TRS just for the attach makes the MOMENT of attachment
 * irrelevant; the running mixer re-poses the skeleton next frame and the gear rides correctly.
 * (Never THREE.Skeleton.pose() here — it also resets the Armature node's Z-up rotation and
 * seats gear 1.55 m off; we restore only the captured per-bone local TRS.) */
function withRestPose(fn) {
  if (!activeIsStandIn && currentModel && championRestPose.length) {
    championRestPose.forEach((r) => { r.bone.position.copy(r.p); r.bone.quaternion.copy(r.q); r.bone.scale.copy(r.s); });
    currentModel.updateMatrixWorld(true);
  }
  return fn();
}

/**
 * Parse a real gear GLB (arbitrary export scale/orientation from Hunyuan), toonify it so it
 * matches the champion's cel-shaded look (outlines included), normalize its size to a sensible
 * fraction of the champion's height, and socket it onto whichever bone the HUD's "Gear socket"
 * select currently names. Replaces any previously loaded gear prop.
 * @param {File} file
 */
function loadGearGLB(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
    gltfLoader.parse(
      reader.result,
      '',
      (gltf) => {
        const raw = gltf.scene || (gltf.scenes && gltf.scenes[0]);
        if (!raw) {
          showHudMessage('Gear GLB parsed but contained no scene.');
          return;
        }
        // Gear is a PROP, not a character: rigged GLBs cannot round-trip through the fit-export
        // path (clone keeps refs to the original bones -> exporter writes null skin joints ->
        // corrupt file that crashes every loader). Refuse loudly instead of failing later.
        let rigged = false;
        raw.traverse((o) => { if (o.isSkinnedMesh || o.isBone) rigged = true; });
        if (rigged) {
          showHudMessage('That GLB contains a skeleton — it is a rigged character, not a gear prop. Gear must be a plain un-rigged mesh (helmet, plate, tool). Nothing was loaded.');
          return;
        }
        toonify(raw); // same MeshToonMaterial + inverted-hull outline treatment as the champion

        // Normalize: bounding SPHERE sets the uniform rescale (robust to odd export proportions),
        // bounding-box CENTER is what gets recentred to the local origin — the box center is a
        // better "visual middle" for typically box-ish props (visor/pod) than the sphere's own
        // center, which can sit off to one side for an asymmetric mesh.
        // Detect pre-fitted gear FIRST: the recentre below is DESTRUCTIVE to a baked fit (whose
        // whole placement lives in coords relative to the socket bone at (0,0,0)) — it snapped
        // the owner's hand fit to bbox-centre-on-bone, wearing the helmet on the nose.
        let fitKeyEarly = null;
        raw.traverse((o) => { if (!fitKeyEarly && o.userData && o.userData.championFit) fitKeyEarly = o.userData.championFit; });
        let slotEarly = null; // championSlot extra — the art-plan slot a baked piece claims
        raw.traverse((o) => { if (!slotEarly && o.userData && o.userData.championSlot) slotEarly = o.userData.championSlot; });

        const group = new THREE.Group();
        group.name = 'GearPropLoaded';
        if (!fitKeyEarly) {
          const box = new THREE.Box3().setFromObject(raw);
          const sphere = new THREE.Sphere();
          box.getBoundingSphere(sphere);
          const center = box.getCenter(new THREE.Vector3());
          raw.position.sub(center);
          const diameter = Math.max(sphere.radius * 2, 1e-6); // guard a degenerate/point-sized mesh
          group.userData.baseScale = GEAR_PROP_TARGET_DIAMETER_M / diameter;
        }
        group.add(raw);
        group.userData.outlines = [];
        group.traverse((o) => { if (o.isMesh && /__outline$/.test(o.name)) group.userData.outlines.push(o); });

        // Pre-fitted gear (gear-fit.py) carries a championFit extra naming its baked socket —
        // attach as-authored instead of auto-normalizing to the 0.35m guess.
        const fitKey = fitKeyEarly;
        group.userData.championFit = fitKey;

        // Socket-picker honesty (2026-08-26): a pre-fitted prop is locked to its baked socket —
        // show that and disable the picker instead of leaving a stale enabled choice the change
        // handler then refuses. Raw props keep the picker (it just seated them).
        if (fitKey) {
          gearBoneSelect.value = VIEWER_SLOT_TO_BONE[slotEarly || fitKey] || fitKey;
          gearBoneSelect.disabled = true;
        } else {
          gearBoneSelect.disabled = false;
        }

        loadedGearProp = group; // newest piece becomes the socket-select target; the rest STAY worn
        const boneKey = gearBoneSelect.value || 'head';
        const attached = withRestPose(() => (fitKey ? attachPrefittedGear(group, fitKey) : socketProp(group, boneKey)));
        if (attached) {
          // ONE PIECE PER SLOT (mirrors the Fit Studio): a piece landing in an occupied slot
          // REPLACES the occupant — three kabuto colours are rival lanes of one crown slot, not
          // three hats. championSlot names the art-plan slot; older bakes swap at bone level;
          // raw props claim the socket picker's bone.
          group.userData.slotKey = fitKey ? (slotEarly || fitKey) : boneKey;
          const rival = gearWardrobe.findIndex((g) => g.userData.slotKey === group.userData.slotKey);
          if (rival !== -1) {
            const old = gearWardrobe.splice(rival, 1)[0];
            if (old.parent) old.parent.remove(old);
          }
          gearWardrobe.push(group);
          gearWearSeq += 1;
          setOutlinesVisible(group.userData.outlines, outlinesOn);
          applyGearVisibility();
          showHudMessage('Loaded gear: ' + (file.name || 'gear.glb') + ' — ' + gearWardrobe.length + ' piece(s) worn.');
        }
      },
      (err) => showHudMessage('Failed to parse gear GLB: ' + (err && err.message ? err.message : err))
    );
    } catch (err) {
      // GLTFLoader.parse can THROW synchronously on corrupt input (e.g. a skin with null joints)
      // instead of calling onError — without this catch the failure is silent and the button looks dead.
      showHudMessage('Failed to parse gear GLB: ' + (err && err.message ? err.message : err));
    }
  };
  reader.onerror = () => showHudMessage('Could not read the gear file.');
  reader.readAsArrayBuffer(file);
}

// ---------------------------------------------------------------------------------------------
// GLB drop-in
// ---------------------------------------------------------------------------------------------

const gltfLoader = new GLTFLoader();
let currentModel = null;
let currentModelOutlines = [];
let mixer = null;
let clipActions = {};
let activeIsStandIn = true;

/** Fit the camera/orbit target to an object's bounding box — used once, right after a GLB loads,
 * since we have no prior idea of the real asset's scale or origin. */
function autoFrameCamera(object) {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const dist = maxDim * 1.8;
  controls.target.copy(center);
  camera.near = Math.max(maxDim / 500, 0.01);
  camera.far = Math.max(maxDim * 200, 100);
  camera.updateProjectionMatrix();
  camera.position.set(center.x + dist * 0.55, center.y + dist * 0.45, center.z + dist * 0.85);
  controls.update();
  // Re-seat the ground blob under the model's feet instead of the stand-in's.
  groundBlob.position.set(center.x, box.min.y + 0.002, center.z);
  const groundScale = Math.max(maxDim * 0.9, 0.1);
  groundBlob.scale.setScalar(groundScale / 0.7);
}

function clearClipButtons() {
  const section = document.getElementById('clipSection');
  const wrap = document.getElementById('clipButtons');
  wrap.textContent = '';
  section.hidden = true;
  clipActions = {};
}

/** Clips whose names DON'T match this are one-shots (Wave, Victory…): they play once, clamp,
 * and auto-crossfade back to Idle when the mixer fires 'finished' — the champion never freezes
 * at the end of a celebration. Idle/Walk-style clips loop. */
const LOOP_CLIP_RE = /idle|walk|run|breath/i;

/** The champion's RESTING clip. Idle is the pose everything falls back to: on load, and after a
 * one-shot finishes. Matched by name because that is the only signal a clip GLB carries. */
const REST_CLIP_RE = /idle/i;

const FADE_S = 0.3;
let currentAction = null;

/** True once the reviewer clicks a clip button — from then on auto-play stops overriding them.
 * Reset whenever a new champion is loaded (populateClipButtons). */
let userPickedClip = false;

/** Name of the clip to rest on: Idle if the model has one, else the first looping clip, else null.
 * Insertion order alone is NOT safe here — clip files can be added in any order, which is exactly
 * how a finished Wave used to fall back into Walk. */
function restClipName() {
  const names = Object.keys(clipActions);
  return names.find((n) => REST_CLIP_RE.test(n)) || names.find((n) => LOOP_CLIP_RE.test(n)) || null;
}

function playClip(name, wrap) {
  const next = clipActions[name];
  if (!next || next === currentAction) return;
  const isLoop = LOOP_CLIP_RE.test(name);
  next.reset();
  next.setLoop(isLoop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
  next.clampWhenFinished = !isLoop;
  next.enabled = true;
  if (currentAction) {
    // Cross-fade: both clips play during the window while influence slides across —
    // the 3D counterpart of the 2D rig's blendPoses (no snap between poses).
    next.play();
    currentAction.crossFadeTo(next, FADE_S, false);
  } else {
    next.play();
  }
  currentAction = next;
  if (wrap) {
    Array.from(wrap.children).forEach((c) =>
      c.classList.toggle('hud__btn--active', c.dataset.clip === name));
  }
}

/** Lazily create the shared AnimationMixer for the loaded model. Split-architecture requirement:
 * a pure champion-base.glb ships ZERO animations (glb-contract law), so the mixer must NOT be
 * created only when the base itself carries clips — clip files added later need one too. */
function ensureMixer(root) {
  if (mixer) return mixer;
  mixer = new THREE.AnimationMixer(root);
  // One-shots bounce back to the resting clip (Idle) when they finish.
  mixer.addEventListener('finished', () => {
    const fallback = restClipName();
    if (fallback) playClip(fallback, document.getElementById('clipButtons'));
  });
  return mixer;
}

function populateClipButtons(clips, root) {
  clearClipButtons();
  currentAction = null;
  userPickedClip = false; // a new champion starts with no reviewer choice to respect
  if (!clips || !clips.length) return;
  ensureMixer(root);
  const section = document.getElementById('clipSection');
  const wrap = document.getElementById('clipButtons');
  section.hidden = false;
  clips.forEach((clip) => {
    const action = mixer.clipAction(clip);
    clipActions[clip.name] = action;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'hud__btn';
    btn.dataset.clip = clip.name;
    btn.textContent = clip.name || 'clip';
    btn.addEventListener('click', () => { userPickedClip = true; playClip(clip.name, wrap); });
    wrap.appendChild(btn);
  });
  // Auto-start on the resting clip so a fresh drop breathes immediately.
  const first = restClipName() || clips[0].name;
  playClip(first, wrap);
}

function populateBoneList(root) {
  const bones = [];
  root.traverse((o) => { if (o.isBone) bones.push(o.name); });
  const el = document.getElementById('boneList');
  el.textContent = bones.length ? bones.join('\n') : '(model loaded, but no THREE.Bone nodes found — is it rigged?)';
}

function setOutlinesVisible(mesh_outlines, visible) {
  mesh_outlines.forEach((m) => { m.visible = visible; });
}

let outlinesOn = true;

/** GLTFLoader.parse can THROW synchronously on corrupt input instead of calling onError — a bad
 *  fallback file used to die as an uncaught SyntaxError with no HUD message. Route every parse
 *  through here so a bad file always surfaces via onError (crash-proof I/O law). */
function parseGLBGuarded(buffer, onLoad, onError) {
  try {
    gltfLoader.parse(buffer, '', onLoad, onError);
  } catch (err) {
    if (onError) onError(err);
  }
}

function loadGLBFromArrayBuffer(buffer, sourceName) {
  parseGLBGuarded(
    buffer,
    (gltf) => {
      // Tear down whatever is currently shown.
      if (activeIsStandIn) {
        scene.remove(standIn.root);
      } else if (currentModel) {
        scene.remove(currentModel);
      }
      removeLoadedGear(); // the loaded gear prop was socketed to the OLD model's bones — drop it too
      if (mixer) { mixer.stopAllAction(); mixer = null; }

      currentModel = gltf.scene || (gltf.scenes && gltf.scenes[0]);
      if (!currentModel) {
        showHudMessage('GLB parsed but contained no scene.');
        return;
      }
      scene.add(currentModel);
      currentModelOutlines = toonify(currentModel);
      setOutlinesVisible(currentModelOutlines, outlinesOn);
      setOutlinesVisible(standInOutlines, false); // stand-in is removed from scene anyway
      autoFrameCamera(currentModel);
      // Capture the REST pose before any clip can tick — this is the baseline every gear attach
      // is computed against (see withRestPose).
      championRestPose = [];
      currentModel.traverse((o) => {
        if (o.isBone) championRestPose.push({ bone: o, p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() });
      });
      populateClipButtons(gltf.animations, currentModel);
      populateBoneList(currentModel);
      activeIsStandIn = false;
      document.getElementById('dropZone').classList.add('is-loaded');
      setupFallbackChip(); // the panel now shrinks to the corner chip — make it operable
      showHudMessage('Loaded ' + (sourceName || 'GLB') + '.');
    },
    (err) => {
      showHudMessage('Failed to parse GLB: ' + (err && err.message ? err.message : err));
    }
  );
}

function readFileAsGLB(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => loadGLBFromArrayBuffer(reader.result, file.name);
  reader.onerror = () => showHudMessage('Could not read the dropped file.');
  reader.readAsArrayBuffer(file);
}

/**
 * Load animation-only clip GLBs and bind their clips onto the CURRENTLY loaded model.
 * This is the split-file architecture: one heavy champion-base.glb, many tiny clip files
 * (armature + curves, no mesh). Binding is by NODE NAME — every Mixamo-rigged champion shares
 * the standard mixamorig skeleton, so any clip file binds to any champion. A clip whose bone
 * names find no match on the current skeleton would animate nothing: we probe the first track's
 * target name and warn instead of silently doing nothing.
 */
async function addClipFilesToCurrentModel(files) {
  if (activeIsStandIn || !currentModel) {
    showHudMessage('Load a champion GLB first — clips bind onto the loaded skeleton.');
    return;
  }
  // A pure split base carries zero clips, so no mixer exists yet at this point — make one.
  ensureMixer(currentModel);
  const wrap = document.getElementById('clipButtons');

  // SEQUENTIAL, deliberately. This used to run one FileReader per file in parallel, which made
  // the button row come out in whatever order the readers resolved and let the auto-play grab
  // whichever loop clip landed first — the champion booted into Walk about as often as Idle.
  // Reading in series makes button order == the order the files were handed to us. Clip GLBs are
  // 45–210 KB (the mesh lives in champion-base.glb), so the serial cost is imperceptible.
  for (const file of Array.from(files)) {
    let buffer;
    try {
      buffer = await readFileAsArrayBufferAsync(file);
    } catch (err) {
      showHudMessage('Could not read ' + file.name + '.');
      continue;
    }
    // GLTFLoader.parse is callback-based; resolve(null) on the error path so one bad clip file
    // skips its turn instead of rejecting the whole sequence. parse can also THROW synchronously
    // on corrupt input (never calling onError) — catch that too so the batch keeps going.
    const gltf = await new Promise((resolve) => {
      try {
        gltfLoader.parse(buffer, '', resolve, () => resolve(null));
      } catch (err) {
        resolve(null);
      }
    });
    if (!gltf) {
      showHudMessage('Could not parse ' + file.name + '.');
      continue;
    }
    if (!gltf.animations || !gltf.animations.length) {
      showHudMessage(file.name + ' contains no animations.');
      continue;
    }
    const nodeNames = new Set();
    currentModel.traverse((o) => nodeNames.add(o.name));
    gltf.animations.forEach((clip) => {
      const firstTarget = clip.tracks.length ? clip.tracks[0].name.split('.')[0] : '';
      if (firstTarget && !nodeNames.has(firstTarget)) {
        showHudMessage('Clip "' + clip.name + '": skeleton mismatch (targets ' + firstTarget + ') — not added.');
        return;
      }
      appendClipButton(clip);
    });
    showHudMessage('Added clips from ' + file.name + '.');
    // Rest on Idle as soon as an Idle exists — and keep upgrading to it as later files land, so a
    // base that receives Walk before Idle doesn't stay walking. A reviewer's own pick wins from
    // the moment they make one; playClip() no-ops when the choice is already playing.
    if (!userPickedClip) {
      const rest = restClipName();
      if (rest) playClip(rest, wrap);
    }
  }
}

/** Promise wrapper around FileReader — lets the loop above await one file at a time. */
function readFileAsArrayBufferAsync(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('read failed: ' + file.name));
    reader.readAsArrayBuffer(file);
  });
}

/** Register one extra clip on the live mixer + a button for it (used by the clip-file loader). */
function appendClipButton(clip) {
  if (clipActions[clip.name]) return; // same-named clip already present
  const wrap = document.getElementById('clipButtons');
  document.getElementById('clipSection').hidden = false;
  const action = mixer.clipAction(clip);
  clipActions[clip.name] = action;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'hud__btn';
  btn.dataset.clip = clip.name;
  btn.textContent = clip.name || 'clip';
  btn.addEventListener('click', () => { userPickedClip = true; playClip(clip.name, wrap); });
  wrap.appendChild(btn);
}

// ---------------------------------------------------------------------------------------------
// HUD wiring
// ---------------------------------------------------------------------------------------------

function showHudMessage(msg) {
  document.getElementById('hudMessage').textContent = msg || '';
}

// GEAR ON/OFF -- the only Look control left, and it drives the REAL loaded gear GLB.
//
// What was here before and why it went (owner call, 2026-08-05):
//   - "Outline: on/off" -- the inked look is APPROVED, so a switch that turns it off only invites
//     a reviewer to judge a render we are not shipping. `outlinesOn` survives as a constant `true`
//     because the model/gear load paths still read it to ink whatever arrives at runtime.
//   - "Test lens" -- it socketed a PROGRAMMATIC placeholder (cylinder + emissive disc), a separate
//     object from the loaded gear. Once a real gear GLB autoloads it just parks a plastic badge on
//     the champion's head and answers no question anyone is asking.
//
// "off" HIDES the gear rather than detaching it: the prop keeps its socket and its fitted local
// transform, so flipping back on is instant and cannot lose the fit.
const btnGearToggle = document.getElementById('btnGearToggle');
let gearVisible = true;

/** Push `gearVisible` onto the loaded prop + the button's label/state. Called on every toggle AND
 * after a gear GLB loads, so a freshly loaded prop inherits the current on/off choice instead of
 * popping back into view. */
function applyGearVisibility() {
  gearWardrobe.forEach((g) => { g.visible = gearVisible; });
  btnGearToggle.textContent = 'Gear: ' + (gearVisible ? 'on' : 'off');
  btnGearToggle.classList.toggle('hud__btn--active', gearVisible);
}

btnGearToggle.addEventListener('click', () => {
  if (!gearWardrobe.length) {
    showHudMessage('No gear loaded yet — nothing to show or hide.');
    return;
  }
  gearVisible = !gearVisible;
  applyGearVisibility();
  showHudMessage('');
});
applyGearVisibility();

// "Gear socket" select — re-sockets the currently LOADED (real GLB) gear prop whenever the target
// bone changes. A pre-fitted prop ignores it -- the socket is baked into the file.
const gearBoneSelect = document.getElementById('gearBone');

/** Art-plan slot -> viewer socket-picker bone. The viewer picker speaks BONE names (its options
 *  are head/chest/shoulderL/…), while baked gear can name its art-plan slot (crown/visor/…); the
 *  four head slots all live on the head bone, backRig on the chest bone. */
const VIEWER_SLOT_TO_BONE = {
  crown: 'head', eye: 'head', visor: 'head', temples: 'head',
  chest: 'chest', backRig: 'chest',
  shoulderL: 'shoulderL', shoulderR: 'shoulderR', hips: 'hips',
  legL: 'legL', legR: 'legR', handR: 'handR',
};
gearBoneSelect.addEventListener('change', () => {
  if (loadedGearProp) {
    // A pre-fitted prop is authored FOR one socket — the picker can't re-seat it elsewhere.
    const fitKey = loadedGearProp.userData.championFit;
    if (fitKey) {
      withRestPose(() => attachPrefittedGear(loadedGearProp, fitKey));
      if (gearBoneSelect.value !== fitKey) showHudMessage('This gear is pre-fitted to "' + fitKey + '" — it stays there.');
    } else {
      withRestPose(() => socketProp(loadedGearProp, gearBoneSelect.value));
    }
  }
});

const gearInput = document.getElementById('gearInput');
gearInput.addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  loadGearGLB(file);
  gearInput.value = '';
});

const bonePanel = document.getElementById('bonePanel');
const btnBones = document.getElementById('btnBones');
const btnBonesClose = document.getElementById('btnBonesClose');
btnBones.addEventListener('click', () => {
  if (activeIsStandIn) {
    document.getElementById('boneList').textContent = Object.keys(standIn.nodes)
      .filter((k) => k !== 'torsoMesh')
      .join('\n') + '\n\n(stand-in — programmatic Object3D nodes, not a real skeleton)';
  }
  bonePanel.hidden = !bonePanel.hidden;
});
btnBonesClose.addEventListener('click', () => { bonePanel.hidden = true; });

const clipInput = document.getElementById('clipInput');
clipInput.addEventListener('change', (e) => {
  addClipFilesToCurrentModel(e.target.files);
  clipInput.value = '';
});

const fileInput = document.getElementById('fileInput');
fileInput.addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  readFileAsGLB(file);
});

const dropZone = document.getElementById('dropZone');
['dragenter', 'dragover'].forEach((evt) => {
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropZone.classList.add('is-dragover');
  });
});
['dragleave', 'dragend', 'drop'].forEach((evt) => {
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropZone.classList.remove('is-dragover');
  });
});
dropZone.addEventListener('drop', (e) => {
  const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  readFileAsGLB(file);
});
// Also allow dropping anywhere on the canvas, not just the small zone.
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  if (dropZone.contains(e.target)) return; // already handled above
  e.preventDefault();
  const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (file) readFileAsGLB(file);
});

// Fallback-panel chip (2026-08-26): once the champion autoloads, the panel collapses to a corner
// chip (style.css body.viewer-page .drop-zone.is-loaded). Clicking the chip expands it; clicking
// outside collapses it; Enter/Space toggle it. Drag-dropping onto the collapsed chip still works.
let fallbackChipReady = false;
function setupFallbackChip() {
  if (fallbackChipReady) return;
  fallbackChipReady = true;
  dropZone.setAttribute('role', 'button');
  dropZone.setAttribute('tabindex', '0');
  const setChipExpanded = (expanded) => {
    dropZone.classList.toggle('is-expanded', expanded);
    dropZone.setAttribute('aria-expanded', String(expanded));
  };
  setChipExpanded(false);
  dropZone.addEventListener('click', (e) => {
    if (!dropZone.classList.contains('is-loaded')) return;   // pre-load: full panel, no chip
    if (dropZone.classList.contains('is-expanded')) return;   // expanded: inner buttons work
    e.preventDefault(); // collapsed chip: expand, don't open a picker
    e.stopPropagation();
    setChipExpanded(true);
  });
  document.addEventListener('click', (e) => {
    if (dropZone.classList.contains('is-expanded') && !dropZone.contains(e.target)) setChipExpanded(false);
  });
  dropZone.addEventListener('keydown', (e) => {
    if (!dropZone.classList.contains('is-loaded')) return;
    if (e.target !== dropZone) return; // focus is on an inner control — let it do its thing
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setChipExpanded(!dropZone.classList.contains('is-expanded'));
    }
  });
}

// ---------------------------------------------------------------------------------------------
// RAF loop — all timing derives from the RAF timestamp argument, never Date.now().
// ---------------------------------------------------------------------------------------------

let lastTimestamp = null;
let elapsed = 0;
let fpsSmoothed = 0;
const fpsEl = document.getElementById('fps');
const clock = { delta: 0 };

function raf(timestamp) {
  if (lastTimestamp == null) lastTimestamp = timestamp;
  const deltaMs = timestamp - lastTimestamp;
  lastTimestamp = timestamp;
  const delta = Math.min(deltaMs / 1000, 0.1); // clamp so a tab-switch stall doesn't jump the sim
  elapsed += delta;
  clock.delta = delta;

  if (activeIsStandIn) {
    animateStandIn(standIn.nodes, standIn.baseHipY, 'idle', elapsed);
  } else if (mixer && !mocapOwnsSkeleton) {
    // While motion capture is mirroring, the mixer does not tick AT ALL — one owner per skeleton.
    // stopAllAction alone proved insufficient (the arm kept re-animating toward Idle during
    // mirror, diag 2026-08-11): gating the update is deterministic where action bookkeeping is not.
    mixer.update(delta);
  }

  controls.update();
  renderer.render(scene, camera);

  if (deltaMs > 0) {
    const instantFps = 1000 / deltaMs;
    fpsSmoothed = fpsSmoothed === 0 ? instantFps : fpsSmoothed * 0.9 + instantFps * 0.1;
    fpsEl.textContent = Math.round(fpsSmoothed) + ' fps';
  }

  requestAnimationFrame(raf);
}
requestAnimationFrame(raf);

// Expose a couple of internals for the Playwright verification pass (screenshots + state
// assertions) without changing the module's public surface for real users.
window.__champion3d = {
  toggleGear: () => btnGearToggle.click(),
  setGearBone: (key) => { gearBoneSelect.value = key; gearBoneSelect.dispatchEvent(new Event('change')); },
  get outlinesOn() { return outlinesOn; },
  get gearVisible() { return gearVisible; },
  get activeIsStandIn() { return activeIsStandIn; },
  get loadedGearSocketed() { return !!(loadedGearProp && loadedGearProp.parent); },
  get loadedGearBoneKey() { return gearBoneSelect.value; },
};

// MOTION CAPTURE (mocap.js owns the feature; this is the only coupling point). The deps hand it
// exactly the module internals it needs — skeleton access at rest, mixer arbitration, and the
// clip-button path — so a captured take behaves like any other clip once it exists.
let mocapOwnsSkeleton = false; // raf() gates mixer.update on this — one owner per skeleton
initMocap({
  THREE,
  getModel: () => (activeIsStandIn ? null : currentModel),
  withRestPose,
  pauseClips: () => {
    mocapOwnsSkeleton = true;
    if (mixer) mixer.stopAllAction();
    currentAction = null;
  },
  resumeIdle: () => {
    mocapOwnsSkeleton = false;
    currentAction = null; // the stopped action must not be crossfaded FROM — play clean
    const rest = restClipName();
    if (rest) playClip(rest, document.getElementById('clipButtons'));
  },
  addCapturedClip: (clip) => {
    if (!currentModel) return;
    ensureMixer(currentModel);
    appendClipButton(clip);
    userPickedClip = true; // replaying the child's own take is an explicit choice — respect it
    playClip(clip.name, document.getElementById('clipButtons'));
  },
  hud: showHudMessage,
});

// ---------------------------------------------------------------------------------------------
// STATIC-DEPLOY AUTOLOAD — appended by the bundler, not present in the repo source.
//
// The repo viewer requires a drag-drop or file-picker because it is opened from disk, where a
// fetch() of a local .glb is blocked. A deployed build is served over HTTPS, so it can fetch its
// own assets and the reviewer just opens a link — which is the whole point of handing this to a
// team for tablet testing.
//
// Everything below reuses the module's existing loaders rather than reimplementing them, so the
// deployed build and the local build share one code path.
// ---------------------------------------------------------------------------------------------
(async function autoloadChampion() {
  const BASE = './assets/champion-base.glb';
  const CLIPS = ['idle', 'walk', 'wave', 'silly', 'rumba'];

  const hud = document.getElementById('hudMessage');
  const say = (m) => { if (hud) hud.textContent = m; };
  const progress = progressUI(); // champion base + wardrobe + clips all report progress now

  // Hide the capsule stand-in for the whole load. It exists to signal "no GLB chosen yet" in the
  // local drag-drop workflow, but in a deployed build a champion IS coming — so showing a
  // placeholder body for the seconds it takes ~19MB to arrive just invites reviewers to react to
  // the wrong model. Restored only if the load actually fails, where it again means what it says.
  const standInRoot = (typeof standIn !== 'undefined' && standIn && standIn.root) || null;
  if (standInRoot) standInRoot.visible = false;

  try {
    say('Loading champion…');
    progress.show('Loading champion', 0);
    const baseBuffer = await fetchWithProgress(BASE, (p) => progress.show('Loading champion', p));
    loadGLBFromArrayBuffer(baseBuffer, 'champion-base.glb');
    // Fetch done, but parse + texture decode take a moment — go indeterminate rather than
    // sitting at a finished-looking bar while the model is not on screen yet.
    progress.show('Loading champion', null);

    // loadGLBFromArrayBuffer resolves through GLTFLoader.parse's callback, not a promise, so poll
    // the state flag the module already exposes rather than racing it with a fixed delay. The
    // timeout keeps a failed parse from hanging here forever — the drop zone still works.
    await new Promise((resolve) => {
      const started = Date.now();
      const tick = setInterval(() => {
        if (!window.__champion3d.activeIsStandIn || Date.now() - started > 30000) {
          clearInterval(tick);
          resolve();
        }
      }, 100);
    });

    if (window.__champion3d.activeIsStandIn) throw new Error('champion GLB failed to parse');

    // Gear: EVERY shared piece in assets/gear/manifest.json (baked pre-fitted GLBs — placement
    // lives in each file, the viewer just attaches at the championFit socket). Loaded — and
    // AWAITED — before the clips, so the champion stays in T-pose until fully dressed:
    // loadGearGLB is fire-and-forget (FileReader + async parse), and letting clips start while
    // a gear was still parsing once attached the kabuto against a mid-Idle pose. withRestPose
    // now guards the attach itself, but keeping "dress first, dance second" also means the
    // reviewer never sees a half-dressed dancer. Best-effort: a miss logs and skips.
    try {
      // THE SHARED WARDROBE (wardrobe-store.js) replaces the default shelf entirely: whatever
      // is worn in the Fit Studio right now is what dances here — switching pages IS the
      // fit-then-watch loop, nothing to send or re-upload. The read does NOT clear the store,
      // so hopping back to the studio (or reloading either page) keeps every piece. A stored
      // EMPTY wardrobe means the fitter removed everything — respect it (bare champion), do not
      // resurrect the demo shelf. Only a visitor who has never used the studio (nothing stored)
      // gets the manifest demo below.
      let pieces = null;
      try {
        const { loadWardrobe } = await import('./wardrobe-store.js');
        const stored = await loadWardrobe();
        if (stored) pieces = stored.map((p) => new File([p.buffer], p.name));
      } catch (sErr) {
        console.error('[autoload wardrobe]', sErr);
      }
      if (!pieces) {
        // Manifest schema is now {file,label,category} objects (2026-08-25); plain filename
        // strings still work. ?m= busts heuristic caching so newly published gear shows up.
        const m = await fetch('./assets/gear/manifest.json?m=' + Date.now());
        const raw = m.ok ? await m.json() : ['red-samurai-helmet.glb'];
        const names = (Array.isArray(raw) ? raw : [])
          .map((n) => (typeof n === 'string' ? n : n && n.file))
          .filter(Boolean);
        pieces = [];
        for (const n of names) {
          // fetch can THROW (network blip) as well as return !ok — either way the piece is
          // skipped, never allowed to abort the whole dressing (2026-08-26, mirror of the
          // clip-batch guard: one dead link must not leave the champion half-dressed).
          let g;
          try {
            g = await fetch('./assets/gear/' + encodeURIComponent(n));
          } catch (err) {
            console.error('[autoload gear]', n, err);
            continue;
          }
          if (!g.ok) { console.error('[autoload gear]', n, 'HTTP ' + g.status); continue; }
          try {
            pieces.push(new File([await g.blob()], n));
          } catch (err) {
            console.error('[autoload gear]', n, err);
          }
        }
      }
      const total = pieces.length;
      for (let i = 0; i < total; i++) {
        const f = pieces[i];
        // Progress bar tracks the WHOLE dressing sequence (piece i+1 of total); the label names
        // the piece being dressed so a long rack never looks stalled.
        const label = 'Dressing ' + (i + 1) + ' / ' + total + ' — ' + f.name.replace(/\.glb$/i, '');
        progress.show(label, i / total);
        // Await by adoption COUNT — a slot-swap replaces a worn piece, leaving the length flat.
        const wornBefore = gearWearSeq;
        loadGearGLB(f);
        await new Promise((resolve) => {
          const started = Date.now();
          const tick = setInterval(() => {
            if (gearWearSeq > wornBefore || Date.now() - started > 10000) {
              clearInterval(tick);
              resolve();
            }
          }, 50);
        });
        progress.show(label, (i + 1) / total);
      }
    } catch (gearErr) {
      console.error('[autoload gear]', gearErr);
    }

    // addClipFilesToCurrentModel expects File objects (it reads them with FileReader), so wrap
    // each fetched blob in one. Cheaper than duplicating the clip-binding logic, and it keeps a
    // single implementation of the "does this GLB actually contain animations" check.
    progress.show('Loading clips', null); // tiny files, no reliable length — indeterminate
    const files = [];
    for (const name of CLIPS) {
      const r = await fetch(`./assets/clips/${name}.glb`);
      if (r.ok) files.push(new File([await r.blob()], name + '.glb'));
    }
    if (files.length) addClipFilesToCurrentModel(files);
    progress.hide();
    say(`Champion loaded — ${files.length} clips, ${gearWardrobe.length} piece(s) worn.`);
  } catch (err) {
    progress.hide();
    // Loud, not silent: if autoload fails the reviewer must know to use the drop zone rather than
    // assume the stand-in capsule robot IS the champion. The stand-in comes back here because in
    // this branch it is once again telling the truth — nothing is loaded.
    if (standInRoot) standInRoot.visible = true;
    say('Auto-load failed (' + err.message + ') — drop a GLB manually.');
    console.error('[autoload]', err);
  }
})();
