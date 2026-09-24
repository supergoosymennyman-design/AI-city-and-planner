import { test, expect } from '@playwright/test';

// The Market is the first surface that reads the SHARED envelope wallet. This
// checks it boots, shows the catalogue, and refuses a purchase the balance
// cannot cover — i.e. the debit path is real, not a placeholder.
test('the Champion Market lists the launch catalogue against the shared wallet', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/market/', { waitUntil: 'load' });

  await expect(page.locator('#mkt-balance')).toBeVisible();
  await expect(page.locator('#mkt-balance')).toHaveText('0');
  await expect(page.locator('.mkt-card')).toHaveCount(18);
  await expect(page.locator('.mkt-card').first()).toContainText('20');

  // An empty wallet cannot buy: the ledger refuses before any charge.
  await page.locator('.mkt-buy').first().click();
  await expect(page.locator('#mkt-note')).toContainText(/Not enough credits/i);
  await expect(page.locator('#mkt-balance')).toHaveText('0');

  // Bilingual chrome is present.
  await page.locator('#mkt-lang').click();
  await expect(page.locator('#mkt-title')).toHaveText('冠軍市集');
  expect(errors).toEqual([]);
});
