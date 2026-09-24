// market-catalogue.js — the launch market: 18 working, previewable items.
//
// Data only. Prices live HERE, never in a caller, so `ledger.purchaseItem`
// always reads the catalogue price. Every accessory can actually equip and
// every decoration can actually place (the City/Champion runtimes read the item
// `kind`). Earned statues are NOT here — they are never purchasable.
//
// Collections (plan §2):
//   champion-accessory  6 items   two each at 20 / 40 / 60
//   city-decoration     6 items   two each at 30 / 60 / 90
//   prestige            4 items   two at 120, two at 180
//   champion-finish     2 items   50 each

export const MARKET_VERSION = 1;

const item = (id, name, nameZh, price, collection, extra = {}) => ({
  id, name, nameZh, price, collection, ...extra,
});

export const MARKET_CATALOGUE = Object.freeze({
  version: MARKET_VERSION,
  items: {
    // ── Champion accessories — equip on the Champion (champion-city) ─────────
    'acc-visor':      item('acc-visor', 'Holo Visor', '全息護目鏡', 20, 'champion-accessory', { kind: 'accessory', slot: 'face' }),
    'acc-antenna':    item('acc-antenna', 'Antenna Topper', '天線帽飾', 20, 'champion-accessory', { kind: 'accessory', slot: 'head' }),
    'acc-cap':        item('acc-cap', 'Engineer Cap', '工程師帽', 40, 'champion-accessory', { kind: 'accessory', slot: 'head' }),
    'acc-backpack':   item('acc-backpack', 'Tech Backpack', '科技背包', 40, 'champion-accessory', { kind: 'accessory', slot: 'back' }),
    'acc-shoulder':   item('acc-shoulder', 'Shoulder Ornament', '肩章', 60, 'champion-accessory', { kind: 'accessory', slot: 'chest' }),
    'acc-badge-pin':  item('acc-badge-pin', 'Badge Pin', '徽章別針', 60, 'champion-accessory', { kind: 'accessory', slot: 'chest' }),

    // ── City decorations — place in the City (repeatable) ────────────────────
    'dec-planter':    item('dec-planter', 'Street Planter', '街頭花槽', 30, 'city-decoration', { kind: 'decoration', place: 'prop' }),
    'dec-flag':       item('dec-flag', 'Festival Flag', '節日旗幟', 30, 'city-decoration', { kind: 'decoration', place: 'prop' }),
    'dec-bench':      item('dec-bench', 'Park Bench', '公園長椅', 60, 'city-decoration', { kind: 'decoration', place: 'prop' }),
    'dec-lamp':       item('dec-lamp', 'Smart Lamp', '智慧街燈', 60, 'city-decoration', { kind: 'decoration', place: 'prop' }),
    'dec-fountain':   item('dec-fountain', 'Plaza Fountain', '廣場噴泉', 90, 'city-decoration', { kind: 'decoration', place: 'prop' }),
    'dec-sculpture':  item('dec-sculpture', 'Champion Sculpture', '冠軍雕塑', 90, 'city-decoration', { kind: 'decoration', place: 'prop' }),

    // ── Prestige — landmark buildings + skill-host appearance upgrades ───────
    'pre-landmark-a': item('pre-landmark-a', 'Beacon Tower', '燈塔大樓', 120, 'prestige', { kind: 'landmark' }),
    'pre-landmark-b': item('pre-landmark-b', 'Festival Plaza', '節慶廣場', 120, 'prestige', { kind: 'landmark' }),
    'pre-host-a':     item('pre-host-a', 'Flagship Skill Host', '旗艦技能館', 180, 'prestige', { kind: 'host-upgrade' }),
    'pre-host-b':     item('pre-host-b', 'Crystal Skill Host', '水晶技能館', 180, 'prestige', { kind: 'host-upgrade' }),

    // ── Champion finishes — material palettes ────────────────────────────────
    'fin-palette-a':  item('fin-palette-a', 'Sunset Finish', '日落塗裝', 50, 'champion-finish', { kind: 'finish' }),
    'fin-palette-b':  item('fin-palette-b', 'Circuit Finish', '電路塗裝', 50, 'champion-finish', { kind: 'finish' }),
  },
});

export const MARKET_COLLECTIONS = Object.freeze({
  'champion-accessory': { en: 'Champion Accessories', zh: '冠軍配件' },
  'city-decoration':    { en: 'City Decorations', zh: '城市裝飾' },
  prestige:             { en: 'Prestige', zh: '榮譽珍藏' },
  'champion-finish':    { en: 'Champion Finishes', zh: '冠軍塗裝' },
});

export function marketItems() { return Object.values(MARKET_CATALOGUE.items); }
export function marketItem(id) { return MARKET_CATALOGUE.items[id] || null; }

/** The verb a card shows for an item: Buy → Equip / Place once owned. */
export function marketAction(id, ownedIds = []) {
  const entry = marketItem(id);
  if (!entry) return null;
  if (!ownedIds.includes(id)) return 'buy';
  if (entry.kind === 'decoration') return 'place';
  if (entry.kind === 'landmark') return 'place';
  return 'equip';
}
