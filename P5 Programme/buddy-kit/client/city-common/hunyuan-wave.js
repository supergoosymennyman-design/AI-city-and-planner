// Hunyuan presentation variants never change a student's layout or Champion
// File. Stable coordinate ranks mean reloads, imports and reordered arrays
// always paint the same city the same way.
export const HUNYUAN_IDS = Object.freeze({
  sunstack: 'bld_passiona_sunstack',
  beacon: 'bld_passiona_beacon',
  jadeCourt: 'bld_passiona_jade_court',
  harbourSteps: 'bld_passiona_harbour_steps',
  lanternWalkUp: 'bld_passiona_lantern_walk_up',
  bambooMarket: 'bld_passiona_bamboo_market',
  skygardenLearning: 'bld_passiona_skygarden_learning',
  emeraldRainTree: 'nat_passiona_emerald_rain_tree',
});

export const WAVE_2_RESIDENTIAL_IDS = Object.freeze([
  HUNYUAN_IDS.jadeCourt, HUNYUAN_IDS.harbourSteps, HUNYUAN_IDS.lanternWalkUp,
]);

export const EMERALD_RAIN_TREE_CANOPY_METRES = 12;
export const EMERALD_RAIN_TREE_CLEAR_RADIUS = 4; // 8 m diameter base zone

function number(value) { return Number.isFinite(Number(value)) ? Number(value) : 0; }
export function coordinateKey(value) {
  const pos = value?.pos || value || [];
  const x = number(pos.x ?? pos[0] ?? value?.x);
  const z = number(pos.z ?? pos[1] ?? value?.z);
  return `${x.toFixed(3)}|${z.toFixed(3)}`;
}
function hash(value) {
  let h = 2166136261;
  for (const char of String(value)) { h ^= char.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rankedLots(buildings, types, salt) {
  const allowed = new Set(Array.isArray(types) ? types : [types]);
  return (buildings || []).filter((b) => allowed.has(b?.type)).slice().sort((a, b) => {
    const ah = hash(`${salt}|${coordinateKey(a)}`), bh = hash(`${salt}|${coordinateKey(b)}`);
    return ah - bh || coordinateKey(a).localeCompare(coordinateKey(b));
  });
}

function quota(count, ratio, { min = 0, max = Infinity, threshold = 1 } = {}) {
  if (count < threshold) return 0;
  return Math.min(count, max, Math.max(min, Math.round(count * ratio)));
}

export function selectHunyuanBuildingVariants(layout) {
  const buildings = layout?.buildings || [];
  const assignments = Object.create(null);
  const assign = (lots, count, ids) => {
    for (let i = 0; i < count; i++) assignments[coordinateKey(lots[i])] = ids[i % ids.length];
  };
  const homes = rankedLots(buildings, 'housing', 'wave-2-housing');
  assign(homes, quota(homes.length, .35, { min: 1, max: 48, threshold: 2 }), WAVE_2_RESIDENTIAL_IDS);

  // Both shop variants use a shared rank, so their automatic lots cannot overlap.
  const shops = rankedLots(buildings, 'shop', 'wave-2-shops');
  const sunstackCount = quota(shops.length, .18, { min: 1, max: 4 });
  const bambooCount = Math.min(quota(shops.length, .17, { min: 1, max: 4, threshold: 2 }), shops.length - sunstackCount);
  assign(shops, sunstackCount, [HUNYUAN_IDS.sunstack]);
  assign(shops.slice(sunstackCount), bambooCount, [HUNYUAN_IDS.bambooMarket]);

  const offices = rankedLots(buildings, 'office', 'wave-2-offices');
  assign(offices, quota(offices.length, .30, { min: 1, max: 3 }), [HUNYUAN_IDS.beacon]);

  const civic = rankedLots(buildings, ['school', 'library'], 'wave-2-civic');
  assign(civic, quota(civic.length, .35, { min: 1, max: 4, threshold: 2 }), [HUNYUAN_IDS.skygardenLearning]);

  const keysFor = (id) => Object.freeze(Object.keys(assignments).filter((key) => assignments[key] === id).sort());
  return Object.freeze({
    assignments: Object.freeze(assignments),
    variantFor(value) { return assignments[coordinateKey(value)] || null; },
    sunstackKeys: keysFor(HUNYUAN_IDS.sunstack),
    bambooMarketKeys: keysFor(HUNYUAN_IDS.bambooMarket),
    beaconKeys: keysFor(HUNYUAN_IDS.beacon),
    housingKeys: Object.freeze(WAVE_2_RESIDENTIAL_IDS.flatMap(keysFor).sort()),
    skygardenKeys: keysFor(HUNYUAN_IDS.skygardenLearning),
  });
}

export function selectEmeraldRainTreePark(layout) {
  if (layout?.autoScenery === false) return null;
  return (layout?.parks || []).filter((park) => number(park?.radius) >= 40).slice().sort((a, b) =>
    number(b.radius) - number(a.radius) || number(a.cx) - number(b.cx) || number(a.cz) - number(b.cz)
  )[0] || null;
}

/** True when a placed curated/My Model overlaps the landmark's 8 m base zone. */
export function emeraldRainTreeCentreFree(park, records = [], itemFor = () => null) {
  if (!park) return false;
  return !(records || []).some((record) => {
    if (!record || !Number.isFinite(Number(record.x)) || !Number.isFinite(Number(record.z))) return false;
    const item = itemFor(record.id) || {};
    const footprint = item.footprint || [2, 2];
    const scale = Array.isArray(record.scale) ? Math.max(record.scale[0] || 1, record.scale[2] || 1) : 1;
    const reach = Math.max(number(footprint[0]), number(footprint[1]), 2) * scale / 2;
    return Math.hypot(number(record.x) - number(park.cx), number(record.z) - number(park.cz)) < EMERALD_RAIN_TREE_CLEAR_RADIUS + reach;
  });
}

export function emeraldRainTreePlacement(layout, records = [], itemFor) {
  const park = selectEmeraldRainTreePark(layout);
  if (!park || !emeraldRainTreeCentreFree(park, records, itemFor)) return null;
  return Object.freeze({ x: number(park.cx), z: number(park.cz), park });
}
