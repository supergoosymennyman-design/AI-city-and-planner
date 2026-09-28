import {test,expect} from '@playwright/test';
test.skip(!process.env.E2E_DOCROOT,'The packaged Workshop and Studio are required.');

test('Studio download restores editable geometry and a runnable Workshop machine',async({page,browser})=>{
  await page.goto('/workshop/');await page.waitForFunction(()=>window.WorkshopGame&&window.__championSession);
  const machine=await page.evaluate(async()=>{WorkshopGame.__setTableForTest(WorkshopGame.buildDriveTable({exercise:'light'}));await WorkshopGame.__autosaveForTest();return WorkshopGame.sourceMachineId();});
  await page.goto('/studio/');await page.waitForFunction(()=>window.__studioReady);
  if(await page.locator('#welcome-overlay.show').count())await page.locator('#welcome-go').click();
  await page.evaluate(()=>{__studio.addPrimitive('sphere');__studio.shapes.at(-1).position.x=7;});
  const count=await page.evaluate(()=>__studio.shapes.length);
  const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Save Champion File',exact:true}).click()]);
  expect(download.suggestedFilename()).toMatch(/\.passiona$/);
  const file=await download.path(),context=await browser.newContext(),fresh=await context.newPage();
  await fresh.goto('/studio/');await fresh.waitForFunction(()=>window.__studioReady);
  await Promise.all([fresh.waitForEvent('load'),fresh.locator('#champion-file-controls input[type=file]').setInputFiles(file)]).catch(async error=>{throw Error(`${error.message}: ${await fresh.locator('#toast').textContent()}`);});
  await fresh.waitForFunction(()=>window.__studioReady);
  expect(await fresh.evaluate(()=>__studio.shapes.length)).toBe(count);
  await fresh.evaluate(async()=>{__studio.addPrimitive('box');await __savePortable();});
  await fresh.reload();await fresh.waitForFunction(()=>window.__studioReady);
  expect(await fresh.evaluate(()=>__studio.shapes.length)).toBe(count+1);
  await fresh.goto('/workshop/');await fresh.waitForFunction(()=>window.WorkshopGame&&window.__championSession);
  expect(await fresh.evaluate(()=>WorkshopGame.sourceMachineId())).toBe(machine);
  expect(await fresh.evaluate(()=>!!WorkshopGame.publishDriveModel())).toBe(true);
  await context.close();
});
