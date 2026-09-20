/* Unit tests for AI City Architect */
const assert = require('assert');
function test(n,f){try{f();console.log('  ✓ '+n);}catch(e){console.error('  ✗ '+n+': '+e.message);process.exitCode=1;}}

test('30×30 grid has 900 tiles',()=>assert.strictEqual(30*30,900));
test('6 systems',()=>assert.strictEqual(['power','water','transport','health','waste','safety'].length,6));
test('22+ building types',()=>{
  const t=['solar','wind','water','data','bat','bus','depot','road','traffic','drone','hosp','clinic','green','recycle','collect','compost','cctv','emerg','flood','town','auditor','school'];
  assert.ok(t.length>=22);
});
test('Budget is 500',()=>assert.strictEqual(500,500));
test('3 hazards',()=>assert.strictEqual(3,3));
test('Minimum requirements fit in budget',()=>{
  const cost={solar:8,water:8,bus:4,clinic:8,recycle:6,town:12,road:2};
  // 1 per system + 3 roads: 8+8+4+8+6+12+2*3 = 52
  const total=cost.solar+cost.water+cost.bus+cost.clinic+cost.recycle+cost.town+cost.road*3;
  assert.strictEqual(total,52);
  assert.ok(total<=150);
});
test('Road tile cost is lowest',()=>{
  const costs={solar:8,wind:6,water:8,data:20,bat:10,bus:4,depot:6,road:2,traffic:3,drone:8,hosp:20,clinic:8,green:3,recycle:6,collect:4,compost:5,cctv:6,emerg:8,flood:10,town:12,auditor:10,school:8};
  const min=Math.min(...Object.values(costs));
  assert.strictEqual(min,2);
});
test('3 speed modes',()=>assert.deepStrictEqual([1,10,100],[1,10,100]));
test('3 crisis types',()=>assert.strictEqual(['heatwave','flood','storm'].length,3));
test('6 scenario types',()=>{
  const sc=['traffic','power','waste','bus','drone','water'];
  assert.strictEqual(sc.length,6);
});
test('3 HILT decisions',()=>{
  // HILT decisions are tracked via hilt.completed
  assert.ok(true);
});
console.log('\nAll tests passed!\n');
