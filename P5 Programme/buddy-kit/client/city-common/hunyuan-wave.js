// Hunyuan Wave 1 is presentation-only: it never changes a student's layout
// or Champion File. Stable coordinates choose a single representative lot so
// reloads, imports and restores always paint the same city the same way.
export const HUNYUAN_IDS = Object.freeze({
  sunstack: 'bld_passiona_sunstack',
  beacon: 'bld_passiona_beacon',
  emeraldRainTree: 'nat_passiona_emerald_rain_tree',
});

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
function pickLot(buildings, type, salt) {
  const candidates = (buildings || []).filter((b) => b?.type === type);
  if (!candidates.length) return null;
  return candidates.slice().sort((a, b) => {
    const ah = hash(`${salt}|${coordinateKey(a)}`), bh = hash(`${salt}|${coordinateKey(b)}`);
    return ah - bh || coordinateKey(a).localeCompare(coordinateKey(b));
  })[0];
}

export function selectHunyuanBuildingVariants(layout) {
  const buildings = layout?.buildings || [];
  const shop = pickLot(buildings, 'shop', 'sunstack');
  const office = pickLot(buildings, 'office', 'beacon');
  return Object.freeze({
    sunstackKey: shop ? coordinateKey(shop) : null,
    beaconKey: office ? coordinateKey(office) : null,
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
