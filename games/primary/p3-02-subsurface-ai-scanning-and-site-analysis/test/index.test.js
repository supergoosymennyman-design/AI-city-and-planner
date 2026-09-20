/* ============================================================
   test/index.test.js — Core Game Logic Tests (v2)
   Subsurface Signal Decoder — AI Teaching Arc Edition
   Run: node test/index.test.js
   ============================================================ */

const assert = {
  ok(condition, msg) {
    if (!condition) throw new Error('FAIL: ' + msg);
    console.log('  ✓ ' + msg);
  },
  equal(a, b, msg) {
    if (a !== b) throw new Error('FAIL: ' + msg + ` (expected ${b}, got ${a})`);
    console.log('  ✓ ' + msg);
  },
  notEqual(a, b, msg) {
    if (a === b) throw new Error('FAIL: ' + msg + ` (expected not ${b})`);
    console.log('  ✓ ' + msg);
  },
  gt(a, b, msg) {
    if (!(a > b)) throw new Error('FAIL: ' + msg + ` (expected ${a} > ${b})`);
    console.log('  ✓ ' + msg);
  },
  lt(a, b, msg) {
    if (!(a < b)) throw new Error('FAIL: ' + msg + ` (expected ${a} < ${b})`);
    console.log('  ✓ ' + msg);
  },
};

const fs = require('fs');
const path = require('path');

// Minimal DOM stubs
global.document = { addEventListener: () => {} };
global.window = { AudioContext: null, speechSynthesis: null };
global.AudioContext = null;

// Load classifier module
(function() {
  const code = fs.readFileSync(path.join(__dirname, '..', 'classifier.js'), 'utf-8');
  const patched = code.replace('const Classifier = (() => {', 'globalThis.Classifier = (() => {');
  eval(patched);
})();

// Load sensors module
(function() {
  const code = fs.readFileSync(path.join(__dirname, '..', 'sensors.js'), 'utf-8');
  const patched = code.replace('const Sensors = (() => {', 'globalThis.Sensors = (() => {');
  eval(patched);
})();

// Load game module
(function() {
  const code = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf-8');
  const patched = code.replace('const Game = (() => {', 'globalThis.Game = (() => {');
  eval(patched);
})();

const Classifier = globalThis.Classifier;
const Sensors = globalThis.Sensors;
const Game = globalThis.Game;

let passed = 0;
let failed = 0;

function test(name, fn) {
  console.log('\n[' + name + ']');
  try {
    fn();
    passed++;
  } catch (e) {
    console.error('  ✗ ' + e.message);
    failed++;
  }
}

// ═══════════════════════════════════════════
// CLASSIFIER TESTS
// ═══════════════════════════════════════════

test('learnThreshold: both classes present', () => {
  const labels = [
    { amplitude: 15, label: 'safe' },
    { amplitude: 22, label: 'safe' },
    { amplitude: 60, label: 'hazard' },
    { amplitude: 72, label: 'hazard' },
  ];
  const result = Classifier.learnThreshold(labels);
  assert.ok(result.trained, 'Should be trained');
  assert.gt(result.T, 22, 'T should be above max safe');
  assert.lt(result.T, 60, 'T should be below min hazard');
  assert.equal(result.T, 41, 'T should be midpoint of 22 and 60');
});

test('learnThreshold: only safe samples', () => {
  const labels = [
    { amplitude: 15, label: 'safe' },
    { amplitude: 22, label: 'safe' },
  ];
  const result = Classifier.learnThreshold(labels);
  assert.ok(!result.trained, 'Not fully trained');
  assert.gt(result.T, 22, 'T should be above max safe by margin');
  assert.equal(result.T, 34, 'T = 22 + 12');
});

test('learnThreshold: only hazard samples', () => {
  const labels = [
    { amplitude: 60, label: 'hazard' },
    { amplitude: 72, label: 'hazard' },
  ];
  const result = Classifier.learnThreshold(labels);
  assert.ok(!result.trained, 'Not fully trained');
  assert.equal(result.T, 48, 'T = 60 - 12');
});

test('learnThreshold: empty labels', () => {
  const result = Classifier.learnThreshold([]);
  assert.ok(!result.trained, 'Not trained');
  assert.equal(result.T, 50, 'Default T is 50');
});

test('learnThreshold: overlapping labels (kid inconsistent)', () => {
  const labels = [
    { amplitude: 40, label: 'safe' },
    { amplitude: 55, label: 'safe' },
    { amplitude: 30, label: 'hazard' },
    { amplitude: 65, label: 'hazard' },
  ];
  const result = Classifier.learnThreshold(labels);
  assert.ok(result.overlap, 'Should detect overlap');
  // Overlap: max safe (55) > min hazard (30)
  // T sits inside overlap, causing misclassifications
  assert.equal(result.T, 42.5, 'T is 42.5 ((55+30)/2)');
  assert.ok(result.overlap, 'Overlap flag is true');
});

test('classify: basic', () => {
  assert.equal(Classifier.classify(80, 50), 'hazard', '80 >= 50 is hazard');
  assert.equal(Classifier.classify(30, 50), 'safe', '30 < 50 is safe');
  assert.equal(Classifier.classify(50, 50), 'hazard', '50 >= 50 is hazard (edge)');
});

test('confidence: sigmoid behavior', () => {
  const confHigh = Classifier.confidence(80, 50);
  const confMid = Classifier.confidence(50, 50);
  const confLow = Classifier.confidence(20, 50);
  assert.gt(confHigh, 85, 'Far above T should be high confidence');
  assert.ok(confMid >= 45 && confMid <= 55, 'At T should be ~50%');
  assert.lt(confLow, 15, 'Far below T should be low confidence');
});

test('sensitivityThreshold: shifts correctly', () => {
  const T = 50;
  assert.equal(Classifier.sensitivityThreshold(T, 5, 6), 50, 'Sensitivity 5 = no shift');
  assert.equal(Classifier.sensitivityThreshold(T, 9, 6), 26, 'Sensitivity 9 = -4*6 = -24 shift');
  assert.equal(Classifier.sensitivityThreshold(T, 1, 6), 74, 'Sensitivity 1 = +4*6 = +24 shift');
  assert.equal(Classifier.sensitivityThreshold(T, 9, 6), 26, 'Sens 9 = T - 24');
});

test('fuseVotes: ≥2 rule', () => {
  const votes2 = [
    { sensorId: 'seismic', vote: true },
    { sensorId: 'gpr', vote: true },
    { sensorId: 'em', vote: false },
  ];
  const result2 = Classifier.fuseVotes(votes2);
  assert.equal(result2.agreeCount, 2, '2 sensors agree');
  assert.ok(result2.confirmed, '2/3 confirms');

  const votes1 = [
    { sensorId: 'seismic', vote: true },
    { sensorId: 'gpr', vote: false },
    { sensorId: 'em', vote: false },
  ];
  const result1 = Classifier.fuseVotes(votes1);
  assert.equal(result1.agreeCount, 1, '1 sensor agrees');
  assert.ok(!result1.confirmed, '1/3 does not confirm');

  const votes3 = [
    { sensorId: 'seismic', vote: true },
    { sensorId: 'gpr', vote: true },
    { sensorId: 'em', vote: true },
  ];
  const result3 = Classifier.fuseVotes(votes3);
  assert.equal(result3.agreeCount, 3, 'All 3 agree');
  assert.ok(result3.confirmed, '3/3 confirms');
});

// ═══════════════════════════════════════════
// SENSORS TESTS
// ═══════════════════════════════════════════

test('Sensors: profiles exist', () => {
  assert.ok(Sensors.SENSOR_PROFILES.seismic, 'Seismic profile exists');
  assert.ok(Sensors.SENSOR_PROFILES.gpr, 'GPR profile exists');
  assert.ok(Sensors.SENSOR_PROFILES.em, 'EM profile exists');
});

test('Sensors: HAZARD_TYPES have stealth rules', () => {
  const pipe = Sensors.HAZARD_TYPES.pipe;
  assert.ok(pipe.stealthyTo.includes('em'), 'Pipe stealthy to EM');
  assert.ok(!pipe.stealthyTo.includes('seismic'), 'Pipe visible to Seismic');

  const plastic = Sensors.HAZARD_TYPES.plastic_pipe;
  assert.ok(plastic.stealthyTo.includes('seismic'), 'Plastic pipe stealthy to Seismic');
});

test('Sensors: cellSignals returns 3 amplitudes', () => {
  const config = { sensors: ['seismic', 'gpr', 'em'] };
  const signals = Sensors.cellSignals({ row: 2, col: 3 }, config, true, 'pipe');
  assert.ok(typeof signals.seismic === 'number', 'Seismic amp is number');
  assert.ok(typeof signals.gpr === 'number', 'GPR amp is number');
  assert.ok(typeof signals.em === 'number', 'EM amp is number');
  assert.equal(signals.hazardType, 'pipe', 'Hazard type preserved');
  // Pipe is stealthy to EM → EM amplitude should be low
  assert.lt(signals.em, 40, 'Stealthy sensor (EM) below 40 for pipe');
  // Pipe is detectable by Seismic → should be higher
  assert.gt(signals.seismic, 40, 'Detectable sensor (Seismic) above 40 for pipe');
});

test('Sensors: generateGrid works', () => {
  const config = { sensors: ['seismic', 'gpr', 'em'] };
  const hazards = [{ row: 1, col: 2, type: 'pipe' }];
  const grid = Sensors.generateGrid(3, 3, hazards, config);
  assert.equal(grid.length, 3, '3 rows');
  assert.equal(grid[0].length, 3, '3 cols');
  assert.ok(grid[1][2].seismic !== undefined, 'Cell (1,2) has seismic data');
  assert.equal(grid[1][2].hazardType, 'pipe', 'Hazard cell labeled');
  assert.equal(grid[0][0].hazardType, null, 'Safe cell has null type');
});

// ═══════════════════════════════════════════
// GAME TESTS (v2)
// ═══════════════════════════════════════════

test('Game: all levels defined with v2 properties', () => {
  [1,2,3,4,6].forEach(i => {
    const level = Game.getLevel(i);
    assert.ok(level !== null, `Level ${i} exists`);
    assert.ok(typeof level.name === 'string', `Level ${i} has name`);
    assert.ok(level.gridRows > 0, `Level ${i} has rows`);
    assert.ok(Array.isArray(level.hazards), `Level ${i} has hazards`);
    assert.ok(level.antiFrustrationLimit > 0, `Level ${i} has anti-frustration limit`);
  });
});

test('Game: Lv1 training flow', () => {
  Game.init(() => {});
  Game.setLevel(1);
  assert.equal(Game.getTrainingPhase(), 'collecting', 'Starts in collecting phase');

  const samples = Game.getTrainingSamples();
  assert.ok(samples.length >= 4, 'Has at least 4 training samples');

  // Label a safe sample
  const s0 = samples[0];
  Game.selectCell(s0.row, s0.col);
  const result = Game.addLabel(s0.row, s0.col, 'safe');
  assert.ok(result, 'Label added');
  assert.equal(result.phase, 'collecting', 'Still collecting with 1 label');

  // Label more to trigger training
  const s1 = samples[1];
  Game.addLabel(s1.row, s1.col, 'safe');
  const s2 = samples[2];
  Game.addLabel(s2.row, s2.col, 'hazard');
  const s3 = samples[3];
  const r4 = Game.addLabel(s3.row, s3.col, 'hazard');

  assert.equal(r4.phase, 'reviewing', 'Moves to reviewing after 4 labels');
  assert.ok(Game.getLearnedThreshold() !== null, 'Threshold learned');
  assert.ok(Game.getLearnedThreshold().trained, 'Is trained');
});

test('Game: Lv1 auto-classification after training', () => {
  Game.init(() => {});
  Game.setLevel(1);

  // Auto-train via debug
  Game.debugAutoTrain();

  // Check all cells classified correctly
  assert.equal(Game.getTrainingPhase(), 'confirmed', 'Training confirmed');
  assert.ok(Game.isComplete(), 'Level complete');

  // Every cell should be correctly classified
  const level = Game.getLevel(1);
  for (let r = 0; r < level.gridRows; r++) {
    for (let c = 0; c < level.gridCols; c++) {
      const classified = Game.getAutoClassification(r, c);
      assert.ok(classified === 'hazard' || classified === 'safe', `Cell (${r},${c}) classified`);
    }
  }
});

test('Game: Lv2 sensitivity stepper', () => {
  Game.init(() => {});
  Game.setLevel(2);

  assert.equal(Game.getSensitivity(), 1, 'Default sensitivity 1');
  const t1 = Game.getEffectiveThreshold();
  assert.ok(t1 !== null, 'Effective threshold computed');

  Game.setSensitivity(9);
  assert.equal(Game.getSensitivity(), 9, 'Sensitivity changed to 9');
  const t9 = Game.getEffectiveThreshold();
  assert.lt(t9, t1, 'Higher sensitivity → lower threshold (flags more)');

  Game.setSensitivity(5);
  const t5 = Game.getEffectiveThreshold();
  assert.gt(t5, t9, 'Medium sensitivity → middle threshold');
  assert.lt(t5, t1, 'Medium sensitivity → lower than low sensitivity');
});

test('Game: Lv2 confirm hazard + false alarm', () => {
  Game.init(() => {});
  Game.setLevel(2);

  const level = Game.getLevel(2);
  const hazard = level.hazards[0];

  // Confirm a real hazard
  const result = Game.confirmCellAsHazard(hazard.row, hazard.col);
  assert.ok(result, 'Hazard confirmed');
  assert.ok(result.isHazard, 'Was a real hazard');

  // Confirm a false alarm (mark a safe cell)
  const result2 = Game.confirmCellAsHazard(0, 0);
  assert.ok(result2, 'False alarm processed');
  assert.ok(!result2.isHazard, 'Was a false alarm');
});

test('Game: Lv3 sensor fusion', () => {
  Game.init(() => {});
  Game.setLevel(3);

  // A hazard cell should have votes
  const level = Game.getLevel(3);
  const hazard = level.hazards[0];
  const votes = Game.getCellSensorVotes(hazard.row, hazard.col);
  assert.ok(votes !== null, 'Votes exist for hazard cell');
  assert.ok(votes.confirmed, 'Hazard cell confirmed by fusion (≥2 sensors)');
  assert.gt(votes.agreeCount, 1, 'At least 2 sensors agree');

  // A safe cell
  const safeVotes = Game.getCellSensorVotes(0, 0);
  assert.ok(safeVotes !== null, 'Votes exist for safe cell');
  assert.ok(!safeVotes.confirmed, 'Safe cell not confirmed by fusion');
});

test('Game: Lv3 sensor fusion votes', () => {
  Game.init(() => {});
  Game.setLevel(3);

  const level = Game.getLevel(3);
  const votes = Game.getCellSensorVotes(level.hazards[0].row, level.hazards[0].col);
  assert.ok(votes !== null, 'Hazard cell has sensor votes');
  assert.ok(typeof votes.agreeCount === 'number', 'Agree count is number');
  assert.ok(typeof votes.signals === 'object', 'Signals object exists');
  assert.ok(votes.confirmed, 'Hazard cell confirmed by fusion');

  const safeVotes = Game.getCellSensorVotes(0, 0);
  assert.ok(safeVotes !== null, 'Safe cell has sensor votes');
  assert.ok(!safeVotes.confirmed, 'Safe cell not confirmed by fusion');
});

test('Game: Lv3 complete by confirming all hazards', () => {
  Game.init(() => {});
  Game.setLevel(3);

  const level = Game.getLevel(3);

  level.hazards.forEach(h => {
    Game.confirmFusedCell(h.row, h.col);
  });

  assert.ok(Game.isComplete(), 'Level complete after confirming all hazards');
  assert.equal(Game.getStars(), 3, 'Perfect score with no false alarms');
});

test('Game: level switching resets state', () => {
  Game.init(() => {});
  Game.setLevel(1);
  Game.debugAutoTrain();
  assert.ok(Game.isComplete(), 'Lv1 complete');

  Game.setLevel(2);
  assert.ok(!Game.isComplete(), 'Lv2 not complete after switch');
  assert.equal(Game.getSensitivity(), 1, 'Sensitivity reset to default');
  assert.equal(Game.getTokensRemaining(), Infinity, 'Tokens reset for Lv2 (no token cost)');
});

test('Game: star rating exists', () => {
  Game.init(() => {});
  Game.setLevel(1);
  Game.debugAutoTrain();
  const stars = Game.getStars();
  assert.gt(stars, 0, 'Stars > 0');
  assert.ok(stars <= 3, 'Stars <= 3');
});

test('Game: stats return correct shape', () => {
  Game.init(() => {});
  const stats = Game.getStats();
  assert.ok(typeof stats.totalHazardsFound === 'number', 'totalHazardsFound');
  assert.ok(typeof stats.accuracy === 'number', 'accuracy');
  assert.ok(typeof stats.falseAlarmCount === 'number', 'falseAlarmCount');
  assert.ok(typeof stats.missedHazardCount === 'number', 'missedHazardCount');
  assert.ok(typeof stats.totalTokensSpent === 'number', 'totalTokensSpent');
});

// ═══════════════════════════════════════════
console.log('\n═══════════════════════════════════');
console.log(`Tests: ${passed + failed} total`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log('═══════════════════════════════════\n');

process.exit(failed > 0 ? 1 : 0);
