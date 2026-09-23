/**
 * tree-layout.test.js — pure-node coverage for the skill-tree geometry engine.
 *
 * The engine is the boundary between the panel's render descriptors and the exact pixels the
 * tree view draws, so these tests pin the FROZEN numeric contract (uniform pitch, bottom-up
 * root, one column per non-empty branch), drive the REAL shipped config end-to-end, and prove
 * that hostile input never throws and never mutates its argument.
 *
 * Discovered and called by `test.mjs`'s `src/shop/tests/*.test.js` block as
 * `export default function treeLayoutTests(check)` — the harness does NOT await the call, so
 * this module must be entirely SYNCHRONOUS and use only `check(name, cond)`.
 */

import fs from 'node:fs';
import { layoutSkillTree, TREE_LAYOUT_DEFAULTS } from '../tree-layout.js';
import { normalizeSkillTree } from '../skill-tree.js';

const SHIPPED_PATH = 'public/skill-tree.json';

/** Structural deep-equality for JSON-shaped values (key order is irrelevant). */
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false; // `a === b` above already handled null === null
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

/** JSON clone (all fixtures here are JSON-shaped). */
function clone(v) {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}

/** A minimal node descriptor; `over` shallow-merges overrides. */
function node(over = {}) {
  return { id: 'n', name: 'N', depth: 0, state: 'locked', parent: null, ...over };
}

/** A minimal branch descriptor; `over` shallow-merges overrides. */
function branch(over = {}) {
  return { id: 'b', name: 'B', nodes: [node()], ...over };
}

/** Build the layout descriptor for one branch's nodes. */
function chain(branchId, nodes) {
  return { id: branchId, name: branchId, nodes };
}

/** Every edge's vertical span must equal the inter-card gap (`rowGap`). */
function spansAreRowGap(layout) {
  return layout.edges.every((e) => e.y1 - e.y2 === layout.rowHeight - layout.nodeHeight);
}

/**
 * Run every tree-layout check. Synchronous by contract.
 *
 * @param {(name: string, cond: boolean) => void} check - Harness assertion callback.
 */
export default function treeLayoutTests(check) {
  // -------------------------------------------------------------------------------
  // Frozen defaults
  // -------------------------------------------------------------------------------
  check('tree-layout: defaults are the frozen geometry contract', deepEqual(TREE_LAYOUT_DEFAULTS, {
    nodeWidth: 200, nodeHeight: 56, rowGap: 28, colGap: 24, padding: 12, minCanvasWidth: 0,
  }));

  // -------------------------------------------------------------------------------
  // One single-chain branch — uniform pitch, bottom-up root, exact edges (defaults)
  // -------------------------------------------------------------------------------
  const chainFixture = [chain('solo', [
    node({ id: 'r', name: 'R', depth: 0, state: 'achieved', parent: null }),
    node({ id: 'm', name: 'M', depth: 1, state: 'available', parent: 'r' }),
    node({ id: 't', name: 'T', depth: 2, state: 'locked', parent: 'm' }),
  ])];
  {
    const L = layoutSkillTree(chainFixture, {});
    check('tree-layout: one branch yields one column', L.columns.length === 1);
    check('tree-layout: column carries branchId + index + centerX',
      L.columns[0].branchId === 'solo' && L.columns[0].index === 0 && L.columns[0].centerX === 112);
    check('tree-layout: rowHeight = nodeHeight + rowGap', L.rowHeight === 84);
    check('tree-layout: width = nodeWidth + 2*padding for one branch', L.width === 224);
    check('tree-layout: height = maxDepth*rowHeight + nodeHeight + 2*padding', L.height === 248);
    check('tree-layout: root sits flush at the bottom (no top blank)',
      L.nodes[0].y === L.height - L.padding - L.nodeHeight && L.nodes[0].y === 180);
    check('tree-layout: y = bottomY - depth*rowHeight', L.nodes.map((n) => n.y).join(',') === '180,96,12');
    check('tree-layout: uniform pitch between depths', L.nodes[0].y - L.nodes[1].y === L.rowHeight && L.nodes[1].y - L.nodes[2].y === L.rowHeight);
    check('tree-layout: every node in the column shares x + centerX',
      L.nodes.every((n) => n.x === 12) && L.columns[0].centerX - L.nodeWidth / 2 === 12);
    check('tree-layout: node carries id/branch/depth/state/size',
      L.nodes[0].id === 'r' && L.nodes[0].branchId === 'solo' && L.nodes[0].branchIndex === 0
      && L.nodes[0].depth === 0 && L.nodes[0].state === 'achieved'
      && L.nodes[0].width === 200 && L.nodes[0].height === 56);
    check('tree-layout: edges are parent-top to child-bottom, same column',
      L.edges.length === 2
      && L.edges[0].id === 'edge-r-m' && L.edges[0].parentId === 'r' && L.edges[0].childId === 'm'
      && L.edges[0].x1 === 112 && L.edges[0].y1 === 180 && L.edges[0].x2 === 112 && L.edges[0].y2 === 152
      && L.edges[0].childState === 'available'
      && L.edges[1].id === 'edge-m-t');
    check('tree-layout: parent y is BELOW child bottom by exactly rowGap',
      L.edges.every((e) => e.y1 > e.y2) && spansAreRowGap(L));
  }

  // -------------------------------------------------------------------------------
  // Two columns + an empty branch: N counts only NON-EMPTY branches
  // -------------------------------------------------------------------------------
  {
    const L = layoutSkillTree([
      chain('a', [node({ id: 'a1', depth: 0, parent: null })]),
      chain('empty', []),
      chain('b', [
        node({ id: 'b1', depth: 0, state: 'achieved', parent: null }),
        node({ id: 'b2', depth: 1, parent: 'b1' }),
      ]),
    ], {});
    check('tree-layout: empty branches do not become columns', L.columns.length === 2
      && L.columns.map((c) => c.branchId).join(',') === 'a,b');
    check('tree-layout: column width uses N non-empty branches',
      L.width === 2 * 200 + 1 * 24 + 24 && L.width === 448);
    check('tree-layout: centerX spreads evenly across columns',
      L.columns[0].centerX === 118 && L.columns[1].centerX === 330);
    check('tree-layout: branchIndex follows the non-empty column order',
      L.nodes.find((n) => n.id === 'a1').branchIndex === 0
      && L.nodes.find((n) => n.id === 'b1').branchIndex === 1
      && L.nodes.find((n) => n.id === 'b2').branchIndex === 1);
    check('tree-layout: height comes from max depth across all columns',
      L.height === 164 && L.nodes.find((n) => n.id === 'b2').y === 12);
    check('tree-layout: only same-branch parents produce edges',
      L.edges.length === 1 && L.edges[0].id === 'edge-b1-b2' && L.edges[0].x1 === 330);
  }

  // -------------------------------------------------------------------------------
  // Cross-branch / unresolved parents + missing depth degrade without throwing
  // -------------------------------------------------------------------------------
  {
    const L = layoutSkillTree([
      chain('x', [
        node({ id: 'root', depth: 0, parent: null }),
        node({ id: 'child', depth: 1, parent: 'root' }),
      ]),
      chain('y', [
        node({ id: 'orphan', state: 'available', parent: 'root' }), // parent lives in branch x
        node({ id: 'dangling', depth: 0, parent: 'ghost' }), // parent resolves nowhere
      ]),
    ], {});
    check('tree-layout: cross-branch parent yields no edge', L.edges.length === 1 && L.edges[0].id === 'edge-root-child');
    check('tree-layout: missing depth is tolerated as depth 0',
      L.nodes.find((n) => n.id === 'orphan').depth === 0 && L.nodes.find((n) => n.id === 'orphan').y === L.nodes.find((n) => n.id === 'root').y);
    check('tree-layout: unresolved parent still admits the node', L.nodes.length === 4);
  }

  // -------------------------------------------------------------------------------
  // Options override the frozen defaults; an invalid field falls back
  // -------------------------------------------------------------------------------
  {
    const L = layoutSkillTree(chainFixture, { nodeWidth: 100, nodeHeight: 40, rowGap: 20, colGap: 10, padding: 5, minCanvasWidth: 0 });
    check('tree-layout: options drive rowHeight/height/width',
      L.rowHeight === 60 && L.height === 170 && L.width === 110);
    check('tree-layout: options drive the root baseline and x',
      L.nodes[0].y === 125 && L.nodes[1].y === 65 && L.nodes[0].x === 5);
  }
  {
    const L = layoutSkillTree([chain('solo', [node({ id: 'r', depth: 0, parent: null })])], { minCanvasWidth: 500 });
    check('tree-layout: minCanvasWidth is a floor on the canvas width', L.width === 500);
    check('tree-layout: a widened canvas re-centres the single column',
      L.columns[0].centerX === 250 && L.nodes[0].x === 150);
  }
  {
    const L = layoutSkillTree(chainFixture, { nodeWidth: 'x', padding: NaN });
    check('tree-layout: invalid option fields fall back to defaults',
      L.nodeWidth === 200 && L.padding === 12 && L.width === 224);
  }

  // -------------------------------------------------------------------------------
  // Empty / hostile top level — never throws, numeric canvas, safe empty arrays
  // -------------------------------------------------------------------------------
  {
    const hostile = [undefined, null, 0, '', 'x', 42, {}, [null, 'y', 5, { nodes: 'z' }, { id: 1, nodes: [] }]];
    let threw = false;
    for (const input of hostile) {
      try {
        const L = layoutSkillTree(input);
        if (typeof L.width !== 'number' || !Number.isFinite(L.width)) threw = true;
        if (typeof L.height !== 'number' || !Number.isFinite(L.height)) threw = true;
        if (!Array.isArray(L.columns) || !Array.isArray(L.nodes) || !Array.isArray(L.edges)) threw = true;
      } catch (e) {
        threw = true;
      }
    }
    check('tree-layout: hostile top level never throws and yields a numeric empty layout', !threw);

    const empty = layoutSkillTree(null);
    check('tree-layout: an empty tree has no nodes/columns/edges',
      empty.nodes.length === 0 && empty.columns.length === 0 && empty.edges.length === 0);
    check('tree-layout: an empty tree still has a node-height canvas', empty.height === 80 && empty.width === 0 && empty.rowHeight === 84);
  }

  // -------------------------------------------------------------------------------
  // Blank/invalid node ids and non-object entries are dropped (fewer nodes)
  // -------------------------------------------------------------------------------
  {
    const L = layoutSkillTree([chain('b', [null, 5, 'q', [], { depth: 0 }, { id: '' }, { id: '  ' }, node({ id: 'ok' })])]);
    check('tree-layout: blank/non-object nodes are dropped, valid ones kept',
      L.nodes.length === 1 && L.nodes[0].id === 'ok' && L.columns.length === 1);

    const missingParent = layoutSkillTree([{ id: 'b', nodes: [node({ id: 'c', parent: 'missing', depth: 0 })] }]);
    check('tree-layout: an unresolved parent yields a partial layout (node, no edge)',
      missingParent.nodes.length === 1 && missingParent.edges.length === 0);
  }

  // -------------------------------------------------------------------------------
  // Non-mutating + deterministic
  // -------------------------------------------------------------------------------
  {
    const fixture = [
      chain('a', [node({ id: 'a1', depth: 0, parent: null }), node({ id: 'a2', depth: 1, parent: 'a1' })]),
      chain('b', [node({ id: 'b1', depth: 0, parent: null })]),
    ];
    const snapshot = clone(fixture);
    layoutSkillTree(fixture, {});
    check('tree-layout: does not mutate the branches input', deepEqual(fixture, snapshot));

    const first = layoutSkillTree(fixture, {});
    const second = layoutSkillTree(fixture, {});
    check('tree-layout: is deterministic', deepEqual(first, second) && deepEqual(first.edges, second.edges));
    check('tree-layout: returns fresh arrays each call', first.nodes !== second.nodes && first.columns !== second.columns);
  }

  // -------------------------------------------------------------------------------
  // The REAL shipped config — the primary acceptance fixture
  // -------------------------------------------------------------------------------
  {
    const raw = JSON.parse(fs.readFileSync(SHIPPED_PATH, 'utf8'));
    const rawSnapshot = clone(raw);
    const { config } = normalizeSkillTree(raw);

    // Build descriptors in the `treeBranches()` shape, carrying `parent` (nodeDescriptor does
    // not yet include it) — the engine must consume exactly this shape.
    const descriptors = config.branches.map((b) => ({
      id: b.id,
      name: b.name,
      nodes: b.nodes.map((n) => ({ id: n.id, name: n.name, depth: n.depth, state: 'locked', parent: n.parent })),
    }));

    const L = layoutSkillTree(descriptors, {});
    const maxDepth = Math.max(0, ...L.nodes.map((n) => n.depth));

    check('tree-layout(real): 11 nodes', L.nodes.length === 11);
    check('tree-layout(real): 3 columns', L.columns.length === 3);
    check('tree-layout(real): 8 edges', L.edges.length === 8);
    check('tree-layout(real): maxDepth 3', maxDepth === 3);

    check('tree-layout(real): every column’s nodes share one centerX', L.columns.every((col) => (
      L.nodes.filter((n) => n.branchIndex === col.index).every((n) => n.x === col.centerX - L.nodeWidth / 2)
    )));
    // Higher depth => strictly higher on screen (smaller y). Derived from each edge's endpoints.
    check('tree-layout(real): a deeper node sits strictly above its parent',
      L.edges.every((e) => L.nodes.find((n) => n.id === e.childId).y < L.nodes.find((n) => n.id === e.parentId).y));
    check('tree-layout(real): y is depth-derived only (y = bottomY - depth*rowHeight)',
      L.nodes.every((n) => n.y === L.height - L.padding - L.nodeHeight - n.depth * L.rowHeight));
    check('tree-layout(real): parent y > child y for every edge',
      L.edges.every((e) => L.nodes.find((n) => n.id === e.parentId).y > L.nodes.find((n) => n.id === e.childId).y));
    check('tree-layout(real): depth-0 root is flush at the bottom',
      L.nodes.filter((n) => n.depth === 0).every((n) => n.y === L.height - L.padding - L.nodeHeight));
    check('tree-layout(real): every edge id is well-formed + endpoints match the nodes',
      L.edges.every((e) => /^edge-.+-.+$/.test(e.id))
      && L.edges.every((e) => {
        const parent = L.nodes.find((n) => n.id === e.parentId);
        const child = L.nodes.find((n) => n.id === e.childId);
        return parent && child && e.y1 === parent.y && e.y2 === child.y + L.nodeHeight
          && e.x1 === parent.x + L.nodeWidth / 2 && e.x2 === child.x + L.nodeWidth / 2;
      }));
    check('tree-layout(real): every edge span equals the inter-card gap', spansAreRowGap(L));
    check('tree-layout(real): reading the config did not mutate it', deepEqual(raw, rawSnapshot));
  }
}
