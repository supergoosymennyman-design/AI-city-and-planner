// orbit-controls.js — touch/mouse camera orbit for the AI City simulators.
// A toggle button switches between normal play and "look around" mode:
//  - single-finger drag / left-drag  → orbit around the champion
//  - two-finger pinch / scroll wheel → zoom in/out
// When idle for a while (or toggled off) the camera eases back to the default
// behind-the-champion view so children never get stuck in a weird angle.
import * as THREE from 'three';

export function createOrbitControls(canvas, opts) {
  opts = opts || {};
  const ROT = 0.005;                            // radians per px of drag
  const MIN_ELEV = 0.12;                        // ~7°  — never go flat
  const MAX_ELEV = 1.35;                        // ~77° — never go overhead
  const minDist = opts.minDist ?? 3;
  const maxDist = opts.maxDist ?? 60;
  const resetDelay = opts.resetDelay ?? 9000;   // idle ms before auto-reset

  const initial = opts.initialOffset || new THREE.Vector3(0, 17, -26);
  let azimuth = Math.atan2(initial.x, initial.z);          // horizontal angle
  let elevation = Math.atan2(initial.y, Math.hypot(initial.x, initial.z)); // pitch
  let distance = initial.length();
  const home = { azimuth, elevation, distance };

  let enabled = false;
  let lastInteraction = performance.now();
  const offset = new THREE.Vector3();

  // pointer/pinch state
  const pointers = new Map();
  let dragging = false;
  let lastX = 0, lastY = 0;
  let pinchDist = 0;

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function targetOffset(out) {
    const h = distance * Math.cos(elevation);
    out.set(
      h * Math.sin(azimuth),
      distance * Math.sin(elevation),
      h * Math.cos(azimuth)
    );
    return out;
  }
  function touch() { lastInteraction = performance.now(); }

  function onPointerDown(e) {
    if (!enabled) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      dragging = true;
      lastX = e.clientX; lastY = e.clientY;
    } else if (pointers.size === 2) {
      const p = [...pointers.values()];
      pinchDist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
    }
    touch();
    if (canvas.setPointerCapture) { try { canvas.setPointerCapture(e.pointerId); } catch {} }
    e.preventDefault();
  }
  function onPointerMove(e) {
    if (!enabled) return;
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      // just finished a pinch → skip one move so the camera doesn't jump
      if (pinchDist !== 0) { pinchDist = 0; lastX = e.clientX; lastY = e.clientY; return; }
      if (dragging) {
        azimuth -= (e.clientX - lastX) * ROT;
        elevation = clamp(elevation + (e.clientY - lastY) * ROT, MIN_ELEV, MAX_ELEV);
        lastX = e.clientX; lastY = e.clientY;
      }
    } else if (pointers.size === 2) {
      const p = [...pointers.values()];
      const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      if (pinchDist > 0) distance = clamp(distance * (pinchDist / d), minDist, maxDist);
      pinchDist = d;
    }
    touch();
    e.preventDefault();
  }
  function onPointerUp(e) {
    pointers.delete(e.pointerId);
    if (pointers.size === 0) dragging = false;
  }
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('wheel', (e) => {
    if (!enabled) return;
    e.preventDefault();
    distance = clamp(distance * (1 + e.deltaY * 0.001), minDist, maxDist);
    touch();
  }, { passive: false });

  return {
    setEnabled(on) {
      enabled = !!on;
      if (enabled) touch();
    },
    toggle() { this.setEnabled(!enabled); return enabled; },
    isEnabled: () => enabled,
    // Retarget the "home" view (used when boarding/exiting the taxi so the
    // camera sits at a different distance/elevation while riding).
    setHome(offset) {
      home.azimuth = Math.atan2(offset.x, offset.z);
      home.elevation = Math.atan2(offset.y, Math.hypot(offset.x, offset.z));
      home.distance = offset.length();
    },
    // Ease back home: fast when toggled off, slow after idle while enabled.
    update(dt) {
      const idle = enabled && (performance.now() - lastInteraction > resetDelay);
      const rate = idle ? 1.1 : (enabled ? 0 : 2.2);
      if (rate > 0) {
        const k = Math.min(1, dt * rate);
        azimuth += (home.azimuth - azimuth) * k;
        elevation += (home.elevation - elevation) * k;
        distance += (home.distance - distance) * k;
      }
    },
    targetOffset,
    resetNow() { azimuth = home.azimuth; elevation = home.elevation; distance = home.distance; },
    // debug/inspection helper
    getState() {
      return {
        azimuth: +azimuth.toFixed(3),
        elevation: +elevation.toFixed(3),
        distance: +distance.toFixed(3),
        homeAzimuth: +home.azimuth.toFixed(3),
        enabled,
        idleMs: Math.round(performance.now() - lastInteraction),
      };
    },
  };
}
