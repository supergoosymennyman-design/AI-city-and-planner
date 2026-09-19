import { sanitizeLayout } from './layout.js';
import { buildWalkGraph, walkPath, WALK_BUDGET } from './walkability.js';

const EPSILON = 0.05;

function distance(a, b) { return Math.hypot(b.x - a.x, b.z - a.z); }
function pathDistance(path) {
  let total = 0;
  for (let i = 1; i < (path?.length || 0); i++) total += distance(path[i - 1], path[i]);
  return total;
}
function point(pos) { return { x: Number(pos?.[0]), z: Number(pos?.[1]) }; }
function addPoint(out, p) {
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return;
  if (!out.length || distance(out[out.length - 1], p) > 0.01) out.push({ x: p.x, z: p.z });
}

/**
 * Verify the road-space transform used by the renderer. Densification applies
 * one uniform compression plus a translation to every road point. Buildings
 * can then move independently during separation, so they are deliberately not
 * used to fit this transform.
 */
export function verifyRoadTransform(sourceLayout, renderedLayout, tolerance = EPSILON) {
  const sourceRoads = sourceLayout?.roads || [];
  const renderedRoads = renderedLayout?.roads || [];
  if (!sourceRoads.length || sourceRoads.length !== renderedRoads.length) {
    return { ok: false, reason: 'road-count', scale: null, tx: null, tz: null, maxError: null };
  }
  const pairs = [];
  for (let r = 0; r < sourceRoads.length; r++) {
    const a = sourceRoads[r]?.points || [], b = renderedRoads[r]?.points || [];
    if (a.length !== b.length) return { ok: false, reason: 'road-points', scale: null, tx: null, tz: null, maxError: null };
    for (let i = 0; i < a.length; i++) pairs.push({ a: point(a[i]), b: point(b[i]) });
  }
  if (pairs.length < 2 || pairs.some(({ a, b }) => ![a.x, a.z, b.x, b.z].every(Number.isFinite))) {
    return { ok: false, reason: 'road-points', scale: null, tx: null, tz: null, maxError: null };
  }
  const mean = (items, axis) => items.reduce((sum, p) => sum + p[axis], 0) / items.length;
  const src = pairs.map(p => p.a), dst = pairs.map(p => p.b);
  const sx = mean(src, 'x'), sz = mean(src, 'z'), dx = mean(dst, 'x'), dz = mean(dst, 'z');
  let covariance = 0, variance = 0;
  for (const p of pairs) {
    covariance += (p.a.x - sx) * (p.b.x - dx) + (p.a.z - sz) * (p.b.z - dz);
    variance += (p.a.x - sx) ** 2 + (p.a.z - sz) ** 2;
  }
  if (variance < 1e-6) return { ok: false, reason: 'degenerate-roads', scale: null, tx: null, tz: null, maxError: null };
  const scale = covariance / variance;
  const tx = dx - scale * sx, tz = dz - scale * sz;
  let maxError = 0;
  for (const p of pairs) maxError = Math.max(maxError, Math.hypot(p.a.x * scale + tx - p.b.x, p.a.z * scale + tz - p.b.z));
  const ok = Number.isFinite(scale) && scale > 0 && maxError <= tolerance;
  return { ok, reason: ok ? null : 'road-transform', scale, tx, tz, maxError };
}

function unavailable(status, budget = WALK_BUDGET) {
  return {
    status, ok: false, budget, sourceDistance: null, worldDistance: null,
    sourcePath: [], worldPath: [], directions: [], transform: null,
  };
}

function bearing(a, b) {
  const angle = Math.atan2(b.x - a.x, -(b.z - a.z)) * 180 / Math.PI;
  return (angle + 360) % 360;
}
function heading(angle) {
  return ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(angle / 45) % 8];
}
function turn(before, after) {
  let delta = after - before;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  if (Math.abs(delta) < 25) return 'continue';
  if (Math.abs(delta) > 155) return 'turn-around';
  return delta > 0 ? 'right' : 'left';
}

/** Structured, localisable directions. Text remains complete without speech. */
export function routeDirections(path) {
  if (!Array.isArray(path) || path.length < 2) return [];
  const legs = [];
  for (let i = 1; i < path.length; i++) {
    const metres = distance(path[i - 1], path[i]);
    if (metres < 0.5) continue;
    const angle = bearing(path[i - 1], path[i]);
    const last = legs[legs.length - 1];
    if (last && Math.abs((((angle - last.angle) + 540) % 360) - 180) < 12) last.metres += metres;
    else legs.push({ angle, metres });
  }
  return legs.map((leg, i) => ({
    action: i === 0 ? 'start' : turn(legs[i - 1].angle, leg.angle),
    heading: heading(leg.angle),
    metres: Math.round(leg.metres),
  }));
}

/**
 * Produce original-plan Dijkstra evidence first, then a separately verified
 * route in rendered road space with explicit building-to-road entrance links.
 */
export function buildVisitorRoute(rawSourceLayout, renderedLayout, fromIndex, toIndex, budget = WALK_BUDGET) {
  const sourceLayout = sanitizeLayout(rawSourceLayout || {});
  const from = sourceLayout.buildings[fromIndex], to = sourceLayout.buildings[toIndex];
  const renderedFrom = renderedLayout?.buildings?.[fromIndex], renderedTo = renderedLayout?.buildings?.[toIndex];
  if (!from || !to || !renderedFrom || !renderedTo) return unavailable('unavailable-selection', budget);
  if (!(sourceLayout.roads || []).length || !(renderedLayout?.roads || []).length) return unavailable('no-road-access', budget);

  const sourceGraph = buildWalkGraph(sourceLayout);
  const sourceA = sourceGraph?.access?.buildings?.[fromIndex];
  const sourceB = sourceGraph?.access?.buildings?.[toIndex];
  if (!sourceA || !sourceB) return unavailable('no-road-access', budget);
  const sourceRoadPath = walkPath(sourceGraph, sourceA.node, sourceB.node);
  if (!sourceRoadPath) return unavailable('disconnected', budget);

  const sourcePath = [];
  addPoint(sourcePath, point(from.pos));
  addPoint(sourcePath, { x: sourceA.x, z: sourceA.z });
  for (const p of sourceRoadPath) addPoint(sourcePath, p);
  addPoint(sourcePath, { x: sourceB.x, z: sourceB.z });
  addPoint(sourcePath, point(to.pos));
  const sourceDistance = pathDistance(sourcePath);
  const transform = verifyRoadTransform(sourceLayout, renderedLayout);
  if (!transform.ok) return {
    ...unavailable('geometry-unverified', budget), transform,
    sourceDistance: Math.round(sourceDistance), sourcePath,
  };

  // Separation can move either building after roads are transformed. Rebuild
  // access in rendered space rather than pretending one scale maps entrances.
  const worldGraph = buildWalkGraph(renderedLayout);
  const worldA = worldGraph?.access?.buildings?.[fromIndex];
  const worldB = worldGraph?.access?.buildings?.[toIndex];
  if (!worldA || !worldB) return { ...unavailable('no-road-access', budget), transform, sourceDistance: Math.round(sourceDistance), sourcePath };
  const worldRoadPath = walkPath(worldGraph, worldA.node, worldB.node);
  if (!worldRoadPath) return { ...unavailable('disconnected', budget), transform, sourceDistance: Math.round(sourceDistance), sourcePath };
  const worldPath = [];
  addPoint(worldPath, point(renderedFrom.pos));
  addPoint(worldPath, { x: worldA.x, z: worldA.z });
  for (const p of worldRoadPath) addPoint(worldPath, p);
  addPoint(worldPath, { x: worldB.x, z: worldB.z });
  addPoint(worldPath, point(renderedTo.pos));
  const worldDistance = pathDistance(worldPath);
  const within = sourceDistance <= budget;
  return {
    status: within ? 'reachable' : 'over-budget', ok: within, budget,
    sourceDistance: Math.round(sourceDistance), worldDistance: Math.round(worldDistance),
    sourcePath, worldPath, directions: routeDirections(worldPath), transform,
    entranceLinks: {
      start: Math.round(distance(point(renderedFrom.pos), { x: worldA.x, z: worldA.z })),
      end: Math.round(distance({ x: worldB.x, z: worldB.z }, point(renderedTo.pos))),
    },
  };
}

export function browserSpeechAvailable(scope = globalThis) {
  return !!scope?.speechSynthesis && typeof scope?.SpeechSynthesisUtterance === 'function';
}

export function speakRouteDirections(lines, scope = globalThis, lang = 'en-HK') {
  if (!browserSpeechAvailable(scope) || !Array.isArray(lines) || !lines.length) return false;
  try {
    scope.speechSynthesis.cancel();
    const utterance = new scope.SpeechSynthesisUtterance(lines.join('. '));
    utterance.lang = lang;
    scope.speechSynthesis.speak(utterance);
    return true;
  } catch { return false; }
}
