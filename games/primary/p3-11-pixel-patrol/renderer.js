/* renderer.js — Canvas scene drawing for Pixel Patrol.
   Draws "street scenes" in two modes:
     RGB: coloured scene with noise — objects are semi-transparent, hard to see
     Edge: bright green wireframe outlines — objects pop out clearly */

const SceneRenderer = (() => {
  const PAD = 10;
  const COL = { edge: '#00FF41', text: '#C9D1D9', muted: '#8B949E', bg: '#0D1117' };

  function draw(ctx, W, H, scene, mode, opts = {}) {
    const rm = !!opts.reducedMotion;
    const highlighted = opts.highlighted;
    ctx.clearRect(0, 0, W, H);

    if (mode === 'edge') {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, W, H);
      if (highlighted) {
        drawHighlighted(ctx, W, H, highlighted, mode, opts.time || 0, rm);
      } else {
        drawObjects(ctx, W, H, scene, 'edge', opts);
      }
      ctx.fillStyle = 'rgba(0,255,65,0.03)';
      for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
    } else {
      drawRGBBackground(ctx, W, H, scene, opts.time || 0, rm);
      if (highlighted) {
        drawHighlighted(ctx, W, H, highlighted, 'rgb', opts.time || 0, rm);
      } else {
        drawObjects(ctx, W, H, scene, 'rgb', opts);
      }
      const g = ctx.createRadialGradient(W*0.7, 20, 0, W*0.7, 20, W*0.3);
      g.addColorStop(0, 'rgba(255,255,200,0.10)'); g.addColorStop(1, 'transparent');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
  }

  function drawHighlighted(ctx, W, H, obj, mode, time, rm) {
    const cx = W/2, cy = H/2;
    const size = Math.min(W, H) * 0.4;
    const pulse = rm ? 0 : Math.sin(time * 0.004) * 3;
    if (mode === 'edge') {
      ctx.strokeStyle = '#00FF41';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#00FF41';
      ctx.shadowBlur = 15 + pulse;
    }
    drawShape(ctx, cx - size/2, cy - size/2, size, size * 1.2, obj.type, mode);
    ctx.shadowBlur = 0;
  }

  function drawShape(ctx, x, y, w, h, type, mode) {
    if (mode === 'edge') {
      ctx.strokeStyle = '#00FF41'; ctx.lineWidth = 3;
      ctx.shadowColor = '#00FF41'; ctx.shadowBlur = 10;
    }
    if (type === 'person') {
      ctx.beginPath(); ctx.arc(x + w/2, y + h*0.12, h*0.12, 0, Math.PI*2); mode !== 'edge' ? ctx.fill() : ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + w/2, y + h*0.24); ctx.lineTo(x + w/2, y + h*0.6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + w/2, y + h*0.35); ctx.lineTo(x - w*0.3, y + h*0.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + w/2, y + h*0.35); ctx.lineTo(x + w + w*0.3, y + h*0.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + w/2, y + h*0.6); ctx.lineTo(x, y + h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + w/2, y + h*0.6); ctx.lineTo(x + w, y + h); ctx.stroke();
    } else if (type === 'car') {
      ctx.strokeRect(x + w*0.05, y + h*0.15, w*0.9, h*0.5);
      ctx.beginPath(); ctx.arc(x + w*0.2, y + h*0.7, h*0.12, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + w*0.8, y + h*0.7, h*0.12, 0, Math.PI*2); ctx.stroke();
    } else if (type === 'bike') {
      ctx.beginPath(); ctx.arc(x + w*0.3, y + h*0.4, h*0.2, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + w*0.7, y + h*0.4, h*0.2, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + w*0.3, y + h*0.4); ctx.lineTo(x + w/2, y); ctx.lineTo(x + w*0.7, y + h*0.4); ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }

  /* RGB background — gradient sky + ground + noise */
  function drawRGBBackground(ctx, W, H, scene, time, rm) {
    const sky = ctx.createLinearGradient(0, 0, 0, H*0.4);
    sky.addColorStop(0, '#1a2a4a'); sky.addColorStop(1, '#2a3a5a');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(0, H*0.4, W, H*0.6);
    ctx.fillStyle = '#4a4a4a';
    ctx.fillRect(0, H*0.55, W, H*0.2);
    // Noise particles — more than before to create visual clutter
    if (!rm) {
      for (let i = 0; i < 60; i++) {
        const n = (time * 0.0004 + i * 5.3) % 1;
        ctx.fillStyle = `rgba(255,255,255,${n * 0.08})`;
        ctx.fillRect((i * 29 + time*0.015) % W, (i * 47) % H, 2, 2);
      }
    }
  }

  /* Draw all objects */
  function drawObjects(ctx, W, H, objects, mode, opts) {
    const thick = opts.thick !== undefined ? opts.thick : 5;
    const sens = opts.sens !== undefined ? opts.sens : 5;
    const noiseThreshold = sens < 5 ? 1.0 : sens < 7 ? 0.5 : 0.05;
    const lineW = 2 + thick * 0.25;

    objects.forEach((obj, idx) => {
      if (obj.noise && mode === 'edge') {
        const seed = ((idx * 7 + (opts.time || 0) * 0.001) % 1);
        if (seed > noiseThreshold) return;
      }

      const x = PAD + obj.x * (W - PAD*2);
      const y = obj.y * H;
      const w = obj.w * (W - PAD*2);
      const h = obj.h * H;

      if (mode === 'edge') {
        ctx.strokeStyle = COL.edge;
        ctx.lineWidth = lineW;
        ctx.shadowColor = COL.edge;
        ctx.shadowBlur = 8;
        if (obj.type === 'person' || obj.type === 'pedestrian') {
          ctx.beginPath(); ctx.arc(x + w/2, y + h*0.15, h*0.1, 0, Math.PI*2); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x + w/2, y + h*0.25); ctx.lineTo(x + w/2, y + h*0.65); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x + w/2, y + h*0.35); ctx.lineTo(x - w*0.2, y + h*0.5); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x + w/2, y + h*0.35); ctx.lineTo(x + w + w*0.2, y + h*0.5); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x + w/2, y + h*0.65); ctx.lineTo(x, y + h); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x + w/2, y + h*0.65); ctx.lineTo(x + w, y + h); ctx.stroke();
        } else if (obj.type === 'car') {
          ctx.strokeRect(x + w*0.05, y + h*0.15, w*0.9, h*0.7);
          ctx.beginPath(); ctx.arc(x + w*0.2, y + h*0.9, h*0.1, 0, Math.PI*2); ctx.stroke();
          ctx.beginPath(); ctx.arc(x + w*0.8, y + h*0.9, h*0.1, 0, Math.PI*2); ctx.stroke();
        } else if (obj.type === 'bike') {
          ctx.beginPath(); ctx.arc(x + w*0.3, y + h*0.4, h*0.18, 0, Math.PI*2); ctx.stroke();
          ctx.beginPath(); ctx.arc(x + w*0.7, y + h*0.4, h*0.18, 0, Math.PI*2); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x + w*0.3, y + h*0.4); ctx.lineTo(x + w*0.5, y); ctx.lineTo(x + w*0.7, y + h*0.4); ctx.stroke();
        }
        ctx.shadowBlur = 0;
        if (opts.showBoxes && !obj.noise) {
          ctx.strokeStyle = 'rgba(0,255,65,0.5)'; ctx.lineWidth = 2; ctx.shadowBlur = 0;
          ctx.strokeRect(x-2, y-2, w+4, h+4);
        }
      } else {
        ctx.globalAlpha = 0.6;
        const color = obj.color || (obj.type === 'person' || obj.type === 'pedestrian' ? '#5B9BD5' : obj.type === 'car' ? '#FF6B35' : '#F4D03F');
        ctx.fillStyle = color;
        if (obj.type === 'person' || obj.type === 'pedestrian') {
          ctx.fillRect(x + w*0.25, y, w*0.5, h*0.6);
          ctx.beginPath(); ctx.arc(x + w/2, y - h*0.05, h*0.12, 0, Math.PI*2); ctx.fill();
        } else if (obj.type === 'car') {
          ctx.fillRect(x, y + h*0.1, w, h*0.6);
        } else if (obj.type === 'bike') {
          ctx.fillRect(x + w*0.3, y + h*0.2, w*0.4, h*0.4);
        }
        ctx.globalAlpha = 1;
      }
    });
  }

  function buildScene(objects) {
    return objects.map((o, i) => ({
      id: i, x: o.x, y: o.y, w: o.w, h: o.h, type: o.type, noise: o.noise || false,
      color: o.color || (o.type === 'person' || o.type === 'pedestrian' ? '#5B9BD5' : o.type === 'car' ? '#FF6B35' : '#F4D03F')
    }));
  }

  return { draw, buildScene };
})();
