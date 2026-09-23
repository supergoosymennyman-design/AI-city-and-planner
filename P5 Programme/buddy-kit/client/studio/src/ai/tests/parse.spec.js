// Tests for src/ai/parse.js.
//
// This file is DISCOVERED, not imported by hand: run-tests.mjs scans
// `src/ai/tests/*.spec.js` before its final summary and calls the default export
// with its own `check(name, cond)` helper. That keeps every plan task able to add
// tests without editing run-tests.mjs concurrently.
//
// Every check name starts with `parse:` so the plan's evidence command
// (`grep -c "PASS parse"`) counts them. Assertions compare REAL return values
// (exact `source`, exact `prose`, actual json/code), never truthiness.
import { extractFencedBlocks, parseAIResponse, explainParseFailure } from '../parse.js';

export default function parseTests(check) {
  // --- Happy path -----------------------------------------------------------
  const happy = [
    'I widened the shoulders.',
    '',
    '```json',
    '{"summary":"human","objects":[{"kind":"box","name":"torso","p":[0,1,0]}]}',
    '```',
    'Done!',
  ].join('\n');
  const h = parseAIResponse(happy);
  check(
    'parse: prose + one json fence picks fence-json and strips the fence from prose',
    h.source === 'fence-json' &&
      h.prose === 'I widened the shoulders.\n\nDone!' &&
      h.json !== null &&
      h.json.summary === 'human' &&
      h.json.objects.length === 1 &&
      h.json.objects[0].kind === 'box' &&
      h.code.includes('"objects"') &&
      h.errors.length === 0 &&
      !h.prose.includes('```'),
  );

  // --- Example block before the real answer ---------------------------------
  const example = [
    'First, an example (do not use):',
    '```json',
    '{"summary":"example","objects":[{"kind":"banana"}]}',
    '```',
    'Here is your model:',
    '```json',
    '{"summary":"real","objects":[{"kind":"box","name":"torso"}]}',
    '```',
  ].join('\n');
  const e = parseAIResponse(example);
  check(
    'parse: invalid example block is skipped for the next json block that validates',
    e.source === 'fence-json' &&
      e.json !== null &&
      e.json.summary === 'real' &&
      e.json.objects.length === 1 &&
      e.json.objects[0].kind === 'box' &&
      e.errors.length === 1 &&
      e.errors[0].includes('banana'),
  );

  // --- Tag preference: json-tagged beats an earlier tagless block -----------
  const mixed = [
    '```js',
    '{"objects":[{"kind":"cone"}]}',
    '```',
    '```json',
    '{"objects":[{"kind":"sphere"}]}',
    '```',
  ].join('\n');
  const mx = parseAIResponse(mixed);
  check(
    'parse: an explicitly json-tagged block beats an earlier tagless valid block',
    mx.source === 'fence-json' &&
      mx.json !== null &&
      mx.json.objects[0].kind === 'sphere' &&
      mx.code.includes('sphere'),
  );

  // --- Non-json fence with valid JSON → fence-any ---------------------------
  const jsFence = 'Sure:\n```js\n{"objects":[{"kind":"sphere"}]}\n```';
  const j = parseAIResponse(jsFence);
  check(
    'parse: a non-json fence holding valid JSON classifies as fence-any',
    j.source === 'fence-any' &&
      j.json !== null &&
      j.json.objects[0].kind === 'sphere' &&
      j.prose === 'Sure:' &&
      j.code.includes('sphere'),
  );

  // --- No fence, whole reply is JSON → raw-json -----------------------------
  const bare = '{"summary":"raw","objects":[{"kind":"cone"}]}';
  const b = parseAIResponse(bare);
  check(
    'parse: a fenceless whole-reply JSON body classifies as raw-json',
    b.source === 'raw-json' &&
      b.json !== null &&
      b.json.summary === 'raw' &&
      b.json.objects[0].kind === 'cone' &&
      b.prose === bare &&
      b.errors.length === 0,
  );

  // --- Prose only → null json / null source ---------------------------------
  const sorry = 'Sorry, I cannot help with that.';
  const s = parseAIResponse(sorry);
  check(
    'parse: a prose-only reply yields null json and null source without throwing',
    s.json === null &&
      s.source === null &&
      s.prose === sorry &&
      s.errors.length === 1 &&
      s.errors[0].includes('no JSON code block') &&
      explainParseFailure(s).includes('no JSON code block'),
  );

  // --- Invalid-JSON fence → null json, no throw -----------------------------
  const bad = 'Here:\n```json\n{oops\n```';
  let badThrew = false;
  let badResult = null;
  try {
    badResult = parseAIResponse(bad);
  } catch {
    badThrew = true;
  }
  check(
    'parse: an invalid-JSON fence returns json:null without throwing',
    badThrew === false &&
      badResult !== null &&
      badResult.json === null &&
      badResult.source === null &&
      badResult.errors.some((x) => x.includes('not valid JSON')) &&
      explainParseFailure(badResult).includes('not valid JSON'),
  );

  // --- Unterminated final fence ---------------------------------------------
  const unterminated = 'Here is the start:\n```json\n{"objects":[{"kind":"box"';
  const u = parseAIResponse(unterminated);
  const uBlocks = extractFencedBlocks(unterminated);
  check(
    'parse: an unterminated fence is captured but invalid JSON yields json:null safely',
    uBlocks.length === 1 &&
      uBlocks[0].lang === 'json' &&
      uBlocks[0].body === '{"objects":[{"kind":"box"' &&
      u.json === null &&
      u.source === null &&
      u.prose === 'Here is the start:' &&
      explainParseFailure(u).includes('not valid JSON'),
  );

  // --- CRLF + bare fence + text before/after --------------------------------
  const crlf =
    'Intro\r\n```\r\n{"a":1}\r\n```\r\nOutro\r\n```json\r\n' +
    '{"objects":[{"kind":"torus"}]}\r\n```\r\n';
  const crlfBlocks = extractFencedBlocks(crlf);
  const crlfParsed = parseAIResponse(crlf);
  check(
    'parse: CRLF, a bare fence, and surrounding prose all extract correctly',
    crlfBlocks.length === 2 &&
      crlfBlocks[0].lang === '' &&
      crlfBlocks[0].body === '{"a":1}\r\n' &&
      crlfBlocks[1].lang === 'json' &&
      crlfParsed.source === 'fence-json' &&
      crlfParsed.json !== null &&
      crlfParsed.json.objects[0].kind === 'torus' &&
      crlfParsed.prose === 'Intro\r\nOutro',
  );

  // --- Extractor robustness -------------------------------------------------
  const weird = extractFencedBlocks('```my-lang-1\nbody\n```');
  check(
    'parse: extractFencedBlocks tolerates non-strings and keeps hyphenated lang tags',
    extractFencedBlocks(null).length === 0 &&
      extractFencedBlocks('').length === 0 &&
      weird.length === 1 &&
      weird[0].lang === 'my-lang-1' &&
      weird[0].body === 'body\n',
  );

  // --- Validator-shaped failure surfaces through explainParseFailure --------
  const badShapes = 'Oops:\n```json\n{"objects":[{"kind":"custom"}]}\n```';
  const bs = parseAIResponse(badShapes);
  check(
    'parse: a JSON-parsed but shape-invalid block reports validator errors',
    bs.json === null &&
      bs.source === null &&
      bs.errors.some((x) => x.includes('shapes were invalid') && x.includes('custom')) &&
      explainParseFailure(bs).includes('shapes were invalid') &&
      explainParseFailure(h) === '',
  );
}
