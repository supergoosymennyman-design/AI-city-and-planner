// guards.spec.mjs — the tablet-robustness safety nets must actually be wired:
//   1. crash-guard  (window.onerror/unhandledrejection → friendly restart screen)
//   2. context-guard (WebGL context loss → friendly pause overlay)
//   3. corrupt-save fallback (bad localStorage JSON → sample city + explanation)
import { test, expect } from '@playwright/test';

const STORAGE_KEY = 'p5_city_planner_layout_v1';

async function bootCity(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 200)}`); });

  await page.goto('/city-builder/', { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    const el = document.getElementById('entry-local');
    if (el) el.click();
  });
  await expect(page.locator('canvas')).toBeVisible({ timeout: 60000 });
  await page.waitForFunction(() => document.getElementById('loading')?.classList.contains('done') === true, null, { timeout: 60000 });
  return errors;
}

test('crash-guard and context-guard are wired and load', async ({ page }) => {
  const errors = await bootCity(page);
  const guards = await page.evaluate(() => ({
    crashGuardScript: !!document.querySelector('script[src="/crash-guard.js"]'),
    crashGuard: window.__crashGuard === true,
    contextGuard: window.__contextGuard === true,
  }));
  expect(guards.crashGuardScript, 'crash-guard.js script tag missing from index.html').toBe(true);
  expect(guards.crashGuard, 'window.__crashGuard not set — script did not run').toBe(true);
  expect(guards.contextGuard, 'attachContextLossGuard not attached').toBe(true);
  expect(errors, `unexpected errors:\n${errors.join('\n') || '(none)'}`).toEqual([]);
});

test('crash-guard shows the friendly restart screen on a real uncaught error', async ({ page }) => {
  await bootCity(page);
  await page.bringToFront();
  // Inject a genuine window-level error (inside setTimeout so it bubbles to window).
  await page.evaluate(() => {
    setTimeout(() => { throw new Error('__crash_guard_test__'); }, 50);
  });
  // Wait for the handler itself (set synchronously on the error event), then the
  // overlay. Generous timeouts: under parallel workers the WebGL render loop can
  // starve the main thread for seconds.
  await page.waitForFunction(() => typeof window.__crashGuardLastCode === 'function' && !!window.__crashGuardLastCode(), null, { timeout: 30000 });
  await expect(page.locator('#crash-guard')).toBeVisible({ timeout: 30000 });
  const text = await page.locator('#crash-guard').innerText();
  expect(text).toContain('Restart City');
  // The error code hook should be set (non-empty).
  const code = await page.evaluate(() => window.__crashGuardLastCode());
  expect(code).toBeTruthy();
});

test('corrupt saved city falls back to the sample with an explanation', async ({ page }) => {
  // Plant garbage in the planner-layout slot BEFORE the app reads it.
  await page.addInitScript((key) => { localStorage.setItem(key, '{definitely not valid json'); }, STORAGE_KEY);
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto('/city-builder/', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  // Garbage is truthy → the primary button is present; click it (it may say
  // "Continue my city" or "Start my saved city" — either resumes the saved slot).
  await page.evaluate(() => {
    const el = document.getElementById('entry-local');
    if (el) el.click();
  });
  // The entry card explains the fallback… (the card contains several <p>s incl.
  // a hidden #entry-plan echo — assert on the card container, not a bare <p>.)
  await expect(page.locator('.entry-card')).toContainText('could not be read', { timeout: 10000 });
  // …and the sample city still boots (canvas appears).
  await expect(page.locator('canvas')).toBeVisible({ timeout: 60000 });
  expect(await page.evaluate(() => ({
    style: localStorage.getItem('p5_city_look_v1'),
    sky: localStorage.getItem('p5_city_day_sky_v1'),
    ground: localStorage.getItem('p5_city_ground_texture_v1'),
    time: localStorage.getItem('p5_city_time_v1'),
  }))).toEqual({ style: 'natural', sky: 'natural-blue', ground: 'asphalt', time: 'sunset' });
  expect(errors, `unexpected errors:\n${errors.join('\n') || '(none)'}`).toEqual([]);
});
