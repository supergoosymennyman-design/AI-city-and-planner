(function () {
  'use strict';
  /**
   * private-session.js — the pure contracts of a PRIVATE COLLECTION: session items, reference
   * answers, admission, frozen split manifests and the revisions that name them (private learning
   * loop plan §3, task P2a; task 113 slice).
   *
   * WHAT IT OWNS. Three identities the plan keeps distinct: the collection ITEM (stable across
   * runs — this module), the observation/flow (`flowId`, engine.js/composition.js, untouched) and
   * the evaluation run (evaluation-record.js, which builds on this file). Every id, group key,
   * payload reference, seed and limit is SUPPLIED BY THE HOST: nothing here reads a clock, a
   * random source, the DOM, the network or a file system. A "payload" is an opaque handle into the
   * host's memory-only session registry (P2b), never a filename, a vector or an image.
   *
   * REFERENCE-ANSWER PRESENCE IS DEFINED ONCE, HERE (ruling R5): `{present:false}` or
   * `{present:true, kind:'class'|'number', value}`. Zero, the empty string and every other falsy
   * value are ordinary answers when presence says so. P4 adapts legacy crates (a Files photo crate
   * is `{label:'', value:1}` and today grades as a wrong number — P1 evidence §7 gap 2) into this
   * same shape inside the engine; it invents no second field.
   *
   * MEMBERSHIP IS FIXED BY ITEM ID, GUARDED BY GROUP. A manifest revision lists the item ids of
   * each pile (training / validation / test). Items that share a group (identical source content,
   * one email thread — the HOST computes the key; nothing here claims semantic duplicate
   * detection) may not sit in two piles; a group split across piles is refused, never repaired.
   * A new item stays unassigned until a new manifest revision deliberately places it, and a new
   * member of a group that is already placed may only join that group's pile. Import order and
   * pile listing order cannot change membership: everything is keyed and sorted.
   *
   * REVISIONS ARE COUNTERS; IDENTITY IS CONTENT. Values are immutable and the Workshop has Undo
   * and history, so two branches of one collection can both be "revision 3" and two manifests
   * built from the same parent can both be "revision 2" with different piles (fix round 1).
   * Counters stay for reading; every check that vouches for WHICH value something belongs to
   * uses a content key (`identity`, the pure precedent of logic/model-library.js `identity()`).
   * WHAT AN ITEM IS is its id AND its payload handle AND the feature/extractor version that read
   * it (fix round 2): a removed id can be admitted again and the Workshop's example counter
   * rewinds on reload, so the same id, group and label can come back naming another photo — and
   * a payload re-read by another extractor is other content to a Model. So: a collection carries
   * `membershipKey` (id + payload + extractor per item) and `labelKey` (the same plus the
   * reference answer), a manifest carries `key` (its assignment) and pins, per item, the payload,
   * extractor and answer it saw, `manifestStatus` diffs that content (`added`, `removed`,
   * `replaced`, `relabelled`), `trainingRevision` is the content key of what a taught Model
   * depends on, and `contentKey` gives evaluation-record.js the same identity over evaluated items.
   * A REPLACED EXAMPLE IS A NEW ITEM (fix round 3): it is not placed by its old id — the
   * acknowledge revision drops it, `membership` and `unassigned` list it as waiting (the pinned
   * version under `missing`), and only explicit piles place it — so import numbering can never
   * decide membership. `pileOf` answers by id and is for a CURRENT manifest only.
   *
   * HOST INVARIANT (carried to P2b, enforced there): a payload handle names ONE content for the
   * whole session. The host mints handles from a content digest or a never-rewinding counter —
   * never from a counter that resets on reload the way the Teach shelves' example counter
   * (`brain.nextId`, restored from saved state) does. This module tells "same id, other payload"
   * apart; it cannot tell "same handle, other bytes" apart: that is the host's promise.
   *
   * REFUSALS VS FAILURES. Conditions that depend on the person's data or choices (caps, a feature
   * version that does not match, contradictory piles, a stale revision) come back as a value:
   * `{ok:false, refusal:{code, ...counts and opaque ids}}`, BEFORE anything is admitted — never a
   * silent truncation or a half-admitted batch. Malformed calls (wrong types, unknown ids, missing
   * host limits) throw, loudly. Refusals carry codes, not sentences: the host's STRINGS speak.
   *
   * EXISTING EQUIVALENTS CHECKED (plan §2: reuse, never two owners):
   * - logic/board.js `fingerprint`/`commit`: same-experiment identity for a MACHINE (pieces,
   *   wires, dataset name) and an archive that never deletes. Different axis (topology, not data
   *   revisions); not reused. Its never-delete stance is kept: old records are labelled old.
   * - logic/brain-lab.js `create`: freezes examples for one isolated query investigation; no
   *   identity or revision across runs. Not an owner of collections or splits.
   * - logic/model-library.js: `validateData` (a binding of dataset + split + de-duplicated ids)
   *   and `train` (`trainingIds` + options + `identity()`) are the public-catalogue precedent for
   *   "which rows"; they are bound to the packaged catalogue and to public data, so they are
   *   mirrored, not reused. `PHOTO_FEATURES` is the extractor version a photo item carries.
   * - logic/learned-state.js: invalidates a compiled bank by exact example comparison and
   *   `budget()` refuses oversized TRAINING before it runs. It stays the owner of training-time
   *   caps; this file owns collection admission (per import / total) with limits the host passes,
   *   and `trainingRevision` is the key P2b binds that cache to.
   * - logic/runtime-budget.js `exceeded(run)`: run-time retention caps checked BEFORE a tick.
   *   Same "check first, never prune evidence" rule; its numbers are hard-coded, these are not.
   * - logic/table-import.js MAX_ROWS: a cap that truncates and says so. The plan forbids partial
   *   admission for private examples, so `admit` refuses the whole batch instead.
   * - logic/rng.js: the product's one seeded shuffle; `proposePiles` uses it on SORTED group keys.
   *
   * Load order: after logic/rng.js, before logic/evaluation-record.js (P2b wires index.html).
   * Globals: window.WorkshopPrivateSession. CommonJS-exported for node --test.
   */
  const Rng = typeof require === 'function' ? require('./rng.js') : window.WorkshopRng;

  /** The input paths that exist today (P1 evidence §5); the item contract is the same for all three. */
  const MODALITIES = Object.freeze(['photo', 'table', 'text']);
  /** What a reference answer is: a class (a word, compared exactly) or a measured number (a tolerance). */
  const ANSWER_KINDS = Object.freeze(['class', 'number']);
  /** The engine's pile names (engine.js pileFor), in the order membership is reported. */
  const PILES = Object.freeze(['training', 'validation', 'test']);
  /** Handles are short opaque strings — not content, not paths. composition.js caps a flow id at 160. */
  const HANDLE_MAX = 200;
  const UNSAFE_KEYS = ['__proto__', 'constructor', 'prototype'];

  function fail(message, details) {
    const err = new Error(message);
    if (details !== undefined) err.details = details;
    throw err;
  }
  /** Deep-freeze plain data. Everything this module returns is frozen: a manifest is a manifest. */
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
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  /** A plain object whose keys are inserted in sorted order, so its JSON is order-independent. */
  function sortedKeys(obj) {
    const out = {};
    for (const k of Object.keys(obj).sort()) out[k] = obj[k];
    return out;
  }
  function refusal(code, details) { return freeze({ ok: false, refusal: Object.assign({ code }, details) }); }

  /**
   * A content identity: FNV-1a over the JSON of a canonical (sorted) value — the same pure
   * precedent as logic/model-library.js `identity()` (duplicated, not required: that module
   * carries the packaged catalogue and sits above this one) — in two lanes with different offset
   * bases, 16 hex chars, so a session's handful of keys cannot realistically collide. Equal
   * content gives equal keys whatever the history; that is what a counter cannot promise.
   * @param {*} value  JSON-safe, already canonically ordered
   * @returns {string}
   */
  function identity(value) {
    const text = JSON.stringify(value);
    let a = 2166136261, b = 0x9747b28c;
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      a = Math.imul(a ^ c, 16777619);
      b = Math.imul(b ^ c, 16777619) ^ (b >>> 13);
    }
    return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
  }
  /** Two reference answers with the same presence, kind and value (0 === -0; both absent counts). */
  function sameReference(a, b) {
    if (!a || !b || a.present !== b.present) return false;
    return !a.present || (a.kind === b.kind && a.value === b.value);
  }
  /** Is the item the very example a manifest pinned under its id (same payload handle, same extractor version)? */
  const sameExample = (pin, item) => !!pin && !!item && pin.payload === item.payload && pin.extractor === item.extractor;
  const byId0 = (x, y) => (x[0] < y[0] ? -1 : 1);
  /** What an item IS to a Model, in id order: id, payload handle and the extractor version that read it. */
  const examplePairs = (items) => items.map((i) => [i.id, i.payload, i.extractor]).sort(byId0);
  /** The same, with each item's reference answer — the canonical form every content key hashes. */
  const contentPairs = (items) => items.map((i) => [i.id, i.payload, i.extractor, i.reference]).sort(byId0);
  /**
   * The content identity of a set of items (id, payload, extractor version, reference answer),
   * order-free. evaluation-record.js keys a snapshot's evaluated items with it.
   * @param {Array<object>} items
   * @returns {string}
   */
  function contentKey(items) {
    if (!Array.isArray(items)) fail('contentKey needs an array of items.');
    return identity(contentPairs(items));
  }

  /**
   * Validate one opaque handle (an item id, a group key, a payload reference, a version string).
   * @param {*} value
   * @param {string} what  names the argument in the error
   * @returns {string}
   */
  function checkHandle(value, what) {
    if (typeof value !== 'string' || !value || value.length > HANDLE_MAX) fail(what + ' must be a non-empty string of at most ' + HANDLE_MAX + ' characters.');
    if (UNSAFE_KEYS.includes(value)) fail(what + ' may not be a reserved word.');
    return value;
  }

  // ------------------------------------------------------------------ reference answers (R5)
  const NO_ANSWER = freeze({ present: false });

  /**
   * THE reference-answer shape, validated. Presence is an explicit boolean; an absent answer
   * carries neither kind nor value; a present answer is a string (class — '' allowed) or a finite
   * number (number — 0 allowed). Returns a frozen normalised copy; throws on anything else.
   * @param {*} ref
   * @returns {{present:false}|{present:true, kind:'class'|'number', value:string|number}}
   */
  function validateReference(ref) {
    if (!isObject(ref) || typeof ref.present !== 'boolean') fail('A reference answer needs an explicit presence flag ({present:true|false}).');
    if (!ref.present) {
      if (own(ref, 'value') || own(ref, 'kind')) fail('An absent reference answer carries no kind or value.');
      return NO_ANSWER;
    }
    if (!ANSWER_KINDS.includes(ref.kind)) fail('A reference answer is a class (a word) or a number.');
    if (ref.kind === 'class' && typeof ref.value !== 'string') fail('A class reference answer must be a string (the empty string is allowed).');
    if (ref.kind === 'number' && !(typeof ref.value === 'number' && Number.isFinite(ref.value))) fail('A number reference answer must be a finite number (zero is allowed).');
    return freeze({ present: true, kind: ref.kind, value: ref.value });
  }
  /** A present reference answer of `kind`. */
  function answer(kind, value) { return validateReference({ present: true, kind, value }); }
  /** The one absent reference answer. */
  function noAnswer() { return NO_ANSWER; }
  /** Explicit presence, never truthiness of the value. */
  function isPresent(ref) { return validateReference(ref).present; }

  // ------------------------------------------------------------------ items
  /**
   * Validate one session item as the host supplies it. `reference` defaults to absent.
   * @param {{id:string, groupId:string, modality:string, extractor:string, payload:string, reference?:object}} raw
   * @returns {object} frozen item
   */
  function validateItem(raw) {
    if (!isObject(raw)) fail('A session item must be an object.');
    if (!MODALITIES.includes(raw.modality)) fail('An item modality is photo, table or text.');
    return freeze({
      id: checkHandle(raw.id, 'An item id'),
      groupId: checkHandle(raw.groupId, 'An item groupId'),
      modality: raw.modality,
      extractor: checkHandle(raw.extractor, 'An item extractor version'),
      payload: checkHandle(raw.payload, 'An item payload reference'),
      reference: validateReference(raw.reference === undefined ? NO_ANSWER : raw.reference),
    });
  }
  /**
   * What feature extraction may see: the payload reference and how to read it — never the
   * reference answer (plan §3: "No reference answer is exposed to feature extraction").
   */
  function payloadView(item) {
    if (!isObject(item)) fail('payloadView needs an item.');
    return freeze({ id: item.id, modality: item.modality, extractor: item.extractor, payload: item.payload });
  }

  // ------------------------------------------------------------------ collections
  /** The two content keys of a collection's items (see `identity`): the examples, and the examples with their answers. */
  const contentKeys = (items) => ({ membershipKey: identity(examplePairs(items)), labelKey: identity(contentPairs(items)) });
  /**
   * An empty private collection. It fixes ONE modality, ONE extractor version and ONE answer
   * kind; every admitted item must match all three. `revision` counts membership changes,
   * `labelRevision` counts reference-answer changes; both start at 1. `membershipKey` is the
   * content identity of the examples (id, payload, extractor version), `labelKey` of the examples
   * with their answers.
   * @param {{id:string, modality:string, extractor:string, answerKind:'class'|'number'}} spec
   */
  function createCollection(spec) {
    if (!isObject(spec)) fail('createCollection needs {id, modality, extractor, answerKind}.');
    if (!MODALITIES.includes(spec.modality)) fail('A collection modality is photo, table or text.');
    if (!ANSWER_KINDS.includes(spec.answerKind)) fail('A collection answers with a class or a number.');
    return freeze(Object.assign({ id: checkHandle(spec.id, 'A collection id'), modality: spec.modality, extractor: checkHandle(spec.extractor, 'A collection extractor version'),
      answerKind: spec.answerKind, revision: 1, labelRevision: 1, items: [] }, contentKeys([])));
  }
  function checkCollection(c) {
    if (!isObject(c) || typeof c.id !== 'string' || !Array.isArray(c.items) || !Number.isInteger(c.revision) || !Number.isInteger(c.labelRevision)
      || typeof c.membershipKey !== 'string' || typeof c.labelKey !== 'string') fail('Not a session collection.');
    return c;
  }
  /** The next collection value: counters as given, content keys always recomputed from the items. */
  const next = (collection, changes) => {
    const merged = Object.assign({}, collection, changes);
    return freeze(Object.assign(merged, contentKeys(merged.items)));
  };
  const itemMap = (collection) => new Map(collection.items.map((i) => [i.id, i]));

  /**
   * The runtime cap as a pure check, BEFORE anything is admitted. Limits come from the host
   * (TRAY_MAX per import, the collection's total); each is optional but the object is not.
   * @param {object} collection
   * @param {number} incoming  how many items the host wants to admit
   * @param {{incoming?:number, total?:number}} limits
   * @returns {{ok:true, held:number, incoming:number, after:number}
   *   | {ok:false, refusal:{code:'incoming-limit'|'total-limit', limit:number, incoming:number, held:number, room:number}}}
   *   `room` = how many WOULD fit, so the host can say so; nothing here trims the batch to it.
   */
  function capacity(collection, incoming, limits) {
    checkCollection(collection);
    if (!Number.isInteger(incoming) || incoming < 0) fail('capacity needs a whole number of incoming items.');
    if (!isObject(limits)) fail('Admission needs the host\'s limits: {incoming, total} (each optional).');
    for (const k of ['incoming', 'total']) if (limits[k] !== undefined && !(Number.isInteger(limits[k]) && limits[k] >= 0)) fail('A limit is a whole number of items.');
    const held = collection.items.length;
    const room = Math.min(limits.incoming === undefined ? Infinity : limits.incoming, limits.total === undefined ? Infinity : Math.max(0, limits.total - held));
    if (limits.incoming !== undefined && incoming > limits.incoming) return refusal('incoming-limit', { limit: limits.incoming, incoming, held, room });
    if (limits.total !== undefined && held + incoming > limits.total) return refusal('total-limit', { limit: limits.total, incoming, held, room });
    return freeze({ ok: true, held, incoming, after: held + incoming });
  }

  /**
   * THE door into a collection: all of the batch or none of it. Caps first (`capacity`), then
   * every item must wear the collection's modality, extractor version and answer kind. Admitting
   * items is a membership change (`revision` + 1); labels are unchanged. Each admitted item is
   * stamped `revised` = the label revision its reference was set at.
   * @returns {{ok:true, collection:object, added:number}
   *   | {ok:false, refusal:{code:'incoming-limit'|'total-limit'|'modality-mismatch'|'extractor-mismatch'|'answer-kind-mismatch', ...}}}
   */
  function admit(collection, rawItems, limits) {
    checkCollection(collection);
    if (!Array.isArray(rawItems)) fail('admit needs an array of items.');
    const items = rawItems.map(validateItem);
    const ids = new Set(collection.items.map((i) => i.id));
    for (const it of items) {
      if (ids.has(it.id)) fail('An item id is already in this collection or repeated in the batch.');
      ids.add(it.id);
    }
    const cap = capacity(collection, items.length, limits);
    if (!cap.ok) return cap;
    const mismatch = (code, expected, found) => refusal(code, { expected, found: sorted(unique(found)), count: found.length });
    const modalities = items.filter((i) => i.modality !== collection.modality).map((i) => i.modality);
    if (modalities.length) return mismatch('modality-mismatch', collection.modality, modalities);
    const extractors = items.filter((i) => i.extractor !== collection.extractor).map((i) => i.extractor);
    if (extractors.length) return mismatch('extractor-mismatch', collection.extractor, extractors);
    const kinds = items.filter((i) => i.reference.present && i.reference.kind !== collection.answerKind).map((i) => i.reference.kind);
    if (kinds.length) return mismatch('answer-kind-mismatch', collection.answerKind, kinds);
    if (!items.length) return freeze({ ok: true, collection, added: 0 });
    const stamped = items.map((i) => freeze(Object.assign({}, i, { revised: collection.labelRevision })));
    return freeze({ ok: true, added: stamped.length, collection: next(collection, { revision: collection.revision + 1, items: collection.items.concat(stamped) }) });
  }

  /**
   * Remove items (plan §3: deleting one example changes only its membership). A membership
   * change: `revision` + 1. An unknown id throws; an empty list returns the same collection.
   */
  function removeItems(collection, ids) {
    checkCollection(collection);
    if (!Array.isArray(ids)) fail('removeItems needs an array of item ids.');
    const drop = new Set(ids.map((id) => checkHandle(id, 'An item id')));
    const have = new Set(collection.items.map((i) => i.id));
    for (const id of drop) if (!have.has(id)) fail('removeItems names an item that is not in this collection.');
    if (!drop.size) return collection;
    return next(collection, { revision: collection.revision + 1, items: collection.items.filter((i) => !drop.has(i.id)) });
  }

  /**
   * Labelling and correction are the same act: set the reference answers of some items. Any real
   * change is one new `labelRevision` for the whole batch (one gesture, one revision); items whose
   * answer did not change are left alone, and a batch that changes nothing returns the SAME
   * collection object with `changed: []`. Test labels therefore never change silently: a manifest
   * pinned to the old label revision reads stale (`manifestStatus`) until it is revised.
   * @param {object} collection
   * @param {Array<{id:string, reference:object}>} changes
   * @returns {{ok:true, collection:object, changed:string[]} | {ok:false, refusal:{code:'answer-kind-mismatch', ...}}}
   */
  function setReferences(collection, changes) {
    checkCollection(collection);
    if (!Array.isArray(changes)) fail('setReferences needs an array of {id, reference}.');
    const byId = itemMap(collection);
    const wanted = new Map();
    for (const ch of changes) {
      if (!isObject(ch)) fail('setReferences needs {id, reference} entries.');
      const id = checkHandle(ch.id, 'An item id');
      if (!byId.has(id)) fail('setReferences names an item that is not in this collection.');
      if (wanted.has(id)) fail('setReferences names an item twice.');
      wanted.set(id, validateReference(ch.reference));
    }
    const kinds = [...wanted.values()].filter((r) => r.present && r.kind !== collection.answerKind).map((r) => r.kind);
    if (kinds.length) return refusal('answer-kind-mismatch', { expected: collection.answerKind, found: sorted(unique(kinds)), count: kinds.length });
    const changed = [...wanted].filter(([id, ref]) => !sameReference(byId.get(id).reference, ref)).map(([id]) => id);
    if (!changed.length) return freeze({ ok: true, collection, changed: [] });
    const labelRevision = collection.labelRevision + 1;
    const set = new Set(changed);
    const items = collection.items.map((i) => (set.has(i.id) ? freeze(Object.assign({}, i, { reference: wanted.get(i.id), revised: labelRevision })) : i));
    return freeze({ ok: true, changed: sorted(changed), collection: next(collection, { labelRevision, items }) });
  }

  /** The item with this id, or null. */
  function itemById(collection, id) {
    checkCollection(collection);
    return collection.items.find((i) => i.id === id) || null;
  }
  /** Every item of one group (the host's content key), in id order. */
  function groupItems(collection, groupId) {
    checkCollection(collection);
    return freeze(collection.items.filter((i) => i.groupId === groupId).slice().sort((a, b) => (a.id < b.id ? -1 : 1)));
  }
  /** Every group key present, sorted. */
  function groupIds(collection) {
    checkCollection(collection);
    return freeze(sorted(unique(collection.items.map((i) => i.groupId))));
  }

  // ------------------------------------------------------------------ split manifests
  function checkManifest(m) {
    if (!isObject(m) || typeof m.collectionId !== 'string' || !Number.isInteger(m.revision) || typeof m.key !== 'string' || !isObject(m.piles) || !isObject(m.assigned)
      || !isObject(m.groups) || !Array.isArray(m.roster) || !isObject(m.pinned)) fail('Not a split manifest.');
    return m;
  }
  /**
   * Build one manifest revision from explicit piles of item ids. Refuses (never repairs) an item
   * listed in two piles and a group whose items straddle piles. An id the collection does not hold
   * throws (a host error, not a person's choice). Ids listed twice in the SAME pile are one.
   */
  function buildManifest(collection, piles, revision) {
    if (!isObject(piles)) fail('A manifest needs piles: {training, validation, test} of item ids.');
    for (const key of Object.keys(piles)) if (!PILES.includes(key)) fail('Unknown pile "' + key + '": piles are training, validation and test.');
    const byId = itemMap(collection);
    const assigned = {};
    const contradictions = new Set();
    for (const pile of PILES) {
      const list = piles[pile] === undefined ? [] : piles[pile];
      if (!Array.isArray(list)) fail('A pile is an array of item ids.');
      for (const raw of list) {
        const id = checkHandle(raw, 'A pile item id');
        if (!byId.has(id)) fail('A pile names an item that is not in this collection.', { pile });
        if (own(assigned, id) && assigned[id] !== pile) contradictions.add(id);
        else assigned[id] = pile;
      }
    }
    if (contradictions.size) return refusal('item-in-two-piles', { items: sorted([...contradictions]) });
    const groupPiles = new Map();
    for (const id of Object.keys(assigned)) {
      const g = byId.get(id).groupId;
      if (!groupPiles.has(g)) groupPiles.set(g, new Set());
      groupPiles.get(g).add(assigned[id]);
    }
    const split = [...groupPiles].filter(([, p]) => p.size > 1)
      .map(([group, p]) => ({ group, piles: PILES.filter((x) => p.has(x)) }))
      .sort((a, b) => (a.group < b.group ? -1 : 1));
    if (split.length) return refusal('group-split', { groups: split });
    const out = { training: [], validation: [], test: [] };
    for (const id of Object.keys(assigned)) out[assigned[id]].push(id);
    const groups = {};
    for (const [g, p] of groupPiles) groups[g] = [...p][0];
    const assignedSorted = sortedKeys(assigned);
    const roster = sorted([...byId.keys()]);
    // The manifest PINS what it saw: every item id (roster) and, per item, the payload handle,
    // the extractor version and the reference answer (pinned), so manifestStatus can diff
    // content, not counters — two branches of one collection can share every counter and still
    // hold different items, other content under the same id, or different labels.
    const pinned = {};
    for (const id of roster) {
      const item = byId.get(id);
      pinned[id] = { payload: item.payload, extractor: item.extractor, reference: item.reference };
    }
    return freeze({ ok: true, manifest: {
      collectionId: collection.id, revision, collectionRevision: collection.revision, labelRevision: collection.labelRevision,
      key: identity(Object.keys(assignedSorted).map((id) => [id, assignedSorted[id]])),
      piles: { training: sorted(out.training), validation: sorted(out.validation), test: sorted(out.test) },
      assigned: assignedSorted, groups: sortedKeys(groups), roster, pinned,
    } });
  }
  /**
   * Revision 1 of a split manifest for this collection.
   * @param {object} collection
   * @param {{training?:string[], validation?:string[], test?:string[]}} piles  item ids (a group is
   *   a constraint, not a unit: expand one with `groupItems`)
   * @returns {{ok:true, manifest:object} | {ok:false, refusal:{code:'item-in-two-piles'|'group-split', ...}}}
   *   manifest = {collectionId, revision, collectionRevision, labelRevision, key (content identity of
   *   the assignment), piles, assigned:{id:pile}, groups:{groupId:pile}, roster:[every item id at
   *   this revision], pinned:{id: {payload, extractor, reference} at this revision}} — frozen.
   */
  function createManifest(collection, piles) { return buildManifest(checkCollection(collection), piles, 1); }
  /**
   * The next revision: `piles` is the COMPLETE new assignment (every id to keep, plus the new
   * ones). Without `piles` the current piles are carried, minus items the collection no longer
   * holds AND minus ids that now name other content (a replaced example is a new item: it waits,
   * unassigned, until piles place it on purpose) — the deliberate "acknowledge the collection
   * changed, nothing new is placed" revision. Import numbering therefore never decides membership.
   * @returns {{ok:true, manifest:object} | {ok:false, refusal:{code:'wrong-collection'|'item-in-two-piles'|'group-split', ...}}}
   */
  function reviseManifest(manifest, collection, piles) {
    checkManifest(manifest); checkCollection(collection);
    if (manifest.collectionId !== collection.id) return refusal('wrong-collection', { expected: manifest.collectionId, found: collection.id });
    let keep = piles;
    if (keep === undefined) {
      const byId = itemMap(collection);
      keep = {};
      for (const pile of PILES) keep[pile] = (manifest.piles[pile] || []).filter((id) => sameExample(manifest.pinned[id], byId.get(id)));
    }
    return buildManifest(collection, keep, manifest.revision + 1);
  }
  /**
   * THE membership query a manifest-backed source routes by: the pile of one item id, or null
   * (unassigned). It answers BY ID and is valid on a CURRENT manifest only (`manifestStatus`): on a
   * stale one an id may name other content than the pin — `membership` and `unassigned` are the
   * content-aware queries, and the host revises before routing.
   */
  function pileOf(manifest, id) {
    checkManifest(manifest);
    return own(manifest.assigned, id) ? manifest.assigned[id] : null;
  }
  /** The pile a group already sits in (a new member may join only that pile), or null. */
  function pileOfGroup(manifest, groupId) {
    checkManifest(manifest);
    return own(manifest.groups, groupId) ? manifest.groups[groupId] : null;
  }
  /**
   * Membership of the collection's CURRENT items under this manifest, every list sorted. An item
   * is in a pile only when it is the very example the manifest placed there (same id AND same
   * payload/extractor pin); an id that now names other content is `unassigned` (waiting) and its
   * pinned version is `missing`. `missing` = placed ids whose pinned example the collection no
   * longer holds — gone, or replaced.
   * @returns {{training:string[], validation:string[], test:string[], unassigned:string[], missing:string[]}}
   */
  function membership(manifest, collection) {
    checkManifest(manifest); checkCollection(collection);
    if (manifest.collectionId !== collection.id) fail('This manifest belongs to a different collection.');
    const out = { training: [], validation: [], test: [], unassigned: [], missing: [] };
    const present = new Map();
    for (const item of collection.items) {
      present.set(item.id, item);
      const pile = pileOf(manifest, item.id);
      (pile && sameExample(manifest.pinned[item.id], item) ? out[pile] : out.unassigned).push(item.id);
    }
    for (const id of Object.keys(manifest.assigned)) if (!sameExample(manifest.pinned[id], present.get(id))) out.missing.push(id);
    for (const k of Object.keys(out)) out[k] = sorted(out[k]);
    return freeze(out);
  }
  /**
   * The items no pile holds yet — never placed, or another example under a placed id — with the
   * one pile each MAY join when its group is already placed.
   * @returns {Array<{id:string, groupId:string, mustJoin:string|null}>}
   */
  function unassigned(manifest, collection) {
    checkManifest(manifest); checkCollection(collection);
    if (manifest.collectionId !== collection.id) fail('This manifest belongs to a different collection.');
    return freeze(collection.items.filter((i) => pileOf(manifest, i.id) === null || !sameExample(manifest.pinned[i.id], i))
      .map((i) => ({ id: i.id, groupId: i.groupId, mustJoin: pileOfGroup(manifest, i.groupId) }))
      .sort((a, b) => (a.id < b.id ? -1 : 1)));
  }
  /**
   * Is this manifest revision pinned to the collection as it is NOW? Decided by CONTENT against
   * what the manifest pinned (its roster and, per item, payload, extractor version and reference
   * answer), with the counters as a second guard: not current once an item was added or removed,
   * or an id now names other content (`replaced`: another payload or extractor version) —
   * `items-changed` — or any reference answer differs from the pinned one (`relabelled`,
   * `labels-changed`) — on either branch of a fork. The host revises before recording a result on
   * it (evaluation-record.js refuses a stale one).
   * @returns {{current:boolean, reasons:string[], added:string[], removed:string[], replaced:string[],
   *   relabelled:Array<{id:string, pile:string|null}>}}  `current` is false whenever any list is
   *   non-empty; it can never contradict them. A replaced item is not also reported as relabelled.
   */
  function manifestStatus(manifest, collection) {
    checkManifest(manifest); checkCollection(collection);
    if (manifest.collectionId !== collection.id) return freeze({ current: false, reasons: ['wrong-collection'], added: [], removed: [], replaced: [], relabelled: [] });
    const roster = new Set(manifest.roster);
    const now = itemMap(collection);
    const added = sorted([...now.keys()].filter((id) => !roster.has(id)));
    const removed = manifest.roster.filter((id) => !now.has(id));
    const kept = manifest.roster.filter((id) => now.has(id));
    const replaced = kept.filter((id) => !sameExample(manifest.pinned[id], now.get(id)));
    const relabelled = kept.filter((id) => sameExample(manifest.pinned[id], now.get(id)) && !sameReference(manifest.pinned[id].reference, now.get(id).reference))
      .map((id) => ({ id, pile: pileOf(manifest, id) }));
    const reasons = [];
    if (collection.revision !== manifest.collectionRevision || added.length || removed.length || replaced.length) reasons.push('items-changed');
    if (collection.labelRevision !== manifest.labelRevision || relabelled.length) reasons.push('labels-changed');
    return freeze({ current: !reasons.length, reasons, added, removed, replaced, relabelled });
  }

  /**
   * A seeded PROPOSAL of piles by whole group — a starting point the person freezes with
   * `createManifest`, never a hidden repartition. Group keys are sorted before the seeded shuffle,
   * so import order cannot move a group. Test and validation get round(groups × share), at least
   * one group each when their share is positive and there are enough groups; training gets the
   * rest (and at least one group when its share is positive).
   * @param {object} collection
   * @param {{seed:number, shares:{training?:number, validation?:number, test?:number}}} opts  seed
   *   from the host; shares add up to 1
   * @returns {{piles:{training:string[], validation:string[], test:string[]}, groups:number, groupCounts:object}}
   */
  function proposePiles(collection, opts) {
    checkCollection(collection);
    if (!isObject(opts) || !Number.isInteger(opts.seed)) fail('proposePiles needs an integer seed from the host.');
    if (!isObject(opts.shares)) fail('proposePiles needs shares {training, validation, test} that add up to 1.');
    const share = (p) => (opts.shares[p] === undefined ? 0 : opts.shares[p]);
    let sum = 0;
    for (const p of PILES) {
      if (!(typeof share(p) === 'number' && share(p) >= 0 && share(p) <= 1)) fail('A pile share is a number between 0 and 1.');
      sum += share(p);
    }
    if (Math.abs(sum - 1) > 1e-9) fail('The pile shares must add up to 1.');
    const groups = groupIds(collection);
    const G = groups.length;
    const [order] = Rng.shuffle(groups, Rng.seed(opts.seed));
    let test = Math.round(G * share('test')), validation = Math.round(G * share('validation'));
    const positive = PILES.filter((p) => share(p) > 0).length;
    if (G >= positive) {
      if (share('test') > 0 && test === 0) test = 1;
      if (share('validation') > 0 && validation === 0) validation = 1;
    }
    const trainingFloor = share('training') > 0 && G >= positive ? 1 : 0;
    let training = G - test - validation;
    while (training < trainingFloor && (test > 0 || validation > 0)) {
      if (test >= validation) test -= 1; else validation -= 1;
      training = G - test - validation;
    }
    const byGroup = new Map();
    for (const item of collection.items) {
      if (!byGroup.has(item.groupId)) byGroup.set(item.groupId, []);
      byGroup.get(item.groupId).push(item.id);
    }
    const take = (n) => order.splice(0, n).flatMap((g) => byGroup.get(g));
    const t = sorted(take(test)), v = sorted(take(validation)), tr = sorted(take(training));
    return freeze({ piles: { training: tr, validation: v, test: t }, groups: G, groupCounts: { training, validation, test } });
  }

  // ------------------------------------------------------------------ revisions
  /**
   * The key a learned cache is bound to (P2b) and an evaluation snapshot records: the CONTENT a
   * taught Model depends on — this collection, its extractor version, and the training items
   * (id, payload handle, extractor version, reference answer) as they are now under this manifest
   * (or the host's stated subset of the training pile). Not a counter: two forks with the same
   * revision numbers but different training get different keys, another photo under a reused
   * training id is another training, and a validation relabel or a pile change that leaves the
   * training items alone does not ask for teaching again. The training pile is `membership`'s:
   * a replaced example under a training id is waiting, not training, until placed on purpose.
   * @param {object} collection
   * @param {object} manifest
   * @param {string[]} [ids]  a subset of the training pile actually taught (record() passes it)
   * @returns {string}
   */
  function trainingRevision(collection, manifest, ids) {
    const pile = new Set(membership(manifest, collection).training);
    const byId = itemMap(collection);
    const chosen = ids === undefined ? [...pile] : ids.map((id) => checkHandle(id, 'A training id'));
    for (const id of chosen) if (!pile.has(id)) fail('trainingRevision: an id is not in the training pile.');
    const training = contentPairs(sorted(unique(chosen)).map((id) => byId.get(id)));
    return identity([collection.id, collection.extractor, training]);
  }
  const canonical = (obj) => Object.keys(obj).sort().map((k) => k + '=' + JSON.stringify(obj[k])).join('&');
  /**
   * The extractor / brain / configuration revision an evaluation snapshot records — a canonical,
   * readable string that changes whenever ANY listed setting changes and never with key order.
   * Brains are pluggable, so nothing here knows a dial's name: the HOST passes every setting that
   * changes a decision — the brain's declared dials AND the sure line (at 0.5 a Model answered
   * 18–44 % of held-out photos, at 0.2 over 99 %: P1 evidence §7 gap 1). Settings are flat
   * primitives; a nested object or a non-finite number throws.
   * @param {{extractor:string, brain:string, brainVersion?:string|null, settings:object}} learner
   * @returns {string}
   */
  function learnerRevision(learner) {
    if (!isObject(learner)) fail('learnerRevision needs {extractor, brain, brainVersion?, settings}.');
    checkHandle(learner.extractor, 'The extractor version');
    checkHandle(learner.brain, 'The brain id');
    if (learner.brainVersion !== undefined && learner.brainVersion !== null) checkHandle(learner.brainVersion, 'The brain version');
    if (!isObject(learner.settings)) fail('learnerRevision needs settings: a flat object of every setting that changes decisions (the brain\'s dials and the sure line).');
    for (const k of Object.keys(learner.settings)) {
      const v = learner.settings[k];
      if (v === null || typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) continue;
      fail('A learner setting must be a string, a finite number, a boolean or null (setting "' + k + '").');
    }
    return canonical({ extractor: learner.extractor, brain: learner.brain, brainVersion: learner.brainVersion || '' }) + '|' + canonical(learner.settings);
  }

  const api = {
    MODALITIES, ANSWER_KINDS, PILES, HANDLE_MAX, checkHandle, identity, contentKey,
    validateReference, answer, noAnswer, isPresent, sameReference,
    validateItem, payloadView,
    createCollection, capacity, admit, removeItems, setReferences, itemById, groupItems, groupIds,
    createManifest, reviseManifest, pileOf, pileOfGroup, membership, unassigned, manifestStatus, proposePiles,
    trainingRevision, learnerRevision,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.WorkshopPrivateSession = api;
})();
