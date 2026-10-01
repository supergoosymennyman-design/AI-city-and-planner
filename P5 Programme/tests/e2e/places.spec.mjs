import {test,expect} from '@playwright/test';
import {boot,enterPlace} from './activity-helpers.mjs';
test('Lab frontage, Places travel, shared entry and six destinations on desktop/tablet',async({page})=>{
 test.setTimeout(360000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('p5_city_planner_layout_v1',JSON.stringify({version:2,scaleMeters:500,roads:[],buildings:[{type:'recycling',pos:[250,250],footprint:[24,20],height:36}],parks:[]})));
 await boot(page);
 expect(await page.locator('.city-activity-dock,.activity-entry').count()).toBe(0);
 const site=await page.evaluate(()=>window.__cityActivities.sites.find(s=>s.kind==='recycling'));expect(site.generated).toBe(false);expect(site.lab.pos).toEqual([250,250]);
 await expect.poll(()=>page.evaluate(()=>!!window.__scene.getObjectByName('recycling-lab-truck'))).toBe(true);
 expect(await page.evaluate(()=>{
  const truck=window.__scene.getObjectByName('recycling-lab-truck'),site=window.__cityActivities.sites.find(s=>s.kind==='recycling');
  // All mesh vertices remain inside the reserved forecourt, away from arrival.
  let clear=true;truck.updateWorldMatrix(true,true);truck.traverse(mesh=>{
   const position=mesh.geometry?.attributes.position;if(!position)return;
   const point=window.__city.champion.state.pos.clone();
   for(let i=0;i<position.count;i++){point.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld);
    if(Math.abs(point.x-site.x)>site.w/2||Math.abs(point.z-site.z)>site.d/2||Math.hypot(point.x-site.arrival.x,point.z-site.arrival.z)<3)clear=false;}
  });return clear;
 })).toBe(true);
 await page.locator('#city-workspaces summary').click();await page.locator('[data-destination="recycling"]').click();
 await expect(page.locator('#quest-prompt')).toBeVisible();await expect(page.locator('.city-activity-panel')).toBeHidden();
 expect(await page.evaluate(()=>{const c=window.__city.champion;return Math.hypot(c.state.pos.x-window.__cityActivities.sites[0].arrival.x,c.state.pos.z-window.__cityActivities.sites[0].arrival.z);})).toBeLessThan(1);
 await page.locator('#quest-prompt-btn').click();await expect(page.locator('.city-activity-panel')).toBeVisible();await expect(page.locator('#quest-prompt')).toBeHidden();
 await expect(page.locator('.city-activity-panel')).toHaveAttribute('data-state','ready');
 await page.screenshot({path:'/private/tmp/recycling-lab-desktop.png'});
 await page.locator('[data-act="close"]').click();await enterPlace(page,'recycling');await page.locator('[data-act="close"]').click();
 await page.evaluate(()=>{for(const id of ['garden','energy'])window.__cityDestinations.register({id,labels:{en:id==='garden'?'Garden Lab':'Energy Lab',zh:id==='garden'?'花園實驗室':'能源實驗室'},available:false,enter(){}});});
 for(const lang of ['en','zh-Hant'])for(const viewport of [{width:1280,height:800},{width:834,height:1112}]){
  if(await page.locator('html').getAttribute('lang')!==lang)await page.locator('#lang-toggle').click();
  await page.setViewportSize(viewport);await page.locator('#city-workspaces summary').focus();await page.keyboard.press('Enter');await expect(page.locator('#city-workspaces')).toHaveAttribute('open','');await expect(page.locator('[data-destination]')).toHaveCount(6);
  await expect(page.locator('[data-destination="recycling"]')).toContainText(lang==='en'?'Go to site':'前往地點');
  await page.locator('#city-workspaces nav a').last().scrollIntoViewIfNeeded();
  expect(await page.locator('#city-workspaces nav').evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
  await page.locator('[data-destination="recycling"]').scrollIntoViewIfNeeded();
  expect(await page.locator('[data-destination="energy"]').evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  await page.screenshot({path:`/private/tmp/places-${viewport.width}-${lang}.png`});await page.keyboard.press('Escape');await expect(page.locator('#city-workspaces summary')).toBeFocused();
 }
 expect(errors).toEqual([]);
});
test('blocked Lab uses practice venue and older batch handoff mounts after boot',async({page})=>{
 test.setTimeout(180000);
 await page.addInitScript(()=>localStorage.setItem('p5_city_planner_layout_v1',JSON.stringify({version:2,scaleMeters:200,roads:[{points:[[0,80],[200,80]],width:20}],buildings:[{type:'recycling',pos:[100,100],footprint:[24,20],height:36}],parks:[]})));
 await boot(page);await page.locator('#city-workspaces summary').click();await expect(page.locator('[data-destination="recycling"]')).toContainText('Open practice venue');await page.locator('[data-destination="recycling"]').click();await expect(page.locator('[data-venue-note]')).toContainText('practice venue');await expect(page.locator('.city-activity-panel')).toHaveAttribute('data-state','ready');await page.locator('[data-act="close"]').click();
 await page.goto('/city-builder/?batch=old');if(await page.locator('#entry-local').isVisible())await page.locator('#entry-local').click();await expect(page.locator('.city-activity-panel')).toBeVisible({timeout:90000});
});

test('travel cancels walking, flying and driving, revalidates approach, and collides with equipment',async({page})=>{
 test.setTimeout(180000);await boot(page);
 await page.evaluate(()=>window.__focusedCityUI.setMode('decorate',{openLibrary:false}));
 await page.evaluate(()=>window.__city.sim.walkTo({type:'recycling',pos:[1200,1200]}));
 await page.evaluate(()=>window.__travelToDestination('recycling'));
 expect(await page.evaluate(()=>({mode:window.__focusedCityUI.mode,walking:window.__city.navigation.walking}))).toEqual({mode:'explore',walking:false});
 await page.locator('#btn-taxi').click();await expect(page.locator('#btn-flyup')).toBeVisible();
 await page.evaluate(()=>window.__city.sim.flyTo({type:'recycling',pos:[1400,1400],height:36}));
 await page.evaluate(()=>window.__travelToDestination('recycling'));
 await expect(page.locator('#btn-flyup')).toBeHidden();
 expect(await page.evaluate(()=>({riding:window.__city.navigation.riding,flying:window.__city.navigation.flying,grounded:window.__city.champion.state.isGrounded}))).toEqual({riding:false,flying:false,grounded:true});
 await page.locator('#city-more summary').click();await page.locator('#more-drive').click();await page.locator('.drive-card').first().click();
 await expect.poll(()=>page.evaluate(()=>window.__city.navigation.driving)).toBe(true);
 await page.evaluate(()=>window.__travelToDestination('recycling'));
 expect(await page.evaluate(()=>window.__city.navigation.driving)).toBe(false);
 expect(await page.evaluate(()=>window.__city.champion.group.visible)).toBe(true);
 // A newly blocked preferred approach is retried nearby; an entirely blocked
 // approach fails without changing position. The pure helper is also unit-tested.
 const result=await page.evaluate(()=>{
  const e=window.__cityDestinations.all().find(e=>e.id==='recycling'),lab=window.__cityActivities.sites.find(s=>s.kind==='recycling').lab,original={...e.arrival};
  e.arrival={x:lab.pos[0],z:lab.pos[1]-lab.footprint[1]/2+2};
  const searched=window.__travelToDestination('recycling'),pos=window.__city.champion.state.pos.clone();
  e.arrival={x:lab.pos[0],z:lab.pos[1]};const failed=window.__travelToDestination('recycling');
  const unchanged=pos.distanceTo(window.__city.champion.state.pos)===0;e.arrival=original;
  return {searched,failed,unchanged};
 });expect(result).toEqual({searched:true,failed:false,unchanged:true});
 const collision=await page.evaluate(()=>{
  const site=window.__cityActivities.sites.find(s=>s.kind==='recycling'),solid=site.solids[0],champion=window.__city.champion;
  champion.landAt(solid.x,solid.z);return {x:solid.x,z:solid.z};
 });await expect.poll(()=>page.evaluate(p=>Math.hypot(window.__city.champion.state.pos.x-p.x,window.__city.champion.state.pos.z-p.z),collision)).toBeGreaterThan(1);
});

test('missing Lab model retains generated fallback, safe arrival and unchanged saved layout',async({page})=>{
 test.setTimeout(180000);await page.route('**/mission/recycling.glb',route=>route.abort());await boot(page);
 const saved=await page.evaluate(()=>localStorage.getItem('p5_city_planner_layout_v1'));
 expect(await page.evaluate(()=>window.__cityActivities.sites.find(s=>s.kind==='recycling').generated)).toBe(true);
 expect(await page.evaluate(()=>!!window.__scene.getObjectByName('recycling-lab-fallback'))).toBe(true);
 await enterPlace(page,'recycling');await expect(page.locator('.city-activity-panel')).toHaveAttribute('data-state','ready');
 await page.locator('[data-act="close"]').click();expect(await page.evaluate(()=>localStorage.getItem('p5_city_planner_layout_v1'))).toBe(saved);
});
