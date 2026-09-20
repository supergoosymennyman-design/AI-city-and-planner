/**
 * main.js — UI Controller for My First AI City
 * Handles rendering, event binding, phase management.
 */
(function() {
  'use strict';

  // ── DOM Refs ──
  let $ = {};
  function cacheDom() {
    $ = {
      intro: document.getElementById('intro-overlay'),
      container: document.getElementById('game-container'),
      introBtn: document.getElementById('intro-start-btn'),
      grid: document.getElementById('grid'),
      connectionSvg: document.getElementById('connection-overlay'),
      agentLayer: document.getElementById('agent-layer'),
      palette: document.getElementById('palette-list'),
      infoPanel: document.getElementById('info-content'),
      infoActions: document.getElementById('info-actions'),
      infoTitle: document.getElementById('info-title'),
      phaseName: document.getElementById('phase-name'),
      phaseProgress: document.getElementById('phase-progress'),
      coinCount: document.getElementById('coin-count'),
      phaseDots: document.querySelectorAll('.phase-dot'),
      buildActions: document.getElementById('build-actions'),
      connectActions: document.getElementById('connect-actions'),
      watchActions: document.getElementById('watch-actions'),
      connectCta: document.getElementById('connect-cta'),
      startCityCta: document.getElementById('start-city-cta'),
      connectTabs: document.querySelectorAll('.connect-tab'),
      connectTitle: document.getElementById('connect-title'),
      connectText: document.getElementById('connect-text'),
      connectProgress: document.getElementById('connect-progress'),
      connectInstruction: document.getElementById('connect-instruction'),
      crisisOverlay: document.getElementById('crisis-overlay'),
      crisisTitle: document.getElementById('crisis-title'),
      crisisText: document.getElementById('crisis-text'),
      crisisProgress: document.getElementById('crisis-progress'),
      scanBtn: document.getElementById('scan-btn'),
      speedBtns: document.querySelectorAll('.speed-btn'),
      simTimer: document.getElementById('sim-timer'),
      endOverlay: document.getElementById('end-overlay'),
      endStars: document.getElementById('end-stars'),
      endBadge: document.getElementById('end-badge'),
      endStats: document.getElementById('end-stats'),
      endNova: document.getElementById('end-nova'),
      endRebuild: document.getElementById('end-rebuild'),
      endShare: document.getElementById('end-share'),
      wasteGame: document.getElementById('waste-game'),
      wasteItems: document.getElementById('waste-items'),
      wasteScore: document.getElementById('waste-score'),
      wasteDone: document.getElementById('waste-done'),
      wasteBins: document.querySelectorAll('.bin'),
      toast: document.getElementById('toast-container'),
      transcriptToggle: document.getElementById('transcript-toggle'),
      transcriptOverlay: document.getElementById('transcript-overlay'),
      transcriptClose: document.getElementById('transcript-close'),
    };
  }

  // ── Grid Rendering ──
  let selectedBuildType = null;
  let scanModeActive = false;
  let connectSourceId = null;
  let selectedBuildingId = null;
  let animFrameId = null;
  let lastFrameTime = 0;

  function renderGrid() {
    const g = $.grid;
    const state = Game.state;
    g.innerHTML = '';
    g.style.gridTemplateColumns = `repeat(${Game.GRID_SIZE}, 1fr)`;

    for (let r = 0; r < Game.GRID_SIZE; r++) {
      for (let c = 0; c < Game.GRID_SIZE; c++) {
        const tile = document.createElement('div');
        tile.className = 'grid-tile';
        tile.dataset.row = r;
        tile.dataset.col = c;

        // Terrain type
        if (Game.isTerrainWater(r, c)) {
          tile.classList.add('water');
        } else {
          tile.classList.add('grass');
        }

        // Hazard
        const key = r + ',' + c;
        if (Game.state.hazardResults[key] === 'hazard') {
          tile.classList.add('hazard', 'revealed');
          const scanResult = document.createElement('span');
          scanResult.className = 'scan-result';
          scanResult.textContent = '❌';
          tile.appendChild(scanResult);
        } else if (Game.state.hazardResults[key] === 'clear' && Game.state.scanned.has(key)) {
          tile.classList.add('scanned-clear');
        }

        // Building
        const b = Game.getBuildingAt(r, c);
        if (b) {
          tile.classList.add('has-building');
          const emoji = document.createElement('span');
          emoji.className = 'building-emoji';
          emoji.textContent = b.def.emoji;
          tile.appendChild(emoji);
          if (b.efficiency < 1) {
            tile.style.opacity = '0.7';
          }
          // Connection checkmarks
          if (b.def.needs) {
            const checks = [];
            if (b.def.needs.includes('water') && b.connections.water) checks.push('💧');
            if (b.def.needs.includes('power') && b.connections.power) checks.push('⚡');
            if (b.def.needs.includes('road') && b.connections.road) checks.push('🛣️');
            if (checks.length > 0) {
              const cm = document.createElement('span');
              cm.className = 'check-mark';
              cm.textContent = checks.join('');
              tile.appendChild(cm);
            }
          }
        }

        // Puddles (Phase 3)
        if (Game.state.puddles.some(p => p.row === r && p.col === c)) {
          tile.textContent = '💦';
          tile.style.fontSize = '32px';
        }

        tile.addEventListener('click', () => onTileClick(r, c));
        g.appendChild(tile);
      }
    }
    renderConnections();
  }

  function renderConnections() {
    const svg = $.connectionSvg;
    const state = Game.state;
    if (!svg) return;
    const rect = $.grid.getBoundingClientRect();
    const tileW = rect.width / Game.GRID_SIZE;
    const tileH = rect.height / Game.GRID_SIZE;
    svg.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
    svg.style.width = rect.width + 'px';
    svg.style.height = rect.height + 'px';
    svg.style.left = '0';
    svg.style.top = '0';

    let html = '';
    state.connections.forEach(conn => {
      const from = Game.getBuilding(conn.fromId);
      const to = Game.getBuilding(conn.toId);
      if (!from || !to) return;
      const x1 = (from.col + 0.5) * tileW;
      const y1 = (from.row + 0.5) * tileH;
      const x2 = (to.col + 0.5) * tileW;
      const y2 = (to.row + 0.5) * tileH;
      const color = conn.type === 'water' ? '#38bdf8' : conn.type === 'power' ? '#facc15' : '#a78bfa';
      const dash = conn.type === 'road' ? 'stroke-dasharray="8,4"' : '';
      html += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="conn-line conn-${conn.type}" ${dash} data-conn="${conn.type}" />`;
    });
    svg.innerHTML = html;
  }

  function renderPalette() {
    const state = Game.state;
    $.palette.innerHTML = Object.entries(Game.BUILDING_DEFS).map(([type, def]) => {
      const count = Game.state.buildings.filter(b => b.type === type).length;
      const maxed = count >= def.max;
      const unaffordable = state.spent + def.cost > state.budget;
      const disabled = maxed || unaffordable;
      return `<div class="palette-item ${disabled ? 'disabled' : ''} ${selectedBuildType === type ? 'selected' : ''}" data-type="${type}">
        <span class="emoji">${def.emoji}</span>
        <span>${def.label}</span>
        <span class="cost">🪙${def.cost}</span>
      </div>`;
    }).join('');

    $.palette.querySelectorAll('.palette-item').forEach(el => {
      el.addEventListener('click', () => {
        const type = el.dataset.type;
        if (el.classList.contains('disabled')) return;
        selectedBuildType = selectedBuildType === type ? null : type;
        renderPalette();
        Audio.click();
      });
    });
  }

  // ── Phase Management ──
  function setPhase(phase) {
    const state = Game.state;
    state.phase = phase;
    state.save();

    // Phase dots
    const order = ['build','connect','watch','end'];
    const idx = order.indexOf(phase);
    $.phaseDots.forEach((dot, i) => {
      dot.classList.toggle('active', i === idx);
      dot.classList.toggle('done', i < idx);
    });

    // Phase visibility
    $.buildActions.style.display = phase === 'build' ? 'flex' : 'none';
    $.connectActions.style.display = phase === 'connect' ? 'flex' : 'none';
    $.watchActions.style.display = phase === 'watch' ? 'flex' : 'none';

    const names = { build:'Phase 1: Build', connect:'Phase 2: Connect', watch:'Phase 3: Watch' };
    $.phaseName.textContent = names[phase] || '';

    if (phase === 'connect') {
      setupConnectPhase();
    } else if (phase === 'watch') {
      startWatchPhase();
    } else if (phase === 'build') {
      setupBuildPhase();
    }

    updateUI();
  }

  // ── Phase 1: Build ──
  function setupBuildPhase() {
    scanModeActive = false;
    $.scanBtn.classList.remove('active');
    document.body.classList.remove('scan-mode');
    selectedBuildType = null;
    selectedBuildingId = null;
    renderGrid();
    renderPalette();
    updateCoinDisplay();
    checkBuildComplete();
  }

  function checkBuildComplete() {
    const state = Game.state;
    const minMet = Object.entries(Game.REQUIRED).every(([type, count]) =>
      state.buildings.filter(b => b.type === type).length >= count
    );
    if (minMet && state.spent <= state.budget) {
      $.connectCta.style.display = 'inline-flex';
      $.phaseProgress.textContent = 'Ready to connect!';
    } else {
      $.connectCta.style.display = 'none';
      const missing = Object.entries(Game.REQUIRED)
        .filter(([type, count]) => state.buildings.filter(b => b.type === type).length < count)
        .map(([type, count]) => `${type} (need ${count})`);
      $.phaseProgress.textContent = missing.length ? 'Need: ' + missing.join(', ') : 'Place more buildings';
    }
  }

  function updateCoinDisplay() {
    const state = Game.state;
    $.coinCount.textContent = state.budget - state.spent;
  }

  // ── Phase 2: Connect ──
  function setupConnectPhase() {
    scanModeActive = false;
    document.body.classList.remove('scan-mode');
    $.connectInstruction.style.display = 'block';
    selectedBuildType = null;
    selectedBuildingId = null;

    // Determine current step
    const steps = ['water','power','road'];
    let currentStep = 'water';
    for (const s of steps) {
      const prog = Game.getConnectionProgress(s);
      if (prog.connected < prog.total) {
        currentStep = s;
        break;
      }
    }
    Game.state.connectStep = currentStep;
    updateConnectTabs();
    showConnectStep(currentStep);
    renderGrid();
    checkConnectComplete();
  }

  function updateConnectTabs() {
    const steps = ['water','power','road'];
    const state = Game.state;
    $.connectTabs.forEach(tab => {
      const step = tab.dataset.step;
      tab.classList.toggle('active', step === state.connectStep);
      const prog = Game.getConnectionProgress(step);
      if (prog.total > 0 && prog.connected >= prog.total && step !== state.connectStep) {
        tab.classList.add('done');
      } else {
        tab.classList.remove('done');
      }
    });
  }

  function showConnectStep(step) {
    const info = Game.CONNECTION_TYPES[step];
    if (!info) return;
    $.connectTitle.textContent = 'Connect ' + info.label;
    const prog = Game.getConnectionProgress(step);
    $.connectText.textContent = prog.total === 0
      ? 'No buildings need this type of connection!'
      : `Tap a ${info.label.split(' ')[0]} building, then tap buildings to connect them.`;
    $.connectProgress.textContent = `${prog.connected} / ${prog.total} connected`;
    connectSourceId = null;
  }

  function checkConnectComplete() {
    const state = Game.state;
    const complete = Game.isConnectPhaseComplete();
    if (complete) {
      $.startCityCta.style.display = 'inline-flex';
      $.connectInstruction.style.display = 'none';
    } else {
      $.startCityCta.style.display = 'none';
    }
  }

  // ── Phase 3: Watch ──
  function startWatchPhase() {
    $.connectInstruction.style.display = 'none';
    $.crisisOverlay.style.display = 'none';
    Game.startSimulation();
    lastFrameTime = performance.now();
    if (animFrameId) cancelAnimationFrame(animFrameId);
    gameLoop(lastFrameTime);
  }

  function gameLoop(timestamp) {
    if (!Game.state.simRunning) {
      renderAgentLayer();
      animFrameId = null;
      return;
    }
    const dt = timestamp - lastFrameTime;
    lastFrameTime = timestamp;

    Game.tickSimulation(dt);
    renderAgentLayer();
    renderGrid();
    updateCrisisUI();
    updateTimer();

    animFrameId = requestAnimationFrame(gameLoop);
  }

  function renderAgentLayer() {
    const layer = $.agentLayer;
    const state = Game.state;
    const rect = $.grid.getBoundingClientRect();
    const tileW = rect.width / Game.GRID_SIZE;
    const tileH = rect.height / Game.GRID_SIZE;
    layer.style.width = rect.width + 'px';
    layer.style.height = rect.height + 'px';

    let html = '';

    // Citizens
    state.citizens.forEach(cit => {
      if (!cit.current) return;
      const cx = (cit.current.col + 0.5) * tileW;
      const cy = (cit.current.row + 0.5) * tileH;
      const visible = state.simTime > 500; // brief delay before appearing
      html += `<div class="agent citizen" style="left:${cx-10}px;top:${cy-10}px;background:${cit.color};opacity:${visible?1:0}"></div>`;
    });

    // Bus
    if (state.busPos) {
      const bx = (state.busPos.c + 0.5) * tileW;
      const by = (state.busPos.r + 0.5) * tileH;
      html += `<div class="agent bus" style="left:${bx-14}px;top:${by-9}px">🚌</div>`;
    }

    // Puddles
    state.puddles.forEach(p => {
      const px = (p.col + 0.5) * tileW;
      const py = (p.row + 0.5) * tileH;
      html += `<div class="agent" style="left:${px-16}px;top:${py-16}px;width:32px;height:32px;font-size:28px;cursor:pointer;pointer-events:auto" data-puddle="${p.row},${p.col}">💦</div>`;
    });

    layer.innerHTML = html;

    // Puddle click handlers
    layer.querySelectorAll('[data-puddle]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const [r, c] = el.dataset.puddle.split(',').map(Number);
        Game.drainPuddle(r, c);
        Audio.splash();
        updateUI();
      });
    });
  }

  function updateCrisisUI() {
    const state = Game.state;
    if (state.crisisActive) {
      $.crisisOverlay.style.display = 'block';
      $.crisisProgress.textContent = `${state.puddlesDrained} / ${Game.PUDDLE_COUNT} puddles drained`;
    } else {
      $.crisisOverlay.style.display = 'none';
    }
    // Check if sim should end
    if (state.simTime > 120000 || (state.puddlesDrained >= Game.PUDDLE_COUNT && state.simTime > 40000)) {
      if (!state.simEnded) {
        Game.endSimulation();
        showEndScreen();
      }
    }
  }

  function updateTimer() {
    const t = Math.floor(Game.state.simTime / 1000);
    const m = Math.floor(t / 60);
    const s = t % 60;
    $.simTimer.textContent = String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
    if (Game.state.puddlesDrained >= Game.PUDDLE_COUNT && !Game.state.crisisActive) {
      $.simTimer.textContent += ' ✅';
    }
  }

  // ── End Screen ──
  function showEndScreen() {
    if (animFrameId) cancelAnimationFrame(animFrameId);
    const state = Game.state;
    $.endOverlay.style.display = 'flex';
    $.endStars.textContent = '⭐'.repeat(state.stars) + '☆'.repeat(3 - state.stars);
    const badges = ['🏗️ Apprentice Builder','🏗️ City Builder','🏗️ Master City Builder'];
    $.endBadge.textContent = badges[state.stars] || badges[0];

    const totalB = state.buildings.length;
    const connectedB = state.buildings.filter(b => (b.def.needs||[]).length > 0 && (b.def.needs||[]).every(n => b.connections[n])).length;
    $.endStats.innerHTML = `
      Buildings placed: ${totalB}<br>
      Buildings connected: ${connectedB}<br>
      Puddles drained: ${state.puddlesDrained}/${Game.PUDDLE_COUNT}<br>
      Waste sorted: ${Game.WASTE_ITEMS.length} items
    `;
    $.endNova.textContent = state.stars >= 2
      ? 'Wow! You built an amazing city with connected water, power, and roads! The citizens love it!'
      : 'Good job building your first city! Try again to connect everything and get more stars!';
  }

  // ── UI Updates ──
  function updateUI() {
    const state = Game.state;
    updateCoinDisplay();

    if (state.phase === 'build') {
      checkBuildComplete();
    } else if (state.phase === 'connect') {
      checkConnectComplete();
      const p = Game.getConnectionProgress(state.connectStep);
      if ($.connectProgress) $.connectProgress.textContent = `${p.connected} / ${p.total} connected`;
    }
    if (state.phase === 'connect' || state.phase === 'build') {
      renderGrid();
    }
  }

  function toast(msg, type) {
    const el = document.createElement('div');
    el.className = 'toast' + (type ? ' ' + type : '');
    el.textContent = msg;
    $.toast.appendChild(el);
    setTimeout(() => el.remove(), 2500);
  }

  // ── Tile Click Handler ──
  function onTileClick(r, c) {
    const state = Game.state;

    // Scan mode (Phase 1)
    if (scanModeActive && state.phase === 'build') {
      const result = Game.scanTile(r, c);
      if (result) {
        if (result.result === 'hazard') toast('⚠️ Hazard found! Cannot build here.');
        else if (result.result === 'clear') toast('✅ Clear! Safe to build.');
        else if (result.result === 'water') toast('💧 That is a river!');
        renderGrid();
      }
      return;
    }

    // Puddle click (Phase 3)
    if (state.phase === 'watch' && state.crisisActive) {
      const puddle = state.puddles.find(p => p.row === r && p.col === c);
      if (puddle) {
        Game.drainPuddle(r, c);
        renderGrid();
        return;
      }
    }

    // Building placement (Phase 1)
    if (state.phase === 'build') {
      if (selectedBuildType) {
        const result = Game.placeBuilding(selectedBuildType, r, c);
        if (result.error) {
          toast(result.error, 'error');
        } else {
          toast(`✅ ${Game.BUILDING_DEFS[selectedBuildType].label} placed!`, 'success');
          // Check if placed on unscanned hazard
          const key = r + ',' + c;
          if (state.hazardResults[key] === 'hazard') {
            setTimeout(() => toast('⚠️ Built on a hidden hazard! Building is only 50% efficient.', 'error'), 500);
          }
          renderGrid();
          renderPalette();
          updateUI();
          state.save();
        }
        return;
      }

      // Select existing building
      const b = Game.getBuildingAt(r, c);
      if (b) {
        selectedBuildingId = b.id;
        showBuildingInfo(b);
        return;
      }
      selectedBuildingId = null;
      $.infoContent.innerHTML = '<p class="info-hint">Tap a building to see its details.</p>';
      $.infoActions.style.display = 'none';
    }

    // Connection mode (Phase 2)
    if (state.phase === 'connect') {
      const step = state.connectStep;
      const b = Game.getBuildingAt(r, c);
      if (!b) return;

      // If no source selected, try to select one
      if (connectSourceId === null) {
        const sources = Game.getSourceBuildings(step);
        const isSource = sources.some(s => s.id === b.id);
        if (isSource) {
          connectSourceId = b.id;
          toast(`Selected ${b.def.label}. Now tap a building to connect!`);
          renderGrid();
          highlightValidTargets(step);
          return;
        }
        toast(`Tap a ${step} source first!`, 'error');
        return;
      }

      // Validate target is a valid building for this connection type
      const validTargets = Game.getValidTargets(step);
      if (!validTargets.some(t => t.id === b.id)) {
        if (b.id === connectSourceId) {
          toast('This is the same building! Tap a different one.', 'error');
        } else {
          toast(`This building does not need ${step} connections.`, 'error');
        }
        return;
      }

      // Try to connect
      const result = Game.addConnection(connectSourceId, b.id, step);
      if (result) {
        toast('✅ Connected!');
        connectSourceId = null;
        // updateUI() handles grid re-render
        updateUI();
        Game.save();
        updateConnectTabs();

        // Check if step complete
        const prog = Game.getConnectionProgress(step);
        if (prog.connected >= prog.total) {
          toast(`🎉 All ${step} connections done!`);
          // Advance to next step
          const steps = ['water','power','road'];
          const nextIdx = steps.indexOf(step) + 1;
          if (nextIdx < steps.length) {
            state.connectStep = steps[nextIdx];
            showConnectStep(state.connectStep);
            updateConnectTabs();
          } else {
            // All done
            toast('🎉 All connections made! Press Start City!');
            checkConnectComplete();
          }
        } else {
          showConnectStep(step);
        }
      } else {
        toast('Already connected!', 'error');
      }
    }
  }

  function highlightValidTargets(step) {
    // Visual only — handled by renderGrid connection highlighting
    const targets = Game.getValidTargets(step);
    // We'll use CSS classes — but grid rerenders, so we need to add classes to tiles
    const tiles = $.grid.querySelectorAll('.grid-tile');
    targets.forEach(t => {
      const tile = $.grid.querySelector(`[data-row="${t.row}"][data-col="${t.col}"]`);
      if (tile) {
        tile.classList.add(step === 'water' ? 'highlight-target' : step === 'power' ? 'highlight-power' : 'highlight-road');
      }
    });
  }

  function showBuildingInfo(b) {
    const def = b.def;
    let statusHtml = '';
    if (def.needs && def.needs.length > 0) {
      statusHtml = '<div class="status">' +
        def.needs.map(n => {
          const ok = b.connections[n];
          return `<div class="status-item"><span>${n}</span><span class="${ok ? 'status-ok' : 'status-missing'}">${ok ? '✅' : '❌'}</span></div>`;
        }).join('') +
        '</div>';
    } else if (def.provides) {
      statusHtml = `<div class="status-item"><span>Provides ${def.provides}</span><span class="status-ok">✅</span></div>`;
    }
    if (b.efficiency < 1) {
      statusHtml += '<div class="status-item"><span>⚠️ Built on hazard — 50% efficiency</span></div>';
    }
    $.infoContent.innerHTML = `<div class="building-detail">
      <div class="name">${def.emoji} ${def.label}</div>
      ${statusHtml}
    </div>`;
    $.infoTitle.textContent = 'Building Info';
    $.infoActions.style.display = 'flex';
    $.infoActions.innerHTML = `
      <button class="btn-danger" data-action="remove">Remove (refund ${Math.floor(def.cost*0.6)})</button>
    `;
    $.infoActions.querySelector('[data-action="remove"]').addEventListener('click', () => {
      Game.removeBuilding(b.id);
      selectedBuildingId = null;
      $.infoContent.innerHTML = '<p class="info-hint">Building removed.</p>';
      $.infoActions.style.display = 'none';
      renderGrid();
      renderPalette();
      updateUI();
      Game.save();
    });
  }

  // ── Waste Sorting ──
  function showWasteGame() {
    Game.initWasteSorting();
    $.wasteGame.style.display = 'flex';
    renderWasteItems();
    $.wasteScore.textContent = 'Sorted: 0 / ' + Game.WASTE_ITEMS.length;
    $.wasteDone.style.display = 'none';
  }

  function renderWasteItems() {
    $.wasteItems.innerHTML = Game.WASTE_ITEMS.map((item, i) =>
      `<div class="waste-item" data-index="${i}" draggable="false">${item.emoji}</div>`
    ).join('');

    $.wasteItems.querySelectorAll('.waste-item').forEach(el => {
      let startX, startY, clone;
      el.addEventListener('touchstart', (e) => {
        const t = e.touches[0];
        startX = t.clientX;
        startY = t.clientY;
        clone = el.cloneNode(true);
        clone.style.position = 'fixed';
        clone.style.zIndex = '200';
        clone.style.pointerEvents = 'none';
        clone.style.width = '56px';
        clone.style.height = '56px';
        clone.style.opacity = '0.8';
        document.body.appendChild(clone);
        el.classList.add('dragging');
      }, { passive: true });
      el.addEventListener('touchmove', (e) => {
        if (!clone) return;
        const t = e.touches[0];
        clone.style.left = (t.clientX - 28) + 'px';
        clone.style.top = (t.clientY - 28) + 'px';
        // Check bins
        $.wasteBins.forEach(bin => {
          const rect = bin.getBoundingClientRect();
          if (t.clientX >= rect.left && t.clientX <= rect.right && t.clientY >= rect.top && t.clientY <= rect.bottom) {
            bin.classList.add('drag-over');
          } else {
            bin.classList.remove('drag-over');
          }
        });
      }, { passive: true });
      el.addEventListener('touchend', (e) => {
        if (!clone) return;
        const t = e.changedTouches[0];
        clone.remove();
        el.classList.remove('dragging');
        $.wasteBins.forEach(bin => bin.classList.remove('drag-over'));
        const idx = parseInt(el.dataset.index);
        let dropped = false;
        $.wasteBins.forEach(bin => {
          const rect = bin.getBoundingClientRect();
          if (t.clientX >= rect.left && t.clientX <= rect.right && t.clientY >= rect.top && t.clientY <= rect.bottom) {
            dropped = true;
            const binType = bin.dataset.bin;
            const correct = Game.sortWaste(idx, binType);
            if (correct) {
              el.classList.add('done');
              toast('✅ Correct!');
            } else {
              toast('❌ Try again!');
            }
            updateWasteScore();
          }
        });
      }, { passive: true });
    });
  }

  function updateWasteScore() {
    const sorted = Game.state.wasteSorted;
    $.wasteScore.textContent = `Sorted: ${sorted} / ${Game.WASTE_ITEMS.length}`;
    if (sorted >= Game.WASTE_ITEMS.length) {
      $.wasteDone.style.display = 'inline-block';
      Audio.complete();
    }
  }

  // ── Event Binding ──
  function bindEvents() {
    // Intro
    $.introBtn.addEventListener('click', () => {
      $.intro.style.display = 'none';
      $.container.style.display = 'flex';
      Game.init();
      setPhase('build');
      Audio.click();
    });

    // Phase transitions
    $.connectCta.addEventListener('click', () => {
      setPhase('connect');
      Audio.click();
    });
    $.startCityCta.addEventListener('click', () => {
      setPhase('watch');
      Audio.click();
    });

    // Scan
    $.scanBtn.addEventListener('click', () => {
      scanModeActive = !scanModeActive;
      $.scanBtn.classList.toggle('active', scanModeActive);
      document.body.classList.toggle('scan-mode', scanModeActive);
      Audio.click();
    });

    // Connect tabs
    $.connectTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        Game.state.connectStep = tab.dataset.step;
        showConnectStep(Game.state.connectStep);
        updateConnectTabs();
        renderGrid();
        Audio.click();
      });
    });

    // Speed controls
    $.speedBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        Game.state.simSpeed = parseInt(btn.dataset.speed);
        $.speedBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        Audio.click();
      });
    });

    // Waste game: close
    $.wasteDone.addEventListener('click', () => {
      $.wasteGame.style.display = 'none';
      if (Game.state.wasteSorted >= Game.WASTE_ITEMS.length) {
        toast('🎉 Recycling complete! +1 bonus star!');
      }
      Audio.click();
    });

    // End screen
    $.endRebuild.addEventListener('click', () => {
      $.endOverlay.style.display = 'none';
      Game.clearSave();
      Game.init();
      setPhase('build');
      Audio.click();
    });
    $.endShare.addEventListener('click', () => {
      // Simple screenshot via canvas
      try {
        const el = $.grid;
        html2canvas ? html2canvas(el).then(canvas => {
          canvas.toBlob(blob => {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'my-ai-city.png';
            a.click();
          });
        }) : toast('Take a screenshot of your city!');
      } catch(e) { toast('Take a screenshot of your city!'); }
      Audio.click();
    });

    // Misc
    $.transcriptToggle.addEventListener('click', () => {
      $.transcriptOverlay.style.display = 'flex';
    });
    $.transcriptClose.addEventListener('click', () => {
      $.transcriptOverlay.style.display = 'none';
    });

    // Teacher controls (backtick key)
    document.addEventListener('keydown', (e) => {
      if (e.key === '`') {
        const actions = [
          { label:'Reset to Build', fn:()=>{Game.clearSave();Game.init();setPhase('build');toast('Reset!');} },
          { label:'Skip to Connect', fn:()=>{setPhase('connect');} },
          { label:'Skip to Watch', fn:()=>{setPhase('watch');} },
          { label:'+10 Coins', fn:()=>{Game.state.budget+=10;toast('Budget +10!');updateCoinDisplay();} },
          { label:'Trigger Crisis', fn:()=>{if(Game.state.phase==='watch'){Game.state.simTime=31000;toast('Crisis imminent!');}} },
        ];
        if (window.confirm) {
          const choice = prompt('Teacher Controls:\n1: Reset\n2: Skip Connect\n3: Skip Watch\n4: +10 Coins\n5: Trigger Crisis');
          const idx = parseInt(choice) - 1;
          if (idx >= 0 && idx < actions.length) actions[idx].fn();
        }
      }
    });
  }

  // ── Init ──
  function init() {
    cacheDom();
    Settings.init();
    bindEvents();

    // Check for saved game
    if (Game.loadSave()) {
      $.intro.style.display = 'none';
      $.container.style.display = 'flex';
      setPhase(Game.state.phase);
      toast('📂 Welcome back!', 'success');
    }

    // Auto-save every 10s
    setInterval(() => {
      if (Game.state.phase && Game.state.phase !== 'intro' && !Game.state.simEnded) {
        Game.save();
      }
    }, 10000);
  }

  // Start when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
