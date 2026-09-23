import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

let loader = null;

function getLoader() {
  if (!loader) {
    loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath('./draco/');
    loader.setDRACOLoader(draco);
  }
  return loader;
}

export function importGLBFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    getLoader()
      .loadAsync(url)
      .then((gltf) => {
        URL.revokeObjectURL(url);
        // Older dressed downloads accidentally included editor decorations. Drop
        // them before measuring the file, so ghost outlines cannot affect sizing.
        const helpers = [];
        gltf.scene.traverse(o => { if (o.name === '__outline' || o.userData?.isOutline || o.userData?.isJointBall || o.userData?.isRigLink) helpers.push(o); });
        helpers.forEach(o => o.removeFromParent());
        normalize(gltf.scene);
        resolve(gltf);
      })
      .catch((err) => {
        URL.revokeObjectURL(url);
        reject(err);
      });
  });
}

function normalize(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return;
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  // Size the model by its HEIGHT (y), not its max extent — the studio's rigs are
  // ~1.7 tall and a wide/long authored doc (e.g. a champion whose extent is its
  // z-depth) must still come back ~1.7 tall, not collapse to a fraction of it.
  const scale = 1.7 / Math.max(size.y, 1e-6);
  root.scale.setScalar(scale);
  root.position.sub(center.multiplyScalar(scale));
}

/** The group as a binary glTF (ArrayBuffer): skinned meshes carry their skeleton and skin. With
 * `rig` (a SkeletonGraph.toJSON()) the joint graph rides in the exported root's `extras.rig` —
 * GLTFExporter writes `userData` out as extras and GLTFLoader reads extras back into `userData`,
 * so the studio's own file brings its skeleton back exactly (Task 11). */
export async function buildGLB(group, clip = null, rig = null, champion = null) {
  const exporter = new GLTFExporter();
  const options = { binary: true };
  if (clip) options.animations = Array.isArray(clip) ? clip : [clip];
  if (rig) group.userData.rig = rig;
  if (champion) group.userData.passionaChampion = champion;
  try {
    return await exporter.parseAsync(group, options);
  } finally {
    if (rig) delete group.userData.rig; // the document root never keeps it: the graph lives in the rig
    if (champion) delete group.userData.passionaChampion;
  }
}

export function downloadGLB(data, filename) {
  const blob = new Blob([data], { type: 'model/gltf-binary' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

export async function exportGLB(group, clip, filename = 'my-champion.glb', rig = null) {
  downloadGLB(await buildGLB(group, clip, rig), filename);
}
