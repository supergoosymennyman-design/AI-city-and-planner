/**
 * prompt.spec.js — pure-node coverage for the AI prompt contract (`src/ai/prompt.js`).
 *
 * Discovered and called by `run-tests.mjs`'s `src/ai/tests/*.spec.js` block:
 * `export default function promptTests(check)` where `check(name, cond)` counts
 * PASS/FAIL. The payload tests build a REAL headless `StudioScene` (exactly like
 * the rest of the suite) so the payload is exercised against the true
 * `takeSnapshot` output rather than a hand-rolled stub.
 *
 * Every check name starts with `prompt:` or `payload:` so the new checks are easy
 * to grep from the single `npm test` run.
 */

import { StudioScene } from '../../scene.js';
import { takeSnapshot } from '../../edit/snapshot.js';
import { AI_SHAPE_KINDS, AI_RESPONSE_SCHEMA_HINT } from '../schema.js';
import {
  buildSystemPrompt,
  buildPayload,
  estimateTokens,
  buildMessages,
} from '../prompt.js';

/** Local mirror of the payload rounding rule, for expected-value assertions. */
const r4 = (n) => Math.round(n * 1e4) / 1e4;

export default function promptTests(check) {
  // ---------------------------------------------------------------------------
  // System prompt contract
  // ---------------------------------------------------------------------------
  const prompt = buildSystemPrompt();

  check(
    'prompt: system prompt embeds AI_RESPONSE_SCHEMA_HINT verbatim',
    typeof prompt === 'string' && prompt.includes(AI_RESPONSE_SCHEMA_HINT),
  );

  check(
    'prompt: system prompt names every allowed kind',
    AI_SHAPE_KINDS.every((kind) => prompt.includes(kind)),
  );

  check(
    'prompt: system prompt forbids custom, meshes, and vertices',
    prompt.includes('custom') &&
      prompt.includes('meshes') &&
      prompt.includes('vertices') &&
      /primitive shapes only/i.test(prompt),
  );

  check(
    'prompt: system prompt requires exactly one json fence and 2-4 sentences',
    prompt.includes('```json') &&
      /exactly one fenced code block tagged json/i.test(prompt) &&
      /2 to 4 sentences/i.test(prompt),
  );

  check(
    'prompt: system prompt states y-up, floor y=0, shared units, and the 1.7-unit rig',
    prompt.includes('y-up') &&
      prompt.includes('y=0') &&
      prompt.includes('1.7') &&
      /same world units/i.test(prompt) &&
      /original selection's position/i.test(prompt),
  );

  check(
    'prompt: system prompt forbids bones/rig data and extra markdown',
    prompt.includes('bones') &&
      /rigs/i.test(prompt) &&
      /no markdown other than the single json fence/i.test(prompt),
  );

  // ---------------------------------------------------------------------------
  // Payload — selected scope
  // ---------------------------------------------------------------------------
  {
    const s = new StudioScene();
    const a = s.addPrimitive('box', 0xff0000, { silent: true });
    const b = s.addPrimitive('sphere', 0x00ff00, { silent: true });
    s.select(a);
    const p = buildPayload(s, { scope: 'selected', includeGeo: false });

    check(
      'payload: selected scope sends only the selected object',
      p.objects.length === 1 && p.objects[0].id === a.userData.id && b.userData.id !== p.objects[0].id,
    );

    check(
      'payload: selected scope sets bones and template keys to null',
      Object.prototype.hasOwnProperty.call(p, 'bones') &&
        Object.prototype.hasOwnProperty.call(p, 'template') &&
        p.bones === null &&
        p.template === null &&
        p.axisFamily === null &&
        JSON.parse(JSON.stringify(p)).bones === null,
    );

    check(
      'payload: selected scope reports the selection in editableIds',
      JSON.stringify(p.editableIds) === JSON.stringify([a.userData.id]) &&
        p.scope === 'selected' &&
        p.includeGeo === false,
    );

    check(
      'payload: selected scope omits geo for a plain primitive',
      !Object.prototype.hasOwnProperty.call(p.objects[0], 'geo'),
    );
  }

  // ---------------------------------------------------------------------------
  // Payload — scene scope (locked context + editableIds)
  // ---------------------------------------------------------------------------
  {
    const s = new StudioScene();
    const a = s.addPrimitive('box', 0xff0000, { silent: true });
    const b = s.addPrimitive('sphere', 0x00ff00, { silent: true });
    s.select(a);
    const snap = takeSnapshot(s);
    const p = buildPayload(s, { scope: 'scene', includeGeo: false });

    const byId = (id) => p.objects.find((o) => o.id === id);
    check(
      'payload: scene scope sends every object and locks only the unselected',
      p.objects.length === snap.objects.length &&
        p.objects.length === 2 &&
        byId(a.userData.id).locked !== true &&
        byId(b.userData.id).locked === true &&
        p.objects.filter((o) => o.locked === true).length === 1,
    );

    check(
      'payload: scene scope reports editableIds as the selection',
      JSON.stringify(p.editableIds) === JSON.stringify([a.userData.id]) && p.scope === 'scene',
    );

    check(
      'payload: scene scope carries the snapshot rig fields through',
      JSON.stringify(p.bones) === JSON.stringify(snap.bones) &&
        p.template === snap.template &&
        p.axisFamily === snap.axisFamily,
    );
  }

  // ---------------------------------------------------------------------------
  // Payload — geo policy (summary vs passthrough)
  // ---------------------------------------------------------------------------
  {
    const s = new StudioScene();
    const custom = s.addPrimitive('box', 0xffffff, { silent: true });
    custom.userData.kind = 'custom';
    custom.userData.sculpted = true;
    s.select(custom);
    const vertexCount = custom.geometry.attributes.position.count;

    const summarized = buildPayload(s, { scope: 'selected', includeGeo: false });
    const g = summarized.objects[0].geo;
    check(
      'payload: includeGeo false summarizes geo to vertexCount + boundingBox',
      !!g &&
        g.vertexCount === vertexCount &&
        !Object.prototype.hasOwnProperty.call(g, 'positions') &&
        JSON.stringify(g.boundingBox.min) === JSON.stringify([-0.5, -0.5, -0.5]) &&
        JSON.stringify(g.boundingBox.max) === JSON.stringify([0.5, 0.5, 0.5]),
    );

    check(
      'payload: includeGeo false never leaks positions into the JSON',
      !JSON.stringify(summarized).includes('"positions"'),
    );

    const full = buildPayload(s, { scope: 'selected', includeGeo: true });
    check(
      'payload: includeGeo true preserves geo.positions',
      Array.isArray(full.objects[0].geo.positions) &&
        full.objects[0].geo.positions.length ===
          custom.geometry.attributes.position.array.length &&
        !Object.prototype.hasOwnProperty.call(full.objects[0].geo, 'vertexCount'),
    );
  }

  // ---------------------------------------------------------------------------
  // Payload — rounding + derivation from takeSnapshot
  // ---------------------------------------------------------------------------
  {
    const s = new StudioScene();
    const a = s.addPrimitive('box', 0xff0000, { silent: true });
    a.position.set(1.23456789, -2.98765432, 0);
    a.scale.set(1.11111111, 1, 1);
    s.select(a);
    const p = buildPayload(s, { scope: 'selected', includeGeo: false });
    const t = p.objects[0].transform;
    check(
      'payload: numeric coordinates are rounded to 4 decimals',
      t.p[0] === r4(1.23456789) &&
        t.p[0] === 1.2346 &&
        t.p[1] === -2.9877 &&
        t.s[0] === 1.1111,
    );
  }

  {
    const s = new StudioScene();
    const a = s.addPrimitive('box', 0xff0000, { silent: true });
    const torus = s.addPrimitive('torus', 0x00ff00, { silent: true });
    torus.position.set(2.5, 0.56, 0);
    s.select(a);
    const snap = takeSnapshot(s);
    const p = buildPayload(s, { scope: 'scene', includeGeo: true });

    check(
      'payload: scene payload derives from takeSnapshot (ids, order, transforms)',
      p.objects.length === snap.objects.length &&
        p.objects.every(
          (o, i) =>
            o.id === snap.objects[i].id &&
            o.name === snap.objects[i].name &&
            o.kind === snap.objects[i].kind &&
            JSON.stringify(o.transform) ===
              JSON.stringify({
                p: snap.objects[i].transform.p.map(r4),
                r: snap.objects[i].transform.r.map(r4),
                s: snap.objects[i].transform.s.map(r4),
              }),
        ),
    );

    check(
      'payload: torus parameters are carried through (rounded)',
      p.objects[1].torus &&
        p.objects[1].torus.radius === r4(snap.objects[1].torus.radius) &&
        p.objects[1].torus.tube === r4(snap.objects[1].torus.tube) &&
        typeof p.objects[1].torus.radialSegments === 'number',
    );
  }

  // ---------------------------------------------------------------------------
  // estimateTokens + buildMessages
  // ---------------------------------------------------------------------------
  {
    const payload = { objects: [{ kind: 'box' }], n: 42 };
    const expected = Math.ceil(JSON.stringify(payload).length / 4);
    check(
      'payload: estimateTokens is ceil(JSON length / 4)',
      estimateTokens(payload) === expected && Number.isInteger(expected),
    );
  }

  {
    const history = [
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'ok' },
    ];
    const payload = {
      scope: 'selected',
      includeGeo: false,
      editableIds: [7],
      objects: [],
      bones: null,
      template: null,
      axisFamily: null,
    };
    const msgs = buildMessages(history, payload, 'second', { scope: 'selected' });
    check(
      'prompt: buildMessages prepends system and appends the payload envelope',
      msgs.length === 4 &&
        msgs.map((m) => m.role).join(',') === 'system,user,assistant,user' &&
        msgs[0].content === buildSystemPrompt() &&
        msgs[3].content ===
          'second\n\n<selected_shapes>\n' + JSON.stringify(payload) + '\n</selected_shapes>',
    );

    check(
      'prompt: buildMessages passes history through verbatim',
      JSON.stringify(msgs.slice(1, 3)) === JSON.stringify(history) &&
        history.length === 2 &&
        msgs[1].content === 'first' &&
        msgs[2].content === 'ok',
    );
  }
}
