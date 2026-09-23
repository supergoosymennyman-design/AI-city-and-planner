// src/rig/tests/tap-depth.spec.js
// Where a tap lands (task 014, spec §2): the centre of the first solid span along the ray, and
// whether a point is inside the model. The merged-limb case is covered honestly: a limb pushed
// into a body reads as ONE span, so the midpoint is pulled toward the body.
import { buildSurface, crossings, firstSolidSpan, isInside, tapPoint } from '../tap-depth.js';
import { makeBox, makeOpenBox, makeQuad, mergeMeshes, translate } from './fixtures.js';

const near = (a, b, tol = 1e-5) => Math.abs(a - b) < tol;

export default function (check) {
  // --- a box seen from outside: enter, exit, midpoint ---
  {
    const surface = buildSurface(makeBox([-1, -1, -1], [1, 1, 1]));
    const list = crossings(surface, [-5, 0, 0], [1, 0, 0]);
    check('tap: a ray through a box crosses it twice, even along a face diagonal (no double count)', list.length === 2);
    check('tap: the first crossing enters and the second leaves', list[0].entering === true && list[1].entering === false);
    check('tap: crossings come nearest first', list[0].distance < list[1].distance && near(list[0].distance, 4) && near(list[1].distance, 6));
    const span = firstSolidSpan(surface, [-5, 0, 0], [1, 0, 0]);
    check('tap: the first solid span runs from the near face to the far face', !!span && near(span.entry.point[0], -1) && near(span.exit.point[0], 1) && near(span.length, 2));
    check('tap: its midpoint is the centre of the box', !!span && near(span.midpoint[0], 0) && near(span.midpoint[1], 0) && near(span.midpoint[2], 0));
    const landing = tapPoint(surface, [-5, 0, 0], [1, 0, 0]);
    check('tap: tapPoint lands inside at the midpoint', !!landing && landing.inside === true && near(landing.point[0], 0));
    check('tap: a direction is normalised before use', near(tapPoint(surface, [-5, 0, 0], [10, 0, 0]).point[0], 0));
  }

  // --- a miss places nothing ---
  {
    const surface = buildSurface(makeBox([-1, -1, -1], [1, 1, 1]));
    check('tap: a ray that misses reports no crossings', crossings(surface, [-5, 3, 0], [1, 0, 0]).length === 0);
    check('tap: tapPoint returns null on a miss', tapPoint(surface, [-5, 3, 0], [1, 0, 0]) === null);
    check('tap: a ray pointing away misses', tapPoint(surface, [-5, 0, 0], [-1, 0, 0]) === null);
  }

  // --- inside test ---
  {
    const surface = buildSurface(makeBox([-1, -1, -1], [1, 1, 1]));
    check('tap: the centre is inside', isInside(surface, [0, 0, 0]) === true);
    check('tap: a corner region is inside', isInside(surface, [0.9, -0.9, 0.9]) === true);
    check('tap: outside is outside', isInside(surface, [3, 0, 0]) === false && isInside(surface, [1.5, 0, 0]) === false);
  }

  // --- a ray that starts inside sees an exit first; that is not a span ---
  {
    const surface = buildSurface(makeBox([-1, -1, -1], [1, 1, 1]));
    const list = crossings(surface, [0, 0, 0], [1, 0, 0]);
    check('tap: from inside the only crossing is an exit', list.length === 1 && list[0].entering === false);
    check('tap: no solid span starts from inside', firstSolidSpan(surface, [0, 0, 0], [1, 0, 0]) === null);
    const landing = tapPoint(surface, [0, 0, 0], [1, 0, 0]);
    check('tap: tapPoint then lands on the skin and says it is not inside', !!landing && landing.inside === false && near(landing.point[0], 1));
  }

  // --- two separate bodies: the first span is the near body only ---
  {
    const surface = buildSurface(mergeMeshes(makeBox([-1, -1, -1], [1, 1, 1]), makeBox([3, -1, -1], [5, 1, 1])));
    const list = crossings(surface, [-5, 0, 0], [1, 0, 0]);
    check('tap: four crossings through two boxes, sorted', list.length === 4 && list.every((c, i) => i === 0 || c.distance >= list[i - 1].distance));
    const landing = tapPoint(surface, [-5, 0, 0], [1, 0, 0]);
    check('tap: the joint goes in the near body, not between the two', !!landing && near(landing.point[0], 0));
    check('tap: the far body is inside too', isInside(surface, [4, 0, 0]) === true && isInside(surface, [2, 0, 0]) === false);
  }

  // --- the merged limb, honestly: a limb pushed into a body reads as one span ---
  {
    const body = makeBox([-1, -1, -1], [1, 1, 1]);
    const limb = makeBox([0.8, -0.3, -0.3], [3.2, 0.3, 0.3]); // overlaps the body by 0.2
    const surface = buildSurface(mergeMeshes(body, limb));
    const along = tapPoint(surface, [6, 0, 0], [-1, 0, 0]); // tapping the limb end-on, through the body
    check('tap: end-on, the limb and the body merge into one span', crossings(surface, [6, 0, 0], [-1, 0, 0]).length === 4 && !!along && near(along.point[0], (3.2 + -1) / 2, 1e-4));
    check('tap: so the joint is pulled toward the body, not the limb centre (spec §2: no single-tap rule fixes this)', !!along && Math.abs(along.point[0] - 2.0) > 0.5);
    const across = tapPoint(surface, [2, 5, 0], [0, -1, 0]); // tapping the limb where it stands clear
    check('tap: across the clear part of the limb the joint sits in the limb', !!across && near(across.point[0], 2) && near(across.point[1], 0) && across.inside === true);
    check('tap: a point in the overlap counts as inside once, not twice', isInside(surface, [0.9, 0, 0]) === true);
  }

  // --- an open surface has no inside ---
  {
    const surface = buildSurface(makeQuad());
    const landing = tapPoint(surface, [0.2, 0.2, 5], [0, 0, -1]);
    check('tap: an open surface lands on the skin and reports not inside', !!landing && landing.inside === false && near(landing.point[2], 0) && landing.span === null);
    check('tap: nothing is inside an open surface', isInside(surface, [0, 0, -0.5]) === false);
  }

  // --- a non-watertight model can still be rigged: isInside must never contradict tapPoint
  // (final review fix round, F1). isClosed used to veto isInside entirely, so on the studio's own
  // shipped sample (not edge-manifold) a tap that landed "inside" was reported "outside" by the
  // very next check — every ball turned red and no drag could ever fix it. Both now rest on the
  // same solid-span evidence, and isClosed is reported but never consulted for containment.
  {
    const surface = buildSurface(makeOpenBox([-1, -1, -1], [1, 1, 1]));
    check('tap: an open box (missing one face) is honestly reported as not closed', surface.isClosed === false);
    const landing = tapPoint(surface, [-5, 0, 0], [1, 0, 0]);
    check('tap: tapPoint still lands inside a non-watertight model', !!landing && landing.inside === true && near(landing.point[0], 0));
    check('tap: isInside AGREES with tapPoint at the landing point (the invariant F1 broke)', isInside(surface, landing.point) === true);
    check('tap: isInside also agrees well clear of the missing face', isInside(surface, [0, 0, 0.9]) === true);
    check('tap: outside stays outside on a non-watertight model too', isInside(surface, [3, 0, 0]) === false);
  }

  // --- the surface is built from cleaned triangles ---
  {
    const box = makeBox([-1, -1, -1], [1, 1, 1]);
    const padded = { position: box.position, index: new Uint32Array([...box.index, 0, 0, 0, 2, 2, 2]) };
    const surface = buildSurface(padded);
    check('tap: degenerate padding triangles are dropped before the BVH is built', surface.triangles === 12);
    let threw = false;
    try { buildSurface({ position: new Float32Array([0, 0, 0]), index: new Uint32Array([0, 0, 0]) }); } catch (e) { threw = /triangle/.test(e.message); }
    check('tap: a surface with no real triangle is refused loudly', threw);
  }

  // --- closedness is position-independent (regression: edge adjacency not ray probe) ---
  {
    const box = makeBox([-1, -1, -1], [1, 1, 1]);
    const translated = translate(box, 100, 0, 0);
    const surface = buildSurface(translated);
    check('tap: a closed box translated far from origin still reads as closed', surface.isClosed === true);
    const centre = [100, 0, 0]; // centre of [-1,1]^3 shifted by (100, 0, 0)
    check('tap: isInside works correctly at the centre of a translated closed box', isInside(surface, centre) === true);
  }
}
