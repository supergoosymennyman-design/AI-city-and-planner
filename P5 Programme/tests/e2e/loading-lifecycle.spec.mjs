import { test, expect } from '@playwright/test';

async function boot(page, init) {
  if (init) await page.addInitScript(init);
  await page.goto('/city-builder/');
  await page.waitForTimeout(2200);
  await page.locator('#entry-local').click();
  await page.waitForFunction(() => window.__city?.loading && document.querySelector('#loading.done'), null, { timeout: 60000 });
}

test('retries own one canvas, label layer, input listener set and RAF generation', async ({ page }) => {
  await page.route('**/assets/models/mission/finance-tower.glb', async route => {
    await new Promise(resolve => setTimeout(resolve, 15000));
    await route.continue();
  });
  await boot(page, () => {
    window.__CITY_CONTEXT_RECOVERY_MS__ = 30;
    const add = EventTarget.prototype.addEventListener;
    const remove = EventTarget.prototype.removeEventListener;
    const counts = new Map();
    EventTarget.prototype.addEventListener = function(type, fn, opts) {
      if (this === window) counts.set(type, (counts.get(type) || 0) + 1);
      return add.call(this, type, fn, opts);
    };
    EventTarget.prototype.removeEventListener = function(type, fn, opts) {
      if (this === window) counts.set(type, Math.max(0, (counts.get(type) || 0) - 1));
      return remove.call(this, type, fn, opts);
    };
    window.__windowListenerCounts = counts;
  });

  const before = await page.evaluate(() => ({
    generation: __city.loading.generation,
    canvases: document.querySelectorAll('#stage canvas').length,
    labelLayers: [...document.querySelectorAll('#stage > div')].filter(el => el.style.pointerEvents === 'none').length,
    pointermove: __windowListenerCounts.get('pointermove') || 0,
    keydown: __windowListenerCounts.get('keydown') || 0,
  }));

  // A synthetic non-restoring loss exercises the owned recovery UI without
  // relying on SwiftShader's automatic restoration policy.
  await page.evaluate(() => __city.renderer.domElement.dispatchEvent(new Event('webglcontextlost', { cancelable: true })));
  await expect(page.locator('[data-context-recovery]')).toBeVisible();
  await expect(page.locator('[data-context-recovery] [data-retry]')).toBeVisible();
  await page.locator('[data-context-recovery] [data-retry]').click();
  await page.waitForFunction((old) => window.__city?.loading?.generation > old && document.querySelector('#loading.done'), before.generation, { timeout: 60000 });
  await page.waitForTimeout(300);

  const after = await page.evaluate(() => ({
    generation: __city.loading.generation,
    canvases: document.querySelectorAll('#stage canvas').length,
    labelLayers: [...document.querySelectorAll('#stage > div')].filter(el => el.style.pointerEvents === 'none').length,
    pointermove: __windowListenerCounts.get('pointermove') || 0,
    keydown: __windowListenerCounts.get('keydown') || 0,
    recovery: document.querySelectorAll('[data-context-recovery]').length,
    queue: __city.loading.queue(),
    resources: {...__city.renderer.info.memory},
  }));
  expect(after.generation).toBeGreaterThan(before.generation);
  expect(after.canvases).toBe(1);
  expect(after.labelLayers).toBe(1);
  expect(after.pointermove).toBe(before.pointermove);
  expect(after.keydown).toBe(before.keydown);
  expect(after.recovery).toBe(0);
  expect(after.queue.running).toBeLessThanOrEqual(after.queue.concurrency);

  await page.evaluate(() => __city.renderer.domElement.dispatchEvent(new Event('webglcontextlost', { cancelable: true })));
  await page.locator('[data-context-recovery] [data-retry]').click();
  await page.waitForFunction((old) => window.__city?.loading?.generation > old && document.querySelector('#loading.done'), after.generation, { timeout: 60000 });
  const final = await page.evaluate(() => ({
    canvases:document.querySelectorAll('#stage canvas').length,
    labelLayers:[...document.querySelectorAll('#stage > div')].filter(el=>el.style.pointerEvents==='none').length,
    pointermove:__windowListenerCounts.get('pointermove')||0,
    keydown:__windowListenerCounts.get('keydown')||0,
    resources:{...__city.renderer.info.memory},
  }));
  expect(final.canvases).toBe(1);
  expect(final.labelLayers).toBe(1);
  expect(final.pointermove).toBe(before.pointermove);
  expect(final.keydown).toBe(before.keydown);
  expect(final.resources.geometries).toBeLessThanOrEqual(after.resources.geometries + 8);
  expect(final.resources.textures).toBeLessThanOrEqual(after.resources.textures + 4);
});

test('context loss pauses input, restore resumes, and missing active GLB keeps fallback usable', async ({ page }) => {
  await page.route('**/assets/models/school.glb', route => route.fulfill({ status: 404, body: 'missing' }));
  await boot(page, () => localStorage.setItem('p5_city_planner_layout_v1', JSON.stringify({
    version: 2, scaleMeters: 2000, parks: [],
    roads: [{ points: [[100, 1000], [1900, 1000]], width: 14, class: 'primary' }],
    buildings: [{ type: 'school', pos: [1000, 900], footprint: [38, 30], height: 24 }],
  })));
  const canvas = page.locator('#stage canvas');
  const before = await page.evaluate(() => [window.__city.champion.state.pos.x, window.__city.champion.state.pos.z]);
  await canvas.dispatchEvent('webglcontextlost');
  await page.keyboard.down('w');
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => [window.__city.champion.state.pos.x, window.__city.champion.state.pos.z])).toEqual(before);
  await canvas.dispatchEvent('webglcontextrestored');
  await expect(page.locator('[data-context-recovery]')).toHaveCount(0);
  expect(await page.evaluate(() => document.querySelector('#loading.done') !== null && !!window.__city.champion)).toBe(true);
  await page.keyboard.up('w');
});

test('small, sample and large cold layouts reach a procedural-ready city before deferred assets', async ({ browser }) => {
  const small = { version:2, scaleMeters:2000, parks:[], roads:[{points:[[100,1000],[1900,1000]],width:14,class:'primary'}], buildings:[{type:'school',pos:[1000,900],footprint:[38,30],height:24}] };
  const types = ['housing','school','hospital','shop','office','library','finance_tower','traffic_lab','water','power','recycling','atc'];
  const large = { version:2, scaleMeters:2000, parks:[{cx:1700,cz:1700,radius:70}], roads:[{points:[[80,1000],[1920,1000]],width:14,class:'primary'}], buildings:Array.from({length:60},(_,i)=>({type:types[i%types.length],pos:[140+(i%10)*175,140+Math.floor(i/10)*145],footprint:[28,24],height:30})) };
  const results = [];
  for (const [name, layout] of [['small',small],['sample',null],['large',large]]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    if (layout) await page.addInitScript((value) => localStorage.setItem('p5_city_planner_layout_v1',JSON.stringify(value)), layout);
    await boot(page);
    const stats = await page.evaluate(() => {
      const resources = performance.getEntriesByType('resource');
      return { requests:resources.length, bytes:resources.reduce((n,r)=>n+(r.encodedBodySize||0),0), queue:__city.loading.queue(), buildings:__layout.buildings.length };
    });
    results.push({name,...stats});
    expect(stats.requests, `${name} should not start the old 295-request eager preload before readiness`).toBeLessThan(160);
    expect(stats.queue.running).toBeLessThanOrEqual(stats.queue.concurrency);
    await context.close();
  }
  console.log('cold-source readiness proxies', JSON.stringify(results));
});

test('slow optional GLBs do not block either an example or imported city', async ({ browser }) => {
  const imported = { version:2, scaleMeters:2000, parks:[], roads:[{points:[[100,1000],[1900,1000]],width:14,class:'primary'}], buildings:[{type:'school',pos:[700,900],footprint:[38,30],height:24}] };
  for (const layout of [null, imported]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.route(/assets\/models\/(?:nature|street|housing-variants)\//, async route => {
      await new Promise(resolve => setTimeout(resolve, 15000));
      await route.continue();
    });
    if (layout) await page.addInitScript(value => localStorage.setItem('p5_city_planner_layout_v1', JSON.stringify(value)), layout);
    await boot(page);
    await expect(page.locator('#entry-overlay')).toHaveClass(/hidden/);
    expect(await page.evaluate(() => !!window.__city?.renderer && !window.__bootError)).toBe(true);
    await context.close();
  }
});

test('retry keeps the originally imported layout after an atomic boot failure', async ({ page }) => {
  const imported = { version:2, scaleMeters:2000, parks:[], roads:[{points:[[100,600],[1900,600]],width:14,class:'primary'}], buildings:[{type:'hospital',pos:[333,777],footprint:[42,32],height:28}] };
  await page.addInitScript(value => {
    localStorage.setItem('p5_city_planner_layout_v1', JSON.stringify(value));
    window.__CITY_FORCE_BOOT_FAILURE__ = true;
  }, imported);
  await page.goto('/city-builder/');
  await page.waitForTimeout(300);
  await page.locator('#entry-local').click();
  await expect(page.locator('#entry-error')).toBeVisible();
  await page.evaluate(() => {
    window.__CITY_FORCE_BOOT_FAILURE__ = false;
    localStorage.setItem('p5_city_planner_layout_v1', JSON.stringify({version:2,scaleMeters:2000,parks:[],roads:[],buildings:[]}));
  });
  await page.locator('#entry-local').click();
  await page.waitForFunction(() => document.querySelector('#loading.done') && !!window.__city?.renderer, null, { timeout: 60000 });
  // Densification changes display coordinates, but only the retry snapshot
  // contains this hospital after localStorage was deliberately replaced.
  expect(await page.evaluate(() => window.__layout.buildings.some(b => b.type === 'hospital'))).toBe(true);
});
