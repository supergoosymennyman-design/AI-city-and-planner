// save-restore.spec.mjs — the Champion File data-loss safety net, end to end:
// save (named download) → wipe the device → restore from the file.
//
// Runs against source or an explicitly selected existing bundle.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';



const UNLOCK_KEY = 'p5_planner_unlocked';
const LAYOUT_KEY = 'p5_city_planner_layout_v1';
const QUESTS_KEY = 'hk_ai_city_quests_v1';
const SKIN_KEY = 'hk_ai_city_skin_v2';

const LAYOUT = JSON.stringify({
  version: 2, scaleMeters: 2000,
  roads: [{ points: [[200, 1000], [1800, 1000]], width: 14, class: 'primary' }],
  parks: [{ cx: 1500, cz: 1500, radius: 80 }],
  buildings: [{ type: 'city_central', pos: [1000, 1000], footprint: [28, 28], height: 100 }],
});

test('save my city → wipe storage → restore from the downloaded file', async ({ page }) => {
  // Seed a "returning student" state — but ONLY on the first load. addInitScript
  // runs before every navigation, so guard with a session flag or the "wipe
  // storage" step would be immediately undone by the reload re-seeding.
  await page.addInitScript(({ UNLOCK_KEY, LAYOUT_KEY, QUESTS_KEY, SKIN_KEY, LAYOUT }) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem(UNLOCK_KEY, '1');
    localStorage.setItem(LAYOUT_KEY, LAYOUT);
    localStorage.setItem(QUESTS_KEY, JSON.stringify({ 1: true, 14: true }));
    localStorage.setItem(SKIN_KEY, 'crimson');
  }, { UNLOCK_KEY, LAYOUT_KEY, QUESTS_KEY, SKIN_KEY, LAYOUT });

  await page.goto('/city-builder/', { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await expect(page.locator('#entry-overlay')).toBeVisible();

  // Save: open the modal, name it, download. 💾 Save my city lives inside the
  // collapsed "Open or restore" disclosure, so open that first.
  await page.click('#entry-open-flow > summary');
  await page.click('#entry-save');
  await expect(page.locator('#save-modal')).toBeVisible();
  await page.fill('#save-name', 'Jason week 3');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#save-download'),
  ]);
  expect(download.suggestedFilename()).toBe('Jason-week-3.champion.json');
  const filePath = await download.path();
  const savedJson = JSON.parse(readFileSync(filePath, 'utf8'));
  expect(savedJson.kind).toBe('passiona-champion-file');
  expect(savedJson.state.skin).toBe('crimson');
  expect(savedJson.state.quests).toContain('14');

  // Wipe the device (iOS-style eviction / different tablet) and reload.
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1000);
  const wiped = await page.evaluate((k) => localStorage.getItem(k), SKIN_KEY);
  expect(wiped).toBeNull();

  // Restore: upload the saved file.
  await page.setInputFiles('#file-input', filePath);
  await page.waitForTimeout(1200);
  const restoredSkin = await page.evaluate((k) => localStorage.getItem(k), SKIN_KEY);
  const restoredLayout = await page.evaluate((k) => localStorage.getItem(k), LAYOUT_KEY);
  expect(restoredSkin).toBe('crimson');
  expect(restoredLayout).toBe(LAYOUT);
});
