import { expect, test } from '@playwright/test';

/**
 * LIVE-PATH voice off-rail smoke (the exact thing a human tester clicks in dev).
 *
 * Unit tests drive the FAKE ai at the ctx boundary; this drives the REAL host: the dev voice
 * simulator → window.SpeechRecognition (fake) → @edu/toolbox listenOnce → the game's listen loop
 * → rendered feedback. It reproduces "pressing banana does nothing" against the actual running app,
 * so a pass means the fix is live (refresh needed) and a fail means a real live-only bug.
 *
 * No ?realvoice → dev installs the fake recogniser + mounts the sim panel (#edu-voicesim).
 */
const simButton = (page: import('@playwright/test').Page, text: string) =>
  page.locator('#edu-voicesim button').filter({ hasText: text });

/** intro → pick Red → Fill it! → Teach AI! → mic auto-listening (continuous teach). */
async function reachListening(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: "Let's Go!" }).click();
  await page.getByRole('button', { name: 'Red' }).click();
  await page.getByRole('button', { name: 'Fill it!' }).click();
  await page.getByRole('button', { name: 'Teach AI!' }).click();
  // The mic auto-opens and announces it — proves a listen window is actually live before we "speak".
  await expect(page.getByText('🎤 Listening… say the colour!')).toBeVisible();
}

test.describe('voice off-rail (live host + dev sim)', () => {
  test('gibberish "banana" shows a visible "say it again" hint — not dead air', async ({ page }) => {
    await reachListening(page);
    await simButton(page, 'banana').click();
    await expect(page.getByText("I didn't catch that — say it again!")).toBeVisible();
  });

  test('an unsupported colour "green" gets the honest "not one of my colours" reaction', async ({ page }) => {
    await reachListening(page);
    await simButton(page, 'green').click();
    await expect(page.getByText(/not one of my colours/i)).toBeVisible();
  });
});
