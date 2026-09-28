// Renderer-independent paired driver. Physics 20 Hz; decisions 10 Hz.
// Route projection only measures sensors: it never writes the vehicle pose.
import { buildTrack, projectToTrack, lightStateAt } from './driving.js';
import { buildTrafficNetwork } from './traffic-network.js';
import { intersectsSolid, footprintFitsRoad } from './driving-routes.js';

export const PHYSICS_DT = .05;
export const AUDI = Object.freeze({ length: 5, width: 2.05, wheelbase: 2.91 });
export const STEERING = Object.freeze({ straight: 0, 'gentle-left': -.10, 'gentle-right': .10, 'sharp-left': -.25, 'sharp-right': .25 });
export const SPEED = Object.freeze({ go: 6, slow: 2, stop: 0 });
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angle = a => Math.atan2(Math.sin(a), Math.cos(a));

export function pointAt(track, s) {
  const seg = track.segments.find(seg => seg.s0 + seg.len >= s) || track.segments.at(-1);
  const t = clamp((s - seg.s0) / seg.len, 0, 1);
  return { x: seg.a.x + seg.dx * t, z: seg.a.z + seg.dz * t, heading: seg.heading };
}
export function footprint(car) {
  const out = [];
  for (const forward of [-AUDI.length / 2, AUDI.length / 2]) for (const side of [-AUDI.width / 2, AUDI.width / 2]) out.push({
    x: car.x + Math.sin(car.heading) * forward + Math.cos(car.heading) * side,
    z: car.z + Math.cos(car.heading) * forward - Math.sin(car.heading) * side,
  });
  return out;
}
export function hitsCircle(car, obstacle) {
  const dx = obstacle.x - car.x, dz = obstacle.z - car.z;
  const side = dx * Math.cos(car.heading) - dz * Math.sin(car.heading);
  const forward = dx * Math.sin(car.heading) + dz * Math.cos(car.heading);
  return Math.hypot(Math.max(0, Math.abs(side) - AUDI.width / 2), Math.max(0, Math.abs(forward) - AUDI.length / 2)) <= obstacle.r;
}

// One encounter state feeds rendering, sensing and scoring.
export function worldAt(scenario, t) {
  const obstacles = [...scenario.track.obstacles];
  for (const [actorId, actor] of (scenario.actors || []).entries()) {
    if (t < (actor.from ?? 0) || t >= (actor.until ?? Infinity)) continue;
    const elapsed = t - (actor.from ?? 0);
    const speed = elapsed >= (actor.brakeAt ?? Infinity) ? 0 : actor.speed || 0;
    const s = actor.s + (actor.speed || 0) * Math.min(elapsed, actor.brakeAt ?? Infinity);
    const point = pointAt(scenario.track, s);
    const lateral = actor.kind === 'pedestrian' || actor.crossing ? Math.max(0, t - ((actor.until ?? Infinity) - 4)) * 1.5 : 0;
    obstacles.push({ ...point, heading:point.heading+(actor.crossing?Math.PI/2:0), x: point.x + Math.cos(point.heading) * lateral, z: point.z - Math.sin(point.heading) * lateral, actorId, r: actor.r ?? 1, speed, kind: actor.kind || 'car' });
  }
  return { obstacles, signal: lightStateAt(scenario.track, t) };
}

export function readingsAt(scenario, car, t) {
  const track = scenario.track, projection = projectToTrack(track, car.x, car.z), world = worldAt(scenario, t);
  const ahead = pointAt(track, projection.s + 7);
  const roadDirection = angle(ahead.heading - projection.tangent);
  let clearance = 40, closingSpeed = 0, crossing = 'clear';
  for (const obstacle of world.obstacles) {
    const p = projectToTrack(track, obstacle.x, obstacle.z);
    const distance = p.s - projection.s - AUDI.length / 2 - obstacle.r;
    if (distance > -AUDI.length && Math.abs(p.lateral) < AUDI.width / 2 + obstacle.r && distance < clearance) {
      clearance = Math.max(0, distance); closingSpeed = car.speed - (obstacle.speed || 0);
      crossing = obstacle.kind === 'pedestrian' ? 'occupied' : 'clear';
    }
  }
  const line = track.light ? track.light.s - projection.s - AUDI.length / 2 : Infinity;
  return { laneOffset: projection.lateral, headingError: angle(car.heading - projection.tangent), roadDirection, speed: car.speed,
    clearance, closingSpeed, crossing, signal: line >= 0 && line < 40 ? ['green','amber','red'][world.signal] : 'none', signalDistance: clamp(line, 0, 40), bend: Math.abs(roadDirection), finishDistance: clamp(track.length - 4 - projection.s, 0, 40) };
}

export function createDrivingSession(scenario, prepared, { maxSteps = 2400, startOffset = scenario.startOffset || 0, startHeading = 0, practiceHelper = null, practiceEvidence = false } = {}) {
  const track = scenario.track;
  const pavement = scenario.roads ? buildTrafficNetwork(scenario.roads) : null;
  maxSteps = Math.min(2400, Math.max(1, Number.isFinite(maxSteps) ? Math.floor(maxSteps) : 2400));
  if (!track?.segments?.length || track.segments.some(s => !Number.isFinite(s.len) || s.len <= 0) || track.length < 12 || !Number.isFinite(track.width)) throw new Error('Invalid driving geometry');
  const first = pointAt(track, 3);
  let car = { x: first.x + Math.cos(first.heading) * startOffset, z: first.z - Math.sin(first.heading) * startOffset, heading: first.heading + startHeading, speed: 0 };
  let tick = 0, controls = null, outcome = null, paused = false, disposed = false;
  const records = [], interventions = [], violations = [];
  let previousSignal = null, amberMustStop = false;
  function end(reason, intervention = false) {
    outcome = reason;
    if (intervention) interventions.push({ reason, t: tick * PHYSICS_DT });
    car = { ...car, speed: 0 };
  }
  function step({ missingInput = false } = {}) {
    if (disposed || paused || outcome) return snapshot();
    const t = tick * PHYSICS_DT, reading = readingsAt(scenario, car, t), before = { ...car };
    const signal = worldAt(scenario, t).signal;
    if (signal === 1 && previousSignal !== 1 && track.light) {
      const distance = track.light.s - projectToTrack(track, car.x, car.z).s - AUDI.length / 2;
      amberMustStop = distance >= car.speed * car.speed / 10 + car.speed * .1 + .5;
    }
    previousSignal = signal;
    let failure = null;
    if (tick % 2 === 0 || missingInput) {
      try { controls = missingInput ? { failure: 'missing-input' } : prepared.decide(reading); }
      catch { controls = { failure: 'runtime-failure' }; }
      if (practiceHelper === 'speed') controls = { ...controls, speed: { decision: 'slow' } };
      if (practiceHelper === 'steering') controls = { ...controls, steering: { decision: 'straight' } };
      failure = controls?.failure;
    }
    const steering = controls?.steering?.decision, speedLabel = controls?.speed?.decision;
    if (!failure && (!Object.hasOwn(STEERING, steering) || !Object.hasOwn(SPEED, speedLabel))) failure = 'invalid-control';
    if (failure) end(failure, true);
    else {
      const target = SPEED[speedLabel];
      const speed = car.speed + clamp(target - car.speed, -5 * PHYSICS_DT, 3 * PHYSICS_DT);
      const heading = angle(car.heading + speed / AUDI.wheelbase * Math.tan(STEERING[steering]) * PHYSICS_DT);
      car = { x: car.x + Math.sin(heading) * speed * PHYSICS_DT, z: car.z + Math.cos(heading) * speed * PHYSICS_DT, heading, speed };
      const projection = projectToTrack(track, car.x, car.z);
      let violation = null;
      // Swept substeps cover the full rectangle, including its front corners.
      for (let i = 1; i <= 4 && !violation; i++) {
        const u = i / 4, pose = { x: before.x + (car.x-before.x)*u, z: before.z + (car.z-before.z)*u, heading: before.heading + angle(car.heading-before.heading)*u };
        if (worldAt(scenario, t + u * PHYSICS_DT).obstacles.some(o => hitsCircle(pose, o))) violation = 'collision';
        if ((scenario.solids || []).some(solid => intersectsSolid(pose, solid))) violation ||= 'collision';
        if (pavement && footprint(pose).some(p => { const q = projectToTrack(track,p.x,p.z); return Math.hypot(p.x-q.x,p.z-q.z) > track.width/2; })) violation ||= 'lane-departure';
        if (pavement ? !footprintFitsRoad(pose,pavement) : footprint(pose).some(p => { const q = projectToTrack(track, p.x, p.z); return Math.hypot(p.x-q.x,p.z-q.z) > track.width / 2; })) violation ||= 'off-road';
      }
      if (track.light && Math.max(...footprint(before).map(p=>projectToTrack(track,p.x,p.z).s)) < track.light.s && Math.max(...footprint(car).map(p=>projectToTrack(track,p.x,p.z).s)) >= track.light.s) {
        if (signal === 2) violation ||= 'red-light';
        if (signal === 1 && amberMustStop) violation ||= 'amber-light';
      }
      if (violation) { violations.push({ type: violation, t }); end(violation, true); }
      else if (car.speed === 0 && projection.s >= track.length - 9) {
        const finish = pointAt(track, track.length - 5.5);
        const inside = footprint(car).every(p => {
          const dx = p.x - finish.x, dz = p.z - finish.z;
          return Math.abs(dx * Math.sin(finish.heading) + dz * Math.cos(finish.heading)) <= 4.5
            && Math.abs(dx * Math.cos(finish.heading) - dz * Math.sin(finish.heading)) <= track.width / 2;
        });
        if (inside) end('arrived');
      }
      else if (scenario.safeStop && car.speed === 0 && reading.clearance > 0 && reading.clearance < 4) end('safe-stop');
    }
    records.push({ t, readings: reading, requested: { steering: steering ?? null, speed: speedLabel ?? null }, controls, before, pose: { ...car }, outcome, intervention: failure || (violations.at(-1)?.t === t ? violations.at(-1).type : null) });
    tick++;
    if (!outcome && tick >= maxSteps) { end('timeout', true); records.at(-1).outcome = 'timeout'; records.at(-1).intervention = 'timeout'; records.at(-1).pose.speed = 0; }
    return snapshot();
  }
  function snapshot() { return { car: { ...car }, t: tick * PHYSICS_DT, outcome, paused, practice: !!practiceHelper || practiceEvidence, passed: outcome === 'arrived' && !practiceHelper && !practiceEvidence && !violations.length && !interventions.length }; }
  return { step, snapshot, recordAt: i => records[i], recordCount: () => records.length, pause(value = true) { paused = !!value; }, dispose() { disposed = true; if (!outcome) end('cancelled', true); },
    evidence() { return JSON.parse(JSON.stringify({ scenario, machineId: prepared.bundle?.machineId, revision: prepared.bundle?.revision, ...snapshot(), records, violations, interventions })); } };
}

// Held-out seeds vary geometry/timing, not training labels. Route length <200m.
export function schoolScenario(kind = 'straight', seed = 1) {
  let state = seed >>> 0;
  const random = () => ((state = (Math.imul(state,1664525)+1013904223) >>> 0) / 4294967296);
  const points = [[0,0]], radius = 24 + random()*16;
  let heading = 0, x = 0, z = 0;
  for (let i=1;i<=120;i++) {
    if (['left','right','s-bend','mixed'].includes(kind) && i>22 && i<65) heading += (kind === 'right' ? 1 : -1) / radius;
    if (['s-bend','mixed'].includes(kind) && i>=65 && i<105) heading += 1/radius;
    x += Math.sin(heading); z += Math.cos(heading); points.push([x,z]);
  }
  const spec = { id: kind, width: 7, points };
  if (['signal','amber','mixed'].includes(kind)) spec.light = { s: kind === 'mixed' ? 18 : 40 + random()*12, phases: [{ state: kind === 'amber' ? 'amber' : 'red', seconds: 18+random()*4 }, { state: 'green', seconds: 200 }] };
  const track = buildTrack(spec), scenario = { kind, seed, track, actors: [], startOffset: (random() - .5) * .5 };
  if (kind === 'barrier') { const p = pointAt(track, 45 + random()*12); track.obstacles.push({ ...p, r: 1, kind: 'barrier' }); scenario.safeStop = true; }
  if (['moving-car','pedestrian','lead-car','mixed'].includes(kind)) scenario.actors.push({ s: kind === 'mixed' ? 85 : 38+random()*10, kind: kind === 'pedestrian' ? 'pedestrian' : 'car', crossing:['moving-car','mixed'].includes(kind), r: 1, from: 0, until: (kind === 'mixed' ? 75 : 17)+random()*4, speed: kind === 'lead-car' ? 2 : 0, brakeAt: 3 });
  return scenario;
}
