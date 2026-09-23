import * as THREE from 'three';
import { StudioScene } from './src/scene.js';
import { applyGroupDelta } from './src/edit/group-transform.js';
import { takeSnapshot, restoreSnapshot } from './src/edit/snapshot.js';
import { addTubeShape, chainUpTube, bindNow } from './src/rig/tests/fixtures.js';
import { findSocketBone, isBilateralPair, visibleBox, measureModel, prepareGear, isRigged, SLOT_TO_SOCKET,
  readPrefitMeta, attachPrefittedGroup, socketFitProp, guessBone, bakeDressed } from './src/fit/fit.js';
import { SLOT_LIST, slotByKey, boneFamily, DEFAULT_GEAR_SCALE } from './src/fit/slots.js';
import { FitController } from './src/fit/fit-controller.js';
import { prepareForSculpt, sharpenNormals, weld } from './src/clay/remesh.js';

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) {
    pass++;
    console.log('PASS', name);
  } else {
    fail++;
    console.log('FAIL', name);
  }
}
const allFinite = (v) => v.every((n) => Number.isFinite(n));

/** A rigged model the way the product makes one: a custom shape, three tapped joints, the bending
 * worked out. Returns the scene, the rig, the three joint ids, the (now skinned) shape and the
 * plain mesh it started as. */
function riggedTube() {
  const s = new StudioScene();
  const tube = addTubeShape(s);
  const rig = s.ensureRig();
  const ids = chainUpTube(rig);
  const { meshes } = bindNow(s);
  return { s, rig, ids, mesh: meshes[0], tube };
}

// GLTFExporter's binary path uses browser-only FileReader; the app runs in a browser
// but the node test harness needs a minimal polyfill (Blob already exists in Node).
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((ab) => {
        this.result = ab;
        this.onloadend && this.onloadend();
      });
    }
  };
}

// --- 2. clear skeleton keeps shapes ---
{
  const { s, mesh } = riggedTube();
  const before = s.shapes.length;
  s.clearRig();
  check('clear skeleton: shape count preserved', before === 1 && s.shapes.length === 1);
  check('clear skeleton: rig removed', !s.rig);
  check('clear skeleton: shape is a plain mesh again, with its geometry',
    s.shapes.length === 1 && !s.shapes[0].isSkinnedMesh && s.shapes[0].name === 'tube'
    && s.shapes[0].geometry === mesh.geometry && !s.shapes[0].geometry.attributes.skinIndex);
}

// --- 5. multi-select transform: rotate AND scale around a single pivot ---
{
  const s = new StudioScene();
  const a = s.addPrimitive('box');
  const b = s.addPrimitive('sphere');
  a.position.set(3, 0, 0);
  b.position.set(1, 0, 0);
  s.group.updateMatrixWorld(true);
  const meshes = [a, b];
  const starts = meshes.map((m) => m.matrixWorld.clone());

  // Pivot at (2,0,0). Rotate 90° about Y.
  const group = new THREE.Group();
  group.position.set(2, 0, 0);
  group.rotation.y = Math.PI / 2;
  group.updateMatrixWorld(true);
  const delta = new THREE.Matrix4().multiplyMatrices(group.matrixWorld, new THREE.Matrix4().makeTranslation(2, 0, 0).invert());
  applyGroupDelta(meshes, delta, starts);
  check('multi rotate: a moves to (2,0,-1)', Math.abs(a.position.x - 2) < 1e-6 && Math.abs(a.position.z + 1) < 1e-6);
  check('multi rotate: b moves to (2,0,1)', Math.abs(b.position.x - 2) < 1e-6 && Math.abs(b.position.z - 1) < 1e-6);

  // Scale 2x about the same pivot (a now at (2,0,-1), b at (2,0,1)).
  meshes.forEach((m) => m.updateMatrixWorld(true));
  const starts2 = meshes.map((m) => m.matrixWorld.clone());
  const group2 = new THREE.Group();
  group2.position.set(2, 0, 0);
  group2.scale.set(2, 2, 2);
  group2.updateMatrixWorld(true);
  const delta2 = new THREE.Matrix4().multiplyMatrices(group2.matrixWorld, new THREE.Matrix4().makeTranslation(2, 0, 0).invert());
  applyGroupDelta(meshes, delta2, starts2);
  check('multi scale: a ends at (2,0,-2) relative to pivot', Math.abs(a.position.x - 2) < 1e-6 && Math.abs(a.position.z + 2) < 1e-6);
  check('multi scale: b ends at (2,0,2) relative to pivot', Math.abs(b.position.x - 2) < 1e-6 && Math.abs(b.position.z - 2) < 1e-6);
  check('multi scale: both scaled 2x', Math.abs(a.scale.x - 2) < 1e-6 && Math.abs(b.scale.x - 2) < 1e-6);
}

// --- 6. duplicate two selected shapes ---
{
  const s = new StudioScene();
  s.addPrimitive('box');
  s.addPrimitive('sphere');
  const a = s.shapes.find((m) => m.name === 'box-1');
  const b = s.shapes.find((m) => m.name === 'sphere-2');
  s.duplicate(a);
  s.duplicate(b);
  const names = s.shapes.map((m) => m.name);
  check('duplicate: copies of both selected shapes exist', names.includes('box-1-copy') && names.includes('sphere-2-copy'));
}

// --- 10. shift-click multi-select keeps every shape selected (outline glow too) ---
{
  const s = new StudioScene();
  const a = s.addPrimitive('box');
  const b = s.addPrimitive('sphere');
  s.select(a);
  s.select(b, true);
  check('multi: selection set holds both shapes', s.selection.size === 2);
  s.syncHighlights();
  check('multi: both shapes carry an outline', s.outlines.size === 2);
  check('multi: outline is not the shape itself', a.userData.isOutline !== true && s.shapes.length === 2);
  s.select(a, true); // toggle a off
  check('multi: shift-clicking again toggles one off', s.selection.size === 1);
}

// --- 11. torus tube width + snapshot round-trip ---
{
  const s = new StudioScene();
  const torus = s.addPrimitive('torus');
  const beforeGeom = torus.geometry;
  s.setTorusTube(torus, 0.3);
  check('torus: geometry replaced', torus.geometry !== beforeGeom);
  check('torus: tube value stored', Math.abs(torus.userData.torus.tube - 0.3) < 1e-4);
  const snap = takeSnapshot(s);
  s.resetDocument();
  restoreSnapshot(s, snap);
  const restored = s.shapes.find((m) => m.userData.kind === 'torus');
  check('torus: snapshot preserves tube width', Math.abs(restored.userData.torus.tube - 0.3) < 1e-4);
}

// --- 13. primitive materials are DoubleSide (no transparent-face torus) ---
{
  const s = new StudioScene();
  const torus = s.addPrimitive('torus');
  check('torus: material is DoubleSide', torus.material.side === THREE.DoubleSide);
  const box = s.addPrimitive('box');
  check('box: material is DoubleSide', box.material.side === THREE.DoubleSide);
}

// --- 15. changing the tube of a rigged torus drops its skin and asks for a rebind ---
{
  const s = new StudioScene();
  const torus = s.addPrimitive('torus');
  torus.position.set(0, 0.6, 0);
  s.group.updateMatrixWorld(true);
  const rig = s.ensureRig();
  const a = rig.graph.add(rig.localOf(torus, [0.4, 0.6, 0]), null, torus.userData.id);
  rig.graph.add(rig.localOf(torus, [-0.4, 0.6, 0]), a, torus.userData.id);
  rig.rebuild();
  const skinned = bindNow(s).meshes[0];
  const changes = [];
  s.on('changed', () => changes.push(1));
  s.setTorusTube(skinned, 0.3);
  const bound = s.shapes.find((m) => m.userData.kind === 'torus');
  check('rigged torus: the tube change drops the skin (the rig recomputes it)',
    !bound.isSkinnedMesh && !skinned.parent && Math.abs(bound.userData.torus.tube - 0.3) < 1e-4 && bound.userData.rigSkin === undefined);
  check('rigged torus: the change is announced so the rebind is scheduled', changes.length >= 1 && bound.position.y === 0.6);
}

// --- 16. shift-click DESELECT must not move the "current" (main) selection ---
{
  const s = new StudioScene();
  const a = s.addPrimitive('box');
  const b = s.addPrimitive('sphere');
  const c = s.addPrimitive('cylinder');
  s.select(a); // A is the primary
  s.select(b, true); // add B -> B becomes primary
  s.select(c, true); // add C -> C becomes primary
  // Deselect B (not the primary): the primary (C) must stay.
  s.select(b, true);
  check('deselect: primary unchanged when removing a non-primary', s.selected === c && s.selection.has(c) && !s.selection.has(b));
  // Deselect the primary (C): falls back to the remaining member, not a ghost.
  s.select(c, true);
  check('deselect: primary falls back to a remaining selected shape', s.selected === a && s.selection.size === 1);
  // Deselect the last one: nothing selected.
  s.select(a, true);
  check('deselect: empty selection when last shape removed', s.selected === null && s.selection.size === 0);
}

// --- 17. multi-drag moves every selected shape together (pivot-group flow) ---
{
  const s = new StudioScene();
  const a = s.addPrimitive('box');
  const b = s.addPrimitive('sphere');
  a.position.set(1, 0, 0);
  b.position.set(-1, 0, 0);
  s.group.updateMatrixWorld(true);
  s.select(a);
  s.select(b, true);

  // Replicate main.js: pivot group at the selection centre (a at x=1, b at x=-1
  // so the centre is the origin).
  const group = new THREE.Group();
  group.position.set(0, 0, 0);
  group.updateMatrixWorld(true);

  // Drag start: capture group matrix + each mesh's world matrix.
  const dragStart = { group: group.matrixWorld.clone(), perMesh: new Map([...s.selection].map((m) => [m, m.matrixWorld.clone()])) };

  // Simulate TransformControls translating the group, then objectChange.
  group.position.x += 0.75;
  // Without a render loop, matrixWorld is stale — the fix refreshes it first.
  group.updateMatrixWorld(true);
  const delta = new THREE.Matrix4().multiplyMatrices(group.matrixWorld, new THREE.Matrix4().copy(dragStart.group).invert());
  applyGroupDelta([...dragStart.perMesh.keys()], delta, [...dragStart.perMesh.values()]);

  check('multi drag: first shape translated together', Math.abs(a.position.x - 1.75) < 1e-6);
  check('multi drag: second shape translated together', Math.abs(b.position.x - -0.25) < 1e-6);
}

// --- 18. Undo/Redo must NOT clear the current selection ---
{
  const s = new StudioScene();
  const a = s.addPrimitive('box');
  const b = s.addPrimitive('sphere');
  const sphereId = b.userData.id;
  s.select(b);
  s.pushUndo();
  const cyl = s.addPrimitive('cylinder'); // auto-selects the cylinder
  check('undo-test: cylinder selected before undo', s.selected === cyl);
  s.undo();
  check('undo-test: selection restored to the sphere after undo', s.selected?.userData.id === sphereId);
  s.redo();
  check('redo-test: selection restored to a cylinder after redo', s.selected?.name?.startsWith('cylinder') === true);
}

// --- 19. Undo restores the ENTIRE multi-selection, not just the primary ---
{
  const s = new StudioScene();
  const a = s.addPrimitive('box');
  const b = s.addPrimitive('sphere');
  const c = s.addPrimitive('cylinder');
  const ids = new Set([a.userData.id, b.userData.id, c.userData.id]);
  const primaryId = c.userData.id;
  s.select(a);
  s.select(b, true);
  s.select(c, true); // multi-select all three
  s.pushUndo();
  s.addPrimitive('cone'); // an action to undo (selects the cone)
  s.undo();
  check('undo: full selection size restored', s.selection.size === 3);
  const restoredIds = [...s.selection].map((m) => m.userData.id);
  check('undo: same shapes restored', restoredIds.every((id) => ids.has(id)));
  check('undo: primary preserved', s.selected?.userData?.id === primaryId);
}

// --- 20. rigged (skinned) shapes also get an outline, and it is not a "shape" ---
{
  const { s, mesh } = riggedTube();
  s.select(mesh);
  check('outline: skinned shape gets a skinned outline', s.outlines.size === 1 && s.outlines.get(mesh)?.isSkinnedMesh === true);
  check('outline: shapes list still excludes the outline', s.shapes.length === 1);
  s.select(null);
  check('outline: removed after deselect', s.outlines.size === 0);
}

// --- 21. fit slots: four head slots share the head bone; back rig maps to chest ---
{
  check('fit: crown -> head', SLOT_TO_SOCKET.crown === 'head');
  check('fit: eye -> head', SLOT_TO_SOCKET.eye === 'head');
  check('fit: visor -> head', SLOT_TO_SOCKET.visor === 'head');
  check('fit: temples -> head', SLOT_TO_SOCKET.temples === 'head');
  check('fit: backRig -> chest', SLOT_TO_SOCKET.backRig === 'chest');
  check('fit: every slot has a socket', SLOT_LIST.every((s) => !!SLOT_TO_SOCKET[s.key]));
  check('fit: slotByKey finds crown', slotByKey('crown')?.socket === 'head');
  check('fit: boneFamily strips mixamorig', boneFamily('mixamorig:Head') === 'head');
  check('fit: boneFamily left shoulder', boneFamily('LeftShoulder') === 'shoulderL');
}

// --- 22. findSocketBone on a tapped skeleton: exact joint ids match, family names do not ---
{
  const { s, rig, ids } = riggedTube();
  check('fit: a joint id is found exactly', findSocketBone(rig, ids[1]) === rig.bones.get(ids[1]));
  check('fit: family names have nothing to match on a tapped skeleton', findSocketBone(rig, 'head') === null && findSocketBone(rig, 'chest') === null);
  check('fit: unknown socket -> null', findSocketBone(rig, 'nope') === null && s.rig === rig);
}

// --- 23. isBilateralPair detects a mirrored x pair vs a single mesh ---
{
  const g1 = new THREE.Group();
  const a = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2));
  a.position.set(-0.3, 0, 0);
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2));
  b.position.set(0.3, 0, 0);
  g1.add(a, b);
  g1.updateMatrixWorld(true);
  const box1 = visibleBox(g1);
  check('fit: mirrored pair is a bilateral pair', isBilateralPair(g1, box1) === true);

  const g2 = new THREE.Group();
  const c = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2));
  c.position.set(0.4, 0.2, 0.1);
  g2.add(c);
  g2.updateMatrixWorld(true);
  check('fit: single mesh is not a pair', isBilateralPair(g2, visibleBox(g2)) === false);
}

// --- 24. measureModel reports height, crown (top-center) and floor of the group ---
{
  const s = new StudioScene();
  const m = s.addPrimitive('box'); // 1x1x1 centred at y=0.5
  m.position.set(0, 0, 0);
  s.emit('changed');
  const measure = measureModel(s);
  check('fit: height measures 1 unit', Math.abs(measure.height - 1) < 1e-4);
  check('fit: crown x at midpoint', Math.abs(measure.crown.x) < 1e-4);
  check('fit: crown y = top of box', Math.abs(measure.crown.y - 0.5) < 1e-4);
  check('fit: floor y = bottom of box', Math.abs(measure.floorY + 0.5) < 1e-4);
}

// --- 25. prepareGear sizes a piece to a fixed fraction of the model height ---
{
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1));
  g.add(mesh);
  g.updateMatrixWorld(true);
  const s = new StudioScene();
  s.addPrimitive('box');
  const measure = measureModel(s);
  const prep = prepareGear(g, measure); // DEFAULT_GEAR_SCALE = 0.3
  // Piece diameter ~0.173 (sphere of a 0.1 cube), model height ~1 → baseScale ≈ 0.3/0.173
  const expected = (1 * 0.3) / 0.173205;
  check('fit: baseScale sized from DEFAULT_GEAR_SCALE / height', Math.abs(prep.baseScale - expected) < 0.05);
  check('fit: paired flag stored', g.userData.paired !== undefined);
}

// --- 26. bone binding: socketFitProp seats a piece onto a tapped joint, and evicts the last one ---
{
  const { s, rig, ids } = riggedTube();
  check('fit: DEFAULT_GEAR_SCALE is 0.3', DEFAULT_GEAR_SCALE === 0.3);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2)));
  g.updateMatrixWorld(true);
  g.userData.baseScale = 0.3;
  const seated = socketFitProp({ rig, measure: measureModel(s), boneKey: ids[2], group: g, paired: false });
  check('fit: socketFitProp seats onto the named joint', seated === rig.bones.get(ids[2]) && g.parent === rig.bones.get(ids[2]));
  check('fit: seated piece world transform finite', g.matrixWorld.elements.every((n) => Number.isFinite(n)));

  // Eviction rule (one piece per joint): socketFitProp itself only seats its group, so mirror the
  // controller's seatToBone eviction step before re-seating, exactly as the template-rig test did.
  const joint = rig.bones.get(ids[2]);
  const g2 = new THREE.Group();
  g2.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2)));
  g2.userData.baseScale = 0.3;
  if (g.parent) g.parent.remove(g);
  socketFitProp({ rig, measure: measureModel(s), boneKey: ids[2], group: g2, paired: false });
  check('fit: newcomer seats onto the same joint', g2.parent === joint);
  // NOT `g.parent !== joint`: the line above already detached g, so that compares null to a Bone and
  // can never fail (fix round 1, minor 4). What the rule actually promises is that the joint ends up
  // carrying ONE piece — drop the eviction step and this counts two.
  const onJoint = joint.children.filter((c) => c === g || c === g2);
  check('fit: the joint carries the newcomer and ONLY the newcomer',
    onJoint.length === 1 && onJoint[0] === g2 && g.parent === null);
}

// --- 27. guessBone on a tapped skeleton takes the first joint; prepareGear needs no slot ---
{
  const { s, rig, ids } = riggedTube();
  check('fit: guessBone falls through to the first bone of a tapped skeleton', guessBone(rig) === rig.bones.get(ids[0]));
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1)));
  g.updateMatrixWorld(true);
  const prep = prepareGear(g, measureModel(s));
  check('fit: prepareGear works with no slot arg', typeof prep.baseScale === 'number' && isFinite(prep.baseScale));
}

// --- 28. isRigged rejects characters, accepts plain props ---
{
  const g1 = new THREE.Group();
  g1.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2)));
  check('fit: plain prop is not rigged', isRigged(g1) === false);

  const g2 = new THREE.Group();
  const bone = new THREE.Bone();
  g2.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2)));
  g2.add(bone);
  check('fit: a Bone marks the prop as rigged', isRigged(g2) === true);

  const g3 = new THREE.Group();
  const skinned = new THREE.SkinnedMesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshBasicMaterial());
  g3.add(skinned);
  check('fit: a SkinnedMesh marks the prop as rigged', isRigged(g3) === true);
}

// --- 29. readPrefitMeta / attachPrefittedGroup keep a baked pose on re-load ---
{
  const { rig, ids } = riggedTube();
  const baked = new THREE.Group();
  baked.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2)));
  baked.position.set(0.3, 0.15, 0.05); // the baked LOCAL TRS under the socket bone
  baked.userData = { championFit: ids[1], championSlot: ids[1], fitLocal: true };
  const meta = readPrefitMeta(baked);
  check('fit: reads baked bone key, slot and fitLocal', meta.fitKey === ids[1] && meta.slot === ids[1] && meta.fitLocal === true);

  const metaOnChild = readPrefitMeta((() => { const g = new THREE.Group(); const c = new THREE.Group(); g.add(c); c.userData.championFit = ids[2]; return g; })());
  check('fit: meta found on a nested node too', metaOnChild.fitKey === ids[2]);

  const plain = new THREE.Group();
  plain.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1)));
  check('fit: plain piece carries no prefit meta', readPrefitMeta(plain).fitKey === undefined);

  const bone = attachPrefittedGroup(baked, rig, ids[1]);
  check('fit: fitLocal attach parents under the named joint and keeps the baked TRS',
    bone === rig.bones.get(ids[1]) && baked.parent === bone && baked.position.distanceTo(new THREE.Vector3(0.3, 0.15, 0.05)) < 1e-6);
  check('fit: prefit attach with unknown bone -> null', attachPrefittedGroup(new THREE.Group(), rig, 'nope') === null);
}

// --- 29 (cont.) Legacy world-relative prefit attach falls back to the joint origin ---
{
  const { rig, ids } = riggedTube();
  const target = rig.bones.get(ids[2]);
  const bonePos = target.getWorldPosition(new THREE.Vector3());

  // Legacy world-relative bake: TRS reset, then attach() places the piece at the joint ORIGIN
  // (authored mesh offsets live inside the piece). Still live in fit.js, so still tested.
  const legacy = new THREE.Group();
  legacy.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2)));
  legacy.position.set(999, 999, 999); // garbage local TRS — the legacy path must ignore it
  const bone2 = attachPrefittedGroup(legacy, rig, ids[2]);
  const stayed = legacy.getWorldPosition(new THREE.Vector3());
  check('fit: legacy attach walks to the joint', bone2 === target);
  check('fit: legacy attach places piece at the joint origin', stayed.distanceTo(bonePos) < 1e-4);
}

// --- 30. Gizmo transforms undo via a transform LEDGER (no full-document reset) ---
{
  const s = new StudioScene();
  s.addPrimitive('box', 0xff0000);
  const box = s.shapes.find((m) => m.name === 'box-1');
  const before = { p: box.position.toArray(), q: box.quaternion.toArray(), s: box.scale.toArray() };
  box.scale.set(2.5, 2.5, 2.5); // "after" a gizmo drag
  const after = { p: box.position.toArray(), q: box.quaternion.toArray(), s: box.scale.toArray() };
  s.pushTransform([{ mesh: box, before, after }]);
  check('transform-ledger: scale at 2.5 before undo', Math.abs(box.scale.x - 2.5) < 1e-6);
  s.undo();
  check('transform-ledger: undo restores scale to 1 without resetting scene', Math.abs(box.scale.x - 1) < 1e-6);
  check('transform-ledger: same mesh object persists (no rebuild)', s.shapes[0] === box);
  s.redo();
  check('transform-ledger: redo re-applies scale to 2.5', Math.abs(box.scale.x - 2.5) < 1e-6);
}

// --- 31. Transform-ledger undo preserves a RIGGED shape's scale (no full-document reset) ---
{
  const { s, mesh } = riggedTube();
  const before = { p: mesh.position.toArray(), q: mesh.quaternion.toArray(), s: mesh.scale.toArray() };
  mesh.scale.set(3, 3, 3);
  const after = { p: mesh.position.toArray(), q: mesh.quaternion.toArray(), s: mesh.scale.toArray() };
  s.pushTransform([{ mesh, before, after }]);
  s.undo();
  check('transform-ledger: rigged shape scale restored on undo', Math.abs(mesh.scale.x - 1) < 1e-6 && s.shapes[0] === mesh);
  s.redo();
  check('transform-ledger: rigged shape scale re-applied on redo', Math.abs(mesh.scale.x - 3) < 1e-6);
}

// --- 32. A skinned outline tracks the source's actual (rescaled) size ---
{
  const { s, mesh } = riggedTube();
  s.select(mesh);
  const outline = s.outlines.get(mesh);
  check('skinned-outline: exists', !!outline && outline.isSkinnedMesh === true);
  mesh.scale.set(3, 3, 3);
  s.syncOutlines();
  check('skinned-outline: follows rescaled size (no longer pinned to ~idle)', outline.scale.x > 2.5);
  check('skinned-outline: grew when the source grew', Math.abs(outline.scale.x - 3) < 1.2);
}

// --- 33. Gear names come from the filename, and clearAll empties the wardrobe ---
{
  const { s } = riggedTube();
  const tc = { detach: () => {} };
  const toast = { show: () => {}, error: () => {} };
  const fc = new FitController(s, tc, toast);
  const raw = new THREE.Group();
  raw.name = 'red-samurai-helmet';
  raw.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshStandardMaterial()));
  fc.addGear(raw);
  check('gear-name: wardrobe entry uses filename', fc.wardrobe.length === 1 && fc.wardrobe[0].name === 'red-samurai-helmet');
  let leaf = null;
  raw.traverse((o) => { if (o.isMesh) leaf = o.name; });
  check('gear-name: leaf mesh shows filename (not Gear_)', leaf === 'red-samurai-helmet');
  fc.clearAll();
  check('gear-clear: clearAll empties wardrobe', fc.wardrobe.length === 0);
}

// --- 34b. Snapshot/persistence keeps a RIGGED shape's node transform and rendered size ---
{
  const ext = (m) => {
    m.updateWorldMatrix(true, true);
    const v = new THREE.Vector3();
    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    const pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      min.min(v);
      max.max(v);
    }
    return max.sub(min).toArray();
  };
  const { s, mesh } = riggedTube();
  mesh.scale.set(2.5, 2.5, 2.5);
  mesh.rotation.set(0, 0.5, 0);
  const live = ext(mesh);
  const s2 = new StudioScene();
  restoreSnapshot(s2, takeSnapshot(s));
  const rest = s2.shapes.find((m) => m.name === 'tube');
  check('snapshot-rigged: scale survives on the node', !!rest && Math.abs(rest.scale.x - 2.5) < 1e-6);
  check('snapshot-rigged: rotation survives on the node', !!rest && Math.abs(rest.rotation.y - 0.5) < 1e-6);
  check('snapshot-rigged: rendered size matches live (nothing baked twice)',
    !!rest && ext(rest).every((v, i) => Math.abs(v - live[i]) < 1e-6));
}

// --- 35. Clearing the skeleton UNBINDS (not destroys) fitted gear ---
{
  const { s } = riggedTube();
  const fc = new FitController(s, { detach: () => {} }, { show: () => {}, error: () => {} });
  const raw = new THREE.Group();
  raw.name = 'shoulder-pad';
  raw.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshStandardMaterial()));
  fc.addGear(raw);
  check('gear-unbind: seated before clear (bound to a bone)', !!fc.wardrobe[0].boneKey);
  s.clearRig();
  check('gear-unbind: unbound after skeleton clear', fc.wardrobe[0].boneKey === null);
  check('gear-unbind: gear reparented to scene root', fc.wardrobe[0].group.parent === s.threeScene);
}

// --- 36. additive joint selection coexists with shape multi-selection; non-additive clears it ---
{
  const { s, rig, ids } = riggedTube();
  const box = s.addPrimitive('box');
  const sphere = s.addPrimitive('sphere');
  const hips = rig.bones.get(ids[0]);
  const spine = rig.bones.get(ids[1]);
  s.select(box);
  s.select(sphere, true);
  s.select(hips, true); // shift-click a joint on top of the shape multi-select
  check('joint-multi: shape selection kept', s.selection.size === 2);
  check('joint-multi: joint recorded', s.selectedJoints.size === 1 && s.selectedJoints.has(hips));
  check('joint-multi: primary is the joint', s.selected === hips);
  s.select(spine, true); // add a second joint -> now two joints
  check('joint-multi: two joints + two shapes coexist', s.selectedJoints.size === 2 && s.selection.size === 2);
  s.select(spine, true); // toggle it back off
  check('joint-multi: toggling a joint off works', s.selectedJoints.size === 1 && !s.selectedJoints.has(spine));
  s.select(sphere); // plain (non-additive) click on a shape clears everything
  check('joint-multi: plain select clears joints', s.selectedJoints.size === 0 && s.selection.size === 1);
}

// --- 38. bound gear leaf outline hugs the source (no double-baked world offset) ---
{
  const { s, rig } = riggedTube();
  const targetBone = [...rig.bones.values()][0];
  const group = new THREE.Group();
  group.name = 'gear-group';
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshStandardMaterial());
  leaf.name = 'leaf';
  leaf.position.set(0.1, 0.2, 0);
  group.add(leaf);
  group.position.set(0, 1.2, 0.5);
  group.rotation.set(0, 0.4, 0);
  s.threeScene.add(group);
  targetBone.add(group);
  group.updateMatrixWorld(true, true);
  leaf.updateMatrixWorld(true, true);
  const lw = leaf.matrixWorld.elements;
  s.mode = 'rig';
  s.select(leaf);
  s.syncHighlights();
  const outline = s.outlines.get(leaf);
  outline.updateMatrixWorld(true, true);
  const o = outline.matrixWorld.elements;
  check('gear-outline: outline world position matches leaf (no double-bake)',
    Math.abs(o[12] - lw[12]) < 1e-4 && Math.abs(o[13] - lw[13]) < 1e-4 && Math.abs(o[14] - lw[14]) < 1e-4);
}

// --- 46. pick: a joint ball BEHIND a shape must not steal the click (r185 raycaster) ---
{
  const box = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
  box.position.set(0, 0, 0);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), new THREE.MeshBasicMaterial());
  ball.position.set(0, 0, -2); // hidden behind the box (box spans z in [-1, 1]) from the camera side
  ball.userData.isJointBall = true;
  ball.userData.boneName = 'joint-Z';
  box.updateMatrixWorld(true);
  ball.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 0, 5), new THREE.Vector3(0, 0, -1));
  const hits = ray.intersectObjects([ball, box], false);
  const ballHit = hits.find((h) => h.object.userData.isJointBall);
  const meshHit = hits.find((h) => h.object.isMesh && !h.object.userData.isJointBall);
  check('pick: ray hits both the box and the hidden ball', !!ballHit && !!meshHit);
  check('pick: the ball is further than the box (occluded)', ballHit.distance > meshHit.distance);
  const oldPicksBall = !!ballHit; // old code: hits.find(isJointBall) ignores depth
  check('pick: old ball-first rule would select the joint', oldPicksBall);
  const ballWins = ballHit && (!meshHit || ballHit.distance <= meshHit.distance);
  check('pick: new depth rule selects the box (shape clickable again)', !ballWins);
}

// --- 46b. pick: in Rig/Pose a joint ball is reached even from BEHIND the surface (x-ray balls) ---
{
  const { s, rig, ids } = riggedTube();
  const ball = rig.balls.get(ids[1]); // inside the tube at (0, 1, 0)
  const ray = new THREE.Raycaster(new THREE.Vector3(5, 1, 0), new THREE.Vector3(-1, 0, 0));
  const ballHits = ray.intersectObjects([...rig.balls.values()], false);
  const surfaceHits = ray.intersectObject(s.shapes[0], false);
  check('pick: the ray reaches the ball inside the model, behind the surface',
    ballHits.length > 0 && ballHits[0].object === ball && surfaceHits.length > 0 && surfaceHits[0].distance < ballHits[0].distance);
  check('pick: balls draw x-ray and are picked first, so a joint inside the model can always be tapped again',
    ball.material.depthTest === false && ball.renderOrder > 0);
}

// --- 47. setSculptedResult writes geometry back and flags the shape custom ---
{
  const s = new StudioScene();
  const box = s.addPrimitive('box');
  const att = box.geometry.attributes.position;
  const before = att.array.slice();
  const mod = before.slice();
  mod[6] += 0.4; mod[7] -= 0.2; mod[8] += 0.3; // tug a few vertices
  s.setSculptedResult(box, mod, null, null);
  const after = box.geometry.attributes.position.array.slice();
  check('sculpt-result: vertex 2 written exactly', Math.abs(after[6] - (before[6] + 0.4)) < 1e-6 && Math.abs(after[7] - (before[7] - 0.2)) < 1e-6);
  check('sculpt-result: untouched vertices unchanged', Math.abs(after[0] - before[0]) < 1e-6 && Math.abs(after[12] - before[12]) < 1e-6);
  const n = box.geometry.attributes.normal.array;
  check('sculpt-result: normals recomputed (finite)', n.every((v) => Number.isFinite(v)));
  check('sculpt-result: shape flagged custom for persistence',
    box.userData.kind === 'custom' && box.userData.sculpted === true && box.userData.geoCustom === true);
}

// --- 48. sculpted (custom) geometry survives a snapshot round-trip ---
{
  const s = new StudioScene();
  const box = s.addPrimitive('box');
  box.position.set(0.2, 0.4, 0.1);
  const att = box.geometry.attributes.position;
  const mod = att.array.slice();
  for (let i = 3; i < mod.length; i += 7) mod[i] += 0.11; // wavy perturbation
  s.setSculptedResult(box, mod, null, null);
  const snap = takeSnapshot(s);
  const obj = snap.objects.find((o) => o.name === 'box-1');
  check('sculpt-snapshot: kind stored as custom', obj.kind === 'custom');
  check('sculpt-snapshot: geometry arrays persisted', obj.geo && obj.geo.positions && obj.geo.positions.length === mod.length);
  const s2 = new StudioScene();
  restoreSnapshot(s2, snap);
  const rest = s2.shapes.find((m) => m.name === 'box-1');
  const p2 = rest.geometry.attributes.position.array.slice();
  const same = p2.every((v, i) => Math.abs(v - mod[i]) < 1e-5);
  check('sculpt-snapshot: restored positions identical', same);
  check('sculpt-snapshot: restored shape is custom', rest.userData.geoCustom === true && rest.userData.kind === 'custom');
  check('sculpt-snapshot: unbound transform restored',
    Math.abs(rest.position.x - 0.2) < 1e-6 && Math.abs(rest.position.y - 0.4) < 1e-6);
}

// --- 50. clay remesh: box gains a sculptable vertex grid (density) ---
{
  const box = new THREE.BoxGeometry(1, 1, 1);
  const rawPos = box.attributes.position.array;
  const rawIdx = box.index ? box.index.array : null;
  const r = prepareForSculpt(rawPos, rawIdx);
  check('remesh: box starts as 24 verts, 12 triangles (8 real corners)', box.attributes.position.count === 24 && rawIdx.length === 36);
  check('remesh: box subdivided well past 8 vertices', r.index.length / 3 >= 600 && r.positions.length / 3 >= 300);
  check('remesh: box is indexed + finite', r.index instanceof Uint32Array && r.positions.every((v) => Number.isFinite(v)));
  // watertight: every edge is shared by exactly two faces (no open seams)
  const edgeCount = new Map();
  const pushEdge = (a, b) => { const k = a < b ? a + ':' + b : b + ':' + a; edgeCount.set(k, (edgeCount.get(k) || 0) + 1); };
  for (let i = 0; i < r.index.length; i += 3) {
    pushEdge(r.index[i], r.index[i + 1]); pushEdge(r.index[i + 1], r.index[i + 2]); pushEdge(r.index[i + 2], r.index[i]);
  }
  const open = [...edgeCount.values()].filter((c) => c !== 2).length;
  check('remesh: cube is watertight (no boundary edges)', open === 0);
}

// --- 51. clay remesh: welding closes the seams (box corners + sphere) ---
{
  const box = new THREE.BoxGeometry(1, 1, 1);
  const w = weld(box.attributes.position.array, box.index ? box.index.array : null);
  check('remesh-weld: space has 24 verts but only 8 unique corners', box.attributes.position.count === 24 && w.positions.length / 3 === 8);
  check('remesh-weld: 16 coincident corner copies collapsed', w.merged === 16);
  const sph = new THREE.SphereGeometry(0.5, 32, 24);
  const ws = weld(sph.attributes.position.array, sph.index.array);
  check('remesh-weld: sphere seam duplicates collapsed (< raw verts)', ws.positions.length / 3 < sph.attributes.position.count);
  // the seam was closed: the welding produced a uniform shared index where
  // every edge is again interior
  const edgeCount = new Map();
  const pushEdge = (a, b) => { const k = a < b ? a + ':' + b : b + ':' + a; edgeCount.set(k, (edgeCount.get(k) || 0) + 1); };
  for (let i = 0; i < ws.index.length; i += 3) {
    pushEdge(ws.index[i], ws.index[i + 1]); pushEdge(ws.index[i + 1], ws.index[i + 2]); pushEdge(ws.index[i + 2], ws.index[i]);
  }
  const open = [...edgeCount.values()].filter((c) => c !== 2).length;
  check('remesh-weld: sphere is watertight after weld', open === 0);
}

// --- 52. sculpting cannot open holes: topology survives displacement ---
{
  const box = new THREE.BoxGeometry(1, 1, 1);
  const r = prepareForSculpt(box.attributes.position.array, box.index ? box.index.array : null);
  const positions = r.positions.slice();
  // an exaggerated Push/ Pull stroke on a cube EDGE region (the reported gap spot)
  const cx = 0.51, cz = 0.0;
  for (let i = 0; i < positions.length; i += 3) {
    const d = Math.hypot(positions[i] - cx, positions[i + 1], positions[i + 2] - cz);
    if (d < 0.22) { positions[i] += (positions[i] - cx) * 0.8; positions[i + 2] += (positions[i + 2] - cz) * 0.8; }
  }
  const edgeCount = new Map();
  const pushEdge = (a, b) => { const k = a < b ? a + ':' + b : b + ':' + a; edgeCount.set(k, (edgeCount.get(k) || 0) + 1); };
  for (let i = 0; i < r.index.length; i += 3) {
    pushEdge(r.index[i], r.index[i + 1]); pushEdge(r.index[i + 1], r.index[i + 2]); pushEdge(r.index[i + 2], r.index[i]);
  }
  const open = [...edgeCount.values()].filter((c) => c !== 2).length;
  check('sculpt-seams: displaced topology is still watertight', open === 0);
}

// --- 53. dense sculpted shapes drop the skin and write back; a reload keeps the dense count and the skeleton ---
{
  const { s, mesh } = riggedTube();
  const prep = prepareForSculpt(mesh.geometry.attributes.position.array, mesh.geometry.index ? mesh.geometry.index.array : null);
  const pos = prep.positions.slice();
  for (let i = 3; i < pos.length; i += 9) pos[i] += 0.05; // dent part of the dense grid
  const back = s.setSculptedResult(mesh, pos, prep.index, null, prep.positions);
  const denser = back.geometry.attributes.position.count;
  check('sculpt-dense: the skin is dropped and the geometry is written back',
    !back.isSkinnedMesh && back.parent === s.group && denser === prep.positions.length / 3 && denser > 100);
  const s2 = new StudioScene();
  restoreSnapshot(s2, takeSnapshot(s));
  const restored = s2.shapes.find((m) => m.name === 'tube');
  check('sculpt-dense: restored shape keeps the dense vertex count and the skeleton',
    !!restored && restored.geometry.attributes.position.count === denser && !!s2.rig && s2.rig.graph.size === 3);
}

// --- 54. sharpenNormals: cube corners regain flat (axis-aligned) shading ---
{
  const box = new THREE.BoxGeometry(1, 1, 1);
  const prep = prepareForSculpt(box.attributes.position.array, box.index ? box.index.array : null);
  const s = sharpenNormals(prep.positions, prep.index);
  // crease-splitting duplicates every vertex that touches two faces at 90°, so the
  // render copy has MORE vertices than the welded work mesh ...
  check('sharpen: box render copy grew past the welded mesh', s.positions.length / 3 > prep.positions.length / 3);
  check('sharpen: box still indexed with the same tri count', s.index.length === prep.index.length);
  // ... and EVERY normal is now axis-aligned (a hard box must shade flat, not
  // average the three faces meeting at a corner into a rounded blob)
  let axisAligned = s.normals.length > 0;
  for (let i = 0; i < s.normals.length; i += 3) {
    const dominant = Math.max(Math.abs(s.normals[i]), Math.abs(s.normals[i + 1]), Math.abs(s.normals[i + 2]));
    if (dominant < 0.95) { axisAligned = false; break; }
  }
  check('sharpen: every box normal is flat (axis-aligned), no rounded averaging', axisAligned);
  check('sharpen: box normals finite', s.normals.every((v) => Number.isFinite(v)));
  // remap is parallel to the output: each render vertex points back at its work row
  check('sharpen: remap maps every render vertex to a work vertex', s.positions.length / 3 === s.remap.length && s.remap.every((r) => r >= 0 && r < prep.positions.length / 3));
  // matching coordinates: the sharp copy is a display-only copy, it never moved the surface
  let sameShape = true;
  for (let r = 0; r < s.remap.length; r++) {
    const i = r * 3, v = s.remap[r] * 3;
    if (Math.abs(s.positions[i] - prep.positions[v]) > 1e-6 || Math.abs(s.positions[i + 1] - prep.positions[v + 1]) > 1e-6 || Math.abs(s.positions[i + 2] - prep.positions[v + 2]) > 1e-6) { sameShape = false; break; }
  }
  check('sharpen: coordinates are copied verbatim (surface shape untouched)', sameShape);
}

// --- 55. sharpenNormals: smooth surfaces stay smooth (no flat facets) ---
{
  const sph = new THREE.SphereGeometry(0.5, 32, 24);
  const prep = prepareForSculpt(sph.attributes.position.array, sph.index.array);
  const s = sharpenNormals(prep.positions, prep.index);
  // a sphere has no real creases: every (vertex, face) deviation is ~2°, far under
  // the 25° crease threshold → NOTHING is split → the render copy is identical
  check('sharpen: sphere render copy is unchanged (no split)', s.positions.length === prep.positions.length && s.index.length === prep.index.length);
  check('sharpen: sphere normals finite', s.normals.every((v) => Number.isFinite(v)));
  // normals are not degenerately flat: a smooth sphere must still have direction variety
  const dirs = new Set();
  for (let i = 0; i < s.normals.length; i += 3) dirs.add([s.normals[i], s.normals[i + 1], s.normals[i + 2]].map((c) => c.toFixed(3)).join(','));
  check('sharpen: sphere keeps a rich spread of normals (>50 distinct)', dirs.size > 50);
}

// --- 56. remesh density: sculpt targets are genuinely high-res ---
{
  const box = new THREE.BoxGeometry(1, 1, 1);
  const rb = prepareForSculpt(box.attributes.position.array, box.index ? box.index.array : null);
  const sph = new THREE.SphereGeometry(0.5, 32, 24); // the app's actual sphere
  const rs = prepareForSculpt(sph.attributes.position.array, sph.index.array);
  // "way more vertices than before": boxes reach ~6k+ vertices, and the app's
  // sphere reaches the SAME CLASS as the ~10k reference (one subdivision band
  // around it) instead of the old ~800-vertex blob
  check('remesh-density: box reaches thousands of triangles', rb.index.length / 3 >= 8000 && rb.index.length / 3 <= 20000);
  check('remesh-density: box reaches ~6k+ vertices', rb.positions.length / 3 >= 4000);
  check('remesh-density: sphere reaches tens of thousands of triangles', rs.index.length / 3 >= 16000 && rs.index.length / 3 <= 26000);
  check('remesh-density: sphere nears but stays near the ~10k vertex reference', rs.positions.length / 3 >= 8000 && rs.positions.length / 3 <= 14000);
  check('remesh-density: both stay under the vertex ceiling', rb.positions.length / 3 <= 30000 && rs.positions.length / 3 <= 30000);
}

// --- 57. dressed GLB export: skin.joints must be real node indices, NOT null ---
// three r185's SkinnedMesh.copy() shares the live Skeleton, so a deep-cloned bake
// used to write joints: [null, ...] (invalid glTF - Blender refuses to open it).
{
  const { s } = riggedTube();
  let arrayBuffer = null;
  let bakeError = null;
  try {
    arrayBuffer = await bakeDressed(s, []);
  } catch (e) {
    bakeError = e;
  }
  check('dressed-bake: bake produces a binary buffer', !!arrayBuffer && !bakeError);
  const skins = [];
  const nodes = [];
  if (arrayBuffer) {
    const buf = new Uint8Array(arrayBuffer);
    const jsonLen = new DataView(arrayBuffer).getUint32(12, true);
    const json = JSON.parse(new TextDecoder().decode(buf.subarray(20, 20 + jsonLen)));
    skins.push(...(json.skins || []));
    nodes.push(...(json.nodes || []));
  }
  check('dressed-bake: exported GLB has one skin over the three joints', skins.length === 1 && skins[0].joints.length === 3);
  check('dressed-bake: every skin.joints entry is a valid node index (no nulls)',
    skins.length === 1 && skins.every((sk) => sk.joints.every((j) => Number.isInteger(j) && j >= 0 && j < nodes.length) && Number.isInteger(sk.skeleton) && sk.skeleton >= 0));
  check('dressed-bake: joints reference the tapped joints by id',
    skins.length === 1 && skins.every((sk) => sk.joints.every((j) => /^j\d+$/.test((nodes[j] && nodes[j].name) || ''))));
}

// --- 58. dressed GLB export: each fitted gear is exported exactly ONCE, flagged isGear ---
// bakeDressed used to export each piece twice — the live seat riding the bone inside
// studio.group.clone(true) had already been baked, and the pristine re-add appended a
// second un-flagged copy. On re-import that produced a Gear-submenu piece AND a stray
// Shapes-submenu duplicate in the same spot.
{
  const { s, rig, ids } = riggedTube();
  const fc = new FitController(s, { detach: () => {} }, { show: () => {}, error: () => {} });
  const raw = new THREE.Group();
  raw.name = 'red-samurai-helmet';
  raw.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshStandardMaterial()));
  fc.addGear(raw);
  const entry = fc.wardrobe[0];
  check('dressed-onegear: gear loaded into wardrobe', entry && !!entry.group && !!entry.pristine);
  if (entry) {
    const head = rig.bones.get(ids[2]);
    fc.beginMutation('seat');
    fc.seatToBone(entry, head);
    fc.endMutation();
    check('dressed-onegear: gear seated on the named joint', entry.boneKey === ids[2]);

    let arrayBuffer = null;
    let bakeError = null;
    try {
      arrayBuffer = await bakeDressed(s, [entry]);
    } catch (e) {
      bakeError = e;
    }
    check('dressed-onegear: bake produces a binary buffer', !!arrayBuffer && !bakeError);

    if (arrayBuffer) {
      const buf = new Uint8Array(arrayBuffer);
      const dv = new DataView(arrayBuffer);
      const jsonLen = dv.getUint32(12, true);
      const json = JSON.parse(new TextDecoder().decode(buf.subarray(20, 20 + jsonLen)));
      const nodes = json.nodes || [];
      const meshNodes = nodes.map((n, i) => ({ i, n })).filter(({ n }) => n.mesh !== undefined);
      const gearMeshes = [];
      for (const { i, n } of meshNodes) {
        if (n.skin !== undefined) continue;             // skinned champion shapes
        if (n.extras && n.extras.isJointBall) continue; // joint balls
        if (n.extras && n.extras.isRigLink) continue;   // link lines
        if (n.extras && n.extras.isOutline) continue;   // outlines
        const isBone = (idx) => !!nodes[idx] && !!nodes[idx].name && /^j\d+$/.test(nodes[idx].name || '');
        let parentIdx = nodes.findIndex((c, ci) => c.children && c.children.includes(i));
        let underBone = isBone(parentIdx);
        let guard = 0;
        while (!underBone && parentIdx >= 0 && guard++ < 20) {
          const gp = nodes.findIndex((c, ci) => c.children && c.children.includes(parentIdx));
          parentIdx = gp;
          underBone = isBone(parentIdx);
        }
        if (underBone) gearMeshes.push({ nodeIdx: i, name: n.name, extras: n.extras || {}, under: nodes[parentIdx] && nodes[parentIdx].name });
      }
      check('dressed-onegear: exactly ONE non-skinned gear node survives under a bone',
        gearMeshes.length === 1);
      check('dressed-onegear: surviving gear node re-imports under the Gear submenu (isGear extras)',
        gearMeshes.length === 1 && gearMeshes[0].extras.isGear === true);
    }
  }
}

// --- import-plain: a GLB with no skin or bones is added exactly as it is, and makes no rig ---
{
  const s = new StudioScene();
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
  check('import-plain: plain imports are not touched',
    s.adoptImportedRig(group) === null && s.rig == null && s.shapes.length === 1 && group.parent === s.group);
}

/**
 * Import one spec file and run it, as its OWN unit.
 *
 * This used to be a bare `await import(...)` followed by `mod.default(check)`. A spec that failed
 * to PARSE, or threw while running, took the entire run down with it: no summary line, no counts,
 * nothing but a stack — which reads exactly like a clean failure and cost this project a wasted
 * review round. Now a bad spec is ONE failed check with its own name on it, and every other spec
 * still runs and still reaches the summary.
 *
 * @param {string} href module URL to import
 * @param {string} label how the spec is named in a failure line
 * @param {(name: string, cond: boolean) => void} report where results go — `check`, or a recorder
 *   in the self-test below, which is why this takes the reporter instead of closing over `check`.
 */
async function runSpec(href, label, report) {
  let mod;
  try {
    mod = await import(href);
  } catch (err) {
    report(`spec ${label}: could not be loaded (${(err && err.message) || err})`, false);
    return;
  }
  if (typeof mod.default !== 'function') {
    report(`spec ${label}: has no default export to run`, false);
    return;
  }
  try {
    await mod.default(report);
  } catch (err) {
    report(`spec ${label}: threw while running (${(err && err.message) || err})`, false);
  }
}

/**
 * Run every `*.spec.js` in one tests directory, each spec as its own unit. This is THE discovery
 * path — the self-test below drives this exact function over a throwaway directory, so a revert to
 * a bare `await import()` loop inside it turns that self-test red rather than passing unnoticed.
 * @returns {Promise<number>} how many spec files were seen
 */
async function runSpecsIn(dir, moduleName, report) {
  const { readdirSync, existsSync } = await import('node:fs');
  if (!existsSync(dir)) return 0;
  const files = readdirSync(dir).filter((n) => n.endsWith('.spec.js')).sort();
  for (const f of files) await runSpec(new URL(f, dir).href, `${moduleName}/${f}`, report);
  return files.length;
}

// Module tests live in src/<module>/tests/*.spec.js and are discovered here so that many
// plan tasks can add tests without editing this file concurrently.
for (const module of ['ai', 'edit', 'rig', 'ui', 'shop']) {
  await runSpecsIn(new URL(`./src/${module}/tests/`, import.meta.url), module, check);
}

// --- runner: a broken spec must not take the suite down ---
// Driven over a REAL throwaway directory of REAL spec files, through the same runSpecsIn the loop
// above uses — because the bug being guarded is in the walk, not in one import. The directory lives
// in the OS temp dir and is deleted again, so the repo never carries a permanently-red spec.
{
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const { pathToFileURL } = await import('node:url');
  const dir = mkdtempSync(join(tmpdir(), '3d-studio-runner-'));
  writeFileSync(join(dir, 'a-unparsable.spec.js'), 'export default function ( {');
  writeFileSync(join(dir, 'b-throwing.spec.js'), 'export default function () { throw new Error("boom"); }');
  writeFileSync(join(dir, 'c-no-default.spec.js'), 'export const nothing = 1;');
  writeFileSync(join(dir, 'd-good.spec.js'), 'export default function (c) { c("inner check ran", true); }');
  const seen = [];
  const record = (name, cond) => seen.push([name, !!cond]);
  let walkError = null;
  let count = 0;
  try {
    count = await runSpecsIn(new URL(pathToFileURL(dir).href + '/'), 'fixture', record);
  } catch (err) {
    walkError = err;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  check('runner: a directory holding three broken specs does not throw out of the walk', walkError === null && count === 4);
  check('runner: a spec that cannot be parsed is ONE failed check, not a dead run',
    seen.length === 4 && seen[0][1] === false && /fixture\/a-unparsable\.spec\.js: could not be loaded/.test(seen[0][0]));
  check('runner: a spec that throws while running is ONE failed check, and names the error',
    seen.length === 4 && seen[1][1] === false && /fixture\/b-throwing\.spec\.js: threw while running \(boom\)/.test(seen[1][0]));
  check('runner: a spec with no default export is reported, never skipped silently',
    seen.length === 4 && seen[2][1] === false && /fixture\/c-no-default\.spec\.js: has no default export/.test(seen[2][0]));
  check('runner: the specs after a broken one still run and still report',
    seen.length === 4 && seen[3][0] === 'inner check ran' && seen[3][1] === true);
}

// Async specs must settle before their result is counted, including rejection.
{
  const seen = [];
  const report = (name, ok) => seen.push([name, ok]);
  await runSpec('data:text/javascript,' + encodeURIComponent('export default async function(c) { await new Promise(r => setTimeout(r, 5)); c("awaited async", true); }'), 'async-ok', report);
  check('runner: async checks finish before the suite moves on', seen.length === 1 && seen[0][0] === 'awaited async' && seen[0][1]);
  await runSpec('data:text/javascript,' + encodeURIComponent('export default async function() { await Promise.resolve(); throw Error("async failure"); }'), 'async-fail', report);
  check('runner: async rejection is counted as a failed spec', seen.length === 2 && seen[1][1] === false && /async failure/.test(seen[1][0]));
}

// --- runner: the REAL discovery loop is the guarded one (source pin) ---
// The checks above prove runSpecsIn is safe; this one proves the suite actually goes through it.
// Without it, reverting the loop to a bare import would leave every check above green.
{
  const { readFileSync } = await import('node:fs');
  const self = readFileSync(new URL('./run-tests.mjs', import.meta.url), 'utf8');
  const loop = self.slice(self.indexOf('// Module tests live in'), self.indexOf('// --- runner: a broken spec'));
  check('runner: the module-tests loop goes through runSpecsIn, not a bare import',
    /runSpecsIn\(/.test(loop) && !/await import\(/.test(loop) && !/\.default\(/.test(loop));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);