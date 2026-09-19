'use strict';
/**
 * Recycle-Eye project definition — teach a champion to sort recycling by material (foil vs
 * can) from photos. One of the two mock "universal projects" (see reflex-wiring.js for the
 * other); together they prove `logic/project-state.js`'s generic reducer against two
 * differently-shaped manifests (a GROUPED photo slot here vs a flat rule-list slot there).
 *
 * Extended with diagnosis and data-augmentation capabilities for the P5 Champion programme:
 * - `diagnoseQuality` (readWrite check) — analyzes sample balance and reports fairness
 * - The buddy coaches the child to add samples to under-represented groups
 */

const manifest = {
  projectId: 'recycle-eye', title: 'Recycle-Eye',
  kidJob: 'teach your champion to sort recycling by material',
  guide: 'A demo panel. The child sets the Unsure line slider and taps Train and test to see Accuracy; ' +
    'sample photos are provided in the demo. Point them at those two controls; never invent buttons. ' +
    'Suggested flow: check balance → add photos to the small group → train and test again.',
  params: [{ name: 'threshold', label: 'Unsure line', min: 0, max: 1, step: 0.05 }],
  slots: [{ name: 'samples', label: 'Photos', grouped: true }],
  checks: [
    { name: 'trainAndEvaluate', label: 'Train and test', readOnly: false },
    { name: 'diagnoseQuality', label: 'Check balance', readOnly: false },
  ],
  readouts: [
    { name: 'accuracy', label: 'Accuracy' },
    { name: 'confusions', label: 'Mix-ups' },
    { name: 'diagnosis', label: 'Balance check' },
    { name: 'suggestion', label: 'What to try' },
  ],
};

function initialState() {
  return {
    params: { threshold: 0.5 },
    slots: { samples: { groups: { foil: ['f1', 'f2'], can: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9'] } } },
    readouts: { accuracy: '74%', confusions: 'foil↔can', diagnosis: '—', suggestion: 'Try "Check balance" to see if your groups are even.' },
  };
}

/** Simulated held-out accuracy: better when class counts are balanced and plentiful. */
function estimateAccuracy(classes) {
  const counts = Object.values(classes);
  if (counts.length === 0) return 0;
  const total = counts.reduce((a, b) => a + b, 0);
  const min = Math.min(...counts), max = Math.max(...counts);
  const balance = max === 0 ? 0 : min / max;          // 0..1, 1 = perfectly balanced
  const volume = Math.min(1, total / 30);             // saturates at ~30 samples
  return Math.round((0.55 + 0.30 * balance + 0.13 * volume) * 100) / 100; // capped ~0.98
}

/**
 * Analyze sample counts and produce a diagnostic verdict.
 * @param {object} groups - map of group name → array of item ids
 * @returns {{ heading: string, detail: string, balance: number, groups: object, suggestion: string }}
 */
function diagnoseBalance(groups) {
  const counts = Object.fromEntries(Object.entries(groups || {}).map(([g, ids]) => [g, ids.length]));
  const values = Object.values(counts);
  const total = values.reduce((a, b) => a + b, 0);
  if (values.length < 2 || total === 0) {
    return {
      heading: 'Need more data',
      detail: 'You need at least 2 groups with photos to train the champion.',
      balance: 0, groups: counts, total,
      suggestion: 'Add photos to at least 2 different groups.',
    };
  }
  const min = Math.min(...values), max = Math.max(...values);
  const balance = max === 0 ? 0 : +(min / max).toFixed(2);  // 0..1
  const smallest = Object.entries(counts).sort((a, b) => a[1] - b[1])[0];

  if (balance >= 0.8) {
    return {
      heading: 'Looking balanced!',
      detail: `Your groups are fairly even (ratio ${balance}). The champion can learn from both sides equally well.`,
      balance, groups: counts, total,
      suggestion: 'Run "Train and test" to see your accuracy, or add more photos to both groups.',
    };
  }
  if (balance >= 0.5) {
    return {
      heading: 'A bit uneven',
      detail: `The "${smallest[0]}" group has ${smallest[1]} photos while the biggest has ${max}. That is a ${+(1/balance).toFixed(1)}× difference — not terrible, but the champion learns better when groups are closer in size.`,
      balance, groups: counts, total,
      suggestion: `Try adding ${Math.ceil(max * 0.5 - smallest[1])} more photos to "${smallest[0]}" to bring it closer.`,
    };
  }
  return {
    heading: 'Very unbalanced!',
    detail: `The "${smallest[0]}" group only has ${smallest[1]} photo${smallest[1] === 1 ? '' : 's'} while the biggest has ${max}. That is a ${+(1/balance).toFixed(0)}× difference! The champion mostly learns from the big group and ignores the small one.`,
    balance, groups: counts, total,
    suggestion: `Add at least ${Math.ceil(max - smallest[1])} more photos to "${smallest[0]}" to level the playing field.`,
  };
}

const checkHandlers = {
  /** Recomputes `accuracy` from the current sample counts; clears `confusions` once every
   * group has caught up (≥6 samples). */
  trainAndEvaluate(s) {
    const groups = (s.slots.samples && s.slots.samples.groups) || {};
    const counts = Object.fromEntries(Object.entries(groups).map(([g, ids]) => [g, ids.length]));
    const acc = estimateAccuracy(counts);
    s.readouts.accuracy = `${Math.round(acc * 100)}%`;
    const countValues = Object.values(counts);
    const minCount = countValues.length ? Math.min(...countValues) : 0;
    if (minCount >= 6) s.readouts.confusions = 'none';
    return s;
  },

  /** Analyzes sample group sizes and produces a readable diagnosis. The buddy reads the
   * diagnosis readout and explains it to the child in plain terms. */
  diagnoseQuality(s) {
    const groups = (s.slots.samples && s.slots.samples.groups) || {};
    const result = diagnoseBalance(groups);
    s.readouts.diagnosis = result.heading + ' — ' + result.detail;
    s.readouts.suggestion = result.suggestion;
    return s;
  },
};

// Browser global (classic <script>) — repo idiom so the same file loads in node:test AND the browser.
// Must come BEFORE the module.exports guard: a bare `module.exports = …` throws ReferenceError in a
// classic <script> (no `module` global there), which would abort the file before either export ran.
if (typeof window !== 'undefined') {
  window.Projects = window.Projects || {};
  window.Projects.recycleEye = { manifest, initialState, checkHandlers };
}
if (typeof module !== 'undefined' && module.exports) module.exports = { manifest, initialState, checkHandlers };
