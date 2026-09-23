/**
 * persist.js — IndexedDB persistence for the studio's two auto-saved things:
 *  1. the CHAMPION document (the shapes + skeleton + current selection) so an
 *     accidental reload does not erase progress, and
 *  2. the GEAR WARDROBE (the currently-fitted pieces) so a reload re-wears them.
 *
 * Both are keyed values in one IDB store, each carrying its own FORMAT marker so
 * a store written by an older version is rejected on load instead of being
 * silently mis-read (a mismatched format must fall back to a fresh start, loudly).
 *
 * The champion snapshot is the same plain-JSON serialization the undo system uses
 * (takeSnapshot/restoreSnapshot), so persistence and undo agree on what a document
 * is. Wardrobe entries are serialized as baked fitted GLBs (championFit + fitLocal)
 * via the fit engine — the same bytes the user can download — so a restored piece
 * re-attaches at the exact authored pose.
 */
const DB_NAME = 'champion-studio-v2';
const STORE = 'app';
const CHAMPION_KEY = 'champion';
const WARDROBE_KEY = 'wardrobe';
const CHAMPION_FORMAT = 2; // 2: the tapped skeleton rides `snapshot.rig` (task 014); 1 carried the template rig
const WARDROBE_FORMAT = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(key, value) {
  return openDB().then((db) =>
    new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    }),
  );
}

function idbGet(key) {
  return openDB().then((db) =>
    new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const get = tx.objectStore(STORE).get(key);
      tx.oncomplete = () => { db.close(); resolve(get.result); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    }),
  );
}

/** Save the champion document snapshot. `getSnapshot` must return a plain object
 * (from takeSnapshot) or null to clear. */
export function saveChampionState(getSnapshot) {
  let snapshot = null;
  try {
    snapshot = getSnapshot();
  } catch (err) {
    console.error('[persist] champion snapshot failed:', err);
    return Promise.resolve();
  }
  if (!snapshot) return clearKey(CHAMPION_KEY);
  return idbPut(CHAMPION_KEY, { format: CHAMPION_FORMAT, snapshot });
}

/** Save the current wardrobe as baked fitted GLBs. `pieces` is an array of
 * {name, slot, buffer} already built by the fit engine's serializeWardrobe().
 * An EMPTY array is saved as such — do not resurrect old pieces. */
export function saveWardrobeState(pieces) {
  return idbPut(WARDROBE_KEY, { format: WARDROBE_FORMAT, pieces: Array.isArray(pieces) ? pieces : [] });
}

function clearKey(key) {
  return openDB().then((db) =>
    new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    }),
  );
}

/** Load the persisted champion snapshot. Returns the snapshot object, or null when
 * none was saved OR the stored format is stale (loud console warning). */
export async function loadChampionState() {
  const rec = await idbGet(CHAMPION_KEY);
  if (!rec) return null;
  if (rec.format !== CHAMPION_FORMAT) {
    console.warn('[persist] stored champion format ' + rec.format + ' != ' + CHAMPION_FORMAT +
      ' — ignoring (fresh start). Re-save by editing the champion.');
    return null;
  }
  return rec.snapshot || null;
}

/** Load the persisted wardrobe. Returns an array of {name, slot, buffer}|null pieces.
 * Returns [] for a saved-empty wardrobe, null when never saved or stale-format. */
export async function loadWardrobeState() {
  const rec = await idbGet(WARDROBE_KEY);
  if (!rec) return null;
  if (rec.format !== WARDROBE_FORMAT) {
    console.warn('[persist] stored wardrobe format ' + rec.format + ' != ' + WARDROBE_FORMAT +
      ' — ignoring (fresh). Re-save by fitting gear in Fit mode.');
    return null;
  }
  return Array.isArray(rec.pieces) ? rec.pieces : null;
}

/** Convenience: restore both in the right order. Returns {champion, wardrobe}. */
export async function loadAppState() {
  const champion = await loadChampionState();
  const wardrobe = await loadWardrobeState();
  return { champion, wardrobe };
}

/** Clear both (used by "New document"). */
export function clearAppState() {
  return Promise.all([clearKey(CHAMPION_KEY), clearKey(WARDROBE_KEY)]);
}