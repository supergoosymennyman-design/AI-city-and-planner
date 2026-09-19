import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
test.beforeEach(({page}) => { page.on('pageerror', error => console.log('PAGE ERROR:', error.stack)); });
const key = 'p5_city_planner_layout_v1';
const plan = n => ({ version: 2, scaleMeters: 2000, roads: [], parks: [], buildings: Array.from({length:n}, (_,i) => ({type:'city_central',pos:[500+i*200,500]})) });
const champion = state => ({ kind:'passiona-champion-file', version:1, state });
const upload = (page, selector, data) => page.setInputFiles(selector, {name:'city.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(data))});
async function seed(page, raw = JSON.stringify(plan(1))) {
  await page.addInitScript(({key,raw}) => {
    if (sessionStorage.seeded) return;
    sessionStorage.seeded='1';
    localStorage.setItem('p5_planner_unlocked','1');
    localStorage.setItem('p5_city_planner_coach_v1','1');
    if (raw !== null) localStorage.setItem(key,raw);
  }, {key,raw});
}
async function download(page, selector) {
  const pending = page.waitForEvent('download');
  await page.click(selector);
  return JSON.parse(readFileSync(await (await pending).path(),'utf8'));
}
async function planner(page) { await seed(page); await page.goto('/planner/'); await expect(page.locator('#btn-save')).toBeVisible(); }

for (const route of ['/planner/', '/city-builder/']) {
  test(`${route} file restore survives backgrounding during writes and reload`, async ({page}) => {
    await seed(page); await page.goto(route);
    await page.evaluate(() => {
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function(k,v) { if (k === 'p5_city_planner_layout_v1') window.dispatchEvent(new Event('pagehide')); return set.call(this,k,v); };
    });
    const raw = JSON.stringify(plan(2),null,2);
    await Promise.all([page.waitForEvent('load'), upload(page, route === '/planner/' ? '#import-file' : '#file-input', champion({layout:raw, quests:'{"completed":[1,18,999],"unlocked":[2,18]}'}))]);
    expect(await page.evaluate(k => localStorage.getItem(k), key)).toBe(raw);
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    expect(JSON.parse(await page.evaluate(k => localStorage.getItem(k), key)).buildings).toHaveLength(2);
    expect(await page.evaluate(() => localStorage.getItem('hk_ai_city_quests_v1'))).toContain('999');
  });
  test(`${route} cloud restore uses request function and survives hidden tab`, async ({page}) => {
    await seed(page); await page.goto(route);
    await page.route('**/api/load', async r => {
      await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', {configurable:true, value:'hidden'}); document.dispatchEvent(new Event('visibilitychange')); });
      await r.fulfill({json:champion({layout:JSON.stringify(plan(2))})});
    });
    if (route === '/planner/') { await page.click('#planner-more > summary'); await page.click('#btn-import'); await page.click('#import-cloud-open'); }
    else await page.click('#entry-cloud-open');
    await page.fill('#cloud-code','TEST-123456');
    await Promise.all([page.waitForEvent('load'),page.click('#cloud-load')]);
    expect(JSON.parse(await page.evaluate(k => localStorage.getItem(k),key)).buildings).toHaveLength(2);
    expect(await page.evaluate(() => localStorage.getItem('p5_cloud_code_v1'))).toBe('TEST-123456');
  });
  test(`${route} quota results stay visible with both recovery downloads`, async ({page}) => {
    await seed(page); await page.goto(route);
    await page.evaluate(() => {
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function(k,v) { if (k === 'p5_city_planner_layout_v1' || k === 'hk_ai_city_skin_v2') throw new DOMException('full','QuotaExceededError'); return set.call(this,k,v); };
    });
    await upload(page, route === '/planner/' ? '#import-file' : '#file-input', champion({layout:JSON.stringify(plan(2)),skin:'crimson',quests:'{"completed":[18]}'}));
    await expect(page.locator('#restore-results')).toBeVisible();
    await expect(page.locator('#restore-results')).toContainText('City plan: not stored');
    await expect(page.locator('#restore-results')).toContainText('Champion appearance: not stored');
    await expect(page.locator('#restore-results')).toContainText('Historical activities: restored');
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    const before = await download(page,'#restore-recovery');
    const imported = await download(page,'#restore-imported');
    expect(JSON.parse(before.state.layout).buildings).toHaveLength(1);
    expect(JSON.parse(imported.state.layout).buildings).toHaveLength(2);
    await page.waitForTimeout(3700);
    await expect(page.locator('#restore-results')).toBeVisible();
  });
}
test('Planner immediate edit then download includes unsaved layout even with quota failure', async ({page}) => {
  await planner(page);
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('full','QuotaExceededError'); }; });
  await upload(page,'#import-file',plan(2));
  await page.click('#btn-save');
  const file = await download(page,'#save-go');
  expect(JSON.parse(file.state.layout).buildings).toHaveLength(2);
});
for (const raw of ['{broken', JSON.stringify({version:2,buildings:[null]})]) {
  test(`invalid handoff retains controls: ${raw}`, async ({page}) => {
    await seed(page,raw); await page.goto('/city-builder/?from=planner');
    await expect(page.locator('#entry-overlay')).toBeVisible();
    await page.click('#entry-save'); await expect(page.locator('#save-modal')).toBeVisible();
  });
}
test('handoff binds HUD save and renders imported label literally', async ({page}) => {
  const p = plan(1);
  p.goals = {label:'<img src=x onerror="window.marker=1">'};
  p.plannerPlan = {score:42, metrics:[{key:'coverage',raw:50,weight:20,points:10}]};
  await seed(page,JSON.stringify(p)); await page.goto('/city-builder/?from=planner');
  await page.waitForFunction(() => !!window.__city?.champion && !!window.__scene && document.getElementById('loading').classList.contains('done'));
  await page.click('#plan-ai-chip');
  await expect(page.locator('[data-plan-label]')).toHaveText(p.goals.label);
  expect(await page.evaluate(() => window.marker)).toBeUndefined();
  await page.locator('#plan-modal button[data-plan-close]').first().click();
  await page.click('#btn-save-hud'); await expect(page.locator('#save-modal')).toBeVisible();
  const saved = await download(page,'#save-download');
  expect(JSON.parse(saved.state.layout)).toEqual(p);
});
for (const sample of [true,false]) {
 test(`City ${sample ? 'sample' : 'legacy'} entry exports original plan and ignores repeated starts`, async ({page}) => {
  await seed(page,null); await page.goto('/city-builder/');
  if (sample) await page.locator('#entry-local').evaluate(b => { b.click(); b.click(); b.click(); });
  else await upload(page,'#file-input',plan(2));
  await page.waitForFunction(() => !!window.__city?.champion && !!window.__scene && document.getElementById('loading').classList.contains('done'));
  await page.click('#btn-save-hud');
  const file = await download(page,'#save-download');
  expect(JSON.parse(file.state.layout).buildings.length).toBeGreaterThan(0);
  if (!sample) expect(JSON.parse(file.state.layout)).toEqual(plan(2));
  else expect(JSON.parse(file.state.layout)).toEqual(await page.evaluate(async () => (await import('/city-common/sample-city.js')).buildSampleCity()));
 });
}
test('failed WebGL start keeps save and retry controls usable', async ({page}) => {
 await seed(page);
 await page.addInitScript(() => { const get = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function(kind,...args) { return String(kind).includes('webgl') ? null : get.call(this,kind,...args); }; });
 await page.goto('/city-builder/?from=planner');
 await expect(page.locator('#entry-overlay')).toBeVisible();
 await page.click('#entry-local'); await page.click('#entry-save');
 await expect(page.locator('#save-modal')).toBeVisible();
});
for (const route of ['/planner/','/city-builder/']) {
 test(`${route} rejects oversized files before reading`, async ({page}) => {
  await seed(page); await page.goto(route);
  await page.evaluate(() => { window.reads=0; FileReader.prototype.readAsText = () => { window.reads++; }; });
  await page.setInputFiles(route === '/planner/' ? '#import-file' : '#file-input', {name:'large.json',mimeType:'application/json',buffer:Buffer.alloc(5*1024*1024+1,32)});
  expect(await page.evaluate(() => window.reads)).toBe(0);
 });
}
test('Planner partial cloud restore retains written layout on hide, retries, then resumes normal autosave', async ({page}) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', {rate:4});
  await planner(page);
  await page.evaluate(() => {
    window.quota = true;
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function(k,v) { if (window.quota && k === 'hk_ai_city_skin_v2') throw new DOMException('full','QuotaExceededError'); return set.call(this,k,v); };
  });
  let requests = 0;
  await page.route('**/api/load', async r => {
    requests++;
    await new Promise(resolve => setTimeout(resolve,100));
    await r.fulfill({json:champion({layout:JSON.stringify(plan(2)),skin:'crimson'})});
  });
  await page.click('#planner-more > summary'); await page.click('#btn-import'); await page.click('#import-cloud-open'); await page.fill('#cloud-code','TEST-123456');
  await page.locator('#cloud-load').evaluate(b => { b.click(); b.click(); document.getElementById('cloud-code').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); });
  await expect(page.locator('#restore-results')).toBeVisible();
  expect(requests).toBe(1);
  await page.evaluate(() => {
    Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pagehide'));
  });
  await page.waitForTimeout(1400);
  expect(JSON.parse(await page.evaluate(k => localStorage.getItem(k),key)).buildings).toHaveLength(2);
  await page.evaluate(() => { window.quota = false; });
  await page.click('#restore-retry');
  await expect(page.locator('#restore-results')).toContainText('Champion appearance: restored');
  await Promise.all([page.waitForEvent('load'),page.click('#restore-continue')]);
  await upload(page,'#import-file',plan(3));
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  expect(JSON.parse(await page.evaluate(k => localStorage.getItem(k),key)).buildings).toHaveLength(3);
});
test('absent Champion sections and legacy layout import preserve unrelated raw state', async ({page}) => {
  await planner(page);
  const history = ' { "completed": [1,18,999], "unlocked": [2,18] } ';
  await page.evaluate(raw => localStorage.setItem('hk_ai_city_quests_v1',raw),history);
  await upload(page,'#import-file',plan(2));
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await Promise.all([page.waitForEvent('load'),upload(page,'#import-file',champion({skin:'crimson'}))]);
  expect(JSON.parse(await page.evaluate(k => localStorage.getItem(k),key)).buildings).toHaveLength(2);
  expect(await page.evaluate(() => localStorage.getItem('hk_ai_city_quests_v1'))).toBe(history);
});
for (const route of ['/planner/','/city-builder/']) {
 test(`${route} malformed Champion File cannot fall through as a legacy layout`, async ({page}) => {
  await seed(page); await page.goto(route);
  await upload(page,route === '/planner/' ? '#import-file' : '#file-input',{kind:'passiona-champion-file',version:1,state:null});
  await page.waitForTimeout(200);
  expect(JSON.parse(await page.evaluate(k => localStorage.getItem(k),key)).buildings).toHaveLength(1);
  if (route === '/city-builder/') await expect(page.locator('#entry-overlay')).toBeVisible();
 });
}
