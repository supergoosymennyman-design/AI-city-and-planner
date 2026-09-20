/* renderer.js — 4-way intersection with animated forecast bands */
const SceneRenderer = (() => {
  const COL = { road: '#1A294A', roadLine: '#3498DB', grass: '#0D1B0D', band: 'rgba(52,152,219,0.35)', bandRed: 'rgba(231,76,60,0.35)', text: '#C9D1D9', muted: '#8B949E' };

  function draw(ctx, W, H, state, opts = {}) {
    const t = opts.time || 0, rm = !!opts.reducedMotion;
    ctx.clearRect(0, 0, W, H);
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0B132B'); bg.addColorStop(1, '#0A1525');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    const cx = W/2, cy = H/2;
    const roadW = W*0.45, roadH = H*0.45;
    const laneW = roadW * 0.08;
    const isNS = state?.direction === 'NS';
    const isEW = state?.direction === 'EW';

    // Road surface
    ctx.fillStyle = '#1A2A4A';
    ctx.fillRect(cx - roadW/2, cy - roadH/2, roadW, roadH);

    // Highlight active direction with glow
    if (isNS) {
      ctx.shadowColor = '#2ECC71'; ctx.shadowBlur = 20;
      ctx.strokeStyle = 'rgba(46,204,113,0.15)'; ctx.lineWidth = 4;
      ctx.strokeRect(cx - laneW, cy - roadH/2, laneW*2, roadH);
      ctx.shadowBlur = 0;
    } else if (isEW) {
      ctx.shadowColor = '#2ECC71'; ctx.shadowBlur = 20;
      ctx.strokeStyle = 'rgba(46,204,113,0.15)'; ctx.lineWidth = 4;
      ctx.strokeRect(cx - roadW/2, cy - laneW, roadW, laneW*2);
      ctx.shadowBlur = 0;
    }

    // Active direction label
    ctx.fillStyle = '#2ECC71';
    ctx.font = 'bold 14px Nunito,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(isNS ? '◄ N-S GREEN ►' : '◄ E-W GREEN ►', cx, cy - roadH/2 - 24);

    // Road markings
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1; ctx.setLineDash([8, 12]);
    ctx.beginPath(); ctx.moveTo(cx, cy - roadH/2); ctx.lineTo(cx, cy + roadH/2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - roadW/2, cy); ctx.lineTo(cx + roadW/2, cy); ctx.stroke();
    ctx.setLineDash([]);

    // Cars (only queued for red-light directions)
    if (state?.cars) {
      ['N','S','E','W'].forEach(dir => {
        const cars = state.cars[dir] || 0;
        const isActive = (isNS && (dir === 'N' || dir === 'S')) || (isEW && (dir === 'E' || dir === 'W'));
        const displayCars = Math.min(Math.ceil(cars), 8);
        ctx.fillStyle = isActive ? 'rgba(46,204,113,0.3)' : '#F39C12';
        ctx.globalAlpha = isActive ? 0.3 : 1;
        for (let i = 0; i < displayCars; i++) {
          const off = 15 + i * 14;
          let x = cx, y = cy;
          // Lead car in active direction drives toward intersection
          if (isActive && i === 0) {
            const driveProgress = (cars - Math.floor(cars)); // 0-1 fractional, drives through
            if (dir === 'N') { x = cx - laneW/2; y = cy - roadH/2 + off - driveProgress * 20; }
            else if (dir === 'S') { x = cx + laneW/2; y = cy + roadH/2 - off + driveProgress * 20; }
            else if (dir === 'E') { x = cx + roadW/2 - off + driveProgress * 20; y = cy - laneW/2; }
            else { x = cx - roadW/2 + off - driveProgress * 20; y = cy + laneW/2; }
            ctx.fillStyle = '#2ECC71';
            ctx.globalAlpha = 0.8;
          } else {
            if (dir === 'N') { x = cx - laneW/2; y = cy - roadH/2 + off; }
            else if (dir === 'S') { x = cx + laneW/2; y = cy + roadH/2 - off; }
            else if (dir === 'E') { x = cx + roadW/2 - off; y = cy - laneW/2; }
            else { x = cx - roadW/2 + off; y = cy + laneW/2; }
          }
          ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI*2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      });
    }

    // Traffic light (large indicator at center)
    const lightSize = 20;
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(cx - lightSize, cy - lightSize, lightSize*2, lightSize*2);
    // Green arrow for active direction
    ctx.fillStyle = '#2ECC71';
    ctx.font = 'bold 16px Nunito,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(isNS ? '⬍' : '⬌', cx, cy + 5);

    // Direction labels with arrows
    ctx.fillStyle = COL.muted; ctx.font = '12px Nunito,sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(isNS ? '🟢' : '🔴', cx, cy - roadH/2 - 10);
    ctx.fillText(isNS ? '🟢' : '🔴', cx, cy + roadH/2 + 16);
    ctx.fillText(isEW ? '🟢' : '🔴', cx + roadW/2 + 16, cy + 4);
    ctx.fillText(isEW ? '🟢' : '🔴', cx - roadW/2 - 16, cy + 4);
    ctx.fillStyle = COL.muted; ctx.font = '10px Nunito,sans-serif';
    ctx.fillText('N', cx, cy - roadH/2 + 14);
    ctx.fillText('S', cx, cy + roadH/2 + 4);
    ctx.fillText('E', cx + roadW/2 + 10, cy + 4);
    ctx.fillText('W', cx - roadW/2 - 10, cy + 4);

    // Forecast bands
    if (state?.forecasts) {
      Object.entries(state.forecasts).forEach(([dir, band]) => {
        if (!band || band.width <= 0) return;
        const maxWidth = roadW * 0.35;
        const bandW = Math.max(4, band.width * maxWidth);
        const isRed = band.isSurge;
        const color = isRed ? COL.bandRed : COL.band;
        const pulse = rm ? 0 : Math.sin(t * 0.002 + (dir.charCodeAt(0) || 0)) * 0.03;
        let x1, y1, x2, y2;
        const len = roadH * 0.35 + Math.min(band.arrival || 5, 5) * 15;
        if (dir === 'N') { x1 = cx - bandW/2; y1 = cy - roadH/2; x2 = cx + bandW/2; y2 = cy - roadH/2 - len; }
        else if (dir === 'S') { x1 = cx - bandW/2; y1 = cy + roadH/2; x2 = cx + bandW/2; y2 = cy + roadH/2 + len; }
        else if (dir === 'E') { x1 = cx + roadW/2; y1 = cy - bandW/2; x2 = cx + roadW/2 + len; y2 = cy + bandW/2; }
        else { x1 = cx - roadW/2; y1 = cy - bandW/2; x2 = cx - roadW/2 - len; y2 = cy + bandW/2; }
        ctx.fillStyle = color; ctx.shadowColor = isRed ? '#E74C3C' : '#3498DB';
        ctx.shadowBlur = 12 + pulse * 50;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x2 + (dir === 'N'||dir==='S' ? 0 : 0), (dir === 'N'||dir==='S') ? y2+(dir==='N'?-1:1)*bandW : y2+bandW);
        ctx.lineTo(x1 + (dir==='N'||dir==='S' ? bandW : 0), y1 + (dir==='N'||dir==='S' ? (dir==='N'?-1:1)*bandW : 0)); ctx.closePath(); ctx.fill();
        ctx.shadowBlur = 0;

        // Band width label
        ctx.fillStyle = isRed ? '#E74C3C' : '#3498DB'; ctx.font = 'bold 11px Nunito,sans-serif';
        ctx.textAlign = 'center';
        if (dir === 'N' || dir === 'S') ctx.fillText(Math.round(band.width*100)+' cars', cx, y1 + (dir==='N'?1:-1)*bandW/2);
        else ctx.fillText(Math.round(band.width*100)+' cars', x1 + (dir==='E'?1:-1)*bandW/2, y2 - 4);

        // Arrival countdown
        if (band.arrival !== undefined) {
          ctx.fillStyle = '#8B949E'; ctx.font = '10px Nunito,sans-serif';
          const arrText = `arrives in ${Math.max(0, Math.round(band.arrival))}s`;
          if (dir === 'N' || dir === 'S') ctx.fillText(arrText, cx, y1 + (dir==='N'?1:-1)*(bandW/2 + 14));
          else ctx.fillText(arrText, x1 + (dir==='E'?1:-1)*(bandW/2 + 14), y2 - 4);
        }
      });
    }

    // Flow score text
    if (state?.flowScore !== undefined) {
      ctx.fillStyle = state.flowScore >= 80 ? '#2ECC71' : state.flowScore >= 60 ? '#F39C12' : '#E74C3C';
      ctx.font = 'bold 14px Nunito,sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`Flow: ${Math.round(state.flowScore)}%`, W - 10, 22);
    }

    // Remaining cars counter
    if (state?.cars) {
      const total = Object.values(state.cars).reduce((a,b) => a+b, 0);
      ctx.fillStyle = '#8B949E';
      ctx.font = '11px Nunito,sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`🅿 ${Math.round(total)} cars waiting`, 10, 22);
    }
  }

  return { draw };
})();
