export class Dropdown {
  // kind: 'select' = picks a mode/setting (shows current value + ✓ on the active
  // option); 'action' = runs an effect immediately when an option is chosen.
  constructor(label, options = [], kind = 'select') {
    this.el = document.createElement('div');
    this.el.className = 'dd ' + (kind === 'action' ? 'action' : 'select');
    this.toggle = document.createElement('button');
    this.toggle.className = 'dd-toggle';
    this.toggle.title = kind === 'action' ? 'Runs straight away' : 'Choose one';
    this.menu = document.createElement('div');
    this.menu.className = 'dd-menu';
    this.options = options;
    this.toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      this.el.classList.toggle('open');
      if (this.el.classList.contains('open')) this.render();
    });
    document.addEventListener('click', () => this.close());
    this.el.append(this.toggle, this.menu);
    this.setLabel(label);
    this.render();
  }

  setLabel(text) {
    this.toggle.textContent = text;
  }

  close() {
    this.el.classList.remove('open');
  }

  render() {
    this.menu.innerHTML = '';
    for (const opt of this.options) {
      const b = document.createElement('button');
      b.textContent = opt.label;
      const active = typeof opt.active === 'function' ? opt.active() : !!opt.active;
      if (active) b.classList.add('active');
      if (opt.cls) b.classList.add(opt.cls);
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.close();
        opt.fn && opt.fn();
      });
      this.menu.appendChild(b);
    }
  }
}
