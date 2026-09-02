// city-render.js — Three.js rendering for AI City Architect 3D.
// Flat terrain + holographic grid, river, mountains, procedural building
// meshes per system type, road strips, selection ring, weather/sky effects.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { G, TILE, tileToWorld, ok, isWater, isMtn, BLD, SYS_COLOR } from './city-logic.js';
import { getBuilding, getProp, hasBuildingModel, whenAssetsReady } from './city-assets.js';
import { attachContextLossGuard } from '/champion-city/context-guard.js';

// Mild vignette for a cinematic finish.
const VignetteShader = {
  uniforms: { tDiffuse: { value: null }, amount: { value: 0.35 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float amount; varying vec2 vUv;
    void main(){
      vec4 c=texture2D(tDiffuse,vUv);
      float d=distance(vUv,vec2(0.5));
      float vig=1.0-amount*smoothstep(0.45,0.9,d);
      gl_FragColor=vec4(c.rgb*vig,c.a);
    }`,
};

export function createCityRenderer(stage) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x16224a);
  scene.fog = new THREE.FogExp2(0x16224a, 0.0018);

  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.5, 2000);
  camera.position.set(30, 55, 45);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  attachContextLossGuard(renderer);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stage.appendChild(renderer.domElement);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.75, 0.5, 0.45);
  bloom.threshold = 0.4;
  composer.addPass(bloom);
  const vig = new ShaderPass(VignetteShader);
  composer.addPass(vig);
  const smaa = new SMAAPass(window.innerWidth * renderer.getPixelRatio(), window.innerHeight * renderer.getPixelRatio());
  composer.addPass(smaa);
  composer.addPass(new OutputPass());

  // Lights
  scene.add(new THREE.HemisphereLight(0x3a4a76, 0x1a2440, 1.25));
  const sun = new THREE.DirectionalLight(0xffd9b3, 1.6);
  sun.position.set(40, 80, 30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 220;
  sun.shadow.camera.left = -70;
  sun.shadow.camera.right = 70;
  sun.shadow.camera.top = 70;
  sun.shadow.camera.bottom = -70;
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  // A warm rim light from the opposite side so buildings get a second highlight.
  const rim = new THREE.DirectionalLight(0x88ccff, 0.5);
  rim.position.set(-40, 60, -50);
  scene.add(rim);

  // ---- Orbit controls (overview camera) ----
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.08;
  orbit.minDistance = 12;
  orbit.maxDistance = 140;
  orbit.maxPolarAngle = Math.PI / 2.05;
  orbit.target.set(0, 0, 0);
  orbit.update();

  // ---- Terrain (procedural grass texture + subtle variation) ----
  const grassTex = makeGrassTexture();
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(G * TILE + 12, G * TILE + 12),
    new THREE.MeshStandardMaterial({ map: grassTex, color: 0xffffff, roughness: 0.92, metalness: 0.03 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  ground.receiveShadow = true;
  scene.add(ground);

  // Grid overlay (holographic cyan lines)
  const gridTex = makeGridTexture();
  const gridPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(G * TILE, G * TILE),
    new THREE.MeshBasicMaterial({ map: gridTex, transparent: true, opacity: 0.5, depthWrite: false })
  );
  gridPlane.rotation.x = -Math.PI / 2;
  gridPlane.position.y = 0.02;
  scene.add(gridPlane);

  // River (blue translucent plane per river tile + a merged strip for smoothness)
  const riverGroup = new THREE.Group();
  const riverGeo = new THREE.PlaneGeometry(TILE - 0.3, TILE - 0.3);
  const riverMat = new THREE.MeshStandardMaterial({
    color: 0x1a6ea8, transparent: true, opacity: 0.9,
    emissive: 0x0a3a6e, emissiveIntensity: 0.4, roughness: 0.2, metalness: 0.3,
  });
  for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) {
    if (!isWater(r, c)) continue;
    const m = new THREE.Mesh(riverGeo, riverMat);
    const p = tileToWorld(r, c);
    m.position.set(p.x, 0.03, p.z);
    riverGroup.add(m);
  }
  scene.add(riverGroup);

  // Mountains — natural-looking cones, clustered 2-3 per tile with rock caps
  const mtnMat = new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 0.95 });
  const mtnSnow = new THREE.MeshStandardMaterial({ color: 0x9fb0c0, roughness: 0.7, emissive: 0x33465a, emissiveIntensity: 0.1 });
  const mtnGroup = new THREE.Group();
  for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) {
    if (!isMtn(r, c)) continue;
    const p = tileToWorld(r, c);
    // main peak (12-sided = natural cone, not pyramid)
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.9, 3.4, 12), mtnMat);
    cone.position.set(p.x, 1.7, p.z);
    mtnGroup.add(cone);
    // snow cap
    const snow = new THREE.Mesh(new THREE.ConeGeometry(0.7, 0.9, 10), mtnSnow);
    snow.position.set(p.x, 3.1, p.z);
    mtnGroup.add(snow);
    // secondary mini-peaks clustered around the tile
    const subMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 0.95 });
    for (let k = 0; k < 3; k++) {
      const ang = (k / 3) * Math.PI * 2 + 0.5;
      const dx = Math.cos(ang) * (0.9 + (k % 2) * 0.35);
      const dz = Math.sin(ang) * (0.9 + (k % 2) * 0.35);
      const sub = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.8, 10), subMat);
      sub.position.set(p.x + dx, 0.9, p.z + dz);
      mtnGroup.add(sub);
    }
    // rock cap on the peak
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), new THREE.MeshStandardMaterial({ color: 0x8a8070 }));
    cap.position.set(p.x, 3.35, p.z);
    mtnGroup.add(cap);
  }
  scene.add(mtnGroup);

  // ---- Building container ----
  const buildingGroup = new THREE.Group();
  scene.add(buildingGroup);
  const buildingMeshes = new Map();   // id -> THREE.Group

  // ---- Props (traffic lights / street lamps / benches) ----
  const propGroup = new THREE.Group();
  scene.add(propGroup);
  const roadTiles = new Set();        // "r,c" -> road tile present
  const buildingTiles = new Map();    // "r,c" -> type (for green-space benches)
  const placedProps = [];             // [{ mesh, key }]

  // ---- Selection ring (tile highlight) ----
  const selRing = new THREE.Mesh(
    new THREE.RingGeometry(1.6, 2.0, 32),
    new THREE.MeshBasicMaterial({ color: 0x00f2fe, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
  );
  selRing.rotation.x = -Math.PI / 2;
  selRing.position.y = 0.06;
  selRing.visible = false;
  scene.add(selRing);

  // ---- Weather / sky state ----
  const skyColors = {
    clear: 0x16224a, cloudy: 0x2a3654, rain: 0x33415c, storm: 0x141c2e,
  };
  const sunColor = { clear: 0xffd9b3, cloudy: 0xccd8e8, rain: 0x9aa8c0, storm: 0x6a7688 };
  const rainParticles = makeRain(300);
  scene.add(rainParticles);
  rainParticles.visible = false;
  const rainCloud = new THREE.Group();   // umbrella so rain moves with camera-ish
  scene.add(rainCloud);

  function makeRain(count) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 120;
      pos[i * 3 + 1] = Math.random() * 40;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 120;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0x9fc2e8, size: 0.12, transparent: true, opacity: 0.7 });
    return new THREE.Points(geo, mat);
  }

  const state = { weather: 'clear', skyBlend: 0, crisis: null };

  function setWeather(w) {
    if (state.weather === w) return;
    state.weather = w;
    rainParticles.visible = w === 'rain' || w === 'storm';
  }

  // ---- Building meshes ----
  function buildMesh(type) {
    const g = new THREE.Group();
    const def = BLD[type];
    if (!def) return g;
    const sys = def.s;
    const col = SYS_COLOR[sys] || 0xffffff;
    const dark = new THREE.MeshStandardMaterial({ color: 0x223046, roughness: 0.6, metalness: 0.4 });
    const accent = new THREE.MeshStandardMaterial({ color: col, roughness: 0.4, metalness: 0.3, emissive: col, emissiveIntensity: 0.35 });
    const std = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
    const baseY = 0;
    const h = 2.0;   // building height units

    switch (type) {
      case 'solar': {
        // flat panel array
        const panelMat = new THREE.MeshStandardMaterial({ color: 0x1a3a6e, emissive: 0x2a5ae8, emissiveIntensity: 0.5, roughness: 0.3 });
        for (let i = 0; i < 3; i++) {
          for (let j = 0; j < 2; j++) {
            const pane = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 1.4), panelMat);
            pane.position.set(-0.6 + i * 0.62, 0.28 + (j % 2) * 0.0, -0.35 + j * 0.7);
            pane.rotation.x = -0.35;
            g.add(pane);
            std(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 6), dark, pane.position.x, 0.15, pane.position.z);
          }
        }
        break;
      }
      case 'wind': {
        const pole = std(new THREE.CylinderGeometry(0.06, 0.09, 2.4, 8), dark, 0, 1.2, 0);
        pole.userData.spin = g;
        const hub = std(new THREE.SphereGeometry(0.12, 8, 6), accent, 0, 2.4, 0);
        const blades = new THREE.Group();
        const bladeMat = new THREE.MeshStandardMaterial({ color: 0xe8eef7, emissive: 0x88ccff, emissiveIntensity: 0.3 });
        for (let i = 0; i < 3; i++) {
          const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.1, 0.02), bladeMat);
          b.position.y = 0.6;
          b.rotation.z = (Math.PI * 2 / 3) * i;
          blades.add(b);
        }
        blades.position.y = 2.4;
        g.add(blades);
        g.userData.blades = blades;
        break;
      }
      case 'data': {
        const tower = std(new THREE.BoxGeometry(0.9, 1.9, 0.9), dark, 0, 0.95 + baseY, 0);
        const stripMat = new THREE.MeshStandardMaterial({ color: 0x00f2fe, emissive: 0x00f2fe, emissiveIntensity: 1.2 });
        for (let i = 0; i < 3; i++) {
          std(new THREE.BoxGeometry(0.95, 0.05, 0.05), stripMat, 0, 0.5 + i * 0.55, 0.46);
        }
        break;
      }
      case 'water': {
        // tank on stilts
        std(new THREE.CylinderGeometry(0.06, 0.08, 1.0, 6), dark, -0.3, 0.5, -0.3);
        std(new THREE.CylinderGeometry(0.06, 0.08, 1.0, 6), dark, 0.3, 0.5, -0.3);
        std(new THREE.CylinderGeometry(0.06, 0.08, 1.0, 6), dark, -0.3, 0.5, 0.3);
        std(new THREE.CylinderGeometry(0.06, 0.08, 1.0, 6), dark, 0.3, 0.5, 0.3);
        const tank = std(new THREE.CylinderGeometry(0.55, 0.55, 1.1, 16), accent, 0, 1.35, 0);
        std(new THREE.SphereGeometry(0.55, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), accent, 0, 1.9, 0);
        g.userData.pulse = tank;
        break;
      }
      case 'bus': {
        const shelter = std(new THREE.BoxGeometry(0.8, 0.5, 0.1), accent, 0, 0.7, 0.3);
        const pole = std(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 6), dark, 0, 0.55, 0.28);
        const roof = std(new THREE.BoxGeometry(0.9, 0.06, 0.7), accent, 0, 1.05, 0);
        std(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 6), dark, -0.35, 0.5, 0.1);
        std(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 6), dark, 0.35, 0.5, 0.1);
        break;
      }
      case 'depot': {
        const body = std(new THREE.BoxGeometry(1.2, 0.8, 1.6), accent, 0, 0.4, 0);
        const roof2 = std(new THREE.BoxGeometry(1.3, 0.12, 1.7), dark, 0, 0.86, 0);
        break;
      }
      case 'drone': {
        const pad = std(new THREE.CylinderGeometry(0.7, 0.8, 0.15, 12), accent, 0, 0.08, 0);
        const drone = new THREE.Group();
        const droneMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x00f2fe, emissiveIntensity: 0.5 });
        drone.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.3), droneMat));
        for (let i = 0; i < 4; i++) {
          const a = Math.PI / 4 + (Math.PI / 2) * i;
          const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 5), dark);
          arm.rotation.z = Math.PI / 2;
          arm.position.set(Math.cos(a) * 0.18, 0.1, Math.sin(a) * 0.18);
          drone.add(arm);
          const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.02, 10), new THREE.MeshBasicMaterial({ color: 0xbfe9ff, transparent: true, opacity: 0.8 }));
          rotor.position.set(Math.cos(a) * 0.32, 0.18, Math.sin(a) * 0.32);
          drone.add(rotor);
        }
        drone.position.y = 0.9;
        g.add(drone);
        g.userData.drone = drone;
        g.userData.droneBob = Math.random() * 10;
        break;
      }
      case 'road': {
        // Road is drawn as a flat strip by the renderer; this branch shouldn't be hit.
        const strip = std(new THREE.BoxGeometry(TILE - 0.4, 0.04, TILE - 0.4), new THREE.MeshStandardMaterial({ color: 0x2a3440, roughness: 0.95 }), 0, 0.02, 0);
        // dashed centre line
        const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8e8f8, transparent: true, opacity: 0.7 });
        for (let d = -1.4; d <= 1.4; d += 0.8) {
          std(new THREE.BoxGeometry(0.12, 0.02, 0.5), dashMat, d, 0.05, 0);
        }
        break;
      }
      case 'hosp': {
        const body = std(new THREE.BoxGeometry(1.1, 0.9, 1.1), std2(0xf0f4fa), 0, 0.45, 0);
        const crossMat = new THREE.MeshStandardMaterial({ color: 0xff2f4f, emissive: 0xff2f4f, emissiveIntensity: 0.6 });
        std(new THREE.BoxGeometry(0.16, 0.6, 0.05), crossMat, 0, 0.55, 0.57);
        std(new THREE.BoxGeometry(0.6, 0.16, 0.05), crossMat, 0, 0.55, 0.57);
        break;
      }
      case 'clinic': {
        const body = std(new THREE.BoxGeometry(0.9, 0.7, 0.9), std2(0xf0f4fa), 0, 0.35, 0);
        const crossMat = new THREE.MeshStandardMaterial({ color: 0xff2f4f, emissive: 0xff2f4f, emissiveIntensity: 0.6 });
        std(new THREE.BoxGeometry(0.14, 0.45, 0.04), crossMat, 0, 0.42, 0.46);
        std(new THREE.BoxGeometry(0.45, 0.14, 0.04), crossMat, 0, 0.42, 0.46);
        break;
      }
      case 'green': {
        const pad = std(new THREE.CylinderGeometry(0.85, 0.85, 0.08, 10), new THREE.MeshStandardMaterial({ color: 0x1d5a2e, emissive: 0x0c3319, emissiveIntensity: 0.4 }), 0, 0.04, 0);
        const trunk = std(new THREE.CylinderGeometry(0.1, 0.14, 1.2, 6), new THREE.MeshStandardMaterial({ color: 0x4a3620 }), 0, 0.6, 0);
        const top = std(new THREE.ConeGeometry(0.7, 1.8, 8), new THREE.MeshStandardMaterial({ color: 0x1f4d2e, emissive: 0x0c3319, emissiveIntensity: 0.5 }), 0, 1.7, 0);
        break;
      }
      case 'recycle': {
        const body = std(new THREE.BoxGeometry(0.9, 0.7, 0.7), accent, 0, 0.35, 0);
        const sym = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.4 });
        // recycle arrows: 3 triangles
        for (let i = 0; i < 3; i++) {
          const a = (Math.PI * 2 / 3) * i - Math.PI / 2;
          const tri = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.14, 3), sym);
          tri.position.set(Math.cos(a) * 0.18, 0.5, 0.36);
          tri.rotation.z = a + Math.PI / 2;
          g.add(tri);
        }
        break;
      }
      case 'collect': {
        const bin = std(new THREE.CylinderGeometry(0.3, 0.35, 0.6, 10), accent, 0, 0.3, 0);
        break;
      }
      case 'emerg': {
        const body = std(new THREE.BoxGeometry(1.0, 0.8, 1.0), std2(0x2a1a22), 0, 0.4, 0);
        const stripe = std(new THREE.BoxGeometry(1.02, 0.14, 1.02), new THREE.MeshStandardMaterial({ color: 0xff5c7a, emissive: 0xff2f4f, emissiveIntensity: 0.5 }), 0, 0.55, 0);
        // siren light
        const siren = std(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshStandardMaterial({ color: 0xff2f4f, emissive: 0xff2f4f, emissiveIntensity: 1.5 }), 0, 0.95, 0);
        g.userData.siren = siren;
        break;
      }
      case 'town': {
        const base = std(new THREE.BoxGeometry(1.3, 0.6, 1.3), std2(0xe8dcc8), 0, 0.3, 0);
        const roof = std(new THREE.ConeGeometry(1.0, 0.7, 4), accent, 0, 0.95, 0);
        roof.rotation.y = Math.PI / 4;
        std(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 6), dark, -0.45, 0.65, -0.45);
        break;
      }
      case 'auditor': {
        const body = std(new THREE.BoxGeometry(0.9, 0.8, 0.9), dark, 0, 0.4, 0);
        const eye = std(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshStandardMaterial({ color: 0x00f2fe, emissive: 0x00f2fe, emissiveIntensity: 1.2 }), 0, 0.55, 0.4);
        g.userData.eye = eye;
        break;
      }
      case 'school': {
        const body = std(new THREE.BoxGeometry(1.0, 0.8, 0.8), std2(0xf0e8d8), 0, 0.4, 0);
        const roof = std(new THREE.BoxGeometry(1.1, 0.15, 0.9), new THREE.MeshStandardMaterial({ color: 0x8a5a2e }), 0, 0.82, 0);
        break;
      }
      default: {
        // generic building
        std(new THREE.BoxGeometry(0.9, h, 0.9), accent, 0, h / 2, 0);
        break;
      }
    }
    return g;
  }

  function std2(color) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.05 });
  }

  // ---- Placement / removal ----
  function addBuildingMesh(id, type, r, c) {
    const p = tileToWorld(r, c);
    // track road tiles + building tiles for prop placement
    if (type === 'road') roadTiles.add(r + ',' + c);
    buildingTiles.set(r + ',' + c, type);
    // If an external GLB exists for this building type, use it when loaded;
    // meanwhile place the procedural mesh so the tile is never empty.
    const procedural = buildMesh(type);
    const place = (g) => {
      g.position.set(p.x, 0, p.z);
      // fake AO: soft dark disc under each building so it reads as grounded
      const shadowDisc = new THREE.Mesh(
        new THREE.CircleGeometry(1.5, 20),
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false })
      );
      shadowDisc.rotation.x = -Math.PI / 2;
      shadowDisc.position.y = 0.05;
      g.add(shadowDisc);
      g.userData.shadowDisc = shadowDisc;
      g.traverse(n => { if (n.isMesh && n !== shadowDisc) { n.castShadow = true; n.receiveShadow = true; } });
      buildingGroup.add(g);
      buildingMeshes.set(id, g);
      wireAnimations(g);
      return g;
    };
    place(procedural);
    if (hasBuildingModel(type)) {
      getBuilding(type).then(glb => {
        // only swap if this building wasn't removed meanwhile
        if (buildingMeshes.get(id) === procedural) {
          buildingGroup.remove(procedural);
          disposeTree(procedural);
          place(glb);
        }
      });
    }
    refreshProps();
    return procedural;
  }
  function removeBuildingMesh(id, r, c) {
    const g = buildingMeshes.get(id);
    if (g) {
      buildingGroup.remove(g);
      disposeTree(g);
      buildingMeshes.delete(id);
    }
    if (r !== undefined && c !== undefined) {
      roadTiles.delete(r + ',' + c);
      buildingTiles.delete(r + ',' + c);
      refreshProps();
    }
  }

  // ---- Props: traffic lights at intersections, lamps along roads, benches near parks ----
  function refreshProps() {
    // clear old props
    for (const p of placedProps) {
      propGroup.remove(p.mesh);
      disposeTree(p.mesh);
    }
    placedProps.length = 0;
    // collect road tiles for intersection detection
    const isRoad = (r, c) => roadTiles.has(r + ',' + c);
    const isBuilding = (r, c) => buildingTiles.has(r + ',' + c);
    const key = new Set();
    const addProp = (type, r, c, rotY) => {
      const k = r + ',' + c + ':' + type;
      if (key.has(k)) return;
      key.add(k);
      getProp(type).then(inst => {
        const p = tileToWorld(r, c);
        inst.position.set(p.x, 0, p.z);
        inst.rotation.y = rotY || 0;
        inst.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
        propGroup.add(inst);
        placedProps.push({ mesh: inst, key: k });
      });
    };
    // traffic lights at road junctions (tile with 2+ orthogonal road neighbours)
    for (const keyStr of roadTiles) {
      const [r, c] = keyStr.split(',').map(Number);
      let n = 0;
      if (isRoad(r - 1, c)) n++;
      if (isRoad(r + 1, c)) n++;
      if (isRoad(r, c - 1)) n++;
      if (isRoad(r, c + 1)) n++;
      if (n >= 2) addProp('trafficlight', r, c, 0);
    }
    // street lamps every 3rd road tile (skip junctions already having a light)
    let lampN = 0;
    for (const keyStr of roadTiles) {
      const [r, c] = keyStr.split(',').map(Number);
      let n = 0;
      if (isRoad(r - 1, c)) n++;
      if (isRoad(r + 1, c)) n++;
      if (isRoad(r, c - 1)) n++;
      if (isRoad(r, c + 1)) n++;
      if (n < 2 && (lampN++ % 3) === 0) addProp('streetlight', r, c, 0);
    }
    // stop signs at dead-end / simple junctions (roads with 1 neighbour)
    let signN = 0;
    for (const keyStr of roadTiles) {
      const [r, c] = keyStr.split(',').map(Number);
      let n = 0;
      if (isRoad(r - 1, c)) n++;
      if (isRoad(r + 1, c)) n++;
      if (isRoad(r, c - 1)) n++;
      if (isRoad(r, c + 1)) n++;
      if (n === 1 && (signN++ % 2) === 0) addProp('stopsign', r, c, 0);
    }
    // benches beside green space tiles (on an adjacent empty/road-adjacent tile)
    for (const [keyStr, type] of buildingTiles) {
      if (type !== 'green') continue;
      const [r, c] = keyStr.split(',').map(Number);
      const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (const [dr, dc] of dirs) {
        const rr = r + dr, cc = c + dc;
        if (ok(rr, cc) && !isWater(rr, cc) && !isMtn(rr, cc) && !isBuilding(rr, cc)) {
          const rotY = Math.atan2(dr, dc);
          addProp('bench', rr, cc, rotY);
          break;
        }
      }
      // a tree or two inside / beside the green space — varied species so the
      // parks don't repeat: pine, broadleaf, Kenney low tree, Kenney tall tree
      const roll = (r * 7 + c) % 5;
      const treeType = roll === 0 ? 'treePine' : roll === 1 ? 'treeK' : roll === 2 ? 'treeHigh' : 'tree';
      addProp(treeType, r, c, 0);
    }
    // hydrants beside emergency stations + clinics; trash cans beside collection pts
    for (const [keyStr, type] of buildingTiles) {
      const [r, c] = keyStr.split(',').map(Number);
      const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      let placed = false;
      for (const [dr, dc] of dirs) {
        if (placed) break;
        const rr = r + dr, cc = c + dc;
        if (!ok(rr, cc) || isWater(rr, cc) || isMtn(rr, cc) || isBuilding(rr, cc)) continue;
        if (type === 'emerg' || type === 'clinic') { addProp('hydrant', rr, cc, Math.atan2(dr, dc)); placed = true; }
        else if (type === 'collect' || type === 'recycle') { addProp('trashcan', rr, cc, Math.atan2(dr, dc)); placed = true; }
      }
    }
    // landing pad prop on top of drone pads; bus stop prop beside bus stops
    for (const [keyStr, type] of buildingTiles) {
      const [r, c] = keyStr.split(',').map(Number);
      if (type === 'drone') addProp('landingpad', r, c, 0);
      if (type === 'bus') {
        const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        for (const [dr, dc] of dirs) {
          const rr = r + dr, cc = c + dc;
          if (ok(rr, cc) && !isWater(rr, cc) && !isMtn(rr, cc) && !isBuilding(rr, cc)) {
            addProp('busstop', rr, cc, Math.atan2(dr, dc));
            break;
          }
        }
      }
    }
  }

  // Dispose geometry + materials recursively (safe for GLB clones too).
  function disposeTree(root) {
    root.traverse(n => {
      if (n.isMesh) {
        if (n.geometry) n.geometry.dispose();
        if (n.material) {
          if (Array.isArray(n.material)) n.material.forEach(m => m.dispose());
          else n.material.dispose();
        }
      }
    });
  }

  // Wire the animation hooks the render loop looks for (blades / siren / eye /
  // pulse) by node name. Works for both procedural and GLB-built meshes.
  function wireAnimations(g) {
    const byName = {};
    g.traverse(n => { if (n.name) byName[n.name] = n; });
    if (byName.blades) g.userData.blades = byName.blades;
    if (byName.siren) g.userData.siren = byName.siren;
    if (byName.eye) g.userData.eye = byName.eye;
    if (byName.pulse) g.userData.pulse = byName.pulse;
  }

  // ---- Selection ----
  function showSelection(r, c) {
    const p = tileToWorld(r, c);
    selRing.position.set(p.x, 0.06, p.z);
    selRing.visible = true;
  }
  function hideSelection() { selRing.visible = false; }

  // ---- Weather animation (called each frame) ----
  function updateWeather(dt) {
    const t = performance.now() * 0.001;
    // blend sky colour
    const target = skyColors[state.weather] || skyColors.clear;
    const cur = scene.background.getHex();
    if (cur !== target) {
      const c = new THREE.Color(target);
      scene.background.lerp(c, Math.min(1, dt * 1.5));
    }
    // sun colour blend
    const sunT = sunColor[state.weather] || sunColor.clear;
    sun.color.lerp(new THREE.Color(sunT), Math.min(1, dt * 1.5));

    // rain fall
    if (rainParticles.visible) {
      const pos = rainParticles.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) - dt * (state.weather === 'storm' ? 30 : 18);
        if (y < 0) { y = 40; pos.setX(i, (Math.random() - 0.5) * 120); pos.setZ(i, (Math.random() - 0.5) * 120); }
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
    }
    // lightning in storm
    if (state.weather === 'storm' && Math.random() < dt * 0.4) {
      // brief flash — handled by main loop intensity
      scene.fog.color.setHex(0x99bbee);
      setTimeout(() => { if (state.weather === 'storm') scene.fog.color.setHex(0x141c2e); }, 80);
    }
  }

  function render() {
    // animate wind turbines + drone rotors
    const t = performance.now() * 0.001;
    buildingMeshes.forEach(g => {
      if (g.userData.blades) g.userData.blades.rotation.y = t * 3;
      if (g.userData.drone) {
        g.userData.drone.position.y = 0.9 + 0.15 * Math.sin(t * 2 + g.userData.droneBob);
        g.userData.drone.rotation.y = t * 4;
      }
      if (g.userData.siren) {
        g.userData.siren.material.emissiveIntensity = 0.8 + 0.7 * Math.abs(Math.sin(t * 3));
      }
      if (g.userData.eye) {
        g.userData.eye.material.emissiveIntensity = 0.8 + 0.6 * Math.sin(t * 2.5);
      }
      if (g.userData.pulse) {
        // water tower tank gently glows — water pressure at work
        g.userData.pulse.material.emissiveIntensity = 0.25 + 0.2 * Math.sin(t * 1.6);
      }
    });
    // animate river: gentle emissive pulse so the water feels alive
    riverGroup.children.forEach(m => {
      m.material.emissiveIntensity = 0.3 + 0.2 * Math.sin(t * 1.2);
    });
    composer.render();
  }

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', resize);

  return {
    scene, camera, renderer, composer, orbit,
    addBuildingMesh, removeBuildingMesh, buildingMeshes,
    showSelection, hideSelection,
    setWeather, updateWeather, render, resize,
    gridPlane, selRing,
  };
}

function makeGridTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(0,242,254,0.55)';
  ctx.lineWidth = 2;
  const step = size / 20;
  for (let i = 0; i <= 20; i++) {
    ctx.beginPath();
    ctx.moveTo(i * step, 0);
    ctx.lineTo(i * step, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * step);
    ctx.lineTo(size, i * step);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Procedural grass texture: mottled greens with subtle noise, tileable.
function makeGrassTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#2a5a32';
  ctx.fillRect(0, 0, size, size);
  // fine mottle
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 36;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n * 0.7));
  }
  ctx.putImageData(img, 0, 0);
  // a few darker clumps
  for (let k = 0; k < 26; k++) {
    const x = Math.random() * size, y = Math.random() * size;
    const r = 6 + Math.random() * 14;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(20,60,28,0.5)');
    g.addColorStop(1, 'rgba(20,60,28,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
