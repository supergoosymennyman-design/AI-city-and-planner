// i18n.js — tiny en/zh-Hant dictionary for the simulation HUD chrome.
//
// Reusable + buildless (copy-verbatim like crash-guard.js / prop-library.js).
// Mission cards and building labels are already bilingual; this covers the
// remaining HUD chrome (panels, buttons, toasts, coach). Defaults to the
// browser locale (zh → Traditional Chinese, otherwise English); a small toggle
// button (中 / EN) in the HUD flips and persists the choice.
//
// Usage:
//   import { initI18n, applyStatic, t } from './i18n.js';
//   initI18n();            // once, at boot
//   applyStatic();         // localize stable HTML chrome (skins, missions…)
//   t('props.title')       // → "Model library" or "模型庫"
export const LANG_KEY = 'hk_ai_city_lang_v1';

export const DICT = {
  en: {
    'common.gotIt': 'Got it',
    'common.skip': 'Skip',
    'common.letsGo': 'Let\u2019s go!',
    'common.done': 'Done',
    'common.rotate': 'Rotate',
    'common.undo': 'Undo',
    'common.place': 'Place',
    'common.start': 'Start',
    'common.accept': 'Accept',
    'common.cancel': 'Cancel',
    'hud.champion': 'Champion',
    'hud.home': 'Back to My AI City',
    'hud.homeConfirm': 'Back to My AI City?',
    'hud.mission': 'Mission',
    'hud.waypoint': 'Go to the marker!',
    'hud.missionSkip': 'Skip',
    'skins.title': 'Choose your champion',
    'skins.presets': 'Presets',
    'skins.accessories': 'Accessories',
    'skins.equip': 'Equip',
    'skins.wear': 'Wear',
    'skins.on': '✓ On',
    'skins.equipped': '✓ Equipped',
    'skins.locked': '🔒 Mission locked',
    'skins.empty': 'No items yet in this slot.',
    'skins.removeCustom': 'Remove uploaded champion',
    'skins.uploadCustom': 'Upload or replace my Champion',
    // Preset skin names (were hardcoded in skins.js) + the custom-champion card.
    'skins.crimson': 'Crimson Guardian',
    'skins.dragon': 'Dragon Emperor',
    'skins.neondragon': 'Neon Dragon Mech',
    'skins.bunny': 'Pastel Bunny Bot',
    'skins.sentinel': 'Neon Sentinel',
    'skins.myChampion': 'My Champion',
    'skins.loading': 'Loading\u2026',
    // A11: the custom skin lives in this device's IndexedDB and does not travel.
    'skins.customNote': 'Your custom champion is saved on this device only \u2014 it won\u2019t travel to a new tablet.',
    // Accessory slot headers + item names (were hardcoded in accessories.js).
    'acc.slot.head': 'Head', 'acc.slot.face': 'Face', 'acc.slot.ears': 'Ears',
    'acc.slot.chest': 'Chest', 'acc.slot.back': 'Back',
    'acc.head_crown': 'Royal Crown', 'acc.head_vr': 'VR Headset', 'acc.head_hardhat': 'Smart Hard Hat',
    'acc.face_glasses': 'Smart Glasses', 'acc.face_monocle': 'Gold Monocle', 'acc.face_visor': 'Holo Visor',
    'acc.back_wings': 'Cyber Wings', 'acc.back_jetpack': 'Rocket Pack', 'acc.back_backpack': 'Tech Backpack',
    'props.title': 'Model library',
    'props.catNature': 'Nature 🌳',
    'props.catPark': 'Park & Play 🛝',
    'props.catStreet': 'Street 🚦',
    'props.catVehicles': 'Vehicles 🚑',
    'props.catFriends': 'Friends 🧑🤝🧑',
    'props.catAnimals': 'Animals 🐶',
    'props.catRobots': 'Robots 🤖',
    'props.catSpace': 'Space 🚀',
    'props.catHk': 'Hong Kong 🇭🇰',
    'props.catFood': 'Food & Snacks 🍕',
    'props.catLab': 'Science Lab 🧪',
    'props.catOffice': 'Office 💻',
    'props.place': 'Place',
    'props.clearAll': '🗑 Clear all',
    'props.myProps': 'My props:',
    'props.noPropsToClear': 'No props to clear yet!',
    'props.clearedAll': 'Cleared all props.',
    'props.placed': 'Placed',
    'props.missingModel': 'Hmm — that model is missing. Pick another!',
    'props.nothingToUndo': 'Nothing to undo.',
    'props.tapGroundHint': '👆 Tap the ground to place',
    'coach.c1t': 'Move around',
    'coach.c1b': 'Use the arrows at the bottom-left to walk your champion around the city.',
    'coach.c2t': 'Play the games',
    'coach.c2b': 'Walk up to a glowing building and tap the Enter button to play its game.',
    'coach.c3t': 'Decorate your city',
    'coach.c3b': 'Tap the toolbox to open the model library and place trees, friends and robots on the ground.',
    'entry.start': '▶ Start my saved city',
    'entry.emptySample': '▶ Start with an empty sample',
    'entry.openFile': '📁 Open my city file',
    'entry.moreWays': 'More ways…',
    'entry.loadIt': 'Load it!',
    'entry.hint': 'Tip: build a city in the 2D planner, then press "🌆 View my city" — it lands here automatically.',
    'toast.skinEquipped': 'equipped!',
    'toast.missionComplete': 'complete!',
    // Interior scenarios
    'scenario.techlab': 'Tech Lab',
    'scenario.spaceship': 'Spaceship',
    'scenario.spacestation': 'Space Station',
    'scenario.hospital': 'Hospital',
    'scenario.backCity': 'Leave the {scenario} and go back to the city?',
    'scenario.coach1t': 'Walk around',
    'scenario.coach1b': 'Use the arrows (d-pad) to walk around the {scenario}!',
    'scenario.coach2t': 'Talk to your buddy',
    'scenario.coach2b': 'Ask your AI buddy anything — tap the speech bubble!',
    'scenario.coach3t': 'Decorate the space',
    'scenario.coach3b': 'Open the 🧰 model library to place gadgets and furniture!',
  },
  'zh-Hant': {
    'common.gotIt': '知道了',
    'common.skip': '跳過',
    'common.letsGo': '開始吧！',
    'common.done': '完成',
    'common.rotate': '旋轉',
    'common.undo': '復原',
    'common.place': '放置',
    'common.start': '開始',
    'common.accept': '接受',
    'common.cancel': '取消',
    'hud.champion': '冠軍',
    'hud.home': '返回AI城市',
    'hud.homeConfirm': '返回AI城市？',
    'hud.mission': '任務',
    'hud.waypoint': '前往標記點！',
    'hud.missionSkip': '跳過',
    'skins.title': '選擇你的冠軍機械人',
    'skins.presets': '造型',
    'skins.accessories': '配件',
    'skins.equip': '穿上',
    'skins.wear': '戴上',
    'skins.on': '✓ 已佩戴',
    'skins.equipped': '✓ 已穿戴',
    'skins.locked': '🔒 完成任務解鎖',
    'skins.empty': '此欄位暫無配件',
    'skins.removeCustom': '移除上傳的冠軍機械人',
    'skins.uploadCustom': '上傳或更換我的冠軍機械人',
    'skins.crimson': '赤紅守衛',
    'skins.dragon': '龍皇',
    'skins.neondragon': '霓虹龍機甲',
    'skins.bunny': '粉彩兔機械人',
    'skins.sentinel': '霓虹哨兵',
    'skins.myChampion': '我的冠軍',
    'skins.loading': '載入中…',
    'skins.customNote': '你的自訂冠軍只儲存在這部裝置上 — 換新平板時不會一起帶過去。',
    'acc.slot.head': '頭部', 'acc.slot.face': '面部', 'acc.slot.ears': '耳朵',
    'acc.slot.chest': '胸口', 'acc.slot.back': '背部',
    'acc.head_crown': '皇冠', 'acc.head_vr': 'VR 頭戴裝置', 'acc.head_hardhat': '智能安全帽',
    'acc.face_glasses': '智能眼鏡', 'acc.face_monocle': '黃金單片眼鏡', 'acc.face_visor': '全息面罩',
    'acc.back_wings': '賽博翅膀', 'acc.back_jetpack': '火箭背包', 'acc.back_backpack': '科技背包',
    'props.title': '模型庫',
    'props.catNature': '大自然 🌳',
    'props.catPark': '公園遊樂 🛝',
    'props.catStreet': '街道 🚦',
    'props.catVehicles': '車輛 🚑',
    'props.catFriends': '朋友 🧑🤝🧑',
    'props.catAnimals': '動物 🐶',
    'props.catRobots': '機械人 🤖',
    'props.catSpace': '太空 🚀',
    'props.catHk': '香港 🇭🇰',
    'props.catFood': '美食 🍕',
    'props.catLab': '科學實驗室 🧪',
    'props.catOffice': '辦公室 💻',
    'props.place': '放置',
    'props.clearAll': '🗑 全部清除',
    'props.myProps': '我的模型：',
    'props.noPropsToClear': '還沒有模型可以清除！',
    'props.clearedAll': '已清除全部模型。',
    'props.placed': '已放置',
    'props.missingModel': '這個模型載入失敗，請選另一個！',
    'props.nothingToUndo': '沒有可以復原的。',
    'props.tapGroundHint': '👆 點一下地面放置',
    'coach.c1t': '四處走動',
    'coach.c1b': '用左下角的箭頭方向鍵，讓你的冠軍機械人在城市裡走動。',
    'coach.c2t': '玩小遊戲',
    'coach.c2b': '走到發光的建築物前，點「進入」按鈕開始遊戲。',
    'coach.c3t': '佈置你的城市',
    'coach.c3b': '點工具箱打開模型庫，把樹木、朋友和機械人放到地上。',
    'entry.start': '▶ 開始我的城市',
    'entry.emptySample': '▶ 從示範城市開始',
    'entry.openFile': '📁 開啟城市檔案',
    'entry.moreWays': '更多方式…',
    'entry.loadIt': '載入！',
    'entry.hint': '小提示：在2D規劃器建立城市，然後按「🌆 查看我的城市」就會自動帶到這裡。',
    'toast.skinEquipped': '已穿戴！',
    'toast.missionComplete': '完成！',
    // Interior scenarios
    'scenario.techlab': '科技實驗室',
    'scenario.spaceship': '太空船',
    'scenario.spacestation': '太空站',
    'scenario.hospital': '醫院',
    'scenario.backCity': '離開{scenario}並回到城市？',
    'scenario.coach1t': '四處走動',
    'scenario.coach1b': '用箭頭方向鍵，在{scenario}裡四處走動！',
    'scenario.coach2t': '和你的AI夥伴聊天',
    'scenario.coach2b': '點擊對話氣泡，問你的AI夥伴任何問題！',
    'scenario.coach3t': '佈置這個空間',
    'scenario.coach3b': '打開🧰模型庫，放置小工具和傢具！',
  },
};

let _lang = 'en';
let _langBtn = null;

export function currentLang() { return _lang; }

export function t(key) {
  const table = DICT[_lang] || DICT.en;
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : (DICT.en[key] || key);
}

export function setLang(lang) {
  _lang = lang === 'zh-Hant' ? 'zh-Hant' : 'en';
  try { localStorage.setItem(LANG_KEY, _lang); } catch (e) { /* ignore */ }
  applyStatic();
  if (_langBtn) _langBtn.textContent = _lang === 'zh-Hant' ? 'EN' : '中';
  window.dispatchEvent(new CustomEvent('i18n:change'));
}

export function initI18n() {
  let saved = null;
  try { saved = localStorage.getItem(LANG_KEY); } catch (e) { /* ignore */ }
  const browserZh = typeof navigator !== 'undefined' && /^zh/i.test(navigator.language || '');
  _lang = saved === 'zh-Hant' || saved === 'en' ? saved : (browserZh ? 'zh-Hant' : 'en');
}

/** Localize the stable HTML chrome that lives in each sim's index.html. */
export function applyStatic() {
  const byKey = {
    '.skin-panel-title': 'skins.title',
    '#mission-title': 'hud.mission',
    '#mission-accept': 'common.accept',
    '#mission-skip': 'hud.missionSkip',
    '#waypoint-text': 'hud.waypoint',
    '#home-btn': 'hud.home',
    '#hud-champion': 'hud.champion',
    '#entry-local': 'entry.start',
    '#entry-file': 'entry.openFile',
    '#entry-paste': 'entry.moreWays',
    '#paste-go': 'entry.loadIt',
    '.entry-hint': 'entry.hint',
  };
  for (const [sel, key] of Object.entries(byKey)) {
    const el = document.querySelector(sel);
    if (!el) continue;
    if (sel === '#home-btn') el.setAttribute('title', t(key));
    else el.textContent = t(key);
  }
}

/** Mount a small 中/EN toggle next to the home button (top-right HUD). */
export function mountLangToggle() {
  if (_langBtn) return _langBtn;
  const hudRight = document.querySelector('.hud-right');
  if (!hudRight) return null;
  _langBtn = document.createElement('button');
  _langBtn.id = 'lang-toggle';
  _langBtn.type = 'button';
  _langBtn.setAttribute('aria-label', 'Language / 語言');
  _langBtn.textContent = _lang === 'zh-Hant' ? 'EN' : '中';
  _langBtn.style.cssText =
    'margin-left:8px;height:34px;min-width:38px;padding:0 8px;border-radius:10px;' +
    'border:1px solid var(--panel-border,rgba(0,242,254,0.35));background:transparent;' +
    'color:var(--text,#f8fafc);font-size:12px;font-weight:800;cursor:pointer;' +
    'font-family:var(--font-body,inherit);';
  _langBtn.addEventListener('click', () => setLang(_lang === 'zh-Hant' ? 'en' : 'zh-Hant'));
  hudRight.appendChild(_langBtn);
  return _langBtn;
}

// Keep THIS module's `_lang` in sync with the app-wide language toggle. The city HUD uses a
// SEPARATE i18n module (city-builder/i18n.js) whose setLang() updates its OWN `_lang` and fires
// `i18n:change` — but this module holds its own `_lang` copy, so without this listener the champion
// sidebar (skins.js) would freeze in whatever language it booted in after a 中/EN toggle (found by
// the Gemini pass-3 architecture review of the duplicated i18n modules). initI18n() re-reads the
// persisted LANG_KEY, so this is idempotent when this module's own setLang dispatched the event.
if (typeof window !== 'undefined') {
  window.addEventListener('i18n:change', () => { initI18n(); });
}
