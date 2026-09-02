// city-sim.js — 3D simulation: vehicles animate along road routes, weather
// cycles, and Black Swan crisis events (heatwave / flood / storm) trigger with
// a decision panel. Reads game state from Game, renders via renderer + champion.
//
// v2 — makes the city feel ALIVE:
//   - multiple buses + trucks per route (staggered starts)
//   - citizens that WALK between buildings
//   - crisis visuals: flood water planes, heatwave haze
//   - vehicles + citizens use external GLB models (Quaternius CC0) via city-assets.js
import * as THREE from 'three';
import { G, TILE, tileToWorld, ok, isWater, isMtn, BLD, SYSTEMS } from './city-logic.js';
import { getVehicle, getCitizen, playAnim, whenAssetsReady } from './city-assets.js';

export function createSimulation(renderer, champion) {
  // ---- GLB pools (filled async once assets are ready) ----
  const busPool = [];     // THREE.Group clones
  const truckPool = [];
  const policePool = [];
  const taxiPool = [];
  const ambulancePool = [];
  const firetruckPool = [];
  const citizenPool = []; // { mesh, mixer }
  const MAX_BUSES = 24, MAX_TRUCKS = 12, MAX_CARS = 10, MAX_AMBULANCES = 3, MAX_FIRETRUCKS = 2, MAX_CITIZENS = 30;

  function makePools() {
    const jobs = [];
    for (let i = 0; i < MAX_BUSES; i++) jobs.push(getVehicle('bus').then(m => busPool.push(m)));
    for (let i = 0; i < MAX_TRUCKS; i++) jobs.push(getVehicle('truck').then(m => truckPool.push(m)));
    for (let i = 0; i < MAX_CARS; i++) jobs.push(getVehicle('police').then(m => policePool.push(m)));
    for (let i = 0; i < MAX_CARS; i++) jobs.push(getVehicle('taxi').then(m => taxiPool.push(m)));
    for (let i = 0; i < MAX_AMBULANCES; i++) jobs.push(getVehicle('ambulance').then(m => ambulancePool.push(m)));
    for (let i = 0; i < MAX_FIRETRUCKS; i++) jobs.push(getVehicle('firetruck').then(m => firetruckPool.push(m)));
    for (let i = 0; i < MAX_CITIZENS; i++) jobs.push(getCitizen().then(m => citizenPool.push({ mesh: m, mixer: null })));
    Promise.all(jobs).then(() => {
      for (const m of busPool) { m.visible = false; renderer.scene.add(m); }
      for (const m of truckPool) { m.visible = false; renderer.scene.add(m); }
      for (const m of policePool) { m.visible = false; renderer.scene.add(m); }
      for (const m of taxiPool) { m.visible = false; renderer.scene.add(m); }
      for (const m of ambulancePool) { m.visible = false; renderer.scene.add(m); }
      for (const m of firetruckPool) { m.visible = false; renderer.scene.add(m); }
      for (const c of citizenPool) { c.mesh.visible = false; renderer.scene.add(c.mesh); }
    });
  }
  whenAssetsReady().then(makePools);

  // State
  const st = {
    running: false,
    busRoutes: [],        // [{ path: [[r,c]...], vehicles: [{t, speed}] }]
    truckRoutes: [],
    carRoutes: [],
    buses: [], trucks: [], policeCars: [], taxis: [], citizens: [],
    weather: 'clear', weatherTime: 0,
    crisis: null, crisesDone: 0,
    crisisVehicle: null,   // { type, vehicle, mesh } shown during a crisis
    // crisis visuals
    floodPlanes: null,    // rising water planes
    hazePlane: null,      // heatwave haze
  };

  // ---- Route planning (from road graph) ----
  function buildRoutes(game) {
    const roads = game.state.buildings.filter(b => b.type === 'road');
    if (roads.length < 2) return;
    const busStops = game.state.buildings.filter(b => b.type === 'bus' || b.type === 'depot');
    const wastePts = game.state.buildings.filter(b => b.type === 'recycle' || b.type === 'collect');

    // Vehicles should drive ALL OVER the available road network, not wait for
    // the player to place enough specialised stops. Buses prefer bus stops /
    // depots when 2+ exist (they still pause at them via pauseAtStop), otherwise
    // they cruise the road tiles exactly like the general traffic. Same for the
    // recycling trucks with waste points.
    const busNodes = busStops.length >= 2 ? busStops : roads;
    const truckNodes = wastePts.length >= 2 ? wastePts : roads;

    const used = new Set();
    const busRoute = makeRoute(game, busNodes, 3, used, 'bus');
    const truckRoute = makeRoute(game, truckNodes, 2, used, 'waste');
    if (busRoute) {
      st.busRoutes = [busRoute];
      // spawn 3-4 buses staggered along the route
      for (let i = 0; i < 4; i++) {
        const v = newVehicle(busRoute, i / 4);
        busRoute.vehicles.push(v);
        st.buses.push(v);
      }
    }
    if (truckRoute) {
      st.truckRoutes = [truckRoute];
      for (let i = 0; i < 3; i++) {
        const v = newVehicle(truckRoute, i / 3);
        truckRoute.vehicles.push(v);
        st.trucks.push(v);
      }
    }
    // general traffic: a police car + a couple taxis drive along any long road path
    st.carRoutes = [];
    const carRoute = makeRoute(game, roads, 3, used, 'car');
    if (carRoute) {
      st.carRoutes = [carRoute];
      // police car + 1-2 taxis, staggered
      const vp = newVehicle(carRoute, 0.1);
      carRoute.vehicles.push(vp);
      st.policeCars = [vp];
      for (let i = 0; i < 2; i++) {
        const vt = newVehicle(carRoute, 0.3 + i * 0.25);
        carRoute.vehicles.push(vt);
        st.taxis.push(vt);
      }
    }
  }

  function makeRoute(game, nodes, count, used, kind) {
    const roadAccess = (n) => game.bfsRoad(n.row, n.col, n.row, n.col) !== null ||
      game.state.buildings.some(b => {
        if (b.type !== 'road') return false;
        return Math.abs(b.row - n.row) + Math.abs(b.col - n.col) === 1;
      });
    const usable = nodes.filter(n => !used.has(n.id) && roadAccess(n));
    if (!usable.length) return null;
    const start = usable[0];
    const chain = [start];
    used.add(start.id);
    let cur = start;
    for (let i = 1; i < count; i++) {
      const next = usable.find(n => !used.has(n.id) && n.id !== cur.id && game.bfsRoad(cur.row, cur.col, n.row, n.col));
      if (!next) break;
      chain.push(next);
      used.add(next.id);
      cur = next;
    }
    if (chain.length < 2) return null;
    const path = [];
    for (let i = 0; i < chain.length - 1; i++) {
      const seg = game.bfsRoad(chain[i].row, chain[i].col, chain[i + 1].row, chain[i + 1].col);
      if (!seg) continue;
      for (let j = (i === 0 ? 0 : 1); j < seg.length; j++) path.push(seg[j]);
    }
    if (path.length < 2) return null;
    return { kind, path, vehicles: [] };
  }

  function newVehicle(route, offsetT) {
    const v = { t: offsetT !== undefined ? offsetT : Math.random(), speed: 0.5 + Math.random() * 0.3 };
    v.__route = route;   // reference back to its route (for stop pauses)
    return v;
  }

  // ---- Simulation tick ----
  function start(game) {
    st.running = true;
    st.busRoutes = []; st.truckRoutes = []; st.carRoutes = [];
    buildRoutes(game);
    st.weather = 'clear'; st.weatherTime = 0;
    st.crisis = null;
    if (st.crisisVehicle) { st.crisisVehicle.mesh.visible = false; st.crisisVehicle = null; }
    removeCrisisVisuals();
    busPool.forEach((m, i) => m.visible = i === 0);
    truckPool.forEach(m => m.visible = false);
    policePool.forEach(m => m.visible = false);
    taxiPool.forEach(m => m.visible = false);
    ambulancePool.forEach(m => m.visible = false);
    firetruckPool.forEach(m => m.visible = false);
    citizenPool.forEach(c => c.mesh.visible = false);
  }
  function stop() {
    st.running = false; st.crisis = null;
    st.busRoutes = []; st.truckRoutes = []; st.carRoutes = [];
    st.buses = []; st.trucks = []; st.policeCars = []; st.taxis = [];
    if (st.crisisVehicle) { st.crisisVehicle.mesh.visible = false; st.crisisVehicle = null; }
    busPool.forEach(m => m.visible = false);
    truckPool.forEach(m => m.visible = false);
    policePool.forEach(m => m.visible = false);
    taxiPool.forEach(m => m.visible = false);
    ambulancePool.forEach(m => m.visible = false);
    firetruckPool.forEach(m => m.visible = false);
    citizenPool.forEach(c => c.mesh.visible = false);
    renderer.setWeather('clear');
    removeCrisisVisuals();
  }

  function update(dt, game) {
    if (!st.running) return;

    const sim = game.state.sim;
    sim.time += dt * sim.speed;
    sim.hour = 6 + ((sim.time / 10) % 24);
    sim.day = 1 + Math.floor(sim.time / 240);

    // Weather cycle
    st.weatherTime += dt;
    const wlen = 60;
    const phases = ['clear', 'clear', 'cloudy', 'rain', 'clear', 'cloudy', 'storm'];
    const wIdx = Math.floor(st.weatherTime / wlen) % phases.length;
    const w = phases[wIdx];
    if (w !== st.weather) {
      st.weather = w;
      renderer.setWeather(w);
      pushEvent(`🌤 Weather: ${w}`, game);
    }

    // Crises (every ~2.5 min if not already active)
    if (!st.crisis && sim.time > 120 && Math.floor(sim.time / 150) > st.crisesDone) {
      const next = ['heatwave', 'flood', 'storm'][st.crisesDone % 3];
      triggerCrisis(next, game);
    }

    moveVehicles(dt, game);
    updateCitizens(dt, game);
    updateCrisisVisuals(dt, game);
    game.computeSystems();
  }

  function moveVehicles(dt, game) {
    // advance all vehicles (with stop pauses), then draw GLB clones
    const used = new Set();
    let bi = 0, ti = 0, pi = 0, xi = 0;
    for (const route of st.busRoutes) {
      for (const v of route.vehicles) {
        const isPaused = pauseAtStop(v, game, dt);
        if (!isPaused) v.t += dt * v.speed / route.path.length;
        if (v.t > 1) v.t -= 1;
        const pos = pathPos(route.path, v.t);
        if (!pos) continue;
        if (bi >= busPool.length) break;
        const mesh = busPool[bi++];
        mesh.visible = true;
        mesh.position.set(pos.x, 0.28, pos.z);
        const next = pathPos(route.path, (v.t + 0.02) % 1);
        if (next) mesh.rotation.y = Math.atan2(next.x - pos.x, next.z - pos.z);
        used.add(mesh);
      }
    }
    for (const route of st.truckRoutes) {
      for (const v of route.vehicles) {
        const isPaused = pauseAtStop(v, game, dt);
        if (!isPaused) v.t += dt * v.speed / route.path.length;
        if (v.t > 1) v.t -= 1;
        const pos = pathPos(route.path, v.t);
        if (!pos) continue;
        if (ti >= truckPool.length) break;
        const mesh = truckPool[ti++];
        mesh.visible = true;
        mesh.position.set(pos.x, 0.26, pos.z);
        const next = pathPos(route.path, (v.t + 0.02) % 1);
        if (next) mesh.rotation.y = Math.atan2(next.x - pos.x, next.z - pos.z);
        used.add(mesh);
      }
    }
    // general traffic: police car + taxis cruise the car route
    for (const route of st.carRoutes) {
      for (const v of route.vehicles) {
        v.t += dt * v.speed / route.path.length;
        if (v.t > 1) v.t -= 1;
        const pos = pathPos(route.path, v.t);
        if (!pos) continue;
        const isPolice = v === (st.policeCars && st.policeCars[0]);
        const pool = isPolice ? policePool : taxiPool;
        const idx = isPolice ? pi++ : xi++;
        if (idx >= pool.length) break;
        const mesh = pool[idx];
        mesh.visible = true;
        mesh.position.set(pos.x, 0.24, pos.z);
        const next = pathPos(route.path, (v.t + 0.02) % 1);
        if (next) mesh.rotation.y = Math.atan2(next.x - pos.x, next.z - pos.z);
        used.add(mesh);
      }
    }
    // crisis response vehicle: one ambulance/police/truck rushes the car route
    if (st.crisisVehicle && st.crisisVehicle.mesh) {
      const cv = st.crisisVehicle;
      cv.t += dt * (cv.speed || 1.6) / cv.route.path.length;
      if (cv.t > 1) cv.t -= 1;
      const pos = pathPos(cv.route.path, cv.t);
      if (pos) {
        cv.mesh.visible = true;
        cv.mesh.position.set(pos.x, 0.24, pos.z);
        const next = pathPos(cv.route.path, (cv.t + 0.02) % 1);
        if (next) cv.mesh.rotation.y = Math.atan2(next.x - pos.x, next.z - pos.z);
        used.add(cv.mesh);
      }
    }
    // hide unused pool clones
    for (const m of busPool) if (!used.has(m)) m.visible = false;
    for (const m of truckPool) if (!used.has(m)) m.visible = false;
    for (const m of policePool) if (!used.has(m)) m.visible = false;
    for (const m of taxiPool) if (!used.has(m)) m.visible = false;
    for (const m of ambulancePool) if (!used.has(m)) m.visible = false;
    for (const m of firetruckPool) if (!used.has(m)) m.visible = false;
  }

  // Pause a vehicle when it reaches a route stop (bus stop/depot/collect/recycle).
  // Returns true while the vehicle is paused (doesn't advance along the route).
  function pauseAtStop(v, game, dt) {
    if (v._pause === undefined) v._pause = 0;
    if (v._pause > 0) { v._pause -= dt; return v._pause > 0; }
    if (v._cooldown > 0) { v._cooldown -= dt; return false; }
    const pos = pathPos(v.__route.path, v.t);
    if (pos) {
      const cr = Math.round(pos.z / TILE + G / 2 - 0.5);
      const cc = Math.round(pos.x / TILE + G / 2 - 0.5);
      if (ok(cr, cc)) {
        const tb = game.state.grid[cr] && game.state.grid[cr][cc] ? game.bldAt(cr, cc) : null;
        if (tb && (tb.type === 'bus' || tb.type === 'depot' || tb.type === 'collect' || tb.type === 'recycle')) {
          v._pause = 1.2;      // stop for ~1.2s
          v._cooldown = 2.5;   // then drive freely for 2.5s before pausing again
          return true;
        }
      }
    }
    return false;
  }

  function pathPos(path, t) {
    if (!path || path.length < 2) return null;
    const total = path.length - 1;
    const idx = Math.floor(t * total);
    const nxt = Math.min(idx + 1, total);
    const frac = (t * total) % 1;
    const [r1, c1] = path[idx], [r2, c2] = path[nxt];
    const p1 = tileToWorld(r1, c1), p2 = tileToWorld(r2, c2);
    return { x: p1.x + (p2.x - p1.x) * frac, z: p1.z + (p2.z - p1.z) * frac };
  }

  // ---- Citizens walk between nearby passable tiles ----
  function updateCitizens(dt, game) {
    const sim = game.state.sim;
    if (!sim.citizens) sim.citizens = [];
    // top up to 24 citizens
    if (sim.citizens.length < 24) {
      const blds = game.state.buildings.filter(b => b.type !== 'road');
      if (blds.length) {
        const b = blds[Math.floor(Math.random() * blds.length)];
        const cands = [];
        for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
          const rr = b.row + dr, cc = b.col + dc;
          if (!ok(rr, cc)) continue;
          if (isWater(rr, cc) || isMtn(rr, cc)) continue;
          if (game.state.grid[rr][cc]) continue;
          cands.push([rr, cc]);
        }
        if (cands.length) {
          const t = cands[Math.floor(Math.random() * cands.length)];
          const p = tileToWorld(t[0], t[1]);
          sim.citizens.push({
            x: p.x, z: p.z,
            tx: p.x, tz: p.z,
            life: 25 + Math.random() * 25,
            walkT: Math.random() * Math.PI * 2,
            hasTarget: false,
          });
        }
      }
    }
    // move citizens toward a target tile, then pick a new one
    for (const c of sim.citizens) {
      c.life -= dt;
      if (!c.hasTarget) {
        for (let tries = 0; tries < 8; tries++) {
          const rr = Math.floor(Math.random() * G), cc = Math.floor(Math.random() * G);
          if (!ok(rr, cc) || isWater(rr, cc) || isMtn(rr, cc)) continue;
          if (game.state.grid[rr][cc]) continue;
          const p = tileToWorld(rr, cc);
          c.tx = p.x; c.tz = p.z;
          c.hasTarget = true;
          break;
        }
      }
      if (c.hasTarget) {
        const dx = c.tx - c.x, dz = c.tz - c.z;
        const d = Math.hypot(dx, dz);
        const sp = 1.6;   // m/s walking
        if (d < 0.3) { c.hasTarget = false; }
        else { c.x += dx / d * sp * dt; c.z += dz / d * sp * dt; }
      }
      c.walkT += dt * 6;
    }
    sim.citizens = sim.citizens.filter(c => c.life > 0);

    // render GLB citizen clones with walk animation + facing direction
    let ci = 0;
    for (const c of sim.citizens) {
      if (ci >= citizenPool.length) break;
      const slot = citizenPool[ci++];
      slot.mesh.visible = true;
      slot.mesh.position.set(c.x, 0, c.z);
      // face the direction of travel when walking
      if (c.hasTarget) {
        const dx = c.tx - c.x, dz = c.tz - c.z;
        if (Math.hypot(dx, dz) > 0.2) slot.mesh.rotation.y = Math.atan2(dx, dz);
      }
      if (!slot.mixer) slot.mixer = playAnim(slot.mesh, 'walk');
      if (slot.mixer) slot.mixer.update(dt);
    }
    for (let i = ci; i < citizenPool.length; i++) citizenPool[i].mesh.visible = false;
  }

  // ---- Crisis visuals ----
  function removeCrisisVisuals() {
    if (st.floodPlanes) { renderer.scene.remove(st.floodPlanes); st.floodPlanes = null; }
    if (st.hazePlane) { renderer.scene.remove(st.hazePlane); st.hazePlane = null; }
  }
  function updateCrisisVisuals(dt, game) {
    if (!st.crisis) { removeCrisisVisuals(); return; }
    const kind = st.crisis.kind;
    if (kind === 'flood') {
      if (!st.floodPlanes) {
        const geo = new THREE.PlaneGeometry(G * TILE, G * TILE);
        const mat = new THREE.MeshStandardMaterial({
          color: 0x1a6ea8, transparent: true, opacity: 0, side: THREE.DoubleSide,
          emissive: 0x0a3a6e, emissiveIntensity: 0.4,
        });
        st.floodPlanes = new THREE.Mesh(geo, mat);
        st.floodPlanes.rotation.x = -Math.PI / 2;
        st.floodPlanes.position.y = -1.2;
        renderer.scene.add(st.floodPlanes);
      }
      if (st.floodPlanes.position.y < 0.35) st.floodPlanes.position.y += dt * 0.25;
      st.floodPlanes.material.opacity = Math.min(0.55, st.floodPlanes.material.opacity + dt * 0.3);
    } else if (kind === 'heatwave') {
      if (!st.hazePlane) {
        const geo = new THREE.PlaneGeometry(G * TILE, G * TILE);
        const mat = new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
        st.hazePlane = new THREE.Mesh(geo, mat);
        st.hazePlane.rotation.x = -Math.PI / 2;
        st.hazePlane.position.y = 0.5;
        renderer.scene.add(st.hazePlane);
      }
      st.hazePlane.material.opacity = Math.min(0.22, st.hazePlane.material.opacity + dt * 0.15);
    }
  }

  // ---- Crisis events ----
  function triggerCrisis(kind, game) {
    const sim = game.state.sim;
    const crises = {
      heatwave: {
        title: '🌡️ Heatwave!',
        text: 'A heatwave is pushing power demand up! The Data Centers are struggling to stay cool.',
        options: [
          { label: '🌬️ Switch to efficient cooling (+5🪙)', effect: () => { sim.systems.power = Math.min(100, sim.systems.power + 15); }, good: true },
          { label: '☀️ Build more solar panels', effect: () => { sim.systems.power = Math.min(100, sim.systems.power + 8); }, good: true },
          { label: '😓 Do nothing', effect: () => { sim.systems.power = Math.max(20, sim.systems.power - 15); }, good: false },
        ],
      },
      flood: {
        title: '🌊 Flash Flood!',
        text: 'Heavy rain is flooding roads near the river! Buses can’t get through.',
        options: [
          { label: '🚧 Deploy flood barriers', effect: () => { sim.systems.transport = Math.min(100, sim.systems.transport + 15); }, good: true },
          { label: '🔄 Reroute buses', effect: () => { sim.systems.transport = Math.min(100, sim.systems.transport + 8); }, good: true },
          { label: '🌧️ Wait for it to pass', effect: () => { sim.systems.transport = Math.max(20, sim.systems.transport - 12); }, good: false },
        ],
      },
      storm: {
        title: '⛈️ Severe Storm!',
        text: 'A storm is knocking out power lines — fire risk in the data district! The city needs to stabilize the grid.',
        options: [
          { label: '🔋 Deploy batteries', effect: () => { sim.systems.power = Math.min(100, sim.systems.power + 12); }, good: true },
          { label: '💨 Use wind turbines harder', effect: () => { sim.systems.power = Math.min(100, sim.systems.power + 8); }, good: true },
          { label: '🕯️ Switch to candles', effect: () => { sim.systems.power = Math.max(15, sim.systems.power - 18); }, good: false },
        ],
      },
    };
    const def = crises[kind];
    if (!def) return;
    st.crisis = { kind, def, active: true };
    sim.crisis = st.crisis;
    st.crisesDone++;
    sim.crisesDone = st.crisesDone;
    if (kind === 'heatwave') renderer.setWeather('cloudy');
    if (kind === 'flood') renderer.setWeather('rain');
    if (kind === 'storm') renderer.setWeather('storm');
    spawnCrisisVehicle(kind, game);
    pushEvent(`⚠️ ${def.title}`, game);
  }

  // Spawn a response vehicle that rushes the road network during a crisis.
  // heatwave → ambulance, flood → police, storm → fire truck.
  function spawnCrisisVehicle(kind, game) {
    const type = kind === 'heatwave' ? 'ambulance' : kind === 'flood' ? 'police' : 'firetruck';
    const pool = type === 'ambulance' ? ambulancePool : type === 'police' ? policePool : firetruckPool;
    const route = st.carRoutes[0] || st.busRoutes[0] || st.truckRoutes[0];
    if (!pool.length || !route) return;
    const mesh = pool[0];
    st.crisisVehicle = { type, mesh, route, t: Math.random(), speed: 2.0 };
  }

  function resolveCrisis(option) {
    if (!st.crisis) return;
    option.effect();
    const sim = gameOf().state.sim;
    sim.crisis = null;
    st.crisis = null;
    if (st.crisisVehicle) {
      st.crisisVehicle.mesh.visible = false;
      st.crisisVehicle = null;
    }
    removeCrisisVisuals();
    renderer.setWeather('clear');
    pushEvent('✅ Crisis resolved!', gameOf());
  }

  let _game = null;
  function gameOf() { return _game; }
  function bind(game) { _game = game; }

  function pushEvent(msg, game) {
    const sim = game.state.sim;
    if (!sim.eventLog) sim.eventLog = [];
    sim.eventLog.unshift(msg);
    if (sim.eventLog.length > 30) sim.eventLog.pop();
  }

  // ---- Public ----
  return {
    start, stop, update, bind, triggerCrisis, resolveCrisis,
    get crisis() { return st.crisis; },
    get weather() { return st.weather; },
    get poolsReady() { return busPool.length > 0; },
  };
}
