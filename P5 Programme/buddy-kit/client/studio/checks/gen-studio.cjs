// Headed end-to-end check inside the real studio with a FAKE service (no GPU): toolbar → check step
// → redesign → 3D → replaces the photographed scope → Undo restores it → Redo replaces it again.
const path = require('path');
const { run } = require('./gen-browser.cjs');
const { assertStyled } = require('./page-state.cjs');
run(async ({ p, base, out, assert }) => {
  await p.goto(base);
  await p.waitForFunction(() => window.__studio && window.__gen);
  const go = p.getByRole('button', { name: /LET'S GO/i });
  if (await go.isVisible().catch(() => false)) await go.click();
  await assertStyled(p); // the real page, really styled — see checks/page-state.cjs styleFailures
  await p.evaluate(() => {
    localStorage.setItem('studio.gen.config', JSON.stringify({ keys: { 'hf-spaces': 'hf_fake_key_for_the_check' } }));
    const s = window.__studio;
    for (const m of [...s.shapes]) s.remove(m);
    // An octopus: a round head, six arms tapering to the floor, two eyes. Deliberately NOT
    // left-right-and-front-back identical, so the four captured views must actually differ.
    const head = s.addPrimitive('sphere', 0x9775fa, { silent: true });
    head.name = 'photographed head';
    head.scale.set(1.6, 1.75, 1.6); head.position.set(0, 2.1, 0);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const arm = s.addPrimitive('cone', 0xf06595, { silent: true });
      arm.scale.set(0.38, 1.7, 0.38);
      arm.position.set(Math.sin(a) * 0.72, 0.85, Math.cos(a) * 0.72);
      arm.rotateY(a); arm.rotateX(Math.PI - 0.5); // apex down, leaning outward
      if (i === 0) arm.name = 'photographed arm';
    }
    for (const dx of [-0.34, 0.34]) {
      const eye = s.addPrimitive('sphere', 0xfcc419, { silent: true });
      eye.scale.setScalar(0.34); eye.position.set(dx, 2.35, 0.66);
      if (dx < 0) eye.name = 'photographed eye';
      else eye.name = 'bystander eye';
    }
    // Photograph a proper asymmetric creature but leave one eye out as the bystander. The check
    // deliberately selects that eye after capture, proving
    // the adapter carries snapshot.scope rather than consulting the live selection at commit.
    s.select(head);
    for (const shape of s.shapes) if (shape !== head && shape.name !== 'bystander eye') s.select(shape, true);
    s.emit('changed');
  });
  await p.evaluate(async () => {
    const glb = await (await fetch('/__fake.glb')).blob();
    const { createGenService } = await import('/src/ai/gen-service.js');
    const { createHfSpacesProvider } = await import('/src/ai/gen-providers/hf-spaces.js');
    const { loadGenConfig } = await import('/src/ai/gen-config.js');
    window.__providerCalls = [];
    const realService = createGenService({ config: loadGenConfig, providers: {
      'hf-spaces': (key, model, connection) => createHfSpacesProvider(key, model, {
        controlValues: connection.controlValues,
        handleFile: (file) => file,
        fetchImpl: async () => ({ ok: true, blob: async () => glb }),
        connect: async () => ({ close() {}, submit(endpoint, payload) {
          window.__providerCalls.push({ endpoint, payload });
          return (async function* () {
            if (endpoint === '/on_export_click') yield { type: 'status', stage: 'error', message: 'Unknown format for load: ply' };
            else yield { type: 'data', data: [{ path: '/tmp/gradio/shape.glb', url: '/__fake.glb' }] };
          })();
        } }),
      }),
    } });
    window.__detailSeen = null;
    window.__gen.setService({
      async runStep(step, input, { onProgress }) {
        if (step === 'views3d') window.__detailSeen = input.detailLevel;
        onProgress({ stage: 'running' });
        await new Promise((r) => setTimeout(r, 800));
        return step === 'edit' ? input.grid : realService.runStep(step, input, { onProgress });
      },
      async checkAll() { return []; },
    });
  });
  const measure = () => p.evaluate(() => {
    const s = window.__studio;
    const m = s.shapes.find((x) => x.name === 'an octopus');
    if (!m) return { count: s.shapes.length, found: false };
    m.geometry.computeBoundingBox(); // undo/redo rebuild the geometry without a bounding box
    const Box3 = m.geometry.boundingBox.constructor;
    const mb = new Box3().setFromObject(m);
    return { count: s.shapes.length, found: true, generatedCount: s.shapes.filter((x) => x.userData.generated).length,
      generated: m.userData.generated === true, editable: m.isMesh && !m.isSkinnedMesh && m.children.length === 0,
      undoCount: s.undoStack.length, minY: mb.min.y, height: mb.max.y - mb.min.y,
      centreX: (mb.min.x + mb.max.x) / 2, centreZ: (mb.min.z + mb.max.z) / 2, minX: mb.min.x };
  });
  // The real studio also has an AI Optimization panel with its own Send button and textbox, so
  // every locator for THIS overlay's controls is scoped to #gen-overlay.
  const panel = p.locator('#gen-overlay');
  const before = await p.evaluate(() => window.__studio.shapes.length);
  const undoBefore = await p.evaluate(() => window.__studio.undoStack.length);
  const sourceBefore = await p.evaluate(async () => {
    const { takeSnapshot } = await import('/src/edit/snapshot.js');
    const snap = takeSnapshot(window.__studio);
    const photographed = [...window.__studio.selection];
    for (const shape of photographed) { shape.geometry.computeBoundingBox(); shape.updateWorldMatrix(true, false); }
    const box = photographed[0].geometry.boundingBox.clone().applyMatrix4(photographed[0].matrixWorld);
    for (const shape of photographed.slice(1)) box.union(shape.geometry.boundingBox.clone().applyMatrix4(shape.matrixWorld));
    const capturedIds = new Set(photographed.map((shape) => shape.userData.id));
    return {
      remainingObjects: JSON.stringify(snap.objects.filter((o) => !capturedIds.has(o.id))),
      capturedCount: photographed.length,
      bounds: { min: box.min.toArray(), max: box.max.toArray() },
    };
  });
  await p.getByRole('button', { name: 'Make it real' }).click();
  await panel.locator('.gen-views img').first().waitFor();
  await panel.getByRole('button', { name: 'Settings', exact: true }).click();
  const simplify = panel.getByLabel('Hunyuan3D 2mv Simplify mesh', { exact: true });
  assert.equal(await simplify.inputValue(), 'false');
  const faces = panel.getByLabel('Hunyuan3D 2mv Target face count', { exact: true });
  assert.equal(await faces.isDisabled(), true);
  await simplify.selectOption('true');
  await faces.fill('23456');
  await panel.getByLabel('Hunyuan3D 2mv Inference steps preset', { exact: true }).selectOption('fast');
  await panel.getByRole('button', { name: 'Save & close', exact: true }).click();
  await panel.locator('.gen-views img').first().waitFor();
  await p.screenshot({ path: path.join(out, 'studio-1-check.png') });

  // --- the framing controls, driven through the REAL app ---
  //
  // This is the gap that shipped a dead control: main.js wrapped capture as
  // `(shapes) => captureViews(shapes)`, dropping the panel's {turn, tilt}. The panel check proved
  // the panel SENDS the angle (against its own fake capture) and the capture check proved the
  // renderer HONOURS it (calling captureViews directly) — nothing crossed the adapter between
  // them. So this drives the actual sliders in the actual studio and compares actual pixels.
  const viewPixels = (which) => p.evaluate(async (i) => {
    const img = document.querySelectorAll('#gen-overlay .gen-views img')[i];
    const blob = await (await fetch(img.src)).blob();
    const bmp = await createImageBitmap(blob);
    const c = document.createElement('canvas');
    c.width = 96; c.height = 96;
    const x = c.getContext('2d');
    x.drawImage(bmp, 0, 0, 96, 96);
    bmp.close();
    return [...x.getImageData(0, 0, 96, 96).data];
  }, { front: 0, left: 1, back: 2, right: 3 }[which]);
  const meanDiff = (a, b) => {
    let total = 0;
    for (let i = 0; i < a.length; i += 4) {
      total += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    }
    return total / ((a.length / 4) * 3);
  };
  const settle = async () => {
    await panel.locator('.gen-views img').first().waitFor();
    await p.waitForTimeout(400);
  };
  const turnSlider = panel.locator('.gen-angle-slider').first();
  const tiltSlider = panel.locator('.gen-angle-slider').nth(1);

  const squareFront = await viewPixels('front');
  const squareLeft = await viewPixels('left');
  await turnSlider.fill('90');
  await settle();
  const ninetyFront = await viewPixels('front');
  await turnSlider.fill('0');
  await settle();
  await tiltSlider.fill('25');
  await settle();
  const tiltedFront = await viewPixels('front');
  await panel.getByRole('button', { name: 'Reset angle' }).click();
  await settle();
  const resetFront = await viewPixels('front');
  await p.screenshot({ path: path.join(out, 'studio-1b-framing.png') });

  const turnMoved = meanDiff(squareFront, ninetyFront);
  const tiltMoved = meanDiff(squareFront, tiltedFront);
  const resetReturned = meanDiff(squareFront, resetFront);
  // The decisive one: a quarter turn is a RIGID rotation of the whole set, so the new front must
  // land exactly where left was. Unlike "the picture changed", this cannot be satisfied by a
  // coincidence, and unlike a half turn it does not depend on the fixture being asymmetric — the
  // test octopus has six arms and so looks nearly the same at 180 degrees, which is correct.
  const quarterTurnIsRigid = meanDiff(ninetyFront, squareLeft);
  assert.ok(turnMoved > 3, `Turn must change the real picture (got ${turnMoved.toFixed(2)})`);
  assert.ok(quarterTurnIsRigid < 1.5,
    `a quarter turn must put front where left was (got ${quarterTurnIsRigid.toFixed(2)})`);
  assert.ok(tiltMoved > 3, `Tilt must change the real picture (got ${tiltMoved.toFixed(2)})`);
  assert.ok(resetReturned < 1.5, `Reset angle must return to square on (got ${resetReturned.toFixed(2)})`);
  await panel.getByRole('button', { name: 'Retake' }).focus();
  await p.keyboard.press('2');
  const modeAfterKey = await p.evaluate(() => window.__studio.mode);
  await p.evaluate(() => {
    const s = window.__studio;
    s.select(s.shapes.find((m) => m.name === 'bystander eye'));
  });
  await panel.locator('.gen-detail-levels label').filter({ hasText: 'High' }).click();
  await panel.getByRole('textbox').first().fill('an octopus');
  await panel.getByRole('button', { name: 'Send' }).click();
  await panel.getByText('Here is the redesign').waitFor({ timeout: 15000 });
  await panel.getByRole('button', { name: 'Use this' }).click();
  await panel.getByText('Here is your 3D model').waitFor({ timeout: 15000 });
  assert.match(await panel.textContent(), /face reduction was not applied/);
  await p.screenshot({ path: path.join(out, 'studio-export-recovery.png') });
  const replaceLabel = await panel.getByRole('button', { name: 'Replace my blocks' }).isVisible();
  await panel.getByRole('button', { name: 'Replace my blocks' }).click();
  await p.waitForTimeout(1000);
  const added = await measure();
  const detailSeen = await p.evaluate(() => window.__detailSeen);
  const calls = await p.evaluate(() => window.__providerCalls);
  assert.equal(calls.find((c) => c.endpoint === '/shape_generation').payload.steps, 10);
  assert.equal(calls.find((c) => c.endpoint === '/shape_generation').payload.octree_resolution, 384);
  assert.equal(calls.find((c) => c.endpoint === '/on_export_click').payload.target_face_num, 23456);
  assert.equal(calls.filter((c) => c.endpoint === '/shape_generation').length, 1);
  await p.click('#reset-view');
  await p.waitForTimeout(800);
  await p.screenshot({ path: path.join(out, 'studio-2-added.png') });
  await p.keyboard.press('Control+z');
  await p.waitForTimeout(500);
  const afterUndo = await measure();
  await p.keyboard.press('Control+Shift+z');
  await p.waitForTimeout(500);
  const afterRedo = await measure();
  assert.equal(modeAfterKey, 'build');
  assert.equal(detailSeen, 'high', 'the child Detail control crosses the real app adapter into the 3D service');
  assert.equal(replaceLabel, true);
  assert.equal(added.count, before - sourceBefore.capturedCount + 1); assert.equal(added.generatedCount, 1);
  assert.equal(added.generated, true); assert.equal(added.editable, true);
  assert.equal(added.undoCount, undoBefore + 1);
  const targetCentreX = (sourceBefore.bounds.min[0] + sourceBefore.bounds.max[0]) / 2;
  const targetCentreZ = (sourceBefore.bounds.min[2] + sourceBefore.bounds.max[2]) / 2;
  const targetHeight = sourceBefore.bounds.max[1] - sourceBefore.bounds.min[1];
  assert.ok(Math.abs(added.minY - sourceBefore.bounds.min[1]) < 0.02);
  assert.ok(Math.abs(added.height - targetHeight) < 0.02);
  assert.ok(Math.abs(added.centreX - targetCentreX) < 0.02);
  assert.ok(Math.abs(added.centreZ - targetCentreZ) < 0.02);
  assert.equal(afterUndo.found, false); assert.equal(afterUndo.count, before);
  assert.equal(afterRedo.found, true); assert.equal(afterRedo.count, before - sourceBefore.capturedCount + 1); assert.equal(afterRedo.generatedCount, 1);
  assert.ok(Math.abs(afterRedo.minX - added.minX) < 0.02);
  const sourceAfter = await p.evaluate(async () => {
    const { takeSnapshot } = await import('/src/edit/snapshot.js');
    return JSON.stringify(takeSnapshot(window.__studio).objects.filter((o) => !o.generated));
  });
  assert.equal(sourceAfter, sourceBefore.remainingObjects,
    'only the photographed block is replaced; the later live selection is untouched');

  // Malformed provider output cannot mutate the document or create an undo entry.
  const invalidBefore = await p.evaluate(() => ({ count: __studio.shapes.length, undo: __studio.undoStack.length }));
  await p.evaluate(() => {
    __gen.open('B');
    __gen.dispatch({ type: 'sample-loaded', model: new Blob(['not a GLB']), picture: null });
  });
  await panel.getByRole('button', { name: 'Add the sample' }).click();
  await panel.getByText('That did not work').waitFor();
  const invalidAfter = await p.evaluate(() => ({ count: __studio.shapes.length, undo: __studio.undoStack.length }));
  assert.deepEqual(invalidAfter, invalidBefore);
  await p.evaluate(() => __gen.close());

  // Give the existing debounced autosave time to finish, then exercise actual reload.
  await p.waitForTimeout(2000);
  await p.reload();
  await p.waitForFunction(() => window.__studio?.shapes.some((m) => m.userData.generated));
  const reloaded = await measure();
  assert.equal(reloaded.count, before - sourceBefore.capturedCount + 1); assert.equal(reloaded.generatedCount, 1);
  assert.ok(Math.abs(reloaded.minX - added.minX) < 0.02);
  assert.ok(Math.abs(reloaded.height - added.height) < 0.02);
}).catch((err) => { console.error(err); process.exitCode = 1; });
