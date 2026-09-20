/**
 * city-common/vehicle-scale.js — real-world default sizes for library vehicles.
 *
 * The library vehicle entries keep SMALL "source-unit" footprints (sedan =
 * [1.5, 2.6] m) that were authored for the 2D planner / prop catalog, NOT for
 * the 3D city where the AI champion is ~4 m tall, road traffic cars are ~5 m
 * long (2+ m wide) and buses are ~9 m long. Driving / placing a 2.6 m "toy"
 * car next to those reads wrong, and even the first real-sized pass still read
 * a touch small on the wide (14–21 m) streets — so the defaults sit ~15%
 * above typical traffic-car lengths.
 *
 * These helpers give every vehicle a CONSISTENT real-world length (metres) so
 * the 3D builder can scale a loaded GLB to a sensible default — the same target
 * used whether a vehicle is driven (🚗 chooser), placed as a static prop
 * (🧰 picker), or cruising the roads as traffic (traffic.js).
 * The model's own proportions are preserved (uniform scale).
 *
 * isRoadVehicle() also lets the drive chooser drop non-road vehicles (trains /
 * helicopter) that make no sense to drive on a city street, while they stay
 * placeable as props.
 */

const is = (item, re) => re.test(String((item && (item.name || item.id)) || '').toLowerCase());

/** Real-world target LENGTH (metres) for a library vehicle, by kind. */
export function vehicleTargetLength(item) {
  if (Number.isFinite(item?.targetLength) && item.targetLength > 0) return item.targetLength;
  if (is(item, /motorcycle|motorbike/)) return 2.6;
  if (is(item, /kart/)) return 2.9;
  if (is(item, /helicopter/)) return 4.4;
  if (is(item, /train|carriage|highspeed|rail/)) return 9.6;
  if (is(item, /\bbus\b|schoolbus/)) return 8.8;
  if (is(item, /truck|flatbed|garbage|tractor|shovel/)) return 7.0;
  if (is(item, /ambulance|delivery/)) return 6.0;
  return 5.0;   // default road car: sedan / suv / taxi / police / hatch / sports / van / racer
}

/** Rendered road-vehicle width (metres). Keep this beside length so the
 * renderer and traffic graph use one conservative physical envelope. */
export function vehicleTargetWidth(item) {
  if (Number.isFinite(item?.targetWidth) && item.targetWidth > 0) return item.targetWidth;
  if (is(item, /\bbus\b|schoolbus/)) return 2.5;
  if (is(item, /truck|flatbed|garbage|tractor|shovel/)) return 2.5;
  if (is(item, /ambulance|delivery/)) return 2.25;
  if (is(item, /motorcycle|motorbike|kart/)) return 1.1;
  return 2.05;
}

/** True when the vehicle makes sense to drive on a road (not a train/helicopter). */
export function isRoadVehicle(item) {
  return !is(item, /train|carriage|highspeed|rail|helicopter/);
}
