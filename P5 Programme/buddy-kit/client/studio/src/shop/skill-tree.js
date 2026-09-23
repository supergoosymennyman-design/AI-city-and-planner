/**
 * skill-tree.js — the pure parser/normalizer for the developer-authored skill-tree config.
 *
 * `public/skill-tree.json` is hand-edited and therefore untrusted at runtime: the loader
 * `fetch`es it and the test harness also reads it straight off disk. This module is the single
 * place that turns that document into a safe internal shape, so it must be:
 *
 *  - PURE: no DOM, no `fetch`, no `localStorage`, no `import.meta.env`, no `three`. Node imports
 *    it directly under `node test.mjs` and via `--input-type=module -e`.
 *  - TOTAL: `normalizeSkillTree` NEVER throws. Any malformed input degrades to a safe value plus
 *    a human-readable error string, so a broken config can never crash the studio.
 *  - NON-MUTATING: it never edits the caller's object and it preserves category/branch/node order
 *    (categories are the one deliberate exception — they are ORDERED by their `order` field).
 *
 * Invalid entries are DROPPED and reported with an index/id prefix — never silently coerced. In
 * particular a numeric string is NOT a number (`'5'` is rejected), an unknown explicit `parent`
 * is rejected (not quietly rooted), and a duplicate node id across ANY branch is rejected.
 *
 * The tree shape mirrors the catalog parser (`catalog.js`) rule-for-rule, but the two modules are
 * intentionally independent — do NOT import `catalog.js` here.
 */

/**
 * The skill-tree schema version this build understands. `version` in the config is
 * informational-but-checked: a document whose `version` differs still LOADS (progress is never
 * reset), but the mismatch is reported once in `errors` so a stale config is not silent.
 *
 * @type {number}
 */
export const SKILL_TREE_VERSION = 1;

/**
 * The safe value returned whenever the top level is unusable. Treat as immutable.
 * Frozen (with both arrays) so no consumer can mutate the global fallback.
 *
 * @type {Readonly<{version:number, categories:ReadonlyArray<never>, branches:ReadonlyArray<never>}>}
 */
export const SKILL_TREE_FALLBACK = Object.freeze({
  version: SKILL_TREE_VERSION,
  categories: Object.freeze([]),
  branches: Object.freeze([]),
});

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

/**
 * Render an arbitrary value for an error message WITHOUT ever throwing. Built-ins such as a
 * hostile `toString`/`Symbol`/`BigInt` must not break the total contract, so the fallback is
 * wrapped and symbol/bigint are handled explicitly (template literals throw on symbols).
 *
 * @param {unknown} v
 * @returns {string}
 */
function describe(v) {
  try {
    if (typeof v === 'symbol') return v.toString();
    if (typeof v === 'bigint') return `${v}n`;
    if (typeof v === 'string') return JSON.stringify(v);
    if (v === undefined) return 'undefined';
    return String(v);
  } catch {
    return '(unprintable)';
  }
}

/** @returns {object} A fresh config value matching `SKILL_TREE_FALLBACK` (no shared arrays). */
function freshFallback() {
  return {
    version: SKILL_TREE_FALLBACK.version,
    categories: [],
    branches: [],
  };
}

/**
 * Build the `categories[i] (id)` error prefix, omitting the id when it is unusable.
 *
 * @param {number} index - Position of the entry in the raw `categories` array.
 * @param {unknown} id - The entry's `id`, when it is a usable string.
 * @returns {string}
 */
function categoryPrefix(index, id) {
  return isNonEmptyString(id) ? `categories[${index}] (${id})` : `categories[${index}]`;
}

/**
 * Build the `branches[i] (id)` error prefix, omitting the id when it is unusable.
 *
 * @param {number} index - Position of the entry in the raw `branches` array.
 * @param {unknown} id - The entry's `id`, when it is a usable string.
 * @returns {string}
 */
function branchPrefix(index, id) {
  return isNonEmptyString(id) ? `branches[${index}] (${id})` : `branches[${index}]`;
}

/**
 * Build the `branches[bi] (branchId).nodes[ni] (nodeId)` error prefix, omitting ids when unusable.
 *
 * @param {number} bi - Branch index.
 * @param {unknown} branchId - The branch's `id`, when usable.
 * @param {number} ni - Node index within the branch.
 * @param {unknown} nodeId - The node's `id`, when usable.
 * @returns {string}
 */
function nodePrefix(bi, branchId, ni, nodeId) {
  const base = `${branchPrefix(bi, branchId)}.nodes[${ni}]`;
  return isNonEmptyString(nodeId) ? `${base} (${nodeId})` : base;
}

/**
 * Validate and normalize an untrusted skill-tree document. Never throws, never mutates `raw`,
 * preserves branch/node order, and sorts `categories` by `order`; invalid entries are dropped
 * and described in `errors`.
 *
 * Top-level `version`: a positive integer is required to accept the document. A version that
 * differs from `SKILL_TREE_VERSION` is a warning (one `errors` entry) and the document is still
 * accepted — a version change never resets progress.
 *
 * Node rules (frozen interface):
 *  - `id` — required, non-empty, unique across ALL branches.
 *  - `name` — required, non-empty.
 *  - `levelReward` — required, non-negative integer.
 *  - `coinReward` — optional; a non-negative integer, otherwise defaults to `0`.
 *  - `parent` — optional string id resolved against nodes already accepted in the SAME branch;
 *    defaults to the previous accepted node in the branch (the first node defaults to `null`).
 *    An explicit `null` is accepted (an authored root); anything else that does not resolve is
 *    rejected and the node is DROPPED.
 *  - `depth` — optional. Derived from the resolved parent (parent depth + 1, or `0` at a root);
 *    a provided value that is not an equal non-negative integer is reported and the derived
 *    value is used instead.
 *
 * @param {unknown} raw - The parsed contents of `public/skill-tree.json`.
 * @returns {{config: object, errors: string[]}} A safe config plus human-readable messages.
 */
export function normalizeSkillTree(raw) {
  const errors = [];

  // --- top level -----------------------------------------------------------------
  if (!isPlainObject(raw)) {
    return { config: freshFallback(), errors: ['skill-tree: expected a JSON object'] };
  }
  if (!isNonNegInt(raw.version) || raw.version <= 0) {
    return { config: freshFallback(), errors: ['skill-tree: version must be a positive integer'] };
  }
  if (!Array.isArray(raw.categories)) {
    return { config: freshFallback(), errors: ['skill-tree: categories must be an array'] };
  }
  if (!Array.isArray(raw.branches)) {
    return { config: freshFallback(), errors: ['skill-tree: branches must be an array'] };
  }

  // --- version drift (WARN, never reject) ----------------------------------------
  // A version that differs from the one this build understands still normalizes and never
  // resets progress; it is surfaced once as a human-readable warning so a stale config is
  // not silent. Only the structural checks above reject the document.
  if (raw.version !== SKILL_TREE_VERSION) {
    errors.push(`skill-tree: version ${raw.version} differs from the supported version ${SKILL_TREE_VERSION}; continuing`);
  }

  // --- categories ----------------------------------------------------------------
  const seenCategoryIds = new Set();
  const categories = [];

  for (let i = 0; i < raw.categories.length; i += 1) {
    const entry = raw.categories[i];

    if (!isPlainObject(entry)) {
      errors.push(`categories[${i}]: expected an object`);
      continue;
    }
    const id = entry.id;
    if (!isNonEmptyString(id)) {
      errors.push(`categories[${i}]: id must be a non-empty string`);
      continue;
    }
    if (seenCategoryIds.has(id)) {
      errors.push(`${categoryPrefix(i, id)}: duplicate id`);
      continue;
    }
    if (!isNonEmptyString(entry.label)) {
      errors.push(`${categoryPrefix(i, id)}: label must be a non-empty string`);
      continue;
    }

    const icon = typeof entry.icon === 'string' ? entry.icon : '';
    const order = Number.isFinite(entry.order) ? entry.order : i;

    seenCategoryIds.add(id);
    categories.push({ id, label: entry.label, icon, order });
  }

  // Stable sort by the (possibly index-derived) order; ties keep authored order.
  categories.sort((a, b) => a.order - b.order);

  // --- branches + nodes ----------------------------------------------------------
  const seenNodeIds = new Set();
  const branches = [];

  for (let bi = 0; bi < raw.branches.length; bi += 1) {
    const rawBranch = raw.branches[bi];

    if (!isPlainObject(rawBranch)) {
      errors.push(`branches[${bi}]: expected an object`);
      continue;
    }
    const branchId = rawBranch.id;
    if (!isNonEmptyString(branchId)) {
      errors.push(`branches[${bi}]: id must be a non-empty string`);
      continue;
    }
    if (!isNonEmptyString(rawBranch.name)) {
      errors.push(`${branchPrefix(bi, branchId)}: name must be a non-empty string`);
      continue;
    }
    if (!Array.isArray(rawBranch.nodes)) {
      errors.push(`${branchPrefix(bi, branchId)}: nodes must be an array`);
      continue;
    }

    const nodes = [];
    const keptById = new Map();
    let previous = null;

    for (let ni = 0; ni < rawBranch.nodes.length; ni += 1) {
      const entry = rawBranch.nodes[ni];

      if (!isPlainObject(entry)) {
        errors.push(`${branchPrefix(bi, branchId)}.nodes[${ni}]: expected an object`);
        continue;
      }
      const prefix = nodePrefix(bi, branchId, ni, entry.id);

      const id = entry.id;
      if (!isNonEmptyString(id)) {
        errors.push(nodePrefix(bi, branchId, ni, undefined) + ': id must be a non-empty string');
        continue;
      }
      if (seenNodeIds.has(id)) {
        errors.push(`${prefix}: duplicate id`);
        continue;
      }
      if (!isNonEmptyString(entry.name)) {
        errors.push(`${prefix}: name must be a non-empty string`);
        continue;
      }
      if (!isNonNegInt(entry.levelReward)) {
        errors.push(`${prefix}: levelReward must be a non-negative integer`);
        continue;
      }

      // --- resolve parent (defaults to the previous accepted node in THIS branch) ---
      let parent;
      if (entry.parent === undefined) {
        parent = previous === null ? null : previous.id;
      } else if (entry.parent === null) {
        parent = null;
      } else if (isNonEmptyString(entry.parent) && keptById.has(entry.parent)) {
        parent = entry.parent;
      } else {
        errors.push(`${prefix}: parent ${describe(entry.parent)} does not resolve to a node in this branch`);
        continue;
      }

      // --- derive depth from the resolved parent (parent depth + 1; root = 0) --------
      const parentNode = parent === null ? null : keptById.get(parent);
      const derivedDepth = parentNode === null ? 0 : parentNode.depth + 1;
      let depth = derivedDepth;
      if (entry.depth !== undefined) {
        if (isNonNegInt(entry.depth) && entry.depth === derivedDepth) {
          depth = entry.depth;
        } else {
          errors.push(`${prefix}: depth ${describe(entry.depth)} is inconsistent with the derived depth ${derivedDepth}`);
        }
      }

      const coinReward = isNonNegInt(entry.coinReward) ? entry.coinReward : 0;

      const node = { id, name: entry.name, levelReward: entry.levelReward, coinReward, depth, parent };
      seenNodeIds.add(id);
      keptById.set(id, node);
      nodes.push(node);
      previous = node;
    }

    branches.push({ id: branchId, name: rawBranch.name, nodes });
  }

  return { config: { version: raw.version, categories, branches }, errors };
}
