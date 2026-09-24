import { test, expect } from '@playwright/test';

// The shared wallet end-to-end: a learning event earns credits once, an empty
// wallet cannot buy, a funded wallet can, and an owned accessory equips onto
// the Champion the City reads.
test('learning events fund the market, which buys and equips for real', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/market/', { waitUntil: 'load' });

  // A replayable learning event credits exactly once.
  const earned = await page.evaluate(async () => {
    const { award, readWallet } = await import('/city-common/learning-events.js');
    const first = await award('tutorial-task', 'academy-room-1', { room: 1 });
    const replay = await award('tutorial-task', 'academy-room-1', { room: 1 });
    return { first, replay, wallet: await readWallet() };
  });
  expect(earned.first.claimed).toBe(true);
  expect(earned.first.amount).toBe(10);
  expect(earned.replay.claimed).toBe(false);
  expect(earned.wallet.balance).toBe(10);

  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('#mkt-balance')).toHaveText('10');
  // 10 cannot cover the cheapest 20-credit accessory.
  await page.locator('.mkt-buy').first().click();
  await expect(page.locator('#mkt-note')).toContainText(/Not enough credits/i);

  // A teacher award tops the wallet up (same store the Workshop uses).
  await page.evaluate(async () => {
    const { createProjectStore } = await import('/city-common/project-store.js');
    const store = createProjectStore();
    await store.openActiveProject();
    await store.award({ id: 'seed-award', type: 'award', title: 'Presenter seed', amount: 200 });
  });
  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('#mkt-balance')).toHaveText('210');

  // Buy the 20-credit visor, then equip it.
  const visor = page.locator('.mkt-card', { hasText: 'Holo Visor' });
  await visor.locator('button').click();
  await expect(page.locator('#mkt-balance')).toHaveText('190');
  await expect(visor.locator('button')).toHaveText('Equip');
  await visor.locator('button').click();
  await expect(page.locator('#mkt-note')).toContainText(/Equipped/i);
  const equipped = await page.evaluate(() => JSON.parse(localStorage.getItem('hk_ai_city_accessories_v1') || '{}'));
  expect(equipped.face).toBe('face_visor');

  expect(errors).toEqual([]);
});
