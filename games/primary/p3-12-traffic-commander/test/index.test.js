/* =========================================================================
   test/index.test.js — headless logic tests for Traffic Commander.
   Run: node test/index.test.js
   Loads the pure-logic modules (traffic, sensors, intents, quiz) in a sandbox
   and validates simulation physics, sensor zones, quiz integrity, intent
   classification, and level win-condition reachability (numerical audit).
   ========================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');

/* Concatenate the browser-global IIFE modules and capture their exports.
   These files only touch browser APIs inside functions, so they eval cleanly. */
const src = ['traffic.js', 'sensors.js', 'intents.js', 'quiz.js'].map(read).join('\n');
const factory = new Function(src + '\n;return { Traffic, Sensors, Intents, Quiz };');
const { Traffic, Sensors, Intents, Quiz } = factory();

let pass = 0, fail = 0;
const results = [];
function ok(name, cond, detail) {
  if (cond) { pass++; results.push('  ✅ ' + name); }
  else { fail++; results.push('  ❌ ' + name + (detail ? '  → ' + detail : '')); }
}
function approx(a, b, eps) { return Math.abs(a - b) <= (eps == null ? 0.5 : eps); }

/* ---------------------------------------------------------------- */
console.log('\n=== Traffic Commander — logic tests ===\n');

/* --- Sensors: colour zones --- */
console.log('Sensor zones:');
ok('0% is green', Sensors.zoneName(0) === 'green');
ok('30% is green', Sensors.zoneName(30) === 'green');
ok('55% is amber', Sensors.zoneName(55) === 'amber');
ok('80% is orange', Sensors.zoneName(80) === 'orange');
ok('90% is red', Sensors.zoneName(90) === 'red');
ok('80%+ counts as red-band flush', Sensors.isRed(80) && Sensors.isRed(95));
ok('70% is NOT red-band', !Sensors.isRed(70));

/* --- Traffic: fill, cap, flush, overflow --- */
console.log('\nTraffic simulation:');
const sim = Traffic.sim;
sim.reset(1);
ok('reset makes 1 lane', sim.laneCount === 1 && sim.lanes.length === 1);

sim.configLane(0, { fillRate: 20, cap: null, fill: 0 });
sim.addVehicle(0, 'sedan');
ok('vehicle added', sim.lane(0).vehicles.length === 1);
// step 1 second
for (let i = 0; i < 60; i++) sim.update(1 / 60);
ok('fill rises ~20% in 1s', approx(sim.lane(0).fill, 20, 2), 'fill=' + sim.lane(0).fill.toFixed(1));

// flush resets
const flushed = sim.flush(0);
ok('flush returns scored fill', flushed && flushed.fill > 15);
ok('flush zeroes fill', sim.lane(0).fill === 0);

/* --- weak signal cap (bike) never overflows --- */
sim.reset(1);
sim.configLane(0, { fillRate: 40, cap: 10, fill: 0 });
sim.addVehicle(0, 'bike');
for (let i = 0; i < 60 * 8; i++) sim.update(1 / 60);
ok('bike caps at ~10%', approx(sim.lane(0).fill, 10, 1), 'fill=' + sim.lane(0).fill.toFixed(1));
ok('bike never overflows', sim.lane(0).overflowed === false);

/* --- overflow after grace when uncapped & full --- */
sim.reset(1);
sim.configLane(0, { fillRate: 200, cap: null, fill: 0 });
sim.addVehicle(0, 'truck');
let overflowedAt = null;
for (let i = 0; i < 60 * 6; i++) { const o = sim.update(1 / 60); if (o.length && overflowedAt === null) overflowedAt = i / 60; }
ok('uncapped full lane overflows', sim.lane(0).overflowed === true);
ok('overflow respects grace (~2.4s after hitting 100)', overflowedAt !== null && overflowedAt > 2.3, 'at=' + overflowedAt);

/* --- highest index --- */
sim.reset(4);
sim.configLane(0, { fill: 20 }); sim.configLane(1, { fill: 75 });
sim.configLane(2, { fill: 40 }); sim.configLane(3, { fill: 10 });
ok('highestIndex finds lane B (index 1)', sim.highestIndex() === 1);

/* --- Level 1 winnability: a truck reaches red band with a usable window --- */
console.log('\nLevel win-condition audit:');
(() => {
  sim.reset(1);
  sim.configLane(0, { fillRate: 25, cap: null, fill: 0 });   // truck = fastest L1 vehicle
  sim.addVehicle(0, 'truck');
  let redAt = null, overAt = null;
  for (let i = 0; i < 60 * 10; i++) {
    const o = sim.update(1 / 60);
    if (redAt === null && sim.lane(0).fill >= 80) redAt = i / 60;
    if (o.length && overAt === null) overAt = i / 60;
  }
  const window = (overAt || 99) - (redAt || 0);
  ok('L1 truck: red-band reachable', redAt !== null, 'redAt=' + redAt);
  ok('L1 truck: flush window >= 1.5s', window >= 1.5, 'window=' + window.toFixed(2) + 's');
})();

/* --- Level 5 automation: sweet spot passes, extremes fail --- */
(() => {
  const CYCLE = 1.6, WASTE_BELOW = 60, GREEN = Traffic.GREEN_MS / 1000;
  function simulateAuto(rates, trigger, duration) {
    sim.reset(4);
    for (let i = 0; i < 4; i++) { sim.configLane(i, { fillRate: rates[i], cap: null, fill: 0 }); sim.addVehicle(i, 'sedan'); }
    let waste = 0, overflow = 0, cd = 0.4, t = 0;
    const dt = 1 / 60;
    const pendingAdds = [];
    while (t < duration) {
      // keep lanes fed
      for (let i = 0; i < 4; i++) if (sim.lane(i).light === 'red' && sim.lane(i).vehicles.length === 0) sim.addVehicle(i, 'sedan');
      // fire scheduled re-adds
      for (const p of pendingAdds) p.t -= dt;
      pendingAdds.filter((p) => p.t <= 0).forEach((p) => { if (sim.lane(p.i).light === 'red') sim.addVehicle(p.i, 'sedan'); });
      for (let k = pendingAdds.length - 1; k >= 0; k--) if (pendingAdds[k].t <= 0) pendingAdds.splice(k, 1);

      const o = sim.update(dt);
      if (o.length) { overflow += o.length; sim.clearOverflow(); }
      cd -= dt;
      if (cd <= 0) {
        cd = CYCLE;
        const hi = sim.highestIndex();
        const fillNow = sim.lane(hi).fill;
        if (fillNow >= trigger) {
          if (fillNow < WASTE_BELOW) waste++;
          sim.flush(hi);
          pendingAdds.push({ i: hi, t: GREEN + 0.05 });
        }
      }
      t += dt;
    }
    return { waste, overflow };
  }

  const evening = [10, 9, 9, 8];
  const morning = [12, 4, 9, 3];

  const sweet = simulateAuto(evening, 70, 16);
  ok('L5 evening @70%: no overflow', sweet.overflow === 0, JSON.stringify(sweet));
  ok('L5 evening @70%: low waste', sweet.waste <= 4, JSON.stringify(sweet));

  const tooHigh = simulateAuto(evening, 90, 16);
  ok('L5 evening @90%: overflows (too high)', tooHigh.overflow > 0, JSON.stringify(tooHigh));

  const tooLow = simulateAuto(morning, 42, 14);
  ok('L5 morning @42%: wastes (too low)', tooLow.waste > 4, JSON.stringify(tooLow));
})();

/* --- Quiz integrity --- */
console.log('\nQuiz integrity:');
ok('exactly 10 questions', Quiz.QUESTIONS.length === 10);
ok('pass mark is 7', Quiz.PASS === 7);
let allOneCorrect = true, allThree = true;
Quiz.QUESTIONS.forEach((q) => {
  if (q.choices.filter((c) => c.ok).length !== 1) allOneCorrect = false;
  if (q.choices.length !== 3) allThree = false;
});
ok('every question has exactly 1 correct answer', allOneCorrect);
ok('every question has 3 choices', allThree);
ok('every question names an AI concept', Quiz.QUESTIONS.every((q) => q.concept && q.concept.length));

/* --- Intents classification --- */
console.log('\nIntent engine:');
ok('greeting detected', Intents.classify('hello flux').intent === 'greeting');
ok('help detected', Intents.classify('help me please').intent === 'help');
ok('hint detected', Intents.classify('give me a hint').intent === 'hint');
ok('vehicle info detected', Intents.classify('what about the bike').intent === 'vehicle_info');
ok('off-topic falls through', Intents.classify('the sky is blue today').intent === 'off_topic');
ok('respond returns text', typeof Intents.respond('help', { level: 1 }) === 'string' && Intents.respond('help', { level: 1 }).length > 0);
ok('off-topic reply has lesson nudge', /flush|signal|lane|trigger|prediction|exam|bike/i.test(Intents.respond('off_topic', { level: 1 })));
ok('idle prompts exist for all 6 levels', [1, 2, 3, 4, 5, 6].every((l) => Intents.idlePrompts[l]));

/* ---------------------------------------------------------------- */
console.log('\n' + results.join('\n'));
console.log(`\n=== ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
