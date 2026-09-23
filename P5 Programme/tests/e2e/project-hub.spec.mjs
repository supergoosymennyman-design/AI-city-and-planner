import { test, expect } from '@playwright/test';
import { FIT_STUDIO_URL, WORKSHOP_URL } from '../../buddy-kit/client/shared/links.js';

const savedLayout = { version:2, scaleMeters:2000, roads:[], parks:[], buildings:[{ type:'housing', pos:[200,200] }] };

test('empty Hub starts in Planner and keeps example separate', async ({ page }) => {
  await page.goto('/hub/');
  await expect(page.getByRole('heading', { name:'My AI City', exact:true }).first()).toBeVisible();
  await expect(page.locator('#city-action')).toHaveText(/Start in Planner/);
  await expect(page.locator('#city-action')).toHaveAttribute('href', '/planner/');
  await expect(page.getByRole('link', { name:'Explore the example city' })).toHaveAttribute('href', '/city-builder/?example=1');
  for (const route of ['/planner/', '/city-builder/', '/studio/', '/workshop/']) {
    const response = await page.request.get(route);
    expect(response.status(), `${route} should be available`).toBe(200);
  }
});

test('live tool cards open separate tabs and leave the project Hub in place', async ({ page, context }) => {
  await context.route('https://**/*', route => route.fulfill({ status:200, contentType:'text/html', body:'<!doctype html><title>Live tool</title>' }));
  await page.goto('/hub/');
  for (const [id, url] of [['studio-action', FIT_STUDIO_URL], ['workshop-action', WORKSHOP_URL]]) {
    const link = page.locator(`#${id}`);
    await expect(link).toHaveAttribute('href', url);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
    const [popup] = await Promise.all([context.waitForEvent('page'), link.click()]);
    await popup.waitForLoadState('domcontentloaded');
    expect(popup.url()).toBe(url);
    expect(page.url()).toMatch(/\/hub\/$/);
    await popup.close();
  }
});

test('Studio and Workshop resume actions use the same live links', async ({ page }) => {
  await page.goto('/hub/');
  for (const [workspace, url] of [['studio', FIT_STUDIO_URL], ['workshop', WORKSHOP_URL]]) {
    const project = {
      kind:'passiona-project', version:1, id:`resume-${workspace}`, name:'Resume test',
      createdAt:new Date(0).toISOString(), updatedAt:new Date(0).toISOString(), revision:1,
      champion:{}, projects:{ city:{}, workshop:{}, studio:{}, planner:{} },
      capabilities:{}, installations:{}, assets:{}, progress:{ lastWorkspace:workspace }, unknown:{},
    };
    const archive = { kind:'passiona.archive', version:2, project, assets:[], manifest:{} };
    await page.locator('#open-project').setInputFiles({ name:'resume.passiona', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(archive)) });
    await expect(page.locator('#continue')).toHaveAttribute('href', url);
    await expect(page.locator('#continue')).toHaveAttribute('target', '_blank');
    await expect(page.locator('#continue-cue')).toBeVisible();
  }
});

test('City opening screen has a direct route back to the Hub', async ({ page }) => {
  await page.goto('/city-builder/?resume=1');
  const back = page.locator('.entry-hub-link');
  await expect(back).toBeVisible();
  await expect(back).toHaveAttribute('href', '/hub/');
  await back.focus();
  await expect(back).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/hub\/$/);
  await expect(page.getByRole('heading', { name:'Choose where to create' })).toBeVisible();
});

for (const viewport of [{ width:1440, height:900 }, { width:390, height:844 }]) {
  test(`City HUD Workspaces reaches every local workspace at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(layout => localStorage.setItem('p5_city_planner_layout_v1', JSON.stringify(layout)), savedLayout);
    await page.goto('/city-builder/?resume=1');
    await expect(page.locator('#entry-overlay')).toBeHidden({ timeout:60_000 });
    await expect(page.locator('#loading')).toHaveClass(/done/, { timeout:60_000 });
    const menu = page.locator('#city-workspaces summary');
    await expect(menu).toBeVisible();
    const bounds = await menu.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
    await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await expect(page.locator('#city-workspaces')).toHaveAttribute('open', '', { timeout:10_000 });
    for (const [label, route] of [['Hub','/hub/'],['Academy','/pregame/'],['Planner','/planner/'],['Studio','/studio/'],['Workshop','/workshop/']]) {
      await expect(page.locator('#city-workspaces').getByRole('link', { name:label })).toHaveAttribute('href', route);
    }
    await page.locator('#city-workspaces').getByRole('link', { name:'Hub' }).click();
    await expect(page).toHaveURL(/\/hub\/$/);
    await expect(page.locator('#studio-action')).toBeVisible();
    await expect(page.locator('#workshop-action')).toBeVisible();
    await expect(page.getByRole('link', { name:'Explore the example city' })).toBeVisible();
  });
}

test('saved Hub state exposes a one-click strict resume', async ({ page }) => {
  page.on('pageerror', error => console.log('Hub page error:', error.message));
  await page.addInitScript(layout => localStorage.setItem('p5_city_planner_layout_v1', JSON.stringify(layout)), savedLayout);
  await page.goto('/hub/');
  await expect(page.locator('#city-action')).toHaveText(/Continue my city/);
  await expect(page.locator('#city-action')).toHaveAttribute('href', '/city-builder/?resume=1');
  await page.locator('#city-action').click();
  await page.waitForFunction(() => window.__layout?.buildings?.length === 1, null, { timeout:60_000 });
  expect(page.url()).toMatch(/\/city-builder\/$/);
});

test('imported project hydrates its City state before resume', async ({ page }) => {
  page.on('pageerror', error => console.log('Hub page error:', error.message));
  await page.goto('/hub/');
  const project = {
    kind:'passiona-project', version:1, id:'imported-city', name:'Imported City',
    createdAt:new Date(0).toISOString(), updatedAt:new Date(0).toISOString(), revision:1,
    champion:{}, projects:{ city:{ legacyState:{ layout:JSON.stringify(savedLayout) } }, workshop:{}, studio:{}, planner:{} },
    capabilities:{}, installations:{}, assets:{}, progress:{ lastWorkspace:'city' }, unknown:{},
  };
  const archive = { kind:'passiona.archive', version:2, project, assets:[], manifest:{} };
  await page.locator('#open-project').setInputFiles({ name:'imported.passiona', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(archive)) });
  await expect(page.locator('#project-name')).toHaveText('Imported City');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('p5_city_planner_layout_v1')))).toEqual(savedLayout);
  await expect(page.locator('#city-action')).toHaveAttribute('href', '/city-builder/?resume=1');
});

test('Hub remains usable when WebGL is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      if (String(type).startsWith('webgl')) return null;
      return original.call(this, type, ...args);
    };
  });
  await page.goto('/hub/');
  await expect(page.locator('.champion-fallback')).toBeVisible();
  await expect(page.getByRole('link', { name:/Continue my project/ })).toBeVisible();
});

test('example City opens from empty storage without creating a saved layout', async ({ page }) => {
  await page.goto('/city-builder/?example=1');
  await page.waitForFunction(() => window.__layout?.buildings?.length > 0, null, { timeout:60_000 });
  expect(await page.evaluate(() => localStorage.getItem('p5_city_planner_layout_v1'))).toBeNull();
});

test('example City stays available without replacing an existing saved city', async ({ page }) => {
  const saved = JSON.stringify({ version:1, scaleMeters:1000, roads:[], buildings:[], parks:[] });
  await page.goto('/hub/');
  await page.evaluate(raw => localStorage.setItem('p5_city_planner_layout_v1', raw), saved);
  await page.goto('/city-builder/?example=1');
  await page.waitForFunction(() => window.__layout?.buildings?.length > 0, null, { timeout:60_000 });
  expect(await page.evaluate(() => localStorage.getItem('p5_city_planner_layout_v1'))).toBe(saved);
});

test('strict resume never falls back to the example when no valid save exists', async ({ page }) => {
  await page.goto('/city-builder/?resume=1');
  await expect(page.locator('#entry-error')).toBeVisible();
  expect(await page.evaluate(() => window.__layout ?? null)).toBeNull();
  await page.evaluate(() => localStorage.setItem('p5_city_planner_layout_v1', '{broken'));
  await page.goto('/city-builder/?resume=1');
  await expect(page.locator('#entry-error')).toBeVisible();
  expect(await page.evaluate(() => window.__layout ?? null)).toBeNull();
});

for (const viewport of [{ width:1440, height:900 }, { width:390, height:844 }]) {
  test(`presenter can traverse the local workspaces at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.route('https://**/*', route => route.fulfill({ status:200, contentType:'text/html', body:'<!doctype html><title>Workshop preview</title>' }));
    await page.addInitScript(layout => localStorage.setItem('p5_city_planner_layout_v1', JSON.stringify(layout)), savedLayout);
    await page.goto('/hub/');
    await page.getByRole('link', { name:'Open Academy' }).click();
    await expect(page).toHaveURL(/\/pregame\/$/);
    await page.getByRole('link', { name:'Open Planner now' }).click();
    await expect(page).toHaveURL(/\/planner\/$/);
    await expect(page.locator('#coach-modal')).toBeVisible({ timeout:10_000 });
    await page.locator('#coach-done').click();
    await expect(page.locator('#coach-modal')).toBeHidden();
    await page.locator('.passiona-project-bar').getByRole('link', { name:'Studio' }).click();
    await expect(page).toHaveURL(/\/studio\/$/);
    await page.locator('.passiona-project-bar').getByRole('link', { name:'City', exact:true }).click();
    await expect(page).toHaveURL(/\/city-builder\/$/);
    await page.locator('.entry-workspaces summary').click();
    await page.locator('.entry-workspaces').getByRole('link', { name:'Workshop' }).click();
    await expect(page).toHaveURL(/\/workshop\/$/);
    await page.getByRole('link', { name:'Return to Hub' }).click();
    await expect(page).toHaveURL(/\/hub\/$/);
  });
}
