// progress.js — pure parse/merge for the Academy's `p5_pregame_progress` value.
//
// Lives in city-common (copied wholesale into the bundle) rather than inside
// city-pregame/ because the deploy script whitelists pregame files one by one;
// keeping it here needs no deploy-script change and makes it Node-importable
// for tests. It is DOM/localStorage-free.
//
// The stored value is a flat map of finished rooms, kept that way for backward
// compatibility (older saves are just `{ "1": true, "2": true }`). A reserved
// `__checkpoint` key carries the resumable room + hint levels. It is a
// non-numeric key, so legacy readers that only look at room numbers ignore it,
// and it is NOT a new localStorage key / CF_KEY — the Champion File continues
// to round-trip the whole value untouched.
//
// Kept DOM/localStorage-free so it can be unit-tested.

export const CHECKPOINT_KEY = '__checkpoint';
export const CHECKPOINT_V = 1;

/** Parse a raw stored object into { completed, checkpoint }. Tolerates any shape. */
export function parseProgress(raw, roomCount) {
  const obj = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
  const completed = {};
  for (const [k, v] of Object.entries(obj)) {
    const room = Number(k);
    if (Number.isInteger(room) && room >= 1 && room <= roomCount && v) completed[room] = true;
  }

  const cp = obj[CHECKPOINT_KEY];
  let checkpoint = null;
  if (cp && typeof cp === 'object' && !Array.isArray(cp)) {
    const cr = cp.currentRoom;
    checkpoint = {
      v: Number.isInteger(cp.v) ? cp.v : CHECKPOINT_V,
      currentRoom: Number.isInteger(cr) && cr >= 1 && cr <= roomCount ? cr : null,
      hintLevel: (cp.hintLevel && typeof cp.hintLevel === 'object' && !Array.isArray(cp.hintLevel))
        ? { ...cp.hintLevel }
        : {},
    };
  }
  return { completed, checkpoint };
}

/**
 * Merge the current state into the previously stored value. Room completions
 * from other tabs are preserved (`base`), and the checkpoint is rewritten.
 */
export function mergeProgress(base, completed, checkpoint) {
  const prev = (base && typeof base === 'object' && !Array.isArray(base)) ? base : {};
  const next = { ...prev };
  delete next[CHECKPOINT_KEY];
  for (const room of Object.keys(completed || {})) {
    if (completed[room]) next[room] = true;
  }
  next[CHECKPOINT_KEY] = {
    v: CHECKPOINT_V,
    currentRoom: (checkpoint && Number.isInteger(checkpoint.currentRoom)) ? checkpoint.currentRoom : null,
    hintLevel: (checkpoint && checkpoint.hintLevel && typeof checkpoint.hintLevel === 'object')
      ? checkpoint.hintLevel
      : {},
  };
  return next;
}
