/* game.js — Wave Prophet orchestrator. 6 levels, forecast bands, flow score. */
const Game = (() => {
  const META = {
    1: { icon: '🔮', text: 'LEVEL 1: PREDICTIVE MODELING — How AI Sees the Future', cls: 'c-prediction', concept: 'prediction', status: 'reader', tab: 'PREDICT' },
    2: { icon: '⚖️', text: 'LEVEL 2: MULTI-SIGNAL COORDINATION — Juggling Two Forecasts', cls: 'c-coordination', concept: 'coordination', status: 'predictor', tab: 'COORD' },
    3: { icon: '⚡', text: 'LEVEL 3: ANOMALY DETECTION — Spotting the Unexpected', cls: 'c-anomaly', concept: 'anomaly', status: 'coordinator', tab: 'ANOMALY' },
    4: { icon: '🟢', text: 'LEVEL 4: MULTI-AGENT COORDINATION — Two Lights, One Goal', cls: 'c-coordination', concept: 'coordination', status: 'coordinator', tab: 'CORRIDOR' },
    5: { icon: '🏆', text: 'LEVEL 5: OPTIMIZATION — The Perfect Wave Absorber', cls: 'c-optimization', concept: 'optimization', status: 'prophet', tab: 'OPTIMIZE' },
    6: { icon: '✏️', text: 'LEVEL 6: TRANSPORT DEPT. PREDICTION BRIEFING', cls: 'c-quiz', concept: 'prediction', status: 'certified', tab: 'DEPT' }
  };
  const RECAP = {
    1: '🧠 You just taught Cascade: <strong>Predictive Modeling</strong> — AI watches trends to forecast what happens next and acts early.',
    2: '🧠 You just taught Cascade: <strong>Multi-Signal Coordination</strong> — AI compares forecasts from different directions and prioritises the biggest wave.',
    3: '🧠 You just taught Cascade: <strong>Anomaly Detection</strong> — AI spots unexpected surges and reacts quickly to prevent jams.',
    4: '🧠 You just taught Cascade: <strong>Multi-Agent Coordination</strong> — AI coordinates multiple traffic lights so cars flow through without stopping.',
    5: '🧠 You just taught Cascade: <strong>Optimization</strong> — AI continuously adjusts timers to maintain smooth traffic flow under changing conditions.'
  };

  let mode = 'loading', level = 1, L = {}, canvas, ctx, W, H, dpr = 1, rafId = null, lastT = 0;
  let state = { direction: 'NS', timer: 10, forecasts: {}, flowScore: 100, cars: { N: 0, S: 0, E: 0, W: 0 } };
  let _timers = [], _lastSwitch = 0;
  function clearLvTimers() { _timers.forEach(t => clearTimeout(t)); _timers = []; }
  function lvTimer(fn, delay) { const id = setTimeout(fn, delay); _timers.push(id); return id; }
  const SWITCH_COOLDOWN = 4; // seconds before can switch again

  function canSwitch() { return (Date.now() - _lastSwitch) >= SWITCH_COOLDOWN * 1000; }
  function switchCooldownSecs() { return Math.max(0, Math.ceil(SWITCH_COOLDOWN - (Date.now() - _lastSwitch) / 1000)); }

  function doSwitch(dir) {
    if (!canSwitch()) { flash(`⏳ Wait ${switchCooldownSecs()}s before switching again`, 'info', 1000); return; }
    _lastSwitch = Date.now();
    state.direction = dir; state.timer = L.greenTime;
    document.getElementById('currentLane').textContent = 'Green: ' + (dir === 'NS' ? 'N-S' : 'E-W');
    flash(`🔄 Switched to ${dir === 'NS' ? 'N-S' : 'E-W'}`, 'info', 600);
  }

  function after(sec, fn) { L.pending = L.pending || []; L.pending.push({ t: sec, fn }); }
  function runPending(dt) { if (!L.pending) return; const ready = L.pending.filter(p => { p.t -= dt; return p.t <= 0; }); L.pending = L.pending.filter(p => p.t > 0); ready.forEach(p => p.fn()); }

  function resize() {
    const wrap = canvas.parentElement; const rect = wrap.getBoundingClientRect();
    W = Math.max(320, rect.width); H = Math.max(280, rect.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function flash(text, kind, ms = 1100) {
    const el = document.getElementById('flash'); if (!el) return;
    el.textContent = text; el.className = 'flash ' + (kind || 'info'); el.style.display = 'block';
    clearTimeout(el._t); el._t = setTimeout(() => el.style.display = 'none', ms);
  }
  function setHUD(text) { document.getElementById('roundInfo').textContent = text || ''; }
  function setProgress(cleared, total) {
    const el = document.getElementById('countInfo');
    if (!el) return;
    if (total) { el.textContent = `✅ ${Math.round(cleared)}/${total} cleared`; el.style.display = 'block'; }
    else { el.style.display = 'none'; }
  }
  function updateGauge(pct) {
    const fill = document.getElementById('gaugeFill'); const text = document.getElementById('gaugeText');
    if (fill) { fill.style.width = Math.min(100, Math.max(0, pct)) + '%'; fill.style.background = pct >= 80 ? '#2ECC71' : pct >= 60 ? '#F39C12' : '#E74C3C'; }
    if (text) text.textContent = Math.round(pct) + '%';
  }

  const LEVEL_INTRO = {
    1: { icon: '🔮', title: 'PREDICTIVE MODELING', text: 'AI watches traffic trends to FORECAST what will happen next — so you can act BEFORE a jam forms.', goal: 'Extend the green light to let all forecast cars pass through.' },
    2: { icon: '⚖️', title: 'MULTI-SIGNAL COORDINATION', text: 'AI compares MULTIPLE incoming waves and prioritises the biggest one. You must decide which direction needs green most.', goal: 'Switch directions to drain the largest queue. Non-active lanes grow fast!' },
    3: { icon: '⚡', title: 'ANOMALY DETECTION', text: 'AI detects UNEXPECTED traffic surges — events that don\'t fit the normal pattern.', goal: 'When a surge hits, switch to its direction immediately before it gridlocks.' },
    4: { icon: '🟢', title: 'MULTI-AGENT COORDINATION', text: 'AI coordinates TWO traffic lights so cars pass both without stopping — a GREEN CORRIDOR.', goal: 'Time Light A so cars reach Light B while it\'s also green.' },
    5: { icon: '🏆', title: 'OPTIMIZATION', text: 'AI continuously adjusts to maintain SMOOTH FLOW across changing traffic patterns.', goal: 'Keep the Flow Score above 90% for 60 seconds.' },
  };

  function showLevelIntro(n, callback) {
    const overlay = document.getElementById('levelIntro');
    if (!overlay) { callback(); return; }
    const data = LEVEL_INTRO[n];
    if (data) {
      document.getElementById('introIcon').textContent = data.icon;
      document.getElementById('introTitle').textContent = data.title;
      document.getElementById('introText').textContent = data.text;
      document.getElementById('introGoal').textContent = '🎯 ' + data.goal;
    }
    overlay.hidden = false;
    const btn = document.getElementById('btnStartLevel');
    const handler = () => { overlay.hidden = true; btn.removeEventListener('click', handler); callback(); };
    btn.addEventListener('click', handler);
    // Auto-dismiss after 5 seconds
    setTimeout(() => { if (!overlay.hidden) { overlay.hidden = true; btn.removeEventListener('click', handler); callback(); } }, 5000);
  }

  function setupLevel(n, source) {
    stopLoop(); clearLvTimers(); level = n; L = { pending: [], phase: 'idle' };
    const m = META[n]; const banner = document.getElementById('banner');
    banner.className = 'level-banner ' + m.cls;
    banner.querySelector('.banner-icon').textContent = m.icon;
    banner.querySelector('.banner-text').textContent = m.text;
    updateNav(); Cascade.setLevel(n);
    document.getElementById('scoreGauge').hidden = n !== 5;
    document.getElementById('flowStatus').textContent = '';
    document.getElementById('btnSwitch').style.display = (n >= 2 && n !== 4) ? 'inline-block' : 'none';
    const quizHost = document.getElementById('quizHost');
    if (n === 6) { canvas.style.display = 'none'; quizHost.hidden = false; Quiz.mount(quizHost, onQuizComplete); mode = 'playing'; return; }
    else { canvas.style.display = 'block'; quizHost.hidden = true; }
    mode = 'playing';
    // Show intro overlay with AI concept explanation
    showLevelIntro(n, () => { LEVELS[n].setup(); startLoop(); });
  }

  const LEVELS = {
    /* LEVEL 1: PREDICTIVE MODELING — single lane */
    1: { rounds: [{ size: 8 }, { size: 15 }, { size: 25 }],
      setup() { L.round = 0; L.total = this.rounds.length; L.greenTime = 10; this.startRound(); },
      startRound() {
        const r = this.rounds[L.round]; L.phase = 'active'; L.cleared = false;
        state.direction = 'NS'; state.timer = L.greenTime; L.carAnim = 0;
        state.forecasts = { N: { width: r.size / 30, arrival: 5 } };
        state.cars = { N: r.size, S: 0, E: 0, W: 0 }; state.flowScore = 100;
        document.getElementById('currentLane').textContent = 'Green: N-S';
        setHUD(`Round ${L.round+1}: Extend green → clear ${r.size} cars.`);
        setProgress(0, r.size);
        flash(`🔮 ${r.size} cars arriving in 5s. +3s gives more green time.`, 'info', 2500);
      },
      onUpdate(dt) {
        if (L.phase !== 'active') return;
        // Cars flow at 2/sec during green
        if (state.cars.N > 0) { const flow = 2.0 * dt; state.cars.N = Math.max(0, state.cars.N - flow); state.forecasts.N.width = state.cars.N / 30; L.carAnim = 1; }
        else { L.carAnim = 0; }
        // Progress
        const total = this.rounds[L.round]?.size || 0;
        setProgress(total - state.cars.N, total);
        // Timer counts down green light
        state.timer -= dt;
        document.getElementById('timerDisplay').textContent = 'Green: ' + Math.max(0, Math.ceil(state.timer)) + 's';
        // When no cars remain → wave absorbed
        if (state.cars.N <= 0 && !L.cleared) { L.cleared = true; flash('✅ Wave absorbed!', 'ok'); after(0.8, () => this.advance()); }
        // When timer hits 0 and cars remain → auto-renew green
        if (state.timer <= 0 && state.cars.N > 0) { state.timer = L.greenTime; flash(`🔄 Green extended — ${Math.ceil(state.cars.N)} cars still waiting`, 'info', 1000); }
      },
      advance() { L.round++; if (L.round >= L.total) { flash('✅ All waves absorbed!', 'ok'); after(0.8, completeLevel); } else this.startRound(); },
    },

    /* LEVEL 2: MULTI-DIRECTION — switching cooldown + urgency */
    2: { rounds: [
        { n: 12, s: 2, e: 5, w: 2, label: 'North biggest' },
        { n: 4, e: 14, s: 3, w: 4, label: 'East growing fast' },
        { n: 8, e: 4, s: 10, w: 5, label: 'South needs attention' },
        { n: 6, e: 8, s: 3, w: 12, label: 'West wave incoming' }
      ],
      setup() { L.round = 0; L.total = this.rounds.length; L.greenTime = 10; this.startRound(); },
      startRound() {
        const r = this.rounds[L.round]; L.phase = 'active'; L.cleared = false;
        state.direction = 'NS'; state.timer = L.greenTime; _lastSwitch = Date.now();
        state.forecasts = { N: { width: r.n/20, arrival: 3 }, S: { width: r.s/20, arrival: 3 }, E: { width: r.e/20, arrival: 3 }, W: { width: r.w/20, arrival: 3 } };
        state.cars = { N: r.n, S: r.s, E: r.e, W: r.w }; state.flowScore = 100;
        L.overflowed = false; L.total = r.n + r.s + r.e + r.w;
        setProgress(0, L.total);
        setHUD(`${r.label}. ⏳Switch cooldown 4s. Other queues grow while you wait.`);
        flash('🌐 All directions have traffic! Switch to drain the biggest queue. Others grow while inactive.', 'info', 2500);
      },
      onUpdate(dt) {
        if (L.phase !== 'active' || L.overflowed) return;
        // Active lane: cars flow at 2/sec
        const activeKey = state.direction === 'NS' ? ['N','S'] : ['E','W'];
        activeKey.forEach(k => { const flow = 2.0 * dt; state.cars[k] = Math.max(0, (state.cars[k] || 0) - flow); });
        // Non-active lanes grow (urgency)
        const inactive = state.direction === 'NS' ? ['E','W'] : ['N','S'];
        inactive.forEach(k => { state.cars[k] = (state.cars[k] || 0) + 0.5 * dt; });
        // Timer
        state.timer -= dt;
        document.getElementById('timerDisplay').textContent = 'Green: ' + Math.max(0, Math.ceil(state.timer)) + 's';
        if (state.timer <= 0) state.timer = L.greenTime;
        // Overflow check
        for (const k of ['N','S','E','W']) { if ((state.cars[k] || 0) > 25) { L.overflowed = true; flash(`💥 ${k} lane overflowed!`, 'bad', 1200); after(0.8, () => this.advance()); return; } }
        // Progress
        const L2total = L.total || 1;
        const L2remaining = Object.values(state.cars).reduce((a,b) => a+b, 0);
        setProgress(L2total - L2remaining, L2total);
        // All cleared?
        if (L2remaining <= 1 && !L.cleared) { L.cleared = true; flash('✅ All waves absorbed!', 'ok'); after(0.8, () => this.advance()); }
      },
      advance() { L.round++; if (L.round >= L.total) { flash('✅ All rounds complete!', 'ok'); after(0.8, completeLevel); } else this.startRound(); },
    },

    /* LEVEL 3: ANOMALY — random surge */
    3: { rounds: [
        { normal: 10, surge: 20, label: 'Small surge' },
        { normal: 8, surge: 35, label: 'Medium surge' },
        { normal: 6, surge: 55, label: 'Massive surge!' }
      ],
      setup() { L.round = 0; L.total = this.rounds.length; L.greenTime = 8; this.startRound(); },
      startRound() {
        const r = this.rounds[L.round]; L.phase = 'active'; L.overflowed = false;
        L.surgeDir = ['N','S','E','W'][Math.floor(Math.random() * 4)];
        state.direction = 'NS'; state.timer = L.greenTime; _lastSwitch = Date.now();
        state.cars = { N: r.normal, S: 3, E: 2, W: 4 }; state.flowScore = 100;
        state.forecasts = { N: { width: r.normal/25, arrival: 4 }, S: { width: 3/25, arrival: 6 }, E: { width: 2/25, arrival: 5 }, W: { width: 4/25, arrival: 3 } };
        L.total = r.normal + 3 + 2 + 4 + r.surge;
        setProgress(0, L.total);
        setHUD(`Normal traffic. SURGE from ${L.surgeDir} in 3s!`);
        flash(`⚠️ Traffic flowing. A surge will hit ${L.surgeDir} soon!`, 'info', 2500);
        L._surgeTimer = lvTimer(() => {
          if (L.phase !== 'active') return;
          state.forecasts[L.surgeDir] = { width: r.surge/20, arrival: 3, isSurge: true };
          state.cars[L.surgeDir] = (state.cars[L.surgeDir] || 0) + r.surge;
          _lastSwitch = 0; // Clear cooldown so kid can switch immediately
          flash(`⚡ SURGE! ${r.surge} cars in ${L.surgeDir}! Cooldown cleared — switch!`, 'bad', 2000);
        }, 3000);
      },
      onUpdate(dt) {
        if (L.phase !== 'active' || L.overflowed) return;
        // Active lane: flow 2/sec
        const k = state.direction === 'NS' ? ['N','S'] : ['E','W'];
        k.forEach(d => { state.cars[d] = Math.max(0, (state.cars[d] || 0) - 2.0 * dt); });
        // Non-active grow
        const ik = state.direction === 'NS' ? ['E','W'] : ['N','S'];
        ik.forEach(d => { state.cars[d] = (state.cars[d] || 0) + 0.5 * dt; });
        // Timer
        state.timer -= dt;
        document.getElementById('timerDisplay').textContent = 'Green: ' + Math.max(0, Math.ceil(state.timer)) + 's';
        if (state.timer <= 0) state.timer = L.greenTime;
        // Overflow
        for (const d of ['N','S','E','W']) { if ((state.cars[d] || 0) > 30) { L.overflowed = true; flash(`💥 ${d} lane gridlocked!`, 'bad', 1200); after(0.8, () => this.advance()); return; } }
        // Progress
        const L3rem = Object.values(state.cars).reduce((a,b) => a+b, 0);
        setProgress(L.total - L3rem, L.total);
        // Check if surge handled
        const remaining = Object.values(state.cars).reduce((a,b) => a+b, 0);
        if (remaining <= 5 && !L.cleared && L.surgeHandled === false && Date.now() - (_lastSwitch || 0) > 3000) { L.cleared = true; flash('✅ Traffic flowing again!', 'ok'); after(0.8, () => this.advance()); }
      },
      advance() { L.round++; clearTimeout(L._surgeTimer); if (L.round >= L.total) { flash('✅ All traffic managed!', 'ok'); after(0.8, completeLevel); } else this.startRound(); },
    },

    /* LEVEL 4: GREEN CORRIDOR — two-light sync */
    4: { rounds: [
        { total: 20, label: '20 cars' },
        { total: 35, label: '35 cars' },
        { total: 50, label: '50 cars' }
      ],
      setup() { L.round = 0; L.total = this.rounds.length; L.greenTime = 6; this.startRound(); },
      startRound() {
        const r = this.rounds[L.round]; L.phase = 'active'; L.passed = 0; L.synced = 0;
        L.lightB = Math.floor(Math.random() * 4) + 5;
        state.direction = 'NS'; state.timer = L.greenTime;
        state.cars = { N: r.total, S: 0, E: 0, W: 0 }; state.flowScore = 100;
        state.forecasts = { N: { width: r.total/30, arrival: 5 } };
        L.total = r.total;
        setProgress(0, L.total);
        document.getElementById('btnSwitch').style.display = 'none';
        setHUD(`Light A green ${L.greenTime}s | Light B every ${L.lightB}s. Sync them!`);
        flash(`🟢 Time Light A so cars reach Light B when it's green — green corridor!`, 'info', 2500);
      },
      onUpdate(dt) {
        if (L.phase !== 'active') return;
        // Cars leave Light A at 2/sec
        if (state.cars.N > 0) {
          const flow = 2.0 * dt;
          state.cars.N = Math.max(0, state.cars.N - flow);
          L.passed += flow;
          state.forecasts.N.width = state.cars.N / 30;
          // Track Light B sync: check if departure time aligns with Light B cycle
          const bCycle = state.timer % L.lightB;
          if (bCycle > L.lightB * 0.3 && bCycle < L.lightB * 0.7) L.synced += flow;
        }
        state.timer -= dt;
        document.getElementById('timerDisplay').textContent = 'Light A: ' + Math.max(0, Math.ceil(state.timer)) + 's';
        if (state.timer <= 0) state.timer = L.greenTime;
        setProgress(L.total - state.cars.N, L.total);
        if (state.cars.N <= 0 && !L.cleared) {
          L.cleared = true;
          const syncPct = L.synced / Math.max(1, L.passed);
          const msg = syncPct > 0.6 ? '✅ Green corridor! Most cars passed both lights!' : '⚠️ Some cars hit red at Light B. Adjust timing.';
          flash(msg, 'ok'); after(0.8, () => this.advance());
        }
      },
      advance() { L.round++; if (L.round >= L.total) { flash('✅ Corridor mastered!', 'ok'); after(0.8, completeLevel); } else this.startRound(); },
    },

    /* LEVEL 5: OPTIMIZATION (flow score) */
    5: {
      setup() {
        L.phase = 'setup'; L.greenTime = 10; state.timer = 10;
        state.direction = 'NS';
        state.cars = { N: 0, S: 0, E: 0, W: 0 }; state.flowScore = 100;
        state.forecasts = {};
        document.getElementById('scoreGauge').hidden = false; updateGauge(100);
        setHUD('Welcome to Optimization Mode!');
        flash('Maintain Flow Score ≥ 90% for 60 seconds! Adjust timer and switch directions.', 'info', 2500);
        L.running = false; L.elapsed = 0;
        document.getElementById('btnSwitch').style.display = 'inline-block';
        document.getElementById('flowStatus').textContent = 'Press +3s or -3s to start';
      },
      start() {
        L.running = true; L.elapsed = 0; L.wavesAbsorbed = 0; L.maxFlow = 100;
        state.flowScore = 100; L.phase = 'running';
        document.getElementById('flowStatus').textContent = '⚡ Running — keep flow above 90%!';
        this.spawnWave();
      },
      spawnWave() {
        if (L.phase !== 'running') return;
        // Random wave from random direction
        const dirs = ['N','S','E','W'];
        const dir = dirs[Math.floor(Math.random() * 4)];
        const size = 5 + Math.random() * 20;
        const isSurge = Math.random() < 0.2;
        state.forecasts[dir] = { width: size / 30, arrival: 4 + Math.random() * 3, isSurge };
        state.cars[dir] = (state.cars[dir] || 0) + size;
        const delay = 3000 + Math.random() * 3000;
        L._spawnTimer = lvTimer(() => this.spawnWave(), delay);
      },
      adjustTimer(delta) {
        L.greenTime = Math.max(3, Math.min(20, L.greenTime + delta));
        state.timer = L.greenTime;
        document.getElementById('timerDisplay').textContent = 'Green: ' + L.greenTime + 's';
        if (!L.running && !L._started) { L._started = true; this.start(); }
      },
      switchDir(dir) { if (!L.running) return; state.direction = dir; },
      onUpdate(dt) {
        if (L.phase !== 'running') return;
        L.elapsed += dt;
        if (L.elapsed >= 60) { flash('✅ 60 seconds! Excellent flow!', 'ok'); after(0.8, completeLevel); L.phase = 'done'; return; }
        // Cycle cars through
        const key = state.direction === 'NS' ? ['N','S'] : ['E','W'];
        key.forEach(k => { state.cars[k] = Math.max(0, (state.cars[k] || 0) - 1); });
        // Calculate flow score: based on cars waiting vs total capacity
        const totalCars = Object.values(state.cars).reduce((a,b) => a+b, 0);
        const optimalCars = 20;
        state.flowScore = Math.max(0, 100 - (totalCars / optimalCars) * 50);
        updateGauge(state.flowScore);
        if (state.flowScore > L.maxFlow) L.maxFlow = state.flowScore;
        if (state.flowScore < 70) flash(`⚠️ Flow dropping! Adjust timers! (${Math.round(state.flowScore)}%)`, 'bad', 800);
        document.getElementById('timeInfo') || (() => { const e = document.getElementById('roundInfo'); if (e) e.textContent = `Flow: ${Math.round(state.flowScore)}% | ${Math.round(60-L.elapsed)}s left`; })();
        setHUD(`Flow: ${Math.round(state.flowScore)}% | ${Math.round(60-L.elapsed)}s left`);
      }
    }
  };

  function completeLevel() {
    stopLoop(); mode = 'result';
    const m = META[level];
    Cascade.completeConcept(m.concept); Cascade.setStatus(m.status); Cascade.markLevelDone(level); updateNav();
    document.getElementById('resultIcon').textContent = '🧠';
    document.getElementById('resultTitle').textContent = `Level ${level} Complete!`;
    document.getElementById('resultTeach').innerHTML = RECAP[level] || '';
    const nextBtn = document.getElementById('btnNextLevel');
    nextBtn.textContent = level < 5 ? 'Next Level →' : 'Dept. Briefing →'; nextBtn.hidden = false;
    document.getElementById('resultScreen').hidden = false;
    SFX.play.fanfare();
  }

  function onQuizComplete(passed, score) {
    if (passed) { Cascade.setCertified(); Cascade.markLevelDone(6); updateNav(); showCertificate(); }
    else setupLevel(5, 'quiz-fail');
  }

  function showCertificate() {
    mode = 'certificate';
    const c = document.getElementById('certScreen'); const canvasC = document.getElementById('certCanvas');
    let name = ''; try { name = window.prompt('Your name for the department clearance:', 'Traffic Manager') || 'Traffic Manager'; } catch(e) { name = 'Traffic Manager'; }
    Quiz.renderCertificate(canvasC, name); c.hidden = false; SFX.play.fanfare();
  }

  function buildNav() {
    const nav = document.getElementById('levelNav');
    nav.innerHTML = '';
    for (let i = 1; i <= 6; i++) {
      const b = document.createElement('button'); b.className = 'level-tab'; b.dataset.level = i;
      b.innerHTML = `L${i}<span class="tab-sub">${META[i].tab}</span>`;
      b.addEventListener('click', (e) => { e.stopPropagation(); if (mode !== 'loading') { hideScreens(); setupLevel(i, 'nav'); } });
      nav.appendChild(b);
    }
  }

  function updateNav() {
    document.querySelectorAll('.level-tab').forEach(b => { const n = parseInt(b.dataset.level, 10); b.classList.toggle('active', n === level); b.classList.toggle('done', Cascade.isLevelDone(n)); });
  }

  function startLoop() {
    stopLoop(); lastT = performance.now();
    const step = (now) => { const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
      if (mode === 'playing' && level !== 6) { runPending(dt); if (LEVELS[level]?.onUpdate) LEVELS[level].onUpdate(dt); SceneRenderer.draw(ctx, W, H, state, { time: now, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches }); }
      rafId = requestAnimationFrame(step); };
    rafId = requestAnimationFrame(step);
  }
  function stopLoop() { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } }

  function hideScreens() { ['menuScreen','resultScreen','certScreen'].forEach(id => document.getElementById(id).hidden = true); }

  function init() {
    canvas = document.getElementById('stage'); ctx = canvas.getContext('2d');
    const host = document.createElement('div'); host.id = 'quizHost'; host.className = 'quiz-host'; host.hidden = true;
    canvas.parentElement.appendChild(host);
    Transcript?.bind(); Cascade.bind(); Cascade.setContextProvider(() => ({ level, phase: L.phase }));
    Settings?.bind((s) => Cascade.applySettings(s));
    buildNav(); resize();
    window.addEventListener('resize', () => { resize(); if (mode === 'playing' && level !== 6) SceneRenderer.draw(ctx, W, H, state, { time: performance.now() }); });

    // Controls
    document.getElementById('btnInc').addEventListener('click', () => { if (level === 5) LEVELS[5].adjustTimer(3); else { L.greenTime = Math.min(20, (L.greenTime || 10) + 3); document.getElementById('timerDisplay').textContent = 'Green: ' + (L.greenTime || 10) + 's'; flash(`+3s → Green light now ${L.greenTime}s`, 'info', 800); } });
    document.getElementById('btnDec').addEventListener('click', () => { if (level === 5) LEVELS[5].adjustTimer(-3); else { L.greenTime = Math.max(3, (L.greenTime || 10) - 3); document.getElementById('timerDisplay').textContent = 'Green: ' + (L.greenTime || 10) + 's'; } });
    document.getElementById('btnSwitch').addEventListener('click', () => { const newDir = state.direction === 'NS' ? 'EW' : 'NS'; if (level === 5) { LEVELS[5].switchDir(newDir); state.direction = newDir; document.getElementById('currentLane').textContent = 'Green: ' + (newDir === 'NS' ? 'N-S' : 'E-W'); } else { doSwitch(newDir); } });
    document.getElementById('btnDebug').addEventListener('click', () => { flash(`🔧 Debug: ${Object.values(state.cars).reduce((a,b) => a+b, 0)} cars waiting`, 'info', 1500); });

    const drawer = document.getElementById('transcriptDrawer');
    document.getElementById('btnTranscript').addEventListener('click', () => { drawer.hidden = !drawer.hidden; Transcript?.render(); });
    document.getElementById('btnCloseTranscript').addEventListener('click', () => drawer.hidden = true);
    document.getElementById('btnClearTranscript').addEventListener('click', () => Transcript?.clear());
    document.getElementById('btnNextLevel').addEventListener('click', () => { hideScreens(); setupLevel(level < 6 ? level + 1 : 6, 'next-button'); });
    document.getElementById('btnReplayLevel').addEventListener('click', () => { hideScreens(); setupLevel(level, 'replay-button'); });
    document.getElementById('btnCertDownload').addEventListener('click', () => { const c = document.getElementById('certCanvas'), a = document.createElement('a'); a.download = 'wave-prophet-certificate.png'; a.href = c.toDataURL('image/png'); a.click(); });
    document.getElementById('btnCertMenu').addEventListener('click', () => { hideScreens(); showMenu(); });
    document.getElementById('btnStart').addEventListener('click', () => { SFX.init(); SFX.resume(); hideScreens(); Cascade.startListening(); Cascade.greet(); setupLevel(1, 'start'); });
    mode = 'menu'; showMenu();
  }

  function showMenu() { mode = 'menu'; document.getElementById('menuScreen').hidden = false; }
  return { init, setupLevel };
})();
window.addEventListener('DOMContentLoaded', Game.init);
