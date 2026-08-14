// champion-real.js — champion for the real-HK map.
// Same animation state machine + skin swap as the procedural city, adapted to
// move in world-space meters (lat/lng projected to local coords). No grid.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildAccessoryMesh } from '../champion-city/accessories.js';

// Champion is scaled up on the real-HK map (buildings are real meters tall) so
// students can actually see the robot. Speed is proportional to the scale.
export const CHAMPION_SCALE = 2.0;    // ~4m tall — 2× a human
export const WALK_SPEED = 4.0;        // m/s
export const RUN_SPEED = 8.0;
// The flying taxi is always available on the unified HK page. The champion
// itself never flies — it walks on the ground, or rides the taxi.
export const IS_FLYING = true;

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

// Champion stays within this many meters of the district origin — the unified
// map spans Central → TST (~1500m) → Sheung Wan (west), so allow wide travel.
const BOUNDS = 3200;

export async function createChampion(assetBase, city) {
  const loader = new GLTFLoader();
  const group = new THREE.Group();
  const FACING_OFFSET = 0;
  const clips = {};
  async function loadSharedClips() {
    try {
      const base = await loader.loadAsync(assetBase + 'clips/idle.glb');
      for (const clip of base.animations) clips[clip.name] = clip.optimize();
    } catch (e) {
      console.warn('[champion] idle clip load failed — animation disabled:', e);
      return;
    }
    for (const [clipName, file] of Object.entries(CLIP_FILES)) {
      try {
        const g = await loader.loadAsync(assetBase + 'clips/' + file);
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

  // Procedural champion — a friendly robot built from primitives. Used when the
  // skin GLB fails to load so boot never hangs and the city is still playable.
  function buildProceduralChampion() {
    if (model) return;
    const robot = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 1.0, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x4fd8ff, roughness: 0.4, metalness: 0.5 })
    );
    body.position.y = 1.1;
    robot.add(body);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0xeaf2f8, roughness: 0.3, metalness: 0.4 })
    );
    head.position.y = 1.95;
    robot.add(head);
    const eye = new THREE.Mesh(
      new THREE.CircleGeometry(0.1, 12),
      new THREE.MeshBasicMaterial({ color: 0x00ff9d })
    );
    eye.position.set(0.12, 2.0, 0.3);
    robot.add(eye);
    const legL = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.16, 0.5, 10),
      new THREE.MeshStandardMaterial({ color: 0x2a3a5a, roughness: 0.6 })
    );
    legL.position.set(-0.2, 0.3, 0); robot.add(legL);
    const legR = legL.clone(); legR.position.x = 0.2; robot.add(legR);
    const armL = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.11, 0.7, 8),
      new THREE.MeshStandardMaterial({ color: 0x2a3a5a, roughness: 0.6 })
    );
    armL.position.set(-0.5, 1.2, 0); armL.rotation.z = 0.15; robot.add(armL);
    const armR = armL.clone(); armR.position.x = 0.5; armR.rotation.z = -0.15; robot.add(armR);
    robot.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    model = robot;
    group.add(robot);
    buildMixer(robot);
    currentName = 'idle';
    state.oneShot = null;
    state.mode = 'idle';
    state.isGrounded = true;
    state.y = 0; state.yVel = 0;
    // No GLB clips available — no animation actions; the mixer is harmless.
  }

  async function loadSkin(glbUrl) {
    let gltf;
    try {
      gltf = await loader.loadAsync(glbUrl);
    } catch (e) {
      console.warn('[champion] skin GLB load failed — using procedural champion:', e);
      if (!model) buildProceduralChampion();
      return;
    }
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
    pos: (city.spawnWorld || new THREE.Vector3(0, 0, 0)).clone(),
    vel: new THREE.Vector3(),
    y: 0, yVel: 0, facing: 0,
    isGrounded: true, mode: 'idle', oneShot: null,
  };
  group.position.copy(state.pos);

  function loopingName() {
    return state.mode === 'run' ? 'run' : state.mode === 'walk' ? 'walk' : 'idle';
  }
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
      // Cross-fade OUT the one-shot action (dance) and IN the looping action.
      // crossFadeTo(fadeInAction) fades OUT `this` and fades IN the argument —
      // so it must be called ON the one-shot action.
      state.oneShot.action.crossFadeTo(back, 0.3, true);
    } else if (back) {
      back.reset().play(); back.paused = false; back.setLoop(THREE.LoopRepeat, Infinity);
    }
    currentName = loopingName();
    state.oneShot = null;
  }

  const stateRing = new THREE.Mesh(
    new THREE.RingGeometry(0.5, 0.72, 32),
    new THREE.MeshBasicMaterial({ color: 0x00f2fe, transparent: true, opacity: 0.45, side: THREE.DoubleSide })
  );
  stateRing.rotation.x = -Math.PI / 2;
  stateRing.position.y = 0.03;
  group.add(stateRing);
  const ringColor = { idle: 0x00f2fe, busy: 0xff007f, executing: 0x00ff9d };

  await loadSharedClips();
  await loadSkin(assetBase + 'clips/idle_bunny.glb');
  // Scale the GROUP (not the model) so the skeleton/skinning stays intact.
  group.scale.setScalar(CHAMPION_SCALE);

  const api = {
    group, mixer, state,
    name: () => currentName,
    skinId: 'bunny',
    async swapSkin(glbUrl, skinId) {
      await loadSkin(glbUrl);
      api.skinId = skinId || api.skinId;
      api.reapplyAccessories();
    },

    // ---- Modular accessories: items attach to bones so they follow animation ----
    _accessories: {},   // slot -> { item, mesh }
    equipAccessory(item) {
      if (!item || !item.slot) return false;
      api.unequipAccessory(item.slot);              // one item per slot
      // Bone lookup: some Mixamo exports name bones "mixamorigHead",
      // others "mixamorig:Head" — try both.
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
    // After a skin swap the whole model (bones included) is replaced, so
    // re-attach every equipped item to the new model's bones.
    reapplyAccessories() {
      const items = Object.values(api._accessories).map(a => a.item);
      api._accessories = {};
      for (const item of items) api.equipAccessory(item);
    },

    setRing(mode) {
      stateRing.material.color.setHex(ringColor[mode] || ringColor.idle);
      stateRing.material.opacity = mode === 'busy' ? 0.75 : 0.45;
    },
    ringPulse(dt) { stateRing.scale.setScalar(1 + 0.1 * Math.sin(performance.now() * 0.004)); },

    update(dt, input) {
      input = input || {};
      const hasMove = Math.abs(input.x || 0) > 0.01 || Math.abs(input.z || 0) > 0.01;
      if (state.oneShot) {
        mixer.update(dt);
        group.position.copy(state.pos);
        return;
      }
      if (hasMove) {
        state.mode = input.running ? 'run' : 'walk';
        playState(state.mode);
        const dir = new THREE.Vector3(input.x, 0, input.z).normalize();
        const speedScale = input.speedScale || 1;
        const baseSpeed = (input.running ? RUN_SPEED : WALK_SPEED);
        const speed = baseSpeed * speedScale;
        if (actions[state.mode]) actions[state.mode].timeScale = speedScale;
        state.vel.copy(dir.multiplyScalar(speed));
        const targetYaw = Math.atan2(input.x, input.z) + FACING_OFFSET;
        let diff = targetYaw - state.facing;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        state.facing += diff * Math.min(1, dt * 10);
      } else {
        state.vel.set(0, 0, 0);
        if (state.mode !== 'idle') { state.mode = 'idle'; playState('idle'); }
      }
      state.pos.x += state.vel.x * dt;
      state.pos.z += state.vel.z * dt;
      state.pos.x = Math.max(-BOUNDS, Math.min(BOUNDS, state.pos.x));
      state.pos.z = Math.max(-BOUNDS, Math.min(BOUNDS, state.pos.z));
      if (state.isGrounded) {
        if (input.jump) { state.yVel = 4.2; state.isGrounded = false; triggerOneShot('jump'); }
      } else {
        state.yVel -= 12 * dt;
        state.y += state.yVel * dt;
        if (state.y <= 0) { state.y = 0; state.isGrounded = true; }
      }
      group.position.set(state.pos.x, state.y, state.pos.z);
      group.rotation.y = state.facing;
      mixer.update(dt);
    },
    wave() { triggerOneShot('wave'); },
    isBusy() { return !!state.oneShot; },
    _danceIdx: 0,
    dance() {
      const name = DANCE_NAMES[this._danceIdx % DANCE_NAMES.length];
      this._danceIdx = (this._danceIdx + 1) % DANCE_NAMES.length;
      triggerOneShot(name);
    },
    // Sit at a desk (used by the building-entry sequence) — plays the sitting
    // laugh clip so the champion appears to sit at the computer.
    sit() { triggerOneShot('sittinglaugh'); },
    stand() { if (state.oneShot) finishOneShot(); else { playState('idle'); } },
  };
  return api;
}
