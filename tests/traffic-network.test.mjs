import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTrafficNetwork, createTrafficFlow, initialLoopPlacements, initialTrafficPlacements, isJunctionClear, isRoadsideSceneryClear, planTrafficLoops, pointInRoadCarriageway, resolveRoadCarriageway, roadEdgeClearance, trafficFleetPlan, trafficLightSpots } from '../P5 Programme/buddy-kit/client/city-common/traffic-network.js';
import { sampleCityRoads, CX as CITY_X, CZ as CITY_Z } from '../P5 Programme/buddy-kit/client/city-common/sample-city.js';
import { createParkVegetation } from '../P5 Programme/buddy-kit/client/city-common/park-vegetation.js';
import { streetlightPlacements } from '../P5 Programme/buddy-kit/client/city-common/roadside-placement.js';
import { ROAD_TEMPLATES } from '../P5 Programme/buddy-kit/client/city-common/road-templates.js';

const grid = [
  { width: 12, points: [[0, 50], [100, 50]] },
  { width: 12, points: [[50, 0], [50, 100]] },
];
const roundabout = [
  { width: 10, points: [[-20, -20], [20, -20], [20, 20], [-20, 20], [-20, -20]] },
  { width: 10, points: [[0, -60], [0, -20]] },
];

test('traffic fleet policy uses moderate device-specific baselines and caps', () => {
  const short = buildTrafficNetwork([{ width: 10, points: [[0, 0], [120, 0]] }]);
  const normal = buildTrafficNetwork([{ width: 10, points: [[0, 0], [800, 0]] }]);
  const large = buildTrafficNetwork([{ width: 10, points: [[0, 0], [10000, 0]] }]);
  const shortMobile = trafficFleetPlan(short, { mobile: true });
  const shortDesktop = trafficFleetPlan(short, { mobile: false });
  const normalMobile = trafficFleetPlan(normal, { mobile: true });
  const normalDesktop = trafficFleetPlan(normal, { mobile: false });
  const largeMobile = trafficFleetPlan(large, { mobile: true });
  const largeDesktop = trafficFleetPlan(large, { mobile: false });

  assert.equal(shortMobile.total, 7);
  assert.equal(shortMobile.cap, 22);
  assert.equal(normalDesktop.cap, 42);
  assert.equal(shortDesktop.total, 10);
  assert.equal(normalDesktop.buses, 0, 'the default lively fleet is road cars only');
  assert.ok(normalMobile.total > shortMobile.total, 'fleet grows with usable road length');
  assert.ok(normalDesktop.total >= normalMobile.total, 'desktop retains the larger budget');
  assert.equal(largeMobile.total, largeMobile.cap);
  assert.equal(largeDesktop.total, largeDesktop.cap);
  assert.ok(largeMobile.cap < largeDesktop.cap, 'tablet cap is separately protected');
});

test('continuous route planner closes every usable district and safely omits unusable fragments', () => {
  const layouts = [
    [{ width: 10, points: [[0, 0], [100, 0]] }], // no circuit: intentionally vehicle-free
    grid,
    roundabout,
    [{ width: 10, points: [[0, 0], [80, 0]] }, { width: 10, points: [[240, 0], [340, 0]] }],
    [{ width: 10, points: [[0, 0], [80, 80]] }, { width: 10, points: [[0, 80], [80, 0]] }],
    [{ width: 10, points: [[0, 0], [6, 0]] }, { width: 3, points: [[30, 0], [130, 0]] }],
  ];
  for (const roads of layouts) {
    const plan = planTrafficLoops(roads);
    for (const route of plan.routes) {
      assert.equal(route.closed, true);
      assert.ok(route.length >= 18 && Number.isFinite(route.length));
      assert.equal(route.links.length, route.transitions.length);
      route.links.forEach((link, index) => {
        assert.ok(plan.network.links.includes(link));
        const turn = route.transitions[index];
        assert.ok(Number.isFinite(turn.length) && (turn.seamless ? turn.length === 0 : turn.length > 0));
        assert.equal(turn.from, link);
        assert.equal(turn.to, route.links[(index + 1) % route.links.length]);
        assert.equal(turn.to.from, link.to, 'connector joins at one shared graph node');
        assert.notEqual(turn.to.to, link.from, 'a route never reverses at an ordinary road end');
        if (turn.seamless) {
          assert.equal(turn.to.roadId, link.roadId, 'only a continuing physical road may skip a connector');
          assert.ok(turn.to.dx * link.dx + turn.to.dz * link.dz >= .94, 'seamless links stay gently aligned');
        } else if (turn.to.roadId !== link.roadId || turn.to.dx * link.dx + turn.to.dz * link.dz < .94) {
          assert.ok(turn.length > 0, 'intersections and ordinary corners retain a traversed connector');
        }
      });
    }
  }
  const invalid = planTrafficLoops(layouts.at(-1));
  assert.equal(invalid.routes.length, 0, 'short and narrow pieces never create broken traffic');
});

test('loop-assigned vehicles complete extended runs without despawning or changing population', () => {
  const roads = [...roundabout,
    { width: 10, points: [[60, 0], [20, 0]] }, { width: 10, points: [[0, 60], [0, 20]] },
  ];
  const flow = createTrafficFlow(roads, { seed: 23 });
  const placements = initialLoopPlacements(flow.routePlan, 6);
  for (const placement of placements) flow.addVehicle({ ...placement, length: 5, speed: 8 });
  const initial = flow.vehicles.length;
  assert.ok(initial > 0, 'a valid loop admits at least one safely spaced vehicle');
  const prior = new Map(flow.vehicles.map(vehicle => [vehicle.id, { x: vehicle.x, z: vehicle.z }]));
  for (let tick = 0; tick < 1800; tick++) {
    flow.update(.1);
    assert.equal(flow.vehicles.length, initial, `frame ${tick}: no route vehicle disappeared`);
    for (const vehicle of flow.vehicles) {
      assert.equal(vehicle.done, false);
      assert.ok(vehicle.route?.closed && Number.isFinite(vehicle.x) && Number.isFinite(vehicle.z));
      const before = prior.get(vehicle.id);
      assert.ok(Math.hypot(vehicle.x - before.x, vehicle.z - before.z) < 2,
        `frame ${tick}: vehicle ${vehicle.id} used a continuous pose, not a lane jump`);
      prior.set(vehicle.id, { x: vehicle.x, z: vehicle.z });
    }
    for (let a = 0; a < flow.vehicles.length; a++) for (let b = a + 1; b < flow.vehicles.length; b++) {
      assert.equal(flow.vehiclesOverlap(flow.vehicles[a], flow.vehicles[b]), false, `frame ${tick}: no body overlap`);
    }
  }
});

test('gentle radial-ring seams keep lane pose continuous and never move backwards', () => {
  const ring = [];
  for (let i = 0; i <= 24; i++) {
    const a = i / 24 * Math.PI * 2;
    ring.push([50 + Math.cos(a) * 50, 50 + Math.sin(a) * 50]);
  }
  const flow = createTrafficFlow([{ width: 10, points: ring }], { seed: 29 });
  const route = flow.routePlan.routes[0];
  const seamIndex = route.transitions.findIndex(turn => turn.seamless);
  assert.ok(seamIndex >= 0, 'the ring keeps gentle same-road joins connector-free');
  const link = route.links[seamIndex], next = route.transitions[seamIndex].to;
  const offset = Math.min(1.8, next.width * .22);
  const atNode = flow.addVehicle({ route, routeStep: seamIndex, link, dist: link.length, length: 4, speed: 8 });
  assert.ok(atNode);
  assert.ok(Math.hypot(atNode.x - (next.from.x - next.dz * offset), atNode.z - (next.from.z + next.dx * offset)) < 1e-8,
    'the blended incoming pose equals the outgoing lane pose at the shared node');
  flow.update(.05);
  assert.equal(atNode.link, next, 'a seamless join transfers directly to the next physical lane');
  assert.ok(atNode.dist > .39, 'the same fixed step carries residual travel into the next link');

  let prior = { x: atNode.x, z: atNode.z, dx: atNode.vx, dz: atNode.vz };
  for (let tick = 0; tick < 3500; tick++) {
    flow.update(.05);
    const forward = (atNode.x - prior.x) * prior.dx + (atNode.z - prior.z) * prior.dz;
    assert.ok(forward >= -1e-7, `frame ${tick}: a ring seam never pulls the vehicle backwards`);
    prior = { x: atNode.x, z: atNode.z, dx: atNode.vx, dz: atNode.vz };
  }
  assert.equal(atNode.done, false, 'the route remains closed through several complete laps');
});

test('densified sample city keeps a visible continuous fleet across many laps', () => {
  const flow = createTrafficFlow(sampleCityRoads(), { seed: 41 });
  const fleet = trafficFleetPlan(flow.network, { routePlan: flow.routePlan });
  for (const placement of initialLoopPlacements(flow.routePlan, fleet.total)) {
    flow.addVehicle({ ...placement, length: 5, width: 2.05, speed: 8 });
  }
  const admitted = flow.vehicles.length;
  assert.ok(admitted >= Math.min(10, fleet.total), 'sample city starts a clearly visible safe fleet');
  const headings = new Map(flow.vehicles.map(vehicle => [vehicle.id, Math.atan2(vehicle.vz, vehicle.vx)]));
  const stoppedOwners = new Map();
  for (let tick = 0; tick < 7200; tick++) {
    flow.update(.05);
    for (const vehicle of flow.vehicles) {
      const previous = headings.get(vehicle.id);
      const current = Math.atan2(vehicle.vz, vehicle.vx);
      const delta = Math.abs(Math.atan2(Math.sin(current - previous), Math.cos(current - previous)));
      assert.ok(delta < .75, `frame ${tick}: vehicle ${vehicle.id} never performs a visible heading reversal`);
      headings.set(vehicle.id, current);
      const stoppedFor = vehicle.reservation && vehicle.currentSpeed === 0 ? (stoppedOwners.get(vehicle) || 0) + .05 : 0;
      stoppedOwners.set(vehicle, stoppedFor);
      assert.ok(stoppedFor < 1, `frame ${tick}: reservation owner ${vehicle.id} remained stopped inside a crossing`);
    }
  }
  assert.equal(flow.vehicles.length, admitted, 'sample traffic has no population churn');
  assert.ok(flow.vehicles.every(vehicle => !vehicle.done && Number.isFinite(vehicle.x) && Number.isFinite(vehicle.z)));
});

function assertFlowStaysSafe(roads, { mobile = false, seed = 17 } = {}) {
  const flow = createTrafficFlow(roads, { seed });
  const fleet = trafficFleetPlan(flow.network, { mobile });
  const placements = initialTrafficPlacements(flow.network, fleet.total, { x: 0, z: 0 });
  for (const place of placements) flow.addVehicle({ ...place, length: 5, speed: 8 });
  for (let tick = 0; tick < 360; tick++) {
    flow.update(.1);
    assert.ok(flow.vehicles.length <= fleet.cap, `frame ${tick}: cap respected`);
    for (const link of flow.network.links) {
      const ordered = [...link.vehicles].sort((a, b) => a.dist - b.dist);
      for (let i = 1; i < ordered.length; i++) {
        assert.ok(ordered[i].dist - ordered[i - 1].dist >= (ordered[i].length + ordered[i - 1].length) / 2 + 3 - .001);
      }
    }
    for (const junction of flow.network.junctions) assert.ok(!junction.owner || flow.vehicles.includes(junction.owner));
    for (let a = 0; a < flow.vehicles.length; a++) for (let b = a + 1; b < flow.vehicles.length; b++) {
      assert.equal(flow.vehiclesOverlap(flow.vehicles[a], flow.vehicles[b]), false, `frame ${tick}: rendered bodies remain separate`);
    }
  }
}

test('traffic simulation remains safe on short, grid, radial, cul-de-sac, diagonal, and example networks', () => {
  const layouts = [
    [{ width: 10, points: [[0, 0], [80, 0]] }],
    grid,
    [...roundabout, { width: 10, points: [[60, 0], [20, 0]] }, { width: 10, points: [[0, 60], [0, 20]] }],
    [{ width: 10, points: [[0, 0], [100, 0]] }, { width: 10, points: [[50, 0], [50, 50]] }, { width: 10, points: [[50, 50], [85, 50]] }],
    [{ width: 10, points: [[0, 0], [100, 100]] }, { width: 10, points: [[0, 100], [100, 0]] }],
    sampleCityRoads(),
  ];
  layouts.forEach((roads, index) => assertFlowStaysSafe(roads, { mobile: index % 2 === 0, seed: index + 9 }));
});

test('opening traffic starts near the champion, then spreads across the road network', () => {
  const network = buildTrafficNetwork([
    { width: 10, points: [[0, 0], [120, 0]] },
    { width: 10, points: [[0, 120], [120, 120]] },
    { width: 10, points: [[0, 300], [120, 300]] },
  ]);
  const placements = initialTrafficPlacements(network, 8, { x: 24, z: 16 });
  assert.equal(placements.length, 8);
  const distanceToSpawn = (p) => {
    const l = p.link, t = p.dist / l.length;
    return Math.hypot(l.from.x + (l.to.x - l.from.x) * t - 24, l.from.z + (l.to.z - l.from.z) * t - 16);
  };
  assert.ok(distanceToSpawn(placements[0]) < 25, 'first visible vehicle is on the nearby road');
  assert.ok(new Set(placements.map(p => p.link.roadId)).size >= 3, 'the full opening fleet still covers the city');
  assert.equal(new Set(placements.slice(2, 5).map(p => p.link.roadId)).size, 3, 'after the nearby reserve, each physical road is tried before a second pass');
});

test('traffic graph splits geometric crossings into one reservable junction', () => {
  const network = buildTrafficNetwork(grid);
  assert.equal(network.junctions.length, 1);
  assert.equal(network.nodes.filter(n => n.x === 50 && n.z === 50).length, 1);
  assert.ok(network.links.length >= 8);
});

test('cars retain safe spacing and never share a junction reservation', () => {
  const flow = createTrafficFlow(grid);
  for (let i = 0; i < 6; i++) flow.addVehicle({ link: flow.network.links[i], length: 5, speed: 8 });
  for (let tick = 0; tick < 300; tick++) {
    flow.update(.1);
    for (const link of flow.network.links) {
      const ordered = [...link.vehicles].sort((a, b) => a.dist - b.dist);
      for (let i = 1; i < ordered.length; i++) assert.ok(ordered[i].dist - ordered[i - 1].dist >= (ordered[i].length + ordered[i - 1].length) / 2 + 3 - .001);
    }
    for (const junction of flow.network.junctions) assert.ok(!junction.owner || flow.vehicles.includes(junction.owner));
  }
});

test('traffic uses the Hong Kong left-hand lane', () => {
  const flow = createTrafficFlow([{ width: 10, points: [[0, 0], [100, 0]] }]);
  const eastbound = flow.network.links.find(link => link.dx > .9);
  const vehicle = flow.addVehicle({ link: eastbound, dist: 20, length: 5, speed: 8 });
  flow.update(.1);
  assert.ok(vehicle.z > 0, 'eastbound traffic is offset to the left side of the road');
});

test('a blocked junction exit keeps the approaching vehicle behind the mouth', () => {
  const roads = [
    { width: 10, points: [[0, 0], [100, 0]] },
    { width: 10, points: [[50, -60], [50, 60]] },
  ];
  const flow = createTrafficFlow(roads, { seed: 4 });
  const incoming = flow.network.links.find(link => link.from.x === 0 && link.to.x === 50);
  const outgoing = flow.network.links.find(link => link.from.x === 50 && link.to.x === 100);
  const blocker = flow.addVehicle({ link: outgoing, dist: 4, length: 5, speed: 0 });
  const approaching = flow.addVehicle({ link: incoming, dist: 35, length: 5, speed: 8 });
  assert.ok(blocker && approaching);
  for (let i = 0; i < 30; i++) flow.update(.1);
  assert.equal(approaching.link, incoming);
  assert.ok(approaching.dist <= incoming.length - .75 - approaching.length / 2 + .001);
  assert.equal(flow.network.junctionByNode.get(incoming.to.id).owner, null);
});

test('an admitted junction owner clears its turn connector while a legal follower waits behind it', () => {
  // A wide painted crossing keeps the owner reserved long enough for a
  // properly spaced follower to reach its stop line behind it.
  const flow = createTrafficFlow([
    { width: 24, points: [[0, 50], [100, 50]] },
    { width: 24, points: [[50, 0], [50, 100]] },
  ], { seed: 5 });
  const incoming = flow.network.links.find(link => link.from.x === 0 && link.from.z === 50 && link.to.x === 50 && link.to.z === 50);
  const outgoing = flow.network.links.find(link => link.from.x === 50 && link.from.z === 50 && link.to.x === 50 && link.to.z === 100);
  // Add the distant follower first so both initial positions are individually
  // legal under the conservative admission rule.
  const follower = flow.addVehicle({ link: incoming, dist: 12, length: 5, speed: 8 });
  const leader = flow.addVehicle({ link: incoming, dist: 30, length: 5, speed: 8 });
  assert.ok(leader && follower, 'both vehicles start with a legal following gap');
  leader.nextLink = outgoing;
  follower.nextLink = outgoing;
  const junction = flow.network.junctionByNode.get(incoming.to.id);
  let sawReservation = false, sawWaitingFollower = false, cleared = false;
  for (let tick = 0; tick < 160; tick++) {
    flow.update(.05);
    sawReservation ||= junction.owner === leader;
    sawWaitingFollower ||= follower.link === incoming && follower.currentSpeed === 0;
    if (sawReservation) {
      assert.notEqual(leader.currentSpeed, 0, `frame ${tick}: admitted leader did not stall in its crossing`);
      assert.equal(flow.vehiclesOverlap(leader, follower), false, `frame ${tick}: leader and follower bodies stay separate`);
    }
    if (sawReservation && junction.owner === null && leader.link === outgoing) { cleared = true; break; }
  }
  assert.ok(sawReservation, 'leader receives the normal-junction reservation');
  assert.ok(sawWaitingFollower, 'follower waits behind the stop line while the owner clears the crossing');
  assert.ok(cleared, 'leader traverses the connector and releases its reservation');
  assert.ok(follower.link === incoming || follower.link === outgoing || follower.transition,
    'the follower never has to enter the junction before the owner clears it');
});

test('road barriers and junction tree clearances use the same road geometry', () => {
  const network = buildTrafficNetwork(grid);
  assert.equal(pointInRoadCarriageway(network, 50, 50), true);
  assert.equal(isJunctionClear(network, 50, 50, 2), false);
  const pushed = resolveRoadCarriageway(network, 50, 50, .5);
  assert.equal(pointInRoadCarriageway(network, pushed.x, pushed.z, .49), false);
});

test('streetlights never occupy a carriageway or intersection mouth', () => {
  const roads = [
    { width: 12, points: [[0, 100], [200, 100]] },
    { width: 12, points: [[100, 0], [100, 200]] },
  ];
  const network = buildTrafficNetwork(roads);
  const lights = streetlightPlacements({ roads });
  assert.ok(lights.length > 0);
  for (const lamp of lights) {
    assert.equal(pointInRoadCarriageway(network, lamp.x, lamp.z, .64), false);
    assert.equal(isJunctionClear(network, lamp.x, lamp.z, 10.64), true);
  }
});

test('park filler stays outside road ribbons and junction exclusion zones', () => {
  const layout = { roads: grid, parks: [{ cx: 50, cz: 50, radius: 42 }] };
  const network = buildTrafficNetwork(layout.roads);
  const filler = createParkVegetation(layout);
  assert.ok(filler.length > 0);
  for (const placement of filler) assert.equal(isRoadsideSceneryClear(network, placement.x, placement.z,
    { grass: .45, 'tall-grass': .7, bush: 1.35, 'flower-red': .45, 'flower-yellow': .45, rock: .55 }[placement.kind], 5), true);
});

test('a legacy unassigned end-of-road car retires rather than being recycled', () => {
  const flow = createTrafficFlow([{ width: 10, points: [[0, 0], [20, 0]] }]);
  const vehicle = flow.addVehicle({ link: flow.network.links[0], dist: 19, length: 4, speed: 8 });
  flow.update(.25);
  assert.equal(flow.vehicles.includes(vehicle), false);
});

test('a departed car cannot leave a junction permanently reserved', () => {
  const flow = createTrafficFlow(grid);
  const vehicle = flow.addVehicle({ link: flow.network.links[0], length: 4, speed: 8 });
  const junction = flow.network.junctions[0];
  junction.owner = vehicle;
  vehicle.reservation = { junction, remaining: 20 };
  vehicle.done = true;
  flow.update(.1);
  assert.equal(junction.owner, null);
  assert.deepEqual(junction.queue, []);
});

test('a branch enters the counter-clockwise roundabout lane and keeps circulating', () => {
  const flow = createTrafficFlow(roundabout, { seed: 7 });
  const branch = flow.network.links.find(link => link.roadId === 1 && link.from.z < -20 && link.to.z === -20);
  const vehicle = flow.addVehicle({ link: branch, dist: branch.length - .1, length: 4, speed: 8 });
  const junction = flow.network.junctionByNode.get(branch.to.id);
  assert.equal(junction.roundabout, true);
  flow.update(.1);
  assert.ok(vehicle.transition, 'roundabout entry uses a visible internal connector, never a lane jump');
  assert.equal(vehicle.transition.to.roadId, 0);
  assert.ok(vehicle.transition.to.dx > .9, 'a northbound branch turns left/east onto the counter-clockwise lane');
  for (let i = 0; i < 150; i++) flow.update(.1);
  assert.ok(flow.vehicles.includes(vehicle), 'circulating traffic does not despawn at the merge');
  assert.equal(vehicle.done, false);
});

test('dense circulating traffic makes a branch wait for vehicle-length-aware gap', () => {
  const flow = createTrafficFlow(roundabout, { seed: 11 });
  const branch = flow.network.links.find(link => link.roadId === 1 && link.from.z < -20 && link.to.z === -20);
  const ringExit = flow.network.links.find(link => link.roadId === 0 && link.from === branch.to && link.dx > .9);
  const ringCar = flow.addVehicle({ link: ringExit, dist: 2, length: 7, width: 2.5, speed: 8 });
  // Admission rejects bodies already at the junction mouth; start the branch
  // pair legally upstream and let the large circulating vehicle close the gap.
  const merging = flow.addVehicle({ link: branch, dist: 20, length: 5, speed: 8 });
  const following = flow.addVehicle({ link: branch, dist: 10, length: 5, speed: 8 });
  assert.ok(merging && following, 'opening placement stays legal upstream of the merge');
  let entered = false, followingEntered = false;
  for (let i = 0; i < 240; i++) {
    flow.update(.1);
    for (const link of flow.network.links) {
      const ordered = [...link.vehicles].sort((a, b) => a.dist - b.dist);
      for (let n = 1; n < ordered.length; n++) assert.ok(ordered[n].dist - ordered[n - 1].dist >= (ordered[n].length + ordered[n - 1].length) / 2 + 3 - .001);
    }
    for (let a = 0; a < flow.vehicles.length; a++) for (let b = a + 1; b < flow.vehicles.length; b++) assert.equal(flow.vehiclesOverlap(flow.vehicles[a], flow.vehicles[b]), false);
    entered ||= merging.link !== branch;
    followingEntered ||= following.link !== branch;
    if (entered && followingEntered) break;
  }
  assert.ok(entered && followingEntered, 'each waiting branch vehicle eventually receives a merge gap');
  assert.ok(flow.vehicles.includes(ringCar), 'ring traffic continues through the branch contact');
});

test('a roundabout keeps an occupied exit body-safe', () => {
  const roads = [...roundabout,
    { width: 10, points: [[20, 0], [60, 0]] },
    { width: 10, points: [[0, 20], [0, 60]] },
  ];
  const flow = createTrafficFlow(roads, { seed: 3 });
  const ring = flow.network.links.find(link => link.roadId === 0 && link.from.x === 20 && link.from.z === -20 && link.to.x === 20 && link.to.z === 0);
  const vehicle = flow.addVehicle({ link: ring, dist: 5, length: 5, speed: 8 });
  // The outgoing east spoke is empty while the ring's continuing link is busy.
  const continuing = flow.network.links.find(link => link.roadId === 0 && link.from === ring.to && link.to.x === 20 && link.to.z > 0);
  flow.addVehicle({ link: continuing, dist: 4, length: 5, speed: 8 });
  for (let i = 0; i < 80; i++) {
    flow.update(.1);
    for (let a = 0; a < flow.vehicles.length; a++) for (let b = a + 1; b < flow.vehicles.length; b++) assert.equal(flow.vehiclesOverlap(flow.vehicles[a], flow.vehicles[b]), false);
  }
  assert.equal(vehicle.done, false);
  assert.equal(vehicle.done, false);
});

// ── Regression: every segment must be drivable in BOTH directions ──────────
// A shorthand-property bug once built reverse links as `from -> from`
// self-loops, leaving the graph one-way and starving most networks of the
// directed circuits ambient traffic needs. Guard against it returning.
test('traffic graph exposes both travel directions for every segment', () => {
  const network = buildTrafficNetwork([{ width: 10, points: [[0, 0], [100, 0]] }]);
  const forward = network.links.find((l) => l.from.x === 0 && l.to.x === 100);
  const reverse = network.links.find((l) => l.from.x === 100 && l.to.x === 0);
  assert.ok(forward, 'forward link exists');
  assert.ok(reverse, 'reverse link exists (no missing backwards travel)');
  assert.equal(network.links.some((l) => l.from === l.to), false, 'no self-loop links');
});

test('every road template can sustain an ambient traffic circuit', () => {
  for (const template of ROAD_TEMPLATES) {
    const plan = planTrafficLoops(template.roads);
    assert.ok(plan.routes.length >= 1, `${template.id} should produce at least one route`);
    for (const route of plan.routes) {
      assert.equal(route.closed, true);
      assert.ok(Number.isFinite(route.length) && route.length >= 18);
    }
  }
});

test('a junction is three or more arms — elbows and bends are never junctions', () => {
  const elbow = [
    { width: 10, points: [[0, 0], [100, 0]] },
    { width: 10, points: [[100, 0], [100, 100]] },
  ];
  assert.equal(buildTrafficNetwork(elbow).junctions.length, 0, 'an elbow (two roads meeting end to end) is not a junction');
  const bend = [{ width: 10, points: [[0, 0], [100, 0], [100, 100]] }];
  assert.equal(buildTrafficNetwork(bend).junctions.length, 0, 'a single-road bend is not a junction');
  const t = [
    { width: 10, points: [[0, 0], [200, 0]] },
    { width: 10, points: [[100, 0], [100, 100]] },
  ];
  assert.equal(buildTrafficNetwork(t).junctions.length, 1, 'a T (three arms) is a junction');
  assert.equal(buildTrafficNetwork(grid).junctions.length, 1, 'a 4-way crossing (four arms) is a junction');
});

test('a ring with a dead-end spur circulates without a U-turn lollipop', () => {
  const ring = [];
  for (let i = 0; i <= 32; i++) { const a = (i / 32) * Math.PI * 2; ring.push([Math.round(Math.cos(a) * 120), Math.round(Math.sin(a) * 120)]); }
  const roads = [
    { width: 12, points: ring },
    { width: 12, points: [[420, 0], [120, 0]] },   // spur ending on the ring vertex
  ];
  const plan = planTrafficLoops(roads);
  assert.ok(plan.routes.length >= 1, 'the ring still gets a circuit');
  for (const route of plan.routes) {
    for (const link of route.links) {
      const reverse = route.links.find((o) => o !== link && o.roadId === link.roadId && o.from === link.to && o.to === link.from);
      assert.equal(reverse, undefined, 'no link is traversed in both directions (no U-turn lollipop)');
    }
  }
});

test('a densely hand-drawn ring keeps its circuit (freehand sampling never starves traffic)', () => {
  // Champion files are drawn by finger/mouse: a closed ring is sampled every
  // ~2-10 m, so many of its links are far shorter than the old 12 m usability
  // floor. That fragmented the ring and left the whole city carless.
  const SEGMENTS = 220, R = 340;
  const ring = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    const a = (i / SEGMENTS) * Math.PI * 2;
    const r = R + Math.sin(i * 0.7) * 6 + Math.cos(i * 0.23) * 4;   // hand-drawn wobble
    ring.push([Math.round(1000 + Math.cos(a) * r), Math.round(1000 + Math.sin(a) * r)]);
  }
  ring[ring.length - 1] = ring[0].slice();   // explicit closed loop
  const roads = [{ width: 7, class: 'residential', points: ring }];
  const network = buildTrafficNetwork(roads);
  assert.ok(network.links.some((link) => link.length < 12), 'fixture must reproduce dense sampling');
  const plan = planTrafficLoops(roads);
  assert.ok(plan.routes.length >= 1, 'a densely sampled closed ring still gets a circuit');

  const flow = createTrafficFlow(roads, { seed: 11 });
  const placements = initialLoopPlacements(flow.routePlan, 6);
  for (const placement of placements) flow.addVehicle({ ...placement, length: 5, width: 2.05, speed: 8 });
  const initial = flow.vehicles.length;
  assert.ok(initial > 0, 'a dense ring admits safely spaced vehicles');
  for (let tick = 0; tick < 1200; tick++) {
    flow.update(.1);
    assert.equal(flow.vehicles.length, initial, `frame ${tick}: no route vehicle disappeared`);
    for (let a = 0; a < flow.vehicles.length; a++) for (let b = a + 1; b < flow.vehicles.length; b++) {
      assert.equal(flow.vehiclesOverlap(flow.vehicles[a], flow.vehicles[b]), false, `frame ${tick}: no body overlap`);
    }
  }
});

test('loop startup reserves visible cars near the Champion without losing circuit coverage', () => {
  const roads = [
    { width: 9, points: [[0, 0], [300, 0], [300, 300], [0, 300], [0, 0]] },
    { width: 9, points: [[700, 0], [1100, 0], [1100, 400], [700, 400], [700, 0]] },
  ];
  const plan = planTrafficLoops(roads);
  const spawn = { x: 20, z: 20 };
  const placed = initialLoopPlacements(plan, 8, spawn);
  assert.equal(placed.length, 8);
  const near = placed[0].link;
  const midpoint = { x: (near.from.x + near.to.x) / 2, z: (near.from.z + near.to.z) / 2 };
  assert.ok(Math.hypot(midpoint.x - spawn.x, midpoint.z - spawn.z) < 300, 'first car is on the nearest circuit');
  assert.equal(new Set(placed.map((p) => p.route.componentId)).size, 2, 'remaining fleet still covers both districts');
});

test('a four-way grid of separate straight roads forms a directed cycle', () => {
  const roads = [
    { width: 12, points: [[0, 500], [1000, 500]] },
    { width: 12, points: [[0, 1000], [1000, 1000]] },
    { width: 12, points: [[500, 0], [500, 1500]] },
    { width: 12, points: [[1000, 0], [1000, 1500]] },
  ];
  assert.ok(planTrafficLoops(roads).routes.length >= 1);
});

// ── Junctions: a through road crossing a ring is a signalised X, not a merge ──
test('a ring crossed by a through road is a plain crossing; a ring with stubs is a roundabout', () => {
  const ring = { width: 10, points: [[-20, -20], [20, -20], [20, 20], [-20, 20], [-20, -20]] };
  const crossed = buildTrafficNetwork([ring, { width: 10, points: [[-60, 0], [60, 0]] }]);
  const crossedJunctions = crossed.junctions.filter(j => j.node.x === -20 || j.node.x === 20);
  assert.ok(crossedJunctions.length >= 2, 'the through road splits the ring at two junctions');
  for (const j of crossedJunctions) {
    assert.equal(j.kind, 'cross', 'a through road across a ring is an ordinary crossing');
    assert.equal(j.roundabout, false, 'it must not trigger roundabout merge behaviour');
  }
  const stub = buildTrafficNetwork([ring, { width: 10, points: [[0, -60], [0, -20]] }]);
  const merge = stub.junctions.find(j => j.node.z === -20);
  assert.equal(merge.kind, 'roundabout');
  assert.equal(merge.roundabout, true);
});

test('where a district can circulate, a plain crossing is taken straight-only', () => {
  const plan = planTrafficLoops(sampleCityRoads());
  assert.ok(plan.routes.length >= 1);
  // The example city's OUTER-ring crossings are plain Xs. (Its central merges
  // are a genuine roundabout, so they are deliberately not 'cross'.)
  const outer = plan.network.junctions.filter(j => Math.hypot(j.node.x - CITY_X, j.node.z - CITY_Z) > 200);
  assert.ok(outer.length >= 8, 'the example has outer-ring crossings');
  assert.ok(outer.every(j => j.kind === 'cross'), 'the outer crossings are plain Xs');
  assert.ok(plan.network.junctions.some(j => j.kind === 'roundabout'), 'the central merges are a roundabout');
  for (const route of plan.routes) {
    route.links.forEach((link, index) => {
      const junction = plan.network.junctionByNode.get(link.to.id);
      if (!junction || junction.kind !== 'cross') return;
      const next = route.links[(index + 1) % route.links.length];
      const dot = link.dx * next.dx + link.dz * next.dz;
      const straightMost = Math.max(...link.to.links
        .filter(candidate => candidate.to !== link.from)
        .map(candidate => link.dx * candidate.dx + link.dz * candidate.dz));
      assert.ok(dot >= straightMost - 1e-9, 'a route never turns across traffic at a plain crossing');
    });
  }
});

test('straight-only never empties a grid district: turning is restored where circulation needs it', () => {
  // A pure grid cannot go around a block without turning at a crossing, so the
  // planner must fall back to legal turns rather than leave the city carless.
  const gridTemplate = ROAD_TEMPLATES.find(template => template.id === 'grid');
  const plan = planTrafficLoops(gridTemplate.roads);
  assert.ok(plan.network.junctions.some(j => j.kind === 'cross'), 'the grid crossings are plain Xs');
  assert.ok(plan.routes.length >= 1, 'the grid still receives ambient traffic');
});

test('traffic signals are placed on the verge, never in a carriageway', () => {
  const cases = [['sample-city', sampleCityRoads()], ...ROAD_TEMPLATES.map(template => [template.id, template.roads])];
  for (const [name, roads] of cases) {
    const network = buildTrafficNetwork(roads);
    const spots = trafficLightSpots(network);
    for (const spot of spots) {
      assert.equal(pointInRoadCarriageway(network, spot.x, spot.z, 1.2), false,
        `${name}: a signal is on the asphalt`);
      assert.ok(roadEdgeClearance(network, spot.x, spot.z) >= 1.2,
        `${name}: a signal has no verge clearance`);
    }
    for (let a = 0; a < spots.length; a++) for (let b = a + 1; b < spots.length; b++) {
      assert.ok(Math.hypot(spots[a].x - spots[b].x, spots[a].z - spots[b].z) >= 2.4 - 1e-6,
        `${name}: two signals occupy the same spot`);
    }
  }
});
