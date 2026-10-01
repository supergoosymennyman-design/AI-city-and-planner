import {test,expect} from '@playwright/test';
import {boot,enterPlace} from './activity-helpers.mjs';

test('connected facility preserves every identity, freezes visuals and routes all seven destinations',async({page},testInfo)=>{
 test.setTimeout(240000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await boot(page);await enterPlace(page,'recycling');
 const panel=page.locator('.city-activity-panel');await expect(panel).toHaveAttribute('data-state','ready');await page.waitForFunction(()=>window.__scene.getObjectByName('recycling-lab-truck'));
 const result=await page.evaluate(async()=>{
  const THREE=await import('three'),{BINS}=await import('/city-common/recycling.js'),{RECYCLING_LAYOUT:L}=await import('/city-common/recycling-layout.js');
  const a=window.__cityActivities,t=a.trial,root=window.__scene.getObjectByName('recycling-facility');
  const visible=()=>{const rows=[];root.traverse(o=>{if(o.userData.recyclingItem&&o.visible)rows.push(o);});return rows;};
  const snapshot=()=>{const state=[];root.traverse(o=>{if(o.userData.recyclingItem||o.name.startsWith('gate-'))state.push([o.uuid,o.visible,o.position.toArray(),o.rotation.toArray()]);if(o.isInstancedMesh)state.push(Array.from(o.instanceMatrix.array));});return JSON.stringify(state);};
  const violations=[];t.machineResults=t.rows.map((row,i)=>({id:row.id,truth:row.label,decision:'deliberately-wrong',bin:BINS[i%7].id,confidence:1,abstained:i%7===6}));
  const original=new Map(visible().map(o=>[o.userData.objectId,o.uuid]));
  for(let tick=0;tick<360;tick++){
   t.step();a.update(0);const items=visible();if(new Set(items.map(o=>o.userData.objectId)).size!==items.length)violations.push('duplicate or missing at '+tick);
   for(const o of items){if(original.has(o.userData.objectId)&&o.uuid!==original.get(o.userData.objectId))violations.push('identity changed');original.set(o.userData.objectId,o.uuid);const b=new THREE.Box3().setFromObject(o),p=o.getWorldPosition(new THREE.Vector3());if(Math.abs(b.min.y-p.y)>.001)violations.push('ungrounded');}
   if(t.phase===26){const gates=root.children.filter(o=>o.name.startsWith('gate-')&&o.rotation.x!==0);if(gates.length!==1||gates[0].name!=='gate-'+t.current.bin)violations.push('wrong gate');}
   const before=snapshot();a.update(.1);if(snapshot()!==before)violations.push('paused visuals moved');
  }
  const truck=root.getObjectByName('recycling-lab-truck'),dock=truck.userData.docking,front=truck.getObjectByName('wheel-front-left'),rear=truck.getObjectByName('wheel-back-left');
  const local=o=>root.worldToLocal(o.getWorldPosition(new THREE.Vector3()));
  return {violations:[...new Set(violations)],results:t.results.length,stages:visible().map(o=>o.userData.stage),gap:L.hopper.x-L.hopper.w/2-dock.rearX,cabAway:local(front).x<local(rear).x,inside:Math.abs(dock.x)+dock.w/2<14&&Math.abs(dock.z)+dock.d/2<9};
 });expect(result.violations).toEqual([]);expect(result.results).toBe(12);expect(new Set(result.stages)).toEqual(new Set(['collected']));expect(result.gap).toBeCloseTo(.25);expect(result.cabAway&&result.inside).toBe(true);
 await panel.locator('[data-act="reset"]').click();await expect(panel).toHaveAttribute('data-state','ready');await panel.locator('[data-act="step"]').click();
 for(const viewport of [{width:1280,height:800},{width:1024,height:768},{width:834,height:1112}]){await page.setViewportSize(viewport);await page.waitForTimeout(250);await page.screenshot({path:testInfo.outputPath(`facility-${viewport.width}.png`)});}
 await page.setViewportSize({width:1280,height:800});
 // Orbit using the same controls children use, leaving the actual City renderer active.
 await page.mouse.move(450,340);await page.mouse.down();await page.mouse.move(850,340,{steps:4});await page.mouse.up();await page.screenshot({path:testInfo.outputPath('facility-opposite.png')});
 for(let i=0;i<3;i++){await page.evaluate(async()=>{window.__cityActivities.close();await window.__cityActivities.open('recycling');});await expect(panel).toHaveAttribute('data-state','ready');}
 await panel.locator('[data-act="scenario"]').selectOption('personal');await expect(panel).toHaveAttribute('data-state','ready');await expect(panel.locator('[data-act="run"]')).toBeDisabled();expect(await page.evaluate(()=>{let n=0;window.__scene.getObjectByName('recycling-facility').traverse(o=>{if(o.userData.recyclingItem&&o.visible)n++;});return n;})).toBe(0);
 expect(errors).toEqual([]);
});

test('presentation queue replenishes, disposal stabilises and failed truck loading leaves sorting usable',async({page},testInfo)=>{
 test.setTimeout(120000);await page.goto('/city-builder/');
 await page.evaluate(async()=>{
  const THREE=await import('three'),{createRecyclingPresentation}=await import('/city-builder/recycling-presentation.js'),{createWaste,WASTE}=await import('/city-common/city-waste-v2.js'),{ActivityTrial}=await import('/city-common/activity-trial.js');
  const scene=new THREE.Scene();scene.background=new THREE.Color(0xcbd2c5);const root=new THREE.Group();scene.add(root);scene.add(new THREE.HemisphereLight(0xffffff,0x778877,3));const sun=new THREE.DirectionalLight(0xffffff,2);sun.position.set(8,20,10);scene.add(sun);
  const camera=new THREE.PerspectiveCamera(45,1.6,.1,200);camera.position.set(24,24,28);camera.lookAt(-1,1,0);const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(1280,800);document.body.replaceChildren(renderer.domElement);
  const rows=Array.from({length:29},(_,i)=>({...WASTE[i%WASTE.length],id:'photo-'+i}));let facility,trial;
  function rebuild(){facility?.dispose();facility=createRecyclingPresentation(root,{site:{x:0,z:0},truckURL:'/missing-truck.glb'});facility.reset(rows,row=>createWaste({...row,id:WASTE[Number(row.id.slice(6))%WASTE.length].id}));trial=new ActivityTrial('recycling',null,'personal',rows);facility.update(trial);renderer.render(scene,camera);}
  rebuild();window.review={renderer,scene,camera,root,rebuild,get facility(){return facility;},get trial(){return trial;}};
 });
 const check=await page.evaluate(()=>{
  const {renderer,scene,camera,root,trial,facility}=review;const inspect=()=>{const out=[];root.traverse(o=>{if(o.userData.recyclingItem&&o.visible)out.push({id:o.userData.objectId,stage:o.userData.stage});});return out;};
  const ready=inspect();for(let i=0;i<34;i++)trial.step();facility.update(trial);const later=inspect();trial.run();while(trial.state==='running')trial.advance();facility.update(trial);renderer.render(scene,camera);return {ready,later,end:inspect(),truck:!!root.getObjectByName('recycling-lab-truck')};
 });expect(check.ready).toHaveLength(8);expect(check.later.filter(r=>r.stage==='waiting')).toHaveLength(8);expect(check.later.some(r=>r.id==='photo-9')).toBe(true);expect(check.end).toHaveLength(29);expect(new Set(check.end.map(r=>r.id)).size).toBe(29);expect(check.truck).toBe(false);
 const stats=[];for(let i=0;i<6;i++){await page.evaluate(()=>review.rebuild());await page.waitForTimeout(60);stats.push(await page.evaluate(()=>({...review.renderer.info.memory,calls:review.renderer.info.render.calls,triangles:review.renderer.info.render.triangles})));}
 expect(stats.slice(1)).toEqual(Array(5).fill(stats[0]));expect(stats[0].calls).toBeLessThan(130);
 console.log('Recycling presentation GPU resources:',JSON.stringify(stats[0]));
 await testInfo.attach('render-cost.json',{body:JSON.stringify(stats),contentType:'application/json'});
 await page.screenshot({path:testInfo.outputPath('facility-detail.png')});
 const released=await page.evaluate(()=>{review.facility.dispose();review.renderer.render(review.scene,review.camera);return {...review.renderer.info.memory};});expect(released.geometries).toBe(0);// Three retains its one transmission render target until renderer teardown.
 expect(released.textures).toBeLessThanOrEqual(1);
});
