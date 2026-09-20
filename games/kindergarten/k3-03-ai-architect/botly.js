/**
 * botly.js — Botly character rendering and state management
 * for K3-03 AI Architect.
 *
 * Botly is a mint green round robot with teal details.
 * States: idle (gentle bounce), listening (antenna glow),
 *         thinking (eyes squint), speaking (mouth animation)
 */

var BotlyCharacter = (() => {
  'use strict';

  let currentState = 'idle';
  let currentExpression = 'neutral';
  let currentText = '';
  let callbacks = {};

  /**
   * Generate the Botly SVG markup.
   * @returns {string} SVG markup
   */
  function renderSVG() {
    return `
      <svg class="botly-svg ${currentState}" viewBox="0 0 90 90" aria-hidden="true">
        <!-- Antenna -->
        <line x1="45" y1="4" x2="45" y2="16" stroke="var(--botly-detail)" stroke-width="2.5" stroke-linecap="round"/>
        <circle id="botly-antenna-glow" cx="45" cy="6" r="4" fill="var(--primary-teal)" opacity="0.6"/>

        <!-- Body — rounded mint green -->
        <rect x="14" y="50" width="62" height="34" rx="14" fill="var(--botly-body)" stroke="var(--botly-detail)" stroke-width="2"/>

        <!-- Body details — teal buttons -->
        <circle cx="45" cy="64" r="5" fill="var(--botly-detail)" opacity="0.5"/>
        <circle cx="30" cy="56" r="3" fill="var(--botly-detail)" opacity="0.4"/>
        <circle cx="60" cy="56" r="3" fill="var(--botly-detail)" opacity="0.4"/>

        <!-- Arms — small stubs -->
        <rect x="4" y="54" width="12" height="8" rx="4" fill="var(--botly-body)" stroke="var(--botly-detail)" stroke-width="1.5"/>
        <rect x="74" y="54" width="12" height="8" rx="4" fill="var(--botly-body)" stroke="var(--botly-detail)" stroke-width="1.5"/>

        <!-- Head — round -->
        <circle cx="45" cy="32" r="22" fill="var(--botly-body)" stroke="var(--botly-detail)" stroke-width="2"/>

        <!-- Eyes -->
        <g id="botly-eyes">
          <!-- Left eye -->
          <ellipse cx="36" cy="30" rx="5" ry="6" fill="white" stroke="var(--botly-detail)" stroke-width="1.5"/>
          <circle class="pupil" cx="37" cy="30" r="3" fill="var(--botly-detail)"/>

          <!-- Right eye -->
          <ellipse cx="54" cy="30" rx="5" ry="6" fill="white" stroke="var(--botly-detail)" stroke-width="1.5"/>
          <circle class="pupil" cx="55" cy="30" r="3" fill="var(--botly-detail)"/>
        </g>

        <!-- Cheeks -->
        <ellipse cx="28" cy="37" rx="4" ry="3" fill="var(--accent-coral)" opacity="0.3"/>
        <ellipse cx="62" cy="37" rx="4" ry="3" fill="var(--accent-coral)" opacity="0.3"/>

        <!-- Mouth -->
        <path id="botly-mouth" d="M37,42 Q45,47 53,42" fill="none" stroke="var(--botly-detail)" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `;
  }

  /**
   * Create the Botly character UI in a container.
   * @param {HTMLElement} container - Element to append Botly to
   * @returns {Object} Botly control interface
   */
  function create(container) {
    container.innerHTML = `
      <div id="botly-area">
        <div class="botly-container">
          <div class="botly-svg-wrap" id="botly-svg-wrap">
            ${renderSVG()}
          </div>
          <div class="speech-bubble" role="status" aria-live="polite" aria-atomic="true">
            <p class="speech-text" id="botly-speech"></p>
          </div>
        </div>
        <div id="state-indicator">
          <span class="state-dot idle" id="state-dot"></span>
          <span class="state-label" id="state-label">Ready</span>
        </div>
      </div>
    `;

    return {
      setText,
      setState,
      setExpression,
      updateSVG: () => updateSVG(container),
      getState: () => currentState,
      getText: () => currentText
    };
  }

  function updateSVG(container) {
    const wrap = container.querySelector('#botly-svg-wrap');
    if (wrap) {
      wrap.innerHTML = renderSVG();
    }
  }

  /**
   * Update Botly's state with visual indicator.
   * @param {string} state - 'idle'|'listening'|'thinking'|'speaking'
   * @param {string} [label] - Optional label text
   */
  function setState(state, label) {
    currentState = state || 'idle';

    const dot = document.getElementById('state-dot');
    const labelEl = document.getElementById('state-label');
    const wrap = document.getElementById('botly-svg-wrap');

    if (dot) {
      dot.className = 'state-dot ' + currentState;
    }
    if (labelEl) {
      labelEl.textContent = label || currentState.charAt(0).toUpperCase() + currentState.slice(1);
    }

    // Update SVG animation class
    if (wrap) {
      const svg = wrap.querySelector('.botly-svg');
      if (svg) {
        svg.setAttribute('class', 'botly-svg ' + currentState);
      }
    }

    if (callbacks.onStateChange) callbacks.onStateChange(currentState);
  }

  /**
   * Set the speech bubble text.
   * @param {string} text
   */
  function setText(text) {
    currentText = text || '';
    const el = document.getElementById('botly-speech');
    if (el) {
      el.textContent = currentText;
    }
  }

  /**
   * Set Botly's expression (affects eyes/mouth via CSS).
   * @param {string} expr - 'neutral'|'happy'|'amazed'
   */
  function setExpression(expr) {
    currentExpression = expr || 'neutral';
    // Expression changes are handled by modifying eye/pupil rendering
    // For simplicity, we just track the expression
  }

  function onChange(cb) {
    callbacks.onStateChange = cb;
  }

  return {
    create,
    renderSVG,
    setState,
    setText,
    setExpression,
    onChange,
    getState: () => currentState,
    getText: () => currentText
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BotlyCharacter };
}
