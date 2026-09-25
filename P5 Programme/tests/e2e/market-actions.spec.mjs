import { test, expect } from '@playwright/test';

// Review finding: "several purchasable items have no working action." These
// specs prove each item TYPE reaches a real action: a finish equips and
// persists, a host upgrade equips and persists, a decoration buys and then
// actually places in the City (ownership-gated, parameter cleared).
const FINISH_KEY = 'hk_ai_city_champion_finish_v1';
const HOST_KEY = 'hk_ai_city_host_upgrade_v1';

async function seed(page, amount = 500) {
  await page.evaluate(async (value) => {
    const { createProjectStore } = await import('/city-common/project-store.js');
    const store = createProjectStore();
    await store.openActiveProject();
    await store.award({ id: `seed-${Date.now()}`, type: 'award', title: 'Presenter seed', amount: value });
  }, amount);
}

async function chooseExampleCity(page) {
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('button')].find((b) => /example city|empty sample/i.test(b.textContent || ''));
    if (el) el.click();
  });
}

test('every purchasable item type has a working action in the Market', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/market/', { waitUntil: 'load' });
  await seed(page);
  await page.reload({ waitUntil: 'load' });

  // Finish: Buy → Equip → persisted palette.
  const finish = page.locator('.mkt-card', { hasText: 'Sunset Finish' });
  await finish.locator('button').click();
  await expect(finish.locator('button')).toHaveText('Equip');
  await finish.locator('button').click();
  await expect(page.locator('#mkt-note')).toContainText(/Finish equipped/i);
  expect(await page.evaluate((k) => localStorage.getItem(k), FINISH_KEY)).toBe('sunset');

  // Host upgrade: Buy → Equip → persisted appearance.
  const host = page.locator('.mkt-card', { hasText: 'Flagship Skill Host' });
  await host.locator('button').click();
  await expect(host.locator('button')).toHaveText('Equip');
  await host.locator('button').click();
  await expect(page.locator('#mkt-note')).toContainText(/Skill-host upgrade equipped/i);
  expect(await page.evaluate((k) => localStorage.getItem(k), HOST_KEY)).toBe('flagship');

  // Decoration: Buy → the card offers a real Place action.
  const bench = page.locator('.mkt-card', { hasText: 'Park Bench' });
  await bench.locator('button').click();
  await expect(bench.locator('button')).toHaveText('Place in City');

  expect(errors).toEqual([]);
});

test('a purchased decoration really places in the City and clears the request', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/market/', { waitUntil: 'load' });
  await seed(page);
  const bought = await page.evaluate(async () => {
    const { createProjectStore } = await import('/city-common/project-store.js');
    const { MARKET_CATALOGUE } = await import('/city-common/market-catalogue.js');
    const store = createProjectStore();
    await store.openActiveProject();
    return store.purchase('dec-bench', `tx-${Date.now()}`, MARKET_CATALOGUE);
  });
  expect(bought.purchased).toBe(true);

  await page.goto('/city-builder/?place=dec-bench', { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  await chooseExampleCity(page);
  await page.waitForFunction(() => !!window.__propLibrary, null, { timeout: 90000 });
  await page.waitForFunction(() => window.__marketHandoff !== undefined, null, { timeout: 60000 });
  const handoff = await page.evaluate(() => window.__marketHandoff);
  expect(handoff, JSON.stringify(handoff)).toMatchObject({ ok: true, kind: 'decoration' });
  const records = await page.evaluate(() => window.__propLibrary.getRecords());
  expect(records.some((r) => r.id === 'prop_bench')).toBe(true);
  expect(new URL(page.url()).searchParams.get('place')).toBe(null);
  expect(errors).toEqual([]);
});
