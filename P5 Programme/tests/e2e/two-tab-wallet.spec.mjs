// two-tab-wallet.spec.mjs — two PAGES in ONE browser context share the same
// IndexedDB, so this proves empirically what project-store.js argues from its
// code: the store reads and writes inside ONE `readwrite` transaction (get and
// put on the SAME tx), so two tabs cannot lose an award or spend one wallet twice.
//
// Run from the repo root (source mode):
//   E2E_PORT=8397 npx playwright test --config "P5 Programme/tests/e2e/playwright.config.mjs" \
//     --project=chromium two-tab-wallet.spec.mjs
import { test, expect } from '@playwright/test';

const openStore = `
  const { createProjectStore } = await import('/city-common/project-store.js');
  const store = createProjectStore();
  await store.openActiveProject();
`;

async function walletBalance(page) {
  return page.evaluate(async () => {
    const { createProjectStore } = await import('/city-common/project-store.js');
    const store = createProjectStore();
    await store.openActiveProject();
    const economy = await store.readEconomy();
    return { balance: economy.balance, owned: economy.owned, claimed: economy.claimed };
  });
}

test('two tabs cannot lose an award or double-spend the shared wallet', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const a = await context.newPage();
  const b = await context.newPage();
  const errors = [];
  for (const page of [a, b]) page.on('pageerror', (error) => errors.push(error.message));

  // Both tabs must be on one origin so their IndexedDB is the same database.
  await Promise.all([a.goto('/market/', { waitUntil: 'load' }), b.goto('/market/', { waitUntil: 'load' })]);
  // Open the active project in both tabs first, so each has its own live IDB connection.
  for (const page of [a, b]) await page.evaluate(`(async () => { ${openStore} })()`);

  // ── 1) Concurrent DISTINCT awards: neither update is lost ─────────────────
  const award = (page, scopeId, evidence) => page.evaluate(async ({ scopeId, evidence }) => {
    const { createProjectStore } = await import('/city-common/project-store.js');
    const store = createProjectStore();
    await store.openActiveProject();
    return store.recordLearningEvent({ type: 'held-out-eval', scopeId, evidence });
  }, { scopeId, evidence });

  const [image, driver] = await Promise.all([
    award(a, 'image-sorter', { challengeId: 'image-sorter', batch: 'normal', seed: 1 }),
    award(b, 'driver', { challengeId: 'driver', trackId: 'full' }),
  ]);
  expect(image.ok && image.claimed).toBe(true);
  expect(driver.ok && driver.claimed).toBe(true);
  // 30 + 30: both awards survived one another's read-modify-write.
  const afterAwards = await walletBalance(a);
  expect(afterAwards.balance).toBe(60);

  // Every learning event replays harmlessly through both tabs, still 60.
  const replays = await Promise.all([
    award(a, 'image-sorter', { challengeId: 'image-sorter', batch: 'normal', seed: 1 }),
    award(b, 'driver', { challengeId: 'driver', trackId: 'full' }),
  ]);
  expect(replays.every((r) => r.ok && r.claimed === false)).toBe(true);
  expect((await walletBalance(a)).balance).toBe(60);

  // ── 2) Concurrent purchases cannot overspend the ONE wallet ───────────────
  // Top up to 100, then two tabs each try to buy a different 60-credit item.
  await a.evaluate(async () => {
    const { createProjectStore } = await import('/city-common/project-store.js');
    const store = createProjectStore();
    await store.openActiveProject();
    await store.award({ id: 'two-tab-seed', type: 'award', title: 'Presenter seed', amount: 40 });
  });
  expect((await walletBalance(a)).balance).toBe(100);

  const catalogue = { items: { 'item-a': { id: 'item-a', name: 'A', price: 60 }, 'item-b': { id: 'item-b', name: 'B', price: 60 } } };
  const buy = (page, itemId, transactionId) => page.evaluate(async ({ itemId, transactionId, catalogue }) => {
    const { createProjectStore } = await import('/city-common/project-store.js');
    const store = createProjectStore();
    await store.openActiveProject();
    return store.purchase(itemId, transactionId, catalogue);
  }, { itemId, transactionId, catalogue });

  const [boughtA, boughtB] = await Promise.all([buy(a, 'item-a', 'tx-a'), buy(b, 'item-b', 'tx-b')]);
  // Exactly one could be afforded: 100 < 60 + 60.
  expect([boughtA, boughtB].filter((r) => r.purchased).length).toBe(1);
  const afterBuys = await walletBalance(a);
  expect(afterBuys.balance).toBe(40);
  expect(afterBuys.owned.length).toBe(1);

  // ── 3) The SAME item bought from both tabs concurrently is charged once ───
  await a.evaluate(async () => {
    const { createProjectStore } = await import('/city-common/project-store.js');
    const store = createProjectStore();
    await store.openActiveProject();
    await store.award({ id: 'two-tab-seed-2', type: 'award', title: 'Presenter seed', amount: 60 });
  });
  expect((await walletBalance(a)).balance).toBe(100);

  const same = { items: { 'item-c': { id: 'item-c', name: 'C', price: 40 } } };
  const buyC = (page, transactionId) => page.evaluate(async ({ transactionId, same }) => {
    const { createProjectStore } = await import('/city-common/project-store.js');
    const store = createProjectStore();
    await store.openActiveProject();
    return store.purchase('item-c', transactionId, same);
  }, { transactionId, same });
  const [firstC, secondC] = await Promise.all([buyC(a, 'tx-c-1'), buyC(b, 'tx-c-2')]);
  expect([firstC, secondC].filter((r) => r.purchased).length).toBe(1);
  const afterC = await walletBalance(a);
  expect(afterC.balance).toBe(60); // charged once, not 20
  expect(afterC.owned.filter((id) => id === 'item-c').length).toBe(1);

  expect(errors).toEqual([]);
  await context.close();
});
