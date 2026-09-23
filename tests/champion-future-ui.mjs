import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const b=await chromium.launch(),c=await b.newContext(),p=await c.newPage(),errors=[];
const origin=process.env.DEMO_ORIGIN||'http://localhost:8378';p.on('pageerror',e=>errors.push(e.message));
try {
 await p.goto(origin+'/workshop/');await p.waitForSelector('#runBtn');
 const section={v:9,opaque:{never:'change'}},file={kind:'ai-champion',version:1,champion:{name:'Demo'},projects:{workshop:section,'3d-studio':{version:9,opaque:'keep'}}};
 await p.setInputFiles('#loadInput',{name:'future.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(file))});await p.waitForFunction(()=>__championSession.file.projects.workshop?.v===9);
 assert.equal(await p.evaluate(()=>WorkshopGame.championFile().champion.name),'Demo');assert.equal(await p.evaluate(()=>document.getElementById('floor').inert),true);
 assert.equal(await p.evaluate(()=>WorkshopGame.addMachines('{}')),false);assert.deepEqual(await p.evaluate(()=>__championSession.file.projects.workshop),section);
 const before=await p.evaluate(()=>__championSession.file.champion.id);await p.setInputFiles('#loadInput',{name:'outer.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...file,version:999}))});await p.waitForTimeout(100);assert.equal(await p.evaluate(()=>__championSession.file.champion.id),before);
 await p.goto(origin+'/studio/');await p.waitForFunction(()=>window.__studioReady);assert.equal(await p.evaluate(()=>document.getElementById('main').inert),true);assert.deepEqual(await p.evaluate(()=>__championSession.file.projects['3d-studio']),{version:9,opaque:'keep'});
 const bad=await p.evaluate(()=>{
  const f=__championSession.file;f.projects['3d-studio']={version:1,encoding:1,data:ChampionSession.encode({snapshot:{objects:[{kind:'custom',geo:{positions:[]},transform:{p:[0,0,0],r:[0,0,0],s:[1,1,1]}}]},wardrobe:[]})};return f;
 });
 await p.setInputFiles('#champion-file-controls input[type=file]',{name:'invalid-geometry.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bad))});
 await p.waitForFunction(()=>document.getElementById('toast')?.textContent.includes('geometry is incomplete'));assert.deepEqual(await p.evaluate(()=>__championSession.file.projects['3d-studio']),{version:9,opaque:'keep'});
 assert.deepEqual(errors,[]);console.log('PASS Future nested versions are preserved read-only; invalid outer files/geometry leave current work unchanged; imported name is preserved.');
} finally {await c.close();await b.close()}
