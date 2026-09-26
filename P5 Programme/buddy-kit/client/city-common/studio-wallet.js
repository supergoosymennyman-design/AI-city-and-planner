// studio-wallet.js — pure translation between the Studio model shop and the
// shared envelope wallet.
//
// The Studio authors its OWN catalogue (`studio/public/models/catalog.json`) with
// its own `unlock` law (free / level / coins / level+coins), while the envelope
// ledger (`ledger.js`) knows exactly one purchase shape: a price read from a
// catalogue. These helpers translate a Studio catalogue into that shape so a
// Studio purchase can go through the SAME commit primitive the Market uses —
// `store.purchase(itemId, transactionId, catalogue)`.
//
// Nothing here decides affordability or applies the level gate: the Studio's pure
// `unlock.js` stays the single unlock law (the adapter calls it first), and
// `ledger.js` stays the single commit primitive (it reads the price again). This
// module is intentionally PURE — no DOM, no storage, no `fetch`, no `three` — so
// plain Node can exercise it.

const object = (v) => v && typeof v === 'object' && !Array.isArray(v);
const integer = (v) => Number.isSafeInteger(v) && v >= 0;

/**
 * The coin price the Studio's own unlock engine would charge for a model.
 * A `free` or `level` model costs nothing; a `coins`/`level+coins` model costs
 * its declared `coins`. Malformed input degrades to `0` (never throws).
 *
 * @param {*} model - Studio catalog model.
 * @returns {number} A non-negative integer price.
 */
export function studioPrice(model) {
  const unlock = object(model) && object(model.unlock) ? model.unlock : null;
  if (!unlock) return 0;
  if (unlock.type === 'coins' || unlock.type === 'level+coins') {
    return integer(unlock.coins) ? unlock.coins : 0;
  }
  return 0;
}

/**
 * Build a ledger-shaped catalogue from the Studio model catalogue, so
 * `ledger.purchaseItem` reads the exact price the Studio showed the child.
 * A model without a usable id is skipped; malformed input yields an empty
 * catalogue rather than throwing.
 *
 * @param {*} catalog - Normalized Studio catalog (`{ models: [...] }`).
 * @returns {{version:number, items:Object<string,{id:string,name:string,price:number}>}}
 */
export function studioCatalogue(catalog) {
  const items = {};
  const models = object(catalog) && Array.isArray(catalog.models) ? catalog.models : [];
  for (const model of models) {
    if (!object(model)) continue;
    const id = typeof model.id === 'string' && model.id.length > 0 ? model.id : null;
    if (!id) continue;
    items[id] = {
      id,
      name: typeof model.name === 'string' && model.name.length > 0 ? model.name : id,
      price: studioPrice(model),
    };
  }
  return { version: 1, items };
}

/**
 * Read an envelope economy as the Studio shop's `{coins, owned}` wallet shape.
 * Defensive: a missing/garbage economy reads as an empty wallet, never throws.
 *
 * @param {*} economy - Envelope economy (or the legacy session economy).
 * @returns {{coins:number, owned:string[]}}
 */
export function walletOf(economy) {
  if (!object(economy)) return { coins: 0, owned: [] };
  return {
    coins: integer(economy.balance) ? economy.balance : 0,
    owned: Array.isArray(economy.owned)
      ? economy.owned.filter((id) => typeof id === 'string' && id.length > 0)
      : [],
  };
}
