'use strict';
/**
 * Pure Memory-Meter computation. Mirrors the model engine's own session-context-metrics:
 * the current context size is the LAST assistant message's cumulative tokens.total;
 * cost is the running sum of assistant message costs. Real data only — no simulation.
 * @param {Array} messages  assistant/user message objects (assistant has {tokens:{total},cost})
 * @param {number|null} limit  the model's context-window size, or null if unknown
 * @returns {{total:number, limit:(number|null), usage:(number|null), cost:number}}
 */
function meterFrom(messages, limit) {
  const list = Array.isArray(messages) ? messages : [];
  let total = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i];
    if (m && m.role === 'assistant' && m.tokens && (m.tokens.total || 0) > 0) { total = m.tokens.total; break; }
  }
  const cost = list.reduce((s, m) => s + (m && m.role === 'assistant' ? (m.cost || 0) : 0), 0);
  const usage = (typeof limit === 'number' && limit > 0) ? Math.round((total / limit) * 100) : null;
  return { total, limit: limit ?? null, usage, cost };
}
module.exports = { meterFrom };
