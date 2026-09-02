// journey.spec.mjs — the UNIFIED planner → 3D city user journey.
//
// Planner + pregame + city-builder share ONE origin so localStorage carries the
// student's layout from "🌆 View my city" straight into the 3D city (no file
// download/upload round-trip). This only exists in the BUILT bundle, so the
// spec requires E2E_DOCROOT=deploy/city-sim (which `npm run test:e2e` sets).
import { test, expect } from '@playwright/test';

test.skip(!process.env.E2E_DOCROOT, 'journey spec needs the built bundle (E2E_DOCROOT=deploy/city-sim)');

const UNLOCK_KEY = 'p5_planner_unlocked';
const LAYOUT_KEY = 'p5_city_planner_layout_v1';
const PROGRESS_KEY = 'p5_pregame_progress';
const COACH_KEY = 'p5_city_planner_coach_v1';

// A small valid layout (same shape the planner serializes; version 2 schema).
const TINY_LAYOUT = {
  version: 2, scaleMeters: 2000,
  roads: [{ points: [[200, 1000], [1800, 1000]], width: 14, class: 'primary' }],
  parks: [{ cx: 1500, cz: 1500, radius: 80 }],
  buildings: [{ type: 'city_central', pos: [1000, 1000], footprint: [28, 28], height: 100 }],
};

test('planner → "View my city" → 3D city auto-loads the layout', async ({ page }) => {
  // Same-origin seed: unlocked + a saved city + coach dismissed (as the planner
  // would leave them) so the first-run coach modal can't block the toolbar.
  await page.addInitScript(({ UNLOCK_KEY, LAYOUT_KEY, COACH_KEY, layout }) => {
    localStorage.setItem(UNLOCK_KEY, '1');
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
    localStorage.setItem(COACH_KEY, '1');
  }, { UNLOCK_KEY, LAYOUT_KEY, COACH_KEY, layout: TINY_LAYOUT });

  await page.goto('/planner/', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await expect(page.locator('#lock-overlay')).not.toBeVisible();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15000 });

  // The CTA: save + walk into the 3D city.
  await page.click('#btn-export');
  await page.waitForURL(/\/city-builder\/\?from=planner/, { timeout: 15000 });

  // 3D city boots WITHOUT the entry overlay (auto-load).
  await expect(page.locator('canvas')).toBeVisible({ timeout: 60000 });
  await page.waitForFunction(
    () => document.getElementById('loading')?.classList.contains('done') === true,
    null, { timeout: 60000 }
  );
  const entryVisible = await page.evaluate(
    () => !document.getElementById('entry-overlay')?.classList.contains('hidden')
  );
  expect(entryVisible, 'entry overlay should be skipped on auto-load').toBe(false);
});

test('planner is locked without the license, unlocked with the same-origin flag', async ({ page }) => {
  // Fresh context — no unlock flag → locked.
  await page.goto('/planner/', { waitUntil: 'load' });
  await page.waitForTimeout(800);
  await expect(page.locator('#lock-overlay')).toBeVisible();

  // Same-origin unlock flag (what the pregame graduation sets) → reload → open.
  await page.evaluate((k) => localStorage.setItem(k, '1'), UNLOCK_KEY);
  await page.reload();
  await page.waitForTimeout(800);
  await expect(page.locator('#lock-overlay')).not.toBeVisible();
});

test('pregame graduation unlocks the planner same-origin (no file round-trip)', async ({ page }) => {
  // All four rooms complete → the finale shows with the unlock button enabled.
  await page.addInitScript(({ PROGRESS_KEY }) => {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ 1: true, 2: true, 3: true, 4: true }));
  }, { PROGRESS_KEY });

  await page.goto('/pregame/', { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await expect(page.locator('#btn-unlock')).toBeEnabled({ timeout: 10000 });

  await page.click('#btn-unlock');
  await page.waitForURL(/\/planner\/$/, { timeout: 15000 });

  // The planner is now unlocked — the flag was set before navigation.
  await page.waitForTimeout(800);
  await expect(page.locator('#lock-overlay')).not.toBeVisible();
});
