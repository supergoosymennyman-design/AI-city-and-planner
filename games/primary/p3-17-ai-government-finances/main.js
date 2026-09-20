/**
 * main.js — UI Controller for Compute Fee Meter
 * Handles rendering, event binding, and state-driven UI updates.
 */

// ── Inline SVG Icon Library — replaces structural emojis ──
const Svg = {
  gear: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>',

  wrench: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="7.5" cy="16.5" r="4"/><line x1="10.5" y1="13.5" x2="20" y2="4"/><rect x="12" y="1" width="9" height="6" rx="1.5"/></svg>',

  transcript: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="3" width="16" height="18" rx="2"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg>',

  nova: '<svg viewBox="0 0 32 32" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><circle cx="16" cy="16" r="11"/><circle cx="16" cy="16" r="4"/><line x1="16" y1="5" x2="16" y2="9"/><line x1="16" y1="23" x2="16" y2="27"/><line x1="5" y1="16" x2="9" y2="16"/><line x1="23" y1="16" x2="27" y2="16"/></svg>',

  docIcon: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="11" x2="15" y2="11"/><line x1="9" y1="15" x2="12" y2="15"/></svg>',

  chartIcon: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="1"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="9" x2="9" y2="21"/><line x1="15" y1="9" x2="15" y2="21"/></svg>',

  play: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><polygon points="6,3 20,12 6,21"/></svg>',

  processing: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><polyline points="12,6 12,12 16,14"/></svg>',

  retry: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1,4 1,10 7,10"/><path d="M3.5 15a9 9 0 1 0 2.1-9.4L1 10"/></svg>',

  trophy: '<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h2"/><path d="M18 9h2a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/><path d="M7 3h10v5a5 5 0 0 1-10 0V3z"/></svg>',

  warning: '<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',

  closeX: '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
};

const UI = (() => {
  'use strict';

  // ── DOM Refs ──
  let els = {};

  function cacheDom() {
    els = {
      // Top bar
      gameTitle: document.getElementById('game-title'),
      levelTabs: document.getElementById('level-tabs'),
      scoreDisplay: document.getElementById('score-display'),
      settingsToggle: document.getElementById('settings-toggle'),
      transcriptToggle: document.getElementById('transcript-toggle'),
      debugBtn: document.getElementById('debug-btn'),

      // Dashboard
      dashboard: document.getElementById('dashboard'),
      fileQueue: document.getElementById('file-queue'),
      ramBar: document.getElementById('ram-bar'),
      ramValue: document.getElementById('ram-value'),
      ramMeter: document.getElementById('ram-meter'),
      loadBar: document.getElementById('load-bar'),
      loadValue: document.getElementById('load-value'),
      loadMeter: document.getElementById('load-meter'),
      fairnessBar: document.getElementById('fairness-bar'),
      fairnessValue: document.getElementById('fairness-value'),
      fairnessMeter: document.getElementById('fairness-meter'),
      debugAnalytics: document.getElementById('debug-analytics'),

      // Controls
      controls: document.getElementById('controls'),
      pageSlider: document.getElementById('page-slider'),
      pageSliderGroup: document.getElementById('page-slider-group'),
      pageSliderValue: document.getElementById('page-slider-value'),
      ramSlider: document.getElementById('ram-slider'),
      ramSliderGroup: document.getElementById('ram-slider-group'),
      ramSliderValue: document.getElementById('ram-slider-value'),
      tokenCount: document.getElementById('token-count'),
      tokenTarget: document.getElementById('token-target'),
      costMatchValue: document.getElementById('cost-match-value'),
      costMatchInfo: document.getElementById('cost-match-info'),
      costMatchPanel: document.getElementById('cost-match-panel'),
      timerDisplay: document.getElementById('timer-display'),
      timerValue: document.getElementById('timer-value'),
      actionBtn: document.getElementById('action-btn'),

      // Formula panel
      formulaPanel: document.getElementById('formula-panel'),
      formulaExpression: document.getElementById('formula-expression'),
      formulaCalculation: document.getElementById('formula-calculation'),
      formulaTarget: document.getElementById('formula-target'),
      formulaHint: document.getElementById('formula-hint'),

      // Instruction
      instructionBar: document.getElementById('instruction-bar'),
      instructionText: document.getElementById('instruction-text'),
      levelBadge: document.getElementById('level-badge'),
      novaStatus: document.getElementById('nova-status'),

      // Nova knowledge panel
      novaKnowledgePanel: document.getElementById('nova-knowledge-panel'),
      novaKnowledgeFill: document.getElementById('nova-knowledge-fill'),
      novaKnowledgeText: document.getElementById('nova-knowledge-text'),
      novaLessonDisplay: document.getElementById('nova-lesson-display'),

      // Nova
      novaAvatar: document.getElementById('nova-avatar'),
      novaSpeechText: document.getElementById('nova-speech-text'),
      textInputArea: document.getElementById('text-input-area'),
      textInput: document.getElementById('nova-text-input'),
      textSendBtn: document.getElementById('text-send-btn'),

      // Overlays
      resultOverlay: document.getElementById('result-overlay'),
      crashOverlay: document.getElementById('crash-overlay'),
      toastContainer: document.getElementById('toast-container'),
      levelIntroPopup: document.getElementById('level-intro-popup'),
      liBadge: document.getElementById('li-badge'),
      liTitle: document.getElementById('li-title'),
      liTask: document.getElementById('li-task'),
      liAilesson: document.getElementById('li-ailesson'),
      liNovalesson: document.getElementById('li-novalesson'),
      liClose: document.getElementById('li-close'),
      liStartBtn: document.getElementById('li-start-btn'),

      // Result card
      resultIcon: document.getElementById('result-icon'),
      resultTitle: document.getElementById('result-title'),
      resultStars: document.getElementById('result-stars'),
      resultMessage: document.getElementById('result-message'),
      resultMetrics: document.getElementById('result-metrics'),
      retryBtn: document.getElementById('retry-btn'),
      nextBtn: document.getElementById('next-btn'),
      resultMenuBtn: document.getElementById('result-menu-btn'),

      // Comic (handled directly via ID)
    };
  }

  // ── Init ──
  let _lastLevelClick = 0;

  function init() {
    cacheDom();
    bindEvents();
    buildLevelTabs();
    updateAll(Game.getState());
  }

  function bindEvents() {
    // Sliders
    if (els.pageSlider) {
      els.pageSlider.addEventListener('input', () => {
        Game.setPageMultiplier(parseFloat(els.pageSlider.value));
      });
      els.pageSlider.addEventListener('change', () => {
        els.pageSlider.value = Game.getState().pageMultiplier;
      });
    }
    if (els.ramSlider) {
      els.ramSlider.addEventListener('input', () => {
        Game.setRamPremium(parseFloat(els.ramSlider.value));
      });
      els.ramSlider.addEventListener('change', () => {
        els.ramSlider.value = Game.getState().ramPremium;
      });
    }

    // Action button
    if (els.actionBtn) {
      els.actionBtn.addEventListener('click', () => {
        const state = Game.getState();
        if (state.phase === 'idle') {
          Game.startLevel();
        } else if (state.phase === 'complete' || state.phase === 'failed') {
          Game.retryLevel();
          Game.startLevel();
        }
      });
    }

    // Comic intro — tap to advance panels
    const comicOverlay = document.getElementById('comic-intro');
    if (comicOverlay) {
      comicOverlay.addEventListener('click', () => {
        if (window.NovaComic) NovaComic.handleClick();
      });
    }

    // Level tabs (delegated) — debounced to prevent rapid navigation
    if (els.levelTabs) {
      els.levelTabs.addEventListener('click', (e) => {
        const now = Date.now();
        if (now - _lastLevelClick < 400) return;
        _lastLevelClick = now;
        const tab = e.target.closest('.level-tab');
        if (tab) {
          const lv = parseInt(tab.dataset.level);
          if (lv) {
            Game.goToLevel(lv);
            updateAll(Game.getState());
            showLevelIntro(lv);
          }
        }
      });
    }

    // Settings
    if (els.settingsToggle) els.settingsToggle.addEventListener('click', () => Settings.open());

    // Transcript
    if (els.transcriptToggle) els.transcriptToggle.addEventListener('click', () => Transcript.toggle());

    // Debug
    if (els.debugBtn) els.debugBtn.addEventListener('click', () => {
      const active = Game.toggleDebug();
      els.debugBtn.classList.toggle('active', active);
      showToast(active ? 'Debug analytics ON' : 'Debug analytics OFF', 'info');
      updateAll(Game.getState());
    });

    // Nova avatar tap
    if (els.novaAvatar) els.novaAvatar.addEventListener('click', () => {
      Conversation.showTextInput && Conversation.showTextInput();
    });

    // Result buttons
    if (els.retryBtn) els.retryBtn.addEventListener('click', () => {
      els.resultOverlay.classList.remove('active');
      Game.retryLevel();
      updateAll(Game.getState());
    });
    if (els.nextBtn) els.nextBtn.addEventListener('click', () => {
      els.resultOverlay.classList.remove('active');
      Game.goNextLevel();
      updateAll(Game.getState());
    });
    if (els.resultMenuBtn) els.resultMenuBtn.addEventListener('click', () => {
      els.resultOverlay.classList.remove('active');
      updateAll(Game.getState());
    });

    // Crash overlay — dismiss on click
    if (els.crashOverlay) els.crashOverlay.addEventListener('click', () => {
      els.crashOverlay.classList.remove('active');
    });

    // Level intro popup
    function hideLevelIntro() {
      els.levelIntroPopup.style.display = 'none';
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    }
    if (els.liClose) els.liClose.addEventListener('click', hideLevelIntro);
    if (els.liStartBtn) els.liStartBtn.addEventListener('click', () => {
      hideLevelIntro();
      // User then presses the main Start button
    });
    document.addEventListener('keydown', function liEsc(e) {
      if (e.key === 'Escape' && els.levelIntroPopup && els.levelIntroPopup.style.display === 'flex') {
        hideLevelIntro();
      }
    });
  }

  // ── Level Tabs ──
  function buildLevelTabs() {
    if (!els.levelTabs) return;
    els.levelTabs.innerHTML = '';
    const levelNames = ['Scaling', 'Complexity', 'Balance', 'Fairness', 'Pressure', 'Optimize', 'Solo', 'Enterprise', 'Exam'];
    for (let i = 1; i <= 9; i++) {
      const tab = document.createElement('button');
      tab.className = 'level-tab';
      tab.dataset.level = i;
      tab.textContent = 'L' + i;
      tab.title = levelNames[i - 1];
      tab.setAttribute('aria-label', 'Level ' + i + ': ' + levelNames[i - 1]);
      els.levelTabs.appendChild(tab);
    }
  }

  // ── State → UI ──
  function updateAll(state) {
    updateLevelTabs(state);
    updateScoreDisplay(state);
    updateSliders(state);
    updateNovaKnowledge(state);
    updateFormulaDisplay(state);
    updateMeters(state);
    updateFileQueue(state);
    updateTokenDisplay(state);
    updateCostMatch(state);
    updateTimer(state);
    updateActionButton(state);
    updateInstruction(state);
    updateDebugAnalytics(state);
    updateCrashOverlay(state);
  }

  function updateLevelTabs(state) {
    const tabs = els.levelTabs ? els.levelTabs.querySelectorAll('.level-tab') : [];
    tabs.forEach(tab => {
      const lv = parseInt(tab.dataset.level);
      tab.classList.toggle('active', lv === state.currentLevel);
      tab.classList.toggle('completed', state.levelScores[lv] && state.levelScores[lv].passed);
    });
  }

  function updateScoreDisplay(state) {
    if (!els.scoreDisplay) return;
    const total = Object.values(state.levelScores).reduce((s, l) => s + (l.stars || 0), 0);
    if (total > 0) {
      els.scoreDisplay.textContent = '\u2605'.repeat(Math.min(total, 10));
    } else {
      els.scoreDisplay.textContent = '';
    }
  }

  function updateSliders(state) {
    const level = state.level;
    if (!level) return;

    const isNovaAuto = level.isNovaAuto && state.phase === 'running';
    const isDisabled = (state.phase === 'complete' || state.phase === 'failed' || isNovaAuto);

    // Page multiplier slider
    if (els.pageSliderGroup && els.pageSlider && els.pageSliderValue) {
      if (level.sliderPage) {
        els.pageSliderGroup.style.display = '';
        els.pageSlider.min = level.pageMin;
        els.pageSlider.max = level.pageMax;
        els.pageSlider.step = 1;
        els.pageSlider.value = state.pageMultiplier;
        els.pageSlider.disabled = isDisabled;
        els.pageSliderValue.textContent = state.pageMultiplier + 'x' + (isNovaAuto ? ' 🤖' : '');
      } else {
        els.pageSliderGroup.style.display = 'none';
      }
    }

    // RAM premium slider
    if (els.ramSliderGroup && els.ramSlider && els.ramSliderValue) {
      if (level.sliderRam) {
        els.ramSliderGroup.style.display = '';
        els.ramSlider.min = level.ramMin;
        els.ramSlider.max = level.ramMax;
        els.ramSlider.step = 1;
        els.ramSlider.value = state.ramPremium;
        els.ramSlider.disabled = isDisabled;
        els.ramSliderValue.textContent = state.ramPremium + 'x' + (isNovaAuto ? ' 🤖' : '');
      } else {
        els.ramSliderGroup.style.display = 'none';
      }
    }
  }

  function updateMeters(state) {
    // RAM meter — shows current file RAM usage, or max of processed
    const cf = Game.getCurrentFile();
    const ramPct = cf ? cf.ram : 0;
    if (els.ramBar) {
      els.ramBar.style.width = ramPct + '%';
      els.ramBar.style.background = ramPct >= 80 ? 'var(--color-danger)' :
        ramPct >= 50 ? 'var(--color-warning)' : 'var(--color-success)';
    }
    if (els.ramValue) els.ramValue.textContent = Math.round(ramPct) + '%';
    if (els.ramMeter) {
      els.ramMeter.classList.toggle('warning', ramPct >= 50 && ramPct < 80);
      els.ramMeter.classList.toggle('danger', ramPct >= 80);
    }

    // System load
    const load = clamp0(state.systemLoad);
    if (els.loadBar) {
      els.loadBar.style.width = load + '%';
    }
    if (els.loadValue) els.loadValue.textContent = Math.round(load) + '%';
    if (els.loadMeter) {
      els.loadMeter.classList.toggle('warning', load >= 50 && load < 80);
      els.loadMeter.classList.toggle('danger', load >= 80);
    }

    // Fairness
    if (els.fairnessBar) {
      els.fairnessBar.style.width = state.fairnessRating + '%';
    }
    if (els.fairnessValue) els.fairnessValue.textContent = Math.round(state.fairnessRating) + '%';
    if (els.fairnessMeter) {
      els.fairnessMeter.style.display = (state.level && state.level.fairnessRequired) ? '' : 'none';
    }
    if (els.fairnessBar) {
      els.fairnessBar.style.background = state.fairnessRating >= 75 ? 'var(--color-fairness)' : 'var(--color-danger)';
    }
  }

  function updateFileQueue(state) {
    if (!els.fileQueue) return;
    const allFiles = state.uploadQueue;
    if (!allFiles || allFiles.length === 0) {
      els.fileQueue.innerHTML = '<div class="empty-queue">No files queued. Press Start to begin.</div>';
      return;
    }

    // Determine level target — use targetTokens if set, otherwise use physical cost
    const level = state.level;
    const levelTarget = (level && level.targetTokens > 0) ? level.targetTokens : null;

    // Show processed + current + upcoming
    let html = '';
    allFiles.forEach((f, i) => {
      const billed = f._previewBilled || Game.calcBilledFee(f.pages, f.ram, state.pageMultiplier, state.ramPremium);
      const physicalCost = Game.calcPhysicalCost(f.pages, f.ram);
      const target = levelTarget || physicalCost;
      const diff = billed - target;
      const diffPct = target > 0 ? Math.round((billed / target) * 100) : 0;
      const diffClass = diffPct > 105 ? 'over' : diffPct < 95 ? 'under' : 'good';
      const diffText = diff > 5 ? '+ over' : diff < -5 ? '- under' : 'ok';

      const statusClass = f.status === 'processing' ? 'processing' :
        f.status === 'completed' ? 'completed' : 'pending';
      const statusTag = f.status === 'processing' ? 'PROCESSING' :
        f.status === 'completed' ? 'DONE' : 'PENDING';

      // Citizen label if available
      let citizenHtml = '';
      if (f.citizen && window.Citizens) {
        const c = Citizens.get(f.citizen);
        if (c) {
          citizenHtml = '<span class="file-citizen">' + c.emoji + ' ' + escapeHtml(c.shortName) + '</span>';
        }
      }

      const icon = f.name.endsWith('.xlsx') ? Svg.chartIcon : Svg.docIcon;

      html += '<div class="file-card ' + statusClass + '">' +
        '<div class="file-icon">' + icon + '</div>' +
        '<div class="file-info">' +
          (citizenHtml ? citizenHtml : '') +
          '<div class="file-name">' + escapeHtml(f.name) + '</div>' +
          '<div class="file-meta">' +
            '<span>' + f.pages + 'p</span>' +
            '<span>RAM ' + f.ram + '%</span>' +
            '<span class="meta-bill">Bill: ' + Math.round(billed) + '</span>' +
            '<span class="meta-cost">' + (levelTarget ? 'Target' : 'Cost') + ': ' + Math.round(target) + '</span>' +
            '<span class="meta-diff ' + diffClass + '">' + diffText + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="file-status ' + statusClass + '">' + statusTag + '</div>' +
      '</div>';
    });
    els.fileQueue.innerHTML = html;
  }

  function updateTokenDisplay(state) {
    if (els.tokenCount) {
      els.tokenCount.textContent = Math.round(state.tokensCollected);
    }
    const level = state.level;
    if (els.tokenTarget && level && level.targetTokens > 0) {
      els.tokenTarget.textContent = 'Target: ' + level.targetTokens;
      els.tokenTarget.style.display = '';
    } else if (els.tokenTarget) {
      els.tokenTarget.style.display = 'none';
    }
  }

  function updateCostMatch(state) {
    if (!els.costMatchPanel) return;
    const level = state.level;

    if (level && level.costMatchRequired) {
      els.costMatchPanel.style.display = '';
      const totalPhy = state.totalPhysicalCost;
      const matchPct = totalPhy > 0 ? Math.round((state.totalBilled / totalPhy) * 100) : 100;
      if (els.costMatchValue) els.costMatchValue.textContent = matchPct + '%';
      if (els.costMatchInfo) els.costMatchInfo.textContent = 'Cost match (target \u226595%)';
      if (els.costMatchPanel) {
        els.costMatchPanel.classList.toggle('good', matchPct >= 95);
        els.costMatchPanel.classList.toggle('warn', matchPct >= 80 && matchPct < 95);
        els.costMatchPanel.classList.toggle('bad', matchPct < 80);
      }
    } else {
      // Show simple cost comparison
      if (state.totalBilled > 0) {
        els.costMatchPanel.style.display = '';
        const matchPct = state.totalPhysicalCost > 0 ?
          Math.round((state.totalBilled / state.totalPhysicalCost) * 100) : 100;
        if (els.costMatchValue) els.costMatchValue.textContent = matchPct + '%';
        if (els.costMatchInfo) els.costMatchInfo.textContent = 'Billed vs Physical Cost';
        els.costMatchPanel.classList.toggle('good', matchPct >= 90 && matchPct <= 110);
        els.costMatchPanel.classList.toggle('warn', matchPct >= 70 && matchPct < 90);
        els.costMatchPanel.classList.toggle('bad', matchPct < 70 || matchPct > 130);
      } else {
        els.costMatchPanel.style.display = 'none';
      }
    }
  }

  function updateTimer(state) {
    if (!els.timerDisplay || !els.timerValue) return;
    const level = state.level;
    if (level && level.duration) {
      els.timerDisplay.style.display = '';
      els.timerValue.textContent = state.timeRemaining + 's';
      els.timerValue.classList.toggle('urgent', state.timeRemaining <= 10);
    } else {
      els.timerDisplay.style.display = 'none';
    }
  }

  function updateActionButton(state) {
    if (!els.actionBtn) return;
    const isNovaAuto = state.level && state.level.isNovaAuto;
    const isExam = state.level && state.level.isExam;
    if (state.phase === 'idle') {
      if (isExam) {
        els.actionBtn.innerHTML = Svg.play + ' Start Exam';
        els.actionBtn.disabled = false;
      } else if (isNovaAuto) {
        els.actionBtn.innerHTML = Svg.play + ' Watch Nova Demonstrate';
        els.actionBtn.disabled = false;
      } else {
        els.actionBtn.innerHTML = Svg.play + ' Start Processing Files';
        els.actionBtn.disabled = false;
      }
    } else if (state.phase === 'running') {
      if (isNovaAuto) {
        els.actionBtn.innerHTML = Svg.processing + ' Nova Computing...';
      } else {
        els.actionBtn.innerHTML = Svg.processing + ' Processing...';
      }
      els.actionBtn.disabled = true;
    } else if (state.phase === 'complete' || state.phase === 'failed') {
      els.actionBtn.innerHTML = Svg.retry + ' Replay Level';
      els.actionBtn.disabled = false;
    }
  }

  function updateInstruction(state) {
    if (!els.instructionBar) return;
    const level = state.level;
    if (level) {
      if (els.levelBadge) els.levelBadge.textContent = 'L' + level.id;
      if (els.instructionText) {
        let text = level.name + ': ' + level.instruction;
        // Lv6: Override to show Nova is driving
        if (level.isNovaAuto) {
          if (state.phase === 'running') {
            text = '🤖  ...';
          } else {
            text = level.instruction;
          }
        }
        // Split into task + AI lesson (separated by 🎓)
        const taskMatch = text.match(/^(.*?)(🎓.*)$/);
        if (taskMatch) {
          els.instructionText.innerHTML = '<div class="instr-task">' + taskMatch[1] + '</div><div class="instr-ailesson">' + taskMatch[2] + '</div>';
        } else {
          els.instructionText.innerHTML = '<div class="instr-task">' + text + '</div>';
        }
      }
      // Nova thinking indicator for level 6
      if (els.novaStatus) {
        if (level.isNovaAuto && state.phase === 'running') {
          els.novaStatus.style.display = 'inline';
          els.novaStatus.textContent = '🧠 Nova thinking...';
        } else {
          els.novaStatus.style.display = 'none';
        }
      }
    }
  }

  // ── Show level intro popup with description + AI lesson + TTS ──
  function showLevelIntro(lv) {
    if (!els.levelIntroPopup) return;
    const level = Game.LEVELS[lv];
    if (!level) return;
    const instr = level.instruction || '';
    const taskMatch = instr.match(/^(.*?)(🎓.*)$/);
    const task = taskMatch ? taskMatch[1].trim() : instr;
    const aiLesson = taskMatch ? taskMatch[2].trim() : '';
    const novaLesson = Game.getNovaLesson ? Game.getNovaLesson(lv) : '';

    els.liBadge.textContent = 'L' + lv;
    els.liTitle.textContent = level.name || 'Day ' + lv;
    els.liTask.textContent = task;
    els.liAilesson.innerHTML = aiLesson ? '<strong>🧠 AI Lesson:</strong> ' + aiLesson.replace('🎓 ','') : '';
    els.liNovalesson.innerHTML = novaLesson ? '<strong>📖 Nova learns:</strong> ' + novaLesson : '';
    els.levelIntroPopup.style.display = 'flex';

    // TTS: read the level intro aloud
    const ttsText = level.name + '. ' + task + '. ' + aiLesson.replace('🎓 ','') + '. ' + novaLesson;
    if (ttsText && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(ttsText);
      u.rate = 0.85; u.volume = 0.85;
      const v = window.speechSynthesis.getVoices();
      const p = v.find(function(v){return v.name.includes('Google UK')||v.name.includes('Samantha')||v.name.includes('Female')});
      if (p) u.voice = p;
      window.speechSynthesis.speak(u);
    }
  }

  function updateNovaKnowledge(state) {
    if (!els.novaKnowledgePanel) return;
    const progress = Game.getNovaProgress();
    const knowledge = Game.getNovaKnowledge();

    // Update progress bar
    if (els.novaKnowledgeFill) {
      els.novaKnowledgeFill.style.width = progress.pct + '%';
    }

    // Update text — explicit AI concept progress
    const conceptLabels = ['None yet', 'Scaling', 'Complexity', 'Balance', 'Fairness', 'Pressure', 'Solo', 'Enterprise'];
    const learnedLabel = conceptLabels[progress.learned] || conceptLabels[0];
    if (els.novaKnowledgeText) {
      if (progress.learned === 0) {
        els.novaKnowledgeText.innerHTML = 'Nova knows nothing about AI pricing yet. 🎯 <strong>Teach her Day 1:</strong> AI Learns to Scale';
      } else if (progress.learned >= 7) {
        els.novaKnowledgeText.innerHTML = '🏆 <strong>ALL 7 AI concepts mastered!</strong> Nova is enterprise-ready!';
      } else {
        const nextLabel = conceptLabels[progress.learned + 1] || 'Enterprise';
        els.novaKnowledgeText.innerHTML = '✅ <strong>' + learnedLabel + '</strong> — ' + progress.learned + '/7 learned. Next: <strong>' + nextLabel + '</strong>';
      }
    }

    // Concept tracker grid — shows all 7 concept badges
    const tracker=document.getElementById('conceptTrackerL17');
    if(tracker){
      const concepts={1:'Scaling',2:'Complexity',3:'Balance',4:'Fairness',5:'Pressure',6:'Solo',7:'Enterprise'};
      const icons={1:'⚖️',2:'🧠',3:'🔄',4:'❤️',5:'⏱️',6:'🤖',7:'🚀'};
      let th='';
      for(let i=1;i<=7;i++){
        const done=!!state.novaKnowledge[i];
        th+='<div class="concept-badge'+(done?' done':'')+'"><span class="cb-icon">'+(done?icons[i]:'○')+'</span><span class="cb-label">'+concepts[i]+'</span></div>';
      }
      tracker.innerHTML=th;
    }

    // Show lesson for current level if completed
    if (els.novaLessonDisplay) {
      const currentLesson = Game.getNovaLesson(state.currentLevel);
      if (state.levelScores[state.currentLevel] && state.levelScores[state.currentLevel].passed && currentLesson) {
        els.novaLessonDisplay.style.display = 'block';
        const isLv6 = state.currentLevel === 6;
        els.novaLessonDisplay.innerHTML = isLv6
          ? '🧠 <strong>Nova mastered:</strong> ' + currentLesson
          : '📖 <strong>Nova learned:</strong> ' + currentLesson;
      } else if (state.currentLevel < 6 && state.novaKnowledge[state.currentLevel]) {
        els.novaLessonDisplay.style.display = 'block';
        els.novaLessonDisplay.innerHTML = '📖 <strong>Nova learned:</strong> ' + (Game.getNovaLesson(state.currentLevel) || '');
      } else {
        els.novaLessonDisplay.style.display = 'none';
      }
    }
  }

  function updateFormulaDisplay(state) {
    if (!els.formulaPanel) return;
    const level = state.level;
    if (!level || level.isNovaAuto) {
      els.formulaPanel.style.display = 'none';
      return;
    }
    els.formulaPanel.style.display = '';

    // Get current file info
    const cf = Game.getCurrentFile ? Game.getCurrentFile() : null;
    if (!cf) {
      els.formulaCalculation.textContent = 'Press Start to see the pricing breakdown.';
      els.formulaTarget.textContent = '';
      els.formulaHint.textContent = '';
      return;
    }

    const pm = state.pageMultiplier;
    const rp = state.ramPremium;
    const pages = cf.pages;
    const ram = cf.ram;

    // Calculate
    const billedFee = Game.calcBilledFee(pages, ram, pm, rp);
    const physicalCost = Game.calcPhysicalCost(pages, ram);

    // Use level's target token amount if available, otherwise use physical cost
    const targetTokens = level.targetTokens || physicalCost;
    const diffFromTarget = billedFee - targetTokens;
    const diffFromPhys = billedFee - physicalCost;

    // For the diff percentage, compare to the actual target
    const diffPct = targetTokens > 0 ? Math.round((billedFee / targetTokens) * 100) : 0;

    // Show the formula with current numbers
    els.formulaCalculation.innerHTML =
      '<span class="formula-row">' +
        '<span class="formula-part">' + pages + ' pages × <strong>' + pm + 'x</strong></span>' +
        '<span class="formula-plus">+</span>' +
        '<span class="formula-part">' + ram + '% RAM × <strong>' + rp + 'x</strong></span>' +
        '<span class="formula-eq">=</span>' +
        '<span class="formula-result ' + (diffPct > 105 ? 'over' : diffPct < 95 ? 'under' : 'good') + '">' +
          Math.round(billedFee) + ' tokens' +
        '</span>' +
      '</span>';

    // Show target and comparison against the level's actual target
    const diffText = diffFromTarget > 0
      ? '↑ ' + Math.round(diffFromTarget) + ' over'
      : diffFromTarget < 0
      ? '↓ ' + Math.round(Math.abs(diffFromTarget)) + ' under'
      : '✓ Exact match!';
    const diffClass = diffFromTarget > 5 ? 'over' : diffFromTarget < -5 ? 'under' : 'good';
    const targetLabel = level.targetTokens ? 'Target' : 'Compute cost';

    els.formulaTarget.innerHTML =
      targetLabel + ': <strong>' + Math.round(targetTokens) + '</strong> tokens ' +
      '(<span class="diff-indicator ' + diffClass + '">' + diffText + '</span>)';

    // Also show physical cost as reference if it differs from target
    if (level.targetTokens && Math.abs(level.targetTokens - physicalCost) > 1) {
      els.formulaTarget.innerHTML +=
        '<br><span class="formula-physical">Compute cost: ' + Math.round(physicalCost) + ' tokens</span>';
    }

    // Show pricing hint based on difference from level target
    if (diffFromTarget > 50) {
      els.formulaHint.innerHTML = '↓ Too high! Lower the slider' + (level.sliderRam ? 's' : '') + ' to match the target.';
      els.formulaHint.className = 'formula-hint hint-over';
    } else if (diffFromTarget < -50) {
      els.formulaHint.innerHTML = '↑ Too low! Raise the ' + (level.sliderPage ? 'Page Multiplier' : 'RAM Premium') + ' slider.';
      els.formulaHint.className = 'formula-hint hint-under';
    } else if (diffFromTarget > 5) {
      els.formulaHint.innerHTML = 'Close! Try lowering slightly to hit ' + Math.round(targetTokens) + '.';
      els.formulaHint.className = 'formula-hint hint-warn';
    } else if (diffFromTarget < -5) {
      els.formulaHint.innerHTML = 'Close! Try raising slightly to hit ' + Math.round(targetTokens) + '.';
      els.formulaHint.className = 'formula-hint hint-warn';
    } else {
      els.formulaHint.innerHTML = 'On target! This fee meets the goal.';
      els.formulaHint.className = 'formula-hint hint-good';
    }

    // Guided level (L6): override with optimal hint
    if (level.slowGuided && cf) {
      const opt = Game.getOptimalHint(cf.pages, cf.ram);
      els.formulaHint.innerHTML = '📊 <b>Optimal:</b> Set PM=<strong>' + opt.pm +
        '</strong>, RP=<strong>' + opt.rp + '</strong> → billedFee = ' + cf.pages + '×' + opt.pm +
        ' + ' + cf.ram + '×' + opt.rp + ' = ' + opt.billedFee +
        ' (physical cost = ' + opt.physicalCost + '). <b>Cost match: ' + opt.costMatch + '%</b>';
      els.formulaHint.className = 'formula-hint hint-good';
    }
  }

  function updateDebugAnalytics(state) {
    if (!els.debugAnalytics) return;
    if (state.debugMode) {
      els.debugAnalytics.textContent = Game.getDebugAnalytics();
      els.debugAnalytics.classList.add('show');
    } else {
      els.debugAnalytics.classList.remove('show');
    }
  }

  function updateCrashOverlay(state) {
    if (!els.crashOverlay) return;
    if (state.crashes > 0 && state.phase === 'running') {
      els.crashOverlay.classList.add('active');
      Audio.playCrash();
      setTimeout(() => els.crashOverlay.classList.remove('active'), 1200);
    }
  }

  // ── Level Complete ──
  function showLevelResult(result, state) {
    if (!els.resultOverlay) return;

    if (result.passed) {
      els.resultIcon.innerHTML = '<span style="color:var(--color-token)">' + Svg.trophy + '</span>';
      els.resultTitle.textContent = state.currentLevel === 6
        ? '🎯 Optimal Pricing Mastered!'
        : state.currentLevel === 7
        ? '🎉 Nova Masters the Billing System!'
        : state.currentLevel === 8
        ? '🏆 Nova is Enterprise Ready!'
        : state.currentLevel === 9
        ? '📋 Final Exam Complete!'
        : 'Level ' + state.currentLevel + ' Complete!';
      els.resultStars.textContent = '\u2605'.repeat(result.stars) + '\u2606'.repeat(Math.max(0, 3 - result.stars));
      els.resultMessage.textContent = result.message;

      // Show Nova's lesson learned + AI concept takeaway
      const lesson = Game.getNovaLesson(state.currentLevel);
      const aiConcepts = {
        1: '🧠 <strong>AI concept:</strong> Dynamic resource pricing — AI charges based on how much computing power a task needs.',
        2: '🧠 <strong>AI concept:</strong> Complexity awareness — AI must measure RAM usage, not just file size. Small ≠ cheap.',
        3: '🧠 <strong>AI concept:</strong> Load balancing — when demand spikes, AI throttles by raising prices to cool the system.',
        4: '🧠 <strong>AI concept:</strong> Algorithmic fairness — AI charges proportionally. Small customers pay less than big ones.',
        5: '🧠 <strong>AI concept:</strong> Real-time optimization — deployed AI combines all its training to handle peak loads.',
        6: '🧠 <strong>AI concept:</strong> Optimal pricing — matching billed fees to physical compute costs using hints and calculations.',
        7: '🧠 <strong>AI concept:</strong> Autonomous operation — a fully trained AI prices files independently with zero human input.',
        8: '🧠 <strong>AI concept:</strong> Enterprise AI — trained models scale to production workloads at superhuman speed.',
      };
      const conceptLine = aiConcepts[state.currentLevel] || '';
      if (lesson && state.currentLevel <= 5) {
        els.resultMessage.innerHTML += '<br><br>📖 <em>Nova learned: ' + lesson + '</em><br>' + conceptLine;
      } else if (state.currentLevel === 6) {
        els.resultMessage.innerHTML += '<br><br>📊 <em>You learned optimal pricing!</em><br>' + conceptLine;
      } else if (state.currentLevel === 7) {
        els.resultMessage.innerHTML += '<br><br>🤖 <em>Nova operates autonomously!</em><br>' + conceptLine;
      } else if (state.currentLevel === 8) {
        els.resultMessage.innerHTML += '<br><br>🚀 <em>Nova is enterprise-ready!</em><br>' + conceptLine;
      } else if (conceptLine) {
        els.resultMessage.innerHTML += '<br><br>' + conceptLine;
      }
    } else {
      els.resultIcon.innerHTML = '<span style="color:var(--color-warning)">' + Svg.warning + '</span>';
      els.resultTitle.textContent = 'Not Quite...';
      els.resultStars.textContent = '';
      els.resultMessage.textContent = result.message;
    }

    // Metrics
    let metricsHtml = '';
    metricsHtml += '<div class="metric-item"><div class="metric-val">' + Math.round(state.tokensCollected) + '</div><div class="metric-label">Tokens</div></div>';
    metricsHtml += '<div class="metric-item"><div class="metric-val">' + Math.round(state.systemLoad) + '%</div><div class="metric-label">Sys Load</div></div>';
    metricsHtml += '<div class="metric-item"><div class="metric-val">' + state.fairnessRating + '%</div><div class="metric-label">Fairness</div></div>';
    metricsHtml += '<div class="metric-item"><div class="metric-val">' + state.crashes + '</div><div class="metric-label">Crashes</div></div>';
    els.resultMetrics.innerHTML = metricsHtml;

    // Buttons
    els.retryBtn.style.display = '';
    els.retryBtn.textContent = 'Try Again';
    if (result.passed && state.currentLevel <= 5) {
      els.nextBtn.style.display = '';
      els.nextBtn.innerHTML = 'Next Level <span style="font-size:18px">&#8594;</span>';
    } else if (result.passed && state.currentLevel === 6) {
      els.nextBtn.style.display = '';
      els.nextBtn.innerHTML = '🤖 Watch Nova Demo <span style="font-size:18px">&#8594;</span>';
    } else if (result.passed && state.currentLevel === 7) {
      els.nextBtn.style.display = '';
      els.nextBtn.innerHTML = '🚀 Nova at Scale <span style="font-size:18px">&#8594;</span>';
    } else if (result.passed && state.currentLevel === 8) {
      els.nextBtn.style.display = '';
      els.nextBtn.innerHTML = Svg.trophy.replace('40','24').replace('40','24') + ' AI Enterprise Ready!';
    } else if (result.passed && state.currentLevel === 9) {
      els.nextBtn.style.display = 'none';
    } else {
      els.nextBtn.style.display = 'none';
    }
    els.resultMenuBtn.textContent = 'Back to Levels';

    els.resultOverlay.classList.add('active');

    // Celebration for passing
    if (result.passed && result.stars >= 2) {
      spawnConfetti(result.stars * 10);
    }
  }

  // ── Toast ──
  let toastId = 0;
  function showToast(message, type) {
    type = type || 'info';
    if (!els.toastContainer) return;
    toastId++;
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.textContent = message;
    t.id = 'toast-' + toastId;
    els.toastContainer.appendChild(t);
    setTimeout(() => { const el = document.getElementById('toast-' + toastId); if (el) el.remove(); }, 3000);
  }

  // ── Confetti ──
  function spawnConfetti(count) {
    const colors = ['#38bdf8', '#22c55e', '#fbbf24', '#ef4444', '#a78bfa', '#eab308'];
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'confetti-piece';
      p.style.left = Math.random() * 100 + 'vw';
      p.style.top = -(Math.random() * 100) + 'px';
      p.style.background = colors[Math.floor(Math.random() * colors.length)];
      p.style.width = (Math.random() * 8 + 4) + 'px';
      p.style.height = (Math.random() * 8 + 4) + 'px';
      p.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
      p.style.animationDuration = (Math.random() * 2 + 2) + 's';
      p.style.animationDelay = (Math.random() * 0.5) + 's';
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 4000);
    }
  }

  // ── Master Certification Screen ──
  function showMasterCert() {
    const overlay=document.getElementById('master-cert');if(!overlay)return;
    const concepts=[
      {emoji:'⚖️',name:'Scaling',desc:'AI charges by computing power — big files cost more.',real:'→ Cloud services, AWS Lambda'},
      {emoji:'🧠',name:'Complexity',desc:'AI measures RAM usage too — small files can be expensive.',real:'→ AI inference costs, GPU compute'},
      {emoji:'🔄',name:'Balance',desc:'AI raises prices to slow traffic and prevent crashes.',real:'→ Auto-scaling, load balancers'},
      {emoji:'❤️',name:'Fairness',desc:'AI charges small businesses less than corporations.',real:'→ Progressive pricing, tiered plans'},
      {emoji:'⏱️',name:'Pressure',desc:'AI combines all skills to handle real-time demand.',real:'→ Real-time bidding, live pricing'},
      {emoji:'🤖',name:'Autonomous',desc:'A trained AI prices files independently without help.',real:'→ Autonomous billing, auto-pilot'},
      {emoji:'🚀',name:'Enterprise',desc:'AI processes high-volume workloads at superhuman speed.',real:'→ Production AI, scalable systems'}
    ];
    const grid=document.getElementById('certConceptGrid');
    if(grid)grid.innerHTML=concepts.map(c=>'<div class="cert-item"><span class="cert-ci">'+c.emoji+'</span><span class="cert-cn">'+c.name+'</span><span class="cert-cd">'+c.desc+'</span><span class="cert-cr">'+c.real+'</span></div>').join('');
    const stats=document.getElementById('certStatsL17');
    if(stats){
      const state=Game.getState();
      const lsd=state.levelScores||{};
      const totalStars=Object.keys(lsd).reduce((s,k)=>s+(lsd[k]&&lsd[k].stars?lsd[k].stars:0),0);
      stats.innerHTML='⭐ Total stars: '+totalStars+'/21 &middot; 📄 '+Object.keys(lsd).length+'/7 days completed';
    }
    overlay.style.display='flex';
  }

  // ── Helpers ──
  function clamp0(v) { return Math.max(0, Math.min(100, v)); }
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Game Callbacks ──
  function onGameStateChange(state) {
    updateAll(state);
  }

  function onGameSliderChange(data) {
    // Already handled by updateAll in state change
  }

  // ── Final Exam ──
  const EXAM_QUESTIONS_L17 = [
    { concept:'Scaling',emoji:'⚖️',
      q:'Big files need more computing power than small files. What does this mean for cost?',
      a:['Bigger files should cost more.','All files cost the same.','Small files cost more.','Size does not matter.'],correct:0 },
    { concept:'Complexity',emoji:'🧠',
      q:'A tiny medical file uses lots of RAM because it has complex data. What does this teach us?',
      a:['Small files are always cheap.','RAM does not affect cost.','Price should depend on complexity, not just size.','Complexity only matters for big files.'],correct:2 },
    { concept:'Balance',emoji:'🔄',
      q:'The server is overheating and might crash. What should the AI do?',
      a:['Process files faster.','Raise prices to slow down traffic and cool the server.','Ignore the heat and keep going.','Turn off the server.'],correct:1 },
    { concept:'Fairness',emoji:'❤️',
      q:'A small bakery and a big corporation both need files processed. What is fair?',
      a:['Charge the bakery more because they are small.','Charge the corporation less because they are big.','Charge everyone the same price.','Charge the corporation more and the bakery less.'],correct:3 },
    { concept:'Pressure',emoji:'⏱️',
      q:'You have 45 seconds to process files while the Council watches. What AI skill does this test?',
      a:['Making good pricing decisions quickly under pressure.','Ignoring the timer and working slowly.','Processing only one file.','Raising prices as high as possible.'],correct:0 },
    { concept:'Optimization',emoji:'🎯',
      q:'Nova gives you hints about the best price for each file. What should you do?',
      a:['Ignore the hints and do your own thing.','Follow the hints to find the best price for each file.','Set all sliders to maximum.','Only use one slider.'],correct:1 },
    { concept:'Autonomous AI',emoji:'🤖',
      q:'Nova learned from watching you price files. Now she can set prices by herself. When can an AI work without human help?',
      a:['Never — AI always needs a human.','After one hour of training.','Only when connected to the internet.','After learning from enough examples and practice.'],correct:3 },
    { concept:'Enterprise Scale',emoji:'🚀',
      q:'Nova handles 20 files at lightning speed without slowing down. What does this show?',
      a:['The AI is tired and needs a break.','The AI can only handle small workloads.','The AI can handle high-volume work reliably, like a real system.','The AI needs a faster computer.'],correct:2 },
  ];

  let examL17Index = 0;
  let examL17Correct = 0;
  let examL17Results = [];
  let examL17Started = false;

  function startExamL17() {
    examL17Started = true;
    examL17Index = 0;
    examL17Correct = 0;
    examL17Results = [];
    document.getElementById('exam-overlay-L17').style.display = 'flex';
    document.getElementById('exam-results').style.display = 'none';
    document.getElementById('exam-question-area').style.display = '';
    document.getElementById('exam-feedback').style.display = 'none';
    document.getElementById('exam-next-btn').style.display = 'none';
    renderExamQuestionL17();
  }

  function renderExamQuestionL17() {
    const q = EXAM_QUESTIONS_L17[examL17Index];
    if (!q) { finishExamL17(); return; }
    document.getElementById('exam-progress').textContent = 'Question ' + (examL17Index+1) + ' of ' + EXAM_QUESTIONS_L17.length;
    document.getElementById('exam-concept-icon').textContent = q.emoji + ' ' + q.concept;
    document.getElementById('exam-question').textContent = q.q;
    const letters = ['A','B','C','D'];
    const html = q.a.map((opt,i) =>
      '<button class="exam-choice" data-idx="' + i + '"><span class="exam-letter">' + letters[i] + '</span> ' + opt + '</button>'
    ).join('');
    document.getElementById('exam-choices').innerHTML = html;
    document.getElementById('exam-choices').querySelectorAll('.exam-choice').forEach(btn => {
      btn.addEventListener('click', () => selectAnswerL17(parseInt(btn.dataset.idx)));
    });
    document.getElementById('exam-feedback').style.display = 'none';
    document.getElementById('exam-next-btn').style.display = 'none';
  }

  function selectAnswerL17(idx) {
    const q = EXAM_QUESTIONS_L17[examL17Index];
    const correct = idx === q.correct;
    const fbEl = document.getElementById('exam-feedback');
    const fbIcon = document.getElementById('exam-feedback-icon');
    const fbText = document.getElementById('exam-feedback-text');
    const choices = document.getElementById('exam-choices').querySelectorAll('.exam-choice');

    choices.forEach((btn,i) => {
      btn.disabled = true;
      btn.classList.add(i === q.correct ? 'correct' : 'wrong');
      if (i === idx && !correct) btn.classList.add('selected-wrong');
    });

    if (correct) {
      examL17Correct++;
      fbIcon.textContent = '✅';
      fbText.textContent = 'Correct! ' + q.concept + ' is about ' + q.a[q.correct].toLowerCase();
    } else {
      fbIcon.textContent = '❌';
      fbText.textContent = 'The answer was: ' + q.a[q.correct];
    }
    examL17Results.push(correct);
    fbEl.style.display = '';

    const nextBtn = document.getElementById('exam-next-btn');
    nextBtn.textContent = examL17Index < EXAM_QUESTIONS_L17.length - 1 ? 'Next →' : 'See Results';
    nextBtn.style.display = '';
  }

  function finishExamL17() {
    document.getElementById('exam-question-area').style.display = 'none';
    document.getElementById('exam-feedback').style.display = 'none';
    document.getElementById('exam-next-btn').style.display = 'none';
    document.getElementById('exam-results').style.display = '';

    const stars = examL17Correct >= 7 ? 3 : examL17Correct >= 5 ? 2 : 1;
    document.getElementById('exam-stars-display').textContent = '⭐'.repeat(stars) + '☆'.repeat(3 - stars);
    document.getElementById('exam-results-text').textContent =
      'You got ' + examL17Correct + ' out of ' + EXAM_QUESTIONS_L17.length + ' correct!';

    let recapHtml = '';
    EXAM_QUESTIONS_L17.forEach((q,i) => {
      const wasCorrect = examL17Results[i] || false;
      recapHtml += '<div class="exam-recap-row">' +
        '<span class="exam-recap-icon">' + (wasCorrect ? '✅' : '❌') + '</span>' +
        '<span>' + q.emoji + ' ' + q.concept + '</span>' +
        '</div>';
    });
    document.getElementById('exam-recap').innerHTML = recapHtml;

    // Change button text to complete the exam
    document.getElementById('exam-cert-btn').textContent = 'Complete Exam';

    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      var utt = new SpeechSynthesisUtterance('You got ' + examL17Correct + ' out of 8 correct in the AI Pricing and Fairness exam.');
      utt.rate = 0.85; utt.volume = 0.85;
      window.speechSynthesis.speak(utt);
    }
  }

  function onGameFileProcessed(file) {
    // File processed — update UI
    Audio.playProcess();
  }

  /** AI Minute — real-world connection fact, shown once per level max */
  const _aiMinuteShown = new Set();
  const AI_MINUTES = {
    1: '💡 Real AI: Cloud companies like AWS charge based on how much computing power you use — just like our sliders!',
    2: '💡 Real AI: Netflix uses AI to decide how much computing power your stream needs based on your internet speed!',
    3: '💡 Real AI: When millions of people use ChatGPT at once, AI balances server loads — exactly like what we just did!',
    4: '💡 Real AI: AI fairness is a real job! Companies hire "AI ethicists" to make sure AI treats everyone fairly.',
    5: '💡 Real AI: Stock markets use AI to process millions of trades per second under extreme time pressure!',
    6: '💡 Real AI: Self-driving cars use trained AI to make decisions all by themselves — just like Nova just did!',
    7: '💡 Real AI: Companies like Google and Microsoft run thousands of AI models at enterprise scale — 24/7, nonstop!',
  };

  function showAiMinute(level) {
    if (_aiMinuteShown.has(level)) return;
    _aiMinuteShown.add(level);
    const fact = AI_MINUTES[level];
    if (!fact) return;
    // Wait a moment, then show the minute
    setTimeout(() => {
      novaSay(fact, 5000);
    }, 2000);
  }

  /** Show a Nova narrative reaction (text bubble, no TTS) */
  /** Speak text aloud via SpeechSynthesis (pure audio, no DOM) */
  function speakTTS(text) {
    if (!text || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(text);
    u.rate = 0.85; u.volume = 0.85;
    var v = window.speechSynthesis.getVoices();
    var p = v.find(function(v){return v.name.includes('Google UK')||v.name.includes('Samantha')||v.name.includes('Female')});
    if (p) u.voice = p;
    window.speechSynthesis.speak(u);
  }

  function novaSay(text, duration, speak) {
    const bubble = document.getElementById('nova-speech');
    const textEl = document.getElementById('nova-speech-text');
    if (!bubble || !textEl) return;
    textEl.textContent = text;
    bubble.classList.add('show');
    if (speak !== false) speakTTS(text);
    setTimeout(() => {
      bubble.classList.remove('show');
    }, duration || 3500);
  }

  // Track which warnings have been shown to avoid spam
  let _warnedLoad = false;
  let _warnedFairness = false;
  let _lastLevelNarrated = 0;

  /** Show a level introduction from Nova */
  function showLevelIntro(levelId) {
    if (!window.Citizens) return;
    const citizenKey = {1:'buildco',2:'drkim',3:'parks',4:'chen',5:'council',6:'nova',7:'nova'}[levelId];
    const c = citizenKey ? Citizens.get(citizenKey) : null;
    if (c && c.novaIntro) {
      novaSay(c.novaIntro, 5000);
      if (window.NovaSVG) NovaSVG.setExpression(['nervous','curious','thinking','curious','excited','proud','proud'][levelId-1] || 'curious');
    }
  }

  function onGameStateChange(state) {
    updateAll(state);

    // Exam level (L9): show exam overlay when running, hide when idle
    if (state.currentLevel === 9) {
      const dashboard = document.getElementById('dashboard');
      const controls = document.getElementById('controls');
      const overlay = document.getElementById('exam-overlay-L17');
      if (state.phase === 'idle') {
        examL17Started = false;
        dashboard.style.display = 'none';
        controls.style.display = 'none';
        overlay.style.display = 'flex';
        document.getElementById('exam-intro').style.display = '';
        document.getElementById('exam-question-area').style.display = 'none';
        document.getElementById('exam-feedback').style.display = 'none';
        document.getElementById('exam-results').style.display = 'none';
        document.getElementById('exam-header').style.display = 'none';
      } else if (state.phase === 'running' && !examL17Started) {
        examL17Started = true;
        document.getElementById('exam-intro').style.display = 'none';
        document.getElementById('exam-header').style.display = '';
        document.getElementById('exam-question-area').style.display = '';
        startExamL17();
      } else if (state.phase === 'complete') {
        dashboard.style.display = '';
        controls.style.display = '';
        overlay.style.display = 'none';
      }
      return;
    }

    // Nova: per-level narrative intro when idle (level loaded, not yet started)
    if (state.phase === 'idle' && state.currentLevel !== _lastLevelNarrated && state.currentLevel <= 7) {
      _lastLevelNarrated = state.currentLevel;
      setTimeout(() => showLevelIntro(state.currentLevel), 300);
    }

    // Nova: system load warning (once per level)
    if (state.phase === 'running' && state.systemLoad >= 80 && !_warnedLoad) {
      _warnedLoad = true;
      if (window.NovaSVG) NovaSVG.setExpression('thinking');
      novaSay('The server is getting HOT! 🔥 Raise the prices to slow things down!', 3500);
    }

    // Nova: fairness warning (once per level)
    if (state.phase === 'running' && state.fairness > 0 && state.fairness <= 50 && !_warnedFairness) {
      _warnedFairness = true;
      if (window.NovaSVG) NovaSVG.setExpression('empathetic');
      novaSay('Careful! That small business can\'t afford such high prices! Let\'s be fair! ⚖️', 3500);
    }
  }

  function onGameLevelComplete(result) {
    const state = Game.getState();
    showLevelResult(result, state);
    Audio.playComplete(result.passed);

    // Reset warnings for next level
    _warnedLoad = false;
    _warnedFairness = false;

    // Show AI Minute real-world connection fact after passing
    if (result.passed) showAiMinute(state.currentLevel);

    // Nova reactions based on stars — with citizen-specific messages
    if (window.NovaSVG) {
      if (result.stars === 3) {
        NovaSVG.setExpression('proud');
        NovaSVG.triggerAnimation('bounce');
        // Try citizen-specific pass message
        if (window.Citizens) {
          const citizenKey = {1:'buildco',2:'drkim',3:'parks',4:'chen',5:'council',6:'nova',7:'nova'}[state.currentLevel];
          const c = citizenKey ? Citizens.get(citizenKey) : null;
          if (c && c.novaPass) {
            setTimeout(() => novaSay(c.novaPass + ' ⭐⭐⭐', 4500), 600);
          } else {
            setTimeout(() => novaSay('PERFECT! ⭐⭐⭐ I learned so much from that! You\'re the best teacher!'), 500);
          }
        } else {
          setTimeout(() => novaSay('PERFECT! ⭐⭐⭐ I learned so much from that! You\'re the best teacher!'), 500);
        }
      } else if (result.passed) {
        NovaSVG.setExpression('confident');
        setTimeout(() => novaSay('One more day, one more lesson! The Council\'s going to be impressed!'), 500);
      } else {
        NovaSVG.setExpression('empathetic');
        setTimeout(() => novaSay('It\'s okay! Let\'s try again. The Council would understand — learning takes practice!'), 500);
      }
    }

    // Master certification after level 9 (Final Exam)
    if(result.passed&&state.currentLevel===9){
      setTimeout(()=>showMasterCert(),800);
    }

    // Auto-advance hint
    if (result.passed && state.currentLevel < 5) {
      setTimeout(() => {
        const nextLv = state.currentLevel + 1;
        const nextName = Game.LEVELS[nextLv] ? Game.LEVELS[nextLv].name : '';
        showToast('Unlocked: ' + nextName, 'success');
      }, 1500);
    }
  }

  function onGameCrash(data) {
    Audio.playCrash();
    showToast('SYSTEM CRASH! Load hit 100%', 'error');

    // Nova crash reaction — citizen knows if someone was affected
    if (window.NovaSVG) {
      NovaSVG.setExpression('empathetic');
      NovaSVG.triggerAnimation('shake');
    }
    // Who was being helped when the crash happened?
    let crashMessage = 'Oh no! The server crashed! 🔥 Next time, raise prices when the load gets high.';
    if (window.Citizens) {
      const citizenKey = {1:'buildco',2:'drkim',3:'parks',4:'chen',5:'council',6:'nova',7:'nova'}[Game.getState().currentLevel];
      const c = citizenKey ? Citizens.get(citizenKey) : null;
      if (c) {
        crashMessage = 'NOOO! The server crashed! 😱 ' + c.shortName + ' is still waiting! Let\'s try again with higher prices!';
      }
    }
    novaSay(crashMessage, 4000);
  }

  // ── Init everything ──
  document.addEventListener('DOMContentLoaded', () => {
    init();

    // Wire up game callbacks
    Game.init({
      onStateChange: onGameStateChange,
      onSliderChange: onGameSliderChange,
      onFileProcessed: onGameFileProcessed,
      onLevelComplete: onGameLevelComplete,
      onCrash: onGameCrash
    });

    // Master certification back button
    document.getElementById('certBackBtn').addEventListener('click',()=>{
      document.getElementById('master-cert').style.display='none';
    });

    // Exam buttons
    document.getElementById('exam-next-btn').addEventListener('click',()=>{
      examL17Index++;
      if (examL17Index >= EXAM_QUESTIONS_L17.length) {
        finishExamL17();
      } else {
        renderExamQuestionL17();
      }
    });
    document.getElementById('exam-cert-btn').addEventListener('click',()=>{
      document.getElementById('exam-overlay-L17').style.display='none';
      Game.setExamResult(examL17Correct);
      Game.endLevel();
      // Certification will trigger from onGameLevelComplete for level 9
    });

    // Start exam button
    document.getElementById('exam-start-btn').addEventListener('click',()=>{
      Game.startLevel();
    });

    // Init auxiliary modules
    Transcript.init();
    Settings.init();
    Conversation.init({
      onStateChange: (state) => {
        // Update Nova SVG state
        if (window.NovaSVG) NovaSVG.setState(state);
      },
      onResponse: (childText, aiText, intentId) => {
        // Update speech bubble (unified Nova bubble)
        novaSay(aiText, 4000);
      }
    });

    // Final render
    updateAll(Game.getState());

    // Init Nova SVG and comic
    if (window.NovaSVG) NovaSVG.init();
    if (window.NovaComic) NovaComic.init();

    // Show comic intro instead of old wall-of-text
    if (window.NovaComic) {
      NovaComic.show(() => {});
    }

    // Idle visual prompt
    Conversation.startIdleTimer && Conversation.startIdleTimer();
  });

  return { init, showToast, updateAll, showLevelResult };
})();
