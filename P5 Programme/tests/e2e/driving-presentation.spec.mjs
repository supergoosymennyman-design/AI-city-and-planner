import { test, expect } from '@playwright/test';

test('proving ground stays bounded and releases GPU resources across languages and repeated openings',async({page},testInfo)=>{
 test.setTimeout(180000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/tools/driving-preview.html');await page.waitForFunction(()=>window.ready);
 const stats=()=>page.evaluate(()=>({...review.renderer.info.memory,calls:review.renderer.info.render.calls}));
 const before=await stats();
 for(let i=0;i<5;i++){await page.evaluate(()=>review.rebuild());await page.waitForTimeout(100);}
 expect(await stats()).toEqual(before);
 const bounds=await page.evaluate(async()=>{
  const THREE=await import('three');const {SCHOOL_BOUNDS}=await import('/city-common/driving-school-site.js');const box=new THREE.Box3().setFromObject(review.root);
  return {inside:box.min.x>=SCHOOL_BOUNDS.minX-.01&&box.max.x<=SCHOOL_BOUNDS.maxX+.01&&box.min.z>=SCHOOL_BOUNDS.minZ-.01&&box.max.z<=SCHOOL_BOUNDS.maxZ+.01};
 });expect(bounds.inside).toBe(true);expect(before.calls).toBeLessThan(70);
 for(const language of ['en','zh-Hant'])for(const viewport of [{width:1440,height:1000},{width:1024,height:768}]){
  await page.setViewportSize(viewport);await page.selectOption('#language',language);await page.evaluate(()=>review.rebuild());
  expect(await page.evaluate(()=>{const labels=[];review.root.traverse(o=>{if(o.userData.label)labels.push(o.userData.label);});return labels;})).toContain(language==='en'?'AI Driving School':'AI 駕駛學校');
  for(const [exercise,view]of [['mixed','Overview'],['mixed','Entrance'],['mixed','Chase'],['mixed','First bend'],['mixed','Second bend'],['signal','Encounter'],['pedestrian','Encounter'],['barrier','Encounter']]){
   await page.selectOption('#exercise',exercise);await page.evaluate(()=>review.rebuild());await page.selectOption('#view',view);await page.waitForTimeout(80);
   await page.screenshot({path:testInfo.outputPath(`${language}-${viewport.width}-${exercise}-${view}.png`)});
  }
 }
 await page.selectOption('#exercise','signal');await page.evaluate(()=>review.rebuild());
 const signals=await page.evaluate(async()=>{const {updateDrivingSignal}=await import('/city-common/driving-presentation.js');const lamp=review.root.getObjectByName('trial-signal');return [0,1,2].map(state=>{updateDrivingSignal(lamp,state);return lamp.userData.lenses.map(l=>l.material.emissiveIntensity);});});
 expect(signals).toEqual([[.6,0,0],[0,.6,0],[0,0,.6]]);
 await page.selectOption('#exercise','mixed');await page.selectOption('#language','en');await page.selectOption('#view','Overview');await page.evaluate(()=>review.rebuild());await page.waitForTimeout(100);
 expect(await stats()).toEqual(before);expect(errors).toEqual([]);
});

test('bend text and chevrons match the route from approach and reverse views in both languages',async({page},testInfo)=>{
 await page.goto('/tools/driving-preview.html');await page.waitForFunction(()=>window.ready);
 for(const language of ['en','zh-Hant']){
  await page.selectOption('#language',language);await page.evaluate(()=>review.rebuild());
  const result=await page.evaluate(async()=>{
   const THREE=await import('three');const {schoolScenario,pointAt}=await import('/city-common/driving-simulation.js');
   const track=schoolScenario('mixed',71).courseTrack,signs=[];review.root.traverse(o=>{if(o.name==='course-sign')signs.push(o);});
   return {labels:signs.map(o=>o.userData.label),arrows:signs.filter(o=>o.userData.bend).map(o=>{
    const normal=new THREE.Vector3(0,0,1).applyQuaternion(o.quaternion),right=new THREE.Vector3(1,0,0).applyQuaternion(o.quaternion);
    const expectedHeading=pointAt(track,o.userData.bend==='right'?67:128).heading;
    const driverLeft=new THREE.Vector3(Math.cos(expectedHeading),0,-Math.sin(expectedHeading));
    const arrow=right.multiplyScalar(o.userData.label.includes('‹')?-1:1);
    return {bend:o.userData.bend,face:o.userData.face,side:o.material.side,physicalSide:Math.sign(arrow.dot(driverLeft)),normal:normal.toArray()};
   })};
  });
  expect(result.labels.filter(l=>l.includes('02'))).toEqual(language==='en'?['02  RIGHT BEND','02  LEFT BEND']:['02  右彎','02  左彎']);
  expect(result.labels.filter(l=>l.includes('03'))).toEqual(language==='en'?['03  LEFT BEND','03  RIGHT BEND']:['03  左彎','03  右彎']);
  expect(result.arrows).toHaveLength(12);
  for(const arrow of result.arrows){expect(arrow.side).toBe(0);expect(arrow.physicalSide).toBe(arrow.bend==='left'?1:-1);}
  for(let i=0;i<result.arrows.length;i+=2){
   const [front,back]=result.arrows.slice(i,i+2);expect(front.face).toBe('front');expect(back.face).toBe('back');
   expect(front.normal.reduce((sum,value,index)=>sum+value*back.normal[index],0)).toBeCloseTo(-1,6);
  }
  for(const bend of ['right','left'])for(const face of ['front','back']){
   await page.evaluate(async({bend,face})=>{
    const THREE=await import('three'),camera=review.camera;
    const signs=[];review.root.traverse(o=>{if(o.userData.bend===bend&&o.userData.face===face)signs.push(o);});
    const sign=signs[0],normal=new THREE.Vector3(0,0,1).applyQuaternion(sign.quaternion);
    camera.position.copy(sign.position).addScaledVector(normal,7);review.controls.target.copy(sign.position);review.controls.update();
   },{bend,face});
   await page.waitForTimeout(100);await page.screenshot({path:testInfo.outputPath(`${language}-${bend}-${face}-arrow.png`)});
  }
  for(const station of ['02','03'])for(const face of ['front','back']){
   await page.evaluate(async({station,face})=>{
    const THREE=await import('three');const signs=[];review.root.traverse(o=>{if(o.userData.label?.startsWith(station)&&o.userData.face===face)signs.push(o);});
    const sign=signs[0],normal=new THREE.Vector3(0,0,1).applyQuaternion(sign.quaternion);review.camera.position.copy(sign.position).addScaledVector(normal,8);review.controls.target.copy(sign.position);review.controls.update();
   },{station,face});
   await page.waitForTimeout(100);await page.screenshot({path:testInfo.outputPath(`${language}-${station}-${face}-text.png`)});
  }
 }
});
