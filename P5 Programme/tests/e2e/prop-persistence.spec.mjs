import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const key = 'hk_ai_city_props_citybuilder_v1';
async function harness(page, records = [{id:'prop_bench_k',x:1,z:2},{id:'prop_bench_k',x:3,z:4}], customManifest = null) {
  await page.route('**/prop-test', r => r.fulfill({contentType:'text/html',body:`<script type="importmap">{"imports":{"three":"/vendor/three/three.module.js","three/addons/":"/vendor/three/addons/"}}</script>`}));
  await page.goto('/prop-test');
  await page.evaluate(async ({key,records,customManifest}) => {
    const THREE = await import('three');
    const {mountPropLibrary} = await import('/city-builder/prop-library.js');
    const {createGrabSystem} = await import('/shared/grab.js');
    const {LIBRARY} = await import('/city-common/library.js');
    window.id = LIBRARY.find(x => x.category === 'props').id;
    records = records.map(r => r?.id === 'prop_bench_k' ? {...r,id:window.id} : r);
    window.raw = JSON.stringify({version:1,props:records},null,2);
    localStorage.setItem(key,window.raw);
    if(customManifest)localStorage.setItem('hk_ai_city_custom_models_v1',JSON.stringify(customManifest));
    window.scene = new THREE.Scene();
    window.camera = new THREE.PerspectiveCamera(60,1,0.1,100);
    camera.position.set(0,10,10); camera.lookAt(0,0,0); camera.updateMatrixWorld();
    window.canvas = document.createElement('canvas'); canvas.style.cssText='width:500px;height:500px'; document.body.append(canvas);
    window.pending = []; window.mounted = []; window.removed = [];
    window.model = new THREE.Group(); model.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
    window.disposed = 0;
    model.children[0].geometry.addEventListener('dispose',()=>window.disposed++);
    model.children[0].material.addEventListener('dispose',()=>window.disposed++);
    window.colliders=[];
    window.grab = createGrabSystem(scene,{colliders, getChampion:()=>({group:new THREE.Group(),state:{pos:new THREE.Vector3(),facing:0}})});
    window.mount = () => mountPropLibrary({scene,camera,renderer:{domElement:canvas},loadModel:()=>new Promise(resolve=>pending.push(resolve)),onPlacedMesh:mesh=>{mounted.push(mesh);grab.register(mesh,{movable:true});grab.addSurfaces(mesh);grab.attach(mesh);},onRemovedMesh:mesh=>{removed.push(mesh);grab.unregister(mesh);}});
    window.api = mount();
  },{key,records,customManifest});
}
const settle = (page, indices, missing=false) => page.evaluate(({indices,missing})=>{ for(const i of indices) pending[i](missing ? null : model); },{indices,missing});

test('records precede out-of-order loads; edit/add/undo during restore retain pending and unknown records',async({page})=>{
 await harness(page,[{id:'prop_bench_k',x:1,z:2},{id:'prop_bench_k',x:3,z:4},{id:'unknown-old',x:5},null,{id:'prop_bench_k',x:'bad'}]);
 expect(await page.evaluate(()=>api.getCount())).toBe(5);
 expect(await page.evaluate(()=>api.snapshot()===raw)).toBe(true);
 await settle(page,[1]);
 await page.evaluate(()=>{const mesh=mounted[0];mesh.position.set(7,2,8);mesh.scale.setScalar(2);api.updateTransform(mesh);});
 await page.click('#prop-toggle');
 await page.locator('.prop-lib-tabs').selectOption('nature');
 await page.locator('.prop-lib-place').first().click();
 await expect.poll(()=>page.evaluate(()=>pending.length)).toBe(3);
 await settle(page,[2]);
 await page.locator('.prop-lib-overlay').dispatchEvent('pointermove',{clientX:250,clientY:250});
 await page.locator('.prop-lib-overlay').dispatchEvent('pointerdown',{clientX:250,clientY:250});
 expect(await page.evaluate(()=>JSON.parse(api.snapshot()).props.length)).toBe(6);
 await page.locator('[data-act="undo"]').click();
 await settle(page,[0]);
 const props=await page.evaluate(()=>JSON.parse(api.snapshot()).props);
 expect(props).toHaveLength(5);expect(props[0].x).toBe(1);expect(props[1]).toMatchObject({x:7,y:2,z:8,scale:[2,2,2]});expect(props[2].id).toBe('unknown-old');expect(props[3]).toBeNull();expect(props[4].x).toBe('bad');
 expect(await page.evaluate(()=>mounted.length-removed.length)).toBe(2);
});

test('clear invalidates restore and preview; no resurrection or shared disposal',async({page})=>{
 await harness(page); await settle(page,[0]);
 await page.evaluate(()=>{grab.select(mounted[0]);grab.pickUp();api.clear();});
 await settle(page,[1]);
 expect(await page.evaluate(()=>({count:api.getCount(),grabs:grab.interactables.length,holding:!!grab.holding,colliders:colliders.length,disposed}))).toEqual({count:0,grabs:0,holding:false,colliders:0,disposed:0});
 expect(await page.evaluate(()=>JSON.parse(api.snapshot()).props)).toEqual([]);
});

test('selected decoration inspector has bounded undo/redo and a real movement lock',async({page})=>{
 await harness(page,[{id:'prop_bench_k',x:1,z:2}]); await settle(page,[0]);
 await page.evaluate(()=>api.selectMesh(mounted[0]));
 await expect(page.locator('#prop-inspector')).toBeVisible();
 await page.locator('[data-inspect="rotate-right"]').click();
 expect(await page.evaluate(()=>JSON.parse(api.snapshot()).props[0].yaw)).toBeCloseTo(Math.PI/12);
 await page.locator('[data-inspect="undo"]').click();
 expect(await page.evaluate(()=>JSON.parse(api.snapshot()).props[0].yaw ?? 0)).toBe(0);
 await page.locator('[data-inspect="redo"]').click();
 expect(await page.evaluate(()=>JSON.parse(api.snapshot()).props[0].yaw)).toBeCloseTo(Math.PI/12);
 await page.locator('#prop-inspector input[type="checkbox"]').check();
 await page.waitForFunction(()=>grab.interactables.length===1);
 await page.evaluate(()=>{ grab.select(grab.interactables[0]); grab.pickUp(); });
 expect(await page.evaluate(()=>grab.mode)).toBe('idle');
 expect(await page.evaluate(()=>JSON.parse(api.snapshot()).props[0].locked)).toBe(true);
});

test('refresh twice and destroy during load cancel obsolete generations and release owned DOM/listeners',async({page})=>{
 await harness(page);
 await page.evaluate(()=>{api.refresh();api.refresh();});
 await settle(page,[0,1,2,3]);
 expect(await page.evaluate(()=>mounted.length)).toBe(0);
 await settle(page,[5]);
 await page.evaluate(()=>{grab.select(mounted[0]);api.destroy();api.destroy();window.dispatchEvent(new Event('i18n:change'));});
 await settle(page,[4]);
 expect(await page.evaluate(()=>({mounted:mounted.length,removed:removed.length,grabs:grab.interactables.length,selected:grab.getSelected(),disposed,global:!!window.__propLibrary}))).toEqual({mounted:1,removed:1,grabs:0,selected:null,disposed:0,global:false});
 await expect(page.locator('[class^="prop-lib"]')).toHaveCount(0);
});

test('missing model retains raw record; quota warning and current snapshot survive refresh, transforms round-trip',async({page})=>{
 await harness(page);await settle(page,[0],true);await settle(page,[1]);
 await expect(page.locator('.prop-lib-toast')).toContainText('records are kept');
 expect(await page.evaluate(()=>api.snapshot()===raw)).toBe(true);
 await page.evaluate(()=>{window.set=Storage.prototype.setItem;Storage.prototype.setItem=()=>{throw new DOMException('full','QuotaExceededError');};const m=mounted[0];m.position.set(9,3,8);m.rotation.y=1.5;m.scale.set(2,3,4);api.updateTransform(m);api.refresh();});
 await expect(page.locator('.prop-lib-toast')).toContainText('not saved');
 expect(await page.evaluate(k=>localStorage.getItem(k)===raw,key)).toBe(true);
 await settle(page,[2,3]);
 expect(await page.evaluate(()=>mounted.at(-1).scale.toArray())).toEqual([2,3,4]);
 await page.evaluate(k=>{Storage.prototype.setItem=window.set;localStorage.setItem(k,api.snapshot());api.destroy();api=mount();},key);
 await settle(page,[4,5]);
 expect(await page.evaluate(()=>({pos:mounted.at(-1).position.toArray(),yaw:mounted.at(-1).rotation.y,scale:mounted.at(-1).scale.toArray()}))).toEqual({pos:[9,3,8],yaw:1.5,scale:[2,3,4]});
});

test('restored custom metadata without a device-local GLB shows a clear re-add state',async({page})=>{
 await harness(page,[],{version:2,models:[{id:'park-art',name:'My Park Art'}],overrides:{school:'park-art'}});
 await page.click('#prop-toggle');
 await page.locator('.prop-lib-tabs').selectOption('mine');
 const card=page.locator('[data-model-state="missing"]');
 await expect(card).toContainText('My Park Art · file needed');
 await expect(card.getByRole('button',{name:'Place'})).toBeDisabled();
 await expect(card.getByRole('button',{name:'Re-add file'})).toBeVisible();
 expect(await page.evaluate(()=>api.snapshot())).toContain('props');
});

test('Landmark Workshop inserts, configures and restores all four additive prop records',async({page})=>{
 await harness(page,[]);
 const ids=await page.evaluate(async()=>{
  const out=[];
  for(const [i,id] of ['champion-plaza','pixel-mural','festival-plaza','smart-gate'].entries())out.push(await api.insertLandmark(id,{x:i*10,z:i}));
  return out;
 });
 expect(ids.every(Boolean)).toBe(true);
 await expect.poll(()=>page.evaluate(()=>mounted.length)).toBe(4);
 expect(await page.evaluate(()=>JSON.parse(api.snapshot()).props.map(p=>p.landmark.templateId))).toEqual(['champion-plaza','pixel-mural','festival-plaza','smart-gate']);
 await page.evaluate(async id=>api.updateLandmark(id,{statueSource:'generic',pose:'run'}),ids[0]);
 const champion=await page.evaluate(()=>JSON.parse(api.snapshot()).props[0]);
 expect(champion.landmark.config).toEqual({statueSource:'generic',pose:'run'});
 await page.evaluate(()=>{const m=mounted.find(m=>m.position.x===30);m.position.set(31,0,7);m.scale.setScalar(1.5);api.updateTransform(m);api.undo();api.redo();});
 expect(await page.evaluate(()=>JSON.parse(api.snapshot()).props[3])).toMatchObject({x:31,z:7,scale:[1.5,1.5,1.5]});
 await page.evaluate(()=>{api.destroy();api=mount();});
 await expect.poll(()=>page.evaluate(()=>mounted.length-removed.length)).toBe(4);
 expect(await page.evaluate(()=>JSON.parse(api.snapshot()).props.every(p=>p.landmark?.version===1))).toBe(true);
});

test('a child who never opens the landmark shelf makes no landmark module or asset request',async({page})=>{
 const requests=[];page.on('request',request=>requests.push(request.url()));
 await harness(page,[]);
 await page.click('#prop-toggle');
 await page.locator('.prop-lib-tabs').selectOption('nature');
 await page.waitForTimeout(100);
 expect(requests.some(url=>url.includes('landmark-workshop')||url.includes('landmark-templates'))).toBe(false);
 await page.locator('.prop-lib-tabs').selectOption('landmarks');
 await expect(page.locator('.landmark-card')).toHaveCount(4);
 expect(requests.some(url=>url.includes('landmark-workshop'))).toBe(true);
});

test('unknown landmark restores as a selectable repair object and can be repaired or deleted',async({page})=>{
 await harness(page,[{id:'landmark:future-template',instanceId:'future-1',x:2,z:3,landmark:{version:1,templateId:'future-template',config:{keep:'me'}}}]);
 await expect.poll(()=>page.evaluate(()=>mounted.length)).toBe(1);
 expect(await page.evaluate(()=>mounted[0].userData.repair)).toBe(true);
 await page.evaluate(()=>api.selectMesh(mounted[0]));
 await expect(page.locator('[data-inspect="customize"]')).toContainText('Repair landmark');
 await page.locator('[data-inspect="customize"]').click();
 await expect.poll(()=>page.evaluate(()=>JSON.parse(api.snapshot()).props[0].landmark.templateId)).toBe('champion-plaza');
 await page.locator('[data-inspect="delete"]').click();
 expect(await page.evaluate(()=>JSON.parse(api.snapshot()).props)).toEqual([]);
});

test('a valid device-local GLB can be named, role-assigned, placed and restored',async({page})=>{
 await harness(page,[]);
 await page.click('#prop-toggle');
 await page.locator('.prop-lib-tabs').selectOption('mine');
 page.once('dialog',dialog=>dialog.accept('Park Sculpture'));
 await page.locator('input[type="file"][accept*=".glb"]').setInputFiles({
  name:'park-sculpture.glb',mimeType:'model/gltf-binary',
  buffer:readFileSync(new URL('../../buddy-kit/client/library/props/kenney-bench.glb',import.meta.url)),
 });
 const card=page.locator('[data-model-state="ready"]');
 await expect(card).toContainText('Park Sculpture');
 page.once('dialog',dialog=>dialog.accept('school'));
 await card.getByRole('button',{name:'Building role'}).click();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('hk_ai_city_custom_models_v1')).overrides.school)).toBeTruthy();
 await card.getByRole('button',{name:'Place',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>api.isReadyToPlace())).toBe(true);
 await page.locator('.prop-lib-overlay').dispatchEvent('pointermove',{clientX:250,clientY:250});
 await page.locator('.prop-lib-overlay').dispatchEvent('pointerdown',{clientX:250,clientY:250});
 await page.locator('[data-act="done"]').click();
 const saved=await page.evaluate(()=>JSON.parse(api.snapshot()).props[0]);
 expect(saved.id).toMatch(/^custom:/);
 const mountedBefore=await page.evaluate(()=>mounted.length);
 await page.evaluate(()=>{api.destroy();api=mount();});
 await expect.poll(()=>page.evaluate(n=>mounted.length>n,mountedBefore)).toBe(true);
 expect(await page.evaluate(()=>JSON.parse(api.snapshot()).props[0])).toMatchObject(saved);
});

test('one custom building-role GLB renders every repeated planner instance',async({page})=>{
 const bytes=[...readFileSync(new URL('../../buddy-kit/client/library/props/kenney-bench.glb',import.meta.url))];
 await page.goto('/city-builder/');
 await page.evaluate(async bytes=>{
  const {customModelStore,writeCustomManifest}=await import('/city-common/custom-models.js');
  await customModelStore.put({id:'repeat-role',bytes:new Uint8Array(bytes).buffer,name:'Repeated School',createdAt:new Date().toISOString()});
  writeCustomManifest({version:2,models:[{id:'repeat-role',name:'Repeated School'}],overrides:{school:'repeat-role'}});
  localStorage.setItem('p5_city_planner_layout_v1',JSON.stringify({version:2,scaleMeters:500,roads:[],parks:[],buildings:[
   {type:'school',pos:[150,250],footprint:[26,24],height:20},
   {type:'school',pos:[350,250],footprint:[26,24],height:20},
  ]}));
 },bytes);
 await page.goto('/city-builder/?from=planner');
 await page.waitForFunction(()=>document.querySelector('#loading.done')&&window.__city?.loading?.assets?.buildings?.school?.instances===2,null,{timeout:90000});
 expect(await page.evaluate(()=>__city.loading.assets.buildings.school)).toMatchObject({state:'loaded',instances:2});
});

test('City slider and grab drop persist transforms; Champion download includes current props after quota failure',async({page})=>{
 await page.addInitScript(({key})=>{localStorage.setItem('p5_city_planner_layout_v1',JSON.stringify({version:2,scaleMeters:2000,roads:[],parks:[],buildings:[{type:'city_central',pos:[500,500]}]}));localStorage.setItem(key,JSON.stringify({version:1,props:[{id:'prop_bench_k',x:20,z:20}]}));},{key});
 await page.goto('/city-builder/?from=planner');
 await page.waitForFunction(()=>window.__grab?.interactables.length && document.getElementById('loading').classList.contains('done'));
 await page.click('button[data-city-mode="decorate"]');
 await page.locator('.prop-lib-close').click();
 await page.evaluate(()=>{window.__grab.select(window.__grab.interactables[0]);});
 await page.locator('#resize-slider').fill('2');
 const scale=await page.evaluate(()=>window.__grab.getSelected().scale.toArray());
 expect(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).props[0].scale,key)).toEqual(scale);
 await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw new DOMException('full','QuotaExceededError');};window.__grab.pickUp();window.__grab.pickUp();});
 await expect(page.locator('.prop-lib-toast')).toContainText('not saved');
 await page.click('#btn-save-hud');
 const downloading=page.waitForEvent('download');await page.click('#save-download');
 const file=JSON.parse(readFileSync(await(await downloading).path(),'utf8'));
 expect(file.state.props).toBe(await page.evaluate(()=>window.__propLibrary.snapshot()));
 expect(JSON.parse(file.state.props).props[0].scale).toEqual(scale);
 await page.evaluate(()=>window.__propLibrary.clear());
 expect(await page.evaluate(()=>window.__grab.interactables.length)).toBe(0);
 await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
 expect(await page.evaluate(()=>!!window.__propLibrary)).toBe(true);
 await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:false})));
 await expect(page.locator('#resize-slider, #prop-toggle')).toHaveCount(0);
 expect(await page.evaluate(()=>!!window.__propLibrary || !!window.__grab)).toBe(false);
});

test('Remove beside Size deletes only the selected building, offers Undo, and respects locks on desktop and touch widths',async({page})=>{
 test.setTimeout(180000);
 await page.addInitScript(({key})=>{
  localStorage.setItem('p5_city_planner_layout_v1',JSON.stringify({version:2,scaleMeters:2000,roads:[],parks:[],buildings:[{type:'city_central',pos:[500,500]}]}));
  if (!localStorage.getItem(key)) localStorage.setItem(key,JSON.stringify({version:1,props:[
   {id:'bld_kenney_a',instanceId:'building-one',x:20,z:20},
   {id:'bld_kenney_a',instanceId:'building-two',x:60,z:60},
  ]}));
 },{key});
 await page.goto('/city-builder/?from=planner');
 await page.waitForFunction(()=>window.__grab?.interactables.length===2 && document.getElementById('loading')?.classList.contains('done'));
 await page.click('button[data-city-mode="decorate"]');
 await page.locator('.prop-lib-close').click();
 await page.evaluate(()=>__grab.select(__grab.interactables.find(mesh=>mesh.position.x===60)));
 const remove=page.locator('.resize-remove');
 await expect(remove).toBeVisible();
 await expect(remove).toBeEnabled();
 const desktop=await page.evaluate(()=>({slider:document.querySelector('#resize-slider').getBoundingClientRect().toJSON(),button:document.querySelector('.resize-remove').getBoundingClientRect().toJSON()}));
 expect(desktop.slider.right).toBeLessThanOrEqual(desktop.button.left);
 await page.setViewportSize({width:390,height:844});
 const touch=await page.evaluate(()=>({slider:document.querySelector('#resize-slider').getBoundingClientRect().toJSON(),button:document.querySelector('.resize-remove').getBoundingClientRect().toJSON()}));
 expect(touch.slider.right).toBeLessThanOrEqual(touch.button.left);
 expect(touch.button.right).toBeLessThanOrEqual(390);
 await remove.click();
 await expect(page.locator('.resize-panel')).toBeHidden();
 await expect(page.locator('.prop-lib-toast').getByRole('button',{name:'Undo'})).toBeVisible();
 expect(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).props.map(p=>p.instanceId),key)).toEqual(['building-one']);
 expect(await page.evaluate(()=>__grab.interactables.length)).toBe(1);
 await page.locator('.prop-lib-toast').getByRole('button',{name:'Undo'}).click();
 await expect.poll(()=>page.evaluate(()=>__grab.interactables.length)).toBe(2);
 expect(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).props.map(p=>p.instanceId),key)).toEqual(['building-one','building-two']);
 await page.evaluate(()=>__grab.select(__grab.interactables.find(mesh=>mesh.position.x===60)));
 await page.locator('[data-inspect="delete"]').click();
 expect(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).props.map(p=>p.instanceId),key)).toEqual(['building-one']);
 await page.setViewportSize({width:1280,height:800});
 await page.reload();
 await page.getByRole('button',{name:'Continue my city'}).click();
 await page.waitForFunction(()=>window.__grab?.interactables.length===1 && document.getElementById('loading')?.classList.contains('done'),null,{timeout:90000});
 expect(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).props.map(p=>p.instanceId),key)).toEqual(['building-one']);
 await page.click('button[data-city-mode="decorate"]');
 await page.locator('.prop-lib-close').click();
 await page.evaluate(()=>__grab.select(__grab.interactables[0]));
 await page.locator('#prop-inspector input[type="checkbox"]').check();
 await expect(remove).toBeDisabled();
 await expect(page.locator('[data-inspect="delete"]')).toBeDisabled();
 expect(await page.evaluate(()=>__propLibrary.removeSelected())).toBe(false);
 expect(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).props,key)).toHaveLength(1);
});

test('same-model preview generations release owned materials and cannot revive after clear/destroy',async({page})=>{
 await harness(page,[]);
 const choose = async () => {
   await page.click('#prop-toggle');
   await page.locator('.prop-lib-place').first().click();
 };
 await choose();
 await page.locator('[data-act="done"]').click();
 await choose();
 await settle(page,[0]);
 expect(await page.evaluate(()=>api.isReadyToPlace())).toBe(false);
 await settle(page,[1]);
 expect(await page.evaluate(()=>api.isReadyToPlace())).toBe(true);
 await page.evaluate(()=>{
   window.previewDisposed=0;
   scene.traverse(o=>{if(o.isMesh && o.material!==model.children[0].material)o.material.addEventListener('dispose',()=>window.previewDisposed++);});
   api.clear();
 });
 expect(await page.evaluate(()=>previewDisposed)).toBe(1);
 expect(await page.evaluate(()=>disposed)).toBe(0);
 await choose();
 await page.evaluate(()=>api.destroy());
 await settle(page,[2]);
 expect(await page.evaluate(()=>scene.children.length)).toBe(1); // grab's owned selection outline
 await page.evaluate(()=>grab.destroy());
 expect(await page.evaluate(()=>scene.children.length)).toBe(0);
});

test('unreadable sections remain exportable and placement cannot overwrite them',async({page})=>{
 await harness(page,[]);
 await page.evaluate(k=>{api.destroy();localStorage.setItem(k,'{broken legacy data');api=mount();},key);
 await page.click('#prop-toggle');await page.locator('.prop-lib-place').first().click();
 expect(await page.evaluate(()=>api.isPlacing())).toBe(false);
 expect(await page.evaluate(()=>api.snapshot())).toBe('{broken legacy data');
 await expect(page.locator('.prop-lib-toast')).toContainText('cannot be read');
 await page.evaluate(()=>api.clear());
 expect(await page.evaluate(()=>JSON.parse(api.snapshot()).props)).toEqual([]);
});
