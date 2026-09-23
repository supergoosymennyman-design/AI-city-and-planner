import { defaultLayout, validateLayout } from './layout.js';

export const NEW_CITY_DRAFT_KEY = 'p5_city_new_draft_v1';

export function readNewCityDraft(storage = globalThis.sessionStorage) {
  try {
    const raw = storage.getItem(NEW_CITY_DRAFT_KEY);
    if (!raw) return null;
    const layout = JSON.parse(raw);
    return validateLayout(layout).ok ? layout : null;
  } catch { return null; }
}

export function writeNewCityDraft(layout, storage = globalThis.sessionStorage) {
  if (!validateLayout(layout).ok) return false;
  try { storage.setItem(NEW_CITY_DRAFT_KEY, JSON.stringify(layout)); return true; }
  catch { return false; }
}

export function resetNewCityDraft(storage = globalThis.sessionStorage) {
  const layout = defaultLayout();
  return writeNewCityDraft(layout, storage) ? layout : null;
}
