// city-builder/test-track.js — Stage 5: the guided test track where the student's
// published DRIVING model actually controls a car.
//
// The honesty rules the plan names, enforced here:
//   • The MODEL's action is what moves the car — forward / left / right / slow /
//     stop, through the fixed actuator mapping in city-common/driving.js.
//   • Missing input, abstention, timeout and runtime failure STOP the car.
//   • Collisions, off-road and emergency stops are recorded and shown; there is
//     no hidden successful driver behind the model.
//   • A fixed 10 Hz step: movement advances by dt = 0.1 s per inference, whatever
//     the wall clock does.
//
// The skill is resolved from the authoritative project envelope (the Workshop's
// published capability + its driver installation) and run through `store.runSkill`;
// a planted `.cap` is the offline fallback. Both go through the ONE pure simulator
// in city-common/driving.js, so the two paths can never disagree.
//
// "Try in my city" reuses the same model and observation contract on the child's
// EXISTING road network — read-only, never altering the layout. If no usable route
// exists it says so and offers the guided track.
import { createProjectStore } from '../city-common/project-store.js';
import { challengeOfCapability } from '../city-common/challenges.js';
import { parseCapability, runInference } from '../city-common/cap-runtime.js';
import {
  DRIVE_FIELDS, TRACKS, DRIVE_DT, DRIVE_MAX_STEPS,
  createCar, sense, advanceStep, checkDriveCompatibility, summarizeTrial, cityRouteTrack, runTrial,
} from '../city-common/driving.js';
import { currentLang } from './i18n.js';

const CAPS_KEY = 'p5_city_capabilities_v1';

const STR = {
  en: {
    title: 'Driving test track', subtitle: 'Your model drives this car.',
    track: 'Track', trackFull: 'Guided track', trackStraight: 'Straight', trackCurve: 'Curve', trackObstacle: 'Obstacle', trackLight: 'Traffic light', trackCity: 'Try in my city',
    run: 'Run', pause: 'Pause', step: 'Step', reset: 'Reset', repeat: 'Repeat same trial',
    dead: 'Dead sensor', noReading: 'No sensor reading — the car must stop.',
    sensors: 'Sensors', action: 'Chosen action', decisions: 'Previous decisions', notSure: 'not sure',
    noModel: 'No driving model yet. Train the Driving machine in the Workshop, then publish it here.',
    openWorkshop: 'Open the Workshop',
    mismatch: 'That model was trained on different sensor fields — it cannot drive here.',
    idle: 'Press Run. Each step is 0.1 s of driving.', running: 'Running…', paused: 'Paused.',
    planted: 'planted file', published: 'published in this project',
    outcomeGoal: 'Reached the end of the track.', outcomeCollision: 'Crashed into the obstacle.',
    outcomeOffRoad: 'Left the road.', outcomeEmergency: 'Emergency stop — the model stopped with a clear road.',
    outcomeTimeout: 'Stopped making progress (timeout).', outcomeMissing: 'No sensor reading — the car stopped.',
    outcomeFailure: 'The model failed to run — the car stopped.',
    intervention: 'Interventions', distance: 'Distance', seconds: 'Time', noRoute: 'No usable route in your city yet. Draw a longer road in the planner, or drive the guided track.',
    route: 'Route on your city roads (nothing in your layout is changed).',
    stoppedRequired: 'Waiting (a required stop: red light or blocked lane).',
    fieldLabel: { left: 'left', center: 'ahead', right: 'right', laneOffset: 'lane offset', headingError: 'heading error', speed: 'speed', trafficLight: 'traffic light', turnIntent: 'turn intent' },
    light: { 0: 'green', 1: 'amber', 2: 'red' },
    actionLabel: { forward: 'forward', left: 'left', right: 'right', slow: 'slow', stop: 'stop' },
    goal: 'Goal reached', collision: 'Collision', offRoad: 'Off-road', emergencyStop: 'Emergency stop', timeout: 'Timeout', missing: 'Missing input', failure: 'Runtime failure', noModelShort: 'No model',
  },
  'zh-Hant': {
    title: '駕駛測試賽道', subtitle: '你的模型正在駕駛這輛車。',
    track: '賽道', trackFull: '引導賽道', trackStraight: '直路', trackCurve: '彎路', trackObstacle: '障礙物', trackLight: '交通燈', trackCity: '在我的城市試',
    run: '運行', pause: '暫停', step: '單步', reset: '重設', repeat: '重複同一試行',
    dead: '感應器故障', noReading: '沒有感應讀數 —— 汽車必須停下。',
    sensors: '感應器', action: '模型選擇的動作', decisions: '之前的決定', notSure: '不確定',
    noModel: '還沒有駕駛模型。請在工作坊訓練「駕駛」機器，然後發佈到這裡。',
    openWorkshop: '開啟工作坊',
    mismatch: '這個模型是用不同的感應器欄位訓練的 —— 無法在這裡駕駛。',
    idle: '按「運行」。每一步是 0.1 秒的駕駛。', running: '運行中…', paused: '已暫停。',
    planted: '已種入檔案', published: '已發佈於此專案',
    outcomeGoal: '到達賽道終點。', outcomeCollision: '撞到障礙物。',
    outcomeOffRoad: '駛離道路。', outcomeEmergency: '緊急停車 —— 前方暢通，但模型選擇停車。',
    outcomeTimeout: '不再前進（逾時）。', outcomeMissing: '沒有感應讀數 —— 汽車停下。',
    outcomeFailure: '模型執行失敗 —— 汽車停下。',
    intervention: '介入事件', distance: '距離', seconds: '時間', noRoute: '你的城市還沒有可用的路線。請在規劃器畫一條較長的道路，或行駛引導賽道。',
    route: '在你城市道路上的路線（不會改動你的規劃）。',
    stoppedRequired: '等待中（必要的停車：紅燈或車道受阻）。',
    fieldLabel: { left: '左', center: '前方', right: '右', laneOffset: '偏離行車線', headingError: '車頭角度', speed: '車速', trafficLight: '交通燈', turnIntent: '將要轉彎' },
    light: { 0: '綠', 1: '黃', 2: '紅' },
    actionLabel: { forward: '前進', left: '左轉', right: '右轉', slow: '減速', stop: '停車' },
    goal: '到達終點', collision: '碰撞', offRoad: '駛離道路', emergencyStop: '緊急停車', timeout: '逾時', missing: '缺少輸入', failure: '執行失敗', noModelShort: '沒有模型',
  },
};
const lang = () => (currentLang() === 'zh-Hant' ? 'zh-Hant' : 'en');
const t = (key) => STR[lang()][key] ?? STR.en[key] ?? key;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ── skill resolution (identical shape to the recycling station) ──────────────
function readPlantedCaps() {
  try { const a = JSON.parse(localStorage.getItem(CAPS_KEY) || '[]'); return Array.isArray(a) ? a : []; }
  catch { return []; }
}

/** Prefer the authoritative envelope: a drive installation, else a published drive cap; planted fallback. */
export async function resolveDriveSkill() {
  try {
    const store = createProjectStore();
    await store.openActiveProject();
    const [caps, installs] = await Promise.all([store.readCapabilities(), store.readInstallations()]);
    for (const inst of Object.values(installs || {})) {
      const cap = caps?.[inst.capabilityRef];
      if (cap && checkDriveCompatibility(cap).ok) return { kind: 'installation', store, installationId: inst.id, cap, origin: t('published') };
    }
    const published = Object.values(caps || {}).find((c) => checkDriveCompatibility(c).ok);
    if (published) return { kind: 'capability', store, cap: published, origin: t('published') };
  } catch { /* no envelope yet — fall through to a planted file */ }
  for (const raw of readPlantedCaps()) {
    const parsed = parseCapability(raw);
    const cap = parsed.ok ? parsed.capability : raw;
    if (checkDriveCompatibility(cap).ok) return { kind: 'planted', cap, origin: t('planted') };
  }
  return null;
}

// ── "Try in my city": a bounded route read from the child's own roads ─────────
let citySource = null;
/** The host (city-builder.js) hands the live layout getter here. */
export function setCitySource(source) { citySource = source || null; }

// ── the modal UI ─────────────────────────────────────────────────────────────
let modal = null;
let controller = null;

function ensureModal() {
  if (modal) return modal;
  modal = document.createElement('div');
  modal.className = 'tt-modal hidden';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.innerHTML = `
    <div class="tt-card">
      <header class="tt-head">
        <div><h2>🚗 <span data-r="title"></span></h2><p class="tt-sub" data-r="subtitle"></p></div>
        <button class="tt-close" type="button" aria-label="Close">✕</button>
      </header>
      <div class="tt-controls">
        <label><span data-r="trackLabel">Track</span>
          <select data-r="track">
            <option value="full"></option><option value="straight"></option><option value="curve"></option>
            <option value="obstacle"></option><option value="light"></option><option value="city"></option>
          </select></label>
        <button class="tt-run" type="button" data-r="run"></button>
        <button class="tt-step" type="button" data-r="step"></button>
        <button class="tt-reset" type="button" data-r="reset"></button>
        <button class="tt-repeat" type="button" data-r="repeat"></button>
        <button class="tt-dead" type="button" data-r="dead" aria-pressed="false"></button>
        <a class="tt-improve" data-r="improve" hidden></a>
      </div>
      <p class="tt-status" data-r="status" aria-live="polite"></p>
      <div class="tt-main">
        <canvas class="tt-canvas" data-r="canvas" width="680" height="440" role="img" aria-label="test track"></canvas>
        <aside class="tt-panel">
          <h3 data-r="sensorsTitle"></h3><dl class="tt-sensors" data-r="sensors"></dl>
          <h3 data-r="actionTitle"></h3><div class="tt-action" data-r="action"></div>
          <h3 data-r="decisionsTitle"></h3><ol class="tt-log" data-r="log"></ol>
        </aside>
      </div>
      <footer class="tt-outcome" data-r="outcome"></footer>
    </div>`;
  document.body.append(modal);
  modal.querySelector('.tt-close').addEventListener('click', () => close());
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  return modal;
}

function paintStatic() {
  const q = (r) => modal.querySelector(`[data-r="${r}"]`);
  q('title').textContent = t('title');
  q('subtitle').textContent = t('subtitle');
  q('trackLabel').textContent = t('track');
  const sel = q('track');
  const opts = [['full', 'trackFull'], ['straight', 'trackStraight'], ['curve', 'trackCurve'], ['obstacle', 'trackObstacle'], ['light', 'trackLight'], ['city', 'trackCity']];
  opts.forEach(([v, k], i) => { sel.options[i].value = v; sel.options[i].textContent = t(k); });
  q('run').textContent = t('run');
  q('step').textContent = t('step');
  q('reset').textContent = t('reset');
  q('repeat').textContent = t('repeat');
  q('dead').textContent = t('dead');
  q('dead').setAttribute('aria-pressed', String(!!controller?.sensorDead));
  q('sensorsTitle').textContent = t('sensors');
  q('actionTitle').textContent = t('action');
  q('decisionsTitle').textContent = t('decisions');
}

const actionLabel = (a) => t('actionLabel')[a] || a;
const fieldLabel = (f) => t('fieldLabel')[f] || f;

function renderSensors(obs, decision) {
  const dl = modal.querySelector('[data-r="sensors"]');
  if (!obs) { dl.innerHTML = `<dt class="tt-noreading">${esc(t('noReading'))}</dt>`; return; }
  const lightName = (v) => t('light')[String(v)] || v;
  dl.innerHTML = DRIVE_FIELDS.map((f) => {
    const v = obs[f];
    const shown = f === 'trafficLight' ? lightName(v) : v;
    return `<dt>${esc(fieldLabel(f))}</dt><dd>${esc(shown)}</dd>`;
  }).join('');
  const box = modal.querySelector('[data-r="action"]');
  if (!decision) { box.textContent = '—'; box.dataset.action = ''; return; }
  const abstained = !!decision.abstained;
  box.textContent = abstained ? `${t('notSure')} (${decision.abstainReason || ''})` : actionLabel(decision.decision);
  box.dataset.action = abstained ? 'abstain' : decision.decision;
}

function renderLog(steps) {
  const ol = modal.querySelector('[data-r="log"]');
  const recent = steps.slice(-12).reverse();
  ol.innerHTML = recent.map((s) => {
    const a = s.abstained ? t('notSure') : actionLabel(s.action);
    return `<li class="tt-log-row" data-action="${esc(s.action)}"><span>t=${esc(s.t)}s</span> <b>${esc(a)}</b>${s.confidence != null ? ` <em>${esc(Math.round(s.confidence * 100) / 100)}</em>` : ''}${s.event ? ` <span class="tt-ev">${esc(s.event)}</span>` : ''}</li>`;
  }).join('');
}

const OUTCOME_KEY = { goal: 'outcomeGoal', collision: 'outcomeCollision', 'off-road': 'outcomeOffRoad', 'emergency-stop': 'outcomeEmergency', timeout: 'outcomeTimeout', 'missing-input': 'outcomeMissing', 'runtime-failure': 'outcomeFailure' };
const SHORT_KEY = { goal: 'goal', collision: 'collision', 'off-road': 'offRoad', 'emergency-stop': 'emergencyStop', timeout: 'timeout', 'missing-input': 'missing', 'runtime-failure': 'failure', 'no-model': 'noModelShort' };

function renderOutcome() {
  const foot = modal.querySelector('[data-r="outcome"]');
  const trial = controller.trial;
  if (!trial.done) { foot.innerHTML = ''; return; }
  const s = summarizeTrial({ outcome: trial.outcome, goalReached: trial.outcome === 'goal', steps: trial.steps, interventions: trial.interventions, actions: trial.actions, progress: trial.progress });
  const ivs = s.interventions.length ? `<p class="tt-iv">${esc(t('intervention'))}: ${s.interventions.map((i) => esc(i.type)).join(', ')}</p>` : '';
  foot.innerHTML = `<p class="tt-verdict ${trial.outcome === 'goal' ? 'ok' : 'warn'}">${esc(t(OUTCOME_KEY[trial.outcome] || 'outcomeTimeout'))}</p>
    <p class="tt-stats">${esc(t('distance'))}: <b>${esc(s.progress)}</b> · ${esc(t('seconds'))}: <b>${esc(s.seconds)}</b></p>${ivs}`;
}

// ── canvas rendering ─────────────────────────────────────────────────────────
function drawTrack() {
  const canvas = modal.querySelector('[data-r="canvas"]');
  const ctx = canvas.getContext('2d');
  const track = controller.track;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!track) return;
  const pts = track.points;
  const xs = pts.map((p) => p.x), zs = pts.map((p) => p.z);
  const pad = 40;
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const sx = (canvas.width - pad * 2) / Math.max(1, maxX - minX);
  const sz = (canvas.height - pad * 2) / Math.max(1, maxZ - minZ);
  const s = Math.min(sx, sz);
  const ox = pad - minX * s + ((canvas.width - pad * 2) - (maxX - minX) * s) / 2;
  const oz = pad - minZ * s + ((canvas.height - pad * 2) - (maxZ - minZ) * s) / 2;
  const X = (x) => ox + x * s, Z = (z) => canvas.height - (oz + z * s);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // Road surface + centre dashes.
  ctx.strokeStyle = '#3b4250'; ctx.lineWidth = Math.max(6, track.width * s);
  ctx.beginPath();
  pts.forEach((p, i) => i ? ctx.lineTo(X(p.x), Z(p.z)) : ctx.moveTo(X(p.x), Z(p.z)));
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.5; ctx.setLineDash([8, 8]);
  ctx.beginPath();
  pts.forEach((p, i) => i ? ctx.lineTo(X(p.x), Z(p.z)) : ctx.moveTo(X(p.x), Z(p.z)));
  ctx.stroke();
  ctx.setLineDash([]);
  // Goal.
  const end = pts[pts.length - 1];
  ctx.fillStyle = '#2f9e8f'; ctx.fillRect(X(end.x) - 6, Z(end.z) - 6, 12, 12);
  // Traffic light.
  if (track.light) {
    const sAt = track.light.s;
    let best = pts[0], bestD = Infinity;
    // nearest centreline point at that distance
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
      if (Math.abs(acc + d - sAt) < bestD) { best = pts[i]; bestD = Math.abs(acc + d - sAt); }
      acc += d;
    }
    const state = controller.lightNow;
    ctx.fillStyle = state === 2 ? '#e05252' : state === 1 ? '#e0b52f' : '#4aa564';
    ctx.beginPath(); ctx.arc(X(best.x), Z(best.z), 7, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#101418'; ctx.lineWidth = 2; ctx.stroke();
  }
  // Obstacles.
  ctx.fillStyle = '#e08b2f';
  for (const o of track.obstacles) { ctx.beginPath(); ctx.arc(X(o.x), Z(o.z), Math.max(4, o.r * s), 0, Math.PI * 2); ctx.fill(); }
  // Car.
  const car = controller.trial.car;
  const cx = X(car.x), cz = Z(car.z);
  ctx.save(); ctx.translate(cx, cz); ctx.rotate(-car.heading + 0);
  ctx.fillStyle = controller.trial.done ? '#8a8f98' : '#3d7ec2';
  ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, 8); ctx.lineTo(0, 5); ctx.lineTo(-6, 8); ctx.closePath(); ctx.fill();
  ctx.restore();
}

// ── the trial ────────────────────────────────────────────────────────────────
function trackFor(id) {
  if (id === 'city') return controller.cityTrack || null;
  return TRACKS[id] || TRACKS.full;
}

function resetTrial(trackId) {
  const id = trackId || controller.trackId || 'full';
  controller.trackId = id;
  if (id === 'city') {
    const roads = citySource?.getRoads ? (citySource.getRoads() || []) : [];
    const built = cityRouteTrack(roads);
    controller.cityTrack = built.ok ? built.track : null;
    controller.cityRouteNote = built;
  }
  controller.track = trackFor(id);
  if (controller.track) {
    controller.trial = { car: createCar(controller.track), steps: [], interventions: [], actions: {}, done: false, outcome: null, progress: 0, lightNow: 0, reason: null };
  } else {
    controller.trial = { car: null, steps: [], interventions: [], actions: {}, done: true, outcome: 'no-model', progress: 0, lightNow: 0 };
  }
  controller.paused = true;
  renderAll();
}

function renderAll() {
  if (!modal) return;
  const q = (r) => modal.querySelector(`[data-r="${r}"]`);
  const trial = controller.trial;
  const last = trial.steps[trial.steps.length - 1];
  let status = controller.paused ? t('idle') : t('running');
  if (controller.trackId === 'city' && controller.cityRouteNote && !controller.cityRouteNote.ok) status = t('noRoute');
  else if (controller.skill === null) status = t('noModel');
  else if (controller.mismatch) status = t('mismatch');
  else if (trial.outcome === 'stopped-required') status = t('stoppedRequired');
  q('status').textContent = status;
  q('run').textContent = controller.paused ? t('run') : t('pause');
  q('track').value = controller.trackId || 'full';
  renderSensors(last ? last.observation : (trial.car ? sense(controller.track, trial.car, 0).observation : null), last ? { abstained: last.abstained, decision: last.decision, abstainReason: last.eventDetail?.reason } : null);
  renderLog(trial.steps);
  drawTrack();
  renderOutcome();
}

/**
 * One fixed 10 Hz step for the interactive Run/Pause/Step controls.
 *
 * The decision comes from the SAME immutable installed revision, run through the
 * in-memory v2 runtime (`runInference`) — never a per-step IndexedDB write, which
 * would make a 10 Hz loop crawl. For an envelope installation the decision is
 * ALSO appended to its bounded decision log, throttled (every 10th step and the
 * terminal step) so the log stays real without becoming the bottleneck.
 */
async function stepOnce() {
  const trial = controller.trial;
  if (!trial || trial.done) return;
  const skill = controller.skill;
  if (!skill || controller.mismatch) { trial.done = true; trial.outcome = 'no-model'; renderAll(); return; }
  if (trial.steps.length >= DRIVE_MAX_STEPS) { trial.done = true; trial.outcome = 'timeout'; renderAll(); return; }
  const i = trial.steps.length;
  const time = i * DRIVE_DT;
  // A dead sensor returns no reading, so the car stops — never a hidden driver.
  if (controller.sensorDead) {
    trial.steps.push({ i, t: Math.round(time * 1000) / 1000, observation: null, decision: null, confidence: null, abstained: false, action: 'stop', pose: { x: trial.car.x, z: trial.car.z, heading: trial.car.heading, speed: 0, s: trial.progress, lateral: 0 }, event: 'missing-input', eventDetail: { type: 'missing-input' } });
    trial.interventions.push({ type: 'missing-input', at: time, reason: 'the sensor returned no reading' });
    trial.done = true; trial.outcome = 'missing-input'; trial.reason = 'missing-input';
    reportTrial();
    renderAll(); return;
  }
  const { observation } = sense(controller.track, trial.car, time);
  controller.lightNow = observation.trafficLight;
  let inference = null;
  let failure = null;
  try {
    inference = runInference(skill.cap, observation);
  } catch (e) { failure = String(e?.message || e); }

  if (failure) {
    trial.steps.push({ i, t: Math.round(time * 1000) / 1000, observation, decision: null, confidence: null, abstained: false, action: 'stop', pose: { x: trial.car.x, z: trial.car.z, heading: trial.car.heading, speed: 0, s: trial.progress, lateral: 0 }, event: 'runtime-failure', eventDetail: { type: 'runtime-failure', message: failure } });
    trial.interventions.push({ type: 'runtime-failure', at: time, reason: failure });
    trial.done = true; trial.outcome = 'runtime-failure'; trial.reason = failure;
    renderAll(); return;
  }
  const advanced = advanceStep(controller.track, trial.car, inference, { t: time, dt: DRIVE_DT, step: i });
  trial.car = advanced.car;
  trial.steps.push(advanced.record);
  trial.actions[advanced.record.action] = (trial.actions[advanced.record.action] || 0) + 1;
  trial.progress = advanced.record.pose.s;
  const ev = advanced.record.event;
  if (ev === 'emergency-stop') trial.interventions.push({ type: 'emergency-stop', at: advanced.record.t, reason: advanced.record.eventDetail?.reason || 'the model stopped with a clear road' });
  if (ev === 'collision') trial.interventions.push({ type: 'collision', at: advanced.record.t, reason: String(advanced.record.eventDetail?.obstacle || 'obstacle') });
  if (ev === 'off-road') trial.interventions.push({ type: 'off-road', at: advanced.record.t, reason: `lateral ${advanced.record.eventDetail?.lateral}` });
  if (ev === 'goal') { trial.done = true; trial.outcome = 'goal'; }
  else if (ev === 'collision') { trial.done = true; trial.outcome = 'collision'; }
  else if (ev === 'off-road') { trial.done = true; trial.outcome = 'off-road'; }
  else if (ev === 'emergency-stop') { trial.done = true; trial.outcome = 'emergency-stop'; }
  if (skill.kind === 'installation' && (!trial.done ? i % 10 === 0 : true)) recordDecision(skill, observation);
  if (trial.done) reportTrial();
  renderAll();
}

/** Append one decision to the envelope's bounded log — fire and forget. */
function recordDecision(skill, observation) {
  try { Promise.resolve(skill.store.runSkill(skill.installationId, observation)).catch(() => {}); } catch { /* the visual sim never fails on a log write */ }
}

/**
 * Report a finished trial as evidence (implementation plan §2), once per trial.
 * The driver has no per-item ground truth, so the goal is the single graded
 * "item": a revision that reaches the goal on a track it previously failed is
 * the honest revision-fixed case. The challenge scope — not the car — is the key.
 */
function reportTrial() {
  const skill = controller?.skill;
  const trial = controller?.trial;
  if (!skill || !skill.store || typeof skill.store.recordChallengeOutcome !== 'function') return;
  if (!trial || !trial.done) return;
  if (controller._reportedTrial === trial) return;
  controller._reportedTrial = trial;
  const challengeId = challengeOfCapability(skill.cap);
  if (!challengeId) return;
  const steps = trial.steps || [];
  const abstained = steps.filter((s) => s.abstained).length;
  const interventions = trial.interventions || [];
  const trackId = controller.trackId || 'full';
  const events = [
    { type: 'held-out-eval', evidence: { challengeId, trackId, outcome: trial.outcome, steps: steps.length, interventions: interventions.length } },
  ];
  if (skill.kind === 'installation') events.push({ type: 'city-install', evidence: { challengeId, installationId: skill.installationId, trackId, outcome: trial.outcome } });
  if (abstained > 0) events.push({ type: 'abstain-demo', evidence: { challengeId, source: 'test-track', trackId, abstained } });
  const revision = Number(skill.cap?.revision || 1);
  const gradedIds = ['goal'];
  const wrongIds = trial.outcome === 'goal' ? [] : ['goal'];
  // The goal is the run's single graded item; `abstain-demo` needs both an
  // abstention AND a correct graded answer in the same run, so a trial that
  // never reached the goal cannot demonstrate "I know when I'm unsure".
  const correctCount = trial.outcome === 'goal' ? 1 : 0;
  Promise.resolve()
    .then(() => skill.store.recordChallengeOutcome(challengeId, { revision, scenario: { kind: 'track', seed: trackId }, gradedIds, wrongIds, abstained, correctCount }, events))
    .catch(() => { /* a missing wallet must never break the trial */ });
}

/**
 * The whole trial, run to completion with the PURE simulator (no per-step
 * IndexedDB or repaint), then mirrored into the UI once — the browser
 * integration run's entry point.
 */
async function runWhole({ trackId, maxSteps = DRIVE_MAX_STEPS } = {}) {
  if (trackId && trackId !== controller.trackId) resetTrial(trackId);
  if (!controller.track) return { ok: false, error: 'no-track', route: controller.cityRouteNote || null };
  if (!controller.skill) return { ok: false, error: 'no-model' };
  if (controller.mismatch) return { ok: false, error: 'mismatch' };
  const trial = runTrial({ cap: controller.skill.cap, track: controller.track, maxSteps, failSensor: !!controller.sensorDead });
  const last = trial.steps[trial.steps.length - 1];
  controller.trial = {
    car: last ? { x: last.pose.x, z: last.pose.z, heading: last.pose.heading, speed: last.pose.speed } : createCar(controller.track),
    steps: trial.steps, interventions: trial.interventions, actions: trial.actions,
    done: true, outcome: trial.outcome, progress: trial.progress,
    lightNow: last && last.observation ? last.observation.trafficLight : 0, reason: trial.reason || null,
  };
  controller.paused = true;
  if (controller.skill.kind === 'installation' && last && last.observation) recordDecision(controller.skill, last.observation);
  reportTrial();
  renderAll();
  const s = summarizeTrial(trial);
  return { ok: true, trackId: controller.trackId, ...s, decisions: trial.steps.map((x) => ({ t: x.t, action: x.action, decision: x.decision, abstained: x.abstained, event: x.event })) };
}

function schedule() {
  if (controller.paused || controller.trial.done) return;
  const started = Date.now();
  stepOnce().then(() => {
    if (controller.paused || controller.trial.done) return;
    controller.timer = setTimeout(schedule, Math.max(0, DRIVE_DT * 1000 - (Date.now() - started)));
  });
}

function setRunning(run) {
  controller.paused = !run;
  if (run) { controller.timer = setTimeout(schedule, 0); } else if (controller.timer) { clearTimeout(controller.timer); controller.timer = null; }
  renderAll();
}

function close() { if (controller?.timer) { clearTimeout(controller.timer); controller.timer = null; } controller.paused = true; if (modal) modal.classList.add('hidden'); }

function bind() {
  const q = (r) => modal.querySelector(`[data-r="${r}"]`);
  q('run').addEventListener('click', () => setRunning(controller.paused));
  q('step').addEventListener('click', async () => { controller.paused = true; await stepOnce(); renderAll(); });
  q('reset').addEventListener('click', () => { if (controller.timer) clearTimeout(controller.timer); resetTrial(controller.trackId); });
  q('repeat').addEventListener('click', async () => { if (controller.timer) clearTimeout(controller.timer); resetTrial(controller.trackId); await runWhole({}); });
  q('track').addEventListener('change', (e) => { if (controller.timer) clearTimeout(controller.timer); resetTrial(e.target.value); });
  // Dead-sensor control: the honest "missing input" stop, now reachable in the UI.
  q('dead').addEventListener('click', () => {
    if (controller.timer) { clearTimeout(controller.timer); controller.timer = null; }
    controller.sensorDead = !controller.sensorDead;
    q('dead').setAttribute('aria-pressed', String(controller.sensorDead));
    resetTrial(controller.trackId);
  });
}

/**
 * Open the test track. Resolves the student's driving skill first so the UI is
 * honest about what it will run. Returns the controller (for the integration run).
 */
export async function openTestTrack() {
  controller = controller || {
    open: () => {}, close: () => {}, runWhole, stepOnce, reset: resetTrial, resolve: async function () { this.skill = await resolveDriveSkill(); this.mismatch = !!(this.skill && !checkDriveCompatibility(this.skill.cap).ok); return this.skill; },
    skill: null, mismatch: false, trackId: 'full', track: TRACKS.full, cityTrack: null, cityRouteNote: null,
    trial: null, paused: true, timer: null, lightNow: 0, sensorDead: false,
  };
  controller.skill = await resolveDriveSkill();
  controller.mismatch = !!(controller.skill && !checkDriveCompatibility(controller.skill.cap).ok);
  ensureModal(); paintStatic(); bindOnce();
  const improve = modal.querySelector('[data-r="improve"]');
  try {
    const url = new URL('../workshop/', location.href);
    url.searchParams.set('publishTarget', 'city');
    url.searchParams.set('skill', 'drive');
    url.searchParams.set('returnTo', location.href);
    improve.href = url.href; improve.hidden = false;
    improve.textContent = controller.skill ? t('openWorkshop') : t('openWorkshop');
  } catch { improve.removeAttribute('href'); }
  resetTrial(controller.trackId || 'full');
  modal.classList.remove('hidden');
  return controller;
}

let bound = false;
function bindOnce() { if (bound) return; bound = true; bind(); }

// A stable handle for the browser integration run; also lets the City's own
// button open the track without importing the module twice.
if (typeof window !== 'undefined') window.__testTrack = { open: openTestTrack, setCitySource, cityRouteTrack, get controller() { return controller; } };
