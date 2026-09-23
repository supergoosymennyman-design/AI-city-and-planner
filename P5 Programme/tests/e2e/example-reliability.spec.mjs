import { test, expect } from '@playwright/test';

test('example remains usable until its bounded stream fully settles', async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route(/\.(?:glb|jpg|png)(?:\?|$)/, async route => {
    await new Promise(resolve => setTimeout(resolve, 35));
    await route.continue();
  });

  await page.goto('/city-builder/?example=1');
  await page.waitForFunction(() => document.querySelector('#loading.done') && window.__city?.renderer, null, { timeout:90_000 });
  const ready = await page.evaluate(() => {
    const fallbacks = [], facadeColours = new Set();
    window.__scene.traverse(node => {
      if (node.userData?.kind === 'building-fallback') {
        node.geometry?.computeBoundingBox?.();
        fallbacks.push((node.geometry?.boundingBox?.max?.y - node.geometry?.boundingBox?.min?.y || 0) * node.scale.y);
        facadeColours.add(node.material?.color?.getHexString?.());
      }
    });
    return {
      requests:performance.getEntriesByType('resource').length,
      fallbacks,
      facadeColours:facadeColours.size,
      buildings:window.__layout?.buildings?.length,
      bootError:window.__bootError,
    };
  });
  expect(ready.buildings).toBeGreaterThanOrEqual(100);
  expect(ready.buildings).toBeLessThanOrEqual(130);
  expect(ready.requests).toBeLessThan(160);
  expect(ready.fallbacks.length).toBeGreaterThan(0);
  expect(ready.fallbacks.every(height => height >= 8)).toBe(true);
  expect(ready.facadeColours).toBeGreaterThan(2);
  expect(ready.bootError).toBeNull();

  try {
    await page.waitForFunction(() => ['complete', 'failed'].includes(window.__city?.loading?.phase), null, { timeout:240_000 });
  } catch (error) {
    console.log('stream diagnostics', await page.evaluate(() => ({
      phase: window.__city?.loading?.phase,
      queue: window.__city?.loading?.queue?.(),
      buildings: window.__city?.loading?.assets?.buildings,
      resources: performance.getEntriesByType('resource').length,
    })));
    throw error;
  }
  const final = await page.evaluate(() => ({
    phase:window.__city.loading.phase,
    queue:window.__city.loading.queue(),
    requests:performance.getEntriesByType('resource').length,
    triangles:window.__city.renderer.info.render.triangles,
    textures:window.__city.renderer.info.memory.textures,
    geometries:window.__city.renderer.info.memory.geometries,
    crash:!!document.querySelector('#crash-guard'),
    context:!!document.querySelector('[data-context-recovery]'),
    bootError:window.__bootError,
    streamingVisible:!document.querySelector('#streaming-status')?.hidden,
    buildingAssets:window.__city.loading.assets.buildings,
    colouredVariantRequests:performance.getEntriesByType('resource').filter(entry => /passiona-(?:jade|harbour|lantern|sunstack|bamboo|beacon|skygarden)/.test(entry.name)).length,
    parkBenchCount:window.__scene.getObjectByName('Example park benches')?.count || 0,
    parkTreeCount:window.__city.exampleParkTrees || 0,
    fallbackTypes:[...new Set((() => { const types=[]; window.__scene.traverse(node => { if (node.userData?.kind === 'building-fallback') types.push(node.name.replace('building-fallback-', '')); }); return types; })())],
  }));
  expect(final.phase).toBe('complete');
  expect(final.queue.running).toBe(0);
  expect(final.queue.pending).toBe(0);
  if (testInfo.project.name === 'webkit-reliability') expect(final.requests).toBeLessThan(200);
  expect(final.triangles).toBeLessThan(6_000_000);
  expect(final.textures).toBeLessThan(120);
  expect(final.geometries).toBeLessThan(400);
  expect(final.crash).toBe(false);
  expect(final.context).toBe(false);
  expect(final.bootError).toBeNull();
  expect(final.streamingVisible).toBe(false);
  expect(Object.values(final.buildingAssets).filter(asset => asset.state === 'loaded').length).toBeGreaterThan(7);
  expect(final.fallbackTypes.filter(type => final.buildingAssets[type]?.state === 'loaded')).toEqual([]);
  expect(final.colouredVariantRequests).toBe(0);
  expect(final.parkBenchCount).toBe(18);
  expect(final.parkTreeCount).toBeGreaterThanOrEqual(22);
  expect(errors, `${testInfo.project.name} page errors:\n${errors.join('\n')}`).toEqual([]);
});
