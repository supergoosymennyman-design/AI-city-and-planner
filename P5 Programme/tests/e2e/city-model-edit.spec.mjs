// city-model-edit.spec.mjs — the AI City model workflow the child is promised:
// place a model, SELECT it (yellow box + inspector), resize it, delete it, and
// take it into the Model Studio and back.
//
// Regression: after a drop the placement overlay (a full-screen input boundary)
// covered the Decorate bar, so "Select / Move" and any model tap looked dead.
// And the City's "Edit model in Fit Studio" opened `/studio/model.html`, which
// did not exist in the same-origin Vite Studio — a 404. The Studio round-trip
// needs the BUILT bundle; set E2E_DOCROOT="P5 Programme/deploy/city-sim".
import { test, expect } from '@playwright/test';

async function bootExampleCity(page) {
  await page.goto('/city-builder/?example=1', { waitUntil: 'load' });
  // The prop library mounts with the city; its API is the readiness seam.
  await page.waitForFunction(() => !!window.__propLibrary, null, { timeout: 60000 });
  await page.waitForTimeout(8000);
}

/** Decorate → pick the first model → drop it at a known ground point. */
async function placeFirstModel(page) {
  await page.locator('[data-city-mode="decorate"]').click();
  await page.waitForTimeout(700);
  await page.locator('.prop-lib-card').first().click();
  await page.waitForFunction(() => window.__propLibrary?.isReadyToPlace?.(), null, { timeout: 20000 });
  await page.mouse.move(560, 500);
  await page.waitForTimeout(150);
  await page.mouse.move(640, 520);
  await page.waitForTimeout(250);
  await page.mouse.down();
  await page.waitForTimeout(60);
  await page.mouse.up();
  await page.waitForTimeout(700);
  expect(await page.evaluate(() => window.__propLibrary.getCount())).toBe(1);
}

/** Screen point of the placed model, so the tap lands on it regardless of camera. */
async function modelScreenPoint(page) {
  return page.evaluate(() => {
    let group = null;
    window.__scene.traverse((o) => { if (!group && o.userData && o.userData.propId) group = o; });
    if (!group) return null;
    const V = group.position.constructor, cam = window.__city.camera;
    const v = group.getWorldPosition(new V()).project(cam);
    const rect = window.__city.renderer.domElement.getBoundingClientRect();
    return { x: Math.round((v.x * 0.5 + 0.5) * rect.width), y: Math.round((-v.y * 0.5 + 0.5) * rect.height) };
  });
}

test('a placed model selects, resizes and deletes (Select / Move works after a drop)', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await bootExampleCity(page);
  await placeFirstModel(page);
  expect(await page.evaluate(() => window.__propLibrary.isPlacing())).toBe(true);

  // The fix: Select / Move must leave placement mode (its overlay otherwise eats
  // the tap) rather than look dead.
  await page.click('#btn-next');
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__propLibrary.isPlacing())).toBe(false);

  // Tapping the model now selects it: yellow highlight box + inspector.
  const point = await modelScreenPoint(page);
  expect(point).not.toBeNull();
  await page.mouse.click(point.x, point.y);
  await expect(page.locator('#prop-inspector')).toBeVisible({ timeout: 10000 });
  expect(await page.evaluate(() => !!window.__grab.getSelected())).toBe(true);

  // Resize.
  const slider = page.locator('#prop-inspector input[type="range"]');
  await slider.evaluate((el) => { el.value = '1.5'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(300);
  const scaled = await page.evaluate(() => window.__propLibrary.getRecords()[0].scale?.[0]);
  expect(Math.abs(scaled - 1.5)).toBeLessThan(0.001);

  // Delete.
  await page.locator('#prop-inspector [data-inspect="delete"]').click();
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__propLibrary.getCount())).toBe(0);

  expect(errors).toEqual([]);
});

test('Edit model in Fit Studio round-trips a placed model back into the City', async ({ page }) => {
  test.skip(!process.env.E2E_DOCROOT, 'The Model Studio page ships only in the built bundle — set E2E_DOCROOT.');
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await bootExampleCity(page);
  await placeFirstModel(page);
  await page.click('#btn-next');
  await page.waitForTimeout(300);
  const point = await modelScreenPoint(page);
  expect(point).not.toBeNull();
  await page.mouse.click(point.x, point.y);
  await expect(page.locator('#prop-inspector')).toBeVisible({ timeout: 10000 });

  // The hand-off must open a REAL page (not a 404) at the same origin.
  await page.locator('#prop-inspector [data-inspect="fit-studio"]').click();
  await page.waitForURL(/\/studio\/model\.html\?transfer=/, { timeout: 30000 });
  await expect(page.locator('#status')).toContainText(/Editing/i, { timeout: 20000 });
  expect(await page.evaluate(() => document.getElementById('save').disabled)).toBe(false);

  // Save returns to the City and swaps THIS object to the edited revision.
  await page.click('#save');
  await page.waitForURL(/\/city-builder\/\?.*studioTransfer=/, { timeout: 30000 });
  await page.waitForFunction(() => (window.__propLibrary?.getRecords?.() || []).some((r) => r.visualSource?.kind === 'custom'), null, { timeout: 30000 });
  // The edited object is selected again so its inspector (resize/delete/Fit
  // Studio) is right there.
  await expect(page.locator('#prop-inspector')).toBeVisible({ timeout: 15000 });
  const after = await page.evaluate(() => ({
    url: location.search,
    custom: window.__propLibrary.getRecords().filter((r) => r.visualSource?.kind === 'custom').length,
    mode: document.body.dataset.cityMode,
  }));
  expect(after.custom).toBe(1);
  expect(after.mode).toBe('decorate');
  expect(after.url).not.toContain('studioTransfer'); // the param is cleaned so a refresh cannot replay

  expect(errors).toEqual([]);
});
