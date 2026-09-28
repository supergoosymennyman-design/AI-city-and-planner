import { test, expect } from '@playwright/test';
import { boot } from './activity-helpers.mjs';

async function drivingControls(page) {
  await expect(page.locator('[data-skill="driving"]')).toBeEnabled();
  if(!await page.locator('[data-drive-city]').isVisible())await page.locator('.workshop-skill-controls>summary').click();
}

test('paired Workshop teaching publishes once, runs the Audi arena, and records an improvement', async ({ page, browser }) => {
  test.setTimeout(360000);
  await page.addInitScript(()=>{if(!localStorage.getItem('p5_city_planner_layout_v1'))localStorage.setItem('p5_city_planner_layout_v1',JSON.stringify({version:2,scaleMeters:2000,roads:[[[600,1000],[1000,1000]],[[1000,1000],[1000,1400]],[[1000,1400],[600,1400]],[[600,1400],[600,1000]]].map(points=>({width:14,class:'primary',points})),buildings:[],parks:[]}));});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/workshop/?publishTarget=city&skill=drive&paired=1');
  await page.waitForFunction(()=>window.WorkshopGame?.buildDrivingPairTable&&window.WorkshopPublish);
  await expect(page.locator('[data-skill="driving"]')).toHaveAttribute('aria-current','page');
  expect(await page.evaluate(()=>WorkshopGame.publishDrivingPair())).toBeNull();
  await drivingControls(page);await page.locator('.driving-teacher summary').click();
  for(const role of ['steering','speed']) {
    await page.locator(`[data-teach-driving="${role}"]`).click();
    await expect(page.locator(`[data-teach-driving="${role}"]`).locator('..').locator('[role="status"]')).toContainText('Taught');
  }
  await drivingControls(page);await page.locator('.driving-teacher summary').click();
  await page.evaluate(async()=>{await WorkshopGame.correctDrivingDecision('speed',{speed:0,clearance:40,closingSpeed:0,signal:'none',signalDistance:40,crossing:'clear',bend:0,finishDistance:40},'stop');});
  await drivingControls(page);await page.locator('[data-drive-city]').click();
  await expect(page).toHaveURL(/activity=driving/);
  await page.waitForFunction(()=>window.__drivingArena&&document.querySelector('#loading.done'),null,{timeout:90000});
  const panel=page.locator('.driving-arena-panel');
  await expect(panel).toBeVisible();await expect(panel.locator('[data-run]')).toBeEnabled({timeout:30000});
  await panel.locator('[data-drill]').selectOption('right');
  await panel.locator('summary',{hasText:'Advanced details'}).click();await panel.locator('[data-seed]').fill('503');await panel.locator('[data-seed]').press('Tab');
  await expect(panel.locator('[data-run]')).toBeEnabled();await panel.locator('summary',{hasText:'Advanced details'}).click();
  await expect(page.locator('.appearance-toggle')).toBeHidden();
  await panel.evaluate(el=>el.scrollTop=0);
  await page.screenshot({path:'/private/tmp/driving-arena-desktop.png'});
  await page.setViewportSize({width:1024,height:768});await page.screenshot({path:'/private/tmp/driving-arena-tablet-en.png'});await page.setViewportSize({width:1280,height:800});
  await panel.locator('[data-step]').click();
  await panel.locator('summary', {hasText:'Sensors and influencing'}).click();
  await expect(panel.locator('[data-readings]')).toContainText('Steering');
  await page.evaluate(()=>{const step=document.querySelector('.driving-arena-panel [data-step]');for(let i=0;i<2400&&!window.__drivingArena.state.outcome;i++)step.click();});
  await expect(panel.locator('[data-status]')).toContainText('time limit');
  const evidence=await page.evaluate(async()=>{const {createProjectStore}=await import('/city-common/project-store.js');const store=createProjectStore();await store.openActiveProject();const s=await store.readSection('driving');store.close();return s.attempts.at(-1);});
  expect(evidence.passed).toBe(false);expect(evidence.car.z).toBe(3);expect(evidence.revision).toBe(1);expect(evidence.interventions.map(i=>i.reason)).toEqual(['timeout']);
  await panel.locator('[data-replay]').fill('20');
  await panel.locator('[data-improve]').click();
  await expect(page).toHaveURL(/paired=1/);
  await drivingControls(page);
  const correction=page.locator('.skill-driving details').filter({has:page.locator('summary', {hasText:'Improve the recorded'})});
  await expect(correction.locator('summary')).toContainText('Improve');
  await correction.locator('summary').click();
  await correction.locator('select').first().selectOption('speed');
  await correction.locator('select').nth(1).selectOption('go');
  await correction.locator('button').click();
  await expect(page.locator('.skill-driving>[role="status"]')).toContainText('Taught.');
  await drivingControls(page);await page.locator('[data-drive-city]').click();
  await page.waitForURL(url=>url.pathname.startsWith('/city-builder/'));
  await page.waitForFunction(()=>window.__drivingArena&&document.querySelector('#loading.done'),null,{timeout:90000});
  await expect(panel.locator('[data-run]')).toBeEnabled();
  await expect(panel.locator('[data-drill]')).toHaveValue('right');await expect(panel.locator('[data-seed]')).toHaveValue('503');
  await panel.locator('summary',{hasText:'Compare with a saved trial'}).click();
  await expect(panel.locator('[data-history] option')).toContainText('Revision 1');
  await panel.locator('[data-repeat-saved]').click();
  await expect(panel.locator('[data-run]')).toBeEnabled();
  await expect(panel.locator('[data-session]')).toContainText('Revision 2');
  expect(await page.evaluate(()=>window.__drivingArena.state.practice)).toBe(true);
  await page.evaluate(()=>{const step=document.querySelector('.driving-arena-panel [data-step]');for(let i=0;i<2400&&!window.__drivingArena.state.outcome;i++)step.click();});
  await expect(panel.locator('[data-comparison]')).toContainText('arrived');
  await expect(panel.locator('[data-comparison]')).toContainText('time limit');
  await page.screenshot({path:'/private/tmp/driving-improved-comparison.png'});
  await panel.locator('[data-new]').click();await expect(panel.locator('[data-run]')).toBeEnabled();
  expect(await page.evaluate(()=>window.__drivingArena.state.practice)).toBe(false);
  await page.evaluate(()=>{const step=document.querySelector('.driving-arena-panel [data-step]');for(let i=0;i<2400&&!window.__drivingArena.state.outcome;i++)step.click();});
  expect(await page.evaluate(()=>window.__drivingArena.state.outcome)).toBe('arrived');
  await panel.locator('[data-city]').click();
  await expect(panel.locator('[data-routes] button').first()).toBeVisible();
  await panel.locator('[data-routes] button').first().click();
  await expect(panel.locator('[data-run]')).toBeEnabled();
  await panel.locator('[data-camera]').selectOption('route');
  await page.screenshot({path:'/private/tmp/driving-city-route-preview.png'});
  await panel.locator('[data-camera]').selectOption('chase');
  await page.evaluate(()=>{const traffic=window.__city.traffic,original=traffic.reserveTrialRegion;window.trialReservations={opened:0,released:0};traffic.reserveTrialRegion=(...args)=>{window.trialReservations.opened++;const release=original(...args);return ()=>{window.trialReservations.released++;release();};};});
  await panel.locator('[data-run]').click();
  // The software GPU can render a 200 m City route slower than wall time. Keep
  // the real arena's fixed-step UI path and bounded route, without a frame-rate deadline.
  await expect.poll(()=>page.evaluate(()=>window.__drivingArena.state.running)).toBe(true);
  await panel.locator('[data-pause]').click();
  for(let batch=0;batch<48;batch++){
    const done=await page.evaluate(()=>{const step=document.querySelector('.driving-arena-panel [data-step]');for(let i=0;i<50&&!window.__drivingArena.state.outcome;i++)step.click();return !!window.__drivingArena.state.outcome;});
    if(done)break;
  }
  expect(await page.evaluate(()=>window.__drivingArena.state.outcome)).toBe('arrived');
  await expect.poll(()=>page.evaluate(async()=>{const {createProjectStore}=await import('/city-common/project-store.js');const s=createProjectStore();await s.openActiveProject();return (await s.readSection('driving')).attempts.at(-1)?.scenario.kind;})).toBe('city');
  await page.screenshot({path:'/private/tmp/driving-city-trial.png'});
  expect(await page.evaluate(()=>window.trialReservations)).toEqual({opened:1,released:1});
  await panel.locator('[data-repeat]').click();await expect(panel.locator('[data-step]')).toBeEnabled();await panel.locator('[data-step]').click();
  await panel.locator('[data-legacy]').click();await expect(panel).toBeHidden();
  expect(await page.evaluate(()=>window.trialReservations)).toEqual({opened:2,released:2});
  await page.locator('.city-activity-panel [data-act="close"]').click();
  const restored=await page.evaluate(async()=>{const {createProjectStore}=await import('/city-common/project-store.js');const store=createProjectStore();await store.openActiveProject();const section=await store.readSection('driving');store.close();return section;});
  expect(restored.attempts.at(-1).revision).toBe(2);
  expect(restored.attempts.at(-1).scenario.kind).toBe('city');
  expect(Object.keys(restored.bundles)).toHaveLength(2);
  await page.locator('#btn-save-hud').click();
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#save-download').click()]);
  await download.saveAs('/private/tmp/driving-workshop-review.passiona');
  const file=await download.path(),context=await browser.newContext(),fresh=await context.newPage();
  await fresh.goto('/city-builder/');
  await Promise.all([fresh.waitForEvent('load'),fresh.locator('#file-input').setInputFiles(file)]);
  const imported=await fresh.evaluate(async()=>{const {createProjectStore}=await import('/city-common/project-store.js');const s=createProjectStore();await s.openActiveProject();const driving=await s.readSection('driving');const {installedDrivingPair}=await import('/city-common/driving-project.js');s.close();return {ok:installedDrivingPair(driving).ok,installed:driving.installed,attempts:driving.attempts.length};});
  expect(imported.ok).toBe(true);expect(imported.installed).toBe(restored.installed);expect(imported.attempts).toBe(restored.attempts.length);
  await context.close();
  expect(errors).toEqual([]);
});

test('Traditional Chinese tablet layout and project changes close the arena',async({page})=>{
  await page.setViewportSize({width:1024,height:768});
  await page.addInitScript(()=>localStorage.setItem('hk_ai_city_lang_v1','zh-Hant'));
  await boot(page);await page.locator('.city-activity-dock button').filter({hasText:/Driving school|駕駛學校/}).click();
  const panel=page.locator('.driving-arena-panel');
  await expect(panel.locator('h2')).toContainText('駕駛');
  await expect(panel.locator('[data-status]')).toContainText('教導');
  const bounds=await panel.boundingBox();expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(1024);
  await page.screenshot({path:'/private/tmp/driving-arena-tablet-zh.png'});
  await page.setViewportSize({width:1280,height:800});await page.screenshot({path:'/private/tmp/driving-arena-desktop-zh.png'});
  await page.evaluate(async()=>{const {createProjectStore}=await import('/city-common/project-store.js');const store=createProjectStore();await store.openActiveProject();await store.createProject('Another city');store.close();});
  await expect(panel).toBeHidden();
});

test('arena entry remains available and asset failure disables driving',async({page})=>{
  await boot(page);
  await page.evaluate(async()=>{const {createProjectStore}=await import('/city-common/project-store.js');const s=createProjectStore();await s.openActiveProject();await s.mutate(p=>{p.projects.driving={bundles:{},installed:'missing@1',attempts:[]};return p;});s.close();});
  await page.locator('.city-activity-dock button').filter({hasText:'Driving school'}).click();
  await expect(page.locator('.driving-arena-panel [data-status]')).toContainText('incompatible or damaged');
  await page.locator('.driving-arena-panel [data-close]').click();
  await page.route('**/audi-a7.glb',route=>route.abort());
  await page.locator('.city-activity-dock button').filter({hasText:/Driving school|駕駛學校/}).click();
  const panel=page.locator('.driving-arena-panel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('[data-status]')).toContainText(/could not load|無法載入/);
  await expect(panel.locator('[data-run]')).toBeDisabled();
  await panel.locator('[data-city]').click();
  await expect(panel.locator('[data-routes]')).not.toBeEmpty();
  await panel.locator('[data-close]').click();await expect(panel).toBeHidden();
});

test('City sign, dock and general driving entry share the Audi school; capability cards preserve their model',async({page})=>{
  const {capabilities}=await import('./activity-helpers.mjs');
  const [cap]=capabilities(2);cap.id='selected-earlier';cap.name='Earlier machine two';
  await boot(page);
  await page.evaluate(cap=>localStorage.setItem('p5_city_capabilities_v1',JSON.stringify([{...cap,revision:1,name:'Earlier machine one'},cap])),cap);
  const sign=page.locator('.activity-entry').filter({hasText:'Driving school'});
  await expect(sign).toHaveCount(1);
  await page.evaluate(()=>{const site=window.__cityActivities.sites.find(s=>s.kind==='driving');window.__camOverride={pos:[site.x,30,site.z+50],target:[site.x,5,site.z-20]};});
  await expect(sign).toBeVisible();await sign.click();
  const arena=page.locator('.driving-arena-panel');await expect(arena).toBeVisible();
  await arena.locator('[data-close]').click();
  await page.locator('.city-activity-dock button').filter({hasText:'Driving school'}).click();await expect(arena).toBeVisible();
  await arena.locator('[data-close]').click();
  if(!await page.locator('#cap-btn').isVisible())await page.locator('#city-more>summary').click();await page.locator('#cap-btn').click();
  await page.locator('#cap-drive-btn').click();await expect(arena).toBeVisible();
  await arena.locator('[data-close]').click();if(!await page.locator('#cap-btn').isVisible())await page.locator('#city-more>summary').click();await page.locator('#cap-btn').click();
  await page.locator('[data-drive-cap="selected-earlier"][data-drive-revision="2"]').click();
  const old=page.locator('.city-activity-panel');await expect(old.locator('[data-status]')).toContainText('Earlier machine two');
  await expect(old.locator('[data-status]')).toContainText('r2');
  await old.locator('[data-act="step"]').click();
  expect(await page.evaluate(()=>window.__cityActivities.trial.cap.id)).toBe('selected-earlier');
  await expect(old.locator('[data-improve]')).toHaveAttribute('href',/drivingMode=legacy/);
});

test('dock opens Audi when no physical school fits',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('p5_city_planner_layout_v1',JSON.stringify({version:2,scaleMeters:2000,roads:[{width:2000,class:'primary',points:[[0,1000],[2000,1000]]}],buildings:[],parks:[]})));
  await boot(page);
  expect(await page.evaluate(()=>window.__cityActivities.sites.some(s=>s.kind==='driving'))).toBe(false);
  await page.locator('.city-activity-dock button').filter({hasText:'Driving school'}).click();
  await expect(page.locator('.driving-arena-panel')).toBeVisible();
  await expect(page.locator('.driving-school-launch')).toHaveCount(0);
});

test('earlier exercise returns to the saved machine and exercise without making a paired starter',async({page})=>{
  test.setTimeout(180000);
  await page.addInitScript(()=>{if(!localStorage.getItem('p5_city_planner_layout_v1'))localStorage.setItem('p5_city_planner_layout_v1',JSON.stringify({version:2,scaleMeters:2000,roads:[],buildings:[],parks:[]}));});
  await boot(page);
  await page.goto('/workshop/?skill=drive&drivingMode=legacy&exercise=light&publishTarget=city&hostInstanceId=city-driving-school-v1');
  await expect(page.locator('[data-skill="driving"]')).toHaveAttribute('aria-current','page');
  const identity=await page.evaluate(async()=>{const g=WorkshopGame;g.__setTableForTest(g.buildDriveTable({exercise:'light'}));await g.saveDrivingMachine();return {id:g.sourceMachineId(),model:g.publishDriveModel()};});
  await drivingControls(page);await page.locator('[data-drive-city]').click();
  await expect(page).toHaveURL(/city-builder.*drivingMode=legacy/);
  const old=page.locator('.city-activity-panel');await expect(old.locator('[data-status]')).toContainText('r1',{timeout:90000});
  await expect(old.locator('select').first()).toHaveValue('light');
  await expect(page.locator('.driving-arena-panel')).toBeHidden();
  await old.locator('[data-improve]').click();
  await expect(page.locator('[data-skill="driving"]')).toHaveAttribute('aria-current','page');
  expect(await page.evaluate(()=>WorkshopGame.sourceMachineId())).toBe(identity.id);
  expect(await page.evaluate(()=>WorkshopGame.publishDrivingPair())).toBeNull();
  expect(await page.evaluate(()=>WorkshopGame.publishDriveModel())).toEqual(identity.model);
  await drivingControls(page);await page.locator('[data-drive-city]').click();await expect(page).toHaveURL(/exercise=light/);
  await expect(old.locator('[data-status]')).toContainText('r1',{timeout:90000});
  await expect(old.locator('select').first()).toHaveValue('light');
  await old.locator('[data-improve]').click();await expect(page.locator('.skill-status')).toContainText('Earlier driving machine');
  await page.locator('[data-skill="free"]').click();await page.locator('[data-skill="driving"]').click();
  await expect(page.locator('[data-skill="driving"]')).toHaveAttribute('aria-current','page');await expect(page.locator('[data-skill="driving"]')).toBeEnabled();await drivingControls(page);await expect(page.locator('.driving-teacher')).toBeVisible();expect(await page.evaluate(()=>WorkshopGame.sourceMachineId())).not.toBe(identity.id);
  expect(await page.evaluate(async id=>{await WorkshopGame.openSavedMachine(id);return WorkshopGame.publishDriveModel();},identity.id)).toEqual(identity.model);
});

test('a steering correction changes the published decision and repairs the repeat',async({page})=>{
  test.setTimeout(180000);
  await page.addInitScript(()=>{if(!localStorage.getItem('p5_city_planner_layout_v1'))localStorage.setItem('p5_city_planner_layout_v1',JSON.stringify({version:2,scaleMeters:2000,roads:[],buildings:[],parks:[]}));});
  await page.goto('/workshop/?skill=drive&paired=1');
  await expect(page.locator('[data-skill="driving"]')).toHaveAttribute('aria-current','page');
  await page.evaluate(async()=>{await WorkshopGame.teachDrivingExamples('speed');await WorkshopGame.correctDrivingDecision('steering',{laneOffset:0,headingError:0,roadDirection:0,speed:0},'sharp-left');});
  await drivingControls(page);await page.locator('[data-drive-city]').click();
  const arena=page.locator('.driving-arena-panel');await expect(arena.locator('[data-run]')).toBeEnabled({timeout:90000});
  await arena.locator('[data-drill]').selectOption('straight');await expect(arena.locator('[data-run]')).toBeEnabled();
  await page.evaluate(()=>{const step=document.querySelector('.driving-arena-panel [data-step]');for(let i=0;i<2400&&!window.__drivingArena.state.outcome;i++)step.click();});
  expect(await page.evaluate(()=>window.__drivingArena.state.outcome)).toBe('off-road');
  await arena.locator('[data-replay]').fill('0');
  await arena.locator('summary',{hasText:'Sensors and influencing'}).click();
  await expect(arena.locator('[data-readings]')).toContainText('sharper left');
  await arena.locator('[data-improve]').click();
  await drivingControls(page);
  const box=page.locator('.skill-driving details').filter({has:page.locator('summary',{hasText:'Improve the recorded'})});
  await box.locator('summary').click();await box.locator('select').first().selectOption('steering');await box.locator('select').nth(1).selectOption('straight');await box.locator('button').click();
  await expect(page.locator('.skill-driving>[role="status"]')).toContainText('Taught.');
  await drivingControls(page);await page.locator('[data-drive-city]').click();await expect(arena.locator('[data-run]')).toBeEnabled({timeout:90000});
  await page.evaluate(()=>{const step=document.querySelector('.driving-arena-panel [data-step]');for(let i=0;i<2400&&!window.__drivingArena.state.outcome;i++)step.click();});
  expect(await page.evaluate(()=>window.__drivingArena.state.outcome)).toBe('arrived');
  await expect(arena.locator('[data-comparison]')).toContainText('left the road');await expect(arena.locator('[data-comparison]')).toContainText('arrived');
  await page.screenshot({path:'/private/tmp/driving-steering-improvement.png'});
});
