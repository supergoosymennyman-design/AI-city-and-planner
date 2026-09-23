// Run against a local Studio dev server: node checks/shop.cjs [URL].
const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { watchPage, waitForBoot } = require('./page-state.cjs');

(async () => {
  const base = process.argv[2] || 'http://127.0.0.1:5187';
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const page = await context.newPage();
    const errors = watchPage(page, base);
    await page.goto(base);
    await waitForBoot(page);
    await page.waitForFunction(() => window.__shop?.getState());
    await page.click('#shop-toggle');
    await page.waitForSelector('.shop-card', { state: 'visible' });
    assert.equal(await page.locator('.shop-card').count(), 6);
    const categories = await page.locator('.shop-cat-chip').evaluateAll((els) => els.map((el) => el.dataset.category));
    for (const category of categories) {
      await page.locator(`.shop-cat-chip[data-category="${category}"]`).click();
      assert.ok(await page.locator('.shop-card').count() > 0, `category ${category} must have models`);
    }
    await page.locator('.shop-cat-chip').first().click();
    await page.fill('#shop-search', 'starter');
    assert.equal(await page.locator('.shop-card').count(), 1);
    const before = await page.evaluate(() => window.__studio.shapes.length);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.waitForFunction((n) => window.__studio.shapes.length === n + 1, before);
    await page.click('#undo');
    await page.waitForFunction((n) => window.__studio.shapes.length === n, before);
    await page.click('#redo');
    await page.waitForFunction((n) => window.__studio.shapes.length === n + 1, before);
    await page.waitForTimeout(800); // real 400ms document autosave debounce
    await page.reload(); await waitForBoot(page);
    await page.waitForFunction(() => window.__shop?.getState());
    assert.equal(await page.evaluate(() => window.__studio.shapes.length), before + 1, 'reload must not replay shop placements');
    await page.click('#shop-toggle');
    const rocket = page.locator('.shop-card[data-model-id="rocket-cone"]');
    await rocket.locator('[data-action="buy"]').click();
    await page.waitForFunction(() => window.__shop.getState().coins === 80);
    assert.equal(await page.evaluate(() => window.__shop.getState().coins), 80);
    await rocket.locator('[data-action="place"]').waitFor();
    const drag = page.locator('.shop-card[data-model-id="starter-cube"] [data-drag-handle]');
    await drag.scrollIntoViewIfNeeded();
    const from = await drag.boundingBox();
    const viewport = await page.locator('#viewport').boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(viewport.x + viewport.width / 2, viewport.y + viewport.height * 0.65, { steps: 12 });
    await page.mouse.up();
    await page.waitForFunction((n) => window.__studio.shapes.length === n + 2, before);
    await page.locator('[data-view="tree"]').click();
    assert.equal(await page.locator('.skill-node').count(), 11);
    const progress = await page.evaluate(async () => {
      const a = await window.__skillTree.applyAchieved(['lr-concept']);
      const b = await window.__skillTree.applyAchieved(['lr-concept']);
      return { a, b };
    });
    assert.equal(progress.a.grantedCoins, 10);
    assert.equal(progress.b.grantedCoins, 0);
    await page.screenshot({ path: path.join(os.tmpdir(), 'studio-shop-tree.png') });
    await page.locator('[data-view="shop"]').click();
    await page.screenshot({ path: path.join(os.tmpdir(), 'studio-shop.png') });
    assert.deepEqual(errors, { page: [], console: [], http: [] });
    console.log('PASS: tablet categories, search, Add, undo/redo, reload, purchase, drag, tree and exactly-once rewards');

    const peer = await page.context().newPage();
    await peer.goto(base); await waitForBoot(peer);
    await peer.waitForFunction(() => window.__shop?.getState());
    await page.evaluate(() => window.__shop.reset());
    await Promise.all([
      page.evaluate(() => window.__shop.purchase({ id: 'rocket-cone' })),
      peer.evaluate(() => window.__shop.purchase({ id: 'party-torus' })),
    ]);
    await peer.evaluate(() => window.__shop.setSidebarWidth(300));
    const shared = await page.evaluate(() => JSON.parse(localStorage.getItem('studio.shop.v1')));
    assert.equal(shared.coins, 0);
    assert.ok(shared.owned.includes('rocket-cone') && shared.owned.includes('party-torus'));
    await page.waitForFunction(() => window.__shop.getState().owned.includes('party-torus'));
    await page.evaluate(() => window.__shop.reset());
    await Promise.all([page, peer].map(tab => tab.evaluate(() => window.__shop.purchase({ id: 'rocket-cone' }))));
    assert.equal(await peer.evaluate(() => JSON.parse(localStorage.getItem('studio.shop.v1')).coins), 80);
    const future = JSON.stringify({ version: 2, coins: 999, owned: ['future-model'] });
    await page.evaluate(raw => localStorage.setItem('studio.shop.v1', raw), future);
    await page.reload(); await waitForBoot(page);
    await page.waitForFunction(() => window.__shop?.getState());
    const refusal = await page.evaluate(() => window.__shop.purchase({ id: 'rocket-cone' }).catch(e => e.message));
    assert.match(refusal, /different app version/);
    assert.equal(await page.evaluate(() => localStorage.getItem('studio.shop.v1')), future);
    await peer.close();
    console.log('PASS: two-tab spending, exactly-once purchase, storage-event refresh and unknown-version preservation');

    const failed = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    await failed.route('**/models/catalog.json', (route) => route.abort());
    await failed.goto(base); await waitForBoot(failed);
    await failed.click('#shop-toggle');
    await failed.getByRole('button', { name: 'Retry', exact: true }).waitFor();
    assert.ok(await failed.evaluate(() => window.__studio.shapes.length) > 0);
    await failed.unroute('**/models/catalog.json');
    await failed.getByRole('button', { name: 'Retry', exact: true }).click();
    await failed.locator('.shop-card').first().waitFor();
    console.log('PASS: catalogue failure leaves Studio usable; Retry recovers');
    await failed.route('**/models/starter-cube.glb', (route) => route.abort());
    await failed.reload(); await waitForBoot(failed);
    await failed.waitForFunction(() => window.__shop?.getState());
    await failed.click('#shop-toggle');
    const count = await failed.evaluate(() => window.__studio.shapes.length);
    await failed.locator('.shop-card[data-model-id="starter-cube"] [data-action="place"]').click();
    await failed.locator('#toast').filter({ hasText: /load|fetch|network/i }).waitFor();
    assert.equal(await failed.evaluate(() => window.__studio.shapes.length), count);
    console.log('PASS: missing model gives feedback without changing the document');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
