/**
 * integration.spec.js — CROSS-MODULE seams of the AI Optimization panel.
 *
 * Each `src/ai/*.js` module already has its own unit suite (tasks 1-6/14). This
 * file deliberately tests the WIRING between them — the invariants that hold only
 * when two or more modules are composed:
 *
 *  1. reply text → parseAIResponse → validateObjects → addObjects (a real scene)
 *  2. buildSystemPrompt embeds AI_RESPONSE_SCHEMA_HINT verbatim (prompt ↔ validator)
 *  3. buildPayload(scope:'scene') agrees with takeSnapshot (ids + transform.p)
 *  4. the includeGeo policy (summary vs raw geometry)
 *  5. replaceSelection + ONE undo restores the originals
 *  6. a rejected reply (unknown kind) never reaches the scene
 *  7. saveAIConfig is idempotent for a repeated partial
 *
 * HERMETIC: no network, no file writes, no browser modules. It imports only
 * Node-safe modules (`scene.js`, `edit/snapshot.js`, `ai/*`), and the one
 * `globalThis.localStorage` stub it installs is removed in a `finally`.
 *
 * Runner contract (see run-tests.mjs): run-tests.mjs calls `mod.default(check)`
 * SYNCHRONOUSLY, so this module computes every `[name, cond]` pair at module
 * top-level (inside per-invariant try/catch so one broken fixture cannot abort
 * the rest) and the default export merely replays them synchronously.
 */

import { StudioScene } from '../../scene.js';
import { takeSnapshot } from '../../edit/snapshot.js';
import { AI_RESPONSE_SCHEMA_HINT, validateObjects } from '../schema.js';
import { parseAIResponse } from '../parse.js';
import { buildSystemPrompt, buildPayload } from '../prompt.js';
import { addObjects, replaceSelection } from '../insert.js';
import {
  AI_DEFAULTS,
  loadAIConfig,
  saveAIConfig,
  resetAIConfig,
} from '../config.js';

/** The documented 4-decimal payload rounding (mirrors prompt.js ROUND_DECIMALS). */
const round4 = (n) => Math.round(n * 1e4) / 1e4;

/** Collected `[name, cond]` results, replayed by the default export. */
const results = [];
const record = (name, cond) => results.push([name, !!cond]);

// ---------------------------------------------------------------------------
// 1. Full round-trip: reply text → parse → validate → insert into a real scene.
// ---------------------------------------------------------------------------
function runRoundTrip() {
  const reply = [
    'I made the robot taller and gave it a round head.',
    '',
    '```json',
    '{"summary":"robot","objects":[{"kind":"box","name":"torso","color":"#ff6b6b","p":[0,1,0],"r":[0,0,0],"s":[1,1.5,0.6]},{"kind":"sphere","name":"head","color":"#4dabf7","p":[0,2.2,0],"r":[0,0,0],"s":[0.5,0.5,0.5]}]}',
    '```',
    'Let me know what you think!',
  ].join('\n');

  const parsed = parseAIResponse(reply);
  record(
    'integration: round-trip reply parses from the json fence with the exact prose',
    parsed.source === 'fence-json' &&
      parsed.truncated === false &&
      parsed.json !== null &&
      parsed.prose ===
        'I made the robot taller and gave it a round head.\n\nLet me know what you think!' &&
      parsed.json.summary === 'robot' &&
      Array.isArray(parsed.json.objects) &&
      parsed.json.objects.length === 2,
  );

  const validated = validateObjects(parsed.json);
  record(
    'integration: round-trip validated set is exactly the two normalized objects',
    validated.ok === true &&
      validated.errors.length === 0 &&
      validated.objects.length === 2 &&
      validated.objects[0].name === 'torso' &&
      validated.objects[0].kind === 'box' &&
      validated.objects[0].color === 0xff6b6b &&
      validated.objects[0].transform.p.join(',') === '0,1,0' &&
      validated.objects[0].transform.s.join(',') === '1,1.5,0.6' &&
      validated.objects[1].name === 'head' &&
      validated.objects[1].kind === 'sphere' &&
      validated.objects[1].color === 0x4dabf7 &&
      validated.objects[1].transform.p.join(',') === '0,2.2,0' &&
      validated.objects[1].transform.s.join(',') === '0.5,0.5,0.5',
  );

  const s = new StudioScene();
  s.addPrimitive('box', 0xff0000, { silent: true }); // one pre-existing shape
  const before = s.shapes.length;
  const added = addObjects(s, validated.objects);
  const after = s.shapes.length;
  record(
    'integration: round-trip addObjects grows the scene by exactly the valid object count',
    before === 1 &&
      after === before + validated.objects.length &&
      after === 3 &&
      added.meshes.length === 2 &&
      added.skipped.length === 0,
  );

  const [torso, head] = added.meshes;
  record(
    'integration: round-trip inserted meshes match names/kinds/transforms/colors exactly',
    torso.name === 'torso' &&
      torso.userData.kind === 'box' &&
      torso.position.toArray().join(',') === '0,1,0' &&
      [torso.rotation.x, torso.rotation.y, torso.rotation.z].join(',') === '0,0,0' &&
      torso.scale.toArray().join(',') === '1,1.5,0.6' &&
      torso.material.color.getHex() === 0xff6b6b &&
      head.name === 'head' &&
      head.userData.kind === 'sphere' &&
      head.position.toArray().join(',') === '0,2.2,0' &&
      head.scale.toArray().join(',') === '0.5,0.5,0.5' &&
      head.material.color.getHex() === 0x4dabf7,
  );
}

// ---------------------------------------------------------------------------
// 2. Few-shot example invariance: the prompt embeds the schema hint verbatim.
// ---------------------------------------------------------------------------
function runPromptInvariance() {
  const promptText = buildSystemPrompt();
  record(
    'integration: system prompt embeds AI_RESPONSE_SCHEMA_HINT verbatim exactly once',
    promptText.includes(AI_RESPONSE_SCHEMA_HINT) &&
      promptText.split(AI_RESPONSE_SCHEMA_HINT).length === 2,
  );

  // The prompt's OWN example must validate unchanged, or prompt and validator
  // have drifted even though the substring check above still passes.
  const hintValidated = validateObjects(JSON.parse(AI_RESPONSE_SCHEMA_HINT));
  record(
    'integration: the prompt schema example validates unchanged (prompt/validator cannot drift)',
    hintValidated.ok === true &&
      hintValidated.errors.length === 0 &&
      hintValidated.objects.length === 1 &&
      hintValidated.objects[0].kind === 'box' &&
      hintValidated.objects[0].name === 'human-head' &&
      hintValidated.objects[0].color === 0xff6b6b &&
      hintValidated.objects[0].transform.p.join(',') === '0,1.2,0',
  );
}

// ---------------------------------------------------------------------------
// 3. Payload ↔ snapshot agreement (ids + transform.p under 4-decimal rounding).
// ---------------------------------------------------------------------------
function runPayloadSnapshotAgreement() {
  const s = new StudioScene();
  const a = s.addPrimitive('box', 0xff0000, { silent: true });
  a.name = 'a';
  a.position.set(1.234567, 2.345678, 3.456789);
  const b = s.addPrimitive('sphere', 0x00ff00, { silent: true });
  b.name = 'b';
  b.position.set(-1.111111, 0.000049, 5.555555);
  const c = s.addPrimitive('cylinder', 0x0000ff, { silent: true });
  c.name = 'c';
  c.position.set(0.00004, -0.00004, 2);
  s.setSelection([b], b);

  const snap = takeSnapshot(s);
  const payload = buildPayload(s, { scope: 'scene', includeGeo: true });

  record(
    'integration: payload scope:scene lists the same ids in the same order as the snapshot',
    payload.scope === 'scene' &&
      payload.includeGeo === true &&
      payload.objects.length === snap.objects.length &&
      payload.objects.length === 3 &&
      payload.objects.map((o) => o.id).join(',') === snap.objects.map((o) => o.id).join(','),
  );

  const pAgrees = payload.objects.every((o, i) => {
    const expected = snap.objects[i].transform.p.map(round4);
    return (
      Array.isArray(o.transform.p) &&
      o.transform.p.length === 3 &&
      o.transform.p.every((v, j) => v === expected[j])
    );
  });
  record(
    'integration: payload transform.p reproduces every snapshot position at exactly 4 decimals',
    pAgrees &&
      payload.objects[0].transform.p.join(',') === '1.2346,2.3457,3.4568' &&
      payload.objects[1].transform.p.join(',') === '-1.1111,0,5.5556' &&
      payload.objects[2].transform.p.join(',') === '0,0,2',
  );

  const editable = payload.objects.find((o) => o.id === b.userData.id);
  record(
    'integration: payload scope:scene locks only the unselected objects and names the editable id',
    !!editable &&
      !('locked' in editable) &&
      payload.editableIds.join(',') === String(b.userData.id) &&
      payload.objects.filter((o) => o.id !== b.userData.id).every((o) => o.locked === true),
  );
}

// ---------------------------------------------------------------------------
// 4. Geo policy: includeGeo:false summarizes; includeGeo:true passes raw.
// ---------------------------------------------------------------------------
function runGeoPolicy() {
  const s = new StudioScene();
  const sculpted = s.addPrimitive('box', 0x112233, { silent: true });
  sculpted.userData.sculpted = true; // makes takeSnapshot emit kind:'custom' + raw geo
  const plain = s.addPrimitive('sphere', 0x445566, { silent: true });
  s.setSelection([sculpted], sculpted);

  const snap = takeSnapshot(s);
  const customSnap = snap.objects.find((o) => o.id === sculpted.userData.id);
  record(
    'integration: geo fixture is a sculpted custom shape carrying raw positions + index',
    snap.objects.length === 2 &&
      customSnap.kind === 'custom' &&
      customSnap.geo.positions.length === 72 &&
      customSnap.geo.index.length === 36,
  );

  const summary = buildPayload(s, { scope: 'scene', includeGeo: false });
  const raw = buildPayload(s, { scope: 'scene', includeGeo: true });

  const summaryCustom = summary.objects.find((o) => o.id === sculpted.userData.id);
  const summaryPlain = summary.objects.find((o) => o.id === plain.userData.id);
  record(
    'integration: includeGeo:false never exposes geo.positions and omits geo on primitives',
    summary.includeGeo === false &&
      summary.objects.every((o) => !o.geo || !Array.isArray(o.geo.positions)) &&
      !('geo' in summaryPlain) &&
      summaryCustom.geo.vertexCount === 24 &&
      summaryCustom.geo.boundingBox !== null &&
      summaryCustom.geo.boundingBox.min.join(',') === '-0.5,-0.5,-0.5' &&
      summaryCustom.geo.boundingBox.max.join(',') === '0.5,0.5,0.5',
  );

  const rawCustom = raw.objects.find((o) => o.id === sculpted.userData.id);
  const rawPlain = raw.objects.find((o) => o.id === plain.userData.id);
  record(
    'integration: includeGeo:true passes raw geometry through and still omits geo on primitives',
    raw.includeGeo === true &&
      Array.isArray(rawCustom.geo.positions) &&
      rawCustom.geo.positions.length === customSnap.geo.positions.length &&
      rawCustom.geo.positions.every((v, i) => v === customSnap.geo.positions[i]) &&
      Array.isArray(rawCustom.geo.index) &&
      rawCustom.geo.index.length === 36 &&
      !('geo' in rawPlain),
  );
}

// ---------------------------------------------------------------------------
// 5. Replace restores with exactly ONE undo.
// ---------------------------------------------------------------------------
function runReplaceUndo() {
  const s = new StudioScene();
  const mk = (name, x) => {
    const m = s.addPrimitive('box', 0x223344, { silent: true });
    m.name = name;
    m.position.set(x, 0.5, 0);
    return m;
  };
  mk('alpha', -1);
  mk('beta', 0);
  mk('gamma', 1);
  const alpha = s.shapes.find((m) => m.name === 'alpha');
  const beta = s.shapes.find((m) => m.name === 'beta');
  s.setSelection([alpha, beta], alpha);
  const beforeCount = s.shapes.length;
  const beforeNames = s.shapes.map((m) => m.name).sort().join(',');

  const replacement = validateObjects({
    objects: [{ kind: 'sphere', name: 'new-head', color: '#4dabf7', p: [1.7, 1.6, 0], r: [0, 0, 0], s: [0.5, 0.5, 0.5] }],
  });
  const res = replaceSelection(s, replacement.objects);
  record(
    'integration: replaceSelection swaps the two selected shapes for the replacement',
    beforeCount === 3 &&
      beforeNames === 'alpha,beta,gamma' &&
      res.meshes.length === 1 &&
      res.skipped.length === 0 &&
      s.shapes.length === 2 &&
      s.shapes.map((m) => m.name).sort().join(',') === 'gamma,new-head' &&
      s.undoStack.length === 1,
  );

  const undone = s.undo();
  record(
    'integration: one undo restores the replaced originals (count, names, selection)',
    undone === true &&
      s.shapes.length === 3 &&
      s.shapes.map((m) => m.name).sort().join(',') === 'alpha,beta,gamma' &&
      s.undoStack.length === 0 &&
      s.selection.size === 2 &&
      s.selection.has(s.shapes.find((m) => m.name === 'alpha')) &&
      s.selection.has(s.shapes.find((m) => m.name === 'beta')),
  );
}

// ---------------------------------------------------------------------------
// 6. Rejection path: an unknown kind never reaches the scene.
// ---------------------------------------------------------------------------
function runRejectionPath() {
  const reply = [
    'Here is a fruity shape.',
    '',
    '```json',
    '{"summary":"fruit","objects":[{"kind":"banana","name":"b","color":"#ff0000","p":[0,0,0],"r":[0,0,0],"s":[1,1,1]}]}',
    '```',
  ].join('\n');

  const parsed = parseAIResponse(reply);
  record(
    'integration: an unknown kind yields json === null with the exact validator error',
    parsed.json === null &&
      parsed.source === null &&
      parsed.truncated === false &&
      // One error for the failing json fence, then one for the raw-reply fallback.
      parsed.errors.length === 2 &&
      parsed.errors[0] ===
        "The JSON parsed but the shapes were invalid: objects[0]: unknown kind 'banana' — allowed kinds: box, sphere, cylinder, cone, torus, octahedron, plane" &&
      parsed.errors[1] === 'The whole reply was not valid JSON either.',
  );

  const s = new StudioScene();
  s.addPrimitive('box', 0xff0000, { silent: true });
  const before = s.shapes.length;
  let addCalls = 0;
  const originalAdd = s.addPrimitive.bind(s);
  s.addPrimitive = (...args) => {
    addCalls++;
    return originalAdd(...args);
  };

  // Mirrors the panel's guarded apply step: nothing is applied unless the parser
  // produced a non-null JSON payload.
  if (parsed.json) {
    addObjects(s, validateObjects(parsed.json).objects);
  }
  record(
    'integration: a rejected reply never calls addObjects and leaves the scene unchanged',
    addCalls === 0 && s.shapes.length === before && before === 1,
  );
}

// ---------------------------------------------------------------------------
// 7. Config idempotence: a repeated partial save is a no-op.
// ---------------------------------------------------------------------------
function runConfigIdempotence() {
  const hadOwn = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage');
  const previous = globalThis.localStorage;
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => {
      store.set(k, String(v));
    },
    removeItem: (k) => {
      store.delete(k);
    },
  };
  try {
    resetAIConfig();
    const first = saveAIConfig({ key: 'sk-idem', model: 'model-1' });
    const rawAfterFirst = store.get('studio.ai.config');
    const second = saveAIConfig({ key: 'sk-idem', model: 'model-1' });
    const rawAfterSecond = store.get('studio.ai.config');
    const loaded = loadAIConfig();

    record(
      'integration: saveAIConfig twice with the same partial is byte-identical (idempotent)',
      rawAfterFirst === rawAfterSecond &&
        JSON.stringify(second) === JSON.stringify(first) &&
        JSON.stringify(loaded) === JSON.stringify(second),
    );

    record(
      'integration: saveAIConfig preserves untouched defaults and the exact saved fields',
      second.key === 'sk-idem' &&
        second.model === 'model-1' &&
        second.baseUrl === AI_DEFAULTS.baseUrl &&
        second.scope === AI_DEFAULTS.scope &&
        second.includeGeo === AI_DEFAULTS.includeGeo &&
        second.temperature === AI_DEFAULTS.temperature,
    );
  } finally {
    resetAIConfig(); // clear the mirror while the stub is still installed
    if (hadOwn) globalThis.localStorage = previous;
    else delete globalThis.localStorage;
  }
}

// Run every invariant; a throwing fixture FAILS only its own invariant.
for (const run of [
  runRoundTrip,
  runPromptInvariance,
  runPayloadSnapshotAgreement,
  runGeoPolicy,
  runReplaceUndo,
  runRejectionPath,
  runConfigIdempotence,
]) {
  try {
    run();
  } catch (err) {
    console.error('integration.spec.js invariant threw:', err && err.message);
    record('integration: invariant threw before completing its checks', false);
  }
}

/**
 * Replay the recorded results through the runner's synchronous `check`.
 *
 * @param {(name: string, cond: boolean) => void} check the runner's PASS/FAIL counter
 */
export default function integrationTests(check) {
  for (const [name, cond] of results) check(name, cond);
}
