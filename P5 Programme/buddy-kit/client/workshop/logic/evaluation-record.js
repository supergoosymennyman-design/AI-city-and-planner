(function () {
  'use strict';
  /**
   * evaluation-record.js — grading and the FROZEN evaluation snapshot (private learning loop plan
   * §3 "Evaluation identity and reference truth", task P2a; task 113 slice). Ruling R11: in
   * product code THIS file owns outcome counts, coverage and per-class outcomes.
   *
   * ONE ITEM, ONE OUTCOME. A reading (`{status:'answered'|'unsure'|'unread'|'error', guess}`) meets
   * the item's reference answer (private-session.js's presence contract, ruling R5) and becomes an
   * outcome `{id, status, guess, reference, verdict, error}`:
   * - no reference answer → verdict `unscorable`, whatever the Model said (the guess is kept for
   *   inspection, never graded — a legacy Files photo crate graded as a WRONG number is the very
   *   bug this closes: P1 evidence §7 gap 2);
   * - unanswered → the reading status is the verdict (unsure / unread / error), kept apart;
   * - a class answer is right when the guess equals the word exactly ('' included);
   * - a number answer is right when |guess − answer| ≤ tolerance (0 included; an unreadable guess
   *   is wrong with no error, the engine's own rule minus its Number('') === 0 trap).
   *
   * THE SUMMARY reports total, answered, unsure, unread, unscorable and errors SEPARATELY (they
   * partition `total`; unscorable items are outside every rate), coverage = answered / scorable,
   * accuracy among answered AND over all scorable items, and per-class outcomes. Per class c:
   * support = scorable items whose answer is c; predicted = answered items whose guess is c;
   * right = TP; wrong = items of c answered with another class; unsure/unread/errors = items of c
   * the Model did not answer; falsePositives = predicted − right; precision = TP / predicted;
   * recall = TP / support; F1 = 2TP / (2TP + FP + FN) with FN = support − TP, so an abstention on
   * an item of c counts against c. ROWS AND THE MACRO AVERAGE RANGE OVER THE UNION of the classes
   * in the reference answers and the classes the Model answered: a class the Model claimed that no
   * evaluated item carries is a row with F1 0, not nothing (the P1 review found averaging over
   * reference classes only treated such classes asymmetrically; this is also sklearn's macro
   * default). A class the host lists (`opts.classes`) that has neither support nor a prediction is
   * shown with every rate unavailable and is NOT averaged. Any zero denominator is null —
   * "unavailable", never 0 or 100 %. Number answers keep meanAbsoluteError (over answered items
   * with a readable number) and the tolerance used. Nothing is rounded here; display rounds.
   *
   * THE SNAPSHOT (`record`) names exactly what produced a result: collection id + membership
   * revision + label revision, the split manifest revision and pile, the training ids (the
   * manifest's training pile, or the host's stated subset of it), the learner (extractor, brain,
   * brain version, every decision-changing setting and their canonical revision), the seed, the
   * evaluated ids and one outcome per id. It is frozen, session-only and bounded by the host's
   * `limits.outcomes`; it holds ids, verdicts and reference values, never payloads. It refuses a
   * manifest that is not pinned to the collection as it is now: editing examples or correcting a
   * label first makes a new manifest revision, so an old test claim can never be silently reissued
   * as the new one. `status` tells whether a snapshot is still current; `compare` says whether two
   * snapshots are about identical evaluated items (ids, labels AND content — `evaluatedKey`, the
   * content identity of the evaluated items: an id that came back naming another photo is not
   * the same measurement, fix round 2) under the same tolerance (tuning on Validation), and what
   * legitimately differs.
   *
   * EXISTING EQUIVALENTS CHECKED (plan §2):
   * - logic/engine.js `checkerSummary`: the Tally's LIVE columns per pile (n, right, wrong,
   *   unsure, cells, meanError) over the checker's log, replaced act by act; no identity, no
   *   unscorable, no coverage or per-class rows. The per-item verdict rule there (tolerance for a
   *   number, exact word otherwise) is mirrored by `grade` plus `unscorable`; P4 routes the
   *   engine's Checker through the same presence meaning.
   * - logic/model-library.js `evaluate`: `{testIds, right, total, predictions}` for a library
   *   model on public rows — the precedent for "which ids, which model" that this generalises.
   * - logic/board.js: cross-run points keyed by a MACHINE fingerprint; different axis.
   * - logic/brain-lab.js: one frozen investigation, no revision identity.
   * - scripts/probe-workshop-local-learning.mjs `scoreOutcomes`: identical per-class math; the
   *   probe now imports `summarize` and keeps only its predeclared macro (reference classes only).
   *
   * Load order: after logic/private-session.js (P2b wires index.html).
   * Globals: window.WorkshopEvaluationRecord. CommonJS-exported for node --test.
   */
  const Session = typeof require === 'function' ? require('./private-session.js') : window.WorkshopPrivateSession;

  /** Every status a reading can end in; only 'answered' carries a guess. */
  const STATUSES = Object.freeze(['answered', 'unsure', 'unread', 'error']);
  /** Every verdict an outcome can carry. */
  const VERDICTS = Object.freeze(['right', 'wrong', 'unsure', 'unread', 'error', 'unscorable']);
  /** The summary rates `compare` reports deltas for. */
  const RATES = Object.freeze(['coverage', 'accuracyAnswered', 'accuracyAll', 'macroF1', 'meanAbsoluteError']);

  function fail(message, details) {
    const err = new Error(message);
    if (details !== undefined) err.details = details;
    throw err;
  }
  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const key of Object.keys(value)) freeze(value[key]);
    }
    return value;
  }
  const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const sorted = (arr) => arr.slice().sort();
  const unique = (arr) => [...new Set(arr)];
  const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  const ratio = (a, b) => (b > 0 ? a / b : null);
  const refusal = (code, details) => freeze({ ok: false, refusal: Object.assign({ code }, details) });

  // ------------------------------------------------------------------ grading
  function checkReading(reading) {
    if (!isObject(reading) || !STATUSES.includes(reading.status)) fail('A reading has a status: answered, unsure, unread or error.');
    if (reading.status === 'answered' && reading.guess === undefined) fail('An answered reading needs a guess.');
    return reading;
  }
  /** A finite number from a numeric guess; a number-like string is read, a blank one is NOT zero. */
  function numberOf(guess) {
    if (typeof guess === 'number') return Number.isFinite(guess) ? guess : null;
    if (typeof guess === 'string' && guess.trim() !== '') {
      const n = Number(guess);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  }
  function toleranceOf(opts) {
    const t = opts && opts.tolerance;
    if (t === undefined || t === null) return 0;
    if (!(typeof t === 'number' && Number.isFinite(t) && t >= 0)) fail('A tolerance is a finite number of at least 0.');
    return t;
  }
  /**
   * Grade one reading against one reference answer.
   * @param {{status:string, guess?:*}} reading
   * @param {object} reference  private-session.js's presence shape
   * @param {{tolerance?:number}} [opts]  number answers only; default 0 (exact)
   * @returns {{verdict:string, error:number|null}}  error = |guess − answer| for a readable number guess
   */
  function grade(reading, reference, opts) {
    checkReading(reading);
    const ref = Session.validateReference(reference);
    const tolerance = toleranceOf(opts);
    if (!ref.present) return { verdict: 'unscorable', error: null };
    if (reading.status !== 'answered') return { verdict: reading.status, error: null };
    if (ref.kind === 'class') return { verdict: reading.guess === ref.value ? 'right' : 'wrong', error: null };
    const g = numberOf(reading.guess);
    if (g === null) return { verdict: 'wrong', error: null };
    const error = Math.abs(g - ref.value);
    return { verdict: error <= tolerance ? 'right' : 'wrong', error };
  }
  /**
   * One graded, frozen outcome. `guess` is kept even when the item is unscorable (inspection
   * shows it; nothing grades it). An outcome on a number answer records the tolerance that graded
   * it (a live Checker dial: two tolerances are two gradings, not two Models — fix round 1);
   * every other outcome carries null.
   * @returns {{id:string, status:string, guess:*, reference:object, verdict:string, error:number|null, tolerance:number|null}}
   */
  function outcome(id, reading, reference, opts) {
    const ref = Session.validateReference(reference);
    const g = grade(reading, ref, opts);
    return freeze({ id: Session.checkHandle(id, 'An outcome id'), status: reading.status, guess: reading.status === 'answered' ? reading.guess : null,
      reference: ref, verdict: g.verdict, error: g.error, tolerance: ref.present && ref.kind === 'number' ? toleranceOf(opts) : null });
  }
  /** Shape and internal consistency of an outcome, so counts can never disagree with verdicts. */
  function checkOutcome(out) {
    if (!isObject(out)) fail('An outcome must be an object.');
    Session.checkHandle(out.id, 'An outcome id');
    if (!STATUSES.includes(out.status)) fail('An outcome status is answered, unsure, unread or error.');
    if (!VERDICTS.includes(out.verdict)) fail('Unknown outcome verdict: ' + String(out.verdict));
    const ref = Session.validateReference(out.reference);
    if (!ref.present && out.verdict !== 'unscorable') fail('An outcome with no reference answer must be unscorable.');
    if (ref.present && out.verdict === 'unscorable') fail('An outcome with a reference answer cannot be unscorable.');
    if (ref.present && out.status !== 'answered' && out.verdict !== out.status) fail('An unanswered outcome keeps its reading status as its verdict.');
    if (ref.present && out.status === 'answered' && out.verdict !== 'right' && out.verdict !== 'wrong') fail('An answered, scorable outcome is right or wrong.');
    if (out.status === 'answered' && out.guess === undefined) fail('An answered outcome needs a guess.');
    if (!(out.error === null || out.error === undefined || (typeof out.error === 'number' && Number.isFinite(out.error) && out.error >= 0))) fail('An outcome error is null or a finite number of at least 0.');
    const numberAnswer = ref.present && ref.kind === 'number';
    if (numberAnswer && !(typeof out.tolerance === 'number' && Number.isFinite(out.tolerance) && out.tolerance >= 0)) fail('An outcome on a number answer records the tolerance that graded it.');
    if (!numberAnswer && !(out.tolerance === null || out.tolerance === undefined)) fail('Only an outcome on a number answer carries a tolerance.');
    const expected = grade(out, ref, { tolerance: out.tolerance });
    if (out.verdict !== expected.verdict || (out.error === undefined ? null : out.error) !== expected.error) fail('An outcome must match the grading of its reading, reference and tolerance.');
    return ref;
  }

  // ------------------------------------------------------------------ the summary (R11)
  /**
   * Count outcomes. See the header for every definition. The `tolerance` reported is the one
   * that graded the number outcomes (read from them, never from an option): one evaluation
   * grades every number answer with one tolerance, or it is not one evaluation.
   * @param {Array<object>} outcomes  from `outcome()`
   * @param {{classes?:string[], kind?:'class'|'number'}} [opts]  `classes`: rows to show even without
   *   evidence; `kind`: expected answer kind (checked against the outcomes)
   * @returns {{kind:string|null, total:number, scorable:number, unscorable:number, answered:number, unsure:number,
   *   unread:number, errors:number, right:number, wrong:number, coverage:number|null, accuracyAnswered:number|null,
   *   accuracyAll:number|null, perClass:object|null, macroF1:number|null, meanAbsoluteError:number|null, tolerance:number|null}}
   */
  function summarize(outcomes, opts) {
    if (!Array.isArray(outcomes)) fail('summarize needs an array of outcomes.');
    const o = opts || {};
    if (o.tolerance !== undefined) fail('summarize reads the tolerance from the outcomes; pass it to grade, outcome or record.');
    let kind = o.kind === undefined ? null : o.kind;
    let tolerance = null;
    if (kind !== null && !Session.ANSWER_KINDS.includes(kind)) fail('The expected answer kind is class or number.');
    const s = { kind: null, total: 0, scorable: 0, unscorable: 0, answered: 0, unsure: 0, unread: 0, errors: 0, right: 0, wrong: 0 };
    const per = new Map();
    const row = (label) => {
      if (!per.has(label)) per.set(label, { support: 0, predicted: 0, right: 0, wrong: 0, unsure: 0, unread: 0, errors: 0 });
      return per.get(label);
    };
    for (const label of o.classes || []) {
      if (typeof label !== 'string') fail('Listed classes must be strings.');
      row(label);
      if (kind === null) kind = 'class'; // listing classes says what kind of answers these are
    }
    const errors = [];
    for (const out of outcomes) {
      const ref = checkOutcome(out);
      s.total += 1;
      if (!ref.present) { s.unscorable += 1; continue; }
      if (kind === null) kind = ref.kind;
      else if (kind !== ref.kind) fail('One evaluation cannot mix class and number reference answers.');
      s.scorable += 1;
      const bucket = out.status === 'error' ? 'errors' : out.status;
      s[bucket] += 1;
      if (out.status === 'answered') s[out.verdict] += 1;
      if (kind === 'class') {
        const truth = row(ref.value);
        truth.support += 1;
        if (out.status === 'answered') {
          truth[out.verdict] += 1;
          // A guess that is not a word (a number brain on a class collection) is wrong for its
          // truth's row but names no class to be counted as predicted.
          if (typeof out.guess === 'string') row(out.guess).predicted += 1;
        } else truth[bucket] += 1;
      } else {
        if (tolerance === null) tolerance = out.tolerance;
        else if (tolerance !== out.tolerance) fail('One evaluation grades every number answer with one tolerance.');
        if (out.status === 'answered' && typeof out.error === 'number') errors.push(out.error);
      }
    }
    const summary = Object.assign(s, { kind, coverage: ratio(s.answered, s.scorable), accuracyAnswered: ratio(s.right, s.answered), accuracyAll: ratio(s.right, s.scorable),
      perClass: null, macroF1: null, meanAbsoluteError: null, tolerance: null });
    if (kind === 'class') {
      const perClass = {};
      const f1s = [];
      for (const label of [...per.keys()].sort()) {
        const c = per.get(label);
        const tp = c.right, fp = c.predicted - c.right, fn = c.support - c.right;
        const denominator = 2 * tp + fp + fn;
        const f1 = denominator > 0 ? (2 * tp) / denominator : null;
        if (f1 !== null) f1s.push(f1);
        Object.defineProperty(perClass, label, { value: Object.assign({}, c, { falsePositives: fp, precision: ratio(tp, c.predicted), recall: ratio(tp, c.support), f1 }), enumerable: true, writable: true, configurable: true });
      }
      summary.perClass = perClass;
      summary.macroF1 = f1s.length ? f1s.reduce((a, b) => a + b, 0) / f1s.length : null;
    } else if (kind === 'number') {
      summary.meanAbsoluteError = errors.length ? errors.reduce((a, b) => a + b, 0) / errors.length : null;
      summary.tolerance = tolerance;
    }
    return freeze(summary);
  }

  // ------------------------------------------------------------------ the snapshot
  function checkIds(list, what) {
    if (!Array.isArray(list)) fail(what + ' must be an array of item ids.');
    return sorted(unique(list.map((id) => Session.checkHandle(id, what + ' id'))));
  }
  /**
   * Freeze one evaluation run.
   * @param {{id:string, collection:object, manifest:object, pile:'training'|'validation'|'test', evaluated?:string[],
   *   training?:{ids:string[]}, learner:{extractor:string, brain:string, brainVersion?:string, settings:object},
   *   seed?:number|null, readings:Array<{id:string, status:string, guess?:*}>, tolerance?:number, limits:{outcomes:number}}} spec
   *   `evaluated` defaults to the whole pile; `training.ids` defaults to the whole training pile;
   *   `readings` must cover exactly the evaluated ids, one each.
   * @returns {{ok:true, snapshot:object} | {ok:false, refusal:{code:'wrong-collection'|'manifest-stale'|'extractor-mismatch'
   *   |'training-outside-pile'|'outcomes-limit', ...}}}
   */
  function record(spec) {
    if (!isObject(spec)) fail('record needs a spec object.');
    const id = Session.checkHandle(spec.id, 'An evaluation id');
    const collection = spec.collection, manifest = spec.manifest;
    if (!isObject(collection) || !Array.isArray(collection.items)) fail('record needs the collection.');
    if (!isObject(manifest) || !isObject(manifest.piles)) fail('record needs the split manifest.');
    if (!Session.PILES.includes(spec.pile)) fail('record needs the evaluated pile: training, validation or test.');
    if (!isObject(spec.limits) || !(Number.isInteger(spec.limits.outcomes) && spec.limits.outcomes >= 0)) fail('record needs the host\'s limits: {outcomes} (the most per-item outcomes one snapshot may hold).');
    if (!Array.isArray(spec.readings)) fail('record needs the readings.');
    const seed = spec.seed === undefined || spec.seed === null ? null : spec.seed;
    if (seed !== null && !Number.isInteger(seed)) fail('A seed is an integer or null.');
    if (manifest.collectionId !== collection.id) return refusal('wrong-collection', { expected: manifest.collectionId, found: collection.id });
    const state = Session.manifestStatus(manifest, collection);
    if (!state.current) return refusal('manifest-stale', { reasons: state.reasons, added: state.added.length, removed: state.removed.length, replaced: state.replaced.length, relabelled: state.relabelled.length });
    if (!isObject(spec.learner)) fail('record needs the learner: {extractor, brain, brainVersion?, settings}.');
    const learnerRevision = Session.learnerRevision(spec.learner);
    if (spec.learner.extractor !== collection.extractor) return refusal('extractor-mismatch', { expected: collection.extractor, found: spec.learner.extractor });
    const m = Session.membership(manifest, collection);
    const pileIds = new Set(m[spec.pile]);
    const evaluated = spec.evaluated === undefined ? m[spec.pile] : checkIds(spec.evaluated, 'evaluated');
    for (const eid of evaluated) if (!pileIds.has(eid)) fail('An evaluated id is not in the evaluated pile.', { pile: spec.pile });
    let training = m.training;
    if (spec.training !== undefined) {
      if (!isObject(spec.training)) fail('training must be {ids}.');
      training = checkIds(spec.training.ids, 'training');
      const trainingPile = new Set(m.training);
      const outside = training.filter((t) => !trainingPile.has(t));
      if (outside.length) return refusal('training-outside-pile', { ids: outside });
    }
    // No separate leak check: training ids are a subset of the training pile and a manifest holds
    // every id in exactly one pile (private-session.js refuses item-in-two-piles and group-split),
    // so an evaluated Validation/Test id can never also be a training id here.
    if (evaluated.length > spec.limits.outcomes) return refusal('outcomes-limit', { limit: spec.limits.outcomes, count: evaluated.length });
    const readings = new Map();
    for (const r of spec.readings) {
      if (!isObject(r)) fail('A reading is {id, status, guess}.');
      const rid = Session.checkHandle(r.id, 'A reading id');
      if (readings.has(rid)) fail('Two readings name the same item.');
      readings.set(rid, r);
    }
    if (readings.size !== evaluated.length || evaluated.some((eid) => !readings.has(eid))) fail('The readings must cover exactly the evaluated ids, one each.', { evaluated: evaluated.length, readings: readings.size });
    // The grading rule in force: a tolerance applies to number answers only (a class collection
    // records null whatever dial the host carries), and it is the same for every outcome.
    const tolerance = collection.answerKind === 'number' ? toleranceOf({ tolerance: spec.tolerance }) : null;
    const byId = new Map(collection.items.map((item) => [item.id, item]));
    const outcomes = evaluated.map((eid) => outcome(eid, readings.get(eid), byId.get(eid).reference, tolerance === null ? undefined : { tolerance }));
    const summary = summarize(outcomes, { kind: collection.answerKind });
    const settings = {};
    for (const k of Object.keys(spec.learner.settings).sort()) settings[k] = spec.learner.settings[k];
    return freeze({ ok: true, snapshot: {
      kind: 'evaluation', id,
      collection: { id: collection.id, revision: collection.revision, labelRevision: collection.labelRevision, membershipKey: collection.membershipKey, labelKey: collection.labelKey,
        modality: collection.modality, extractor: collection.extractor, answerKind: collection.answerKind },
      split: { revision: manifest.revision, pile: spec.pile, key: manifest.key },
      training: { ids: training, count: training.length, revision: Session.trainingRevision(collection, manifest, training) },
      learner: { extractor: spec.learner.extractor, brain: spec.learner.brain, brainVersion: spec.learner.brainVersion === undefined ? null : spec.learner.brainVersion, settings, revision: learnerRevision },
      // The content identity of the evaluated items (id, payload, extractor version, answer): a
      // key, never the handles themselves — a record still carries no payload reference.
      seed, evaluated, evaluatedKey: Session.contentKey(evaluated.map((eid) => byId.get(eid))), tolerance, outcomes, summary,
    } });
  }
  function checkSnapshot(s) {
    if (!isObject(s) || s.kind !== 'evaluation' || !isObject(s.collection) || !isObject(s.split) || !isObject(s.learner) || !isObject(s.training)
      || !Array.isArray(s.evaluated) || typeof s.evaluatedKey !== 'string' || !Array.isArray(s.outcomes) || !isObject(s.summary)) fail('Not an evaluation snapshot.');
    return s;
  }
  /**
   * Is this result still about the collection, labels and split as they are NOW? Every reason
   * an old result must be labelled old rather than silently shown as the new Model's result.
   * Decided by CONTENT keys (a collection's membership and labels, a manifest's assignment) with
   * the counters as a second guard, so a fork that shares every revision number still reads old.
   * @returns {{current:boolean, reasons:string[]}}  reasons ⊆ wrong-collection, collection-revision, label-revision, split-revision
   */
  function status(snapshot, collection, manifest) {
    checkSnapshot(snapshot);
    if (!isObject(collection) || typeof collection.membershipKey !== 'string' || typeof collection.labelKey !== 'string') fail('status needs the collection.');
    const reasons = [];
    if (snapshot.collection.id !== collection.id) reasons.push('wrong-collection');
    else {
      const membershipMoved = snapshot.collection.revision !== collection.revision || snapshot.collection.membershipKey !== collection.membershipKey;
      if (membershipMoved) reasons.push('collection-revision');
      // labelKey hashes ids with their answers, so it moves with membership too: read it for
      // labels only when membership is the same.
      if (snapshot.collection.labelRevision !== collection.labelRevision || (!membershipMoved && snapshot.collection.labelKey !== collection.labelKey)) reasons.push('label-revision');
    }
    if (manifest !== undefined && manifest !== null) {
      if (!isObject(manifest) || !Number.isInteger(manifest.revision) || typeof manifest.key !== 'string') fail('status needs a split manifest or nothing.');
      if (manifest.collectionId !== collection.id || snapshot.split.revision !== manifest.revision || snapshot.split.key !== manifest.key || !Session.manifestStatus(manifest, collection).current) reasons.push('split-revision');
    }
    return freeze({ current: !reasons.length, reasons });
  }
  /**
   * May two snapshots be compared? Only when they measured the SAME thing the same way: the same
   * collection, the same pile, IDENTICAL evaluated ids with IDENTICAL reference answers (read
   * from the outcomes each snapshot holds — two forks can share a label revision number and
   * disagree on a label), IDENTICAL content behind those ids (`evaluatedKey`: an id that came
   * back naming another photo, or a payload re-read by another extractor version, is not the same
   * item) and the same grading tolerance. "Tune on Validation" compares runs on identical ids; a
   * Test run is never comparable with a Validation run; a changed tolerance is a changed
   * measurement, never a Model gain. What may legitimately differ (`differs`): the learner
   * (settings such as the sure line, or the brain), the training (ids, their content or their
   * labels — `training.revision` is content), the seed and the rest of the split. `delta` = b − a
   * for each rate, null where either side is unavailable.
   * @returns {{comparable:boolean, reasons:string[], differs:string[], delta:object|null}}
   *   reasons ⊆ collection, pile, evaluated, reference, content, tolerance · differs ⊆ learner, training, seed, split
   */
  function compare(a, b) {
    checkSnapshot(a); checkSnapshot(b);
    const reasons = [];
    if (a.collection.id !== b.collection.id) reasons.push('collection');
    if (a.split.pile !== b.split.pile) reasons.push('pile');
    if (!sameList(a.evaluated, b.evaluated)) reasons.push('evaluated');
    else if (a.outcomes.length !== b.outcomes.length || a.outcomes.some((o, i) => o.id !== b.outcomes[i].id || !Session.sameReference(o.reference, b.outcomes[i].reference))) reasons.push('reference');
    else if (a.evaluatedKey !== b.evaluatedKey) reasons.push('content');
    if (a.tolerance !== b.tolerance) reasons.push('tolerance');
    const differs = [];
    if (a.learner.revision !== b.learner.revision) differs.push('learner');
    if (a.training.revision !== b.training.revision || !sameList(a.training.ids, b.training.ids)) differs.push('training');
    if (a.seed !== b.seed) differs.push('seed');
    if (a.split.key !== b.split.key) differs.push('split');
    let delta = null;
    if (!reasons.length) {
      delta = {};
      for (const rate of RATES) {
        const x = a.summary[rate], y = b.summary[rate];
        delta[rate] = typeof x === 'number' && typeof y === 'number' ? y - x : null;
      }
    }
    return freeze({ comparable: !reasons.length, reasons, differs, delta });
  }

  const api = { STATUSES, VERDICTS, RATES, grade, outcome, summarize, record, status, compare };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.WorkshopEvaluationRecord = api;
})();
