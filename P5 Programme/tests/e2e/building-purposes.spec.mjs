import {test,expect} from '@playwright/test';
import {PURPOSES} from '../../buddy-kit/client/city-common/building-purposes.js';
import {readFile} from 'node:fs/promises';
const history=' { "completed": [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,999,18], "unlocked": [2,18,999,2], "old": true } ';
async function boot(page){
 page.on('pageerror',e=>console.log('CITY PAGE ERROR:',e.message));
 page.on('response',r=>{if(r.status()>=400 && !r.url().includes('/api/')) console.log('CITY HTTP ERROR:',r.status(),r.url());});
 await page.goto('/city-common/catalog.js');
 await page.evaluate(({types,history})=>{
  localStorage.clear();localStorage.setItem('hk_ai_city_lang_v1','en');localStorage.setItem('hk_ai_city_quests_v1',history);
  localStorage.setItem('p5_city_planner_layout_v1',JSON.stringify({version:2,scaleMeters:2000,roads:[{points:[[100,1000],[1900,1000]],width:14,class:'primary'}],parks:[],buildings:types.map((type,i)=>({type,pos:[300+(i%6)*240,500+Math.floor(i/6)*300],height:30,footprint:[24,24]}))}));
 },{types:Object.keys(PURPOSES),history});
 await page.goto('/city-builder/');await page.locator('#entry-local').click();await page.waitForFunction(()=>document.getElementById('loading')?.classList.contains('done'),null,{timeout:120000});
 await expect(page.locator('#my-work-btn')).toBeVisible();
}
test('My Work opens from the top bar and preserves opaque history',async({page})=>{
 test.setTimeout(300000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await boot(page);
 await page.click('#my-work-btn');
 await expect(page.locator('#my-work-title')).toHaveText('City Hall & My Work');
 await page.locator('[data-work-action="destinations"]').evaluate(el=>el.click());
 await expect(page.locator('.work-destination')).toHaveCount(18);
 expect(await page.evaluate(()=>localStorage.getItem('hk_ai_city_quests_v1'))).toBe(history);
 await page.click('[data-work-action="plan"]');await expect(page.locator('#work-content')).toContainText('No saved plan receipt');
 await page.click('[data-work-action="evidence"]');await expect(page.locator('#work-content')).toContainText('No imported evidence');
 await page.click('[data-work-action="exhibits"]');await expect(page.locator('#work-content')).toContainText('No saved outdoor props');
 await page.screenshot({path:'/tmp/purpose-session4/my-work.png'});
 await page.click('[data-work-action="save"]');
 const [download]=await Promise.all([page.waitForEvent('download'),page.click('#save-download')]);
 const file=JSON.parse(await readFile(await download.path(),'utf8'));expect(file.state.quests).toBe(history);
 await page.setInputFiles('#file-input',{name:'city.champion.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(file))});
 await page.locator('#entry-local').click();
 await page.waitForFunction(()=>document.getElementById('loading')?.classList.contains('done'),null,{timeout:120000});
 expect(await page.evaluate(()=>localStorage.getItem('hk_ai_city_quests_v1'))).toBe(history);expect(errors).toEqual([]);
});
test('ordinary landmarks have no nearby entry, tap target, or Buddy entry',async({page})=>{
 await boot(page);
 const selected=await page.evaluate(async()=>{
   const gateways=Object.values(window.__city.gateways);
   const ordinary=window.__layout.buildings.reduce((best,b)=>{
     const distance=Math.min(...gateways.map(g=>Math.hypot(b.pos[0]-g.position.x,b.pos[1]-g.position.z)));
     return distance>best.distance?{building:b,distance}:best;
   },{distance:-1});
   window.__city.champion.landAt(ordinary.building.pos[0]+20,ordinary.building.pos[1]);
   const {Vector3}=await import('three');
   const point=new Vector3(ordinary.building.pos[0],25,ordinary.building.pos[1]).project(window.__city.camera);
   const rect=window.__city.renderer.domElement.getBoundingClientRect();
   return {distance:ordinary.distance,x:rect.left+(point.x+1)*rect.width/2,y:rect.top+(1-point.y)*rect.height/2,targets:(()=>{let count=0;window.__scene.traverse(o=>{if(o.userData?.kind==='quest')count++;});return count;})()};
 });
 expect(selected.distance).toBeGreaterThan(100);
 expect(selected.targets).toBe(0);
 await expect(page.locator('#quest-prompt')).toBeHidden();
 await page.mouse.click(selected.x,selected.y);
 await expect(page.locator('#my-work-modal')).toBeHidden();
 expect(await page.evaluate(()=>window.__city.sim.enterNearQuest())).toMatchObject({ok:false});
 await expect(page.locator('#my-work-modal')).toBeHidden();
 await page.locator('#my-work-btn').click();
 await expect(page.locator('#my-work-modal')).toBeVisible();
});
test('road inspection and optional game Done preserve completion history, Stage 1 has no live inputs',async({page})=>{
 await boot(page);
 await page.evaluate(()=>window.__city.openPurpose('delivery'));
 await page.click('[data-work-action="routes"]');await expect(page.locator('#work-route svg')).toBeVisible();await expect(page.locator('#work-route')).toContainText('road distance');
 await page.selectOption('#work-to','0');await expect(page.locator('#work-from')).toHaveValue('9');
 await page.click('#work-optional > summary');
 await page.route('https://p3-06-delivery-paths-loops.ai-education.workers.dev/**',r=>r.fulfill({contentType:'text/html',body:'<p>Historical game fixture</p>'}));
 await page.click('#work-game');await expect(page.locator('#game-overlay')).not.toHaveClass(/hidden/);await page.click('#game-overlay-done');
 const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('hk_ai_city_quests_v1')));
 expect(after.completed).toEqual(JSON.parse(history).completed);expect(after.unlocked).toEqual(JSON.parse(history).unlocked);expect(after.activity).toEqual([{questId:10,action:'done'}]);
 if (!(await page.locator('#city-more').evaluate(el=>el.open))) await page.click('#city-more > summary');await page.click('#cap-btn');await expect(page.locator('#cap-body')).toContainText('does not run inference');await expect(page.locator('#try-run')).toHaveCount(0);
 await page.locator('#cap-modal .modal-close').click();
 await page.evaluate(()=>window.__city.openPurpose('water'));await page.click('#work-optional > summary');await page.click('#work-game');await expect(page.locator('#work-link-status')).toContainText('No historical game link');
});

test('imported evidence and historical decisions remain display-only through inspection and save',async({page})=>{
 await boot(page);
 await page.locator('#minimap button').click();await expect(page.locator('.work-destination')).toHaveCount(18);await page.keyboard.press('Escape');
 const cap={magic:'passiona.capability',specVersion:1,kind:'classifier',id:'cap_old',revision:1,name:'Sorting example',input:{kind:'vector',fields:[{name:'size',type:'float32'}]},output:{kind:'label',labels:['small'],abstainLabel:'__abstain'},model:{algorithm:'knn-vector-classifier',threshold:.7},evaluation:{scores:{check:.6}},evidence:[{id:'ex_old',label:'small',split:'study'}],selftest:{cases:[{name:'missing values abstain',input:{},expect:{decision:'__abstain'}}]}};
 const raw=' '+JSON.stringify([cap])+'\n',dec=' { "cap_old": {"label":"small","at":1} } ';
 await page.evaluate(({raw,dec})=>{localStorage.setItem('p5_city_capabilities_v1',raw);localStorage.setItem('p5_city_cap_lastdec_v1',dec);},{raw,dec});
 if (!(await page.locator('#city-more').evaluate(el=>el.open))) await page.click('#city-more > summary');await page.click('#cap-btn');await expect(page.locator('#cap-body')).toContainText('Stage 1');await expect(page.locator('#cap-body')).toContainText('Display-only · self-tests passed; no inference');await expect(page.locator('#cap-body')).not.toContainText('live-running');await page.click('[data-try-cap="cap_old"]');
 await expect(page.locator('#my-work-modal')).not.toHaveClass(/hidden/);
 for (const button of await page.locator('#my-work-modal [data-work-action]').all()) expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44);
 await page.screenshot({path:'/tmp/purpose-session4/my-work.png'});
 await expect(page.locator('#work-content')).toContainText('not been newly verified');
 await page.locator('#work-content article summary').click();await expect(page.locator('#work-content')).toContainText('ex_old');
 await expect(page.locator('#try-run')).toHaveCount(0);await expect(page.locator('#my-work-modal input[type="number"]')).toHaveCount(0);
 expect(await page.evaluate(()=>localStorage.getItem('p5_city_capabilities_v1'))).toBe(raw);
 expect(await page.evaluate(()=>localStorage.getItem('p5_city_cap_lastdec_v1'))).toBe(dec);
 await page.keyboard.press('Escape');await page.locator('#cap-modal .modal-close').click();await page.click('#my-work-btn');await page.click('[data-work-action="save"]');
 const [download]=await Promise.all([page.waitForEvent('download'),page.click('#save-download')]);
 const file=JSON.parse(await readFile(await download.path(),'utf8'));expect(file.state.caps).toBe(raw);expect(file.state.quests).toBe(history);
});

test('existing skeleton helper clones bones with the City vendored Three.js',async({page})=>{
 await page.goto('/city-builder/');
 const result=await page.evaluate(async()=>{
  const THREE=await import('three');const {clone}=await import('three/addons/utils/SkeletonUtils.js');
  const mesh=new THREE.SkinnedMesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial());
  const bone=new THREE.Bone();mesh.add(bone);mesh.bind(new THREE.Skeleton([bone]));
  const copy=clone(mesh);
  return {separate:copy.skeleton.bones[0]!==bone,parent:copy.skeleton.bones[0].parent===copy};
 });
 expect(result).toEqual({separate:true,parent:true});
});
