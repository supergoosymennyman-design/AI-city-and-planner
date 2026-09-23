/**
 * snapshot-size.spec.js — what an undo step COSTS, and the correctness that pays for it.
 *
 * takeSnapshot used to store geometry as `Array.from(typedArray)`: a fresh JS array of boxed
 * doubles, rebuilt on every snapshot. For the 941k-face model the AI generation feature produces
 * that is ~8.5M numbers — 68 MB per undo step at 8 bytes each, times a 50-deep history, and the
 * texture work added normals and UVs on top. Two changes fix it:
 *
 *   1. keep the TYPED array (4 bytes per float, and IndexedDB clones it natively), and
 *   2. SHARE that copy between snapshots while the attribute has not changed, so moving a shape
 *      fifty times stores its vertices once instead of fifty times.
 *
 * Sharing is only safe if a stale copy can never be handed out, so the tests that matter here are
 * the invalidation ones: an edited buffer must produce a NEW copy, an older snapshot must keep the
 * values it was taken with, and a restored mesh must never write through into its own history.
 */
import * as THREE from 'three';
import { StudioScene } from '../../scene.js';
import { takeSnapshot, restoreSnapshot } from '../snapshot.js';
import { buildPayload } from '../../ai/prompt.js';

const results = [];
const rec = (name, cond) => results.push([name, !!cond]);

/** A studio holding one custom-geometry shape, the kind whose vertices get stored. */
function withCustomShape() {
  const studio = new StudioScene();
  const mesh = studio.addPrimitive('box', 0x112233, { silent: true });
  mesh.userData.sculpted = true; // makes takeSnapshot emit kind:'custom' + raw geometry
  return { studio, mesh };
}

// --- 1. the arrays stay typed ---
{
  const { studio, mesh } = withCustomShape();
  mesh.geometry.setAttribute('uv', mesh.geometry.attributes.uv || new THREE.BufferAttribute(new Float32Array(mesh.geometry.attributes.position.count * 2), 2));
  const geo = takeSnapshot(studio).objects[0].geo;
  rec('snapshot-size: positions are stored as a typed array, not boxed doubles',
    geo.positions instanceof Float32Array);
  rec('snapshot-size: so are the appearance attributes',
    geo.uv instanceof Float32Array && geo.normals instanceof Float32Array);
  rec('snapshot-size: and the index keeps its own integer type', ArrayBuffer.isView(geo.index));
  rec('snapshot-size: the values are still the shape', geo.positions.length === 72 && geo.index.length === 36);
}

// --- 2. an unchanged shape is stored ONCE, however many snapshots are taken ---
{
  const { studio, mesh } = withCustomShape();
  const first = takeSnapshot(studio).objects[0].geo;
  const second = takeSnapshot(studio).objects[0].geo;
  rec('snapshot-size: two snapshots of an unchanged shape share one copy of its vertices',
    first.positions === second.positions && first.index === second.index);

  // Moving a shape is the common undo step: fifty moves must not store fifty copies.
  mesh.position.x += 1;
  const moved = takeSnapshot(studio).objects[0];
  rec('snapshot-size: moving a shape records the new transform without re-copying its vertices',
    moved.geo.positions === first.positions && moved.transform.p[0] === mesh.position.x);
}

// --- 3. ...but an EDITED shape gets a fresh copy, and the old snapshot keeps the old values ---
{
  const { studio, mesh } = withCustomShape();
  const before = takeSnapshot(studio);
  const wasX = before.objects[0].geo.positions[0];
  const position = mesh.geometry.attributes.position;
  position.setX(0, wasX + 5);
  position.needsUpdate = true; // every in-place edit in the studio does this
  const after = takeSnapshot(studio);
  rec('snapshot-size: an edited shape is copied again, not shared',
    after.objects[0].geo.positions !== before.objects[0].geo.positions);
  rec('snapshot-size: ...the new snapshot has the new vertex', after.objects[0].geo.positions[0] === wasX + 5);
  rec('snapshot-size: ...and the OLDER snapshot still has the old one (undo still undoes)',
    before.objects[0].geo.positions[0] === wasX);

  // The undo stack is the real path: the shared copy must survive a real edit + undo.
  const studio2 = withCustomShape();
  studio2.studio.pushUndo();
  const p2 = studio2.mesh.geometry.attributes.position;
  p2.setX(0, 42);
  p2.needsUpdate = true;
  studio2.studio.emit('changed');
  studio2.studio.undo();
  rec('snapshot-size: undo restores the vertices the shape had before the edit',
    studio2.studio.shapes[0].geometry.attributes.position.getX(0) !== 42);
}

// --- 4. a restored mesh never writes through into the snapshot it came from ---
{
  const { studio } = withCustomShape();
  const snap = takeSnapshot(studio);
  const stored = snap.objects[0].geo.positions;
  const was = stored[0];
  restoreSnapshot(studio, snap);
  const live = studio.shapes[0].geometry.attributes.position;
  live.setX(0, was + 9);
  live.needsUpdate = true;
  rec('snapshot-size: editing a restored shape does not corrupt the snapshot it came from',
    stored[0] === was);
}

// --- 5. documents saved by an older build still load ---
{
  const { studio } = withCustomShape();
  const snap = takeSnapshot(studio);
  const legacy = JSON.parse(JSON.stringify({
    ...snap,
    objects: snap.objects.map((o) => ({
      ...o,
      geo: { ...o.geo, positions: Array.from(o.geo.positions), index: Array.from(o.geo.index), normals: null, uv: null, colors: null },
    })),
  }));
  let err = null;
  try { restoreSnapshot(studio, legacy); } catch (e) { err = e; }
  const back = studio.shapes[0];
  rec('snapshot-size: a document saved as plain arrays (older build) still restores',
    !err && !!back && back.geometry.attributes.position.count === 24);
}

// --- 6. persistence still works: IndexedDB clones, it does not stringify ---
{
  const { studio } = withCustomShape();
  const snap = takeSnapshot(studio);
  let cloned = null, err = null;
  try { cloned = structuredClone(snap); } catch (e) { err = e; }
  rec('snapshot-size: the snapshot survives the structured clone IndexedDB actually uses',
    !err && cloned.objects[0].geo.positions instanceof Float32Array &&
    cloned.objects[0].geo.positions[0] === snap.objects[0].geo.positions[0]);
  restoreSnapshot(studio, cloned);
  rec('snapshot-size: ...and restores from the clone', studio.shapes[0].geometry.attributes.position.count === 24);
}

// --- 7. the AI payload is still real JSON, because that one IS stringified ---
{
  const { studio, mesh } = withCustomShape();
  studio.setSelection([mesh], mesh);
  const raw = buildPayload(studio, { scope: 'scene', includeGeo: true });
  const geo = raw.objects.find((o) => o.geo && o.geo.positions).geo;
  rec('snapshot-size: an includeGeo request sends positions as a JSON array, not an object',
    Array.isArray(geo.positions) && Array.isArray(geo.index) &&
    JSON.stringify(geo.positions).startsWith('['));
  const summary = buildPayload(studio, { scope: 'scene', includeGeo: false })
    .objects.find((o) => o.geo);
  rec('snapshot-size: the summary still measures the shape from a typed array',
    summary.geo.vertexCount === 24 && summary.geo.boundingBox.min.join(',') === '-0.5,-0.5,-0.5');
}

export default function snapshotSizeTests(check) {
  for (const [name, cond] of results) check(name, cond);
}
