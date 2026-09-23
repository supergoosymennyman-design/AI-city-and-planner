// Remeshing for the Clay Studio — every shape that enters sculpture gets:
//
//   1. WELDED  — coincident vertices (a box's 24 verts for 8 corners, a sphere's
//      seam + pole duplicates) are merged into ONE shared vertex, so adjacent
//      faces deform together. Without this, a brush that moves the copy of a
//      corner owned by one face leaves a gap next to the motion-less copy
//      owned by the neighbouring face — the "opened up a hole" reports.
//   2. SUBDIVIDED — each triangle is split 4-way at its edge midpoints until the
//      mesh reaches a usable brush density. Midpoint (linear) subdivision keeps
//      the primitive's exact silhouette (a cube stays a cube) while faces gain
//      a dense grid of sculptable vertices. The default target is HIGH — ~24k
//      triangles — so sculptable sphere / torus shapes carry ~10–14k vertices,
//      right in the same class as the painted reference spheres (~10k verts).
//      Boxes land at ~6k (they need far fewer to be dense as boxes).
//
// Pure data in, pure data out (no three.js dependency) — unit-testable.

function makeIndex(positions) {
  const n = positions.length / 3;
  const idx = new Uint32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  return idx;
}

/** Merge vertices that occupy the same point (epsilon-quantised, tiny on a unit
 *  scale) into a single shared index. Returns a denser index + a de-duplicated
 *  position buffer; `merged` counts how many copies collapsed. */
export function weld(positions, index) {
  const idx = index && index.length ? index : null;
  const vcount = positions.length / 3;
  const map = new Map();
  const remap = new Int32Array(vcount);
  const out = [];
  let next = 0;
  const K = 1e4;
  for (let i = 0; i < vcount; i++) {
    const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
    const key = Math.round(x * K) + ':' + Math.round(y * K) + ':' + Math.round(z * K);
    let r = map.get(key);
    if (r === undefined) {
      r = next++;
      map.set(key, r);
      out.push(x, y, z);
    }
    remap[i] = r;
  }
  const merged = vcount - next;
  const pos = new Float32Array(out);
  if (merged === 0) return { positions: pos, index: idx ? new Uint32Array(idx) : null, merged };
  const newIdx = new Uint32Array(idx.length);
  for (let i = 0; i < idx.length; i++) newIdx[i] = remap[idx[i]];
  return { positions: pos, index: newIdx, merged };
}

/** Split every triangle 4-way at its edge midpoints (midpoints shared across
 *  faces), preserving orientation. One level = 4× the triangles. */
export function subdivide(positions, index) {
  const idx = index && index.length ? new Uint32Array(index) : makeIndex(positions);
  const vcount = positions.length / 3;
  const tris = idx.length / 3;
  const edge = new Map();
  const mids = [];
  const mid = (a, b) => {
    const lo = Math.min(a, b), hi = Math.max(a, b);
    const key = lo * vcount + hi;
    let m = edge.get(key);
    if (m === undefined) {
      m = vcount + mids.length / 3;
      const ax = positions[lo * 3], ay = positions[lo * 3 + 1], az = positions[lo * 3 + 2];
      const bx = positions[hi * 3], by = positions[hi * 3 + 1], bz = positions[hi * 3 + 2];
      mids.push((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
      edge.set(key, m);
    }
    return m;
  };
  const newIdx = new Uint32Array(tris * 12);
  let w = 0;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
    newIdx[w++] = a; newIdx[w++] = ab; newIdx[w++] = ca;
    newIdx[w++] = ab; newIdx[w++] = b; newIdx[w++] = bc;
    newIdx[w++] = ca; newIdx[w++] = bc; newIdx[w++] = c;
    newIdx[w++] = ab; newIdx[w++] = bc; newIdx[w++] = ca;
  }
  const pos = new Float32Array(vcount * 3 + mids.length);
  pos.set(positions);
  pos.set(mids, vcount * 3);
  return { positions: pos, index: newIdx };
}

/** Weld a shape's geometry, then midpoint-subdivide until it reaches `targetTris`
 *  (capped by `maxLevel` / `maxVerts`) so brushes have a usable vertex density.
 *  Shapes already denser than the target are welded ONLY — their seams close
 *  without puffing the poly count. Returns positions + index for the clay mesh. */
export function prepareForSculpt(positions, index, opts = {}) {
  const targetTris = opts.targetTris ?? 24576;
  const maxLevel = opts.maxLevel ?? 6;
  const maxVerts = opts.maxVerts ?? 30000;
  let pos = positions instanceof Float32Array ? positions : new Float32Array(positions);
  let idx = index && index.length ? new Uint32Array(index) : makeIndex(pos);
  const w = weld(pos, idx);
  pos = w.positions; idx = w.index;
  let levels = 0;
  let vcount = pos.length / 3;
  let tris = idx.length / 3;
  // one level adds ≈1.5×triangles worth of shared midpoints to the vertex count
  while (tris * 4 <= targetTris && levels < maxLevel && vcount + tris * 2 <= maxVerts) {
    const s = subdivide(pos, idx);
    pos = s.positions; idx = s.index;
    vcount = pos.length / 3; tris = idx.length / 3; levels++;
  }
  return { positions: pos, index: idx, levels, merged: w.merged };
}

/** Build a crease-aware "sharp" copy of a welded mesh for DISPLAY. three's
 *  computeVertexNormals averages the normals of every face that touches a vertex,
 *  so a box corner that the weld+subdivide pass merged into ONE shared vertex is
 *  shaded as if it were rounded — the "boxes look soft after sculpting" report.
 *  To keep hard edges crisply flat while smooth surfaces (spheres, sculpted
 *  bumps) stay smooth, every (vertex, face) pair whose face normal deviates from
 *  the vertex's smooth normal by more than `creaseDeg` is duplicated into its own
 *  vertex carrying that face's flat normal. Everything else stays shared, so it
 *  renders smooth. Coordinates are copied, never moved: the surface shape is
 *  untouched — only the shading gets its corners back.
 *
 *  Returns { positions, index, normals, remap } where `remap[r]` is the SOURCE
 *  (work / welded) vertex that output vertex `r` was copied from — the caller
 *  uses it to duplicate paint anchors / basePos in step.
 */
export function sharpenNormals(positions, index, opts = {}) {
  const pos = positions instanceof Float32Array ? positions : new Float32Array(positions);
  const idx = index && index.length ? new Uint32Array(index) : null;
  if (!idx) return { positions: pos, index: null, normals: null, remap: null };
  const creaseDot = Math.cos((opts.creaseDeg ?? 25) * Math.PI / 180);
  const vc = pos.length / 3;
  const tris = idx.length / 3;
  const fn = new Float32Array(tris * 3);
  for (let t = 0; t < tris; t++) {
    const a = idx[t * 3] * 3, b = idx[t * 3 + 1] * 3, c = idx[t * 3 + 2] * 3;
    const abx = pos[b] - pos[a], aby = pos[b + 1] - pos[a + 1], abz = pos[b + 2] - pos[a + 2];
    const acx = pos[c] - pos[a], acy = pos[c + 1] - pos[a + 1], acz = pos[c + 2] - pos[a + 2];
    let nx = aby * acz - abz * acy, ny = abz * acx - abx * acz, nz = abx * acy - aby * acx;
    const l = Math.hypot(nx, ny, nz) || 1;
    fn[t * 3] = nx / l; fn[t * 3 + 1] = ny / l; fn[t * 3 + 2] = nz / l;
  }
  const vn = new Float32Array(vc * 3);
  for (let t = 0; t < tris; t++) {
    for (let k = 0; k < 3; k++) {
      const v = idx[t * 3 + k], i = v * 3;
      vn[i] += fn[t * 3]; vn[i + 1] += fn[t * 3 + 1]; vn[i + 2] += fn[t * 3 + 2];
    }
  }
  for (let i = 0; i < vc * 3; i += 3) {
    const l = Math.hypot(vn[i], vn[i + 1], vn[i + 2]);
    if (l > 0) { vn[i] /= l; vn[i + 1] /= l; vn[i + 2] /= l; }
  }
  const outPos = [], outNrm = [], remap = [];
  const outIdx = new Uint32Array(idx.length);
  const reused = new Int32Array(vc).fill(-1);
  let w = 0;
  for (let t = 0; t < tris; t++) {
    const fx = fn[t * 3], fy = fn[t * 3 + 1], fz = fn[t * 3 + 2];
    for (let k = 0; k < 3; k++) {
      const v = idx[t * 3 + k], i = v * 3;
      const dev = vn[i] * fx + vn[i + 1] * fy + vn[i + 2] * fz;
      if (dev < creaseDot) {
        outIdx[w++] = outPos.length / 3;
        outPos.push(pos[i], pos[i + 1], pos[i + 2]);
        outNrm.push(fx, fy, fz);
        remap.push(v);
      } else {
        let o = reused[v];
        if (o === -1) {
          o = outPos.length / 3; reused[v] = o;
          outPos.push(pos[i], pos[i + 1], pos[i + 2]);
          outNrm.push(vn[i], vn[i + 1], vn[i + 2]);
          remap.push(v);
        }
        outIdx[w++] = o;
      }
    }
  }
  return {
    positions: Float32Array.from(outPos),
    index: outIdx,
    normals: Float32Array.from(outNrm),
    remap: Int32Array.from(remap),
  };
}