// accessories.js — modular cosmetic items for the AI champion.
//
// Instead of one monolithic skin, students mix and match small items across
// body-part slots (head, face, back). Each item is a small mesh attached to a
// bone (e.g. mixamorig:Head) so it follows the champion's animations.
//
// Items can be procedural placeholders (`build`) OR Hunyuan3D-generated GLBs
// (`glb` path under /champion-city/assets/). GLBs are preloaded once via
// preloadAccessories() and cloned per equip (shared geometry — never disposed).
//
// Some items carry curriculum tags (e.g. vision goggles → vision lessons);
// most are pure fun with no rationale required.
import * as THREE from 'three';
import { createGLTFLoader } from '../shared/gltf.js';

export const ACC_STORAGE_KEY = 'hk_ai_city_accessories_v1';

export const ACC_SLOTS = [
  { id: 'head', label: 'Head', labelKey: 'acc.slot.head', icon: '🧢' },
  { id: 'face', label: 'Face', labelKey: 'acc.slot.face', icon: '👓' },
  { id: 'ears', label: 'Ears', labelKey: 'acc.slot.ears', icon: '👂' },
  { id: 'chest', label: 'Chest', labelKey: 'acc.slot.chest', icon: '🛡️' },
  { id: 'back', label: 'Back', labelKey: 'acc.slot.back', icon: '🎒' },
];

// ---- Item geometry builders (placeholders; return THREE.Group) ----
function group(...children) { const g = new THREE.Group(); children.forEach(c => g.add(c)); return g; }
function stdMat(color, opts = {}) { return new THREE.MeshStandardMaterial({ color, roughness: opts.roughness ?? 0.6, metalness: opts.metalness ?? 0.2, emissive: opts.emissive ?? 0x000000, emissiveIntensity: opts.emissiveIntensity ?? 0 }); }
function mesh(geo, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; }

// --- Head slot ---
function buildCrown() {
  const gold = stdMat(0xffd166, { metalness: 0.8, roughness: 0.3, emissive: 0x8a5a00, emissiveIntensity: 0.35 });
  const gems = stdMat(0xff2f7f, { roughness: 0.15, emissive: 0xff2f7f, emissiveIntensity: 0.6 });
  const parts = [];
  parts.push(mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.1, 12), gold, 0, 0.14, 0));
  for (let i = 0; i < 5; i++) {
    const a = (Math.PI * 2 / 5) * i - Math.PI / 2;
    parts.push(mesh(new THREE.ConeGeometry(0.07, 0.18, 4), gold, Math.cos(a) * 0.18, 0.26, Math.sin(a) * 0.18));
  }
  parts.push(mesh(new THREE.SphereGeometry(0.05, 8, 6), gems, 0, 0.36, 0));
  return group(...parts);
}
function buildVRHeadset() {
  const dark = stdMat(0x1a2026, { roughness: 0.4, metalness: 0.3 });
  const cyan = stdMat(0x00f2fe, { emissive: 0x00f2fe, emissiveIntensity: 0.8, roughness: 0.3 });
  const parts = [];
  parts.push(mesh(new THREE.BoxGeometry(0.26, 0.14, 0.16), dark, 0, 0.2, 0.02));
  parts.push(mesh(new THREE.BoxGeometry(0.2, 0.05, 0.1), dark, 0, 0.27, -0.04));
  parts.push(mesh(new THREE.BoxGeometry(0.08, 0.06, 0.02), cyan, -0.07, 0.2, 0.1));
  parts.push(mesh(new THREE.BoxGeometry(0.08, 0.06, 0.02), cyan, 0.07, 0.2, 0.1));
  return group(...parts);
}
function buildHardHat() {
  const yellow = stdMat(0xffc53d, { roughness: 0.5, metalness: 0.1 });
  const parts = [];
  parts.push(mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.06, 16), yellow, 0, 0.3, 0));
  parts.push(mesh(new THREE.SphereGeometry(0.24, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), yellow, 0, 0.3, 0));
  return group(...parts);
}

// --- Face slot ---
function buildGlasses() {
  const cyan = stdMat(0x00f2fe, { emissive: 0x00f2fe, emissiveIntensity: 0.7, roughness: 0.2 });
  const dark = stdMat(0x11161c, { roughness: 0.3, metalness: 0.4 });
  const parts = [];
  parts.push(mesh(new THREE.TorusGeometry(0.08, 0.018, 8, 16), cyan, -0.09, 0.24, 0.06));
  parts.push(mesh(new THREE.TorusGeometry(0.08, 0.018, 8, 16), cyan, 0.09, 0.24, 0.06));
  parts.push(mesh(new THREE.BoxGeometry(0.06, 0.02, 0.015), dark, 0, 0.24, 0.07));
  return group(...parts);
}
function buildMonocle() {
  const gold = stdMat(0xffd166, { metalness: 0.9, roughness: 0.25 });
  const lens = stdMat(0x9fd8ff, { emissive: 0x00aaff, emissiveIntensity: 0.3, roughness: 0.1, transparent: true, opacity: 0.6 });
  const parts = [];
  parts.push(mesh(new THREE.TorusGeometry(0.055, 0.014, 8, 16), gold, 0.12, 0.22, 0.06));
  parts.push(mesh(new THREE.CircleGeometry(0.048, 12), lens, 0.12, 0.22, 0.07));
  return group(...parts);
}
function buildVisor() {
  const blue = stdMat(0x1a6ea8, { emissive: 0x2a9bff, emissiveIntensity: 0.4, roughness: 0.2, metalness: 0.3, transparent: true, opacity: 0.75 });
  const parts = [];
  parts.push(mesh(new THREE.BoxGeometry(0.3, 0.1, 0.06), blue, 0, 0.24, 0.06));
  return group(...parts);
}

// --- Back slot ---
function buildWings() {
  const wingMat = stdMat(0x2a9bff, { emissive: 0x00d4ff, emissiveIntensity: 0.55, roughness: 0.3, transparent: true, opacity: 0.85 });
  function wing(side) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(0.42 * side, 0.1);
    shape.lineTo(0.5 * side, 0.5);
    shape.lineTo(0.28 * side, 0.78);
    shape.lineTo(0.14 * side, 0.55);
    shape.lineTo(0, 0.72);
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    return new THREE.Mesh(geo, wingMat);
  }
  const l = wing(-1), r = wing(1);
  l.position.set(0, 0, 0); r.position.set(0, 0, 0);
  return group(l, r);
}
function buildJetpack() {
  const metal = stdMat(0x2a3a4a, { metalness: 0.8, roughness: 0.35 });
  const orange = stdMat(0xff8c2e, { emissive: 0xff6a00, emissiveIntensity: 0.9 });
  const parts = [];
  parts.push(mesh(new THREE.BoxGeometry(0.34, 0.44, 0.18), metal, 0, 0.32, -0.1));
  parts.push(mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.2, 12), orange, -0.11, 0.14, -0.14));
  parts.push(mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.2, 12), orange, 0.11, 0.14, -0.14));
  return group(...parts);
}
function buildBackpack() {
  const teal = stdMat(0x1fb6a0, { roughness: 0.7, metalness: 0.1 });
  const parts = [];
  parts.push(mesh(new THREE.BoxGeometry(0.4, 0.48, 0.2), teal, 0, 0.34, -0.12));
  parts.push(mesh(new THREE.BoxGeometry(0.18, 0.14, 0.08), stdMat(0xffffff), 0, 0.4, -0.17));
  return group(...parts);
}

// ---- Registry ----
// Bone names verified from the actual GLB export: this Mixamo pipeline names
// bones WITHOUT the colon (mixamorigHead, mixamorigSpine2, …).
// Items use `build` placeholder procedural geometry.
export const ACCESSORIES = [
  { id: 'head_crown',    name: 'Royal Crown',    nameKey: 'acc.head_crown',    slot: 'head', bone: 'mixamorigHead',   off: [0, 0.35, 0],      tags: ['lesson1'], build: buildCrown },
  { id: 'head_vr',       name: 'VR Headset',     nameKey: 'acc.head_vr',       slot: 'head', bone: 'mixamorigHead',   off: [0, 0.22, 0],      tags: ['lesson3'], build: buildVRHeadset },
  { id: 'head_hardhat',  name: 'Smart Hard Hat', nameKey: 'acc.head_hardhat',  slot: 'head', bone: 'mixamorigHead',   off: [0, 0.28, 0],      tags: [],          build: buildHardHat },
  { id: 'face_glasses',  name: 'Smart Glasses',  nameKey: 'acc.face_glasses',  slot: 'face', bone: 'mixamorigHead',   off: [0, 0.24, 0.06],   tags: ['lesson5'], build: buildGlasses },
  { id: 'face_monocle',  name: 'Gold Monocle',   nameKey: 'acc.face_monocle',  slot: 'face', bone: 'mixamorigHead',   off: [0.12, 0.22, 0.06], tags: [],          build: buildMonocle },
  { id: 'face_visor',    name: 'Holo Visor',     nameKey: 'acc.face_visor',    slot: 'face', bone: 'mixamorigHead',   off: [0, 0.24, 0.06],   tags: ['lesson3'], build: buildVisor },
  { id: 'back_wings',    name: 'Cyber Wings',    nameKey: 'acc.back_wings',    slot: 'back', bone: 'mixamorigSpine2', off: [0, 0.15, -0.05],  tags: [],          build: buildWings },
  { id: 'back_jetpack',  name: 'Rocket Pack',    nameKey: 'acc.back_jetpack',  slot: 'back', bone: 'mixamorigSpine2', off: [0, 0.12, -0.1],   tags: ['lesson7'], build: buildJetpack },
  { id: 'back_backpack', name: 'Tech Backpack',  nameKey: 'acc.back_backpack', slot: 'back', bone: 'mixamorigSpine2', off: [0, 0.15, -0.12],  tags: [],          build: buildBackpack },
];

export function accessoriesForSlot(slot) { return ACCESSORIES.filter(a => a.slot === slot); }
export function getAccessory(id) { return ACCESSORIES.find(a => a.id === id) || null; }

export function loadEquipped() {
  try { return JSON.parse(localStorage.getItem(ACC_STORAGE_KEY)) || {}; } catch (e) { return {}; }
}
export function saveEquipped(map) {
  try { localStorage.setItem(ACC_STORAGE_KEY, JSON.stringify(map)); } catch (e) { /* ignore */ }
}

// ---- Hunyuan GLB loading (preload once, clone per equip) ----
let _assetBase = '/champion-city/assets/';
const _glbCache = new Map();   // itemId -> { group, size }
const _loader = createGLTFLoader();

export function preloadAccessories(assetBase) {
  _assetBase = assetBase || _assetBase;
  for (const item of ACCESSORIES) {
    if (!item.glb) continue;
    _loader.load(_assetBase + item.glb, (gltf) => {
      const g = gltf.scene || gltf.scenes?.[0];
      if (!g) return;
      // Normalize: centre horizontally, feet at y=0, scale to ~0.9m tall.
      const box = new THREE.Box3().setFromObject(g);
      const size = box.getSize(new THREE.Vector3());
      const cx = (box.min.x + box.max.x) / 2;
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const s = 0.9 / maxDim;
      g.scale.setScalar(s);
      g.position.x -= cx * s;
      g.position.y -= box.min.y * s;
      _glbCache.set(item.id, { group: g, size: size.clone().multiplyScalar(s) });
    }, undefined, (err) => console.warn('accessory GLB load failed:', item.id, err));
  }
}

// Build a standalone mesh/group for an accessory (disposed on unequip).
export function buildAccessoryMesh(item) {
  if (!item) return null;
  // Hunyuan GLB: clone the preloaded scene (shared geometry — do NOT dispose)
  const cached = _glbCache.get(item.id);
  if (item.glb && cached) {
    const clone = cached.group.clone();
    clone.traverse((n) => {
      if (n.isMesh) {
        n.castShadow = false;
        n.receiveShadow = false;
        if (n.material) {
          // make materials non-emissive-ish? keep as-is — Hunyuan PBR is fine.
        }
      }
    });
    // Paired ears: the design is a single ear; mirror it to the other side.
    if (item.mirror) {
      const half = item.mirror;
      const left = clone;
      const right = left.clone();
      right.scale.x = -Math.abs(right.scale.x); // mirror across X
      left.position.x = -half;
      right.position.x = half;
      const pair = new THREE.Group();
      pair.add(left);
      pair.add(right);
      return pair;
    }
    return clone;
  }
  // Fallback: procedural geometry
  if (typeof item.build === 'function') return item.build();
  return null;
}
