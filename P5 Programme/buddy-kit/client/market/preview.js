import * as THREE from 'three';
import { getAccessory, buildAccessoryMesh } from '../champion-city/accessories.js';
import { applyFinishToObject } from '../city-common/champion-finishes.js';
import { applyHostUpgrade } from '../city-common/host-upgrades.js';
import { createSkillHostRoot, newSkillHostRecord } from '../city-builder/skill-hosts.js';
import { createLandmarkRoot, makeLandmarkRecord } from '../city-builder/landmark-workshop.js';

let renderer;
export function cosmeticPreview(entry) {
  renderer ||= new THREE.WebGLRenderer({ antialias:true, alpha:true, preserveDrawingBuffer:true });
  renderer.setSize(240,160); renderer.setPixelRatio(1);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff,0x667788,3));
  const light=new THREE.DirectionalLight(0xffffff,3); light.position.set(4,8,5); scene.add(light);
  let root;
  if (entry.kind === 'accessory') root = buildAccessoryMesh(getAccessory(entry.championAccessory));
  else if (entry.kind === 'landmark') root = createLandmarkRoot(makeLandmarkRecord(entry.landmarkTemplate));
  else if (entry.kind === 'host-upgrade') { root = createSkillHostRoot(newSkillHostRecord('sorter')); applyHostUpgrade(root,entry.hostUpgrade); }
  else if (entry.kind === 'finish') {
    root = new THREE.Mesh(new THREE.SphereGeometry(1,32,24),new THREE.MeshStandardMaterial());
    applyFinishToObject(root,entry.finish);
  }
  if (!root) return null;
  scene.add(root);
  const box=new THREE.Box3().setFromObject(root), center=box.getCenter(new THREE.Vector3());
  const size=box.getSize(new THREE.Vector3()).length() || 1;
  const camera=new THREE.PerspectiveCamera(35,1.5,.01,size*20);
  camera.position.copy(center).add(new THREE.Vector3(size*.85,size*.55,size*1.3)); camera.lookAt(center);
  renderer.render(scene,camera);
  const url=renderer.domElement.toDataURL();
  root.userData.dispose?.();
  root.traverse(node => { node.geometry?.dispose(); const mats=Array.isArray(node.material)?node.material:[node.material]; for(const mat of mats) mat?.dispose(); });
  return url;
}
