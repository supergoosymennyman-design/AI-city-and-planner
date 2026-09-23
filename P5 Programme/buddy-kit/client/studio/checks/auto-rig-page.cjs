// Real Auto-rig UI seam. --live uses the local cached HF login and spends a GPU request.
// Without --live, replays the last real service response saved by this check.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const { waitForBoot, watchPage } = require('./page-state.cjs');
const out = path.resolve(__dirname, '../dev/auto-rig/ui-check');
fs.mkdirSync(out, { recursive: true });
const fixture = path.join(out, 'service-result.glb');
const live = process.argv.includes('--live');
const report = { live, checks: [] };
function must(name, value) { report.checks.push({ name, passed: !!value }); if (!value) throw new Error(name); }
(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: process.argv.includes('--tablet') ? { width: 1024, height: 768 } : { width: 1280, height: 900 } });
  const errors = watchPage(page, 'http://127.0.0.1:5180/');
  let responseSave;
  let mode = 'replay', release, posted = 0;
  try {
    if (!live) {
      if (!fs.existsSync(fixture)) throw new Error('Run once with --live to record a real UniRig response.');
      await page.route('**/__studio/auto-rig', async (route) => {
        if (route.request().method() === 'GET') return route.fulfill({ json: { available: mode !== 'no-login' } });
        posted++;
        if (mode === 'hold') await new Promise((resolve) => { release = resolve; });
        try {
          if (mode === 'failure') await route.fulfill({ status: 502, contentType: 'text/plain', body: 'GPU task aborted' });
          else await route.fulfill({ contentType: 'model/gltf-binary', body: fs.readFileSync(fixture) });
        } catch { /* Cancellation may close the browser request before a held response is released. */ }
      });
    } else {
      page.on('response', (r) => {
        if (r.url().endsWith('/__studio/auto-rig') && r.request().method() === 'POST' && r.ok()) {
          responseSave = r.body().then((bytes) => fs.writeFileSync(fixture, bytes));
        }
      });
    }
    await page.goto('http://127.0.0.1:5180/');
    await waitForBoot(page);
    await page.evaluate(() => { for (const m of [...window.__studio.shapes]) window.__studio.remove(m); });
    await page.setInputFiles('input[type=file][accept=".glb,.gltf"]', path.resolve(__dirname, '../dev/inputs/dino.glb'));
    await page.waitForFunction(() => window.__studio.shapes.length === 1);
    await page.evaluate(() => {
      const s = window.__studio, target = s.shapes[0];
      window.__autoBefore = { id: target.userData.id, position: Array.from(target.geometry.attributes.position.array), material: target.material, geometry: target.geometry };
      const other = s.addPrimitive('sphere', '#ff7755'); other.position.set(3, 0, 0); other.updateMatrixWorld(true); s.select(target); s.setMode('rig');
      window.__autoOtherId = other.userData.id;
    });
    await page.getByRole('button', { name: 'Auto-rig', exact: true }).click();
    must('explicit selected target and ignored shape shown', /1 other shape ignored/.test(await page.locator('.rig-auto-target').textContent()));
    await page.getByRole('button', { name: 'Make skeleton', exact: true }).click();
    await page.screenshot({ path: path.join(out, 'working.png') });
    await page.waitForFunction(() => !document.querySelector('.rig-auto-dialog').open || /unchanged/.test(document.querySelector('.rig-auto-status').textContent), null, { timeout: 250000 });
    must('real service result applied', await page.evaluate(() => !document.querySelector('.rig-auto-dialog').open));
    if (responseSave) await responseSave;
    await page.waitForFunction(() => window.__rig.status.state === 'ready', null, { timeout: 120000 });
    report.result = await page.evaluate(() => {
      const s = window.__studio, before = window.__autoBefore;
      const target = s.shapes.find((m) => m.userData.id === before.id), other = s.shapes.find((m) => m.userData.id === window.__autoOtherId);
      return { joints: s.rig.graph.size, points: target.geometry.attributes.position.count,
        geometryUnchanged: target.geometry === before.geometry && before.position.every((v, i) => target.geometry.attributes.position.array[i] === v),
        materialUnchanged: target.material === before.material, ignoredNotSkinned: !other.isSkinnedMesh,
        scope: s.rig.graph.targetShapes, targetId: target.userData.id, status: window.__rig.status.text };
    });
    must('full original geometry and material preserved', report.result.geometryUnchanged && report.result.materialUnchanged && report.result.points === 101744);
    must('only the chosen model is rigged', report.result.ignoredNotSkinned && report.result.scope.length === 1 && report.result.scope[0] === report.result.targetId);
    must('predicted skeleton has multiple joints', report.result.joints > 2);
    await page.screenshot({ path: path.join(out, 'ready.png') });
    await page.evaluate(() => {
      const s = window.__studio; s.setMode('pose');
      const joint = s.rig.graph.joints.find((j) => j.parent !== null); s.rig.bones.get(joint.id).rotation.z = 0.3; s.select(s.rig.bones.get(joint.id)); s.rig.root.updateMatrixWorld(true); s.emit('changed');
    });
    must('non-root joint bends the original high-detail model', await page.evaluate(() => window.__rig.probeDisplacement() > 0.01));
    await page.screenshot({ path: path.join(out, 'posed.png') });
    await page.click('#undo');
    must('one Undo removes the auto skeleton and skin', await page.evaluate(() => !window.__studio.rig.graph.size && window.__studio.shapes.every((m) => !m.isSkinnedMesh)));
    await page.click('#redo');
    await page.waitForFunction(() => window.__rig.status.state === 'ready');
    must('Redo restores the scoped skeleton', await page.evaluate((count) => window.__studio.rig.graph.size === count && window.__studio.shapes.filter((m) => m.isSkinnedMesh).length === 1, report.result.joints));
    await page.waitForTimeout(1200); // storage debounce; the next load uses a new JS scene
    await page.reload(); await waitForBoot(page);
    await page.waitForFunction(() => window.__rig.status.state === 'ready', null, { timeout: 120000 });
    must('reload preserves target scope and original detail', await page.evaluate(() => window.__studio.rig.graph.targetShapes.length === 1 && window.__studio.shapes.filter((m) => m.isSkinnedMesh).length === 1 && window.__studio.shapes.some((m) => m.geometry.attributes.position.count === 101744)));
    if (!live) {
      const selectDino = () => page.evaluate(() => { const s = window.__studio; s.select(s.shapes.find((m) => m.geometry.attributes.position.count === 101744)); s.setMode('rig'); });
      const state = () => page.evaluate(() => ({ joints: window.__studio.rig.graph.size, undo: window.__studio.undoStack.length }));
      const waitPost = async (before) => { for (let i = 0; i < 100 && posted === before; i++) await page.waitForTimeout(50); must('job reached the real upload seam', posted > before); };
      await selectDino();
      const before = await state();
      mode = 'hold'; let n = posted;
      await page.getByRole('button', { name: 'Auto-rig', exact: true }).click();
      await page.getByRole('button', { name: 'Make skeleton', exact: true }).click(); await waitPost(n);
      await page.getByRole('button', { name: 'Cancel auto-rig', exact: true }).click(); release();
      await page.waitForTimeout(250);
      must('cancelled late response leaves graph and undo untouched', JSON.stringify(await state()) === JSON.stringify(before));
      // Reopen after cancellation: inputs and buttons must work again, then reject a stale response.
      mode = 'hold'; n = posted;
      await page.getByRole('button', { name: 'Auto-rig', exact: true }).click();
      await page.getByRole('button', { name: 'Make skeleton', exact: true }).click(); await waitPost(n);
      await page.evaluate(() => { window.__studio.shapes.find((m) => m.geometry.attributes.position.count === 101744).position.x += 0.25; });
      release();
      await page.waitForFunction(() => /changed while auto-rigging/.test(document.querySelector('.rig-auto-status').textContent));
      must('stale returned skeleton leaves graph and undo untouched', JSON.stringify(await state()) === JSON.stringify(before));
      await page.getByRole('button', { name: 'Close', exact: true }).click();
      mode = 'failure';
      await page.getByRole('button', { name: 'Auto-rig', exact: true }).click();
      await page.getByRole('button', { name: 'Make skeleton', exact: true }).click();
      await page.waitForFunction(() => /GPU task aborted/.test(document.querySelector('.rig-auto-status').textContent));
      must('provider failure is visible and non-mutating', JSON.stringify(await state()) === JSON.stringify(before));
      await page.screenshot({ path: path.join(out, 'service-failure.png') });
      await page.getByRole('button', { name: 'Close', exact: true }).click();
      mode = 'no-login'; n = posted;
      await page.getByRole('button', { name: 'Auto-rig', exact: true }).click();
      await page.locator('.rig-auto-key').waitFor({ state: 'visible' });
      await page.getByRole('button', { name: 'Make skeleton', exact: true }).click();
      must('published-build fallback asks for a token before upload', posted === n && /access token first/.test(await page.locator('.rig-auto-status').textContent()));
      // Drive the actual provider selector -> main.js panel -> binary API request seam.
      let directRequest, directRelease, directMode = 'hold';
      await page.route('https://rig.example.test/rig', async (route) => {
        directRequest = route.request();
        if (directMode === 'hold') await new Promise((resolve) => { directRelease = resolve; });
        try { await route.fulfill({ contentType: 'model/gltf-binary', body: fs.readFileSync(fixture) }); } catch { /* cancelled */ }
      });
      await page.locator('.rig-auto-key input').fill('hf_test_only_do_not_send');
      await page.getByLabel('Rigging provider').selectOption('direct');
      must('custom provider hides HF token and shows its own fields', !(await page.locator('.rig-auto-key').isVisible()) && await page.locator('.rig-auto-direct').isVisible());
      await page.getByLabel('API endpoint URL').fill('http://unsafe.example/rig');
      await page.getByRole('button', { name: 'Make skeleton', exact: true }).click();
      must('invalid endpoint is rejected before uploading', !directRequest && /Use HTTPS/.test(await page.locator('.rig-auto-status').textContent()));
      await page.getByLabel('API endpoint URL').fill('https://rig.example.test/rig');
      await page.getByLabel('API key (optional, this tab only)').fill('custom-test-key');
      await page.screenshot({ path: path.join(out, 'connection-settings.png') });
      await page.getByRole('button', { name: 'Make skeleton', exact: true }).click();
      for (let i = 0; i < 100 && !directRequest; i++) await page.waitForTimeout(50);
      must('custom API gets binary geometry and only its own Bearer key', directRequest?.method() === 'POST' && directRequest.headers().authorization === 'Bearer custom-test-key' && directRequest.postDataBuffer().readUInt32LE(0) === 0x46546c67 && posted === n);
      must('connection cannot change during upload', await page.getByLabel('Rigging provider').isDisabled());
      await page.getByRole('button', { name: 'Cancel auto-rig', exact: true }).click(); directRelease();
      await page.waitForTimeout(250);
      must('custom API cancellation leaves skeleton untouched', JSON.stringify(await state()) === JSON.stringify(before));
      await page.getByRole('button', { name: 'Auto-rig', exact: true }).click();
      await page.waitForFunction(() => !document.querySelector('.rig-auto-connection').disabled);
      must('settings survive closing and reopening this tab', await page.getByLabel('API endpoint URL').inputValue() === 'https://rig.example.test/rig' && await page.getByLabel('API key (optional, this tab only)').inputValue() === 'custom-test-key');
      must('credentials never enter browser storage', await page.evaluate(() => !JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]).includes('custom-test-key')));
      directMode = 'ready';
      await page.getByRole('button', { name: 'Make skeleton', exact: true }).click();
      await page.waitForFunction(() => !document.querySelector('.rig-auto-dialog').open);
      await page.waitForFunction(() => window.__rig.status.state === 'ready', null, { timeout: 120000 });
      must('custom API rig applies through the real UI', (await state()).undo === before.undo + 1);
      await selectDino();
      mode = 'replay';
      await page.getByRole('button', { name: 'Auto-rig', exact: true }).click();
      await page.waitForFunction(() => !document.querySelector('.rig-auto-connection').disabled);
      await page.getByLabel('Rigging provider').selectOption('hugging-face');
      must('switching back restores local HF login independently', await page.getByLabel('Use my local Hugging Face login').isChecked() && !(await page.locator('.rig-auto-key').isVisible()));
      await page.getByLabel('Use my local Hugging Face login').uncheck();
      must('local HF login can be overridden with a separate token', await page.locator('.rig-auto-key input').inputValue() === 'hf_test_only_do_not_send' && await page.locator('.rig-auto-key').isVisible());
      await page.getByRole('button', { name: 'Close', exact: true }).click();
      await page.evaluate(() => window.__studio.select(null));
      await page.getByRole('button', { name: 'Auto-rig', exact: true }).click();
      must('several unselected models never start an ambiguous rig', await page.evaluate(() => !document.querySelector('.rig-auto-dialog').open));
    }
    // An intentionally injected 502 is expected in the failure scenario; page exceptions never are.
    if (!live) {
      errors.http = errors.http.filter((x) => !x.includes('HTTP 502 http://127.0.0.1:5180/__studio/auto-rig'));
      errors.console = errors.console.filter((x) => !x.includes('server responded with a status of 502'));
    }
    must('no browser errors', !errors.page.length && !errors.console.length && !errors.http.length);
    report.passed = true;
  } catch (error) {
    report.error = error.message;
    report.panel = await page.locator('.rig-auto-status').textContent().catch(() => 'unavailable');
    report.passed = false; process.exitCode = 1;
    await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
  } finally {
    report.errors = errors; fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)); await browser.close();
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
