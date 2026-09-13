// journey.spec.mjs — the UNIFIED planner → 3D city user journey.
//
// Planner + pregame + city-builder share ONE origin so localStorage carries the
// student's layout from "🌆 View my city" straight into the 3D city (no file
// download/upload round-trip). This only exists in the BUILT bundle, so the
// spec requires E2E_DOCROOT=deploy/city-sim (which `npm run test:e2e` sets).
import { test, expect } from '@playwright/test';

test.skip(!process.env.E2E_DOCROOT, 'journey spec needs the built bundle (E2E_DOCROOT=deploy/city-sim)');

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
  // Same-origin seed: a saved city + coach dismissed (as the planner would
  // leave them) so the first-run coach modal can't block the toolbar.
  await page.addInitScript(({ LAYOUT_KEY, COACH_KEY, layout }) => {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
    localStorage.setItem(COACH_KEY, '1');
  }, { LAYOUT_KEY, COACH_KEY, layout: TINY_LAYOUT });

  await page.goto('/planner/', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await expect(page.locator('#lock-overlay')).toHaveCount(0);
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

test('planner opens directly — Academy is a companion, not a lock', async ({ page }) => {
  // Fresh context, no flags → the planner is usable immediately.
  await page.goto('/planner/', { waitUntil: 'load' });
  await page.waitForTimeout(800);
  await expect(page.locator('#lock-overlay')).toHaveCount(0);
  await expect(page.locator('#btn-academy')).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15000 });
});

test('pregame finale saves a portable progress file and opens the planner', async ({ page }) => {
  // All four rooms complete → the finale shows with the planner button enabled.
  await page.addInitScript(({ PROGRESS_KEY }) => {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ 1: true, 2: true, 3: true, 4: true }));
  }, { PROGRESS_KEY });

  await page.goto('/pregame/', { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await expect(page.locator('#btn-unlock')).toBeEnabled({ timeout: 10000 });

  // The Academy also offers a Champion File backup of its own progress (so a
  // child who only finishes the Academy can still carry their work to a new
  // device). This is the data-loss fix, exercised end to end.
  await expect(page.locator('#btn-save-progress')).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#btn-save-progress'),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.champion\.json$/);

  await page.click('#btn-unlock');
  await page.waitForURL(/\/planner\/$/, { timeout: 15000 });

  // The planner is open (no gate exists any more).
  await page.waitForTimeout(800);
  await expect(page.locator('#lock-overlay')).toHaveCount(0);
  await expect(page.locator('#btn-academy')).toBeVisible();
});
