'use strict';
/**
 * buddy-host.js — the workshop as a BUDDY HOST: "vibe blocking" (owner 2026-08-17: cut the
 * Cloud AI block, mount the buddy directly — the buddy can control blocks).
 *
 * The buddy speaks SEVEN generic verbs against a per-project manifest (web/coding agent,
 * INTEGRATION.md §4 — "there is no eighth verb"). This module is the pure translation:
 *   - manifest()          what the machine is, in the buddy's vocabulary
 *   - stateOf(table,live) what is on the table right now, in the buddy's shape
 *   - apply(table,action) one proposed action → { table', ok, note } — NEVER mutates its input
 * The blocks and wires are FLAT SLOTS whose ids are child-visible prose (the escape hatch the
 * kit documents): "lamp Alarm" adds a Lamp named Alarm; "b3:reading>b7:on" wires two ports;
 * the same shape law that governs a drag (game.canLink) governs the buddy — it cannot wire
 * what a finger cannot. Nothing here touches the DOM, the run, or the network; game.js wraps
 * apply with the undo stack, renderAll and status, and the run/stop/gallery checks.
 *
 * Pure: no DOM, no clock, no randomness. Loadable under node --test (requires nothing — the
 * game api is passed in) and as a classic script (window.WorkshopBuddyHost).
 */

// How many pieces the buddy may place in ONE action. Owner 2026-08-19: "It can set up simple
// things never ever the complete build." A sentence in the guide asking a model to go slowly is
// a wish; this is the rule — three is a step a child can still read and undo, and a recipe like
// "Model reading → Filter → gate" fits, while a whole machine does not. The examples/galleries
// are deliberately ABSENT from the manifest: a verb the buddy cannot see is one it cannot offer.
const STEP_MAX = 3;

/**
 * @param {object} game — the WorkshopGame api (PALETTE, defaultBlock, connsOf, canLink, t, …)
 * @returns {{manifest:function, stateOf:function, apply:function, STEP_MAX:number}}
 */
function createBuddyHost(game) {
  const t = game.t;

  /**
   * The ENGLISH string for a key, whatever language the workshop is speaking (task 085).
   *
   * The guide below is a MODEL-facing prompt, not child-facing text, and it lives under a HARD
   * budget: manifest-sanitize.js drops it WHOLE past GUIDE_MAX (6000).
   * Letting it follow the UI language would mean re-proving that budget,
   * and the buddy's block vocabulary, in every language we ever add. So it is pinned to English
   * at the source instead. game.STRINGS is the English table by definition — i18n/en.json mirrors
   * it, and tests/game.test.js asserts they are identical.
   * @param {string} key
   * @returns {string}
   */
  const en = (key) => (game.STRINGS && game.STRINGS[key] !== undefined ? game.STRINGS[key] : t(key));

  /**
   * Type ↔ shelf name, both directions, case-insensitive ("Filter" → filter, "filter" → filter).
   *
   * Matches THREE ways on purpose (task 085): the raw type id, the ENGLISH shelf name, and the
   * name in whatever language the workshop is currently speaking. The guide the model reads is
   * pinned to English (see  above), so the model asks for "Lamp" — but a child typing
   * 「燈」 into the buddy must be understood too, and dropping either side would break one of
   * them. toLowerCase is a no-op on Han characters and harmless here.
   */
  function typeFromWord(word) {
    const w = String(word || '').trim().toLowerCase();
    for (const type of game.PALETTE) {
      if (w === type
        || w === en('block.' + type).toLowerCase()
        || w === t('block.' + type).toLowerCase()) return type;
    }
    return null;
  }

  function manifest() {
    return {
      projectId: 'workshop',
      directEdits: true,
      title: t('title'),
      kidJob: 'teach a small model on private examples, inspect and test its decisions, compose it into a machine, and control what leaves the device',
      // The buddy's whole map of the box (the gateway caps it — see GUIDE_MAX in
      // manifest-sanitize.js). The block list is GENERATED from the same job.* strings the shelf
      // and the manual use. New blocks document themselves but still spend the hard budget:
      // run buddy-host.test.js whenever PALETTE/job.* changes. Preserve every block's purpose
      // and trim redundant surrounding prose before considering a gateway contract change.
      guide: 'WHAT EACH BLOCK IS FOR (addItems→blocks; a name may follow): '
        + game.PALETTE.map((k) => en('block.' + k) + ' — ' + en('job.' + k)).join('; ') + '. '
        + 'WIRE "ID:port>ID:port" (addItems→wires). Items couple: feeder out→track in→gate in; gate exit1..6→bin/checker in. '
        // `nearest` is CONDITIONAL (only a knn-family brain offers it — senseOffersPort), but the
        // guide teaches the vocabulary, not the gate: authoring a nearest wire on a line-brain
        // Model is refused by the same predicate every surface shares (final review, 2026-09-05).
        + 'OUT: sense reading|unsure|nearest, button pressed, feeder emitted, bin count, checker right|wrong|unsure|error, timer fire, counter atN|value, filter/window/dice out. '
        + 'IN: feeder drop, filter/window in, timer activity, counter plus|minus|reset, lamp on, noisemaker play, sign show, frame show, teach fileIt, gate switch1..6 (one per way; way 1 is also the default when none armed; a LATCH-mode gate never clears the arm — sorter does), pen release, dice in|reward. '
        + 'Dials are ports too: "dial:rate". New blocks get ids b1, b2…; wire by id or name; remove by ID. '
        + 'RECIPES: sort by what it reads = Model reading→Filter→gate switch2. Say it aloud = Model reading→Display show. '
        + 'Complain when wrong = Evaluator wrong→Sound play. Learn from a clap = Button pressed→Chance reward. '
        // "…its own picture as it runs" trimmed to "…itself" (final review, 2026-09-05): the
        // guide is a hard budget and `|nearest` above had to be paid for — same law as task 3's cut.
        + 'See the score = open the Evaluator: it draws guess-vs-truth itself, no wire needed. '
        + 'Public photo k-NN: its Evaluator offers Check Training + Dev, measured k trials and Run final Test. Stop clears trials. Training self-matches; compare Dev before final Test. '
        // Pay for Calculate/Join/Memory by tightening teaching/coaching prose, not their jobs.
        // This is a HARD budget: manifest-sanitize.js drops the WHOLE guide past GUIDE_MAX.
        + 'Teach a Model with examples on shelves via Teach, or enable "files": it FILES readings instead of guessing. '
        + 'A Data feed learns this way during Run; a latch gate routes the rest to a Buffer until release, for testing on examples it never studied. '
        + 'HOW TO HELP: the CHILD builds, ONE step at a time; at most ' + STEP_MAX + ' blocks or wires per action. '
        + 'Place one step, explain it in one sentence, then ask what comes next. Never assemble a finished machine or open/offer ready-made examples. '
        + 'For a whole sorter, name its FIRST block and build that together. '
        // Static capability knowledge only: this must never interpolate examples, scores, names
        // or registry handles. The manifest remains available when private context is withheld.
        + 'PRIVATE LEARNING: In a Camera Model, open Teach, use Add photos, select photos and file them onto named shelves. '
        + 'Hold back Validation and Test examples; use Update the split after examples change. Only Training teaches; new examples may wait for a pile. '
        + 'In Evaluation, Check on held-back examples uses Validation; reserve Test for a final check, not repeated tuning. '
        + 'Open a saved check, then a prediction for its evidence. Frozen recorded predictions differ from evidence recomputed now; settings or examples may have changed. '
        + 'Correct shelf labels or teaching examples locally, retest on the same held-back examples and compare checks. Do not claim improvement without comparable results. '
        + 'Distinguish wrong, unsure, unread, error and missing reference; confidence or nearest-example votes are not a measured probability of being right. '
        + 'PARTS: Seal as a part makes a reusable component with exposed ports and independent private learning. To correct inside it, stop and Unpack the pieces, retest, then seal again; keep a separate copy for comparison. '
        + 'BATCH: the Batch toolbar control runs finite file inputs, lets the user inspect item results and routing, then preview and explicitly download selected fields. It is not a block or unattended automation. '
        + 'Training/Validation/Test Batch choices require a current split; All items is not held-out evidence. A Sorter decision belongs to its matching item; missing or expired decisions can take the fallback way. '
        + 'PRIVACY: Private examples, learned state and results are session-only; saving a machine does not save them. Reload may require Use new private data and teaching again. '
        + 'You receive structure, settings, observed summaries, memory, credits and actual ownedGear even in private sessions. Raw examples, photos and audio are not attached. Distinguish observations from guesses; inspect errors. Accuracy is not mastery. Only teachers award credits; never claim awards or completion. Preferences are not ownership. '
        + 'ACTION LIMITS: You can add/remove standard blocks and wires, set feederRate/sureLine/voters, run/stop, undo and remember supported preferences. '
        + 'These dials change ALL top-level Feeders or Models of that kind, not a chosen block; the summary shows only the first. lookAtTable only reports supplied findings, not a full simulation or private inspection. '
        + 'Teach, import, split, evaluation, correction, Batch/export and sealing/unpacking are user-operated controls: explain them, never invent tool calls or claim to have done them. '
        + 'The shared table summary omits many settings and Part internals and is bounded; ask about the relevant control when unsure. '
        + 'Email/calendar connections and writing in the owner\'s voice are future work. Photo workflows have been exercised; text understanding and useful real-world accuracy are not established.',
      params: [
        { name: 'feederRate', label: 'Feeder items/min', min: 1, max: 120, step: 1 },
        { name: 'sureLine', label: 'Model confidence threshold', min: 0, max: 1, step: 0.05 },
        { name: 'voters', label: 'Model k (how many vote)', min: 1, max: 9, step: 1 },
      ],
      slots: [
        { name: 'settings', label: 'Settings by block ID', grouped: true },
        { name: 'ownedGear', label: 'Actually owned catalog IDs', grouped: false },
        { name: 'blocks', label: 'Blocks on the table', grouped: false },
        { name: 'wires', label: 'Wires and couplings', grouped: false },
      ],
      checks: [
        { name: 'run', label: 'Run the machine' },
        { name: 'stop', label: 'Stop the machine' },
        { name: 'lookAtTable', label: 'Look at the table', readOnly: true },
      ],
      readouts: [
        { name: 'championName', label: 'Champion name' },
        { name: 'credits', label: 'Teacher awarded credits' },
        { name: 'running', label: 'Running' },
        { name: 'display', label: 'The Display says' },
        { name: 'bins', label: 'Bins' },
        { name: 'lastHint', label: 'Last hint' },
      ],
    };
  }

  /** One child-visible line per piece: "id Type name [setting]" — the setting a wire or a
   *  question would need (an Only-if's word, a Sense's model, a Lamp's colour). */
  const blockLine = (p) => {
    let extra = '';
    if (p.type === 'filter') extra = (p.mode === 'isnot' ? 'is not ' : p.mode === 'any' ? 'any ' : 'is ') + (p.label || '');
    if (p.type === 'sense') extra = game.SENSE_REGISTRY[p.senseId] ? t(game.SENSE_REGISTRY[p.senseId].nameKey) : '';
    if (p.type === 'lamp') extra = p.colour || '';
    if (p.type === 'timer') extra = (p.mode || 'every') + ' ' + p.seconds + 's';
    return (p.id + ' ' + t('block.' + p.type) + (p.name ? ' ' + p.name : '') + (extra ? ' [' + extra + ']' : '')).slice(0, 40);
  };
  const wireLine = (w) => (w.from.block + ':' + w.from.port + '>' + w.to.block + ':' + w.to.port).slice(0, 40);
  const snapLine = (s) => (s.from.piece + ':' + s.from.end + '>' + s.to.piece + ':' + s.to.end).slice(0, 40);

  /**
   * @param {object} table   {pieces, snaps, wires}
   * @param {object} live    {running:boolean, display:string, bins:string, lastHint:string} — from game.js
   */
  function stateOf(table, live) {
    live = live || {};
    const feeder = table.pieces.find((p) => p.type === 'feeder');
    const sense = table.pieces.find((p) => p.type === 'sense');
    const findings = [];
    for (const p of table.pieces) {
      // A LIVE sense (Camera, Pose) off the belt is EQUALLY detached now — room mode left the app
      // (spec 2026-08-27 §4.3), so Run refuses it just the same as a non-live one. The `live`
      // exemption that used to live here was correct under room mode and stale once it left: it
      // let the buddy tell a child a broken table was fine (whole-branch review, Important 2).
      if (p.type === 'sense' && !p.watchPiece) {
        findings.push({ kind: 'senseOffBelt', note: (p.name || p.id) + ' is not standing on a track — it reads no crate.', ids: [p.id] });
      }
      if (p.type === 'sense' && !table.wires.some((w) => w.from.block === p.id && w.from.port === 'unsure')) {
        findings.push({ kind: 'unsureUnwired', note: (p.name || p.id) + ' has nothing on its unsure port — its doubt is silent.', ids: [p.id] });
      }
    }
    if (!table.pieces.length) findings.push({ kind: 'emptyTable', note: 'The table is empty — a clean start.' });
    return {
      params: {
        feederRate: feeder ? Number(feeder.rate) || 20 : 20,
        sureLine: sense && Number.isFinite(sense.sure) ? sense.sure : 0.5,
        voters: sense && Number.isFinite(sense.k) ? sense.k : 3,
      },
      slots: {
        settings: { groups: Object.fromEntries(table.pieces.slice(0,20).map(p => [p.id, [
          'type','rate','speed','mode','exits','senseId','brainId','k','sure','penalty','degree','watchPiece','files',
          'n','seconds','training','validation','operation','left','right','field','initialValue','colour','sound','pitch','every'
        ].filter(key => ['string','number','boolean'].includes(typeof p[key])).map(key => (key + '=' + String(p[key])).slice(0,40))])) },
        blocks: { items: table.pieces.map(blockLine) },
        wires: { items: table.snaps.map(snapLine).concat(table.wires.map(wireLine)) },
      },
      readouts: {
        running: live.running ? 'yes' : 'no',
        display: String(live.display || '—').slice(0, 60),
        bins: String(live.bins || 'none').slice(0, 60),
        lastHint: String(live.lastHint || '').slice(0, 60),
      },
      findings: findings.slice(0, 6),
    };
  }

  function clone(table) { return JSON.parse(JSON.stringify(table)); }
  /**
   * Find a piece the way a MODEL names it (live gateway drive 2026-08-18: the model wrote
   * "watchdog:unsure>lamp Alarm:in" — names, not ids). Accepted, in order: the id; the child's
   * name; "Type name" ("lamp Alarm"); a bare type word when exactly ONE piece of that type is on
   * the table ("lamp"). Case-insensitive throughout. Ambiguity returns null — never a guess.
   */
  function pieceBy(table, ref) {
    const r = String(ref || '').trim();
    const low = r.toLowerCase();
    const only = (matches) => matches.length === 1 ? matches[0] : null;
    let p = table.pieces.find((q) => q.id === r);
    if (p) return p;
    const ids = table.pieces.filter((q) => q.id.toLowerCase() === low);
    if (ids.length) return only(ids);
    const named = table.pieces.filter((q) => (q.name || '').toLowerCase() === low);
    if (named.length) return only(named);
    const words = r.split(/\s+/);
    for (let n = Math.min(2, words.length - 1); n >= 1; n--) {
      const type = typeFromWord(words.slice(0, n).join(' '));
      const name = words.slice(n).join(' ').toLowerCase();
      if (type) { const matches = table.pieces.filter((q) => q.type === type && (q.name || '').toLowerCase() === name); if (matches.length) return only(matches); }
    }
    const type = typeFromWord(r);
    if (type) { const of = table.pieces.filter((q) => q.type === type); if (of.length === 1) return of[0]; }
    return null;
  }
  /**
   * "ID:port" → a connector descriptor from the piece's REAL connectors (connsOf), or null.
   * Port tolerance (same drive): "in"/"out" name the piece's ONLY signal socket/nub when it has
   * exactly one ("lamp Alarm:in" → on); a dial works with or without the "dial:" prefix.
   */
  function endOf(table, spec) {
    const m = /^([^:>]+):(.+)$/.exec(String(spec || '').trim());
    if (!m) return null;
    const p = pieceBy(table, m[1]);
    if (!p) return null;
    let port = m[2].trim().toLowerCase();
    let want = null;
    if (port.startsWith('dial:')) { want = 'dial'; port = port.slice(5); }
    const conns = game.connsOf(p);
    let c = conns.find((k) => k.name.toLowerCase() === port && (!want || k.kind === want));
    if (!c && !want) {
      const sigIns = conns.filter((k) => k.kind === 'sig-in'), sigOuts = conns.filter((k) => k.kind === 'sig-out');
      if ((port === 'in' || port === 'input') && sigIns.length === 1) c = sigIns[0];
      if ((port === 'out' || port === 'output') && sigOuts.length === 1) c = sigOuts[0];
    }
    return c ? { piece: p.id, kind: c.kind, name: c.name } : null;
  }

  /** Free spot for a new card: right of the rightmost piece, staggered down. */
  function placeNew(table, b, i) {
    const right = table.pieces.reduce((m, p) => Math.max(m, (p.x || 0) + 160), 40);
    b.x = right + 20 + (i % 3) * 30;
    b.y = 80 + (i % 5) * 120;
    return b;
  }

  /**
   * Apply ONE buddy action to a table. Returns { table, ok, note, changed } — table is a fresh
   * copy on success; the input is never touched. `nextId` is read from the table's own ids
   * (b<N>), so the caller can keep its counter in step via the returned `nextId`.
   */
  function apply(table, action) {
    const a = action || {};
    const out = clone(table);
    const notes = [];
    let nextId = 1;
    for (const p of out.pieces) { const m = /^b(\d+)$/.exec(String(p.id)); if (m) nextId = Math.max(nextId, Number(m[1]) + 1); }
    const fail = (note) => ({ table, ok: false, note, changed: false, nextId });

    if (a.op === 'setParam') {
      const v = Number(a.value);
      if (!Number.isFinite(v)) return fail('That value is not a number.');
      if (a.name === 'feederRate') {
        const fs = out.pieces.filter((p) => p.type === 'feeder');
        if (!fs.length) return fail('There is no Feeder on the table to set.');
        for (const f of fs) f.rate = Math.max(1, Math.round(v));
        notes.push('Feeder set to ' + Math.round(v) + ' items/min.');
      } else if (a.name === 'sureLine' || a.name === 'voters') {
        const ss = out.pieces.filter((p) => p.type === 'sense');
        if (!ss.length) return fail('There is no Sense on the table to set.');
        for (const s of ss) { if (a.name === 'sureLine') s.sure = Math.max(0, Math.min(1, v)); else s.k = Math.max(1, Math.round(v)); }
        notes.push((a.name === 'sureLine' ? 'Sure line set to ' + Math.max(0, Math.min(1, v)) : 'Voters set to ' + Math.max(1, Math.round(v))) + ' on every Sense.');
      } else return fail('No such setting: ' + a.name);
      return { table: out, ok: true, note: notes.join(' '), changed: true, nextId };
    }

    if (a.op === 'addItems' && a.slot === 'blocks') {
      const ids = Array.isArray(a.ids) ? a.ids : [];
      if (!ids.length) return fail('Say which block to add.');
      let placed = 0;
      ids.forEach((raw, i) => {
        const words = String(raw).trim().split(/\s+/);
        // Two-word shelf names ("Sorter gate", "Data reader") — try the longest match first.
        let type = null, used = 0;
        for (let n = Math.min(2, words.length); n >= 1 && !type; n--) { type = typeFromWord(words.slice(0, n).join(' ')); if (type) used = n; }
        if (!type) { notes.push('No block called "' + raw + '".'); return; }
        if (placed >= STEP_MAX) { notes.push('Leaving "' + raw + '" for the next step — I place ' + STEP_MAX + ' at a time so you can see what each one does.'); return; }
        placed++;
        const b = game.defaultBlock(type, 'b' + nextId++);
        const name = words.slice(used).join(' ').trim();
        if (name) b.name = name.slice(0, 24);
        placeNew(out, b, i);
        out.pieces.push(b);
        notes.push('Placed ' + t('block.' + type) + (name ? ' "' + name + '"' : '') + ' as ' + b.id + '.');
      });
      const changed = out.pieces.length !== table.pieces.length;
      return { table: changed ? out : table, ok: changed, note: notes.join(' '), changed, nextId };
    }

    if (a.op === 'addItems' && a.slot === 'wires') {
      const ids = Array.isArray(a.ids) ? a.ids : [];
      if (!ids.length) return fail('Say which two ports to wire, like b3:reading>b7:on.');
      let changed = false, made = 0;
      for (const raw of ids) {
        const parts = String(raw).split('>');
        if (parts.length !== 2) { notes.push('"' + raw + '" is not FROM:port>TO:port.'); continue; }
        const from = endOf(out, parts[0]), to = endOf(out, parts[1]);
        if (!from || !to) { notes.push('"' + raw + '": ' + (!from ? parts[0] : parts[1]) + ' is not a port on one uniquely identified block. Use the exact block ID and port.'); continue; }
        const link = game.canLink(from, to);
        if (!link) { notes.push('"' + raw + '": those shapes do not fit together.'); continue; }
        if (made >= STEP_MAX) { notes.push('Leaving "' + raw + '" for the next step — I wire ' + STEP_MAX + ' at a time.'); continue; }
        made++;
        if (link.type === 'snap') {
          out.snaps = out.snaps.filter((s) => !(s.from.piece === link.from.piece && s.from.end === link.from.end));
          out.snaps.push({ from: link.from, to: link.to });
          notes.push('Coupled ' + raw + '.');
        } else {
          const key = JSON.stringify({ from: link.from, to: link.to });
          if (!out.wires.some((w) => JSON.stringify(w) === key)) out.wires.push({ from: link.from, to: link.to });
          notes.push('Wired ' + raw + '.');
        }
        changed = true;
      }
      return { table: changed ? out : table, ok: changed, note: notes.join(' '), changed, nextId };
    }

    if (a.op === 'removeItems' && a.slot === 'blocks') {
      let changed = false;
      for (const raw of (a.ids || [])) {
        const p = pieceBy(out, raw) || out.pieces.find(q => blockLine(q) === String(raw).trim());
        if (!p) { notes.push('No unique block "' + raw + '" on the table. Use its exact ID: ' + out.pieces.map(q => q.id).join(', ') + '.'); continue; }
        out.pieces = out.pieces.filter((q) => q.id !== p.id);
        out.snaps = out.snaps.filter((s) => s.from.piece !== p.id && s.to.piece !== p.id);
        out.wires = out.wires.filter((w) => w.from.block !== p.id && w.to.block !== p.id);
        for (const q of out.pieces) if (q.watchPiece === p.id) q.watchPiece = null;
        notes.push('Removed ' + t('block.' + p.type) + ' ' + p.id + '.');
        changed = true;
      }
      return { table: changed ? out : table, ok: changed, note: notes.join(' '), changed, nextId };
    }

    if (a.op === 'removeItems' && a.slot === 'wires') {
      let changed = false;
      for (const raw of (a.ids || [])) {
        const key = String(raw).trim();
        const nw = out.wires.filter((w) => wireLine(w) !== key);
        const ns = out.snaps.filter((s) => snapLine(s) !== key);
        if (nw.length === out.wires.length && ns.length === out.snaps.length) { notes.push('No wire "' + raw + '".'); continue; }
        out.wires = nw; out.snaps = ns;
        notes.push('Removed ' + key + '.');
        changed = true;
      }
      return { table: changed ? out : table, ok: changed, note: notes.join(' '), changed, nextId };
    }

    // A model that remembers the old verb still gets an honest answer, not a shrug.
    if (a.op === 'createGroup' || a.slot === 'galleries') {
      return fail('Ready-made machines are not mine to open — tell me what yours should do and we will build it a block at a time.');
    }
    // run / stop / undoLast are the host's (they touch the run, not the table).
    return fail('The workshop cannot do "' + a.op + '" on ' + (a.slot || a.name || '') + '.');
  }

  return { manifest, stateOf, apply, STEP_MAX, typeFromWord };
}

// Named, not `api`: classic scripts share ONE global scope, and logic/stage-layout.js already
// owns a top-level `const api` (the collision is a SyntaxError that kills this whole file).
const WorkshopBuddyHost = { createBuddyHost, STEP_MAX };
if (typeof module !== 'undefined' && module.exports) module.exports = WorkshopBuddyHost;
if (typeof window !== 'undefined') window.WorkshopBuddyHost = WorkshopBuddyHost;
