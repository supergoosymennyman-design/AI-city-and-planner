/**
 * insert.spec.js — scene insertion / replacement coverage for `src/ai/insert.js`.
 *
 * Discovered and called by `run-tests.mjs`'s `src/ai/tests/*.spec.js` block:
 * `export default function insertTests(check)` where `check(name, cond)` counts
 * PASS/FAIL. Every check name starts with `insert:` so the group is easy to grep
 * (`npm test | grep -c "PASS insert"`).
 *
 * These exercise a REAL headless `StudioScene` (the same construction every
 * other suite in this repo uses) so the helpers are asserted against the actual
 * `addPrimitive` / `remove` / `setSelection` / `pushUndo` behaviour rather than a
 * hand-rolled stub.
 */

import { StudioScene } from '../../scene.js';
import { takeSnapshot, restoreSnapshot } from '../../edit/snapshot.js';
import {
  selectionCentroid,
  addObjects,
  replaceSelection,
  removeObjects,
} from '../insert.js';

/** Float equality with a tolerant epsilon (positions round-trip exactly here). */
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const arrNear = (a, b, eps = 1e-6) =>
  Array.isArray(a) && a.length === b.length && a.every((v, i) => near(v, b[i], eps));

/** A payload entry factory mirroring `toInsertPayload`'s internal schema. */
const obj = (kind, name, color, p, r = [0, 0, 0], s = [1, 1, 1]) => ({
  kind,
  name,
  color,
  transform: { p, r, s },
});

export default function insertTests(check) {
  // ---------------------------------------------------------------------------
  // selectionCentroid
  // ---------------------------------------------------------------------------
  {
    const s = new StudioScene();
    const a = s.addPrimitive('box', 0xff0000, { silent: true });
    const b = s.addPrimitive('box', 0x00ff00, { silent: true });
    a.position.set(2, 0, 0);
    b.position.set(4, 0, 0);

    check(
      'insert: selectionCentroid averages the meshes world positions',
      arrNear(selectionCentroid([a, b]), [3, 0, 0]),
    );
    check(
      'insert: selectionCentroid returns null when there is nothing to average',
      selectionCentroid([]) === null &&
        selectionCentroid(null) === null &&
        selectionCentroid(undefined) === null,
    );
  }

  // ---------------------------------------------------------------------------
  // addObjects — the exact snapshot.js insertion seam
  // ---------------------------------------------------------------------------
  {
    const s = new StudioScene();
    const before = s.shapes.length;
    const { meshes, skipped } = addObjects(s, [
      obj('box', 'torso', 0xff6b6b, [0, 1, 0], [0, 0, 0], [1, 2, 1]),
      obj('banana', 'bad', 0xffffff, [0, 0, 0]),
    ]);
    const m = meshes[0];

    check(
      'insert: addObjects builds via addPrimitive and applies p/r/s',
      s.shapes.length - before === 1 &&
        meshes.length === 1 &&
        skipped.length === 1 &&
        m.name === 'torso' &&
        m.userData.kind === 'box' &&
        arrNear(m.position.toArray(), [0, 1, 0]) &&
        near(m.scale.y, 2) &&
        m.material.color.getHex() === 0xff6b6b,
    );

    check(
      'insert: addObjects reports a bad kind in skipped with a reason',
      skipped.length === 1 &&
        skipped[0].kind === 'banana' &&
        typeof skipped[0].reason === 'string' &&
        skipped[0].reason.length > 0 &&
        skipped[0].reason.includes('banana'),
    );
  }

  {
    const s = new StudioScene();
    const { meshes } = addObjects(
      s,
      [obj('box', 'shifted', 0xffffff, [0, 1, 0])],
      { offset: [1, 2, 3] },
    );
    check(
      'insert: addObjects applies the offset additively to the position',
      meshes.length === 1 && arrNear(meshes[0].position.toArray(), [1, 3, 3]),
    );
  }

  {
    const s = new StudioScene();
    const r1 = addObjects(s, []);
    const r2 = addObjects(s, null);
    check(
      'insert: addObjects accepts empty/missing input without throwing',
      r1.meshes.length === 0 &&
        r1.skipped.length === 0 &&
        r2.meshes.length === 0 &&
        r2.skipped.length === 0,
    );

    const r3 = addObjects(s, [null, undefined]);
    check(
      'insert: addObjects skips null and undefined entries with a reason',
      r3.meshes.length === 0 &&
        r3.skipped.length === 2 &&
        r3.skipped.every((x) => typeof x.reason === 'string'),
    );

    // A valid kind with no transform is still insertable — the omitted
    // transform defaults to identity rather than rejecting the entry.
    const r4 = addObjects(s, [null, undefined, { kind: 'box' }]);
    check(
      'insert: addObjects tolerates mixed malformed input and defaults a missing transform',
      r4.meshes.length === 1 &&
        r4.skipped.length === 2 &&
        arrNear(r4.meshes[0].position.toArray(), [0, 0, 0]) &&
        arrNear(r4.meshes[0].scale.toArray(), [1, 1, 1]),
    );
  }

  {
    const s = new StudioScene();
    addObjects(s, [obj('box', 'no-undo', 0xff0000, [0, 0, 0])]);
    check(
      'insert: addObjects does not own the undo boundary (no pushUndo)',
      s.undoStack.length === 0 && s.shapes.length === 1,
    );
  }

  {
    const s = new StudioScene();
    const { meshes } = addObjects(s, [obj('torus', 'ring', 0x4dabf7, [1, 0.56, 0])]);
    const ring = meshes[0];
    const s2 = new StudioScene();
    restoreSnapshot(s2, takeSnapshot(s));
    const reloaded = s2.shapes.find((m) => m.userData.kind === 'torus');
    check(
      'insert: addObjects output matches a snapshot-reloaded shape (material + torus params + transform)',
      ring.material.side === reloaded.material.side &&
        ring.material.color.getHex() === reloaded.material.color.getHex() &&
        JSON.stringify(ring.userData.torus) === JSON.stringify(reloaded.userData.torus) &&
        arrNear(ring.position.toArray(), reloaded.position.toArray()) &&
        ring.geometry.attributes.position.count === reloaded.geometry.attributes.position.count,
    );
  }

  // ---------------------------------------------------------------------------
  // replaceSelection — remove + offset + select, with ONE undo entry
  // ---------------------------------------------------------------------------
  {
    const s = new StudioScene();
    const a = s.addPrimitive('box', 0xff0000, { silent: true });
    a.position.set(2, 1, 0);
    const b = s.addPrimitive('box', 0x00ff00, { silent: true });
    b.position.set(2, 3, 0);
    s.setSelection([a, b], a);

    const res = replaceSelection(
      s,
      [obj('sphere', 'head', 0x00ff00, [0, 1.6, 0])],
      { preservePosition: true },
    );
    const sphere = res.meshes[0];

    check(
      'insert: replaceSelection removes the old selection and selects the new mesh',
      s.shapes.length === 1 &&
        s.shapes[0] === sphere &&
        sphere.name === 'head' &&
        s.selection.has(sphere) &&
        s.selection.size === 1,
    );
    check(
      'insert: replaceSelection preserves the old centroid when asked',
      near(sphere.position.x, 2) &&
        near(sphere.position.y, 2) &&
        near(sphere.position.z, 0),
    );
    check(
      'insert: replaceSelection returns the inserted meshes and an empty skipped',
      res.meshes.length === 1 && res.skipped.length === 0,
    );
    check(
      'insert: replaceSelection renders the neon outline for the new mesh',
      s.outlines.has(sphere) === true,
    );
    check(
      'insert: replaceSelection pushes exactly one undo entry',
      s.undoStack.length === 1,
    );

    s.undo(); // the studio's real public undo entry point
    check(
      'insert: exactly one undo reverts a replaceSelection',
      s.shapes.length === 2 &&
        s.shapes.some((m) => m.name === 'box-1') &&
        s.shapes.some((m) => m.name === 'box-2') &&
        s.selection.size === 2,
    );
  }

  {
    const s = new StudioScene();
    const a = s.addPrimitive('box', 0xff0000, { silent: true });
    const b = s.addPrimitive('sphere', 0x00ff00, { silent: true });
    s.setSelection([a, b], a);
    const res = replaceSelection(s, []);
    check(
      'insert: replaceSelection with empty objects removes the selection and adds nothing',
      s.shapes.length === 0 && res.meshes.length === 0 && s.selection.size === 0,
    );
  }

  {
    const s = new StudioScene();
    s.addPrimitive('box', 0xff0000, { silent: true });
    const res = replaceSelection(s, []); // no selection at all
    check(
      'insert: replaceSelection with no selection does not throw and leaves shapes unchanged',
      s.shapes.length === 1 && res.meshes.length === 0 && res.skipped.length === 0,
    );
  }

  // ---------------------------------------------------------------------------
  // removeObjects — the rejected-result cleanup path
  // ---------------------------------------------------------------------------
  {
    const s = new StudioScene();
    const a = s.addPrimitive('box', 0xff0000, { silent: true });
    const b = s.addPrimitive('sphere', 0x00ff00, { silent: true });
    const n = removeObjects(s, [a, b, a]); // `a` twice — already detached the 2nd time
    check(
      'insert: removeObjects removes and counts real meshes once each',
      n === 2 && s.shapes.length === 0,
    );
    check(
      'insert: removeObjects ignores null, non-mesh and missing input',
      removeObjects(s, null) === 0 &&
        removeObjects(s, [null, undefined, {}]) === 0 &&
        removeObjects(s, []) === 0,
    );
  }
}
