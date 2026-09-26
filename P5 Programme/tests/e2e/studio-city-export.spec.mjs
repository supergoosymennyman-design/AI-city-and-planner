// studio-city-export.spec.mjs — the Studio's "Export for AI City" button must
// OPEN and DOWNLOAD for a model with NO rig (the ordinary solid-object case,
// including the starter box). Regression: `CityExportPanel.open()` read
// `rig.graph` unguarded, so with `studio.rig === null` it threw before
// `showModal()` and the button looked completely dead.
//
// Needs the BUILT Studio bundle (source mode routes /studio/ to the legacy Fit
// Studio). Run with E2E_DOCROOT="P5 Programme/deploy/city-sim".
import { test, expect } from '@playwright/test';

test.skip(!process.env.E2E_DOCROOT, 'The Vite Studio ships only in the built bundle — set E2E_DOCROOT.');

test('Export for AI City opens and downloads for an unrigged model', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/studio/', { waitUntil: 'load' });
  // A fresh visitor gets a starter box + the welcome card.
  await expect(page.locator('.shop-card').first()).toBeVisible({ timeout: 90000 });
  await page.locator('#welcome-go').click();
  await expect(page.locator('#welcome-overlay.show')).toHaveCount(0);

  // The bug: this used to throw on a null rig and never open the dialog.
  await page.locator('#export-city').click();
  const dialog = page.locator('dialog.motion-dialog[open]');
  await expect(dialog).toBeVisible({ timeout: 30000 });
  await expect(dialog).toContainText('Export for AI City');

  // "Place in my city" must produce a real download.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    dialog.locator('[data-place]').click(),
  ]);
  expect(download.suggestedFilename()).toBe('my-ai-city-creation.glb');
  await expect(dialog.locator('.motion-status')).toContainText(/Downloaded/i);

  // "Use as my Champion" is the same null-rig-safe path.
  const [champion] = await Promise.all([
    page.waitForEvent('download'),
    dialog.locator('[data-champion]').click(),
  ]);
  expect(champion.suggestedFilename()).toBe('my-ai-city-champion.glb');

  expect(errors).toEqual([]);
});
