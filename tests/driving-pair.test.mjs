import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { buildDrivingBundle, prepareDrivingBundle, DRIVING_SCHEMAS } from '../P5 Programme/buddy-kit/client/city-common/driving-bundle.js';
import { createDrivingSession, schoolScenario, readingsAt, hitsCircle, worldAt, AUDI } from '../P5 Programme/buddy-kit/client/city-common/driving-simulation.js';
import { findDrivingRoutes, cityDrivingScenario } from '../P5 Programme/buddy-kit/client/city-common/driving-routes.js';
const require = createRequire(import.meta.url);
const game = require('../P5 Programme/buddy-kit/client/workshop/game.js');
const Brain = require('../P5 Programme/buddy-kit/client/workshop/logic/brain.js');
const table = game.buildDrivingPairTable({ train: true });
const models = game.publishDrivingPair(table);
const built = buildDrivingBundle({ machineId: 'student-machine', revision: 1, models });
assert.equal(built.ok, true, built.error);
const prepared = prepareDrivingBundle(built.bundle);
const run = (scenario, options, model = prepared) => {
  const session = createDrivingSession(scenario, model, options);
  while (!session.snapshot().outcome) session.step();
  return session.evidence();
};

test('paired starter requires explicit teaching; schemas stay stable between exercises', () => {
  assert.equal(game.publishDrivingPair(game.buildDrivingPairTable()), null);
  assert.equal(table.pieces.filter(p => p.drivingRole).length, 2);
  assert.equal(models.steering.examples.length, 375);
  assert.equal(models.speed.examples.length, 1200);
  assert.deepEqual(Object.keys(DRIVING_SCHEMAS), ['steering', 'speed']);
});

test('Workshop Data-sense and exported pair agree on held-out sensor situations, including evidence', () => {
  for (let i = 0; i < 60; i++) {
    const scenario = schoolScenario(i % 2 ? 'mixed' : 'signal', i + 300);
    const reading = readingsAt(scenario, { x: .13 * (i % 5), z: 3 + i * .51, heading: .01 * (i % 7), speed: i % 8 }, i * .3);
    const result = prepared.decide(reading);
    for (const role of ['steering', 'speed']) {
      const piece = table.pieces.find(p => p.drivingRole === role), entry = game.modelEntry(piece);
      const vector = entry.vec({ dataset: DRIVING_SCHEMAS[role].id, features: reading });
      const workshop = Brain.classify(entry.brain, vector, piece.k);
      assert.equal(result[role].decision, workshop.label);
      assert.deepEqual(result[role].evidence.map(e => e.id), workshop.evidence.map(e => e.id));
    }
  }
});

test('real Workshop-trained pair completes every supported drill across held-out seeds', () => {
  // No trajectory or result is fed back into training. Offsets/headings also
  // differ from the exact authored examples. A barrier stop is not a journey.
  for (const seed of [13, 71, 503, 9001]) for (const kind of ['straight','left','right','s-bend','barrier','signal','amber','moving-car','pedestrian','lead-car','mixed']) {
    const result = run(schoolScenario(kind, seed), { startOffset: seed === 13 ? .5 : seed === 71 ? -.5 : 0, startHeading: seed === 503 ? .05 : 0 });
    assert.equal(result.outcome, kind === 'barrier' ? 'safe-stop' : 'arrived', `${kind}, seed ${seed}`);
    assert.equal(result.car.speed, 0);
    assert.equal(result.violations.length, 0);
    assert.equal(result.interventions.length, 0);
    assert.equal(result.passed, kind !== 'barrier');
    if (kind === 'signal') assert.ok(result.records.some(r => r.pose.speed === 0 && r.readings.signal === 'red'));
    if (kind === 'moving-car') {
      assert.ok(result.records.some(r=>r.pose.speed===0&&r.readings.clearance<4));
      const before=worldAt(result.scenario,0).obstacles[0],after=worldAt(result.scenario,result.scenario.actors[0].until-1).obstacles[0];
      assert.ok(Math.hypot(after.x-before.x,after.z-before.z)>4,'the crossing car visibly clears the lane before leaving');
    }
    if (kind === 'mixed') {
      assert.ok(result.records.some(r => r.pose.speed === 0 && r.readings.signal === 'red'), `mixed signal stop, seed ${seed}`);
      assert.ok(result.records.some(r => r.pose.speed === 0 && r.readings.clearance < 4), `mixed encounter stop, seed ${seed}`);
    }
  }
});

test('steering and speed have independent effects, and a normal stop resumes', () => {
  const constant = (steering, speed) => ({ decide: () => ({ steering: { decision: steering }, speed: { decision: speed } }) });
  const a = createDrivingSession(schoolScenario(), constant('gentle-left', 'slow'));
  const b = createDrivingSession(schoolScenario(), constant('straight', 'slow'));
  for (let i = 0; i < 20; i++) { a.step(); b.step(); }
  assert.equal(a.snapshot().car.speed, b.snapshot().car.speed);
  assert.ok(a.snapshot().car.heading > 0);
  assert.equal(b.snapshot().car.heading, 0);
  let go = false;
  const c = createDrivingSession(schoolScenario(), { decide: () => constant('straight', go ? 'go' : 'stop').decide() });
  for (let i = 0; i < 10; i++) c.step();
  assert.equal(c.snapshot().outcome, null);
  go = true; c.step(); assert.ok(c.snapshot().car.speed > 0);
});

test('Workshop-trained pair completes admitted City straights, curves and a corner', () => {
  const layouts = [
    [{ points: [[0,0],[0,150]], width:12 }],
    [{ points:Array.from({length:41},(_,i)=>[30*Math.cos(i*Math.PI/80),30*Math.sin(i*Math.PI/80)]), width:10 }],
    [{ points:[[0,0],[0,35],[35,35]], width:12 }],
  ];
  for (const roads of layouts) {
    const routes=findDrivingRoutes(roads).routes;
    assert.ok(routes.length);
    for (const route of routes) {
      const result=run(cityDrivingScenario(route,503));
      assert.equal(result.outcome,'arrived');
      assert.equal(result.passed,true);
      assert.deepEqual(result.violations,[]);
      assert.deepEqual(result.interventions,[]);
    }
  }
});

test('weak models, uncertainty, invalid readings and runtime errors never pass', () => {
  const weak = { decide: () => ({ steering: { decision: 'straight' }, speed: { decision: 'go' } }) };
  assert.equal(run(schoolScenario('left'), {}, weak).outcome, 'off-road');
  assert.equal(run(schoolScenario('barrier'), {}, weak).outcome, 'collision');
  assert.equal(run(schoolScenario('amber'), {}, weak).outcome, 'amber-light');
  assert.equal(run(schoolScenario('straight'), {}, { decide() { throw Error('broken'); } }).outcome, 'runtime-failure');
  const reading = readingsAt(schoolScenario(), { x: 0, z: 3, heading: 0, speed: 0 }, 0);
  for (const value of [undefined, NaN, Infinity, '3']) assert.equal(prepared.decide({ ...reading, speed: value }).failure, 'invalid-input');
  assert.equal(prepared.decide({ ...reading, signal: 'purple' }).failure, 'invalid-input');
  const session = createDrivingSession(schoolScenario(), prepared); session.step({ missingInput: true });
  assert.equal(session.snapshot().outcome, 'missing-input');
  assert.equal(session.evidence().interventions.length, 1);
  const uncertain = structuredClone(built.bundle);
  for (const role of ['steering','speed']) uncertain.models[role].threshold = 1;
  // Deliberately corrupt self-tests must be rejected, not installed as a pair.
  uncertain.selftests[0].decision = 'teleport';
  assert.equal(prepareDrivingBundle(uncertain).ok, false);
  const cautious = structuredClone(models);
  cautious.steering.threshold = .999999;
  cautious.speed.threshold = .999999;
  const revision = buildDrivingBundle({machineId:'cautious',revision:1,models:cautious});
  assert.equal(revision.ok,true);
  const refusal = run(schoolScenario('straight'),{startOffset:.37},prepareDrivingBundle(revision.bundle));
  assert.equal(refusal.outcome,'uncertain-model');
  assert.equal(refusal.passed,false);
  assert.equal(refusal.interventions.length,1);
});

test('revision is a detached immutable pair; one malformed half rejects the whole revision', () => {
  const source = structuredClone(built.bundle), installed = prepareDrivingBundle(source);
  source.models.speed.examples.length = 0;
  assert.equal(installed.bundle.models.speed.examples.length, 1200);
  assert.ok(Object.isFrozen(installed.bundle.models.speed.examples));
  assert.equal(prepareDrivingBundle(source).ok, false);
  for (const role of ['steering','speed']) {
    const broken = structuredClone(built.bundle); broken.models[role].schema.features.reverse();
    assert.equal(prepareDrivingBundle(broken).ok, false);
  }
});

test('footprint includes the Audi nose; pause/dispose are terminal lifecycle boundaries', () => {
  assert.equal(hitsCircle({ x: 0, z: 0, heading: 0 }, { x: 0, z: AUDI.length / 2, r: .1 }), true);
  const s = createDrivingSession(schoolScenario(), prepared);
  s.pause(); s.step(); assert.equal(s.snapshot().t, 0);
  s.pause(false); s.step(); assert.equal(s.snapshot().t, .05);
  s.dispose(); const state = s.snapshot(); s.step(); assert.deepEqual(s.snapshot(), state);
});

test('student steering examples repair a weak learned controller; repeat and fresh scenarios remain separate', () => {
  const table=game.buildDrivingPairTable();
  game.teachDrivingExamples('speed',table);
  const piece=table.pieces.find(p=>p.drivingRole==='steering');
  const reading={laneOffset:0,headingError:0,roadDirection:0,speed:0};
  game.applyTeachEffect({type:'teach',block:piece.id,shelf:'sharp-left',data:{dataset:'drive-steering-v2',features:reading,tag:'My steering example'}},table.pieces,{hand:true});
  const weak=buildDrivingBundle({machineId:'student-steering',revision:1,models:game.publishDrivingPair(table)});
  assert.equal(weak.ok,true);
  const before=run(schoolScenario('straight',71),{},prepareDrivingBundle(weak.bundle));
  assert.equal(before.outcome,'off-road');
  const entry=game.modelEntry(piece);entry.brain.shelves['sharp-left']=[];
  game.applyTeachEffect({type:'teach',block:piece.id,shelf:'straight',data:{dataset:'drive-steering-v2',features:reading,tag:'My corrected steering example'}},table.pieces,{hand:true});
  const repaired=buildDrivingBundle({machineId:'student-steering',revision:2,models:game.publishDrivingPair(table)});
  const after=run(schoolScenario('straight',71),{practiceEvidence:true},prepareDrivingBundle(repaired.bundle));
  assert.equal(after.outcome,'arrived');assert.equal(after.practice,true);
  assert.equal(before.records[0].requested.steering,'sharp-left');
  assert.equal(after.records[0].requested.steering,'straight');
  const fresh=run(schoolScenario('straight',72),{},prepareDrivingBundle(repaired.bundle));
  assert.equal(fresh.outcome,'arrived');assert.equal(fresh.practice,false);
});

test('permanent school shares seed-independent geometry and bounded drill sections', async () => {
  const {SCHOOL_BOUNDS}=await import('../P5 Programme/buddy-kit/client/city-common/driving-school-site.js');
  assert.ok(Math.abs(SCHOOL_BOUNDS.w-83)<1 && Math.abs(SCHOOL_BOUNDS.d-177)<1);
  const ranges={right:[50,120],left:[110,190],'s-bend':[50,190],mixed:[0,190]};
  const whole=schoolScenario('mixed',71).courseTrack;
  for(const kind of ['straight','left','right','s-bend','barrier','signal','amber','moving-car','pedestrian','lead-car','mixed']){
    const a=schoolScenario(kind,13),b=schoolScenario(kind,503),range=ranges[kind]||[0,60];
    assert.equal(a.courseVersion,1);assert.deepEqual(a.courseRange,range);
    assert.deepEqual(a.courseTrack,whole);assert.deepEqual(a.track.points,b.track.points);
    assert.deepEqual(a.track.points,whole.points.slice(range[0],range[1]+1));
    assert.ok(Math.abs(a.track.length-(range[1]-range[0]))<1e-8);
    assert.notEqual(a.startOffset,b.startOffset);
    if(kind==='barrier')assert.ok(a.track.obstacles[0].z>=30&&a.track.obstacles[0].z<=42);
    if(kind==='mixed')assert.equal(a.actors[0].s,110);
  }
});
