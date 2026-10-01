import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { STEERING } from '../P5 Programme/buddy-kit/client/city-common/driving-controls.js';
import { buildTrack } from '../P5 Programme/buddy-kit/client/city-common/driving.js';
import { schoolScenario, createDrivingSession, readingsAt, pointAt } from '../P5 Programme/buddy-kit/client/city-common/driving-simulation.js';
import { compileDrivingMachine } from '../P5 Programme/buddy-kit/client/city-common/driving-machine.js';
import { classify, surenessOf } from '../P5 Programme/buddy-kit/client/city-common/knn-vector.js';
import { prepareDrivingBundle } from '../P5 Programme/buddy-kit/client/city-common/driving-bundle.js';
const require = createRequire(import.meta.url);
const game = require('../P5 Programme/buddy-kit/client/workshop/game.js');
const data = globalThis.WorkshopDrivingPairData;

test('steering turns toward the driver side at multiple headings', () => {
 for (const heading of [0, Math.PI/2, -Math.PI/2, Math.PI-.01]) for (const label of ['gentle-left','sharp-left','gentle-right','sharp-right']) {
  const track = buildTrack({id:'direction-test',width:20,points:[[0,0],[Math.sin(heading)*50,Math.cos(heading)*50]]});
  const session = createDrivingSession({track}, {decide:()=>({steering:{decision:label},speed:{decision:'slow'}})});
  const before=session.snapshot().car;for(let i=0;i<10;i++)session.step();const after=session.snapshot().car;
  // Driver left is +cos(h), -sin(h); forward is +sin(h), +cos(h).
  const lateral=(after.x-before.x)*Math.cos(heading)-(after.z-before.z)*Math.sin(heading);
  assert.equal(Math.sign(lateral),label.endsWith('left')?1:-1);
 }
});

test('bend drill names and training corrections agree with physical heading changes', () => {
 for(const kind of ['left','right']){
  const scenario=schoolScenario(kind,71),track=scenario.track;
  const delta=track.segments.at(-1).heading-track.segments[0].heading;
  assert.equal(Math.sign(delta),kind==='left'?1:-1);
  const readings=readingsAt(scenario,{...pointAt(track,9),speed:3},0);
  assert.equal(Math.sign(readings.roadDirection),kind==='left'?1:-1);
  const row=data.rows('steering').find(r=>r.features.laneOffset===0&&r.features.headingError===0&&r.features.roadDirection===(kind==='left'?.2:-.2)&&r.features.speed===3);
  assert.equal(row.answer,'gentle-'+kind);
 }
});

const swap = data.reverseSteeringLabel;
function legacyBundle(version){
 const machine=game.buildDrivingPairTable({train:true});const result=compileDrivingMachine(machine,'directions');assert.equal(result.ok,true);
 const legacy=structuredClone(result.bundle);legacy.version=version;
 legacy.controls.steering=Object.fromEntries(Object.entries(STEERING).map(([label,value])=>[label,-value || 0]));
 for(const example of legacy.models.steering.examples)example.label=swap(example.label);
 for(const check of legacy.selftests)if(check.role==='steering')check.decision=swap(check.decision);
 if(version===1){delete legacy.controls;for(const model of Object.values(legacy.models))delete model.mode;}
 return legacy;
}
test('legacy bundles validate first, preserve physical predictions and migrate idempotently',()=>{
 for(const version of [1,2]){
  const legacy=legacyBundle(version),saved=structuredClone(legacy),prepared=prepareDrivingBundle(legacy);
  assert.equal(prepared.ok,true,prepared.error);assert.equal(prepared.bundle.version,3);assert.deepEqual(legacy,saved);
  assert.deepEqual(prepared.bundle.models.speed.examples,legacy.models.speed.examples);
  for(let i=0;i<legacy.models.steering.examples.length;i++){
   const original=legacy.models.steering.examples[i],converted=prepared.bundle.models.steering.examples[i];
   assert.equal(STEERING[converted.label],-STEERING[original.label] || 0);
   assert.deepEqual({...converted,label:original.label},original);
  }
  for(const row of data.rows('steering').filter((_,i)=>i%7===0)){
   const query=globalThis.WorkshopDataVector.vector(data.schemas.steering,row.features,true);
   const oldPrediction=classify(legacy.models.steering.examples,query,legacy.models.steering.k);
   const current=prepared.decide({...data.clear,...row.features}).steering;
   assert.equal(current.decision,swap(oldPrediction.label));
   assert.equal(current.confidence,surenessOf(oldPrediction));
   assert.deepEqual(current.evidence.map(e=>e.id),oldPrediction.evidence.map(e=>e.id));
  }
  assert.deepEqual(prepareDrivingBundle(prepared.bundle).bundle,prepared.bundle);
  const invalid=structuredClone(legacy);invalid.selftests.find(t=>t.role==='steering').decision='corrupt';assert.equal(prepareDrivingBundle(invalid).ok,false);
 }
 const invalid=legacyBundle(2);invalid.controls=structuredClone(prepareDrivingBundle(invalid).bundle.controls);assert.equal(prepareDrivingBundle(invalid).ok,false);
});

test('saved Workshop steering shelves convert once without touching sensor or speed data',()=>{
 const machine=game.buildDrivingPairTable({train:true}),piece=machine.pieces.find(p=>p.drivingRole==='steering');
 const speed=structuredClone(machine.pieces.find(p=>p.drivingRole==='speed'));
 delete piece.steeringConvention;
 piece.learning.data.brain.shelves=Object.fromEntries(Object.entries(piece.learning.data.brain.shelves).map(([label,examples])=>[swap(label),examples]));
 const old=structuredClone(piece.learning.data.brain);
 const savedMachine=structuredClone(machine);
 const compiledLegacy=compileDrivingMachine(savedMachine,'saved');assert.equal(compiledLegacy.ok,true,compiledLegacy.error);
 assert.equal(savedMachine.pieces.find(p=>p.drivingRole==='steering').steeringConvention,data.steeringConvention);
 assert.equal(data.migrateSteeringPiece(piece),true);
 for(const [label,examples] of Object.entries(old.shelves))assert.deepEqual(piece.learning.data.brain.shelves[swap(label)],examples);
 const converted=structuredClone(piece);assert.equal(data.migrateSteeringPiece(piece),false);assert.deepEqual(piece,converted);
 assert.deepEqual(machine.pieces.find(p=>p.drivingRole==='speed'),speed);
 const compiled=compileDrivingMachine(machine,'saved');assert.equal(compiled.ok,true);assert.deepEqual(piece,converted);
 assert.deepEqual(compiled.bundle,compiledLegacy.bundle);
});
