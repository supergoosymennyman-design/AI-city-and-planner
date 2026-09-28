import test from 'node:test';
import assert from 'node:assert/strict';
import { findDrivingRoutes, footprintFitsRoad } from '../P5 Programme/buddy-kit/client/city-common/driving-routes.js';
import { createTrafficFlow, initialLoopPlacements } from '../P5 Programme/buddy-kit/client/city-common/traffic-network.js';
import { publishDrivingRevision, installedDrivingPair, recordDrivingAttempt } from '../P5 Programme/buddy-kit/client/city-common/driving-project.js';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url),game=require('../P5 Programme/buddy-kit/client/workshop/game.js');
const road=(points,width=12)=>({points,width});

test('open roads, dead ends and crossings offer bounded left-lane routes without changing layouts',()=>{
  for(const roads of [[road([[0,0],[0,100]])],[road([[0,0],[0,70]]),road([[-50,40],[50,40]])],[road([[0,0],[0,30]]),road([[0,30],[0,80]])]]){
    const before=structuredClone(roads),result=findDrivingRoutes(roads);
    assert.ok(result.routes.length>0);assert.ok(result.routes.length<=3);
    for(const route of result.routes){assert.ok(route.track.length>=40&&route.track.length<=200.1);assert.deepEqual(route.encounters,['lane','finish']);}
    assert.deepEqual(roads,before);
  }
  const forward=findDrivingRoutes([road([[0,0],[0,100]])]).routes[0];
  assert.ok(forward.track.points[0].x<0,'northbound uses the west/left lane');
  assert.ok(findDrivingRoutes([road([[0,0],[0,900]])]).routes.every(r=>r.track.length<=200.1));
});

test('short/disconnected, narrow, obstructed, roundabout and malformed layouts explain rejection',()=>{
  const cases=[
    [[road([[0,0],[0,20]]),road([[100,0],[100,20]])],{},'insufficient-length'],
    [[road([[0,0],[0,100]],3)],{},'narrow-clearance'],
    [[road([[0,0],[0,100]])],{solids:[{minX:-10,maxX:10,minZ:20,maxZ:80}]},'obstructed'],
    [[road([[0,0],[50,0],[50,50],[0,50],[0,0]])],{},'unsupported-turn'],
    [[road([[0,0],[NaN,100]])],{},'malformed-roads'],
  ];
  for(const [roads,opts,reason] of cases){const before=structuredClone(roads),result=findDrivingRoutes(roads,opts);assert.equal(result.routes.length,0,reason);assert.ok(result.reasons.includes(reason),JSON.stringify(result));assert.deepEqual(roads,before);}
});

test('curved roads and a footprint-valid corner are admitted',()=>{
  const points=Array.from({length:41},(_,i)=>[30*Math.cos(i*Math.PI/80),30*Math.sin(i*Math.PI/80)]);
  assert.ok(findDrivingRoutes([road(points,10)]).routes.length);
  assert.ok(findDrivingRoutes([road([[0,0],[0,35],[35,35]],12)]).routes.length);
});

test('road admission checks the entire footprint, including gaps between paved corners',()=>{
  const network={segments:[-2.5,2.5].map(z=>({a:{x:-2,z},b:{x:2,z},width:1}))};
  assert.equal(footprintFitsRoad({x:0,z:0,heading:0},network),false);
  assert.equal(footprintFitsRoad({x:0,z:0,heading:0},{segments:[{a:{x:0,z:-20},b:{x:0,z:20},width:4}]}),true);
});

test('traffic reservation suspends local vehicles, lets distant traffic run, and releases idempotently',()=>{
  const roads=[road([[0,0],[100,0],[100,100],[0,100],[0,0]]),road([[300,0],[400,0],[400,100],[300,100],[300,0]])];
  const flow=createTrafficFlow(roads);
  for(const p of initialLoopPlacements(flow.routePlan,8))flow.addVehicle({...p,length:5,width:2,speed:6});
  const local=flow.vehicles.find(v=>v.x<150),distant=flow.vehicles.find(v=>v.x>200);
  assert.ok(local&&distant);
  const beforeLocal=[local.x,local.z],beforeDistant=[distant.x,distant.z];
  const release=flow.reserveTrialRegion((x,z,pad)=>x<150+pad);
  assert.throws(()=>flow.reserveTrialRegion(()=>true));
  for(let i=0;i<20;i++)flow.update(.05);
  assert.deepEqual([local.x,local.z],beforeLocal);assert.equal(local.trialSuspended,true);
  assert.notDeepEqual([distant.x,distant.z],beforeDistant);
  release();release();assert.equal(local.trialSuspended,undefined);
  for(let i=0;i<20;i++)flow.update(.05);
  assert.notDeepEqual([local.x,local.z],beforeLocal);
});

test('pair publication installs atomically, retains immutable revisions, and caps completed evidence',()=>{
  const project={projects:{}},models=game.publishDrivingPair(game.buildDrivingPairTable({train:true}));
  const a=publishDrivingRevision(project,'machine',models);
  assert.equal(a.revision,1);assert.equal(installedDrivingPair(project.projects.driving).ok,true);
  const duplicate=publishDrivingRevision(project,'machine',models);assert.equal(duplicate.key,a.key);
  const snapshot=JSON.stringify(project);
  assert.throws(()=>publishDrivingRevision(project,'machine',{steering:models.steering}));assert.equal(JSON.stringify(project),snapshot);
  const improved=structuredClone(models);improved.steering.threshold=.6;
  const b=publishDrivingRevision(project,'machine',improved);assert.equal(b.revision,2);
  assert.equal(project.projects.driving.bundles[a.key].models.steering.threshold,.5);
  for(let i=0;i<5;i++)recordDrivingAttempt(project,{machineId:'machine',revision:1,outcome:'arrived',records:[],seed:i});
  assert.deepEqual(project.projects.driving.attempts.map(a=>a.seed),[2,3,4]);
  assert.equal(installedDrivingPair(JSON.parse(JSON.stringify(project)).projects.driving).ok,true,'project backup JSON keeps the complete pair');
});
