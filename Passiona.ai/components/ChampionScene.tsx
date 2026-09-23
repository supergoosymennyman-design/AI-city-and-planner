"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material) => {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
      material.dispose();
    });
  });
}

export default function ChampionScene({ ariaLabel, unavailableLabel, onReady, onFailure }: { ariaLabel: string; unavailableLabel: string; onReady: () => void; onFailure: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let frameId = 0;
    let root: THREE.Object3D | null = null;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 100);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      queueMicrotask(() => {
        setFailed(true);
        onFailure();
      });
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.setAttribute("role", "img");
    renderer.domElement.setAttribute("aria-label", ariaLabel);
    host.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xeaf7ff, 0x081424, 2));
    const key = new THREE.DirectionalLight(0xfff4df, 3);
    key.position.set(3, 5, 5);
    const rim = new THREE.DirectionalLight(0x62e6a7, 2);
    rim.position.set(-3, 4, -5);
    scene.add(key, rim);

    const resize = () => {
      const width = host.clientWidth || 320;
      const height = host.clientHeight || 280;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.load("/champion/champion-base.v4.glb", (gltf) => {
      if (disposed) return disposeObject(gltf.scene);
      root = gltf.scene;
      const bounds = new THREE.Box3().setFromObject(root);
      const center = bounds.getCenter(new THREE.Vector3());
      root.position.set(-center.x, -bounds.min.y, -center.z);
      scene.add(root);
      const sphere = new THREE.Box3().setFromObject(root).getBoundingSphere(new THREE.Sphere());
      camera.position.set(0, sphere.center.y, sphere.radius * 2.7);
      camera.lookAt(0, sphere.center.y, 0);
      renderer.render(scene, camera);
      onReady();
      const animate = () => {
        if (disposed) return;
        frameId = requestAnimationFrame(animate);
        if (root) root.rotation.y += 0.004;
        renderer.render(scene, camera);
      };
      animate();
    }, undefined, () => {
      setFailed(true);
      onFailure();
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      if (root) disposeObject(root);
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [ariaLabel, onFailure, onReady]);

  return <div ref={hostRef} className="champion-scene">{failed ? <span className="explorer-status">{unavailableLabel}</span> : null}</div>;
}
