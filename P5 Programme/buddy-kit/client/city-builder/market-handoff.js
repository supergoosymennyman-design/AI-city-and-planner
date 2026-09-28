// market-handoff.js — the City end of a Market "Place in City" hand-off.
//
// The Market navigates to `/city-builder/?place=<marketId>` after a purchase.
// This module turns that request into a real, persisted placement — but only
// after verifying OWNERSHIP against the shared envelope wallet, so a hand-typed
// URL cannot place an item the student has not bought. It reuses the prop
// library's own commit path (history, Champion File, movable via grab).
import { createProjectStore } from '../city-common/project-store.js';
import { marketItem, marketHandler } from '../city-common/market-catalogue.js';

export const PLACE_QUERY_KEY = 'place';

/** Read the requested market item id from the URL, or null. */
export function readPlaceId(search = (typeof location !== 'undefined' ? location.search : '')) {
  try { return new URLSearchParams(search).get(PLACE_QUERY_KEY) || null; } catch { return null; }
}

/**
 * Place one purchased City item. `store` is the shared wallet; ownership is the
 * gate, not the URL.
 * @returns {Promise<{ok:boolean, kind?:string, instanceId?:string, error?:string}>}
 */
export async function placePurchasedItem({ id, propLibrary, store, position = { x: 0, z: 0 } } = {}) {
  const entry = marketItem(id);
  const handler = marketHandler(id);
  if (!entry || !handler || handler.action !== 'place') return { ok: false, error: 'unknown-item' };
  if (!propLibrary) return { ok: false, error: 'city-not-ready' };
  let owned = [];
  try { owned = (await store?.readEconomy?.())?.owned || []; } catch { owned = []; }
  if (!owned.includes(id)) return { ok: false, error: 'not-owned' };
  if (propLibrary.previewMarketItem) {
    const ok = await propLibrary.previewMarketItem(handler);
    return ok ? { ok: true, preview: true, kind: handler.kind } : { ok: false, error: 'preview-unavailable' };
  }
  const transform = { x: position.x || 0, z: position.z || 0 };
  const instanceId = handler.kind === 'decoration'
    ? await propLibrary.insertProp(handler.propId, transform)
    : await propLibrary.insertLandmark(handler.templateId, transform);
  return instanceId ? { ok: true, kind: handler.kind, instanceId } : { ok: false, error: 'insert-failed' };
}

/**
 * Read `?place=`, open the wallet once, and place the item. Returns null when no
 * placement was requested. Never throws — a failed hand-off must not break boot.
 */
export async function runMarketHandoff({ propLibrary, position, openStore = createProjectStore } = {}) {
  const id = readPlaceId();
  if (!id) return null;
  let store = null;
  try { store = openStore(); await store.openActiveProject(); } catch { store = null; }
  try { return await placePurchasedItem({ id, propLibrary, store, position }); }
  catch { return { ok: false, error: 'handoff-failed' }; }
}

/** Remove `?place=` from the URL so a refresh cannot place a second copy. */
export function clearPlaceRequest(url = (typeof location !== 'undefined' ? location.href : ''), historyLike = globalThis.history) {
  try {
    const next = new URL(url);
    next.searchParams.delete(PLACE_QUERY_KEY);
    historyLike?.replaceState?.(null, '', next.href);
    return true;
  } catch { return false; }
}
