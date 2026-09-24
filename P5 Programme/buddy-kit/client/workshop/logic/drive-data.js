/* drive-data.js — the DRIVING sensor dataset and the instructor's rule (Stage 5).
 *
 * The child's driving model learns from labelled sensor situations. This file is
 * the single author of those situations and of the "driving instructor" rule that
 * labels them, shared by:
 *   • datasets.js   — the authored `drive` table the Workshop deals as crates;
 *   • tests/driving.test.mjs — which trains a real k-NN from these rows and
 *     proves it can drive the City's guided test track.
 *
 * Why authored here, not generated in the City: the child must meet ONE clean
 * rule ("what would a careful driver do?") and the City must run the model the
 * child actually trained. Keeping the rule beside the table means the data and
 * the lesson cannot drift apart.
 *
 * Pure: logic/rng.js only. No DOM. window.WorkshopDriveData + module.exports.
 */
(function () {
'use strict';
const Rng = (typeof require === 'function') ? require('./rng.js') : window.WorkshopRng;

/** The observation fields, in the order the number sense reads them off a sticker. */
const FIELDS = ['left', 'center', 'right', 'laneOffset', 'headingError', 'speed', 'trafficLight', 'turnIntent'];
/** The five actions a driving model may choose. */
const ACTIONS = ['forward', 'left', 'right', 'slow', 'stop'];
/** Static clear-road distance (also the sensor cap). */
const CLEAR = 40;

/**
 * The feature schema for the table. Ranges are the SENSOR RANGES, not the
 * training box — the World can produce any of these, and the rule must answer
 * for all of them.
 */
const FEATURES = [
  { id: 'left', min: 0, max: CLEAR },
  { id: 'center', min: 0, max: CLEAR },
  { id: 'right', min: 0, max: CLEAR },
  { id: 'laneOffset', min: -6, max: 6 },
  { id: 'headingError', min: -Math.PI, max: Math.PI },
  { id: 'speed', min: 0, max: 16 },
  { id: 'trafficLight', min: 0, max: 2 },
  { id: 'turnIntent', min: 0, max: 2 },
];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const num = (lo, hi, st) => { const [f, s] = Rng.next(st); return [lo + f * (hi - lo), s]; };
const int = (lo, hi, st) => { const [f, s] = Rng.next(st); return [lo + Math.floor(f * (hi - lo + 1)), s]; };
const pick = (arr, st) => { const [i, s] = int(0, arr.length - 1, st); return [arr[i], s]; };

/**
 * The instructor's rule — what a careful driver does with these readings.
 *
 * Order matters and states the priority out loud: a red light or something
 * close dead ahead beats everything; something crowding a side is moved away
 * from; an amber light eases off; lane drift and heading error are corrected;
 * an upcoming turn is taken; a distant side obstacle means slow down and look;
 * otherwise go.
 */
function instructorAction(f) {
  if (f.trafficLight === 2) return 'stop';
  // Steer around something crowding a side BEFORE ever stopping for it: a car
  // that brakes at an avoidable cone can no longer steer around it.
  if (f.left < 5) return 'right';
  if (f.right < 5) return 'left';
  if (f.center < 4) return 'stop';
  if (f.trafficLight === 1) return 'slow';
  if (f.laneOffset > 1.8 || f.headingError > 0.28) return 'left';
  if (f.laneOffset < -1.8 || f.headingError < -0.28) return 'right';
  if (f.turnIntent === 1) return 'left';
  if (f.turnIntent === 2) return 'right';
  if (Math.min(f.left, f.center, f.right) < 12) return 'slow';
  return 'forward';
}

/** A crate's face — exactly datasets.js's own format, so the number sense's
 *  parse yields the eight values in field order. */
function face(features) {
  return FIELDS.map((id) => `${id} ${features[id]}`).join(' · ');
}

/** Values with a little bounded noise, so the table is not a handful of clones. */
function jitter(v, amp, st) {
  const [f, s] = Rng.next(st);
  return [(v + (f * 2 - 1) * amp), s];
}

/**
 * One row: draw a situation family, fill its readings, and label it with the
 * instructor. 6 % of rows are deliberately flipped — real data is not perfectly
 * consistent, and a k-NN must out-vote a few bad examples.
 */
function gen(st) {
  let family;
  [family, st] = pick(['clear', 'clear', 'clear', 'clear', 'clear', 'sideLeft', 'sideRight', 'ahead', 'redLight', 'redLight', 'amber', 'turnLeft', 'turnRight', 'drifting'], st);
  const f = { left: CLEAR, center: CLEAR, right: CLEAR, laneOffset: 0, headingError: 0, speed: 0, trafficLight: 0, turnIntent: 0 };
  if (family === 'clear') {
    let v;
    [v, st] = num(0, 1, st);
    const centred = v < 0.7;   // most clear-road rows sit inside the deadband → "forward"
    [v, st] = num(-(centred ? 2 : 3.5), centred ? 2 : 3.5, st); f.laneOffset = round2(v);
    [v, st] = num(-(centred ? 0.3 : 0.5), centred ? 0.3 : 0.5, st); f.headingError = round2(v);
    [v, st] = num(0, 12, st); f.speed = round2(v);
    [v, st] = pick([0, 0, 0, 0, 1], st); f.trafficLight = v;
    [v, st] = pick([0, 0, 0, 0, 1, 2], st); f.turnIntent = v;
  } else if (family === 'sideLeft' || family === 'sideRight') {
    let v;
    [v, st] = num(1, 11, st); f[family === 'sideLeft' ? 'left' : 'right'] = round2(v);
    [v, st] = num(10, 30, st); f.center = round2(v);
    [v, st] = num(-2, 2, st); f.laneOffset = round2(v);
    [v, st] = num(2, 12, st); f.speed = round2(v);
  } else if (family === 'ahead') {
    let v;
    [v, st] = num(0.5, 9, st); f.center = round2(v);
    [v, st] = num(6, 20, st); f.left = round2(v);
    [v, st] = num(6, 20, st); f.right = round2(v);
    [v, st] = num(2, 12, st); f.speed = round2(v);
  } else if (family === 'redLight' || family === 'amber') {
    // A light is read from a distance with the road otherwise clear — that is
    // exactly the track's own reading, so the model must not need an obstacle
    // to recognise a red light.
    let v;
    f.trafficLight = family === 'redLight' ? 2 : 1;
    f.left = CLEAR; f.right = CLEAR;
    [v, st] = num(18, 40, st); f.center = round2(v);
    [v, st] = num(0, 12, st); f.speed = round2(v);
    [v, st] = num(-2, 2, st); f.laneOffset = round2(v);
    [v, st] = num(-0.2, 0.2, st); f.headingError = round2(v);
  } else if (family === 'turnLeft' || family === 'turnRight') {
    let v;
    f.turnIntent = family === 'turnLeft' ? 1 : 2;
    f.left = CLEAR; f.center = CLEAR; f.right = CLEAR;
    [v, st] = num(-0.25, 0.25, st); f.headingError = round2(v);
    [v, st] = num(-1.2, 1.2, st); f.laneOffset = round2(v);
    [v, st] = num(3, 10, st); f.speed = round2(v);
  } else { // drifting
    let v;
    [v, st] = num(2, 4, st); const drift = v;
    [v, st] = pick([-1, 1], st);
    f.laneOffset = round2(drift * v);
    [v, st] = num(0.28, 0.55, st);
    f.headingError = round2(v * (f.laneOffset > 0 ? 1 : -1));
    [v, st] = num(2, 12, st); f.speed = round2(v);
  }
  let answer = instructorAction(f);
  let nr;
  [nr, st] = Rng.next(st);
  if (nr < 0.06) { const [flip, s2] = pick(ACTIONS.filter((a) => a !== answer), st); answer = flip; st = s2; }
  return [{ features: f, answer }, st];
}
const round2 = (v) => Math.round(v * 100) / 100;

/** The deterministic table a test or a demo can train from. */
function rows(seed, count) {
  let st = Rng.seed(seed >>> 0);
  const out = [];
  const seen = new Set();
  let guard = 0;
  while (out.length < count && guard++ < count * 40) {
    let row; [row, st] = gen(st);
    const key = face(row.features);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ i: out.length, features: row.features, answer: row.answer, face: key });
  }
  return out;
}

/** Numeric values in field order (the order a driving bundle stores). */
function valuesOf(features) { return FIELDS.map((id) => features[id]); }

const api = { FIELDS, ACTIONS, FEATURES, CLEAR, face, instructorAction, gen, rows, valuesOf };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.WorkshopDriveData = api;
})();
