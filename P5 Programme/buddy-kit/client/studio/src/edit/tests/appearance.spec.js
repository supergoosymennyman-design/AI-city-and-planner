/**
 * appearance.spec.js — a model keeps its LOOK through the bake, the edit tools and undo/redo.
 *
 * The studio's document model assumed every shape is one MeshStandardMaterial with a flat colour.
 * A generated (textured) model breaks that assumption in four places, each covered here:
 *   1. takeSnapshot stored positions only, so undo/redo/reload returned flat clay;
 *   2. duplicate/remove/colour assumed `mesh.material` is never an array;
 *   3. the bake kept only `mesh.material[0]`, dropping a second painted region;
 *   4. the bake copied position+uv only, so smooth surfaces came back faceted and a
 *      vertex-painted source kept `vertexColors: true` with no colour attribute (black).
 */
import * as THREE from 'three';
import { StudioScene } from '../../scene.js';
import { takeSnapshot, restoreSnapshot } from '../snapshot.js';
import { bakeAndPlace } from '../../ai/gen-place.js';
import {
  materialList, cloneMaterial, primaryColorHex, setMaterialColor, setWireframe,
  describeAppearance, materialFromAppearance,
} from '../material-ops.js';

const results = [];
const rec = (name, cond) => results.push([name, !!cond]);

/** A two-triangle quad, 1x1, standing on y=0 so placeBeside accepts it. */
function quad({ groups = false, smooth = false, colors = false } = {}) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    0, 0, 0, 1, 0, 0, 0, 1, 0,
    1, 0, 0, 1, 1, 0, 0, 1, 0,
  ]), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([
    0, 0, 1, 0, 0, 1,
    1, 0, 1, 1, 0, 1,
  ]), 2));
  if (smooth) {
    // Deliberately NOT the flat face normal (0,0,1): a recompute would destroy these.
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([
      -1, 0, 0, 0, -1, 0, 0, 0, 1,
      0, -1, 0, 1, 0, 0, 0, 0, 1,
    ]), 3));
  }
  if (colors) {
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array([
      1, 0, 0, 0, 1, 0, 0, 0, 1,
      0, 1, 0, 1, 1, 0, 0, 0, 1,
    ]), 3));
  }
  if (groups) { g.addGroup(0, 3, 0); g.addGroup(3, 3, 1); }
  return g;
}

function mapped(dataUrl) {
  const tex = new THREE.Texture();
  tex.image = { width: 4, height: 4 };
  tex.userData.dataUrl = dataUrl; // the cache describeAppearance fills in the browser
  return new THREE.MeshStandardMaterial({ map: tex });
}

const build = { min: [-0.5, 0, -0.5], max: [0.5, 2, 0.5] };
const MAPS = 'data:image/webp;base64,AAA|data:image/webp;base64,BBB';

// --- 4a. the bake keeps the source's own normals (smooth stays smooth) ---
{
  const src = new THREE.Mesh(quad({ smooth: true }), mapped('data:image/webp;base64,AAA'));
  const out = bakeAndPlace([src], build);
  const n = out.geometry.attributes.normal;
  const differ = n && (n.getX(0) !== n.getX(1) || n.getY(0) !== n.getY(1) || n.getZ(0) !== n.getZ(1));
  rec('appearance: the bake keeps the source normals instead of faceting the surface', differ);
  rec('appearance: ...one normal per output vertex', !!n && n.count === out.geometry.attributes.position.count);
}

// --- 4b. vertex colours survive the bake ---
{
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true });
  const src = new THREE.Mesh(quad({ colors: true }), mat);
  const out = bakeAndPlace([src], build);
  const c = out.geometry.attributes.color;
  rec('appearance: a vertex-painted source keeps its colour attribute, not just the flag',
    !!c && c.count === out.geometry.attributes.position.count && c.getX(0) === 1 && c.getY(0) === 0);
  rec('appearance: ...and the material that reads it', materialList(out.material).some((m) => m.vertexColors));
}

// --- 4c. an unpainted source with no normals still gets computed ones ---
{
  const out = bakeAndPlace([new THREE.Mesh(quad())], build);
  rec('appearance: a source with no normals still comes out shaded',
    !!out.geometry.attributes.normal && out.geometry.attributes.normal.count === out.geometry.attributes.position.count);
}

// --- 3. both of a source's painted regions survive ---
{
  const a = mapped('data:image/webp;base64,AAA');
  const b = mapped('data:image/webp;base64,BBB');
  const src = new THREE.Mesh(quad({ groups: true }), [a, b]);
  const out = bakeAndPlace([src], build);
  const mats = materialList(out.material);
  rec('appearance: a source with two painted regions keeps BOTH materials',
    mats.length === 2 && mats.includes(a) && mats.includes(b));
  rec('appearance: ...and a geometry group for each, covering every triangle',
    out.geometry.groups.length === 2 &&
    out.geometry.groups.reduce((n, g) => n + g.count, 0) === out.geometry.attributes.position.count &&
    new Set(out.geometry.groups.map((g) => g.materialIndex)).size === 2);
}

// --- 2. the edit tools accept a mesh whose material is an array ---
{
  const studio = new StudioScene();
  const a = mapped('data:image/webp;base64,AAA');
  const b = mapped('data:image/webp;base64,BBB');
  const mesh = new THREE.Mesh(quad({ groups: true }), [a, b]);
  Object.assign(mesh.userData, { generated: true, geoCustom: true, kind: 'custom' });
  studio.addImported(mesh);

  let dupErr = null, copy = null;
  try { copy = studio.duplicate(mesh); } catch (err) { dupErr = err; }
  rec('appearance: Duplicate works on a multi-material generated mesh', !dupErr && !!copy);
  rec('appearance: ...and gives the copy its OWN materials', !dupErr && Array.isArray(copy && copy.material) &&
    copy.material.length === 2 && copy.material[0] !== a && copy.material[1] !== b);

  setMaterialColor(mesh.material, 0x00ff00);
  rec('appearance: the colour control tints every material of a generated mesh',
    materialList(mesh.material).every((m) => m.color.getHex() === 0x00ff00));
  rec('appearance: ...and the panel reads the colour back', primaryColorHex(mesh.material) === 0x00ff00);
  setWireframe(mesh.material, true);
  rec('appearance: the wireframe toggle reaches every material',
    materialList(mesh.material).every((m) => m.wireframe === true));

  const cloned = cloneMaterial([a, b]);
  rec('appearance: cloning keeps the array shape', Array.isArray(cloned) && cloned.length === 2 && cloned[0] !== a);
}

// --- ...and so do the studio operations that free or rebuild a shape ---
{
  const studio = new StudioScene();
  const two = [new THREE.MeshStandardMaterial(), new THREE.MeshStandardMaterial()];
  let disposed = 0;
  for (const m of two) m.dispose = () => { disposed++; };
  const mesh = new THREE.Mesh(quad({ groups: true }), two);
  Object.assign(mesh.userData, { generated: true, geoCustom: true, kind: 'custom' });
  studio.addImported(mesh);
  let removeErr = null;
  try { studio.remove(mesh); } catch (err) { removeErr = err; }
  rec('appearance: deleting a multi-material generated mesh frees BOTH materials',
    !removeErr && disposed === 2);

  // Taking the skin off rebuilds the shape as a plain mesh — the rig must not assume one material
  // either, or unskinning a generated model throws instead of releasing it (task 014 replaced
  // the old bind/detach pair with skinMesh/unskinMesh; the multi-material rule is the same rule).
  const rigged = new StudioScene();
  const limb = new THREE.Mesh(quad({ groups: true }), [mapped('data:image/webp;base64,AAA'), mapped('data:image/webp;base64,BBB')]);
  limb.name = 'limb';
  Object.assign(limb.userData, { geoCustom: true, kind: 'custom' });
  rigged.addImported(limb);
  const rig = rigged.ensureRig();
  const j = rig.graph.add(rig.localOf(limb, [0, 0, 0]), null, limb.userData.id);
  rig.graph.add(rig.localOf(limb, [0.5, 0, 0]), j, limb.userData.id);
  rig.rebuild();
  const flat = (n) => ({ skinIndex: new Uint16Array(n * 4), skinWeight: Float32Array.from({ length: n * 4 }, (_, i) => (i % 4 === 0 ? 1 : 0)) });
  let detachErr = null, plain = null;
  try {
    const skinned = rig.skinMesh(limb, flat(limb.geometry.attributes.position.count));
    plain = rig.unskinMesh(skinned);
  } catch (err) { detachErr = err; }
  rec('appearance: taking the skin off a multi-material shape works and keeps its materials',
    !detachErr && !!plain && !plain.isSkinnedMesh && materialList(plain.material).length === 2);

  // Clearing the whole skeleton takes the same path for every skinned shape at once.
  const cleared = new StudioScene();
  const limb2 = new THREE.Mesh(quad({ groups: true }), [mapped('data:image/webp;base64,AAA'), mapped('data:image/webp;base64,BBB')]);
  limb2.name = 'limb2';
  Object.assign(limb2.userData, { geoCustom: true, kind: 'custom' });
  cleared.addImported(limb2);
  const rig2 = cleared.ensureRig();
  const k = rig2.graph.add(rig2.localOf(limb2, [0, 0, 0]), null, limb2.userData.id);
  rig2.graph.add(rig2.localOf(limb2, [0.5, 0, 0]), k, limb2.userData.id);
  rig2.rebuild();
  let clearErr = null;
  try {
    rig2.skinMesh(limb2, flat(limb2.geometry.attributes.position.count));
    cleared.clearRig();
  } catch (err) { clearErr = err; }
  const freed = cleared.group.children.filter((o) => o.isMesh && o.name === 'limb2');
  rec('appearance: clearing the skeleton releases a multi-material shape intact',
    !clearErr && freed.length === 1 && !freed[0].isSkinnedMesh && materialList(freed[0].material).length === 2);
}

// --- none of it leaks into an AI request ---
{
  const { buildPayload } = await import('../../ai/prompt.js');
  const studio = new StudioScene();
  const mesh = new THREE.Mesh(quad({ groups: true, smooth: true }),
    [mapped('data:image/webp;base64,AAA'), mapped('data:image/webp;base64,BBB')]);
  Object.assign(mesh.userData, { generated: true, geoCustom: true, kind: 'custom' });
  mesh.userData.paint = { width: 2, height: 2, dataUrl: 'data:image/png;base64,PAINT' };
  studio.addImported(mesh);
  for (const includeGeo of [false, true]) {
    const wire = JSON.stringify(buildPayload(studio, { scope: 'scene', includeGeo }));
    rec(`appearance: no image bytes reach the AI request (includeGeo: ${includeGeo})`,
      !wire.includes('data:image') && !wire.includes('appearance'));
  }
  rec('appearance: ...and the shape itself still does',
    JSON.stringify(buildPayload(studio, { scope: 'scene', includeGeo: true })).includes('positions'));
}

// --- the rule holds at the call sites too, not only in the helper ---
{
  // A panel that reads or writes `mesh.material.color` directly is the exact defect that made
  // Duplicate throw: it works until the day a shape has more than one material. Pin the shape-
  // handling panels to material-ops so the next control added cannot quietly reintroduce it.
  const { readFileSync } = await import('node:fs');
  const BANNED = /\.material\??\.(clone|dispose|color|wireframe)\b/;
  for (const rel of ['ui/properties.js', 'ui/tree.js']) {
    const src = readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');
    const offenders = src.split('\n')
      .filter((line) => BANNED.test(line) && !line.includes('material-array-safe'));
    rec(`appearance: ${rel} reaches a shape's material only through material-ops`, offenders.length === 0);
  }
}

// --- 1. the full undo / redo / reload round trip keeps the look ---
{
  const studio = new StudioScene();
  const a = mapped('data:image/webp;base64,AAA');
  const b = mapped('data:image/webp;base64,BBB');
  const mesh = new THREE.Mesh(quad({ groups: true, smooth: true }), [a, b]);
  Object.assign(mesh.userData, { generated: true, geoCustom: true, kind: 'custom' });
  studio.addImported(mesh);

  const snap = takeSnapshot(studio);
  const obj = snap.objects.find((o) => o.generated);
  rec('appearance: the snapshot stores the UVs',
    !!obj && obj.geo.uv && obj.geo.uv.length === 12 && obj.geo.uv[2] === 1);
  rec('appearance: the snapshot stores the normals', !!obj && obj.geo.normals &&
    obj.geo.normals.length === 18 && obj.geo.normals[0] === -1);
  rec('appearance: the snapshot stores both texture maps and the groups it needs to use them',
    !!obj && !!obj.appearance && obj.appearance.materials.length === 2 &&
    obj.appearance.materials.map((m) => m.map).join('|') === MAPS &&
    obj.appearance.groups.length === 2);
  // The document is saved by structured clone, not JSON (see snapshot-size.spec.js), so what
  // matters here is that the appearance record survives that path with its images intact.
  rec('appearance: the appearance record survives the clone the document is saved with',
    (() => {
      try {
        const back = structuredClone(snap).objects.find((o) => o.generated);
        return back.appearance.materials.map((m) => m.map).join('|') === MAPS;
      } catch (e) { return false; }
    })());

  restoreSnapshot(studio, snap);
  const back = studio.shapes.find((m) => m.userData.generated);
  const bn = back && back.geometry.attributes.normal;
  rec('appearance: after undo/redo the model still has its UVs', !!back && !!back.geometry.attributes.uv &&
    back.geometry.attributes.uv.count === back.geometry.attributes.position.count);
  rec('appearance: ...its own normals, not recomputed flat ones',
    !!bn && (bn.getX(0) !== bn.getX(1) || bn.getY(0) !== bn.getY(1) || bn.getZ(0) !== bn.getZ(1)));
  rec('appearance: ...two materials and two groups', !!back && materialList(back.material).length === 2 &&
    back.geometry.groups.length === 2);

  // Undo, redo, undo again: the texture must not drain away one round trip at a time, even
  // headless where the image itself cannot be decoded.
  const again = takeSnapshot(studio).objects.find((o) => o.generated);
  rec('appearance: ...and a SECOND round trip still carries both maps',
    !!again && !!again.appearance && again.appearance.materials.map((m) => m.map).join('|') === MAPS);
}

// A single material must keep its saved image while decoding is pending or has failed.
// Multi-material fixtures bypass describeAppearance's plain-colour shortcut, hiding this race.
{
  const desc = {
    materials: [{ color: 0xffffff, map: 'data:image/webp;base64,AAA', flipY: false,
      colorSpace: THREE.SRGBColorSpace, repeat: [2, 3], offset: [0.25, 0.5] }],
    groups: [],
  };
  let finishDecode;
  const built = materialFromAppearance(desc, {
    loadTexture: () => new Promise((resolve) => { finishDecode = resolve; }),
  });
  const studio = new StudioScene();
  const mesh = new THREE.Mesh(quad(), built.material);
  Object.assign(mesh.userData, { generated: true, geoCustom: true, kind: 'custom' });
  studio.addImported(mesh);
  const savedLook = () => takeSnapshot(studio).objects.find((o) => o.generated)?.appearance?.materials[0];
  rec('appearance: a single material keeps its image and sampler settings while decoding',
    !built.material.map && savedLook()?.map === desc.materials[0].map &&
      savedLook()?.flipY === false && savedLook()?.repeat.join() === '2,3' && savedLook()?.offset.join() === '0.25,0.5');
  finishDecode(null);
  await built.ready;
  rec('appearance: a failed decode still preserves the single material image',
    !built.material.map && savedLook()?.map === desc.materials[0].map);
  studio.pushUndo();
  studio.addPrimitive('sphere', 0xffffff, { silent: true });
  studio.undo(); studio.redo(); studio.undo();
  restoreSnapshot(studio, structuredClone(takeSnapshot(studio)));
  rec('appearance: rapid undo/redo and reload retain an undecoded single material image',
    savedLook()?.map === desc.materials[0].map && savedLook()?.colorSpace === THREE.SRGBColorSpace);
}

// --- an ordinary clay shape costs a snapshot nothing extra ---
{
  const studio = new StudioScene();
  studio.addPrimitive('box', 0xff0000, { silent: true });
  const only = takeSnapshot(studio).objects[0];
  rec('appearance: a plain primitive gains no appearance record (snapshots stay small)', !only.appearance);
}

// --- the descriptor rebuilds a usable material, and decodes the map when it can ---
{
  const desc = {
    materials: [{
      color: 0x336699, roughness: 0.4, metalness: 0.2, side: THREE.DoubleSide,
      vertexColors: false, map: 'data:image/webp;base64,AAA', flipY: false, colorSpace: THREE.SRGBColorSpace,
    }],
    groups: [],
  };
  const loaded = new THREE.Texture();
  const { material, ready } = materialFromAppearance(desc, { loadTexture: () => Promise.resolve(loaded) });
  rec('appearance: the descriptor rebuilds the surface settings', !Array.isArray(material) &&
    material.color.getHex() === 0x336699 && material.roughness === 0.4 && material.side === THREE.DoubleSide);
  rec('appearance: ...and keeps the image bytes for the next snapshot even before it decodes',
    material.userData.sourceDataUrl === 'data:image/webp;base64,AAA');
  await ready;
  rec('appearance: ...then attaches the decoded map with the recorded orientation',
    material.map === loaded && loaded.flipY === false);

  const plain = new THREE.Mesh(quad(), new THREE.MeshStandardMaterial({ color: 0x123456 }));
  rec('appearance: a plain single-colour shape needs no descriptor at all', describeAppearance(plain) === null);
}

export default function appearanceTests(check) {
  for (const [name, cond] of results) check(name, cond);
}
