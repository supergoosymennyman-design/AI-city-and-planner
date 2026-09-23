/**
 * toolbox/champion-file.js — the versioned, portable "Champion File" (PROMOTED 2026-08-18 from
 * web/project/p5-01-recycle-eye/logic/championFile.js the moment a second lesson — the workshop —
 * reached for it; the toolbox law). p5-01 keeps its own frozen copy (it is the reference build);
 * this is the copy every NEW project uses. Task 075 scopes legacy embedding normalization here;
 * p5-01's frozen copy remains unchanged.
 *
 * ONE file per child: `{kind:'ai-champion', version:1, champion:{name, parts}, projects:{<id>:
 * <that project's own section>}, buddy:{name?, notes?, persona?}}`. A project only ever touches
 * projects[<its id>]; the champion's identity (name, earned parts) and the buddy's memory are
 * shared ground that every project carries through untouched. That is how a child's champion
 * walks from p5-01 to the workshop and back with nothing lost.
 *
 * Preservation law: unfamiliar project sections and top-level fields retain their JSON values
 * through parse/write/serialize. A matching field name is NEVER permission to transform foreign
 * data. The sole legacy normalization is version-1 ai-champion's p5-01-recycle-eye class vectors
 * (4dp, as in that lesson's own writer). writeProject also retains untouched in-memory references;
 * JSON round trips preserve values, not references or original formatting.
 *
 * Pure: never touches DOM/Blob/<input>. Immutable: every function returning a file returns a NEW
 * object. Deterministic (no clock — timestamps are injected). See the p5-01 original for the
 * long-form design notes each function carries.
 *
 * Globals: window.ChampionFile. CommonJS-exported for node --test.
 */
'use strict';

/** Champion display-name bounds — brief's interface: "champion.name string 1-24 chars". */
var MIN_NAME_LEN = 1;
var MAX_NAME_LEN = 24;
/** Fallback name for junk `emptyFile` input — `emptyFile`'s return type has no {ok:false} slot to
 * report a bad name through (junk in, clamp, never throw), and
 * its OWN output must always be something `parse` accepts back (Step 3's round-trip test). */
var DEFAULT_NAME = 'Champion';

/** The one envelope kind/version this build understands (spec §4). */
var KIND = 'ai-champion';
var VERSION = 1;

/**
 * Trim + length-clamp a raw champion-name input into something `parse` will always accept back.
 * @param {*} raw whatever the caller passed (kid-typed via a name-your-champion screen upstream)
 * @returns {string} 1..24 chars, never empty
 */
function normalizeName(raw) {
  if (typeof raw !== 'string') return DEFAULT_NAME;
  var trimmed = raw.trim();
  if (trimmed.length < MIN_NAME_LEN) return DEFAULT_NAME;
  return trimmed.length > MAX_NAME_LEN ? trimmed.slice(0, MAX_NAME_LEN) : trimmed;
}

/**
 * A brand-new, empty champion file: no earned parts, no project sections. First-boot name-your-
 * champion (spec §4) feeds straight into this.
 * @param {string} name kid-typed champion name (junk/empty normalizes to "Champion", never throws)
 * @returns {{kind:'ai-champion', version:1, champion:{name:string, parts:object}, projects:object}}
 */
function emptyFile(name) {
  return {
    kind: KIND,
    version: VERSION,
    champion: { name: normalizeName(name), parts: {} },
    projects: {},
  };
}

/**
 * Recursively round every number leaf to 4dp, preserving array shape. Embeddings are normally an
 * array-of-vectors (array-of-array-of-number, spec §4's `[[0.0123, ...]]`), but this recurses to
 * any depth so a flat vector or an oddly-nested one both round the same way. Non-number, non-array
 * leaves (should never occur inside a real embeddings field, but this is a total function, not a
 * trusting one) pass through unchanged rather than throwing.
 * @param {*} v a number, an array (possibly nested), or anything else
 * @returns {*} same shape as `v`, every finite number rounded via `Math.round(x*1e4)/1e4`
 */
function roundEmbeddings(v) {
  if (Array.isArray(v)) return v.map(roundEmbeddings);
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v * 1e4) / 1e4;
  return v;
}

/**
 * JSON-stringify a champion file, pretty-printed (2-space indent). Only the known version-1
 * ai-champion / p5-01-recycle-eye `classes[*].embeddings` round to 4dp. All unfamiliar projects
 * pass through, even if they contain identically named fields. Legacy `threshold`, `bests`,
 * `earnedAtAccuracy`, etc. keep their exact values too.
 *
 * Legacy embedding VECTORS are emitted compact — ONE line per vector — while everything around them stays
 * pretty. `JSON.stringify(out, null, 2)` alone puts every float on its own line, and a real
 * MobileNet embedding is 1024 floats: a 12-photo file measured 12,381 lines / 274KB (2026-08-11,
 * an owner-exported real file), and a maxed lesson would clear 4MB — hostile to any human or diff
 * tool that opens it. Mechanism: each flat all-number vector inside `embeddings` is swapped for a
 * unique string token, the whole file is pretty-printed, then each quoted token is replaced with
 * that vector's compact JSON. The token prefix GROWS (deterministically — logic/ bans randomness)
 * until it appears nowhere in the raw serialized file, so a string leaf that happens to contain the
 * prefix can never be corrupted by the final replace. `parse` is plain JSON.parse and thus
 * formatting-agnostic: still version 1, every existing file still loads, round-trip data identical.
 *
 * Never mutates `file` — builds new `projects`/`classes`/class-entry objects only on the path down
 * to an `embeddings` field; every untouched project section, class entry, and top-level key is the
 * SAME reference as the input (cheap, and incidentally makes "other sections untouched" easy to
 * verify by `===`, not just structural equality).
 *
 * Total: a non-object/null `file` never throws — serializes as if it were `{}`.
 * @param {object} file a champion file (from `emptyFile`, `parse`, or `writeProject`)
 * @returns {string} pretty JSON text, embedding vectors one-per-line
 */
function serialize(file) {
  var safeFile = file && typeof file === 'object' ? file : {};
  var projects = safeFile.projects && typeof safeFile.projects === 'object' ? safeFile.projects : {};

  // '@' and '~' survive JSON.stringify unescaped, so indexOf on the raw text sees exactly the
  // characters the pretty output would contain.
  var prefix = '@@emb@@';
  var probe = JSON.stringify(safeFile) || '';
  while (probe.indexOf(prefix) !== -1) prefix += '~';

  var vectors = []; // vectors[i] = compact JSON spliced back in place of the "<prefix><i>" leaf
  /** roundEmbeddings, plus: collapse each flat all-number array into a one-line token. */
  function tokenizeVectors(v) {
    if (Array.isArray(v)) {
      var flat = v.length > 0;
      for (var i = 0; i < v.length && flat; i++) {
        if (typeof v[i] !== 'number' || !Number.isFinite(v[i])) flat = false;
      }
      if (flat) {
        vectors.push(JSON.stringify(roundEmbeddings(v)));
        return prefix + (vectors.length - 1);
      }
      return v.map(tokenizeVectors);
    }
    return roundEmbeddings(v);
  }

  var roundedProjects = {};
  Object.keys(projects).forEach(function (pid) {
    var section = projects[pid];
    // Ownership comes from the known envelope/version/project, never from a coincidental shape.
    var legacy = safeFile.kind === KIND && safeFile.version === 1 && pid === 'p5-01-recycle-eye';
    if (legacy && section && Array.isArray(section.classes)) {
      var roundedClasses = section.classes.map(function (cls) {
        if (cls && Object.prototype.hasOwnProperty.call(cls, 'embeddings')) {
          return Object.assign({}, cls, { embeddings: tokenizeVectors(cls.embeddings) });
        }
        return cls;
      });
      roundedProjects[pid] = Object.assign({}, section, { classes: roundedClasses });
    } else {
      roundedProjects[pid] = section;
    }
  });
  var out = Object.assign({}, safeFile, { projects: roundedProjects });
  var text = JSON.stringify(out, null, 2);
  if (!vectors.length) return text;
  // The growth loop guarantees no REAL string leaf contains `prefix`, so every quoted
  // "<prefix><digits>" here is one of ours; the undefined-guard is total-function paranoia only.
  var re = new RegExp('"' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\d+)"', 'g');
  return text.replace(re, function (match, idx) {
    var vec = vectors[+idx];
    return vec === undefined ? match : vec;
  });
}

/** One kid-voiced note per rejection reason — distinct so a dev reading a failed parse in the
 * field can tell WHICH law the file broke, without exposing any of that detail to the kid (every
 * one of these reads fine standalone, e.g. surfaced as a toast on the "Bring in your champion"
 * screen — spec §4's own verb for the load flow). */
var NOTE_NOT_JSON = "That file doesn't look like a champion file — try picking a different one?";
var NOTE_WRONG_KIND = "That file isn't a champion file — bring in the right one?";
var NOTE_WRONG_VERSION = "This champion file is from a different app version — we can't open it yet.";
var NOTE_BAD_CHAMPION = "This champion file's name got lost along the way — try a different file?";
var NOTE_BAD_PROJECTS = "This champion file got mixed up — try a different file?";

/**
 * Parse + validate a champion file's JSON text. Required: a JSON object (not array/primitive),
 * `kind==='ai-champion'`, `version===1`, `champion` an object with a 1-24 char `name`, `projects`
 * an object. UNKNOWN top-level keys (the reserved `buddy` section, or any future addition) are
 * NEVER stripped or rejected — a valid file is handed back whole, exactly as parsed.
 * @param {string} text raw file contents (from a File/Blob read, or localStorage)
 * @returns {{ok:true, file:object} | {ok:false, note:string}}
 */
function parse(text) {
  if (typeof text !== 'string') return { ok: false, note: NOTE_NOT_JSON };
  var parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { ok: false, note: NOTE_NOT_JSON };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, note: NOTE_NOT_JSON };
  }
  if (parsed.kind !== KIND) return { ok: false, note: NOTE_WRONG_KIND };
  if (parsed.version !== VERSION) return { ok: false, note: NOTE_WRONG_VERSION };

  var champion = parsed.champion;
  if (!champion || typeof champion !== 'object' || Array.isArray(champion)) {
    return { ok: false, note: NOTE_BAD_CHAMPION };
  }
  if (typeof champion.name !== 'string' || champion.name.length < MIN_NAME_LEN || champion.name.length > MAX_NAME_LEN) {
    return { ok: false, note: NOTE_BAD_CHAMPION };
  }

  if (!parsed.projects || typeof parsed.projects !== 'object' || Array.isArray(parsed.projects)) {
    return { ok: false, note: NOTE_BAD_PROJECTS };
  }

  return { ok: true, file: parsed };
}

/**
 * Read one project's own section, or `null` if the file has no such section yet (a brand-new
 * project on an existing champion, or a garbage `file`).
 * @param {object} file a champion file
 * @param {string} projectId e.g. 'p5-01-recycle-eye'
 * @returns {object|null}
 */
function readProject(file, projectId) {
  if (!file || typeof file.projects !== 'object' || file.projects === null) return null;
  return Object.prototype.hasOwnProperty.call(file.projects, projectId) ? file.projects[projectId] : null;
}

/**
 * Write one project's section, returning a NEW file. Every OTHER project section, and every
 * top-level key beside `projects` (`kind`/`version`/`champion`/the reserved `buddy`/anything
 * else), is the SAME reference as in `file` — this function only ever touches its own project's
 * key in a shallow-copied `projects` map, never anyone else's (spec §4: "a project only ever
 * touches its own `projects` section; envelope + champion identity are shared ground").
 * @param {object} file a champion file (junk/missing normalizes to `{}` — never throws)
 * @param {string} projectId e.g. 'p5-01-recycle-eye'
 * @param {object} section that project's own save data — whatever shape it wants
 * @returns {object} a new file with `projects[projectId] = section`, everything else untouched
 */
function writeProject(file, projectId, section) {
  var safeFile = file && typeof file === 'object' ? file : {};
  var oldProjects = safeFile.projects && typeof safeFile.projects === 'object' ? safeFile.projects : {};
  var newProjects = Object.assign({}, oldProjects);
  newProjects[projectId] = section;
  return Object.assign({}, safeFile, { projects: newProjects });
}

/**
 * Read the file's reserved top-level `buddy` slot (the portable buddy's home — spec §4), or `null`
 * if the file has none yet or it isn't a plain object. Total: junk `file`/`buddy` never throws.
 * @param {object} file a champion file
 * @returns {object|null} the buddy section ({name?,notes?,persona?}) or null
 */
function readBuddy(file) {
  if (!file || typeof file !== 'object') return null;
  var b = file.buddy;
  return b && typeof b === 'object' && !Array.isArray(b) ? b : null;
}

/**
 * Write the `buddy` slot, returning a NEW file. Every OTHER top-level key (kind/version/champion/
 * projects/anything else) is the SAME reference as in `file` — this only ever touches `buddy`
 * (mirrors writeProject's "touch only your own key" rule). A null/undefined `section` REMOVES the
 * slot. Never mutates `file` (junk/missing normalizes to `{}` — never throws).
 * @param {object} file a champion file
 * @param {object|null} section the buddy section to store, or null to clear it
 * @returns {object} a new file with `buddy` set/removed, everything else untouched
 */
function writeBuddy(file, section) {
  var safeFile = file && typeof file === 'object' ? file : {};
  var out = Object.assign({}, safeFile);
  if (section == null) delete out.buddy; else out.buddy = section;
  return out;
}

/**
 * Append one timestamped note to the file's `buddy.notes` (the portable buddy's durable "about the
 * learner" memory — a child-approved `rememberUser` card, stateless-buddy Task 7), returning a NEW
 * file. Built entirely out of `readBuddy`+`writeBuddy`, so it inherits writeBuddy's own "touch only
 * `buddy`" rule for free: `champion`/`projects`/every other top-level key stays the SAME reference
 * as in `file`.
 *
 * `iso` is an INJECTED timestamp — never `new Date()` computed inside this module. This file lives
 * under `web/project/**\/logic/`, which `scripts/lint-web.mjs` determinism-scopes (no `Date.now`/
 * `Math.random` allowed there), and an embedded clock would also make this function untestable
 * against a fixed expected string. The caller (`game.js`'s `onRemember`, not logic-scoped) supplies
 * `new Date().toISOString()` — mirrors the repo's pre-existing `appendUserNote(text, ts, …)`
 * injected-timestamp pattern (formerly `server/memory.js`, deleted with the server-disk round trip).
 *
 * `note` is collapsed to ONE line before appending (stateless-buddy Task 7b fold-in): the source is
 * an AI reply's `rememberUser` proposal, and this note gets resent to the AI on every future turn as
 * durable memory — a multi-line note (accidental, or an adversarial model output) could otherwise
 * inject what LOOKS like its own `"- [..]"` bullet or a `"# "` header into `buddy.notes`, forging
 * fake history. Collapsing every run of whitespace-around-newlines to a single space keeps the
 * `"- [<iso>] <note>"` invariant true by construction: exactly one bullet line per call, no matter
 * what the note contains.
 * @param {object} file a champion file (junk/missing normalizes like writeBuddy — never throws)
 * @param {string} note the child-approved "remember this" text (approved via a [Remember] card)
 * @param {string} iso an ISO-8601 timestamp string, caller-supplied
 * @returns {object} a new file with `buddy.notes` grown by one `"- [<iso>] <note>"` line
 */
function appendBuddyNote(file, note, iso) {
  var slot = readBuddy(file) || {};
  var oneLine = String(note).replace(/\s*\n+\s*/g, ' ').trim(); // collapse newlines: no injected bullets/headers into durable memory
  var notes = (slot.notes && slot.notes.trim() ? slot.notes.replace(/\n*$/, '\n') : '# About the Learner\n') +
    '- [' + iso + '] ' + oneLine + '\n';
  return writeBuddy(file, Object.assign({}, slot, { notes: notes }));
}

var API = {
  emptyFile: emptyFile,
  serialize: serialize,
  parse: parse,
  readProject: readProject,
  writeProject: writeProject,
  readBuddy: readBuddy,
  writeBuddy: writeBuddy,
  appendBuddyNote: appendBuddyNote,
};
if (typeof window !== 'undefined') window.ChampionFile = API;
if (typeof module !== 'undefined' && module.exports) module.exports = API;
