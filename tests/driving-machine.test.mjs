import {createProject,exportProjectEnvelope,importProjectEnvelope} from '../P5 Programme/buddy-kit/client/city-common/project-store.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {drivingStarter,compileDrivingMachine} from '../P5 Programme/buddy-kit/client/city-common/driving-machine.js';
import {prepareDrivingBundle} from '../P5 Programme/buddy-kit/client/city-common/driving-bundle.js';
import {latestDrivingRevision,recordDrivingAttempt} from '../P5 Programme/buddy-kit/client/city-common/driving-project.js';
import {schoolScenario,createDrivingSession,readingsAt} from '../P5 Programme/buddy-kit/client/city-common/driving-simulation.js';
const require=createRequire(import.meta.url),game=require('../P5 Programme/buddy-kit/client/workshop/game.js'),Brain=require('../P5 Programme/buddy-kit/client/workshop/logic/brain.js');
const prepared=machine=>{const built=compileDrivingMachine(machine,'test');assert.equal(built.ok,true,built.error);return prepareDrivingBundle(built.bundle);};
const run=(machine,kind='barrier')=>{const scenario={...schoolScenario(kind,71),startOffset:0};const s=createDrivingSession(scenario,prepared(machine));while(!s.snapshot().outcome)s.step();return s.evidence();};

test('empty editable starter collides through normal physics; constant Stop stays still',()=>{
 const machine=drivingStarter();const result=run(machine);assert.equal(result.outcome,'collision');assert.ok(result.records.some(r=>r.pose.speed>0));assert.equal(result.records[0].controls.steering.decision,'straight');assert.equal(result.records[0].controls.speed.decision,'go');
 machine.pieces.find(p=>p.drivingRole==='speed').drivingAction='stop';const stopped=run(machine);assert.equal(stopped.outcome,'timeout');assert.deepEqual(stopped.car,stopped.records[0].before);
});
test('partial learning, constant mode preservation, shared classifier settings and evidence',()=>{
 const machine=game.buildDrivingPairTable();game.teachDrivingExamples('speed',machine);
 const learned=run(machine);assert.equal(learned.outcome,'safe-stop');
 const p=machine.pieces.find(p=>p.drivingRole==='speed'),shelves=structuredClone(p.learning);
 p.drivingMode='constant';p.drivingAction='go';assert.equal(run(machine).outcome,'collision');assert.deepEqual(p.learning,shelves);
 p.drivingMode='trained';p.k=7;p.sure=.9;const config=prepared(machine);
 for(let i=0;i<40;i++){
   const readings=readingsAt(schoolScenario(i%2?'barrier':'mixed',i+71),{x:.05*i,z:3+i*.6,heading:.005*i,speed:i%8},i*.3);
   const entry=game.modelEntry(p),expected=Brain.classify(entry.brain,entry.vec({dataset:'drive-speed-v2',features:readings}),p.k),actual=config.decide(readings).speed;
   assert.equal(actual.decision,expected.label);assert.equal(actual.confidence,game.surenessOf(expected));assert.equal(actual.abstained,game.surenessOf(expected)<p.sure);assert.deepEqual(actual.evidence,expected.evidence);
 }
 assert.equal(config.bundle.models.speed.threshold,.9);
});
test('steering examples change bend behavior',()=>{
 const machine=game.buildDrivingPairTable();game.teachDrivingExamples('speed',machine);
 assert.notEqual(run(machine,'left').outcome,'arrived');game.teachDrivingExamples('steering',machine);assert.equal(run(machine,'left').outcome,'arrived');
});
test('explicit bindings fail closed after removal or disconnected output',()=>{
 for(const edit of [m=>m.pieces=m.pieces.filter(p=>p.drivingRole!=='speed'),m=>m.wires=m.wires.filter(w=>w.from.block!=='speed_dv_model'),m=>m.driving.bindings.speed.blockId='missing']){const m=drivingStarter();edit(m);assert.equal(compileDrivingMachine(m,'test').ok,false);}
});
test('latest attempts reuse revisions, edits are frozen, invalid latest never uses an old revision',()=>{
 const p=createProject();const first=latestDrivingRevision(p,{attemptId:'a',scenario:{kind:'barrier'}});assert.equal(first.prepared.bundle.version,3);assert.equal(p.projects.driving.currentAttempt.modelRef,first.key);
 assert.equal(latestDrivingRevision(p).key,first.key);
 const attempt=createDrivingSession({...schoolScenario('barrier',71),startOffset:0},first.prepared);while(!attempt.snapshot().outcome)attempt.step();recordDrivingAttempt(p,attempt.evidence());
 const id=first.prepared.bundle.machineId,m=p.projects.workshop.champion.projects.workshop.machines[id];m.pieces.find(p=>p.drivingRole==='speed').drivingAction='stop';
 const second=latestDrivingRevision(p,{attemptId:'b',scenario:{kind:'barrier'}});assert.notEqual(second.key,first.key);assert.equal(first.prepared.decide({}).speed.decision,'go');assert.equal(second.prepared.decide({}).speed.decision,'stop');
 const archive=exportProjectEnvelope(p);assert.equal(archive.ok,true);const restored=importProjectEnvelope(archive.archive);assert.equal(restored.ok,true);const recovered=restored.project;assert.equal(latestDrivingRevision(recovered).key,second.key);assert.deepEqual(recovered.projects.driving.attempts,p.projects.driving.attempts);assert.equal(recovered.projects.driving.currentAttempt.modelRef,second.key);
 m.wires=[];assert.throws(()=>latestDrivingRevision(p),/Repair/);assert.equal(p.projects.driving.installed,second.key);
});
test('v1 learned pairs and earlier editable pairs keep learned behavior',()=>{
 const m=game.buildDrivingPairTable({train:true});delete m.driving;for(const p of m.pieces){delete p.drivingMode;delete p.drivingAction;}
 const result=prepared(m);const old=structuredClone(result.bundle);old.version=1;for(const model of Object.values(old.models))delete model.mode;
 assert.equal(prepareDrivingBundle(old).ok,true);assert.equal(run(m).outcome,'safe-stop');
});

test('broken installed references do not create a replacement starter',()=>{
 const project={projects:{driving:{bundles:{},installed:'missing@1'}}};assert.throws(()=>latestDrivingRevision(project),/missing/);assert.equal(project.projects.workshop,undefined);
});
test('empty learned controllers disclose their defaults and remain runnable',()=>{
 const m=drivingStarter();for(const p of m.pieces.filter(p=>p.drivingRole))p.drivingMode='trained';const config=prepared(m);assert.equal(config.bundle.models.steering.mode,'default');assert.equal(config.bundle.models.speed.mode,'constant');assert.equal(config.decide({}).speed.decision,'go');
});
