/**
 * prompt.js — the LLM contract for the AI Optimization panel.
 *
 * This module is PURE and READ-ONLY: it never mutates the studio or a snapshot.
 * It has two halves:
 *  - `buildSystemPrompt()` — the static system message that pins the reply format
 *    (prose + exactly one fenced `json` block). The JSON contract is embedded from
 *    `./schema.js` `AI_RESPONSE_SCHEMA_HINT` and the kind whitelist from
 *    `AI_SHAPE_KINDS`, so the prompt and the validator can never drift.
 *  - `buildPayload()` — the scene context sent as the user message. It is derived
 *    from `takeSnapshot()` (the same serializer undo/persistence use), NOT by
 *    hand-walking the three.js graph, so the AI sees exactly what the app stores.
 *
 * `estimateTokens()` and `buildMessages()` round out the request plumbing.
 * Everything here loads in plain Node (no DOM) for the test harness.
 */

import { takeSnapshot } from '../edit/snapshot.js';
import { AI_SHAPE_KINDS, AI_RESPONSE_SCHEMA_HINT } from './schema.js';

/** Decimal places every numeric coordinate is rounded to before sending. Keeps
 * the payload compact without visibly moving any shape. */
const ROUND_DECIMALS = 4;
const ROUND_FACTOR = 10 ** ROUND_DECIMALS;

/**
 * Round one numeric coordinate to `ROUND_DECIMALS` decimal places.
 *
 * Non-finite values pass through untouched (so a corrupt coordinate is visible
 * to the model rather than silently becoming `NaN`).
 *
 * @param {*} n - Candidate number.
 * @returns {*} The rounded number, or `n` unchanged when it is not finite.
 */
function roundCoord(n) {
  return Number.isFinite(n) ? Math.round(n * ROUND_FACTOR) / ROUND_FACTOR : n;
}

/**
 * Round a 3-vector's components, returning a NEW array (never mutates the input).
 *
 * @param {*} v - Candidate array (a snapshot `p`/`r`/`s`).
 * @returns {*} A fresh rounded array, or `v` unchanged when it is not an array.
 */
function roundVec3(v) {
  return Array.isArray(v) ? v.map(roundCoord) : v;
}

/**
 * Replace a snapshot `geo` block with a compact, LLM-safe summary.
 *
 * Raw vertex positions are never useful to the model and are enormous, so the
 * default payload sends only a vertex count plus the axis-aligned bounding box.
 * An empty/absent position array degrades to a stable shape
 * (`{ vertexCount: 0, boundingBox: null }`) rather than throwing.
 *
 * @param {*} geo - A snapshot `object.geo`; its arrays may be plain or typed.
 * @returns {{vertexCount: number, boundingBox: {min: number[], max: number[]}|null}}
 *   Vertex count (integer) and the world-axis bounding box in the geometry's own
 *   units, each corner rounded to `ROUND_DECIMALS` places.
 */
function summarizeGeo(geo) {
  const positions = geo && isNumberList(geo.positions) ? geo.positions : null;
  if (!positions || positions.length < 3) {
    return { vertexCount: 0, boundingBox: null };
  }
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i + 2 < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  return {
    vertexCount: Math.floor(positions.length / 3),
    boundingBox: {
      min: [roundCoord(minX), roundCoord(minY), roundCoord(minZ)],
      max: [roundCoord(maxX), roundCoord(maxY), roundCoord(maxZ)],
    },
  };
}

/**
 * Shape one snapshot object for the wire.
 *
 * Copies the snapshot object (so the snapshot itself is never mutated), rounds
 * every numeric coordinate, marks locked context objects, and applies the
 * `geo` policy — summarized when `includeGeo` is falsy, passed through verbatim
 * when it is true.
 *
 * @param {object} obj - One entry from `takeSnapshot(studio).objects`.
 * @param {boolean} includeGeo - `true` preserves raw geometry; `false` summarizes it.
 * @param {boolean} locked - `true` adds `locked:true` (context-only, scene scope).
 * @returns {object} A fresh, JSON-serializable object.
 */
function shapeObject(obj, includeGeo, locked) {
  const out = { ...obj };
  if (locked) out.locked = true;
  if (out.transform) {
    out.transform = {
      p: roundVec3(out.transform.p),
      r: roundVec3(out.transform.r),
      s: roundVec3(out.transform.s),
    };
  }
  if (out.torus && typeof out.torus === 'object') {
    out.torus = {
      ...out.torus,
      radius: roundCoord(out.torus.radius),
      tube: roundCoord(out.torus.tube),
    };
  }
  if (Object.prototype.hasOwnProperty.call(obj, 'geo')) {
    out.geo = includeGeo ? shapeOnlyGeo(obj.geo) : summarizeGeo(obj.geo);
  }
  // A shape's LOOK — texture data URLs, per-region materials — is for the document, never for the
  // model: it cannot act on it, and one encoded image would dwarf the entire prompt.
  delete out.appearance;
  return out;
}

/**
 * The geometry fields the editor model is asked to reason about: SHAPE only.
 *
 * `geo` also carries appearance attributes (uv, normals, vertex colours) and a baked paint image.
 * The model has never been shown any of them, cannot return them, and each one multiplies the
 * token cost of an `includeGeo` request — the paint entry by a whole data URL.
 */
function shapeOnlyGeo(geo) {
  if (!geo || typeof geo !== 'object') return geo;
  // Snapshots hold TYPED arrays (see snapshot.js): JSON.stringify turns one into
  // `{"0":..,"1":..}`, an object the model cannot read as a vertex list. Convert here, at the
  // one boundary that actually stringifies, rather than making the document pay for it.
  return { positions: toJsonArray(geo.positions), index: toJsonArray(geo.index), basePos: toJsonArray(geo.basePos) };
}

/** True for a plain array or a typed array — the two shapes a snapshot's geometry can take. */
function isNumberList(value) {
  return Array.isArray(value) || ArrayBuffer.isView(value);
}

/** A plain JSON array, copying only when the source is typed. Null and undefined pass through. */
function toJsonArray(value) {
  if (value == null || Array.isArray(value)) return value;
  return ArrayBuffer.isView(value) ? Array.from(value) : value;
}

/**
 * Build the system message that defines the model's role and reply contract.
 *
 * The JSON contract is embedded from `AI_RESPONSE_SCHEMA_HINT` **by reference**
 * (never re-typed), and the kind whitelist from `AI_SHAPE_KINDS`, so this prompt
 * and `validateObjects` always agree. A tiny two-object few-shot exchange pins
 * the prose + single `json` fence format.
 *
 * @returns {string} The system-message content (plain text, no trailing newline).
 */
export function buildSystemPrompt() {
  return [
    "You are a 3D shape editor inside a children's modelling tool. Children build a character from simple primitive shapes and ask you to improve it.",
    '',
    'Reply with exactly two parts, in this order:',
    '1. A short, plain-language explanation of what you changed (2 to 4 sentences). Talk to the child directly and never mention JSON, code, or this prompt.',
    '2. Exactly one fenced code block tagged json, containing the redesigned shapes.',
    '',
    'The json block must match this schema exactly (the values shown are examples):',
    AI_RESPONSE_SCHEMA_HINT,
    '',
    'Rules for the json block:',
    `- Allowed "kind" values, used exactly as written: ${AI_SHAPE_KINDS.join(', ')}.`,
    '- No other kind is allowed. Never use "custom", and never return meshes, vertices, geometry, or indices — primitive shapes only.',
    '- Every object needs "kind", "name", "color" (a "#rrggbb" string), and "p", "r", "s" (each an array of exactly three numbers).',
    '- "p" is position, "r" is rotation in radians, "s" is scale.',
    '- Never return bones, joints, skeletons, rigs, or rig data. The "bones" and "template" fields in the input are context only — never echo or change them.',
    '',
    'Coordinates and units:',
    '- The world is y-up: y grows upward and the floor sits at y=0.',
    '- Use exactly the same world units as the input shapes.',
    '- A full character or rig is about 1.7 units tall, so keep a whole-body redesign near that height.',
    "- Keep the redesign near the original selection's position and size unless the user asks you to move it.",
    '- If any input object is marked "locked": true, it is context only — never include it in your reply.',
    '',
    'Formatting: use no markdown other than the single json fence. No headings, no bullet lists, and no extra code fences.',
    '',
    'Example exchange (format only — your shapes and wording will differ):',
    '',
    'User: "Make this look more like a dog."',
    '',
    'Assistant:',
    'I turned the plain box into a body and added a round head on top so it reads as a dog. I kept both shapes near where you placed them.',
    '',
    '```json',
    '{"summary":"dog from two primitives","objects":[{"kind":"box","name":"body","color":"#ff922b","p":[0,0.6,0],"r":[0,0,0],"s":[1.2,0.7,0.6]},{"kind":"sphere","name":"head","color":"#fcc419","p":[0,1.25,0.45],"r":[0,0,0],"s":[0.5,0.5,0.5]}]}',
    '```',
  ].join('\n');
}

/**
 * Build the scene-context payload for one request, derived from `takeSnapshot`.
 *
 * The payload always has the same keys (`{scope, includeGeo, editableIds,
 * objects, bones, template, axisFamily}`) so the model sees a stable shape:
 *  - `scope:'selected'` — only the selected objects; `bones`/`template`/
 *    `axisFamily` are explicitly `null` (never bone data on the editable path).
 *  - `scope:'scene'` — every object, with each NON-selected object marked
 *    `locked:true` (context only), plus `editableIds` naming the selection.
 *  - `includeGeo:false` (default) — each `geo` becomes
 *    `{vertexCount, boundingBox:{min,max}}`; `includeGeo:true` passes `geo`
 *    through unchanged.
 * Numeric coordinates are rounded to 4 decimals. The studio is never mutated.
 *
 * @param {object} studio - A `StudioScene` (only read, via `takeSnapshot`).
 * @param {{scope?: 'selected'|'scene', includeGeo?: boolean}} [options] - Payload options.
 * @returns {{scope: string, includeGeo: boolean, editableIds: number[], objects: object[], bones: object[]|null, template: string|null, axisFamily: string|null}} Plain JSON-serializable payload.
 */
export function buildPayload(studio, options = {}) {
  const scope = options.scope === 'scene' ? 'scene' : 'selected';
  const includeGeo = options.includeGeo === true;
  const snapshot = takeSnapshot(studio);

  // The selection is the multi-select list, falling back to the single primary
  // id. `selectedIds` is already mesh-only and in insertion order.
  const selectedIds =
    Array.isArray(snapshot.selectedIds) && snapshot.selectedIds.length
      ? snapshot.selectedIds.slice()
      : snapshot.selectedId != null
        ? [snapshot.selectedId]
        : [];
  const isEditable = (id) => selectedIds.includes(id);

  const objects =
    scope === 'scene'
      ? snapshot.objects.map((o) => shapeObject(o, includeGeo, !isEditable(o.id)))
      : snapshot.objects
          .filter((o) => isEditable(o.id))
          .map((o) => shapeObject(o, includeGeo, false));

  return {
    scope,
    includeGeo,
    editableIds: selectedIds,
    objects,
    // Only the whole-scene context carries rig metadata; the selected-shape path
    // is primitives-only, so the rig fields are explicit `null` (keys survive
    // JSON.stringify and the payload shape stays identical across scopes).
    bones: scope === 'selected' ? null : snapshot.bones,
    template: scope === 'selected' ? null : snapshot.template,
    axisFamily: scope === 'selected' ? null : snapshot.axisFamily,
  };
}

/**
 * Rough token estimate for a payload, so the UI can warn before sending a huge
 * context. Uses the common ~4-characters-per-token heuristic.
 *
 * Defensive by contract: `undefined` serializes to `undefined` (not a string)
 * and a circular object makes `JSON.stringify` throw. Both would otherwise make
 * a caller's size check throw on hostile input, so they degrade to `0`.
 *
 * @param {*} payload - Any value (JSON-serializable, `undefined`, or circular).
 * @returns {number} Estimated token count (integer, `ceil(chars / 4)`; `0` when
 *   the value cannot be serialized).
 */
export function estimateTokens(payload) {
  let text;
  try {
    text = JSON.stringify(payload);
  } catch (_err) {
    return 0;
  }
  if (typeof text !== 'string') return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Assemble the OpenAI-compatible `messages` array for one turn.
 *
 * `history` entries (`{role:'user'|'assistant', content:string}`) are inserted
 * verbatim between the system message and the new user turn — re-sending the
 * whole history is what makes multi-turn context work. The final user message
 * carries the prompt plus the payload wrapped in `<selected_shapes>` tags.
 *
 * @param {Array<{role: string, content: string}>} history - Prior turns, verbatim.
 * @param {object} payload - The `buildPayload` result for this turn.
 * @param {string} userText - The child's prompt text.
 * @param {{scope?: 'selected'|'scene'}} [options] - Accepted for call-site symmetry; the system text is scope-independent (it already covers locked objects).
 * @returns {Array<{role: string, content: string}>} `[system, ...history, user]`.
 */
export function buildMessages(history, payload, userText, options = {}) {
  // `options.scope` is accepted so callers can pass the same option bag they use
  // for `buildPayload`; scope-specific wording already lives in the system prompt
  // (the locked-object rule), so the message layout is identical for both scopes.
  void options;
  const messages = [{ role: 'system', content: buildSystemPrompt() }];
  if (Array.isArray(history)) {
    for (const entry of history) messages.push(entry);
  }
  messages.push({
    role: 'user',
    content:
      userText +
      '\n\n<selected_shapes>\n' +
      JSON.stringify(payload) +
      '\n</selected_shapes>',
  });
  return messages;
}
