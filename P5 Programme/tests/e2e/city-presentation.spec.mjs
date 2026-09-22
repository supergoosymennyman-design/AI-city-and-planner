import {test,expect} from '@playwright/test';
const KEY='p5_city_planner_layout_v1';
async function boot(page){const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/city-builder/');await page.waitForTimeout(2000);await page.locator('#entry-local').click();await page.waitForFunction(()=>window.__city?.timeOfDay && document.querySelector('#loading.done'));await page.waitForLoadState('networkidle');return errors;}
test('example launch resets and selects its Natural Asphalt Sunset appearance',async({page},info)=>{
 await page.addInitScript(()=>{
  localStorage.setItem('p5_city_look_v1','future');
  localStorage.setItem('p5_city_day_sky_v1','calm-overcast');
  localStorage.setItem('p5_city_ground_texture_v1','withered');
  localStorage.setItem('p5_city_time_v1','night');
 });
 const errors=await boot(page);
 expect(await page.evaluate(()=>({
  style:localStorage.getItem('p5_city_look_v1'),sky:localStorage.getItem('p5_city_day_sky_v1'),
  ground:localStorage.getItem('p5_city_ground_texture_v1'),time:localStorage.getItem('p5_city_time_v1'),
 }))).toEqual({style:'natural',sky:'natural-blue',ground:'asphalt',time:'sunset'});
 await page.locator('#appearance-toggle').click();
 await expect(page.locator('[data-style="natural"]')).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('[data-day-sky="natural-blue"]')).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('[data-ground="asphalt"]')).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('[data-time="sunset"]')).toHaveAttribute('aria-pressed','true');
 const parkSurface=await page.evaluate(()=>{
  let treatment=null,map='';
  __city.scene.traverse(object=>{for(const material of (Array.isArray(object.material)?object.material:[object.material]))if(material?.userData?.grassSurface==='park'){
   treatment ||= material.userData.grassPbrTreatment;map ||= material.map?.image?.src||'';
  }});
  const park=__city.layout.parks[0];window.__camOverride={pos:[park.cx,260,park.cz+430],target:[park.cx,0,park.cz]};
  return {treatment,map};
 });
 expect(parkSurface.treatment).toEqual(expect.objectContaining({albedoMix:.18,tint:'#ffffff',tintStrength:0}));
 expect(parkSurface.map).toContain('leafy_grass_diff_1k.jpg');
 await page.locator('.appearance-heading button').click();
 await page.waitForTimeout(1000);
 await page.screenshot({path:info.outputPath('example-sunset-desktop.png')});
 await page.setViewportSize({width:820,height:1180});await page.waitForTimeout(500);
 await page.screenshot({path:info.outputPath('example-sunset-tablet.png')});
 expect(errors).toEqual([]);
});
test('saved student city keeps its stored appearance',async({page})=>{
 await page.addInitScript(key=>{
  localStorage.setItem(key,JSON.stringify({version:2,scaleMeters:500,roads:[],parks:[],buildings:[{type:'city_central',pos:[250,250],footprint:[28,28],height:42}]}));
  localStorage.setItem('p5_city_look_v1','storybook');
  localStorage.setItem('p5_city_day_sky_v1','bright-clouds');
  localStorage.setItem('p5_city_ground_texture_v1','pavers');
  localStorage.setItem('p5_city_time_v1','morning');
 },KEY);
 await boot(page);
 expect(await page.evaluate(()=>({
  style:localStorage.getItem('p5_city_look_v1'),sky:localStorage.getItem('p5_city_day_sky_v1'),
  ground:localStorage.getItem('p5_city_ground_texture_v1'),time:localStorage.getItem('p5_city_time_v1'),
 }))).toEqual({style:'storybook',sky:'bright-clouds',ground:'pavers',time:'morning'});
});
test('small, medium and large parks keep open centres without loading the retired diorama',async({page},info)=>{
 test.setTimeout(180000);
 const parks=[{cx:90,cz:200,radius:14},{cx:200,cz:200,radius:28},{cx:330,cz:200,radius:48}];
 await page.addInitScript(({KEY,parks})=>localStorage.setItem(KEY,JSON.stringify({version:2,scaleMeters:500,roads:[],parks,buildings:[{type:'city_central',pos:[210,65],footprint:[28,28],height:42}]})),{KEY,parks});
 const parkRequests=[];page.on('request',request=>{if(request.url().includes('/assets/models/park.glb'))parkRequests.push(request.url());});
 await page.goto('/city-builder/?from=planner');
 await page.waitForFunction(()=>window.__city?.timeOfDay&&document.querySelector('#loading.done'));
 const placement=await page.evaluate(async()=>{const {createParkVegetation,parkCentreClearance}=await import('/city-common/park-vegetation.js');const parks=__city.layout.parks,items=createParkVegetation(__city.layout);return parks.map((park,index)=>{const own=items.filter(item=>item.park===index),clear=parkCentreClearance(park.radius),radii=own.map(item=>Math.hypot(item.x-park.cx,item.z-park.cz));return {clear,count:own.length,centreIntrusions:radii.filter(r=>r<clear).length,middle:radii.filter(r=>r>=clear&&r<park.radius*.55-3.2).length};});});
 for(const park of placement){expect(park.clear).toBeGreaterThanOrEqual(4.5);expect(park.clear).toBeLessThanOrEqual(8);expect(park.centreIntrusions).toBe(0);expect(park.count).toBeGreaterThan(0);}
 expect(placement.slice(1).every(park=>park.middle>0)).toBe(true);
 for(const time of ['day','sunset','night']){
  await page.evaluate(time=>{__city.setTimeOfDay(time);window.__camOverride={pos:[210,230,470],target:[210,0,200]};},time);
  await page.waitForFunction(time=>__city.timeOfDay.id===time&&__city.timeOfDay.settled,time);
  await page.screenshot({path:info.outputPath(`parks-${time}-aerial.png`)});
  await page.evaluate(()=>{window.__camOverride={pos:[200,7,245],target:[200,1,200]};});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.screenshot({path:info.outputPath(`parks-${time}-street.png`)});
 }
 expect(parkRequests).toEqual([]);
});
test('every City Look keeps background, fog, and procedural sky colours finite',async({page})=>{
 test.setTimeout(180000);
 const errors=await boot(page);
 await page.locator('#appearance-toggle').click();
 for(const id of ['toy-town','storybook','natural','future']){
  await page.locator(`[data-style="${id}"]`).click();
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
 expect(await page.evaluate(()=>localStorage.getItem('p5_city_look_v1'))).toBe('future');
 expect(errors).toEqual([]);
});

const TWO_BAND_SKY = `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="4" viewBox="0 0 8 4">
  <path fill="#146cff" d="M0 0h8v2H0z"/><path fill="#f02020" d="M0 2h8v2H0z"/>
</svg>`;

async function installTwoBandPanoramas(page) {
 await page.route(/\/assets\/environment\/.*-sky(?:-4k)?\.jpg$/, route => route.fulfill({
  status: 200, contentType: 'image/svg+xml', body: TWO_BAND_SKY,
 }));
}

async function verifyNaturalZenithMapping(page, time) {
 await page.evaluate(id => { __city.setTimeOfDay(id); __city.setCityStyle('natural'); }, time);
 await page.waitForFunction(id => {
  if (__city.timeOfDay.id !== id) return false;
  let ready = false;
  __city.scene.traverse(object => {
   const materials = Array.isArray(object.material) ? object.material : [object.material];
   if (materials.some(material => material?.uniforms?.useEquirect?.value === 1 && material.uniforms.equirectMap?.value?.image)) ready = true;
  });
  return ready;
 }, time);
 return page.evaluate(async () => {
  const { twoBandPanoramaSample } = await import('/city-builder/sky-mapping.js');
  let skyMaterial;
  __city.scene.traverse(object => {
   const materials = Array.isArray(object.material) ? object.material : [object.material];
   skyMaterial ||= materials.find(material => material?.uniforms?.useEquirect?.value === 1);
  });
  if (!skyMaterial) throw new Error('Natural City sky material not ready');
  return {
   upwardBand: twoBandPanoramaSample(1),
   upwardV: 0.5 + Math.asin(1) / Math.PI,
   shader: skyMaterial.fragmentShader,
   verticalWrap: skyMaterial.uniforms.equirectMap.value.wrapT,
  };
 });
}

for (const profile of [
 { name:'desktop', viewport:{width:1440,height:900}, touch:false, panoramaWidth:4096 },
 { name:'tablet', viewport:{width:1024,height:768}, touch:true, panoramaWidth:2048 },
]) {
 test.describe(`Natural City panorama — ${profile.name}`, () => {
  test.use({ viewport:profile.viewport, hasTouch:profile.touch });
  test('Clear Blue decodes at the required source resolution', async ({page}) => {
   test.setTimeout(180000);
   await page.addInitScript(() => {
    Object.defineProperty(navigator,'deviceMemory',{configurable:true,get:()=>8});
    Object.defineProperty(navigator,'hardwareConcurrency',{configurable:true,get:()=>8});
   });
   const errors=await boot(page);
   await page.evaluate(()=>{__city.setTimeOfDay('day');__city.setDaySky('clear-blue');});
   const dimensions=await page.waitForFunction(()=>{let image=null;__city.scene.traverse(o=>{for(const m of (Array.isArray(o.material)?o.material:[o.material])){const candidate=m?.uniforms?.equirectMap?.value?.image;if(candidate?.src?.includes('qwantani-clear-sky'))image=candidate;}});return image&&{width:image.naturalWidth,height:image.naturalHeight,src:image.src};}).then(handle=>handle.jsonValue());
   expect(dimensions.width).toBe(profile.panoramaWidth);
   expect(dimensions.height).toBe(profile.panoramaWidth/2);
   expect(dimensions.src).not.toContain('qwantani-clear.png');
   expect(errors).toEqual([]);
  });
  test('zenith samples the sky band at morning, day, sunset and night', async ({page}) => {
   test.setTimeout(240000);
   await installTwoBandPanoramas(page);
   const errors = await boot(page);
   for (const time of ['morning','day','sunset','night']) {
    const result = await verifyNaturalZenithMapping(page,time);
    expect(result.upwardBand, `${time} upward camera band`).toBe('sky');
    expect(result.upwardV, `${time} zenith v`).toBe(1);
    expect(result.shader).toContain('0.5+asin(clamp(d.y,-1.0,1.0))/PI');
    expect(result.verticalWrap).toBe(1001); // THREE.ClampToEdgeWrapping
   }
   expect(errors).toEqual([]);
  });
 });
}
test('four times render and remain bounded until the next example launch resets them',async({page},info)=>{
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
 await page.waitForFunction(()=>{const q=__city.loading?.queue?.();return !q||(!q.pending&&!q.running);},null,{timeout:90000});
 // Loader completion can queue a final GPU upload on the following frames.
 // Sample until texture/geometry counts have remained unchanged for 2 seconds
 // so this test measures the time switch, rather than late boot cleanup.
 await page.waitForFunction(()=>new Promise(resolve=>{let last='',same=0;const sample=()=>{const s=__city.renderStats||{};const next=`${s.textures}/${s.geometries}`;same=next===last?same+1:0;last=next;if(same>=10)resolve();else setTimeout(sample,200);};sample();}));
 const before=await page.evaluate(()=>({...__city.renderStats}));let glbs=0;page.on('request',r=>{if(r.url().includes('.glb'))glbs++;});
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.locator('#appearance-toggle').click();
 await page.evaluate(ids=>{for(const id of ids)document.querySelector(`[data-time="${id}"]`)?.click();},['morning','day','sunset','night','morning','day','sunset','night','morning','day','sunset','night']);
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const after=await page.evaluate(()=>({...__city.renderStats}));expect(glbs).toBe(0);
 // The example now opens at Sunset. Its first visit to Day legitimately adds
 // the one selected daytime panorama; repeated time changes must stay bounded.
 expect(after.textures).toBeLessThanOrEqual(before.textures+1);
 // A few late procedural helpers (crowd/cloud/nature batches) settle outside
 // the GLB queue. They remain tightly bounded; time changes must never trigger
 // model downloads or unbounded geometry growth.
 expect(after.geometries).toBeLessThanOrEqual(before.geometries+8);
 expect(await page.evaluate(()=>__city.timeOfDay.id)).toBe('night');expect(await page.evaluate(()=>localStorage.getItem('p5_city_time_v1'))).toBe('night');
 expect(await page.evaluate(()=>__city.parkLandscape.drawCalls)).toBeLessThanOrEqual(6);expect(errors).toEqual([]);
 await page.reload();await page.waitForTimeout(2000);await page.locator('#entry-local').click();await page.waitForFunction(()=>window.__city?.timeOfDay?.id==='sunset');
 expect(await page.evaluate(()=>localStorage.getItem('p5_city_time_v1'))).toBe('sunset');
});
test('Natural City day skies use full panorama assets and preserve other times',async({page})=>{
 test.setTimeout(180000);
 const errors=await boot(page);
 await page.evaluate(()=>__city.setTimeOfDay('day'));
 await page.locator('#appearance-toggle').click();
 for(const id of ['natural-blue','clear-blue','bright-clouds','calm-overcast']){
  await page.locator(`[data-day-sky="${id}"]`).click();
  const expected=id==='clear-blue'?'qwantani-clear-sky-4k.jpg':id==='bright-clouds'?'kloofendal-clouds-sky-4k.jpg':id==='calm-overcast'?'kloofendal-overcast-sky-4k.jpg':'kloppenheim-03-sky-4k.jpg';
  await page.waitForFunction(file=>{let found=false;__city.scene.traverse(o=>{for(const m of (Array.isArray(o.material)?o.material:[o.material])){const image=m?.uniforms?.equirectMap?.value?.image;if(m?.uniforms?.useEquirect?.value===1&&image?.src?.endsWith(file)&&image.naturalWidth===4096&&image.naturalHeight===2048)found=true;}});return found;},expected);
 }
 expect(await page.evaluate(()=>localStorage.getItem('p5_city_day_sky_v1'))).toBe('calm-overcast');
 await page.evaluate(()=>__city.setTimeOfDay('sunset'));
 await page.waitForFunction(()=>{let src='';__city.scene.traverse(o=>{for(const m of (Array.isArray(o.material)?o.material:[o.material]))src ||= m?.uniforms?.equirectMap?.value?.image?.src||'';});return src.endsWith('wasteland-golden-sky-4k.jpg');});
 await page.evaluate(()=>__city.setTimeOfDay('day'));
 await page.waitForFunction(()=>{let src='';__city.scene.traverse(o=>{for(const m of (Array.isArray(o.material)?o.material:[o.material]))src ||= m?.uniforms?.equirectMap?.value?.image?.src||'';});return src.endsWith('kloofendal-overcast-sky-4k.jpg');});
 expect(errors).toEqual([]);
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
 await page.click('#btn-export');await page.waitForURL('**/city-builder/**');
 // streetProps is a DEFERRED asset — wait for it, not just procedural readiness.
 await page.waitForFunction(()=>window.__city?.streetLife && window.__city?.streetProps && document.querySelector('#loading.done'),null,{timeout:60000});
 const result=await page.evaluate(()=>({off:__city.layout.autoScenery===false,spaces:__city.neighbourhood.spaces.length,landscape:__city.parkLandscape.drawCalls,nature:__city.natureScenery.instances,benches:__city.streetProps.getCount().benches,roads:__city.layout.roads.length}));
 expect(result.off).toBe(true);expect(result.spaces).toBe(0);expect(result.landscape).toBe(0);expect(result.nature).toBe(0);expect(result.benches).toBe(0);
 const saved=await page.evaluate(async()=>{const m=await import('../city-common/champion-file.js');return m.sanitizeChampionFile(m.composeChampionFile(m.collectState(),'Scenery off'));});expect(JSON.parse(saved.file.state.layout).autoScenery).toBe(false);expect(errors).toEqual([]);
});

test('five ground choices persist, while realistic parks stay Leafy Grass',async({page})=>{
 test.setTimeout(180000);
 const errors=await boot(page);
 await page.locator('#appearance-toggle').click();
 await page.locator('[data-style="natural"]').click();
 await expect(page.locator('[data-ground]')).toHaveCount(5);
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
 await page.locator('[data-ground="pavers"]').click();
 await page.waitForFunction(()=>localStorage.getItem('p5_city_ground_texture_v1')==='pavers');
 await expect.poll(surfaceMaps).toEqual(expect.objectContaining({terrain:expect.stringContaining('gravel_floor_03_diff_1k.jpg'),park:expect.stringContaining('leafy_grass_diff_1k.jpg')}));
 await page.locator('[data-ground="asphalt"]').click();
 await page.waitForFunction(()=>localStorage.getItem('p5_city_ground_texture_v1')==='asphalt');
 await expect.poll(surfaceMaps).toEqual(expect.objectContaining({terrain:expect.stringContaining('ground-asphalt.jpg'),park:expect.stringContaining('leafy_grass_diff_1k.jpg')}));
 await page.reload();await page.waitForTimeout(2000);await page.locator('#entry-local').click();
 await page.waitForFunction(()=>window.__city && localStorage.getItem('p5_city_ground_texture_v1')==='asphalt');
 await expect(page.locator('#appearance-toggle')).toHaveAttribute('aria-label',/City Asphalt/);
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
