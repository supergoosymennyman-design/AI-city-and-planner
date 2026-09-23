import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { frameBox, farPlaneFor } from './ui/frame.js';

export class Viewport {
  constructor(container, scene) {
    this.container = container;
    this.threeScene = scene.threeScene;
    this.documentRoot = scene.group;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    this.camera.position.set(5, 4, 6);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 1, 0);
    this.controls.enableDamping = true;

    this.addEnvironment(scene.threeScene);

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  addEnvironment(threeScene) {
    const grid = new THREE.GridHelper(20, 20, 0x00e5ff, 0x123a52);
    grid.position.y = 0.001;
    threeScene.add(grid);

    // Axis markers so builders know which way is which. Teal/cyan scheme on the
    // dark background; the FRONT marker at +Z shows which way characters face.
    const axesGroup = new THREE.Group();
    axesGroup.position.y = 0.01;
    const mkAxis = (to, color) => {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), to]);
      return new THREE.Line(g, new THREE.LineBasicMaterial({ color }));
    };
    const alen = 1.4;
    axesGroup.add(mkAxis(new THREE.Vector3(alen, 0, 0), 0x00ffc8));
    axesGroup.add(mkAxis(new THREE.Vector3(0, alen, 0), 0x00e5ff));
    axesGroup.add(mkAxis(new THREE.Vector3(0, 0, alen), 0x6ee7ff));
    threeScene.add(axesGroup);

    const len = 1.5;
    threeScene.add(this.makeLabel('X', '#00ffc8', len, 0.02, 0));
    threeScene.add(this.makeLabel('Y', '#00e5ff', 0.02, len, 0));
    threeScene.add(this.makeLabel('Z', '#6ee7ff', 0, 0.02, len));
    const front = this.makeLabel('FRONT', '#ffc857', 0, 0.03, len);
    front.position.x = -0.5;
    threeScene.add(front);

    threeScene.add(new THREE.AmbientLight(0xffffff, 0.7));

    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(5, 8, 4);
    threeScene.add(sun);

    const fill = new THREE.DirectionalLight(0xffffff, 0.4);
    fill.position.set(-4, 2, -5);
    threeScene.add(fill);
  }

  makeLabel(text, color, x, y, z) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.font = '700 52px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Dark outline around the neon text so it reads against the dark background.
    ctx.lineWidth = 9;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(4,12,24,0.95)';
    ctx.strokeText(text, 128, 32);
    ctx.fillStyle = color;
    ctx.fillText(text, 128, 32);
    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }),
    );
    sprite.position.set(x, y, z);
    sprite.scale.set(0.75, 0.19, 1);
    return sprite;
  }

  resetView() {
    this.camera.position.set(5, 4, 6);
    this.controls.target.set(0, 1, 0);
    if (this.documentRoot && this.frameContents(this.documentRoot)) return;
    this.controls.update();
  }

  /**
   * Frame everything in `object3D`, keeping the angle the camera already looks from.
   *
   * resetView()'s (5, 4, 6) was picked for the 1-unit starter box and nothing re-framed after an
   * import, so a model of any other size landed wherever that fixed distance left it. Called after
   * an import or a generated model arrives, so the child sees what turned up instead of a speck.
   *
   * @returns {boolean} false when there was nothing to frame (the caller may fall back to resetView)
   */
  frameContents(object3D) {
    const box = new THREE.Box3().setFromObject(object3D);
    if (box.isEmpty() || !Number.isFinite(box.min.x) || !Number.isFinite(box.max.x)) return false;
    // The direction the camera currently looks FROM, so framing changes distance, never angle.
    const direction = this.camera.position.clone().sub(this.controls.target);
    if (direction.lengthSq() < 1e-12) direction.set(5, 4, 6);
    const framed = frameBox(
      { min: box.min.toArray(), max: box.max.toArray() },
      { fovDeg: this.camera.fov, aspect: this.camera.aspect, direction: direction.toArray() },
    );
    this.camera.position.fromArray(framed.position);
    this.controls.target.fromArray(framed.target);
    const far = farPlaneFor(framed.distance, framed.radius, this.camera.far);
    // A tiny generated build can be closer than the default 0.1 near plane. Moving the camera
    // without moving that plane clips the entire model even though the fitted maths is correct.
    const near = Math.min(0.1, (framed.distance - framed.radius) / 2);
    if (far !== this.camera.far || near !== this.camera.near) {
      this.camera.far = far;
      this.camera.near = near;
      this.camera.updateProjectionMatrix();
    }
    this.controls.update();
    return true;
  }

  resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  render() {
    this.controls.update();
    this.renderer.render(this.threeScene, this.camera);
  }
}
