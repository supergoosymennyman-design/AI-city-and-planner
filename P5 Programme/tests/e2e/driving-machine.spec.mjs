import {test,expect} from '@playwright/test';
import {boot} from './activity-helpers.mjs';

async function workshop(page,query='?skill=drive&paired=1') {
  await page.goto('/workshop/'+query);
  await expect(page.locator('[data-skill="driving"]')).toHaveAttribute('aria-current','page');
  await expect(page.locator('[data-skill="driving"]')).toBeEnabled();
  await expect(page.locator('[data-driving-save]')).toHaveText(/Saved|已儲存/);
}
async function savedDriving(page) {
  return page.evaluate(async()=>{const {createProjectStore}=await import('/city-common/project-store.js');const store=createProjectStore();const p=await store.openActiveProject();store.close();return p.projects;});
}
async function advance(page,count=2400) {
  await page.locator('.driving-arena-panel [data-step]').click();
  await page.waitForFunction(()=>window.__drivingArena.state.attemptStarted);
  await page.evaluate(count=>{const step=document.querySelector('.driving-arena-panel [data-step]');for(let i=0;i<count&&!window.__drivingArena.state.outcome;i++)step.click();},count);
}

test('Steering and Speed filter one machine, preserve learning and undo, recover, and block failed saves',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await workshop(page,'?skill=drive&paired=1&view=blueprint');
  const original=await page.evaluate(()=>WorkshopGame.sourceMachineId());
  await expect(page.locator('.driving-overview')).toContainText('Default → Straight ahead');
  await expect(page.locator('.driving-overview')).toContainText('Constant → Go');
  await expect(page.locator('#pieces>.piece')).toHaveCount(13);
  await expect(page.locator('#pieces>[data-id^="speed_"]')).toHaveCount(0);
  await page.locator('.driving-teacher summary').click();
  await expect(page.locator('[data-driving-role="speed"]')).toBeHidden();
  await page.locator('[data-controller="speed"]').click();
  await expect(page.locator('[data-driving-role="steering"]')).toBeHidden();
  await expect(page.locator('#pieces>[data-id^="steering_"]')).toHaveCount(0);
  await page.locator('[data-teach-driving="speed"]').click();
  await expect(page.locator('[data-driving-save]')).toHaveText(/Saved|已儲存/);
  await page.locator('[data-driving-role="speed"] input').first().fill('');
  await expect(page.locator('[data-driving-decision]')).toContainText('Fill in sensor readings');
  await page.getByLabel('Controller mode',{exact:true}).selectOption('constant:stop');
  await page.locator('[data-controller="steering"]').click();
  await page.locator('[data-controller="speed"]').click();
  await expect(page.getByLabel('Controller mode',{exact:true})).toHaveValue('constant:stop');
  expect(await page.evaluate(()=>WorkshopGame.sourceMachineId())).toBe(original);
  const draft=await page.evaluate(()=>WorkshopGame.drivingDraft());
  expect(draft.pieces).toHaveLength(26);expect(Object.values(draft.pieces.find(p=>p.drivingRole==='speed').learning.data.brain.shelves).flat()).toHaveLength(1200);
  // Subtab switches do not reset construction undo history.
  const undo=await page.evaluate(()=>WorkshopGame.undoAction());expect(undo.ok).toBe(true);
  await expect(page.getByLabel('Controller mode',{exact:true})).toHaveValue('trained:');
  await page.getByLabel('Controller mode',{exact:true}).selectOption('constant:stop');
  await expect(page.locator('[data-driving-save]')).toHaveText(/Saved|已儲存/);
  await page.evaluate(async()=>{const {buildProjectBackup,restoreProjectBackup}=await import('/city-common/backup-coordinator.js');const archive=await buildProjectBackup();await restoreProjectBackup(archive);});
  await page.reload();await expect(page.locator('[data-skill="driving"]')).toBeEnabled();
  expect(await page.evaluate(()=>WorkshopGame.sourceMachineId())).toBe(original);
  await expect(page.locator('[data-controller="speed"]')).toHaveAttribute('aria-pressed','true');
  await expect(page.getByLabel('Controller mode',{exact:true})).toHaveValue('constant:stop');
  expect(await page.evaluate(()=>Object.values(WorkshopGame.drivingDraft().pieces.find(p=>p.drivingRole==='speed').learning.data.brain.shelves).flat().length)).toBe(1200);
  // The real Champion save queue rejects; launch must stay in Workshop.
  await page.evaluate(()=>{window.__championSession.edit=()=>Promise.reject(Error('Injected storage failure'));});
  await page.locator('[data-drive-city]').click();
  await expect(page.locator('[data-driving-save]')).toHaveText('Save failed');
  await expect(page.locator('.skill-driving>[role="status"]')).toContainText('Injected storage failure');
  await expect(page).toHaveURL(/workshop/);
  expect(errors).toEqual([]);
});

test('City first entry collides, links to Speed, and freezes Resume and replay while new attempts use saved edits',async({page,context})=>{
  test.setTimeout(240000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await boot(page);await page.evaluate(()=>window.__cityActivities.open('driving'));
  const arena=page.locator('.driving-arena-panel');
  await expect(arena.locator('[data-run]')).toBeEnabled();
  await expect(arena.locator('[data-drill]')).toHaveValue('barrier');
  const start=await savedDriving(page);const machineId=start.workshopSkills.driving.machineId;
  await advance(page);
  await expect(arena.locator('[data-status]')).toHaveText('Speed stayed on Go, so the car did not brake.');
  await expect.poll(async()=>((await savedDriving(page)).driving.attempts||[]).length).toBe(1);
  const first=(await savedDriving(page)).driving.attempts[0];expect(first.records[0].before.x).toBe(0);expect(first.outcome).toBe('collision');
  await arena.locator('[data-improve]').click();
  await expect(page).toHaveURL(/controller=speed/);
  await expect(page.locator('[data-controller="speed"]')).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(()=>WorkshopGame.sourceMachineId())).toBe(machineId);
  await expect(page.locator('[data-pair-correction]')).toBeVisible();
  await page.getByLabel('Controller mode',{exact:true}).selectOption('constant:stop');
  await page.locator('[data-drive-city]').click();
  await expect(arena.locator('[data-run]')).toBeEnabled();
  const editor=await context.newPage();await workshop(editor);
  // City is open with Stop preview. Saving Go before Run changes this new attempt.
  await editor.locator('[data-controller="speed"]').click();
  await editor.getByLabel('Controller mode',{exact:true}).selectOption('constant:go');
  await expect(editor.locator('[data-driving-save]')).toHaveText('Saved');
  await advance(page,12);const moving=await page.evaluate(()=>window.__drivingArena.state);expect(moving.car.speed).toBeGreaterThan(0);
  // A saved edit during a paused attempt cannot change Resume's decisions.
  await editor.getByLabel('Controller mode',{exact:true}).selectOption('constant:stop');
  await expect(editor.locator('[data-driving-save]')).toHaveText('Saved');
  await arena.locator('[data-run]').click();await expect(arena.locator('[data-run]')).toHaveText('Resume');await arena.locator('[data-pause]').click();
  expect(await page.evaluate(()=>window.__drivingArena.state.revision)).toBe(moving.revision);
  await advance(page);await expect.poll(async()=>((await savedDriving(page)).driving.attempts||[]).length).toBe(2);
  const second=(await savedDriving(page)).driving.attempts.at(-1);expect(second.outcome).toBe('collision');expect(second.revision).toBe(first.revision);
  await arena.locator('[data-repeat]').click();await expect(arena.locator('[data-run]')).toBeEnabled();
  await advance(page,12);expect(await page.evaluate(()=>window.__drivingArena.state.car.speed)).toBe(0);
  expect(await page.evaluate(()=>window.__drivingArena.state.revision)).not.toBe(moving.revision);
  await arena.locator('summary',{hasText:'Compare with a saved trial'}).click();await arena.locator('[data-history]').selectOption('0');await arena.locator('[data-watch-saved]').click();
  await expect(arena.locator('[data-status]')).toContainText('Saved decisions');await arena.locator('[data-replay]').fill(String(first.records.length-1));
  await expect(arena.locator('[data-readings]')).toContainText('go');expect(await page.evaluate(()=>window.__drivingArena.state.revision)).toBe(first.revision);
  // Breaking a bound output blocks a new attempt and keeps the repair link.
  await editor.evaluate(async()=>{WorkshopGame.__deletePieceForTest('speed_dv_guess');await WorkshopGame.saveDrivingMachine();});
  await expect(editor.locator('.driving-overview')).toContainText('Repair speed');
  await arena.locator('[data-repeat]').click();await expect(arena.locator('[data-status]')).toContainText('Repair');await expect(arena.locator('[data-run]')).toBeDisabled();
  await expect(arena.locator('[data-workshop]')).toHaveAttribute('href',/workshop/);
  await editor.close();expect(errors).toEqual([]);
});

test('English and Chinese tablet layouts keep driving tabs and launch reachable',async({page})=>{
  for(const language of ['en','zh-Hant']){
    await page.addInitScript(language=>localStorage.setItem('hk_ai_city_lang_v1',language),language);
    await page.setViewportSize({width:1024,height:768});await workshop(page);
    await page.locator('[data-controller="speed"]').click();
    await expect.poll(()=>page.evaluate(()=>Object.keys(WorkshopFloor.debug().plan.objects).every(id=>id.startsWith('speed_')))).toBe(true);
    await expect.poll(()=>page.evaluate(()=>{const ids=WorkshopFloor.debug().painted.objects;return ids.length>0&&ids.every(id=>id.startsWith('speed_'));})).toBe(true);
    await expect(page.locator('[data-drive-city]')).toBeInViewport();
    await expect(page.locator('[data-controller="speed"]')).toBeInViewport();
    await page.screenshot({path:'/private/tmp/workshop-driving-tablet-'+language+'.png'});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);expect(overflow).toBe(false);
  }
});

test('City adds its starter to an existing Workshop record and project switches lock the editor',async({page})=>{
  test.setTimeout(180000);
  await page.goto('/workshop/?tab=free');await expect(page.locator('[data-skill="driving"]')).toBeEnabled();
  const free=await page.evaluate(async()=>{await WorkshopGame.saveDrivingMachine();return WorkshopGame.sourceMachineId();});
  await boot(page);await page.evaluate(()=>window.__cityActivities.open('driving'));
  await expect(page.locator('.driving-arena-panel [data-run]')).toBeEnabled();
  const before=await savedDriving(page),source=before.workshopSkills.driving.machineId;
  await workshop(page);expect(await page.evaluate(()=>WorkshopGame.sourceMachineId())).toBe(source);
  const after=await savedDriving(page);expect(after.workshop.champion.projects.workshop.machines[free]).toBeDefined();
  const switched=await page.evaluate(async()=>{const {createProjectStore}=await import('/city-common/project-store.js');const store=createProjectStore();await store.openActiveProject();const project=await store.createProject('Another city');store.close();return project.projects;});
  await expect(page.locator('.skill-status')).toContainText('Project changed');await expect(page.locator('[data-drive-city]')).toBeDisabled();
  expect(switched.workshop.champion).toBeUndefined();
});
