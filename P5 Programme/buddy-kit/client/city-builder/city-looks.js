// City Style is deliberately separate from time. A child can make the same
// city look like a toy, a storybook, a real place or a future city without
// accidentally selecting a daylight sky with night lighting.
import { currentLang } from './i18n.js';

export const CITY_LOOK_KEY = 'p5_city_look_v1';
export const DEFAULT_CITY_LOOK = 'natural';

const naturalSkies = Object.freeze({
  morning: 'assets/environment/qwantani-dawn-sky.jpg',
  day: 'assets/environment/kloppenheim-03-sky.jpg',
  sunset: 'assets/environment/wasteland-golden-sky.jpg',
  night: 'assets/environment/kloppenheim-night-sky.jpg',
});
const naturalDesktopSkies = Object.freeze(Object.fromEntries(Object.entries(naturalSkies)
  .map(([time, file]) => [time, file.replace('-sky.jpg', '-sky-4k.jpg')])));

export const CITY_LOOKS = Object.freeze({
  natural: { icon: '🌿', en: 'Natural City', zh: '自然城市', horizon: 0xb9dce4, sky: 0x5d9fce, horizonMix: .08, skyMix: .08, bloomScale: .82, saturation: 1, vignette: 0, grade: '#ffffff', contrast: 1, realistic: true, skies: naturalSkies, desktopSkies: naturalDesktopSkies },
  'toy-town': { icon: '🧸', en: 'Toy Town', zh: '玩具城市', horizon: 0xc7dce2, sky: 0x79add0, horizonMix: .34, skyMix: .26, bloomScale: .55, saturation: 1.12, vignette: -.03, grade: '#fff1d1', contrast: .92, realistic: false },
  storybook: { icon: '📖', en: 'Storybook', zh: '故事城市', horizon: 0xe2cdb7, sky: 0x91b8d0, horizonMix: .28, skyMix: .20, bloomScale: .72, saturation: .96, vignette: .01, grade: '#ffe3c5', contrast: .94, realistic: false },
  future: { icon: '🚀', en: 'Future City', zh: '未來城市', horizon: 0x607a99, sky: 0x355f91, horizonMix: .42, skyMix: .46, bloomScale: 1.18, saturation: 1.08, vignette: .05, grade: '#b7e9ff', contrast: 1.08, realistic: false },
});

const LEGACY_LOOKS = new Set(['dawn', 'blue', 'azure', 'bluebird', 'clouds', 'overcast', 'golden', 'moonlit']);
export function validCityLook(id) { return Object.hasOwn(CITY_LOOKS, id) ? id : (LEGACY_LOOKS.has(id) ? 'natural' : DEFAULT_CITY_LOOK); }
export function legacyTimeForLook(id) { return ({ dawn: 'morning', golden: 'sunset', moonlit: 'night' })[id] || 'day'; }
export function readCityLook(storage = globalThis.localStorage) {
  try { return validCityLook(storage?.getItem(CITY_LOOK_KEY)); } catch { return DEFAULT_CITY_LOOK; }
}
export function cityLookName(id, lang = currentLang()) {
  const look = CITY_LOOKS[validCityLook(id)];
  return lang === 'zh-Hant' ? look.zh : look.en;
}

export function mountCityLookPicker({ initial = readCityLook(), onChange = () => {} } = {}) {
  let selected = validCityLook(initial);
  const button = document.createElement('button');
  button.type = 'button'; button.id = 'city-look'; button.className = 'city-look';
  const panel = document.createElement('section');
  panel.className = 'city-look-panel'; panel.hidden = true;
  panel.setAttribute('aria-label', 'City Look');
  panel.innerHTML = '<div class="city-look-heading"><strong></strong><button type="button" aria-label="Close">×</button></div><div class="city-look-grid"></div>';
  const title = panel.querySelector('strong'), close = panel.querySelector('button'), grid = panel.querySelector('.city-look-grid');
  document.body.append(button, panel);
  const label = () => {
    const zh = currentLang() === 'zh-Hant';
    button.textContent = `${CITY_LOOKS[selected].icon} ${zh ? '城市風格' : 'City Look'}`;
    button.setAttribute('aria-label', `${zh ? '城市風格' : 'City Look'}: ${cityLookName(selected)}.`);
    title.textContent = zh ? '選擇城市風格' : 'Choose a City Look';
    close.setAttribute('aria-label', zh ? '關閉' : 'Close');
  };
  const draw = () => {
    grid.innerHTML = Object.entries(CITY_LOOKS).map(([id, look]) => `<button type="button" class="city-look-card${id === selected ? ' is-selected' : ''}" data-look="${id}" aria-pressed="${id === selected}">${look.preview ? `<img src="${look.preview}" alt="" loading="lazy">` : `<span class="city-look-toy">${look.icon}</span>`}<span>${look.icon} ${cityLookName(id)}</span></button>`).join('');
  };
  const open = () => { panel.hidden = false; draw(); };
  const dismiss = () => { panel.hidden = true; button.focus(); };
  button.addEventListener('click', open); close.addEventListener('click', dismiss);
  panel.addEventListener('click', event => {
    const card = event.target.closest('[data-look]'); if (!card) return;
    selected = validCityLook(card.dataset.look);
    try { localStorage.setItem(CITY_LOOK_KEY, selected); } catch { /* storage is optional */ }
    label(); onChange(selected); dismiss();
  });
  const onLanguageChange = () => { label(); draw(); };
  const onKeyDown = event => { if (event.key === 'Escape' && !panel.hidden) dismiss(); };
  window.addEventListener('i18n:change', onLanguageChange);
  window.addEventListener('keydown', onKeyDown);
  label();
  return { get id() { return selected; }, set(id) { selected = validCityLook(id); label(); }, destroy() { window.removeEventListener('i18n:change', onLanguageChange); window.removeEventListener('keydown', onKeyDown); button.remove(); panel.remove(); } };
}
