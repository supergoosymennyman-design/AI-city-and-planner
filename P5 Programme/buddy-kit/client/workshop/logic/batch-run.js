(function () {
  'use strict';
  const req = typeof require === 'function' ? require : null;
  const Session = req ? req('./run-session.js') : window.WorkshopRunSession;
  const Engine = req ? req('./engine.js') : window.WorkshopEngine;
  const Results = req ? req('./run-results.js') : window.WorkshopRunResults;
  const LIMITS = Object.freeze({ ticks: 100000, work: 1000000, chunk: 100, waits: 1000 });
  const EXTERNAL = new Set(['cloud', 'send', 'speaker', 'noisemaker']);
  const DEVICE = new Set(['camera', 'microphone', 'pose']);
  const copy = value => JSON.parse(JSON.stringify(value));
  function bounded(value, fallback, ceiling) {
    if (value === undefined) return fallback;
    if (!Number.isSafeInteger(value) || value < 1 || value > ceiling) throw new Error('Invalid batch bound.');
    return value;
  }
  const sourceKey = (block, index, tick) => JSON.stringify([block, index, tick || 0]);

  /** Finite, session-only execution of the same RunSession as interactive play.
   * No promises, browser timers or effects pipeline: chunk returns preparation requests, and
   * the host performs/settles them, then yields before the next bounded chunk. Never autosave
   * this object. clear() releases its table, run, results and pending references together.
   *
   * selection names COMPILED source IDs (including namespaced part IDs) and row indices. With
   * no selection, all Files and once-only Feeders run. An explicit selection makes only those
   * sources finite; it does not rewrite the editor. recorded is [{tick,signals:[...]}], with
   * one-based simulation ticks, never wall time. Live device calls remain forbidden.
   * @param {{table:object,adapters:object,hooks:object,seed?:number,runId?:string,
   * privateScope?:*,selection?:Array,recorded?:Array,assetsReady?:function,limits?:object}} spec
   * @returns {object} session/results getters, chunk/settle/cancel/clear/status methods
   */
  function create(spec) {
    let s = spec || {};
    const bounds = s.limits || {};
    const limits = Object.freeze({ ticks: bounded(bounds.ticks, 10000, LIMITS.ticks),
      work: bounded(bounds.work, 100000, LIMITS.work), waits: bounded(bounds.waits, 100, LIMITS.waits),
      chunk: bounded(bounds.chunk, 25, LIMITS.chunk) });
    const results = Results.create({ runId: s.runId, maxResults: bounds.results, maxObservations: bounds.observations });
    let session = null, state = 'preparing', reason = null, work = 0, waits = 0, prepared = null;
    let initialized = false, settledAssets = false, idle = 0, nextObservation = 0, generation = null;
    let hooks = s.hooks, assetsReady = s.assetsReady, selection = s.selection;
    const admissions = new Map(), flows = new Map(), physical = new Map(), schedule = new Map(), bindings = new Map();
    let sources = [];
    function status() {
      return { status: state, reason, tick: session && session.run ? session.run.tick : 0,
        work, waits, limits, pending: session ? Session.openIds(session) : [] };
    }
    function finish(end, code) {
      if (!['preparing', 'running', 'waiting'].includes(state)) return status();
      const out = results.finish(end, code);
      state = out.status; reason = out.reason;
      if (session) Session.cancel(session, code || end);
      prepared = null;
      return status();
    }
    function reserve(block, index, row, tick, originalIndex, physicalSource = false) {
      const source = row && row.data && row.data.source;
      const id = { sourceId: source && source.collection || block,
        itemId: source && source.item || null, observationId: 'observation:' + (++nextObservation) };
      const reference = Engine.sourceReferenceFor(row, physicalSource);
      const admitted = results.admit({ ...id, reference });
      if (!admitted.ok) { finish('partial', admitted.refusal.code); return null; }
      admissions.set(sourceKey(block, index, tick), { id, reference });
      bindings.set(id.observationId, Object.freeze({ ...id, blockId: block,
        sourceIndex: originalIndex === undefined ? index : originalIndex, selectedIndex: index,
        external: !!tick, tick: tick || null }));
      return id;
    }
    function readSchedule() {
      if (s.recorded !== undefined && !Array.isArray(s.recorded)) throw new Error('Invalid recorded inputs.');
      let count = 0;
      for (const entry of s.recorded || []) {
        if (!entry || !Number.isSafeInteger(entry.tick) || entry.tick < 1 || entry.tick > limits.ticks ||
          !Array.isArray(entry.signals) || schedule.has(entry.tick)) throw new Error('Invalid recorded input tick.');
        count += entry.signals.length;
        if (count > Results.LIMITS.observations) throw new Error('Recorded inputs exceed the observation bound.');
        schedule.set(entry.tick, copy(entry.signals));
      }
    }
    function initialize() {
      Session.layoutFor(session, hooks);
      const blocks = session.layout.blocks, wires = session.layout.wires || [];
      const recordedBlocks = new Set(Array.from(schedule.values()).flat().map(x => x.block));
      for (const b of blocks) {
        if (EXTERNAL.has(b.type)) return finish('error', 'external-effect');
        if (b.type === 'timer') return finish('error', 'recurring-timer');
        if (b.type === 'splitter') return finish('error', 'interactive-trigger');
        if (DEVICE.has(b.type)) {
          if (!recordedBlocks.has(b.id) || (b.every || 0) > 0 || wires.some(w => w.to && w.to.block === b.id)) return finish('error', 'live-device');
        }
        // Latch levers are inert compiled controls unless a recording explicitly presses them.
        if (b.type === 'button' && !b.id.match(/__lever[12]$/) && !recordedBlocks.has(b.id)) return finish('error', 'interactive-trigger');
        if (b.type === 'sense' && b.mode === 'room' && !recordedBlocks.has(b.id)) return finish('error', 'live-device');
      }
      if (selection !== undefined && !Array.isArray(selection)) throw new Error('Invalid finite selection.');
      const chosen = new Map();
      for (const entry of selection || []) {
        if (!entry || typeof entry.blockId !== 'string' || !Array.isArray(entry.indices) || chosen.has(entry.blockId)) throw new Error('Invalid finite selection.');
        chosen.set(entry.blockId, entry.indices);
      }
      sources = blocks.filter(b => b.type === 'files' || b.type === 'feeder');
      for (const b of sources) {
        const indices = chosen.get(b.id);
        let originalIndices = null;
        if (selection !== undefined) {
          if (indices) {
            if (new Set(indices).size !== indices.length || indices.some(i => !Number.isSafeInteger(i) || i < 0 || i >= b.contents.length)) throw new Error('Invalid finite source index.');
            originalIndices = indices;
            b.contents = indices.map(i => b.contents[i]); chosen.delete(b.id);
          } else b.contents = [];
          if (b.type === 'feeder') b.once = true;
        } else if (b.type === 'feeder' && b.contents.length && !b.once) return finish('error', 'unbounded-source');
        for (let i = 0; i < b.contents.length; i++) if (!reserve(b.id, i, b.contents[i], null, originalIndices ? originalIndices[i] : i, b.type === 'feeder')) return;
      }
      if (chosen.size) throw new Error('Unknown finite source.');
      for (const [tick, signals] of schedule) for (let i = 0; i < signals.length; i++) {
        const x = signals[i], block = blocks.find(b => b.id === x.block);
        if (!block || EXTERNAL.has(block.type)) return finish('error', 'unsupported-recording');
        if (x.data || DEVICE.has(block.type)) if (!reserve(x.block, i, x, tick)) return;
      }
      if (!nextObservation && !schedule.size) return finish('error', 'empty-selection');
      Session.resetBeltLearning(session);
      Session.begin(session, { captureTerminals: true });
      initialized = true; state = 'running';
      hooks = null; assetsReady = null; selection = null;
    }
    function mapSource(event) {
      const admission = admissions.get(sourceKey(event.block, event.sourceIndex, event.external ? event.tick : 0));
      if (admission) {
        const { id, reference } = admission, actual = event.reference;
        // Source execution must agree with reservation. Never silently replace original truth
        // with an emitted or terminal reference: that would hide a provenance mismatch.
        if (!actual || reference.present !== actual.present ||
          (reference.present && (reference.kind !== actual.kind || reference.value !== actual.value))) {
          finish('error', 'source-reference-mismatch'); return;
        }
        if (flows.has(event.flowId)) { finish('error', 'source-flow-collision'); return; }
        flows.set(event.flowId, { id, physical: 0 });
      }
    }
    function emission(event) {
      let flow = flows.get(event.flowId);
      if (!flow) {
        // Signal-generated crates have a new observation only when they truly have a new
        // engine flow. Copies retaining flowId share one observation and get separate branches.
        const id = reserve(event.feeder, 'generated:' + event.item, { data: { source: event.source } });
        if (!id) return;
        flow = { id, physical: 0 }; flows.set(event.flowId, flow);
      }
      const branchId = flow.physical++ ? 'item:' + event.item : 'main';
      if (branchId !== 'main') {
        const branch = results.branch({ ...flow.id, branchId });
        if (!branch.ok) { finish('partial', branch.refusal.code); return; }
      }
      physical.set(event.item, { ...flow.id, branchId });
    }
    function terminal(event) {
      const t = event.terminal, id = physical.get(t.itemId);
      if (!id) throw new Error('Unadmitted terminal observation.');
      const filed = t.verdict === 'filed' || (t.pass && t.pass.mode === 'learn' && t.studied);
      const kind = event.t === 'drop' ? 'dropped' : filed ? 'filed' : 'landed';
      const reading = t.reading || (!t.lastReading ? { status: (t.trail || []).some(x => x.unsure) ? 'unsure' : 'unread' } :
        { status: 'answered', guess: t.lastReading.label });
      const recorded = results.record({ ...id, terminal: kind, ...(kind === 'landed' ? { reading } : {}),
        reference: t.reference, tolerance: t.tolerance, terminalId: t.block, tick: t.tick,
        evidence: { trail: t.trail || [], via: t.via || null, fields: t.fields || null, superseded: !!t.superseded } });
      if (!recorded.ok) throw new Error('Terminal result refused.');
      physical.delete(t.itemId);
    }
    function outstanding() {
      const run = session.run;
      if (run.items.length || Engine.activeFlows(run).size || Session.openIds(session).length) return true;
      for (const b of sources) {
        const state = run.blocks[b.id];
        if (state.cursor < b.contents.length || (b.contents.length && !state.doneSent)) return true;
      }
      for (const tick of schedule.keys()) if (tick > run.tick) return true;
      for (const b of Object.values(run.blocks)) {
        if ((b.dropQueue || []).length || (b.held || []).length || b.pass || (b.passQueue || []).length || b.fireAtN || b.valueDirty) return true;
        if (b.composition && (b.composition.pending.length || Object.keys(b.composition.waiting).length)) return true;
        if (b.decisions && Object.keys(b.decisions).length) return true;
      }
      return false;
    }
    function waiting(requests) {
      state = 'waiting';
      if (++waits > limits.waits) return finish('partial', 'pending-limit');
      return { ...status(), requests: requests || Array.from(session.pending.values()) };
    }
    /** Advance at most maxTicks simulation ticks. Pending work yields without advancing time. */
    function chunk(maxTicks) {
      if (!['preparing', 'running', 'waiting'].includes(state)) return status();
      const count = bounded(maxTicks, limits.chunk, LIMITS.chunk);
      try {
        if (session.cancelled || session.generation !== generation) return finish('cancelled', 'session-cancelled');
        if (!initialized) {
          if (Session.refusalOf(session)) return finish('error', Session.refusalOf(session).code);
          if (Session.openIds(session).length) return waiting();
          initialize();
          if (!initialized) return status();
        }
        state = 'running';
        for (let i = 0; i < count; i++) {
          if (session.run.tick >= limits.ticks) return finish('partial', 'tick-limit');
          if (work >= limits.work) return finish('partial', 'work-limit');
          if (!prepared) prepared = Session.prepare(session);
          if (prepared.status === 'refused') return finish('error', prepared.refusal.code);
          if (Session.refusalOf(session)) return finish('error', Session.refusalOf(session).code);
          for (const r of prepared.requests) {
            let ready;
            try { ready = Session.learningReady(session, [r]).ready; }
            catch (error) {
              // A private bank survives Stop, including its cached training cancellation.
              // Its open request must reach the host's explicit prepare/retry before get()
              // can succeed. Never retry an error from a request the host already settled.
              if (r.kind !== 'train' || !session.pending.has(r.id)) throw error;
              ready = false;
            }
            if (!ready) return waiting(prepared.requests.filter(request => session.pending.has(request.id)));
          }
          for (const r of prepared.requests) if (session.pending.has(r.id)) Session.settle(session, r.id, { ok: true });
          if (Session.openIds(session).length) return waiting();
          prepared = null; waits = 0;
          const out = Session.step(session, schedule.get(session.run.tick + 1) || []);
          work += 1 + out.events.length + out.effects.length;
          // Source events may appear after physical emits in MOVE. Resolve identities first.
          for (const event of out.events) if (event.t === 'source') mapSource(event);
          if (state !== 'running') return status();
          for (const event of out.events) {
            if (event.t === 'emit') emission(event);
            if (!['running', 'waiting'].includes(state)) return status();
            if (event.terminal) terminal(event);
          }
          for (const fx of out.effects) {
            if (fx.type === 'teach') {
              const report = {};
              Session.teach(session, fx, { report });
              if (report.refused) return finish('error', 'teach-refused');
            } else return finish('error', fx.type === 'compositionError' ? 'composition-error' : fx.type === 'libraryError' ? 'model-error' : 'external-effect');
          }
          // One full quiet tick drains edge signals (done/counter) after the last terminal.
          idle = outstanding() || out.events.length || out.effects.length ? 0 : idle + 1;
          if (idle) return finish('completed');
        }
        return status();
      } catch (_) { return finish('error', 'execution-error'); }
    }
    /** Only settle the exact request after its host work has completed; stale jobs are refused. */
    function settle(id, result) {
      if (!session) return { accepted: false, reason: 'cleared' };
      const out = Session.settle(session, id, result);
      if (out.cancelled) finish('cancelled', 'preparation-cancelled');
      if (out.accepted && !out.refusal && out.request.kind === 'asset') settledAssets = true;
      return out;
    }
    function cancel() { return finish('cancelled', 'cancelled'); }
    /** Exact source location for a local result, including its ORIGINAL compiled index before
     * selection/reordering. This bounded map owns identity metadata only, never another payload.
     * @param {object} result a row from this runner's collector
     * @returns {object|null} frozen binding; branches share their observation's source
     */
    function sourceBinding(result) {
      const binding = result && bindings.get(result.observationId);
      return binding && binding.sourceId === result.sourceId ? binding : null;
    }
    /** Resolve source payload only for deliberate inspection/selected export. The returned row
     * belongs to the isolated session (or its finite recording); no copy is retained elsewhere.
     * Neither the collector nor default export calls this method. Host must release its own
     * preview references on clear, just as it releases result snapshots.
     * @param {object} result a collector row
     * @returns {object|null} original row or recorded signal, null after clear/for derived flows
     */
    function sourceFor(result) {
      const b = sourceBinding(result);
      if (!b || !session || !session.run) return null;
      if (b.external) return (schedule.get(b.tick) || [])[b.selectedIndex] || null;
      const block = session.run.byId[b.blockId];
      return block && block.contents && block.contents[b.selectedIndex] || null;
    }
    /** Clear is irreversible for this runner; old callbacks cannot restore retained data. */
    function clear() {
      if (session) {
        Session.cancel(session, 'cleared');
        session.pending.clear(); session.stale.clear(); session.table = null;
        session.layout = null; session.run = null; session.meta = null; session.glowAlias = null;
        session.adapters = {}; session.privateScope = null;
      }
      session = null; prepared = null; hooks = null; assetsReady = null; selection = null; sources = [];
      admissions.clear(); flows.clear(); physical.clear(); schedule.clear(); bindings.clear(); results.clear();
      state = 'cleared'; reason = null;
      return status();
    }
    try {
      readSchedule();
      session = Session.createSession({ authoredTable: Session.snapshot(s.table, s.adapters),
        seed: s.seed, adapters: s.adapters, privateScope: s.privateScope });
      generation = session.generation;
      const assets = Session.requiredAssets(session, hooks);
      if (assets.length && !(assetsReady && assetsReady(assets))) {
        Session.request(session, { kind: 'asset', key: 'batch-assets', payload: assets });
      } else settledAssets = true;
    } catch (_) { finish('error', 'admission-error'); }
    // Do not retain the caller's live editor table or original recorded payloads in this closure.
    s = null;
    return { get session() { return session; }, results, limits, chunk, settle, cancel, clear, status, sourceBinding, sourceFor,
      get assetsSettled() { return settledAssets; } };
  }
  const api = { create, LIMITS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.WorkshopBatchRun = api;
})();
