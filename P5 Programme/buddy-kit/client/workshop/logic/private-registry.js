(function () {
  'use strict';
  /**
   * private-registry.js — THE SESSION REGISTRY: the one owner of private material in this
   * session (private learning loop plan §3, task P2b, ruling R4; task 113 slice).
   *
   * WHAT LIVES HERE, AND NOWHERE ELSE. Each private collection (private-session.js's value), its
   * frozen split manifest, the payloads its items name (a photo's embedding, thumbnail and picked
   * file; a text; a table row), the shelves a Model is taught from it and the evaluation records
   * made on it. An authored piece holds only the collection's opaque HANDLE plus an explicit
   * dependency status (game.js `privateData`); saves, autosave, history and Buddy context see that
   * handle and nothing else. Memory only: nothing here is written anywhere — P3 owns what may
   * leave, and the "clear private session data" action builds on `forget`/`clear`.
   *
   * HANDLES NEVER REWIND (carried obligation 3). Every handle — collection, item, payload,
   * record — is `<kind>-<session nonce>-<n>` from ONE counter that only grows, so a handle names
   * one thing for the whole session: removing an item and admitting another never reuses a
   * number, and a later page load (a new nonce from the host) can never mint a handle an old
   * saved piece still names. Never the Teach shelves' `brain.nextId`, which a load restores.
   *
   * THE TAUGHT SHELVES ARE DERIVED, AND CACHED BY CONTENT (bullet 5). A Model bound to a
   * collection is taught exactly the collection's TRAINING items (membership under the current
   * split; every answered item while there is no split yet). `brain()` builds a brain-shaped value
   * from them and caches it under `trainingKey` — the content key of those items, their answers
   * and their extractor version — so the SAME brain object comes back until the training content
   * changes, and a new object the moment it does. logic/learned-state.js caches compiled states
   * per brain object and per settings, so a correction, a new training item or a moved example
   * invalidates the compiled Model and nothing else does: a Validation relabel leaves it standing.
   *
   * THE SPLIT (bullet 4). `updateSplit` is the one deliberate act that fixes membership: the first
   * call freezes a seeded proposal by whole group (private-session.js proposePiles), later calls
   * make a new manifest revision that keeps every placed item where it is — the explicit piles are
   * built from `membership(manifest, collection)`, never from the stale `manifest.piles`
   * (carried obligation 4) — and places only the waiting items: a waiting item whose group
   * already has a CURRENT member in a pile joins that pile (read from membership, not from the
   * manifest's advisory `mustJoin`); the rest are proposed by group with the same seed and shares.
   * A collection and its manifest always change here together, so they are never from sibling
   * forks.
   *
   * REFUSALS VS FAILURES follow private-session.js: a person's data or choices come back as
   * `{ok:false, refusal:{code, …}}` before anything changes; a malformed call throws.
   *
   * Pure: no DOM, clock, randomness or network — the nonce and the limits come from the host.
   * Load order: after logic/brain.js, logic/datasets.js, logic/private-session.js,
   * logic/evaluation-record.js and logic/private-examples.js.
   * Globals: window.WorkshopPrivateRegistry. CommonJS-exported for node --test.
   */
  const Session = typeof require === 'function' ? require('./private-session.js') : window.WorkshopPrivateSession;
  const Record = typeof require === 'function' ? require('./evaluation-record.js') : window.WorkshopEvaluationRecord;
  const Examples = typeof require === 'function' ? require('./private-examples.js') : window.WorkshopPrivateExamples;
  const Brain = typeof require === 'function' ? require('./brain.js') : window.WorkshopBrain;
  const Datasets = typeof require === 'function' ? require('./datasets.js') : window.WorkshopDatasets;

  /** The first split's shares when the host names none: the Splitter's own defaults (60/20/20). */
  const DEFAULT_SHARES = Object.freeze({ training: 0.6, validation: 0.2, test: 0.2 });
  const PILES = Session.PILES;

  function fail(message, details) {
    const err = new Error(message);
    if (details !== undefined) err.details = details;
    throw err;
  }
  const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const isCount = (v) => Number.isInteger(v) && v >= 0;
  const present = (item) => !!(item && item.reference && item.reference.present);
  const bySeq = (a, b) => a.seq - b.seq;
  function refusal(code, details) { return { ok: false, refusal: Object.assign({ code }, details) }; }

  /**
   * The extractor each modality's items are read by — the SAME functions the Models use on the
   * belt (game.js SENSE_REGISTRY: cam.vec reads data.vec, text.vec is Brain.textVec over the
   * tag, data.vec is Datasets.vec over the features), so a taught example and a belt crate are
   * read identically. `raw` is the un-normalised row a rule-fitting brain wants (data only).
   */
  const DEFAULT_EXTRACTORS = Object.freeze({
    photo: (payload) => ({ vec: payload.vec }),
    text: (payload) => ({ vec: Brain.textVec(payload.text) }),
    table: (payload) => ({ vec: Datasets.vec(payload.schema, payload.features), raw: Datasets.rawVec(payload.schema, payload.features) }),
  });

  /**
   * One session's registry.
   * @param {{nonce:string, limits:{incoming:number, total:number, records:number}, extractors?:object}} opts
   *   nonce: the host's per-page-load token (letters/digits, 4–32 chars); limits: the existing
   *   runtime limits — `incoming` items per admission (the tray's TRAY_MAX), `total` items per
   *   collection (also the most outcomes one evaluation record may hold), `records` evaluation
   *   records kept per collection.
   */
  function create(opts) {
    if (!isObject(opts) || typeof opts.nonce !== 'string' || !/^[0-9a-z]{4,32}$/.test(opts.nonce)) fail('A registry needs a nonce from the host: 4 to 32 lowercase letters or digits.');
    const limits = opts.limits;
    if (!isObject(limits) || !['incoming', 'total', 'records'].every((k) => isCount(limits[k]) && limits[k] > 0)) fail('A registry needs its limits: {incoming, total, records}, whole numbers above 0.');
    const extractors = Object.assign({}, DEFAULT_EXTRACTORS, opts.extractors || {});
    const nonce = opts.nonce;
    let counter = 0;
    /** The only minting: one counter, never rewound, never reset. */
    const mint = (kind) => { counter += 1; return { n: counter, handle: kind + '-' + nonce + '-' + counter }; };
    const slots = new Map();

    function slotOf(handle) {
      const slot = typeof handle === 'string' ? slots.get(handle) : undefined;
      if (!slot) fail('No private collection with that handle in this session.');
      return slot;
    }
    const itemMap = (slot) => new Map(slot.collection.items.map((i) => [i.id, i]));
    const payloadOf = (slot, item) => (item ? slot.payloads.get(item.payload) || null : null);

    /**
     * A new, empty collection for ONE modality, extractor version and answer kind.
     * @param {{modality:string, extractor:string, answerKind:'class'|'number'}} spec
     * @returns {string} its handle — the only private reference an authored piece may hold
     */
    function newCollection(spec) {
      if (!isObject(spec)) fail('newCollection needs {modality, extractor, answerKind}.');
      const { handle } = mint('c');
      const collection = Session.createCollection({ id: handle, modality: spec.modality, extractor: spec.extractor, answerKind: spec.answerKind });
      slots.set(handle, { collection, manifest: null, shares: null, payloads: new Map(), seqs: new Map(), learned: null, records: [] });
      return handle;
    }
    /** Fork membership and labels for an independent part. Immutable item/payload values and
     * frozen historical records may be shared; mutable maps, record lists and learned caches
     * never are. Original records keep their provenance, so inspection calls them old records. */
    function fork(handle) {
      const source = slotOf(handle);
      const id = mint('c').handle;
      const col = Object.freeze(Object.assign({}, source.collection, { id }));
      const split = source.manifest && Object.freeze(Object.assign({}, source.manifest, { collectionId: id }));
      slots.set(id, { collection: col, manifest: split, shares: source.shares,
        payloads: new Map(source.payloads), seqs: new Map(source.seqs), learned: null,
        records: source.records.slice() });
      return id;
    }
    /** Does this session hold the collection? (A handle from another session's save: no.) */
    function has(handle) { return typeof handle === 'string' && slots.has(handle); }
    function collection(handle) { return slotOf(handle).collection; }
    function manifest(handle) { return slotOf(handle).manifest; }
    function handles() { return [...slots.keys()]; }

    /**
     * The existing runtime limits, checked BEFORE anything is read or admitted.
     * @returns {{ok:true, held, incoming, after}|{ok:false, refusal:{code:'incoming-limit'|'total-limit', limit, incoming, held, room}}}
     */
    function capacity(handle, incoming) {
      return Session.capacity(slotOf(handle).collection, incoming, { incoming: limits.incoming, total: limits.total });
    }

    /**
     * Admit entries (private-examples.js *Entry) — all of them or none. Ids and payload handles
     * are minted here; the payloads are stored only when the collection accepted the batch.
     * @returns {{ok:true, ids:string[]}|{ok:false, refusal:object}}  refusals: private-session.js admit's
     */
    function admit(handle, entries) {
      const slot = slotOf(handle);
      if (!Array.isArray(entries)) fail('admit needs an array of entries.');
      const cap = capacity(handle, entries.length);
      if (!cap.ok) return cap;
      const raws = entries.map((e) => {
        if (!isObject(e) || !isObject(e.payload)) fail('An entry needs its payload (private-examples.js builds entries).');
        const { n } = mint('i');
        return { n, raw: { id: 'i-' + nonce + '-' + n, groupId: e.group, modality: e.modality, extractor: e.extractor, payload: 'p-' + nonce + '-' + n, reference: e.reference } };
      });
      const res = Session.admit(slot.collection, raws.map((r) => r.raw), { incoming: limits.incoming, total: limits.total });
      if (!res.ok) return res;
      slot.collection = res.collection;
      raws.forEach((r, i) => {
        slot.payloads.set(r.raw.payload, { seq: r.n, value: entries[i].payload });
        slot.seqs.set(r.n, r.raw.id);
      });
      return { ok: true, ids: raws.map((r) => r.raw.id) };
    }

    /** Set or correct answers (one gesture, one label revision). private-session.js setReferences' result. */
    function label(handle, changes) {
      const slot = slotOf(handle);
      const res = Session.setReferences(slot.collection, changes);
      if (res.ok) {
        slot.collection = res.collection;
        // Release obsolete teaching immediately; a held-out reference correction keeps the
        // unchanged trained bank. Frozen evaluation snapshots retain their original answers.
        if (slot.learned && slot.learned.key !== trainingKey(handle)) slot.learned = null;
      }
      return res;
    }

    /** Remove items: membership only; their payloads leave memory with them. */
    function remove(handle, ids) {
      const slot = slotOf(handle);
      const next = Session.removeItems(slot.collection, ids);
      const drop = new Set(ids);
      for (const item of slot.collection.items) {
        if (!drop.has(item.id)) continue;
        const p = slot.payloads.get(item.payload);
        if (p) slot.seqs.delete(p.seq);
        slot.payloads.delete(item.payload);
      }
      slot.collection = next;
      // Do not retain removed vectors in a derived shelf until the next Model read. Compiled
      // states use weak bank keys; releasing this owner lets the old bank be collected.
      if (slot.learned && slot.learned.key !== trainingKey(handle)) slot.learned = null;
      return { ok: true, removed: drop.size };
    }

    /**
     * The explicit piles of the next manifest revision: every placed item where it is NOW
     * (content-aware membership — a replaced id is waiting, a removed one is gone), plus the
     * waiting items placed by group. Pure over its arguments.
     */
    function placementPiles(m, col, seed, shares) {
      const now = Session.membership(m, col);
      const piles = { training: now.training.slice(), validation: now.validation.slice(), test: now.test.slice() };
      const byId = new Map(col.items.map((i) => [i.id, i]));
      const groupPile = new Map();
      for (const pile of PILES) for (const id of piles[pile]) groupPile.set(byId.get(id).groupId, pile);
      const free = [];
      for (const id of now.unassigned) {
        const item = byId.get(id);
        const pile = groupPile.get(item.groupId);
        if (pile) piles[pile].push(id);
        else free.push(item);
      }
      if (free.length) {
        // The new groups alone, as a collection value of their own (built through the contract's
        // own door), so the seeded proposal can never touch an item that is already placed.
        let only = Session.createCollection({ id: col.id, modality: col.modality, extractor: col.extractor, answerKind: col.answerKind });
        only = Session.admit(only, free.map((i) => ({ id: i.id, groupId: i.groupId, modality: i.modality, extractor: i.extractor, payload: i.payload, reference: i.reference })), {}).collection;
        const proposal = Session.proposePiles(only, { seed, shares });
        for (const pile of PILES) piles[pile].push(...proposal.piles[pile]);
      }
      return piles;
    }
    /**
     * THE deliberate split act. First call: freeze a seeded proposal of every item by whole group
     * at `shares` (default 60/20/20). Later calls: a new revision that keeps every placed item and
     * places the waiting ones (see placementPiles); nothing to do when the split is current and
     * nothing waits.
     * @param {string} handle
     * @param {{seed:number, shares?:{training:number, validation:number, test:number}}} opts  seed from the host
     * @returns {{ok:true, manifest:object, placed:string[], changed:boolean}|{ok:false, refusal:{code:'nothing-to-split'|…}}}
     */
    function updateSplit(handle, opts) {
      const slot = slotOf(handle);
      if (!isObject(opts) || !Number.isInteger(opts.seed)) fail('updateSplit needs an integer seed from the host.');
      const col = slot.collection;
      if (!slot.manifest) {
        if (!col.items.length) return refusal('nothing-to-split', {});
        const shares = opts.shares || DEFAULT_SHARES;
        const proposal = Session.proposePiles(col, { seed: opts.seed, shares });
        const res = Session.createManifest(col, proposal.piles);
        if (!res.ok) return res;
        slot.manifest = res.manifest;
        slot.shares = Object.freeze({ training: shares.training || 0, validation: shares.validation || 0, test: shares.test || 0 });
        return { ok: true, manifest: res.manifest, placed: col.items.map((i) => i.id).sort(), changed: true };
      }
      const before = Session.membership(slot.manifest, col);
      if (Session.manifestStatus(slot.manifest, col).current && !before.unassigned.length) return { ok: true, manifest: slot.manifest, placed: [], changed: false };
      const piles = placementPiles(slot.manifest, col, opts.seed, slot.shares || DEFAULT_SHARES);
      const res = Session.reviseManifest(slot.manifest, col, piles);
      if (!res.ok) return res;
      slot.manifest = res.manifest;
      return { ok: true, manifest: res.manifest, placed: before.unassigned.slice(), changed: true };
    }
    /**
     * The split as a person needs to hear it: whether one exists, whether it is current (and why
     * not), how many items each pile holds and how many wait. Counts only — never ids or answers.
     */
    function splitState(handle) {
      const slot = slotOf(handle);
      const col = slot.collection;
      if (!slot.manifest) return { exists: false, revision: 0, current: false, reasons: [], shares: null, counts: { training: 0, validation: 0, test: 0, waiting: col.items.length }, changes: null };
      const st = Session.manifestStatus(slot.manifest, col);
      const m = Session.membership(slot.manifest, col);
      return {
        exists: true, revision: slot.manifest.revision, current: st.current, reasons: st.reasons.slice(), shares: slot.shares,
        counts: { training: m.training.length, validation: m.validation.length, test: m.test.length, waiting: m.unassigned.length },
        changes: { added: st.added.length, removed: st.removed.length, replaced: st.replaced.length, relabelled: st.relabelled.length },
      };
    }
    /** The pile each item sits in right now (content-aware), or null for a waiting one. */
    function pileOfItem(handle, id) {
      const slot = slotOf(handle);
      if (!slot.manifest) return null;
      const m = Session.membership(slot.manifest, slot.collection);
      for (const pile of PILES) if (m[pile].includes(id)) return pile;
      return null;
    }

    /** The items a bound Model is taught: the training pile's answered items, or every answered
     *  item while there is no split. Sorted by id. */
    function taughtIds(handle) {
      const slot = slotOf(handle);
      const col = slot.collection;
      if (!slot.manifest) return col.items.filter(present).map((i) => i.id).sort();
      const byId = itemMap(slot);
      return Session.membership(slot.manifest, col).training.filter((id) => present(byId.get(id)));
    }
    /**
     * The content key of what a bound Model is taught — the learned cache's key. With a split it
     * is private-session.js trainingRevision (the training items' ids, payloads, extractor versions
     * and answers under the current membership); before a split, the same content identity over
     * every answered item.
     */
    function trainingKey(handle) {
      const slot = slotOf(handle);
      const col = slot.collection;
      if (slot.manifest) return 'split:' + Session.trainingRevision(col, slot.manifest);
      return 'all:' + Session.identity([col.id, col.extractor, Session.contentKey(col.items.filter(present))]);
    }
    /**
     * The shelves a bound Model is taught from, as a brain-shaped value, cached under
     * trainingKey: the same object until the taught content changes (so learned-state.js keeps
     * its compiled state), a new object as soon as it does (so it recompiles).
     * @param {string} handle
     * @param {(item:object) => string} [displayOf]  what Evidence shows for an example
     */
    function brain(handle, displayOf) {
      const slot = slotOf(handle);
      const key = trainingKey(handle);
      if (slot.learned && slot.learned.key === key) return slot.learned.brain;
      const byId = itemMap(slot);
      const read = extractors[slot.collection.modality];
      const items = taughtIds(handle).map((id) => byId.get(id));
      const shelves = Examples.shelvesFrom(items, (item) => {
        const p = payloadOf(slot, item);
        if (!p) return null;
        const v = read(p.value);
        return v && Array.isArray(v.vec) ? { seq: p.seq, vec: v.vec, raw: v.raw } : null;
      }, displayOf);
      slot.learned = { key, brain: shelves };
      return shelves;
    }
    /** The configuration a result was produced under: the training content key and the learner's
     *  canonical revision (extractor, brain, version, every decision setting). */
    function learnedRevision(handle, learner) { return trainingKey(handle) + '|' + Session.learnerRevision(learner); }

    /** The item an example id (its seq) names, or null. */
    function itemOfSeq(handle, seq) {
      const slot = slotOf(handle);
      const id = slot.seqs.get(Number(seq));
      return id ? itemMap(slot).get(id) || null : null;
    }
    /** The payload an item names (memory only; the caller must not keep it). */
    function payload(handle, id) {
      const slot = slotOf(handle);
      const p = payloadOf(slot, itemMap(slot).get(id));
      return p ? p.value : null;
    }
    /** An example's number (its seq) — the id the taught shelves and Evidence use. */
    function seqOf(handle, id) {
      const slot = slotOf(handle);
      const p = payloadOf(slot, itemMap(slot).get(id));
      return p ? p.seq : null;
    }
    /** The thumbnail kept for the example `seq` names, or null. */
    function thumb(handle, seq) {
      const item = has(handle) ? itemOfSeq(handle, seq) : null;
      const p = item ? payloadOf(slotOf(handle), item) : null;
      return (p && p.value && p.value.thumb) || null;
    }

    /**
     * The crates a Files block deals for this collection, one per item in admission order: the
     * modality's legacy crate plus explicit answer presence, the source and — ONLY when the split
     * is current — the fixed pile (null for an item that waits). A stale or missing split stamps
     * nothing: routing by a stale manifest would place an id by an old pin.
     * @param {string} handle
     * @param {(item:object, seq:number) => string|null} [imageOf]  the crate's picture handle
     */
    function crates(handle, imageOf) {
      const slot = slotOf(handle);
      const col = slot.collection;
      const current = !!slot.manifest && Session.manifestStatus(slot.manifest, col).current;
      const m = current ? Session.membership(slot.manifest, col) : null;
      const pileOf = (id) => { for (const pile of PILES) if (m[pile].includes(id)) return pile; return null; };
      return col.items.map((item) => ({ item, p: payloadOf(slot, item) })).filter((x) => x.p).sort((a, b) => bySeq(a.p, b.p))
        .map(({ item, p }) => Examples.crateFor(item, p.value, {
          collection: handle, image: imageOf ? imageOf(item, p.seq) : null,
          pile: current ? pileOf(item.id) : undefined, key: current ? slot.manifest.key : null,
        }));
    }

    /**
     * Freeze one evaluation run (evaluation-record.js record) on the CURRENT split and keep it.
     * @param {string} handle
     * @param {{pile:string, learner:object, seed?:number|null, readings:Array, evaluated?:string[], training?:{ids:string[]}, tolerance?:number}} spec
     * @returns {{ok:true, snapshot:object}|{ok:false, refusal:{code:'no-split'|'records-limit'|…}}}
     */
    function record(handle, spec) {
      const slot = slotOf(handle);
      if (!isObject(spec)) fail('record needs {pile, learner, readings}.');
      if (!slot.manifest) return refusal('no-split', {});
      if (slot.records.length >= limits.records) return refusal('records-limit', { limit: limits.records, held: slot.records.length });
      const { handle: id } = mint('e');
      const res = Record.record(Object.assign({}, spec, { id, collection: slot.collection, manifest: slot.manifest, limits: { outcomes: limits.total } }));
      if (!res.ok) return res;
      slot.records.push(res.snapshot);
      return res;
    }
    /** The records kept for this collection, oldest first (frozen snapshots). */
    function records(handle) { return slotOf(handle).records.slice(); }
    /** Forget one record (every add needs a remove). */
    function forgetRecord(handle, id) {
      const slot = slotOf(handle);
      const before = slot.records.length;
      slot.records = slot.records.filter((r) => r.id !== id);
      return before !== slot.records.length;
    }

    /** Drop one collection and everything that names it. */
    function forget(handle) { return slots.delete(handle); }
    /** Drop every collection — the session's private material, gone. */
    function clear() { slots.clear(); }
    /** Counts only (no ids, answers or payloads): what a diagnostic may read. */
    function stats() {
      let items = 0, payloads = 0, recs = 0;
      for (const s of slots.values()) { items += s.collection.items.length; payloads += s.payloads.size; recs += s.records.length; }
      return { collections: slots.size, items, payloads, records: recs };
    }

    return {
      limits: Object.freeze(Object.assign({}, limits)),
      newCollection, fork, has, collection, manifest, handles, capacity, admit, label, remove,
      updateSplit, splitState, pileOfItem, taughtIds, trainingKey, brain, learnedRevision,
      itemOfSeq, payload, seqOf, thumb, crates, record, records, forgetRecord, forget, clear, stats,
    };
  }

  const api = { DEFAULT_SHARES, DEFAULT_EXTRACTORS, create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.WorkshopPrivateRegistry = api;
})();
