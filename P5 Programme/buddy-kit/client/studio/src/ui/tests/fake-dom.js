// src/ui/tests/fake-dom.js
// A DOM small enough to build a toolbar in Node, and no smaller.
//
// This is the pattern pose.spec.js already uses, lifted out so more than one spec can drive real
// UI classes. It works for toolbar.js and dropdown.js because they only ever need `document`. It
// does NOT extend to main.js: that file builds a THREE.WebGLRenderer at module scope, and no stub
// object can stand in for a graphics context — which is why main.js's decisions were extracted
// into plain modules instead of being reached through a fake document.
//
// Not a *.spec.js, so the runner's walk does not try to execute it as a spec.

export class FakeNode {
  constructor(tag) {
    this.tagName = String(tag || 'div').toUpperCase();
    this.textContent = '';
    this.title = '';
    this.disabled = false;
    this.type = '';
    this.accept = '';
    this.value = '';
    this.files = [];
    this.style = {};
    this.childNodes = [];
    this.clicked = 0;
    this._classes = new Set();
    this._listeners = {};
  }

  get className() { return [...this._classes].join(' '); }
  set className(v) { this._classes = new Set(String(v).split(/\s+/).filter(Boolean)); }

  get classList() {
    const set = this._classes;
    return {
      add: (...names) => names.forEach((n) => set.add(n)),
      remove: (...names) => names.forEach((n) => set.delete(n)),
      contains: (name) => set.has(name),
      toggle: (name, force) => {
        const on = force === undefined ? !set.has(name) : !!force;
        if (on) set.add(name); else set.delete(name);
        return on;
      },
    };
  }

  appendChild(child) { this.childNodes.push(child); return child; }
  append(...kids) { for (const k of kids) this.childNodes.push(k); }
  addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); }

  /** Fire this node's click handlers with an event carrying the methods the UI calls on it. */
  click() {
    this.clicked++;
    this.dispatch('click');
  }

  /** Fire any listener kind — `change` on a file input, say — so specs never have to reach into
   * the private listener map to drive a control. */
  dispatch(type, event = {}) {
    for (const fn of this._listeners[type] || []) fn({ stopPropagation() {}, preventDefault() {}, ...event });
  }

  set innerHTML(_) { this.childNodes = []; }
  get innerHTML() { return ''; }

  /** Every descendant, depth-first, in the order it was appended. */
  walk(out = []) {
    for (const child of this.childNodes) {
      out.push(child);
      child.walk(out);
    }
    return out;
  }

  /** Every BUTTON in this subtree — including the ones inside a Dropdown's menu. */
  buttons() { return this.walk().filter((n) => n.tagName === 'BUTTON'); }

  /** The first descendant whose text is exactly `text`, or null. */
  byText(text) { return this.walk().find((n) => n.textContent === text) || null; }
}

/**
 * Install a fake `document`, run `fn(container, document)`, and always put the real one back —
 * even when the body throws, so one failing spec cannot leave a fake document behind for the next.
 * @param {(container: FakeNode, doc: FakeNode) => any} fn
 */
export function withFakeDom(fn) {
  const previous = globalThis.document;
  const doc = new FakeNode('body');
  doc.createElement = (tag) => new FakeNode(tag);
  globalThis.document = doc;
  try {
    return fn(new FakeNode('div'), doc);
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
}
