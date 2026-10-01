import { test, expect } from '@playwright/test';
import { boot, enterPlace } from './activity-helpers.mjs';

async function drivingControls(page) {
  await expect(page.locator('[data-skill="driving"]')).toBeEnabled();
  await expect(page.locator('[data-drive-city]')).toBeVisible();
}

test('Driving School free view orbits and restores the City camera',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('p5_city_planner_layout_v1',JSON.stringify({version:2,scaleMeters:2000,roads:[],buildings:[],parks:[]})));
  await boot(page);
  const panel=page.locator('.driving-arena-panel');
  await page.evaluate(()=>{const root=window.__cityActivities.drivingSite?.group.parent;if(root)root.rotation.y=.7;});
  await page.route('**/audi-a7.glb',route=>route.abort());
  const before=await page.evaluate(()=>{const c=window.__city.camera,canvas=window.__city.renderer.domElement;const state={position:c.position.toArray(),quaternion:c.quaternion.toArray(),touchAction:canvas.style.touchAction};window.__cityActivities.open('driving');return state;});
  await expect(panel).toBeVisible();
  const view=()=>page.evaluate(()=>({position:window.__city.camera.position.toArray()}));
  await panel.locator('[data-camera]').selectOption('overhead');
  await expect.poll(async()=>((await view()).position[1])).toBeGreaterThan(20);
  const canvas=page.locator('canvas').first(),box=await canvas.boundingBox();
  await page.mouse.move(box.x+box.width*.7,box.y+box.height*.5);
  await page.mouse.down();await page.mouse.move(box.x+box.width*.85,box.y+box.height*.63,{steps:5});await page.mouse.up();
  await expect(panel.locator('[data-camera]')).toHaveValue('free');
  const dragged=await view();
  await page.mouse.wheel(0,-450);
  await expect.poll(async()=>JSON.stringify((await view()).position)).not.toBe(JSON.stringify(dragged.position));
  await panel.locator('[data-camera]').selectOption('route');
  await expect(panel.locator('[data-camera]')).toHaveValue('route');
  await panel.locator('[data-camera]').selectOption('chase');
  await expect(panel.locator('[data-camera]')).toHaveValue('chase');
  const cdp=await page.context().newCDPSession(page),cx=box.x+box.width*.7,cy=box.y+box.height*.5;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx,y:cy,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx+90,y:cy+45,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect(panel.locator('[data-camera]')).toHaveValue('free');
  const beforePinch=await view();
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx-40,y:cy,id:1},{x:cx+40,y:cy,id:2}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx-100,y:cy,id:1},{x:cx+100,y:cy,id:2}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect.poll(async()=>JSON.stringify((await view()).position)).not.toBe(JSON.stringify(beforePinch.position));
  await cdp.detach();
  const after=await page.evaluate(()=>{document.querySelector('.driving-arena-panel [data-close]').click();const c=window.__city.camera;return {position:c.position.toArray(),quaternion:c.quaternion.toArray(),touchAction:window.__city.renderer.domElement.style.touchAction};});
  expect(after).toEqual(before);
});

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
    await page.locator(`[data-controller="${role}"]`).click();
    await page.locator(`[data-teach-driving="${role}"]`).click();
    await expect(page.locator(`[data-teach-driving="${role}"]`).locator('..').locator('[role="status"]')).toContainText('Taught');
  }
  await drivingControls(page);await page.locator('.driving-teacher summary').click();
  await page.evaluate(async()=>{const {schoolScenario,createDrivingSession,readingsAt}=await import('/city-common/driving-simulation.js');const scenario=schoolScenario('right',503);const session=createDrivingSession(scenario,{decide(){}});await WorkshopGame.correctDrivingDecision('speed',readingsAt(scenario,session.snapshot().car,0),'stop');});
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
  await page.evaluate(async()=>{const step=document.querySelector('.driving-arena-panel [data-step]');if(!window.__drivingArena.state.attemptStarted){step.click();while(!window.__drivingArena.state.attemptStarted)await new Promise(resolve=>setTimeout(resolve,20));}for(let i=0;i<2400&&!window.__drivingArena.state.outcome;i++)step.click();});
  await expect(panel.locator('[data-status]')).toContainText('time limit');
  const evidence=await page.evaluate(async()=>{const {createProjectStore}=await import('/city-common/project-store.js');const store=createProjectStore();await store.openActiveProject();const s=await store.readSection('driving');store.close();return s.attempts.at(-1);});
  expect(evidence.passed).toBe(false);expect(evidence.car).toEqual(evidence.records[0].before);expect(evidence.revision).toBe(1);expect(evidence.interventions.map(i=>i.reason)).toEqual(['timeout']);
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
  await page.evaluate(async()=>{const step=document.querySelector('.driving-arena-panel [data-step]');if(!window.__drivingArena.state.attemptStarted){step.click();while(!window.__drivingArena.state.attemptStarted)await new Promise(resolve=>setTimeout(resolve,20));}for(let i=0;i<2400&&!window.__drivingArena.state.outcome;i++)step.click();});
  await expect(panel.locator('[data-comparison]')).toContainText('arrived');
  await expect(panel.locator('[data-comparison]')).toContainText('time limit');
  await page.screenshot({path:'/private/tmp/driving-improved-comparison.png'});
  await panel.locator('[data-new]').click();await expect(panel.locator('[data-run]')).toBeEnabled();
  expect(await page.evaluate(()=>window.__drivingArena.state.practice)).toBe(false);
  await page.evaluate(async()=>{const step=document.querySelector('.driving-arena-panel [data-step]');if(!window.__drivingArena.state.attemptStarted){step.click();while(!window.__drivingArena.state.attemptStarted)await new Promise(resolve=>setTimeout(resolve,20));}for(let i=0;i<2400&&!window.__drivingArena.state.outcome;i++)step.click();});
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
    const done=await page.evaluate(async()=>{const step=document.querySelector('.driving-arena-panel [data-step]');if(!window.__drivingArena.state.attemptStarted){step.click();while(!window.__drivingArena.state.attemptStarted)await new Promise(resolve=>setTimeout(resolve,20));}for(let i=0;i<50&&!window.__drivingArena.state.outcome;i++)step.click();return !!window.__drivingArena.state.outcome;});
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
  await boot(page);await enterPlace(page,'driving');
  const panel=page.locator('.driving-arena-panel');
  await expect(panel.locator('h2')).toContainText('駕駛');
  await expect.poll(()=>page.evaluate(()=>window.__drivingArena.state.loaded)).toBe(true);
  const bounds=await panel.boundingBox();expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(1024);
  await page.screenshot({path:'/private/tmp/driving-arena-tablet-zh.png'});
  await page.setViewportSize({width:1280,height:800});await page.screenshot({path:'/private/tmp/driving-arena-desktop-zh.png'});
  await page.evaluate(async()=>{const {createProjectStore}=await import('/city-common/project-store.js');const store=createProjectStore();await store.openActiveProject();await store.createProject('Another city');store.close();});
  await expect(panel).toBeHidden();
});

test('arena entry remains available and asset failure disables driving',async({page})=>{
  await boot(page);
  await page.evaluate(async()=>{const {createProjectStore}=await import('/city-common/project-store.js');const s=createProjectStore();await s.openActiveProject();await s.mutate(p=>{p.projects.driving={bundles:{},installed:'missing@1',attempts:[]};return p;});s.close();});
  await enterPlace(page,'driving');
  await expect(page.locator('.driving-arena-panel [data-status]')).toContainText('Repair the latest saved machine');
  await page.locator('.driving-arena-panel [data-close]').click();
  await page.route('**/audi-a7.glb',route=>route.abort());
  await enterPlace(page,'driving');
  const panel=page.locator('.driving-arena-panel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('[data-status]')).toContainText(/could not load|無法載入/);
  await expect(panel.locator('[data-run]')).toBeDisabled();
  await page.unroute('**/audi-a7.glb');await panel.locator('[data-repeat]').click();
  await expect.poll(()=>page.evaluate(()=>window.__drivingArena.state.loaded)).toBe(true);
  await panel.locator('[data-city]').click();
  await expect(panel.locator('[data-routes]')).not.toBeEmpty();
  await panel.locator('[data-close]').click();await expect(panel).toBeHidden();
});

test('Places, nearby prompt and general driving entry share the Audi school; capability cards preserve their model',async({page})=>{
  const {capabilities}=await import('./activity-helpers.mjs');
  const [cap]=capabilities(2);cap.id='selected-earlier';cap.name='Earlier machine two';
  await boot(page);
  await page.evaluate(cap=>localStorage.setItem('p5_city_capabilities_v1',JSON.stringify([{...cap,revision:1,name:'Earlier machine one'},cap])),cap);
  expect(await page.evaluate(()=>window.__travelToDestination('driving'))).toBe(true);
  await expect(page.locator('#quest-prompt')).toBeVisible();
  await expect(page.locator('#quest-prompt-label')).toContainText('Driving School');
  await page.locator('#quest-prompt-btn').click();
  const arena=page.locator('.driving-arena-panel');await expect(arena).toBeVisible();
  await arena.locator('[data-close]').click();
  await enterPlace(page,'driving');await expect(arena).toBeVisible();
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

test('Places opens the practice venue when no physical school fits',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('p5_city_planner_layout_v1',JSON.stringify({version:2,scaleMeters:2000,roads:[{width:2000,class:'primary',points:[[0,1000],[2000,1000]]}],buildings:[],parks:[]})));
  await boot(page);
  expect(await page.evaluate(()=>window.__cityActivities.sites.some(s=>s.kind==='driving'))).toBe(false);
  await enterPlace(page,'driving');
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
  await page.evaluate(async()=>{const step=document.querySelector('.driving-arena-panel [data-step]');if(!window.__drivingArena.state.attemptStarted){step.click();while(!window.__drivingArena.state.attemptStarted)await new Promise(resolve=>setTimeout(resolve,20));}for(let i=0;i<2400&&!window.__drivingArena.state.outcome;i++)step.click();});
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
  await page.evaluate(async()=>{const step=document.querySelector('.driving-arena-panel [data-step]');if(!window.__drivingArena.state.attemptStarted){step.click();while(!window.__drivingArena.state.attemptStarted)await new Promise(resolve=>setTimeout(resolve,20));}for(let i=0;i<2400&&!window.__drivingArena.state.outcome;i++)step.click();});
  expect(await page.evaluate(()=>window.__drivingArena.state.outcome)).toBe('arrived');
  await expect(arena.locator('[data-comparison]')).toContainText('left the road');await expect(arena.locator('[data-comparison]')).toContainText('arrived');
  await page.screenshot({path:'/private/tmp/driving-steering-improvement.png'});
});

test('permanent school transforms trials and restores its preview through lifecycle changes',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await boot(page);
  const {createRequire}=await import('node:module');const game=createRequire(import.meta.url)('../../buddy-kit/client/workshop/game.js');
  const models=game.publishDrivingPair(game.buildDrivingPairTable({train:true}));
  await page.evaluate(async models=>{const {createProjectStore}=await import('/city-common/project-store.js');const {publishDrivingRevision}=await import('/city-common/driving-project.js');const store=createProjectStore();await store.openActiveProject();await store.mutate(p=>{publishDrivingRevision(p,'placement-check',models);return p;});store.close();},models);
  const panel=page.locator('.driving-arena-panel');
  for(const placement of [[350,500,0],[750,900,.7]]){
    await page.evaluate(([x,z,yaw])=>{const root=window.__cityActivities.drivingSite.group.parent;root.position.set(x,.05,z);root.rotation.y=yaw;},placement);
    await enterPlace(page,'driving');
    await expect.poll(()=>page.evaluate(()=>window.__drivingArena.state.loaded)).toBe(true);
    expect(await panel.locator('[data-camera]').inputValue()).toBe('chase');
    for(const drill of ['mixed','right','signal']){
      await panel.locator('[data-drill]').selectOption(drill);
      await expect.poll(()=>page.evaluate(()=>window.__drivingArena.state.loaded)).toBe(true);
      await panel.locator('[data-step]').click();
      const check=await page.evaluate(async drill=>{
        const THREE=await import('three');const {schoolScenario,pointAt,worldAt}=await import('/city-common/driving-simulation.js');
        const a=window.__drivingArena,site=a.site; a.update(0);
        const trial=site.group.getObjectByName('bounded-driving-trial'),car=trial.getObjectByName('driving-audi'),scenario=schoolScenario(drill,71),p=a.state.car;
        const expected=site.group.localToWorld(new THREE.Vector3(p.x,.15,p.z));
        const actual=car.getWorldPosition(new THREE.Vector3());
        const world=worldAt(scenario,a.state.t);const actors=world.obstacles.filter(o=>o.actorId!==undefined).map(p=>trial.getObjectByName('trial-actor-'+p.actorId).getWorldPosition(new THREE.Vector3()).distanceTo(site.group.localToWorld(new THREE.Vector3(p.x,.8,p.z))));const lamp=trial.getObjectByName('trial-signal');
        return {actors:actors.every(d=>d<1e-8),light:!lamp||lamp.userData.lenses.every((lens,i)=>lens.material.color.getHex()===(i===world.signal?[0x62bc7a,0xe5b143,0xe15b47][i]:0x435052)),distance:actual.distanceTo(expected),cars:site.group.children.filter(c=>c.name==='driving-audi'&&c.visible).length,roads:site.group.getObjectByName('permanent-course-road').userData.segments,trials:site.group.children.filter(c=>c.name==='bounded-driving-trial').length};
      },drill);
      expect(check).toEqual({actors:true,light:true,distance:0,cars:0,roads:190,trials:1});
      if(placement[2]&&drill==='mixed'){
        await panel.locator('[data-camera]').selectOption('free');
        const cameraAndCar=()=>page.evaluate(()=>{const a=window.__drivingArena;a.update(0);const camera=window.__city.camera,car=a.site.group.getObjectByName('bounded-driving-trial').getObjectByName('driving-audi');return {camera:camera.position.toArray(),car:car.getWorldPosition(camera.position.clone()).toArray()};});
        const parked=await cameraAndCar();
        await page.evaluate(async()=>{const step=document.querySelector('.driving-arena-panel [data-step]');if(!window.__drivingArena.state.attemptStarted){step.click();while(!window.__drivingArena.state.attemptStarted)await new Promise(resolve=>setTimeout(resolve,20));}for(let i=0;i<20;i++)step.click();});
        const driving=await cameraAndCar();
        expect(driving.car).not.toEqual(parked.car);
        await panel.locator('[data-pause]').click();
        await panel.locator('[data-replay]').fill('0');
        const replaying=await cameraAndCar();
        for(const view of [driving,replaying])for(let axis=0;axis<3;axis++)expect(view.camera[axis]-view.car[axis]).toBeCloseTo(parked.camera[axis]-parked.car[axis],3);
        await expect(panel.locator('[data-camera]')).toHaveValue('free');
      }
    }
    await panel.locator('[data-camera]').selectOption('route');
    await page.screenshot({path:`/private/tmp/permanent-school-${placement[0]}.png`});
    await panel.locator('[data-close]').click();
    await expect.poll(()=>page.evaluate(()=>window.__cityActivities.drivingSite.group.children.filter(c=>c.name==='driving-audi'&&c.visible).length)).toBe(1);
    expect(await page.evaluate(()=>window.__cityActivities.drivingSite.group.getObjectByName('bounded-driving-trial')===undefined)).toBe(true);
  }
  // A late Audi response must not recreate a closed trial.
  let release,seen,handled;const gate=new Promise(resolve=>release=resolve),requested=new Promise(resolve=>seen=resolve),finished=new Promise(resolve=>handled=resolve);
  await page.route('**/audi-a7.glb',async route=>{seen();await gate;await route.continue();handled();});
  await enterPlace(page,'driving');
  await requested;await panel.locator('[data-close]').click();release();await finished;await page.unroute('**/audi-a7.glb');
  await enterPlace(page,'driving');
  await expect.poll(()=>page.evaluate(()=>window.__drivingArena.state.loaded)).toBe(true);
  await page.evaluate(()=>document.querySelector('canvas').dispatchEvent(new Event('webglcontextlost')));
  await expect(panel).toBeHidden();expect(errors).toEqual([]);
});

test('saved unversioned geometry replays in compatibility venue with its original revision',async({page})=>{
  const {createRequire}=await import('node:module');const game=createRequire(import.meta.url)('../../buddy-kit/client/workshop/game.js');
  const models=game.publishDrivingPair(game.buildDrivingPairTable({train:true}));
  await boot(page);
  const original=await page.evaluate(async models=>{
    const {createProjectStore}=await import('/city-common/project-store.js');const {publishDrivingRevision,installedDrivingPair,recordDrivingAttempt}=await import('/city-common/driving-project.js');
    const {buildTrack}=await import('/city-common/driving.js');const {createDrivingSession}=await import('/city-common/driving-simulation.js');
    const store=createProjectStore();await store.openActiveProject();
    const scenario={kind:'straight',seed:71,track:buildTrack({points:[[0,0],[0,120]],width:7}),actors:[],startOffset:0};
    let evidence;await store.mutate(p=>{publishDrivingRevision(p,'archive',models);const s=createDrivingSession(scenario,installedDrivingPair(p.projects.driving));while(!s.snapshot().outcome)s.step();evidence=s.evidence();recordDrivingAttempt(p,evidence);return p;});store.close();return evidence;
  },models);
  const panel=page.locator('.driving-arena-panel');
  await enterPlace(page,'driving');
  await expect(panel.locator('[data-run]')).toBeEnabled();
  await panel.locator('summary',{hasText:'Compare with a saved trial'}).click();await panel.locator('[data-watch-saved]').click();
  await expect(panel.locator('[data-session]')).toContainText('compatibility venue');
  await expect.poll(()=>page.evaluate(()=>window.__drivingArena.state.loaded)).toBe(true);
  await expect(panel.locator('[data-run]')).toBeDisabled();
  await panel.locator('[data-replay]').fill('10');
  await panel.locator('summary',{hasText:'Sensors and influencing'}).click();
  await expect(panel.locator('[data-readings]')).toContainText(original.records[10].pose.z.toFixed(1));
  expect(await page.evaluate(()=>window.__drivingArena.site)).toBeNull();
  expect(await page.evaluate(()=>window.__drivingArena.state.revision)).toBe(original.revision);
  await panel.locator('[data-repeat-saved]').click();await expect(panel.locator('[data-run]')).toBeEnabled();
  await expect(panel.locator('[data-session]')).toContainText('compatibility venue');
  await panel.locator('[data-run]').click();
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  expect(await page.evaluate(()=>window.__drivingArena.state.running)).toBe(false);
  await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
  expect(await page.evaluate(()=>window.__drivingArena.state.running)).toBe(false);
});
