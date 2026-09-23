/**
 * toolbox/consent.js — the mic asks first (Composing Arc Plan A, task 2's own module): a tiny,
 * GENERIC yes/no consent store. There is no earlier home to promote this from — none exists
 * anywhere in the repo (swept 2026-09-04) — the Microphone is the first caller to need one, and
 * builds it at toolbox level (R6) so a K2 game, or a future camera/cloud gate, can share it.
 *
 * Values: 'yes' | 'no' | null. `null` covers every "no real answer" case on purpose — never
 * asked yet, no storage available at all, a storage call that THREW (private browsing, a full
 * quota, storage disabled), or a stored value that is not one of the two real answers (a future
 * version's own value, a hand-edited devtools entry). A caller never has to tell those apart —
 * "ask again" is the one safe default for all of them; consent is never ASSUMED.
 *
 * Storage defaults to the real `window.localStorage`. Every call also takes an OPTIONAL storage
 * argument — the plain `{getItem(key), setItem(key,value)}` shape `localStorage` itself already
 * has, so a production caller never needs to build a wrapper — letting a test inject a fake or a
 * throwing stand-in (`node --test` has no `window` at all). Every read/write is wrapped in its
 * own try/catch (the ChampionFile/`workshop.champion` idiom game.js already follows around ITS
 * own localStorage calls): a device where storage throws must degrade to "never asked", not
 * crash the caller.
 *
 * Globals: window.WorkshopConsent. CommonJS-exported for node --test.
 */
'use strict';

/** Named keys every caller shares, so nobody hand-types the raw string twice. `stt` is the
 *  Microphone's own gate (R6, `workshop.consent.stt`) — the only key this build uses, but the
 *  module itself is not limited to it: `get`/`set` accept ANY string a future caller invents. */
var KEYS = { stt: 'workshop.consent.stt' };

/** `window.localStorage` if one exists (a real browser tab), else `null` (node --test, or a
 *  page that never provided one). Resolved FRESH on every call rather than cached once, so a
 *  caller that swaps or clears `window.localStorage` between calls is honoured immediately —
 *  and so the `typeof window` guard alone is enough; there is nothing to grab at module-load
 *  time under node, where `window` does not exist yet either.
 * @returns {Storage|null}
 */
function defaultStorage() {
  try { return (typeof window !== 'undefined' && window.localStorage) ? window.localStorage : null; }
  catch (e) { return null; } // some embedders throw just reading localStorage (privacy settings)
}

/**
 * Read a stored consent decision.
 * @param {string} key e.g. `KEYS.stt`, or any caller-chosen string
 * @param {{getItem:function(string):*}} [storage] injectable; defaults to `window.localStorage`
 * @returns {'yes'|'no'|null} 'yes'/'no' if that is exactly what is stored; `null` for everything
 *   else (never asked, no storage, a throwing storage, or a stored value that is not 'yes'/'no')
 */
function get(key, storage) {
  var s = storage || defaultStorage();
  if (!s) return null;
  try {
    var v = s.getItem(key);
    return (v === 'yes' || v === 'no') ? v : null;
  } catch (e) { return null; } // private mode / disabled storage — "never asked" is the safe read
}

/**
 * Record a consent decision. Best-effort, like ChampionFile's own save path in game.js: a value
 * that is not exactly 'yes'/'no', a missing storage, or a storage call that throws all silently
 * no-op rather than raising — a consent WRITE must never be the thing that crashes a caller.
 * @param {string} key e.g. `KEYS.stt`, or any caller-chosen string
 * @param {'yes'|'no'} value anything else is a no-op (never stores junk `get` would have to
 *   filter back out)
 * @param {{setItem:function(string,string):*}} [storage] injectable; defaults to
 *   `window.localStorage`
 * @returns {void}
 */
function set(key, value, storage) {
  if (value !== 'yes' && value !== 'no') return;
  var s = storage || defaultStorage();
  if (!s) return;
  try { s.setItem(key, value); } catch (e) { /* private mode / full quota — best-effort only */ }
}

var API = { get: get, set: set, KEYS: KEYS };
if (typeof window !== 'undefined') window.WorkshopConsent = API;
if (typeof module !== 'undefined' && module.exports) module.exports = API;
