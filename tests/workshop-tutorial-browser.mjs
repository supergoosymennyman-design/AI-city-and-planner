import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const repo = fileURLToPath(new URL('../', import.meta.url));
const origin = process.env.WORKSHOP_TEST_ORIGIN || 'http://localhost:18379';
const server = process.env.WORKSHOP_TEST_ORIGIN ? null : spawn(process.execPath,
 ['P5 Programme/tests/e2e/static-server.mjs', '18379'], {
  cwd: repo, env: { ...process.env, E2E_DOCROOT: 'P5 Programme/buddy-kit/client' }, stdio: 'ignore',
 });
let browser;

async function tick(page) { await page.evaluate(() => WorkshopFloor.paintNow()); }
async function panTo(page, id) {
 await page.evaluate(id => {
  WorkshopFloor.revealTutorialTargets([id]);
  const d=WorkshopFloor.debug(),o=d.plan.objects[id],c=document.querySelector('.floorcanvas').getBoundingClientRect();
  // Position the camera for the next physical gesture; geometry tests below
  // separately assert that the tutorial does not move partially visible parts.
  d.view.x=Math.max(0,o.cx-c.width/2);d.view.y=Math.max(0,o.cy-c.height/2);
 }, id); await tick(page);
}
async function socket(page,id,port) { return page.evaluate(([id,port]) => WorkshopFloor.screenPointFor(id,port),[id,port]); }
async function checkGeometry(page, step) {
 return page.evaluate(step => {
  const close=(a,b)=>Math.abs(a-b)<1.1;
  if(step.phase==='part') {
   const r=WorkshopFloor.rectForPiece(step.pieceId),h=document.querySelector('.tutorial-highlight').getBoundingClientRect();
   return close(r.x+r.w/2,h.x+h.width/2)&&close(r.y+r.h/2,h.y+h.height/2);
  }
  return ['from','to'].every(role=>{
   const e=step[role],p=WorkshopFloor.screenPointFor(e.block||e.piece,e.port||e.end),r=document.querySelector('.tutorial-anchor-'+role).getBoundingClientRect();
   return close(p.x,r.x+r.width/2)&&close(p.y,r.y+r.height/2);
  });
 },step);
}
try {
 for (let attempt=0;attempt<30;attempt++) {
  try { if((await fetch(origin+'/workshop/')).ok) break; } catch {}
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 browser=await chromium.launch();
 for (const [kind,width,height,touch] of [['designcar',1280,900,false],['mysterycar',1024,768,true]]) {
  const context=await browser.newContext({viewport:{width,height},hasTouch:touch,reducedMotion:touch?'reduce':'no-preference'}), page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/workshop/');await page.waitForFunction(()=>window.WorkshopTutorial?.enter);
  const original=await page.evaluate(()=>({table:WorkshopGame.serializeDebug(),storage:{...localStorage}}));
  await page.click('#tutorialBtn');await page.click(`[data-tutorial="${kind}"]`);await page.waitForFunction(()=>!WorkshopTutorial.debug().locked);
  const full=await page.evaluate(()=>WorkshopGame.serializeDebug());
  const steps=await page.evaluate(kind=>WorkshopTutorialScript.buildSteps(WorkshopGame.serializeDebug(),kind),kind);
  const reference=await page.evaluate(()=>structuredClone(WorkshopFloor.debug().plan.objects));
  await page.evaluate(()=>{
   const d=WorkshopFloor.debug(),o=Object.values(d.plan.objects)[0],saved={...d.view};
   d.view.x=o.x+o.w-5;d.view.y=Math.max(0,o.y-10);
   const before={...d.view};WorkshopFloor.revealTutorialTargets([o.id]);
   if(d.view.x!==before.x||d.view.y!==before.y) throw Error('Partially visible target moved the camera');
   d.view.x=o.x+o.w+50;WorkshopFloor.revealTutorialTargets([o.id]);
   if(d.view.x===o.x+o.w+50) throw Error('Invisible target was not revealed');
   WorkshopFloor.restoreView(saved);
  });
  await page.click('.tutorial-next');
  if(!touch) assert.equal(await page.locator('.tutorial-ghost').evaluate(e=>e.getAnimations()[0].effect.getTiming().duration),2100);
  for(let i=0;i<steps.length;i++) {
   const step=steps[i];await tick(page);assert(await checkGeometry(page,step),`${kind} geometry ${i}`);
   if(step.phase==='part') {
    let pt=await page.evaluate(()=>{const r=document.querySelector('.tutorial-slot').getBoundingClientRect(),c=document.querySelector('.floorcanvas').getBoundingClientRect();return {x:(Math.max(r.left,c.left)+Math.min(r.right,c.right))/2,y:(Math.max(r.top,c.top)+Math.min(r.bottom,c.bottom))/2};});

    const visible=await page.evaluate(()=>{const r=document.querySelector('.tutorial-slot').getBoundingClientRect(),c=document.querySelector('.floorcanvas').getBoundingClientRect();return {w:Math.min(r.right,c.right)-Math.max(r.left,c.left),h:Math.min(r.bottom,c.bottom)-Math.max(r.top,c.top),cy:r.y+r.height/2,top:c.top,bottom:c.bottom};});
    if(visible.h<12) {
      const y=visible.bottom-35;
      await page.mouse.move(30,y);await page.mouse.down();await page.mouse.move(30,y+(visible.cy<visible.top?100:-100),{steps:5});await page.mouse.up();await tick(page);
      pt=await page.locator('.tutorial-slot').evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};});
    }
    if(!touch && i===0) {
      const tile=page.locator(`.floorshelf .shelfobj[data-type="${step.type}"]`);
      await tile.scrollIntoViewIfNeeded();const box=await tile.boundingBox();
      const view=await page.evaluate(()=>({...WorkshopFloor.debug().view}));
      await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
      await page.mouse.move(pt.x,pt.y,{steps:8});
      assert.deepEqual(await page.evaluate(()=>({...WorkshopFloor.debug().view})),view,'drag keeps camera fixed');
      await page.mouse.up();
    } else if(touch) await page.touchscreen.tap(pt.x,pt.y);else await page.mouse.click(pt.x,pt.y);
   } else {
    const a=step.from.block||step.from.piece,b=step.to.block||step.to.piece;
    await panTo(page,a);const from=await socket(page,a,step.from.port||step.from.end);
    const dest=await socket(page,b,step.to.port||step.to.end);
    const canvas=await page.locator('.floorcanvas').boundingBox();
    const drag=!touch && i%2===0 && dest.x>24 && dest.x<width-24 && dest.y>canvas.y+24 && dest.y<canvas.y+canvas.height-24;
    if(drag) { await page.mouse.move(from.x,from.y);await page.mouse.down(); }
    else if(touch) await page.touchscreen.tap(from.x,from.y);
    else await page.mouse.click(from.x,from.y);
    await page.mouse.move(from.x+30,from.y+30);await tick(page);
    assert(await page.evaluate(()=>!!WorkshopFloor.debug().tutorialLead),`lead ${i}`);
    assert.deepEqual((await page.evaluate(()=>WorkshopFloor.debug().tutorialPorts)).sort(),[...new Set([a,b])].sort());
    if(drag) { await page.mouse.move(dest.x,dest.y,{steps:5});await page.mouse.up(); }
    else {
      if(i===steps.findIndex(s=>s.phase!=='part')) {
        await page.keyboard.press('Escape');
        assert.equal(await page.evaluate(()=>WorkshopFloor.debug().tutorialLead),null);
        assert.equal(await page.evaluate(()=>WorkshopTutorial.debug().mode),'tutorial-build');
        if(touch) await page.touchscreen.tap(from.x,from.y);else await page.mouse.click(from.x,from.y);
      }
      await panTo(page,b);const to=await socket(page,b,step.to.port||step.to.end);
      if(touch) await page.touchscreen.tap(to.x,to.y);else await page.mouse.click(to.x,to.y);
    }
    assert.equal(await page.locator('.plate:visible').count(),0);
   }

   assert.equal(await page.evaluate(()=>WorkshopTutorial.debug().stepIndex),i+1,`${kind} step ${i}`);
  }
  await page.click('.tutorial-next');await tick(page);
  assert.equal(await page.locator('.tutorial-slot:visible,.tutorial-anchor:visible,.tutorial-highlight.on,.tutorial-ghost,.shelfobj.tutorial-tile').count(),0);
  assert.equal(await page.evaluate(()=>WorkshopTutorial.placeCurrent()),false);
  const geometry=await page.evaluate(()=>({objects:WorkshopFloor.debug().plan.objects,bar:document.querySelector('.tutorial-testbar').getBoundingClientRect().toJSON(),canvas:document.querySelector('.floorcanvas').getBoundingClientRect().toJSON()}));
  assert(geometry.canvas.bottom<=geometry.bar.top);
  for(const [id,o] of Object.entries(geometry.objects)) for(const key of ['x','y','w','h']) {
   assert(Math.abs(o[key]-reference[id][key])<1e-6,`${id} preserved ${key}`);
  }
  await page.click('.tutorial-submit');assert((await page.evaluate(()=>WorkshopTutorial.debug().score))<100);
  await page.setViewportSize({width:width-100,height});await tick(page);
  assert(await page.evaluate(()=>[...document.querySelectorAll('.tutorial-mark')].every(m=>Number.isFinite(m.getBoundingClientRect().x))));
  await page.click('.tutorial-retry');assert.equal(await page.locator('.tutorial-mark').count(),0);
  // A focused UI fixture: rebuild a missing lamp with a freshly allocated id and
  // connect it using the ordinary Workshop canvas. No tutorial placement seam.
  await page.evaluate(()=>{
   const pick=WorkshopTutorialScript.pickRemoval;
   WorkshopTutorialScript.pickRemoval=(table,kind,seed)=>{
    const lamp=table.pieces.find(p=>p.type==='lamp');
    return {kind,seed,parts:[{id:lamp.id,type:lamp.type}],snaps:[],wires:[]};
   };
   window.__restorePick=()=>{WorkshopTutorialScript.pickRemoval=pick;};
  });
  await page.click('.tutorial-retry');await page.evaluate(()=>__restorePick());
  const oldLamp=full.pieces.find(p=>p.type==='lamp');
  await page.locator('.floorshelf .shelfobj[data-type="lamp"]').click();await tick(page);
  const newLamp=await page.evaluate(()=>WorkshopGame.serializeDebug().pieces.find(p=>p.type==='lamp').id);
  assert.notEqual(newLamp,oldLamp.id);
  await page.locator('.plate select').selectOption(oldLamp.colour);
  await page.locator('.plate input[type=number]').fill(String(oldLamp.seconds));
  await page.locator('.plate input[type=number]').press('Tab');
  await page.locator('.plate .pclose').click();
  await panTo(page,newLamp);
  const lampCentre=await page.evaluate(id=>WorkshopFloor.screenPointFor(id),newLamp);
  await page.mouse.move(lampCentre.x,lampCentre.y);await page.mouse.down();
  await page.mouse.move(lampCentre.x+60,lampCentre.y+40,{steps:5});await page.mouse.up();await tick(page);
  assert(await page.evaluate(id=>Number.isFinite(WorkshopGame.serializeDebug().pieces.find(p=>p.id===id).fx),newLamp));
  // Connect with the ordinary canvas gestures.
  for(const w of full.wires.filter(w=>w.from.block===oldLamp.id||w.to.block===oldLamp.id)) {
   const from=w.from.block===oldLamp.id?newLamp:w.from.block,to=w.to.block===oldLamp.id?newLamp:w.to.block;
   await panTo(page,from);const a=await socket(page,from,w.from.port);await page.mouse.click(a.x,a.y);
   await panTo(page,to);const b=await socket(page,to,w.to.port);await page.mouse.click(b.x,b.y);await tick(page);
  }
  await page.click('.tutorial-submit');assert.equal(await page.evaluate(()=>WorkshopTutorial.debug().score),100,`${kind} UI reconstruction`);
  await page.screenshot({path:`/private/tmp/tutorial-${kind}-verified.png`});
  await panTo(page,newLamp);
  const centre=await page.evaluate(id=>WorkshopFloor.screenPointFor(id),newLamp);
  await page.mouse.click(centre.x,centre.y);
  await page.locator('.plate input[type=number]').fill('3');await page.locator('.plate input[type=number]').press('Tab');
  await page.locator('.plate .pclose').click();await page.click('.tutorial-submit');
  assert.equal(await page.evaluate(()=>WorkshopTutorial.debug().wrong.length),1);
  const aligned=await page.evaluate(id=>{
   WorkshopFloor.debug().view.x+=30;WorkshopFloor.paintNow();
   const r=WorkshopFloor.rectForPiece(id),m=document.querySelector('.tutorial-mark-wrong').getBoundingClientRect();
   return Math.abs(r.x-m.x)<1&&Math.abs(r.y-m.y)<1;
  },newLamp);assert(aligned,'wrong-setting marker follows the actual moved piece');
  await page.locator('.floorshelf .shelfobj[data-type="lamp"]').click();await page.locator('.plate .pclose').click();
  await page.click('.tutorial-submit');assert((await page.evaluate(()=>WorkshopTutorial.debug().extra.length))>0);
  const extraLamp=await page.evaluate(id=>WorkshopGame.serializeDebug().pieces.find(p=>p.type==='lamp'&&p.id!==id).id,newLamp);
  await panTo(page,extraLamp);const extraCentre=await page.evaluate(id=>WorkshopFloor.screenPointFor(id),extraLamp);
  await page.mouse.click(extraCentre.x,extraCentre.y);await page.locator('.plate .pdel').click();
  await page.click('.tutorial-submit');assert.equal(await page.evaluate(()=>WorkshopTutorial.debug().extra.length),0);
  await page.click('.tutorial-exit');
  const restored=await page.evaluate(()=>({table:WorkshopGame.serializeDebug(),storage:{...localStorage}}));
  assert.deepEqual(restored,original,`${kind} restore and persistence`);
  assert.equal(await page.evaluate(()=>WorkshopFloor.debug().tutorialLead),null);
  await page.click('#tutorialBtn');await page.click(`[data-tutorial="${kind}"]`);
  assert.equal(await page.locator('.tutorial-mark').count(),0);
  await page.click('.tutorial-exit');
  assert.deepEqual(errors,[]);
  console.log(`PASS ${kind}: ${steps.length} UI steps, ${touch?'touch':'mouse'} wiring, independent UI reconstruction, retry, geometry and restore`);
  await context.close();
 }
} finally { await browser?.close(); server?.kill(); }
