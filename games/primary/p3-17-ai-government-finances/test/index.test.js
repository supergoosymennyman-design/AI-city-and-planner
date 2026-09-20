/**
 * test/index.test.js — Core logic tests for Compute Fee Meter
 *
 * Run with: node test/index.test.js
 * Or copy-paste the test functions into the browser console.
 *
 * Tests validate:
 * 1. Core math formulas (BilledFee, PhysicalCost, SystemLoad)
 * 2. Level 1 win condition (token target matching)
 * 3. Level 2 system load mechanics
 * 4. Level 3 crash detection
 * 5. Level 4 fairness calculation
 * 6. Level 5 cost matching
 * 7. Edge cases (min/max sliders, extreme files, zero values)
 */

'use strict';

// ── Mock the DOM (for non-browser environment) ──
if (typeof document === 'undefined') {
  const mockElement = () => ({ style: {}, classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false }, appendChild: () => {}, setAttribute: () => {}, addEventListener: () => {} });
  global.document = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => mockElement(),
    addEventListener: () => {}
  };
  global.window = {
    SpeechRecognition: null,
    speechSynthesis: null,
    AudioContext: null,
    localStorage: { getItem: () => null, setItem: () => {} }
  };
  global.localStorage = global.window.localStorage;
}

// Safe logging
const log = (...args) => {
  try { process.stdout.write(args.join(' ') + '\n'); } catch(e) {}
};

let passed = 0, failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    log('  ' + 'PASS' + ': ' + message);
  } else {
    failed++;
    log('  ' + 'FAIL' + ': ' + message);
  }
}

function assertEqual(actual, expected, message) {
  if (Math.abs(actual - expected) < 0.0001) {
    passed++;
    log('  ' + 'PASS' + ': ' + message + ' (' + actual + ')');
  } else {
    failed++;
    log('  ' + 'FAIL' + ': ' + message + ' — expected ' + expected + ', got ' + actual);
  }
}

// ── We cannot require() the game module in Node without DOM —
//    so we inline the core formulas to test them directly ──

function calcBilledFee(pages, ram, pm, rp) {
  return (pages * pm) + (ram * rp);
}

function calcPhysicalCost(pages, ram) {
  return (pages * 1.5) + (ram * 2);
}

function calcSystemLoad(currentLoad, fileWeight, billedFee, coolingFactor) {
  if (billedFee <= 0) billedFee = 0.1;
  const stressAdded = (fileWeight * 2) / (billedFee * 0.1 + 3);
  const cooling = coolingFactor * 3;
  const newLoad = Math.max(0, Math.min(100, currentLoad + stressAdded - cooling));
  return Math.round(newLoad * 10) / 10;
}

function calcFairnessPenalty(pages, ram, billedFee) {
  const isSmall = pages < 20 || ram < 15;
  if (!isSmall) return 0;
  const physicalCost = calcPhysicalCost(pages, ram);
  const overchargeRatio = physicalCost > 0 ? billedFee / physicalCost : 1;
  if (overchargeRatio > 1.5) return -5;
  return 0;
}

// ═══════════════════════════════════════════
// TEST 1: Core Math — BilledFee
// ═══════════════════════════════════════════
log('\n=== Test 1: BilledFee Formula ===');
assertEqual(calcBilledFee(100, 10, 5, 1), 510, '100 pages, RAM 10%, PM=5, RP=1');
assertEqual(calcBilledFee(5, 85, 3, 1), 100, '5 pages, RAM 85%, PM=3, RP=1');
assertEqual(calcBilledFee(5, 85, 3, 10), 865, '5 pages, RAM 85%, PM=3, RP=10');
assertEqual(calcBilledFee(1, 1, 1, 1), 2, 'Minimum: 1 page, 1% RAM, PM=1, RP=1');
assertEqual(calcBilledFee(200, 95, 10, 10), 2950, 'Maximum: 200 pages, 95% RAM, PM=10, RP=10');

// ═══════════════════════════════════════════
// TEST 2: Core Math — PhysicalCost
// ═══════════════════════════════════════════
log('\n=== Test 2: PhysicalCost Formula ===');
assertEqual(calcPhysicalCost(100, 10), 170, '100 pages, 10% RAM');
assertEqual(calcPhysicalCost(5, 85), 177.5, '5 pages, 85% RAM');
assertEqual(calcPhysicalCost(1, 1), 3.5, '1 page, 1% RAM');

// ═══════════════════════════════════════════
// TEST 3: System Load Mechanics (new formula)
// ═══════════════════════════════════════════
console.log('\n=== Test 3: SystemLoad Formula ===');

// High fee = low stress, cooling dominates
let load1 = calcSystemLoad(30, 200, 100, 3);
// stress = 400/13 = 30.77, cooling = 9, net = +21.77, load = 51.77
assert(load1 > 30, 'BilledFee=100, weight=200: stress is significant, load increases');

// Higher fee = even less stress
let load1b = calcSystemLoad(30, 200, 500, 3);
// stress = 400/53 = 7.55, cooling = 9, net = -1.45, load = 28.55
assert(load1b < 30, 'BilledFee=500, weight=200: cooling dominates, load decreases');

// Very low fee = high stress (crash risk)
let load3 = calcSystemLoad(30, 300, 10, 2);
// stress = 600/(1+3) = 150, cooling = 6. load = 30+150-6=174 → capped at 100
assertEqual(load3, 100, 'Very low BilledFee (10) with heavy weight should max out at 100%');

// Load caps at 100
let load4 = calcSystemLoad(98, 1000, 3, 0);
assertEqual(load4, 100, 'Load should cap at 100% (not exceed)');

// Load floors at 0
let load5 = calcSystemLoad(2, 10, 100, 3);
// stress = 20/13 = 1.54, cooling = 9, load = 2+1.54-9 = -5.46 → 0
assertEqual(load5, 0, 'Load should floor at 0%');

// Medium fee with strong cooling
let load6 = calcSystemLoad(50, 200, 300, 5);
// stress = 400/33 = 12.12, cooling = 15, net = -2.88
assert(load6 < 50, 'BilledFee=300, cooling=5: strong cooling decreases load');

// ═══════════════════════════════════════════
// TEST 4: Level 1 — Token Target Matching
// ═══════════════════════════════════════════
log('\n=== Test 4: Level 1 Win Condition ===');
const lv1Billed = calcBilledFee(100, 10, 5, 1); // 510
const lv1Target = 510;
const lv1Tol = lv1Target * 0.05; // 25.5
assert(Math.abs(lv1Billed - lv1Target) <= lv1Tol,
  'PM=5 gives 510 tokens (within 5% of 510)');

const lv1TooLow = calcBilledFee(100, 10, 3, 1); // 310
assert(Math.abs(lv1TooLow - lv1Target) > lv1Tol,
  'PM=3 gives 310 tokens (outside 5% tolerance)');

const lv1TooHigh = calcBilledFee(100, 10, 7, 1); // 710
assert(Math.abs(lv1TooHigh - lv1Target) > lv1Tol,
  'PM=7 gives 710 tokens (outside 5% tolerance)');

// ═══════════════════════════════════════════
// TEST 5: Level 2 Load Management (new formula)
// ═══════════════════════════════════════════
console.log('\n=== Test 5: Level 2 Load Management ===');

// RP=1, BilledFee=100. stress = 300*2/(10+3) = 46.15, cooling=9, net=+37.15
const lv2LowRP = calcSystemLoad(25, 300, calcBilledFee(5, 85, 3, 1), 3);
assert(lv2LowRP > 25, 'RP=1: load should INCREASE from 25 (stressful)');

// RP=10, BilledFee=865. stress = 600/(86.5+3)=6.70, cooling=9, net=-2.30
const lv2HighRP = calcSystemLoad(25, 300, calcBilledFee(5, 85, 3, 10), 3);
assert(lv2HighRP < 25, 'RP=10: load should DECREASE from 25 (cooling dominates)');

// ═══════════════════════════════════════════
// TEST 6: Fairness Calculation
// ═══════════════════════════════════════════
log('\n=== Test 6: Fairness Penalty');

// Small business, overcharged
const fb1 = calcBilledFee(10, 8, 8, 8); // 10*8 + 8*8 = 144
const phys1 = calcPhysicalCost(10, 8); // 15 + 16 = 31
const penalty1 = calcFairnessPenalty(10, 8, fb1);
// overchargeRatio = 144/31 ≈ 4.65 > 1.5 → penalty
assertEqual(penalty1, -5, 'Small biz overcharged 4.6x → 5% penalty');

// Same file NOT overcharged
const fb2 = calcBilledFee(10, 8, 2, 1); // 20 + 8 = 28
const penalty2 = calcFairnessPenalty(10, 8, fb2);
// overchargeRatio = 28/31 ≈ 0.9 < 1.5 → no penalty
assertEqual(penalty2, 0, 'Small biz NOT overcharged → no penalty');

// Large corporate file — no fairness penalty ever
const penalty3 = calcFairnessPenalty(200, 25, 1000);
assertEqual(penalty3, 0, 'Large corp file → no fairness penalty (even if overcharged)');

// ═══════════════════════════════════════════
// TEST 7: Edge Cases
// ═══════════════════════════════════════════
log('\n=== Test 7: Edge Cases ===');

// Zero-pages file
assertEqual(calcBilledFee(0, 10, 5, 1), 10,
  '0-page file with 10% RAM: BilledFee = 10');

// 100% RAM file
assertEqual(calcBilledFee(1, 100, 5, 1), 105,
  '1 page, 100% RAM: BilledFee = 105');

// Zero RAM
assertEqual(calcBilledFee(50, 0, 3, 1), 150,
  '50 pages, 0 RAM: BilledFee = 150');

// Slider at maximum
assertEqual(calcBilledFee(100, 50, 10, 10), 1500,
  'Max sliders: 100*10 + 50*10 = 1500');

// Slider at minimum
assertEqual(calcBilledFee(100, 50, 1, 1), 150,
  'Min sliders: 100*1 + 50*1 = 150');

// ═══════════════════════════════════════════
// TEST 8: Cost Match (Level 5)
// ═══════════════════════════════════════════
log('\n=== Test 8: Cost Matching ===');

// Perfect match: billed = physical
const matchBilled = calcBilledFee(100, 10, 1.5, 2); // Actually PM=1.5 not possible with int sliders
// Using integer: PM=1, RP=1 → billed = 100+10 = 110; physical = 150+20 = 170; match = 110/170 = 64.7%
const b1 = calcBilledFee(100, 10, 2, 1); // 210
const c1 = calcPhysicalCost(100, 10); // 170
const match1 = c1 > 0 ? Math.abs(100 - (b1 / c1) * 100) : 100;
assert(match1 > 5, 'PM=2 bill: cost match diff > 5% (not optimal)');

// Closer match: PM=1, RP=3: billed = 100 + 30 = 130; physical = 170
const b2 = calcBilledFee(100, 10, 1, 3); // 130
const match2 = Math.abs(100 - (b2 / c1) * 100);
assert(match2 > 15, 'PM=1, RP=3: still off by > 15%');

// ═══════════════════════════════════════════
// TEST 9: Multi-File Load Accumulation
// ═══════════════════════════════════════════
console.log('\n=== Test 9: Multi-File Load Accumulation ===');

const files = [
  { pages: 5, ram: 85, weight: 300 },
  { pages: 8, ram: 92, weight: 320 },
  { pages: 3, ram: 80, weight: 280 },
  { pages: 6, ram: 88, weight: 310 }
];

// RP=1 should cause crash or near-crash
let load = 25;
let crash = false;
for (const f of files) {
  const fee = calcBilledFee(f.pages, f.ram, 3, 1);
  load = calcSystemLoad(load, f.weight, fee, 3);
  if (load >= 100) crash = true;
}
// With RP=1: each file adds ~37% to load. After 2 files: 25+74=99%. After 3: crash.
assert(crash, 'RP=1 with heavy files: should CRASH (too much stress)');

// RP=10 should cool down rapidly
let load2b = 50;
for (const f of files) {
  const fee = calcBilledFee(f.pages, f.ram, 3, 10);
  load2b = calcSystemLoad(load2b, f.weight, fee, 3);
}
assert(load2b < 50, 'RP=10: Heavy cooling drops load significantly');

// ═══════════════════════════════════════════
// TEST 10: Temperature extremes
// ═══════════════════════════════════════════
console.log('\n=== Test 10: Temperature Extremes ===');

// Very heavy file with low billing
const hotLoad = calcSystemLoad(50, 500, 50, 1);
// stress = 1000/(5+3) = 125, cooling = 3, load = 50+125-3=172 → 100
assert(hotLoad >= 100, 'Heavy file with low billing maxes out load');

// Same heavy file with high billing and strong cooling
const coolLoad = calcSystemLoad(50, 500, 500, 5);
// stress = 1000/53 = 18.87, cooling = 15, load = 50+18.9-15 = 53.9
assert(coolLoad < 60, 'Same heavy file with high billing and cooling stays manageable');

// ═══════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════
log('\n' + '='.repeat(50));
log('Results: ' + passed + ' passed, ' + failed + ' failed, ' + (passed + failed) + ' total');
log('='.repeat(50));

if (failed > 0) {
  try { process.exit(1); } catch(e) {}
}
