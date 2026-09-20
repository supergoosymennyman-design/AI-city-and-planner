/**
 * belt.js — Conveyor belt animation and timing
 *
 * Emails slide from right to left on the belt. New emails spawn
 * at intervals from the level pool. Belt speed controlled by level
 * config, accelerated by urgent cards. Belt overflow = email falls
 * off left edge without being sorted (counted as error).
 *
 * Debug mode (🔧): pauses the belt and shows keyword extraction.
 */
const Belt = (() => {
  'use strict';

  let beltArea = null;
  let beltTrack = null;
  let isRunning = false;
  let isPaused = false;
  let debugMode = false;
  let animFrameId = null;
  let lastTimestamp = 0;

  // Level config
  let currentSpeed = 0.5;        // pixels per frame (scaled)
  let spawnInterval = 3000;      // ms
  let emailPool = [];            // Shuffled list of emails to spawn
  let spawnIndex = 0;
  let maxEmailsOnBelt = 20;      // Prevent infinite cards
  let lastSpawnTime = 0;

  // Active cards on the belt
  let activeCards = [];          // [{ el, emailData, x, spawned }]

  // Callbacks
  let onOverflowCallback = null; // Called when email falls off belt
  let onSpawnCallback = null;    // Called when email spawns

  function init(callbacks) {
    beltArea = document.getElementById('belt-area');
    beltTrack = document.getElementById('belt-track');

    onOverflowCallback = callbacks.onOverflow || null;
    onSpawnCallback = callbacks.onSpawn || null;

    if (!beltArea || !beltTrack) {
      console.warn('Belt: missing DOM elements');
      return;
    }
  }

  /**
   * Start the conveyor belt with a level's configuration.
   */
  function startLevel(levelConfig) {
    stop();

    currentSpeed = levelConfig.beltSpeed || 0.5;
    spawnInterval = levelConfig.spawnInterval || 3000;
    emailPool = [...(levelConfig.emails || [])];
    // Shuffle the pool
    for (let i = emailPool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [emailPool[i], emailPool[j]] = [emailPool[j], emailPool[i]];
    }
    spawnIndex = 0;
    activeCards = [];
    lastSpawnTime = performance.now();
    lastTimestamp = performance.now();

    // Clear any existing cards
    if (beltTrack) beltTrack.innerHTML = '';

    isRunning = true;
    isPaused = false;

    // Spawn first card immediately
    spawnCard();

    animFrameId = requestAnimationFrame(tick);
  }

  /**
   * Stop the belt.
   */
  function stop() {
    isRunning = false;
    isPaused = false;
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
  }

  /**
   * Pause/unpause the belt (debug mode or manual).
   */
  function pause() {
    isPaused = true;
  }

  function resume() {
    isPaused = false;
    lastTimestamp = performance.now();
  }

  function togglePause() {
    if (isPaused) resume();
    else pause();
    return isPaused;
  }

  /**
   * Main animation tick.
   */
  function tick(timestamp) {
    if (!isRunning) return;

    const dt = timestamp - lastTimestamp;
    lastTimestamp = timestamp;

    if (!isPaused) {
      // Move all active cards left
      const speed = currentSpeed * (dt / 16.67); // Normalize to ~60fps
      moveCards(speed);

      // Check for overflow (cards past left edge)
      checkOverflow();

      // Spawn new cards at intervals
      if (timestamp - lastSpawnTime >= spawnInterval) {
        spawnCard();
        lastSpawnTime = timestamp;
      }
    }

    animFrameId = requestAnimationFrame(tick);
  }

  /**
   * Move all active cards leftward.
   */
  function moveCards(speed) {
    const beltWidth = beltArea ? beltArea.clientWidth : 1024;

    for (let i = activeCards.length - 1; i >= 0; i--) {
      const card = activeCards[i];
      card.x -= speed;
      if (card.el) {
        card.el.style.transform = `translateX(${card.x}px)`;
      }
    }
  }

  /**
   * Check if any cards have overflowed the left edge.
   */
  function checkOverflow() {
    const overflowThreshold = -100; // px past left edge

    for (let i = activeCards.length - 1; i >= 0; i--) {
      const card = activeCards[i];
      if (card.x < overflowThreshold) {
        // Card fell off the belt
        if (onOverflowCallback && !card.sorted) {
          onOverflowCallback(card.emailData);
        }
        // Remove card
        if (card.el && card.el.parentNode) {
          card.el.classList.add('overflowed');
          setTimeout(() => {
            if (card.el.parentNode) card.el.parentNode.removeChild(card.el);
          }, 300);
        }
        activeCards.splice(i, 1);
      }
    }
  }

  /**
   * Spawn a new email card on the right side of the belt.
   */
  function spawnCard() {
    if (spawnIndex >= emailPool.length) return; // No more emails
    if (activeCards.length >= maxEmailsOnBelt) return;
    if (!beltTrack) return;

    const emailData = emailPool[spawnIndex];
    spawnIndex++;

    // Create card element
    const card = createCardElement(emailData);

    // Position at right edge
    const beltWidth = beltArea ? beltArea.clientWidth : 1024;
    const beltHeight = beltArea ? beltArea.clientHeight : 200;

    // Vertical jitter to spread cards
    const yOffset = (activeCards.length % 3) * 8;
    const xStart = beltWidth - 50;

    card.style.position = 'absolute';
    card.style.right = '0px';
    card.style.top = (10 + yOffset) + 'px';
    card.style.transform = `translateX(${xStart}px)`;

    beltTrack.appendChild(card);

    activeCards.push({
      el: card,
      emailData: emailData,
      x: 0, // relative to right-aligned position
      spawned: performance.now(),
      sorted: false,
    });

    if (onSpawnCallback) onSpawnCallback(emailData);
  }

  /**
   * Create a DOM element for an email card.
   */
  function createCardElement(emailData) {
    const card = document.createElement('div');
    card.className = 'email-card';
    card.dataset.emailId = emailData.id;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', 'Email: ' + emailData.text);
    card.setAttribute('tabindex', '0');

    // Urgent red pulsing border
    if (emailData.isUrgent) {
      card.classList.add('urgent');
    }

    // Mixed topic indicator
    if (emailData.isMixed) {
      card.classList.add('mixed');
    }

    // Sentiment score badge
    const scoreBadge = document.createElement('div');
    scoreBadge.className = 'score-badge';
    if (emailData.sentimentScore < 0) {
      scoreBadge.classList.add('negative');
    } else if (emailData.sentimentScore > 0) {
      scoreBadge.classList.add('positive');
    } else {
      scoreBadge.classList.add('neutral');
    }
    scoreBadge.textContent = emailData.sentimentScore > 0 ? '+' + emailData.sentimentScore : emailData.sentimentScore;
    card.appendChild(scoreBadge);

    // Email text
    const textEl = document.createElement('div');
    textEl.className = 'email-text';
    textEl.textContent = emailData.text;
    card.appendChild(textEl);

    // Priority weight indicator (urgent cards)
    if (emailData.isUrgent) {
      const priorityEl = document.createElement('div');
      priorityEl.className = 'priority-indicator';
      priorityEl.textContent = '⚠ URGENT';
      card.appendChild(priorityEl);
    }

    // Mixed topic indicator
    if (emailData.isMixed) {
      const mixedEl = document.createElement('div');
      mixedEl.className = 'mixed-indicator';
      mixedEl.textContent = '🔀 Mixed Topics';
      card.appendChild(mixedEl);
    }

    // Keyword display (always visible for learning)
    const kwEl = document.createElement('div');
    kwEl.className = 'keyword-tags';
    kwEl.textContent = emailData.keywords.map(k => '#' + k).join(' ');
    card.appendChild(kwEl);

    // Debug: show extracted keywords
    if (debugMode) {
      const debugEl = document.createElement('div');
      debugEl.className = 'debug-keywords';
      debugEl.textContent = '🔍 Keywords: ' + emailData.keywords.join(', ');
      card.appendChild(debugEl);
    }

    return card;
  }

  /**
   * Mark a card as sorted (removes it from active tracking).
   */
  function markSorted(emailId) {
    const card = activeCards.find(c => c.emailData.id === emailId);
    if (card) {
      card.sorted = true;
      // Remove from active after animation
      setTimeout(() => {
        const idx = activeCards.findIndex(c => c.emailData.id === emailId);
        if (idx >= 0) activeCards.splice(idx, 1);
      }, 400);
    }
  }

  /**
   * Set debug mode (shows keyword extraction on cards).
   */
  function setDebugMode(on) {
    debugMode = on;
    if (on) {
      pause();
    } else {
      resume();
    }
  }

  /**
   * Get number of active cards currently on the belt.
   */
  function getActiveCount() {
    return activeCards.length;
  }

  /**
   * Get belt state.
   */
  function getState() {
    return {
      running: isRunning,
      paused: isPaused,
      debug: debugMode,
      activeCount: activeCards.length,
      totalEmails: emailPool.length,
      spawnedCount: spawnIndex,
    };
  }

  /**
   * Get all remaining unsorted email IDs on the belt.
   */
  function getRemainingEmails() {
    return activeCards.filter(c => !c.sorted).map(c => c.emailData);
  }

  return {
    init,
    startLevel,
    stop,
    pause,
    resume,
    togglePause,
    setDebugMode,
    getActiveCount,
    getState,
    getRemainingEmails,
    markSorted,
  };
})();
