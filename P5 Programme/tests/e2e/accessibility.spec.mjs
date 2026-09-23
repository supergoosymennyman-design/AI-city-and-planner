import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const layoutKey='p5_city_planner_layout_v1';
const history=' {"completed":[1,18,999],"unlocked":[18,999],"old":true} ';
async function planner(page,lang='en') {
 await page.goto('/city-common/catalog.js');
 await page.evaluate(({lang,history})=>{localStorage.clear();localStorage.setItem('hk_ai_city_lang_v1',lang);localStorage.setItem('hk_ai_city_quests_v1',history);localStorage.setItem('p5_city_planner_coach_v1','1');},{lang,history});
 await page.goto('/planner/');
 const coach=page.locator('#coach-modal');if(await coach.isVisible())await page.locator('#coach-done').click();
 await expect(page.locator('#catalog-list .cat-btn')).toHaveCount(12);
}
async function enter(page,selector){await page.locator(selector).focus();await page.keyboard.press('Enter');}
async function saved(page){return page.evaluate(key=>JSON.parse(localStorage.getItem(key)),layoutKey);}
for (const lang of ['en','zh-Hant']) test(`keyboard edit, modal safety, download and discovery ${lang}`,async({page})=>{
 const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.stack);});await planner(page,lang);
 await enter(page,'[data-type="housing"]');await enter(page,'#map');
 await expect.poll(async()=> (await saved(page))?.buildings.length).toBe(1);
 await page.keyboard.press(']');await page.keyboard.press('ArrowRight');
 await expect.poll(async()=> (await saved(page))?.buildings[0].pos[0]).toBe(1010);
 await enter(page,'#btn-goals');
 await expect(page.locator('#topbar')).toHaveAttribute('inert','');
 await page.keyboard.press('Delete');await page.keyboard.press('Backspace');
 expect((await saved(page)).buildings).toHaveLength(1);
 await page.locator('#goals-done').focus();await page.keyboard.press('Tab');await expect(page.locator('#goals-modal .modal-close')).toBeFocused();
 await page.keyboard.press('Shift+Tab');await expect(page.locator('#goals-done')).toBeFocused();
 await page.keyboard.press('Escape');await expect(page.locator('#btn-goals')).toBeFocused();
 await enter(page,'#btn-save');await expect(page.locator('#save-name')).toBeFocused();
 const [download]=await Promise.all([page.waitForEvent('download'),page.keyboard.press('Enter')]);
 const file=JSON.parse(await readFile(await download.path(),'utf8'));expect(file.state.quests).toBe(history);expect(JSON.parse(file.state.layout).buildings[0].pos).toEqual([1010,1000]);
 await expect(page.locator('#btn-save')).toBeFocused();
 await page.locator('#map').focus();await page.keyboard.press('Delete');
 await expect.poll(async()=> (await saved(page))?.buildings.length).toBe(0);
 await enter(page,'#btn-undo');await expect.poll(async()=> (await saved(page))?.buildings.length).toBe(1);
 await page.selectOption('#drawer-category','all');await expect(page.locator('#catalog-list .cat-btn')).toHaveCount(12);
 await enter(page,'#drawer-more');await expect(page.locator('#catalog-list .cat-btn')).toHaveCount(36);
 await page.locator('#drawer-search').fill('bench');await expect(page.locator('#catalog-list .cat-btn').first()).toBeVisible();
 await page.locator('#drawer-search').fill('lib:nat_bush');await expect(page.locator('#catalog-list .cat-btn').first()).toBeVisible();
 await page.locator('#drawer-search').fill(lang==='en'?'school':'學校');await expect(page.locator('#catalog-list [data-type="school"]')).toBeVisible();
 expect(await page.locator('meta[name="viewport"]').getAttribute('content')).not.toMatch(/maximum-scale|user-scalable/);
 await page.screenshot({path:`/tmp/access-session5/planner-${lang}.png`});expect(errors).toEqual([]);
});
test('narrow/tablet, reduced motion, mouse/touch place and cloud failure',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await planner(page,'zh-Hant');
 for(const width of [390,768]){
  await page.setViewportSize({width,height:900});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  for(const id of ['btn-save','btn-export','drawer-search']) {const box=await page.locator('#'+id).boundingBox();expect(box.height).toBeGreaterThanOrEqual(44);}
  for(const button of await page.locator('button:visible').all()){const box=await button.boundingBox();expect(box.height).toBeGreaterThanOrEqual(44);expect(box.width).toBeGreaterThanOrEqual(44);}
  await page.screenshot({path:`/tmp/access-session5/planner-${width}.png`,fullPage:true});
 }
 await enter(page,'[data-type="housing"]');await page.locator('#map').click({position:{x:150,y:180}});
 await expect.poll(async()=> (await saved(page))?.buildings.length).toBe(1);
 const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true});
 const box=await page.locator('#map').boundingBox();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+170,y:box.y+190}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await expect.poll(async()=> (await saved(page))?.buildings.length).toBe(2);
 await page.route('**/api/save',r=>r.abort());await enter(page,'#btn-save');await page.locator('#save-cloud').click();await expect(page.locator('#save-cloud-result')).toContainText('暫時無法連接雲端');
 expect(await page.evaluate(async()=>{const p=await import('/city-common/interface.js');return [p.reducedMotion(),p.ambientDelta(1)];})).toEqual([true,0]);
 await page.keyboard.press('Escape');await expect(page.locator('#btn-save')).toBeFocused();
});
test('City My Work nested ownership, semantic movement and localized cloud',async({page})=>{
 test.setTimeout(240000);
 const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.stack);});await planner(page);
 await enter(page,'[data-type="city_central"]');await enter(page,'#map');
 await expect.poll(async()=> (await saved(page))?.buildings.length).toBe(1);
 await page.goto('/city-builder/');await page.locator('#entry-local').click();await page.waitForFunction(()=>document.getElementById('loading')?.classList.contains('done'));
 await expect(page.locator('#my-work-btn')).toBeVisible();
 await enter(page,'#my-work-btn');await expect(page.locator('#my-work-modal .modal-close')).toBeFocused();await expect(page.locator('#hud-top')).toHaveAttribute('inert','');
 await page.keyboard.press('Delete');await page.locator('[data-work-action="save"]').click();await expect(page.locator('#save-name')).toBeFocused();
 await page.keyboard.press('Escape');await expect(page.locator('#my-work-btn')).toBeFocused();
 await page.locator('#city-more summary').click();await page.locator('#cap-btn').click();await expect(page.locator('#cap-modal')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('#cap-btn')).toBeFocused();await page.locator('#city-more summary').click();
 const before=await page.evaluate(()=>window.__city.champion.state.pos.toArray());
 await page.locator('#btn-walk').focus();await page.keyboard.down(' ');
 await expect.poll(async()=>page.evaluate(before=>Math.hypot(window.__city.champion.state.pos.x-before[0],window.__city.champion.state.pos.z-before[2])>0.2,before)).toBe(true);
 await page.keyboard.up(' ');
 await enter(page,'#my-work-btn');const pos=await page.evaluate(()=>window.__city.champion.state.pos.toArray());await page.keyboard.press('w');await page.waitForTimeout(200);expect(await page.evaluate(()=>window.__city.champion.state.pos.toArray())).toEqual(pos);await page.keyboard.press('Escape');
 await page.locator('#lang-toggle').click();await expect(page.locator('#my-work-btn')).toHaveText('我的作品');await expect(page.locator('#plan-ai-chip')).toContainText('均衡');
 await page.route('**/api/save',r=>r.abort());await enter(page,'#btn-save-hud');await page.locator('#save-cloud').click();await expect(page.locator('#save-cloud-result')).toContainText('暫時無法連接雲端');await page.keyboard.press('Escape');
 expect(await page.locator('meta[name="viewport"]').getAttribute('content')).not.toMatch(/maximum-scale|user-scalable/);
 await page.locator('#city-more summary').click();await enter(page,'#more-drive');await expect(page.locator('#drive-overlay')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('#more-drive')).toBeFocused();
 const walkBox=await page.locator('#btn-walk').boundingBox();const mouseStart=await page.evaluate(()=>window.__city.champion.state.pos.toArray());
 await page.mouse.move(walkBox.x+walkBox.width/2,walkBox.y+walkBox.height/2);await page.mouse.down();
 await expect.poll(()=>page.evaluate(p=>Math.hypot(window.__city.champion.state.pos.x-p[0],window.__city.champion.state.pos.z-p[2]),mouseStart)).toBeGreaterThan(.2);
 await page.mouse.up();
 expect(await page.evaluate(()=>getComputedStyle(document.body).touchAction)).not.toBe('none');
 expect(await page.locator('#stage canvas').evaluate(el=>getComputedStyle(el).touchAction)).toContain('pinch-zoom');
 await page.emulateMedia({reducedMotion:'reduce'});
 for(const width of [768,390]){
  await page.setViewportSize({width,height:1024});
  for(const id of ['my-work-btn','btn-save-hud','lang-toggle']){const box=await page.locator('#'+id).boundingBox();expect(box.y).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);expect(box.height).toBeGreaterThanOrEqual(44);}
  const prompt=await page.locator('#quest-prompt').boundingBox();
  if(prompt) for(const id of ['skin-toggle','orbit-toggle','prop-toggle','btn-home','btn-next','btn-hub']){const control=page.locator('#'+id);if(!await control.count())continue;const box=await control.boundingBox();if(box)expect(box.y+box.height).toBeLessThanOrEqual(prompt.y);}
  await page.screenshot({path:`/tmp/access-session5/city-${width}.png`});
  await enter(page,'#my-work-btn');await page.screenshot({path:`/tmp/access-session5/city-work-${width}.png`});await page.keyboard.press('Escape');
 }

 expect(await page.evaluate(()=>localStorage.getItem('hk_ai_city_quests_v1'))).toBe(history);expect(errors).toEqual([]);
});

test('Tab-only road, park, building and file save; browser page zoom',async({page})=>{
 await planner(page);
 async function tabTo(selector){
  for(let i=0;i<160;i++){
   if(await page.locator(selector).evaluate(el=>el===document.activeElement))return;
   await page.keyboard.press('Tab');
  }
  throw new Error('Keyboard could not reach '+selector);
 }
 await tabTo('[data-tool="road"]');await page.keyboard.press('Enter');await tabTo('#map');await page.keyboard.press('Enter');await page.keyboard.press('Shift+ArrowRight');await page.keyboard.press('Enter');
 await expect.poll(async()=> (await saved(page))?.roads.length).toBe(1);
 await tabTo('[data-tool="park"]');await page.keyboard.press('Enter');await tabTo('#map');await page.keyboard.press('ArrowUp');await page.keyboard.press('Enter');
 await expect.poll(async()=> (await saved(page))?.parks.length).toBe(1);
 await tabTo('#catalog-list [data-type="housing"]');await page.keyboard.press('Enter');await tabTo('#map');await page.keyboard.press('Enter');await page.keyboard.press(']');await page.keyboard.press('ArrowLeft');
 await tabTo('#btn-save');await page.keyboard.press('Enter');await expect(page.locator('#save-name')).toBeFocused();
 const [download]=await Promise.all([page.waitForEvent('download'),page.keyboard.press('Enter')]);
 const file=JSON.parse(await readFile(await download.path(),'utf8'));const plan=JSON.parse(file.state.layout);expect([plan.roads.length,plan.parks.length,plan.buildings.length]).toEqual([1,1,1]);
 await expect(page.locator('#btn-save')).toBeFocused();
 const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setPageScaleFactor',{pageScaleFactor:2});
 expect(await page.evaluate(()=>visualViewport.scale)).toBe(2);await page.screenshot({path:'/tmp/access-session5/planner-zoom.png'});
});

test('Chinese recovery owns focus and preserves both raw backup downloads',async({page})=>{
 await planner(page,'zh-Hant');await enter(page,'#catalog-list [data-type="housing"]');await enter(page,'#map');await expect.poll(async()=>(await saved(page))?.buildings.length).toBe(1);
 const raw=' {"version":2,"scaleMeters":2000,"buildings":[],"parks":[],"roads":[]} ';
 await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='p5_city_planner_layout_v1')throw new DOMException('full','QuotaExceededError');return original.call(this,k,v);};});
 await page.setInputFiles('#import-file',{name:'restore.champion.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({kind:'passiona-champion-file',version:1,state:{layout:raw,quests:history}}))});
 // Restore is transactional: if the layout write fails, the later history
 // section is not committed either and the complete existing city is kept.
 await expect(page.locator('#restore-results')).toContainText('城市規劃: 未儲存');await expect(page.locator('#restore-results')).toContainText('歷史活動: 未儲存');
 await page.keyboard.press('Escape');await expect(page.locator('#restore-results')).toBeVisible();await page.keyboard.press('Delete');
 await page.locator('#restore-continue').focus();await page.keyboard.press('Tab');await expect(page.locator('#restore-recovery')).toBeFocused();
 for(const [id,expected] of [['restore-recovery',null],['restore-imported',raw]]){
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#'+id).click()]);const file=JSON.parse(await readFile(await download.path(),'utf8'));
  if(expected)expect(file.state.layout).toBe(expected);else expect(JSON.parse(file.state.layout).buildings).toHaveLength(1);
  expect(file.state.quests).toBe(history);
 }
 await page.screenshot({path:'/tmp/access-session5/recovery-zh.png'});
});
