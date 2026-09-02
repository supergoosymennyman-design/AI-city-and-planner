// labels.js — floating bilingual building labels via THREE.CSS2DRenderer.
// One DOM badge per curriculum landmark, fading out with camera distance.
import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const ZH_NAMES = {
  'Recycling Lab': '資源回收實驗室',
  'Construction Site': '智慧建築地盤',
  'Robot Depot': '機械人車廠',
  'Drone Hub': '無人機樞紐',
  'Swarm Centre': '群策調度中心',
  'Delivery Loop': '物流調度站',
  'Bus Station': '智能巴士總站',
  'Health Clinic': '智能診所',
  'Water Works': '水務工程站',
  'Power Station': '智能發電站',
  'Watch Tower': '監測塔',
  'Traffic Centre': '交通指揮中心',
  'Prediction Lab': '預測實驗室',
  'Air Control': '航空管制中心',
  'Mint Exchange': '鑄幣交易所',
  'Mood Square': '情緒分析廣場',
  'Treasury': '智能財政部',
};

export function createLabelRenderer(container) {
  const renderer = new CSS2DRenderer();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.domElement.style.position = 'absolute';
  renderer.domElement.style.top = '0';
  renderer.domElement.style.left = '0';
  renderer.domElement.style.pointerEvents = 'none';
  container.appendChild(renderer.domElement);
  return renderer;
}

export function addBuildingLabel(scene, building, worldPosY) {
  const zh = ZH_NAMES[building.name] || '';
  const el = document.createElement('div');
  el.className = 'building-label';
  el.innerHTML = zh
    ? `<div class="bl-zh">${zh}</div><div class="bl-en">${building.name}</div>`
    : `<div class="bl-en">${building.name}</div>`;
  const label = new CSS2DObject(el);
  label.position.copy(worldPosY);
  label.userData.mesh = building.mesh;
  scene.add(label);
  return label;
}

const _worldPos = new THREE.Vector3();

// Update label opacity each frame based on camera distance.
export function updateLabels(labels, camera) {
  for (const l of labels) {
    const mesh = l.userData.mesh;
    if (!mesh) continue;
    mesh.getWorldPosition(_worldPos);
    const dist = camera.position.distanceTo(_worldPos);
    const op = Math.max(0, Math.min(1, 1 - (dist - 12) / 23)); // visible <12, gone by 35
    l.element.style.opacity = op.toFixed(2);
  }
}
