/**
 * catalog.js — the pure parser/normalizer for the developer-authored model-shop catalog.
 *
 * `public/models/catalog.json` is hand-edited and therefore untrusted at runtime: the
 * loader `fetch`es it and the test harness also reads it straight off disk. This module
 * is the single place that turns that document into a safe internal shape, so it must be:
 *
 *  - PURE: no DOM, no `fetch`, no `localStorage`, no `import.meta.env`, no `three`. Node
 *    imports it directly under `node test.mjs` and via `--input-type=module -e`.
 *  - TOTAL: `normalizeCatalog` NEVER throws. Any malformed input degrades to a safe value
 *    plus a human-readable error string, so a broken config can never crash the studio.
 *  - NON-MUTATING: it never edits the caller's object and it preserves model order.
 *
 * Invalid model entries are DROPPED and reported with an index/id prefix — never silently
 * coerced. In particular an unknown `unlock.type` is rejected, NOT quietly treated as `free`.
 */

import { UNLOCK_TYPES } from './unlock.js';

/**
 * The safe value returned whenever the top level is unusable. Treat as immutable.
 * Frozen (with its `models` array) so no consumer can mutate the global fallback.
 *
 * @type {Readonly<{version:number, startingCoins:number, startingLevel:number, models:ReadonlyArray<never>}>}
 */
export const CATALOG_FALLBACK = Object.freeze({ version: 1, startingCoins: 120, startingLevel: 1, models: Object.freeze([]) });

/**
 * Lookup table from a lowercased/trimmed `unlock.type` string to its canonical name.
 * Aliases fold onto `level+coins` so a developer can write it several natural ways.
 */
const UNLOCK_ALIASES = {
  free: 'free',
  level: 'level',
  coins: 'coins',
  'level+coins': 'level+coins',
  'coins+level': 'level+coins',
  levelandcoins: 'level+coins',
  both: 'level+coins',
};

/** A catalog `file` must be a bare filename in `public/models/` — no paths, no URLs. */
export const FILE_RE = /^[A-Za-z0-9._-]+\.glb$/;

/** Category used when a model omits `category`. */
const DEFAULT_CATEGORY = 'Models';

/**
 * Normalize an unlock rule name to its canonical form.
 *
 * Case-insensitive and whitespace-tolerant; accepts the aliases `coins+level`,
 * `levelandcoins`, and `both` (all → `level+coins`).
 *
 * @param {unknown} raw - The developer-authored `unlock.type` value.
 * @returns {'free'|'level'|'coins'|'level+coins'|null} Canonical name, or `null` if unknown.
 */
export function normalizeUnlockType(raw) {
  if (typeof raw !== 'string') return null;
  const key = raw.trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(UNLOCK_ALIASES, key) ? UNLOCK_ALIASES[key] : null;
}

/** @param {unknown} v @returns {boolean} True for a non-null, non-array object. */
function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** @param {unknown} v @returns {boolean} True for a finite, non-negative integer. */
function isNonNegInt(v) {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

/** @param {unknown} v @returns {boolean} True for a string containing non-whitespace. */
function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim() !== '';
}

/** @returns {object} A fresh catalog value matching `CATALOG_FALLBACK` (no shared array). */
function freshFallback() {
  return {
    version: CATALOG_FALLBACK.version,
    startingCoins: CATALOG_FALLBACK.startingCoins,
    startingLevel: CATALOG_FALLBACK.startingLevel,
    models: [],
  };
}

/**
 * Build the `models[i] (id)` error prefix, omitting the id when it is unusable.
 *
 * @param {number} index - Position of the entry in the raw `models` array.
 * @param {unknown} id - The entry's `id`, when it is a usable string.
 * @returns {string}
 */
function modelPrefix(index, id) {
  return isNonEmptyString(id) ? `models[${index}] (${id})` : `models[${index}]`;
}

/**
 * Validate and normalize an untrusted catalog document. Never throws, never mutates `raw`,
 * and preserves model order; invalid entries are dropped and described in `errors`.
 *
 * @param {unknown} raw - The parsed contents of `public/models/catalog.json`.
 * @returns {{catalog: object, errors: string[]}} A safe catalog plus human-readable messages.
 */
export function normalizeCatalog(raw) {
  const errors = [];

  // --- top level -----------------------------------------------------------------
  if (!isPlainObject(raw)) {
    return { catalog: freshFallback(), errors: ['catalog: expected a JSON object'] };
  }
  if (!isNonNegInt(raw.version) || raw.version <= 0) {
    return { catalog: freshFallback(), errors: ['catalog: version must be a positive integer'] };
  }
  if (!Array.isArray(raw.models)) {
    return { catalog: freshFallback(), errors: ['catalog: models must be an array'] };
  }

  // --- economy starting values (fall back per field, keep parsing models) ---------
  let startingCoins = raw.startingCoins;
  if (!isNonNegInt(startingCoins)) {
    errors.push('catalog: startingCoins must be a non-negative integer');
    startingCoins = CATALOG_FALLBACK.startingCoins;
  }
  let startingLevel = raw.startingLevel;
  if (!isNonNegInt(startingLevel)) {
    errors.push('catalog: startingLevel must be a non-negative integer');
    startingLevel = CATALOG_FALLBACK.startingLevel;
  }

  // --- models --------------------------------------------------------------------
  const seenIds = new Set();
  const models = [];

  for (let i = 0; i < raw.models.length; i += 1) {
    const entry = raw.models[i];

    if (!isPlainObject(entry)) {
      errors.push(`models[${i}]: expected an object`);
      continue;
    }

    const id = entry.id;
    if (!isNonEmptyString(id)) {
      errors.push(`models[${i}]: id must be a non-empty string`);
      continue;
    }
    if (seenIds.has(id)) {
      errors.push(`${modelPrefix(i, id)}: duplicate id`);
      continue;
    }

    if (!isNonEmptyString(entry.name)) {
      errors.push(`${modelPrefix(i, id)}: name must be a non-empty string`);
      continue;
    }

    const file = entry.file;
    if (typeof file !== 'string' || file.includes('..') || !FILE_RE.test(file)) {
      errors.push(`${modelPrefix(i, id)}: file must be a bare .glb filename`);
      continue;
    }

    if (!isPlainObject(entry.unlock)) {
      errors.push(`${modelPrefix(i, id)}: unlock must be an object`);
      continue;
    }
    const type = normalizeUnlockType(entry.unlock.type);
    if (type === null) {
      errors.push(
        `${modelPrefix(i, id)}: unlock.type must be one of ${UNLOCK_TYPES.join(', ')}`,
      );
      continue;
    }

    // Only copy the numbers a rule actually needs, so the internal shape is canonical.
    const unlock = { type };
    if (type === 'level' || type === 'level+coins') {
      if (!isNonNegInt(entry.unlock.level)) {
        errors.push(
          `${modelPrefix(i, id)}: unlock.level must be a non-negative integer for type ${type}`,
        );
        continue;
      }
      unlock.level = entry.unlock.level;
    }
    if (type === 'coins' || type === 'level+coins') {
      if (!isNonNegInt(entry.unlock.coins)) {
        errors.push(
          `${modelPrefix(i, id)}: unlock.coins must be a non-negative integer for type ${type}`,
        );
        continue;
      }
      unlock.coins = entry.unlock.coins;
    }

    const category = isNonEmptyString(entry.category) ? entry.category : DEFAULT_CATEGORY;
    const description = typeof entry.description === 'string' ? entry.description : '';

    seenIds.add(id);
    models.push({ id, name: entry.name, category, file, description, unlock });
  }

  return { catalog: { version: raw.version, startingCoins, startingLevel, models }, errors };
}
