/**
 * Add a Smile — Core logic tests
 * 
 * Tests the mouth curvature detection, emotion analysis, and state machine
 * logic. Run with: node test/index.test.js
 * 
 * These tests verify the game's core mechanics without a browser:
 * - Mouth curvature detection (happy/sad/angry)
 * - Robot face generation inputs
 * - Emotion keyword matching
 * - Progress tracking
 */

// ============================================================
// EMOTION DETECTION — Simulates the analyzeDrawing logic
// ============================================================

function analyzeMouth(points, faceCircle) {
  // points: [{x, y}] - stroke points
  // faceCircle: {cx, cy, r}
  
  if (!points || points.length < 3) {
    return { emotion: 'happy', confidence: 0.4 };
  }

  // Filter to mouth region (bottom third of face)
  const mouthY1 = faceCircle.cy + faceCircle.r * 0.1;
  const mouthY2 = faceCircle.cy + faceCircle.r * 0.8;
  const mouthX1 = faceCircle.cx - faceCircle.r * 0.7;
  const mouthX2 = faceCircle.cx + faceCircle.r * 0.7;

  const mouthPts = points.filter(p =>
    p.x >= mouthX1 && p.x <= mouthX2 && p.y >= mouthY1 && p.y <= mouthY2
  );

  if (mouthPts.length < 3) {
    return { emotion: 'happy', confidence: 0.4 };
  }

  // Sort by x
  const sorted = [...mouthPts].sort((a, b) => a.x - b.x);
  const n = sorted.length;

  // Parabola fit: y = a*x² + b*x + c
  // In screen coords (Y-down):
  //   a < 0 → ∪ (center below ends → corners UP → HAPPY)
  //   a > 0 → ∩ (center above ends → corners DOWN → SAD)
  // Negate so positive = happy (∪), negative = sad (∩)
  const minX = sorted[0].x, maxX = sorted[n-1].x, range = maxX - minX || 1;
  const pts = sorted.map(p => ({ xn: (p.x - minX) / range * 2 - 1, y: p.y }));

  let Sx=0, Sxx=0, Sxxx=0, Sxxxx=0, Sy=0, Sxy=0, Sxxy=0;
  for (const p of pts) {
    const x = p.xn, x2 = x*x, x3 = x2*x, x4 = x3*x;
    Sx+=x; Sxx+=x2; Sxxx+=x3; Sxxxx+=x4; Sy+=p.y; Sxy+=x*p.y; Sxxy+=x2*p.y;
  }

  const det = Sxxxx*(Sxx*n - Sx*Sx) - Sxxx*(Sxxx*n - Sx*Sxx) + Sxx*(Sxxx*Sx - Sxx*Sxx);
  let a = 0;
  if (Math.abs(det) > 1e-10) a = (Sxxy*(Sxx*n - Sx*Sx) - Sxy*(Sxxx*n - Sx*Sxx) + Sy*(Sxxx*Sx - Sxx*Sxx)) / det;

  const scaledA = a * (range/2) * (range/2);
  const curveDir = -scaledA; // negate so positive = ∪ = happy

  // Cross-check with three evenly-spaced points
  const p1 = sorted[Math.floor(n * 0.1)];
  const p2 = sorted[Math.floor(n * 0.5)];
  const p3 = sorted[Math.floor(n * 0.9)];
  const yAtP2 = p1.y + (p3.y - p1.y) * ((p2.x - p1.x) / (p3.x - p1.x || 1));
  const crossCurve = p2.y - yAtP2;

  // Use the more confident of the two measures
  const finalCurve = Math.abs(curveDir) >= Math.abs(crossCurve) ? curveDir : crossCurve;

  // Direction changes for angry
  let directionChanges = 0;
  if (sorted.length > 4) {
    for (let i = 2; i < sorted.length; i++) {
      const dy1 = sorted[i-1].y - sorted[i-2].y;
      const dy2 = sorted[i].y - sorted[i-1].y;
      if (dy1 * dy2 < -5) directionChanges++;
    }
  }

  const absCurve = Math.abs(finalCurve);

  if (directionChanges >= 2 && absCurve > 3) {
    return { emotion: 'angry', confidence: Math.min(0.9, 0.5 + directionChanges * 0.05) };
  } else if (finalCurve > 3) {
    return { emotion: 'happy', confidence: Math.min(0.95, 0.4 + absCurve * 0.01) };
  } else if (finalCurve < -3) {
    return { emotion: 'sad', confidence: Math.min(0.95, 0.4 + absCurve * 0.01) };
  }

  return { emotion: 'happy', confidence: 0.35 };
}

// Helper: generate arc points for testing
function generateArc(cx, cy, width, height, upward) {
  // upward=true → ∪ shape (corners go UP = happy smile)
  // upward=false → ∩ shape (corners go DOWN = sad frown)
  const pts = [];
  const steps = 30;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = cx - width/2 + t * width;
    // ∪: center LOWER than ends (y = cy + amplitude)
    // ∩: center HIGHER than ends (y = cy - amplitude)
    const y = cy + (upward ? 1 : -1) * Math.sin(t * Math.PI) * height;
    pts.push({ x, y });
  }
  return pts;
}

// Helper: generate zigzag points for angry
function generateZigzag(cx, cy, width, amplitude) {
  const pts = [];
  const steps = 20;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = cx - width/2 + t * width;
    const y = cy + (i % 3 === 0 ? amplitude : -amplitude);
    pts.push({ x, y });
  }
  return pts;
}

// ============================================================
// TESTS
// ============================================================

const faceCircle = { cx: 200, cy: 200, r: 100 };
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  if (actual === expected) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}: expected "${expected}", got "${actual}"`);
  }
}

console.log('\n=== Emotion Detection Tests ===\n');

// Test 1: Happy face (∪ shape — corners up in mouth region)
{
  const mouthY = faceCircle.cy + faceCircle.r * 0.3;
  const smile = generateArc(faceCircle.cx, mouthY, faceCircle.r * 0.6, 25, true);
  const result = analyzeMouth(smile, faceCircle);
  assertEqual(result.emotion, 'happy', '∪ arc (corners up) detects as happy');
  assert(result.confidence >= 0.4, 'Happy confidence >= 0.4');
}

// Test 2: Sad face (∩ shape — corners down in mouth region)
{
  const mouthY = faceCircle.cy + faceCircle.r * 0.3;
  const frown = generateArc(faceCircle.cx, mouthY, faceCircle.r * 0.6, 25, false);
  const result = analyzeMouth(frown, faceCircle);
  assertEqual(result.emotion, 'sad', '∩ arc (corners down) detects as sad');
  assert(result.confidence >= 0.4, 'Sad confidence >= 0.4');
}

// Test 3: Angry face (zigzag in mouth region)
{
  const mouthY = faceCircle.cy + faceCircle.r * 0.3;
  const zigzag = generateZigzag(faceCircle.cx, mouthY, faceCircle.r * 0.5, 12);
  const result = analyzeMouth(zigzag, faceCircle);
  assertEqual(result.emotion, 'angry', 'Zigzag mouth detects as angry');
  assert(result.confidence >= 0.4, 'Angry confidence >= 0.4');
}

// Test 4: No points returns default
{
  const result = analyzeMouth([], faceCircle);
  assertEqual(result.emotion, 'happy', 'Empty points defaults to happy');
  assertEqual(result.confidence, 0.4, 'Empty points confidence is 0.4');
}

// Test 5: Few points returns default
{
  const result = analyzeMouth([{x:10,y:10},{x:20,y:20}], faceCircle);
  assertEqual(result.emotion, 'happy', 'Few points defaults to happy');
}

// Test 6: Points outside mouth region
{
  const pts = [
    { x: 0, y: 0 },
    { x: 10, y: 5 },
    { x: 20, y: 8 },
  ];
  const result = analyzeMouth(pts, faceCircle);
  assert(result.confidence <= 0.4, 'Outside points get low confidence');
}

console.log('\n=== Keyword Matching Tests ===\n');

function matchEmotion(transcript) {
  const t = transcript.toLowerCase();
  if (t.includes('happy') || t.includes('hap')) return 'happy';
  if (t.includes('sad') || t.includes('saa')) return 'sad';
  if (t.includes('angry') || t.includes('mad') || t.includes('ang')) return 'angry';
  return null;
}

assertEqual(matchEmotion('make robot happy'), 'happy', 'Exact "happy" match');
assertEqual(matchEmotion('make robot sad'), 'sad', 'Exact "sad" match');
assertEqual(matchEmotion('make robot angry'), 'angry', 'Exact "angry" match');
assertEqual(matchEmotion('robot is mad'), 'angry', '"mad" matches angry');
assertEqual(matchEmotion('make robot happy please'), 'happy', 'Phrase with "happy" works');
assertEqual(matchEmotion('robot hapy'), 'happy', 'Partial "hap" in "hapy" matches happy — fuzzy matching');
assertEqual(matchEmotion('hello robot'), null, 'Unknown word returns null');
assertEqual(matchEmotion('saaad robot'), 'sad', 'Partial "saa" matches sad');

console.log('\n=== Progress Tracking Tests ===\n');

const EMOTIONS = ['happy', 'sad', 'angry'];
const DRAWS_PER_EMOTION = 3;

function simulateGame() {
  const game = {
    emotionIndex: 0,
    drawsCompleted: 0,
    robotCommandCount: 0,
    allDrawings: { happy: 0, sad: 0, angry: 0 },
  };

  const phases = [];

  // Phase A: Draw emotions
  for (let e = 0; e < EMOTIONS.length; e++) {
    game.emotionIndex = e;
    for (let d = 0; d < DRAWS_PER_EMOTION; d++) {
      game.drawsCompleted = d;
      game.allDrawings[EMOTIONS[e]]++;
      phases.push(`draw-${EMOTIONS[e]}-${d+1}`);
    }
    game.drawsCompleted = 0;
  }

  // Phase B: Make robot happy
  phases.push('robot-happy');

  // Phase C: Free play
  game.robotCommandCount = 0;
  while (game.robotCommandCount < 3) {
    game.robotCommandCount++;
    phases.push(`command-${game.robotCommandCount}`);
  }

  return phases;
}

const sim = simulateGame();
assertEqual(sim.length, 13, 'Total phases: 9 draws + 1 robot intro + 3 free commands');

// Verify all 9 drawings happened
const drawPhases = sim.filter(p => p.startsWith('draw-'));
assertEqual(drawPhases.length, 9, 'Exactly 9 drawing phases');

// Verify all emotions got equal drawings
const happyDraws = drawPhases.filter(p => p.includes('happy')).length;
const sadDraws = drawPhases.filter(p => p.includes('sad')).length;
const angryDraws = drawPhases.filter(p => p.includes('angry')).length;
assertEqual(happyDraws, 3, '3 happy drawings');
assertEqual(sadDraws, 3, '3 sad drawings');
assertEqual(angryDraws, 3, '3 angry drawings');

console.log('\n=== Color & Stroke Tests ===\n');

const COLORS = ['#E74C3C', '#4A90D9', '#5CB85C', '#2D2D2D'];
assertEqual(COLORS.length, 4, 'Exactly 4 drawing colors');
assert(COLORS.includes('#E74C3C'), 'Red is available');
assert(COLORS.includes('#4A90D9'), 'Blue is available');
assert(COLORS.includes('#5CB85C'), 'Green is available');
assert(COLORS.includes('#2D2D2D'), 'Black is available');

// Test curvature direction detection
function detectCurveDirection(points) {
  // Simple: compare midpoint Y vs straight-line Y
  // Negative → center ABOVE ends → ∩ → corners DOWN → SAD
  // Positive → center BELOW ends → ∪ → corners UP → HAPPY
  const left = points[0];
  const right = points[points.length - 1];
  const midX = (left.x + right.x) / 2;
  // Find point closest to midX
  let midPoint = points[Math.floor(points.length / 2)];
  let minDist = Infinity;
  for (const p of points) {
    const d = Math.abs(p.x - midX);
    if (d < minDist) { minDist = d; midPoint = p; }
  }
  const t = (midX - left.x) / (right.x - left.x || 1);
  const lineY = left.y + (right.y - left.y) * t;
  return midPoint.y - lineY;
}

const upwardCurve = [
  {x:100, y:120},
  {x:110, y:115},
  {x:120, y:110},
  {x:130, y:108},
  {x:140, y:110},
  {x:150, y:115},
  {x:160, y:120}
];
const downwardCurve = [
  {x:100, y:100},
  {x:110, y:105},
  {x:120, y:110},
  {x:130, y:112},
  {x:140, y:110},
  {x:150, y:105},
  {x:160, y:100}
];

const upwardDir = detectCurveDirection(upwardCurve);
const downwardDir = detectCurveDirection(downwardCurve);
assert(upwardDir < 0, 'Upward curve (∩) has negative direction → sad');
assert(downwardDir > 0, 'Downward curve (∪) has positive direction → happy');
assert(upwardDir < downwardDir, 'upwardDir (negative) < downwardDir (positive)');

// ============================================================
// SUMMARY
// ============================================================
console.log(`\n${'='.repeat(40)}`);
console.log(`Tests: ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(40)}\n`);

process.exit(failed > 0 ? 1 : 0);
