import { test, expect } from '@playwright/test';

const sizes = [
  { width:1280, height:800, name:'desktop' },
  { width:1024, height:768, name:'tablet-landscape' },
  { width:768, height:1024, name:'tablet-portrait' },
  { width:390, height:844, name:'mobile' },
];

for (const size of sizes) {
  test(`planner keeps the map primary at ${size.name}`, async ({page},testInfo) => {
    await page.setViewportSize(size);
    await page.addInitScript(()=>localStorage.setItem('p5_city_planner_coach_v1','1'));
    await page.goto('/planner/');
    const layout=await page.evaluate(()=>{
      const map=document.querySelector('#map').getBoundingClientRect();
      const drawer=document.querySelector('#drawer').getBoundingClientRect();
      return {map:{w:map.width,h:map.height},drawer:{w:drawer.width,h:drawer.height},portrait:matchMedia('(orientation: portrait)').matches};
    });
    expect(layout.map.w*layout.map.h).toBeGreaterThan(size.width*size.height*.48);
    if(layout.portrait) expect(layout.drawer.w).toBe(size.width);
    await expect(page.locator('#plan-dock')).toBeVisible();
    await page.screenshot({path:testInfo.outputPath(`planner-${size.name}.png`)});
  });
}

test('Explore and Decorate expose exclusive controls and panels',async({page},testInfo)=>{
  await page.goto('/city-builder/');
  await page.locator('#entry-local').click();
  await page.waitForFunction(()=>window.__focusedCityUI && document.querySelector('#loading.done'));
  await expect(page.locator('button[data-city-mode="explore"]')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#controls')).toBeVisible();
  await expect(page.locator('#btn-taxi')).toBeVisible();
  await page.locator('#btn-taxi').click();
  await expect.poll(()=>page.evaluate(()=>window.__taxi?.isActive())).toBe(true);
  await expect(page.locator('#btn-flyup')).toBeVisible();
  await expect(page.locator('#btn-flydown')).toBeVisible();
  await page.locator('#btn-taxi').click();
  await expect.poll(()=>page.evaluate(()=>window.__taxi?.isActive())).toBe(false);
  await expect(page.locator('#btn-flyup')).not.toBeVisible();
  await expect(page.locator('#btn-flydown')).not.toBeVisible();
  await expect(page.locator('#prop-toggle')).not.toBeVisible();
  await page.locator('button[data-city-mode="decorate"]').click();
  await expect(page.locator('#controls')).not.toBeVisible();
  await expect(page.locator('#prop-library-panel')).toHaveClass(/open/);
  await page.locator('#my-work-btn').click();
  await expect(page.locator('#prop-library-panel')).not.toHaveClass(/open/);
  await expect(page.locator('#minimap')).toHaveAttribute('aria-hidden','true');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator('button[data-city-mode="explore"]')).toHaveAttribute('aria-pressed','true');
  await page.screenshot({path:testInfo.outputPath('explore.png')});
});

test('fitted Champion can be uploaded before entry or replaced from the wardrobe', async ({page}) => {
  await page.goto('/city-builder/');
  await expect(page.locator('#entry-skin')).toBeVisible();
  await expect(page.locator('#skin-input')).toHaveAttribute('accept', /\.glb/);
  await page.locator('#entry-local').click();
  await page.waitForFunction(() => window.__focusedCityUI && document.querySelector('#loading.done'));
  await page.locator('#skin-toggle').click();
  await expect(page.locator('.skin-upload-btn')).toBeVisible();
  await expect(page.locator('.skin-upload-input')).toHaveAttribute('accept', /\.glb/);
});
