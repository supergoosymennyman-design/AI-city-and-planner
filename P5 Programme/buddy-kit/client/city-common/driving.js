// city-common/driving.js — the SELF-DRIVING skill's pure rules.
//
// Stage 5. A student's published numeric classifier (`.cap` v2, the SHARED
// Workshop k-NN) reads a fixed sensor observation and predicts ONE of five
// actions. This module owns the whole contract the plan names:
//
//   • the OBSERVATION CONTRACT (left/centre/right obstacle distance, lane
//     offset, heading error, speed, traffic-light state, intended turn);
//   • the FIVE ACTIONS and their EXPLICIT fixed actuator mappings
//     (forward / left / right / slow / stop) — the City never invents motion
//     the model did not ask for;
//   • a deterministic 10 Hz fixed-step vehicle + track simulation;
//   • the honest stop rules: missing input, abstention, timeout, runtime
//     failure, collision and off-road all STOP the vehicle and are recorded as
//     events — there is no hidden successful driver behind the model.
//
// Pure: no DOM, no clock, no randomness. `node --test` runs the exact maths the
// browser runs, so "changing the model changes vehicle actions" is provable
// without a page.
import { runInference, CAP_ABSTAIN } from './cap-runtime.js';

// ── the contract ─────────────────────────────────────────────────────────────

/**
 * The observation fields, IN ORDER. The order is the order the Workshop's
 * number sense extracts them from a sensor sticker and the order a published
 * bundle stores them, so a Workshop-trained model and the City runtime compare
 * the same number in the same slot.
 */
export const DRIVE_FIELDS = Object.freeze([
  'left', 'center', 'right', 'laneOffset', 'headingError', 'speed', 'trafficLight', 'turnIntent',
]);

/** The five actions. These are the bundle's output labels — nothing else drives. */
export const DRIVE_ACTIONS = Object.freeze(['forward', 'left', 'right', 'slow', 'stop']);

/**
 * The bias constant appended before unit-normalization. Identical to the
 * Workshop number sense's own `numberVec(..., 10)` (logic/brain's scale-free
 * convention): with it, "all sensors zero" and "all sensors 10" are different
 * directions, so a stopped car at a clear junction is not the same input as a
 * car ten units from everything.
 */
export const DRIVE_PLUS_CONSTANT = 10;

/** The host kind a driving capability installs on (skill-registry hostType). */
export const DRIVE_HOST_TYPE = 'driver';

/** Sensor ranges (also the crate's schema for the Workshop dataset). */
export const DRIVE_SENSOR_RANGE = Object.freeze({
  obstacle: [0, 40], laneOffset: [-6, 6], headingError: [-Math.PI, Math.PI],
  speed: [0, 16], trafficLight: [0, 2], turnIntent: [0, 2],
});
/** Distance at which "nothing is there" reads. */
export const DRIVE_CLEAR_DISTANCE = 40;
export const DRIVE_LOOKAHEAD = 25;   // m — a light/turn is only reported inside this
export const DRIVE_TURN_LOOKAHEAD = 25;

/** Traffic-light codes (0 green, 1 amber, 2 red). */
export const LIGHT_GREEN = 0, LIGHT_AMBER = 1, LIGHT_RED = 2;

/**
 * The fixed actuator mapping. `speed` is the target cruise for the action,
 * `accel`/`brake` the m/s² rates, `steer` the turn rate in rad/s (positive =
 * right). These are constants of the simulator, NOT learned — the plan's
 * "explicit fixed actuator mappings translate those decisions into movement".
 */
export const ACTUATORS = Object.freeze({
  forward: { speed: 8,  accel: 5, brake: 8, steer: 0, label: 'forward' },
  left:    { speed: 6,  accel: 4, brake: 8, steer: -0.5, label: 'left' },
  right:   { speed: 6,  accel: 4, brake: 8, steer: 0.5, label: 'right' },
  slow:    { speed: 3,  accel: 3, brake: 6, steer: 0, label: 'slow' },
  stop:    { speed: 0,  accel: 0, brake: 12, steer: 0, label: 'stop' },
});

/** How the fixed-step simulation advances. 10 Hz, as the plan specifies. */
export const DRIVE_DT = 0.1;
export const DRIVE_MAX_STEPS = 1200;   // 120 s at 10 Hz — a runaway trial is a timeout
export const CAR_RADIUS = 0.9;
export const ROAD_HALF_WIDTH = 6;      // metres; the lane centre is ±ROAD_HALF_WIDTH/2 wide

const wrapAngle = (a) => {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round3 = (n) => Math.round(n * 1000) / 1000;

// ── the track ────────────────────────────────────────────────────────────────

function segmentsOf(points) {
  const segments = [];
  let s = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    segments.push({ a, b, dx, dz, len, heading: len ? Math.atan2(dx, dz) : 0, s0: s });
    s += len;
  }
  return { segments, length: s };
}

/**
 * Build a track from a plain spec. Deterministic — the spec is data, and every
 * derived value (segment headings, cumulative distance, light phases) follows
 * from it.
 * @param {{id:string, points:Array<[number,number]>, width?:number, obstacles?:Array<{x,z,r,kind?}>, light?:{s:number, phases:Array<{state:'green'|'amber'|'red', seconds:number}>}, turns?:Array<{from:number,to:number,dir:'left'|'right'}>, goalMarge?:number}} spec
 */
export function buildTrack(spec = {}) {
  const points = (spec.points || []).map(([x, z]) => ({ x, z }));
  const { segments, length } = segmentsOf(points);
  const phases = (spec.light?.phases || []).map((p) => ({ state: p.state, seconds: p.seconds }));
  const cycle = phases.reduce((n, p) => n + p.seconds, 0);
  return {
    id: spec.id || 'track',
    points,
    segments,
    length,
    width: spec.width || ROAD_HALF_WIDTH * 2,
    obstacles: (spec.obstacles || []).map((o) => ({ x: o.x, z: o.z, r: o.r ?? 0.6, kind: o.kind || 'block' })),
    light: spec.light ? { s: spec.light.s || 0, phases, cycle } : null,
    turns: (spec.turns || []).map((t) => ({ from: t.from, to: t.to, dir: t.dir })),
  };
}

/** The light's state at time `t` (seconds into the trial). */
export function lightStateAt(track, t) {
  if (!track?.light || !track.light.cycle) return LIGHT_GREEN;
  let into = ((t % track.light.cycle) + track.light.cycle) % track.light.cycle;
  for (const p of track.light.phases) {
    if (into < p.seconds) return p.state === 'red' ? LIGHT_RED : p.state === 'amber' ? LIGHT_AMBER : LIGHT_GREEN;
    into -= p.seconds;
  }
  return LIGHT_GREEN;
}

/** The nearest point on the centreline to (x,z) — { s, lateral, tangent }. */
export function projectToTrack(track, x, z) {
  let best = null;
  for (const seg of track.segments) {
    if (!seg.len) continue;
    const t = clamp(((x - seg.a.x) * seg.dx + (z - seg.a.z) * seg.dz) / (seg.len * seg.len), 0, 1);
    const px = seg.a.x + seg.dx * t, pz = seg.a.z + seg.dz * t;
    const dist2 = (x - px) ** 2 + (z - pz) ** 2;
    if (!best || dist2 < best.dist2) best = { dist2, px, pz, t, seg };
  }
  if (!best) return { s: 0, lateral: 0, tangent: 0, x, z };
  // Right-hand normal of the travel direction (heading h: forward = (sin h, cos h)).
  const rx = Math.cos(best.seg.heading), rz = -Math.sin(best.seg.heading);
  const lateral = (x - best.px) * rx + (z - best.pz) * rz;
  return { s: best.seg.s0 + best.t * best.seg.len, lateral, tangent: best.seg.heading, x: best.px, z: best.pz };
}

// ── the guided test track (straight → curve → obstacle → traffic light) ──────

function arcPoints(cx, cz, r, a0, a1, n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * (i / n);
    out.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]);
  }
  return out;
}
function linePoints(x0, z0, x1, z1, n) {
  const out = [];
  for (let i = 0; i <= n; i++) out.push([x0 + (x1 - x0) * (i / n), z0 + (z1 - z0) * (i / n)]);
  return out;
}

// The guided test track: a straight run, a 90° left curve (its required turn),
// a cone in the lane, and a traffic light on the first straight.
const FULL_POINTS = [
  ...linePoints(0, 0, 0, 60, 12),
  ...arcPoints(-40, 60, 40, 0, Math.PI / 2, 16).slice(1),
  ...linePoints(-40, 100, -90, 100, 10).slice(1),
];

export const TRACKS = Object.freeze({
  straight: buildTrack({ id: 'straight', points: linePoints(0, 0, 0, 120, 12), width: 12 }),
  curve: buildTrack({ id: 'curve', points: [...linePoints(0, 0, 0, 40, 8), ...arcPoints(-40, 40, 40, 0, Math.PI / 2, 16).slice(1), ...linePoints(-40, 80, -90, 80, 8).slice(1)], width: 12 }),
  obstacle: buildTrack({ id: 'obstacle', points: linePoints(0, 0, 0, 120, 12), width: 12, obstacles: [{ x: 2.5, z: 60, r: 0.7, kind: 'cone' }] }),
  light: buildTrack({ id: 'light', points: linePoints(0, 0, 0, 120, 12), width: 12, light: { s: 45, phases: [{ state: 'red', seconds: 6 }, { state: 'green', seconds: 10 }] } }),
  full: buildTrack({
    id: 'full',
    points: FULL_POINTS,
    width: 12,
    obstacles: [{ x: -65, z: 102.5, r: 0.7, kind: 'cone' }],
    light: { s: 30, phases: [{ state: 'red', seconds: 6 }, { state: 'green', seconds: 20 }] },
    turns: [{ from: 58, to: 122, dir: 'left' }],
  }),
});

/** A fresh vehicle at the start of a track. */
export function createCar(track, { laneOffset = 0 } = {}) {
  const seg = track.segments[0] || { heading: 0, a: { x: 0, z: 0 } };
  const start = track.points[0] || { x: 0, z: 0 };
  const rx = Math.cos(seg.heading), rz = -Math.sin(seg.heading);
  return {
    x: start.x + rx * laneOffset,
    z: start.z + rz * laneOffset,
    heading: seg.heading,
    speed: 0,
  };
}

// ── sensing ──────────────────────────────────────────────────────────────────

// A narrow centre cone (≈±8°) with wide side cones, matching how a driver reads
// "something in my lane, slightly left, slightly right".
const BAND_HALF = { left: [-Math.PI * 0.33, -Math.PI * 0.045], center: [-Math.PI * 0.045, Math.PI * 0.045], right: [Math.PI * 0.045, Math.PI * 0.33] };

/**
 * Read the world into the fixed observation. ALWAYS returns every field, so a
 * bundle that declares all eight fields is never handed a missing one — the
 * simulator's OWN failures (missing input) are injected only by the trial
 * runner, never faked here.
 * @param {object} track
 * @param {{x:number,z:number,heading:number,speed:number}} car
 * @param {number} t  seconds into the trial
 */
export function sense(track, car, t) {
  const proj = projectToTrack(track, car.x, car.z);
  const bands = { left: DRIVE_CLEAR_DISTANCE, center: DRIVE_CLEAR_DISTANCE, right: DRIVE_CLEAR_DISTANCE };
  for (const o of track.obstacles) {
    const dx = o.x - car.x, dz = o.z - car.z;
    const dist = Math.hypot(dx, dz) - (o.r + CAR_RADIUS);
    if (dist > DRIVE_CLEAR_DISTANCE) continue;
    const bearing = wrapAngle(Math.atan2(dx, dz) - car.heading);
    for (const [band, [lo, hi]] of Object.entries(BAND_HALF)) {
      if (bearing >= lo && bearing < hi) bands[band] = Math.min(bands[band], Math.max(0, dist));
    }
  }
  // A traffic light only speaks while the car is approaching it.
  let trafficLight = LIGHT_GREEN;
  if (track.light && track.light.s - proj.s > -2 && track.light.s - proj.s < DRIVE_LOOKAHEAD) {
    trafficLight = lightStateAt(track, t);
  }
  // An intended turn only speaks while it is coming up.
  let turnIntent = 0;
  for (const turn of track.turns) {
    if (turn.from - proj.s > -2 && turn.from - proj.s < DRIVE_TURN_LOOKAHEAD) {
      turnIntent = turn.dir === 'left' ? 1 : 2;
      break;
    }
    if (proj.s >= turn.from && proj.s <= turn.to) { turnIntent = turn.dir === 'left' ? 1 : 2; break; }
  }
  const observation = {
    left: round3(bands.left),
    center: round3(bands.center),
    right: round3(bands.right),
    laneOffset: round3(clamp(proj.lateral, -DRIVE_SENSOR_RANGE.laneOffset[1], DRIVE_SENSOR_RANGE.laneOffset[1])),
    headingError: round3(wrapAngle(car.heading - proj.tangent)),
    speed: round3(car.speed),
    trafficLight,
    turnIntent,
  };
  return { observation, s: proj.s, lateral: proj.lateral, tangent: proj.tangent };
}

// ── decisions → motion ───────────────────────────────────────────────────────

/**
 * Read an inference result the way the simulator must: an abstention, a missing
 * result, or an unknown label all mean STOP (the plan's honesty rules).
 * @returns {{action:string, stop:boolean, reason:string|null}}
 */
export function decideAction(inference) {
  if (!inference || typeof inference !== 'object') return { action: 'stop', stop: true, reason: 'missing-input' };
  if (inference.abstained || inference.decision === CAP_ABSTAIN) {
    return { action: 'stop', stop: true, reason: `abstain:${inference.abstainReason || 'unknown'}` };
  }
  if (!DRIVE_ACTIONS.includes(inference.decision)) return { action: 'stop', stop: true, reason: 'unknown-action' };
  return { action: inference.decision, stop: false, reason: null };
}

/** The actuator for an action, or the STOP actuator for anything unrecognised. */
export function actuatorFor(action) { return ACTUATORS[action] || ACTUATORS.stop; }

const REQUIRED_STOP_CENTER = 6;   // m — an obstacle this close ahead is a required stop
const GOAL_MARGIN = 3;            // m from the end counts as finished

/**
 * One fixed step. Takes the CURRENT car + the inference result and returns the
 * next car, the event (when something ended the trial) and the step record.
 * Pure — the caller owns the state.
 */
export function advanceStep(track, car, inference, { t = 0, dt = DRIVE_DT, step = 0, source = 'model' } = {}) {
  const { observation, s } = sense(track, car, t);
  const decision = decideAction(inference);
  const actuator = actuatorFor(decision.action);
  // Speed dynamics toward the actuator's target.
  let speed = car.speed;
  if (speed < actuator.speed) speed = Math.min(actuator.speed, speed + actuator.accel * dt);
  else speed = Math.max(actuator.speed, speed - actuator.brake * dt);
  // Steering scales with speed (a stopped car does not pivot), with a small
  // floor so a car creeping at walking pace can still correct its line.
  const grip = clamp(speed / 6, 0.25, 1);
  const heading = wrapAngle(car.heading + actuator.steer * grip * dt);
  const x = car.x + Math.sin(heading) * speed * dt;
  const z = car.z + Math.cos(heading) * speed * dt;
  const next = { x, z, heading, speed };

  let event = null;
  // 1. Collision against an obstacle (r + car radius).
  for (const o of track.obstacles) {
    if (Math.hypot(o.x - x, o.z - z) <= o.r + CAR_RADIUS) { event = { type: 'collision', obstacle: o.kind }; break; }
  }
  // 2. Off-road.
  const proj = projectToTrack(track, x, z);
  if (!event && Math.abs(proj.lateral) > track.width / 2) event = { type: 'off-road', lateral: round3(proj.lateral) };
  // 3. The model's own stop: an abstention / missing input / unknown label, or a
  //    deliberate "stop" action with a clear road ahead (an emergency stop).
  //    This is evaluated BEFORE the finish line on purpose: a car that stops
  //    inside the goal margin has NOT reached the goal, and reporting it as one
  //    was a review-found lie. Only a still-moving arrival counts as a goal.
  const wantsStop = decision.stop || decision.action === 'stop';
  if (!event && wantsStop) {
    const required = observation.trafficLight === LIGHT_RED || observation.center < REQUIRED_STOP_CENTER;
    event = { type: required ? 'stop-required' : 'emergency-stop', reason: decision.reason || (decision.stop ? null : 'the model chose to stop with a clear road') };
  }
  // 4. Finish — a genuine arrival, never masking a stop/abstention above.
  if (!event && proj.s >= track.length - GOAL_MARGIN) event = { type: 'goal' };

  const record = {
    i: step,
    t: round3(t),
    source,
    observation,
    decision: inference?.decision ?? null,
    confidence: Number.isFinite(inference?.confidence) ? inference.confidence : null,
    abstained: !!inference?.abstained,
    action: decision.action,
    requested: decision.stop ? 'stop' : decision.action,
    pose: { x: round3(x), z: round3(z), heading: round3(heading), speed: round3(speed), s: round3(proj.s), lateral: round3(proj.lateral) },
    event: event ? event.type : null,
    eventDetail: event,
  };
  // A required stop (a red light, an obstacle too close) is a state, not the end
  // of the trial: the car sits still and re-senses. Every other event ends it.
  const terminal = !!event && event.type !== 'stop-required';
  return { car: next, record, event, done: terminal };
}

// ── a whole trial ────────────────────────────────────────────────────────────

/**
 * Run a complete trial: sense → decide → move, at 10 Hz, until the goal, a
 * collision/off-road, an honest stop, or the timeout. `decide` receives the
 * observation and returns an inference-shaped result; it defaults to running
 * the published bundle through the real v2 runtime.
 *
 * @param {object} opts
 * @param {object} [opts.cap]       a v2 numeric capability (used when no `decide`)
 * @param {(obs:object, ctx:object)=>{decision?:string, abstained?:boolean, abstainReason?:string, confidence?:number}} [opts.decide]
 * @param {object} [opts.track]
 * @param {number} [opts.dt]
 * @param {number} [opts.maxSteps]
 * @param {number} [opts.laneOffset] the car's starting lane offset
 * @param {boolean} [opts.failSensor]  simulate a dead sensor (missing input)
 * @param {number} [opts.failAt]       step index at which the sensor/decision fails (runtime failure)
 * @returns {{ok:boolean, track:object, steps:Array, outcome:string, goalReached:boolean, collisions:number, interventions:Array, actions:object, progress:number, reason?:string}}
 */
export function runTrial(opts = {}) {
  const track = opts.track || TRACKS.full;
  const dt = opts.dt || DRIVE_DT;
  const maxSteps = opts.maxSteps || DRIVE_MAX_STEPS;
  const decide = opts.decide || (opts.cap ? ((obs) => runInference(opts.cap, obs)) : null);
  if (!decide) return { ok: false, error: 'A trial needs a capability or a decide function.', track, steps: [], outcome: 'no-model', goalReached: false, collisions: 0, interventions: [], actions: {}, progress: 0 };

  let car = createCar(track, { laneOffset: opts.laneOffset || 0 });
  const steps = [];
  const interventions = [];
  const actions = {};
  let outcome = 'timeout';
  let goalReached = false;
  let reason = null;

  for (let i = 0; i < maxSteps; i++) {
    const t = i * dt;
    // Missing input: the sensor itself is dead. The vehicle stops.
    if (opts.failSensor) {
      const record = { i, t: round3(t), source: 'sensor', observation: null, decision: null, action: 'stop', requested: 'stop', pose: { x: round3(car.x), z: round3(car.z), heading: round3(car.heading), speed: 0, s: round3(projectToTrack(track, car.x, car.z).s), lateral: 0 }, event: 'missing-input', eventDetail: { type: 'missing-input' } };
      steps.push(record); interventions.push({ type: 'missing-input', at: round3(t), reason: 'the sensor returned no reading' });
      car = { ...car, speed: 0 }; outcome = 'missing-input'; reason = 'missing-input'; break;
    }
    let inference;
    try {
      if (opts.failAt != null && i >= opts.failAt) throw new Error('runtime failure');
      const { observation } = sense(track, car, t);
      inference = decide(observation, { step: i, t, car, track });
    } catch (e) {
      const proj = projectToTrack(track, car.x, car.z);
      steps.push({ i, t: round3(t), source: 'model', observation: null, decision: null, action: 'stop', requested: 'stop', pose: { x: round3(car.x), z: round3(car.z), heading: round3(car.heading), speed: 0, s: round3(proj.s), lateral: round3(proj.lateral) }, event: 'runtime-failure', eventDetail: { type: 'runtime-failure', message: String(e?.message || e) } });
      car = { ...car, speed: 0 }; outcome = 'runtime-failure'; reason = String(e?.message || e);
      interventions.push({ type: 'runtime-failure', at: round3(t), reason });
      break;
    }
    const advanced = advanceStep(track, car, inference, { t, dt, step: i });
    car = advanced.car;
    steps.push(advanced.record);
    const key = advanced.record.action;
    actions[key] = (actions[key] || 0) + 1;
    if (advanced.record.event === 'emergency-stop') interventions.push({ type: 'emergency-stop', at: advanced.record.t, reason: advanced.record.eventDetail?.reason || 'the model asked to stop with a clear road' });
    if (advanced.record.event === 'collision') interventions.push({ type: 'collision', at: advanced.record.t, reason: advanced.record.eventDetail?.obstacle || 'obstacle' });
    if (advanced.record.event === 'off-road') interventions.push({ type: 'off-road', at: advanced.record.t, reason: `lateral ${advanced.record.eventDetail?.lateral}` });
    if (advanced.record.event === 'goal') { goalReached = true; outcome = 'goal'; break; }
    if (advanced.record.event === 'collision') { outcome = 'collision'; break; }
    if (advanced.record.event === 'off-road') { outcome = 'off-road'; break; }
    if (advanced.record.event === 'emergency-stop') { outcome = 'emergency-stop'; break; }
    // `stop-required` (a red light or a close obstacle) is not terminal — the car
    // waits and re-senses, so the light's own cycle can let it proceed.
  }
  const last = steps[steps.length - 1];
  return {
    ok: true, track, steps, dt,
    outcome, goalReached, reason,
    collisions: steps.filter((s) => s.event === 'collision').length,
    interventions,
    actions,
    progress: last ? last.pose.s : 0,
  };
}

// ── compatibility (the published bundle must fit THIS contract) ──────────────

/**
 * Does this bundle speak the driving contract? Requires a v2 numeric
 * classifier whose input fields are exactly the observation's fields and whose
 * labels are driving actions. Anything else is refused, never coerced.
 * @returns {{ok:boolean, error?:string}}
 */
export function checkDriveCompatibility(cap) {
  if (!cap || typeof cap !== 'object') return { ok: false, error: 'missing-capability' };
  if (cap.specVersion !== 2) return { ok: false, error: 'not-v2' };
  if ((cap.input?.kind || 'vector') !== 'vector') return { ok: false, error: 'not-a-vector-model' };
  if (cap.output?.kind !== 'label') return { ok: false, error: 'not-a-classifier' };
  const names = (cap.input?.fields || []).map((f) => f?.name);
  const wanted = [...DRIVE_FIELDS].sort();
  if (names.length !== wanted.length || [...names].sort().join(',') !== wanted.join(',')) {
    return { ok: false, error: 'wrong-fields', expected: [...DRIVE_FIELDS], got: names };
  }
  const labels = cap.output.labels || [];
  const unknown = labels.filter((l) => !DRIVE_ACTIONS.includes(l));
  if (unknown.length) return { ok: false, error: 'unknown-actions', got: unknown };
  if (!labels.some((l) => DRIVE_ACTIONS.includes(l))) return { ok: false, error: 'no-actions' };
  return { ok: true };
}

// ── "Try in my city": a bounded route read from the child's own roads ────────

const polylineLength = (pts) => { let n = 0; for (let i = 1; i < pts.length; i++) n += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return n; };

/**
 * Build a bounded route track from the city's roads — READ ONLY, the child's
 * layout is never changed. Picks the longest road with enough length, takes a
 * leading stretch of about `want`, and returns a track the same simulator
 * drives. `{ok:false, reason}` when there is no usable route — the caller then
 * offers the guided track instead of inventing a lap.
 * @param {Array<{points:Array<[number,number]>, width?:number}>} roads
 */
export function cityRouteTrack(roads, { want = 180, minLength = 80 } = {}) {
  const list = (roads || []).filter((r) => Array.isArray(r?.points) && r.points.length >= 3);
  const best = list.map((r) => ({ r, len: polylineLength(r.points) })).sort((a, b) => b.len - a.len)[0];
  if (!best || best.len < minLength) return { ok: false, reason: 'no-usable-road' };
  const pts = [];
  let acc = 0;
  for (let i = 0; i < best.r.points.length; i++) {
    const p = best.r.points[i];
    if (i > 0) acc += Math.hypot(p[0] - best.r.points[i - 1][0], p[1] - best.r.points[i - 1][1]);
    pts.push([Number(p[0]), Number(p[1])]);
    if (acc >= want && pts.length >= 3) break;
  }
  if (pts.length < 3) return { ok: false, reason: 'no-usable-road' };
  const width = Math.max(8, Number(best.r.width) || 10);
  return { ok: true, track: buildTrack({ id: 'city-route', points: pts, width }), source: best.r };
}

/** A compact, honest summary for the UI. */
export function summarizeTrial(trial) {
  const actions = trial?.actions || {};
  const taken = Object.keys(actions).filter((a) => actions[a] > 0);
  return {
    outcome: trial?.outcome || 'unknown',
    goalReached: !!trial?.goalReached,
    steps: (trial?.steps || []).length,
    seconds: trial?.steps?.length ? round3(trial.steps[trial.steps.length - 1].t) : 0,
    progress: round3(trial?.progress || 0),
    distance: round3(trial?.progress || 0),
    collisions: trial?.collisions || 0,
    interventions: trial?.interventions || [],
    actions, taken,
  };
}
