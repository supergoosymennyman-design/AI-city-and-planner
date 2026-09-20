import { purposeNameForLanguage } from './building-purposes.js';
/**
 * city-common/catalog.js — shared building catalog for the city planner + 3D template.
 *
 * Two categories:
 *  - "special": the 18 mission buildings (distinctive 3D design + linked minigame).
 *    `questId` maps to hong-kong-real/quests.js QUESTS ids.
 *  - "generic": facility buildings rendered as facade extrusions in the template.
 *
 * The layout JSON stores building entries by their `type` key, so both the 2D
 * planner and the 3D template import this single source of truth.
 */

// Special/mission buildings — map to the 18 quest buildings (quests.js ids).
// footprint = default metres [w, d]; height = default metres (hint for metrics/3D).
export const CATALOG = {
  // ---- special mission buildings (distinctive designs + minigames) ----
  finance_tower:    { name: 'AI Finance Tower',   category: 'special', questId: 1,  color: '#00f2fe', emoji: '🏦', footprint: [24, 24], height: 80 },
  treasury:         { name: 'Smart Treasury',     category: 'special', questId: 2,  color: '#ffd166', emoji: '🪙', footprint: [22, 22], height: 50 },
  sentiment_lab:    { name: 'Public Sentiment Lab', category: 'special', questId: 3, color: '#ff5c7a', emoji: '💬', footprint: [22, 22], height: 45 },
  city_central:     { name: 'AI City Central',    category: 'special', questId: 4,  color: '#00f2fe', emoji: '🏙️', footprint: [28, 28], height: 100 },
  traffic_lab:      { name: 'Traffic Optimization Lab', category: 'special', questId: 5, color: '#3ddc84', emoji: '🚦', footprint: [22, 20], height: 40 },
  traffic_emergency:{ name: 'Traffic & Emergency AI', category: 'special', questId: 6, color: '#ff8c2e', emoji: '🚨', footprint: [24, 22], height: 48 },
  drone_routing:    { name: 'Drone Routing AI',   category: 'special', questId: 7,  color: '#00b7ff', emoji: '🛸', footprint: [24, 24], height: 55 },
  health:           { name: 'Smart Health Monitor', category: 'special', questId: 8, color: '#ff5c7a', emoji: '🏥', footprint: [24, 20], height: 42 },
  bus:              { name: 'AI Bus Scheduler',   category: 'special', questId: 9,  color: '#00f2fe', emoji: '🚌', footprint: [26, 20], height: 38 },
  delivery:         { name: 'Delivery Loop AI',   category: 'special', questId: 10, color: '#3ddc84', emoji: '📦', footprint: [26, 22], height: 44 },
  monitoring:       { name: 'Smart City Monitoring', category: 'special', questId: 11, color: '#ff007f', emoji: '📷', footprint: [22, 20], height: 46 },
  water:            { name: 'Smart Water Supply', category: 'special', questId: 12, color: '#00b7ff', emoji: '💧', footprint: [24, 24], height: 40 },
  power:            { name: 'Smart Power Grid',   category: 'special', questId: 13, color: '#ffd166', emoji: '⚡', footprint: [24, 24], height: 44 },
  recycling:        { name: 'Recycling Lab',      category: 'special', questId: 14, color: '#3ddc84', emoji: '♻️', footprint: [24, 20], height: 36 },
  subsurface:       { name: 'Subsurface AI Scanner', category: 'special', questId: 15, color: '#ff8c2e', emoji: '🔍', footprint: [22, 22], height: 38 },
  robot_grid:       { name: 'Robot Grid Lab',     category: 'special', questId: 16, color: '#c77bff', emoji: '🤖', footprint: [22, 22], height: 40 },
  swarm:            { name: 'Swarm Pathfinder',   category: 'special', questId: 17, color: '#ffd166', emoji: '🐝', footprint: [24, 20], height: 42 },
  atc:              { name: 'Drone Air Traffic Control', category: 'special', questId: 18, color: '#c77bff', emoji: '✈️', footprint: [20, 20], height: 70 },

  // ---- generic facility buildings (facade extrusions in the template) ----
  housing:   { name: 'Housing',   category: 'generic', color: '#8caaba', emoji: '🏠', footprint: [20, 20], height: 24, zone: 'residential' },
  school:    { name: 'School',    category: 'generic', color: '#f5b301', emoji: '🏫', footprint: [26, 24], height: 20, zone: 'civic' },
  hospital:  { name: 'Hospital',  category: 'generic', color: '#ff5c7a', emoji: '🏥', footprint: [30, 26], height: 34, zone: 'civic' },
  shop:      { name: 'Shopping Mall', category: 'generic', color: '#ffb84c', emoji: '🛍️', footprint: [32, 32], height: 26, zone: 'commercial' },
  office:    { name: 'Office',    category: 'generic', color: '#6b8f9e', emoji: '🏢', footprint: [20, 20], height: 40, zone: 'commercial' },
  library:   { name: 'Library',   category: 'generic', color: '#8de2ff', emoji: '📚', footprint: [22, 20], height: 18, zone: 'civic' },
  stadium:   { name: 'Stadium',   category: 'generic', color: '#00ff9d', emoji: '🏟️', footprint: [36, 30], height: 30, zone: 'civic' },
  fire:      { name: 'Fire Station', category: 'generic', color: '#ff2030', emoji: '🚒', footprint: [22, 20], height: 16, zone: 'civic' },
  police:    { name: 'Police Station', category: 'generic', color: '#2d4a75', emoji: '🚓', footprint: [22, 20], height: 18, zone: 'civic' },
};

// Geometry and legacy IDs above remain unchanged; all consumers share purpose names.
for (const type of Object.keys(CATALOG)) {
  if (CATALOG[type].category === 'special') Object.defineProperty(CATALOG[type], 'name', { enumerable: true, get: () => purposeNameForLanguage(type) });
}

/** Stable display order for the planner drawer (special first, then generic). */
export const CATALOG_ORDER = [
  'finance_tower', 'treasury', 'sentiment_lab', 'city_central',
  'traffic_lab', 'traffic_emergency', 'drone_routing', 'health',
  'bus', 'delivery', 'monitoring', 'water', 'power', 'recycling',
  'subsurface', 'robot_grid', 'swarm', 'atc',
  'housing', 'school', 'hospital', 'shop', 'office', 'library',
  'stadium', 'fire', 'police',
];

/** Lookup helper (safe against unknown keys). */
export function catalogType(key) {
  return CATALOG[key] || null;
}

/** True if the type exists and is a special/mission building. */
export function isSpecial(key) {
  const t = CATALOG[key];
  return !!(t && t.category === 'special');
}

/** All special keys, in order. */
export function specialKeys() {
  return CATALOG_ORDER.filter((k) => CATALOG[k] && CATALOG[k].category === 'special');
}
