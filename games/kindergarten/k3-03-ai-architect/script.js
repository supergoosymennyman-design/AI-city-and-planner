/**
 * script.js — Main game logic for K3-03 AI Architect
 *
 * State machine driving Part A (Teach Shapes & Colors),
 * Part B (Practice Describing House), and Part C (AI Builds House).
 */

(function() {
  'use strict';

  // ===================================================================
  // CONSTANTS
  // ===================================================================

  const SHAPES = ['circle', 'square', 'triangle', 'star', 'rectangle'];
  const COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple'];
  const PARTS = ['roof', 'door', 'windows'];

  const COLOR_DISPLAY = {
    red: { hex: '#FF6B6B', label: 'Red' },
    blue: { hex: '#4A90D9', label: 'Blue' },
    yellow: { hex: '#FFD93D', label: 'Yellow' },
    green: { hex: '#6BCB77', label: 'Green' },
    orange: { hex: '#FF8C32', label: 'Orange' },
    purple: { hex: '#C084FC', label: 'Purple' }
  };

  const SHAPE_DISPLAY = {
    circle: { label: 'Circle' },
    square: { label: 'Square' },
    triangle: { label: 'Triangle' },
    star: { label: 'Star' },
    rectangle: { label: 'Rectangle' }
  };

  const PART_LABELS = {
    roof: 'ROOF',
    door: 'DOOR',
    windows: 'WINDOWS'
  };

  const PART_SHAPE_OPTIONS = {
    roof: ['triangle', 'star'],
    door: ['square', 'rectangle'],
    windows: ['circle', 'square']
  };

  const QUIZ_SHAPES_NEEDED = 3;
  const QUIZ_COLORS_NEEDED = 3;
  const MAX_QUIZ_WRONG = 3;

  function getDefaultShape(part) {
    return PART_SHAPE_OPTIONS[part][0] || 'square';
  }

  // ===================================================================
  // STATE
  // ===================================================================

  const state = {
    currentScreen: 'loading',
    phase: 'init',
    isTransitioning: false,

    // Part A
    shapeQuizCount: 0,
    colorQuizCount: 0,
    currentQuizItem: null,     // { type: 'shape'|'color', value: 'circle'|'red', ... }
    quizMode: null,            // 'shape' or 'color'
    quizFeedback: null,        // { correct: bool, value: string }
    quizWrongAttempts: 0,      // Wrong attempts on current quiz item
    shapeQuizDone: false,
    colorQuizDone: false,
    shapesExplored: new Set(),
    colorsExplored: new Set(),

    // Part B — Open generation
    assignments: {
      roof: null,
      door: null,
      windows: null
    },
    listenPart: 'roof',         // current active part tab in listen screen

    // Part C
    buildingProgress: 0,

    // Conversation
    convManager: null,
    lastBotlyCallback: null,

    // Misc
    idleTimer: null,
    micGranted: false,
  };

  // ===================================================================
  // DOM REFS
  // ===================================================================

  const $ = id => document.getElementById(id);
  const main = $('main-content');
  const speechText = $('botly-speech');
  const stateDot = $('state-dot');
  const stateLabel = $('state-label');
  const headerTitle = $('header-title');
  const headerProgress = $('header-progress');

  // ===================================================================
  // TTS
  // ===================================================================

  function speakText(text, onEnd) {
    if (!text) { if (onEnd) onEnd(); return; }
    if (!window.speechSynthesis) { if (onEnd) onEnd(); return; }
    const settings = typeof GameSettings !== 'undefined' ? GameSettings.getAll() : {};
    if (settings.mute && !onEnd) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = settings.speechRate || 0.7;
    utterance.pitch = 1.1;
    utterance.volume = settings.mute ? 0 : ((settings.volume || 90) / 100);

    if (settings.voiceURI) {
      const voices = window.speechSynthesis.getVoices();
      const v = voices.find(x => x.voiceURI === settings.voiceURI);
      if (v) utterance.voice = v;
    }

    if (onEnd) utterance.onend = onEnd;
    utterance.onerror = () => { if (onEnd) onEnd(); };

    updateAIState('speaking', 'Speaking');
    utterance.onstart = () => updateAIState('speaking', 'Speaking');

    window.speechSynthesis.speak(utterance);
  }

  // ===================================================================
  // AI STATE & SPEECH
  // ===================================================================

  function updateAIState(dotClass, label) {
    if (stateDot) {
      stateDot.className = 'state-dot ' + dotClass;
    }
    if (stateLabel) {
      stateLabel.textContent = label || '';
    }
    // Update Botly SVG animation class
    const svg = document.querySelector('.botly-svg');
    if (svg) {
      svg.setAttribute('class', 'botly-svg ' + dotClass);
    }
  }

  function setSpeechText(text) {
    if (speechText) speechText.textContent = text || '';
    if (typeof BotlyCharacter !== 'undefined') {
      BotlyCharacter.setText(text || '');
    }
  }

  /**
   * Botly speaks AND shows text. Always visual + audio.
   */
  function botlySay(text, onEnd, isBotlyTriggered) {
    if (!text) { if (onEnd) onEnd(); return; }
    setSpeechText(text);
    speakText(text, () => {
      updateAIState('listening', 'Listening');
      if (onEnd) onEnd();
    });

    // Transcript
    if (typeof GameTranscript !== 'undefined') {
      GameTranscript.add('ai', text);
    }
  }

  /**
   * Quick speech for Botly (no transcript tracking).
   */
  function botlySayQuick(text, onEnd) {
    if (!text) { if (onEnd) onEnd(); return; }
    setSpeechText(text);
    speakText(text, onEnd);

    // Also add to transcript (consistent with botlySay)
    if (typeof GameTranscript !== 'undefined') {
      GameTranscript.add('ai', text);
    }
  }

  // ===================================================================
  // SIMPLE SOUND EFFECTS
  // ===================================================================

  function playChime(freq, duration) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq || 660;
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (duration || 0.3));
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + (duration || 0.3));
      setTimeout(() => ctx.close().catch(() => {}), 500);
    } catch(e) {}
  }

  function playSuccessChime() {
    playChime(523, 0.15);
    setTimeout(() => playChime(659, 0.15), 120);
    setTimeout(() => playChime(784, 0.25), 240);
  }

  function playCelebration() {
    [523, 587, 659, 698, 784, 880, 988, 1047].forEach((f, i) => {
      setTimeout(() => playChime(f, 0.2), i * 80);
    });
  }

  // ===================================================================
  // CONFETTI
  // ===================================================================

  function launchConfetti() {
    const container = document.getElementById('confetti-container');
    if (!container) return;
    container.innerHTML = '';

    const colors = ['#FF6B6B', '#4A90D9', '#FFD93D', '#6BCB77', '#FF8C32', '#C084FC', '#FF8A80', '#5BA4A4'];
    const pieces = 50;

    for (let i = 0; i < pieces; i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      const color = colors[Math.floor(Math.random() * colors.length)];
      const left = Math.random() * 100;
      const delay = Math.random() * 2;
      const size = 8 + Math.random() * 12;
      const rot = Math.random() * 360;
      piece.style.cssText = `
        left: ${left}%;
        background: ${color};
        width: ${size}px;
        height: ${size}px;
        border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
        animation-delay: ${delay}s;
        animation-duration: ${2 + Math.random() * 1.5}s;
        transform: rotate(${rot}deg);
      `;
      container.appendChild(piece);
    }

    setTimeout(() => { container.innerHTML = ''; }, 5000);
  }

  // ===================================================================
  // STATE MACHINE
  // ===================================================================

  let currentScreen = 'loading';

  function transitionTo(screen) {
    if (state.isTransitioning && screen !== 'loading') return;
    state.isTransitioning = true;
    clearIdleTimer();
    currentScreen = screen;
    state.currentScreen = screen;
    // Close modals
    if (typeof GameSettings !== 'undefined') GameSettings.hide();
    if (typeof GameTranscript !== 'undefined') GameTranscript.hide();
    try {
      render();
    } catch (e) {
      console.error('Render error during transition to', screen, e);
      // Show error on screen
      if (main) {
        main.innerHTML = '<div class="screen text-center"><p class="text-large">Something went wrong</p><p class="text-small mt-sm" style="color:var(--text-medium);">' + escapeHtml(String(e)) + '</p><button class="btn btn-primary btn-lg mt-lg" onclick="location.reload()">Reload</button></div>';
      }
    } finally {
      state.isTransitioning = false;
    }
  }

  function render() {
    // Set header progress
    updateHeaderProgress();

    switch (currentScreen) {
      case 'loading': renderLoading(); break;
      case 'intro': renderIntro(); break;

      // Part A
      case 'a_intro': renderA_Intro(); break;
      case 'a_shapes': renderA_Shapes(); break;
      case 'a_colors': renderA_Colors(); break;
      case 'a_quiz': renderA_Quiz(); break;
      case 'a_quiz_feedback': renderA_QuizFeedback(); break;
      case 'a_done': renderA_Done(); break;

      // Part B — Open generation
      case 'b_intro': renderB_Intro(); break;
      case 'b_listen': renderB_Listen(); break;
      case 'b_generate': renderB_Generate(); break;

      // Part C — House reveal
      case 'c_house': renderC_House(); break;
      case 'c_house': renderC_House(); break;
      case 'c_celebrate': renderC_Celebrate(); break;
      case 'c_replay': renderC_Replay(); break;

      default: renderIntro(); break;
    }
  }

  function updateHeaderProgress() {
    if (!headerTitle || !headerProgress) return;
    const phase = currentScreen.charAt(0).toUpperCase();
    let label = '';
    if (currentScreen.startsWith('a_')) label = 'Part A: Teach';
    else if (currentScreen.startsWith('b_')) label = 'Part B: Design';
    else if (currentScreen.startsWith('c_')) label = 'Part C: Build!';
    else label = '';

    headerTitle.textContent = label || 'AI Architect';
    if (currentScreen === 'loading' || currentScreen === 'intro') {
      headerTitle.textContent = 'AI Architect';
      headerProgress.textContent = '';
    }
  }

  // ===================================================================
  // LOADING SCREEN
  // ===================================================================

  function renderLoading() {
    // Brief flash screen, immediately transitions to intro
    main.innerHTML = '<div class="screen text-center"><p class="text-small">Loading...</p></div>';
    // Use requestAnimationFrame + setTimeout to break out of any isTransitioning lock
    requestAnimationFrame(function() {
      setTimeout(function() { transitionTo('intro'); }, 50);
    });
  }

  // Global failsafe: if loading hasn't transitioned within 3s, force it
  setTimeout(function loadingFailsafe() {
    if (currentScreen === 'loading' || currentScreen === undefined) {
      console.warn('Loading failsafe triggered');
      state.isTransitioning = false;
      transitionTo('intro');
    }
  }, 3000);

  // ===================================================================
  // INTRO — TEACHER PRESSES START
  // ===================================================================

  function renderIntro() {
    main.innerHTML = `
      <div class="screen text-center">
        <div style="max-width:400px;">
          <div style="width:100px;height:100px;margin:0 auto var(--space-md);">
            <svg viewBox="0 0 100 100" width="100%" height="100%">
              <circle cx="50" cy="50" r="42" fill="#B8F2E6" stroke="#2D6A6A" stroke-width="2.5"/>
              <circle cx="38" cy="44" r="8" fill="white" stroke="#2D6A6A" stroke-width="1.5"/>
              <circle cx="62" cy="44" r="8" fill="white" stroke="#2D6A6A" stroke-width="1.5"/>
              <circle cx="39" cy="44" r="4" fill="#2D6A6A"/>
              <circle cx="63" cy="44" r="4" fill="#2D6A6A"/>
              <path d="M40,68 Q50,74 60,68" fill="none" stroke="#2D6A6A" stroke-width="2.5" stroke-linecap="round"/>
              <line x1="50" y1="6" x2="50" y2="14" stroke="#2D6A6A" stroke-width="2" stroke-linecap="round"/>
              <circle cx="50" cy="6" r="3.5" fill="#5BA4A4"/>
            </svg>
          </div>
          <p class="text-large" style="line-height:1.5;">
            Hi! I'm <strong style="color:var(--primary-teal);">Botly</strong>!
            I want to learn how to build a house.
          </p>
          <p class="text-small mt-md">
            Can you teach me about shapes and colors?
          </p>
          <button class="btn btn-primary btn-xl mt-lg" id="btn-start" aria-label="Start the game">
            Let's Start!
          </button>
        </div>
      </div>
    `;

    setSpeechText('Hi! I\'m Botly! Can you teach me shapes and colors so I can build a house?');
    updateAIState('listening', 'Listening');

    // No direct click handler — using global delegation below
  }

  // ===================================================================
  // GLOBAL BUTTON DELEGATION
  // ===================================================================
  // ALL button clicks are handled via event delegation on #main-content.
  // This avoids timing issues with dynamically created elements.

  function handleButtonClick(target) {
    if (!target) return;
    var id = target.id || '';

    switch (id) {
      // --- Intro → Part A ---
      case 'btn-start':
        playChime(440, 0.15);
        transitionTo('a_intro');
        return true;

      // --- Part A: Intro → Shapes ---
      case 'btn-a-start':
        playChime(523, 0.1);
        state.shapesExplored = new Set();
        state.colorsExplored = new Set();
        transitionTo('a_shapes');
        return true;

      // --- Part A: Shapes Done → Colors ---
      case 'btn-shapes-done':
        playChime(523, 0.15);
        transitionTo('a_colors');
        return true;

      // --- Part A: Colors Done → Quiz ---
      case 'btn-colors-done':
        playChime(523, 0.15);
        state.shapeQuizCount = 0;
        state.colorQuizCount = 0;
        state.quizMode = 'shape';
        generateQuizItem();
        transitionTo('a_quiz');
        return true;

      // --- Part A: Quiz Feedback → Next ---
      case 'btn-quiz-next':
        state.quizFeedback = null;
        state.quizWrongAttempts = 0;
        if (state.shapeQuizDone && state.colorQuizDone) {
          transitionTo('a_done');
        } else {
          if (state.shapeQuizDone && state.quizMode === 'shape') {
            state.quizMode = 'color';
          }
          generateQuizItem();
          transitionTo('a_quiz');
        }
        return true;

      // --- Part A: Done → Part B ---
      case 'btn-a-done':
        playSuccessChime();
        transitionTo('b_intro');
        return true;

      // --- Part B: Intro → Listen ---
      case 'btn-b-start':
        state.assignments = { roof: null, door: null, windows: null };
        state.listenPart = 'roof';
        playChime(440, 0.15);
        transitionTo('b_listen');
        return true;

      // --- Part B: Listen → Generate ---
      case 'btn-build-house':
        // Verify at least one full assignment exists
        {
          var hasAny = PARTS.some(function(p) {
            return state.assignments[p] && state.assignments[p].shape && state.assignments[p].color;
          });
          if (!hasAny) return true; // disabled button, shouldn't fire
        }
        // Fill missing parts with defaults
        PARTS.forEach(function(p) {
          if (!state.assignments[p]) state.assignments[p] = {};
          if (!state.assignments[p].shape) state.assignments[p].shape = getDefaultShape(p);
          if (!state.assignments[p].color) state.assignments[p].color = 'blue';
        });
        playSuccessChime();
        transitionTo('b_generate');
        return true;

      // --- Part C: House → Celebrate ---
      case 'btn-celebrate':
        playCelebration();
        launchConfetti();
        transitionTo('c_celebrate');
        return true;

      // --- Part C: Celebrate → Rebuild ---
      case 'btn-rebuild':
        state.assignments = { roof: null, door: null, windows: null };
        state.listenPart = 'roof';
        transitionTo('b_intro');
        return true;

      // --- Part C: Celebrate → See House ---
      case 'btn-see-house':
        transitionTo('c_house');
        return true;

      // --- Part C: Replay → Full Restart ---
      case 'btn-restart':
        resetGame();
        return true;

      default:
        return false;
    }
  }

  // Attach one delegation listener on boot
  function setupGlobalDelegation() {
    main.addEventListener('click', function(e) {
      var btn = e.target.closest('button');
      if (btn) {
        if (handleButtonClick(btn)) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    });
  }

  // ===================================================================
  // PART A — TEACH SHAPES & COLORS
  // ===================================================================

  function renderA_Intro() {
    main.innerHTML = `
      <div class="screen text-center">
        <p class="text-large" style="max-width:400px;">
          I don't know about shapes and colors yet!
        </p>
        <p class="text-small mt-sm">
          Let's learn them together!
        </p>
        <button class="btn btn-accent btn-lg mt-lg" id="btn-a-start" aria-label="Start teaching shapes">
          Let's Learn!
        </button>
      </div>
    `;

    botlySay('I don\'t know about shapes and colors yet! Can you teach me?', () => {
      updateAIState('listening', 'Listening');
    });
  }

  // ---- Shapes Showcase ----

  function renderA_Shapes() {
    const allExplored = SHAPES.every(s => state.shapesExplored.has(s));

    main.innerHTML = `
      <div class="screen text-center">
        <p class="text-large mb-sm">Let's learn <strong style="color:var(--primary-teal);">SHAPES</strong>!</p>
        <p class="text-small mb-md">Tap each shape to hear its name.</p>
        <div class="selection-grid">
          ${SHAPES.map(s => `
            <button class="shape-btn ${state.shapesExplored.has(s) ? 'highlighted' : ''}"
              data-shape="${s}" aria-label="${SHAPE_DISPLAY[s].label}">
              ${HouseRenderer.renderShapeIcon(s)}
            </button>
          `).join('')}
        </div>
        <button class="btn btn-accent btn-lg mt-md ${allExplored ? '' : 'hidden'}"
          id="btn-shapes-done" aria-label="Done learning shapes">
          Done! Let's learn colors!
        </button>
      </div>
    `;

    if (!allExplored) {
      botlySay('Tap a shape to hear its name!', null);
    }

    // Idle timer: encourage if child doesn't interact after 15s
    startIdleTimer(() => {
      const remaining = SHAPES.filter(s => !state.shapesExplored.has(s));
      if (remaining.length > 0) {
        botlySayQuick('Try tapping a shape to hear its name!');
        // Give one more nudge after another 15s
        startIdleTimer(() => {
          botlySayQuick('You can tap any shape to learn it!');
        });
      }
    });

    document.querySelectorAll('.shape-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        clearIdleTimer();
        const shape = btn.dataset.shape;
        state.shapesExplored.add(shape);
        btn.classList.add('highlighted');
        playChime(440, 0.1);
        botlySayQuick(`It's a ${SHAPE_DISPLAY[shape].label}!`);

        // Check if all explored
        const explored = SHAPES.every(s => state.shapesExplored.has(s));
        if (explored) {
          document.getElementById('btn-shapes-done').classList.remove('hidden');
          setTimeout(() => {
            botlySay('You know all the shapes! Let\'s learn colors!', null);
          }, 800);
        }
      });
    });
  }

  // ---- Colors Showcase ----

  function renderA_Colors() {
    const allExplored = COLORS.every(c => state.colorsExplored.has(c));

    main.innerHTML = `
      <div class="screen text-center">
        <p class="text-large mb-sm">Now let's learn <strong style="color:var(--accent-coral);">COLORS</strong>!</p>
        <p class="text-small mb-md">Tap each color to hear its name.</p>
        <div class="selection-grid">
          ${COLORS.map(c => `
            <button class="color-btn ${state.colorsExplored.has(c) ? 'highlighted' : ''}"
              data-color="${c}" aria-label="${COLOR_DISPLAY[c].label}"
              style="background:${COLOR_DISPLAY[c].hex};">
              <span class="color-label">${COLOR_DISPLAY[c].label}</span>
            </button>
          `).join('')}
        </div>
        <button class="btn btn-accent btn-lg mt-md ${allExplored ? '' : 'hidden'}"
          id="btn-colors-done" aria-label="Done learning colors">
          I know all colors!
        </button>
      </div>
    `;

    if (!allExplored) {
      botlySay('Tap a color to learn its name!', null);
    }

    // Idle timer
    startIdleTimer(() => {
      const remaining = COLORS.filter(c => !state.colorsExplored.has(c));
      if (remaining.length > 0) {
        botlySayQuick('Try tapping a color to learn its name!');
        startIdleTimer(() => {
          botlySayQuick('You can tap any color!');
        });
      }
    });

    document.querySelectorAll('.color-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        clearIdleTimer();
        const color = btn.dataset.color;
        state.colorsExplored.add(color);
        btn.classList.add('highlighted');
        playChime(440, 0.1);
        botlySayQuick(`This is ${COLOR_DISPLAY[color].label}!`);

        const explored = COLORS.every(c => state.colorsExplored.has(c));
        if (explored) {
          document.getElementById('btn-colors-done').classList.remove('hidden');
          setTimeout(() => {
            botlySay('I know all the colors! Now let me quiz you!', null);
          }, 800);
        }
      });
    });
  }

  // ---- Quiz ----

  function generateQuizItem() {
    if (state.quizMode === 'shape') {
      // Pick a random shape not yet correctly identified
      const available = SHAPES;
      const value = available[Math.floor(Math.random() * available.length)];
      state.currentQuizItem = { type: 'shape', value };
    } else {
      const available = COLORS;
      const value = available[Math.floor(Math.random() * available.length)];
      state.currentQuizItem = { type: 'color', value };
    }
  }

  function renderA_Quiz() {
    const item = state.currentQuizItem;
    if (!item) return;

    const isShape = item.type === 'shape';
    const displayName = isShape ? SHAPE_DISPLAY[item.value].label : COLOR_DISPLAY[item.value].label;
    const colorHex = isShape ? '#3D3D3D' : COLOR_DISPLAY[item.value].hex;

    main.innerHTML = `
      <div class="screen text-center">
        <p class="text-large mb-sm">What ${isShape ? 'shape' : 'color'} is this?</p>

        <!-- Show the quiz item -->
        <div style="margin:var(--space-md) 0;${isShape ? '' : `background:${colorHex};border-radius:50%;width:80px;height:80px;display:flex;align-items:center;justify-content:center;border:3px solid var(--border-light);`}">
          ${isShape
            ? `<div style="width:80px;height:80px;">${HouseRenderer.renderShapeIcon(item.value, '#5BA4A4')}</div>`
            : ''
          }
          ${!isShape ? `<span class="color-label" style="position:static;font-size:14px;color:var(--text-dark);font-weight:700;text-shadow:0 0 4px white;">${displayName}</span>` : ''}
        </div>

        <!-- Tap options as fallback -->
        <p class="text-small mb-sm">Say it or tap it!</p>
        <div class="selection-grid">
          ${(isShape ? SHAPES : COLORS).map(val => {
            const label = isShape ? SHAPE_DISPLAY[val].label : COLOR_DISPLAY[val].label;
            return isShape
              ? `<button class="shape-btn" data-value="${val}" aria-label="${label}">
                   ${HouseRenderer.renderShapeIcon(val)}
                 </button>`
              : `<button class="color-btn" data-value="${val}" aria-label="${label}"
                   style="background:${COLOR_DISPLAY[val].hex};width:70px;height:70px;">
                   <span class="color-label">${label}</span>
                 </button>`;
          }).join('')}
        </div>

        <div id="quiz-status" class="text-small mt-sm" style="color:var(--text-medium);">
          ${isShape
            ? `Shapes: ${state.shapeQuizCount}/${QUIZ_SHAPES_NEEDED}`
            : `Colors: ${state.colorQuizCount}/${QUIZ_COLORS_NEEDED}`
          }
        </div>
      </div>
    `;

    botlySay(`What ${isShape ? 'shape' : 'color'} is this?`, () => {
      updateAIState('listening', 'Listening');
    });

    // Set quiz mode for intent processing
    state.quizMode = isShape ? 'shape' : 'color';

    // Idle timer
    startIdleTimer(() => {
      botlySayQuick(`Can you tell me what ${isShape ? 'shape' : 'color'} this is? Try tapping one!`);
      startIdleTimer(() => {
        botlySayQuick(`It's okay! Just tap the ${isShape ? 'shape' : 'color'} you think it is!`);
      });
    });

    // Tap handlers
    document.querySelectorAll('[data-value]').forEach(btn => {
      btn.addEventListener('click', () => {
        const value = btn.dataset.value;
        const correct = value === item.value;
        handleQuizAnswer(correct, value);
      });
    });
  }

  function handleQuizAnswer(correct, value) {
    const item = state.currentQuizItem;
    if (!item) return;

    if (correct) {
      state.quizWrongAttempts = 0;
      playSuccessChime();
      if (item.type === 'shape') {
        state.shapeQuizCount++;
        if (state.shapeQuizCount >= QUIZ_SHAPES_NEEDED) {
          state.shapeQuizDone = true;
        }
      } else {
        state.colorQuizCount++;
        if (state.colorQuizCount >= QUIZ_COLORS_NEEDED) {
          state.colorQuizDone = true;
        }
      }
      state.quizFeedback = { correct: true, value };
    } else {
      state.quizWrongAttempts++;
      playChime(200, 0.2);

      // Auto-reveal after MAX_QUIZ_WRONG wrong attempts
      if (state.quizWrongAttempts >= MAX_QUIZ_WRONG) {
        state.quizWrongAttempts = 0;
        if (item.type === 'shape') {
          state.shapeQuizCount++;
          if (state.shapeQuizCount >= QUIZ_SHAPES_NEEDED) {
            state.shapeQuizDone = true;
          }
        } else {
          state.colorQuizCount++;
          if (state.colorQuizCount >= QUIZ_COLORS_NEEDED) {
            state.colorQuizDone = true;
          }
        }
        state.quizFeedback = { correct: true, value: item.value, autoRevealed: true };
      } else {
        state.quizFeedback = { correct: false, value };
      }
    }

    transitionTo('a_quiz_feedback');
  }

  function renderA_QuizFeedback() {
    const item = state.currentQuizItem;
    const fb = state.quizFeedback || { correct: false, value: '' };
    if (!item) return;

    const correct = fb.correct;
    const displayName = item.type === 'shape'
      ? SHAPE_DISPLAY[item.value].label
      : COLOR_DISPLAY[item.value].label;

    main.innerHTML = `
      <div class="screen text-center">
        <div style="font-size:64px;margin-bottom:var(--space-md);">
          ${correct ? '⭐' : '🤔'}
        </div>
        <p class="text-large">
          ${correct
            ? `Yes! That's ${displayName}!`
            : `Hmm, this is ${displayName}!`
          }
        </p>
        <p class="text-small mt-sm" style="color:var(--text-medium);">
          ${correct
            ? (item.type === 'shape'
                ? `Shapes: ${state.shapeQuizCount}/${QUIZ_SHAPES_NEEDED}`
                : `Colors: ${state.colorQuizCount}/${QUIZ_COLORS_NEEDED}`)
            : 'Tap to continue!'
          }
        </p>
        <button class="btn btn-primary btn-lg mt-lg" id="btn-quiz-next" aria-label="Continue">
          ${correct ? 'Next →' : 'Try Again'}
        </button>
      </div>
    `;

    if (correct) {
      const msg = fb.autoRevealed
        ? `This is ${displayName}! Let's keep going!`
        : (item.type === 'shape'
          ? `Yes! That's a ${displayName}! You're so smart!`
          : `Yes! That's ${displayName}! Great job!`);
      botlySayQuick(msg);
    } else {
      botlySayQuick(`That's okay! This is ${displayName}. Can you try again?`);
    }
  }

  // ---- Part A Done ----

  function renderA_Done() {
    main.innerHTML = `
      <div class="screen text-center">
        <div style="font-size:64px;margin-bottom:var(--space-md);">🎉</div>
        <p class="text-large" style="max-width:400px;">
          I know shapes and colors now!
        </p>
        <p class="text-small mt-md">
          Let's build a house!
        </p>
        <button class="btn btn-primary btn-xl mt-lg" id="btn-a-done" aria-label="Start building house">
          Let's Build!
        </button>
      </div>
    `;

    botlySay('Now I know shapes and colors! Let\'s build something together!', () => {
      updateAIState('listening', 'Listening');
    });
  }

  // ===================================================================
  // PART B — HOUSE ASSIGNMENT
  // ===================================================================

  function renderB_Intro() {
    const outlineSVG = HouseRenderer.renderOutline(null, {});

    main.innerHTML = `
      <div class="screen text-center">
        <p class="text-large mb-sm">Let's design a house!</p>
        <div id="house-container" style="margin:var(--space-xs) auto;">${outlineSVG}</div>
        <button class="btn btn-accent btn-lg mt-md" id="btn-b-start" aria-label="Start describing your house">
          Let's Describe!
        </button>
      </div>
    `;

    botlySay('Tell me what you want in your house! You can say things like "red star roof" or "blue circle door"!', () => {
      updateAIState('listening', 'Listening');
    });
  }

  /**
   * renderB_Listen — Open-ended house description screen.
   * Child can tap parts, shapes, and colors freely in any order.
   * Voice can describe multiple parts at once.
   * Blueprint updates live. "Build it!" when ready.
   */
  function renderB_Listen() {
    // Ensure listenPart is set
    if (!state.listenPart) state.listenPart = 'roof';
    const currentPart = state.listenPart;
    const shapeOptions = PART_SHAPE_OPTIONS[currentPart];

    // Count how many parts are fully assigned
    const assignedCount = PARTS.filter(p => state.assignments[p] && state.assignments[p].shape && state.assignments[p].color).length;
    const allAssigned = assignedCount === 3;

    // Build preview SVG
    const preview = {};
    PARTS.forEach(p => {
      if (state.assignments[p]) preview[p] = state.assignments[p];
    });
    const houseSVG = HouseRenderer.renderOutline(null, preview);

    // Part tab buttons
    function partBtnHtml(p) {
      const a = state.assignments[p];
      const hasFull = a && a.shape && a.color;
      const hasPartial = a && (a.shape || a.color);
      const label = PART_LABELS[p];
      const status = hasFull
        ? `<span class="part-status done">✓</span>`
        : hasPartial
          ? `<span class="part-status partial">~</span>`
          : `<span class="part-status empty">?</span>`;
      const cls = p === currentPart ? 'part-tab active' : 'part-tab';
      return `<button class="${cls}" data-part="${p}" aria-label="${label}">${status} ${label}</button>`;
    }

    // Assignment summary line
    function partSummary(p) {
      const a = state.assignments[p];
      if (a && a.shape && a.color) {
        return `<span style="color:${HouseRenderer.getColorHex(a.color)};font-weight:700;">${COLOR_DISPLAY[a.color].label} ${SHAPE_DISPLAY[a.shape].label}</span>`;
      }
      if (a && a.shape) {
        return `${SHAPE_DISPLAY[a.shape].label} + ? color`;
      }
      if (a && a.color) {
        return `? shape + ${COLOR_DISPLAY[a.color].label}`;
      }
      return '<span class="text-medium">?</span>';
    }

    main.innerHTML = `
      <div class="screen b-listen-screen">
        <p class="text-large mb-sm">Describe your dream house!</p>

        <div id="house-container" style="width:220px;height:200px;margin:var(--space-xs) auto;">
          ${houseSVG}
        </div>

        <!-- Part tabs -->
        <div class="part-tabs" style="display:flex;gap:var(--space-sm);justify-content:center;margin:var(--space-sm) 0;">
          ${PARTS.map(partBtnHtml).join('')}
        </div>

        <!-- Shape grid for current part -->
        <div class="shape-color-palette">
          <p class="palette-label">Choose a shape</p>
          <div class="selection-grid" style="grid-template-columns:repeat(5,1fr);">
            ${shapeOptions.map(s => {
              const current = state.assignments[currentPart];
              const sel = current && current.shape === s ? 'selected' : '';
              return `<button class="shape-btn ${sel}" data-listen-shape="${s}" aria-label="${SHAPE_DISPLAY[s].label}">
                ${HouseRenderer.renderShapeIcon(s)}
              </button>`;
            }).join('')}
          </div>
        </div>

        <!-- Color grid -->
        <div class="shape-color-palette">
          <p class="palette-label">Choose a color</p>
          <div class="selection-grid" style="grid-template-columns:repeat(6,1fr);">
            ${COLORS.map(c => {
              const current = state.assignments[currentPart];
              const sel = current && current.color === c ? 'selected' : '';
              return `<button class="color-btn ${sel}" data-listen-color="${c}" aria-label="${COLOR_DISPLAY[c].label}"
                style="background:${COLOR_DISPLAY[c].hex};">
                <span class="color-label">${COLOR_DISPLAY[c].label}</span>
              </button>`;
            }).join('')}
          </div>
        </div>

        <!-- Assignment summary -->
        <div class="b-summary" style="margin:var(--space-sm) 0;">
          ${PARTS.map(p => `<div class="b-summary-row" style="display:flex;gap:var(--space-sm);justify-content:center;font-size:14px;">
            <span style="font-weight:600;min-width:70px;">${PART_LABELS[p]}:</span>
            <span>${partSummary(p)}</span>
          </div>`).join('')}
        </div>

        <!-- Build button -->
        <button class="btn btn-primary btn-xl mt-sm" id="btn-build-house" aria-label="Build my house"
          ${assignedCount === 0 ? 'disabled' : ''}>
          ${allAssigned ? 'Build My House!' : `Build (${assignedCount}/3)`}
        </button>
      </div>
    `;

    state.assignmentMode = true;

    // Botly prompt
    const doneParts = PARTS.filter(p => state.assignments[p] && state.assignments[p].shape && state.assignments[p].color);
    if (doneParts.length === 0) {
      botlySay('Tell me what you want! Say "red star roof" or tap below!', () => {
        updateAIState('listening', 'Listening');
      });
    } else if (doneParts.length < 3) {
      const remaining = PARTS.filter(p => !state.assignments[p] || !state.assignments[p].shape || !state.assignments[p].color);
      botlySay(`Great! Now what about the ${remaining.map(p => PART_LABELS[p]).join(' and ')}?`, () => {
        updateAIState('listening', 'Listening');
      });
    } else {
      botlySay('Perfect! I know everything I need. Press "Build My House!" to see it!', () => {
        updateAIState('listening', 'Listening');
      });
    }

    // Idle timer
    startIdleTimer(() => {
      const remaining = PARTS.filter(p => !state.assignments[p] || !state.assignments[p].shape || !state.assignments[p].color);
      if (remaining.length > 0) {
        botlySayQuick(`What about the ${remaining[0] === 'roof' ? 'roof' : remaining[0] === 'door' ? 'door' : 'windows'}?`);
        startIdleTimer(() => {
          botlySayQuick('You can say it or tap it!');
        });
      }
    });

    // --- Event handlers for taps ---

    // Part tab switching
    document.querySelectorAll('.part-tab[data-part]').forEach(btn => {
      btn.addEventListener('click', () => {
        clearIdleTimer();
        state.listenPart = btn.dataset.part;
        renderB_Listen();
      });
    });

    // Shape selection
    document.querySelectorAll('[data-listen-shape]').forEach(btn => {
      btn.addEventListener('click', () => {
        clearIdleTimer();
        const shape = btn.dataset.listenShape;
        const part = state.listenPart;
        if (!state.assignments[part]) state.assignments[part] = {};
        state.assignments[part].shape = shape;
        playChime(440, 0.12);
        renderB_Listen();
      });
    });

    // Color selection
    document.querySelectorAll('[data-listen-color]').forEach(btn => {
      btn.addEventListener('click', () => {
        clearIdleTimer();
        const color = btn.dataset.listenColor;
        const part = state.listenPart;
        if (!state.assignments[part]) state.assignments[part] = {};
        state.assignments[part].color = color;
        playChime(440, 0.12);
        renderB_Listen();
      });
    });
  }

  /**
   * renderB_Generate — AI builds the house with animation, then reveals it.
   */
  function renderB_Generate() {
    state.buildingProgress = 0;

    const buildSteps = [
      'Listening to your ideas...',
      'Choosing the shapes...',
      'Picking the colors...',
      'Putting it all together...',
      'Adding the final touches...'
    ];

    // Narrate what the AI heard
    const names = PARTS.map(p => {
      const a = state.assignments[p];
      if (a && a.shape && a.color) {
        return `${COLOR_DISPLAY[a.color].label} ${SHAPE_DISPLAY[a.shape].label} ${PART_LABELS[p]}`;
      }
      return `${PART_LABELS[p]}`;
    }).join(', ');

    main.innerHTML = `
      <div class="screen text-center">
        <p class="text-large mb-md">Botly is generating your house!</p>
        <p class="text-small mb-md" style="color:var(--text-medium);">
          Building: ${names}
        </p>
        <div class="building-animation">
          <span class="build-item">🔨</span>
          <span class="build-item">🪚</span>
          <span class="build-item">🎨</span>
          <span class="build-item">🖌️</span>
          <span class="build-item">🏗️</span>
        </div>
        <div class="building-progress">
          <div class="building-progress-bar" id="build-progress"></div>
        </div>
        <p class="building-text" id="build-text">Generating from your description...</p>
      </div>
    `;

    updateAIState('thinking', 'Generating');

    // Animate progress, then reveal house
    let step = 0;
    const bar = document.getElementById('build-progress');
    const text = document.getElementById('build-text');
    let progress = 0;

    const interval = setInterval(() => {
      progress += 2;
      if (bar) bar.style.width = Math.min(100, progress) + '%';

      if (step < buildSteps.length && progress >= (step + 1) * 20) {
        if (text) text.textContent = buildSteps[step];
        step++;
      }

      if (progress >= 100) {
        clearInterval(interval);
        setTimeout(() => {
          transitionTo('c_house');
        }, 400);
      }
    }, 60);
  }

  // ===================================================================
  // PART C — AI BUILDS THE HOUSE
  // ===================================================================

  function renderC_House() {
    const houseSVG = HouseRenderer.renderHouse(state.assignments, true);

    main.innerHTML = `
      <div class="screen text-center">
        <div style="width:320px;height:300px;margin:0 auto;">
          ${houseSVG}
        </div>
        <p class="text-small mt-sm" style="max-width:400px;">
          Look! I built it!
        </p>
        <button class="btn btn-accent btn-lg mt-md" id="btn-celebrate" aria-label="Celebrate!">
          Ta-da! 🎉
        </button>
      </div>
    `;

    // Narrate what was built
    const a = state.assignments;
    const narration = `Ta-da! I used a ${a.roof.color} ${a.roof.shape} for the roof, ` +
      `a ${a.door.color} ${a.door.shape} for the door, ` +
      `and ${a.windows.color} ${a.windows.shape} for the windows! ` +
      `You taught me everything!`;

    botlySay(narration, () => {
      updateAIState('listening', 'Happy');
    });
  }

  function renderC_Celebrate() {
    main.innerHTML = `
      <div class="screen text-center">
        <div style="font-size:80px;margin-bottom:var(--space-md);" class="star-burst">🌟</div>
        <p class="celebration-title">Amazing!</p>
        <p class="text-large mt-md">
          You taught Botly about shapes and colors!
        </p>
        <p class="text-small mt-sm" style="max-width:360px;">
          Botly learned from you and built a beautiful house!
        </p>
        <div style="display:flex;gap:var(--space-md);margin-top:var(--space-lg);flex-wrap:wrap;justify-content:center;">
          <button class="btn btn-primary btn-lg" id="btn-rebuild" aria-label="Build another house">
            🔄 Build Again!
          </button>
          <button class="btn btn-white btn-lg" id="btn-see-house" aria-label="See the house">
            🏠 See House
          </button>
        </div>
      </div>
    `;

    botlySay('Thank you for teaching me! You\'re a great teacher! Can we build another house?', () => {
      updateAIState('listening', 'Listening');
    });

    launchConfetti();
    playCelebration();
  }

  function renderC_Replay() {
    // End screen / start over
    main.innerHTML = `
      <div class="screen text-center">
        <p class="text-large">Thanks for playing AI Architect!</p>
        <button class="btn btn-primary btn-xl mt-lg" id="btn-restart" aria-label="Play again">
          Play Again!
        </button>
      </div>
    `;
    setSpeechText('Thanks for playing! Let\'s do it again sometime!');
    updateAIState('listening', 'Listening');
  }

  // ===================================================================
  // IDLE TIMER
  // ===================================================================

  const IDLE_TIMEOUT_MS = 15000; // 15 seconds

  function startIdleTimer(callback) {
    clearIdleTimer();
    state.idleTimer = setTimeout(() => {
      if (callback) callback();
    }, IDLE_TIMEOUT_MS);
  }

  function clearIdleTimer() {
    if (state.idleTimer) {
      clearTimeout(state.idleTimer);
      state.idleTimer = null;
    }
  }

  // ===================================================================
  // RESET
  // ===================================================================

  function resetGame() {
    // Don't destroy conversation manager — restart it so voice works on replay
    if (state.convManager) {
      state.convManager.cancelSpeech();
      state.convManager.stopListening();
      setTimeout(() => {
        if (state.convManager) state.convManager.startListening();
      }, 200);
    }
    state.shapeQuizCount = 0;
    state.colorQuizCount = 0;
    state.shapeQuizDone = false;
    state.colorQuizDone = false;
    state.currentQuizItem = null;
    state.quizMode = null;
    state.quizFeedback = null;
    state.quizWrongAttempts = 0;
    state.shapesExplored = new Set();
    state.colorsExplored = new Set();
    state.assignments = { roof: null, door: null, windows: null };
    state.listenPart = 'roof';
    state.buildingProgress = 0;
    state.isTransitioning = false;
    if (typeof GameTranscript !== 'undefined') GameTranscript.clear();
    transitionTo('loading');
  }

  // ===================================================================
  // VOICE TRANSCRIPTION HANDLER
  // ===================================================================

  function handleUtterance(text) {
    if (!text || text.trim().length === 0) return;

    // Add to transcript
    if (typeof GameTranscript !== 'undefined') {
      GameTranscript.add('child', text);
    }

    // Process with intents
    if (typeof GameIntents === 'undefined') return;

    // --- Handle quiz mode (Part A) ---
    if (state.currentQuizItem && currentScreen === 'a_quiz') {
      const item = state.currentQuizItem;
      const result = GameIntents.processQuizAnswer(text, { type: item.type, value: item.value });
      if (result.correct !== undefined) {
        handleQuizAnswer(result.correct, result.shape || result.color || item.value);
        if (result.correct) {
          botlySayQuick(result.shape ? `Yes! That's a ${result.shape}!` : `Yes! That's ${result.color}!`);
        } else {
          botlySayQuick(`Hmm, try again! It's a ${item.type === 'shape' ? SHAPE_DISPLAY[item.value].label : COLOR_DISPLAY[item.value].label}!`);
        }
        return;
      }
    }

    // --- Handle open-ended listening (Part B) ---
    if (currentScreen === 'b_listen') {
      // Check for "build it" trigger
      const lower = text.toLowerCase().trim();
      if (/build|done|ready|go|yes/i.test(lower) && !/no|not|nope|nah/i.test(lower)) {
        // Check if at least one part is assigned
        var hasAny = PARTS.some(function(p) { return state.assignments[p] && state.assignments[p].shape && state.assignments[p].color; });
        if (hasAny) {
          PARTS.forEach(function(p) {
            if (!state.assignments[p]) state.assignments[p] = {};
            if (!state.assignments[p].shape) state.assignments[p].shape = getDefaultShape(p);
            if (!state.assignments[p].color) state.assignments[p].color = 'blue';
          });
          botlySayQuick('Building your house now!');
          playSuccessChime();
          transitionTo('b_generate');
          return;
        }
      }

      // Extract all assignments from the utterance
      const allAssignments = GameIntents.extractAllAssignments(text);
      var anyAssigned = false;

      allAssignments.forEach(function(a) {
        if (a.part && (a.shape || a.color)) {
          if (!state.assignments[a.part]) state.assignments[a.part] = {};
          if (a.shape) state.assignments[a.part].shape = a.shape;
          if (a.color) state.assignments[a.part].color = a.color;
          anyAssigned = true;
        }
      });

      // Also try extracting single shape/color if multi-part parse didn't find anything
      // (handles simple utterances like "circle" or "red" when a part tab is selected)
      if (!anyAssigned) {
        const part = state.listenPart;
        const shape = GameIntents.extractShape(text);
        const color = GameIntents.extractColor(text);
        if (shape || color) {
          if (!state.assignments[part]) state.assignments[part] = {};
          if (shape) state.assignments[part].shape = shape;
          if (color) state.assignments[part].color = color;
          anyAssigned = true;
        }
      }

      if (anyAssigned) {
        clearIdleTimer();
        playChime(440, 0.1);

        // Narrate what was understood
        var doneParts = PARTS.filter(function(p) { return state.assignments[p] && state.assignments[p].shape && state.assignments[p].color; });
        var assignedStr = doneParts.map(function(p) {
          var a = state.assignments[p];
          return COLOR_DISPLAY[a.color].label + ' ' + SHAPE_DISPLAY[a.shape].label + ' ' + PART_LABELS[p];
        }).join(', ');

        if (doneParts.length === 3) {
          botlySayQuick('Perfect! I know everything! Press Build My House!');
        } else {
          botlySayQuick('Got it! ' + assignedStr + '!');
        }

        renderB_Listen(); // Re-render with new assignments
        return;
      }
    }
  }

  // ===================================================================
  // INIT — START THE GAME
  // ===================================================================

  function boot() {
    // Initialize settings & transcript UI
    if (typeof GameSettings !== 'undefined') {
      GameSettings.renderModal(document.getElementById('modal-container'));
    }
    if (typeof GameTranscript !== 'undefined') {
      GameTranscript.renderDrawer(document.getElementById('drawer-container'));
    }

    // Initialize Botly
    const botlyContainer = document.getElementById('botly-main');
    if (botlyContainer && typeof BotlyCharacter !== 'undefined') {
      BotlyCharacter.create(botlyContainer);
    }

    // Wire up header buttons
    document.getElementById('settings-toggle')?.addEventListener('click', () => {
      if (typeof GameSettings !== 'undefined') GameSettings.show();
    });
    document.getElementById('transcript-toggle')?.addEventListener('click', () => {
      if (typeof GameTranscript !== 'undefined') GameTranscript.show();
    });

    // Try to initialize conversation
    if (typeof ConversationManager !== 'undefined') {
      try {
        const conv = new ConversationManager({
          onStateChange: (s) => {
            updateAIState(s === 'listening' ? 'listening' : s === 'speaking' ? 'speaking' : s === 'thinking' ? 'thinking' : 'listening', '');
          },
          onTranscription: (t) => {},
          onUtteranceEnd: (text) => {
            handleUtterance(text);
          }
        });

        if (typeof GameSettings !== 'undefined') {
          conv.connectSettings(GameSettings);
        }

        conv.initialize().then(success => {
          state.micGranted = success;
          if (!success) {
            console.log('Mic not available — using tap-only mode');
          }
        }).catch(e => {
          console.warn('Conversation init failed:', e);
        });

        state.convManager = conv;
      } catch (e) {
        console.warn('Conversation init error:', e);
      }
    }

    // Set up global button delegation
    setupGlobalDelegation();

    // Start
    transitionTo('loading');
  }

  function safeBoot() {
    try {
      boot();
    } catch (e) {
      console.error('Boot error:', e);
      // Show error screen with retry button
      if (main) {
        main.innerHTML = '<div class="screen text-center"><p class="text-large">Oops! Something went wrong.</p><p class="text-small mt-sm" style="color:var(--text-medium);">' + escapeHtml(String(e.message || 'Unknown error')) + '</p><button class="btn btn-primary btn-lg mt-lg" onclick="location.reload()">Try Again</button></div>';
      }
    }
  }

  function escapeHtml(str) {
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', safeBoot);
  } else {
    safeBoot();
  }
})();
