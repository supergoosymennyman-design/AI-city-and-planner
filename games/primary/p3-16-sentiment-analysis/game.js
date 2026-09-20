/**
 * game.js — Core game state machine & orchestrator
 *
 * State flow: INIT → LOADING → MENU → LEVEL_SELECT → LEVEL_INTRO → PLAYING
 *            → LEVEL_RESULT → (next level or AI_DEMO → CELEBRATION)
 *
 * AI narrative: You are TEACHING Nova how to sort and prioritize.
 * Each correct route = training data for the AI.
 * After 7 lessons, Nova demonstrates what it learned in Level 8.
 *
 * Scoring: Sentiment-weighted. Negative (urgent) emails are worth MORE points.
 * This teaches that prioritizing angry citizens is critical.
 */
const Game = (() => {
  'use strict';

  const PHASE = {
    INIT: 'init',
    LOADING: 'loading',
    MENU: 'menu',
    LEVEL_SELECT: 'level_select',
    LEVEL_INTRO: 'level_intro',
    PLAYING: 'playing',
    LEVEL_RESULT: 'level_result',
    AI_DEMO: 'ai_demo',
    CELEBRATION: 'celebration',
  };

  const MAX_LEVEL = 7;       // 7 teaching levels, then AI demo
  const AI_DEMO_LEVEL = 8;   // AI demonstration (special, non-playable)
  const AI_FINALE_COUNT = 25; // Number of emails in the super-speed finale

  let phase = PHASE.INIT;
  let currentLevel = 1;
  let levelScores = {};     // { [level]: { score, maxScore, correct, wrong, overflow, total, passed, stars } }
  let totalStars = 0;

  // Current level tracking
  let levelScore = 0;
  let levelMaxScore = 0;
  let levelCorrect = 0;
  let levelWrong = 0;
  let levelOverflow = 0;
  let levelTotal = 0;
  let wrongStreak = 0;
  let sortedEmailIds = new Set();
  let levelStartTime = 0;
  let levelElapsed = 0;
  let humanBestTime = Infinity;

  // Stores items per level for AI demo replay
  let levelItems = {};

  // Keyword sorter state (Level 1)
  let keywordItems = [];
  let keywordIndex = 0;
  let keywordCorrect = 0;
  let keywordWrong = 0;

  // Priority order state (Level 2)
  let priorityMessages = [];
  let priorityOrder = [];

  // DOM refs
  let loadingEl, menuEl, mainAreaEl;
  let instructionBar, beltArea, chuteArea;
  let resultOverlayEl, celebrationEl, aiDemoEl;

  // Audio context
  let audioCtx = null;

  function init() {
    loadingEl = document.getElementById('loading-screen');
    menuEl = document.getElementById('menu-screen');
    mainAreaEl = document.getElementById('main-area');
    instructionBar = document.getElementById('instruction-bar');
    beltArea = document.getElementById('belt-area');
    chuteArea = document.getElementById('chute-area');
    resultOverlayEl = document.getElementById('result-overlay');
    celebrationEl = document.getElementById('celebration-screen');
    aiDemoEl = document.getElementById('ai-demo-screen');

    Transcript.init();
    Settings.init();
    Belt.init({
      onOverflow: handleBeltOverflow,
      onSpawn: () => {},
    });
    DragEngine.init({
      onDrop: handleDrop,
      onDragStart: () => {},
      onDragEnd: () => {},
    });
    Conversation.init();

    if (window.Narrative) Narrative.init();
    if (window.NovaSVG) NovaSVG.init();
    if (window.NovaComic) NovaComic.init();

    // Wire comic click handler — click/tap to advance panels
    const comicOverlay = document.getElementById('comic-intro');
    if (comicOverlay) {
      comicOverlay.addEventListener('click', () => {
        if (window.NovaComic) NovaComic.handleClick();
      });
    }

    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch(e) {
      audioCtx = null;
    }

    bindButtons();

    phase = PHASE.LOADING;
    showLoading(true);
    showMenu(false);

    setTimeout(() => {
      showLoading(false);
      showMenu(true);
      phase = PHASE.MENU;
      // Speak Nova's greeting on the menu screen after a brief pause
      setTimeout(() => {
        if (window.speechSynthesis) {
          window.speechSynthesis.cancel();
          const msg = 'Hi! I am Nova! I just got hired at the City Help Center. Companies send me emails, but I have no idea where they go! Will you teach me?';
          const utter = new SpeechSynthesisUtterance(msg);
          utter.rate = 0.85;
          utter.volume = 0.85;
          const voices = window.speechSynthesis.getVoices();
          const preferred = voices.find(v => v.name.includes('Google UK') || v.name.includes('Samantha') || v.name.includes('Female'));
          if (preferred) utter.voice = preferred;
          window.speechSynthesis.speak(utter);
        }
      }, 600);
    }, 1000);
  }

  function bindButtons() {
    const startBtn = document.getElementById('start-btn');
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        showMenu(false);
        // Show comic intro on first play
        if (window.NovaComic) {
          NovaComic.show(() => selectLevel(1));
        } else {
          selectLevel(1);
        }
      });
    }

    // Level tabs (1-5 teaching, tab 6 = AI demo, tab 9 = exam)
    document.querySelectorAll('.level-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const l = parseInt(tab.dataset.level);
        if (l === AI_DEMO_LEVEL) {
          // Only allow AI demo if at least one level completed
          const anyPassed = Array.from({ length: MAX_LEVEL }, (_, i) => i + 1)
            .some(ll => levelScores[ll] && levelScores[ll].passed);
          if (!anyPassed) {
            showToast('Complete at least one lesson to unlock the AI demo!', 'warning');
            return;
          }
          startAiDemo();
        } else if (l === 9) {
          // Launch exam directly from level tab
          if (typeof startExam === 'function') startExam();
        } else if (l >= 1 && l <= MAX_LEVEL) {
          selectLevel(l);
        }
      });
    });

    const retryBtn = document.getElementById('retry-btn');
    const nextBtn = document.getElementById('next-btn');
    const menuBtn = document.getElementById('result-menu-btn');

    if (retryBtn) retryBtn.addEventListener('click', retryLevel);
    if (nextBtn) nextBtn.addEventListener('click', goNextLevel);
    if (menuBtn) menuBtn.addEventListener('click', enterLevelSelect);

    const celebrateBtn = document.getElementById('celebrate-btn');
    if (celebrateBtn) {
      celebrateBtn.addEventListener('click', () => {
        if (celebrationEl) celebrationEl.classList.remove('active');
        enterLevelSelect();
      });
    }

    // AI demo buttons
    const aiReplayBtn = document.getElementById('ai-replay-btn');
    if (aiReplayBtn) aiReplayBtn.addEventListener('click', startAiDemo);

    const aiContinueBtn = document.getElementById('ai-continue-btn');
    if (aiContinueBtn) {
      aiContinueBtn.addEventListener('click', () => {
        hideAiDemo();
        showCelebration();
      });
    }

    const debugBtn = document.getElementById('debug-btn');
    if (debugBtn) debugBtn.addEventListener('click', toggleDebug);

    const menuBtn2 = document.getElementById('btn-level-menu');
    if (menuBtn2) menuBtn2.addEventListener('click', showLevelMenu);

    const closeMenuBtn = document.getElementById('btn-close-menu');
    if (closeMenuBtn) closeMenuBtn.addEventListener('click', hideLevelMenu);

    document.querySelectorAll('#level-grid .level-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const l = parseInt(btn.dataset.level);
        if (l === AI_DEMO_LEVEL) {
          hideLevelMenu();
          startAiDemo();
        } else if (l >= 1 && l <= MAX_LEVEL) {
          hideLevelMenu();
          selectLevel(l);
        }
      });
    });
  }

  // ──────────────────────────────────────────────
  // Screen visibility helpers
  // ──────────────────────────────────────────────
  function showLoading(show) {
    if (loadingEl) loadingEl.style.display = show ? 'flex' : 'none';
  }

  function showMenu(show) {
    if (menuEl) menuEl.style.display = show ? 'flex' : 'none';
    if (mainAreaEl) mainAreaEl.style.display = show ? 'none' : 'flex';
    if (chuteArea) chuteArea.style.display = show ? 'none' : 'flex';
    const topBar = document.getElementById('top-bar');
    const bottomBar = document.getElementById('bottom-bar');
    if (topBar) topBar.style.display = show ? 'none' : 'flex';
    if (bottomBar) bottomBar.style.display = show ? 'none' : 'flex';
  }

  function showMainArea(show) {
    if (mainAreaEl) mainAreaEl.style.display = show ? 'flex' : 'none';
    if (chuteArea) chuteArea.style.display = show ? 'flex' : 'none';
    const topBar = document.getElementById('top-bar');
    const bottomBar = document.getElementById('bottom-bar');
    if (topBar) topBar.style.display = show ? 'flex' : 'none';
    if (bottomBar) bottomBar.style.display = show ? 'flex' : 'none';
  }

  function showResultOverlay(show) {
    if (resultOverlayEl) resultOverlayEl.classList.toggle('active', show);
  }

  // ──────────────────────────────────────────────
  // State transitions
  // ──────────────────────────────────────────────

  function enterLevelSelect() {
    phase = PHASE.LEVEL_SELECT;
    showMenu(false);
    showMainArea(true);
    showResultOverlay(false);
    hideAiDemo();
    hideKeywordSorter();
    hidePriorityOrder();
    showBeltAndChutes();
    if (celebrationEl) celebrationEl.classList.remove('active');

    Belt.stop();
    clearBelt();

    if (instructionBar) {
      instructionBar.innerHTML = '<span class="level-badge">📋</span> ' + Data.STRINGS.selectLevel;
    }

    updateLevelTabs();
    updateScoreDisplay();
  }

  function selectLevel(levelNum) {
    const levelData = Data.getLevel(levelNum);
    if (!levelData) {
      showToast('Level not found!', 'warning');
      return;
    }

    currentLevel = levelNum;
    wrongStreak = 0;
    levelScore = 0;
    levelMaxScore = levelData.maxScore || 0;
    levelCorrect = 0;
    levelWrong = 0;
    levelOverflow = 0;
    levelTotal = levelData.emailCount || levelData.keywordCount || levelData.messageCount || 0;
    sortedEmailIds = new Set();
    levelStartTime = Date.now();

    phase = PHASE.LEVEL_INTRO;
    showMainArea(true);
    showResultOverlay(false);
    hideKeywordSorter();
    hidePriorityOrder();

    const label = document.getElementById('level-label');
    if (label) {
      label.textContent = 'L' + levelNum;
      label.dataset.level = levelNum;
    }

    if (instructionBar) {
      instructionBar.innerHTML = '<span class="level-badge">L' + levelNum + '</span> ' + levelData.instruction;
    }
    updateLevelTabs();

    clearBelt();
    hideBeltAndChutes();

    // Save the items for AI demo replay
    if (levelData.type === 'keyword_sort') {
      levelItems[levelNum] = levelData.keywords.map(k => ({ ...k }));
    } else if (levelData.type === 'priority_order') {
      levelItems[levelNum] = levelData.messages.map(m => ({ ...m }));
    } else if (levelData.emails) {
      levelItems[levelNum] = levelData.emails.map(e => ({ ...e }));
    }

    if (window.Narrative) Narrative.onLevelStart(levelNum);

    // Update Nova's expression and accessories for this level
    if (window.NovaSVG) {
      const arc = { 1: 'nervous', 2: 'curious', 3: 'confident', 4: 'thinking', 5: 'excited', 6: 'proud', 7: 'proud', 8: 'proud' };
      NovaSVG.setExpression(arc[levelNum] || 'curious');
      NovaSVG.setLevel(levelNum);
    }

    setTimeout(() => {
      startPlaying(levelData);
    }, 800);
  }

  function startPlaying(levelData) {
    phase = PHASE.PLAYING;

    if (levelData.type === 'keyword_sort') {
      showKeywordSorter();
      startKeywordSort(levelData);
    } else if (levelData.type === 'priority_order') {
      showPriorityOrder();
      startPriorityOrder(levelData);
    } else {
      // Belt type
      showBeltAndChutes();
      Belt.startLevel(levelData);
    }
  }

  // ──────────────────────────────────────────────
  // Keyword Sorter (Level 1)
  // ──────────────────────────────────────────────

  function startKeywordSort(levelData) {
    keywordItems = levelData.keywords.map(k => ({ ...k, sorted: false }));
    keywordIndex = 0;
    keywordCorrect = 0;
    keywordWrong = 0;

    const belt = document.getElementById('keyword-belt');
    const progress = document.getElementById('keyword-count');
    if (!belt) return;

    belt.innerHTML = '';
    keywordItems.forEach((item, i) => {
      const card = document.createElement('div');
      card.className = 'keyword-card';
      card.dataset.index = i;
      card.textContent = item.keyword;
      card.draggable = true;

      // Pointer events for drag
      card.addEventListener('pointerdown', (e) => {
        if (item.sorted) return;
        e.preventDefault();
        const clone = card.cloneNode(true);
        clone.className = 'keyword-card dragging';
        clone.style.position = 'fixed';
        clone.style.pointerEvents = 'none';
        clone.style.zIndex = '1000';
        document.body.appendChild(clone);

        const rect = card.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const offsetY = e.clientY - rect.top;
        clone.style.left = (e.clientX - offsetX) + 'px';
        clone.style.top = (e.clientY - offsetY) + 'px';
        clone.style.width = rect.width + 'px';

        card.classList.add('dragging');

        const onMove = (ev) => {
          clone.style.left = (ev.clientX - offsetX) + 'px';
          clone.style.top = (ev.clientY - offsetY) + 'px';

          // Hit-test zones
          document.querySelectorAll('.keyword-zone').forEach(zone => {
            const zr = zone.getBoundingClientRect();
            const inZone = ev.clientX >= zr.left && ev.clientX <= zr.right &&
                           ev.clientY >= zr.top && ev.clientY <= zr.bottom;
            zone.classList.toggle('drag-over', inZone);
          });
        };

        const onUp = (ev) => {
          clone.remove();
          card.classList.remove('dragging');
          document.removeEventListener('pointermove', onMove);
          document.removeEventListener('pointerup', onUp);

          document.querySelectorAll('.keyword-zone').forEach(z => z.classList.remove('drag-over'));

          // Find target zone
          let targetDept = null;
          document.querySelectorAll('.keyword-zone').forEach(zone => {
            const zr = zone.getBoundingClientRect();
            if (ev.clientX >= zr.left && ev.clientX <= zr.right &&
                ev.clientY >= zr.top && ev.clientY <= zr.bottom) {
              targetDept = zone.dataset.department;
            }
          });

          if (!targetDept) return; // Dropped outside any zone

          const isCorrect = targetDept === item.department;
          if (isCorrect) {
            keywordCorrect++;
            levelScore += levelData.pointsPerCorrect;
            card.classList.add('placed');
            card.textContent = '✓ ' + item.keyword;
            item.sorted = true;
            // Show in zone body
            const zoneBody = document.getElementById('kw-zone-body-' + targetDept);
            if (zoneBody) {
              const tag = document.createElement('span');
              tag.className = 'kw-placed-keyword';
              tag.textContent = item.keyword;
              zoneBody.appendChild(tag);
            }
            showToast(Data.STRINGS.keywordCorrect + ' +' + levelData.pointsPerCorrect, 'success');
            playSound('correct');
          } else {
            keywordWrong++;
            showToast(Data.STRINGS.keywordWrong, 'error');
            playSound('wrong');
            card.style.animation = 'shake 0.3s ease';
            setTimeout(() => card.style.animation = '', 300);
          }

          if (progress) progress.textContent = keywordCorrect + '/' + keywordItems.length;

          // Check complete
          if (keywordItems.every(k => k.sorted)) {
            setTimeout(() => finishLevel(), 500);
          }
        };

        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
      });

      belt.appendChild(card);
    });

    if (progress) progress.textContent = '0/' + keywordItems.length;
  }

  // ──────────────────────────────────────────────
  // Priority Order (Level 2)
  // ──────────────────────────────────────────────

  function startPriorityOrder(levelData) {
    priorityMessages = levelData.messages.map((m, i) => ({
      ...m,
      currentPosition: i,
      checked: false,
    }));
    priorityOrder = [...priorityMessages];
    // Save the max possible score for this round
    levelMaxScore = levelData.maxScore || (priorityOrder.length * 15);

    const list = document.getElementById('priority-list');
    if (!list) return;

    renderPriorityList();
    setupPrioritySubmitButton();
  }

  function setupPrioritySubmitButton() {
    const btn = document.getElementById('priority-submit-btn');
    if (!btn) return;
    btn.style.display = 'inline-block';
    btn.textContent = 'I\'m Done!';
    btn.disabled = false;
    // Remove any old listeners and add a fresh one
    btn.replaceWith(btn.cloneNode(true));
    const newBtn = document.getElementById('priority-submit-btn');
    newBtn.addEventListener('click', () => submitPriorityOrder());
    // Also clear any previous visual feedback
    const list = document.getElementById('priority-list');
    if (list) {
      list.querySelectorAll('.priority-card').forEach(card => {
        card.classList.remove('placed-correct', 'placed-wrong');
      });
    }
  }

  function submitPriorityOrder() {
    // Build valid positions for each sentiment score group
    // Items with the same score are INTERCHANGEABLE — no strict ordering within groups
    const correctItems = [...priorityOrder].sort((a, b) => a.relativeOrder - b.relativeOrder);
    const scorePositions = {};  // score -> array of valid 1-indexed positions
    correctItems.forEach((msg, i) => {
      const score = msg.sentimentScore;
      if (!scorePositions[score]) scorePositions[score] = [];
      scorePositions[score].push(i + 1);
    });

    // Score: an item is correct if its position is valid for its sentiment score
    let correctPositions = 0;
    priorityOrder.forEach((msg, i) => {
      const validPositions = scorePositions[msg.sentimentScore] || [];
      if (validPositions.includes(i + 1)) {
        correctPositions++;
      }
    });

    levelScore = correctPositions * 15;
    levelCorrect = correctPositions;
    levelWrong = priorityOrder.length - correctPositions;
    levelMaxScore = priorityOrder.length * 15;

    // Show visual feedback on each card (using same score-group logic)
    const list = document.getElementById('priority-list');
    if (list) {
      const cards = list.querySelectorAll('.priority-card');
      cards.forEach((card, i) => {
        const msg = priorityOrder[i];
        const validPositions = scorePositions[msg.sentimentScore] || [];
        const isCorrect = validPositions.includes(i + 1);
        card.classList.add(isCorrect ? 'placed-correct' : 'placed-wrong');
      });
    }

    // Disable the button to prevent double-submit
    const btn = document.getElementById('priority-submit-btn');
    if (btn) btn.disabled = true;

    // Show result and advance
    playSound(correctPositions === priorityOrder.length ? 'levelComplete' : 'wrong');
    finishLevel();
  }

  function renderPriorityList() {
    const list = document.getElementById('priority-list');
    if (!list) return;
    list.innerHTML = '';

    priorityOrder.forEach((msg, i) => {
      const card = document.createElement('div');
      card.className = 'priority-card';
      card.dataset.index = i;
      card.dataset.relativeOrder = msg.relativeOrder;

      const sentimentClass = msg.sentimentScore <= -3 ? 'negative' :
        msg.sentimentScore >= 3 ? 'positive' : 'neutral';

      card.innerHTML =
        '<span class="order-number">#' + (i + 1) + '</span>' +
        '<span class="message-text">' + msg.text + '</span>' +
        '<span class="sentiment-badge ' + sentimentClass + '">' +
        (msg.sentimentScore > 0 ? '+' : '') + msg.sentimentScore + '</span>';

      // Drag up/down to reorder
      let startY = 0;
      card.addEventListener('pointerdown', (e) => {
        startY = e.clientY;
        const clone = card.cloneNode(true);
        clone.className = 'priority-card dragging';
        clone.style.position = 'fixed';
        clone.style.pointerEvents = 'none';
        clone.style.zIndex = '1000';
        clone.style.width = card.offsetWidth + 'px';
        document.body.appendChild(clone);

        const rect = card.getBoundingClientRect();
        clone.style.left = rect.left + 'px';
        clone.style.top = rect.top + 'px';
        card.classList.add('dragging');

        let dragY = 0;

        const onMove = (ev) => {
          dragY = ev.clientY - startY;
          clone.style.top = (rect.top + dragY) + 'px';
        };

        const onUp = () => {
          clone.remove();
          card.classList.remove('dragging');
          document.removeEventListener('pointermove', onMove);
          document.removeEventListener('pointerup', onUp);

          // Determine swap direction
          const cardHeight = rect.height;
          const swapThreshold = cardHeight * 0.5;

          if (dragY > swapThreshold && i < priorityOrder.length - 1) {
            // Move down
            [priorityOrder[i], priorityOrder[i + 1]] = [priorityOrder[i + 1], priorityOrder[i]];
          } else if (dragY < -swapThreshold && i > 0) {
            // Move up
            [priorityOrder[i], priorityOrder[i - 1]] = [priorityOrder[i - 1], priorityOrder[i]];
          }

          renderPriorityList();
        };

        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
      });

      list.appendChild(card);
    });
  }

  // ──────────────────────────────────────────────
  // UI toggle helpers for special areas
  // ──────────────────────────────────────────────

  function showKeywordSorter() {
    const el = document.getElementById('keyword-sorter-area');
    if (el) el.style.display = 'flex';
  }

  function hideKeywordSorter() {
    const el = document.getElementById('keyword-sorter-area');
    if (el) el.style.display = 'none';
  }

  function showPriorityOrder() {
    const el = document.getElementById('priority-order-area');
    if (el) el.style.display = 'flex';
  }

  function hidePriorityOrder() {
    const el = document.getElementById('priority-order-area');
    if (el) el.style.display = 'none';
  }

  function hideBeltAndChutes() {
    if (beltArea) beltArea.style.display = 'none';
    if (chuteArea) chuteArea.style.display = 'none';
  }

  function showBeltAndChutes() {
    if (beltArea) beltArea.style.display = '';
    if (chuteArea) chuteArea.style.display = '';
  }

  // ──────────────────────────────────────────────
  // Gameplay handlers
  // ──────────────────────────────────────────────

  function handleDrop(emailId, targetDeptId) {
    if (phase !== PHASE.PLAYING) return false;
    if (sortedEmailIds.has(emailId)) return false;

    const email = Data.getEmail(emailId);
    if (!email) return false;

    const isCorrect = (email.department === targetDeptId);

    if (isCorrect) {
      // Score is sentiment-weighted: negative (urgent) = more points
      const earnedScore = Data.calculateRouteScore(email.sentimentScore);
      levelScore += earnedScore;
      levelCorrect++;
      sortedEmailIds.add(emailId);
      wrongStreak = 0;
      Belt.markSorted(emailId);
      playSound('correct');
      showToast(Data.STRINGS.correctDrop + ' +' + earnedScore + ' pts', 'success');

      if (window.Narrative) Narrative.onCorrectSort(email, targetDeptId);

      // Nova celebrates correct drops
      if (window.NovaSVG) {
        NovaSVG.setExpression('excited');
        NovaSVG.triggerAnimation('bounce');
        setTimeout(() => NovaSVG.setExpression('confident'), 500);
      }

      checkLevelComplete();
    } else {
      levelWrong++;
      wrongStreak++;
      playSound('wrong');
      showToast(Data.STRINGS.wrongDrop, 'error');

      if (window.Narrative) Narrative.onWrongSort(email, targetDeptId);

      // Nova reacts to wrong drops
      if (window.NovaSVG && wrongStreak >= 2) {
        NovaSVG.setExpression('empathetic');
        NovaSVG.triggerAnimation('shake');
        setTimeout(() => NovaSVG.setExpression('curious'), 600);
      }

      if (wrongStreak >= 3) {
        const hint = Data.getLevelHint(currentLevel);
        showToast('💡 ' + hint, 'info');
        wrongStreak = 0;
      }
    }

    return isCorrect;
  }

  function handleBeltOverflow(emailData) {
    if (phase !== PHASE.PLAYING) return;
    if (sortedEmailIds.has(emailData.id)) return;

    levelOverflow++;
    playSound('wrong');
    showToast(Data.STRINGS.beltOverflow, 'warning');
    sortedEmailIds.add(emailData.id);

    checkLevelComplete();
  }

  function checkLevelComplete() {
    if (phase !== PHASE.PLAYING) return;

    const allDone = (levelCorrect + levelOverflow) >= levelTotal || Belt.getActiveCount() === 0;

    if (allDone) {
      levelElapsed = (Date.now() - levelStartTime) / 1000;
      if (levelElapsed < humanBestTime) humanBestTime = levelElapsed;
      setTimeout(() => finishLevel(), 600);
    }
  }

  function finishLevel() {
    Belt.stop();
    phase = PHASE.LEVEL_RESULT;

    const levelData = Data.getLevel(currentLevel);
    if (!levelData) return;

    const passed = levelScore >= levelData.minScore;
    let stars = 0;
    if (passed) {
      if (levelScore >= Object.keys(levelData.stars).sort((a,b)=>b-a)[0]) stars = 3;
      else if (levelScore >= Object.keys(levelData.stars).sort((a,b)=>b-a).slice(0,2)[1]) stars = 2;
      else stars = 1;
    }

    if (window.Narrative) Narrative.onLevelComplete(currentLevel, passed);

    // Nova celebrates or encourages
    if (window.NovaSVG) {
      if (passed) {
        NovaSVG.setExpression('proud');
        NovaSVG.triggerAnimation('sparkle');
        if (stars === 3) NovaSVG.triggerAnimation('bounce');
      } else {
        NovaSVG.setExpression('empathetic');
      }
    }

    levelScores[currentLevel] = {
      score: levelScore,
      maxScore: levelMaxScore,
      correct: levelCorrect,
      wrong: levelWrong,
      overflow: levelOverflow,
      total: levelTotal,
      passed,
      stars,
      elapsed: levelElapsed,
      type: levelData.type,
    };

    updateScoreDisplay();
    updateLevelTabs();

    const emojiEl = document.getElementById('result-emoji');
    const titleEl = document.getElementById('result-title');
    const scoreEl = document.getElementById('result-score');
    const messageEl = document.getElementById('result-message');

    if (emojiEl) emojiEl.textContent = passed ? '🎉' : '🔄';
    if (titleEl) {
      const aiConceptLabels = {1:'Supervised Learning',2:'Sentiment = Urgency',3:'Pattern Recognition',
        4:'Priority Weighting',5:'Throughput & Speed',6:'Mixed-Topic Disambiguation',7:'Crisis Response',8:'Autonomous AI'};
      const label = aiConceptLabels[currentLevel] || '';
      const novaPass = {1:'I learned my first AI skill! Keywords → departments! ⭐',
        2:'I learned to READ FEELINGS! Angry people need faster help! ⭐',
        3:'I recognize patterns now! The more we practice, the faster I get! ⭐',
        4:'I know to route angry emails FIRST! Priority matters! ⭐',
        5:'I can keep up with high speed now! Pattern recognition pays off! ⭐',
        6:'I can read BETWEEN THE LINES! When keywords fight, emotion wins! ⭐',
        7:'All 7 skills together under pressure! I\'m ready for anything! ⭐',
        8:'Autonomous! Sorting faster than any human — all thanks to you! 🌟'};
      titleEl.innerHTML = passed
        ? (novaPass[currentLevel] || 'I learned something new!')
        : 'That was tricky. Let\'s try again!';
    }
    if (scoreEl) scoreEl.textContent = '⭐'.repeat(stars) + '☆'.repeat(3 - stars);
    if (messageEl) {
      if (passed) {
        const conceptLines = {1:'🧠 <strong>Supervised Learning:</strong> AI learns keyword→department mapping from your labeled examples.',
          2:'🧠 <strong>Sentiment Analysis:</strong> AI reads emotion scores in text to decide priority and urgency.',
          3:'🧠 <strong>Pattern Recognition:</strong> AI classifies inputs faster and more accurately with more training data.',
          4:'🧠 <strong>Priority Routing:</strong> AI uses negative sentiment as an urgency signal — angry goes first.',
          5:'🧠 <strong>Throughput at Speed:</strong> AI handles high-volume workloads in real time once patterns are learned.',
          6:'🧠 <strong>Topic Disambiguation:</strong> When keywords conflict, AI weighs sentiment to find the primary issue.',
          7:'🧠 <strong>Crisis Response:</strong> All AI capabilities combine under extreme pressure — real-world deployment.',
          8:'🧠 <strong>Autonomous AI:</strong> Fully trained model operates at superhuman speed with zero human input.'};
        const conceptLine = conceptLines[currentLevel] || '';
        messageEl.innerHTML = 'Score: ' + levelScore + '/' + levelMaxScore + '<br>' + conceptLine;
      } else {
        messageEl.innerHTML = 'Score: ' + levelScore + '/' + levelMaxScore + '. Need ' + levelData.minScore + ' to pass.<br>That was tricky! Let\'s try again. Mistakes help me learn what NOT to do!';
      }
    }

    const retryBtn = document.getElementById('retry-btn');
    const nextBtn = document.getElementById('next-btn');
    const menuBtn2 = document.getElementById('result-menu-btn');

    if (retryBtn) retryBtn.style.display = 'inline-block';
    if (nextBtn) {
      const hasNext = currentLevel < AI_DEMO_LEVEL && passed;
      nextBtn.style.display = hasNext ? 'inline-block' : 'none';
    }
    if (menuBtn2) menuBtn2.textContent = 'Lesson Menu';

    showResultOverlay(true);

    if (passed) {
      if (stars === 3) spawnConfetti(15);
      playSound('levelComplete');
    } else {
      playSound('wrong');
    }

    // Speak Nova's result reaction via TTS
    setTimeout(() => {
      if (!window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const novaLines = {
        1: ['I did it! I learned my first keyword mappings! Supervised learning works!', 'Keywords! I know which words go to which department now!'],
        2: ['I can read feelings now! Angry people need faster help — sentiment equals urgency!', 'The feeling number tells us priority! I learned that!'],
        3: ['I am getting faster! Pattern recognition — the more I practice, the quicker I sort!', 'Practice makes me faster! I recognize bus means Transit instantly!'],
        4: ['Priority routing! Angry complaints go first because negative means urgent!', 'Negative first! I learned to prioritize by emotion intensity!'],
        5: ['Volume handled! I can keep up with high speed throughput now!', 'So many emails but I kept up! Pattern recognition at speed!'],
        6: ['Tricky emails solved! When keywords conflict, the feeling number finds the real problem!', 'I can read between the lines now! Disambiguation skills!'],
        7: ['Crisis complete! All seven AI skills combined under pressure!', 'Storm handled! Everything I learned came together!'],
        8: ['Autonomous! I sorted everything by myself! Thank you teacher!', 'Fully autonomous! You trained me to do this all alone!'],
      };
      const lines = novaLines[currentLevel] || ['I learned something new!'];
      const msg = passed
        ? lines[Math.floor(Math.random() * lines.length)]
        : 'That was tricky. Let us try again! Mistakes help me learn what not to do.';
      const utter = new SpeechSynthesisUtterance(msg);
      utter.rate = 0.85;
      utter.volume = 0.85;
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(v => v.name.includes('Google UK') || v.name.includes('Samantha') || v.name.includes('Female'));
      if (preferred) utter.voice = preferred;
      window.speechSynthesis.speak(utter);
    }, 800);

    checkAllComplete();
  }

  function retryLevel() {
    showResultOverlay(false);
    selectLevel(currentLevel);
  }

  function goNextLevel() {
    showResultOverlay(false);
    const next = currentLevel + 1;
    if (next <= MAX_LEVEL) {
      selectLevel(next);
    } else if (next === AI_DEMO_LEVEL) {
      startAiDemo();
    } else {
      enterLevelSelect();
    }
  }

  function checkAllComplete() {
    const allTeachingPassed = Array.from({ length: MAX_LEVEL }, (_, i) => i + 1)
      .every(l => levelScores[l] && levelScores[l].passed);
    if (allTeachingPassed && aiDemoEl) {
      showToast('🎉 All ' + MAX_LEVEL + ' lessons complete! Click L8 to see Nova in action!', 'success');
      updateLevelTabs();
    }
  }

  // ──────────────────────────────────────────────
  // Level 8 — AI Demonstration
  // Nova replays every level using the SAME game UI
  // the user played on — belt, chutes, keyword zones,
  // priority list — but auto-plays at superhuman speed.
  // ──────────────────────────────────────────────

  let aiLevelQueue = [];
  let aiLevelIdx = 0;
  let aiDemoPanelVisible = false;
  let aiItemsDone = 0;
  let aiTotalItems = 0;
  let aiLevelScores = {};  // per-level AI scores

  function startAiDemo() {
    phase = PHASE.AI_DEMO;

    // Collect completed levels FIRST
    aiLevelQueue = [];
    for (let l = 1; l <= MAX_LEVEL; l++) {
      if (levelScores[l] && levelScores[l].passed) aiLevelQueue.push(l);
    }
    if (aiLevelQueue.length === 0) {
      phase = PHASE.MENU;
      showToast('Complete at least one lesson first!', 'warning');
      return;
    }

    if (window.Narrative) Narrative.onAIDemoStart();

    // Switch to the real game view
    showMenu(false);
    showMainArea(true);
    showResultOverlay(false);
    if (celebrationEl) celebrationEl.classList.remove('active');
    hideKeywordSorter();
    hidePriorityOrder();
    showBeltAndChutes();

    // Show the floating comparison panel
    const panel = document.getElementById('ai-demo-panel');
    if (panel) {
      panel.style.display = 'flex';
      aiDemoPanelVisible = true;
    }

    // Build panel rows
    const body = document.getElementById('ai-panel-body');
    if (body) {
      body.innerHTML = '';
      aiLevelQueue.forEach(l => {
        const s = levelScores[l];
        const row = document.createElement('div');
        row.className = 'ai-panel-row';
        row.id = 'ai-panel-row-' + l;
        row.innerHTML =
          '<span>L' + l + ': ' + Data.getLevelName(l) + '</span>' +
          '<span class="ai-p-user">' + (s ? s.score + '/' + s.maxScore : '--') + '</span>' +
          '<span class="ai-p-bot" id="ai-p-bot-' + l + '">⏳</span>';
        body.appendChild(row);
      });
    }

    const statusEl = document.getElementById('ai-panel-status');
    if (statusEl) statusEl.textContent = 'Starting demo...';
    document.getElementById('ai-panel-actions').style.display = 'none';

    // Start replaying
    aiLevelIdx = 0;
    setTimeout(() => playAiLevel(), 500);
  }

  let aiFinaleDone = false;  // Track if the grand finale has run

  function playAiLevel() {
    if (aiLevelIdx >= aiLevelQueue.length) {
      // All levels replayed — launch the grand finale (second part)
      if (!aiFinaleDone) {
        aiFinaleDone = true;
        // Show "Finale incoming!" briefly, then start
        const statusEl = document.getElementById('ai-panel-status');
        if (statusEl) statusEl.textContent = '🏁 Starting super-speed finale!';
        setTimeout(() => startAiFinale(), 800);
        return;
      }
      const statusEl = document.getElementById('ai-panel-status');
      if (statusEl) statusEl.textContent = '✅ All lessons + finale — perfect!';
      document.getElementById('ai-panel-actions').style.display = 'flex';
      playSound('celebration');
      spawnConfetti(30);
      if (window.NovaSVG) {
        NovaSVG.setExpression('proud');
        NovaSVG.triggerAnimation('bounce');
      }
      if (window.Narrative) Narrative.onAIDemoComplete();
      return;
    }

    const levelNum = aiLevelQueue[aiLevelIdx];
    const items = levelItems[levelNum];
    const score = levelScores[levelNum];

    if (!items || !items.length) {
      aiLevelIdx++;
      setTimeout(playAiLevel, 100);
      return;
    }

    aiItemsDone = 0;
    aiTotalItems = items.length;

    // Compute perfect AI score
    if (score.type === 'keyword_sort') aiLevelScores[levelNum] = items.length * 10;
    else if (score.type === 'priority_order') aiLevelScores[levelNum] = items.length * 15;
    else aiLevelScores[levelNum] = items.reduce((s, item) => s + Data.calculateRouteScore(item.sentimentScore || 0), 0);

    // Set up the game UI manually — reuse actual game components
    phase = PHASE.AI_DEMO;
    showMainArea(true);
    showResultOverlay(false);
    Belt.stop();
    clearBelt();
    hideKeywordSorter();
    hidePriorityOrder();
    showBeltAndChutes();

    // Update instruction bar
    const name = Data.getLevelName(levelNum);
    if (instructionBar) {
      instructionBar.innerHTML = '<span class="level-badge">🤖 L' + levelNum + '</span> Nova: ' + name + ' — watching me...';
    }

    const label = document.getElementById('level-label');
    if (label) label.textContent = 'L' + levelNum;

    // Show the right UI for this level type — ACTUAL cards, not placeholders
    if (score.type === 'keyword_sort') {
      hideBeltAndChutes();
      showKeywordSorter();
      // Render ALL keyword cards on the belt for visible sorting animation
      const belt = document.getElementById('keyword-belt');
      if (belt) {
        belt.innerHTML = '';
        belt.style.display = 'flex';
        items.forEach((item, i) => {
          const card = document.createElement('div');
          card.className = 'keyword-card';
          card.textContent = item.keyword || item.text || 'word';
          card.id = 'ai-kw-' + i;
          card.style.animation = 'ai-card-pop 0.15s ease ' + (i * 0.03) + 's both';
          belt.appendChild(card);
        });
      }
    } else if (score.type === 'priority_order') {
      hideBeltAndChutes();
      showPriorityOrder();
      const list = document.getElementById('priority-list');
      if (list) {
        list.innerHTML = '';
        list.style.display = 'flex';
        list.style.flexDirection = 'column';
      }
    } else {
      showBeltAndChutes();
      // Render actual email cards on the belt track
      const track = document.getElementById('belt-track');
      if (track) {
        track.innerHTML = '';
        track.style.display = 'flex';
        track.style.flexWrap = 'wrap';
        track.style.justifyContent = 'center';
        track.style.alignItems = 'center';
        track.style.gap = '4px';
        track.style.padding = '8px';
        items.forEach((item, i) => {
          const deptData = Data.getDepartment(item.department);
          const icon = deptData ? deptData.icon : '📬';
          const scoreVal = item.sentimentScore || 0;
          const card = document.createElement('div');
          card.className = 'email-card';
          card.id = 'ai-belt-card-' + i;
          card.style.position = 'relative';
          card.style.display = 'inline-flex';
          card.style.alignItems = 'center';
          card.style.gap = '4px';
          card.style.padding = '6px 8px';
          card.style.width = 'clamp(100px, 14vw, 160px)';
          card.style.minHeight = '40px';
          card.style.fontSize = '10px';
          card.style.animation = 'ai-card-pop 0.12s ease ' + (i * 0.02) + 's both';
          card.innerHTML = '<span style="flex:1;overflow:hidden;text-overflow:ellipsis">' +
            (item.text || '').substring(0, 25) + '…</span>' +
            '<span style="font-size:14px">' + icon + '</span>';
          track.appendChild(card);
        });
      }
    }

    // Update panel
    const statusEl = document.getElementById('ai-panel-status');
    if (statusEl) statusEl.textContent = '🤖 Replaying Lesson ' + levelNum + ': ' + name + '...';
    const row = document.getElementById('ai-panel-row-' + levelNum);
    if (row) row.classList.add('active');

    // Small pause to show the UI, then auto-play
    setTimeout(() => aiProcessNextItem(levelNum, items, score.type), 500);
  }

  function aiProcessNextItem(levelNum, items, type) {
    if (aiItemsDone >= items.length) {
      // Level complete — update panel
      const botEl = document.getElementById('ai-p-bot-' + levelNum);
      const pts = aiLevelScores[levelNum];
      const aiTime = ((items.length * 120) / 1000).toFixed(1);
      if (botEl) {
        botEl.textContent = pts + '/' + pts + ' (100%)';
        botEl.classList.add('perfect');
      }
      const row = document.getElementById('ai-panel-row-' + levelNum);
      if (row) row.classList.remove('active');

      const statusEl = document.getElementById('ai-panel-status');
      if (statusEl) statusEl.textContent = '✅ Lesson ' + levelNum + ' done! (' + aiTime + 's)';
      playSound('levelComplete');

      // Mark AI demo as completed for this level
      levelScores[levelNum]._aiDemoDone = true;

      aiLevelIdx++;
      setTimeout(() => playAiLevel(), 800);
      return;
    }

    const item = items[aiItemsDone];

    if (type === 'keyword_sort') {
      aiAnimateKeyword(item, levelNum);
    } else if (type === 'priority_order') {
      aiAnimatePriority(item, levelNum);
    } else {
      aiAnimateBelt(item, levelNum);
    }

    aiItemsDone++;
    // Speed: starts at 250ms, drops to 60ms for later items
    const delay = Math.max(60, 250 - aiItemsDone * 12);
    setTimeout(() => aiProcessNextItem(levelNum, items, type), delay);
  }

  /** Animate a keyword flying to the correct department zone */
  function aiAnimateKeyword(item, levelNum) {
    const belt = document.getElementById('keyword-belt');
    const zoneBody = document.getElementById('kw-zone-body-' + item.department);
    if (!belt || !zoneBody) return;

    const card = document.createElement('div');
    card.className = 'keyword-card';
    card.textContent = item.keyword;
    card.style.position = 'absolute';
    card.style.left = '10px';
    card.style.top = '10px';
    card.style.zIndex = '100';
    belt.style.position = 'relative';
    belt.style.minHeight = '40px';
    belt.appendChild(card);

    requestAnimationFrame(() => {
      const deptColor = item.department === 'parks' ? '#4CAF50' : item.department === 'transit' ? '#2196F3' : '#FF9800';
      card.style.transition = 'all 0.2s ease-in';
      card.style.transform = 'scale(0.5) translateY(40px)';
      card.style.opacity = '0.5';
      card.style.borderColor = deptColor;

      setTimeout(() => {
        card.remove();
        const tag = document.createElement('span');
        tag.className = 'kw-placed-keyword';
        tag.style.background = deptColor;
        tag.textContent = item.keyword;
        zoneBody.appendChild(tag);
        zoneBody.closest('.keyword-zone').style.animation = 'ai-chute-glow 0.3s ease';
        setTimeout(() => zoneBody.closest('.keyword-zone').style.animation = '', 300);
      }, 200);
    });
    playSound('correct');
  }

  /** Animate a message snapping into correct priority order */
  function aiAnimatePriority(item, levelNum) {
    const list = document.getElementById('priority-list');
    if (!list) return;

    const card = document.createElement('div');
    card.className = 'priority-card';
    card.style.animation = 'ai-msg-pop 0.2s ease';
    const cls = item.sentimentScore <= -3 ? 'negative' : item.sentimentScore >= 3 ? 'positive' : 'neutral';
    card.innerHTML =
      '<span class="order-number">#' + item.relativeOrder + '</span>' +
      '<span class="message-text">' + item.text.substring(0, 35) + '…</span>' +
      '<span class="sentiment-badge ' + cls + '">' +
      (item.sentimentScore > 0 ? '+' : '') + item.sentimentScore + '</span>';
    list.appendChild(card);
    playSound('correct');
  }

  /** Animate an email card flying to the correct chute */
  function aiAnimateBelt(item, levelNum) {
    const track = document.getElementById('belt-track');
    const chuteId = 'chute-' + item.department;
    const chute = document.getElementById(chuteId);
    if (!track || !chute) return;

    const deptColor = item.department === 'parks' ? '#4CAF50' : item.department === 'transit' ? '#2196F3' : '#FF9800';
    const dept = Data.getDepartment(item.department);
    const icon = dept ? dept.icon : '📬';
    const pts = Data.calculateRouteScore(item.sentimentScore || 0);

    const card = document.createElement('div');
    card.className = 'email-card';
    card.style.position = 'relative';
    card.style.display = 'inline-flex';
    card.style.alignItems = 'center';
    card.style.gap = '6px';
    card.style.padding = '6px 10px';
    card.style.background = 'var(--bg-card)';
    card.style.color = 'var(--text-on-light)';
    card.style.borderRadius = '8px';
    card.style.borderLeft = '4px solid ' + deptColor;
    card.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
    card.style.margin = '2px';
    card.style.fontSize = '11px';
    card.innerHTML = '<span>' + item.text.substring(0, 22) + '…</span>' +
      '<span style="font-size:16px">' + icon + '</span>' +
      '<span style="font-family:var(--font-display);font-weight:700;color:' + deptColor + '">+' + pts + '</span>';
    track.appendChild(card);

    // Score popup above card
    const popup = document.createElement('div');
    popup.className = 'ai-score-popup';
    popup.textContent = '+' + pts;
    popup.style.color = deptColor;
    popup.style.position = 'absolute';
    popup.style.top = '-12px';
    popup.style.right = '4px';
    track.appendChild(popup);

    // Animate: card slides down toward chute (simulated by fading + shrinking)
    requestAnimationFrame(() => {
      card.style.transition = 'all 0.25s ease-in';
      card.style.transform = 'translateY(20px) scale(0.6)';
      card.style.opacity = '0.4';

      chute.style.animation = 'ai-chute-glow 0.3s ease';
      setTimeout(() => chute.style.animation = '', 300);
      setTimeout(() => { card.remove(); popup.remove(); }, 250);
    });
    playSound('correct');
  }

  /** Grand finale — Nova sorts 25 emails at super-speed */
  function startAiFinale() {
    phase = PHASE.AI_DEMO;

    // Set up the belt view
    showMenu(false);
    showMainArea(true);
    showResultOverlay(false);
    if (celebrationEl) celebrationEl.classList.remove('active');
    hideKeywordSorter();
    hidePriorityOrder();
    showBeltAndChutes();

    // Clear belt
    Belt.stop();
    const track = document.getElementById('belt-track');
    if (track) { track.innerHTML = ''; track.style.display = ''; track.style.flexWrap = ''; track.style.justifyContent = ''; track.style.alignItems = ''; track.style.gap = ''; track.style.padding = ''; }

    // Update instruction
    if (instructionBar) {
      instructionBar.innerHTML = '<span class="level-badge">🚀 FINALE</span> Nova: Watch me go!';
    }

    // Generate finale emails
    const allEmails = Data.getFinaleEmails ? Data.getFinaleEmails(AI_FINALE_COUNT) : [];
    // Fallback: grab from levelItems if finale data not available
    const finaleItems = allEmails.length >= AI_FINALE_COUNT ? allEmails :
      Array.from({ length: AI_FINALE_COUNT }, (_, i) => ({
        id: 'finale-' + i,
        text: 'Citizen feedback #' + (i + 1),
        sentimentScore: (i % 11) - 5, // -5 to +5
        department: ['parks', 'transit', 'waste'][i % 3],
        keywords: ['feedback'],
      }));

    let idx = 0;
    let totalScore = 0;
    const totalItems = finaleItems.length;

    // Show "NOVA SUPER-SPEED" badge
    const badge = document.createElement('div');
    badge.textContent = '⚡ NOVA SUPER-SPEED ⚡';
    badge.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-family:var(--font-display);font-size:var(--fs-2xl);color:#FFD700;z-index:10;pointer-events:none;text-shadow:0 0 20px rgba(255,215,0,0.5);animation:comic-pulse 0.5s ease-in-out 6';
    if (track) track.appendChild(badge);
    setTimeout(() => { if (badge) badge.remove(); }, 3000);

    // Update panel
    const statusEl = document.getElementById('ai-panel-status');
    const body = document.getElementById('ai-panel-body');
    if (body) {
      body.innerHTML =
        '<div class="ai-panel-row header"><span>Finale</span><span>Sorted</span><span>Nova</span></div>' +
        '<div class="ai-panel-row" id="ai-finale-row"><span>🏁 Super-Speed Round</span><span id="ai-finale-count">0/' + totalItems + '</span><span id="ai-finale-score">0 pts</span></div>';
    }
    if (statusEl) statusEl.textContent = '🚀 Super-speed finale! ' + totalItems + ' emails in 3 seconds!';

    if (window.NovaSVG) {
      NovaSVG.setExpression('excited');
      NovaSVG.triggerAnimation('sparkle');
    }

    // Process items at super-speed
    let scoreCounter = 0;
    function processFinaleItem() {
      if (idx >= totalItems) {
        // Done!
        const countEl = document.getElementById('ai-finale-count');
        const scoreEl = document.getElementById('ai-finale-score');
        if (countEl) countEl.textContent = totalItems + '/' + totalItems;
        if (scoreEl) { scoreEl.textContent = scoreCounter + ' pts'; scoreEl.style.color = '#FFD700'; scoreEl.style.fontWeight = '700'; }
        if (statusEl) statusEl.textContent = '✅ Finale complete — ' + scoreCounter + ' pts! Nova is super-fast!';

        // Show ai completed row
        const finalRow = document.getElementById('ai-finale-row');
        if (finalRow) { finalRow.classList.add('active'); }

        playSound('celebration');
        spawnConfetti(40);
        if (window.NovaSVG) {
          NovaSVG.setExpression('proud');
          NovaSVG.triggerAnimation('bounce');
        }
        return;
      }

      const item = finaleItems[idx];
      const deptColor = item.department === 'parks' ? '#4CAF50' : item.department === 'transit' ? '#2196F3' : '#FF9800';
      const deptName = item.department;
      const chute = document.getElementById('chute-' + deptName);
      const pts = Data.calculateRouteScore ? Data.calculateRouteScore(item.sentimentScore || 0) : 10;
      scoreCounter += pts;

      // Quick card flash on belt
      if (track) {
        const flash = document.createElement('div');
        flash.textContent = (item.text || '').substring(0, 15);
        flash.style.cssText = 'position:absolute;left:' + (10 + Math.random() * 60) + '%;top:' + (10 + Math.random() * 40) + '%;background:' + deptColor + ';color:#fff;padding:2px 8px;border-radius:6px;font-size:9px;font-weight:600;z-index:5;opacity:0.9;transition:all 0.1s ease';
        track.style.position = 'relative';
        track.appendChild(flash);
        requestAnimationFrame(() => {
          flash.style.transform = 'translateY(30px) scale(0.3)';
          flash.style.opacity = '0';
        });
        setTimeout(() => { if (flash.parentNode) flash.remove(); }, 120);
      }

      // Flash the chute
      if (chute) {
        chute.style.animation = 'ai-chute-glow 0.08s ease';
        setTimeout(() => { chute.style.animation = ''; }, 80);
      }

      // Update counter
      const countEl = document.getElementById('ai-finale-count');
      const scoreEl = document.getElementById('ai-finale-score');
      if (countEl) countEl.textContent = (idx + 1) + '/' + totalItems;
      if (scoreEl) scoreEl.textContent = scoreCounter + ' pts';

      playSound('correct');
      idx++;

      // Speed: starts at 80ms, drops to 30ms
      const speed = Math.max(30, 80 - idx * 2);
      setTimeout(processFinaleItem, speed);
    }

    setTimeout(processFinaleItem, 500);
  }

  function hideAiDemo() {
    const panel = document.getElementById('ai-demo-panel');
    if (panel) panel.style.display = 'none';
    aiDemoPanelVisible = false;
    document.getElementById('ai-panel-actions').style.display = 'none';
  }

  // ──────────────────────────────────────────────
  // Celebration
  // ──────────────────────────────────────────────

  function showCelebration() {
    phase = PHASE.CELEBRATION;
    hideAiDemo();
    showResultOverlay(false);

    // Calculate what the student taught the AI
    const totalTaught = Object.values(levelScores).reduce((sum, s) => sum + (s.correct || 0), 0);
    const totalAttempts = Object.values(levelScores).reduce((sum, s) => sum + (s.total || 0), 0);

    if (celebrationEl) {
      document.getElementById('celebration-stars').textContent = '⭐'.repeat(totalStars);
      const summaryEl = document.getElementById('celebration-summary');
      if (summaryEl) {
        summaryEl.innerHTML = 'Teacher... 🥹 ' +
          'Day 1: I didn\'t know what "bus" meant. Now look at me!<br><br>' +
          '<div class="celebration-concepts">' +
          '<span class="concept-badge">🧠 Keyword Classification</span> ' +
          '<span class="concept-badge">🧠 Sentiment Analysis</span> ' +
          '<span class="concept-badge">🧠 Priority Routing</span> ' +
          '<span class="concept-badge">🧠 Pattern Recognition</span> ' +
          '<span class="concept-badge">🧠 Mixed-Topic Disambiguation</span> ' +
          '<span class="concept-badge">🧠 Crisis Response</span> ' +
          '<span class="concept-badge">🧠 Autonomous AI</span>' +
          '</div><br>' +
          'I can sort faster than any human — because YOU taught me. ' +
          'You didn\'t just play a game. You trained an AI. Thank you, teacher! 🌟';
      }
      celebrationEl.classList.add('active');
    }
    spawnConfetti(40);
    playSound('celebration');

    // Nova's graduation speech via TTS
    setTimeout(() => {
      if (!window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const msg = 'Teacher, look how far we have come! Day one: I did not know what bus meant. Now I can sort hundreds of emails faster than any human. All seven AI skills: Keywords, Feelings, Priority, Patterns, Tricky topics, Crisis, and Autonomy. Real AI systems use every single one of these skills. You did not just play a game. You trained an AI. Thank you so much!';
      const utter = new SpeechSynthesisUtterance(msg);
      utter.rate = 0.85;
      utter.volume = 0.85;
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(v => v.name.includes('Google UK') || v.name.includes('Samantha') || v.name.includes('Female'));
      if (preferred) utter.voice = preferred;
      window.speechSynthesis.speak(utter);
    }, 1000);
  }

  // ──────────────────────────────────────────────
  // UI helpers
  // ──────────────────────────────────────────────

  function clearBelt() {
    const track = document.getElementById('belt-track');
    if (track) track.innerHTML = '';
  }

  function updateScoreDisplay() {
    const el = document.getElementById('score-stars');
    if (!el) return;
    totalStars = 0;
    Object.values(levelScores).forEach(s => { totalStars += s.stars || 0; });
    el.textContent = '⭐'.repeat(Math.min(totalStars, 15));
  }

  function updateLevelTabs() {
    document.querySelectorAll('.level-tab').forEach(tab => {
      const l = parseInt(tab.dataset.level);
      tab.classList.toggle('active', l === currentLevel);
      tab.classList.toggle('completed', levelScores[l] && levelScores[l].passed);
      if (l === AI_DEMO_LEVEL) {
        const allPassed = Array.from({ length: MAX_LEVEL }, (_, i) => i + 1)
          .every(ll => levelScores[ll] && levelScores[ll].passed);
        tab.classList.toggle('unlocked', allPassed);
        if (levelScores[l]) {
          tab.textContent = 'L8 ⭐';
          tab.classList.add('completed');
        } else if (allPassed) {
          tab.textContent = 'L8 🎬';
        } else {
          tab.textContent = 'L8 🔒';
        }
      } else if (l === 9) {
        tab.textContent = 'L9 🧠';
      } else if (levelScores[l] && levelScores[l].passed) {
        tab.textContent = 'L' + l + ' ⭐';
      } else {
        tab.textContent = 'L' + l;
      }
    });

    document.querySelectorAll('#level-grid .level-btn').forEach(btn => {
      const l = parseInt(btn.dataset.level);
      btn.classList.toggle('completed', levelScores[l] && levelScores[l].passed);
      if (l === AI_DEMO_LEVEL) {
        const allPassed = Array.from({ length: MAX_LEVEL }, (_, i) => i + 1)
          .every(ll => levelScores[ll] && levelScores[ll].passed);
        btn.disabled = !allPassed;
        btn.style.opacity = allPassed ? '1' : '0.4';
      }
    });
  }

  function showLevelMenu() {
    const menu = document.getElementById('level-menu');
    if (menu) menu.classList.remove('hidden');
  }

  function hideLevelMenu() {
    const menu = document.getElementById('level-menu');
    if (menu) menu.classList.add('hidden');
  }

  function toggleDebug() {
    const debugOn = !Settings.isDebugMode();
    Settings.setDebugMode(debugOn);
    Belt.setDebugMode(debugOn);
    const btn = document.getElementById('debug-btn');
    if (btn) btn.classList.toggle('active', debugOn);
    showToast(debugOn ? Data.STRINGS.debugOn : Data.STRINGS.debugOff, 'info');
  }

  // ──────────────────────────────────────────────
  // Audio
  // ──────────────────────────────────────────────

  function playSound(name) {
    if (!audioCtx || Settings.isMuted()) return;
    const sound = Data.SOUNDS[name];
    if (!sound) return;

    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = sound.type || 'sine';
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      let totalTime = 0;
      sound.freq.forEach((freq, i) => {
        const start = totalTime;
        const dur = sound.duration[i] || 0.1;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime + start);
        totalTime += dur;
      });

      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + totalTime + 0.1);

      osc.start(audioCtx.currentTime);
      osc.stop(audioCtx.currentTime + totalTime + 0.2);
    } catch(e) {
      // Audio not available — silent fail
    }
  }

  // ──────────────────────────────────────────────
  // Toast notifications
  // ──────────────────────────────────────────────

  let toastId = 0;
  function showToast(message, type) {
    type = type || 'info';
    const container = document.getElementById('toast-container');
    if (!container) return;

    toastId++;
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.textContent = message;
    toast.id = 'toast-' + toastId;
    container.appendChild(toast);

    setTimeout(() => {
      const el = document.getElementById('toast-' + toastId);
      if (el) el.remove();
    }, 3000);
  }

  // ──────────────────────────────────────────────
  // Confetti
  // ──────────────────────────────────────────────

  function spawnConfetti(count) {
    count = count || 20;
    const colors = ['#4CAF50', '#2196F3', '#FF9800', '#f44336', '#FFD700', '#E040FB', '#00BCD4'];
    for (let i = 0; i < count; i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      piece.style.left = Math.random() * 100 + 'vw';
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      piece.style.width = (Math.random() * 10 + 4) + 'px';
      piece.style.height = (Math.random() * 10 + 4) + 'px';
      piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
      piece.style.animationDuration = (Math.random() * 2 + 2) + 's';
      piece.style.animationDelay = (Math.random() * 0.8) + 's';
      document.body.appendChild(piece);
      setTimeout(() => piece.remove(), 4500);
    }
  }

  // ──────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────

  return {
    init,
    selectLevel,
    retryLevel,
    startAiDemo,
    getPhase: () => phase,
    getCurrentLevel: () => currentLevel,
    getScores: () => ({ ...levelScores }),
    showToast,
  };
})();

// Boot
document.addEventListener('DOMContentLoaded', () => {
  Game.init();
});
