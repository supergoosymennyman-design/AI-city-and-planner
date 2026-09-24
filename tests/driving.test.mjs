// tests/driving.test.mjs — Stage 5: the self-driving skill's laws.
//
// The plan's driving exit condition and honesty rules, proved on the pure
// simulator (no browser):
//   • the observation contract and the five actions are fixed;
//   • the MODEL's action controls movement — a different model drives differently;
//   • missing input, abstention, timeout and runtime failure all STOP the car
//     and are recorded; collisions and off-road are recorded, never hidden;
//   • a model trained from the real sensor dataset moves the car.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { buildDriveCapability, buildCapabilityV2 } from '../P5 Programme/buddy-kit/client/city-common/capability-export.js';
import {
  DRIVE_FIELDS, DRIVE_ACTIONS, DRIVE_PLUS_CONSTANT, DRIVE_HOST_TYPE,
  TRACKS, buildTrack, createCar, sense, decideAction, checkDriveCompatibility,
  runTrial, summarizeTrial, lightStateAt, LIGHT_RED, cityRouteTrack,
} from '../P5 Programme/buddy-kit/client/city-common/driving.js';

const require = createRequire(import.meta.url);
const Drv = require('../P5 Programme/buddy-kit/client/workshop/logic/drive-data.js');

const clear = { left: 40, center: 40, right: 40, laneOffset: 0, headingError: 0, speed: 0, trafficLight: 0, turnIntent: 0 };
const valuesOf = (obs) => DRIVE_FIELDS.map((f) => obs[f]);

/** A capability that always answers one action (one study example, k=1, no abstain). */
function constantCap(action, id = `cap_${action}`) {
  const out = buildCapabilityV2({
    id, name: `Always ${action}`, fields: DRIVE_FIELDS, labels: DRIVE_ACTIONS,
    examples: [{ label: action, values: valuesOf(clear) }],
    k: 1, threshold: 0, plusConstant: DRIVE_PLUS_CONSTANT,
    city: { hostTypes: [DRIVE_HOST_TYPE], contract: 'drive-v1' },
  });
  assert.equal(out.ok, true, out.error);
  return out.capability;
}

test('the driving contract is fixed: eight ordered fields and five actions', () => {
  assert.deepEqual([...DRIVE_FIELDS], ['left', 'center', 'right', 'laneOffset', 'headingError', 'speed', 'trafficLight', 'turnIntent']);
  assert.deepEqual([...DRIVE_ACTIONS], ['forward', 'left', 'right', 'slow', 'stop']);
  assert.equal(DRIVE_PLUS_CONSTANT, 10);
});

test('compatibility refuses anything that is not this exact numeric contract', () => {
  assert.equal(checkDriveCompatibility(constantCap('forward')).ok, true);
  // A model with the wrong field set is refused, never coerced.
  const wrongFields = buildCapabilityV2({
    id: 'cap_wrong', name: 'wrong', fields: ['left', 'center', 'right'], labels: DRIVE_ACTIONS,
    examples: [{ label: 'forward', values: [40, 40, 40] }], threshold: 0,
  });
  assert.equal(checkDriveCompatibility(wrongFields.capability).error, 'wrong-fields');
  // An unknown action cannot be driven.
  const unknown = constantCap('forward', 'cap_unknown');
  unknown.output.labels = ['forward', 'teleport'];
  assert.equal(checkDriveCompatibility(unknown).error, 'unknown-actions');
  assert.equal(checkDriveCompatibility({ specVersion: 1 }).error, 'not-v2');
  assert.equal(checkDriveCompatibility(null).error, 'missing-capability');
});

test('decideAction turns abstention, missing input and unknown labels into STOP', () => {
  assert.deepEqual(decideAction({ decision: 'left' }), { action: 'left', stop: false, reason: null });
  assert.equal(decideAction({ abstained: true, abstainReason: 'below-threshold' }).action, 'stop');
  assert.equal(decideAction(null).reason, 'missing-input');
  assert.equal(decideAction({ decision: 'fly' }).reason, 'unknown-action');
});

test('the model controls movement: a forward model travels, a stop model does not', () => {
  const go = runTrial({ cap: constantCap('forward'), track: TRACKS.straight });
  const halt = runTrial({ cap: constantCap('stop'), track: TRACKS.straight });
  assert.ok(go.progress > 100, `forward should travel, got ${go.progress}`);
  assert.ok(halt.progress < 1, `stop should not travel, got ${halt.progress}`);
  assert.equal(halt.goalReached, false);
  assert.ok(halt.interventions.some((i) => i.type === 'emergency-stop'), 'a clear-road stop must be recorded as an intervention');
});

test('a left model and a right model move the car to opposite sides', () => {
  const left = runTrial({ cap: constantCap('left'), track: TRACKS.straight, maxSteps: 60 });
  const right = runTrial({ cap: constantCap('right'), track: TRACKS.straight, maxSteps: 60 });
  const lastL = left.steps[left.steps.length - 1].pose;
  const lastR = right.steps[right.steps.length - 1].pose;
  assert.ok(lastL.lateral < -0.2, `left model should end left of centre, got ${lastL.lateral}`);
  assert.ok(lastR.lateral > 0.2, `right model should end right of centre, got ${lastR.lateral}`);
  assert.notEqual(lastL.lateral, lastR.lateral);
});

test('changing the model changes vehicle actions on the SAME track', () => {
  const a = runTrial({ cap: constantCap('forward', 'cap_a'), track: TRACKS.straight, maxSteps: 60 });
  const b = runTrial({ cap: constantCap('left', 'cap_b'), track: TRACKS.straight, maxSteps: 60 });
  const actionsA = a.steps.map((s) => s.action);
  const actionsB = b.steps.map((s) => s.action);
  assert.notDeepEqual(actionsA, actionsB, 'two different models must not drive identically');
});

test('an abstaining model stops the car — no hidden successful driver', () => {
  // A very high sure line: as soon as the car's own motion changes the reading
  // from the one study example, the model no longer claims to be sure.
  const strict = buildDriveCapability({
    id: 'cap_unsure', name: 'Unsure', k: 1, threshold: 0.999,
    examples: [{ label: 'forward', values: valuesOf(clear) }],
  });
  assert.equal(strict.ok, true, strict.error);
  const trial = runTrial({ cap: strict.capability, track: TRACKS.straight, maxSteps: 60 });
  assert.equal(trial.goalReached, false);
  assert.ok(trial.interventions.length > 0);
  assert.ok(trial.steps.some((s) => s.abstained), 'the model must abstain at least once');
  assert.ok(trial.steps.some((s) => s.event === 'emergency-stop'));
});

test('a collision is recorded honestly and ends the trial', () => {
  const track = buildTrack({ id: 'wall', points: [[0, 0], [0, 120]], width: 12, obstacles: [{ x: 0, z: 40, r: 1 }] });
  const trial = runTrial({ cap: constantCap('forward'), track, maxSteps: 200 });
  assert.equal(trial.outcome, 'collision');
  assert.equal(trial.collisions, 1);
  assert.equal(trial.goalReached, false);
  assert.ok(trial.interventions.some((i) => i.type === 'collision'));
});

test('a dead sensor stops the car', () => {
  const trial = runTrial({ cap: constantCap('forward'), track: TRACKS.straight, failSensor: true });
  assert.equal(trial.outcome, 'missing-input');
  assert.equal(trial.progress, 0);
  assert.ok(trial.interventions.some((i) => i.type === 'missing-input'));
});

test('a runtime failure stops the car', () => {
  const trial = runTrial({ cap: constantCap('forward'), track: TRACKS.straight, failAt: 5 });
  assert.equal(trial.outcome, 'runtime-failure');
  assert.ok(trial.interventions.some((i) => i.type === 'runtime-failure'));
  assert.equal(trial.goalReached, false);
});

test('a trial that never finishes is a timeout', () => {
  const trial = runTrial({ cap: constantCap('forward'), track: TRACKS.straight, maxSteps: 5 });
  assert.equal(trial.outcome, 'timeout');
  assert.equal(trial.steps.length, 5);
});

test('the simulation is deterministic — the same model replays exactly', () => {
  const a = runTrial({ cap: constantCap('left'), track: TRACKS.curve, maxSteps: 80 });
  const b = runTrial({ cap: constantCap('left'), track: TRACKS.curve, maxSteps: 80 });
  assert.deepEqual(a.steps.map((s) => [s.t, s.action, s.pose.x, s.pose.z]), b.steps.map((s) => [s.t, s.action, s.pose.x, s.pose.z]));
  assert.equal(a.steps[1].t, 0.1, 'steps must be 10 Hz');
});

test('the traffic light holds a red for its first phase, then goes green', () => {
  const track = TRACKS.full;
  assert.equal(lightStateAt(track, 0), LIGHT_RED);
  assert.equal(lightStateAt(track, 4), LIGHT_RED);
  assert.equal(lightStateAt(track, 7), 0);
  assert.notEqual(lightStateAt(track, 6), LIGHT_RED);
  // The light only speaks once the car is within its look-ahead.
  assert.equal(sense(track, createCar(track), 0).observation.trafficLight, 0);
  const near = sense(track, { x: 0, z: 10, heading: 0, speed: 0 }, 0).observation;
  assert.equal(near.trafficLight, LIGHT_RED);
});

test('the instructor rule is total and answers with an action for every reading', () => {
  for (const a of DRIVE_ACTIONS) assert.ok(Drv.ACTIONS.includes(a));
  let st = null;
  const seen = new Set();
  for (let i = 0; i < 500; i++) {
    let row; [row, st] = Drv.gen(st || 42);
    const answer = Drv.instructorAction(row.features);
    assert.ok(DRIVE_ACTIONS.includes(answer), `${JSON.stringify(row.features)} -> ${answer}`);
    seen.add(answer);
  }
  assert.ok(seen.size >= 4, 'the sampled table should exercise most actions');
});

test('a model trained from the real sensor rows moves the car', () => {
  const rows = Drv.rows(42, 200);
  const out = buildDriveCapability({
    id: 'cap_drive', name: 'Drive', k: 3, threshold: 0.4,
    examples: rows.map((r) => ({ label: r.answer, values: Drv.valuesOf(r.features), display: r.face })),
  });
  assert.equal(out.ok, true, out.error);
  assert.equal(checkDriveCompatibility(out.capability).ok, true);
  assert.ok(out.capability.selftest.cases.length >= 2, 'the bundle must carry a real self-test');

  const trial = runTrial({ cap: out.capability, track: TRACKS.straight, maxSteps: 1200 });
  assert.ok(trial.progress > 60, `a trained model should make real progress, got ${trial.progress}`);
  assert.ok(trial.actions.forward > 0 || trial.actions.slow > 0 || trial.actions.left > 0 || trial.actions.right > 0);
  const summary = summarizeTrial(trial);
  assert.equal(typeof summary.outcome, 'string');
});

test('a differently-trained model drives differently', () => {
  const rows = Drv.rows(42, 200);
  const shifted = rows.map((r, i) => ({ ...r, answer: r.answer === 'forward' ? 'slow' : 'forward' }));
  const a = buildDriveCapability({ id: 'cap_a', name: 'A', k: 3, threshold: 0.4, examples: rows.map((r) => ({ label: r.answer, values: Drv.valuesOf(r.features) })) });
  const b = buildDriveCapability({ id: 'cap_b', name: 'B', k: 3, threshold: 0.4, examples: shifted.map((r) => ({ label: r.answer, values: Drv.valuesOf(r.features) })) });
  assert.equal(a.ok, true, a.error); assert.equal(b.ok, true, b.error);
  const ra = runTrial({ cap: a.capability, track: TRACKS.straight, maxSteps: 1200 });
  const rb = runTrial({ cap: b.capability, track: TRACKS.straight, maxSteps: 1200 });
  assert.notDeepEqual(ra.steps.map((s) => s.action), rb.steps.map((s) => s.action));
  assert.notEqual(ra.progress, rb.progress);
});

test('the driving builder refuses malformed examples and keeps a dead-sensor case', () => {
  const out = buildDriveCapability({
    id: 'cap_min', name: 'Min', threshold: 0.4,
    examples: [{ label: 'forward', values: valuesOf(clear) }],
  });
  assert.equal(out.ok, true, out.error);
  assert.ok(out.capability.selftest.cases.some((c) => (c.expect || {}).decision === '__abstain'));
  assert.equal(buildDriveCapability({ id: 'cap_bad', name: 'Bad', threshold: 0.4, examples: [{ label: 'fly', values: valuesOf(clear) }] }).ok, false);
  assert.equal(buildDriveCapability({ id: 'cap_bad2', name: 'Bad2', threshold: 0.4, examples: [{ label: 'forward', values: [1, 2] }] }).ok, false);
});

test('the instructor answers a red light by stopping, and the trial then proceeds on green', () => {
  const trial = runTrial({ decide: (obs) => ({ decision: Drv.instructorAction(obs) }), track: TRACKS.light, maxSteps: 1200 });
  assert.ok(trial.steps.some((s) => s.event === 'stop-required'), 'a red light should be a required stop');
  assert.equal(trial.goalReached, true, 'once the light turns green the trial should finish');
  assert.equal(trial.interventions.length, 0, 'a required stop is not an intervention');
});

test('"try in my city" reads a bounded route from the roads and never mutates them', () => {
  // No usable road → an honest refusal, not an invented lap.
  assert.deepEqual(cityRouteTrack([]), { ok: false, reason: 'no-usable-road' });
  assert.equal(cityRouteTrack([{ points: [[0, 0], [10, 0]] }]).ok, false);
  assert.equal(cityRouteTrack([{ points: [[0, 0], [20, 0], [25, 0]] }], { minLength: 80 }).ok, false);

  const road = { points: [[0, 0], [40, 0], [80, 0], [120, 0], [160, 0]], width: 14 };
  const frozen = JSON.stringify(road);
  const built = cityRouteTrack([road], { want: 120 });
  assert.equal(built.ok, true);
  assert.ok(built.track.points.length >= 3);
  assert.ok(built.track.length >= 100);
  assert.equal(built.source, road);
  assert.equal(JSON.stringify(road), frozen, 'the child’s road must not be altered');

  // The chosen route is drivable by the same simulator with the same model.
  const car = runTrial({ cap: constantCap('forward'), track: built.track, maxSteps: 1200 });
  assert.ok(car.progress > 80);
});
