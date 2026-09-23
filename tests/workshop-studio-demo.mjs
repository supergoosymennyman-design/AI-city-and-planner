/** Non-invasive localhost acceptance. Every run uses disposable browser storage. */
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
const origin = process.env.DEMO_ORIGIN || 'http://localhost:8378';
const artifacts = '/tmp/passiona-demo-verification'; await mkdir(artifacts,{recursive:true});
const browser = await chromium.launch({headless:true});
const context = await browser.newContext({viewport:{width:1024,height:768},acceptDownloads:true});
const page = await context.newPage(); page.setDefaultTimeout(12000);
const errors=[], requests=[]; let delayed=null;
context.on('page',p=>p.on('pageerror',e=>errors.push(e.message))); page.on('pageerror',e=>errors.push(e.message));
await context.route('**/api/turn',async route=>{
 const body=route.request().postDataJSON();requests.push(body);
 if(body.message==='Wait for switching'){ delayed=route; return; }
 const actions=body.message==='Add a lamp named Demo light' ? [{op:'addItems',slot:'blocks',ids:['lamp Demo light']}] : body.message==='Remember my explanation style' ? [{op:'rememberUser',note:'Explanation style: short examples'}] : [];
 await route.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({type:'done',reply:'I can inspect your blocks and the observed results. Training teaches; Dev helps tune; Test is held back for a final check. A score does not prove mastery.',actions})+'\n'});
});
const step = text => console.log('PASS',text);
async function chat(message) {
 if(await page.locator('.bw-panel[hidden]').count()) await page.click('.bw-bubble');
 if(await page.locator('.bw-panel .gate input:visible').count()) {await page.fill('.bw-panel .gate input','Demo Buddy');await page.click('.bw-panel .gate button:last-child');}
 await page.fill('.bw-panel form input',message);await page.click('.bw-panel form button');
 if(message!=='Wait for switching') { await page.waitForFunction(()=>!document.querySelector('.bw-panel form button')?.disabled); await page.waitForTimeout(150); }
}
async function downloadWorkshop() {
 await page.keyboard.press('Escape'); await page.click('#fileBtn');
 const event=page.waitForEvent('download');await page.locator('#fileDrawer').getByRole('button',{name:'Save',exact:true}).click();
 return JSON.parse(await readFile(await (await event).path(),'utf8'));
}
try {
 await page.goto(origin+'/workshop/?view=blueprint');await page.waitForSelector('#runBtn');
 const initial=await page.evaluate(()=>{
  const G=WorkshopGame, machine=G.serializeDebug();machine.pieces=[G.defaultBlock('feeder','feed',0,0)];machine.snaps=[];machine.wires=[];
  return {kind:'ai-champion',version:1,champion:{name:'Demo Champion',id:'demo-test-id'},buddy:{name:'Demo Buddy'},projects:{workshop:{v:1,current:'demo',machines:{demo:machine}},foreign:{version:88,unchanged:[1,2,3]}}};
 });
 await page.setInputFiles('#loadInput',{name:'demo.champion.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(initial))});
 await page.waitForFunction(()=>window.__championSession?.file.champion.name==='Demo Champion');
 step('1 · Open a Champion File and inspect its machine');
 await page.waitForSelector('.bw-bubble');await page.click('.bw-bubble');await chat('Inspect this machine');
 assert(requests.at(-1).projectState.slots.blocks.items.some(x=>x.includes('feed')));step('2 · Buddy receives current machine structure');
 await chat('Add a lamp named Demo light');await page.waitForFunction(()=>WorkshopGame.tableDebug().pieces.some(p=>p.type==='lamp'));
 assert.equal(await page.locator('.bw-panel .actions').count(),0);step('3 · Requested reversible edit applies once without a permission card');
 await page.evaluate(()=>WorkshopGame.undoAction());assert.equal(await page.evaluate(()=>WorkshopGame.tableDebug().pieces.filter(p=>p.type==='lamp').length),0);step('4 · Undo removes the edit');
 // Synthetic private examples only. Observe a real held-out evaluation, not a fabricated score.
 const result=await page.evaluate(async()=>{
  const G=WorkshopGame, table=G.tableDebug(), m=Object.assign(G.defaultBlock('sense','private-model',200,100),{senseId:'text',brainId:'knn',k:1,name:'Synthetic model'});
  const rows=Array.from({length:24},(_,i)=>({shelf:i%2?'garden':'kitchen',word:i%2?'SYNTHETIC_RAW_CANARY flowers garden '+i:'SYNTHETIC_RAW_CANARY cooking soup '+i}));
  const admitted=G.privateAdmitTyped(m,rows);if(!admitted.ok)throw Error(JSON.stringify(admitted));
  table.pieces.push(m);G.__setTableForTest(table);const h=G.privateModelHandle(m);G.Private.updateSplit(h,{seed:14});
  return G.privateEvaluate(table.pieces,m.id,'validation',{seed:7});
 });
 assert.equal(result.ok,true,JSON.stringify(result));
 await chat('Explain my observed results');const privateBody=requests.at(-1);
 assert(privateBody.projectState.findings.some(f=>f.kind==='observedResult'));assert(!JSON.stringify(privateBody).includes('SYNTHETIC_RAW_CANARY'));step('5 · Private-session machine and real result summaries reach Buddy; raw examples do not');
 await chat('Remember my explanation style');await page.locator('.memory-card').getByRole('button',{name:'Remember this',exact:true}).click();
 await page.waitForFunction(()=>window.__championSession.file.buddy.preferences?.values.explanationStyle==='short examples');step('6 · Explicit memory is saved portably');
 await page.keyboard.press('Escape');await page.click('#fileBtn');await page.click('#championCredits');
 const credits=page.locator('.champion-credits');await credits.getByLabel('Teacher PIN').fill('7391');await credits.getByRole('button',{name:'Set up teacher PIN'}).click();await credits.getByRole('status').filter({hasText:'Teacher PIN set'}).waitFor();
 await credits.getByLabel('Teacher PIN').fill('7391');await credits.getByLabel('Activity title').fill('Inspect and explain errors');await credits.getByLabel('Award credits').fill('100');
 page.on('dialog',d=>d.accept());await credits.getByRole('button',{name:'Award credits',exact:true}).click();await page.waitForFunction(()=>__championSession.file.economy.balance===100);
 await credits.getByLabel('Teacher PIN').fill('7391');await credits.getByRole('button',{name:'Award credits',exact:true}).click();await credits.getByRole('status').filter({hasText:'Award saved once'}).waitFor();assert.equal(await page.evaluate(()=>__championSession.file.economy.balance),100);
 await credits.getByRole('button',{name:'Close',exact:true}).click();step('7 · Teacher award requires a local PIN; retry awards only once');
 const workshopFile=await downloadWorkshop();assert.equal(workshopFile.economy.balance,100);assert(!JSON.stringify(workshopFile).includes('verifier'));assert(!JSON.stringify(workshopFile).includes('7391'));assert.deepEqual(workshopFile.projects.foreign,initial.projects.foreign);step('8 · Save complete Champion File with memory and credits');
 if (!await page.locator('#openStudio').isVisible()) await page.click('#fileBtn');await page.click('#openStudio');await page.waitForFunction(()=>window.__studioReady);await page.getByRole('button',{name:/Let's go/}).click();
 if (!await page.locator('[data-model-id="rocket-cone"]').isVisible()) await page.click('#shop-toggle');
 await page.waitForSelector('[data-model-id="rocket-cone"]');assert.equal(await page.evaluate(()=>__shop.getState().coins),100);
 await page.locator('[data-model-id="rocket-cone"] [data-action="buy"]').click();await page.waitForFunction(()=>__championSession.file.economy.owned.includes('rocket-cone'));assert.equal(await page.evaluate(()=>__championSession.file.economy.balance),60);step('9 · Studio purchase atomically spends 40 and owns Rocket Cone');
 const before=await page.evaluate(()=>__studio.shapes.length);
 await page.locator('[data-model-id="rocket-cone"] [data-action="place"]').click();await page.waitForFunction(n=>__studio.shapes.length===n+1,before);
 await page.locator('[data-model-id="rocket-cone"] [data-action="place"]').click();await page.waitForFunction(n=>__studio.shapes.length===n+2,before);assert.equal(await page.evaluate(()=>__championSession.file.economy.balance),60);
 await page.click('#undo');assert.equal(await page.evaluate(()=>__studio.shapes.length),before+1);await page.click('#redo');assert.equal(await page.evaluate(()=>__studio.shapes.length),before+2);
 assert(await page.locator('#shop-debug').isHidden());step('10 · Repeated placement is free; production developer controls are hidden');
 const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Save Champion File',exact:true}).click();
 const studioFile=JSON.parse(await readFile(await (await downloaded).path(),'utf8'));assert(studioFile.projects['3d-studio'].data);assert.deepEqual(studioFile.projects.foreign,initial.projects.foreign);
 await page.screenshot({path:artifacts+'/studio-tablet.png'});await page.getByRole('button',{name:'Return to Workshop',exact:true}).click();await page.waitForSelector('#runBtn');step('11 · Studio editable work saves alongside the machine and memory');
 await page.waitForSelector('.bw-bubble');await page.click('.bw-bubble');await chat('What do I own now?');const returned=requests.at(-1);assert.equal(returned.projectState.readouts.credits,60);assert(returned.projectState.slots.ownedGear.items.includes('rocket-cone'));assert(returned.notes.includes('short examples'));assert(!JSON.stringify(requests).includes('7391'));await page.screenshot({path:artifacts+'/workshop-tablet.png'});step('12 · Returned Buddy sees updated credits, actual ownership and portable memory');
 // Same-origin second browser tab: transaction atomicity, stale project writes and replacement.
 const tab=await context.newPage();await tab.goto(origin+'/workshop/');await tab.waitForSelector('#runBtn');
 const purchases=await Promise.all([page.evaluate(()=>__championSession.transaction({id:'parallel-a',type:'purchase',title:'Atomic item',item:'atomic-item',amount:40}).then(()=>true)),tab.evaluate(()=>__championSession.transaction({id:'parallel-b',type:'purchase',title:'Atomic item',item:'atomic-item',amount:40}).then(()=>true))]);assert(purchases.every(Boolean));
 await tab.evaluate(()=>__championSession.refresh());assert.equal(await tab.evaluate(()=>__championSession.file.economy.balance),20);
 const stale=await page.evaluate(async()=>{try{await __championSession.edit(f=>({...f,bogus:'stale'}));return false}catch{return true}});assert(stale);step('Concurrent tabs charge once and reject stale whole-document writes');
 // Snapshot replacement with SAME champion ID must invalidate a stale economic operation.
 const replacement=await tab.evaluate(()=>__championSession.file);await tab.evaluate(f=>__championSession.replace(f),replacement);
 assert(await page.evaluate(async()=>{try{await __championSession.transaction({id:'late',type:'purchase',title:'Late',item:'late',amount:1});return false}catch{return true}}));step('Same-ID replacement invalidates pending operations');
 await page.reload();await page.waitForSelector('.bw-bubble');await page.click('.bw-bubble');await chat('Wait for switching');await page.waitForTimeout(100);
 const next={...initial,champion:{name:'Other Champion',id:'other-demo-id'}};
 await page.setInputFiles('#loadInput',{name:'other.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(next))});await page.waitForFunction(()=>__championSession.file.champion.id==='other-demo-id');
 if(delayed) await delayed.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({type:'done',reply:'Late answer',actions:[{op:'addItems',slot:'blocks',ids:['lamp Late lamp']}]})+'\n'}).catch(()=>{});
 await page.waitForTimeout(150);assert(!await page.evaluate(()=>WorkshopGame.tableDebug().pieces.some(p=>p.name==='Late lamp')));step('Champion switching drops pending Buddy replies and actions');
 await tab.close();assert.deepEqual(errors,[]);step('No uncaught browser errors');
} catch(e) { console.log('REQUESTS', requests.map(r=>r.message)); console.log('CHAT', await page.locator('.bw-panel').innerText().catch(()=>'')); await page.screenshot({path:artifacts+'/failure.png'}); throw e; } finally { await context.close();await browser.close(); }
