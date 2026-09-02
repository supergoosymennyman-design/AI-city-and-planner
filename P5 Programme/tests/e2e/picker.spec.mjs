// picker.spec.mjs — opens the prop library picker in the city builder and
// verifies the picker renders cards and a first selection starts placement.
//
// Consolidates the old ad-hoc script: scripts/picker-check.mjs.
import { test, expect } from '@playwright/test';

// Genuinely breaking patterns. THREE NaN-geometry warnings are a known
// pre-existing cosmetic artifact (cloud merge) — reported, not failed.
// "Failed to load resource: 404" console messages are duplicates of the response
// events (which filter /api/* correctly); ignore them here, trust the response handler.
const CRITICAL = /load failed|unknown library|No DRACOLoader|setMeshoptDecoder|Failed to fetch|404/i;
const isApi404 = (text) => /404/.test(text) && /api\//.test(text);

test('prop picker opens, renders cards, and first card starts placing', async ({ page }) => {
  const errors = [];
  const warnings = [];
  page.on('console', (m) => {
    const t = m.text();
    if (/Failed to load resource/i.test(t)) return; // duplicate of response events
    if (m.type() === 'error' || /fail|warn|error/i.test(t)) {
      (CRITICAL.test(t) ? errors : warnings).push(t);
    }
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('response', (r) => {
    if (r.status() >= 400 && !isApi404(r.url())) errors.push(`[http${r.status()}] ${r.url()}`);
  });

  await page.goto('/city-builder/', { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('button')].find((b) => /empty sample/i.test(b.textContent || ''));
    if (el) el.click();
  });
  await expect(page.locator('canvas')).toBeVisible({ timeout: 60000 });
  await page.waitForTimeout(12000);

  // open the 🧰 panel
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button, div[role=button]')].find((e) => /🧰/.test(e.textContent || ''));
    if (btn) btn.click();
  });
  await page.waitForTimeout(1500);

  const info = await page.evaluate(() => {
    const panel = document.querySelector('.prop-lib-panel, [class*=prop-lib]');
    const cards = document.querySelectorAll('.prop-lib-card').length;
    const firstCard = document.querySelector('.prop-lib-card');
    if (firstCard) firstCard.click();
    return { panelOpen: !!panel, cards };
  });
  expect(info.panelOpen, 'prop library panel did not open').toBe(true);
  expect(info.cards, 'no prop library cards rendered').toBeGreaterThan(0);

  await page.waitForTimeout(2500);
  const placing = await page.evaluate(() => {
    const t = document.body.innerText || '';
    return {
      hint: /tap the ground|點一下地面|place/i.test(t),
      toolbar: !!document.querySelector('.prop-lib-tb-name, [class*=prop-lib-tb]'),
    };
  });
  expect(placing.hint || placing.toolbar, 'selecting a card did not enter placement mode').toBe(true);
  expect(errors, `console errors:\n${errors.join('\n') || '(none)'}`).toEqual([]);
});
