// home/champion.js — a live 3D rotating AI champion in the hub header.
//
// Loads the champion GLB with vendored three.js, centres/grounds it the same
// way the city does, and slowly rotates it so the hub feels alive.
//
// Note: the champion is shown in its bind pose (no clip playback). The baked
// "Idle" clip lifts the whole skeleton ~1 unit off the ground, which would push
// the head out of frame — the bind pose is already a natural standing pose and
// frames cleanly on the turntable.
//
// Graceful degradation: the static SVG illustration stays in the DOM and is
// shown whenever WebGL is unavailable, the import map is missing, or the model
// fails to load — the page is a launcher, so it must never look broken.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const host = document.getElementById('champion-host');
if (!host) throw new Error('[home-champion] #champion-host missing');

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch { return false; }
}

/** Show the SVG illustration (default state) and drop any half-built canvas. */
function useFallback(reason) {
  if (reason) console.warn('[home-champion] using illustration:', reason);
  host.querySelectorAll('canvas').forEach((c) => c.remove());
  host.classList.remove('has3d');
  host.classList.add('no3d');
}

/** Build the loader the same way shared/gltf.js does — DRACO + Meshopt
 *  decoders configured — so any compressed champion GLB loads here too. Home is
 *  a self-contained bundle (no shared/ folder), hence this local mirror. */
function createDecoderLoader() {
  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath('/vendor/three/addons/libs/draco/gltf/');
  loader.setDRACOLoader(draco);
  loader.setMeshoptDecoder(MeshoptDecoder);
  return loader;
}

if (!hasWebGL()) {
  useFallback('no WebGL');
} else {
  const loader = createDecoderLoader();
  loader.load('champion.glb', (gltf) => {
    try {
      const raw = gltf.scene;

      // Normalize like champion-real.js: centre X/Z and drop the lowest point
      // to y=0, reading WORLD bounds so the cm-scale armature vs 0.01-counter-
      // scaled mesh is handled by the node transforms, not guessed at.
      raw.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(raw);
      if (!box.isEmpty()) {
        const center = box.getCenter(new THREE.Vector3());
        const height = box.getSize(new THREE.Vector3()).y;
        raw.position.x -= center.x;
        raw.position.z -= center.z;
        raw.position.y -= box.min.y;
        raw.userData.height = Math.max(height, 0.001);
      } else {
        raw.userData.height = 2.0;
      }

      // Renderer.
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.setClearColor(0x000000, 0);
      host.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 50);

      // Cool key + cyan rim against the hub's dark slate background.
      scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x0d1420, 1.0));
      const key = new THREE.DirectionalLight(0xffffff, 1.8);
      key.position.set(2.5, 4, 3.5);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0x00e5ff, 1.2);
      rim.position.set(-3.5, 1.5, -2.5);
      scene.add(rim);
      const under = new THREE.DirectionalLight(0x334155, 0.5);
      under.position.set(0, -2, -3);
      scene.add(under);

      const champ = new THREE.Group();
      champ.add(raw);
      scene.add(champ);
      // Normalize the WHOLE group to a fixed display height so framing stays
      // consistent regardless of the model's native units.
      champ.scale.setScalar(2.0 / raw.userData.height);

      // Skinned meshes flicker with frustum culling; disabling it also avoids
      // relying on the model's (sometimes NaN) accessor bounds metadata.
      raw.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });

      // Auto-frame the scaled model: aim at its vertical centre and back the
      // camera off until head + feet both fit with clear margin. This is
      // measured AFTER scaling so it is correct for any native model units.
      champ.updateMatrixWorld(true);
      const finalBox = new THREE.Box3().setFromObject(champ);
      const emptyBox = finalBox.isEmpty();
      const midY = emptyBox ? 1.0 : (finalBox.min.y + finalBox.max.y) / 2;
      const span = emptyBox ? 2.0 : (finalBox.max.y - finalBox.min.y);
      const dist = Math.max(2.6, (span / 2) * 1.35 / Math.tan((36 * Math.PI) / 360));
      camera.position.set(0, midY, dist);
      camera.lookAt(0, midY, 0);

      let raf = 0;

      function fit() {
        const w = host.clientWidth || 96;
        const h = host.clientHeight || 96;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(w, h, false);
      }
      fit();
      const ro = new ResizeObserver(fit);
      ro.observe(host);

      function animate() {
        raf = requestAnimationFrame(animate);
        const t = performance.now() / 1000;
        champ.rotation.y = t * 0.6;                       // slow turntable spin
        champ.position.y = Math.sin(t * 0.9) * 0.03;      // tiny idle bob
        renderer.render(scene, camera);
      }

      // Free the GPU when the tab is hidden; resume when visible again.
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) { if (raf) { cancelAnimationFrame(raf); raf = 0; } }
        else if (!raf && host.classList.contains('has3d')) animate();
      });

      // Hide the SVG now that the real champion is on screen.
      host.classList.add('has3d');
      const img = host.querySelector('img');
      if (img) img.style.display = 'none';
      animate();
    } catch (e) {
      useFallback(e && e.message ? e.message : 'render failed');
    }
  }, undefined, (e) => {
    useFallback('GLB load failed');
  });
}
