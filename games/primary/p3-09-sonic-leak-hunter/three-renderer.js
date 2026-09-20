/**
 * three-renderer.js — Three.js 3D rendering for Sonic Leak Hunter
 *
 * Provides:
 *  - 3D oscilloscope-style waveform tubes (L3 Edge Case Patrol, L4 Confidence Command)
 *  - 3D water pipe network with orbit camera, raycast selection and floating
 *    confidence sprites (L5 Pipe Vision Inspector)
 *
 * Loaded as a module — imports 'three' via the import map in index.html.
 * Exposes window.ThreeRenderer. All rendering is on a dedicated
 * <canvas id="three-canvas"> element.
 *
 * API:
 *   ThreeRenderer.isSupported()   → bool (WebGL available?)
 *   ThreeRenderer.init(canvas, w, h)
 *   ThreeRenderer.drawWaveform(points, colorHex, {width, height, tubeRadius, glow})
 *   ThreeRenderer.enablePipeMode(onSelect)   → switch to orbit camera + pointer input
 *   ThreeRenderer.drawPipeNetwork(pipes)     → build 3D pipe meshes + confidence sprites
 *   ThreeRenderer.setPipeStatus(pipeId, status) → recolor a pipe
 *   ThreeRenderer.setPipeHighlight(pipeId, on)  → highlight a selected pipe
 *   ThreeRenderer.pickPipeAt(clientX, clientY)  → raycast → pipeId or -1
 *   ThreeRenderer.setSize(w, h)
 *   ThreeRenderer.dispose()
 */

import * as THREE from 'three';

const ThreeRenderer = (() => {
  let scene = null;
  let camera = null;
  let renderer = null;
  let canvasEl = null;
  let animFrame = null;
  let disposed = true;
  let currentGroup = null;

  const clock = new THREE.Clock();

  // ─── Pipe-mode (L5) state ─────────────────────
  let orbitMode = false;
  let orbitTheta = 0.8;
  let orbitPhi = 1.15;
  let orbitRadius = 11;
  let isDragging = false;
  let pointerStartX = 0;
  let pointerStartY = 0;
  let pointerMoved = 0;
  let onPipeSelect = null;
  let pipeMeshes = [];   // [{ mesh, pipeId }]
  let pipeSprites = [];  // [{ pipeId, sprite }]
  let raycaster = new THREE.Raycaster();
  let createdTextures = [];

  // Pipe status → color (Piper's assessment / result states)
  const STATUS_COLORS = {
    leak: '#E76F51',    // red — Piper says leak
    suspect: '#F59E0B', // amber — Piper unsure
    normal: '#35B5C8',  // teal — Piper says normal
    repaired: '#22C55E',// green — fixed
    cleared: '#38BDF8', // light blue — marked safe
    wasted: '#94A3B8',  // gray — crew wasted on false alarm
    missed: '#DC2626'   // dark red — real leak that slipped by
  };

  // 9 pipe segments spread through 3D space (a loose underground network)
  const PIPE_LAYOUT = [
    { a: [-3.6, -2.2, -2.8], b: [-1.2, -2.2, -2.8] },
    { a: [ 1.0, -2.2, -2.8], b: [ 3.4, -2.2, -2.8] },
    { a: [-3.6, -0.2, -1.6], b: [-1.2, -0.2, -1.6] },
    { a: [ 1.0, -0.2, -1.6], b: [ 3.4, -0.2, -1.6] },
    { a: [-3.6,  1.8, -0.4], b: [-1.2,  1.8, -0.4] },
    { a: [ 1.0,  1.8, -0.4], b: [ 3.4,  1.8, -0.4] },
    { a: [-3.6, -1.2,  1.6], b: [-1.2, -1.2,  1.6] },
    { a: [ 1.0, -1.2,  1.6], b: [ 3.4, -1.2,  1.6] },
    { a: [-1.2,  0.8,  2.8], b: [ 1.2,  0.8,  2.8] }
  ];

  /** WebGL support check — call before init(). */
  function isSupported() {
    try {
      const c = document.createElement('canvas');
      return !!(
        window.WebGLRenderingContext &&
        (c.getContext('webgl') || c.getContext('experimental-webgl'))
      );
    } catch (e) {
      return false;
    }
  }

  /** Initialize the scene on a canvas element. Safe to re-init after dispose(). */
  function init(canvas, width, height) {
    if (!canvas) return;
    dispose(); // clean any previous renderer/context first
    canvasEl = canvas;
    disposed = false;

    renderer = new THREE.WebGLRenderer({
      canvas: canvasEl,
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: false
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 1.2, 14);
    camera.lookAt(0, 0.5, 0);

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
    keyLight.position.set(5, 8, 10);
    scene.add(keyLight);

    const fillLight = new THREE.PointLight(0x88ccff, 0.6, 30);
    fillLight.position.set(-6, -3, 6);
    scene.add(fillLight);

    currentGroup = new THREE.Group();
    scene.add(currentGroup);

    animate();
  }

  /** Map 2D canvas wave points onto a 3D curve in the XY plane. */
  function toCurve(points, width, height) {
    const pts = points.map(p => new THREE.Vector3(
      (p.x / width - 0.5) * 14,   // x: [-7, 7]
      (0.5 - p.y / height) * 8,   // y: [-4, 4] (invert canvas y)
      0
    ));
    return new THREE.CatmullRomCurve3(pts);
  }

  /** Remove all meshes from the current group and dispose GPU resources. */
  function clearGroup() {
    if (!currentGroup) return;
    currentGroup.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    });
    // Dispose any canvas textures we created (sprites)
    createdTextures.forEach(t => { try { t.dispose(); } catch (e) { /* safe */ } });
    createdTextures = [];
    currentGroup.clear();
    pipeMeshes = [];
    pipeSprites = [];
  }

  /**
   * Draw a waveform as a neon 3D tube (L3 Edge Case Patrol).
   * @param {Array<{x:number,y:number}>} points
   * @param {string} colorHex - e.g. '#38BDF8'
   * @param {object} [options] - { width, height, tubeRadius, glow }
   */
  function drawWaveform(points, colorHex, options = {}) {
    if (!scene || !currentGroup) return;
    clearGroup();

    const width = options.width || 500;
    const height = options.height || 300;
    const color = new THREE.Color(colorHex);

    const curve = toCurve(points, width, height);
    const segments = Math.min(points.length * 4, 400);
    const radius = options.tubeRadius || 0.14;

    // Main tube (solid neon)
    const tubeGeo = new THREE.TubeGeometry(curve, segments, radius, 8, false);
    const tubeMat = new THREE.MeshStandardMaterial({
      color: color,
      emissive: color,
      emissiveIntensity: 0.6,
      roughness: 0.4,
      metalness: 0.2
    });
    currentGroup.add(new THREE.Mesh(tubeGeo, tubeMat));

    // Glow halo (larger, transparent)
    if (options.glow !== false) {
      const glowGeo = new THREE.TubeGeometry(curve, segments, radius * 2.2, 8, false);
      const glowMat = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.15,
        depthWrite: false
      });
      currentGroup.add(new THREE.Mesh(glowGeo, glowMat));
    }
  }

  /**
   * Draw a vertical confidence bar + mini waveform preview (L4 Confidence Command).
   * @param {number} percent - 0-100
   * @param {string} colorHex
   * @param {Array<{x:number,y:number}>} [wavePoints] - preview waveform
   * @param {object} [options] - { width, height }
   */
  function drawConfidenceBar(percent, colorHex, wavePoints, options = {}) {
    if (!scene || !currentGroup) return;
    clearGroup();

    const color = new THREE.Color(colorHex);
    const pct = Math.max(4, Math.min(100, percent));
    const barHeight = (pct / 100) * 6 + 0.5;

    // Confidence bar — rounded cylinder sitting on the ground
    const barGeo = new THREE.CylinderGeometry(0.55, 0.55, barHeight, 24);
    barGeo.translate(0, barHeight / 2, 0);
    const barMat = new THREE.MeshStandardMaterial({
      color: color,
      emissive: color,
      emissiveIntensity: 0.5,
      roughness: 0.4,
      metalness: 0.15
    });
    const bar = new THREE.Mesh(barGeo, barMat);
    bar.position.set(-3.5, 0, 0);
    currentGroup.add(bar);

    // Base disc for grounding
    const baseGeo = new THREE.CylinderGeometry(0.85, 0.95, 0.18, 24);
    baseGeo.translate(0, 0.09, 0);
    const baseMat = new THREE.MeshStandardMaterial({
      color: color,
      emissive: color,
      emissiveIntensity: 0.3,
      roughness: 0.6
    });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.set(-3.5, 0, 0);
    currentGroup.add(base);

    // Top glow dot (floats just above the bar)
    const topDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 16, 16),
      new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.45 })
    );
    topDot.position.set(-3.5, barHeight + 0.35, 0);
    currentGroup.add(topDot);

    // Mini waveform preview tube on the right
    if (wavePoints && wavePoints.length > 1) {
      const curve = toCurve(wavePoints, options.width || 500, options.height || 300);
      const segs = Math.min(wavePoints.length * 3, 200);
      const miniGeo = new THREE.TubeGeometry(curve, segs, 0.08, 6, false);
      const miniMat = new THREE.MeshStandardMaterial({
        color: color,
        emissive: color,
        emissiveIntensity: 0.4,
        roughness: 0.5
      });
      const mini = new THREE.Mesh(miniGeo, miniMat);
      mini.position.set(5.5, -0.5, 0);
      mini.scale.set(1.1, 1.5, 1);
      currentGroup.add(mini);
    }
  }

  /** Animation loop — slow camera drift (L3/L4) OR user-orbitable camera (L5). */
  function animate() {
    if (disposed) return;
    animFrame = requestAnimationFrame(animate);

    const t = clock.getElapsedTime();
    if (camera) {
      if (orbitMode) {
        // User-orbitable spherical camera around the pipe network
        if (!isDragging) orbitTheta += 0.0018; // slow auto-rotate when idle
        camera.position.set(
          orbitRadius * Math.sin(orbitPhi) * Math.cos(orbitTheta),
          orbitRadius * Math.cos(orbitPhi),
          orbitRadius * Math.sin(orbitPhi) * Math.sin(orbitTheta)
        );
        camera.lookAt(0, 0, 0);
      } else {
        camera.position.x = Math.sin(t * 0.25) * 2.5;
        camera.position.y = 1.2 + Math.sin(t * 0.18) * 0.8;
        camera.position.z = 14 - Math.cos(t * 0.25) * 2.5;
        camera.lookAt(0, 0.5, 0);
      }
    }
    if (currentGroup && !orbitMode) {
      currentGroup.rotation.y = Math.sin(t * 0.3) * 0.15;
    }

    if (renderer && scene) renderer.render(scene, camera);
  }

  /** Resize handler for the 3D canvas. */
  function setSize(width, height) {
    if (!renderer || !camera) return;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  /** Full teardown — cancels animation, disposes GPU resources. Idempotent.
   *  NOTE: does NOT call forceContextLoss() — that would permanently poison
   *  the canvas so a later init() on the same element could not create a
   *  fresh WebGL context. renderer.dispose() releases all GPU resources but
   *  leaves the canvas context reusable by the next WebGLRenderer. */
  function dispose() {
    disposed = true;
    disablePipeMode();
    if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
    clearGroup();
    if (renderer) {
      renderer.dispose();
      renderer = null;
    }
    scene = null;
    camera = null;
    canvasEl = null;
    orbitMode = false;
  }

  // ─── Pipe-mode (L5) ─────────────────────────────

  /** Attach pointer listeners for orbit + tap-select. */
  function attachPointerEvents() {
    if (!canvasEl) return;
    canvasEl.style.touchAction = 'none';
    canvasEl.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }

  /** Remove pointer listeners. */
  function detachPointerEvents() {
    if (!canvasEl) return;
    canvasEl.style.touchAction = '';
    canvasEl.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  }

  function onPointerDown(e) {
    isDragging = true;
    pointerStartX = e.clientX;
    pointerStartY = e.clientY;
    pointerMoved = 0;
  }

  function onPointerMove(e) {
    if (!isDragging) return;
    const dx = e.clientX - pointerStartX;
    const dy = e.clientY - pointerStartY;
    pointerStartX = e.clientX;
    pointerStartY = e.clientY;
    pointerMoved += Math.abs(dx) + Math.abs(dy);
    if (pointerMoved > 4) {
      orbitTheta -= dx * 0.008;
      orbitPhi = Math.max(0.35, Math.min(1.45, orbitPhi - dy * 0.008));
    }
  }

  function onPointerUp(e) {
    if (!isDragging) return;
    isDragging = false;
    // A tap (little movement) = select a pipe
    if (pointerMoved < 8) {
      const id = pickPipeAt(e.clientX, e.clientY);
      if (onPipeSelect) onPipeSelect(id);
    }
  }

  /**
   * Switch to pipe-inspection mode (orbit camera + pointer selection).
   * @param {Function} onSelect - callback(pipeId)
   */
  function enablePipeMode(onSelect) {
    orbitMode = true;
    onPipeSelect = onSelect || null;
    orbitTheta = 0.8;
    orbitPhi = 1.15;
    orbitRadius = 11;
    attachPointerEvents();
  }

  /** Leave pipe mode; remove listeners. */
  function disablePipeMode() {
    orbitMode = false;
    onPipeSelect = null;
    detachPointerEvents();
    isDragging = false;
  }

  /** Build a straight pipe mesh between two 3D points. */
  function buildPipeSegment(a, b, colorHex) {
    const start = new THREE.Vector3(a[0], a[1], a[2]);
    const end = new THREE.Vector3(b[0], b[1], b[2]);
    const dir = end.clone().sub(start);
    const len = dir.length();
    const geo = new THREE.CylinderGeometry(0.32, 0.32, len, 12);
    const mat = new THREE.MeshStandardMaterial({
      color: colorHex,
      roughness: 0.45,
      metalness: 0.35
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(start).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    return mesh;
  }

  /** Make a floating sprite showing a confidence percentage. */
  function makeConfidenceSprite(text, colorHex) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    c._labelText = text; // kept for recolor in setPipeStatus
    const ctx = c.getContext('2d');
    ctx.font = 'bold 76px Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = colorHex;
    ctx.fillText(text, 128, 62);
    const tex = new THREE.CanvasTexture(c);
    createdTextures.push(tex);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.7, 0.85, 1);
    return sprite;
  }

  /**
   * Draw the 3D pipe network.
   * @param {Array} pipes - [{ id, status, flagged, confidence }]
   */
  function drawPipeNetwork(pipes) {
    if (!scene || !currentGroup) return;
    clearGroup();

    pipes.forEach((pipe, i) => {
      const seg = PIPE_LAYOUT[i] || PIPE_LAYOUT[0];
      const color = STATUS_COLORS[pipe.status] || STATUS_COLORS.normal;
      const mesh = buildPipeSegment(seg.a, seg.b, color);
      mesh.userData.pipeId = pipe.id;
      currentGroup.add(mesh);
      pipeMeshes.push({ mesh, pipeId: pipe.id });

      // Floating confidence sprite above flagged pipes
      if (pipe.flagged && pipe.confidence != null) {
        const midX = (seg.a[0] + seg.b[0]) / 2;
        const midY = (seg.a[1] + seg.b[1]) / 2;
        const midZ = (seg.a[2] + seg.b[2]) / 2;
        const sprite = makeConfidenceSprite(pipe.confidence + '%', color);
        sprite.position.set(midX, midY + 1.35, midZ);
        currentGroup.add(sprite);
        pipeSprites.push({ pipeId: pipe.id, sprite });
      }
    });
  }

  /** Recolor a pipe after a decision. */
  function setPipeStatus(pipeId, status) {
    const color = STATUS_COLORS[status] || STATUS_COLORS.normal;
    const entry = pipeMeshes.find(p => p.pipeId === pipeId);
    if (entry && entry.mesh.material) entry.mesh.material.color.set(color);
    const spriteEntry = pipeSprites.find(p => p.pipeId === pipeId);
    if (spriteEntry) {
      // Update the sprite text color to match
      const sprite = spriteEntry.sprite;
      if (sprite.material && sprite.material.map) {
        // Rebuild texture with new color
        const canvas = sprite.material.map.image;
        const ctx = canvas.getContext('2d');
        const text = sprite.material.map.image._labelText || '';
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = 'bold 76px Nunito, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = color;
        ctx.fillText(text, 128, 62);
        sprite.material.map.needsUpdate = true;
      }
    }
  }

  /** Highlight (or un-highlight) a pipe — scale up + emissive boost. */
  function setPipeHighlight(pipeId, on) {
    const entry = pipeMeshes.find(p => p.pipeId === pipeId);
    if (!entry) return;
    if (on) {
      entry.mesh.scale.set(1.25, 1.25, 1.25);
      if (entry.mesh.material) entry.mesh.material.emissive = new THREE.Color('#ffffff');
      entry.mesh.material.emissiveIntensity = 0.45;
    } else {
      entry.mesh.scale.set(1, 1, 1);
      if (entry.mesh.material) entry.mesh.material.emissive = new THREE.Color('#000000');
      entry.mesh.material.emissiveIntensity = 0;
    }
  }

  /** Raycast from screen coords → pipeId (or -1). */
  function pickPipeAt(clientX, clientY) {
    if (!canvasEl || !camera || !renderer) return -1;
    const rect = canvasEl.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
    const meshes = pipeMeshes.map(p => p.mesh);
    const hits = raycaster.intersectObjects(meshes, false);
    if (hits.length) return hits[0].object.userData.pipeId;
    return -1;
  }

  /** Lightweight diagnostic (used by tests/debug) — never called in gameplay. */
  function diag() {
    let meshCount = 0;
    if (currentGroup) {
      currentGroup.children.forEach(c => {
        if (c.isMesh) meshCount++;
      });
    }
    return {
      hasRenderer: !!renderer,
      hasScene: !!scene,
      hasCamera: !!camera,
      meshCount,
      animActive: !!animFrame,
      disposed
    };
  }

  return {
    isSupported,
    init,
    drawWaveform,
    drawConfidenceBar,
    enablePipeMode,
    disablePipeMode,
    drawPipeNetwork,
    setPipeStatus,
    setPipeHighlight,
    pickPipeAt,
    setSize,
    dispose,
    diag
  };
})();

window.ThreeRenderer = ThreeRenderer;
