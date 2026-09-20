// drive.js — drivable ground cars for the 3D AI City.
//
// Mirrors the flying taxi's board/update/exit contract (champion-city/taxi.js)
// but for ground vehicles: the champion boards a car the child placed (or a
// default spawn), drives with camera-relative input on y=0, and exits back to
// walking with the car left parked where they stopped.
//
// One controller per car instance. The host (city-builder.js) owns the input
// mapping (Walk/Run buttons + WASD produce input.x/z) and the collision pass
// (resolveCollision on the car's footprint).
import * as THREE from 'three';

export function createDrivableCar(scene, group, opts = {}) {
  const walkSpeed = opts.walkSpeed ?? 15;   // m/s — city is 2000 m across
  const runSpeed = opts.runSpeed ?? 30;
  const radius = opts.radius ?? 1.1;        // collision radius (half-width-ish)

  const state = {
    active: false, exiting: false, parked: false,
    champion: null,
    pos: new THREE.Vector3(),
    facing: 0,
  };
  // Where the champion is dropped when exiting (world coords).
  const exitSpot = new THREE.Vector3();

  const api = {
    group,
    isActive: () => state.active,
    isParked: () => state.parked,
    getPos: () => state.pos,
    /** Board the champion at the car's current spot. */
    board(champion) {
      if (state.active) return;
      state.champion = champion;
      state.active = true; state.exiting = false; state.parked = false;
      // Snap the car to the champion's position + facing so boarding feels
      // instant ("hop in the car I'm standing next to").
      state.pos.set(champion.state.pos.x, 0, champion.state.pos.z);
      state.facing = champion.state.facing;
      champion.group.visible = false;
      group.visible = true;
      group.position.copy(state.pos);
      group.rotation.y = state.facing;
    },
    /** Exit immediately — the champion reappears beside the car, car stays parked. */
    exit() {
      if (!state.active || state.exiting) return;
      state.exiting = true;
      // Instant step-out: drop the champion beside the car on the same frame.
      const ch = state.champion;
      if (ch) {
        ch.group.visible = true;
        ch.state.pos.set(exitSpot.x, 0, exitSpot.z);
        ch.state.y = 0; ch.state.yVel = 0; ch.state.isGrounded = true;
        ch.group.position.set(exitSpot.x, 0, exitSpot.z);
        ch.group.rotation.y = state.facing;
      }
      // Leave the car PARKED where it stopped (visible), so the child can walk
      // back and board it again.
      group.visible = true;
      state.active = false; state.exiting = false; state.parked = true;
      state.champion = null;
    },
    /** Instant deactivate (no animation) — used by reset/hub nav. */
    reset() {
      if (!state.active) return;
      group.visible = false;
      state.active = false; state.exiting = false; state.parked = false;
      if (state.champion) state.champion.group.visible = true;
      state.champion = null;
    },
    /**
     * Advance the car by `dt`. `input` is {x, z, running} in CAMERA-RELATIVE
     * space (host passes cameraRelativeMove output, same as walking/taxi).
     * Returns true while the car is still occupied (including during exit).
     */
    update(dt, input, tNow) {
      if (!state.active) return false;

      input = input || {};
      const hasMove = Math.abs(input.x || 0) > 0.01 || Math.abs(input.z || 0) > 0.01;
      const speed = input.running ? runSpeed : walkSpeed;
      if (hasMove) {
        const len = Math.hypot(input.x || 0, input.z || 0) || 1;
        const dx = (input.x || 0) / len, dz = (input.z || 0) / len;
        state.pos.x += dx * speed * dt;
        state.pos.z += dz * speed * dt;
        // Car turns toward travel direction (smoothly, like the taxi).
        const targetYaw = Math.atan2(dx, dz);
        let diff = targetYaw - state.facing;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        state.facing += diff * Math.min(1, dt * 6);
      }
      // Ground vehicle: always ride on y=0 (city floor).
      state.pos.y = 0;

      group.position.set(state.pos.x, 0, state.pos.z);
      group.rotation.y = state.facing;

      // Remember where the champion will step out (behind the car, driver's side).
      exitSpot.set(
        state.pos.x - Math.sin(state.facing) * 2.2,
        0,
        state.pos.z - Math.cos(state.facing) * 2.2
      );
      return true;
    },
    /** Collision radius in metres (host uses for building slide). */
    radius,
  };

  return api;
}
