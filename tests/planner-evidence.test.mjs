import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAYORS, defaultGoals, mayorGoals, readGoals, serializeGoals, effectiveGoalWeights, goalToSlider, sliderToGoal } from '../P5 Programme/buddy-kit/client/city-common/planner-goals.js';
import { computeMetrics, normalizeWeights, defaultMetricWeights, metricReceipt, METRIC_KEYS } from '../P5 Programme/buddy-kit/client/city-common/metrics.js';
import { computeWalkReach, homeReachRoutes } from '../P5 Programme/buddy-kit/client/city-common/walkability.js';
import { optimizeLayout, preservesExistingWork, proposeMoves, applyMove } from '../P5 Programme/buddy-kit/client/city-common/optimize.js';
import { specialKeys } from '../P5 Programme/buddy-kit/client/city-common/catalog.js';

const layout = {version:2, scaleMeters:2000, roads:[{points:[[100,1000],[1900,1000]],width:14,class:'primary'}], parks:[], buildings:[{type:'housing',pos:[400,1000],footprint:[20,20],height:24}]};

test('goal UI units and default/custom/all mayor modes survive serialization', () => {
  const modes = [defaultGoals(), ...Object.keys(MAYORS).map(mayorGoals), {...defaultGoals(),mode:'custom',values:{happy:1,walkable:.33,peaceful:0,spread:.47}}];
  for (const goals of modes) {
    assert.deepEqual(readGoals(serializeGoals(goals)), goals);
    for (const value of Object.values(goals.values)) assert.equal(sliderToGoal(goalToSlider(value)), value);
  }
  assert.deepEqual(Object.values(defaultGoals().values).map(goalToSlider),[30,30,20,20]);
  assert.equal(effectiveGoalWeights(defaultGoals()),null);
});

test('legacy metric-only weights retain their effective blend without inventing a mayor', () => {
  const weights = {accessibility:17,coverage:13,utilities:7,zoning:5,spread:3,balance:11,green:19,walkability:23};
  const goals = readGoals({label:'Green Mayor',weights});
  assert.equal(goals.mode,'legacy');
  assert.equal(goals.mayorId,null);
  assert.deepEqual(effectiveGoalWeights(goals), normalizeWeights(weights));
  const roundtrip = readGoals(serializeGoals(goals));
  for (const k of METRIC_KEYS) assert.ok(Math.abs(roundtrip.weights[k]-goals.weights[k])<1e-15);
  assert.deepEqual(readGoals({weights:{unknown:100}}),defaultGoals());
  assert.deepEqual(readGoals({version:1, mode:'custom',values:{happy:Infinity}}),defaultGoals());
  assert.deepEqual(normalizeWeights({coverage:1,unknown:100}),{coverage:1});
});

test('receipt includes all eight full precision contributions and retains the default zero blend', () => {
  const city = structuredClone(layout);
  city.parks.push({cx:400,cz:1100,radius:50});
  city.buildings.push({type:'school',pos:[650,1000],height:24});
  for (const weights of [null, {happy:33,walkable:33,peaceful:33,spread:1}, {green:1,walkability:2}, {happy:0,walkable:0,peaceful:0,spread:0}]) {
    const m = computeMetrics(city,undefined,weights,computeWalkReach(city));
    const receipt = metricReceipt(m,weights);
    assert.deepEqual(receipt.metrics.map((r)=>r.key),METRIC_KEYS);
    assert.equal(receipt.basis,'original-plan');
    assert.equal(Math.round(receipt.metrics.reduce((sum,r)=>sum+r.points,0)),m.score);
    assert.ok(receipt.metrics.every((r)=>Number.isFinite(r.points)));
    if (!weights) {
      for (const key of ['green','walkability']) assert.equal(receipt.metrics.find((r)=>r.key===key).points,0);
      assert.deepEqual(normalizeWeights(null),null);
      assert.equal(defaultMetricWeights().accessibility,.3);
    }
  }
  const empty = computeMetrics({...layout,buildings:[]},undefined,null,computeWalkReach({...layout,buildings:[]}));
  assert.ok(METRIC_KEYS.every((k)=>Number.isFinite(empty[k])));
  assert.equal(empty.score,0); // documented empty-plan exception
});

test('route statuses distinguish missing, disconnected, no access, over budget and no selection', () => {
  const city = structuredClone(layout);
  city.roads.push({points:[[100,1500],[1900,1500]],width:14,class:'primary'});
  city.buildings.push({type:'school',pos:[400,1500]}, {type:'shop',pos:[1800,1000]}, {type:'hospital',pos:[50,50]}, {type:'fire',pos:[500,1000]});
  const walk = computeWalkReach(city);
  const routes = homeReachRoutes(city,walk,0);
  const status = Object.fromEntries(routes.map((r)=>[r.type,r.status]));
  assert.equal(status.school,'disconnected');
  assert.equal(status.shop,'over-budget');
  assert.equal(status.hospital,'reachable'); // Existing model projects to the nearest road; it omits the approach distance.
  assert.ok(homeReachRoutes({...city,roads:[]},computeWalkReach({...city,roads:[]}),0).every((r)=>r.status==='no-road-access'));
  assert.equal(status.police,'absent-destination');
  assert.equal(status.fire,'reachable');
  for (const r of routes) {
    if (r.status==='reachable'||r.status==='over-budget') {
      const length=r.path.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-r.path[i].x,p.z-r.path[i].z),0);
      assert.ok(Math.abs(length-r.dist)<=.5);
    } else assert.deepEqual(r.path,[]);
  }
  assert.equal(homeReachRoutes(city,walk,-1)[0].status,'no-selected-home');
});

for (const strategy of ['greedy','explore']) test(`${strategy} preserves all 18 types, identical duplicates, fields and locks under current weighted walking objective`, () => {
  const city=structuredClone(layout);
  // Keep the ONE unprotected building off the road so this test exercises the
  // objective/lock guarantees only — the mandatory on-road fix is covered by
  // tests/optimizer.test.mjs.
  city.buildings[0].pos=[200,975];
  assert.equal(specialKeys().length,18);
  for (const [i,type] of specialKeys().entries()) {
    const b={type,pos:[300+i*60,1000],footprint:[17+i,23+i],height:30+i,locked:i%2===0};
    city.buildings.push(b,structuredClone(b));
  }
  city.buildings.push({type:'school',pos:[400,1000],footprint:[24,24],height:24,locked:true});
  const raw=JSON.stringify(city);
  for (const weights of [null, ...Object.keys(MAYORS).map((id)=>MAYORS[id].values), {walkability:1,green:3,zoning:2}]) {
    const a=optimizeLayout(city,{strategy,weights},73);
    const b=optimizeLayout(city,{strategy,weights},73);
    assert.equal(JSON.stringify(city),raw);
    assert.deepEqual(a,b);
    assert.ok(preservesExistingWork(city,a.layout));
    assert.deepEqual(a.layout.roads,city.roads);
    assert.equal(a.after.score,computeMetrics(a.layout,undefined,weights,computeWalkReach(a.layout)).score);
    assert.ok(a.after.score>=computeMetrics(city,undefined,weights,computeWalkReach(city)).score);
    assert.ok(a.diff.every((d)=>!specialKeys().includes(d.what)||d.action==='add'));
    for (const move of proposeMoves(city,{weights},12,73)) assert.ok(preservesExistingWork(city,applyMove(city,move)));
  }
  const victim=city.buildings[1];
  for (const action of ['move','remove']) assert.deepEqual(applyMove(city,{action,what:victim.type,from:victim.pos,to:[50,50]}),city);
});

test('a generic unlocked duplicate can be proposed without targeting the locked copy at the same position', () => {
  const city=structuredClone(layout);
  city.buildings.push({type:'school',pos:[1800,100],height:24,locked:true},{type:'school',pos:[1800,100],height:24,locked:false});
  const moved=applyMove(city,{action:'move',what:'school',from:[1800,100],to:[600,1000]});
  assert.deepEqual(moved.buildings[1],city.buildings[1]);
  assert.deepEqual(moved.buildings[2].pos,[600,1000]);
  for (const move of proposeMoves(city,{},20,31)) {
    const after=applyMove(city,move);
    assert.ok(preservesExistingWork(city,after));
    assert.equal(computeMetrics(after,undefined,null,computeWalkReach(after)).score,move.afterScore);
  }
});
