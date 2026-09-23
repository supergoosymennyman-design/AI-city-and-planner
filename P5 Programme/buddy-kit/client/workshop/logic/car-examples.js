/* Car benches shared by the Demo-file builder and the two explicit tutorials.
 * Pure table construction; no storage, DOM or runtime gallery picker. */
(function () {
'use strict';
function make(kind, { defaultBlock, Library, carsBinding, carMystery, t }) {
  const C = (id, type, x, y, extra) => { const p = Object.assign(defaultBlock(type, id), { x, y }, extra); delete p.learning; return p; };
  const S = (fp, fe, tp, te) => ({ from: { piece: fp, end: fe }, to: { piece: tp, end: te } });
  const W = (fb, fp, tb, tp) => ({ from: { block: fb, port: fp }, to: { block: tb, port: tp } });
    if (kind === 'fuelforecast') {
      // BENCH 1 — THE BASE MACHINE, and the ONLY car gallery with a Board (grill Q17): the other
      // three have no held-out set, so a Board there would be decoration. Its three Buttons are the
      // lesson's three acts, left to right: Teach it (the Training pile as a LEARN pass — the Model
      // files each row instead of guessing, and the Evaluator swallows it unscored), Test what it
      // studied (the SAME rows as an ANSWER pass, scored under Training), Test on new (the held-out
      // Validation pile, scored in its own column). The gap between the last two IS the lesson. The
      // Board watches the Model's own `degree` dial (the line brain's curve dial) and is fed the
      // Evaluator's `error` — each test drops a point, so turning the dial redraws the curve.
      // The Test pile keeps its release unwired on purpose (the sealed exam; the ice-cream stand's
      // own ruling, game.js's ic_split note).
      return {
        pieces: [
          C('ff_src', 'files', 30, 40, { libraryData: carsBinding('train'), rate: 120 }),
          C('ff_split', 'splitter', 220, 40, {}),
          C('ff_feed', 'feeder', 30, 300, { items: [], rate: 120 }),
          C('ff_t1', 'track', 200, 300, { speed: 2 }),
          C('ff_reader', 'sense', 400, 40, { senseId: 'data', brainId: 'line', penalty: 0, watchPiece: 'ff_t1', name: t('gallery.datalabReader') }),
          C('ff_check', 'checker', 560, 300, {}),
          C('ff_guess', 'sign', 700, 40, { mode: 'label', name: t('gallery.datalabGuess') }),
          C('ff_done', 'sign', 960, 40, { mode: 'value', name: t('gallery.icecreamDone') }),
          C('ff_board', 'board', 700, 300, { watchBlock: 'ff_reader', watchDial: 'degree', name: t('gallery.icecreamBoard') }),
          C('ff_btnTeach', 'button', 120, 480, { name: t('gallery.icecreamTeach') }),
          C('ff_btnQuizA', 'button', 320, 480, { name: t('gallery.icecreamQuizA') }),
          C('ff_btnQuizB', 'button', 540, 480, { name: t('gallery.icecreamQuizB') }),
        ],
        snaps: [
          S('ff_feed', 'out', 'ff_t1', 'in'), S('ff_t1', 'out', 'ff_check', 'in'),
        ],
        wires: [
          W('ff_src', 'row', 'ff_split', 'in'),
          W('ff_split', 'row', 'ff_feed', 'drop'),
          W('ff_btnTeach', 'pressed', 'ff_split', 'teach'),
          W('ff_btnQuizA', 'pressed', 'ff_split', 'releaseTraining'),
          W('ff_btnQuizB', 'pressed', 'ff_split', 'releaseValidation'),
          W('ff_reader', 'reading', 'ff_guess', 'show'),
          W('ff_split', 'done', 'ff_done', 'show'),
          W('ff_check', 'error', 'ff_board', 'watch'),
        ],
      };
    }
    if (kind === 'designcar') {
      // BENCH 2 — DESIGN UNDER CONSTRAINT. The spine plus a Car Maker whose item-out joins the SAME
      // belt (dc_t1), so a built car and a data row are the same thing to the Model. THREE
      // challenges, easy -> hard, each a target mpg (the Car Maker's `target` dial) plus a
      // constraint: ch1 a power ceiling, ch2 a weight floor, ch3 both and tighter. Each constraint
      // is a plain `filter` over the relevant DIAL VALUE plus a Display stating the rule.
      //   WHY A CALCULATE STANDS IN FRONT OF EACH FILTER: the engine has no dial-read out-port
      //   (OUT_PORTS carries no `dial:` source — see engine.js:436), so the only honest way to
      //   watch a dial value is the crate the Car Maker built: the Model's `result` signal carries
      //   the crate's `data.features` (engine.js:861-865), and a `calculate` in copyValue mode
      //   lifts `features.power` / `features.weight` onto a signal value the filter can test. No
      //   arithmetic (copyValue is a copy), no new block, no engine change.
      //   THE WIN: the Car Maker's crate carries `value` = the target mpg, so the EXISTING Evaluator
      //   grades the Model's prediction against it; a hit fires `checker:right` -> the Tally's
      //   `plus` -> `atN` -> the Lamp. ACT GATING (grill Q7): the Tally counts rights only, and its
      //   `n` dial starts at 1000 — the act-1 Button (Teach it) both releases the Training pile AND
      //   resets the Tally and writes its `n` to 1, so an early `go` before teaching shows a live
      //   prediction but can never light the Lamp.
      return {
        pieces: [
          C('dc_src', 'files', 30, 40, { libraryData: carsBinding('train'), rate: 120 }),
          C('dc_split', 'splitter', 220, 40, {}),
          C('dc_feed', 'feeder', 30, 300, { items: [], rate: 120 }),
          C('dc_t1', 'track', 200, 300, { speed: 2 }),
          C('dc_reader', 'sense', 400, 40, { senseId: 'data', brainId: 'line', penalty: 0, watchPiece: 'dc_t1', name: t('gallery.datalabReader') }),
          C('dc_check', 'checker', 560, 300, {}),
          C('dc_guess', 'sign', 700, 40, { mode: 'label', name: t('gallery.datalabGuess') }),
          C('dc_maker', 'carmaker', 200, 540, { target: 30 }),
          C('dc_btnTeach', 'button', 120, 700, { name: t('gallery.icecreamTeach') }),
          C('dc_btnGo', 'button', 320, 700, { name: t('port.go') }),
          C('dc_calcP', 'calculate', 700, 300, { operation: 'copyValue', left: 'measurement', leftName: 'power', right: 'constant', n: 0, field: 'power' }),
          C('dc_calcW', 'calculate', 700, 480, { operation: 'copyValue', left: 'measurement', leftName: 'weight', right: 'constant', n: 0, field: 'weight' }),
          C('dc_fl1', 'filter', 900, 140, { mode: 'any', test: 'lt', n: 150 }),
          C('dc_sign1', 'sign', 1080, 140, { mode: 'label', name: t('gallery.designcar.ch1') }),
          C('dc_fl2', 'filter', 900, 320, { mode: 'any', test: 'gt', n: 3500 }),
          C('dc_sign2', 'sign', 1080, 320, { mode: 'label', name: t('gallery.designcar.ch2') }),
          C('dc_fl3', 'filter', 900, 500, { mode: 'any', test: 'lt', n: 120 }),
          C('dc_calcW2', 'calculate', 700, 620, { operation: 'copyValue', left: 'measurement', leftName: 'weight', right: 'constant', n: 0, field: 'weight' }),
          C('dc_fl4', 'filter', 900, 640, { mode: 'any', test: 'gt', n: 3800 }),
          C('dc_sign3', 'sign', 1080, 500, { mode: 'label', name: t('gallery.designcar.ch3') }),
          C('dc_cnt', 'counter', 1080, 40, { n: 1000 }),
          C('dc_lamp', 'lamp', 1240, 40, { colour: 'green', seconds: 2 }),
        ],
        snaps: [
          S('dc_feed', 'out', 'dc_t1', 'in'),
          S('dc_maker', 'out', 'dc_t1', 'in'),
          S('dc_t1', 'out', 'dc_check', 'in'),
        ],
        wires: [
          W('dc_src', 'row', 'dc_split', 'in'),
          W('dc_split', 'row', 'dc_feed', 'drop'),
          W('dc_btnTeach', 'pressed', 'dc_split', 'teach'),
          W('dc_btnTeach', 'pressed', 'dc_cnt', 'reset'),
          W('dc_btnTeach', 'pressed', 'dc_cnt', 'dial:n'),
          W('dc_btnGo', 'pressed', 'dc_maker', 'go'),
          W('dc_reader', 'reading', 'dc_guess', 'show'),
          W('dc_check', 'right', 'dc_cnt', 'plus'),
          W('dc_cnt', 'atN', 'dc_lamp', 'on'),
          W('dc_reader', 'result', 'dc_calcP', 'in'),
          W('dc_reader', 'result', 'dc_calcW', 'in'),
          W('dc_calcP', 'out', 'dc_fl1', 'in'), W('dc_fl1', 'out', 'dc_sign1', 'show'),
          // ch3 is an AND, not two ORs: the power ceiling GATES the weight floor, so the rule
          // Display fires only when the SAME car is under 120 hp AND at least 3800 lbs. dc_fl3
          // passes the power signal, dc_calcW2 re-lifts `features.weight` off that same signal's
          // data, and dc_fl4 tests the floor — a breach of either condition alone never reaches
          // dc_sign3. (Grading is untouched: the win is still the Model's prediction vs the target.)
          W('dc_calcP', 'out', 'dc_fl3', 'in'), W('dc_fl3', 'out', 'dc_calcW2', 'in'),
          W('dc_calcW2', 'out', 'dc_fl4', 'in'), W('dc_fl4', 'out', 'dc_sign3', 'show'),
          W('dc_calcW', 'out', 'dc_fl2', 'in'), W('dc_fl2', 'out', 'dc_sign2', 'show'),
        ],
      };
    }
    if (kind === 'mysterycar') {
      // BENCH 3 — SEARCHING BACKWARDS THROUGH A FORWARD PREDICTOR. The same machine, but the Car
      // Maker's `target` is not a dial the child picks: it is the mpg of ONE frozen TEST row drawn
      // by the seeded rng (carMystery, seed 42 — the host default), so the hidden figure is a REAL
      // car's. The child turns power and weight until the Model's prediction matches it; a hit
      // fires `checker:right` -> the Tally -> the Lamp (the same win path as bench 2, with the same
      // act-1 gating). On a win the reveal Display speaks the real row's OWN numbers — the dataset
      // has no make/model/year, so it shows hp/weight/mpg and the row id, and nothing it does not
      // have.
      const m = carMystery(42);
      // The row id LEADS, not trails (NIT 3): label() ellipsises a long sign label from its TAIL,
      // so "(cars-133)" at the end was cut to "(car…". Leading with it guarantees the child sees
      // the whole id, and the shortened sentence fits the 240 px Display at its 9 px caption.
      const reveal = m.id + ' did ' + m.value + ' mpg — ' + m.values[0] + ' hp, ' + m.values[1] + ' lbs';
      return {
        pieces: [
          C('mc_src', 'files', 30, 40, { libraryData: carsBinding('train'), rate: 120 }),
          C('mc_split', 'splitter', 220, 40, {}),
          C('mc_feed', 'feeder', 30, 300, { items: [], rate: 120 }),
          C('mc_t1', 'track', 200, 300, { speed: 2 }),
          C('mc_reader', 'sense', 400, 40, { senseId: 'data', brainId: 'line', penalty: 0, watchPiece: 'mc_t1', name: t('gallery.datalabReader') }),
          C('mc_check', 'checker', 560, 300, {}),
          C('mc_guess', 'sign', 700, 40, { mode: 'label', name: t('gallery.datalabGuess') }),
          C('mc_maker', 'carmaker', 200, 540, { target: m.value }),
          C('mc_btnTeach', 'button', 120, 700, { name: t('gallery.icecreamTeach') }),
          C('mc_btnGo', 'button', 320, 700, { name: t('port.go') }),
          C('mc_cnt', 'counter', 900, 40, { n: 1000 }),
          C('mc_lamp', 'lamp', 1080, 40, { colour: 'green', seconds: 2 }),
          C('mc_reveal', 'sign', 900, 300, { mode: 'label', name: reveal }),
        ],
        snaps: [
          S('mc_feed', 'out', 'mc_t1', 'in'),
          S('mc_maker', 'out', 'mc_t1', 'in'),
          S('mc_t1', 'out', 'mc_check', 'in'),
        ],
        wires: [
          W('mc_src', 'row', 'mc_split', 'in'),
          W('mc_split', 'row', 'mc_feed', 'drop'),
          W('mc_btnTeach', 'pressed', 'mc_split', 'teach'),
          W('mc_btnTeach', 'pressed', 'mc_cnt', 'reset'),
          W('mc_btnTeach', 'pressed', 'mc_cnt', 'dial:n'),
          W('mc_btnGo', 'pressed', 'mc_maker', 'go'),
          W('mc_reader', 'reading', 'mc_guess', 'show'),
          W('mc_check', 'right', 'mc_cnt', 'plus'),
          W('mc_cnt', 'atN', 'mc_lamp', 'on'),
          W('mc_check', 'right', 'mc_reveal', 'show'),
        ],
      };
    }
    if (kind === 'garagedoor') {
      // BENCH 4 — THE GUARD THE CHILD CAN SEE AND RE-WIRE. The spine plus a Car Maker plus a guard:
      // the Model's `result` signal carries the built car's dial values (data.features), two
      // copyValue `calculate` blocks lift power and weight onto signal values, and FOUR filters
      // watch the trained box's edges (power 40-250, weight 1500-5500) — one per boundary, since a
      // filter tests ONE scalar against ONE dial. Any breach lights the red Lamp and feeds the
      // Display that states the real limit out loud. Inside the box every filter stays silent and
      // the Lamp stays dark.
      //   THE LIMITATION, RECORDED (grill Q14/M3): the engine has NO built-in regression abstention
      //   and this gallery does NOT add any — the line brain extrapolates by design (brains/line.js
      //   says so), so the machine still answers nonsense outside the box, and the honesty had to be
      //   built by hand, out of existing blocks. That IS the lesson. Unwire any filter->lamp wire
      //   and the machine goes back to answering confidently: the safety valve is a wire a child can
      //   pull.
      return {
        pieces: [
          C('gd_src', 'files', 30, 40, { libraryData: carsBinding('train'), rate: 120 }),
          C('gd_split', 'splitter', 220, 40, {}),
          C('gd_feed', 'feeder', 30, 300, { items: [], rate: 120 }),
          C('gd_t1', 'track', 200, 300, { speed: 2 }),
          C('gd_reader', 'sense', 400, 40, { senseId: 'data', brainId: 'line', penalty: 0, watchPiece: 'gd_t1', name: t('gallery.datalabReader') }),
          C('gd_check', 'checker', 560, 300, {}),
          C('gd_guess', 'sign', 700, 40, { mode: 'label', name: t('gallery.datalabGuess') }),
          C('gd_maker', 'carmaker', 200, 540, { target: 30 }),
          C('gd_btnTeach', 'button', 120, 700, { name: t('gallery.icecreamTeach') }),
          C('gd_btnGo', 'button', 320, 700, { name: t('port.go') }),
          C('gd_calcP', 'calculate', 700, 300, { operation: 'copyValue', left: 'measurement', leftName: 'power', right: 'constant', n: 0, field: 'power' }),
          C('gd_calcW', 'calculate', 700, 480, { operation: 'copyValue', left: 'measurement', leftName: 'weight', right: 'constant', n: 0, field: 'weight' }),
          C('gd_flPhi', 'filter', 900, 100, { mode: 'any', test: 'gt', n: 250 }),
          C('gd_flPlo', 'filter', 900, 200, { mode: 'any', test: 'lt', n: 40 }),
          C('gd_flWhi', 'filter', 900, 400, { mode: 'any', test: 'gt', n: 5500 }),
          C('gd_flWlo', 'filter', 900, 500, { mode: 'any', test: 'lt', n: 1500 }),
          C('gd_lamp', 'lamp', 1240, 300, { colour: 'red', seconds: 2 }),
          C('gd_sign', 'sign', 1240, 100, { mode: 'label', name: t('gallery.garagedoor.guard') }),
        ],
        snaps: [
          S('gd_feed', 'out', 'gd_t1', 'in'),
          S('gd_maker', 'out', 'gd_t1', 'in'),
          S('gd_t1', 'out', 'gd_check', 'in'),
        ],
        wires: [
          W('gd_src', 'row', 'gd_split', 'in'),
          W('gd_split', 'row', 'gd_feed', 'drop'),
          W('gd_btnTeach', 'pressed', 'gd_split', 'teach'),
          W('gd_btnGo', 'pressed', 'gd_maker', 'go'),
          W('gd_reader', 'reading', 'gd_guess', 'show'),
          W('gd_reader', 'result', 'gd_calcP', 'in'),
          W('gd_reader', 'result', 'gd_calcW', 'in'),
          W('gd_calcP', 'out', 'gd_flPhi', 'in'), W('gd_flPhi', 'out', 'gd_lamp', 'on'),
          W('gd_calcP', 'out', 'gd_flPlo', 'in'), W('gd_flPlo', 'out', 'gd_lamp', 'on'),
          W('gd_calcW', 'out', 'gd_flWhi', 'in'), W('gd_flWhi', 'out', 'gd_lamp', 'on'),
          W('gd_calcW', 'out', 'gd_flWlo', 'in'), W('gd_flWlo', 'out', 'gd_lamp', 'on'),
          // ANY box-edge breach states the range, not just the power ceiling (NIT 5): all four
          // filters already light the Lamp, so all four must also feed the rule Display.
          W('gd_flPhi', 'out', 'gd_sign', 'show'),
          W('gd_flPlo', 'out', 'gd_sign', 'show'),
          W('gd_flWhi', 'out', 'gd_sign', 'show'),
          W('gd_flWlo', 'out', 'gd_sign', 'show'),
        ],
      };
    }

  return null;
}
const api = { make };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.WorkshopCarExamples = api;
})();
