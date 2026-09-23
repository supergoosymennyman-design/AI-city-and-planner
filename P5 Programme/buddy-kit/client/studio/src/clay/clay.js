// Clay Sculpting Studio — a finger-sculptable piece of clay.
//
// Integrated into the main 3D Studio: the Details panel's "Sculpt" button opens
// this overlay with ONLY the selected shape inside. You sculpt that shape's own
// geometry (Pull/Push/Smooth/Grab/Carve/Paint, Mirror, Undo). "✅ Done" hands
// the edited vertex positions back to the studio (which writes them into the
// shape); "✕ Cancel" discards the session.
//
// Ported from the throwaway feasibility spike `finger-sculpt-test.html`
// (2026-09-12). The sculpt engine works on ANY indexed or non-indexed
// geometry: the clay mesh is built from the shape's positions + index, the
// camera frames the shape's bounding sphere, and paint anchors to each vertex's
// original position (a `basePos` attribute) so colour stays glued to the clay.
import * as THREE from 'three';
import { prepareForSculpt, sharpenNormals } from './remesh.js';

const TOOLS = [
  ['pull', 'Pull ✋', 'Pull the surface out'],
  ['push', 'Push 👊', 'Push the surface in'],
  ['smooth', 'Smooth 🧼', 'Soften bumps'],
  ['grab', 'Grab ✊', 'Drag a lump around'],
  ['carve', 'Carve ✏️', 'Scratch a thin line'],
  ['paint', 'Paint 🎨', 'Colour that stays glued to the clay'],
];

const PAINT_COLORS = [
  '#26201b', '#c06a45', '#5a3a24', '#f8f9fa', '#00e5ff',
  '#ffc857', '#00ff9d', '#b388ff', '#ff7ad9', '#ff5c8a',
];

export function createClayStudio() {
  const root = document.getElementById('clay-app');
  const canvas = document.getElementById('clay-canvas');
  const mainEl = document.getElementById('clay-main');
  const hintEl = document.getElementById('clay-hint');
  const statsEl = document.getElementById('clay-stats');
  const toolsEl = document.getElementById('clay-tools');
  const sizeInput = document.getElementById('clay-size');
  const sizeLabel = document.getElementById('clay-size-label');

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060d1a);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 200);
  // A soft horizon grid — cheap way to feel the shape's scale and direction
  // without breaking the "only the shape is here" requirement.
  const grid = new THREE.GridHelper(6, 24, 0x1c4a66, 0x123a52);
  scene.add(grid);
  scene.add(new THREE.HemisphereLight(0xfff4e6, 0x8a7460, 1.05));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(2.5, 3.5, 2); scene.add(sun);
  const rim = new THREE.DirectionalLight(0xcfd8ff, 0.5); rim.position.set(-3, 1, -2.5); scene.add(rim);

  const geo = new THREE.BufferGeometry();
  // The brush works on the WELDED mesh `geo` (one shared vertex, no seam ghosts),
  // but a welded box corner has ONE vertex touching three faces — computeVertexNormals
  // would smooth it into a rounded-looking edge. So the SCREEN shows a sharpened COPY
  // (`renderGeo`) built by `rebuildRender`: creases are split back into per-face flat
  // normals, smooth areas stay shared. Coordinates are copied, never moved, so what
  // you sculpt is still exactly the welded mesh.
  const renderGeo = new THREE.BufferGeometry();
  const paintCanvas = document.createElement('canvas');
  paintCanvas.width = 1024; paintCanvas.height = 512;
  const pctx = paintCanvas.getContext('2d', { willReadFrequently: true });
  const paintTex = new THREE.CanvasTexture(paintCanvas);
  paintTex.colorSpace = THREE.SRGBColorSpace;
  paintTex.minFilter = THREE.LinearFilter; paintTex.magFilter = THREE.LinearFilter;
  paintTex.generateMipmaps = false;  // no mips: the atan seam would smear across mip selection
  const clayMat = new THREE.MeshStandardMaterial({ color: 0xc06a45, roughness: 0.62, metalness: 0 });
  clayMat.onBeforeCompile = shader => {
    shader.uniforms.paintMap = { value: paintTex };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', 'attribute vec3 basePos;\nvarying vec3 vBase;\n#include <common>')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBase = basePos;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', 'uniform sampler2D paintMap;\nvarying vec3 vBase;\n#include <common>')
      .replace('#include <map_fragment>', ['#include <map_fragment>',
        'vec3 bn = normalize(vBase);',
        'float pu = atan(bn.z, bn.x) / 6.2831853 + 0.5;',
        'float pv = 1.0 - acos(clamp(bn.y, -1.0, 1.0)) / 3.14159265;',
        'vec4 paintC = texture2D(paintMap, vec2(pu, pv));',
        'diffuseColor.rgb = mix(diffuseColor.rgb, paintC.rgb, paintC.a);'].join('\n'));
  };
  const clay = new THREE.Mesh(renderGeo, clayMat);
  scene.add(clay);
  // Invisible twin with the WORK geometry: raycasting it keeps hit faces pointing
  // at the welded indices the brush actually edits (the rendered mesh has extra
  // crease-split copies whose indices must never reach the brush).
  const workPick = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
  workPick.visible = false;
  scene.add(workPick);
  let P = null;                       // live position attribute
  let N = null;                       // live normal attribute
  let origPos = null;                 // the shape as it was when the session opened
  let basePosArr = null;              // paint anchors: original positions
  let vcount = 0;
  let adj = [];                       // vertex adjacency for Smooth
  let cX = 0, cY = 0, cZ = 0;         // shape centre in GEOMETRY space (mirror + paint)
  let T = { x: 0, y: 0, z: 0 };       // camera look-at target in WORLD space
  let R = 1;                          // shape radius

  // Build the clay mesh from everything-or-nothing geometry.
  function loadShape(positions, index) {
    // Every shape gets a sculptable makeover when it enters the studio: weld
    // coincident vertices (box corners, sphere seam/poles) so faces deform as
    // ONE closed surface, then midpoint-subdivide until the brush has enough
    // vertices to grab (a 8-vertex cube becomes an 8×8 grid per face). Doing the
    // welding halves and subdivision volume here keeps big/growing shapes
    // subtle: only the sculpt session sees the dense mesh.
    const prepared = prepareForSculpt(positions, index);
    const sp = prepared.positions;
    if (geo.index) { geo.setIndex(null); }
    geo.setAttribute('position', new THREE.BufferAttribute(sp.slice(), 3));
    if (prepared.index && prepared.index.length) geo.setIndex(new THREE.BufferAttribute(prepared.index.slice(), 1));
    else geo.setIndex(null);
    origPos = sp.slice();
    basePosArr = origPos;
    geo.setAttribute('basePos', new THREE.BufferAttribute(basePosArr.slice(), 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    P = geo.attributes.position;
    N = geo.attributes.normal;
    vcount = P.count;
    cX = geo.boundingSphere.center.x; cY = geo.boundingSphere.center.y; cZ = geo.boundingSphere.center.z;
    R = Math.max(0.05, geo.boundingSphere.radius);
    T = { x: cX, y: cY, z: cZ };
    // adjacency from index (or non-indexed face runs)
    adj = Array.from({ length: vcount }, () => new Set());
    const idxArr = geo.index ? geo.index.array : null;
    const step = idxArr ? idxArr.length : P.array.length / 3;
    for (let i = 0; i < step; i += 3) {
      const ia = idxArr ? idxArr[i] : i, ib = idxArr ? idxArr[i+1] : i+1, ic = idxArr ? idxArr[i+2] : i+2;
      adj[ia].add(ib).add(ic); adj[ib].add(ia).add(ic); adj[ic].add(ia).add(ib);
    }
    // vertex → its mirror partner across the shape's centre plane (x = cX), so
    // mirror sculpting stays symmetric. Built with a spatial hash (27-cell lookups)
    // instead of O(n²) scan so it stays cheap even on dense sculpt meshes.
    mirrorMap = new Int32Array(vcount);
    {
      const a = P.array;
      const Kv = 1e4;
      const key = (x, y, z) => Math.round(x * Kv) + ':' + Math.round(y * Kv) + ':' + Math.round(z * Kv);
      const cell = new Map();
      for (let i = 0; i < vcount; i++) {
        const k = key(a[i * 3], a[i * 3 + 1], a[i * 3 + 2]);
        let b = cell.get(k);
        if (!b) cell.set(k, (b = []));
        b.push(i);
      }
      for (let i = 0; i < vcount; i++) {
        const mx = -a[i * 3] + 2 * cX, my = a[i * 3 + 1], mz = a[i * 3 + 2];
        const qx = Math.round(mx * Kv), qy = Math.round(my * Kv), qz = Math.round(mz * Kv);
        let best = i, bd = Infinity;
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
          const list = cell.get((qx + dx) + ':' + (qy + dy) + ':' + (qz + dz));
          if (!list) continue;
          for (const j of list) {
            const d = Math.hypot(a[j * 3] - mx, a[j * 3 + 1] - my, a[j * 3 + 2] - mz);
            if (d < bd) { bd = d; best = j; }
          }
        }
        mirrorMap[i] = best;
      }
    }
    scene.add(grid); // ensure grid stays under the model
    grid.position.set(T.x, Math.min(T.y - R, 0), T.z);
    grid.scale.setScalar(Math.max(1, R));
    rebuildRender();
  }

  // Rebuild the display copy after any geometry edit: split creases for flat
  // shading, keep smooth regions shared, and duplicate the paint anchors to match
  // (basePosArr is the welded mesh's anchor; remap says which work row each
  // render row was copied from).
  function rebuildRender() {
    const idxArr = geo.index ? geo.index.array : null;
    const s = sharpenNormals(P.array, idxArr);
    renderGeo.setIndex(null);
    renderGeo.setAttribute('position', new THREE.BufferAttribute(s.positions, 3));
    renderGeo.setAttribute('normal', new THREE.BufferAttribute(s.normals, 3));
    renderGeo.setIndex(new THREE.BufferAttribute(s.index, 1));
    const n = s.positions.length / 3;
    const bp = new Float32Array(n * 3);
    const base = basePosArr || P.array;
    if (s.remap) {
      for (let r = 0; r < n; r++) { const v = s.remap[r] * 3; bp[r * 3] = base[v]; bp[r * 3 + 1] = base[v + 1]; bp[r * 3 + 2] = base[v + 2]; }
    }
    renderGeo.setAttribute('basePos', new THREE.BufferAttribute(bp, 3));
    renderGeo.computeBoundingSphere();
  }

  // ---- camera ----
  let theta = 0.5, phi = 1.25, dist = 3.0;
  function placeCamera() {
    const sp = Math.sin(phi), r = dist;
    camera.position.set(T.x + r*sp*Math.sin(theta), T.y + r*Math.cos(phi), T.z + r*sp*Math.cos(theta));
    camera.lookAt(T.x, T.y, T.z);
  }
  function resize() {
    const w = Math.max(1, mainEl.clientWidth), h = Math.max(1, mainEl.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  function fitClay() {
    const halfV = (45 / 2) * Math.PI / 180;
    const halfH = Math.atan(Math.tan(halfV) * (mainEl.clientWidth / Math.max(1, mainEl.clientHeight)));
    dist = R * 1.5 / Math.sin(Math.min(halfV, halfH));
    placeCamera();
  }

  // ---- brushes ----
  let brush = 'pull', mirror = false;
  const radius = () => (sizeInput.value / 100) * R;
  const STRENGTH = { pull: 0.022 * R, push: 0.022 * R, smooth: 0.42 };
  const falloff = d => { const x = 1 - d; return x*x*(3-2*x); };  // smoothstep on 1-d/r

  const undoStack = [];
  function snapshot(kind) {
    undoStack.push(kind === 'paint'
      ? { img: pctx.getImageData(0, 0, paintCanvas.width, paintCanvas.height) }
      : { pos: P.array.slice() });
    if (undoStack.length > 12) undoStack.shift();
  }
  function restoreEntry(s) {
    if (s.pos) { P.array.set(s.pos); P.needsUpdate = true; afterEdit(); }
    if (s.img) { pctx.putImageData(s.img, 0, 0); paintTex.needsUpdate = true; }
  }

  function gather(cx, cy, cz, r) {
    const out = [], a = P.array, r2 = r*r;
    for (let i = 0; i < vcount; i++) {
      const dx = a[i*3]-cx, dy = a[i*3+1]-cy, dz = a[i*3+2]-cz;
      const d2 = dx*dx + dy*dy + dz*dz;
      if (d2 < r2) out.push(i, falloff(Math.sqrt(d2)/r));
    }
    return out;
  }
  // determine which vertices a brush stroke touches: everything within reach of
  // the hit point PLUS the hit triangle itself. The triangle fallback means a
  // brush NEVER silently no-ops on low-poly shapes (e.g. a box's face interior).
  function brushWeights(hit) {
    const px = hit.point.x, py = hit.point.y, pz = hit.point.z, r = radius();
    const W = new Map();
    const set = gather(px, py, pz, r);
    for (let k = 0; k < set.length; k += 2) W.set(set[k], Math.max(W.get(set[k]) || 0, set[k+1]));
    const a = P.array;
    for (const v of [hit.face.a, hit.face.b, hit.face.c]) {
      const i = v*3;
      const d = Math.hypot(px-a[i], py-a[i+1], pz-a[i+2]);
      const w = Math.max(0.12, falloff(Math.min(1, d / r)));
      if (w > 0) W.set(v, Math.max(W.get(v) || 0, w));
    }
    return W;
  }
  function avgNormal(W) {
    const n = N.array; let nx = 0, ny = 0, nz = 0;
    for (const [v, w] of W) { const i = v*3; nx += n[i]*w; ny += n[i+1]*w; nz += n[i+2]*w; }
    const l = Math.hypot(nx, ny, nz) || 1;
    return { x: nx/l, y: ny/l, z: nz/l };
  }
  function offsetAll(W, ox, oy, oz) {
    const a = P.array;
    for (const [v, w] of W) {
      const i = v*3;
      a[i] += ox*w; a[i+1] += oy*w; a[i+2] += oz*w;
      if (mirror && mirrorMap) {
        const m = mirrorMap[v]*3;
        a[m] += -ox*w; a[m+1] += oy*w; a[m+2] += oz*w;
      }
    }
  }
  function applyPushPull(W, sign) {
    const n = avgNormal(W), s = STRENGTH.pull * sign;
    offsetAll(W, n.x*s, n.y*s, n.z*s);
  }
  function applySmooth(W) {
    const a = P.array;
    for (const [v, w] of W) {
      const i = v*3; let mx=0, my=0, mz=0, c=0;
      for (const nb of adj[v]) { const j = nb*3; mx+=a[j]; my+=a[j+1]; mz+=a[j+2]; c++; }
      const f = w * STRENGTH.smooth, k = c || 1;
      a[i] += (mx/k - a[i]) * f; a[i+1] += (my/k - a[i+1]) * f; a[i+2] += (mz/k - a[i+2]) * f;
      if (mirror && mirrorMap) {
        const m = mirrorMap[v]*3; let sx=0, sy=0, sz=0, sc=0;
        for (const nb of adj[v]) { const j = nb*3; sx+=a[j]; sy+=a[j+1]; sz+=a[j+2]; sc++; }
        const q = sc || 1;
        a[m] += (sx/q - a[m]) * f; a[m+1] += (sy/q - a[m+1]) * f; a[m+2] += (sz/q - a[m+2]) * f;
      }
    }
  }
  function applyCarve(W) {
    const n = avgNormal(W), s = -0.018 * R;
    const a = P.array;
    for (const [v, w] of W) {
      const i = v*3, k = w*w*s;
      a[i] += n.x*k; a[i+1] += n.y*k; a[i+2] += n.z*k;
      if (mirror && mirrorMap) {
        const m = mirrorMap[v]*3;
        a[m] += -n.x*k; a[m+1] += n.y*k; a[m+2] += n.z*k;
      }
    }
  }

  let paintColor = PAINT_COLORS[0], lastDir = null;
  function paintSplat(d) {
    const u = Math.atan2(d.z, d.x) / (2*Math.PI) + 0.5;
    const v = 1 - Math.acos(Math.max(-1, Math.min(1, d.y))) / Math.PI;
    const W = paintCanvas.width, H = paintCanvas.height;
    const ang = Math.max(0.035, radius() * 0.55);
    const ry = ang / Math.PI * H;
    const sinPol = Math.max(0.15, Math.sqrt(Math.max(0, 1 - d.y*d.y)));
    const rx = ang / (2*Math.PI) * W / sinPol;
    pctx.fillStyle = paintColor;
    for (const off of [-W, 0, W]) {
      pctx.beginPath(); pctx.ellipse(u*W + off, (1-v)*H, rx, ry, 0, 0, Math.PI*2); pctx.fill();
    }
  }
  function paintStrokeTo(bd) {
    const steps = lastDir ? Math.max(1, Math.ceil(lastDir.angleTo(bd) / (radius() * 0.3))) : 1;
    for (let i = 1; i <= steps; i++) {
      const q = (lastDir ? lastDir.clone().lerp(bd, i/steps) : bd.clone()).normalize();
      paintSplat(q);
      if (mirror) paintSplat(new THREE.Vector3(-q.x, q.y, q.z));
    }
    lastDir = bd.clone();
    paintTex.needsUpdate = true;
  }
  function baseDir(hit) {
    const f = hit.face, bp = basePosArr, a = P.array;
    const A = new THREE.Vector3().fromArray(a, f.a*3);
    const B = new THREE.Vector3().fromArray(a, f.b*3);
    const C = new THREE.Vector3().fromArray(a, f.c*3);
    const bc = new THREE.Vector3();
    THREE.Triangle.getBarycoord(hit.point, A, B, C, bc);
    return new THREE.Vector3(
      bc.x*bp[f.a*3]   + bc.y*bp[f.b*3]   + bc.z*bp[f.c*3],
      bc.x*bp[f.a*3+1] + bc.y*bp[f.b*3+1] + bc.z*bp[f.c*3+1],
      bc.x*bp[f.a*3+2] + bc.y*bp[f.b*3+2] + bc.z*bp[f.c*3+2]).normalize();
  }

  // Grab moves verts along a camera-facing plane.
  let grab = null;
  function applyGrabStep(dx, dy, dz) {
    const a = P.array;
    for (const g of grab.sets) {
      const list = g.list, mx = g.mx;
      for (let k = 0; k < list.length; k += 2) {
        const i = list[k]*3, w = list[k+1];
        a[i] += dx*w*mx; a[i+1] += dy*w; a[i+2] += dz*w;
      }
    }
  }
  function afterEdit() {
    P.needsUpdate = true;
    geo.computeVertexNormals();       // keep the brush's pull direction fresh...
    geo.computeBoundingSphere();
    rebuildRender();                  // ...while the screen shows the sharp copy
  }

  const raycaster = new THREE.Raycaster();
  const ptrs = new Map();
  let stroke = false, orbiting = false, pinchDist = 0;
  let mirrorMap = null;
  function ndc(e) {
    const r = canvas.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX-r.left)/r.width)*2-1, -((e.clientY-r.top)/r.height)*2+1);
  }
  function pick(e) {
    raycaster.setFromCamera(ndc(e), camera);
    const hit = raycaster.intersectObject(workPick, false);
    return hit.length ? hit[0] : null;
  }
  function planePoint(e) {
    raycaster.setFromCamera(ndc(e), camera);
    const q = new THREE.Vector3();
    return raycaster.ray.intersectPlane(grab.plane, q) ? q : null;
  }
  function mx(x) { return 2*cX - x; }   // mirror across the shape's centre
  function beginStroke(e, hit) {
    snapshot(brush === 'paint' ? 'paint' : 'geo'); stroke = true;
    const p = hit.point;
    if (brush === 'grab') {
      const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
      grab = { plane: new THREE.Plane().setFromNormalAndCoplanarPoint(fwd, p), sets: [] };
      const srcList = gather(p.x, p.y, p.z, radius());
      grab.sets.push({ list: srcList, mx: 1 });
      if (mirror) {
        if (mirrorMap && srcList.length) {
          const arr = [];
          for (let k = 0; k < srcList.length; k += 2) arr.push(mirrorMap[srcList[k]], srcList[k+1]);
          grab.sets.push({ list: arr, mx: -1 });
        } else {
          grab.sets.push({ list: gather(mx(p.x), p.y, p.z, radius()), mx: -1 });
        }
      }
      grab.prev = planePoint(e);
    } else sculptAt(hit);
  }
  function sculptAt(hit) {
    if (brush === 'paint')  { paintStrokeTo(baseDir(hit)); return; }
    const W = brushWeights(hit);
    if (!W.size) return;
    if (brush === 'pull')   applyPushPull(W,  1);
    if (brush === 'push')   applyPushPull(W, -1);
    if (brush === 'smooth') applySmooth(W);
    if (brush === 'carve')  applyCarve(W);
    afterEdit();
  }
  function onPointerDown(e) {
    e.preventDefault(); canvas.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x:e.clientX, y:e.clientY });
    if (ptrs.size === 2) {
      stroke = false; grab = null; lastDir = null; orbiting = true;
      const [a,b] = [...ptrs.values()]; pinchDist = Math.hypot(a.x-b.x, a.y-b.y);
      return;
    }
    if (e.button === 2) { orbiting = true; return; }
    const h = pick(e);
    if (h) beginStroke(e, h); else orbiting = true;
  }
  function onPointerMove(e) {
    const prev = ptrs.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    ptrs.set(e.pointerId, { x:e.clientX, y:e.clientY });
    if (ptrs.size === 2) {
      const [a,b] = [...ptrs.values()];
      const d = Math.hypot(a.x-b.x, a.y-b.y);
      dist *= pinchDist / (d || 1); pinchDist = d;
      theta -= dx * 0.0025; phi = Math.min(2.9, Math.max(0.25, phi - dy * 0.0025));
      placeCamera(); return;
    }
    if (orbiting) {
      theta -= dx * 0.005; phi = Math.min(2.9, Math.max(0.25, phi - dy * 0.005));
      placeCamera(); return;
    }
    if (!stroke) return;
    if (brush === 'grab' && grab) {
      const q = planePoint(e);
      if (q && grab.prev) { applyGrabStep(q.x-grab.prev.x, q.y-grab.prev.y, q.z-grab.prev.z); afterEdit(); grab.prev = q; }
    } else {
      const h = pick(e);
      if (h) sculptAt(h);
    }
  }
  function onPointerUp(e) {
    ptrs.delete(e.pointerId);
    if (ptrs.size === 0) { stroke = false; orbiting = false; grab = null; lastDir = null; }
    if (ptrs.size === 1) orbiting = true;
  }
  function onWheel(e) { e.preventDefault();
    const minD = R * 0.5, maxD = R * 14;
    dist *= e.deltaY > 0 ? 1.08 : 0.93;
    dist = Math.max(minD, Math.min(maxD, dist));
    placeCamera();
  }

  // ---- toolbar ----
  const toolBtns = [];
  for (const [name, label, tip] of TOOLS) {
    const btn = document.createElement('button');
    btn.className = 'clay-tool';
    btn.dataset.tool = name;
    btn.textContent = label;
    btn.title = tip;
    btn.addEventListener('click', () => setBrush(name));
    toolsEl.appendChild(btn);
    toolBtns.push(btn);
  }
  const paletteEl = document.getElementById('clay-palette');
  const swatchBtns = [];
  for (const c of PAINT_COLORS) {
    const sw = document.createElement('button');
    sw.className = 'clay-sw';
    sw.dataset.c = c;
    sw.style.background = c;
    sw.title = c;
    sw.addEventListener('click', () => {
      paintColor = c;
      for (const x of swatchBtns) x.classList.toggle('active', x === sw);
    });
    paletteEl.appendChild(sw);
    swatchBtns.push(sw);
  }
  function setBrush(name) {
    brush = name;
    for (const b of toolBtns) b.classList.toggle('active', b.dataset.tool === name);
    paletteEl.hidden = name !== 'paint';
  }
  sizeInput.addEventListener('input', () => { sizeLabel.textContent = sizeInput.value + '%'; });
  // Mirror is a segmented Off/On control (Off by default — see HIDDEN-FEATURES
  // §clay). Each button flips the flag; `active` highlights the live choice.
  const mirrorOff = document.querySelector('#clay-mirror [data-m="off"]');
  const mirrorOn = document.querySelector('#clay-mirror [data-m="on"]');
  function syncMirror() {
    mirrorOff.classList.toggle('active', !mirror);
    mirrorOn.classList.toggle('active', mirror);
    mirrorOff.setAttribute('aria-pressed', String(!mirror));
    mirrorOn.setAttribute('aria-pressed', String(mirror));
  }
  mirrorOff.addEventListener('click', () => { mirror = false; syncMirror(); });
  mirrorOn.addEventListener('click', () => { mirror = true; syncMirror(); });
  document.getElementById('clay-undo').addEventListener('click', () => {
    const s = undoStack.pop();
    if (s) restoreEntry(s);
  });
  const confirmOverlay = document.getElementById('clay-confirm');
  const confirmMessage = document.getElementById('clay-confirm-message');
  document.getElementById('clay-reset').addEventListener('click', () => {
    confirmMessage.textContent = 'Reset this shape? Your sculpting and paint will be lost.';
    confirmOverlay.classList.add('show');
  });
  document.getElementById('clay-confirm-yes').addEventListener('click', () => {
    undoStack.length = 0;
    P.array.set(origPos); P.needsUpdate = true; afterEdit();
    pctx.clearRect(0, 0, paintCanvas.width, paintCanvas.height); paintTex.needsUpdate = true;
    confirmOverlay.classList.remove('show');
  });
  document.getElementById('clay-confirm-no').addEventListener('click', () => confirmOverlay.classList.remove('show'));
  document.getElementById('clay-help-btn').addEventListener('click', () => document.getElementById('clay-help').classList.add('show'));
  document.getElementById('clay-help-close').addEventListener('click', () => document.getElementById('clay-help').classList.remove('show'));
  // ---- loop ----
  let running = false, rafId = 0;
  let frames = 0, last = performance.now(), fps = 0;
  function loop() {
    if (!running) return;
    rafId = requestAnimationFrame(loop);
    renderer.render(scene, camera);
    frames++;
    const now = performance.now();
    if (now - last > 500) {
      fps = Math.round(frames*1000/(now-last)); frames = 0; last = now;
      statsEl.textContent = fps + ' fps · ' + vcount.toLocaleString() + ' points';
    }
  }

  // ---- lifecycle ----
  let onDone = null, onCancel = null;
  function open(state, cb, opts) {
    if (running) close();
    loadShape(state.positions, state.index || null);
    T = { x: cX, y: cY, z: cZ };
    onDone = cb.onDone; onCancel = cb.onCancel;
    hintEl.textContent = `🧱 Sculpting "${state.name}" — one finger sculpts, one finger on the background turns, pinch zooms.`;
    undoStack.length = 0;
    pctx.clearRect(0, 0, paintCanvas.width, paintCanvas.height); paintTex.needsUpdate = true;
    setBrush('pull');
    mirror = false; syncMirror();
    sizeInput.value = 26; sizeLabel.textContent = '26%';
    root.hidden = false;    // show BEFORE measuring so the canvas has real size
    resize(); fitClay();
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('resize', resize);
    running = true;
    rafId = requestAnimationFrame(loop);
  }
  function close() {
    running = false;
    cancelAnimationFrame(rafId);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerUp);
    canvas.removeEventListener('wheel', onWheel);
    window.removeEventListener('resize', resize);
    root.hidden = true;
    onDone = null; onCancel = null;
  }
  function finish(keep) {
    const cb = keep ? onDone : onCancel;
    close();
    if (cb) cb();
  }
  document.getElementById('clay-done').addEventListener('click', () => finish(true));
  document.getElementById('clay-cancel').addEventListener('click', () => finish(false));

  return {
    isOpen: () => running,
    open,
    close,
    currentPositions: () => P ? P.array.slice() : null,
    currentIndex: () => (geo.index ? geo.index.array : null),
    currentBasePositions: () => (geo.attributes.basePos ? geo.attributes.basePos.array : null),
    canvas,
    api: {
      verts: () => vcount,
      fps: () => fps,
      brush: () => brush,
      setBrush,
      /** The whole result of the session — the SHARPENED (crease-split) render
       * topology + the paint anchors — for writing back into the studio shape.
       * Handing out the render copy is what keeps box edges crisp after Done:
       * the scene's computeVertexNormals keeps the split corners flat and the
       * shared surfaces smooth. */
      geometry() {
        return {
          positions: renderGeo.attributes.position.array,
          index: renderGeo.index ? renderGeo.index.array : null,
          basePos: renderGeo.attributes.basePos.array,
        };
      },
      maxDisplacement() {
        const a = P.array; let m = 0;
        for (let i = 0; i < vcount; i++) {
          const dx=a[i*3]-origPos[i*3], dy=a[i*3+1]-origPos[i*3+1], dz=a[i*3+2]-origPos[i*3+2];
          const d = dx*dx+dy*dy+dz*dz; if (d > m) m = d;
        }
        return Math.sqrt(m);
      },
      paintCoverage() {
        const d = pctx.getImageData(0, 0, paintCanvas.width, paintCanvas.height).data;
        let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n++;
        return n / (d.length / 4);
      },
      paintData() {
        return {
          width: paintCanvas.width,
          height: paintCanvas.height,
          pixels: pctx.getImageData(0, 0, paintCanvas.width, paintCanvas.height).data.slice(),
        };
      },
    },
    debug: {
      pickAt(clientX, clientY) {
        const e = { clientX, clientY };
        const h = pick(e);
        return h ? { frame: h.face.frame, x: +h.point.x.toFixed(3), y: +h.point.y.toFixed(3), z: +h.point.z.toFixed(3) }
                 : null;
      },
      sculptOnce(clientX, clientY) {
        const h = pick({ clientX, clientY });
        if (!h) return null;
        sculptAt(h);
        return [+h.point.x.toFixed(3), +h.point.y.toFixed(3), +h.point.z.toFixed(3), brush];
      },
      weightsAt(clientX, clientY) {
        const h = pick({ clientX, clientY });
        if (!h) return { hit: null };
        const W = brushWeights(h);
        const entries = [...W.entries()];
        const a = P.array;
        return {
          hit: [+h.point.x, +h.point.y, +h.point.z],
          r: radius(),
          strength: STRENGTH.pull,
          weights: entries.map(([v, w]) => ({ v, pos: [a[v*3], a[v*3+1], a[v*3+2]], w })),
          avg: avgNormal(W),
        };
      },
      state: () => ({ T: { ...T }, R, dist, phi, theta, cX, cY, cZ, brush, vcount, mirror }),
      renderState: () => ({
        workVerts: vcount,
        renderVerts: renderGeo.attributes.position.count,
        renderTris: renderGeo.index ? renderGeo.index.count / 3 : 0,
        distinctNormals: (() => {
          const seen = new Set(), n = renderGeo.attributes.normal.array;
          for (let i = 0; i < n.length; i += 3) {
            seen.add([n[i], n[i + 1], n[i + 2]].map((c) => c.toFixed(4)).join(','));
          }
          return seen.size;
        })(),
      }),
    },
  };
}