/** Deterministic quality checks for the editable road-template catalogue. */
import { CATALOG } from './catalog.js';
import { roadBands, rectRoadClearance, ROAD_CLEARANCE_MARGIN, pointToSegment } from './road-geometry.js';
import { analyzeRoadTopology } from './road-topology.js';
import { townCapacity } from './metrics.js';

const SCALE = 2000;
const largestFootprint = Object.values(CATALOG).reduce((largest, item) =>
  item.footprint[0] * item.footprint[1] > largest[0] * largest[1] ? item.footprint : largest, [0, 0]);

function roadDistance(x, z, bands) {
  return Math.min(...bands.map((b) => pointToSegment(x, z, b.ax, b.az, b.bx, b.bz).d));
}
function clearPark(x, z, fp, parks) {
  const reach = Math.hypot(fp[0], fp[1]) / 2;
  return parks.every((p) => Math.hypot(x - p.cx, z - p.cz) >= p.radius + reach);
}
function usable(x, z, fp, bands, parks, nearRoad) {
  const inside = x >= fp[0] / 2 && z >= fp[1] / 2 && x <= SCALE - fp[0] / 2 && z <= SCALE - fp[1] / 2;
  return inside && clearPark(x, z, fp, parks) && rectRoadClearance(x, z, fp, bands) >= ROAD_CLEARANCE_MARGIN
    && (!nearRoad || roadDistance(x, z, bands) <= nearRoad);
}
function packable(fp, bands, parks, step, nearRoad) {
  let count = 0;
  for (let x = fp[0] / 2; x <= SCALE - fp[0] / 2; x += step) for (let z = fp[1] / 2; z <= SCALE - fp[1] / 2; z += step) {
    if (usable(x, z, fp, bands, parks, nearRoad)) count++;
  }
  return count;
}

export function auditRoadTemplate(template) {
  const parks = template.parks || [], bands = roadBands(template.roads);
  const topology = analyzeRoadTopology(template.roads);
  let sampled = 0, largestUsable = 0, farthestRoad = 0;
  for (let x = 20; x < SCALE; x += 40) for (let z = 20; z < SCALE; z += 40) {
    if (!clearPark(x, z, [0, 0], parks)) continue;
    sampled++;
    const distance = roadDistance(x, z, bands);
    farthestRoad = Math.max(farthestRoad, distance);
    if (usable(x, z, largestFootprint, bands, parks, 60)) largestUsable++;
  }
  const parkClearance = parks.length ? Math.min(...parks.map((p) => rectRoadClearance(p.cx, p.cz, [0, 0], bands) - p.radius)) : Infinity;
  return {
    id: template.id, connected: topology.components.length === 1, trafficCircuits: topology.trafficCircuits.length,
    capacityHomes: townCapacity({ version: 2, scaleMeters: SCALE, roads: template.roads, parks, buildings: [] }),
    pads44x40: packable([44, 40], bands, parks, 48, 60), civic60: packable([60, 60], bands, parks, 72, 80),
    largestFootprint: largestFootprint.slice(), largestUsableRatio: sampled ? largestUsable / sampled : 0,
    farthestRoad, parkClearance,
  };
}
