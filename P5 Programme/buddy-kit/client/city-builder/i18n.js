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
    // Shared-library categories (city-common/library.js)
    'props.catBuildings': 'Buildings 🏢',
    'props.catProps': 'Props 🛠️',
    'props.catCharacters': 'Characters 🧑',
    'props.catScenarios': 'Themed 🚀',
    'props.catAccessories': 'Accessories 🎩',
    'props.place': 'Place',
    'props.clearAll': '🗑 Clear all',
    'props.myProps': 'My props:',
    'props.noPropsToClear': 'No props to clear yet!',
    'props.clearedAll': 'Cleared all props.',
    'props.placed': 'Placed',
    'props.missingModel': 'Hmm — that model is missing. Pick another!',
    'props.nothingToUndo': 'Nothing to undo.',
    'props.tapGroundHint': '👆 Tap anywhere to place · ✓ Done when finished',
    'props.manyProps': 'That\u2019s a lot of props! The city might get slow with many more — try to keep it tidy.',
    'coach.c1t': 'Move around',
    'coach.c1b': 'Use the arrows at the bottom-left to walk your champion around the city.',
    'coach.c2t': 'Play the games',
    'coach.c2b': 'Walk up to a glowing building and tap the Enter button to play its game.',
    'coach.c3t': 'Decorate your city',
    'coach.c3b': 'Tap the toolbox to open the model library and place trees, friends and robots on the ground.',
    'entry.start': '▶ Start my saved city',
    'entry.continue': '▶ Continue my city',
    'entry.emptySample': '▶ Explore an example city',
    'entry.resumeLabel': 'Last saved',
    'entry.openFile': '📁 Open my city file',
    'entry.pasteJson': '📋 Paste JSON',
    'entry.moreWays': 'More ways…',
    'entry.loadIt': 'Load it!',
    'entry.hint': 'Tip: build a city in the 2D planner, then press "🌆 View my city" — it lands here automatically.',
    'hud.title': '🏙️ My AI City',
    'hud.cityLabel': '🤖 Your AI City',
    'entry.intro': 'Your city from the planner is ready to explore in 3D!',
    'entry.divDevice': '— take your city to another device —',
    'entry.divFile': '— or keep it as a file —',
    'entry.divSkin': '— make it yours —',
    'entry.cloudSave': '☁️ Save to cloud',
    'entry.cloudOpen': '☁️ Open from cloud',
    'entry.saveMine': '💾 Save my city',
    'entry.skinLabel': '🎨 Upload your fitted champion (.glb)',
    'entry.planChip': 'Planner AI goals + score',
    'entry.cloudSaveTitle': 'Save to the cloud and get a code to restore anywhere',
    'entry.cloudOpenTitle': 'Open a city you saved to the cloud with a code',
    'entry.saveTitle': 'Download a backup file of your whole city',
    'saveModal.nameAria': 'City name',
    'saveModal.title': '💾 Save my city',
    'saveModal.intro': 'Give your city a name so you can find it later — a fun city name is perfect (no need for your real name).',
    'saveModal.download': '💾 Download',
    'saveModal.cloud': '☁️ Save to cloud',
    'cloud.title': '☁️ Open from cloud',
    'cloud.intro': 'Type the code you got when you saved (it looks like tiger-bamboo-river-umbrella).',
    'cloud.load': '☁️ Load my city',
    'plan.title': '📋 My city plan',
    'plan.goalLabel': 'Goal:',
    'plan.balanced': 'Balanced',
    'plan.note': 'This is how your City Score was calculated in the planner — each part is a share of 100.',
    'plan.empty': 'No score breakdown travelled with this city.',
    'plan.buttonAria': 'See how your city was scored',
    'plan.metric.accessibility': 'Easy to get around',
    'plan.metric.coverage': 'Homes have services',
    'plan.metric.utilities': 'Water, power & buses',
    'plan.metric.zoning': 'Quiet & safe',
    'plan.metric.spread': 'Spread out',
    'plan.metric.balance': 'Good mix',
    'logbook.title': "🎖️ Inspector's Logbook",
    'cap.title': '📦 Your planted AI machines',
    'capTry.title': '🧪 Try my machine',
    'mission.start': '▶ Start Mission',
    'quest.enter': '🎮 Enter',
    'game.done': '✅ Done',
    'game.return': '↩ Return to City',
    'ctl.drive': 'Drive',
    'ctl.taxi': 'Taxi',
    'ctl.wave': 'Wave',
    'ctl.dance': 'Dance',
    'ctl.jump': 'Jump',
    'ctl.climb': 'Climb',
    'ctl.descend': 'Descend',
    'ctl.walk': 'Walk',
    'ctl.run': 'Run',
    'ctl.pageTitle': 'My AI City — 3D',
    'toast.skinEquipped': 'equipped!',
    'toast.missionComplete': 'complete!',
    // In-play toasts (were hardcoded English in city-builder.js). {name}/{file} are interpolated by tf().
    'toast.walking': '\ud83d\udeb6 Walking to {name}\u2026',
    'toast.flying': '\ud83d\ude80 Flying to {name}\u2026',
    'toast.flyControls': '\ud83d\ude95 Flying! Use \u2b06\ufe0f \u2b07\ufe0f to climb, exit with \ud83d\ude95 again.',
    'toast.parked': '\ud83d\ude97 Parked! Walk back and press \ud83d\ude97 to drive it again.',
    'toast.drivingAgain': '\ud83d\ude97 Driving the {name} again!',
    'toast.carLoadFail': '\u26a0\ufe0f Could not load that car \u2014 try another!',
    'toast.drivingCar': '\ud83d\ude97 Driving the {name}! Use \ud83d\udeb6/\ud83c\udfc3 to go, \ud83d\ude97 to exit.',
    'toast.noGame': '\u23f3 {name} doesn\u2019t have a game yet \u2014 try a mission building!',
    'toast.questComplete': '\u2705 {name} complete!',
    'toast.arrived': '\ud83d\udccd Arrived! Tap \ud83d\ude95 to land.',
    'toast.headingHome': '\ud83c\udfe0 Heading home\u2026',
    'toast.selectToMove': '\ud83d\udc40 Tap a model to select it, then \ud83c\udfaf to pick it up.',
    'toast.selectMode': '\ud83d\udc49 Select mode: tap a model, then \ud83c\udfaf to pick it up and move it.',
    'toast.noRoads': '\u26a0\ufe0f This city has no roads \u2014 streets, lights and cars won\u2019t appear. Open the planner, draw roads (or use \ud83d\udee4\ufe0f Roads), then Generate again.',
    'toast.saved': '\ud83d\udcbe Saved \u201c{file}\u201d \u2014 it\u2019s in your tablet\u2019s Files app \u203a Downloads. Next lesson: start screen \u2192 \ud83d\udcc1 Open my city file.',
    'toast.restored': '\ud83d\udcc2 Restored your Champion File ({n} saved items). Reloading\u2026',
    'toast.restoredNamed': '\ud83d\udcc2 Restored your Champion File \u2014 {label} ({n} saved items). Reloading\u2026',
    'toast.restorePartial': '\u26a0\ufe0f Restored most of your Champion File, but {n} item(s) would not fit. Free some space and try again.',
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
    // A6 disclosure shown under the buddy composer (host-supplied, so it is bilingual).
    'buddy.disclosure': 'Messages go to an AI brain to help me reply — please don\u2019t type private things.',
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
    // Shared-library categories (city-common/library.js)
    'props.catBuildings': '建築物 🏢',
    'props.catProps': '道具 🛠️',
    'props.catCharacters': '人物 🧑',
    'props.catScenarios': '主題 🚀',
    'props.catAccessories': '配件 🎩',
    'props.place': '放置',
    'props.clearAll': '🗑 全部清除',
    'props.myProps': '我的模型：',
    'props.noPropsToClear': '還沒有模型可以清除！',
    'props.clearedAll': '已清除全部模型。',
    'props.placed': '已放置',
    'props.missingModel': '這個模型載入失敗，請選另一個！',
    'props.nothingToUndo': '沒有可以復原的。',
    'props.tapGroundHint': '👆 點擊任何地方放置 · 完成後按 ✓',
    'props.manyProps': '道具太多了！再放更多可能會讓城市變慢——試著保持整齊。',
    'coach.c1t': '四處走動',
    'coach.c1b': '用左下角的箭頭方向鍵，讓你的冠軍機械人在城市裡走動。',
    'coach.c2t': '玩小遊戲',
    'coach.c2b': '走到發光的建築物前，點「進入」按鈕開始遊戲。',
    'coach.c3t': '佈置你的城市',
    'coach.c3b': '點工具箱打開模型庫，把樹木、朋友和機械人放到地上。',
    'entry.start': '▶ 開始我的城市',
    'entry.continue': '▶ 繼續我的城市',
    'entry.emptySample': '▶ 從示範城市開始',
    'entry.resumeLabel': '上次儲存',
    'entry.openFile': '📁 開啟城市檔案',
    'entry.pasteJson': '📋 貼上 JSON',
    'entry.moreWays': '更多方式…',
    'entry.loadIt': '載入！',
    'entry.hint': '小提示：在2D規劃器建立城市，然後按「🌆 查看我的城市」就會自動帶到這裡。',
    'hud.title': '🏙️ 我的AI城市',
    'hud.cityLabel': '🤖 你的AI城市',
    'entry.intro': '你在規劃器建立的城市已經準備好在3D中探索！',
    'entry.divDevice': '— 把城市帶到另一部裝置 —',
    'entry.divFile': '— 或存成檔案 —',
    'entry.divSkin': '— 打造你的風格 —',
    'entry.cloudSave': '☁️ 儲存到雲端',
    'entry.cloudOpen': '☁️ 從雲端開啟',
    'entry.saveMine': '💾 儲存我的城市',
    'entry.skinLabel': '🎨 上傳你的專屬冠軍 (.glb)',
    'entry.planChip': '規劃師 AI 的目標與得分',
    'entry.cloudSaveTitle': '儲存到雲端並取得可隨處還原的代碼',
    'entry.cloudOpenTitle': '用代碼開啟你存在雲端的城市',
    'entry.saveTitle': '下載整座城市的備份檔案',
    'saveModal.nameAria': '城市名稱',
    'saveModal.title': '💾 儲存我的城市',
    'saveModal.intro': '給你的城市取個名字，方便日後找回——有趣的城市名就最好（不用真名）。',
    'saveModal.download': '💾 下載',
    'saveModal.cloud': '☁️ 儲存到雲端',
    'cloud.title': '☁️ 從雲端開啟',
    'cloud.intro': '輸入你儲存時得到的代碼（格式像 tiger-bamboo-river-umbrella）。',
    'cloud.load': '☁️ 載入我的城市',
    'plan.title': '📋 我的城市規劃',
    'plan.goalLabel': '目標：',
    'plan.balanced': '均衡',
    'plan.note': '這就是你的城市分數在規劃器中的計算方式——每部分佔 100 分的一部分。',
    'plan.empty': '這座城市沒有附帶分數明細。',
    'plan.buttonAria': '查看城市分數的計算',
    'plan.metric.accessibility': '交通便利',
    'plan.metric.coverage': '住宅有服務',
    'plan.metric.utilities': '水電與巴士',
    'plan.metric.zoning': '寧靜安全',
    'plan.metric.spread': '分散發展',
    'plan.metric.balance': '良好混合',
    'logbook.title': '🎖️ 督察日誌',
    'cap.title': '📦 你種入的AI機器',
    'capTry.title': '🧪 試試我的機器',
    'mission.start': '▶ 開始任務',
    'quest.enter': '🎮 進入',
    'game.done': '✅ 完成',
    'game.return': '↩ 返回城市',
    'ctl.drive': '駕駛',
    'ctl.taxi': '的士',
    'ctl.wave': '揮手',
    'ctl.dance': '跳舞',
    'ctl.jump': '跳',
    'ctl.climb': '上升',
    'ctl.descend': '下降',
    'ctl.walk': '步行',
    'ctl.run': '跑步',
    'ctl.pageTitle': '我的AI城市 — 3D',
    'toast.skinEquipped': '已穿戴！',
    'toast.missionComplete': '完成！',
    'toast.walking': '\ud83d\udeb6 正步行前往{name}\u2026',
    'toast.flying': '\ud83d\ude80 正飛往{name}\u2026',
    'toast.flyControls': '\ud83d\ude95 起飛了！用 \u2b06\ufe0f \u2b07\ufe0f 升降，再按 \ud83d\ude95 離開。',
    'toast.parked': '\ud83d\ude97 已停車！走回去再按 \ud83d\ude97 即可再駕駛。',
    'toast.drivingAgain': '\ud83d\ude97 再次駕駛{name}！',
    'toast.carLoadFail': '\u26a0\ufe0f 無法載入這輛車，請試另一輛！',
    'toast.drivingCar': '\ud83d\ude97 正在駕駛{name}！用 \ud83d\udeb6/\ud83c\udfc3 前進，按 \ud83d\ude97 離開。',
    'toast.noGame': '\u23f3 {name}還沒有遊戲 \u2014 試試任務建築吧！',
    'toast.questComplete': '\u2705 {name}完成！',
    'toast.arrived': '\ud83d\udccd 到達了！按 \ud83d\ude95 降落。',
    'toast.headingHome': '\ud83c\udfe0 正在回家\u2026',
    'toast.selectToMove': '\ud83d\udc40 點一下模型選取它，再按 \ud83c\udfaf 拿起。',
    'toast.selectMode': '\ud83d\udc49 選取模式：點一下模型，再按 \ud83c\udfaf 拿起並移動。',
    'toast.noRoads': '\u26a0\ufe0f 這座城市沒有道路 \u2014 街道、燈光和車輛都不會出現。請打開規劃器畫道路（或用 \ud83d\udee4\ufe0f 道路），然後再次生成。',
    'toast.saved': '\ud83d\udcbe 已儲存「{file}」\u2014 檔案在平板的「檔案」App \u203a「下載項目」。下一課：開始畫面 \u2192 \ud83d\udcc1 開啟城市檔案。',
    'toast.restored': '\ud83d\udcc2 已還原你的冠軍檔案（{n} 個項目）。正在重新載入\u2026',
    'toast.restoredNamed': '\ud83d\udcc2 已還原你的冠軍檔案 \u2014 {label}（{n} 個項目）。正在重新載入\u2026',
    'toast.restorePartial': '\u26a0\ufe0f 已還原大部分冠軍檔案，但有 {n} 個項目放不下。請清出空間後再試。',
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
    'buddy.disclosure': '訊息會傳送給 AI 大腦來幫我回覆 — 請不要輸入私人資料。',
  },
};

let _lang = 'en';
let _langBtn = null;

export function currentLang() { return _lang; }

export function t(key) {
  const table = DICT[_lang] || DICT.en;
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : (DICT.en[key] || key);
}

/** Translate + interpolate `{token}` placeholders: tf('toast.walking', { name }) */
export function tf(key, vars) {
  const s = t(key);
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
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
  // Opt-in attributes (preferred for new chrome): any element can request
  // localization without editing this map. Mirrors the pregame/planner apps.
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.getAttribute('data-i18n')); });
  document.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.getAttribute('data-i18n-html')); });
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria'))); });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => { el.setAttribute('title', t(el.getAttribute('data-i18n-title'))); });
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph'))); });

  // Legacy selector map (kept for chrome that predates the data-i18n sweep).
  const byKey = {
    '.skin-panel-title': 'skins.title',
    '#mission-title': 'hud.mission',
    '#mission-accept': 'common.accept',
    '#mission-skip': 'hud.missionSkip',
    '#waypoint-text': 'hud.waypoint',
    '#home-btn': 'hud.home',
    '.hud-champion': 'hud.champion',   // was '#hud-champion' — no such id exists, so it never localized
    // NOTE: the entry-card controls (#entry-local / #entry-file / #entry-paste /
    // #paste-go) are localized via explicit data-i18n attributes in index.html.
    // They were removed from this legacy map because applyStatic() runs again
    // after boot and would overwrite #entry-local's dynamic label
    // ("Continue my city" / "Explore an example city") with the static
    // "Start my saved city", and mislabel the file/paste buttons.
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
    'margin-left:8px;height:44px;min-width:44px;padding:0 10px;border-radius:10px;' +
    'border:1px solid var(--panel-border,rgba(0,242,254,0.35));background:transparent;' +
    'color:var(--text,#f8fafc);font-size:14px;font-weight:800;cursor:pointer;' +
    'font-family:var(--font-body,inherit);';
  _langBtn.addEventListener('click', () => setLang(_lang === 'zh-Hant' ? 'en' : 'zh-Hant'));
  hudRight.appendChild(_langBtn);
  return _langBtn;
}
