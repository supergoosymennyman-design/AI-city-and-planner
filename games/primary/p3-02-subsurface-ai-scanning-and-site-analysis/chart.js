/* ============================================================
   chart.js — Danger Meter & Visualizations (age 8-friendly)
   Subsurface Signal Decoder (P3, Age 8)

   Simple visualizations:
   - Level 1: Danger Meter — like a thermometer (safe below, danger above)
   - Level 2: Threshold slider bar
   - Level 3: Wavy noise + threshold line
   - Level 4: 3 sensor bars with votes
   - Level 5: Confidence bar
   ============================================================ */

const ChartRenderer = (() => {
  'use strict';

  let canvas = null;
  let ctx = null;
  let animFrame = null;
  let animationTime = 0;
  let width = 0;
  let height = 0;
  let _isScanning = false;
  let _scanTimeout = null;
  let _collapseAnim = 0;
  let _collapseTimeout = null;
  let _collapseCell = null;

  function init(c) {
    canvas = c;
    ctx = canvas.getContext('2d');
    resize();
  }

  function resize() {
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    width = rect.width;
    height = rect.height;
    if (width <= 0 || height <= 0) return;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function getWidth() { return width; }
  function getHeight() { return height; }

  function startAnimation() {
    if (animFrame) return;
    function loop() {
      animationTime = Date.now() / 1000;
      renderFrame();
      animFrame = requestAnimationFrame(loop);
    }
    loop();
  }

  function stopAnimation() {
    if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
  }

  function chartBounds() {
    const pad = { t: 10, r: 10, b: 10, l: 10 };
    return { x: pad.l, y: pad.t, w: width - pad.l - pad.r, h: height - pad.t - pad.b };
  }

  // ── Draw Threshold Line ──
  function drawThreshold(T, options = {}) {
    if (T === null || T === undefined) return;
    const { color = '#FF6B35', dashed = true, label = 'Threshold', showLabel = true } = options;
    const b = chartBounds();
    const y = b.y + b.h * (1 - T / 100); // T=0 at bottom, T=100 at top

    if (y < b.y || y > b.y + b.h) return; // Off chart

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.8;
    if (dashed) {
      ctx.setLineDash([8, 4]);
    }
    ctx.beginPath();
    ctx.moveTo(b.x, y);
    ctx.lineTo(b.x + b.w, y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Label
    if (showLabel) {
      ctx.fillStyle = color;
      ctx.font = `bold ${Math.max(8, width * 0.035)}px Nunito, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`${label} (${Math.round(T)})`, b.x + 4, y - 3);
      ctx.textBaseline = 'alphabetic';
    }

    ctx.restore();
  }

  // ── Draw Cluster Dots (training labels) ──
  function drawClusterDots(labels) {
    if (!labels || labels.length === 0) return;
    const b = chartBounds();
    const axisY = b.y + b.h + 10; // Below the chart area

    labels.forEach(l => {
      const x = b.x + (l.amplitude / 100) * b.w;
      const color = l.label === 'hazard' ? '#FF6B35' : '#39FF14';
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.arc(x, axisY + 8, 5, 0, Math.PI * 2);
      ctx.fill();
      // Small border
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();
    });
    ctx.globalAlpha = 1;

    // Axis labels
    ctx.fillStyle = 'rgba(136, 136, 170, 0.5)';
    ctx.font = `${Math.max(7, width * 0.028)}px Nunito, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('Safe ■', b.x + 20, axisY + 28);
    ctx.fillStyle = '#FF6B35';
    ctx.globalAlpha = 0.7;
    ctx.fillText('Hazard ■', b.x + b.w - 20, axisY + 28);
    ctx.globalAlpha = 1;
  }

  // ── Draw Sensor Strip ──
  function drawSensorStrip(signals, thresholds, sensorIdx, options = {}) {
    if (!signals) return;
    const { activeSensor = 0, cellLabel = '' } = options;
    const b = chartBounds();
    const stripHeight = b.h / 3;
    const sensorColors = ['#39FF14', '#00FFFF', '#FF6B35'];
    const sensorNames = ['Seismic', 'GPR', 'EM'];
    const sensorIds = ['seismic', 'gpr', 'em'];

    for (let s = 0; s < 3; s++) {
      const yOff = b.y + s * stripHeight;
      const sid = sensorIds[s];
      const amp = signals[sid];
      const thresh = thresholds[sid] || 42;

      if (amp === undefined) continue;

      // Background
      ctx.fillStyle = s === activeSensor ? 'rgba(57, 255, 20, 0.03)' : 'rgba(0,0,0,0.1)';
      ctx.fillRect(b.x, yOff, b.w, stripHeight);

      // Threshold line for this sensor
      const tY = yOff + stripHeight * (1 - thresh / 100);
      ctx.strokeStyle = sensorColors[s];
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.4;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(b.x, tY);
      ctx.lineTo(b.x + b.w, tY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // Signal bar
      const barW = Math.min(b.w * 0.6, 80);
      const barX = b.x + (b.w - barW) / 2;
      const barH = Math.max(4, stripHeight * (amp / 100));
      const barY = yOff + stripHeight - barH;

      // Bar
      const isAboveThreshold = amp >= thresh;
      ctx.fillStyle = sensorColors[s];
      ctx.globalAlpha = isAboveThreshold ? 0.9 : 0.35;
      ctx.fillRect(barX, barY, barW, barH);

      // Bar border
      ctx.strokeStyle = sensorColors[s];
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = isAboveThreshold ? 0.8 : 0.3;
      ctx.strokeRect(barX, barY, barW, barH);

      // Vote indicator (✓ or ✗)
      ctx.globalAlpha = 1;
      ctx.fillStyle = isAboveThreshold ? sensorColors[s] : 'rgba(136,136,170,0.3)';
      ctx.font = `bold ${Math.max(9, width * 0.04)}px Nunito, sans-serif`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(isAboveThreshold ? '✓' : '✗', b.x + b.w - 8, yOff + stripHeight / 2);

      // Sensor name + value
      ctx.fillStyle = sensorColors[s];
      ctx.globalAlpha = s === activeSensor ? 0.9 : 0.4;
      ctx.font = `${Math.max(7, width * 0.03)}px Nunito, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`${sensorNames[s]}: ${amp}`, b.x + 4, yOff + 2);

      ctx.textBaseline = 'alphabetic';
      ctx.globalAlpha = 1;
    }
  }

  // ── Draw Agreement indicator ──
  function drawAgreementIndicator(agreeCount) {
    const b = chartBounds();
    const x = b.x + b.w / 2;
    const y = b.y + b.h + 20;

    ctx.textAlign = 'center';
    ctx.fillStyle = agreeCount >= 2 ? '#39FF14' : '#FF6B35';
    ctx.font = `bold ${Math.max(9, width * 0.04)}px Nunito, sans-serif`;
    ctx.fillText(`Agreement: ${agreeCount}/3 ${agreeCount >= 2 ? '✓ CONFIRMED' : '✗'}`, x, y);
    ctx.textAlign = 'start';
  }

  // ── Draw Confidence Bar ──
  function drawConfidenceBar(confidence, classification, isHazard) {
    const b = chartBounds();
    const barY = b.y + b.h + 35;
    const barW = b.w * 0.7;
    const barX = b.x + (b.w - barW) / 2;
    const barH = 10;

    // Background
    ctx.fillStyle = 'rgba(136, 136, 170, 0.15)';
    ctx.fillRect(barX, barY, barW, barH);

    // Filled portion
    const fillW = barW * (confidence / 100);
    let barColor;
    if (confidence >= 90) barColor = '#FF6B35';
    else if (confidence >= 70) barColor = '#FFD700';
    else if (confidence >= 40) barColor = '#00FFFF';
    else barColor = '#39FF14';

    ctx.fillStyle = barColor;
    ctx.fillRect(barX, barY, fillW, barH);

    // Label
    ctx.fillStyle = '#d0d0e0';
    ctx.font = `bold ${Math.max(8, width * 0.033)}px Nunito, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(`Confidence: ${confidence}%  → ${classification.toUpperCase()}`, b.x + b.w / 2, barY - 4);
    ctx.textAlign = 'start';
  }

  // ── Simple Confidence Display (Level 5) ──
  function drawSimpleConfidence(confidence, classification, autoHandled, customBounds) {
    const b = customBounds || chartBounds();
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;

    // Big confidence number
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.max(24, width * 0.1)}px Fredoka, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(Math.round(confidence) + '%', cx, cy - 12);

    // Classification label
    const classColor = classification === 'hazard' ? '#FF6B35' : '#39FF14';
    ctx.fillStyle = classColor;
    ctx.font = `bold ${Math.max(10, width * 0.04)}px Nunito, sans-serif`;
    ctx.fillText(classification.toUpperCase(), cx, cy + 16);

    // Auto-handled indicator
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = autoHandled ? 'rgba(57,255,20,0.5)' : '#FFD700';
    ctx.font = `${Math.max(8, width * 0.03)}px Nunito, sans-serif`;
    ctx.fillText(autoHandled ? '✅ Nova handled it' : '👆 You decide!', cx, b.y + b.h);
    ctx.textBaseline = 'alphabetic';
  }

  // ── Simple Sensor Display (Level 4) — 3 individual reading bars ──
  function drawSimpleSensors(votes, activeSensor, customBounds) {
    const b = customBounds || chartBounds();
    const sensorIds = ['seismic', 'gpr', 'em'];
    const sensorNames = ['Seismic', 'GPR', 'EM'];
    const sensorColors = ['#FF6B35', '#39FF14', '#00FFFF'];

    // Get per-sensor thresholds from the game state
    const thresholds = (typeof Game !== 'undefined' && Game.getSensorThresholds)
      ? Game.getSensorThresholds() : { seismic: 42, gpr: 40, em: 38 };

    // Signals: raw amplitudes for each sensor at this cell
    const signals = (votes && votes.signals) ? votes.signals : { seismic: 0, gpr: 0, em: 0 };
    const voteFlags = (votes && votes.votes) ? votes.votes : { seismic: false, gpr: false, em: false };

    const stripH = Math.max(18, (b.h - 16) / 3);

    for (let i = 0; i < 3; i++) {
      const sid = sensorIds[i];
      const yOff = b.y + i * stripH;
      const isActive = i === activeSensor;
      const amp = signals[sid] || 0;
      const thresh = thresholds[sid] || 42;
      const isAbove = amp >= thresh;

      // Strip background
      ctx.fillStyle = isActive ? 'rgba(57,255,20,0.05)' : 'rgba(0,0,0,0.15)';
      ctx.fillRect(b.x, yOff, b.w, stripH);

      // Bar width proportional to signal amplitude (0–100 scale)
      const maxBarW = Math.min(b.w * 0.35, 70);
      const barW = Math.max(3, maxBarW * Math.min(1, amp / 100));
      const barX = b.x + 56;
      const barY = yOff + 4;
      const barH = Math.max(6, stripH - 8);

      ctx.fillStyle = sensorColors[i];
      ctx.globalAlpha = isAbove ? 0.85 : 0.25;
      ctx.fillRect(barX, barY, barW, barH);

      // Threshold line
      const threshX = barX + maxBarW * Math.min(1, thresh / 100);
      ctx.strokeStyle = sensorColors[i];
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.35;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(threshX, yOff);
      ctx.lineTo(threshX, yOff + stripH);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // Sensor name
      ctx.fillStyle = sensorColors[i];
      ctx.globalAlpha = isActive ? 0.9 : 0.4;
      ctx.font = `bold ${Math.max(7, width * 0.028)}px Nunito, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(sensorNames[i], b.x + 2, yOff + stripH / 2);

      // Vote icon at right edge (before bar so bar draws on top)
      ctx.fillStyle = isAbove ? sensorColors[i] : 'rgba(136,136,170,0.25)';
      ctx.font = `bold ${Math.max(10, width * 0.04)}px Nunito, sans-serif`;
      ctx.textAlign = 'right';
      ctx.fillText(isAbove ? '✓' : '✗', b.x + b.w - 4, yOff + stripH / 2);
      ctx.textBaseline = 'alphabetic';

      // Amplitude value label (after vote icon, cleared by bar background)
      ctx.fillStyle = '#fff';
      ctx.globalAlpha = 0.75;
      ctx.font = `bold ${Math.max(8, width * 0.028)}px Nunito, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${Math.round(amp)}`, barX + 4, yOff + stripH / 2);
      ctx.globalAlpha = 1;
      ctx.textBaseline = 'alphabetic';
    }

    // Agreement banner at bottom — counts only, no verdict (kid decides)
    if (votes) {
      const agreeY = b.y + b.h - 2;
      ctx.fillStyle = 'rgba(57,255,20,0.08)';
      ctx.fillRect(b.x, agreeY - 14, b.w, 16);
      ctx.fillStyle = '#94a3b8';
      ctx.font = `bold ${Math.max(9, width * 0.035)}px Nunito, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        `${votes.agreeCount}/3 sensors above danger line`,
        b.x + b.w / 2, agreeY - 6
      );
      ctx.textBaseline = 'alphabetic';
    }
  }

  // ── Draw Training Sample Highlight ──
  function drawTrainingMarker(row, col, label) {
    const b = chartBounds();
    const x = b.x + b.w / 2;
    const y = b.y + 4;
    ctx.fillStyle = label === 'hazard' ? '#FF6B35' : '#39FF14';
    ctx.font = `bold ${Math.max(9, width * 0.04)}px Nunito, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(`Training: ${label.toUpperCase()}`, x, y);
    ctx.textAlign = 'start';
  }

  // ── Empty states ──
  function drawEmptyState(msg) {
    ctx.fillStyle = 'rgba(136, 136, 170, 0.4)';
    ctx.font = `${Math.max(11, width * 0.055)}px Nunito, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(msg || 'Select a cell', width / 2, height / 2 - 8);
    ctx.textBaseline = 'alphabetic';
  }

  // ── Collapse animation ──
  function triggerCollapseAnimation(cellKey) {
    _collapseAnim = 0;
    _collapseCell = cellKey;
    if (_collapseTimeout) clearTimeout(_collapseTimeout);
    _collapseTimeout = setTimeout(() => {
      _collapseAnim = 1;
    }, 800);
  }

  function drawCollapseOverlay() {
    if (_collapseAnim <= 0 && !_collapseCell) return;

    const t = Math.min(1, _collapseAnim);
    ctx.fillStyle = `rgba(255, 51, 85, ${0.3 * t})`;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#FF3355';
    ctx.font = `bold ${Math.max(14, width * 0.06)}px Fredoka, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const shake = Math.sin(animationTime * 30) * 4 * t;
    ctx.fillText('⚠ BUILDING COLLAPSED! ⚠', width / 2 + shake, height / 2);

    ctx.font = `${Math.max(10, width * 0.04)}px Nunito, sans-serif`;
    ctx.fillStyle = '#FF6B35';
    ctx.fillText('A hazard was missed — the site is unsafe.', width / 2, height / 2 + 28);

    ctx.textBaseline = 'alphabetic';
  }

  // ── Scan Animation ──
  function triggerScanAnimation() {
    _isScanning = true;
    if (_scanTimeout) clearTimeout(_scanTimeout);
    _scanTimeout = setTimeout(() => { _isScanning = false; }, 600);
  }

  function drawScanAnimation() {
    const t = (Date.now() / 1000) * 2;
    const x = width * 0.1 + (Math.sin(t) * 0.5 + 0.5) * width * 0.8;
    ctx.strokeStyle = 'rgba(57, 255, 20, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, height * 0.1);
    ctx.lineTo(x, height * 0.9);
    ctx.stroke();
    ctx.fillStyle = 'rgba(57, 255, 20, 0.5)';
    ctx.font = `${Math.max(9, width * 0.045)}px Nunito, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const dots = '.'.repeat(Math.floor(Date.now() / 400) % 4);
    ctx.fillText(`Scanning${dots}`, width / 2, height / 2);
    ctx.textBaseline = 'alphabetic';
  }

  // ── Draw Danger Meter (compact, no overflow) ──
  function drawDangerMeter(value, dangerLine, options = {}) {
    const b = chartBounds();
    const meterW = Math.max(20, b.w * 0.22);
    const meterH = Math.max(40, b.h - 20);
    const meterX = b.x + (b.w - meterW) / 2;
    const meterY = b.y + 6; // leave room for verdict text above

    // Meter track
    ctx.fillStyle = '#1a1a2e';
    ctx.beginPath();
    ctx.roundRect(meterX, meterY, meterW, meterH, 6);
    ctx.fill();

    const dangerY = meterY + meterH * (1 - dangerLine / 100);
    // Danger zone
    ctx.fillStyle = 'rgba(255, 80, 40, 0.08)';
    ctx.fillRect(meterX + 2, meterY + 2, meterW - 4, dangerY - meterY - 2);
    // Safe zone
    ctx.fillStyle = 'rgba(57, 255, 20, 0.06)';
    ctx.fillRect(meterX + 2, dangerY, meterW - 4, meterY + meterH - dangerY - 2);

    // Danger Line (dashed for normal, solid+glow for noisy)
    ctx.strokeStyle = options.isNoisy ? 'rgba(255, 80, 40, 0.85)' : 'rgba(255, 80, 40, 0.4)';
    ctx.lineWidth = options.isNoisy ? 2.5 : 1.5;
    ctx.setLineDash(options.isNoisy ? [] : [3, 2]);

    // Danger line glow (noisy mode only)
    if (options.isNoisy) {
      ctx.shadowColor = 'rgba(255, 80, 40, 0.5)';
      ctx.shadowBlur = 8;
    }

    ctx.beginPath();
    ctx.moveTo(meterX - 2, dangerY);
    ctx.lineTo(meterX + meterW + 2, dangerY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;

    // Danger Line label (noisy mode only) — drawn ABOVE the line
    if (options.isNoisy) {
      ctx.fillStyle = 'rgba(255, 80, 40, 0.8)';
      ctx.font = `bold ${Math.max(7, width * 0.025)}px Nunito, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('Danger Line', b.x + 4, dangerY - 2);
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'center';
    }

    // Small inline labels (left side of meter)
    ctx.font = `${Math.max(6, width * 0.02)}px Nunito, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255, 80, 40, 0.35)';
    ctx.fillText('⬆DANGER', Math.max(4, b.x), dangerY - 6);
    ctx.fillStyle = 'rgba(57, 255, 20, 0.35)';
    ctx.fillText('⬇SAFE', Math.max(4, b.x), dangerY + 6);

    // Signal bar
    const barH = Math.max(2, meterH * (value / 100));
    const barY = meterY + meterH - barH;
    const barColor = value >= dangerLine ? '#FF6B35' : '#39FF14';
    ctx.shadowColor = barColor;
    ctx.shadowBlur = 6;
    ctx.fillStyle = barColor;
    ctx.beginPath();
    ctx.roundRect(meterX + 3, barY, meterW - 6, barH, 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Noise band: translucent range showing uncertainty (noisy mode only)
    if (options.isNoisy) {
      const noiseRange = meterH * 0.05;
      ctx.fillStyle = barColor;
      ctx.globalAlpha = 0.18;
      ctx.fillRect(meterX + 3, barY - noiseRange, meterW - 6, noiseRange);
      ctx.globalAlpha = 1;
      // Noise band label
      ctx.fillStyle = 'rgba(148, 163, 184, 0.4)';
      ctx.font = `${Math.max(6, width * 0.02)}px Nunito, sans-serif`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText('±noise', meterX + meterW - 3, barY - noiseRange - 1);
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'center';
    }

    // Value number (above signal bar)
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.max(12, width * 0.045)}px Fredoka, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(Math.round(value), meterX + meterW / 2, barY - 2);

    // Verdict (above meter, compact)
    ctx.font = `bold ${Math.max(9, width * 0.032)}px Nunito, sans-serif`;
    ctx.textBaseline = 'bottom';
    const verdict = value >= dangerLine ? '⚠️ HAZARD!' : '✅ Safe';
    ctx.fillStyle = value >= dangerLine ? '#FF6B35' : '#39FF14';
    ctx.fillText(verdict, meterX + meterW / 2, meterY - 2);

    // Bottom label
    if (options.label) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = `${Math.max(7, width * 0.024)}px Nunito, sans-serif`;
      ctx.textBaseline = 'top';
      ctx.fillText(options.label, meterX + meterW / 2, meterY + meterH + 4);
    }
    ctx.textBaseline = 'alphabetic';
  }

  // ── Main Render ──
  function renderFrame() {
    if (!canvas || !ctx) return;
    resize();
    if (width <= 0 || height <= 0) return;

    // Simple dark background (no oscilloscope grid)
    ctx.fillStyle = '#080814';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(57, 255, 20, 0.08)';
    ctx.lineWidth = 1;
    ctx.strokeRect(2, 2, width - 4, height - 4);

    if (typeof Game === 'undefined') return;
    if (_collapseAnim > 0.01) { _collapseAnim += 0.003; }

    if (_isScanning) {
      drawScanAnimation();
      if (_collapseCell) drawCollapseOverlay();
      return;
    }

    const level = Game.getCurrentLevel();
    if (!level) return;
    const selectedCell = Game.getSelectedCell();
    const REF_DANGER = 42;

    // ── Level 1: Danger Meter ──
    if (level.id === 1) {
      const T = Game.getLearnedThreshold ? Game.getLearnedThreshold() : null;
      const phase = Game.getTrainingPhase ? Game.getTrainingPhase() : 'collecting';
      const labels = Game.getTrainingLabels ? Game.getTrainingLabels() : [];

      if (selectedCell) {
        const amp = Game.getCellAmplitude(selectedCell.row, selectedCell.col);
        if (amp !== null) {
          drawDangerMeter(amp, REF_DANGER, { label: '🔥 Danger Meter — tap a glowing ? cell to check it' });
          return;
        }
      }
      drawEmptyState(labels.length > 0
        ? `📊 ${labels.length}/4 labeled! Keep going!`
        : '👆 Tap a glowing ? cell to check its danger level!');
    }

    // ── Level 2: Sensitivity ──
    else if (level.id === 2) {
      const T = Game.getEffectiveThreshold();
      const sens = Game.getSensitivity();
      const metrics = Game.getLv2Metrics ? Game.getLv2Metrics() : null;
      const caught = metrics ? metrics.hazardsCaught : 0;
      const total = metrics ? metrics.totalHazards : 6;
      const alarms = metrics ? metrics.falseAlarms : 0;
      if (T !== null) {
        const b = chartBounds();
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h / 2;
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.max(14, width * 0.055)}px Fredoka, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🎯 Sensitivity: ' + sens, cx, cy - 18);
        ctx.font = `${Math.max(10, width * 0.035)}px Nunito, sans-serif`;
        ctx.fillStyle = '#b0d8e0';
        ctx.fillText('Hazards: ' + caught + '/' + total + '  |  False alarms: ' + alarms, cx, cy + 8);
        ctx.font = `${Math.max(8, width * 0.025)}px Nunito, sans-serif`;
        ctx.fillStyle = 'rgba(148,163,184,0.6)';
        ctx.fillText('▲ = hazard  · = safe  |  threshold: ' + Math.round(T), cx, cy + 28);
        ctx.textBaseline = 'alphabetic';
      }
    }

    // ── Level 3: Sensor Fusion ──
    else if (level.id === 3) {
      if (selectedCell) {
        const activeSensor = Game.getActiveSensor ? Game.getActiveSensor() : 0;
        const votes = Game.getCellSensorVotes(selectedCell.row, selectedCell.col);
        drawSimpleSensors(votes || { agreeCount: 0, sensorVotes: [false, false, false] }, activeSensor);
      } else {
        drawEmptyState('👆 Tap a cell to see its 3 sensors');
      }
    }

    // ── Level 4 (HITL): Show instruction — vote table is below ──
    else if (level.id === 4) {
      if (selectedCell) {
        const key = `${selectedCell.row},${selectedCell.col}`;
        const survey = Game.getNovaSurvey ? Game.getNovaSurvey() : {};
        const cellSurvey = survey ? survey[key] : null;
        const uncertain = Game.getUncertainCells ? Game.getUncertainCells().includes(key) : false;
        if (uncertain && cellSurvey) {
          drawEmptyState('🔍 Read the Sensor Vote table below →');
        } else if (cellSurvey) {
          drawEmptyState('✅ Auto-classified by Nova');
        } else {
          drawEmptyState('👆 Tap a yellow ? cell');
        }
      } else {
        drawEmptyState('👆 Tap a yellow ? cell to review');
      }
    }

    // ── Level 6: Autonomous Demo ──
    else if (level.id === 5) {
      if (selectedCell) {
        const amp = Game.getCellAmplitude(selectedCell.row, selectedCell.col);
        const T = level.demoThreshold || 46;
        if (amp !== null) {
          drawDangerMeter(amp, T, { label: '🤖 Nova is surveying... Watch each step!' });
          return;
        }
      }
      drawEmptyState('🔍 Starting survey...');
    }

    else {
      drawEmptyState('Ready');
    }
  }
  return {
    init,
    resize,
    startAnimation,
    stopAnimation,
    renderFrame,
    triggerScanAnimation,
    triggerCollapseAnimation,
    getWidth,
    getHeight,
  };
})();
