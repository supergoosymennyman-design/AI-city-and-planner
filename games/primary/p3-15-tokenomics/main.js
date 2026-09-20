/**
 * main.js — UI Controller for AI Token Exchange
 * Handles rendering, event binding, and state-driven UI updates.
 * Supports ALL 7 levels with their unique mechanics:
 *   L1: Task toggles + cost cards
 *   L2: Model tier selection (STD/PRM buttons)
 *   L3: Batch processing + patience timers
 *   L4: Priority toggles + deadline badges
 *   L5: All mechanics combined + cache badges
 *   L6-L7: Nova auto-allocation
 */

// ── Inline SVG Icon Library ──
const Svg = {
  gear: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>',
  transcript: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="3" width="16" height="18" rx="2"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg>',
  wrench: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="7.5" cy="16.5" r="4"/><line x1="10.5" y1="13.5" x2="20" y2="4"/><rect x="12" y="1" width="9" height="6" rx="1.5"/></svg>',
  play: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><polygon points="6,3 20,12 6,21"/></svg>',
  process: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20,6 9,17 4,12"/></svg>',
  retry: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1,4 1,10 7,10"/><path d="M3.5 15a9 9 0 1 0 2.1-9.4L1 10"/></svg>',
  trophy: '<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h2"/><path d="M18 9h2a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/><path d="M7 3h10v5a5 5 0 0 1-10 0V3z"/></svg>',
  warning: '<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  closeX: '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  person: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>',
  textIcon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="4" width="14" height="5" rx="1"/><line x1="12" y1="4" x2="12" y2="20"/><line x1="8" y1="20" x2="16" y2="20"/></svg>',
  lookupIcon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="6"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>',
  imageIcon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/></svg>',
  novaIcon: '<svg viewBox="0 0 32 32" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><circle cx="16" cy="16" r="11"/><circle cx="16" cy="16" r="4"/><line x1="16" y1="5" x2="16" y2="9"/><line x1="16" y1="23" x2="16" y2="27"/><line x1="5" y1="16" x2="9" y2="16"/><line x1="23" y1="16" x2="27" y2="16"/></svg>',
  skipIcon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9,18 15,12 9,6"/><polyline points="15,18 21,12 15,6"/></svg>',
  // NEW icons for mechanics
  premium: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>',
  standard: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></svg>',
  batch: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/></svg>',
  clock: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>',
  deadline: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="6" x2="12" y2="12"/><line x1="12" y1="12" x2="16" y2="14"/></svg>',
  cache: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="8,12 11,15 16,9"/></svg>',
  priority: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="2" x2="12" y2="22"/><polyline points="17,7 12,2 7,7"/></svg>',
  discount: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><circle cx="9.5" cy="9.5" r="0.5"/><circle cx="14.5" cy="14.5" r="0.5"/></svg>',
  people: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="7" r="3"/><path d="M3 19c0-3 2.7-5 6-5"/><circle cx="17" cy="7" r="3"/><path d="M15 14c2.5 0 6 2 6 5"/></svg>'
};

const UI = (() => {
  'use strict';

  // ── DOM Refs ──
  let els = {};

  function cacheDom() {
    els = {
      gameTitle: document.getElementById('game-title'),
      levelTabs: document.getElementById('level-tabs'),
      scoreDisplay: document.getElementById('score-display'),
      settingsToggle: document.getElementById('settings-toggle'),
      transcriptToggle: document.getElementById('transcript-toggle'),
      debugBtn: document.getElementById('debug-btn'),

      dashboard: document.getElementById('dashboard'),
      citizenQueue: document.getElementById('citizen-queue'),
      currentCitizenCard: document.getElementById('current-citizen-card'),
      citizenName: document.getElementById('citizen-name'),
      taskToggles: document.getElementById('task-toggles'),
      modelTiers: document.getElementById('model-tiers'),
      priorityToggle: document.getElementById('priority-toggle'),
      batchArea: document.getElementById('batch-area'),
      batchList: document.getElementById('batch-list'),
      batchBtn: document.getElementById('batch-btn'),
      batchDiscount: document.getElementById('batch-discount'),
      currentCost: document.getElementById('current-cost'),
      processBtn: document.getElementById('process-btn'),
      skipBtn: document.getElementById('skip-btn'),
      actionBtn: document.getElementById('action-btn'),

      budgetBarFill: document.getElementById('budget-bar-fill'),
      budgetSpent: document.getElementById('budget-spent'),
      budgetTotal: document.getElementById('budget-total'),
      budgetRemaining: document.getElementById('budget-remaining'),

      novaKnowledgePanel: document.getElementById('nova-knowledge-panel'),
      novaKnowledgeFill: document.getElementById('nova-knowledge-fill'),
      novaKnowledgeText: document.getElementById('nova-knowledge-text'),
      novaLessonDisplay: document.getElementById('nova-lesson-display'),

      novaAvatar: document.getElementById('nova-avatar'),
      novaSpeechBubble: document.getElementById('nova-speech-bubble'),
      novaSpeechText: document.getElementById('nova-speech-text'),
      textInputArea: document.getElementById('text-input-area'),
      textInput: document.getElementById('botly-text-input'),
      textSendBtn: document.getElementById('text-send-btn'),
      stateDot: document.getElementById('ai-state-dot'),

      instructionBar: document.getElementById('instruction-bar'),
      instructionText: document.getElementById('instruction-text'),
      levelBadge: document.getElementById('level-badge'),
      novaStatus: document.getElementById('nova-status'),
      levelFeatures: document.getElementById('level-features'),

      resultOverlay: document.getElementById('result-overlay'),
      toastContainer: document.getElementById('toast-container'),

      resultIcon: document.getElementById('result-icon'),
      resultTitle: document.getElementById('result-title'),
      resultStars: document.getElementById('result-stars'),
      resultMessage: document.getElementById('result-message'),
      resultMetrics: document.getElementById('result-metrics'),
      retryBtn: document.getElementById('retry-btn'),
      nextBtn: document.getElementById('next-btn'),
      resultMenuBtn: document.getElementById('result-menu-btn'),

      introOverlay: document.getElementById('intro-overlay'),
      introStartBtn: document.getElementById('intro-start-btn'),

      debugAnalytics: document.getElementById('debug-analytics'),

      // Narrative story elements
      chapterCard: document.getElementById('chapter-card'),
      chapterNumber: document.getElementById('chapter-number'),
      chapterTitle: document.getElementById('chapter-title'),
      chapterStory: document.getElementById('chapter-story'),
      chapterSkip: document.getElementById('chapter-skip'),
      vegaCard: document.getElementById('vega-card'),
      vegaMsg: document.getElementById('vega-msg'),
      novaMood: document.getElementById('nova-mood'),
      novaGrowth: document.getElementById('nova-growth'),
      novaGrowthFill: document.getElementById('nova-growth-fill'),
      novaGrowthLabel: document.getElementById('nova-growth-label'),

      // Exam elements
      examOverlay: document.getElementById('exam-overlay-L15'),
      examProgress: document.getElementById('exam-progress'),
      examQuestion: document.getElementById('exam-question'),
      examChoices: document.getElementById('exam-choices'),
      examFeedback: document.getElementById('exam-feedback'),
      examFeedbackIcon: document.getElementById('exam-feedback-icon'),
      examFeedbackText: document.getElementById('exam-feedback-text'),
      examNextBtn: document.getElementById('exam-next-btn'),
      examResults: document.getElementById('exam-results'),
      examStarsDisplay: document.getElementById('exam-stars-display'),
      examResultsText: document.getElementById('exam-results-text'),
      examRecap: document.getElementById('exam-recap'),
      examCertBtn: document.getElementById('exam-cert-btn'),
      examConceptIcon: document.getElementById('exam-concept-icon'),
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

    if (els.processBtn) {
      els.processBtn.addEventListener('click', () => {
        Game.processCitizen();
      });
    }

    if (els.skipBtn) {
      els.skipBtn.addEventListener('click', () => {
        Game.skipCitizen();
      });
    }

    // Task toggle clicks (delegated)
    if (els.taskToggles) {
      els.taskToggles.addEventListener('click', (e) => {
        const row = e.target.closest('.task-toggle-row');
        if (!row) return;
        const task = row.dataset.task;
        if (task) {
          Game.toggleTask(task);
          Audio.playToggle();
        }
      });
    }

    // Model tier clicks (delegated)
    if (els.modelTiers) {
      els.modelTiers.addEventListener('click', (e) => {
        const btn = e.target.closest('.model-tier-btn');
        if (!btn) return;
        const task = btn.dataset.task;
        const tier = btn.dataset.tier;
        if (task && tier) {
          Game.setModelTier(task, tier);
          Audio.playToggle();
        }
      });
    }

    // Priority toggle click
    if (els.priorityToggle) {
      els.priorityToggle.addEventListener('click', () => {
        Game.togglePriority();
        Audio.playToggle();
      });
    }

    // Batch button
    if (els.batchBtn) {
      els.batchBtn.addEventListener('click', () => {
        Game.processBatch();
      });
    }

    // Citizen queue clicks (for L5 manual override or info)
    if (els.citizenQueue) {
      els.citizenQueue.addEventListener('click', (e) => {
        const item = e.target.closest('.queue-item');
        if (!item) return;
        // Highlight clicked citizen (visual feedback)
        els.citizenQueue.querySelectorAll('.queue-item').forEach(el => el.classList.remove('queue-highlighted'));
        item.classList.add('queue-highlighted');
      });
    }

    if (els.introStartBtn) {
      els.introStartBtn.addEventListener('click', () => {
        // First click: play intro audio, don't hide overlay
        if (!_introPlayed) {
          _introPlayed = true;
          speakIntroStory();
          return;
        }
        // Second click: hide overlay and start the game
        if (els.introOverlay) els.introOverlay.style.display = 'none';
      });
    }

    // Level tabs (delegated, debounced) — L6-L7 locked until L5 completed
    if (els.levelTabs) {
      els.levelTabs.addEventListener('click', (e) => {
        const now = Date.now();
        if (now - _lastLevelClick < 400) return;
        _lastLevelClick = now;
        const tab = e.target.closest('.level-tab');
        if (!tab) return;
        const lv = parseInt(tab.dataset.level);
        if (!lv) return;

        // L6-L7 require L2 to be completed first
        if (lv >= 6) {
          const state = Game.getState();
          const l2Done = state.levelScores[2] && state.levelScores[2].passed;
          if (!l2Done) {
            showToast('Complete Level 2 first to unlock the AI demo!', 'warning');
            return;
          }
        }

        Game.goToLevel(lv);
        updateAll(Game.getState());
      });
    }

    if (els.settingsToggle) els.settingsToggle.addEventListener('click', () => Settings.open());
    if (els.transcriptToggle) els.transcriptToggle.addEventListener('click', () => Transcript.toggle());

    if (els.debugBtn) els.debugBtn.addEventListener('click', () => {
      const active = Game.toggleDebug();
      els.debugBtn.classList.toggle('active', active);
      showToast(active ? 'Debug analytics ON' : 'Debug analytics OFF', 'info');
      updateAll(Game.getState());
    });

    if (els.novaAvatar) els.novaAvatar.addEventListener('click', () => {
      Conversation.showTextInput && Conversation.showTextInput();
    });

    // Narrative: chapter card dismiss
    if (els.chapterSkip) {
      els.chapterSkip.addEventListener('click', () => hideChapterCard());
    }

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
  }

  // ── Level Tabs ──
  function buildLevelTabs() {
    if (!els.levelTabs) return;
    els.levelTabs.innerHTML = '';
    const chNames = ['System Reboot','Damaged Docs','Colony Groups','VIP Arrivals','Final Sign-Offs','Nova Command','Full Scale'];
    for (let i = 1; i <= 7; i++) {
      const tab = document.createElement('button');
      tab.className = 'level-tab';
      tab.dataset.level = i;
      tab.textContent = 'Ch.' + i;
      tab.title = chNames[i - 1];
      tab.setAttribute('aria-label', 'Chapter ' + i + ': ' + chNames[i - 1]);
      els.levelTabs.appendChild(tab);
    }
    // Exam tab
    const examTab = document.createElement('button');
    examTab.className = 'level-tab exam-tab';
    examTab.id = 'exam-tab';
    examTab.textContent = '📝 Exam';
    examTab.title = 'AI Concepts Exam';
    examTab.setAttribute('aria-label', 'AI Concepts Exam');
    examTab.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof startExam === 'function') startExam();
    });
    els.levelTabs.appendChild(examTab);
  }

  // ── State → UI ──
  function updateAll(state) {
    updateLevelTabs(state);
    updateScoreDisplay(state);
    updateBudgetDisplay(state);
    updateCitizenQueue(state);
    updateCurrentCitizen(state);
    updateModelTiers(state);
    updatePriorityToggle(state);
    updateBatchArea(state);
    updateActionButton(state);
    updateInstruction(state);
    updateLevelFeatures(state);
    updateNovaKnowledge(state);
    updateDebugAnalytics(state);
  }

  function updateLevelTabs(state) {
    const tabs = els.levelTabs ? els.levelTabs.querySelectorAll('.level-tab') : [];
    const l2Done = state.levelScores[2] && state.levelScores[2].passed;
    const chNames = ['System Reboot','Damaged Docs','Colony Groups','VIP Arrivals','Final Sign-Offs','Nova Command','Full Scale'];
    tabs.forEach(tab => {
      const lv = parseInt(tab.dataset.level);
      tab.classList.toggle('active', lv === state.currentLevel);
      tab.classList.toggle('completed', state.levelScores[lv] && state.levelScores[lv].passed);
      // Lock L6-L7 until L2 completed
      if (lv >= 6) {
        tab.classList.toggle('locked', !l2Done);
        if (!l2Done) {
          tab.title = 'Complete Level 2 first!';
          tab.innerHTML = 'Ch.' + lv + ' 🔒';
        } else {
          tab.title = chNames[lv - 1] || '';
          tab.innerHTML = 'Ch.' + lv;
        }
      }
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

  function updateBudgetDisplay(state) {
    const spent = state.spent;
    const bonus = state.bonusTokens || 0;
    const effectiveBudget = state.budget + bonus;
    const remaining = effectiveBudget - spent;
    const pct = effectiveBudget > 0 ? Math.min(100, (spent / effectiveBudget) * 100) : 0;

    if (els.budgetBarFill) {
      els.budgetBarFill.style.width = pct + '%';
      els.budgetBarFill.className = 'budget-bar-fill ' +
        (pct >= 90 ? 'danger' : pct >= 70 ? 'warning' : 'safe');
    }
    if (els.budgetSpent) els.budgetSpent.textContent = Math.round(spent);
    if (els.budgetTotal) {
      els.budgetTotal.textContent = effectiveBudget;
      if (bonus > 0) {
        els.budgetTotal.textContent += ' (+' + bonus + ')';
      }
    }
    if (els.budgetRemaining) {
      els.budgetRemaining.textContent = Math.round(remaining);
      els.budgetRemaining.className = 'budget-remaining ' +
        (remaining < 10 ? 'danger' : remaining < 30 ? 'warning' : 'safe');
    }
  }

  function updateCitizenQueue(state) {
    if (!els.citizenQueue) return;
    const all = state.citizens;
    if (!all || all.length === 0) {
      els.citizenQueue.innerHTML = '<div class="empty-queue">Select a level and press Start.</div>';
      return;
    }

    let html = '';
    all.forEach((c) => {
      const isCurrent = c.status === 'processing' || c.processing;
      const isCompleted = c.status === 'completed';
      const isSkipped = c.status === 'skipped';
      const isExpired = c.status === 'expired';
      const isPending = c.status === 'pending';
      const inGroup = c.group === (Game.getCurrentCitizen() ? Game.getCurrentCitizen().group : -1);

      let statusClass = 'pending';
      let statusLabel = 'WAITING';
      if (isCurrent) { statusClass = 'processing'; statusLabel = 'NOW'; }
      else if (isCompleted) { statusClass = 'completed'; statusLabel = 'DONE'; }
      else if (isSkipped) { statusClass = 'skipped'; statusLabel = 'SKIP'; }
      else if (isExpired) { statusClass = 'expired'; statusLabel = 'LATE'; }

      const cost = c.spent !== undefined && c.spent > 0 ? c.spent : '';

      // Build badges (simple visual cues for 8-year-olds)
      let badges = '';
      if (c.hasDeadline) badges += '<span class="citizen-badge deadline-badge" title="Needs rush!">⏰</span>';
      if (c.isReturning) badges += '<span class="citizen-badge cache-badge" title="Returns cheaper">↩</span>';
      if (c.group) badges += '<span class="citizen-badge group-badge" title="Group ' + c.group + '">G' + c.group + '</span>';
      if (c.patience && c.status === 'pending') {
        const patClass = c.patience <= 10 ? 'patience-urgent' : c.patience <= 20 ? 'patience-low' : '';
        badges += '<span class="citizen-badge patience-badge ' + patClass + '" title="Waiting time">' + Svg.clock + ' ' + c.patience + 's</span>';
      }

      // Premium needs — show just task letter(s)
      if (c.needsModel) {
        const prems = Object.entries(c.needsModel).filter(([,v]) => v === 'premium').map(([k]) => k.charAt(0).toUpperCase());
        if (prems.length > 0) {
          badges += '<span class="citizen-badge premium-need-badge" title="Needs SUPER for: ' + prems.join(', ') + '">' + Svg.premium + ' ' + prems.join(',') + '</span>';
        }
      }

      html += '<div class="queue-item ' + statusClass + (inGroup && isPending ? ' in-current-group' : '') + '" data-citizen-id="' + c.id + '">' +
        '<div class="queue-icon">' + Svg.person + '</div>' +
        '<div class="queue-info">' +
          '<div class="queue-name">' + escapeHtml(c.name) + '</div>' +
          '<div class="queue-badges">' + badges + '</div>' +
          '<div class="queue-cost">' + (cost ? cost + ' tokens' : '') + '</div>' +
        '</div>' +
        '<div class="queue-status ' + statusClass + '">' + statusLabel + '</div>' +
      '</div>';
    });
    els.citizenQueue.innerHTML = html;

    const currentEl = els.citizenQueue.querySelector('.processing');
    if (currentEl) {
      currentEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function updateCurrentCitizen(state) {
    const c = Game.getCurrentCitizen();
    if (!c) {
      if (els.currentCitizenCard) els.currentCitizenCard.style.visibility = 'hidden';
      return;
    }

    if (els.currentCitizenCard) els.currentCitizenCard.style.visibility = 'visible';

    if (els.citizenName) {
      els.citizenName.textContent = c.name;
    }

    // Task toggles
    if (els.taskToggles) {
      const tasks = [
        { id: 'text', label: 'Text Reading', icon: Svg.textIcon, cost: Game.TASK_COSTS.text, premCost: Game.PREMIUM_COSTS.text },
        { id: 'lookup', label: 'App Lookup', icon: Svg.lookupIcon, cost: Game.TASK_COSTS.lookup, premCost: Game.PREMIUM_COSTS.lookup },
        { id: 'image', label: 'Image Match', icon: Svg.imageIcon, cost: Game.TASK_COSTS.image, premCost: Game.PREMIUM_COSTS.image }
      ];

      const level = state.level;
      const isNovaAuto = level && level.isNovaAuto && state.phase === 'running';
      const isDisabled = state.phase !== 'running' || isNovaAuto;

      let html = '';
      tasks.forEach(t => {
        const available = c.available.includes(t.id);
        const required = c.required.includes(t.id);
        const isOn = state.toggles[t.id];
        const canToggle = !isDisabled && available && (!required || isOn);

        if (!available) return;

        // Show model cost based on current tier
        let costDisplay = t.cost + ' tok';
        if (level && level.allowPremium) {
          const tier = state.modelTiers[t.id] || 'standard';
          if (tier === 'premium') costDisplay = t.premCost + ' tok';
          else costDisplay = t.cost + ' tok';
        }

        html += '<div class="task-toggle-row' + (isOn ? ' active' : '') + (!canToggle ? ' locked' : '') +
          '" data-task="' + t.id + '" role="checkbox" aria-checked="' + isOn + '" tabindex="' + (canToggle ? '0' : '-1') + '">' +
          '<div class="task-icon">' + t.icon + '</div>' +
          '<div class="task-info">' +
            '<div class="task-label">' + t.label +
              (required ? ' <span class="task-required">REQUIRED</span>' : '') + '</div>' +
            '<div class="task-cost">' + costDisplay + '</div>' +
          '</div>' +
          '<div class="task-checkbox' + (isOn ? ' checked' : '') + '">' +
            (isOn ? Svg.process : '') +
          '</div>' +
        '</div>';
      });

      els.taskToggles.innerHTML = html;
    }

    // Current cost display
    if (els.currentCost) {
      const cost = Game.getCurrentCitizenCost();
      const effBudget = state.budget + (state.bonusTokens || 0);
      els.currentCost.textContent = 'Cost: ' + cost + ' tokens';
      els.currentCost.className = 'current-cost ' +
        (state.spent + cost > effBudget ? 'danger' : 'safe');
    }

    // Process button visibility
    if (els.processBtn && els.skipBtn) {
      const isNovaAuto = state.level && state.level.isNovaAuto && state.phase === 'running';
      if (state.phase === 'running' && !isNovaAuto) {
        els.processBtn.style.display = '';
        els.skipBtn.style.display = '';

        const canProc = Game.canProcess();
        els.processBtn.disabled = !canProc;
        els.processBtn.classList.toggle('disabled', !canProc);
      } else {
        els.processBtn.style.display = 'none';
        els.skipBtn.style.display = 'none';
      }
    }
  }

  function updateModelTiers(state) {
    if (!els.modelTiers) return;
    const level = state.level;
    if (!level || !level.allowPremium) {
      els.modelTiers.style.display = 'none';
      return;
    }

    els.modelTiers.style.display = 'flex';
    const isNovaAuto = level.isNovaAuto && state.phase === 'running';
    const isDisabled = state.phase !== 'running' || isNovaAuto;

    const tasks = ['text', 'lookup', 'image'];
    const labels = { text: 'Text', lookup: 'Lookup', image: 'Image' };

    let html = '<div class="model-tiers-label">Scanner Type</div>';
    tasks.forEach(task => {
      const currentTier = state.modelTiers[task] || 'standard';
      const stdCost = Game.TASK_COSTS[task];
      const prmCost = Game.PREMIUM_COSTS[task];

      html += '<div class="model-tier-row">' +
        '<span class="model-tier-task">' + labels[task] + '</span>' +
        '<button class="model-tier-btn std' + (currentTier === 'standard' ? ' active' : '') + '" data-task="' + task + '" data-tier="standard"' + (isDisabled ? ' disabled' : '') + '>' +
          'Basic ' + stdCost +
        '</button>' +
        '<button class="model-tier-btn prm' + (currentTier === 'premium' ? ' active' : '') + '" data-task="' + task + '" data-tier="premium"' + (isDisabled ? ' disabled' : '') + '>' +
          'SUPER ' + prmCost +
        '</button>' +
      '</div>';
    });

    els.modelTiers.innerHTML = html;
  }

  function updatePriorityToggle(state) {
    if (!els.priorityToggle) return;
    const level = state.level;
    if (!level || !level.allowPriority) {
      els.priorityToggle.style.display = 'none';
      return;
    }

    els.priorityToggle.style.display = 'flex';
    const isNovaAuto = level.isNovaAuto && state.phase === 'running';
    const isDisabled = state.phase !== 'running' || isNovaAuto;

    let html = '<div class="priority-row">';
    html += '<span class="priority-label">Rush Mode</span>';
    html += '<span class="priority-info">Costs double / +5 bonus</span>';
    html += '<button class="priority-toggle-btn' + (state.priorityMode ? ' active' : '') + '"' +
      (isDisabled ? ' disabled' : '') + '>' +
      Svg.priority + ' ' + (state.priorityMode ? 'ON' : 'OFF') +
    '</button>';
    html += '</div>';

    els.priorityToggle.innerHTML = html;
  }

  function updateBatchArea(state) {
    if (!els.batchArea) return;
    const level = state.level;
    if (!level || !level.allowBatch) {
      els.batchArea.style.display = 'none';
      return;
    }

    els.batchArea.style.display = 'block';
    const isNovaAuto = level.isNovaAuto && state.phase === 'running';
    const isDisabled = state.phase !== 'running' || isNovaAuto;
    const c = Game.getCurrentCitizen();
    const currentGroup = c ? c.group : null;

    // Show batch group preview (auto-batched by group number)
    if (els.batchList) {
      if (isDisabled || !currentGroup) {
        els.batchList.innerHTML = '<div class="batch-empty">Press Start to begin batching.</div>';
      } else {
        const batch = Game.getCurrentBatch();
        if (batch.length === 0) {
          els.batchList.innerHTML = '<div class="batch-empty">No more citizens in Group ' + currentGroup + '.</div>';
        } else {
          let bhtml = '';
          batch.forEach(bc => {
            const isCurrent = bc.id === c.id;
            bhtml += '<div class="batch-item' + (isCurrent ? ' batch-item-current' : '') + '">' +
              Svg.person + ' <span>' + escapeHtml(bc.name) + '</span>' +
              '<span class="batch-item-status">' + (isCurrent ? '← Now' : '') + '</span>' +
            '</div>';
          });
          els.batchList.innerHTML = bhtml;
        }
      }
    }

    // Batch discount display — only for groups of 2+
    if (els.batchDiscount && !isDisabled && currentGroup && state.phase === 'running') {
      const batch = Game.getCurrentBatch();
      const effectiveBatchSize = batch.length;
      if (effectiveBatchSize >= 2) {
        const discount = Game.calcBatchDiscount(batch);
        els.batchDiscount.innerHTML = Svg.discount + ' Group ' + currentGroup + ' — ' + effectiveBatchSize + ' citizens = ~' + discount + ' tokens off!';
        els.batchDiscount.style.display = 'block';
      } else {
        els.batchDiscount.style.display = 'none';
      }
    } else if (els.batchDiscount) {
      els.batchDiscount.style.display = 'none';
    }

    // Batch process button — only show for groups of 2+ (no discount for 1)
    if (els.batchBtn) {
      if (isDisabled || !currentGroup) {
        els.batchBtn.style.display = 'none';
      } else {
        const batch = Game.getCurrentBatch();
        if (batch.length >= 2) {
          els.batchBtn.style.display = '';
          els.batchBtn.disabled = state.batchActive;
          els.batchBtn.innerHTML = Svg.batch + ' Process Group ' + currentGroup + ' (' + batch.length + ' citizens)';
        } else {
          els.batchBtn.style.display = 'none';
        }
      }
    }
  }

  function updateActionButton(state) {
    if (!els.actionBtn) return;
    const level = state.level;
    if (!level) return;

    const isNovaAuto = level.isNovaAuto;

    if (state.phase === 'idle') {
      if (isNovaAuto) {
        els.actionBtn.innerHTML = Svg.play + ' Watch Nova Demonstrate';
      } else {
        els.actionBtn.innerHTML = Svg.play + ' Start Processing Citizens';
      }
      els.actionBtn.disabled = false;
      els.actionBtn.style.display = '';
    } else if (state.phase === 'running') {
      if (isNovaAuto) {
        els.actionBtn.innerHTML = '<span class="nova-thinking-dot"></span> Nova Computing...';
      } else {
        els.actionBtn.innerHTML = '<span class="nova-thinking-dot"></span> Processing...';
      }
      els.actionBtn.disabled = true;
      els.actionBtn.style.display = '';
    } else if (state.phase === 'complete' || state.phase === 'failed') {
      els.actionBtn.innerHTML = Svg.retry + ' Replay Level';
      els.actionBtn.disabled = false;
      els.actionBtn.style.display = '';
    }
  }

  function updateInstruction(state) {
    if (!els.instructionBar) return;
    const level = state.level;
    if (level) {
      if (els.levelBadge) els.levelBadge.textContent = 'L' + level.id;
      if (els.instructionText) {
        let text = level.instruction;

        // Show phase-specific guidance for non-auto levels
        if (!level.isNovaAuto) {
          if (state.phase === 'idle') {
            text = level.instruction + ' Press Start when ready!';
          } else if (state.phase === 'running') {
            const c = Game.getCurrentCitizen();
            if (c) {
              // Check if citizen has tasks to toggle
              const hasOptions = c.available.length > c.required.length;
              if (hasOptions) {
                text = 'Tap tasks to turn them ON/OFF. REQUIRED tasks must stay on. Then press Process.';
              } else {
                text = 'All required tasks are on. Press Process to verify this citizen!';
              }
            } else {
              text = 'No citizen selected. Tap a citizen in the queue.';
            }
          } else if (state.phase === 'complete' || state.phase === 'failed') {
            text = level.instruction + ' Try again or pick a new level!';
          }
        } else if (level.isNovaAuto && state.phase === 'running') {
          text = 'Nova is computing... Watch the AI allocate tokens!';
        }

        els.instructionText.textContent = text;
      }
    }
  }

  function updateLevelFeatures(state) {
    if (!els.levelFeatures) return;
    const level = state.level;
    if (!level) { els.levelFeatures.innerHTML = ''; return; }

    const features = [];
    if (level.allowPremium) features.push('<span class="feature-tag premium">SUPER Scanner</span>');
    if (level.allowBatch) features.push('<span class="feature-tag batch">Group Save</span>');
    if (level.allowPriority) features.push('<span class="feature-tag priority">Rush Mode</span>');
    if (level.allowCache) features.push('<span class="feature-tag cache">Return Discount</span>');

    if (features.length === 0) {
      features.push('<span class="feature-tag">Basic Tasks</span>');
    }

    els.levelFeatures.innerHTML = features.join(' ');
  }

  function updateNovaKnowledge(state) {
    if (!els.novaKnowledgePanel) return;
    const progress = Game.getNovaProgress();

    if (els.novaKnowledgeFill) {
      els.novaKnowledgeFill.style.width = progress.pct + '%';
    }

    if (els.novaKnowledgeText) {
      if (progress.learned === 0) {
        els.novaKnowledgeText.textContent = 'Nova is waiting to learn from you... Complete levels to teach Nova!';
      } else if (progress.learned >= 7) {
        els.novaKnowledgeText.textContent = 'Nova has mastered ALL 7 lessons! She can allocate tokens perfectly.';
      } else {
        const conceptNames={1:'Budget',2:'Models',3:'Batch',4:'Priority',5:'Optimize',6:'Auto',7:'Scale'};
        els.novaKnowledgeText.textContent = 'Nova learned: ' + conceptNames[progress.learned] + ' — ' + progress.learned + '/7';
      }
    }

    // Concept tracker grid
    const tracker=document.getElementById('conceptTrackerL15');
    if(tracker){
      const concepts={1:'Budget',2:'Models',3:'Batch',4:'Priority',5:'Optimize',6:'Auto',7:'Scale'};
      const icons={1:'💰',2:'🎯',3:'📦',4:'⚡',5:'🧠',6:'🤖',7:'🚀'};
      let th='';
      for(let i=1;i<=7;i++){
        const done=!!state.novaKnowledge[i];
        th+='<div class="concept-badge'+(done?' done':'')+'"><span class="cb-icon">'+(done?icons[i]:'○')+'</span><span class="cb-label">'+concepts[i]+'</span></div>';
      }
      tracker.innerHTML=th;
    }

    if (els.novaLessonDisplay) {
      const currentLesson = Game.getNovaLesson(state.currentLevel);
      if (state.levelScores[state.currentLevel] && state.levelScores[state.currentLevel].passed && currentLesson) {
        els.novaLessonDisplay.style.display = 'block';
        els.novaLessonDisplay.innerHTML = '<strong>Nova learned:</strong> ' + currentLesson;
      } else if (state.novaKnowledge[state.currentLevel]) {
        els.novaLessonDisplay.style.display = 'block';
        els.novaLessonDisplay.innerHTML = '<strong>Nova learned:</strong> ' + (Game.getNovaLesson(state.currentLevel) || '');
      } else {
        els.novaLessonDisplay.style.display = 'none';
      }
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

  // ── Level Complete ──
  function showLevelResult(result, state) {
    if (!els.resultOverlay) return;

    // Narrative: save completion + update growth/Vega
    if (result.passed) {
      try { localStorage.setItem('tokenomics_' + state.currentLevel + '_done', '1'); } catch (e) { /* ignore */ }
      updateGrowthMeter();
      const vegaCongrats = {
        1: 'First verification done! Nova is getting her memory back. Good work.',
        2: 'Premium AI, handled. The water-damaged documents are all processed. Nova is recovering well.',
        3: 'Batch processing works! The Chen family is on the manifest. Nova is learning fast.',
        4: 'Governor Patel is through. Priority worked perfectly. The budget held.',
        5: 'All final sign-offs complete. Nova has mastered every strategy. She is ready for command.',
        6: 'Nova did it. All remaining settlers verified. Endeavour is go for launch.',
        7: 'Twenty settlers, enterprise speed. This system is ready for any spaceport. Well done, both of you.',
      };
      if (vegaCongrats[state.currentLevel]) {
        els.vegaMsg.textContent = vegaCongrats[state.currentLevel];
        els.vegaCard.classList.remove('hidden');
        els.vegaCard.style.animation = 'none';
        els.vegaCard.offsetHeight;
        els.vegaCard.style.animation = '';
      }
    }

    if (result.passed) {
      const chTitles = ['System Reboot','Damaged Documents','Colony Groups','VIP Arrivals','Final Sign-Offs','Nova Takes Command','Full-Scale Terminal'];
      els.resultIcon.innerHTML = '<span style="color:var(--color-token)">' + Svg.trophy + '</span>';
      els.resultTitle.textContent = 'Ch.' + state.currentLevel + ': ' + (chTitles[state.currentLevel - 1] || 'Complete!');
      els.resultStars.textContent = '\u2605'.repeat(Math.max(0, result.stars)) +
        '\u2606'.repeat(Math.max(0, 3 - result.stars));
      els.resultMessage.textContent = result.message;

      const lesson = Game.getNovaLesson(state.currentLevel);
      const aiConceptsL15={
        1:'<br><strong style="color:var(--color-primary)">🧠 AI concept:</strong> Token Budgeting — different AI tasks cost different amounts. Text = 2, Lookup = 5, Image = 10.',
        2:'<br><strong style="color:var(--color-primary)">🧠 AI concept:</strong> Model Selection — Premium AI handles harder tasks but costs more (like GPT-4 vs GPT-3.5).',
        3:'<br><strong style="color:var(--color-primary)">🧠 AI concept:</strong> Batch Processing — grouping identical tasks saves 15%, just like real-world batch APIs.',
        4:'<br><strong style="color:var(--color-primary)">🧠 AI concept:</strong> Priority / SLA Tiering — priority costs 2x but adds budget. Real AI services have tiered SLAs.',
        5:'<br><strong style="color:var(--color-primary)">🧠 AI concept:</strong> Combined Optimization — real AI uses all strategies together: model choice, batch, priority, and cache.',
        6:'<br><strong style="color:var(--color-primary)">🧠 AI concept:</strong> Autonomous Allocation — a trained AI allocates tokens independently, choosing optimal strategies.',
        7:'<br><strong style="color:var(--color-primary)">🧠 AI concept:</strong> Enterprise Scale — trained AI handles high-volume workloads at production speed.',
      };
      if (lesson && state.currentLevel < 6) {
        els.resultMessage.innerHTML += '<br><br><em>🤖 Nova learned: ' + lesson + '</em>' + (aiConceptsL15[state.currentLevel]||'');
      } else if (state.currentLevel === 6) {
        els.resultMessage.innerHTML += '<br><br><em>🤖 Nova demonstrates: She allocated tokens for every remaining settler using ALL strategies she learned from you. Vega nods: "She is ready."</em>' + (aiConceptsL15[6]||'');
      } else if (state.currentLevel === 7) {
        els.resultMessage.innerHTML += '<br><br><em>🚀 Nova at scale: 20 settlers processed at enterprise speed. Vega smiles: "This system could run any spaceport on Earth.</em>' + (aiConceptsL15[7]||'') + '"';
      }
    } else {
      els.resultIcon.innerHTML = '<span style="color:var(--color-warning)">' + Svg.warning + '</span>';
      els.resultTitle.textContent = 'Not Quite...';
      els.resultStars.textContent = '';
      els.resultMessage.textContent = result.message;
    }

    let metricsHtml = '';
    metricsHtml += '<div class="metric-item"><div class="metric-val">' + state.processedCount + '/' + state.citizens.length + '</div><div class="metric-label">Processed</div></div>';
    metricsHtml += '<div class="metric-item"><div class="metric-val">' + Math.round(state.spent) + '</div><div class="metric-label">Spent</div></div>';
    metricsHtml += '<div class="metric-item"><div class="metric-val">' + Math.round(state.remaining) + '</div><div class="metric-label">Remaining</div></div>';
    metricsHtml += '<div class="metric-item"><div class="metric-val">' + result.stars + '/3</div><div class="metric-label">Stars</div></div>';
    els.resultMetrics.innerHTML = metricsHtml;

    els.retryBtn.style.display = '';
    els.retryBtn.textContent = 'Try Again';
    if (result.passed && state.currentLevel < 5) {
      els.nextBtn.style.display = '';
      els.nextBtn.innerHTML = 'Next Level &rarr;';
    } else if (result.passed && state.currentLevel === 5) {
      els.nextBtn.style.display = '';
      els.nextBtn.innerHTML = 'Watch Nova Demo &rarr;';
    } else if (result.passed && state.currentLevel === 6) {
      els.nextBtn.style.display = '';
      els.nextBtn.innerHTML = 'Nova at Scale &rarr;';
    } else if (result.passed && state.currentLevel === 7) {
      els.nextBtn.style.display = '';
      els.nextBtn.innerHTML = 'AI Enterprise Ready!';
    } else {
      els.nextBtn.style.display = 'none';
    }
    els.resultMenuBtn.textContent = 'Back to Levels';

    els.resultOverlay.classList.add('active');

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
    const colors = ['#38bdf8', '#22c55e', '#fbbf24', '#ef4444', '#eab308', '#a78bfa'];
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

  // ── Narrative Story Functions ──
  const CHAPTERS = {
    1: { number:'One',   title:'System Reboot',
      story:'The main AI crashed at 0300. Nova remembers nothing. You and I are the only verification system left. Start with the basics — text checks and photo IDs.' },
    2: { number:'Two',   title:'Damaged Documents',
      story:'Outpost 3 had a flood. Their papers are water-stained and handwritten. Premium AI can handle them — but it costs more per document.' },
    3: { number:'Three', title:'Colony Groups',
      story:'Four families from Outpost 7 just touched down. Same documents, same outpost. If you batch them together, the uplink saves bandwidth.' },
    4: { number:'Four',  title:'VIP Arrivals',
      story:'Governor Patel and her staff are here. Priority clearance brings extra bandwidth from command — but the checks cost double.' },
    5: { number:'Five',  title:'Final Sign-Offs',
      story:'Most settlers completed pre-checks last week. Their data is cached — cheaper to verify again. Combine everything you have learned.' },
    6: { number:'Six',   title:'Nova Takes Command',
      story:'T-minus 10 minutes. Nova — you have learned every strategy. The remaining settlers are yours. Prove what you can do.' },
    7: { number:'Seven', title:'Full-Scale Terminal',
      story:'Mission accomplished. Now let us see this system handle a full immigration terminal — enterprise scale, lightning speed.' },
  };

  const VEGA_MESSAGES = {
    1: 'The crew is unloading equipment. Nova is all we have. Make every token count.',
    2: 'Water-damaged documents from Outpost 3. Use Premium only where you have to.',
    3: 'The Chen family from Outpost 7 — four settlers together. Batch them and save.',
    4: 'Governor Patel is here. Priority mode brings extra budget but spend it wisely.',
    5: 'Most settlers are returning for final sign-off. Their cached data saves us tokens.',
    6: 'T-minus 10 and counting. Nova, you have the conn. I am right here.',
    7: 'Incredible. This system just processed 20 settlers at lightning speed.',
  };

  const NOVA_MOODS = {
    1: 'scrambled',  2: 'recovering', 3: 'learning',
    4: 'determined', 5: 'master',     6: 'autonomous', 7: 'scale',
  };

  const NOVA_MOOD_EMOJI = {
    scrambled: '😵', recovering: '😊', learning: '🤔',
    determined: '😤', master: '🧠', autonomous: '😎', scale: '🚀',
  };

  const GROWTH_LABELS = ['Offline','Rebooting','Basic','Advanced','Optimized','Autonomous','Enterprise'];

  let _lastNarrativeLevel = 0;
  let _introPlayed = false;

  /** Speak the intro story on first load */
  function speakIntroStory() {
    setTimeout(function() {
      var story = 'The colony ship Endeavour departs for Mars today. Every settler needs AI verification before boarding. Nova your AI crashed at 0300. Rebuild her with a limited token budget and get everyone through in time.';
      speakTTS(story);
    }, 1200);
  }

  function showChapterCard(level) {
    try {
      const ch = CHAPTERS[level];
      if (!ch) return;
      els.chapterNumber.textContent = 'Chapter ' + ch.number;
      els.chapterTitle.textContent = ch.title;
      els.chapterStory.textContent = '"' + ch.story + '"';
      els.chapterCard.classList.remove('hidden');
      const inner = els.chapterCard.querySelector('.chapter-card-inner');
      if (inner) inner.classList.remove('chapter-card-out');
      if (window._chapterTimer) clearTimeout(window._chapterTimer);
      window._chapterTimer = setTimeout(hideChapterCard, 5000);
      // Speak the chapter story
      setTimeout(function(){speakTTS('Chapter ' + ch.number + ': ' + ch.title + '. ' + ch.story)}, 600);
    } catch (e) { /* Silent fail — story never blocks gameplay */ }
  }

  function hideChapterCard() {
    try {
      if (window._chapterTimer) { clearTimeout(window._chapterTimer); window._chapterTimer = null; }
      const inner = els.chapterCard.querySelector('.chapter-card-inner');
      if (inner) inner.classList.add('chapter-card-out');
      setTimeout(() => {
        els.chapterCard.classList.add('hidden');
        if (inner) inner.classList.remove('chapter-card-out');
      }, 300);
    } catch (e) { /* Silent fail */ }
  }

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

  function updateVegaMessage(level) {
    const msg = VEGA_MESSAGES[level];
    if (!msg) { els.vegaCard.classList.add('hidden'); return; }
    els.vegaMsg.textContent = msg;
    els.vegaCard.classList.remove('hidden');
    els.vegaCard.style.animation = 'none';
    els.vegaCard.offsetHeight;
    els.vegaCard.style.animation = '';
    setTimeout(function(){speakTTS(msg)}, 400);
  }

  function updateNovaMood(level) {
    const moodKey = NOVA_MOODS[level];
    if (!moodKey) return;
    const emoji = NOVA_MOOD_EMOJI[moodKey] || '😵';
    if (els.novaMood) {
      els.novaMood.textContent = emoji;
      els.novaMood.className = 'nova-mood nova-mood-' + moodKey;
    }
  }

  function updateGrowthMeter() {
    try {
      let completed = 0;
      for (let i = 1; i <= 7; i++) {
        if (localStorage.getItem('tokenomics_' + i + '_done')) completed++;
      }
      const pct = Math.min(100, (completed / 7) * 100);
      if (els.novaGrowthFill) els.novaGrowthFill.style.width = pct + '%';
      const labelIdx = Math.min(completed, GROWTH_LABELS.length - 1);
      if (els.novaGrowthLabel) els.novaGrowthLabel.textContent = 'System: ' + GROWTH_LABELS[labelIdx];
      if (els.novaGrowth) els.novaGrowth.classList.remove('hidden');
    } catch (e) { /* Silent fail */ }
  }

  // ── Helpers ──
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Game Callbacks ──
  function onGameStateChange(state) {
    updateAll(state);

    // Narrative: detect level transitions
    if (state.currentLevel !== _lastNarrativeLevel && state.currentLevel >= 1) {
      _lastNarrativeLevel = state.currentLevel;
      updateVegaMessage(state.currentLevel);
      updateNovaMood(state.currentLevel);
      updateGrowthMeter();
      // Show chapter card on level change (not on initial page load from L1)
      if (state.phase !== 'idle' || state.currentLevel !== 1) {
        setTimeout(() => showChapterCard(state.currentLevel), 200);
      } else {
        // First load: show chapter card with a brief delay
        setTimeout(() => showChapterCard(state.currentLevel), 600);
      }
    }
  }

  function onGameToggleChange(toggles) {
    updateCurrentCitizen(Game.getState());
    updateBudgetDisplay(Game.getState());
  }

  function onGameModelChange(modelTiers) {
    updateModelTiers(Game.getState());
    updateCurrentCitizen(Game.getState());
    updateBudgetDisplay(Game.getState());
  }

  function onGameBatchUpdate(batch) {
    updateBatchArea(Game.getState());
    updateCitizenQueue(Game.getState());
  }

  function onGameCitizenProcessed(citizen) {
    Audio.playProcess();
    updateCitizenQueue(Game.getState());
    updateBudgetDisplay(Game.getState());
    updateCurrentCitizen(Game.getState());
    updateBatchArea(Game.getState());
  }

  // ── Final Exam ──
  const EXAM_QUESTIONS = [
    { concept:'Budgeting',emoji:'💰',
      q:'Looking at a picture takes more computer power than reading a sentence. What does that mean for cost?',
      a:['A harder job costs more.','Every job costs the same.','Easy jobs cost more.','Cost does not matter.'],correct:0 },
    { concept:'Model Selection',emoji:'🎯',
      q:'A super-smart AI costs more to run than a basic one. When would you use the super-smart one?',
      a:['When you are bored.','When you have no power.','When the question is really hard.','Never — it costs too much.'],correct:2 },
    { concept:'Batch Processing',emoji:'📦',
      q:'The AI has 10 similar jobs to do. Doing them all at once instead of one by one — what happens to cost?',
      a:['It costs more.','It costs less because they share the work.','The AI gets confused.','Nothing changes.'],correct:1 },
    { concept:'Priority / SLA',emoji:'⚡',
      q:'You need the answer NOW. The AI can skip the line and go faster. What is the catch?',
      a:['The answer is wrong.','You get fewer answers.','The AI stops working.','Going faster costs more.'],correct:3 },
    { concept:'Caching',emoji:'💾',
      q:'The AI solved this problem yesterday. Today you ask the same thing. The AI remembers the old answer instead of solving it again. What is this called?',
      a:['Remembering (caching).','Guessing.','Daydreaming.','Restarting.'],correct:0 },
    { concept:'Autonomous AI',emoji:'🤖',
      q:'When can an AI do its job without a human watching every step?',
      a:['When it feels like it.','After it has practiced enough.','Never — humans must always watch.','Only at night.'],correct:1 },
    { concept:'Combined Strategy',emoji:'🧠',
      q:'Good AI systems use many tricks — remembering past answers, grouping jobs, giving fast answers when needed. Why use all of them?',
      a:['One trick always works.','To show off.','To make things harder.','Because different problems need different tricks.'],correct:3 },
    { concept:'Enterprise Scale',emoji:'🚀',
      q:'An AI that can help thousands of people at the same time without slowing down — what must it be good at?',
      a:['Answering one person.','Looking cool.','Being fast and steady even when busy.','Using all the power it can.'],correct:2 },
  ];

  let examCorrect = 0;
  let examIndex = 0;
  let examResults = [];

  function startExam() {
    examCorrect = 0;
    examIndex = 0;
    examResults = [];
    document.getElementById('exam-overlay-L15').style.display = 'flex';
    document.getElementById('exam-results').style.display = 'none';
    document.getElementById('exam-question-area').style.display = '';
    document.getElementById('exam-feedback').style.display = 'none';
    document.getElementById('exam-next-btn').style.display = 'none';
    renderExamQuestion();
  }

  function renderExamQuestion() {
    const q = EXAM_QUESTIONS[examIndex];
    if (!q) { finishExam(); return; }
    document.getElementById('exam-progress').textContent = 'Question ' + (examIndex+1) + ' of ' + EXAM_QUESTIONS.length;
    document.getElementById('exam-concept-icon').textContent = q.emoji + ' ' + q.concept;
    document.getElementById('exam-question').textContent = q.q;
    const letters = ['A','B','C','D'];
    const html = q.a.map((opt,i) =>
      '<button class="exam-choice" data-idx="' + i + '"><span class="exam-letter">' + letters[i] + '</span> ' + opt + '</button>'
    ).join('');
    document.getElementById('exam-choices').innerHTML = html;
    document.getElementById('exam-choices').querySelectorAll('.exam-choice').forEach(btn => {
      btn.addEventListener('click', () => selectAnswer(parseInt(btn.dataset.idx)));
    });
    document.getElementById('exam-feedback').style.display = 'none';
    document.getElementById('exam-next-btn').style.display = 'none';
  }

  function selectAnswer(idx) {
    const q = EXAM_QUESTIONS[examIndex];
    const correct = idx === q.correct;
    const fbEl = document.getElementById('exam-feedback');
    const fbIcon = document.getElementById('exam-feedback-icon');
    const fbText = document.getElementById('exam-feedback-text');
    const choices = document.getElementById('exam-choices').querySelectorAll('.exam-choice');

    // Disable all buttons
    choices.forEach((btn,i) => {
      btn.disabled = true;
      btn.classList.add(i === q.correct ? 'correct' : 'wrong');
      if (i === idx && !correct) btn.classList.add('selected-wrong');
    });

    if (correct) {
      examCorrect++;
      fbIcon.textContent = '✅';
      fbText.textContent = 'Correct! ' + q.concept + ' is about ' + q.a[q.correct].toLowerCase();
    } else {
      fbIcon.textContent = '❌';
      fbText.textContent = 'The answer was: ' + q.a[q.correct];
    }
    examResults.push(correct);
    fbEl.style.display = '';

    const nextBtn = document.getElementById('exam-next-btn');
    if (examIndex < EXAM_QUESTIONS.length - 1) {
      nextBtn.textContent = 'Next →';
    } else {
      nextBtn.textContent = 'See Results';
    }
    nextBtn.style.display = '';
  }

  function finishExam() {
    document.getElementById('exam-question-area').style.display = 'none';
    document.getElementById('exam-feedback').style.display = 'none';
    document.getElementById('exam-next-btn').style.display = 'none';
    document.getElementById('exam-results').style.display = '';

    const stars = examCorrect >= 7 ? 3 : examCorrect >= 5 ? 2 : 1;
    document.getElementById('exam-stars-display').textContent = '⭐'.repeat(stars) + '☆'.repeat(3 - stars);
    document.getElementById('exam-results-text').textContent =
      'You got ' + examCorrect + ' out of ' + EXAM_QUESTIONS.length + ' correct!';

    let recapHtml = '';
    EXAM_QUESTIONS.forEach((q,i) => {
      const wasCorrect = examResults[i] || false;
      recapHtml += '<div class="exam-recap-row">' +
        '<span class="exam-recap-icon">' + (wasCorrect ? '✅' : '❌') + '</span>' +
        '<span>' + q.emoji + ' ' + q.concept + '</span>' +
        '</div>';
    });
    document.getElementById('exam-recap').innerHTML = recapHtml;

    // Speak result
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      var utt = new SpeechSynthesisUtterance('You got ' + examCorrect + ' out of 8 correct in the AI Tokenomics exam.');
      utt.rate = 0.85; utt.volume = 0.85;
      window.speechSynthesis.speak(utt);
    }
  }

  function showMasterCertL15() {
    const overlay=document.getElementById('master-cert-L15');if(!overlay)return;
    const concepts=[
      {emoji:'💰',name:'Budgeting',desc:'AI tasks cost different amounts — text is cheap, images are expensive.',real:'→ OpenAI API pricing, cloud compute'},
      {emoji:'🎯',name:'Model Selection',desc:'Premium AI handles harder tasks but costs more tokens.',real:'→ GPT-4 vs GPT-3.5, model tiers'},
      {emoji:'📦',name:'Batch Processing',desc:'Grouping identical tasks saves 15% — batch discount.',real:'→ OpenAI batch API, bulk discounts'},
      {emoji:'⚡',name:'Priority / SLA',desc:'Priority costs 2x but adds budget — like express delivery.',real:'→ Cloud SLA tiers, priority queues'},
      {emoji:'🧠',name:'Combined Strategy',desc:'Real AI uses all strategies together for best results.',real:'→ Multi-strategy optimization'},
      {emoji:'🤖',name:'Autonomous AI',desc:'Trained AI allocates tokens independently.',real:'→ Auto-scaling, autonomous systems'},
      {emoji:'🚀',name:'Enterprise Scale',desc:'AI handles high-volume workloads at speed.',real:'→ Production AI, enterprise APIs'}
    ];
    const grid=document.getElementById('certGridL15');
    if(grid)grid.innerHTML=concepts.map(c=>'<div class="cert-item"><span class="cert-ci">'+c.emoji+'</span><span class="cert-cn">'+c.name+'</span><span class="cert-cd">'+c.desc+'</span><span class="cert-cr">'+c.real+'</span></div>').join('');
    const stats=document.getElementById('certStatsL15');
    if(stats){
      const state=Game.getState();
      const lsd=state.levelScores||{};
      const totalStars=Object.keys(lsd).reduce((s,k)=>s+(lsd[k]&&lsd[k].stars?lsd[k].stars:0),0);
      stats.innerHTML='⭐ Total stars: '+totalStars+'/21 &middot; 🏆 '+Object.keys(lsd).length+'/7 levels completed';
    }
    overlay.style.display='flex';
    setTimeout(function(){speakTTS('Nova is certified! All 7 AI tokenomics concepts completed: Budgeting, Model Selection, Batch Processing, Priority, Combined Strategy, Autonomous AI, and Enterprise Scale. You taught an AI how to budget tokens like a real cloud engineer!')}, 800);
  }

  function onGameLevelComplete(result) {
    const state = Game.getState();
    showLevelResult(result, state);
    Audio.playComplete(result.passed);

    // Master certification after level 7 — show exam first
    if(result.passed&&state.currentLevel===7){
      setTimeout(()=>startExam(),800);
    }

    if (result.passed && state.currentLevel < 5) {
      setTimeout(() => {
        const nextLv = state.currentLevel + 1;
        const nextLevel = Game.LEVELS[nextLv];
        showToast('Unlocked: ' + (nextLevel ? nextLevel.name : ''), 'success');
      }, 1500);
    }
  }

  function onGameBudgetWarning(message) {
    Audio.playBudgetWarning();
    showToast(message, 'warning');
  }

  // ── Init everything ──
  document.addEventListener('DOMContentLoaded', () => {
    init();

    // Speak the intro story
    speakIntroStory();

    Game.init({
      onStateChange: onGameStateChange,
      onToggleChange: onGameToggleChange,
      onModelChange: onGameModelChange,
      onBatchUpdate: onGameBatchUpdate,
      onCitizenProcessed: onGameCitizenProcessed,
      onLevelComplete: onGameLevelComplete,
      onBudgetWarning: onGameBudgetWarning
    });

    // Master certification back button
    document.getElementById('certBackL15').addEventListener('click',()=>{
      document.getElementById('master-cert-L15').style.display='none';
    });

    // Exam buttons
    document.getElementById('exam-next-btn').addEventListener('click',()=>{
      examIndex++;
      if (examIndex >= EXAM_QUESTIONS.length) {
        finishExam();
      } else {
        renderExamQuestion();
      }
    });
    document.getElementById('exam-cert-btn').addEventListener('click',()=>{
      document.getElementById('exam-overlay-L15').style.display='none';
      showMasterCertL15();
    });

    Transcript.init();
    Settings.init();
    Conversation.init({
      onStateChange: (state) => {
        const dot = document.getElementById('ai-state-dot');
        if (dot) {
          dot.className = 'ai-state-dot ' + state;
        }
      },
      onResponse: (childText, aiText) => {
        const bubble = document.getElementById('nova-speech-bubble');
        const text = document.getElementById('nova-speech-text');
        if (bubble && text) {
          text.textContent = aiText;
          bubble.classList.add('show');
          setTimeout(() => {
            if (bubble && Conversation.getState && Conversation.getState() !== 'speaking') {
              bubble.classList.remove('show');
            }
          }, 4000);
        }
      }
    });

    updateAll(Game.getState());
    Conversation.startIdleTimer && Conversation.startIdleTimer();
  });

  return { init, showToast, updateAll, showLevelResult };
})();
