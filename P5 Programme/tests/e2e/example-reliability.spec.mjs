import { test, expect } from '@playwright/test';

test('example opens with every assigned building model and both learning buildings', async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route(/\.(?:glb|jpg|png)(?:\?|$)/, async route => {
    await new Promise(resolve => setTimeout(resolve, 35));
    await route.continue();
  });

  await page.goto('/city-builder/?example=1');
  await page.waitForFunction(() => document.querySelector('#loading.done') && window.__city?.renderer, null, { timeout:300_000 });
  const ready = await page.evaluate(() => {
    const fallbacks = [];
    window.__scene.traverse(node => {
      if (node.userData?.kind === 'building-fallback') {
        node.geometry?.computeBoundingBox?.();
        fallbacks.push((node.geometry?.boundingBox?.max?.y - node.geometry?.boundingBox?.min?.y || 0) * node.scale.y);
      }
    });
    return {
      requests:performance.getEntriesByType('resource').length,
      fallbacks,
      modeledLots:Object.values(window.__city?.buildingScaleDiagnostics || {}).reduce((sum, records) => sum + records.length, 0),
      buildings:window.__layout?.buildings?.length,
      bootError:window.__bootError,
    };
  });
  expect(ready.buildings).toBeGreaterThanOrEqual(100);
  expect(ready.buildings).toBeLessThanOrEqual(130);
  expect(ready.modeledLots).toBe(119);
  expect(ready.fallbacks).toEqual([]);
  expect(await page.evaluate(() => ({
    recycling: window.__city.loading.assets.buildings.recycling,
    gateways: Object.fromEntries(Object.entries(window.__city.gateways).map(([id, gateway]) => [id, gateway.status])),
    labels: ['workshop', 'studio'].map(id => document.querySelector(`.gateway-label-${id}`)?.textContent),
    recyclingLabel: document.querySelector('.learning-label-recycling')?.textContent,
  }))).toMatchObject({
    recycling: { state: 'loaded', instances: 1 },
    gateways: { workshop: 'loaded', studio: 'loaded' },
    labels: [expect.stringContaining('AI Workshop'), expect.stringContaining('Fit Studio')],
    recyclingLabel: expect.stringContaining('Recycling Lab'),
  });
  await page.waitForFunction(() => ['.learning-label-recycling', '.gateway-label-workshop', '.gateway-label-studio'].every(selector => {
    const el = document.querySelector(selector);
    if (!el || el.style.opacity !== '1') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;
  }), null, { timeout: 15000 });
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
  expect(final.triangles).toBeLessThan(6_000_000);
  expect(final.crash).toBe(false);
  expect(final.context).toBe(false);
  expect(final.bootError).toBeNull();
  expect(final.streamingVisible).toBe(false);
  expect(Object.values(final.buildingAssets).filter(asset => asset.state === 'loaded').length).toBeGreaterThan(7);
  expect(final.fallbackTypes).toEqual([]);
  expect(Object.entries(final.buildingAssets).filter(([id, asset]) => id.startsWith('bld_passiona_') && asset.state === 'loaded').length).toBe(7);
  expect(final.parkBenchCount).toBe(18);
  expect(final.parkTreeCount).toBeGreaterThanOrEqual(22);
  expect(errors, `${testInfo.project.name} page errors:\n${errors.join('\n')}`).toEqual([]);
});
