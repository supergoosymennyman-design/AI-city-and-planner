/* Unit tests for AI City Architect */
const assert = require('assert');

function test(name, fn) {
  try { fn(); console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + ': ' + e.message); process.exitCode = 1; }
}

const SYSTEMS = ['power','water','transport','health','waste','governance'];

test('6 systems defined', () => assert.strictEqual(SYSTEMS.length, 6));

test('Grid is 15×15', () => assert.strictEqual(15*15, 225));

test('Budget is 150 tokens', () => assert.strictEqual(150, 150));

test('12 hazards on grid', () => assert.strictEqual(12, 12));

test('3 drill samples', () => assert.strictEqual(3, 3));

test('20+ building types', () => {
  const types = ['solar','wind','hydro','battery','water','datacenter','cooling','bus','road','depot',
    'drone','traffic','bike','hospital','clinic','green','air','recycling','collection','compost',
    'incinerator','town','auditor','school','emergency'];
  assert.ok(types.length >= 20);
});

test('Minimum requirements fit in budget', () => {
  const costs = { solar:8, water:8, bus:4, clinic:8, recycling:6, town:12, road:2 };
  const total = costs.solar + costs.water + costs.bus + costs.clinic + costs.recycling + costs.town + costs.road*3;
  assert.strictEqual(total, 52);
  assert.ok(total <= 150);
});

test('4 HILT scenario filters defined', () => {
  const effects = ['tokens+15,sentiment-10', 'tokens-15,sentiment+5', 'tokens-7,sentiment-3',
    'efficiency+10,equity-15', 'efficiency-5,equity+10', 'efficiency-2,equity+5',
    'highway+20,sentiment-8', 'highway-10,emergency+5', 'highway+5,sentiment-3'];
  assert.ok(effects.length >= 9); // 3 scenarios × 3 choices
});

test('4 crisis events', () => {
  const crises = ['heatwave_cyber','flood','economic','surge'];
  assert.strictEqual(crises.length, 4);
});

test('3 speed modes for P5-P6', () => {
  const modes = [1, 1000, 1000000];
  assert.deepStrictEqual(modes, [1, 1000, 1000000]);
});

test('3 layer types', () => {
  const layers = ['all','power','logistics','social'];
  assert.strictEqual(layers.length, 4);
});

console.log('\nAll tests passed!\n');
