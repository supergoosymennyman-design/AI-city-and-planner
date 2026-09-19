import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { specialKeys } from '../../buddy-kit/client/city-common/catalog.js';
import { MAYORS } from '../../buddy-kit/client/city-common/planner-goals.js';

const key='p5_city_planner_layout_v1';
const tiny={version:2,scaleMeters:2000,roads:[{points:[[100,1000],[1900,1000]],width:14,class:'primary'}],parks:[],buildings:[{type:'housing',pos:[500,1000],footprint:[40,40],height:24}]};
const history=' { "completed": [1,18,999], "unlocked": [2,18,999] } ';
async function boot(page,layout=tiny) {
  await page.goto('/city-common/metrics.js');
  await page.evaluate(({key,raw,history})=>{
    localStorage.clear(); localStorage.setItem(key,raw);
    localStorage.setItem('p5_city_planner_coach_v1','1');
    localStorage.setItem('hk_ai_city_lang_v1','en');
    localStorage.setItem('hk_ai_city_quests_v1',history);
  },{key,raw:typeof layout==='string'?layout:JSON.stringify(layout),history});
  await page.goto('/planner/');
  await expect(page.locator('#btn-goals')).toBeVisible();
}
async function saved(page) { return page.evaluate((key)=>JSON.parse(localStorage.getItem(key)),key); }
// ⚙️ Goals and the score receipt both live inside the City-Score sheet, which
// is closed (and pointer-events:none) by default. A real user opens the sheet
// first, so the test must too — otherwise the click is intercepted by <body>.
async function openSheet(page) {
  const open = await page.locator('#metrics-panel').evaluate(el => el.classList.contains('open'));
  if (!open) await page.click('#city-score-toggle');
}
async function openGoals(page) { await openSheet(page); await page.click('#btn-goals'); }
async function openReceipt(page) { await openSheet(page); await page.click('#score'); }
async function freshScore(page) {
  const expected=await page.evaluate(async(key)=>{
    const {computeMetrics}=await import('/city-common/metrics.js');
    const {computeWalkReach}=await import('/city-common/walkability.js');
    const {readGoals,effectiveGoalWeights}=await import('/city-common/planner-goals.js');
    const layout=JSON.parse(localStorage.getItem(key));
    return computeMetrics(layout,undefined,effectiveGoalWeights(readGoals(layout.goals)),computeWalkReach(layout)).score;
  },key);
  await expect(page.locator('#score .score-num')).toHaveText(String(expected));
}
async function flush(page) { await page.evaluate(()=>window.dispatchEvent(new Event('pagehide'))); }
async function download(page) {
  await page.click('#btn-save');
  const [file]=await Promise.all([page.waitForEvent('download'),page.click('#save-go')]);
  return JSON.parse(await readFile(await file.path(),'utf8'));
}

test('all mayor, custom, zero and default modes retain coherent sliders and scores on reopen',async({page})=>{
  const errors=[];page.on('pageerror',(e)=>errors.push(e.message));
  await boot(page);
  for (const [id,mayor] of Object.entries(MAYORS)) {
    await openGoals(page);await page.click('#goals-tab-mayor');await page.click(`[data-mayor="${id}"]`);
    await page.click('#goals-tab-custom');
    for(const [goal,value] of Object.entries(mayor.values)) {
      await expect(page.locator(`[data-goal="${goal}"]`)).toHaveValue(String(Math.round(value*100)));
      await expect(page.locator(`[data-val="${goal}"]`)).toHaveText(`${Math.round(value*100)}%`);
    }
    await page.click('#goals-done');await flush(page);await page.reload();await freshScore(page);
    expect((await saved(page)).goals.mayorId).toBe(id);
  }
  await openGoals(page);await page.click('#goals-tab-custom');
  for(const goal of ['happy','walkable','peaceful','spread']) await page.locator(`[data-goal="${goal}"]`).fill('33');
  await page.locator('[data-goal="spread"]').fill('1');
  await page.click('#goals-done');await flush(page);await page.reload();await freshScore(page);
  expect((await saved(page)).goals.values).toEqual({happy:.33,walkable:.33,peaceful:.33,spread:.01});
  await openReceipt(page);await expect(page.locator('.receipt-row')).toHaveCount(8);
  await expect(page.locator('#receipt-note')).toContainText('full-precision');await page.click('#receipt-done');
  await openGoals(page);await page.click('#goals-tab-custom');
  for(const goal of ['happy','walkable','peaceful','spread']) await page.locator(`[data-goal="${goal}"]`).fill('0');
  await page.click('#goals-done');await flush(page);await freshScore(page);
  await openReceipt(page);await expect(page.locator('[data-metric="green"] .receipt-points')).toHaveText('0.0');await page.click('#receipt-done');
  await openGoals(page);await page.click('#goals-tab-mayor');await page.click('#btn-mayor-balanced');await page.click('#goals-tab-custom');
  for (const [g,v] of Object.entries({happy:30,walkable:30,peaceful:20,spread:20})) await expect(page.locator(`[data-goal="${g}"]`)).toHaveValue(String(v));
  await page.click('#goals-done');await flush(page);await page.reload();await freshScore(page);
  expect((await saved(page)).goals.mode).toBe('default');expect(errors).toEqual([]);
});

test('goal → drag → inspect → optimise both strategies → Apply → Undo → save → reopen → City receipt',async({page})=>{
  const errors=[];page.on('pageerror',(e)=>errors.push(e.message));
  const city=structuredClone(tiny);
  for (const [i,type] of specialKeys().entries()) city.buildings.push({type,pos:[800+(i%6)*130,400+Math.floor(i/6)*150],footprint:[24,24],height:30+i,locked:i%2===0});
  city.buildings.push(structuredClone(city.buildings[1]));
  await boot(page,city);
  const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  await openGoals(page);await page.click('[data-mayor="green"]');await page.click('#goals-done');
  await page.locator('[data-tool="select"]').click();
  const box=await page.locator('#map').boundingBox();
  const start={x:box.x+box.width/2-90,y:box.y+box.height/2};
  await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x+36,start.y,{steps:6});await page.mouse.up();await flush(page);
  const edited=await saved(page);expect(edited.buildings[0].pos).not.toEqual(city.buildings[0].pos);
  await page.click('#btn-undo');await flush(page);expect((await saved(page)).buildings).toEqual(city.buildings);
  // Repeat the edit, then exercise optimiser Undo separately from drag Undo.
  await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x+36,start.y,{steps:6});await page.mouse.up();await flush(page);
  const before=await saved(page);await freshScore(page);
  await openReceipt(page);await expect(page.locator('.receipt-row')).toHaveCount(8);await page.click('#receipt-done');
  for(const strategy of ['greedy','explore']) {
    if (!(await page.locator('#planner-more').evaluate(el=>el.open))) await page.click('#planner-more > summary');
    await page.click('#btn-ai');await page.locator(`[data-strategy="${strategy}"]`).click();
    const promised=Number(await page.locator(`[data-strategy="${strategy}"] .sc-score`).textContent());
    await page.click('#plan-apply');await flush(page);await freshScore(page);
    const after=await saved(page);expect(after.plannerScore).toBe(promised);expect(after.plannerScore).toBeGreaterThanOrEqual(before.plannerScore);
    expect(after.roads).toEqual(before.roads);
    const available=after.buildings.map((b)=>JSON.stringify(b));
    for(const b of before.buildings.filter((b)=>specialKeys().includes(b.type)||b.locked)) {
      const i=available.indexOf(JSON.stringify(b));expect(i).toBeGreaterThanOrEqual(0);available.splice(i,1);
    }
    await page.click('#btn-undo');await flush(page);await freshScore(page);
    expect((await saved(page)).buildings).toEqual(before.buildings);
  }
  const file=await download(page);expect(file.state.quests).toBe(history);
  const savedPlan=JSON.parse(file.state.layout);expect(savedPlan.plannerPlan.metrics).toHaveLength(8);
  await page.reload();
  await Promise.all([page.waitForEvent('load'),page.setInputFiles('#import-file',{name:'saved.champion.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(file))})]);
  await freshScore(page);expect((await saved(page)).goals).toEqual(savedPlan.goals);
  await page.click('#btn-export');await page.waitForURL(/city-builder/);
  await page.waitForFunction(()=>document.getElementById('loading')?.classList.contains('done'));
  await page.click('#plan-ai-chip');await expect(page.locator('.plan-row')).toHaveCount(8);
  await expect(page.locator('#plan-body')).toContainText('ORIGINAL PLAN');
  const points=await page.locator('.plan-row-pts').allTextContents();
  expect(points).toEqual(savedPlan.plannerPlan.metrics.map((r)=>r.points.toFixed(1)));
  expect(await page.evaluate(()=>localStorage.getItem('hk_ai_city_quests_v1'))).toBe(history);
  expect(errors).toEqual([]);
  await page.screenshot({path:'/tmp/planner-session3/city-receipt.png'});
});

test('old weight-only import preserves raw sections until edited and shows explicit disconnected routes',async({page})=>{
  const city=structuredClone(tiny);
  city.goals={label:'Legacy mayor',weights:{accessibility:17,coverage:13,utilities:7,zoning:5,spread:3,balance:11,green:19,walkability:23}};
  city.roads.push({points:[[100,1500],[1900,1500]],width:14,class:'primary'});
  city.buildings.push({type:'school',pos:[500,1500],footprint:[24,24],height:24},{type:'shop',pos:[1800,1000],height:24},{type:'hospital',pos:[50,50],height:24});
  const raw=' '+JSON.stringify(city,null,3)+'\n';await boot(page,raw);await freshScore(page);
  const file=await download(page);expect(file.state.layout).toBe(raw);expect(file.state.quests).toBe(history);
  await page.reload();await openGoals(page);await page.click('#goals-tab-custom');await expect(page.locator('#slider-list')).toContainText('Saved metric priorities');await page.click('#goals-done');
  await page.click('#btn-view-walk');await expect(page.locator('[data-route-status="no-selected-home"]')).toBeVisible();
  await page.locator('[data-tool="select"]').click();const box=await page.locator('#map').boundingBox();await page.mouse.click(box.x+box.width/2-90,box.y+box.height/2);
  await page.screenshot({path:'/tmp/access-session5/route-inspection.png'});
  for(const status of ['disconnected','absent-destination','over-budget']) await expect(page.locator(`[data-route-status="${status}"]`).first()).toBeVisible();
  await page.setInputFiles('#import-file',{name:'old-layout.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...tiny,roads:[],goals:{weights:{walkability:1}}}))});
  await expect.poll(async()=> (await saved(page)).roads.length).toBe(0);
  await flush(page);await freshScore(page);
  await page.mouse.click(box.x+box.width/2-90,box.y+box.height/2);
  await expect(page.locator('[data-route-status="no-road-access"]').first()).toBeVisible();
  await page.click('#btn-undo');await flush(page);await freshScore(page);
  expect(await page.evaluate((key)=>localStorage.getItem(key),key)).toBe(raw);
});

test('road templates replace a non-empty city after confirmation without page errors',async({page})=>{
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  await boot(page);
  await page.locator('#planner-more > summary').click();
  await page.locator('#btn-template').click();
  const template=page.locator('#template-list .template-item').first();
  const templateId=await template.getAttribute('data-template');
  await template.click();
  await expect(page.locator('#confirm-yes')).toBeVisible();
  await page.locator('#confirm-yes').click();
  await expect.poll(async()=> (await saved(page)).buildings.length).toBe(0);
  const expected=await page.evaluate(async(id)=>{
    const {getRoadTemplate}=await import('/city-common/road-templates.js');
    return getRoadTemplate(id).roads;
  },templateId);
  expect((await saved(page)).roads).toEqual(expected);
  expect(errors).toEqual([]);
});
