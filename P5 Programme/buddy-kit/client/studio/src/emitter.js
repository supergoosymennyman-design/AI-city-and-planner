export class Emitter {
  constructor() {
    this.listeners = new Map();
  }

  on(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    const list = this.listeners.get(event);
    if (list) this.listeners.set(event, list.filter((f) => f !== fn));
  }

  emit(event, ...args) {
    const list = this.listeners.get(event);
    if (list) [...list].forEach((fn) => fn(...args));
  }
}
