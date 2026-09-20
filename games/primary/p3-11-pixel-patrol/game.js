/* game.js — Pixel Patrol orchestrator. State machine + 6 level scripts. */
const Game = (() => {
  'use strict';
  const META = {
    1: { icon: '🖍️', text: 'LEVEL 1: SUPERVISED LABELING — Teaching Iris What Things Look Like', cls: 'c-labeling', concept: 'labeling', status: 'observing', tab: 'LABEL' },
    2: { icon: '👁️', text: 'LEVEL 2: FEATURE EXTRACTION — Seeing Through the Clutter', cls: 'c-extraction', concept: 'extraction', status: 'detecting', tab: 'EXTRACT' },
    3: { icon: '✂️', text: 'LEVEL 3: SEMANTIC SEGMENTATION — Separating Overlapping Shapes', cls: 'c-segmentation', concept: 'segmentation', status: 'classifying', tab: 'SEGMENT' },
    4: { icon: '🚗', text: 'LEVEL 4: OBJECT DETECTION — Classifying Moving Targets', cls: 'c-detection', concept: 'detection', status: 'classifying', tab: 'DETECT' },
    5: { icon: '🌧️', text: 'LEVEL 5: NOISE FILTERING — Seeing Through Rain and Glare', cls: 'c-filtering', concept: 'filtering', status: 'expert', tab: 'FILTER' },
    6: { icon: '✏️', text: 'LEVEL 6: SAFETY DEPARTMENT BRIEFING — AI Literacy', cls: 'c-quiz', concept: 'labeling', status: 'certified', tab: 'DEPT' }
  };
  const RECAP = {
    1: '🧠 You just taught Iris: <strong>Supervised Labeling</strong> — AI learns what things look like from your labelled examples.',
    2: '🧠 You just taught Iris: <strong>Feature Extraction</strong> — Edge Mode removes visual clutter so AI can find real objects.',
    3: '🧠 You just taught Iris: <strong>Semantic Segmentation</strong> — AI splits overlapping objects into individuals using separation thresholds.',
    4: '🧠 You just taught Iris: <strong>Object Detection</strong> — AI finds and counts different types of objects in a scene.',
    5: '🧠 You just taught Iris: <strong>Noise Filtering</strong> — AI ignores rain, glare, and shadows to focus on real objects.'
  };

  let mode = 'loading', level = 1, L = {}, canvas, ctx, W = 800, H = 600, dpr = 1, rafId = null, lastT = 0;
  let renderOpts = { mode: 'rgb', time: 0 };
  let currentScene = [];
  let modeToggle = 'rgb'; // 'rgb' or 'edge'

  function after(sec, fn) { L.pending = L.pending || []; L.pending.push({ t: sec, fn }); }
  function runPending(dt) {
    if (!L.pending) return;
    const ready = L.pending.filter(p => { p.t -= dt; return p.t <= 0; });
    L.pending = L.pending.filter(p => p.t > 0);
    ready.forEach(p => p.fn());
  }

  function resize() {
    const wrap = canvas.parentElement;
    const rect = wrap.getBoundingClientRect();
    W = Math.max(320, rect.width); H = Math.max(280, rect.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function flash(text, kind, ms = 1100) {
    const el = document.getElementById('flash');
    if (!el) return;
    el.textContent = text; el.className = 'flash ' + (kind || 'info'); el.style.display = 'block';
    clearTimeout(el._t); el._t = setTimeout(() => { el.style.display = 'none'; }, ms);
  }

  function setHUD(text) { document.getElementById('roundInfo').textContent = text || ''; }
  function setCount(n) { document.getElementById('countInfo').textContent = `Found: ${n}`; }

  function configureControls() {
    ['labelControls','sliderControls','filterControls','countControls'].forEach(id => {
      document.getElementById(id).hidden = true;
    });
    document.getElementById('btnRetry').hidden = true;
    document.getElementById('timerInfo').hidden = (level !== 4);
    if (level === 1) document.getElementById('labelControls').hidden = false;
    else if (level === 3) document.getElementById('sliderControls').hidden = false;
    else if (level === 4) document.getElementById('countControls').hidden = false;
    else if (level === 5) document.getElementById('filterControls').hidden = false;
  }

  function setupLevel(n, source) {
    stopLoop(); level = n; L = { pending: [], phase: 'idle' };
    document.getElementById('modeToggle').hidden = (n === 1 || n === 6);
    modeToggle = 'rgb';
    const m = META[n]; const banner = document.getElementById('banner');
    banner.className = 'level-banner ' + m.cls;
    banner.querySelector('.banner-icon').textContent = m.icon;
    banner.querySelector('.banner-text').textContent = m.text;
    updateNav(); Iris.setLevel(n);
    renderOpts = { mode: 'rgb', time: 0, level: n, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches };
    const quizHost = document.getElementById('quizHost');
    if (n === 6) {
      canvas.style.display = 'none'; quizHost.hidden = false;
      configureControls(); Quiz.mount(quizHost, onQuizComplete); mode = 'playing'; return;
    } else { canvas.style.display = 'block'; quizHost.hidden = true; }
    mode = 'playing'; LEVELS[n].setup(); configureControls();
    if (n === 1) modeToggle = 'edge'; // L1 always uses Edge mode for training
    startLoop();
  }

  /* ========================= LEVEL SCRIPTS ========================= */
  const LEVELS = {
    /* LEVEL 1: SUPERVISED LABELING */
    1: {
      items: [
        { type: 'person', x: 0.1, y: 0.35, w: 0.12, h: 0.5 },
        { type: 'car', x: 0.3, y: 0.5, w: 0.2, h: 0.35 },
        { type: 'bike', x: 0.55, y: 0.45, w: 0.15, h: 0.35 },
        { type: 'person', x: 0.75, y: 0.3, w: 0.1, h: 0.5 },
        { type: 'car', x: 0.1, y: 0.55, w: 0.18, h: 0.3 },
        { type: 'bike', x: 0.4, y: 0.5, w: 0.12, h: 0.3 },
        { type: 'person', x: 0.6, y: 0.55, w: 0.1, h: 0.4 },
        { type: 'car', x: 0.8, y: 0.45, w: 0.15, h: 0.3 }
      ],
      testItems: [
        { type: 'person', correct: 'person' },
        { type: 'car', correct: 'car' },
        { type: 'bike', correct: 'bike' },
        { type: 'person', correct: 'person' }
      ],
      setup() {
        L.phase = 'training'; L.round = 0; L.total = this.items.length;
        L.labels = {}; L.testIdx = 0; L.testCorrect = 0;
        currentScene = SceneRenderer.buildScene(this.items);
        this.showNext();
      },
      showNext() {
        if (L.round >= L.total) { this.startTest(); return; }
        const obj = this.items[L.round];
        L.highlighted = obj; L.phase = 'training';
        setHUD(`Label ${L.round+1}/${L.total}: What is this shape?`);
        flash('Tap a label button!', 'info', 1200);
      },
      onLabel(label) {
        if (!L.highlighted) return;
        // --- TEST PHASE ---
        if (L.phase === 'test') {
          const item = this.testItems[L.testIdx];
          const correct = label === (item.correct || item.type);
          if (correct) { flash('✅ Correct!', 'ok'); L.testCorrect++; Iris.addCorrect(1); }
          else { flash(`❌ That's a ${item.type}`, 'bad'); }
          L.testIdx++;
          after(0.6, () => this.testNext());
          return;
        }
        // --- TRAINING PHASE ---
        if (L.phase !== 'training') return;
        const correct = L.highlighted.type === label;
        if (correct) { flash('✅ Correct!', 'ok'); Iris.addCorrect(1); }
        else { flash(`❌ That's a ${L.highlighted.type}`, 'bad'); }
        Iris.addFound(1);
        L.labels[L.highlighted.id] = label; L.round++;
        after(0.6, () => this.showNext());
      },
      startTest() {
        L.phase = 'test'; L.testIdx = 0; L.testCorrect = 0;
        currentScene = SceneRenderer.buildScene(this.testItems);
        this.testNext();
      },
      testNext() {
        if (L.testIdx >= this.testItems.length) {
          const passed = L.testCorrect >= 2;
          if (passed) { flash('✅ Iris learned from your labels!', 'ok'); after(1, completeLevel); }
          else { flash('❌ Let\'s try again!', 'bad'); after(1, () => { L.round = 0; this.setup(); }); }
          return;
        }
        const item = this.testItems[L.testIdx];
        L.highlighted = item;
        setHUD(`Test ${L.testIdx+1}/4: Iris sees a shape. What is it?`);
        flash('Iris is watching... tap the right label!', 'info', 1000);
      },
      onUpdate() {}
    },

    /* LEVEL 2: FEATURE EXTRACTION */
    2: {
      setup() {
        L.phase = 'active'; L.found = 0; L.wrong = 0;
        L.total = 6; L.foundIds = {};
        currentScene = SceneRenderer.buildScene([
          { type: 'person', x: 0.1, y: 0.3, w: 0.1, h: 0.5 },
          { type: 'person', x: 0.25, y: 0.35, w: 0.1, h: 0.45 },
          { type: 'person', x: 0.4, y: 0.3, w: 0.1, h: 0.5 },
          { type: 'person', x: 0.55, y: 0.35, w: 0.1, h: 0.45 },
          { type: 'person', x: 0.7, y: 0.3, w: 0.1, h: 0.5 },
          { type: 'person', x: 0.85, y: 0.35, w: 0.1, h: 0.45 }
        ]);
        modeToggle = 'rgb';
        setHUD(`Find all 6 pedestrians hiding in the RGB scene. Tap 🌐 Edge to see them!`);
        setCount(0);
        flash(`🌈 The RGB view is cluttered with colours and glare. Tap 🌐 Edge to see the clean outlines!`, 'info', 3000);
      },
      onCanvasTap(x, y) {
        if (L.phase !== 'active') return;
        // Find closest object
        const obj = currentScene.reduce((best, o) => {
          const dx = x - (10/W + (1 - 20/W) * o.x), dy = y - o.y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          return dist < (best?.[1] || Infinity) ? [o, dist] : best;
        }, null);
        if (!obj || obj[1] > 0.08) { flash('No object there. Look for the green outlines!', 'info', 800); return; }
        const o = obj[0];
        if (L.foundIds[o.id]) { flash('Already found!', 'info', 600); return; }
        L.foundIds[o.id] = true; L.found++;
        setCount(L.found); flash('✅ Found!', 'ok');
        Iris.addCorrect(1);
        if (L.found >= L.total) { after(0.6, completeLevel); }
      },
      onUpdate() {}
    },

    /* LEVEL 3: SEMANTIC SEGMENTATION */
    3: {
      rounds: [
        { count: 5, spread: 0.15 },
        { count: 8, spread: 0.1 },
        { count: 12, spread: 0.08 }
      ],
      setup() {
        L.round = 0; L.total = this.rounds.length;
        document.getElementById('detailSlider').value = 5;
        document.getElementById('detailVal').textContent = '5';
        L.detail = 5; this.startRound();
      },
      startRound() {
        const r = this.rounds[L.round];
        const people = [];
        for (let i = 0; i < r.count; i++) {
          const baseX = 0.1 + (i / r.count) * 0.8;
          const offset = (i % 3 - 1) * r.spread;
          people.push({ type: 'person', x: baseX + offset, y: 0.25 + Math.random() * 0.3, w: 0.08, h: 0.35 });
        }
        currentScene = SceneRenderer.buildScene(people);
        L.phase = 'active'; L.correct = false;
        setHUD(`Round ${L.round+1}: Adjust detail to separate ${r.count} people`);
        flash('Slide Detail to split the crowd!', 'info', 1500);
      },
      onDetailChange(val) {
        L.detail = val;
        document.getElementById('detailVal').textContent = val;
        renderOpts.detail = val;
        // Simulate separation: at high detail, show bounding boxes
        const threshold = Math.min(10, this.rounds[L.round].count + 3);
        renderOpts.showBoxes = val >= threshold - 2;
        renderOpts.correctBoxes = val >= threshold;
        if (val >= threshold && !L.correct) {
          L.correct = true;
          setHUD(`✅ Detail level correct! ${currentScene.length} people separated.`);
          flash('Separation achieved! Confirm count.', 'ok');
        }
      },
      onConfirm() {
        if (!L.correct) { flash('❌ Not separated yet. Increase Detail.', 'bad'); return; }
        L.phase = 'done'; L.round++;
        if (L.round >= L.total) { flash('✅ All rounds done!', 'ok'); after(0.8, completeLevel); }
        else { flash('✅ On to the next round!', 'ok'); after(0.6, () => this.startRound()); }
      },
      onUpdate() {}
    },

    /* LEVEL 4: OBJECT DETECTION */
    4: {
      waves: [
        { cars: 4, people: 2, bikes: 0, duration: 15 },
        { cars: 6, people: 0, bikes: 3, duration: 15 },
        { cars: 8, people: 3, bikes: 2, duration: 15 }
      ],
      setup() {
        L.round = 0; L.total = this.waves.length;
        L.counts = { person: 0, car: 0, bike: 0 };
        this.startWave();
      },
      startWave() {
        const w = this.waves[L.round];
        L.wave = w; L.phase = 'active'; L.timer = w.duration;
        const objects = [];
        for (let i = 0; i < w.cars; i++) objects.push({ type: 'car', x: 0.05 + (i/w.cars)*0.9, y: 0.4 + Math.random()*0.3, w: 0.12, h: 0.25 });
        for (let i = 0; i < w.people; i++) objects.push({ type: 'person', x: 0.05 + (i/w.people)*0.9, y: 0.25 + Math.random()*0.15, w: 0.08, h: 0.35 });
        for (let i = 0; i < w.bikes; i++) objects.push({ type: 'bike', x: 0.05 + (i/w.bikes)*0.9, y: 0.5 + Math.random()*0.2, w: 0.1, h: 0.2 });
        currentScene = SceneRenderer.buildScene(objects);
        L.counts = { person: 0, car: 0, bike: 0 };
        this.updateDisplay();
        setHUD(`Count the traffic! ${w.duration}s`);
        flash('Toggle Edge Mode and count!', 'info', 1500);
        document.getElementById('timerInfo').hidden = false;
      },
      updateDisplay() {
        document.getElementById('ctPeople').textContent = L.counts.person;
        document.getElementById('ctCars').textContent = L.counts.car;
        document.getElementById('ctBikes').textContent = L.counts.bike;
      },
      adjustCount(type, delta) {
        if (L.phase !== 'active' && L.phase !== 'timeup') return;
        L.counts[type] = Math.max(0, L.counts[type] + delta);
        this.updateDisplay();
      },
      onConfirmCounts() {
        const w = L.wave;
        const correct = L.counts.person === w.people && L.counts.car === w.cars && L.counts.bike === w.bikes;
        if (correct) {
          flash('✅ Correct counts!', 'ok'); Iris.addCorrect(1);
          document.getElementById('timerInfo').hidden = true;
          after(0.8, () => { L.round++; if (L.round >= L.total) completeLevel(); else this.startWave(); });
        } else if (L.phase === 'timeup') {
          const exp = `${w.people}P ${w.cars}C ${w.bikes}B`;
          flash(`⏱ Time's up! Expected: ${exp}`, 'bad', 2000);
          L.phase = 'active'; L.timer = 12; // Give extra time to fix counts
          flash('🔄 Extra time — fix your counts!', 'info', 1200);
        } else {
          const exp = `${w.people}P ${w.cars}C ${w.bikes}B`;
          flash(`❌ Not quite. Expected: ${exp}`, 'bad', 2000);
        }
      },
      onUpdate(dt) {
        if (L.phase !== 'active') return;
        L.timer -= dt;
        if (L.timer <= 0) {
          L.phase = 'timeup';
          flash('⏱ Time\'s up! Confirm your counts.', 'info', 1500);
        }
        document.getElementById('secondsLeft').textContent = Math.ceil(L.timer);
      }
    },

    /* LEVEL 5: NOISE FILTERING */
    5: {
      rounds: [
        { label: 'Heavy Rain', people: 4, noise: 0.3 },
        { label: 'Sun Glare', people: 4, noise: 0.25 }
      ],
      setup() {
        L.round = 0; L.total = this.rounds.length;
        document.getElementById('thickSlider').value = 5;
        document.getElementById('sensSlider').value = 5;
        document.getElementById('thickVal').textContent = '5';
        document.getElementById('sensVal').textContent = '5';
        L.thick = 5; L.sens = 5; this.startRound();
      },
      startRound() {
        const r = this.rounds[L.round];
        const objects = [];
        for (let i = 0; i < r.people; i++)
          objects.push({ type: 'person', x: 0.1 + (i/r.people)*0.8, y: 0.2 + Math.random()*0.3, w: 0.1, h: 0.4 });
        // Add noise objects (false edges from rain/glare)
        for (let i = 0; i < Math.round(r.noise * 30); i++)
          objects.push({ type: 'person', x: Math.random()*0.9, y: Math.random()*0.7, w: 0.03, h: 0.05, noise: true });
        currentScene = SceneRenderer.buildScene(objects);
        L.phase = 'active'; L.correct = false;
        // Validate initial slider position
        this.onSlider('thick', L.thick);
        this.onSlider('sens', L.sens);
        setHUD(`${r.label}: Find 4 people among the false edges`);
        flash('Adjust Line Thickness and Sensitivity to see only the people!', 'info', 2000);
        modeToggle = 'edge';
      },
      onSlider(type, val) {
        if (type === 'thick') { L.thick = val; document.getElementById('thickVal').textContent = val; }
        else { L.sens = val; document.getElementById('sensVal').textContent = val; }
        renderOpts.thick = L.thick; renderOpts.sens = L.sens;
        // Determine if filter is correct: thick 4-7 && sens 4-7
        const good = L.thick >= 4 && L.thick <= 7 && L.sens >= 4 && L.sens <= 7;
        if (good && !L.correct) {
          L.correct = true;
          setHUD('✅ Filter set! 4 people visible, noise removed.');
          flash('Noise filtered! Confirm settings.', 'ok');
          renderOpts.showBoxes = true; renderOpts.correctBoxes = true;
        }
      },
      onConfirm() {
        if (!L.correct) { flash('❌ Too much noise or missing people. Adjust both sliders.', 'bad', 1800); return; }
        L.round++;
        if (L.round >= L.total) { flash('✅ All rounds done!', 'ok'); after(0.8, completeLevel); }
        else { flash('✅ Round complete!', 'ok'); after(0.6, () => this.startRound()); }
      },
      onUpdate() {}
    }
  };

  /* ========================= HELPERS ========================= */
  function completeLevel() {
    stopLoop(); mode = 'result';
    const m = META[level];
    Iris.completeConcept(m.concept); Iris.setStatus(m.status); Iris.markLevelDone(level); updateNav();
    document.getElementById('resultIcon').textContent = '🧠';
    document.getElementById('resultTitle').textContent = `Level ${level} Complete!`;
    document.getElementById('resultTeach').innerHTML = RECAP[level] || '';
    const nextBtn = document.getElementById('btnNextLevel');
    nextBtn.textContent = level < 5 ? 'Next Level →' : 'Dept. Briefing →';
    nextBtn.hidden = false;
    document.getElementById('resultScreen').hidden = false;
    SFX.play.fanfare();
  }

  function onQuizComplete(passed, score) {
    if (passed) { Iris.setCertified(); Iris.markLevelDone(6); updateNav(); showCertificate(); }
    else setupLevel(5, 'quiz-fail');
  }

  function showCertificate() {
    mode = 'certificate';
    const c = document.getElementById('certScreen');
    const canvasC = document.getElementById('certCanvas');
    let name = ''; try { name = window.prompt('Your name for the department clearance:', 'AI Trainer') || 'AI Trainer'; } catch(e) { name = 'AI Trainer'; }
    Quiz.renderCertificate(canvasC, name); c.hidden = false; SFX.play.fanfare();
  }

  function buildNav() {
    const nav = document.getElementById('levelNav');
    nav.innerHTML = '';
    for (let i = 1; i <= 6; i++) {
      const b = document.createElement('button');
      b.className = 'level-tab'; b.id = 'level-tab-' + i; b.dataset.level = i;
      b.innerHTML = `L${i}<span class="tab-sub">${META[i].tab}</span>`;
      b.setAttribute('aria-label', `Level ${i}: ${META[i].tab}`);
      b.addEventListener('click', (e) => { e.stopPropagation(); if (mode !== 'loading') { hideScreens(); setupLevel(i, 'nav'); } });
      nav.appendChild(b);
    }
  }

  function updateNav() {
    document.querySelectorAll('.level-tab').forEach(b => {
      const n = parseInt(b.dataset.level, 10);
      b.classList.toggle('active', n === level);
      b.classList.toggle('done', Iris.isLevelDone(n));
    });
  }

  function getContext() { return { level, phase: L.phase }; }

  function startLoop() {
    stopLoop(); lastT = performance.now();
    const step = (now) => {
      const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
      if (mode === 'playing' && level !== 6) {
        runPending(dt); renderOpts.time = now; renderOpts.mode = modeToggle;
        renderOpts.highlighted = (level === 1) ? (L.highlighted || null) : null;
        if (LEVELS[level]?.onUpdate) LEVELS[level].onUpdate(dt);
        SceneRenderer.draw(ctx, W, H, currentScene, modeToggle, renderOpts);
      }
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
  }
  function stopLoop() { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } }

  function hideScreens() {
    ['menuScreen','resultScreen','certScreen'].forEach(id => document.getElementById(id).hidden = true);
  }

  function init() {
    canvas = document.getElementById('stage'); ctx = canvas.getContext('2d');
    const host = document.createElement('div'); host.id = 'quizHost'; host.className = 'quiz-host'; host.hidden = true;
    canvas.parentElement.appendChild(host);
    Transcript && Transcript.bind(); Iris.bind(); Iris.setContextProvider(getContext);
    Settings && Settings.bind((s) => Iris.applySettings(s));
    buildNav(); resize();
    window.addEventListener('resize', () => { resize(); if (mode === 'playing' && level !== 6) SceneRenderer.draw(ctx, W, H, currentScene, modeToggle, renderOpts); });

    // Controls
    document.querySelectorAll('.label-btn').forEach(b => {
      b.addEventListener('click', () => {
        if (LEVELS[1]) LEVELS[1].onLabel(b.dataset.label);
      });
    });
    document.getElementById('detailSlider').addEventListener('input', (e) => {
      if (level === 3) LEVELS[3].onDetailChange(parseInt(e.target.value, 10));
    });
    document.getElementById('btnConfirmCount').addEventListener('click', () => { if (level === 3) LEVELS[3].onConfirm(); });
    document.getElementById('thickSlider').addEventListener('input', (e) => { if (level === 5) LEVELS[5].onSlider('thick', parseInt(e.target.value,10)); });
    document.getElementById('sensSlider').addEventListener('input', (e) => { if (level === 5) LEVELS[5].onSlider('sens', parseInt(e.target.value,10)); });
    document.getElementById('btnConfirmFilter').addEventListener('click', () => { if (level === 5) LEVELS[5].onConfirm(); });
    document.querySelectorAll('.cnt-btn').forEach(b => {
      b.addEventListener('click', () => { if (level === 4) LEVELS[4].adjustCount(b.dataset.type, b.dataset.neg !== undefined ? -1 : 1); });
    });
    document.getElementById('btnConfirmCounts').addEventListener('click', () => { if (level === 4) LEVELS[4].onConfirmCounts(); });

    // Mode toggle
    document.getElementById('btnRGB').addEventListener('click', () => { modeToggle = 'rgb'; updateModeToggle(); });
    document.getElementById('btnEdge').addEventListener('click', () => { modeToggle = 'edge'; updateModeToggle(); });

    // Canvas tap (Level 2)
    canvas.addEventListener('pointerdown', (e) => {
      if (mode !== 'playing' || level === 6) return;
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / W;
      const y = (e.clientY - rect.top) / H;
      if (level === 2) LEVELS[2].onCanvasTap(x, y);
    });

    // Debug
    document.getElementById('btnDebug').addEventListener('click', () => {
      if (mode === 'playing') flash('🔧 Debug: ' + currentScene.length + ' objects', 'info', 1200);
    });

    // Nav
    const drawer = document.getElementById('transcriptDrawer');
    document.getElementById('btnTranscript').addEventListener('click', () => { drawer.hidden = !drawer.hidden; Transcript?.render(); });
    document.getElementById('btnCloseTranscript').addEventListener('click', () => { drawer.hidden = true; });
    document.getElementById('btnClearTranscript').addEventListener('click', () => Transcript?.clear());
    document.getElementById('btnNextLevel').addEventListener('click', () => { hideScreens(); setupLevel(level < 6 ? level + 1 : 6, 'next-button'); });
    document.getElementById('btnReplayLevel').addEventListener('click', () => { hideScreens(); setupLevel(level, 'replay-button'); });
    document.getElementById('btnCertDownload').addEventListener('click', () => {
      const c = document.getElementById('certCanvas'); const a = document.createElement('a');
      a.download = 'pixel-patrol-certificate.png'; a.href = c.toDataURL('image/png'); a.click();
    });
    document.getElementById('btnCertMenu').addEventListener('click', () => { hideScreens(); showMenu(); });
    document.getElementById('btnStart').addEventListener('click', () => {
      SFX.init(); SFX.resume(); hideScreens(); Iris.startListening(); Iris.greet(); setupLevel(1, 'start');
    });

    mode = 'menu'; showMenu();
    currentScene = SceneRenderer.buildScene([]); resize(); SceneRenderer.draw(ctx, W, H, currentScene, 'rgb', { time: 0 });
  }

  function updateModeToggle() {
    document.getElementById('btnRGB').classList.toggle('active', modeToggle === 'rgb');
    document.getElementById('btnEdge').classList.toggle('active', modeToggle === 'edge');
  }

  function showMenu() { mode = 'menu'; document.getElementById('menuScreen').hidden = false; }

  return { init, setupLevel };
})();
window.addEventListener('DOMContentLoaded', Game.init);
