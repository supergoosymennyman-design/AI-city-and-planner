/**
 * city-builder/traffic.js — cars & buses driving along the student's roads.
 *
 * Each road polyline becomes a driving path; vehicles cruise along them in a
 * loop, keeping to Hong Kong's left-hand lane and facing the direction of travel.
 *
 * VISUALS: traffic simulation starts immediately, but a car is invisible until
 * its assigned Audi GLB settles. Models stream independently; a failed model
 * never turns into an obsolete block-car substitute.
 */

import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { libraryItem } from '../city-common/library.js';
import { isRoadVehicle, vehicleTargetLength, vehicleTargetWidth } from '../city-common/vehicle-scale.js';
import { createTrafficFlow, initialLoopPlacements, trafficFleetPlan } from '../city-common/traffic-network.js';
import { preloadRealisticTrafficFleet } from './realistic-traffic-fleet.js';

export const DEFAULT_TRAFFIC_VEHICLE_IDS = Object.freeze(['veh_audi_a7', 'veh_audi_rs_q8']);

// Ordered by "common first" so a small city sees sedans/taxis.
const TRAFFIC_VEHICLES = [
  { id: 'veh_sedan', name: 'Sedan' },
  { id: 'veh_taxi', name: 'Taxi' },
  { id: 'veh_suv', name: 'SUV' },
  { id: 'veh_police', name: 'Police Car' },
  { id: 'veh_van', name: 'Van' },
  { id: 'veh_truck', name: 'Truck' },
];

const BUS_MODEL = { id: 'veh_bus_q', name: 'Bus' };

// Every road vehicle cruises at the same gentle city speed. Keeping the fleet
// together avoids the visual overtaking that made cars clip through one another.
export const TRAFFIC_SPEED = 8;
export const TRAFFIC_FOLLOW_BUFFER = 3;

const PAINTS = [0xd8d8d2, 0x313942, 0x36516f, 0x9e4b45, 0x446b56, 0xe8e1d5];
const MATERIALS = Object.freeze({
  body: new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.42, metalness: 0.22 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x172632, roughness: 0.18, metalness: 0.45 }),
  tyre: new THREE.MeshStandardMaterial({ color: 0x14171b, roughness: 0.78 }),
  trim: new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.35, metalness: 0.65 }),
  lamp: new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, emissive: 0x2e2414, emissiveIntensity: 0.6, roughness: 0.22 }),
});

function box(w, h, d, x = 0, y = 0, z = 0) { return new THREE.BoxGeometry(w, h, d).translate(x, y, z); }
function lamp(w, h, d, x, y, z, hex) {
  const geometry = box(w, h, d, x, y, z);
  const color = new THREE.Color(hex), count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) color.toArray(colors, i * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}
function wheel(radius, x, z) { return new THREE.CylinderGeometry(radius, radius, 0.3, 10).rotateZ(Math.PI / 2).translate(x, radius, z); }
function merge(parts) { return BufferGeometryUtils.mergeGeometries(parts, false); }

// The renderer deliberately keeps one mesh per material role. Individual
// shapes can be simple, but their silhouettes and service markings must read.
function vehicleParts(kind) {
  const isBus = kind === 'bus', isTruck = kind === 'truck', isVan = kind === 'van', isSUV = kind === 'suv';
  const length = isBus ? 8.4 : isTruck ? 6.6 : isVan ? 5.4 : isSUV ? 5.05 : 4.7;
  const width = isBus ? 2.45 : isTruck ? 2.35 : isSUV ? 2.14 : 2.0;
  const body = [box(width, isBus ? 1.7 : 0.68, length, 0, isBus ? 1.15 : 0.75, 0)];
  const glass = [], tyres = [], trim = [], lamps = [];
  if (isBus) {
    glass.push(box(2.18, 0.63, 0.08, 0, 2.05, length / 2 + .01), box(2.18, 0.43, 0.06, 0, 2.04, -length / 2 - .01));
    for (const z of [-2.65, -.45, 2.65]) for (const x of [-1.0, 1.0]) tyres.push(wheel(.45, x, z));
    trim.push(box(2.5, .13, length - .25, 0, 1.38, 0), box(.07, .7, 1.1, -1.25, 1.78, 2.15));
    lamps.push(lamp(.38, .18, .08, -.72, 1.05, length / 2 + .02, 0xfff2be), lamp(.38, .18, .08, .72, 1.05, length / 2 + .02, 0xfff2be), lamp(.31, .16, .08, -.76, 1.05, -length / 2 - .02, 0xc53b35), lamp(.31, .16, .08, .76, 1.05, -length / 2 - .02, 0xc53b35));
  } else {
    const cabinLength = isTruck ? 1.9 : isVan ? 2.55 : 2.15;
    const cabinY = isTruck ? 1.25 : 1.18;
    if (isTruck) body.push(box(width, 1.35, 3.45, 0, 1.42, -1.35));
    else body.push(box(width - .26, isVan ? .98 : isSUV ? .78 : .63, cabinLength, 0, isSUV ? 1.27 : cabinY, isVan ? -.08 : .28));
    glass.push(box(width - .42, isVan ? .43 : .38, .07, 0, cabinY + .08, isVan ? 1.3 : 1.37));
    for (const z of [-length * .29, length * .29]) for (const x of [-(width / 2 - .13), width / 2 - .13]) tyres.push(wheel(isTruck ? .46 : .4, x, z));
    trim.push(box(width - .25, .12, .08, 0, .55, length / 2 + .01), box(width - .18, .08, isTruck ? 3.0 : .56, 0, isTruck ? 1.74 : 1.05, isTruck ? -1.35 : -1.74));
    lamps.push(lamp(.34, .16, .07, -.58, .77, length / 2 + .02, 0xfff2be), lamp(.34, .16, .07, .58, .77, length / 2 + .02, 0xfff2be), lamp(.28, .14, .07, -.6, .77, -length / 2 - .02, 0xc53b35), lamp(.28, .14, .07, .6, .77, -length / 2 - .02, 0xc53b35));
  }
  if (kind === 'taxi') { trim.push(box(width + .03, .08, 1.45, 0, .92, 0), box(.45, .13, .32, 0, 1.58, .18)); }
  if (kind === 'police') { trim.push(box(width + .03, .08, 1.65, 0, .95, 0)); lamps.push(lamp(.38, .12, .28, -.28, 1.55, .05, 0x2868d8), lamp(.38, .12, .28, .28, 1.55, .05, 0xd43e36)); }
  if (kind === 'truck') trim.push(box(width + .03, .12, 2.9, 0, 1.75, -1.35));
  return { body: merge(body), glass: merge(glass), tyre: merge(tyres), trim: merge(trim), lamp: merge(lamps) };
}

function trafficPaint(kind, index) {
  if (kind === 'taxi') return 0xd7a821;
  if (kind === 'police') return index % 2 ? 0x224f7f : 0xf1f2ef;
  if (kind === 'bus') return [0xc45342, 0x2c6f74, 0xd6a63e][index % 3];
  if (kind === 'truck') return [0xf0f0eb, 0x54805b, 0x9e4c43][index % 3];
  return PAINTS[index % PAINTS.length];
}

function createVehicleRenderer(group, kind, capacity) {
  const parts = vehicleParts(kind);
  const batches = {};
  for (const role of ['body', 'glass', 'tyre', 'trim', 'lamp']) {
    const inst = new THREE.InstancedMesh(parts[role], MATERIALS[role], capacity);
    inst.name = `traffic-${kind}-${role}`;
    inst.frustumCulled = false;
    inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    inst.count = 0;
    group.add(inst);
    batches[role] = inst;
  }
  return { kind, capacity, batches };
}

/**
 * Create road traffic from the student's layout roads.
 * @param {THREE.Group|THREE.Scene} group
 * @param {Array} roads - layout roads [{points:[[x,z],...], width, class}]
 * @param {{carCount?:number, busCount?:number, density?:number, mobile?:boolean, spawn?:{x:number,z:number}}} opts
 * @returns {{update:(dt:number)=>void, vehicles:Array}|null}
 */
export function createTraffic(group, roads, opts = {}) {
  const flow = createTrafficFlow(roads);
  if (!flow.routePlan.routes.length) return null;

  const fleet = trafficFleetPlan(flow.network, { mobile: !!opts.mobile, density: opts.density ?? 1, routePlan: flow.routePlan });
  // Explicit scene/demo counts remain useful, but never bypass the device cap.
  // Cars take priority because their shorter bodies make compact layouts read
  // as lively without weakening the graph's following-distance rules.
  const requestedCars = opts.carCount ?? fleet.cars;
  const requestedBuses = opts.busCount ?? 0;
  const carCount = Math.min(fleet.cap, Math.max(0, requestedCars));
  // Ambient traffic is road-car only. Buses remain a library/Drive choice but
  // are not part of the default fleet.
  const busCount = 0;
  const requestedIds = Array.isArray(opts.vehicleIds) ? opts.vehicleIds : DEFAULT_TRAFFIC_VEHICLE_IDS;
  const selectedItems = [...new Set(requestedIds)]
    .map((id) => libraryItem(id))
    .filter((item) => item?.category === 'vehicles' && isRoadVehicle(item));
  const availableTrafficItems = selectedItems.length
    ? selectedItems
    : DEFAULT_TRAFFIC_VEHICLE_IDS.map((id) => libraryItem(id)).filter(Boolean);
  const trafficItems = availableTrafficItems.slice(0, 6);
  let renderers = [];
  let instancedHolders = [];

  // Attach rendering metadata to graph vehicles. The graph owns position,
  // following distance and intersection reservations; this file only draws it.
  const initialPlacements = initialLoopPlacements(flow.routePlan, carCount + busCount, opts.spawn || null);
  const initialPlacement = (index) => initialPlacements[index] || null;
  let safelyOmitted = 0;
  const spawnCar = (index) => {
    const item = trafficItems[index % trafficItems.length];
    if (!item) { safelyOmitted++; return null; }
    const length = vehicleTargetLength(item) || 5, width = vehicleTargetWidth(item);
    const candidates = [initialPlacement(index)].filter(Boolean);
    for (const place of candidates) {
      const vehicle = flow.addVehicle({ kind: 'car', speed: TRAFFIC_SPEED, length, width, ...place });
      if (vehicle) { Object.assign(vehicle, { renderer: null, inst: null, modelId: item.id, paint: PAINTS[index % PAINTS.length] }); return vehicle; }
    }
    safelyOmitted++; return null;
  };
  for (let i = 0; i < carCount; i++) spawnCar(i);

  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const scl = new THREE.Vector3(1, 1, 1);
  const rendererDiagnostics = {
    overflow: 0, nonFinite: 0,
    batches: {}, drawCalls: 0,
  };
  let destroyed = false;

  // Loading never holds up city startup. Each Audi reveals only its own stable
  // assignment as soon as it settles; rejected assignments remain invisible.
  const realisticFleet = {
    requested: trafficItems.map((item) => item.id), loaded: [], failed: [], errors: {},
    models: Object.fromEntries(trafficItems.map(item => [item.id, { state: 'loading' }])),
  };
  if (trafficItems.length) {
    realisticFleet.ready = preloadRealisticTrafficFleet(group, trafficItems, carCount, {
      isActive: () => !destroyed,
      onSettle(result) {
        const id = result.item.id;
        if (destroyed) return;
        if (!result.renderer) {
          realisticFleet.models[id] = { state: 'failed', reason: result.reason };
          realisticFleet.failed.push(id);
          realisticFleet.errors[id] = result.reason;
          return;
        }
        renderers.push(result.renderer);
        realisticFleet.models[id] = { state: 'loaded' };
        realisticFleet.loaded.push(id);
        for (const vehicle of flow.vehicles) if (vehicle.modelId === id) {
          vehicle.renderer = result.renderer;
          vehicle.inst = Object.values(result.renderer.batches)[0] || null;
        }
        instancedHolders = renderers.flatMap((renderer) => Object.values(renderer.batches));
        rendererDiagnostics.batches = Object.fromEntries(renderers.map((renderer) => [renderer.kind, Object.keys(renderer.batches)]));
        rendererDiagnostics.drawCalls = instancedHolders.length;
      },
    }).catch((error) => {
      // Per-model work already settles; this is a final defensive boundary.
      realisticFleet.errors.loader = error?.message || 'fleet-load-failed';
    });
  }

  function update(dt, streetLife = null) {
    if (destroyed) return;
    // Street-life occupancy is intentionally separate: pedestrians no longer
    // cross carriageways, so it cannot stall the graph halfway through a turn.
    flow.update(streetLife ? (streetLife.shouldYield ? dt : dt) : dt);
    // Fixed-step interpolation: draw cars between the last two simulated poses
    // so motion stays smooth even when the display frame is shorter than the
    // 0.05s simulation slice.
    const alpha = Math.max(0, Math.min(1, flow.alpha ? flow.alpha() : 1));
    // Planned loops have no runtime respawn: omitted startup vehicles stay
    // omitted rather than appearing beside the Champion later.
    const used = new Map(renderers.map(renderer => [renderer, 0]));
    rendererDiagnostics.overflow = 0;
    rendererDiagnostics.nonFinite = 0;
    for (const v of flow.vehicles) {
      if (!v.renderer) continue;
      const slot = used.get(v.renderer) || 0;
      if (slot >= v.renderer.capacity) { rendererDiagnostics.overflow++; continue; }
      if (!Number.isFinite(v.x) || !Number.isFinite(v.z)) { rendererDiagnostics.nonFinite++; continue; }
      used.set(v.renderer, slot + 1);
      // The renderer consumes the already lane-centred pose produced by the
      // graph. Applying another offset here would visibly separate the GLB
      // from the collision envelope, especially while traversing a turn path.
      const ix = Number.isFinite(v.px) ? v.px + (v.x - v.px) * alpha : v.x;
      const iz = Number.isFinite(v.pz) ? v.pz + (v.z - v.pz) * alpha : v.z;
      pos.set(ix, 0.5, iz);
      const curYaw = v.vx * v.vx + v.vz * v.vz > 1e-4 ? Math.atan2(v.vx, v.vz)
        : (Number.isFinite(v.renderYaw) ? v.renderYaw : 0);
      const prevYaw = (Number.isFinite(v.pdx) && v.pdx * v.pdx + v.pdz * v.pdz > 1e-4)
        ? Math.atan2(v.pdx, v.pdz) : curYaw;
      const yawDelta = Math.atan2(Math.sin(curYaw - prevYaw), Math.cos(curYaw - prevYaw));
      v.renderYaw = prevYaw + yawDelta * alpha;
      if (!Number.isFinite(v.renderYaw)) v.renderYaw = 0;
      quat.setFromAxisAngle(up, v.renderYaw);
      scl.set(1, 1, 1);
      m.compose(pos, quat, scl);
      for (const inst of Object.values(v.renderer.batches)) inst.setMatrixAt(slot, m);
      const paintBatch = v.renderer.batches.body
        || Object.entries(v.renderer.batches).find(([key]) => /paint/i.test(key))?.[1];
      if (paintBatch?.setColorAt) paintBatch.setColorAt(slot, new THREE.Color(v.paint));
      // Service markings keep their own visual identity even when body paint
      // varies. Taxi trim is charcoal, police trim navy, and buses use a
      // brighter stripe that makes their long silhouette readable.
      const trimColor = v.renderer.kind === 'taxi' ? 0x1b2229 : v.renderer.kind === 'police' ? 0x183d66 : v.renderer.kind === 'bus' ? 0xe8e1d5 : 0x67717a;
      if (v.renderer.batches.trim?.setColorAt) v.renderer.batches.trim.setColorAt(slot, new THREE.Color(trimColor));
    }
    for (const renderer of renderers) {
      const count = used.get(renderer) || 0;
      for (const inst of Object.values(renderer.batches)) {
        inst.count = count;
        inst.instanceMatrix.needsUpdate = true;
        if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      }
    }
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    for (const inst of instancedHolders) {
      inst.removeFromParent();
      inst.dispose();
    }
  }

  const roadOccupancy = {};
  const refreshRoadOccupancy = () => {
    for (const key of Object.keys(roadOccupancy)) delete roadOccupancy[key];
    for (const vehicle of flow.vehicles) roadOccupancy[vehicle.link.roadId] = (roadOccupancy[vehicle.link.roadId] || 0) + 1;
  };
  refreshRoadOccupancy();
  // This object is intentionally public through window.__city.traffic for
  // browser diagnostics: target is the requested moderate fleet, while the
  // live count may be lower if graph admission rejects an unsafe spawn.
  const trafficDebug = { update, destroy, vehicles: flow.vehicles, network: flow.network,
    routeCount: flow.routePlan.routes.length,
    componentCoverage: { total: flow.routePlan.componentCount, covered: flow.routePlan.coveredComponents },
    safelyOmittedVehicles: safelyOmitted,
    renderer: rendererDiagnostics,
    vehiclesOverlap: flow.vehiclesOverlap,
    fleet: { ...fleet, target: carCount + busCount, cars: carCount, buses: busCount, total: carCount + busCount, vehicleIds: trafficItems.map((item) => item.id) }, roadOccupancy,
    realisticFleet };
  const originalUpdate = update;
  trafficDebug.update = (dt, streetLife) => { originalUpdate(dt, streetLife); refreshRoadOccupancy(); };
  return trafficDebug;
}
