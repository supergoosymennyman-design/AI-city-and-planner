'use strict';
/**
 * The away report — spec §7 "Engagement": each session opens with a seeded replay of what the
 * machine did while the child was gone. The engine only ever PROPOSES effects (contract §6);
 * an away run COLLECTS those proposals instead of applying them, so the report can honestly
 * say "it WOULD have filed 12 examples — review and accept?". Item plane only (spec §8.1):
 * no external signals enter, so a live sense (Camera, Pose) is honestly silent by construction:
 * no captured picture ever reaches a crate to classify, and its engine fn returns null — same as
 * an untaught brain.
 *
 * Pure module: no DOM, no clock, no Math.random. The host owns the seed, the trigger, and
 * what "accept" does with the filings.
 */

// NOT named `engine`: classic <script> files share one global lexical scope, and score.js
// already declares `const engine` — a duplicate here is a page-killing SyntaxError.
const awayEngine = (typeof require === 'function') ? require('./engine.js') : window.WorkshopEngine;

/**
 * Run the machine sealed for `ticks`, keeping every proposed effect.
 * Dial state (budgets included) lives on the run's own copy — the real table's dials are
 * untouched, which is what lets the report promise "no real asks were spent".
 * @returns {{run, effects: Array, budgetEmpty: number}}
 */
function awayRun(layout, seed, senses, ticks) {
  const run = awayEngine.createRun(layout, { seed, senses });
  const effects = [];
  let budgetEmpty = 0;
  for (let i = 0; i < ticks; i++) {
    const out = awayEngine.tick(run, []);
    for (const fx of out.effects) effects.push(fx);
    for (const e of out.events) if (e.t === 'budget-empty') budgetEmpty += 1;
  }
  return { run, effects, budgetEmpty };
}

/**
 * Summarize an away run into the story the report card tells.
 * @returns {{bins: [{id,name,count}], landed, emitted,
 *            filings: {shelf: [{itemId,data,block}]}, filed, asks, sends, budgetEmpty}}
 *   filings = teach proposals grouped by shelf, each with the item data AND the proposing
 *   block's id (spec R2 — acceptFilings resolves it against the live table, same as live play)
 *   so "accept" can file them for real; asks/sends = counts of cloudAsk/send proposals that
 *   never fired.
 */
function awayReport(away) {
  const run = away.run;
  const bins = [];
  let landed = 0;
  for (const id of run.blockOrder) {
    const b = run.byId[id];
    if (b.type !== 'bin' && b.type !== 'checker') continue; // a checker is a bin that opens the crate
    const count = run.blocks[id].count;
    landed += count;
    bins.push({ id, name: b.name || id, count });
  }
  const filings = {};
  let filed = 0, asks = 0, sends = 0;
  for (const fx of away.effects) {
    if (fx.type === 'teach') {
      const shelf = fx.shelf || 'examples';
      (filings[shelf] = filings[shelf] || []).push({ itemId: fx.itemId, data: fx.data, block: fx.block });
      filed += 1;
    }
    if (fx.type === 'cloudAsk') asks += 1;
    if (fx.type === 'send') sends += 1;
  }
  return { bins, landed, emitted: run.nextItemId - 1, filings, filed, asks, sends, budgetEmpty: away.budgetEmpty };
}

const WorkshopAway = { awayRun, awayReport };
if (typeof module !== 'undefined' && module.exports) module.exports = WorkshopAway;
if (typeof window !== 'undefined') window.WorkshopAway = WorkshopAway;
