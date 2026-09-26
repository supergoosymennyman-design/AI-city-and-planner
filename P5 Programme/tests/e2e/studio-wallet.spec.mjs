// studio-wallet.spec.mjs — the Studio model shop reads and SPENDS the SHARED
// envelope wallet, the same one the Market reads.
//
// This needs the BUILT Studio bundle: in source mode the e2e server routes
// `/studio/` to the legacy Fit Studio, while the deploy bundle ships the Vite
// Studio at `/studio/`. Run it with E2E_DOCROOT="P5 Programme/deploy/city-sim".
//
// Proof: seed the shared wallet through the store, reload the Studio and see the
// balance, buy an affordable model, watch the Studio balance fall, confirm the
// store holds the debit + ownership, and confirm the MARKET shows the same spent
// wallet (one wallet, two apps).
import { test, expect } from '@playwright/test';

test.skip(!process.env.E2E_DOCROOT, 'The Vite Studio ships only in the built bundle — set E2E_DOCROOT.');

async function bootStudio(page) {
  await page.goto('/studio/', { waitUntil: 'load' });
  // The shop is ready once a catalogue card exists (the readout is painted with it).
  await expect(page.locator('.shop-card[data-model-id="rocket-cone"]')).toBeVisible({ timeout: 90000 });
}

test('a Studio purchase debits the shared wallet the Market reads', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await bootStudio(page);

  // Seed the shared envelope wallet through the SAME store the Market uses.
  await page.evaluate(async () => {
    const { createProjectStore } = await import('/city-common/project-store.js');
    const store = createProjectStore();
    await store.openActiveProject();
    await store.award({ id: 'studio-seed', type: 'award', title: 'Presenter seed', amount: 200 });
  });

  // A fresh Studio open must read that shared balance (not its own session economy).
  await page.reload({ waitUntil: 'load' });
  await bootStudio(page);
  await expect(page.locator('#shop-coins')).toHaveText('200', { timeout: 30000 });

  // Buy the affordable 40-credit model from the Studio's own catalogue.
  const card = page.locator('.shop-card[data-model-id="rocket-cone"]');
  await expect(card.locator('.shop-action')).toHaveText(/Unlock · 40 coins/);
  await card.locator('.shop-action').click();

  // The Studio balance falls, and the store holds the debit + ownership.
  await expect(page.locator('#shop-coins')).toHaveText('160', { timeout: 30000 });
  const wallet = await page.evaluate(async () => {
    const { createProjectStore } = await import('/city-common/project-store.js');
    const store = createProjectStore();
    await store.openActiveProject();
    const economy = await store.readEconomy();
    return { balance: economy.balance, owned: economy.owned };
  });
  expect(wallet.balance).toBe(160);
  expect(wallet.owned).toContain('rocket-cone');

  // Replaying the same purchase can never charge twice (idempotent by ownership).
  const replay = await page.evaluate(async () => {
    const { createProjectStore } = await import('/city-common/project-store.js');
    const { studioCatalogue } = await import('/city-common/studio-wallet.js');
    const store = createProjectStore();
    await store.openActiveProject();
    const catalogue = studioCatalogue({ models: [{ id: 'rocket-cone', name: 'Rocket Cone', unlock: { type: 'coins', coins: 40 } }] });
    const again = await store.purchase('rocket-cone', 'studio-replay', catalogue);
    const economy = await store.readEconomy();
    return { purchased: again.purchased, balance: economy.balance };
  });
  expect(replay.purchased).toBe(false);
  expect(replay.balance).toBe(160);

  // The MARKET reads the SAME wallet — 160 left, the Studio model still owned.
  await page.goto('/market/', { waitUntil: 'load' });
  await expect(page.locator('#mkt-balance')).toHaveText('160', { timeout: 30000 });

  expect(errors).toEqual([]);
});

test('the Workshop credits dialog shows the shared envelope wallet', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // Seed the shared wallet, then open the CANONICAL Workshop (the bare route is
  // the embed stub; a query string reaches the real app, whose publish module
  // installs the `window.PassionaLearning` shim the dialog auto-detects).
  await page.goto('/market/', { waitUntil: 'load' });
  await page.evaluate(async () => {
    const { createProjectStore } = await import('/city-common/project-store.js');
    const store = createProjectStore();
    await store.openActiveProject();
    await store.award({ id: 'workshop-seed', type: 'award', title: 'Presenter seed', amount: 160 });
  });

  await page.goto('/workshop/?publishTarget=city', { waitUntil: 'load' });
  const credits = page.locator('#championCredits');
  await expect(credits).toBeAttached({ timeout: 90000 });
  await page.locator('#fileBtn').click();
  await credits.click();
  const dialog = page.locator('dialog.champion-credits');
  await expect(dialog).toBeVisible({ timeout: 30000 });
  // The dialog paints from the shim's async wallet(), so it shows the envelope.
  await expect(dialog).toContainText(/· 160 credits/, { timeout: 30000 });

  expect(errors).toEqual([]);
});
