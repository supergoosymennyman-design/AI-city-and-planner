(function () {
  'use strict';
  /**
   * run-session.js — THE RUN SESSION: one owner for preparing a Run and for the work that is
   * still outstanding while it runs (private learning loop, task P5a; board task 110).
   *
   * WHY THIS EXISTS. Two callers need the SAME preparation: the interactive host (game.js, a
   * browser, a person pressing Run) and the headless batch runner P9 will build. Before this
   * module the preparation lived inside game.js's DOM shell — `toTable()` (recursive Brick
   * expansion, Files/Feeder contents, the latch gate's synthetic levers), `startRun()` (Snap
   * mapping, the canonical sense lookup, Engine.createRun) and `step()` (training preparation,
   * the runtime budget, the engine tick) — all of it past the `typeof window === 'undefined'`
   * return, so `node --test` could not reach a line of it. Copying it for batch would have made
   * two owners of one decision. This module IS that decision; game.js calls it.
   *
   * WHAT IT OWNS
   *  - the CANONICAL authored table and the session's GENERATION token;
   *  - the COMPILED layout, which is a separate copy (the engine never steps the authored table);
   *  - the PENDING LEDGER: every outstanding unit of host work, each stamped with the generation
   *    it was opened under, in bounded queues.
   *
   * WHAT IT DOES NOT OWN. No DOM, no clock, no network, no randomness, no Promises. Asset
   * loading, training and policy-checked I/O belong to the host's adapters; the session says
   * WHAT must be done (`prepare` returns requests), the host DOES it (await), and the answer
   * comes back through `settle`. Every state transition here is synchronous and pure, so the
   * whole thing is drivable under `node --test` with hand-written adapters.
   *
   * THE STALENESS LAW (plan §P5 bullet 3). A completion is applied only when the request it
   * answers still belongs to the session's CURRENT generation and the session has not been
   * cancelled. Stop, a new Run, an import, a model correction and a private-scope clear all go
   * through `invalidate`/`cancel`, so a training job or an asset load that finishes late can
   * never enter a later Run. A failed completion becomes a STRUCTURED REFUSAL the host turns
   * into a visible line — never a silent fall back to inference on a stale brain.
   *
   * LEARNING GOES THROUGH IT TOO (task P5b). `teach` applies an engine teach effect to the
   * session's CANONICAL authored Model — never to the deep-cloned expanded layout, where a Model
   * sealed inside a part would be taught on a throwaway copy; `resetBeltLearning` sweeps the belt
   * at the whistle over that same canonical table; `learningReady` defers a tick while any Model
   * on the run is still compiling, so nothing is ever inferred from a brain that has not absorbed
   * the example just filed. `snapshot` is how batch gets a table of its own to do all that to.
   *
   * Tick order is the engine's, untouched: `step` calls `Engine.tick(run, externals)` and
   * nothing else.
   */
  const req = typeof require === 'function' ? require : null;
  const Brick = req ? req('./brick.js') : window.WorkshopBrick;
  const Snap = req ? req('./snap.js') : window.WorkshopSnap;
  const Engine = req ? req('./engine.js') : window.WorkshopEngine;
  const RuntimeBudget = req ? req('./runtime-budget.js') : window.WorkshopRuntimeBudget;

  /**
   * How much training data one Run may compile at once, in vector cells. Lifted verbatim from
   * game.js's own step() guard — a conservative session limit, not a hardware certification
   * (logic/runtime-budget.js says the same about its own caps).
   */
  const MAX_TRAINING_CELLS = 1048576;
  /**
   * Bounded queues, per kind of work. `train` is generous because one Run legitimately prepares
   * one request per Model on the table (a machine large enough to exceed this is already refused
   * by RuntimeBudget's own `blockOrder.length > 1000`); `asset` is the library loader's single
   * job plus headroom. Crossing either bound is a refusal, not an unbounded queue.
   */
  const LIMITS = { train: 64, asset: 16 };
  /** How many superseded/cancelled request ids stay recognisable, so a late completion can be
   *  answered 'stale' rather than 'unknown'. A ring, so the ledger cannot grow without end. */
  const REMEMBER_STALE = 64;
  /**
   * Sessions are numbered in creation order so a request id names WHICH session opened it, not
   * only which generation of it. Without this, Run 1 and Run 2 both start at generation 1 and
   * their first request ids are identical — a host that settled on the wrong session object would
   * be believed. A plain counter, not a clock or a random: deterministic in call order, and never
   * persisted or shown.
   */
  let sessionSeq = 0;

  // ---------- compilation (shared by the interactive host and by batch) ----------

  /**
   * Compile an authored table into the flat table a Run steps. PURE — the only thing it touches
   * outside its arguments is the outer checker write-back described below, which is the live
   * piece the caller handed in.
   *
   * Brick expansion runs FIRST, so an inner feeder, latch gate or checker compiles exactly like
   * any other block and the engine never learns a brick existed (Brick.expand's own contract).
   * Everything after it reads the FLAT table.
   *
   * @param {{pieces:Array, snaps:Array, wires:Array}} table  the authored table
   * @param {*} seed  the run seed, passed through to the dealing arms unchanged
   * @param {{validate?:function, checkerKind:function, datasetContents:function,
   *          feederContents:function, filesContents:function}} hooks
   *   the host's own pure decisions, injected because they live in game.js:
   *   `validate(table)` throws on a bad library binding (optional — batch may have none);
   *   `checkerKind(flatTable, checker)` is the Tally shape of that checker's own belt line;
   *   `datasetContents(block, seed)` / `feederContents(block)` / `filesContents(block, seed)`
   *   are the three dealing arms.
   * @returns {{pieces:Array, snaps:Array, wires:Array, glowAlias:*}}
   */
  function compile(table, seed, hooks) {
    if (!table || !Array.isArray(table.pieces)) throw new Error('run-session: compile needs an authored table');
    if (!hooks || typeof hooks.checkerKind !== 'function') throw new Error('run-session: compile needs the host compile hooks');
    if (hooks.validate) hooks.validate(table);
    const flat = Brick.expand(table);
    // Each checker's Tally shape follows ITS OWN belt line's dataset — traced on the FLAT table so
    // a checker cut inside a brick sees its line the same way an outer one does. Outer checkers are
    // ALSO written back onto the LIVE piece (not just the clone below) because the Floor reads
    // p.kind straight off the authored pieces to shape its face; an inner checker has no floor face
    // of its own to keep in sync, so only the outer write-back is needed.
    const outerById = new Map(table.pieces.map((p) => [p.id, p]));
    for (const p of flat.pieces) {
      if (p.type !== 'checker') continue;
      p.kind = hooks.checkerKind(flat, p);
      const outer = outerById.get(p.id);
      if (outer) outer.kind = p.kind;
    }
    const pieces = flat.pieces.map((p) => {
      const b = Object.assign({}, p);
      if (b.type === 'feeder' && (b.dataset || b.table)) {
        // A Data feed: the WHOLE table, unsplit — a latch gate + a Pen decide study vs exam live,
        // by ROUTE, as crates ride the belt. Dealt ONCE. An uploaded table (b.table) compiles
        // through the identical branch as an authored dataset (b.dataset).
        b.contents = hooks.datasetContents(b, seed);
        b.once = true;
        delete b.items;
        delete b.contentsText;
      } else if (b.type === 'feeder') {
        b.contents = hooks.feederContents(b);
        delete b.items;
        delete b.contentsText;
      } else if (b.type === 'files') {
        // The whole three-armed compile lives in ONE pure function on the host side; the SEED LAW
        // it carries is what keeps a SAMPLE a reference and the top-bar Seed box alive.
        b.contents = hooks.filesContents(b, seed);
      }
      return b;
    });
    // Every latch gate gets TWO invisible levers: synthetic Buttons wired to switch1 and switch2,
    // so pulling the plate's own lever reaches the engine the SAME way any other switch source
    // would — a real wire, never a bypass. Two, not one, because a latch throws BOTH ways. The
    // child never sees or wires these; they ride only in the compiled layout. Off `flat.pieces`:
    // a latch gate cut inside a brick gets its own two levers exactly like an outer one would.
    const leverPieces = [], leverWires = [];
    for (const p of flat.pieces) {
      if (p.type !== 'gate' || (p.mode || 'sorter') !== 'latch') continue;
      for (const k of [1, 2]) {
        const leverId = p.id + '__lever' + k;
        leverPieces.push({ id: leverId, type: 'button', name: 'lever' + k });
        leverWires.push({ from: { block: leverId, port: 'pressed' }, to: { block: p.id, port: 'switch' + k } });
      }
    }
    return { pieces: pieces.concat(leverPieces), snaps: flat.snaps, wires: flat.wires.concat(leverWires), glowAlias: flat.glowAlias };
  }

  // ---------- the session ----------

  /**
   * Open a run session over ONE canonical authored table.
   *
   * @param {object} spec
   * @param {{pieces:Array, snaps:Array, wires:Array}} spec.authoredTable
   *   THE canonical table. The interactive host passes its live table by reference (the session
   *   is not a second copy of it); batch passes its own deep snapshot (task P5b).
   * @param {*} [spec.seed]
   * @param {object} [spec.adapters]  the host's seams — see `modelFor` and `begin` below.
   * @param {*} [spec.privateScope]  an opaque token naming the private scope this session learns
   *   in. Carried, never copied into the layout and never returned by `step`.
   * @param {string} [spec.id]  a fixed session name; one is minted in creation order otherwise.
   * @returns {object} session
   */
  function createSession(spec) {
    const s = spec || {};
    if (!s.authoredTable || !Array.isArray(s.authoredTable.pieces)) {
      throw new Error('run-session: a session needs an authored table');
    }
    return {
      /** This session's own name. Opaque; `spec.id` lets a caller fix it for a reproducible log. */
      id: s.id || String(sessionSeq += 1),
      table: s.authoredTable,
      seed: s.seed,
      privateScope: 'privateScope' in s ? s.privateScope : null,
      adapters: s.adapters || {},
      /** Bumped by every invalidation. A request carries the generation it was opened under. */
      generation: 1,
      requestSeq: 0,
      /** id -> request, only the OPEN ones. */
      pending: new Map(),
      /** id -> request, a bounded ring of superseded/cancelled ids so a late settle reads 'stale'. */
      stale: new Map(),
      layout: null,
      meta: null,
      glowAlias: null,
      run: null,
      refusal: null,
      /** Why the last invalidate/cancel happened. Diagnostic only; nothing branches on it. */
      reason: null,
      cancelled: false,
    };
  }

  /** The opaque private scope this session learns in. P5b reads it; nothing exports it. */
  function scopeOf(session) { return session.privateScope; }

  /**
   * Re-point a session at the canonical table and seed AS THEY STAND NOW, and start a new
   * generation. A preparation-time verb: it exists because a session can outlive the gesture that
   * opened it (a Run press waits for its assets to download), and the Run must compile from the
   * table and seed the child can see, not from the ones that were there when they pressed. Every
   * completion prepared against the old ones becomes stale, and the compiled layout is dropped.
   *
   * EVERYTHING derived from the old target goes, so what is left is indistinguishable from a
   * session freshly created over the new table — same fields, same emptiness — apart from this
   * session's IDENTITY (`id`, the bumped `generation`, the monotonic `requestSeq`) and the stale
   * ring, which is memory of the ids just superseded and is exactly what lets a late completion
   * read 'stale' rather than 'unknown'. That includes `run`: keeping it let a re-pointed session
   * `prepare` and `step` the run compiled from the OLD table, silently and with no throw. Now
   * `begin` and `step` fail loudly until the new table has been compiled, which is this module's
   * own law everywhere else.
   * @returns {{generation:number, superseded:string[]}}
   */
  function retarget(session, spec) {
    if (session.cancelled) throw new Error('run-session: a cancelled session cannot be re-pointed');
    const s = spec || {};
    if (s.authoredTable) {
      if (!Array.isArray(s.authoredTable.pieces)) throw new Error('run-session: retarget needs an authored table');
      session.table = s.authoredTable;
    }
    if ('seed' in s) session.seed = s.seed;
    session.layout = null;
    session.meta = null;
    session.glowAlias = null;
    session.run = null;
    return invalidate(session, 'retarget');
  }

  function refuse(session, refusal) {
    const r = Object.assign({ generation: session.generation }, refusal);
    session.refusal = r;
    return r;
  }

  /** Why a session stopped accepting work, or null. Structured — the host owns the wording. */
  function refusalOf(session) { return session.refusal; }

  function remember(session, request) {
    request.superseded = true;
    session.stale.set(request.id, request);
    // A ring: the OLDEST remembered id is dropped first (Map preserves insertion order), so the
    // ledger is bounded however long a session runs.
    while (session.stale.size > REMEMBER_STALE) {
      const oldest = session.stale.keys().next().value;
      session.stale.delete(oldest);
    }
  }

  function openOfKind(session, kind) {
    let n = 0;
    for (const r of session.pending.values()) if (r.kind === kind) n += 1;
    return n;
  }

  /** The ids of every unit of host work still outstanding. */
  function openIds(session) { return Array.from(session.pending.keys()); }

  /**
   * Open one unit of host work. The id carries the session GENERATION, so a completion arriving
   * after Stop / a new Run / an import / a model correction / a scope clear is recognisable as
   * belonging to a session state that no longer exists.
   *
   * @param {object} session
   * A NAMED key is idempotent: asking again for work that is still open returns the SAME request
   * rather than a second one, so a caller that re-prepares while an adapter hangs cannot grow the
   * queue. An unnamed request keys on its own id and is therefore always new.
   *
   * @param {{kind:string, key?:string, payload?:*}} spec  `kind` is 'train' or 'asset'.
   * @returns {{ok:true, id:string, request:object} | {ok:false, refusal:object}}
   *   `ok:false` when the session is already refused/cancelled or the queue for that kind is full.
   */
  function request(session, spec) {
    if (session.cancelled) return { ok: false, refusal: session.refusal || { code: 'cancelled', generation: session.generation } };
    if (session.refusal) return { ok: false, refusal: session.refusal };
    const kind = spec && spec.kind;
    if (!kind) throw new Error('run-session: a request needs a kind');
    const named = spec && spec.key;
    if (named) {
      for (const r of session.pending.values()) {
        if (r.kind === kind && r.key === named) { r.payload = (spec && spec.payload) || r.payload; return { ok: true, id: r.id, request: r }; }
      }
    }
    const limit = LIMITS[kind] || LIMITS.train;
    if (openOfKind(session, kind) >= limit) {
      // The TRAIN queue gets its own code because its bound is not a runtime-capacity fact the
      // child can act on by slowing the belt: one request per trainable Model means crossing it
      // says "this machine has more Models than one Run can train at once", and the sentence the
      // child reads has to name THAT. Other kinds keep the generic capacity code.
      const code = kind === 'train' ? 'train-full' : 'pending-full';
      return { ok: false, refusal: refuse(session, { code, kind, limit }) };
    }
    const id = 's' + session.id + ':g' + session.generation + '#' + (session.requestSeq += 1);
    const r = { id, kind, key: (spec && spec.key) || id, generation: session.generation, payload: (spec && spec.payload) || null, superseded: false };
    session.pending.set(id, r);
    return { ok: true, id, request: r };
  }

  /**
   * A host adapter's completion comes back here — the ONE door through which outside work may
   * change a session.
   *
   * @param {object} session
   * @param {string} requestId
   * @param {{ok:boolean, code?:string, error?:Error, cancelled?:boolean}} result
   * @returns {{accepted:boolean, reason?:string, request?:object, refusal?:object}}
   *   `accepted:false` with reason 'stale' (the request's generation is gone), 'cancelled' (the
   *   whole session is), or 'unknown' (never opened here, or already settled). An accepted but
   *   failed completion carries `refusal` — the host says it out loud and stops; nothing is
   *   inferred from a brain that never finished preparing.
   */
  function settle(session, requestId, result) {
    const open = session.pending.get(requestId);
    const known = open || session.stale.get(requestId);
    if (!known) return { accepted: false, reason: 'unknown' };
    if (open) session.pending.delete(requestId);
    if (session.cancelled) { if (open) remember(session, open); return { accepted: false, reason: 'cancelled', request: known }; }
    // Found only in the stale ring, so `invalidate` moved it there: it answers a generation that
    // is gone. (A request still OPEN always carries the current generation, because invalidate and
    // cancel empty the queue into the ring — the stamp on the request is what mints the id that
    // says so, and what a caller reads to know which generation it is answering.)
    if (!open) return { accepted: false, reason: 'stale', request: known };
    const res = result || {};
    if (res.ok) return { accepted: true, request: known };
    // The host withdrew this work itself (a second Run press stopping an asset load). Not a
    // failure, so no refusal — but the completion is still consumed, never applied.
    if (res.cancelled) return { accepted: true, cancelled: true, request: known };
    return {
      accepted: true,
      request: known,
      refusal: refuse(session, { code: res.code || 'failed', kind: known.kind, key: known.key, error: res.error || null }),
    };
  }

  /**
   * A NEW generation: every completion still outstanding becomes stale. Use this when the session
   * itself lives on but the work in flight was computed from something that has since changed —
   * a model correction, or a re-run within one session.
   * @returns {{generation:number, superseded:string[]}}
   */
  function invalidate(session, reason) {
    const superseded = openIds(session);
    for (const r of Array.from(session.pending.values())) remember(session, r);
    session.pending.clear();
    session.generation += 1;
    session.reason = reason || null;
    // A refusal belonged to the generation that is now gone; the next generation starts clean.
    session.refusal = null;
    return { generation: session.generation, superseded };
  }

  /**
   * End this session. Every completion, now or later, is stale. Stop, an import and a private
   * scope clear all come through here.
   * @returns {{reason:string, cancelled:string[]}}
   */
  function cancel(session, reason) {
    const cancelled = openIds(session);
    for (const r of Array.from(session.pending.values())) remember(session, r);
    session.pending.clear();
    session.cancelled = true;
    session.reason = reason || 'cancelled';
    return { reason: session.reason, cancelled };
  }

  // ---------- preparation ----------

  /**
   * WHICH library assets this session's table needs before it may run — the shared half of the
   * "required assets" seam (plan §P5 bullet 1).
   *
   * The DERIVATION lives here, not in the browser shell, because the headless batch runner needs
   * the same answer and `prepareLibraryRun` is unreachable from `node`. A second copy of this walk
   * would drift the moment a new binding kind appears, and the batch path would quietly load the
   * wrong set. What stays with the host is READINESS — whether a binding is already in memory
   * (`Library.ready` / `Library.validateData`) and the awaiting of the download itself.
   *
   * Runs over the EXPANDED table, so a Model or a data plate sealed inside a part is waited for
   * exactly like an outer one. A Model's own saved library photos ride in through `hooks.waiting`.
   *
   * @param {object} session
   * @param {{validate?:function, waiting?:function}} [hooks]  the same compile hooks `layoutFor`
   *   takes: `validate(table)` throws on a bad library binding (asked FIRST, as `compile` does —
   *   a table whose bindings are wrong cannot honestly say what it needs), and `waiting()` returns
   *   the bindings the host's own brains are still waiting on (DOM-shell only; batch has none).
   * @returns {Array<object>} library data bindings, in table order, then the waiting ones
   */
  function requiredAssets(session, hooks) {
    const h = hooks || {};
    if (h.validate) h.validate(session.table);
    const out = [];
    for (const p of Brick.expand(session.table).pieces) {
      if (p.libraryData) out.push(p.libraryData);
      // A bound Model's THINKING screens need its real training examples as well as the feed:
      // ask for those ids by name, never relying on unrelated neighbours in a loaded chunk.
      if (p.libraryModel) out.push({ version: 1, dataset: p.libraryModel.dataset, split: 'train', ids: p.libraryModel.trainingIds });
    }
    if (typeof h.waiting === 'function') for (const b of h.waiting()) out.push(b);
    return out;
  }

  /**
   * The canonical Model behind a block — the one this Run actually asks. P6 (inspection) and P7
   * (sealed-part correction) call THIS rather than re-deriving a Model from the table, so an
   * explanation can never be computed from a different brain than the prediction was.
   *
   * @param {object} session
   * @param {string} blockId  a run block id (namespaced `outer~inner` for a brick's inside)
   * @param {object} [ctx]  scratch shared by ONE walk over the run. `prepare` makes a fresh one
   *   per call so the host adapter can index the table once instead of scanning it per block; a
   *   single lookup (P6/P7 asking who answered) passes none and the adapter indexes for itself.
   * @returns {null | {blockId, piece, brain, learner, learnerId, dials, key}}
   */
  function modelFor(session, blockId, ctx) {
    const lookup = session.adapters && session.adapters.modelFor;
    if (typeof lookup !== 'function') return null;
    const found = lookup(session, blockId, ctx || {});
    if (!found || !found.brain || !found.learner) return null;
    const blocks = session.run && session.run.blocks;
    const dials = (blocks && blocks[blockId] && blocks[blockId].dials) || found.dials || {};
    return {
      blockId,
      piece: found.piece || null,
      brain: found.brain,
      learner: found.learner,
      learnerId: found.learner.id,
      dials,
      key: 'train:' + blockId,
    };
  }

  /** How much of this brain a compile would have to copy, in vector cells. */
  function brainCells(brain) {
    let cells = 0;
    const shelves = (brain && brain.shelves) || {};
    for (const shelf of Object.values(shelves)) {
      for (const ex of shelf) cells += (ex.vec || []).length + (ex.raw || []).length;
    }
    return cells;
  }

  /**
   * What must be prepared before this session may step. PURE: it decides, it never awaits.
   *
   * The host walks the returned requests in order, performs each through its own adapter
   * (`LearnedState.prepare` for 'train'), and reports the outcome to `settle`. A `false`
   * acceptance means the world moved under the work — the host drops the tick.
   *
   * @param {object} session
   * @returns {{status:'ready'|'pending'|'refused', requests:object[], refusal?:object}}
   */
  function prepare(session) {
    if (session.cancelled) return { status: 'refused', requests: [], refusal: session.refusal || { code: 'cancelled', generation: session.generation } };
    if (session.refusal) return { status: 'refused', requests: [], refusal: session.refusal };
    const run = session.run;
    if (!run) return { status: 'ready', requests: [] };
    // BEFORE a tick, so stopping preserves the completed tick's scores, logs and examples rather
    // than pruning evidence (logic/runtime-budget.js's own law).
    if (RuntimeBudget.exceeded(run)) return { status: 'refused', requests: [], refusal: refuse(session, { code: 'runtime-full' }) };
    const requests = [];
    const ctx = {}; // one index per walk, not one scan per block
    let cells = 0;
    for (const id of run.blockOrder) {
      const model = modelFor(session, id, ctx);
      if (!model) continue;
      cells += brainCells(model.brain);
      // Refused BEFORE any request is opened for the offending Model — a Run that cannot finish
      // must not start background work it will only cancel. (game.js checked the running total
      // between awaits; deciding the whole walk up front reaches the identical refusal with
      // strictly fewer worker jobs started.)
      if (cells > MAX_TRAINING_CELLS) return { status: 'refused', requests, refusal: refuse(session, { code: 'runtime-full' }) };
      const opened = request(session, { kind: 'train', key: model.key, payload: model });
      if (!opened.ok) return { status: 'refused', requests, refusal: opened.refusal };
      requests.push(opened.request);
    }
    return { status: requests.length ? 'pending' : 'ready', requests };
  }

  // ---------- learning through the session (task P5b) ----------

  /**
   * A deep copy of an authored table that nothing outside this copy can reach — what a batch run
   * opens its session over (plan §P5 bullet 4).
   *
   * WHY. The interactive host hands `createSession` its LIVE table by reference on purpose: the
   * child is watching that machine, and a Run teaching a Model is supposed to leave the Model
   * taught. A simulation is the opposite — it must be able to teach, sweep and re-teach without
   * the editor on screen changing under the person, so it starts from its own copy and every
   * `teach`/`resetBeltLearning` below lands there. This function is the ONLY way to get one; a
   * caller that passes the live table gets the live table, deliberately.
   *
   * A JSON round-trip, the same clone `Brick.expand` and `makeIndependent` already use: a table is
   * save-format data (autosave serialises it whole), so nothing on it is a function, a Map or a
   * cycle. Object identity WITHIN the copy is not preserved across separate branches — which is
   * why the one identity the compile path depends on, a Files/Feeder block and its own
   * `table.schema`, lives inside a single piece and survives.
   *
   * COPYING THE TABLE IS NOT ENOUGH, AND THAT WAS A REAL DEFECT (P5b review, IMPORTANT-1). A
   * Model with no `learning` bank of its own does not keep its examples on its piece at all — the
   * host's `modelEntry` falls THROUGH to the shared catalogue brain, which is module-global and
   * belongs to the live editor. A copy of such a piece is a copy of a piece that points at the
   * editor's brain: the simulation's teach wrote there, and its whistle swept it, so the machine
   * on screen silently lost its learning and gained the simulation's. The copy therefore gets its
   * own bank for every piece that would otherwise fall through — `adapters.ownBank(piece)`, the
   * host's existing "the own bank a COPY must carry" decision (game.js `sealBankFor`), walked to
   * every depth so a Model sealed inside a part is covered too. After this, nothing in the copy
   * can name a catalogue brain, which is also what lets `resetBeltLearning` below sweep the
   * session's own brains and leave the editor's alone.
   *
   * The adapter is REQUIRED: without it there is no isolation to guarantee, and a snapshot that
   * quietly shares the editor's brains is the exact defect this replaced. Loud, not defaulted.
   *
   * WHAT IT DOES NOT COPY: a private collection. Authored pieces hold only opaque handles (ruling
   * R4), so a snapshot carries the handles and the ONE registry behind them stays where it is —
   * `ownBank` gives a private Model NO bank on purpose, because copying one would put private
   * vectors on an authored piece, and because a private Model never reaches a catalogue brain
   * anyway (`modelEntry` resolves its handle first). A snapshot run still cannot write there: a
   * private Model is taught exactly its collection's Training items, so the private teach path
   * files nothing (see game.js `filePrivateCrate`), and a library Model answers from frozen
   * weights and never trains (`modelFor` refuses it).
   *
   * @param {{pieces:Array, snaps?:Array, wires?:Array}} table
   * @param {{ownBank:function}} adapters  the host's seams — the same object the session gets
   * @returns {{pieces:Array, snaps:Array, wires:Array}} a copy sharing nothing with `table`,
   *   including no shared brain
   */
  function snapshot(table, adapters) {
    if (!table || !Array.isArray(table.pieces)) throw new Error('run-session: a snapshot needs an authored table');
    const ownBank = adapters && adapters.ownBank;
    if (typeof ownBank !== 'function') {
      throw new Error('run-session: a snapshot needs the host own-bank adapter, or the copy still shares the editor brains');
    }
    const copy = JSON.parse(JSON.stringify(table));
    const walk = (list) => {
      for (const p of list || []) {
        const bank = ownBank(p);
        if (bank) p.learning = bank;
        if (p.def) walk(p.def.pieces);
      }
    };
    walk(copy.pieces);
    return copy;
  }

  /**
   * Can any Model on this table still reach the host's SHARED catalogue brains — the module-global
   * ones the live editor owns? True for the live table (a machine saved before per-Model banks
   * existed keeps its examples only there); false for a `snapshot`, which gave every such piece a
   * bank of its own.
   *
   * It is derived from the table itself, not promised by a caller, because a caller's promise is
   * exactly what went wrong in the reviewed round: a batch runner that forgot a flag would sweep
   * and rewrite the child's on-screen Models. Without the adapter it answers TRUE — the live
   * behaviour, which is the safe default for an unknown table.
   *
   * @param {Array} pieces
   * @param {function} [ownBank]  `adapters.ownBank` — non-null for a piece with no bank of its own
   * @returns {boolean}
   */
  function sharesCatalogueBrains(pieces, ownBank) {
    if (typeof ownBank !== 'function') return true;
    for (const p of pieces || []) {
      if (ownBank(p)) return true;
      if (p.def && sharesCatalogueBrains(p.def.pieces, ownBank)) return true;
    }
    return false;
  }

  /**
   * Apply ONE engine teach effect to the SESSION's authored Model (plan §P5 bullet 2).
   *
   * THE LAW THIS EXISTS FOR: teaching lands on `session.table.pieces` — the canonical authored
   * table — and never on the compiled layout. `Brick.expand` DEEP-CLONES every piece (logic/brick.js
   * `clone`), so a piece in `session.layout` carries a throwaway copy of its `learning` bank: a
   * Model taught there is taught for exactly as long as the Run lasts and then discarded, and a
   * Model sealed inside a part — whose authored piece only exists inside `def.pieces` — would be
   * taught on a clone of a clone. Do not "fix" that by dropping the expansion clone; the clone is
   * what keeps the engine from editing the machine the child built (plan §P5 bullet 4). The fix is
   * to teach through here.
   *
   * PRIVATE SCOPE THROUGH NESTING. The host's teach adapter resolves a namespaced block id
   * (`outer~inner`, and `outer~mid~inner` for a part inside a part) by walking DOWN the authored
   * `def.pieces`, so the sealed piece's own opaque collection handle is the one read, at any depth.
   * The scope itself is never passed in or handed back: `session.privateScope` stays carried
   * (`scopeOf`), the registry behind the handle stays the single owner (ruling R4), and this
   * function returns a boolean.
   *
   * A CANCELLED OR REFUSED SESSION LEARNS NOTHING. Stop, an import and a private-scope CLEAR all
   * cancel; a late teach effect arriving after one of those must not write private material back
   * into a Model the clear was supposed to detach.
   *
   * AN EFFECT THAT NAMES NO BLOCK FILES NOTHING — it does not throw (P5b review, MINOR-3). The
   * host applies effects in a loop with no try/catch above it, and `applyTeachEffect` (this
   * function's one adapter) has always answered a blockless effect with `false`: no piece
   * resolves, so no entry does, so nothing is filed. A throw there would crash the whole Run over
   * one malformed effect from one producer. `false` is an outcome the loop already understands.
   * Loud failures stay for the genuinely impossible: a missing adapter is a wiring bug.
   *
   * @param {object} session
   * @param {{block:string, shelf?:string, itemId?:*, data?:object}} fx  an engine 'teach' effect
   * @param {{hand?:boolean, report?:object}} [opts]  passed through to the host adapter unchanged:
   *   `hand` marks the filing as the person's own curation (it then survives the next whistle);
   *   `report` is the adapter's out-object (the filed piece, or the refusal key to say out loud).
   * @returns {boolean} whether an example was actually filed
   */
  function teach(session, fx, opts) {
    const apply = session.adapters && session.adapters.teach;
    if (typeof apply !== 'function') throw new Error('run-session: teaching needs the host teach adapter');
    if (!fx || !fx.block) return false;
    if (session.cancelled || session.refusal) return false;
    return !!apply(session.table.pieces, fx, opts || {});
  }

  /**
   * THE WHISTLE: sweep what the BELT filed into this session's Models on an earlier run, so a Run
   * is a fresh experiment (plan §P5 bullet 2, "preserve hand/belt reset and Keep rules").
   *
   * The RULE is the host's and stays there (game.js `resetBeltLearning` → `Brain.sweepBelt`): only
   * belt-filed examples go, hand-taught ones and the filings a person explicitly ACCEPTED off an
   * away report are kept. What the session owns is WHICH TABLE is swept and WHEN — the authored
   * table, at the whistle, before the run exists. A batch run sweeps its own snapshot and the live
   * editor is untouched; the interactive host sweeps the table the child is looking at.
   *
   * IT SWEEPS THIS SESSION'S OWN BRAINS (P5b review, IMPORTANT-1). The host's sweep also reaches
   * the SHARED catalogue brains, which are module-global and belong to the live editor — for the
   * live session that is right and unchanged (a machine saved before per-Model banks existed
   * keeps its belt learning only there, so the whistle would otherwise sweep nothing at all for
   * it). For a `snapshot` it was the leak: the simulation's whistle wiped the learning off the
   * machine on screen. So the reach is decided per call, from the table about to be swept:
   * `sharesCatalogueBrains` asks whether any Model here can still name one. A snapshot cannot, by
   * construction, so its whistle stays inside its own copy.
   *
   * The one behavioural delta for the live path: a table where EVERY Model already has its own
   * bank no longer sweeps catalogue brains that no piece on it can reach. Its predictions do not
   * change, but the Models overlay and saved shared-brain counts can still show those retained
   * catalogue examples. The spoken Run count is unchanged: game.js `liveBeltLearners` already
   * counts the table's pieces, and the host does not use this function's returned sweep count.
   *
   * Called BEFORE `begin`, and it refuses afterwards: sweeping a run that is already going would
   * delete, mid-belt, the very examples the crates still riding were filed to teach.
   *
   * @param {object} session
   * @returns {number} how many examples the sweep removed
   */
  function resetBeltLearning(session) {
    if (session.cancelled) throw new Error('run-session: a cancelled session cannot sweep learning');
    if (session.run) throw new Error('run-session: belt learning is swept at the whistle, before the run begins');
    const adapters = session.adapters || {};
    const sweep = adapters.resetBeltLearning;
    if (typeof sweep !== 'function') throw new Error('run-session: the whistle needs the host belt-reset adapter');
    const shared = sharesCatalogueBrains(session.table.pieces, adapters.ownBank);
    return sweep(session.table.pieces, { shared }) || 0;
  }

  /**
   * Can every Model this walk prepared ANSWER right now — or is one of them still compiling?
   * (plan §P5 bullet 2, "await dirty learned-state preparation before dependent inference".)
   *
   * WHY IT IS A QUESTION AND NOT A LEDGER. Which Models are dirty is already owned, exactly once,
   * by logic/learned-state.js: its bank compares the example list it compiled against the brain's
   * examples NOW and mints a fresh entry the moment they differ, so a Model taught since the last
   * compile reads back as having no state. A second dirty-set here would be a second owner of that
   * fact and would drift the first time a brain changed by a route this module cannot see — which
   * is every route, since teaching also happens from the Teach screen while a Run is up.
   *
   * So the host asks the bank, through `adapters.learned(model)`, and this decides what to do with
   * the answer: while ANY Model on the run is still compiling, the tick is deferred. The engine
   * therefore never scores a crate against a brain that has not absorbed the example just filed.
   *
   * THE ADAPTER IS THE HOST'S, AND IT IS NOT A PURE READ. Asking the bank can compile a Model
   * that compiles synchronously (a KNN brain does), and a bank whose training FAILED re-raises its
   * error from here. Both are deliberate and unchanged from the line this replaced in game.js's
   * step(): a Run that cannot prepare stops and says so, rather than being waved through as
   * "not ready" for ever. The SESSION's own half — below — touches nothing.
   *
   * IT STOPS AT THE FIRST MODEL THAT IS NOT READY (P5b review, MINOR-1). The line this replaced
   * was `plan.requests.some(…)`, which short-circuits, and that is load-bearing precisely BECAUSE
   * the adapter is not a pure read: asking a later Model compiles it, and a later Model whose bank
   * fails re-raises. Once one Model is known unready the tick is already deferred, so asking the
   * rest buys nothing and can only surface a later error a tick earlier than it used to. `waiting`
   * therefore names the first blocker, not every one.
   *
   * @param {object} session
   * @param {object[]} requests  the requests `prepare` returned for this walk
   * @returns {{ready:boolean, waiting:string[]}} `waiting` names the first request key not ready
   */
  function learningReady(session, requests) {
    const learned = session.adapters && session.adapters.learned;
    if (typeof learned !== 'function') throw new Error('run-session: readiness needs the host learned-state adapter');
    const waiting = [];
    for (const r of requests || []) {
      if (r.kind !== 'train' || !r.payload) continue;
      if (!learned(r.payload)) { waiting.push(r.key); break; }
    }
    return { ready: !waiting.length, waiting };
  }

  // ---------- starting and stepping ----------

  /**
   * Compile the canonical table and map it onto the run layout. The layout is a SEPARATE copy:
   * the engine never steps the authored table, so simulation can never edit what the child built.
   * @returns {{layout:object, meta:object, glowAlias:*}}
   */
  function layoutFor(session, hooks) {
    const compiled = compile(session.table, session.seed, hooks);
    const mapped = Snap.snapToLayout(compiled);
    session.layout = mapped.layout;
    session.meta = mapped.meta;
    session.glowAlias = compiled.glowAlias;
    return { layout: mapped.layout, meta: mapped.meta, glowAlias: compiled.glowAlias };
  }

  /**
   * Create the engine run over the compiled layout. `adapters.senses(pieces)` is the canonical
   * sense lookup — the engine-shaped view of the host's registry, resolved against the AUTHORED
   * pieces so a Model keeps its own shelves however deep a brick nests it.
   * @param {object} session
   * @param {{captureTerminals?:boolean}} [options] opt-in local evidence; default event schema stays unchanged
   * @returns {object} the engine run, which the session now owns
   */
  function begin(session, options) {
    if (!session.layout) throw new Error('run-session: begin before the table was compiled');
    const senses = session.adapters && typeof session.adapters.senses === 'function'
      ? session.adapters.senses(session.table.pieces) : undefined;
    session.run = Engine.createRun(session.layout, { seed: session.seed, senses, captureTerminals: !!(options && options.captureTerminals) });
    return session.run;
  }

  /**
   * One engine tick, in the engine's own order — this function adds nothing to it.
   * @param {object} session
   * @param {Array} externals  external signals for this tick (the host drains its own queue)
   * @returns {{events:Array, effects:Array, pending:string[], state:object}}
   */
  function step(session, externals) {
    if (!session.run) throw new Error('run-session: step before a run was started');
    const out = Engine.tick(session.run, externals || []);
    return { events: out.events, effects: out.effects, pending: openIds(session), state: session.run };
  }

  const api = {
    compile, createSession, scopeOf, retarget, request, settle, invalidate, cancel,
    prepare, requiredAssets, modelFor, brainCells, layoutFor, begin, step,
    snapshot, sharesCatalogueBrains, teach, resetBeltLearning, learningReady,
    openIds, refusalOf,
    MAX_TRAINING_CELLS, LIMITS, REMEMBER_STALE,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.WorkshopRunSession = api;
})();
