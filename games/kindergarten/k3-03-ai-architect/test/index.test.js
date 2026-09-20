/**
 * index.test.js — Core logic tests for K3-03 AI Architect
 *
 * Run with: node test/index.test.js
 * Validates intents, rendering, and game state logic.
 */

// Load modules (simulated DOM for Node)
const { HouseRenderer } = require('../renderer.js');
const { GameIntents } = require('../intents.js');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log('  ✓', message);
  } else {
    failed++;
    console.error('  ✗ FAIL:', message);
  }
}

function assertEqual(actual, expected, message) {
  if (actual === expected) {
    passed++;
    console.log('  ✓', message);
  } else {
    failed++;
    console.error('  ✗ FAIL:', message, `(expected '${expected}', got '${actual}')`);
  }
}

function assertDeepEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
    console.log('  ✓', message);
  } else {
    failed++;
    console.error('  ✗ FAIL:', message, `(expected ${e}, got ${a})`);
  }
}

console.log('\n=== HouseRenderer Tests ===\n');

// Test: renderHouse returns SVG
assert(
  typeof HouseRenderer.renderHouse({
    roof: { shape: 'triangle', color: 'red' },
    door: { shape: 'square', color: 'blue' },
    windows: { shape: 'circle', color: 'yellow' }
  }) === 'string',
  'renderHouse() returns SVG string'
);

assert(
  HouseRenderer.renderHouse({
    roof: { shape: 'triangle', color: 'red' },
    door: { shape: 'square', color: 'blue' },
    windows: { shape: 'circle', color: 'yellow' }
  }).includes('<svg'),
  'renderHouse() output contains SVG tag'
);

// Test: renderOutline returns SVG
assert(
  typeof HouseRenderer.renderOutline(null, {}) === 'string',
  'renderOutline() returns SVG string'
);

// Test: validateAssignment
assert(
  HouseRenderer.validateAssignment('roof', 'triangle', 'red') === true,
  'validateAssignment accepts valid roof assignment'
);
assert(
  HouseRenderer.validateAssignment('roof', 'circle', 'red') === false,
  'validateAssignment rejects invalid roof shape'
);
assert(
  HouseRenderer.validateAssignment('door', 'square', 'purple') === true,
  'validateAssignment accepts valid door assignment'
);
assert(
  HouseRenderer.validateAssignment('windows', 'circle', 'orange') === true,
  'validateAssignment accepts valid window assignment'
);
assert(
  HouseRenderer.validateAssignment('windows', 'star', 'red') === false,
  'validateAssignment rejects invalid window shape'
);

// Test: getColorHex returns correct hex
assertEqual(
  HouseRenderer.getColorHex('red'),
  '#FF6B6B',
  'getColorHex("red") returns #FF6B6B'
);
assertEqual(
  HouseRenderer.getColorHex('blue'),
  '#4A90D9',
  'getColorHex("blue") returns #4A90D9'
);
assertEqual(
  HouseRenderer.getColorHex('nonexistent'),
  '#999',
  'getColorHex("nonexistent") returns fallback #999'
);

// Test: COLOR_MAP has all 6 colors
assertEqual(
  Object.keys(HouseRenderer.COLOR_MAP).length,
  6,
  'COLOR_MAP has 6 colors'
);

// Test: PART_SHAPES has 3 parts
assertEqual(
  Object.keys(HouseRenderer.PART_SHAPES).length,
  3,
  'PART_SHAPES has 3 parts'
);

// Test: renderShapeIcon returns SVG for all shapes
['circle', 'square', 'triangle', 'star', 'rectangle'].forEach(shape => {
  assert(
    HouseRenderer.renderShapeIcon(shape).includes('svg'),
    `renderShapeIcon("${shape}") returns SVG`
  );
});

console.log('\n=== GameIntents Tests ===\n');

// Test: extractShape
assertEqual(
  GameIntents.extractShape('circle'),
  'circle',
  'extractShape("circle") returns "circle"'
);
assertEqual(
  GameIntents.extractShape('I want a red square'),
  'square',
  'extractShape("I want a red square") returns "square"'
);
assertEqual(
  GameIntents.extractShape('star window'),
  'star',
  'extractShape("star window") returns "star"'
);
assertEqual(
  GameIntents.extractShape('hello there'),
  null,
  'extractShape("hello there") returns null'
);

// Test: extractColor
assertEqual(
  GameIntents.extractColor('blue'),
  'blue',
  'extractColor("blue") returns "blue"'
);
assertEqual(
  GameIntents.extractColor('I like green'),
  'green',
  'extractColor("I like green") returns "green"'
);
assertEqual(
  GameIntents.extractColor('purple roof'),
  'purple',
  'extractColor("purple roof") returns "purple"'
);
assertEqual(
  GameIntents.extractColor('no color here'),
  null,
  'extractColor("no color here") returns null'
);

// Test: extractShapeColor
assertDeepEqual(
  GameIntents.extractShapeColor('red circle'),
  { shape: 'circle', color: 'red' },
  'extractShapeColor("red circle") finds both'
);
assertDeepEqual(
  GameIntents.extractShapeColor('blue square door'),
  { shape: 'square', color: 'blue' },
  'extractShapeColor("blue square door") finds both'
);

// Test: extractPart
assertEqual(
  GameIntents.extractPart('the roof should be red'),
  'roof',
  'extractPart("the roof should be red") returns "roof"'
);
assertEqual(
  GameIntents.extractPart('windows are circle'),
  'windows',
  'extractPart("windows are circle") returns "windows"'
);
assertEqual(
  GameIntents.extractPart('door square blue'),
  'door',
  'extractPart("door square blue") returns "door"'
);

// Test: isYes / isNo
assert(GameIntents.isYes('yes'), 'isYes("yes") is true');
assert(GameIntents.isYes('yeah'), 'isYes("yeah") is true');
assert(!GameIntents.isYes('no'), 'isYes("no") is false');
assert(GameIntents.isNo('no'), 'isNo("no") is true');
assert(GameIntents.isNo('nope'), 'isNo("nope") is true');
assert(!GameIntents.isNo('yes'), 'isNo("yes") is false');

// Test: matchesShape
assert(GameIntents.matchesShape('circle', 'circle'), 'matchesShape("circle", "circle") is true');
assert(GameIntents.matchesShape('a square', 'square'), 'matchesShape("a square", "square") is true');
assert(!GameIntents.matchesShape('circle', 'square'), 'matchesShape("circle", "square") is false');

// Test: matchesColor
assert(GameIntents.matchesColor('red', 'red'), 'matchesColor("red", "red") is true');
assert(!GameIntents.matchesColor('blue', 'red'), 'matchesColor("blue", "red") is false');

// Test: processQuizAnswer — shape
const shapeResult = GameIntents.processQuizAnswer('circle', { type: 'shape', value: 'circle' });
assert(shapeResult.correct === true, 'processQuizAnswer correct shape');
assertEqual(shapeResult.shape, 'circle', 'processQuizAnswer returns shape');

// Test: processQuizAnswer — wrong
const wrongResult = GameIntents.processQuizAnswer('square', { type: 'shape', value: 'circle' });
assert(wrongResult.correct === false, 'processQuizAnswer incorrect shape');

// Test: processQuizAnswer — color
const colorResult = GameIntents.processQuizAnswer('red', { type: 'color', value: 'red' });
assert(colorResult.correct === true, 'processQuizAnswer correct color');

// Test: processPartAssignment
const assignmentResult = GameIntents.processPartAssignment('red triangle roof');
assertEqual(assignmentResult.part, 'roof', 'processPartAssignment extracts part');
assertEqual(assignmentResult.shape, 'triangle', 'processPartAssignment extracts shape');
assertEqual(assignmentResult.color, 'red', 'processPartAssignment extracts color');
assert(assignmentResult.hasPart === true, 'processPartAssignment hasPart true');
assert(assignmentResult.hasShape === true, 'processPartAssignment hasShape true');
assert(assignmentResult.hasColor === true, 'processPartAssignment hasColor true');

// Test: processUtterance — addressed
const addressedResult = GameIntents.processUtterance('hey Botly, this is a circle');
assert(addressedResult.addressed === true, 'processUtterance detects address trigger');

// Test: processUtterance — not addressed
const notAddressed = GameIntents.processUtterance('I like pizza');
assert(notAddressed.addressed === false, 'processUtterance ignores non-addressed speech');

// Test: processUtterance — quiz mode
const quizUtterance = GameIntents.processUtterance('circle', { quizMode: 'shape', quizValue: 'circle' });
assert(quizUtterance.addressed === true, 'processUtterance processes quiz mode utterance');
assert(quizUtterance.intent === 'QUIZ_ANSWER', 'processUtterance classifies QUIZ_ANSWER');

// Test: TRIGGER_PATTERNS
assert(
  GameIntents.TRIGGER_PATTERNS.some(p => p.test('hi Botly')),
  'TRIGGER_PATTERNS matches "hi Botly"'
);
assert(
  GameIntents.TRIGGER_PATTERNS.some(p => p.test('what is this?')),
  'TRIGGER_PATTERNS matches question'
);

// --- extractAllAssignments tests ---

console.log('\n=== extractAllAssignments ===\n');

assert(
  GameIntents.extractAllAssignments('red star roof').length === 1,
  'extractAllAssignments: single assignment "red star roof" returns 1'
);
assert(
  GameIntents.extractAllAssignments('red star roof')[0].part === 'roof',
  'extractAllAssignments: extracts roof part'
);
assert(
  GameIntents.extractAllAssignments('red star roof')[0].shape === 'star',
  'extractAllAssignments: extracts star shape'
);
assert(
  GameIntents.extractAllAssignments('red star roof')[0].color === 'red',
  'extractAllAssignments: extracts red color'
);

assert(
  GameIntents.extractAllAssignments('star window, red roof').length === 2,
  'extractAllAssignments: "star window, red roof" returns 2'
);
assert(
  GameIntents.extractAllAssignments('star window, red roof, blue door').length === 3,
  'extractAllAssignments: "star window, red roof, blue door" returns 3'
);

assert(
  GameIntents.extractAllAssignments('blue circle door and triangle windows').length === 2,
  'extractAllAssignments: "blue circle door and triangle windows" returns 2'
);

const multi = GameIntents.extractAllAssignments('star window, red roof, blue door');
assert(multi[0].part === 'windows', 'extractAllAssignments: first item part is windows');
assert(multi[1].part === 'roof', 'extractAllAssignments: second item part is roof');
assert(multi[2].part === 'door', 'extractAllAssignments: third item part is door');
assert(multi[0].shape === 'star', 'extractAllAssignments: first item shape is star');
assert(multi[1].color === 'red', 'extractAllAssignments: second item color is red');
assert(multi[2].color === 'blue', 'extractAllAssignments: third item color is blue');

assert(
  GameIntents.extractAllAssignments('hello there').length === 0,
  'extractAllAssignments: no assignment returns empty array'
);

assert(
  GameIntents.extractAllAssignments('').length === 0,
  'extractAllAssignments: empty string returns empty array'
);

console.log('\n=== Summary ===');
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
console.log(`  Total:  ${passed + failed}`);
console.log(failed === 0 ? '\n  All tests passed! ✓' : `\n  ${failed} test(s) FAILED ✗`);
process.exit(failed > 0 ? 1 : 0);
