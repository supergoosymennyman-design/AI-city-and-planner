/**
 * shop-panel.test.js — pure-node coverage for `src/ui/shop-panel.js`.
 *
 * The panel is the only piece that touches the shop DOM, so it is proven two
 * ways without a browser harness:
 *  1. Its pure ACTION MAPPING (`cardAction`) is driven by the real
 *     `unlock.status()` engine, so the four unlock rules are asserted exactly.
 *  2. Its SOURCE is scanned (comments stripped, mirroring `ai-panel.test.js`) to
 *     prove it stays a pure renderer — no `innerHTML`, no scene access, no
 *     controller/`three` import, and the required a11y/text hooks present.
 *
 * Discovered and called by `test.mjs` as `export default function (check)`; the
 * harness does NOT await the call, so this module is entirely SYNCHRONOUS and
 * uses only `check(name, cond)`.
 */

import { readFileSync } from 'node:fs';
import {
  ShopPanel,
  cardAction,
  categoryChips,
  treeBranches,
  treeNodes,
  rewardText,
  unlockToast,
} from '../../ui/shop-panel.js';
import { status } from '../unlock.js';

export default function shopPanelTests(check) {
  // ---------------------------------------------------------------------------
  // cardAction — the frozen three-way branch, driven by the real unlock engine
  // ---------------------------------------------------------------------------
  const state = { coins: 120, level: 1, owned: [] };
  const freeModel = { id: 'alpha', name: 'Alpha', category: 'Basics', unlock: { type: 'free' } };
  const levelModel = { id: 'beta', name: 'Beta', category: 'Basics', unlock: { type: 'level', level: 2 } };
  const coinModel = { id: 'gamma', name: 'Gamma', category: 'Parts', unlock: { type: 'coins', coins: 40 } };
  const comboModel = { id: 'delta', name: 'Delta', category: 'Premium', unlock: { type: 'level+coins', level: 3, coins: 120 } };

  {
    const a = cardAction(status(state, freeModel));
    check('shop-panel: a free model offers an enabled "Add" (place)', a.action === 'place' && a.label === 'Add' && a.disabled === false);
  }
  {
    const owned = { ...state, owned: ['alpha'] };
    const a = cardAction(status(owned, freeModel));
    check('shop-panel: an owned model offers an enabled "Add" (place)', a.action === 'place' && a.label === 'Add' && a.disabled === false);
  }
  {
    const a = cardAction(status(state, coinModel));
    check(
      'shop-panel: an affordable coin model offers "Unlock · 40 coins"',
      a.action === 'buy' && a.label === 'Unlock · 40 coins' && a.disabled === false,
    );
  }
  {
    const a = cardAction(status(state, levelModel));
    check(
      'shop-panel: an unmet level model is locked with the engine reason',
      a.action === 'locked' && a.disabled === true && a.label === 'reach level 2' && a.ariaLabel === 'reach level 2',
    );
  }
  {
    // Both gates met (level 3 AND 120 coins) but not yet owned: the model is
    // offered for purchase, priced from the engine's requirement.
    const a = cardAction(status({ coins: 120, level: 3, owned: [] }, comboModel));
    check(
      'shop-panel: an affordable level+coins model offers "Unlock · 120 coins"',
      a.action === 'buy' && a.label === 'Unlock · 120 coins' && a.disabled === false,
    );
  }
  {
    // Level unmet AND coins short: the reason must state both requirements,
    // verbatim from the engine (never invented by the panel).
    const a = cardAction(status({ coins: 0, level: 1, owned: [] }, comboModel));
    check(
      'shop-panel: an unmet level+coins model is locked with both requirements',
      a.action === 'locked' && a.label === 'reach level 3 and pay 120 coins' && a.ariaLabel === a.label,
    );
  }
  {
    const a = cardAction(status({ coins: 20, level: 1, owned: [] }, coinModel));
    check(
      'shop-panel: an unaffordable coin model is locked with the exact shortfall',
      a.action === 'locked' && a.disabled === true && a.label === 'need 20 more coins',
    );
  }
  {
    const a = cardAction(status({ coins: 120, level: 1, owned: [] }, levelModel));
    const b = cardAction(status({ coins: 120, level: 9, owned: [] }, levelModel));
    check(
      'shop-panel: a reached level model flips from locked to an enabled Add',
      a.action === 'locked' && b.action === 'place' && b.disabled === false,
    );
  }
  {
    const a = cardAction(undefined);
    check('shop-panel: cardAction tolerates a hostile status and fails closed', a.action === 'locked' && a.disabled === true && a.label === '');
  }

  // ---------------------------------------------------------------------------
  // Wave B tree contract — pure descriptors the panel renders (no DOM)
  // ---------------------------------------------------------------------------
  const skillTree = {
    version: 1,
    categories: [{ id: 'basics', label: 'Basics', icon: '', order: 1 }],
    branches: [
      {
        id: 'br',
        name: 'Branch',
        nodes: [
          { id: 'a', name: 'Alpha', levelReward: 1, coinReward: 50, depth: 0, parent: null },
          { id: 'b', name: 'Beta', levelReward: 2, coinReward: 0, depth: 1, parent: 'a' },
        ],
      },
    ],
  };

  {
    const t = treeNodes(skillTree, { a: 'achieved', b: 'available' });
    check(
      'shop-panel: treeNodes keeps config order and carries state + depth + both rewards',
      t.length === 2 &&
        t[0].id === 'a' &&
        t[0].state === 'achieved' &&
        t[0].depth === 0 &&
        t[0].rewardText === '+1 level · +50 coins' &&
        t[1].id === 'b' &&
        t[1].state === 'available' &&
        t[1].depth === 1 &&
        t[1].rewardText === '+2 levels',
    );
  }
  {
    const bogus = treeNodes(skillTree, { a: 'bogus' });
    const mapped = treeNodes(skillTree, new Map([['b', 'achieved']]));
    const absent = treeNodes(skillTree, null);
    check(
      'shop-panel: treeNodes fails closed to locked and accepts a Map or a missing nodeStates',
      bogus[0].state === 'locked' &&
        bogus[1].state === 'locked' &&
        mapped[1].state === 'achieved' &&
        mapped[0].state === 'locked' &&
        absent[0].state === 'locked',
    );
  }
  {
    const safe =
      treeNodes(null, null).length === 0 &&
      treeNodes({ branches: 'x' }, 'nope').length === 0 &&
      treeNodes({ branches: [null, 'x', { nodes: [null, 'y', { id: '' }, { id: 'ok' }] }] }, null).length === 1;
    check('shop-panel: treeNodes tolerates hostile input without throwing', safe);
  }
  {
    const t = treeNodes({ branches: [{ nodes: [{ id: 'ok' }] }] }, null);
    check(
      'shop-panel: a reward-less node still carries a non-empty label',
      t.length === 1 && t[0].name === '' && t[0].depth === 0 && t[0].rewardText === 'no reward',
    );
  }
  {
    // The descriptor must carry `parent` (the edge layer keys off it); absent or
    // blank fails closed to `null`, so a root is distinguishable from an orphan.
    const withParent = {
      branches: [
        {
          nodes: [
            { id: 'root', name: 'Root', levelReward: 0, coinReward: 0, depth: 0, parent: null },
            { id: 'kid', name: 'Kid', levelReward: 1, coinReward: 0, depth: 1, parent: 'root' },
            { id: 'stray', name: 'Stray', levelReward: 1, coinReward: 0, depth: 0, parent: '' },
            { id: 'missing', name: 'Missing', levelReward: 1, coinReward: 0, depth: 0 },
          ],
        },
      ],
    };
    const t = treeNodes(withParent, null);
    check(
      "shop-panel: treeNodes carries each node's parent id (null when absent or blank)",
      t.length === 4 && t[0].parent === null && t[1].parent === 'root' && t[2].parent === null && t[3].parent === null,
    );
  }
  {
    check(
      'shop-panel: rewardText formats rewards and collapses zeroes/malformed input',
      rewardText(1, 50) === '+1 level · +50 coins' &&
        rewardText(2, 0) === '+2 levels' &&
        rewardText(0, 1) === '+1 coin' &&
        rewardText('5', -3) === 'no reward' &&
        rewardText(0, 0) === 'no reward',
    );
  }
  {
    check(
      'shop-panel: unlockToast names the batch, falls back to the id, and ignores empties',
      unlockToast(['a'], skillTree) === 'Skill unlocked: Alpha' &&
        unlockToast(['a', 'b'], skillTree) === '2 skills unlocked: Alpha, Beta' &&
        unlockToast(['zzz'], skillTree) === 'Skill unlocked: zzz' &&
        unlockToast([], skillTree) === '' &&
        unlockToast('nope', skillTree) === '',
    );
  }

  // ---------------------------------------------------------------------------
  // Multi-branch tree contract — one lane per branch so EVERY root shares the
  // bottom baseline. The old flat column put only the first branch's root at the
  // bottom; `d`/`f` floated mid-column and the connectors assumed a single chain.
  // ---------------------------------------------------------------------------
  const multiTree = {
    version: 1,
    categories: [],
    branches: [
      {
        id: 'ba',
        name: 'Alpha',
        nodes: [
          { id: 'a', name: 'A', levelReward: 1, coinReward: 10, depth: 0 },
          { id: 'b', name: 'B', levelReward: 2, coinReward: 25, depth: 1 },
        ],
      },
      { id: 'bb', name: 'Beta', nodes: [{ id: 'd', name: 'D', levelReward: 1, coinReward: 5, depth: 0 }] },
      {
        id: 'bc',
        name: 'Gamma',
        nodes: [
          { id: 'f', name: 'F', levelReward: 1, coinReward: 15, depth: 0 },
          { id: 'g', name: 'G', levelReward: 2, coinReward: 40, depth: 1 },
        ],
      },
    ],
  };

  {
    const branches = treeBranches(multiTree, { a: 'achieved' });
    check(
      'shop-panel: treeBranches keeps one descriptor per branch, each root first at depth 0',
      branches.length === 3 &&
        branches[0].id === 'ba' &&
        branches[0].name === 'Alpha' &&
        branches[1].id === 'bb' &&
        branches[2].id === 'bc' &&
        branches[0].nodes.map((n) => n.id).join(',') === 'a,b' &&
        branches[1].nodes.map((n) => n.id).join(',') === 'd' &&
        branches[2].nodes.map((n) => n.id).join(',') === 'f,g' &&
        branches[0].nodes[0].depth === 0 &&
        branches[1].nodes[0].depth === 0 &&
        branches[2].nodes[0].depth === 0 &&
        branches[0].nodes[0].state === 'achieved',
    );
  }
  {
    const flat = treeNodes(multiTree, null);
    check(
      'shop-panel: treeNodes still flattens every branch in config order (back-compat)',
      flat.map((n) => n.id).join(',') === 'a,b,d,f,g' && flat.every((n) => typeof n.branchId === 'string'),
    );
  }
  {
    check(
      'shop-panel: treeBranches tolerates hostile input without throwing',
      treeBranches(null, null).length === 0 &&
        treeBranches({ branches: 'x' }, null).length === 0 &&
        treeBranches({ branches: [null, 'x', { id: 'ok', nodes: [null, 'y', { id: '' }, { id: 'z' }] }] }, null).length === 1 &&
        treeBranches({ branches: [null, 'x', { id: 'ok', nodes: [null, 'y', { id: '' }, { id: 'z' }] }] }, null)[0].nodes.length === 1,
    );
  }

  // ---------------------------------------------------------------------------
  // Category chip icons — the authored `category.icon` must reach the DOM as a
  // CSS marker (`data-icon`) WITHOUT changing the chip's label text.
  // ---------------------------------------------------------------------------
  {
    const chips = categoryChips([
      { id: 'head', label: 'Head', icon: 'H', order: 2 },
      { id: 'hands', label: 'Hands', icon: 'X', order: 3 },
      { id: 'blank', label: 'Blank', order: 4 },
    ]);
    check(
      'shop-panel: categoryChips carries id + label + icon (all chip and icon-less chips stay empty)',
      chips[0].id === 'all' &&
        chips[0].icon === '' &&
        chips[1].id === 'head' &&
        chips[1].label === 'Head' &&
        chips[1].icon === 'H' &&
        chips[2].icon === 'X' &&
        chips[3].icon === '',
    );
  }

  // ---------------------------------------------------------------------------
  // Unlock-feedback memo — regression: a reset (empty batch) must clear the
  // "last batch" memo, so a later GENUINE unlock of the same node fires the
  // toast + highlight again. Monkey repro: achieve `a` -> Reset -> achieve `a`
  // left the toast hidden and 0 highlights (the memo was never cleared).
  // `_applyUnlockHighlight` is exercised directly with an empty `_nodeEls`, so
  // no DOM is needed: the toast path is pure, and the highlight loop skips.
  // ---------------------------------------------------------------------------
  {
    const toasts = [];
    const panel = new ShopPanel(null, { onToast: (m) => toasts.push(m) });
    panel._applyUnlockHighlight(['a'], skillTree); // genuine unlock -> toast
    panel._applyUnlockHighlight([], skillTree); // reset / plain re-render (empty)
    panel._applyUnlockHighlight(['a'], skillTree); // re-achieved -> must toast again
    check(
      'shop-panel: an empty newly-unlocked batch resets the memo so the same node toasts again after Reset',
      toasts.length === 2 && toasts[0] === 'Skill unlocked: Alpha' && toasts[1] === 'Skill unlocked: Alpha',
    );
    panel.destroy();
  }
  {
    const toasts = [];
    const panel = new ShopPanel(null, { onToast: (m) => toasts.push(m) });
    panel._applyUnlockHighlight(['a', 'b'], skillTree); // genuine batch -> toast
    panel._applyUnlockHighlight(['b', 'a'], skillTree); // same batch, no empty between -> suppressed
    check(
      'shop-panel: a repeated non-empty batch with no empty render in between still fires the toast only once',
      toasts.length === 1,
    );
    panel.destroy();
  }

  // ---------------------------------------------------------------------------
  // Class public surface + no-DOM construction
  // ---------------------------------------------------------------------------
  check(
    'shop-panel: ShopPanel exposes the frozen constructor + render + destroy surface',
    typeof ShopPanel === 'function' &&
      typeof ShopPanel.prototype.render === 'function' &&
      typeof ShopPanel.prototype.destroy === 'function',
  );
  {
    let threw = false;
    try {
      const panel = new ShopPanel(null, {});
      panel.render({ state: { coins: 5, level: 2, collapsed: true }, catalog: { models: [] } });
      panel.destroy();
    } catch (err) {
      threw = true;
    }
    check('shop-panel: constructs and renders without a DOM (no document access on the happy path)', threw === false);
  }

  // ---------------------------------------------------------------------------
  // Source tripwires — the panel must stay a pure, callback-driven renderer
  // ---------------------------------------------------------------------------
  {
    const src = readFileSync(new URL('../../ui/shop-panel.js', import.meta.url), 'utf8');
    // Comments legitimately NAME what is forbidden (to explain the design), so
    // strip them and assert on the code only — exactly like ai-panel.test.js.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

    check(
      'shop-panel: source never uses innerHTML / insertAdjacentHTML / eval',
      !/innerHTML/.test(code) && !/insertAdjacentHTML/.test(code) && !/\beval\s*\(/.test(code),
    );
    check(
      'shop-panel: source never reaches into the scene (studio. / addImported)',
      !/studio\./.test(code) && !/addImported/.test(code),
    );
    check(
      'shop-panel: source imports only pure shop modules (unlock, search) — never the controller, three, or a scene',
      (() => {
        const specifiers = [...code.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
        const PURE_SHOP = /\/shop\/(unlock|search|tree-layout)\.js$/;
        return (
          specifiers.length > 0 &&
          specifiers.every((s) => PURE_SHOP.test(s)) &&
          !/controller\.js/.test(code) &&
          !/\bfrom\s*['"]three['"]/.test(code)
        );
      })(),
    );
    check('shop-panel: source renders text with textContent', /textContent/.test(code));
    check('shop-panel: source keeps the toggle aria-expanded in sync', /aria-expanded/.test(code));
    check('shop-panel: source sets data-action on card buttons', /data-action/.test(code));
    check('shop-panel: source sets data-model-id on each card', /data-model-id/.test(code));
    check('shop-panel: source wires the developer-tools strip', /data-debug/.test(code));
    check('shop-panel: source removes its listeners in destroy()', /removeEventListener/.test(code));

    // Wave B tree contract: the renderer builds the exact Task 21 hooks, the
    // toggle is persistent (aria-pressed, delegated), and unlock feedback is a
    // one-shot animation + a toast — never a looping highlight.
    check(
      'shop-panel: source renders .skill-node with data-state/data-depth + name/reward hooks',
      /skill-node/.test(code) &&
        /data-state/.test(code) &&
        /data-depth/.test(code) &&
        /data-node-id/.test(code) &&
        /skill-node-name/.test(code) &&
        /skill-node-reward/.test(code),
    );
    check(
      'shop-panel: source wires the persistent Shop/Tree toggle (data-view + aria-pressed)',
      /shop-view-opt/.test(code) && /data-view/.test(code) && /aria-pressed/.test(code),
    );
    check(
      'shop-panel: source applies a one-shot, animation-driven highlight class',
      /is-newly-achieved/.test(code) && /animationend/.test(code) && !/animationiteration/.test(code),
    );
    check(
      'shop-panel: source reports unlock feedback through the injected onToast',
      /onToast/.test(code) && /unlockToast/.test(code),
    );
    {
      // Reset regression lock: the empty-batch path must clear the memo, or a
      // post-reset re-unlock of the same node is silently swallowed.
      const unlockFn = code.match(/\n  _applyUnlockHighlight\([\s\S]*?\n  \}/);
      check(
        'shop-panel: the unlock-highlight empty-batch path clears the last-batch memo (reset regression lock)',
        Array.isArray(unlockFn) &&
          /ids\.length\s*===\s*0/.test(unlockFn[0]) &&
          /_lastUnlockSignature\s*=\s*null/.test(unlockFn[0]),
      );
    }
    {
      // The tree is the FULL graph: no search/category filtering inside it.
      const treeFn = code.match(/_renderTree\([\s\S]*?\n  \}/);
      check(
        'shop-panel: tree renderer never applies search/category filtering',
        Array.isArray(treeFn) && !/filterModels|filterGroups|_query|_categoryId/.test(treeFn[0]),
      );
    }
    {
      // Multi-branch fix: the tree renderer must group by branch and mount one
      // `.skill-branch` lane per branch (the shared bottom baseline), not one flat
      // column. The node hooks themselves are asserted separately above.
      const treeFn = code.match(/_renderTree\([\s\S]*?\n  \}/);
      check(
        'shop-panel: tree renderer builds a .skill-branch lane per branch (multi-branch fix)',
        Array.isArray(treeFn) &&
          /treeBranches\s*\(/.test(treeFn[0]) &&
          /skill-branch/.test(treeFn[0]) &&
          /data-branch-id/.test(treeFn[0]) &&
          /appendChild\(lane\)/.test(treeFn[0]),
      );
    }
    {
      // P5: the authored category icon must be emitted as a `data-icon` CSS marker
      // while the chip's textContent stays exactly the label.
      const toolbarFn = code.match(/\n  _syncToolbar\([\s\S]*?\n  \}/);
      check(
        'shop-panel: source renders the category icon via data-icon, keeping the chip label text',
        Array.isArray(toolbarFn) &&
          /data-icon/.test(toolbarFn[0]) &&
          /textContent\s*=\s*chip\.label/.test(toolbarFn[0]) &&
          !/textContent\s*=\s*chip\.icon/.test(toolbarFn[0]),
      );
    }
    check(
      'shop-panel: source renders the tree error/retry state from the view',
      /skillFail/.test(code) && /TREE_ERROR_LABEL|TREE_EMPTY_LABEL/.test(code),
    );

    // Regression lock: below the 1180px breakpoint the rail is the DEFAULT, so
    // expanding must be an explicit `.user-expanded` override, and `aria-expanded`
    // must follow the VISUAL state via the shared helpers.
    check(
      'shop-panel: source handles the responsive rail (.user-expanded + matchMedia)',
      /user-expanded/.test(code) && /matchMedia/.test(code),
    );
    check(
      'shop-panel: source routes collapse through _visuallyCollapsed + _applyCollapse',
      /_visuallyCollapsed/.test(code) && /_applyCollapse/.test(code),
    );
    check('shop-panel: source still never uses innerHTML (responsive-fix regression lock)', !/innerHTML/.test(code));

    // ------------------------------------------------------------------------
    // Tree DOM contract (Task 9) — edges, card previews and the single-owner FX.
    // Each method is matched with a leading `\n  ` so a call site can never
    // satisfy a tripwire meant for the implementation.
    // ------------------------------------------------------------------------
    {
      // The card's media box is its FIRST child and reads the synchronous cache
      // via `getThumbnail` — never an await, never an import.
      const cardFn = code.match(/\n  _buildCard\([\s\S]*?\n  \}/);
      check(
        'shop-panel: card builder renders a .shop-card-preview media box from getThumbnail',
        Array.isArray(cardFn) && /shop-card-preview/.test(cardFn[0]) && /getThumbnail/.test(cardFn[0]),
      );
    }
    {
      // The edge layer is SVG built attribute-by-attribute (`createElementNS`),
      // carries the `skill-tree-edges` class, and tags each line with `data-edge`.
      // The `edge-` id prefix is authored by tree-layout and documented here.
      const treeFn = code.match(/\n  _renderTree\([\s\S]*?\n  \}/);
      check(
        'shop-panel: tree renderer builds an SVG edge layer (createElementNS + skill-tree-edges + edge- + data-edge)',
        Array.isArray(treeFn) &&
          /createElementNS/.test(treeFn[0]) &&
          /skill-tree-edges/.test(treeFn[0]) &&
          /data-edge/.test(treeFn[0]) &&
          /edge-/.test(src),
      );
    }
    {
      // The FX may only run on a GENUINE batch: `_renderTree` must gate the
      // `_playUnlockFx` call on the truthy return of `_applyUnlockHighlight`, so
      // an unrelated re-render that re-passes the same batch cannot replay it.
      const treeFn = code.match(/\n  _renderTree\([\s\S]*?\n  \}/);
      check(
        'shop-panel: _renderTree invokes _playUnlockFx only on a truthy _applyUnlockHighlight return',
        Array.isArray(treeFn) &&
          /_applyUnlockHighlight\s*\(/.test(treeFn[0]) &&
          /if\s*\(\s*fired\s*\)\s*this\._playUnlockFx\s*\(/.test(treeFn[0]),
      );
    }
    {
      // Sole ownership: exactly ONE `classList.add` adds the pulse class. The
      // `NEWLY_ACHIEVED_CLASS` constant declaration is not a call, so it cannot
      // inflate the count.
      const newlyAdds = [...code.matchAll(/classList\.add\(\s*([A-Za-z_$][\w$]*|['"][^'"]*['"])\s*\)/g)]
        .map((m) => m[1])
        .filter((arg) => arg === 'NEWLY_ACHIEVED_CLASS' || arg === "'is-newly-achieved'");
      check(
        'shop-panel: _playUnlockFx is the only classList.add owner of the is-newly-achieved pulse',
        /_playUnlockFx\s*\(/.test(code) && newlyAdds.length === 1,
      );
    }
    {
      // The FX chain paints the edge class (aliased) but must NEVER listen for
      // `animationiteration` — that would make the one-shot fill loop.
      const fxFn = code.match(/\n  _playUnlockFx\([\s\S]*?\n  \}/);
      check(
        'shop-panel: unlock FX references the is-filling edge class and never uses animationiteration',
        Array.isArray(fxFn) &&
          /EDGE_FILLING_CLASS/.test(fxFn[0]) &&
          /is-filling/.test(code) &&
          !/animationiteration/.test(code),
      );
    }
    {
      // The decision path decides + memoizes only; the FX chain owns the class,
      // so `_applyUnlockHighlight` can never double-pulse a node. (Its empty-batch
      // memo reset is locked verbatim in the block above.)
      const hlFn = code.match(/\n  _applyUnlockHighlight\([\s\S]*?\n  \}/);
      check(
        'shop-panel: _applyUnlockHighlight never adds the pulse class (no double-pulse)',
        Array.isArray(hlFn) && !/is-newly-achieved|NEWLY_ACHIEVED_CLASS/.test(hlFn[0]),
      );
    }
    {
      // A batch that arrived while Tree was hidden is flushed once on entry.
      const viewFn = code.match(/\n  _applyView\([\s\S]*?\n  \}/);
      check(
        'shop-panel: _applyView flushes a deferred unlock FX batch (references _pendingFx)',
        Array.isArray(viewFn) && /_pendingFx/.test(viewFn[0]),
      );
    }
  }
}
