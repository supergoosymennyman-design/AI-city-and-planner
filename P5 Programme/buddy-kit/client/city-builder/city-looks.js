// Child-facing environment choices. These deliberately affect the setting, not
// the city a child built: a saved layout must look like the same city in every
// look and remain easy to inspect for the AI-literacy activities.
import { currentLang } from './i18n.js';

export const CITY_LOOK_KEY = 'p5_city_look_v1';

export const CITY_LOOKS = Object.freeze({
  'toy-town': { icon: '🧸', en: 'Toy Town', zh: '玩具城市', preview: null, horizon: 0xc4aaa0, sky: 0x6c7d9a, realistic: false },
  dawn: { icon: '🌅', en: 'Soft Dawn', zh: '柔和清晨', preview: 'assets/environment/qwantani-dawn.png', skyFile: 'assets/environment/qwantani-dawn-sky.jpg', skyDesktopFile: 'assets/environment/qwantani-dawn-sky-4k.jpg', horizon: 0xe5c7a9, sky: 0x87a8c8, realistic: true },
  blue: { icon: '☀️', en: 'Clear Blue Day', zh: '晴朗藍天', preview: 'assets/environment/kloppenheim-03.png', skyFile: 'assets/environment/kloppenheim-03-sky.jpg', skyDesktopFile: 'assets/environment/kloppenheim-03-sky-4k.jpg', horizon: 0xb9dce4, sky: 0x4f94c6, realistic: true },
  azure: { icon: '💠', en: 'Crisp Azure', zh: '清澈湛藍', preview: 'assets/environment/kloppenheim-03.png', skyFile: 'assets/environment/kloppenheim-03-sky.jpg', skyDesktopFile: 'assets/environment/kloppenheim-03-sky-4k.jpg', horizon: 0xc6e4eb, sky: 0x3c91d0, equirectSaturation: 1.14, equirectContrast: 1.06, realistic: true },
  bluebird: { icon: '🪁', en: 'Bluebird Sky', zh: '蔚藍晴空', preview: 'assets/environment/qwantani-dawn.png', skyFile: 'assets/environment/qwantani-dawn-sky.jpg', skyDesktopFile: 'assets/environment/qwantani-dawn-sky-4k.jpg', horizon: 0xc8dfdf, sky: 0x4c9ed0, equirectSaturation: 1.10, equirectContrast: 1.05, realistic: true },
  clouds: { icon: '🌤️', en: 'Bright Clouds', zh: '明亮雲朵', preview: 'assets/environment/kloofendal-clouds.png', skyFile: 'assets/environment/kloofendal-clouds-sky.jpg', skyDesktopFile: 'assets/environment/kloofendal-clouds-sky-4k.jpg', horizon: 0xc8d9df, sky: 0x789ec0, realistic: true },
  overcast: { icon: '☁️', en: 'Calm Overcast', zh: '寧靜陰天', preview: 'assets/environment/kloofendal-overcast.png', skyFile: 'assets/environment/kloofendal-overcast-sky.jpg', skyDesktopFile: 'assets/environment/kloofendal-overcast-sky-4k.jpg', horizon: 0xb5c2c9, sky: 0x718497, realistic: true },
  golden: { icon: '🌇', en: 'Golden Hour', zh: '金色時刻', preview: 'assets/environment/wasteland-golden.png', skyFile: 'assets/environment/wasteland-golden-sky.jpg', skyDesktopFile: 'assets/environment/wasteland-golden-sky-4k.jpg', horizon: 0xd3ad8d, sky: 0x8c84a1, realistic: true },
  moonlit: { icon: '🌙', en: 'Moonlit City', zh: '月夜城市', preview: 'assets/environment/kloppenheim-night.png', skyFile: 'assets/environment/kloppenheim-night-sky.jpg', skyDesktopFile: 'assets/environment/kloppenheim-night-sky-4k.jpg', horizon: 0x45566b, sky: 0x1b3151, realistic: true },
});

export function validCityLook(id) { return Object.hasOwn(CITY_LOOKS, id) ? id : 'toy-town'; }
export function readCityLook(storage = globalThis.localStorage) {
  try { return validCityLook(storage?.getItem(CITY_LOOK_KEY)); } catch { return 'toy-town'; }
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
