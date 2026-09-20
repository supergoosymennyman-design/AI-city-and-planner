/**
 * game.js — Core game logic and state machine for Sonic Leak Hunter
 * 
 * State machine:
 * LOADING → MENU → LEVEL_SELECT → PLAYING → RESULT → CERTIFICATE (Lv6 only)
 * 
 * All 6 levels unlocked from start (top nav bar).
 * Each level resets on switch.
 */

const Game = (() => {
  'use strict';

  // ─── State Machine ──────────────────────────
  const States = {
    LOADING: 'loading',
    MENU: 'menu',
    PLAYING: 'playing',
    RESULT: 'result',
    CERTIFICATE: 'certificate'
  };

  let state = States.LOADING;
  let currentLevel = 1;
  let levelData = {}; // Per-level state storage

  // ─── DOM References ─────────────────────────
  let dom = {};

  // ─── Level-specific state ───────────────────
  let lv1 = {}; // L1: wave classifier
  let lv2 = {}; // L2: (unused legacy)
  let lv3 = {}; // L3: edge case classifier
  let lv4 = {}; // L4 render slot (currently L2 threshold slider — legacy name)
  let lv4conf = {}; // L4: confidence command
  let lv5 = {}; // L5: city scan
  let lv6 = {}; // L6: quiz

  // Animation frame IDs for cleanup
  let animFrames = [];

  // ─── Feedback Helper ────────────────────────
  /**
   * Set feedback text safely using textContent + createElement.
   * For plain text with an optional CSS class.
   */
  function setFeedback(text, className) {
    if (!dom.feedback) return;
    dom.feedback.textContent = '';
    const span = document.createElement('span');
    if (className) span.className = className;
    span.textContent = text;
    dom.feedback.appendChild(span);
  }

  /**
   * Set feedback with HTML content (for cases needing <strong>, etc.)
   * Only use with hardcoded strings, never user input.
   */
  function setFeedbackHTML(html) {
    if (!dom.feedback) return;
    dom.feedback.textContent = '';
    dom.feedback.insertAdjacentHTML('beforeend', html);
  }

  // ─── Initialization ─────────────────────────

  function init() {
    console.log('🚰 Sonic Leak Hunter initializing...');
    
    // Cache DOM references
    cacheDom();
    
    // Load settings
    Settings.load();
    AudioFX.setMuted(Settings.get('muted'));
    
    // Setup navigation
    setupLevelNav();
    
    // Setup Piper
    setupPiper();
    
    // Setup tool buttons
    setupToolButtons();
    
    // Show menu
    showMenu();
    
    state = States.MENU;
    
    console.log('✅ Sonic Leak Hunter ready!');
  }

  function cacheDom() {
    dom.loading = document.getElementById('loading-screen');
    dom.menu = document.getElementById('menu-screen');
    dom.gameArea = document.getElementById('game-area');
    dom.result = document.getElementById('result-screen');
    dom.certificate = document.getElementById('certificate-screen');
    dom.topBar = document.getElementById('top-bar');
    dom.levelTabs = document.querySelectorAll('.level-tab');
    dom.levelBanner = document.getElementById('level-banner');
    dom.levelInstruction = document.getElementById('level-instruction');
    dom.canvasContainer = document.getElementById('canvas-container');
    dom.trainingCanvas = document.getElementById('training-canvas');
    dom.waveformCanvas = document.getElementById('waveform-canvas');
    dom.gridCanvas = document.getElementById('grid-canvas');
    dom.progressCanvas = document.getElementById('progress-canvas');
    dom.threeCanvas = document.getElementById('three-canvas');
    dom.sliderContainer = document.getElementById('slider-container');
    dom.sensitivitySlider = document.getElementById('sensitivity-slider');
    dom.sliderValue = document.getElementById('slider-value');
    dom.counters = document.getElementById('counters');
    dom.falseAlarmsEl = document.getElementById('false-alarms');
    dom.leaksCaughtEl = document.getElementById('leaks-caught');
    dom.deployBtn = document.getElementById('deploy-btn');
    dom.feedback = document.getElementById('feedback');
    dom.piperContainer = document.getElementById('piper-container');
    dom.piperState = document.getElementById('piper-state');
    dom.piperBubble = document.getElementById('piper-bubble');
    dom.textInput = document.getElementById('text-input');
    dom.textSend = document.getElementById('text-send');
    dom.settingsContainer = document.getElementById('settings-container');
    dom.transcriptContainer = document.getElementById('transcript-container');
    dom.transcriptDrawer = document.getElementById('transcript-drawer');
    dom.endRecapText = document.getElementById('end-recap-text');
    dom.endRecapConcept = document.getElementById('end-recap-concept');
    dom.certCanvas = document.getElementById('cert-canvas');
    dom.quizCanvas = document.getElementById('quiz-canvas');
    dom.comparisonCanvas = document.getElementById('comparison-canvas');
    dom.levelControls = document.getElementById('level-controls');
    dom.quizProgress = document.getElementById('quiz-progress');
    dom.quizScore = document.getElementById('quiz-score');
    dom.submitQuiz = document.getElementById('submit-quiz');
  }

  function setupLevelNav() {
    dom.levelTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const level = parseInt(tab.dataset.level);
        switchToLevel(level);
      });
    });
  }

  function setupPiper() {
    if (window.Piper) {
      Piper.init({
        level: currentLevel,
        muted: Settings.get('muted'),
        container: dom.piperContainer,
        onStateChange: (newState) => {
          if (dom.piperState) {
            dom.piperState.textContent = Piper.getStateLabel();
            dom.piperState.className = 'piper-state-indicator piper-' + newState;
          }
        },
        onResponse: ({ text, intent }) => {
          if (dom.piperBubble) {
            dom.piperBubble.textContent = text;
          }
        }
      });
    }
    
    // Setup text input fallback
    if (dom.textSend) {
      dom.textSend.addEventListener('click', () => {
        if (dom.textInput && Piper) {
          Piper.handleTextInput(dom.textInput.value);
          dom.textInput.value = '';
        }
      });
    }
    
    if (dom.textInput) {
      dom.textInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && Piper) {
          Piper.handleTextInput(dom.textInput.value);
          dom.textInput.value = '';
        }
      });
      
      // Show text input if mic unavailable
      if (Piper.micFallback) {
        dom.textInput.parentElement.style.display = 'flex';
      }
    }
  }

  function setupToolButtons() {
    // ⚙️ Settings
    const settingsBtn = document.getElementById('btn-settings');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
        if (window.Settings) {
          // Close transcript drawer if open before showing settings
          const drawer = dom.transcriptDrawer;
          if (drawer.classList.contains('open')) {
            drawer.classList.remove('open');
          }
          Settings.show(dom.settingsContainer);
        }
      });
    }
    
    // 📝 Transcript
    const transcriptBtn = document.getElementById('btn-transcript');
    if (transcriptBtn) {
      transcriptBtn.addEventListener('click', () => {
        const drawer = dom.transcriptDrawer;
        if (drawer.classList.contains('open')) {
          drawer.classList.remove('open');
        } else {
          // Close settings if open before showing transcript
          if (window.Settings && dom.settingsContainer.style.display === 'block') {
            Settings.hide(dom.settingsContainer);
          }
          drawer.classList.add('open');
          if (window.Transcript) {
            Transcript.render(drawer.querySelector('.transcript-list'));
          }
        }
      });
    }
    
    // 🔧 Debug toggle
    const debugBtn = document.getElementById('btn-debug');
    if (debugBtn) {
      debugBtn.addEventListener('click', () => {
        document.body.classList.toggle('debug-mode');
        debugBtn.classList.toggle('active', document.body.classList.contains('debug-mode'));
        // Re-render current level to show answers
        renderCurrentLevel();
      });
    }
  }

  // ─── State Transitions ──────────────────────

  function showLoading() {
    state = States.LOADING;
    hideAll();
    if (dom.loading) dom.loading.style.display = 'flex';
    
    // Simulate loading, then show menu
    setTimeout(showMenu, 600);
  }

  function showMenu() {
    state = States.MENU;
    hideAll();
    
    if (dom.loading) dom.loading.style.display = 'none';
    if (dom.menu) dom.menu.style.display = 'flex';
    if (dom.topBar) dom.topBar.style.display = 'none';
    if (dom.gameArea) dom.gameArea.style.display = 'none';
    
    // Start button
    const startBtn = dom.menu?.querySelector('.start-btn');
    if (startBtn) {
      startBtn.onclick = () => switchToLevel(1);
    }
    
    // Level select buttons
    const selectBtns = dom.menu?.querySelectorAll('.level-select-btn');
    if (selectBtns) {
      selectBtns.forEach(btn => {
        btn.onclick = () => switchToLevel(parseInt(btn.dataset.level));
      });
    }
  }

  function switchToLevel(level) {
    // Clean up any running animations from previous level
    cleanupLevel();
    
    currentLevel = level;
    resetLevelState(level);
    
    // Update Piper's level context
    if (window.Piper) Piper.setLevel(level);
    
    // Update UI
    updateLevelBanner(level);
    updateLevelNav(level);
    
    // Show game area
    hideAll();
    if (dom.menu) dom.menu.style.display = 'none';
    if (dom.loading) dom.loading.style.display = 'none';
    if (dom.topBar) dom.topBar.style.display = 'flex';
    if (dom.gameArea) dom.gameArea.style.display = 'flex';
    if (dom.result) dom.result.style.display = 'none';
    if (dom.certificate) dom.certificate.style.display = 'none';
    
    state = States.PLAYING;
    renderLevel(level);
    
    // Show Piper idle prompt after a short delay
    setTimeout(() => {
      if (window.Piper && state === States.PLAYING) {
        Piper.showIdlePrompt();
      }
    }, 2000);
  }

  function showResult(level, passed, message) {
    state = States.RESULT;
    
    if (dom.result) dom.result.style.display = 'flex';
    
    const levelMeta = LEVELS.find(l => l.id === level);
    
    if (dom.endRecapText) {
      dom.endRecapText.textContent = message || levelMeta?.endRecap || 'Level complete!';
    }
    if (dom.endRecapConcept) {
      dom.endRecapConcept.textContent = `🧠 You just learned about: ${levelMeta?.aiConcept || 'AI'} — ${levelMeta?.aiConceptShort || ''}`;
    }
    
    // Buttons
    const retryBtn = dom.result?.querySelector('#btn-retry');
    const nextBtn = dom.result?.querySelector('#btn-next');
    const menuBtn = dom.result?.querySelector('#btn-menu');
    
    if (retryBtn) retryBtn.onclick = () => switchToLevel(level);
    if (nextBtn) {
      if (level < 6) {
        nextBtn.style.display = 'inline-block';
        nextBtn.onclick = () => switchToLevel(level + 1);
      } else {
        nextBtn.style.display = 'inline-block';
        nextBtn.textContent = 'View Certificate';
        nextBtn.onclick = showCertificate;
      }
    }
    if (menuBtn) menuBtn.onclick = showMenu;
    
    AudioFX.success();
  }

  function showCertificate() {
    state = States.CERTIFICATE;
    
    hideAll();
    if (dom.certificate) dom.certificate.style.display = 'flex';
    
    // Render certificate
    setTimeout(() => {
      const canvas = dom.certCanvas;
      if (!canvas) return;
      
      canvas.width = canvas.parentElement.clientWidth || 700;
      canvas.height = canvas.parentElement.clientHeight || 500;
      
      Renderer.drawCertificate(canvas, lv6.score, 10);
      
      // Also draw Piper comparison
      const compCanvas = dom.comparisonCanvas;
      if (compCanvas) {
        compCanvas.width = compCanvas.parentElement.clientWidth || 500;
        compCanvas.height = compCanvas.parentElement.clientHeight || 250;
        Renderer.drawPiperComparison(compCanvas);
      }
    }, 200);
    
    // Buttons
    const retakeBtn = dom.certificate?.querySelector('#btn-retake');
    const menuBtn = dom.certificate?.querySelector('#btn-menu');
    
    if (retakeBtn) retakeBtn.onclick = () => switchToLevel(1);
    if (menuBtn) menuBtn.onclick = showMenu;
  }

  function hideAll() {
    [dom.loading, dom.menu, dom.gameArea, dom.result, dom.certificate].forEach(el => {
      if (el) el.style.display = 'none';
    });
  }

  // ─── Level Rendering ────────────────────────

  function renderCurrentLevel() {
    renderLevel(currentLevel);
  }

  function updateLevelBanner(level) {
    const meta = LEVELS.find(l => l.id === level);
    if (!meta) return;
    
    if (dom.levelBanner) {
      dom.levelBanner.style.backgroundColor = meta.bannerColor;
      dom.levelBanner.querySelector('.banner-icon') && 
        (dom.levelBanner.querySelector('.banner-icon').textContent = meta.icon);
      dom.levelBanner.querySelector('.banner-title') && 
        (dom.levelBanner.querySelector('.banner-title').textContent = `LEVEL ${level}: ${meta.aiConcept.toUpperCase()}`);
      dom.levelBanner.querySelector('.banner-subtitle') && 
        (dom.levelBanner.querySelector('.banner-subtitle').textContent = meta.title);
    }
    
    if (dom.levelInstruction) {
      dom.levelInstruction.textContent = meta.instruction;
    }
  }

  function updateLevelNav(level) {
    dom.levelTabs.forEach(tab => {
      tab.classList.toggle('active', parseInt(tab.dataset.level) === level);
    });
  }

  function renderLevel(level) {
    // Hide all level-specific UI
    resetUI();
    
    const meta = LEVELS.find(l => l.id === level);
    if (!meta) return;
    
    switch (level) {
      case 1: renderLevel1(meta); break;            // Sort the Sounds
      case 2: renderLevel4(meta); break;            // Tune the Sensitivity (slider)
      case 3: renderEdgeCaseLevel(meta); break;     // Edge Case Patrol (3D oscilloscope)
      case 4: renderConfidenceLevel(meta); break;   // Confidence Command (3D bars)
      case 5: renderPipeInspectionLevel(meta); break;  // Pipe Vision Inspector (3D)
      case 6: renderLevel6(meta); break;            // Water Department Briefing (quiz)
    }
  }

  function resetUI() {
    // Hide all canvases and controls
    [
      dom.trainingCanvas, dom.waveformCanvas, dom.gridCanvas, 
      dom.progressCanvas, dom.quizCanvas, dom.certCanvas, dom.comparisonCanvas,
      dom.threeCanvas
    ].forEach(c => { if (c) c.style.display = 'none'; });
    
    if (dom.canvasContainer) {
      dom.canvasContainer.style.display = 'none';
      dom.canvasContainer.style.flexDirection = 'row';
    }
    if (dom.sliderContainer) dom.sliderContainer.style.display = 'none';
    if (dom.counters) dom.counters.style.display = 'none';
    if (dom.deployBtn) dom.deployBtn.style.display = 'none';
    if (dom.feedback) dom.feedback.style.display = 'none';
    if (dom.levelControls) dom.levelControls.style.display = 'none';
    if (dom.quizProgress) dom.quizProgress.style.display = 'none';
    if (dom.quizScore) dom.quizScore.style.display = 'none';
  }

  // ─── Level 1: Sort the Sounds (animated waves + Leak/Safe classification) ─────

  function renderLevel1(meta) {
    lv1.index = lv1.index || 0;
    lv1.score = lv1.score || 0;
    lv1.answered = lv1.answered || false;

    // If all 12 sorted → done
    if (lv1.index >= meta.totalItems) {
      const score = lv1.score;
      const msg = `You sorted ${score}/${meta.totalItems} correctly! ` + (score >= 10 ? 'Amazing ears!' : score >= 7 ? 'Great detective work!' : 'Keep training — Piper needs you!');
      showResult(1, score >= 7, meta.endRecap);
      return;
    }

    // Build the generator once per level (12 live wave functions)
    if (!lv1.generators) {
      lv1.generators = meta.wavePool.map((w) =>
        Waveforms.createLiveWave({
          baseFreq: w.freq,
          baseAmp: w.amp,
          noise: w.noise,
          spikeAmp: w.spikeAmp,
          spikePos: w.spikePos,
          isLeak: w.isLeak
        })
      );
    }

    // Show the live waveform canvas + classify controls
    if (dom.canvasContainer) { dom.canvasContainer.style.display = 'flex'; }
    if (dom.feedback) dom.feedback.style.display = 'block';
    if (dom.levelControls) dom.levelControls.style.display = 'flex';
    if (dom.quizProgress) dom.quizProgress.style.display = 'block';

    const canvas = dom.waveformCanvas;
    if (canvas) {
      canvas.style.display = 'block';
      canvas.width = canvas.parentElement?.clientWidth || 500;
      canvas.height = 300;
    }

    // Progress + score
    if (dom.quizProgress) {
      dom.quizProgress.innerHTML = `
        <div class="quiz-progress-bar">
          <div class="quiz-progress-fill" style="width:${(lv1.index / meta.totalItems) * 100}%"></div>
        </div>
        <span>${lv1.index} of ${meta.totalItems} sorted · ✅ ${lv1.score} correct</span>
      `;
    }

    setFeedback(`Watch the wave… then sort it: NORMAL 💧 or LEAK 🚨`, '');

    // Start the live animation for the current wave
    startLevel1Animation(lv1.index);

    // Classification buttons
    if (dom.levelControls) {
      dom.levelControls.innerHTML = `
        <button class="level-action-btn safe-btn" id="lv1-safe">💧 NORMAL</button>
        <button class="level-action-btn leak-btn" id="lv1-leak">🚨 LEAK</button>
      `;
      const safeBtn = dom.levelControls.querySelector('#lv1-safe');
      const leakBtn = dom.levelControls.querySelector('#lv1-leak');
      const answer = meta.wavePool[lv1.index].isLeak ? 'LEAK' : 'SAFE';
      const pick = (choice) => {
        if (lv1.answered) return;
        lv1.answered = true;
        const correct = choice === answer;
        if (correct) lv1.score++;
        // disable buttons after answering
        safeBtn.disabled = true; leakBtn.disabled = true;
        safeBtn.style.opacity = '0.5'; leakBtn.style.opacity = '0.5';
        if (correct) { setFeedback('✅ Correct! ' + (answer === 'LEAK' ? 'That sharp spike means a leak!' : 'Smooth waves — that pipe is safe!'), 'feedback-correct'); AudioFX.correctTap(); }
        else { setFeedback('❌ Hmm — ' + (answer === 'LEAK' ? 'look for the BIG spike — that one has it!' : 'that one is smooth — no spike, so it\'s safe!'), 'feedback-wrong'); AudioFX.wrongTap(); }
        setTimeout(() => {
          lv1.index++;
          lv1.answered = false;
          renderLevel1(meta);
        }, 1600);
      };
      safeBtn.onclick = () => pick('SAFE');
      leakBtn.onclick = () => pick('LEAK');
    }
  }

  // Live-animate the current L1 wave on the waveform canvas (no answer hints —
  // the wave is drawn in a neutral color; the child judges by shape alone).
  function startLevel1Animation(index) {
    if (lv1._animFrame) cancelAnimationFrame(lv1._animFrame);
    const canvas = dom.waveformCanvas;
    if (!canvas || !lv1.generators) return;
    const generator = lv1.generators[index];
    if (!generator) return;
    let lastTime = performance.now();
    function animate(time) {
      const dt = (time - lastTime) / 1000;
      lastTime = time;
      const points = generator(canvas.width, canvas.height, Math.min(dt, 0.05));
      Renderer.drawSingleWaveform(canvas, points, 'neutral');
      lv1._animFrame = requestAnimationFrame(animate);
    }
    lv1._animFrame = requestAnimationFrame(animate);
  }

  // (Removed: old L1 training-phase / L2 grid-scan / L3 noise-filter code — superseded)
  // ─── Level 4: Tune the Sensitivity ───────────

  function renderLevel4(meta) {
    lv4.subRound = lv4.subRound || 0;
    // Start at 10 (highest threshold = top of canvas, no crossings)
    // Student must drag DOWN to find the sweet spot — never pre-solved
    lv4.sliderValue = lv4.sliderValue || 10;
    
    if (lv4.subRound >= meta.subRounds) {
      showResult(2, true, meta.endRecap);
      return;
    }
    
    const pattern = meta.wavePatterns[lv4.subRound];
    
    // Show slider and counters
    if (dom.sliderContainer) dom.sliderContainer.style.display = 'flex';
    if (dom.counters) dom.counters.style.display = 'flex';
    if (dom.canvasContainer) dom.canvasContainer.style.display = 'flex';
    if (dom.feedback) dom.feedback.style.display = 'block';
    
    // Initial instruction (visible when feedback area is shown)
    setFeedback('Adjust the slider so the red line only touches the spike, then tap Set Threshold!', '');
    
    // Sensitivity slider
    const slider = dom.sensitivitySlider;
    if (slider) {
      slider.min = meta.sliderMin;
      slider.max = meta.sliderMax;
      slider.value = lv4.sliderValue;
      slider.oninput = () => {
        lv4.sliderValue = parseInt(slider.value);
        if (dom.sliderValue) dom.sliderValue.textContent = lv4.sliderValue;
        updateLevel4Canvas(meta);
      };
    }
    if (dom.sliderValue) dom.sliderValue.textContent = lv4.sliderValue;
    
    updateLevel4Canvas(meta);
    
    // Confirm button
    if (dom.levelControls) {
      dom.levelControls.style.display = 'flex';
      dom.levelControls.innerHTML = `
        <button class="level-action-btn" id="lv4-confirm">✅ Set Threshold</button>
        <span class="hint-text">Make the red line only touch the spike!</span>
      `;
      dom.levelControls.querySelector('#lv4-confirm').onclick = () => confirmLevel4(meta);
    }
  }

  function updateLevel4Canvas(meta) {
    const canvas = dom.waveformCanvas;
    if (!canvas) return;
    
    canvas.style.display = 'block';
    canvas.width = canvas.parentElement?.clientWidth || 600;
    canvas.height = 350;
    
    const pattern = meta.wavePatterns[lv4.subRound];
    const points = Waveforms.thresholdWave(canvas.width, canvas.height, 
      pattern.freq, pattern.amp, pattern.noise, pattern.spikeAmp, pattern.spikePos);
    
    const ctx = canvas.getContext('2d');
    Renderer.clearCanvas(canvas);
    
    // Draw wave
    Renderer.drawWaveform(ctx, points, '#1B6B93', 3, true, '#1B6B9322');
    
    // Calculate threshold y position (slider 1-10 mapped to canvas height)
    // Slider 1 = lowest threshold (most sensitive). Slider 10 = highest (most conservative).
    const thresholdRatio = (lv4.sliderValue - 1) / 9;
    const thresholdY = 50 + thresholdRatio * (canvas.height - 100);
    
    Renderer.drawThresholdLine(canvas, points, thresholdY, '#E76F51');
    
    // Count crossings
    const result = Waveforms.checkThreshold(points, thresholdY, pattern.spikePos, 0.12);
    
    // Update counters
    if (dom.falseAlarmsEl) dom.falseAlarmsEl.textContent = result.safeCrossings;
    if (dom.leaksCaughtEl) dom.leaksCaughtEl.textContent = result.leakCrossings > 0 ? '1' : '0';
    
    // Highlight crossings
    const crossingsAbove = result.leakCrossings > 0;
    if (crossingsAbove && !result.intersectsSafe) {
      Renderer.highlightCrossings(ctx, points, thresholdY, '#2A9D8F');
    } else if (result.intersectsSafe) {
      Renderer.highlightCrossings(ctx, points, thresholdY, '#E63946');
    }
    
    lv4._currentResult = result;
    lv4._thresholdY = thresholdY;
  }

  function confirmLevel4(meta) {
    const pattern = meta.wavePatterns[lv4.subRound];
    const result = lv4._currentResult || {};
    
    const isCorrect = result.leakCrossings > 0 && result.safeCrossings === 0;
    const inTolerance = lv4.sliderValue >= pattern.toleranceRange[0] && 
                        lv4.sliderValue <= pattern.toleranceRange[1];
    
    if (isCorrect || inTolerance) {
      setFeedback('✅ Perfect balance! The threshold catches the leak but avoids false alarms!', 'feedback-correct');
      AudioFX.correctTap();
      
      setTimeout(() => {
        lv4.subRound++;
        lv4.sliderValue = 10; // Reset slider for next round (never pre-solved)
        renderLevel4(meta);
      }, 1500);
    } else if (result.intersectsSafe) {
      setFeedback('❌ Too many false alarms! Move the slider UP to raise the threshold.', 'feedback-wrong');
      AudioFX.alarm();
    } else {
      setFeedback('❌ Leak not caught! Move the slider DOWN to lower the threshold.', 'feedback-wrong');
      AudioFX.wrongTap();
    }
  }
  // (Removed: old L5 batch-deployment code — superseded)

  // ─── Level 6: Certification Quiz ─────────────

  function renderLevel6(meta) {
    lv6.currentQuestion = lv6.currentQuestion || 0;
    lv6.answers = lv6.answers || [];
    lv6.score = lv6.score || 0;
    
    // Setup quiz area
    if (dom.canvasContainer) dom.canvasContainer.style.display = 'flex';
    
    const canvas = dom.quizCanvas;
    canvas.style.display = 'block';
    canvas.width = canvas.parentElement?.clientWidth || 600;
    canvas.height = 550;
    
    // Progress bar
    if (dom.quizProgress) dom.quizProgress.style.display = 'block';
    if (dom.quizScore) dom.quizScore.style.display = 'block';
    if (dom.levelControls) dom.levelControls.style.display = 'none';
    
    updateQuizUI(meta);
  }

  function updateQuizUI(meta) {
    const canvas = dom.quizCanvas;
    if (!canvas) return;
    
    const q = Quiz.getQuestion(lv6.currentQuestion);
    if (!q) {
      // Quiz complete
      lv6.score = lv6.answers.filter(a => a.correct).length;
      if (lv6.score >= meta.passScore) {
        showCertificate();
      } else {
        showResult(6, false, `You briefed ${lv6.score}/10 correctly. The Water Department needs ${meta.passScore} to clear the AI!`);
      }
      return;
    }
    
    // Restore previous answer if any
    if (lv6.answers[lv6.currentQuestion]) {
      q.answered = true;
      q.selectedChoice = lv6.answers[lv6.currentQuestion].choiceIndex;
      q._lastCorrect = lv6.answers[lv6.currentQuestion].correct;
      q.choices.forEach((c, i) => c.selected = i === q.selectedChoice);
    }
    
    Renderer.drawQuizQuestion(canvas, q, lv6.currentQuestion + 1, meta.totalQuestions);
    lv6._quizQuestion = q;
    
    // Update progress bar
    if (dom.quizProgress) {
      dom.quizProgress.innerHTML = `
        <div class="quiz-progress-bar">
          <div class="quiz-progress-fill" style="width:${((lv6.currentQuestion) / meta.totalQuestions) * 100}%"></div>
        </div>
        <span>${lv6.currentQuestion} of ${meta.totalQuestions}</span>
      `;
    }
    
    // Canvas click for choices
    canvas.onclick = (e) => handleQuizTap(e, canvas, meta);
    
    // Next button (after answering)
    if (dom.levelControls) {
      dom.levelControls.style.display = q.answered ? 'flex' : 'none';
      dom.levelControls.innerHTML = q.answered 
        ? `<button class="level-action-btn" id="quiz-next">Advise →</button>`
        : '';
      if (q.answered) {
        dom.levelControls.querySelector('#quiz-next').onclick = () => {
          lv6.currentQuestion++;
          updateQuizUI(meta);
        };
      }
    }
  }

  function handleQuizTap(e, canvas, meta) {
    const q = lv6._quizQuestion;
    if (!q || q.answered) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    
    const choices = q._choices;
    if (!choices) return;
    
    for (const choice of choices) {
      const r = choice.rect;
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        // Mark choice
        const result = Quiz.checkAnswer(q, choice.index);
        
        q.answered = true;
        q.selectedChoice = choice.index;
        q._lastCorrect = result.correct;
        q.choices.forEach((c, i) => c.selected = i === choice.index);
        
        lv6.answers[lv6.currentQuestion] = {
          choiceIndex: choice.index,
          correct: result.correct,
          concept: result.concept
        };
        
        if (result.correct) {
          lv6.score++;
          AudioFX.correctTap();
        } else {
          AudioFX.wrongTap();
        }
        
        // Redraw with feedback
        Renderer.drawQuizQuestion(canvas, q, lv6.currentQuestion + 1, meta.totalQuestions);
        
        // Show next button
        if (dom.levelControls) {
          dom.levelControls.style.display = 'flex';
          dom.levelControls.innerHTML = `
            <button class="level-action-btn" id="quiz-next">
              ${lv6.currentQuestion < meta.totalQuestions - 1 ? 'Advise →' : 'View Briefing'}
            </button>
          `;
          dom.levelControls.querySelector('#quiz-next').onclick = () => {
            lv6.currentQuestion++;
            updateQuizUI(meta);
          };
        }
        break;
      }
    }
  }

  // ─── Level 3: Edge Case Patrol (3D oscilloscope) ──

  /** Init the 3D canvas once per level entry (guarded by the level's _threeReady). */
  function ensure3DCanvas(stateObj) {
    if (stateObj._threeReady) return;
    stateObj._threeReady = true;
    const three = dom.threeCanvas;
    if (!three || !window.ThreeRenderer || !ThreeRenderer.isSupported()) return;
    three.style.display = 'block';
    three.width = Math.min(three.parentElement?.clientWidth || 600, 640);
    three.height = 300;
    ThreeRenderer.init(three, three.width, three.height);
  }

  function renderEdgeCaseLevel(meta) {
    lv3.index = lv3.index || 0;
    lv3.score = lv3.score || 0;
    lv3.answered = lv3.answered || false;

    if (lv3.index >= meta.totalItems) {
      showResult(3, lv3.score >= meta.passScore, meta.endRecap);
      return;
    }

    const pattern = meta.edgePatterns[lv3.index];
    const use3D = window.ThreeRenderer && ThreeRenderer.isSupported();

    if (dom.canvasContainer) dom.canvasContainer.style.display = 'flex';
    if (dom.feedback) dom.feedback.style.display = 'block';
    if (dom.levelControls) dom.levelControls.style.display = 'flex';
    if (dom.quizProgress) dom.quizProgress.style.display = 'block';

    const three = dom.threeCanvas;
    const wave = dom.waveformCanvas;

    if (use3D) {
      ensure3DCanvas(lv3);
      if (wave) wave.style.display = 'none';
      if (three) {
        three.style.display = 'block';
        const w = Math.min(three.parentElement?.clientWidth || 600, 640);
        const h = 300;
        if (three.width !== w) { three.width = w; ThreeRenderer.setSize(w, h); }
        const gen = Waveforms[pattern.generator];
        const points = gen ? gen(w, h, ...Object.values(pattern.params)) : [];
        ThreeRenderer.drawWaveform(points, pattern.color, { width: w, height: h });
      }
    } else {
      if (three) three.style.display = 'none';
      if (wave) {
        wave.style.display = 'block';
        wave.width = wave.parentElement?.clientWidth || 600;
        wave.height = 300;
        const gen = Waveforms[pattern.generator];
        const points = gen ? gen(wave.width, wave.height, ...Object.values(pattern.params)) : [];
        Renderer.drawSingleWaveform(wave, points, 'neutral');
      }
    }

    // Progress + score
    if (dom.quizProgress) {
      dom.quizProgress.innerHTML = `
        <div class="quiz-progress-bar">
          <div class="quiz-progress-fill" style="width:${(lv3.index / meta.totalItems) * 100}%"></div>
        </div>
        <span>${lv3.index} of ${meta.totalItems} · ✅ ${lv3.score} correct</span>
      `;
    }

    setFeedback(`${pattern.label} — is this a threat or just noise?`, '');

    // Classification buttons
    if (dom.levelControls) {
      dom.levelControls.innerHTML = `
        <button class="level-action-btn safe-btn" id="edge-noise">🔇 Just Noise</button>
        <button class="level-action-btn leak-btn" id="edge-threat">🚨 Investigate</button>
      `;
      const noiseBtn = dom.levelControls.querySelector('#edge-noise');
      const threatBtn = dom.levelControls.querySelector('#edge-threat');
      const pick = (choice) => {
        if (lv3.answered) return;
        lv3.answered = true;
        noiseBtn.disabled = true; threatBtn.disabled = true;
        noiseBtn.style.opacity = '0.5'; threatBtn.style.opacity = '0.5';
        const correct = (choice === 'THREAT') === pattern.isThreat;
        if (correct) {
          lv3.score++;
          setFeedback(pattern.isThreat
            ? '✅ Correct! That pattern needs investigation — a real threat!'
            : '✅ Right — that is just noise, not a leak!', 'feedback-correct');
          AudioFX.correctTap();
        } else {
          setFeedback(`❌ ${pattern.hint}`, 'feedback-wrong');
          AudioFX.wrongTap();
        }
        setTimeout(() => {
          lv3.index++;
          lv3.answered = false;
          renderEdgeCaseLevel(meta);
        }, 1700);
      };
      noiseBtn.onclick = () => pick('NOISE');
      threatBtn.onclick = () => pick('THREAT');
    }
  }

  // ─── Level 4: Confidence Command (3D bars) ──

  function generateAlertWave(alert, width, height) {
    const w = alert.wave;
    if (!w) return Waveforms.smoothSine(width, height, 1.5, 0.2, 0.05);
    if (w.gen === 'smoothSine') return Waveforms.smoothSine(width, height, w.freq, w.amp, w.noise);
    if (w.gen === 'compositeWave') return Waveforms.compositeWave(width, height, w.freq, w.amp, w.noise, w.spikeAmp, w.spikePos);
    return Waveforms.smoothSine(width, height, 1.5, 0.2, 0.05);
  }

  function renderConfidenceLevel(meta) {
    lv4conf.index = lv4conf.index || 0;
    lv4conf.score = lv4conf.score || 0;
    lv4conf.answered = lv4conf.answered || false;

    if (lv4conf.index >= meta.totalAlerts) {
      showResult(4, lv4conf.score >= meta.passScore, meta.endRecap);
      return;
    }

    const alert = meta.alerts[lv4conf.index];
    const color = alert.confidence >= 80 ? '#22C55E' : alert.confidence >= 60 ? '#F59E0B' : '#E76F51';
    const use3D = window.ThreeRenderer && ThreeRenderer.isSupported();

    if (dom.canvasContainer) dom.canvasContainer.style.display = 'flex';
    if (dom.feedback) dom.feedback.style.display = 'block';
    if (dom.levelControls) dom.levelControls.style.display = 'flex';
    if (dom.quizProgress) dom.quizProgress.style.display = 'block';

    // Alert card (text overlay on the instruction line — NOT 3D)
    if (dom.levelInstruction) {
      dom.levelInstruction.innerHTML = `
        <div class="alert-card">
          <div class="alert-loc">📍 ${alert.location}</div>
          <div class="alert-conf" style="color:${color}">Piper is ${alert.confidence}% confident</div>
          <div class="alert-reason">${alert.reason}</div>
        </div>
        <div class="conf-legend">
          <span style="color:#22C55E">🟢 80%+ trust it</span>
          <span style="color:#F59E0B">🟡 60–80% check carefully</span>
          <span style="color:#E76F51">🔴 under 60% probably a false alarm</span>
        </div>
      `;
    }

    const three = dom.threeCanvas;
    const wave = dom.waveformCanvas;

    if (use3D) {
      ensure3DCanvas(lv4conf);
      if (wave) wave.style.display = 'none';
      if (three) {
        three.style.display = 'block';
        const w = Math.min(three.parentElement?.clientWidth || 600, 640);
        const h = 300;
        if (three.width !== w) { three.width = w; ThreeRenderer.setSize(w, h); }
        // Same 3D waveform tube as L3 — the TUBE COLOR signals Piper's confidence
        const points = generateAlertWave(alert, 500, 300);
        ThreeRenderer.drawWaveform(points, color, { width: w, height: h, tubeRadius: 0.16 });
      }
    } else {
      if (three) three.style.display = 'none';
      if (wave) {
        wave.style.display = 'block';
        wave.width = wave.parentElement?.clientWidth || 600;
        wave.height = 300;
        const points = generateAlertWave(alert, wave.width, wave.height);
        Renderer.drawSingleWaveform(wave, points, 'neutral');
        const ctx = wave.getContext('2d');
        ctx.fillStyle = color;
        ctx.font = 'bold 22px "Fredoka One", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`Confidence: ${alert.confidence}%`, 20, 40);
      }
    }

    // Progress + score
    if (dom.quizProgress) {
      dom.quizProgress.innerHTML = `
        <div class="quiz-progress-bar">
          <div class="quiz-progress-fill" style="width:${(lv4conf.index / meta.totalAlerts) * 100}%"></div>
        </div>
        <span>Alert ${lv4conf.index + 1} of ${meta.totalAlerts} · ✅ ${lv4conf.score} correct</span>
      `;
    }

    // Action buttons
    if (dom.levelControls) {
      dom.levelControls.innerHTML = `
        <button class="level-action-btn safe-btn" id="conf-trust">✅ Trust & Repair</button>
        <button class="level-action-btn" id="conf-inspect">🔍 Inspect</button>
        <button class="level-action-btn leak-btn" id="conf-dismiss">❌ Dismiss</button>
      `;
      const trustBtn = dom.levelControls.querySelector('#conf-trust');
      const inspectBtn = dom.levelControls.querySelector('#conf-inspect');
      const dismissBtn = dom.levelControls.querySelector('#conf-dismiss');

      const pick = (action) => {
        if (lv4conf.answered) return;
        lv4conf.answered = true;
        trustBtn.disabled = true; inspectBtn.disabled = true; dismissBtn.disabled = true;
        trustBtn.style.opacity = '0.5'; inspectBtn.style.opacity = '0.5'; dismissBtn.style.opacity = '0.5';

        const isLeak = alert.isLeak;
        let correct = false;
        let msg = '';

        if (action === 'TRUST') {
          correct = isLeak;
          msg = isLeak
            ? `✅ Trusted a real leak at ${alert.location} — water saved!`
            : `❌ False alarm! You sent a crew to a safe pipe at ${alert.location}.`;
        } else if (action === 'DISMISS') {
          correct = !isLeak;
          msg = !isLeak
            ? `✅ Good call — ${alert.location} was a false alarm!`
            : `❌ Missed a real leak at ${alert.location}! Water keeps draining.`;
        } else { // INSPECT — neutral teaching moment
          msg = isLeak
            ? `🔍 You inspected ${alert.location}: it IS a real leak (${alert.confidence}% was worth trusting!).`
            : `🔍 You inspected ${alert.location}: just a false alarm (${alert.confidence}% was too low to trust).`;
        }

        if (correct) {
          lv4conf.score++;
          setFeedback(msg, 'feedback-correct');
          AudioFX.correctTap();
        } else if (action === 'INSPECT') {
          setFeedback(msg, 'feedback-info');
          AudioFX.click();
        } else {
          setFeedback(msg, 'feedback-wrong');
          AudioFX.wrongTap();
        }

        setTimeout(() => {
          lv4conf.index++;
          lv4conf.answered = false;
          renderConfidenceLevel(meta);
        }, 1800);
      };

      trustBtn.onclick = () => pick('TRUST');
      inspectBtn.onclick = () => pick('INSPECT');
      dismissBtn.onclick = () => pick('DISMISS');
    }
  }

  // ─── Level 5: Pipe Vision Inspector (3D pipe network) ──

  /** Build pipe state objects from meta (flagged + normal). */
  function buildPipes(meta) {
    const pipes = [];
    meta.flaggedPipes.forEach(p => {
      // Piper's initial opinion → status color (NOT the hidden truth!)
      pipes.push({
        id: p.id, name: p.name, isLeak: p.isLeak, flagged: true,
        confidence: p.confidence, reason: p.reason, wave: p.wave,
        status: p.confidence >= 80 ? 'leak' : 'suspect',
        decided: false, decidedKind: null
      });
    });
    meta.normalPipes.forEach(p => {
      pipes.push({
        id: p.id, name: p.name, isLeak: p.isLeak, flagged: false,
        confidence: null, reason: null, wave: p.wave,
        status: 'normal', decided: false, decidedKind: null
      });
    });
    return pipes;
  }

  function renderPipeInspectionLevel(meta) {
    if (!lv5.initialized) {
      lv5.initialized = true;
      lv5.pipes = buildPipes(meta);
      lv5.crews = meta.maxCrews;
      lv5.timeRemaining = meta.timeLimit;
      lv5.selectedPipe = -1;
      lv5.inspecting = false;
      lv5.done = false;
      lv5.score = 0;
      lv5.lastTick = performance.now();
      lv5.decidedFlagged = 0;
    }
    if (lv5.done) return;

    if (lv5.selectedPipe !== -1) {
      if (lv5.inspecting) renderPipeInspectPhase(meta);
      else renderPipeSelectedPhase(meta);
    } else {
      renderPipeScenePhase(meta);
    }
  }

  /** Main view — 3D pipe network + orbit camera + timer. */
  function renderPipeScenePhase(meta) {
    if (dom.canvasContainer) dom.canvasContainer.style.display = 'flex';
    if (dom.feedback) dom.feedback.style.display = 'block';
    if (dom.quizProgress) dom.quizProgress.style.display = 'block';
    if (dom.levelControls) dom.levelControls.style.display = 'none';
    if (dom.waveformCanvas) dom.waveformCanvas.style.display = 'none';

    const three = dom.threeCanvas;
    const use3D = window.ThreeRenderer && ThreeRenderer.isSupported();

    if (use3D) {
      if (!lv5._threeReady) {
        lv5._threeReady = true;
        three.style.display = 'block';
        three.width = Math.min(three.parentElement?.clientWidth || 600, 640);
        three.height = 360;
        ThreeRenderer.init(three, three.width, three.height);
        ThreeRenderer.enablePipeMode((pipeId) => handlePipeSelect(pipeId, meta));
      }
      three.style.display = 'block';
      ThreeRenderer.drawPipeNetwork(lv5.pipes);
    } else {
      if (three) three.style.display = 'none';
      renderPipeFallback(meta);
    }

    lv5.lastTick = performance.now();
    setFeedback('Drag to orbit the pipes. Tap a pipe to inspect it!', '');
    updatePipeTimerDisplay(meta);
    startPipeTimer(meta);
  }

  /** Info card + decision buttons for the selected pipe. */
  function renderPipeSelectedPhase(meta) {
    const pipe = lv5.pipes.find(p => p.id === lv5.selectedPipe);
    if (!pipe) { lv5.selectedPipe = -1; renderPipeInspectionLevel(meta); return; }

    const use3D = window.ThreeRenderer && ThreeRenderer.isSupported();
    if (use3D) {
      ThreeRenderer.setPipeHighlight(pipe.id, true);
      const three = dom.threeCanvas;
      if (three) three.style.display = 'block';
    }

    if (dom.canvasContainer) dom.canvasContainer.style.display = 'flex';
    if (dom.quizProgress) dom.quizProgress.style.display = 'block';
    if (dom.feedback) dom.feedback.style.display = 'block';
    if (dom.levelControls) dom.levelControls.style.display = 'flex';

    if (dom.levelInstruction) {
      const confText = pipe.flagged ? `Piper is ${pipe.confidence}% confident` : 'Piper did not flag this pipe';
      const confColor = pipe.flagged ? (pipe.confidence >= 80 ? '#E76F51' : '#F59E0B') : '#35B5C8';
      dom.levelInstruction.innerHTML = `
        <div class="alert-card">
          <div class="alert-loc">🔧 ${pipe.name}</div>
          <div class="alert-conf" style="color:${confColor}">${confText}</div>
          ${pipe.reason ? `<div class="alert-reason">${pipe.reason}</div>` : '<div class="alert-reason">No alerts — looks like a normal pipe.</div>'}
        </div>
      `;
    }

    if (dom.levelControls) {
      const crewsLeft = lv5.crews;
      dom.levelControls.innerHTML = `
        <button class="level-action-btn" id="pipe-inspect">🔍 Inspect Sensor Data</button>
        <button class="level-action-btn safe-btn" id="pipe-safe">✅ Mark Safe</button>
        <button class="level-action-btn leak-btn" id="pipe-repair" ${crewsLeft <= 0 ? 'disabled' : ''}>🛠️ Repair (${crewsLeft} crew${crewsLeft === 1 ? '' : 's'} left)</button>
      `;
      dom.levelControls.querySelector('#pipe-inspect').onclick = () => {
        lv5.inspecting = true;
        renderPipeInspectionLevel(meta);
      };
      dom.levelControls.querySelector('#pipe-safe').onclick = () => decidePipe('SAFE', meta);
      dom.levelControls.querySelector('#pipe-repair').onclick = () => decidePipe('REPAIR', meta);
    }
  }

  /** Sensor-data view — shows the pipe's waveform so the kid can verify. */
  function renderPipeInspectPhase(meta) {
    const pipe = lv5.pipes.find(p => p.id === lv5.selectedPipe);
    if (!pipe) { lv5.selectedPipe = -1; lv5.inspecting = false; renderPipeInspectionLevel(meta); return; }

    const three = dom.threeCanvas;
    if (three) three.style.display = 'none';
    const wave = dom.waveformCanvas;
    if (wave) {
      wave.style.display = 'block';
      wave.width = wave.parentElement?.clientWidth || 600;
      wave.height = 300;
    }
    if (dom.feedback) dom.feedback.style.display = 'block';
    if (dom.levelControls) dom.levelControls.style.display = 'flex';
    if (dom.quizProgress) dom.quizProgress.style.display = 'block';

    const points = generatePipeWave(pipe, wave ? wave.width : 600, 300);
    Renderer.drawSingleWaveform(wave, points, 'neutral');
    setFeedback(`${pipe.name} sensor data — does this wave look like a leak to YOU?`, '');

    if (dom.levelControls) {
      const crewsLeft = lv5.crews;
      dom.levelControls.innerHTML = `
        <button class="level-action-btn" id="pipe-back">⬅ Back to Pipes</button>
        <button class="level-action-btn safe-btn" id="pipe-safe2">✅ Mark Safe</button>
        <button class="level-action-btn leak-btn" id="pipe-repair2" ${crewsLeft <= 0 ? 'disabled' : ''}>🛠️ Repair</button>
      `;
      dom.levelControls.querySelector('#pipe-back').onclick = () => {
        lv5.inspecting = false;
        renderPipeInspectionLevel(meta);
      };
      dom.levelControls.querySelector('#pipe-safe2').onclick = () => decidePipe('SAFE', meta);
      dom.levelControls.querySelector('#pipe-repair2').onclick = () => decidePipe('REPAIR', meta);
    }
  }

  function generatePipeWave(pipe, width, height) {
    const w = pipe.wave;
    if (!w) return Waveforms.smoothSine(width, height, 1.5, 0.2, 0.05);
    if (w.gen === 'smoothSine') return Waveforms.smoothSine(width, height, w.freq, w.amp, w.noise);
    if (w.gen === 'compositeWave') return Waveforms.compositeWave(width, height, w.freq, w.amp, w.noise, w.spikeAmp, w.spikePos);
    return Waveforms.smoothSine(width, height, 1.5, 0.2, 0.05);
  }

  /** Called by the 3D renderer when a pipe is tapped. */
  function handlePipeSelect(pipeId, meta) {
    if (lv5.done || lv5.selectedPipe !== -1) return;
    const pipe = lv5.pipes.find(p => p.id === pipeId);
    if (!pipe) return;
    if (pipe.decided) {
      setFeedback(`✅ ${pipe.name} already handled!`, 'feedback-info');
      return;
    }
    lv5.selectedPipe = pipeId;
    lv5.inspecting = false;
    renderPipeInspectionLevel(meta);
  }

  /** Handle a decision on the selected pipe. */
  function decidePipe(action, meta) {
    const pipe = lv5.pipes.find(p => p.id === lv5.selectedPipe);
    if (!pipe || pipe.decided) return;
    if (action === 'REPAIR' && lv5.crews <= 0) {
      setFeedback('❌ No repair crews left! You already used them all.', 'feedback-wrong');
      AudioFX.alarm();
      return;
    }
    pipe.decided = true;
    pipe.decidedKind = action;

    let correct = false;
    let msg = '';
    let points = 0;

    if (action === 'REPAIR') {
      lv5.crews--;
      if (pipe.isLeak) {
        correct = true;
        points = pipe.flagged ? 2 : 3; // hidden (green) leak = bonus for finding it
        msg = `✅ Repaired ${pipe.name} — water saved! (+${points})`;
        AudioFX.correctTap();
      } else {
        msg = `❌ ${pipe.name} was NOT leaking — you wasted a repair crew!`;
        AudioFX.wrongTap();
      }
    } else { // SAFE
      if (!pipe.isLeak) {
        correct = true;
        points = 1;
        msg = `✅ ${pipe.name} is safe — no false alarm! (+1)`;
        AudioFX.correctTap();
      } else {
        msg = `❌ ${pipe.name} WAS leaking — you missed it! Water keeps draining.`;
        AudioFX.wrongTap();
      }
    }

    lv5.score += points;

    // Update the 3D pipe visual
    if (window.ThreeRenderer && ThreeRenderer.isSupported()) {
      const status = action === 'REPAIR' ? (pipe.isLeak ? 'repaired' : 'wasted') : (pipe.isLeak ? 'missed' : 'cleared');
      ThreeRenderer.setPipeStatus(pipe.id, status);
      ThreeRenderer.setPipeHighlight(pipe.id, false);
    }

    setFeedback(msg, correct ? 'feedback-correct' : 'feedback-wrong');

    if (pipe.flagged) lv5.decidedFlagged++;

    setTimeout(() => {
      lv5.selectedPipe = -1;
      lv5.inspecting = false;
      if (lv5.decidedFlagged >= meta.flaggedPipes.length) {
        finishPipeInspection(meta);
      } else {
        renderPipeInspectionLevel(meta);
      }
    }, 1500);
  }

  /** 2D fallback when WebGL is unavailable — pipes listed as buttons. */
  function renderPipeFallback(meta) {
    if (dom.levelControls) {
      dom.levelControls.style.display = 'flex';
      dom.levelControls.innerHTML = `
        <div class="pipe-fallback">
          ${lv5.pipes.map(p => {
            const label = p.flagged ? `${p.name} (${p.confidence}%)` : p.name;
            return `<button class="level-action-btn" data-pipe="${p.id}" ${p.decided ? 'disabled' : ''}>${label}</button>`;
          }).join('')}
        </div>
      `;
      dom.levelControls.querySelectorAll('[data-pipe]').forEach(btn => {
        btn.onclick = () => {
          const id = parseInt(btn.dataset.pipe);
          const pipe = lv5.pipes.find(p => p.id === id);
          if (!pipe || pipe.decided) return;
          lv5.selectedPipe = id;
          lv5.inspecting = false;
          renderPipeInspectionLevel(meta);
        };
      });
    }
  }

  function updatePipeTimerDisplay(meta) {
    if (!dom.quizProgress) return;
    const secs = Math.ceil(lv5.timeRemaining);
    const mm = Math.floor(secs / 60);
    const ss = String(secs % 60).padStart(2, '0');
    dom.quizProgress.innerHTML = `
      <div class="city-timer">⏱ ${mm}:${ss}</div>
      <div class="city-score">💧 Water saved: ${lv5.score} pts</div>
      <div class="city-status">🛠️ Crews left: ${lv5.crews} · ${lv5.decidedFlagged}/${meta.flaggedPipes.length} flagged pipes decided</div>
    `;
  }

  function startPipeTimer(meta) {
    if (lv5.done || lv5._timerFrame) return;

    const loop = () => {
      if (lv5.done || state !== States.PLAYING || currentLevel !== 5) {
        lv5._timerFrame = null;
        return;
      }
      // Pause while a pipe is selected or the sensor data is open
      if (lv5.selectedPipe !== -1) {
        lv5._timerFrame = null;
        return;
      }
      const now = performance.now();
      const dt = (now - lv5.lastTick) / 1000;
      lv5.lastTick = now;
      lv5.timeRemaining = Math.max(0, lv5.timeRemaining - dt);
      if (lv5.timeRemaining <= 0) {
        lv5.timeRemaining = 0;
        finishPipeInspection(meta);
        return;
      }
      updatePipeTimerDisplay(meta);
      lv5._timerFrame = requestAnimationFrame(loop);
    };
    lv5._timerFrame = requestAnimationFrame(loop);
  }

  function finishPipeInspection(meta) {
    if (lv5.done) return;
    lv5.done = true;
    if (lv5._timerFrame) { cancelAnimationFrame(lv5._timerFrame); lv5._timerFrame = null; }

    const totalLeaks = lv5.pipes.filter(p => p.isLeak).length;
    const leaksRepaired = lv5.pipes.filter(p => p.isLeak && p.decided && p.decidedKind === 'REPAIR').length;
    const passed = lv5.score >= meta.passScore;

    const msg = `You saved ${lv5.score} points and repaired ${leaksRepaired}/${totalLeaks} leaks! ` +
      (passed ? 'Great AI supervision — the pipes are safer!' : 'The pipes are still leaking — try again!');
    showResult(5, passed, msg);
  }

  // ─── Level Reset ─────────────────────────────

  function resetLevelState(level) {
    switch (level) {
      case 1:
        if (lv1._animFrame) cancelAnimationFrame(lv1._animFrame);
        lv1 = { index: 0, score: 0, answered: false, generators: null };
        break;
      case 2:
        lv4 = { subRound: 0, sliderValue: 10 };
        break;
      case 3:
        if (lv3._animFrame) cancelAnimationFrame(lv3._animFrame);
        lv3 = { index: 0, score: 0, answered: false, _threeReady: false };
        break;
      case 4:
        lv4conf = { index: 0, score: 0, answered: false, _threeReady: false };
        break;
      case 5:
        if (lv5._timerFrame) cancelAnimationFrame(lv5._timerFrame);
        lv5 = { initialized: false };
        break;
      case 6:
        lv6 = { currentQuestion: 0, answers: [], score: 0 };
        break;
    }
  }

  function cleanupLevel() {
    // Cancel all animation frames (L1 live wave, L5 pipe timer)
    [lv1 && lv1._animFrame, lv3 && lv3._animFrame, lv5 && lv5._timerFrame].forEach(id => {
      if (id) cancelAnimationFrame(id);
    });
    // Tear down the 3D renderer if it was running (L3/L4/L5)
    if (window.ThreeRenderer) {
      try { ThreeRenderer.dispose(); } catch (e) { /* safe */ }
    }
  }

  // ─── Public API ──────────────────────────────

  function getCurrentLevel() {
    return currentLevel;
  }

  function getState() {
    return state;
  }

  return {
    init,
    getCurrentLevel,
    getState,
    showMenu,
    switchToLevel,
    States
  };
})();

// ─── Boot ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  Game.init();
});
