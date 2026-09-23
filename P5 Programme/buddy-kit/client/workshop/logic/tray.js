'use strict';
/**
 * The photo tray — photos that have ARRIVED but have not been told what they are.
 *
 * Why this is its own pure module and not an object literal inside a click handler: the selection
 * rules are exactly the kind of decision that fails silently. `takeChosen` removes-and-returns in
 * one call because filing depends on that being atomic — a half-remove either duplicates photos
 * onto a shelf or drops them on the floor, and neither is visible until a child notices their
 * machine learned the same picture twice.
 *
 * A tray item is {id, vec, chosen}. Deliberately NO name: a tray photo has no identity worth
 * keeping. Its shelf name is assigned positionally at filing (spec §6.3), and keeping the
 * filename out of the model is what makes "filenames are never persisted" structurally true
 * rather than a rule someone has to remember.
 *
 * Pure: no DOM, no File API, no canvas, no clock, no randomness. Thumbnails live beside this in
 * game.js's memory-only `Tray.thumbs`, keyed by the ids this module hands out.
 */

function fail(msg) {
  throw new Error('[tray] ' + msg);
}

/** A fresh, empty tray. `nextId` only ever grows — see the id-collision test. */
function createTray() {
  return { items: [], nextId: 1 };
}

/**
 * Park one photo in the tray.
 * @param {object} tray
 * @param {number[]} vec  the embedding, ALREADY unit-normalised by the caller (distance brains
 *   need unit vectors; the tray does no maths and must not silently change one).
 * @returns {number} the new item's id — the key for its thumbnail
 */
function addItem(tray, vec) {
  if (!Array.isArray(vec) || !vec.length) fail('a tray photo needs a feature vector');
  const item = { id: tray.nextId++, vec: vec, chosen: false };
  tray.items.push(item);
  return item.id;
}

function find(tray, id) {
  return tray.items.find((it) => it.id === id) || null;
}

/** Flip one photo's chosen state. @returns {boolean} the NEW state (not the old one). */
function toggle(tray, id) {
  const it = find(tray, id);
  if (!it) fail('no tray photo with id ' + id);
  it.chosen = !it.chosen;
  return it.chosen;
}

/** Choose (or unchoose) everything. @returns {number} how many ACTUALLY changed. */
function setAllChosen(tray, want) {
  const to = !!want;
  let n = 0;
  for (const it of tray.items) {
    if (it.chosen !== to) { it.chosen = to; n++; }
  }
  return n;
}

/** The chosen photos, in tray order. */
function chosen(tray) {
  return tray.items.filter((it) => it.chosen);
}

/**
 * Remove the chosen photos and hand them back — the filing operation.
 * @returns {object[]} the removed items in tray order; [] (and no mutation) if none were chosen.
 */
function takeChosen(tray) {
  const taken = chosen(tray);
  if (!taken.length) return [];
  tray.items = tray.items.filter((it) => !it.chosen);
  return taken;
}

/** Drop one photo without filing it. @returns {boolean} whether it was there. */
function remove(tray, id) {
  const i = tray.items.findIndex((it) => it.id === id);
  if (i === -1) return false;
  tray.items.splice(i, 1);
  return true;
}

/** {total, chosen} — what the tray header says out loud. */
function counts(tray) {
  return { total: tray.items.length, chosen: chosen(tray).length };
}

const WorkshopTray = { createTray, addItem, toggle, setAllChosen, chosen, takeChosen, remove, counts };
if (typeof module !== 'undefined' && module.exports) module.exports = WorkshopTray;
if (typeof window !== 'undefined') window.WorkshopTray = WorkshopTray;
