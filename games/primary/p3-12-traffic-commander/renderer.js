/* =========================================================================
   renderer.js — Canvas drawing for Traffic Commander.
   Draws three stacked zones for N lanes:
     1) ROAD SURFACE (birds-eye) with animated vehicles, stop line, signal.
     2) UNDERGROUND CUTAWAY with glowing inductive-loop sensors + wires.
     3) QUEUE BAR GRAPHS with colour zones, prediction line, overflow pulse.
   Pure function of (sim, opts): game.js owns state, renderer only paints.
   ========================================================================= */
const Renderer = (() => {
  'use strict';

  const PAD = 14;
  const COL = {
    soil: '#2a2118',
    soilDark: '#1d1710',
    asphalt: '#2b3444',
    asphaltEdge: '#141a24',
    line: '#F4D03F',
    stop: '#ECF0F1',
    text: '#ECF0F1',
    muted: '#9FB0C0',
    barTrack: '#141a24'
  };

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function draw(ctx, W, H, sim, opts = {}) {
    const t = opts.time || 0;
    const rm = !!opts.reducedMotion;
    ctx.clearRect(0, 0, W, H);

    // Background gradient (urban dusk)
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#141b27');
    bg.addColorStop(1, '#0d121b');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const n = sim.laneCount;
    const areaW = W - PAD * 2;
    const laneGap = n > 1 ? 12 : 0;
    const laneW = (areaW - laneGap * (n - 1)) / n;

    // Vertical zone bounds
    const roadTop = 34;
    const roadBottom = H * 0.44;
    const ugTop = H * 0.47;
    const ugBottom = H * 0.635;
    const barTop = H * 0.665;
    const barBottom = H - 26;

    // Zone labels
    ctx.fillStyle = COL.muted;
    ctx.font = '700 11px ' + fontMono();
    ctx.textAlign = 'left';
    ctx.fillText('▲ ROAD SURFACE', PAD, 20);
    ctx.fillText('▲ UNDERGROUND — INDUCTIVE LOOP SENSORS', PAD, ugTop - 6);
    ctx.fillText('▲ QUEUE BAR GRAPHS', PAD, barTop - 6);

    const laneX = (i) => PAD + i * (laneW + laneGap);

    // Which lane currently holds the longest queue (for the priority crown)?
    let hi = -1;
    if (opts.markHighest) {
      let bv = -1;
      sim.lanes.forEach((l, i) => { if (l.fill > bv) { bv = l.fill; hi = i; } });
    }

    for (let i = 0; i < n; i++) {
      const lane = sim.lanes[i];
      const x = laneX(i);
      drawRoad(ctx, x, roadTop, laneW, roadBottom - roadTop, lane, t, rm);
      drawUnderground(ctx, x, ugTop, laneW, ugBottom - ugTop, lane, roadBottom, t, rm);
      drawBar(ctx, x, barTop, laneW, barBottom - barTop, lane, opts, t, rm, i === hi);
    }
  }

  function fontBody() { return "'Nunito','Segoe UI',system-ui,sans-serif"; }
  function fontMono() { return "'SF Mono','Consolas',ui-monospace,monospace"; }
  function fontDisplay() { return "'Fredoka One','Comic Sans MS','Trebuchet MS',sans-serif"; }

  /* ---------- ROAD SURFACE ---------- */
  function drawRoad(ctx, x, y, w, h, lane, t, rm) {
    const roadPad = Math.min(10, w * 0.06);
    const rx = x + roadPad, rw = w - roadPad * 2;

    // asphalt
    ctx.fillStyle = COL.asphalt;
    roundRect(ctx, rx, y, rw, h, 8); ctx.fill();
    ctx.strokeStyle = COL.asphaltEdge; ctx.lineWidth = 2; ctx.stroke();

    // dashed centre line
    ctx.strokeStyle = COL.line; ctx.lineWidth = Math.max(2, rw * 0.03);
    ctx.setLineDash([10, 12]);
    ctx.beginPath(); ctx.moveTo(rx + rw / 2, y + 40); ctx.lineTo(rx + rw / 2, y + h); ctx.stroke();
    ctx.setLineDash([]);

    const stopY = y + 34;
    // stop line
    ctx.fillStyle = COL.stop; ctx.fillRect(rx + 3, stopY, rw - 6, 4);

    // inductive loop marking on the road (rectangle over the sensor)
    const loopW = rw * 0.7, loopH = 26;
    const loopX = rx + (rw - loopW) / 2, loopY = stopY + 8;
    ctx.save();
    const litUp = lane.glow;
    ctx.strokeStyle = litUp > 0.05 ? Sensors.glowColor(litUp) : 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 2.5;
    roundRect(ctx, loopX, loopY, loopW, loopH, 6); ctx.stroke();
    if (litUp > 0.05 && !rm) {
      ctx.shadowColor = Sensors.glowColor(litUp); ctx.shadowBlur = 16 * litUp;
      ctx.stroke(); ctx.shadowBlur = 0;
    }
    ctx.restore();

    // traffic light (compact 3-dot signal, top-left of lane)
    drawSignal(ctx, rx + 6, y + 2, lane.light);

    // vehicles
    const carAreaTop = stopY + 6;
    const carAreaBottom = y + h - 6;
    lane.vehicles.forEach((v) => {
      const cy = carAreaTop + v.y * (carAreaBottom - carAreaTop);
      drawVehicle(ctx, rx + rw / 2, cy, rw, v);
    });
  }

  function drawSignal(ctx, x, y, light) {
    const r = 4.5, gap = 12, boxW = 15, boxH = 40;
    ctx.fillStyle = '#0c1017';
    roundRect(ctx, x, y, boxW, boxH, 4); ctx.fill();
    const cx = x + boxW / 2;
    const dim = 0.22;
    // red, amber, green
    ctx.fillStyle = light === 'red' ? '#E74C3C' : `rgba(231,76,60,${dim})`;
    circle(ctx, cx, y + 8, r);
    ctx.fillStyle = `rgba(243,156,18,${dim})`;
    circle(ctx, cx, y + 8 + gap, r);
    ctx.fillStyle = light === 'green' ? '#2ECC71' : `rgba(46,204,113,${dim})`;
    circle(ctx, cx, y + 8 + gap * 2, r);
  }

  function drawVehicle(ctx, cx, cy, laneW, v) {
    const w = v.w * laneW * 0.82;
    const h = w * (v.type === 'truck' ? 1.5 : v.type === 'van' ? 1.35 : v.type === 'motorcycle' || v.type === 'bike' ? 1.1 : 1.25);
    const x = cx - w / 2, y = cy - h / 2;

    if (v.type === 'pedestrian') {
      // simple person: head + body dot
      ctx.fillStyle = v.color;
      circle(ctx, cx, cy - 4, w * 0.28);
      roundRect(ctx, cx - w * 0.18, cy, w * 0.36, h * 0.5, 3); ctx.fill();
      return;
    }
    if (v.type === 'bike' || v.type === 'motorcycle') {
      ctx.fillStyle = '#20262f';
      circle(ctx, cx, y + h * 0.25, w * 0.18);
      circle(ctx, cx, y + h * 0.8, w * 0.18);
      ctx.fillStyle = v.color;
      roundRect(ctx, cx - w * 0.14, y + h * 0.2, w * 0.28, h * 0.62, 3); ctx.fill();
      return;
    }
    // car / van / truck body
    ctx.fillStyle = v.color;
    roundRect(ctx, x, y, w, h, Math.min(8, w * 0.22)); ctx.fill();
    // windshield
    ctx.fillStyle = 'rgba(20,26,36,0.65)';
    roundRect(ctx, x + w * 0.16, y + h * 0.14, w * 0.68, h * 0.22, 3); ctx.fill();
    roundRect(ctx, x + w * 0.16, y + h * 0.5, w * 0.68, h * 0.22, 3); ctx.fill();
    // headlights hint
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    circle(ctx, x + w * 0.22, y + 3, 1.8);
    circle(ctx, x + w * 0.78, y + 3, 1.8);
  }

  function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }

  /* ---------- UNDERGROUND CUTAWAY ---------- */
  function drawUnderground(ctx, x, y, w, h, lane, roadBottom, t, rm) {
    const roadPad = Math.min(10, w * 0.06);
    const rx = x + roadPad, rw = w - roadPad * 2;

    // soil layers
    const grad = ctx.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, COL.soil); grad.addColorStop(1, COL.soilDark);
    ctx.fillStyle = grad;
    roundRect(ctx, rx, y, rw, h, 6); ctx.fill();
    // speckle texture
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    for (let s = 0; s < 6; s++) {
      const sx = rx + ((s * 53 + lane.id.charCodeAt(0) * 7) % rw);
      const sy = y + ((s * 37) % (h - 6)) + 3;
      circle(ctx, sx, sy, 1.4);
    }

    // wire from road sensor down into the soil
    ctx.strokeStyle = 'rgba(155,175,195,0.5)'; ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(rx + rw / 2, y); ctx.lineTo(rx + rw / 2, y + h * 0.32); ctx.stroke();
    ctx.setLineDash([]);

    // buried loop coil (concentric rounded rects), glowing with lane.glow
    const cx = rx + rw / 2, cy = y + h * 0.55;
    const glow = lane.glow;
    ctx.save();
    if (glow > 0.05 && !rm) { ctx.shadowColor = Sensors.glowColor(glow); ctx.shadowBlur = 22 * glow; }
    for (let k = 0; k < 3; k++) {
      const cw = rw * (0.66 - k * 0.14), ch = h * (0.5 - k * 0.1);
      ctx.strokeStyle = glow > 0.05
        ? Sensors.glowColor(glow * (1 - k * 0.15))
        : 'rgba(120,140,160,0.35)';
      ctx.lineWidth = 2.4;
      roundRect(ctx, cx - cw / 2, cy - ch / 2, cw, ch, 5); ctx.stroke();
    }
    ctx.restore();

    // label
    ctx.fillStyle = glow > 0.3 ? '#F5D76E' : COL.muted;
    ctx.font = '700 10px ' + fontMono();
    ctx.textAlign = 'center';
    ctx.fillText('LOOP ' + lane.id, cx, y + h - 5);
  }

  /* ---------- QUEUE BAR GRAPH ---------- */
  function drawBar(ctx, x, y, w, h, lane, opts, t, rm, isHighest) {
    const barPad = Math.min(14, w * 0.14);
    const bx = x + barPad, bw = w - barPad * 2;

    // track
    ctx.fillStyle = COL.barTrack;
    roundRect(ctx, bx, y, bw, h, 8); ctx.fill();
    ctx.strokeStyle = '#0a0e15'; ctx.lineWidth = 2; ctx.stroke();

    // zone threshold ticks (40/70/85)
    ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 1;
    [40, 70, 85].forEach((p) => {
      const ty = y + h * (1 - p / 100);
      ctx.beginPath(); ctx.moveTo(bx, ty); ctx.lineTo(bx + bw, ty); ctx.stroke();
    });

    // fill
    const fillPct = Math.min(100, lane.fill);
    const fillH = h * (fillPct / 100);
    const fy = y + h - fillH;
    const overflowing = lane.fill >= 100 && lane.cap == null;
    let color = Sensors.zoneColor(lane.fill);
    if (overflowing && !rm) {
      const pulse = 0.5 + 0.5 * Math.sin(t / 120);
      color = `rgba(${Math.round(192 + 40 * pulse)},57,43,1)`;
    }
    if (fillH > 1) {
      ctx.fillStyle = color;
      roundRect(ctx, bx + 2, fy, bw - 4, fillH, 6); ctx.fill();
      // subtle top gloss
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      roundRect(ctx, bx + 2, fy, bw - 4, Math.min(8, fillH), 6); ctx.fill();
    }

    // weak-signal cap label
    if (lane.cap != null && lane.vehicles.length > 0) {
      ctx.fillStyle = '#F5D76E';
      ctx.font = '700 10px ' + fontMono();
      ctx.textAlign = 'center';
      ctx.fillText('WEAK SIGNAL', bx + bw / 2, fy - 6);
    }

    // Level-2 prediction line (dotted) + arrow
    if (opts.showPrediction && lane.cap == null && lane.vehicles.length > 0) {
      const pred = Sensors.predict(lane, opts.predictSeconds || 3);
      const py = y + h * (1 - Math.min(100, pred) / 100);
      ctx.strokeStyle = '#E74C3C'; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.moveTo(bx - 4, py); ctx.lineTo(bx + bw + 4, py); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#E74C3C';
      ctx.font = '700 9px ' + fontMono(); ctx.textAlign = 'left';
      ctx.fillText('PREDICTED', bx + bw + 6 > x + w ? bx : bx, py - 4);
    }

    // Level-5 trigger threshold line
    if (opts.triggerLevel != null) {
      const ttY = y + h * (1 - opts.triggerLevel / 100);
      ctx.strokeStyle = '#3498DB'; ctx.lineWidth = 2.5; ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.moveTo(bx - 3, ttY); ctx.lineTo(bx + bw + 3, ttY); ctx.stroke();
      ctx.setLineDash([]);
    }

    // percentage + lane label
    ctx.fillStyle = COL.text;
    ctx.font = '800 15px ' + fontMono(); ctx.textAlign = 'center';
    ctx.fillText(Math.round(lane.fill) + '%', bx + bw / 2, y + h - 8);

    ctx.font = '700 13px ' + fontDisplay();
    ctx.fillStyle = isHighest ? '#F1C40F' : COL.text;
    if (lane.id !== '·') ctx.fillText('Lane ' + lane.id, bx + bw / 2, y - 8);

    // overflow warning marker
    if (overflowing || lane.overflowed) {
      ctx.font = '16px ' + fontBody();
      ctx.fillText('⚠️', bx + bw / 2, y + 14);
    }

    // "highest queue" crown marker (Level 4/5 teaching aid)
    if (isHighest) {
      ctx.font = '16px ' + fontBody();
      ctx.fillText('👑', bx + bw / 2, y - 24);
    }
  }

  return { draw };
})();
