import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {ActivityTrial,siteSkill,placeActivitySites} from '../P5 Programme/buddy-kit/client/city-common/activity-trial.js';
import {SCHOOL_TRACKS,runTrial,advanceStep,buildTrack} from '../P5 Programme/buddy-kit/client/city-common/driving.js';
import {buildDriveCapability,buildImageCapabilityV2} from '../P5 Programme/buddy-kit/client/city-common/capability-export.js';
import {selectItems,RECYCLING_PREPROCESSING} from '../P5 Programme/buddy-kit/client/city-common/recycling.js';
const require=createRequire(import.meta.url), game=require('../P5 Programme/buddy-kit/client/workshop/game.js');
const data=require('../P5 Programme/buddy-kit/client/workshop/assets/city-recycling/catalogue.js');
function reference(exercise,seed=42){return buildDriveCapability(game.publishDriveModel(null,game.buildDriveTable({exercise,seed}))).capability;}
test('actual Workshop teaching/export path completes each bounded exercise for three seeds',()=>{
 for(const exercise of Object.keys(SCHOOL_TRACKS))for(const seed of [1,42,77]){
  const cap=reference(exercise,seed),a=runTrial({cap,track:SCHOOL_TRACKS[exercise]});
  assert.equal(a.outcome,'goal',`${exercise} ${seed}`);assert.equal(a.steps.at(-1).pose.speed,0);
  const b=new ActivityTrial('driving',cap,exercise);b.run();for(let i=0;i<13000&&b.state==='running';i++)b.update(.05);
  assert.equal(b.outcome,a.outcome);assert.deepEqual(b.steps,a.steps);
 }
});
test('always-forward fails red light, collision, and bend exercises',()=>{
 const decide=()=>({decision:'forward'});
 for(const [id,outcome] of [['light','red-light'],['obstacle','collision'],['bend','off-road']]){
  const r=runTrial({track:SCHOOL_TRACKS[id],decide});assert.equal(r.outcome,outcome);assert.equal(r.steps.at(-1).pose.speed,0);
 }
});
test('collision sweeps the whole motion segment; an abstention cannot pass the stop exercise',()=>{
 const track=buildTrack({points:[[0,0],[0,30]],obstacles:[{x:0,z:5,r:.2}]});
 assert.equal(advanceStep(track,{x:0,z:0,speed:8,heading:0},{decision:'forward'},{dt:1}).record.event,'collision');
 assert.equal(advanceStep(SCHOOL_TRACKS.obstacle,{x:0,z:20,speed:0,heading:0},{abstained:true}).record.event,'emergency-stop');
});
test('one owner: repeat Run, pause, step, hidden-time clamp and finished trial cannot duplicate steps',()=>{
 const first=new ActivityTrial('driving',reference('light'),'light');first.step();assert.equal(first.steps.length,1);assert.equal(first.state,'paused');
 const t=new ActivityTrial('driving',reference('light'),'light');t.run();t.run();t.update(.1);assert.equal(t.steps.length,1);
 t.pause();t.update(999);assert.equal(t.steps.length,1);t.step();assert.equal(t.steps.length,2);assert.equal(t.state,'paused');
 t.run();t.update(999);assert.equal(t.steps.length,3);t.finish('timeout');t.run();t.step();assert.equal(t.steps.length,3);assert.equal(t.car.speed,0);
});
test('site lookup requires the exact installed revision; no compatible-model fallback',()=>{
 const caps={a:{revision:1},b:{revision:2}},installs={site:{id:'site',hostInstanceId:'site',capabilityRef:'a'}};
 assert.equal(siteSkill(caps,installs,null,()=>true),null);assert.equal(siteSkill(caps,installs,'other',()=>true),null);
 assert.equal(siteSkill(caps,installs,'site',()=>true).cap.revision,1);
});
test('all recycling selections are held-out by object identity, never training fallback',()=>{
 const rows=[{id:'a',objectId:'same',label:'plastic',split:'train'},{id:'b',objectId:'same',label:'plastic',split:'test'},{id:'c',label:'metal',split:'test'}];
 for(const kind of ['normal','confusing','unfamiliar'])assert.ok(selectItems(rows,{kind}).every(r=>r.id==='c'));
 assert.deepEqual(selectItems(rows.slice(0,1)),[]);
});
test('exact scanner images produce real 1024-dimensional features and held-out success',()=>{
 const train=data.photos.filter(r=>r.split==='train'),testRows=selectItems(data.photos,{count:9});
 assert.equal(train.length,15);assert.equal(testRows.length,9);
 for(const row of data.photos){assert.equal(row.vector.length,1024);assert.ok(row.vector.every(Number.isFinite));}
 const {capability:cap}=buildImageCapabilityV2({id:'city-scan',name:'City scanner',labels:data.labels,preprocessing:RECYCLING_PREPROCESSING,dimension:1024,k:3,threshold:.2,examples:train.map(r=>({label:r.label,vector:r.vector}))});
 const a=new ActivityTrial('recycling',cap,'batch-1',testRows);a.run();for(let i=0;i<600;i++)a.update(.1);
 assert.equal(a.state,'finished');assert.equal(a.results.length,9);assert.equal(a.summary().score.correct,9);
 const shifted=buildImageCapabilityV2({id:'wrong-scan',name:'Wrong scanner',labels:data.labels,preprocessing:RECYCLING_PREPROCESSING,dimension:1024,k:3,threshold:.2,examples:train.map(r=>({label:data.labels[(data.labels.indexOf(r.label)+1)%3],vector:r.vector}))}).capability;
 const b=new ActivityTrial('recycling',shifted,'batch-1',testRows);b.run();for(let i=0;i<600;i++)b.update(.1);
 assert.equal(b.summary().score.correct,0);assert.equal(b.summary().score.wrong,9);
});
test('a recycling trial without a sorter sends every object to human review',()=>{
 const rows=selectItems(data.photos,{count:9});
 const trial=new ActivityTrial('recycling',null,'batch-1',rows);
 trial.step();assert.equal(trial.state,'paused');assert.equal(trial.results.length,0);
 trial.run();for(let i=0;i<600&&trial.state==='running';i++)trial.update(.1);
 assert.equal(trial.state,'finished');assert.equal(trial.results.length,9);
 assert.ok(trial.results.every(r=>r.bin==='human-check'&&r.routedBy==='human-review'&&r.abstainReason==='no-model'&&r.decision==='__abstain'));
 assert.deepEqual(trial.results.map(r=>r.truth),rows.map(r=>r.label));
 assert.equal(trial.summary().score.humanChecked,9);
 assert.equal(trial.summary().score.correct,0);
 assert.equal(trial.summary().capabilityId,null);
 const empty=new ActivityTrial('recycling',null,'personal',[]);empty.run();empty.step();assert.equal(empty.state,'ready');
});
test('site placement preserves saved data, avoids occupied land and reserves separate clearances',()=>{
 const city={scale:200,focus:[100,100],buildings:[{pos:[100,100],footprint:[30,30]}],roads:[{points:[[0,65],[200,65]],width:10}],props:[{x:60,z:100,footprint:[15,15]}],trees:[{x:140,z:100,radius:5}]};
 const before=JSON.stringify(city),sites=placeActivitySites(city);assert.equal(sites.length,1);assert.equal(sites[0].kind,'recycling');assert.equal(JSON.stringify(city),before);
 assert.deepEqual(sites,placeActivitySites(city));for(const s of sites)assert.ok(Math.abs(s.z-65)>s.d/2+7);
});

test('scanner manifest pins the live geometry, fixed view and every model input picture',async()=>{
 const {readFile}=await import('node:fs/promises'),{createHash}=await import('node:crypto');
 const base=new URL('../P5 Programme/buddy-kit/client/',import.meta.url),hash=async path=>createHash('sha256').update(await readFile(new URL(path,base))).digest('hex');
 const manifest=JSON.parse(await readFile(new URL('workshop/assets/city-recycling/manifest.json',base)));
 assert.equal(await hash('city-common/city-waste.js'),manifest.geometrySHA256);
 assert.equal(await hash('tools/generate-city-recycling.html'),manifest.scannerSHA256);
 for(const row of data.photos)assert.equal(await hash(`workshop/${row.src}`),manifest.images[row.id]);
});
test('project archive round-trip retains site revision and completed scenario/results',async()=>{
 const {createProject,exportProjectEnvelope,importProjectEnvelope}=await import('../P5 Programme/buddy-kit/client/city-common/project-store.js');
 const project=createProject('Activity backup'),cap=reference('light');project.capabilities[`${cap.id}@1`]=cap;
 project.installations.school={id:'school',hostInstanceId:'school',capabilityRef:`${cap.id}@1`};
 project.projects.cityActivities={driving:{scenario:'light',outcome:'goal',revision:1,capabilityId:cap.id,steps:[],results:[]}};
 const restored=importProjectEnvelope(exportProjectEnvelope(project).archive);assert.equal(restored.ok,true);
 assert.deepEqual(restored.project.projects.cityActivities,project.projects.cityActivities);assert.deepEqual(restored.project.installations,project.installations);
});

test('each driving school dataset has a selectable name and an accurate row count',()=>{
 const datasets=require('../P5 Programme/buddy-kit/client/workshop/logic/datasets.js');
 for(const exercise of ['bend','obstacle','light']){const id='drive-'+exercise;assert.ok(datasets.ORDER.includes(id));assert.equal(datasets.schema(id).size,datasets.rows(id,42).length);assert.equal(datasets.schema(id).nameKey,'dataset.drive.'+exercise+'.name');}
});
