import { test, expect } from '@playwright/test';

// Foliage is the library Common Tree set (nat_common_tree/_2): park + street
// trees queue during boot and flush inside startDeferredAssets once the GLBs
// resolve, giving textured InstancedMeshes with userData.isCityTree.
test('foliage retains textures', async ({page}, testInfo) => {
 await page.goto('/city-builder/');
 await page.waitForTimeout(2000);
 await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /example city|empty sample/i.test(b.textContent))?.click());
 await page.waitForFunction(() => window.__city && document.querySelector('#loading.done'), {timeout:60000});
 await page.waitForFunction(() => { let n=0; window.__scene.traverse(o=>{ if(o.userData.isCityTree||o.userData.isNatureFiller) n++; }); return n>0; }, null, {timeout:60000});
 await page.waitForTimeout(10000);
 await page.evaluate(() => { window.__camOverride = {pos:[927.42,21.06,1031.60],target:[910,0,1000]}; });
 await page.waitForTimeout(1000);
 await page.screenshot({path:testInfo.outputPath('city.png')});
 const nature = await page.evaluate(() => {
   const result=[];
   window.__scene.traverse(o=>{if(o.userData.isCityTree || o.userData.isNatureFiller) result.push({groups:o.geometry.groups.length, materials:Array.isArray(o.material)?o.material.length:1, mapped:(Array.isArray(o.material)?o.material:[o.material]).some(m=>m.map), count:o.count});});
   return result;
 });

 expect(nature.some(n=>n.mapped)).toBe(true);
 expect(nature.every(n=>n.groups>0)).toBe(true);
});

test('library search and tablet close work', async ({page}, testInfo) => {
 await page.goto('/city-builder/');
 await page.waitForTimeout(2000);
 await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /example city|empty sample/i.test(b.textContent))?.click());
 await page.waitForFunction(() => window.__city && document.querySelector('#loading.done'), {timeout:60000});
 await page.evaluate(() => document.querySelector('button[data-city-mode="decorate"]')?.click());
 await page.waitForTimeout(500);
 await page.screenshot({path:testInfo.outputPath('library.png')});
 await page.locator('.prop-lib-search').fill('bench');
 await expect(page.locator('.prop-lib-card').first()).toContainText(/bench/i);
 await page.locator('.prop-lib-search').fill('zzzznoresult');
 await expect(page.locator('.prop-lib-empty')).toBeVisible();
 await page.locator('.prop-lib-search').fill('');
 await page.locator('.prop-lib-tabs').selectOption('nature');
 await expect(page.locator('.prop-lib-card').first()).toBeVisible();
 await page.setViewportSize({width:768,height:1024});
 await page.screenshot({path:testInfo.outputPath('library-tablet.png')});
 await expect(page.locator('#quest-prompt')).not.toBeVisible();
 await page.locator('.prop-lib-close').click();
 await expect(page.locator('#prop-toggle')).toHaveAttribute('aria-expanded','false');
});

// Touch capability, rather than a resized desktop viewport, selects mobile assets.
test.describe('school tablet', () => {
 test.use({viewport:{width:768,height:1024}, hasTouch:true, deviceScaleFactor:1});
 test('uses the compact tree models without requesting forest packs', async ({page}, testInfo) => {
  const forestRequests=[];
  page.on('request', r=>{if (/\/assets\/models\/nature\/tree-/.test(r.url())) forestRequests.push(r.url());});
  await page.goto('/city-builder/');
  await page.locator('#entry-local').click();
  await page.waitForFunction(()=>window.__city && document.querySelector('#loading.done'));
  await page.waitForFunction(()=>{ let n=0; window.__scene.traverse(o=>{ if(o.userData.isCityTree) n++; }); return n>0; }, null, {timeout:60000});
  await page.waitForTimeout(500);
  const trees=await page.evaluate(()=>{
   const batches=[];
   window.__scene.traverse(o=>{if(o.userData.isCityTree) batches.push({count:o.count, textured:o.material.some(m=>m.map)});});
   return batches;
  });
  expect(forestRequests).toEqual([]);
  expect(trees.length).toBeGreaterThan(0);
  expect(trees.length).toBeLessThanOrEqual(2);
  expect(trees.every(t=>t.textured)).toBe(true);
  // Both park and street trees survive the compact asset path.
  expect(trees.reduce((sum,t)=>sum+t.count,0)).toBeGreaterThan(100);
  await page.evaluate(()=>{
   window.__camOverride={pos:[927.42,21.06,1031.60], target:[910,0,1000]};
  });
  await page.waitForTimeout(2000);
  await page.screenshot({path:testInfo.outputPath('tablet-city.png')});
 });
});
