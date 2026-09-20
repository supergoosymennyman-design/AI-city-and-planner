/**
 * renderer.js — Canvas rendering engine for Sonic Leak Hunter
 * 
 * Handles all canvas drawing:
 * - Waveform rendering (safe, leak, composite, live animated)
 * - Grid/city block drawing
 * - Threshold line rendering
 * - Confidence bar rendering
 * - Progress bars
 * - Quiz UI
 * - Water loss animations
 * 
 * Uses the project color palette via CSS custom properties
 */

const Renderer = (() => {
  // Colors — read from CSS custom properties or use fallbacks
  function getColors() {
    const style = getComputedStyle(document.documentElement);
    return {
      deep: style.getPropertyValue('--color-deep').trim() || '#0C2D48',
      water: style.getPropertyValue('--color-water').trim() || '#1B6B93',
      teal: style.getPropertyValue('--color-teal').trim() || '#35B5C8',
      leak: style.getPropertyValue('--color-leak').trim() || '#E76F51',
      amber: style.getPropertyValue('--color-amber').trim() || '#F4A261',
      sand: style.getPropertyValue('--color-sand').trim() || '#E9C46A',
      bg: style.getPropertyValue('--color-bg').trim() || '#F0F4F8',
      text: style.getPropertyValue('--color-text').trim() || '#1A1A2E',
      success: style.getPropertyValue('--color-success').trim() || '#2A9D8F',
      alert: style.getPropertyValue('--color-alert').trim() || '#E63946'
    };
  }

  /**
   * Clear a canvas and set background
   */
  function clearCanvas(canvas, bgColor = '#F0F4F8') {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  /**
   * Draw a waveform from point data
   * @param {CanvasRenderingContext2D} ctx
   * @param {Array<{x:number,y:number}>} points
   * @param {string} strokeColor - CSS color for the line
   * @param {number} lineWidth
   * @param {boolean} fillBelow - if true, fill below the curve
   * @param {string} fillColor - color for fill
   */
  function drawWaveform(ctx, points, strokeColor = '#35B5C8', lineWidth = 3, fillBelow = false, fillColor = null) {
    if (points.length < 2) return;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }

    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    if (fillBelow) {
      const lastX = points[points.length - 1].x;
      const canvasHeight = ctx.canvas.height;
      ctx.lineTo(lastX, canvasHeight);
      ctx.lineTo(points[0].x, canvasHeight);
      ctx.closePath();
      ctx.fillStyle = fillColor || strokeColor + '33';
      ctx.fill();
    }

    ctx.restore();
  }

  /**
   * Draw two waveforms side by side (Lv1 training)
   * @param {object} options - Optional: { piperGuessWrong: 'left'|'right' } for borderline round
   */
  function drawTrainingPair(canvas, safePoints, leakPoints, options = null) {
    const ctx = canvas.getContext('2d');
    const colors = getColors();
    const w = canvas.width;
    const h = canvas.height;
    
    ctx.clearRect(0, 0, w, h);
    
    // Background
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, w, h);
    
    // Divider line
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(w / 2, 30);
    ctx.lineTo(w / 2, h - 80);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Labels
    ctx.font = 'bold 20px "Fredoka One", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = colors.success;
    ctx.fillText('SAFE', w * 0.25, 45);
    ctx.fillStyle = colors.leak;
    ctx.fillText('LEAK', w * 0.75, 45);

    // Slightly smaller font for description
    ctx.font = '14px "Nunito", sans-serif';
    ctx.fillStyle = colors.text;
    ctx.fillText('Smooth & steady', w * 0.25, 65);
    ctx.fillText('Jagged & spiky', w * 0.75, 65);
    
    // Draw waves — left side (safe), right side (leak)
    // Offset for left side
    const leftPoints = safePoints.map(p => ({ x: p.x / 2, y: p.y }));
    const rightPoints = leakPoints.map(p => ({ x: p.x / 2 + w / 2, y: p.y }));
    
    drawWaveform(ctx, leftPoints, colors.teal, 3, true, colors.teal + '22');
    drawWaveform(ctx, rightPoints, colors.leak, 3, true, colors.leak + '22');

    // ── Piper's wrong guess visual (borderline round) ──
    if (options && options.piperGuessWrong) {
      const guessSide = options.piperGuessWrong; // 'left' or 'right'
      const guessX = guessSide === 'left' ? 0 : w / 2;
      const guessW = w / 2;
      
      // Red-tinted overlay on the side Piper wrongly picked
      ctx.fillStyle = 'rgba(231, 111, 81, 0.15)'; // leak color, semi-transparent
      ctx.fillRect(guessX, 0, guessW, h);
      
      // Dotted border around Piper's (wrong) guess
      ctx.strokeStyle = colors.leak;
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 4]);
      ctx.strokeRect(guessX + 8, 8, guessW - 16, h - 90);
      ctx.setLineDash([]);
      
      // "Piper's guess" label
      ctx.font = 'bold 16px "Nunito", sans-serif';
      ctx.fillStyle = colors.leak;
      ctx.textAlign = 'center';
      ctx.fillText('🤖 Piper picked this!', guessX + guessW / 2, h - 55);
      
      // "But is it right?" 
      ctx.font = '14px "Nunito", sans-serif';
      ctx.fillStyle = colors.text + '88';
      ctx.fillText('Is Piper correct? Tap the real leak!', w / 2, h - 25);
    } else {
      // Normal "Tap" hints
      ctx.font = '16px "Nunito", sans-serif';
      ctx.fillStyle = colors.text + '88';
      ctx.textAlign = 'center';
      ctx.fillText('👆 Tap if this is LEAK', w * 0.25, h - 40);
      ctx.fillText('👆 Tap if this is LEAK', w * 0.75, h - 40);
    }
    
    // Tap zones — semi-transparent overlays
    ctx.fillStyle = 'rgba(0,0,0,0.03)';
    ctx.fillRect(0, 0, w / 2, h);
    ctx.fillStyle = 'rgba(0,0,0,0.03)';
    ctx.fillRect(w / 2, 0, w / 2, h);
  }

  /**
   * Draw a single waveform for grid block display (Lv2, Lv3, Lv5)
   */
  function drawSingleWaveform(canvas, points, type = 'unknown') {
    const ctx = canvas.getContext('2d');
    const colors = getColors();
    const w = canvas.width;
    const h = canvas.height;
    
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, w, h);

    let strokeColor = colors.water;
    let fillColor = colors.water + '22';
    let label = '';
    let labelColor = colors.text;

    if (type === 'safe' || type === 'SAFE') {
      strokeColor = colors.teal;
      fillColor = colors.teal + '22';
      label = 'SAFE — Smooth Flow';
      labelColor = colors.success;
    } else if (type === 'leak' || type === 'LEAK') {
      strokeColor = colors.leak;
      fillColor = colors.leak + '22';
      label = 'LEAK DETECTED!';
      labelColor = colors.leak;
    } else if (type === 'uncertain' || type === 'UNCERTAIN') {
      label = 'UNCERTAIN';
      labelColor = colors.amber;
    } else if (type === 'neutral') {
      // Classification practice (L1): neutral colour + label — the child judges
      // leak vs safe by the wave's SHAPE, not by colour or text.
      strokeColor = colors.water;
      fillColor = colors.water + '22';
      label = 'WAVE SIGNAL';
      labelColor = colors.text;
    }

    drawWaveform(ctx, points, strokeColor, 3, true, fillColor);
    
    if (label) {
      ctx.font = 'bold 16px "Fredoka One", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = labelColor;
      ctx.fillText(label, w / 2, h - 15);
    }
  }

  /**
   * Draw city grid (Lv2: 3×3, Lv5: custom size)
   */
  function drawCityGrid(canvas, cols, rows, blocks, options = {}) {
    const ctx = canvas.getContext('2d');
    const colors = getColors();
    const w = canvas.width;
    const h = canvas.height;
    
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = colors.deep;
    ctx.fillRect(0, 0, w, h);
    
    const cellW = w / cols;
    const cellH = h / rows;
    const gap = 4;

    blocks.forEach((block, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = col * cellW + gap;
      const y = row * cellH + gap;
      const cw = cellW - gap * 2;
      const ch = cellH - gap * 2;
      
      let fillColor = colors.water;
      let borderColor = colors.water;
      let textColor = '#ffffff';
      let text = block.label || `B${i + 1}`;
      let icon = '🏠';
      
      // Store bounding rect for hit detection
      block._rect = { x, y, w: cw, h: ch };
      
      if (block.scanned) {
        if (block.revealed) {
          if (block.type === 'LEAK' || block.type === 'leak') {
            fillColor = colors.leak;
            borderColor = colors.leak;
            icon = '💧';
          } else if (block.type === 'UNCERTAIN' || block.type === 'BORDERLINE') {
            fillColor = colors.amber;
            borderColor = colors.amber;
            icon = '❓';
            if (block.flash) {
              const flashAlpha = 0.5 + Math.sin(Date.now() / 300) * 0.3;
              fillColor = `rgba(244, 162, 97, ${flashAlpha})`;
            }
          } else {
            fillColor = colors.teal;
            borderColor = colors.teal;
            icon = '✅';
          }
        }
      } else if (block.highlighted) {
        fillColor = block.correctColor || colors.amber;
        borderColor = fillColor;
        const flashAlpha = 0.6 + Math.sin(Date.now() / 300) * 0.3;
        fillColor = fillColor.replace('rgb', 'rgba').replace(')', `, ${flashAlpha})`)
          || `rgba(244, 162, 97, ${flashAlpha})`;
      }
      
      // Draw block
      ctx.fillStyle = fillColor;
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 2;
      
      // Rounded rectangle
      const radius = 10;
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + cw - radius, y);
      ctx.quadraticCurveTo(x + cw, y, x + cw, y + radius);
      ctx.lineTo(x + cw, y + ch - radius);
      ctx.quadraticCurveTo(x + cw, y + ch, x + cw - radius, y + ch);
      ctx.lineTo(x + radius, y + ch);
      ctx.quadraticCurveTo(x, y + ch, x, y + ch - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      
      // Icon + label
      ctx.fillStyle = textColor;
      ctx.font = '24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(icon, x + cw / 2, y + ch / 2 - 4);
      
      ctx.font = 'bold 14px "Nunito", sans-serif';
      ctx.fillText(text, x + cw / 2, y + ch / 2 + 22);

      // Confidence % display (Lv5)
      if (block.confidence !== undefined && block.revealed) {
        ctx.fillStyle = block.confidence >= 80 ? colors.success : colors.amber;
        ctx.font = 'bold 12px "Nunito", sans-serif';
        ctx.fillText(`${block.confidence}%`, x + cw / 2, y + ch / 2 - 28);
      }

      // Correct/wrong mark (L5 Final City Scan) — corner badge
      if (block.mark === 'good') {
        ctx.fillStyle = colors.success;
        ctx.font = 'bold 26px "Nunito", sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('✓', x + cw - 8, y + 24);
        ctx.textAlign = 'center';
      } else if (block.mark === 'bad') {
        ctx.fillStyle = colors.alert;
        ctx.font = 'bold 26px "Nunito", sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('✗', x + cw - 8, y + 24);
        ctx.textAlign = 'center';
      }
    });
  }

  /**
   * Draw a progress bar
   */
  function drawProgressBar(canvas, percent, label = '', barColor = '#1B6B93') {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    
    ctx.clearRect(0, 0, w, h);
    
    // Background track
    ctx.fillStyle = '#e0e0e0';
    ctx.beginPath();
    const radius = h / 2;
    ctx.moveTo(radius, 0);
    ctx.lineTo(w - radius, 0);
    ctx.arc(w - radius, radius, radius, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(radius, h);
    ctx.arc(radius, radius, radius, Math.PI / 2, -Math.PI / 2);
    ctx.closePath();
    ctx.fill();
    
    // Filled portion
    const fillW = Math.max(radius * 2, (w - 4) * (percent / 100) + radius);
    ctx.fillStyle = barColor;
    ctx.beginPath();
    ctx.moveTo(radius, 2);
    ctx.lineTo(fillW - radius, 2);
    ctx.arc(fillW - radius, radius, radius - 2, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(radius, h - 2);
    ctx.arc(radius, radius, radius - 2, Math.PI / 2, -Math.PI / 2);
    ctx.closePath();
    ctx.fill();
    
    // Label
    if (label) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px "Nunito", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, w / 2, h / 2);
    }
  }

  /**
   * Draw threshold line on a waveform canvas
   */
  function drawThresholdLine(canvas, points, thresholdY, color = '#E76F51') {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 4]);
    ctx.beginPath();
    ctx.moveTo(0, thresholdY);
    ctx.lineTo(w, thresholdY);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Label
    ctx.fillStyle = color;
    ctx.font = 'bold 14px "Nunito", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('THRESHOLD', w - 10, thresholdY - 8);
    
    ctx.restore();
  }

  /**
   * Highlight spike crossings on waveform
   */
  function highlightCrossings(ctx, points, thresholdY, color) {
    ctx.save();
    ctx.fillStyle = color;
    
    for (let i = 0; i < points.length - 1; i++) {
      const above = points[i].y < thresholdY && points[i + 1].y > thresholdY;
      const below = points[i].y > thresholdY && points[i + 1].y < thresholdY;
      
      if (above || below) {
        ctx.beginPath();
        ctx.arc(points[i + 1].x, points[i + 1].y, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    
    ctx.restore();
  }

  /**
   * Draw quiz question UI on canvas
   */
  function drawQuizQuestion(canvas, question, questionNum, totalQuestions) {
    const ctx = canvas.getContext('2d');
    const colors = getColors();
    const w = canvas.width;
    const h = canvas.height;
    
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, w, h);
    
    // Progress bar background
    ctx.fillStyle = '#e0e0e0';
    ctx.fillRect(20, 15, w - 40, 8);
    const progressW = (w - 40) * (questionNum / totalQuestions);
    ctx.fillStyle = colors.water;
    ctx.fillRect(20, 15, progressW, 8);
    
    // Question number
    ctx.fillStyle = colors.text;
    ctx.font = 'bold 14px "Nunito", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Briefing ${questionNum} of ${totalQuestions}`, 30, 45);
    
    // Question text
    ctx.font = 'bold 20px "Nunito", sans-serif';
    ctx.textAlign = 'center';
    
    // Word wrap
    const maxWidth = w - 60;
    const words = question.text.split(' ');
    let line = '';
    let y = 90;
    const lineHeight = 28;
    
    for (const word of words) {
      const testLine = line + word + ' ';
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && line !== '') {
        ctx.fillText(line.trim(), w / 2, y);
        line = word + ' ';
        y += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line.trim(), w / 2, y);
    
    // Choices
    const choiceStartY = y + 50;
    const choiceSpacing = 70;
    const choiceW = w - 80;
    const choiceH = 56;
    
    question._choices = []; // Store hit areas
    
    question.choices.forEach((choice, i) => {
      const cy = choiceStartY + i * choiceSpacing;
      const cx = 40;
      
      question._choices.push({
        index: i,
        rect: { x: cx, y: cy, w: choiceW, h: choiceH },
        text: choice.text,
        correct: choice.correct
      });
      
      let bgColor = '#ffffff';
      let borderColor = '#ccc';
      let textColor = colors.text;
      let prefix = '';
      
      if (choice.selected && choice.correct) {
        bgColor = colors.success + '22';
        borderColor = colors.success;
        textColor = colors.success;
        prefix = '✓ ';
      } else if (choice.selected && !choice.correct) {
        bgColor = colors.alert + '22';
        borderColor = colors.alert;
        textColor = colors.alert;
        prefix = '✗ ';
      } else if (question.answered && choice.correct) {
        bgColor = colors.success + '11';
        borderColor = colors.success;
      }
      
      // Choice button
      ctx.fillStyle = bgColor;
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 2;
      
      const r = 12;
      ctx.beginPath();
      ctx.moveTo(cx + r, cy);
      ctx.lineTo(cx + choiceW - r, cy);
      ctx.quadraticCurveTo(cx + choiceW, cy, cx + choiceW, cy + r);
      ctx.lineTo(cx + choiceW, cy + choiceH - r);
      ctx.quadraticCurveTo(cx + choiceW, cy + choiceH, cx + choiceW - r, cy + choiceH);
      ctx.lineTo(cx + r, cy + choiceH);
      ctx.quadraticCurveTo(cx, cy + choiceH, cx, cy + choiceH - r);
      ctx.lineTo(cx, cy + r);
      ctx.quadraticCurveTo(cx, cy, cx + r, cy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      
      // Choice letter + text
      const letter = String.fromCharCode(65 + i); // A, B, C
      ctx.fillStyle = textColor;
      ctx.font = 'bold 18px "Nunito", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${prefix}${letter}. ${choice.text}`, cx + 20, cy + choiceH / 2 + 6);
    });
    
    // Feedback text if answered
    if (question.answered) {
      const feedbackY = choiceStartY + 3 * choiceSpacing + 20;
      ctx.fillStyle = question._lastCorrect ? colors.success : colors.leak;
      ctx.font = 'bold 18px "Nunito", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        question._lastCorrect 
          ? 'The Water Department agrees! Well done!' 
          : `Not quite! The AI concept is: ${question.concept}`,
        w / 2, feedbackY
      );
      
      if (!question._lastCorrect) {
        ctx.fillStyle = colors.text;
        ctx.font = '15px "Nunito", sans-serif';
        ctx.fillText(question.tip || '', w / 2, feedbackY + 30);
      }
    }
  }

  /**
   * Draw water-loss animation frame
   */
  function drawWaterLoss(canvas, frame, totalFrames) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    
    ctx.clearRect(0, 0, w, h);
    
    const progress = frame / totalFrames;
    const waterLevel = h * (1 - progress);
    
    // Background
    ctx.fillStyle = '#0C2D48';
    ctx.fillRect(0, 0, w, h);
    
    // Water
    ctx.fillStyle = '#1B6B93';
    ctx.fillRect(0, waterLevel, w, h - waterLevel);
    
    // Water surface ripple
    ctx.strokeStyle = '#35B5C8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x < w; x += 5) {
      const y = waterLevel + Math.sin(x * 0.05 + frame * 0.3) * 8;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    
    // "Water Lost!" text
    if (progress > 0.3) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 28px "Fredoka One", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('WATER LOST! 💧', w / 2, h / 2);
      ctx.font = '16px "Nunito", sans-serif';
      ctx.fillText('Be more careful next time!', w / 2, h / 2 + 35);
    }
  }

  /**
   * Draw certificate screen
   */
  function drawCertificate(canvas, score, total, studentName = 'Junior Detective') {
    const ctx = canvas.getContext('2d');
    const colors = getColors();
    const w = canvas.width;
    const h = canvas.height;
    
    ctx.clearRect(0, 0, w, h);
    
    // Parchment background
    ctx.fillStyle = '#FFF9E6';
    ctx.fillRect(0, 0, w, h);
    
    // Border
    ctx.strokeStyle = colors.sand;
    ctx.lineWidth = 6;
    ctx.strokeRect(20, 15, w - 40, h - 30);
    
    // Inner border
    ctx.strokeStyle = colors.amber;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(35, 28, w - 70, h - 56);
    ctx.setLineDash([]);
    
    // Title
    ctx.fillStyle = colors.deep;
    ctx.font = 'bold 32px "Fredoka One", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🏆 WATER DEPARTMENT CLEARANCE 🏆', w / 2, 90);
    
    ctx.fillStyle = colors.amber;
    ctx.font = '22px "Fredoka One", sans-serif';
    ctx.fillText('AI Leak Detection Briefing', w / 2, 130);
    
    // Recipient
    ctx.fillStyle = colors.text;
    ctx.font = '18px "Nunito", sans-serif';
    ctx.fillText('The Water Department confirms', w / 2, 180);
    
    ctx.fillStyle = colors.water;
    ctx.font = 'bold 28px "Fredoka One", sans-serif';
    ctx.fillText(studentName, w / 2, 225);
    
    // Score
    ctx.fillStyle = colors.text;
    ctx.font = '18px "Nunito", sans-serif';
    const passed = score >= 7;
    ctx.fillText(
      passed
        ? `briefed our leak detection AI with a score of ${score}/${total}`
        : `achieved a score of ${score}/${total} — keep learning!`,
      w / 2, 270
    );
    
    // AI concepts learned
    if (passed) {
      ctx.fillStyle = colors.success;
      ctx.font = 'bold 20px "Fredoka One", sans-serif';
      ctx.fillText('AI Concepts Briefed:', w / 2, 330);
      
      const concepts = [
        'Supervised Learning', 'Classification', 
        'Signal vs Noise', 'Threshold Tradeoff',
        'Batch Processing', 'Human-in-the-Loop'
      ];
      
      ctx.font = '16px "Nunito", sans-serif';
      let cy = 365;
      concepts.forEach((concept, i) => {
        const col = i < 3 ? w / 2 - 100 : w / 2 + 100;
        const row = i < 3 ? i : i - 3;
        ctx.fillText(`🧠 ${concept}`, col, cy + row * 30);
      });
    }
    
    // Date
    ctx.fillStyle = colors.text + '88';
    ctx.font = '14px "Nunito", sans-serif';
    const today = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', month: 'long', day: 'numeric' 
    });
    ctx.fillText(`Date: ${today}`, w - 200, h - 50);
    
    // Decorative water drops
    ctx.fillStyle = colors.teal + '33';
    for (let i = 0; i < 5; i++) {
      const dx = 80 + i * 110;
      ctx.beginPath();
      ctx.arc(dx, h - 35, 8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * Draw Piper comparison (before/after)
   */
  function drawPiperComparison(canvas) {
    const ctx = canvas.getContext('2d');
    const colors = getColors();
    const w = canvas.width;
    const h = canvas.height;
    
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, w, h);
    
    // Before — gray
    ctx.fillStyle = '#999';
    ctx.font = '60px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🤖', w * 0.25, h / 2 - 20);
    ctx.fillStyle = colors.text;
    ctx.font = 'bold 18px "Nunito", sans-serif';
    ctx.fillText('Piper v1.0', w * 0.25, h / 2 + 45);
    ctx.font = '14px "Nunito", sans-serif';
    ctx.fillText('Knew nothing about leaks', w * 0.25, h / 2 + 70);
    
    // After — colored
    ctx.fillStyle = colors.water;
    ctx.font = '60px sans-serif';
    ctx.fillText('🤖', w * 0.75, h / 2 - 20);
    ctx.fillStyle = colors.success;
    ctx.font = 'bold 18px "Nunito", sans-serif';
    ctx.fillText('Piper v2.0', w * 0.75, h / 2 + 45);
    ctx.font = '14px "Nunito", sans-serif';
    ctx.fillText('Can protect the city!', w * 0.75, h / 2 + 70);
    
    // Arrow
    ctx.fillStyle = colors.amber;
    ctx.font = '40px sans-serif';
    ctx.fillText('➡️', w / 2, h / 2 - 10);
    
    // Labels
    ctx.fillStyle = colors.text;
    ctx.font = 'bold 16px "Nunito", sans-serif';
    ctx.fillText('Before YOU', w * 0.25, h / 2 + 105);
    ctx.fillText('After YOU trained it', w * 0.75, h / 2 + 105);
  }

  return {
    clearCanvas,
    drawWaveform,
    drawTrainingPair,
    drawSingleWaveform,
    drawCityGrid,
    drawProgressBar,
    drawThresholdLine,
    highlightCrossings,
    drawQuizQuestion,
    drawWaterLoss,
    drawCertificate,
    drawPiperComparison,
    getColors
  };
})();

window.Renderer = Renderer;
