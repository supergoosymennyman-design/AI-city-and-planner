import { test, expect } from '@playwright/test';
import {readySorter,teachSorter} from './recycling-machine-helpers.mjs';

test('Workshop photos and saved model reach the permanent City sorter', async ({ page }, testInfo) => {
  const errors=[]; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => { window.__TOOLBOX_TEST_EMBEDDER__ = {
    init: async () => ({ ok:true }), embed: async () => { const vec = new Float32Array(1024); vec[0] = 1; return vec; },
  }; });
  await readySorter(page);
  const png = Buffer.from((await page.evaluate(() => { const canvas=document.createElement('canvas');canvas.width=canvas.height=2;canvas.getContext('2d').fillRect(0,0,2,2);return canvas.toDataURL('image/png'); })).split(',')[1], 'base64');
  await teachSorter(page);
  await page.locator('.workshop-skill-controls>summary').click();
  await page.locator('[data-photos]').setInputFiles([{name:'waiting.png',mimeType:'image/png',buffer:png}]);
  await expect(page.locator('[data-count]')).toContainText('1 photos waiting');
  await page.locator('[data-save-sorter]').click();await expect(page.locator('[data-save-status]')).toHaveText('Saved for City');
  const archive = await page.evaluate(async () => { const {createProjectStore}=await import('/city-common/project-store.js');const store=createProjectStore();await store.openActiveProject();const result=await store.exportProject();store.close();return result; });
  expect(archive.archive.project.projects.recyclingMachine.kind).toBe('recycling-machine');
  expect(JSON.stringify(archive.archive)).not.toContain('waiting.png');
  await page.evaluate(() => localStorage.setItem('p5_city_planner_layout_v1', JSON.stringify({version:2,scaleMeters:2000,roads:[],buildings:[],parks:[]})));
  await page.locator('[data-city]').click();
  await page.locator('#entry-local').click();
  await page.waitForFunction(() => window.__cityActivities && document.querySelector('.city-activity-panel')?.dataset.state==='ready', null, {timeout:60000}).catch(async error => {
    const state=await page.evaluate(() => ({bootError:window.__bootError,loading:document.querySelector('#loading')?.className,entryError:document.querySelector('#entry-error')?.textContent,activity:document.querySelector('.city-activity-panel')?.dataset.state,stage:document.querySelector('.city-activity-panel')?.dataset.loadingStage}));
    throw Error(`${error.message} ${JSON.stringify({state,errors})}`);
  });
  await expect(page.locator('[data-waiting]')).toContainText('1 photo waiting');
  const result=await page.evaluate(() => { const a=window.__cityActivities;a.trial.run();for(let i=0;i<40&&a.trial.state==='running';i++)a.trial.update(.1);a.update(0);return {state:a.trial.state,results:a.trial.results,scoreText:document.querySelector('.city-activity-panel [data-result]').textContent}; });
  expect(result.state).toBe('finished'); expect(result.results).toHaveLength(1);
  expect(result.results[0].truth).toBeNull();
  expect(result.scoreText).toContain('no answer key');
  await expect(page.locator('[data-sorter-upload]')).toHaveCount(0);
  await expect(page.locator('[data-sorter-model]')).toHaveCount(0);
  await expect(page.locator('[data-waiting]')).toContainText('0 photos waiting · 1 sorted');
  await page.locator('[data-act="reset"]').click();
  await expect(page.locator('[data-waiting]')).toContainText('1 photo waiting · 0 sorted');
  await page.screenshot({path:testInfo.outputPath('sorter-desktop.png')});
  await page.screenshot({path:'/private/tmp/skills-city-desktop.png'});
  await page.mouse.move(440,350);await page.mouse.down();await page.mouse.move(590,380,{steps:12});await page.mouse.up();await page.mouse.wheel(0,-180);
  await expect(page.locator('[data-bin-readouts]')).toContainText('cardboard');
  await page.screenshot({path:'/private/tmp/skills-city-rotated.png'});
  const sessionValue=await page.evaluate(() => sessionStorage.getItem('passiona-recycling-session-v1'));
  const context=page.context();
  await page.close();
  const tablet=await context.newPage();
  tablet.on('pageerror', error => errors.push(error.message));
  await tablet.setViewportSize({width:768,height:1024});
  await tablet.addInitScript(value => sessionStorage.setItem('passiona-recycling-session-v1', value), sessionValue);
  await tablet.goto('/city-builder/?activity=recycling&exercise=personal');
  if (await tablet.locator('#entry-local').isVisible()) await tablet.locator('#entry-local').click();
  await tablet.waitForFunction(() => document.querySelector('.city-activity-panel')?.dataset.state==='ready', null, {timeout:60000});
  await tablet.screenshot({path:testInfo.outputPath('sorter-tablet.png')});
  await tablet.evaluate(() => localStorage.setItem('hk_ai_city_lang_v1','zh-Hant'));
  await tablet.reload(); if (await tablet.locator('#entry-local').isVisible()) await tablet.locator('#entry-local').click();
  await tablet.waitForFunction(() => document.querySelector('.city-activity-panel')?.dataset.state==='ready', null, {timeout:60000});
  await expect(tablet.locator('.city-activity-panel h2')).toContainText('回收站');
  await tablet.screenshot({path:testInfo.outputPath('sorter-tablet-zh.png')});
  await tablet.screenshot({path:'/private/tmp/skills-city-tablet-zh.png'});
  expect(errors).toEqual([]);
});
