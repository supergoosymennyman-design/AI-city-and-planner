import { test, expect } from '@playwright/test';

const KEY = 'p5_city_planner_layout_v1';

test('city keeps a 1.8 m Champion and uniformly fits buildings inside planner plots', async ({ page }) => {
  test.setTimeout(120000);
  const layout = {
    version: 2, scaleMeters: 400, roads: [], parks: [],
    buildings: [
      { type: 'housing', pos: [90, 200], footprint: [20, 20], height: 24 },
      { type: 'school', pos: [200, 200], footprint: [26, 24], height: 20 },
      { type: 'city_central', pos: [310, 200], footprint: [28, 28], height: 100 },
    ],
  };
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: KEY, value: layout });
  await page.goto('/city-builder/?from=planner');
  await page.waitForFunction(() => window.__city?.champion?.worldHeight?.() > 0 &&
    ['housing', 'school', 'city_central'].every((type) => window.__city?.buildingScaleDiagnostics?.[type]?.length));

  const result = await page.evaluate(() => ({
    championHeight: window.__city.champion.worldHeight(),
    buildings: window.__city.buildingScaleDiagnostics,
    layout: window.__city.layout.buildings,
  }));
  expect(result.championHeight).toBeCloseTo(1.8, 5);
  for (const building of result.layout) {
    const records = result.buildings[building.type];
    expect(records.length).toBeGreaterThan(0);
    for (const record of records) {
      expect(record.uniform).toBe(true);
      expect(record.bounds.width).toBeLessThanOrEqual(building.footprint[0] + .01);
      expect(record.bounds.depth).toBeLessThanOrEqual(building.footprint[1] + .01);
      expect(record.bounds.height).toBeLessThanOrEqual(building.height + .01);
    }
  }

  await page.evaluate(() => window.__city.champion.swapSkin('../champion-city/assets/clips/idle_dragon.glb', 'dragon'));
  expect(await page.evaluate(() => window.__city.champion.worldHeight())).toBeCloseTo(1.8, 5);
});
