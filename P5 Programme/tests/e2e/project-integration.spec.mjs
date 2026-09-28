import { test, expect } from '@playwright/test';

async function blank(page) {
  await page.route('**/integration-blank', route => route.fulfill({ contentType:'text/html', body:'<!doctype html><title>Storage integration</title><body></body>' }));
  await page.goto('/integration-blank');
}

test('stale checkpoint/export, isolated switch and complete asset restore', async ({ page }) => {
  await blank(page);
  const result = await page.evaluate(async () => {
    const { createProjectStore } = await import('/city-common/project-store.js');
    const { downloadProject, buildProjectBackup, restoreProjectBackup, switchWorkspaceProject } = await import('/city-common/backup-coordinator.js');
    const { customModelStore } = await import('/city-common/custom-models.js');
    const a = createProjectStore(), b = createProjectStore();
    const first = await a.openActiveProject(); await b.openActiveProject();
    await a.award({ id:'earned', title:'Earned', amount:70 });
    await b.checkpoint();
    const balance = (await b.exportProject()).archive.project.economy.balance;
    localStorage.setItem('hk_ai_city_accessories_v1', '{"hat":"free-hat"}');
    localStorage.setItem('hk_ai_city_lang_v1','zh-Hant');
    await import('/workshop/toolbox/champion-session.js');
    const session = await ChampionSession.create({kind:'ai-champion',version:1,champion:{name:'Ada'},projects:{workshop:{v:1,current:'m1',machines:{m1:{v:1,name:'Editable'}}},'3d-studio':{version:1,future:{keep:true}}}});
    await session.edit(f => { f.projects.foreign = { keep:'unknown' }; return f; });
    // Minimal valid GLB (JSON only) exercises the real byte store and archive.
    const json = new TextEncoder().encode('{"asset":{"version":"2.0"}} ');
    const pad = Math.ceil(json.length/4)*4;
    const bytes = new ArrayBuffer(20+pad), view = new DataView(bytes);
    view.setUint32(0,0x46546c67,true); view.setUint32(4,2,true); view.setUint32(8,bytes.byteLength,true);
    view.setUint32(12,pad,true); view.setUint32(16,0x4e4f534a,true);
    new Uint8Array(bytes,20).fill(32); new Uint8Array(bytes,20,json.length).set(json);
    await customModelStore.put({id:'model-a',name:'Model A',bytes});
    localStorage.setItem('hk_ai_city_custom_models_v1',JSON.stringify({version:2,models:[{id:'model-a',name:'Model A'}]}));
    const archive = await buildProjectBackup(a);
    const copy = await a.copyProject(first.id,'Copy');
    session.close();
    // The restore below also exercises a fresh imported identity.

    // A successful switch requires rebinding editor objects through a reload.
    const restored = await restoreProjectBackup(archive,{store:a});
    const file = restored.project.projects.workshop.champion;
    const model = await customModelStore.get('model-a', restored.project.id);
    return { balance, newId: restored.project.id !== first.id, modelBytes:model?.bytes.byteLength,
      expectedBytes:bytes.byteLength, unknown:file.projects.foreign.keep, studio:file.projects['3d-studio'].future.keep,
      wallet:restored.project.economy.balance, language:localStorage.getItem('hk_ai_city_lang_v1') };
  });
  expect(result).toMatchObject({balance:70,newId:true,unknown:'unknown',studio:true,wallet:70,language:'zh-Hant'});
  expect(result.modelBytes).toBe(result.expectedBytes);
});

test('corrupt and missing asset restores preserve the active project', async ({page}) => {
  await blank(page);
  const result = await page.evaluate(async () => {
    const {createProjectStore,attachArchiveAsset} = await import('/city-common/project-store.js');
    const {restoreProjectBackup} = await import('/city-common/backup-coordinator.js');
    const store=createProjectStore(), project=await store.openActiveProject();
    const archive=(await store.exportProject()).archive;
    archive.manifest.assetReferences={models:[{id:'missing',hash:'missing'}]};
    let failed=false;try {await restoreProjectBackup(archive,{store});} catch {failed=true;}
    return {failed,same:localStorage.getItem('passiona_active_project_v1')===project.id};
  });
  expect(result).toEqual({failed:true,same:true});
});


test('switch clears absent project keys and old tabs cannot edit', async ({ page, context }) => {
  await blank(page);
  const first = await page.evaluate(async () => {
    const {createProjectStore} = await import('/city-common/project-store.js');
    window.store=createProjectStore(); return (await store.openActiveProject()).id;
  });
  const other=await context.newPage(); await blank(other);
  await other.evaluate(async () => { const {createProjectStore}=await import('/city-common/project-store.js'); window.old=createProjectStore(); await old.openActiveProject(); });
  const second = await page.evaluate(async () => (await store.createProject('Empty')).id);
  await page.reload();
  await page.evaluate(async first => {
    const {createProjectStore}=await import('/city-common/project-store.js');
    const store=createProjectStore(); await store.openActiveProject(); await store.switchProject(first);
  },first);
  await page.reload();
  await page.evaluate(async second => {
    const {createProjectStore}=await import('/city-common/project-store.js');
    const {switchWorkspaceProject}=await import('/city-common/backup-coordinator.js');
    const store=createProjectStore(); await store.openActiveProject();
    localStorage.setItem('hk_ai_city_props_citybuilder_v1','{"version":1,"props":[]}');
    localStorage.setItem('hk_ai_city_accessories_v1','{"head":"head_crown"}');
    localStorage.setItem('hk_ai_city_lang_v1','zh-Hant');
    await switchWorkspaceProject(store,second);
  },second);
  expect(await page.evaluate(() => [localStorage.getItem('hk_ai_city_props_citybuilder_v1'),localStorage.getItem('hk_ai_city_accessories_v1'),localStorage.getItem('hk_ai_city_lang_v1')])).toEqual([null,null,'zh-Hant']);
  expect(await other.evaluate(async()=> (await old.award({id:'late',title:'Old tab',amount:50})).ok)).toBe(false);
});

test('Hub download/upload controls restore editable Champion sections in an empty browser', async ({page,browser}) => {
  await page.goto('/hub/');
  await page.waitForFunction(()=>document.querySelector('#health')?.textContent.includes('Saved on this device'));
  await page.evaluate(async()=>{
    await import('/workshop/toolbox/champion-session.js');
    const session=await ChampionSession.create({kind:'ai-champion',version:1,champion:{name:'Portable'},projects:{}});
    await session.edit(f=>{f.projects.workshop={v:1,current:'machine-1',machines:{'machine-1':{v:1,name:'My machine',pieces:[],wires:[]}}};f.projects['3d-studio']={version:1,future:{editable:true}};return f;});
    await session.flush(); session.close();
  });
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#download-project').click()]);
  expect(download.suggestedFilename()).toMatch(/\.passiona$/);
  const path=await download.path();
  const empty=await browser.newContext(); const fresh=await empty.newPage();
  await fresh.goto('/hub/');
  await fresh.waitForFunction(()=>document.querySelector('#health')?.textContent.includes('Saved on this device'));
  await fresh.locator('#open-project').setInputFiles(path);
  await fresh.waitForEvent('load');
  const restored=await fresh.evaluate(async()=>{
    await import('/workshop/toolbox/champion-session.js');
    const session=await ChampionSession.create({kind:'ai-champion',version:1,champion:{name:'Default'},projects:{}});
    const result={machine:session.file.projects.workshop.machines['machine-1'].name,studio:session.file.projects['3d-studio'].future.editable};
    await session.edit(f=>{f.projects.workshop.machines['machine-1'].name='Edited after restore';return f;});
    return result;
  });
  expect(restored).toEqual({machine:'My machine',studio:true}); await empty.close();
});

test('activation quota failure and interrupted staging keep the previous project usable', async ({page}) => {
  await blank(page);
  const result=await page.evaluate(async()=>{
    const {createProjectStore}=await import('/city-common/project-store.js');
    const {restoreProjectBackup}=await import('/city-common/backup-coordinator.js');
    const store=createProjectStore(), prior=await store.openActiveProject();
    localStorage.setItem('hk_ai_city_accessories_v1','{"head":"head_crown"}');
    const archive=(await store.exportProject()).archive;
    const staged=await store.importProject(archive,{stage:()=>{throw Error('Interrupted model storage');}});
    const original=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){
      if(key==='passiona_active_project_v1' && value!==prior.id) throw new DOMException('Quota exceeded','QuotaExceededError');
      return original.call(this,key,value);
    };
    let failed=false;
    try { await restoreProjectBackup(archive,{store}); } catch { failed=true; }
    finally {Storage.prototype.setItem=original;}
    const award=await store.award({id:'after-failure',title:'Still usable',amount:10});
    return {staged:staged.ok,failed,same:localStorage.getItem('passiona_active_project_v1')===prior.id,equipment:localStorage.getItem('hk_ai_city_accessories_v1'),usable:award.ok};
  });
  expect(result).toEqual({staged:false,failed:true,same:true,equipment:'{"head":"head_crown"}',usable:true});
});
