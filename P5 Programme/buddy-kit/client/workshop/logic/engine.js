'use strict';
/**
 * The signal engine — implements docs/superpowers/specs/2026-08-16-signal-contract.md
 * and nothing more. Pure logic: no DOM, no clock, no Math.random.
 *
 * tick() advances one tick through the contract's four phases:
 *   MOVE    items travel; feeders emit (seeded); gates route; bins swallow
 *   EMIT    blocks with something to say produce signals; externals injected
 *   DELIVER signals flow out-port → wire → in-port; Filter/Dice pass-or-block inline
 *   ACT     queued actions apply; nothing is visible until next tick
 *           (so a feedback loop advances exactly ONE cycle per tick — contract §4)
 *
 * THE BOUNDARY (contract §6): everything nondeterministic enters as external
 * signals (buttons, room senses, Cloud AI replies). Everything else is a pure
 * function of (layout, seed, external log) — live play IS a recording.
 *
 * The engine has no geometry: tracks are connectivity ("this track feeds that
 * gate"), coordinates belong to the UI. A ring is a track whose `to` points back.
 */

// Dual environment: node --test resolves the require; a classic <script> tag uses the window global.
const rng = (typeof require === 'function') ? require('./rng.js') : window.WorkshopRng;
const Composition = (typeof require === 'function') ? require('./composition.js') : window.WorkshopComposition;
// The private learning loop's contracts (task P4, ruling R5/R11). Session owns what a REFERENCE
// ANSWER is (presence is a boolean, never the truthiness of a value); Record owns the VERDICT RULE
// (grade). The Checker below reads both rather than keeping a second copy of either — index.html
// therefore loads private-session.js and evaluation-record.js BEFORE this file (both are pure and
// depend only on rng.js, so they sit right after it).
const Session = (typeof require === 'function') ? require('./private-session.js') : window.WorkshopPrivateSession;
const Record = (typeof require === 'function') ? require('./evaluation-record.js') : window.WorkshopEvaluationRecord;

const TICK_HZ = 10; // contract §4 — "3 seconds" on a dial = 30 ticks; the engine never sees a clock

// ---------------------------------------------------------------------------
// Port tables — the contract's §5 tables, verbatim. A wire may only reference these.
// Dial ports are written as 'dial:<name>' (dials-are-ports, contract §2).
// ---------------------------------------------------------------------------
const OUT_PORTS = {
  // done: once-mode only (whole-branch review finding C1) — fires ONE signal the tick right
  // after the deck's last crate left, value = how many it dealt. A gate wired to it (instead of
  // a Counter hand-sized to one dataset) always fires at the RIGHT count no matter which dataset
  // the feeder wears — switching datasets can never strand a held Exam pile again.
  feeder: ['emitted', 'done'],
  bin: ['count'],
  // The CHECKER opens the crate (spec 2026-08-18 data-feed §2): guess vs truth. right/wrong/
  // unsure fire per crate (value = running count of that verdict); error fires for numeric crates
  // (value = |guess − truth|) so an Only-if "more than 5" can ring on a bad guess.
  checker: ['right', 'wrong', 'unsure', 'error'],
  // unsure: the sure line's third answer as its OWN signal. The reading wire stays silent
  // (an unsure eye never sorts) — but the doubt itself is wireable to a Sign or Lamp.
  // nearest: a SECOND signal (composing-arc spec §7) firing alongside a confident reading, ONLY
  // when the reading names the winning stored example — a KNN-shaped brain has one, a threshold
  // brain never does. Labelled by the EXAMPLE (its display), not the class, so a Frame wired here
  // shows which taught crate won rather than repeating what the reading wire already said. Its
  // payload is `data.nearest = {id, display, sense}` — the id is only meaningful inside `sense`
  // (example ids are allocated per brain, and every sense owns one), see the EMIT stamp.
  sense: ['reading', 'unsure', 'nearest', 'result'],
  calculate: ['out', 'error'],
  join: ['out', 'agree', 'disagree', 'review'],
  memory: ['out', 'changed'],
  button: ['pressed'],
  timer: ['fire'],
  counter: ['atN', 'value'],
  filter: ['out'],
  // The WINDOW remembers the last few signals and speaks ONE number about them. It is the only
  // block with a memory of its own past, and it is what lets a machine reason about a SEQUENCE
  // rather than about one crate at a time (a moving average, a trend, a peak).
  window: ['out'],
  dice: ['out'],
  cloud: ['answer'],
  // The CAMERA is a capture device with no intelligence: it takes a picture and hands it on.
  // Splitting capture from classification is what puts the thinking ON the belt (spec §4).
  camera: ['picture'],
  // The MICROPHONE is the camera's sibling for ears: a capture device with no intelligence — it
  // records and hands the words on. `heard` carries whatever the host's recognizer returned
  // (spec-shaped exactly like the camera's `picture`); the engine never listens, and never
  // transcribes, itself.
  microphone: ['heard'],
  // The FILES block (task E, owner ruling 2026-08-29): sources are MACHINES, wired into the
  // Feeder — "the Feeder takes ANY input and transforms it to crates", and this block is the
  // camera's sibling for a child's own files. `row` deals one signal WITH PAYLOAD per row of the
  // eaten file, in FILE order (a child's file deals as written — no shuffle, no rng), paced by
  // the rate dial; `done` fires ONCE the tick after the last row left (the feeder's own doneSent
  // idiom — a file has an end, a camera doesn't). No in-ports, no item ends: it sits off the
  // item graph entirely and reaches the belt only through a wire into a feeder's drop.
  files: ['row', 'done'],
  // The SPLITTER (spec 2026-08-31 §5): it speaks the SAME `row` signal the Files block speaks —
  // payload and all — so a Feeder's `drop` on the other end cannot tell the two apart. `done`
  // fires once per pile as that pile empties, carrying the pile's name.
  splitter: ['row', 'done'],
};
const IN_PORTS = {
  // drop: a signal IS an item — the crate enters wearing the signal's label as its tag.
  // This is how a ROOM sense (the camera) feeds the belt with things the table cannot
  // see: real object → taught eye's reading → drop → a crate the machine can sort.
  feeder: ['drop'],
  gate: ['switch'],
  // The PEN's one control (task B, owner-ordered rework 2026-08-28): release opens it. Split off
  // the gate's own port table — the gate no longer knows or cares what release is for; a Pen is
  // the ONLY block release means anything to now (was `gate:release`, the dying Split gate's dam).
  pen: ['release'],
  // `in` takes the rows (from a Files block's `row`). The ACTS (spec §6): `teach` deals the
  // Training pile to be STUDIED; each release deals its pile to be TESTED — teaching and testing
  // the same pile are different acts, so the training pile has two doors. The exam pile keeps
  // only its own (spec §8).
  splitter: ['in', 'teach', 'releaseTraining', 'releaseValidation', 'releaseTest'],
  filter: ['in'],
  calculate: ['in'], join: ['left','right'], memory: ['store','read','clear'],
  window: ['in'],
  timer: ['activity'],
  counter: ['plus', 'minus', 'reset'],
  // reward: the bandit's teacher. In 'pick' mode a signal on reward makes the LAST picked
  // face heavier, so it comes up more — a child clapping after the trick they liked is
  // reinforcement learning, for real, in one block (spec §6 "bandit pet").
  dice: ['in', 'reward'],
  lamp: ['on'],
  noisemaker: ['play'],
  // say: the SPEAKER's one control — the noisemaker's own shape (one in-port, no out-ports): a
  // signal asks it to speak, and what it speaks IS the signal, the same way `noisemaker:play`
  // turns a signal into a beep rather than listening for one back.
  speaker: ['say'],
  sign: ['show'],
  // The FRAME (composing-arc spec §7): a sink like sign — one in-port, no out-ports, no dials —
  // that keeps the LAST thing handed to it. Built for `sense:nearest`, but any signal can feed it
  // (a Sign shows the current reading; a Frame shows the example that produced it).
  frame: ['show'],
  teach: ['fileIt'],
  cloud: ['ask'],
  send: ['send'],
  // snap: how ANOTHER block (a Button, a Timer) asks the camera for a REAL picture. The
  // engine proposes a 'snap' effect; the host performs the read (R4, connection-law spec) —
  // the frame still enters as an external, so the engine stays pure.
  camera: ['snap'],
  // listen: how ANOTHER block (a Button, a Timer) asks the microphone for a REAL recording — the
  // camera's `snap` shape, for ears instead of eyes. The engine proposes a 'listen' event; the
  // host performs the capture (R5, connection-law spec) — whatever it heard re-enters as an
  // external on `heard`, so the engine stays pure and never invents state for a listen mid-flight.
  microphone: ['listen'],
  // The CAR MAKER (car-galleries, Tasks 4/7): an item SOURCE with a signal control. `go` is its
  // only in-port — one delivered `go` makes exactly ONE crate on the block's own `to` track
  // (C9: go-gated only, never per-tick, never free-running). Its item-out is deliberately NOT a
  // signal port: it is the block's `to`, resolved by the host from ITEM_OUT.carmaker ('out'),
  // exactly like a feeder's. So there is no OUT_PORTS entry for this type — nothing would ever
  // emit on it, and an inert out-port is a dead control.
  carmaker: ['go'],
  // The BOARD (Plan 3, spec §3/§10): one in-port, fed by a checker's `error`. It has no
  // out-ports and no dials — it is a RECORD, not a machine part; everything it knows came
  // down this one wire.
  board: ['watch'],
};
const DIALS = {
  feeder: ['rate'],
  track: ['speed'],
  // sure = the sure line (cosine floor): below it the sense says NOTHING.
  // penalty = the LEARNER's own dial (0..1). Only brains that declare it read it (the line brain's
  // ridge λ); every other brain ignores the field. It lives here, in the port table, because dials
  // are ports (contract §2) — a machine can wire a signal at its own model's simplicity.
  // degree = the curve dial (owner "yesss", Task C): 1..3, only the line brain reads it (a
  // polynomial degree on its OWN raw-vector expansion). Same idiom as penalty: it lives here
  // because dials are ports (contract §2), and every OTHER brain simply ignores the field.
  sense: ['k', 'sure', 'penalty', 'degree'],
  // tolerance = "counts as right ±{n}" (task 4, spec §7.3): overrides the crate's own tolerance
  // stamp (d.tolerance, from the dataset's answer.tolerance) when finite — see swallowChecked.
  // A hidden number deciding verdicts is exactly the channel the connection law kills; this makes
  // it a plate dial, wireable like any other (dials are ports, contract §2).
  checker: ['tolerance'],
  filter: ['n'],
  calculate: ['n'], join: ['seconds'],
  window: ['n'], // how many signals it remembers
  timer: ['seconds'],
  counter: ['n'],
  dice: ['n'],
  // Dials speak HUMAN units (owner 2026-08-17: node coherency): the lamp holds its light
  // for `seconds`, like the timer — never engine ticks. (Was `litTicks`; restore() migrates.)
  lamp: ['seconds'],
  noisemaker: ['pitch'],
  gate: ['q'],
  cloud: ['budget'],
  send: ['budget'],
  // every: seconds between auto-captures, 0 = only on snap — now a genuinely reachable mode
  // (R4): a wired snap poke proposes a real capture even with the clock off. The ENGINE never
  // reads this dial (no clock in logic/ — determinism law); it exists so the device layer
  // knows how often to inject a picture external. A knob the engine carries but does not act on.
  camera: ['every'],
  // rate = rows per MINUTE, the feeder's own items/min idiom (the camera's `every` seconds-idiom
  // reads wrong for a 48-row file). Default 120 — rows want ~2/s, watchable but not a dump.
  files: ['rate'],
  // The proportion, as two dials: test is always the remainder, so the three can never disagree
  // about summing to 100. Dials because dials are ports (contract §2) — a machine can wire a
  // signal at its own split.
  splitter: ['training', 'validation'],
  // The CAR MAKER's dials are SCHEMA-DRIVEN (car-galleries, Task 7): one per NUMERIC feature of
  // the dataset the host handed in (`dialSpec` = the `game.carmakerDials(schema)` output), plus the
  // always-present `target`. Only `target` is static — it exists for every schema — so it is the
  // ONE name this table can honestly declare; the feature names are declared by the PIECE SPEC and
  // validated per-run (see specDialIds, used by the wire check in createRun). Dials are ports
  // (contract §2): a wire may overwrite any of them, last write wins, like every other dial.
  carmaker: ['target'],
};
// Blocks with no ports at all still exist on the grid (track has only a dial).
const KNOWN_TYPES = [
  // pen: the waiting room (task B) — a fundamental, general-purpose piece any machine might
  // reach for, same standing as a gate or a bin, never a mode-specific add-on.
  'feeder', 'track', 'gate', 'pen', 'bin', 'checker',
  'sense', 'button',
  'filter', 'window', 'timer', 'counter', 'dice',
  'lamp', 'noisemaker', 'speaker', 'sign',
  'teach', 'cloud', 'send', 'camera', 'microphone', 'files', 'splitter',
  // board: Plan 3's record block (spec §3/§10) — a signal-plane sink like sign or lamp, never on
  // the item graph, so it needs none of the track-connectivity checks below.
  'board',
  // frame: the composing-arc's nearest-example sink (spec §7) — same standing as board, a
  // signal-plane sink off the item graph, needing none of the track-connectivity checks below.
  'frame',
  // carmaker: the car-galleries' item SOURCE (Task 7) — a feeder's item-out shape (`to`) with a
  // `go` signal control instead of a rate dial. It sits ON the item graph, so createRun gives it
  // the same feed-forward connectivity check a feeder/pen gets.
  'carmaker',
  'calculate', 'join', 'memory',
];

// Stateless signal-plane blocks evaluated INLINE during DELIVER (contract §4 phase 3).
// Handled INLINE while a signal propagates (they transform the signal and hand it on) rather
// than queued as an action. `window` keeps state, exactly as `dice` in pick mode does — the name
// means "inline", not "pure".
const STATELESS = { filter: true, dice: true, window: true };

const LAMP_MIN_LIT = 4;       // ticks (≈400 ms) — flash-safe by construction (contract §5)
const SOUND_MIN_GAP = 5;      // ticks between plays per noisemaker (≤2/s at TICK_HZ=10)
// A speaker's gap is LONGER than a noisemaker's: a beep can overlap the next beep and still read
// as two sounds, but two overlapping sentences read as noise — a machine talking over itself
// teaches nothing (see the `speaker:say` ACT case). 10 ticks = 1 s at TICK_HZ=10, about as fast as
// a short phrase is worth interrupting.
const SPEAK_MIN_GAP = 10;     // ticks between says per speaker (≤1/s at TICK_HZ=10)
const GRABBER_DEFAULT_Q = 3;  // quiet-hold ticks before a grabber lets go
// One held Pen crate dealt out every 5 ticks after release — a trickle, not a dump (was
// SPLIT_DEAL_TICKS on the dying Split gate; task B moves the deal loop verbatim onto the Pen,
// the only block a held pile belongs to now).
const PEN_DEAL_TICKS = 5;
// One released Splitter row every 5 ticks — the Pen's trickle, for the Pen's reason.
const SPLIT_DEAL_TICKS = 5;
// The pile names the machine SPEAKS (spec §15). The host shows the same words; these are what
// ride on `done`, so a wired Display says "Training" rather than an internal key.
const PILE_NAME = { training: 'Training', validation: 'Validation', test: 'Test' };
// The three piles in pileFor's own tie-break order — also the only piles a fixed split may name.
const PILE_ORDER = ['training', 'validation', 'test'];
// The grading tolerance a Car Maker bakes into a crate when its schema names none (NIT 6). The
// cars answer carries its own `tolerance: 4`, but a hand-authored schema may omit it; named so
// the fallback the crate wears and the number the Evaluator grades with cannot drift.
const DEFAULT_TOLERANCE = 4;

function fail(msg) {
  throw new Error('[engine] ' + msg);
}

/**
 * The dial DEFINITIONS a Car Maker's piece spec declares (car-galleries, Task 7). The host compiles
 * `game.carmakerDials(schema)` into the spec as `dialSpec` — `{dials, ignored}` (or a bare dials
 * array) — because dial names are schema-driven and the engine must never reach for the library or
 * the catalogue itself (purity law). When `dialSpec` is absent we fall back to the schema's own
 * numeric features + `target`, so a hand-built machine still runs; each def is `{id,label,def}` and
 * `label` is what the crate face prints, so it must agree with the schema's own feature name
 * (`carmakerDials` uses `f.name || f.id`, mirrored here). CROSS-REFERENCE (NIT 7): the schema-only
 * fallback is PINNED equal (id/label/def) to the host's `game.carmakerDials` for the cars schema
 * by tests/car-maker-crate-contract.test.js — change either derivation, change that test.
 * @param {object} b  a Car Maker block spec (its `schema` object SHOULD be present)
 * @returns {Array<{id:string,label:string,def:number}>}
 */
function carmakerDialDefs(b) {
  const spec = b.dialSpec;
  const dials = Array.isArray(spec) ? spec : (spec && Array.isArray(spec.dials) ? spec.dials : null);
  if (dials) return dials;
  const schema = b.schema || {};
  const defs = (schema.features || [])
    .filter((f) => !f.options)
    .map((f) => ({ id: f.id, label: f.name || f.id, def: Math.round((Number(f.min) + Number(f.max)) / 2) }));
  defs.push({ id: 'target', label: (schema.answer && schema.answer.name) || 'target', def: 30 });
  return defs;
}

/**
 * The dial NAMES a block carries beyond its static DIALS row — today only the Car Maker, whose
 * feature dials are schema-driven. Used by the wire check so a wire into `dial:power` is validated
 * against the spec the host actually supplied, not the static table alone.
 * @param {object} b  a block spec from the layout
 * @returns {string[]} the spec-declared dial ids (empty for every other block type)
 */
function specDialIds(b) {
  return (b && b.type === 'carmaker') ? carmakerDialDefs(b).map((d) => d.id) : [];
}

/**
 * Which pile does the next row belong to?
 *
 * Smooth apportionment: the row goes to whichever pile is furthest behind its share so far. Two
 * properties matter and both are deliberate:
 *   - it needs NO rng, so the split is reproducible without touching the seed; and
 *   - it INTERLEAVES. "First 60%, next 20%, last 20%" would hand a file sorted by date a whole
 *     season of Test rows, which is the leakage lesson arriving by accident instead of by design.
 * Ties break in the fixed order training > validation > test, so the answer is total.
 *
 * @param {number} taken  how many rows have already been assigned
 * @param {{training:number, validation:number, test:number}} dealt  how many landed in each pile
 * @param {{training:number, validation:number, test:number}} weights  percentages, summing to 100
 * @returns {'training'|'validation'|'test'}
 */
function pileFor(taken, dealt, weights) {
  const order = ['training', 'validation', 'test'];
  let best = 'training';
  let bestScore = -Infinity;
  for (const p of order) {
    const score = ((weights[p] || 0) / 100) * (taken + 1) - (dealt[p] || 0);
    if (score > bestScore + 1e-9) { bestScore = score; best = p; }
  }
  return best;
}

/**
 * An act is QUEUED, not latched: one pass deals at a time, in press order. A press identical to
 * the newest waiting act is dropped — a Timer wired to `teach` must not build an unbounded
 * backlog of the same lesson — but a DIFFERENT act always queues, so no deliberate press is ever
 * silently lost (the dead-controls law: a press that does nothing and says nothing is a lie).
 *
 * …and a DROPPED press says so (whole-branch review M8). "The act you just pressed is already
 * running" is a fact the child needs — pressing Teach it twice at the same moment used to be
 * byte-identical silence, which is the same shape of lie one layer up from the COMPLETED case
 * (act.learnNothing) that already speaks. The caller turns the returned false into one line.
 * @param {object} s  the splitter's run state
 * @param {'training'|'validation'|'test'} pile
 * @param {'learn'|'answer'} mode
 * @returns {boolean} true when the press queued, false when it repeated the act in flight / at
 *                    the queue's tail and was dropped
 */
function queuePass(s, pile, mode) {
  const tail = s.passQueue.length ? s.passQueue[s.passQueue.length - 1]
    : (s.pass ? { pile: s.pass.pile, mode: s.pass.mode } : null);
  if (tail && tail.pile === pile && tail.mode === mode) return false;
  s.passQueue.push({ pile, mode });
  return true;
}

// ---------------------------------------------------------------------------
// createRun — validate the layout LOUDLY, build indexes, init per-block state.
// ---------------------------------------------------------------------------
/**
 * @param {object} layout  { blocks: [...], wires: [{from:{block,port}, to:{block,port}}] }
 * @param {object} opts    { seed: number (required), senses: {senseId: (data,{k})=>{label,value}} }
 *   captureTerminals:true opts into local batch evidence on emit/swallow/drop and flow-finished.
 *   Captured outcomes may contain private answers; callers must keep them in the session scope.
 * @returns run — thread it forward through tick(); mutated in place (house sim pattern).
 */
function createRun(layout, opts) {
  if (!layout || !Array.isArray(layout.blocks)) fail('layout.blocks must be an array');
  const wires = layout.wires || [];
  if (!opts || typeof opts.seed !== 'number') fail('opts.seed (number) is required — determinism law');
  const senses = opts.senses || {};

  // Index blocks; ids unique; types known.
  const byId = {};
  const gateExits = {}; // sorter gates: resolved exit target list (index 0 = the default way)
  for (const b of layout.blocks) {
    if (!b.id) fail('every block needs an id');
    if (String(b.id).includes(':')) fail(`block id "${b.id}" may not contain ":" (reserved as the port separator)`);
    if (byId[b.id]) fail(`duplicate block id "${b.id}"`);
    if (!KNOWN_TYPES.includes(b.type)) fail(`unknown block type "${b.type}" on "${b.id}"`);
    byId[b.id] = b;
  }
  const blockOrder = layout.blocks.map((b) => b.id); // stable order = layout order (contract §4)

  // Item-plane connectivity checks — a track must lead somewhere real.
  const mustLead = (id, field, target) => {
    if (!target) fail(`"${id}" needs ${field}`);
    const t = byId[target];
    if (!t) fail(`"${id}".${field} points at unknown block "${target}"`);
    if (!['track', 'gate', 'bin', 'checker', 'pen'].includes(t.type)) fail(`"${id}".${field} must lead to a track, gate, bin, checker, or pen (got ${t.type})`);
  };
  for (const b of layout.blocks) {
    if (Composition.TYPES.includes(b.type)) Composition.validate(b);
    if (b.type === 'feeder') {
      if (!Array.isArray(b.contents)) fail(`feeder "${b.id}" needs contents (array of items)`);
      if (!byId[b.to] || byId[b.to].type !== 'track') fail(`feeder "${b.id}".to must be a track`);
    }
    if (b.type === 'track') {
      if (!Number.isInteger(b.length) || b.length < 1) fail(`track "${b.id}" needs integer length ≥ 1`);
      mustLead(b.id, 'to', b.to);
    }
    // The PEN (task B): a waiting room, one way in, one way out — the item-plane shape of a
    // track or a feeder, not a gate (it never chooses between ways). `to` is its one exit.
    if (b.type === 'pen') mustLead(b.id, 'to', b.to);
    // The CAR MAKER (car-galleries, Tasks 4/7): an item source like a feeder — its one item-out
    // (`to`) must lead somewhere real. Two sources naming the SAME track is allowed and required
    // (C6): the check is per-block, so a shared belt is never refused here.
    if (b.type === 'carmaker') mustLead(b.id, 'to', b.to);
    if (b.type === 'gate') {
      const mode = b.mode || 'sorter';
      if (!['sorter', 'trapdoor', 'grabber', 'latch'].includes(mode)) fail(`gate "${b.id}" mode must be sorter|trapdoor|grabber|latch`);
      if (mode === 'sorter' && b.decisionMode !== undefined && !['next', 'item'].includes(b.decisionMode)) fail(`gate "${b.id}" decisionMode must be next|item`);
      if (mode === 'sorter' || mode === 'latch') {
        // Dynamic exits (owner 2026-08-16), shared by sorter AND latch (task B — the owner's
        // general-purpose ruling: a latch is a sorter with a persistent arm, not a bespoke
        // shape of its own). Legacy straightTo/turnTo = exits[0]/exits[1].
        const exits = b.exits || [b.straightTo, b.turnTo].filter((x) => x !== undefined);
        if (exits.length < 2) fail(`gate "${b.id}" (${mode}) needs at least 2 exits`);
        if (exits.length > 6) fail(`gate "${b.id}" has ${exits.length} exits — 6 is the most a gate can hold`);
        exits.forEach((e, i) => mustLead(b.id, 'exit ' + (i + 1), e));
        gateExits[b.id] = exits;
        if (mode === 'sorter' && b.decisionMode === 'item') {
          if (b.fallbackExit !== undefined && (!Number.isInteger(b.fallbackExit) || b.fallbackExit < 1 || b.fallbackExit > exits.length)) fail(`gate "${b.id}" fallbackExit must name an exit`);
          if (b.decisionSeconds !== undefined && (!Number.isFinite(b.decisionSeconds) || b.decisionSeconds < .1 || b.decisionSeconds > 60)) fail(`gate "${b.id}" decisionSeconds must be 0.1..60`);
        }
      } else {
        // Trapdoor/grabber have ONE way out. Accept the legacy `straightTo` OR `exits[0]` —
        // the snap mapper emits `exits` for every gate, and demanding the legacy field here
        // meant a table-built trapdoor/grabber could never run (caught 2026-08-17 while
        // adding the bin why-log). gateExits[id][0] is now THE straight way for every gate.
        const straight = b.straightTo !== undefined ? b.straightTo : (b.exits || [])[0];
        mustLead(b.id, 'straightTo', straight);
        gateExits[b.id] = [straight];
      }
    }
    if (b.type === 'sense') {
      const mode = b.mode || 'room';
      if (!['spot', 'room'].includes(mode)) fail(`sense "${b.id}" mode must be spot|room`);
      if (mode === 'spot') {
        if (!b.spot || !byId[b.spot.track] || byId[b.spot.track].type !== 'track') fail(`sense "${b.id}" spot.track must name a track`);
        if (!Number.isInteger(b.spot.index) || b.spot.index < 0 || b.spot.index >= byId[b.spot.track].length) {
          fail(`sense "${b.id}" spot.index out of range for track "${b.spot.track}"`);
        }
        if (typeof senses[b.senseId] !== 'function') fail(`sense "${b.id}" mounts "${b.senseId}" but no such sense fn was provided`);
      }
    }
    if (b.type === 'teach') {
      if (!b.spot || !byId[b.spot.track] || byId[b.spot.track].type !== 'track') fail(`teach "${b.id}" spot.track must name a track`);
    }
    if (b.type === 'filter') {
      const mode = b.mode || 'any';
      if (!['is', 'isnot', 'any'].includes(mode)) fail(`filter "${b.id}" mode must be is|isnot|any`);
      if (mode !== 'any' && typeof b.label !== 'string') fail(`filter "${b.id}" (${mode}) needs a label`);
      if (b.test && !['gt', 'lt'].includes(b.test)) fail(`filter "${b.id}" test must be gt|lt`);
    }
    if (b.type === 'timer') {
      const mode = b.mode || 'every';
      if (!['every', 'quiet'].includes(mode)) fail(`timer "${b.id}" mode must be every|quiet`);
      if (!(b.seconds > 0)) fail(`timer "${b.id}" needs seconds > 0`);
    }
    // The FILES block: contents = row specs compiled by the host (game.js toTable — the SAME
    // shape a feeder's committed-table arm compiles, so downstream crates are indistinguishable).
    // An unfed block compiles to [] — always an array, loudly, like the feeder's own contents.
    if (b.type === 'files' && !Array.isArray(b.contents)) fail(`files "${b.id}" needs contents (array of row specs; [] when unfed)`);
  }

  // Validate every wire against the port tables — a wire to nowhere is a build error, not a runtime mystery.
  const portOk = (table, type, port) => (table[type] || []).includes(port);
  const outMap = {}; // "block:port" → [{block, port}]
  for (const w of wires) {
    const f = w.from, t = w.to;
    if (!f || !t || !byId[f.block] || !byId[t.block]) fail(`wire references unknown block: ${JSON.stringify(w)}`);
    if (!portOk(OUT_PORTS, byId[f.block].type, f.port)) fail(`"${f.block}" (${byId[f.block].type}) has no out-port "${f.port}"`);
    const isDial = t.port.startsWith('dial:');
    if (isDial) {
      const dial = t.port.slice(5);
      const tb = byId[t.block];
      // A schema-driven dial (the Car Maker's feature dials) is declared by the PIECE SPEC, not the
      // static table — see specDialIds. Every other dial validates against DIALS alone.
      if (!portOk(DIALS, tb.type, dial) && !specDialIds(tb).includes(dial)) fail(`"${t.block}" (${tb.type}) has no dial "${dial}"`);
    } else if (!portOk(IN_PORTS, byId[t.block].type, t.port)) {
      // Gate switch ports are dynamic: switch1..switchN, one per way. switch1 exists so the
      // card is regular (owner 2026-08-19); under last-wins arming it explicitly chooses way 1,
      // which is also where an item goes when nothing armed at all.
      const sw = byId[t.block].type === 'gate' && /^switch([1-6])$/.exec(t.port);
      const nExits = sw && (gateExits[t.block] || []).length;
      if (!sw) fail(`"${t.block}" (${byId[t.block].type}) has no in-port "${t.port}"`);
      if (Number(sw[1]) > nExits) fail(`"${t.block}" has ${nExits} exits — there is no ${t.port}`);
    }
    const key = f.block + ':' + f.port;
    (outMap[key] = outMap[key] || []).push({ block: t.block, port: t.port });
  }

  // Spot lookup tables: "track:index" → sense/teach block ids.
  const spotSenses = {};
  const spotTeach = {};
  for (const b of layout.blocks) {
    if (b.type === 'sense' && (b.mode || 'room') === 'spot') {
      const k = b.spot.track + ':' + b.spot.index;
      (spotSenses[k] = spotSenses[k] || []).push(b.id);
    }
    if (b.type === 'teach') {
      const k = b.spot.track + ':' + b.spot.index;
      (spotTeach[k] = spotTeach[k] || []).push(b.id);
    }
  }

  // Per-block state + dial defaults.
  let rngState = rng.seed(opts.seed);
  const blocks = {};
  for (const b of layout.blocks) {
    const s = { dials: {} };
    for (const d of DIALS[b.type] || []) {
      if (b[d] !== undefined) s.dials[d] = b[d];
    }
    if (b.type === 'feeder') {
      if (s.dials.rate === undefined) s.dials.rate = 12;
      // Seeded-shuffle cycle through contents (contract §4 MOVE): order fixed at createRun.
      const idx = b.contents.map((_, i) => i);
      const [order, st] = rng.shuffle(idx, rngState);
      rngState = st;
      s.order = order;
      s.cursor = 0;
      s.lastEmit = -Infinity;
      s.dropQueue = []; // signals that became items last ACT — emitted next tick (feedback law)
      s.doneSent = false; // once-mode: `done` fires exactly once (contract-shaped, like fireAtN)
    }
    if (b.type === 'track' && s.dials.speed === undefined) s.dials.speed = 5; // cells/s (2 ticks a cell)
    if (b.type === 'gate') {
      s.armedExit = null;       // sorter: ONE arm slot — the last switch signal names the exit
      if ((b.mode || 'sorter') === 'sorter' && b.decisionMode === 'item') {
        s.decisions = Object.create(null);
        s.routingReview = null; // last bounded review outcome, also emitted for host/result collectors
      }
      s.armed = false;          // trapdoor: consumed by the next item
      s.armedUntil = -1;        // grabber: held while run.tick ≤ armedUntil
      if (s.dials.q === undefined) s.dials.q = GRABBER_DEFAULT_Q;
      // latch (task B): the ONE persistent default-exit slot. Unlike sorter's armedExit, a
      // latch signal is never consumed — it stays the default until another signal overwrites
      // it. null = never thrown yet (falls out exit 1, the honest "untouched" state).
      if ((b.mode || 'sorter') === 'latch') s.exit = null;
    }
    // The PEN (task B): held is the visible pile (item ids, oldest first); open latches true
    // the instant release fires and never resets itself mid-run — only a fresh createRun closes
    // it again. lastDeal paces the trickle exactly as the old Split gate's own deal loop did.
    if (b.type === 'pen') { s.held = []; s.open = false; s.lastDeal = 0; }
    if (b.type === 'splitter') {
      if (s.dials.training === undefined) s.dials.training = Number.isFinite(b.training) ? b.training : 60;
      if (s.dials.validation === undefined) s.dials.validation = Number.isFinite(b.validation) ? b.validation : 20;
      // Three piles, each a PERMANENT deck (Plan 2, the acts): an act deals COPIES of a pile's
      // rows down `row` — the deck itself never shrinks, so "Test what it studied" can deal the
      // same rows again. `dealt` is what each pile was GIVEN by the apportionment; `taught` is
      // the high-water of rows a LEARN pass has covered, so pressing Teach twice never files the
      // same row into the shelves twice; `pass`/`passQueue` are the acts — one at a time, in
      // press order.
      s.piles = { training: [], validation: [], test: [] };
      s.dealt = { training: 0, validation: 0, test: 0 };
      s.taught = { training: 0, validation: 0, test: 0 };
      s.pass = null;
      s.passQueue = [];
      s.taken = 0;
      s.lastDeal = -Infinity;
    }
    if (b.type === 'bin') { s.count = 0; s.log = []; }
    // `unread` (Plan 2 fix round): crates an ANSWER act dealt that no model ever read — see
    // swallowChecked. Kept apart from `unsure` (a model that looked and doubted) and out of the
    // log entirely, so a lane's count and its percentage can never disagree.
    // `answered` (whole-branch review CRITICAL 1): the newest act SEQ this Evaluator has logged a
    // scored row for, per pile — how it tells the current attempt's crates from a superseded
    // attempt's. Empty until an act-driven crate lands, so a machine with no Splitter never meets
    // this rule at all.
    // `unscorable` (task 108 / P4): crates the Evaluator OPENED and the Model answered about, that
    // carry NO reference answer to grade the answer against. Kept apart from every other count —
    // missing truth is not a failure, and it is not a silence either.
    if (b.type === 'checker') { s.count = 0; s.log = []; s.right = 0; s.wrong = 0; s.unsure = 0; s.unscorable = 0; s.filed = 0; s.unread = 0; s.answered = {}; }
    // The Board files every scored answer-act crate under the act it rode (data.pass.seq) —
    // acts[seq] = { pile, x, n, sum }. Cross-RUN memory is NOT here: it lives on the piece
    // (p.charts, host-committed at Stop) — the one bounded exception to "Run is a fresh
    // experiment" (spec §4/§11), stated where both halves can see it.
    // `heard` (fix round 2): every signal that reached `watch` but carried no usable pass — a
    // relay's own re-emission, always. See the `board:watch` ACT case for the full WHY.
    if (b.type === 'board') { s.acts = {}; s.heard = 0; }
    if (b.type === 'sense' && s.dials.k === undefined) s.dials.k = 3;
    if (b.type === 'sense' && s.dials.penalty === undefined) s.dials.penalty = 0; // no penalty unless asked
    if (b.type === 'window') {
      s.win = [];                                   // the remembered values, oldest first
      if (s.dials.n === undefined) s.dials.n = 5;
    }
    if (b.type === 'timer') { s.lastFire = 0; s.lastActivity = 0; }
    if (b.type === 'camera') {
      if (s.dials.every === undefined) s.dials.every = 0; // 0 = only on snap
    }
    if (b.type === 'files') {
      if (s.dials.rate === undefined) s.dials.rate = 120; // rows/min — ~2/s, watchable
      // The feeder's own deal idioms, minus the shuffle: cursor walks contents 0..n-1 in FILE
      // order (deliberately NO rng — a child's own file deals as written), doneSent latches the
      // one-shot `done`. No dropQueue: this block never receives items, it only speaks.
      s.cursor = 0;
      s.lastEmit = -Infinity;
      s.doneSent = false;
    }
    // The CAR MAKER (car-galleries, Task 7): an item SOURCE driven by LIVE dials, so the host
    // compiles the dataset's schema (the crate's `data.dataset`) AND the generated dial spec into
    // the piece spec. One dial is seeded per spec entry — the piece's own same-named value when
    // present (dials-as-fields, the splitter's idiom), else the spec default. A Car Maker with no
    // schema is a BUILD error, not a silently dead machine: Task 6 proved an absent `data.dataset`
    // yields a null vector (a machine that runs and reads nothing), which the loud fail prevents.
    if (b.type === 'carmaker') {
      if (!b.schema || typeof b.schema !== 'object') fail(`carmaker "${b.id}" needs a schema object in its piece spec — the host resolves Library.schema(id) and passes it in`);
      for (const d of carmakerDialDefs(b)) {
        s.dials[d.id] = Number.isFinite(b[d.id]) ? b[d.id] : d.def;
      }
    }
    if (b.type === 'counter') {
      s.count = 0;
      s.firedSinceReset = false; // contract §9.4 — re-fires only after reset; AND stays honest
      s.fireAtN = false;
      s.valueDirty = false;
      if (s.dials.n === undefined) s.dials.n = 1;
    }
    if (Composition.TYPES.includes(b.type)) s.composition = Composition.create(b);
    if (b.type === 'dice') {
      if (s.dials.n === undefined) s.dials.n = 2;
      // Bandit state ('pick' mode): one weight per face, all equal at birth; the last face
      // picked is what a reward reinforces. Weights live in the RUN (a fresh run forgets) —
      // learning is a pure function of (seed, rewards), so a replay re-learns identically.
      s.weights = new Array(Math.max(1, Math.round(s.dials.n))).fill(1);
      s.lastPick = -1;
    }
    if (b.type === 'filter' && s.dials.n === undefined) s.dials.n = 0;
    // clampDial on the way IN, not just on a wire write: it is the only call site that knew the
    // flash-safety floor, and a HAND-SET dial never passed through it (clampDial had exactly one
    // caller, the wire write). So a child typing 0.1 in the plate stored 0.1 while the lamp lit for
    // 0.4 s. Routing the default through the same clamp keeps one owner of the legal range.
    if (b.type === 'lamp') {
      s.litUntil = -1;
      s.dials.seconds = clampDial('lamp', 'seconds', s.dials.seconds === undefined ? 0.5 : s.dials.seconds);
    }
    if (b.type === 'noisemaker') { s.lastPlay = -Infinity; if (s.dials.pitch === undefined) s.dials.pitch = 60; }
    // The speaker's own run state: `lastPlay` is the noisemaker's own field name, reused
    // deliberately — same idiom (a min-gap guard against a machine talking over itself),
    // greppable together. `lastSaid` is what a host/debugger reads back to know what the machine
    // last spoke; no microphone counterpart exists (R5 — listening state is the host's job, not
    // the engine's, so `microphone` gets NO block here at all).
    if (b.type === 'speaker') { s.lastPlay = -Infinity; s.lastSaid = null; }
    if (b.type === 'sign') s.shown = null;
    // The Frame's face is RUN state, not saved-piece state (fresh-experiment law, spec §4/§11):
    // a new run remembers nothing, exactly like every other block's shown/count/log fields here —
    // there is no cross-run memory to seed it from, unlike the Board's acts (host-committed at Stop).
    if (b.type === 'frame') s.shown = null;
    if (b.type === 'cloud' && s.dials.budget === undefined) s.dials.budget = 10;
    if (b.type === 'send' && s.dials.budget === undefined) s.dials.budget = 10;
    blocks[b.id] = s;
  }

  return {
    tick: 0,
    captureTerminals: opts.captureTerminals === true,
    rngState,
    byId, blockOrder, outMap, spotSenses, spotTeach, senses, gateExits,
    blocks,
    items: [],       // { id, data, label, value, lastReading, lastReadBy, via, trail, at:{kind:'track',track,index}|{kind:'gate',gate}, ticksInCell, entered }
    nextItemId: 1,
    nextFlowId: 1,
    // EVERY ACT IN THE RUN GETS A NUMBER, in the order the acts start (whole-branch review
    // CRITICAL 1). It rides out on each dealt row inside `data.pass.seq`, and the Evaluator uses
    // it to tell THIS attempt's crates from a superseded attempt's — see swallowChecked. Run-wide
    // rather than per-splitter so two Splitters feeding one Evaluator still order against each
    // other; monotonic, so "newer" is a comparison and not a guess.
    nextPassSeq: 1,
  };
}

// ---------------------------------------------------------------------------
// tick — one pass through MOVE → EMIT → DELIVER → ACT.
// ---------------------------------------------------------------------------
/**
 * @param {object} run  from createRun (mutated + returned results)
 * @param {Array}  externalSignals  [{block, port, label, value}] — port must be an OUT-port
 *                 of that block (button.pressed, sense.reading, cloud.answer). Contract §6.
 * @returns {{events: Array, effects: Array}} render events + PROPOSED world effects.
 */
function tick(run, externalSignals) {
  const externals = externalSignals || [];
  run.tick += 1;
  const events = [];
  const effects = [];
  const queued = [];  // signals waiting for DELIVER: {from:'block:port', label, value}
  const actions = []; // stateful deliveries waiting for ACT: {block, port, signal}
  const previouslyLive = run.captureTerminals ? activeFlows(run) : null;
  // Expiry runs BEFORE MOVE: an arriving item cannot consume a decision after its deadline.
  for (const id of run.blockOrder) {
    const s = run.blocks[id];
    if (!s.decisions) continue;
    for (const [flowId, decision] of Object.entries(s.decisions)) if (run.tick >= decision.expires) {
      delete s.decisions[flowId];
      routingReview(run, id, flowId, 'expired', events);
    }
  }

  const dial = (id, name) => run.blocks[id].dials[name];
  // New composition outputs obey ACT -> next EMIT, including feedback loops.
  for (const id of run.blockOrder) {
    const b=run.byId[id], s=run.blocks[id];
    if (!s.composition) continue;
    for (const out of Composition.emit(s.composition,b,run.tick,s.dials)) queued.push({...out,from:id+':'+out.port});
  }

  // ----- MOVE ---------------------------------------------------------------
  // 1) grabbers whose hold expired let go (before advancing, so the freed item moves next tick).
  for (const item of run.items.slice()) {
    if (item.at.kind === 'gate') {
      // Only a GRABBER ever parks an item at kind:'gate' (a Pen's held pile lives at its own
      // kind:'pen', released by its OWN paced deal phase below, section 2b — never this timer).
      // The mode check stays as the honest guard either way: nothing else sets this kind.
      if ((run.byId[item.at.gate].mode || 'sorter') !== 'grabber') continue;
      const gs = run.blocks[item.at.gate];
      if (run.tick > gs.armedUntil) {
        item.via = { gate: item.at.gate, exit: 1, armed: false, held: true }; // why-trail: held, then let go
        item.trail.push({ block: item.at.gate, type: 'gate', tick: run.tick, exit: 1, armed: false, held: true });
        enterTarget(run, item, run.gateExits[item.at.gate][0], events, queued);
        if (item.at.kind === 'track') item.justPlaced = true; // placed THIS tick — don't also advance it below
      }
    }
  }
  // 2) feeders emit on their dialled interval (seeded contents order fixed at createRun).
  for (const id of run.blockOrder) {
    const b = run.byId[id];
    if (b.type !== 'feeder') continue;
    const s = run.blocks[id];
    // Dropped-in items first — signals that hit the drop port last ACT (one cycle per
    // tick, contract §4). A drop ignores the rate dial: a shown object enters NOW.
    while (s.dropQueue.length) {
      const d = s.dropQueue.shift();
      const carried = d.data && d.data.context;
      const item = {
        id: run.nextItemId++,
        flowId: carried && carried.id || d.flowId || 'flow:' + run.nextFlowId++,
        // A dropped signal MAY carry a payload (a camera's picture + its vector, spec 2026-08-19
        // §4). Without one, the label is the tag — exactly as before.
        // Legacy row schemas retain their identity; composed items isolate mutable branch data.
        data: d.data ? (carried ? JSON.parse(JSON.stringify(d.data)) : d.data) : { tag: d.label },
        label: carried && carried.truth ? carried.truth.label : d.label,
        value: carried && carried.truth ? carried.truth.value : d.value,
        lastReading: null,
        trail: [],        // every block that touches this crate, oldest first (spec §3)
        at: { kind: 'track', track: b.to, index: 0 },
        ticksInCell: 0,
        entered: true,
        justPlaced: true,
      };
      run.items.push(item);
      events.push(emissionEvent(run, id, item));
      queued.push({ from: id + ':emitted', label: d.label, value: d.value });
    }
    const rate = Math.max(1, dial(id, 'rate'));
    const interval = Math.max(1, Math.round((60 * TICK_HZ) / rate));
    if (b.contents.length === 0) continue;
    // `once`: deal every crate ONE time, then stop (a dataset is a table, not a loop — the Tally
    // must count each row once). Without it the feeder cycles forever (the sorter's belt).
    if (b.once && s.cursor >= s.order.length) {
      // The deck is dealt: say so ONCE, the tick right after the last crate left — never in loop
      // mode (this branch only runs when `b.once` is true). value = how many it dealt, so a
      // downstream Sign/Tally can say the count without a second source of truth.
      if (!s.doneSent) {
        s.doneSent = true;
        queued.push({ from: id + ':done', label: b.name || id, value: s.cursor });
      }
      continue;
    }
    if (run.tick - s.lastEmit < interval) continue;
    s.lastEmit = run.tick;
    const src = b.contents[s.order[s.cursor % s.order.length]];
    s.cursor += 1;
    const item = {
      id: run.nextItemId++,
      flowId: 'flow:' + run.nextFlowId++,
      data: src.data,
      label: src.label,
      value: src.value,
      lastReading: null,
      trail: [],        // every block that touches this crate, oldest first (spec §3)
      at: { kind: 'track', track: b.to, index: 0 },
      ticksInCell: 0,
      entered: true,    // entering index 0 counts as entering — spot senses there see it
      justPlaced: true, // placed in THIS tick's MOVE — the advance loop must skip it once
    };
    run.items.push(item);
    if (run.captureTerminals) events.push(sourceEvent(run, id, s.order[(s.cursor - 1) % s.order.length], item, true));
    events.push(emissionEvent(run, id, item));
    // Feed signal (contract §5): label = the item's label if known, value = its number, else 1.
    queued.push({ from: id + ':emitted', label: src.label !== undefined ? src.label : (b.name || id), value: src.value !== undefined ? src.value : 1 });
  }
  // 2b) Pens deal their held pile out at a steady pace once opened — a visible trickle
  // (PEN_DEAL_TICKS apart), never a dam-burst, and never before p:release fires. Moved
  // verbatim from the Split gate's own deal loop (task B) — a Pen is the only block a held
  // pile belongs to now.
  for (const id of run.blockOrder) {
    const b = run.byId[id];
    if (b.type !== 'pen') continue;
    const s = run.blocks[id];
    if (!s.open || s.held.length === 0) continue;
    if (run.tick - s.lastDeal < PEN_DEAL_TICKS) continue;
    const itemId = s.held.shift();
    const item = run.items.find((it) => it.id === itemId);
    s.lastDeal = run.tick;
    if (!item) fail(`pen "${id}" held item ${itemId} that no longer exists — engine invariant broken`);
    enterTarget(run, item, b.to, events, queued);
    // Mirrors the grabber-release guard above: entering a track HERE, before section 3 below
    // runs this same tick, would otherwise get double-advanced.
    if (item.at.kind === 'track') item.justPlaced = true;
  }
  // 2c) SPLITTER — the ACTS (spec §6). A pass deals COPIES of one pile's rows out of `row`, one
  // every SPLIT_DEAL_TICKS — the Pen's trickle, for the Pen's reason — and the deck itself never
  // shrinks: "Test what it studied" must be able to deal the same rows again. Each dealt row
  // wears the pass it rode out on ({pile, mode}), so the blocks downstream obey the ACT the
  // child pressed rather than a per-spot checkbox — and the authority travels down the wires
  // that exist (row → drop → belt), never by a reach across the room (spec §7 + the
  // connection law; the "no role on the crate" clause rejects per-row roles inside a MIXED
  // pass, and a pass is uniformly one mode by construction here).
  for (const id of run.blockOrder) {
    const b = run.byId[id];
    if (b.type !== 'splitter') continue;
    const s = run.blocks[id];
    if (!s.pass && s.passQueue.length) {
      const next = s.passQueue.shift();
      // A learn pass starts at the taught high-water (a row is studied ONCE); an answer pass
      // always starts at 0 (a test covers the whole pile, studied rows included).
      s.pass = { pile: next.pile, mode: next.mode, cursor: next.mode === 'learn' ? s.taught[next.pile] : 0, seq: run.nextPassSeq++ };
      // THE ACT, ANNOUNCED (Plan 2 fix round; vision-breaker finding 7). `done` alone could never
      // narrate the machine: it fires at the END, carries a count and no mode a host can read
      // without unpicking the wire it rode. These two events are the act itself — start and end,
      // with the pile, the mode and how far it got — so the one line of prose on the screen can
      // say which act is running instead of fossilising the last teach effect. `from` is the
      // cursor it started at, so `dealt` below is what THIS act moved (a learn pass starts at the
      // taught high-water; a re-press deals zero, which is the fact finding 6 needs said).
      s.pass.from = s.pass.cursor;
      events.push({ t: 'act-start', block: id, pile: s.pass.pile, mode: s.pass.mode, seq: s.pass.seq, deck: s.piles[s.pass.pile].length });
    }
    if (!s.pass) continue;
    const pile = s.pass.pile;
    const deck = s.piles[pile];
    if (s.pass.cursor >= deck.length) {
      // Caught up — the act is COMPLETE. Rows that arrive after this moment sit in the deck
      // (the face counts them) until the next act. `done` fires ONCE per act, when the act
      // actually ends, carrying how far through the pile it got — the open-latch model's
      // early-press lie (done at tick 3 with twelve rows still to come) cannot come back,
      // because a pass has an end and this is it.
      if (s.pass.mode === 'learn') s.taught[pile] = Math.max(s.taught[pile], s.pass.cursor);
      queued.push({ from: id + ':done', label: PILE_NAME[pile], value: s.pass.cursor, data: { pile, mode: s.pass.mode } });
      events.push({ t: 'act-end', block: id, pile, mode: s.pass.mode, seq: s.pass.seq, dealt: s.pass.cursor - (s.pass.from || 0), covered: s.pass.cursor, deck: deck.length, taken: s.taken });
      s.pass = null;
      continue;
    }
    if (run.tick - s.lastDeal < SPLIT_DEAL_TICKS) continue;
    s.lastDeal = run.tick;
    const r = deck[s.pass.cursor];
    s.pass.cursor += 1;
    // A COPY of the row's data, wearing the pass — the deck's own object is never stamped, so
    // dealing a pile twice cannot leak one act's marks into the next.
    queued.push({ from: id + ':row', label: r.label, value: r.value, flowId:'flow:'+run.nextFlowId++, data: Object.assign({}, r.data || {}, { pass: { pile, mode: s.pass.mode, seq: s.pass.seq } }) });
  }
  // 3) items advance (stable creation order). entered is re-derived each tick.
  for (const item of run.items.slice()) {
    if (item.at.kind !== 'track') continue;
    if (item.ticksInCell === 0 && item.entered && item.justPlaced) { item.justPlaced = false; continue; } // emitted THIS tick: sits at index 0
    item.entered = false;
    item.ticksInCell += 1;
    const track = run.byId[item.at.track];
    // speed is CELLS PER SECOND (owner 2026-08-18: the dial must read forwards — a bigger number
    // is a faster belt). 10 = a cell every tick; 1 = a cell a second. Converted here, once.
    if (item.ticksInCell < ticksPerCell(dial(track.id, 'speed'))) continue;
    item.ticksInCell = 0;
    item.at.index += 1;
    item.entered = true;
    if (item.at.index >= track.length) exitTrack(run, item, track, events, queued);
  }

  // ----- EMIT ---------------------------------------------------------------
  // Spot senses read items that ENTERED their spot this tick (once per item per spot).
  for (const item of run.items) {
    if (item.at.kind !== 'track' || !item.entered) continue;
    const senseIds = run.spotSenses[item.at.track + ':' + item.at.index] || [];
    for (const sid of senseIds) {
      const b = run.byId[sid];
      // A FILE SPOT (task B, owner-ordered rework 2026-08-28): `b.files === true` on the SENSE
      // itself — not a mark riding the crate — says "this spot files instead of guessing". The
      // crate is filed, not guessed (spec v2 §6, generalised: no gate anywhere decides what gets
      // studied any more; the ROUTE a machine wires a crate down does, and a filing spot can sit
      // on ANY belt, placed by hand). The effect reuses the teach contract verbatim; the shelf is
      // the crate's own label (self-naming, the same rule Teach's blank shelf follows). Stamp
      // rides a COPY — data is shared with the feeder's contents. A crate already studied falls
      // through to a normal guess even at a file spot (idempotent — the second-pass rule v2 always
      // had, now keyed on the SPOT's own flag instead of the crate's).
      const pass = item.data ? item.data.pass : null;
      // THE ACT DECIDES (spec §7, Plan 2): a crate wearing a learn pass files at the first Model
      // it meets (the studied-once guard below keeps a second Model from double-filing it); a
      // crate wearing an ANSWER pass is guessed even at a legacy file spot — that is exactly the
      // per-spot checkbox losing its authority to the act. Only a crate with NO pass at all (no
      // Splitter upstream — datalab, lastfew, a child's own machine) still obeys `b.files`.
      const filesHere = !b.libraryModel && (pass ? pass.mode === 'learn' : b.files === true);
      if (b.libraryModel && pass && pass.mode === 'learn' && item.data.studied !== true) {
        item.data.libraryTrainingRefused = true;
        effects.push({ type: 'libraryError', note: 'This is a saved model. Train a new version in the data and model library.' });
        continue;
      }
      if (filesHere && item.data && item.data.studied !== true) {
        item.data = Object.assign({}, item.data, { studied: true });
        effects.push({ type: 'teach', block: sid, shelf: item.label !== undefined ? String(item.label) : '', itemId: item.id, data: item.data });
        item.trail.push({ block: sid, type: 'sense', tick: run.tick, senseId: b.senseId, filed: true, spot: { track: item.at.track, index: item.at.index } });
        continue;
      }
      // opts carry the eye's dials AND its brain choice: which learner reads the shelves is
      // per-EYE config (two eyes, same shelves, different brains — the disagreement lesson).
      const reading = run.senses[b.senseId](item.data, { blockId: sid, learning: b.learning, k: dial(sid, 'k'), sure: dial(sid, 'sure'), penalty: dial(sid, 'penalty'), degree: dial(sid, 'degree'), brainId: b.brainId, libraryModel: b.libraryModel });
      // Opt-in rich output. Legacy reading/unsure payloads retain their exact behavior.
      if ((run.outMap[sid+':result'] || []).length) {
        const status = !reading ? 'unread' : reading.libraryError || reading.error ? 'error' : reading.unsure ? 'unsure' : 'confident';
        const data=JSON.parse(JSON.stringify(item.data || {}));
        data.context={id:item.flowId,truth:{label:item.label,value:item.value},status};
        queued.push({from:sid+':result',label:status==='confident'?reading.label:status,value:status==='confident'?reading.value:0,data,flowId:item.flowId});
      }
      if (reading && reading.libraryError) effects.push({ type: 'libraryError', note: reading.libraryError });
      if (reading === null || reading === undefined) continue; // an untaught sense honestly says nothing
      // One trail entry per eye that SPEAKS — including an unsure one. A step that stayed silent
      // is still a step the child needs when debugging a composed machine (spec §5.6): "which of
      // my three models got this wrong?" is unanswerable if the doubters are missing.
      const step = {
        block: sid, type: 'sense', tick: run.tick,
        senseId: b.senseId, brainId: b.brainId || null,
        label: null, value: null, unsure: false,
        spot: { track: item.at.track, index: item.at.index },
      };
      if (b.libraryModel) step.libraryModelId = b.libraryModel.id;
      if (reading.unsure === true) {
        // Below the sure line: NO reading (the wire that sorts stays silent), but the
        // doubt fires on its own port — a machine can SAY "not sure" through whatever
        // block the child wired there (owner 2026-08-17: "not sure" belongs on the Sign).
        step.unsure = true;
        item.trail.push(step);
        queued.push({ from: sid + ':unsure', label: 'not sure', value: 0 });
        continue;
      }
      if (typeof reading.label !== 'string' || !Number.isFinite(reading.value)) {
        fail(`sense "${sid}" ("${b.senseId}") returned a malformed reading — need {label:string, value:number}, {unsure:true} or null`);
      }
      // nearest (composing-arc spec §7, task 1): OPTIONAL — a reading may additionally name the
      // winning stored example (the taught crate a KNN-shaped brain actually matched against).
      // Validated with the same loudness as label/value: a brain that offers a nearest but garbles
      // its shape is a sense bug the child needs surfaced, not a silently dropped field.
      let nearest = null;
      if (reading.nearest !== undefined) {
        const n = reading.nearest;
        const idOk = n && (typeof n.id === 'string' || typeof n.id === 'number');
        const displayOk = n && typeof n.display === 'string';
        if (!idOk || !displayOk) {
          fail(`sense "${sid}" ("${b.senseId}") returned a malformed nearest — need {id:string|number, display:string}`);
        }
        // THE OWNER — stamped HERE, and nowhere else (vision-breaker F1, 2026-09-05).
        //
        // An example id is allocated PER BRAIN (logic/brain.js's `nextId`), and every sense owns
        // its own brain — so "example 1" names a different thing for every sense on the floor. A
        // bare id is therefore not a reference to anything; only (sense, id) is. Without this
        // field a word Model's Frame resolved the CAMERA Model's photograph, captioned it with the
        // word Model's example name, and suppressed the honest "No picture kept" sentence.
        //
        // WHY THE ENGINE and not the sense: the engine is the one place that already knows which
        // sense answered — it just dispatched to `run.senses[b.senseId]`, and createRun fails
        // loudly if that mount is missing — so the owner can never be absent, wrong, or forgotten
        // by a sense adapter (the model-library kit's contract stays `{id, display}`; five host
        // closures would each have had to remember to name themselves, and a sixth would not).
        // Anything the sense itself put on `nearest.sense` is IGNORED: the owner is not the
        // sense's to claim.
        if (typeof b.senseId !== 'string' || !b.senseId) {
          fail(`sense "${sid}" answered with a nearest but mounts no senseId — the winning example would have no owner`);
        }
        nearest = { id: n.id, display: n.display, sense: b.senseId };
        if (b.learning) nearest.owner = sid;
      }
      step.label = reading.label;
      step.value = reading.value;
      if (nearest) step.nearest = nearest; // debuggability — which stored example won, on the trail itself
      item.trail.push(step);
      // lastReading/lastReadBy are DERIVED from the trail's last CONFIDENT sense entry, not
      // simply "the trail's last entry" — an `unsure` step (above) pushes onto the trail but
      // `continue`s before reaching here, so it never overwrites these fields. When the most
      // recent sense to touch this item was unsure, lastReading/lastReadBy still hold whatever
      // the item's last confident reading was (or null, if it has never had one) — correct
      // behaviour (a display wired to lastReading must not flicker to a stale guess's opposite,
      // "nothing", just because a later sense shrugged), but NOT what "the trail's last entry"
      // would suggest. Kept because 13 call sites across four files read them. Additive, so
      // nothing breaks.
      item.lastReading = { label: reading.label, value: reading.value };
      item.lastReadBy = sid; // which sense stamped it — the Floor shows the reading on THAT reader
      queued.push({ from: sid + ':reading', label: reading.label, value: reading.value });
      if (nearest) {
        // A SECOND signal, not a replacement — sid+':reading' still carries the class guess;
        // sid+':nearest' names WHICH stored example won it, the same shape as `unsure` firing on
        // its own port beside a silent reading wire. Labelled by the example's display (not the
        // class) so a Frame wired here reads "Photo 3", not "cat" again. value is the SAME
        // confidence as the reading — this is the same act of matching, seen from the example's
        // side, not a second measurement. The payload carries id+display+sense ONLY (a reference,
        // per the frame:show ACT case below) — never pixels, never a vector. `sense` is the OWNER
        // of that id (see the stamp above): a host resolving the reference to a picture must look
        // it up in THAT sense's own examples, never in a flat id-keyed map.
        queued.push({ from: sid + ':nearest', label: nearest.display, value: reading.value, data: { nearest } });
      }
    }
  }
  // Timers.
  for (const id of run.blockOrder) {
    const b = run.byId[id];
    if (b.type !== 'timer') continue;
    const s = run.blocks[id];
    const ticksN = Math.max(1, Math.round(dial(id, 'seconds') * TICK_HZ));
    const mode = b.mode || 'every';
    if (mode === 'every' && run.tick - s.lastFire >= ticksN) {
      s.lastFire = run.tick;
      queued.push({ from: id + ':fire', label: b.name || id, value: 1 });
    }
    if (mode === 'quiet' && run.tick - s.lastActivity >= ticksN) {
      // Watchdog: fires, then restarts its own quiet window — repeats every N while silence holds.
      s.lastActivity = run.tick;
      queued.push({ from: id + ':fire', label: b.name || id, value: 1 });
    }
  }
  // Counters that crossed N (or changed) during LAST tick's ACT speak now — one-cycle-per-tick law.
  for (const id of run.blockOrder) {
    const b = run.byId[id];
    if (b.type !== 'counter') continue;
    const s = run.blocks[id];
    if (s.fireAtN) { s.fireAtN = false; queued.push({ from: id + ':atN', label: b.name || id, value: s.count }); }
    if (s.valueDirty) { s.valueDirty = false; queued.push({ from: id + ':value', label: b.name || id, value: s.count }); }
  }
  // FILES blocks deal the next row of their eaten file (task E) — the first ENGINE-DRIVEN payload
  // emitter: each signal carries the row's full crate spec ({label, value, data}) down the
  // standard delivery, exactly the channel a camera's picture external already rides. A wired
  // feeder's drop crates it NEXT tick (drop is queued in ACT — one cycle per tick, contract §4);
  // unwired, the signal finds no outMap entry and dies quietly — rows simply have nowhere to go.
  for (const id of run.blockOrder) {
    const b = run.byId[id];
    if (b.type !== 'files') continue;
    const s = run.blocks[id];
    if (!b.contents.length) continue; // unfed: no rows, and no `done` either — no file, no end
    if (s.cursor >= b.contents.length) {
      // The file is dealt: say so ONCE, the tick right after the last row left — the feeder's
      // own doneSent idiom, verbatim. value = how many rows it dealt.
      if (!s.doneSent) {
        s.doneSent = true;
        queued.push({ from: id + ':done', label: b.name || id, value: s.cursor });
      }
      continue;
    }
    const rate = Math.max(1, dial(id, 'rate'));
    const interval = Math.max(1, Math.round((60 * TICK_HZ) / rate));
    if (run.tick - s.lastEmit < interval) continue;
    s.lastEmit = run.tick;
    // FILE ORDER, no shuffle, no rng — a child's own file deals as written (unlike the feeder's
    // seeded dataset shuffle; the manual says so out loud).
    const src = b.contents[s.cursor];
    s.cursor += 1;
    // value may honestly be undefined (a yesno row): the signal IS the crate here, and the drop
    // path maps signal.value straight onto item.value — a stand-in 1 would turn a yes/no crate
    // numeric at the checker. Internal queued signals carry no finite-value gate (only externals
    // do) — so every reader that would turn undefined into NaN/"undefined" guards itself instead
    // (fix round 1, Finding 2): the ACT dial write skips non-finite, the Window skips non-finite,
    // and the sign face render (game.js) treats undefined as the empty board.
    const signal = { from: id + ':row', label: src.label, value: src.value, data: src.data || null, flowId:'flow:'+run.nextFlowId++ };
    if (run.captureTerminals) events.push(sourceEvent(run, id, s.cursor - 1, signal));
    queued.push(signal);
  }
  // Externals — the nondeterminism boundary. Validated loudly: a bad log is a bug, not noise.
  for (const [sourceIndex, x] of externals.entries()) {
    const b = run.byId[x.block];
    if (!b) fail(`external signal names unknown block "${x.block}"`);
    if (!(OUT_PORTS[b.type] || []).includes(x.port)) fail(`external signal: "${x.block}" (${b.type}) has no out-port "${x.port}"`);
    if (typeof x.label !== 'string' || !Number.isFinite(x.value)) fail('external signal needs {label:string, value:number}');
    // A signal may carry an optional payload (spec 2026-08-19 §4: the camera's picture rides
    // in on the crate, not just its word) — undeclared external.data defaults to null so every
    // downstream reader can rely on the field existing rather than checking for undefined.
    const signal = { from: x.block + ':' + x.port, label: x.label, value: x.value, data: x.data || null, flowId:'flow:'+run.nextFlowId++ };
    if (run.captureTerminals) events.push({...sourceEvent(run, x.block, sourceIndex, signal),external:true});
    queued.push(signal);
  }

  // ----- DELIVER ------------------------------------------------------------
  // Each signal flows from its out-port through wires. Filter/Dice evaluate inline and,
  // if they pass, the signal continues from THEIR out-port. A signal visits any block at
  // most once (visited set) — cycles are safe by construction (contract §4).
  for (const sig of queued) {
    const visited = new Set([sig.from.split(':')[0]]);
    // The frontier carries the SIGNAL with it: an inline block may pass it unchanged
    // (filter, dice in 'pass' mode) or re-label it (dice in 'pick' mode says which face).
    const frontier = [{ key: sig.from, sig }];
    while (frontier.length) {
      const { key, sig: cur } = frontier.shift();
      for (const dest of run.outMap[key] || []) {
        // data rides the glow so a test — and Plan 3's Board — can tell WHICH act a done belonged
        // to without a second channel; null when the signal carried none.
        events.push({ t: 'glow', from: key, to: dest.block + ':' + dest.port, label: cur.label, value: cur.value, data: cur.data !== undefined ? cur.data : null });
        const db = run.byId[dest.block];
        if (STATELESS[db.type] && !dest.port.startsWith('dial:') && dest.port !== 'reward') {
          if (visited.has(dest.block)) continue;
          visited.add(dest.block);
          const out = passes(run, db, cur);
          if (out) frontier.push({ key: dest.block + ':out', sig: out });
        } else {
          actions.push({ block: dest.block, port: dest.port, signal: cur });
        }
      }
    }
  }

  // ----- ACT ----------------------------------------------------------------
  // Queue order is fully deterministic (derived from block order + item order + wire order),
  // which is what the contract's "stable order" exists to guarantee.
  for (const a of actions) {
    const b = run.byId[a.block];
    const s = run.blocks[a.block];
    if (a.port.startsWith('dial:')) {
      // Dials-are-ports (contract §2): the wire overwrites the hand-set value. Last write wins.
      // A VALUELESS write turns no dial (task E fix round 1, review 2026-08-29 Finding 2):
      // files:row is the first INTERNAL signal that may honestly carry value: undefined (a yesno
      // row — see the files EMIT loop), and Math.max(1, undefined) is NaN, whose interval
      // comparison never skips a tick — the exact firehose the camera-`every` clamp exists to
      // stop, reached through a dial. Non-finite in → keep the dial the child (or the last real
      // write) set; every dial is a number by contract, so nothing legitimate is refused here.
      const name = a.port.slice(5);
      // `s.dials` rides along because one dial can be bounded by another (the splitter's two
      // shares); every other dial ignores it.
      if (Number.isFinite(a.signal.value)) s.dials[name] = clampDial(b.type, name, a.signal.value, s.dials);
      continue;
    }
    if (s.composition) {
      try { Composition.act(s.composition,b,a.port,a.signal,run.tick,s.dials); }
      catch(e) { s.composition.notice=e.message; }
      if (s.composition.notice) effects.push({type:'compositionError',block:b.id,note:s.composition.notice});
      continue;
    }
    switch (b.type + ':' + a.port) {
      case 'counter:plus': bumpCounter(run, a.block, +1); break;
      case 'counter:minus': bumpCounter(run, a.block, -1); break;
      case 'counter:reset': {
        if (s.count !== 0) s.valueDirty = true;
        s.count = 0; s.firedSinceReset = false;
        break;
      }
      case 'timer:activity': s.lastActivity = run.tick; break;
      case 'dice:reward': {
        // Reinforce the last pick. Nothing picked yet → nothing to reinforce (no crash, no
        // phantom learning). Weights follow the faces dial if it was turned mid-run.
        syncWeights(s);
        if (s.lastPick >= 0 && s.lastPick < s.weights.length) s.weights[s.lastPick] += 1;
        break;
      }
      case 'carmaker:go': {
        // ONE GO, ONE CRATE (car-galleries, C9). A `go` delivered to this port is a one-shot ACT
        // action, so it makes exactly one crate — IN THIS TICK'S ACT PHASE, not next tick. No
        // latch is needed, and adding one would be wrong: there is no per-tick emit path for a
        // latch to consume, so silence produces no action and emits nothing, while two `go`s in
        // one tick are two actions and correctly make two crates ("a `go` causes exactly ONE").
        // The crate is built from the block's LIVE state at this instant — the whole reason the
        // Car Maker is its own item source rather than a feeder whose `contents` were fixed at
        // compile time. It enters the block's own `to` through enterTarget, exactly as a feeder's
        // crate does, so indexing and the trail are identical across both sources.
        //
        // THE CRATE CONTRACT (Task 6's design of record): `value`/`label` = the `target` dial (the
        // mpg the Evaluator grades a prediction against); `data.features` = the live feature dials;
        // `data.dataset` = the schema OBJECT (never the id string — datasets.js:183 throws; never
        // absent — a null vector makes a machine that runs and reads nothing); `data.tolerance` =
        // the answer tolerance; `data.tag` = the crate face, so the checker log and a library row
        // say the same thing. `schema` is guaranteed by createRun's own loud check.
        const schema = b.schema;
        const dialDefs = carmakerDialDefs(b);
        const featureDefs = dialDefs.filter((d) => d.id !== 'target');
        const features = {};
        for (const d of featureDefs) {
          if (Number.isFinite(s.dials[d.id])) features[d.id] = s.dials[d.id];
        }
        const targetDef = dialDefs.find((d) => d.id === 'target');
        const target = Number.isFinite(s.dials.target) ? s.dials.target : (targetDef ? targetDef.def : 0);
        const item = {
          id: run.nextItemId++,
          flowId: 'flow:' + run.nextFlowId++,
          data: {
            tag: featureDefs.map((d) => d.label + ' ' + features[d.id]).join(' · '),
            features,
            dataset: schema,
            tolerance: Number.isFinite(schema.answer && schema.answer.tolerance) ? schema.answer.tolerance : DEFAULT_TOLERANCE,
          },
          label: String(target),
          value: target,
          lastReading: null,
          trail: [],
          at: { kind: 'track', track: b.to, index: 0 },
          ticksInCell: 0,
          entered: true,
          justPlaced: true,
        };
        run.items.push(item);
        events.push({ t: 'emit', feeder: a.block, item: item.id });
        enterTarget(run, item, b.to, events, queued);
        break;
      }
      case 'feeder:drop':
        // Queued, not emitted here: item creation lives in ONE place (the feeder phase),
        // and a signal born in ACT rides the next tick — same law the counters obey.
        s.dropQueue.push({ label: a.signal.label, value: a.signal.value, data: a.signal.data || null, flowId:a.signal.flowId });
        break;
      case 'camera:snap':
        // R4 (connection-law spec 2026-08-27): a poke on snap asks for a REAL capture. The
        // engine PROPOSES (contract §6 — nondeterminism enters as externals): the host reads
        // the device and injects the picture as a `picture` external next tick. The old
        // behaviour — re-emitting the poking signal's own payload — produced empty crates
        // and taught a child the port was dead (audit §2.4).
        effects.push({ type: 'snap', block: a.block });
        break;
      case 'microphone:listen':
        // A CAPTURE DEVICE WITH NO INTELLIGENCE (the camera's law): the engine proposes, the host
        // listens (toolbox listenOnce), and whatever was heard re-enters as an external on
        // `heard`. The engine keeps NO listening state — the host serializes concurrent listens
        // (R5) because only it knows when the recognizer settled. An EVENT, not an effect (unlike
        // `camera:snap`): nothing about a listen needs the effect channel's proposal/response
        // shape — the host is already watching events for exactly this poke.
        events.push({ t: 'listen', block: a.block });
        break;
      case 'gate:switch':
      case 'gate:switch1': case 'gate:switch2': case 'gate:switch3':
      case 'gate:switch4': case 'gate:switch5': case 'gate:switch6': {
        const mode = b.mode || 'sorter';
        if (mode === 'sorter') {
          // Last signal wins the ONE arm slot, CONSUMED by the very next item; bare 'switch'
          // is the legacy alias for switch2.
          const k = a.port === 'switch' ? 2 : Number(a.port.slice(6));
          if (b.decisionMode === 'item') {
            // Deliberately require rich context. Legacy reading gets its own signal flowId,
            // which identifies a signal emission, NOT the observation a Model looked at.
            const c = a.signal.data && a.signal.data.context;
            if (!c || typeof c.id !== 'string' || !c.id.length || c.id.length > 160) {
              routingReview(run, b.id, null, 'missing-identity', events); break;
            }
            if (!Object.hasOwn(s.decisions, c.id) && Object.keys(s.decisions).length >= ROUTING_CAPACITY) {
              routingReview(run, b.id, c.id, 'capacity', events); break;
            }
            const fallback = ['unsure', 'unread', 'error'].includes(c.status);
            s.decisions[c.id] = { exit: fallback ? (b.fallbackExit || 1) : k,
              status: c.status || 'input', since: run.tick,
              expires: run.tick + Math.round((b.decisionSeconds === undefined ? 30 : b.decisionSeconds) * TICK_HZ) };
            events.push({t:'routing-decision',block:b.id,flowId:c.id,outcome:'stored',exit:s.decisions[c.id].exit,tick:run.tick});
          } else s.armedExit = k - 1;
        } else if (mode === 'latch') {
          // A points switch that STAYS where you set it (task B, owner's general-purpose
          // ruling): the SAME slot a sorter uses, except nothing ever clears it after routing
          // an item — it is the new default until another switch signal overwrites it.
          const k = a.port === 'switch' ? 2 : Number(a.port.slice(6));
          s.exit = k - 1;
        } else if (mode === 'grabber') s.armedUntil = run.tick + Math.max(1, s.dials.q);
        else s.armed = true;
        break;
      }
      case 'pen:release': {
        // The pen's own dam. Releasing lets the deal phase (MOVE, above) start trickling the
        // held pile out AND latches the pen open — every arrival from this tick on passes
        // straight through (enterTarget's pen branch), never joining the pile again.
        s.open = true;
        break;
      }
      case 'splitter:in': {
        // A MANIFEST-BACKED SOURCE (private learning loop, task P2b): a row that arrives wearing
        // `data.split = {pile, key}` already belongs to a pile — a split someone froze on purpose
        // (logic/private-session.js manifests, stamped by logic/private-examples.js crateFor). It is
        // routed by that stamp and never by the percentage apportionment below, so the order rows
        // arrive in can never move one. `pile: null` is an item that waits for a pile: taken and
        // counted (`unassigned`), dealt nowhere. A Splitter serves ONE kind of source: a stamped
        // row after unstamped ones, an unstamped row after stamped ones, or rows from two different
        // splits are REFUSED — counted and announced with the reason (`split-refused`), never
        // re-divided. With no stamp ever seen, everything below runs exactly as before.
        const fixed = a.signal.data ? a.signal.data.split : undefined;
        if (fixed !== undefined || s.fixedKey !== undefined) {
          const refuse = (reason) => { s.refused = (s.refused || 0) + 1; events.push({ t: 'split-refused', block: a.block, reason }); };
          if (!fixed || typeof fixed !== 'object') { refuse('mixed'); break; }
          if (typeof fixed.key !== 'string' || !fixed.key || !(fixed.pile === null || PILE_ORDER.includes(fixed.pile))) {
            fail(`splitter "${a.block}" got a row with a malformed fixed pile — need {pile: training|validation|test|null, key: string}`);
          }
          if (s.fixedKey === undefined && s.taken > 0) { refuse('mixed'); break; }
          if (s.fixedKey !== undefined && s.fixedKey !== fixed.key) { refuse('other-split'); break; }
          s.fixedKey = fixed.key;
          s.taken += 1;
          if (fixed.pile === null) {
            s.unassigned = (s.unassigned || 0) + 1;
            events.push({ t: 'split-waiting', block: a.block, waiting: s.unassigned });
            break;
          }
          s.piles[fixed.pile].push({ label: a.signal.label, value: a.signal.value, data: a.signal.data || null });
          s.dealt[fixed.pile] += 1;
          break;
        }
        // Every row is HELD. Nothing leaves this block until the pile it landed in is released —
        // that is the whole point of dividing the data before it flows.
        // Validation is capped by what Training LEFT, not at 100 independently — the same cap
        // logic/floor-layout.js barHandles draws with. Clamping them apart made 90/50 deal about
        // 64/36/0 while the block's own bar drew 90/10/0: the picture, the number printed on it
        // and the machine's behaviour were three different answers (review finding 5).
        const training = Math.max(0, Math.min(100, s.dials.training));
        const w = {
          training,
          validation: Math.max(0, Math.min(100 - training, s.dials.validation)),
        };
        w.test = Math.max(0, 100 - w.training - w.validation);
        const pile = pileFor(s.taken, s.dealt, w);
        s.piles[pile].push({ label: a.signal.label, value: a.signal.value, data: a.signal.data || null });
        // No re-arm needed here any more (Plan 2): a pass's completion check (`cursor >=
        // deck.length`, MOVE 2c) reads the deck's CURRENT length fresh every tick, so an arrival
        // that lands mid-pass simply grows the deck the pass is still walking — "arrivals extend
        // the pass" (spec §6 delta 3) falls out of that comparison for free, with no flag to keep
        // in sync.
        s.dealt[pile] += 1;
        s.taken += 1;
        break;
      }
      // A press that was DROPPED as a duplicate of the act already in flight (or already waiting)
      // announces itself, so the host can say why nothing new happened (review M8). `act-dup`
      // carries the same {pile, mode} shape as act-start/act-end.
      case 'splitter:teach': if (!queuePass(s, 'training', 'learn')) events.push({ t: 'act-dup', block: a.block, pile: 'training', mode: 'learn' }); break;
      case 'splitter:releaseTraining': if (!queuePass(s, 'training', 'answer')) events.push({ t: 'act-dup', block: a.block, pile: 'training', mode: 'answer' }); break;
      case 'splitter:releaseValidation': if (!queuePass(s, 'validation', 'answer')) events.push({ t: 'act-dup', block: a.block, pile: 'validation', mode: 'answer' }); break;
      case 'splitter:releaseTest': if (!queuePass(s, 'test', 'answer')) events.push({ t: 'act-dup', block: a.block, pile: 'test', mode: 'answer' }); break;
      case 'board:watch': {
        // THE BOARD REMEMBERS WHAT THE EVALUATOR FORGETS (spec §3/§10). swallowChecked keeps only
        // the newest act per pile — "the model you have NOW" — and its own comment sends attempt
        // history HERE. Everything below came down checker:error; the Board never reaches into
        // the checker. pile==='test' is dropped by owner ruling 2026-09-03: the Board never
        // draws the exam — tuning against the sealed pile is the malpractice the Lab exposes.
        const pass = a.signal.data && a.signal.data.pass;
        if (!pass || pass.mode !== 'answer' || !Number.isFinite(pass.seq)) {
          // ARRIVAL-HONESTY (fix round 2, MAJOR finding: the relay-watch lie — vision-breaker
          // full pass). A signal reached this port but carries no usable pass — the shape a
          // relay (window/counter/timer, wired `checker:error -> window:in`, `window:out ->
          // board:watch`) ALWAYS produces: `passes()`'s own window branch re-emits `{from,
          // label, value}`, never the original crate's `pass` metadata (engine.js's own comment
          // there: "there is no single payload to carry forward here"). Counted so the FLOOR can
          // say "something is arriving, but none of it is attributable" instead of forever
          // inviting a test that has already happened — never a FABRICATED point (no topology
          // walk back through the relay to find a real x; there is no honest x to plot here,
          // only a lie in a different shape). Deliberately NOT counted for the test-pile drop or
          // a non-finite VALUE riding a REAL pass (the branch below) — both of those are a
          // legitimate signal this port correctly declines to chart, not a relay's own blindness.
          s.heard++;
          break;
        }
        if (!Number.isFinite(a.signal.value) || pass.pile === 'test') break;
        let act = s.acts[pass.seq];
        if (!act) {
          // x = the watched dial AS THE ACT FIRST SCORES (R3), read run-live via dial() — the
          // two-sources trap's safe side. A watch naming a block/dial the room no longer has
          // yields x:null, never a throw: a stale save must not crash the run (R6) — the face
          // says "pick a dial" instead.
          const wb = b.watchBlock && run.byId[b.watchBlock] && run.blocks[b.watchBlock] ? b.watchBlock : null;
          const raw = wb && b.watchDial ? dial(wb, b.watchDial) : null;
          // FIX ROUND 1 (mixed-chart honesty bug — spec §3): `watch` names WHICH dial `x` actually
          // came from, stamped ONCE at the act's own creation from the SAME resolved `wb` the x
          // read just used — never re-derived later from whatever the Board happens to be
          // watching by the time someone reads this point back. A child who switches the picker
          // mid-run (no Stop) must not have an EARLIER act's point silently relabelled under the
          // dial picked afterward — `boardView`/`WorkshopBoard.commit` file every point by ITS
          // OWN `watch`, not the Board's current-at-read-time watch. Null exactly when x is null
          // (no block resolved -> nothing to attribute either).
          act = s.acts[pass.seq] = { pile: pass.pile, x: Number.isFinite(raw) ? raw : null, watch: wb ? { block: wb, dial: b.watchDial } : null, n: 0, sum: 0 };
        }
        act.n += 1; act.sum += a.signal.value;
        break;
      }
      case 'lamp:on': s.litUntil = run.tick + Math.max(LAMP_MIN_LIT, Math.round(s.dials.seconds * TICK_HZ)); break;
      case 'sign:show': s.shown = (b.mode || 'label') === 'value' ? a.signal.value : a.signal.label; break;
      case 'frame:show': {
        // The Frame keeps a REFERENCE, not pixels: id+display+sense (whatever `data.nearest`
        // carried), never image data or a vector — resolving that reference to an actual picture
        // is a draw-time host concern (game.js), exactly like the Board never touching a shelf
        // itself. A reference is (sense, id), never a bare id — see the stamp in EMIT above: the
        // host MUST resolve through `nearest.sense`, or it paints another Model's memory.
        // `nearest` is null when the signal wasn't a sense's nearest port at all (any signal can
        // be wired into a Frame's `show` — see the IN_PORTS comment above).
        s.shown = { label: a.signal.label, value: a.signal.value, nearest: (a.signal.data && a.signal.data.nearest) || null, tick: run.tick };
        break;
      }
      case 'noisemaker:play': {
        if (run.tick - s.lastPlay >= SOUND_MIN_GAP) {
          s.lastPlay = run.tick;
          events.push({ t: 'sound', block: a.block, sound: b.sound || 'beep', pitch: s.dials.pitch });
        }
        break;
      }
      case 'speaker:say': {
        // THE SPEAKER PERFORMS, THE HOST SPEAKS (the noisemaker's split, engine.js sound event):
        // the engine emits a deterministic speech event; TTS is a host effect that can hang or be
        // muted without the machine ever noticing (never gate progression on TTS — k2-15 law).
        // Inside the gap the say is DROPPED, not queued: a machine talking over itself teaches
        // nothing, and a queue would make the voice lag the belt by growing seconds.
        if (run.tick - s.lastPlay < SPEAK_MIN_GAP) break;
        s.lastPlay = run.tick;
        const numeric = Number.isFinite(a.signal.value) && (!a.signal.label || a.signal.label === String(a.signal.value));
        const text = numeric ? String(Math.round(a.signal.value * 100) / 100) : String(a.signal.label || '');
        if (!text) break;
        s.lastSaid = text;
        events.push({ t: 'speech', block: a.block, text });
        break;
      }
      case 'teach:fileIt': {
        // The write actuator. Effect is PROPOSED — the engine never touches a shelf (contract §6).
        const spotKey = b.spot.track + ':' + b.spot.index;
        const item = run.items.find((it) => it.at.kind === 'track' && it.at.track + ':' + it.at.index === spotKey);
        // A BLANK shelf name means "file it under what the sticker says" — the item's own label.
        // That is how a machine teaches itself from named data (a feeder row "10 11 12 = 13"
        // files the window onto the "13" shelf; the Number brain then predicts 13-ish next time).
        const shelf = (b.shelf && String(b.shelf).trim()) || item && item.label;
        if (item) effects.push({ type: 'teach', block: a.block, shelf, itemId: item.id, data: item.data });
        else events.push({ t: 'teach-miss', block: a.block });
        break;
      }
      case 'cloud:ask': {
        if (s.dials.budget > 0) {
          s.dials.budget -= 1;
          effects.push({ type: 'cloudAsk', block: a.block, mode: b.mode || 'text', payload: { label: a.signal.label, value: a.signal.value } });
        } else events.push({ t: 'budget-empty', block: a.block });
        break;
      }
      case 'send:send': {
        if (s.dials.budget > 0) {
          s.dials.budget -= 1;
          effects.push({ type: 'send', block: a.block, target: b.target, payload: { label: a.signal.label, value: a.signal.value } });
        } else events.push({ t: 'budget-empty', block: a.block });
        break;
      }
      default:
        fail(`unhandled action ${b.type}:${a.port} — port tables and ACT switch disagree`);
    }
  }

  // End-of-tick retirement sees both physical copies and signals queued for the NEXT tick.
  // Retiring at the first Bin would discard a delayed branch's decision in a fan-out.
  const live = activeFlows(run);
  if (previouslyLive) {
    // A Files row can be emitted and wholly filtered within THIS tick; it was never in the
    // previous live set. Its admission still needs a finished observation for the collector.
    for (const event of events) if (event.t === 'source') previouslyLive.add(event.flowId);
    for (const event of events) if (event.terminal) previouslyLive.add(event.terminal.flowId);
    for (const flowId of previouslyLive) if (!live.has(flowId)) events.push({t:'flow-finished',flowId,tick:run.tick});
  }
  for (const id of run.blockOrder) {
    const s = run.blocks[id];
    if (!s.decisions) continue;
    for (const flowId of Object.keys(s.decisions)) if (!live.has(flowId)) {
      delete s.decisions[flowId];
      events.push({t:'routing-decision',block:id,flowId,outcome:'retired',tick:run.tick});
    }
  }
  return { events, effects };
}

// --- helpers ----------------------------------------------------------------

const ROUTING_CAPACITY = 64;
/** Opt-in observation admission, before a signal can disappear without making a crate.
 * Only detached identity/reference is captured; raw source payload stays with its owner. */
function sourceEvent(run, block, sourceIndex, value, physical = false) {
  // Autonomous Feeder items already have their effective identity/truth. Signals instead
  // carry the context that a later drop/composition continuation will use.
  const data = value.data || {}, context = physical ? null : data.context;
  return JSON.parse(JSON.stringify({t:'source',block,sourceIndex,tick:run.tick,
    flowId:context && context.id || value.flowId,source:data.source || null,
    reference:sourceReferenceFor(value, physical)}));
}
/** Effective reference at source admission, before emission or terminal grading.
 * Signals carry original truth through context; autonomous physical Feeders start fresh.
 * Explicit data.reference still takes precedence through the canonical referenceFor owner.
 * @param {object} value source row or signal
 * @param {boolean} physical true only for autonomous physical Feeder contents
 * @returns {object} validated reference, including explicit absence and numeric zero
 */
function sourceReferenceFor(value, physical = false) {
  const data = value && value.data || {}, truth = !physical && data.context && data.context.truth;
  return referenceFor(truth ? {data,label:truth.label,value:truth.value} : value);
}
/** Batch capture is explicit; ordinary interactive/persisted event consumers retain their schema. */
function emissionEvent(run, feeder, item) {
  const event = {t:'emit',feeder,item:item.id};
  if (run.captureTerminals) {
    event.flowId = item.flowId;
    event.source = item.data && item.data.source ? JSON.parse(JSON.stringify(item.data.source)) : null;
  }
  return event;
}

/** Detached terminal evidence for a local collector. Never copies raw photos, vectors or text. */
function terminalEvent(run, item, event, detail) {
  if (!run.captureTerminals) return event;
  const block = event.bin || event.gate, data = item.data || {};
  // The label is the predicted answer even for numeric brains; value can be confidence.
  // Checker supplies its exact reading below, preserving its established legacy-silence rule.
  const reading = event.verdict === 'filed' ? null : event.verdict === 'unread' ? {status:'unread'}
    : item.lastReading ? {status:'answered',guess:item.lastReading.label}
    : {status:(item.trail || []).some(step => step.type === 'sense') ? 'unsure' : 'unread'};
  event.terminal = JSON.parse(JSON.stringify({flowId:item.flowId,itemId:item.id,source:data.source || null,
    reference:referenceFor(item),reading,lastReading:item.lastReading,trail:item.trail,via:item.via || null,
    fields:data.fields || null,pass:data.pass || null,studied:!!data.studied,
    tick:run.tick,block,type:run.byId[block].type,verdict:event.verdict || null,
    tolerance:null,superseded:false,...detail}));
  return event;
}

/** Visible, bounded refusal state. Hosts translate reason codes; no private labels are copied. */
function routingReview(run, block, flowId, reason, events) {
  const review = {t:'routing-review',block,flowId,reason,tick:run.tick};
  run.blocks[block].routingReview = review;
  events.push(review);
}

/** Engine-local observation IDs in flight, including deferred composition/Feeder copies.
 * Hosts must also await their own pending training/device work before declaring a batch done. */
function activeFlows(run) {
  const ids = new Set();
  const add = (value, physical = false) => {
    const c = !physical && value && value.data && value.data.context;
    const id = c && c.id || value && value.flowId;
    if (typeof id === 'string') ids.add(id);
  };
  run.items.forEach(item => add(item, true));
  for (const s of Object.values(run.blocks)) {
    (s.dropQueue || []).forEach(value => add(value));
    if (!s.composition) continue;
    s.composition.pending.forEach(value => add(value));
    for (const pair of Object.values(s.composition.waiting)) { add(pair.left); add(pair.right); }
  }
  return ids;
}

/** Keep a dice's weight table the length of its faces dial (dials are ports — it can move). */
function syncWeights(s) {
  const n = Math.max(1, Math.round(s.dials.n));
  if (!Array.isArray(s.weights)) s.weights = [];
  while (s.weights.length < n) s.weights.push(1);
  if (s.weights.length > n) s.weights.length = n;
}

/** Optional authored Chance names, aligned by face index. Blank/missing entries stay numeric. */
function chanceFaceLabel(block, pick) {
  const raw = typeof block.faceNames === 'string' ? block.faceNames : '';
  const names = raw.split('|').slice(0, 24).map((name) => name.trim().slice(0, 24));
  return names[pick] || String(pick + 1);
}

/**
 * Filter/Dice inline evaluation during DELIVER: returns the signal that continues (the same
 * one, or a re-labelled one) or null when it is blocked. Dice consumes the run's seeded rng.
 *   dice 'pass' (default): the signal gets through 1 time in N.
 *   dice 'pick': ALWAYS gets through, re-labelled with the face it rolled ("1".."N"), rolled
 *                by WEIGHT — the bandit. A rewarded face grows heavier and comes up more.
 */
function passes(run, block, sig) {
  const s = run.blocks[block.id];
  if (block.type === 'filter') {
    const mode = block.mode || 'any';
    if (mode === 'is' && sig.label !== block.label) return null;
    if (mode === 'isnot' && sig.label === block.label) return null;
    if (block.test === 'gt' && !(sig.value > s.dials.n)) return null;
    if (block.test === 'lt' && !(sig.value < s.dials.n)) return null;
    return sig;
  }
  if (block.type === 'window') {
    // A VALUELESS signal contributes nothing (task E fix round 1, review 2026-08-29 Finding 2):
    // files:row may honestly carry value: undefined (a yesno row) — remembered, it would poison
    // every aggregate into NaN on a wired Display for N more signals. Not remembered, nothing
    // new to say (externals are already gated finite; this is the internal-signal guard).
    if (!Number.isFinite(sig.value)) return null;
    // Remember this value, forget the oldest beyond the dial, then say ONE number about the run.
    // A window ALWAYS speaks (even on its first signal): a machine that goes silent while its
    // memory fills reads as broken, and "the average of one thing" is honestly that thing.
    const keep = Math.max(1, Math.round(s.dials.n));
    s.win.push(sig.value);
    while (s.win.length > keep) s.win.shift();
    const mode = block.mode || 'average';
    let out;
    if (mode === 'change') out = s.win[s.win.length - 1] - s.win[0];      // newest − oldest: the trend
    else if (mode === 'biggest') out = Math.max.apply(null, s.win);
    else if (mode === 'smallest') out = Math.min.apply(null, s.win);
    else out = s.win.reduce((a, v) => a + v, 0) / s.win.length;           // the moving average
    // Round the way a dial reads, so a Display shows 12.34 rather than 12.339999999999998.
    out = Math.round(out * 100) / 100;
    // A window's output is an AGGREGATE of several past signals, not any one of them — there is
    // no single payload to carry forward here (unlike filter/dice, which re-emit ONE signal).
    return { from: block.id + ':out', label: String(out), value: out };
  }
  const [f, st] = rng.next(run.rngState);
  run.rngState = st;
  if ((block.mode || 'pass') === 'pick') {
    syncWeights(s);
    const total = s.weights.reduce((a, w) => a + w, 0);
    let acc = 0, pick = s.weights.length - 1;
    for (let i = 0; i < s.weights.length; i++) { acc += s.weights[i]; if (f * total < acc) { pick = i; break; } }
    s.lastPick = pick;
    // Dice 'pick' constructs a NEW signal (re-labelled with the rolled face) — carry the
    // original payload forward, else a camera's picture would vanish through a bandit gate.
    return { from: block.id + ':out', label: chanceFaceLabel(block, pick), value: sig.value, data: sig.data || null, flowId:sig.flowId };
  }
  return f < 1 / Math.max(1, s.dials.n) ? sig : null;
}

/** An item leaves the end of a track into whatever the track feeds. */
function exitTrack(run, item, track, events, queued) {
  enterTarget(run, item, track.to, events, queued);
}

/** Route an item into a track / gate / bin. Gate semantics = contract §5 (dumb on purpose). */
function enterTarget(run, item, targetId, events, queued) {
  const target = run.byId[targetId];
  if (target.type === 'track') {
    item.at = { kind: 'track', track: targetId, index: 0 };
    item.ticksInCell = 0;
    item.entered = true;
    return;
  }
  if (target.type === 'checker') {
    swallowChecked(run, item, target, events, queued);
    return;
  }
  if (target.type === 'bin') {
    const s = run.blocks[targetId];
    s.count += 1;
    // `via` is the item's WHY-trail (see the sorter stamp below): the bin log is the run-time
    // Evidence a child reads — "which gate sent this here, and did a switch choose it?"
    // The landing is the trail's last step, pushed BEFORE the snapshot so the log holds a
    // complete story: ...gate exit 2 -> Bin "Paper" landed.
    item.trail.push({ block: targetId, type: 'bin', tick: run.tick, landed: true });
    // .slice() matters: the item is spliced out of run.items on the next line, but the log must
    // keep the trail as it stood at landing time.
    // viaData: a snapshot of item.data at landing — how a `studied` stamp (or any other per-item
    // mark a block leaves along the way) reaches the Evidence log without a new per-mark field.
    s.log.push({ tick: run.tick, itemId: item.id, label: item.label, lastReading: item.lastReading, via: item.via || null, viaData: item.data || null, trail: item.trail.slice() });
    run.items.splice(run.items.indexOf(item), 1);
    events.push(terminalEvent(run, item, { t: 'swallow', bin: targetId, item: item.id }));
    queued.push({ from: targetId + ':count', label: target.name || targetId, value: s.count });
    return;
  }
  if (target.type === 'pen') {
    // THE PEN (task B): a waiting room, general-purpose. Closed (the run-start default, and
    // every tick before its own release fires): every arrival is HELD — a visible pile, drained
    // by the deal phase (MOVE, above). Open (release has fired, ANY time in this run's past):
    // arrivals pass straight through, never joining the pile — the latch behaviour that lets a
    // held pile finish draining on its own pace while fresh crates no longer wait at all.
    const s = run.blocks[targetId];
    if (!s.open) {
      item.at = { kind: 'pen', pen: targetId };
      item.ticksInCell = 0; item.entered = false;
      s.held.push(item.id);
      events.push({ t: 'hold', gate: targetId, item: item.id });
      return;
    }
    enterTarget(run, item, target.to, events, queued);
    return;
  }
  // gate
  const s = run.blocks[targetId];
  const mode = target.mode || 'sorter';
  if (mode === 'latch') {
    // A points switch that STAYS where you set it (task B, owner's general-purpose ruling): the
    // default exit is whatever the LAST switch signal named, forever, until another signal
    // overwrites it — no per-item consumption (contrast the sorter branch just below, which
    // resets its arm after every item). null = never thrown — the honest "untouched" default.
    const exitIndex = s.exit === null ? 0 : s.exit;
    const armed = s.exit !== null;
    item.via = { gate: targetId, exit: exitIndex + 1, armed };
    item.trail.push({ block: targetId, type: 'gate', tick: run.tick, exit: exitIndex + 1, armed });
    enterTarget(run, item, run.gateExits[targetId][exitIndex], events, queued);
    return;
  }
  if (mode === 'sorter') {
    if (target.decisionMode === 'item') {
      const decision = s.decisions[item.flowId];
      const exit = decision ? decision.exit : (target.fallbackExit || 1);
      const stamp = {gate:targetId,exit,armed:!!decision,flowId:item.flowId,
        decision:decision ? 'consumed' : 'fallback',status:decision ? decision.status : 'no-decision'};
      item.via = stamp;
      item.trail.push({block:targetId,type:'gate',tick:run.tick,...stamp});
      if (decision) delete s.decisions[item.flowId];
      else routingReview(run, targetId, item.flowId, 'no-decision', events);
      events.push({t:'routing-decision',block:targetId,flowId:item.flowId,item:item.id,
        outcome:stamp.decision,status:stamp.status,exit,tick:run.tick});
      enterTarget(run, item, run.gateExits[targetId][exit - 1], events, queued);
      return;
    }
    // The armed exit (or exit 1); arm consumed by THIS item — the timing puzzle is the lesson.
    const armed = s.armedExit !== null;
    const exitIndex = armed ? s.armedExit : 0;
    const dest = run.gateExits[targetId][exitIndex];
    // Stamp the WHY-trail: which gate, which exit (1-based), and whether a switch chose it or
    // it fell out the default way. Last gate on the path wins — that is the gate that decided.
    item.via = { gate: targetId, exit: exitIndex + 1, armed };
    item.trail.push({ block: targetId, type: 'gate', tick: run.tick, exit: exitIndex + 1, armed });
    s.armedExit = null;
    enterTarget(run, item, dest, events, queued);
    return;
  }
  if (mode === 'trapdoor') {
    if (s.armed) {
      s.armed = false;
      run.items.splice(run.items.indexOf(item), 1);
      item.trail.push({block:targetId,type:'gate',tick:run.tick,dropped:true});
      events.push(terminalEvent(run, item, { t: 'drop', gate: targetId, item: item.id }));
    } else {
      item.via = { gate: targetId, exit: 1, armed: false };
      item.trail.push({ block: targetId, type: 'gate', tick: run.tick, exit: 1, armed: false });
      enterTarget(run, item, run.gateExits[targetId][0], events, queued);
    }
    return;
  }
  // grabber: hold while armed, else pass straight through
  if (run.tick <= s.armedUntil) {
    item.at = { kind: 'gate', gate: targetId };
    item.ticksInCell = 0;
    item.entered = false;
    events.push({ t: 'hold', gate: targetId, item: item.id });
  } else {
    item.via = { gate: targetId, exit: 1, armed: false };
    item.trail.push({ block: targetId, type: 'gate', tick: run.tick, exit: 1, armed: false });
    enterTarget(run, item, run.gateExits[targetId][0], events, queued);
  }
}

function bumpCounter(run, id, delta) {
  const s = run.blocks[id];
  s.count += delta;
  s.valueDirty = true;
  if (!s.firedSinceReset && s.count >= s.dials.n) {
    s.firedSinceReset = true;
    s.fireAtN = true; // spoken in NEXT tick's EMIT — one cycle per tick
  }
}

/** Track speed dial (cells/second) → ticks an item waits in each cell. Floors at 1 tick (a cell a
 *  tick is the fastest a belt goes — speed 10 at TICK_HZ 10) and never lets a 0/negative dial park items. */
function ticksPerCell(speed) {
  const cps = Number(speed);
  if (!Number.isFinite(cps) || cps <= 0) return TICK_HZ; // no dial / nonsense → the slow default
  return Math.max(1, Math.round(TICK_HZ / cps));
}

/**
 * THE REFERENCE ANSWER a crate carries, in the ONE shape private-session.js defines (ruling R5):
 * `{present:false}` or `{present:true, kind:'class'|'number', value}`. Presence is explicit —
 * never the truthiness of a value, so a class answer of '' and a number answer of 0 are answers.
 *
 * Three arms, in order:
 *  1. `data.reference` — a crate built by the private path (private-examples.js `crateFor`) already
 *     wears the contract. Validated and used as-is; no second field is invented for it.
 *  2. A LEGACY NUMBER row. Every number crate the product deals writes the answer's own TEXT on
 *     the crate and the same number beside it: game.js `datasetContents` (`label: r.answer` where
 *     table-import.js writes `String(Number(raw))` and `value: r.value`), model-library.js
 *     `contents` (`label: String(r.label), value: r.label`), private-examples.js `crateFor`. So
 *     `label === String(value)` IS the product's own signature for "this crate's answer is a
 *     number" — and it is the signature `Number.isFinite(item.value)` alone could not read.
 *  3. A LEGACY CLASS row: a WORD on the crate (a typed feeder row, a class dataset's answer, a
 *     yes/no row). Empty is not a word.
 * Anything else has NO answer key — a Files/camera photo crate is `{label:'', value:1}` (game.js
 * `photoContents`; photos ride wordless on purpose) and used to grade as `Number('glass') = NaN`
 * → error Infinity → WRONG. That is board task 108 / P1 evidence §7 gap 2: a stand-in 1 turning a
 * word into a failed number. The engine already knew the shape of this bug — see the `files:row`
 * comment, "a stand-in 1 would turn a yes/no crate numeric at the checker".
 * @param {{label?:*, value?:*, data?:object}} item  an engine item (or a crate spec)
 * @returns {{present:false}|{present:true, kind:'class'|'number', value:string|number}}
 */
function referenceFor(item) {
  const d = (item && item.data) || {};
  if (d.reference && typeof d.reference === 'object') return Session.validateReference(d.reference);
  const label = item ? item.label : undefined;
  if (typeof label !== 'string') return Session.noAnswer();
  if (Number.isFinite(item.value) && label === String(item.value)) return Session.answer('number', item.value);
  return label === '' ? Session.noAnswer() : Session.answer('class', label);
}

/**
 * The CHECKER swallows a crate and OPENS it: the machine's guess (item.lastReading, stamped by
 * the last sense that read it) against the crate's REFERENCE ANSWER (referenceFor, above).
 *   verdict  'unsure' — nothing ever read it (or every reader was below its sure line);
 *            'unscorable' — the crate carries no reference answer, whatever the Model said;
 *            'right'  — guess === the word, or |guess − the number| ≤ the allowance;
 *            'wrong'  — otherwise.
 *   cell     TP/FP/TN/FN for yes-no crates (item.data.yes names the positive label), else null —
 *            the vocabulary of evaluation, per crate, so the Tally can add it up.
 *   studied  item.data.studied — was this crate in the rows the machine studied? The Tally
 *            scores studied and new crates apart: that gap IS train-vs-test.
 *   pile     item.data.pass.pile when the crate rode out on an act (Plan 2, spec §7), else null —
 *            what checkerSummary keys its columns by; a legacy `studied` stamp still decides when
 *            there is no pass at all.
 * A crate wearing a LEARN pass never reaches any of the above — it is filed, not scored; see the
 * early return just below (spec §6, "no guesses, no score").
 * Testing a pile AGAIN replaces that pile's rows in the log rather than adding to them (the
 * `answered` bookkeeping near the end): dials are live mid-run, so the second attempt is a
 * different model and mixing the two means nothing. See the block comment there.
 * Signals: right/wrong/unsure (label = truth, value = running count), error (numeric only,
 * value = |guess − truth|). Nothing here reads a shelf; the truth rode in on the crate.
 * An UNSCORABLE crate fires NO verdict signal: those four ports are this block's whole declared
 * vocabulary (OUT_PORTS.checker), and a crate with no answer key has no verdict to announce —
 * the same abstention `filed` and `unread` already make. It IS logged, so the coverage it costs
 * stays readable (checkerSummary's `unscorable`) instead of vanishing.
 *
 * THE VERDICT RULE LIVES IN evaluation-record.js `grade` (ruling R11) — this function resolves
 * WHAT was read and WHICH allowance applies and asks the one owner. The four divergences the P2b
 * review recorded between this Checker and `grade` are reconciled here, each at its own line.
 */
function swallowChecked(run, item, target, events, queued) {
  const s = run.blocks[target.id];
  const d = item.data || {};
  // A LEARN-pass crate is on its way to the shelves, not to a verdict (spec §6: "Teach it — no
  // guesses, no score"). The Evaluator swallows it and counts it FILED — never into the scored
  // log, so every tally, picture and per-verdict signal keeps meaning "crates that were actually
  // graded". Without this, a teach act would fill the Tally with 29 false "not sure"s.
  if (d.pass && d.pass.mode === 'learn') {
    if (d.libraryTrainingRefused && !d.studied) {
      s.unread += 1;
      item.trail.push({ block: target.id, type: 'checker', tick: run.tick, verdict: null, unread: true });
      run.items.splice(run.items.indexOf(item), 1);
      events.push(terminalEvent(run, item, { t: 'swallow', bin: target.id, item: item.id, verdict: 'unread' }));
      return;
    }
    s.filed += 1;
    item.trail.push({ block: target.id, type: 'checker', tick: run.tick, verdict: null, filed: true });
    run.items.splice(run.items.indexOf(item), 1);
    events.push(terminalEvent(run, item, { t: 'swallow', bin: target.id, item: item.id, verdict: 'filed' }));
    return;
  }
  const reference = referenceFor(item);
  const numeric = reference.present && reference.kind === 'number';
  const guess = item.lastReading ? item.lastReading.label : null;
  // NOTHING EVER READ IT (Plan 2 fix round; vision-breaker 2026-09-02 finding 4). "Test what it
  // studied" pressed on an untaught model deals a whole pile past a Model that returns null —
  // the EMIT loop `continue`s before it can even push a trail step — and every crate landed here
  // as a scored `unsure`. That poisoned the column for the session: 29 ghosts in the count, and a
  // percentage (right/(right+wrong)) that silently excluded them, so the lane read "Training 58 —
  // 93 %" about 29 judged rows. A crate no model spoke about is not evidence ABOUT the model; it
  // is a question nobody answered. Counted as `unread` (the host says so on the status line) and
  // kept out of the log, so the count and the percentage always describe the same rows.
  // SCOPED TO THE ACT on purpose: only a crate riding an ANSWER pass. A machine with no Splitter
  // (every latch-gate lab, every hand-built table) keeps the old `unsure` verdict exactly — a
  // silent sense there is the child's own wiring to reason about, and three suites pin it.
  const readAtAll = (item.trail || []).some((st) => st.type === 'sense');
  if ((guess === null || guess === undefined) && !readAtAll && d.pass && d.pass.mode === 'answer') {
    s.unread += 1;
    item.trail.push({ block: target.id, type: 'checker', tick: run.tick, verdict: null, unread: true });
    run.items.splice(run.items.indexOf(item), 1);
    events.push(terminalEvent(run, item, { t: 'swallow', bin: target.id, item: item.id, verdict: 'unread' }));
    return;
  }
  // RECONCILIATION 4 — WHICH ALLOWANCE. The engine resolves it, per crate; `grade` applies it.
  // The plate's own dial wins when it is a real number (hand-set or wired); otherwise the crate's
  // stamped tolerance, exactly as before — absent-safe either way (task 4: a hidden number
  // deciding verdicts is the channel the connection law kills). An evaluation RECORD carries ONE
  // tolerance for a whole run and is right to: it freezes one measurement. A live belt is not one
  // measurement — the dial is live mid-run and two Files blocks may feed one Evaluator — so the
  // engine keeps its per-crate resolution and hands the resolved number to the one owner. The
  // number that graded the row is written into the log below, so a reader can SEE when two rows
  // were graded by two different allowances instead of having to assume they were not.
  // Floored at 0 because a negative allowance is not an allowance: `grade` refuses one (it would
  // throw mid-tick), and the old `error <= -5` silently made every row wrong with nothing on the
  // face to explain it.
  const tolerance = numeric
    ? Math.max(0, Number.isFinite(s.dials && s.dials.tolerance) ? s.dials.tolerance : (Number.isFinite(d.tolerance) ? d.tolerance : 0))
    : null;
  // RECONCILIATION 2 — A NULL GUESS IS NOT AN ANSWER OF NULL. `item.lastReading` is absent when
  // nothing read the crate or every reader stayed below its sure line; that is a reading STATUS,
  // not a guess. Said in evaluation-record.js's own vocabulary it is `{status:'unsure'}`, which
  // `grade` answers 'unsure' — the engine's established verdict, unchanged. (P2b's ledger paired
  // it with `{status:'answered', guess:null}`, a reading this engine cannot produce.) The
  // `unread` arm above stays an early return: it is ROUTING, not a verdict — the crate never
  // enters the scored log — and `grade({status:'unread'})` agrees with the word it uses.
  const reading = item.lastReading ? { status: 'answered', guess } : { status: 'unsure' };
  // RECONCILIATIONS 1 and 3 arrive with `grade`: a BLANK guess on a number answer is wrong (the
  // engine's `Number('')` read it as 0, so a crate whose answer IS 0 scored RIGHT for an empty
  // answer), and an UNREADABLE number records NO error rather than Infinity (Infinity is not a
  // distance; every reader downstream already filtered it out with Number.isFinite, and it
  // JSON-serialises to null wherever a log row is saved). The verdict for both stays 'wrong'.
  const graded = Record.grade(reading, reference, numeric ? { tolerance } : undefined);
  const verdict = graded.verdict, error = graded.error;
  let cell = null;
  // A crate with no answer key has no positive class to be TP/FP/TN/FN about either.
  if (!numeric && reference.present && d.yes !== undefined && guess !== null && guess !== undefined) {
    const truthYes = reference.value === d.yes, guessYes = guess === d.yes;
    cell = guessYes ? (truthYes ? 'TP' : 'FP') : (truthYes ? 'FN' : 'TN');
  }
  s.count += 1;
  s[verdict] += 1;
  // A Checker placed ANYWHERE scores what the trail says was decided up to that point -- which
  // is how a child scores model A and model B separately, with no new block (spec §5.6).
  item.trail.push({ block: target.id, type: 'checker', tick: run.tick, verdict, cell, error });
  // THE COLUMN IS REPLACED, NOT APPENDED TO (whole-branch review CRITICAL 1). The Lab's defining
  // gesture is "turn the dial, test again" — and dials are LIVE mid-run, so the second pass is a
  // different model. Appending summed two models into one meaningless mean over a count double
  // the pile: measured 3.57 then 3.92 per pass, shown as 3.74 over 20 rows for a 10-row pile.
  // The Evaluator's job is to show what the model does NOW; charting attempts against each other
  // is the Board's (Plan 3, spec §3).
  //   `seq` rides the crate, so this is decided ENTIRELY from what came down the wire — never by
  // reaching back at the Splitter that dealt it, which would have to guess which Evaluators are
  // downstream. A crate from a SUPERSEDED attempt (still riding the belt when the next pass's
  // crates started landing) is scored and signalled exactly as before but kept OUT of the log:
  // it is a fact about a model that no longer exists.
  const pSeq = d.pass && d.pass.mode === 'answer' && Number.isFinite(d.pass.seq) ? d.pass.seq : null;
  if (pSeq !== null) {
    const seen = s.answered[d.pass.pile];
    if (seen === undefined || pSeq > seen) {
      s.answered[d.pass.pile] = pSeq;
      // Spliced in place, never reassigned: the floor's RAF loop and the host both hold `s.log`
      // by reference between frames.
      for (let i = s.log.length - 1; i >= 0; i--) if (s.log[i].pile === d.pass.pile) s.log.splice(i, 1);
    } else if (pSeq < seen) {
      run.items.splice(run.items.indexOf(item), 1);
      events.push(terminalEvent(run, item, { t: 'swallow', bin: target.id, item: item.id, verdict }, {reading,tolerance,superseded:true}));
      if (verdict !== 'unscorable') queued.push({ from: target.id + ':' + verdict, label: item.label, value: s[verdict] });
      // The straggler MUST carry its pass too — a straggler belongs to its OWN act's aggregate on
      // the Board (Plan 3, spec §3/§10); the Board's whole point is keeping the attempt history
      // this very branch splices out of the checker's own log.
      if (error !== null && Number.isFinite(error)) queued.push({ from: target.id + ':error', label: item.label, value: error, data: { pass: d.pass || null } });
      return;
    }
  }
  // `reference` and `tolerance` ride the row (task 108): the row's own account of WHAT it was
  // graded against and BY WHICH allowance, so a reader never has to re-derive either — and an
  // ungradeable row says why in the row instead of looking like a failure.
  s.log.push({ tick: run.tick, itemId: item.id, label: item.label, face: d.tag !== undefined ? String(d.tag) : '', lastReading: item.lastReading, via: item.via || null, trail: item.trail.slice(), verdict, cell, error, reference, tolerance, studied: !!d.studied, pile: (d.pass && d.pass.pile) || null });
  run.items.splice(run.items.indexOf(item), 1);
  events.push(terminalEvent(run, item, { t: 'swallow', bin: target.id, item: item.id, verdict }, {reading,tolerance}));
  if (verdict !== 'unscorable') queued.push({ from: target.id + ':' + verdict, label: item.label, value: s[verdict] });
  if (error !== null && Number.isFinite(error)) queued.push({ from: target.id + ':error', label: item.label, value: error, data: { pass: d.pass || null } });
}

/**
 * The Tally's numbers for one checker: studied crates and new (fresh) crates scored apart.
 *
 * WHY THIS STAYS ITS OWN COUNTER (ruling R11, weighed for task 108). evaluation-record.js owns the
 * VERDICT RULE and swallowChecked now asks it for every crate — so there is exactly one place that
 * decides right/wrong/unsure/unscorable. This function does not decide anything: it ADDS UP the
 * verdicts already in the log, split by the population each crate belongs to. Its shape is the
 * live belt's, not a frozen record's: three columns keyed by pile (studied / held-out / sealed
 * exam), TP/FP/TN/FN cells, a mean error — and it is recomputed inside the floor's RAF loop, for
 * a log whose row ids are engine counters and which may legitimately mix a class Files block and a
 * number one on one Evaluator. `Record.summarize` refuses all three (opaque handles, one answer
 * kind per evaluation) and computes per-class rows and macro-F1 no belt face draws. Two
 * PROJECTIONS of one rule is not two owners; one rule in two places would be.
 * @returns {{studied: Column, fresh: Column, exam: Column}} Column = {n, right, wrong, unsure, unscorable, cells:{TP,FP,TN,FN}, meanError|null}
 *   `n` is every row in the column (Record.summarize's `total`); `right + wrong` is the accuracy
 *   denominator, and `unscorable` is outside it — a crate with no answer key is neither.
 */
function checkerSummary(run, id) {
  const s = run.blocks[id];
  if (!s || !Array.isArray(s.log)) fail(`checkerSummary: "${id}" is not a checker`);
  const col = () => ({ n: 0, right: 0, wrong: 0, unsure: 0, unscorable: 0, cells: { TP: 0, FP: 0, TN: 0, FN: 0 }, meanError: null });
  const out = { studied: col(), fresh: col(), exam: col() };
  const errs = { studied: [], fresh: [], exam: [] };
  for (const e of s.log) {
    // The pass named the pile when there was one (the acts, Plan 2); the legacy studied stamp
    // still decides for latch-gate machines. Training scores under Studied, Validation under
    // Held-out, and the sealed Test pile in its OWN column — one number, kept apart from the
    // two the child tinkers against (spec §8, §12). `exam` stays empty for every machine that
    // never opens it, which is every machine until a teacher asks.
    const key = e.pile === 'training' ? 'studied'
      : e.pile === 'validation' ? 'fresh'
      : e.pile === 'test' ? 'exam'
      : (e.studied ? 'studied' : 'fresh');
    const c = out[key];
    c.n += 1;
    c[e.verdict] += 1;
    if (e.cell) c.cells[e.cell] += 1;
    if (e.error !== null && Number.isFinite(e.error)) errs[key].push(e.error);
  }
  for (const key of ['studied', 'fresh', 'exam']) {
    if (errs[key].length) out[key].meanError = Math.round((errs[key].reduce((a, b) => a + b, 0) / errs[key].length) * 100) / 100;
  }
  return out;
}

/**
 * The Board's points for THIS run: one per answer act, seq-ascending. y = mean |error| so
 * far — a still-scoring act's point moves until its crates stop landing; the child watches
 * it find its level. Cross-run points are the piece's (p.charts), merged by the host.
 *
 * `watching` is the Board's CURRENT pick (for the picker/caption to read) — it is NOT what any
 * one point should be filed under; each point carries its OWN `watch` for that (fix round 1, the
 * mixed-chart honesty bug, spec §3): a run that spans two watched dials must let a reader (the
 * host's commit, floor.js's live merge) split points by where each one ACTUALLY came from, not by
 * whatever the Board happens to be watching by the time the points are read back.
 *
 * `heard` (fix round 2, the relay-watch lie): how many signals reached `watch` this run carrying
 * NO usable pass — a relay's (window/counter/timer) own re-emission, always, since it speaks its
 * OWN derived value rather than passing the original crate's pass metadata through. `heard > 0`
 * with `points` still empty is the honest signature of "something is arriving, but none of it is
 * a test this Board can chart" — the floor face reads it to stop inviting a test that has already
 * happened (board.noAct), never to fabricate a point (there is no legitimate x behind it).
 * @returns {{watching:{block:string,dial:string}|null, points:Array<{seq:number,pile:string,x:(number|null),y:number,n:number,watch:({block:string,dial:string}|null)}>, heard:number}}
 */
function boardView(run, id) {
  const b = run.byId[id]; const s = run.blocks[id];
  if (!b || b.type !== 'board' || !s) fail(`boardView: "${id}" is not a board`);
  const watching = b.watchBlock && b.watchDial ? { block: b.watchBlock, dial: b.watchDial } : null;
  const points = Object.keys(s.acts).map(Number).sort((x, y) => x - y).map((seq) => {
    const act = s.acts[seq];
    return { seq, pile: act.pile, x: act.x, y: Math.round((act.sum / act.n) * 100) / 100, n: act.n, watch: act.watch || null };
  });
  return { watching, points, heard: s.heard || 0 };
}

/**
 * Dial writes clamp only where zero would break physics (rates, sizes) — or where an accepted
 * value would make the block's picture and its behaviour disagree (the splitter, below).
 * @param {string} type   the block's type
 * @param {string} name   the dial
 * @param {number} value  what is being written
 * @param {object} [dials]  the block's OTHER dials, when one dial is bounded by another
 * @returns {number} the value the block will actually wear
 */
function clampDial(type, name, value, dials) {
  if (type === 'join' && name === 'seconds') return Math.max(.1,Math.min(60,value));
  // THE SPLITTER'S TWO SHARES are percentages of one whole, so neither is bounded alone: the
  // pair must always be feasible, or the plate, the bar and the machine tell three different
  // stories (whole-branch review Minor 4 — Training 90 + Validation 50 read 50 on the plate,
  // drew 90/10/0 on the bar and dealt 9/1/0). Each share is therefore capped at what the OTHER
  // leaves, so the stored pair can never sum past 100 and every reader lands on one answer.
  // Whole percent, because that is what the bar's own drag writes (floor-layout barDrop).
  if (type === 'splitter' && (name === 'training' || name === 'validation')) {
    const sib = dials && Number(dials[name === 'training' ? 'validation' : 'training']);
    const room = 100 - (Number.isFinite(sib) ? Math.max(0, Math.min(100, Math.round(sib))) : 0);
    const v = Number.isFinite(value) ? Math.round(value) : 0;
    return Math.max(0, Math.min(room, v));
  }
  if (name === 'speed') return Math.max(1, Math.min(TICK_HZ, value)); // 1..10 cells/s — see ticksPerCell
  if (['rate', 'speed', 'n', 'seconds', 'q'].includes(name)) {
    if (type === 'filter' && name === 'n') return value; // filter threshold may be any number
    // Sub-second blinks are legal, but only DOWN TO the floor `lamp:on` will actually honour:
    // it lights for max(LAMP_MIN_LIT, seconds*TICK_HZ) ticks, so anything under LAMP_MIN_LIT/TICK_HZ
    // (0.4 s) lit for exactly the same 4 ticks. The dial accepted 0.1/0.2/0.3/0.4 as four different
    // settings and gave one outcome — a dead zone the child could turn with no effect, and a dial
    // that read back a value the machine never obeyed. Clamping HERE keeps the accepted range and
    // the effective range the same number (owner 2026-08-20; findings-dials.md Finding 3).
    if (type === 'lamp' && name === 'seconds') return Math.max(LAMP_MIN_LIT / TICK_HZ, value);
    return Math.max(1, value);
  }
  if (name === 'budget') return Math.max(0, Math.round(value));
  if (name === 'penalty') return Math.max(0, Math.min(1, value)); // ridge λ scale — 0 = no penalty
  // degree = the curve dial (Task C): 1..3, an integer — brains/line.js's own clampDegree() would
  // catch an out-of-range value too, but a dial's WRITE clamps the same as every other one here so
  // `state.run.blocks[id].dials.degree` never reads back something the child never actually set.
  if (name === 'degree') return Math.max(1, Math.min(3, Math.round(value)));
  // `every` (the camera's capture clock) was missing from every other dial's clamp (whole-branch
  // review Minor 11): cameraRunTick tests `now - camLast >= every * 1000`, so a wire setting it
  // negative makes that always true — a capture on every tick, the exact firehose
  // recycle-cam-browser.test.js's OWN firehose guard exists to catch, just reached by a dial
  // instead of a clock bug. 0 stays legal (the documented "off" value); only negative is refused.
  if (name === 'every') return Math.max(0, value);
  return value;
}

/** UI/test helper: is this lamp lit right now? */
function isLampLit(run, id) {
  return run.blocks[id].litUntil >= run.tick;
}

// clampDial is exported so the PLATE writes the same answer a wire does — the splitter's two
// shares are bounded by each other, and a plate that skipped the clamp was the fourth story
// (whole-branch review Minor 4).
const WorkshopEngine = { TICK_HZ, ROUTING_CAPACITY, createRun, tick, activeFlows, isLampLit, checkerSummary, referenceFor, sourceReferenceFor, boardView, pileFor, clampDial, chanceFaceLabel, carmakerDialDefs };
if (typeof module !== 'undefined' && module.exports) module.exports = WorkshopEngine;
if (typeof window !== 'undefined') window.WorkshopEngine = WorkshopEngine;
