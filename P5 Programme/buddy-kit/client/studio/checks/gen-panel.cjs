// Headed fake-service regression. No external network, key, provider or paid generation.
const path = require('path');
const { run } = require('./gen-browser.cjs');
run(async ({ p, base, out, assert }) => {
  await p.route(`${base}/__panel-check`, (r) => r.fulfill({ contentType: 'text/html',
    body: '<!doctype html><html><head><title>Panel check</title></head><body style="background:#050b15"><div id="gen-overlay"><div class="card gen-card"><div id="gen-root"></div></div></div></body></html>' }));
  await p.goto(`${base}/__panel-check`);
  await p.evaluate(() => localStorage.setItem('studio.gen.config', JSON.stringify({ keys: { 'hf-spaces': 'hf_fake_key_for_the_check' } })));
  await p.evaluate(async () => {
    await import('/src/style.css');
    const { GenPanel } = await import('/src/ui/gen-panel.js');
    const png = (colour) => new Promise((res) => {
      const c = document.createElement('canvas'); c.width = c.height = 512;
      const x = c.getContext('2d'); x.fillStyle = '#a0a4aa'; x.fillRect(0, 0, 512, 512);
      x.fillStyle = colour; x.fillRect(156, 156, 200, 200); c.toBlob(res, 'image/png');
    });
    const grid = await png('#51cf66');
    const views = { front: await png('#51cf66'), left: await png('#fcc419'), back: await png('#9775fa'), right: await png('#f06595') };
    const glb = await (await fetch('/__fake.glb')).blob();
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__calls = [];
    window.__captures = [];
    window.__cameraDir = [5, 4, 6]; // the studio's own default orbit offset
    window.__service = {
      mode: 'ok',
      async runStep(step, input, { onProgress, signal }) {
        window.__calls.push({ step, keys: Object.keys(input || {}), detailLevel: input?.detailLevel });
        onProgress({ stage: 'queued', queuePosition: 2 });
        await wait(700);
        for (let i = 1; i <= 8; i++) {
          if (signal.aborted) throw Object.assign(new Error('Stopped.'), { code: 'cancelled' });
          onProgress({ stage: 'running', progressData: step === 'edit' ? [{ index: i * 5, length: 40 }] : undefined });
          await wait(250);
        }
        if (this.mode === 'busy') throw Object.assign(new Error('The AI service is busy. Try again, or show the sample.'), { code: 'busy', detail: 'Queue is full' });
        return step === 'edit' || step === 'picture' ? grid : glb;
      },
      async checkAll() { return [{ step: 'edit', ok: true, detail: 'connected' }]; },
    };
    window.__panel = new GenPanel(document.getElementById('gen-overlay'), {
      service: window.__service,
      // Records the angle and the shapes it was handed, so the check can prove the controls reach
      // the renderer rather than merely moving a slider that nothing reads.
      capture: async (list, opts = {}) => {
        window.__captures.push({ count: list.length, turn: opts.turn, tilt: opts.tilt });
        return { views, grid, background: 0xa0a4aa, colours: [{ hex: 0x51cf66, area: 6 }] };
      },
      splitGrid: async () => views,
      prepareModel: async (blob, meta) => ({ meta }),
      commitModel: (model, options) => { window.__calls.push({ added: model.meta, replace: options?.replace }); },
      disposeModel: () => {},
      loadSample: async () => ({ grid, model: glb }),
      // Three shapes in the build, one of them picked — the exact shape of the bug this fixes.
      studio: () => {
        window.__panelShapes ||= [1, 2, 3].map((id) => ({ userData: { id }, parent: {} }));
        return { shapes: window.__panelShapes, selection: new Set([window.__panelShapes[0]]) };
      },
      cameraDirection: () => window.__cameraDir,
      toast: { show() {}, error() {} },
    });
    window.__panel.open('A');
  });
  const shot = (n) => p.screenshot({ path: path.join(out, `panel-${n}.png`) });
  await p.locator('.gen-views img').first().waitFor();
  await shot('1-check');

  // --- framing: what is photographed, and from where ---
  const lastCapture = () => p.evaluate(() => window.__captures[window.__captures.length - 1]);
  const scopeText = () => p.locator('.gen-scope').textContent();
  const firstScope = await scopeText();
  const firstCapture = await lastCapture();
  const detailLabels = await p.locator('.gen-detail-levels label').allTextContents();
  const standardDetailStartsChecked = await p.locator('.gen-detail-levels input[value="standard"]').isChecked();
  // The sliders must actually fill their column. A global `input[type="range"] { width: 120px }`
  // outranks a single class selector, which left them stubby beside a 700px gap — invisible to
  // every assertion that only reads values.
  const sliderFits = await p.evaluate(() => [...document.querySelectorAll('.gen-angle')].map((row) => {
    const track = row.querySelector('.gen-angle-slider').getBoundingClientRect().width;
    const column = Number(getComputedStyle(row).gridTemplateColumns.split(' ')[1].replace('px', ''));
    return { track, column };
  }));

  // "Use my view as the front" with the studio's own default orbit offset [5, 4, 6]:
  // atan2(5, 6) = 39.8 degrees round and asin(4 / |v|) = 27.1 degrees up, both passed through.
  await p.getByRole('button', { name: 'Use my view as the front' }).click();
  await p.waitForFunction(() => window.__captures.length >= 2);
  const fromMyView = await lastCapture();

  // The same gesture from a steeply raised camera: the turn survives, the tilt is clamped. Without
  // this the clamp would be untested in the browser, since the default view never reaches it.
  await p.evaluate(() => { window.__cameraDir = [5, 40, 6]; });
  await p.getByRole('button', { name: 'Use my view as the front' }).click();
  await p.waitForFunction(() => window.__captures.length >= 3);
  const fromSteepView = await lastCapture();
  await p.evaluate(() => { window.__cameraDir = [5, 4, 6]; });

  const resetEnabledAfterAngle = await p.getByRole('button', { name: 'Reset angle' }).isEnabled();
  await p.getByRole('button', { name: 'Reset angle' }).click();
  await p.waitForFunction(() => window.__captures.length >= 4);
  const afterReset = await lastCapture();
  const resetDisabledWhenSquare = await p.getByRole('button', { name: 'Reset angle' }).isDisabled();

  // Dragging a slider must not fire a capture per pixel, and must not commit until release.
  await p.locator('.gen-angle-slider').first().fill('180');
  await p.waitForFunction(() => window.__captures.length >= 5);
  const afterTurn = await lastCapture();
  const captureCountAfterOneDrag = await p.evaluate(() => window.__captures.length);

  await p.locator('.gen-scope-toggle input').check();
  await p.waitForFunction(() => window.__captures.length >= 6);
  const wholeBuildCapture = await lastCapture();
  const wholeBuildScope = await scopeText();
  await shot('1b-framing');
  await p.locator('.gen-scope-toggle input').uncheck();
  await p.waitForFunction(() => window.__captures.length >= 7);
  const backToSelection = await lastCapture();
  await p.getByRole('button', { name: 'Reset angle' }).click();
  await p.waitForFunction(() => window.__captures.length >= 8);
  await p.locator('.gen-detail-levels label').filter({ hasText: 'High' }).click();
  await p.getByRole('button', { name: 'Send' }).click();
  const needWords = await p.getByText('Type what it is first.').isVisible();
  await p.getByRole('textbox').first().fill('an octopus with long arms');
  const marked = await p.locator('.gen-prompt mark').textContent();
  await p.getByRole('button', { name: 'Send' }).click();
  await p.locator('.gen-bar .fill').waitFor();
  await p.waitForTimeout(1500);
  await shot('2-progress');
  const detail = await p.locator('.gen-detail').textContent();
  await p.getByText('Here is the redesign').waitFor({ timeout: 15000 });
  await shot('3-redesign');
  await p.getByRole('button', { name: 'Use this' }).click();
  await p.getByText('Here is your 3D model').waitFor({ timeout: 15000 });
  await p.waitForTimeout(1500);
  await shot('4-model');
  const replaceButton = await p.getByRole('button', { name: 'Replace my blocks' }).isVisible();
  await p.getByRole('button', { name: 'Replace my blocks' }).click();
  await p.waitForTimeout(500);
  const addedA = await p.evaluate(() => window.__calls.some((c) => c.added &&
    c.added.words === 'an octopus with long arms' && c.added.sample === false &&
    c.replace?.length === 1 && c.replace[0] === window.__panelShapes[0] &&
    c.added.replace === c.replace));
  const highDetailReached3D = await p.evaluate(() => window.__calls.some((c) => c.step === 'views3d' && c.detailLevel === 'high'));
  // route B
  await p.evaluate(() => window.__panel.open('B'));
  await p.getByRole('textbox').first().fill('a blue dragon');
  await p.getByRole('button', { name: 'Send' }).click();
  await p.getByText('Here is the picture').waitFor({ timeout: 15000 });
  await p.getByRole('button', { name: 'Use this' }).click();
  await p.getByText('Here is your 3D model').waitFor({ timeout: 15000 });
  await p.getByRole('button', { name: 'Add to my studio' }).click();
  await p.waitForTimeout(500);
  const addedB = await p.evaluate(() => window.__calls.some((c) => c.added && c.added.words === 'a blue dragon'));
  // cancel
  await p.evaluate(() => window.__panel.open('B'));
  await p.getByRole('textbox').first().fill('a cat');
  await p.getByRole('button', { name: 'Send' }).click();
  await p.locator('.gen-bar').waitFor();
  await p.getByRole('button', { name: 'Cancel' }).click();
  const backToWords = await p.getByText('What should the AI make?').first().isVisible();
  // error + sample
  await p.evaluate(() => { window.__service.mode = 'busy'; window.__panel.open('A'); });
  await p.locator('.gen-views img').first().waitFor();
  await p.getByRole('textbox').first().fill('a robot');
  await p.getByRole('button', { name: 'Send' }).click();
  await p.getByText('That did not work').waitFor({ timeout: 15000 });
  const busyText = await p.locator('.gen-error').textContent();
  await p.getByRole('button', { name: 'Show the sample' }).click();
  await p.locator('.gen-tag').waitFor();
  await p.waitForTimeout(1200);
  await shot('5-sample');
  const sampleButton = await p.getByRole('button', { name: 'Replace my blocks' }).isVisible();
  // no key → Settings first
  await p.evaluate(() => { localStorage.removeItem('studio.gen.config'); window.__panel.open('A'); });
  const settingsFirst = await p.getByText('Settings (for adults)').isVisible();
  const modelSelectCount = await p.locator('select[aria-label^="Model for:"]').count();
  const settingsCopy = await p.locator('#gen-root').textContent();
  const unavailableChoices = await p.locator('select[aria-label^="Model for:"] option:disabled').count();
  const viewsChoices = await p.locator('select[aria-label="Model for: Four views to 3D"] option:not(:disabled)').allTextContents();
  const connectionsAfterModels = await p.evaluate(() => {
    const root = document.querySelector('#gen-root');
    const connections = root.querySelector('.gen-connection-section');
    const model = root.querySelector('.gen-model-row');
    return !!connections && !!model && !!(model.compareDocumentPosition(connections) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  const rawOctree = p.getByLabel('Hunyuan3D 2mv Octree resolution', { exact: true });
  const rawFaces = p.getByLabel('Hunyuan3D 2mv Target face count');
  const rawTrellisResolution = p.getByLabel('TRELLIS 2 (fal) Resolution');
  const rawControls = {
    octree: { min: await rawOctree.getAttribute('min'), max: await rawOctree.getAttribute('max'), value: await rawOctree.inputValue() },
    faces: { min: await rawFaces.getAttribute('min'), max: await rawFaces.getAttribute('max'), value: await rawFaces.inputValue() },
    trellisOptions: await rawTrellisResolution.locator('option').allTextContents(),
  };
  const pictureModel = p.getByLabel('Model for: Picture to 3D', { exact: true });
  await pictureModel.selectOption('hunyuan3d-v3-fal');
  const generationType = p.getByLabel('Hunyuan3D v3 (fal) Generation type', { exact: true });
  const falFaces = p.getByLabel('Hunyuan3D v3 (fal) Face count', { exact: true });
  assert.equal(await generationType.inputValue(), 'Normal');
  assert.equal(await falFaces.isDisabled(), true);
  await generationType.selectOption('LowPoly');
  assert.equal(await falFaces.isDisabled(), false);
  await falFaces.fill('123456');
  await p.getByLabel('Hunyuan3D v3 (fal) Polygon type', { exact: true }).selectOption('quadrilateral');
  await p.getByLabel('Hunyuan3D v3 (fal) PBR materials', { exact: true }).selectOption('true');
  const falCard = generationType.locator('xpath=ancestor::article');
  await falCard.scrollIntoViewIfNeeded();
  await shot('6c-native-fal-options');
  await pictureModel.selectOption('trellis-2-fal');
  assert.equal(await falCard.isVisible(), false);
  assert.equal(await rawTrellisResolution.isVisible(), true);
  await rawTrellisResolution.selectOption('1536');
  const trellisCard = rawTrellisResolution.locator('xpath=ancestor::article');
  await trellisCard.getByRole('button', { name: 'Use model defaults' }).click();
  assert.equal(await rawTrellisResolution.inputValue(), '1024');
  await pictureModel.selectOption('hunyuan3d-v3-fal');
  const keyVisible = await p.getByLabel('Hugging Face Spaces Access token').isVisible();
  const falKeyVisible = await p.getByLabel('fal API key').isVisible();
  const serverUrlVisible = await p.getByLabel('fal Server or proxy URL').isVisible();
  const tencentKeyVisible = await p.getByLabel('Tencent TokenHub (official) API key').isVisible();
  const tencentUrlVisible = await p.getByLabel('Tencent TokenHub (official) Server or proxy URL').isVisible();
  const editChoices = await p.locator('select[aria-label="Model for: Redesign the four views"] option:not(:disabled)').allTextContents();
  const oneView3DChoices = await p.locator('select[aria-label="Model for: Picture to 3D"] option:not(:disabled)').allTextContents();
  const topClose = p.getByRole('button', { name: 'Close settings' });
  const topSave = p.getByRole('button', { name: 'Save & close' });
  const topActionsInitiallyVisible = await topClose.isVisible() && await topSave.isVisible();
  await shot('6-settings');
  await p.getByRole('region', { name: 'Model controls' }).scrollIntoViewIfNeeded();
  await shot('6b-controls');
  await p.getByRole('region', { name: 'Connections' }).scrollIntoViewIfNeeded();
  const topActionsStayVisible = await topClose.isVisible() && await topSave.isVisible();
  await shot('7-connections');
  // Framing. The scope assertions are the regression: a horse selected beside leftover blocks was
  // photographed WITH the blocks, and the AI built what it was shown.
  assert.equal(sliderFits.length, 2, 'both Turn and Tilt are measured');
  for (const { track, column } of sliderFits) {
    assert.ok(track > column - 4, `a slider track (${Math.round(track)}px) must fill its column (${Math.round(column)}px)`);
  }
  assert.equal(firstScope, 'Sending the 1 shape you picked, of 3.');
  assert.deepEqual(detailLabels, ['Low · 196 voxel resolution', 'Standard · 256 voxel resolution', 'High · 384 voxel resolution']);
  assert.equal(standardDetailStartsChecked, true);
  assert.equal(firstCapture.count, 1, 'only the selected shape is photographed');
  assert.equal(firstCapture.turn, 0); assert.equal(firstCapture.tilt, 0);
  assert.equal(Math.round(fromMyView.turn), 40, 'the studio camera yaw becomes the front view');
  assert.equal(Math.round(fromMyView.tilt), 27, 'a normal studio camera height is passed through');
  assert.equal(Math.round(fromSteepView.turn), 40, 'a steep camera still sets the turn');
  assert.equal(fromSteepView.tilt, 30, 'a steep camera is clamped, not passed through');
  assert.equal(resetEnabledAfterAngle, true);
  assert.equal(afterReset.turn, 0); assert.equal(afterReset.tilt, 0);
  assert.equal(resetDisabledWhenSquare, true, 'Reset is dead when there is nothing to reset');
  assert.equal(afterTurn.turn, 180, 'the Turn slider reaches the renderer');
  assert.equal(captureCountAfterOneDrag, 5, 'one slider change is one capture, not one per pixel');
  assert.equal(wholeBuildCapture.count, 3, 'the whole build really sends every shape');
  assert.equal(wholeBuildScope, 'Sending your whole build — all 3 shapes, not just the 1 you picked.');
  assert.equal(backToSelection.count, 1, 'unticking goes back to the selection');
  assert.equal(needWords, true);
  assert.equal(marked, 'an octopus with long arms');
  assert.match(detail, /step|Waiting in line/);
  assert.equal(replaceButton, true, 'route A says it will replace before the child commits');
  assert.equal(addedA, true, 'the real panel commit seam carries the capture-time scope');
  assert.equal(highDetailReached3D, true, 'the child Detail choice reaches the real panel service seam');
  assert.equal(addedB, true); assert.equal(backToWords, true);
  assert.equal(busyText, 'The AI service is busy. Try again, or show the sample.');
  assert.equal(sampleButton, true); assert.equal(settingsFirst, true);
  assert.equal(modelSelectCount, 5);
  assert.match(settingsCopy, /Multiview: Yes/); assert.match(settingsCopy, /Licence:/);
  assert.ok(unavailableChoices >= 2);
  assert.deepEqual(viewsChoices, ['Hunyuan3D 2mv', 'Hunyuan3D 2.1', 'Hunyuan3D v3 (fal)']);
  assert.equal(connectionsAfterModels, true); assert.equal(keyVisible, true); assert.equal(falKeyVisible, true);
  assert.deepEqual(rawControls.octree, { min: '16', max: '512', value: '256' });
  assert.deepEqual(rawControls.faces, { min: '100', max: '1000000', value: '10000' });
  assert.deepEqual(rawControls.trellisOptions, ['512', '1024', '1536']);
  assert.equal(serverUrlVisible, true);
  assert.equal(tencentKeyVisible, true); assert.equal(tencentUrlVisible, true);
  assert.ok(editChoices.some((name) => /\(fal\)/.test(name)));
  assert.ok(oneView3DChoices.includes('TRELLIS 2 (fal)'));
  assert.ok(oneView3DChoices.includes('Hunyuan3D 3.1 (Tencent official)'));
  assert.equal(topActionsInitiallyVisible, true);
  assert.equal(topActionsStayVisible, true);

  // Deferred dependencies deliberately ignore abort. Only the current operation may act.
  const regressions = await p.evaluate(async () => {
    const panel = window.__panel;
    const flush = () => new Promise((r) => setTimeout(r, 0));
    const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
    localStorage.setItem('studio.gen.config', JSON.stringify({ keys: { 'hf-spaces': 'xy' } }));
    const baseCapture = panel.deps.capture;
    // The real caller always hands capture the shape list; keep the fake strict about that, so a
    // change to the contract shows up here instead of being silently absorbed.
    const snapshot = await baseCapture([1], { turn: 0, tilt: 0 });
    const results = [];
    const test = (name, ok) => results.push([name, !!ok]);
    const textureBlob = {};
    const textureInput = await panel.inputFor({ step: 'texture', shapeResult: textureBlob });
    test('texture seam passes the generated mesh to textureMesh', textureInput.mesh === textureBlob);

    const oldCapture = deferred(); panel.deps.capture = () => oldCapture.promise;
    panel.open('A'); panel.close(); panel.open('B'); oldCapture.resolve(snapshot); await flush();
    test('old capture cannot overwrite a reopened route', panel.state.route === 'B' && panel.state.view === 'words');
    const captures = [deferred(), deferred()]; let ci = 0;
    panel.deps.capture = () => captures[ci++].promise;
    panel.open('A'); panel.dispatch({ type: 'retake' });
    captures[1].resolve({ ...snapshot, marker: 'new' }); await flush();
    captures[0].resolve({ ...snapshot, marker: 'old' }); await flush();
    test('out-of-order retakes keep the latest capture', panel.state.snapshot.marker === 'new');
    panel.deps.capture = baseCapture;

    for (const outcome of ['resolve', 'reject']) {
      const runs = [];
      panel.setService({ runStep(step, input, opts) { const d = deferred(); runs.push({ ...d, opts }); return d.promise; } });
      const send = () => { panel.open('B'); panel.dispatch({ type: 'words', words: 'cat', prompt: 'cat' }); panel.dispatch({ type: 'send' }); };
      send(); await flush(); panel.close(); send(); await flush();
      const current = panel.operation, timer = current.ticker;
      runs[0].opts.onProgress({ stage: 'running', queuePosition: 99 });
      runs[0][outcome](outcome === 'resolve' ? snapshot.grid : new Error('old error xy'));
      await flush();
      test(`late ${outcome} cannot alter the new run or stop its ticker`, panel.operation === current && current.ticker === timer && current.status.queuePosition !== 99 && panel.state.view === 'running');
      panel.cancelActive();
      test('Cancel returns immediately even when provider ignores abort', panel.state.view === 'words' && runs[1].opts.signal.aborted);
      runs[1].reject(new Error('late xy')); await flush();
    }

    const sample = deferred(); panel.deps.loadSample = () => sample.promise;
    panel.open('B'); panel.dispatch({ type: 'show-sample' }); panel.close(); panel.open('B');
    sample.resolve({ grid: snapshot.grid, model: snapshot.grid }); await flush();
    test('late sample cannot replace the new session', panel.state.view === 'words' && !panel.state.sample);

    let prepared = 0, committed = 0, disposed = 0;
    let preparation = deferred();
    panel.deps.prepareModel = () => { prepared++; return preparation.promise; };
    panel.deps.commitModel = () => { committed++; };
    panel.deps.disposeModel = () => { disposed++; };
    const ready = () => { panel.open('B'); panel.dispatch({ type: 'sample-loaded', picture: snapshot.grid, model: snapshot.grid }); };
    ready(); panel.dispatch({ type: 'use-this' }); panel.dispatch({ type: 'use-this' });
    test('double Add schedules one preparation and shows a disabled button', prepared === 1 && panel.state.view === 'adding' && !!panel.root.querySelector('button:disabled'));
    preparation.resolve({}); await flush(); test('double Add commits once', committed === 1 && !panel.isOpen());
    preparation = deferred(); ready(); panel.dispatch({ type: 'use-this' }); panel.close(); panel.open('B');
    preparation.resolve({}); await flush();
    test('cancelled preparation is disposed without insertion or closing the new panel', committed === 1 && disposed === 1 && panel.isOpen() && panel.state.view === 'words');

    for (const outcome of ['resolve', 'reject']) {
      const pending = deferred(); let checkSignal;
      panel.setService({ checkAll({ signal }) { checkSignal = signal; return pending.promise; } });
      panel.open('B'); panel.dispatch({ type: 'open-settings' });
      [...panel.root.querySelectorAll('button')].find((b) => b.textContent === 'Test the AI services').click();
      panel.close(); panel.open('B');
      pending[outcome](outcome === 'resolve' ? [{ step: 'edit', ok: false, detail: 'secret xy' }] : new Error('secret xy'));
      await flush();
      test(`closed Settings ignores late ${outcome}`, checkSignal.aborted && panel.state.view === 'words' && !panel.root.textContent.includes('secret'));
    }
    // A failure must say WHICH thing broke, redacted — otherwise a live bug is undiagnosable from
    // the screen (that is how the 09-20 gr.update wrapper hid behind "Something went wrong").
    {
      const { GenError } = await import('/src/ai/gen-service.js');
      panel.setService({ runStep() { throw new GenError('failed', 'the Space sent no file (xy)'); } });
      panel.open('B'); panel.dispatch({ type: 'words', words: 'cat', prompt: 'cat' });
      panel.dispatch({ type: 'send' });
      for (let i = 0; i < 6; i++) await flush();
      const shown = panel.root.textContent;
      test('a failure shows its reason, not only the public sentence', shown.includes('the Space sent no file'));
      test('the public sentence is still what the child reads', shown.includes('Something went wrong making this.'));
      test('the reason is redacted before it reaches the screen', !shown.includes('(xy)') && shown.includes('[key]'));
      panel.open('B'); // the next check dispatches into an already-open panel
    }

    panel.setService({ checkAll: async () => { throw new Error('settings secret xy'); } });
    panel.dispatch({ type: 'open-settings' });
    const button = [...panel.root.querySelectorAll('button')].find((b) => b.textContent === 'Test the AI services');
    button.click(); await flush();
    test('Settings errors are safe and test button recovers', !button.disabled && !panel.root.textContent.includes('settings secret xy'));
    panel.close();
    return results;
  });
  for (const [name, ok] of regressions) assert.equal(ok, true, name);
}).catch((err) => { console.error(err); process.exitCode = 1; });
