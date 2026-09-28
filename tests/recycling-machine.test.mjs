import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {scoreRun} from '../P5 Programme/buddy-kit/client/city-common/recycling.js';
import {ActivityTrial} from '../P5 Programme/buddy-kit/client/city-common/activity-trial.js';
const require=createRequire(import.meta.url), R=require('../P5 Programme/buddy-kit/client/workshop/logic/recycling-machine.js');
const G=require('../P5 Programme/buddy-kit/client/workshop/game.js');
function draft(){const table=R.starter();Object.assign(table.pieces.find(p=>p.id==='model'),{k:1,learning:{cam:{brain:{shelves:{metal:[{id:'public-a',vec:[1,0]}],plastic:[{id:'public-b',vec:[0,1]}]},nextId:3}}}});return {sourceMachineId:'test-machine',name:'My sorter',seed:42,table};}
const rows=[{id:'a',label:'metal',vector:[1,0]},{id:'b',label:'plastic',vector:[0,1]}];
const run=d=>R.run(R.snapshot(d),rows,{yieldTask:async()=>{}});
test('complete graph sorts a batch without exposing answer keys to engine',async()=>{const out=await run(draft());assert.deepEqual(out.map(r=>r.bin),['bin-metal','bin-plastic']);assert.equal(scoreRun(out).correct,2);assert.ok(out.every(r=>r.evidence.every(e=>!e.reference.present)));});
test('correct predictions routed to incorrect bins are scored incorrect',async()=>{const d=draft();d.table.snaps.find(s=>s.from.end==='exit2').to.piece='bin-plastic';const out=await run(d);assert.equal(out[0].prediction,'metal');assert.equal(out[0].bin,'bin-plastic');assert.equal(scoreRun(out).correct,1);assert.equal(scoreRun(out).predictionCorrect,2);});
test('renaming a bin does not change its destination; bindings survive sealed bricks',async()=>{const d=draft();d.table.pieces.find(p=>p.id==='bin-metal').name='Glass';const sealed=G.Brick.makePart(d.table,d.table.pieces.map(p=>p.id),'Sorter');assert.equal(sealed.ok,true);d.table={pieces:[{id:'part',type:'brick',def:sealed.def}],wires:[],snaps:[]};const out=await run(d);assert.equal(out[0].bin,'bin-metal');assert.match(out[0].evidence[0].terminalId,/part~/);});
test('private learning and unsupported blocks refuse publication',()=>{const d=draft();d.table.pieces.find(p=>p.id==='model').privateData={v:1,collection:'c-abcdefgh-1',dependency:'session'};assert.throws(()=>R.snapshot(d),/session-only/);delete d.table.pieces.find(p=>p.id==='model').privateData;d.table.pieces.push({id:'cam',type:'camera'});assert.throws(()=>R.snapshot(d),/live devices/);});
test('bounded unfinished inputs become one explained human check per item',async()=>{const d=draft(),m=R.snapshot(d);const out=await R.run(m,rows,{limits:{ticks:1},yieldTask:async()=>{}});assert.equal(out.length,rows.length);assert.ok(out.every(r=>r.bin==='human-check'&&r.abstainReason));});
test('trials freeze versions and results; pause resumes without advancing',async()=>{const m=R.snapshot(draft()),out=await R.run(m,rows,{yieldTask:async()=>{}});const trial=new ActivityTrial('recycling',m,'batch-1',rows,out);m.name='Changed';out[0].bin='bin-trash';trial.run();trial.update(.1);trial.pause();const phase=trial.phase;trial.update(.1);assert.equal(trial.phase,phase);trial.run();for(let i=0;i<100;i++)trial.update(.1);assert.equal(trial.state,'finished');assert.equal(trial.results[0].bin,'bin-metal');assert.equal(trial.cap.name,'My sorter');});

test('confidence changes and multiple models preserve Workshop block semantics',async()=>{
  const d=draft(),first=d.table.pieces.find(p=>p.id==='model');
  first.sure=1;first.learning.cam.brain.shelves.metal[0].vec=[.99,.1];first.learning.cam.brain.shelves.plastic[0].vec=[.1,.99];const unsure=await run(d);assert.ok(unsure.every(r=>r.bin==='human-check'));
  first.sure=.2;
  d.table.pieces.push({...structuredClone(first),id:'second-model',learning:{cam:{brain:{shelves:{plastic:[{id:'c',vec:[1,0]}],metal:[{id:'d',vec:[0,1]}]},nextId:3}}}});
  for(const wire of d.table.wires)if(wire.from.block==='model')wire.from.block='second-model';
  const out=await run(d);assert.deepEqual(out.map(r=>r.bin),['bin-plastic','bin-metal']);
  assert.equal(scoreRun(out).correct,0);
});
test('runtime freezes the graph before yielding',async()=>{
  const machine=R.snapshot(draft());let changed=false;
  const results=await R.run(machine,rows,{limits:{chunk:1},yieldTask:async()=>{changed=true;machine.outputs['bin-metal']='trash';machine.table.wires=[];}});
  assert.ok(changed);assert.equal(results[0].bin,'bin-metal');
});

import {publishRecyclingMachine} from '../P5 Programme/buddy-kit/client/city-common/recycling-machine-project.js';
import {createProject,exportProjectEnvelope,importProjectEnvelope} from '../P5 Programme/buddy-kit/client/city-common/project-store.js';
test('publication is atomic after draft save; failed storage retains prior City version',async()=>{
  let project=createProject(),d=draft(),fail=false;const order=[];
  const store={mutate:async fn=>{order.push('publish');if(fail)return {ok:false,error:'Full'};const next=fn(structuredClone(project));project=next;return {ok:true};}};
  const game={saveDrivingMachine:async()=>order.push('draft'),recyclingDraft:()=>structuredClone(d),serializeDebug:()=>d.table};
  const spec={store,game,runtime:R,flush:async()=>order.push('flush'),projectId:project.id};
  await publishRecyclingMachine(spec);assert.deepEqual(order,['draft','flush','publish']);assert.equal(project.projects.recyclingMachine.revision,1);
  const prior=structuredClone(project.projects.recyclingMachine);fail=true;d.name='Changed';await assert.rejects(publishRecyclingMachine(spec),/Full/);assert.deepEqual(project.projects.recyclingMachine,prior);
  fail=false;game.saveDrivingMachine=async()=>{throw Error('Draft failed');};order.length=0;await assert.rejects(publishRecyclingMachine(spec),/Draft failed/);assert.deepEqual(order,[]);
});
test('project switch rejects publishing; recovery retains graph, bindings and prior rewards',async()=>{
  const project=createProject(),d=draft();project.projects.recyclingMachine=R.snapshot(d);project.projects.workshop={champion:{projects:{workshop:{machines:{[d.sourceMachineId]:G.privateProject(d)}}}}};
  project.economy.transactions.push({id:'prior-award',type:'award',amount:5,title:'Earlier work',at:'2026-01-01'});project.economy.balance=5;
  const backup=exportProjectEnvelope(project);assert.ok(backup.ok);const restored=importProjectEnvelope(backup.archive);assert.ok(restored.ok);
  assert.deepEqual(restored.project.projects.recyclingMachine,project.projects.recyclingMachine);
  assert.deepEqual(restored.project.economy,project.economy);
  await assert.rejects(publishRecyclingMachine({store:{mutate:async fn=>fn({...project,id:'another'})},game:{saveDrivingMachine:async()=>{},recyclingDraft:()=>d,serializeDebug:()=>d.table},runtime:R,flush:async()=>{},projectId:project.id}),/Project changed/);
});
test('private examples cannot enter published snapshots or the serialized editable backup',()=>{
  const d=draft(),p=d.table.pieces.find(p=>p.id==='model');p.privateData={v:1,collection:'c-abcdefgh-1',dependency:'session'};p.learning.cam.brain.shelves.metal[0].display='PRIVATE_CANARY';
  assert.throws(()=>R.snapshot(d),/session-only/);
  const project=createProject();project.projects.workshop=G.privateProject(d);
  assert.ok(!JSON.stringify(exportProjectEnvelope(project).archive).includes('PRIVATE_CANARY'));
});
test('conflicting duplicate terminal arrivals become one human check per input',async()=>{
  const d=draft();d.table.pieces.push({id:'copy',type:'feeder',items:[],once:true},{id:'copy-track',type:'track'});
  d.table.snaps.push({from:{piece:'copy',end:'out'},to:{piece:'copy-track',end:'in'}},{from:{piece:'copy-track',end:'out'},to:{piece:'bin-cardboard',end:'in'}});
  d.table.wires.push({from:{block:'model',port:'result'},to:{block:'copy',port:'drop'}});
  const results=await run(d);assert.equal(results.length,2);assert.ok(results.every(r=>r.bin==='human-check'&&r.abstainReason==='conflicting-outputs'));
});
import {applyChallengeOutcome} from '../P5 Programme/buddy-kit/client/city-common/project-store.js';
test('machine revisions record destination errors without duplicate rewards',async()=>{
  const project=createProject();project.projects.recyclingMachine={...R.snapshot(draft()),revision:1};
  const results=await run(draft());const outcome={machineId:'test-machine',revision:1,scenario:{kind:'city-recycling',seed:'batch-1'},results,correctCount:2,gradedIds:['a','b'],wrongIds:[]};
  const events=[{type:'held-out-eval',evidence:{challengeId:'image-sorter',total:2,abstained:0}},{type:'city-install',evidence:{challengeId:'image-sorter',total:2}}];
  const first=applyChallengeOutcome(project,'image-sorter',outcome,events);
  const again=applyChallengeOutcome(first.project,'image-sorter',outcome,events);
  assert.deepEqual(again.project.economy,first.project.economy);
  assert.ok(Object.keys(first.project.challenges.runs).length>0);
});
test('real public photo features match the trained Workshop library model',async()=>{
  const L=require('../P5 Programme/buddy-kit/client/workshop/logic/model-library.js');
  const M=require('../P5 Programme/buddy-kit/client/workshop/assets/library/models.js');
  const D=require('../P5 Programme/buddy-kit/client/workshop/assets/city-recycling/catalogue.js');
  for(const row of D.photos)L.register(row.id,row.vector);
  const trained=L.train('city-recycling-v1',D.photos.filter(r=>r.split==='train'),'knn',G.BRAIN_REGISTRY,M.versions,'Public sorter');
  const d=draft(),p=d.table.pieces.find(p=>p.id==='model');delete p.learning;p.libraryModel=trained;
  const unseen=D.photos.filter(r=>r.split==='test');
  const expected=unseen.map(row=>L.answer(trained,L.input('city-recycling-v1',row),G.BRAIN_REGISTRY,M.versions).label);
  const actual=await R.run(R.snapshot(d),unseen,{yieldTask:async()=>{}});
  assert.deepEqual(actual.map(r=>r.prediction),expected);
  assert.equal(actual.filter(r=>!r.abstained).length,9);assert.equal(scoreRun(actual).correct,9);
});
test('other input identities cannot impersonate the City intake',async()=>{
  const d=draft();d.table.pieces.push({id:'other',type:'feeder',once:true,items:['other']},{id:'other-track',type:'track'});
  d.table.snaps.push({from:{piece:'other',end:'out'},to:{piece:'other-track',end:'in'}},{from:{piece:'other-track',end:'out'},to:{piece:'bin-cardboard',end:'in'}});
  const actual=await run(d);assert.deepEqual(actual.map(r=>r.bin),['bin-metal','bin-plastic']);
});
test('all six material bindings are independent of the display name',async()=>{
  assert.deepEqual(G.WIDGETS.bin.find(w=>w.prop==='cityDestination').options.filter(Boolean),R.destinations);
  for(const material of R.destinations){const d=draft();const bin=d.table.pieces.find(p=>p.id==='bin-metal');bin.cityDestination=material;bin.name='Anything the child chooses';const out=await run(d);assert.equal(out[0].bin,material==='human-check'?material:'bin-'+material);}
});
test('fixed nonlearning readers keep their normal block semantics',async()=>{
  const d=draft(),p=d.table.pieces.find(p=>p.id==='model');p.senseId='tag';delete p.learning;
  assert.equal(R.validate(d).ok,true);const results=await run(d);assert.equal(results.length,2);assert.ok(results.every(r=>r.bin==='human-check'));
});
