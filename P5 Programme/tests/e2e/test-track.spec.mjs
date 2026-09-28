import {test,expect} from '@playwright/test';
import {capabilities,boot,publish,run} from './activity-helpers.mjs';
import {DRIVE_ACTIONS} from '../../buddy-kit/client/city-common/driving.js';

test('installed model controls the vehicle and revision changes its actions',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await boot(page);await publish(page,capabilities());const a=await run(page,'driving');
 expect(a.steps.length).toBeGreaterThan(20);expect(a.outcome).toBe('goal');
 for(const step of a.steps)expect(DRIVE_ACTIONS).toContain(step.decision);
 await publish(page,capabilities(2));const b=await run(page,'driving');
 expect(b.steps.map(s=>s.decision)).not.toEqual(a.steps.map(s=>s.decision));
 expect(['goal','collision','off-road','emergency-stop','timeout']).toContain(b.outcome);
 expect(errors).toEqual([]);
});

test('the current City capability panel requires a model and offers Workshop',async({page})=>{
 await boot(page);await page.locator('#city-more summary').click();await page.locator('#cap-btn').click();await page.locator('#cap-drive-btn').click();
 const panel=page.locator('.driving-arena-panel');await expect(panel).toBeVisible();
 await expect(panel.locator('[data-run]')).toBeDisabled();await expect(panel.locator('[data-workshop]')).toHaveAttribute('href',/skill=drive/);
 expect(await page.evaluate(()=>window.__cityActivities.trial)).toBeNull();
});

test('driving controls pause, inspect and reset a real installed model',async({page})=>{
 await boot(page);await publish(page,capabilities());await page.evaluate(()=>window.__cityActivities.openLegacyDriving());
 const panel=page.locator('.city-activity-panel');await panel.locator('select').first().selectOption('light');
 await panel.locator('[data-act="step"]').click();
 expect(await page.evaluate(()=>window.__cityActivities.trial.steps.length)).toBe(1);
 await expect(panel).toHaveAttribute('data-state','paused');
 await expect(panel.locator('[data-evidence]')).not.toHaveText('');
 await panel.locator('[data-act="reset"]').click();
 await expect.poll(()=>page.evaluate(()=>window.__cityActivities.trial.steps.length)).toBe(0);
 await expect(panel).toHaveAttribute('data-state','ready');
});

test('Workshop publishes a trained driving model that runs at its exact City site',async({page})=>{
 test.skip(!process.env.E2E_DOCROOT,'Workshop is packaged in the built bundle.');
 await page.goto('/workshop/?publishTarget=city&hostInstanceId=city-driving-school-v1&skill=drive');
 await page.waitForFunction(()=>window.WorkshopGame&&window.WorkshopPublish);
 await expect(page.locator('[data-skill="driving"]')).toHaveAttribute('aria-current','page');
 await expect(page.locator('[data-skill="driving"]')).toBeEnabled();
 const result=await page.evaluate(async()=>{
   const game=WorkshopGame;
   const untrained=game.publishDriveModel('dv_model',game.buildDriveTable({exercise:'light',train:false}));
   game.__setTableForTest(game.buildDriveTable({exercise:'light'}));
   const published=await WorkshopPublish.publishDrive();return {untrained:!!untrained,published};
 });
 expect(result.untrained).toBe(false);expect(result.published.ok).toBe(true);expect(result.published.installed).toBe(true);
 await boot(page);const trial=await run(page,'driving');expect(trial.outcome).toBe('goal');expect(trial.steps.length).toBeGreaterThan(20);
});
