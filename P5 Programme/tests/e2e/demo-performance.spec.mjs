import { test, expect } from '@playwright/test';

test('demo preserves example models and sky, bounds resolution, and resizes effects together', async ({ page }, testInfo) => {
  test.setTimeout(300000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/city-builder/?example=1&demoPerf=1');
  await page.waitForFunction(() => window.__city?.performance && ['complete', 'failed'].includes(window.__city.loading.phase), null, { timeout: 240000 });
  const inspect = () => page.evaluate(() => {
    const city = window.__city;
    let fallback = 0, shadowSize = null, skyWidth = 0;
    window.__scene.traverse(node => {
      if (node.userData?.kind === 'building-fallback') fallback++;
      if (node.isDirectionalLight && node.castShadow) shadowSize = node.shadow.mapSize.x;
      const sky = node.material?.uniforms?.equirectMap?.value;
      if (sky) skyWidth = sky.image?.width || 0;
    });
    return { ...city.performance, fallback, shadowSize, skyWidth, phase: city.loading.phase, failures: city.loading.failures,
      lots: Object.values(city.buildingScaleDiagnostics).reduce((sum, records) => sum + records.length, 0),
      gateways: Object.values(city.gateways).map(gateway => gateway.status) };
  });
  let state = await inspect();
  expect(state.phase, JSON.stringify(state.failures)).toBe('complete');
  expect(state.demo).toBe(true);
  expect(state.lots).toBe(119);
  expect(state.fallback).toBe(0);
  expect(state.gateways).toEqual(['loaded', 'loaded']);
  expect(state.shadowSize).toBe(1536);
  expect(state.skyWidth).toBeGreaterThanOrEqual(4000);
  expect(state.resolutionScale).toBeGreaterThanOrEqual(0.9);
  expect(state.resolutionScale).toBeLessThanOrEqual(1);
  expect(state.composerPixelRatio).toBe(state.pixelRatio);
  await page.evaluate(() => {
    const park = window.__city.layout.parks[0];
    window.__camOverride = { pos: [park.cx, 120, park.cz + 430], target: [park.cx, 70, park.cz] };
    window.__city.setTimeOfDay('day');
  });
  await page.waitForFunction(() => window.__city.timeOfDay.settled);
  await page.screenshot({ path: testInfo.outputPath('demo-day.png') });
  await page.setViewportSize({ width: 1100, height: 720 });
  await page.waitForTimeout(300);
  state = await inspect();
  expect(state.composerPixelRatio).toBe(state.pixelRatio);
  await page.evaluate(() => window.__city.setTimeOfDay('night'));
  await page.waitForFunction(() => window.__city.timeOfDay.settled);
  await page.screenshot({ path: testInfo.outputPath('demo-night.png') });
  await page.evaluate(() => { delete window.__camOverride; });
  await page.keyboard.down('w');
  await page.waitForTimeout(1000);
  await page.keyboard.up('w');
  await page.locator('#btn-taxi').click();
  await expect.poll(() => page.evaluate(() => window.__taxi.isActive())).toBe(true);
  await page.keyboard.down('w');
  await page.waitForTimeout(1000);
  await page.keyboard.up('w');
  await page.locator('#btn-taxi').click();
  await expect.poll(() => page.evaluate(() => window.__taxi.isActive())).toBe(false);
  await page.locator('#city-more summary').click();
  await page.locator('#more-drive').click();
  await page.locator('.drive-card').first().click();
  await expect.poll(() => page.evaluate(() => window.__drive.active)).toBe(true);
  await page.keyboard.down('w');
  await page.waitForTimeout(1000);
  await page.keyboard.up('w');
  await page.locator('#btn-drive').click();
  await expect.poll(() => page.evaluate(() => window.__drive.active)).toBe(false);

  // Exercise the real renderer guard and ensure frames resume after restoration.
  await page.evaluate(() => { window.__testContext = window.__city.renderer.getContext().getExtension('WEBGL_lose_context'); window.__testContext.loseContext(); });
  await expect(page.locator('[data-context-recovery]')).toBeVisible();
  await page.evaluate(() => window.__testContext.restoreContext());
  await expect(page.locator('[data-context-recovery]')).toHaveCount(0);
  await page.waitForFunction(() => {
    const state = window.__city.performance;
    if (!window.__testPreviousFrame) { window.__testPreviousFrame = state; return false; }
    return state !== window.__testPreviousFrame;
  });
  await testInfo.attach('performance.json', { body: JSON.stringify(await inspect(), null, 2), contentType: 'application/json' });
  expect(errors).toEqual([]);
});
