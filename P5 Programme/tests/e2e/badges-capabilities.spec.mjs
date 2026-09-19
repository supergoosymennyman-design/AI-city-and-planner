// badges-capabilities.spec.mjs — the badge emblem (lowest tier) + capability panel.
import { test, expect } from '@playwright/test';

const LAYOUT = JSON.stringify({
  version: 2, scaleMeters: 2000,
  roads: [{ points: [[200, 1000], [1800, 1000]], width: 14, class: 'primary' }],
  buildings: [{ type: 'city_central', pos: [1000, 1000], footprint: [28, 28], height: 100 }],
});

async function bootCity(page) {
  await page.addInitScript(({ LAYOUT }) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('p5_planner_unlocked', '1');
    localStorage.setItem('p5_city_planner_layout_v1', LAYOUT);
    // A durable, capability-based milestone (see city-common/milestones.js).
    localStorage.setItem('p5_city_milestones_v1', JSON.stringify({
      version: 2,
      earned: [{ id: 'first_connection', date: '2026-09-10T00:00:00.000Z', evidence: { homes: 2 } }],
    }));
  }, { LAYOUT });
  await page.goto('/city-builder/', { waitUntil: 'load' });
  await page.waitForTimeout(2000);
  await page.evaluate(() => { const el = [...document.querySelectorAll('button')].find((b) => /continue my city|saved city|example city|empty sample|開始|繼續|示範/i.test(b.textContent || '')); if (el) el.click(); });
  await expect(page.locator('canvas')).toBeVisible({ timeout: 60000 });
  await page.waitForFunction(() => document.getElementById('loading')?.classList.contains('done') === true, null, { timeout: 60000 });
}

test('badge emblem shows the lowest tier (Builder) and opens the Logbook', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await bootCity(page);
  // The badge emblem lives inside the collapsed "More / history" disclosure.
  await page.locator('#city-more summary').click();
  await expect(page.locator('#badge-emblem')).toBeVisible({ timeout: 15000 });
  const text = await page.locator('#badge-emblem').textContent();
  expect(text).toContain('Builder');
  await page.locator('#badge-emblem').click();
  await expect(page.locator('#logbook-modal')).toBeVisible();
  const body = await page.locator('#logbook-body').textContent();
  expect(body).toContain('Builder');
  expect(body).toContain('Architect'); // the ladder is shown, future tiers locked
  // Durable milestones render here too (recognition, never a gate).
  expect(body).toContain('Milestones you earned');
  expect(body).toContain('First Neighbourhood');
  expect(body).toContain('Not earned yet'); // unearned rows stay visible
  expect(errors, `pageerrors:\n${errors.join('\n') || '(none)'}`).toEqual([]);
});

test('capability panel opens and shows an honest empty state', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await bootCity(page);
  // The capability button lives inside the collapsed "More / history" disclosure.
  await page.locator('#city-more summary').click();
  await expect(page.locator('#cap-btn')).toBeVisible({ timeout: 15000 });
  await page.locator('#cap-btn').click();
  await expect(page.locator('#cap-modal')).toBeVisible();
  const body = await page.locator('#cap-body').textContent();
  expect(body).toContain('No imported machine files yet');
  expect(body).toContain('does not run inference');
  expect(errors, `pageerrors:\n${errors.join('\n') || '(none)'}`).toEqual([]);
});
