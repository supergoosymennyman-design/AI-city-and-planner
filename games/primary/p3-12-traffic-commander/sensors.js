/* =========================================================================
   sensors.js — inductive loop sensor helpers.
   Turns raw fill levels into bar-graph zones/colours, computes the load
   prediction line (Level 2), and describes metal-mass readings. Rendering
   and game logic both consult this module so colour thresholds stay in one place.
   ========================================================================= */
const Sensors = (() => {
  'use strict';

  /* Bar colour zones by fill %:
     0-40 green, 40-70 amber, 70-85 orange, 85-100 red, >=100 overflow pulse. */
  const ZONES = [
    { max: 40,  name: 'green',    color: '#2ECC71' },
    { max: 70,  name: 'amber',    color: '#F39C12' },
    { max: 85,  name: 'orange',   color: '#E67E22' },
    { max: 100, name: 'red',      color: '#E74C3C' },
    { max: Infinity, name: 'overflow', color: '#C0392B' }
  ];

  function zone(fill) {
    for (const z of ZONES) if (fill < z.max) return z;
    return ZONES[ZONES.length - 1];
  }
  function zoneColor(fill) { return zone(fill).color; }
  function zoneName(fill) { return zone(fill).name; }

  /* Is this fill in the "flush now" red band? */
  function isRed(fill) { return fill >= 80; }

  /* Project fill `seconds` into the future given current rate (Level 2). */
  function predict(lane, seconds) {
    if (lane.cap != null) return Math.min(lane.cap, lane.fill);
    return Math.min(120, lane.fill + lane.fillRate * seconds);
  }

  /* Seconds until this lane reaches 100% at its current rate (Infinity if flat). */
  function overflowSeconds(lane) {
    if (lane.cap != null || lane.fillRate <= 0 || lane.vehicles.length === 0) return Infinity;
    return Math.max(0, (100 - lane.fill) / lane.fillRate);
  }

  /* Describe a metal-mass reading (for Flux dialogue / labels). */
  function metalReading(mass) {
    if (mass < 0.05) return { label: 'negligible', strong: false };
    if (mass < 0.2)  return { label: 'weak', strong: false };
    if (mass < 0.5)  return { label: 'medium', strong: false };
    return { label: 'strong', strong: true };
  }

  /* Glow colour for a sensor based on its glow intensity (0..1). */
  function glowColor(intensity) {
    // amber -> bright yellow-white as it strengthens
    const g = Math.round(160 + 95 * intensity);
    const r = 243;
    const b = Math.round(18 + 60 * intensity);
    return `rgba(${r},${g},${b},${0.25 + 0.7 * intensity})`;
  }

  return { ZONES, zone, zoneColor, zoneName, isRed, predict, overflowSeconds, metalReading, glowColor };
})();
