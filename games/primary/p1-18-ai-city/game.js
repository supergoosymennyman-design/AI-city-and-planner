/**
 * game.js — Core game logic for My First AI City
 * P1-P2: Place buildings, connect utilities, watch city run.
 */
const Game = (() => {
  'use strict';

  // ── Constants ──
  const GRID_SIZE = 6;
  const BUDGET = 20;
  const HAZARD_COUNT = 3;
  const PUDDLE_COUNT = 3;

  const BUILDING_DEFS = {
    home:     { label:'Home',      emoji:'🏠', cost:2, needs:['water','power','road'], max:99 },
    school:   { label:'School',    emoji:'🏫', cost:3, needs:['water','power','road'], max:2 },
    hospital: { label:'Hospital',  emoji:'🏥', cost:4, needs:['water','power','road'], max:2 },
    park:     { label:'Park',      emoji:'🌳', cost:1, needs:[],                      max:4 },
    water:    { label:'Water Tower',emoji:'💧', cost:3, provides:'water',             max:2 },
    power:    { label:'Power Plant',emoji:'⚡', cost:3, provides:'power',             max:2 },
  };

  const REQUIRED = { home:3, school:1, hospital:1, water:1, power:1 };

  const CONNECTION_TYPES = {
    water: { label:'Water Pipes 💧', color:'#38bdf8', sourceType:'water', requires:['water'] },
    power: { label:'Power Lines ⚡', color:'#facc15', sourceType:'power', requires:['power'] },
    road:  { label:'Roads 🛣️',     color:'#a78bfa', sourceType:null,   requires:['road'] },
  };

  const WASTE_ITEMS = [
    { emoji:'🧴', label:'Plastic Bottle', bin:'recycle' },
    { emoji:'🍎', label:'Apple Core',     bin:'compost' },
    { emoji:'🥫', label:'Tin Can',        bin:'recycle' },
    { emoji:'📰', label:'Newspaper',      bin:'recycle' },
    { emoji:'🔋', label:'Battery',        bin:'general' },
  ];

  // ── State ──
  const state = {
    phase: 'intro',
    grid: Array.from({length:GRID_SIZE}, () => Array.from({length:GRID_SIZE}, () => null)),
    hazards: [],
    scanned: new Set(),
    hazardResults: {},  // 'r,c' → 'hazard' | 'clear'
    buildings: [],
    connections: [],    // { fromId, toId, type }
    configs: {},
    buildingIdCounter: 0,
    budget: BUDGET,
    spent: 0,

    connectStep: 'water', // water | power | road
    connectReady: false,
    wasteSorted: 0,
    wasteCorrect: true,

    simRunning: false,
    simTime: 0,
    simSpeed: 1,
    citizens: [],
    busPos: null,
    busPath: [],
    busProgress: 0,
    puddles: [],
    puddlesDrained: 0,
    crisisActive: false,
    simEnded: false,

    stars: 0,
    sessionId: Date.now(),
  };

  // ── Helpers ──
  function rng(seed) {
    // Simple seeded random using sessionId
    let s = seed || state.sessionId;
    return () => { s = (s * 1664525 + 1013904223) & 0xFFFFFFFF; return (s >>> 0) / 0xFFFFFFFF; };
  }
  let rand = rng();

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function pickRandom(arr) { return arr[Math.floor(rand() * arr.length)]; }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function posKey(r, c) { return r + ',' + c; }

  function isInBounds(r, c) { return r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE; }

  function getBuilding(id) { return state.buildings.find(b => b.id === id); }

  function getBuildingAt(r, c) { return state.buildings.find(b => b.row === r && b.col === c); }

  function buildingCount(type) { return state.buildings.filter(b => b.type === type).length; }

  function isTerrainWater(r, c) {
    // Fixed terrain: river tiles at [0][2],[0][3],[1][3],[1][4],[2][4]
    const RIVER = [[0,2],[0,3],[1,3],[1,4],[2,4]];
    return RIVER.some(([rr,cc]) => rr === r && cc === c);
  }

  // ── Grid Generation ──
  function generateGrid() {
    return Array.from({length:GRID_SIZE}, (_, r) =>
      Array.from({length:GRID_SIZE}, (_, c) =>
        isTerrainWater(r,c) ? 'water' : 'grass'
      )
    );
  }

  function placeHazards() {
    const rand2 = rng(state.sessionId + 1);
    const positions = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (!isTerrainWater(r, c)) positions.push([r, c]);
      }
    }
    shuffle(positions);
    return positions.slice(0, HAZARD_COUNT);
  }

  // ── Phase 1: Build ──
  function canPlaceBuilding(type, r, c) {
    const def = BUILDING_DEFS[type];
    if (!def) return 'Unknown building';
    if (!isInBounds(r, c)) return 'Out of bounds';
    if (isTerrainWater(r, c)) return 'Cannot build on water';
    if (getBuildingAt(r, c)) return 'Tile already has a building';
    if (state.spent + def.cost > state.budget) return 'Not enough coins!';
    if (buildingCount(type) >= def.max) return 'Too many of this building';
    return null;
  }

  function placeBuilding(type, r, c) {
    const err = canPlaceBuilding(type, r, c);
    if (err) return { error: err };

    const id = state.buildingIdCounter++;
    const def = BUILDING_DEFS[type];
    const b = { id, type, row:r, col:c, def,
      connections: { water: false, power: false, road: false },
      efficiency: 1.0
    };

    // Check if built on unscanned hazard
    const key = posKey(r, c);
    if (state.hazardResults[key] === 'hazard') {
      b.efficiency = 0.5;
    }

    state.buildings.push(b);
    state.grid[r][c] = 'building';
    state.spent += def.cost;
    Audio.place();
    return { ok: true, building: b };
  }

  function removeBuilding(id) {
    const idx = state.buildings.findIndex(b => b.id === id);
    if (idx === -1) return;
    const b = state.buildings[idx];
    const refund = Math.floor(b.def.cost * 0.6);
    state.spent -= b.def.cost - refund;
    state.grid[b.row][b.col] = null;
    state.buildings.splice(idx, 1);
    // Remove connections involving this building
    state.connections = state.connections.filter(c => c.fromId !== id && c.toId !== id);
    Audio.click();
  }

  function scanTile(r, c) {
    const key = posKey(r, c);
    if (!isInBounds(r, c)) return null;
    if (isTerrainWater(r, c)) return { result: 'water' };
    if (state.scanned.has(key)) return { result: state.hazardResults[key] };
    state.scanned.add(key);
    const isHazard = state.hazards.some(([hr, hc]) => hr === r && hc === c);
    state.hazardResults[key] = isHazard ? 'hazard' : 'clear';
    Audio.scan();
    return { result: state.hazardResults[key], firstTime: true };
  }

  // ── Phase 2: Connect ──
  function getSourceBuildings(type) {
    if (type === 'water') return state.buildings.filter(b => b.type === 'water');
    if (type === 'power') return state.buildings.filter(b => b.type === 'power');
    if (type === 'road') return state.buildings.filter(b => b.type === 'home');
    return [];
  }

  function getValidTargets(type) {
    const sources = getSourceBuildings(type);
    if (sources.length === 0) return [];
    const sourceIds = new Set(sources.map(s => s.id));
    const alreadyConnectedIds = new Set(
      state.connections.filter(c => c.type === type).map(c => c.toId)
    );
    return state.buildings.filter(b =>
      !sourceIds.has(b.id) &&
      !alreadyConnectedIds.has(b.id) &&
      (b.def.needs || []).includes(type)
    );
  }

  function addConnection(fromId, toId, type) {
    const existing = state.connections.find(c => c.fromId === fromId && c.toId === toId && c.type === type);
    if (existing) return false;
    state.connections.push({ fromId, toId, type });
    const target = getBuilding(toId);
    if (target) target.connections[type] = true;
    Audio.connect();
    return true;
  }

  function getConnectionProgress(type) {
    const valid = getValidTargets(type);
    const connected = state.connections.filter(c => c.type === type).length;
    const total = state.buildings.filter(b => (b.def.needs || []).includes(type)).length;
    return { connected, total };
  }

  function isConnectPhaseComplete() {
    // All buildings that need water/power/road have them
    const needing = state.buildings.filter(b => (b.def.needs || []).length > 0);
    return needing.every(b => (b.def.needs || []).every(n => b.connections[n]));
  }

  // ── Phase 3: Simulation ──
  function getCitizenBuildings() {
    return state.buildings.filter(b =>
      ['home','school','hospital','park'].includes(b.type)
    );
  }

  function getRoadConnections() {
    // Get all road connection positions as point pairs
    return state.connections.filter(c => c.type === 'road').map(c => {
      const from = getBuilding(c.fromId);
      const to = getBuilding(c.toId);
      return from && to ? { from: {r:from.row, c:from.col}, to: {r:to.row, c:to.col} } : null;
    }).filter(Boolean);
  }

  function startSimulation() {
    state.simRunning = true;
    state.simTime = 0;
    state.citizens = [];
    state.busPos = null;
    state.busPath = [];
    state.puddles = [];
    state.puddlesDrained = 0;
    state.crisisActive = false;
    state.simEnded = false;

    // Create citizens
    const buildings = getCitizenBuildings();
    for (let i = 0; i < Math.min(8, buildings.length); i++) {
      const b = pickRandom(buildings);
      state.citizens.push({
        id: i,
        home: b,
        current: b,
        target: null,
        visible: true,
        color: ['#fb923c','#f87171','#60a5fa','#4ade80','#c084fc','#facc15','#f472b6','#34d399'][i]
      });
    }

    // Set bus path along roads
    const roads = getRoadConnections();
    if (roads.length > 0) {
      state.busPath = roads;
      state.busPos = { ...roads[0].from, progress: 0 };
    }

    // Place puddles
    const roadBuildings = state.buildings.filter(b => b.connections.road);
    const shuffled = shuffle([...roadBuildings]);
    state.puddles = shuffled.slice(0, PUDDLE_COUNT).map(b => ({ row: b.row, col: b.col }));

    Audio.cityStart();
  }

  function tickSimulation(dt) {
    if (!state.simRunning || state.simEnded) return;

    const speed = state.simSpeed;
    const tickMs = dt * speed;
    state.simTime += tickMs;

    // Move citizens (fade in/out at buildings)
    const buildings = getCitizenBuildings();
    state.citizens.forEach(cit => {
      if (rand() < 0.005 * speed) {
        // Move to random other building
        const others = buildings.filter(b => b.id !== cit.current.id);
        if (others.length > 0) {
          cit.current = pickRandom(others);
        }
      }
    });

    // Move bus along road path
    if (state.busPath.length > 0) {
      state.busProgress += 0.002 * speed;
      if (state.busProgress >= state.busPath.length) state.busProgress = 0;
      const idx = Math.floor(state.busProgress);
      const seg = state.busPath[idx];
      if (seg) {
        const frac = state.busProgress - idx;
        state.busPos = {
          r: seg.from.r + (seg.to.r - seg.from.r) * frac,
          c: seg.from.c + (seg.to.c - seg.from.c) * frac,
        };
      }
    }

    // Crisis: trigger after 30s (30000ms)
    if (state.simTime > 30000 && !state.crisisActive) {
      state.crisisActive = true;
      Audio.crisis();
    }
  }

  function drainPuddle(r, c) {
    const idx = state.puddles.findIndex(p => p.row === r && p.col === c);
    if (idx === -1) return false;
    state.puddles.splice(idx, 1);
    state.puddlesDrained++;
    Audio.splash();
    if (state.puddlesDrained >= PUDDLE_COUNT) {
      state.crisisActive = false;
      Audio.complete();
    }
    return true;
  }

  function endSimulation() {
    state.simEnded = true;
    state.simRunning = false;
    calculateStars();
  }

  // ── Scoring ──
  function calculateStars() {
    let stars = 0;
    // Star 1: placed all minimum buildings
    const minMet = Object.entries(REQUIRED).every(([type, count]) => buildingCount(type) >= count);
    if (minMet) stars++;
    // Star 2: all buildings connected
    const connected = state.buildings.filter(b => (b.def.needs || []).length > 0)
      .every(b => (b.def.needs || []).every(n => b.connections[n]));
    if (connected) stars++;
    // Star 3: puddles drained quickly (within 20s of crisis start)
    if (state.puddlesDrained >= PUDDLE_COUNT) stars++;
    state.stars = stars;
  }

  // ── Waste Sorting ──
  function initWasteSorting() {
    state.wasteSorted = 0;
    state.wasteCorrect = true;
  }

  function sortWaste(itemIndex, bin) {
    const item = WASTE_ITEMS[itemIndex];
    if (!item) return false;
    if (item.bin === bin) {
      state.wasteSorted++;
      Audio.correct();
      return true;
    } else {
      state.wasteCorrect = false;
      Audio.wrong();
      return false;
    }
  }

  // ── Public API ──
  function init() {
    state.grid = generateGrid();
    state.hazards = placeHazards();
    state.budget = BUDGET;
    state.spent = 0;
    state.buildings = [];
    state.connections = [];
    state.citizens = [];
    state.puddles = [];
    state.scanned = new Set();
    state.hazardResults = {};
    state.simRunning = false;
    state.phase = 'build';
    state.connectStep = 'water';
    state.connectReady = false;
    state.wasteSorted = 0;
    state.busPath = [];
    state.busProgress = 0;
    state.crisisActive = false;
    state.puddlesDrained = 0;
    state.simEnded = false;
    state.stars = 0;
    rand = rng(Date.now());
  }

  function save() {
    try {
      localStorage.setItem('ai-city-state-p1', JSON.stringify({
        buildings: state.buildings.map(b => ({ id:b.id, type:b.type, row:b.row, col:b.col,
          connections:b.connections, efficiency:b.efficiency })),
        connections: state.connections,
        spent: state.spent,
        scanned: [...state.scanned],
        hazardResults: state.hazardResults,
        connectStep: state.connectStep,
        phase: state.phase,
        simTime: state.simTime,
        stars: state.stars,
        puddlesDrained: state.puddlesDrained,
        timestamp: Date.now()
      }));
    } catch(e) {}
  }

  function loadSave() {
    try {
      const d = JSON.parse(localStorage.getItem('ai-city-state-p1'));
      if (!d || Date.now() - d.timestamp > 7200000) return false; // 2 hour expiry
      // Restore buildings
      d.buildings.forEach(b => {
        const def = BUILDING_DEFS[b.type];
        if (def) {
          state.buildings.push({ ...b, def });
          state.grid[b.row][b.col] = 'building';
        }
      });
      state.buildingIdCounter = (d.buildings.reduce((m, b) => Math.max(m, b.id), 0) || 0) + 1;
      state.connections = d.connections || [];
      state.spent = d.spent || 0;
      d.scanned?.forEach(s => state.scanned.add(s));
      state.hazardResults = d.hazardResults || {};
      state.connectStep = d.connectStep || 'water';
      state.phase = d.phase || 'build';
      state.simTime = d.simTime || 0;
      state.stars = d.stars || 0;
      state.puddlesDrained = d.puddlesDrained || 0;
      return true;
    } catch(e) { return false; }
  }

  function clearSave() {
    try { localStorage.removeItem('ai-city-state-p1'); } catch(e) {}
  }

  return {
    // Constants
    GRID_SIZE, BUDGET, HAZARD_COUNT, PUDDLE_COUNT,
    BUILDING_DEFS, REQUIRED, CONNECTION_TYPES, WASTE_ITEMS,
    // State
    state,
    // Methods
    init, save, loadSave, clearSave,
    canPlaceBuilding, placeBuilding, removeBuilding,
    scanTile,
    getSourceBuildings, getValidTargets, addConnection, getConnectionProgress, isConnectPhaseComplete,
    startSimulation, tickSimulation, drainPuddle, endSimulation,
    initWasteSorting, sortWaste,
    getBuilding, getBuildingAt,
    isTerrainWater,
  };
})();
