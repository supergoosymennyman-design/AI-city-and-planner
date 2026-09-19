// particles.js — pooled THREE.Points particle system.
// Pre-allocates a fixed buffer (no GC spikes at 60fps). Used for footstep dust.
import * as THREE from 'three';

export class ParticlePool {
  constructor(scene, max = 120) {
    this.max = max;
    this.cursor = 0;
    this.positions = new Float32Array(max * 3);
    this.velocities = new Float32Array(max * 3);
    this.lifetimes = new Float32Array(max);
    this.maxLifetimes = new Float32Array(max).fill(1);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.material = new THREE.PointsMaterial({
      color: 0x00f2fe,
      size: 0.14,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.visible = false;
    scene.add(this.points);
  }

  spawn(pos, count = 4, spread = 0.35, up = 1.2) {
    for (let k = 0; k < count; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      this.positions[i * 3] = pos.x + (Math.random() - 0.5) * spread;
      this.positions[i * 3 + 1] = pos.y + 0.1;
      this.positions[i * 3 + 2] = pos.z + (Math.random() - 0.5) * spread;
      this.velocities[i * 3] = (Math.random() - 0.5) * 0.6;
      this.velocities[i * 3 + 1] = Math.random() * up + 0.3;
      this.velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.6;
      this.lifetimes[i] = 0;
      this.maxLifetimes[i] = 0.5 + Math.random() * 0.4;
    }
    this.points.visible = true;
  }

  update(dt) {
    let any = false;
    const p = this.positions, v = this.velocities, l = this.lifetimes, ml = this.maxLifetimes;
    for (let i = 0; i < this.max; i++) {
      if (l[i] < ml[i]) {
        any = true;
        l[i] += dt;
        const t = l[i] / ml[i];
        p[i * 3] += v[i * 3] * dt;
        p[i * 3 + 1] += v[i * 3 + 1] * dt;
        p[i * 3 + 2] += v[i * 3 + 2] * dt;
        v[i * 3 + 1] -= 3 * dt; // gravity
        p[i * 3 + 1] = Math.max(0.02, p[i * 3 + 1]);
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    // fade whole system by oldest active particle
    let oldest = 1;
    for (let i = 0; i < this.max; i++) {
      if (l[i] < ml[i]) {
        const t = l[i] / ml[i];
        if (t < oldest) oldest = t;
      }
    }
    this.material.opacity = Math.max(0, 0.9 * (1 - oldest * 0.8));
    if (!any) this.points.visible = false;
  }
}
