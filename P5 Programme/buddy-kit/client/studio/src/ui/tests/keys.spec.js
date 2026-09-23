/**
 * keys.spec.js — who owns the keyboard.
 *
 * The studio's hotkeys are bare single keys (1-4 mode, G/R/S gizmo, Delete removes the selection),
 * so while a child is typing into a field every one of those keys is also a character they meant.
 * Getting this wrong is silent and child-facing: naming a shape "Rex" would flip the gizmo to
 * Rotate then Scale, and typing 3 into a Bend box would throw them into Pose mode mid-edit.
 *
 * Lived in main.js, which builds a WebGLRenderer at module scope and can never be imported in
 * Node — so no check could reach this, however many were written.
 */
import { isTyping } from '../keys.js';

export default function (check) {
  const el = (tagName, extra = {}) => ({ tagName, ...extra });

  // One check per element kind: a single "a text field types" check would still pass with two of
  // the three tags deleted from the condition.
  check('keys: a text input owns the keyboard', isTyping(el('INPUT')) === true);
  check('keys: a textarea owns the keyboard', isTyping(el('TEXTAREA')) === true);
  check('keys: a select owns the keyboard', isTyping(el('SELECT')) === true);
  check('keys: a contenteditable element owns the keyboard',
    isTyping(el('DIV', { isContentEditable: true })) === true);

  check('keys: an ordinary element does not — the hotkeys stay live',
    isTyping(el('DIV')) === false && isTyping(el('BUTTON')) === false && isTyping(el('CANVAS')) === false);

  // keydown fires with target null often enough (a blurred document, a synthetic event) that the
  // guard must answer rather than throw: a throw here would kill the whole keydown handler and
  // take every hotkey with it.
  check('keys: no element at all is not typing, and does not throw',
    isTyping(null) === false && isTyping(undefined) === false);

  // The viewport canvas is the case that matters in the other direction: it IS where the child
  // works, and it must never be mistaken for a field, or the studio would have no hotkeys at all.
  check('keys: an element with isContentEditable false is not typing',
    isTyping(el('DIV', { isContentEditable: false })) === false);
}
