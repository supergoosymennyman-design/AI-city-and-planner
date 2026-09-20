import { currentLang } from './i18n.js';

export const GROUND_TEXTURE_KEY = 'p5_city_ground_texture_v1';
export const GROUND_TEXTURES = Object.freeze({
  leafy: { icon: '🌿', en: 'Leafy Grass', zh: '茂密草地', files: ['leafy_grass_diff_1k.jpg', 'leafy_grass_nor_gl_1k.jpg', 'leafy_grass_rough_1k.jpg'] },
  sparse: { icon: '🍂', en: 'Sparse Grass', zh: '疏落草地', files: ['sparse_grass_diff_1k.jpg', 'sparse_grass_nor_gl_1k.jpg', 'sparse_grass_rough_1k.jpg'] },
  withered: { icon: '🌾', en: 'Withered Grass', zh: '枯草地', files: ['withered_grass_diff_1k.jpg', 'withered_grass_nor_gl_1k.jpg', 'withered_grass_rough_1k.jpg'] },
  pavers: { icon: '🪨', en: 'Urban Gravel', zh: '城市碎石', files: ['gravel_floor_03_diff_1k.jpg', 'gravel_floor_03_nor_gl_1k.jpg', 'gravel_floor_03_rough_1k.jpg'] },
  asphalt: { icon: '🛣️', en: 'City Asphalt', zh: '城市瀝青', files: ['ground-asphalt.jpg', 'aerial_asphalt_01_nor_gl_1k.jpg', 'aerial_asphalt_01_rough_1k.jpg'] },
});
export function validGroundTexture(id) { return Object.hasOwn(GROUND_TEXTURES, id) ? id : 'leafy'; }
export function readGroundTexture(storage = globalThis.localStorage) { try { return validGroundTexture(storage?.getItem(GROUND_TEXTURE_KEY)); } catch { return 'leafy'; } }
function name(id) { const item = GROUND_TEXTURES[validGroundTexture(id)]; return currentLang() === 'zh-Hant' ? item.zh : item.en; }

export function mountGroundTexturePicker({ initial = readGroundTexture(), onChange = () => {} } = {}) {
  let selected = validGroundTexture(initial);
  const button = document.createElement('button'); button.type = 'button'; button.id = 'ground-texture'; button.className = 'ground-texture';
  const panel = document.createElement('section'); panel.className = 'ground-texture-panel'; panel.hidden = true; panel.setAttribute('aria-label', 'Ground Texture');
  panel.innerHTML = '<div class="ground-texture-heading"><strong></strong><button type="button" aria-label="Close">×</button></div><div class="ground-texture-grid"></div>';
  const title = panel.querySelector('strong'), close = panel.querySelector('button'), grid = panel.querySelector('.ground-texture-grid'); document.body.append(button, panel);
  const label = () => { const zh = currentLang() === 'zh-Hant'; button.textContent = `${GROUND_TEXTURES[selected].icon} ${zh ? '地面材質' : 'Ground Texture'}`; button.setAttribute('aria-label', `${zh ? '地面材質' : 'Ground Texture'}: ${name(selected)}.`); title.textContent = zh ? '選擇地面材質' : 'Choose a Ground Texture'; close.setAttribute('aria-label', zh ? '關閉' : 'Close'); };
  const draw = () => { grid.innerHTML = Object.entries(GROUND_TEXTURES).map(([id, item]) => `<button type="button" class="ground-texture-card${id === selected ? ' is-selected' : ''}" data-ground-texture="${id}" aria-pressed="${id === selected}"><span>${item.icon}</span><strong>${name(id)}</strong></button>`).join(''); };
  const dismiss = () => { panel.hidden = true; button.focus(); }; button.onclick = () => { panel.hidden = false; draw(); }; close.onclick = dismiss;
  panel.addEventListener('click', event => { const card = event.target.closest('[data-ground-texture]'); if (!card) return; selected = validGroundTexture(card.dataset.groundTexture); try { localStorage.setItem(GROUND_TEXTURE_KEY, selected); } catch {} label(); onChange(selected); dismiss(); });
  const language = () => { label(); draw(); }, keydown = event => { if (event.key === 'Escape' && !panel.hidden) dismiss(); }; window.addEventListener('i18n:change', language); window.addEventListener('keydown', keydown); label();
  return { get id() { return selected; }, set(id) { selected = validGroundTexture(id); label(); }, destroy() { window.removeEventListener('i18n:change', language); window.removeEventListener('keydown', keydown); button.remove(); panel.remove(); } };
}
