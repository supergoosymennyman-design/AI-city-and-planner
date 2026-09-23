import * as THREE from 'three';
import { createGLTFLoader } from '../shared/gltf.js';
import { blobToObjectUrl, loadCustomSkinBlob, revokeObjectUrl } from '../champion-city/custom-skin.js';

const host = document.getElementById('champion-host');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

function hasWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl')));
  } catch { return false; }
}

function useFallback(reason) {
  if (reason) console.warn('[project-hub champion] using fallback:', reason);
  host?.querySelectorAll('canvas').forEach(canvas => canvas.remove());
  host?.classList.remove('has3d');
  host?.classList.add('no3d');
}

async function mountChampion() {
  if (!host || !hasWebGL()) { useFallback('WebGL unavailable'); return; }
  let objectUrl = null;
  try {
    const custom = await loadCustomSkinBlob();
    objectUrl = custom ? blobToObjectUrl(custom) : null;
    let gltf;
    try { gltf = await createGLTFLoader().loadAsync(objectUrl || '/champion-city/assets/clips/idle.glb'); }
    catch (error) {
      if (!objectUrl) throw error;
      revokeObjectUrl(objectUrl); objectUrl = null;
      gltf = await createGLTFLoader().loadAsync('/champion-city/assets/clips/idle.glb');
    }
    const raw = gltf.scene;
    raw.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(raw);
    const center = box.getCenter(new THREE.Vector3());
    const height = Math.max(box.getSize(new THREE.Vector3()).y, .001);
    raw.position.set(raw.position.x - center.x, raw.position.y - box.min.y, raw.position.z - center.z);
    raw.traverse(object => { if (object.isMesh) object.frustumCulled = false; });

    const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.setClearColor(0, 0);
    host.append(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, .1, 50);
    scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x0d1420, 1));
    const key = new THREE.DirectionalLight(0xffffff, 1.8); key.position.set(2.5, 4, 3.5); scene.add(key);
    const rim = new THREE.DirectionalLight(0x00e5ff, 1.2); rim.position.set(-3.5, 1.5, -2.5); scene.add(rim);
    const champion = new THREE.Group(); champion.add(raw); champion.scale.setScalar(2 / height); scene.add(champion);
    champion.updateMatrixWorld(true);
    const framed = new THREE.Box3().setFromObject(champion);
    const middle = (framed.min.y + framed.max.y) / 2;
    const span = Math.max(.1, framed.max.y - framed.min.y);
    camera.position.set(0, middle, Math.max(2.6, (span / 2) * 1.35 / Math.tan(36 * Math.PI / 360)));
    camera.lookAt(0, middle, 0);

    const fit = () => {
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
      renderer.setSize(host.clientWidth || 112, host.clientHeight || 112, false);
    };
    fit();
    const observer = new ResizeObserver(fit); observer.observe(host);
    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      if (!reducedMotion.matches) champion.rotation.y = performance.now() / 1900;
      renderer.render(scene, camera);
    };
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && frame) { cancelAnimationFrame(frame); frame = 0; }
      else if (!document.hidden && !frame && host.classList.contains('has3d')) animate();
    });
    renderer.render(scene, camera); host.classList.add('has3d'); animate();
  } catch (error) { revokeObjectUrl(objectUrl); useFallback(error?.message || 'model failed'); }
}

mountChampion();
