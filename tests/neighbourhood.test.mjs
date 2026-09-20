import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createNeighbourhood,createStreetLife,SpatialIndex} from '../P5 Programme/buddy-kit/client/city-common/neighbourhood.js';
const layout={roads:[{width:8,points:[[0,0],[180,0]]}],buildings:[{type:'shop',pos:[40,24],footprint:[10,10]}],parks:[]};
const crossing={a:{x:80,z:4.95},b:{x:80,z:-4.95},road:0};
test('derived neighbourhood is deterministic and never modifies student layout',()=>{
 const before=JSON.stringify(layout);const a=createNeighbourhood(layout,{mobile:true,crossings:[crossing]}),b=createNeighbourhood(layout,{mobile:true,crossings:[crossing]});
 assert.deepEqual(a.spaces,b.spaces);assert.deepEqual(a.nodes.map(n=>[n.x,n.z]),b.nodes.map(n=>[n.x,n.z]));assert.equal(JSON.stringify(layout),before);
 assert.ok(a.spaces.length>0);assert.ok(a.spaces.length<=6);
 for(const e of a.edges)assert.ok(a.clear(a.nodes[e.a],a.nodes[e.b],.45,e.crossing?.road??-1));
});
test('paths cross only at supplied visible crossings',()=>{
 const without=createNeighbourhood(layout),withCrossing=createNeighbourhood(layout,{crossings:[crossing]});
 assert.equal(without.crossings.length,0);assert.equal(withCrossing.crossings.length,1);
 const plus=withCrossing.nodes.find(n=>n.z>0),minus=withCrossing.nodes.find(n=>n.z<0);
 assert.ok(withCrossing.route(plus.id,minus.id).length>0);
 const p=without.nodes.find(n=>n.z>0),m=without.nodes.find(n=>n.z<0);assert.deepEqual(without.route(p.id,m.id),[]);
});
test('full segments cannot cut through buildings even when endpoints are clear',()=>{
 const env=createNeighbourhood({roads:[],buildings:[{type:'housing',pos:[5,0],footprint:[2,2]}]});
 assert.equal(env.clear({x:0,z:0}),true);assert.equal(env.clear({x:10,z:0}),true);assert.equal(env.clear({x:0,z:0},{x:10,z:0}),false);
});
test('student prop footprints remove conflicting public spaces',()=>{
 const first=createNeighbourhood(layout,{mobile:true});const space=first.spaces[0];
 const next=createNeighbourhood(layout,{mobile:true,obstacles:[{x0:space.x-2,x1:space.x+2,z0:space.z-2,z1:space.z+2}]});
 assert.ok(next.spaces.every(s=>Math.hypot(s.x-space.x,s.z-space.z)>s.radius+2));
});
test('empty and blocked layouts have no forced decorations or actors',()=>{
 for(const data of [{roads:[],buildings:[]},{...layout,buildings:[{pos:[90,0],footprint:[240,100]}]}]){
  const env=createNeighbourhood(data);assert.equal(env.spaces.length,0);assert.equal(createStreetLife(env).actors.length,0);
 }
});
test('crowd fixed steps are repeatable, capped, and maintain finite safe positions',()=>{
 const a=createStreetLife(createNeighbourhood(layout),{mobile:true}),b=createStreetLife(createNeighbourhood(layout),{mobile:true});
 for(let i=0;i<600;i++)a.update(.05);for(let i=0;i<300;i++)b.update(.1);
 assert.deepEqual(a.actors,b.actors);assert.ok(a.actors.length<=72);
 for(const actor of a.actors){assert.ok(Number.isFinite(actor.heading));assert.ok(a.environment.clear(actor));}
});
test('crossing reservations hold approaching traffic, not vehicles moving away',()=>{
 const life=createStreetLife(createNeighbourhood(layout,{crossings:[crossing]}));const c=life.environment.crossings[0].crossing;c.users.add(7);
 assert.equal(life.shouldYield(75,0,1,0,8),true);assert.equal(life.shouldYield(85,0,1,0,8),false);
 life.destroy();assert.equal(c.users.size,0);
});
test('reduced motion leaves people and robots stationary',()=>{
 const life=createStreetLife(createNeighbourhood(layout),{reducedMotion:true});const before=life.actors.map(a=>[a.x,a.z]);for(let i=0;i<100;i++)life.update(.1);assert.deepEqual(life.actors.map(a=>[a.x,a.z]),before);
});
test('a fresh street life starts a deterministic set of human walkers immediately',()=>{
 const life=createStreetLife(createNeighbourhood(layout));const humans=life.actors.filter(a=>a.kind==='human');
 assert.ok(humans.length>0);assert.ok(humans.slice(0,Math.min(4,humans.length)).every(a=>a.wait===0));
 for(let i=0;i<5;i++)life.update(.1);
 assert.ok(humans.some(a=>a.state==='walk'));
});
test('spatial index finds long footprints spanning many cells',()=>{
 const index=new SpatialIndex(10),box={name:'long building'};index.insert(box,0,0,200,5);assert.ok(index.query(199,2).has(box));assert.equal(index.query(220,2).size,0);
});
test('pedestrian waits for a vehicle, then reserves and clears a crossing',()=>{
 const env=createNeighbourhood(layout,{crossings:[crossing]}),life=createStreetLife(env);
 const edge=env.crossings[0],start=env.nodes[edge.a];
 life.actors.length=0;
 const actor={id:999,kind:'robot',type:0,x:start.x,z:start.z,px:start.x,pz:start.z,node:edge.a,target:edge.b,path:[edge.b],heading:0,speed:2,wait:0,state:'idle',crossing:null};life.actors.push(actor);
 life.setVehicles([{x:80,z:0,speed:8}]);life.update(.1);assert.equal(actor.state,'waiting');assert.equal(edge.crossing.users.size,0);
 life.setVehicles([]);life.update(.1);assert.ok(edge.crossing.users.has(999));assert.equal(actor.state,'walk');
 for(let i=0;i<60;i++)life.update(.1);assert.equal(edge.crossing.users.size,0);
});
test('extreme imported bounds cannot create unbounded spatial-index loops',()=>{
 const grid=new SpatialIndex();const giant={x0:-1e100,x1:1e100,z0:0,z1:20};grid.insert(giant,giant.x0,0,giant.x1,20);assert.ok(grid.query(4,4).has(giant));
});
