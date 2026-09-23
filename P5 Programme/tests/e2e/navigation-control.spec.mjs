import { test, expect } from '@playwright/test';

const LAYOUT_KEY = 'p5_city_planner_layout_v1';
const LAYOUT = {
  version: 2,
  scaleMeters: 2000,
  roads: [{ points: [[100, 1000], [1900, 1000]], width: 14, class: 'primary' }],
  parks: [],
  buildings: [
    { type: 'city_central', pos: [250, 1000], footprint: [28, 28], height: 60 },
    { type: 'school', pos: [1750, 1000], footprint: [34, 30], height: 35 },
    { type: 'office', pos: [1000, 1000], footprint: [100, 180], height: 70, rotation: Math.PI / 8 },
  ],
};

async function boot(page) {
  await page.addInitScript(({ key, layout }) => localStorage.setItem(key, JSON.stringify(layout)),
    { key: LAYOUT_KEY, layout: LAYOUT });
  await page.goto('/city-builder/?resume=1', { waitUntil: 'load' });
  await page.waitForFunction(() => document.getElementById('loading')?.classList.contains('done')
    && !!window.__city?.champion && !!window.__city?.navigation, null, { timeout: 60000 });
}

async function chooseDestination(page, mode, index = 1) {
  await page.click('#my-work-btn');
  await page.click('[data-work-action="destinations"]');
  await page.locator(`[data-${mode}="${index}"]`).click();
}

test('manual walking and flight controls cancel destination automation', async ({ page }) => {
  await boot(page);

  await chooseDestination(page, 'walk');
  await expect.poll(() => page.evaluate(() => window.__city.navigation.walking)).toBe(true);
  await page.keyboard.down('w');
  await expect.poll(() => page.evaluate(() => window.__city.navigation.walking)).toBe(false);
  await page.keyboard.up('w');
  await expect(page.locator('.toast', { hasText: 'You are in control' }).last()).toBeVisible();

  await chooseDestination(page, 'fly');
  await expect.poll(() => page.evaluate(() => window.__city.navigation.flying)).toBe(true);
  await page.keyboard.down('ArrowUp');
  await expect.poll(() => page.evaluate(() => window.__city.navigation.flying)).toBe(false);
  await page.keyboard.up('ArrowUp');
});
