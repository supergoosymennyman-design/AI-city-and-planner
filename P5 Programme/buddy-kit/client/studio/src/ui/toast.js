export class Toast {
  constructor(container) {
    this.container = container;
    this.timer = null;
  }

  show(message, type = 'info') {
    this.container.textContent = message;
    this.container.className = 'toast show ' + type;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.container.classList.remove('show'), 4000);
  }

  error(message) {
    this.show(message, 'error');
  }
}
