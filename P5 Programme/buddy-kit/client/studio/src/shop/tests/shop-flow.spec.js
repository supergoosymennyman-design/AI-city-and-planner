/**
 * shop-flow.test.js — the cross-module integration proof for the model shop.
 *
 * The per-module suites (`catalog.test.js`, `unlock.test.js`, `store.test.js`) each prove a
 * unit in isolation. This file proves the COMPOSITION against the real, developer-authored
 * data that actually ships: it reads `public/models/catalog.json` straight off disk, drives
 * the full economy through `catalog.js` + `unlock.js` + `store.js`, then reads every `.glb`
 * the catalog names and verifies it is a real, mesh-bearing GLB. In other words it is the
 * only automated proof that "the shipped config and its assets agree with the engine".
 *
 * It is deliberately PURE and SYNCHRONOUS:
 *  - no `three`, no DOM, no network, no `import.meta.env` — only `node:fs` plus the three
 *    pure shop modules, so `node test.mjs` can discover and call it;
 *  - `test.mjs` does NOT await `mod.default(check)`, so an async module would silently
 *    report green. Everything here is synchronous by contract.
 *  - the cwd is the studio package root (`src/components/my-subtree-folder/`), which is where
 *    `public/models/` lives; the real catalog is read exactly the way the loader will fetch it.
 *
 * Called by `test.mjs`'s discovery block as `export default function shopFlowTests(check)`.
 */

import fs from 'node:fs';
import { normalizeCatalog } from '../catalog.js';
import {
  initialState,
  status,
  purchase,
  grantCoins,
  grantLevel,
  resetEconomy,
} from '../unlock.js';
import { SHOP_VERSION, loadShopState, resetShopState, saveShopState } from '../store.js';

/** The real, shipped catalog — the document every assertion below is measured against. */
const CATALOG_PATH = 'public/models/catalog.json';

/** Folder the catalog's bare `file` names are resolved against. */
const MODELS_DIR = 'public/models/';

/** The four canonical unlock rules, in catalog order. */
const ALL_TYPES = ['free', 'level', 'coins', 'level+coins'];

/** GLB container magic (bytes 0..3) and the JSON chunk type tag (little-endian 'JSON'). */
const GLB_MAGIC = 'glTF';
const GLB_JSON_CHUNK = 0x4e4f534a;

/**
 * Structural deep-equality for plain JSON-shaped values (key order irrelevant).
 * @param {*} a @param {*} b @returns {boolean}
 */
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every(
    (k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]),
  );
}

/**
 * Parse the shipped catalog from disk, or return `null` when unreadable/unparseable so the
 * flow degrades without throwing.
 * @returns {object|null}
 */
function readRealCatalog() {
  try {
    return JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  } catch (err) {
    return null;
  }
}

/**
 * Inspect one catalog-referenced `.glb`: does it exist, carry the `glTF` magic, and declare
 * at least one mesh in its JSON chunk? Never throws.
 *
 * A GLB is: `glTF` magic (4) · version (u32) · total length (u32) · then chunks, each
 * `length (u32) · type (u32) · data`. Chunk 0 is JSON when its type tag is 0x4E4F534A.
 *
 * @param {string} file - Bare filename from the catalog (already validated by the parser).
 * @returns {{exists: boolean, magic: boolean, meshes: number, failed: boolean}}
 */
function inspectGlb(file) {
  const info = { exists: false, magic: false, meshes: 0, failed: false };
  try {
    const buf = fs.readFileSync(MODELS_DIR + file);
    info.exists = true;
    info.magic = buf.length >= 4 && buf.toString('ascii', 0, 4) === GLB_MAGIC;
    if (buf.length >= 20) {
      const chunkLength = buf.readUInt32LE(12);
      const chunkType = buf.readUInt32LE(16);
      if (chunkType === GLB_JSON_CHUNK && 20 + chunkLength <= buf.length) {
        const json = JSON.parse(buf.toString('utf8', 20, 20 + chunkLength));
        info.meshes = Array.isArray(json.meshes) ? json.meshes.length : 0;
      }
    }
  } catch (err) {
    info.failed = true;
  }
  return info;
}

/**
 * Run the entire ten-step flow once and return a snapshot of its final values.
 *
 * Every step reports through `check(name, cond)` so a failure names the exact invariant that
 * broke; the returned snapshot is what the determinism comparison deep-compares across two
 * independent runs.
 *
 * @param {(name: string, cond: boolean) => void} check - Harness assertion callback.
 * @param {string} prefix - Prefix for every check name (e.g. `shop-flow`).
 * @returns {{final: object}} The captured end state of this run.
 */
function runFlow(check, prefix) {
  const label = (name) => `${prefix}: ${name}`;
  const snap = {};

  // --- Step 1: the shipped catalog parses cleanly and covers every rule -------------------
  const raw = readRealCatalog();
  const { catalog, errors } = normalizeCatalog(raw);
  const types = [...new Set(catalog.models.map((m) => m.unlock.type))].sort();
  const ids = catalog.models.map((m) => m.id);
  snap.catalog = { ids, types, errors };

  check(label('1 shipped catalog normalizes with zero errors'), errors.length === 0);
  check(
    label('1 shipped catalog covers all four unlock types'),
    deepEqual(types, [...ALL_TYPES].sort()),
  );
  check(label('1 shipped catalog declares exactly six models'), catalog.models.length === 6);

  const findModel = (id) => catalog.models.find((m) => m.id === id);

  // --- Step 2: the starting economy comes from the catalog ---------------------------------
  const start = initialState(catalog);
  snap.start = start;
  check(
    label('2 initialState is 120 coins / level 1 / nothing owned'),
    deepEqual(start, { coins: 120, level: 1, owned: [] }),
  );

  // --- Step 3: status() reports the right booleans for each of the four rules at level 1 ---
  const byType = {};
  for (const t of ALL_TYPES) byType[t] = catalog.models.find((m) => m.unlock.type === t);
  const freeStatus = status(start, byType.free);
  const levelStatus = status(start, byType.level);
  const coinsStatus = status(start, byType.coins);
  const comboStatus = status(start, byType['level+coins']);
  snap.statuses = { free: freeStatus, level: levelStatus, coins: coinsStatus, combo: comboStatus };

  check(
    label('3 free rule is unlocked and buyable at level 1'),
    freeStatus.unlocked === true && freeStatus.canBuy === true,
  );
  check(
    label('3 level rule is locked at level 1'),
    levelStatus.unlocked === false && levelStatus.canBuy === false,
  );
  check(
    label('3 coins rule is locked but buyable at 120 coins'),
    coinsStatus.unlocked === false && coinsStatus.canBuy === true,
  );
  check(
    label('3 level+coins rule is locked while its level is unmet'),
    comboStatus.unlocked === false && comboStatus.canBuy === false,
  );

  // --- Step 4: a coin purchase deducts exactly once, ever ----------------------------------
  const rocket = findModel('rocket-cone');
  const buy1 = purchase(start, rocket);
  const buy2 = purchase(buy1.state, rocket);
  snap.rocketBuy = { state1: buy1.state, state2: buy2.state, ok1: buy1.ok, ok2: buy2.ok };
  check(
    label('4 buying rocket-cone succeeds and deducts exactly 40'),
    buy1.ok === true && buy1.state.coins === 80,
  );
  check(
    label('4 buying rocket-cone again is a no-op (no double charge)'),
    buy2.ok === true && buy2.state.coins === 80,
  );

  // --- Step 5: reaching a level auto-unlocks its level-rule models for free ----------------
  const levelGrant = grantLevel(initialState(catalog), catalog, 2);
  const bouncy = findModel('bouncy-sphere');
  const bouncyBought = purchase(levelGrant, bouncy);
  snap.levelGrant = { state: levelGrant, bought: bouncyBought };
  check(
    label('5 grantLevel(2) auto-unlocks bouncy-sphere'),
    levelGrant.owned.includes('bouncy-sphere'),
  );
  check(
    label('5 grantLevel leaves coins unchanged'),
    levelGrant.coins === initialState(catalog).coins,
  );
  check(
    label('5 buying an auto-unlocked model is a free no-op'),
    bouncyBought.ok === true && deepEqual(bouncyBought.state, levelGrant),
  );

  // --- Step 6: a level+coins model needs BOTH gates, then deducts exactly once -------------
  const gate = { coins: 80, level: 2, owned: [] };
  const golden = findModel('golden-cylinder');
  const refused = purchase(gate, golden);
  snap.comboRefused = refused.state;
  check(
    label('6 golden-cylinder is refused at level 2 with 80 coins'),
    refused.ok === false && deepEqual(refused.state, gate),
  );

  const funded = grantCoins(grantLevel(gate, catalog, 3), 40);
  const goldenBought = purchase(funded, golden);
  snap.comboBought = { funded, result: goldenBought };
  check(
    label('6 golden-cylinder succeeds once level and coins are met, deducting exactly 120'),
    goldenBought.ok === true &&
      funded.coins === 120 &&
      goldenBought.state.coins === funded.coins - 120,
  );

  // --- Step 7: resetEconomy re-locks everything back to the catalog defaults ---------------
  const reset = resetEconomy(catalog);
  snap.reset = reset;
  check(
    label('7 resetEconomy returns 120 coins / level 1 / nothing owned'),
    deepEqual(reset, { coins: 120, level: 1, owned: [] }),
  );

  // --- Step 8: store round-trips the economy + placements across a save/load ---------------
  const storeState = {
    version: SHOP_VERSION,
    coins: 80,
    level: 3,
    owned: ['starter-cube', 'rocket-cone'],
    placed: [
      { id: 7, modelId: 'golden-cylinder', p: [1, 2, 3], q: [0, 0, 0, 1], s: [0.5, 0.5, 0.5] },
    ],
    nextPlacementId: 8,
    collapsed: false,
    sidebarWidth: 240,
    achieved: [],
    unlockedNodes: [],
  };
  resetShopState();
  saveShopState(storeState);
  const loaded = loadShopState({ coins: 120, level: 1 });
  snap.store = loaded;
  const placement = Array.isArray(loaded.placed) ? loaded.placed[0] : null;
  const trsOk =
    placement !== null &&
    placement.p.length === 3 &&
    placement.q.length === 4 &&
    placement.s.length === 3;
  check(
    label('8 save -> load round-trips the state including a 3/4/3 placement'),
    deepEqual(loaded, storeState) && trsOk,
  );
  check(
    label('8 nextPlacementId respects the max placed id'),
    loaded.nextPlacementId === 8,
  );

  // --- Step 9: an invalid grant amount is an inert no-op, never a throw --------------------
  const base = { coins: 50, level: 1, owned: [] };
  let grantThrew = false;
  let negative;
  let fractional;
  try {
    negative = grantCoins(base, -5);
    fractional = grantCoins(base, 1.5);
  } catch (err) {
    grantThrew = true;
  }
  snap.grantNoops = { negative, fractional };
  check(
    label('9 grantCoins(-5) / grantCoins(1.5) are no-ops and never throw'),
    grantThrew === false && deepEqual(negative, base) && deepEqual(fractional, base),
  );

  // --- Step 10: every catalog entry has a real, renderable GLB behind it -------------------
  const glb = {};
  for (const model of catalog.models) {
    const info = inspectGlb(model.file);
    glb[model.id] = info;
    check(
      label(`10 ${model.id} has a real GLB with at least one mesh`),
      info.exists === true && info.magic === true && info.meshes >= 1,
    );
  }
  snap.glb = glb;

  return { final: snap };
}

/**
 * Run every shop-flow check. Synchronous by contract.
 *
 * @param {(name: string, cond: boolean) => void} check - Harness assertion callback.
 */
export default function shopFlowTests(check) {
  let first = null;
  let second = null;
  let threw = false;

  try {
    first = runFlow(check, 'shop-flow');
    second = runFlow(check, 'shop-flow determinism');
  } catch (err) {
    threw = true;
  }

  check('shop-flow: the full flow never throws', threw === false);
  check(
    'shop-flow: two full runs produce deep-equal final states (deterministic)',
    threw === false && deepEqual(first && first.final, second && second.final),
  );
}
