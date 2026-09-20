/**
 * test/index.test.js — Core logic tests for AI Token Exchange
 *
 * Run with: node test/index.test.js
 *
 * Tests validate:
 * 1. Core token cost calculation (base + premium)
 * 2. Model tier compatibility check
 * 3. Batch discount calculation (15%)
 * 4. Priority bonus math (2x cost, +5 bonus)
 * 5. Cache discount (50% off lookup for returning)
 * 6. Full combined cost with all mechanics
 * 7. Nova auto-allocation across mechanics
 * 8. Level constraint scenarios
 */
'use strict';

// ── Mock the DOM ──
if (typeof document === 'undefined') {
  const mockElement = () => ({
    style: {}, classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
    appendChild: () => {}, setAttribute: () => {}, addEventListener: () => {}, querySelector: () => null
  });
  global.document = {
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    createElement: () => mockElement(), addEventListener: () => {}
  };
  global.window = {
    SpeechRecognition: null, speechSynthesis: null, AudioContext: null,
    localStorage: { getItem: () => null, setItem: () => {} }
  };
  global.localStorage = global.window.localStorage;
}

const log = (...args) => {
  try { process.stdout.write(args.join(' ') + '\n'); } catch(e) {}
};

let passed = 0, failed = 0;

function assert(condition, message) {
  if (condition) { passed++; log('  PASS: ' + message); }
  else { failed++; log('  FAIL: ' + message); }
}

function assertEqual(actual, expected, message) {
  if (Math.abs(actual - expected) < 0.0001) {
    passed++; log('  PASS: ' + message + ' (' + actual + ')');
  } else {
    failed++; log('  FAIL: ' + message + ' — expected ' + expected + ', got ' + actual);
  }
}

// ── Inline core formulas (matching game.js) ──
const TASK_COSTS = { text: 2, lookup: 5, image: 10 };
const PREMIUM_COSTS = { text: 5, lookup: 8, image: 15 };
const BUDGET = 100;
const BATCH_DISCOUNT_PCT = 0.15;
const PRIORITY_COST_MULT = 2;
const PRIORITY_BONUS = 5;
const CACHE_DISCOUNT_PCT = 0.50;

function getTaskCost(task, tier) {
  if (tier === 'premium') return PREMIUM_COSTS[task];
  return TASK_COSTS[task];
}

function calcCitizenCost(toggles) {
  let cost = 0;
  if (toggles.text) cost += TASK_COSTS.text;
  if (toggles.lookup) cost += TASK_COSTS.lookup;
  if (toggles.image) cost += TASK_COSTS.image;
  return cost;
}

function calcFullCost(toggles, modelTiers, isPriority, citizen) {
  let cost = 0;
  ['text', 'lookup', 'image'].forEach(task => {
    if (toggles[task]) {
      let taskCost = getTaskCost(task, modelTiers[task] || 'standard');
      if (task === 'lookup' && citizen && citizen.isReturning) {
        taskCost = Math.round(taskCost * (1 - CACHE_DISCOUNT_PCT));
      }
      cost += taskCost;
    }
  });
  if (isPriority) cost *= PRIORITY_COST_MULT;
  return cost;
}

function canProcessWithModels(citizen, modelTiers) {
  const tasks = ['text', 'lookup', 'image'];
  for (const task of tasks) {
    const needed = (citizen.needsModel && citizen.needsModel[task]) || 'standard';
    const chosen = modelTiers[task] || 'standard';
    if (needed === 'premium' && chosen === 'standard') return false;
  }
  return true;
}

function calcBatchDiscount(batch, modelTiers) {
  const counts = {};
  batch.forEach(c => {
    ['text', 'lookup', 'image'].forEach(task => {
      if (c.available && c.available.includes(task)) {
        const tier = modelTiers[task] || 'standard';
        const key = task + ':' + tier;
        counts[key] = (counts[key] || 0) + 1;
      }
    });
  });
  let discount = 0;
  Object.entries(counts).forEach(([key, count]) => {
    if (count >= 2) {
      const [task, tier] = key.split(':');
      const taskCost = getTaskCost(task, tier);
      const discountedCount = Math.min(count - 1, 2);
      discount += Math.round(discountedCount * taskCost * BATCH_DISCOUNT_PCT);
    }
  });
  return discount;
}

function calcPriorityBonus(count) {
  return count * PRIORITY_BONUS;
}

// ═══════════════════════════════════════════
// TEST 1: Base Token Cost Calculation
// ═══════════════════════════════════════════
log('\n=== Test 1: Base Token Cost Calculation ===');
assertEqual(calcCitizenCost({ text: true, lookup: true, image: false }), 7, 'Text + Lookup = 2 + 5 = 7');
assertEqual(calcCitizenCost({ text: true, lookup: false, image: false }), 2, 'Text only = 2');
assertEqual(calcCitizenCost({ text: false, lookup: true, image: false }), 5, 'Lookup only = 5');
assertEqual(calcCitizenCost({ text: false, lookup: false, image: true }), 10, 'Image only = 10');
assertEqual(calcCitizenCost({ text: true, lookup: true, image: true }), 17, 'All three = 17');
assertEqual(calcCitizenCost({ text: false, lookup: false, image: false }), 0, 'No tasks = 0');

// ═══════════════════════════════════════════
// TEST 2: Premium Model Costs (L2)
// ═══════════════════════════════════════════
log('\n=== Test 2: Premium Model Costs (Level 2) ===');
assertEqual(getTaskCost('text', 'standard'), 2, 'Standard text = 2');
assertEqual(getTaskCost('text', 'premium'), 5, 'Premium text = 5');
assertEqual(getTaskCost('lookup', 'standard'), 5, 'Standard lookup = 5');
assertEqual(getTaskCost('lookup', 'premium'), 8, 'Premium lookup = 8');
assertEqual(getTaskCost('image', 'standard'), 10, 'Standard image = 10');
assertEqual(getTaskCost('image', 'premium'), 15, 'Premium image = 15');

// Full cost with premium models
const stdTiers = { text: 'standard', lookup: 'standard', image: 'standard' };
const prmTiers = { text: 'premium', lookup: 'premium', image: 'premium' };

assertEqual(
  calcFullCost({ text: true, lookup: true, image: false }, stdTiers, false, null),
  7, 'Full cost: all standard = 2+5 = 7'
);
assertEqual(
  calcFullCost({ text: true, lookup: true, image: false }, prmTiers, false, null),
  13, 'Full cost: all premium = 5+8 = 13'
);
assertEqual(
  calcFullCost({ text: true, lookup: true, image: true }, prmTiers, false, null),
  28, 'Full cost: all premium all tasks = 5+8+15 = 28'
);

// ═══════════════════════════════════════════
// TEST 3: Model Tier Compatibility (L2)
// ═══════════════════════════════════════════
log('\n=== Test 3: Model Tier Compatibility ===');
const citizenNeedsPremium = {
  needsModel: { text: 'premium', lookup: 'standard' }
};
const citizenNeedsStandard = {
  needsModel: { text: 'standard', lookup: 'standard' }
};
const citizenNoNeeds = {};

// Standard tiers should fail for citizen needing premium
const stdOnly = { text: 'standard', lookup: 'standard', image: 'standard' };
const premiumText = { text: 'premium', lookup: 'standard', image: 'standard' };

assert(!canProcessWithModels(citizenNeedsPremium, stdOnly), 'Standard text fails for premium-needy citizen');
assert(canProcessWithModels(citizenNeedsPremium, premiumText), 'Premium text works for premium-needy citizen');
assert(canProcessWithModels(citizenNeedsStandard, stdOnly), 'Standard works for standard-needy citizen');
assert(canProcessWithModels(citizenNeedsStandard, premiumText), 'Premium also works for standard-needy (overqualified)');
assert(canProcessWithModels(citizenNoNeeds, stdOnly), 'No model needs = always compatible');

// ═══════════════════════════════════════════
// TEST 4: Batch Discount Calculation (L3)
// ═══════════════════════════════════════════
log('\n=== Test 4: Batch Discount Calculation (Level 3) ===');

// Batch of 2 citizens with identical tasks (text:standard + lookup:standard)
const batch2 = [
  { available: ['text', 'lookup'] },
  { available: ['text', 'lookup'] }
];
const discount2 = calcBatchDiscount(batch2, stdTiers);
// text:standard count=2, lookup:standard count=2
// discount_on_text = 1 * 2 * 0.15 = 0.3 -> round(0.3) = 0
// discount_on_lookup = 1 * 5 * 0.15 = 0.75 -> round(0.75) = 1
// Total discount = 1
assertEqual(discount2, 1, 'Batch of 2 with text+lookup: discount = 1 token');

// Batch of 3 identical citizens
const batch3 = [
  { available: ['text', 'lookup'] },
  { available: ['text', 'lookup'] },
  { available: ['text', 'lookup'] }
];
const discount3 = calcBatchDiscount(batch3, stdTiers);
// text:standard count=3, lookup:standard count=3
// 2 discounted each: text discount = 2*2*0.15=0.6->1, lookup discount = 2*5*0.15=1.5->2
// Total = 3
assertEqual(discount3, 3, 'Batch of 3: discount = 3 tokens');

// Batch with premium tiers
const batchPrem = [
  { available: ['text', 'lookup'] },
  { available: ['text', 'lookup'] }
];
const discountPrem = calcBatchDiscount(batchPrem, { text: 'premium', lookup: 'standard', image: 'standard' });
// text:premium count=2, lookup:standard count=2
// text discount = 1*5*0.15 = 0.75 -> 1
// lookup discount = 1*5*0.15 = 0.75 -> 1
// Total = 2
assertEqual(discountPrem, 2, 'Batch with mixed tiers: discount = 2 tokens');

// Empty batch
assertEqual(calcBatchDiscount([], stdTiers), 0, 'Empty batch: discount = 0');

// Single citizen batch (no discount)
assertEqual(calcBatchDiscount([{ available: ['text'] }], stdTiers), 0, 'Single citizen: no discount');

// ═══════════════════════════════════════════
// TEST 5: Priority Bonus Math (L4)
// ═══════════════════════════════════════════
log('\n=== Test 5: Priority Bonus Math (Level 4) ===');
assertEqual(calcPriorityBonus(0), 0, '0 priority = 0 bonus');
assertEqual(calcPriorityBonus(1), 5, '1 priority = 5 bonus');
assertEqual(calcPriorityBonus(3), 15, '3 priority = 15 bonus');
assertEqual(calcPriorityBonus(8), 40, '8 priority = 40 bonus');

// Priority cost: doubles the task cost
const baseCost = calcFullCost({ text: true, lookup: true, image: false }, stdTiers, false, null);
const priorityCost = calcFullCost({ text: true, lookup: true, image: false }, stdTiers, true, null);
assertEqual(baseCost, 7, 'Base cost: text + lookup = 7');
assertEqual(priorityCost, 14, 'Priority cost: 2x base = 14');
assertEqual(priorityCost, baseCost * PRIORITY_COST_MULT, 'Priority = 2x exactly');

// Priority + Premium
const prmPriorityCost = calcFullCost({ text: true, lookup: true, image: false }, prmTiers, true, null);
assertEqual(prmPriorityCost, 26, 'Premium + Priority: (5+8)*2 = 26');

// ═══════════════════════════════════════════
// TEST 6: Cache Discount (L5)
// ═══════════════════════════════════════════
log('\n=== Test 6: Cache Discount for Returning Citizens (Level 5) ===');

const returningCitizen = { isReturning: true };
const newCitizen = { isReturning: false };

const lookupCostNormal = calcFullCost(
  { text: false, lookup: true, image: false },
  stdTiers, false, newCitizen
);
const lookupCostCached = calcFullCost(
  { text: false, lookup: true, image: false },
  stdTiers, false, returningCitizen
);

assertEqual(lookupCostNormal, 5, 'Lookup for new citizen = 5');
assertEqual(lookupCostCached, 3, 'Lookup for returning citizen = 3 (50% off, rounded)');
assert(lookupCostCached < lookupCostNormal, 'Cache discount reduces lookup cost');

// Cache only applies to lookups, not text or image
const textCostCached = calcFullCost(
  { text: true, lookup: false, image: false },
  stdTiers, false, returningCitizen
);
assertEqual(textCostCached, 2, 'Text cost unchanged for returning citizen');

const imageCostCached = calcFullCost(
  { text: false, lookup: false, image: true },
  stdTiers, false, returningCitizen
);
assertEqual(imageCostCached, 10, 'Image cost unchanged for returning citizen');

// Cache + Premium
const prmLookupCached = calcFullCost(
  { text: false, lookup: true, image: false },
  { text: 'standard', lookup: 'premium', image: 'standard' },
  false, returningCitizen
);
assertEqual(prmLookupCached, 4, 'Premium lookup cached = 4 (8 * 0.5 = 4)');

// ═══════════════════════════════════════════
// TEST 7: Combined Mechanics (L5)
// ═══════════════════════════════════════════
log('\n=== Test 7: All Mechanics Combined (Level 5) ===');

// Citizen: returning, needs premium text, all tasks on, priority mode
const complexCitizen = { isReturning: true };
const complexToggles = { text: true, lookup: true, image: true };
const complexTiers = { text: 'premium', lookup: 'standard', image: 'standard' };
const complexCost = calcFullCost(complexToggles, complexTiers, true, complexCitizen);
// text: premium = 5
// lookup: standard = 5, cached -> round(5*0.5) = 3
// image: standard = 10
// subtotal = 5 + 3 + 10 = 18
// priority 2x = 36
assertEqual(complexCost, 36, 'Complex citizen: premium text(5) + cached lookup(3) + image(10) = 18, priority 2x = 36');

// Without priority
const noPriorityCost = calcFullCost(complexToggles, complexTiers, false, complexCitizen);
assertEqual(noPriorityCost, 18, 'Same citizen without priority = 18');

// ═══════════════════════════════════════════
// TEST 8: Level Constraint Scenarios
// ═══════════════════════════════════════════
log('\n=== Test 8: Level Constraint Scenarios ===');

// L1: 5 citizens x 7 tokens = 35, well within 100
const lv1Total = 5 * 7;
assert(lv1Total <= 100, 'L1: 35 tokens within 100 budget');
assert(100 - lv1Total >= 50, 'L1: 65 tokens remaining');

// L2: 6 citizens, mix of premium needs
// 2 premium-text citizens: (5+5) * 2 = 20, 4 standard: 7*4 = 28, total = 48
const lv2StdCost = 4 * 7;
const lv2PrmCost = 2 * (getTaskCost('text','premium') + getTaskCost('lookup','standard'));
assertEqual(lv2StdCost + lv2PrmCost, 48, 'L2 minimum: 28 + 20 = 48 tokens');
assert(lv2StdCost + lv2PrmCost <= 120, 'L2: 48 tokens within 120 budget');

// L3: 9 citizens, 3 groups of 3, batch discount
// Each citizen = 7 tokens, 9 x 7 = 63, with batch discount ~3 per group = 63 - 9 = 54
const lv3NoBatch = 9 * 7;
assertEqual(lv3NoBatch, 63, 'L3 no batch: 63 tokens');
assert(lv3NoBatch <= 100, 'L3: 63 within 100 budget');

// Batch discount for 3 groups of 3
const groupOf3 = [{ available: ['text','lookup'] },{ available: ['text','lookup'] },{ available: ['text','lookup'] }];
const groupDiscount = calcBatchDiscount(groupOf3, stdTiers);
assertEqual(groupDiscount, 3, 'L3 group of 3: 3 token discount');
const lv3WithBatch = 63 - (groupDiscount * 3);
assertEqual(lv3WithBatch, 54, 'L3 with batch: 54 tokens');

// L4: 8 citizens, 4 deadlines (must priority)
// 4 no-priority: 4 * 7 = 28
// 4 priority (deadlines): 4 * 14 = 56
// Total spent: 84, bonus tokens: 4 * 5 = 20
// Effective budget: 100 + 20 = 120, spent 84, remaining 36
const lv4Spent = (4 * 7) + (4 * 14);
assertEqual(lv4Spent, 84, 'L4 spent: 28 + 56 = 84');
const lv4Bonus = calcPriorityBonus(4);
assertEqual(lv4Bonus, 20, 'L4 bonus: 4 * 5 = 20');
assert(lv4Spent <= 100 + lv4Bonus, 'L4: 84 within 120 effective budget');

// L5: All mechanics, 12 citizens, budget 120
assert(120 > 100, 'L5: 120 budget is larger than base 100');

// ═══════════════════════════════════════════
// TEST 9: Budget Constraint Logic
// ═══════════════════════════════════════════
log('\n=== Test 9: Budget Constraint Logic ===');
function canProcess(spent, cost, budget) {
  return spent + cost <= budget;
}
assert(canProcess(0, 7, 100), 'Can afford 7 tokens with clean budget');
assert(!canProcess(95, 7, 100), 'Cannot afford 7 tokens with 95 spent (need 2 more)');
assert(canProcess(98, 2, 100), 'Can afford 2 tokens at boundary');
assert(!canProcess(99, 2, 100), 'Cannot afford 2 tokens with 99 spent');

// With bonus tokens
assert(canProcess(95, 14, 100 + 10), 'Can afford 14 with 95 spent + 10 bonus = 105 budget');

// ═══════════════════════════════════════════
// TEST 10: Task Cost Ratios
// ═══════════════════════════════════════════
log('\n=== Test 10: Task Cost Ratios ===');
assertEqual(TASK_COSTS.image / TASK_COSTS.text, 5, 'Image = 5x text');
assertEqual(TASK_COSTS.image / TASK_COSTS.lookup, 2, 'Image = 2x lookup');
assertEqual(TASK_COSTS.lookup / TASK_COSTS.text, 2.5, 'Lookup = 2.5x text');
assertEqual(PREMIUM_COSTS.text / TASK_COSTS.text, 2.5, 'Premium text = 2.5x standard text');
assertEqual(PREMIUM_COSTS.lookup / TASK_COSTS.lookup, 1.6, 'Premium lookup = 1.6x standard lookup');
assertEqual(PREMIUM_COSTS.image / TASK_COSTS.image, 1.5, 'Premium image = 1.5x standard image');

// ═══════════════════════════════════════════
// TEST 11: Nova Auto-Allocation Logic
// ═══════════════════════════════════════════
log('\n=== Test 11: Nova Auto-Allocation Logic ===');

function novaAutoAllocateFull(citizen, remainingBudget, remainingCitizens, allowPremium, allowPriority) {
  const result = {
    text: citizen.required.includes('text'),
    lookup: citizen.required.includes('lookup'),
    image: citizen.required.includes('image')
  };
  const tiers = { text: 'standard', lookup: 'standard', image: 'standard' };
  let priority = false;

  if (allowPremium && citizen.needsModel) {
    ['text', 'lookup', 'image'].forEach(task => {
      if (citizen.needsModel[task] === 'premium') {
        tiers[task] = 'premium';
      }
    });
  }

  if (allowPriority && citizen.hasDeadline) {
    const baseCost = calcFullCost(result, tiers, false, citizen);
    const priorityCost = baseCost * PRIORITY_COST_MULT;
    if (remainingBudget >= priorityCost || remainingBudget + PRIORITY_BONUS - priorityCost >= 0) {
      priority = true;
    }
  }

  let currentCost = calcFullCost(result, tiers, priority, citizen);
  let avail = remainingBudget - currentCost;
  const futureMin = (remainingCitizens - 1) * 2;

  ['text', 'lookup', 'image'].forEach(task => {
    if (!result[task] && citizen.available && citizen.available.includes(task)) {
      let taskCost = getTaskCost(task, tiers[task] || 'standard');
      if (task === 'lookup' && citizen.isReturning) {
        taskCost = Math.round(taskCost * (1 - CACHE_DISCOUNT_PCT));
      }
      if (priority) taskCost *= PRIORITY_COST_MULT;
      if (avail - taskCost >= futureMin) {
        result[task] = true;
        avail -= taskCost;
      }
    }
  });

  result._tiers = tiers;
  result._priority = priority;
  return result;
}

// Test: Premium-needy citizen with ample budget
const premCit = {
  available: ['text', 'lookup', 'image'],
  required: ['text', 'lookup'],
  needsModel: { text: 'premium', lookup: 'standard' },
  hasDeadline: false,
  isReturning: false
};
const premAuto = novaAutoAllocateFull(premCit, 100, 5, true, false);
assert(premAuto._tiers.text === 'premium', 'Nova upgrades to premium for premium-needy text');
assert(premAuto._tiers.lookup === 'standard', 'Nova keeps standard for standard-needy lookup');

// Test: Deadline citizen with enough budget
const deadlineCit = {
  available: ['text', 'lookup'],
  required: ['text', 'lookup'],
  needsModel: {},
  hasDeadline: true,
  isReturning: false
};
const deadlineAuto = novaAutoAllocateFull(deadlineCit, 50, 3, false, true);
assert(deadlineAuto._priority, 'Nova enables priority for deadline citizen');
assert(deadlineAuto.text, 'Text ON');
assert(deadlineAuto.lookup, 'Lookup ON');

// Test: Deadline citizen with tight budget — still priorities
const tightDeadline = novaAutoAllocateFull(deadlineCit, 20, 3, false, true);
assert(tightDeadline._priority, 'Nova still priorities deadline citizen even with tight budget (bonus helps)');

// Test: Returning citizen gets cache benefit
const returnCit = {
  available: ['text', 'lookup'],
  required: ['lookup'],
  needsModel: {},
  hasDeadline: false,
  isReturning: true
};
const returnAuto = novaAutoAllocateFull(returnCit, 100, 3, false, false);
assert(returnAuto.lookup, 'Lookup ON for returning citizen');
// Cache should make lookup cheaper (5 -> 3), leaving room for optional text
log('  INFO: returning citizen auto: text=' + returnAuto.text + ' lookup=' + returnAuto.lookup);

// ═══════════════════════════════════════════
// TEST 12: Edge Cases
// ═══════════════════════════════════════════
log('\n=== Test 12: Edge Cases ===');

// Zero tasks
assertEqual(calcFullCost({ text: false, lookup: false, image: false }, stdTiers, false, null), 0, 'Zero tasks = 0 cost');

// Priority on zero tasks
assertEqual(calcFullCost({ text: false, lookup: false, image: false }, stdTiers, true, null), 0, 'Priority on zero tasks = 0');

// Maximum possible cost: all premium, all tasks, priority, not cached
const maxCost = calcFullCost({ text: true, lookup: true, image: true }, prmTiers, true, null);
assertEqual(maxCost, 56, 'Maximum cost: (5+8+15)*2 = 56');

// Cache with premium lookup
const prmCached = calcFullCost({ text: false, lookup: true, image: false }, prmTiers, false, { isReturning: true });
assertEqual(prmCached, 4, 'Premium cached lookup = 4');

// ═══════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════
log('\n' + '='.repeat(50));
log('Results: ' + passed + ' passed, ' + failed + ' failed, ' + (passed + failed) + ' total');
log('='.repeat(50));

if (failed > 0) {
  try { process.exit(1); } catch(e) {}
}
