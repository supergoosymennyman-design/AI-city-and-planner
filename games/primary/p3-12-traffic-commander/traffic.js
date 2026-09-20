/* =========================================================================
   traffic.js — traffic simulation engine.
   Models lanes, vehicles, inductive-loop fill levels and overflow. It is
   deliberately generic: game.js drives level-specific spawning and win
   conditions; this module just advances physics and reports overflow events.
   ========================================================================= */
const Traffic = (() => {
  'use strict';

  /* Vehicle catalogue. `mass` = relative metal mass (drives sensor strength).
     `cap` (optional) = maximum bar fill % a lone vehicle of this type produces
     on the loop — used to model weak signals (bike/motorcycle/pedestrian). */
  const VEHICLES = {
    pedestrian: { mass: 0.02, cap: 5,  color: '#ECF0F1', w: 0.16, label: 'person' },
    bike:       { mass: 0.10, cap: 10, color: '#2ECC71', w: 0.22, label: 'bike' },
    motorcycle: { mass: 0.30, cap: 30, color: '#E67E22', w: 0.26, label: 'motorcycle' },
    sedan:      { mass: 1.00, cap: null, color: '#3498DB', w: 0.60, label: 'sedan' },
    car:        { mass: 1.00, cap: null, color: '#5DADE2', w: 0.60, label: 'car' },
    van:        { mass: 1.30, cap: null, color: '#1ABC9C', w: 0.68, label: 'van' },
    truck:      { mass: 1.60, cap: null, color: '#F1C40F', w: 0.80, label: 'truck' }
  };

  const GREEN_MS = 900;        // duration light stays green after a flush
  const OVERFLOW_GRACE = 2.4;  // seconds a lane may sit at 100% before gridlock

  let vidCounter = 0;

  function makeLane(id) {
    return {
      id,
      fill: 0,
      fillRate: 0,          // %/sec
      cap: null,            // weak-signal ceiling (null = uncapped)
      vehicles: [],
      light: 'red',         // 'red' | 'green'
      greenTimer: 0,        // ms remaining green
      glow: 0,              // 0..1 sensor glow
      overflowTimer: 0,     // seconds spent at >=100%
      overflowed: false
    };
  }

  const sim = {
    lanes: [],
    laneCount: 1,

    reset(laneCount) {
      this.laneCount = laneCount;
      this.lanes = [];
      const ids = ['A', 'B', 'C', 'D'];
      for (let i = 0; i < laneCount; i++) this.lanes.push(makeLane(laneCount === 1 ? '·' : ids[i]));
      return this.lanes;
    },

    lane(idOrIndex) {
      if (typeof idOrIndex === 'number') return this.lanes[idOrIndex];
      return this.lanes.find((l) => l.id === idOrIndex);
    },

    /* Set fill rate / cap for a lane. */
    configLane(index, { fillRate, cap = null, fill } = {}) {
      const lane = this.lanes[index];
      if (!lane) return;
      if (fillRate != null) lane.fillRate = fillRate;
      if (cap !== undefined) lane.cap = cap;
      if (fill != null) lane.fill = fill;
    },

    /* Add a vehicle to a lane; it animates in and queues behind others. */
    addVehicle(index, type) {
      const lane = this.lanes[index];
      const def = VEHICLES[type] || VEHICLES.car;
      const queueIndex = lane.vehicles.length;
      lane.vehicles.push({
        id: ++vidCounter,
        type,
        mass: def.mass,
        color: def.color,
        w: def.w,
        y: 1.15,                                   // enters from bottom of road strip
        targetY: 0.06 + queueIndex * 0.135         // stacks up toward the stop line
      });
      return def;
    },

    /* Flush a lane: capture score, go green, reset fill, drive vehicles off. */
    flush(index) {
      const lane = this.lanes[index];
      if (!lane) return null;
      const scored = lane.fill;
      const hadVehicles = lane.vehicles.length;
      const strongest = lane.vehicles.reduce((m, v) => Math.max(m, v.mass), 0);
      lane.light = 'green';
      lane.greenTimer = GREEN_MS;
      lane.fill = 0;
      lane.overflowTimer = 0;
      lane.driveOff = true;
      return { fill: scored, hadVehicles, strongest, capped: lane.cap != null };
    },

    /* Advance the simulation by dt seconds. Returns list of newly-overflowed ids. */
    update(dt) {
      const newOverflows = [];
      for (const lane of this.lanes) {
        // Green phase: cars drive away, then clear.
        if (lane.greenTimer > 0) {
          lane.greenTimer -= dt * 1000;
          for (const v of lane.vehicles) v.y -= dt * 2.2;   // drive through junction
          if (lane.greenTimer <= 0) {
            lane.greenTimer = 0;
            lane.light = 'red';
            lane.driveOff = false;
            lane.vehicles = [];
          }
        }

        // Fill rises while red and vehicles are queued (respecting weak-signal cap).
        if (lane.light === 'red' && lane.vehicles.length > 0 && !lane.overflowed) {
          const ceiling = lane.cap != null ? lane.cap : 105;   // allow slight overshoot past 100
          lane.fill = Math.min(ceiling, lane.fill + lane.fillRate * dt);
        }

        // Overflow tracking (only for uncapped, genuinely full lanes).
        if (lane.fill >= 100 && lane.cap == null && lane.light === 'red') {
          lane.overflowTimer += dt;
          if (lane.overflowTimer >= OVERFLOW_GRACE && !lane.overflowed) {
            lane.overflowed = true;
            newOverflows.push(lane.id);
          }
        } else if (lane.fill < 100) {
          lane.overflowTimer = 0;
        }

        // Animate vehicles toward their queue slots.
        for (const v of lane.vehicles) {
          if (!lane.driveOff) v.y += (v.targetY - v.y) * Math.min(1, dt * 6);
        }

        // Sensor glow eases toward strongest-vehicle strength.
        const maxMass = lane.vehicles.reduce((m, v) => Math.max(m, v.mass), 0);
        const targetGlow = lane.vehicles.length ? Math.min(1, 0.15 + maxMass * 0.6) : 0;
        lane.glow += (targetGlow - lane.glow) * Math.min(1, dt * 4);
      }
      return newOverflows;
    },

    /* Index of the lane with the highest fill (ties -> first). */
    highestIndex() {
      let bi = 0, bv = -1;
      this.lanes.forEach((l, i) => { if (l.fill > bv) { bv = l.fill; bi = i; } });
      return bi;
    },

    clearOverflow() { this.lanes.forEach((l) => { l.overflowed = false; l.overflowTimer = 0; }); }
  };

  return { sim, VEHICLES, GREEN_MS, OVERFLOW_GRACE };
})();
