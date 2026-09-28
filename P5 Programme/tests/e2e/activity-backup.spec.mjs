import {test,expect} from '@playwright/test';
import {capabilities,boot,publish,run} from './activity-helpers.mjs';

test('both installed skills revise, download, restore and rerun without minting claims again',async({page,browser})=>{
 test.setTimeout(240000);
 await boot(page);await publish(page,capabilities());
 const recycleA=await run(page,'recycling'),driveA=await run(page,'driving');
 expect(recycleA.score.correct).toBe(9);expect(driveA.outcome).toBe('goal');
 await publish(page,capabilities(2));
 const recycleB=await run(page,'recycling'),driveB=await run(page,'driving');
 expect(recycleB.results.map(r=>r.decision)).not.toEqual(recycleA.results.map(r=>r.decision));
 expect(driveB.steps.map(r=>r.decision)).not.toEqual(driveA.steps.map(r=>r.decision));
 const wallet=await page.evaluate(async()=>{const {createProjectStore}=await import('/city-common/project-store.js');const s=createProjectStore();await s.openActiveProject();return s.readEconomy();});
 await page.evaluate(()=>window.__cityActivities.close());await page.locator('#btn-save-hud').click();
 const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#save-download').click()]);
 const file=await download.path();const empty=await browser.newContext();const fresh=await empty.newPage();
 await fresh.goto('/city-builder/');await Promise.all([fresh.waitForEvent('load'),fresh.locator('#file-input').setInputFiles(file)]);
 await fresh.locator('#entry-local').click();await fresh.waitForFunction(()=>window.__cityActivities&&document.querySelector('#loading.done'),null,{timeout:90000});
 const recycleRestored=await run(fresh,'recycling'),driveRestored=await run(fresh,'driving');
 expect(recycleRestored.results.map(r=>r.decision)).toEqual(recycleB.results.map(r=>r.decision));
 expect(driveRestored.steps.map(r=>r.decision)).toEqual(driveB.steps.map(r=>r.decision));
 const restoredWallet=await fresh.evaluate(async()=>{const {createProjectStore}=await import('/city-common/project-store.js');const s=createProjectStore();await s.openActiveProject();return s.readEconomy();});
 expect(restoredWallet.claimed).toEqual(wallet.claimed);expect(restoredWallet.balance).toBe(wallet.balance);
 await empty.close();
});
