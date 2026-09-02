// city-logic.js — AI City Architect 3D core logic.
// Pure state (no THREE): grid, buildings, roads, token budget, BFS routing,
// system health, requirements. The renderer/simulation read from here.
export const G = 20;            // grid is 20×20 tiles
export const TILE = 4;          // metres per tile (world is 80m × 80m)
export const BUDGET = 500;

// 6 city systems + a 7th "misc" used for roads
export const SYSTEMS = ['power', 'water', 'transport', 'health', 'waste', 'safety'];

// Building definitions — costs in tokens, system grouping, palette colour.
export const BLD = {
  solar:   { s: 'power',     l: 'Solar Farm',      c: 8,  icon: '☀️' },
  wind:    { s: 'power',     l: 'Wind Turbine',    c: 6,  icon: '🌬️' },
  data:    { s: 'power',     l: 'Data Center',     c: 20, icon: '🗄️' },
  water:   { s: 'water',     l: 'Water Tower',     c: 8,  icon: '💧' },
  bus:     { s: 'transport', l: 'Bus Stop',        c: 4,  icon: '🚌' },
  depot:   { s: 'transport', l: 'Bus Depot',       c: 6,  icon: '🚏' },
  drone:   { s: 'transport', l: 'Drone Pad',       c: 8,  icon: '🛸' },
  road:    { s: 'transport', l: 'Road',            c: 2,  icon: '🛣️' },
  hosp:    { s: 'health',    l: 'Hospital',        c: 20, icon: '🏥' },
  clinic:  { s: 'health',    l: 'Clinic',          c: 8,  icon: '🩺' },
  green:   { s: 'health',    l: 'Green Space',     c: 3,  icon: '🌳' },
  recycle: { s: 'waste',     l: 'Recycling Ctr',   c: 6,  icon: '♻️' },
  collect: { s: 'waste',     l: 'Collection Pt',   c: 4,  icon: '🗑️' },
  emerg:   { s: 'safety',    l: 'Emergency Stn',   c: 8,  icon: '🚨' },
  town:    { s: 'safety',    l: 'Town Hall',       c: 12, icon: '🏛️' },
  auditor: { s: 'safety',    l: 'AI Auditor',      c: 10, icon: '🤖' },
  school:  { s: 'safety',    l: 'School',          c: 8,  icon: '🎓' },
};

// System colours (hex, matches CSS vars)
export const SYS_COLOR = {
  power: 0xffd166, water: 0x00b7ff, transport: 0x3ddc84,
  health: 0xff5c7a, waste: 0xc77bff, safety: 0xff8c2e,
};

// River: gentle diagonal snake through the middle (16 tiles).
export const WATER_TILES = [
  [2, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8],
  [8, 9], [9, 10], [10, 11], [11, 12], [12, 13], [13, 14], [14, 15], [15, 16],
];
// Mountain cluster in the north-west corner.
export const MTN_TILES = [[0, 0], [0, 1], [1, 0]];

export const isWater = (r, c) => WATER_TILES.some(([rr, cc]) => rr === r && cc === c);
export const isMtn = (r, c) => MTN_TILES.some(([rr, cc]) => rr === r && cc === c);
export const ok = (r, c) => r >= 0 && r < G && c >= 0 && c < G;

// Map tile -> world centre. Row 0 at -z (north), col 0 at -x (west).
export function tileToWorld(r, c) {
  return { x: (c - G / 2 + 0.5) * TILE, z: (r - G / 2 + 0.5) * TILE };
}
export function worldToTile(x, z) {
  return { r: Math.round(z / TILE + G / 2 - 0.5), c: Math.round(x / TILE + G / 2 - 0.5) };
}

// ---- Game state ----
export function createGame(seedVal) {
  let rand = seed(seedVal || Date.now());
  function seed(s) { let n = s; return () => { n = (n * 1664525 + 1013904223) & 0xFFFFFFFF; return (n >>> 0) / 0xFFFFFFFF; }; }

  const state = {
    phase: 'design',          // design | simulate | end
    tool: 'build',            // walk | build | remove
    selected: null,           // building type id to place
    buildings: [],            // { id, type, row, col }
    grid: Array.from({ length: G }, () => Array(G).fill(null)),
    idC: 0,
    tokens: { budget: BUDGET, spent: 0 },
    req: { systems: {}, roads: 0, spent: 0 },
    sim: {
      running: false, time: 0, speed: 1, hour: 6, day: 1,
      weather: 'clear', weatherTime: 0,
      systems: {}, sentiment: 70, pop: 500,
      crisis: null, crisesDone: 0, crisisQueue: [],
      vehicles: [], citizens: [],
    },
  };

  function bldAt(r, c) { return state.buildings.find(b => b.row === r && b.col === c) || null; }

  // Can a building be placed on this tile? (not water/mountain/occupied)
  function placeable(r, c, type) {
    if (!ok(r, c)) return false;
    if (isWater(r, c) || isMtn(r, c)) return false;
    if (state.grid[r][c]) return false;
    const def = BLD[type];
    if (!def) return false;
    return true;
  }

  function place(type, r, c) {
    const def = BLD[type];
    if (!placeable(r, c, type)) return { ok: false, reason: def ? 'blocked' : 'unknown' };
    if (state.tokens.spent + def.c > state.tokens.budget) return { ok: false, reason: 'tokens' };
    const id = 'b' + (++state.idC);
    const b = { id, type, row: r, col: c };
    state.buildings.push(b);
    state.grid[r][c] = id;
    state.tokens.spent += def.c;
    recomputeReq();
    return { ok: true, id };
  }

  function remove(r, c) {
    const b = bldAt(r, c);
    if (!b) return false;
    state.buildings = state.buildings.filter(x => x.id !== b.id);
    state.grid[r][c] = null;
    state.tokens.spent = Math.max(0, state.tokens.spent - BLD[b.type].c);
    recomputeReq();
    return true;
  }

  function recomputeReq() {
    state.req.systems = {};
    for (const s of SYSTEMS) state.req.systems[s] = 0;
    state.req.roads = 0;
    for (const b of state.buildings) {
      const def = BLD[b.type];
      if (b.type === 'road') state.req.roads++;
      else if (def && def.s && SYSTEMS.includes(def.s)) state.req.systems[def.s]++;
    }
    state.req.spent = state.tokens.spent;
  }

  function requirementsMet() {
    const r = state.req;
    return SYSTEMS.every(s => r.systems[s] >= 1) && r.roads >= 3 && r.spent >= 25;
  }

  // ---- Road graph + BFS ----
  // Orthogonal adjacency over road tiles (roads connect N/S/E/W).
  function roadNeighbors(r, c) {
    const out = [];
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dr, dc] of dirs) {
      const rr = r + dr, cc = c + dc;
      if (!ok(rr, cc)) continue;
      if (isWater(rr, cc) || isMtn(rr, cc)) continue;
      const b = bldAt(rr, cc);
      if (b && b.type === 'road') out.push([rr, cc]);
    }
    return out;
  }

  // BFS shortest path of road tiles between two tiles. Buildings sit BESIDE
  // roads, so if start/end are not roads we enter/exit via an adjacent road tile.
  function bfsRoad(fromR, fromC, toR, toC) {
    if (!ok(fromR, fromC) || !ok(toR, toC)) return null;
    const isRoad = (r, c) => { const b = bldAt(r, c); return !!(b && b.type === 'road'); };
    const entry = (r, c) => (isRoad(r, c) ? [[r, c]] : roadNeighbors(r, c));
    const fromSet = entry(fromR, fromC);
    const toSet = entry(toR, toC);
    if (!fromSet.length || !toSet.length) return null;
    // direct adjacency (building → building through one road tile or next to it)
    for (const [fr, fc] of fromSet) {
      for (const [tr, tc] of toSet) {
        if (fr === tr && fc === tc) return [[fromR, fromC], [toR, toC]];
      }
    }
    const prev = new Map();
    const q = [];
    for (const [fr, fc] of fromSet) {
      const k = fr + ',' + fc;
      if (!prev.has(k)) { prev.set(k, null); q.push([fr, fc]); }
    }
    while (q.length) {
      const [r, c] = q.shift();
      for (const [rr, cc] of roadNeighbors(r, c)) {
        const k = rr + ',' + cc;
        if (prev.has(k)) continue;
        prev.set(k, [r, c]);
        if (toSet.some(([tr, tc]) => tr === rr && tc === cc)) {
          const seg = [];
          let cur = [rr, cc];
          while (cur) { seg.unshift(cur); cur = prev.get(cur[0] + ',' + cur[1]); }
          return [[fromR, fromC], ...seg, [toR, toC]];
        }
        q.push([rr, cc]);
      }
    }
    return null;
  }

  // BFS over walkable tiles (grass + road, not water/mtn/building) for champion.
  function bfsWalk(fromR, fromC, toR, toC) {
    if (!ok(fromR, fromC) || !ok(toR, toC)) return null;
    if (isWater(toR, toC) || isMtn(toR, toC)) return null;
    if (fromR === toR && fromC === toC) return [[fromR, fromC]];
    const passable = (r, c) => {
      if (!ok(r, c)) return false;
      if (isWater(r, c) || isMtn(r, c)) return false;
      return true;   // champion walks anywhere on land
    };
    const prev = new Map();
    const q = [[fromR, fromC]];
    prev.set(fromR + ',' + fromC, null);
    while (q.length) {
      const [r, c] = q.shift();
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const rr = r + dr, cc = c + dc;
        const k = rr + ',' + cc;
        if (!passable(rr, cc) || prev.has(k)) continue;
        prev.set(k, [r, c]);
        if (rr === toR && cc === toC) {
          const path = [];
          let cur = [toR, toC];
          while (cur) { path.unshift(cur); cur = prev.get(cur[0] + ',' + cur[1]); }
          return path;
        }
        q.push([rr, cc]);
      }
    }
    return null;
  }

  // ---- System health (for simulation) ----
  // Simple model: each system scores 0-100 based on building presence + coverage.
  function computeSystems() {
    const count = { power: 0, water: 0, transport: 0, health: 0, waste: 0, safety: 0 };
    let energyIn = 0, energyOut = 0, waterCap = 0;
    for (const b of state.buildings) {
      const def = BLD[b.type];
      if (!def || !def.s || b.type === 'road') continue;
      count[def.s]++;
      if (b.type === 'solar' || b.type === 'wind') energyIn += 5;
      if (b.type === 'data') energyOut += 8;
      if (b.type === 'water') waterCap += 10;
    }
    const sys = {};
    sys.power = clamp(energyIn >= energyOut ? 100 : Math.round((energyIn / Math.max(1, energyOut)) * 100), 0, 100);
    sys.water = clamp(count.water * 20, 0, 100);
    sys.transport = clamp(count.transport * 15 + state.req.roads * 3, 0, 100);
    sys.health = clamp(count.health * 20, 0, 100);
    sys.waste = clamp(count.waste * 20, 0, 100);
    sys.safety = clamp(count.safety * 18, 0, 100);
    state.sim.systems = sys;
    // sentiment = weighted average
    const vals = SYSTEMS.map(s => sys[s]);
    state.sim.sentiment = Math.round(70 + (vals.reduce((a, b) => a + b, 0) / 6 - 50) * 0.4);
    return sys;
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // ---- Persistence ----
  function save() {
    try {
      localStorage.setItem('ai-city-3d-state', JSON.stringify({
        phase: state.phase, buildings: state.buildings.map(b => ({ type: b.type, row: b.row, col: b.col })),
        tokens: state.tokens, idC: state.idC,
      }));
    } catch (e) { /* ignore */ }
  }
  function load() {
    try {
      const raw = localStorage.getItem('ai-city-3d-state');
      if (!raw) return false;
      const s = JSON.parse(raw);
      if (!s || !Array.isArray(s.buildings)) return false;
      // rebuild state
      state.buildings = [];
      state.grid = Array.from({ length: G }, () => Array(G).fill(null));
      state.tokens = { budget: BUDGET, spent: 0 };
      state.idC = s.idC || 0;
      for (const b of s.buildings) {
        if (!BLD[b.type] || !placeable(b.row, b.col, b.type)) continue;
        const id = 'b' + (++state.idC);
        state.buildings.push({ id, type: b.type, row: b.row, col: b.col });
        state.grid[b.row][b.col] = id;
        state.tokens.spent += BLD[b.type].c;
      }
      recomputeReq();
      return true;
    } catch (e) { return false; }
  }
  function clearSave() { try { localStorage.removeItem('ai-city-3d-state'); } catch (e) { /* ignore */ } }

  return {
    state, BLD, place, remove, placeable, bldAt, ok, isWater, isMtn,
    tileToWorld, worldToTile, recomputeReq, requirementsMet, computeSystems,
    bfsRoad, bfsWalk, save, load, clearSave,
  };
}
