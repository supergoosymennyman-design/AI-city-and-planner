/**
 * game.js — Main game state machine & orchestrator
 *
 * State flow: INIT → LOADING → MENU → LEVEL_SELECT → ANNOTATING → SUBMITTED → RESULT
 */
const Game = (() => {
  'use strict';

  const MAX_LEVEL = 6;
  const PHASE = { INIT: 'init', LOADING: 'loading', MENU: 'menu', LEVEL_SELECT: 'level_select', ANNOTATING: 'annotating', SUBMITTING: 'submitting', RESULT: 'result', CELEBRATION: 'celebration' };

  let phase = PHASE.INIT, currentLevel = 1, levelScores = {}, totalStars = 0, isSubmitting = false;
  let loadingEl, menuEl, mainAreaEl, resultOverlayEl, instructionBar, submitBtn, debugBtn;

  function init() {
    loadingEl = document.getElementById('loading-screen');
    menuEl = document.getElementById('menu-screen');
    mainAreaEl = document.getElementById('main-area');
    instructionBar = document.getElementById('instruction-bar');
    submitBtn = document.getElementById('submit-btn');
    debugBtn = document.getElementById('debug-btn');
    resultOverlayEl = document.getElementById('result-overlay');

    Transcript.init();
    Settings.init();
    Conversation.init({
      onStateChange: (state) => {
        // State change handled internally via DOM element
      },
      onResponse: (childText, aiText, intentId) => {
        // Response logged to transcript by conversation.js internally
      }
    });

    document.getElementById('start-btn').addEventListener('click', () => { showLoading(false); showMenu(false); enterLevelSelect(); });
    if (submitBtn) submitBtn.addEventListener('click', handleSubmit);
    if (debugBtn) debugBtn.addEventListener('click', () => {
      const active = Annotator.toggleDebug();
      debugBtn.classList.toggle('active', active);
      showToast(active ? 'Debug mode ON' : 'Debug mode OFF', 'info');
    });

    document.getElementById('retry-btn').addEventListener('click', retryLevel);
    document.getElementById('next-btn').addEventListener('click', goNextLevel);
    document.getElementById('result-menu-btn').addEventListener('click', enterLevelSelect);
    document.getElementById('celebrate-btn').addEventListener('click', () => {
      document.getElementById('celebration-screen').classList.remove('active');
      enterLevelSelect();
    });

    document.querySelectorAll('.level-tab').forEach(tab => {
      tab.addEventListener('click', () => { const l = parseInt(tab.dataset.level); if (l) selectLevel(l); });
    });

    document.addEventListener('annotator-retry', () => {
      // Re-select the current level (determined by which timed level was active)
      const timedLevel = Annotator.getRoundLevel();
      selectLevel(timedLevel > 0 ? timedLevel : MAX_LEVEL);
    });
    document.addEventListener('timed-menu', () => enterLevelSelect());
    document.addEventListener('timed-rounds-complete', (e) => {
      const { correct, total, passed, level } = e.detail;
      levelScores[level] = { correct, total, stars: passed ? 3 : (correct >= 3 ? 2 : 1), passed };
      updateScoreDisplay();
      updateLevelTabs();
      if (passed) {
        Conversation.speak('Excellent speed! You got ' + correct + ' out of ' + total + '!');
      }
      const allLevels = Array.from({length: MAX_LEVEL}, (_, i) => i + 1);
      const allPassed = allLevels.every(l => levelScores[l] && levelScores[l].passed);
      if (allPassed) {
        setTimeout(() => showCelebration(), 1500);
      }
    });

    Conversation.startIdleTimer();
    Annotator.init('annotation-zone');

    phase = PHASE.LOADING;
    showLoading(true);
    setTimeout(() => { showLoading(false); showMenu(true); phase = PHASE.MENU; }, 1200);
  }

  function showLoading(show) { if (loadingEl) loadingEl.classList.toggle('hidden', !show); }
  function showMenu(show) { if (menuEl) menuEl.classList.toggle('hidden', !show); }

  function enterLevelSelect() {
    phase = PHASE.LEVEL_SELECT;
    showMenu(false);
    if (mainAreaEl) mainAreaEl.style.display = 'flex';
    showResultOverlay(false);
    Annotator.reset();
    if (instructionBar) instructionBar.textContent = 'Select a level above to start annotating!';
    if (submitBtn) { submitBtn.disabled = true; submitBtn.style.display = ''; }
    updateLevelTabs();
    updateScoreDisplay();
    // Welcome message shown visually; Botly only speaks when addressed (passive AI rule)
    if (!Object.keys(levelScores).length) {
      const welcomeEl = document.getElementById('instruction-bar');
      if (welcomeEl) welcomeEl.innerHTML = '<span class="level-badge">👋</span> Pick a level above to start training the AI vision system. Say "Botly" for help!';
    }
  }

  function selectLevel(level) {
    // Validate level number
    const levelData = Levels.getLevel(level);
    if (!levelData || level < 1 || level > MAX_LEVEL) {
      showToast('Level ' + level + ' not found! Please select a valid level.', 'warning');
      if (phase !== PHASE.LEVEL_SELECT) enterLevelSelect();
      return;
    }
    currentLevel = level;
    phase = PHASE.ANNOTATING;
    showResultOverlay(false);
    if (instructionBar) instructionBar.innerHTML = '<span class="level-badge">L' + level + '</span> ' + levelData.instruction;
    updateLevelTabs();
    const isTimed = levelData.style === 'feature_select_timed';
    if (submitBtn) {
      submitBtn.style.display = isTimed ? 'none' : '';
      submitBtn.disabled = true;
      submitBtn.classList.remove('glow');
      submitBtn.textContent = 'Select the correct features...';
    }

    Annotator.loadLevel(level, {
      onSelectionChange: (selectedIds) => { handleSelectionChange(selectedIds); Conversation.resetIdleTimer(); },
      onHotspotTap: (hotspotId, isCorrect, isSelected) => {
        if (!isCorrect && isSelected) {
          Annotator.shakeHotspot(hotspotId);
          showToast('That is not correct! Check the instruction again.', 'error');
          if (!Settings.isMuted()) Conversation.speak(Intents.getResponse('hint', level));
        }
        Conversation.resetIdleTimer();
      }
    });
  }

  function handleSelectionChange(selectedIds) {
    if (phase !== PHASE.ANNOTATING) return;
    const levelData = Levels.getLevel(currentLevel);
    if (!levelData || levelData.style === 'feature_select_timed') return;

    const correctIds = Items.getCorrectIds(currentLevel).sort();
    const selected = [...selectedIds].sort();
    const isComplete = selected.length === correctIds.length && selected.every((id, i) => id === correctIds[i]);

    if (submitBtn) {
      submitBtn.disabled = !isComplete;
      submitBtn.classList.toggle('glow', isComplete);
      submitBtn.textContent = isComplete
        ? 'Submit to AI Model \u2713'
        : 'Select ' + correctIds.length + ' features...';
    }
  }

  function handleSubmit() {
    if (isSubmitting || phase !== PHASE.ANNOTATING) return;
    isSubmitting = true;
    const levelData = Levels.getLevel(currentLevel);
    if (!levelData || levelData.style === 'feature_select_timed') { isSubmitting = false; return; }

    const selectedIds = Annotator.getSelected();
    const correctIds = Items.getCorrectIds(currentLevel);
    const wrongIds = Items.getWrongIds(currentLevel);
    const selectedWrong = selectedIds.filter(id => wrongIds.includes(id));
    const passed = selectedIds.filter(id => correctIds.includes(id)).length === correctIds.length && selectedWrong.length === 0;

    if (passed) Annotator.flashSuccess();

    const correctCount = selectedIds.filter(id => correctIds.includes(id)).length;
    let stars = 0;
    if (correctCount === correctIds.length && selectedWrong.length === 0) stars = 3;
    else if (correctCount >= correctIds.length * 0.7) stars = 2;
    else if (correctCount >= correctIds.length * 0.4) stars = 1;

    levelScores[currentLevel] = { correct: correctCount, total: correctIds.length, stars, passed };
    updateScoreDisplay();
    updateLevelTabs();
    phase = PHASE.SUBMITTING;

    setTimeout(() => {
      showResult(true, stars, correctCount, correctIds.length, passed);
      phase = PHASE.RESULT;
      isSubmitting = false;
    }, 300);
  }

  function showResult(show, stars, correct, total, passed) {
    if (!resultOverlayEl) return;
    if (show) {
      document.getElementById('result-emoji').textContent = passed ? '\uD83C\uDFC6' : '\uD83D\uDE22';
      document.getElementById('result-title').textContent = passed ? 'Correct!' : 'Not Quite!';
      document.getElementById('result-score').textContent = '\u2B50'.repeat(stars);
      document.getElementById('result-message').textContent = passed ? 'Great work, data labeler! You trained the AI.' : 'Some items were missed. Check the instructions and try again!';

      document.getElementById('retry-btn').style.display = 'inline-block';
      const nextBtn = document.getElementById('next-btn');
      nextBtn.style.display = (passed && currentLevel < MAX_LEVEL) ? 'inline-block' : 'none';
      nextBtn.textContent = currentLevel >= MAX_LEVEL ? 'Finish' : 'Next Level';
      document.getElementById('result-menu-btn').textContent = passed ? 'Back to Levels' : 'Change Level';

      if (passed) {
        const successMsg = Intents.getLevelSuccess(currentLevel);
        setTimeout(() => Conversation.speak(successMsg), 500);
        if (stars === 3) spawnConfetti();

        // Check if all levels complete
        const allLevels = Array.from({length: MAX_LEVEL}, (_, i) => i + 1);
        const allPassed = allLevels.every(l => levelScores[l] && levelScores[l].passed);
        if (allPassed) {
          setTimeout(() => showCelebration(), 1500);
        }
      } else {
        Conversation.speak('Almost! Check the instruction and try again.');
      }

      resultOverlayEl.classList.add('active');
    } else {
      resultOverlayEl.classList.remove('active');
    }
  }

  function showResultOverlay(show) { if (resultOverlayEl) resultOverlayEl.classList.toggle('active', show); }

  function retryLevel() { showResultOverlay(false); selectLevel(currentLevel); }
  function goNextLevel() { showResultOverlay(false); const next = currentLevel + 1; if (next <= MAX_LEVEL) selectLevel(next); else enterLevelSelect(); }

  function updateScoreDisplay() {
    const el = document.getElementById('score-stars');
    if (!el) return;
    totalStars = 0;
    Object.values(levelScores).forEach(s => totalStars += s.stars || 0);
    el.textContent = '\u2B50'.repeat(Math.min(totalStars, 15));
  }

  function updateLevelTabs() {
    document.querySelectorAll('.level-tab').forEach(tab => {
      const l = parseInt(tab.dataset.level);
      tab.classList.toggle('active', l === currentLevel);
      tab.classList.toggle('completed', levelScores[l] && levelScores[l].passed);
    });
  }

  function showCelebration() {
    const el = document.getElementById('celebration-screen');
    if (!el) return;
    document.getElementById('celebration-stars').textContent = '\u2B50'.repeat(totalStars);
    el.classList.add('active');
    phase = PHASE.CELEBRATION;
    spawnConfetti(40);
    Conversation.speak('Amazing! You completed all ' + MAX_LEVEL + ' levels and trained the AI vision system! You are a data labeling champion!');
  }

  // ── Code block generation ─────────────────────────────────────────────
  function generateCodeBlock() {
    var stars = totalStars || 0;
    var achievements = ['completed-all-levels'];
    if (stars >= 12) achievements.push('excellent-labeler');
    if (stars >= 15) achievements.push('perfect-labeler');
    return {
      version: 1,
      lessonId: 'p5-l1',
      abilityName: 'Recycle-Eye',
      cluster: 'SENSES',
      blockType: 'Vision',
      aiConcept: 'Image classification — AI learns from labeled examples and balanced data',
      bodyPart: 'head',
      earnedAt: new Date().toISOString(),
      achievements: achievements,
      gameData: {
        levelsCompleted: MAX_LEVEL,
        totalStars: stars,
        strategy: stars >= 12 ? 'balanced-dataset' : 'beginner'
      }
    };
  }

  function downloadCodeBlock() {
    var block = generateCodeBlock();
    var blob = new Blob([JSON.stringify(block, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'p5-l1-recycle-eye.codeblock.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // Wire the code block download button after DOM is ready
  setTimeout(function () {
    var btn = document.getElementById('codeblock-btn');
    if (btn) btn.addEventListener('click', downloadCodeBlock);
  }, 0);

  function spawnConfetti(count) {
    count = count || 20;
    const colors = ['#2D6A4F', '#E9C46A', '#39FF14', '#E07A5F', '#4A90D9', '#E8B84B'];
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'confetti-piece';
      p.style.left = Math.random() * 100 + 'vw';
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

  let toastId = 0;
  function showToast(message, type) {
    type = type || 'info';
    const c = document.getElementById('toast-container');
    if (!c) return;
    toastId++;
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.textContent = message;
    t.id = 'toast-' + toastId;
    c.appendChild(t);
    setTimeout(() => { const e = document.getElementById(t.id); if (e) e.remove(); }, 3000);
  }

  return { init, selectLevel, retryLevel, getPhase: () => phase, getCurrentLevel: () => currentLevel, getScores: () => ({ ...levelScores }), showToast };
})();

document.addEventListener('DOMContentLoaded', () => Game.init());
