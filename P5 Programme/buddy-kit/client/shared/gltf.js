// Shared GLTFLoader factory — configured with Draco + Meshopt decoders so that
// Sketchfab-sourced GLBs (Draco- or meshopt-compressed) load correctly.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

let sharedLoader = null;

export function createGLTFLoader() {
  if (!sharedLoader) {
    const loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath('/vendor/three/addons/libs/draco/gltf/');
    loader.setDRACOLoader(draco);
    loader.setMeshoptDecoder(MeshoptDecoder);
    sharedLoader = loader;
  }
  return sharedLoader;
}
