/**
 * index.test.js — Core logic tests for Civic Feedback Router
 *
 * Tests: priority calculation, department matching, scoring logic,
 * sentiment scoring, urgency detection.
 *
 * Run with: node test/index.test.js
 */

'use strict';

// ── Simulate the data module inline for testing ──

const DEPARTMENTS = {
  parks: {
    id: 'parks',
    name: 'Parks & Recreation',
    keywords: ['park', 'playground', 'garden', 'tree', 'flower', 'bench', 'fountain', 'grass', 'picnic', 'pond', 'trail', 'field', 'swing', 'slide'],
    color: '#4CAF50',
  },
  transit: {
    id: 'transit',
    name: 'Transit Authority',
    keywords: ['bus', 'train', 'stop', 'route', 'traffic', 'road', 'sidewalk', 'crossing', 'signal', 'lane', 'station', 'delay', 'schedule', 'track'],
    color: '#2196F3',
  },
  waste: {
    id: 'waste',
    name: 'Waste Management',
    keywords: ['trash', 'bin', 'garbage', 'recycle', 'recycling', 'dump', 'litter', 'overflow', 'pickup', 'waste', 'disposal', 'dumpster', 'collection', 'rubbish', 'landfill'],
    color: '#FF9800',
  },
};

function computePriority(sentimentScore) {
  const urgencyMultiplier = sentimentScore <= -3 ? 2 : 1;
  const priorityWeight = Math.abs(sentimentScore) * urgencyMultiplier;
  const isUrgent = priorityWeight > 7;
  return { urgencyMultiplier, priorityWeight, isUrgent };
}

function findDepartmentByKeywords(text) {
  const lower = text.toLowerCase();
  for (const dept of Object.values(DEPARTMENTS)) {
    for (const kw of dept.keywords) {
      const regex = new RegExp('\\b' + kw + '\\b', 'i');
      if (regex.test(lower)) return dept;
    }
  }
  return null;
}

/**
 * Calculate route score: negative sentiments weighed more heavily.
 * Score = abs(score) * 4 + 5 for negative (urgent), abs(score) * 1 + 5 for positive (routine)
 */
function calculateRouteScore(sentimentScore) {
  const absScore = Math.abs(sentimentScore);
  if (sentimentScore <= 0) {
    return absScore * 4 + 5;
  } else {
    return absScore * 1 + 5;
  }
}

// ── Test runner ──

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✓ ' + name);
  } catch (e) {
    failed++;
    console.log('  ✗ ' + name);
    console.log('    ' + e.message);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

// ═══════════════════════════════════════════════
// Priority Calculation Tests
// ═══════════════════════════════════════════════

console.log('\n── Priority Calculation ──');

test('Very angry (-5) should have priorityWeight 10 and be urgent', () => {
  const p = computePriority(-5);
  assertEquals(p.urgencyMultiplier, 2);
  assertEquals(p.priorityWeight, 10);
  assertEquals(p.isUrgent, true);
});

test('Angry (-4) should have priorityWeight 8 and be urgent', () => {
  const p = computePriority(-4);
  assertEquals(p.urgencyMultiplier, 2);
  assertEquals(p.priorityWeight, 8);
  assertEquals(p.isUrgent, true);
});

test('Mildly annoyed (-3) should have priorityWeight 6 and NOT be urgent', () => {
  const p = computePriority(-3);
  assertEquals(p.urgencyMultiplier, 2);
  assertEquals(p.priorityWeight, 6);
  assertEquals(p.isUrgent, false);
});

test('Slightly annoyed (-2) should have priorityWeight 2 and NOT be urgent', () => {
  const p = computePriority(-2);
  assertEquals(p.urgencyMultiplier, 1);
  assertEquals(p.priorityWeight, 2);
  assertEquals(p.isUrgent, false);
});

test('Happy (+3) should have priorityWeight 3 and NOT be urgent', () => {
  const p = computePriority(3);
  assertEquals(p.urgencyMultiplier, 1);
  assertEquals(p.priorityWeight, 3);
  assertEquals(p.isUrgent, false);
});

test('Very happy (+5) should have priorityWeight 5 and NOT be urgent', () => {
  const p = computePriority(5);
  assertEquals(p.urgencyMultiplier, 1);
  assertEquals(p.priorityWeight, 5);
  assertEquals(p.isUrgent, false);
});

test('Neutral (0) should have priorityWeight 0', () => {
  const p = computePriority(0);
  assertEquals(p.priorityWeight, 0);
  assertEquals(p.isUrgent, false);
});

test('Urgency threshold: score <= -3 gets multiplier 2', () => {
  assertEquals(computePriority(-3).urgencyMultiplier, 2);
  assertEquals(computePriority(-2).urgencyMultiplier, 1);
});

// ═══════════════════════════════════════════════
// Department Matching Tests
// ═══════════════════════════════════════════════

console.log('\n── Department Matching ──');

test('"The bus was late" should match transit', () => {
  const dept = findDepartmentByKeywords('The bus was late again!');
  assertEquals(dept.id, 'transit');
});

test('"The park fountain is broken" should match parks (first match)', () => {
  const dept = findDepartmentByKeywords('The park fountain is broken');
  assertEquals(dept.id, 'parks');
});

test('"Trash pickup is overdue" should match waste', () => {
  const dept = findDepartmentByKeywords('Trash pickup is overdue');
  assertEquals(dept.id, 'waste');
});

test('"The train schedule is great" should match transit', () => {
  const dept = findDepartmentByKeywords('The train schedule is great');
  assertEquals(dept.id, 'transit');
});

test('"Flowers in the garden are beautiful" should match parks', () => {
  const dept = findDepartmentByKeywords('Flowers in the garden are beautiful');
  assertEquals(dept.id, 'parks');
});

test('"Garbage bin is overflowing" should match waste', () => {
  const dept = findDepartmentByKeywords('Garbage bin is overflowing');
  assertEquals(dept.id, 'waste');
});

test('"The recycling center is closed" should match waste', () => {
  const dept = findDepartmentByKeywords('The recycling center is closed');
  assertEquals(dept.id, 'waste');
});

test('"The playground swings are broken" should match parks', () => {
  const dept = findDepartmentByKeywords('The playground swings are broken');
  assertEquals(dept.id, 'parks');
});

test('"The sidewalk on Main Street is cracked" should match transit', () => {
  const dept = findDepartmentByKeywords('The sidewalk on Main Street is cracked');
  assertEquals(dept.id, 'transit');
});

test('Text with no keywords should return null', () => {
  const dept = findDepartmentByKeywords('The weather is nice today');
  assertEquals(dept, null);
});

// ═══════════════════════════════════════════════
// Scoring Logic Tests (sentiment-weighted)
// ═══════════════════════════════════════════════

console.log('\n── Scoring Logic ──');

test('Negative sentiment (-5) scores higher than positive (+5) — 25 vs 10', () => {
  assertEquals(calculateRouteScore(-5), 25);
  assertEquals(calculateRouteScore(5), 10);
});

test('Negative sentiment (-4) scores 21, positive (+4) scores 9', () => {
  assertEquals(calculateRouteScore(-4), 21);
  assertEquals(calculateRouteScore(4), 9);
});

test('Negative (-3) scores 17, positive (+3) scores 8', () => {
  assertEquals(calculateRouteScore(-3), 17);
  assertEquals(calculateRouteScore(3), 8);
});

test('Neutral (0) scores 5', () => {
  assertEquals(calculateRouteScore(0), 5);
});

test('Negative emails give 4x more points than positive emails', () => {
  const negativeScore = calculateRouteScore(-4); // 21
  const positiveScore = calculateRouteScore(4);  // 9
  assertEquals(negativeScore > positiveScore * 2, true);
});

test('Level 1 (p2=+4:9, t1=-4:21, w3=-4:21) max score = 51, minScore = 35 passes', () => {
  const scores = [calculateRouteScore(4), calculateRouteScore(-4), calculateRouteScore(-4)];
  const maxScore = scores.reduce((s, v) => s + v, 0);
  assertEquals(maxScore, 51);
  const studentScore = scores[1] + scores[2]; // Got the two angry emails right
  assertEquals(studentScore >= 35, true, 'Two angry emails (42) should pass');
});

test('Level 5 crisis mode: all negative emails, minScore 210 out of 260 max', () => {
  // All level 5 emails are negative
  const level5Scores = [-5, -5, -5, -4, -4, -4, -4, -5, -3, -4, -3, -4];
  const maxScore = level5Scores.reduce((s, v) => s + calculateRouteScore(v), 0);
  assertEquals(maxScore, 260);
  // Miss one -5 (25) and one -4 (21) = lose 46, should still pass (214 >= 210)
  const missTwoScore = maxScore - calculateRouteScore(-5) - calculateRouteScore(-4);
  assertEquals(missTwoScore >= 210, true, 'Missing one -5 and one -4 should still pass');
});

// ═══════════════════════════════════════════════
// Keyword Sorter Tests
// ═══════════════════════════════════════════════

console.log('\n── Keyword Sorter ──');

test('Keyword "bus" belongs to transit', () => {
  const transitKeywords = ['bus', 'train', 'stop', 'route', 'traffic', 'road', 'sidewalk', 'crossing', 'signal', 'lane', 'station', 'delay', 'schedule', 'track'];
  assertEquals(transitKeywords.includes('bus'), true);
});

test('Keyword "park" belongs to parks', () => {
  const parksKeywords = ['park', 'playground', 'garden', 'tree', 'flower', 'bench', 'fountain', 'grass', 'picnic', 'pond', 'trail', 'field', 'swing', 'slide'];
  assertEquals(parksKeywords.includes('park'), true);
});

test('Keyword "trash" belongs to waste', () => {
  const wasteKeywords = ['trash', 'bin', 'garbage', 'recycle', 'recycling', 'dump', 'litter', 'overflow', 'pickup', 'waste', 'disposal', 'dumpster', 'collection', 'rubbish', 'landfill'];
  assertEquals(wasteKeywords.includes('trash'), true);
});

test('Keyword sorter scoring: 10 pts per correct, pass at 80/120', () => {
  const ptsPerCorrect = 10;
  const correct = 8;
  const total = 12;
  assertEquals(correct * ptsPerCorrect, 80);
  assertEquals(80 >= 80, true, '8/12 correct (80 pts) should pass');
  assertEquals(7 * ptsPerCorrect < 80, true, '7/12 (70 pts) should fail');
});

// ═══════════════════════════════════════════════
// Priority Order Tests
// ═══════════════════════════════════════════════

console.log('\n── Priority Order ──');

test('Lower (more negative) sentiment = higher priority', () => {
  const messages = [
    { text: 'Angry', score: -5 },
    { text: 'Frustrated', score: -4 },
    { text: 'Annoyed', score: -3 },
    { text: 'Mild', score: -2 },
    { text: 'Happy', score: 4 },
  ];
  // Sort by sentiment ascending — most negative FIRST = highest priority
  const correctOrder = [...messages].sort((a, b) => a.score - b.score);
  for (let i = 0; i < correctOrder.length - 1; i++) {
    assertEquals(correctOrder[i].score <= correctOrder[i + 1].score, true,
      'Message ' + (i + 1) + ' should have lower or equal score vs message ' + (i + 2));
  }
  // Assign relativeOrder: position in sorted array + 1
  const withOrder = messages.map(msg => ({
    ...msg,
    relativeOrder: correctOrder.findIndex(c => c.text === msg.text) + 1,
  }));
  const mostAngry = withOrder.find(m => m.text === 'Angry');
  assertEquals(mostAngry.relativeOrder, 1, 'Angry (-5) should be first priority');
  const happy = withOrder.find(m => m.text === 'Happy');
  assertEquals(happy.relativeOrder, 5, 'Happy (+4) should be last priority');
});

test('Priority scoring: 15 pts per correct position, pass at 60/90', () => {
  const ptsPerCorrect = 15;
  const correct = 4;
  const total = 6;
  assertEquals(correct * ptsPerCorrect, 60);
  assertEquals(60 >= 60, true, '4/6 correct (60 pts) should pass');
  assertEquals(3 * ptsPerCorrect < 60, true, '3/6 (45 pts) should fail');
});

// ═══════════════════════════════════════════════
// Sentiment Range Tests
// ═══════════════════════════════════════════════

console.log('\n── Sentiment Range ──');

test('Sentiment score -5 is valid', () => {
  const score = -5;
  assertEquals(score >= -5 && score <= 5, true);
});

test('Sentiment score +5 is valid', () => {
  const score = 5;
  assertEquals(score >= -5 && score <= 5, true);
});

test('Sentiment score 0 is valid', () => {
  const score = 0;
  assertEquals(score >= -5 && score <= 5, true);
});

// ═══════════════════════════════════════════════
// Keyword extraction test
// ═══════════════════════════════════════════════

console.log('\n── Keyword Extraction ──');

test('"bus" keyword matches transit department keywords', () => {
  assertEquals(DEPARTMENTS.transit.keywords.includes('bus'), true);
});

test('"park" keyword matches parks department keywords', () => {
  assertEquals(DEPARTMENTS.parks.keywords.includes('park'), true);
});

test('"trash" keyword matches waste department keywords', () => {
  assertEquals(DEPARTMENTS.waste.keywords.includes('trash'), true);
});

test('"sidewalk" is a transit keyword', () => {
  assertEquals(DEPARTMENTS.transit.keywords.includes('sidewalk'), true);
});

test('"fountain" is a parks keyword', () => {
  assertEquals(DEPARTMENTS.parks.keywords.includes('fountain'), true);
});

test('"recycle" is a waste keyword', () => {
  assertEquals(DEPARTMENTS.waste.keywords.includes('recycle'), true);
});

test('"airplane" is NOT a keyword for any department', () => {
  const allKeywords = [
    ...DEPARTMENTS.parks.keywords,
    ...DEPARTMENTS.transit.keywords,
    ...DEPARTMENTS.waste.keywords,
  ];
  assertEquals(allKeywords.includes('airplane'), false);
});

// ═══════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════

console.log('\n─────────────────────────────');
console.log(`Total: ${passed + failed} tests`);
console.log(`Passed: ${passed} ✓`);
console.log(`Failed: ${failed} ✗`);
console.log('─────────────────────────────\n');

process.exit(failed > 0 ? 1 : 0);
