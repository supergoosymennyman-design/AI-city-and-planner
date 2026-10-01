import {createRequire} from 'node:module';
import {buildDriveCapability,buildImageCapabilityV2} from '../../buddy-kit/client/city-common/capability-export.js';
const require=createRequire(import.meta.url);
const game=require('../../buddy-kit/client/workshop/game.js');
const machineRuntime=require('../../buddy-kit/client/workshop/logic/recycling-machine.js');
const data=require('../../buddy-kit/client/workshop/assets/city-recycling/catalogue.js');
export function capabilities(revision=1) {
  const drive=game.publishDriveModel(null,game.buildDriveTable({exercise:'light'}));
  const driver=buildDriveCapability({...drive,revision,examples:drive.examples.map(e=>({...e,label:revision===2&&e.label==='forward'?'slow':e.label}))});
  const sorter=buildImageCapabilityV2({id:'backup-sorter',name:'My sorter',revision,labels:data.labels,preprocessing:'mobilenet-v3-small-224-squash-f32-unit-v1',dimension:1024,k:3,threshold:.2,
    examples:data.photos.filter(r=>r.split==='train').map(r=>({label:revision===2?data.labels[(data.labels.indexOf(r.label)+1)%data.labels.length]:r.label,vector:r.vector}))});
  if(!driver.ok||!sorter.ok)throw Error(driver.error||sorter.error);
  return [driver.capability,sorter.capability];
}
export async function boot(page){
 const errors=[],onError=e=>errors.push(e.message);page.on('pageerror',onError);
 await page.addInitScript(()=>{if(!localStorage.getItem('p5_city_planner_layout_v1'))localStorage.setItem('p5_city_planner_layout_v1',JSON.stringify({version:2,scaleMeters:2000,roads:[],buildings:[],parks:[]}));});
 await page.goto('/city-builder/');
 try{
  await page.waitForFunction(()=>document.querySelector('#entry-local')?.dataset.entryReady==='true');
  await page.locator('#entry-local').click();
  await page.waitForFunction(()=>window.__cityActivities&&document.querySelector('#loading.done'),null,{timeout:90000});
 }catch(error){
  const state=await page.evaluate(()=>({boot:window.__bootError,loading:window.__city?.loading?.phase,entry:document.querySelector('#entry-overlay')?.className,entryError:document.querySelector('#entry-error')?.textContent}));
  throw Error(`${error.message} ${JSON.stringify({state,errors})}`);
 }finally{page.off('pageerror',onError);}
}
export async function publish(page,caps){const table=machineRuntime.starter();const revision=caps[1]?.revision||1;const model=table.pieces.find(p=>p.id==='model');model.learning={cam:{brain:{shelves:{},nextId:1}}};model.k=3;for(const row of data.photos.filter(r=>r.split==='train')){const label=revision===2?data.labels[(data.labels.indexOf(row.label)+1)%data.labels.length]:row.label;(model.learning.cam.brain.shelves[label]||=[]).push({id:'library:'+row.id,vec:game.unitVec(row.vector)});}const machine={...machineRuntime.snapshot({table,seed:1,name:'My sorter',sourceMachineId:'recycling-test'}),revision};return page.evaluate(async ({caps,machine})=>{const {createProjectStore}=await import('/city-common/project-store.js');const s=createProjectStore();await s.openActiveProject();for(const [i,cap]of caps.entries()){const p=await s.publishSkill(cap);if(!p.ok)throw Error(p.error);const install=await s.installSkill(p.key,i===0?'city-driving-school-v1':'city-recycling-school-v1',{hostType:i===0?'driver':'sorter'});if(!install.ok)throw Error(install.error);}const saved=await s.mutate(p=>{p.projects.recyclingMachine=machine;return p;});if(!saved.ok)throw Error(saved.error);},{caps,machine});}
export async function run(page,kind){
 await page.evaluate(kind=>{void (kind==='driving'?window.__cityActivities.openLegacyDriving():window.__cityActivities.open(kind));},kind);
 await page.waitForFunction(()=>document.querySelector('.city-activity-panel')?.dataset.state!=='loading',null,{timeout:25000}).catch(async error=>{throw Error(`${error.message}; activity stage: ${await page.locator('.city-activity-panel').getAttribute('data-loading-stage')}`);});
 if(kind==='recycling'){await page.locator('.city-activity-panel select').first().selectOption('batch-1');await page.waitForFunction(()=>window.__cityActivities.trial?.scenario==='batch-1'&&window.__cityActivities.state==='ready');}
 if(kind==='driving')await page.locator('.city-activity-panel select').first().selectOption('light');
 return page.evaluate(async()=>{const a=window.__cityActivities;a.trial.run();for(let i=0;i<1500&&a.trial.state==='running';i++)a.trial.update(.1);a.update(0);await (await import('/city-common/reward-persistence.js')).flushRewardSaves();return a.trial.summary();});
}

export async function enterPlace(page,id){
 await page.locator('#city-workspaces summary').click();
 await page.locator(`[data-destination="${id}"]`).click();
 if(!await page.locator('.city-activity-panel:not([hidden]),.driving-arena-panel:not([hidden])').count())await page.locator('#quest-prompt-btn').click();
}
