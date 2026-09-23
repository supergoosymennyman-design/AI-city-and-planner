'use strict';
/**
 * Recycle-Eye project definition — teach a champion to sort recycling by material (foil vs
 * can) from photos. One of the two mock "universal projects" (see reflex-wiring.js for the
 * other); together they prove `logic/project-state.js`'s generic reducer against two
 * differently-shaped manifests (a GROUPED photo slot here vs a flat rule-list slot there).
 * WHY the numbers mirror the old champion-state.js mock: this is the same simulated
 * "more balanced + more samples → higher held-out accuracy" demo, now expressed as a project
 * definition {manifest, initialState, checkHandlers} the generic engine hosts — no real
 * MobileNet/KNN behind it (see champion-state.js's own header for the original rationale;
 * that file is superseded by this one and removed once every caller has migrated).
 */

const manifest = {
  projectId: 'recycle-eye', title: 'Recycle-Eye',
  kidJob: 'teach your champion to sort recycling by material',
  guide: 'A demo panel. The child sets the Unsure line slider and taps Train and test to see Accuracy; ' +
    'sample photos are provided in the demo. Point them at those two controls; never invent buttons.',
  params: [{ name: 'threshold', label: 'Unsure line', min: 0, max: 1, step: 0.05 }],
  slots: [{ name: 'samples', label: 'Photos', grouped: true }],
  // readOnly/takesGroup/slow all declared explicitly: sanitizeManifest emits all three on every
  // check either way (its fail-closed contract), and this manifest is door-clean-tested
  // (projects.test.js) — in must equal out. trainAndEvaluate WRITES (accuracy/confusions readouts)
  // and is not group-taking or slow, so all three are false.
  checks: [{ name: 'trainAndEvaluate', label: 'Train and test', readOnly: false, takesGroup: false, slow: false }],
  readouts: [{ name: 'accuracy', label: 'Accuracy' }, { name: 'confusions', label: 'Mix-ups' }],
};

function initialState() {
  return {
    params: { threshold: 0.5 },
    slots: { samples: { groups: { foil: ['f1', 'f2'], can: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9'] } } },
    readouts: { accuracy: '74%', confusions: 'foil↔can' },
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

const checkHandlers = {
  /** Recomputes `accuracy` from the current sample counts; clears `confusions` once every
   * group has caught up (≥6 samples) — mirrors champion-state.js's trainAndEvaluate exactly. */
  trainAndEvaluate(s) {
    const groups = (s.slots.samples && s.slots.samples.groups) || {};
    const counts = Object.fromEntries(Object.entries(groups).map(([g, ids]) => [g, ids.length]));
    const acc = estimateAccuracy(counts);
    s.readouts.accuracy = `${Math.round(acc * 100)}%`;
    const countValues = Object.values(counts);
    const minCount = countValues.length ? Math.min(...countValues) : 0;
    if (minCount >= 6) s.readouts.confusions = 'none'; // enough of the weak class → confusion resolved
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
