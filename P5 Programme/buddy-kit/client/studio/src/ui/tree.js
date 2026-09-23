import { primaryColorHex } from '../edit/material-ops.js';

export class TreePanel {
  constructor(container, studio) {
    this.container = container;
    this.studio = studio;
    studio.on('changed', () => this.render());
    studio.on('select', () => this.render());
    studio.on('mode', () => this.render());
  }

  heading(text) {
    const li = document.createElement('li');
    li.className = 'tree-heading';
    li.textContent = text;
    return li;
  }

  shapeItem(mesh) {
    const li = document.createElement('li');
    li.classList.toggle('selected', this.studio.selected === mesh || this.studio.selection.has(mesh));
    // Gear pieces carry baked-in paint (and can't be recoloured), so give them a
    // dedicated glyph instead of the champion shape's colour square.
    const isGear = mesh.userData && mesh.userData.isGear;
    const icon = document.createElement('span');
    if (isGear) {
      icon.className = 'gear-icon';
      icon.textContent = '⚙';
      icon.title = 'Gear piece';
    } else {
      icon.className = 'color-swatch';
      const hex = primaryColorHex(mesh.material);
      icon.style.background = `#${hex == null ? '888888' : hex.toString(16).padStart(6, '0')}`;
    }
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = mesh.name;
    li.append(icon, name);
    li.addEventListener('click', (e) => this.studio.select(mesh, e.shiftKey));
    return li;
  }

  render() {
    this.container.innerHTML = '';

    // Split the shapes the same way they show up in the viewport: champion parts go
    // under "Shapes", gear pieces (flagged isGear, the cogwheel icon) go under Gear.
    const shapes = this.studio.shapes;
    const gear = shapes.filter((m) => m.userData && m.userData.isGear);
    const parts = shapes.filter((m) => !(m.userData && m.userData.isGear));

    this.container.appendChild(this.heading(`Shapes (${parts.length})`));
    for (const mesh of parts) this.container.appendChild(this.shapeItem(mesh));

    if (gear.length) {
      this.container.appendChild(this.heading(`Gear (${gear.length})`));
      for (const mesh of gear) this.container.appendChild(this.shapeItem(mesh));
    }

    const rig = this.studio.rig;
    if (rig) {
      this.container.appendChild(this.heading(`Skeleton (${rig.bones.size})`));
      for (const [name, bone] of rig.bones) {
        const li = document.createElement('li');
        li.classList.toggle('selected', this.studio.selected === bone);
        const swatch = document.createElement('span');
        swatch.className = 'color-swatch';
        swatch.style.background = this.studio.selected === bone ? '#ffc34a' : '#9fb0c7';
        const nameEl = document.createElement('span');
        nameEl.className = 'name';
        nameEl.textContent = name;
        li.append(swatch, nameEl);
        li.addEventListener('click', (e) => this.studio.select(bone, e.shiftKey));
        this.container.appendChild(li);
      }
    }
  }
}
