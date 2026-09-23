'use strict';
/**
 * table-import.js — bring-your-own-data (spec docs/superpowers/specs/2026-08-27-data-course-v2-
 * design.md §3, task D). A child pastes or picks a CSV/TSV file on the Feeder's third source
 * ("your own table"), and this module turns raw text into the SAME schema shape logic/datasets.js's
 * authored tables already carry (kind/features[]/answer) — so every downstream reader (the
 * honesty plate, the Line brain's fitline axis, the Checker's kind + tolerance dial) treats an
 * uploaded table exactly like an authored one, with zero special-casing anywhere else.
 *
 * TWO pure functions, deliberately split — parsing is mechanical; schema-building is a judgment
 * call that needs to know which column the child picked as the ANSWER:
 *   parseTable(text)                   -> the raw grid: rows, column names, what got skipped.
 *   buildSchema(parsed, answerColumn)  -> the schema + crate-ready rows, or an honest error.
 *
 * Unlike datasets.js's `nameKey`s (translated UI strings looked up at render time), every label
 * here is RAW TEXT straight off the file — a column called "Wing Length" must read "Wing Length",
 * not a lookup key nobody wrote a translation for. Every features[]/answer object therefore
 * carries `name` (plain text), never `nameKey` — game.js's existing nameKey-reading call sites
 * prefer a plain `.name` when present, falling back to `t(.nameKey)` for authored datasets (see
 * dispName() in game.js).
 *
 * Determinism (lint-web's rule, and honest replay besides): no Math.random / Date.now anywhere.
 * The only "generated" value is the schema's `id`, a deterministic hash of the table's own shape
 * (same columns + same answer choice -> the same id, every time) — never wall-clock, never
 * chance. Pure; no DOM. CommonJS + window global, the same load idiom as every other logic/*.js.
 */

const MAX_ROWS = 200;      // spec §3: "cap 200 rows, said out loud, never silent" — see `truncated`.
const MAX_OPTIONS = 4;     // spec §3: a text column earns an options feature only at <=4 distinct values.

/**
 * A tiny FNV-1a-style string hash -> an unsigned 32-bit int. Duplicated from logic/datasets.js's
 * own `hash` (a few lines) rather than required from it — this module stays independent of the
 * authored-dataset registry, a pure function of its OWN inputs only.
 */
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/**
 * Split one line on `delim`, quote-aware: a field wrapped in double quotes may contain the
 * delimiter itself (e.g. `"Smith, John",5` is TWO cells, not three) and a doubled `""` inside a
 * quoted field unescapes to one literal `"`. Every cell is trimmed. This is NOT a full RFC4180
 * parser: a quoted field spanning multiple physical LINES is out of scope for a child's simple
 * pasted table (parseTable reads one line = one row) — a documented boundary, not a hidden one.
 */
function splitLine(line, delim) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else { inQuotes = false; }
      } else {
        cur += ch;
      }
    } else if (ch === '"' && cur === '') {
      inQuotes = true; // a quote right after a delimiter (or at line start) opens a quoted field
    } else if (ch === delim) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

/** Which of comma / tab / semicolon appears most in the header line (CSV/TSV auto-detect, spec
 *  §3). Ties favour comma, the spec's own first-named, most common default. */
function detectDelimiter(headerLine) {
  const candidates = [',', '\t', ';'];
  let best = ',', bestCount = -1;
  for (const d of candidates) {
    const count = headerLine.split(d).length - 1;
    if (count > bestCount) { best = d; bestCount = count; }
  }
  return best;
}

/**
 * Raw pasted/uploaded text -> a grid: honest column names, every data row's cells (aligned to the
 * header), and what got skipped along the way. Never throws — a malformed row is dropped and
 * counted, never a crash, because this reads untrusted, hand-pasted-by-a-child input.
 * @param {string} text
 * @returns {{rows: string[][], columns: string[], dropped: number, truncated: boolean, total: number}}
 *   rows      every KEPT data row (capped at MAX_ROWS), cells in column order (raw strings —
 *             buildSchema classifies).
 *   columns   the header, trimmed, de-duplicated/never-blank.
 *   dropped   count of non-blank lines whose field count could not be honestly aligned to the
 *             header and were skipped (a blank line is normal hygiene, not a drop).
 *   truncated true once MAX_ROWS good rows have been kept and more remained (spec §3: said out
 *             loud) — the KEPT rows are always the first MAX_ROWS, in file order.
 *   total     how many WELL-FORMED rows existed in all, whether or not the cap kept them (fix
 *             round 1: the "using the first {max} of {total} rows" line needs the real count of
 *             candidates, not just how many survived the cap — equals rows.length whenever
 *             truncated is false, by construction).
 */
function parseTable(text) {
  const lines = String(text || '').split(/\r\n|\r|\n/).filter((l) => l.trim() !== '');
  if (!lines.length) return { rows: [], columns: [], dropped: 0, truncated: false, total: 0 };
  const delim = detectDelimiter(lines[0]);
  const rawColumns = splitLine(lines[0], delim);
  // An honest, UNIQUE name for every header cell — a blank or repeated header would otherwise
  // collide as an object key downstream (Datasets.vec/face/dims index a row's features BY the
  // column's derived id), silently merging two different columns into one.
  const seen = new Set();
  const columns = rawColumns.map((name, i) => {
    const base = name || ('column ' + (i + 1));
    let out = base, n = 1;
    while (seen.has(out)) { n += 1; out = base + ' ' + n; }
    seen.add(out);
    return out;
  });

  const rows = [];
  let dropped = 0;
  let total = 0;
  let truncated = false;
  for (let li = 1; li < lines.length; li++) {
    let cells = splitLine(lines[li], delim);
    // One stray trailing empty cell (a spreadsheet's trailing delimiter on every row) is not a
    // malformed row — the honest, common case, tolerated rather than flagged.
    if (cells.length === columns.length + 1 && cells[cells.length - 1] === '') cells = cells.slice(0, -1);
    if (cells.length !== columns.length) { dropped += 1; continue; }
    total += 1; // a genuine, well-formed row — counted whether or not the cap below keeps it
    if (rows.length >= MAX_ROWS) { truncated = true; continue; }
    rows.push(cells);
  }
  return { rows, columns, dropped, truncated, total };
}

/** True if `s` (already known non-blank) parses cleanly as a finite number. */
function isNumericValue(s) {
  return Number.isFinite(Number(s));
}

/** A column header -> a stable, unique, object-key-safe id (Datasets.vec/face/dims index a row's
 *  features BY this). Lowercase, non-alnum runs collapse to one underscore; a collision (two
 *  headers that slugify the same) is disambiguated with a numeric suffix — `used` tracks ids
 *  already handed out this call. */
function slugId(name, used) {
  const base = String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'col';
  let id = base, n = 1;
  while (used.has(id)) { n += 1; id = base + '_' + n; }
  used.add(id);
  return id;
}

/**
 * A parsed table's columns/rows -> the SAME schema shape logic/datasets.js's authored tables
 * carry, once the child names the ANSWER column. Every judgment call spelled out (spec §3):
 *
 *   THE ANSWER COLUMN decides the schema's kind:
 *     - every non-blank value parses as a number -> kind 'number', {name, tolerance}. tolerance
 *       defaults to ~5% of the answer's own (max-min) range, rounded, floored at 1 (never 0 — a
 *       zero tolerance means "exact match", not a sane default for continuous data).
 *     - otherwise, EXACTLY 2 distinct non-blank values -> kind 'yesno', {name, labels:[first-seen,
 *       second-seen]} (the engine's cell math, logic/engine.js, already treats labels[0] as
 *       generically "the positive label" — it never hardcodes the literal word "yes").
 *     - any other shape (1, 3, 4, 5+ distinct non-numeric values) -> REJECTED, {error}. A 'labels'
 *       checker kind exists only as checkerKindFor's OWN "nothing to grade by" fallback (game.js)
 *       — datasetContents never builds a crate for it, so a schema of that kind would be a schema
 *       nothing downstream could honestly compile. Better to say so now than fail silently later.
 *
 *   EVERY OTHER COLUMN becomes a feature or is dropped:
 *     - blank in every row -> dropped (nothing to read).
 *     - every non-blank value numeric -> a number feature, {id, name, min, max} off the data.
 *     - <=MAX_OPTIONS distinct non-blank values -> an options feature, {id, name, options:
 *       [first-seen, ...]}.
 *     - otherwise -> dropped. Every drop is NAMED in `note` — an honest note, never a silent one.
 *
 *   A ROW missing a value in any KEPT column (a surviving feature, or the answer) cannot honestly
 *   become a crate — skipped, its count folded into `note` alongside the dropped columns.
 *
 * @param {{rows: string[][], columns: string[]}} parsed  parseTable's own return
 * @param {string} answerColumnName  one of parsed.columns, chosen by the child
 * @returns {{schema: object, note: string, rows: Array<{features: object, answer: string, value?: number}>}
 *          | {error: 'answer-not-found'|'no-rows'|'answer-unusable'}}
 */
function buildSchema(parsed, answerColumnName) {
  const columns = (parsed && Array.isArray(parsed.columns)) ? parsed.columns : [];
  const rawRows = (parsed && Array.isArray(parsed.rows)) ? parsed.rows : [];
  const answerIdx = columns.indexOf(answerColumnName);
  if (answerIdx === -1) return { error: 'answer-not-found' };
  if (!rawRows.length) return { error: 'no-rows' };

  const colAt = (idx) => rawRows.map((r) => r[idx]);
  const nonBlankOf = (vals) => vals.filter((v) => v.trim() !== '');

  // THE ANSWER COLUMN — classified first; its shape decides the whole schema's kind.
  const answerNonBlank = nonBlankOf(colAt(answerIdx));
  let answerKind, answerSpec;
  if (answerNonBlank.length && answerNonBlank.every(isNumericValue)) {
    const nums = answerNonBlank.map(Number);
    const lo = Math.min.apply(null, nums), hi = Math.max.apply(null, nums);
    const tolerance = Math.max(1, Math.round((hi - lo) * 0.05));
    answerKind = 'number';
    answerSpec = { name: answerColumnName, tolerance };
  } else {
    const distinct = [];
    for (const v of answerNonBlank) if (!distinct.includes(v)) distinct.push(v);
    if (distinct.length !== 2) return { error: 'answer-unusable' };
    answerKind = 'yesno';
    answerSpec = { name: answerColumnName, labels: distinct };
  }

  // EVERY OTHER COLUMN — a number feature, an options feature, or dropped (named in the note).
  const features = [];
  const featureColAt = []; // parallel to `features`: which raw column index it reads
  const droppedCols = [];
  const usedIds = new Set();
  for (let ci = 0; ci < columns.length; ci++) {
    if (ci === answerIdx) continue;
    const vals = colAt(ci);
    const nonBlank = nonBlankOf(vals);
    if (!nonBlank.length) { droppedCols.push(columns[ci]); continue; }
    if (nonBlank.every(isNumericValue)) {
      const nums = nonBlank.map(Number);
      features.push({ id: slugId(columns[ci], usedIds), name: columns[ci], min: Math.min.apply(null, nums), max: Math.max.apply(null, nums) });
      featureColAt.push(ci);
      continue;
    }
    const distinct = [];
    for (const v of nonBlank) if (!distinct.includes(v)) distinct.push(v);
    if (distinct.length <= MAX_OPTIONS) {
      features.push({ id: slugId(columns[ci], usedIds), name: columns[ci], options: distinct });
      featureColAt.push(ci);
    } else {
      droppedCols.push(columns[ci]);
    }
  }

  // ROWS — only ones with a real value in every KEPT column (every surviving feature + the
  // answer); a missing value there cannot honestly become a crate.
  let missingRows = 0;
  const outRows = [];
  for (const r of rawRows) {
    if (r[answerIdx].trim() === '') { missingRows += 1; continue; }
    const featVals = {};
    let ok = true;
    for (let fi = 0; fi < features.length; fi++) {
      const raw = r[featureColAt[fi]];
      if (raw.trim() === '') { ok = false; break; }
      const f = features[fi];
      featVals[f.id] = f.options ? raw.trim() : Number(raw.trim());
    }
    if (!ok) { missingRows += 1; continue; }
    const rawAnswer = r[answerIdx].trim();
    const row = { features: featVals, answer: answerKind === 'number' ? String(Number(rawAnswer)) : rawAnswer };
    if (answerKind === 'number') row.value = Number(rawAnswer);
    outRows.push(row);
  }

  const noteParts = [];
  if (droppedCols.length) noteParts.push('dropped: ' + droppedCols.join(', ') + ' (not numeric, not a short list of choices)');
  if (missingRows) noteParts.push(missingRows + ' row' + (missingRows === 1 ? '' : 's') + ' skipped (missing a value)');
  const note = noteParts.join(' · ');

  const schema = { kind: answerKind, features, answer: answerSpec };
  // A deterministic identity for this exact (columns, answer choice) shape — used upstream
  // (game.js) as the "which table did the shared brain last study" disclosure key, the same job
  // an authored dataset's plain id string ('plants', 'icecream', ...) already does.
  schema.id = 'table-' + hash(columns.join('|') + '=answer=' + answerColumnName).toString(36);

  return { schema, note, rows: outRows };
}

const WorkshopTableImport = { parseTable, buildSchema, MAX_ROWS, MAX_OPTIONS };
if (typeof module !== 'undefined' && module.exports) module.exports = WorkshopTableImport;
if (typeof window !== 'undefined') window.WorkshopTableImport = WorkshopTableImport;
