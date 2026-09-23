(function () {
  'use strict';
  // A bank owns its compiled states. Weak keys let deleted/replaced banks be collected;
  // eight independent banks never compete for a four-entry adapter memo.
  const banks = new WeakMap();
  let trainAsync = null;
  function options(adapter, opts = {}) {
    return adapter.id === 'line' ? { penalty: Number(opts.penalty) || 0, degree: Number(opts.degree) || 1 } : {};
  }
  function examples(brain) {
    const out = [];
    for (const label of Object.keys(brain.shelves || {})) for (const e of brain.shelves[label])
      out.push({ id:e.id, label, vec:e.vec, raw:e.raw, display:e.display });
    return out;
  }
  /** Reject oversized training before copying or computing it; never subsample a child's data. */
  function budget(exs, adapter) {
    const cells = exs.reduce((n, e) => n + (e.vec || []).length + (e.raw || []).length, 0);
    if (exs.length > 2000 || cells > (adapter.id === 'neural' ? 131072 : 262144)) {
      const err = new Error('Training data is too large for this Model. Use fewer examples or a smaller set of features.');
      err.code = 'WORKSHOP_TRAINING_LIMIT'; throw err;
    }
  }
  // Exact comparison, including edited vector contents: no hash collisions or stale imported
  // examples. On hits this scans numbers but allocates no JSON strings/weight copies.
  function equal(a, b) {
    if (a === b) return true;
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x,i) => equal(x,b[i]));
    return false;
  }
  function same(a, b) {
    return a.length === b.length && a.every((e,i) => e.id === b[i].id && e.label === b[i].label
      && e.display === b[i].display && equal(e.vec,b[i].vec) && equal(e.raw,b[i].raw));
  }
  function entry(brain, adapter, opts) {
    const exs = examples(brain); budget(exs, adapter);
    const settings = options(adapter, opts), key = JSON.stringify(settings);
    let map = banks.get(brain); if (!map) banks.set(brain, map = new Map());
    let old = map.get(adapter);
    if (old && old.key === key && same(exs,old.examples)) return old;
    old = { key, settings, examples:exs.map(e => ({...e,vec:e.vec.slice(),raw:e.raw && e.raw.slice()})), state:null, pending:null, error:null };
    map.set(adapter,old); return old;
  }
  /** Configure the browser's single training queue. Node/file readers can remain synchronous. */
  function configure(fn) { trainAsync = fn; }
  function begin(e, adapter) {
    if (!e.pending && !e.state && !e.error) {
      e.pending = trainAsync(adapter.id,e.examples,e.settings).then(st => { e.state=st; }, err => { e.error=err; });
    }
    return e.pending;
  }
  /** Read-only compiled state, shared by prediction and its explanation. Null while preparing. */
  function get(brain, adapter, opts) {
    const e = entry(brain,adapter,opts);
    if (e.error) throw e.error;
    if (!e.state) {
      if (trainAsync && adapter.id === 'neural') { begin(e,adapter); return null; }
      e.state = adapter.learn(e.examples,e.settings);
    }
    return e.state;
  }
  /** Prepare before advancing a simulation tick; no crate is scored while training is pending. */
  async function prepare(brain, adapter, opts, onWait) {
    const e = entry(brain,adapter,opts);
    // A stopped/cancelled run may retry; a stale failure never poisons the bank forever.
    if (e.error) { e.error=null; e.pending=null; }
    if (!e.state && !e.error && trainAsync && adapter.id === 'neural') {
      if (onWait) onWait();
      await begin(e,adapter);
    }
    if (e.error) throw e.error;
    return e.state || get(brain,adapter,opts);
  }
  /** Inspect only explicitly supplied live/Undo-retained banks; do not defeat WeakMap cleanup. */
  function payloadBytes(brains, count) {
    const roots=[];
    for(const brain of new Set(brains)) { const map=banks.get(brain); if(map)for(const e of map.values()) roots.push(e.examples,e.state); }
    return count(roots);
  }
  const api = { get, prepare, configure, budget, payloadBytes };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.WorkshopLearnedState = api;
})();
