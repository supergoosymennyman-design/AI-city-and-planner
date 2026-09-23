/**
 * split.spec.js — where the sidebar's draggable divider sits.
 *
 * Lived in main.js (WebGLRenderer at module scope, never importable in Node). The geometry has
 * been wrong before: the ratio was taken against the WHOLE sidebar rather than the region the two
 * panels actually share, which compressed the drag to ~0.48x and made the handle jump ~77px on
 * pointerdown once the AI section joined the column. The clamp is the other half — the divider is
 * the only way to resize either panel, so a ratio that reaches 0 or 1 hides the handle itself and
 * there is no way back.
 */
import { clampSplitRatio, splitRatioAt, SPLIT_MIN, SPLIT_MAX } from '../split.js';

const near = (a, b, tol = 1e-9) => Math.abs(a - b) < tol;

export default function (check) {
  check('split: a ratio inside the range passes through', near(clampSplitRatio(0.5), 0.5));
  check('split: dragging past the top stops at the minimum, never at zero',
    clampSplitRatio(0) === SPLIT_MIN && clampSplitRatio(-5) === SPLIT_MIN && SPLIT_MIN > 0);
  check('split: dragging past the bottom stops at the maximum, never at one',
    clampSplitRatio(1) === SPLIT_MAX && clampSplitRatio(99) === SPLIT_MAX && SPLIT_MAX < 1);
  // Both panels must keep a usable share: a clamp that pinned one side to ~0 would leave a panel
  // that exists but cannot be read, which is worse than one that is honestly collapsed.
  check('split: both panels keep a usable share at either end',
    SPLIT_MIN >= 0.1 && SPLIT_MAX <= 0.9 && near(SPLIT_MIN + (1 - SPLIT_MAX), 0.3));
  // The rounding is what stops the calc() string jittering in the 6th decimal on every
  // pointermove; without it the two panels restyle continuously through a drag.
  // Deliberately inside the clamp range: a value below SPLIT_MIN would be pinned to the minimum
  // and the rounding would never run, so the check would pass with the rounding deleted.
  check('split: the ratio is rounded to five decimals', clampSplitRatio(0.523456789) === 0.52346);

  // 300px region, 6px handle -> 294px usable. Grabbing the handle 3px down from its top and
  // holding the pointer at the region's midpoint must read as the midpoint.
  const region = { regionTop: 100, regionHeight: 300, splitterHeight: 6, grabOffset: 3 };
  check('split: the pointer maps to its share of the usable height, handle excluded',
    near(splitRatioAt({ ...region, clientY: 250 }), (250 - 3 - 100) / 294));
  check('split: the top of the region reads as zero, not a negative jump',
    near(splitRatioAt({ ...region, clientY: 103 }), 0));

  // grabOffset is what stops the handle snapping its top edge under the cursor on pointerdown —
  // the measured 77px jump. Without it the same pointer reads a different ratio.
  check('split: where inside the handle the pointer landed shifts the answer',
    splitRatioAt({ ...region, clientY: 250, grabOffset: 0 })
    !== splitRatioAt({ ...region, clientY: 250, grabOffset: 3 }));

  // The usable height is the REGION minus the handle, not the region: a ratio taken against the
  // whole height is the original bug, and reads differently for the same pointer.
  check('split: the handle is excluded from the usable height',
    !near(splitRatioAt({ ...region, clientY: 250 }), (250 - 3 - 100) / 300));

  // A collapsed or not-yet-laid-out region has no room to divide. Returning null lets the caller
  // leave the panels alone; a 0/0 would have written NaN into both flex strings.
  check('split: a region with no room answers null rather than NaN',
    splitRatioAt({ ...region, regionHeight: 6 }) === null
    && splitRatioAt({ ...region, regionHeight: 0 }) === null
    && splitRatioAt({ ...region, regionHeight: 3 }) === null);
}
