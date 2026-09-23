const fs = require('node:fs');
const path = require('node:path');
const { run } = require('./gen-browser.cjs');
const { waitForBoot } = require('./page-state.cjs');
const { makeGLB } = require('./gen-fixture.cjs');
run(async ({ p, base, out, assert }) => {
  const gearPath = path.join(out, 'roundtrip-gear.glb'); fs.writeFileSync(gearPath, makeGLB());
  await p.goto(base); await waitForBoot(p);
  await p.evaluate(async () => {
    const { addTubeShape, chainUpTube, bindNow } = await import('/src/rig/tests/fixtures.js');
    const s = window.__studio; while (s.shapes.length) s.remove(s.shapes[0]);
    addTubeShape(s); const r = s.ensureRig(); chainUpTube(r); bindNow(s);
    r.graph.setMotion({ legs: [], roles: {}, gait: 'waddle', softness: .65, forward: '+z', stride: 25, duration: 1.2 });
    s.setMode('fit');
  });
  const loadGear = async () => {
    await p.setInputFiles('input[type=file][multiple]', gearPath);
    await p.getByLabel('Bind to bone', { exact: true }).waitFor();
    await p.getByLabel('Bind to bone', { exact: true }).selectOption('j3');
  };
  await loadGear();
  await p.evaluate(() => { const s = window.__studio; s.select(s.shapes.find(o => !o.userData.isGear)); });
  const download = async filename => {
    await p.getByRole('button', { name: /Download/ }).click();
    const pending = p.waitForEvent('download');
    await p.getByText('Download dressed model', { exact: true }).click();
    const file = await pending, target = path.join(out, filename); await file.saveAs(target);
    const bytes = fs.readFileSync(target), json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    assert.deepEqual(json.animations.map(c => c.name), ['Walk', 'Jump']);
    assert.ok(!json.nodes.some(n => n.extras?.isOutline || n.extras?.isJointBall || n.extras?.isRigLink));
    return target;
  };
  const first = await download('champion-first-visit.glb');
  // Return on a fresh browser document with no prior champion or wardrobe.
  // App storage is origin-scoped: clear through the browser, then reload.
  const session = await p.context().newCDPSession(p);
  await session.send('Storage.clearDataForOrigin', { origin: base, storageTypes: 'all' });
  await p.reload(); await waitForBoot(p);
  await p.evaluate(() => { const s = window.__studio; while (s.shapes.length) s.remove(s.shapes[0]); });
  await p.setInputFiles('input[type=file][accept=".glb,.gltf"]', first);
  await p.waitForFunction(() => window.__studio.rig?.skinBones.length > 0);
  await p.evaluate(() => window.__studio.setMode('fit'));
  assert.ok(await p.getByRole('button', { name: /Remove selected gear/ }).count(), 'import restored wardrobe controls');
  await p.evaluate(() => { const s = window.__studio; s.select(s.shapes.find(o => o.userData.isGear)); });
  assert.equal(await p.getByLabel('Bind to bone', { exact: true }).inputValue(), 'j3', 'returned gear is selectable and bound in Fit');
  await loadGear();
  const second = await download('champion-second-visit.glb');
  const bytes = fs.readFileSync(second), json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  assert.equal(json.nodes.filter(n => n.extras?.studioGear).length, 2, 'both accessories retained');
  const gearBounds = () => p.evaluate(async () => {
    const THREE = await import('/node_modules/.vite/deps/three.js');
    const s = window.__studio; s.group.updateMatrixWorld(true);
    return s.shapes.filter(o => o.userData.isGear).map(o => { const b = new THREE.Box3().setFromObject(o); return [...b.min.toArray(), ...b.max.toArray()]; });
  });
  const beforeReload = await gearBounds();
  await p.waitForTimeout(1500); await p.reload(); await waitForBoot(p);
  await p.evaluate(() => window.__studio.setMode('fit'));
  const afterReload = await gearBounds();
  assert.equal(afterReload.length, beforeReload.length, 'reload does not duplicate gear meshes');
  assert.ok(afterReload.every((row, i) => row.every((v, k) => Math.abs(v - beforeReload[i][k]) < 1e-4)), `reload preserves fitted geometry placement: ${JSON.stringify({ beforeReload, afterReload })}`);
  const third = await download('champion-after-reload.glb');
  const data = fs.readFileSync(third), restored = JSON.parse(data.subarray(20, 20 + data.readUInt32LE(12)).toString());
  assert.equal(restored.nodes.filter(n => n.extras?.studioGear).length, 2, 'wardrobe persists across reload');
  await p.evaluate(() => window.__studio.select(null));
  await p.screenshot({ path: path.join(out, 'dressed-roundtrip.png') });
  console.log('Dressed download/import, second accessory, animations and reload passed.');
}).catch(error => { console.error(error); process.exitCode = 1; });
