// market.js — the Champion Market.
//
// The wallet is the SHARED envelope economy (city-common/project-store.js),
// never a private counter. Prices come from the catalogue, the store commits
// the debit + ownership in one IndexedDB transaction, and a duplicate purchase
// can never charge twice (ledger.js).
import { createProjectStore } from '../city-common/project-store.js';
import { MARKET_CATALOGUE, MARKET_COLLECTIONS, marketItems } from '../city-common/market-catalogue.js';

const STR = {
  en: {
    title: 'Champion Market', credits: 'credits', hub: '← Hub',
    buy: 'Buy', owned: 'Owned', equip: 'Equip in City', place: 'Place in City',
    noFunds: 'Not enough credits yet — prove a skill in the Workshop to earn more.',
    bought: 'Added to your collection.', failed: 'That purchase could not be completed.',
    empty: 'The market is loading…',
  },
  'zh-Hant': {
    title: '冠軍市集', credits: '學分', hub: '← 主頁',
    buy: '購買', owned: '已擁有', equip: '在城市裝備', place: '放置於城市',
    noFunds: '學分不足 —— 到工作坊展示技能即可賺取更多。',
    bought: '已加入你的收藏。', failed: '無法完成交易。',
    empty: '市集載入中…',
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
    const isOwned = owned.includes(entry.id);
    const card = document.createElement('article');
    card.className = 'mkt-card';
    const collection = MARKET_COLLECTIONS[entry.collection];
    card.innerHTML = `
      <span class="mkt-collection">${(collection && (lang === 'zh-Hant' ? collection.zh : collection.en)) || entry.collection}</span>
      <h2>${lang === 'zh-Hant' ? entry.nameZh : entry.name}</h2>
      <span class="mkt-zh">${lang === 'zh-Hant' ? entry.name : entry.nameZh}</span>
      <span class="mkt-price">◎ ${fmt(entry.price)}</span>
      <button class="mkt-buy${isOwned ? ' mkt-owned' : ''}" type="button" data-id="${entry.id}"${isOwned ? ' disabled' : ''}>
        ${isOwned ? t('owned') : t('buy')}
      </button>`;
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
    } else {
      economy = result.economy;
      $('mkt-note').textContent = result.purchased ? t('bought') : '';
      render();
      return;
    }
  } catch {
    $('mkt-note').textContent = t('failed');
  } finally {
    pending.delete(id);
    button.disabled = false;
  }
}

$('mkt-lang').addEventListener('click', () => {
  lang = lang === 'zh-Hant' ? 'en' : 'zh-Hant';
  localStorage.setItem('hk_ai_city_lang_v1', lang);
  applyChrome();
  render();
});

$('mkt-grid').addEventListener('click', (event) => {
  const button = event.target.closest('.mkt-buy');
  if (button && !button.disabled) buy(button);
});

(async function boot() {
  applyChrome();
  try {
    store = createProjectStore();
    await store.openActiveProject();
    economy = await store.readEconomy();
  } catch {
    economy = null;
  }
  if (!economy) {
    $('mkt-note').textContent = t('failed');
    return;
  }
  render();
})();
