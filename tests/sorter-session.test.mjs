import test from 'node:test';
import assert from 'node:assert/strict';
import { buildImageCapabilityV2 } from '../P5 Programme/buddy-kit/client/city-common/capability-export.js';
import { ActivityTrial } from '../P5 Programme/buddy-kit/client/city-common/activity-trial.js';
import { readSorterSession, writeSorterSession, binCounts, binFullness } from '../P5 Programme/buddy-kit/client/city-common/sorter-session.js';
import { createProject, exportProjectEnvelope, importProjectEnvelope } from '../P5 Programme/buddy-kit/client/city-common/project-store.js';

const axis = i => { const v = Array(1024).fill(0); v[i] = 1; return v; };
function memoryStorage() { const values = new Map(); return { getItem:k=>values.get(k)||null, setItem:(k,v)=>values.set(k,v), removeItem:k=>values.delete(k) }; }

test('accepted session photos remain exact and stay inside their project', () => {
  const storage = memoryStorage();
  const original = readSorterSession('project-a', storage);
  const saved = writeSorterSession({ ...original, batch:[{id:'good',vector:axis(0)},{id:'bad',vector:[1]}] }, storage);
  assert.equal(saved.ok, true);
  assert.deepEqual(readSorterSession('project-a', storage).batch.map(r=>r.id), ['good']);
  assert.equal(readSorterSession('project-b', storage).batch.length, 0);
  storage.removeItem('passiona-recycling-session-v1');
  assert.equal(readSorterSession('project-a', storage).batch.length, 0);
});

test('personal photos go to the chosen bin or human check, without an answer key', () => {
  const built = buildImageCapabilityV2({id:'personal-test',name:'Sorter',labels:['glass','paper'],preprocessing:'mobilenet-v3-small-224-squash-f32-unit-v1',examples:[{label:'glass',vector:axis(0)},{label:'paper',vector:axis(1)}],threshold:.2,k:1});
  assert.equal(built.ok,true);
  const trial = new ActivityTrial('recycling',built.capability,'personal',[{id:'p1',vector:axis(0)},{id:'p2',vector:axis(1)},{id:'p3',vector:axis(2)}]);
  trial.run(); for(let i=0;i<100&&trial.state==='running';i++)trial.update(.1);
  assert.equal(trial.state,'finished');
  assert.deepEqual(trial.results.map(r=>r.bin),['bin-glass','bin-paper','human-check']);
  assert.ok(trial.results.every(r=>r.truth===null));
  assert.deepEqual({ ...binCounts(trial.results) },{'bin-glass':1,'bin-paper':1,'human-check':1});
  assert.equal(binFullness(1,3),33);
  assert.equal(binFullness(0,3),0);
});

test('saved model vectors and labels travel in the Champion project envelope', () => {
  const project=createProject();
  project.projects.sorterModels={one:{name:'Sorter',examples:[{label:'glass',vector:axis(0)}]}};
  project.projects.workshopSkills={active:'recycling',recycling:{machineId:'camera-machine',modelRef:'saved:one'},driving:{machineId:'driver-machine'}};
  const exported=exportProjectEnvelope(project);
  assert.equal(exported.ok,true);
  const restored=importProjectEnvelope(exported.archive);
  assert.equal(restored.ok,true);
  assert.deepEqual(restored.project.projects.sorterModels.one.examples,project.projects.sorterModels.one.examples);
  assert.deepEqual(restored.project.projects.workshopSkills,project.projects.workshopSkills);
  assert.equal(JSON.stringify(exported.archive).includes("passiona-recycling-session"),false);
});

test('a sixty-photo run freezes its model and batch, counts arrivals once and pauses exactly', async () => {
  const { ActivityTrial } = await import('../P5 Programme/buddy-kit/client/city-common/activity-trial.js');
  const { routeDecision } = await import('../P5 Programme/buddy-kit/client/city-common/recycling.js');
  const cap=buildImageCapabilityV2({id:'frozen',name:'Frozen',labels:['  PLASTIC  ','紙皮'],preprocessing:'mobilenet-v3-small-224-squash-f32-unit-v1',examples:[{label:'  PLASTIC  ',vector:axis(0)},{label:'紙皮',vector:axis(1)}],threshold:.5,k:1}).capability;
  const rows=Array.from({length:60},(_,i)=>({id:'photo-'+i,vector:axis(i%3)}));
  const trial=new ActivityTrial('recycling',cap,'personal',rows);
  cap.model.threshold=1;rows.length=0;
  assert.equal(trial.rows.length,60);assert.equal(trial.cap.model.threshold,.5);
  trial.run();for(let i=0;i<29;i++)trial.advance();assert.equal(trial.results.length,0);
  trial.pause();trial.update(10);assert.equal(trial.results.length,0);
  trial.run();trial.advance();assert.equal(trial.results.length,1);
  while(trial.state==='running')trial.advance();
  assert.deepEqual({...binCounts(trial.results)},{'bin-plastic':20,'bin-cardboard':20,'human-check':20});
  trial.run();trial.update(.1);assert.equal(trial.results.length,60);
  assert.equal(routeDecision('mystery',false).bin,'human-check');
  for(const label of ['玻璃','Glass',' GLASS '])assert.equal(routeDecision(label,false).bin,'bin-glass');
});

test('Workshop references never silently fall back to another session or saved model', async () => {
  const { resolveSorterSelection } = await import('../P5 Programme/buddy-kit/client/city-common/sorter-session.js');
  const cap=buildImageCapabilityV2({id:'ref',name:'Chosen',labels:['glass','paper'],preprocessing:'mobilenet-v3-small-224-squash-f32-unit-v1',examples:[{label:'glass',vector:axis(0)},{label:'paper',vector:axis(1)}],threshold:.5,k:1,workshop:{sourceMachineId:'a',modelId:'camera'}}).capability;
  const models={saved:{capability:cap}},session={quick:cap,selection:'saved'};
  assert.equal(resolveSorterSelection(session,models,{modelRef:'saved:missing'}),null);
  assert.equal(resolveSorterSelection(session,models,{machineId:'b',modelRef:'table:camera'}),null);
  assert.equal(resolveSorterSelection({...session,quick:null},models,{modelRef:'quick'}),null);
  assert.equal(resolveSorterSelection(session,models,{machineId:'a',modelRef:'table:camera'}),cap);
  assert.equal(resolveSorterSelection({},models,{modelRef:'saved:saved'}),cap);
});

test('capturing a table model retains the separate unsaved quick model in this session', async()=>{
  const { resolveSorterSelection }=await import('../P5 Programme/buddy-kit/client/city-common/sorter-session.js');
  const make=(id,workshop)=>buildImageCapabilityV2({id,name:id,labels:['glass','paper'],preprocessing:'mobilenet-v3-small-224-squash-f32-unit-v1',examples:[{label:'glass',vector:axis(0)},{label:'paper',vector:axis(1)}],threshold:.5,k:1,workshop}).capability;
  const quick=make('quick',{modelId:'quick-recycling-sorter'}),active=make('table',{sourceMachineId:'machine',modelId:'camera'}),storage=memoryStorage();
  assert.equal(writeSorterSession({projectId:'p',preprocessing:'mobilenet-v3-small-224-squash-f32-unit-v1',quick,active,batch:[],teaching:[]},storage).ok,true);
  const session=readSorterSession('p',storage);
  assert.equal(resolveSorterSelection(session,{}, {modelRef:'quick'}).id,'quick');
  assert.equal(resolveSorterSelection(session,{}, {modelRef:'table:camera',machineId:'machine'}).id,'table');
  assert.equal(readSorterSession('another-project',storage).active,null);
});
