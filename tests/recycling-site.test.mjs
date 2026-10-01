import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolveRecyclingSite,overlaps,findSafeArrival} from '../P5 Programme/buddy-kit/client/city-common/recycling-site.js';
import {createDestinationRegistry} from '../P5 Programme/buddy-kit/client/city-builder/places.js';
const lab=(x,z)=>({type:'recycling',pos:[x,z],footprint:[24,20]});
test('existing Lab frontage, immutable layout, deterministic multiple Lab selection',()=>{
 const a=lab(100,100),b=lab(200,200),options={scale:500,focus:[100,100],buildings:[b,a]};const before=JSON.stringify(options);
 const site=resolveRecyclingSite(options);assert.equal(site.lab,a);assert.equal(site.generated,false);assert.equal(site.z,81);assert.equal(JSON.stringify(options),before);assert.deepEqual(site,resolveRecyclingSite(options));
 assert.ok(!site.solids.some(r=>overlaps(r,{...site.arrival,w:1,d:1})));
});
test('blocked frontage tries lateral positions, then next Lab; no duplicate blocked Lab',()=>{
 const a=lab(100,100),b=lab(300,300),road={points:[[60,80],[160,80]],width:12};
 assert.equal(resolveRecyclingSite({scale:500,buildings:[a],roads:[road]}),null);
 assert.equal(resolveRecyclingSite({scale:500,focus:[100,100],buildings:[a,b],roads:[road]}).lab,b);
 const shifted=resolveRecyclingSite({scale:500,focus:[100,100],buildings:[a],props:[{pos:[84,81],footprint:[2,2]}]});assert.ok(shifted.x>100);
});
test('missing Lab reserves complete runtime site outside roads/props/boundaries',()=>{
 const options={scale:200,focus:[100,100],roads:[{points:[[0,100],[200,100]],width:12}],props:[{pos:[100,140],footprint:[30,30]}]};
 const site=resolveRecyclingSite(options);assert.ok(site.generated);assert.deepEqual(site,resolveRecyclingSite(options));assert.equal(options.buildings,undefined);
 assert.ok(site.solids.every(r=>!overlaps(r,{x:100,z:100,w:2,d:2},1)));
 for(const r of site.reservations)assert.ok(!overlaps(r,{x:100,z:140,w:30,d:30},2));
 assert.equal(resolveRecyclingSite({scale:20,focus:[10,10]}),null);
});
test('arrival revalidation searches nearby and fails without a point when blocked',()=>{
 assert.deepEqual(findSafeArrival({x:10,z:10},()=>true),{x:10,z:10});assert.ok(findSafeArrival({x:10,z:10},p=>p.x>13).x>13);assert.equal(findSafeArrival({x:10,z:10},()=>false),null);
});
test('registry supports six bilingual destinations and only nearest eligible within 12m',()=>{
 const r=createDestinationRegistry();for(let i=0;i<6;i++)r.register({id:String(i),labels:{en:'Place '+i,zh:'地點'+i},available:i!==0,arrival:{x:i*5,z:0},enter(){}});
 assert.equal(r.all().length,6);assert.equal(r.nearest({x:1,z:0}).id,'1');assert.equal(r.nearest({x:100,z:100}),null);r.clear();assert.equal(r.all().length,0);
});

test('shared equipment bounds rotate with centred, offset and practice sites',async()=>{
 const {RECYCLING_LAYOUT:L,recyclingEquipmentSolids,worldEquipmentRect}=await import('../P5 Programme/buddy-kit/client/city-common/recycling-layout.js');
 const {practiceRecyclingSite}=await import('../P5 Programme/buddy-kit/client/city-common/recycling-site.js');
 const sites=[resolveRecyclingSite({scale:500,buildings:[lab(100,100)]}),resolveRecyclingSite({scale:500,buildings:[lab(100,100)],props:[{pos:[84,81],footprint:[2,2]}]}),practiceRecyclingSite(500),{x:30,z:40,yaw:Math.PI/3}];
 for(const site of sites){const solids=recyclingEquipmentSolids(site);assert.equal(solids.length,14);for(const r of solids)assert.ok(Number.isFinite(r.x+r.z+r.w+r.d));if(site.arrival)assert.ok(!solids.some(r=>overlaps(r,{...site.arrival,w:1,d:1})));}
 const quarter=worldEquipmentRect(L.main,{x:100,z:200,yaw:Math.PI/2});assert.equal(quarter.x,99);assert.equal(quarter.z,200.8);assert.ok(Math.abs(quarter.w-L.main.d)<1e-9);assert.equal(quarter.d,L.main.w);
 assert.ok(Math.abs(L.truck.rearX+L.truck.gap-(L.hopper.x-L.hopper.w/2))<1e-9);
 for(const r of [L.hopper,L.main,L.scanner,L.transfer,L.distribution,...L.bins,L.truck,L.sign]){assert.ok(Math.abs(r.x)+r.w/2<=14);assert.ok(Math.abs(r.z)+r.d/2<=9);}
});

test('all seven routes remain supported until the drop and end at the collected slot',async()=>{
 const {RECYCLING_LAYOUT:L,recyclingItemPosition:position,collectedPosition,queuePosition}=await import('../P5 Programme/buddy-kit/client/city-common/recycling-layout.js');
 const supports=[L.hopper,L.main,L.transfer,L.distribution,...L.bins.map(b=>({x:b.x,z:3.05,w:2.12,d:1.6}))];
 for(let bin=0;bin<7;bin++)for(let n=0;n<12;n++){
  assert.deepEqual(position(0,bin,n),queuePosition(0));assert.deepEqual(position(12,bin,n),{x:-1,y:L.deck,z:-1});assert.deepEqual(position(30,bin,n),collectedPosition(bin,n));
  for(let phase=0;phase<=28;phase+=.1){const p=position(phase,bin,n);assert.ok(supports.some(r=>Math.abs(p.x-r.x)<=r.w/2+.001&&Math.abs(p.z-r.z)<=r.d/2+.001),`unsupported bin ${bin} phase ${phase}`);}
 }
});

test('hopper exit never crosses a waiting object and pickup is refilled only after clearance',async()=>{
 const {RECYCLING_LAYOUT:L,recyclingItemPosition:position,queuePosition}=await import('../P5 Programme/buddy-kit/client/city-common/recycling-layout.js');
 for(let phase=0;phase<12;phase+=.05){const moving=position(phase);for(let slot=phase<4?1:0;slot<L.queueCapacity;slot++){
  const waiting=queuePosition(slot);assert.ok(Math.abs(moving.x-waiting.x)>=L.itemSize||Math.abs(moving.z-waiting.z)>=L.itemSize,`queue collision phase ${phase} slot ${slot}`);
 }}
});
