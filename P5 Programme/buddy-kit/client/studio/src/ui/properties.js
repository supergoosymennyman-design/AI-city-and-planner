import * as THREE from 'three';
import { primaryColorHex, setMaterialColor } from '../edit/material-ops.js';

const SWATCH_COLORS = [
  '#ff6b6b', '#ff922b', '#fcc419', '#51cf66', '#22b8cf',
  '#4dabf7', '#9775fa', '#f06595', '#f8f9fa', '#495057',
];

export class PropertyPanel {
  constructor(container, studio, toast, fitController, onSculpt) {
    this.studio = studio;
    this.container = container;
    this.toast = toast;
    this.fitController = fitController || null;
    this._onSculpt = onSculpt || null;
    this.build();
    studio.on('select', () => this.refresh());
    studio.on('transform', () => this.refresh());
    studio.on('changed', () => this.refresh());
    studio.on('mode', () => this.refresh());
    if (fitController) fitController.on('fit-ui-change', () => this.refresh());
  }

  build() {
    this.meshSection = document.createElement('div');
    this.meshSection.className = 'prop-stack';

    const nameRow = document.createElement('div');
    nameRow.className = 'row';
    nameRow.appendChild(this.label('Name'));
    this.nameInput = document.createElement('input');
    this.nameInput.type = 'text';
    nameRow.appendChild(this.nameInput);
    this.nameInput.addEventListener('change', () => {
      const mesh = this.currentMesh();
      if (!mesh) return;
      mesh.name = this.nameInput.value;
      this.studio.emit('changed');
    });
    this.meshSection.appendChild(nameRow);

    const colorRow = document.createElement('div');
    colorRow.className = 'row';
    colorRow.appendChild(this.label('Color'));
    this.colorInput = document.createElement('input');
    this.colorInput.type = 'color';
    colorRow.appendChild(this.colorInput);
    this.colorInput.addEventListener('input', () => {
      const mesh = this.currentMesh();
      if (!mesh || !mesh.material) return;
      setMaterialColor(mesh.material, this.colorInput.value);
      this.studio.emit('changed');
    });
    this.colorRow = colorRow;
    this.meshSection.appendChild(colorRow);

    // Quick-pick bright colour palette.
    this.swatchRow = document.createElement('div');
    this.swatchRow.className = 'row';
    this.swatchRow.appendChild(this.label('Pick'));
    this.swatches = document.createElement('div');
    this.swatches.className = 'swatches';
    for (const hex of SWATCH_COLORS) {
      const b = document.createElement('button');
      b.style.background = hex;
      b.title = hex;
      b.addEventListener('click', () => {
        const mesh = this.currentMesh();
        if (!mesh || !mesh.material) return;
        setMaterialColor(mesh.material, hex);
        this.studio.emit('changed');
        this.refresh();
      });
      this.swatches.appendChild(b);
    }
    this.swatchRow.appendChild(this.swatches);
    this.meshSection.appendChild(this.swatchRow);

    const torusRow = document.createElement('div');
    torusRow.className = 'row';
    torusRow.appendChild(this.label('Tube width'));
    this.tubeInput = document.createElement('input');
    this.tubeInput.type = 'number';
    this.tubeInput.min = '0.01';
    this.tubeInput.max = '0.38';
    this.tubeInput.step = '0.01';
    this.tubeInput.title = 'How thick the torus ring is';
    this.tubeInput.addEventListener('input', () => {
      const m = this.currentMesh();
      if (!m || m.userData.kind !== 'torus') return;
      const v = parseFloat(this.tubeInput.value);
      if (!Number.isNaN(v)) this.studio.setTorusTube(m, v);
    });
    torusRow.appendChild(this.tubeInput);
    this.meshSection.appendChild(torusRow);

    this.pos = this.vec3Row('Position', (axis, v) => {
      const m = this.currentMesh();
      if (m) m.position[axis] = v;
    });
    this.rot = this.vec3Row('Rotation', (axis, v) => {
      const m = this.currentMesh();
      if (m) m.rotation[axis] = THREE.MathUtils.degToRad(v);
    }, true);
    this.scl = this.vec3Row('Scale', (axis, v) => {
      const m = this.currentMesh();
      if (m) m.scale[axis] = v;
    });
    this.meshSection.appendChild(this.pos.row);
    this.meshSection.appendChild(this.rot.row);
    this.meshSection.appendChild(this.scl.row);

    const actions = document.createElement('div');
    actions.className = 'actions';
    const dup = document.createElement('button');
    dup.textContent = 'Duplicate';
    dup.addEventListener('click', () => {
      const m = this.currentMesh();
      if (!m) return;
      this.studio.pushUndo();
      this.studio.duplicate(m);
    });
    const del = document.createElement('button');
    del.textContent = 'Delete';
    del.title = 'Delete every selected shape.';
    del.addEventListener('click', () => {
      const meshes = [...this.studio.selection].filter((m) => m.isMesh);
      if (!meshes.length) return;
      this.studio.pushUndo();
      for (const m of meshes) this.studio.remove(m);
      this.studio.select(null);
    });
    const sculpt = document.createElement('button');
    sculpt.textContent = '🧱 Sculpt';
    sculpt.title =
      'Open this shape in the Clay Studio — pull, push, smooth, grab, carve and paint it, then press Done to put it back sculpted.';
    sculpt.addEventListener('click', () => {
      const m = this.currentMesh();
      if (m) this._onSculpt?.(m);
    });
    this.sculptBtn = sculpt;
    actions.append(dup, del, sculpt);
    this.meshSection.appendChild(actions);

    // ---- Joint section ----
    this.boneSection = document.createElement('div');
    this.boneSection.className = 'prop-stack';
    const bnRow = document.createElement('div');
    bnRow.className = 'row';
    bnRow.appendChild(this.label('Joint'));
    this.boneName = document.createElement('span');
    bnRow.appendChild(this.boneName);
    this.boneSection.appendChild(bnRow);

    const bpRow = document.createElement('div');
    bpRow.className = 'row';
    bpRow.appendChild(this.label('Parent'));
    this.boneParent = document.createElement('span');
    bpRow.appendChild(this.boneParent);
    this.boneSection.appendChild(bpRow);

    // A bend typed here is a pose edit: the Bone is drawn from it, the graph is what gets saved,
    // so readPose keeps the two equal (Task 9).
    this.boneRot = this.vec3Row('Bend', (axis, v) => {
      const bone = this.currentBone();
      if (!bone) return;
      bone.rotation[axis] = THREE.MathUtils.degToRad(v);
      this.studio.rig?.readPose();
    }, true);
    this.boneSection.appendChild(this.boneRot.row);

    const reset = document.createElement('button');
    reset.textContent = 'Reset pose';
    reset.addEventListener('click', () => {
      this.studio.rig?.rest();
      this.studio.emit('changed');
    });
    this.boneSection.appendChild(reset);

    // ---- Gear (fitted piece) section ----
    this.gearSection = document.createElement('div');
    this.gearSection.className = 'prop-stack';

    const gearHead = document.createElement('div');
    gearHead.className = 'row';
    gearHead.appendChild(this.label('Gear piece'));
    this.gearName = document.createElement('span');
    gearHead.appendChild(this.gearName);
    this.gearSection.appendChild(gearHead);

    this.gearStatus = document.createElement('div');
    this.gearStatus.className = 'empty';
    this.gearStatus.textContent = 'This piece is not bound to any bone yet.';
    this.gearSection.appendChild(this.gearStatus);

    const bindRow = document.createElement('div');
    bindRow.className = 'row';
    const bindLabel = this.label('Bind to bone');
    bindLabel.title = 'Attach this gear piece to a bone so it moves with the champion. Pick a bone here, then tune with the gizmo.';
    bindRow.appendChild(bindLabel);
    this.bindInput = document.createElement('select');
    this.bindInput.setAttribute('aria-label', 'Bind to bone');
    this.bindInput.appendChild(this.option('', '— choose a bone —'));
    bindRow.appendChild(this.bindInput);
    this.bindInput.addEventListener('change', () => {
      const fc = this.fitController;
      if (!fc || !fc.getActive()) return;
      if (this.bindInput.value) fc.bindActiveToBone(this.bindInput.value);
      else fc.unbindActive();
    });
    this.gearSection.appendChild(bindRow);

    const unbind = document.createElement('button');
    unbind.textContent = 'Unbind (move freely)';
    unbind.title = 'Detach this piece from its bone so it stays where it is but no longer follows the skeleton.';
    unbind.addEventListener('click', () => {
      const fc = this.fitController;
      if (fc && fc.getActive()) fc.unbindActive();
    });
    this.gearSection.appendChild(unbind);

    // ---- Empty hint ----
    this.emptyHint = document.createElement('div');
    this.emptyHint.className = 'empty';
    this.emptyHint.textContent = '👆 Click a shape or a joint ball to see its details here.';

    this.container.append(this.meshSection, this.boneSection, this.gearSection, this.emptyHint);
  }

  label(text) {
    const l = document.createElement('label');
    l.textContent = text;
    return l;
  }

  option(value, text) {
    const o = document.createElement('option');
    o.value = value;
    o.textContent = text;
    return o;
  }

  vec3Row(label, onChange, degrees = false) {
    const row = document.createElement('div');
    row.className = 'row';
    const lab = this.label(label);
    const vec = document.createElement('div');
    vec.className = 'vec3';
    const inputs = {};
    for (const axis of ['x', 'y', 'z']) {
      const input = document.createElement('input');
      input.type = 'number';
      input.step = '0.01';
      input.addEventListener('input', () => {
        const value = parseFloat(input.value);
        if (!Number.isNaN(value)) onChange(axis, value);
        this.scheduleTransformSave();
      });
      inputs[axis] = input;
      vec.appendChild(input);
    }
    row.append(lab, vec);
    return { row, inputs, degrees };
  }

  /** Debounced: a transform edit should be persisted (auto-save), but we do NOT
   * emit on every keystroke — wait for a pause, then commit the change. */
  scheduleTransformSave() {
    clearTimeout(this._transformSaveTimer);
    this._transformSaveTimer = setTimeout(() => {
      this.studio.emit('changed');
    }, 300);
  }

  currentMesh() {
    return this.studio.selected && !this.studio.selected.isBone ? this.studio.selected : null;
  }

  currentBone() {
    return this.studio.selected && this.studio.selected.isBone ? this.studio.selected : null;
  }

  isEditingNumber() {
    const el = document.activeElement;
    if (!el || el.tagName !== 'INPUT' || el.type !== 'number') return false;
    return this.container.contains(el);
  }

  refresh() {
    const mesh = this.currentMesh();
    const bone = this.currentBone();
    // The bind-to-bone panel belongs to GEAR pieces only, shown while in Fit mode
    // with a gear piece active. Champion objects never show it.
    const gear = this.studio.mode === 'fit' && this.fitController ? this.fitController.getActive() : null;
    this.emptyHint.hidden = !!(mesh || bone || gear);
    this.meshSection.hidden = !mesh;
    this.boneSection.hidden = !bone;
    this.gearSection.hidden = !gear;
    // Gear pieces carry authored baked-in paint — recolouring them from Details
    // would fight the baked palette, so hide the Color + Pick controls for them.
    const isGearMesh = !!(mesh && gear);
    this.colorRow.hidden = isGearMesh;
    this.swatchRow.hidden = isGearMesh;

    if (gear) {
      const fc = this.fitController;
      this.gearName.textContent = gear.name;
      // Refresh the bone options to match the current rig.
      const bones = fc.getBoneList ? fc.getBoneList() : [];
      this.bindInput.innerHTML = '';
      this.bindInput.appendChild(this.option('', '— choose a bone —'));
      for (const b of bones) this.bindInput.appendChild(this.option(b.name, b.name));
      this.bindInput.value = gear.boneKey || '';
      this.gearStatus.textContent = gear.boneKey
        ? `Bound to ${gear.boneKey}. Pick a bone to move it, or Unbind to make it float.`
        : 'This piece is not bound to any bone yet — it is floating freely.';
    }

    if (mesh) {
      this.nameInput.value = mesh.name;
      const shown = primaryColorHex(mesh.material);
      if (shown != null) this.colorInput.value = '#' + shown.toString(16).padStart(6, '0');
      this.sculptBtn.hidden = !!mesh.userData.isGear;
      this.tubeInput.parentElement.hidden = mesh.userData.kind !== 'torus';
      if (mesh.userData.kind === 'torus' && mesh.userData.torus && !this.isEditingNumber()) {
        this.tubeInput.value = mesh.userData.torus.tube.toFixed(2);
      }
      if (!this.isEditingNumber()) {
        for (const axis of ['x', 'y', 'z']) {
          this.pos.inputs[axis].value = mesh.position[axis].toFixed(2);
          this.rot.inputs[axis].value = THREE.MathUtils.radToDeg(mesh.rotation[axis]).toFixed(1);
          this.scl.inputs[axis].value = mesh.scale[axis].toFixed(2);
        }
      }
    } else if (bone) {
      this.boneName.textContent = bone.name;
      this.boneParent.textContent = bone.parent && bone.parent.isBone ? bone.parent.name : '—';
      if (!this.isEditingNumber()) {
        for (const axis of ['x', 'y', 'z']) {
          this.boneRot.inputs[axis].value = THREE.MathUtils.radToDeg(bone.rotation[axis]).toFixed(1);
        }
      }
    }
  }
}
