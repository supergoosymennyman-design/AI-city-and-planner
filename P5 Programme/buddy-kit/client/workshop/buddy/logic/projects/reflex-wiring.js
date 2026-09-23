'use strict';
/**
 * Reflex-Wiring project definition — the child writes flat "if hazard then reaction" rules so
 * their champion clears an obstacle course; the more hazards covered (and the faster the
 * reaction time), the more gates clear. The other of the two mock "universal projects" (see
 * recycle-eye.js for the grouped-photo-classifier shape); together they exercise both slot
 * shapes (`grouped` vs flat) the generic `logic/project-state.js` reducer must support.
 * WHY the model is this simple: a demonstrable STAND-IN for "more/better rules → more reliable
 * behavior", not a real physics or planning sim — see recycle-eye.js's header for the same
 * rationale applied to its classifier mock.
 */
const manifest = {
  projectId: 'reflex-wiring', title: 'Reflex Wiring',
  kidJob: 'wire if-then reflexes so your champion clears the course',
  guide: 'A demo panel. The child adds if-then Reflex rules and sets Reaction speed, then taps Try the ' +
    'course to see the Course result. Point them at those controls; never invent buttons.',
  params: [{ name: 'reactionDelay', label: 'Reaction speed', min: 0, max: 5, step: 0.5 }],
  slots: [{ name: 'rules', label: 'Reflex rules', grouped: false }],
  // readOnly/takesGroup/slow declared explicitly — same door-clean reasoning as recycle-eye.js:
  // the sanitizer emits all three on every check, and testRun WRITES (courseResult readout) and is
  // not group-taking or slow, so all three are false.
  checks: [{ name: 'testRun', label: 'Try the course', readOnly: false, takesGroup: false, slow: false }],
  readouts: [{ name: 'courseResult', label: 'Course result' }],
};
function initialState() {
  return {
    params: { reactionDelay: 2 },
    slots: { rules: { items: ['if wall ahead then turn left'] } },
    readouts: { courseResult: 'not tried yet' },
  };
}
const HAZARDS = ['wall', 'mud', 'gap', 'dark'];
const checkHandlers = {
  /** Counts hazards covered by ANY rule (2 gates each), minus a reactionDelay>3 penalty. */
  testRun(s) {
    const rules = (s.slots.rules && s.slots.rules.items) || [];
    const covered = HAZARDS.filter((h) => rules.some((r) => r.includes(h))).length;
    const penalty = s.params.reactionDelay > 3 ? 2 : 0;
    const cleared = Math.max(0, Math.min(8, covered * 2 - penalty));
    s.readouts.courseResult = `cleared ${cleared}/8 gates`;
    return s;
  },
};

// Browser global (classic <script>) — repo idiom so the same file loads in node:test AND the browser.
// Must come BEFORE the module.exports guard: a bare `module.exports = …` throws ReferenceError in a
// classic <script> (no `module` global there), which would abort the file before either export ran.
if (typeof window !== 'undefined') {
  window.Projects = window.Projects || {};
  window.Projects.reflexWiring = { manifest, initialState, checkHandlers };
}
if (typeof module !== 'undefined' && module.exports) module.exports = { manifest, initialState, checkHandlers };
