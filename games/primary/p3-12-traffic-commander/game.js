/* =========================================================================
   game.js — Traffic Commander orchestrator (loaded last).
   Owns the state machine, the six level scripts, the render/update loop,
   canvas sizing, input handling, and all UI wiring. Delegates simulation to
   traffic.js, drawing to renderer.js, dialogue to flux.js/intents.js, and the
   exam to quiz.js.
   ========================================================================= */
const Game = (() => {
  'use strict';

  const sim = Traffic.sim;

  /* ---------- level metadata ---------- */
  const META = {
    1: { icon: '🚗', text: 'LEVEL 1: SENSOR DATA — How AI Reads the Road', cls: 'c-sensor', concept: 'sensor', status: 'sensing', tab: 'SENSE' },
    2: { icon: '📊', text: 'LEVEL 2: LOAD PREDICTION — How AI Sees the Future', cls: 'c-prediction', concept: 'prediction', status: 'predicting', tab: 'PREDICT' },
    3: { icon: '🚲', text: 'LEVEL 3: SIGNAL FILTERING — Don\u2019t Believe Everything You Sense', cls: 'c-filtering', concept: 'filtering', status: 'filtering', tab: 'FILTER' },
    4: { icon: '🚦', text: 'LEVEL 4: PRIORITY OPTIMIZATION — Who Goes First?', cls: 'c-priority', concept: 'priority', status: 'prioritizing', tab: 'PRIORITY' },
    5: { icon: '🤖', text: 'LEVEL 5: AI AUTOMATION — Flux Runs the Show', cls: 'c-automation', concept: 'automation', status: 'autonomous', tab: 'AUTO' },
    6: { icon: '✏️', text: 'LEVEL 6: TRANSPORT DEPT. BRIEFING — AI Literacy', cls: 'c-quiz', concept: 'sensor', status: 'certified', tab: 'DEPT' }
  };

  const RECAP = {
    1: '🧠 You just taught Flux: <strong>Sensor Data</strong> — AI gets information about the world through sensors. The inductive loop is how Flux "sees" cars!',
    2: '🧠 You just taught Flux: <strong>Load Prediction</strong> — AI watches how fast the bar rises and predicts when the lane will overflow.',
    3: '🧠 You just taught Flux: <strong>Signal Filtering</strong> — AI ignores weak signals (bikes) and acts on strong ones (cars).',
    4: '🧠 You just taught Flux: <strong>Priority Optimization</strong> — AI compares many inputs and serves the most urgent lane first.',
    5: '🧠 You just taught Flux: <strong>Automation</strong> — AI follows the rules humans set, so it can manage traffic all by itself.'
  };

  /* ---------- runtime state ---------- */
  let mode = 'loading';           // loading | menu | playing | result | certificate
  let level = 1;
  let L = {};                     // per-level scratch state
  let canvas, ctx, W = 1000, H = 620, dpr = 1;
  let rafId = null, lastT = 0;
  let renderOpts = {};

  /* ============================================================
     Small scheduling helper tied to the game loop (pause-safe).
     ============================================================ */
  function after(sec, fn) { L.pending.push({ t: sec, fn }); }
  function runPending(dt) {
    if (!L.pending) return;
    for (const p of L.pending) p.t -= dt;
    const ready = L.pending.filter((p) => p.t <= 0);
    L.pending = L.pending.filter((p) => p.t > 0);
    ready.forEach((p) => p.fn());
  }

  /* ============================================================
     Canvas sizing
     ============================================================ */
  function resize() {
    const wrap = canvas.parentElement;
    const rect = wrap.getBoundingClientRect();
    W = Math.max(320, rect.width);
    H = Math.max(280, rect.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* Which lane was tapped, given a client-space x within the canvas. */
  function laneIndexAt(clientX) {
    const rect = canvas.getBoundingClientRect();
    const px = clientX - rect.left;
    const PAD = 14, gap = sim.laneCount > 1 ? 12 : 0;
    const areaW = W - PAD * 2;
    const laneW = (areaW - gap * (sim.laneCount - 1)) / sim.laneCount;
    for (let i = 0; i < sim.laneCount; i++) {
      const x0 = PAD + i * (laneW + gap);
      if (px >= x0 && px <= x0 + laneW) return i;
    }
    return -1;
  }

  /* ============================================================
     Feedback helpers
     ============================================================ */
  const flashEl = () => document.getElementById('flash');
  function flash(text, kind, ms = 1100) {
    const el = flashEl();
    if (!el) return;
    el.style.display = '';           // restore CSS display after any clearFlash()
    el.textContent = text;
    el.className = 'flash pop show ' + (kind || 'info');
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.className = 'flash'; }, ms);
  }
  /* FIX 3: fully wipe any stale flash message so a gridlock/flush banner from a
     previous level can never linger after a level switch. Called from setupLevel(). */
  function clearFlash() {
    const el = flashEl();
    if (!el) return;
    clearTimeout(el._t);
    el._t = null;
    el.textContent = '';
    el.className = 'flash';
    el.style.display = 'none';
  }
  function shake() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const w = canvas.parentElement;
    w.classList.remove('shake'); void w.offsetWidth; w.classList.add('shake');
  }
  function setHUD(round, total) {
    document.getElementById('roundInfo').textContent = total ? `Round ${round} / ${total}` : '';
  }

  /* ============================================================
     Controls visibility per level
     ============================================================ */
  function configureControls() {
    const flushBtn = document.getElementById('btnFlush');
    const laneBtns = document.getElementById('laneButtons');
    const autoPanel = document.getElementById('autoPanel');
    const retry = document.getElementById('btnRetry');
    retry.hidden = true;
    if (level >= 1 && level <= 3) {
      flushBtn.hidden = false; flushBtn.disabled = false;
      laneBtns.hidden = true; autoPanel.hidden = true;
    } else if (level === 4) {
      flushBtn.hidden = true; laneBtns.hidden = false; autoPanel.hidden = true;
      buildLaneButtons();
    } else if (level === 5) {
      flushBtn.hidden = true; laneBtns.hidden = true; autoPanel.hidden = false;
      resetAutoPanel();
    } else {
      flushBtn.hidden = true; laneBtns.hidden = true; autoPanel.hidden = true;
    }
  }

  function buildLaneButtons() {
    const wrap = document.getElementById('laneButtons');
    wrap.innerHTML = '';
    const colors = ['#3498DB', '#1ABC9C', '#E67E22', '#9B59B6'];
    for (let i = 0; i < sim.laneCount; i++) {
      const b = document.createElement('button');
      b.className = 'lane-flush-btn';
      b.style.background = colors[i % colors.length];
      b.innerHTML = `🚦 Lane ${sim.lanes[i].id}<span class="lf-pct" data-lane="${i}">0%</span>`;
      b.setAttribute('aria-label', `Flush lane ${sim.lanes[i].id}`);
      b.addEventListener('click', () => doFlush(i));
      wrap.appendChild(b);
    }
  }
  function updateLaneButtons() {
    document.querySelectorAll('.lf-pct').forEach((el) => {
      const i = parseInt(el.getAttribute('data-lane'), 10);
      if (sim.lanes[i]) el.textContent = Math.round(sim.lanes[i].fill) + '%';
    });
  }

  function resetAutoPanel() {
    const slider = document.getElementById('triggerSlider');
    slider.value = L.trigger || 70;
    document.getElementById('triggerVal').textContent = slider.value;
    document.getElementById('wasteCount').textContent = '0';
    document.getElementById('overCount').textContent = '0';
    document.getElementById('btnAutoRun').textContent = '▶ Run Auto-Pilot';
    document.getElementById('btnAutoRun').disabled = false;
  }

  /* ============================================================
     LEVEL SETUP dispatch
     ============================================================ */
  function setupLevel(n, source) {
    /* FIX 1 (guard): log every level setup with the source that triggered it.
       Legitimate sources are: 'nav' (a level tab), 'next-button', 'replay-button',
       'quiz-fail', and 'start'. If a level ever loads with source 'unknown' right
       after tapping Settings/Transcript, that is the race condition — this trace
       makes it obvious. Opening Settings must NEVER reach here. */
    console.log('[Traffic Commander] setupLevel(' + n + ') source=' + (source || 'unknown'));
    stopLoop();
    clearFlash();                    // FIX 3: never carry a stale flash across a level switch
    level = n;
    L = { pending: [], phase: 'idle' };
    // banner
    const m = META[n];
    const banner = document.getElementById('banner');
    banner.className = 'level-banner ' + m.cls;
    banner.querySelector('.banner-icon').textContent = m.icon;
    banner.querySelector('.banner-text').textContent = m.text;
    // nav highlight
    updateNav();
    // flux
    Flux.setLevel(n);
    renderOpts = { level: n, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches };
    document.getElementById('predictTag').hidden = true;

    // stage vs quiz
    const quizHost = document.getElementById('quizHost');
    if (n === 6) {
      canvas.style.display = 'none';
      document.querySelector('.stage-hud').style.display = 'none';
      quizHost.hidden = false;
      configureControls();
      Quiz.mount(quizHost, onQuizComplete);
      mode = 'playing';
      return;
    } else {
      canvas.style.display = 'block';
      document.querySelector('.stage-hud').style.display = 'flex';
      quizHost.hidden = true;
    }

    // Run the level setup FIRST so the sim is reset to the correct lane count
    // and per-level state (e.g. L.trigger) exists before controls are built.
    mode = 'playing';
    LEVELS[n].setup();
    configureControls();
    startLoop();
  }

  /* ============================================================
     FLUSH dispatch (button / lane tap / canvas tap)
     ============================================================ */
  function doFlush(index) {
    if (mode !== 'playing') return;
    SFX.resume();
    if (level >= 1 && level <= 3) index = 0;
    if (index < 0 || index >= sim.laneCount) return;
    LEVELS[level].onFlush(index);
  }

  /* ============================================================
     LEVEL SCRIPTS
     ============================================================ */
  const LEVELS = {

    /* ---------- LEVEL 1: SENSOR DATA (4 rounds, increasing fill speed) ---------- */
    1: {
      rounds: [
        { vehicle: 'sedan', rate: 12, label: 'a sedan — slow fill' },
        { vehicle: 'van', rate: 18, label: 'a family van — medium fill' },
        { vehicle: 'truck', rate: 28, label: 'a delivery truck — fast fill!' },
        { vehicle: 'van', rate: 35, label: 'a convoy — very fast!' }
      ],
      setup() {
        sim.reset(1);
        L.round = 0; L.total = this.rounds.length;
        this.startRound();
      },
      startRound() {
        const r = this.rounds[L.round];
        sim.configLane(0, { fillRate: r.rate, cap: null, fill: 0 });
        sim.addVehicle(0, r.vehicle);
        Flux.addVehicles(1);
        SFX.play[r.vehicle === 'truck' ? 'truckArrive' : 'carArrive']();
        L.phase = 'active';
        setHUD(`Round ${L.round+1}/${L.total} — ${r.label}`);
        Flux.showBubble(`Round ${L.round+1}: ${r.label}. Flush when the bar turns RED!`);
      },
      onFlush(i) {
        if (L.phase !== 'active') return;
        const scored = sim.lane(0).fill;
        if (scored >= 80) {
          Flux.correctFlush(); SFX.play.flush(); SFX.play.success();
          flash('✅ Signal cleared!', 'ok');
          sim.flush(0); L.phase = 'clearing';
          after(1.0, () => this.advance());
        } else {
          Flux.falseFlush(); SFX.play.wasted();
          flash('⏳ Too early — wait for the RED zone!', 'info');
          sim.flush(0); L.phase = 'respawn';
          after(1.0, () => this.startRound());
        }
      },
      advance() {
        L.round++;
        if (L.round >= L.total) completeLevel();
        else this.startRound();
      },
      onUpdate() {
        const lane = sim.lane(0);
        if (lane.overflowed && L.phase === 'active') {
          Flux.falseFlush(); SFX.play.overflow(); shake();
          flash('💥 GRIDLOCK! You waited too long.', 'bad', 1400);
          sim.clearOverflow(); sim.flush(0); L.phase = 'respawn';
          after(1.2, () => this.startRound());
        }
      }
    },

    /* ---------- LEVEL 2: LOAD PREDICTION (2 lanes, compare + predict) ---------- */
    2: {
      rounds: [
        { lanes: [{count:3,rate:10},{count:4,rate:14}], label:'Lane B fills faster' },
        { lanes: [{count:5,rate:18},{count:2,rate:8}], label:'Lane A fills faster' },
        { lanes: [{count:4,rate:8},{count:6,rate:24}], label:'Lane B is about to overflow!' }
      ],
      setup() {
        sim.reset(2);
        L.round = 0; L.total = this.rounds.length;
        renderOpts.showPrediction = true; renderOpts.predictSeconds = 3;
        document.getElementById('predictTag').hidden = false;
        this.startRound();
      },
      startRound() {
        const r = this.rounds[L.round];
        const types = ['sedan','car','van','sedan','car','van','truck'];
        r.lanes.forEach((cfg, i) => {
          sim.configLane(i, { fillRate: cfg.rate, cap: null, fill: 0 });
          for (let k = 0; k < cfg.count; k++) sim.addVehicle(i, types[k % types.length]);
        });
        Flux.addVehicles(r.lanes.reduce((a,b) => a+b.count, 0));
        SFX.play.carArrive();
        L.phase = 'active';
        L.correctLane = r.lanes[1].rate > r.lanes[0].rate ? 1 : 0;
        setHUD(`Round ${L.round+1}/${L.total} — ${r.label}`);
        Flux.showBubble(`Compare both lanes! Watch the prediction lines. Flush the lane that will OVERFLOW first.`);
      },
      onFlush(i) {
        if (L.phase !== 'active') return;
        const correct = i === L.correctLane;
        const scored = sim.lane(i).fill;
        if (correct) {
          if (scored >= 50) {
            Flux.correctFlush(); SFX.play.flush(); SFX.play.success();
            flash('✅ Right lane! Predicted & cleared.', 'ok');
            sim.flush(i); L.phase = 'clearing';
            after(1.0, () => this.advance());
          } else {
            Flux.falseFlush(); SFX.play.wasted();
            flash('⏳ Right lane, but too early! Wait for the prediction line.', 'info');
            sim.flush(i); L.phase = 'respawn';
            after(1.0, () => this.startRound());
          }
        } else {
          Flux.falseFlush(); SFX.play.wasted();
          flash(`❌ Wrong lane! Lane ${sim.lane(L.correctLane).id} is about to overflow.`, 'bad');
          sim.flush(i);
        }
      },
      advance() {
        L.round++;
        if (L.round >= L.total) completeLevel();
        else this.startRound();
      },
      onUpdate(dt) {
        // Show prediction for both lanes
        for (let i = 0; i < 2; i++) {
          const lane = sim.lane(i);
          const secs = Sensors.overflowSeconds(lane);
          if (i === 0) { const tag = document.getElementById('predictSecs'); if (tag) tag.textContent = (secs === Infinity ? '∞' : secs.toFixed(1)); }
          if (lane.overflowed && L.phase === 'active') {
            Flux.falseFlush(); SFX.play.overflow(); shake();
            flash(`💥 Lane ${lane.id} overflowed! Predicted it sooner.`, 'bad', 1400);
            sim.clearOverflow(); sim.flush(i); L.phase = 'respawn';
            after(1.2, () => this.startRound());
          }
        }
      }
    },

    /* ---------- LEVEL 3: SIGNAL FILTERING (2 lanes, discriminate + compare) ---------- */
    3: {
      scenarios: [
        { weakLane:0, weak:'bike', weakRate:30, cap:10, realLane:1, real:'car', realRate:14, weakName:'bike' },
        { weakLane:1, weak:'motorcycle', weakRate:40, cap:30, realLane:0, real:'van', realRate:16, weakName:'motorcycle' },
        { weakLane:0, weak:'pedestrian', weakRate:25, cap:5, realLane:1, real:'truck', realRate:22, weakName:'person' }
      ],
      setup() {
        sim.reset(2);
        L.round = 0; L.total = this.scenarios.length;
        this.startScenario();
      },
      startScenario() {
        const s = this.scenarios[L.round];
        // Lane 0: weak signal or real signal
        sim.configLane(s.weakLane, { fillRate: s.weakRate, cap: s.cap, fill: 0 });
        sim.addVehicle(s.weakLane, s.weak);
        // Lane 1: real signal or weak signal
        sim.configLane(s.realLane, { fillRate: s.realRate, cap: null, fill: 0 });
        sim.addVehicle(s.realLane, s.real);
        Flux.addVehicles(2);
        SFX.play.bikeDing();
        L.phase = 'weak'; L.waitTimer = 3.0;
        L.weakFlashed = false;
        setHUD(`Round ${L.round+1}/${L.total} — which lane has real traffic?`);
        // Show hint for 2 seconds
        setTimeout(() => {
          if (L.phase === 'weak') {
            flash(`🔍 Lane ${sim.lane(s.realLane).id} has a real vehicle. Flush it! Lane ${sim.lane(s.weakLane).id} is just a ${s.weakName}.`, 'info', 2000);
          }
        }, 1500);
      },
      onFlush(i) {
        const s = this.scenarios[L.round];
        if (L.phase === 'weak' || L.phase === 'real') {
          // Flushing the weak lane = wrong
          if (i === s.weakLane) {
            Flux.falseFlush(); SFX.play.wasted();
            flash(`❌ Lane ${sim.lane(i).id} is just a ${s.weakName}! Flush the REAL lane.`, 'bad', 1300);
            return;
          }
          // Flushing the real lane
          if (i === s.realLane) {
            const scored = sim.lane(i).fill;
            if (scored >= 80) {
              Flux.correctFlush(); SFX.play.flush(); SFX.play.success();
              flash('✅ Real traffic cleared!', 'ok');
              sim.flush(i); L.phase = 'clearing';
              after(1.0, () => this.advance());
            } else if (L.phase === 'real' || scored >= 50) {
              // Allow flush once real lane is decently filled
              Flux.correctFlush(); SFX.play.flush(); SFX.play.success();
              flash('✅ Cleared!', 'ok');
              sim.flush(i); L.phase = 'clearing';
              after(1.0, () => this.advance());
            } else {
              SFX.play.wasted();
              flash('⏳ Wait — the bar isn\'t near the red zone yet.', 'info');
            }
          }
        }
      },
      advance() {
        L.round++;
        if (L.round >= L.total) completeLevel();
        else this.startScenario();
      },
      onUpdate(dt) {
        const s = this.scenarios[L.round];
        if (!s) return;
        // Once weak lane shows clear cap behavior, auto-advance to real phase
        if (L.phase === 'weak') {
          const weakLane = sim.lane(s.weakLane);
          // If weak lane has capped (fill stopped at cap) and it's been long enough
          if (weakLane.fill >= (weakLane.cap || 100) * 0.9 && !L.weakFlashed) {
            L.weakFlashed = true;
            flash(`👀 Lane ${sim.lane(s.weakLane).id} is capped (${s.weakName}). Lane ${sim.lane(s.realLane).id} has real traffic — flush it!`, 'info', 2000);
          }
          L.waitTimer -= dt;
          if (L.waitTimer <= 0) {
            L.phase = 'real';
          }
        }
        // Overflow check for real lane
        const realLane = sim.lane(s.realLane);
        if (realLane.overflowed && (L.phase === 'weak' || L.phase === 'real')) {
          Flux.falseFlush(); SFX.play.overflow(); shake();
          flash(`💥 Lane ${realLane.id} overflowed! You waited too long.`, 'bad', 1300);
          sim.clearOverflow(); sim.flush(s.realLane); L.phase = 'respawn';
          after(1.2, () => this.startScenario());
        }
      }
    },

    /* ---------- LEVEL 4: PRIORITY OPTIMIZATION ---------- */
    4: {
      rounds: [
        { rates: [10, 8, 7, 6], duration: 16 },
        { rates: [13, 11, 9, 7], duration: 18 },
        { rates: [16, 13, 11, 9], duration: 20 }
      ],
      COOLDOWN: 1.3,
      setup() {
        sim.reset(4);
        L.round = 0; L.total = this.rounds.length;
        renderOpts.markHighest = true;   // scaffold: crown over the longest queue
        this.startRound();
      },
      startRound() {
        const r = this.rounds[L.round];
        // shuffle rates across lanes so the "highest" changes each round
        const rates = shuffle(r.rates.slice());
        for (let i = 0; i < 4; i++) {
          sim.configLane(i, { fillRate: rates[i], cap: null, fill: 5 + Math.random() * 25 });
          const seed = 1 + Math.floor(Math.random() * 2);
          for (let k = 0; k < seed; k++) sim.addVehicle(i, k === 0 ? 'sedan' : 'car');
        }
        Flux.addVehicles(8);
        L.phase = 'active'; L.timer = r.duration; L.cooldown = 0;
        setHUD(L.round + 1, L.total);
        Flux.showBubble(`Round ${L.round + 1}: keep all 4 lanes flowing for ${r.duration}s. Flush the HIGHEST (👑) lane first!`);
      },
      onFlush(i) {
        if (L.phase !== 'active') return;
        if (L.cooldown > 0) { SFX.play.click(); flash('Wait for the next green cycle…', 'info', 700); return; }
        const highest = sim.highestIndex();
        const lane = sim.lane(i);
        // reward correct priority; still allow the flush either way
        if (i === highest || lane.fill >= sim.lane(highest).fill - 8) {
          Flux.correctFlush(); SFX.play.flush();
        } else {
          Flux.falseFlush(); SFX.play.wasted();
          flash(`Lane ${sim.lane(highest).id} was longer!`, 'info', 900);
        }
        sim.flush(i);
        L.cooldown = this.COOLDOWN;
        // keep traffic coming: reseed this lane after its green ends
        after(Traffic.GREEN_MS / 1000 + 0.05, () => {
          if (L.phase === 'active') { sim.addVehicle(i, Math.random() < 0.5 ? 'sedan' : 'car'); Flux.addVehicles(1); }
        });
      },
      onUpdate(dt) {
        if (L.phase !== 'active') return;
        if (L.cooldown > 0) L.cooldown = Math.max(0, L.cooldown - dt);
        updateLaneButtons();
        // trickle new arrivals so lanes keep filling
        L._spawnAcc = (L._spawnAcc || 0) + dt;
        if (L._spawnAcc > 2.4) {
          L._spawnAcc = 0;
          const idx = Math.floor(Math.random() * 4);
          if (sim.lane(idx).light === 'red' && sim.lane(idx).vehicles.length < 5) {
            sim.addVehicle(idx, 'car'); Flux.addVehicles(1);
          }
        }
        // overflow check
        const of = sim.lanes.find((l) => l.overflowed);
        if (of) {
          SFX.play.overflow(); shake();
          flash(`Lane ${of.id} gridlocked! Try again.`, 'bad', 1400);
          sim.clearOverflow(); L.phase = 'fail';
          after(1.5, () => this.startRound());
          return;
        }
        // survive timer
        L.timer -= dt;
        if (L.timer <= 0) {
          L.phase = 'done'; SFX.play.success();
          flash('Round survived! ✓', 'ok');
          after(1.0, () => this.advance());
        } else {
          setHUD(`${L.round + 1}`, L.total);
          document.getElementById('roundInfo').textContent = `Round ${L.round + 1}/${L.total} · ${Math.ceil(L.timer)}s left`;
        }
      },
      advance() {
        L.round++;
        if (L.round >= L.total) completeLevel();
        else this.startRound();
      }
    },

    /* ---------- LEVEL 5: AUTOMATION ---------- */
    5: {
      subRounds: [
        { name: 'Morning Rush', rates: [12, 4, 9, 3], duration: 14 },
        { name: 'Midday', rates: [8, 7, 7, 6], duration: 14 },
        { name: 'Evening Rush', rates: [10, 9, 9, 8], duration: 16 }
      ],
      CYCLE: 1.6,           // seconds between Flux auto-decisions (one green cycle)
      WASTE_BELOW: 60,      // flushing a lane below this = wasted cycle
      WASTE_LIMIT: 4,
      setup() {
        sim.reset(4);
        L.round = 0; L.total = this.subRounds.length;
        L.trigger = 70; L.running = false;
        renderOpts.markHighest = true;
        renderOpts.triggerLevel = L.trigger;
        this.prime();
      },
      prime() {
        const s = this.subRounds[L.round];
        L.rates = s.rates.slice();
        // Freeze the lanes (fillRate 0) while the child sets the trigger; bars
        // only start rising once Run is pressed. Prevents pre-fill/overflow.
        for (let i = 0; i < 4; i++) {
          sim.lane(i).vehicles = [];
          sim.lane(i).light = 'red'; sim.lane(i).greenTimer = 0; sim.lane(i).driveOff = false;
          sim.configLane(i, { fillRate: 0, cap: null, fill: 0 });
          sim.addVehicle(i, 'sedan');
        }
        sim.clearOverflow();
        Flux.addVehicles(4);
        L.waste = 0; L.overflow = 0; L.cooldown = 0; L.running = false;
        document.getElementById('wasteCount').textContent = '0';
        document.getElementById('overCount').textContent = '0';
        document.getElementById('btnAutoRun').textContent = '▶ Run Auto-Pilot';
        document.getElementById('btnAutoRun').disabled = false;
        setHUD(L.round + 1, L.total);
        document.getElementById('roundInfo').textContent = `${s.name} (${L.round + 1}/${L.total})`;
        Flux.showBubble(`${s.name}: set my Trigger Level, then press Run. Too low wastes green, too high overflows!`);
        L.phase = 'setup';
      },
      run() {
        if (L.phase === 'running') return;
        const s = this.subRounds[L.round];
        // fresh start: reset fills and apply this sub-round's rates
        for (let i = 0; i < 4; i++) {
          sim.lane(i).vehicles = [];
          sim.lane(i).light = 'red'; sim.lane(i).greenTimer = 0; sim.lane(i).driveOff = false;
          sim.configLane(i, { fillRate: L.rates[i], cap: null, fill: 0 });
          sim.addVehicle(i, 'sedan');
        }
        sim.clearOverflow();
        L.phase = 'running'; L.running = true; L.timer = s.duration; L.cooldown = 0.4;
        L.waste = 0; L.overflow = 0;
        document.getElementById('wasteCount').textContent = '0';
        document.getElementById('overCount').textContent = '0';
        document.getElementById('btnAutoRun').disabled = true;
        document.getElementById('btnAutoRun').textContent = '⏳ Flux is driving…';
        Flux.showBubble(`Running ${s.name} at ${L.trigger}% trigger. Watch me manage all four lanes!`);
      },
      onUpdate(dt) {
        renderOpts.triggerLevel = L.trigger;
        updateLaneButtons();
        if (L.phase !== 'running') return;

        // trickle arrivals to keep lanes fed
        L._acc = (L._acc || 0) + dt;
        if (L._acc > 1.8) {
          L._acc = 0;
          for (let i = 0; i < 4; i++) if (sim.lane(i).vehicles.length < 6 && sim.lane(i).light === 'red') sim.addVehicle(i, 'car');
        }

        // Flux auto-decision cycle
        L.cooldown -= dt;
        if (L.cooldown <= 0) {
          L.cooldown = this.CYCLE;
          const hi = sim.highestIndex();
          const lane = sim.lane(hi);
          if (lane.fill >= L.trigger) {
            if (lane.fill < this.WASTE_BELOW) {
              L.waste++; document.getElementById('wasteCount').textContent = L.waste;
              SFX.play.wasted();
            } else {
              Flux.correctFlush(); SFX.play.flush();
            }
            sim.flush(hi);
            after(Traffic.GREEN_MS / 1000 + 0.05, () => { if (L.phase === 'running') sim.addVehicle(hi, 'sedan'); });
          }
        }

        // overflow counting
        const of = sim.lanes.find((l) => l.overflowed);
        if (of) { L.overflow++; document.getElementById('overCount').textContent = L.overflow; sim.clearOverflow(); shake(); SFX.play.overflow(); }

        // timer / result
        L.timer -= dt;
        const s = this.subRounds[L.round];
        document.getElementById('roundInfo').textContent = `${s.name} · ${Math.ceil(L.timer)}s`;
        if (L.timer <= 0) this.finishSub();
      },
      finishSub() {
        L.phase = 'result'; L.running = false;
        document.getElementById('btnAutoRun').disabled = false;
        const passed = L.overflow === 0 && L.waste <= this.WASTE_LIMIT;
        if (passed) {
          SFX.play.success();
          flash('Smooth flow! ✓', 'ok');
          Flux.showBubble(`Great trigger! ${L.waste} wasted, ${L.overflow} overflows. Perfect balance.`);
          after(1.3, () => { L.round++; if (L.round >= L.total) completeLevel(); else this.prime(); });
        } else {
          const why = L.overflow > 0
            ? `Trigger too HIGH — ${L.overflow} overflow(s). Lower it a bit.`
            : `Trigger too LOW — ${L.waste} wasted cycles. Raise it a bit.`;
          flash('Not balanced yet', 'bad', 1400);
          Flux.showBubble(why + ' Adjust the slider and run again.');
          document.getElementById('btnAutoRun').textContent = '▶ Run Auto-Pilot';
          // freeze the bars during the retry pause (run() will reset them)
          for (let i = 0; i < 4; i++) sim.configLane(i, { fillRate: 0 });
          sim.clearOverflow();
          L.phase = 'setup';
        }
      }
    }
  };

  /* ============================================================
     LEVEL COMPLETE / RESULT
     ============================================================ */
  function completeLevel() {
    stopLoop();
    mode = 'result';
    const m = META[level];
    Flux.completeConcept(m.concept);
    Flux.setStatus(m.status);
    Flux.markLevelDone(level);
    updateNav();
    SFX.play.fanfare();
    // result screen
    document.getElementById('resultIcon').textContent = '🧠';
    document.getElementById('resultTitle').textContent = `Level ${level} Complete!`;
    document.getElementById('resultTeach').innerHTML = RECAP[level] || '';
    const nextBtn = document.getElementById('btnNextLevel');
    nextBtn.textContent = level < 5 ? 'Next Level →' : 'Dept. Briefing →';
    nextBtn.hidden = false;
    document.getElementById('resultScreen').hidden = false;
  }

  function onQuizComplete(passed, score) {
    if (passed) {
      Flux.setCertified();
      Flux.markLevelDone(6);
      updateNav();
      showCertificate();
    } else {
      // return to level 5 review
      setupLevel(5, 'quiz-fail');
    }
  }

  /* ============================================================
     CERTIFICATE
     ============================================================ */
  function showCertificate() {
    mode = 'certificate';
    const c = document.getElementById('certScreen');
    const canvasC = document.getElementById('certCanvas');
    let name = '';
    try { name = window.prompt('Enter your name for the department clearance:', 'Junior Engineer') || 'Junior Engineer'; } catch (e) { name = 'Junior Engineer'; }
    Quiz.renderCertificate(canvasC, name);
    c.hidden = false;
    SFX.play.fanfare();
  }

  /* ============================================================
     NAV + FLUX CONTEXT
     ============================================================ */
  function buildNav() {
    const nav = document.getElementById('levelNav');
    nav.innerHTML = '';
    for (let i = 1; i <= 6; i++) {
      const b = document.createElement('button');
      b.className = 'level-tab';
      b.id = 'level-tab-' + i;        // FIX 1: unique id per tab, cannot collide with btnSettings/btnTranscript/btnDebug
      b.dataset.level = i;
      b.innerHTML = `L${i}<span class="tab-sub">${META[i].tab}</span>`;
      b.setAttribute('aria-label', `Go to level ${i}: ${META[i].tab}`);
      b.addEventListener('click', (e) => {
        e.stopPropagation();          // FIX 1: keep tab clicks isolated from other top-bar handlers
        if (mode !== 'loading') { hideScreens(); setupLevel(i, 'nav'); }
      });
      nav.appendChild(b);
    }
  }
  function updateNav() {
    document.querySelectorAll('.level-tab').forEach((b) => {
      const n = parseInt(b.dataset.level, 10);
      b.classList.toggle('active', n === level);
      b.classList.toggle('done', Flux.isLevelDone(n));
    });
  }

  function getFluxContext() {
    const ctx = { level };
    if (sim.laneCount > 1) {
      const hi = sim.highestIndex();
      ctx.highestLane = sim.lane(hi).id;
      ctx.highestPct = Math.round(sim.lane(hi).fill);
    }
    ctx.confidence = Flux.confidence();
    ctx.phase = L.phase;
    return ctx;
  }

  /* ============================================================
     MAIN LOOP
     ============================================================ */
  function startLoop() {
    stopLoop();
    lastT = performance.now();
    const step = (now) => {
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      if (mode === 'playing' && level !== 6) {
        runPending(dt);
        const overflows = sim.update(dt);
        if (LEVELS[level] && LEVELS[level].onUpdate) LEVELS[level].onUpdate(dt, overflows);
        renderOpts.time = now;
        Renderer.draw(ctx, W, H, sim, renderOpts);
      }
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
  }
  function stopLoop() { if (rafId) cancelAnimationFrame(rafId); rafId = null; }

  /* ============================================================
     SCREENS
     ============================================================ */
  function hideScreens() {
    document.getElementById('menuScreen').hidden = true;
    document.getElementById('resultScreen').hidden = true;
    document.getElementById('certScreen').hidden = true;
  }

  /* ============================================================
     INIT + wiring
     ============================================================ */
  function init() {
    canvas = document.getElementById('stage');
    ctx = canvas.getContext('2d');

    // quiz host overlay inside the stage wrap
    const host = document.createElement('div');
    host.id = 'quizHost'; host.className = 'quiz-host'; host.hidden = true;
    canvas.parentElement.appendChild(host);

    // bind subsystems
    Transcript.bind();
    Flux.bind();
    Flux.setContextProvider(getFluxContext);
    Settings.bind((s) => Flux.applySettings(s));

    buildNav();

    resize();
    window.addEventListener('resize', () => { resize(); if (mode === 'playing' && level !== 6) Renderer.draw(ctx, W, H, sim, renderOpts); });

    // controls
    document.getElementById('btnFlush').addEventListener('click', () => doFlush(0));
    canvas.addEventListener('pointerdown', (e) => {
      if (mode !== 'playing' || level === 6) return;
      if (level >= 1 && level <= 3) return doFlush(0);
      if (level === 4) { const i = laneIndexAt(e.clientX); if (i >= 0) doFlush(i); }
    });

    // level 5 slider + run
    const slider = document.getElementById('triggerSlider');
    slider.addEventListener('input', () => {
      L.trigger = parseInt(slider.value, 10);
      document.getElementById('triggerVal').textContent = slider.value;
      renderOpts.triggerLevel = L.trigger;
    });
    document.getElementById('btnAutoRun').addEventListener('click', () => { if (level === 5) LEVELS[5].run(); });

    // debugger 🔧 — fill all queues to 99%
    document.getElementById('btnDebug').addEventListener('click', () => {
      if (mode !== 'playing' || level === 6) return;
      sim.lanes.forEach((l) => { if (l.cap == null) l.fill = 99; });
      flash('🔧 Debug: all queues at 99%', 'info', 900);
    });

    // transcript drawer
    const drawer = document.getElementById('transcriptDrawer');
    const settingsModal = document.getElementById('settingsModal');
    document.getElementById('btnTranscript').addEventListener('click', (e) => {
      e.stopPropagation();                                 // FIX 1/2: isolate this top-bar click
      if (settingsModal) settingsModal.hidden = true;      // FIX 2: settings & transcript are mutually exclusive
      // FIX 2: dock the drawer just below the top bar so it never covers the ⚙️/📝/🔧 buttons.
      const bar = document.querySelector('.topbar');
      if (bar) drawer.style.top = Math.round(bar.getBoundingClientRect().height) + 'px';
      drawer.hidden = false;
      Transcript.render();
    });
    document.getElementById('btnCloseTranscript').addEventListener('click', () => { drawer.hidden = true; });
    document.getElementById('btnClearTranscript').addEventListener('click', () => Transcript.clear());

    // result screen buttons
    document.getElementById('btnNextLevel').addEventListener('click', () => {
      hideScreens();
      setupLevel(level < 6 ? level + 1 : 6, 'next-button');
    });
    document.getElementById('btnReplayLevel').addEventListener('click', () => { hideScreens(); setupLevel(level, 'replay-button'); });

    // certificate buttons
    document.getElementById('btnCertDownload').addEventListener('click', () => {
      const c = document.getElementById('certCanvas');
      const a = document.createElement('a');
      a.download = 'traffic-commander-certificate.png';
      a.href = c.toDataURL('image/png');
      a.click();
    });
    document.getElementById('btnCertMenu').addEventListener('click', () => { hideScreens(); showMenu(); });

    // start button
    document.getElementById('btnStart').addEventListener('click', () => {
      SFX.init(); SFX.resume();
      hideScreens();
      Flux.startListening();
      Flux.greet();
      setupLevel(1, 'start');
    });

    // service worker (only on http/https; harmless if it fails)
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }

    mode = 'menu';
    showMenu();
    // draw an idle frame behind the menu
    sim.reset(1); resize(); Renderer.draw(ctx, W, H, sim, { level: 1, time: 0 });
  }

  function showMenu() {
    mode = 'menu';
    document.getElementById('menuScreen').hidden = false;
  }

  /* ---------- util ---------- */
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  // expose a little for tests / debugging
  return { init, setupLevel, doFlush, get sim() { return sim; }, get level() { return level; }, get L() { return L; }, LEVELS };
})();

window.addEventListener('DOMContentLoaded', Game.init);
