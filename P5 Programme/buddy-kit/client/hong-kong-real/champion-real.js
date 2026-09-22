// champion-real.js — champion for the real-HK map.
// Same animation state machine + skin swap as the procedural city, adapted to
// move in world-space meters (lat/lng projected to local coords). No grid.
import * as THREE from 'three';
import { createGLTFLoader } from '../shared/gltf.js';
import { buildAccessoryMesh } from '../champion-city/accessories.js';
import { championMetadataFromGLTF, collectRigInfo, validateStudioChampion } from '../city-common/champion-contract.js';

// Champion is scaled up on the real-HK map (buildings are real meters tall) so
// students can actually see the robot. Speed is proportional to the scale.
export const CHAMPION_SCALE = 1.8;    // ~3.6m tall — slightly smaller against traffic
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

export async function createChampion(assetBase, city, opts = {}) {
  // createGLTFLoader() (shared/gltf.js) configures Draco + Meshopt decoders so
  // compressed exports — e.g. a Fit Studio "fitted champion" — load too.
  const loader = createGLTFLoader();
  const group = new THREE.Group();
  // World scale for the champion. The city spawns it at CHAMPION_SCALE (~3.6 m,
  // still larger than a human, but proportionate to the road traffic). Interior scenarios (lab,
  // spaceship, station) pass a smaller scale (~1.0) so the robot fits human
  // rooms with human-scale furniture. The ground drops below scale proportionally
  // because they are absolute-meter values calibrated for CHAMPION_SCALE.
  const SCALE = (city && city.scale) || CHAMPION_SCALE;
  const _dirV = new THREE.Vector3();   // scratch — avoid per-frame allocations
  const _footV = new THREE.Vector3();  // scratch — animated foot position for auto-grounding
  const _footR = new THREE.Vector3();  // scratch — right-foot measurement (dual-foot grounding)
  const FACING_OFFSET = 0;
  const clips = {};
  // The shared Mixamo clips are baked for the bunny's rig, whose skeleton lives at
  // ~100× the AI champion's meter-scale rig (Mixamo exports in centimetres with the
  // mesh counter-scaled 0.01). A meter-scale skin (e.g. a fitted champion from Fit
  // Studio) driven by those raw keyframes would have its bones displaced ~100× — a
  // 333 m champion. `clipScale` = ratio between the skin's skeleton space and the
  // clip space (Hips↔LeftFoot distance); when it ≠ 1 we play SCALED COPIES of the
  // clips (position tracks × clipScale) so the skeleton stays in its own unit space.
  // The model itself is never touched (display, gear and fit all stay perfect).
  let clipPool = clips;     // raw, or scaled copies for a non-clip-space skin
  let clipScale = 1;
  let locomotionNames = { idle: CLIP_NAMES.idle, walk: CLIP_NAMES.walk, run: CLIP_NAMES.run };
  let studioAnimation = null;
  // Grounding is per-skin now: the idle/walk/run clips hold the feet above the
  // bind-pose ground by an amount proportional to the SKIN's height. The
  // fractions below were measured from the bunny (~2 m tall): idle ~1.25 m,
  // walk ~1.49 m, run ~1.47 m of foot-lift, i.e. 0.625 / 0.74 / 0.735 of skin
  // height. A taller or shorter skin (e.g. a fitted champion from Fit Studio)
  // scales automatically; SCALE converts the unscaled height into world units.
  // NOTE: these are a FALLBACK. Auto-grounding below measures the actual
  // animated LeftFoot height per skin each frame, so non-bunny skins no longer
  // float (DROP_FRAC only applies when no foot bone is found).
  const DROP_FRAC = { idle: 0.625, walk: 0.74, run: 0.735 };
  let skinHeight = 2.0;   // unscaled normalized height; measured per skin on load
  // Grounding bones of the current skin: { left, right } Mixamo foot bones, or
  // null when the skin has no skeleton (procedural robot → DROP_FRAC fallback).
  // Dual-foot grounding uses min(soleL, soleR) so the PLANTED foot defines the
  // height and the swing foot never pumps the whole body at step cadence.
  let _footBones = null;
  let _soleOffWorld = 0;  // ankle-bone → sole vertical gap in world units, once per skin
  // Grounding diagnostics (debug HUD): last measured sole/surface/gap in metres.
  const groundDebug = { surface: 0, soleY: 0, gap: 0, soleOff: 0 };
  // Clips the champion needs on day one (loop + jump/wave are one-shot but
  // common); everything else (turns, dances) lazy-loads on first use so boot
  // only waits on the essential few, fetched in parallel.
  const CORE_CLIP_FILES = {
    Walking: 'walking.glb', 'Fast Run': 'fastrun.glb', Jumping: 'jumping.glb', Waving: 'waving.glb',
  };
  async function loadSharedClips() {
    try {
      const [base, ...rest] = await Promise.all([
        loader.loadAsync(assetBase + 'clips/idle.glb'),
        ...Object.values(CORE_CLIP_FILES).map((f) => loader.loadAsync(assetBase + 'clips/' + f).catch((e) => { console.warn('clip load failed:', f, e); return null; })),
      ]);
      for (const clip of base.animations) clips[clip.name] = clip.optimize();
      for (const g of rest) {
        if (g && g.animations && g.animations[0]) clips[g.animations[0].name] = g.animations[0].optimize();
      }
    } catch (e) {
      console.warn('[champion] idle clip load failed — animation disabled:', e);
    }
  }

  // Ratio between the clip space and THIS skin's skeleton space, measured on the
  // rest pose (bones are still at their GLB bind values here — the mixer hasn't
  // run for this model yet). ~1 = the skin already matches the clip units (bunny
  // and Mixamo-cm skins); anything else (a meter-scale fitted champion) returns
  // the per-unit factor to scale the clip POSITION tracks by.
  function skinClipScaleFor(m) {
    let skinned = null;
    m.traverse((o) => { if (o.isSkinnedMesh && !skinned) skinned = o; });
    if (!skinned || !skinned.skeleton) return 1;
    const bones = skinned.skeleton.bones;
    // GLTFLoader strips ":" from node names, so runtime bones are "mixamorigHips"
    // (Fit Studio / Blender files) or "mixamorig:Hips" — match the tail either way.
    const hips = bones.find((b) => /Hips$/.test(b.name));
    const foot = bones.find((b) => /LeftFoot$/.test(b.name));
    if (!hips || !foot) return 1;
    const idle = clips.Idle;
    const hipsTr = idle && idle.tracks.find((t) => /Hips\.position$/.test(t.name));
    const footTr = idle && idle.tracks.find((t) => /LeftFoot\.position$/.test(t.name));
    if (!hipsTr || !footTr) return 1;
    const clipDist = Math.hypot(
      hipsTr.values[0] - footTr.values[0],
      hipsTr.values[1] - footTr.values[1],
      hipsTr.values[2] - footTr.values[2]);
    const skinDist = new THREE.Vector3().subVectors(hips.position, foot.position).length();
    if (clipDist < 1e-6 || skinDist < 1e-6) return 1;
    const f = skinDist / clipDist;
    return Math.abs(f - 1) < 0.05 ? 1 : f;
  }

  // Copies of every loaded clip with POSITION track values scaled by `f`.
  // Quaternion + scale tracks are untouched (rotations and bone scale are
  // unit-independent; Mixamo scale tracks are constant 1).
  function scaledClipMap(f) {
    const out = {};
    for (const key of Object.keys(clips)) {
      const c = clips[key];
      const tracks = c.tracks.map((t) => {
        if (t.name.endsWith('.position')) {
          const values = new Float32Array(t.values.length);
          for (let i = 0; i < t.values.length; i++) values[i] = t.values[i] * f;
          return new THREE.VectorKeyframeTrack(t.name, t.times, values);
        }
        return t;
      });
      out[key] = new THREE.AnimationClip(c.name, c.duration, tracks);
    }
    return out;
  }

  // Load a non-core clip on demand (turns, dances, sit). Idempotent + cached.
  const _lazyClipPromises = {};
  function ensureClip(file) {
    if (clips[file]) return Promise.resolve();
    if (_lazyClipPromises[file]) return _lazyClipPromises[file];
    _lazyClipPromises[file] = loader.loadAsync(assetBase + 'clips/' + file)
      .then((g) => {
        if (g.animations && g.animations[0]) {
          const clip = g.animations[0].optimize();
          const name = clip.name;
          clips[name] = clip;
          // Keep the scaled pool in sync so a meter-scale skin also gets
          // correctly-scaled lazy clips.
          if (clipScale !== 1) {
            const tracks = clip.tracks.map((t) => {
              if (t.name.endsWith('.position')) {
                const values = new Float32Array(t.values.length);
                for (let i = 0; i < t.values.length; i++) values[i] = t.values[i] * clipScale;
                return new THREE.VectorKeyframeTrack(t.name, t.times, values);
              }
              return t;
            });
            clipPool[name] = new THREE.AnimationClip(clip.name, clip.duration, tracks);
          }
          // If the mixer already exists, bind this new action right away.
          if (mixer) {
            const key = Object.keys(CLIP_NAMES).find((k) => CLIP_NAMES[k] === name) || (DANCE_NAMES.includes(name) ? name : null);
            if (key) actions[key] = mixer.clipAction(clipPool[name]);
          }
        }
      })
      .catch((e) => { console.warn('clip load failed:', file, e); });
    return _lazyClipPromises[file];
  }

  let model = null, mixer = null, actions = {}, currentName = 'idle';

  // Locate the skin's LeftFoot + RightFoot bones (Mixamo naming:
  // "mixamorig:LeftFoot" or "mixamorigLeftFoot"). Used by auto-grounding so any
  // skin (bunny, dragon, fitted champion) sits on the ground regardless of
  // clip-space proportions. Returns { left, right } or null (procedural robot).
  function findFootBones(m) {
    let skinned = null;
    m.traverse((o) => { if (o.isSkinnedMesh && !skinned) skinned = o; });
    if (!skinned || !skinned.skeleton) return null;
    const bones = skinned.skeleton.bones;
    const footLike = bones.filter((b) => /(foot|paw|hoof)$/i.test(b.name));
    const left = bones.find((b) => /LeftFoot$/i.test(b.name)) || footLike.find((b) => /left|[_-]l$/i.test(b.name)) || footLike[0] || null;
    const right = bones.find((b) => /RightFoot$/i.test(b.name)) || footLike.find((b) => /right|[_-]r$/i.test(b.name)) || footLike.find((b) => b !== left) || null;
    return left || right ? { left, right } : null;
  }

  // Lazily measure the ankle-bone → sole gap for the current skin ONCE the group
  // has its final scale + scene matrices (first grounded update). The foot BONE
  // sits at the ankle, not the shoe sole — grounding the bone to y=0 leaves the
  // sole floating by this gap. Measuring here (rather than in loadSkin) keeps
  // the value in true world units after group.scale (SCALE × growScale).
  function _ensureSoleOffset() {
    if (_soleOffWorld !== 0 || !_footBones || !_footBones.left || !model) return;
    const savedY = group.position.y;
    group.position.y = 0;
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    if (box.isEmpty()) { group.position.y = savedY; return; }
    _footBones.left.getWorldPosition(_footV);
    group.position.y = savedY;
    // The normalized model's lowest point is ~0 at group y=0; the foot bone
    // (ankle) sits above it by the ankle→sole distance. World units already
    // include group scale. Trust only a sane positive gap.
    const gap = _footV.y - box.min.y;
    _soleOffWorld = Number.isFinite(gap) && gap > 0 && gap < skinHeight * SCALE * 2
      ? gap
      : 0;
  }

  function normalizeModel(m) {
    m.updateMatrixWorld(true);
    // World-space bounds via Box3: accounts for the armature parent + node
    // transforms (a meter-scale mesh under the Armature is not the same as a
    // tiny bunny mesh that is a sibling of its skeleton). Ground the lowest
    // point and centre X/Z in one pass.
    const box = new THREE.Box3().setFromObject(m);
    if (!box.isEmpty()) {
      m.position.x -= (box.min.x + box.max.x) / 2;
      m.position.z -= (box.min.z + box.max.z) / 2;
      m.position.y -= box.min.y;
      const size = box.getSize(new THREE.Vector3());
      if (size.y > 1e-6) skinHeight = size.y;
    }
    m.updateMatrixWorld(true);
  }

  function buildMixer(m) {
    mixer = new THREE.AnimationMixer(m);
    actions = {};
    for (const key of Object.keys(CLIP_NAMES)) {
      const clipName = locomotionNames[key] || CLIP_NAMES[key];
      const clip = clipPool[clipName];
      if (clip) actions[key] = mixer.clipAction(clip);
    }
    for (const d of DANCE_NAMES) if (clipPool[d]) actions[d] = mixer.clipAction(clipPool[d]);
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
    _footBones = null;   // procedural robot has no skeleton — DROP_FRAC fallback
    _soleOffWorld = 0;
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
      console.warn('[champion] skin GLB load failed:', glbUrl, e);
      return false;   // keep the current model — caller decides the fallback
    }
    const newModel = gltf.scene;
    const rig = collectRigInfo(newModel);
    const declared = championMetadataFromGLTF(gltf);
    const studioCheck = validateStudioChampion({ metadata: declared, animations: gltf.animations || [], boneNames: rig.boneNames });
    if (declared && !studioCheck.ok) {
      console.warn('[champion] Studio Champion rejected:', studioCheck.error);
      opts.onChampionWarning?.(studioCheck.error);
      return false;
    }
    normalizeModel(newModel);
    _footBones = findFootBones(newModel);
    // soleOff is measured lazily on the first grounded update (once the group
    // scale + scene matrices are final) — see _ensureSoleOffset() in update().
    _soleOffWorld = 0;
    // Adapt the shared clips to this skin's skeleton unit-space (meter-scale
    // fitted champions vs the bunny's ~100× rig) BEFORE the mixer is built.
    if (studioCheck.ok) {
      // Studio owns deformation. City only selects these embedded actions and
      // continues to own translation, facing, speed, jumping and ground height.
      clipScale = 1;
      clipPool = { ...clips };
      for (const clip of gltf.animations || []) clipPool[clip.name] = clip;
      locomotionNames = { ...studioCheck.metadata.actions };
      studioAnimation = { source: 'Studio', ready: true, ...studioCheck.metadata };
    } else {
      // Explicit legacy path: compatible older uploads keep the bundled Mixamo
      // library. It is never used for a valid Studio Champion.
      locomotionNames = { idle: CLIP_NAMES.idle, walk: CLIP_NAMES.walk, run: CLIP_NAMES.run };
      studioAnimation = { source: 'Legacy upload', ready: false, warning: studioCheck.error };
      const s = skinClipScaleFor(newModel);
      if (s !== 1) { clipScale = s; clipPool = scaledClipMap(s); }
      else { clipScale = 1; clipPool = clips; }
    }
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
    return true;
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
      next.reset();
      next.setLoop(THREE.LoopRepeat, Infinity);
      next.setEffectiveTimeScale(1);
      next.play();                 // MUST activate — reset().fadeIn() alone never starts the action
      next.fadeIn(fadeTime);       // then fade weight 0→1 for a smooth cross-fade
    } else {
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
      next.play();
    }
  }
  function triggerOneShot(name) {
    if (state.oneShot) return;
    const a = actions[name];
    if (!a) {
      // Lazy clip not loaded yet — kick off the load and retry when ready.
      const file = CLIP_FILES[Object.keys(CLIP_NAMES).find((k) => CLIP_NAMES[k] === name) || name] || lazyFileFor(name);
      if (file) { ensureClip(file).then(() => { if (currentName === 'idle' && !state.oneShot) triggerOneShot(name); }); }
      return;
    }
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
  // Map dance/sit names to their clip file for lazy loading.
  function lazyFileFor(name) {
    const byName = {
      hiphop: 'hiphop.glb', breakdance: 'breakdance.glb', mmakick: 'mmakick.glb',
      lockingdance: 'lockingdance.glb', chickendance: 'chickendance.glb',
      strikejog: 'strikejog.glb', sittinglaugh: 'sittinglaugh.glb',
    };
    return byName[name] || null;
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
  // Start on the uploaded "fitted champion" when one was provided; otherwise
  // the default bunny. If the custom GLB fails, fall back to bunny, then to
  // the procedural robot so boot never hangs.
  const defaultBunny = assetBase + 'clips/idle_bunny.glb';
  const initialSkin = opts.initialSkin || defaultBunny;
  const initialSkinId = opts.initialSkinId || 'bunny';
  const initialLoaded = await loadSkin(initialSkin);
  if (!initialLoaded && initialSkin !== defaultBunny) {
    await loadSkin(defaultBunny);
  }
  if (!model) buildProceduralChampion();
  // Scale the GROUP (not the model) so the skeleton/skinning stays intact.
  group.scale.setScalar(SCALE);

  // Skin-swap subscribers (fired AFTER a successful loadSkin swaps the model).
  // The taxi subscribes so it can re-capture its boarding-fade material list —
  // a swap mid-ride would otherwise leave the new materials outside the fade.
  const skinListeners = new Set();

  const api = {
    group, mixer, state,
    name: () => currentName,
    skinId: initialLoaded ? initialSkinId : 'bunny',
    animationInfo: () => studioAnimation ? { ...studioAnimation } : { source: 'Bundled Champion', ready: false },
    async swapSkin(glbUrl, skinId) {
      const ok = await loadSkin(glbUrl);
      api.skinId = skinId || api.skinId;
      if (ok) {
        api.reapplyAccessories();
        // Notify anything that depends on the champion's MATERIALS (the taxi's
        // boarding-fade capture goes stale when a swap replaces the model).
        for (const fn of [...skinListeners]) { try { fn(); } catch (e) { console.warn('[champion] skin listener error', e); } }
      }
      // Settle the new model immediately (same maths as landAt) so a swapped
      // skin never hovers for even one frame — ground position is re-measured
      // from THIS model's rest pose/foot bones.
      api.settleGrounding();
    },
    // Skin-swap hooks (used by the flying taxi so it can re-capture the fade
    // list after a swap mid-ride). Returns an unsubscribe function.
    addSkinListener(fn) {
      skinListeners.add(fn);
      return () => skinListeners.delete(fn);
    },
    removeSkinListener(fn) {
      skinListeners.delete(fn);
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
        _dirV.set(input.x || 0, 0, input.z || 0).normalize();
        const speedScale = input.speedScale || 1;
        const baseSpeed = (input.running ? RUN_SPEED : WALK_SPEED);
        const speed = baseSpeed * speedScale;
        if (actions[state.mode]) actions[state.mode].timeScale = speedScale;
        state.vel.copy(_dirV.multiplyScalar(speed));
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
      // Ground the champion so its SOLE touches the walkable surface.
      // Dual-foot auto-grounding (preferred): after the mixer updates, measure
      // BOTH animated foot-bone world heights at group y=0, subtract the
      // ankle→sole gap, and take the min (the planted foot defines the height,
      // the swing foot never pumps the body). The group is then set so that
      // min-sole lands on the surface height under the champion (bare ground,
      // sidewalk or asphalt from `city.groundHeightAt` when the city provides
      // it — interiors default to 0). When no foot bones exist (procedural
      // robot) we fall back to the old fraction-based drop.
      mixer.update(dt);
      let soleWorldAtZero = 0;
      if (!state.oneShot && _footBones && model) {
        _ensureSoleOffset();
        const savedY = group.position.y;
        group.position.y = 0;
        model.updateMatrixWorld(true);
        let minSole = Infinity;
        if (_footBones.left) {
          _footBones.left.getWorldPosition(_footV);
          minSole = Math.min(minSole, _footV.y - _soleOffWorld);
        }
        if (_footBones.right) {
          _footBones.right.getWorldPosition(_footR);
          minSole = Math.min(minSole, _footR.y - _soleOffWorld);
        }
        group.position.y = savedY;
        soleWorldAtZero = Number.isFinite(minSole) ? minSole : 0;
        // Surface the champion stands on (analytic, from the layout when the
        // city provides it). Sink bias −0.01: the eye forgives 1 cm of sink,
        // never 1 cm of float.
        const surface = city && typeof city.groundHeightAt === 'function'
          ? city.groundHeightAt(state.pos.x, state.pos.z)
          : 0;
        const targetY = state.y + (surface - 0.01) - soleWorldAtZero;
        // Snap on teleport / fly-to (large delta); smooth small walk-stride
        // deltas so the body doesn't jitter with the clip.
        const dy = targetY - group.position.y;
        const smooth = 1 - Math.exp(-12 * dt);
        group.position.y += Math.abs(dy) > 0.25 ? dy : dy * smooth;
        group.position.x = state.pos.x;
        group.position.z = state.pos.z;
        // Diagnostics for the debug HUD (cheap — same values already computed).
        // gap = sole world Y − surface top; target ≈ −0.01 (deliberate sink bias).
        groundDebug.surface = surface;
        groundDebug.soleY = soleWorldAtZero + group.position.y;
        groundDebug.gap = (soleWorldAtZero + group.position.y) - surface;
        groundDebug.soleOff = _soleOffWorld;
      } else {
        // No foot bones (static/procedural model, or a rig this build can't
        // detect): keep the model planted at its REST pose. loadSkin() and the
        // procedural robot both normalise the lowest point to y≈0, and a
        // skeleton-less model never deforms with the shared clips — so the old
        // bunny-calibrated DROP_FRAC lift would sink or float it instead.
        // Still honour the walkable SURFACE height (bare ground, sidewalk or
        // asphalt from city.groundHeightAt) so a static skin crossing a road
        // or raised plaza never sinks into it; smooth like the foot-bone path.
        const surface = city && typeof city.groundHeightAt === 'function'
          ? city.groundHeightAt(state.pos.x, state.pos.z)
          : 0;
        const targetY = state.y + (surface - 0.01);
        const dyNoBone = targetY - group.position.y;
        const smoothNoBone = 1 - Math.exp(-12 * dt);
        group.position.y += Math.abs(dyNoBone) > 0.25 ? dyNoBone : dyNoBone * smoothNoBone;
        group.position.x = state.pos.x;
        group.position.z = state.pos.z;
      }
      group.rotation.y = state.facing;
    },
    wave() { triggerOneShot('wave'); },
    groundDebug,   // debug HUD: { surface, soleY, gap, soleOff } — metres
    // Land the champion on the surface at (x,z) — used when exiting a taxi so
    // it never floats (the old hard-coded y=0 left it 0.1 m up on bare ground).
    landAt(x, z) {
      state.pos.set(x, 0, z);
      state.y = 0; state.yVel = 0; state.isGrounded = true;
      const surface = city && typeof city.groundHeightAt === 'function'
        ? city.groundHeightAt(x, z)
        : 0;
      if (!state.oneShot && _footBones && model) {
        _ensureSoleOffset();
        const savedY = group.position.y;
        group.position.y = 0;
        model.updateMatrixWorld(true);
        let minSole = Infinity;
        if (_footBones.left) { _footBones.left.getWorldPosition(_footV); minSole = Math.min(minSole, _footV.y - _soleOffWorld); }
        if (_footBones.right) { _footBones.right.getWorldPosition(_footR); minSole = Math.min(minSole, _footR.y - _soleOffWorld); }
        group.position.y = savedY;
        const soleWorldAtZero = Number.isFinite(minSole) ? minSole : 0;
        group.position.set(x, surface - 0.01 - soleWorldAtZero, z);
      } else {
        group.position.set(x, surface - 0.01, z);
      }
    },
    // Re-ground in place without teleporting x/z — used right after a skin
    // swap/spawn so the current model is planted on the surface immediately.
    settleGrounding() {
      this.landAt(state.pos.x, state.pos.z);
    },
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
