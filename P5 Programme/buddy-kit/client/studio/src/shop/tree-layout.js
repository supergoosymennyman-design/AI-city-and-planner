/**
 * tree-layout.js — the pure, bottom-up geometry engine for the skill-tree view.
 *
 * This module turns the per-branch render descriptors (`treeBranches()` shape) into exact
 * pixel geometry: one column per non-empty branch, one row per depth, and a straight vertical
 * edge from a parent's top-centre down to its child's bottom-centre. It is the single place
 * that owns the tree's maths, so the panel change downstream is a thin rendering swap.
 *
 * Contract — this module is:
 *  - PURE: no DOM APIs, no 3D renderer library, no wall-clock reads and no unseeded randomness.
 *    Node imports it directly under `node test.mjs` and via `--input-type=module -e`.
 *  - TOTAL: `layoutSkillTree` NEVER throws. Hostile input (non-arrays, non-objects, blank ids,
 *    unknown/missing parents, missing depths) degrades to a layout with fewer nodes/edges.
 *  - NON-MUTATING: it never edits the caller's `branches` array or any descriptor.
 *  - DETERMINISTIC: identical inputs produce byte-identical output.
 *
 * GEOMETRY IS FROZEN — the tree grows UPWARD (root flush at the BOTTOM, no blank row above the
 * deepest node) and every node in a column shares one `centerX`. See `layoutSkillTree` for the
 * exact rules. `state` is passed IN on each descriptor; this module is geometry only and never
 * derives achievement state.
 */

/**
 * Frozen geometry defaults. These are the shipped numbers the whole tree view is tuned around,
 * so they live in one place and are merged field-by-field (an invalid field falls back here).
 *
 * @type {Readonly<{nodeWidth:number, nodeHeight:number, rowGap:number, colGap:number, padding:number, minCanvasWidth:number}>}
 */
export const TREE_LAYOUT_DEFAULTS = Object.freeze({
  nodeWidth: 200,
  nodeHeight: 56,
  rowGap: 28,
  colGap: 24,
  padding: 12,
  minCanvasWidth: 0,
});

/** @param {unknown} v @returns {boolean} True for a non-null, non-array object. */
function isObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** @param {unknown} v @returns {boolean} True for a string containing non-whitespace. */
function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim() !== '';
}

/**
 * Coerce an option to a finite number, falling back to the shipped default. Keeps a hostile or
 * malformed `options` object from injecting `NaN` into the geometry.
 *
 * @param {unknown} v - Candidate value.
 * @param {number} dflt - Fallback when `v` is not a finite number.
 * @returns {number} `v` when finite, else `dflt`.
 */
function num(v, dflt) {
  return typeof v === 'number' && Number.isFinite(v) ? v : dflt;
}

/**
 * Read a node's depth safely. A missing/non-integer/negative depth is tolerated as `0` (the root
 * row) so one malformed descriptor can never corrupt the whole layout.
 *
 * @param {object} node - Admitted node descriptor.
 * @returns {number} A non-negative integer.
 */
function depthOf(node) {
  return Number.isInteger(node.depth) && node.depth >= 0 ? node.depth : 0;
}

/**
 * Lay out the skill tree as exact, bottom-up pixel geometry (PURE / TOTAL / NON-MUTATING).
 *
 * Frozen rules (with option defaults `{ nodeWidth:200, nodeHeight:56, rowGap:28, colGap:24,
 * padding:12, minCanvasWidth:0 }`):
 *  - `rowHeight = nodeHeight + rowGap` — one uniform pitch for every depth step.
 *  - `maxDepth` = the largest depth over all admitted nodes (`0` when there are none).
 *  - `height = maxDepth*rowHeight + nodeHeight + 2*padding` — no blank row above the deepest
 *    node; the depth-0 root sits flush at the bottom.
 *  - `bottomY = height - padding - nodeHeight` (a depth-0 node's top) and `y = bottomY - depth*rowHeight`.
 *  - `N` = count of NON-EMPTY branches; `width = max(minCanvasWidth, N*nodeWidth + (N-1)*colGap + 2*padding)`;
 *    `colWidth = (width - 2*padding)/N`; `centerX_i = padding + colWidth*(i + 0.5)`;
 *    `x = centerX_i - nodeWidth/2` — every node in a column shares `centerX_i`.
 *  - An edge is emitted for each node whose `parent` resolves to a node in the SAME branch, as a
 *    straight vertical segment from the parent's top-centre to the child's bottom-centre.
 *
 * @param {unknown} branches - `treeBranches()` descriptors: `[{ id, name, nodes: [{ id, name, depth, state, parent }] }]`.
 * @param {unknown} [options] - Partial geometry overrides (invalid fields fall back to defaults).
 * @returns {{width:number, height:number, padding:number, nodeWidth:number, nodeHeight:number, rowHeight:number, colGap:number,
 *   columns:Array<{branchId:string, index:number, centerX:number}>,
 *   nodes:Array<{id:string, branchId:string, branchIndex:number, depth:number, state:*, x:number, y:number, width:number, height:number}>,
 *   edges:Array<{id:string, parentId:string, childId:string, x1:number, y1:number, x2:number, y2:number, childState:*}>}}
 *   A fresh layout object on every call.
 */
export function layoutSkillTree(branches, options) {
  const opts = isObject(options) ? options : {};
  const nodeWidth = num(opts.nodeWidth, TREE_LAYOUT_DEFAULTS.nodeWidth);
  const nodeHeight = num(opts.nodeHeight, TREE_LAYOUT_DEFAULTS.nodeHeight);
  const rowGap = num(opts.rowGap, TREE_LAYOUT_DEFAULTS.rowGap);
  const colGap = num(opts.colGap, TREE_LAYOUT_DEFAULTS.colGap);
  const padding = num(opts.padding, TREE_LAYOUT_DEFAULTS.padding);
  const minCanvasWidth = num(opts.minCanvasWidth, TREE_LAYOUT_DEFAULTS.minCanvasWidth);
  const rowHeight = nodeHeight + rowGap;

  // Pass 1 — admit usable nodes. A node needs a non-blank string id; a branch becomes a column
  // only when it contributed at least one node (NON-EMPTY). Everything else is skipped, not fatal.
  const admitted = [];
  const branchList = Array.isArray(branches) ? branches : [];
  for (const branch of branchList) {
    if (!isObject(branch)) continue;
    const branchId = typeof branch.id === 'string' ? branch.id : '';
    const nodeList = Array.isArray(branch.nodes) ? branch.nodes : [];
    const nodes = [];
    for (const raw of nodeList) {
      if (!isObject(raw)) continue;
      if (!isNonEmptyString(raw.id)) continue;
      const id = raw.id;
      nodes.push({ id, depth: depthOf(raw), state: raw.state, parent: raw.parent });
    }
    if (nodes.length > 0) admitted.push({ branchId, nodes });
  }

  // maxDepth drives both the canvas height and the root baseline.
  let maxDepth = 0;
  for (const column of admitted) {
    for (const node of column.nodes) if (node.depth > maxDepth) maxDepth = node.depth;
  }

  const N = admitted.length;
  const height = maxDepth * rowHeight + nodeHeight + 2 * padding;
  const bottomY = height - padding - nodeHeight;
  const width = Math.max(minCanvasWidth, N * nodeWidth + (N - 1) * colGap + 2 * padding);
  const colWidth = N > 0 ? (width - 2 * padding) / N : 0;

  const columns = [];
  const nodes = [];
  const edges = [];

  for (let i = 0; i < N; i++) {
    const { branchId, nodes: branchNodes } = admitted[i];
    const centerX = padding + colWidth * (i + 0.5);
    columns.push({ branchId, index: i, centerX });

    // Parent resolution is same-branch only. The normalized config has no duplicate ids, but a
    // hostile fixture might — the last descriptor with an id wins, deterministically.
    const byId = new Map();
    for (const node of branchNodes) byId.set(node.id, node);

    for (const node of branchNodes) {
      const x = centerX - nodeWidth / 2;
      const y = bottomY - node.depth * rowHeight;
      nodes.push({
        id: node.id,
        branchId,
        branchIndex: i,
        depth: node.depth,
        state: node.state,
        x,
        y,
        width: nodeWidth,
        height: nodeHeight,
      });

      if (!isNonEmptyString(node.parent)) continue;
      const parent = byId.get(node.parent);
      if (parent === undefined) continue;
      edges.push({
        id: `edge-${parent.id}-${node.id}`,
        parentId: parent.id,
        childId: node.id,
        x1: centerX,
        y1: bottomY - parent.depth * rowHeight,
        x2: centerX,
        y2: y + nodeHeight,
        childState: node.state,
      });
    }
  }

  return {
    width,
    height,
    padding,
    nodeWidth,
    nodeHeight,
    rowHeight,
    colGap,
    columns,
    nodes,
    edges,
  };
}
