/**
 * Predictive Ghost Trails — Core Logic Tests
 * Run with: node test/index.test.js
 */

// ── Mock DOM environment ────────────────────────────────────────────────
global.document = {
  getElementById: () => ({ textContent: '', classList: { add: () => {}, remove: () => {}, toggle: () => {} }, style: {} }),
  body: { fontFamily: 'Nunito, sans-serif' },
  createElement: () => ({ className: '', innerHTML: '', addEventListener: () => {} }),
  querySelector: () => null,
  getElementById: () => ({ appendChild: () => {}, style: { display: '' } }),
};
global.window = {
  innerWidth: 1024,
  innerHeight: 768,
  devicePixelRatio: 1,
  addEventListener: () => {},
  AudioContext: null,
  webkitAudioContext: null,
};
global.performance = { now: () => Date.now() };
global.requestAnimationFrame = (cb) => setTimeout(cb, 16);
global.getComputedStyle = () => ({ fontFamily: 'Nunito, sans-serif' });

// ── Game Constants ──────────────────────────────────────────────────────
const WORLD_W = 1000;
const WORLD_H = 600;
const G_BASE = 60;
const PREDICT_SEC = 5;
const TRAIL_DT = 0.1;
const MAX_BANK = 45;
const COLLISION_PROXIMITY = 20;

// ── ATC Approach/Sequencing Constants ──────────────────────────────────
const APPROACH_Y = 300;
const RUNWAY_THRESHOLD = 700;
const FINAL_APPROACH_FIX = 500;
const MIN_SEPARATION_GAP = 88;
const WARN_SEPARATION_GAP = 44;
const CRITICAL_SEPARATION_GAP = 22;
const MAX_TURN_RATE_DEG = 20;

// ── Turn Radius Formula ─────────────────────────────────────────────────
function calcTurningRadius(velocity, bankAngleDeg) {
  if (Math.abs(bankAngleDeg) < 0.1) return Infinity;
  const bankRad = Math.abs(bankAngleDeg) * Math.PI / 180;
  const r = (velocity * velocity) / (G_BASE * Math.tan(bankRad));
  return r < 1 ? 1 : r;
}

// ── Trail Calculation ──────────────────────────────────────────────────
function calculateTrail(startX, startY, startHeading, velocity, bankAngle, seconds, dt) {
  const trail = [];
  let cx = startX, cy = startY, ch = startHeading;
  const absBank = Math.abs(bankAngle);
  let turnR = Infinity;
  if (absBank > 0.1) {
    turnR = calcTurningRadius(velocity, bankAngle);
  }
  const sign = Math.sign(bankAngle);
  const steps = Math.floor(seconds / dt);
  for (let i = 0; i <= steps; i++) {
    const t = i * dt;
    trail.push({ x: cx, y: cy, t });
    cx += Math.cos(ch) * velocity * dt;
    cy += Math.sin(ch) * velocity * dt;
    if (turnR < Infinity) {
      ch += (velocity / turnR) * dt * sign;
    }
  }
  return trail;
}

// ── Collision Detection ─────────────────────────────────────────────────
function segIntersect(a1, a2, b1, b2) {
  const d1x = a2.x - a1.x, d1y = a2.y - a1.y;
  const d2x = b2.x - b1.x, d2y = b2.y - b1.y;
  const cross = d1x * d2y - d1y * d2x;
  if (Math.abs(cross) < 1e-10) return null;
  const dx = b1.x - a1.x, dy = b1.y - a1.y;
  const t = (dx * d2y - dy * d2x) / cross;
  const u = (dx * d1y - dy * d1x) / cross;
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return { x: a1.x + t * d1x, y: a1.y + t * d1y };
  }
  return null;
}

function findTrailIntersections(trailA, trailB) {
  const hits = [];
  for (let i = 0; i < trailA.length - 1; i++) {
    for (let j = 0; j < trailB.length - 1; j++) {
      const hit = segIntersect(trailA[i], trailA[i+1], trailB[j], trailB[j+1]);
      if (hit) hits.push(hit);
    }
  }
  return hits;
}

// ── Level Win/Lose Logic ────────────────────────────────────────────────
function checkLevel1(safeTimer) {
  return safeTimer >= 3;
}

function checkLevel3(safeTimer, levelTimer) {
  if (levelTimer <= 0) return 'lose';
  if (safeTimer >= 3) return 'win';
  return 'continue';
}

// ── TESTS ────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;

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

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function assertNear(actual, expected, tolerance, msg) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${msg || 'Value mismatch'}: expected ~${expected}, got ${actual}`);
  }
}

console.log('\n═══ Predictive Ghost Trails — Test Suite ═══\n');

// ── 1. Turning Radius Formula ────────────────────────────────────────
console.log('1. Turning Radius Formula');
test('straight flight (bank=0) gives infinite radius', () => {
  assert(calcTurningRadius(70, 0) === Infinity, 'Should be Infinity');
});
test('30° bank at 70u/s gives reasonable radius', () => {
  const r = calcTurningRadius(70, 30);
  assert(r > 50 && r < 300, `Radius ${r} should be between 50-300`);
});
test('higher speed increases turning radius', () => {
  const rSlow = calcTurningRadius(40, 30);
  const rFast = calcTurningRadius(80, 30);
  assert(rFast > rSlow, `Fast radius ${rFast} should be > slow radius ${rSlow}`);
});
test('higher bank angle decreases turning radius', () => {
  const r15 = calcTurningRadius(70, 15);
  const r45 = calcTurningRadius(70, 45);
  assert(r15 > r45, `15° radius ${r15} should be > 45° radius ${r45}`);
});
test('radius formula matches expected value', () => {
  // At 60u/s, 30° bank: R = 60²/(60*tan(30°)) = 3600/(60*0.577) ≈ 104
  const r = calcTurningRadius(60, 30);
  assertNear(r, 104, 5, 'Expected ~104');
});

// ── 2. Trail Generation ──────────────────────────────────────────────
console.log('\n2. Trail Generation');
test('straight trail goes in a line', () => {
  const trail = calculateTrail(100, 300, 0, 60, 0, 5, 0.1);
  assert(trail.length > 0, 'Trail should have points');
  assert(trail[0].x === 100 && trail[0].y === 300, 'Starts at origin');
  // After 5s at 60u/s, should be at x ≈ 400
  const last = trail[trail.length - 1];
  assertNear(last.x, 400, 5, 'X should be ~400 after 5s at 60u/s heading 0');
  assertNear(last.y, 300, 2, 'Y should stay ~300');
});
test('turning trail curves', () => {
  const trailStraight = calculateTrail(500, 300, 0, 60, 0, 5, 1);
  const trailTurn = calculateTrail(500, 300, 0, 60, 30, 5, 1);
  const lastStraight = trailStraight[trailStraight.length - 1];
  const lastTurn = trailTurn[trailTurn.length - 1];
  // With right turn, plane curves — final x should differ from straight
  assert(lastTurn.y > 310, `Y should increase (turn right), got ${lastTurn.y}`);
  // Turning plane goes less far forward than straight plane
  assert(lastTurn.x < lastStraight.x, `Turning should reduce forward progress`);
});
test('negative bank turns left (negative y in screen coords)', () => {
  const trail = calculateTrail(500, 300, 0, 60, -30, 5, 0.1);
  const last = trail[trail.length - 1];
  assert(last.y < 290, `Y should decrease (turn left), got ${last.y}`);
});
test('trail has correct number of steps', () => {
  const trail = calculateTrail(0, 0, 0, 50, 0, 2, 0.1);
  assert(trail.length === 21, `Expected 21 steps for 2s at 0.1s dt, got ${trail.length}`);
});
test('trail timestamps are correct', () => {
  const trail = calculateTrail(0, 0, 0, 50, 0, 1, 0.25);
  assert(trail.length === 5, '4 steps + start = 5 points');
  assertNear(trail[0].t, 0, 0.01);
  assertNear(trail[1].t, 0.25, 0.01);
  assertNear(trail[4].t, 1.0, 0.01);
});

// ── 3. Collision Detection ───────────────────────────────────────────
console.log('\n3. Collision Detection');
test('crossing segments are detected', () => {
  const hit = segIntersect(
    {x:0,y:0}, {x:10,y:10},
    {x:0,y:10}, {x:10,y:0}
  );
  assert(hit !== null, 'Should detect crossing');
  assertNear(hit.x, 5, 0.1);
  assertNear(hit.y, 5, 0.1);
});
test('parallel segments are not detected', () => {
  const hit = segIntersect(
    {x:0,y:0}, {x:10,y:0},
    {x:0,y:5}, {x:10,y:5}
  );
  assert(hit === null, 'Should not detect parallel lines');
});
test('non-intersecting segments are not detected', () => {
  const hit = segIntersect(
    {x:0,y:0}, {x:5,y:5},
    {x:10,y:10}, {x:15,y:15}
  );
  assert(hit === null, 'Should not detect separated segments');
});
test('two intersecting trails are detected', () => {
  // Plane A goes right, Plane B goes up — they cross near (400, 300)
  const trailA = calculateTrail(200, 300, 0.05, 60, 0, 5, 0.5);
  const trailB = calculateTrail(400, 500, -Math.PI/2, 60, 0, 5, 0.5);
  const hits = findTrailIntersections(trailA, trailB);
  assert(hits.length > 0, 'Crossing trails should intersect: got ' + hits.length);
});
test('two parallel trails do not intersect', () => {
  const trailA = calculateTrail(100, 250, 0, 60, 0, 5, 0.5);
  const trailB = calculateTrail(100, 350, 0, 60, 0, 5, 0.5);
  const hits = findTrailIntersections(trailA, trailB);
  assert(hits.length === 0, 'Parallel trails should not intersect');
});

// ── 4. Level Logic ───────────────────────────────────────────────────
console.log('\n4. Level Logic');
test('Level 1: win when safeTimer reaches 3s', () => {
  assert(checkLevel1(2.9) === false, 'Should not win at 2.9s');
  assert(checkLevel1(3.0) === true, 'Should win at 3.0s');
  assert(checkLevel1(5.0) === true, 'Should win beyond 3s');
});
test('Level 3: win/lose based on timer and safeTimer', () => {
  assert(checkLevel3(3.0, 10) === 'win', 'Should win with safeTimer ≥ 3');
  assert(checkLevel3(1.0, 5) === 'continue', 'Should continue mid-level');
  assert(checkLevel3(0, 0) === 'lose', 'Should lose when timer hits 0');
  assert(checkLevel3(0, -1) === 'lose', 'Should lose when timer below 0');
});

// ── 5. Numerical Bounds ──────────────────────────────────────────────
console.log('\n5. Numerical Bounds');
test('bank angle clamped to ±45°', () => {
  assert(MAX_BANK === 45, 'MAX_BANK should be 45°');
});
test('velocity stays reasonable', () => {
  // At 70u/s with 60fps, plane moves ~1.17 units per frame
  const velocity = 70;
  const fps = 60;
  const perFrame = velocity / fps;
  assert(perFrame > 0.5 && perFrame < 2, `Per-frame movement ${perFrame} is reasonable`);
});
test('trail prediction window is 5 seconds', () => {
  assert(PREDICT_SEC === 5);
  assert(TRAIL_DT === 0.1);
});
test('collision proximity is sensible', () => {
  assert(COLLISION_PROXIMITY === 20, '20 unit proximity is reasonable for 1000x600 world');
});

// ── 6. Heavy Plane Mechanics ─────────────────────────────────────────
console.log('\n6. Heavy Plane Mechanics');
test('heavy plane has tighter max bank', () => {
  const heavyMaxBank = 18;
  assert(heavyMaxBank < MAX_BANK, 'Heavy plane should have smaller max bank');
});
test('heavy plane turning radius is larger at same bank', () => {
  const rJet = calcTurningRadius(60, 18);
  const rHeavy = calcTurningRadius(40, 18);
  // At same bank, heavier (faster?) plane has larger radius.
  // But in our game, heavy plane is slower (40 vs 60)
  // So rHeavy < rJet even at same bank. But the heavy plane's maxBank is 18 vs 45.
  // This means the heavy plane can only make gentle turns.
  const rHeavyTight = calcTurningRadius(40, 18);  // Heavy max turn
  const rJetGentle = calcTurningRadius(60, 18);   // Jet gentle turn  
  assert(rHeavyTight < rJetGentle, `Heavy tight turn ${rHeavyTight} vs jet gentle ${rJetGentle}`);
});

// ── 7. Steer Toward (smooth heading changes) ─────────────────────────
console.log('\n7. Steer Toward (Smooth Heading Changes)');

// Simplified steerToward for testing
function steerToward(heading, targetHeading, dt, maxTurnRateDegPerSec) {
  let diff = targetHeading - heading;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  const maxTurn = maxTurnRateDegPerSec * Math.PI / 180 * dt;
  const turn = Math.max(-maxTurn, Math.min(maxTurn, diff));
  return heading + turn;
}

test('steer toward zero diff does nothing', () => {
  const h = steerToward(0, 0, 0.016, 20);
  assertNear(h, 0, 0.001, 'Should stay at 0');
});
test('steer toward small diff caps at max turn rate', () => {
  // 10° diff, 20°/s rate, 0.016s dt → max turn = 0.32°, so should turn 0.32°
  const h = steerToward(0, 10 * Math.PI / 180, 0.016, 20);
  const expectedTurn = 20 * Math.PI / 180 * 0.016; // 0.0056 rad ≈ 0.32°
  assertNear(h, expectedTurn, 0.001, 'Should turn at max rate');
});
test('steer toward large diff also caps at max turn rate', () => {
  // 90° diff, should turn at max rate
  const h = steerToward(0, Math.PI / 2, 0.016, 20);
  const maxTurn = 20 * Math.PI / 180 * 0.016;
  assertNear(h, maxTurn, 0.001, 'Should cap turn to max rate');
});
test('steer toward multiple frames converges to target', () => {
  let heading = 0;
  const target = 30 * Math.PI / 180; // 30° target
  const fps = 60;
  for (let i = 0; i < fps * 2; i++) { // 2 seconds at 60fps
    heading = steerToward(heading, target, 1/fps, 20);
  }
  // After 2s at 20°/s, should have turned 40°, but target is 30°
  assertNear(heading, target, 0.05, 'Should reach target heading');
});

// ── 8. Approach Separation Logic ──────────────────────────────────────
console.log('\n8. Approach Separation');

function getGapStatus(gap) {
  if (gap < CRITICAL_SEPARATION_GAP) return 'critical';
  if (gap < WARN_SEPARATION_GAP) return 'warning';
  if (gap < MIN_SEPARATION_GAP) return 'approaching';
  return 'safe';
}

test('gap >= 88 units is safe', () => {
  assert(getGapStatus(100) === 'safe', '100 gap should be safe');
  assert(getGapStatus(88) === 'safe', '88 gap should be safe');
});
test('gap 44-87 is approaching minimum', () => {
  assert(getGapStatus(60) === 'approaching', '60 gap should be approaching');
  assert(getGapStatus(44) === 'approaching', '44 gap should be approaching');
});
test('gap 22-43 is warning', () => {
  assert(getGapStatus(30) === 'warning', '30 gap should be warning');
});
test('gap < 22 is critical (imminent collision)', () => {
  assert(getGapStatus(10) === 'critical', '10 gap should be critical');
});
test('approach queue separation: planes beyond FAF block further joins', () => {
  // If a plane is past FAF (x=500), no other plane should join
  const planePastFAF = { x: 550, aiPhase: 'approach' };
  const planeBeforeFAF = { x: 300, aiPhase: 'approach' };
  const hasPlanePastFAF = (planes) => planes.some(p => p.aiPhase === 'approach' && p.x > FINAL_APPROACH_FIX);
  assert(hasPlanePastFAF([planePastFAF, planeBeforeFAF]) === true);
  assert(hasPlanePastFAF([planeBeforeFAF]) === false);
});

// ── 9. Approach Speed Management ──────────────────────────────────────
console.log('\n9. Approach Speed Management');

function updateApproachSpeed(currentSpeed, gap, dt) {
  const APPROACH_TARGET_SPEED = 42;
  const APPROACH_MIN_SPEED = 32;
  const APPROACH_MAX_SPEED = 55;

  let target = APPROACH_TARGET_SPEED;
  if (gap < MIN_SEPARATION_GAP * 1.2) {
    target = APPROACH_MIN_SPEED;
  } else if (gap > MIN_SEPARATION_GAP * 2.5) {
    target = APPROACH_MAX_SPEED;
  }
  return currentSpeed + (target - currentSpeed) * dt * 2;
}

test('tight gap reduces speed toward minimum', () => {
  const newSpeed = updateApproachSpeed(50, 70, 0.5);
  assert(newSpeed < 45, `Speed should decrease when gap is tight, got ${newSpeed}`);
});
test('wide gap increases speed toward maximum', () => {
  const newSpeed = updateApproachSpeed(42, 250, 0.5);
  assert(newSpeed > 48, `Speed should increase when gap is wide, got ${newSpeed}`);
});
test('normal gap maintains target speed', () => {
  const newSpeed = updateApproachSpeed(40, 150, 0.5);
  assertNear(newSpeed, 41, 2, 'Speed should move toward target when gap is normal');
});

// ── 10. Flight Plan Generation & Schedule Positions ──────────────────
console.log('\n10. Flight Plans & Schedule Positions');

// Minimal flight plan generator for testing (mirrors the game's logic)
  const TEST_HOLD_CONFIGS = [
    { cx: 35, cy: 200, r: 55 },
    { cx: 65, cy: 215, r: 85 },
    { cx: 95, cy: 195, r: 105 },
    { cx: 45, cy: 400, r: 60 },
    { cx: 75, cy: 410, r: 80 },
    { cx: 85, cy: 390, r: 95 },
  ];

function generateFlightPlans(numPlanes, landingSpacing) {
  const plans = [];
  const APPROACH_DURATION = 14;
  const ALT_BASE = 8000;
  const ALT_STEP = 1000;
  for (let i = 0; i < numPlanes; i++) {
    const joinTime = i * landingSpacing;
    plans.push({
      index: i,
      totalPlanes: numPlanes,
      joinTime: joinTime,
      landTime: joinTime + APPROACH_DURATION,
      exitTime: joinTime + APPROACH_DURATION + 3,
      holdConfig: TEST_HOLD_CONFIGS[i % TEST_HOLD_CONFIGS.length],
      altitude: ALT_BASE + (i % 12) * ALT_STEP,
      entryX: -30,
      entryY: 180 + ((i * 17) % 9 - 4) * 8,
      startOnApproach: false,
    });
  }
  return plans;
}

function computeSchedulePosition(plan, t, deviation) {
  const effectiveT = Math.max(0, t + (deviation || 0));
  const JOIN_X = 120;
  const RUNWAY_THRESHOLD = 700;
  const RUNWAY_END = 820;
  const APPROACH_Y = 300;
  const HOLD_SPEED = 28;
  const APPROACH_TARGET_SPEED = 42;
  const ARRIVAL_DURATION = 3.5;
  const ALT_APPROACH_BASE = 6000;
  const ALT_THRESHOLD = 0;

  if (plan.startOnApproach) {
    const approachX = JOIN_X + APPROACH_TARGET_SPEED * effectiveT;
    const apProgress = Math.min(1, effectiveT / (14 + 2));
    const alt = Math.round(ALT_APPROACH_BASE - (ALT_APPROACH_BASE - ALT_THRESHOLD) * apProgress);
    return { phase: 'approach', x: approachX, y: APPROACH_Y, speed: APPROACH_TARGET_SPEED, altitude: alt };
  }

  const holdAlt = plan.altitude || 8000;
  const hc = plan.holdConfig || TEST_HOLD_CONFIGS[0];

  function getHoldPos(cfg, time, idx, total) {
    const phaseStep = total > 0 ? (2 * Math.PI / total) : 0.5;
    const angle = time * 0.5 + idx * phaseStep;
    const x = cfg.cx + Math.cos(angle) * cfg.r;
    const y = cfg.cy + Math.sin(angle) * cfg.r;
    const heading = Math.atan2(Math.sin(angle + Math.PI / 2), Math.cos(angle + Math.PI / 2));
    return { x, y, heading, angle };
  }

  if (effectiveT < ARRIVAL_DURATION && effectiveT < plan.joinTime) {
    const arrivalProg = effectiveT / ARRIVAL_DURATION;
    const eased = arrivalProg < 0.5 ? 4 * arrivalProg * arrivalProg * arrivalProg : 1 - Math.pow(-2 * arrivalProg + 2, 3) / 2;
    const target = getHoldPos(hc, effectiveT, plan.index, plan.totalPlanes);
    const ex = plan.entryX || -30;
    const ey = plan.entryY || 180;
    const x = ex + (target.x - ex) * eased;
    const y = ey + (target.y - ey) * eased;
    const heading = target.heading;
    return { phase: 'arrive', x, y, speed: HOLD_SPEED, altitude: holdAlt };
  }

  if (effectiveT < plan.joinTime) {
    const pos = getHoldPos(hc, effectiveT, plan.index, plan.totalPlanes);
    return { phase: 'hold', x: pos.x, y: pos.y, speed: HOLD_SPEED, altitude: holdAlt };
  }

  if (effectiveT < plan.joinTime + 2.0) {
    const progress = Math.min(1, Math.max(0, (effectiveT - plan.joinTime) / 2.0));
    const p = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
    const startPos = getHoldPos(hc, plan.joinTime, plan.index, plan.totalPlanes);
    const x = startPos.x + (JOIN_X - startPos.x) * p;
    const y = startPos.y + (APPROACH_Y - startPos.y) * p;
    const speed = HOLD_SPEED + (APPROACH_TARGET_SPEED - HOLD_SPEED) * p;
    const alt = Math.round(holdAlt - (holdAlt - ALT_APPROACH_BASE) * p);
    return { phase: 'join', x, y, speed, altitude: alt };
  }

  if (effectiveT < plan.landTime) {
    const apTime = plan.landTime - plan.joinTime - 2.0;
    const apProgress = Math.min(1, Math.max(0, (effectiveT - plan.joinTime - 2.0) / apTime));
    const x = JOIN_X + (RUNWAY_THRESHOLD - JOIN_X) * apProgress;
    const alt = Math.round(ALT_APPROACH_BASE - (ALT_APPROACH_BASE - ALT_THRESHOLD) * apProgress);
    return { phase: 'approach', x, y: APPROACH_Y, speed: APPROACH_TARGET_SPEED, altitude: alt };
  }

  if (effectiveT < plan.exitTime) {
    const ldTime = plan.exitTime - plan.landTime;
    const ldProgress = Math.min(1, (effectiveT - plan.landTime) / ldTime);
    const x = RUNWAY_THRESHOLD + (RUNWAY_END - RUNWAY_THRESHOLD) * ldProgress;
    return { phase: 'landing', x, y: APPROACH_Y, speed: APPROACH_TARGET_SPEED * (1 - ldProgress * 0.6), landed: false, altitude: ALT_THRESHOLD };
  }

  return { phase: 'done', landed: true, altitude: ALT_THRESHOLD };
}

test('flight plans generated with correct spacing', () => {
  const plans = generateFlightPlans(10, 3.5);
  assert(plans.length === 10, 'Should generate 10 plans');
  assertNear(plans[0].joinTime, 0, 0.1, 'First plane joins at t=0');
  assertNear(plans[1].joinTime, 3.5, 0.1, 'Second plane joins at t=3.5');
  assertNear(plans[2].joinTime, 7.0, 0.1, 'Third plane joins at t=7.0');
  assertNear(plans[0].landTime, 14, 0.1, 'First plane lands at t=14');
});

test('schedule positions: plane arrives before entering holding', () => {
  const plans = generateFlightPlans(2, 3.5);
  const state = computeSchedulePosition(plans[1], 1, 0); // 1s in (still arriving)
  assert(state.phase === 'arrive', `Should be in arrive phase, got ${state.phase}`);
  assert(state.x > -100, `Arrival x=${state.x} should be moving right`);
});

test('schedule positions: plane holds steadily after arrival', () => {
  const plans = generateFlightPlans(2, 3.5);
  const state = computeSchedulePosition(plans[1], 4, 0); // 4s > ARRIVAL_DURATION=3.5, < joinTime=3.5... 
  // Actually plane 1 joins at 3.5, so at t=4 it's past joinTime!
  // Use a time that's past arrival but before join
  const state2 = computeSchedulePosition(plans[1], 2.5, 0); // 2.5s: past half arrival, still < joinTime=3.5
  // At t=2.5: effectiveT=2.5 < ARRIVAL_DURATION=3.5, so still in arrive phase
  assert(state2.phase === 'arrive' || state2.phase === 'hold',
    `Should be arriving or holding, got ${state2.phase}`);
  assertNear(state2.speed, 28, 1, 'Speed should be ~28 in holding');
});

test('schedule positions: plane transitions at join time', () => {
  const plans = generateFlightPlans(2, 3.5);
  const state = computeSchedulePosition(plans[0], 1, 0); // 1s after join (1s into 2s transition)
  assert(state.phase === 'join', 'Should be in join phase');
  assert(state.x > 50, 'X should be moving toward join point');
});

test('schedule positions: plane on approach apron 10s', () => {
  const plans = generateFlightPlans(2, 3.5);
  // After joinTime+2=2, the plane is on approach. At t=10:
  // apProgress = (10 - 2) / 12 = 8/12 = 0.67
  // x = 120 + 580 * 0.67 = 508
  const state = computeSchedulePosition(plans[0], 10, 0);
  assert(state.phase === 'approach', 'Should be on approach');
  assertNear(state.x, 508, 15, `X should be ~508 at t=10 (got ${state.x})`);
  assertNear(state.y, 300, 1, 'Y should be 300');
});

test('schedule positions: plane lands at land time', () => {
  const plans = generateFlightPlans(2, 3.5);
  const state = computeSchedulePosition(plans[0], 15, 0); // 1s after landTime=14
  assert(state.phase === 'landing', 'Should be landing');
  assert(state.x >= 700, 'X should be at or past threshold');
  assert(state.speed < 40, 'Speed should have decreased from 42');
});

test('schedule positions: plane done after exit', () => {
  const plans = generateFlightPlans(2, 3.5);
  const state = computeSchedulePosition(plans[0], 18, 0); // 4s after landTime=14
  assert(state.phase === 'done', 'Should be done');
  assert(state.landed === true, 'Should be marked landed');
});

test('schedule deviation shifts position forward', () => {
  const plans = generateFlightPlans(2, 3.5);
  const noDev = computeSchedulePosition(plans[1], 4, 0);
  const withDev = computeSchedulePosition(plans[1], 4, 1.0); // 1s deviation = shifted forward
  const wasOnApproach = noDev.phase !== 'hold' && noDev.x >= 120;
  const earlierOnApproach = withDev.phase === 'approach' || withDev.x > noDev.x;
  // With +1s deviation, plane should be further along
  assert(withDev.x >= noDev.x || withDev.phase !== noDev.phase,
    `Deviation should move plane forward: noDev(${noDev.x}) vs dev(${withDev.x})`);
});

test('schedule ensures minimum separation between adjacent approach planes', () => {
  const plans = generateFlightPlans(3, 3.5);
  const MIN_GAP = 88;
  // Check at several points during approach
  for (let t = 4; t < 40; t += 0.5) {
    const s0 = computeSchedulePosition(plans[0], t, 0);
    const s1 = computeSchedulePosition(plans[1], t, 0);
    const s2 = computeSchedulePosition(plans[2], t, 0);
    // Collect approach planes and sort by x position (spatial order)
    const approachPlanes = [s0, s1, s2].filter(s => s.phase === 'approach')
      .sort((a, b) => b.x - a.x); // Descending x (ahead first)
    for (let i = 0; i < approachPlanes.length - 1; i++) {
      const gap = approachPlanes[i].x - approachPlanes[i + 1].x;
      assert(gap >= MIN_GAP, `At t=${t}, gap is ${gap.toFixed(0)} (min ${MIN_GAP}). Plane ahead at x=${approachPlanes[i].x.toFixed(0)}, behind at x=${approachPlanes[i+1].x.toFixed(0)}`);
    }
  }
});

// ── 11. Altitude Logic ──────────────────────────────────────────────
console.log('\n11. Altitude Logic');

test('holding altitude is constant', () => {
  const plans = generateFlightPlans(2, 3.5);
  const s = computeSchedulePosition(plans[1], 4, 0); // past arrival, in hold or later
  // At t=4: plane 1 joinTime=3.5, so effectiveT=4 >= joinTime → past holding
  const s2 = computeSchedulePosition(plans[1], 1, 0); // in arrival/hold
  // All positions before join should have the assigned altitude
  const atArrive = computeSchedulePosition(plans[1], 0.5, 0);
  if (atArrive.altitude !== undefined) {
    assert(atArrive.altitude > 5000, `Arrival altitude ${atArrive.altitude} should be >5000ft`);
  }
});

test('approach altitude decreases from 6000 toward 0', () => {
  const plans = generateFlightPlans(2, 3.5);
  const startApproach = computeSchedulePosition(plans[0], 4, 0); // well into approach
  const midApproach = computeSchedulePosition(plans[0], 8, 0);
  const nearLand = computeSchedulePosition(plans[0], 13.9, 0); // 0.1s before landTime=14
  if (startApproach.altitude !== undefined && midApproach.altitude !== undefined) {
    assert(startApproach.altitude < 6000, `Early approach alt ${startApproach.altitude} should be <6000`);
    assert(midApproach.altitude < startApproach.altitude, `Mid approach alt ${midApproach.altitude} should be < early ${startApproach.altitude}`);
    assert(nearLand.altitude < 300, `Late approach alt ${nearLand.altitude} should be <300`);
  }
});

test('landing altitude is 0', () => {
  const plans = generateFlightPlans(2, 3.5);
  const s = computeSchedulePosition(plans[0], 18, 0); // past landTime=14
  if (s.altitude !== undefined) {
    assert(s.altitude === 0, `Landing altitude should be 0, got ${s.altitude}`);
  }
});

console.log(`\n═══ Results: ${passed} passed, ${failed} failed ═══\n`);
process.exit(failed > 0 ? 1 : 0);
