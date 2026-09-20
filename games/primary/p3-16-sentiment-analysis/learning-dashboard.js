/**
 * learning-dashboard.js — Nova's learning metrics panel
 *
 * Three live metrics showing what Nova is learning:
 * - Keyword Dictionary: words → departments learned
 * - Sentiment Interpreter: emotion → urgency patterns
 * - Topic Disambiguator: mixed-topic → primary complaint
 *
 * Each metric animates on update and can be expanded.
 * Modal overlay shows detailed learned rules.
 */

const LearningDashboard = (() => {
  'use strict';

  // DOM elements (cached on init)
  let panelEl = null;
  let kwBarEl = null;
  let kwCountEl = null;
  let sentBarEl = null;
  let sentCountEl = null;
  let topicBarEl = null;
  let topicCountEl = null;
  let detailEl = null;
  let toggleBtn = null;

  // Learning metrics
  let keywordMap = new Map();       // word → department
  let sentimentPatterns = 0;
  let disambiguations = 0;
  let totalCorrect = 0;
  let totalWrong = 0;
  let levelsCompleted = new Set();

  // Keeps track of which keywords to show as "recently learned"
  let recentLearned = [];
  let recentTimer = null;

  let isVisible = false;

  function init() {
    panelEl = document.getElementById('learning-dashboard');
    kwBarEl = document.getElementById('ld-kw-bar');
    kwCountEl = document.getElementById('ld-kw-count');
    sentBarEl = document.getElementById('ld-sent-bar');
    sentCountEl = document.getElementById('ld-sent-count');
    topicBarEl = document.getElementById('ld-topic-bar');
    topicCountEl = document.getElementById('ld-topic-count');
    detailEl = document.getElementById('ld-detail-content');
    toggleBtn = document.getElementById('ld-toggle');

    if (toggleBtn) {
      toggleBtn.addEventListener('click', toggle);
    }

    // Also link the gear icon in settings if dashboard toggle is separate
    // For now, toggle is available in the top bar
  }

  function toggle() {
    if (!panelEl) return;
    isVisible = !isVisible;
    panelEl.classList.toggle('open', isVisible);
    if (isVisible) render();
  }

  function show() {
    if (!panelEl) return;
    isVisible = true;
    panelEl.classList.add('open');
    render();
  }

  function hide() {
    if (!panelEl) return;
    isVisible = false;
    panelEl.classList.remove('open');
  }

  /**
   * Record a correct sort — updates keyword map and metrics.
   * Returns the keyword learned (or null if none new).
   */
  function recordCorrectSort(cardData, deptId) {
    totalCorrect++;
    let newlyLearned = [];

    // Extract keywords from the card
    const keywords = cardData.k || cardData.keywords || [];
    keywords.forEach(kw => {
      const lower = kw.toLowerCase().trim();
      if (lower && !keywordMap.has(lower)) {
        keywordMap.set(lower, deptId);
        newlyLearned.push(lower);
      }
    });

    // Update sentiment patterns (increment for every negative correct sort)
    if (cardData.s && cardData.s < 0) {
      sentimentPatterns = Math.min(100, sentimentPatterns + 2);
    } else if (cardData.s && cardData.s > 0) {
      sentimentPatterns = Math.min(100, sentimentPatterns + 1);
    }

    // Track disambiguation (mixed topic cards)
    if (cardData.isMixed || cardData.mixed) {
      disambiguations = Math.min(100, disambiguations + 5);
    }

    // Track recently learned for popup
    if (newlyLearned.length > 0) {
      recentLearned = newlyLearned.map(kw => ({ word: kw, dept: deptId }));
      if (recentTimer) clearTimeout(recentTimer);
      recentTimer = setTimeout(() => { recentLearned = []; }, 4000);
    }

    // Re-render
    render();

    return newlyLearned.length > 0 ? newlyLearned : null;
  }

  /**
   * Record a wrong sort — tracked for learning process.
   */
  function recordWrongSort(cardData, attemptedDept) {
    totalWrong++;
    render();
  }

  /**
   * Mark a level as completed.
   */
  function completeLevel(level) {
    levelsCompleted.add(level);
    // Topic disambiguation progresses significantly on Level 4
    if (level === 4) {
      disambiguations = Math.min(100, disambiguations + 15);
    }
    render();
  }

  /**
   * Get keyword count.
   */
  function getKeywordCount() {
    return keywordMap.size;
  }

  /**
   * Get sorted keyword entries for display.
   */
  function getKeywordList() {
    const entries = [];
    keywordMap.forEach((dept, word) => {
      entries.push({ word, dept });
    });
    entries.sort((a, b) => a.word.localeCompare(b.word));
    return entries;
  }

  /**
   * Get all metrics for narrative use.
   */
  function getMetrics() {
    return {
      keywordCount: keywordMap.size,
      sentimentPercent: Math.min(100, sentimentPatterns),
      disambiguationPercent: Math.min(100, disambiguations),
      totalCorrect,
      totalWrong,
      levelsCompleted: levelsCompleted.size,
      totalLevels: 7,
    };
  }

  /**
   * Calculate keyword progress as a percentage.
   * Max meaningful keywords ≈ 50 (from all data).
   */
  function keywordPercent() {
    return Math.min(100, Math.round((keywordMap.size / 50) * 100));
  }

  /**
   * Re-render the dashboard UI.
   */
  function render() {
    const kwP = keywordPercent();
    const sentP = Math.min(100, sentimentPatterns);
    const topicP = Math.min(100, disambiguations);

    if (kwBarEl) kwBarEl.style.width = kwP + '%';
    if (kwCountEl) kwCountEl.textContent = keywordMap.size;
    if (sentBarEl) sentBarEl.style.width = sentP + '%';
    if (sentCountEl) sentCountEl.textContent = sentP + '%';
    if (topicBarEl) topicBarEl.style.width = topicP + '%';
    if (topicCountEl) topicCountEl.textContent = topicP + '%';

    if (!isVisible) return;

    if (detailEl) {
      const kwEntries = getKeywordList();
      const kwHtml = kwEntries.length === 0
        ? '<div class="ld-empty">No keywords learned yet</div>'
        : kwEntries.map(e =>
            '<span class="ld-kw-tag" style="border-color:' + deptColor(e.dept) + '">' +
            '<span class="ld-kw-word">' + e.word + '</span>' +
            '<span class="ld-kw-dept">' + deptName(e.dept) + '</span></span>'
          ).join('');

      const sentDesc = sentimentPatterns < 20
        ? 'Learning to read scores...'
        : sentimentPatterns < 50
          ? 'Recognising negative = urgent'
          : 'Negative = urgent, positive = routine';

      const topicDesc = disambiguations < 20
        ? 'Not yet trained on mixed topics'
        : disambiguations < 50
          ? 'Learning to weigh sentiment over keywords'
          : 'Can disambiguate primary vs secondary topics';

      detailEl.innerHTML =
        '<div class="ld-section">' +
        '<h4>📖 Keyword Dictionary (' + keywordMap.size + ' words)</h4>' +
        '<div class="ld-kw-list">' + kwHtml + '</div>' +
        '</div>' +
        '<div class="ld-section">' +
        '<h4>💬 Sentiment Patterns</h4>' +
        '<p class="ld-desc">' + sentDesc + '</p>' +
        '</div>' +
        '<div class="ld-section">' +
        '<h4>🔍 Topic Disambiguation</h4>' +
        '<p class="ld-desc">' + topicDesc + '</p>' +
        '</div>';
    }
  }

  function deptColor(deptId) {
    if (deptId === 'parks') return '#4CAF50';
    if (deptId === 'transit') return '#2196F3';
    if (deptId === 'waste') return '#FF9800';
    return '#90A4AE';
  }

  function deptName(deptId) {
    const names = { parks: 'Parks & Rec', transit: 'Transit Auth', waste: 'Waste Mgmt' };
    return names[deptId] || deptId;
  }

  return {
    init,
    toggle,
    show,
    hide,
    recordCorrectSort,
    recordWrongSort,
    completeLevel,
    getMetrics,
    getKeywordCount,
    getKeywordList,
    render,
  };
})();
// Expose on window for inline scripts (const doesn't set window property)
try { window.LearningDashboard = LearningDashboard; } catch(e) {}
