import {chromium} from '@playwright/test';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {buildDriveCapability,buildImageCapabilityV2} from '../buddy-kit/client/city-common/capability-export.js';
const require=createRequire(import.meta.url),game=require('../buddy-kit/client/workshop/game.js'),data=require('../buddy-kit/client/workshop/assets/city-recycling/catalogue.js');
const drive=buildDriveCapability(game.publishDriveModel(null,game.buildDriveTable({exercise:'light'}))).capability;
const image=buildImageCapabilityV2({id:'scanner-reference',name:'Scanner reference',labels:data.labels,preprocessing:'mobilenet-v3-small-224-squash-f32-unit-v1',dimension:1024,k:3,threshold:.2,examples:data.photos.filter(r=>r.split==='train').map(r=>({label:r.label,vector:r.vector}))}).capability;
const browser=await chromium.launch({headless:true,args:process.env.ACTIVITY_SAMPLE?[]:['--use-gl=swiftshader','--enable-unsafe-swiftshader']});const errors=[];
const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.text().startsWith('ACTIVITY:'))console.log(m.text());});
const origin=process.env.ACTIVITY_ORIGIN||'http://127.0.0.1:8379';
try {
 if(!process.env.ACTIVITY_SAMPLE)await page.addInitScript(()=>{if(!localStorage.getItem('p5_city_planner_layout_v1'))localStorage.setItem('p5_city_planner_layout_v1',JSON.stringify({version:2,scaleMeters:400,autoScenery:false,roads:[{points:[[80,80],[300,80],[300,300],[80,300],[80,80]],width:10}],parks:[],buildings:[{type:'school',pos:[160,140],footprint:[24,24],height:12},{type:'recycling',pos:[240,200],footprint:[20,20],height:10}]}));});
 console.log('Opening City');await page.goto(origin+'/city-builder/',{waitUntil:'domcontentloaded'});console.log('City HTML ready');
 await page.waitForTimeout(1000);
 const entry=page.locator('#entry-local');if(await entry.isVisible())await entry.click();
 console.log('Waiting for sites');await page.waitForFunction(()=>window.__cityActivities,null,{timeout:120000});console.log('Sites ready');
 await page.evaluate(async ({drive,image})=>{console.log('ACTIVITY: importing project module');const {createProjectStore}=await import('../city-common/project-store.js');const store=createProjectStore();console.log('ACTIVITY: opening project');await Promise.race([store.openActiveProject(),new Promise((_,reject)=>setTimeout(async()=>reject(Error('Project wait: '+JSON.stringify(await navigator.locks.query()))),20000))]);console.log('ACTIVITY: project opened');for(const [cap,id,type] of [[drive,'city-driving-school-v1','driver'],[image,'city-recycling-school-v1','sorter']]){console.log('ACTIVITY: publishing '+id);const p=await store.publishSkill(cap);console.log('ACTIVITY: published '+id);if(!p.ok)throw Error(p.error);const i=await store.installSkill(p.key,id,{hostType:type});if(!i.ok)throw Error(i.error);console.log('ACTIVITY: installed '+id);}}, {drive,image});
 console.log('Opening recycling');await page.evaluate(()=>Promise.race([window.__cityActivities.open('recycling'),new Promise((_,reject)=>setTimeout(async()=>reject(Error(document.querySelector('.city-activity-panel').dataset.loadingStage+' '+JSON.stringify(await navigator.locks.query())+' '+JSON.stringify(await indexedDB.databases()))),20000))]));console.log('Recycling opened');
 await page.waitForFunction(()=>window.__cityActivities.trial?.state==='ready');
 const panel=page.locator('.city-activity-panel');await panel.locator('[data-act=run]').click();await panel.locator('[data-act=pause]').click();
 assert.equal(await page.evaluate(()=>window.__cityActivities.state),'paused');
 await panel.locator('[data-act=step]').click();await panel.locator('summary').click();
 await mkdir('/private/tmp/city-activities',{recursive:true});
 await page.screenshot({path:'/private/tmp/city-activities/recycling-desktop.png'});
 console.log('Recycling screenshot saved');const recycling=await page.evaluate(()=>{const a=window.__cityActivities;a.trial.run();for(let i=0;i<300;i++)a.update(.1);return a.trial.summary();});assert.equal(recycling.score.correct,9);
 await page.waitForTimeout(500);
 console.log('Opening driving');await page.evaluate(()=>window.__cityActivities.open('driving'));await page.waitForFunction(()=>window.__cityActivities.trial?.kind==='driving');
 await panel.locator('select[data-act=scenario]').selectOption('light');await panel.locator('[data-act=run]').click();await page.waitForTimeout(1100);await panel.locator('[data-act=pause]').click();
 await page.screenshot({path:'/private/tmp/city-activities/driving-desktop.png'});
 const driving=await page.evaluate(()=>{const a=window.__cityActivities;a.trial.run();for(let i=0;i<1200;i++)a.update(.1);return a.trial.summary();});assert.equal(driving.outcome,'goal');
 // Closing and reopening always restores a fresh ready trial, not a running loop.
 await page.evaluate(()=>{window.__cityActivities.close();return window.__cityActivities.open('driving');});assert.equal(await page.evaluate(()=>window.__cityActivities.state),'ready');
 await page.setViewportSize({width:820,height:1180});await page.screenshot({path:'/private/tmp/city-activities/driving-tablet-layout.png'});
 await page.evaluate(()=>{localStorage.setItem('hk_ai_city_lang_v1','zh-Hant');});
 await page.reload();await page.locator('#entry-local').click();console.log('Waiting for sites');await page.waitForFunction(()=>window.__cityActivities,null,{timeout:120000});console.log('Sites ready');console.log('Opening recycling');await page.evaluate(()=>Promise.race([window.__cityActivities.open('recycling'),new Promise((_,reject)=>setTimeout(async()=>reject(Error(document.querySelector('.city-activity-panel').dataset.loadingStage+' '+JSON.stringify(await navigator.locks.query())+' '+JSON.stringify(await indexedDB.databases()))),20000))]));console.log('Recycling opened');await page.screenshot({path:'/private/tmp/city-activities/recycling-zh.png'});
 // Reset mid-animation, repeat Run, and review one exact previous decision.
 await panel.locator('[data-act=run]').click();await page.waitForTimeout(250);await panel.locator('[data-act=reset]').click();
 assert.equal(await page.evaluate(()=>window.__cityActivities.trial.results.length),0);
 await page.evaluate(()=>{const a=window.__cityActivities;a.trial.run();a.trial.run();a.update(.1);a.trial.pause();});
 assert.equal(await page.evaluate(()=>window.__cityActivities.trial.phase),1);
 // A close during async loading invalidates its completion.
 await page.evaluate(async()=>{const a=window.__cityActivities;const pending=a.open('driving');a.close();await pending;});
 assert.equal(await panel.isVisible(),false);
 // A real context loss pauses the trial and restore does not catch up hidden time.
 await page.evaluate(()=>window.__cityActivities.open('driving'));await panel.locator('select[data-act=scenario]').selectOption('light');
 await page.evaluate(()=>{window.__cityActivities.trial.run();const canvas=document.querySelector('#stage canvas')||document.querySelector('canvas');window.__activityGL=canvas.getContext('webgl2')||canvas.getContext('webgl');window.__activityGL?.getExtension('WEBGL_lose_context')?.loseContext();});
 await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>window.__cityActivities.state),'paused');
 await page.evaluate(()=>window.__activityGL?.getExtension('WEBGL_lose_context')?.restoreContext());await page.waitForTimeout(500);
 assert.equal(await page.evaluate(()=>window.__cityActivities.state),'paused');
 // The envelope archive contains installed revisions and the completed scenarios.
 const saved=await page.evaluate(async()=>{const {createProjectStore}=await import('../city-common/project-store.js');const s=createProjectStore();await s.openActiveProject();const a=await s.readSection('cityActivities'),i=await s.readInstallations();const exported=await s.exportProject();s.close();return {activities:a,installs:i,exported:exported.ok};});
 assert.equal(saved.activities.recycling.score.correct,9);assert.equal(saved.activities.driving.outcome,'goal');assert.ok(saved.installs['city-driving-school-v1']);
 // A project-switch event closes any activity before more steps can run.
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('passiona:project-store-change',{detail:{type:'switched'}})));assert.equal(await panel.isVisible(),false);
 // Asset failure is an explicit error and retry reopens ready.
 await page.route('**/workshop/assets/city-recycling/catalogue.js',route=>route.abort());
 await page.reload();await page.locator('#entry-local').click();await page.waitForFunction(()=>window.__cityActivities,null,{timeout:120000});
 await page.evaluate(()=>window.__cityActivities.open('recycling'));assert.equal(await page.evaluate(()=>window.__cityActivities.state),'error');
 await page.unroute('**/workshop/assets/city-recycling/catalogue.js');await page.evaluate(()=>window.__cityActivities.open('recycling'));assert.equal(await page.evaluate(()=>window.__cityActivities.state),'ready');
 await writeFile('/private/tmp/city-activities/results.json',JSON.stringify({errors,recycling:recycling.score,driving:driving.outcome,sites:await page.evaluate(()=>window.__cityActivities.sites)},null,2));
 assert.deepEqual(errors,[]);console.log('Activity integration passed; screenshots and results in /private/tmp/city-activities');
} finally {await browser.close();}
