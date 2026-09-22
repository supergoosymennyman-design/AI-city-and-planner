import { test, expect } from '@playwright/test';

const sizes = [
  { width:1280, height:800, name:'desktop' },
  { width:1024, height:768, name:'tablet-landscape' },
  { width:768, height:1024, name:'tablet-portrait' },
  { width:390, height:844, name:'mobile' },
];

test('city header spacing stays readable in English and Traditional Chinese', async ({page}) => {
  for (const lang of ['en','zh-Hant']) {
    for (const width of [1440,1024,720,520]) {
      await page.setViewportSize({width,height:800});
      await page.goto('/city-builder/');
      await page.evaluate(value => localStorage.setItem('hk_ai_city_lang_v1',value),lang);
      await page.reload();
      const geometry = await page.evaluate(() => {
        const rect = selector => {
          const element = document.querySelector(selector);
          const box = element.getBoundingClientRect();
          return {left:box.left,right:box.right,top:box.top,bottom:box.bottom,width:box.width,height:box.height,visible:box.width>0&&box.height>0};
        };
        const title = rect('#hud-top .hud-left');
        const modes = rect('#city-mode-switch');
        const buttons = [...document.querySelectorAll('#city-mode-switch .city-mode')].map(element => {
          const box=element.getBoundingClientRect(); return {left:box.left,right:box.right,height:box.height};
        });
        return {
          title,modes,buttons,
          titleGap:title.visible ? modes.left-title.right : null,
          modeGaps:buttons.slice(1).map((button,index)=>button.left-buttons[index].right),
          overflow:document.documentElement.scrollWidth-window.innerWidth,
        };
      });
      if (geometry.title.visible) expect(geometry.titleGap,`${lang} ${width}px title gap`).toBeGreaterThanOrEqual(15.5);
      expect(geometry.modeGaps,`${lang} ${width}px mode gaps`).toEqual(geometry.modeGaps.map(() => 8));
      expect(geometry.buttons.every(button=>button.height>=44),`${lang} ${width}px touch targets`).toBe(true);
      expect(geometry.overflow,`${lang} ${width}px horizontal overflow`).toBeLessThanOrEqual(0);
      expect(geometry.title.right<=geometry.modes.left || !geometry.title.visible,`${lang} ${width}px title overlap`).toBe(true);
    }
  }
});

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

test('Explore and Decorate expose exclusive controls and panels',async({page})=>{
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
});

test('fitted Champion can be uploaded before entry or replaced from the wardrobe', async ({page}) => {
  await page.goto('/city-builder/');
  await expect(page.locator('#entry-skin')).toBeVisible();
  await expect(page.locator('#skin-input')).toHaveAttribute('accept', /\.glb/);
  await page.locator('#entry-local').click();
  await page.waitForFunction(() => window.__focusedCityUI && document.querySelector('#loading.done'));
  // The old 🧑 icon toolbar is retired (its buttons are off-screen; see
  // my-work.css). The wardrobe now opens from My Work → "Champion appearance".
  await page.locator('#my-work-btn').click();
  await page.locator('[data-work-action="appearance"]').click();
  await expect(page.locator('.skin-upload-btn')).toBeVisible();
  await expect(page.locator('.skin-upload-input')).toHaveAttribute('accept', /\.glb/);
});
