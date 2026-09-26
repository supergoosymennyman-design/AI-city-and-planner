// market.js — the Champion Market.
//
// The wallet is the SHARED envelope economy (city-common/project-store.js),
// never a private counter. Prices come from the catalogue, the store commits
// the debit + ownership in one IndexedDB transaction, and a duplicate purchase
// can never charge twice (ledger.js). Owned accessories can be equipped on the
// Champion right here; owned decorations hand off to the City to place.
import { createProjectStore } from '../city-common/project-store.js';
import { requestPersistentStorage } from '../city-common/persistence.js';
import { MARKET_CATALOGUE, MARKET_COLLECTIONS, marketItems, marketItem, marketAction, marketHandler } from '../city-common/market-catalogue.js';
import { writeFinish } from '../city-common/champion-finishes.js';
import { writeHostUpgrade } from '../city-common/host-upgrades.js';

// The Champion runtime reads this key on load, so equipping here dresses the
// Champion in the City with no extra plumbing (same-origin localStorage).
const CHAMPION_ACCESSORY_KEY = 'hk_ai_city_accessories_v1';

const STR = {
  en: {
    title: 'Champion Market', credits: 'credits', hub: '← Hub',
    buy: 'Buy', equip: 'Equip', place: 'Place in City',
    equipped: 'Equipped on your Champion — see it in the City.',
    finishEquipped: 'Finish equipped on your Champion — see it in the City.',
    hostEquipped: 'Skill-host upgrade equipped — it appears on your skill hosts.',
    noFunds: 'Not enough credits yet — prove a skill in the Workshop or Academy to earn more.',
    bought: 'Added to your collection.', failed: 'That could not be completed.',
    unavailable: 'This item has no working action yet.',
    placeHint: 'Opening the City to place this…',
  },
  'zh-Hant': {
    title: '冠軍市集', credits: '學分', hub: '← 主頁',
    buy: '購買', equip: '裝備', place: '放置於城市',
    equipped: '已裝備在冠軍身上 —— 到城市看看。',
    finishEquipped: '已為冠軍裝備塗裝 —— 到城市看看。',
    hostEquipped: '已裝備技能館升級 —— 將會出現在你的技能館上。',
    noFunds: '學分不足 —— 到工作坊或學院展示技能即可賺取更多。',
    bought: '已加入你的收藏。', failed: '無法完成。',
    unavailable: '此物品尚未有可用的動作。',
    placeHint: '正在開啟城市放置…',
  },
};

let lang = localStorage.getItem('hk_ai_city_lang_v1') || 'en';
if (!STR[lang]) lang = 'en';
const t = (key) => STR[lang][key] ?? STR.en[key] ?? key;

const $ = (id) => document.getElementById(id);
const fmt = (n) => new Intl.NumberFormat(lang === 'zh-Hant' ? 'zh-Hant-HK' : 'en-HK').format(n);

let store;
let economy;
const pending = new Set();

function applyChrome() {
  document.documentElement.lang = lang === 'zh-Hant' ? 'zh-Hant' : 'en';
  $('mkt-title').textContent = t('title');
  $('mkt-credits').textContent = t('credits');
  $('mkt-lang').textContent = lang === 'zh-Hant' ? 'EN' : '中文';
  document.querySelector('.mkt-back').textContent = t('hub');
}

function render() {
  const owned = economy?.owned || [];
  $('mkt-balance').textContent = fmt(economy?.balance ?? 0);
  const grid = $('mkt-grid');
  grid.textContent = '';
  for (const entry of marketItems()) {
    const action = marketAction(entry.id, owned);
    const collection = MARKET_COLLECTIONS[entry.collection];
    const card = document.createElement('article');
    card.className = 'mkt-card';
    card.innerHTML = `
      <span class="mkt-collection">${(collection && (lang === 'zh-Hant' ? collection.zh : collection.en)) || entry.collection}</span>
      <h2>${lang === 'zh-Hant' ? entry.nameZh : entry.name}</h2>
      <span class="mkt-zh">${lang === 'zh-Hant' ? entry.name : entry.nameZh}</span>
      <span class="mkt-price">◎ ${fmt(entry.price)}</span>
      <button class="mkt-buy${action !== 'buy' ? ' mkt-owned' : ''}" type="button"
        data-id="${entry.id}" data-action="${action}">${t(action)}</button>`;
    grid.append(card);
  }
}

async function buy(button) {
  const id = button.dataset.id;
  if (!id || pending.has(id)) return;
  pending.add(id);
  button.disabled = true;
  $('mkt-note').textContent = '';
  try {
    const transactionId = `mkt-${crypto.randomUUID()}`;
    const result = await store.purchase(id, transactionId, MARKET_CATALOGUE);
    if (!result.ok) {
      $('mkt-note').textContent = /credits/i.test(result.error || '') ? t('noFunds') : (result.error || t('failed'));
      return;
    }
    economy = result.economy;
    $('mkt-note').textContent = result.purchased ? t('bought') : '';
    render();
  } catch {
    $('mkt-note').textContent = t('failed');
  } finally {
    pending.delete(id);
    if (button.isConnected) button.disabled = false;
  }
}

function unlock(handler) {
  try {
    if (handler.kind === 'accessory') {
      const map = JSON.parse(localStorage.getItem(CHAMPION_ACCESSORY_KEY) || '{}');
      map[handler.slot] = handler.accessory;
      localStorage.setItem(CHAMPION_ACCESSORY_KEY, JSON.stringify(map));
      $('mkt-note').textContent = t('equipped');
      return true;
    }
    if (handler.kind === 'finish') {
      if (!writeFinish(handler.finishId)) return false;
      $('mkt-note').textContent = t('finishEquipped');
      return true;
    }
    if (handler.kind === 'host-upgrade') {
      if (!writeHostUpgrade(handler.hostUpgrade)) return false;
      $('mkt-note').textContent = t('hostEquipped');
      return true;
    }
    return false;
  } catch { return false; }
}

function equip(entry) {
  const handler = marketHandler(entry.id);
  if (!handler || !unlock(handler)) $('mkt-note').textContent = t('unavailable');
}

function place(entry) {
  // Owned City items are placed in the City's own placement tool, which reads
  // `?place=<marketId>` and verifies ownership against the shared wallet.
  const handler = marketHandler(entry.id);
  if (!handler) { $('mkt-note').textContent = t('unavailable'); return; }
  $('mkt-note').textContent = t('placeHint');
  location.href = `../city-builder/?place=${encodeURIComponent(entry.id)}`;
}

$('mkt-lang').addEventListener('click', () => {
  lang = lang === 'zh-Hant' ? 'en' : 'zh-Hant';
  localStorage.setItem('hk_ai_city_lang_v1', lang);
  applyChrome();
  render();
});

$('mkt-grid').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const entry = marketItem(button.dataset.id);
  if (!entry) return;
  if (button.dataset.action === 'buy') buy(button);
  else if (button.dataset.action === 'equip') equip(entry);
  else if (button.dataset.action === 'place') place(entry);
});

(async function boot() {
  applyChrome();
  // Best-effort: ask the browser to keep this device's storage (iOS evicts after
  // ~7 days). The Champion File / cloud codes remain the real safety net.
  requestPersistentStorage().catch(() => {});
  try {
    store = createProjectStore();
    await store.openActiveProject();
    economy = await store.readEconomy();
  } catch {
    economy = null;
  }
  if (!economy) { $('mkt-note').textContent = t('failed'); return; }
  render();
})();
