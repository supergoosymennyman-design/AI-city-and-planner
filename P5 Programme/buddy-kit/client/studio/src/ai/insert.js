/**
 * insert.js — scene insertion / replacement helpers for the AI assistant.
 *
 * This is the ONLY module that turns validated AI objects (see
 * `src/ai/schema.js` → `toInsertPayload`) into real scene meshes. It never
 * constructs geometry itself: every mesh is built through
 * `studio.addPrimitive(kind, color, { silent: true })`, exactly like
 * `restoreSnapshot` does, so an AI-inserted shape is behaviourally identical to
 * a reloaded one (same material, same torus defaults, same userData.id seeding)
 * — the per-object sequence mirrors `src/edit/snapshot.js:142-177`:
 *
 *   addPrimitive(kind, color, {silent:true}) → set name → apply p / r / s
 *
 * UNDO OWNERSHIP (the one rule every caller must respect)
 * -------------------------------------------------------
 * `addObjects` never calls `studio.pushUndo()`. The caller owns the undo
 * boundary: it snapshots ONCE before the action and lets the scene's normal
 * `undo()` restore it. If this module also pushed, a single AI action would
 * need two `Ctrl+Z` presses and the user would think undo is broken.
 *
 * The one exception is `replaceSelection`, which is a complete, self-contained
 * user action (remove the old set + insert the new set). It pushes exactly ONE
 * undo entry itself — callers must NOT push another around it. After that single
 * entry, one `undo()` restores both the removed originals and the old selection.
 *
 * The AI path is SHAPES ONLY: no rig, no bones, no imported geometry.
 */

import * as THREE from 'three';
import { makeTorus } from '../scene.js';
import { AI_SHAPE_KINDS } from './schema.js';

/** Identity defaults for a missing transform component (p/r are zero, s is one). */
const IDENTITY_P = [0, 0, 0];
const IDENTITY_R = [0, 0, 0];
const IDENTITY_S = [1, 1, 1];

/**
 * Coerce a raw 3-vector into a finite length-3 array, substituting a per-axis
 * default for any missing / non-finite / non-array component. Keeping the
 * output length exactly 3 lets `Vector3.fromArray` and `Euler.set` be used
 * without ever producing `NaN`.
 *
 * @param {*} raw - Candidate `[x,y,z]` (or undefined).
 * @param {number} dx - Default x when the component is unusable.
 * @param {number} dy - Default y when the component is unusable.
 * @param {number} dz - Default z when the component is unusable.
 * @returns {number[]} A finite length-3 array.
 */
function vec3(raw, dx, dy, dz) {
  const a = Array.isArray(raw) ? raw : [];
  const pick = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  return [pick(a[0], dx), pick(a[1], dy), pick(a[2], dz)];
}

/**
 * True when `kind` is one of the primitives `studio.addPrimitive` can build.
 * Sourced from the schema whitelist (which mirrors scene.js's private
 * `PRIMITIVES` map) so the two can never disagree.
 *
 * @param {*} kind - Candidate kind string.
 * @returns {boolean}
 */
function isBuildableKind(kind) {
  return typeof kind === 'string' && AI_SHAPE_KINDS.includes(kind);
}

/**
 * Average the WORLD positions of a set of meshes.
 *
 * Used to find where a selection sits before it is replaced, so the replacement
 * group can be offset back onto that spot.
 *
 * @param {Iterable<THREE.Object3D>|null|undefined} meshes - Meshes (or any
 *   objects) to average. Entries that are not meshes are ignored.
 * @returns {[number, number, number]|null} `[x,y,z]` world centroid, or `null`
 *   when the input is missing/non-iterable or contains no meshes. Never throws.
 */
export function selectionCentroid(meshes) {
  if (
    !meshes ||
    typeof meshes === 'string' ||
    typeof meshes[Symbol.iterator] !== 'function'
  ) {
    return null;
  }
  const v = new THREE.Vector3();
  let n = 0;
  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (const m of meshes) {
    if (!m || !m.isMesh) continue;
    m.getWorldPosition(v);
    sx += v.x;
    sy += v.y;
    sz += v.z;
    n++;
  }
  if (n === 0) return null;
  return [sx / n, sy / n, sz / n];
}

/**
 * Centroid of a payload's requested positions (the `transform.p` of every
 * entry that has a buildable kind). Missing transforms contribute the identity
 * position, matching `addObjects`' own defaulting rule. Returns `null` when the
 * payload has no buildable entries.
 *
 * @param {*} objects - Raw payload array.
 * @returns {[number, number, number]|null}
 */
export function payloadCentroid(objects) {
  if (!Array.isArray(objects)) return null;
  let n = 0;
  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (const o of objects) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) continue;
    if (!isBuildableKind(o.kind)) continue;
    const t = o.transform && typeof o.transform === 'object' ? o.transform : {};
    const p = vec3(t.p, IDENTITY_P[0], IDENTITY_P[1], IDENTITY_P[2]);
    sx += p[0];
    sy += p[1];
    sz += p[2];
    n++;
  }
  if (n === 0) return null;
  return [sx / n, sy / n, sz / n];
}

/**
 * Lowest requested position (`transform.p.y`) among a payload's buildable
 * entries. Missing/non-finite y values contribute the identity `0`, matching
 * `addObjects`' own defaulting rule. Returns `null` when the payload has no
 * buildable entries.
 *
 * Used to base-seat a dropped group: aligning the group's CENTROID to a floor
 * hit buries it (a unit box at `p.y=1` gets its base at -0.5), so the vertical
 * offset is derived from the minimum position instead.
 *
 * @param {*} objects - Raw payload array.
 * @returns {number|null}
 */
export function payloadMinY(objects) {
  if (!Array.isArray(objects)) return null;
  let min = null;
  for (const o of objects) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) continue;
    if (!isBuildableKind(o.kind)) continue;
    const t = o.transform && typeof o.transform === 'object' ? o.transform : {};
    const y = vec3(t.p, IDENTITY_P[0], IDENTITY_P[1], IDENTITY_P[2])[1];
    if (min === null || y < min) min = y;
  }
  return min;
}

/**
 * Insert validated AI objects into the scene as primitive meshes.
 *
 * For every entry this mirrors `restoreSnapshot`'s per-object sequence:
 * `studio.addPrimitive(o.kind, o.color, { silent: true })`, then set `name`,
 * apply `transform.p` / `transform.r` / `transform.s`. It deliberately does NOT
 * copy `o.id` — the schema emits `id: null` as a placeholder and
 * `addPrimitive` assigns the real, unique id (overwriting it would collide ids).
 * A `torus` entry that carries explicit params is rebuilt with `makeTorus`, again
 * mirroring the snapshot path.
 *
 * A malformed entry (not an object, unknown kind, or a construction failure) is
 * collected in `skipped` with a human-readable `reason` and the loop continues —
 * this function NEVER throws on bad input so one bad shape cannot abort a whole
 * AI reply.
 *
 * UNDO OWNERSHIP: this function does NOT call `studio.pushUndo()`. The caller
 * must snapshot once before calling (see the module header). `silent: true`
 * also means no `changed` event is emitted per mesh — the caller is responsible
 * for emitting `changed` / selecting the result.
 *
 * @param {object} studio - The live `StudioScene`.
 * @param {Array} objects - Payload entries: `{kind, name?, color?, transform?}`.
 *   `transform` is `{p:number[3], r:number[3], s:number[3]}`; omitted components
 *   default to identity.
 * @param {{offset?: number[]|{x:number,y:number,z:number}}} [opts] - Optional
 *   vector added to every inserted mesh's position (e.g. a preserved centroid).
 * @returns {{meshes: THREE.Mesh[], skipped: Array<{index:number, kind:*, reason:string}>}}
 *   The successfully-created meshes (in payload order) and the rejected entries.
 */
export function addObjects(studio, objects, { offset } = {}) {
  const meshes = [];
  const skipped = [];
  if (!Array.isArray(objects) || objects.length === 0) {
    return { meshes, skipped };
  }

  const ox = offset
    ? Number(Array.isArray(offset) ? offset[0] : offset.x)
    : 0;
  const oy = offset
    ? Number(Array.isArray(offset) ? offset[1] : offset.y)
    : 0;
  const oz = offset
    ? Number(Array.isArray(offset) ? offset[2] : offset.z)
    : 0;
  const hasOffset = Number.isFinite(ox) && Number.isFinite(oy) && Number.isFinite(oz);

  for (let i = 0; i < objects.length; i++) {
    const o = objects[i];

    if (!o || typeof o !== 'object' || Array.isArray(o)) {
      skipped.push({ index: i, kind: undefined, reason: 'entry is not an object' });
      continue;
    }
    if (!isBuildableKind(o.kind)) {
      skipped.push({
        index: i,
        kind: o.kind,
        reason: `unknown kind '${String(o.kind)}' (expected one of ${AI_SHAPE_KINDS.join(', ')})`,
      });
      continue;
    }

    let mesh = null;
    try {
      mesh = studio.addPrimitive(o.kind, o.color, { silent: true });

      if (typeof o.name === 'string' && o.name) mesh.name = o.name;

      if (o.kind === 'torus' && o.torus) {
        mesh.userData.torus = { ...o.torus };
        try {
          mesh.geometry.dispose();
          mesh.geometry = makeTorus(o.torus);
        } catch {
          // Keep the default torus geometry if the stored params are malformed.
        }
      }

      const t = o.transform && typeof o.transform === 'object' ? o.transform : {};
      const p = vec3(t.p, IDENTITY_P[0], IDENTITY_P[1], IDENTITY_P[2]);
      const r = vec3(t.r, IDENTITY_R[0], IDENTITY_R[1], IDENTITY_R[2]);
      const s = vec3(t.s, IDENTITY_S[0], IDENTITY_S[1], IDENTITY_S[2]);
      mesh.position.fromArray(p);
      mesh.rotation.set(r[0], r[1], r[2]);
      mesh.scale.fromArray(s);

      if (hasOffset) {
        mesh.position.x += ox;
        mesh.position.y += oy;
        mesh.position.z += oz;
      }

      meshes.push(mesh);
    } catch (err) {
      // A failure mid-construction must not leave a half-built mesh in the scene.
      if (mesh) {
        try {
          studio.remove(mesh);
        } catch {
          /* best-effort cleanup */
        }
      }
      skipped.push({
        index: i,
        kind: o.kind,
        reason: err && err.message ? err.message : String(err),
      });
    }
  }

  return { meshes, skipped };
}

/**
 * Replace the current shape selection with a fresh set of AI objects.
 *
 * A complete, self-contained user action that owns its OWN undo boundary:
 *
 *  1. capture the selected meshes and their centroid (`selectionCentroid`);
 *  2. `studio.pushUndo()` — EXACTLY ONE entry;
 *  3. remove each selected mesh via `studio.remove(m)` (mirrors main.js's
 *     delete-selected flow);
 *  4. `addObjects(...)` — when `preservePosition` is true the inserted group is
 *     offset so its centroid lands exactly where the originals sat (the payload
 *     is expected to be built with `scope: 'selected'`, i.e. positions relative
 *     to the selection);
 *  5. re-select the inserted meshes with `studio.setSelection(meshes, meshes[0])`
 *     so the neon outline renders;
 *  6. emit `changed` once so every consumer refreshes.
 *
 * Callers must NOT wrap this in their own `pushUndo()` — doing so would make one
 * AI action take two `Ctrl+Z` presses (see the module header).
 *
 * @param {object} studio - The live `StudioScene`.
 * @param {Array} objects - Payload entries (same shape `addObjects` accepts).
 * @param {{preservePosition?: boolean}} [opts] - When true, offset the new group
 *   onto the removed selection's centroid. Default false.
 * @returns {{meshes: THREE.Mesh[], skipped: Array<{index:number, kind:*, reason:string}>}}
 *   The inserted meshes and any rejected entries. Never throws.
 */
export function replaceSelection(studio, objects, { preservePosition = false } = {}) {
  if (!studio) return { meshes: [], skipped: [] };

  const selected =
    studio.selection && studio.shapes
      ? studio.shapes.filter((m) => studio.selection.has(m))
      : [];
  const oldCentroid = selectionCentroid(selected);

  studio.pushUndo();
  for (const m of selected) studio.remove(m);

  let offset;
  if (preservePosition && oldCentroid) {
    const pc = payloadCentroid(objects);
    if (pc) {
      offset = [
        oldCentroid[0] - pc[0],
        oldCentroid[1] - pc[1],
        oldCentroid[2] - pc[2],
      ];
    }
  }

  const added = addObjects(studio, objects, offset ? { offset } : undefined);
  studio.setSelection(added.meshes, added.meshes[0]);
  if (typeof studio.emit === 'function') studio.emit('changed');
  return added;
}

/**
 * Remove a set of meshes from the scene, returning how many were actually
 * removed. Intended as the cleanup path for a rejected AI result (remove
 * exactly what was just inserted), so it does NOT push an undo entry and does
 * NOT emit any extra state beyond what `studio.remove` already does.
 *
 * Only meshes still attached to the scene are removed and counted — a mesh that
 * was already detached (or a `null`/non-mesh entry) is ignored, so passing the
 * same list twice cannot double-count.
 *
 * @param {object} studio - The live `StudioScene`.
 * @param {Iterable<THREE.Object3D>|null|undefined} meshes - Meshes to remove.
 * @returns {number} How many meshes were removed. Never throws.
 */
export function removeObjects(studio, meshes) {
  if (!studio || typeof studio.remove !== 'function') return 0;
  if (
    !meshes ||
    typeof meshes === 'string' ||
    typeof meshes[Symbol.iterator] !== 'function'
  ) {
    return 0;
  }
  const list = Array.isArray(meshes) ? meshes : [...meshes];
  let count = 0;
  for (const m of list) {
    if (!m || !m.isMesh || !m.parent) continue;
    studio.remove(m);
    count++;
  }
  return count;
}
