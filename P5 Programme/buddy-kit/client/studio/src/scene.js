import * as THREE from 'three';
import { Emitter } from './emitter.js';
import { JointRig } from './rig/bones.js';
import { remapSkinIndex } from './rig/bind.js';
import { takeSnapshot, restoreSnapshot } from './edit/snapshot.js';
import { cloneMaterial, disposeMaterial } from './edit/material-ops.js';

const SELECT_OUTLINE = 0x00e5ff; // member outline (neon cyan)
const SELECT_PRIMARY_OUTLINE = 0x7ff9ff; // current/main outline (bright cyan)
const world = new THREE.Vector3();

const PRIMITIVES = {
  box: () => new THREE.BoxGeometry(1, 1, 1),
  sphere: () => new THREE.SphereGeometry(0.5, 32, 24),
  cylinder: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 32),
  cone: () => new THREE.ConeGeometry(0.5, 1, 32),
  torus: () => new THREE.TorusGeometry(0.4, 0.16, 16, 48),
  octahedron: () => new THREE.OctahedronGeometry(0.6),
  plane: () => new THREE.PlaneGeometry(1, 1),
};

const PALETTE = [
  0xff6b6b, 0xff922b, 0xfcc419, 0x51cf66, 0x22b8cf, 0x4dabf7, 0x9775fa, 0xf06595, 0xf8f9fa, 0x495057,
];
let paletteIndex = 0;
let nextId = 1;

const TORUS_DEFAULTS = { radius: 0.4, tube: 0.16, radialSegments: 16, tubularSegments: 48 };

export function makeTorus(p) {
  return new THREE.TorusGeometry(p.radius, p.tube, p.radialSegments, p.tubularSegments);
}

// A slightly-larger back-facing copy renders as an outline around the object's
// silhouette, leaving the object's own colours visible. Every outline is a
// group-level SIBLING (never a child of the mesh), so it is NOT deep-cloned into
// duplicates by Object3D.clone. Thickness is a FIXED ABSOLUTE padding in world
// units (`outlinePad`), added on top of the object's own scale each frame — so the
// outline neither thickens when the shape is scaled nor thins to nothing at tiny
// sizes; it is a constant world-space ring around the object. A skinned source
// gets a proportionate skinned outline so the outline deforms with the skeleton
// instead of lagging as a rigid shell.
const OUTLINE_PAD = 0.05;
const _parentInverse = new THREE.Matrix4(); // scratch — parent's world inverse
const _outlineMatrix = new THREE.Matrix4();
const _outlinePos = new THREE.Vector3();
const _outlineQuat = new THREE.Quaternion();
const _outlineScale = new THREE.Vector3(); // scratch — decompose target (object world scale)

const _geoHalf = new THREE.Vector3(); // scratch — object geometry half-extents
const _geoCenter = new THREE.Vector3(); // scratch — object geometry centre (pivot-offset anchor)
const _tmpVec = new THREE.Vector3(); // scratch — outline centre re-anchor

// ---- Clay paint bake helpers ----
let paintKeyCounter = 0;

/** Build a Sampler-friendly CanvasTexture from raw equirect RGBA pixels. */
function canvasTextureFromPixels(paint) {
  const c = document.createElement('canvas');
  c.width = paint.width; c.height = paint.height;
  const ctx = c.getContext('2d');
  ctx.putImageData(new ImageData(new Uint8ClampedArray(paint.pixels), paint.width, paint.height), 0, 0);
  return bakeCanvasTexture(c);
}

function pixelsToDataUrl(paint) {
  const c = document.createElement('canvas');
  c.width = paint.width; c.height = paint.height;
  const ctx = c.getContext('2d');
  ctx.putImageData(new ImageData(new Uint8ClampedArray(paint.pixels), paint.width, paint.height), 0, 0);
  return c.toDataURL('image/jpeg', 0.9);
}

function loadPaintImage(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      resolve(bakeCanvasTexture(c));
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

function bakeCanvasTexture(c) {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;  // no mips: the atan seam would smear across mip selection
  return tex;
}

/** Equirect-overlay shader snippet shared by the clay editor and baked paint
 * (glued to each vertex's original `basePos` direction). */
function paintShaderFor(tex) {
  return (shader) => {
    shader.uniforms.paintMap = { value: tex };
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
}

/** The object geometry's half-size per axis, in OBJECT-local units. This is what
 * gets scaled by the object's transform to produce the world silhouette; dividing
 * `pad` by it converts the absolute padding into the additive local scale needed. */
function outlineGeoHalf(mesh) {
  _geoHalf.set(1, 1, 1);
  if (!mesh.geometry) return _geoHalf;
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
  mesh.geometry.boundingBox.getSize(_geoHalf).multiplyScalar(0.5);
  return _geoHalf;
}

function createOutline(mesh, color, pad) {
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, depthWrite: false });
  if (mesh.isSkinnedMesh && mesh.skeleton) {
    // A skinned outline is bound to the SAME skeleton so it deforms with the bones.
    // The source's own node scale (set by a gizmo drag) is folded in later via
    // syncOutlinePosition, which re-binds the shell at the current world scale so
    // the outline hugs the object's ACTUAL silhouette instead of a fixed constant.
    const outline = new THREE.SkinnedMesh(mesh.geometry.clone(), mat);
    outline.userData.isOutline = true;
    outline.userData.outlinesSource = mesh;
    outline.userData.outlinePad = pad || OUTLINE_PAD;
    outline.userData.outlineHalf = outlineGeoHalf(mesh).clone();
    outline.userData.outlineScaleKey = null;
    outline.bindMode = THREE.DetachedBindMode;
    mesh.parent.add(outline);
    outline.updateMatrixWorld(true);
    outline.bind(mesh.skeleton, outline.matrixWorld.clone());
    return outline;
  }
  const outline = new THREE.Mesh(mesh.geometry.clone(), mat);
  outline.userData.isOutline = true;
  outline.userData.outlinesSource = mesh;
  outline.userData.outlinePad = pad || OUTLINE_PAD;
  outline.userData.outlineHalf = outlineGeoHalf(mesh).clone();
  if (mesh.geometry.boundingBox) {
    _geoCenter.copy(mesh.geometry.boundingBox.getCenter(new THREE.Vector3()));
  } else {
    _geoCenter.set(0, 0, 0);
  }
  // A GLB gear mesh often isn't centred on its own local origin (its pivot is
  // offset, e.g. seated against a socket). Enlarging such a geometry by a uniform
  // scale factor grows it around the ORIGIN, which shifts the enlarged centre away
  // from the source's — the outline then sits slightly off and reads as a second,
  // slightly-displaced copy. Record the geometry's local centre so syncOutlinePosition
  // can re-anchor the enlarged shell on the source's true centre.
  outline.userData.outlineCenter = _geoCenter.clone();
  return outline;
}

/** Re-bind a skinned outline at the source mesh's CURRENT world scale so the shell
 * is scaled to match, plus a constant world-space pad. Bones still deform it
 * identically; only the frozen-at-bind node scale needed refreshing. */
function rebindSkinnedOutline(outline, mesh, wScale) {
  const pad = outline.userData.outlinePad || OUTLINE_PAD;
  const h = outline.userData.outlineHalf || _geoHalf;
  const s = new THREE.Vector3(
    wScale.x + pad / (h.x > 1e-4 ? h.x : 1),
    wScale.y + pad / (h.y > 1e-4 ? h.y : 1),
    wScale.z + pad / (h.z > 1e-4 ? h.z : 1),
  );
  outline.scale.copy(s);
  outline.updateMatrixWorld(true);
  outline.bind(outline.skeleton, outline.matrixWorld.clone());
}

/** Refresh an outline to hug its source mesh. For a plain mesh the outline copies
 * the source's world position, rotation AND scale, then adds a FIXED world-space
 * padding (converted to local scale via the object's geometry half-size) on every
 * axis — so the outline hugs the object's silhouette at a constant thickness no
 * matter how the shape is scaled. A skinned outline keeps its bound constant scale
 * and copies the source node's position/rotation only (the bones do the scaling).
 * Called each frame. */
function syncOutlinePosition(outline, mesh) {
  if (!mesh || !mesh.parent || !outline) return;
  mesh.updateMatrixWorld(true, true);
  // The shell lives as a SIBLING of the source (under the same bone / gear group).
  // Copying the source's absolute WORLD matrix straight into the shell's LOCAL
  // transform re-bakes the parent transform a second time whenever that parent is
  // not the identity scene root — e.g. a gear leaf bound under a bone, or any
  // shape bound into a non-identity rig — so the outline lands at 2x the sibling's
  // offset. Express the shell in its parent's LOCAL frame instead, so the parent
  // transform is applied exactly once. Identity-root parents keep the old path.
  const parent = outline.parent;
  let nonIdentityParent = !!parent && !!parent.matrixWorld;
  if (nonIdentityParent) {
    const e = parent.matrixWorld.elements;
    nonIdentityParent =
      e[0] !== 1 || e[1] !== 0 || e[2] !== 0 || e[3] !== 0 ||
      e[4] !== 0 || e[5] !== 1 || e[6] !== 0 || e[7] !== 0 ||
      e[8] !== 0 || e[9] !== 0 || e[10] !== 1 || e[11] !== 0 ||
      e[12] !== 0 || e[13] !== 0 || e[14] !== 0 || e[15] !== 1;
  }
  if (nonIdentityParent) {
    _parentInverse.copy(parent.matrixWorld).invert();
    _outlineMatrix.copy(mesh.matrixWorld).premultiply(_parentInverse);
  } else {
    _outlineMatrix.copy(mesh.matrixWorld);
  }
  _outlineMatrix.decompose(_outlinePos, _outlineQuat, _outlineScale);
  outline.position.copy(_outlinePos);
  outline.quaternion.copy(_outlineQuat);
  if (outline.isSkinnedMesh) {
    // Re-bind only when the source node's scale actually changed (bones deform the
    // shell each frame, so only the node scale can drift from the bound value).
    const key = `${_outlineScale.x.toFixed(3)},${_outlineScale.y.toFixed(3)},${_outlineScale.z.toFixed(3)}`;
    if (outline.userData.outlineScaleKey !== key) {
      outline.userData.outlineScaleKey = key;
      rebindSkinnedOutline(outline, mesh, _outlineScale);
    }
  } else {
    const pad = outline.userData.outlinePad || OUTLINE_PAD;
    const h = outline.userData.outlineHalf;
    outline.scale.set(
      _outlineScale.x + pad / (h.x > 1e-4 ? h.x : 1),
      _outlineScale.y + pad / (h.y > 1e-4 ? h.y : 1),
      _outlineScale.z + pad / (h.z > 1e-4 ? h.z : 1),
    );
    // Re-anchor a pivot-offset source: enlarging its geometry around the origin
    // moved the shell's centre by pad/h * (geometryCentre) — i.e. the growth
    // `pad` applied at the pivot's leverage point — rotated into the shell frame.
    // Reversing that keeps the outline concentric on the gear's own centre.
    if (outline.userData.outlineCenter) {
      _tmpVec.copy(outline.userData.outlineCenter);
      _tmpVec.set(
        _tmpVec.x * pad / (h.x > 1e-4 ? h.x : 1),
        _tmpVec.y * pad / (h.y > 1e-4 ? h.y : 1),
        _tmpVec.z * pad / (h.z > 1e-4 ? h.z : 1),
      );
      _tmpVec.applyQuaternion(outline.quaternion);
      outline.position.sub(_tmpVec);
    }
  }
  outline.updateMatrixWorld(true, true);
}

/** A skinned mesh's geometry as drawn (its current pose), expressed in `parent`'s local frame: the
 * skin is collapsed exactly as the GPU would draw it, then moved into the parent's frame. */
function bakeSkinnedToParent(mesh, parent) {
  const geom = mesh.geometry.clone();
  mesh.updateWorldMatrix(true, false);
  parent.updateWorldMatrix(true, false);
  const toParent = new THREE.Matrix4().copy(parent.matrixWorld).invert().multiply(mesh.matrixWorld);
  const pos = geom.attributes.position;
  const ia = mesh.geometry.attributes.skinIndex && mesh.geometry.attributes.skinIndex.array;
  const wa = mesh.geometry.attributes.skinWeight && mesh.geometry.attributes.skinWeight.array;
  const bones = mesh.skeleton && mesh.skeleton.bones;
  if (ia && wa && bones && bones.length) {
    const bindInv = mesh.bindMatrixInverse;
    const bindM = mesh.bindMatrix;
    const boneMats = bones.map((b, i) => new THREE.Matrix4().multiplyMatrices(b.matrixWorld, mesh.skeleton.boneInverses[i]));
    const tmp = new THREE.Vector3();
    const acc = new THREE.Vector3();
    const M = new THREE.Matrix4();
    for (let v = 0; v < pos.count; v++) {
      acc.set(0, 0, 0);
      let total = 0;
      for (let k = 0; k < 4; k++) {
        const w = wa[v * 4 + k] || 0;
        if (!w) continue;
        const b = ia[v * 4 + k] || 0;
        if (!boneMats[b]) continue;
        M.multiplyMatrices(bindInv, boneMats[b]).multiply(bindM);
        tmp.set(pos.getX(v), pos.getY(v), pos.getZ(v)).applyMatrix4(M).multiplyScalar(w);
        acc.add(tmp);
        total += w;
      }
      if (total === 0) acc.set(pos.getX(v), pos.getY(v), pos.getZ(v));
      pos.setXYZ(v, acc.x, acc.y, acc.z);
    }
    pos.needsUpdate = true;
  }
  geom.applyMatrix4(toParent);
  geom.deleteAttribute('skinIndex');
  geom.deleteAttribute('skinWeight');
  geom.computeVertexNormals();
  geom.computeBoundingBox();
  geom.computeBoundingSphere();
  return geom;
}

export class StudioScene extends Emitter {
  constructor() {
    super();
    this.threeScene = new THREE.Scene();
    this.threeScene.background = new THREE.Color(0x060d1a);
    this.group = new THREE.Group();
    this.group.name = 'DocumentRoot';
    this.threeScene.add(this.group);
    this.selected = null;
    this.lastShape = null;
    this.selection = new Set();
    this.selectedJoints = new Set();
    this.outlines = new Map();
    this.rig = null;
    this.mode = 'build';
    this.undoStack = [];
    this.redoStack = [];
  }

  get shapes() {
    const out = [];
    this.group.traverse((o) => {
      if (
        o.isMesh &&
        !o.userData.isJointBall &&
        !o.userData.isSkeletonHelper &&
        !o.userData.isOutline
      ) {
        out.push(o);
      }
    });
    return out;
  }

  addPrimitive(kind, color, opts = {}) {
    const geometry = PRIMITIVES[kind]();
    const material = new THREE.MeshStandardMaterial({
      color: color ?? PALETTE[paletteIndex++ % PALETTE.length],
      roughness: 0.6,
      metalness: 0.1,
      // DoubleSide: primitive normals can be flipped by negative-scale edits, which
      // otherwise makes one face of a torus (or any shape) render transparent.
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `${kind}-${this.shapes.length + 1}`;
    mesh.userData.kind = kind;
    mesh.userData.id = nextId++;
    if (kind === 'torus') mesh.userData.torus = { ...TORUS_DEFAULTS };
    if (kind === 'plane') {
      mesh.rotation.x = -Math.PI / 2;
    } else {
      geometry.computeBoundingBox();
      mesh.position.y = -geometry.boundingBox.min.y;
    }
    this.group.add(mesh);
    if (!opts.silent) {
      this.select(mesh);
      this.emit('changed');
    }
    return mesh;
  }

  setTorusTube(mesh, tube) {
    if (!mesh || mesh.userData.kind !== 'torus') return;
    // The skin covers the OLD vertices; drop it and let the rig recompute it.
    if (this.rig && this.rig.owns(mesh)) mesh = this.rig.unskinMesh(mesh);
    const p = mesh.userData.torus;
    const clamped = Math.min(Math.max(tube, 0.01), p.radius - 0.01);
    p.tube = clamped;
    mesh.geometry.dispose();
    mesh.geometry = makeTorus(p);
    this.emit('changed');
    return clamped;
  }

  /** Write sculpted geometry back into a shape. The Clay Studio edits a COPY —
   * and that copy is WELDED + SUBDIVIDED (see src/clay/remesh.js), so it usually
   * has more vertices and a shared index than the live shape. When the studio
   * hands back an index, the shape's geometry is REPLACED wholesale (position +
   * index, basePos). With no index it falls back to the legacy in-place position
   * overwrite (topology untouched). Either way vertices, normals and bounds are
   * recomputed and the shape is flagged custom so snapshots persist the geometry.
   * A rigged shape drops its skin first — the rig recomputes it (task 014) — so the
   * shape that comes back may be a NEW object in the old one's place. */
  setSculptedResult(mesh, positions, index = null, paint = null, basePositions = null) {
    if (!mesh || !mesh.isMesh || !mesh.geometry || !positions) return mesh;
    if (this.rig && this.rig.owns(mesh)) mesh = this.rig.unskinMesh(mesh);
    const old = mesh.geometry;
    let geo = old;
    let replaced = false;
    if (index && index.length) {
      replaced = true;
      geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
      geo.setIndex(new THREE.BufferAttribute(new Uint32Array(index), 1));
      if (basePositions && basePositions.length === positions.length) {
        geo.setAttribute('basePos', new THREE.BufferAttribute(new Float32Array(basePositions), 3));
      }
    } else {
      const att = old.attributes.position;
      if (!att || positions.length !== att.count * 3) return mesh;
      att.array.set(positions);
      att.needsUpdate = true;
    }
    if (replaced && old !== geo) {
      mesh.geometry?.dispose?.();
      mesh.geometry = geo;
    }
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    if (paint) {
      if (!geo.attributes.basePos) {
        const base = basePositions || positions;
        geo.setAttribute('basePos', new THREE.BufferAttribute(Float32Array.from(base), 3));
      }
      this.bakePaint(mesh, paint);
    } else {
      this.removePaint(mesh);
    }
    mesh.userData.kind = 'custom';
    mesh.userData.sculpted = true;
    mesh.userData.geoCustom = true;
    this.emit('changed');
    return mesh;
  }

  /** Paint the Clay Studio's equirect map onto a shape: a `basePos`-driven
   * overlay material, the same technique the clay editor uses, so colour stays
   * glued to the surface however the shape later deforms. `paint` is either
   * { width, height, pixels } (live session — applied synchronously) or
   * { width, height, dataUrl } (persisted — applied async, a beat later). */
  bakePaint(mesh, paint) {
    // The paint overlay rewrites ONE material's shader. A multi-material (generated, textured)
    // mesh has no basePos anyway, but guard the shape too so it can never write to the Array.
    if (!mesh || !mesh.isMesh || !paint || !mesh.geometry.attributes.basePos) return;
    if (Array.isArray(mesh.material)) return;
    const tex = paint.pixels ? canvasTextureFromPixels(paint) : null;
    const apply = (t) => {
      if (!t) return;
      const mat = mesh.material && mesh.material.isMeshStandardMaterial
        ? mesh.material.clone()
        : mesh.material;
      if (!mat) return;
      mat.onBeforeCompile = paintShaderFor(t);
      // onBeforeCompile injects an unmanaged `paintMap` uniform, so each painted
      // material needs its OWN program slot or identical programs would share (and
      // cross-contaminate) the texture.
      mat.customProgramCacheKey = () => 'clay-paint-' + (mat._paintKey || (mat._paintKey = ++paintKeyCounter));
      mat.userData.paintTexture = t;
      mat.needsUpdate = true;
      mesh.material = mat;
      mesh.userData.paint = paint.pixels
        ? { width: paint.width, height: paint.height, dataUrl: pixelsToDataUrl(paint) }
        : { width: paint.width, height: paint.height, dataUrl: paint.dataUrl };
    };
    if (tex) apply(tex); // live: trivial async gap = one microtask
    else loadPaintImage(paint.dataUrl).then(apply); // persisted: decode, then apply
  }

  /** Strip a previously baked paint, returning the shape to its own colours. */
  removePaint(mesh) {
    if (!mesh || !mesh.isMesh || !mesh.material) return;
    if (Array.isArray(mesh.material)) { delete mesh.userData.paint; return; }
    if (mesh.material.userData.paintTexture) {
      const plain = mesh.material.clone();
      plain.onBeforeCompile = null;
      delete plain.customProgramCacheKey;
      plain.userData.paintTexture = null;
      plain.needsUpdate = true;
      mesh.material = plain;
    }
    delete mesh.userData.paint;
  }

  addImported(obj) {
    obj.traverse((o) => {
      if (o.isMesh) {
        o.userData.id = nextId++;
        o.userData.imported = true;
        if (!o.name) o.name = 'imported';
      }
    });
    obj.userData.imported = true;
    this.group.add(obj);
    this.emit('changed');
    return obj;
  }

  duplicate(mesh) {
    let copy = mesh.clone();
    copy.geometry = mesh.geometry.clone();
    copy.material = cloneMaterial(mesh.material);
    copy.userData = {
      ...mesh.userData,
      id: nextId++,
      imported: false,
      rigSkin: false,
      // Copies are editable local shapes, but still need the imported vertices
      // in snapshots; clearing imported must not make them disappear on reload.
      geoCustom: !!(mesh.userData.geoCustom || mesh.userData.imported),
      // torus params are an object — deep-copy so copies stay independent.
      torus: mesh.userData.torus ? { ...mesh.userData.torus } : undefined,
    };
    if (copy.isSkinnedMesh) {
      const plain = new THREE.Mesh(copy.geometry, copy.material);
      plain.name = mesh.name + '-copy';
      plain.userData = copy.userData;
      plain.position.copy(copy.position);
      plain.rotation.copy(copy.rotation);
      plain.scale.copy(copy.scale);
      copy.geometry.dispose();
      disposeMaterial(copy.material);
      copy = plain;
    } else {
      copy.name = `${mesh.name}-copy`;
    }
    copy.position.x += 1;
    this.group.add(copy);
    this.select(copy);
    this.emit('changed');
    return copy;
  }

  remove(mesh) {
    if (this.selected === mesh) this.select(null);
    this.selection.delete(mesh);
    mesh.removeFromParent();
    // A shape takes its joints with it (task 014): a joint whose shape is gone has no frame to live
    // in, and the rig treats one as a programming error. The subtrees go too (spec §1).
    if (this.rig) this.rig.dropShape(mesh);
    mesh.geometry?.dispose();
    disposeMaterial(mesh.material);
    this.emit('changed');
  }

  // Restore a whole (possibly multi-) selection at once, used by Undo/Redo.
  setSelection(meshes, primary) {
    this.selection.clear();
    this.selectedJoints.clear();
    for (const m of meshes) {
      if (m && m.isMesh && !m.userData.isJointBall && m.parent) this.selection.add(m);
    }
    this.selected = primary || (this.selection.size ? [...this.selection][this.selection.size - 1] : null);
    if (this.selected && this.selected.isMesh) this.lastShape = this.selected;
    this.syncHighlights();
    this.emit('select', this.selected);
    return this.selected;
  }

  select(obj, additive = false) {
    // Joint balls / bones: additive accumulates a JOINT multi-selection that can
    // coexist with the shape multi-selection (so "pick a few limbs + one joint",
    // then Attach/Detach works on all of them). Non-additive clears everything.
    if (obj && obj.isBone) {
      if (additive) {
        if (this.selectedJoints.has(obj)) {
          this.selectedJoints.delete(obj);
          if (this.selected === obj) {
            const rest = [...this.selectedJoints];
            this.selected = rest.length ? rest[rest.length - 1] : this.lastShape || null;
          }
        } else {
          this.selectedJoints.add(obj);
          this.selected = obj;
        }
        this.syncHighlights();
        this.emit('select', this.selected);
        return;
      }
      this.selection.clear();
      this.selectedJoints.clear();
      this.selected = obj;
      this.syncHighlights();
      this.emit('select', this.selected);
      return;
    }
    if (additive && obj && obj.isMesh && !obj.userData.isJointBall) {
      const removing = this.selection.has(obj);
      if (removing) {
        // Deselecting must NOT move the "current" (main) selection glow. Only if
        // the deselected shape WAS the current one do we fall back to another
        // selected shape (the most recently added), or to nothing.
        this.selection.delete(obj);
        if (this.selected === obj) {
          const rest = [...this.selection];
          this.selected = rest.length ? rest[rest.length - 1] : null;
        }
      } else {
        this.selection.add(obj);
        this.selected = obj;
        if (obj.isMesh) this.lastShape = obj;
      }
      this.syncHighlights();
      this.emit('select', this.selected);
      return;
    }
    this.selection.clear();
    this.selectedJoints.clear();
    this.selected = obj || null;
    if (obj && obj.isMesh) {
      this.selection.add(obj);
      this.lastShape = obj;
    }
    this.syncHighlights();
    this.emit('select', this.selected);
  }

  syncHighlights() {
    // Remove every existing outline (they are recreated on each selection change).
    for (const outline of this.outlines.values()) {
      outline.removeFromParent();
      outline.geometry.dispose();
      outline.material.dispose();
    }
    this.outlines.clear();

    // Outline every selected shape so its own colours stay visible. The primary
    // gets a brighter outline, members a slimmer one. Gear pieces are SKIPPED:
    // their complex geometry makes the back-facing shell unreliable (it reads as a
    // displaced, mostly-covering duplicate), and they're selected via the Fit panel
    // anyway.
    for (const m of this.selection) {
      if (!m.isMesh) continue;
      if (m.userData && m.userData.isGear) continue;
      const primary = m === this.selected;
      // Outlines are siblings parented to wherever the mesh currently lives, so
      // they survive re-parenting (e.g. a shape bound to a bone moves under
      // rig.root). Note: a blank/empty selection still needs per-frame sync.
      m.updateMatrixWorld(true, true);
      const outline = createOutline(m, primary ? SELECT_PRIMARY_OUTLINE : SELECT_OUTLINE, primary ? 0.06 : OUTLINE_PAD);
      if (m.parent) m.parent.add(outline);
      syncOutlinePosition(outline, m);
      this.outlines.set(m, outline);
    }

    // Outline every selected JOINT ball so a multi-selection that mixes limbs and
    // joints is visible (the primary joint also recolours via main.js).
    for (const j of this.selectedJoints) {
      if (!j || !j.isMesh) continue;
      j.updateMatrixWorld(true, true);
      const outline = createOutline(j, SELECT_PRIMARY_OUTLINE, 0.025);
      if (j.parent) j.parent.add(outline);
      syncOutlinePosition(outline, j);
      this.outlines.set(j, outline);
    }
  }

  /** Called each frame BEFORE render: move every outline to hug its source mesh so
   * outlines track movement, scaling (with constant thickness) and skeleton edits.
   * An outline whose source mesh was removed from the scene is disposed. */
  syncOutlines() {
    const dead = [];
    for (const [mesh, outline] of this.outlines) {
      if (!mesh.parent) { dead.push(mesh); continue; }
      syncOutlinePosition(outline, mesh);
    }
    if (dead.length) {
      for (const m of dead) {
        const outline = this.outlines.get(m);
        outline.removeFromParent();
        outline.geometry.dispose();
        outline.material.dispose();
        this.outlines.delete(m);
      }
    }
  }

  setMode(mode) {
    if (this.mode === mode) return;
    this.mode = mode;
    this.emit('mode', mode);
  }

  /** The rig (task 014). Made on first use. */
  ensureRig() {
    if (!this.rig) {
      this.rig = new JointRig(this);
      this.group.add(this.rig.root);
      this.emit('rig-change', this.rig);
    }
    return this.rig;
  }

  /** Record a skeleton edit as a graph-only undo unit (plan decision 2): `before` and `after` are
   * SkeletonGraph.toJSON() objects. A full snapshot per tap would copy the model's geometry. */
  pushRig(before, after) {
    this.undoStack.push({ kind: 'rig', before, after });
    this.redoStack.length = 0;
    if (this.undoStack.length > 50) this.undoStack.shift();
  }

  /** Put a graph back (undo, redo) and ask for the weights to be recomputed. */
  applyRigGraph(json) {
    this.ensureRig().restoreGraph(json);
    this.emit('rig-dirty');
  }

  /** Replace a shape with another object at the same place in the tree — a Mesh becoming a
   * SkinnedMesh when the rig skins it, or the reverse. Selection, lastShape and outlines follow. */
  swapShape(oldObj, newObj) {
    const parent = oldObj.parent;
    if (!parent) throw new Error(`cannot swap ${oldObj.name || 'a shape'}: it is not in the scene`);
    const at = parent.children.indexOf(oldObj);
    parent.remove(oldObj);
    parent.add(newObj);
    parent.children.splice(parent.children.indexOf(newObj), 1);
    parent.children.splice(at, 0, newObj);
    newObj.updateMatrixWorld(true);
    const wasSelected = this.selection.has(oldObj);
    const wasPrimary = this.selected === oldObj;
    if (wasSelected) {
      this.selection.delete(oldObj);
      this.selection.add(newObj);
    }
    if (wasPrimary) this.selected = newObj;
    if (this.lastShape === oldObj) this.lastShape = newObj;
    if (wasSelected || wasPrimary) {
      this.syncHighlights();
      // Skinning/undo swaps the object, so the gizmo must follow the replacement too.
      this.emit('select', this.selected);
    }
    return newObj;
  }

  clearRig() {
    // Let external owners (the FitController's bound gear) reparent their objects out
    // of the rig's bones BEFORE dispose() wipes the geometries under rig.root.
    this.emit('before-rig-change');
    if (this.rig) {
      this.rig.unskinAll(); // the model keeps its geometry; only the skin goes
      this.rig.dispose();
      this.rig = null;
      this.emit('rig-change', null);
      this.emit('changed');
    }
  }

  resetDocument() {
    this.clearRig();
    while (this.group.children.length) {
      const c = this.group.children[0];
      c.traverse((o) => {
        o.geometry?.dispose?.();
        o.material?.dispose?.();
      });
      this.group.remove(c);
    }
    this.selection.clear();
    this.select(null);
    this.emit('changed');
  }

  /**
   * Bring an imported model into the document (task 014, owner ruling 4: import keeps the
   * skeleton). Three paths; the return value says which ran. The import root is added through
   * `addImported` INSIDE, at the moment each path needs it (fresh shape ids must exist before the
   * joints can name them), so the caller does not add it again.
   *  - 'studio'  — a file this studio exported: the exported root's `userData.rig` (glTF extras)
   *                names the joints, their shapes and the pose; the skin in the file is used as it
   *                is. NO solve runs — `rig-kept` tells the controller so.
   *  - 'foreign' — a rigged file from elsewhere: every skin baked at its loaded pose into a plain
   *                mesh, one joint per bone at the bone's place, all owned by the largest mesh (the
   *                others ride the nearest bone, ruling 3), and `rig-dirty` asks for OUR weights —
   *                the ONE import case that recomputes.
   *  - null      — no skin and no bones: added as it is, no rig made.
   * Exported joint balls and links are dropped on every path.
   * @param {THREE.Object3D} obj the loaded glTF scene
   * @returns {'studio'|'foreign'|null}
   */
  adoptImportedRig(obj) {
    let rigJson = null;
    obj.traverse((o) => { if (!rigJson && o.userData && o.userData.rig && Array.isArray(o.userData.rig.joints)) rigJson = o.userData.rig; });
    const skinned = [];
    const bones = [];
    const junk = [];
    obj.traverse((o) => {
      if (o.name === '__outline' || o.userData && (o.userData.isOutline || o.userData.isJointBall || o.userData.isRigLink)) junk.push(o);
      else if (o.isSkinnedMesh) skinned.push(o);
      else if (o.isBone) bones.push(o); // traverse is parent-first, so a parent precedes its children
    });
    if (rigJson) {
      if (this.adoptStudioRig(obj, rigJson, skinned, bones, junk)) return 'studio';
      // Without the file's joint graph: the foreign path below reads the bones instead.
      console.warn('[rig] the file\'s skeleton names a shape that is not in it — importing without joints');
    }
    if (!skinned.length && !bones.length) {
      for (const o of junk) o.removeFromParent();
      this.addImported(obj);
      return null;
    }
    this.adoptForeignRig(obj, skinned, bones, junk);
    return 'foreign';
  }

  /** The studio path of adoptImportedRig. False when the file's graph names a shape the file lacks. */
  adoptStudioRig(obj, json, skinned, bones, junk) {
    // Save fitted groups before replacing the imported bone tree. World-space
    // attachment preserves normalization and the authored fit, including pose.
    obj.updateMatrixWorld(true);
    const importedGear = [];
    obj.traverse(o => { if (o.userData?.studioGear) importedGear.push({ group: o, ...o.userData.studioGear }); });
    // The file's shape ids (node extras → userData.id), read BEFORE addImported hands out fresh ones.
    const byFileId = new Map();
    obj.traverse((o) => { if (o.isMesh && !junk.includes(o) && o.userData && !o.userData.isGear && Number.isInteger(o.userData.id)) byFileId.set(o.userData.id, o); });
    if (!json.joints.every((j) => byFileId.has(j.shape))) return false;
    for (const entry of importedGear) obj.attach(entry.group);
    // Every skinned mesh becomes a plain mesh in the same place; its file skin is kept aside. The
    // loaded Bone and Skeleton objects are dropped — the rig rebuilds its own from the graph.
    const kept = [];
    for (const o of skinned) {
      const plain = new THREE.Mesh(o.geometry, o.material);
      plain.name = o.name;
      plain.userData = { ...o.userData };
      delete plain.userData.rigSkin;
      plain.position.copy(o.position);
      plain.quaternion.copy(o.quaternion);
      plain.scale.copy(o.scale);
      o.parent.add(plain);
      o.removeFromParent();
      for (const [id, m] of byFileId) if (m === o) byFileId.set(id, plain);
      const g = o.geometry;
      kept.push({
        mesh: plain,
        skin: { skinIndex: g.attributes.skinIndex.array, skinWeight: g.attributes.skinWeight.array },
        // the loaded skeleton's bones in weight order, named by joint id — that is how they were exported
        bones: o.skeleton.bones.map((b) => ({ name: b.name, parent: b.parent && b.parent.isBone ? b.parent.name : null })),
      });
    }
    for (const o of junk) o.removeFromParent();
    for (const b of bones) if (!(b.parent && b.parent.isBone)) b.removeFromParent();
    const rigRoots = [];
    obj.traverse((o) => { if (o.userData && o.userData.isRigRoot) rigRoots.push(o); });
    for (const r of rigRoots) r.removeFromParent();
    this.addImported(obj); // fresh ids for every mesh
    const rig = this.ensureRig();
    // The file's joints join the graph under fresh ids (the document may already have joints);
    // toJSON lists a parent before its children, so the map is complete when a child needs it.
    const idMap = new Map();
    for (const j of json.joints) {
      const shape = byFileId.get(j.shape);
      idMap.set(j.id, rig.graph.add([j.x, j.y, j.z], j.parent == null ? null : idMap.get(j.parent), shape.userData.id));
    }
    for (const [id, q] of Object.entries(json.pose || {})) if (idMap.has(id)) rig.graph.setPose(idMap.get(id), q);
    if (json.motion?.settings && rig.graph.size === json.joints.length) {
      const settings = json.motion.settings;
      try { rig.graph.setMotion({ ...settings, legs: settings.legs.map((id) => idMap.get(id)), roles: Object.fromEntries(Object.entries(settings.roles).map(([id, role]) => [idMap.get(id), role])), knees: Object.fromEntries(Object.entries(settings.knees || {}).map(([id, knee]) => [idMap.get(id), { ...knee, foot: idMap.get(knee.foot) }])) }); }
      catch { /* Foreign or stale optional animation settings do not prevent importing the rig. */ }
    }
    if (Array.isArray(json.targetShapes)) {
      rig.graph.targetShapes = [...new Set([...(rig.graph.targetShapes || []),
        ...this.shapes.filter((m) => rig.owns(m)).map((m) => m.userData.id),
        ...rig.graph.joints.map((j) => j.shape),
        ...json.targetShapes.map((id) => byFileId.get(id)?.userData.id).filter(Number.isInteger)])];
    }
    rig.rebuild();
    // The file's skin, re-pointed at our bone order BY NAME — the ids were renumbered above, so the
    // file's bone names are renamed the same way first. No solve: the weights are the file's.
    const ours = rig.linkBones.map((b) => ({ name: b.name, parent: b.parent }));
    for (const { mesh, skin, bones: fileBones } of kept) {
      const renamed = fileBones.map((b) => ({ name: idMap.get(b.name) || b.name, parent: b.parent === null ? null : idMap.get(b.parent) || b.parent }));
      rig.skinMesh(mesh, remapSkinIndex(skin, renamed, ours));
    }
    obj.updateMatrixWorld(true);
    rig.root.updateMatrixWorld(true);
    for (const entry of importedGear) {
      const bone = rig.bones.get(idMap.get(entry.bone));
      if (bone) bone.attach(entry.group);
      entry.bone = bone?.name || null;
      entry.group.userData.studioGear = { bone: entry.bone, name: entry.name };
    }
    this.emit('gear-imported', importedGear);
    this.emit('rig-kept');
    this.emit('changed');
    return true;
  }

  /** The foreign path of adoptImportedRig: bake the skins, derive joints from the bones, ask for our weights. */
  adoptForeignRig(obj, skinned, bones, junk) {
    obj.updateMatrixWorld(true);
    const importedGear = [];
    for (const bone of bones) for (const group of bone.children) {
      if (!group.isBone && group.userData?.isGear && !junk.includes(group)) importedGear.push({ group, sourceBone: bone, name: group.name || 'gear' });
    }
    // Bone places in the import root's frame, read BEFORE anything is re-parented — the frame the
    // baked geometry lands in (normalize() in gltf.js has already scaled the root by then).
    const inRoot = new Map();
    for (const b of bones) inRoot.set(b, obj.worldToLocal(b.getWorldPosition(new THREE.Vector3())));
    for (const o of skinned) {
      if (o.skeleton) o.skeleton.update();
      const plain = new THREE.Mesh(bakeSkinnedToParent(o, obj), o.material);
      plain.name = o.name;
      plain.userData = { ...o.userData };
      delete plain.userData.rigSkin;
      obj.add(plain);
      junk.push(o);
    }
    for (const o of junk) {
      o.removeFromParent();
      o.geometry?.dispose?.();
    }
    // Anything else hanging off a bone (fitted gear) keeps its world pose under the import root.
    for (const b of bones) for (const child of [...b.children]) if (!child.isBone) obj.attach(child);
    for (const b of bones) if (!(b.parent && b.parent.isBone)) b.removeFromParent();
    this.addImported(obj);
    // The joints go to the largest non-gear mesh (most vertices); every other mesh has no joint
    // inside and rides the nearest bone (ruling 3) once the solve has run.
    let owner = null;
    obj.traverse((o) => {
      if (!o.isMesh || (o.userData && o.userData.isGear)) return;
      if (!owner || o.geometry.attributes.position.count > owner.geometry.attributes.position.count) owner = o;
    });
    if (!owner || !bones.length) return;
    const rig = this.ensureRig();
    const ids = new Map();
    obj.updateMatrixWorld(true);
    for (const b of bones) {
      const world = obj.localToWorld(inRoot.get(b).clone()).toArray();
      const parent = b.parent && b.parent.isBone ? ids.get(b.parent) : null;
      ids.set(b, rig.graph.add(rig.localOf(owner, world), parent == null ? null : parent, owner.userData.id));
    }
    rig.rebuild();
    obj.updateMatrixWorld(true); rig.root.updateMatrixWorld(true);
    for (const entry of importedGear) {
      const bone = rig.bones.get(ids.get(entry.sourceBone));
      if (bone) bone.attach(entry.group);
      entry.bone = bone?.name || null;
      entry.group.userData.studioGear = { bone: entry.bone, name: entry.name };
    }
    this.emit('gear-imported', importedGear);
    this.emit('rig-dirty'); // the ONE import case that recomputes: our solver replaces the file's weights
    this.emit('changed');
  }

  pushUndo() {
    const snap = takeSnapshot(this);
    this.undoStack.push({ kind: 'snapshot', snap });
    this.redoStack.length = 0;
    if (this.undoStack.length > 50) this.undoStack.shift();
  }

  /** Record a gizmo transform as a set of per-mesh TRS deltas (`ops`) instead of a
   * full document snapshot, so undo/redo of a move/rotate/scale does NOT tear down
   * and rebuild the whole scene (which reset skinned shapes to scale 1 / rot 0). */
  pushTransform(ops) {
    if (!ops || !ops.length) return;
    this.undoStack.push({ kind: 'transform', ops });
    this.redoStack.length = 0;
    if (this.undoStack.length > 50) this.undoStack.shift();
  }

  undo() {
    const unit = this.undoStack.pop();
    if (!unit) return false;
    if (unit.kind === 'transform') {
      this.redoStack.push(unit);
      this.applyTransform(unit.ops, false);
    } else if (unit.kind === 'rig') {
      this.redoStack.push(unit);
      this.applyRigGraph(unit.before);
    } else {
      this.redoStack.push({ kind: 'snapshot', snap: takeSnapshot(this) });
      restoreSnapshot(this, unit.snap);
    }
    this.emit('changed');
    return true;
  }

  redo() {
    const unit = this.redoStack.pop();
    if (!unit) return false;
    if (unit.kind === 'transform') {
      this.undoStack.push(unit);
      this.applyTransform(unit.ops, true);
    } else if (unit.kind === 'rig') {
      this.undoStack.push(unit);
      this.applyRigGraph(unit.after);
    } else {
      this.undoStack.push({ kind: 'snapshot', snap: takeSnapshot(this) });
      restoreSnapshot(this, unit.snap);
    }
    this.emit('changed');
    return true;
  }

  /** Apply a transform unit in the given direction. `forward` (redo) restores the
   * after-TRS; `false` (undo) restores the before-TRS. Skinned shapes are re-bound
   * after the nodal change so the skinning pivot stays consistent with the moved/scaled
   * node (mirrors main.js's gizmo handling). */
  applyTransform(ops, forward) {
    for (const op of ops) {
      // A skeleton edit rebuilds EVERY Bone object (bones.js rebuild()), so a pose op recorded
      // before that edit holds a now-detached Bone (removeFromParent()'d by the rebuild) — the
      // `mesh.parent` check below would then skip it SILENTLY, and Undo/Redo of a pose would go
      // inert after any later skeleton edit (fix round 1, finding 1). Re-point a Bone op to the
      // LIVE bone by joint id (set on every bone as userData.jointId) before that check. Scoped to
      // Bones that carry a jointId on a JointRig only — an ordinary mesh op is untouched. A joint
      // that was genuinely deleted has no live bone to resolve to (`.get` returns undefined): the
      // stale, parentless original is kept and still correctly skipped below.
      const mesh = (op.mesh && op.mesh.isBone && op.mesh.userData.jointId != null && this.rig)
        ? (this.rig.bones.get(op.mesh.userData.jointId) || op.mesh)
        : op.mesh;
      if (!mesh || !mesh.parent) continue;
      const t = forward ? op.after : op.before;
      mesh.position.fromArray(t.p);
      mesh.quaternion.fromArray(t.q);
      mesh.scale.fromArray(t.s);
    }
    // A bone's rotation lives in two places: the Bone (drawn) and the graph (saved). Keep them equal.
    if (this.rig) {
      this.rig.root.updateMatrixWorld(true);
      this.rig.readPose();
    }
  }
}
