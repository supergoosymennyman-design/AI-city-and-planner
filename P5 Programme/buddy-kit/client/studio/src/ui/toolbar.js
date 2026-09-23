import { Dropdown } from './dropdown.js';

const SHAPES = [
  ['box', '🧱 box'],
  ['sphere', '⚪ sphere'],
  ['cylinder', '🥫 cylinder'],
  ['cone', '🔺 cone'],
  ['torus', '🍩 torus'],
  ['octahedron', '💎 octahedron'],
  ['plane', '🪟 plane'],
];

export class Toolbar {
  constructor(container, studio, transformControls, callbacks = {}) {
    this.container = container;
    this.studio = studio;
    this.tc = transformControls;
    this.cb = callbacks;
    studio.on('mode', () => this.render());
    studio.on('select', () => this.render());
    // Scoped to Pose mode: 'changed' fires for lots of unrelated things (AI generation finishing,
    // etc.), and Build must not tear itself down for those (it can snap an open dropdown shut) —
    // the only reason to re-render off 'changed' is Pose mode's hint changing once the bending
    // arrives (owner ruling, fix round 1).
    studio.on('changed', () => { if (this.studio.mode === 'pose') this.render(); });
    // Pose mode has no RigController of its own — it borrows the one Rig mode uses so it can learn
    // a solve FAILED or was REFUSED, not just that it finished (final review fix round, F2: a
    // rebind erroring or being refused used to leave Pose reading "you can pose as soon as it is
    // ready" forever, with no route to the truth). Optional: callers that never pass one (tests
    // that only exercise Build/the carry-over Rest button) keep the old best-guess hint.
    this.cb.rigController?.onStatus(() => { if (this.studio.mode === 'pose') this.render(); });
    this.render();
  }

  btn(label, fn, cls = '') {
    const b = document.createElement('button');
    b.textContent = label;
    if (cls) b.className = cls;
    b.addEventListener('click', fn);
    return b;
  }

  hint(text) {
    const s = document.createElement('span');
    s.className = 'hint';
    s.textContent = text;
    this.container.appendChild(s);
    return s;
  }

  render() {
    // Fit and Rig modes own this container through their own toolbars; the shared
    // Toolbar must not wipe either on every select/change event.
    if (this.studio.mode === 'fit' || this.studio.mode === 'rig') return;
    this.container.innerHTML = '';
    const mode = this.studio.mode;
    if (mode === 'build') this.renderBuild();
    else if (mode === 'pose') this.renderPose();
  }

  renderBuild() {
    this.container.appendChild(
      new Dropdown(
        '➕ Add shape',
        SHAPES.map(([key, label]) => ({
          label,
          fn: () => {
            this.studio.pushUndo();
            this.studio.addPrimitive(key);
          },
        })),
        'action',
      ).el,
    );

    const gizmoLabel = { translate: '✋ Move', rotate: '🔄 Rotate', scale: '↔️ Scale' }[this.tc.mode] || 'Move';
    this.container.appendChild(
      new Dropdown(
        gizmoLabel,
        [
          { id: 'translate', label: '✋ Move' },
          { id: 'rotate', label: '🔄 Rotate' },
          { id: 'scale', label: '↔️ Scale' },
        ].map((m) => ({
          label: m.label,
          active: this.tc.mode === m.id,
          fn: () => {
            this.tc.setMode(m.id);
            this.render();
          },
        })),
        'select',
      ).el,
    );

    if (this.tc.mode === 'scale' && this.cb.onProportionalScale) {
      const keep = this.btn('Keep proportions', () => this.cb.onProportionalScale());
      const active = !!this.cb.proportionalScale?.();
      keep.classList.toggle('active', active);
      keep.ariaPressed = String(active);
      keep.title = 'Keep the object\'s current X, Y and Z proportions while scaling';
      this.container.appendChild(keep);
    }

    if (this.cb.onImport) {
      const file = document.createElement('input');
      file.type = 'file';
      file.accept = '.glb,.gltf';
      file.style.display = 'none';
      file.addEventListener('change', () => {
        if (file.files[0]) this.cb.onImport(file.files[0]);
        file.value = '';
      });
      this.container.appendChild(file);
      this.container.appendChild(this.btn('📥 Import', () => file.click()));
    }

    // AI generation (docs/superpowers/specs/2026-09-19-3d-studio-ai-generation-design.md). Plain
    // words, no emoji: new UI follows the repo's no-emoji rule for designed UI.
    if (this.cb.onMakeItReal) {
      const real = this.btn('Make it real', () => this.cb.onMakeItReal());
      real.title = 'Turn your build into a 3D cartoon model with AI';
      this.container.appendChild(real);
    }
    if (this.cb.onMakeFromWords) {
      const fromWords = this.btn('Make from words', () => this.cb.onMakeFromWords());
      fromWords.title = 'Describe a character and let AI make it in 3D';
      this.container.appendChild(fromWords);
    }
    if (this.cb.onWireframe) {
      const wf = this.btn('🔲 Wireframe', () => this.cb.onWireframe());
      wf.classList.toggle('active', !!this.cb.wireframe?.());
      wf.title = 'Toggle wireframe view (W)';
      this.container.appendChild(wf);
    }
  }

  renderPose() {
    const rig = this.studio.rig;
    if (!rig || !rig.bones.size) {
      this.hint('Give the model a skeleton in Rig mode first — tap the model to place joints.');
      return;
    }
    this.container.appendChild(this.btn('Rest', () => this.cb.onRest?.(), 'rest'));
    if (this.cb.onAnimate) this.container.appendChild(this.btn('Walk / Jump', () => this.cb.onAnimate()));
    this.container.appendChild(this.btn('Export', () => this.cb.onExportPose?.()));
    this.hint(this.poseHint(rig));
  }

  /** Pose mode has no controls of its own to fix a failed or refused bind — the only thing it can
   * do is send the child back to Rig mode, so its hint must say WHAT happened there, not just
   * "still working" forever (final review fix round, F2). `skinBones` only fills on a SUCCESSFUL
   * bind, so an empty list alone can't tell "still solving" apart from "it failed" or "it was
   * refused" — the controller's `status` (when one was given) breaks that tie; `status.text` is
   * already written in the child's own words (RigToolbar renders it verbatim in Rig mode), so this
   * only adds where to go to fix it. 'waiting'/'running' keep the plain "still working" line —
   * those are not lies. */
  poseHint(rig) {
    if (rig.skinBones.length) {
      return 'Tap a ball. The ring appears at the joint above it — that is the hinge. Turn the ring to swing the lit piece. The first ball turns the whole model. Rest straightens everything.';
    }
    const status = this.cb.rigController?.status;
    if (status && (status.state === 'error' || status.state === 'idle')) {
      return `${status.text} Go back to Rig mode to fix it.`;
    }
    return 'Working out the bending… you can pose as soon as it is ready.';
  }
}
