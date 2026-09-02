// champion.js — the capstone's AI champion. THE SAME champion as the main
// simulation: loads the same GLB skins, the same Mixamo animation clips, and
// the same modular accessories (head/face/back slots). What differs is
// movement — this champion walks tile-to-tile across the student's 20×20 city
// via BFS pathfinding, instead of free-walking world space.
//
// Asset/module imports are ABSOLUTE paths resolved at the gateway origin, so
// this game must be served from the buddy-kit gateway (/project/…).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildAccessoryMesh } from '/champion-city/accessories.js';
import { G, TILE, tileToWorld, isWater, isMtn, ok } from './city-logic.js';

const ASSET_BASE = '/champion-city/assets/';
const CLIP_NAMES = {
  idle: 'Idle', walk: 'Walking', run: 'Fast Run', jump: 'Jumping',
  wave: 'Waving', turnL: 'Left Turn', turnR: 'Right Turn',
};
const DANCE_NAMES = ['hiphop', 'breakdance', 'mmakick', 'lockingdance', 'chickendance', 'strikejog', 'sittinglaugh'];
const CLIP_FILES = {
  Walking: 'walking.glb', 'Fast Run': 'fastrun.glb', Jumping: 'jumping.glb',
  Waving: 'waving.glb', 'Left Turn': 'leftturn.glb', 'Right Turn': 'rightturn.glb',
  'Hip Hop': 'hiphop.glb', Breakdance: 'breakdance.glb', 'Mma Kick': 'mmakick.glb',
  'Locking Dance': 'lockingdance.glb', 'Chicken Dance': 'chickendance.glb',
  'Strike Jog': 'strikejog.glb', 'Sitting Laugh': 'sittinglaugh.glb',
};

// Champion walks at ~1.2 tiles/sec (~4.8 m/s). Walk clip is tuned to ~1.3 m/s
// human stride, so scale its playback to match ground speed.
const TILES_PER_SEC = 1.2;
const ANIM_STRIDE = 1.3;   // m/s the walk clip naturally covers

export async function createChampion(scene) {
  const loader = new GLTFLoader();
  const group = new THREE.Group();
  const clips = {};

  async function loadSharedClips() {
    const base = await loader.loadAsync(ASSET_BASE + 'clips/idle.glb');
    for (const clip of base.animations) clips[clip.name] = clip.optimize();
    for (const [clipName, file] of Object.entries(CLIP_FILES)) {
      try {
        const g = await loader.loadAsync(ASSET_BASE + 'clips/' + file);
        if (g.animations && g.animations[0]) clips[g.animations[0].name] = g.animations[0].optimize();
      } catch (e) { console.warn('clip load failed:', clipName, e); }
    }
  }

  let model = null, mixer = null, actions = {}, currentName = 'idle';

  function normalizeModel(m) {
    m.updateMatrixWorld(true);
    let minY = Infinity, maxY = -Infinity;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    m.traverse((n) => {
      if (n.isMesh && n.geometry) {
        const pos = n.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
          if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
        }
      }
    });
    m.position.y -= minY;
    m.position.x -= (minX + maxX) / 2;
    m.position.z -= (minZ + maxZ) / 2;
  }

  function buildMixer(m) {
    mixer = new THREE.AnimationMixer(m);
    actions = {};
    for (const key of Object.keys(CLIP_NAMES)) {
      const clip = clips[CLIP_NAMES[key]];
      if (clip) actions[key] = mixer.clipAction(clip);
    }
    for (const d of DANCE_NAMES) if (clips[d]) actions[d] = mixer.clipAction(clips[d]);
  }

  async function loadSkin(glbUrl) {
    const gltf = await loader.loadAsync(glbUrl);
    const newModel = gltf.scene;
    normalizeModel(newModel);
    if (model) {
      group.remove(model);
      model.traverse((n) => {
        if (n.isMesh) {
          if (n.geometry) n.geometry.dispose();
          if (n.material) { if (Array.isArray(n.material)) n.material.forEach(m => m.dispose()); else n.material.dispose(); }
        }
      });
    }
    model = newModel;
    group.add(model);
    buildMixer(model);
    currentName = 'idle';
    state.oneShot = null;
    state.mode = 'idle';
    state.isGrounded = true;
    state.y = 0; state.yVel = 0;
    if (actions.idle) { actions.idle.reset().play(); actions.idle.timeScale = 1; }
  }

  const state = {
    row: Math.floor(G / 2), col: Math.floor(G / 2),
    path: [], pathIdx: 0, walking: false,
    facing: 0,
    pos: new THREE.Vector3(), vel: new THREE.Vector3(),
    y: 0, yVel: 0, isGrounded: true, mode: 'idle', oneShot: null,
  };
  (function findSpawn() {
    const mid = Math.floor(G / 2);
    for (let rad = 0; rad < G; rad++) {
      for (let dr = -rad; dr <= rad; dr++) {
        for (let dc = -rad; dc <= rad; dc++) {
          const rr = mid + dr, cc = mid + dc;
          if (!ok(rr, cc)) continue;
          if (!isWater(rr, cc) && !isMtn(rr, cc)) { state.row = rr; state.col = cc; return; }
        }
      }
    }
  })();
  const p0 = tileToWorld(state.row, state.col);
  state.pos.set(p0.x, 0, p0.z);
  group.position.copy(state.pos);
  scene.add(group);   // <-- add the champion to the scene so it renders!

  // ---- Animation state machine (same as the main champion) ----
  function loopingName() { return state.mode === 'run' ? 'run' : state.mode === 'walk' ? 'walk' : 'idle'; }
  function playState(name, fadeTime = 0.25) {
    if (currentName === name) return;
    const prev = actions[currentName];
    const next = actions[name];
    if (!next) return;
    if (prev && prev.isRunning()) prev.fadeOut(fadeTime);
    currentName = name;
    if (name === 'walk' || name === 'run' || name === 'idle') {
      next.reset().fadeIn(fadeTime);
      next.setLoop(THREE.LoopRepeat, Infinity);
      next.setEffectiveWeight(1);
      next.setEffectiveTimeScale(1);
    } else {
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
    }
  }
  function triggerOneShot(name) {
    if (state.oneShot) return;
    const a = actions[name];
    if (!a) return;
    const looping = actions[loopingName()];
    if (looping) looping.paused = true;
    currentName = name;
    a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true;
    a.setEffectiveWeight(1); a.setEffectiveTimeScale(1);
    a.play();
    state.oneShot = { name, action: a };
    const onFinished = (event) => {
      if (event.action !== a) return;
      mixer.removeEventListener('finished', onFinished);
      finishOneShot();
    };
    mixer.addEventListener('finished', onFinished);
  }
  function finishOneShot() {
    const back = actions[loopingName()];
    if (state.oneShot && back) {
      state.oneShot.action.crossFadeTo(back, 0.3, true);
    } else if (back) {
      back.reset().play(); back.paused = false; back.setLoop(THREE.LoopRepeat, Infinity);
    }
    currentName = loopingName();
    state.oneShot = null;
  }

  // ---- AI state ring ----
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.72, 32),
    new THREE.MeshBasicMaterial({ color: 0x00f2fe, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  group.add(ring);
  const ringColor = { idle: 0x00f2fe, busy: 0xff007f, executing: 0x00ff9d };

  await loadSharedClips();
  await loadSkin(ASSET_BASE + 'clips/idle.glb');

  const api = {
    group, mixer, state,
    name: () => currentName,
    skinId: 'crimson',
    async swapSkin(glbUrl, skinId) {
      await loadSkin(glbUrl);
      api.skinId = skinId || api.skinId;
      api.reapplyAccessories();
    },

    // ---- Accessories (shared with the main simulation) ----
    _accessories: {},
    equipAccessory(item) {
      if (!item || !item.slot) return false;
      api.unequipAccessory(item.slot);
      let bone = group.getObjectByName(item.bone);
      if (!bone && item.bone.includes(':')) bone = group.getObjectByName(item.bone.replace(/:/g, ''));
      if (!bone && !item.bone.includes(':')) bone = group.getObjectByName(item.bone.replace('mixamorig', 'mixamorig:'));
      if (!bone) { console.warn('accessory bone not found:', item.bone); return false; }
      const accMesh = buildAccessoryMesh(item);
      if (!accMesh) return false;
      accMesh.position.set(item.off[0], item.off[1], item.off[2]);
      bone.add(accMesh);
      api._accessories[item.slot] = { item, mesh: accMesh };
      return true;
    },
    unequipAccessory(slot) {
      const cur = api._accessories[slot];
      if (cur && cur.mesh) {
        cur.mesh.removeFromParent();
        cur.mesh.traverse((n) => {
          if (n.isMesh) { if (n.geometry) n.geometry.dispose(); if (n.material) { if (Array.isArray(n.material)) n.material.forEach(m => m.dispose()); else n.material.dispose(); } }
        });
      }
      delete api._accessories[slot];
    },
    reapplyAccessories() {
      const items = Object.values(api._accessories).map(a => a.item);
      api._accessories = {};
      for (const item of items) api.equipAccessory(item);
    },

    // ---- Grid movement (capstone-specific) ----
    tile: () => [state.row, state.col],
    getPos: () => group.position.clone(),
    isWalking: () => state.walking,
    walkTo(r, c, game) {
      const path = game.bfsWalk(state.row, state.col, r, c);
      if (!path || path.length < 1) return false;
      state.path = path;
      state.pathIdx = 1;
      state.walking = true;
      state.mode = 'walk';
      playState('walk');
      if (actions.walk) actions.walk.timeScale = (TILES_PER_SEC * TILE) / ANIM_STRIDE;
      return true;
    },
    stop() { state.walking = false; state.path = []; state.mode = 'idle'; playState('idle'); },
    isBusy: () => !!state.oneShot || state.walking,

    setRing(mode) {
      ring.material.color.setHex(ringColor[mode] || ringColor.idle);
      ring.material.opacity = mode === 'busy' ? 0.75 : 0.5;
    },
    ringPulse(dt) { ring.scale.setScalar(1 + 0.08 * Math.sin(performance.now() * 0.005)); },

    wave() { triggerOneShot('wave'); },
    dance() { triggerOneShot(DANCE_NAMES[0]); },

    update(dt) {
      if (state.oneShot) {
        mixer.update(dt);
        group.position.copy(state.pos);
        return;
      }
      if (state.walking && state.path.length) {
        const target = state.path[state.pathIdx] || state.path[state.path.length - 1];
        const tp = tileToWorld(target[0], target[1]);
        const cur = state.pos;
        const dx = tp.x - cur.x, dz = tp.z - cur.z;
        const dist = Math.hypot(dx, dz);
        const step = TILES_PER_SEC * TILE * dt;
        if (dist <= step || dist < 0.01) {
          cur.set(tp.x, 0, tp.z);
          state.row = target[0]; state.col = target[1];
          state.pathIdx++;
          if (state.pathIdx >= state.path.length) {
            state.walking = false; state.path = [];
            state.mode = 'idle'; playState('idle');
          }
        } else {
          cur.x += (dx / dist) * step;
          cur.z += (dz / dist) * step;
          state.facing = Math.atan2(dx, dz);
        }
      } else if (!state.walking && state.mode !== 'idle') {
        state.mode = 'idle';
        playState('idle');
      }
      group.position.copy(state.pos);
      group.rotation.y = state.facing;
      mixer.update(dt);
      ring.scale.setScalar(1 + 0.08 * Math.sin(performance.now() * 0.005));
    },
  };

  return api;
}
