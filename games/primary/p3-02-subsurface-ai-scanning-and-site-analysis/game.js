/* ============================================================
   game.js — Core Game Logic & Level Data (v2)
   Subsurface Signal Decoder (P3, Age 8)
   v2: 5-level AI teaching arc — supervised learning, sensitivity
   tradeoff, noise robustness, sensor fusion, human-in-the-loop.
   Transparent in-browser "model" via Classifier + Sensors modules.
   ============================================================ */

const Game = (() => {
  'use strict';

  // ── Helper: deterministic random per-cell ──
  function cellRand(row, col, seed) {
    let s = row * 131 + col * 97 + seed * 37;
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return (s & 0xffff) / 0x10000;
  }

  // ── Level Definitions (v2) ──
  const LEVELS = [
    null,

    // ═══════ Level 1: Teach Nova — Supervised Learning ═══════
    {
      id: 1,
      name: 'Teach Nova',
      objective: '📋 TAP ? cells → read the signal bar → label Safe or Hazard. 🎓 AI Lesson: Supervised learning — AI learns from labeled examples.',
      gridRows: 6,
      gridCols: 6,
      maxTokens: Infinity, // Free teaching
      aiArcLabel: 'Nova knows nothing',
      useSensors: false,
      signalType: 'training',

      // Cell amplitudes (ground truth) — top-left at (0,0) to bottom-right
      // Amplitude range: ~10-30 = safe, ~55-85 = hazard
      // Designed so 4 samples create an imperfect threshold
      cellAmplitudes: null, // Generated at init time

      // Training samples to show first (row, col pairs)
      trainingSamples: [
        { row: 0, col: 1, amplitude: 18, trueLabel: 'safe' },
        { row: 1, col: 4, amplitude: 24, trueLabel: 'safe' },
        { row: 3, col: 2, amplitude: 68, trueLabel: 'hazard' },
        { row: 4, col: 5, amplitude: 74, trueLabel: 'hazard' },
      ],

      // True hazard cells (row, col) — for ground truth
      hazards: [
        { row: 3, col: 2 }, { row: 4, col: 5 },
        { row: 1, col: 3 }, { row: 2, col: 4 },
        { row: 5, col: 1 }
      ],

      // Expected misclassified cells with only 4 training samples
      // (borderline safe cells with amplitude > T will show as "Nova Error")
      expectedErrors: [
        // Trap cells: safe cells deliberately set above expected T≈52
        // so Nova misclassifies them as hazard on first pass
      ],

      // Trap cells: safe cells with amplitudes forced above T to guarantee
      // the "AI gets it wrong → kid corrects" teaching beat
      trapCells: [
        { row: 0, col: 3, amp: 56 },
        { row: 2, col: 0, amp: 54 },
      ],

      antiFrustrationLimit: 3
    },

    // ═══════ Level 2: Tune the Sensitivity — Precision/Recall ═══════
    {
      id: 2,
      name: 'Tune the Sensitivity',
      objective: '📋 Slide the sensitivity dial until all hazards show as ▲ with minimal false alarms! 🎓 AI Lesson: Precision vs Recall — no perfect setting exists.',
      gridRows: 8,
      gridCols: 8,
      maxTokens: 14,
      defaultSensitivity: 5,
      sensitivityStep: 4,
      useSensors: false,
      signalType: 'sensitivity',
      noiseLevel: 0.06,

      hazards: [
        { row: 1, col: 2 }, { row: 2, col: 5 },
        { row: 4, col: 3 }, { row: 5, col: 0 },
        { row: 6, col: 7 }, { row: 3, col: 6 }
      ],

      baseT: 48,
      cellAmplitudes: null,
      noiseRise: 1.5,
      antiFrustrationLimit: 3,
      sensitivityMax: 12
    },

    // ═══════ Level 4: Fuse the Sensors — Sensor Fusion ═══════
    {
      id: 3,
      name: 'Fuse the Sensors',
      objective: '📋 3 sensors per cell! Only confirm when 2+ say "hazard." 🎓 AI Lesson: Sensor fusion — multiple sensors together beat any single one.',
      gridRows: 6,
      gridCols: 6,
      maxTokens: 14,
      useSensors: true,
      signalType: 'fusion',

      // 6 hazards with varied sensor counts (some 2-sensor, some 3-sensor)
      hazards: [
        { row: 1, col: 2, type: 'pipe' },
        { row: 2, col: 5, type: 'plastic_pipe' },
        { row: 4, col: 1, type: 'void' },
        { row: 3, col: 4, type: 'cable' },
        { row: 5, col: 5, type: 'mixed' },
        { row: 0, col: 3, type: 'mixed' },
      ],
      noisySafeCells: [ { row: 2, col: 3 }, { row: 5, col: 0 } ],

      sensorConfig: {
        sensors: ['seismic', 'gpr', 'em'],
        useFusion: true,
        useStealthy: true,
        noiseMultiplier: 0.8,
        thresholds: { seismic: 42, gpr: 40, em: 38 }
      },

      cellSensorData: null,

      antiFrustrationLimit: 3
    },

    // ═══════ Level 4: AI Learns to Decide (Sensor Fusion + Sensitivity) ═══════
    {
      id: 4, name: 'AI Learns to Decide',
      objective: '📋 Adjust sensitivity to see which cells have 2+ sensors active. Only confirm when 2+ agree! 🎓 AI Lesson: Human-in-the-loop means checking AI\'s work — knowing when the evidence is strong enough.',
      gridRows: 6, gridCols: 6,
      maxTokens: 12,
      useSensors: true,
      signalType: 'fusion',
      defaultSensitivity: 5,
      sensitivityStep: 4,

      hazards: [
        { row: 1, col: 2, type: 'pipe' },
        { row: 2, col: 5, type: 'plastic_pipe' },
        { row: 4, col: 1, type: 'void' },
        { row: 3, col: 4, type: 'cable' },
        { row: 5, col: 5, type: 'mixed' },
        { row: 0, col: 3, type: 'mixed' },
      ],
      noisySafeCells: [
        { row: 2, col: 3 }, { row: 5, col: 0 },
        { row: 1, col: 5 }, { row: 4, col: 4 }
      ],

      sensorConfig: {
        sensors: ['seismic', 'gpr', 'em'],
        useFusion: true,
        useStealthy: true,
        noiseMultiplier: 0.8,
        thresholds: { seismic: 42, gpr: 40, em: 38 },
        adjustable: true
      },
      cellSensorData: null,
      antiFrustrationLimit: 3,
    },

    // ═══════ Level 5: Nova Goes Solo — Autonomous Demo ═══════
    {
      id: 5, name: 'Nova Goes Solo',
      objective: '📋 Watch Nova survey land all by itself! 🎓 AI Lesson: Autonomous deployment — a trained AI operates independently.',
      gridRows: 6, gridCols: 6,
      maxTokens: Infinity,
      useSensors: false,
      signalType: 'demo',
      isDemo: true,
      cellAmplitudes: null,
      hazards: [
        { row: 1, col: 0 }, { row: 1, col: 4 },
        { row: 2, col: 2 }, { row: 3, col: 5 },
        { row: 4, col: 1 }, { row: 5, col: 3 },
      ],
      demoThreshold: 46,
      antiFrustrationLimit: 3,
    },

    // ═══════ Level 6: Nova's Final Exam — AI Concept Challenge ═══════
    {
      id: 6, name: 'Nova\'s Final Exam',
      objective: '📋 8 AI concept challenges. Pick the right approach for each crisis! 🎓 AI Lesson: All AI concepts together — supervised learning, precision/recall, sensor fusion, human-in-the-loop, autonomy, optimization, anomaly detection, and fairness.',
      gridRows: 6, gridCols: 6,
      maxTokens: Infinity,
      useSensors: false,
      signalType: 'exam',
      isFinalExam: true,
      hazards: [],
      cellAmplitudes: null,
      antiFrustrationLimit: 3,
      rounds: [
        {
          concept: 'Supervised Learning', emoji: '📚',
          question: 'Nova is deployed to a new mining site. She has never seen this type of rock before. What should happen first?',
          choices: [
            { text: 'Show Nova labeled examples of safe and hazardous rock', correct: true },
            { text: 'Let Nova survey autonomously — she already trained', correct: false },
            { text: "Adjust Nova's sensitivity dial", correct: false },
            { text: 'Deploy all 3 sensors at once', correct: false },
          ],
          explanation: 'Supervised learning means showing the AI labeled examples first. Like a student needs to study before the test — Nova needs training data for new environments before she can survey on her own.'
        },
        {
          concept: 'Precision & Recall', emoji: '🎯',
          question: "Nova's hazard detection is causing too many false alarms. The crew is wasting time drilling empty holes. What should you adjust?",
          choices: [
            { text: 'Add more sensors to get better data', correct: false },
            { text: 'Retrain Nova from scratch', correct: false },
            { text: 'Ignore the false alarms — better safe than sorry', correct: false },
            { text: 'Lower the sensitivity — catch fewer false alarms', correct: true },
          ],
          explanation: 'Lowering sensitivity means fewer false alarms (better precision), but you might miss some real hazards (worse recall). It\'s a tradeoff — like turning down a smoke alarm so it stops going off from cooking, but it might miss a real fire.'
        },
        {
          concept: 'Sensor Fusion', emoji: '🔬',
          question: 'Seismic says "hazard," GPR says "clear," EM says "hazard." Two out of three sensors agree. What should Nova conclude?',
          choices: [
            { text: 'Trust GPR — it\'s the most reliable sensor', correct: false },
            { text: 'Trust the majority — 2 of 3 sensors agree', correct: true },
            { text: 'Call it uncertain and require human review', correct: false },
            { text: 'Average all 3 readings and check again', correct: false },
          ],
          explanation: 'Sensor fusion works like three friends looking for a lost toy. If two say under the bed and one says in the closet, you trust the two who agree. When 2+ sensors detect a hazard, it\'s confirmed.'
        },
        {
          concept: 'Human-in-the-loop', emoji: '👤',
          question: 'Nova auto-classified a site as 100% safe. But Nova was trained on only 4 samples and you notice a suspicious area. What should you do?',
          choices: [
            { text: 'Trust Nova — she processed all cells automatically', correct: false },
            { text: 'Retrain Nova on the entire site again', correct: false },
            { text: 'Review the uncertain cells and override if needed', correct: true },
            { text: 'Reduce sensitivity to catch more hazards', correct: false },
          ],
          explanation: 'Human-in-the-loop means AI handles the easy cases, but humans check the hard ones. Like a teacher grading tests — the computer marks multiple-choice questions, but the teacher reads the essays. Together, AI + human is safer than either alone.'
        },
        {
          concept: 'Autonomous AI', emoji: '🤖',
          question: "After 5 successful surveys, Nova's accuracy is 97%. The city council wants Nova to certify a new building site without human oversight. What's the right call?",
          choices: [
            { text: 'Let Nova work autonomously — she has proven her accuracy', correct: true },
            { text: 'Require a human to check every single cell', correct: false },
            { text: 'Send Nova back for more training', correct: false },
            { text: 'Only let Nova work with all 3 sensors disabled', correct: false },
          ],
          explanation: 'Once an AI has proven its accuracy through testing, it can operate autonomously — like a pilot after enough flight hours. Nova can handle routine surveys alone, but humans still supervise from afar.'
        },
        {
          concept: 'Optimization', emoji: '⚡',
          question: 'The power grid is overloaded during a heatwave. Nova can adjust three things: hospital power, residential power, and AI computing. She only has 5 minutes. What approach should she use?',
          choices: [
            { text: 'Cut power to everything except the hospital', correct: false },
            { text: 'Wait for a human operator to decide', correct: false },
            { text: 'Try hundreds of combinations fast and pick the best', correct: true },
            { text: 'Shut down the grid completely to prevent damage', correct: false },
          ],
          explanation: 'Optimization is like trying every seat on a bus to find the most comfortable one — but a million times faster. AI can test thousands of power distribution plans in seconds and pick the one that keeps hospitals running while minimizing blackouts.'
        },
        {
          concept: 'Anomaly Detection', emoji: '💻',
          question: "Nova's traffic monitoring system shows one intersection with suddenly zero cars at rush hour. All neighboring intersections are jammed. What's most likely?",
          choices: [
            { text: 'Everyone decided to stay home today', correct: false },
            { text: 'The sensor at that intersection broke', correct: false },
            { text: "It\'s a holiday in that neighborhood", correct: false },
            { text: 'Traffic light is hacked or malfunctioning', correct: true },
          ],
          explanation: "Anomaly detection spots patterns that don't fit — like noticing one kid in class suddenly wearing pyjamas. Zero cars at rush hour is so unusual that it's likely a problem, not a coincidence. AI flags it for immediate investigation."
        },
        {
          concept: 'Fairness & Bias', emoji: '⚖️',
          question: "Nova's route planning AI recommends fewer bus stops in low-income neighborhoods because those routes have slightly lower historical ridership. Is this fair?",
          choices: [
            { text: 'Yes — AI uses data, data doesn\'t lie', correct: false },
            { text: 'No — the AI is amplifying existing inequality', correct: true },
            { text: 'Yes — fewer riders means less need for stops', correct: false },
            { text: 'No — but it\'s the most efficient solution', correct: false },
          ],
          explanation: 'AI can learn and amplify historical biases. If low-income neighborhoods had fewer bus stops in the past, the AI might recommend even fewer — making inequality worse. Fairness auditing means checking: is this decision treating everyone fairly?'
        },
      ]
    },
  ];

  // ── State ──
  let currentLevel = 1;
  let levelComplete = false;
  let hasConfirmed = false;

  // Undo support — snapshots of last action
  let lastSnapshot = null;
  const SNAPSHOT_KEYS = [
    'tokensRemaining', 'totalTokensSpent', 'falseAlarmCount', 'missedHazardCount',
    'totalHazardsFound', 'correctMarks', 'wrongMarks', 'levelComplete', 'hasConfirmed',
    'trainingPhase', 'trainingLabels', 'cellsConfirmedHazard', 'cellsConfirmedSafe',
    'approvedCells', 'correctedCells', 'collapseTriggered', 'collapsedCell',
    'uncertainCells', 'selectedCell',
  ];

  // Lv1 state
  let trainingLabels = [];    // [{row, col, amplitude, label}, ...]
  let learnedT = null;        // Threshold from training
  let autoClassifications = {}; // cellKey -> 'hazard'|'safe' from Nova
  let trainingPhase = 'collecting'; // 'collecting'|'reviewing'|'correcting'|'confirmed'
  let trainingRound = 0;
  let wrongAttempts = 0;
  let samplesToShow = [];     // Which samples visible for labeling

  // Lv2 state
  let sensitivity = 5;        // 1-9
  let effectiveT = null;      // Computed from base + sensitivity
  let subRound = 1;           // 1 or 2
  let lv2Classification = {}; // Nova's classification at current sensitivity
  let cellsConfirmedHazard = []; // Kid-confirmed hazard cells
  let cellsConfirmedSafe = [];   // Kid-confirmed safe cells

  // Lv3 state
  let retrainCell = null;     // Cell being retrained

  // Lv6 exam result
  let examResult = null;

  // Lv4 state
  let activeSensor = 0;       // 0=seismic, 1=gpr, 2=em (which is front)
  let cellSensorVotes = {};   // cellKey -> {seismic:bool, gpr:bool, em:bool, confirmed:bool}
  let perSensorThresholds = { seismic: 42, gpr: 40, em: 38 };

  // Lv5 state
  let novaSurvey = {};        // cellKey -> {classification, confidence, autoHandled}
  let uncertainCells = [];    // Cells routed to kid
  let approvedCells = [];     // Kid-approved hazard cells
  let correctedCells = [];    // Kid-corrected cells
  let collapseTriggered = false;
  let collapsedCell = null;
  let lv5AllAutoSafe = false; // True when Nova auto-clears everything but missed real hazards

  // Shared
  let selectedCell = null;
  let tokensRemaining = 0;
  let totalTokensSpent = 0;
  let falseAlarmCount = 0;
  let missedHazardCount = 0;
  let totalHazardsFound = 0;
  let totalScansUsed = 0;
  let carryOverT = null; // Cosmetic carry-over from Lv1

  // Stats
  let correctMarks = 0;
  let wrongMarks = 0;

  // Callbacks
  let onStateChange = null;

  // ── Helpers ──
  function cellKey(row, col) { return `${row},${col}`; }

  function parseKey(key) {
    const parts = key.split(',');
    return { row: parseInt(parts[0], 10), col: parseInt(parts[1], 10) };
  }

  function getLevel(levelNum) { return LEVELS[levelNum] || null; }
  function getCurrentLevel() { return LEVELS[currentLevel]; }
  function getCurrentLevelNum() { return currentLevel; }

  function setLevel(levelNum) {
    if (levelNum >= 1 && levelNum <= 6) {
      // Persist the kid's trained threshold across level switches.
      // Only update carryOverT if learnedT is available (kid retrained);
      // otherwise keep the existing carryOverT so Lv5 always has it.
      if (learnedT && learnedT.T !== undefined) {
        carryOverT = learnedT.T;
      }
      // Never nullify carryOverT — it persists until explicitly re-trained
      currentLevel = levelNum;
      resetLevel(levelNum);
    }
  }

  // ── Generate cell amplitudes for non-sensor levels ──
  function generateAmplitudes(level) {
    const amps = [];
    const hazards = new Set(level.hazards.map(h => cellKey(h.row, h.col)));

    for (let r = 0; r < level.gridRows; r++) {
      amps[r] = [];
      for (let c = 0; c < level.gridCols; c++) {
        const key = cellKey(r, c);
        if (hazards.has(key)) {
          // Hazard amplitude: 55-85
          amps[r][c] = 55 + cellRand(r, c, level.id * 7) * 30;
        } else {
          // Safe amplitude: 10-35
          amps[r][c] = 10 + cellRand(r, c, level.id * 13) * 25;
        }
      }
    }
    return amps;
  }

  // ── Generate borderline amplitudes for Lv1 (creates imperfect threshold) ──
  // KEY DESIGN: The training samples produce T ≈ 50-55.
  // Borderline safe cells randomly straddle T, PLUS explicit "trap cells"
  // (safe cells with amplitude just above T) guarantee 1–2 Nova errors.
  // This creates the "AI gets it wrong → kid teaches → AI learns" beat.
  function generateBorderlineAmplitudes(level) {
    const amps = [];
    const hazards = new Set(level.hazards.map(h => cellKey(h.row, h.col)));
    const trapCells = new Map();
    if (level.trapCells) {
      level.trapCells.forEach(t => trapCells.set(cellKey(t.row, t.col), t.amp));
    }

    for (let r = 0; r < level.gridRows; r++) {
      amps[r] = [];
      for (let c = 0; c < level.gridCols; c++) {
        const key = cellKey(r, c);
        const rand = cellRand(r, c, level.id * 7);

        if (hazards.has(key)) {
          // Hazard: 60-85 (well above T, clearly hazard)
          amps[r][c] = 60 + rand * 25;
        } else if (trapCells.has(key)) {
          // Explicit trap cell — safe ground but amplitude above T, forcing Nova error
          amps[r][c] = trapCells.get(key);
        } else {
          // Safe: mostly 10-28, but ~15% are borderline (~38–56) straddling T
          const r2 = cellRand(r, c, level.id * 19);
          if (r2 < 0.18) {
            // Borderline safe cells: 38–56
            // About half below T and half above T, creating natural errors
            amps[r][c] = 38 + rand * 18;
          } else {
            amps[r][c] = 10 + rand * 18;
          }
        }
      }
    }
    return amps;
  }

  // ── Generate Lv2 cell amplitudes (designed for sensitivity tradeoff) ──
  function generateSensitivityAmplitudes(level) {
    const amps = [];
    const hazards = new Set(level.hazards.map(h => cellKey(h.row, h.col)));

    for (let r = 0; r < level.gridRows; r++) {
      amps[r] = [];
      for (let c = 0; c < level.gridCols; c++) {
        const rand = cellRand(r, c, level.id * 7);
        if (hazards.has(cellKey(r, c))) {
          // Real hazards: 44-78 (lowest at 44 to leave a gap from safe cells)
          amps[r][c] = 44 + rand * 34;
        } else {
          // Safe cells: 10-40 (max 40 to leave a gap from hazards)
          amps[r][c] = 10 + rand * 30;
        }
      }
    }
    return amps;
  }

  // ── Generate Lv6 demo amplitudes (clear separation for visual demo) ──
  function generateDemoAmplitudes(level) {
    const amps = [];
    const hazards = new Set(level.hazards.map(h => cellKey(h.row, h.col)));
    const threshold = level.demoThreshold || 46;

    for (let r = 0; r < level.gridRows; r++) {
      amps[r] = [];
      for (let c = 0; c < level.gridCols; c++) {
        const rand = cellRand(r, c, 999 + level.id * 7);
        if (hazards.has(cellKey(r, c))) {
          // Hazards: clearly ABOVE threshold (60-85)
          amps[r][c] = 60 + rand * 25;
        } else {
          // Safe: clearly BELOW threshold (10-35)
          amps[r][c] = 10 + rand * 25;
        }
      }
    }
    return amps;
  }

  // ── Generate Lv3 cell amplitudes (hard SNR) ──
  // ── Initialization ──
  function init(callback) {
    onStateChange = callback;
    carryOverT = null; // Fresh start — no prior training
    resetLevel(1);
  }

  function resetLevel(levelNum) {
    const level = LEVELS[levelNum] || LEVELS[currentLevel];
    currentLevel = level.id;
    levelComplete = false;
    hasConfirmed = false;
    selectedCell = null;
    lastSnapshot = null; // Clear undo history on level reset

    trainingLabels = [];
    learnedT = null;
    autoClassifications = {};
    trainingPhase = 'collecting';
    trainingRound = 0;
    wrongAttempts = 0;

    sensitivity = level.defaultSensitivity || 5;
    effectiveT = null;
    subRound = 1;
    lv2Classification = {};
    cellsConfirmedHazard = [];
    cellsConfirmedSafe = [];
    retrainCell = null;

    activeSensor = 0;
    cellSensorVotes = {};
    perSensorThresholds = level.sensorConfig
      ? { ...level.sensorConfig.thresholds }
      : { seismic: 42, gpr: 40, em: 38 };

    novaSurvey = {};
    uncertainCells = [];
    approvedCells = [];
    correctedCells = [];
    collapseTriggered = false;
    collapsedCell = null;
    lv5AllAutoSafe = false;

    tokensRemaining = level.maxTokens || 0;
    totalTokensSpent = 0;
    falseAlarmCount = 0;
    missedHazardCount = 0;
    correctMarks = 0;
    wrongMarks = 0;
    totalScansUsed = 0;

    // Generate cell amplitudes for non-sensor levels
    if (!level.useSensors) {
      if (levelNum === 1) {
        level.cellAmplitudes = generateBorderlineAmplitudes(level);
      } else if (levelNum === 2) {
        level.cellAmplitudes = generateSensitivityAmplitudes(level);
      } else if (levelNum === 5) {
        // Demo level: clear separation for easy visual demonstration
        level.cellAmplitudes = generateDemoAmplitudes(level);
      } else {
        level.cellAmplitudes = generateAmplitudes(level);
      }
    } else {
      // Generate sensor data grid
      // Attach noisy safe cells to config for sensor generator
      const sensorConfig = { ...level.sensorConfig };
      if (level.noisySafeCells) {
        sensorConfig._noisySafeCells = level.noisySafeCells;
      }
      level.cellSensorData = Sensors.generateGrid(
        level.gridRows, level.gridCols,
        level.hazards,
        sensorConfig
      );
    }

    // Lv1: set up training samples
    if (levelNum === 1) {
      samplesToShow = [...level.trainingSamples];
      trainingPhase = 'collecting';
    }

    // Lv2: compute pre-trained effectiveT
    if (levelNum === 2 && level.baseT) {
      effectiveT = Classifier.sensitivityThreshold(
        level.baseT, sensitivity, level.sensitivityStep || 6
      );
      computeLv2Classifications();
    }

    // Lv3 (Sensor Fusion): compute per-cell sensor votes
    if (levelNum === 3 && level.cellSensorData) {
      computeLv4Votes();
    }

    // Lv4 (HITL): compute Nova's auto-survey
    if (levelNum === 4 && level.cellSensorData) {
      computeLv5NovaSurvey();
      // If there are no uncertain cells and no auto-missed hazards, auto-complete
      if (uncertainCells.length === 0 && !lv5AllAutoSafe) {
        levelComplete = true;
        hasConfirmed = true;
      }
    }

    notify();
  }

  // ── Lv1: Training Logic ──
  function getTrainingSamples() {
    return [...samplesToShow];
  }

  function getTrainingPhase() {
    return trainingPhase;
  }

  function addLabel(row, col, label) {
    const level = getCurrentLevel();
    if (!level || level.id !== 1 || trainingPhase === 'confirmed') return null;
    saveSnapshot(); // Record state before action

    const amp = level.cellAmplitudes[row][col];

    // ── Validate against the Danger Line ──
    // The chart shows the Danger Line at ~42. Kids visually compare the bar:
    // Bar above the line = Hazard, bar below the line = Safe.
    const REF_DANGER = 42;
    const correctLabel = amp >= REF_DANGER ? 'hazard' : 'safe';
    if (label !== correctLabel) {
      // Wrong label — don't add to training, increment wrong attempts
      wrongAttempts++;
      notify();
      return { incorrect: true, correctLabel, amplitude: amp, wrongAttempts };
    }

    // Check if already labeled
    const existing = trainingLabels.find(l => l.row === row && l.col === col);
    if (existing) {
      existing.label = label;
    } else {
      trainingLabels.push({ row, col, amplitude: amp, label });
    }

    // Reset wrong attempts on a correct label
    wrongAttempts = 0;

    // Remove from samples to show (stops glowing after labeling)
    samplesToShow = samplesToShow.filter(s => s.row !== row || s.col !== col);

    // Train Nova when we have enough labels (re-train on EVERY label after threshold)
    if (trainingLabels.length >= 4) {
      trainNova();
      if (checkAllCorrect()) {
        trainingPhase = 'confirmed';
      } else if (trainingPhase === 'collecting') {
        trainingPhase = 'reviewing';
      }
    }

    notify();
    return { labelsCount: trainingLabels.length, phase: trainingPhase };
  }

  function trainNova() {
    const result = Classifier.learnThreshold(
      trainingLabels.map(l => ({ amplitude: l.amplitude, label: l.label }))
    );
    learnedT = result;

    // Classify all cells
    const level = getCurrentLevel();
    autoClassifications = {};
    for (let r = 0; r < level.gridRows; r++) {
      for (let c = 0; c < level.gridCols; c++) {
        const key = cellKey(r, c);
        const amp = level.cellAmplitudes[r][c];
        autoClassifications[key] = Classifier.classify(amp, result.T);
      }
    }
    carryOverT = result.T;
    notify();
  }

  function getLearnedThreshold() {
    return learnedT;
  }

  function getAutoClassification(row, col) {
    return autoClassifications[cellKey(row, col)] || null;
  }

  function isAutoCorrect(row, col) {
    const level = getCurrentLevel();
    if (!level) return null;
    const key = cellKey(row, col);
    const isHazard = level.hazards.some(h => h.row === row && h.col === col);
    const classified = autoClassifications[key];
    if (!classified) return null;
    return (classified === 'hazard') === isHazard;
  }

  function correctCell(row, col) {
    if (trainingPhase !== 'reviewing' && trainingPhase !== 'correcting') return null;
    const level = getCurrentLevel();
    if (!level || level.id !== 1) return null;
    saveSnapshot();

    const correct = isAutoCorrect(row, col);
    if (correct === true) {
      wrongAttempts++;
      // Anti-frustration: after 3 wrong attempts, auto-reveal the correct answer
      if (wrongAttempts >= level.antiFrustrationLimit) {
        return { alreadyCorrect: true, wrongAttempts, revealNeeded: true };
      }
      return { alreadyCorrect: true, wrongAttempts };
    }

    // This cell was wrong — add corrective label
    const amp = level.cellAmplitudes[row][col];
    const trueIsHazard = level.hazards.some(h => h.row === row && h.col === col);
    const correctLabel = trueIsHazard ? 'hazard' : 'safe';

    trainingLabels.push({ row, col, amplitude: amp, label: correctLabel });
    trainingPhase = 'correcting';
    trainNova();

    // Check if all cells are now correct
    const allCorrect = checkAllCorrect();
    if (allCorrect) {
      trainingPhase = 'confirmed';
    }

    notify();
    return { trained: true, allCorrect };
  }

  function checkAllCorrect() {
    const level = getCurrentLevel();
    if (!level) return false;
    for (let r = 0; r < level.gridRows; r++) {
      for (let c = 0; c < level.gridCols; c++) {
        const key = cellKey(r, c);
        const isHazard = level.hazards.some(h => h.row === r && h.col === c);
        const classified = autoClassifications[key];
        if (!classified) return false;
        if ((classified === 'hazard') !== isHazard) return false;
      }
    }
    return true;
  }

  function confirmLv1() {
    if (trainingPhase === 'confirmed' || checkAllCorrect()) {
      trainingPhase = 'confirmed';
      levelComplete = true;
      hasConfirmed = true;
      totalHazardsFound += getCurrentLevel().hazards.length;
      notify();
      return true;
    }
    return false;
  }

  function forceConfirmLv1() {
    // Allow submitting teaching even if some cells are wrong
    trainingPhase = 'confirmed';
    levelComplete = true;
    hasConfirmed = true;
    // Count how many hazards were correctly identified (used for stars)
    const level = getCurrentLevel();
    let correctHazards = 0;
    for (let r = 0; r < level.gridRows; r++) {
      for (let c = 0; c < level.gridCols; c++) {
        const key = cellKey(r, c);
        const isHazard = level.hazards.some(h => h.row === r && h.col === c);
        const classified = autoClassifications[key];
        // Count correct classifications
        if (classified === 'hazard' && isHazard) correctHazards++;
        if (classified === 'safe' && !isHazard) correctHazards++;
      }
    }
    totalHazardsFound += correctHazards;
    notify();
    return true;
  }

  function getWrongAttempts() { return wrongAttempts; }
  function incrementWrongAttempts() { wrongAttempts++; }
  function getAntiFrustrationLimit() {
    const level = getCurrentLevel();
    return level ? (level.antiFrustrationLimit || 3) : 3;
  }

  // ── Lv2: Sensitivity Logic ──
  function getSensitivity() { return sensitivity; }

  function setSensitivity(val) {
    const level = getCurrentLevel();
    if (!level || level.id !== 2) return;
    sensitivity = Math.max(1, Math.min(level.sensitivityMax || 9, val));
    effectiveT = Classifier.sensitivityThreshold(
      level.baseT, sensitivity, level.sensitivityStep || 6
    );
    computeLv2Classifications();
    notify();
  }

  function confirmSensitivity() {
    const level = getCurrentLevel();
    if (!level || level.id !== 2 || levelComplete) return null;
    saveSnapshot();
    const allHazardsCaught = level.hazards.every(h => {
      return lv2Classification[cellKey(h.row, h.col)] === 'hazard';
    });
    falseAlarmCount = 0;
    const hazardsSet = new Set(level.hazards.map(h => cellKey(h.row, h.col)));
    for (let r = 0; r < level.gridRows; r++) {
      for (let c = 0; c < level.gridCols; c++) {
        const key = cellKey(r, c);
        if (!hazardsSet.has(key) && lv2Classification[key] === 'hazard') {
          falseAlarmCount++;
        }
      }
    }
    notify();
    return { allHazardsCaught, falseAlarms: falseAlarmCount };
  }

  function computeLv2Classifications() {
    const level = getCurrentLevel();
    if (!level || !level.cellAmplitudes) return;
    lv2Classification = {};
    for (let r = 0; r < level.gridRows; r++) {
      for (let c = 0; c < level.gridCols; c++) {
        const key = cellKey(r, c);
        const amp = level.cellAmplitudes[r][c];
        lv2Classification[key] = Classifier.classify(amp, effectiveT);
      }
    }
  }

  function getLv2Classification(row, col) {
    return lv2Classification[cellKey(row, col)] || null;
  }

  function getEffectiveThreshold() { return effectiveT; }

  function getTokensRemaining() { return tokensRemaining; }
  function getTokensSpent() { return totalTokensSpent; }

  function getLv2Metrics() {
    const level = getCurrentLevel();
    if (!level) return { hazardsCaught: 0, falseAlarms: 0, totalHazards: 0 };

    const hazardsCaught = level.hazards.filter(h => {
      const key = cellKey(h.row, h.col);
      return lv2Classification[key] === 'hazard';
    }).length;

    const hazardsSet = new Set(level.hazards.map(h => cellKey(h.row, h.col)));
    let falseAlarms = 0;
    for (let r = 0; r < level.gridRows; r++) {
      for (let c = 0; c < level.gridCols; c++) {
        const key = cellKey(r, c);
        if (!hazardsSet.has(key) && lv2Classification[key] === 'hazard') {
          falseAlarms++;
        }
      }
    }

    return {
      hazardsCaught,
      falseAlarms,
      totalHazards: level.hazards.length,
      totalClassifications: Object.keys(lv2Classification).length
    };
  }

  function confirmCellAsHazard(row, col) {
    const level = getCurrentLevel();
    if (!level || levelComplete || hasConfirmed) return null;
    saveSnapshot();

    const key = cellKey(row, col);
    if (cellsConfirmedHazard.includes(key)) return { alreadyConfirmed: true };

    const isHazard = level.hazards.some(h => h.row === row && h.col === col);

    if (isHazard) {
      cellsConfirmedHazard.push(key);
      if (level.id >= 2 && level.maxTokens < Infinity) {
        tokensRemaining = Math.max(0, tokensRemaining - 1);
        totalTokensSpent++;
      }
      correctMarks++;
      totalHazardsFound++;
    } else {
      // False alarm
      if (level.maxTokens < Infinity) {
        tokensRemaining = Math.max(0, tokensRemaining - 1);
        totalTokensSpent++;
      }
      falseAlarmCount++;
      wrongMarks++;
      cellsConfirmedHazard.push(key);
    }

    checkLv2Complete();
    notify();
    return { isHazard, tokensRemaining };
  }

  function checkLv2Complete() {
    const level = getCurrentLevel();
    if (!level) return;

    const allHazardsFound = level.hazards.every(h =>
      cellsConfirmedHazard.includes(cellKey(h.row, h.col))
    );

    if (allHazardsFound && tokensRemaining >= 0) {
      levelComplete = true;
      hasConfirmed = true;
    }
  }

  // ── Lv3: Noise Logic ──
  function getRetrainedThreshold() { return effectiveT || (learnedT ? learnedT.T : null); }

  // ── Lv4: Sensor Fusion Logic ──
  function computeLv4Votes() {
    const level = getCurrentLevel();
    if (!level || !level.cellSensorData) return;

    cellSensorVotes = {};
    const sensorIds = level.sensorConfig.sensors;

    for (let r = 0; r < level.gridRows; r++) {
      for (let c = 0; c < level.gridCols; c++) {
        const key = cellKey(r, c);
        const signals = level.cellSensorData[r][c];
        const votes = {};

        sensorIds.forEach(sid => {
          votes[sid] = Classifier.sensorVote(signals[sid], perSensorThresholds[sid]);
        });

        const fusion = Classifier.fuseVotes(
          sensorIds.map(sid => ({ sensorId: sid, vote: votes[sid] }))
        );

        cellSensorVotes[key] = {
          votes,
          agreeCount: fusion.agreeCount,
          confirmed: fusion.confirmed,
          signals
        };
      }
    }
  }

  function getCellSensorVotes(row, col) {
    return cellSensorVotes[cellKey(row, col)] || null;
  }

  function getActiveSensor() { return activeSensor; }
  function setActiveSensor(idx) {
    activeSensor = Math.max(0, Math.min(2, idx));
    notify();
  }

  function getSensorSignals(row, col) {
    const level = getCurrentLevel();
    if (!level || !level.cellSensorData) return null;
    const data = level.cellSensorData[row];
    if (!data || !data[col]) return null;
    return data[col];
  }

  function confirmFusedCell(row, col) {
    const level = getCurrentLevel();
    if (!level || level.id !== 3 || levelComplete || hasConfirmed) return null;
    saveSnapshot();

    const key = cellKey(row, col);
    const votes = cellSensorVotes[key];
    if (!votes) return null;

    // 🚨 ENFORCE the fusion rule: at least 2 sensors must agree
    if (votes.agreeCount < 2) {
      notify();
      return { blocked: true, agreeCount: votes.agreeCount, reason: 'Not enough sensors agree. Need 2+ sensors above the danger line before you confirm.' };
    }

    const isHazard = level.hazards.some(h => h.row === row && h.col === col);

    if (isHazard) {
      correctMarks++;
      totalHazardsFound++;
    } else {
      wrongMarks++;
      falseAlarmCount++;
    }

    if (level.maxTokens < Infinity) {
      tokensRemaining = Math.max(0, tokensRemaining - 1);
      totalTokensSpent++;
    }
    cellsConfirmedHazard.push(key);

    checkLv2Complete(); // same logic
    notify();
    return { isHazard, tokensRemaining };
  }

  // ── Lv5: Nova Survey Logic ──
  function computeLv5NovaSurvey() {
    const level = getCurrentLevel();
    if (!level || level.id !== 4 || !level.cellSensorData) return;

    novaSurvey = {};
    uncertainCells = [];
    approvedCells = [];
    correctedCells = [];
    collapseTriggered = false;
    collapsedCell = null;

    const sensorIds = level.sensorConfig.sensors;

    // Use a composite amplitude for classification (average of 3 sensors)
    for (let r = 0; r < level.gridRows; r++) {
      for (let c = 0; c < level.gridCols; c++) {
        const key = cellKey(r, c);
        const signals = level.cellSensorData[r][c];
        const compositeAmp = (signals.seismic + signals.gpr + signals.em) / 3;

        // Fuse votes for ground truth check
        const votesArr = sensorIds.map(sid => ({
          sensorId: sid,
          vote: Classifier.sensorVote(signals[sid], perSensorThresholds[sid])
        }));
        const votesObj = {};
        votesArr.forEach(v => { votesObj[v.sensorId] = v.vote; });
        const fusion = Classifier.fuseVotes(votesArr);

        // Use the kid's carried threshold from Lv1, or fall back to default 46
        // carryOverT persists across level resets; learnedT does not
        const T = carryOverT || 46;
        const conf = Classifier.confidence(compositeAmp, T, 12);
        const classification = Classifier.classify(compositeAmp, T);
        const isHazard = level.hazards.some(h => h.row === r && h.col === c);

        const autoHandled =
          conf >= (level.autoApproveHigh || 90) || conf <= (level.autoClearLow || 15);

        novaSurvey[key] = {
          classification,
          confidence: conf,
          autoHandled,
          compositeAmp,
          votes: votesObj,
          fusionConfirmed: fusion.confirmed,
          isHazard,
          novaWrong: false
        };

        if (!autoHandled) {
          // Uncertain — route to kid.
          // Flip safe uncertain cells: make Nova wrong so the kid has a real decision.
          // Nova says 'safe' but cell is actually safe — but we flip it to 'hazard'
          // so the kid must notice the sensor readings don't match and tap Correct.
          if (!isHazard && classification === 'safe') {
            novaSurvey[key].classification = 'hazard';
            novaSurvey[key].novaWrong = true;
          }
          uncertainCells.push(key);
        } else if (classification === 'hazard' && autoHandled) {
          // Auto-marked as hazard
          approvedCells.push(key);
        }
      }
    }

    // Dead-end guard: when Nova auto-handles everything safe but missed real hazards —
    // the kid MUST be able to confirm and trigger the collapse consequence.
    lv5AllAutoSafe = false;
    if (uncertainCells.length === 0 && !collapseTriggered) {
      for (let r = 0; r < level.gridRows; r++) {
        for (let c = 0; c < level.gridCols; c++) {
          const key = cellKey(r, c);
          const survey = novaSurvey[key];
          const isHazard = level.hazards.some(h => h.row === r && h.col === c);
          if (isHazard && survey && survey.autoHandled && survey.classification === 'safe') {
            lv5AllAutoSafe = true;
            break;
          }
        }
        if (lv5AllAutoSafe) break;
      }
    }
  }

  function getNovaSurvey() { return novaSurvey; }
  function getUncertainCells() { return [...uncertainCells]; }
  function getApprovedCells() { return [...approvedCells]; }
  function getCorrectedCells() { return [...correctedCells]; }
  function isCollapseTriggered() { return collapseTriggered; }
  function getCollapsedCell() { return collapsedCell; }
  function canConfirmLv5() { return lv5AllAutoSafe && !collapseTriggered && !levelComplete; }

  function approveCell(row, col) {
    const level = getCurrentLevel();
    if (!level || level.id !== 4 || levelComplete || hasConfirmed) return null;
    saveSnapshot();

    const key = cellKey(row, col);
    const survey = novaSurvey[key];
    if (!survey || survey.autoHandled) return null;

    if (!approvedCells.includes(key)) {
      approvedCells.push(key);
    }
    // Remove from uncertain
    uncertainCells = uncertainCells.filter(k => k !== key);

    // Spend token
    if (level.maxTokens < Infinity) {
      tokensRemaining = Math.max(0, tokensRemaining - 1);
      totalTokensSpent++;
    }

    checkLv5Complete();
    notify();
    return { ok: true };
  }

  function correctCellLv5(row, col) {
    const level = getCurrentLevel();
    if (!level || level.id !== 4 || levelComplete || hasConfirmed) return null;
    saveSnapshot();

    const key = cellKey(row, col);
    const survey = novaSurvey[key];
    if (!survey || survey.autoHandled) return null;

    const isHazard = level.hazards.some(h => h.row === row && h.col === col);

    if (!correctedCells.includes(key)) {
      correctedCells.push(key);
    }
    uncertainCells = uncertainCells.filter(k => k !== key);

    // Spend token
    if (level.maxTokens < Infinity) {
      tokensRemaining = Math.max(0, tokensRemaining - 1);
      totalTokensSpent++;
    }

    if (isHazard) {
      if (!approvedCells.includes(key)) {
        approvedCells.push(key);
      }
    }

    checkLv5Complete();
    notify();
    return { ok: true, isHazard };
  }

  function handleAutoMissedHazard(row, col) {
    const level = getCurrentLevel();
    if (!level || level.id !== 4) return null;

    const key = cellKey(row, col);
    const isHazard = level.hazards.some(h => h.row === row && h.col === col);
    const survey = novaSurvey[key];

    // Was this auto-classified safe but actually a hazard?
    if (isHazard && survey && survey.autoHandled && survey.classification === 'safe') {
      collapseTriggered = true;
      collapsedCell = key;
      missedHazardCount++;
      notify();
      return { collapse: true, cell: key };
    }

    // Was this auto-classified hazard but actually safe?
    if (!isHazard && survey && survey.autoHandled && survey.classification === 'hazard') {
      falseAlarmCount++;
      notify();
      return { falseAlarm: true, cell: key };
    }

    return null;
  }

  function checkLv5Complete() {
    const level = getCurrentLevel();
    if (!level || level.id !== 4 || collapseTriggered) return;

    // All uncertain cells must be resolved
    if (uncertainCells.length > 0) return;

    // Level is complete once all yellow cells are resolved
    // (Auto-handled hazards are already in approvedCells from the survey)
    levelComplete = true;
    hasConfirmed = true;
    // Count how many hazards the user correctly confirmed
    const confirmedHazards = level.hazards.filter(h =>
      approvedCells.includes(cellKey(h.row, h.col)) ||
      correctedCells.includes(cellKey(h.row, h.col))
    ).length;
    totalHazardsFound += confirmedHazards;
  }

  /** Force Level 5 to complete — called when all uncertain cells resolved */
  function forceLv5Complete() {
    levelComplete = true;
    hasConfirmed = true;
    const level = getCurrentLevel();
    if (level && level.id === 4) {
      totalHazardsFound = level.hazards.filter(h =>
        approvedCells.includes(cellKey(h.row, h.col)) ||
        correctedCells.includes(cellKey(h.row, h.col))
      ).length;
    }
    notify();
    return true;
  }

  function getLv5Progress() {
    const level = getCurrentLevel();
    if (!level || level.id !== 4) return null;
    const totalCells = level.gridRows * level.gridCols;
    const autoHandledCount = totalCells - uncertainCells.length;
    return {
      uncertainRemaining: uncertainCells.length,
      autoHandled: autoHandledCount,
      totalCells,
      hazardsConfirmed: level.hazards.filter(h =>
        approvedCells.includes(cellKey(h.row, h.col)) ||
        correctedCells.includes(cellKey(h.row, h.col))
      ).length,
      totalHazards: level.hazards.length,
      tokensRemaining,
      collapseTriggered
    };
  }

  // ── Cell Selection ──
  function selectCell(row, col) {
    selectedCell = { row, col };
    notify();
  }

  function getSelectedCell() {
    return selectedCell;
  }

  // ── Grid ──
  function getGridSize() {
    const level = getCurrentLevel();
    if (!level) return { rows: 0, cols: 0 };
    return { rows: level.gridRows, cols: level.gridCols };
  }

  function getHazardCells() {
    const level = getCurrentLevel();
    if (!level) return [];
    return level.hazards.map(h => cellKey(h.row, h.col));
  }

  function isHazardCell(row, col) {
    const level = getCurrentLevel();
    return level ? level.hazards.some(h => h.row === row && h.col === col) : false;
  }

  function getCellAmplitude(row, col) {
    const level = getCurrentLevel();
    if (!level || !level.cellAmplitudes) return null;
    const rowData = level.cellAmplitudes[row];
    return rowData ? rowData[col] : null;
  }

  // ── Level 1 helpers ──
  function isTrainingSample(row, col) {
    return samplesToShow.some(s => s.row === row && s.col === col);
  }

  function isLabeled(row, col) {
    return trainingLabels.some(l => l.row === row && l.col === col);
  }

  // ── Completion ──
  function isComplete() { return levelComplete; }
  function hasConfirmedSurvey() { return hasConfirmed; }
  function isAllHazardsFound() { return levelComplete; }

  // ── Stars ──
  function getStars() {
    if (!levelComplete) return 0;
    const level = getCurrentLevel();
    if (!level) return 0;

    if (level.id === 1) {
      if (wrongAttempts === 0) return 3;
      if (wrongAttempts <= 1) return 2;
      return 1;
    }

    if (level.id === 3) {
      if (falseAlarmCount === 0 && wrongAttempts === 0) return 3;
      if (falseAlarmCount <= 1 && wrongAttempts <= 1) return 2;
      return 1;
    }

    if (level.id === 6) {
      const r = examResult;
      if (!r) return 0;
      if (r.correct >= r.total - 1) return 3;
      if (r.correct >= Math.ceil(r.total / 2)) return 2;
      return 1;
    }

    // Level 2: stars based on false alarms (no tokens needed, auto-complete on sensitivity)
    if (level.id === 2) {
      if (falseAlarmCount === 0) return 3;
      if (falseAlarmCount <= 2) return 2;
      return 1;
    }

    if (level.maxTokens === Infinity || level.maxTokens <= 0) return 3;

    const ratio = tokensRemaining / level.maxTokens;
    if (ratio >= 0.5 && falseAlarmCount === 0) return 3;
    if (ratio >= 0.25) return 2;
    return 1;
  }

  // ── Stats ──
  function getStats() {
    return {
      totalHazardsFound,
      totalScansUsed,
      correctMarks,
      wrongMarks,
      falseAlarmCount,
      missedHazardCount,
      totalTokensSpent,
      accuracy: (correctMarks + wrongMarks) > 0
        ? Math.round((correctMarks / Math.max(1, correctMarks + wrongMarks)) * 100)
        : 100,
    };
  }

  // ── Sub-round for Lv2 ──
  function getSubRound() { return subRound; }

  function advanceToSubRound2() {
    if (subRound !== 1) return false;
    subRound = 2;
    const level = getCurrentLevel();
    if (level && level.noiseRise) {
      // Raise the effective noise floor — shifts all safe amplitudes up
      if (level.cellAmplitudes) {
        for (let r = 0; r < level.gridRows; r++) {
          for (let c = 0; c < level.gridCols; c++) {
            const isHazard = level.hazards.some(h => h.row === r && h.col === c);
            if (!isHazard) {
              level.cellAmplitudes[r][c] += level.noiseRise * 4;
            }
          }
        }
      }
      computeLv2Classifications();
    }
    notify();
    return true;
  }

  // ── Debug ──
  function debugRevealHazards() {
    const level = getCurrentLevel();
    if (!level) return [];
    return level.hazards.map(h => cellKey(h.row, h.col));
  }

  function debugAutoTrain() {
    const level = getCurrentLevel();
    if (!level) return;

    if (level.id === 1) {
      // Auto-label all training samples correctly
      level.trainingSamples.forEach(s => {
        const existing = trainingLabels.find(l => l.row === s.row && l.col === s.col);
        if (!existing) {
          trainingLabels.push({
            row: s.row, col: s.col,
            amplitude: s.amplitude,
            label: s.trueLabel
          });
        }
      });
      trainNova();
      trainingPhase = 'reviewing';

      // Auto-correct any remaining errors
      for (let r = 0; r < level.gridRows; r++) {
        for (let c = 0; c < level.gridCols; c++) {
          const correct = isAutoCorrect(r, c);
          if (correct === false) {
            correctCell(r, c);
          }
        }
      }
      trainingPhase = 'confirmed';
      levelComplete = true;
      hasConfirmed = true;
      totalHazardsFound += level.hazards.length;
    }

    if (level.id === 2 || level.id === 3) {
      // Mark all hazards
      level.hazards.forEach(h => {
        const key = cellKey(h.row, h.col);
        if (!cellsConfirmedHazard.includes(key)) {
          cellsConfirmedHazard.push(key);
        }
      });
      totalHazardsFound += level.hazards.length;
      correctMarks += level.hazards.length;
      levelComplete = true;
      hasConfirmed = true;
    }

    if (level.id === 4) {
      level.hazards.forEach(h => {
        const key = cellKey(h.row, h.col);
        if (!cellsConfirmedHazard.includes(key)) {
          cellsConfirmedHazard.push(key);
        }
      });
      totalHazardsFound += level.hazards.length;
      levelComplete = true;
      hasConfirmed = true;
    }

    if (level.id === 4) {
      level.hazards.forEach(h => {
        const key = cellKey(h.row, h.col);
        if (!approvedCells.includes(key)) {
          approvedCells.push(key);
        }
      });
      uncertainCells = [];
      totalHazardsFound += level.hazards.length;
      levelComplete = true;
      hasConfirmed = true;
    }

    notify();
  }

  // ── Undo Support ──
  function saveSnapshot() {
    const snap = {};
    SNAPSHOT_KEYS.forEach(k => {
      const val = eval(k);
      snap[k] = Array.isArray(val) ? [...val] : val;
    });
    lastSnapshot = snap;
  }

  function undo() {
    if (!lastSnapshot) return { undone: false, reason: 'nothing to undo' };
    const snap = lastSnapshot;
    SNAPSHOT_KEYS.forEach(k => {
      if (k === 'trainingLabels') trainingLabels = snap.trainingLabels ? [...snap.trainingLabels] : [];
      else if (k === 'cellsConfirmedHazard') cellsConfirmedHazard = snap.cellsConfirmedHazard ? [...snap.cellsConfirmedHazard] : [];
      else if (k === 'cellsConfirmedSafe') cellsConfirmedSafe = snap.cellsConfirmedSafe ? [...snap.cellsConfirmedSafe] : [];
      else if (k === 'approvedCells') approvedCells = snap.approvedCells ? [...snap.approvedCells] : [];
      else if (k === 'correctedCells') correctedCells = snap.correctedCells ? [...snap.correctedCells] : [];
      else if (k === 'uncertainCells') uncertainCells = snap.uncertainCells ? [...snap.uncertainCells] : [];
      else if (k === 'selectedCell') selectedCell = snap.selectedCell ? { ...snap.selectedCell } : null;
      else eval(`${k} = ${JSON.stringify(snap[k])}`);
    });
    lastSnapshot = null; // Can only undo once
    // Re-classify after undo
    const level = getCurrentLevel();
    if (level) {
      if (level.id === 1 && trainingLabels.length >= 4) trainNova();
      else if (level.id === 2) computeLv2Classifications();
      else if (level.id === 3 && level.cellSensorData) computeLv4Votes();
      else if (level.id === 4 && level.cellSensorData) computeLv5NovaSurvey();
    }
    notify();
    return { undone: true };
  }

  function canUndo() { return lastSnapshot !== null && !levelComplete && !hasConfirmed; }

  /** Force complete the current level (used by Lv5 autonomous demo) */
  function forceComplete() {
    levelComplete = true;
    hasConfirmed = true;
    notify();
  }

  function setExamResult(correct, total) {
    examResult = { correct, total };
  }

  // ── Notification ──
  function notify() {
    if (onStateChange) onStateChange();
  }

  // ── Public API ──
  return {
    init,
    getLevel,
    getCurrentLevel,
    getCurrentLevelNum,
    setLevel,
    resetLevel,

    getGridSize,
    getHazardCells,
    isHazardCell,
    getCellAmplitude,
    selectCell,
    getSelectedCell,

    // Lv1 — Training
    getTrainingSamples,
    getTrainingPhase,
    addLabel,
    trainNova,
    getLearnedThreshold,
    getAutoClassification,
    isAutoCorrect,
    checkAllCorrect,
    correctCell,
    confirmLv1,
    forceConfirmLv1,
    getWrongAttempts,
    incrementWrongAttempts,
    getAntiFrustrationLimit,
    isTrainingSample,
    isLabeled,
    getTrainingLabels: () => [...trainingLabels],

    // Lv2 — Sensitivity
    getSensitivity,
    setSensitivity,
    confirmSensitivity,
    getEffectiveThreshold,
    getTokensRemaining,
    getTokensSpent,
    getLv2Metrics,
    getLv2Classification,
    confirmCellAsHazard,
    getSubRound,
    advanceToSubRound2,
    getCellsConfirmedHazard: () => [...cellsConfirmedHazard],

    // Lv3 — Noise
    getRetrainedThreshold,

    // Lv4 — Fusion (shared with L3)
    setSensorThreshold: (sid, val) => {
      if (perSensorThresholds[sid] !== undefined) {
        perSensorThresholds[sid] = val;
        const level = getCurrentLevel();
        if (level && level.cellSensorData) {
          if (level.id === 3) computeLv4Votes();
          else if (level.id === 4) computeLv5NovaSurvey();
          notify();
        }
      }
    },
    computeLv4Votes: () => { computeLv4Votes(); notify(); },

    // Lv4 — Fusion
    getCellSensorVotes,
    getActiveSensor,
    setActiveSensor,
    getSensorSignals,
    confirmFusedCell,
    getSensorThresholds: () => ({ ...perSensorThresholds }),

    // Lv5 — HITL
    getNovaSurvey,
    getUncertainCells,
    getApprovedCells,
    getCorrectedCells,
    isCollapseTriggered,
    getCollapsedCell,
    canConfirmLv5,
    approveCell,
    correctCellLv5,
    forceLv5Complete,
    handleAutoMissedHazard,
    getLv5Progress,
    getCarryOverT: () => carryOverT,

    // Shared
    isComplete,
    hasConfirmedSurvey,
    isAllHazardsFound,
    getStars,
    getStats,
    undo,
    canUndo,
    forceComplete,
    setExamResult,

    // Debug
    debugRevealHazards,
    debugAutoTrain,

    LEVELS,
  };
})();
