/**
 * wardrobe-store.js — the SHARED, PERSISTENT wardrobe between the Fit Studio (index.html) and
 * the Animation Viewer (viewer.html). Same-origin pages share IndexedDB, so the studio bakes
 * every worn piece to a fitted-GLB ArrayBuffer and overwrites the store on EVERY wardrobe change
 * (piece added, piece removed, gizmo drag finished); each page then dresses itself from the
 * store on load. Switching pages never loses gear — the viewer is just the "see it move" view
 * of the same wardrobe, and a piece disappears only when the fitter removes it in the studio.
 *
 * This REPLACED the earlier one-shot handoff.js (read-and-delete + a "See it dance" button):
 * one-shot meant coming BACK to the studio started from scratch, which read as two separate
 * tools instead of one fit-then-watch loop.
 *
 * localStorage is not an option — gear GLBs are megabytes, and structured-cloneable buffers
 * belong in IDB. Nothing here is PII: mesh bytes only.
 */
const DB_NAME = 'champion-studio-wardrobe';
const STORE = 'wardrobe';
const KEY = 'pieces';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Overwrite the stored wardrobe. An EMPTY array is meaningful ("the fitter removed everything")
 * and is saved as such — see loadWardrobe. @param {{name: string, buffer: ArrayBuffer}[]} pieces */
export async function saveWardrobe(pieces) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(pieces, KEY);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/** Read WITHOUT clearing — both pages dress from the same set on every load, indefinitely.
 * Returns [] when a wardrobe was saved empty (respect it: bare champion, do NOT resurrect any
 * default shelf) and null only when the studio has never saved here (fresh visitor — callers may
 * fall back to a demo shelf). @returns {Promise<{name: string, buffer: ArrayBuffer}[]|null>} */
export async function loadWardrobe() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const get = tx.objectStore(STORE).get(KEY);
    tx.oncomplete = () => { db.close(); resolve(Array.isArray(get.result) ? get.result : null); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
