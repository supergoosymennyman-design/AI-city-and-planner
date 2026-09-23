// src/rig/tap-depth.js
// Where a tap lands (task 014, spec §2). A tap is a ray; the joint goes at the centre of the
// first solid span the ray crosses, found from the model's bounding-volume tree. Pure given the
// mesh: no scene objects, no camera. Crossings are counted on BOTH faces (DoubleSide) because a
// span needs its exit as much as its entry; culling back faces silently halves the crossings.
import { BufferGeometry, BufferAttribute, Ray, Vector3, DoubleSide } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { cleanTriangles } from './heat-weights.js';

/** Build the tap surface. `index` is cleaned and then REORDERED IN PLACE by the BVH; triangles
 * are always read back from this same array, so faceIndex stays consistent. */
export function buildSurface(mesh) {
  const position = mesh.position instanceof Float32Array ? mesh.position : Float32Array.from(mesh.position);
  const index = cleanTriangles(mesh.index);
  if (index.length < 3) throw new Error('a tap surface needs at least one real triangle');
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(position, 3));
  geometry.setIndex(new BufferAttribute(index, 1));
  const bvh = new MeshBVH(geometry);

  // Detect if surface is closed by checking edge adjacency: a closed surface has every edge
  // shared by exactly 2 triangles. Position-independent. Reported for diagnostics only — an
  // AI-generated model is routinely NOT edge-manifold, and isInside() below must still work on
  // one, so nothing gates containment on this flag (final review fix round, F1).
  const isClosed = isClosedTopology(index);

  return { position, index, bvh, triangles: index.length / 3, isClosed };
}

/** Check if mesh is topologically closed by edge adjacency. Position-independent. */
function isClosedTopology(index) {
  const edges = new Map(); // edge key -> count

  for (let t = 0; t < index.length; t += 3) {
    const a = index[t];
    const b = index[t + 1];
    const c = index[t + 2];

    // Three edges per triangle, stored as sorted pairs so order is irrelevant
    const edgesToAdd = [
      [Math.min(a, b), Math.max(a, b)],
      [Math.min(b, c), Math.max(b, c)],
      [Math.min(c, a), Math.max(c, a)],
    ];

    for (const [v1, v2] of edgesToAdd) {
      const key = v1 + ',' + v2;
      edges.set(key, (edges.get(key) || 0) + 1);
    }
  }

  // Closed surface: every edge is shared by exactly 2 triangles
  for (const count of edges.values()) {
    if (count !== 2) return false;
  }

  return true;
}

const _ray = new Ray();
// A small, position-independent set of probe directions for isInside — off every axis (so a probe
// never runs along a box face or through a grid of edges) and no two opposite (so two probes are
// never secretly the same line through the point). None share a component's magnitude with another
// on the same probe either, which keeps a probe off a cube's corner-to-corner diagonal too.
const INSIDE_DIRECTIONS = [
  new Vector3(0.311, 0.842, 0.441),
  new Vector3(0.771, -0.203, 0.603),
  new Vector3(-0.512, 0.531, -0.677),
  new Vector3(0.204, -0.733, -0.647),
].map((v) => v.normalize());
const SAME_HIT = 1e-9;

/** True when the ray goes INTO the surface at this triangle: the ray runs against the outward normal. */
function entering(surface, faceIndex, direction) {
  const { position, index } = surface;
  return crossingEnters(position, index, faceIndex, direction);
}

function crossingEnters(position, index, faceIndex, direction) {
  const a = index[faceIndex * 3];
  const b = index[faceIndex * 3 + 1];
  const c = index[faceIndex * 3 + 2];
  const ax = position[a * 3], ay = position[a * 3 + 1], az = position[a * 3 + 2];
  const ux = position[b * 3] - ax, uy = position[b * 3 + 1] - ay, uz = position[b * 3 + 2] - az;
  const vx = position[c * 3] - ax, vy = position[c * 3 + 1] - ay, vz = position[c * 3 + 2] - az;
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  return nx * direction.x + ny * direction.y + nz * direction.z < 0;
}

/**
 * Every crossing of the ray with the surface, nearest first, tagged entering or leaving. A ray
 * through a shared edge reports the same crossing once, not once per triangle.
 * @returns {Array<{distance:number, point:number[], entering:boolean}>}
 */
export function crossings(surface, origin, direction) {
  _ray.origin.set(origin[0], origin[1], origin[2]);
  _ray.direction.set(direction[0], direction[1], direction[2]).normalize();
  const hits = surface.bvh.raycast(_ray, DoubleSide);
  hits.sort((p, q) => p.distance - q.distance);
  const out = [];
  for (const h of hits) {
    const enter = entering(surface, h.faceIndex, _ray.direction);
    const prev = out[out.length - 1];
    if (prev && Math.abs(prev.distance - h.distance) < SAME_HIT && prev.entering === enter) continue;
    out.push({ distance: h.distance, point: [h.point.x, h.point.y, h.point.z], entering: enter });
  }
  return out;
}

/**
 * The first solid span: from the first entry to the exit that brings the depth back to zero.
 * Overlapping shells (a limb pushed into a body) merge into ONE span, so the midpoint is pulled
 * toward the body — the honest reading of a merged limb; the child sets depth by dragging.
 * @returns {{entry:object, exit:object, midpoint:number[], length:number}|null}
 */
export function firstSolidSpan(surface, origin, direction) {
  let depth = 0;
  let entry = null;
  for (const c of crossings(surface, origin, direction)) {
    if (c.entering) {
      if (depth === 0) entry = c;
      depth++;
    } else if (depth > 0) {
      depth--;
      if (depth === 0) {
        const midpoint = [(entry.point[0] + c.point[0]) / 2, (entry.point[1] + c.point[1]) / 2, (entry.point[2] + c.point[2]) / 2];
        return { entry, exit: c, midpoint, length: c.distance - entry.distance };
      }
    }
    // an exit at depth 0: the ray started inside, or the surface is open — not a span
  }
  return null;
}

/**
 * True when `point` lies inside a SOLID SPAN — the same evidence `tapPoint`/`firstSolidSpan` use
 * (an entry crossing paired with an exit), read from the point outward instead of from a ray's
 * origin (final review fix round, F1: this used to veto on `!surface.isClosed`, so `isInside` and
 * `tapPoint` could disagree on the SAME point — on any model that is not edge-manifold, which an
 * AI-generated one routinely is not, including the studio's own shipped sample).
 *
 * For one probe direction: cast from the point both forward and backward. If the point sits inside
 * a span, the NEAREST crossing on EITHER side must be that span's boundary as seen from inside —
 * i.e. a "leaving" crossing in that ray's own frame (walking out of a solid, the wall you hit is an
 * exit, whichever wall it is). Reversing the ray direction flips entering<->leaving for the same
 * face (the entering test is just the sign of a dot product), so the entry behind the point reads
 * as "leaving" too once approached from its own far side — that symmetry is what makes checking
 * BOTH directions a genuine entry-exit PAIR test, not a one-sided guess. A single quad (the
 * open-sheet case) still answers "not inside": there is a crossing on one side only, so the other
 * side always comes back empty and the pair never completes.
 *
 * One direction alone is not enough — it can graze an edge, run parallel to a face, or (on a mesh
 * that is not closed) happen to line up with the missing wall and sail through untouched — so this
 * tries a small, spread, off-axis set of directions (INSIDE_DIRECTIONS) and accepts the first that
 * finds a pair. A direction that slips through a hole only produces a false NEGATIVE for that one
 * probe (nothing to pair, so it is skipped); it can never manufacture a false POSITIVE, so "any
 * probe agrees" is a sound way to combine them. This is also why `surface.isClosed` plays no part
 * here any more: it was a veto on this whole question for anything not edge-manifold, but the span
 * evidence is exactly as valid on an open mesh as a closed one.
 */
export function isInside(surface, point) {
  for (const direction of INSIDE_DIRECTIONS) {
    const forward = crossings(surface, point, [direction.x, direction.y, direction.z])[0];
    if (!forward || forward.entering) continue; // no wall ahead, or approaching one from outside
    const backward = crossings(surface, point, [-direction.x, -direction.y, -direction.z])[0];
    if (backward && !backward.entering) return true; // both sides read "leaving" -> a span brackets the point
  }
  return false;
}

/**
 * Where a tap lands. Null when the ray misses. On an open surface (or from inside) the joint
 * sits on the skin and `inside` is false so the UI can say so.
 * @returns {{point:number[], inside:boolean, span:object|null}|null}
 */
export function tapPoint(surface, origin, direction) {
  const list = crossings(surface, origin, direction);
  if (!list.length) return null;
  const span = firstSolidSpan(surface, origin, direction);
  if (span) return { point: span.midpoint, inside: true, span };
  return { point: list[0].point, inside: false, span: null };
}
