(function () {
  'use strict';
  /**
   * private-examples.js — the pure ADAPTERS between the Workshop's existing inputs and the
   * private-session contract (private learning loop plan §3, task P2b; task 113 slice).
   *
   * IN: a photo the Teach panel's tray read (its embedding plus a digest of the ORIGINAL file
   * bytes), a row the Files block's CSV upload produced (TableImport.buildSchema's
   * `{features, answer, value}`), or a typed text row (what the Text extractor reads as
   * `data.tag`). OUT: an ENTRY the session registry (private-registry.js) admits — modality,
   * feature/extractor version, the content GROUP key, the explicit reference answer (private-
   * session.js's R5 presence shape, the ONE definition) and the payload that stays in the
   * registry's memory. OUT AGAIN: the engine CRATE a Files block deals for an admitted item — its
   * modality's legacy crate shape plus explicit answer presence (`data.reference`), the item's
   * source (`data.source`) and, when the split is current, its fixed pile (`data.split`).
   *
   * GROUP KEYS ARE DIGESTS OF THE ORIGINAL CONTENT (carried obligation 2): identical source
   * content forms one group, so the same photo picked twice under two file names can never sit
   * in Training and Test at once (private-session.js refuses a group across piles). The key is
   * computed from the file's BYTES — never from its name, its date or its embedding (an embedding
   * is the model's reading of the content, not the content). Nothing here claims semantic
   * duplicate detection: two photos of the same cup are two groups.
   *
   * LONG TEXT IS NEVER CUT: a text payload keeps every character, and its crate carries the text
   * in `data.tag` (what the Text extractor reads) while the crate's LABEL carries the reference
   * answer — so a long text never rides the 80-character Memory slot (composition.js) or the
   * retired Cloud block's few-word gateway, both of which only ever see a signal's label.
   *
   * NO REFERENCE ANSWER REACHES EXTRACTION: a photo is embedded from its bytes when it is read,
   * before anyone has named it; the payload built here holds the embedding and no answer. The
   * crate carries the answer for GRADING, exactly where a legacy row always carried its truth
   * (the label), and the Camera and Text readers read only `data.vec` / `data.tag`.
   *
   * Pure: no DOM, clock, randomness or network. Load order: after logic/model-library.js (its
   * PHOTO_FEATURES is the photo extractor version) and logic/private-session.js.
   * Globals: window.WorkshopPrivateExamples. CommonJS-exported for node --test.
   */
  const Session = typeof require === 'function' ? require('./private-session.js') : window.WorkshopPrivateSession;
  const Library = typeof require === 'function' ? require('./model-library.js') : window.WorkshopModelLibrary;
  const Datasets = typeof require === 'function' ? require('./datasets.js') : window.WorkshopDatasets;

  /** The Camera Model's feature version: the self-hosted MobileNet embedding, 1024 unit numbers. */
  const PHOTO_FEATURES = Library.PHOTO_FEATURES;
  /** The Text Model's feature version: brain.js textVec — 64 hashed character trigrams, unit length. */
  const TEXT_FEATURES = 'text-trigrams-64-unit-v1';
  /** Prefix of a table's feature version; the schema's own deterministic id completes it. */
  const TABLE_FEATURES = 'table-features-v1:';

  function fail(message) { throw new Error(message); }
  const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const hex = (n) => (n >>> 0).toString(16).padStart(8, '0');

  /**
   * A content digest of raw bytes: FNV-1a in two lanes (the private-session.js `identity`
   * constants) plus the byte count — 16 hex chars and a length. A GROUP key, not a secret and
   * not an anonymiser: the key is private material like the bytes it came from.
   * @param {Uint8Array|Uint8ClampedArray|number[]} bytes  the original content, 0..255 each
   * @returns {string}
   */
  function digestBytes(bytes) {
    if (!bytes || typeof bytes.length !== 'number') fail('digestBytes needs the original bytes (a Uint8Array or an array of 0-255).');
    let a = 0x811c9dc5, b = 0x9747b28c;
    for (let i = 0; i < bytes.length; i++) {
      const c = bytes[i] & 0xff;
      a = Math.imul(a ^ c, 16777619);
      b = Math.imul(b ^ c, 16777619) ^ (b >>> 13);
    }
    return hex(a) + hex(b) + '-' + bytes.length;
  }
  /** The UTF-8 bytes of a string (TextEncoder where it exists; the same bytes by hand otherwise). */
  function utf8(text) {
    const s = String(text);
    if (typeof TextEncoder === 'function') return new TextEncoder().encode(s);
    const out = [];
    for (const ch of s) {
      const c = ch.codePointAt(0);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }
  /** The digest of a text's exact characters (no trimming or case folding: the same text, the same key). */
  function digestText(text) {
    if (typeof text !== 'string') fail('digestText needs a string.');
    return digestBytes(utf8(text));
  }
  /** A table row's features in one canonical order, so column order never changes a key. */
  function canonicalFeatures(features) {
    if (!isObject(features)) fail('A table row needs its features as {featureId: value}.');
    return JSON.stringify(Object.keys(features).sort().map((k) => [k, features[k]]));
  }
  /** A finite unit-ready vector (the registry keeps it; the brain reads it). */
  function checkVector(vec) {
    if (!Array.isArray(vec) || !vec.length || !vec.every((x) => typeof x === 'number' && Number.isFinite(x))) fail('A photo entry needs its embedding: a non-empty array of finite numbers.');
    return vec;
  }

  // ------------------------------------------------------------------ entries (IN)
  /**
   * A photo the tray read → a registry entry. The group is the digest of the ORIGINAL bytes.
   * @param {{digest:string, vec:number[], vecs?:object, thumb?:*, media?:*}} photo  `thumb` (a
   *   small canvas) and `media` (the picked File/Blob) are opaque host objects kept in memory only
   * @param {object} [reference]  private-session.js presence shape; absent by default
   * @returns {{modality:'photo', extractor:string, group:string, reference:object, payload:object}}
   */
  function photoEntry(photo, reference) {
    if (!isObject(photo)) fail('photoEntry needs {digest, vec}.');
    if (typeof photo.digest !== 'string' || !photo.digest) fail('A photo entry needs the digest of its original bytes.');
    return {
      modality: 'photo', extractor: PHOTO_FEATURES, group: 'photo:' + photo.digest,
      reference: Session.validateReference(reference === undefined ? Session.noAnswer() : reference),
      payload: { vec: checkVector(photo.vec).slice(), vecs: isObject(photo.vecs) ? photo.vecs : {}, thumb: photo.thumb || null, media: photo.media || null },
    };
  }
  /**
   * A typed text → a registry entry. The whole text is the payload: nothing here cuts it.
   * @param {{text:string}} row
   * @param {object} [reference]
   */
  function textEntry(row, reference) {
    if (!isObject(row) || typeof row.text !== 'string') fail('textEntry needs {text} as a string.');
    return {
      modality: 'text', extractor: TEXT_FEATURES, group: 'text:' + digestText(row.text),
      reference: Session.validateReference(reference === undefined ? Session.noAnswer() : reference),
      payload: { text: row.text },
    };
  }
  /**
   * The Text Teach panel's typed row (shelf name + the words) → a text entry whose answer is the
   * shelf. An empty shelf name is NOT an answer here: it means the person named no shelf.
   * @param {{shelf?:string, word:string}} row
   */
  function typedTextEntry(row) {
    if (!isObject(row) || typeof row.word !== 'string') fail('typedTextEntry needs {shelf, word}.');
    const shelf = typeof row.shelf === 'string' ? row.shelf.trim() : '';
    return textEntry({ text: row.word }, shelf ? Session.answer('class', shelf) : Session.noAnswer());
  }
  /** The answer kind a table schema's answer column holds: a measured number, or a class word. */
  function tableAnswerKind(schema) { return schema && schema.kind === 'number' ? 'number' : 'class'; }
  /** A table's feature version: the extractor name plus the schema's deterministic shape id. */
  function tableFeatures(schema) {
    if (!isObject(schema) || typeof schema.id !== 'string' || !schema.id) fail('A table schema needs its id (TableImport.buildSchema gives one).');
    return TABLE_FEATURES + schema.id;
  }
  /**
   * A Files CSV row (TableImport.buildSchema's `{features, answer, value?}`) → a registry entry.
   * The ANSWER column is never a feature: only `row.features` (the kept feature columns) travels.
   * A number answer is present when `value` is a finite number — zero included; a class answer
   * when `answer` is a non-empty string. A row with no answer at all is absent, never a guess.
   * @param {{features:object, answer?:string, value?:number}} row
   * @param {object} schema  the table's schema (kind, features, answer, id)
   */
  function tableEntry(row, schema) {
    if (!isObject(row)) fail('tableEntry needs a table row.');
    const kind = tableAnswerKind(schema);
    let reference = Session.noAnswer();
    if (kind === 'number' && typeof row.value === 'number' && Number.isFinite(row.value)) reference = Session.answer('number', row.value);
    if (kind === 'class' && typeof row.answer === 'string' && row.answer !== '') reference = Session.answer('class', row.answer);
    const features = {};
    for (const k of Object.keys(row.features || {})) features[k] = row.features[k];
    return {
      modality: 'table', extractor: tableFeatures(schema), group: 'table:' + digestText(canonicalFeatures(features)),
      reference, payload: { features, schema },
    };
  }

  // ------------------------------------------------------------------ crates (OUT)
  /**
   * The engine crate for one admitted item: its modality's LEGACY crate shape (so every reader
   * downstream — the Camera and Text Models, the Checker, the floor — treats it as it always
   * treated one) plus three explicit fields:
   *   data.reference  the item's answer in private-session.js's presence shape. The label says
   *                   the word the Checker compares today; presence says whether there IS one —
   *                   an absent answer rides label '' AND {present:false}, so the grading task
   *                   (P4) can tell "no answer" from "the answer is the empty word".
   *   data.source     {collection, item}: which collection item this crate is (plan §3 keeps
   *                   the item distinct from the flow — the engine still gives it its own flowId).
   *   data.split      {pile, key} when the collection's split is current: the fixed pile a
   *                   Splitter must route it to (engine.js splitter:in). Absent otherwise.
   * @param {object} item  a private-session item
   * @param {object} payload  the registry's payload for it
   * @param {{collection:string, image?:string|null, pile?:string|null, key?:string|null}} where
   * @returns {{label:string, value?:number, data:object}}
   */
  function crateFor(item, payload, where) {
    if (!isObject(item) || !isObject(payload) || !isObject(where)) fail('crateFor needs the item, its payload and where it belongs.');
    const ref = Session.validateReference(item.reference);
    const crate = { label: ref.present ? String(ref.value) : '' };
    if (ref.present && ref.kind === 'number') crate.value = ref.value;
    let data;
    if (item.modality === 'photo') {
      // The camera capture's own shape ({image, vec, vecs}); a photo carries no tag.
      data = { image: where.image || null, vec: payload.vec, vecs: payload.vecs || {} };
    } else if (item.modality === 'text') {
      // THE WHOLE TEXT, in the field the Text extractor reads. Never the label (see header).
      data = { tag: payload.text };
    } else {
      // The uploaded-table crate's shape (game.js datasetContents): features + the schema object.
      data = { tag: Datasets.face(payload.schema, payload.features), features: payload.features, dataset: payload.schema };
      if (payload.schema && payload.schema.kind === 'number' && payload.schema.answer && Number.isFinite(payload.schema.answer.tolerance)) data.tolerance = payload.schema.answer.tolerance;
      if (payload.schema && payload.schema.kind === 'yesno' && payload.schema.answer && Array.isArray(payload.schema.answer.labels)) data.yes = payload.schema.answer.labels[0];
    }
    data.reference = ref;
    data.source = { collection: where.collection, item: item.id };
    if (where.pile !== undefined && where.key) data.split = { pile: where.pile, key: where.key };
    crate.data = data;
    return crate;
  }
  // ------------------------------------------------------------------ the learner
  /**
   * The decision settings of a Model's learner, as learnerRevision wants them: the SURE LINE
   * (every brain answers "not sure" below it — at 0.5 a k-NN answered 18–44 % of held-out photos
   * in P1, at 0.2 over 99 %) plus EVERY dial the brain adapter declares (`adapter.dials`). Brains
   * are pluggable, so the names come from the adapter, never from a list here: a new brain that
   * declares a new dial is recorded without touching this file. A dial the Model has no value for
   * records null (unset is a setting too).
   * @param {{dials?:string[]}} adapter  a brain adapter (brains/*.js)
   * @param {object} dials  the Model's live values ({k, sure, penalty, degree, …})
   * @returns {object} flat settings, keys sorted
   */
  function learnerSettings(adapter, dials) {
    if (!isObject(adapter)) fail('learnerSettings needs the brain adapter.');
    const d = isObject(dials) ? dials : {};
    const read = (name) => {
      const v = d[name];
      return typeof v === 'number' ? (Number.isFinite(v) ? v : null) : (v === undefined ? null : v);
    };
    const names = ['sure'].concat(Array.isArray(adapter.dials) ? adapter.dials : []);
    const out = {};
    for (const name of names.slice().sort()) {
      if (typeof name !== 'string' || !name) fail('A brain adapter declares its dials by name.');
      out[name] = read(name);
    }
    return out;
  }
  /**
   * The learner a record states: extractor version, brain id and version, and its settings.
   * @param {{extractor:string, brainId:string, brainVersion?:string|null, adapter:object, dials:object}} spec
   */
  function learnerOf(spec) {
    if (!isObject(spec)) fail('learnerOf needs {extractor, brainId, adapter, dials}.');
    return { extractor: spec.extractor, brain: spec.brainId, brainVersion: spec.brainVersion || null, settings: learnerSettings(spec.adapter, spec.dials) };
  }

  // ------------------------------------------------------------------ the taught shelves
  /**
   * The shelves a Model is taught from a collection's training items: one example per item that
   * has a present answer, on the shelf its answer names. Example ids are the registry's numbers
   * for the items (never rewound in a session), so Evidence names the item it came from.
   * @param {object[]} items  the items taught, any order
   * @param {(item:object) => {seq:number, vec:number[], raw?:number[]}|null} slotOf  the registry's
   *   lookup: the example's number and what the Model's own extractor read from its payload
   * @param {(item:object) => string} [displayOf]  what Evidence shows for an example
   * @returns {{shelves:object, nextId:number}}  a brain-shaped value (logic/brain.js)
   */
  function shelvesFrom(items, slotOf, displayOf) {
    const shelves = {};
    let top = 0;
    const rows = [];
    for (const item of items) {
      if (!item.reference || !item.reference.present) continue;
      const slot = slotOf(item);
      if (!slot || !Array.isArray(slot.vec)) continue;
      rows.push({ seq: slot.seq, label: String(item.reference.value), vec: slot.vec, raw: slot.raw, display: displayOf ? String(displayOf(item)) : '' });
    }
    rows.sort((a, b) => a.seq - b.seq);
    for (const r of rows) {
      const ex = { id: r.seq, vec: r.vec, display: r.display };
      // The un-normalised row rides along only when the extractor made one (brain.js addExample's
      // own convention: absent, never null, for every other sense).
      if (Array.isArray(r.raw) && r.raw.length) ex.raw = r.raw;
      if (!Object.prototype.hasOwnProperty.call(shelves, r.label)) {
        Object.defineProperty(shelves, r.label, { value: [], enumerable: true, writable: true, configurable: true });
      }
      shelves[r.label].push(ex);
      top = Math.max(top, r.seq);
    }
    return { shelves, nextId: top + 1 };
  }

  const api = {
    PHOTO_FEATURES, TEXT_FEATURES, TABLE_FEATURES,
    digestBytes, digestText, utf8,
    photoEntry, textEntry, typedTextEntry, tableEntry, tableAnswerKind, tableFeatures,
    crateFor, learnerSettings, learnerOf, shelvesFrom,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.WorkshopPrivateExamples = api;
})();
