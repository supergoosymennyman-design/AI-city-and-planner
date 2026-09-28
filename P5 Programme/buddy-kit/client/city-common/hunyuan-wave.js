// Passiona-original (Hunyuan) building ids are catalogued in the shared library
// but are NOT auto-placed in any city any more — their hi-poly PBR look clashes
// with the low-poly Kenney kit, so the presentation layer no longer substitutes
// them onto student lots. The only Hunyuan asset still placed automatically is
// the Emerald Rain Tree landmark; the Workshop / Fit Studio gateways are
// separate runtime assets and remain.
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

export const EMERALD_RAIN_TREE_CANOPY_METRES = 12;
export const EMERALD_RAIN_TREE_CLEAR_RADIUS = 4; // 8 m diameter base zone

function number(value) { return Number.isFinite(Number(value)) ? Number(value) : 0; }

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
