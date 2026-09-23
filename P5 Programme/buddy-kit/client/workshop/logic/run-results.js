(function () {
  'use strict';
  const Record = typeof require === 'function' ? require('./evaluation-record.js') : window.WorkshopEvaluationRecord;
  const Session = typeof require === 'function' ? require('./private-session.js') : window.WorkshopPrivateSession;

  /** Session-only result retention. No engine-log scraping, payload registry, clock or I/O.
   * The runner normalizes terminal events before bounded engine evidence can be evicted.
   * Reserve each observation/branch BEFORE processing it; a full collector is a named stop,
   * never a ring that silently loses admitted work. Clear this owner with the private session.
   */
  const LIMITS = Object.freeze({ results: 2000, observations: 2000, valueChars: 4096, evidenceChars: 32768, evidenceNodes: 2048, depth: 24 });
  const DEFAULT_FIELDS = Object.freeze(['runId', 'sourceId', 'itemId', 'observationId', 'branchId', 'status']);
  const OPTIONAL_FIELDS = Object.freeze(['terminal', 'terminalId', 'tick', 'reason', 'readingStatus', 'verdict', 'referenceAvailable', 'guess', 'reference', 'sourceReference', 'error', 'tolerance', 'evidence', 'sourceText', 'sourcePhoto']);
  const END_STATES = ['completed', 'partial', 'cancelled', 'error'];
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const refusal = (code) => Object.freeze({ ok: false, refusal: Object.freeze({ code }) });
  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const v of Object.values(value)) freeze(v);
    }
    return value;
  }
  function handle(value, name) { return Session.checkHandle(value, name); }
  function limit(value, fallback, ceiling) {
    if (value === undefined) return fallback;
    if (!Number.isSafeInteger(value) || value < 1 || value > ceiling) throw new Error('Result limit must be an integer from 1 to ' + ceiling + '.');
    return value;
  }
  function scalar(value) {
    if (typeof value === 'string' && value.length <= LIMITS.valueChars) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (value === null || typeof value === 'boolean') return value;
    throw new Error('Result scalar exceeds its value budget or is not a JSON scalar.');
  }
  /** Copy JSON evidence with a deterministic work/size bound before retaining it. */
  function copyEvidence(value) {
    let nodes = 0, chars = 0;
    function copy(v, depth) {
      if (++nodes > LIMITS.evidenceNodes || depth > LIMITS.depth) throw new Error('Result evidence exceeds its node/depth budget.');
      if (v === null || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) return v;
      if (typeof v === 'string') {
        chars += v.length;
        if (chars > LIMITS.evidenceChars) throw new Error('Result evidence exceeds its character budget.');
        return v;
      }
      if (Array.isArray(v)) {
        // Sparse arrays still consume retention/JSON output space; map alone skips holes.
        if (v.length > LIMITS.evidenceNodes - nodes) throw new Error('Result evidence exceeds its node budget.');
        return Array.from(v, x => copy(x === undefined ? null : x, depth + 1));
      }
      if (!v || typeof v !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(v))) throw new Error('Result evidence must be bounded JSON.');
      const out = {};
      for (const k of Object.keys(v)) {
        chars += k.length;
        if (chars > LIMITS.evidenceChars) throw new Error('Result evidence exceeds its character budget.');
        Object.defineProperty(out, k, { value: copy(v[k], depth + 1), enumerable: true, writable: true, configurable: true });
      }
      return out;
    }
    return freeze(copy(value, 0));
  }
  const key = (sourceId, observationId) => JSON.stringify([sourceId, observationId]);
  const branchKey = (sourceId, observationId, branchId) => JSON.stringify([sourceId, observationId, branchId]);

  /**
   * Create an isolated, memory-only collector. Caller IDs remain intact for local inspection;
   * export aliases them because even legacy IDs can contain filenames or user-authored text.
   * @param {{runId?:string,maxResults?:number,maxObservations?:number}} [opts]
   * @returns {object} admit/branch/record/finish/snapshot/project/toJSON/toCSV/clear methods
   */
  function create(opts) {
    const options = opts || {};
    // Each artifact contains exactly one run. This local alias is deliberately independent
    // of unrelated sessions; the caller's actual run ID remains available only for inspection.
    const exportRunId = 'run:1';
    let runId = handle(options.runId === undefined ? exportRunId : options.runId, 'Run id');
    const maxResults = limit(options.maxResults, 1000, LIMITS.results);
    const maxObservations = limit(options.maxObservations, maxResults, Math.min(maxResults, LIMITS.observations));
    const limits = Object.freeze({ maxResults, maxObservations, evidenceChars: LIMITS.evidenceChars, evidenceNodes: LIMITS.evidenceNodes });
    const observations = new Map(), rows = new Map();
    const aliases = { sourceId: new Map(), itemId: new Map(), observationId: new Map(), branchId: new Map() };
    let status = 'running', refused = 0, reason = null, capacityReason = null;
    function alias(field, rawKey) {
      const map = aliases[field];
      if (!map.has(rawKey)) map.set(rawKey, field.replace('Id', '') + ':' + (map.size + 1));
      return map.get(rawKey);
    }
    function identity(spec) {
      if (!spec || typeof spec !== 'object') throw new Error('A result needs source and observation IDs.');
      return { sourceId: handle(spec.sourceId, 'Source id'), observationId: handle(spec.observationId, 'Observation id'), branchId: handle(spec.branchId === undefined ? 'main' : spec.branchId, 'Branch id') };
    }
    function full(code) { refused++; if (!capacityReason) capacityReason = code; return refusal(code); }
    function rowFor(spec) {
      const id = identity(spec);
      const row = rows.get(branchKey(id.sourceId, id.observationId, id.branchId));
      return row || null;
    }
    function insert(row) {
      const k = branchKey(row.sourceId, row.observationId, row.branchId);
      rows.set(k, freeze(row));
      alias('sourceId', row.sourceId);
      if (row.itemId !== null) alias('itemId', key(row.sourceId, row.itemId));
      alias('observationId', key(row.sourceId, row.observationId));
      alias('branchId', k);
      return Object.freeze({ ok: true, result: rows.get(k) });
    }
    /** Reserve one result for a source observation, even before its engine flow is emitted.
     * @param {{sourceId:string,observationId:string,itemId?:string,branchId?:string,reference?:object}} spec
     * @returns {{ok:boolean,result?:object,refusal?:{code:string}}} full means stop admission
     */
    function admit(spec) {
      if (status !== 'running') return refusal('closed');
      const id = identity(spec), k = key(id.sourceId, id.observationId);
      if (observations.has(k)) return refusal('already-admitted');
      if (rows.size >= maxResults) return full('results-full');
      if (observations.size >= maxObservations) return full('observations-full');
      const itemId = spec.itemId === undefined || spec.itemId === null ? null : handle(spec.itemId, 'Collection item id');
      const reference = Session.validateReference(spec.reference === undefined ? Session.noAnswer() : spec.reference);
      if (reference.present) scalar(reference.value);
      observations.set(k, true);
      return insert({ runId, ...id, itemId, reference, sourceReference: reference, status: 'pending', terminal: null, terminalId: null, tick: null, reason: null, outcome: null, evidence: null });
    }
    /** Reserve a parallel branch. The parent remains the continuing original branch; the new
     * branch shares collection/observation identity, never mutable result/evidence state.
     * @param {{sourceId:string,observationId:string,parentBranchId?:string,branchId:string}} spec
     */
    function branch(spec) {
      if (status !== 'running') return refusal('closed');
      const id = identity(spec);
      const parent = rowFor({ ...id, branchId: spec.parentBranchId === undefined ? 'main' : spec.parentBranchId });
      if (!parent) return refusal('unknown-observation');
      if (rows.has(branchKey(id.sourceId, id.observationId, id.branchId))) return refusal('already-admitted');
      if (rows.size >= maxResults) return full('results-full');
      return insert({ runId, ...id, itemId: parent.itemId, reference: parent.sourceReference, sourceReference: parent.sourceReference, status: 'pending', terminal: null, terminalId: null, tick: null, reason: null, outcome: null, evidence: null });
    }
    /** Record one normalized terminal snapshot, synchronously in the step that emitted it.
     * Landed answer results require an explicit reading; filed/dropped work has no invented
     * prediction. An explicit terminal reference overrides carried truth for this result while
     * sourceReference keeps the original admission truth. `status:error` records a failed branch.
     * Never pass raw source payloads as
     * evidence: source text/photos are resolved by the owning registry only on chosen export.
     * @param {{sourceId:string,observationId:string,branchId?:string,terminal?:string,status?:string,
     * reading?:object,reference?:object,tolerance?:number,evidence?:object,terminalId?:string,tick?:number,reason?:string}} spec
     */
    function record(spec) {
      if (status !== 'running') return refusal('closed');
      const row = rowFor(spec);
      if (!row) return refusal('unknown-observation');
      if (row.status !== 'pending') return refusal('already-recorded');
      const failed = spec.status === 'error';
      if (spec.status !== undefined && !['error', 'completed'].includes(spec.status)) throw new Error('Terminal result status must be completed or error.');
      const terminal = spec.terminal === undefined && failed ? null : spec.terminal;
      if (terminal !== null && !['landed', 'filed', 'dropped'].includes(terminal)) throw new Error('Unknown terminal kind.');
      const reference = spec.reference === undefined ? row.reference : Session.validateReference(spec.reference);
      if (reference.present) scalar(reference.value);
      let outcome = null;
      if (terminal === 'landed' || failed) {
        const reading = spec.reading || (failed ? { status: 'error' } : null);
        if (!reading) throw new Error('A landed result needs an explicit reading.');
        if (reading.status === 'answered') scalar(reading.guess);
        outcome = Record.outcome(row.observationId, reading, reference, { tolerance: spec.tolerance });
      } else if (spec.reading !== undefined) throw new Error('Filed/dropped results do not carry a prediction.');
      const terminalId = spec.terminalId === undefined ? null : handle(spec.terminalId, 'Terminal id');
      const tick = spec.tick === undefined ? null : spec.tick;
      if (tick !== null && (!Number.isSafeInteger(tick) || tick < 0)) throw new Error('A result tick must be a non-negative integer.');
      const terminalReason = spec.reason === undefined ? null : handle(spec.reason, 'Result reason');
      const evidence = spec.evidence === undefined ? null : copyEvidence(spec.evidence);
      return insert({ ...row, reference, status: failed || (outcome && outcome.status === 'error') ? 'error' : 'completed', terminal, terminalId, tick, reason: terminalReason, outcome, evidence });
    }
    /** Frozen session-local view; labels/references/evidence here MUST NOT be autosaved. */
    function snapshot() {
      return freeze({ runId, status, reason, limits, observations: observations.size, retained: rows.size, refused, results: Array.from(rows.values()) });
    }
    /** Close every admitted pending branch explicitly. A completed claim with unresolved work,
     * refused retention, or failed results becomes partial; never fabricate success.
     * @param {'completed'|'partial'|'cancelled'|'error'} endStatus
     * @param {string} [endReason] caller's bounded diagnostic code, never an exception message
     */
    function finish(endStatus, endReason) {
      if (status !== 'running') return snapshot();
      if (!END_STATES.includes(endStatus)) throw new Error('Unknown result completion status.');
      reason = endReason === undefined ? null : handle(endReason, 'Completion reason');
      const unresolved = Array.from(rows.values()).some(r => r.status === 'pending' || r.status === 'error');
      status = endStatus === 'completed' && (unresolved || refused) ? 'partial' : endStatus;
      if (!reason && status !== 'completed') reason = capacityReason || (status === 'cancelled' ? 'cancelled' : status === 'error' ? 'error' : 'unsettled');
      for (const [k, row] of rows) if (row.status === 'pending') rows.set(k, freeze({ ...row, status: status === 'error' ? 'error' : 'unfinished', reason }));
      return snapshot();
    }
    /** Project only chosen fields. Defaults are opaque aliases/status, stable across rows and
     * repeated projections. Registry payloads are requested only when sourceText/sourcePhoto
     * is selected; the callback is neither stored nor invoked for a default preview/export.
     * @param {{fields?:string[],resolveSource?:function}} [spec] optional fields ADD to defaults
     * @returns {{version:number,status:string,fields:string[],limits:object,observations:number,refused:number,rows:object[]}}
     */
    function project(spec) {
      const selection = spec || {};
      if (selection.fields !== undefined && !Array.isArray(selection.fields)) throw new Error('Export fields must be an array.');
      const fields = [...DEFAULT_FIELDS];
      for (const field of selection.fields || []) {
        if (!DEFAULT_FIELDS.includes(field) && !OPTIONAL_FIELDS.includes(field)) throw new Error('Unknown export field: ' + String(field));
        if (!fields.includes(field)) fields.push(field);
      }
      const sourceSelected = fields.includes('sourceText') || fields.includes('sourcePhoto');
      const projected = Array.from(rows.values(), row => {
        const out = { runId: exportRunId, sourceId: alias('sourceId', row.sourceId), itemId: row.itemId === null ? null : alias('itemId', key(row.sourceId, row.itemId)), observationId: alias('observationId', key(row.sourceId, row.observationId)), branchId: alias('branchId', branchKey(row.sourceId, row.observationId, row.branchId)), status: row.status };
        const source = sourceSelected && typeof selection.resolveSource === 'function' ? selection.resolveSource(row) : null;
        for (const field of fields.slice(DEFAULT_FIELDS.length)) {
          if (field === 'sourceText' || field === 'sourcePhoto') out[field] = source && own(source, field) ? source[field] : null;
          else if (field === 'readingStatus') out[field] = row.outcome ? row.outcome.status : null;
          else if (field === 'referenceAvailable') out[field] = row.reference.present;
          else if (field === 'guess' || field === 'verdict' || field === 'error' || field === 'tolerance') out[field] = row.outcome ? row.outcome[field] : null;
          else out[field] = row[field];
        }
        return out;
      });
      // The selected projection may intentionally include large photo data URLs. It is a
      // deliberate copy, not retained here, so the evidence retention cap does not truncate it.
      return { version: 1, status, fields, limits, observations: observations.size, refused, rows: projected };
    }
    /** Explicit JSON copy; hosts own download and field-selection confirmation. */
    function toJSON(spec) { return JSON.stringify(project(spec), null, 2); }
    /** Explicit spreadsheet-safe CSV copy. Every cell is quoted, including headers. */
    function toCSV(spec) {
      const p = project(spec);
      return [p.fields.map(csvCell).join(','), ...p.rows.map(r => p.fields.map(f => csvCell(r[f])).join(','))].join('\r\n') + '\r\n';
    }
    /** Release all sensitive references and make late callbacks unable to repopulate them. */
    function clear() {
      rows.clear(); observations.clear();
      for (const map of Object.values(aliases)) map.clear();
      runId = null; status = 'cleared'; reason = null; refused = 0; capacityReason = null;
      return snapshot();
    }
    return Object.freeze({ admit, branch, record, finish, snapshot, project, toJSON, toCSV, clear });
  }
  /** A leading formula marker (including after whitespace/control bytes) gets a literal quote.
   * RFC-style CSV quoting alone does not prevent spreadsheet formula execution.
   */
  function csvCell(value) {
    let s = value === null || value === undefined ? '' : (typeof value === 'object' ? JSON.stringify(value) : String(value));
    if (/^[\s\u0000-\u001f]*[=+\-@]/u.test(s) || /^[\t\r\n]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }
  const api = { create, LIMITS, DEFAULT_FIELDS, OPTIONAL_FIELDS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.WorkshopRunResults = api;
})();
