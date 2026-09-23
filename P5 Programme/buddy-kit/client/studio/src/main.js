import { parseGLBBuffer } from './fit/fit.js';
import { openChampion, session, studioSection, championShop, encodeProject, decodeProject } from './champion.js';
import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
// style.css is loaded by a <link> in index.html, not imported here: a JS-imported stylesheet is
// injected at runtime in dev, which left the page unstyled until this module's entire graph had
// loaded. Importing it here as well would make the build emit it twice.
import { StudioScene } from './scene.js';
import { Viewport } from './viewport.js';
import { ModeBar } from './ui/modes.js';
import { Toolbar } from './ui/toolbar.js';
import { TreePanel } from './ui/tree.js';
import { PropertyPanel } from './ui/properties.js';
import { Toast } from './ui/toast.js';
import { RigController } from './ui/rig-controller.js';
import { RigToolbar } from './ui/rig-toolbar.js';
import { RigAuto } from './ui/rig-auto.js';
import { MotionPanel } from './ui/motion-panel.js';
import { motionClips } from './rig/motion.js';
import { clone as cloneRiggedScene } from 'three/addons/utils/SkeletonUtils.js';
import { BindScheduler } from './rig/bind-scheduler.js';
import { importGLBFile, exportGLB, downloadGLB } from './io/gltf.js';
import { CityExportPanel } from './ui/city-export-panel.js';
import { applyGroupDelta } from './edit/group-transform.js';
import { takeSnapshot, restoreSnapshot } from './edit/snapshot.js';
import { setWireframe } from './edit/material-ops.js';
import { FitController } from './fit/fit-controller.js';
import { createClayStudio } from './clay/clay.js';
import { AIPanel } from './ui/ai-panel.js';
import { GenPanel } from './ui/gen-panel.js';
import { createShop } from './ui/shop.js';
import { createGenService } from './ai/gen-service.js';
import { createHfSpacesProvider } from './ai/gen-providers/hf-spaces.js';
import { createFalProvider } from './ai/gen-providers/fal.js';
import { createTencentTokenHubProvider } from './ai/gen-providers/tencent-tokenhub.js';
import { loadGenConfig } from './ai/gen-config.js';
import { captureViews, splitGridBlob } from './ai/gen-snapshot.js';
import { bakeAndPlace, commitGeneratedModel, disposeModel } from './ai/gen-place.js';
import {
  addObjects,
  replaceSelection,
  selectionCentroid,
  payloadCentroid,
  payloadMinY,
} from './ai/insert.js';
import {
  loadAppState,
} from './persist.js';
// Decisions lifted out of this file so the suite can reach them: this module builds a
// WebGLRenderer at module scope, so Node can never import it, and anything left in here is
// invisible to `npm test` no matter how many checks are written.
import { captureTRS, trsChanged } from './edit/trs.js';
import { scaleWithProportions } from './edit/proportional-scale.js';
import { isTyping } from './ui/keys.js';
import { clampSplitRatio, splitRatioAt } from './ui/split.js';

const studio = new StudioScene();
const viewport = (() => {
  try {
    return new Viewport(document.getElementById('viewport'), studio);
  } catch (err) {
    console.error(err);
    document.getElementById('viewport').innerHTML =
      '<div style="color:#ffc34a;padding:20px;font-family:sans-serif">Could not start the 3D view ' +
      '(WebGL is not available). Try a different browser, or restart this one.</div>';
    throw err;
  }
})();
const toast = new Toast(document.getElementById('toast'));

// ---- Clay studio (integrated) ----
const clay = createClayStudio();
window.__clay = clay;
// debug seam (see HIDDEN-FEATURES.md): poke the live scene from the console
window.__studio = studio;

/** Open the Clay Studio with a single shape. Done writes the sculpt (geometry +
 * any paint) back via setSculptedResult AFTER pushing an undo unit, so Undo
 * restores the pre-sculpt shape and Redo replays the sculpt. */
function openClayFor(mesh) {
  if (!mesh || !mesh.isMesh || !mesh.geometry || !mesh.geometry.attributes.position) return;
  clay.open(
    {
      name: mesh.name,
      positions: mesh.geometry.attributes.position.array,
      index: mesh.geometry.index ? mesh.geometry.index.array : null,
    },
    {
      onDone() {
        const g = clay.api.geometry();
        if (g && g.positions) {
          const paint = clay.api.paintCoverage() > 0.003 ? clay.api.paintData() : null;
          const progressed = paint || clay.api.maxDisplacement() > 1e-4;
          if (progressed) {
            studio.pushUndo();
            const back = studio.setSculptedResult(mesh, g.positions, g.index, paint, g.basePos);
            studio.syncHighlights();
            studio.select(back || mesh);
            toast.show('Sculpted — it is back in your scene! ✨');
          } else {
            toast.show('No sculpting done, so the shape is unchanged.');
          }
        }
      },
      onCancel() {
        toast.show('Sculpt cancelled — the shape is unchanged.');
      },
    },
  );
}

// ---- Transform gizmo ----
const transformControls = new TransformControls(viewport.camera, viewport.renderer.domElement);
transformControls.setSize(1.1);
window.__transformControls = transformControls; // real interaction seam for headed transform checks
const gizmo = transformControls.getHelper();
gizmo.userData.isGizmo = true;
studio.threeScene.add(gizmo);

// Pivot for transforming several selected shapes at once around one point.
const selectionGroup = new THREE.Group();
selectionGroup.name = 'SelectionPivot';
selectionGroup.userData.isGizmo = true;
studio.threeScene.add(selectionGroup);

// ---- Gear fit controller (Fit mode) ----
const fitController = new FitController(studio, transformControls, toast);
fitController.attach(gizmo);

// Route the SHARED gizmo's drag events to the fit controller when it owns a piece.
transformControls.addEventListener('dragging-changed', (e) => {
  if (studio.mode === 'fit') fitController.onGizmoDragging(e);
});
transformControls.addEventListener('objectChange', () => {
  if (studio.mode === 'fit' && fitController.isActive) fitController.onGizmoObjectChange();
});

// Shift toggles proportional scale stretch in Fit mode (mirror of the site's rule).
window.addEventListener('keydown', (e) => { if (e.key === 'Shift') fitController.stretchEnabled = true; });
window.addEventListener('keyup', (e) => { if (e.key === 'Shift') fitController.stretchEnabled = false; });

// ---- Rig controller (Rig mode: tap to grow a chain; the bending runs itself in a worker) ----
const bindScheduler = new BindScheduler({
  spawn: () => new Worker(new URL('./rig/bind-worker.js', import.meta.url), { type: 'module' }),
  onProgress: (fraction, stage) => rigController.onProgress(fraction, stage),
  onDone: (result) => rigController.onDone(result),
  onError: (message) => rigController.onError(message),
});
const rigController = new RigController(studio, { scheduler: bindScheduler, toast, camera: viewport.camera });
window.__rig = rigController; // seam for checks/rig-page-check.cjs

let dragStart = null; // { group, perMesh: Map<mesh, Matrix4> }
let dragTransform = null; // [{ mesh, before: {p,q,s} }] captured at gizmo drag-start
let dragTargetObjects = null; // the objects being dragged (single object or group-selected meshes)
let proportionalScale = false;
let proportionalScaleStart = null;

function selectedMeshes() {
  return [...studio.selection].filter((m) => m.isMesh && m.parent);
}

// captureTRS / trsChanged now live in ./edit/trs.js — see the import at the top. They decide
// whether a gizmo drag becomes an undo unit, and this file cannot be imported in Node (WebGL at
// module scope), so they were untestable while they lived here.

transformControls.addEventListener('dragging-changed', (e) => {
  viewport.controls.enabled = !e.value;
  if (studio.mode === 'fit') return; // fit controller owns undo + gizmo attach
  if (e.value) {
    // Record a transform unit instead of a full-document snapshot: capture the
    // before-TRS of every object the drag touches (single object OR the group of
    // selected meshes), so undo/redo replay just that transform — never resetting
    // the whole scene (which broke skinned shape scale/rotation and their outlines).
    if (transformControls.object === selectionGroup) {
      dragTargetObjects = selectedMeshes();
      dragStart = {
        group: selectionGroup.matrixWorld.clone(),
        perMesh: new Map(dragTargetObjects.map((m) => [m, m.matrixWorld.clone()])),
      };
    } else if (transformControls.object) {
      dragTargetObjects = [transformControls.object];
      dragStart = null;
    } else {
      dragTargetObjects = null;
      dragStart = null;
    }
    dragTransform = (dragTargetObjects || []).map((m) => ({ mesh: m, before: captureTRS(m) }));
    proportionalScaleStart = proportionalScale && transformControls.mode === 'scale'
      ? transformControls.object?.scale.clone() || null
      : null;
  } else {
    if (dragTransform) {
      const ops = dragTransform
        .map((d) => ({ mesh: d.mesh, before: d.before, after: captureTRS(d.mesh) }))
        .filter((op) => op.mesh && op.mesh.parent && trsChanged(op.before, op.after));
      studio.pushTransform(ops);
    }
    dragTransform = null;
    dragTargetObjects = null;
    dragStart = null;
    proportionalScaleStart = null;
    selectionGroup.position.set(0, 0, 0);
    selectionGroup.rotation.set(0, 0, 0);
    selectionGroup.scale.set(1, 1, 1);
    updateGizmo();
    // A gizmo drag mutated the selected shapes; persist the move/rotate/scale.
    studio.emit('changed');
  }
});

const _deltaMatrix = new THREE.Matrix4();
const _invMatrix = new THREE.Matrix4();
const _pos = new THREE.Vector3();

function applyGroupTransform() {
  if (!dragStart) return;
  // TransformControls writes selectionGroup.position in the same frame; make sure
  // its matrixWorld reflects that before computing the delta (otherwise the delta
  // is stale/identity and the selected shapes never move).
  selectionGroup.updateMatrixWorld(true);
  _invMatrix.copy(dragStart.group).invert();
  _deltaMatrix.multiplyMatrices(selectionGroup.matrixWorld, _invMatrix);
  const meshes = [...dragStart.perMesh.keys()];
  const starts = [...dragStart.perMesh.values()];
  // A rigged model is in a group drag like any other shape: applyGroupDelta writes its matrix and
  // rig.update() re-places the bones next frame, with the skin following (Task 8).
  applyGroupDelta(meshes, _deltaMatrix, starts);
  studio.emit('transform');
}

transformControls.addEventListener('objectChange', () => {
  if (studio.mode !== 'fit' && proportionalScaleStart && transformControls.mode === 'scale'
      && transformControls.object) {
    const next = scaleWithProportions(transformControls.object.scale, proportionalScaleStart);
    transformControls.object.scale.set(next.x, next.y, next.z);
  }
  if (dragStart) applyGroupTransform();
  else studio.emit('transform');
});

function updateGizmo() {
  // Rig mode drags joints itself (in the plane facing the camera); no gizmo there.
  if (studio.mode === 'rig') {
    transformControls.detach();
    return;
  }
  if (studio.mode === 'fit') return;
  const meshes = selectedMeshes();
  const multi = (studio.mode === 'build') && meshes.length > 1;
  if (multi) {
    const center = new THREE.Vector3();
    for (const m of meshes) {
      m.getWorldPosition(_pos);
      center.add(_pos);
    }
    center.multiplyScalar(1 / meshes.length);
    selectionGroup.position.copy(center);
    selectionGroup.rotation.set(0, 0, 0);
    selectionGroup.scale.set(1, 1, 1);
    transformControls.attach(selectionGroup);
    return;
  }
  const sel = studio.selected;
  const inScene = sel && sel.parent;
  if (!inScene) transformControls.detach();
  else transformControls.attach(sel);
}

studio.on('select', (obj) => {
  if (studio.rig) studio.rig.setSelected(obj && obj.isBone ? obj.name : null);
  updateGizmo();
});

studio.on('mode', (mode) => {
  document.getElementById('topbar').dataset.mode = mode;
  if (studio.rig) studio.rig.setHelpersVisible(mode === 'rig' || mode === 'pose');
  if (mode === 'rig') transformControls.detach();
  if (mode === 'pose') transformControls.setMode('rotate');
  fitController.onModeChange(mode);
  if (mode !== 'fit') updateGizmo();
  else fitController.hideGizmo();
});
studio.on('rig-change', (rig) => {
  // A rig made outside Rig mode (a restored document) shows its balls only where they belong.
  if (rig) rig.setHelpersVisible(studio.mode === 'rig' || studio.mode === 'pose');
});
document.getElementById('topbar').dataset.mode = studio.mode;

// ---- Picking: commit on click only, never on orbit/pan/gizmo drag ----
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const dom = viewport.renderer.domElement;
const PICK_TOL = 5;
let down = null;

function castPointer(cx, cy) {
  const rect = dom.getBoundingClientRect();
  pointer.x = ((cx - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((cy - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, viewport.camera);
}

/** The joint ball under the pointer, if any. Balls draw x-ray, so they win over the surface (plan decision 4). */
function ballAt(cx, cy) {
  castPointer(cx, cy);
  if (!studio.rig || !studio.rig.balls.size) return null;
  const hits = raycaster.intersectObjects([...studio.rig.balls.values()], false);
  return hits.length ? hits[0].object : null;
}

dom.addEventListener('pointerdown', (e) => {
  down = { x: e.clientX, y: e.clientY };
  if (studio.mode === 'rig' && e.button === 0) {
    const ball = ballAt(e.clientX, e.clientY);
    if (ball && rigController.beginDrag(ball, raycaster.ray.clone())) {
      down.rigDrag = true;
      viewport.controls.enabled = false;
      dom.setPointerCapture(e.pointerId);
    }
  }
});
dom.addEventListener('pointermove', (e) => {
  if (!down) return;
  if (down.rigDrag) {
    castPointer(e.clientX, e.clientY);
    rigController.moveDrag(raycaster.ray);
    return;
  }
  if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > PICK_TOL) down.moved = true;
});
function endPointer(e) {
  const d = down;
  down = null;
  if (!d) return;
  if (d.rigDrag) {
    rigController.endDrag();
    viewport.controls.enabled = true;
    return;
  }
  if (d.moved || transformControls.dragging || e.button !== 0) return;
  pickAt(e.clientX, e.clientY, e.shiftKey);
}
dom.addEventListener('pointerup', endPointer);
dom.addEventListener('pointercancel', (e) => { if (down && down.rigDrag) endPointer(e); else down = null; });

function pickAt(cx, cy, additive) {
  castPointer(cx, cy);
  if (studio.mode === 'rig') {
    // A ball under the pointer was taken by pointerdown (beginDrag selects it); this is a model tap.
    rigController.tap(raycaster.ray.clone(), ballAt(cx, cy));
    return;
  }
  if (studio.mode === 'pose' && studio.rig) {
    // Balls draw x-ray (RIG_RENDER_ORDER, depthTest off), so a joint inside the model is always
    // reachable; Pose mode picks joints only — tapping the model itself deselects.
    const ball = ballAt(cx, cy);
    studio.select(ball ? studio.rig.bones.get(ball.userData.jointId) : null);
    return;
  }

  const candidates = [];
  if (studio.rig) candidates.push(...studio.rig.balls.values());
  candidates.push(...studio.shapes);
  if (studio.mode === 'fit') candidates.push(...fitController.gearGroups);
  const hits = raycaster.intersectObjects(candidates, true);

  const ballHit = hits.find((h) => h.object.userData.isJointBall);
  const meshHit = hits.find(
    (h) => h.object.isMesh && !h.object.userData.isJointBall && !h.object.userData.isGizmo && !h.object.userData.isOutline,
  );
  // A joint ball only captures the click when it is the NEAREST hit along the ray
  // (an exposed bead). A ball that sits on or behind a shape must NOT win the
  // cursor — otherwise an attached shape whose joint ball rests on its surface (or
  // a ball on the far side) becomes effectively unselectable. Equal distances go
  // to the ball (keeps the pre-existing tie behaviour for flush-mounted joints).
  const ballWins = ballHit && (!meshHit || ballHit.distance <= meshHit.distance);
  if (ballWins) {
    const bone = studio.rig?.bones.get(ballHit.object.userData.boneName);
    if (bone) studio.select(bone, additive);
    return;
  }
  studio.select(meshHit ? meshHit.object : null, additive);
}

// ---- Import (button + drag-drop) ----
function doImport(file) {
  importGLBFile(file)
    .then((gltf) => {
      // adoptImportedRig adds the import itself, at the moment its path needs it.
      const kept = studio.adoptImportedRig(gltf.scene);
      // Frame what just arrived. Without this the camera stays at resetView()'s fixed (5, 4, 6),
      // chosen for the 1-unit starter box: the test dinosaur landed at about a sixth of the frame
      // height, and 🏠 returned to that same spot, so there was no way to frame it but by hand.
      viewport.frameContents(studio.group);
      toast.show(kept === 'studio'
        ? 'Imported with its skeleton and bending.'
        : kept === 'foreign'
          ? 'Skeleton kept — working out the bending'
          : 'Imported. Tap it in Rig mode to give it a skeleton.');
    })
    .catch((err) => {
      console.error(err);
      toast.error('Could not import that file.');
    });
}

const viewportEl = document.getElementById('viewport');
viewportEl.addEventListener('dragover', (e) => e.preventDefault());
viewportEl.addEventListener('drop', (e) => {
  e.preventDefault();
  const file = [...e.dataTransfer.files].find((f) => /\.(glb|gltf)$/i.test(f.name));
  if (file) doImport(file);
});

let wireframe = false;

// ---- UI wiring ----
new ModeBar(document.getElementById('modebar'), studio);
new TreePanel(document.getElementById('tree'), studio);
new PropertyPanel(document.getElementById('properties'), studio, toast, fitController, openClayFor);

// ---- AI Optimization panel ----
// The panel composes ai-controls/chat/preview/drag. main.js owns the three
// seams it cannot know alone: the y=0 ray cast, the undo boundary, and the
// selection outline. UNDO OWNERSHIP: `addObjects` never pushes, so the add
// path below pushes exactly ONE boundary; `replaceSelection` pushes its own,
// so onApplyReplace must push ZERO. Anything else costs two Ctrl+Z presses.

const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _worldHit = new THREE.Vector3();
const DROP_FALLBACK_DISTANCE = 6;

/**
 * Map a client-space point over the viewport onto a world point.
 *
 * Used by the preview→viewport drag. The scene has NO ground-plane mesh —
 * `y=0` is the implied floor (addPrimitive seats primitive bases there) — so
 * the mathematical plane is intersected first. A ray parallel to or pointing
 * away from the floor falls back to the real scene geometry, and a final
 * fixed-distance point guarantees the drag can never dead-end.
 *
 * Reuses the module's single `raycaster` + `pointer` (owned by `pickAt`) and
 * mirrors its NDC math, so a drop lands exactly where the cursor is.
 *
 * @param {number} clientX pointer client X.
 * @param {number} clientY pointer client Y.
 * @returns {THREE.Vector3|null} the world-space drop point, or `null` when the
 *   viewport has zero width/height (no NDC basis to cast through).
 */
function raycastToWorld(clientX, clientY) {
  const rect = viewportEl.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, viewport.camera);

  const onFloor = raycaster.ray.intersectPlane(groundPlane, _worldHit);
  if (onFloor) return onFloor.clone();

  const hits = raycaster.intersectObjects(studio.group.children, true);
  if (hits.length) return hits[0].point.clone();

  return raycaster.ray.at(DROP_FALLBACK_DISTANCE, new THREE.Vector3());
}

/**
 * Apply an AI result as NEW shapes.
 *
 * @param {object[]} objects validated AI objects.
 * @param {{worldPoint?: THREE.Vector3}} [meta] the drop point (drag path).
 * @returns {{meshes: object[], skipped: object[]}} what insert.js built.
 */
function onApplyAdd(objects, { worldPoint } = {}) {
  studio.pushUndo(); // the add path owns its ONE undo boundary

  const pc = payloadCentroid(objects);
  const anchor = worldPoint
    ? [worldPoint.x, worldPoint.y, worldPoint.z]
    : selectionCentroid(selectedMeshes());

  // x/z anchor the group's centroid on the drop point. On a drop, y anchors the
  // group's LOWEST position instead — centroid-to-floor would sink the geometry
  // (a unit box at p.y=1 lands with its base at -0.5). The exact geometry floor
  // is snapped below, so this only has to bring the group into range.
  const baseY = worldPoint ? payloadMinY(objects) : null;
  const anchorY = baseY == null ? pc?.[1] : baseY;
  const offset =
    pc && anchor
      ? [anchor[0] - pc[0], anchor[1] - anchorY, anchor[2] - pc[2]]
      : undefined;

  const { meshes, skipped } = addObjects(studio, objects, offset ? { offset } : undefined);

  // Seat the dropped group on the floor: the world bounding-box min.y must equal
  // the drop point's y (addPrimitive seats primitive bases the same way). A
  // measurement failure is swallowed so a bad bbox can never block the insert —
  // the position-based offset above is the fallback.
  if (worldPoint && meshes.length) {
    try {
      const box = new THREE.Box3();
      for (const m of meshes) {
        m.updateWorldMatrix(true, true);
        box.expandByObject(m);
      }
      if (Number.isFinite(box.min.y)) {
        const dy = anchor[1] - box.min.y;
        for (const m of meshes) m.position.y += dy;
      }
    } catch {
      /* fallback placement already applied */
    }
  }

  studio.setSelection(meshes, meshes[0]); // drives the neon outline
  studio.emit('changed');

  const n = meshes.length;
  toast.show(`Added ${n} shape${n === 1 ? '' : 's'}.`);
  if (skipped.length) {
    toast.error(`${skipped.length} shape${skipped.length === 1 ? '' : 's'} could not be built.`);
  }
  return { meshes, skipped };
}

/**
 * Replace the current selection with an AI result. `replaceSelection` pushes
 * its OWN undo entry — this path must never push a second one.
 *
 * @param {object[]} objects validated AI objects.
 * @returns {{meshes: object[], skipped: object[]}} what insert.js built.
 */
function onApplyReplace(objects) {
  const replaced = selectedMeshes().length;
  const { meshes, skipped } = replaceSelection(studio, objects, { preservePosition: true });
  toast.show(`Replaced ${replaced} shape${replaced === 1 ? '' : 's'} with ${meshes.length}.`);
  if (skipped.length) {
    toast.error(`${skipped.length} shape${skipped.length === 1 ? '' : 's'} could not be built.`);
  }
  return { meshes, skipped };
}

const aiPanel = new AIPanel(document.getElementById('ai-section'), {
  studio,
  toast,
  onApplyAdd,
  onApplyReplace,
  // Handing the panel this seam lets it attach the preview drag itself
  // (attachPreviewDrag → applyAddFromPreview → onApplyAdd); main.js must NOT
  // attach a second one.
  raycastToWorld,
});
window.__aiPanel = aiPanel;
window.__raycastToWorld = raycastToWorld;
aiPanel.open();
window.addEventListener('beforeunload', () => aiPanel.destroy());

// ---- AI generation: "Make it real" / "Make from words" ----
// Design: docs/superpowers/specs/2026-09-19-3d-studio-ai-generation-design.md
/**
 * Parse and prepare ONE detached editable mesh. This function never changes the document or undo
 * stack. The panel checks operation ownership after awaiting it and before the synchronous commit.
 * @param {Blob} glb
 * @param {{words: string, sample: boolean, replace?: object[]|null}} meta
 */
async function prepareGeneratedModel(glb, { words, sample }, { signal }) {
  signal.throwIfAborted();
  const gltf = await importGLBFile(new File([glb], 'generated.glb', { type: 'model/gltf-binary' }));
  let adopted = null; // the material bakeAndPlace kept, spared when the parsed scene is freed
  try {
  signal.throwIfAborted();
  const meshes = [];
  gltf.scene.traverse((o) => {
    if (o.isMesh) meshes.push(o);
  });
  if (!meshes.length) throw new Error('the AI model had no mesh');
  let build = null;
  if (studio.shapes.length) {
    const box = new THREE.Box3();
    for (const s of studio.shapes) box.union(new THREE.Box3().setFromObject(s));
    build = { min: box.min.toArray(), max: box.max.toArray() };
  }
  const model = bakeAndPlace(meshes, build);
  adopted = model.material;
  const label = sample ? 'Sample' : String(words || 'AI model').trim().slice(0, 40) || 'AI model';
  model.name = label;
  model.userData.sample = !!sample;
  return model;
  } finally { disposeModel(gltf.scene, adopted); }
}

/** The labelled sample shipped with the studio (design doc §7). */
async function loadGenSample({ signal } = {}) {
  const [grid, model] = await Promise.all(['samples/dino/grid.webp', 'samples/dino/model.glb'].map(async (p) => {
    const res = await fetch(p, { signal });
    if (!res.ok) throw new Error(`the sample is missing (${p})`);
    return res.blob();
  }));
  return { grid, model };
}

const genService = createGenService({
  providers: {
    'hf-spaces': (key, model, connection) => createHfSpacesProvider(key, model, { controlValues: connection.controlValues }),
    fal: (key, model, connection) => createFalProvider(key, model, {
      proxyUrl: connection.proxyUrl, controlValues: connection.controlValues,
    }),
    'tencent-tokenhub': (key, model, connection) => createTencentTokenHubProvider(key, model, { baseUrl: connection.baseUrl }),
  },
  config: loadGenConfig,
});
const genPanel = new GenPanel(document.getElementById('gen-overlay'), {
  service: genService,
  // Forward the options. This wrapper used to read `(shapes) => captureViews(shapes)`, which
  // silently dropped the panel's {turn, tilt, signal}: the sliders moved, the state updated and a
  // fresh capture ran — always at turn 0, tilt 0. Nothing failed. The panel check proved the panel
  // SENDS the angle (against its own fake capture) and the capture check proved the renderer
  // HONOURS it (calling captureViews directly); neither crossed this line between them.
  capture: (shapes, options) => captureViews(shapes, options),
  splitGrid: splitGridBlob,
  prepareModel: prepareGeneratedModel,
  commitModel: (mesh, { replace } = {}) => {
    const outcome = commitGeneratedModel(studio, mesh, { replace });
    // Same reason as doImport: a model the child has just conjured must not arrive as a speck at
    // the starter box's fixed camera distance. This is the flagship path — it is the first look
    // they get at their own creature.
    viewport.frameContents(studio.group);
    if (outcome.replaced) {
      toast.show(`Replaced ${outcome.replaced} photographed block${outcome.replaced === 1 ? '' : 's'} with your AI model. Undo restores them.`);
    } else {
      toast.show(mesh.userData.sample ? 'Added the sample model.' : 'Added your AI model beside your build. Undo removes it.');
    }
  },
  disposeModel,
  loadSample: loadGenSample,
  studio: () => studio,
  // "Use my view as the front" is the child's own orbit camera: the offset from what they are
  // looking AT to where they are looking FROM. Nothing else on screen tells them which way their
  // model faces, so this is the gesture they already have.
  cameraDirection: () => viewport.camera.position.clone().sub(viewport.controls.target).toArray(),
  toast,
});
// Debug seam (HIDDEN-FEATURES.md): __gen.setService(fake) drives the whole flow without a GPU.
window.__gen = genPanel;

/** Every joint back to its unrotated state, as ONE undo unit over the bones that moved. */
function onRest() {
  const rig = studio.rig;
  if (!rig || !rig.bones.size) {
    toast.show('Nothing to rest — give the model a skeleton in Rig mode first.');
    return;
  }
  const ops = [...rig.bones.values()].map((bone) => ({ mesh: bone, before: captureTRS(bone) }));
  rig.rest();
  studio.pushTransform(ops.map((op) => ({ ...op, after: captureTRS(op.mesh) })).filter((op) => trsChanged(op.before, op.after)));
  studio.emit('changed');
  toast.show('Back to rest.');
}

/** A .glb with the mesh, the skeleton, the skin and the joint graph (spec §6; the graph is what
 * lets the file come back exactly, Task 11). Balls, links and outlines stay out. */
async function onExportPose() {
  if (fitController.wardrobe.length) { await fitController.buildDressedDownload(); return; }
  const rig = studio.rig;
  if (!studio.shapes.length) { toast.error('Add or generate a model first, then export.'); return; }
  if (rig?.graph.size && !rig.skinBones.length) {
    toast.error('Wait for the bending to finish before exporting this skeleton.');
    return;
  }
  studio.select(null); // outlines are scene objects too
  rig?.readPose(); // the graph is the pose's serialised form
  const restore = rig?.detachHelpers() || (() => {});
  try {
    const graph = rig?.graph.size ? rig.graph.toJSON() : null;
    const clips = graph?.motion ? motionClips(rig, graph.motion.settings) : null;
    const output = clips ? cloneRiggedScene(studio.group) : studio.group;
    if (clips) { output.traverse((o) => { if (o.isBone) o.quaternion.identity(); }); graph.pose = {}; }
    await exportGLB(output, clips, 'my-model.glb', graph);
    toast.show(clips ? 'Exported my-model.glb with its skeleton, Walk and Jump.' : rig?.skinBones.length ? 'Exported my-model.glb with its skeleton.' : 'Exported my-model.glb.');
  } catch (err) {
    console.error(err);
    toast.error('Export failed.');
  } finally {
    restore();
  }
}

document.getElementById('export-model').addEventListener('click', onExportPose);
const motionPanel = new MotionPanel(studio, toast);
const cityExportPanel = new CityExportPanel(studio, toast, () => motionPanel.open());
document.getElementById('export-city').addEventListener('click', () => cityExportPanel.open());
const toolbar = new Toolbar(document.getElementById('actions'), studio, transformControls, {
  toast,
  onImport: doImport,
  onRest,
  onExportPose,
  onAnimate: () => motionPanel.open(),
  rigController, // so Pose mode's hint can learn a bind failed or was refused (fix round, F2)
  onMakeItReal: () => {
    if (!studio.shapes.length) {
      toast.error('Build something first, then make it real.');
      return;
    }
    genPanel.open('A');
  },
  onMakeFromWords: () => genPanel.open('B'),
  proportionalScale: () => proportionalScale,
  onProportionalScale: () => {
    proportionalScale = !proportionalScale;
    toolbar.render();
  },
  wireframe: () => wireframe,
  onWireframe: () => {
    wireframe = !wireframe;
    applyWireframe();
    toolbar.render();
  },
});

// Fit toolbar renders AFTER the main toolbar so its content wins in Fit mode.
fitController.makeToolbar(document.getElementById('actions'));

// Rig toolbar renders AFTER the main toolbar so its content wins in Rig mode.
const rigAuto = new RigAuto(studio, toast);
new RigToolbar(document.getElementById('actions'), studio, rigController, { toast, onAutoRig: () => rigAuto.open() });

const undoBtn = document.getElementById('undo');
const redoBtn = document.getElementById('redo');
const newBtn = document.getElementById('new');
const helpBtn = document.getElementById('help');
const helpOverlay = document.getElementById('help-overlay');
const resetViewBtn = document.getElementById('reset-view');
const welcomeOverlay = document.getElementById('welcome-overlay');
const confirmOverlay = document.getElementById('confirm-overlay');
const confirmMessage = document.getElementById('confirm-message');
const confirmYes = document.getElementById('confirm-yes');
const confirmNo = document.getElementById('confirm-no');

function showConfirm(message, onYes) {
  confirmMessage.textContent = message;
  confirmOverlay.classList.add('show');
  confirmYes.onclick = () => {
    confirmOverlay.classList.remove('show');
    onYes();
  };
  confirmNo.onclick = () => confirmOverlay.classList.remove('show');
}

function doUndo() {
  if (studio.mode === 'fit' && fitController.undo()) {
    toast.show('Undone (fit).');
    return;
  }
  if (studio.undo()) {
    toast.show('Undone.');
  } else {
    toast.show('Nothing to undo.');
  }
}

function doRedo() {
  if (studio.mode === 'fit' && fitController.redo()) {
    toast.show('Redone (fit).');
    return;
  }
  if (studio.redo()) {
    toast.show('Redone.');
  } else {
    toast.show('Nothing to redo.');
  }
}

function doDelete() {
  const meshes = selectedMeshes();
  if (studio.selected?.isBone) {
    if (studio.mode === 'rig' && studio.rig) rigController.removeSelected();
    else toast.show('Bones are part of the skeleton — use Clear skeleton in Rig mode to remove them.');
    return;
  }
  if (!meshes.length) {
    toast.show('Nothing selected to delete. Click a shape first.');
    return;
  }
  studio.pushUndo();
  for (const m of meshes) studio.remove(m);
  studio.select(null);
  const n = meshes.length;
  toast.show(`Deleted ${n} shape${n === 1 ? '' : 's'}.`);
}

function doDuplicate() {
  const meshes = selectedMeshes();
  if (!meshes.length) {
    toast.show('Select a shape (or several, with Shift-click) to duplicate.');
    return;
  }
  studio.pushUndo();
  const copies = meshes.map((m) => studio.duplicate(m));
  studio.select(copies[copies.length - 1] || null);
  toast.show(`Duplicated ${copies.length} shape${copies.length > 1 ? 's' : ''}.`);
}

function doNewScene() {
  showConfirm('Start a new scene? Your current work will be lost.', () => {
    shop.invalidate();
    studio.undoStack.length = 0;
    studio.redoStack.length = 0;
    // Drop the fitted gear BEFORE clearRig() disposes its parented geometries.
    fitController.clearAll();
    studio.resetDocument();
    queueChampionSave();
    toast.show('New scene ready! ✨');
  });
}

function setGizmoMode(mode) {
  transformControls.setMode(mode);
  toolbar.render();
}

function applyWireframe() {
  for (const s of studio.shapes) setWireframe(s.material, wireframe);
}
studio.on('changed', () => {
  if (wireframe) applyWireframe();
  queueChampionSave();
});

// ---- Auto-save (debounced) so an accidental reload does not lose the model. ----
let championSaveTimer = null;
let restoringChampion = true;
let documentRevision = 0;
let pendingSave = Promise.resolve();
function queueChampionSave() {
  if (restoringChampion) return;
  documentRevision++;
  clearTimeout(championSaveTimer);
  const epoch = session.epoch;
  championSaveTimer = setTimeout(() => { savePortable(epoch).catch(e => toast.show(e.message)); }, 400);
}
function capturePortableSnapshot() {
    const snapshot = takeSnapshot(studio);
    for (const shape of studio.shapes.filter(s => !s.userData.isGear)) {
      const saved = snapshot.objects.find(o => o.id === shape.userData.id);
      const materials = Array.isArray(shape.material) ? shape.material : [shape.material];
      materials.forEach((material, i) => {
        if (['normalMap','roughnessMap','metalnessMap','emissiveMap','aoMap','alphaMap','bumpMap','displacementMap','envMap'].some(key => material?.[key])) throw Error('This material uses texture channels the Champion File cannot yet preserve. Save a GLB backup; the existing Champion File is unchanged.');
        if (material?.map && !saved?.appearance?.materials?.[i]?.map) throw Error('A texture could not be saved. Current saved work is unchanged.');
      });
    }
    return snapshot;
}
function savePortable(epoch = session.epoch) {
  const run = async () => {
    if (restoringChampion || epoch !== session.epoch) throw Error('Champion changed; save cancelled.');
    const revision = documentRevision;
    const snapshot = capturePortableSnapshot();
    const wardrobe = await fitController.serializeWardrobe();
    if (epoch !== session.epoch || restoringChampion) throw Error('Champion changed; save cancelled.');
    if (revision !== documentRevision) throw Error('The document changed while saving. Save again when the edit finishes.');
    const section = encodeProject(snapshot, wardrobe);
    return session.edit(file => {
      const old = file.projects['3d-studio'];
      if (old && old.version !== 1) throw Error('Studio project is read-only in this version.');
      file.projects['3d-studio'] = { ...old, ...section }; return file;
    });
  };
  const next = pendingSave.then(run); pendingSave = next.catch(() => {}); return next;
}
fitController.on('fit-ui-change', queueChampionSave);
function queueWardrobeSave() { queueChampionSave(); }

undoBtn.addEventListener('click', doUndo);
redoBtn.addEventListener('click', doRedo);
newBtn.addEventListener('click', doNewScene);
resetViewBtn.addEventListener('click', () => viewport.resetView());

// Draggable divider so users can resize the two panels ABOVE the AI section.
// The cursor is mapped against #split-region (the container those two panels
// share), NOT the whole sidebar: the AI section made the two panels share only
// ~350px of the 678px sidebar, which compressed the old drag to ~0.48x and made
// the handle jump ~77px on pointerdown.
const sidebarEl = document.getElementById('sidebar');
const splitterEl = document.getElementById('splitter');
const sceneSection = document.getElementById('scene-section');
const propertiesSection = document.getElementById('properties-section');
const splitRegionEl = document.getElementById('split-region') || sidebarEl;
let splitDragging = false;
let splitGrabOffset = 0; // where inside the handle the pointer landed

/** Size the two panels to `ratio` of the split region, handle excluded. */
function applySplitRatio(ratio) {
  const splitterH = splitterEl.getBoundingClientRect().height || 6;
  const scene = clampSplitRatio(ratio);
  // calc() fills the region exactly and stays correct on window resize, unlike
  // a percentage of the sidebar (its flex container before the AI section).
  sceneSection.style.flex = `0 0 calc((100% - ${splitterH}px) * ${scene})`;
  propertiesSection.style.flex = `0 0 calc((100% - ${splitterH}px) * ${1 - scene})`;
}

function updateSplit(clientY) {
  const rect = splitRegionEl.getBoundingClientRect();
  const ratio = splitRatioAt({
    clientY,
    regionTop: rect.top,
    regionHeight: rect.height,
    splitterHeight: splitterEl.getBoundingClientRect().height || 6,
    grabOffset: splitGrabOffset,
  });
  if (ratio === null) return;
  applySplitRatio(ratio);
}
splitterEl.addEventListener('pointerdown', (e) => {
  splitDragging = true;
  splitterEl.classList.add('dragging');
  splitterEl.setPointerCapture(e.pointerId);
  // Track the grab point inside the 6px handle so the handle does not snap its
  // top edge under the cursor on pointerdown (the measured 77px jump).
  splitGrabOffset = e.clientY - splitterEl.getBoundingClientRect().top;
  updateSplit(e.clientY);
});
splitterEl.addEventListener('pointermove', (e) => {
  if (splitDragging) updateSplit(e.clientY);
});
splitterEl.addEventListener('pointerup', () => {
  splitDragging = false;
  splitterEl.classList.remove('dragging');
});
splitterEl.addEventListener('pointercancel', () => {
  splitDragging = false;
  splitterEl.classList.remove('dragging');
});
document.getElementById('welcome-go').addEventListener('click', () => {
  welcomeOverlay.classList.remove('show');
});
helpBtn.addEventListener('click', () => {
  helpOverlay.classList.add('show');
});
helpOverlay.addEventListener('click', (e) => {
  if (e.target === helpOverlay || e.target.id === 'help-close') helpOverlay.classList.remove('show');
});

// isTyping now lives in ./ui/keys.js — see the import at the top.

window.addEventListener('keydown', (e) => {
  if (motionPanel.dialog.open) return;
  // The Clay Studio overlay owns the keyboard while it is open.
  if (clay.isOpen()) return;
  if (genPanel.isOpen()) return; // the AI overlay owns the keyboard while it is open
  if (isTyping(e.target)) return;
  const mod = e.ctrlKey || e.metaKey;

  if (mod && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    e.shiftKey ? doRedo() : doUndo();
    return;
  }
  if (mod && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    doRedo();
    return;
  }
  if (mod && e.key.toLowerCase() === 'd') {
    e.preventDefault();
    doDuplicate();
    return;
  }
  if (mod) return;

  switch (e.key) {
    case 'Delete':
    case 'Backspace':
      e.preventDefault();
      if (studio.mode === 'fit' && fitController.isActive) fitController.removeSelected();
      else doDelete();
      break;
    case 'g':
      if (studio.mode === 'fit') fitController.setGizmoMode('translate');
      else setGizmoMode('translate');
      break;
    case 'r':
      if (studio.mode === 'fit') fitController.setGizmoMode('rotate');
      else setGizmoMode('rotate');
      break;
    case 's':
      if (studio.mode === 'fit') fitController.setGizmoMode('scale');
      else setGizmoMode('scale');
      break;
    case '1':
      studio.setMode('build');
      break;
    case '2':
      studio.setMode('rig');
      break;
    case '3':
      studio.setMode('pose');
      break;
    case '4':
      studio.setMode('fit');
      break;
    case '?':
      helpOverlay.classList.toggle('show');
      break;
  }
});

// ---- Welcome scene / persisted champion ----
// A fresh visitor sees the starter box + welcome; a returning visitor with a saved
// champion (and wardrobe) gets their work back exactly as they left it.
function perDocumentSnapshot() {
  return studio.shapes.length ? takeSnapshot(studio) : null;
}

let shop;
async function restorePortable(value) {
  restoringChampion = true;
  clearTimeout(championSaveTimer);
  shop?.invalidate();
  studio.undoStack.length = 0; studio.redoStack.length = 0;
  fitController.clearAll();
  if (value?.snapshot) restoreSnapshot(studio, value.snapshot);
  else studio.resetDocument();
  if (value?.wardrobe?.length) await fitController.restoreWardrobePieces(value.wardrobe);
  viewport.resetView(); restoringChampion = false;
}
async function boot() {
  await openChampion();
  const legacy = await loadAppState();
  await session.migrateStudio(legacy.champion ? encodeProject(legacy.champion, legacy.wardrobe || []) : null);
  const section = studioSection();
  const unsupported = section && section.version !== 1;
  let value = unsupported ? null : decodeProject(section);

  await restorePortable(value);
  if (!value && !unsupported) { studio.addPrimitive('box'); welcomeOverlay.classList.add('show'); }
  else welcomeOverlay.classList.remove('show');
  shop = createShop({ studio, viewport, toast, raycastToWorld, confirm: showConfirm, champion: championShop });
  session.subscribe(type => {
    if (type === 'external') { shop.invalidate(); clearTimeout(championSaveTimer); toast.show('Champion updated in another tab. Save a recovery copy if needed, then reload.'); }
  });
  const controls = document.createElement('div'); controls.id = 'champion-file-controls';
  controls.style.cssText = 'display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:6px;background:#0a1320;color:#d5f0ff;border-bottom:1px solid #23405b';
  const button = (name, click) => { const b = document.createElement('button'); b.textContent = name; b.style.minHeight = '40px'; b.onclick = () => Promise.resolve().then(click).catch(e => toast.show(e.message)); controls.append(b); };
  button('Credits & Owned Gear', () => ChampionControls.credits(session, { before: () => savePortable(), legacy: () => JSON.parse(localStorage.getItem('studio.shop.v1') || 'null') }));
  button('Save Champion File', async () => {
    clearTimeout(championSaveTimer); if (!unsupported) await savePortable();
    const blob = new Blob([JSON.stringify(session.file)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = 'studio.champion.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  button('Save recovery copy', async () => {
    const file = session.file;
    if (!unsupported) file.projects['3d-studio'] = { ...file.projects['3d-studio'], ...encodeProject(capturePortableSnapshot(), await fitController.serializeWardrobe()) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'studio-recovery.champion.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.show('Recovery copy saved from this tab. Its balance may be older; opening replaces the snapshot.');
  });
  const input = document.createElement('input'); input.type = 'file'; input.accept = '.json'; input.hidden = true; controls.append(input);
  input.onchange = async () => {
    try {
      if (!input.files[0]) return;
      const incoming = ChampionSession.prepare(JSON.parse(await input.files[0].text()));
      const incomingSection = incoming.projects['3d-studio'];
      const ready = incomingSection?.version !== undefined && incomingSection.version !== 1 ? null : decodeProject(incomingSection);
      // Validate geometry/rig off-screen before the authoritative snapshot can be replaced.
      const candidate = new StudioScene(); if (ready) restoreSnapshot(candidate, ready.snapshot);
      if (ready && candidate.shapes.length !== ready.snapshot.objects.length) throw Error('Studio restore would lose shapes. File not opened.');
      if (ready?.snapshot.rig?.joints?.length && candidate.rig?.graph.size !== ready.snapshot.rig.joints.length) throw Error('Studio skeleton could not be restored.');
      for (const object of ready?.snapshot.objects || []) for (const material of object.appearance?.materials || []) {
        if (material.map) await new Promise((resolve, reject) => {
          const image = new Image(), timer = setTimeout(() => reject(Error('Studio texture could not be decoded in time.')), 10000);
          image.onload = () => { clearTimeout(timer); resolve(); };
          image.onerror = () => { clearTimeout(timer); reject(Error('Studio texture could not be decoded.')); }; image.src = material.map;
        });
      }
      for (const piece of ready?.wardrobe || []) { if (piece.bone && !candidate.rig?.bones.has(piece.bone)) throw Error('Fitted gear socket is missing.'); const group = await parseGLBBuffer(piece.buffer); group.traverse(o => { o.geometry?.dispose(); }); }
      if (ready?.wardrobe?.length && !candidate.rig) throw Error('Fitted gear needs a valid skeleton.');
      candidate.resetDocument();
      if (!window.confirm(`Open ${incoming.champion.name}? This replaces the current champion snapshot.`)) return;
      clearTimeout(championSaveTimer); await pendingSave; restoringChampion = true; shop.invalidate();
      await session.replace(incoming); location.reload();
    } catch(e) { restoringChampion = false; toast.show(e.message); }
    finally { input.value = ''; }
  };
  button('Open Champion File', () => input.click());
  button('Return to Workshop', async () => { clearTimeout(championSaveTimer); await savePortable(); location.href = '../workshop/'; });
  document.body.prepend(controls);
  window.__savePortable = savePortable;
  window.__studioReady = true;
  if (unsupported) {
    restoringChampion = true;
    document.getElementById('main').inert = true;
    toast.show('This Studio project requires a newer app. It is preserved read-only.');
  } else await shop.start();
}
window.__studioReady = false;
boot().catch(e => toast.show('Champion could not open: ' + e.message));

// ---- Render loop ----
function animate(now) {
  // While the clay overlay is open, only the clay studio renders.
  if (clay.isOpen()) return;
  if (genPanel.isOpen()) return; // the AI overlay owns the keyboard while it is open
  if (studio.rig) studio.rig.update(); // a shape that owns joints moved → bones re-placed, skin follows (Task 8)
  motionPanel.update(now);
  cityExportPanel.update(now);
  studio.syncOutlines();
  viewport.render();
}
viewport.renderer.setAnimationLoop(animate);
