/* ============================================================
   main.js — Application Entry Point & State Machine (v2)
   Subsurface Signal Decoder (P3, Age 8)
   v2: 5-level AI teaching arc with labeling, sensitivity,
   sensor fusion, and human-in-the-loop.
   Conversation passivity PRESERVED.
   ============================================================ */

(function () {
  'use strict';

  const App = {
    currentScreen: 'intro',
    actionLock: false,
    feedbackTimeout: null,
    debounceTimer: null,
    debugActive: false,
    _examState: null,
    dom: {},

    // ── Initialization ──
    init() {
      this.cacheDom();
      this.bindEvents();
      this.initAudioCtx();

      Settings.init();
      Transcript.init();

      Game.init(() => this.onGameStateChange());

      const chartCanvas = document.getElementById('device-canvas');
      ChartRenderer.init(chartCanvas);
      ChartRenderer.startAnimation();

      window.addEventListener('resize', () => ChartRenderer.resize());

      AudioController.loadVoices();
      if (window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = () => AudioController.loadVoices();
      }

      Conversation.init({
        onStateChange: (state) => { /* handled by Conversation internally */ },
        onResponse: (childText, response, intentId) => { /* handled */ }
      });

      this.showScreen('intro');
    },

    cacheDom() {
      const $ = (id) => document.getElementById(id);
      this.dom = {
        screenIntro: $('screen-intro'),
        screenGame: $('screen-game'),
        screenComplete: $('screen-complete'),

        btnStart: $('btn-start'),
        btnMenu: $('btn-menu'),
        btnCloseMenu: $('btn-close-menu'),
        btnMark: $('btn-mark'),
        btnRetrain: $('btn-retrain'),
        btnConfirm: $('btn-confirm'),
        btnUndo: $('btn-undo'),
        btnResetLevel: $('btn-reset-level'),
        btnApprove: $('btn-approve'),
        btnCorrect: $('btn-correct'),
        btnNextUncertain: $('btn-next-uncertain'),
        voteTable: $('vote-table'),
        lv5Actions: $('lv5-actions'),
        confidenceLegend: $('confidence-legend'),
        btnNextLevel: $('btn-next-level'),
        btnReplayLevel: $('btn-replay-level'),
        btnPlayAgain: $('btn-play-again'),

        // Lv1 training
        btnLabelSafe: $('btn-label-safe'),
        btnLabelHazard: $('btn-label-hazard'),
        btnConfirmLv1: $('btn-confirm-lv1'),
        btnSubmitAsIs: $('btn-submit-as-is'),
        trainingPanel: $('training-panel'),
        labelCount: $('label-count'),
        trainingPhaseText: $('training-phase-text'),

        // Lv2 sensitivity
        sensitivityPanel: $('sensitivity-panel'),
        btnSensUp: $('btn-sens-up'),
        btnSensDown: $('btn-sens-down'),
        sensitivityValue: $('sensitivity-value'),
        meterHazards: $('meter-hazards'),
        meterFalseAlarms: $('meter-false-alarms'),
        btnConfirmSens: $('btn-confirm-sens'),

        // Lv4 sensor toggle
        sensorToggle: $('sensor-toggle'),
        btnSensorSeismic: $('btn-sensor-seismic'),
        btnSensorGpr: $('btn-sensor-gpr'),
        btnSensorEm: $('btn-sensor-em'),

        // Token counter
        tokenCounter: $('token-counter'),
        tokensRemaining: $('tokens-remaining'),
        tokensSpent: $('tokens-spent'),

        levelMenu: $('level-menu'),
        levelGrid: $('level-grid'),

        levelLabel: $('level-label'),
        objectiveText: $('objective-text'),
        gridMap: $('grid-map'),
        gridStats: $('grid-stats'),
        feedbackArea: $('feedback-area'),
        feedbackText: $('feedback-text'),

        levelComplete: $('level-complete'),
        completeTitle: $('complete-title'),
        completeMessage: $('complete-message'),
        starRating: $('star-rating'),

        finalTotalHazards: $('final-total-hazards'),
        finalAccuracy: $('final-accuracy'),
        finalTokens: $('final-tokens'),

        indicatorDot: $('indicator-dot'),
        indicatorText: $('indicator-text'),

        deviceInfo: $('device-info'),
        mapLegend: $('map-legend'),
        actionRow: $('action-row'),

        btnShowExplanation: $('btn-show-explanation'),
        explanationOverlay: $('explanation-overlay'),
        explanationTitle: $('explanation-title'),
        explanationBody: $('explanation-body'),
        btnCloseExplanation: $('btn-close-explanation'),

        // Narrative story elements
        chapterCard: $('chapter-card'),
        chapterNumber: $('chapter-number'),
        chapterTitle: $('chapter-title'),
        chapterStory: $('chapter-story'),
        chapterAiLesson: $('chapter-ai-lesson'),
        chapterSkip: $('chapter-skip'),
        chenCard: $('chen-card'),
        chenMsg: $('chen-msg'),
        novaMood: $('nova-mood'),
        novaGrowth: $('nova-growth'),
        novaGrowthFill: $('nova-growth-fill'),
        novaGrowthLabel: $('nova-growth-label'),
      };
    },

    bindEvents() {
      this.dom.btnStart.addEventListener('click', () => this.startGame());

      // Level menu
      this.dom.btnMenu.addEventListener('click', () => this.showLevelMenu());
      this.dom.btnCloseMenu.addEventListener('click', () => this.hideLevelMenu());
      this.dom.levelGrid.addEventListener('click', (e) => {
        const btn = e.target.closest('.level-btn');
        if (btn) this.selectLevel(parseInt(btn.dataset.level, 10));
      });

      // Action buttons
      this.dom.btnMark.addEventListener('click', () => this.doConfirmHazard());
      this.dom.btnConfirm.addEventListener('click', () => this.doConfirmSurvey());
      if (this.dom.btnConfirmSens) this.dom.btnConfirmSens.addEventListener('click', () => this.doConfirmSensitivity());
      this.dom.btnResetLevel.addEventListener('click', () => this.resetLevel());

      // Lv1
      this.dom.btnLabelSafe.addEventListener('click', () => this.doLabel('safe'));
      this.dom.btnLabelHazard.addEventListener('click', () => this.doLabel('hazard'));
      this.dom.btnConfirmLv1.addEventListener('click', () => this.doConfirmLv1());
      this.dom.btnSubmitAsIs.addEventListener('click', () => this.doSubmitAsIs());

      // Lv2 slider
      const sensSlider = document.getElementById('sens-slider');
      if (sensSlider) {
        sensSlider.addEventListener('input', () => {
          const val = parseInt(sensSlider.value, 10);
          const lv = Game.getCurrentLevel();
          if (lv && lv.id === 4) {
            // L4: adjust sensor thresholds via sensitivity slider
            const baseThresh = lv.sensorConfig.thresholds;
            // Map 1-9 sensitivity to ±12 shift from default
            const shift = (val - 5) * 3;
            ['seismic', 'gpr', 'em'].forEach(sid => {
              const newT = Math.max(15, Math.min(85, (baseThresh[sid] || 42) - shift));
              Game.setSensorThreshold(sid, newT);
            });
          } else {
            Game.setSensitivity(val);
          }
          AudioController.playClick();
          this.refreshUI();
        });
      }
      // Legacy +/- button handlers (keep for compatibility)
      this.dom.btnSensUp && this.dom.btnSensUp.addEventListener('click', () => this.adjustSensitivity(1));
      this.dom.btnSensDown && this.dom.btnSensDown.addEventListener('click', () => this.adjustSensitivity(-1));

      // Lv4
      this.dom.btnSensorSeismic.addEventListener('click', () => this.setActiveSensor(0));
      this.dom.btnSensorGpr.addEventListener('click', () => this.setActiveSensor(1));
      this.dom.btnSensorEm.addEventListener('click', () => this.setActiveSensor(2));

      // Lv5 (HITL) — approve/correct for level 4
      this.dom.btnApprove.addEventListener('click', () => this.doApproveCell());
      this.dom.btnCorrect.addEventListener('click', () => this.doCorrectCell());
      this.dom.btnNextUncertain.addEventListener('click', () => this.nextUncertainCell());

      // Undo
      this.dom.btnUndo.addEventListener('click', () => this.doUndo());

      // Level nav
      this.dom.btnNextLevel.addEventListener('click', () => this.nextLevel());
      this.dom.btnReplayLevel.addEventListener('click', () => this.replayLevel());
      this.dom.btnPlayAgain.addEventListener('click', () => this.restartGame());

      // Explanation
      this.dom.btnShowExplanation.addEventListener('click', () => this.showExplanation());
      this.dom.btnCloseExplanation.addEventListener('click', () => this.hideExplanation());
      this.dom.explanationOverlay.addEventListener('click', (e) => {
        if (e.target === this.dom.explanationOverlay) this.hideExplanation();
      });

      // Narrative: chapter card dismiss
      this.dom.chapterSkip.addEventListener('click', () => this.hideChapterCard());

      // Debug: hidden — long-press game title for 2s to activate
      this.setupDebugTrigger();
    },

    initAudioCtx() {
      const initFn = () => {
        if (window.AudioContext) {
          try { new AudioContext(); } catch (e) { /* ignore */ }
        }
        document.removeEventListener('click', initFn);
        document.removeEventListener('touchend', initFn);
      };
      document.addEventListener('click', initFn);
      document.addEventListener('touchend', initFn);
    },

    // ── Story: Chapter Data ──
    CHAPTERS: {
      1: { number:'One',   title:'Supervised Learning',
        aiLesson:'🎓 Supervised Learning: AI learns patterns from labeled examples. Your labels become Nova\'s rules.',
        story:'Nova just came online. She has never seen a hazard before. I brought old survey logs — teach her what to look for.' },
      2: { number:'Two',   title:'Precision vs Recall',
        aiLesson:'🎓 Precision vs Recall: Catching more hazards means more false alarms. No perfect dial setting exists.',
        story:'Nova knows what hazards look like now, but she is wasting drill tokens on false alarms. The crew is waiting. Tune her just right.' },
      3: { number:'Three', title:'Sensor Fusion',
        aiLesson:'🎓 Sensor Fusion: Combining 3 sensors beats any single one. Cross-referencing finds what alone would miss.',
        story:'Nova got a sensor upgrade! Seismic, GPR, and EM. Each sees different things. Cross-check all three before you confirm — like asking 3 friends.' },
      4: { number:'Four',  title:'Human-in-the-Loop',
        aiLesson:'🎓 Human-in-the-Loop: AI handles easy cases. Humans review the hard ones. Together they\'re unstoppable.',
        story:'Nova surveys the whole site on her own today. I am standing by. She handles the easy ones; you check the tricky ones. Teamwork.' },
      5: { number:'Five',  title:'Autonomous AI',
        aiLesson:'🎓 Autonomous Deployment: The AI you trained scans the entire site by itself. Everything you taught it — live.',
        story:'The site is certified! Nova, you are a real surveyor now. Let us build something great.' },
      6: { number:'Six',   title:'AI Mastery Exam',
        aiLesson:'🎓 All AI Concepts: Prove you understand every AI concept you learned. 8 challenges, one final exam!',
        story:'Nova has one final challenge for you, Commander. Show me what you have learned about AI!' },
    },

    CHEN_MESSAGES: {
      1: '[Supervised Learning] The crew is unloading equipment. We need to know where it is safe to build.',
      2: '[Precision vs Recall] Drilling tokens cost money. Too many false alarms and the budget is gone.',
      3: '[Sensor Fusion] Each sensor has a job. Seismic feels vibrations, GPR sees pipes, EM finds metal.',
      4: '[Human-in-the-Loop] I will be right here. You and Nova make a good team.',
      5: '[Autonomous AI] The city plans are approved. We could not have done this without you.',
      6: '[AI Mastery] Prove your AI knowledge! 8 challenges cover everything you learned.',
    },

    NOVA_MOODS: {
      1: 'eager', 2: 'stressed',
      3: 'curious', 4: 'determined', 5: 'proud', 6: 'proud',
    },

    NOVA_MOOD_EMOJI: {
      eager: '😊', stressed: '😰', confused: '😵‍💫',
      curious: '🤔', determined: '😤', proud: '😎',
    },

    GROWTH_LEVELS: ['Novice','Trainee','Apprentice','Journeyman','Expert','Certified'],

    // ── Story: Show Chapter Card ──
    showChapterCard(level) {
      try {
        const ch = this.CHAPTERS[level];
        if (!ch) return;
        this.dom.chapterNumber.textContent = 'Chapter ' + ch.number;
        this.dom.chapterTitle.textContent = ch.title;
        this.dom.chapterStory.textContent = '"' + ch.story + '"';
        if (this.dom.chapterAiLesson && ch.aiLesson) {
          this.dom.chapterAiLesson.textContent = ch.aiLesson;
          this.dom.chapterAiLesson.style.display = 'block';
        } else if (this.dom.chapterAiLesson) {
          this.dom.chapterAiLesson.style.display = 'none';
        }
        this.dom.chapterCard.classList.remove('hidden');
        this.dom.chapterCard.querySelector('.chapter-card-inner').classList.remove('chapter-card-out');
        // Auto-dismiss after 5s
        if (this._chapterTimer) clearTimeout(this._chapterTimer);
        this._chapterTimer = setTimeout(() => this.hideChapterCard(), 5000);
        // Dr. Chen narrates the chapter story aloud
        setTimeout(() => this.chenSpeak(ch.story, { cancel: false }), 400);
      } catch (e) { /* Silent fail — story never blocks gameplay */ }
    },

    hideChapterCard() {
      try {
        if (this._chapterTimer) { clearTimeout(this._chapterTimer); this._chapterTimer = null; }
        const inner = this.dom.chapterCard.querySelector('.chapter-card-inner');
        if (inner) inner.classList.add('chapter-card-out');
        setTimeout(() => {
          this.dom.chapterCard.classList.add('hidden');
          if (inner) inner.classList.remove('chapter-card-out');
        }, 300);
      } catch (e) { /* Silent fail */ }
    },

    // ── Dr. Chen TTS: speaks his messages aloud ──
    chenSpeak(text, opts) {
      try {
        if (!text || Settings.isMuted()) return;
        if (window.speechSynthesis) {
          if (opts?.cancel !== false) window.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(text);
          u.rate = (Settings.getRate() || 0.9) * 0.9;
          u.pitch = 0.85;
          u.volume = Settings.getVolume() || 0.9;
          const vn = Settings.getVoiceURI();
          let voice = null;
          if (vn) voice = window.speechSynthesis.getVoices().find(v => v.name === vn);
          if (!voice) {
            const allVoices = window.speechSynthesis.getVoices();
            if (allVoices.length > 0) voice = allVoices[0];
          }
          if (voice) u.voice = voice;
          window.speechSynthesis.speak(u);
        }
      } catch (e) { /* TTS not available */ }
    },

    // ── Story: Update Dr. Chen Message ──
    updateChenMessage(level) {
      const msg = this.CHEN_MESSAGES[level];
      if (!msg) { this.dom.chenCard.classList.add('hidden'); return; }
      this.dom.chenMsg.textContent = msg;
      this.dom.chenCard.classList.remove('hidden');
      // Re-trigger animation
      this.dom.chenCard.style.animation = 'none';
      this.dom.chenCard.offsetHeight;
      this.dom.chenCard.style.animation = '';
      this.chenSpeak(msg.replace(/\[.*?\]/g,'').trim()); // speak the message (strip label)
    },

    // ── Story: Update Nova Mood ──
    updateNovaMood(level) {
      const moodKey = this.NOVA_MOODS[level];
      if (!moodKey) return;
      const emoji = this.NOVA_MOOD_EMOJI[moodKey] || '😊';
      this.dom.novaMood.textContent = emoji;
      this.dom.novaMood.className = 'nova-mood nova-mood-' + moodKey;
      this.dom.novaMood.style.display = 'inline';
    },

    // ── Story: Update Growth Meter ──
    updateGrowthMeter() {
      try {
        // Count completed levels (1-indexed: check localStorage or game state)
        let completed = 0;
        for (let i = 1; i <= 6; i++) {
          const lv = Game.getLevel(i);
          // Use level menu lock as a rough proxy — unlocked = completed once
          const key = 'ssd_level_' + i + '_done';
          if (localStorage.getItem(key)) completed++;
        }
        // Also include current level if it's complete
        if (Game.isComplete() && localStorage.getItem('ssd_level_' + Game.getCurrentLevelNum() + '_done')) {
          // Already counted
        }
        const pct = Math.min(100, (completed / 6) * 100);
        this.dom.novaGrowthFill.style.width = pct + '%';
        const labelIdx = Math.min(completed, this.GROWTH_LEVELS.length - 1);
        this.dom.novaGrowthLabel.textContent = 'Surveyor: ' + this.GROWTH_LEVELS[labelIdx];
        this.dom.novaGrowth.classList.remove('hidden');
      } catch (e) { /* Silent fail */ }
    },

    // ── Screen Management ──
    showScreen(screen) {
      this.currentScreen = screen;
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
      const el = document.getElementById('screen-' + screen);
      if (el) el.classList.add('active');
      if (screen === 'game') {
        ChartRenderer.resize();
        setTimeout(() => ChartRenderer.resize(), 100);
      }
    },

    // ── Game Flow ──
    startGame() {
      AudioController.playClick();
      // Speak a welcome greeting (user gesture from click makes TTS work)
      this.chenSpeak('Welcome to the survey site, Commander. Our AI drone is calibrated and ready. Let us scan the subsurface and find those hazards!');
      this.showScreen('game');
      Game.resetLevel(1);
      this.rebuildGrid();
      this.refreshUI();
      this.updateChenMessage(1);
      this.updateNovaMood(1);
      this.updateGrowthMeter();
      setTimeout(() => this.showChapterCard(1), 300);
    },

    restartGame() {
      AudioController.playClick();
      this.showScreen('intro');
    },

    // ── Level Menu ──
    showLevelMenu() {
      this.dom.levelGrid.querySelectorAll('.level-btn').forEach(btn => {
        btn.classList.toggle('level-current',
          parseInt(btn.dataset.level, 10) === Game.getCurrentLevelNum());
      });
      this.dom.levelMenu.classList.remove('hidden');
    },

    hideLevelMenu() { this.dom.levelMenu.classList.add('hidden'); },

    selectLevel(level) {
      AudioController.playClick();
      Game.setLevel(level);
      this.hideLevelMenu();
      this.dom.levelComplete.classList.add('hidden');
      this.clearFeedback();
      this.actionLock = false;
      this.rebuildGrid();

      this.refreshUI();
      setTimeout(() => {
        if (level === 5) {
          this.startLv6Demo();
        } else if (level === 1) {
          const samples = Game.getTrainingSamples ? Game.getTrainingSamples() : [];
          if (samples.length > 0) {
            Game.selectCell(samples[0].row, samples[0].col);
            this.refreshUI();
          }
        } else if (level === 3) {
          // Select a hazard cell so first impression shows sensor readings
          const lv = Game.getCurrentLevel();
          const hazards = lv ? lv.hazards || [] : [];
          if (hazards.length > 0) {
            Game.selectCell(hazards[0].row, hazards[0].col);
          } else {
            Game.selectCell(2, 2);
          }
          this.refreshUI();
        } else if (level === 4) {
          // Select first uncertain cell
          const uncertain = Game.getUncertainCells();
          if (uncertain.length > 0) {
            const [r, c] = uncertain[0].split(',').map(Number);
            Game.selectCell(r, c);
          }
          this.refreshUI();
        } else if (level === 6) {
          this.startExam();
        }
      }, 600);

      // Show chapter card after grid is ready (before explanation)
      this.updateChenMessage(level);
      this.updateNovaMood(level);
      this.updateGrowthMeter();
      setTimeout(() => this.showChapterCard(level), 100);

      // Show explanation for the new level
      setTimeout(() => this.showExplanation(), 300);
    },

    // ── Grid ──
    rebuildGrid() {
      const grid = this.dom.gridMap;
      if (!grid) return;
      grid.innerHTML = '';

      const size = Game.getGridSize();
      grid.style.gridTemplateColumns = `repeat(${size.cols}, 1fr)`;

      for (let r = 0; r < size.rows; r++) {
        for (let c = 0; c < size.cols; c++) {
          const cell = document.createElement('button');
          cell.className = 'grid-cell';
          cell.dataset.row = r;
          cell.dataset.col = c;
          cell.dataset.key = `${r},${c}`;
          cell.textContent = '';
          cell.title = `Cell (${r+1}, ${c+1})`;

          cell.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            this.onCellTap(r, c);
          });

          grid.appendChild(cell);
        }
      }
    },

    updateGrid() {
      const cells = this.dom.gridMap.querySelectorAll('.grid-cell');
      const level = Game.getCurrentLevel();
      if (!level) return;
      const selected = Game.getSelectedCell();

      // Lv6: exam overlay handles rendering, just clear grid
      if (level.id === 6) {
        cells.forEach(cell => {
          cell.className = 'grid-cell';
          cell.textContent = '';
        });
        return;
      }

      cells.forEach(cell => {
        const r = parseInt(cell.dataset.row, 10);
        const c = parseInt(cell.dataset.col, 10);
        const key = `${r},${c}`;

        // Clear all state classes
        cell.className = 'grid-cell';
        cell.textContent = '';

        const isSelected = selected && selected.row === r && selected.col === c;

        if (isSelected) cell.classList.add('cell-selected');

        // ── Level-specific rendering ──
        if (level.id === 1) {
          this.renderLv1Cell(cell, r, c, key);
        } else if (level.id === 2) {
          this.renderLv2Cell(cell, r, c, key);
        } else if (level.id === 3) {
          this.renderLv4Cell(cell, r, c, key);
        } else if (level.id === 4) {
          this.renderLv5Cell(cell, r, c, key);
        }
      });
    },

    renderLv1Cell(cell, r, c) {
      const isSample = Game.isTrainingSample(r, c);
      const isLab = Game.isLabeled(r, c);
      const phase = Game.getTrainingPhase();

      if (isSample) {
        cell.classList.add('cell-training-sample');
        cell.textContent = '?';
      } else if (isLab) {
        const labels = Game.getTrainingLabels ? Game.getTrainingLabels() : [];
        const lab = labels.find(l => l.row === r && l.col === c);
        if (lab) {
          if (lab.label === 'safe') {
            cell.classList.add('cell-labeled-safe');
            cell.textContent = '✓';
          } else {
            cell.classList.add('cell-labeled-hazard');
            cell.textContent = '⚠';
          }
        }
      }

      // If Nova has classified (reviewing/correcting phase), show classifications
      if (phase === 'reviewing' || phase === 'correcting' || phase === 'confirmed') {
        const classified = Game.getAutoClassification(r, c);
        if (classified === 'hazard') {
          cell.classList.add('cell-nova-hazard');
          cell.textContent = cell.textContent || '▲';
        } else if (classified === 'safe') {
          cell.classList.add('cell-nova-safe');
          cell.textContent = cell.textContent || '·';
        }

        // Show if Nova is wrong
        const correct = Game.isAutoCorrect(r, c);
        if (correct === false) {
          cell.classList.add('cell-nova-wrong');
          cell.textContent = '✗';
        }
      }
    },

    renderLv2Cell(cell, r, c) {
      const key = `${r},${c}`;
      const classified = Game.getLv2Classification(r, c);
      const confirmed = Game.getCellsConfirmedHazard().includes(key);
      const isHazard = Game.isHazardCell(r, c);

      if (confirmed) {
        cell.classList.add('cell-confirmed-hazard');
        cell.textContent = '⚠';
      } else if (classified === 'hazard') {
        cell.classList.add('cell-nova-hazard');
        cell.textContent = '▲';
      } else {
        cell.textContent = '·';
      }
    },

    renderLv4Cell(cell, r, c) {
      const key = `${r},${c}`;
      const confirmed = Game.getCellsConfirmedHazard().includes(key);

      if (confirmed) {
        cell.classList.add('cell-confirmed-hazard');
        cell.textContent = '⚠';
      } else {
        // All unconfirmed cells look identical — no visual leaks
        cell.textContent = '?';
      }
    },

    renderLv5Cell(cell, r, c) {
      const key = `${r},${c}`;
      const survey = Game.getNovaSurvey();
      const cellSurvey = survey ? survey[key] : null;
      const uncertain = Game.getUncertainCells().includes(key);
      const approved = Game.getApprovedCells().includes(key);
      const corrected = Game.getCorrectedCells().includes(key);
      const collapsed = Game.getCollapsedCell() === key;

      if (collapsed) {
        cell.classList.add('cell-collapsed');
        cell.textContent = '💥';
      } else if (corrected) {
        // Kid corrected this to safe — show neutral
        cell.textContent = '✓';
      } else if (uncertain) {
        // Needs kid review — gold pulsing border
        cell.classList.add('cell-lv5-uncertain');
        cell.textContent = '?';
      } else if (approved && cellSurvey && cellSurvey.autoHandled) {
        // Auto-handled hazard (Nova high confidence)
        cell.classList.add('cell-lv5-auto-hazard');
        cell.textContent = '▲';
      } else if (approved && cellSurvey && !cellSurvey.autoHandled) {
        // Kid-approved hazard
        cell.classList.add('cell-lv5-approved');
        cell.textContent = '✓';
      } else if (cellSurvey && cellSurvey.autoHandled && cellSurvey.classification === 'safe') {
        // Auto-handled safe (Nova high confidence)
        cell.classList.add('cell-lv5-auto-safe');
        cell.textContent = '·';
      } else {
        cell.textContent = '·';
      }
    },

    // ── Cell Tap ──
    onCellTap(row, col) {
      if (this.actionLock || Game.isComplete() || Game.hasConfirmedSurvey()) return;
      if (this.debounceTimer) return;
      this.debounceTimer = setTimeout(() => { this.debounceTimer = null; }, 120);

      const level = Game.getCurrentLevel();
      if (!level) return;

      Game.selectCell(row, col);
      AudioController.playSelect();

      // Lv1: enable Safe/Hazard buttons for any cell in collecting/reviewing/correcting
      if (level.id === 1) {
        const phase = Game.getTrainingPhase();
        if (phase === 'collecting') {
          // Only training sample cells can be labeled
          this.dom.btnLabelSafe.disabled = !Game.isTrainingSample(row, col);
          this.dom.btnLabelHazard.disabled = !Game.isTrainingSample(row, col);
        } else if (phase === 'reviewing' || phase === 'correcting') {
          // ALL cells can be labeled — no auto-correction, user clicks Safe/Hazard manually
          this.dom.btnLabelSafe.disabled = false;
          this.dom.btnLabelHazard.disabled = false;
        } else {
          // Confirmed — buttons disabled
          this.dom.btnLabelSafe.disabled = true;
          this.dom.btnLabelHazard.disabled = true;
        }
      }

      // Lv2: cell selection for hazard confirmation
      if (level.id === 2) {
        const key = `${row},${col}`;
        const classified = Game.getLv2Classification(row, col);
        const confirmed = Game.getCellsConfirmedHazard().includes(key);
        if (confirmed) {
          this.dom.btnMark.disabled = true;
          this.dom.btnMark.textContent = '✅ Marked!';
        } else {
          this.dom.btnMark.disabled = (classified !== 'hazard') || Game.isComplete();
          this.dom.btnMark.textContent = '⚠️ Yes, Hazard!';
        }
      }

      // Lv3: cell selection for confirmation
      if (level.id === 3) {
        const confirmed = Game.getCellsConfirmedHazard().includes(`${row},${col}`);
        this.dom.btnMark.disabled = confirmed;
        this.dom.btnMark.textContent = confirmed ? '✅ Marked!' : '⚠️ Yes, Hazard!';
      }

      // Lv4: select cell — both buttons enabled for uncertain cells
      if (level.id === 4) {
        const key = `${row},${col}`;
        const uncertain = Game.getUncertainCells().includes(key);

        // Both buttons enabled: kid must read the vote table and decide
        this.dom.btnApprove.disabled = !uncertain || Game.isComplete();
        this.dom.btnCorrect.disabled = !uncertain || Game.isComplete();
      }

      this.refreshUI();
    },

    // ── Lv1: Labeling ──
    doLabel(label) {
      const cell = Game.getSelectedCell();
      if (!cell) return;
      const level = Game.getCurrentLevel();
      if (!level || level.id !== 1) return;

      // Check if label matches Nova's current classification (wouldn't change anything)
      const novaClass = Game.getAutoClassification(cell.row, cell.col);
      if (novaClass === label) {
        // Track wrong attempts for anti-frustration & star grading
        const wrongAttempts = Game.getWrongAttempts() + 1;
        const limit = Game.getAntiFrustrationLimit();
        if (wrongAttempts >= limit) {
          // Anti-frustration: reveal the correct answer after too many wrong taps
          const isHazard = Game.isHazardCell(cell.row, cell.col);
          const correctLabel = isHazard ? 'hazard' : 'safe';
          const oppositeLabel = isHazard ? 'safe' : 'hazard';
          this.showFeedback(
            'Nova says ' + label + ' here. But this cell is actually ' + correctLabel + '! ' +
            'Tap the "' + oppositeLabel + '" button instead.',
            'info'
          );
          return;
        }
        // Increment wrong attempts via addLabel with a dummy entry to trigger the counter
        // (wrongAttempts resets to 0 on successful addLabel, so we increment it manually after)
        Game.incrementWrongAttempts();
        this.showFeedback(
          'Nova already thinks this is ' + label + '! Click the OPPOSITE label to correct it.',
          'warning'
        );
        return; // Don't add a redundant label
      }

      const result = Game.addLabel(cell.row, cell.col, label);
      if (!result) return;

      // Handle incorrect label (doesn't match the Danger Line)
      if (result.incorrect) {
        AudioController.playTokenSpent();
        const isAbove = result.amplitude >= 42;
        this.showFeedback(
          isAbove
            ? '❌ The bar is ABOVE the Danger Line! This cell is actually a HAZARD. Tap ⚠ Hazard.'
            : '❌ The bar is BELOW the Danger Line! This cell is actually SAFE. Tap ✓ Safe.',
          'error'
        );
        this.refreshUI();
        return;
      }

      AudioController.playTrainingLabel();
      this.showFeedback('+' + label + ' label added! Nova is re-learning...', 'success');

      const phase = Game.getTrainingPhase();
      if (phase === 'reviewing' || phase === 'correcting') {
        const allCorrect = Game.checkAllCorrect();
        if (allCorrect) {
          this.showFeedback('All cells correct! Great teaching!', 'success');
        } else {
          this.showFeedback('Nova re-classified. Click Submit as-is if you\'re stuck.', 'info');
        }
      } else if (phase === 'confirmed') {
        this.showFeedback('All cells correct! Click Confirm Teaching.', 'success');
      }

      this.refreshUI();
    },

    doSubmitAsIs() {
      if (Game.forceConfirmLv1()) {
        AudioController.playLevelComplete();
        this.showFeedback('Teaching submitted! Nova learned from your labels.', 'success');
        this.showLevelCompleteOverlay();
      }
      this.refreshUI();
    },

    doConfirmLv1() {
      if (Game.confirmLv1()) {
        AudioController.playLevelComplete();
        this.showLevelCompleteOverlay();
      }
      this.refreshUI();
    },

    // ── Lv2: Sensitivity ──
    adjustSensitivity(delta) {
      const sens = Game.getSensitivity();
      Game.setSensitivity(sens + delta);
      AudioController.playClick();
      // Sync slider
      const slider = document.getElementById('sens-slider');
      if (slider) slider.value = Game.getSensitivity();
      this.refreshUI();
    },

    // ── Lv4: Sensor ──
    setActiveSensor(idx) {
      Game.setActiveSensor(idx);
      AudioController.playClick();

      // Update button states
      [this.dom.btnSensorSeismic, this.dom.btnSensorGpr, this.dom.btnSensorEm].forEach((btn, i) => {
        btn.classList.toggle('active', i === idx);
      });

      this.refreshUI();
    },

    // ── Undo last action ──
    doUndo() {
      AudioController.playClick();
      const result = Game.undo();
      if (result && result.undone) {
        this.showFeedback('↩ Undone! Last action reverted.', 'info');
      } else {
        this.showFeedback('Nothing to undo.', 'info');
      }
      this.refreshUI();
    },

    // ── Confirm Hazard (Lv2-Lv4) ──
    doConfirmHazard() {
      const cell = Game.getSelectedCell();
      if (!cell || this.actionLock) return;
      const level = Game.getCurrentLevel();
      if (!level) return;

      if (level.id === 2) {
        const result = Game.confirmCellAsHazard(cell.row, cell.col);
        if (!result) return;
        if (result.isHazard) {
          AudioController.playCorrect();
          this.showFeedback('Hazard confirmed! Good eye.', 'success');
        } else {
          AudioController.playTokenSpent();
          this.showFeedbackPopup('That cell is safe! Only safe signals detected. Tap Confirm Hazard only on cells Nova flags as ▲ hazard.', '🔍');
        }
        if (Game.isComplete()) {
          AudioController.playLevelComplete();
          this.showLevelCompleteOverlay();
        }
      }

      if (level.id === 3) {
        const result = Game.confirmFusedCell(cell.row, cell.col);
        if (!result) return;

        if (result.blocked) {
          AudioController.playTokenSpent();
          this.showFeedbackPopup(result.reason || 'Not enough sensors agree. Check the 3 sensor readings above — at least 2 must show "HAZARD" before you confirm.', '🔍');
          this.refreshUI();
          return;
        }

        if (result.isHazard) {
          AudioController.playCorrect();
          this.showFeedback('Fused hazard confirmed! Great cross-referencing.', 'success');
        } else {
          AudioController.playTokenSpent();
          this.showFeedbackPopup('That cell is safe! Even with sensors agreeing, this area turned out clear. Trust the fusion — 2+ sensors can agree on a safe zone too.', '🔍');
        }

        if (Game.isComplete()) {
          AudioController.playLevelComplete();
          this.showLevelCompleteOverlay();
        }
      }
      this.refreshUI();
    },

    doConfirmSensitivity() {
      const result = Game.confirmSensitivity();
      if (!result) return;
      const { allHazardsCaught, falseAlarms } = result;
      if (allHazardsCaught && falseAlarms <= 2) {
        Game.forceComplete();
        AudioController.playLevelComplete();
        this.showLevelCompleteOverlay();
      } else if (!allHazardsCaught) {
        this.showFeedback('Not yet! Some hazards are still hidden. Try a higher sensitivity.', 'warning');
      } else {
        this.showFeedback('Too many false alarms! Lower sensitivity to reduce them.', 'warning');
      }
    },

    // ── Lv4 (HITL): Approve cell as hazard ──
    doApproveCell() {
      const cell = Game.getSelectedCell();
      if (!cell || this.actionLock) return;
      const level = Game.getCurrentLevel();
      if (!level || level.id !== 4) return;

      const key = `${cell.row},${cell.col}`;
      const survey = Game.getNovaSurvey();
      const cellSurvey = survey ? survey[key] : null;

      // Validate against the vote table: count actual sensor votes
      const voteFlags = cellSurvey ? cellSurvey.votes || {} : {};
      const hazardVotes = Object.values(voteFlags).filter(Boolean).length;
      this._lv4WrongAttempts = this._lv4WrongAttempts || {};

      if (hazardVotes < 2) {
        // Kid clicked Hazard but <2 sensors agree — wrong!
        this._lv4WrongAttempts[key] = (this._lv4WrongAttempts[key] || 0) + 1;
        if (this._lv4WrongAttempts[key] >= 3) {
          this.showFeedbackPopup('Fewer than 2 sensors are above the danger line. Read the vote table: count how many say "HAZARD". If less than 2, tap ✓ Safe instead.', '💡');
        } else {
          this.showFeedbackPopup('Only ' + hazardVotes + '/3 sensors say HAZARD. Need 2+ to confirm. Tap ✓ Safe to correct.', '🔍');
        }
        AudioController.playTokenSpent();
        this.refreshUI();
        return;
      }

      // Valid: ≥2 sensors agree — approve
      const result = Game.approveCell(cell.row, cell.col);
      if (!result) return;
      delete this._lv4WrongAttempts[key];
      if (result.ok) {
        AudioController.playCorrect();
        this.showFeedback('✅ Hazard confirmed! ' + hazardVotes + '/3 sensors agreed.', 'success');
      } else {
        AudioController.playTokenSpent();
        this.showFeedbackPopup(result.reason || 'Could not confirm this cell.', '🔍');
      }

      if (Game.isComplete()) {
        AudioController.playLevelComplete();
        this.showLevelCompleteOverlay();
      }
      this.refreshUI();
    },

    // ── Lv4 (HITL): Correct Nova's wrong classification ──
    doCorrectCell() {
      const cell = Game.getSelectedCell();
      if (!cell || this.actionLock) return;
      const level = Game.getCurrentLevel();
      if (!level || level.id !== 4) return;

      const key = `${cell.row},${cell.col}`;
      const survey = Game.getNovaSurvey();
      const cellSurvey = survey ? survey[key] : null;

      // Validate against the vote table: count actual sensor votes
      const voteFlags = cellSurvey ? cellSurvey.votes || {} : {};
      const hazardVotes = Object.values(voteFlags).filter(Boolean).length;
      this._lv4WrongAttempts = this._lv4WrongAttempts || {};

      if (hazardVotes >= 2) {
        // Kid clicked Safe but ≥2 sensors agree on hazard — wrong!
        this._lv4WrongAttempts[key] = (this._lv4WrongAttempts[key] || 0) + 1;
        if (this._lv4WrongAttempts[key] >= 3) {
          this.showFeedbackPopup('2+ sensors ARE above the danger line! Read the vote table: ' + hazardVotes + '/3 say "HAZARD". Tap ⚠ Hazard to confirm.', '💡');
        } else {
          this.showFeedbackPopup(hazardVotes + '/3 sensors say HAZARD — that IS a hazard. Tap ⚠ Hazard to confirm.', '🔍');
        }
        AudioController.playTokenSpent();
        this.refreshUI();
        return;
      }

      // Valid: <2 sensors agree — correct Nova
      const result = Game.correctCellLv5(cell.row, cell.col);
      if (!result) return;
      delete this._lv4WrongAttempts[key];
      if (result.ok) {
        AudioController.playCorrect();
        this.showFeedback('✅ Correct! Only ' + hazardVotes + '/3 sensors agreed — this is safe.', 'success');
      } else {
        AudioController.playTokenSpent();
        this.showFeedbackPopup(result.reason || 'Could not correct this cell.', '🔍');
      }

      if (Game.isComplete()) {
        AudioController.playLevelComplete();
        this.showLevelCompleteOverlay();
      }
      this.refreshUI();
    },

    // ── Lv4 (HITL): Navigate to next uncertain cell ──
    nextUncertainCell() {
      const uncertain = Game.getUncertainCells();
      if (uncertain.length === 0) return;
      const sel = Game.getSelectedCell();
      const selKey = sel ? `${sel.row},${sel.col}` : '';
      // Find the next unresolved uncertain cell after the current selection
      let idx = uncertain.findIndex(k => k === selKey);
      idx = (idx + 1) % uncertain.length;
      const [r, c] = uncertain[idx].split(',').map(Number);
      Game.selectCell(r, c);
      AudioController.playClick();
      this.dom.btnApprove.disabled = false;
      this.dom.btnCorrect.disabled = false;
      this.refreshUI();
    },

    // ── Level 6: Nova surveys land → AI builds a smart city ──
    startLv6Demo() {
      const level = Game.getCurrentLevel();
      if (!level || level.id !== 5) return;

      this.actionLock = true;
      this.dom.deviceInfo.textContent = '🏗️ Nova is surveying this land before we build...';

      const rows = level.gridRows;
      const cols = level.gridCols;
      const T = level.demoThreshold || 46;
      let r = 0, c = 0;
      let correct = 0;
      let hazardsFound = 0;
      let safeFound = 0;
      const total = rows * cols;
      const totalHazards = level.hazards.length;

      // Theme the grid as land plots
      const grid = this.dom.gridMap;
      grid.querySelectorAll('.grid-cell').forEach(cell => {
        cell.className = 'grid-cell l6-land';
        cell.textContent = '';
        cell.style.animation = '';
      });

      const buildingIcons = ['🏠', '🏢', '🏪', '🏦', '🏥', '🏫', '🌳', '🌲'];
      let hazardPositions = [];

      function buildCity(self) {
        // Animate buildings popping up on safe cells
        const cells = grid.querySelectorAll('.grid-cell');
        let delay = 0;
        let safeCellCount = 0;
        cells.forEach(cell => {
          const isHazard = cell.classList.contains('l6-hazard-marker');
          if (!isHazard) {
            const icon = buildingIcons[Math.floor(Math.random() * buildingIcons.length)];
            setTimeout(() => {
              cell.classList.add('l6-building');
              cell.textContent = icon;
            }, delay);
            delay += 60;
            safeCellCount++;
          }
        });

        self.dom.deviceInfo.textContent = `🏙️ AI Smart City built on ${safeFound} safe plots! ${hazardsFound} hazards were fenced off.`;
        AudioController.playLevelComplete();
        self.showFeedback(
          `🏙️ Nova found ${hazardsFound} hazards and cleared ${safeFound} safe plots. ` +
          `The AI built a smart city on the safe land! Hazards were turned into parks and fences.`,
          'success'
        );

        // After all buildings are placed, mark the level as complete
        const completeDelay = Math.max(delay, 800) + 200;
        setTimeout(() => {
          Game.forceComplete();
          self.showLevelCompleteOverlay();
        }, completeDelay);
      }

      function scanNext(self) {
        if (r >= rows) {
          // Survey complete! Now build the city on safe cells.
          self.actionLock = true;
          self.dom.deviceInfo.textContent = `✅ Survey done! ${hazardsFound} hazards found, ${safeFound} safe plots. Building AI Smart City... 🏙️`;
          
          // After a short pause, build the city
          setTimeout(() => buildCity(self), 800);
          return;
        }

        Game.selectCell(r, c);
        const amp = level.cellAmplitudes[r][c];
        const isHazard = amp >= T;
        const isActuallyHazard = level.hazards.some(h => h.row === r && h.col === c);
        const cellEl = grid.querySelector(`[data-row="${r}"][data-col="${c}"]`);

        if (cellEl) {
          cellEl.classList.add('cell-selected');

          setTimeout(() => {
            cellEl.classList.remove('cell-selected');

            if (isHazard) {
              // 🚨 HAZARD! Mark with warning
              cellEl.className = 'grid-cell l6-hazard-marker';
              cellEl.textContent = '⚠';
              cellEl.style.animation = 'none';
              cellEl.offsetHeight;
              cellEl.style.animation = 'hazard-flash 0.5s ease 2';
              hazardPositions.push({ r, c });
              hazardsFound++;
              if (isActuallyHazard) correct++;
              AudioController.playCorrect();

              self.dom.deviceInfo.textContent =
                `🚨 HAZARD at (${r+1},${c+1})! Signal: ${Math.round(amp)} — ABOVE Danger Line! ` +
                `(${hazardsFound} found)`;
            } else {
              // ✅ Safe land — mark as building plot
              cellEl.className = 'grid-cell l6-safe-plot';
              cellEl.textContent = '⊞';
              safeFound++;
              if (isActuallyHazard === false) correct++;

              self.dom.deviceInfo.textContent =
                `✅ Safe plot at (${r+1},${c+1}). Signal: ${Math.round(amp)} — below line. ` +
                `(${hazardsFound} hazards found)`;
            }
          }, 200);
        }

        self.refreshUI();

        c++;
        if (c >= cols) { c = 0; r++; }
        const speed = Math.max(70, 350 - (r * cols + c) * 2);
        setTimeout(() => scanNext(self), speed);
      }

      setTimeout(() => scanNext(this), 600);
    },

    // ── Level 6: Nova's Final Exam — AI Concept Challenge ──
    startExam() {
      const level = Game.getLevel(6);
      if (!level) return;
      this._examState = { conceptsCorrect: 0, currentRound: 0, totalRounds: level.rounds.length, roundResults: [] };
      this.showExamRound(0);
    },

    showExamRound(roundIdx) {
      const level = Game.getLevel(6);
      if (!level || !level.rounds || !level.rounds[roundIdx]) {
        this.showExamComplete();
        return;
      }
      const round = level.rounds[roundIdx];
      const es = this._examState;
      if (!es) return;
      es.currentRound = roundIdx;
      const total = es.totalRounds;
      const correct = es.conceptsCorrect;
      const wrong = roundIdx - correct;
      const pct = Math.round((roundIdx / total) * 100);

      const di = document.getElementById('device-info');
      if (di) di.textContent = '🧠 Round ' + (roundIdx + 1) + '/' + total + ' | ✅ ' + correct + ' · ❌ ' + wrong;

      // Update progress bar
      let pb = document.getElementById('exam-progress');
      if (!pb) {
        pb = document.createElement('div');
        pb.id = 'exam-progress';
        pb.style.cssText = 'width:100%;height:4px;background:rgba(255,255,255,0.08);border-radius:2px;position:absolute;top:0;left:0';
        pb.innerHTML = '<div id="exam-progress-fill" style="height:100%;width:0;background:var(--color-primary);border-radius:2px;transition:width .4s ease"></div>';
        const card = document.querySelector('.exam-card');
        if (card) { card.style.position = 'relative'; card.prepend(pb); }
      }
      const fill = document.getElementById('exam-progress-fill');
      if (fill) fill.style.width = pct + '%';

      // Update grid progress
      const grid = document.getElementById('grid-map');
      if (grid) {
        grid.innerHTML = '';
        for (let r = 0; r < 6; r++) {
          for (let c = 0; c < 6; c++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell';
            const idx = r * 6 + c;
            let bg = 'var(--color-bg-cell)';
            let txt = '·';
            if (idx < roundIdx) {
              const res = es.roundResults[idx];
              txt = res ? '✅' : '❌';
              bg = res ? 'rgba(57,255,20,0.08)' : 'rgba(255,107,53,0.08)';
            } else if (idx === roundIdx) {
              txt = round.emoji;
              bg = 'rgba(56,189,248,0.15)';
            }
            cell.style.cssText = 'background:' + bg + ';border:1px solid var(--color-border);aspect-ratio:1;display:flex;align-items:center;justify-content:center;font-size:16px';
            cell.textContent = txt;
            grid.appendChild(cell);
          }
        }
      }

      const container = document.getElementById('exam-container') || this.createExamContainer();
      const letters = ['A', 'B', 'C', 'D'];

      // Fade transition
      const cardEl = container.querySelector('.exam-card');
      if (cardEl) { cardEl.style.opacity = '0'; cardEl.style.transform = 'translateY(10px)'; }

      setTimeout(() => {
        let choicesHtml = '';
        round.choices.forEach((c, i) => {
          const letter = letters[i] || '?';
          choicesHtml += '<button class="exam-choice" data-idx="' + i + '">' +
            '<span class="exam-letter">' + letter + '</span> ' + c.text + '</button>';
        });

        container.innerHTML =
          '<div class="exam-card" style="transition:opacity .25s ease,transform .25s ease">' +
            '<div class="exam-header">' +
              '<span class="exam-badge">' + round.emoji + ' Round ' + (roundIdx + 1) + '/' + total + '</span>' +
              '<span class="exam-concept">' + round.concept + '</span>' +
            '</div>' +
            '<div class="exam-question">' + round.question + '</div>' +
            '<div class="exam-choices">' + choicesHtml + '</div>' +
            '<div class="exam-feedback" id="exam-feedback"></div>' +
          '</div>';

        // Re-attach progress bar
        const newCard = container.querySelector('.exam-card');
        if (newCard && pb) {
          newCard.style.position = 'relative';
          newCard.prepend(pb);
        }

        // Fade in
        requestAnimationFrame(() => {
          const nc = container.querySelector('.exam-card');
          if (nc) { nc.style.opacity = '1'; nc.style.transform = 'translateY(0)'; }
        });

        container.querySelectorAll('.exam-choice').forEach(btn => {
          btn.addEventListener('click', (e) => { this.handleExamChoice(roundIdx, parseInt(e.currentTarget.dataset.idx, 10)); });
        });
      }, cardEl ? 200 : 0);
    },

    createExamContainer() {
      const c = document.createElement('div');
      c.id = 'exam-container';
      c.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;z-index:50;background:rgba(8,12,16,0.85)';
      document.querySelector('.game-area').appendChild(c);
      return c;
    },

    handleExamChoice(roundIdx, choiceIdx) {
      const level = Game.getLevel(6);
      if (!level || !level.rounds || !level.rounds[roundIdx]) return;
      const round = level.rounds[roundIdx];
      const choice = round.choices[choiceIdx];
      const isCorrect = choice.correct;
      const es = this._examState;
      if (!es) return;

      if (isCorrect) {
        es.conceptsCorrect++;
        if (typeof AudioController !== 'undefined' && AudioController.playCorrect) AudioController.playCorrect();
      } else {
        if (typeof AudioController !== 'undefined' && AudioController.playTokenSpent) AudioController.playTokenSpent();
      }
      es.roundResults[roundIdx] = isCorrect;

      const fb = document.getElementById('exam-feedback');
      if (!fb) return;

      const allBtns = document.querySelectorAll('.exam-choice');
      allBtns.forEach((b, i) => {
        const rc = round.choices[i];
        b.disabled = true;
        if (rc.correct) { b.style.borderColor = '#39FF14'; b.style.background = 'rgba(57,255,20,0.06)'; }
        else if (i === choiceIdx && !rc.correct) { b.style.borderColor = '#FF6B35'; b.style.background = 'rgba(255,107,53,0.06)'; }
      });

      const correctText = isCorrect ? '✅ Correct!' : '❌ Not quite. The right answer was: ' + round.choices.find(c => c.correct).text;
      const correctChoice = round.choices.findIndex(c => c.correct);
      const letters = ['A', 'B', 'C', 'D'];
      const answerLetter = letters[correctChoice] || '?';

      fb.innerHTML =
        '<div class="exam-result ' + (isCorrect ? 'correct' : 'wrong') + '">' +
          '<div class="exam-result-icon">' + (isCorrect ? '✅' : '❌') + '</div>' +
          '<div class="exam-result-text">' + correctText + '</div>' +
          '<div class="exam-concept-card" style="border-left:3px solid ' + (isCorrect ? '#39FF14' : '#FF6B35') + '">' +
            '<div class="exam-cc-title">🧠 AI Concept: ' + round.concept + '</div>' +
            '<div class="exam-cc-body">' + round.explanation + '</div>' +
          '</div>' +
          '<button class="exam-next-btn" id="exam-next-btn">' +
            (roundIdx + 1 < level.rounds.length ? 'Next Challenge →' : '🎓 See Results') +
          '</button>' +
        '</div>';

      document.getElementById('exam-next-btn').addEventListener('click', () => {
        if (roundIdx + 1 < level.rounds.length) {
          this.showExamRound(roundIdx + 1);
        } else {
          this.showExamComplete();
        }
      });

      const di = document.getElementById('device-info');
      const wrong = (roundIdx + 1) - es.conceptsCorrect;
      if (di) di.textContent = '🧠 Score: ✅ ' + es.conceptsCorrect + ' · ❌ ' + wrong + ' | ' + es.conceptsCorrect + '/' + level.rounds.length;
    },

    showExamComplete() {
      const level = Game.getLevel(6);
      if (!level) return;
      const es = this._examState;
      if (!es) return;
      const total = level.rounds.length;
      const correct = es.conceptsCorrect;
      const stars = correct >= total - 1 ? 3 : correct >= Math.ceil(total / 2) ? 2 : correct > 0 ? 1 : 0;

      Game.setExamResult(correct, total);

      const container = document.getElementById('exam-container');
      if (container) {
        let recapHtml = '';
        level.rounds.forEach((r, i) => {
          const wasCorrect = es.roundResults[i];
          recapHtml += '<div class="exam-recap-item">' +
            '<span class="recap-icon">' + (wasCorrect ? '✅' : '❌') + '</span>' +
            '<span class="recap-emoji">' + r.emoji + '</span>' +
            '<span class="recap-name">' + r.concept + '</span>' +
          '</div>';
        });

        container.innerHTML =
          '<div class="exam-complete-card">' +
            '<div class="exam-stars">' + '⭐'.repeat(stars) + '☆'.repeat(3 - stars) + '</div>' +
            '<div class="exam-score">' + correct + '/' + total + ' Concepts Mastered</div>' +
            '<div class="exam-msg">' +
              (stars === 3 ? '🏆 Nova is AI-Certified! You mastered almost every concept!' :
               stars === 2 ? '👏 Good effort! You know most AI concepts. Review the ones you missed.' :
               '📚 Keep learning! Each challenge teaches an AI concept. Try again to master them all.') +
            '</div>' +
            '<div class="exam-recap-grid">' + recapHtml + '</div>' +
            '<button class="exam-finish-btn" id="exam-finish-btn">🎉 Finish Exam</button>' +
          '</div>';
      }

      document.getElementById('exam-finish-btn')?.addEventListener('click', () => {
        if (container) container.style.display = 'none';
        Game.forceComplete();
        this.showLevelCompleteOverlay();
      });
    },

    // ── Confirm Survey (Level 2 submit / Level 4 auto-safe) ──
    doConfirmSurvey() {
      const lv = Game.getCurrentLevel();
      if (!lv) return;
      if (lv.id === 2) {
        AudioController.playLevelComplete();
        Game.forceComplete();
        this.showLevelCompleteOverlay();
      } else if (lv.id === 4) {
        // Trigger collapse or complete for auto-handled hazards
        const survey = Game.getNovaSurvey();
        if (survey) {
          // Find auto-missed hazard to trigger collapse
          const hazards = lv.hazards || [];
          for (const h of hazards) {
            const key = `${h.row},${h.col}`;
            const cellSurvey = survey[key];
            if (cellSurvey && cellSurvey.autoHandled && cellSurvey.classification === 'safe') {
              Game.handleAutoMissedHazard(h.row, h.col);
              this.refreshUI();
              return;
            }
          }
        }
        // No auto-missed hazards — force complete
        Game.forceComplete();
        AudioController.playLevelComplete();
        this.showLevelCompleteOverlay();
      }
    },

    // ── Level Navigation ──
    resetLevel() {
      AudioController.playClick();
      Game.resetLevel(Game.getCurrentLevelNum());
      this.dom.levelComplete.classList.add('hidden');
      this.clearFeedback();
      this.actionLock = false;
      this.rebuildGrid();
      this.refreshUI();
    },

    nextLevel() {
      const current = Game.getCurrentLevelNum();
      if (current >= 6) {
        // Level 6 is terminal — go to completion screen
        this.dom.levelComplete.classList.add('hidden');
        this.showCompletionScreen();
        return;
      }
      AudioController.playClick();
      Game.setLevel(current + 1);
      this.dom.levelComplete.classList.add('hidden');
      this.clearFeedback();
      this.actionLock = false;
      this.rebuildGrid();
      this.refreshUI();

      // Start autonomous demo when entering Level 5 via Next Level button
      if (current + 1 === 5) {
        setTimeout(() => this.startLv6Demo(), 600);
      }
    },

    replayLevel() {
      AudioController.playClick();
      this.resetLevel();
    },

    // ── Level Complete with star explanations ──
    getStarExplanation(stars, levelId) {
      if (stars === 3) {
        const msgs = {
          1: '⭐ Perfect! Nova learned safe vs danger from your examples. City foundation is ready!',
          2: '⭐ Perfect! Nova\'s sensitivity is tuned just right — all hazards caught with zero false alarms!',
          3: '⭐ Perfect! All 3 sensors agree — the ground is safe. City plans are approved!',
          4: '⭐ Perfect! Nova + You = Dream Team. The city is ready to build!',
          6: '⭐ Nova\'s Final Exam — you mastered AI concepts across the entire curriculum!',
        };
        return msgs[levelId] || 'Perfect score! Well done!';
      }
      if (stars === 2) {
        const msgs = {
          1: '⭐⭐ Good start! Next time, correct all ✗ cells by clicking the OPPOSITE label. Nova needs your teaching!',
          2: '⭐⭐ Good tuning! Lower sensitivity = fewer false alarms. Try to find the sweet spot where all hazards show but few false alarms flare up.',
          3: '⭐⭐ Almost! Check all 3 sensors before confirming. 2+ must agree for a safe city!',
          4: '⭐⭐ Good supervision! Check every uncertain cell. Missed hazards = cracks in the city!',
          6: '⭐⭐ Good knowledge! Review the AI concepts you missed to master them all.',
        };
        return msgs[levelId] || 'Good effort! Try again!';
      }
      const msgs = {
        1: '⭐ Nova needs you! Label short bars Safe, tall bars Hazard. Then fix any ✗ cells Nova got wrong.',
         2: '⭐ Keep tuning! Slide to find the sweet spot — low sensitivity misses hazards, high sensitivity creates false alarms.',
        3: '⭐ One sensor can be tricked. Check: do 2+ sensors agree? Only then click Confirm Hazard.',
         4: '⭐ Almost done! Tap each yellow cell, check the 3 sensors, then tap Hazard or Safe.',
        6: '⭐ Keep learning! Each challenge teaches an AI concept. Try again to master them all.',
      };
      return msgs[levelId] || 'Keep practicing! Try again!';
    },

    /** AI Moment — one-line insight connecting the action to the AI concept */
    getAIMoment(levelId) {
      const moments = {
        1: '🧠 You just did SUPERVISED LEARNING — AI learns by looking at examples YOU label!',
        2: '🧠 You found the DETECTION TRADEOFF — catching more hazards means more false alarms. No perfect setting!',
        3: '🧠 SENSOR FUSION — 3 sensors working together catch things that 1 alone would miss. Like asking 3 friends!',
        4: '🧠 HUMAN-IN-THE-LOOP — AI handles easy stuff, humans check the tricky ones. Safer than either alone!',
        5: '🧠 AUTONOMOUS AI — After training, Nova can survey sites on her own!',
        6: '🧠 AI MASTERY — You understand supervised learning, precision/recall, sensor fusion, human-in-the-loop, autonomous AI, optimization, anomaly detection, and fairness!',
      };
      return moments[levelId] || '';
    },

    showLevelCompleteOverlay() {
      const stars = Game.getStars();
      const lv = Game.getCurrentLevel();

      this.dom.starRating.innerHTML = '';
      for (let i = 1; i <= 3; i++) {
        const star = document.createElement('span');
        star.className = 'star' + (i <= stars ? ' filled' : '');
        star.textContent = '★';
        this.dom.starRating.appendChild(star);
      }

      // Build the city narrative based on level — with AI concept names
      const aiLabels = {1:'Supervised Learning',2:'Precision & Recall',
                        3:'Sensor Fusion',4:'Human-in-the-Loop',5:'Autonomous AI',
                        6:'AI Mastery Exam'};
      const nextMsg = {1:'→ L2: Precision & Recall',
                       2:'→ L3: Sensor Fusion',
                       3:'→ L4: Human-in-the-Loop',
                       4:'→ L5: Autonomous AI',
                       5:'→ L6: AI Mastery Exam',
                       6:'Finish Survey'};
      this.dom.completeTitle.textContent = lv.id === 6
        ? '🎓 Nova\'s Final Exam Complete!'
        : `✅ Day ${lv.id}: ${aiLabels[lv.id]}!`;
      // Combine star explanation + AI Moment (prominent styling)
      const starMsg = this.getStarExplanation(stars, lv.id);
      const aiMoment = this.getAIMoment(lv.id);
      this.dom.completeMessage.innerHTML = starMsg
        + (aiMoment ? '<br><br><div class="ai-moment-badge">' + aiMoment + '</div>' : '');
      this.dom.btnNextLevel.textContent = nextMsg[lv.id] || 'Next Level';

      this.dom.levelComplete.classList.remove('hidden');

      // Fun celebration
      if (stars >= 2) {
        this.spawnConfetti(stars * 10);
      }

      // Story: mark level as completed in localStorage for growth meter
      try { localStorage.setItem('ssd_level_' + lv.id + '_done', '1'); } catch (e) { /* ignore */ }
      this.updateGrowthMeter();

      // Story: Dr. Chen congratulates
      const chenCongrats = {
        1: 'Excellent teaching! Nova is starting to understand. The crew can start preparing.',
        2: 'Perfect balance! You saved the budget and caught the hazards. Nova is learning well.',
        3: 'Three sensors, one truth. You fused them perfectly. Nova is ready for the big test.',
        4: 'Certified! Nova surveyed her first site. I could not have done it without you two.',
        5: 'The city is built on solid ground. Nova, you are officially a master surveyor!',
        6: 'Congratulations! You understand 8 AI concepts. Nova is proud of you, Commander!',
      };
      if (chenCongrats[lv.id]) {
        this.dom.chenMsg.textContent = chenCongrats[lv.id];
        this.dom.chenCard.classList.remove('hidden');
        this.dom.chenCard.style.animation = 'none';
        this.dom.chenCard.offsetHeight;
        this.dom.chenCard.style.animation = '';
        // Dr. Chen speaks his congratulations
        setTimeout(() => this.chenSpeak(chenCongrats[lv.id], { cancel: true }), 600);
      }
    },

    spawnConfetti(count) {
      const colors = ['#FF6B35', '#39FF14', '#00FFFF', '#FFD700', '#FF3355', '#E040FB'];
      for (let i = 0; i < count; i++) {
        const piece = document.createElement('div');
        piece.className = 'confetti-piece';
        piece.style.cssText = `
          position: fixed; top: -10px; left: ${Math.random() * 100}vw;
          width: ${Math.random() * 8 + 4}px; height: ${Math.random() * 8 + 4}px;
          background: ${colors[Math.floor(Math.random() * colors.length)]};
          border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
          z-index: 500; pointer-events: none;
          animation: confetti-fall ${Math.random() * 2 + 1.5}s ease-out forwards;
          animation-delay: ${Math.random() * 0.3}s;
        `;
        document.body.appendChild(piece);
        setTimeout(() => piece.remove(), 3000);
      }
    },

    showCompletionScreen() {
      const stats = Game.getStats();
      this.dom.finalTotalHazards.textContent = stats.totalHazardsFound;
      this.dom.finalAccuracy.textContent = stats.accuracy + '%';
      this.dom.finalTokens.textContent = stats.totalTokensSpent;

      // Nova's parting message via the feedback area
      this.showFeedback(
        '🤖 Nova: "Thanks for teaching me! Remember — AI learns from you, needs tuning, ' +
        'handles noise, uses multiple sensors, and works best with humans. You\'re an AI Trainer now!"',
        'success'
      );

      this.showScreen('complete');
      AudioController.playGameComplete();
    },

    // ── UI Refresh ──
    refreshUI() {
      const lv = Game.getCurrentLevel();
      if (!lv) return;

      this.dom.levelLabel.textContent = `Level ${lv.id}: ${lv.name}`;
      this.dom.objectiveText.textContent = lv.objective;
      this.dom.gridStats.textContent = `${lv.gridRows}×${lv.gridCols} Grid`;

      // Show/hide level-specific panels
      this.dom.trainingPanel.classList.toggle('hidden', lv.id !== 1);
      this.dom.sensitivityPanel.classList.toggle('hidden', lv.id !== 2 && lv.id !== 4);
      this.dom.sensorToggle.classList.toggle('hidden', lv.id !== 3 && lv.id !== 4);
      this.dom.tokenCounter.classList.toggle('hidden',
        lv.maxTokens === Infinity || !lv.maxTokens || lv.id === 1);
      this.dom.actionRow.classList.toggle('hidden', lv.id === 1 || lv.id === 4);
      this.dom.mapLegend.classList.toggle('hidden', lv.id === 3 || lv.id === 4);
      this.dom.btnConfirm.classList.add('hidden');
      this.dom.lv5Actions && this.dom.lv5Actions.classList.toggle('hidden', lv.id !== 4);
      this.dom.confidenceLegend && this.dom.confidenceLegend.classList.toggle('hidden', lv.id !== 4);

      // Lv1
      if (lv.id === 1) {
        const labels = Game.getTrainingLabels ? Game.getTrainingLabels() : [];
        const phase = Game.getTrainingPhase();
        const allCorrect = Game.checkAllCorrect();

        // Show label count (no "/4" cap after collecting phase)
        this.dom.labelCount.textContent = phase === 'collecting'
          ? `${labels.length}/4` : `${labels.length}`;

        this.dom.trainingPhaseText.textContent =
          phase === 'collecting' ? 'Label 4 training samples' :
          !allCorrect ? 'Nova needs more teaching — correct the ✗ cells' :
          'Teaching done!';

        // Show Confirm button when all cells are correct OR teaching phase is confirmed
        // (DEFENSIVE: covers both the normal flow and the edge case where phase auto-transitions)
        this.dom.btnConfirmLv1.classList.toggle('hidden',
          !allCorrect && phase !== 'confirmed' || Game.isComplete());
        this.dom.btnSubmitAsIs.classList.toggle('hidden',
          allCorrect || Game.isComplete() || phase === 'collecting');

        this.dom.deviceInfo.textContent = phase === 'collecting'
          ? '👆 Tap a ? cell → see the bar → tap ✓ Safe (short bar) or ⚠ Hazard (tall bar)'
          : !allCorrect
          ? (() => {
              const sel = Game.getSelectedCell();
              if (sel) {
                const novaClass = Game.getAutoClassification(sel.row, sel.col);
                if (novaClass === 'hazard') {
                  return 'Nova says HAZARD ▲ but wrong? Tap ✓ Safe to fix it.';
                } else {
                  return 'Nova says SAFE · but wrong? Tap ⚠ Hazard to fix it.';
                }
              }
              return 'Tap a ✗ cell. Click the OPPOSITE label to correct Nova.';
            })()
          : '✅ All correct! Tap Confirm Teaching to finish.';
      }

      // Lv2
      if (lv.id === 2) {
        const slider = document.getElementById('sens-slider');
        if (slider) slider.value = Game.getSensitivity();
        this.dom.sensitivityValue.textContent = Game.getSensitivity();
        const metrics = Game.getLv2Metrics();
        this.dom.meterHazards.textContent = `${metrics.hazardsCaught}/${metrics.totalHazards}`;
        this.dom.meterFalseAlarms.textContent = metrics.falseAlarms;
        this.dom.deviceInfo.textContent = '🎯 Slide sensitivity until all ' + metrics.totalHazards + ' hazards show as ▲ with minimal false alarms, then tap Confirm!';
        if (this.dom.btnConfirmSens) {
          this.dom.btnConfirmSens.disabled = Game.getSensitivity() <= 1;
        }
        if (Game.isComplete && Game.isComplete()) {
          AudioController.playLevelComplete();
          this.showLevelCompleteOverlay();
        }
      }

      // Lv4 Sensor Fusion (shared with L3)
      if (lv.id === 3) {
        const active = Game.getActiveSensor();
        [this.dom.btnSensorSeismic, this.dom.btnSensorGpr, this.dom.btnSensorEm].forEach((btn, i) => {
          btn.classList.toggle('active', i === active);
        });
        const sel = Game.getSelectedCell();
        if (sel) {
          const votes = Game.getCellSensorVotes ? Game.getCellSensorVotes(sel.row, sel.col) : null;
          if (votes) {
            this.dom.deviceInfo.textContent = votes.agreeCount + '/3 sensors agree. ' +
              (votes.agreeCount >= 2 ? '✅ That\'s enough! Tap "Yes, Hazard!"' : '❌ Not enough. Try a different cell or check the sensor readings.');
          } else {
            this.dom.deviceInfo.textContent = '📡 Each colored bar = one sensor. Need 2+ sensors to say "hazard" before you confirm.';
          }
        } else {
          this.dom.deviceInfo.textContent = '👫 Like 3 friends looking for something: tap a cell, see what each sensor says. Only confirm when 2+ agree!';
        }
      }

      // Lv4 (HITL): AI auto-surveys, kid reviews uncertain cells via code-style vote table
      if (lv.id === 4) {
        // Update sensor toggle active state
        const active = Game.getActiveSensor();
        [this.dom.btnSensorSeismic, this.dom.btnSensorGpr, this.dom.btnSensorEm].forEach((btn, i) => {
          btn.classList.toggle('active', i === active);
        });

        // Show sensitivity slider position for threshold tuning
        const sensVal = Game.getSensitivity ? Game.getSensitivity() : 5;
        const slider = document.getElementById('sens-slider');
        if (slider) {
          slider.value = sensVal;
          slider.min = 1;
          slider.max = 12;
        }
        this.dom.sensitivityValue.textContent = sensVal;

        const sel = Game.getSelectedCell();
        const selKey = sel ? `${sel.row},${sel.col}` : '';
        const uncertain = sel ? Game.getUncertainCells().includes(selKey) : false;
        const survey = Game.getNovaSurvey();
        const cellSurvey = sel && survey ? survey[selKey] : null;
        const collapsed = Game.isCollapseTriggered();
        const complete = Game.isComplete();
        const totalUncertain = Game.getUncertainCells().length;
        const allUncertainKeys = Game.getUncertainCells();

        // -- Vote Table: render code-style readout for selected cell --
        const voteTable = this.dom.voteTable;
        if (sel && cellSurvey && !collapsed && !complete) {
          // Get sensor signal data
          const signals = Game.getSensorSignals ? Game.getSensorSignals(sel.row, sel.col) : null;
          const thresholds = Game.getSensorThresholds ? Game.getSensorThresholds() : { seismic: 42, gpr: 40, em: 38 };
          const sensorIds = ['seismic', 'gpr', 'em'];
          const sensorNames = ['Seismic', 'GPR', 'EM'];
          const sensorColors = ['#FF6B35', '#39FF14', '#00FFFF'];
          const sensorIcons = ['〰', '↕', '◎'];

          let html = '';
          for (let i = 0; i < 3; i++) {
            const sid = sensorIds[i];
            const amp = signals ? (signals[sid] || 0) : 0;
            const thresh = thresholds[sid] || 42;
            const above = amp >= thresh;
            const verdict = above ? '⚠ HAZARD' : 'safe';
            const cls = above ? 'true' : 'false';

            html += '<div class="vote-row">' +
              '<span class="vote-sensor s' + i + '">' + sensorIcons[i] + sensorNames[i] + '</span>' +
              '<span class="vote-condition">' +
                '<span style="color:' + sensorColors[i] + '">' + amp + '</span> ≥ <span style="color:' + sensorColors[i] + '">' + thresh + '</span> → ' +
                '<span class="' + cls + '">' + verdict + '</span>' +
              '</span>' +
              '<span class="vote-result-icon">' + (above ? '✅' : '✗') + '</span>' +
            '</div>';
          }

          // Count actual hazard votes from the cell survey
          const voteFlags = cellSurvey.votes || { seismic: false, gpr: false, em: false };
          const hazardVotes = Object.values(voteFlags).filter(Boolean).length;

          html += '<div class="vote-summary">' +
            '<span>HAZARD votes: <span class="count">' + hazardVotes + '/3</span></span>' +
            '<span class="nova-verdict">Nova says: ' + cellSurvey.classification.toUpperCase() + '</span>' +
          '</div>' +
          '<div class="vote-rule">Rule: ≥2 sensors above danger line → HAZARD</div>';

          voteTable.innerHTML = html;
          voteTable.classList.remove('hidden');
        } else {
          voteTable.classList.add('hidden');
        }

        // -- Both buttons enabled for uncertain cells (kid decides) --
        if (collapsed || complete) {
          this.dom.btnApprove.disabled = true;
          this.dom.btnCorrect.disabled = true;
        } else if (sel && uncertain) {
          // BOTH enabled — kid must read the vote table and decide
          this.dom.btnApprove.disabled = false;
          this.dom.btnCorrect.disabled = false;
        } else {
          this.dom.btnApprove.disabled = true;
          this.dom.btnCorrect.disabled = true;
        }

        // Show the "See Missed Hazards" button for auto-safe edge case
        const allAutoSafe = Game.canConfirmLv5 ? Game.canConfirmLv5() : false;
        if (allAutoSafe && !collapsed && !complete) {
          this.dom.btnConfirm.classList.remove('hidden');
          this.dom.btnConfirm.textContent = '⚠️ See Missed Hazards';
        } else if (!allAutoSafe && !complete) {
          this.dom.btnConfirm.classList.add('hidden');
        }

        // -- Next uncertain cell button --
        const uncertainIdx = selKey ? allUncertainKeys.indexOf(selKey) : -1;
        this.dom.btnNextUncertain.classList.toggle('hidden', totalUncertain === 0 || complete);
        this.dom.btnNextUncertain.textContent = totalUncertain > 0
          ? '➡️ Next (' + (uncertainIdx >= 0 ? (uncertainIdx + 1) + '/' + totalUncertain : totalUncertain + ' remaining') + ')'
          : '➡️ Next uncertain cell';

        // Update device info
        const progress = Game.getLv5Progress ? Game.getLv5Progress() : null;
        if (collapsed) {
          this.dom.deviceInfo.textContent = '💥 Nova missed a hazard — building collapsed! Adjust sensitivity and retry.';
        } else if (complete) {
          this.dom.deviceInfo.textContent = '✅ All uncertain cells resolved! Site certified safe.';
        } else if (allAutoSafe) {
          this.dom.deviceInfo.textContent = '⚠️ Nova auto-classified all cells, but may have missed real hazards. Tap "See Missed Hazards" to review.';
        } else if (sel && uncertain && cellSurvey) {
          const remaining = allUncertainKeys.length;
          const idx = selKey ? allUncertainKeys.indexOf(selKey) + 1 : 1;
          this.dom.deviceInfo.textContent = '🔍 Reviewing ' + idx + '/' + remaining + ' uncertain cells. Read the Sensor Vote table below, then tap ⚠ Hazard or ✓ Safe.';
        } else if (sel && !uncertain) {
          this.dom.deviceInfo.textContent = '✅ Nova handled this cell automatically. Tap a yellow ? cell or use "Next uncertain" to review.';
        } else if (progress) {
          this.dom.deviceInfo.textContent = '🤖 Nova surveyed the site! Review ' + progress.uncertainRemaining + ' uncertain cells. Read the vote table and decide for each one.';
        } else {
          this.dom.deviceInfo.textContent = '🤖 Nova surveys the site. Yellow ? cells need you — read the sensor "code" below and decide Hazard or Safe.';
        }

        // Token counter
        if (lv.maxTokens < Infinity) {
          this.dom.tokensRemaining.textContent = Game.getTokensRemaining();
          this.dom.tokensSpent.textContent = `(Spent: ${Game.getTokensSpent()})`;
        }
      }

      // Lv6 Final Exam
      if (lv.id === 6) {
        const es = this._examState;
        const total = es ? es.totalRounds : 8;
        if (es && es.currentRound > 0) {
          this.dom.deviceInfo.textContent = '🧠 Round ' + Math.min(es.currentRound + 1, total) + '/' + total + ' | Correct: ' + es.conceptsCorrect + '/' + total;
        } else {
          this.dom.deviceInfo.textContent = '🏆 Final Exam: 8 concept challenges. Test your AI knowledge!';
        }
        this.dom.btnMark.classList.add('hidden');
        this.dom.actionRow.classList.add('hidden');
      }

      // Token counter
      if (lv.maxTokens < Infinity) {
        this.dom.tokensRemaining.textContent = Game.getTokensRemaining();
        this.dom.tokensSpent.textContent = `(Spent: ${Game.getTokensSpent()})`;
      }

      // Undo button
      this.dom.btnUndo.disabled = !Game.canUndo();

      // Enable/disable mark button (L2 & L3)
      const selected = Game.getSelectedCell();
      if (lv.id === 2) {
        // Show action row for Level 2 so btnMark is visible
        this.dom.actionRow.classList.toggle('hidden', false);
        if (selected) {
          const key = `${selected.row},${selected.col}`;
          const classified = Game.getLv2Classification(selected.row, selected.col);
          const confirmed = Game.getCellsConfirmedHazard().includes(key);
          if (confirmed) {
            this.dom.btnMark.disabled = true;
            this.dom.btnMark.textContent = '✅ Marked!';
          } else {
            this.dom.btnMark.disabled = (classified !== 'hazard') || Game.isComplete() || Game.hasConfirmedSurvey();
            this.dom.btnMark.textContent = '⚠️ Yes, Hazard!';
          }
        } else {
          this.dom.btnMark.disabled = true;
          this.dom.btnMark.textContent = '⚠️ Yes, Hazard!';
        }
      }
      if (lv.id === 3) {
        if (selected) {
          const confirmed = Game.getCellsConfirmedHazard().includes(
            `${selected.row},${selected.col}`
          );
          this.dom.btnMark.disabled = confirmed || Game.isComplete() || Game.hasConfirmedSurvey();
          this.dom.btnMark.textContent = confirmed ? '✅ Marked!' : '⚠️ Yes, Hazard!';
        } else {
          this.dom.btnMark.disabled = true;
          this.dom.btnMark.textContent = '⚠️ Yes, Hazard!';
        }
      }

      this.updateGrid();

      if (Game.isComplete()) {
        this.setIndicator('reporting', 'Complete');
      } else if (Game.hasConfirmedSurvey()) {
        this.setIndicator('analyzing', 'Reviewing');
      } else {
        this.setIndicator('scanning', 'Ready');
      }
    },

    setIndicator(state, label) {
      this.dom.indicatorDot.className = 'indicator-dot ' + state;
      this.dom.indicatorText.textContent = label;
    },

    // ── Feedback ──
    showFeedback(text, type) {
      this.dom.feedbackArea.classList.remove('hidden', 'feedback-success', 'feedback-error', 'feedback-info', 'feedback-warning');
      this.dom.feedbackArea.classList.add('feedback-' + (type || 'info'));
      this.dom.feedbackText.textContent = text;
      if (this.feedbackTimeout) clearTimeout(this.feedbackTimeout);
      if (type !== 'error') {
        this.feedbackTimeout = setTimeout(() => this.clearFeedback(), 3500);
      }
    },

    clearFeedback() {
      this.dom.feedbackArea.classList.add('hidden');
      this.dom.feedbackArea.classList.remove('feedback-success', 'feedback-error', 'feedback-info', 'feedback-warning');
      if (this.feedbackTimeout) { clearTimeout(this.feedbackTimeout); this.feedbackTimeout = null; }
    },

    /** Show a persistent popup for wrong-answer explanations. Closeable via button/X/Escape. */
    showFeedbackPopup(text, icon) {
      const popup = document.getElementById('feedback-popup');
      if (!popup) return;
      document.getElementById('feedback-popup-icon').textContent = icon || '⚠️';
      document.getElementById('feedback-popup-text').textContent = text;
      popup.classList.remove('hidden');
      const close = () => { popup.classList.add('hidden'); };
      document.getElementById('feedback-popup-close').onclick = close;
      document.getElementById('feedback-popup-btn').onclick = close;
      document.addEventListener('keydown', function handler(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', handler); } });
    },

    // ── Debug (hidden: long-press game title for 2s to activate) ──
    setupDebugTrigger() {
      const titleBar = document.querySelector('.game-title-bar');
      if (!titleBar) return;
      let pressTimer = null;

      titleBar.addEventListener('pointerdown', (e) => {
        pressTimer = setTimeout(() => {
          this.toggleDebug();
          pressTimer = null;
        }, 2000);
      });

      titleBar.addEventListener('pointerup', () => {
        if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
      });
      titleBar.addEventListener('pointerleave', () => {
        if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
      });
      titleBar.addEventListener('pointercancel', () => {
        if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
      });
    },

    toggleDebug() {
      if (this.debugActive) {
        this.debugActive = false;
        this.showFeedback('Debug mode off', 'info');
      } else {
        this.debugActive = true;
        const hazards = Game.debugRevealHazards();
        this.showFeedback(`DEBUG: Auto-training... Hazards: ${hazards.join(', ')}`, 'info');
        Game.debugAutoTrain();
        this.refreshUI();
        if (Game.isComplete()) {
          this.showLevelCompleteOverlay();
        }
      }
    },

    // ── Level Explanations (age 8-friendly with analogies) ──
    getExplanation(levelNum) {
      const exps = {
        1: {
          title: 'Day 1: Supervised Learning — Teach Nova what danger looks like!',
          body: `<p>🤖 <strong>Nova is like a robot baby.</strong> It knows nothing yet. You have to teach it what danger looks like!</p>
          <p><strong>Think of it like a fever thermometer:</strong></p>
          <ul>
            <li>When you're sick, the thermometer goes <strong>high</strong> = fever = danger.</li>
            <li>When you're healthy, the thermometer stays <strong>low</strong> = safe.</li>
            <li>There's a <strong>"Danger Line"</strong> on the thermometer. Above it = Hazard. Below it = Safe.</li>
          </ul>
          <p><strong>What to do:</strong></p>
          <ul>
            <li>Tap a glowing <strong>?</strong> cell on the map.</li>
            <li>Look at the chart. See the bar? It's like a thermometer reading.</li>
            <li><strong>Above the Danger Line</strong> → tap <strong>⚠ Hazard</strong>.</li>
            <li><strong>Below the Danger Line</strong> → tap <strong>✓ Safe</strong>.</li>
            <li>Do this for all 4 glowing cells.</li>
          </ul>
          <p><strong>Then Nova draws its OWN line</strong> based on what you taught it. If Nova makes mistakes (shows <strong>✗</strong>), just tap that cell and click the <strong>other</strong> button to correct it.</p>
          <div class="ai-insight">🤖 This is how AI learns — you show it examples, it figures out the rule. Like practicing spelling words until you know the pattern!</div>`,
        },
        2: {
          title: 'Day 2: Precision vs Recall — Like a volume knob for danger!',
          body: `<p>📻 <strong>Think of it like a radio volume knob.</strong> Turn it up and you hear everything — including static and noise. Turn it down and you only hear the loud, clear sounds.</p>
          <p><strong>What to do:</strong></p>
          <ul>
            <li><strong>Slide the Sensitivity knob</strong> left and right (1 to 12).</li>
            <li>Watch how the ▲ hazard markers on the grid change as you slide.</li>
            <li><strong>Higher sensitivity:</strong> Nova flags more as hazards. But some are false alarms — like hearing static and thinking it's music.</li>
            <li><strong>Lower sensitivity:</strong> Nova only flags big, clear hazards. But might miss small ones — like turning the volume down so much you miss the doorbell.</li>
            <li>When all 6 hazards show as ▲, tap <strong>Confirm Sensitivity</strong> to check. Too many false alarms? Lower the dial and try again!</li>
          </ul>
          <p><strong>The trick:</strong> No perfect setting exists. Like Goldilocks — not too sensitive, not too relaxed. <strong>Just right!</strong></p>
          <div class="ai-insight">🤖 This is called a <strong>tradeoff</strong>. Making the AI catch more hazards also makes it cry wolf more. Real AI systems face this all the time!</div>`,
        },
        3: {
          title: 'Day 3: Sensor Fusion — 3 views are better than 1!',
          body: `<p>👫 <strong>Think of 3 friends looking for a lost toy.</strong> One friend says "it's under the bed." Another says "I see it under the bed too!" The third says "no, it's in the closet." Who do you believe? The two who agree!</p>
          <p><strong>What to do:</strong></p>
          <ul>
            <li>Tap a cell — Nova shows readings from <strong>3 different sensors</strong>.</li>
            <li>Each sensor is like one friend — it sees things differently.</li>
            <li>A cell is a hazard only if <strong>2+ sensors agree</strong> it's dangerous.</li>
            <li>Check the agreement: "2/3 ✓" means it's confirmed. Tap <strong>Confirm Hazard</strong>.</li>
            <li>Some hazards are <strong>stealthy</strong> — they fool one sensor, but the other two catch them!</li>
          </ul>
          <p><strong>The idea:</strong> One sensor (or one person) can be wrong. But if 2 out of 3 agree, you can trust it. That's <strong>sensor fusion</strong>!</p>
          <div class="ai-insight">🤖 Self-driving cars use sensor fusion too — cameras, radar, and lasers all look at the road together. If 2 out of 3 see a person, the car stops!</div>`,
        },
        4: {
          title: 'Day 4: Human-in-the-Loop — Nova + You = Dream Team!',
          body: `<p>📝 <strong>Think of a teacher with a big stack of tests to grade.</strong> The easy questions (2+2=?) the teacher can grade automatically — the computer does it. But the hard questions (essays) need the teacher to read carefully. <strong>That's you!</strong></p>
          <p><strong>What to do:</strong></p>
          <ul>
            <li>Watch Nova <strong>scan</strong> the site (cells show "?" — Nova is thinking).</li>
            <li>After scanning, cells are colored like a traffic light:</li>
            <li><strong>🟢 Green ✓</strong> = Nova is confident it's safe. Handled automatically.</li>
            <li><strong>🔴 Red ⚠</strong> = Nova is confident it's a hazard. Handled automatically.</li>
            <li><strong>🟡 Yellow ?</strong> = Nova is unsure — like a hard essay question. <strong>You decide!</strong></li>
            <li>Tap a yellow cell. Check the 3 sensor readings below. Tap <strong>Hazard</strong> or <strong>Safe</strong>.</li>
            <li>⚠️ If you miss a real hazard, the <strong>building collapses!</strong></li>
          </ul>
          <p><strong>The idea:</strong> Nova handles the easy stuff automatically. You only check the hard ones. This is called <strong>human-in-the-loop</strong> — like how autopilot flies the plane but the pilot takes over in tricky weather!</p>
          <div class="ai-insight">🤖 Real AI systems use this all the time. The AI recommends, the human decides. It's safer and smarter than either one alone!</div>`,
        },
        5: {
          title: 'Day 5: Autonomous AI — Nova goes solo!',
          body: `<p>🏗️ <strong>Remember why Nova exists?</strong> We need to check the ground for hazards <strong>BEFORE</strong> we build a building. If we miss a hazard, the building could crack or collapse!</p>
          <p>Nova will now survey a new piece of land ALL BY ITSELF using everything you taught it.</p>
          <p><strong>Watch carefully:</strong></p>
          <ul>
            <li>Nova checks each square of land, one by one — top to bottom, left to right.</li>
            <li>Watch the <strong>Danger Meter</strong> on the right. It shows the signal reading.</li>
            <li>If the signal is <strong>above the Danger Line</strong> → 🚨 <strong>HAZARD!</strong> Nova marks it with ▲ and sounds an alert.</li>
            <li>If the signal is <strong>below the Danger Line</strong> → ✅ Safe. Nova marks it with · and moves on.</li>
            <li>Count how many hazards Nova finds!</li>
          </ul>
          <p><strong>At the end:</strong> Nova gives a clear verdict — is the land <strong>safe to build on</strong> or not?</p>
          <p><strong>The big idea:</strong> Nova started knowing nothing (Level 1). You taught it, tuned it, helped it through noise, supervised it. Now it can survey land on its own — just like a real AI used in construction!</p>
          <div class="ai-insight">🤖 Real construction companies use AI to survey land before building. The AI finds underground hazards so humans can build safely. You just trained one!</div>`,
        },
        6: {
          title: 'Day 6: AI Mastery Exam — 8 concept challenges!',
          body: `<p>🏆 <strong>Time to prove what you've learned!</strong> Nova has 8 AI concept challenges for you. Each one tests a different AI skill you used during the survey missions.</p>
          <p><strong>What to do:</strong></p>
          <ul>
            <li>Read each crisis scenario carefully.</li>
            <li>Pick the right AI approach from the 4 choices.</li>
            <li>After each answer, read the AI concept explanation.</li>
            <li>Aim for 7-8 correct to get 3 stars!</li>
          </ul>
          <p><strong>Concepts covered:</strong> Supervised Learning, Precision & Recall, Sensor Fusion, Human-in-the-Loop, Autonomous AI, Optimization, Anomaly Detection, and Fairness & Bias.</p>
          <div class="ai-insight">🤖 You've been training Nova all along — but Nova was training YOU too! These 8 concepts are the foundation of all modern AI.</div>`,
        },
      };
      return exps[levelNum] || null;
    },

    showExplanation() {
      const level = Game.getCurrentLevel();
      if (!level) return;
      const exp = this.getExplanation(level.id);
      if (!exp) return;
      this.dom.explanationTitle.textContent = exp.title;
      this.dom.explanationBody.innerHTML = exp.body;
      this.dom.explanationOverlay.classList.remove('hidden');
    },

    hideExplanation() {
      this.dom.explanationOverlay.classList.add('hidden');
    },

    // ── State Change Callback ──
    onGameStateChange() {
      if (this.currentScreen === 'game') {
        this.refreshUI();
      }
    },
  };

  // ── Boot ──
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => App.init());
  } else {
    App.init();
  }
})();
