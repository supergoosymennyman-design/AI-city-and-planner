// city-builder/ai-nodes.js — make planted AI machines VISIBLE in the 3D city.
//
// "The AI is not alive in the city" was the biggest finding of the Gemini
// audit. Before this module, a planted .cap machine only appeared in the 📦
// panel modal. Now each planted machine gets a small procedural "AI node" on
// the ground near the champion's spawn plaza: a glowing ring + light column
// that gently pulses, coloured by the machine's last decision (green = it made
// a confident call, amber = it abstained / said "not sure", cyan = never fed).
// No GLBs, no textures, no network — pure three.js primitives, so it costs a
// handful of draw calls and degrades to nothing on unsupported devices.
//
// The status light updates live: the host calls `updateStatus(capId, label)`
// whenever the child runs "Try my machine", and `mountCityAiNodes` refreshes
// colours on an interval so a machine that was fed moments ago visibly reacts.

import * as THREE from 'three';
import { currentLang } from './i18n.js';
import { createLabelTexture } from './sprite-text.js';

const CAPS_KEY = 'p5_city_capabilities_v1';
const LAST_DEC_KEY = 'p5_city_cap_lastdec_v1';

const COLORS = {
  idle:   0x00f2fe,   // cyan — planted but never fed
  decided: 0x00ff9d,  // green — confident answer
  abstain: 0xffb84c,  // amber — said "not sure"
};

function readCaps() {
  try {
    const a = JSON.parse(localStorage.getItem(CAPS_KEY) || '[]');
    return Array.isArray(a) ? a : [];
  } catch { return []; }
}
function readLastDecisions() {
  try {
    const m = JSON.parse(localStorage.getItem(LAST_DEC_KEY) || '{}');
    return (m && typeof m === 'object') ? m : {};
  } catch { return {}; }
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Pick up to `max` open spots on a circle around the spawn point that are clear
 * of buildings (and inside the city). Returns world [x, z] positions.
 */
function findNodeSpots(city, layout, count) {
  const spots = [];
  if (!city || !city.spawnWorld) return spots;
  const cx = city.spawnWorld.x, cz = city.spawnWorld.z;
  const buildings = (layout && layout.buildings) || [];
  const tooClose = (x, z) => {
    for (const b of buildings) {
      const d = Math.hypot(b.pos[0] - x, b.pos[1] - z);
      const fp = b.footprint || [20, 20];
      if (d < Math.max(6, (fp[0] + fp[1]) / 2)) return true;
    }
    return false;
  };
  const rand = mulberry32((cx * 73856093) ^ (cz * 19349663) ^ 0x51ab3);
  const slots = [0, 1, 2, 3, 4, 5, 6, 7].sort(() => rand() - 0.5);
  for (const i of slots) {
    if (spots.length >= count) break;
    const ang = (i / 8) * Math.PI * 2 + rand() * 0.5;
    const r = 16 + rand() * 6;   // ring radius around the plaza
    const x = cx + Math.cos(ang) * r;
    const z = cz + Math.sin(ang) * r;
    if (tooClose(x, z)) continue;
    spots.push({ x, z, seed: Math.floor(rand() * 1e9) });
  }
  return spots;
}

/** One procedural AI node: emissive ring + light column + name sprite. */
function buildNode(scene, { x, z, seed, name, color, capId }) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.15, 0.09, 12, 40),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 })
  );
  ring.rotation.x = -Math.PI / 2;
  group.add(ring);

  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(1.5, 28),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.01;
  group.add(glow);

  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 2.6, 8),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 })
  );
  column.position.y = 1.3;
  group.add(column);

  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 16, 12),
    new THREE.MeshBasicMaterial({ color })
  );
  orb.position.y = 2.72;
  group.add(orb);

  // Name label sprite (self-contained canvas texture — no CSS2D wiring).
  if (name) {
    const tex = createLabelTexture(`${currentLang() === 'zh-Hant' ? '第一階段 · 展示' : 'Stage 1 · Display'}: ${name}`, '#eaf2f8', 'rgba(8,14,24,0.85)', '#00f2fe');
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sprite.scale.set(tex.image.width / tex.image.height * 3.2, 3.2, 1);
    sprite.position.y = 3.6;
    group.add(sprite);
  }

  group.userData = { capId: capId || null, name: name || '', seed, phase: Math.random() * Math.PI * 2, color };
  scene.add(group);
  return group;
}

function setColor(group, hex) {
  group.userData.color = hex;
  group.traverse((o) => {
    if (o.isMesh && o.material && o.material.color) {
      o.material.color.setHex(hex);
      o.material.needsUpdate = true;
    }
  });
}

function colorFor(id, dec) {
  if (!dec[id]) return COLORS.idle;
  return String(dec[id].label).indexOf('🤔') !== -1 ? COLORS.abstain : COLORS.decided;
}

/**
 * Mount the visible AI nodes for every planted .cap machine.
 * Returns a handle { updateStatus(id,label), dispose }.
 */
export function mountCityAiNodes(scene, city, layout, opts = {}) {
  if (!scene || !city) return null;
  const caps = readCaps();
  if (!caps.length) return null;

  const spots = findNodeSpots(city, layout, caps.length);
  if (!spots.length) return null;

  const nodes = new Map();
  caps.slice(0, spots.length).forEach((cap, i) => {
    const name = (cap && (cap.name || cap.id)) || 'AI machine';
    const dec = readLastDecisions();
    const g = buildNode(scene, { ...spots[i], name, color: colorFor(cap.id, dec), capId: cap.id });
    nodes.set(cap.id, g);
  });

  let lastT = performance.now();
  const tick = () => {
    if (!alive) return;
    const t = performance.now();
    const dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t;
    if (!document.hidden && !opts.paused?.() && !opts.reducedMotion?.()) for (const g of nodes.values()) {
      const u = g.userData;
      u.phase += dt * (1.6 + ((u.seed % 100) / 100) * 1.4);
      const pulse = 0.75 + 0.25 * Math.sin(u.phase);
      g.traverse((o) => {
        if (o.isMesh && o.material) {
          if (o.geometry.type === 'TorusGeometry' || o.geometry.type === 'CircleGeometry' || o.geometry.type === 'CylinderGeometry') {
            o.material.opacity = o.geometry.type === 'CylinderGeometry' ? 0.5 + 0.35 * pulse : 0.55 + 0.35 * pulse;
          }
        }
      });
    }
    raf = requestAnimationFrame(tick);
  };
  let alive = true;
  let raf = requestAnimationFrame(tick);

  return {
    updateStatus(id, label) {
      if (!id) return;
      const g = nodes.get(id);
      if (!g) return;
      setColor(g, String(label).indexOf('🤔') !== -1 ? COLORS.abstain : COLORS.decided);
    },
    // Flattened raycast targets for tapping a node in the 3D world. Meshes only
    // (orb, light column, ring, glow): the transparent name-label Sprite is
    // deliberately excluded so its invisible canvas quad can't intercept taps
    // around the label — the solid targets are ample.
    tapMeshes() {
      const arr = [];
      for (const g of nodes.values()) {
        g.traverse((o) => { if (o.isMesh) arr.push(o); });
      }
      return arr;
    },
    dispose() {
      alive = false;
      cancelAnimationFrame(raf);
      for (const g of nodes.values()) {
        scene.remove(g);
        g.traverse((o) => {
          if (o.isMesh || o.isSprite) {
            if (o.geometry) o.geometry.dispose();
            if (o.material) {
              if (o.material.map) o.material.map.dispose();
              o.material.dispose();
            }
          }
        });
      }
      nodes.clear();
    },
  };
}
