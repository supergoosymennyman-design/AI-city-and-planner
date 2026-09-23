// src/ui/keys.js
// Who owns the keyboard.
//
// Extracted from main.js so it can be tested (main.js builds a WebGLRenderer at module scope and
// can never be imported in Node). The studio's hotkeys are bare single keys — 1-4 switch mode,
// G/R/S switch the gizmo, Delete removes the selection — so the moment a child is typing into a
// field, every one of those keys is also a character they meant to type. Getting this wrong is
// child-facing and silent: naming a shape "Rex" would switch the gizmo to Rotate and Scale, and
// typing a 3 into a Bend box would throw them into Pose mode mid-edit.

/**
 * Does this element own the keyboard, so the studio's hotkeys must stay out of the way?
 * @param {{tagName?: string, isContentEditable?: boolean}|null|undefined} el usually event.target
 * @returns {boolean}
 */
export function isTyping(el) {
  if (!el) return false;
  const tag = el.tagName;
  // `!!` only on the last term: a plain element has no isContentEditable at all, and main.js's
  // original returned that `undefined` straight out. Every caller tests it for truth, so this
  // changes no behaviour — it just makes the documented boolean actually a boolean.
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!el.isContentEditable;
}
