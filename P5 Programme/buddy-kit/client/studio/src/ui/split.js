// src/ui/split.js
// Where the sidebar's draggable divider sits.
//
// Extracted from main.js so it can be tested (main.js builds a WebGLRenderer at module scope and
// can never be imported in Node). The geometry here is the part that has been wrong before: the
// ratio used to be taken against the WHOLE sidebar rather than the region the two panels actually
// share, which compressed the drag to ~0.48x and made the handle jump ~77px on pointerdown once
// the AI section joined the column.

/** Smallest and largest share the scene panel may take. Below this either panel stops being
 * usable — and since the divider is the only way back, a ratio that reaches 0 or 1 is a trap. */
export const SPLIT_MIN = 0.15;
export const SPLIT_MAX = 0.85;

/** Clamp a ratio into the usable range and round it, so the CSS calc() string stays stable
 * instead of jittering in the 6th decimal place on every pointermove. */
export function clampSplitRatio(ratio) {
  const r = Math.max(SPLIT_MIN, Math.min(SPLIT_MAX, ratio));
  return Math.round(r * 100000) / 100000;
}

/**
 * The raw (unclamped) ratio for a pointer at `clientY`, or null when the region has no room.
 *
 * `grabOffset` is where inside the handle the pointer landed. Subtracting it is what stops the
 * handle snapping its top edge under the cursor on pointerdown; `splitterHeight` is excluded from
 * the usable height because the handle itself occupies that space in neither panel.
 *
 * @param {{clientY:number, regionTop:number, regionHeight:number, splitterHeight:number, grabOffset:number}} m
 * @returns {number|null}
 */
export function splitRatioAt({ clientY, regionTop, regionHeight, splitterHeight, grabOffset }) {
  const usable = regionHeight - splitterHeight;
  if (!(usable > 0)) return null;
  return (clientY - grabOffset - regionTop) / usable;
}
