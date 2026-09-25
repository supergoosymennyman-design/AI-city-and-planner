// market-catalogue.js — the launch market: 18 working, previewable items.
//
// Data only. Prices live HERE, never in a caller, so `ledger.purchaseItem`
// always reads the catalogue price. Every item declares an explicit handler
// (`marketHandler`) naming a concrete consumer and a real registry id: an
// accessory equips on the Champion, a decoration/landmark places in the City, a
// finish equips on the Champion, a host-upgrade equips on a skill host. An item
// whose handler is missing fails the catalogue completeness test rather than
// shipping a dead Buy button. Earned statues are NOT here — never purchasable.
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
    'acc-visor':      item('acc-visor', 'Holo Visor', '全息護目鏡', 20, 'champion-accessory', { kind: 'accessory', slot: 'face' , championAccessory: 'face_visor' }),
    'acc-antenna':    item('acc-antenna', 'Antenna Topper', '天線帽飾', 20, 'champion-accessory', { kind: 'accessory', slot: 'head' , championAccessory: 'head_antenna' }),
    'acc-cap':        item('acc-cap', 'Engineer Cap', '工程師帽', 40, 'champion-accessory', { kind: 'accessory', slot: 'head' , championAccessory: 'head_hardhat' }),
    'acc-backpack':   item('acc-backpack', 'Tech Backpack', '科技背包', 40, 'champion-accessory', { kind: 'accessory', slot: 'back' , championAccessory: 'back_backpack' }),
    'acc-shoulder':   item('acc-shoulder', 'Shoulder Ornament', '肩章', 60, 'champion-accessory', { kind: 'accessory', slot: 'chest' , championAccessory: 'chest_shoulder' }),
    'acc-badge-pin':  item('acc-badge-pin', 'Badge Pin', '徽章別針', 60, 'champion-accessory', { kind: 'accessory', slot: 'chest' , championAccessory: 'chest_badge' }),

    // ── City decorations — place in the City (repeatable) ────────────────────
    // `propId` names a real library.js entry (the prop library inserts it).
    'dec-planter':    item('dec-planter', 'Street Planter', '街頭花槽', 30, 'city-decoration', { kind: 'decoration', place: 'prop', propId: 'nat_planter' }),
    'dec-flag':       item('dec-flag', 'Festival Flag', '節日旗幟', 30, 'city-decoration', { kind: 'decoration', place: 'prop', propId: 'scn_park_park-flagGreen' }),
    'dec-bench':      item('dec-bench', 'Park Bench', '公園長椅', 60, 'city-decoration', { kind: 'decoration', place: 'prop', propId: 'prop_bench' }),
    'dec-lamp':       item('dec-lamp', 'Smart Lamp', '智慧街燈', 60, 'city-decoration', { kind: 'decoration', place: 'prop', propId: 'prop_streetlight_k' }),
    'dec-fountain':   item('dec-fountain', 'Plaza Fountain', '廣場噴泉', 90, 'city-decoration', { kind: 'decoration', place: 'prop', propId: 'prop_fountain' }),
    'dec-sculpture':  item('dec-sculpture', 'Champion Sculpture', '冠軍雕塑', 90, 'city-decoration', { kind: 'decoration', place: 'prop', propId: 'prop_horse_statue' }),

    // ── Prestige — landmark buildings + skill-host appearance upgrades ───────
    // `landmarkTemplate` names a real landmark-templates.js id; `hostUpgrade`
    // names a skill-hosts.js appearance style.
    'pre-landmark-a': item('pre-landmark-a', 'Beacon Tower', '燈塔大樓', 120, 'prestige', { kind: 'landmark', place: 'landmark', landmarkTemplate: 'smart-gate' }),
    'pre-landmark-b': item('pre-landmark-b', 'Festival Plaza', '節慶廣場', 120, 'prestige', { kind: 'landmark', place: 'landmark', landmarkTemplate: 'festival-plaza' }),
    'pre-host-a':     item('pre-host-a', 'Flagship Skill Host', '旗艦技能館', 180, 'prestige', { kind: 'host-upgrade', hostUpgrade: 'flagship' }),
    'pre-host-b':     item('pre-host-b', 'Crystal Skill Host', '水晶技能館', 180, 'prestige', { kind: 'host-upgrade', hostUpgrade: 'crystal' }),

    // ── Champion finishes — material palettes ────────────────────────────────
    // `finish` names a real champion-finishes.js palette id.
    'fin-palette-a':  item('fin-palette-a', 'Sunset Finish', '日落塗裝', 50, 'champion-finish', { kind: 'finish', finish: 'sunset' }),
    'fin-palette-b':  item('fin-palette-b', 'Circuit Finish', '電路塗裝', 50, 'champion-finish', { kind: 'finish', finish: 'circuit' }),
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

/** The storage key the skill-host runtime reads for a purchased host appearance. */
export const HOST_UPGRADE_STORAGE_KEY = 'hk_ai_city_host_upgrade_v1';

/**
 * The explicit action every catalogue item resolves to. A card can only ever be
 * Buy → (Equip | Place); an item with no handler is a catalogue bug, not a
 * silent no-op (the review found several such dead items). `kind` names the
 * consumer and the target is a real registry id the consumer understands.
 * @returns {null|{action:'equip'|'place', kind:string, [key:string]:any}}
 */
export function marketHandler(id) {
  const entry = marketItem(id);
  if (!entry) return null;
  switch (entry.kind) {
    case 'accessory':
      return entry.championAccessory && entry.slot
        ? { action: 'equip', kind: 'accessory', slot: entry.slot, accessory: entry.championAccessory } : null;
    case 'decoration':
      return entry.propId ? { action: 'place', kind: 'decoration', propId: entry.propId } : null;
    case 'landmark':
      return entry.landmarkTemplate ? { action: 'place', kind: 'landmark', templateId: entry.landmarkTemplate } : null;
    case 'finish':
      return entry.finish ? { action: 'equip', kind: 'finish', finishId: entry.finish } : null;
    case 'host-upgrade':
      return entry.hostUpgrade ? { action: 'equip', kind: 'host-upgrade', hostUpgrade: entry.hostUpgrade } : null;
    default:
      return null;
  }
}

/** The verb a card shows for an item: Buy → Equip / Place once owned, or null when dead. */
export function marketAction(id, ownedIds = []) {
  const handler = marketHandler(id);
  if (!handler) return null;
  return ownedIds.includes(id) ? handler.action : 'buy';
}
