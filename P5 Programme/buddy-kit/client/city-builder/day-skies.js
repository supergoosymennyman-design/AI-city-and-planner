import { currentLang } from './i18n.js';

export const DAY_SKY_KEY = 'p5_city_day_sky_v1';
export const DEFAULT_DAY_SKY = 'natural-blue';

// Day skies are deliberately separate from City Style and Time. They only
// replace Natural City's daytime panorama; morning, sunset and night retain
// their purpose-matched sky and lighting presets.
export const DAY_SKIES = Object.freeze({
  'natural-blue': Object.freeze({
    en: 'Natural Blue', zh: '自然藍天', icon: '☀️',
    preview: 'assets/environment/kloppenheim-03.png',
    skyFile: 'assets/environment/kloppenheim-03-sky.jpg',
    desktopSkyFile: 'assets/environment/kloppenheim-03-sky-4k.jpg',
    horizon: 0xb9dce4, sky: 0x5d9fce,
  }),
  'clear-blue': Object.freeze({
    en: 'Clear Blue', zh: '晴朗藍天', icon: '💠',
    preview: 'assets/environment/qwantani-clear.png',
    skyFile: 'assets/environment/qwantani-clear-sky.jpg',
    desktopSkyFile: 'assets/environment/qwantani-clear-sky-4k.jpg',
    horizon: 0xc8dfdf, sky: 0x4c9ed0, equirectSaturation: 1.08, equirectContrast: 1.04,
  }),
  'bright-clouds': Object.freeze({
    en: 'Bright Clouds', zh: '明亮雲朵', icon: '🌤️',
    preview: 'assets/environment/kloofendal-clouds.png',
    skyFile: 'assets/environment/kloofendal-clouds-sky.jpg',
    desktopSkyFile: 'assets/environment/kloofendal-clouds-sky-4k.jpg',
    horizon: 0xc8d9df, sky: 0x789ec0,
  }),
  'calm-overcast': Object.freeze({
    en: 'Calm Overcast', zh: '寧靜陰天', icon: '☁️',
    preview: 'assets/environment/kloofendal-overcast.png',
    skyFile: 'assets/environment/kloofendal-overcast-sky.jpg',
    desktopSkyFile: 'assets/environment/kloofendal-overcast-sky-4k.jpg',
    horizon: 0xb5c2c9, sky: 0x718497,
  }),
});

export function validDaySky(id) {
  return Object.hasOwn(DAY_SKIES, id) ? id : DEFAULT_DAY_SKY;
}

export function readDaySky(storage = globalThis.localStorage) {
  try { return validDaySky(storage?.getItem(DAY_SKY_KEY)); }
  catch { return DEFAULT_DAY_SKY; }
}

export function daySkyName(id, lang = currentLang()) {
  const sky = DAY_SKIES[validDaySky(id)];
  return lang === 'zh-Hant' ? sky.zh : sky.en;
}
