// city-pregame/i18n.js — en/zh-Hant dictionary for the City Planning Academy.
//
// Same pattern as city-planner/i18n.js (reusable + buildless, copy-verbatim).
// Defaults to the saved choice, else the browser locale (zh → Traditional
// Chinese, otherwise English). A small 中/EN toggle mounts in the intro screen
// and persists under the shared LANG_KEY so the Academy, the 2D planner, the
// 3D city and the hub all agree.
//
// Usage:
//   import { initI18n, applyStatic, mountLangToggle, t, tf, currentLang } from './i18n.js';
//   initI18n();                    // once, before first paint
//   applyStatic();                 // localize [data-i18n*] HTML chrome
//   mountLangToggle('#intro-actions');  // 中/EN button
//   t('pg.start')                  // → "Start Training" / "開始訓練"
//   tf('pg.room.tag', { n: 2 })    // → "Training Room 2 of 4"
export const LANG_KEY = 'hk_ai_city_lang_v1';

export const DICT = {
  en: {
    // ── Static chrome (index.html) ──────────────────────────
    'pg.title': 'City Planning Academy',
    'pg.intro.aria': 'Introduction',
    'pg.intro.speech': 'Hi! I\u2019m <strong>Nova</strong>, your guide. Today you\u2019ll learn the <strong>four recipes</strong> the city planner uses to make great decisions. The planner isn\u2019t magic — it follows the same rules every time, just like you\u2019re about to learn!',
    'pg.intro.sub': 'Complete all four training rooms to earn your <strong>Planner\u2019s License</strong>.',
    'pg.start': 'Start Training',
    'pg.rooms.aria': 'Training rooms',
    'pg.finale.aria': 'Graduation',
    'pg.grad.title': 'You\u2019re a Graduate Planner!',
    'pg.grad.speech': 'Congratulations, Junior Planner! You mastered four training rooms: <strong>weighted score</strong>, <strong>coverage radius</strong>, <strong>shortest path</strong> and <strong>hill-climbing</strong>. The planner follows fixed rules — it weighs, measures, adds road distances, and keeps better steps. It does not guess, and it is not magic.',
    'pg.unlock': '\u2705 Unlock the planner \u2192',
    'pg.download': '\ud83d\udcbe Download my license file',
    'pg.saveProgress': '\ud83d\udcbe Save my progress',
    'pg.restart': 'Start over',
    'pg.downloadHint.locked': 'Finish all four rooms to unlock your file.',
    'pg.downloadHint.ready': 'Your planner is ready! Hit \u201cUnlock the planner\u201d to open it — or keep your license file as a backup.',
    'pg.nav.aria': 'Room progress',
    'pg.nav.room': 'Room {n}',
    'pg.modal.title': 'Start over?',
    'pg.modal.body': 'All training progress will be reset.',
    'pg.modal.cancel': 'Cancel',
    'pg.modal.reset': 'Reset',

    // ── Room chrome / journey strip ─────────────────────────
    'pg.room.tag': 'Training Room {n} of 4',
    'pg.room.bridgeLabel': 'Why this matters in the planner:',
    'pg.room.whyFallback': 'Why?',
    'pg.room.pathAria': 'Your training journey',
    'pg.room.pathStepAria': 'Room {n}: {title}',
    'pg.room.hint': '\ud83d\udca1 Hint',
    'pg.room.complete': '\u2705 {title} complete!',
    'pg.room.next': '\u27a1\ufe0f Next room',
    'pg.room.graduate': '\ud83c\udf93 Graduate',

    // ── Room 1 — Report Card / weighted score ───────────────
    'room.1.title': 'Report Card Room',
    'room.1.story': 'Welcome to the Report Card Room! A city is like a school report: not every subject counts the same. Our planner uses a weighted report card.',
    'room.1.math.0': 'Each part gets a sub-score from 0 to 100. Multiply it by its weight, then add everything together.',
    'room.1.math.1': 'The weights are fixed: <code>near roads 30%</code>, <code>services 25%</code>, <code>quiet 15%</code>, <code>spread 10%</code>, <code>mix 10%</code>, <code>utilities 10%</code>.',
    'room.1.whyTitle': 'Why these weights?',
    'room.1.why.0': 'Near roads (30%) is the biggest because roads are the city\u2019s skeleton — a school or shop nobody can reach is useless, however good it is.',
    'room.1.why.1': 'Services near homes (25%) comes next: a home is only a home if school, shop, hospital, fire and police are within reach.',
    'room.1.why.2': 'Quiet (15%) matters because living beside a noisy factory is unpleasant, but it doesn\u2019t stop a city from working.',
    'room.1.why.3': 'Spread, mix and utilities (10% each) make a city nicer to live in, but the city still works even if they aren\u2019t perfect.',
    'room.1.bridge': 'In the planner, the City Score is exactly this report card: every part gets a sub-score, you multiply by its weight, and add it all up. Pick a Mayor and the weights change — that\u2019s the whole trick.',

    // ── Room 2 — Leash Garden / coverage radius ─────────────
    'room.2.title': 'Leash Garden',
    'room.2.story': 'Step into the Leash Garden. Imagine a dog tied to a post — it can only reach a circle around it. Homes work the same way: a school, shop or hospital is only useful if you can walk there easily. If something is too far, people just won\u2019t use it — so the planner only counts it within a convenient walking distance.',
    'room.2.math.0': 'Services — school, shop, hospital, fire, police — count for a home if they are within <code>150m</code>. Utilities — water, power, bus — count within <code>400m</code>.',
    'room.2.math.1': 'On our map, <code>1 square = 50m</code>. So 150m = 3 squares, and 400m = 8 squares.',
    'room.2.whyTitle': 'Why two distances?',
    'room.2.why.0': 'You use a school or shop every day, so it must be really close — 150m.',
    'room.2.why.1': 'Water, power and buses you need less often (or they reach you through pipes and wires), so 400m is fine.',
    'room.2.bridge': 'In the planner, tap \u2b55 Ranges and you\u2019ll see these circles drawn around every building. A home is only \u201cserved\u201d when a school, shop, hospital, fire or police station sits inside its circle.',

    // ── Room 3 — Ant Trail / shortest path ──────────────────
    'room.3.title': 'Ant Trail Room',
    'room.3.story': 'In the Ant Trail Room, remember: ants cannot fly. They follow paths. Our planner walks along roads, not through buildings.',
    'room.3.math.0': 'Roads form a network. Add only the road pieces you use. If a route uses 120m + 100m + 180m, the walk is 400m.',
    'room.3.math.1': 'A straight line is not enough if there is no road. The walk budget is <code>400m</code>; the shortest legal route wins.',
    'room.3.bridge': 'When you tap \ud83d\udeb6 Walk in the planner, it runs exactly this search on YOUR roads — it finds the real walking route to school, shop and park, never a straight line through buildings.',

    // ── Room 4 — Foggy Mountain / hill-climbing ─────────────
    'room.4.title': 'Foggy Mountain Room',
    'room.4.story': 'Last is the Foggy Mountain. You cannot see the top, only the next step. Climb carefully!',
    'room.4.math.0': 'The algorithm tries one small change. If the city score goes <strong>up</strong>, it keeps the change. If the score goes down or stays the same, it undoes the change. Repeat.',
    'room.4.math.1': 'Example: 63 \u2192 65, keep; 65 \u2192 61, undo. It is greedy and only looks one step ahead, so it can get stuck on a local optimum — a small hill.',
    'room.4.bridge': 'The planner\u2019s \ud83e\uddee Optimise button is this hiker — it keeps every step that improves the score. Now you know why it can stop early on a small hill, and that a fresh start (Explore) can climb higher.',

    // ── Room 1 challenge — weight lab + report card ─────────
    'c1.lab.left': 'Near roads',
    'c1.lab.right': 'Parks',
    'c1.lab.title': '\ud83c\udf9b\ufe0f Try it: what does a weight DO?',
    'c1.lab.intro': 'Two subjects, two sub-scores. Slide the divider to give <strong>{left}</strong> more or less of the 100%. Watch the total move — a weight is how much a part is allowed to matter.',
    'c1.lab.score': 'score {n}',
    'c1.lab.sliderAria': 'Weight split between {left} and {right}',
    'c1.lab.total': 'Weighted total',
    'c1.lab.note': 'See it? Give {left} (score {ls}) more weight and the total climbs toward {ls}. Give {right} (score {rs}) more and it falls toward {rs}.',
    'c1.challenge': '<strong>Challenge:</strong> Complete the city report card. Tap a number tile, then tap the box for the part it belongs to. Then type the total.',
    'c1.tilesAria': 'Number tiles',
    'c1.boxAria': '{label} product box',
    'c1.totalCaption': 'Total so far: {n}',
    'c1.totalLabel': 'Total score (add them all up)',
    'c1.totalPlaceholder': 'Type the total, e.g. 78.5',
    'c1.check': '\u2705 Check',
    'c1.row.nearRoads': 'Near roads',
    'c1.row.services': 'Services',
    'c1.row.quiet': 'Quiet',
    'c1.row.spread': 'Spread',
    'c1.row.mix': 'Mix',
    'c1.row.utilities': 'Utilities',
    'c1.fb.tileFirst': 'Tap a number tile first!',
    'c1.fb.fillAll': 'Fill every box with a number tile first.',
    'c1.fb.rowsWrong': 'Some multiplications are wrong. Hint: find 10% first, then multiply.',
    'c1.fb.totalWrong': 'The sub-scores are right — now add them all together for the total!',
    'c1.fb.perfect': '\ud83c\udf89 Perfect! 27 + 17.5 + 12 + 6 + 7 + 9 = 78.5.',

    // ── Room 2 challenge — coverage task ────────────────────
    'c2.shopTitle': 'Shop — service',
    'c2.busTitle': 'Bus stop — utility',
    'c2.cardTitle': '{emoji} {title} — {limit}m leash ({squares} squares)',
    'c2.intro': 'Tap a spot to see its reach circle. Then mark each spot <strong>OK</strong> (both homes inside) or <strong>TOO FAR</strong>.',
    'c2.svgAria': '{title} coverage map',
    'c2.spotAria': '{name}: home one {d1}m, home two {d2}m. Tap to see the {limit}m reach.',
    'c2.legend': '1 square = 50 m \u00b7 the dashed ring shows the {limit}m reach',
    'c2.tableAria': 'Mark each {title} OK or TOO FAR',
    'c2.th.spot': 'Spot',
    'c2.th.home1': 'Home 1',
    'c2.th.home2': 'Home 2',
    'c2.th.ok': 'OK',
    'c2.th.toofar': 'Too far',
    'c2.markOk': 'OK',
    'c2.markTooFar': 'TOO FAR',
    'c2.bestIntro': 'Now pick the best spot (both homes inside the {limit}m leash).',
    'c2.bestAria': 'Best {title}',
    'c2.spotA': 'Spot A',
    'c2.spotB': 'Spot B',
    'c2.spotC': 'Spot C',
    'c2.stopX': 'Stop X',
    'c2.stopY': 'Stop Y',
    'c2.stopZ': 'Stop Z',
    'c2.check': '\u2705 Check',
    'c2.fb.shopMarks': 'Some shop OK / TOO FAR marks are wrong. A shop counts only if BOTH homes are within 150m.',
    'c2.fb.busMarks': 'Some bus OK / TOO FAR marks are wrong. A bus stop counts only if BOTH homes are within 400m.',
    'c2.fb.shopBest': 'The shop marks are right, but the best shop spot is wrong. Pick the spot where BOTH homes are within 150m.',
    'c2.fb.busBest': 'The bus marks are right, but the best bus spot is wrong. Pick the stop where BOTH homes are within 400m.',
    'c2.fb.perfect': '\ud83c\udf89 Shop = Spot B, Bus stop = Stop Y. Both homes are within range!',

    // ── Room 3 challenge — Dijkstra search + ant routes ─────
    'c3.searchTitle': '\ud83d\udd0d First, watch the planner SEARCH',
    'c3.searchIntro': 'It can\u2019t guess. From HOME it marks every crossing it can reach, then confirms the <strong>closest one first</strong>, spreads out, and updates if it finds a shorter way. Watch the distances appear:',
    'c3.searchStatusStart': 'Starting the search\u2026',
    'c3.replay': '\u21bb Replay',
    'c3.skip': '\u23ed Skip to the challenge',
    'c3.searchSvgAria': 'Road network diagram from HOME to BUS',
    'c3.markFound': 'Shorter way to {node} found — update {old}m \u2192 {dist}m!',
    'c3.markReach': 'The ant can reach {node} — mark {dist}m.',
    'c3.settleHome': 'HOME is 0m — the ant starts here.',
    'c3.settleNode': 'Confirm {node}: it\u2019s the closest marked crossing ({dist}m). Now spread out from {node}.',
    'c3.busReached': '\ud83c\udfc1 BUS reached at <strong>{dist}m</strong> — that\u2019s Route {winner}, inside the 400m budget. The planner never took a straight line; it walked real roads and kept the shortest legal route. Now it\u2019s YOUR turn below.',
    'c3.challenge': '<strong>Challenge:</strong> Help the ant reach the bus stop. Tap a route to see the ant walk it. Add the road pieces, type the route total, and tell us if it fits the 400m budget.',
    'c3.svgAria': 'Road network with three routes from HOME to BUS STOP',
    'c3.budgetLabel': 'Walk budget',
    'c3.budgetValue': '{shown} m / 400 m',
    'c3.chooseRouteAria': 'Choose a route',
    'c3.route': 'Route {id}',
    'c3.routeAria': 'Route {id}: {segs} metres',
    'c3.chosenTotal': 'Chosen route total',
    'c3.totalPlaceholder': 'Type the total, e.g. 350 or 350m',
    'c3.withinLabel': 'Is it within 400m?',
    'c3.withinAria': 'Within budget',
    'c3.yes': 'Yes',
    'c3.no': 'No',
    'c3.check': '\u2705 Check',
    'c3.fb.pick': 'Check each route: which is shortest AND within 400m?',
    'c3.fb.total': 'Add the three pieces: 150 + 100 + 100 = 350. You can type 350 or 350m.',
    'c3.fb.within': 'Is 350m within the 400m budget?',
    'c3.fb.perfect': '\ud83c\udf89 Route A = 350m, within 400m. The shortest legal route wins!',

    // ── Room 4 challenge — hill-climb + escape ──────────────
    'c4.challenge': '<strong>Challenge:</strong> You are the optimiser. The planner tested a few small changes — tap the one it KEEPS: the change whose score went UP the most. If the score goes down or stays the same, it undoes it.',
    'c4.mountainAria': 'Foggy mountain with a local hill and a distant higher peak',
    'c4.currentScore': 'Current score',
    'c4.round': 'Round {n} — score is {cur}. Which change does the planner keep?',
    'c4.r1.a': 'A: add tree \u2192 60',
    'c4.r1.b': 'B: move school \u2192 57',
    'c4.r1.c': 'C: add road \u2192 59',
    'c4.r2.d': 'D: add shop \u2192 62',
    'c4.r2.e': 'E: remove lamp \u2192 59',
    'c4.r2.f': 'F: move bin \u2192 60',
    'c4.keepIt': 'Keep it! {next} > {cur} — the score went up, so the hiker climbs.',
    'c4.rejectUp': 'That score went up but not the most — the planner keeps the best improvement.',
    'c4.rejectDown': 'That score went DOWN — the planner undoes it. Tap the one that goes up the most.',
    'c4.stuck.title': 'The foggy peak',
    'c4.stuck.body': 'The hiker is at <strong>62</strong> on a small hill. Every nearby change gives 61, 61 or 60 — all lower. A distant plan would score <strong>80</strong>, but reaching it needs a drop to <strong>55</strong> first.',
    'c4.stuck.q': '<strong>Will the algorithm move to the distant 80 plan?</strong>',
    'c4.stuck.yes': 'Yes — 80 is bigger',
    'c4.stuck.no': 'No — it only accepts upward steps',
    'c4.escape.body': 'Right! The greedy planner is <strong>stuck on the small hill</strong>. It will never walk downhill, so it can\u2019t reach the 80 peak on its own.',
    'c4.escape.q': '<strong>What can a smarter planner do to reach the 80 plan?</strong>',
    'c4.escape.restart': '\u21bb Restart from a brand-new spot and climb again',
    'c4.escape.tryagain': '\ud83d\udd01 Keep trying the same small steps',
    'c4.escape.reveal': '\ud83c\udf89 Exactly! A fresh start lands somewhere new — sometimes on a taller hill. In the planner you\u2019ll meet this as the <strong>Explore</strong> strategy: when Optimise gets stuck, Explore restarts and climbs again, so it can beat the greedy planner\u2019s best score.',
    'c4.check': '\u2705 Check',
    'c4.fb.rounds': 'Keep the change whose score goes UP the most. Round 1: 58 \u2192 ? Round 2: 60 \u2192 ?',
    'c4.fb.rule': 'Remember the rule: the algorithm never accepts a downhill step, so it cannot reach that distant plan.',
    'c4.fb.escape': 'Same small steps stay on the same small hill. The escape is a fresh start somewhere new — then climb again.',
    'c4.fb.perfect': '\ud83c\udf89 You climbed: 58 \u2192 60 \u2192 62 — that is a local optimum. And you know the escape: restart somewhere new (Explore) to climb even higher!',

    // ── Hints (2 levels per room) ───────────────────────────
    'hint.1.1': 'Find 10% first: 10% of 90 is 9, so 30% of 90 is 27. 25% of 70 is 70 \u00f7 4 = 17.5.',
    'hint.1.2': '15% = 10% + 5%: 10% of 80 = 8, 5% of 80 = 4, so 15% of 80 = 12. Then add: 27 + 17.5 + 12 + 6 + 7 + 9 = 78.5.',
    'hint.2.1': 'Use the dashed ring: a spot works only if BOTH homes are inside it. For the shop, 150m is 3 squares; for the bus, 400m is 8 squares.',
    'hint.2.2': 'Shop: Spot A has a 200m home (too far), Spot C has a 250m home (too far) — only Spot B fits. Bus: Stop X has a 500m home, Stop Z has a 450m home — only Stop Y fits.',
    'hint.3.1': 'Only add road pieces the ant actually uses. Ignore the straight-line distance across the map. (The search up top already found it: BUS = 350m.)',
    'hint.3.2': 'Route A: 150 + 100 = 250, then + 100 = 350. Compare with 400. Routes B (450) and C (420) are over the budget.',
    'hint.4.1': 'Ask: is the new score BIGGER than the old score? If yes, keep. If no, undo.',
    'hint.4.2': 'The greedy planner is stuck at 62 and cannot reach 80 by itself. To climb the taller peak it must start over somewhere new — that is the Explore trick.',

    // ── Toasts / finale ─────────────────────────────────────
    'pg.toast.unlockFail': '\u26a0\ufe0f Could not save the unlock on this browser — use the download instead.',
    'pg.toast.unlocked': '\ud83d\udd13 Unlocked! Opening the planner\u2026',
    'pg.toast.downloaded': '\ud83d\udcbe Downloaded planner-license.json — your license file! Upload it in the 2D city planner on a new tablet.',
    'pg.toast.progressSaved': '\ud83d\udcbe Saved your Champion File — keep it safe! Open it in the planner or 3D city on a new device.',
    'pg.toast.progressFail': '\u26a0\ufe0f Could not save your progress on this browser — try again.',
    'pg.toast.reset': 'Progress reset. Let\u2019s start fresh!',
  },
  'zh-Hant': {
      "pg.title": "城市規劃學院",
      "pg.intro.aria": "簡介",
      "pg.intro.speech": "你好！我是你的嚮導 <strong>Nova</strong>。今天你會學到城市規劃師用來做完美決定的<strong>四個秘訣</strong>。規劃工具不是魔法——它每次都遵循相同的規則，就像你即將學到的一樣！",
      "pg.intro.sub": "完成所有四個訓練室，以考取你的<strong>規劃師執照</strong>。",
      "pg.start": "開始訓練",
      "pg.rooms.aria": "訓練室",
      "pg.finale.aria": "畢業",
      "pg.grad.title": "你畢業成為規劃師了！",
      "pg.grad.speech": "恭喜你，小小規劃師！你已經精通了四個訓練室：<strong>加權分數</strong>、<strong>覆蓋半徑</strong>、<strong>最短路徑</strong>和<strong>爬山演算法</strong>。規劃工具遵循固定的規則——它會計算權重、測量範圍、把街道距離加起來，並保留更好的結果。它不會靠猜，也不是魔法。",
      "pg.unlock": "✅ 解鎖規劃工具 →",
      "pg.download": "💾 下載我的執照檔案",
      "pg.saveProgress": "💾 儲存我的進度",
      "pg.restart": "重新開始",
      "pg.downloadHint.locked": "完成全部四個訓練室來解鎖你的檔案。",
      "pg.downloadHint.ready": "你的規劃工具準備好了！點擊「解鎖規劃工具」打開它——或者保留執照檔案作為備份。",
      "pg.nav.aria": "訓練室進度",
      "pg.nav.room": "訓練室 {n}",
      "pg.modal.title": "重新開始？",
      "pg.modal.body": "所有訓練進度將會重設。",
      "pg.modal.cancel": "取消",
      "pg.modal.reset": "重設",
      "pg.room.tag": "第 {n} 個訓練室（共 4 個）",
      "pg.room.bridgeLabel": "為什麼這在規劃工具中很重要：",
      "pg.room.whyFallback": "為什麼？",
      "pg.room.pathAria": "你的訓練旅程",
      "pg.room.pathStepAria": "訓練室 {n}：{title}",
      "pg.room.hint": "💡 提示",
      "pg.room.complete": "✅ {title} 完成！",
      "pg.room.next": "➡️ 下一個訓練室",
      "pg.room.graduate": "🎓 畢業",
      "room.1.title": "成績表訓練室",
      "room.1.story": "歡迎來到成績表訓練室！城市就像一張學校成績表：不是每個科目的比重都一樣。我們的規劃工具使用加權的成績表。",
      "room.1.math.0": "每個部分會有一個 0 到 100 的小分數。將它乘以它的權重，然後把所有分數加起來。",
      "room.1.math.1": "權重是固定的：<code>靠近街道 30%</code>、<code>服務設施 25%</code>、<code>安靜 15%</code>、<code>分佈 10%</code>、<code>混合 10%</code>、<code>公共設施 10%</code>。",
      "room.1.whyTitle": "為什麼是這些權重？",
      "room.1.why.0": "靠近街道 (30%) 佔最多，因為街道是城市的骨幹——一間學校或商店就算多好，如果沒有人能到達也是沒用的。",
      "room.1.why.1": "靠近住宅的服務設施 (25%) 排第二：只有當學校、商店、醫院、消防局和警局都在附近時，住宅才算得上是一個家。",
      "room.1.why.2": "安靜 (15%) 也很重要，因為住在吵鬧的工廠旁邊並不舒服，但這不會阻止城市運作。",
      "room.1.why.3": "分佈、混合和公共設施 (各佔 10%) 能讓城市變得更宜居，但就算它們不是完美的，城市依然能運作。",
      "room.1.bridge": "在規劃工具中，城市得分就是這張成績表：每個部分都有一個小分數，乘以它的權重，再全部加起來。選擇不同的市長，權重就會改變——這就是它的秘訣。",
      "room.2.title": "牽繩花園",
      "room.2.story": "走進牽繩花園。想像一隻被綁在柱子上的狗——牠只能在周圍的圓圈內活動。住宅也是一樣的道理：學校、商店或醫院必須是你可以輕鬆步行到達的才有用。如果太遠，人們就不會去使用——所以規劃工具只會計算在方便步行距離內的東西。",
      "room.2.math.0": "服務設施——學校、商店、醫院、消防局、警局——如果在住宅的 <code>150m</code> 內就會計算在內。公共設施——水、電、巴士——則在 <code>400m</code> 內都會計算。",
      "room.2.math.1": "在我們的地圖上，<code>1 格 = 50m</code>。所以 150m = 3 格，400m = 8 格。",
      "room.2.whyTitle": "為什麼有兩個距離？",
      "room.2.why.0": "你每天都要去學校或商店，所以它們必須非常近——150m。",
      "room.2.why.1": "水、電和巴士你不需要那麼常去（或者它們可以透過水管和電線連接到你家），所以 400m 就足夠了。",
      "room.2.bridge": "在規劃工具中，點擊 ⭕ 範圍，你就會看到這些圓圈畫在每棟建築物周圍。只有當學校、商店、醫院、消防局或警局在它的圓圈內時，住宅才算是「獲得服務」。",
      "room.3.title": "螞蟻路線訓練室",
      "room.3.story": "在螞蟻路線訓練室，請記住：螞蟻不會飛。牠們會沿著路線走。我們的規劃工具也是沿著街道走的，不會穿過建築物。",
      "room.3.math.0": "街道會形成一個網絡。只把你會用到的街道長度加起來。如果一條路線用了 120m + 100m + 180m，這段步行距離就是 400m。",
      "room.3.math.1": "如果沒有街道，直線距離再近也沒用。步行上限是 <code>400m</code>；最短的合理路線就是贏家。",
      "room.3.bridge": "當你在規劃工具中點擊 🚶 步行 時，它就會在你的街道上進行這樣的搜尋——它會找出前往學校、商店和公園的真實步行路線，絕對不會直線穿過建築物。",
      "room.4.title": "迷霧高山訓練室",
      "room.4.story": "最後是迷霧高山。你看不到山頂，只能看到下一步。小心攀爬！",
      "room.4.math.0": "演算法會嘗試做一個小改變。如果城市得分<strong>上升</strong>了，它就會保留這個改變。如果分數下降或保持不變，它就會撤銷改變。然後重複這個過程。",
      "room.4.math.1": "例子：63 → 65，保留；65 → 61，撤銷。它是貪婪的，只會看前面的一小步，所以它可能會困在局部最優解——一座小山上。",
      "room.4.bridge": "規劃工具中的 🧮 優化 按鈕就是這個登山者——它會保留每一個能提高分數的步驟。現在你明白為什麼它可能會提早在小山上停下來，而重新開始（探索）可以爬得更高了吧。",
      "c1.lab.left": "靠近街道",
      "c1.lab.right": "公園",
      "c1.lab.title": "🎛️ 試試看：權重有什麼作用？",
      "c1.lab.intro": "兩個科目，兩個小分數。滑動分隔線，把 100% 分配多點或少點給<strong>{left}</strong>。看看總分如何變化——權重就是一個部分能佔多大的重要性。",
      "c1.lab.score": "分數 {n}",
      "c1.lab.sliderAria": "{left}和{right}之間的權重分配",
      "c1.lab.total": "加權總分",
      "c1.lab.note": "看到了嗎？給{left}（分數 {ls}）多一點權重，總分就會向 {ls} 攀升。給{right}（分數 {rs}）多一點，總分就會向 {rs} 降下來。",
      "c1.challenge": "<strong>挑戰：</strong>完成城市成績表。點擊數字方塊，然後點擊它所屬部分的格子。最後輸入總分。",
      "c1.tilesAria": "數字方塊",
      "c1.boxAria": "{label}的乘積方格",
      "c1.totalCaption": "目前的總分：{n}",
      "c1.totalLabel": "總分（把它們全部加起來）",
      "c1.totalPlaceholder": "輸入總分，例如 78.5",
      "c1.check": "✅ 檢查",
      "c1.row.nearRoads": "靠近街道",
      "c1.row.services": "服務設施",
      "c1.row.quiet": "安靜",
      "c1.row.spread": "分佈",
      "c1.row.mix": "混合",
      "c1.row.utilities": "公共設施",
      "c1.fb.tileFirst": "請先點擊數字方塊！",
      "c1.fb.fillAll": "請先用數字方塊填滿所有格子。",
      "c1.fb.rowsWrong": "有些乘法算錯了。提示：先找出 10% 是多少，然後再乘。",
      "c1.fb.totalWrong": "小分數都對了——現在把它們全部加起來算出總分吧！",
      "c1.fb.perfect": "🎉 完美！27 + 17.5 + 12 + 6 + 7 + 9 = 78.5。",
      "c2.shopTitle": "商店 — 服務設施",
      "c2.busTitle": "巴士站 — 公共設施",
      "c2.cardTitle": "{emoji} {title} — {limit}m 的牽繩（{squares} 格）",
      "c2.intro": "點擊一個地點來看看它的覆蓋圓圈。然後將每個地點標記為 <strong>OK</strong>（兩間住宅都在裡面）或 <strong>太遠</strong>。",
      "c2.svgAria": "{title} 覆蓋地圖",
      "c2.spotAria": "{name}：第一間住宅 {d1}m，第二間住宅 {d2}m。點擊看看 {limit}m 的範圍。",
      "c2.legend": "1 格 = 50 m · 虛線圓圈代表 {limit}m 的範圍",
      "c2.tableAria": "將每個 {title} 標記為 OK 或太遠",
      "c2.th.spot": "地點",
      "c2.th.home1": "住宅 1",
      "c2.th.home2": "住宅 2",
      "c2.th.ok": "OK",
      "c2.th.toofar": "太遠",
      "c2.markOk": "OK",
      "c2.markTooFar": "太遠",
      "c2.bestIntro": "現在挑選最好的地點（兩間住宅都在 {limit}m 的範圍內）。",
      "c2.bestAria": "最好的 {title}",
      "c2.spotA": "地點 A",
      "c2.spotB": "地點 B",
      "c2.spotC": "地點 C",
      "c2.stopX": "車站 X",
      "c2.stopY": "車站 Y",
      "c2.stopZ": "車站 Z",
      "c2.check": "✅ 檢查",
      "c2.fb.shopMarks": "有些商店的 OK / 太遠 標記錯了。只有當兩間住宅都在 150m 內，商店才會計算在內。",
      "c2.fb.busMarks": "有些巴士站的 OK / 太遠 標記錯了。只有當兩間住宅都在 400m 內，巴士站才會計算在內。",
      "c2.fb.shopBest": "商店標記對了，但最好的商店地點選錯了。請選擇一個兩間住宅都在 150m 內的地點。",
      "c2.fb.busBest": "巴士站標記對了，但最好的巴士站地點選錯了。請選擇一個兩間住宅都在 400m 內的車站。",
      "c2.fb.perfect": "🎉 商店 = 地點 B，巴士站 = 車站 Y。兩間住宅都在範圍內！",
      "c3.searchTitle": "🔍 首先，看看規劃工具如何搜尋",
      "c3.searchIntro": "它不會靠猜。它會從 HOME 開始，標記每一個可以到達的十字路口，然後確認<strong>最近的一個</strong>，向外擴展，如果找到更短的路線就會更新。看看距離是怎麼出現的：",
      "c3.searchStatusStart": "開始搜尋…",
      "c3.replay": "↻ 重播",
      "c3.skip": "⏭ 跳到挑戰",
      "c3.searchSvgAria": "從 HOME 到 BUS 的街道網絡圖",
      "c3.markFound": "找到前往 {node} 更短的路線了——更新為 {old}m → {dist}m！",
      "c3.markReach": "螞蟻可以到達 {node}——標記為 {dist}m。",
      "c3.settleHome": "HOME 是 0m——螞蟻從這裡出發。",
      "c3.settleNode": "確認 {node}：這是標記中最近的十字路口（{dist}m）。現在從 {node} 向外擴展。",
      "c3.busReached": "🏁 在 <strong>{dist}m</strong> 處到達 BUS——那是路線 {winner}，符合 400m 的步行上限。規劃工具絕對不會走直線；它走的是真實的街道，並找出最短的合理路線。現在輪到你試試看了。",
      "c3.challenge": "<strong>挑戰：</strong>幫助螞蟻走到巴士站。點擊一條路線看看螞蟻怎麼走。把每段街道長度加起來，輸入路線的總距離，並告訴我們它是否符合 400m 的步行上限。",
      "c3.svgAria": "有三條路線從 HOME 前往 BUS 站的街道網絡",
      "c3.budgetLabel": "步行上限",
      "c3.budgetValue": "{shown} m / 400 m",
      "c3.chooseRouteAria": "選擇一條路線",
      "c3.route": "路線 {id}",
      "c3.routeAria": "路線 {id}：{segs} m",
      "c3.chosenTotal": "已選擇的路線總距離",
      "c3.totalPlaceholder": "輸入總距離，例如 350 或 350m",
      "c3.withinLabel": "它在 400m 的範圍內嗎？",
      "c3.withinAria": "在上限內",
      "c3.yes": "是",
      "c3.no": "否",
      "c3.check": "✅ 檢查",
      "c3.fb.pick": "檢查每條路線：哪一條最短「而且」在 400m 以內？",
      "c3.fb.total": "把這三段加起來：150 + 100 + 100 = 350。你可以輸入 350 或 350m。",
      "c3.fb.within": "350m 符合 400m 的步行上限嗎？",
      "c3.fb.perfect": "🎉 路線 A = 350m，在 400m 範圍內。最短的合理路線勝出！",
      "c4.challenge": "<strong>挑戰：</strong>你是優化器。規劃工具測試了幾個小改變——請點擊它會「保留」的那一個：也就是讓分數「上升」最多的改變。如果分數下降或保持不變，它就會撤銷。",
      "c4.mountainAria": "有一座小山和遠處更高山峰的迷霧高山",
      "c4.currentScore": "目前得分",
      "c4.round": "第 {n} 回合 — 分數是 {cur}。規劃工具會保留哪一個改變？",
      "c4.r1.a": "A：加樹 → 60",
      "c4.r1.b": "B：移動學校 → 57",
      "c4.r1.c": "C：加街道 → 59",
      "c4.r2.d": "D：加商店 → 62",
      "c4.r2.e": "E：移除路燈 → 59",
      "c4.r2.f": "F：移動垃圾桶 → 60",
      "c4.keepIt": "保留它！{next} > {cur} — 分數上升了，所以登山者會繼續向上爬。",
      "c4.rejectUp": "那個分數上升了，但不是上升最多的一個——規劃工具會保留最好的進步。",
      "c4.rejectDown": "那個分數「下降」了——規劃工具會撤銷它。請點擊上升最多的一個。",
      "c4.stuck.title": "迷霧山峰",
      "c4.stuck.body": "登山者現在在 <strong>62</strong> 分的小山上。附近每一個改變帶來的分數都是 61、61 或 60——全都比較低。遠處有一個 <strong>80</strong> 分的規劃方案，但要到達那裡，分數必須先降到 <strong>55</strong>。",
      "c4.stuck.q": "<strong>演算法會移動到遠處的 80 分方案嗎？</strong>",
      "c4.stuck.yes": "會 — 因為 80 比較大",
      "c4.stuck.no": "不會 — 它只接受向上的步驟",
      "c4.escape.body": "答對了！貪婪的規劃工具<strong>被困在小山上了</strong>。它絕對不會走下坡，所以它無法靠自己到達 80 分的山峰。",
      "c4.escape.q": "<strong>更聰明的規劃工具可以怎麼做來達成 80 分的方案？</strong>",
      "c4.escape.restart": "↻ 從一個全新的地點重新開始，再次攀爬",
      "c4.escape.tryagain": "🔁 繼續嘗試同樣的小步驟",
      "c4.escape.reveal": "這就是<strong>探索</strong>策略：當優化卡住時，探索會重新開始並再次攀爬，這樣它就能超越貪婪規劃工具的最高分數了。",
      "c4.check": "✅ 檢查",
      "c4.fb.rounds": "保留分數「上升」最多的改變。第 1 回合：58 → ? 第 2 回合：60 → ?",
      "c4.fb.rule": "記住規則：演算法絕對不會接受走下坡的步驟，所以它無法到達那個遠處的方案。",
      "c4.fb.escape": "同樣的小步驟只會留在同樣的小山上。逃脫的方法是在新的地方重新開始——然後再次攀爬。",
      "c4.fb.perfect": "🎉 你爬升了：58 → 60 → 62 ——這就是一個局部最優解。而且你知道逃脫的方法：在新的地方重新開始（探索），就可以爬得更高！",
      "hint.1.1": "先找出 10% 是多少：90 的 10% 是 9，所以 90 的 30% 就是 27。70 的 25% 則是 70 ÷ 4 = 17.5。",
      "hint.1.2": "15% = 10% + 5%：80 的 10% = 8，80 的 5% = 4，所以 80 的 15% = 12。然後加起來：27 + 17.5 + 12 + 6 + 7 + 9 = 78.5。",
      "hint.2.1": "利用虛線圓圈：只有當兩間住宅都在裡面時，這個地點才算有效。商店的 150m 是 3 格；巴士站的 400m 是 8 格。",
      "hint.2.2": "商店：地點 A 有一間住宅在 200m（太遠），地點 C 有一間住宅在 250m（太遠）——只有地點 B 符合。巴士站：車站 X 有一間住宅在 500m，車站 Z 有一間住宅在 450m——只有車站 Y 符合。",
      "hint.3.1": "只加上螞蟻真正會走到的街道長度。忽略地圖上的直線距離。（上面的搜尋已經找出來了：BUS = 350m。）",
      "hint.3.2": "路線 A：150 + 100 = 250，然後 + 100 = 350。拿它跟 400 比較。路線 B (450) 和 C (420) 都超過步行上限了。",
      "hint.4.1": "問問自己：新的分數比舊的分數「大」嗎？如果是，就保留。如果不是，就撤銷。",
      "hint.4.2": "貪婪的規劃工具卡在 62 分，無法靠自己達到 80 分。要爬上更高的山峰，它必須在新的地方重新開始——這就是「探索」的秘訣。",
      "pg.toast.unlockFail": "⚠️ 無法在這個瀏覽器上儲存解鎖進度——請改用下載功能。",
      "pg.toast.unlocked": "🔓 已解鎖！正在打開規劃工具…",
      "pg.toast.downloaded": "💾 已下載 planner-license.json——你的執照檔案！請在新平板電腦的 2D 城市規劃工具中上傳它。",
      "pg.toast.progressSaved": "💾 已儲存你的城市檔案 — 好好保存！在新裝置的規劃工具或 3D 城市中開啟即可還原。",
      "pg.toast.progressFail": "⚠️ 無法在這個瀏覽器儲存進度 — 請再試一次。",
      "pg.toast.reset": "進度已重設。我們重新開始吧！"
  },
};

let _lang = 'en';
let _langBtn = null;

export function currentLang() { return _lang; }

export function t(key) {
  const table = DICT[_lang] || DICT.en;
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : (DICT.en[key] || key);
}

/** Translate + fill `{name}` placeholders. Unknown placeholders are left intact. */
export function tf(key, params) {
  const raw = t(key);
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(params, k) ? String(params[k]) : m));
}

export function setLang(lang) {
  _lang = lang === 'zh-Hant' ? 'zh-Hant' : 'en';
  try { localStorage.setItem(LANG_KEY, _lang); } catch (e) { /* ignore */ }
  applyStatic();
  if (_langBtn) _langBtn.textContent = _lang === 'zh-Hant' ? 'EN' : '\u4e2d';
  window.dispatchEvent(new CustomEvent('i18n:change'));
}

export function initI18n() {
  let saved = null;
  try { saved = localStorage.getItem(LANG_KEY); } catch (e) { /* ignore */ }
  const browserZh = typeof navigator !== 'undefined' && /^zh/i.test(navigator.language || '');
  _lang = saved === 'zh-Hant' || saved === 'en' ? saved : (browserZh ? 'zh-Hant' : 'en');
}

/** Localize static HTML chrome: any element carrying data-i18n (textContent),
 *  data-i18n-html (innerHTML), data-i18n-title (title attr), data-i18n-aria
 *  (aria-label) or data-i18n-ph (placeholder) gets the active language's value.
 *  Also syncs <html lang>. */
export function applyStatic() {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = _lang === 'zh-Hant' ? 'zh-Hant' : 'en';
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.getAttribute('data-i18n')); });
  document.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.getAttribute('data-i18n-html')); });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => { el.setAttribute('title', t(el.getAttribute('data-i18n-title'))); });
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria'))); });
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph'))); });
}

/** Mount a small 中/EN toggle into a container (default: `#intro-actions`). */
export function mountLangToggle(containerSel = '#intro-actions') {
  if (_langBtn) return _langBtn;
  const container = document.querySelector(containerSel);
  if (!container) return null;
  _langBtn = document.createElement('button');
  _langBtn.id = 'lang-toggle';
  _langBtn.type = 'button';
  _langBtn.setAttribute('aria-label', 'Language / \u8a9e\u8a00');
  _langBtn.textContent = _lang === 'zh-Hant' ? 'EN' : '\u4e2d';
  _langBtn.style.cssText =
    'margin-left:8px;height:44px;min-width:44px;padding:0 10px;border-radius:10px;' +
    'border:1px solid rgba(0,242,254,0.35);background:transparent;' +
    'color:#f8fafc;font-size:14px;font-weight:800;cursor:pointer;font-family:inherit;';
  _langBtn.addEventListener('click', () => setLang(_lang === 'zh-Hant' ? 'en' : 'zh-Hant'));
  container.appendChild(_langBtn);
  return _langBtn;
}
