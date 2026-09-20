/* ============================================================
   sensors.js — Multi-Sensor Signal Generators
   Subsurface Signal Decoder v2 (P3, Age 8)

   Generates per-cell per-sensor signal amplitudes with:
   - Per-sensor noise profiles
   - Stealthy hazard rules (some hazards invisible to one sensor)
   - Level-specific configurations

   Three sensor channels:
   - Seismic: vibration-based, good for voids/pockets
   - GPR: Ground-Penetrating Radar, good for pipes/cables
   - EM: Electromagnetic, good for metallic objects
   ============================================================ */

const Sensors = (() => {
  'use strict';

  /**
   * Sensor profile definitions.
   * Each sensor has: base noise level, noise type, what it detects well/poorly.
   */
  const SENSOR_PROFILES = {
    seismic: {
      id: 'seismic',
      name: 'Seismic',
      icon: '〰',
      color: '#39FF14',  // green
      baseNoise: 8,
      noiseType: 'random',
      goodAt: ['void', 'cavity', 'loose_soil'],
      poorAt: ['plastic_pipe']
    },
    gpr: {
      id: 'gpr',
      name: 'GPR',
      icon: '↕',
      color: '#00FFFF',  // cyan
      baseNoise: 6,
      noiseType: 'layered',
      goodAt: ['pipe', 'cable', 'plastic_pipe'],
      poorAt: ['deep_void']
    },
    em: {
      id: 'em',
      name: 'EM',
      icon: '◎',
      color: '#FF6B35',  // orange
      baseNoise: 7,
      noiseType: 'random',
      goodAt: ['metal_pipe', 'cable', 'power_line'],
      poorAt: ['plastic_pipe', 'void']
    }
  };

  /**
   * Hazard archetypes for sensor fusion levels.
   * Each hazard type is detectable by certain sensors and stealthy to others.
   */
  const HAZARD_TYPES = {
    pipe: {
      name: 'Water Pipe',
      detectable: ['seismic', 'gpr'],
      stealthyTo: ['em'],
      baseAmplitude: { seismic: 85, gpr: 90, em: 30 }
    },
    plastic_pipe: {
      name: 'Plastic Pipe',
      detectable: ['gpr', 'em'],
      stealthyTo: ['seismic'],
      baseAmplitude: { seismic: 22, gpr: 82, em: 78 }
    },
    void: {
      name: 'Underground Cavity',
      detectable: ['seismic', 'em'],
      stealthyTo: ['gpr'],
      baseAmplitude: { seismic: 90, gpr: 28, em: 85 }
    },
    cable: {
      name: 'Power Cable',
      detectable: ['gpr', 'em'],
      stealthyTo: ['seismic'],
      baseAmplitude: { seismic: 24, gpr: 85, em: 92 }
    },
    mixed: {
      name: 'Mixed Debris',
      detectable: ['seismic', 'gpr', 'em'],
      stealthyTo: [],
      baseAmplitude: { seismic: 78, gpr: 82, em: 75 }
    },
    edge: {
      name: 'Shallow Anomaly',
      detectable: ['seismic', 'gpr', 'em'],
      stealthyTo: [],
      baseAmplitude: { seismic: 50, gpr: 55, em: 48 }
    }
  };

  /**
   * Level-specific sensor configuration.
   */
  const LEVEL_SENSOR_CONFIG = {
    4: {
      sensors: ['seismic', 'gpr', 'em'],
      useFusion: true,
      useStealthy: true,
      thresholds: { seismic: 42, gpr: 40, em: 38 }
    },
    5: {
      sensors: ['seismic', 'gpr', 'em'],
      useFusion: true,
      useStealthy: true,
      thresholds: { seismic: 42, gpr: 40, em: 38 }
    }
  };

  /**
   * Generate noise value for a given sensor at a given cell position.
   * Noise is deterministic-per-cell (seeded by row+col) but appears random.
   */
  function seededRandom(seed) {
    let s = seed;
    return function() {
      s = (s * 1664525 + 1013904223) & 0x7fffffff;
      return (s & 0xffff) / 0x10000;
    };
  }

  /**
   * Generate amplitude for one sensor at one cell.
   * @param {String} sensorId - 'seismic'|'gpr'|'em'
   * @param {Number} row - cell row
   * @param {Number} col - cell col
   * @param {Boolean} isHazard - whether this cell is a hazard
   * @param {String} hazardType - hazard archetype key (if hazard)
   * @param {Object} config - level sensor config
   * @returns {Number} amplitude 0-100
   */
  function sensorAmplitude(sensorId, row, col, isHazard, hazardType, config, isNoisySafe) {
    const profile = SENSOR_PROFILES[sensorId];
    if (!profile) return 20;

    const rand = seededRandom(row * 100 + col * 7 + sensorId.charCodeAt(0) * 13);
    const noiseAmp = profile.baseNoise * (1 + (config.noiseMultiplier || 1) * 0.5);

    if (!isHazard) {
      if (isNoisySafe) {
        // Noisy safe cell: elevated readings that look like hazards → tricks Nova
        return Math.max(0, Math.min(100, 30 + rand() * (noiseAmp * 0.8)));
      }
      // Safe cell: baseline ~10-18 + noise (kept low so Nova easily classifies as safe)
      return Math.max(0, Math.min(100, 12 + rand() * (noiseAmp * 0.6)));
    }

    // Hazard cell — check if stealthy to this sensor
    const hazard = HAZARD_TYPES[hazardType] || HAZARD_TYPES.mixed;
    const isStealthy = hazard.stealthyTo && hazard.stealthyTo.includes(sensorId);

    if (isStealthy) {
      // Stealthy: amplitude stays near baseline (~20-30), looks like safe cell
      return Math.max(0, Math.min(100, 20 + rand() * (noiseAmp * 0.6)));
    }

    // Detectable: amplitude is elevated
    const base = hazard.baseAmplitude[sensorId] || 55;
    // Add some noise around the base amplitude
    const variation = (rand() - 0.5) * noiseAmp * 0.8;
    return Math.max(0, Math.min(100, base + variation));
  }

  /**
   * Generate all sensor amplitudes for a cell.
   * @param {Object} cell - {row, col}
   * @param {Object} levelConfig - level configuration with sensor info
   * @param {Boolean} isHazard
   * @param {String} hazardType
   * @returns {Object} {seismic: Number, gpr: Number, em: Number, hazardType: String}
   */
  function cellSignals(cell, levelConfig, isHazard, hazardType, isNoisySafe) {
    const sensors = levelConfig.sensors || ['seismic', 'gpr', 'em'];
    const result = {};

    sensors.forEach(sensorId => {
      result[sensorId] = Math.round(
        sensorAmplitude(sensorId, cell.row, cell.col, isHazard, hazardType, levelConfig, isNoisySafe)
      );
    });

    result.hazardType = hazardType || null;

    // Attach sensor labels for display
    result._sensors = sensors;

    return result;
  }

  /**
   * Generate grid-wide cell data for a sensor-fusion level.
   * @param {Number} rows
   * @param {Number} cols
   * @param {Array} hazards - [{row, col, type}, ...]
   * @param {Object} config - level sensor config
   * @returns {Object} cellData[row][col] = signal object
   */
  function generateGrid(rows, cols, hazards, config) {
    const grid = [];
    const hazardMap = {};
    hazards.forEach(h => {
      hazardMap[`${h.row},${h.col}`] = h.type || 'mixed';
    });

    // Build set of noisy safe cells (elevated readings that trick Nova)
    const noisySafe = new Set();
    if (config._noisySafeCells) {
      config._noisySafeCells.forEach(c => noisySafe.add(`${c.row},${c.col}`));
    }

    for (let r = 0; r < rows; r++) {
      grid[r] = [];
      for (let c = 0; c < cols; c++) {
        const key = `${r},${c}`;
        const hType = hazardMap[key];
        const isHazard = !!hType;
        const isNoisySafe = noisySafe.has(key);
        grid[r][c] = cellSignals({ row: r, col: c }, config, isHazard, hType || null, isNoisySafe);
      }
    }
    return grid;
  }

  /**
   * Get per-sensor thresholds for a level.
   * @param {Number} levelNum
   * @returns {Object} {seismic: N, gpr: N, em: N}
   */
  function getSensorThresholds(levelNum) {
    const config = LEVEL_SENSOR_CONFIG[levelNum];
    if (!config || !config.thresholds) {
      return { seismic: 42, gpr: 40, em: 38 };
    }
    return { ...config.thresholds };
  }

  /**
   * Get sensor profile info.
   */
  function getSensorProfile(sensorId) {
    return SENSOR_PROFILES[sensorId] || null;
  }

  /**
   * Get all sensor IDs for a level.
   */
  function getLevelSensors(levelNum) {
    const config = LEVEL_SENSOR_CONFIG[levelNum];
    return config ? [...config.sensors] : ['seismic', 'gpr', 'em'];
  }

  /**
   * Get level sensor config.
   */
  function getLevelSensorConfig(levelNum) {
    return LEVEL_SENSOR_CONFIG[levelNum] || null;
  }

  /**
   * Get hazard type names.
   */
  function getHazardTypeName(type) {
    const h = HAZARD_TYPES[type];
    return h ? h.name : 'Unknown Hazard';
  }

  // ── Public API ──
  return {
    SENSOR_PROFILES,
    HAZARD_TYPES,
    LEVEL_SENSOR_CONFIG,
    sensorAmplitude,
    cellSignals,
    generateGrid,
    getSensorThresholds,
    getSensorProfile,
    getLevelSensors,
    getLevelSensorConfig,
    getHazardTypeName,
    seededRandom
  };
})();
