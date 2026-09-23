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
  // Build DOM nodes instead of innerHTML so a name (from the library/catalog)
  // can never be interpreted as markup — defence in depth for injected labels.
  if (zh) {
    const zhDiv = document.createElement('div');
    zhDiv.className = 'bl-zh';
    zhDiv.textContent = zh;
    el.appendChild(zhDiv);
    const enDiv = document.createElement('div');
    enDiv.className = 'bl-en';
    enDiv.textContent = building.name;
    el.appendChild(enDiv);
  } else {
    const enDiv = document.createElement('div');
    enDiv.className = 'bl-en';
    enDiv.textContent = building.name;
    el.appendChild(enDiv);
  }
  const label = new CSS2DObject(el);
  label.position.copy(worldPosY);
  label.userData.mesh = building.mesh;
  scene.add(label);
  return label;
}

const _worldPos = new THREE.Vector3();

// Update label opacity each frame based on camera distance + altitude. Labels
// are CSS2D objects anchored at a world position, so we measure straight from
// the camera to that anchor (works for mesh-less labels too).
//   - Close ramp: fade in as you approach a landmark.
//   - Far ramp: fade out past ~150 m so street-level views aren't crowded.
//   - Altitude LOD: above `altLodY` only `.quest-label` (mission) badges show,
//     hard-capped at `maxVisible` nearest-to-camera — the rest drop to opacity 0
//     so aerial views show the city, not a badge storm.
export const LABEL_FADE_NEAR = 18;     // m — fully opaque within this range
export const LABEL_FADE_FAR = 250;     // m — fully transparent beyond this
export function updateLabels(labels, camera, opts = {}) {
  const altLodY = opts.altLodY ?? 120;
  const highAlt = camera.position.y > altLodY;
  const maxVisible = opts.maxVisible ?? (highAlt ? 6 : 12);
  const distances = new Map();         // label → distance from camera

  const distFor = (l) => {
    let d = distances.get(l);
    if (d === undefined) {
      const mesh = l.userData && l.userData.mesh;
      if (mesh) mesh.getWorldPosition(_worldPos);
      else _worldPos.copy(l.position);
      d = camera.position.distanceTo(_worldPos);
      distances.set(l, d);
    }
    return d;
  };

  // At altitude: candidate set = mission labels only. At street level all show.
  const candidates = highAlt ? labels.filter((l) => l.element.classList.contains('quest-label')) : labels;

  // Hard cap by distance from the camera so far-away badges never linger.
  const priority = l => l.element.classList.contains('gateway-label') ? -2 : l.element.classList.contains('learning-label') ? -1 : l.element.classList.contains('selected-label') || l.element.classList.contains('destination-label') ? 0 : l.element.classList.contains('quest-label') ? 1 : 2;
  const visible = candidates.length > maxVisible
    ? candidates.slice().sort((a, b) => priority(a)-priority(b) || distFor(a) - distFor(b)).slice(0, maxVisible)
    : candidates;
  const visibleSet = new Set(visible);

  for (const l of labels) {
    const isHiddenByLod = highAlt && !l.element.classList.contains('quest-label');
    const isCapped = !visibleSet.has(l);
    if (isHiddenByLod || isCapped) { l.element.style.opacity = '0'; continue; }
    const dist = distFor(l);
    // These two permanent destinations are named even in the opening overview.
    // Other building labels retain the ordinary distance and altitude limits.
    if (l.element.classList.contains('gateway-label') || l.element.classList.contains('learning-label')) {
      l.element.style.opacity = '1';
      continue;
    }
    // Close ramp keeps labels readable next to the building; far ramp stops the
    // altitude badge storm. Combine the two into one opacity curve.
    const closeFade = Math.max(0, Math.min(1, (dist - 10) / (LABEL_FADE_NEAR - 10))); // 0 → 1 by 18 m
    const farFade = Math.max(0, Math.min(1, 1 - (dist - 150) / (LABEL_FADE_FAR - 150))); // 1 → 0 past 250 m
    l.element.style.opacity = (closeFade * farFade).toFixed(2);
  }
}
