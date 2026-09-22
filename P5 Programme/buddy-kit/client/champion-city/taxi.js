// taxi.js — a cyberpunk flying taxi. The champion boards it and the student
// flies around the city. Hold-to-climb (ascend) / hold-to-descend, hover on
// release. On exit the taxi rises sharply and fades out; the champion is placed
// back on the ground at the taxi's last position.
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { createGLTFLoader } from '../shared/gltf.js';

function withColor(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

// Shared taxi geometry builder. Returns merged, vertex-coloured geometries so
// the interactive taxi and the decorative background taxis stay visually
// consistent. `opts.decorative` drops the underbody glow + landing light so a
// background taxi never gets mistaken for the player's own.
export function buildTaxiGeometry(opts = {}) {
  const deco = !!opts.decorative;
  const bodyParts = [];
  const accParts = [];
  bodyParts.push(withColor(new THREE.CylinderGeometry(1.7, 1.7, 0.8, 24).translate(0, 0.1, 0), 0x1a2636));
  accParts.push(withColor(new THREE.SphereGeometry(0.9, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.55, 0), 0x00f2fe));   // canopy
  for (let i = 0; i < 4; i++) {
    const ang = (Math.PI / 2) * i + Math.PI / 4;
    accParts.push(withColor(new THREE.CylinderGeometry(0.5, 0.5, 0.14, 10).translate(Math.cos(ang) * 1.15, -0.18, Math.sin(ang) * 1.15), 0x00f2fe));
  }
  accParts.push(withColor(new THREE.TorusGeometry(1.75, 0.07, 8, 24).rotateX(Math.PI / 2).translate(0, 0.1, 0), 0x00f2fe));       // top rim glow
  if (!deco) {
    accParts.push(withColor(new THREE.TorusGeometry(1.55, 0.09, 8, 28).rotateX(Math.PI / 2).translate(0, -0.3, 0), 0xe8fbff));    // underbody glow ring
    accParts.push(withColor(new THREE.SphereGeometry(0.16, 8, 6).translate(0, -0.3, 1.6), 0xffffff));   // landing light
  }
  // rotor: flat disc + blades (spins on the player taxi; instanced above deco taxis)
  const rotorParts = [
    withColor(new THREE.CylinderGeometry(0.85, 0.85, 0.02, 12), 0xbfe9ff),
    withColor(new THREE.BoxGeometry(1.5, 0.02, 0.08), 0xbfe9ff),
  ];
  return {
    bodyGeo: BufferGeometryUtils.mergeGeometries(bodyParts, false),
    accGeo: BufferGeometryUtils.mergeGeometries(accParts, false),
    rotorGeo: BufferGeometryUtils.mergeGeometries(rotorParts, false),
  };
}

export function createFlyingTaxi(scene, opts = {}) {
  const walkSpeed = opts.walkSpeed || 4;
  const runSpeed = opts.runSpeed || 8;
  // Boarding cruise target: the taxi rises to this height on take-off and holds
  // there until the pilot steers. The city builder's buildings reach ~220m, so
  // it passes ~240 to clear the skyline. During free flight the pilot may then
  // climb or descend as they please (only a small ground floor is kept).
  const cruiseFloor = opts.cruiseFloor ?? 50;
  // Auto-navigation cruise altitude. During auto-nav the taxi must clear every
  // building in its path, so hosts with tall buildings (the 3D city builder,
  // up to 220m) pass a high cruise altitude.
  const autoNavFloor = opts.autoNavFloor ?? 3;

  const { bodyGeo, accGeo, rotorGeo } = buildTaxiGeometry();
  const bodyMesh = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.5 }));
  const accMesh = new THREE.Mesh(accGeo, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, transparent: true, opacity: 0.9 }));
  const rotor = new THREE.Group();
  const rotorMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  rotor.add(new THREE.Mesh(rotorGeo, rotorMat));
  rotor.position.y = 1.15;

  const group = new THREE.Group();
  group.name = 'flying-taxi';   // stable handle for debugging/verification
  group.add(bodyMesh, accMesh, rotor);
  group.visible = false;
  scene.add(group);

  // GLB taxi model — replaces the procedural visual asynchronously (fallback
  // to the procedural saucer if the model fails to load). No rotor: the GLB
  // rotor is baked in, per the design decision.
  let model = null;   // loaded GLB scene when ready

  function setFade(k) {
    if (model) {
      model.traverse((o) => {
        if (o.isMesh && o.material) {
          o.material.transparent = true;
          o.material.opacity = (o.userData._bo ?? 1) * (1 - k);
        }
      });
    } else {
      bodyMesh.material.opacity = 1 - k;
      accMesh.material.opacity = 0.9 * (1 - k);
    }
  }
  function resetVisual() {
    if (model) {
      model.traverse((o) => {
        if (o.isMesh && o.material) {
          o.material.transparent = false;
          o.material.opacity = o.userData._bo ?? 1;
        }
      });
    } else {
      bodyMesh.material.opacity = 1; bodyMesh.material.transparent = false;
      accMesh.material.opacity = 0.9;
    }
  }
  function disposeProcedural() {
    [bodyMesh, accMesh, rotor].forEach((obj) => {
      obj.traverse((n) => {
        if (n.isMesh) {
          if (n.geometry) n.geometry.dispose();
          if (n.material) n.material.dispose();
        }
      });
    });
  }

  // Champion boarding fade (2026-08-29): fade the champion OUT into the taxi on
  // take-off (opacity 1→0), and restore the EXACT authored material state when
  // k reaches 1 (e.g. the ground ring's 0.45 opacity must come back, not 1).
  // Traverses every mesh (skinned body + gear).
  let championMatState = null;
  function captureChampionMaterials() {
    championMatState = [];
    const ch = state.champion;
    if (!ch || !ch.group) return;
    ch.group.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => { if (m) championMatState.push({ m, transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite }); });
    });
  }
  function setChampionFade(k) {
    if (!championMatState) captureChampionMaterials();
    championMatState.forEach((s) => {
      if (k >= 1) {
        s.m.transparent = s.transparent;
        s.m.opacity = s.opacity;
        s.m.depthWrite = s.depthWrite;
      } else {
        s.m.transparent = true;
        s.m.opacity = Math.max(0, Math.min(1, k));
        s.m.depthWrite = false;
      }
    });
  }

  function easeInOut(k) {
    return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  }

  function loadModel() {
    const path = opts.taxiModel || '../champion-city/assets/models/taxi.glb';
    try {
      createGLTFLoader().load(path, (gltf) => {
        const m = gltf.scene;
        // Centre the model, scale it to the current saucer footprint (~3.4 m),
        // and sit its base on y=0 so boarding/landing logic is unchanged.
        const box = new THREE.Box3().setFromObject(m);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        m.position.sub(center);
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const s = 3.4 / maxDim;
        m.scale.setScalar(s);
        m.position.y += (size.y / 2) * s;
        m.traverse((o) => { if (o.isMesh && o.material) o.userData._bo = o.material.opacity ?? 1; });
        group.remove(bodyMesh, accMesh, rotor);
        disposeProcedural();
        model = m;
        group.add(model);
      }, undefined, (e) => {
        console.warn('[taxi] GLB load failed, keeping procedural taxi', e);
      });
    } catch (e) {
      console.warn('[taxi] GLB unavailable, keeping procedural taxi', e);
    }
  }

  const state = {
    active: false, exiting: false, exitT: 0,
    champion: null,
    pos: new THREE.Vector3(),
    facing: 0,
    // BOARDING SEQUENCE (2026-08-29): the taxi spawns ON THE GROUND at the
    // champion's feet, the champion quickly fades into it (~0.4s), THEN the taxi
    // rises smoothly to cruise altitude (~2s). Replaces the old instant 50m pop.
    boarding: false,
    boardT: 0,
    boardStartY: 0,
    fadeDone: false,
  };
  let autoNavActive = false;   // during auto-navigation, bypass the 50m floor

  // Skin-swap hook (2026-09-10): swapping the champion's skin mid-ride replaces
  // its WHOLE model, so the material list captured at board() points at the old
  // (disposed) materials — the new passenger would appear fully opaque inside
  // the cab and exit() would restore stale objects. Re-capture + re-apply the
  // current boarding-fade whenever the champion model changes while the taxi is
  // active. Subscribed once per champion in board().
  const BOARD_FADE_SEC = 0.4;   // must match FADE_T inside update()
  let skinSub = null;           // { champion, unsub }
  function onChampionSkinSwap() {
    if (!state.active || !state.champion) return;   // not riding — nothing to keep in sync
    captureChampionMaterials();                      // re-point the fade at the swapped-in model
    if (state.boarding && !state.fadeDone && state.champion.group.visible) {
      const kFade = Math.min(1, state.boardT / BOARD_FADE_SEC);
      setChampionFade(1 - kFade);                    // keep the dissolve level mid-fade
    }
  }
  function subscribeSkinChanges(champion) {
    if (!champion || typeof champion.addSkinListener !== 'function') return;
    if (skinSub && skinSub.champion === champion) return;   // already subscribed
    if (skinSub && skinSub.unsub) { try { skinSub.unsub(); } catch (e) { /* ignore */ } }
    skinSub = { champion, unsub: champion.addSkinListener(onChampionSkinSwap) };
  }

  const api = {
    group,
    isActive: () => state.active,
    // True during the landing animation after exit(): the ride is ending, so
    // flight controls should already be gone even though `active` is still true.
    isExiting: () => state.exiting,
    getPos: () => state.pos,
    setAutoNav(on) { autoNavActive = !!on; },
    board(champion) {
      state.champion = champion;
      subscribeSkinChanges(champion);
      state.active = true; state.exiting = false;
      // Board at the champion's current position ON THE GROUND: the taxi spawns
      // at the champion's feet (slightly lifted so it doesn't clip the floor)
      // and the champion fades INTO it before the ascent — no instant high spawn.
      state.pos.set(champion.state.pos.x, champion.state.y > 1 ? champion.state.y : 1.5, champion.state.pos.z);
      state.facing = champion.state.facing;
      champion.group.visible = true;   // keep visible — it fades into the taxi first
      group.visible = true;
      group.position.copy(state.pos);
      group.rotation.y = state.facing;
      resetVisual();
      // Boarding sequence: fade the champion in (~0.4s), then rise to cruise (~2s).
      state.boarding = true;
      state.boardT = 0;
      state.boardStartY = state.pos.y;
      state.fadeDone = false;
      captureChampionMaterials();   // fresh capture — restore exact authored opacities on exit
      setChampionFade(1);           // show originals at the start of boarding
    },
    exit() {
      if (!state.active || state.exiting) return;
      state.exiting = true; state.exitT = 0;
      state.boarding = false;
      // Leaving mid-boarding: bring the champion straight back (it may be mid-fade).
      if (state.champion) {
        state.champion.group.visible = true;
        setChampionFade(1);
      }
    },
    // Instant deactivate (used on district switch) — no exit animation.
    reset() {
      if (!state.active) return;
      group.visible = false;
      state.active = false; state.exiting = false; state.boarding = false;
      resetVisual();
      if (state.champion) {
        state.champion.group.visible = true;
        setChampionFade(1);
      }
      state.champion = null;
    },
    update(dt, input, tNow) {
      if (!state.active) return;
      if (state.exiting) {
        state.exitT += dt;
        const k = Math.min(1, state.exitT / 0.8);
        state.pos.y += 34 * dt;                       // rise sharply
        group.position.copy(state.pos);
        setFade(k);
        if (k >= 1) {
          group.visible = false;
          state.active = false; state.exiting = false;
          resetVisual();
          const ch = state.champion;
          if (ch) {
            ch.group.visible = true;
            // Always land the champion ON THE SURFACE under the taxi (bare
            // ground, sidewalk or asphalt). The champion never walks across the
            // sky — if it leaves the taxi high up it falls to street level, so
            // it can never walk on rooftops or in the air. `landAt` is
            // surface-aware (the old hard-coded y=0 left it 0.1 m up on bare
            // ground).
            if (typeof ch.landAt === 'function') ch.landAt(state.pos.x, state.pos.z);
            else { ch.state.pos.set(state.pos.x, 0, state.pos.z); ch.state.y = 0; ch.state.yVel = 0; ch.state.isGrounded = true; ch.group.position.set(state.pos.x, 0, state.pos.z); }
          }
          state.champion = null;
        }
        return;
      }

      input = input || {};
      // ── BOARDING (2026-08-29): champion fades into the taxi on the ground,
      //    then the taxi rises smoothly to cruise altitude. No instant 50m pop.
      if (state.boarding) {
        state.boardT += dt;
        const FADE_T = 0.4;
        const RISE_END = 2.4;
        const ch = state.champion;
        // Phase 1 — the champion dissolves into the taxi.
        if (!state.fadeDone && ch) {
          const kFade = Math.min(1, state.boardT / FADE_T);
          setChampionFade(1 - kFade);
          if (kFade >= 1) {
            state.fadeDone = true;
            ch.group.visible = false;
            setChampionFade(1);   // restore materials so exit shows it cleanly
          }
        }
        // Phase 2 — ease from the ground start up to the cruise altitude.
        const targetFloor = autoNavActive ? autoNavFloor : cruiseFloor;
        const targetY = Math.max(targetFloor, state.boardStartY);
        const kRise = Math.min(1, Math.max(0, (state.boardT - FADE_T) / (RISE_END - FADE_T)));
        state.pos.y = state.boardStartY + (targetY - state.boardStartY) * easeInOut(kRise);
        group.position.set(state.pos.x, state.pos.y + 0.3 * Math.sin(tNow * 2), state.pos.z);
        group.rotation.y = state.facing;
        if (!model) rotor.rotation.y = tNow * 20;
        if (kRise >= 1) state.boarding = false;   // cruising — normal rules take over
        return;
      }

      const hasMove = Math.abs(input.x || 0) > 0.01 || Math.abs(input.z || 0) > 0.01;
      const speed = input.running ? runSpeed : walkSpeed;
      if (hasMove) {
        const len = Math.hypot(input.x || 0, input.z || 0) || 1;
        const dx = (input.x || 0) / len, dz = (input.z || 0) / len;
        state.pos.x += dx * speed * dt;
        state.pos.z += dz * speed * dt;
        const targetYaw = Math.atan2(dx, dz);
        let diff = targetYaw - state.facing;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        state.facing += diff * Math.min(1, dt * 6);
      }
      // Manual altitude: climb / descend freely at 30 m/s (2026-09-20; was 12).
      // The boarding cruise sits at 240 m in the city builder, so 12 m/s meant a
      // ~20 s hold to reach the ground — too slow. At 30 m/s a full cruise-to-
      // ground descent takes ~8 s: clearly quicker, still controllable. In free
      // flight the pilot owns the altitude — only a small floor (~3 m) stops the
      // taxi from clipping the ground. During auto-navigation (setAutoNav) the
      // taxi holds `autoNavFloor` so it clears every building on its route; the
      // host still steers it onto a target via the ascend/descend inputs.
      if (input.ascend) state.pos.y += 30 * dt;
      else if (input.descend) state.pos.y -= 30 * dt;
      const floor = autoNavActive ? autoNavFloor : 3;
      // Smooth climb to the floor — no snap when the floor is above the taxi
      // (e.g. toggling auto-nav while low): rise ~50 m/s instead.
      if (state.pos.y < floor) {
        state.pos.y = Math.min(floor, state.pos.y + 50 * dt);
      }

      group.position.set(state.pos.x, state.pos.y + 0.3 * Math.sin(tNow * 2), state.pos.z);
      group.rotation.y = state.facing;
      // Spin the procedural rotor only — the GLB taxi's rotor is baked in.
      if (!model) rotor.rotation.y = tNow * 20;
    },
  };

  loadModel();   // async swap to the GLB taxi (fallback: procedural)
  return api;
}
