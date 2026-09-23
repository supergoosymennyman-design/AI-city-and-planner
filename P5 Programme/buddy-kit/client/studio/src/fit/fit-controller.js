/**
 * FitController — owns the gear wardrobe (every fitted piece + the current active
 * piece), the Fit toolbar callbacks, and the gizmo behaviour for fitting. It reuses
 * the SAME TransformControls the main modes use, so Move/Rotate/Scale feel identical
 * everywhere. Gear ops register their own undo units in the studio's stacks.
 *
 * Binding model: a gear piece is BOUND to a named BONE on the current rig
 * (`entry.boneKey`, a bone NAME string), or UNBOUND (`boneKey === null`) living at
 * the scene root. Multiple pieces can share a bone (for example a hat and glasses).
 */
import * as THREE from 'three';
import { Emitter } from '../emitter.js';
import { FitToolbar } from '../ui/fit-toolbar.js';
import {
  loadGearFiles, prepareGear, socketFitProp, isRigged, measureModel,
  findSocketBone, guessBone, bakeFittedGLB, bakeDressed, bakedFileName,
  readPrefitMeta, attachPrefittedGroup, parseGLBBuffer,
} from '../fit/fit.js';

/** One undo unit = one wardrobe state { entries, activeId }. Tracks only the
 * bone-binding model: id, name, boneKey, pose and pristine clone. */
function captureWardrobeState(wardrobe, activeId) {
  return {
    entries: wardrobe.map((e) => ({
      id: e.id, name: e.name, boneKey: e.boneKey, group: e.group, pristine: e.pristine,
      p: e.group.position.toArray(), q: e.group.quaternion.toArray(), s: e.group.scale.toArray(),
    })),
    activeId,
  };
}

function wardrobeStateEquals(a, b) {
  if (!a || !b) return false;
  if ((a.entries?.length || 0) !== (b.entries?.length || 0)) return false;
  if (a.activeId !== b.activeId) return false;
  for (let i = 0; i < a.entries.length; i++) {
    const x = a.entries[i];
    const y = b.entries[i];
    if (x.id !== y.id || x.boneKey !== y.boneKey) return false;
    for (let k = 0; k < 3; k++) if (Math.abs(x.p[k] - y.p[k]) > 1e-6) return false;
    for (let k = 0; k < 4; k++) if (Math.abs(x.q[k] - y.q[k]) > 1e-6) return false;
    for (let k = 0; k < 3; k++) if (Math.abs(x.s[k] - y.s[k]) > 1e-6) return false;
  }
  return true;
}

/** Pick a gear name that is not already in use: keep the base filename and add a
 * short numeric suffix (`name`, `name_1`, `name_2`, …) only when a clash exists. */
function uniqueGearName(base, existing) {
  const used = new Set(existing);
  if (!used.has(base)) return base;
  let n = 1;
  while (used.has(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

export class FitController extends Emitter {
  constructor(studio, transformControls, toast) {
    super();
    this.studio = studio;
    this.tc = transformControls;
    this.toast = toast;
    this.wardrobe = [];
    this.seq = 0;
    this.active = null;
    this.measure = null;
    this.undoStack = [];
    this.redoStack = [];
    this.scaleDragStart = null;
    this.gizmoMode = 'translate';
    this.stretchEnabled = false;

    // Proxy studio selection: selecting a fitted gear selects THAT piece.
    this.unsubSelect = studio.on('select', (obj) => this.onStudioSelect(obj));
    this.unsubRigChange = studio.on('rig-change', () => this.onRigChange());
    // clearRig() fires this BEFORE it disposes the rig, so we can reparent every
    // bound gear out of the bones and preserve its geometry (instead of it being
    // destroyed with the rig).
    this.unsubBeforeRig = studio.on('before-rig-change', () => this.onBeforeRigChange());
    this.unsubGearImport = studio.on('gear-imported', (entries) => {
      for (const item of entries) {
        const name = uniqueGearName(item.name || item.group.name || 'gear', this.wardrobe.map(e => e.name));
        this.wardrobe.push({ id: ++this.seq, name, group: item.group, pristine: item.group.clone(true), boneKey: item.bone });
      }
      this.syncModel();
    });
  }

  get isActive() { return !!this.active; }

  /** Top-level fitted gear groups, for raycast picking. */
  get gearGroups() {
    return this.wardrobe.map((e) => e.group);
  }

  /** Named `getActive` (NOT `active`) — `this.active` is a DATA property holding the
   *  current piece, and overwriting it would clobber a same-named method. */
  getActive() { return this.active; }

  wardrobe() { return this.wardrobe; }

  currentBoneName() { return this.active ? this.active.boneKey : null; }

  attach(gizmoHelper) {
    this.gizmoHelper = gizmoHelper;
  }

  /** Called from main.js's mode handler when entering/leaving Fit mode. */
  onModeChange(mode) {
    if (mode !== 'fit') {
      this.hideGizmo();
    } else {
      this.measure = measureModel(this.studio);
    }
  }

  onStudioSelect(obj) {
    // When the user picks a shape that is one of our fitted groups, make it active.
    if (!obj) {
      // Clicking empty space in Fit mode deselects the active gear piece.
      if (this.studio.mode === 'fit' && this.active) this.setActive(null);
      return;
    }
    const entry = this.wardrobe.find((e) => {
      let hit = false;
      e.group.traverse((o) => { if (o === obj) hit = true; });
      return hit;
    });
    if (entry && entry !== this.active) {
      // Clicking a fitted gear piece makes it the active (gizmo-able) piece.
      this.setActive(entry);
    } else if (!entry && this.studio.mode === 'fit' && this.active) {
      // Clicking a champion body part deselects the gear so the gizmo detaches and
      // Delete acts on the champion shape, not the gear. Gear is never "in" the
      // studio.selection, so without this the active gear would linger.
      this.setActive(null);
    }
  }

  onRigChange() {
    // Pieces whose bone no longer exists get UNBOUND to the scene root (world pose
    // kept); pieces whose bone still exists stay bound.
    let changed = false;
    for (const e of this.wardrobe) {
      if (!e.boneKey) continue;
      const bone = this.studio.rig && this.studio.rig.bones.get(e.boneKey);
      if (!bone) {
        this.unbindToSceneRoot(e);
        changed = true;
      }
    }
    if (this.active && !this.wardrobe.includes(this.active)) {
      this.active = this.wardrobe[this.wardrobe.length - 1] || null;
      changed = true;
    }
    if (changed) this.syncModel();
  }

  /** Runs right before the rig is cleared/disposed. Every bound gear is unseated to
   * the scene root (world pose kept) so clearing the skeleton does NOT destroy the
   * gear geometry with the bones — an "unbind on bone removal". */
  onBeforeRigChange() {
    let changed = false;
    for (const e of this.wardrobe) {
      if (!e.boneKey) continue;
      this.unbindToSceneRoot(e);
      changed = true;
    }
    if (changed) this.syncModel();
  }

  /** Unbind a piece to the scene root preserving its world pose, and mark it
   * UNBOUND (boneKey = null). */
  unbindToSceneRoot(e) {
    const m = e.group.matrixWorld.clone();
    if (e.group.parent) e.group.parent.remove(e.group);
    this.studio.threeScene.add(e.group);
    e.group.position.setFromMatrixPosition(m);
    e.group.quaternion.setFromRotationMatrix(m);
    e.group.scale.setFromMatrixScale(m);
    e.boneKey = null;
  }

  // ------------------------------------------------------------------ loading
  async loadGear(files) {
    if (!this.studio.rig || !this.studio.rig.bones.size) {
      this.toast.error('Fit needs a skeleton (Rig mode) before you can load gear.');
      return;
    }
    let raw;
    try {
      raw = await loadGearFiles(files);
    } catch (err) {
      this.toast.error('Could not load that gear file.');
      return;
    }
    if (isRigged(raw)) {
      this.toast.error('That file is a rigged character, not a gear prop. Gear must be a plain object.');
      return;
    }
    this.addGear(raw);
  }

  addGear(raw) {
    // A piece baked by BakeFittedGLB carries its authored seat: the socket BONE key
    // (championFit) + the local TRS under that bone (fitLocal). Re-loading must attach
    // at that exact pose — a generic re-seat would reset the fitter's gizmo tuning.
    const prefit = readPrefitMeta(raw);
    this.measure = measureModel(this.studio);
    const prep = prefit.fitKey ? null : prepareGear(raw, this.measure);

    // Keep a pristine clone for clean exports, apply studio materials to the live copy.
    const pristine = raw.clone(true);
    raw.traverse((o) => {
      if (o.isMesh && o.material && !Array.isArray(o.material)) {
        const m = o.material;
        const src = m.map || null;
        const mat = new THREE.MeshStandardMaterial({
          color: m.color ? m.color.clone() : new THREE.Color(0xffffff),
          map: src,
          roughness: 0.6,
          metalness: 0.05,
          side: THREE.DoubleSide,
        });
        if (m.transparent) { mat.transparent = true; mat.opacity = m.opacity; }
        o.material = mat;
      }
    });

    // Name the piece after the uploaded file, de-duplicated with a short numeric
    // suffix so re-uploading the same file never creates two indistinguishable entries.
    const name = uniqueGearName(raw.name || 'gear', this.wardrobe.map((w) => w.name));
    // The gear meshes live under studio.group once bound, so they surface in the
    // "My Shapes" tree. Rename them to the actual filename (not the GLB's internal
    // "Gear_…" labels) so the tree identifies the piece by what was uploaded.
    raw.traverse((o) => { if (o.isMesh) o.name = name; });
    raw.name = name;
    // Mark every mesh as a gear piece so UI (My Shapes tree, Details) can tell gear
    // apart from champion shapes — gear has baked-in paint and shouldn't be recoloured.
    raw.traverse((o) => { if (o.isMesh || o === raw) o.userData = Object.assign({}, o.userData, { isGear: true }); });
    const entry = {
      id: ++this.seq,
      name,
      group: raw,
      pristine,
      boneKey: null,
    };

    this.beginMutation('Load ' + entry.name);
    this.wardrobe.push(entry);
    if (prefit.fitKey) {
      const bone = attachPrefittedGroup(entry.group, this.studio.rig, prefit.fitKey);
      if (bone) {
        entry.boneKey = bone.name;
        entry.group.updateMatrixWorld(true);
        this.toast.show(`${entry.name} re-fitted on ${bone.name} (pre-fitted, pose kept).`);
      } else {
        // Socket bone no longer exists — fall through to a fresh generic seat.
        this.seatToBone(entry, guessBone(this.studio.rig));
      }
    } else {
      this.seatToBone(entry, guessBone(this.studio.rig));
    }
    this.endMutation();
    // Attach the gizmo to the freshly-loaded piece right away (defaulting to the
    // current gizmo mode, usually Move) so the user can nudge it without re-picking
    // the tool. A blank active state keeps the gizmo hidden.
    this.setActive(entry);
    this.syncModel();
    // Let the "My Shapes" tree re-render right away so a freshly loaded gear shows up
    // immediately (no deselect/reselect needed).
    this.studio.emit('changed');
  }

  /** Seat entry onto a given bone without removing other accessories. */
  seatToBone(entry, bone) {
    if (!bone) {
      this.toast.error('No bone available to seat that piece on.');
      return;
    }
    const seated = socketFitProp({
      rig: this.studio.rig,
      measure: this.measure,
      boneKey: bone.name,
      group: entry.group,
      paired: entry.group.userData.paired,
    });
    if (!seated) return;
    entry.boneKey = seated.name;
    entry.group.updateMatrixWorld(true);
    this.toast.show(`${entry.name} fitted on ${bone.name}.`);
  }

  seat(entry) {
    this.seatToBone(entry, guessBone(this.studio.rig));
  }

  setActive(entry) {
    this.active = entry;
    if (entry && this.studio.mode === 'fit') {
      // Attach the SHARED gizmo to the whole gear group, not a leaf mesh.
      this.tc.setMode(this.gizmoMode || 'translate');
      this.tc.attach(entry.group);
      if (this.gizmoHelper) this.gizmoHelper.visible = true;
    } else if (!entry) {
      this.hideGizmo();
    }
    this.emit('fit-ui-change');
  }

  /** Bind the active piece to a named bone, preserving other pieces. One undo unit. */
  bindActiveToBone(boneName) {
    if (!this.active) {
      this.toast.show('Select a gear piece to bind first.');
      return;
    }
    const bone = this.studio.rig && this.studio.rig.bones.get(boneName);
    if (!bone) {
      this.toast.error(`This model has no "${boneName}" bone.`);
      return;
    }
    this.beginMutation('Bind ' + this.active.name + ' to ' + boneName);
    this.seatToBone(this.active, bone);
    this.endMutation();
    this.syncModel();
  }

  /** Move the active piece out of its bone to the scene root, preserving world pose. */
  unbindActive() {
    if (!this.active) {
      this.toast.show('Select a gear piece to unbind first.');
      return;
    }
    if (!this.active.boneKey) {
      this.toast.show('That piece is already unbound.');
      return;
    }
    this.beginMutation('Unbind ' + this.active.name);
    this.unbindToSceneRoot(this.active);
    this.endMutation();
    this.syncModel();
  }

  /** List every bone name on the current rig, for the Details picker. */
  getBoneList() {
    if (!this.studio.rig) return [];
    return [...this.studio.rig.bones.keys()].map((name) => ({ name }));
  }

  // ------------------------------------------------------------- gizmo (shared)
  setGizmoMode(mode) {
    if (!this.active) { this.toast.show('Load a gear piece first — the fit tools move that.'); return; }
    this.gizmoMode = mode;
    if (mode) {
      this.tc.setMode(mode);
      this.tc.attach(this.active.group);
      if (this.gizmoHelper) this.gizmoHelper.visible = true;
    } else {
      this.hideGizmo();
    }
    this.emit('fit-ui-change');
  }

  hideGizmo() {
    // The shared TransformControls must STAY enabled — main.js's updateGizmo()
    // re-attaches the same helper for Build/Rig/Pose and three r185 ignores all
    // pointer input while enabled=false (gizmo would render but be unclickable).
    // detach() alone is enough to make it inert (pointerDown returns when object
    // is undefined).
    this.tc.detach();
    if (this.gizmoHelper) this.gizmoHelper.visible = false;
  }

  onGizmoDragging(e) {
    if (!this.active) return;
    if (e.value) {
      // Capture baseline for proportional scale + one undo unit for the whole drag.
      if (this.tc.mode === 'scale') this.scaleDragStart = this.active.group.scale.clone();
      this.beginMutation('Adjust ' + this.active.name);
    } else {
      this.scaleDragStart = null;
      this.endMutation();
    }
  }

  onGizmoObjectChange() {
    if (!this.active) return;
    if (this.tc.mode === 'scale' && this.stretchEnabled && this.scaleDragStart) {
      // Proportional (all-axis) scale while SHIFT is held: the dominant axis ratio
      // governs, so dragging one handle scales the whole piece uniformly. Without
      // SHIFT (default) TransformControls handles the dragged axis on its own, so a
      // single axis arrow scales only that axis — exactly like Build mode.
      const s = this.active.group.scale;
      const ratios = [s.x / this.scaleDragStart.x, s.y / this.scaleDragStart.y, s.z / this.scaleDragStart.z];
      const r = ratios.reduce((a, b) => (Math.abs(b - 1) > Math.abs(a - 1) ? b : a), 1);
      s.set(this.scaleDragStart.x * r, this.scaleDragStart.y * r, this.scaleDragStart.z * r);
    }
    this.studio.emit('fit-change');
  }

  done() {
    this.hideGizmo();
    this.active = null;
    this.emit('fit-ui-change');
  }

  // ------------------------------------------------------------- wardrobe ops
  removeSelected() {
    if (!this.active) { this.toast.show('Select a gear piece to remove it.'); return; }
    this.beginMutation('Remove ' + this.active.name);
    this.removeEntries([this.active], true);
    this.endMutation();
    this.syncModel();
  }

  removeEntries(entries, nested) {
    for (const e of entries) {
      this.wardrobe = this.wardrobe.filter((x) => x !== e);
      e.group.removeFromParent();
      if (this.active === e) this.active = this.wardrobe[this.wardrobe.length - 1] || null;
    }
    // The removed piece may have been gizmo-attached; point the gizmo at the
    // surviving piece (or detach+hide when nothing remains) so it never lingers
    // on a removed object at world origin.
    if (this.active) this.setActive(this.active);
    else this.hideGizmo();
    if (!nested) this.emit('fit-ui-change');
  }

  /** Remove EVERY fitted gear piece and reset the fit undo stacks. Used by
   *  "New scene" so the wardrobe does not outlive the scene it fitted gear into. */
  clearAll() {
    for (const e of this.wardrobe) e.group.removeFromParent();
    this.wardrobe = [];
    this.active = null;
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.seq = 0;
    this.hideGizmo();
    this.emit('fit-ui-change');
  }

  // ------------------------------------------------------------- undo / redo
  beginMutation(label) {
    if (this.pendingMutation) this.endMutation();
    this.pendingMutation = { label, before: captureWardrobeState(this.wardrobe, this.active ? this.active.id : null) };
  }

  endMutation() {
    if (!this.pendingMutation) return;
    const after = captureWardrobeState(this.wardrobe, this.active ? this.active.id : null);
    if (!wardrobeStateEquals(this.pendingMutation.before, after)) {
      this.undoStack.push({ label: this.pendingMutation.label, state: this.pendingMutation.before });
      if (this.undoStack.length > 50) this.undoStack.shift();
      this.redoStack.length = 0;
    }
    this.pendingMutation = null;
  }

  undo() {
    const item = this.undoStack.pop();
    if (!item) return false;
    this.redoStack.push({ label: item.label, state: captureWardrobeState(this.wardrobe, this.active ? this.active.id : null) });
    this.restore(item.state);
    return true;
  }

  redo() {
    const item = this.redoStack.pop();
    if (!item) return false;
    this.undoStack.push({ label: item.label, state: captureWardrobeState(this.wardrobe, this.active ? this.active.id : null) });
    this.restore(item.state);
    return true;
  }

  restore(state) {
    // Tear down the existing wardrobe, then rebuild from the snapshot.
    for (const e of this.wardrobe) e.group.removeFromParent();
    this.wardrobe = [];
    this.active = null;
    for (const s of state.entries) {
      const entry = {
        id: s.id, name: s.name, group: s.group, pristine: s.pristine, boneKey: s.boneKey,
      };
      entry.group.position.fromArray(s.p);
      entry.group.quaternion.fromArray(s.q);
      entry.group.scale.fromArray(s.s);
      // Re-attach under the bone if bound, else the scene root (unbound piece).
      const bone = this.studio.rig?.bones.get(entry.boneKey);
      const parent = bone || this.studio.threeScene;
      if (entry.group.parent) entry.group.removeFromParent();
      parent.add(entry.group);
      entry.group.updateMatrixWorld(true);
      this.wardrobe.push(entry);
      if (s.id === state.activeId) this.active = entry;
    }
    // Re-attach the SHARED gizmo to the restored active piece so undo/redo leave
    // a live, grab-able gizmo. setActive emits fit-ui-change too, refreshing the UI.
    this.setActive(this.active);
  }

  // Model edit helpers -------------------------------------------------------
  /** Push the live model + gear back into a stable group for export. In Fit mode we
   * DON'T reparent gear into studio.group (that would fight the bone attach), so
   * the dressed export clones studio.group + attaches gear to the cloned bones. */
  syncModel() {
    this.emit('fit-ui-change');
  }

  async buildFittedDownload() {
    if (!this.active) { this.toast.show('Select a gear piece to download.'); return; }
    const entry = this.active;
    try {
      const buffer = await bakeFittedGLB(entry, this.studio.rig);
      this.downloadBuffer(buffer, bakedFileName(entry.name));
      this.toast.show('Downloaded ' + bakedFileName(entry.name) + '!');
    } catch (err) {
      this.toast.error(err && err.message ? err.message : 'Could not bake the fitted piece.');
    }
  }

  async buildDressedDownload() {
    if (!this.wardrobe.length) { this.toast.show('Fit at least one gear piece first.'); return; }
    if (this.studio.rig?.graph.size && !this.studio.rig.skinBones.length) { this.toast.error('Wait for bending to finish before downloading your champion.'); return; }
    try {
      const buffer = await bakeDressed(this.studio, this.wardrobe);
      this.downloadBuffer(buffer, 'champion-dressed.glb');
      this.toast.show('Downloaded champion-dressed.glb!');
    } catch (err) {
      this.toast.error(`Could not download the dressed model: ${err.message}`);
    }
  }

  downloadBuffer(buffer, filename) {
    const blob = new Blob([buffer], { type: 'model/gltf-binary' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }

  /** Serialize the whole wardrobe to baked fitted GLBs for persistence.
   * Output field is `bone`, the bone NAME (null when unbound). */
  async serializeWardrobe() {
    const out = [];
    for (const entry of this.wardrobe) {
      if (!this.studio.rig) throw Error('Wardrobe cannot be saved without its skeleton.');
      try {
        const buffer = await bakeFittedGLB(entry, this.studio.rig);
        out.push({ name: entry.name, bone: entry.boneKey, buffer });
      } catch (err) {
        throw Error('Could not save fitted gear ' + entry.name + ': ' + err.message);
      }
    }
    return out;
  }

  /** Restore the wardrobe from persisted baked fitted GLBs. Assumes the champion
   * document (with its bones) has already been restored. */
  async restoreWardrobePieces(pieces) {
    if (!Array.isArray(pieces)) throw Error('Invalid wardrobe.');
    if (pieces.length && !this.studio.rig) throw Error('Wardrobe needs its skeleton.');
    this.wardrobe = [];
    this.active = null;
    for (const p of pieces) {
      let group;
      try {
        group = await parseGLBBuffer(p.buffer);
      } catch (err) {
        throw Error('Could not restore fitted gear ' + p.name + ': ' + err.message);
      }
      this.addGearFromPersisted(group, p);
    }
    this.syncModel();
  }

  /** Rebuild a single wardrobe entry from a restored (already pre-fitted) piece. */
  addGearFromPersisted(group, meta) {
    group.name = meta.name || 'gear';
    group.traverse((o) => { if (o.isMesh || o === group) o.userData = Object.assign({}, o.userData, { isGear: true }); });
    const prefit = readPrefitMeta(group);
    const bone = prefit.fitKey ? attachPrefittedGroup(group, this.studio.rig, prefit.fitKey) : null;
    if (!bone) {
      // Unbound (or the named bone no longer exists) — park at the scene root.
      this.studio.threeScene.add(group);
    }

    const entry = {
      id: ++this.seq,
      name: group.name,
      group,
      pristine: group.clone(true),
      boneKey: bone ? bone.name : null,
    };
    if (!bone && meta.bone !== null) this.seat(entry);
    this.wardrobe.push(entry);
    this.setActive(entry);
  }

  makeToolbar(container) {
    this.toolbar = new FitToolbar(container, this.studio, {
      wardrobe: () => this.wardrobe,
      active: () => this.active,
      bone: () => (this.active ? this.active.boneKey : null),
      boneList: () => this.getBoneList(),
      gizmoMode: () => this.gizmoMode,
      onLoadGear: (files) => this.loadGear(files),
      onBindBone: (name) => this.bindActiveToBone(name),
      onUnbind: () => this.unbindActive(),
      onGizmoMode: (m) => this.setGizmoMode(m),
      onDone: () => this.done(),
      onRemoveSelected: () => this.removeSelected(),
      onDownloadFitted: () => this.buildFittedDownload(),
      onDownloadDressed: () => this.buildDressedDownload(),
    });
    // The toolbar's active-dependent controls (slot/gizmo/done) change when the
    // fit UI state changes, not only on a mode switch.
    this.on('fit-ui-change', () => this.toolbar.render());
    return this.toolbar;
  }
}
