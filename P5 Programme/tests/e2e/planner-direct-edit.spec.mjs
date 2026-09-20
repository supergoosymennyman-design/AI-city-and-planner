import { test, expect } from '@playwright/test';

const KEY = 'p5_city_planner_layout_v1';
const city = (locked = false) => ({
  version: 2, scaleMeters: 2000, roads: [], parks: [],
  buildings: [{ type: 'housing', pos: [1000, 1000], footprint: [40, 40], height: 24, ...(locked ? { locked: true } : {}) }],
});

async function boot(page, layout = city()) {
  await page.goto('/city-common/metrics.js');
  await page.evaluate(({ key, layout }) => {
    localStorage.clear();
    localStorage.setItem(key, JSON.stringify(layout));
    localStorage.setItem('p5_city_planner_coach_v1', '1');
    localStorage.setItem('hk_ai_city_lang_v1', 'en');
  }, { key: KEY, layout });
  await page.goto('/planner/');
  await expect(page.locator('#map')).toBeVisible();
}

async function saved(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY);
}

async function mapCentre(page) {
  const box = await page.locator('#map').boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function emptyMapPoint(page) {
  return page.locator('#map').evaluate((map) => {
    const box = map.getBoundingClientRect();
    for (const [x, y] of [[.65, .65], [.35, .65], [.65, .45], [.35, .45]]) {
      const px = box.left + box.width * x, py = box.top + box.height * y;
      if (document.elementFromPoint(px, py) === map) return { x: px, y: py };
    }
    throw new Error('No unobstructed map point available');
  });
}

test('Place mode directly selects, moves, removes and restores a visible icon', async ({ page }) => {
  await boot(page);
  const centre = await mapCentre(page);

  // At overview zoom the actual 40 m footprint is only a few pixels wide.
  // Grabbing near the visible emoji must still work without switching tools.
  await page.mouse.move(centre.x + 18, centre.y);
  await page.mouse.down();
  await page.mouse.move(centre.x + 68, centre.y, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await saved(page)).buildings[0].pos).not.toEqual([1000, 1000]);
  await expect(page.locator('#selected-info')).toContainText('Remove');

  // The compact on-map Remove action sits above the selected target.
  await page.mouse.click(centre.x + 50, centre.y - 58);
  await expect.poll(async () => (await saved(page)).buildings).toHaveLength(0);
  await expect(page.locator('#toast')).toContainText('Removed');
  await page.click('#btn-undo');
  await expect.poll(async () => (await saved(page)).buildings).toHaveLength(1);
});

test('Place mode keeps empty-map tap placement and drag panning', async ({ page }) => {
  await boot(page);
  const empty = await emptyMapPoint(page);

  await page.mouse.click(empty.x, empty.y);
  await expect.poll(async () => (await saved(page)).buildings).toHaveLength(2);

  await page.mouse.move(empty.x + 130, empty.y + 90);
  await page.mouse.down();
  await page.mouse.move(empty.x + 210, empty.y + 125, { steps: 5 });
  await page.mouse.up();
  // A drag on empty space only pans; it never adds another item.
  await expect.poll(async () => (await saved(page)).buildings).toHaveLength(2);
});

test('locked icons can be selected in Place mode but cannot be dragged', async ({ page }) => {
  await boot(page, city(true));
  const centre = await mapCentre(page);
  await page.mouse.move(centre.x + 18, centre.y);
  await page.mouse.down();
  await page.mouse.move(centre.x + 78, centre.y, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await saved(page)).buildings[0].pos).toEqual([1000, 1000]);
  await expect(page.locator('#selected-info')).toContainText('🔒');
});
