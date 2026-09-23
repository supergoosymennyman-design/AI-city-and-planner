import { validateLayout } from './layout.js';

export const EXAMPLE_DRAFT_KEY = 'p5_city_example_draft_v1';

export function readExampleDraft(storage = globalThis.sessionStorage) {
  try {
    const raw = storage.getItem(EXAMPLE_DRAFT_KEY);
    if (!raw) return null;
    const layout = JSON.parse(raw);
    return validateLayout(layout).ok ? layout : null;
  } catch { return null; }
}

export function writeExampleDraft(layout, storage = globalThis.sessionStorage) {
  if (!validateLayout(layout).ok) return false;
  try { storage.setItem(EXAMPLE_DRAFT_KEY, JSON.stringify(layout)); return true; }
  catch { return false; }
}
