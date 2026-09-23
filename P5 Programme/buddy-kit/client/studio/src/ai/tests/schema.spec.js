// Tests for src/ai/schema.js.
//
// This file is DISCOVERED, not imported by hand: run-tests.mjs scans
// `src/ai/tests/*.spec.js` before its final summary and calls the default export
// with its own `check(name, cond)` helper. That keeps every plan task able to add
// tests without editing run-tests.mjs concurrently.
import {
  AI_SHAPE_KINDS,
  AI_RESPONSE_SCHEMA_HINT,
  normalizeObject,
  validateObjects,
  toInsertPayload,
} from '../schema.js';

export default function schemaTests(check) {
  // --- Public surface -----------------------------------------------------
  check(
    'schema: exports kinds, hint, and the three public functions',
    Array.isArray(AI_SHAPE_KINDS) &&
      typeof AI_RESPONSE_SCHEMA_HINT === 'string' &&
      typeof normalizeObject === 'function' &&
      typeof validateObjects === 'function' &&
      typeof toInsertPayload === 'function',
  );

  check(
    'schema: kind whitelist matches the primitive set exactly',
    JSON.stringify(AI_SHAPE_KINDS) ===
      JSON.stringify(['box', 'sphere', 'cylinder', 'cone', 'torus', 'octahedron', 'plane']),
  );

  check(
    'schema: response hint documents the flat LLM-facing contract',
    AI_RESPONSE_SCHEMA_HINT.includes('"summary"') &&
      AI_RESPONSE_SCHEMA_HINT.includes('"objects"') &&
      AI_RESPONSE_SCHEMA_HINT.includes('"color":"#ff6b6b"') &&
      AI_RESPONSE_SCHEMA_HINT.includes('"p":[0,1.2,0]'),
  );

  // --- Valid normalization ------------------------------------------------
  const valid = validateObjects({
    summary: 'x',
    objects: [
      { kind: 'box', name: 'h', color: '#ff6b6b', p: [0, 1.2, 0], r: [0, 0, 0], s: [1, 1, 1] },
    ],
  });
  check(
    'schema: valid primitive normalizes #rrggbb to its decimal int',
    valid.ok === true &&
      valid.objects.length === 1 &&
      valid.errors.length === 0 &&
      valid.objects[0].color === 16739179 && // 0xff6b6b (plan text says 16739435, which is 0xff6c6b — arithmetic slip)
      valid.objects[0].kind === 'box' &&
      valid.objects[0].name === 'h' &&
      JSON.stringify(valid.objects[0].transform.p) === JSON.stringify([0, 1.2, 0]) &&
      JSON.stringify(valid.objects[0].transform.r) === JSON.stringify([0, 0, 0]) &&
      JSON.stringify(valid.objects[0].transform.s) === JSON.stringify([1, 1, 1]),
  );

  check(
    'schema: every whitelisted kind validates and normalizes',
    AI_SHAPE_KINDS.every((kind) => {
      const r = validateObjects({ objects: [{ kind }] });
      return r.ok === true && r.objects.length === 1 && r.objects[0].kind === kind;
    }),
  );

  check(
    'schema: normalizeObject is a strict internal subset with identity defaults',
    (() => {
      const n = normalizeObject({ kind: 'sphere' }, 2);
      return (
        Object.keys(n).sort().join(',') === 'color,id,imported,kind,name,transform' &&
        n.id === null &&
        n.name === 'ai-sphere-3' &&
        n.imported === false &&
        n.color === 0xffffff &&
        JSON.stringify(n.transform) ===
          JSON.stringify({ p: [0, 0, 0], r: [0, 0, 0], s: [1, 1, 1] }) &&
        !('geo' in n) &&
        !('bound' in n) &&
        !('bakedRot' in n) &&
        !('bakedScale' in n) &&
        !('torus' in n)
      );
    })(),
  );

  // --- Rejections ---------------------------------------------------------
  const custom = validateObjects({
    objects: [{ kind: 'custom', geo: { positions: [0, 0, 0] } }],
  });
  check(
    'schema: custom + geo rejected with both errors and no objects',
    custom.ok === false &&
      custom.objects.length === 0 &&
      custom.errors.length === 2 &&
      custom.errors.some((e) => e.includes("kind 'custom' is not supported")) &&
      custom.errors.some((e) => e.includes('geo')),
  );

  const geoOnly = validateObjects({
    objects: [{ kind: 'box', geo: { positions: [0, 0, 0] } }],
  });
  check(
    'schema: a valid kind carrying geo is still rejected',
    geoOnly.ok === false &&
      geoOnly.objects.length === 0 &&
      geoOnly.errors.some((e) => e.includes("property 'geo' is not supported")),
  );

  const unknown = validateObjects({ objects: [{ kind: 'banana' }] });
  check(
    'schema: unknown kind is rejected and named in the error',
    unknown.ok === false &&
      unknown.objects.length === 0 &&
      unknown.errors.some((e) => e.includes('banana')),
  );

  const empty = validateObjects({ objects: [] });
  let threw = false;
  let nullResult = null;
  try {
    nullResult = validateObjects(null);
  } catch {
    threw = true;
  }
  check(
    'schema: empty objects array and null are rejected without throwing',
    empty.ok === false &&
      empty.objects.length === 0 &&
      typeof empty.errors[0] === 'string' &&
      threw === false &&
      nullResult.ok === false &&
      nullResult.objects.length === 0,
  );

  // --- Numeric coercion ---------------------------------------------------
  const coerced = validateObjects({
    objects: [{ kind: 'box' }, { kind: 'sphere', p: ['x', 1, 2], s: [0, 1, 1] }],
  });
  const sphere = coerced.objects[1];
  check(
    'schema: non-finite replaced by identity, non-positive scale clamped',
    coerced.ok === false &&
      coerced.objects.length === 2 &&
      JSON.stringify(sphere.transform.p) === JSON.stringify([0, 1, 2]) &&
      Number.isFinite(sphere.transform.s[0]) &&
      sphere.transform.s[0] > 0,
  );

  check(
    'schema: bare rrggbb parses and unparseable colour falls back to white',
    normalizeObject({ kind: 'box', color: 'ff6b6b' }).color === 16739179 &&
      normalizeObject({ kind: 'box', color: '#FF6B6B' }).color === 16739179 &&
      normalizeObject({ kind: 'box', color: 'nope' }).color === 0xffffff &&
      normalizeObject({ kind: 'box' }).color === 0xffffff,
  );

  // --- Insert payload -----------------------------------------------------
  const payload = toInsertPayload([
    normalizeObject({ kind: 'box', name: 'torso', color: '#ff6b6b', p: [1, 2, 3] }, 0),
  ]);
  check(
    'schema: toInsertPayload returns kind/name/color/transform for insert.js',
    payload.length === 1 &&
      JSON.stringify(payload[0]) ===
        JSON.stringify({
          kind: 'box',
          name: 'torso',
          color: 16739179,
          transform: { p: [1, 2, 3], r: [0, 0, 0], s: [1, 1, 1] },
        }) &&
      toInsertPayload(null).length === 0,
  );
}
