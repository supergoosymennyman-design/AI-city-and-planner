import { test, expect } from '@playwright/test';

test('Recycling Lab keeps its labelled building when its GLB fails', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('p5_city_planner_layout_v1', JSON.stringify({
    version: 2, scaleMeters: 2000, parks: [],
    roads: [{ points: [[300, 900], [1700, 900], [1700, 1200], [300, 1200], [300, 900]], width: 14, class: 'primary' }],
    buildings: [{ type: 'recycling', pos: [1000, 800], footprint: [24, 20], height: 36 }],
  })));
  await page.route('**/assets/models/mission/recycling.glb', route => route.fulfill({ status: 404, body: 'missing' }));
  await page.goto('/city-builder/');
  await page.locator('#entry-local').click();
  await page.waitForFunction(() => document.querySelector('#loading.done') && window.__city?.renderer, null, { timeout: 90000 });
  expect(await page.evaluate(() => ({
    state: window.__city.loading.assets.buildings.recycling.state,
    plot: !!window.__scene.getObjectByName('building-fallback-recycling'),
    label: document.querySelector('.learning-label-recycling')?.textContent,
    gateways: Object.keys(window.__city.gateways).sort(),
  }))).toMatchObject({
    state: 'failed', plot: true,
    label: expect.stringContaining('Recycling Lab'),
    gateways: ['studio', 'workshop'],
  });
});
