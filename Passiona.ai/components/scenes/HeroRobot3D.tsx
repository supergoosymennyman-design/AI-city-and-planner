"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

// HeroRobot3D — the Passiona champion as a skinned GLB with animation.
// Plays the idle (breathing) loop; hovering over the figure plays a random
// fun clip (wave / silly / rumba), then crossfades back to idle.
// Rendering follows the Fit Studio pipeline: MeshToonMaterial + gradientMap,
// a per-vertex-clamped inverted-hull outline, and a UV-agnostic brand texture
// (the source GLB's atlas is scattered chaos, so any detailed texture would
// render as a mosaic — we generate a smooth texture instead, p1-18 technique).

const FUN_CLIPS = ["wave"] as const;

const OUTLINE_CLAMP_RATIO = 0.45;
const OUTLINE_THICKNESS = 0.03;

// 5-band toon gradient (Fit Studio approved setting: floor 50, evenly spaced)
function buildGradientMap() {
  const n = 5;
  const low = 50;
  const values = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    values[i] = Math.round(low + ((255 - low) * i) / (n - 1));
  }
  const tex = new THREE.DataTexture(values, values.length, 1, THREE.RedFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

// Per-vertex ceiling on outline displacement (shortest incident edge × ratio)
function computeOutlineClamp(geometry: THREE.BufferGeometry) {
  const existing = geometry.getAttribute("aOutlineClamp");
  if (existing) return existing;

  const pos = geometry.attributes.position;
  const index = geometry.index;
  const count = pos.count;
  const clamp = new Float32Array(count).fill(Infinity);
  const triCount = index ? index.count : count;
  const at = (i: number) => (index ? index.getX(i) : i);

  for (let t = 0; t + 2 < triCount; t += 3) {
    const i0 = at(t);
    const i1 = at(t + 1);
    const i2 = at(t + 2);
    for (let e = 0; e < 3; e++) {
      const a = e === 0 ? i0 : e === 1 ? i1 : i2;
      const b = e === 0 ? i1 : e === 1 ? i2 : i0;
      const dx = pos.getX(a) - pos.getX(b);
      const dy = pos.getY(a) - pos.getY(b);
      const dz = pos.getZ(a) - pos.getZ(b);
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (len > 0) {
        const lim = len * OUTLINE_CLAMP_RATIO;
        if (lim < clamp[a]) clamp[a] = lim;
        if (lim < clamp[b]) clamp[b] = lim;
      }
    }
  }
  for (let i = 0; i < count; i++) {
    if (!Number.isFinite(clamp[i])) clamp[i] = 0;
  }
  const attr = new THREE.BufferAttribute(clamp, 1);
  geometry.setAttribute("aOutlineClamp", attr);
  return attr;
}

// Inverted-hull outline sibling (Fit Studio technique): shared geometry,
// per-vertex clamped displacement along the raw normal, skinned when source is.
function makeOutlineMesh(mesh: THREE.Mesh) {
  const geometry = mesh.geometry;
  computeOutlineClamp(geometry);

  const outlineMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    side: THREE.BackSide,
  });
  outlineMat.onBeforeCompile = (shader) => {
    shader.uniforms.uOutlineThickness = { value: OUTLINE_THICKNESS };
    shader.vertexShader =
      "uniform float uOutlineThickness;\nattribute float aOutlineClamp;\n" +
      shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\n\ttransformed += normalize( normal ) * min( uOutlineThickness, aOutlineClamp );"
    );
  };

  let outlineMesh: THREE.Mesh;
  if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {
    const skinned = mesh as THREE.SkinnedMesh;
    outlineMesh = new THREE.SkinnedMesh(geometry, outlineMat);
    (outlineMesh as THREE.SkinnedMesh).bind(skinned.skeleton, skinned.bindMatrix);
  } else {
    outlineMesh = new THREE.Mesh(geometry, outlineMat);
  }
  outlineMesh.name = (mesh.name || "mesh") + "__outline";
  outlineMesh.renderOrder = (mesh.renderOrder || 0) - 1;
  outlineMesh.matrixAutoUpdate = false;
  mesh.add(outlineMesh);
  return outlineMesh;
}

export default function HeroRobot3D({ className = "" }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const host = container as HTMLDivElement;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    camera.position.set(0, 1.0, 2.3);
    camera.lookAt(0, 0.95, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    // Lights: warm key + teal rim for the toon figure
    const hemi = new THREE.HemisphereLight(0xffffff, 0x0b132b, 1.0);
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(2, 3, 4);
    const rim = new THREE.DirectionalLight(0x56cdfa, 0.7);
    rim.position.set(-3, 2, -3);
    scene.add(hemi, key, rim);

    let mixer: THREE.AnimationMixer | null = null;
    const clips: Record<string, THREE.AnimationClip> = {};
    let currentAction: THREE.AnimationAction | null = null;
    let root: THREE.Object3D | null = null;
    let rafId = 0;
    const clock = new THREE.Clock();
    let disposed = false;

    // Toon + outline, keeping the ORIGINAL texture (Fit Studio toonify style)
    function stylize() {
      if (!root) return;
      const gradientMap = buildGradientMap();

      const meshes: THREE.Mesh[] = [];
      root.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
      });
      meshes.forEach((mesh) => {
        const wasArray = Array.isArray(mesh.material);
        const sourceMats = wasArray ? (mesh.material as THREE.Material[]) : [mesh.material];
        const toonMats = sourceMats.map((src) => {
          const old = src as THREE.Material & { color?: THREE.Color; map?: THREE.Texture };
          const toon = new THREE.MeshToonMaterial({
            color: old?.color ? old.color.clone() : new THREE.Color(0xffffff),
            map: old?.map ?? null,
            gradientMap,
          });
          if (old?.transparent) {
            toon.transparent = true;
            toon.opacity = old.opacity;
          }
          (toon as unknown as { skinning: boolean }).skinning = true; // CRITICAL: mesh follows the bones
          return toon;
        });
        mesh.material = wasArray ? toonMats : toonMats[0];
      });
      meshes.forEach((m) => makeOutlineMesh(m));
    }

    // Smooth crossfade between clips — NO reset() and NO fadeIn() on the
    // already-playing action (fadeIn always starts from weight 0, which would
    // drop the character to the bind/T-pose for a frame).
    function playClip(id: string, fade = 0.4) {
      if (!mixer || !clips[id]) return;
      const next = mixer.clipAction(clips[id]);
      next.loop = THREE.LoopRepeat;
      next.setEffectiveTimeScale(1);
      if (currentAction === next) {
        // Already playing this clip — just confirm weight 1 and leave.
        next.setEffectiveWeight(1);
        return;
      }
      if (currentAction && currentAction !== next) {
        currentAction.fadeOut(fade);
      }
      next.fadeIn(fade);
      next.play();
      currentAction = next;
    }

    function resize() {
      const w = host.clientWidth || 320;
      const h = host.clientHeight || 320;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");
    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);
    loader.setMeshoptDecoder(MeshoptDecoder);

    Promise.all([
      new Promise<void>((resolve, reject) =>
        loader.load("/champion/champion-base.glb", (g) => {
          root = g.scene;
          scene.add(root);
          mixer = new THREE.AnimationMixer(root);
          resolve();
        }, undefined, reject)
      ),
      new Promise<void>((resolve) =>
        loader.load("/champion/clips/idle.glb", (g) => {
          if (g.animations?.length) clips.idle = g.animations[0];
          resolve();
        }, undefined, () => resolve())
      ),
      ...FUN_CLIPS.map(
        (id) =>
          new Promise<void>((resolve) => {
            loader.load(`/champion/clips/${id}.glb`, (g) => {
              if (g.animations?.length) clips[id] = g.animations[0];
              resolve();
            }, undefined, () => resolve());
          })
      ),
    ])
      .then(() => {
        if (disposed) return;
        stylize();
        playClip("idle");
        setStatus("ready");
      })
      .catch(() => {
        if (!disposed) setStatus("error");
      });

    // Hover: play a random fun clip and let it FINISH before returning to
    // idle (never cut mid-action). Re-hovering while one is playing extends
    // the timer instead of interrupting.
    let hoverTimer: ReturnType<typeof setTimeout> | null = null;
    let hovered = false;

    function returnToIdle() {
      hoverTimer = null;
      if (!disposed && clips.idle && hovered) playClip("idle", 0.5);
    }
    function onHover() {
      if (!clips.idle) return;
      hovered = true;
      if (hoverTimer) {
        // already playing a fun clip — extend, don't interrupt
        clearTimeout(hoverTimer);
        hoverTimer = setTimeout(returnToIdle, 2400);
        return;
      }
      const pick = FUN_CLIPS[Math.floor(Math.random() * FUN_CLIPS.length)];
      const clip = clips[pick];
      const duration = clip ? clip.duration : 2;
      playClip(pick, 0.3);
      hoverTimer = setTimeout(returnToIdle, Math.max(duration * 1000, 1800));
    }
    function onUnhover() {
      hovered = false;
      // Don't cut the current fun clip — the timer will return to idle after
      // the action completes. If nothing is playing, fade back to idle now.
      if (!hoverTimer && !disposed && clips.idle) playClip("idle", 0.5);
    }
    host.addEventListener("hero-hover", onHover);
    host.addEventListener("hero-unhover", onUnhover);

    function animate() {
      if (disposed) return;
      rafId = requestAnimationFrame(animate);
      const dt = clock.getDelta();
      if (mixer) mixer.update(dt);
      renderer.render(scene, camera);
    }
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      if (hoverTimer) clearTimeout(hoverTimer);
      ro.disconnect();
      host.removeEventListener("hero-hover", onHover);
      host.removeEventListener("hero-unhover", onUnhover);
      if (mixer) mixer.stopAllAction();
      if (root) {
        scene.remove(root);
        root.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh && mesh.geometry) mesh.geometry.dispose();
        });
      }
      renderer.dispose();
      if (renderer.domElement.parentNode === host) {
        host.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative flex items-center justify-center ${className}`}
      role="img"
      aria-label="Passiona champion, a 3D animated character"
      onPointerEnter={() => {
        containerRef.current?.dispatchEvent(new CustomEvent("hero-hover"));
      }}
      onPointerLeave={() => {
        containerRef.current?.dispatchEvent(new CustomEvent("hero-unhover"));
      }}
    >
      {status === "loading" && (
        <span
          aria-hidden="true"
          className="h-10 w-10 animate-spin rounded-full border-2 border-teal/30 border-t-teal"
        />
      )}
      {status === "error" && (
        <p className="text-sm font-bold text-body/60">3D 角色載入失敗</p>
      )}
    </div>
  );
}
