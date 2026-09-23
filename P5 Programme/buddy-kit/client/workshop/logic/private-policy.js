(function () {
  'use strict';
  /**
   * private-policy.js — WHAT MAY BE WRITTEN DOWN, AND WHAT MAY LEAVE (plan §3, task P3a, ruling R4).
   *
   * P2 owns WHERE private material lives (logic/private-registry.js: a memory-only session
   * registry keyed by opaque handles). THIS file owns the other half: the two policy QUERIES the
   * host asks before it writes a file or opens a channel, plus the pure decisions behind
   * "clear private session data". It answers; it never acts. No DOM, no storage, no network, no
   * clock, no randomness — and deliberately NOT a patched `fetch`: a monkey-patch would catch one
   * API and miss every worker, beacon, form post and `<script src>` on the page, so the boundary
   * is asked at each real entry point instead (P3b wires the outbound ones).
   *
   * QUERY 1 — THE SAVE PROJECTION. `project(value)` takes any authored value (a piece, a table,
   * a whole champion section) and returns what may be written down. A piece that depends on
   * private material keeps ONE thing: the dependency placeholder
   * `privateData = {v:1, collection:<handle>, dependency:'session'}` — an opaque handle and the
   * explicit statement that it needs session-only data. Everything else private is DROPPED, with
   * its path recorded so the caller can say so. `refs` lets the caller name the dependency at save
   * time and refuse the Run after a reload; `dropped` is the audit trail.
   *
   * WHY A HANDLE IS THE PLACEHOLDER, not a redaction marker: a handle is minted from a per-page
   * nonce and a counter that never rewinds (private-registry.js), so it names nothing about the
   * person, cannot be confused with a handle from another page load, and a reload can tell
   * "this needs data this session does not hold" apart from "this was never private" — which is
   * exactly the reattachment refusal plan §3 requires. A blanked field could not do that.
   *
   * QUERY 2 — THE OUTBOUND DISPATCH. `dispatch(request, session)` answers one channel at a time:
   * may this leave, and if part of it may, WHICH parts must be omitted. It FAILS CLOSED — a
   * channel this file has never heard of is refused while a private session is active, because a
   * boundary that defaults to "allow" is not a boundary. Three rules run before the per-channel
   * table: a transcript that cannot be scrubbed BY STRUCTURE is refused rather than edited, a
   * payload that names private material is refused whatever the channel, and an asset URL
   * carrying a private identifier is refused even though fetching a fixed self-hosted model file
   * is otherwise ordinary (plan §3: "asset URLs/logs must not contain private identifiers"). The
   * one thing the literal net never judges is the PERSON'S OWN typed words — their explicit act,
   * which plan §3 keeps on its existing send behaviour with the distinction explained.
   *
   * THE CODES ARE NOT WORDS. Every refusal comes back as a stable `code`; the host owns the
   * sentence (game.js STRINGS + i18n). That keeps this file testable in `node --test` and keeps
   * one wording in one place.
   *
   * CLEAR. `clearPlan` is the pure half of "clear private session data": given the authored table,
   * the parts library and the handles the session holds, it says which pieces and which parts must
   * be detached, which handles must be forgotten, and which limits must be stated out loud (a file
   * already downloaded cannot be revoked). `stripPrivate` is what invalidates a history snapshot,
   * so a machine edit stays undoable while Undo can never walk back to private data.
   *
   * Pure: no DOM, clock, randomness or network. Load order: anywhere (it requires nothing).
   * Globals: window.WorkshopPrivatePolicy. CommonJS-exported for node --test.
   */

  function fail(message) { throw new Error(message); }
  function isObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  // A numeric first item says nothing about later elements: only complete finite vectors
  // may skip recursive walking, or a mixed array could hide a private child object.
  function isNumericArray(v) { return v.every((n) => typeof n === 'number' && Number.isFinite(n)); }
  /** A value this module may walk and rebuild: a plain object or an array, nothing exotic. */
  function isPlain(v) {
    if (Array.isArray(v)) return true;
    if (!v || typeof v !== 'object') return false;
    const proto = Object.getPrototypeOf(v);
    return proto === Object.prototype || proto === null;
  }

  // ------------------------------------------------------------------ the vocabulary

  /**
   * THE AUTHORED PLACEHOLDER. The one field an authored piece may carry about private material,
   * and the only three keys it may hold. Anything else on it is someone's later addition and is
   * dropped by the projection rather than written down.
   */
  const REF_FIELD = 'privateData';
  const REF_KEYS = Object.freeze(['v', 'collection', 'dependency']);
  const DEPENDENCY = 'session';

  /**
   * A registry-minted handle: `<kind>-<session nonce>-<n>` (private-registry.js `mint`), where the
   * kind is c(ollection), i(tem), p(ayload) or e(valuation record).
   *
   * The nonce is at least eight base-36 characters (game.js `sessionNonce`), and requiring that
   * length is what keeps an ordinary child-typed label out of the net: "e-mail-1" is not a handle,
   * "e-a1b2c3d4-1" is. When the host knows its own nonce it passes it (`opts.nonces`) and the
   * match becomes exact — a pattern is the fallback, never the only defence.
   */
  const HANDLE_RE = /(^|[^0-9a-z])([cipe]-[0-9a-z]{8,32}-[0-9]+)(?![0-9a-z-])/i;
  const HANDLE_RE_G = new RegExp(HANDLE_RE.source, 'gi');

  /** Is this whole string one minted handle? */
  function isHandle(s, nonces) {
    if (typeof s !== 'string') return false;
    const m = /^([cipe])-([0-9a-z]{8,32})-([0-9]+)$/i.exec(s);
    if (!m) return false;
    return !nonces || !nonces.length || nonces.indexOf(m[2]) !== -1;
  }
  /** Every minted handle mentioned anywhere inside a string (`pv:c-…-1:4` names one). */
  function handlesIn(s, nonces) {
    if (typeof s !== 'string') return [];
    const out = [];
    let m;
    HANDLE_RE_G.lastIndex = 0;
    while ((m = HANDLE_RE_G.exec(s))) {
      const h = m[2];
      const nonce = h.split('-')[1];
      if (nonces && nonces.length && nonces.indexOf(nonce) === -1) continue;
      if (out.indexOf(h) === -1) out.push(h);
    }
    return out;
  }

  /**
   * Fields that carry private CONTENT wherever they appear under a private dependency. Named
   * rather than guessed: a derived private brain is shaped exactly like an ordinary one (the same
   * `{shelves, nextId}`), so no structural test can tell them apart — the projection relies on
   * POSITION (a private Model never keeps its shelves on the authored piece) plus this list for
   * the shapes that only ever exist around private material.
   *   payload / media / thumb — the original file or a picture of it
   *   vec / vecs / raw / features — what an extractor read off it
   *   items / roster / pinned — a collection's or a manifest's per-item truth (ids, answers)
   *   outcomes / evaluated    — a frozen evaluation's per-item result
   *   source / split          — the crate triple private-examples.js `crateFor` writes
   *   photos / table / dataset — a Files block's OTHER meals. A private meal is exclusive
   *       (game.js `filesClearMeal`), so any of these sitting beside `privateData` is the
   *       person's own file names or rows left on the piece.
   */
  const CONTENT_FIELDS = Object.freeze(['payload', 'media', 'thumb', 'vec', 'vecs', 'raw', 'features',
    'items', 'roster', 'pinned', 'outcomes', 'evaluated', 'source', 'split', 'photos', 'table', 'dataset']);
  /**
   * Fields EMPTIED rather than removed under a private dependency. A private Model's authored bank
   * is empty by construction (its shelves are derived in the registry and never written), so a
   * non-empty one is a leak — but the bank's SHAPE has to survive, because `restore` loads a brain
   * and expects `{shelves, nextId}`. Removing the key would turn a leak into a crash on reopen.
   */
  const EMPTY_FIELDS = Object.freeze({ shelves: () => ({}), waiting: () => [] });

  // ------------------------------------------------------------------ QUERY 1: the save projection

  /**
   * The reference an authored piece may keep, normalised. Anything else on `privateData` is
   * dropped: a save writes the handle and the dependency status, never a fourth field someone
   * added later.
   * @param {*} ref  a piece's `privateData`
   * @returns {{v:1, collection:string, dependency:'session'}|null}
   */
  function normaliseRef(ref) {
    if (!isObject(ref) || typeof ref.collection !== 'string' || !ref.collection) return null;
    return { v: 1, collection: ref.collection, dependency: DEPENDENCY };
  }

  /**
   * THE SAVE PROJECTION (plan §3, bullet 3): what may be written down.
   *
   * Structure-sharing: a subtree with nothing to change comes back as the SAME reference, so an
   * autosave over a machine that holds no private material costs one walk and no copy.
   *
   * @param {*} value  any authored value — one piece, a table, `{machines, bricks}`, a whole file
   * @param {{nonces?:string[], path?:string}} [opts]  `nonces`: this session's handle nonces, so
   *   the handle sweep is exact rather than pattern-only.
   * @returns {{value:*, refs:Array<{path:string, collection:string}>, dropped:Array<{path:string, why:string}>}}
   *   `refs` — every dependency placeholder that survived, so the caller can SAY the save depends
   *   on session-only data. `dropped` — every private thing removed, with its path and why.
   */
  function project(value, opts) {
    const nonces = (opts && opts.nonces) || null;
    const refs = [];
    const dropped = [];

    // `inside` is true once we are under a piece that declared a private dependency: there, a
    // brain-shaped bank or a Files meal is derived from private material and must not be written.
    function walk(v, path, inside) {
      if (typeof v === 'string') {
        const found = handlesIn(v, nonces);
        if (!found.length) return v;
        // A handle inside a longer string is a private identifier travelling by piggyback (a
        // 'pv:<collection>:<seq>' picture tag, a source id copied into a label). Never written.
        dropped.push({ path, why: 'handle-in-string' });
        return undefined;
      }
      if (!isPlain(v)) return v;
      if (Array.isArray(v)) {
        // A homogeneous finite vector has no nested private content and needs no copy.
        if (isNumericArray(v)) return v;
        let changed = false;
        const out = [];
        for (let i = 0; i < v.length; i += 1) {
          const next = walk(v[i], path + '[' + i + ']', inside);
          if (next === undefined) { changed = true; continue; }
          if (next !== v[i]) changed = true;
          out.push(next);
        }
        return changed ? out : v;
      }
      const ownRef = normaliseRef(v[REF_FIELD]);
      const here = inside || !!ownRef;
      let changed = false;
      const out = {};
      for (const k of Object.keys(v)) {
        if (k === REF_FIELD) {
          if (!ownRef) { changed = true; dropped.push({ path: path + '.' + k, why: 'malformed-ref' }); continue; }
          refs.push({ path: path || '.', collection: ownRef.collection });
          const same = REF_KEYS.every((rk) => v[k][rk] === ownRef[rk]) && Object.keys(v[k]).length === REF_KEYS.length;
          if (!same) { changed = true; dropped.push({ path: path + '.' + k, why: 'ref-extra-fields' }); }
          out[k] = same ? v[k] : ownRef;
          continue;
        }
        if (here && CONTENT_FIELDS.indexOf(k) !== -1) {
          changed = true;
          dropped.push({ path: path + '.' + k, why: 'private-content' });
          continue;
        }
        if (here && Object.prototype.hasOwnProperty.call(EMPTY_FIELDS, k)) {
          const blank = EMPTY_FIELDS[k]();
          const already = isPlain(v[k]) && (Array.isArray(v[k]) ? v[k].length === 0 : Object.keys(v[k]).length === 0);
          if (!already) { changed = true; dropped.push({ path: path + '.' + k, why: 'private-content' }); }
          out[k] = already ? v[k] : blank;
          continue;
        }
        const next = walk(v[k], path + '.' + k, here);
        if (next === undefined) { changed = true; continue; }
        if (next !== v[k]) changed = true;
        out[k] = next;
      }
      return changed ? out : v;
    }

    const projected = walk(value, (opts && opts.path) || '', false);
    return { value: projected === undefined ? null : projected, refs, dropped };
  }

  /**
   * A secret shorter than this many characters is matched as a WHOLE TOKEN, never as a substring.
   *
   * WHY THERE IS NO SHORT-SECRET EXEMPTION: binary and short class labels ("no", "A"/"B") and
   * two-digit numeric answers are the ORDINARY classifier case, so dropping them would exempt
   * exactly the collections a child is most likely to build. But a substring test for "no" fires
   * on "note", "another" and "nothing", which would make the audit noise. A token — bounded by a
   * non-alphanumeric on each side — is how a label actually appears in a Display string, a
   * readout or a findings sentence, so that is what is matched.
   */
  const SHORT_SECRET = 3;
  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function tokenRe(sec) { return new RegExp('(^|[^0-9A-Za-z])' + escapeRe(sec) + '([^0-9A-Za-z]|$)'); }

  /**
   * THE AUDIT (the other side of the projection, and what a canary suite asserts): does this value
   * carry anything private? Two nets, because one alone would lie.
   *   - the STRUCTURAL net: a minted handle anywhere it is not the placeholder's own `collection`,
   *     and any CONTENT_FIELDS key under a private dependency;
   *   - the LITERAL net: caller-supplied `secrets` — the exact item ids, group digests, reference
   *     answers and file names this session actually holds (see `secretsOf`). Structure alone
   *     cannot catch a child's own answer word appearing in a Display string.
   *
   * BOTH NETS READ KEYS AS WELL AS VALUES. A brain shelf is keyed by the child's own answer word
   * (`brain.shelves[label]`), so a leak can be a KEY with an ordinary array under it; walking only
   * values made this module weaker than the canary suite that validates it.
   *
   * @param {*} value
   * @param {{nonces?:string[], secrets?:string[], own?:string[], path?:string}} [opts]
   *   `own`: strings that are the PERSON'S OWN typed words on this request. They are exempt from
   *   the LITERAL net and from nothing else — see `dispatch`.
   * @returns {{ok:boolean, findings:Array<{path:string, kind:'handle'|'content'|'secret', detail:string}>}}
   */
  function inspect(value, opts) {
    const nonces = (opts && opts.nonces) || null;
    // Every non-empty secret, paired with the token matcher a SHORT one needs.
    const secrets = ((opts && opts.secrets) || [])
      .filter((s) => typeof s === 'string' && s.length > 0)
      .map((s) => ({ text: s, re: s.length < SHORT_SECRET ? tokenRe(s) : null }));
    const own = (opts && opts.own) || [];
    const findings = [];
    const seen = new Set();

    function note(path, kind, detail) {
      const key = path + '|' + kind + '|' + detail;
      if (seen.has(key)) return;
      seen.add(key);
      findings.push({ path, kind, detail });
    }
    function scanString(s, path, allowHandle) {
      // `allowHandle` is the placeholder's OWN collection handle, which a save is allowed to
      // hold — it is exempt from both nets, and from nothing else.
      if (allowHandle && s === allowHandle) return;
      for (const h of handlesIn(s, nonces)) if (h !== allowHandle) note(path, 'handle', h);
      // THE PERSON'S OWN WORDS pass the literal net (never the structural one): a string they
      // typed themselves is their explicit act, and refusing it for containing one of their own
      // label words would refuse "how do I sort glass?" — plan §3 keeps typed Buddy text on its
      // existing explicit send behaviour. Only `dispatch` names them, and only from the request.
      if (own.indexOf(s) !== -1) return;
      for (const sec of secrets) {
        if (sec.text === allowHandle) continue;
        if (sec.re ? sec.re.test(s) : s.indexOf(sec.text) !== -1) note(path, 'secret', sec.text);
      }
    }
    function walk(v, path, inside, allowHandle) {
      if (typeof v === 'string') { scanString(v, path, allowHandle); return; }
      if (typeof v === 'number') {
        // A number can be a reference answer too (a measured value). Compared as text so a
        // caller can hand the same `secrets` list for both.
        for (const sec of secrets) if (String(v) === sec.text) note(path, 'secret', sec.text);
        return;
      }
      if (!isPlain(v)) return;
      if (Array.isArray(v)) {
        if (isNumericArray(v)) {
          for (const sec of secrets) if (v.some((n) => String(n) === sec.text)) note(path, 'secret', sec.text);
          return;
        }
        v.forEach((item, i) => walk(item, path + '[' + i + ']', inside, allowHandle));
        return;
      }
      const ref = normaliseRef(v[REF_FIELD]);
      const here = inside || !!ref;
      for (const k of Object.keys(v)) {
        const at = path + '.' + k;
        // The KEY first: `shelves: {'<the child's answer word>': [...]}` is a leak whose value
        // says nothing at all.
        scanString(k, at, allowHandle);
        if (k === REF_FIELD && ref) {
          // The placeholder itself is what a save is ALLOWED to hold — its own handle is not a
          // finding. Any OTHER handle under it still is.
          walk(v[k], at, here, ref.collection);
          continue;
        }
        if (here && CONTENT_FIELDS.indexOf(k) !== -1) { note(at, 'content', k); continue; }
        if (here && Object.prototype.hasOwnProperty.call(EMPTY_FIELDS, k)) {
          const empty = isPlain(v[k]) && (Array.isArray(v[k]) ? v[k].length === 0 : Object.keys(v[k]).length === 0);
          if (!empty) note(at, 'content', k);
          continue;
        }
        walk(v[k], at, here, allowHandle);
      }
    }
    walk(value, (opts && opts.path) || '', false, null);
    return { ok: findings.length === 0, findings };
  }

  /**
   * The strings a session actually holds that must never leave — the LITERAL net for `inspect`
   * and for P3b's canary. Pure over P2a values; it reads no payloads (the caller adds the raw
   * text/file names it knows, which is the one part this file cannot see).
   *
   * @param {{collection?:object, manifest?:object, records?:object[], extra?:string[]}} held
   * @returns {string[]} item ids, payload handles, group digests, reference answers (as text),
   *   split keys and revisions, record ids and evaluated-content keys — de-duplicated.
   */
  function secretsOf(held) {
    if (!isObject(held)) fail('secretsOf needs {collection, manifest, records}.');
    const out = new Set();
    // Every non-empty answer, however short: "no", "A" and "7" are the common binary/short-class
    // labels, and `inspect` matches a short one as a whole token so keeping them costs no noise.
    const add = (v) => { if (typeof v === 'string' && v.length > 0) out.add(v); else if (typeof v === 'number') out.add(String(v)); };
    const col = held.collection;
    if (isObject(col)) {
      // NOT `col.id`: that handle IS the authored placeholder a save is allowed to hold (ruling
      // R4). It is opaque, minted per page load and names nothing about the person — and the
      // structural net in `inspect` already refuses it ANYWHERE except as `privateData.collection`.
      add(col.membershipKey); add(col.labelKey);
      for (const item of col.items || []) {
        add(item.id); add(item.groupId); add(item.payload);
        if (item.reference && item.reference.present) add(item.reference.value);
      }
    }
    const m = held.manifest;
    if (isObject(m)) {
      add(m.key);
      for (const id of m.roster || []) add(id);
      for (const id of Object.keys(m.pinned || {})) { const p = m.pinned[id]; add(p.payload); if (p.reference && p.reference.present) add(p.reference.value); }
    }
    for (const rec of held.records || []) {
      if (!isObject(rec)) continue;
      add(rec.id); add(rec.evaluatedKey);
      if (rec.split) add(rec.split.key);
      for (const id of rec.evaluated || []) add(id);
      for (const o of rec.outcomes || []) { add(o.id); add(o.reference); add(o.answer); }
      if (rec.training) { for (const id of rec.training.ids || []) add(id); add(rec.training.revision); }
    }
    for (const s of held.extra || []) add(s);
    return [...out];
  }

  // ------------------------------------------------------------------ QUERY 2: the outbound dispatch

  /**
   * The parts of the Workshop's own context a Buddy request may carry. Named from the real shape
   * `logic/buddy-host.js stateOf` returns, the memory the mount reads each turn, and the two
   * fields `web/coding agent/client/buddy.js buildTurnBody` puts on EVERY request:
   *   transcript       — the whole chat so far ("the server has no history of its own to
   *                      prepend", buddy.js:133), so a reply composed from private context rides
   *                      again on every later turn unless it is left out;
   *   lessonStartState — the project as it looked when the lesson began (buddy.js:137), which is
   *                      exactly plan §3's "old transcript/context snapshots".
   * A caller omits exactly these and still sends the person's own words.
   */
  const CONTEXT_PARTS = Object.freeze(['params', 'slots', 'readouts', 'findings', 'memory', 'name', 'note',
    'transcript', 'lessonStartState']);

  /**
   * THE CHANNELS, and what a private session does to each.
   *   'block'  — nothing of this channel leaves while a private session is active
   *   'omit'   — `allow` is FALSE and `decision` is 'omit': a caller that only reads `allow` sends
   *              nothing and cannot leak. A caller that wants the turn to proceed must handle
   *              'omit' explicitly and send the request WITHOUT the listed parts.
   *   'notice' — allowed unchanged; the caller must explain the distinction before its use
   *   'allow'  — allowed, because the boundary for it is enforceable on this device
   */
  const CHANNELS = Object.freeze({
    // The per-turn project state: names, readouts, findings, notes, model/evidence/result data.
    'buddy-context': 'omit',
    // The chat so far, and the lesson-start snapshot, which ride EVERY request. Same treatment as
    // the context they were made from — and see RULE 0 in `dispatch`: handed an actual transcript,
    // this channel refuses one it cannot scrub BY STRUCTURE rather than editing someone's prose.
    'buddy-transcript': 'omit',
    // Session-associated memory read into a turn (the champion's buddy slot).
    'buddy-memory': 'block',
    // The person's own typed message. Plan §3 keeps its existing explicit send behaviour — and
    // requires the distinction be explained, which is what 'notice' asks the caller to do.
    'buddy-text': 'notice',
    // The buddy writing back a bounded preference. toolbox/buddy-preferences.js `parse` accepts
    // only enumerated values, so this channel cannot carry free text out of a private session;
    // and with the context omitted the model has nothing private to propose from.
    'buddy-remember': 'allow',
    // The retired Cloud AI / Send blocks. No host applies their effects today (game.js drops
    // them), but the engine still proposes them for old files — so the policy answers for them
    // rather than leaving the next person to decide.
    'cloud-ask': 'block',
    send: 'block',
    // The microphone. Web Speech recognition is permitted to send audio to a vendor service, and
    // a page cannot prove it does not, so the data boundary is NOT enforceable here: blocked, and
    // visibly (plan §3). Never "offline because the API exists".
    listen: 'block',
    // The speaker (task P3b — plan §3's "any other external-capable device operation"). Speech
    // SYNTHESIS is not the microphone's twin, but it is not local by definition either: a platform
    // voice may be fetched or rendered off-device, and a page cannot tell which voice it got. What
    // it would say is the Display's own word, which on a private machine is a MODEL'S ANSWER about
    // a private example. Blocked — and the honest degrade already exists: the Speaker's face holds
    // the word exactly as it does on a device with no voice service at all, so the machine loses
    // the sound, never the information.
    speak: 'block',
    // The camera. getUserMedia frames are read by a self-hosted worker on a fixed local model and
    // never posted anywhere, so this boundary IS enforceable — and the camera is how private
    // photos are taught in the first place. Allowed on purpose.
    camera: 'allow',
    // A fixed self-hosted asset (the embedder bundle, wasm, the tflite model, a features chunk).
    // Allowed, but the URL is checked: a request line is a log line.
    asset: 'allow',
    // The person's own explicit Save-to-file. Allowed — the save projection is what makes it
    // safe — and it is the one act `clear` can never take back.
    download: 'allow',
  });

  /**
   * The four answers. `OMIT` is the one that needs saying twice: it comes back with `allow:false`
   * and a non-empty `omit` list. Reading `allow` alone is SAFE (you send nothing); proceeding
   * means switching on `decision === 'omit'` and sending the request without those parts.
   */
  const DECISION = Object.freeze({ ALLOW: 'allow', BLOCK: 'block', OMIT: 'omit', NOTICE: 'notice' });

  /**
   * Can this transcript be scrubbed BY STRUCTURE? Plan §3: "Do not infer a safe payload from
   * truncation or keyword redaction." A chat turn is `{role, content}` (buddy.js `transcript()`)
   * — and an ASSISTANT turn's content is prose the model composed FROM the project state, so its
   * Workshop-derived parts sit at no key anything can delete. There is no honest structural edit
   * of someone's sentences, so the answer for one is: block the whole channel.
   *
   * What passes: an empty transcript, and one holding only the person's OWN turns at the two keys
   * this policy can account for.
   * @param {*} v  the transcript as it would be sent
   */
  function scrubbableTranscript(v) {
    if (!Array.isArray(v)) return false;
    for (const turn of v) {
      if (!isObject(turn)) return false;
      if (turn.role !== 'user') return false;
      if (typeof turn.content !== 'string') return false;
      for (const k of Object.keys(turn)) if (k !== 'role' && k !== 'content') return false;
    }
    return true;
  }

  /**
   * The person's own typed words on THIS request — the strings the literal secret net does not
   * judge (`inspect`'s `own`). Read from the request itself, never guessed: the typed message on
   * `buddy-text`, and the person's own turns inside a transcript. Everything else on a request is
   * machine-assembled (context, readouts, memory, results, names, notes) and keeps the full net.
   */
  function ownWords(request) {
    if (request.kind === 'buddy-text' && typeof request.payload === 'string') return [request.payload];
    if (request.kind === 'buddy-transcript' && Array.isArray(request.payload)) {
      return request.payload.filter((e) => isObject(e) && e.role === 'user' && typeof e.content === 'string').map((e) => e.content);
    }
    return [];
  }

  /**
   * THE OUTBOUND DISPATCH (plan §3, bullet 2): may this leave, and what must be left out?
   *
   * FAILS CLOSED. A `kind` this table does not name is refused while a private session is active
   * (`unknown-channel`) — the next person to add a channel has to come here and say what it does,
   * instead of inheriting "allowed" by silence.
   *
   * @param {{kind:string, payload?:*, url?:string}} request  `payload` is what would be sent
   *   (checked against the session's own secrets); `url` is where (checked for private identifiers).
   * @param {{active?:boolean, nonces?:string[], secrets?:string[]}} [session]  `active`: the session
   *   holds private material right now.
   * @returns {{allow:boolean, decision:'allow'|'block'|'omit'|'notice', code:string|null, omit:string[]}}
   *   `code` is a stable reason id; the HOST owns the sentence (game.js STRINGS). `decision`
   *   'omit' carries `allow:false` AND a non-empty `omit`: send the request without those parts,
   *   or send nothing — both are safe, and only reading `decision` can tell them apart.
   */
  function dispatch(request, session) {
    if (!isObject(request) || typeof request.kind !== 'string' || !request.kind) fail('dispatch needs {kind}.');
    const s = isObject(session) ? session : {};
    const active = !!s.active;
    const opts = { nonces: s.nonces || null, secrets: s.secrets || [], own: ownWords(request) };
    const out = (decision, code, omit) => ({
      allow: decision === DECISION.ALLOW || decision === DECISION.NOTICE,
      decision, code: code || null, omit: omit || [],
    });

    // RULE 0 — a transcript this policy cannot scrub BY STRUCTURE does not go at all. Only while
    // a private session is active: with no private material held there is nothing to scrub out,
    // and an ordinary chat is prose by nature. Blocking is the honest answer, not a redaction.
    if (active && request.kind === 'buddy-transcript' && request.payload !== undefined
      && !scrubbableTranscript(request.payload)) return out(DECISION.BLOCK, 'unscrubbable-transcript', []);

    // RULE 1 — a payload that names private material never leaves, active session or not. A
    // request captured while private data was on screen must not ride a later turn (plan §3:
    // "prevent previously captured private context from entering later turns"), and this rule is
    // what makes that true of an OLD snapshot as well as a fresh one.
    if (request.payload !== undefined) {
      const res = inspect(request.payload, opts);
      if (!res.ok) return out(DECISION.BLOCK, 'private-payload', []);
    }
    // RULE 2 — a request LINE is a log line. A fixed self-hosted asset is fine; the same URL with
    // a handle, an item id or an answer in it is not.
    if (typeof request.url === 'string' && request.url) {
      const res = inspect(request.url, opts);
      if (!res.ok) return out(DECISION.BLOCK, 'private-url', []);
    }

    const rule = Object.prototype.hasOwnProperty.call(CHANNELS, request.kind) ? CHANNELS[request.kind] : null;
    if (!rule) return active ? out(DECISION.BLOCK, 'unknown-channel', []) : out(DECISION.ALLOW, null, []);
    if (!active) return out(DECISION.ALLOW, null, []);
    if (rule === 'block') return out(DECISION.BLOCK, 'private-session', []);
    if (rule === 'omit') return out(DECISION.OMIT, 'private-session', CONTEXT_PARTS.slice());
    if (rule === 'notice') return out(DECISION.NOTICE, 'private-session', []);
    return out(DECISION.ALLOW, null, []);
  }

  // ------------------------------------------------------------------ removal and clear

  /**
   * A deep copy of an authored value with every private dependency GONE — the placeholder and
   * everything under it that was derived from private material.
   *
   * This is how a history snapshot is invalidated by "clear private session data" (plan §3): the
   * machine EDIT stays undoable, but no reachable history state still names the cleared
   * collection, so Undo cannot walk back to it and a Save afterwards cannot carry it. Without the
   * strip an undone state would keep a dead handle forever and say "not in this session any more"
   * about data nobody can restore.
   *
   * @param {*} value
   * @param {{only?:string[]}} [opts]  `only`: clear just these collection handles (one collection
   *   forgotten); omitted means every private dependency.
   * @returns {*} a copy (never the input; the input is never mutated)
   */
  function stripPrivate(value, opts) {
    const only = opts && Array.isArray(opts.only) ? opts.only : null;
    const hits = (h) => !only || only.indexOf(h) !== -1;
    function walk(v, inside) {
      if (!isPlain(v)) return v;
      if (Array.isArray(v)) return isNumericArray(v) ? v.slice() : v.map((x) => walk(x, inside));
      const ref = normaliseRef(v[REF_FIELD]);
      const here = inside || (!!ref && hits(ref.collection));
      const out = {};
      for (const k of Object.keys(v)) {
        if (k === REF_FIELD && ref && hits(ref.collection)) continue;
        if (here && CONTENT_FIELDS.indexOf(k) !== -1) continue;
        if (here && Object.prototype.hasOwnProperty.call(EMPTY_FIELDS, k)) { out[k] = EMPTY_FIELDS[k](); continue; }
        out[k] = walk(v[k], here);
      }
      return out;
    }
    return walk(value, false);
  }

  /**
   * THE CLEAR PLAN (plan §3's "clear private session data", as a decision the host performs).
   *
   * Every dependent piece — on the table AND inside a sealed part, at any depth — is named, so
   * "detach every dependent machine and part in that session" is a list the caller can act on and
   * a test can assert, not a loop written twice.
   *
   * `limits` is not decoration: it is the sentence plan §3 requires be said out loud. Clearing
   * reaches this session's memory. It does not reach a file the person already downloaded, and it
   * does not reach another device.
   *
   * @param {{table?:object, bricks?:object, handles?:string[]}} world  `table` = {pieces, wires};
   *   `bricks` = the parts library ({libId:{name,def}}); `handles` = what the registry holds.
   * @returns {{handles:string[], pieces:Array<{id:string, type:string, collection:string}>,
   *   bricks:Array<{libId:string, id:string, collection:string}>, limits:string[], empty:boolean}}
   */
  function clearPlan(world) {
    const w = isObject(world) ? world : {};
    const handles = (w.handles || []).slice();
    const pieces = [];
    const bricks = [];
    const walkPieces = (list, onHit) => {
      for (const p of list || []) {
        if (!isObject(p)) continue;
        const ref = normaliseRef(p[REF_FIELD]);
        if (ref) onHit(p, ref.collection);
        if (p.def) walkPieces(p.def.pieces, onHit);
      }
    };
    walkPieces((w.table && w.table.pieces) || [], (p, collection) => pieces.push({ id: p.id, type: p.type, collection }));
    for (const libId of Object.keys(w.bricks || {})) {
      const entry = w.bricks[libId];
      walkPieces((entry && entry.def && entry.def.pieces) || [], (p, collection) => bricks.push({ libId, id: p.id, collection }));
    }
    return {
      handles,
      pieces,
      bricks,
      // Stated, always — a limit only counts when it is said even in the happy case.
      limits: ['downloaded-files'],
      empty: !handles.length && !pieces.length && !bricks.length,
    };
  }

  /**
   * Removing ONE teaching example (plan §3): what else must be invalidated?
   *
   * The learned bank is content-cached in the registry, so it invalidates itself the moment the
   * training content changes — nothing to do here. The EVALUATION RECORDS do not: a frozen
   * snapshot goes on claiming a result about items the collection no longer holds. This says
   * which of them stopped being a current claim. Keep the frozen result labelled old; this is
   * NOT a deletion list. A snapshot holds outcomes and identity, never the removed raw payload.
   * Clearing the entire private session separately drops all records.
   *
   * @param {object[]} records  the frozen snapshots held for this collection
   * @param {string[]} removed  the item ids that have just gone
   * @returns {{stale:string[], kept:string[]}} record ids
   */
  function recordsInvalidatedBy(records, removed) {
    const gone = new Set(removed || []);
    const stale = [];
    const kept = [];
    for (const rec of records || []) {
      if (!isObject(rec)) continue;
      const touched = (rec.evaluated || []).some((id) => gone.has(id))
        || ((rec.training && rec.training.ids) || []).some((id) => gone.has(id));
      (touched ? stale : kept).push(rec.id);
    }
    return { stale, kept };
  }

  const api = {
    REF_FIELD, REF_KEYS, DEPENDENCY, CONTENT_FIELDS, CONTEXT_PARTS, CHANNELS, DECISION, HANDLE_RE,
    isHandle, handlesIn, normaliseRef,
    project, inspect, secretsOf,
    dispatch, scrubbableTranscript,
    stripPrivate, clearPlan, recordsInvalidatedBy,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.WorkshopPrivatePolicy = api;
})();
