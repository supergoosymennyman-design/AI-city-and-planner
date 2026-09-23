'use strict';
/**
 * Scored Test scoring — pure functions over a finished run. Spec §3: one sealed run,
 * scored per-bin purity + coverage, result real. An item is RIGHT when it lands in a
 * bin wearing its own label (the child names the bins — authorship of the rig is the
 * child's; the scoring just tells the truth about it). Items without labels can never
 * be right — unlabeled is unscoreable, honestly.
 */

const engine = (typeof require === 'function') ? require('./engine.js') : window.WorkshopEngine;

/** Run a layout for `ticks` with NO external signals — the sealed run. */
function sealedRun(layout, seed, senses, ticks) {
  const run = engine.createRun(layout, { seed, senses });
  for (let i = 0; i < ticks; i++) engine.tick(run, []);
  return run;
}

/**
 * @returns {{perBin: [{id,name,count,right,purity}], landed, emitted, right, coverage}}
 *   purity = right/count per bin (null when the bin is empty);
 *   coverage = landed/emitted (null when nothing was emitted).
 */
function scoreRun(run) {
  const perBin = [];
  let landed = 0;
  let right = 0;
  // A bin named "Paper" catches paper — children capitalise freely, so the match is
  // case- and whitespace-insensitive (caught live: "Paper" vs "paper" scored 0%).
  const norm = (s) => String(s === undefined || s === null ? '' : s).trim().toLowerCase();
  for (const id of run.blockOrder) {
    const b = run.byId[id];
    if (b.type !== 'bin') continue;
    const s = run.blocks[id];
    const name = b.name || id;
    const r = s.log.filter((e) => norm(e.label) === norm(name)).length;
    landed += s.count;
    right += r;
    perBin.push({ id, name, count: s.count, right: r, purity: s.count ? r / s.count : null });
  }
  const emitted = run.nextItemId - 1;
  return { perBin, landed, emitted, right, coverage: emitted ? landed / emitted : null };
}

const WorkshopScore = { sealedRun, scoreRun };
if (typeof module !== 'undefined' && module.exports) module.exports = WorkshopScore;
if (typeof window !== 'undefined') window.WorkshopScore = WorkshopScore;
