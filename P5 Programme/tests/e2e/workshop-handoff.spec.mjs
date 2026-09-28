import {test,expect} from '@playwright/test';
test.skip(!process.env.E2E_DOCROOT, 'The canonical Workshop ships in the built bundle.');

test('Driving tab preserves Free build and resumes its own machine after reload',async({page})=>{
  await page.goto('/workshop/');
  await expect(page.locator('[data-skill="free"]')).toHaveAttribute('aria-current','page');
  const free=await page.evaluate(async()=>{
    WorkshopGame.__setTableForTest(WorkshopGame.buildDriveTable({seed:42}));
    await WorkshopGame.saveDrivingMachine();return WorkshopGame.sourceMachineId();
  });
  await page.locator('[data-skill="driving"]').click();
  await expect(page.locator('[data-skill="driving"]')).toHaveAttribute('aria-current','page');
  const drive=await page.evaluate(()=>WorkshopGame.sourceMachineId());expect(drive).not.toBe(free);
  await page.locator('[data-skill="free"]').click();
  await expect(page.locator('[data-skill="free"]')).toHaveAttribute('aria-current','page');
  expect(await page.evaluate(()=>WorkshopGame.sourceMachineId())).toBe(free);
  expect(await page.evaluate(()=>!!WorkshopGame.publishDriveModel())).toBe(true);
  await page.goto('/workshop/?skill=drive&paired=1');
  await expect(page.locator('[data-skill="driving"]')).toHaveAttribute('aria-current','page');
  expect(await page.evaluate(()=>WorkshopGame.sourceMachineId())).toBe(drive);
});
