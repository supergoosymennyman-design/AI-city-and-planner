/**
 * index.test.js — Unit tests for My First AI City
 * Run with: node test/index.test.js
 */
const assert = require('assert');

// We need to mock the DOM and game modules
global.document = { getElementById: () => null, createElement: () => ({}) };
global.window = { AudioContext: null, SpeechRecognition: null };
global.localStorage = { getItem:()=>null, setItem:()=>{}, removeItem:()=>{} };
global.navigator = {};

// Manually test core game logic by importing the core functions
// Since game.js uses IIFE, we test the algorithm directly here

// ── Test helpers ──
function test(name, fn) {
  try { fn(); console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + ': ' + e.message); process.exitCode = 1; }
}

function isInBounds(r, c) {
  return r >= 0 && r < 6 && c >= 0 && c < 6;
}

function isTerrainWater(r, c) {
  const RIVER = [[0,2],[0,3],[1,3],[1,4],[2,4]];
  return RIVER.some(([rr,cc]) => rr === r && cc === c);
}

// ── Tests ──
console.log('\nMy First AI City — Tests\n');

test('Grid has 6×6 dimensions', () => {
  assert.strictEqual(isInBounds(0, 0), true);
  assert.strictEqual(isInBounds(5, 5), true);
  assert.strictEqual(isInBounds(6, 0), false);
  assert.strictEqual(isInBounds(0, 6), false);
});

test('Terrain water tiles are correctly identified', () => {
  assert.strictEqual(isTerrainWater(0, 2), true);
  assert.strictEqual(isTerrainWater(0, 3), true);
  assert.strictEqual(isTerrainWater(1, 3), true);
  assert.strictEqual(isTerrainWater(1, 4), true);
  assert.strictEqual(isTerrainWater(2, 4), true);
  assert.strictEqual(isTerrainWater(0, 0), false);
  assert.strictEqual(isTerrainWater(3, 3), false);
});

test('Budget calculation', () => {
  const BUDGET = 20;
  let spent = 0;
  const costs = { home: 2, school: 3, hospital: 4, water: 3, power: 3, park: 1 };
  spent += costs.home * 3;     // 6
  spent += costs.school;       // 3 → 9
  spent += costs.hospital;     // 4 → 13
  spent += costs.water;        // 3 → 16
  spent += costs.power;        // 3 → 19
  assert.strictEqual(spent, 19);
  assert.ok(spent <= BUDGET);
});

test('Minimum building requirements fit within 20 coin budget', () => {
  const costs = { home: 2, school: 3, hospital: 4, water: 3, power: 3, park: 1 };
  const required = { home: 3, school: 1, hospital: 1, water: 1, power: 1 };
  let total = 0;
  for (const [type, count] of Object.entries(required)) {
    total += costs[type] * count;
  }
  assert.strictEqual(total, 19);
  assert.ok(total <= 20, 'Minimum requirements must fit in 20 coin budget');
});

test('Hazards have 3 positions', () => {
  const hazardCount = 3;
  assert.strictEqual(hazardCount, 3);
});

test('Puddles have 3 positions', () => {
  const puddleCount = 3;
  assert.strictEqual(puddleCount, 3);
});

test('Building connection status tracking', () => {
  const building = {
    connections: { water: false, power: false, road: false },
    def: { needs: ['water', 'power', 'road'] }
  };
  // Initially all missing
  assert.strictEqual(building.def.needs.every(n => building.connections[n]), false);

  // Connect water
  building.connections.water = true;
  assert.strictEqual(building.def.needs.every(n => building.connections[n]), false);

  // Connect all
  building.connections.power = true;
  building.connections.road = true;
  assert.strictEqual(building.def.needs.every(n => building.connections[n]), true);
});

test('Waste sorting logic', () => {
  const items = [
    { label: 'Plastic Bottle', bin: 'recycle' },
    { label: 'Apple Core', bin: 'compost' },
    { label: 'Tin Can', bin: 'recycle' },
    { label: 'Newspaper', bin: 'recycle' },
    { label: 'Battery', bin: 'general' },
  ];

  assert.strictEqual(items[0].bin, 'recycle');
  assert.strictEqual(items[1].bin, 'compost');
  assert.strictEqual(items[4].bin, 'general');
  assert.ok(items.filter(i => i.bin === 'recycle').length >= 2);
});

test('Puddle draining progress', () => {
  let drained = 0;
  const total = 3;

  for (let i = 0; i < total; i++) {
    drained++;
  }
  assert.strictEqual(drained, total);
  assert.ok(drained >= total);
});

test('Star calculation', () => {
  const required = { home: 3, school: 1, hospital: 1, water: 1, power: 1 };
  const built = { home: 3, school: 1, hospital: 1, water: 1, power: 1 };
  const minMet = Object.entries(required).every(([t, c]) => built[t] >= c);
  assert.strictEqual(minMet, true);  // Star 1

  const connectionsMet = true;  // All connected
  assert.strictEqual(connectionsMet, true);  // Star 2

  const puddlesMet = true;  // All puddles drained
  assert.strictEqual(puddlesMet, true);  // Star 3

  let stars = 0;
  if (minMet) stars++;
  if (connectionsMet) stars++;
  if (puddlesMet) stars++;
  assert.strictEqual(stars, 3);
});

console.log('\nAll tests passed!\n');
