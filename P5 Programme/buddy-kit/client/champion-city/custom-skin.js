// custom-skin.js — persist the child's uploaded "fitted champion" GLB (from
// Fit Studio) in IndexedDB and hand out object URLs for the champion skin.
//
// 100% client-side: the GLB never leaves the device (no child PII, no server).
// The uploaded model behaves like any other skin in the 🎨 sidebar, except its
// source file lives in the browser instead of the bundle. Survives reloads so
// the fitted champion is the default next time the child opens the city.

const DB_NAME = 'p5_champion_custom_skin';
const DB_VERSION = 1;
const STORE = 'skins';
const KEY = 'custom';

// Safety cap — a dressed "fitted champion" (base + all accessories) from Fit
// Studio can exceed 30 MB (the base alone is ~24 MB; the full-fit sample is
// ~50 MB), so allow up to 64 MB. Anything bigger is almost certainly the
// wrong file.
export const CUSTOM_SKIN_MAX_BYTES = 64 * 1024 * 1024;   // 64 MB

function openDb() {
  return new Promise((resolve, reject) => {
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) { reject(e); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Store the uploaded GLB in IndexedDB. The bytes are stored as an ArrayBuffer (NOT the
 *  File/Blob object) because Safari's IndexedDB is unreliable at structured-cloning Blob/File
 *  values (DataCloneError/UnknownError) — ArrayBuffer storage works in every browser. */
export async function saveCustomSkin(file) {
  const buf = await file.arrayBuffer();   // Safari-safe: raw bytes, not a Blob
  const db = await openDb();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(buf, KEY);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    } catch (e) { db.close(); reject(e); }
  });
}

/** Read the stored GLB back as a Blob (reconstructed from the saved ArrayBuffer), or null. */
export async function loadCustomSkinBlob() {
  let db;
  try { db = await openDb(); } catch (e) { return null; }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => {
        const v = req.result;
        db.close();
        if (v instanceof Blob) { resolve(v); return; }                // legacy blob entry
        if (v instanceof ArrayBuffer) { resolve(new Blob([v])); return; }   // current path
        resolve(null);
      };
      req.onerror = () => { db.close(); resolve(null); };
    } catch (e) { db.close(); resolve(null); }
  });
}

/** Remove the stored GLB (used by the ✕ remove action on the skin card). */
export async function clearCustomSkin() {
  let db;
  try { db = await openDb(); } catch (e) { return; }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); resolve(); };
    } catch (e) { db.close(); resolve(); }
  });
}

/** object URL for the three.js GLTFLoader. */
export function blobToObjectUrl(blob) {
  try { return URL.createObjectURL(blob); } catch (e) { return null; }
}

export function revokeObjectUrl(url) {
  try { if (url) URL.revokeObjectURL(url); } catch (e) { /* ignore */ }
}

/**
 * Cheap pre-flight check that a picked file is plausibly a GLB:
 * binary magic "glTF" in the first 4 bytes + a sane size. The real proof is
 * the loader succeeding — this just avoids saving junk to IndexedDB.
 */
export async function looksLikeGlb(file) {
  if (!file || typeof file.slice !== 'function') return false;
  if (file.size < 12 || file.size > CUSTOM_SKIN_MAX_BYTES) return false;
  try {
    const head = await file.slice(0, 4).arrayBuffer();
    const b = new Uint8Array(head);
    return b[0] === 0x67 && b[1] === 0x6c && b[2] === 0x54 && b[3] === 0x46;   // 'glTF'
  } catch (e) { return false; }
}
