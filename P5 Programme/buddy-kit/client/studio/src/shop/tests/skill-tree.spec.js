/**
 * skill-tree.test.js — pure-node coverage for the skill-tree config parser.
 *
 * The parser is the boundary between the developer-authored `public/skill-tree.json` and the rest
 * of the Wave B shop, so these tests deliberately include the REAL shipped config (read with
 * `fs.readFileSync`), a hostile-input fuzz list, and per-rule rejection cases.
 *
 * Discovered and called by `test.mjs`'s `src/shop/tests/*.test.js` block as
 * `export default function skillTreeTests(check)` — the harness does NOT await the call, so this
 * module must be entirely SYNCHRONOUS and use only `check(name, cond)`.
 */

import fs from 'node:fs';
import { SKILL_TREE_FALLBACK, SKILL_TREE_VERSION, normalizeSkillTree } from '../skill-tree.js';

const SHIPPED_PATH = 'public/skill-tree.json';

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

/** A minimal well-formed node; `over` shallow-merges overrides. */
function node(over = {}) {
  return { id: 'ok', name: 'OK', levelReward: 1, coinReward: 5, ...over };
}

/** A minimal well-formed branch; `over` shallow-merges overrides. */
function branch(over = {}) {
  return { id: 'br', name: 'Branch', nodes: [node()], ...over };
}

/** Wrap branches (+ optional categories) into a valid top-level document. */
function tree(branches, categories = []) {
  return { version: 1, categories, branches };
}

/**
 * Run every skill-tree check. Synchronous by contract.
 *
 * @param {(name: string, cond: boolean) => void} check - Harness assertion callback.
 */
export default function skillTreeTests(check) {
  // -------------------------------------------------------------------------------
  // SKILL_TREE_FALLBACK — exact shape and frozen-ness
  // -------------------------------------------------------------------------------
  check('skill-tree: SKILL_TREE_FALLBACK shape', deepEqual(
    SKILL_TREE_FALLBACK,
    { version: 1, categories: [], branches: [] },
  ));
  check('skill-tree: SKILL_TREE_FALLBACK is deeply frozen',
    Object.isFrozen(SKILL_TREE_FALLBACK)
    && Object.isFrozen(SKILL_TREE_FALLBACK.categories)
    && Object.isFrozen(SKILL_TREE_FALLBACK.branches));
  check('skill-tree: SKILL_TREE_VERSION matches the fallback version', SKILL_TREE_VERSION === SKILL_TREE_FALLBACK.version);

  {
    // Mutating a returned fallback must not poison the shared frozen constant.
    const r = normalizeSkillTree(null);
    r.config.categories.push('x');
    r.config.branches.push('y');
    check('skill-tree: fallback arrays are fresh per call', deepEqual(SKILL_TREE_FALLBACK.categories, []) && deepEqual(SKILL_TREE_FALLBACK.branches, []));
  }

  // -------------------------------------------------------------------------------
  // The REAL shipped config — the primary acceptance fixture
  // -------------------------------------------------------------------------------
  const shipped = JSON.parse(fs.readFileSync(SHIPPED_PATH, 'utf8'));
  const shippedSnapshot = clone(shipped);
  const shippedResult = normalizeSkillTree(shipped);

  check('skill-tree: shipped config normalizes with zero errors', shippedResult.errors.length === 0);
  check('skill-tree: shipped config declares version 1', shippedResult.config.version === 1);
  check('skill-tree: shipped config keeps every branch in order', deepEqual(
    shippedResult.config.branches.map((b) => b.id),
    shipped.branches.map((b) => b.id),
  ));
  check('skill-tree: shipped config keeps every node id in order', deepEqual(
    shippedResult.config.branches.flatMap((b) => b.nodes.map((n) => n.id)),
    shipped.branches.flatMap((b) => b.nodes.map((n) => n.id)),
  ));
  check('skill-tree: shipped config has >=3 branches and >=4 nodes',
    shippedResult.config.branches.length >= 3
    && shippedResult.config.branches.reduce((n, b) => n + b.nodes.length, 0) >= 4);
  check('skill-tree: shipped categories are sorted ascending by order', shippedResult.config.categories.every(
    (c, i, arr) => i === 0 || arr[i - 1].order <= c.order,
  ));
  check('skill-tree: shipped nodes resolve parents + integer depths', shippedResult.config.branches.every(
    (b) => b.nodes.every((n, i) => (
      (n.parent === null || typeof n.parent === 'string')
      && Number.isInteger(n.depth) && n.depth >= 0
      && (i === 0 ? n.parent === null || typeof n.parent === 'string' : true)
    )),
  ));
  check('skill-tree: normalizeSkillTree does not mutate raw', deepEqual(shipped, shippedSnapshot));

  {
    // Determinism: identical inputs → identical outputs.
    const again = normalizeSkillTree(clone(shipped));
    check('skill-tree: normalizeSkillTree is deterministic', deepEqual(again.config, shippedResult.config) && deepEqual(again.errors, shippedResult.errors));
  }

  {
    // A valid document round-trips its categories/nodes/rewards unchanged.
    const raw = {
      version: 1,
      categories: [
        { id: 'c2', label: 'Second', icon: '2', order: 2 },
        { id: 'c1', label: 'First', order: 1 },
      ],
      branches: [{ id: 'b', name: 'B', nodes: [node({ id: 'r', name: 'Root', levelReward: 3, coinReward: 30, depth: 0 })] }],
    };
    const snapshot = clone(raw);
    const r = normalizeSkillTree(raw);
    check('skill-tree: valid document round-trips with no errors', r.errors.length === 0);
    check('skill-tree: valid round trip reorders categories by order', deepEqual(
      r.config.categories.map((c) => c.id),
      ['c1', 'c2'],
    ));
    check('skill-tree: valid round trip fills icon default', r.config.categories[0].icon === '');
    check('skill-tree: valid round trip keeps node rewards/depth/parent', deepEqual(
      r.config.branches[0].nodes[0],
      { id: 'r', name: 'Root', levelReward: 3, coinReward: 30, depth: 0, parent: null },
    ));
    check('skill-tree: valid round trip does not mutate raw', deepEqual(raw, snapshot));
  }

  // -------------------------------------------------------------------------------
  // Version drift — WARNS once, still ACCEPTS, never resets
  // -------------------------------------------------------------------------------
  {
    const raw = { version: SKILL_TREE_VERSION + 1, categories: [], branches: [branch({ nodes: [node({ id: 'kept', name: 'Kept' })] })] };
    const r = normalizeSkillTree(raw);
    check('skill-tree: mismatched version warns exactly once', r.errors.length === 1);
    check('skill-tree: mismatched version warning names both versions', r.errors[0].includes(`version ${SKILL_TREE_VERSION + 1}`) && r.errors[0].includes(`supported version ${SKILL_TREE_VERSION}`) && r.errors[0].includes('continuing'));
    check('skill-tree: mismatched version is still accepted (not fallback)', r.config.version === SKILL_TREE_VERSION + 1 && r.config.branches.length === 1 && r.config.branches[0].nodes.length === 1);
    check('skill-tree: mismatched version keeps nodes/normalizes them', deepEqual(
      r.config.branches[0].nodes[0],
      { id: 'kept', name: 'Kept', levelReward: 1, coinReward: 5, depth: 0, parent: null },
    ));
  }

  {
    const r = normalizeSkillTree(tree([branch()]));
    check('skill-tree: current version does not warn', r.errors.length === 0 && r.config.version === SKILL_TREE_VERSION);
  }

  // -------------------------------------------------------------------------------
  // Bad top level — fallback + error, never a throw
  // -------------------------------------------------------------------------------
  check('skill-tree: missing version falls back',
    deepEqual(normalizeSkillTree({ categories: [], branches: [] }).config, { version: 1, categories: [], branches: [] }));
  check('skill-tree: version 0 falls back', normalizeSkillTree({ version: 0, categories: [], branches: [] }).errors.length === 1);
  check('skill-tree: {} falls back', deepEqual(
    normalizeSkillTree({}).config,
    { version: 1, categories: [], branches: [] },
  ));
  check('skill-tree: non-array categories falls back', normalizeSkillTree({ version: 1, categories: 5, branches: [] }).errors.length === 1);
  check('skill-tree: non-array branches falls back', normalizeSkillTree({ version: 1, categories: [], branches: 'n' }).errors.length === 1);
  check('skill-tree: non-object top level falls back', normalizeSkillTree('nope').config.branches.length === 0);

  const FUZZ = [null, undefined, 0, '', [], [1], { version: 'x' }, { version: 0, models: [] }, { version: 1, categories: 5, branches: 'n' }];
  let fuzzThrew = false;
  FUZZ.forEach((input) => {
    try {
      const r = normalizeSkillTree(input);
      if (!(r.errors.length >= 1)) fuzzThrew = true;
      if (!r.config || !deepEqual(r.config, { version: 1, categories: [], branches: [] })) fuzzThrew = true;
    } catch (e) {
      fuzzThrew = true;
    }
  });
  check('skill-tree: fuzz inputs never throw and return fallback + error', !fuzzThrew);

  // -------------------------------------------------------------------------------
  // Category drops + defaults + ordering
  // -------------------------------------------------------------------------------
  {
    const r = normalizeSkillTree(tree([branch()], [
      { id: 'a', label: 'A' },
      { id: 'a', label: 'Dup' },
      { id: '', label: 'NoId' },
      { id: 'nolabel', label: '  ' },
      null,
    ]));
    check('skill-tree: category drops (dup/empty id/blank label/non-object)', r.config.categories.length === 1 && r.errors.length === 4);
    check('skill-tree: category error is indexed/id-prefixed', r.errors[0].includes('categories[1] (a)'));
    check('skill-tree: category order defaults to array index', r.config.categories[0].order === 0 && r.config.categories[0].icon === '');
  }

  {
    const r = normalizeSkillTree(tree([branch()], [
      { id: 'z', label: 'Z', order: 9 },
      { id: 'a', label: 'A', order: -1 },
      { id: 'm', label: 'M', order: 3 },
    ]));
    check('skill-tree: categories sort by explicit order', deepEqual(
      r.config.categories.map((c) => c.id),
      ['a', 'm', 'z'],
    ));
    check('skill-tree: category order value is preserved', r.config.categories.map((c) => c.order).join(',') === '-1,3,9');
  }

  // -------------------------------------------------------------------------------
  // Branch drops
  // -------------------------------------------------------------------------------
  {
    const r = normalizeSkillTree(tree([
      null,
      { name: 'NoId', nodes: [] },
      { id: 'n', name: '  ', nodes: [] },
      { id: 'nn', name: 'NN', nodes: 'x' },
    ]));
    check('skill-tree: branch drops (non-object/empty id/blank name/non-array nodes)', r.config.branches.length === 0 && r.errors.length === 4);
    check('skill-tree: branch error is indexed/id-prefixed', r.errors[2].includes('branches[2] (n)'));
  }

  // -------------------------------------------------------------------------------
  // Node drops — DROP + indexed/id-prefixed error
  // -------------------------------------------------------------------------------
  {
    const r = normalizeSkillTree(tree([branch({ nodes: [
      null,
      node({ id: '' }),
      node({ id: 'noname', name: '   ' }),
      node({ id: 'badlevel', levelReward: -1 }),
      node({ id: 'flt', levelReward: 1.5 }),
      node({ id: 'str', levelReward: '1' }),
    ] })]));
    check('skill-tree: missing id/name/levelReward are all dropped', r.config.branches[0].nodes.length === 0 && r.errors.length === 6);
    check('skill-tree: node error is indexed/id-prefixed', r.errors.find((e) => e.includes('duplicate') === false && e.includes('noname')).includes('(noname)'));
  }

  {
    const r = normalizeSkillTree(tree([branch({ nodes: [node({ id: 'dup' }), node({ id: 'dup', name: 'DUP2' })] })]));
    check('skill-tree: duplicate id within a branch drops the later + error', r.config.branches[0].nodes.length === 1 && r.errors.length === 1);
  }

  {
    const r = normalizeSkillTree(tree([
      branch({ id: 'b1', nodes: [node({ id: 'shared' })] }),
      branch({ id: 'b2', nodes: [node({ id: 'shared', name: 'SHARED2' })] }),
    ]));
    check('skill-tree: duplicate id across branches drops the later + error', r.config.branches[1].nodes.length === 0 && r.errors.length === 1);
    check('skill-tree: cross-branch duplicate error is prefixed', r.errors[0].includes('branches[1] (b2).nodes[0] (shared)'));
  }

  // -------------------------------------------------------------------------------
  // parent resolution — defaulting, explicit, explicit null, dangling
  // -------------------------------------------------------------------------------
  {
    const r = normalizeSkillTree(tree([branch({ nodes: [
      node({ id: 'a', name: 'A' }),
      node({ id: 'b', name: 'B' }),
      node({ id: 'c', name: 'C' }),
    ] })]));
    const n = r.config.branches[0].nodes;
    check('skill-tree: first node defaults parent null', n[0].parent === null && n[0].depth === 0);
    check('skill-tree: later nodes default parent to previous', n[1].parent === 'a' && n[2].parent === 'b');
    check('skill-tree: defaulted parent chain derives depths 0,1,2', n.map((x) => x.depth).join(',') === '0,1,2');
    check('skill-tree: defaulted parents report no errors', r.errors.length === 0);
  }

  {
    const r = normalizeSkillTree(tree([branch({ nodes: [
      node({ id: 'a', name: 'A' }),
      node({ id: 'b', name: 'B', parent: 'a' }),
      node({ id: 'c', name: 'C', parent: null }),
    ] })]));
    const n = r.config.branches[0].nodes;
    check('skill-tree: explicit valid parent is respected', n[1].parent === 'a' && n[1].depth === 1);
    check('skill-tree: explicit null parent is accepted as a root', n[2].parent === null && n[2].depth === 0);
    check('skill-tree: explicit null parent reports no error', r.errors.length === 0);
  }

  {
    const r = normalizeSkillTree(tree([branch({ nodes: [
      node({ id: 'a', name: 'A' }),
      node({ id: 'dangling', name: 'D', parent: 'ghost' }),
      node({ id: 'after', name: 'After' }),
    ] })]));
    const n = r.config.branches[0].nodes;
    check('skill-tree: dangling explicit parent is rejected and the node dropped', n.length === 2 && !n.some((x) => x.id === 'dangling'));
    check('skill-tree: dangling parent error names the rule', r.errors[0].includes('does not resolve to a node in this branch'));
    check('skill-tree: a dropped node does not become the next default parent', n[1].parent === 'a');
  }

  {
    // A parent from ANOTHER branch must not resolve (same-branch only).
    const r = normalizeSkillTree(tree([
      branch({ id: 'b1', nodes: [node({ id: 'x', name: 'X' })] }),
      branch({ id: 'b2', nodes: [node({ id: 'y', name: 'Y', parent: 'x' })] }),
    ]));
    check('skill-tree: cross-branch parent does not resolve', r.config.branches[1].nodes.length === 0 && r.errors.length === 1);
  }

  // -------------------------------------------------------------------------------
  // depth derivation vs. authored inconsistency
  // -------------------------------------------------------------------------------
  {
    const r = normalizeSkillTree(tree([branch({ nodes: [
      node({ id: 'a', name: 'A', depth: 0 }),
      node({ id: 'b', name: 'B', depth: 1 }),
      node({ id: 'c', name: 'C', depth: 2 }),
    ] })]));
    check('skill-tree: consistent authored depth reports no error', r.errors.length === 0);
    check('skill-tree: consistent authored depth is kept', r.config.branches[0].nodes.map((x) => x.depth).join(',') === '0,1,2');
  }

  {
    const r = normalizeSkillTree(tree([branch({ nodes: [
      node({ id: 'a', name: 'A', depth: 0 }),
      node({ id: 'b', name: 'B', depth: 99 }),
    ] })]));
    check('skill-tree: inconsistent authored depth is reported', r.errors.length === 1 && r.errors[0].includes('inconsistent with the derived depth 1'));
    check('skill-tree: inconsistent authored depth uses the derived value', r.config.branches[0].nodes[1].depth === 1);
  }

  {
    const r = normalizeSkillTree(tree([branch({ nodes: [
      node({ id: 'a', name: 'A' }),
      node({ id: 'b', name: 'B', depth: '1' }),
    ] })]));
    check('skill-tree: non-integer authored depth is reported and derived', r.errors[0].includes('inconsistent') && r.config.branches[0].nodes[1].depth === 1);
  }

  // -------------------------------------------------------------------------------
  // coinReward defaulting
  // -------------------------------------------------------------------------------
  {
    const r = normalizeSkillTree(tree([branch({ nodes: [
      node({ id: 'a', name: 'A', coinReward: undefined }),
      node({ id: 'b', name: 'B', coinReward: -1 }),
      node({ id: 'c', name: 'C', coinReward: 1.5 }),
      node({ id: 'd', name: 'D', coinReward: '40' }),
      node({ id: 'e', name: 'E', coinReward: 0 }),
    ] })]));
    check('skill-tree: absent/invalid coinReward defaults to 0', r.config.branches[0].nodes.map((x) => x.coinReward).join(',') === '0,0,0,0,0');
    check('skill-tree: coinReward defaults are NOT errors', r.errors.length === 0);
  }

  {
    const r = normalizeSkillTree(tree([branch({ nodes: [node({ id: 'a', name: 'A', coinReward: 42 })] })]));
    check('skill-tree: valid coinReward is preserved', r.config.branches[0].nodes[0].coinReward === 42);
  }

  // -------------------------------------------------------------------------------
  // Order preservation around a dropped middle node
  // -------------------------------------------------------------------------------
  {
    const r = normalizeSkillTree(tree([branch({ nodes: [
      node({ id: 'a', name: 'A' }),
      node({ id: 'bad', name: 'Bad', levelReward: -1 }),
      node({ id: 'c', name: 'C' }),
    ] })]));
    check('skill-tree: node order preserved around a dropped entry', deepEqual(
      r.config.branches[0].nodes.map((x) => x.id),
      ['a', 'c'],
    ));
  }

  // -------------------------------------------------------------------------------
  // Normalized node shape — exactly the frozen fields, nothing extra
  // -------------------------------------------------------------------------------
  {
    const r = normalizeSkillTree(tree([branch({ nodes: [node({ id: 'n', name: 'N', levelReward: 2, coinReward: 7, depth: 0, extra: 'ignored' })] })]));
    check('skill-tree: normalized node has the frozen shape only', deepEqual(
      r.config.branches[0].nodes[0],
      { id: 'n', name: 'N', levelReward: 2, coinReward: 7, depth: 0, parent: null },
    ));
  }
}
