import { test, expect } from '@playwright/test';

const CITY_KEY = 'p5_city_planner_layout_v1';
const DRAFT_KEY = 'p5_city_example_draft_v1';
const saved = { version: 2, scaleMeters: 2000, roads: [], parks: [], buildings: [{ type: 'housing', pos: [500, 500] }] };
const seedSaved = ({ key, value }) => {
  if (sessionStorage.getItem('example_test_seeded')) return;
  sessionStorage.setItem('example_test_seeded', '1');
  localStorage.setItem(key, value);
  localStorage.setItem('p5_city_planner_coach_v1', '1');
};

test('example plan matches the 3D source and its edits preview without changing the saved city', async ({ page }) => {
  test.setTimeout(180_000);
  await page.addInitScript(seedSaved, { key: CITY_KEY, value: JSON.stringify(saved) });
  await page.goto('/city-builder/?example=1');
  await page.waitForFunction(() => document.querySelector('#loading.done') && window.__layout);
  const source = await page.evaluate(() => ({ roads: window.__layout.roads, parks: window.__layout.parks, buildings: window.__layout.buildings }));
  await page.locator('#city-mode-switch a.city-mode').click();
  await expect(page).toHaveURL(/\/planner\/\?example=1/);
  await expect(page.locator('#example-plan-banner')).toBeVisible();
  const draft = await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)), DRAFT_KEY);
  expect({ roads: draft.roads, parks: draft.parks, buildings: draft.buildings }).toEqual(source);
  await page.locator('#planner-more > summary').click();
  await page.locator('#auto-scenery').uncheck();
  await page.locator('#btn-decorate').click();
  await page.waitForFunction(() => document.querySelector('#loading.done') && window.__layout);
  expect(await page.evaluate(() => window.__layout.autoScenery)).toBe(false);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), CITY_KEY)).toEqual(saved);
  await page.locator('#city-mode-switch a.city-mode').click();
  expect(await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)).autoScenery, DRAFT_KEY)).toBe(false);
  await page.reload();
  await expect(page.locator('#example-plan-banner')).toBeVisible();
  expect(await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)).autoScenery, DRAFT_KEY)).toBe(false);
});

test('copying an example asks before replacing and keeps a recovery snapshot', async ({ page }) => {
  await page.addInitScript(seedSaved, { key: CITY_KEY, value: JSON.stringify(saved) });
  await page.goto('/planner/?example=1');
  await expect(page.locator('#example-plan-banner')).toBeVisible();
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('#use-example-plan').click();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), CITY_KEY)).toEqual(saved);
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#use-example-plan').click();
  await expect(page).toHaveURL(/\/planner\/$/);
  const result = await page.evaluate(key => ({
    layout: JSON.parse(localStorage.getItem(key)),
    recovery: JSON.parse(localStorage.getItem('p5_city_recovery_snapshot_v1')),
  }), CITY_KEY);
  expect(result.layout.buildings.length).toBeGreaterThan(100);
  expect(JSON.parse(result.recovery.state.layout)).toEqual(saved);
});

test('invalid preview draft never opens the saved city', async ({ page }) => {
  await page.addInitScript(({ key, value }) => {
    localStorage.setItem(key, value);
    sessionStorage.setItem('p5_city_example_draft_v1', '{bad');
  }, { key: CITY_KEY, value: JSON.stringify(saved) });
  await page.goto('/city-builder/?example=1&draft=1');
  await expect(page.locator('#entry-overlay')).toBeVisible();
  await expect(page.locator('#entry-overlay')).toContainText('example draft is missing or invalid');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), CITY_KEY)).toEqual(saved);
});

test('example can become the first city without silently saving beforehand', async ({ page }) => {
  await page.goto('/planner/?example=1');
  await expect(page.locator('#example-plan-banner')).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), CITY_KEY)).toBeNull();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#use-example-plan').click();
  await expect(page).toHaveURL(/\/planner\/$/);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).buildings.length, CITY_KEY)).toBeGreaterThan(100);
});
