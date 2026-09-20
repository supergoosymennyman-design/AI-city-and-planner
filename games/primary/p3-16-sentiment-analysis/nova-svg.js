/**
 * nova-svg.js — Nova's SVG character face
 *
 * Custom-drawn SVG character with:
 * - 7 emotion states with distinct eye/mouth shapes
 * - Ambient animations (blink, idle bob)
 * - Accessory progression across levels
 * - One-shot celebrations (bounce, sparkle)
 *
 * Usage: NovaSVG.init() → NovaSVG.setExpression('nervous')
 *        → NovaSVG.addAccessory('star-silver')
 *        → NovaSVG.triggerAnimation('bounce')
 */
const NovaSVG = (() => {
  'use strict';

  // ── SVG Template ──
  // The SVG is generated once and cached. Expressions modify
  // child elements via attribute changes (not DOM rebuilds).

  const SVG_NS = 'http://www.w3.org/2000/svg';

  let containerEl = null;  // The #nova-avatar div
  let svgEl = null;        // The <svg> element
  let leftPupil = null;
  let rightPupil = null;
  let leftEye = null;
  let rightEye = null;
  let mouthEl = null;
  let glowEl = null;
  let accessoryGroup = null;
  let dotEl = null;
  let dotContainer = null;

  let currentExpression = 'nervous';
  let currentAccessories = [];
  let blinkTimer = null;
  let idleAnimFrame = null;
  let isBlinking = false;
  let floatOffset = 0;
  let floatTime = 0;

  // ── SVG Build ──

  function buildSVG() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 80 80');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.style.display = 'block';

    // Glow circle (behind head)
    glowEl = document.createElementNS(SVG_NS, 'circle');
    glowEl.setAttribute('cx', '40');
    glowEl.setAttribute('cy', '40');
    glowEl.setAttribute('r', '38');
    glowEl.setAttribute('fill', 'transparent');
    glowEl.setAttribute('opacity', '0');
    svg.appendChild(glowEl);

    // Head
    const head = document.createElementNS(SVG_NS, 'circle');
    head.setAttribute('cx', '40');
    head.setAttribute('cy', '40');
    head.setAttribute('r', '34');
    head.setAttribute('fill', '#8899FF');
    head.setAttribute('stroke', '#6B7DFF');
    head.setAttribute('stroke-width', '1.5');
    svg.appendChild(head);

    // Eyes group
    const eyes = document.createElementNS(SVG_NS, 'g');

    // Left eye white
    leftEye = document.createElementNS(SVG_NS, 'ellipse');
    leftEye.setAttribute('cx', '28');
    leftEye.setAttribute('cy', '33');
    leftEye.setAttribute('rx', '8');
    leftEye.setAttribute('ry', '9');
    leftEye.setAttribute('fill', '#FFFFFF');
    eyes.appendChild(leftEye);

    // Left pupil
    leftPupil = document.createElementNS(SVG_NS, 'circle');
    leftPupil.setAttribute('cx', '28');
    leftPupil.setAttribute('cy', '34');
    leftPupil.setAttribute('r', '4.5');
    leftPupil.setAttribute('fill', '#2D2D5E');
    eyes.appendChild(leftPupil);

    // Right eye white
    rightEye = document.createElementNS(SVG_NS, 'ellipse');
    rightEye.setAttribute('cx', '52');
    rightEye.setAttribute('cy', '33');
    rightEye.setAttribute('rx', '8');
    rightEye.setAttribute('ry', '9');
    rightEye.setAttribute('fill', '#FFFFFF');
    eyes.appendChild(rightEye);

    // Right pupil
    rightPupil = document.createElementNS(SVG_NS, 'circle');
    rightPupil.setAttribute('cx', '52');
    rightPupil.setAttribute('cy', '34');
    rightPupil.setAttribute('r', '4.5');
    rightPupil.setAttribute('fill', '#2D2D5E');
    eyes.appendChild(rightPupil);

    svg.appendChild(eyes);

    // Mouth
    mouthEl = document.createElementNS(SVG_NS, 'path');
    mouthEl.setAttribute('d', 'M 30 50 Q 40 54 50 50');
    mouthEl.setAttribute('stroke', '#2D2D5E');
    mouthEl.setAttribute('stroke-width', '2.5');
    mouthEl.setAttribute('fill', 'none');
    mouthEl.setAttribute('stroke-linecap', 'round');
    svg.appendChild(mouthEl);

    // Accessory group (empty, filled by addAccessory)
    accessoryGroup = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(accessoryGroup);

    // Thinking dots container
    dotContainer = document.createElementNS(SVG_NS, 'g');
    dotContainer.setAttribute('opacity', '0');
    svg.appendChild(dotContainer);

    // State dot
    dotEl = document.createElementNS(SVG_NS, 'circle');
    dotEl.setAttribute('cx', '68');
    dotEl.setAttribute('cy', '68');
    dotEl.setAttribute('r', '5');
    dotEl.setAttribute('fill', '#90A4AE');
    dotEl.setAttribute('stroke', '#1a1a2e');
    dotEl.setAttribute('stroke-width', '2');
    svg.appendChild(dotEl);

    // Add SVG class for CSS animations
    svg.classList.add('nova-svg');

    return svg;
  }

  // ── Expression Definitions ──
  // Each expression defines: pupilSize, eyeRy, eyeRx, pupilOffset, mouthD, glow, extra

  const EXPRESSIONS = {
    nervous: {
      leftEye: { rx: 8, ry: 9 },
      rightEye: { rx: 8, ry: 9 },
      leftPupil: { r: 3.5, cx: 28, cy: 34 },
      rightPupil: { r: 3.5, cx: 52, cy: 34 },
      mouth: 'M 30 50 Q 40 50 50 50',
      glowColor: 'transparent',
      glowOpacity: 0,
      containerClass: 'expression-nervous',
      dotColor: '#90A4AE',
    },
    curious: {
      leftEye: { rx: 8, ry: 9 },
      rightEye: { rx: 9, ry: 9.5 },
      leftPupil: { r: 4.5, cx: 28, cy: 34 },
      rightPupil: { r: 4.5, cx: 53, cy: 33 },
      mouth: 'M 31 50 Q 34 46 37 50 Q 40 54 43 50 Q 46 46 49 50',
      glowColor: 'transparent',
      glowOpacity: 0,
      containerClass: 'expression-curious',
      dotColor: '#FFB74D',
    },
    confident: {
      leftEye: { rx: 8, ry: 7 },
      rightEye: { rx: 8, ry: 7 },
      leftPupil: { r: 4.5, cx: 28, cy: 34 },
      rightPupil: { r: 4.5, cx: 52, cy: 34 },
      mouth: 'M 30 50 Q 40 57 50 50',
      glowColor: 'rgba(136,153,255,0.5)',
      glowOpacity: 0.6,
      containerClass: 'expression-confident',
      dotColor: '#4CAF50',
    },
    thinking: {
      leftEye: { rx: 8, ry: 9 },
      rightEye: { rx: 8, ry: 9 },
      leftPupil: { r: 4, cx: 26, cy: 31 },
      rightPupil: { r: 4, cx: 50, cy: 31 },
      mouth: 'M 32 50 L 48 50',
      glowColor: 'transparent',
      glowOpacity: 0,
      containerClass: 'expression-thinking',
      dotColor: '#FFB74D',
    },
    proud: {
      leftEye: { rx: 8, ry: 6 },
      rightEye: { rx: 8, ry: 6 },
      leftPupil: { r: 0, cx: 28, cy: 34 },  // closed eyes (pupil hidden)
      rightPupil: { r: 0, cx: 52, cy: 34 },
      mouth: 'M 28 50 Q 40 60 52 50',
      glowColor: 'rgba(255,215,0,0.6)',
      glowOpacity: 0.8,
      containerClass: 'expression-proud',
      dotColor: '#4CAF50',
    },
    excited: {
      leftEye: { rx: 9, ry: 9.5 },
      rightEye: { rx: 9, ry: 9.5 },
      leftPupil: { r: 4.5, cx: 27, cy: 33 },
      rightPupil: { r: 4.5, cx: 51, cy: 33 },
      mouth: 'M 30 50 Q 34 44 38 48 Q 40 46 42 48 Q 46 44 50 50',
      glowColor: 'rgba(255,215,0,0.4)',
      glowOpacity: 0.5,
      containerClass: 'expression-excited',
      dotColor: '#4CAF50',
    },
    empathetic: {
      leftEye: { rx: 8, ry: 8 },
      rightEye: { rx: 8, ry: 8 },
      leftPupil: { r: 4, cx: 28, cy: 35 },
      rightPupil: { r: 4, cx: 52, cy: 35 },
      mouth: 'M 32 52 Q 40 49 48 52',
      glowColor: 'rgba(136,153,255,0.3)',
      glowOpacity: 0.3,
      containerClass: 'expression-empathetic',
      dotColor: '#90A4AE',
    },
  };

  // ── Accessory Definitions ──

  const ACCESSORIES = {
    'star-silver': {
      render: () => {
        const g = createSVG('g');
        const star = createSVG('polygon');
        star.setAttribute('points', '6,0 7.5,4.5 12,4.5 8.5,7.5 10,12 6,9 2,12 3.5,7.5 0,4.5 4.5,4.5');
        star.setAttribute('fill', '#C0C0C0');
        star.setAttribute('transform', 'translate(58, 6) scale(1.1)');
        g.appendChild(star);
        return g;
      },
    },
    'star-gold': {
      render: () => {
        const g = createSVG('g');
        const star = createSVG('polygon');
        star.setAttribute('points', '6,0 7.5,4.5 12,4.5 8.5,7.5 10,12 6,9 2,12 3.5,7.5 0,4.5 4.5,4.5');
        star.setAttribute('fill', '#FFD700');
        star.setAttribute('transform', 'translate(58, 6) scale(1.1)');
        g.appendChild(star);
        return g;
      },
    },
    'star-gold-2': {
      render: () => {
        const g = createSVG('g');
        const s1 = createSVG('polygon');
        s1.setAttribute('points', '6,0 7.5,4.5 12,4.5 8.5,7.5 10,12 6,9 2,12 3.5,7.5 0,4.5 4.5,4.5');
        s1.setAttribute('fill', '#FFD700');
        s1.setAttribute('transform', 'translate(58, 6) scale(1.1)');
        g.appendChild(s1);
        const s2 = createSVG('polygon');
        s2.setAttribute('points', '4,0 5,3 8,3 5.5,5 6.5,8 4,6 1.5,8 2.5,5 0,3 3,3');
        s2.setAttribute('fill', '#C0C0C0');
        s2.setAttribute('transform', 'translate(48, 0) scale(1.1)');
        g.appendChild(s2);
        return g;
      },
    },
    'cap': {
      render: () => {
        const g = createSVG('g');
        g.setAttribute('transform', 'translate(44, 2)');
        // Cap top
        const top = createSVG('polygon');
        top.setAttribute('points', '-10,8 10,8 8,0 -8,0');
        top.setAttribute('fill', '#2D2D5E');
        g.appendChild(top);
        // Cap brim
        const brim = createSVG('rect');
        brim.setAttribute('x', '-12');
        brim.setAttribute('y', '8');
        brim.setAttribute('width', '14');
        brim.setAttribute('height', '2');
        brim.setAttribute('rx', '1');
        brim.setAttribute('fill', '#2D2D5E');
        g.appendChild(brim);
        // Tassel
        const tassel = createSVG('line');
        tassel.setAttribute('x1', '10');
        tassel.setAttribute('y1', '0');
        tassel.setAttribute('x2', '14');
        tassel.setAttribute('y2', '10');
        tassel.setAttribute('stroke', '#FFD700');
        tassel.setAttribute('stroke-width', '1.5');
        g.appendChild(tassel);
        return g;
      },
    },
    'hard-hat': {
      render: () => {
        const g = createSVG('g');
        g.setAttribute('transform', 'translate(44, 2)');
        const hat = createSVG('path');
        hat.setAttribute('d', 'M -10,8 Q -10,-4 0,-6 Q 10,-4 10,8 Z');
        hat.setAttribute('fill', '#FF9800');
        hat.setAttribute('stroke', '#E65100');
        hat.setAttribute('stroke-width', '1');
        g.appendChild(hat);
        const brim = createSVG('rect');
        brim.setAttribute('x', '-13');
        brim.setAttribute('y', '7');
        brim.setAttribute('width', '16');
        brim.setAttribute('height', '2.5');
        brim.setAttribute('rx', '1');
        brim.setAttribute('fill', '#FF9800');
        brim.setAttribute('stroke', '#E65100');
        brim.setAttribute('stroke-width', '0.8');
        g.appendChild(brim);
        return g;
      },
    },
    'lightning': {
      render: () => {
        const g = createSVG('g');
        g.setAttribute('transform', 'translate(60, 8)');
        const bolt = createSVG('polygon');
        bolt.setAttribute('points', '4,0 0,7 3.5,7 2.5,12 7,5 3.5,5 5.5,0');
        bolt.setAttribute('fill', '#FFD700');
        g.appendChild(bolt);
        return g;
      },
    },
    'cape': {
      render: () => {
        const g = createSVG('g');
        g.setAttribute('opacity', '0.7');
        const cape = createSVG('path');
        cape.setAttribute('d', 'M 22,45 Q 15,55 18,70 L 25,68 Q 22,58 28,50 Z');
        cape.setAttribute('fill', '#E53935');
        g.appendChild(cape);
        const cape2 = createSVG('path');
        cape2.setAttribute('d', 'M 58,45 Q 65,55 62,70 L 55,68 Q 58,58 52,50 Z');
        cape2.setAttribute('fill', '#E53935');
        g.appendChild(cape2);
        return g;
      },
    },
    'medal': {
      render: () => {
        const g = createSVG('g');
        g.setAttribute('transform', 'translate(46, 56)');
        const circle = createSVG('circle');
        circle.setAttribute('cx', '0');
        circle.setAttribute('cy', '0');
        circle.setAttribute('r', '5');
        circle.setAttribute('fill', '#FFD700');
        circle.setAttribute('stroke', '#B8860B');
        circle.setAttribute('stroke-width', '1');
        g.appendChild(circle);
        const line = createSVG('line');
        line.setAttribute('x1', '0');
        line.setAttribute('y1', '-5');
        line.setAttribute('x2', '0');
        line.setAttribute('y2', '-10');
        line.setAttribute('stroke', '#FFD700');
        line.setAttribute('stroke-width', '1');
        g.appendChild(line);
        return g;
      },
    },
    'glasses': {
      render: () => {
        const g = createSVG('g');
        g.setAttribute('opacity', '0.8');
        // Left lens
        const l = createSVG('circle');
        l.setAttribute('cx', '28');
        l.setAttribute('cy', '33');
        l.setAttribute('r', '9');
        l.setAttribute('fill', 'none');
        l.setAttribute('stroke', '#2D2D5E');
        l.setAttribute('stroke-width', '1.5');
        g.appendChild(l);
        // Right lens
        const r = createSVG('circle');
        r.setAttribute('cx', '52');
        r.setAttribute('cy', '33');
        r.setAttribute('r', '9');
        r.setAttribute('fill', 'none');
        r.setAttribute('stroke', '#2D2D5E');
        r.setAttribute('stroke-width', '1.5');
        g.appendChild(r);
        // Bridge
        const bridge = createSVG('line');
        bridge.setAttribute('x1', '37');
        bridge.setAttribute('y1', '33');
        bridge.setAttribute('x2', '43');
        bridge.setAttribute('y2', '33');
        bridge.setAttribute('stroke', '#2D2D5E');
        bridge.setAttribute('stroke-width', '1.5');
        g.appendChild(bridge);
        return g;
      },
    },
  };

  function createSVG(tag) {
    return document.createElementNS(SVG_NS, tag);
  }

  // ── Initialization ──

  function init() {
    containerEl = document.getElementById('nova-avatar');
    if (!containerEl) return;

    // Set up container for SVG
    containerEl.style.position = 'relative';
    containerEl.style.width = '56px';
    containerEl.style.height = '56px';
    containerEl.style.borderRadius = '50%';
    containerEl.style.display = 'flex';
    containerEl.style.alignItems = 'center';
    containerEl.style.justifyContent = 'center';

    // Build SVG
    svgEl = buildSVG();
    containerEl.appendChild(svgEl);

    // Set initial expression
    setExpression('nervous');

    // Start blink timer
    scheduleBlink();

    // Start idle animation
    startIdleBob();
  }

  // ── Expression Control ──

  function setExpression(name) {
    const expr = EXPRESSIONS[name];
    if (!expr) return;

    currentExpression = name;

    // Update eyes
    setAttrs(leftEye, expr.leftEye);
    setAttrs(rightEye, expr.rightEye);
    setAttrs(leftPupil, expr.leftPupil);
    setAttrs(rightPupil, expr.rightPupil);

    // Update mouth
    mouthEl.setAttribute('d', expr.mouth);

    // Update glow
    glowEl.setAttribute('fill', expr.glowColor);
    glowEl.setAttribute('opacity', expr.glowOpacity);

    // Update container class
    Object.keys(EXPRESSIONS).forEach(k => {
      containerEl.classList.remove('expression-' + k);
    });
    if (expr.containerClass) {
      containerEl.classList.add(expr.containerClass);
    }

    // Update state dot
    dotEl.setAttribute('fill', expr.dotColor);

    // Thinking dots visibility
    if (name === 'thinking') {
      dotContainer.setAttribute('opacity', '1');
      renderThinkingDots();
    } else {
      dotContainer.setAttribute('opacity', '0');
    }
  }

  function setAttrs(el, attrs) {
    if (!el) return;
    Object.keys(attrs).forEach(key => {
      el.setAttribute(key, attrs[key]);
    });
  }

  // ── Thinking Dots ──

  let thinkingDotInterval = null;

  function renderThinkingDots() {
    dotContainer.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const dot = createSVG('circle');
      dot.setAttribute('cx', 36 + i * 9);
      dot.setAttribute('cy', 12);
      dot.setAttribute('r', '3');
      dot.setAttribute('fill', '#8899FF');
      dot.setAttribute('opacity', '0');
      dot.style.animation = 'nova-dot-appear 0.4s ease forwards';
      dot.style.animationDelay = (i * 0.3) + 's';
      dotContainer.appendChild(dot);
    }
  }

  // ── Blink ──

  function scheduleBlink() {
    if (blinkTimer) clearTimeout(blinkTimer);
    const delay = 2000 + Math.random() * 4000; // 2-6 seconds
    blinkTimer = setTimeout(() => {
      doBlink();
      scheduleBlink();
    }, delay);
  }

  function doBlink() {
    if (isBlinking || currentExpression === 'proud') return;
    isBlinking = true;
    const origRyL = leftEye.getAttribute('ry');
    const origRyR = rightEye.getAttribute('ry');
    leftEye.setAttribute('ry', '1');
    rightEye.setAttribute('ry', '1');
    leftPupil.setAttribute('r', '0');
    rightPupil.setAttribute('r', '0');
    setTimeout(() => {
      leftEye.setAttribute('ry', origRyL);
      rightEye.setAttribute('ry', origRyR);
      const expr = EXPRESSIONS[currentExpression];
      if (expr) {
        leftPupil.setAttribute('r', expr.leftPupil.r);
        rightPupil.setAttribute('r', expr.rightPupil.r);
      }
      isBlinking = false;
    }, 120);
  }

  // ── Idle Bob ──

  function startIdleBob() {
    if (idleAnimFrame) cancelAnimationFrame(idleAnimFrame);
    floatTime = 0;
    function frame() {
      floatTime += 0.04;
      floatOffset = Math.sin(floatTime) * 2;  // 2px amplitude
      if (svgEl) {
        svgEl.style.transform = 'translateY(' + floatOffset + 'px)';
      }
      idleAnimFrame = requestAnimationFrame(frame);
    }
    idleAnimFrame = requestAnimationFrame(frame);
  }

  function stopIdleBob() {
    if (idleAnimFrame) {
      cancelAnimationFrame(idleAnimFrame);
      idleAnimFrame = null;
    }
    if (svgEl) {
      svgEl.style.transform = '';
    }
  }

  // ── Accessories ──

  function addAccessory(name) {
    if (!accessoryGroup) return;
    const def = ACCESSORIES[name];
    if (!def) return;

    // Remove existing accessory of same type
    const existingId = 'nova-acc-' + name;
    const existing = svgEl.querySelector('#' + existingId);
    if (existing) existing.remove();

    const el = def.render();
    el.setAttribute('id', existingId);
    accessoryGroup.appendChild(el);

    if (!currentAccessories.includes(name)) {
      currentAccessories.push(name);
    }
  }

  function removeAccessory(name) {
    const existingId = 'nova-acc-' + name;
    const existing = svgEl.querySelector('#' + existingId);
    if (existing) existing.remove();
    currentAccessories = currentAccessories.filter(a => a !== name);
  }

  function clearAccessories() {
    if (accessoryGroup) {
      accessoryGroup.innerHTML = '';
    }
    currentAccessories = [];
  }

  /**
   * Set accessories for a given level.
   * Level-to-accessory mapping for visual progression.
   */
  function setLevel(level) {
    clearAccessories();
    switch(level) {
      case 1: break; // No accessories
      case 2: addAccessory('star-silver'); break;
      case 3: addAccessory('star-gold'); break;
      case 4: addAccessory('star-gold-2'); addAccessory('cap'); break;
      case 5: addAccessory('star-gold-2'); addAccessory('hard-hat'); addAccessory('lightning'); break;
      case 6: addAccessory('star-gold-2'); addAccessory('cap'); addAccessory('cape'); break;
      case 7: addAccessory('star-gold-2'); addAccessory('cap'); addAccessory('medal'); addAccessory('glasses'); break;
      case 8: addAccessory('star-gold-2'); addAccessory('cap'); addAccessory('cape'); addAccessory('medal'); break;
    }
  }

  // ── One-shot Animations ──

  function triggerAnimation(name) {
    if (!containerEl) return;
    containerEl.classList.remove('anim-bounce', 'anim-sparkle', 'anim-shake');

    // Force reflow
    void containerEl.offsetWidth;

    containerEl.classList.add('anim-' + name);

    // Auto-remove after animation
    setTimeout(() => {
      containerEl.classList.remove('anim-' + name);
    }, 600);
  }

  // ── State Dot ──

  function setState(state) {
    if (!dotEl) return;
    switch(state) {
      case 'listening': dotEl.setAttribute('fill', '#4CAF50'); break;
      case 'thinking': dotEl.setAttribute('fill', '#FFB74D'); break;
      case 'speaking': dotEl.setAttribute('fill', '#42A5F5'); break;
      case 'idle':
      default:
        const expr = EXPRESSIONS[currentExpression];
        dotEl.setAttribute('fill', expr ? expr.dotColor : '#90A4AE');
        break;
    }
  }

  // ── Public API ──

  const api = {
    init,
    setExpression,
    getExpression: () => currentExpression,
    addAccessory,
    removeAccessory,
    clearAccessories,
    setLevel,
    triggerAnimation,
    doBlink,
    setState,
  };

  window.NovaSVG = api;
  return api;
})();
