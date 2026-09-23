'use strict';
/** Measured classification trials. No teaching, storage, clock, or inferred diagnoses. */
(function () {
  const Record = typeof require === 'function' ? require('./evaluation-record.js') : window.WorkshopEvaluationRecord;
  const freeze = value => {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  };
  /** Counts and denominators for one frozen evaluation; unavailable is never zero. */
  function metrics(s) {
    return { error: s.answered ? s.wrong / s.answered : null,
      notCorrect: s.scorable ? (s.scorable - s.right) / s.scorable : null,
      complete: s.scorable > 0 && s.unread === 0 && s.errors === 0 && s.unscorable === 0 };
  }
  /** Prove the bank contains exactly the labelled Training photos, not held-out or extra examples. */
  function bankMatches(brain, training) {
    const expected = new Map(training.map(r => [r.id, r]));
    const seen = new Set();
    for (const [label, shelf] of Object.entries(brain.shelves || {})) for (const ex of shelf) {
      const id = ex.ref && ex.ref.id, row = expected.get(id);
      if (!row || ex.ref.dataset !== row.data.libraryDataset || seen.has(id) || label !== row.reference.value || !Array.isArray(ex.vec)
        || ex.vec.length !== row.data.vec.length || ex.vec.some((v, i) => v !== row.data.vec[i])) return false;
      seen.add(id);
    }
    return seen.size === expected.size && seen.size > 0 && !(brain.waiting || []).length;
  }
  /** Evaluate requested piles synchronously using ONE supplied, already-taught predictor.
   * Rows: {id, reference, data}; identity: {experiment, model, k}. No feature payload is retained. */
  function check(piles, predict, requested, identity) {
    const seen = new Set();
    for (const pile of ['training', 'validation', 'test']) for (const row of piles[pile] || []) {
      if (seen.has(row.id)) throw new Error('An example belongs to more than one pile.');
      seen.add(row.id);
    }
    const results = {};
    for (const pile of requested) {
      if (!['training', 'validation', 'test'].includes(pile) || !(piles[pile] || []).length) throw new Error('This pile has no examples.');
      const outcomes = piles[pile].map(row => {
        let reading;
        try {
          const r = predict(row.data);
          reading = !r ? { status: 'unread' } : r.libraryError ? { status: 'error' }
            : r.unsure ? { status: 'unsure' } : { status: 'answered', guess: r.label };
        } catch (_) { reading = { status: 'error' }; }
        return Record.outcome(row.id, reading, row.reference);
      });
      const summary = Record.summarize(outcomes, { kind: 'class' });
      results[pile] = { outcomes, summary, metrics: metrics(summary) };
    }
    return freeze({ ...identity, results });
  }
  /** Keep repeated k-values as separate trials; never connect incompatible experiments or Test. */
  function points(trials, experiment) {
    return trials.flatMap((trial, index) => {
      if (trial.experiment !== experiment || !trial.results.training || !trial.results.validation
        || !trial.results.training.metrics.complete || !trial.results.validation.metrics.complete) return [];
      return ['training', 'validation'].map(pile => ({ trial: index, pile, x: trial.k,
        y: trial.results[pile].metrics.notCorrect, n: trial.results[pile].summary.scorable }));
    });
  }
  const api = { metrics, bankMatches, check, points };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.WorkshopMLRecipe = api;
})();
