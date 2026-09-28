import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {ActivityTrial,placeActivitySites} from '../P5 Programme/buddy-kit/client/city-common/activity-trial.js';
import {SCHOOL_BOUNDS,SCHOOL_PREVIEW} from '../P5 Programme/buddy-kit/client/city-common/driving-school-site.js';
import {resolveExercise,resultDataset} from '../P5 Programme/buddy-kit/client/city-common/recycling-exercises.js';
import {createProject,exportProjectEnvelope,importProjectEnvelope} from '../P5 Programme/buddy-kit/client/city-common/project-store.js';
const require=createRequire(import.meta.url),data=require('../P5 Programme/buddy-kit/client/workshop/assets/city-recycling-v2/catalogue.js');
const old=require('../P5 Programme/buddy-kit/client/workshop/assets/city-recycling/catalogue.js');
const Library=require('../P5 Programme/buddy-kit/client/workshop/logic/model-library.js');
test('v2 pins 32 real image features and separates every training and held-out identity',async()=>{
 const base=new URL('../P5 Programme/buddy-kit/client/',import.meta.url),hash=async p=>createHash('sha256').update(await readFile(new URL(p,base))).digest('hex');
 const manifest=JSON.parse(await readFile(new URL('workshop/assets/city-recycling-v2/manifest.json',base)));
 assert.equal(data.photos.length,32);assert.equal(data.labels.length,4);
 assert.equal(await hash('city-common/city-waste-v2.js'),manifest.geometrySHA256);
 assert.equal(await hash('tools/generate-city-recycling-v2.html'),manifest.scannerSHA256);
 assert.equal(await hash('workshop/ml/models/image_embedder/mobilenet_v3_small.tflite'),manifest.modelSHA256);
 for(const label of data.labels){assert.equal(data.photos.filter(r=>r.label===label&&r.split==='train').length,5);assert.equal(data.photos.filter(r=>r.label===label&&r.split==='test').length,3);}
 const ids=new Set(old.photos.map(r=>r.id));
 for(const row of data.photos){assert.ok(!ids.has(row.id));ids.add(row.id);assert.equal(row.vector.length,1024);assert.ok(row.vector.every(Number.isFinite));assert.ok(Math.hypot(...row.vector)>.9);assert.equal(await hash('workshop/'+row.src),manifest.images[row.id]);Library.register(row.id,row.vector);assert.ok(Library.refVector({dataset:data.id,id:row.id}));}
 assert.equal(new Set(data.photos.map(r=>manifest.images[r.id])).size,32);
 assert.equal(Library.rows('city-recycling-v1').length,24);
});
test('practice identity survives recovery independently of classifier identity',()=>{
 assert.equal(resolveExercise(null,null,null),'materials-v2');assert.equal(resolveExercise(null,'batch-1',null),'batch-1');assert.equal(resolveExercise('materials-v2','batch-1',null),'materials-v2');assert.equal(resultDataset({scenario:'batch-1'}),'city-recycling-v1');
 const rows=data.photos.filter(r=>r.split==='test'),trial=new ActivityTrial('recycling',null,'materials-v2',rows);trial.run();for(let i=0;i<400;i++)trial.update(.1);
 assert.equal(trial.results.length,12);assert.equal(trial.summary().datasetVersion,data.id);assert.ok(trial.results.every(r=>r.bin==='human-check'));
 const p=createProject('Materials');p.projects.activityExercises={recycling:'materials-v2'};p.projects.cityActivities={recycling:trial.summary()};
 const restored=importProjectEnvelope(exportProjectEnvelope(p).archive);assert.equal(restored.ok,true);assert.deepEqual(restored.project.projects.activityExercises,p.projects.activityExercises);assert.deepEqual(restored.project.projects.cityActivities,p.projects.cityActivities);
});
test('mixed school footprint includes ten metres per side and never forces crowded placement',()=>{
 assert.equal(SCHOOL_PREVIEW.kind,'mixed');assert.ok(SCHOOL_PREVIEW.track.light);assert.equal(SCHOOL_PREVIEW.actors.length,1);assert.ok(Math.abs(SCHOOL_BOUNDS.w-73)<1);assert.ok(Math.abs(SCHOOL_BOUNDS.d-112)<1);
 const sites=placeActivitySites({scale:500,focus:[250,250]});const school=sites.find(s=>s.kind==='driving');assert.deepEqual(school.footprint,[SCHOOL_BOUNDS.w,SCHOOL_BOUNDS.d]);
 const packed={scale:200,focus:[100,100],buildings:[{pos:[100,100],footprint:[200,200]}]};const before=JSON.stringify(packed);assert.equal(placeActivitySites(packed).length,0);assert.equal(JSON.stringify(packed),before);
});
test('a newly taught four-branch starter runs v2 and an unchanged v1 model accepts v2 features',async()=>{
 const runtime=require('../P5 Programme/buddy-kit/client/workshop/logic/recycling-machine.js'),game=require('../P5 Programme/buddy-kit/client/workshop/game.js');
 const {buildImageCapabilityV2}=await import('../P5 Programme/buddy-kit/client/city-common/capability-export.js');
 const {runConveyor}=await import('../P5 Programme/buddy-kit/client/city-common/recycling.js');
 const table=runtime.starter(),model=table.pieces.find(p=>p.id==='model');
 assert.equal(table.pieces.filter(p=>p.type==='filter').length,4);assert.equal(table.pieces.filter(p=>p.cityDestination).length,5);
 model.learning={cam:{brain:{shelves:{},nextId:1}}};for(const row of data.photos.filter(r=>r.split==='train'))(model.learning.cam.brain.shelves[row.label]||=[]).push({id:'library:'+row.id,vec:game.unitVec(row.vector)});
 const draft={sourceMachineId:'v2-test',name:'Four materials',seed:1,table};assert.equal(runtime.validate(draft).ok,true);
 const rows=data.photos.filter(r=>r.split==='test'),results=await runtime.run(runtime.snapshot(draft),rows);
 assert.equal(results.length,12);for(const label of data.labels)assert.ok(results.some(r=>r.bin==='bin-'+label),label);
 const cap=buildImageCapabilityV2({id:'unchanged-old',name:'Earlier model',labels:old.labels,preprocessing:Library.PHOTO_FEATURES,dimension:1024,k:3,threshold:.2,examples:old.photos.filter(r=>r.split==='train').map(r=>({label:r.label,vector:r.vector}))}).capability;
 const before=JSON.stringify(cap);assert.equal(runConveyor(cap,rows).length,12);assert.equal(JSON.stringify(cap),before);
});
