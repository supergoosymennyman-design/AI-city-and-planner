import {test,expect} from '@playwright/test';
async function boot(page) {
 page.on('response',r=>{if(r.status()>=400 && !r.url().includes('/api/'))console.log('HTTP',r.status(),r.url());});
 const errors=[];page.on('pageerror',e=>{console.log('PAGE ERROR',e.stack);errors.push(e.message);});page.on('console',m=>{if(m.type()==='error'&&!/404|api\//.test(m.text()))errors.push(m.text());});
 await page.goto('/city-builder/');await page.waitForTimeout(2500);await page.locator('#entry-local').click();
 await page.waitForFunction(()=>window.__city?.streetLife && document.querySelector('#loading.done'),null,{timeout:45000});
 // Citizens are the (deferred) crowd now — the robot population was removed.
 await page.waitForFunction(()=>window.__city?.citizens?.getStats().models>0,null,{timeout:45000});
 return errors;
}
test('dusk city: public spaces, paths and compact animated people',async({page},info)=>{
 const errors=await boot(page);
 await page.waitForTimeout(6000);
 console.log(await page.evaluate(()=>({nodes:__city.neighbourhood.nodes.length,edges:__city.neighbourhood.edges.length,spaces:__city.neighbourhood.spaces.length,crossings:__city.neighbourhood.crossings.length,humans:__city.citizens.getStats(),render:__city.renderStats})));
 const point=await page.evaluate(()=>{const a=__city.streetLife.actors.find(a=>a.kind==='human');return {x:a.x,z:a.z};});
 await page.evaluate(p=>{window.__camOverride={pos:[p.x+9,9,p.z+13],target:[p.x,1.5,p.z]};},point);
 await page.waitForFunction(()=>__city.citizens.getStats().animated>0);
 await page.waitForFunction(()=>__city.citizens.getStats().walkers>0,null,{timeout:20000});
 await page.screenshot({path:info.outputPath('foreground.png')});
 const stats=await page.evaluate(()=>({people:__city.citizens.getStats(),spaces:__city.neighbourhood.spaces.length,draws:__city.publicSpaces.drawCalls}));
 expect(stats.people.animated).toBeGreaterThan(0);expect(stats.people.animated).toBeLessThanOrEqual(12);expect(stats.spaces).toBeGreaterThan(0);
 await page.evaluate(()=>{window.__camOverride={pos:[1350,450,1480],target:[1000,0,1000]};});
 await page.waitForTimeout(500);await page.screenshot({path:info.outputPath('overview.png')});
 expect(errors).toEqual([]);
});
test.describe('older tablet',()=>{
 test.use({hasTouch:true,viewport:{width:1024,height:768},deviceScaleFactor:1});
 test('caps animation and decoration',async({page},info)=>{
  await page.addInitScript(()=>Object.defineProperty(navigator,'deviceMemory',{get:()=>4}));
  const errors=await boot(page);await page.waitForTimeout(5000);
  const result=await page.evaluate(()=>({spaces:__city.neighbourhood.spaces.length,draws:__city.publicSpaces.drawCalls,people:__city.citizens.getStats(),count:__city.citizens.getCount()}));
  expect(result.spaces).toBeLessThanOrEqual(6);expect(result.draws).toBeLessThanOrEqual(12);expect(result.people.budget).toBeLessThanOrEqual(3);expect(result.count).toBeLessThanOrEqual(72);
  await page.screenshot({path:info.outputPath('tablet.png')});expect(errors).toEqual([]);
 });
});

test('student placement displaces generated decoration without editing the city layout',async({page})=>{
 await boot(page);
 const original=await page.evaluate(()=>localStorage.getItem('p5_city_planner_layout_v1'));
 const space=await page.evaluate(()=>__city.neighbourhood.spaces[0]);
 await page.evaluate(s=>{window.__camOverride={pos:[s.x+8,16,s.z+18],target:[s.x,0,s.z]};},space);
 await page.waitForTimeout(500);
 await page.click('button[data-city-mode="decorate"]');await page.locator('.prop-lib-search').fill('bench');await page.locator('.prop-lib-card').first().click();
 await page.waitForFunction(()=>window.__propLibrary.isReadyToPlace());
 const screen=await page.evaluate(async s=>{const THREE=await import('three');const p=new THREE.Vector3(s.x,0,s.z).project(__city.camera),r=__city.renderer.domElement.getBoundingClientRect();return {clientX:r.left+(p.x+1)*r.width/2,clientY:r.top+(1-p.y)*r.height/2};},space);
 await page.locator('.prop-lib-overlay').dispatchEvent('pointermove',screen);await page.locator('.prop-lib-overlay').dispatchEvent('pointerdown',screen);
 await page.locator('[data-act="done"]').click();
 await page.waitForFunction(s=>__city.neighbourhood.spaces.every(p=>Math.hypot(p.x-s.x,p.z-s.z)>p.radius+2),space);
 expect(await page.evaluate(()=>__propLibrary.getCount())).toBe(1);
 expect(await page.evaluate(()=>localStorage.getItem('p5_city_planner_layout_v1'))).toBe(original);
 const saved=await page.evaluate(()=>JSON.parse(__propLibrary.snapshot()));expect(saved.props.length).toBe(1);
 // Repeated rebuilds dispose their owned geometry instead of accumulating it.
 // Baseline only AFTER the deferred boot queue drains and geometry is stable —
 // otherwise late-arriving scenery reads as a fake per-rebuild "leak".
 await page.waitForFunction(()=>{const q=__city.loading.queue();return q.pending===0&&q.running===0;},null,{timeout:120000});
 await page.waitForFunction(()=>new Promise(res=>{let last=-1,same=0;const s=()=>{const g=__city.renderStats.geometries;same=g===last?same+1:0;last=g;if(same>=8)res();else setTimeout(s,250);};s();}),null,{timeout:60000});
 const before=await page.evaluate(()=>__city.renderStats.geometries);
 for(let i=0;i<3;i++){
  await page.evaluate(({space,i})=>{window.__oldNeighbourhood=__city.neighbourhood;__propLibrary.moveProp(JSON.parse(__propLibrary.snapshot()).props[0].id,space.x+i+.5,space.z,0);},{space,i});
  await page.waitForFunction(()=>__city.neighbourhood!==window.__oldNeighbourhood);
 }
 await page.waitForTimeout(500);expect(await page.evaluate(()=>__city.renderStats.geometries)).toBeLessThanOrEqual(before+2);
});
test('missing optional animation models keep a usable static crowd',async({page})=>{
 await page.route('**/assets/models/citizens/*.glb',route=>route.abort());
 const errors=await boot(page);await page.waitForTimeout(3000);
 const stats=await page.evaluate(()=>__city.citizens.getStats());expect(stats.instances).toBeGreaterThan(0);expect(stats.animated).toBe(0);
 expect(errors.filter(e=>!e.includes('ERR_FAILED'))).toEqual([]);
});
test('reduced motion skips skeletal downloads and keeps decorative actors stationary',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});const requests=[];page.on('request',r=>{if(r.url().includes('/models/citizens/'))requests.push(r.url());});
 await boot(page);const before=await page.evaluate(()=>__city.streetLife.actors.map(a=>[a.x,a.z]));await page.waitForTimeout(1500);
 expect(await page.evaluate(()=>__city.streetLife.actors.map(a=>[a.x,a.z]))).toEqual(before);expect(requests).toEqual([]);
});

test('street life and public spaces recover after WebGL context restoration',async({page})=>{
 const errors=await boot(page);
 await page.evaluate(()=>{
  const renderer=__city.renderer;
  window.__contextTest={saved:localStorage.getItem('p5_city_planner_layout_v1'),restored:false};
  renderer.domElement.addEventListener('webglcontextrestored',()=>{window.__contextTest.restored=true;},{once:true});
  renderer.forceContextLoss();
 });
 await expect(page.getByText('The city paused — your device is catching its breath.',{exact:false})).toBeVisible();
 await page.evaluate(()=>{__city.renderStats={calls:0};__city.renderer.forceContextRestore();});
 await page.waitForFunction(()=>window.__contextTest.restored && __city.renderStats.calls>0);
 await expect(page.getByText('The city paused — your device is catching its breath.',{exact:false})).toHaveCount(0);
 expect(await page.evaluate(()=>localStorage.getItem('p5_city_planner_layout_v1')===window.__contextTest.saved && __city.citizens.getCount()>0 && __city.publicSpaces.group.parent!==null)).toBe(true);
 expect(errors).toEqual([]);
});
