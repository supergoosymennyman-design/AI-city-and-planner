/**
 * city-common/road-templates.js — pre-built road networks for the planner.
 *
 * Students who don't want to draw roads freeform (it can look messy) can start
 * from one of these. Each template is roads-only (plus maybe a central park) —
 * placing the buildings stays the student's job. The networks are hand-shaped
 * to be *good starting points*: connected, in-bounds, with enough structure
 * for a sensible city, and labelled with which mayor-mode they suit.
 *
 * Layout schema matches the planner: roads = [{points:[[x,y],…], width, class}],
 * parks = [{cx, cz, radius}], in a DEFAULT_SCALE (2000m) plan.
 */

export const ROAD_TEMPLATES = [
  {
    id: 'grid',
    name: 'City Grid',
    emoji: '🏙️',
    note: 'Simple blocks on a tidy grid — a clean start for any mayor.',
    goodFor: 'any mayor',
    roads: [
      { points: [[150, 500], [1850, 500]], width: 14, class: 'primary' },
      { points: [[150, 1000], [1850, 1000]], width: 14, class: 'primary' },
      { points: [[150, 1500], [1850, 1500]], width: 14, class: 'primary' },
      { points: [[500, 150], [500, 1850]], width: 14, class: 'primary' },
      { points: [[1000, 150], [1000, 1850]], width: 14, class: 'primary' },
      { points: [[1500, 150], [1500, 1850]], width: 14, class: 'primary' },
      { points: [[150, 750], [1850, 750]], width: 10, class: 'secondary' },
      { points: [[150, 1250], [1850, 1250]], width: 10, class: 'secondary' },
    ],
    parks: [{ cx: 1000, cz: 1000, radius: 70 }],
  },
  {
    id: 'radial',
    name: 'Radial Ring',
    emoji: '🌐',
    note: 'A ring with spokes — everything is close to the centre.',
    goodFor: 'the Busy Mayor',
    roads: [
      ringRoad(1000, 1000, 380, 24, 12, 'primary'),
      { points: [[1000, 1000], [1000, 160]], width: 10, class: 'secondary' },
      { points: [[1000, 1000], [1000, 1840]], width: 10, class: 'secondary' },
      { points: [[1000, 1000], [160, 1000]], width: 10, class: 'secondary' },
      { points: [[1000, 1000], [1840, 1000]], width: 10, class: 'secondary' },
      { points: [[1000, 1000], [406, 406]], width: 10, class: 'secondary' },
      { points: [[1000, 1000], [1594, 1594]], width: 10, class: 'secondary' },
      { points: [[1000, 1000], [406, 1594]], width: 10, class: 'secondary' },
      { points: [[1000, 1000], [1594, 406]], width: 10, class: 'secondary' },
    ],
    parks: [{ cx: 1000, cz: 1000, radius: 55 }],
  },
  {
    id: 'superblocks',
    name: 'Superblocks',
    emoji: '🟩',
    note: 'Big quiet blocks with small inner streets — homes can live away from traffic.',
    goodFor: 'the Quiet Mayor',
    roads: [
      // Three big avenues each way.
      { points: [[150, 350], [1850, 350]], width: 14, class: 'primary' },
      { points: [[150, 1000], [1850, 1000]], width: 14, class: 'primary' },
      { points: [[150, 1650], [1850, 1650]], width: 14, class: 'primary' },
      { points: [[350, 150], [350, 1850]], width: 14, class: 'primary' },
      { points: [[1000, 150], [1000, 1850]], width: 14, class: 'primary' },
      { points: [[1650, 150], [1650, 1850]], width: 14, class: 'primary' },
      // Quiet secondary streets inside each superblock.
      { points: [[600, 350], [600, 1650]], width: 9, class: 'tertiary' },
      { points: [[1400, 350], [1400, 1650]], width: 9, class: 'tertiary' },
      { points: [[350, 600], [1650, 600]], width: 9, class: 'tertiary' },
      { points: [[350, 1400], [1650, 1400]], width: 9, class: 'tertiary' },
    ],
    parks: [
      { cx: 1000, cz: 1000, radius: 80 },
      { cx: 1000, cz: 350, radius: 40 },
      { cx: 1000, cz: 1650, radius: 40 },
    ],
  },
  {
    id: 'culdesacs',
    name: 'Cul-de-sacs',
    emoji: '🏘️',
    note: 'A main avenue with loops — cosy, quiet little neighbourhoods.',
    goodFor: 'the Quiet Mayor',
    roads: [
      // The main avenue.
      { points: [[150, 1000], [1850, 1000]], width: 14, class: 'primary' },
      { points: [[1000, 1000], [1000, 180]], width: 10, class: 'secondary' },
      { points: [[1000, 1000], [1000, 1820]], width: 10, class: 'secondary' },
      // Cul-de-sac loops (closed rings) branching off the avenue.
      loopRoad(500, 700, 110, 10, 'secondary'),
      loopRoad(500, 1300, 110, 10, 'secondary'),
      loopRoad(1500, 700, 110, 10, 'secondary'),
      loopRoad(1500, 1300, 110, 10, 'secondary'),
    ],
    parks: [
      { cx: 500, cz: 700, radius: 45 },
      { cx: 1500, cz: 1300, radius: 45 },
    ],
  },
  {
    id: 'twincenters',
    name: 'Twin Centres',
    emoji: '🌆',
    note: 'Two busy hubs joined by one big avenue — compare the two halves!',
    goodFor: 'the Healthy Mayor',
    roads: [
      // The connecting avenue.
      { points: [[150, 1000], [1850, 1000]], width: 16, class: 'primary' },
      // West centre grid.
      { points: [[150, 600], [800, 600]], width: 11, class: 'secondary' },
      { points: [[150, 1400], [800, 1400]], width: 11, class: 'secondary' },
      { points: [[350, 150], [350, 1850]], width: 11, class: 'secondary' },
      { points: [[650, 150], [650, 1850]], width: 11, class: 'secondary' },
      // East centre grid.
      { points: [[1200, 600], [1850, 600]], width: 11, class: 'secondary' },
      { points: [[1200, 1400], [1850, 1400]], width: 11, class: 'secondary' },
      { points: [[1350, 150], [1350, 1850]], width: 11, class: 'secondary' },
      { points: [[1650, 150], [1650, 1850]], width: 11, class: 'secondary' },
    ],
    parks: [
      { cx: 500, cz: 1000, radius: 55 },
      { cx: 1500, cz: 1000, radius: 55 },
    ],
  },
  {
    id: 'rivercity',
    name: 'River City',
    emoji: '🌉',
    note: 'Two banks of a river with bridges — get the crossings right!',
    goodFor: 'the Walkable Mayor',
    roads: [
      // North bank.
      { points: [[150, 500], [1850, 500]], width: 14, class: 'primary' },
      { points: [[500, 150], [500, 700]], width: 10, class: 'secondary' },
      { points: [[1000, 150], [1000, 700]], width: 10, class: 'secondary' },
      { points: [[1500, 150], [1500, 700]], width: 10, class: 'secondary' },
      // South bank.
      { points: [[150, 1500], [1850, 1500]], width: 14, class: 'primary' },
      { points: [[500, 1300], [500, 1850]], width: 10, class: 'secondary' },
      { points: [[1000, 1300], [1000, 1850]], width: 10, class: 'secondary' },
      { points: [[1500, 1300], [1500, 1850]], width: 10, class: 'secondary' },
      // Bridges across the river (700 → 1300).
      { points: [[500, 700], [500, 1300]], width: 10, class: 'secondary' },
      { points: [[1000, 700], [1000, 1300]], width: 10, class: 'secondary' },
      { points: [[1500, 700], [1500, 1300]], width: 10, class: 'secondary' },
    ],
    parks: [
      { cx: 1000, cz: 850, radius: 50 },
      { cx: 300, cz: 1600, radius: 50 },
    ],
  },
  {
    id: 'coastal',
    name: 'Coastal City',
    emoji: '🏖️',
    note: 'Buildings hug a curving coastline — land is precious, use it well.',
    goodFor: 'the Green Mayor',
    roads: [
      // The coastal boulevard hugs the south-east curve.
      coastalRoad(),
      // An inner grid on the "land" side.
      { points: [[150, 400], [1500, 400]], width: 11, class: 'secondary' },
      { points: [[150, 900], [1500, 900]], width: 11, class: 'secondary' },
      { points: [[150, 1400], [1100, 1400]], width: 11, class: 'secondary' },
      { points: [[500, 150], [500, 1800]], width: 11, class: 'secondary' },
      { points: [[1000, 150], [1000, 1800]], width: 11, class: 'secondary' },
      // Link the grid to the boulevard.
      { points: [[1500, 400], [1900, 650]], width: 10, class: 'secondary' },
      { points: [[1500, 900], [1750, 1150]], width: 10, class: 'secondary' },
      { points: [[1100, 1400], [1350, 1600]], width: 10, class: 'secondary' },
    ],
    parks: [
      { cx: 1750, cz: 1650, radius: 70 },
      { cx: 300, cz: 1700, radius: 60 },
    ],
  },
  {
    id: 'diagonal',
    name: 'Diagonal Boulevard',
    emoji: '🛣️',
    note: 'A fast diagonal cuts across the grid — a challenge for tricky plots.',
    goodFor: 'the Busy Mayor',
    roads: [
      // Classic grid.
      { points: [[150, 500], [1850, 500]], width: 12, class: 'primary' },
      { points: [[150, 1000], [1850, 1000]], width: 12, class: 'primary' },
      { points: [[150, 1500], [1850, 1500]], width: 12, class: 'primary' },
      { points: [[500, 150], [500, 1850]], width: 12, class: 'primary' },
      { points: [[1000, 150], [1000, 1850]], width: 12, class: 'primary' },
      { points: [[1500, 150], [1500, 1850]], width: 12, class: 'primary' },
      // The diagonal boulevard.
      { points: [[120, 120], [1880, 1880]], width: 16, class: 'primary' },
      { points: [[120, 1880], [1880, 120]], width: 14, class: 'primary' },
    ],
    parks: [{ cx: 1000, cz: 1000, radius: 60 }],
  },
];

/** Build a closed-ring polyline around (cx,cz). */
function ringRoad(cx, cz, r, n, width, cls) {
  const points = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    points.push([Math.round(cx + Math.cos(a) * r), Math.round(cz + Math.sin(a) * r)]);
  }
  return { points, width, class: cls };
}

/** Build a cul-de-sac loop (closed circle) for the cosy template. */
function loopRoad(cx, cz, r, width, cls) {
  return ringRoad(cx, cz, r, 18, width, cls);
}

/** The curving coastal boulevard for the Coastal City template. */
function coastalRoad() {
  const pts = [];
  const n = 26;
  for (let i = 0; i <= n; i++) {
    const t = i / n;                        // 0 → 1 along the curve
    const x = 120 + t * 1880;
    const z = 800 + Math.sin(t * Math.PI * 2.2) * 260 + t * 900;   // gentle wave
    pts.push([Math.round(x), Math.round(z)]);
  }
  return { points: pts, width: 14, class: 'primary' };
}

/** Look up a template by id (safe against unknown ids). */
export function getRoadTemplate(id) {
  return ROAD_TEMPLATES.find((t) => t.id === id) || null;
}
