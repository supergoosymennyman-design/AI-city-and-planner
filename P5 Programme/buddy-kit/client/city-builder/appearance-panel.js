import { CITY_LOOKS, cityLookName, validCityLook } from './city-looks.js';
import { GROUND_TEXTURES, groundTextureName, validGroundTexture } from './ground-textures.js';
import { DAY_SKIES, daySkyName, validDaySky } from './day-skies.js';
import { TIME_ORDER, TIME_PRESETS, validTime } from '../city-common/time-of-day.js';
import { currentLang } from './i18n.js';

const local = (en, zh) => currentLang() === 'zh-Hant' ? zh : en;
export function mountAppearancePanel({ style, ground, time, daySky, onStyle, onGround, onTime, onDaySky } = {}) {
  let state = { style: validCityLook(style), ground: validGroundTexture(ground), time: validTime(time), daySky: validDaySky(daySky) };
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'appearance-toggle'; button.id = 'appearance-toggle';
  const panel = document.createElement('section');
  panel.className = 'appearance-panel'; panel.hidden = true; panel.setAttribute('aria-label', 'Appearance');
  document.body.append(button, panel);
  const render = () => {
    button.textContent = `🎨 ${local('Appearance', '外觀')}`;
    const skyLabel = state.style === 'natural' ? `, ${daySkyName(state.daySky)}` : '';
    button.setAttribute('aria-label', `${local('Appearance', '外觀')}: ${cityLookName(state.style)}${skyLabel}, ${groundTextureName(state.ground)}, ${local(TIME_PRESETS[state.time].en, TIME_PRESETS[state.time].zh)}.`);
    panel.innerHTML = `<header class="appearance-heading"><strong>${local('Make your city yours', '打造你的城市')}</strong><button type="button" aria-label="${local('Close', '關閉')}">×</button></header>
      <p>${local('Style changes the artistic world. Ground and time keep your city readable.', '風格改變城市的藝術世界；地面和時間讓你的城市保持清晰易讀。')}</p>
      <h2>${local('City style', '城市風格')}</h2><div class="appearance-style-grid">${Object.entries(CITY_LOOKS).map(([id, item]) => `<button type="button" class="appearance-style${id === state.style ? ' is-selected' : ''}" data-style="${id}" aria-pressed="${id === state.style}"><i class="style-${id}">${item.icon}</i><span>${cityLookName(id)}</span></button>`).join('')}</div>
      ${state.style === 'natural' ? `<h2>${local('Day sky', '日間天空')}</h2><p class="appearance-sky-note">${local('Used when Time is Day. Other times keep their matching sky.', '在「日間」時使用；其他時間保留對應的天空。')}</p><div class="appearance-day-sky-grid">${Object.entries(DAY_SKIES).map(([id, item]) => `<button type="button" class="appearance-day-sky${id === state.daySky ? ' is-selected' : ''}" data-day-sky="${id}" aria-pressed="${id === state.daySky}"><img src="${item.preview}" alt="" loading="lazy"><span>${item.icon} ${daySkyName(id)}</span></button>`).join('')}</div>` : ''}
      <h2>${local('Open ground', '空地材質')}</h2><div class="appearance-ground-grid">${Object.entries(GROUND_TEXTURES).map(([id, item]) => `<button type="button" class="appearance-ground${id === state.ground ? ' is-selected' : ''}" data-ground="${id}" aria-pressed="${id === state.ground}"><i class="ground-${id}"></i><span>${item.icon} ${groundTextureName(id)}</span></button>`).join('')}</div>
      <h2>${local('Time', '時間')}</h2><div class="appearance-time-grid">${TIME_ORDER.map(id => { const item = TIME_PRESETS[id]; return `<button type="button" class="appearance-time${id === state.time ? ' is-selected' : ''}" data-time="${id}" aria-pressed="${id === state.time}">${item.icon}<span>${local(item.en, item.zh)}</span></button>`; }).join('')}</div>`;
  };
  const close = () => { panel.hidden = true; button.focus(); };
  button.addEventListener('click', () => { panel.hidden = !panel.hidden; if (!panel.hidden) render(); });
  panel.addEventListener('click', event => {
    if (event.target.closest('.appearance-heading button')) return close();
    const target = event.target.closest('[data-style],[data-ground],[data-time],[data-day-sky]'); if (!target) return;
    if (target.dataset.style) { state.style = validCityLook(target.dataset.style); onStyle?.(state.style); }
    if (target.dataset.ground) { state.ground = validGroundTexture(target.dataset.ground); onGround?.(state.ground); }
    if (target.dataset.time) { state.time = validTime(target.dataset.time); onTime?.(state.time); }
    if (target.dataset.daySky) { state.daySky = validDaySky(target.dataset.daySky); onDaySky?.(state.daySky); }
    render();
  });
  const language = render, keydown = event => { if (event.key === 'Escape' && !panel.hidden) close(); };
  window.addEventListener('i18n:change', language); window.addEventListener('keydown', keydown); render();
  return { set(next = {}) { state = { ...state, ...next }; render(); }, destroy() { window.removeEventListener('i18n:change', language); window.removeEventListener('keydown', keydown); button.remove(); panel.remove(); } };
}
