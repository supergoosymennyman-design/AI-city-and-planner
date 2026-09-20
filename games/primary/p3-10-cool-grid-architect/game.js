/**
 * game.js — Cool Grid Architect 3D (Three.js)
 * WaterCity power grid builder. Place AI infrastructure on a 3D terrain
 * to satisfy competing meter requirements. Same Eco-Score logic as before,
 * now rendered with Three.js + GLB building models.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Water } from 'three/addons/objects/Water.js';

const Game = (() => {
  'use strict';

  const States = { LOADING: 0, MENU: 1, PLAYING: 2, RESULT: 3, CERTIFICATE: 4 };
  let state = States.LOADING;
  let currentLevel = 1;
  let levelState = {};          // { placed: [], tokens, spent, feedback, done }
  let selectedItem = null;      // item type currently selected in palette
  let zoomLevel = 1.0;

  // --- DOM ---
  const $ = id => document.getElementById(id);
  const dom = {};
  let renderer, scene, camera, controls, raycaster, pointer;
  let gridGroup = null;          // parent for terrain cells
  let buildingGroup = null;      // parent for placed building GLBs
  let placedMeshes = [];         // [{ type, row, col, group }]
  let cellMeshes = [];           // [{ row, col, mesh, terrain }]
  let waterObj = null;
  let models = {};               // loaded GLB scenes keyed by item type
  let clock = new THREE.Clock();
  let animQueue = [];            // pending animations

  // --- Level data (from levels-data.js) ---
  const LEVELS = window.LEVELS;
  const TERRAIN = window.TERRAIN;
  const ITEMS = window.ITEMS;
  const calcDistance = window.calcDistance;
  const getPower = window.getPower;
  const getEffectiveCooling = window.getEffectiveCooling;
  const computeEcoScore = window.computeEcoScore;

  // Terrain -> texture mapping
  const TERRAIN_TEX = {
    MOUNTAIN: 'assets/textures/aerial_rocks_02_Diffuse.jpg',
    DESERT: 'assets/textures/aerial_sand_Diffuse.jpg',
    FOREST: 'assets/textures/aerial_grass_rock_Diffuse.jpg',
    PLAINS: 'assets/textures/aerial_grass_rock_Diffuse.jpg',
    CITY: 'assets/textures/concrete_floor_worn_001_Diffuse.jpg',
    RIVER: null, // water handled separately
  };

  // Model file per item
  const MODEL_FILE = {
    DATA_CENTER: 'assets/models/data_center.glb',
    SOLAR_PANEL: 'assets/models/solar_panel.glb',
    WIND_TURBINE: 'assets/models/wind_turbine.glb',
    BATTERY: 'assets/models/battery.glb',
    COOLING_TOWER: 'assets/models/cooling_tower.glb',
  };

  // Terrain elevation offsets (for 3D relief)
  const TERRAIN_ELEV = {
    MOUNTAIN: 0.30, RIVER: -0.12, DESERT: 0.0, CITY: 0.05, FOREST: 0.0, PLAINS: 0.0
  };

  // =============== INIT ===============
  function init() {
    // DOM refs
    ['loading-screen','menu','game-area','level-tabs','level-banner','banner-icon',
     'banner-title','banner-sub','item-drawer','item-slots','budget-row','budget-value',
     'drawer-hint','canvas-wrap','game-canvas','feedback','quizHost','score-panel',
     'meter-list','btn-simulate','eco-box','eco-value','result','result-icon',
     'result-title','result-msg','btn-retry','btn-next','certificate','cert-card',
     'btnReplay','btn-zoom-in','btn-zoom-out','zoom-label'
    ].forEach(id => dom[id] = $(id));
    dom.gameArea = dom['game-area']; // camelCase alias for dot access

    // Buttons
    $('btnStart').addEventListener('click', () => {
      dom.menu.hidden = true;
      window.ComicIntro.play(window.COMIC_PANELS, () => switchToLevel(1));
    });
    dom['btn-retry'].addEventListener('click', () => switchToLevel(currentLevel));
    dom['btn-next'].addEventListener('click', () => {
      if (currentLevel < 5) switchToLevel(currentLevel + 1);
      else showCertificate();
    });
    dom.btnReplay.addEventListener('click', () => { dom.certificate.hidden = true; switchToLevel(1); });
    dom['btn-zoom-in'].addEventListener('click', () => setZoom(zoomLevel + 0.15));
    dom['btn-zoom-out'].addEventListener('click', () => setZoom(zoomLevel - 0.15));
    dom['btn-simulate'].addEventListener('click', simulateGrid);
    dom['item-slots'].addEventListener('click', (e) => {
      const slot = e.target.closest('.item-slot');
      if (!slot) return;
      selectItem(slot.dataset.type);
    });

    // Three.js setup
    setupThree();
    buildLevelTabs();

    // Load models, then show menu
    loadAllModels().then(() => {
      dom['loading-screen'].hidden = true;
      dom.menu.hidden = false;
    }).catch(err => {
      console.error('Failed to load models:', err);
      dom['loading-screen'].hidden = true;
      dom.menu.hidden = false;
    });

    // Resize
    window.addEventListener('resize', onResize);
    // Initial resize after layout
    requestAnimationFrame(() => onResize());

    // Animation loop
    renderer.setAnimationLoop(animate);
  }

  function setupThree() {
    const wrap = dom['canvas-wrap'];
    renderer = new THREE.WebGLRenderer({ canvas: dom['game-canvas'], antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(wrap.clientWidth, wrap.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);

    camera = new THREE.PerspectiveCamera(45, wrap.clientWidth / wrap.clientHeight, 0.1, 100);
    camera.position.set(6, 7, 9);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minPolarAngle = 0.6;
    controls.maxPolarAngle = 1.35;
    controls.minDistance = 4;
    controls.maxDistance = 18;
    controls.enablePan = true;

    // Lights
    const hemi = new THREE.HemisphereLight(0xffffff, 0x334455, 0.9);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 1.6);
    dir.position.set(5, 8, 4);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    scene.add(dir);
    const fill = new THREE.DirectionalLight(0x88ccff, 0.5);
    fill.position.set(-4, 3, -3);
    scene.add(fill);

    raycaster = new THREE.Raycaster();
    pointer = new THREE.Vector2();
    dom['game-canvas'].addEventListener('click', onCanvasClick);
    dom['game-canvas'].addEventListener('pointermove', onCanvasHover);

    gridGroup = new THREE.Group();
    scene.add(gridGroup);
    buildingGroup = new THREE.Group();
    scene.add(buildingGroup);
  }

  function loadAllModels() {
    const loader = new GLTFLoader();
    const types = Object.keys(MODEL_FILE);
    return Promise.all(types.map(t => new Promise((resolve) => {
      loader.load(MODEL_FILE[t], (gltf) => {
        models[t] = gltf.scene;
        // Normalize: center and scale to fit ~0.8 units
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 0.9 / maxDim;
        gltf.scene.scale.setScalar(scale);
        // Center horizontally
        const center = box.getCenter(new THREE.Vector3());
        gltf.scene.position.x -= center.x * scale;
        gltf.scene.position.z -= center.z * scale;
        // Rotate to face camera direction (some models import sideways)
        gltf.scene.rotation.y = Math.PI / 4;
        resolve();
      }, undefined, (err) => { console.warn('Model load failed:', MODEL_FILE[t], err); resolve(); });
    })));
  }

  // =============== LEVEL ===============
  function getMeta() { return LEVELS[currentLevel - 1]; }

  function switchToLevel(level) {
    currentLevel = level;
    dom.menu.hidden = true;
    dom.gameArea.hidden = false;
    dom.result.hidden = true;
    dom.certificate.hidden = true;

    if (level === 6) {
      // Quiz
      dom['canvas-wrap'].hidden = true;
      dom['score-panel'].hidden = true;
      dom['item-drawer'].hidden = true;
      dom.quizHost.hidden = false;
      window.Quiz.mount(dom.quizHost, onQuizComplete);
      return;
    }

    // Reset for gameplay
    state = States.PLAYING;
    dom['canvas-wrap'].hidden = false;
    dom['score-panel'].hidden = false;
    dom['item-drawer'].hidden = false;
    dom.quizHost.hidden = true;
    dom.feedback.hidden = true;
    onResize(); // canvas was 0-size while hidden

    const meta = getMeta();
    resetLevelState(meta);
    renderLevel(meta);
    renderPalette(meta);
    updateBanner(meta);
    // Highlight active level tab
    [...dom['level-tabs'].children].forEach(t => t.classList.toggle('active', parseInt(t.dataset.level) === level));
    window.Spark.setState(level <= 2 ? 'learning' : level <= 4 ? 'confident' : 'expert');
    const sparkLines = {
      1: "Ooh, a Data Center! I get really hot — can you find me a cool mountain or river spot?",
      2: "Now I need POWER! Look for a sunny desert tile close to me.",
      3: "Balancing is hard — cool tiles are far from the city. Try both and watch the meters!",
      4: "Everything at once: cooling, power, and distance. I believe in you!",
      5: "Budget is tight, but the right plan fits. Let's build the perfect grid together!"
    };
    window.Spark.say(sparkLines[level] || 'Let\'s design the best grid yet!');
  }

  function resetLevelState(meta) {
    levelState = { placed: [], score: 0, tokens: meta.budget || 99, spent: 0, feedback: '', done: false };
    selectedItem = null;
    // Include preset items in the placed list
    (meta.presetItems || []).forEach(p => {
      levelState.placed.push({ ...p, preset: true });
    });
  }

  function renderLevel(meta) {
    clearGrid();
    buildTerrain(meta);
    // Place preset items
    (meta.presetItems || []).forEach(p => placeBuilding(p.type, p.row, p.col, true));
    // Focus camera on grid center
    const gs = meta.gridSize;
    camera.position.set(gs * 0.9, gs * 1.1, gs * 1.2);
    controls.target.set((gs - 1) / 2, 0, (gs - 1) / 2);
    controls.update();
    updateMeters();
  }

  // =============== TERRAIN ===============
  function clearGrid() {
    while (gridGroup.children.length) gridGroup.remove(gridGroup.children[0]);
    while (buildingGroup.children.length) buildingGroup.remove(buildingGroup.children[0]);
    placedMeshes = [];
    cellMeshes = [];
    if (waterObj) { scene.remove(waterObj); waterObj = null; }
  }

  function buildTerrain(meta) {
    const gs = meta.gridSize;
    const grid = meta.terrainGrid;
    const elev = TERRAIN_ELEV;
    const texLoader = new THREE.TextureLoader();
    const textures = {};
    Object.keys(TERRAIN_TEX).forEach(k => {
      if (TERRAIN_TEX[k]) {
        const t = texLoader.load(TERRAIN_TEX[k]);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(1, 1);
        textures[k] = t;
      }
    });

    for (let r = 0; r < gs; r++) {
      for (let c = 0; c < gs; c++) {
        const type = grid[r][c];
        const h = elev[type] || 0;
        // Ground tile (slightly larger than cell to hide seams)
        const geo = new THREE.BoxGeometry(1.02, 0.15, 1.02);
        const mat = new THREE.MeshStandardMaterial({
          map: textures[type] || undefined,
          color: type === 'RIVER' ? 0x2E86C1 : 0xffffff,
          roughness: type === 'RIVER' ? 0.3 : 0.85,
          metalness: type === 'RIVER' ? 0.2 : 0.05,
        });
        const mesh = new THREE.Mesh(geo, mat);
        const x = c + 0.5 - gs / 2;
        const z = r + 0.5 - gs / 2;
        mesh.position.set(x, h / 2, z);
        mesh.receiveShadow = true;
        gridGroup.add(mesh);
        cellMeshes.push({ row: r, col: c, mesh, terrain: type });

        // Terrain features
        if (type === 'MOUNTAIN') {
          // Add a rock peak on mountain cells
          const peak = new THREE.Mesh(
            new THREE.ConeGeometry(0.35, 0.4, 5),
            new THREE.MeshStandardMaterial({ color: 0x8B8682, roughness: 0.9 })
          );
          peak.position.set(x, h + 0.15, z);
          peak.rotation.y = (r * 3 + c) * 0.7;
          peak.castShadow = true;
          gridGroup.add(peak);
        } else if (type === 'FOREST') {
          // Add a tree (instanced from GLB if loaded, else cone+cylinder)
          const tree = makeTree();
          if (tree) {
            tree.position.set(x, 0.05, z);
            tree.scale.setScalar(0.9);
            gridGroup.add(tree);
          }
        } else if (type === 'CITY') {
          // Add city buildings cluster
          const bld = makeCityBuilding(c, r);
          if (bld) {
            bld.position.set(x, 0.03, z);
            gridGroup.add(bld);
          }
        }
      }
    }

    // River water plane (if any river cells)
    if (grid.flat().includes('RIVER')) {
      buildRiver(meta);
    }
  }

  function makeTree() {
    if (models.tree) {
      const t = models.tree.clone();
      return t;
    }
    // Fallback procedural tree
    const group = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.2, 6), new THREE.MeshStandardMaterial({ color: 0x6B4226 }));
    trunk.position.y = 0.1;
    const leaves = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.28, 6), new THREE.MeshStandardMaterial({ color: 0x2E7D32 }));
    leaves.position.y = 0.32;
    group.add(trunk, leaves);
    return group;
  }

  function makeCityBuilding(c, r) {
    // Simple city building cluster: varies height by position
    const h = 0.28 + ((c * 7 + r * 13) % 5) * 0.06;
    const b = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, h, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x6C7A89, roughness: 0.8 })
    );
    b.position.y = h / 2 + 0.02;
    b.castShadow = true;
    return b;
  }

  function buildRiver(meta) {
    const grid = meta.terrainGrid;
    const gs = meta.gridSize;
    // Find river cell bounds
    const riverCells = [];
    grid.forEach((row, r) => row.forEach((t, c) => { if (t === 'RIVER') riverCells.push([r, c]); }));
    if (!riverCells.length) return;
    const rows = riverCells.map(([r]) => r);
    const cols = riverCells.map(([, c]) => c);
    const minR = Math.min(...rows), maxR = Math.max(...rows);
    const minC = Math.min(...cols), maxC = Math.max(...cols);
    const width = (maxC - minC + 1);
    const depth = (maxR - minR + 1);
    const cx = (minC + maxC) / 2 + 0.5 - gs / 2;
    const cz = (minR + maxR) / 2 + 0.5 - gs / 2;

    // THREE.Water (reflects the sky/environment)
    const waterGeo = new THREE.PlaneGeometry(width * 0.9, depth * 0.9);
    const water = new Water(waterGeo, {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals: new THREE.TextureLoader().load('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/textures/waternormals.jpg', t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; }),
      sunDirection: new THREE.Vector3(0.5, 1, 0.3),
      sunColor: 0xffffff,
      waterColor: 0x1a6b8a,
      distortionScale: 2.5,
      fog: false,
    });
    water.rotation.x = -Math.PI / 2;
    water.position.set(cx, TERRAIN_ELEV.RIVER + 0.02, cz);
    scene.add(water);
    waterObj = water;
  }

  // =============== BUILDINGS ===============
  function placeBuilding(type, row, col, preset) {
    const meta = getMeta();
    const gs = meta.gridSize;
    const x = col + 0.5 - gs / 2;
    const z = row + 0.5 - gs / 2;
    const elev = TERRAIN_ELEV[meta.terrainGrid[row][col]] || 0;

    let group;
    if (models[type]) {
      group = models[type].clone();
      group.rotation.y = Math.PI / 4;
    } else {
      group = makeFallbackBuilding(type);
    }
    group.position.set(x, elev + 0.09, z);
    group.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
    buildingGroup.add(group);
    placedMeshes.push({ type, row, col, group, preset: !!preset });
  }

  function makeFallbackBuilding(type) {
    const g = new THREE.Group();
    if (type === 'DATA_CENTER') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.3, 0.55), new THREE.MeshStandardMaterial({ color: 0x4A90D9, roughness: 0.5 }));
      body.position.y = 0.15;
      g.add(body);
    } else if (type === 'BATTERY') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.4), new THREE.MeshStandardMaterial({ color: 0x22C55E, roughness: 0.5 }));
      body.position.y = 0.15;
      g.add(body);
    } else if (type === 'COOLING_TOWER') {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.45, 12), new THREE.MeshStandardMaterial({ color: 0xA5C8E0, roughness: 0.8 }));
      body.position.y = 0.22;
      g.add(body);
    }
    return g;
  }

  function removeBuilding(row, col) {
    const idx = placedMeshes.findIndex(p => p.row === row && p.col === col && !p.preset);
    if (idx === -1) return null;
    const item = placedMeshes[idx];
    buildingGroup.remove(item.group);
    placedMeshes.splice(idx, 1);
    return item;
  }

  // =============== PLACEMENT / CLICK ===============
  function onCanvasClick(e) {
    if (state !== States.PLAYING || !selectedItem) return;
    const cell = pickCell(e);
    if (!cell) return;
    const { row, col, terrain } = cell;
    const meta = getMeta();
    const existing = placedMeshes.find(p => p.row === row && p.col === col);

    if (existing) {
      if (!existing.preset) {
        const item = removeBuilding(row, col);
        if (item) {
          levelState.placed = levelState.placed.filter(p => !(p.row === row && p.col === col && !p.preset));
          levelState.spent = Math.max(0, levelState.spent - (ITEMS[item.type]?.cost || 0));
          window.AudioFX.wrong();
          setFeedback(`Removed ${ITEMS[item.type].name}.`, 'feedback-wrong');
        }
      } else {
        setFeedback('That tile is reserved!', 'feedback-wrong');
      }
      updateMeters();
      return;
    }

    // Check budget
    if (meta.budget && levelState.spent + (ITEMS[selectedItem]?.cost || 0) > meta.budget) {
      setFeedback('Not enough tokens!', 'feedback-wrong');
      window.AudioFX.error();
      return;
    }

    placeBuilding(selectedItem, row, col, false);
    levelState.placed.push({ type: selectedItem, row, col });
    levelState.spent += (ITEMS[selectedItem]?.cost || 0);
    window.AudioFX.place();
    setFeedback(`${ITEMS[selectedItem].name} placed!`, 'feedback-correct');
    updateMeters();
    checkWin(meta);
  }

  function pickCell(e) {
    const rect = dom['game-canvas'].getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const groundMeshes = cellMeshes.map(cm => cm.mesh);
    const hits = raycaster.intersectObjects(groundMeshes, false);
    if (hits.length) {
      const m = hits[0].object;
      const cm = cellMeshes.find(cm => cm.mesh === m);
      return cm;
    }
    return null;
  }

  function onCanvasHover(e) {
    if (state !== States.PLAYING) return;
    const cell = pickCell(e);
    if (cell) {
      dom['canvas-wrap'].style.cursor = selectedItem ? 'pointer' : 'default';
    }
  }

  // =============== PALETTE ===============
  function buildLevelTabs() {
    dom['level-tabs'].innerHTML = '';
    for (let l = 1; l <= 6; l++) {
      const btn = document.createElement('button');
      btn.className = 'level-tab';
      btn.dataset.level = l;
      btn.textContent = l === 6 ? '📝' : 'L' + l;
      btn.setAttribute('aria-label', 'Level ' + l);
      btn.addEventListener('click', () => switchToLevel(l));
      dom['level-tabs'].appendChild(btn);
    }
  }

  function renderPalette(meta) {
    dom['item-slots'].innerHTML = '';
    meta.items.forEach(type => {
      const it = ITEMS[type];
      const slot = document.createElement('button');
      slot.className = 'item-slot';
      slot.dataset.type = type;
      slot.innerHTML = `${Icons[type]()}<span class="item-name">${it.name}</span><span class="item-cost">${it.cost}🪙</span>`;
      dom['item-slots'].appendChild(slot);
    });
    // Budget
    if (meta.budget) {
      dom['budget-row'].hidden = false;
      dom['budget-value'].textContent = meta.budget;
    } else {
      dom['budget-row'].hidden = true;
    }
  }

  function selectItem(type) {
    selectedItem = (selectedItem === type) ? null : type;
    [...dom['item-slots'].children].forEach(s => s.classList.toggle('item-selected', s.dataset.type === selectedItem));
    if (selectedItem) {
      setFeedback(`Selected: ${ITEMS[selectedItem].name}. Tap a terrain tile to place it.`, '');
    }
  }

  // =============== METERS ===============
  function updateMeters() {
    const meta = getMeta();
    if (!meta) return;
    const items = levelState.placed;

    // Compute individual values
    const values = {};
    const terrainGrid = meta.terrainGrid;
    let cooling = 0, power = 0, dist = 0;
    items.forEach(p => {
      const terr = terrainGrid[p.row]?.[p.col];
      cooling += getEffectiveCooling(p.type, terr);
      power += getPower(p.type, terr);
      if (meta.cityCells?.length) dist += calcDistance(p.row, p.col, meta.cityCells);
    });
    values.cooling = cooling;
    values.power = power;
    values.distance = dist;
    values.eco = computeEcoScore(items, terrainGrid, meta.cityCells);

    // Render meters
    dom['meter-list'].innerHTML = '';
    meta.meters.forEach(m => {
      const val = values[m.id] || 0;
      const pass = val >= m.pass;
      const pct = Math.min(100, (val / m.max) * 100);
      const row = document.createElement('div');
      row.className = 'meter-row';
      row.innerHTML = `
        <div class="meter-label">${m.label} <span class="meter-val ${pass ? 'ok' : ''}">${val}${m.invert ? ' ≤ ' + m.pass : ''}</span></div>
        <div class="meter-bar"><div class="meter-fill ${pass ? 'fill-ok' : ''}" style="width:${pct}%"></div></div>
      `;
      dom['meter-list'].appendChild(row);
    });

    // Eco box
    dom['eco-value'].textContent = values.eco;
    dom['eco-box'].classList.toggle('eco-ok', values.eco >= (meta.meters.find(m => m.id === 'eco')?.pass || 0));
  }

  function checkWin(meta) {
    const items = levelState.placed;
    const terrainGrid = meta.terrainGrid;
    const values = {};
    let cooling = 0, power = 0, dist = 0;
    items.forEach(p => {
      const terr = terrainGrid[p.row]?.[p.col];
      cooling += getEffectiveCooling(p.type, terr);
      power += getPower(p.type, terr);
      if (meta.cityCells?.length) dist += calcDistance(p.row, p.col, meta.cityCells);
    });
    values.cooling = cooling; values.power = power; values.distance = dist;
    values.eco = computeEcoScore(items, terrainGrid, meta.cityCells);

    let allPass = meta.meters.every(m => {
      if (m.invert) return values[m.id] <= m.pass;
      return (values[m.id] || 0) >= m.pass;
    });
    // Level 4 requires all items placed
    if (meta.winCondition === 'allPlaced') {
      allPass = allPass && meta.items.every(t => items.some(p => p.type === t));
    }
    if (allPass && !levelState.done) {
      levelState.done = true;
      window.AudioFX.win();
      window.Spark.say(winMessage(meta));
      setTimeout(() => showResult(true, meta), 1200);
    }
  }

  function winMessage(meta) {
    const msgs = {
      1: 'You found the sweet spot! Cool AND close. That\'s Edge Computing!',
      2: 'Different terrain, different power — you balanced the sources!',
      3: 'The trade-off is real, but you nailed the placement!',
      4: 'DC, Solar, Wind — a complete system that works!',
      5: 'Perfect grid under budget! Real AI engineers would be proud!'
    };
    return msgs[meta.id] || 'Great grid design!';
  }

  // =============== RESULT ===============
  function showResult(passed, meta) {
    state = States.RESULT;
    dom.result.hidden = false;
    dom['result-icon'].textContent = passed ? '✅' : '❌';
    dom['result-title'].textContent = passed ? 'Grid complete!' : 'Not quite yet';
    dom['result-msg'].textContent = passed ? meta.endRecap : 'Keep adjusting your placements to meet all the requirements.';
    dom['btn-retry'].style.display = passed ? 'none' : 'inline-block';
    dom['btn-next'].style.display = 'inline-block';
    dom['btn-next'].textContent = currentLevel < 5 ? 'Next Level →' : '🏙️ Department Clearance';
  }

  function onQuizComplete(passed, score) {
    if (passed) showCertificate();
    else switchToLevel(5);
  }

  function showCertificate() {
    state = States.CERTIFICATE;
    dom.result.hidden = true;
    dom.certificate.hidden = false;
    window.Quiz.renderCertificate(dom['cert-card']);
  }

  // =============== SIMULATE ===============
  function simulateGrid() {
    if (state !== States.PLAYING) return;
    const meta = getMeta();
    // Simple pulse animation: briefly highlight placed buildings
    placedMeshes.forEach((p, i) => {
      const g = p.group;
      const origY = g.position.y;
      g.position.y = origY + 0.15;
      setTimeout(() => g.position.y = origY, 300 + i * 120);
    });
    window.AudioFX.correctTap();
    setFeedback('Power flowing! Look at your grid work together. ⚡', 'feedback-correct');
  }

  // =============== MISC ===============
  function setFeedback(msg, cls) {
    dom.feedback.hidden = false;
    dom.feedback.textContent = msg;
    dom.feedback.className = 'feedback ' + (cls || '');
  }

  function updateBanner(meta) {
    dom['banner-icon'].textContent = meta.icon;
    dom['banner-title'].textContent = `LEVEL ${meta.id}: ${meta.aiConcept.toUpperCase()}`;
    dom['banner-sub'].textContent = meta.aiConceptShort;
  }

  function setZoom(v) {
    zoomLevel = Math.max(0.6, Math.min(1.8, v));
    dom['zoom-label'].textContent = Math.round(zoomLevel * 100) + '%';
    // Scale grid group
    if (gridGroup && buildingGroup) {
      gridGroup.scale.setScalar(zoomLevel);
      buildingGroup.scale.setScalar(zoomLevel);
    }
  }

  function onResize() {
    const wrap = dom['canvas-wrap'];
    if (!wrap || !renderer) return;
    const w = wrap.clientWidth, h = wrap.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function animate() {
    const dt = clock.getDelta();
    controls.update();
    if (waterObj && waterObj.material.uniforms) {
      waterObj.material.uniforms['time'].value += dt * 0.4;
    }
    renderer.render(scene, camera);
  }

  // =============== EXPORT ===============
  return {
    init, switchToLevel
  };
})();

Game.init();
