import {test,expect} from '@playwright/test';
const KEY='p5_city_planner_layout_v1';
async function boot(page){const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/city-builder/');await page.waitForTimeout(2000);await page.locator('#entry-local').click();await page.waitForFunction(()=>window.__city?.timeOfDay && document.querySelector('#loading.done'));await page.waitForLoadState('networkidle');return errors;}
test('every City Look keeps background, fog, and procedural sky colours finite',async({page})=>{
 test.setTimeout(180000);
 const errors=await boot(page);
 for(const id of ['toy-town','dawn','blue','azure','bluebird','clouds','overcast','golden','moonlit']){
  await page.locator('#city-look').click();
  await page.locator(`[data-look="${id}"]`).click();
  const colours=await page.evaluate(()=>{
   const finite=color=>Boolean(color?.isColor)&&[color.r,color.g,color.b].every(Number.isFinite);
   let sky;
   __city.scene.traverse(object=>{
    for(const material of (Array.isArray(object.material)?object.material:[object.material])){
     if(material?.uniforms?.horizon?.value&&material.uniforms?.zenith?.value)sky=material;
    }
   });
   return {background:__city.scene.background?.isTexture||finite(__city.scene.background),fog:finite(__city.scene.fog?.color),horizon:finite(sky?.uniforms.horizon.value),zenith:finite(sky?.uniforms.zenith.value)};
  });
  expect(colours).toEqual({background:true,fog:true,horizon:true,zenith:true});
 }
 expect(await page.evaluate(()=>localStorage.getItem('p5_city_look_v1'))).toBe('moonlit');
 expect(errors).toEqual([]);
});
test('four times render, cycle and persist without new model downloads or GPU growth',async({page},info)=>{
 test.setTimeout(240000);
 const errors=await boot(page);await page.evaluate(()=>window.__camOverride={pos:[1320,360,1420],target:[1000,0,1000]});
 await page.waitForFunction(()=>window.__city?.clouds?.getPresentationState);
 // Warm every existing pass/material before measuring repeated preset switches.
 for(const id of ['morning','day','sunset','night']){await page.evaluate(id=>__city.setTimeOfDay(id),id);await page.waitForFunction(()=>__city.timeOfDay.settled);const atmosphere=await page.evaluate(()=>{const terrain=[];__city.scene.traverse(o=>{if(!o.isMesh)return;for(const m of (Array.isArray(o.material)?o.material:[o.material]))if(m?.userData.grassSurface==='terrain')terrain.push({tint:m.userData.__uGrassDayTint?.value.getHex(),brightness:m.userData.__uGrassDayBrightness?.value});});return {clouds:__city.clouds.getPresentationState(),terrain:terrain[0]};});expect(atmosphere.clouds.cloudsVisible).toBe(true);expect(atmosphere.clouds.starCount).toBeGreaterThanOrEqual(180);if(id==='morning'||id==='day')expect(atmosphere.clouds.starVisibility).toBe(0);if(id==='sunset')expect(atmosphere.clouds.starVisibility).toBeGreaterThan(0);if(id==='sunset')expect(atmosphere.clouds.starVisibility).toBeLessThan(1);if(id==='night')expect(atmosphere.clouds.starVisibility).toBe(1);if(id==='day'){expect(atmosphere.terrain.tint).toBe(0x6aa447);expect(atmosphere.terrain.brightness).toBe(.16);}else{expect(atmosphere.terrain.tint).toBe(0xffffff);expect(atmosphere.terrain.brightness).toBe(0);}await page.screenshot({path:info.outputPath(`${id}.png`)});}
 // Aerial and street cameras both retain the same sky layer.
 for(const pos of [[1320,360,1420],[1020,7,1040]]){await page.evaluate(pos=>window.__camOverride={pos,target:[1000,0,1000]},pos);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));expect(await page.evaluate(()=>__city.clouds.getPresentationState().cloudsVisible)).toBe(true);}
 // Cosmetic GLBs are loaded through the bounded boot queue after the usable
 // city appears. Let that independent work settle before attributing requests
 // to the time-cycle control.
 await page.waitForFunction(()=>{const q=__city.loading?.queue?.();return !q||(!q.pending&&!q.active);});
 // Loader completion can queue a final GPU upload on the following frames.
 // Sample until texture/geometry counts have remained unchanged for 2 seconds
 // so this test measures the time switch, rather than late boot cleanup.
 await page.waitForFunction(()=>new Promise(resolve=>{let last='',same=0;const sample=()=>{const s=__city.renderStats||{};const next=`${s.textures}/${s.geometries}`;same=next===last?same+1:0;last=next;if(same>=10)resolve();else setTimeout(sample,200);};sample();}));
 const before=await page.evaluate(()=>({...__city.renderStats}));let glbs=0;page.on('request',r=>{if(r.url().includes('.glb'))glbs++;});
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.locator('#time-of-day').click();expect(await page.evaluate(()=>__city.timeOfDay.id)).toBe('morning');
 await page.evaluate(()=>{for(let i=0;i<11;i++)document.getElementById('time-of-day').click();});
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const after=await page.evaluate(()=>({...__city.renderStats}));expect(glbs).toBe(0);expect(after.textures).toBeLessThanOrEqual(before.textures);expect(after.geometries).toBeLessThanOrEqual(before.geometries);
 expect(await page.evaluate(()=>__city.timeOfDay.id)).toBe('night');expect(await page.evaluate(()=>localStorage.getItem('p5_city_time_v1'))).toBe('night');
 expect(await page.evaluate(()=>__city.parkLandscape.drawCalls)).toBeLessThanOrEqual(6);expect(errors).toEqual([]);
 await page.reload();await page.waitForTimeout(2000);await page.locator('#entry-local').click();await page.waitForFunction(()=>window.__city?.timeOfDay?.id==='night');
});
test('City Essentials starts with 24 models and bilingual search reaches the full catalogue',async({page},info)=>{
 const errors=await boot(page);await page.click('button[data-city-mode="decorate"]');await expect(page.locator('.prop-lib-tabs')).toHaveValue('essentials');await expect(page.locator('.prop-lib-card')).toHaveCount(24);
 const bounds=await page.locator('.prop-lib-card').first().evaluate(c=>{const r=c.getBoundingClientRect(),n=c.querySelector('.prop-lib-name').getBoundingClientRect(),img=c.querySelector('img').getBoundingClientRect();return {height:r.height,nameBottom:n.bottom,bottom:r.bottom,imageHeight:img.height};});expect(bounds.height).toBeGreaterThanOrEqual(180);expect(bounds.imageHeight).toBe(100);expect(bounds.nameBottom).toBeLessThan(bounds.bottom);
 await page.screenshot({path:info.outputPath('essentials.png')});
 await page.locator('.prop-lib-search').fill('橡樹');await expect(page.locator('.prop-lib-card')).toHaveCount(1);
 await page.locator('.prop-lib-search').fill('');await page.locator('.prop-lib-tabs').selectOption('all');expect(await page.locator('.prop-lib-card').count()).toBeGreaterThan(24);expect(errors).toEqual([]);
});
test('themed packs browse their full-library results instead of the Essentials shelf',async({page})=>{
 const errors=await boot(page);
 const expected=await page.evaluate(async()=>{
  const [{LIBRARY},{LIBRARY_PACKS,libraryByPack}]=await Promise.all([import('../city-common/library.js'),import('../city-common/asset-packs.js')]);
  return LIBRARY_PACKS.map(({id})=>({id,count:libraryByPack(LIBRARY,id).filter(item=>item.picker!==false).length}));
 });
 await page.click('button[data-city-mode="decorate"]');
 for(const {id,count} of expected){
  expect(count).toBeGreaterThan(0);
  await page.locator('.prop-lib-packs').selectOption(id);
  await expect(page.locator('.prop-lib-tabs')).toHaveValue('all');
  await expect(page.locator('.prop-lib-card')).toHaveCount(count);
 }
 expect(errors).toEqual([]);
});
test('planner scenery preference survives reload and the 3D handoff',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/planner/');await page.waitForSelector('#auto-scenery',{state:'attached'});if(await page.locator('#coach-modal').isVisible())await page.locator('#coach-modal button[data-coach-close]').first().click();await page.evaluate(()=>document.getElementById('planner-more').open=true);await expect(page.locator('#auto-scenery')).toBeChecked();
 await page.locator('#auto-scenery').uncheck();await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key))?.autoScenery===false,KEY);
 await page.reload();if(await page.locator('#coach-modal').isVisible())await page.locator('#coach-modal button[data-coach-close]').first().click();await expect(page.locator('#auto-scenery')).not.toBeChecked();
 await page.click('#btn-export');await page.waitForURL('**/city-builder/**');await page.waitForFunction(()=>window.__city?.streetLife && document.querySelector('#loading.done'));
 const result=await page.evaluate(()=>({off:__city.layout.autoScenery===false,spaces:__city.neighbourhood.spaces.length,landscape:__city.parkLandscape.drawCalls,nature:__city.natureScenery.instances,benches:__city.streetProps.getCount().benches,roads:__city.layout.roads.length}));
 expect(result.off).toBe(true);expect(result.spaces).toBe(0);expect(result.landscape).toBe(0);expect(result.nature).toBe(0);expect(result.benches).toBe(0);
 const saved=await page.evaluate(async()=>{const m=await import('../city-common/champion-file.js');return m.sanitizeChampionFile(m.composeChampionFile(m.collectState(),'Scenery off'));});expect(JSON.parse(saved.file.state.layout).autoScenery).toBe(false);expect(errors).toEqual([]);
});

test('five ground choices persist, while realistic parks stay Leafy Grass',async({page})=>{
 test.setTimeout(180000);
 const errors=await boot(page);
 await page.locator('#city-look').click();
 await page.locator('[data-look="golden"]').click();
 await page.locator('#ground-texture').click();
 await expect(page.locator('[data-ground-texture]')).toHaveCount(5);
 const surfaceMaps=()=>page.evaluate(()=>{
  const maps={};
  __city.scene.traverse(object=>{
   for(const material of (Array.isArray(object.material)?object.material:[object.material])){
    const surface=material?.userData?.grassSurface;
    if(surface&&!maps[surface])maps[surface]=material.map?.source?.data?.src || '';
   }
  });
  return maps;
 });
 await page.locator('[data-ground-texture="pavers"]').click();
 await page.waitForFunction(()=>localStorage.getItem('p5_city_ground_texture_v1')==='pavers');
 await expect.poll(surfaceMaps).toEqual(expect.objectContaining({terrain:expect.stringContaining('gravel_floor_03_diff_1k.jpg'),park:expect.stringContaining('leafy_grass_diff_1k.jpg')}));
 await page.locator('#ground-texture').click();
 await page.locator('[data-ground-texture="asphalt"]').click();
 await page.waitForFunction(()=>localStorage.getItem('p5_city_ground_texture_v1')==='asphalt');
 await expect.poll(surfaceMaps).toEqual(expect.objectContaining({terrain:expect.stringContaining('ground-asphalt.jpg'),park:expect.stringContaining('leafy_grass_diff_1k.jpg')}));
 await page.reload();await page.waitForTimeout(2000);await page.locator('#entry-local').click();
 await page.waitForFunction(()=>window.__city && localStorage.getItem('p5_city_ground_texture_v1')==='asphalt');
 await expect(page.locator('#ground-texture')).toHaveAttribute('aria-label','Ground Texture: City Asphalt.');
 expect(errors).toEqual([]);
});

test.describe('tablet presentation',()=>{
 test.use({hasTouch:true,viewport:{width:1024,height:768},deviceScaleFactor:1});
 test('park grass is usable at street level across all four times within tablet budgets',async({page},info)=>{
  test.setTimeout(180000);await page.addInitScript(()=>Object.defineProperty(navigator,'deviceMemory',{get:()=>4}));
  const modelErrors=[];page.on('requestfailed',r=>{if(/\.(?:glb|gltf)(?:\?|$)/.test(r.url()))modelErrors.push(r.url());});page.on('console',m=>{if(/nature-filler.*failed|WebGLProgram.*(?:error|invalid)/i.test(m.text()))modelErrors.push(m.text());});const errors=await boot(page);await page.waitForFunction(()=>window.__city?.clouds?.getPresentationState);
  await page.evaluate(()=>{const p=__city.layout.parks[0];window.__camOverride={pos:[p.cx+Math.min(24,p.radius*.7),7,p.cz+Math.min(30,p.radius*.85)],target:[p.cx,1,p.cz]};});
  for(const id of ['morning','day','sunset','night']){await page.evaluate(id=>__city.setTimeOfDay(id),id);await page.waitForFunction(()=>__city.timeOfDay.settled);expect(await page.evaluate(()=>__city.timeOfDay.id)).toBe(id);const sky=await page.evaluate(()=>__city.clouds.getPresentationState());expect(sky.cloudsVisible).toBe(true);expect(sky.starCount).toBeGreaterThanOrEqual(96);if(id==='morning'||id==='day')expect(sky.starVisibility).toBe(0);if(id==='sunset')expect(sky.starVisibility).toBeGreaterThan(0);if(id==='night')expect(sky.starVisibility).toBe(1);await page.screenshot({path:info.outputPath(`tablet-${id}.png`)});}
  const result=await page.evaluate(()=>{const grassBatches=__city.natureScenery.batches.filter(b=>b.userData.natureKind?.includes('grass'));return {draws:__city.parkLandscape.drawCalls,natureDraws:__city.natureScenery.drawCalls,triangles:__city.parkLandscape.group.children.reduce((n,m)=>n+(m.geometry.index?.count||m.geometry.attributes.position.count)/3,0)+__city.natureScenery.triangles,instances:__city.natureScenery.instances,grass:grassBatches.reduce((n,b)=>n+b.count,0),accents:__city.natureScenery.batches.filter(b=>!b.userData.natureKind?.includes('grass')).reduce((n,b)=>n+b.count,0),grassVertexColors:grassBatches.every(b=>b.userData.grassVertexColors&&!!b.geometry.getAttribute('color')&&b.material.every(m=>m.vertexColors&&m.side===2)),grassInstanceColors:grassBatches.every(b=>b.userData.grassInstanceColors&&!!b.instanceColor),budget:__city.citizens.getStats().budget};});
  expect(result.draws).toBeLessThanOrEqual(6);expect(result.natureDraws).toBeLessThanOrEqual(6);expect(result.triangles).toBeLessThanOrEqual(20000);expect(result.instances).toBeGreaterThan(0);expect(result.grass).toBeGreaterThan(result.accents);expect(result.grassVertexColors).toBe(true);expect(result.grassInstanceColors).toBe(true);expect(result.budget).toBeLessThanOrEqual(3);expect(modelErrors).toEqual([]);expect(errors).toEqual([]);
 });
});
