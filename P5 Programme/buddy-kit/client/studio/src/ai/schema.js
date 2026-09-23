/**
 * AI shape schema — the single source of truth for what an LLM is allowed to
 * return, and how a validated reply is normalized into the studio's own shape
 * schema.
 *
 * This module is PURE ESM: no DOM, no `three`, no network. It loads in plain
 * Node so the test harness can exercise it directly.
 *
 * Two schema layers live here, and the difference matters:
 *  - The LLM-FACING schema (`AI_RESPONSE_SCHEMA_HINT`) is deliberately FLAT:
 *    `color` is a `#rrggbb` STRING and `p`/`r`/`s` sit at the TOP level of each
 *    object. The system prompt embeds that hint verbatim, so the prompt and this
 *    validator can never drift apart.
 *  - The INTERNAL schema (what `normalizeObject` returns, and what
 *    `src/edit/snapshot.js` `takeSnapshot` produces) nests the transform as
 *    `transform:{p,r,s}` and stores `color` as a decimal int (three.js
 *    `Color.getHex()`). It is what `insert.js` and `restoreSnapshot` consume.
 * `normalizeObject` is the bridge between the two.
 */

import { MAX_COORD } from './limits.js';

/**
 * The primitive kinds an AI reply may request. This mirrors the `PRIMITIVES`
 * map in `src/scene.js` (the only place that knows how to build a shape), so the
 * whitelist and the builder can never disagree.
 *
 * @type {ReadonlyArray<string>}
 */
export const AI_SHAPE_KINDS = Object.freeze([
  'box',
  'sphere',
  'cylinder',
  'cone',
  'torus',
  'octahedron',
  'plane',
]);

/**
 * The exact JSON contract embedded verbatim into the system prompt. Kept here
 * (not in the prompt module) so the prompt text and the validator share one
 * source of truth and cannot drift.
 *
 * It documents the LLM-FACING shape, which is deliberately flatter than the
 * internal one: `color` is a `#rrggbb` string and `p`/`r`/`s` are top-level
 * (internal form nests them under `transform` and stores color as an int).
 *
 * @type {string}
 */
export const AI_RESPONSE_SCHEMA_HINT =
  '{"summary":"<one line>","objects":[{"kind":"box","name":"human-head","color":"#ff6b6b","p":[0,1.2,0],"r":[0,0,0],"s":[1,1,1]}]}';

/** Decimal-int fill used when a colour cannot be parsed as `#rrggbb`. */
const DEFAULT_COLOR = 0xffffff;

/**
 * Smallest accepted scale magnitude on any axis. A `0` or negative scale makes a
 * primitive invisible (and flips winding for negatives), so a non-positive
 * component is clamped up to this floor.
 */
const MIN_SCALE = 1e-3;

/** Identity transform components (position/rotation origin, unit scale). */
const IDENTITY_P = [0, 0, 0];
const IDENTITY_R = [0, 0, 0];
const IDENTITY_S = [1, 1, 1];

/**
 * Convert a colour to a three.js decimal int.
 *
 * Accepts `#rrggbb`, bare `rrggbb` (case-insensitive), or an already-numeric
 * value. Anything unparseable falls back to white so a bad colour never blocks
 * insertion.
 *
 * @param {*} raw - The LLM-supplied colour (string or number).
 * @returns {number} Decimal int in `0x000000..0xffffff` (three.js `getHex()` form).
 */
function parseColor(raw) {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.min(Math.max(Math.round(raw), 0), 0xffffff);
  }
  if (typeof raw === 'string') {
    const m = /^#?([0-9a-fA-F]{6})$/.exec(raw.trim());
    if (m) return parseInt(m[1], 16);
  }
  return DEFAULT_COLOR;
}

/**
 * Coerce an LLM-supplied 3-vector into a finite `[x,y,z]` tuple.
 *
 * Missing entries keep their identity default (so `{p:[0,1,0]}` leaves z at 0);
 * non-finite entries are replaced with the identity component and reported as an
 * issue. A finite-but-absurd magnitude (e.g. `1e308`) is clamped to
 * {@link MAX_COORD} and reported, because such a value is legal JSON yet makes
 * three.js bounding boxes/camera maths non-finite (the preview then blanks).
 * When `positive` is set (scale only), any component `<= 0` is clamped to
 * `MIN_SCALE` and reported.
 *
 * @param {*} raw - Candidate array (`Number(...)`-coerced per component).
 * @param {string} label - Field name used in issue messages (`p`/`r`/`s`).
 * @param {number[]} identity - Per-component fallback for missing/invalid values.
 * @param {{positive?: boolean}} [opts] - Clamp all components to `> 0` (scale).
 * @returns {{ out: number[], issues: string[] }} Normalized tuple + human-readable issues.
 */
function coerceVec3(raw, label, identity, opts = {}) {
  const out = identity.slice();
  const issues = [];
  if (Array.isArray(raw)) {
    for (let i = 0; i < 3; i++) {
      if (i >= raw.length) break; // absent component keeps its identity default
      const n = Number(raw[i]);
      if (Number.isFinite(n)) {
        if (Math.abs(n) > MAX_COORD) {
          out[i] = n < 0 ? -MAX_COORD : MAX_COORD;
          issues.push(`${label}[${i}] is out of range`);
        } else {
          out[i] = n;
        }
      } else {
        issues.push(`${label}[${i}] is not a finite number`);
      }
    }
  } else if (raw != null) {
    issues.push(`${label} is not an array`);
  }
  if (opts.positive) {
    for (let i = 0; i < 3; i++) {
      if (out[i] <= 0) {
        issues.push(`${label}[${i}] must be > 0`);
        out[i] = MIN_SCALE;
      }
    }
  }
  return { out, issues };
}

/**
 * Normalize one LLM-facing object into the internal schema, collecting any
 * numeric-coercion issues along the way.
 *
 * @param {*} raw - One entry from `raw.objects`.
 * @param {number} index - Zero-based position (used for the default name).
 * @returns {{ object: object, issues: string[] }} Internal object + issues.
 */
function normalizeObjectDetailed(raw, index) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const kind = typeof src.kind === 'string' && src.kind ? src.kind : 'box';
  const p = coerceVec3(src.p, 'p', IDENTITY_P);
  const r = coerceVec3(src.r, 'r', IDENTITY_R);
  const s = coerceVec3(src.s, 's', IDENTITY_S, { positive: true });
  const name =
    typeof src.name === 'string' && src.name.trim()
      ? src.name.trim()
      : `ai-${kind}-${index + 1}`;

  return {
    object: {
      // Placeholder only: `insert.js` lets `addPrimitive` assign the real id.
      id: null,
      name,
      kind,
      imported: false,
      color: parseColor(src.color),
      transform: { p: p.out, r: r.out, s: s.out },
    },
    issues: [...p.issues, ...r.issues, ...s.issues],
  };
}

/**
 * Normalize one LLM-facing object into the studio's internal shape schema.
 *
 * Output is a STRICT SUBSET of `takeSnapshot()`'s per-object schema: it emits
 * `id`, `name`, `kind`, `imported`, `color`, `transform` only — never `geo`,
 * `generated`, `appearance` or `torus` (the AI path is primitives only; a torus
 * gets its default params from `scene.addPrimitive`).
 *
 * @param {*} raw - The LLM-supplied object (`{kind,name,color,p,r,s}`).
 * @param {number} [index=0] - Zero-based position, used for the default name.
 * @returns {{id: null, name: string, kind: string, imported: false, color: number, transform: {p: number[], r: number[], s: number[]}}} Internal-schema shape object.
 */
export function normalizeObject(raw, index = 0) {
  return normalizeObjectDetailed(raw, index).object;
}

/**
 * Validate a full LLM response and normalize every admissible object.
 *
 * Collects ALL errors (never stops at the first) so the UI can report precisely
 * what was wrong. Two SEVERITIES are reported separately:
 *
 *  - `hardErrors` — the reply is not usable: the response/objects shape is wrong,
 *    or an object uses a disallowed kind (`custom`, unknown) or carries `geo`.
 *    Those objects are excluded from `objects`.
 *  - `repairs` — the reply IS usable, but a numeric value had to be replaced or
 *    clamped (non-finite coordinate, non-positive scale). The repaired object is
 *    still normalized into `objects`.
 *
 * `errors` is the concatenation (`hardErrors` then `repairs`) and `ok` stays true
 * only when there are NO messages of either kind — preserved for existing
 * callers. `parse.js` uses `hardErrors` to accept a repairable reply (surface the
 * repair non-fatally) while still rejecting a genuinely invalid one.
 *
 * Accepts the LLM-facing (flat) `raw.objects` form.
 *
 * @param {*} raw - The parsed JSON reply: `{summary?, objects:[...]}`.
 * @returns {{ok: boolean, objects: object[], errors: string[], hardErrors: string[], repairs: string[]}}
 *   `objects` holds the successfully-normalized subset even when `ok` is false.
 */
export function validateObjects(raw) {
  const hardErrors = [];
  const repairs = [];
  const objects = [];

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    hardErrors.push('response must be a JSON object');
    return { ok: false, objects, errors: hardErrors.slice(), hardErrors, repairs };
  }
  if (!Array.isArray(raw.objects) || raw.objects.length === 0) {
    hardErrors.push('response.objects must be a non-empty array');
    return { ok: false, objects, errors: hardErrors.slice(), hardErrors, repairs };
  }

  raw.objects.forEach((entry, i) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      hardErrors.push(`objects[${i}] must be an object`);
      return;
    }

    const kind = entry.kind;
    if (kind === 'custom') {
      hardErrors.push(
        `objects[${i}]: kind 'custom' is not supported — only primitive shapes`,
      );
    } else if (typeof kind !== 'string' || !AI_SHAPE_KINDS.includes(kind)) {
      // Name the offending kind AND list the allowed ones so the user (and the
      // model, next turn) can fix it without guessing.
      hardErrors.push(
        `objects[${i}]: unknown kind '${String(kind)}' — allowed kinds: ${AI_SHAPE_KINDS.join(', ')}`,
      );
    }

    if (Object.prototype.hasOwnProperty.call(entry, 'geo')) {
      hardErrors.push(
        `objects[${i}]: property 'geo' is not supported — only primitive shapes`,
      );
    }

    const kindOk = typeof kind === 'string' && AI_SHAPE_KINDS.includes(kind);
    const hasGeo = Object.prototype.hasOwnProperty.call(entry, 'geo');
    if (kindOk && !hasGeo) {
      const { object, issues } = normalizeObjectDetailed(entry, i);
      for (const issue of issues) repairs.push(`objects[${i}]: ${issue}`);
      objects.push(object);
    }
  });

  const errors = hardErrors.concat(repairs);
  return { ok: errors.length === 0, objects, errors, hardErrors, repairs };
}

/**
 * Project normalized internal objects into the compact payload `insert.js`
 * consumes. Defensive copies of `p`/`r`/`s` are returned so a caller cannot
 * mutate the validated input by mutating the payload.
 *
 * @param {object[]} objects - Normalized objects (e.g. from `validateObjects`).
 * @returns {Array<{kind: string, name: string, color: number, transform: {p: number[], r: number[], s: number[]}}>} Fresh payload array (empty for non-arrays).
 */
export function toInsertPayload(objects) {
  if (!Array.isArray(objects)) return [];
  const out = [];
  for (const o of objects) {
    if (!o || typeof o !== 'object') continue;
    const t = o.transform || {};
    out.push({
      kind: o.kind,
      name: o.name,
      color: o.color,
      transform: {
        p: Array.isArray(t.p) ? t.p.slice(0, 3).map(Number) : IDENTITY_P.slice(),
        r: Array.isArray(t.r) ? t.r.slice(0, 3).map(Number) : IDENTITY_R.slice(),
        s: Array.isArray(t.s) ? t.s.slice(0, 3).map(Number) : IDENTITY_S.slice(),
      },
    });
  }
  return out;
}
