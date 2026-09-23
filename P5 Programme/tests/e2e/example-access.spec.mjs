import { test, expect } from '@playwright/test';

const STORAGE_KEY = 'p5_city_planner_layout_v1';
const savedCity = {
  version:2,
  scaleMeters:2000,
  roads:[],
  parks:[],
  buildings:[{ type:'housing', pos:[500, 500] }],
};

async function seedSavedCity(page) {
  const raw = JSON.stringify(savedCity);
  await page.addInitScript(({ key, raw }) => {
    localStorage.setItem(key, raw);
    localStorage.setItem('p5_planner_unlocked', '1');
    localStorage.setItem('p5_city_planner_coach_v1', '1');
  }, { key:STORAGE_KEY, raw });
  return raw;
}

test('city entry opens the example without replacing a saved city', async ({ page }) => {
  const raw = await seedSavedCity(page);
  await page.goto('/city-builder/');
  await expect(page.locator('#entry-example')).toBeVisible();
  await page.locator('#entry-example').click();
  await expect(page.locator('#example-session-banner')).toBeVisible();
  await expect(page.locator('#example-return')).toHaveAttribute('href', '/city-builder/?resume=1');
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBe(raw);
});

test('planner example action saves the plan and opens the isolated preview', async ({ page }) => {
  await seedSavedCity(page);
  await page.goto('/planner/');
  await page.locator('#planner-more > summary').click();
  await page.locator('#btn-example').click();
  await expect(page.locator('#example-session-banner')).toBeVisible();
  expect(JSON.parse(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY))).toEqual(savedCity);
});

test('running city can switch to the example and return to its saved city', async ({ page }) => {
  const raw = await seedSavedCity(page);
  await page.goto('/city-builder/?resume=1');
  await page.waitForFunction(() => document.querySelector('#loading.done') && window.__city?.renderer);
  await page.locator('#city-more > summary').click();
  await page.locator('#more-example').click();
  await expect(page.locator('#example-session-banner')).toBeVisible();
  await expect(page.locator('#example-return')).toHaveAttribute('href', '/city-builder/?resume=1');
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBe(raw);
});
