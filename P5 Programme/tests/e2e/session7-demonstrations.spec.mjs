import { test, expect } from '@playwright/test';
import { PURPOSES } from '../../buddy-kit/client/city-common/building-purposes.js';
import { readFile } from 'node:fs/promises';

const propsKey = 'hk_ai_city_props_citybuilder_v1';

async function boot(page, types = Object.keys(PURPOSES)) {
  await page.addInitScript(() => {
    window.__spokenRoute = '';
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: function (text) { this.text = text; this.lang = ''; } });
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { cancel() {}, speak(value) { window.__spokenRoute = value.text; } } });
  });
  await page.goto('/city-common/catalog.js');
  await page.evaluate(types => {
    localStorage.clear();
    localStorage.setItem('hk_ai_city_lang_v1', 'en');
    localStorage.setItem('hk_ai_city_quests_v1', ' { "completed": [1,18,999], "unlocked": [2,18], "old": true } ');
    localStorage.setItem('p5_city_planner_layout_v1', JSON.stringify({
      version: 2, scaleMeters: 2000,
      roads: [{ points: [[100, 1000], [1900, 1000]], width: 14, class: 'primary' }], parks: [],
      buildings: types.map((type, i) => ({ type, pos: [180 + i * 90, 990], height: 30, footprint: [24, 24] })),
    }));
  }, types);
  await page.goto('/city-builder/');
  await page.locator('#entry-local').click();
  await page.waitForFunction(() => document.getElementById('loading')?.classList.contains('done'));
  await page.waitForFunction(() => ['complete', 'failed'].includes(window.__city?.loading?.phase), null, { timeout: 120_000 });
  await expect(page.locator('#my-work-btn')).toBeVisible();
}

async function openPurpose(page, type) {
  await page.evaluate(type => {
    const b = window.__layout.buildings.find(item => item.type === type);
    window.__city.champion.state.pos.set(b.pos[0] + 20, 0, b.pos[1]);
    window.__city.openPurpose(type);
  }, type);
  await expect(page.locator('#my-work-modal')).toBeVisible();
}

test('Visitor Centre shows verified original-plan evidence, a 3D route and complete optional speech', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await boot(page);
  await openPurpose(page, 'sentiment_lab');
  await page.locator('[data-work-action="guide"]').click();
  await expect(page.locator('#work-route')).toHaveAttribute('data-route-status', 'reachable');
  await expect(page.locator('#work-route')).toContainText('400 m');
  await expect(page.locator('#work-route')).toContainText('road distance');
  await expect(page.locator('.route-directions li')).not.toHaveCount(0);
  await expect(page.locator('#work-route')).toContainText('not a landmark classifier or Workshop Speaker');
  await expect(page.locator('#work-route svg')).toBeVisible();
  expect(await page.evaluate(() => ({
    name: window.__learningVisuals.visitor?.name,
    points: window.__learningVisuals.visitor?.userData.points,
  }))).toMatchObject({ name: 'visitor-route-guide' });
  await page.locator('#work-speak-route').click();
  expect(await page.evaluate(() => window.__spokenRoute)).toContain('Arrive at your destination');
  await page.evaluate(() => { delete window.speechSynthesis; delete window.SpeechSynthesisUtterance; });
  await page.selectOption('#work-to', '4');
  await expect(page.locator('.route-directions li')).not.toHaveCount(0);
  await expect(page.locator('#work-speak-route')).toHaveCount(0);
  await page.screenshot({ path: '/tmp/session7-route-guide.png' });
  expect(errors).toEqual([]);
});

test('one-drone test strands, replays feasibly, resumes saved state and round-trips in Champion File', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await boot(page, ['delivery', 'drone_routing']);
  const ambientBefore = await page.evaluate(() => window.__city.drones.drones.length);
  await openPurpose(page, 'delivery');
  await page.locator('[data-work-action="delivery"]').click();
  await expect(page.locator('#work-content')).toContainText('Rule/search simulation');
  await page.selectOption('#delivery-strategy', 'shortest');
  await page.uncheck('#delivery-charge');
  await page.locator('#delivery-new').click();
  await page.locator('#delivery-next').click();
  await expect(page.locator('#delivery-result')).toHaveAttribute('data-delivery-status', 'paused');
  await page.locator('#delivery-next').click();
  await expect(page.locator('#delivery-result')).toHaveAttribute('data-delivery-status', 'stranded');
  await expect(page.locator('#delivery-result')).toContainText('Deliveries completed');
  await expect(page.locator('#delivery-result')).toContainText('Battery remaining');
  expect(await page.evaluate(() => ({
    ambient: window.__city.drones.drones.length,
    separate: window.__learningVisuals.delivery?.userData.separateFromAmbient,
    demoName: window.__learningVisuals.delivery?.getObjectByName('delivery-demo-drone')?.name,
  }))).toEqual({ ambient: ambientBefore, separate: true, demoName: 'delivery-demo-drone' });

  await page.selectOption('#delivery-strategy', 'battery-aware');
  await page.check('#delivery-charge');
  await page.locator('#delivery-new').click();
  await page.locator('#delivery-next').click();
  await page.locator('#my-work-modal .modal-close').click();
  await openPurpose(page, 'drone_routing');
  await page.locator('[data-work-action="delivery"]').click();
  await expect(page.locator('#delivery-result')).toHaveAttribute('data-delivery-status', 'paused');
  await page.locator('#delivery-next').click();
  await expect(page.locator('#delivery-result')).toHaveAttribute('data-delivery-status', 'delivered');
  await expect(page.locator('#delivery-result')).toContainText('Deliveries completed');
  await expect(page.locator('#delivery-result')).toContainText('Elapsed time');
  const rawProps = await page.evaluate(key => localStorage.getItem(key), propsKey);
  const props = JSON.parse(rawProps);
  expect(props.demonstrations.deliveryV1.deliveries).toBe(1);
  expect(props.demonstrations.deliveryV1.status).toBe('delivered');

  await page.locator('#my-work-modal .modal-close').click();
  await page.locator('#btn-save-hud').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#save-download').click()]);
  const champion = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(champion.state.props).toBe(rawProps);
  await Promise.all([
    page.waitForEvent('load'),
    page.setInputFiles('#file-input', { name: 'session7.champion.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(champion)) }),
  ]);
  await page.locator('#entry-local').click();
  await page.waitForFunction(() => document.getElementById('loading')?.classList.contains('done'), null, { timeout: 60_000 });
  expect(await page.evaluate(key => localStorage.getItem(key), propsKey)).toBe(rawProps);
  await page.screenshot({ path: '/tmp/session7-delivery.png' });
  expect(errors).toEqual([]);
});
