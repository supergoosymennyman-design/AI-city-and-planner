/**
 * renderer.js — House SVG rendering system for K3-03 AI Architect
 *
 * Composes a child-like, hand-drawn style house from SVG shapes.
 * Each house part (roof, door, windows) is drawn with the child's
 * assigned shape and color.
 */

var HouseRenderer = (() => {
  'use strict';

  // Color hex lookup
  const COLOR_MAP = {
    red: '#FF6B6B',
    blue: '#4A90D9',
    yellow: '#FFD93D',
    green: '#6BCB77',
    orange: '#FF8C32',
    purple: '#C084FC'
  };

  // Part configuration: what shapes are valid per part
  const PART_SHAPES = {
    roof: ['triangle', 'star'],
    door: ['square', 'rectangle'],
    windows: ['circle', 'square']
  };

  // Default assignments
  const DEFAULTS = {
    roof: { shape: 'triangle', color: 'red' },
    door: { shape: 'square', color: 'blue' },
    windows: { shape: 'circle', color: 'yellow' }
  };

  /**
   * Validate that a shape+color assignment is valid for a given part.
   */
  function validateAssignment(part, shape, color) {
    if (!PART_SHAPES[part]) return false;
    if (!PART_SHAPES[part].includes(shape)) return false;
    if (!COLOR_MAP[color]) return false;
    return true;
  }

  /**
   * Render the full house scene as an SVG string.
   * @param {object} assignments - { roof: {shape, color}, door: ..., windows: ... }
   * @param {boolean} showLabels - Whether to add part labels
   * @returns {string} SVG markup
   */
  function renderHouse(assignments, showLabels = true) {
    const a = {
      roof: assignments.roof || DEFAULTS.roof,
      door: assignments.door || DEFAULTS.door,
      windows: assignments.windows || DEFAULTS.windows
    };

    const roofColor = COLOR_MAP[a.roof.color] || '#FF6B6B';
    const doorColor = COLOR_MAP[a.door.color] || '#4A90D9';
    const winColor = COLOR_MAP[a.windows.color] || '#FFD93D';

    // Build SVG parts
    const roofSVG = renderRoof(a.roof.shape, roofColor);
    const doorSVG = renderDoor(a.door.shape, doorColor);
    const windowsSVG = renderWindows(a.windows.shape, winColor);

    return `
      <svg viewBox="0 0 300 280" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;">
        <!-- Sky background -->
        <rect x="0" y="0" width="300" height="280" fill="#E8F4F8" rx="8"/>

        <!-- Ground -->
        <rect x="0" y="200" width="300" height="80" fill="#D4E8D0" rx="0"/>

        <!-- Sun -->
        <circle cx="250" cy="35" r="20" fill="#FFD93D" opacity="0.8"/>
        <line x1="250" y1="8" x2="250" y2="2" stroke="#FFD93D" stroke-width="2" stroke-linecap="round"/>
        <line x1="275" y1="20" x2="282" y2="15" stroke="#FFD93D" stroke-width="2" stroke-linecap="round"/>
        <line x1="278" y1="35" x2="285" y2="35" stroke="#FFD93D" stroke-width="2" stroke-linecap="round"/>

        <!-- House body -->
        <rect x="60" y="105" width="180" height="120" fill="#F5F0EB" stroke="#3D3D3D" stroke-width="2.5" rx="3"/>

        <!-- Roof -->
        ${roofSVG}

        <!-- Windows -->
        ${windowsSVG}

        <!-- Door -->
        ${doorSVG}

      </svg>
    `;
  }

  /**
   * Render the roof — triangle or star.
   */
  function renderRoof(shape, color) {
    if (shape === 'star') {
      return renderStarRoof(color);
    }
    // Triangle roof (default)
    return `
      <polygon points="150,20 40,108 260,108" fill="${color}" stroke="#3D3D3D" stroke-width="2.5"
        stroke-linejoin="round" opacity="0.95"/>
      <!-- Roof detail lines for hand-drawn feel -->
      <line x1="150" y1="20" x2="140" y2="108" stroke="rgba(0,0,0,0.08)" stroke-width="1.5" stroke-dasharray="4,4"/>
      <line x1="150" y1="20" x2="260" y2="108" stroke="rgba(0,0,0,0.08)" stroke-width="1.5" stroke-dasharray="4,4"/>
    `;
  }

  /**
   * Render a star-shaped roof.
   */
  function renderStarRoof(color) {
    // 5-pointed star centered above house
    const cx = 150, cy = 70, r1 = 50, r2 = 25;
    const pts = [];
    for (let i = 0; i < 5; i++) {
      const outerAngle = (i * 2 * Math.PI / 5) - Math.PI / 2;
      const innerAngle = outerAngle + Math.PI / 5;
      pts.push(`${cx + r1 * Math.cos(outerAngle)},${cy + r1 * Math.sin(outerAngle)}`);
      pts.push(`${cx + r2 * Math.cos(innerAngle)},${cy + r2 * Math.sin(innerAngle)}`);
    }
    const starPoints = pts.join(' ');

    return `
      <polygon points="${starPoints}" fill="${color}" stroke="#3D3D3D" stroke-width="2.5"
        stroke-linejoin="round" opacity="0.95"/>
      <!-- Star center detail -->
      <polygon points="${starPoints}" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="1" stroke-dasharray="3,3"/>
    `;
  }

  /**
   * Render the door — square or rectangle.
   */
  function renderDoor(shape, color) {
    if (shape === 'square') {
      return `
        <rect x="120" y="155" width="60" height="70" rx="3" fill="${color}" stroke="#3D3D3D" stroke-width="2.5"/>
        <!-- Door knob -->
        <circle cx="165" cy="192" r="4" fill="#3D3D3D" opacity="0.6"/>
        <!-- Door panel lines -->
        <rect x="128" y="165" width="44" height="22" rx="2" fill="none" stroke="rgba(0,0,0,0.12)" stroke-width="1.5"/>
        <rect x="128" y="193" width="44" height="22" rx="2" fill="none" stroke="rgba(0,0,0,0.12)" stroke-width="1.5"/>
      `;
    }
    // Rectangle door
    return `
      <rect x="114" y="145" width="72" height="80" rx="3" fill="${color}" stroke="#3D3D3D" stroke-width="2.5"/>
      <!-- Door knob -->
      <circle cx="173" cy="188" r="4" fill="#3D3D3D" opacity="0.6"/>
      <!-- Door panel lines -->
      <rect x="122" y="155" width="56" height="26" rx="2" fill="none" stroke="rgba(0,0,0,0.12)" stroke-width="1.5"/>
      <rect x="122" y="187" width="56" height="28" rx="2" fill="none" stroke="rgba(0,0,0,0.12)" stroke-width="1.5"/>
    `;
  }

  /**
   * Render windows — pair of circles or squares.
   */
  function renderWindows(shape, color) {
    if (shape === 'circle') {
      return `
        <!-- Left window -->
        <circle cx="100" cy="145" r="18" fill="${color}" stroke="#3D3D3D" stroke-width="2.5"/>
        <line x1="100" y1="127" x2="100" y2="163" stroke="#3D3D3D" stroke-width="1.5" opacity="0.5"/>
        <line x1="82" y1="145" x2="118" y2="145" stroke="#3D3D3D" stroke-width="1.5" opacity="0.5"/>

        <!-- Right window -->
        <circle cx="200" cy="145" r="18" fill="${color}" stroke="#3D3D3D" stroke-width="2.5"/>
        <line x1="200" y1="127" x2="200" y2="163" stroke="#3D3D3D" stroke-width="1.5" opacity="0.5"/>
        <line x1="182" y1="145" x2="218" y2="145" stroke="#3D3D3D" stroke-width="1.5" opacity="0.5"/>

        <!-- Window sills -->
        <line x1="80" y1="165" x2="120" y2="165" stroke="#3D3D3D" stroke-width="2" stroke-linecap="round"/>
        <line x1="180" y1="165" x2="220" y2="165" stroke="#3D3D3D" stroke-width="2" stroke-linecap="round"/>
      `;
    }
    // Square windows
    return `
      <!-- Left window -->
      <rect x="82" y="127" width="36" height="36" rx="3" fill="${color}" stroke="#3D3D3D" stroke-width="2.5"/>
      <line x1="100" y1="127" x2="100" y2="163" stroke="#3D3D3D" stroke-width="1.5" opacity="0.5"/>
      <line x1="82" y1="145" x2="118" y2="145" stroke="#3D3D3D" stroke-width="1.5" opacity="0.5"/>

      <!-- Right window -->
      <rect x="182" y="127" width="36" height="36" rx="3" fill="${color}" stroke="#3D3D3D" stroke-width="2.5"/>
      <line x1="200" y1="127" x2="200" y2="163" stroke="#3D3D3D" stroke-width="1.5" opacity="0.5"/>
      <line x1="182" y1="145" x2="218" y2="145" stroke="#3D3D3D" stroke-width="1.5" opacity="0.5"/>

      <!-- Window sills -->
      <line x1="80" y1="165" x2="120" y2="165" stroke="#3D3D3D" stroke-width="2" stroke-linecap="round"/>
      <line x1="180" y1="165" x2="220" y2="165" stroke="#3D3D3D" stroke-width="2" stroke-linecap="round"/>
    `;
  }

  /**
   * Render a simple house outline (for Part B — empty parts).
   * Highlights one part with a glow/pulse.
   * @param {string|null} highlightPart - 'roof'|'door'|'windows'|null
   * @param {object|null} partialAssignments - Current assignments to show
   * @returns {string} SVG markup
   */
  function renderOutline(highlightPart, partialAssignments) {
    const a = {
      roof: partialAssignments?.roof || null,
      door: partialAssignments?.door || null,
      windows: partialAssignments?.windows || null
    };

    return `
      <svg viewBox="0 0 300 280" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;">
        <!-- Sky background -->
        <rect x="0" y="0" width="300" height="280" fill="#E8F4F8" rx="8"/>

        <!-- Ground -->
        <rect x="0" y="200" width="300" height="80" fill="#D4E8D0" rx="0"/>

        <!-- House body outline -->
        <rect x="60" y="105" width="180" height="120" fill="#F5F0EB" stroke="#3D3D3D" stroke-width="2.5" rx="3" stroke-dasharray="${a.roof ? '' : '6,4'}" opacity="0.5"/>

        <!-- Roof -->
        ${a.roof
          ? renderRoof(a.roof.shape, COLOR_MAP[a.roof.color])
          : `<polygon points="150,20 40,108 260,108" fill="none" stroke="#3D3D3D" stroke-width="2.5" stroke-dasharray="6,4" stroke-linejoin="round" opacity="0.5"/>`
        }

        <!-- Windows -->
        ${a.windows
          ? renderWindows(a.windows.shape, COLOR_MAP[a.windows.color])
          : `<!-- Window outlines -->
             <rect x="80" y="125" width="40" height="40" rx="5" fill="none" stroke="#3D3D3D" stroke-width="2" stroke-dasharray="4,4" opacity="0.5"/>
             <rect x="180" y="125" width="40" height="40" rx="5" fill="none" stroke="#3D3D3D" stroke-width="2" stroke-dasharray="4,4" opacity="0.5"/>`
        }

        <!-- Door -->
        ${a.door
          ? renderDoor(a.door.shape, COLOR_MAP[a.door.color])
          : `<rect x="115" y="150" width="70" height="75" rx="4" fill="none" stroke="#3D3D3D" stroke-width="2" stroke-dasharray="4,4" opacity="0.5"/>`
        }

        ${highlightPart === 'roof' ? '<rect x="35" y="15" width="230" height="100" fill="none" stroke="var(--accent-coral)" stroke-width="3" stroke-dasharray="8,4" rx="4" opacity="0.7"><animate attributeName="opacity" values="0.3;0.8;0.3" dur="1.5s" repeatCount="indefinite"/></rect>' : ''}
        ${highlightPart === 'windows' ? '<rect x="72" y="118" width="156" height="72" fill="none" stroke="var(--accent-coral)" stroke-width="3" stroke-dasharray="8,4" rx="4" opacity="0.7"><animate attributeName="opacity" values="0.3;0.8;0.3" dur="1.5s" repeatCount="indefinite"/></rect>' : ''}
        ${highlightPart === 'door' ? '<rect x="108" y="143" width="84" height="88" fill="none" stroke="var(--accent-coral)" stroke-width="3" stroke-dasharray="8,4" rx="4" opacity="0.7"><animate attributeName="opacity" values="0.3;0.8;0.3" dur="1.5s" repeatCount="indefinite"/></rect>' : ''}
      </svg>
    `;
  }

  /**
   * Render a single shape icon for selection UI.
   * @param {string} shape - 'circle'|'square'|'triangle'|'star'|'rectangle'
   * @param {string} [color] - Fill color (default #3D3D3D)
   * @returns {string} SVG markup
   */
  function renderShapeIcon(shape, color) {
    const fill = color || '#3D3D3D';
    const stroke = '#3D3D3D';
    const sw = 2.5;

    switch (shape) {
      case 'circle':
        return `<svg viewBox="0 0 64 64" width="100%" height="100%"><circle cx="32" cy="32" r="24" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/></svg>`;
      case 'square':
        return `<svg viewBox="0 0 64 64" width="100%" height="100%"><rect x="8" y="8" width="48" height="48" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/></svg>`;
      case 'triangle':
        return `<svg viewBox="0 0 64 64" width="100%" height="100%"><polygon points="32,4 8,58 56,58" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/></svg>`;
      case 'star':
        return `<svg viewBox="0 0 64 64" width="100%" height="100%"><polygon points="32,2 40,22 62,24 46,38 50,60 32,48 14,60 18,38 2,24 24,22" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/></svg>`;
      case 'rectangle':
        return `<svg viewBox="0 0 64 64" width="100%" height="100%"><rect x="6" y="12" width="52" height="40" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/></svg>`;
      default:
        return `<svg viewBox="0 0 64 64" width="100%" height="100%"><rect x="8" y="8" width="48" height="48" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/></svg>`;
    }
  }

  /**
   * Render a color swatch icon.
   * @param {string} color - color name key
   * @returns {string} Hex color
   */
  function getColorHex(colorName) {
    return COLOR_MAP[colorName] || '#999';
  }

  return {
    COLOR_MAP,
    PART_SHAPES,
    DEFAULTS,
    validateAssignment,
    renderHouse,
    renderOutline,
    renderShapeIcon,
    getColorHex
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { HouseRenderer };
}
