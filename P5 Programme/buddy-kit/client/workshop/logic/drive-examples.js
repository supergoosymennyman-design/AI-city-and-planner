/* drive-examples.js — the Stage 5 DRIVING starter ("drive-v1").
 *
 * A bench for the sensor-data activity: the Files block holds the driving table
 * (logic/drive-data.js), the Splitter divides it into Training / Validation /
 * Test piles, the Feeder deals a pile past the Track, and a Model wearing the
 * NUMBER sense reads each sensor situation and predicts an action. The child
 * presses Teach it (the Training pile is FILED, not guessed), then Test what it
 * studied and Test on new (the held-out pile) — the gap between the two columns
 * is the lesson, exactly like the ice-cream bench.
 *
 * Why the NUMBER sense: the City's published driving model is the v2 NUMERIC
 * contract (raw fields → bias constant → unit-normalize → shared k-NN). The
 * number sense's own extractor is `unitVec([...numbers, 10])` — the same
 * transform — so what the child trains here is what the City runs, and the
 * published bundle needs no second, city-only transform.
 *
 * Pure table construction; no storage, DOM or runtime behaviour.
 */
(function () {
'use strict';
function make(kind, { defaultBlock, t }) {
  if (kind !== 'drive-v1') return null;
  const C = (id, type, x, y, extra) => { const p = Object.assign(defaultBlock(type, id), { x, y }, extra); delete p.learning; return p; };
  const S = (fp, fe, tp, te) => ({ from: { piece: fp, end: fe }, to: { piece: tp, end: te } });
  const W = (fb, fp, tb, tp) => ({ from: { block: fb, port: fp }, to: { block: tb, port: tp } });
  const name = (key, fallback) => (t ? t(key) : fallback) || fallback;
  return {
    pieces: [
      C('dv_src', 'files', 30, 40, { dataset: 'drive', rate: 120 }),
      C('dv_split', 'splitter', 220, 40, { training: 60, validation: 20 }),
      C('dv_feed', 'feeder', 30, 322, { items: [], rate: 120 }),
      C('dv_t1', 'track', 200, 604, { speed: 2 }),
      C('dv_model', 'sense', 400, 40, {
        senseId: 'num', brainId: 'knn', k: 3, sure: 0.5, penalty: 0, watchPiece: 'dv_t1', files: false,
        name: name('tutorial.example.driveModel', 'Driving Model'),
      }),
      C('dv_check', 'checker', 560, 592, { kind: 'labels', name: name('tutorial.example.driveEvaluator', 'Evaluator') }),
      C('dv_guess', 'sign', 700, 40, { mode: 'label', name: name('tutorial.example.driveAction', 'Action') }),
      C('dv_done', 'sign', 960, 40, { mode: 'value', name: name('tutorial.example.icecreamDone', 'Rows in the last act') }),
      C('dv_cnt', 'counter', 960, 300, { n: 3 }),
      C('dv_lamp', 'lamp', 1120, 300, { colour: 'green', seconds: 2 }),
      C('dv_btnTeach', 'button', 120, 704, { name: name('tutorial.example.icecreamTeach', 'Teach it') }),
      C('dv_btnQuizA', 'button', 320, 704, { name: name('tutorial.example.icecreamQuizA', 'Test what it studied') }),
      C('dv_btnQuizB', 'button', 540, 1004, { name: name('tutorial.example.icecreamQuizB', 'Test on new') }),
    ],
    snaps: [
      S('dv_feed', 'out', 'dv_t1', 'in'),
      S('dv_t1', 'out', 'dv_check', 'in'),
    ],
    wires: [
      W('dv_src', 'row', 'dv_split', 'in'),
      W('dv_split', 'row', 'dv_feed', 'drop'),
      W('dv_btnTeach', 'pressed', 'dv_split', 'teach'),
      W('dv_btnTeach', 'pressed', 'dv_cnt', 'reset'),
      W('dv_btnQuizA', 'pressed', 'dv_split', 'releaseTraining'),
      W('dv_btnQuizB', 'pressed', 'dv_split', 'releaseValidation'),
      W('dv_model', 'reading', 'dv_guess', 'show'),
      W('dv_check', 'right', 'dv_cnt', 'plus'),
      W('dv_cnt', 'atN', 'dv_lamp', 'on'),
      W('dv_split', 'done', 'dv_done', 'show'),
    ],
  };
}
const api = { make };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.WorkshopDriveExamples = api;
})();
