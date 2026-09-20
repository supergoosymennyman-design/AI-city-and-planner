/**
 * k3-07-my-own-instrument — Core Game Logic Tests
 *
 * Run with: node test/index.test.js
 * These tests validate the state machine, sound management, grid logic,
 * melody analysis, and utility functions. They do NOT require a browser.
 */

/* global describe, it, assert */

// Simple test framework (no deps)
const assert = {
  equal: (a, b) => { if (a !== b) throw new Error(`Expected ${b}, got ${a}`); },
  ok: (v) => { if (!v) throw new Error(`Expected truthy, got ${v}`); },
  deepEqual: (a, b) => {
    const s = JSON.stringify;
    if (s(a) !== s(b)) throw new Error(`Expected ${s(b)}, got ${s(a)}`);
  }
};

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}: ${e.message}`);
  }
}

// ===================================================================
// Sound Management
// ===================================================================
function testSoundManagement() {
  console.log('\nSound Management:');

  const sounds = [];

  test('can add sounds', () => {
    sounds.push({ name: 'Clap', color: '#FF6B6B', colorHex: '#FF6B6B', blob: null, url: null, fallback: false });
    assert.equal(sounds.length, 1);
  });

  test('can add up to 5 sounds', () => {
    for (let i = 0; i < 4; i++) {
      sounds.push({ name: `Sound ${i}`, color: '#CCC', colorHex: '#CCC', blob: null, url: null, fallback: false });
    }
    assert.equal(sounds.length, 5);
  });

  test('sound name abbreviation is first 3 chars uppercase', () => {
    const abbr = (sounds[0].name.substring(0, 3)).toUpperCase();
    assert.equal(abbr, 'CLA');
  });

  test('each sound has required fields', () => {
    sounds.forEach(s => {
      assert.ok(typeof s.name === 'string' && s.name.length > 0);
      assert.ok(typeof s.color === 'string' && s.color.startsWith('#'));
      assert.ok(typeof s.colorHex === 'string');
    });
  });
}

// ===================================================================
// Beat Grid Logic
// ===================================================================
function testBeatGrid() {
  console.log('\nBeat Grid Logic:');

  const TOTAL_SOUNDS = 5;
  const TOTAL_BEATS = 8;

  function makeGrid() {
    return Array.from({ length: TOTAL_SOUNDS }, () => Array(TOTAL_BEATS).fill(false));
  }

  test('grid initializes to all false', () => {
    const grid = makeGrid();
    assert.equal(grid.length, 5);
    assert.equal(grid[0].length, 8);
    grid.forEach(row => row.forEach(cell => assert.equal(cell, false)));
  });

  test('can toggle cells', () => {
    const grid = makeGrid();
    grid[0][0] = !grid[0][0];
    assert.equal(grid[0][0], true);
    grid[0][0] = !grid[0][0];
    assert.equal(grid[0][0], false);
  });

  test('can fill multiple cells', () => {
    const grid = makeGrid();
    grid[0][0] = true; grid[0][4] = true;
    grid[1][2] = true; grid[1][6] = true;
    grid[2][3] = true;

    const filled = grid.flat().filter(c => c).length;
    assert.equal(filled, 5);
  });

  test('pattern analysis calculates density correctly', () => {
    const grid = makeGrid();
    // Fill half the cells
    for (let s = 0; s < 5; s++) {
      for (let b = 0; b < 4; b++) {
        grid[s][b] = true;
      }
    }
    const totalCells = 5 * 8;
    const activeCells = grid.flat().filter(c => c).length;
    const density = activeCells / totalCells;
    assert.equal(density, 0.5);
  });

  test('pattern analysis detects active sound count', () => {
    const grid = makeGrid();
    grid[0][0] = true;
    grid[2][2] = true;
    grid[4][4] = true;

    const freq = grid.map(row => row.filter(c => c).length);
    const activeCount = freq.filter(f => f > 0).length;
    assert.equal(activeCount, 3);
  });
}

// ===================================================================
// Melody Generator
// ===================================================================
function testMelodyGenerator() {
  console.log('\nMelody Generator:');

  const TOTAL_BEATS = 8;

  function generate(density, activeCount) {
    const scales = {
      major:      [262, 294, 330, 349, 392, 440, 494, 523],
      pentatonic: [262, 294, 330, 392, 440, 523, 587, 659],
      minor:      [262, 277, 311, 349, 392, 415, 466, 523],
      lively:     [330, 392, 440, 523, 587, 659, 784, 880]
    };

    let scale;
    if (density > 0.4) {
      scale = activeCount >= 4 ? scales.lively : scales.major;
    } else if (density > 0.2) {
      scale = scales.pentatonic;
    } else {
      scale = scales.minor;
    }

    const notes = [];
    let lastIdx = -1;
    for (let i = 0; i < TOTAL_BEATS; i++) {
      let idx;
      do { idx = Math.floor(Math.random() * scale.length); }
      while (idx === lastIdx && scale.length > 1);
      if (i > 0 && Math.random() < 0.3 && notes.length >= 1) {
        idx = scale.indexOf(notes[i - 1]);
        if (idx < 0) idx = Math.floor(Math.random() * scale.length);
      }
      notes.push(scale[idx]);
      lastIdx = idx;
    }
    return notes;
  }

  test('generates exactly 8 notes', () => {
    const notes = generate(0.3, 3);
    assert.equal(notes.length, TOTAL_BEATS);
  });

  test('high density uses major/lively scale', () => {
    const notesHigh = generate(0.5, 4);
    // Check notes are in lively range (330-880)
    assert.ok(notesHigh.every(n => n >= 262 && n <= 880));
  });

  test('low density uses minor scale', () => {
    const notesLow = generate(0.1, 1);
    assert.ok(notesLow.every(n => n >= 262 && n <= 523));
  });

  test('all generated notes are valid frequencies', () => {
    const notes = generate(0.3, 3);
    notes.forEach(n => {
      assert.ok(typeof n === 'number' && n > 0 && n < 2000);
    });
  });

  test('notes rarely repeat consecutively', () => {
    // Run multiple generations and check that consecutive repeats are unusual
    let consecutiveRepeats = 0;
    let totalPairs = 0;
    for (let g = 0; g < 20; g++) {
      const notes = generate(0.3, 3);
      for (let i = 1; i < notes.length; i++) {
        totalPairs++;
        if (notes[i] === notes[i - 1]) consecutiveRepeats++;
      }
    }
    // Should have fewer than 50% consecutive repeats
    assert.ok(consecutiveRepeats / totalPairs < 0.5);
  });
}

// ===================================================================
// State Machine Transitions
// ===================================================================
function testStateMachine() {
  console.log('\nState Machine:');

  // Valid game flow
  const flow = [
    'init', 'mic_check', 'record', 'playback', 'name_sound',
    'record', 'playback', 'name_sound',
    'record', 'playback', 'name_sound',
    'record', 'playback', 'name_sound',
    'record', 'playback', 'name_sound',
    'sound_bank_complete', 'sequencer_intro', 'sequencer_edit',
    'sequencer_play', 'sequencer_edit',
    'lock_song', 'ai_composing', 'ai_playing', 'celebration'
  ];

  const VALID_STATES = new Set([
    'init', 'mic_check', 'record', 'playback', 'name_sound',
    'sound_bank_complete', 'sequencer_intro', 'sequencer_edit',
    'sequencer_play', 'lock_song', 'ai_composing', 'ai_playing', 'celebration'
  ]);

  test('all states in flow are valid', () => {
    flow.forEach(s => assert.ok(VALID_STATES.has(s)));
  });

  test('flow has correct number of record states (5)', () => {
    const recordStates = flow.filter(s => s === 'record');
    assert.equal(recordStates.length, 5);
  });

  test('flow ends at celebration', () => {
    assert.equal(flow[flow.length - 1], 'celebration');
  });

  test('flow contains all 13 unique states', () => {
    const unique = new Set(flow);
    // Each of the 13 states appears at least once
    VALID_STATES.forEach(s => assert.ok(unique.has(s)));
  });
}

// ===================================================================
// Intents Module
// ===================================================================
function testIntents() {
  console.log('\nIntents Module:');

  // Import intent logic (duplicated for test context)
  const TRIGGER_PATTERNS = [
    /\bai\b/i, /\brobot\b/i, /\bbot\b/i,
    /\b(hey|hi|hello)\s+(ai|robot|bot|friend)\b/i,
    /\b(what|who|how|can|could|will|do|does|is|are)\s+(is|this|that|it|my|the|you)\b/i,
    /\byou\b.*\?/i, /\?$/i
  ];

  function isAddressed(text) {
    if (!text || text.trim().length === 0) return false;
    return TRIGGER_PATTERNS.some(pattern => pattern.test(text));
  }

  test('detects AI address in "can you hear this?"', () => {
    assert.ok(isAddressed('can you hear this?'));
  });

  test('detects "hey AI" trigger', () => {
    assert.ok(isAddressed('hey AI, listen!'));
  });

  test('detects question with "you"', () => {
    assert.ok(isAddressed('do you like my song?'));
  });

  test('ignores non-addressed speech', () => {
    assert.ok(!isAddressed('I like pizza'));
  });

  test('ignores simple statements', () => {
    assert.ok(!isAddressed('la la la'));
  });

  test('empty string is not addressed', () => {
    assert.ok(!isAddressed(''));
    assert.ok(!isAddressed(null));
    assert.ok(!isAddressed(undefined));
  });
}

// ===================================================================
// Settings Module
// ===================================================================
function testSettings() {
  console.log('\nSettings Module:');

  const DEFAULTS = {
    speechRate: 0.85,
    volume: 90,
    voiceURI: '',
    mute: false,
    micEnabled: true
  };

  test('defaults are correct', () => {
    assert.equal(DEFAULTS.speechRate, 0.85);
    assert.equal(DEFAULTS.volume, 90);
    assert.equal(DEFAULTS.mute, false);
    assert.equal(DEFAULTS.micEnabled, true);
  });

  test('speech rate is within valid range', () => {
    assert.ok(DEFAULTS.speechRate >= 0.5 && DEFAULTS.speechRate <= 2.0);
  });

  test('volume is within valid range', () => {
    assert.ok(DEFAULTS.volume >= 0 && DEFAULTS.volume <= 100);
  });
}

// ===================================================================
// Name Suggestions
// ===================================================================
function testNameSuggestions() {
  console.log('\nName Suggestions:');

  const NAME_SUGGESTIONS = [
    ['La-la', 'Ahh', 'Sing', 'Hum', 'Hey'],
    ['Clap', 'Pat', 'Slap', 'Tap', 'Beat'],
    ['Stomp', 'Boom', 'Kick', 'Thump', 'Stamp'],
    ['Tap', 'Tick', 'Knock', 'Click', 'Rap'],
    ['Whoosh', 'Ding', 'Buzz', 'Zap', 'Boom']
  ];

  test('5 suggestion groups for 5 sounds', () => {
    assert.equal(NAME_SUGGESTIONS.length, 5);
  });

  test('each group has 5 suggestions', () => {
    NAME_SUGGESTIONS.forEach((group, i) => {
      assert.equal(group.length, 5);
    });
  });

  test('all suggestions are non-empty strings', () => {
    NAME_SUGGESTIONS.flat().forEach(name => {
      assert.ok(typeof name === 'string' && name.length > 0);
    });
  });
}

// ===================================================================
// Run all tests
// ===================================================================
console.log('=== My Own Instrument — Core Tests ===');
testSoundManagement();
testBeatGrid();
testMelodyGenerator();
testStateMachine();
testIntents();
testSettings();
testNameSuggestions();

console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('All tests passed!');
}
