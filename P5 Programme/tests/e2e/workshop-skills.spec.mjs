import {test,expect} from '@playwright/test';
import {readySorter,teachSorter} from './recycling-machine-helpers.mjs';
async function ready(page,query){if(query){await page.goto('/workshop/'+query);await expect(page.locator('[data-skill="driving"]')).toBeEnabled();}else await readySorter(page);}
test('each tab restores the same editable machine after switching and reload',async({page})=>{
  await readySorter(page);await teachSorter(page);const original=await page.evaluate(()=>WorkshopGame.sourceMachineId());
  await page.locator('[data-skill="driving"]').click();await expect(page.locator('[data-skill="driving"]')).toHaveAttribute('aria-current','page');
  expect(await page.evaluate(()=>WorkshopGame.sourceMachineId())).not.toBe(original);
  await page.locator('[data-skill="free"]').click();await expect(page.locator('[data-skill="free"]')).toHaveAttribute('aria-current','page');
  await page.locator('[data-skill="recycling"]').click();await expect(page.locator('[data-skill="recycling"]')).toHaveAttribute('aria-current','page');
  expect(await page.evaluate(()=>WorkshopGame.sourceMachineId())).toBe(original);
  await page.reload();await expect(page.locator('[data-skill="recycling"]')).toBeEnabled();
  expect(await page.evaluate(()=>WorkshopGame.sourceMachineId())).toBe(original);
  expect(await page.evaluate(()=>WorkshopGame.recyclingDraft().table.pieces.find(p=>p.id==='model').libraryModel.trainingIds.length)).toBe(15);
  await expect(page.locator('[data-model],[data-quick]')).toHaveCount(0);
});
test('Driving tab trains and captures both models without a publish step',async({page})=>{
  await ready(page,'?skill=drive&paired=1');
  await expect(page.locator('[data-skill="driving"]')).toHaveAttribute('aria-current','page');
  await page.locator('.workshop-skill-controls>summary').click();await page.locator('.driving-teacher>summary').click();
  for(const role of ['steering','speed'])await page.locator(`[data-teach-driving="${role}"]`).click();
  await page.evaluate(()=>localStorage.setItem('p5_city_planner_layout_v1',JSON.stringify({version:2,scaleMeters:2000,roads:[],buildings:[],parks:[]})));
  await page.locator('[data-drive-city]').click();
  await expect(page).toHaveURL(/activity=driving/);
  const pair=await page.evaluate(async()=>{const {createProjectStore}=await import('/city-common/project-store.js');const store=createProjectStore();await store.openActiveProject();const d=await store.readSection('driving');return d.bundles[d.installed];});
  expect(Object.keys(pair.models).sort()).toEqual(['speed','steering']);
});
