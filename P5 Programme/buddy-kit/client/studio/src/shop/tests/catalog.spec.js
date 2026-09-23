/**
 * catalog.test.js — pure-node coverage for the model-shop catalog parser.
 *
 * The parser is the boundary between the developer-authored `public/models/catalog.json`
 * and the rest of the shop, so these tests deliberately include the REAL shipped catalog
 * (read with `fs.readFileSync`), a hostile-input fuzz list, and per-rule rejection cases.
 *
 * Discovered and called by `test.mjs`'s `src/shop/tests/*.test.js` block as
 * `export default function catalogTests(check)` — the harness does NOT await the call, so
 * this module must be entirely SYNCHRONOUS and use only `check(name, cond)`.
 */

import fs from 'node:fs';
import { CATALOG_FALLBACK, normalizeCatalog, normalizeUnlockType } from '../catalog.js';

const SHIPPED_PATH = 'public/models/catalog.json';

/** Structural deep-equality for JSON-shaped values (key order is irrelevant). */
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === 'object') {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
  }
  return false;
}

/** JSON clone (all inputs here are JSON-shaped). */
function clone(v) {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}

/** The four canonical rule names, in the order the catalog documents them. */
const ALL_TYPES = ['free', 'level', 'coins', 'level+coins'];

/**
 * Run every catalog check. Synchronous by contract.
 *
 * @param {(name: string, cond: boolean) => void} check - Harness assertion callback.
 */
export default function catalogTests(check) {
  // -------------------------------------------------------------------------------
  // normalizeUnlockType — canonical names, case-insensitivity, aliases, rejections
  // -------------------------------------------------------------------------------
  check('catalog: normalizeUnlockType canonical names', deepEqual(
    ALL_TYPES.map((t) => normalizeUnlockType(t)),
    ALL_TYPES,
  ));
  check('catalog: normalizeUnlockType is case-insensitive', deepEqual(
    ['FREE', 'Level', 'Coins', 'Level+Coins'].map((t) => normalizeUnlockType(t)),
    ALL_TYPES,
  ));
  check('catalog: normalizeUnlockType trims whitespace', normalizeUnlockType('  free  ') === 'free');
  check('catalog: normalizeUnlockType alias coins+level', normalizeUnlockType('coins+level') === 'level+coins');
  check('catalog: normalizeUnlockType alias levelandcoins', normalizeUnlockType('levelandcoins') === 'level+coins');
  check('catalog: normalizeUnlockType alias both (and Both)', normalizeUnlockType('both') === 'level+coins' && normalizeUnlockType('Both') === 'level+coins');
  check('catalog: normalizeUnlockType rejects unknown/non-strings', deepEqual(
    ['gold', '', 42, null, undefined, {}, [], ['free'], true].map((v) => normalizeUnlockType(v)),
    [null, null, null, null, null, null, null, null, null],
  ));

  // -------------------------------------------------------------------------------
  // The REAL shipped catalog — the primary acceptance fixture
  // -------------------------------------------------------------------------------
  const shipped = JSON.parse(fs.readFileSync(SHIPPED_PATH, 'utf8'));
  const shippedSnapshot = clone(shipped);
  const shippedResult = normalizeCatalog(shipped);

  check('catalog: shipped catalog normalizes with zero errors', shippedResult.errors.length === 0);
  check('catalog: shipped catalog keeps all six models', shippedResult.catalog.models.length === 6);
  check('catalog: shipped catalog declares version 1', shippedResult.catalog.version === 1);
  check('catalog: shipped catalog startingCoins/Level', shippedResult.catalog.startingCoins === 120 && shippedResult.catalog.startingLevel === 1);
  check('catalog: shipped catalog covers all four unlock types', deepEqual(
    [...new Set(shippedResult.catalog.models.map((m) => m.unlock.type))].sort(),
    [...ALL_TYPES].sort(),
  ));
  check('catalog: shipped catalog preserves model order', deepEqual(
    shippedResult.catalog.models.map((m) => m.id),
    ['starter-cube', 'bouncy-sphere', 'rocket-cone', 'party-torus', 'golden-cylinder', 'silver-capsule'],
  ));
  check('catalog: shipped catalog emits canonical unlock shapes', deepEqual(
    shippedResult.catalog.models.map((m) => m.unlock),
    [
      { type: 'free' },
      { type: 'level', level: 2 },
      { type: 'coins', coins: 40 },
      { type: 'coins', coins: 80 },
      { type: 'level+coins', level: 3, coins: 120 },
      { type: 'level+coins', level: 5, coins: 200 },
    ],
  ));
  check('catalog: shipped catalog fills category/description defaults', shippedResult.catalog.models.every(
    (m) => typeof m.category === 'string' && m.category !== '' && typeof m.description === 'string',
  ));

  // Never mutate the caller's document.
  check('catalog: normalizeCatalog does not mutate raw', deepEqual(shipped, shippedSnapshot));

  // Determinism: identical inputs → identical outputs.
  const again = normalizeCatalog(clone(shipped));
  check('catalog: normalizeCatalog is deterministic', deepEqual(again.catalog, shippedResult.catalog) && deepEqual(again.errors, shippedResult.errors));

  // CATALOG_FALLBACK shape.
  check('catalog: CATALOG_FALLBACK shape', deepEqual(CATALOG_FALLBACK, { version: 1, startingCoins: 120, startingLevel: 1, models: [] }));

  // -------------------------------------------------------------------------------
  // Bad top level — fallback + error, never a throw
  // -------------------------------------------------------------------------------
  const FUZZ = [null, undefined, 0, '', [], [1], { version: 'x' }, { version: 1, models: 'x' }];
  let fuzzThrew = false;
  FUZZ.forEach((input) => {
    try {
      const r = normalizeCatalog(input);
      if (!(r.errors.length >= 1)) fuzzThrew = true;
      if (!deepEqual(r.catalog, { version: 1, startingCoins: 120, startingLevel: 1, models: [] })) {
        fuzzThrew = true;
      }
    } catch (e) {
      fuzzThrew = true;
    }
  });
  check('catalog: fuzz inputs never throw and return fallback + error', !fuzzThrew);

  check('catalog: missing version falls back', normalizeCatalog({ startingCoins: 1, startingLevel: 1, models: [] }).errors.length === 1);
  check('catalog: non-object top level falls back', normalizeCatalog('nope').catalog.models.length === 0);

  // -------------------------------------------------------------------------------
  // Economy starting values — per-field fallback + error
  // -------------------------------------------------------------------------------
  {
    const r = normalizeCatalog({ version: 1, startingCoins: -5, startingLevel: 1.5, models: [] });
    check('catalog: bad startingCoins/Level fall back individually', r.catalog.startingCoins === 120 && r.catalog.startingLevel === 1);
    check('catalog: bad startingCoins/Level are reported', r.errors.length === 2);
  }

  // -------------------------------------------------------------------------------
  // Per-model rejections — DROP + indexed/id-prefixed error
  // -------------------------------------------------------------------------------
  /** A minimal well-formed entry; `over` shallow-merges overrides. */
  const entry = (over = {}) => ({
    id: 'ok',
    name: 'OK',
    category: 'Basics',
    file: 'ok.glb',
    description: 'ok',
    unlock: { type: 'free' },
    ...over,
  });

  const makeCatalog = (models) => ({ version: 1, startingCoins: 1, startingLevel: 1, models });

  {
    const r = normalizeCatalog(makeCatalog([entry(), entry({ id: 'ok' })]));
    check('catalog: duplicate id drops the later entry + error', r.catalog.models.length === 1 && r.errors.length === 1);
    check('catalog: duplicate error is prefixed with index/id', r.errors[0].includes('models[1] (ok)'));
  }

  {
    const r = normalizeCatalog(makeCatalog([entry({ unlock: { type: 'gold' } })]));
    check('catalog: unknown unlock type is DROPPED (not coerced to free)', r.catalog.models.length === 0 && r.errors.length === 1);
    check('catalog: unknown unlock type is not present as free', r.catalog.models.every((m) => m.unlock.type !== 'free'));
  }

  {
    const r = normalizeCatalog(makeCatalog([
      entry({ id: 'neg', unlock: { type: 'coins', coins: -1 } }),
      entry({ id: 'flt', unlock: { type: 'coins', coins: 1.5 } }),
      entry({ id: 'str', unlock: { type: 'coins', coins: '40' } }),
    ]));
    check('catalog: negative/float/string coins dropped', r.catalog.models.length === 0 && r.errors.length === 3);
  }

  {
    const r = normalizeCatalog(makeCatalog([
      entry({ id: 'neg', unlock: { type: 'level', level: -2 } }),
      entry({ id: 'flt', unlock: { type: 'level', level: 2.5 } }),
    ]));
    check('catalog: negative/float level dropped', r.catalog.models.length === 0 && r.errors.length === 2);
  }

  {
    const r = normalizeCatalog(makeCatalog([entry({ file: '../x.glb' })]));
    check('catalog: ../x.glb is rejected', r.catalog.models.length === 0 && r.errors.length === 1);
    check('catalog: file error names the rule', r.errors[0].includes('file must be a bare .glb filename'));
  }

  {
    const bad = ['a/b.glb', 'a\\b.glb', 'https://x.glb', 'x.gltf', '..glb', 'has space.glb'];
    const r = normalizeCatalog(makeCatalog(bad.map((file, i) => entry({ id: `m${i}`, file }))));
    check('catalog: every non-bare/absolute/scheme file is rejected', r.catalog.models.length === 0 && r.errors.length === bad.length);
  }

  {
    const r = normalizeCatalog(makeCatalog([
      entry({ id: '' }),
      entry({ id: 'noname', name: '   ' }),
      entry({ id: 'nounlock', unlock: null }),
      entry({ id: 'combo-no-level', unlock: { type: 'level+coins', coins: 5 } }),
      entry({ id: 'combo-no-coins', unlock: { type: 'level+coins', level: 2 } }),
    ]));
    check('catalog: missing id/name/unlock/required-number are all dropped', r.catalog.models.length === 0 && r.errors.length === 5);
  }

  // -------------------------------------------------------------------------------
  // Aliases + defaults inside a catalog + order preservation with a dropped middle
  // -------------------------------------------------------------------------------
  {
    const r = normalizeCatalog(makeCatalog([
      entry({ id: 'alias', unlock: { type: 'Both', level: 2, coins: 5 } }),
    ]));
    check('catalog: unlock alias normalizes to level+coins shape', deepEqual(
      r.catalog.models[0] && r.catalog.models[0].unlock,
      { type: 'level+coins', level: 2, coins: 5 },
    ));
  }

  {
    const r = normalizeCatalog(makeCatalog([
      entry({ id: 'a' }),
      entry({ id: 'bad', file: '/etc/passwd.glb' }),
      entry({ id: 'c' }),
    ]));
    check('catalog: order preserved around a dropped entry', deepEqual(
      r.catalog.models.map((m) => m.id),
      ['a', 'c'],
    ));
  }

  {
    const r = normalizeCatalog(makeCatalog([
      { id: 'defaults', name: 'Defaults', file: 'd.glb', unlock: { type: 'free' } },
    ]));
    check('catalog: category defaults to Models and description to empty string', r.catalog.models[0].category === 'Models' && r.catalog.models[0].description === '');
  }

  {
    // `free` must stay a bare `{type:'free'}` even if stray level/coins are supplied.
    const r = normalizeCatalog(makeCatalog([entry({ unlock: { type: 'free', level: 9, coins: 9 } })]));
    check('catalog: free unlock drops stray level/coins', deepEqual(r.catalog.models[0].unlock, { type: 'free' }));
  }
}
