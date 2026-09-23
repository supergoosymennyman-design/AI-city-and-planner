import { test, expect } from '@playwright/test';
import { gatewayLotClear } from '../../buddy-kit/client/city-common/gateway-placement.js';

test.use({ hasTouch: true });

async function bootCity(page) {
  await page.goto('/city-builder/?example=1', { waitUntil: 'load' });
  await page.waitForTimeout(800);
  await page.evaluate(() => document.getElementById('entry-local')?.click());
  await expect(page.locator('canvas')).toBeVisible({ timeout: 60000 });
  await page.waitForFunction(() => document.getElementById('loading')?.classList.contains('done') === true, null, { timeout: 60000 });
  await page.waitForFunction(() => {
    const gateways = window.__city?.gateways;
    return gateways && Object.values(gateways).every(g => g.status === 'loaded' || g.status === 'fallback');
  }, null, { timeout: 60000 });
}

function gatewaySnapshot() {
  const group = window.__scene?.getObjectByName('permanent-learning-gateways');
  const all = [];
  window.__scene?.traverse(o => all.push(o));
  const states = Object.fromEntries(Object.entries(window.__city?.gateways || {}).map(([id, g]) => [id, {
    status: g.status,
    model: g.model?.name || null,
    fallbackArchitectureVisible: g.fallback.children.some(child => child.visible && !child.userData.gatewaySocket),
    visibleSockets: g.fallback.children.filter(child => child.visible && child.userData.gatewaySocket).length,
    footprint: g.footprint,
    route: g.quest.directUrl,
    position: g.position,
  }]));
  return {
    mountNames: group?.children.map(child => child.name) || [],
    models: all.filter(o => o.userData?.gatewayAppearance).map(o => o.userData.gatewayAppearance),
    hits: all.filter(o => o.userData?.kind === 'gateway').map(o => o.userData.quest.gateway),
    states,
  };
}

test('one protected Workshop and Fit Studio flagship load with stable routes and bilingual prompt', async ({ page }) => {
  test.setTimeout(240000);
  await bootCity(page);
  const snapshot = await page.evaluate(gatewaySnapshot);
  expect(snapshot.mountNames.sort()).toEqual(['passiona-studio-gateway', 'passiona-workshop-gateway']);
  expect(snapshot.models.sort()).toEqual(['studio', 'workshop']);
  expect(snapshot.hits.sort()).toEqual(['studio', 'workshop']);
  expect(snapshot.states.workshop).toMatchObject({ status:'loaded', model:'passiona-workshop-gateway-model', fallbackArchitectureVisible:false, visibleSockets:2, footprint:[28,28] });
  expect(snapshot.states.studio).toMatchObject({ status:'loaded', model:'passiona-studio-gateway-model', fallbackArchitectureVisible:false, visibleSockets:2, footprint:[28,28] });
  const layout = await page.evaluate(() => window.__layout);
  const spots = [snapshot.states.workshop.position, snapshot.states.studio.position];
  spots.forEach((p, i) => expect(gatewayLotClear(layout, p.x, p.z, spots.slice(0, i))).toBe(true));

  const workshopUrl = new URL(snapshot.states.workshop.route);
  expect(workshopUrl.origin + workshopUrl.pathname).toBe('https://workshop.ai-education.workers.dev/');
  expect(workshopUrl.searchParams.has('returnTo')).toBe(true);
  expect(workshopUrl.pathname).not.toContain('recycl');
  const studioUrl = new URL(snapshot.states.studio.route);
  expect(studioUrl.origin).toBe(new URL(page.url()).origin);
  expect(studioUrl.pathname).toBe('/studio/');
  expect(studioUrl.searchParams.has('returnTo')).toBe(true);

  await page.evaluate(() => {
    const gateway = window.__city.gateways.workshop;
    window.__city.champion.landAt(gateway.position.x, gateway.position.z + 16);
  });
  await expect(page.locator('#quest-prompt')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#quest-prompt-label')).toContainText('AI Workshop');
  await expect(page.locator('#quest-prompt-btn')).toHaveText('Enter AI Workshop');
  await page.evaluate(() => document.getElementById('lang-toggle').click());
  await expect(page.locator('#quest-prompt-label')).toContainText('AI 工坊');
  await expect(page.locator('#quest-prompt-btn')).toHaveText('進入AI 工坊');

  // The same proximity control is touch-sized and uses same-tab navigation.
  await page.evaluate(() => {
    const gateway = window.__city.gateways.studio;
    window.__city.champion.landAt(gateway.position.x, gateway.position.z + 16);
  });
  await expect(page.locator('#quest-prompt-btn')).toContainText('造型工作室', { timeout:60000 });
  await page.evaluate(() => document.getElementById('quest-prompt-btn').click());
  await expect(page).toHaveURL(/\/studio\/\?returnTo=/, { timeout: 30000 });
  const returnTo = new URL(page.url()).searchParams.get('returnTo');
  expect(returnTo).toBeTruthy();
  await page.goto(returnTo, { waitUntil:'load' });
  await page.waitForTimeout(500);
  await page.evaluate(() => document.getElementById('entry-local')?.click());
  await page.waitForFunction(() => window.__scene?.getObjectByName('permanent-learning-gateways')?.children.length === 2, null, { timeout:60000 });
  expect((await page.evaluate(gatewaySnapshot)).mountNames.sort()).toEqual(['passiona-studio-gateway', 'passiona-workshop-gateway']);
});

test('tablet opening view keeps both destination badges and markers in day, sunset and night', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await bootCity(page);
  for (const time of ['day', 'sunset', 'night']) {
    await page.evaluate(id => {
      // Hold the City's own opening camera while checking each lighting preset.
      window.__city.orbit.introUntil = performance.now() + 30000;
      window.__city.setTimeOfDay(id);
    }, time);
    await page.waitForFunction(() => window.__city.timeOfDay.settled);
    await page.waitForTimeout(1500);
    const visible = await page.evaluate(() => ['workshop', 'studio'].map(kind => {
      const el = document.querySelector(`.gateway-label-${kind}`);
      const marker = window.__scene.getObjectByName(`passiona-${kind}-gateway-marker`);
      const rect = el?.getBoundingClientRect();
      return { text:el?.textContent, opacity:Number(el?.style.opacity), rect: rect && {left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom},
        onscreen:!!rect && rect.width > 0 && rect.height > 0 && rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
        marker:!!marker && marker.visible && !!marker.parent?.visible };
    }));
    expect(visible.map(v => v.onscreen), JSON.stringify(visible)).toEqual([true, true]);
    expect(Math.min(visible[0].rect.right, visible[1].rect.right) - Math.max(visible[0].rect.left, visible[1].rect.left)).toBeLessThanOrEqual(0);
    expect(visible.map(v => v.opacity)).toEqual([1, 1]);
    expect(visible.map(v => v.marker)).toEqual([true, true]);
    expect(visible[0].text).toContain('AI Workshop');
    expect(visible[1].text).toContain('Fit Studio');
  }
});

test('saved/restored and newly created layouts each mount exactly one protected pair', async ({ page }) => {
  test.setTimeout(240000);
  await bootCity(page);
  await page.evaluate(() => localStorage.setItem('p5_city_planner_layout_v1', JSON.stringify(window.__layout)));
  await page.goto('/city-builder/?resume=1', { waitUntil:'load' });
  await page.waitForTimeout(500);
  await page.evaluate(() => document.getElementById('entry-local')?.click());
  await page.waitForFunction(() => window.__scene?.getObjectByName('permanent-learning-gateways')?.children.length === 2, null, { timeout:60000 });
  let snapshot = await page.evaluate(gatewaySnapshot);
  expect(snapshot.mountNames.sort()).toEqual(['passiona-studio-gateway', 'passiona-workshop-gateway']);
  expect(snapshot.hits.sort()).toEqual(['studio', 'workshop']);
  let currentLayout = await page.evaluate(() => window.__layout);
  let spots = [snapshot.states.workshop.position, snapshot.states.studio.position];
  spots.forEach((p, i) => expect(gatewayLotClear(currentLayout, p.x, p.z, spots.slice(0, i))).toBe(true));

  await page.evaluate(() => localStorage.removeItem('p5_city_planner_layout_v1'));
  await page.goto('/city-builder/', { waitUntil:'load' });
  await page.waitForTimeout(500);
  await page.evaluate(() => document.getElementById('entry-local')?.click());
  await page.waitForFunction(() => window.__scene?.getObjectByName('permanent-learning-gateways')?.children.length === 2, null, { timeout:60000 });
  snapshot = await page.evaluate(gatewaySnapshot);
  expect(snapshot.mountNames.sort()).toEqual(['passiona-studio-gateway', 'passiona-workshop-gateway']);
  expect(snapshot.hits.sort()).toEqual(['studio', 'workshop']);
  currentLayout = await page.evaluate(() => window.__layout);
  spots = [snapshot.states.workshop.position, snapshot.states.studio.position];
  spots.forEach((p, i) => expect(gatewayLotClear(currentLayout, p.x, p.z, spots.slice(0, i))).toBe(true));
});

test('missing and corrupt flagship files preserve both procedural gateways and sockets', async ({ page }) => {
  await page.route('**/passiona-ai-workshop-gateway.glb', route => route.abort('failed'));
  await page.route('**/passiona-fit-studio-gateway.glb', route => route.fulfill({
    status: 200,
    contentType: 'model/gltf-binary',
    body: Buffer.from('not a glb'),
  }));
  await bootCity(page);
  const snapshot = await page.evaluate(gatewaySnapshot);
  expect(snapshot.mountNames.sort()).toEqual(['passiona-studio-gateway', 'passiona-workshop-gateway']);
  expect(snapshot.models).toEqual([]);
  expect(snapshot.hits.sort()).toEqual(['studio', 'workshop']);
  for (const state of Object.values(snapshot.states)) {
    expect(state.status).toBe('fallback');
    expect(state.model).toBeNull();
    expect(state.fallbackArchitectureVisible).toBe(true);
    expect(state.visibleSockets).toBe(2);
  }
  const badges = await page.evaluate(() => ['workshop','studio'].map(id => ({
    text:document.querySelector(`.gateway-label-${id}`)?.textContent,
    marker:!!window.__scene.getObjectByName(`passiona-${id}-gateway-marker`),
  })));
  expect(badges[0]).toMatchObject({ marker:true });
  expect(badges[0].text).toContain('AI Workshop');
  expect(badges[1]).toMatchObject({ marker:true });
  expect(badges[1].text).toContain('Fit Studio');
});
