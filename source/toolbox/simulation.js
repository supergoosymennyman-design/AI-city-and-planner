/**
 * SimulationEngine — Tick-based simulation engine for primary city games.
 *
 * Provides base simulation loop and specialized models for:
 *   - Traffic flow (Nagel-Schreckenberg cellular automata)
 *   - Bus scheduling (queue-based)
 *   - Water pressure (graph-based, Dijkstra)
 *   - Power grid load balancing (max-flow)
 *   - Demand forecasting (moving average)
 *
 * All models are pure JS, no dependencies. Designed to be composed into
 * larger city simulations (P1-07 through P1-14).
 *
 * Usage:
 *   const sim = new SimulationEngine();
 *   sim.addSystem('traffic', new TrafficModel({ length: 20 }));
 *   sim.start();
 *   sim.onTick((state) => { renderState(state); });
 */

const SimulationEngine = (() => {

  // ---- Core Engine ----

  class SimulationEngine {
    constructor() {
      this._systems = new Map();
      this._tickInterval = null;
      this._tickRate = 1000; // ms per tick
      this._tickCount = 0;
      this._running = false;
      this._onTickCallback = null;
    }

    addSystem(name, system) {
      this._systems.set(name, system);
    }

    removeSystem(name) {
      this._systems.delete(name);
    }

    /**
     * Start the simulation loop.
     * @param {number} [tickRate] - ms between ticks
     */
    start(tickRate) {
      if (this._running) return;
      if (tickRate) this._tickRate = tickRate;
      this._running = true;
      this._tickLoop();
    }

    stop() {
      this._running = false;
      if (this._tickInterval) {
        clearTimeout(this._tickInterval);
        this._tickInterval = null;
      }
    }

    step() {
      this._tick();
    }

    reset() {
      this.stop();
      this._tickCount = 0;
      for (const system of this._systems.values()) {
        system.reset();
      }
    }

    onTick(callback) {
      this._onTickCallback = callback;
    }

    get tickCount() { return this._tickCount; }
    get isRunning() { return this._running; }

    getState() {
      const state = { tick: this._tickCount };
      for (const [name, system] of this._systems) {
        state[name] = system.getState();
      }
      return state;
    }

    _tickLoop() {
      if (!this._running) return;
      this._tick();
      this._tickInterval = setTimeout(() => this._tickLoop(), this._tickRate);
    }

    _tick() {
      for (const system of this._systems.values()) {
        system.tick();
      }
      this._tickCount++;
      if (this._onTickCallback) {
        this._onTickCallback(this.getState());
      }
    }
  }

  // ---- Traffic Model (Nagel-Schreckenberg) ----

  class TrafficModel {
    /**
     * @param {object} config
     * @param {number} config.length - road length (number of cells)
     * @param {number} [config.maxSpeed] - cells per tick (default 5)
     * @param {number} [config.pSlow] - probability of random slowdown (default 0.3)
     * @param {number} [config.density] - initial vehicle density (default 0.3)
     */
    constructor(config = {}) {
      this.length = config.length || 20;
      this.maxSpeed = config.maxSpeed || 5;
      this.pSlow = config.pSlow || 0.3;
      this.density = config.density || 0.3;
      this.cells = [];
      this.speeds = [];
      this.throughput = 0; // vehicles that passed the end
      this.reset();
    }

    reset() {
      this.cells = new Array(this.length).fill(false);
      this.speeds = new Array(this.length).fill(0);
      this.throughput = 0;

      // Place vehicles randomly
      const numVehicles = Math.floor(this.length * this.density);
      const positions = [];
      while (positions.length < numVehicles) {
        const pos = Math.floor(Math.random() * this.length);
        if (!positions.includes(pos)) {
          positions.push(pos);
          this.cells[pos] = true;
          this.speeds[pos] = Math.floor(Math.random() * (this.maxSpeed + 1));
        }
      }
    }

    /**
     * Place a vehicle at a specific position (student action).
     */
    addVehicle(pos) {
      if (pos >= 0 && pos < this.length && !this.cells[pos]) {
        this.cells[pos] = true;
        this.speeds[pos] = 0;
        return true;
      }
      return false;
    }

    /**
     * Remove a vehicle at a specific position.
     */
    removeVehicle(pos) {
      if (pos >= 0 && pos < this.length && this.cells[pos]) {
        this.cells[pos] = false;
        this.speeds[pos] = 0;
        return true;
      }
      return false;
    }

    tick() {
      const newCells = new Array(this.length).fill(false);
      const newSpeeds = new Array(this.length).fill(0);

      // Process vehicles from right to left to avoid conflicts
      for (let i = this.length - 1; i >= 0; i--) {
        if (!this.cells[i]) continue;

        // Step 1: Accelerate
        let speed = Math.min(this.speeds[i] + 1, this.maxSpeed);

        // Step 2: Brake — find distance to next vehicle
        let gap = 1;
        let j = i + 1;
        while (j < this.length && !this.cells[j]) {
          gap++;
          j++;
        }
        if (j === this.length) gap += this.maxSpeed; // open road ahead
        speed = Math.min(speed, gap - 1);

        // Step 3: Random slowdown
        if (Math.random() < this.pSlow) {
          speed = Math.max(0, speed - 1);
        }

        // Step 4: Move
        const nextPos = i + speed;
        if (nextPos >= this.length) {
          this.throughput++; // Vehicle left the road
        } else {
          newCells[nextPos] = true;
          newSpeeds[nextPos] = speed;
        }
      }

      this.cells = newCells;
      this.speeds = newSpeeds;
    }

    getState() {
      return {
        cells: [...this.cells],
        speeds: [...this.speeds],
        throughput: this.throughput,
        vehicleCount: this.cells.filter(Boolean).length
      };
    }
  }

  // ---- Bus Scheduling Model ----

  class BusScheduleModel {
    /**
     * @param {object} config
     * @param {Array<{name:string, x:number, y:number}>} config.stops - bus stops
     */
    constructor(config = {}) {
      this.stops = config.stops || [];
      this.buses = []; // { id, currentStopIndex, nextDepartTime, passengers }
      this._passengerArrivalRate = config.passengerArrivalRate || 1; // per tick per stop
      this._stopQueues = this.stops.map(() => []); // passengers waiting at each stop
      this.totalTransported = 0;
      this.averageWaitTime = 0;
      this._waitTimeSamples = [];
    }

    /**
     * Add a bus to the schedule.
     * @param {number} frequency - ticks between departures
     */
    addBus(id, frequency) {
      this.buses.push({
        id,
        currentStopIndex: 0,
        frequency,
        nextDepartTime: 0,
        passengers: 0,
        enRoute: false,
        arrivalTime: 0
      });
    }

    tick() {
      const now = this._getTickRef(); // uses external tick if set, else internal

      // Generate passengers
      for (let i = 0; i < this.stops.length; i++) {
        const newPassengers = Math.floor(Math.random() * this._passengerArrivalRate * 2);
        for (let p = 0; p < newPassengers; p++) {
          this._stopQueues[i].push({ arrivalTime: now, destination: this._randomDestination(i) });
        }
      }

      // Process buses
      for (const bus of this.buses) {
        // At stop: load/unload passengers
        if (!bus.enRoute && now >= bus.nextDepartTime) {
          const stopIdx = bus.currentStopIndex;
          // Unload passengers destined for this stop
          const atDestination = bus.passengers;

          // Load waiting passengers
          const boarding = this._stopQueues[stopIdx].splice(0, 10); // max 10 per bus
          bus.passengers = boarding.length;

          // Track wait times
          for (const p of boarding) {
            this._waitTimeSamples.push(now - p.arrivalTime);
            this.totalTransported++;
          }

          // Move to next stop
          bus.enRoute = true;
          bus.arrivalTime = now + 3; // 3 ticks travel time

          bus.nextDepartTime = now + Math.max(1, bus.frequency);
        }

        // Arriving at next stop
        if (bus.enRoute && now >= bus.arrivalTime) {
          bus.currentStopIndex = (bus.currentStopIndex + 1) % this.stops.length;
          bus.enRoute = false;
          bus.nextDepartTime = now; // depart immediately on arrival
        }
      }

      // Update average wait time
      if (this._waitTimeSamples.length > 0) {
        this.averageWaitTime = Math.round(
          this._waitTimeSamples.reduce((a, b) => a + b, 0) / this._waitTimeSamples.length
        );
      }
    }

    /**
     * Set a global tick counter reference (for integration with SimulationEngine).
     */
    setTickRef(getter) {
      this._getTickRef = getter;
    }

    _getTickRef() {
      return 0; // override with SimulationEngine tick
    }

    _randomDestination(excludeStop) {
      let dest;
      do {
        dest = Math.floor(Math.random() * this.stops.length);
      } while (dest === excludeStop && this.stops.length > 1);
      return dest;
    }

    reset() {
      this._stopQueues = this.stops.map(() => []);
      this.buses.forEach(b => {
        b.currentStopIndex = 0;
        b.passengers = 0;
        b.nextDepartTime = 0;
        b.enRoute = false;
      });
      this.totalTransported = 0;
      this.averageWaitTime = 0;
      this._waitTimeSamples = [];
    }

    getState() {
      return {
        stops: this.stops.map((stop, i) => ({
          ...stop,
          waiting: this._stopQueues[i].length
        })),
        buses: this.buses.map(b => ({
          id: b.id,
          atStop: this.stops[b.currentStopIndex]?.name || 'depot',
          passengers: b.passengers,
          enRoute: b.enRoute
        })),
        totalTransported: this.totalTransported,
        averageWaitTime: this.averageWaitTime
      };
    }
  }

  // ---- Water Pressure Model (Graph + Dijkstra) ----

  class WaterPressureModel {
    /**
     * @param {object} config
     * @param {Array<{id:string, x:number, y:number, type:'source'|'house'|'junction'}>} config.nodes
     * @param {Array<{from:string, to:string, diameter:number, leaks:boolean}>} config.pipes
     */
    constructor(config = {}) {
      this.nodes = config.nodes || [];
      this.pipes = config.pipes || [];
      this.pressures = {};
      this._buildGraph();
    }

    _buildGraph() {
      this._graph = {};
      for (const node of this.nodes) {
        this._graph[node.id] = [];
      }
      for (const pipe of this.pipes) {
        const weight = pipe.leaks ? 10 : Math.max(1, 10 - pipe.diameter);
        this._graph[pipe.from].push({ to: pipe.to, weight, pipe });
        this._graph[pipe.to].push({ to: pipe.from, weight, pipe }); // bidirectional
      }
    }

    /**
     * Connect two nodes with a pipe (student action).
     */
    addPipe(from, to, diameter = 3, leaks = false) {
      this.pipes.push({ from, to, diameter, leaks });
      this._buildGraph();
    }

    /**
     * Set a pipe as leaking.
     */
    setLeak(from, to, leaking = true) {
      const pipe = this.pipes.find(p =>
        (p.from === from && p.to === to) || (p.from === to && p.to === from)
      );
      if (pipe) {
        pipe.leaks = leaking;
        this._buildGraph();
      }
    }

    tick() {
      // Compute pressures: Dijkstra's from each source
      this.pressures = {};

      for (const node of this.nodes) {
        if (node.type === 'source') {
          this._dijkstra(node.id);
        }
      }

      // For nodes not reachable from any source, pressure = 0
      for (const node of this.nodes) {
        if (!(node.id in this.pressures)) {
          this.pressures[node.id] = 0;
        }
      }
    }

    _dijkstra(sourceId) {
      const dist = { [sourceId]: 100 }; // source has max pressure
      const pq = [{ id: sourceId, dist: 100 }];

      while (pq.length > 0) {
        pq.sort((a, b) => b.dist - a.dist); // max pressure first
        const current = pq.shift();

        for (const edge of this._graph[current.id]) {
          const newPressure = current.dist / edge.weight;
          const existing = dist[edge.to];
          if (existing === undefined || newPressure > existing) {
            dist[edge.to] = newPressure;
            pq.push({ id: edge.to, dist: newPressure });
          }
        }
      }

      // Merge with global pressures (keep max pressure if multiple sources)
      for (const [id, pressure] of Object.entries(dist)) {
        if (!(id in this.pressures) || pressure > this.pressures[id]) {
          this.pressures[id] = pressure;
        }
      }
    }

    reset() {
      this.pressures = {};
    }

    getState() {
      const pressureStatus = {};
      for (const node of this.nodes) {
        const p = this.pressures[node.id] || 0;
        pressureStatus[node.id] = {
          pressure: Math.round(p),
          status: p > 50 ? 'good' : p > 20 ? 'low' : p > 0 ? 'critical' : 'none'
        };
      }
      return {
        nodes: this.nodes.map(n => ({
          ...n,
          pressure: pressureStatus[n.id]?.pressure || 0,
          status: pressureStatus[n.id]?.status || 'none'
        })),
        pipes: this.pipes.map(p => ({
          from: p.from,
          to: p.to,
          leaks: p.leaks,
          diameter: p.diameter
        }))
      };
    }
  }

  // ---- Power Grid Model (Load Balancing) ----

  class PowerGridModel {
    /**
     * @param {object} config
     * @param {Array<{id:string, x:number, y:number, type:'plant'|'building', capacity?:number, demand?:number}>} config.nodes
     * @param {Array<{from:string, to:string, capacity:number}>} config.lines
     */
    constructor(config = {}) {
      this.nodes = config.nodes || [];
      this.lines = config.lines || [];
      this.loads = {}; // nodeId -> current load percentage
      this.blackouts = new Set();
    }

    /**
     * Connect a power line between two nodes (student action).
     */
    connectLine(from, to, capacity = 100) {
      this.lines.push({ from, to, capacity });
    }

    /**
     * Set a building's demand.
     */
    setDemand(nodeId, demand) {
      const node = this.nodes.find(n => n.id === nodeId);
      if (node && node.type === 'building') {
        node.demand = demand;
      }
    }

    tick() {
      // Simple load balancing: sum plant capacities, distribute to connected buildings
      const plantCapacity = {};
      const buildingDemand = {};

      for (const node of this.nodes) {
        if (node.type === 'plant') {
          plantCapacity[node.id] = node.capacity || 100;
        } else if (node.type === 'building') {
          buildingDemand[node.id] = node.demand || 50;
        }
      }

      // Build adjacency
      const connections = {};
      for (const line of this.lines) {
        if (!connections[line.from]) connections[line.from] = [];
        if (!connections[line.to]) connections[line.to] = [];
        connections[line.from].push({ to: line.to, capacity: line.capacity });
        connections[line.to].push({ to: line.from, capacity: line.capacity });
      }

      // BFS from each plant to assign power
      this.loads = {};
      this.blackouts = new Set();
      const served = new Set();

      for (const [plantId, capacity] of Object.entries(plantCapacity)) {
        let remaining = capacity;
        const queue = [plantId];
        const visited = new Set([plantId]);

        while (queue.length > 0 && remaining > 0) {
          const current = queue.shift();

          for (const conn of (connections[current] || [])) {
            if (visited.has(conn.to)) continue;
            visited.add(conn.to);

            if (buildingDemand[conn.to] !== undefined) {
              const demand = buildingDemand[conn.to];
              const allocated = Math.min(demand, remaining);
              this.loads[conn.to] = (this.loads[conn.to] || 0) + allocated;
              served.add(conn.to);
              remaining -= allocated;
            }

            queue.push(conn.to);
          }
        }
      }

      // Check for blackouts
      for (const buildingId of Object.keys(buildingDemand)) {
        const demand = buildingDemand[buildingId];
        const supplied = this.loads[buildingId] || 0;
        if (supplied < demand * 0.5) {
          this.blackouts.add(buildingId);
        }
        this.loads[buildingId] = Math.round((supplied / demand) * 100);
      }
    }

    reset() {
      this.loads = {};
      this.blackouts = new Set();
    }

    getState() {
      return {
        nodes: this.nodes.map(n => ({
          ...n,
          loadPercent: this.loads[n.id] || 0,
          blackout: this.blackouts.has(n.id)
        })),
        blackoutCount: this.blackouts.size
      };
    }
  }

  // ---- Demand Forecasting ----

  class DemandForecast {
    /**
     * @param {number} [windowSize] - moving average window (default 10)
     */
    constructor(windowSize = 10) {
      this._windowSize = windowSize;
      this._history = [];
      this._forecast = 0;
      this._trend = 0;
    }

    /**
     * Add a data point and update forecast.
     */
    addDataPoint(value) {
      this._history.push(value);
      if (this._history.length > this._windowSize * 3) {
        this._history.shift();
      }

      // Simple moving average
      const window = this._history.slice(-this._windowSize);
      this._forecast = window.reduce((a, b) => a + b, 0) / window.length;

      // Linear trend over full history
      if (this._history.length > 1) {
        const n = this._history.length;
        const xMean = (n - 1) / 2;
        const yMean = this._history.reduce((a, b) => a + b, 0) / n;
        let num = 0, den = 0;
        for (let i = 0; i < n; i++) {
          num += (i - xMean) * (this._history[i] - yMean);
          den += (i - xMean) ** 2;
        }
        this._trend = den !== 0 ? num / den : 0;
      }
    }

    /**
     * Predict next value.
     */
    predict() {
      return Math.max(0, this._forecast + this._trend);
    }

    reset() {
      this._history = [];
      this._forecast = 0;
      this._trend = 0;
    }

    getState() {
      return {
        currentAverage: Math.round(this._forecast * 100) / 100,
        trend: this._trend > 0.01 ? 'increasing' : this._trend < -0.01 ? 'decreasing' : 'stable',
        prediction: Math.round(this.predict() * 100) / 100
      };
    }
  }

  return {
    SimulationEngine,
    TrafficModel,
    BusScheduleModel,
    WaterPressureModel,
    PowerGridModel,
    DemandForecast
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SimulationEngine;
}
