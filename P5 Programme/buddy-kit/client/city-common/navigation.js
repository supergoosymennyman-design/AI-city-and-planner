// Pure X/Z waypoint planning for the AI City Champion.
// Obstacles use the same oriented-box shape as collision.js. The planner
// inflates them by the Champion's radius, then searches a visibility graph
// made from their corners. This keeps live navigation deterministic and small
// enough for a buildless browser app.

const EPSILON = 0.03;

function finitePoint(point) {
  return point && Number.isFinite(point.x) && Number.isFinite(point.z);
}

function axes(body) {
  const magnitude = Math.hypot(body?.dx, body?.dz) || 1;
  const fx = Number.isFinite(body?.dx) ? body.dx / magnitude : Math.sin(body?.yaw || 0);
  const fz = Number.isFinite(body?.dz) ? body.dz / magnitude : Math.cos(body?.yaw || 0);
  return { fx, fz, rx: -fz, rz: fx };
}

function inflated(body, clearance) {
  const a = axes(body);
  return {
    ...body, ...a,
    halfLength: Math.max(0.001, Number(body?.length) / 2 + clearance),
    halfWidth: Math.max(0.001, Number(body?.width) / 2 + clearance),
  };
}

function localPoint(point, obstacle) {
  const x = point.x - obstacle.x, z = point.z - obstacle.z;
  return {
    forward: x * obstacle.fx + z * obstacle.fz,
    right: x * obstacle.rx + z * obstacle.rz,
  };
}

function worldPoint(obstacle, forward, right) {
  return {
    x: obstacle.x + obstacle.fx * forward + obstacle.rx * right,
    z: obstacle.z + obstacle.fz * forward + obstacle.rz * right,
  };
}

function pointInside(point, obstacle, inset = 0) {
  const p = localPoint(point, obstacle);
  return Math.abs(p.forward) < obstacle.halfLength - inset
    && Math.abs(p.right) < obstacle.halfWidth - inset;
}

// Slab intersection against the open interior of an oriented rectangle.
// Boundary-grazing visibility remains valid, which lets paths use corners.
function segmentCrossesObstacle(a, b, obstacle) {
  const p = localPoint(a, obstacle), q = localPoint(b, obstacle);
  const minF = -obstacle.halfLength + EPSILON;
  const maxF = obstacle.halfLength - EPSILON;
  const minR = -obstacle.halfWidth + EPSILON;
  const maxR = obstacle.halfWidth - EPSILON;
  let lo = 0, hi = 1;
  for (const [start, delta, min, max] of [
    [p.forward, q.forward - p.forward, minF, maxF],
    [p.right, q.right - p.right, minR, maxR],
  ]) {
    if (Math.abs(delta) < 1e-9) {
      if (start <= min || start >= max) return false;
      continue;
    }
    let enter = (min - start) / delta, exit = (max - start) / delta;
    if (enter > exit) [enter, exit] = [exit, enter];
    lo = Math.max(lo, enter); hi = Math.min(hi, exit);
    if (lo >= hi) return false;
  }
  return hi > 0 && lo < 1 && lo < hi;
}

function withinBounds(point, bounds) {
  if (!bounds) return true;
  return point.x >= bounds.minX && point.x <= bounds.maxX
    && point.z >= bounds.minZ && point.z <= bounds.maxZ;
}

function visible(a, b, obstacles, bounds) {
  if (!withinBounds(a, bounds) || !withinBounds(b, bounds)) return false;
  return !obstacles.some(obstacle => segmentCrossesObstacle(a, b, obstacle));
}

function cornerPoints(obstacle) {
  const l = obstacle.halfLength + EPSILON;
  const w = obstacle.halfWidth + EPSILON;
  return [worldPoint(obstacle, l, w), worldPoint(obstacle, l, -w),
    worldPoint(obstacle, -l, w), worldPoint(obstacle, -l, -w)];
}

function approachPoints(obstacle) {
  const l = obstacle.halfLength + EPSILON;
  const w = obstacle.halfWidth + EPSILON;
  return [worldPoint(obstacle, l, 0), worldPoint(obstacle, -l, 0),
    worldPoint(obstacle, 0, w), worldPoint(obstacle, 0, -w),
    ...cornerPoints(obstacle)];
}

function addUnique(nodes, point, goal = false) {
  const found = nodes.findIndex(node => Math.hypot(node.x - point.x, node.z - point.z) < 0.01);
  if (found >= 0) { if (goal) nodes[found].goal = true; return found; }
  nodes.push({ x: point.x, z: point.z, goal });
  return nodes.length - 1;
}

/**
 * Plan a shortest collision-free route.
 *
 * `targetObstacleId` identifies a destination building. The route then ends at
 * its nearest reachable perimeter approach rather than its blocked centre.
 * Returned `points` exclude the start and are ready to consume as waypoints.
 */
export function planGroundRoute({ start, target, obstacles = [], targetObstacleId = null,
  clearance = 0, bounds = null } = {}) {
  if (!finitePoint(start) || !finitePoint(target)) return { ok: false, reason: 'invalid' };
  const expanded = obstacles.filter(body => finitePoint(body) && Number.isFinite(body.width) && Number.isFinite(body.length))
    .map(body => inflated(body, Math.max(0, clearance)));
  const destination = targetObstacleId == null ? null
    : expanded.find(body => body.id === targetObstacleId);
  const blockers = expanded;
  // Selecting the building the Champion is already standing beside is a
  // successful arrival, not an unreachable path through the inflated body.
  // The collision pass remains the authority if corrupted state put the
  // Champion inside the building's physical footprint.
  if (destination && pointInside(start, destination)) {
    return { ok: true, distance: 0, points: [], approach: { x: start.x, z: start.z } };
  }
  const goals = destination ? approachPoints(destination) : [{ x: target.x, z: target.z }];
  const validGoals = goals.filter(goal => withinBounds(goal, bounds)
    && !blockers.some(obstacle => obstacle !== destination && pointInside(goal, obstacle, EPSILON)));
  if (!validGoals.length) return { ok: false, reason: 'blocked-target' };

  const nodes = [{ x: start.x, z: start.z, goal: false }];
  for (const goal of validGoals) addUnique(nodes, goal, true);
  for (const obstacle of blockers) {
    for (const corner of cornerPoints(obstacle)) {
      if (withinBounds(corner, bounds)
        && !blockers.some(other => other !== obstacle && pointInside(corner, other, EPSILON))) addUnique(nodes, corner);
    }
  }

  const adjacency = Array.from({ length: nodes.length }, () => []);
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (!visible(nodes[i], nodes[j], blockers, bounds)) continue;
      const cost = Math.hypot(nodes[j].x - nodes[i].x, nodes[j].z - nodes[i].z);
      adjacency[i].push([j, cost]); adjacency[j].push([i, cost]);
    }
  }

  const distance = new Array(nodes.length).fill(Infinity);
  const previous = new Array(nodes.length).fill(-1);
  const visited = new Array(nodes.length).fill(false);
  distance[0] = 0;
  for (;;) {
    let current = -1, best = Infinity;
    for (let i = 0; i < nodes.length; i++) if (!visited[i] && distance[i] < best) {
      current = i; best = distance[i];
    }
    if (current < 0) break;
    visited[current] = true;
    for (const [next, cost] of adjacency[current]) {
      const candidate = distance[current] + cost;
      if (candidate < distance[next]) { distance[next] = candidate; previous[next] = current; }
    }
  }
  let end = -1, best = Infinity;
  for (let i = 0; i < nodes.length; i++) if (nodes[i].goal && distance[i] < best) {
    end = i; best = distance[i];
  }
  if (end < 0 || !Number.isFinite(best)) return { ok: false, reason: 'unreachable' };
  const indices = [];
  for (let cursor = end; cursor >= 0; cursor = previous[cursor]) indices.push(cursor);
  indices.reverse();
  return {
    ok: true,
    distance: best,
    points: indices.slice(1).map(index => ({ x: nodes[index].x, z: nodes[index].z })),
    approach: { x: nodes[end].x, z: nodes[end].z },
  };
}

/** Advance past every waypoint already inside `radius`. */
export function advanceGroundRoute(route, position, radius = 0.2) {
  if (!route?.points?.length || !finitePoint(position)) return { done: true, index: route?.index || 0, waypoint: null };
  let index = Math.max(0, route.index || 0);
  while (index < route.points.length
    && Math.hypot(route.points[index].x - position.x, route.points[index].z - position.z) <= radius) index++;
  return { done: index >= route.points.length, index, waypoint: route.points[index] || null };
}

export function routeHasClearance(points, obstacles = [], clearance = 0) {
  if (!Array.isArray(points) || points.length < 2) return true;
  const expanded = obstacles.map(body => inflated(body, Math.max(0, clearance)));
  for (let i = 1; i < points.length; i++) if (!visible(points[i - 1], points[i], expanded, null)) return false;
  return true;
}
