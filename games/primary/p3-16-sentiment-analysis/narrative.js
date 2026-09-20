/**
 * narrative.js — Nova's narrative engine
 *
 * Listens to game events (level start, correct sort, wrong sort,
 * level complete) and drives Nova's character dialogue, learning
 * transparency popups, and between-level recaps.
 *
 * Two modes:
 *  - Story mode (default): Full narrative, Nova talks, recaps shown
 *  - Arcade mode: No dialogue, dashboard still updates silently
 *
 * Depends on: NarrativeData, LearningDashboard (loaded first)
 */
const Narrative = (() => {
  'use strict';

  // ── State ──
  let currentLevel = 1;
  let storyMode = true;
  let dialogueQueue = [];
  let isProcessing = false;
  let totalLevelCorrect = 0;
  let levelStartTime = 0;

  // Track which level intros/outros have been shown (no repeats on retry)
  let shownIntros = new Set();
  let shownOutros = new Set();
  let shownMilestones = new Set();

  // Recent keyword learned (for popup)
  let lastLearnedKeyword = null;

  // DOM elements
  let novaSpeechEl = null;
  let novaTextEl = null;
  let novaAvatarEl = null;
  let novaExpressionEl = null;
  let overlayEl = null;
  let recapPanelEl = null;

  // ── Initialisation ──
  function init() {
    novaSpeechEl = document.getElementById('nova-speech');
    novaTextEl = document.getElementById('nova-speech-text');
    novaAvatarEl = document.getElementById('nova-avatar');
    novaExpressionEl = document.getElementById('nova-expression');
    overlayEl = document.getElementById('narrative-overlay');
    recapPanelEl = document.getElementById('recap-panel');

    // Determine mode from settings if available
    if (window.Settings && Settings.getStoryMode !== undefined) {
      storyMode = Settings.getStoryMode();
    } else {
      storyMode = true;
    }

    // Subscribe to mode changes
    if (window.Settings) {
      const origOpen = Settings.open;
      // We don't override — we check mode dynamically
    }
  }

  // ── Mode Control ──
  function setStoryMode(enabled) {
    storyMode = enabled;
    if (!enabled) {
      // Hide any active narrative UI
      hideNovaSpeech();
      hideOverlay();
      hideRecap();
      dialogueQueue = [];
      isProcessing = false;
    }
  }

  function isStoryMode() { return storyMode; }

  // ── Core Event Handlers ──

  /**
   * Called when a level starts (after level intro screen).
   */
  function onLevelStart(level) {
    currentLevel = level;
    totalLevelCorrect = 0;
    levelStartTime = Date.now();

    if (!storyMode) return;

    // Show Nova's intro dialogue (only first time this level is attempted)
    if (!shownIntros.has(level)) {
      const dialogue = NarrativeData.LEVEL_DIALOGUE[level];
      if (dialogue && dialogue.intro && dialogue.intro.length > 0) {
        const text = dialogue.intro[Math.floor(Math.random() * dialogue.intro.length)];
        enqueueDialogue(text, 3000);
      }
      shownIntros.add(level);
    }

    updateNovaExpression(level);
  }

  /**
   * Called when a correct sort happens.
   * cardData: { t, s, dept, k, isMixed, ... }
   * deptId: 'parks' | 'transit' | 'waste'
   */
  function onCorrectSort(cardData, deptId) {
    totalLevelCorrect++;

    if (!storyMode) return;

    const levelData = NarrativeData.LEVEL_DIALOGUE[currentLevel];
    if (!levelData) return;

    // Notify learning dashboard
    if (window.LearningDashboard) {
      const newlyLearned = LearningDashboard.recordCorrectSort(cardData, deptId);
      if (newlyLearned && newlyLearned.length > 0) {
        lastLearnedKeyword = newlyLearned[0];
      }
    }

    // Check for learning milestones
    const msKey = currentLevel + '-correct-' + totalLevelCorrect;
    if (levelData.learningMilestone && levelData.learningMilestone[totalLevelCorrect]) {
      if (!shownMilestones.has(msKey)) {
        const text = levelData.learningMilestone[totalLevelCorrect];
        enqueueDialogue(text, 2500);
        shownMilestones.add(msKey);
        return;
      }
    }

    // Show level-specific correct dialogue (with %50 chance to reduce repetition)
    if (Math.random() < 0.5) {
      const keywords = cardData.k || [];
      const keyword = keywords.length > 0 ? keywords[0] : 'the';
      const deptName = NarrativeData.DEPT_NAMES[deptId] || deptId;
      const score = cardData.s || 0;
      const readable = NarrativeData.sentimentReadable(score);
      const sentiment = NarrativeData.sentimentLabel(score);

      const templates = levelData.correct;
      if (templates && templates.length > 0) {
        let text = templates[Math.floor(Math.random() * templates.length)];
        text = text
          .replace('{{keyword}}', keyword)
          .replace('{{keywordlist}}', keywords.join(', '))
          .replace('{{dept}}', deptName)
          .replace('{{deptId}}', deptId)
          .replace('{{score}}', score)
          .replace('{{sentiment}}', sentiment)
          .replace('{{readable}}', readable)
          .replace('{{confidence}}', Math.min(99, 60 + LearningDashboard.getKeywordCount() * 3));
        enqueueDialogue(text, 2000);
      }
    }

    // Show learn notification popup for NEW keywords
    if (lastLearnedKeyword && window.LearningDashboard) {
      showLearnNotif('Nova learned "' + lastLearnedKeyword + '" → ' +
        (NarrativeData.DEPT_NAMES[deptId] || deptId));
      lastLearnedKeyword = null;
    }
  }

  /**
   * Called when a wrong sort happens.
   */
  function onWrongSort(cardData, attemptedDept) {
    if (!storyMode) return;

    if (window.LearningDashboard) {
      LearningDashboard.recordWrongSort(cardData, attemptedDept);
    }

    // Only show wrong dialogue occasionally (to avoid annoyance)
    if (Math.random() < 0.35) {
      const levelData = NarrativeData.LEVEL_DIALOGUE[currentLevel];
      if (!levelData) return;

      const keywords = cardData.k || [];
      const keyword = keywords.length > 0 ? keywords[0] : 'the';
      const suggested = NarrativeData.DEPT_NAMES[cardData.dept || cardData.primary] || 'another department';
      const attempted = NarrativeData.DEPT_NAMES[attemptedDept] || attemptedDept;

      const templates = levelData.wrong;
      if (templates && templates.length > 0) {
        let text = templates[Math.floor(Math.random() * templates.length)];
        text = text
          .replace('{{keyword}}', keyword)
          .replace('{{attempted}}', attempted)
          .replace('{{suggestion}}', suggested)
          .replace('{{score}}', cardData.s || 0)
          .replace('{{sentiment}}', NarrativeData.sentimentLabel(cardData.s || 0))
          .replace('{{readable}}', NarrativeData.sentimentReadable(cardData.s || 0))
          .replace('{{primary}}', NarrativeData.DEPT_NAMES[cardData.primary] || '')
          .replace('{{secondary}}', NarrativeData.DEPT_NAMES[cardData.secondary] || '');
        enqueueDialogue(text, 2000);
      }
    }
  }

  /**
   * Called when a level is completed (passed or failed).
   */
  function onLevelComplete(level, passed) {
    if (window.LearningDashboard) {
      if (passed) LearningDashboard.completeLevel(level);
    }

    if (!storyMode) return;

    if (passed && !shownOutros.has(level)) {
      const levelData = NarrativeData.LEVEL_DIALOGUE[level];
      if (levelData && levelData.outro && levelData.outro.length > 0) {
        const metrics = LearningDashboard.getMetrics();
        let text = levelData.outro[Math.floor(Math.random() * levelData.outro.length)];
        text = text
          .replace('{{count}}', metrics.keywordCount)
          .replace('{{list}}', metrics.keywordCount > 0
            ? LearningDashboard.getKeywordList().slice(0, 6).map(e => '"' + e.word + '"').join(', ')
            : 'none so far')
          .replace('{{correct}}', totalLevelCorrect)
          .replace('{{total}}', level === 5 ? 12 : (level === 3 ? 8 : 6));

        // Show recap panel if available (only first time)
        showRecap(level, text);
        shownOutros.add(level);
        return;
      }
    }
  }

  // ── Dialogue Queue ──

  function enqueueDialogue(text, duration) {
    dialogueQueue.push({ text, duration: duration || 4000 });
    if (!isProcessing) processQueue();
  }

  function processQueue() {
    if (dialogueQueue.length === 0) {
      isProcessing = false;
      return;
    }
    isProcessing = true;
    const item = dialogueQueue.shift();
    showNovaSpeech(item.text);

    setTimeout(() => {
      hideNovaSpeech();
      // Small gap between dialogues
      setTimeout(processQueue, 400);
    }, item.duration);
  }

  // ── UI: Nova Speech Bubble ──

  function showNovaSpeech(text) {
    if (!novaTextEl || !novaSpeechEl) return;
    novaTextEl.textContent = text;
    novaSpeechEl.classList.add('show');
  }

  function hideNovaSpeech() {
    if (!novaSpeechEl) return;
    novaSpeechEl.classList.remove('show');
  }

  // ── UI: Nova Expression ──

  function updateNovaExpression(level) {
    if (!novaExpressionEl) return;
    const arc = NarrativeData.CHARACTER_ARC[level];
    if (arc) {
      novaExpressionEl.textContent = arc.emoji;
      novaExpressionEl.setAttribute('aria-label', arc.title);
    }
    if (novaAvatarEl) {
      novaAvatarEl.dataset.confidence = arc ? arc.confidence : 'low';
    }
  }

  // ── UI: Learn Notification Popup ──

  let notifTimer = null;

  function showLearnNotif(text) {
    const el = document.getElementById('nova-learn-notif');
    if (!el) return;
    el.textContent = '📖 ' + text;
    el.classList.add('show');
    if (notifTimer) clearTimeout(notifTimer);
    notifTimer = setTimeout(() => {
      el.classList.remove('show');
    }, 3000);
  }

  // ── UI: Between-Level Recap ──

  function showRecap(level, outroText) {
    if (!recapPanelEl || !overlayEl) return;

    const templateData = NarrativeData.RECAP_TEMPLATES[level];
    if (!templateData) return;

    const metrics = LearningDashboard.getMetrics();

    let beforeHtml = templateData.before || '';
    let afterHtml = (templateData.after || '')
      .replace('{{count}}', metrics.keywordCount)
      .replace('{{correct}}', totalLevelCorrect)
      .replace('{{total}}', level === 5 ? 12 : (level === 3 ? 8 : 6));

    const aiConcept = NarrativeData.LEVEL_DIALOGUE[level] &&
      NarrativeData.LEVEL_DIALOGUE[level].aiConcept || '';

    recapPanelEl.innerHTML =
      '<div class="recap-card">' +
      '<div class="recap-emoji">' + templateData.emoji + '</div>' +
      '<h3 class="recap-title">' + templateData.title + '</h3>' +
      '<div class="recap-compare">' +
      '<div class="recap-side">' +
      '<span class="recap-label">BEFORE</span>' +
      '<p>' + beforeHtml + '</p>' +
      '</div>' +
      '<div class="recap-arrow">→</div>' +
      '<div class="recap-side">' +
      '<span class="recap-label">AFTER</span>' +
      '<p>' + afterHtml + '</p>' +
      '</div>' +
      '</div>' +
      '<div class="recap-concept">' +
      '<strong>🤖 AI Concept:</strong> ' + aiConcept +
      '</div>' +
      '<div class="recap-nova">' +
      '<span class="recap-nova-icon">' + (NarrativeData.CHARACTER_ARC[level]?.emoji || '😊') + '</span> ' +
      outroText +
      '</div>' +
      '<button class="recap-continue-btn" onclick="window.Narrative.hideRecap()">Continue →</button>' +
      '</div>';

    overlayEl.classList.add('show');
    recapPanelEl.classList.add('show');
  }

  function hideRecap() {
    if (overlayEl) overlayEl.classList.remove('show');
    if (recapPanelEl) recapPanelEl.classList.remove('show');
  }

  function hideOverlay() {
    if (overlayEl) overlayEl.classList.remove('show');
  }

  // ── AI Demo Extension ──
  // Called when Level 6 (AI Demo) starts

  function onAIDemoStart() {
    if (!storyMode) return;

    const introText = 'You\'ve taught me through ' +
      (LearningDashboard.getMetrics().levelsCompleted) +
      ' lessons — keyword matching, sentiment urgency, speed, mixed topics, and crisis management. ' +
      'Every single card you sorted was training data for my mind. And now... I want to show you what I can do. Just watch.';

    enqueueDialogue(introText, 3500);
  }

  function onAIDemoComplete() {
    if (!storyMode) return;

    const outroText = 'I couldn\'t have done any of this without you. When I was first deployed, I knew ZERO keywords, ' +
      'couldn\'t tell anger from gratitude, and had no idea what to do with mixed-topic emails. Now I can sort faster ' +
      'than any human ever could. You didn\'t just play a game — you taught an AI how to do a real job. Thank you, teacher.';

    enqueueDialogue(outroText, 8000);
  }

  // ── Public API ──
  const api = {
    init,
    setStoryMode,
    isStoryMode,
    onLevelStart,
    onCorrectSort,
    onWrongSort,
    onLevelComplete,
    onAIDemoStart,
    onAIDemoComplete,
    hideRecap,
    showLearnNotif,
    updateNovaExpression,
    // Used by recap panel button
    hideOverlay,
  };
  return api;
})();
// Expose on window for inline scripts (const doesn't set window property)
try { window.Narrative = Narrative; } catch(e) {}
