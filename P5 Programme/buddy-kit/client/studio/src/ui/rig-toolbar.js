// src/ui/rig-toolbar.js
// Rig mode's own toolbar (task 014): New chain, Remove joint, Clear skeleton, the three-step hint,
// and the status line the controller keeps (progress, the numbers, the outside warning).
export class RigToolbar {
  constructor(container, studio, controller, callbacks = {}) {
    this.container = container;
    this.studio = studio;
    this.controller = controller;
    this.cb = callbacks;
    studio.on('mode', () => this.render());
    studio.on('select', () => this.render());
    studio.on('changed', () => this.render());
    controller.onStatus(() => this.render());
    this.render();
  }

  btn(label, fn, opts = {}) {
    const b = document.createElement('button');
    b.textContent = label;
    if (opts.title) b.title = opts.title;
    b.disabled = !!opts.disabled;
    b.addEventListener('click', fn);
    return b;
  }

  render() {
    // Only own the container in Rig mode; the shared Toolbar renders the others.
    if (this.studio.mode !== 'rig') return;
    this.container.innerHTML = '';
    const rig = this.controller.rig;
    const joints = rig ? rig.graph.size : 0;
    const selected = this.controller.selectedId;
    if (this.cb.onAutoRig) this.container.appendChild(this.btn('Auto-rig', this.cb.onAutoRig, {
      title: 'Give the selected model a skeleton using UniRig',
    }));
    this.container.appendChild(this.btn('New chain', () => this.controller.newChain(), {
      title: 'Deselect, so the next tap on the model starts a new chain of joints', disabled: !selected,
    }));
    this.container.appendChild(this.btn('Remove joint', () => this.controller.removeSelected(), {
      title: 'Remove the selected joint and everything hanging off it (Delete)', disabled: !selected,
    }));
    this.container.appendChild(this.btn('Clear skeleton', () => {
      if (this.controller.clearSkeleton()) this.cb.toast?.show('Skeleton cleared. Undo brings it back.');
    }, { title: 'Remove every joint', disabled: !joints }));
    if (joints && rig.graph.targetShapes) {
      const targets = this.studio.shapes.filter((m) => rig.graph.targetShapes.includes(m.userData.id));
      const ignored = this.studio.shapes.filter((m) => !m.userData.isGear && !targets.includes(m)).length;
      const scope = document.createElement('span');
      scope.className = 'hint rig-scope';
      scope.textContent = `Rigging: ${targets.length === 1 ? targets[0].name || 'model' : `${targets.length} parts`}${ignored ? ` · ${ignored} other shape${ignored === 1 ? '' : 's'} ignored` : ''}`;
      this.container.appendChild(scope);
    }
    this.container.appendChild(this.steps(joints, selected));
    const status = this.controller.status;
    const line = document.createElement('span');
    line.className = 'hint rig-status';
    line.dataset.state = status.state;
    line.textContent = status.text;
    line.title = status.details || '';
    this.container.appendChild(line);
    if (status.warnings.length) {
      const n = status.warnings.length;
      const warn = document.createElement('span');
      warn.className = 'hint rig-warning';
      warn.textContent = n === 1 ? '1 joint sits outside the model — drag it inside.' : `${n} joints sit outside the model — drag them inside.`;
      this.container.appendChild(warn);
    }
  }

  steps(joints, selected) {
    const labels = ['tap the model', 'tap again to grow the chain', 'tap a ball, then the model, to branch'];
    const active = joints === 0 ? 0 : selected ? 1 : 2;
    const hint = document.createElement('span');
    hint.className = 'hint steps';
    labels.forEach((label, i) => {
      const part = document.createElement('span');
      part.textContent = `${i + 1} ${label}`;
      part.classList.toggle('active-step', i === active);
      hint.appendChild(part);
      if (i < labels.length - 1) hint.appendChild(document.createTextNode(' · '));
    });
    return hint;
  }
}
