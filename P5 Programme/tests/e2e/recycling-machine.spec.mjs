import {test,expect} from '@playwright/test';
async function ready(page){await page.goto('/workshop/?tab=recycling&collection=city-recycling-v1&exercise=batch-1');await expect(page.locator('[data-skill="recycling"]')).toHaveAttribute('aria-current','page');await expect(page.locator('[data-skill="recycling"]')).toBeEnabled();}
async function teach(page){
  await page.evaluate(()=>WorkshopGame.openCityModel('model'));
  await page.locator('#libraryBrain').selectOption('knn');
  await page.getByRole('button',{name:'Train a new version',exact:true}).click();
  await expect(page.locator('#libraryModelInfo')).toContainText('15 observations');
  await page.getByRole('button',{name:'Use this version on the selected Model',exact:true}).click();
  await page.locator('#modelLibrary').getByRole('button',{name:'Close',exact:true}).click();
}
test('build, train, save, run City graph, reset and edit exact source',async({page},info)=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await ready(page);const source=await page.evaluate(()=>WorkshopGame.sourceMachineId());
  await teach(page);
  await page.locator('[data-save-sorter]').click();await expect(page.locator('[data-save-status]')).toHaveText('Saved for City');
  const expected=await page.evaluate(async()=>{
    const {createProjectStore}=await import('/city-common/project-store.js'),store=createProjectStore();await store.openActiveProject();
    const machine=await store.readSection('recyclingMachine');const {selectItems}=await import('/city-common/recycling.js');
    return WorkshopRecyclingMachine.run(machine,selectItems(WorkshopLibraryData.cityRecycling.photos,{seed:1,count:9}));
  });
  await page.screenshot({path:info.outputPath('workshop.png')});
  await page.evaluate(()=>localStorage.setItem('p5_city_planner_layout_v1',JSON.stringify({version:2,scaleMeters:2000,roads:[],buildings:[],parks:[]})));
  await page.locator('[data-city]').click();
  await page.locator('#entry-local').click();
  await page.waitForFunction(()=>window.__cityActivities?.trial,null,{timeout:90000});
  const actual=await page.evaluate(()=>{const a=__cityActivities;a.trial.run();while(a.trial.state==='running')a.trial.advance();a.update(0);return a.trial.results;});
  expect(actual.map(r=>[r.prediction,r.bin])).toEqual(expected.map(r=>[r.prediction,r.bin]));
  expect(actual).toHaveLength(9);expect(actual.filter(r=>!r.abstained)).toHaveLength(9);
  await page.locator('[data-act="reset"]').click();await expect(page.locator('.city-activity-panel')).toHaveAttribute('data-state','ready');
  await page.locator('[data-act="run"]').click();await page.locator('[data-act="pause"]').click();
  await expect(page.locator('.city-activity-panel')).toHaveAttribute('data-state','paused');
  await page.locator('.city-activity-panel [data-improve]').click();
  await expect(page.locator('[data-skill="recycling"]')).toHaveAttribute('aria-current','page');
  expect(await page.evaluate(()=>WorkshopGame.sourceMachineId())).toBe(source);
  expect(errors).toEqual([]);
});
test('failed publication keeps saved version and failed draft save blocks tab navigation',async({page})=>{
  await ready(page);await teach(page);await page.locator('[data-save-sorter]').click();await expect(page.locator('[data-save-status]')).toHaveText('Saved for City');
  const revision=await page.evaluate(async()=>{const {createProjectStore}=await import('/city-common/project-store.js');const s=createProjectStore();await s.openActiveProject();return (await s.readSection('recyclingMachine')).revision;});
  await page.evaluate(()=>{const draft=WorkshopGame.recyclingDraft();draft.table.pieces.find(p=>p.type==='bin').cityDestination='';WorkshopGame.__setTableForTest(draft.table);});
  await page.locator('[data-save-sorter]').click();await expect(page.locator('[data-save-status]')).toContainText('City keeps the previous sorter');
  expect(await page.evaluate(async()=>{const {createProjectStore}=await import('/city-common/project-store.js');const s=createProjectStore();await s.openActiveProject();return (await s.readSection('recyclingMachine')).revision;})).toBe(revision);
  await page.evaluate(()=>{WorkshopGame.saveDrivingMachine=async()=>{throw Error('Storage unavailable');};});
  await page.locator('[data-skill="driving"]').click();await expect(page.locator('.skill-status')).toHaveText('Storage unavailable');await expect(page.locator('[data-skill="recycling"]')).toHaveAttribute('aria-current','page');
});
test('Traditional Chinese tablet header, keyboard and preserved workbench',async({page},info)=>{
  await page.setViewportSize({width:1024,height:768});await page.addInitScript(()=>{localStorage.setItem('hk_ai_city_lang_v1','zh-Hant');localStorage.setItem('workshop.lang','zh-Hant');});
  await ready(page);await expect(page.locator('[data-save-sorter]')).toHaveText('儲存分類機');
  expect(await page.locator('.workshop-skills').evaluate(n=>n.closest('header')!==null)).toBe(true);
  await page.locator('[data-skill="free"]').focus();await page.keyboard.press('Enter');await expect(page.locator('[data-skill="free"]')).toHaveAttribute('aria-current','page');
  await page.locator('[data-skill="recycling"]').click();await expect(page.locator('[data-skill="recycling"]')).toHaveAttribute('aria-current','page');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const point=await page.evaluate(()=>{const d=WorkshopFloor.debug(),o=d.plan.objects['bin-metal'],r=document.querySelector('#floor canvas').getBoundingClientRect();return {x:r.x+o.cx-d.view.x,y:r.y+o.cy-d.view.y+8};});
  const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
  for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:point.x-i*8,y:point.y+16}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  expect(await page.evaluate(()=>WorkshopGame.recyclingDraft().table.pieces.find(p=>p.id==='bin-metal').fx)).toBeLessThan(.85);
  expect(await page.evaluate(()=>WorkshopGame.recyclingDraft().table.pieces.find(p=>p.id==='bin-metal').cityDestination)).toBe('metal');
  await page.screenshot({path:info.outputPath('workshop-tablet-zh.png')});
});
test('an older public saved model can be placed into the existing recycling graph',async({page})=>{
  await ready(page);
  await page.evaluate(async()=>{
    const {createProjectStore}=await import('/city-common/project-store.js');const store=createProjectStore();await store.openActiveProject();
    const examples=WorkshopLibraryData.cityRecycling.photos.filter(r=>r.split==='train').map(r=>({label:r.label,vector:WorkshopGame.unitVec(r.vector),source:{id:'library:'+r.id}}));
    await store.mutate(p=>{p.projects.sorterModels={older:{name:'Earlier sorter',examples,capability:{model:{k:3,threshold:.2}}}};return p;});
  });
  const point=await page.evaluate(()=>{const d=WorkshopFloor.debug(),o=d.plan.objects.model,r=document.querySelector('#floor canvas').getBoundingClientRect();return {x:r.x+o.cx-d.view.x,y:r.y+o.cy-d.view.y};});
  await page.mouse.click(point.x,point.y);
  await page.getByRole('button',{name:'Place an older saved model',exact:true}).click();
  await page.getByRole('button',{name:'Earlier sorter',exact:true}).click();
  await page.locator('[data-save-sorter]').click();await expect(page.locator('[data-save-status]')).toHaveText('Saved for City');
  expect(await page.evaluate(()=>WorkshopGame.recyclingDraft().table.pieces.find(p=>p.id==='model').learning.cam.brain.shelves.metal.length)).toBe(5);
});
