// Pure roadside placement helpers shared by all city dressing systems.
// Keeping this outside Three.js makes road-safety rules cheap to test.
import { buildTrafficNetwork, isRoadsideSceneryClear } from './traffic-network.js';

export function streetlightPlacements(layout) {
  const lights = [], roads = layout?.roads || [], network = buildTrafficNetwork(roads);
  for (const road of roads) for (let i = 1; i < road.points.length; i++) {
    const [x, z] = road.points[i - 1], [xx, zz] = road.points[i];
    const dx = xx - x, dz = zz - z, len = Math.hypot(dx, dz);
    if (!len) continue;
    const slots = Math.floor(len / 30);
    for (let k = 0; k < slots; k++) for (const side of [-1, 1]) {
      const t = (k + .5) / slots, offset = (road.width || 9) / 2 + 2.5;
      const candidate = { x: x + dx * t - dz / len * offset * side, z: z + dz * t + dx / len * offset * side,
        yaw: Math.atan2(dx, dz) };
      if (!isRoadsideSceneryClear(network, candidate.x, candidate.z, .65, 10)) continue;
      if (lights.some(other => Math.hypot(other.x - candidate.x, other.z - candidate.z) < 3)) continue;
      lights.push(candidate);
    }
  }
  return lights;
}
