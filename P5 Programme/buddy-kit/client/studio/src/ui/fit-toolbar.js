import { Dropdown } from './dropdown.js';

/**
 * Fit-mode toolbar — loads gear, exposes the shared gizmo mode (Move/Rotate/Scale
 * in one dropdown) and download actions (fitted / dressed in one dropdown). Bone
 * binding lives in the gear piece's Details panel, not here. Mirrors the shared
 * Toolbar's look (Dropdowns + flat buttons) so fit controls feel identical.
 */
export class FitToolbar {
  constructor(container, studio, callbacks = {}) {
    this.container = container;
    this.studio = studio;
    this.cb = callbacks;
    studio.on('mode', () => this.render());
    studio.on('fit-change', () => this.render());
    this.render();
  }

  btn(label, fn, opts = {}) {
    const b = document.createElement('button');
    b.textContent = label;
    if (opts.cls) b.className = opts.cls;
    if (opts.active) b.classList.add('active');
    if (opts.title) b.title = opts.title;
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
    // Only own the container while in Fit mode; on any other mode the shared
    // Toolbar renders into it and we must not wipe its output.
    if (this.studio.mode !== 'fit') return;
    this.container.innerHTML = '';

    if (!this.studio.rig || !this.studio.rig.bones.size) {
      this.hint('Fit needs a skeleton — in Rig mode, tap the model to place joints, then come back.');
      return;
    }

    // Wardrobe row first so the user sees what's worn.
    const worn = this.cb.wardrobe ? this.cb.wardrobe() : [];
    if (worn.length) {
      this.container.appendChild(this.btn('🗑️ Remove selected gear', () => this.cb.onRemoveSelected?.(), {
        title: 'Remove the currently selected gear piece from the model',
      }));
    }

    // Load gear file input.
    const file = document.createElement('input');
    file.type = 'file';
    file.accept = '.glb,.gltf,.fbx,.obj,.bin,.png,.jpg,.jpeg,.mtl';
    file.multiple = true;
    file.style.display = 'none';
    file.addEventListener('change', () => {
      this.cb.onLoadGear?.(file.files);
      file.value = '';
    });
    this.container.appendChild(file);
    this.container.appendChild(this.btn('📥 Load gear (GLB/OBJ/FBX)', () => file.click(), {
      cls: 'action',
    }));

    // Fit controls — shown once a piece is loaded.
    const active = this.cb.active ? this.cb.active() : null;
    if (active) {
      const gm = this.cb.gizmoMode ? this.cb.gizmoMode() : 'translate';
      const gizmoLabel = { translate: '✋ Move', rotate: '🔄 Rotate', scale: '↔️ Scale' }[gm] || '✋ Move';
      const transform = new Dropdown(gizmoLabel, [
        { label: '✋ Move', active: gm === 'translate', fn: () => this.cb.onGizmoMode?.('translate') },
        { label: '🔄 Rotate', active: gm === 'rotate', fn: () => this.cb.onGizmoMode?.('rotate') },
        { label: '↔️ Scale', active: gm === 'scale', fn: () => this.cb.onGizmoMode?.('scale') },
      ], 'select');
      this.container.appendChild(transform.el);
    }

    if (worn.length) {
      const download = new Dropdown('📦 Download', [
        { label: 'Download fitted GLB', fn: () => this.cb.onDownloadFitted?.() },
        { label: 'Download dressed model', fn: () => this.cb.onDownloadDressed?.(), cls: 'dd-danger' },
      ], 'action');
      this.container.appendChild(download.el);
    } else {
      this.hint('Load a gear piece to start fitting.');
    }
  }
}