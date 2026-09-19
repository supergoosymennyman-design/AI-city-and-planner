// tablet-boot-reliability.spec.mjs — the reliability guard for tablet load.
//
// Goal: a cold tablet (touch, 768×1024, DPR2), CPU-throttled and on a latent
// network, must ALWAYS reach a usable city — and the deferred scenery (citizens,
// trees) must stream in AFTERWARDS without ever blocking that first usable frame.
//
// This is a reliability guard, not a tight time SLA: the assertions are
// "reaches ready" + "does not eagerly preload" + "deferred work is deferred",
// deliberately not "under N seconds".
import { test, expect } from '@playwright/test';

const TABLET = { viewport: { width: 768, height: 1024 }, hasTouch: true, deviceScaleFactor: 2 };
const CPU_THROTTLE = 4;
const GLB_DELAY_MS = 60;
// Same cold-load request budget as loading-lifecycle.spec.mjs — catches a
// regression back to the old ~295-request eager preload before readiness.
const REQUEST_BUDGET = 160;
const READY_TIMEOUT = 90000;

const TYPES = ['housing', 'school', 'hospital', 'shop', 'office', 'library'];
const small = { version: 2, scaleMeters: 2000, parks: [], roads: [{ points: [[100, 1000], [1900, 1000]], width: 14, class: 'primary' }], buildings: [{ type: 'school', pos: [1000, 900], footprint: [38, 30], height: 24 }] };
const large = { version: 2, scaleMeters: 2000, parks: [{ cx: 1700, cz: 1700, radius: 70 }], roads: [{ points: [[80, 1000], [1920, 1000]], width: 14, class: 'primary' }], buildings: Array.from({ length: 60 }, (_, i) => ({ type: TYPES[i % TYPES.length], pos: [140 + (i % 10) * 175, 140 + Math.floor(i / 10) * 145], footprint: [28, 24], height: 30 })) };

/** Boot one cold tablet context. Returns the page plus the readiness snapshot. */
async function bootTablet(browser, layout) {
  const context = await browser.newContext({ ...TABLET });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // Emulate a slow tablet CPU (SwiftShader already proxies a weak GPU).
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });

  // Latent network for every model fetch. Deferred assets get this too, which is
  // exactly what must NOT block procedural readiness.
  await page.route(/\.glb(\?|$)/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, GLB_DELAY_MS));
    await route.continue();
  });

  if (layout) await page.addInitScript((value) => localStorage.setItem('p5_city_planner_layout_v1', JSON.stringify(value)), layout);

  await page.goto('/city-builder/', { waitUntil: 'load' });
  await page.waitForTimeout(2000);
  // Small/large show "Start my saved city"; a cold no-layout context shows the
  // example/sample entry instead.
  const local = page.locator('#entry-local');
  if (await local.isVisible().catch(() => false)) await local.click();
  else await page.evaluate(() => { const el = [...document.querySelectorAll('button')].find((b) => /example city|empty sample|saved city/i.test(b.textContent || '')); el?.click(); });

  await page.waitForFunction(() => document.getElementById('loading')?.classList.contains('done') === true, null, { timeout: READY_TIMEOUT });

  const atReady = await page.evaluate(() => {
    const q = window.__city?.loading?.queue?.() || {};
    return {
      requests: performance.getEntriesByType('resource').length,
      bootError: window.__bootError ?? null,
      hasScene: !!window.__scene || !!window.__city?.scene,
      hasCity: !!window.__city?.renderer,
      canvas: !!document.querySelector('#stage canvas'),
      // `#loading.done` is PROCEDURAL-READY, not fully loaded: the deferred
      // crowd models must not be loaded yet.
      citizenModels: window.__city?.citizens?.getStats?.().models ?? 0,
      queue: q,
    };
  });

  return { context, page, errors, atReady };
}

/** Deferred scenery must arrive after readiness — proving it was not required. */
async function waitForDeferredScenery(page, { fillers = false } = {}) {
  await page.waitForFunction(() => window.__city?.citizens?.getStats?.().models > 0, null, { timeout: READY_TIMEOUT });
  // Nature filler only exists where the layout has parks. (The detailed tree
  // packs are a separate, documented dead pipeline — see design-review.spec.mjs.)
  if (fillers) await page.waitForFunction(() => { let n = 0; window.__scene.traverse((o) => { if (o.userData.isNatureFiller) n++; }); return n > 0; }, null, { timeout: READY_TIMEOUT });
}

function expectReliable(atReady) {
  expect(atReady.bootError, 'boot must not record __bootError').toBeNull();
  expect(atReady.hasCity, 'renderer/city must exist at ready').toBe(true);
  expect(atReady.hasScene, 'scene must exist at ready').toBe(true);
  expect(atReady.canvas, 'a canvas must be visible at ready').toBe(true);
  expect(atReady.requests, `must not eagerly preload before readiness`).toBeLessThan(REQUEST_BUDGET);
  expect(atReady.queue.running ?? 0).toBeLessThanOrEqual(atReady.queue.concurrency ?? 1);
}

test.describe('tablet boot reliability', () => {
  test('cold small / sample / large tablet boots reach a usable city, then deferred scenery arrives', async ({ browser }) => {
    test.setTimeout(360000);
    for (const [name, layout, fillers] of [['small', small, false], ['sample', null, true], ['large', large, true]]) {
      const { context, page, errors, atReady } = await bootTablet(browser, layout);
      expectReliable(atReady);
      expect(atReady.citizenModels, `${name}: crowd models must not load before procedural-ready`).toBe(0);
      await waitForDeferredScenery(page, { fillers });
      expect(errors, `${name} pageerrors:\n${errors.join('\n') || '(none)'}`).toEqual([]);
      await context.close();
    }
  });

  test('three throttled tablet cities boot concurrently without stalls or boot errors', async ({ browser }) => {
    test.setTimeout(360000);
    const boots = await Promise.all([
      bootTablet(browser, small),
      bootTablet(browser, null),
      bootTablet(browser, large),
    ]);
    for (const [i, b] of boots.entries()) {
      expectReliable(b.atReady);
      expect(b.atReady.citizenModels, `parallel boot ${i}: crowd models must not load before procedural-ready`).toBe(0);
    }
    // All three must still resolve their deferred scenery while competing.
    await Promise.all(boots.map((b, i) => waitForDeferredScenery(b.page, { fillers: i !== 0 })));
    for (const [i, b] of boots.entries()) {
      expect(b.errors, `parallel boot ${i} pageerrors:\n${b.errors.join('\n') || '(none)'}`).toEqual([]);
      await b.context.close();
    }
  });

  test('a cold tablet boot keeps its canvas and survives 4× CPU throttled resize', async ({ page }) => {
    test.setTimeout(180000);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });
    await page.goto('/city-builder/');
    await page.waitForTimeout(2000);
    const local = page.locator('#entry-local');
    if (await local.isVisible().catch(() => false)) await local.click();
    else await page.evaluate(() => { const el = [...document.querySelectorAll('button')].find((b) => /example city|empty sample|saved city/i.test(b.textContent || '')); el?.click(); });
    await page.waitForFunction(() => document.getElementById('loading')?.classList.contains('done') === true, null, { timeout: READY_TIMEOUT });
    const before = await page.evaluate(() => document.querySelectorAll('#stage canvas').length);
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForTimeout(500);
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => document.querySelectorAll('#stage canvas').length)).toBe(before);
    expect(await page.evaluate(() => window.__bootError ?? null)).toBeNull();
  });
});
