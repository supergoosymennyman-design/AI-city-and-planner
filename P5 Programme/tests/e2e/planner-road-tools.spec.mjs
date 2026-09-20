// planner-road-tools.spec.mjs — regression coverage for the on-canvas zoom
// buttons, the Straight/Curve road tools, 🪄 Tidy up, and the optimiser's
// "move buildings off roads" fix.
import { test, expect } from '@playwright/test';
import { onRoadBuildingIndices } from '../../buddy-kit/client/city-common/road-geometry.js';
import { densifyLayout } from '../../buddy-kit/client/city-common/layout.js';

const KEY = 'p5_city_planner_layout_v1';

const city = {
  version: 2, scaleMeters: 2000,
  roads: [{ points: [[200, 1000], [1800, 1000]], width: 14, class: 'primary' }],
  parks: [],
  buildings: [
    { type: 'housing', pos: [1000, 1000], footprint: [20, 20], height: 24 }, // dead centre on the road
    { type: 'school', pos: [1400, 1000], footprint: [26, 24], height: 20 },  // also on the road
  ],
};

async function boot(page) {
  // Load a non-planner page first: the planner flushes state on unload, which
  // would otherwise overwrite the fixture we are about to write.
  await page.goto('/crash-guard.js');
  await page.evaluate(({ key, layout }) => {
    localStorage.clear();
    localStorage.setItem(key, JSON.stringify(layout));
    localStorage.setItem('p5_city_planner_coach_v1', '1');
    localStorage.setItem('hk_ai_city_lang_v1', 'en');
  }, { key: KEY, layout: city });
  await page.goto('/planner/');
  await expect(page.locator('#map')).toBeVisible();
  await page.waitForTimeout(400);
}

const saved = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY);

async function emptyMapPoint(page, fx, fy) {
  return page.locator('#map').evaluate((map, [fx, fy]) => {
    const box = map.getBoundingClientRect();
    for (const [dx, dy] of [[0, 0], [0.05, 0.05], [-0.05, -0.05], [0.05, -0.05]]) {
      const px = box.left + box.width * (fx + dx), py = box.top + box.height * (fy + dy);
      if (document.elementFromPoint(px, py) === map) return { x: px, y: py };
    }
    throw new Error('no unobstructed map point');
  }, [fx, fy]);
}

test('zoom buttons zoom, clamp at the limits, and Fit restores both', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await boot(page);

  await expect(page.locator('#zoom-in')).toBeEnabled();
  await expect(page.locator('#zoom-out')).toBeEnabled();
  // Tap until the clamp disables the button (fast, no 40 round-trips).
  await page.locator('#zoom-in').evaluate((b) => { let n = 0; while (!b.disabled && n < 100) { b.click(); n++; } });
  await expect(page.locator('#zoom-in')).toBeDisabled();
  await page.locator('#zoom-out').evaluate((b) => { let n = 0; while (!b.disabled && n < 200) { b.click(); n++; } });
  await expect(page.locator('#zoom-out')).toBeDisabled();
  await page.locator('#zoom-fit').click();
  await expect(page.locator('#zoom-in')).toBeEnabled();
  await expect(page.locator('#zoom-out')).toBeEnabled();

  expect(errors, `page errors:\n${errors.join('\n')}`).toEqual([]);
});

test('Straight and Curve draw roads; Tidy up reports and keeps the layout valid', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await boot(page);

  await page.locator('.tool-btn[data-tool="road"]').click();
  await expect(page.locator('#road-options')).toBeVisible();
  const before = (await saved(page)).roads.length;

  // Straight = one drag, exactly two points.
  await page.locator('.road-mode-btn[data-road-mode="straight"]').click();
  const a = await emptyMapPoint(page, 0.62, 0.40);
  const b = await emptyMapPoint(page, 0.62, 0.62);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(1500);
  expect((await saved(page)).roads.length).toBe(before + 1);
  expect((await saved(page)).roads.at(-1).points.length).toBe(2);

  // Curve = tap bends, then Finish; committed as a smoothed polyline.
  await page.locator('.road-mode-btn[data-road-mode="curve"]').click();
  for (const [fx, fy] of [[0.40, 0.42], [0.48, 0.55], [0.56, 0.42]]) {
    const q = await emptyMapPoint(page, fx, fy);
    await page.mouse.click(q.x, q.y);
  }
  await expect(page.locator('#road-finish')).toBeVisible();
  await page.locator('#road-finish').click();
  await page.waitForTimeout(1500);
  expect((await saved(page)).roads.at(-1).points.length).toBeGreaterThan(3);

  // Tidy up is one undoable action and never invalidates the layout.
  await page.locator('#road-tidy').click();
  await expect(page.locator('#toast')).toContainText(/Tidied|tidy/i);
  await page.waitForTimeout(1500);
  const after = await saved(page);
  for (const r of after.roads) {
    expect(r.points.length).toBeGreaterThanOrEqual(2);
    for (const [x, z] of r.points) {
      expect(Number.isFinite(x) && Number.isFinite(z)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(2000);
    }
  }
  expect(errors, `page errors:\n${errors.join('\n')}`).toEqual([]);
});

test('Optimise moves buildings off the road and says so', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await boot(page);

  await page.locator('#planner-more > summary').click();
  await page.locator('#btn-ai').click();
  const plan = page.locator('#plan-modal');
  await expect(plan).toBeVisible({ timeout: 30000 });
  await expect(plan).toContainText(/off the road/i);
  await page.locator('#plan-apply').click();
  await page.waitForTimeout(2500);

  const out = await saved(page);
  assertNoUnprotectedOnRoad(out);
  // …and it must STILL be clean after the 3D builder's step, which is exactly
  // the "Optimise → View in 3D → buildings on the road" bug.
  const rendered = densifyLayout(JSON.parse(JSON.stringify(out))).layout;
  expect(onRoadBuildingIndices(rendered)).toEqual([]);
  expect(errors, `page errors:\n${errors.join('\n')}`).toEqual([]);
});

function assertNoUnprotectedOnRoad(layout) {
  // No locked buildings in this fixture, so nothing may sit on a road at all.
  expect(onRoadBuildingIndices(layout)).toEqual([]);
}
