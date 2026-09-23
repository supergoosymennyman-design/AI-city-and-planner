/** Optional live provider check, synthetic fixture in disposable browser storage. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch(),context=await browser.newContext({viewport:{width:1024,height:768}}),page=await context.newPage();
page.setDefaultTimeout(60000);
try {
 await page.goto((process.env.DEMO_ORIGIN||'http://localhost:8378')+'/workshop/?view=blueprint');await page.waitForSelector('#runBtn');
 const file=await page.evaluate(()=>{
  const machine=WorkshopGame.serializeDebug();machine.pieces=[WorkshopGame.defaultBlock('feeder','f1',0,0)];machine.snaps=[];machine.wires=[];
  return {kind:'ai-champion',version:1,champion:{name:'Synthetic Demo'},economy:{version:1,balance:60,owned:['rocket-cone'],transactions:[]},buddy:{name:'Demo Buddy'},projects:{workshop:{v:1,current:'demo',machines:{demo:machine}}}};
 });
 await page.setInputFiles('#loadInput',{name:'synthetic.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(file))});
 await page.waitForFunction(()=>__championSession.file.champion.name==='Synthetic Demo');await page.waitForSelector('.bw-bubble');await page.click('.bw-bubble');
 if (await page.locator('.bw-panel .gate input:visible').count()) { await page.fill('.bw-panel .gate input','Demo Buddy'); await page.click('.bw-panel .gate button:last-child'); }
 const response=page.waitForResponse(r=>r.url().endsWith('/api/turn')&&r.request().method()==='POST');
 await page.fill('.bw-panel form input','What is my credit balance, which exact catalog ID do I own, and which blocks are on the table? Use only the supplied current state.');await page.click('.bw-panel form button');
 const result=await response,frames=(await result.text()).split('\n').filter(Boolean).map(l=>JSON.parse(l));const done=frames.find(f=>f.type==='done');
 assert.equal(result.status(),200);assert(done?.reply);assert.equal(done.source,'live');assert.match(done.reply,/60/);assert.match(done.reply,/rocket.cone/i);assert.match(done.reply,/feeder/i);
 console.log('PASS Live configured-provider browser turn:',done.reply);
 await page.screenshot({path:'/tmp/passiona-demo-verification/live-provider.png'});
} finally {await context.close();await browser.close();}
