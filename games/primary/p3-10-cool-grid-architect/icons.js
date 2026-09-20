/**
 * icons.js — SVG building icons for the item palette and UI.
 * The 3D grid uses GLB models; these SVGs are for the side palette,
 * feedback messages, and meter labels.
 */
const Icons = window.Icons = {
  DATA_CENTER: () => `<svg viewBox="0 0 40 40" width="34" height="34" aria-hidden="true">
    <rect x="6" y="8" width="28" height="24" rx="3" fill="#4A90D9"/>
    <rect x="10" y="12" width="20" height="3" fill="#2C5F8A"/>
    <rect x="10" y="18" width="20" height="3" fill="#2C5F8A"/>
    <rect x="10" y="24" width="20" height="3" fill="#2C5F8A"/>
    <circle cx="13" cy="13.5" r="1.2" fill="#7CFC00"/>
    <circle cx="13" cy="19.5" r="1.2" fill="#7CFC00"/>
    <circle cx="13" cy="25.5" r="1.2" fill="#7CFC00"/>
    <rect x="12" y="4" width="4" height="4" rx="1" fill="#5FA8E8"/>
    <rect x="24" y="4" width="4" height="4" rx="1" fill="#5FA8E8"/>
  </svg>`,
  SOLAR_PANEL: () => `<svg viewBox="0 0 40 40" width="34" height="34" aria-hidden="true">
    <rect x="8" y="10" width="24" height="14" rx="2" fill="#1E3A5F"/>
    <line x1="14" y1="10" x2="14" y2="24" stroke="#3B82F6" stroke-width="1.5"/>
    <line x1="20" y1="10" x2="20" y2="24" stroke="#3B82F6" stroke-width="1.5"/>
    <line x1="26" y1="10" x2="26" y2="24" stroke="#3B82F6" stroke-width="1.5"/>
    <line x1="8" y1="15" x2="32" y2="15" stroke="#3B82F6" stroke-width="1.5"/>
    <line x1="8" y1="20" x2="32" y2="20" stroke="#3B82F6" stroke-width="1.5"/>
    <circle cx="20" cy="30" r="4" fill="#F59E0B"/>
    <circle cx="20" cy="30" r="2" fill="#FFD166"/>
    <line x1="6" y1="27" x2="12" y2="27" stroke="#F59E0B" stroke-width="2"/>
    <line x1="28" y1="27" x2="34" y2="27" stroke="#F59E0B" stroke-width="2"/>
  </svg>`,
  WIND_TURBINE: () => `<svg viewBox="0 0 40 40" width="34" height="34" aria-hidden="true">
    <rect x="18.5" y="6" width="3" height="26" fill="#8A9BA8"/>
    <rect x="15" y="4" width="10" height="4" rx="1.5" fill="#D7E3EC"/>
    <path d="M20 6 L28 2 L26 8 Z" fill="#BFD8E8"/>
    <path d="M20 6 L12 2 L14 8 Z" fill="#BFD8E8"/>
    <path d="M20 6 L24 14 L18 12 Z" fill="#BFD8E8"/>
    <circle cx="20" cy="6" r="1.8" fill="#4A90D9"/>
  </svg>`,
  BATTERY: () => `<svg viewBox="0 0 40 40" width="34" height="34" aria-hidden="true">
    <rect x="6" y="10" width="28" height="18" rx="4" fill="#22C55E"/>
    <rect x="10" y="14" width="6" height="10" rx="1" fill="#86EFAC"/>
    <rect x="18" y="14" width="6" height="10" rx="1" fill="#86EFAC"/>
    <rect x="26" y="14" width="6" height="10" rx="1" fill="#4ADE80"/>
    <rect x="16" y="5" width="8" height="5" rx="2" fill="#15803D"/>
    <circle cx="20" cy="30" r="2" fill="#22C55E"/>
  </svg>`,
  COOLING_TOWER: () => `<svg viewBox="0 0 40 40" width="34" height="34" aria-hidden="true">
    <path d="M8 32 Q14 18 20 18 Q26 18 32 32 Z" fill="#A5C8E0"/>
    <path d="M14 32 Q16 24 20 24 Q24 24 26 32 Z" fill="#D6E8F4"/>
    <ellipse cx="20" cy="16" rx="5" ry="2" fill="#E8F4FB"/>
    <path d="M17 15 Q20 10 23 15" fill="none" stroke="#B8D8E8" stroke-width="1.5"/>
    <rect x="4" y="31" width="32" height="3" rx="1" fill="#7A93A5"/>
  </svg>`,
  CITY: () => `<svg viewBox="0 0 40 40" width="30" height="30" aria-hidden="true">
    <rect x="4" y="14" width="10" height="18" fill="#6C7A89"/>
    <rect x="16" y="8" width="12" height="24" fill="#7A8896"/>
    <rect x="30" y="18" width="7" height="14" fill="#5D6B79"/>
    <rect x="7" y="18" width="4" height="3" fill="#FFD166"/>
    <rect x="19" y="12" width="4" height="3" fill="#FFD166"/>
    <rect x="19" y="20" width="4" height="3" fill="#FFD166"/>
    <rect x="32" y="22" width="3" height="3" fill="#FFD166"/>
  </svg>`,
};

/** Terrain icons (small, for meter labels / feedback) */
const TerrainIcons = window.TerrainIcons = {
  MOUNTAIN: '🏔️', RIVER: '🌊', DESERT: '☀️', CITY: '🏢', FOREST: '🌲', PLAINS: '🌾'
};
