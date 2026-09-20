/* ============================================================
   classifier.js — Transparent In-Browser AI Classifier
   Subsurface Signal Decoder v2 (P3, Age 8)

   This is the "AI" the kid trains — a simple, visible algorithm.
   Pure functions, fully unit-testable. No black boxes.

   Concepts:
   - learnThreshold: supervised learning from labeled samples
   - classify: amplitude ≥ T → Hazard
   - confidence: sigmoid distance from T → 0-100%
   - sensitivityThreshold: shift T by sensitivity setting
   - fuseVotes: ≥2 of 3 sensors agree → confirmed
   ============================================================ */

const Classifier = (() => {
  'use strict';

  const SIGMOID_SCALE = 15; // Controls steepness of confidence curve

  /**
   * Learn a threshold T from labeled samples.
   * @param {Array} labels - [{amplitude: Number, label: 'safe'|'hazard'}, ...]
   * @returns {Object} {T: Number, safeMax: Number, hazardMin: Number, overlap: Boolean, trained: Boolean}
   */
  function learnThreshold(labels) {
    if (!labels || labels.length === 0) {
      return { T: 50, safeMax: null, hazardMin: null, overlap: false, trained: false };
    }

    const safeAmps = labels
      .filter(l => l.label === 'safe')
      .map(l => l.amplitude)
      .sort((a, b) => a - b);

    const hazardAmps = labels
      .filter(l => l.label === 'hazard')
      .map(l => l.amplitude)
      .sort((a, b) => a - b);

    const safeMax = safeAmps.length > 0 ? safeAmps[safeAmps.length - 1] : null;
    const hazardMin = hazardAmps.length > 0 ? hazardAmps[0] : null;

    let T, overlap = false;

    if (safeAmps.length > 0 && hazardAmps.length > 0) {
      // Both classes present — midpoint between highest safe and lowest hazard
      T = (safeMax + hazardMin) / 2;
      overlap = safeMax > hazardMin; // Kid labeled inconsistently
    } else if (safeAmps.length > 0) {
      // Only safe samples — set T above the highest safe
      T = safeMax + 12;
    } else if (hazardAmps.length > 0) {
      // Only hazard samples — set T below the lowest hazard
      T = Math.max(0, hazardMin - 12);
    } else {
      T = 50;
    }

    return {
      T: Math.round(T * 100) / 100,
      safeMax,
      hazardMin,
      overlap,
      trained: safeAmps.length > 0 && hazardAmps.length > 0,
      safeCount: safeAmps.length,
      hazardCount: hazardAmps.length
    };
  }

  /**
   * Classify a single amplitude against threshold T.
   * @param {Number} amplitude - 0-100
   * @param {Number} T - threshold
   * @returns {String} 'hazard' | 'safe'
   */
  function classify(amplitude, T) {
    return amplitude >= T ? 'hazard' : 'safe';
  }

  /**
   * Compute confidence as sigmoid distance from T.
   * Far above T → ~100% hazard. Far below T → ~100% safe. Near T → ~50%.
   * @param {Number} amplitude - 0-100
   * @param {Number} T - threshold
   * @param {Number} scale - sigmoid steepness (default SIGMOID_SCALE)
   * @returns {Number} confidence percentage 0-100
   */
  function confidence(amplitude, T, scale) {
    scale = scale || SIGMOID_SCALE;
    const z = (amplitude - T) / scale;
    const sig = 1 / (1 + Math.exp(-z));
    return Math.round(sig * 100);
  }

  /**
   * Shift threshold based on sensitivity setting (1-9).
   * sensitivity 5 = no shift. Higher = lower T (flags more). Lower = higher T (flags less).
   * @param {Number} T - base threshold
   * @param {Number} sensitivity - 1-9 (default 5)
   * @param {Number} step - per-step shift (default 6)
   * @returns {Number} effective threshold
   */
  function sensitivityThreshold(T, sensitivity, step) {
    sensitivity = Math.max(1, Math.min(9, sensitivity || 5));
    step = step || 6;
    return T - (sensitivity - 5) * step;
  }

  /**
   * Fuse votes from multiple sensors.
   * @param {Array} votes - [{sensorId: String, vote: Boolean}, ...]
   * @returns {Object} {agreeCount: Number, total: Number, confirmed: Boolean, votes: Array}
   */
  function fuseVotes(votes) {
    if (!votes || votes.length === 0) {
      return { agreeCount: 0, total: 0, confirmed: false, votes: [] };
    }
    const hazardVotes = votes.filter(v => v.vote === true);
    const agreeCount = hazardVotes.length;
    const total = votes.length;
    const confirmed = agreeCount >= 2;
    return {
      agreeCount,
      total,
      confirmed,
      votes: votes.map(v => ({ ...v }))
    };
  }

  /**
   * Compute per-sensor vote for a cell.
   * @param {Number} amplitude - sensor reading
   * @param {Number} sensorT - sensor-specific threshold
   * @returns {Boolean} true if amplitude >= sensorT
   */
  function sensorVote(amplitude, sensorT) {
    return amplitude >= sensorT;
  }

  // ── Public API ──
  return {
    learnThreshold,
    classify,
    confidence,
    sensitivityThreshold,
    fuseVotes,
    sensorVote,
    SIGMOID_SCALE
  };
})();
