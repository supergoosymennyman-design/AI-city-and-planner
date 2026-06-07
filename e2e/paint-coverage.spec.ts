import { expect, test } from '@playwright/test';

/**
 * REAL-CANVAS smoke test for the draw-to-fill mechanic (PaintableShape).
 *
 * WHY this can't be a unit test: jsdom has no canvas, so `getImageData` reads all-transparent
 * and coverage is always 0% — the ~60% auto-snap threshold is invisible to Vitest (the UX-breaker
 * harness caveat). Here a real Chromium canvas runs the actual pixel-coverage math, so we can
 * prove that DRAGGING ALONE (never pressing "Fill it!") colours the shape past the threshold and
 * advances the lesson. This closes the test blind spot flagged by the ux-breaker review.
 *
 * Uses ?realvoice so the dev voice-sim panel isn't installed — keeps the canvas the only target.
 */
test.describe('draw-to-fill: real-canvas coverage auto-completes the shape', () => {
  test('scribbling past the threshold advances to "name the colour" without "Fill it!"', async ({ page }) => {
    await page.goto('/?realvoice');

    // intro → teaching
    await page.getByRole('button', { name: "Let's Go!" }).click();

    // Pick the Red crayon (swatches are name-labelled buttons, §6b).
    await page.getByRole('button', { name: 'Red' }).click();

    const canvas = page.locator('.ctr-paint-canvas');
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    // Sanity: before any stroke the coverage progressbar reads 0%.
    const progress = page.getByRole('progressbar');
    await expect(progress).toHaveAttribute('aria-valuenow', '0');

    // Dense serpentine scribble across the whole canvas box. Strokes are clipped to the shape
    // path, so out-of-shape pixels don't count — the in-shape area fills toward ~100%, well past
    // the 0.6 threshold. One continuous pointer stroke with many segments (mouse events dispatch
    // real pointerdown/move/up that the canvas listens for).
    const inset = 0.06; // skip the thick outline margin
    const x0 = box.x + box.width * inset;
    const x1 = box.x + box.width * (1 - inset);
    const rows = 16;
    const top = box.y + box.height * inset;
    const step = (box.height * (1 - 2 * inset)) / rows;

    await page.mouse.move(x0, top);
    await page.mouse.down();
    for (let r = 0; r <= rows; r++) {
      const y = top + r * step;
      const leftToRight = r % 2 === 0;
      const from = leftToRight ? x0 : x1;
      const to = leftToRight ? x1 : x0;
      // several sub-steps per row so coverage samples (every 8 moves) keep up with the sweep
      const subSteps = 10;
      for (let s = 1; s <= subSteps; s++) {
        await page.mouse.move(from + ((to - from) * s) / subSteps, y);
      }
    }
    await page.mouse.up();

    // PROOF: the drag alone crossed the threshold → the shape completed → the lesson advanced to the
    // naming sub-phase ("What colour is this?"). We never touched "Fill it!". If coverage math were
    // broken (the retina-DPR bug, or a wrong denominator), this would NOT appear and the test fails.
    await expect(page.getByText('What colour is this?')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Teach AI!' })).toBeVisible();
  });

  test('the "Fill it!" button stays disabled until a crayon is picked (accessible fallback gate)', async ({ page }) => {
    await page.goto('/?realvoice');
    await page.getByRole('button', { name: "Let's Go!" }).click();
    // No crayon picked yet → the guaranteed-accessible fallback is correctly gated off.
    await expect(page.getByRole('button', { name: 'Fill it!' })).toBeDisabled();
  });
});
