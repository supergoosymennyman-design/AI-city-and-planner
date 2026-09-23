import { test, expect } from '@playwright/test';

const layout = {
  version: 2, scaleMeters: 2000, parks: [],
  roads: [{ points: [[300, 900], [1700, 900], [1700, 1200], [300, 1200], [300, 900]], width: 14, class: 'primary' }],
  buildings: [
    { type: 'school', pos: [850, 820], footprint: [38, 30], height: 24 },
    { type: 'library', pos: [1150, 820], footprint: [36, 30], height: 28 },
  ],
};

async function boot(page, init = () => {}) {
  await page.addInitScript(({ value }) => { localStorage.setItem('p5_city_planner_layout_v1', JSON.stringify(value)); }, { value: layout });
  await page.addInitScript(init);
  await page.goto('/city-builder/');
  await page.locator('#entry-local').click();
  await page.waitForFunction(() => window.__city?.loading && document.querySelector('#loading.done'), null, { timeout: 60000 });
}

test('Audis stream independently and no procedural cars appear while delayed', async ({ page }) => {
  let releaseA7, releaseQ8;
  const a7 = new Promise(resolve => { releaseA7 = resolve; });
  const q8 = new Promise(resolve => { releaseQ8 = resolve; });
  await page.route('**/library/vehicles/audi-a7.glb', async route => { await a7; await route.continue(); });
  await page.route('**/library/vehicles/audi-rs-q8.glb', async route => { await q8; await route.continue(); });
  await boot(page);
  expect(await page.evaluate(() => ({
    draws: __city.traffic.renderer.drawCalls,
    renderers: __scene.children.filter(o => /^traffic-(?!realistic)/.test(o.name)).map(o => o.name),
    states: __city.traffic.realisticFleet.models,
  }))).toEqual({ draws: 0, renderers: [], states: {
    veh_audi_a7: { state: 'loading' }, veh_audi_rs_q8: { state: 'loading' },
  }});
  releaseA7();
  await page.waitForFunction(() => __city.traffic.realisticFleet.models.veh_audi_a7.state === 'loaded');
  const midway = await page.evaluate(() => ({ loaded: __city.traffic.realisticFleet.loaded, q8: __city.traffic.realisticFleet.models.veh_audi_rs_q8.state, names: __scene.children.filter(o => o.name.startsWith('traffic-')).map(o => o.name) }));
  expect(midway.loaded).toEqual(['veh_audi_a7']);
  expect(midway.q8).toBe('loading');
  expect(midway.names.every(name => name.startsWith('traffic-realistic-veh_audi_a7-'))).toBe(true);
  releaseQ8();
  await page.waitForFunction(() => __city.traffic.realisticFleet.loaded.length === 2);
});

test('failed Audi requests leave empty roads without opening the crash guard', async ({ page }) => {
  test.setTimeout(150_000);
  await page.route(/audi-(?:a7|rs-q8)\.glb$/, route => route.fulfill({ status: 404, body: 'missing' }));
  await boot(page);
  await page.waitForFunction(() => Object.values(__city.traffic.realisticFleet.models).every(value => value.state === 'failed'));
  await page.waitForFunction(() => __city.loading.phase !== 'streaming', null, { timeout: 120_000 });
  const state = await page.evaluate(() => ({ draws: __city.traffic.renderer.drawCalls, visible: __city.traffic.vehicles.filter(v => v.renderer).length, crash: !!document.querySelector('#crash-guard'), phase: __city.loading.phase }));
  expect(state).toEqual({ draws: 0, visible: 0, crash: false, phase: 'failed' });
});

test('buildings begin as solid fallbacks, settle independently, and missing models stay recoverable', async ({ page }) => {
  let releaseSchool;
  const school = new Promise(resolve => { releaseSchool = resolve; });
  await page.route('**/city-builder/assets/models/school.glb', async route => { await school; await route.continue(); });
  await page.route('**/city-builder/assets/models/library.glb', route => route.fulfill({ status: 404, body: 'missing' }));
  await boot(page);
  await page.waitForFunction(() => __city.loading.assets.buildings.library?.state === 'failed');
  const pending = await page.evaluate(() => ({
    school: __city.loading.assets.buildings.school,
    library: __city.loading.assets.buildings.library,
    plots: __scene.children.filter(o => o.name.startsWith('building-fallback-')).map(o => o.name),
    labels: document.querySelectorAll('.building-label').length,
    crash: !!document.querySelector('#crash-guard'),
  }));
  expect(pending.school.state).toBe('loading');
  expect(pending.library).toMatchObject({ state: 'failed', instances: 0 });
  expect(pending.plots).toEqual(expect.arrayContaining(['building-fallback-school', 'building-fallback-library']));
  expect(pending.labels).toBeGreaterThanOrEqual(2);
  expect(pending.crash).toBe(false);
  releaseSchool();
  await page.waitForFunction(() => __city.loading.assets.buildings.school?.state === 'loaded');
  expect(await page.evaluate(() => __city.loading.assets.buildings.school.instances)).toBeGreaterThan(0);
});

test('slow required boot explains the delay then returns to retry with the selected city', async ({ page }) => {
  await page.route('**/champion-city/assets/clips/idle.glb', async route => { await new Promise(resolve => setTimeout(resolve, 1000)); await route.continue(); });
  await page.addInitScript(() => {
    window.__CITY_BOOT_SLOW_COPY_MS__ = 40;
    window.__CITY_BOOT_DEADLINE_MS__ = 180;
    window.__CITY_CHAMPION_TIMEOUT_MS__ = 1000;
  });
  await page.addInitScript(value => localStorage.setItem('p5_city_planner_layout_v1', JSON.stringify(value)), layout);
  await page.goto('/city-builder/');
  await page.locator('#entry-local').click();
  await expect(page.locator('#loading .loading-sub')).toContainText('Still preparing the roads and your Champion');
  await expect(page.locator('#entry-error')).toBeVisible({ timeout: 5000 });
  expect(await page.evaluate(() => ({ selected: JSON.parse(localStorage.getItem('p5_city_planner_layout_v1')).buildings.map(b => b.type), crash: !!document.querySelector('#crash-guard') }))).toEqual({ selected: ['school', 'library'], crash: false });
});

test('Natural is clean-storage default; saved styles and every ground remain selectable', async ({ page }) => {
  await page.goto('/city-builder/');
  await page.locator('#entry-local').click();
  await page.waitForFunction(() => window.__city?.loading && document.querySelector('#loading.done'));
  await page.locator('#appearance-toggle').click();
  const styles = await page.locator('[data-style]').evaluateAll(nodes => nodes.map(node => ({ id: node.dataset.style, selected: node.getAttribute('aria-pressed') })));
  expect(styles[0]).toEqual({ id: 'natural', selected: 'true' });
  expect(await page.locator('[data-day-sky]').evaluateAll(nodes => nodes.map(node => ({ id: node.dataset.daySky, selected: node.getAttribute('aria-pressed') })))).toEqual([
    { id: 'natural-blue', selected: 'true' },
    { id: 'clear-blue', selected: 'false' },
    { id: 'bright-clouds', selected: 'false' },
    { id: 'calm-overcast', selected: 'false' },
  ]);
  expect(await page.locator('[data-ground]').evaluateAll(nodes => nodes.map(node => node.dataset.ground))).toEqual(['leafy','sparse','withered','pavers','asphalt']);
  await page.locator('[data-style="future"]').click();
  await page.evaluate(value => localStorage.setItem('p5_city_planner_layout_v1', JSON.stringify(value)), layout);
  await page.reload();
  await page.locator('#entry-local').click();
  await page.waitForFunction(() => window.__city?.loading && document.querySelector('#loading.done'));
  await page.locator('#appearance-toggle').click();
  await expect(page.locator('[data-style="future"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-day-sky]')).toHaveCount(0);
});
