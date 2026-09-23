(function () {
  'use strict';
  /** Conservative session limits, not a hardware certification. Check BEFORE a tick so stopping
   * preserves the completed tick's scores, logs and examples rather than pruning evidence. */
  function exceeded(run) {
    if (!run) return false;
    let retained = run.items.length, logs = 0, trails = 0;
    if (retained >= 2000 || run.blockOrder.length > 1000) return true;
    for (const item of run.items) if (item.trail.length >= 256) return true;
    for (const id of run.blockOrder) {
      const s = run.blocks[id];
      if (s.log) {
        logs += s.log.length;
        for (const row of s.log) trails += (row.trail || []).length;
      }
      if (s.piles) for (const pile of Object.values(s.piles)) retained += pile.length;
    }
    return logs >= 10000 || trails >= 100000 || retained >= 20000;
  }
  const api = { exceeded };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.WorkshopRuntimeBudget = api;
})();
