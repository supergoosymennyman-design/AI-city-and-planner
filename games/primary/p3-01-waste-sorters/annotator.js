/**
 * annotator.js — Rendering & interaction for all 5 levels
 *
 * Level 1 & 3: Tap-to-annotate hotspot overlays on positioned items
 * Level 2 & 4: Feature selection grids (many labelled cards, tap correct ones)
 * Level 5:      Timed feature identification rounds
 */
const Annotator = (() => {
  'use strict';

  let zoneEl = null, currentLevel = 0, selectedIds = [], debounceTimers = {}, debugMode = false;
  let onSelectionChange = null, onHotspotTap = null;
  let itemsContainer = null, hotspotsContainer = null, debugOverlay = null;

  // Timed round state (Level 5, 6)
  let roundIndex = 0, roundResults = [], roundActive = false, roundTimer = null;

  // ── Fisher-Yates shuffle (randomizes array in-place) ──
  function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function init(zoneId) {
    zoneEl = document.getElementById(zoneId);
    if (!zoneEl) return;
    itemsContainer = document.createElement('div');
    itemsContainer.style.cssText = 'position:absolute;inset:0;z-index:1;';
    hotspotsContainer = document.createElement('div');
    hotspotsContainer.style.cssText = 'position:absolute;inset:0;z-index:20;';
    debugOverlay = document.createElement('div');
    debugOverlay.style.cssText = 'position:absolute;inset:0;z-index:30;pointer-events:none;display:none;';
    zoneEl.appendChild(itemsContainer);
    zoneEl.appendChild(debugOverlay);
    zoneEl.appendChild(hotspotsContainer);
  }

  // ── LEVEL LOADER ──
  function loadLevel(level, callbacks) {
    currentLevel = level;
    selectedIds = [];
    debounceTimers = {};
    onSelectionChange = callbacks.onSelectionChange || null;
    onHotspotTap = callbacks.onHotspotTap || null;
    itemsContainer.innerHTML = '';
    hotspotsContainer.innerHTML = '';
    debugOverlay.style.display = 'none';

    const levelData = Levels.getLevel(level);
    const style = levelData ? levelData.style : 'bounding_box';

    // Show explanation in instruction bar (all levels)
    showExplanation(levelData);

    if (style === 'feature_select') {
      renderFeatureGrid(level, false);
    } else if (style === 'feature_select_timed') {
      renderTimedRounds(level);
    } else if (style === 'conveyor') {
      const items = Items.getItems(level);
      const hotspots = Items.getHotspots(level);
      renderItems(items);
      renderConveyorLevel(items, hotspots);
    } else {
      const items = Items.getItems(level);
      const hotspots = Items.getHotspots(level);
      if (!items.length) return;
      renderItems(items);
      renderHotspots(hotspots, style);
    }
    if (debugMode) showDebugOverlay(level);
    notifySelectionChange();
  }

  function showExplanation(levelData) {
    if (!levelData || !levelData.explanation) return;
    const bar = document.getElementById('instruction-bar');
    if (!bar) return;
    // Add explanation as a tooltip that appears on tap of an info icon
    const infoBtn = document.createElement('span');
    infoBtn.className = 'explanation-btn';
    infoBtn.textContent = '\u2139\uFE0F';
    infoBtn.setAttribute('role', 'button');
    infoBtn.setAttribute('tabindex', '0');
    infoBtn.setAttribute('aria-label', 'Learn more about this concept');
    const tooltip = document.createElement('div');
    tooltip.className = 'explanation-tooltip';
    tooltip.textContent = levelData.explanation;
    tooltip.style.display = 'none';
    infoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = tooltip.style.display === 'block';
      // Hide all tooltips first
      document.querySelectorAll('.explanation-tooltip').forEach(t => t.style.display = 'none');
      tooltip.style.display = isVisible ? 'none' : 'block';
    });
    infoBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); infoBtn.click(); }
    });
    bar.appendChild(infoBtn);
    bar.appendChild(tooltip);
  }

  // ── ITEMS RENDERER (Levels 1, 3) ──
  function renderItems(items) {
    items.forEach(item => {
      const div = document.createElement('div');
      div.className = 'annotation-item';
      div.id = 'item-' + item.id;
      div.style.left = item.x + '%';
      div.style.top = item.y + '%';
      div.style.width = item.w + '%';
      div.style.height = item.h + '%';
      div.setAttribute('aria-label', item.name);
      if (item.customClass) div.classList.add(item.customClass);

      if (item.id === 'mirror') {
        const shape = document.createElement('div');
        shape.className = 'mirror-shard-shape';
        div.appendChild(shape);
      } else {
        const emoji = document.createElement('span');
        emoji.className = 'item-emoji';
        emoji.textContent = item.emoji;
        div.appendChild(emoji);
      }

      const label = document.createElement('span');
      label.className = 'item-label';
      label.textContent = item.name;
      div.appendChild(label);
      itemsContainer.appendChild(div);
    });
  }

  // ── HOTSPOT RENDERER (Levels 1, 3) ──
  function renderHotspots(hotspots, style) {
    hotspots.forEach(hs => {
      const zone = document.createElement('div');
      zone.className = 'hotspot-zone';
      zone.id = 'hs-' + hs.id;
      zone.dataset.hotspotId = hs.id;
      if (style === 'texture') zone.classList.add('texture-category');

      const item = Items.getItems(currentLevel).find(i => i.id === hs.itemId);
      if (item) {
        zone.style.left = (item.x + hs.x * item.w / 100) + '%';
        zone.style.top = (item.y + hs.y * item.h / 100) + '%';
        zone.style.width = (hs.w * item.w / 100) + '%';
        zone.style.height = (hs.h * item.h / 100) + '%';
      }

      if (hs.category) {
        const catLabel = document.createElement('span');
        catLabel.className = 'hotspot-label';
        catLabel.textContent = hs.category === 'textured' ? 'Textured' : 'Glossy';
        zone.appendChild(catLabel);
      } else {
        const label = document.createElement('span');
        label.className = 'hotspot-label';
        label.textContent = hs.label || '';
        zone.appendChild(label);
      }

      zone.setAttribute('role', 'button');
      zone.setAttribute('tabindex', '0');
      zone.setAttribute('aria-label', hs.label || 'Hotspot zone');
      zone.setAttribute('aria-pressed', 'false');
      zone.addEventListener('pointerdown', (e) => { e.preventDefault(); handleHotspotTap(hs.id); });
      zone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleHotspotTap(hs.id); } });
      hotspotsContainer.appendChild(zone);
    });
  }

  function handleHotspotTap(hotspotId) {
    if (debounceTimers[hotspotId]) return;
    debounceTimers[hotspotId] = setTimeout(() => delete debounceTimers[hotspotId], 200);

    const allHotspots = Items.getHotspots(currentLevel);
    const hotspot = allHotspots.find(h => h.id === hotspotId);
    if (!hotspot) return;

    const idx = selectedIds.indexOf(hotspotId);
    if (idx >= 0) selectedIds.splice(idx, 1);
    else selectedIds.push(hotspotId);

    updateHotspotVisual(hotspotId);
    if (onHotspotTap) onHotspotTap(hotspotId, hotspot.correct, selectedIds.includes(hotspotId));
    notifySelectionChange();
  }

  function updateHotspotVisual(hotspotId) {
    const zone = document.getElementById('hs-' + hotspotId);
    if (!zone) return;
    const isSelected = selectedIds.includes(hotspotId);
    const hotspot = Items.getHotspots(currentLevel).find(h => h.id === hotspotId);
    if (!hotspot) return;
    zone.classList.remove('selected', 'selected-textured', 'selected-glossy');
    if (isSelected) {
      zone.setAttribute('aria-pressed', 'true');
      if (hotspot.category === 'textured') zone.classList.add('selected-textured');
      else if (hotspot.category === 'glossy') zone.classList.add('selected-glossy');
      else zone.classList.add('selected');
    } else {
      zone.setAttribute('aria-pressed', 'false');
    }
  }

  function shakeHotspot(hotspotId) {
    const zone = document.getElementById('hs-' + hotspotId);
    if (!zone) return;
    zone.classList.remove('shake');
    void zone.offsetWidth;
    zone.classList.add('shake');
    setTimeout(() => zone.classList.remove('shake'), 300);
  }

  function flashSuccess() {
    Items.getHotspots(currentLevel).forEach(hs => {
      if (hs.correct && selectedIds.includes(hs.id)) {
        const zone = document.getElementById('hs-' + hs.id);
        if (zone) {
          zone.style.transition = 'box-shadow 0.3s';
          zone.style.boxShadow = '0 0 20px rgba(57,255,20,0.6)';
          setTimeout(() => { zone.style.boxShadow = ''; }, 1000);
        }
      }
    });
  }

  // ── FEATURE GRID RENDERER (Levels 2, 4) ──
  function renderFeatureGrid(level, isTimed) {
    const features = Items.getFeatureCards(level);
    if (!features.length) return;

    // Shuffle feature order so positions change each visit
    shuffleArray(features);

    const grid = document.createElement('div');
    grid.className = 'feature-grid' + (isTimed ? ' timed-grid' : '');

    features.forEach(f => {
      const card = document.createElement('div');
      card.className = 'feature-card';
      card.id = 'fc-' + f.id;
      card.dataset.featureId = f.id;
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', f.label);
      card.setAttribute('aria-pressed', 'false');

      // Visual element
      const visual = buildFeatureVisual(f.visual);
      if (visual) card.appendChild(visual);

      // Label
      const label = document.createElement('span');
      label.className = 'feature-card-label';
      label.textContent = f.label;
      card.appendChild(label);

      // Tapping selects/deselects
      card.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (isTimed) return; // Handled by round logic
        handleFeatureCardTap(f.id, card);
      });
      card.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !isTimed) {
          e.preventDefault(); handleFeatureCardTap(f.id, card);
        }
      });

      grid.appendChild(card);
    });

    hotspotsContainer.appendChild(grid);
  }

  function handleFeatureCardTap(featureId, cardEl) {
    if (debounceTimers[featureId]) return;
    debounceTimers[featureId] = setTimeout(() => delete debounceTimers[featureId], 200);

    const idx = selectedIds.indexOf(featureId);
    if (idx >= 0) {
      selectedIds.splice(idx, 1);
      cardEl.classList.remove('selected');
      cardEl.setAttribute('aria-pressed', 'false');
    } else {
      selectedIds.push(featureId);
      cardEl.classList.add('selected');
      cardEl.setAttribute('aria-pressed', 'true');
    }
    notifySelectionChange();
  }

  function buildFeatureVisual(visual) {
    const el = document.createElement('div');
    el.className = 'feature-visual';

    if (visual === 'corner') {
      // L-shaped corner
      el.innerHTML = '<svg viewBox="0 0 60 60" class="feat-svg"><path d="M8 52 L8 8 L52 8" stroke="#1A1A2E" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="8" cy="8" r="5" fill="#2D6A4F"/></svg>';
    } else if (visual === 'corner-acute') {
      // Sharp V corner
      el.innerHTML = '<svg viewBox="0 0 60 60" class="feat-svg"><path d="M6 50 L30 6 L54 50" stroke="#1A1A2E" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="30" cy="6" r="5" fill="#2D6A4F"/></svg>';
    } else if (visual === 'vertex') {
      // Point/vertex
      el.innerHTML = '<svg viewBox="0 0 60 60" class="feat-svg"><circle cx="30" cy="30" r="8" fill="#2D6A4F"/><circle cx="30" cy="30" r="3" fill="white"/><line x1="6" y1="30" x2="22" y2="30" stroke="#999" stroke-width="2"/><line x1="38" y1="30" x2="54" y2="30" stroke="#999" stroke-width="2"/><line x1="30" y1="6" x2="30" y2="22" stroke="#999" stroke-width="2"/><line x1="30" y1="38" x2="30" y2="54" stroke="#999" stroke-width="2"/></svg>';
    } else if (visual === 'edge') {
      // Straight edge
      el.innerHTML = '<svg viewBox="0 0 60 60" class="feat-svg"><line x1="6" y1="30" x2="54" y2="30" stroke="#1A1A2E" stroke-width="6" stroke-linecap="round"/><circle cx="6" cy="30" r="4" fill="#999"/><circle cx="54" cy="30" r="4" fill="#999"/></svg>';
    } else if (visual === 'curve') {
      // Curved edge
      el.innerHTML = '<svg viewBox="0 0 60 60" class="feat-svg"><path d="M6 42 Q30 6 54 42" stroke="#1A1A2E" stroke-width="6" fill="none" stroke-linecap="round"/></svg>';
    } else if (visual === 'circle') {
      el.innerHTML = '<svg viewBox="0 0 60 60" class="feat-svg"><circle cx="30" cy="30" r="22" stroke="#1A1A2E" stroke-width="5" fill="none"/></svg>';
    } else if (visual === 'cross') {
      el.innerHTML = '<svg viewBox="0 0 60 60" class="feat-svg"><line x1="6" y1="6" x2="54" y2="54" stroke="#1A1A2E" stroke-width="6" stroke-linecap="round"/><line x1="54" y1="6" x2="6" y2="54" stroke="#1A1A2E" stroke-width="6" stroke-linecap="round"/></svg>';
    } else if (visual === 't-junction') {
      el.innerHTML = '<svg viewBox="0 0 60 60" class="feat-svg"><line x1="6" y1="12" x2="54" y2="12" stroke="#1A1A2E" stroke-width="6" stroke-linecap="round"/><line x1="30" y1="12" x2="30" y2="54" stroke="#1A1A2E" stroke-width="6" stroke-linecap="round"/></svg>';
    } else if (visual === 'surface') {
      el.innerHTML = '<svg viewBox="0 0 60 60" class="feat-svg"><rect x="8" y="8" width="44" height="44" rx="4" fill="#E8ECEF" stroke="#1A1A2E" stroke-width="3"/></svg>';
    } else if (visual === 'wave') {
      el.innerHTML = '<svg viewBox="0 0 60 60" class="feat-svg"><path d="M6 36 Q15 12 24 36 Q33 12 42 36 Q51 12 54 24" stroke="#1A1A2E" stroke-width="5" fill="none" stroke-linecap="round"/></svg>';
    } else if (visual === 'barcode') {
      // Barcode (vertical lines)
      el.innerHTML = '<div class="barcode-visual" aria-label="Barcode">' +
        Array.from({length: 12}, (_, i) =>
          '<div style="width:' + (3 + Math.random() * 6) + 'px;height:' + (50 + Math.random() * 50) + '%;background:#1A1A2E;border-radius:1px;flex-shrink:0;"></div>'
        ).join('') + '</div>';
    } else if (visual === 'texture') {
      el.innerHTML = '<svg viewBox="0 0 60 60" class="feat-svg"><rect x="4" y="4" width="52" height="52" rx="6" fill="#E8B84B" opacity="0.3"/><circle cx="15" cy="15" r="4" fill="#E8B84B" opacity="0.6"/><circle cx="35" cy="20" r="5" fill="#E8B84B" opacity="0.5"/><circle cx="20" cy="38" r="6" fill="#E8B84B" opacity="0.4"/><circle cx="42" cy="40" r="4" fill="#E8B84B" opacity="0.5"/><circle cx="28" cy="10" r="3" fill="#E8B84B" opacity="0.4"/></svg>';
    } else if (visual === 'glossy') {
      el.innerHTML = '<svg viewBox="0 0 60 60" class="feat-svg"><rect x="4" y="4" width="52" height="52" rx="6" fill="#4A90D9" opacity="0.15"/><path d="M8 8 L30 8 L20 28 L8 28 Z" fill="white" opacity="0.5"/><path d="M30 8 L52 8 L44 28 L30 28 Z" fill="white" opacity="0.2"/></svg>';
    } else if (visual && visual.length <= 4) {
      // Single character or emoji
      el.className = 'feature-visual feature-emoji';
      el.textContent = visual;
    } else {
      return null;
    }
    return el;
  }

  // ── TIMED ROUNDS RENDERER (Levels 5, 6) ──
  let roundPromptEl = null, roundGridEl = null, roundTimerEl = null, roundTimerFill = null;
  let currentRoundCorrectId = null, timedLevel = 5;

  function renderTimedRounds(level) {
    timedLevel = level;
    const rounds = Items.getRounds(level);
    const features = Items.getFeatureCards(level);
    const levelData = Levels.getLevel(level);
    const hideLabels = levelData ? levelData.hideLabels : false;
    roundIndex = 0; roundResults = []; roundActive = true;

    hotspotsContainer.innerHTML = '';

    // Round info bar
    roundPromptEl = document.createElement('div');
    roundPromptEl.className = 'round-prompt';
    hotspotsContainer.appendChild(roundPromptEl);

    // Timer
    roundTimerEl = document.createElement('div');
    roundTimerEl.className = 'round-timer';
    roundTimerFill = document.createElement('div');
    roundTimerFill.className = 'round-timer-fill';
    roundTimerEl.appendChild(roundTimerFill);
    hotspotsContainer.appendChild(roundTimerEl);

    // Shuffle rounds so prompts rotate each visit
    shuffleArray(rounds);

    // Grid container
    roundGridEl = document.createElement('div');
    roundGridEl.className = 'feature-grid timed-grid';
    hotspotsContainer.appendChild(roundGridEl);

    // Shuffle feature cards so positions change each visit
    shuffleArray(features);

    // Build feature cards (reusable across rounds)
    features.forEach(f => {
      const card = document.createElement('div');
      card.className = 'feature-card timed-card' + (hideLabels ? ' graphics-card' : '');
      card.id = 'rc-' + f.id;
      card.dataset.featureId = f.id;
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', f.label || 'Feature card');

      const visual = buildFeatureVisual(f.visual);
      if (visual) card.appendChild(visual);

      // Only add label if not hidden
      if (!hideLabels) {
        const label = document.createElement('span');
        label.className = 'feature-card-label';
        label.textContent = f.label;
        card.appendChild(label);
      }

      card.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        handleTimedTap(f.id);
      });
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleTimedTap(f.id); }
      });
      roundGridEl.appendChild(card);
    });

    startRound(0);
  }

  function startRound(index) {
    const rounds = Items.getRounds(timedLevel);
    if (!roundActive || index >= rounds.length) { finishTimedRounds(timedLevel); return; }

    roundIndex = index;
    const round = rounds[index];
    currentRoundCorrectId = round.correctId;

    // Update prompt
    roundPromptEl.innerHTML = '<span class="round-badge">Round ' + (index + 1) + '/' + rounds.length + '</span> ' + round.prompt;

    // Reset all cards
    document.querySelectorAll('.timed-card').forEach(c => {
      c.classList.remove('selected', 'wrong', 'correct-flash');
      c.style.pointerEvents = 'auto';
    });

    // Start timer
    const timeLimit = round.time || 5;
    const startTime = Date.now();
    roundTimerFill.style.width = '100%';
    roundTimerFill.style.background = 'var(--primary)';

    if (roundTimer) cancelAnimationFrame(roundTimer);

    function tick() {
      if (!roundActive) return;
      const elapsed = (Date.now() - startTime) / 1000;
      const pct = Math.max(0, (timeLimit - elapsed) / timeLimit * 100);
      roundTimerFill.style.width = pct + '%';
      if (pct < 25) roundTimerFill.style.background = '#E07A5F';
      else if (pct < 50) roundTimerFill.style.background = '#E9C46A';
      else roundTimerFill.style.background = 'var(--primary)';

      if (elapsed >= timeLimit) {
        // Time's up — mark missed
        roundResults.push({ index, correct: false });
        flashRoundMissed();
        setTimeout(() => startRound(index + 1), 800);
      } else {
        roundTimer = requestAnimationFrame(tick);
      }
    }
    tick();
  }

  function handleTimedTap(featureId) {
    if (!roundActive) return;
    const card = document.getElementById('rc-' + featureId);
    if (!card || card.classList.contains('selected') || card.classList.contains('wrong')) return;

    // Disable all cards
    document.querySelectorAll('.timed-card').forEach(c => c.style.pointerEvents = 'none');

    if (featureId === currentRoundCorrectId) {
      // Correct!
      if (roundTimer) cancelAnimationFrame(roundTimer);
      card.classList.add('selected');
      roundResults.push({ index: roundIndex, correct: true });
      setTimeout(() => startRound(roundIndex + 1), 600);
    } else {
      // Wrong — shake and retry
      card.classList.add('wrong');
      const msg = 'Not that one! Try again.';
      const toast = document.getElementById('toast-container');
      if (toast) {
        const t = document.createElement('div');
        t.className = 'toast error'; t.textContent = msg;
        t.id = 'toast-err'; toast.appendChild(t);
        setTimeout(() => { const e = document.getElementById('toast-err'); if (e) e.remove(); }, 2000);
      }
      // Re-enable cards after brief cooldown
      setTimeout(() => {
        card.classList.remove('wrong');
        document.querySelectorAll('.timed-card').forEach(c => c.style.pointerEvents = 'auto');
      }, 500);
    }
  }

  function flashRoundMissed() {
    // Highlight the correct card briefly
    document.querySelectorAll('.timed-card').forEach(c => {
      if (c.dataset.featureId === currentRoundCorrectId) {
        c.classList.add('correct-flash');
        setTimeout(() => c.classList.remove('correct-flash'), 1200);
      }
    });
  }

  function finishTimedRounds(level) {
    roundActive = false;
    if (roundTimer) cancelAnimationFrame(roundTimer);
    hotspotsContainer.innerHTML = '';

    const correctCount = roundResults.filter(r => r.correct).length;
    const total = roundResults.length;
    const levelData = Levels.getLevel(level);
    const passThreshold = levelData ? levelData.passCount : 4;
    const passed = correctCount >= passThreshold;

    document.dispatchEvent(new CustomEvent('timed-rounds-complete', {
      detail: { correct: correctCount, total, passed, level }
    }));

    const resultDiv = document.createElement('div');
    resultDiv.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(255,255,255,0.95);border-radius:16px;z-index:50;';
    resultDiv.innerHTML = '<div style="font-size:64px;margin-bottom:8px;">' + (passed ? '\uD83C\uDFC6' : '\uD83D\uDE22') +
      '</div><h2 style="color:#2D6A4F;margin:8px 0;">' + (passed ? (level === 6 ? 'Pure Vision!' : 'Scan Complete!') : 'Almost!') +
      '</h2><div style="font-size:36px;font-weight:700;color:#E9C46A;margin:4px 0;">' + correctCount + '/' + total +
      '</div><p style="color:#5A5A7A;margin:8px 0 16px;">' + (passed ? (level === 6 ? 'No labels needed — you see like an AI!' : 'Great feature spotting!') : 'Try again — you need ' + passThreshold + ' out of ' + total + '.') +
      '</p><button class="result-btn primary" id="timed-retry-btn" style="padding:10px 32px;font-family:var(--font-display);font-size:var(--fs-base);border:none;border-radius:var(--r-md);background:var(--primary);color:var(--text-inverse);cursor:pointer;min-height:48px;">Try Again</button>' +
      (passed ? '<button class="result-btn secondary" id="timed-menu-btn" style="margin-top:8px;padding:8px 24px;font-family:var(--font-display);font-size:var(--fs-base);border:none;border-radius:var(--r-sm);background:var(--primary);color:var(--text-inverse);cursor:pointer;min-width:160px;min-height:44px;">Back to Levels</button>' : '');
    hotspotsContainer.appendChild(resultDiv);
    document.getElementById('timed-retry-btn')?.addEventListener('click', () => document.dispatchEvent(new CustomEvent('annotator-retry')));
    document.getElementById('timed-menu-btn')?.addEventListener('click', () => document.dispatchEvent(new CustomEvent('timed-menu')));
  }

  // ── OLD CONVEYOR (kept for backward compat, no longer used) ──
  function renderConveyorLevel(items, hotspots) { /* unused — replaced by timed rounds */ }
  function showConveyorItem(index) {}

  // ── SHARED ──
  function notifySelectionChange() { if (onSelectionChange) onSelectionChange([...selectedIds]); }

  function toggleDebug() {
    debugMode = !debugMode;
    if (debugMode) showDebugOverlay(currentLevel);
    else debugOverlay.style.display = 'none';
    return debugMode;
  }

  function showDebugOverlay(level) {
    if (!debugOverlay) return;
    debugOverlay.style.display = 'block';
    debugOverlay.innerHTML = '';
    // Show correct feature IDs for grid levels (2, 4) and timed rounds (5, 6)
    if (level === 2 || level === 4 || level === 5 || level === 6) {
      const ids = Items.getCorrectIds(level).length ? Items.getCorrectIds(level) : [];
      if (level === 5 || level === 6) {
        // For timed rounds, show round correct IDs
        const rounds = Items.getRounds(level);
        if (rounds.length) {
          const roundInfo = document.createElement('div');
          roundInfo.textContent = 'Rounds: ' + rounds.map((r, i) => '#' + (i+1) + '=' + r.correctId).join(', ');
          roundInfo.style.cssText = 'padding:4px 8px;background:rgba(233,196,106,0.2);border:1px dashed #E9C46A;border-radius:4px;margin:4px;font-size:12px;color:#2D6A4F;';
          debugOverlay.appendChild(roundInfo);
        }
      }
      ids.forEach(id => {
        const div = document.createElement('div');
        div.textContent = 'Correct: ' + id;
        div.style.cssText = 'padding:4px 8px;background:rgba(233,196,106,0.2);border:1px dashed #E9C46A;border-radius:4px;margin:4px;font-size:12px;color:#2D6A4F;';
        debugOverlay.appendChild(div);
      });
    } else {
      Items.getHotspots(level).filter(h => h.correct).forEach(hs => {
        const div = document.createElement('div');
        div.style.cssText = 'position:absolute;border:2px dashed #E9C46A;background:rgba(233,196,106,0.1);border-radius:4px;pointer-events:none;';
        const item = Items.getItems(level).find(i => i.id === hs.itemId);
        if (item) {
          div.style.left = (item.x + hs.x * item.w / 100) + '%';
          div.style.top = (item.y + hs.y * item.h / 100) + '%';
          div.style.width = (hs.w * item.w / 100) + '%';
          div.style.height = (hs.h * item.h / 100) + '%';
        }
        const label = document.createElement('span');
        label.textContent = hs.label || hs.id;
        label.style.cssText = 'font-size:11px;font-weight:700;color:#2D6A4F;padding:2px;';
        div.appendChild(label);
        debugOverlay.appendChild(div);
      });
    }
    console.log('[Annotator] Debug: correct IDs =', Items.getCorrectIds(level));
    console.log('[Annotator] Current selection:', [...selectedIds]);
  }

  function getSelected() { return [...selectedIds]; }
  function isSelected(featureId) { return selectedIds.includes(featureId); }
  function getRoundResults() { return roundResults; }
  function getRoundLevel() { return timedLevel; }

  function reset() {
    selectedIds = []; roundActive = false; roundResults = []; roundIndex = 0;
    if (roundTimer) cancelAnimationFrame(roundTimer);
    if (itemsContainer) itemsContainer.innerHTML = '';
    if (hotspotsContainer) hotspotsContainer.innerHTML = '';
    if (debugOverlay) debugOverlay.style.display = 'none';
    debounceTimers = {};
  }

  return {
    init, loadLevel, getSelected, isSelected, reset,
    shakeHotspot, flashSuccess, toggleDebug,
    getRoundResults, getRoundLevel
  };
})();
