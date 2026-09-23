// Headed end-to-end proof with a three-legged model. No external generation calls.
const fs = require('node:fs');
const path = require('node:path');
const { run } = require('./gen-browser.cjs');
const { waitForBoot } = require('./page-state.cjs');
run(async ({ p, base, out, assert }) => {
  await p.setViewportSize({ width: 1024, height: 768 });
  await p.goto(base); await waitForBoot(p);
  const download = async (selector, filename) => {
    const pending = p.waitForEvent('download'); await p.locator(selector).click();
    const file = await pending; await file.saveAs(path.join(out, filename));
    const bytes = fs.readFileSync(path.join(out, filename));
    assert.equal(bytes.readUInt32LE(0), 0x46546c67);
    return JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  };
  const plain = await download('#export-model', 'motion-unrigged.glb');
  assert.ok(plain.meshes.length && !plain.skins?.length, 'plain model exports before rigging');
  await p.evaluate(async () => {
    const THREE = await import('/node_modules/.vite/deps/three.js');
    const { bindNow } = await import('/src/rig/tests/fixtures.js');
    const s = window.__studio;
    while (s.shapes.length) s.remove(s.shapes[0]);
    const body = s.addPrimitive('sphere', '#45bddd'); body.position.set(0, 1.4, 0); body.scale.set(.6, .4, .6); body.updateMatrixWorld(true);
    const r = s.ensureRig(), root = r.graph.add([0, 0, 0], null, body.userData.id);
    r.graph.add([0, 1.5, 0], root, body.userData.id);
    window.__motionLegs = [];
    for (let i = 0; i < 3; i++) {
      const x = Math.cos(i * Math.PI * 2 / 3) * .4, z = Math.sin(i * Math.PI * 2 / 3) * .4;
      const leg = s.addPrimitive('cylinder', '#ffb35a'); leg.geometry.dispose(); leg.geometry = new THREE.CylinderGeometry(.13, .16, 1.3, 16); leg.position.set(x, .65, z);
      const local = (y) => body.worldToLocal(new THREE.Vector3(x, y, z)).toArray();
      const knee = r.graph.add(local(.65), root, body.userData.id); window.__motionLegs.push(knee);
      r.graph.add(local(0), knee, body.userData.id);
    }
    r.rebuild(); bindNow(s);
    r.bones.get(window.__motionLegs[0]).rotation.z = .12;
    s.select(body); s.setMode('pose'); s.emit('changed');
    window.__motionBefore = JSON.stringify({ bones: [...r.bones].map(([id, b]) => [id, b.position.toArray(), b.quaternion.toArray()]), undo: s.undoStack.length });
  });
  await p.click('#reset-view');
  const rigged = await download('#export-model', 'motion-rigged.glb');
  assert.ok(rigged.skins.length, 'rigged GLB includes skeleton');
  await p.getByRole('button', { name: 'Walk / Jump', exact: true }).click();
  assert.equal(await p.locator('.motion-legs input:checked').count(), 3, 'three legs detected');
  await p.screenshot({ path: path.join(out, 'motion-settings.png') });
  await p.getByRole('button', { name: 'Play', exact: true }).click();
  await p.waitForTimeout(350);
  assert.ok(await p.evaluate(() => {
    const s = window.__studio, preview = s.group.parent.children.find((o) => o !== s.group && o.getObjectByName?.(window.__motionLegs[0]));
    const q = preview?.getObjectByName(window.__motionLegs[0]).quaternion;
    return !s.group.visible && q && Math.hypot(q.x, q.y, q.z) > .01;
  }), 'Walk deforms preview in real render loop');
  await p.screenshot({ path: path.join(out, 'motion-walk.png') });
  await p.getByLabel('Motion', { exact: true }).selectOption('Jump');
  await p.getByRole('button', { name: 'Play', exact: true }).click();
  await p.waitForTimeout(550);
  await p.screenshot({ path: path.join(out, 'motion-jump.png') });
  await p.getByRole('button', { name: 'Stop', exact: true }).click();
  await download('.motion-dialog [data-action=export]', 'motion-tripod.glb');
  await p.locator('.motion-dialog summary').click();
  const kneeId = await p.locator('.motion-legs input:checked').first().inputValue();
  await p.getByLabel(`Bend direction for knee ${kneeId}`, { exact: true }).selectOption('-1');
  await p.getByRole('button', { name: 'Play', exact: true }).click(); await p.waitForTimeout(100);
  assert.match(await p.locator('.motion-status').textContent(), /playing/, 'manual knee direction reaches the animation generator');
  await p.getByRole('button', { name: 'Stop', exact: true }).click();
  await p.getByLabel(`Bend direction for knee ${kneeId}`, { exact: true }).selectOption('1');
  await p.getByRole('button', { name: `Highlight ${kneeId}`, exact: true }).click();
  assert.match(await p.locator('.motion-status').textContent(), /Hip .*gold.*Knee .*blue.*Ankle .*green/, 'three anatomical markers are explained');
  await p.locator('.motion-legs input:checked').first().uncheck();
  assert.equal(await p.locator('.motion-legs input:checked').count(), 2, 'manual leg correction is available');
  const animated = await download('.motion-dialog [data-action=export]', 'motion-animated.glb');
  assert.deepEqual(animated.animations.map((a) => a.name), ['Walk', 'Jump']);
  assert.ok(animated.skins.length && animated.animations.every((a) => a.channels.length >= 5), 'corrected two legs and root appear in exported channels');
  await p.getByRole('button', { name: 'Close', exact: true }).click();
  assert.ok(await p.evaluate(() => {
    const s = window.__studio, r = s.rig;
    return s.group.visible && window.__motionBefore === JSON.stringify({ bones: [...r.bones].map(([id, b]) => [id, b.position.toArray(), b.quaternion.toArray()]), undo: s.undoStack.length });
  }), 'playback and export leave original pose and undo unchanged');
  const regular = await download('#actions button:has-text("Export")', 'motion-regular-export.glb');
  assert.deepEqual(regular.animations.map((a) => a.name), ['Walk', 'Jump'], 'the ordinary Pose Export includes saved animations');
  await p.waitForTimeout(1200); await p.reload(); await waitForBoot(p);
  const afterReload = await download('#export-model', 'motion-reloaded-export.glb');
  assert.deepEqual(afterReload.animations.map((a) => a.name), ['Walk', 'Jump'], 'top-bar Export includes animations after reload');
  await p.evaluate(() => { const s = window.__studio; while (s.shapes.length) s.remove(s.shapes[0]); s.setMode('build'); });
  await p.setInputFiles('input[type=file][accept=".glb,.gltf"]', path.join(out, 'motion-reloaded-export.glb'));
  await p.waitForFunction(() => !!window.__studio.rig?.graph.motion && window.__studio.rig.skinBones.length > 0);
  const imported = await download('#export-model', 'motion-imported-export.glb');
  assert.deepEqual(imported.animations.map((a) => a.name), ['Walk', 'Jump'], 'reimported Studio GLB retains animation settings under new joint IDs');
  await p.evaluate(() => { window.__studio.setMode('pose'); });
  // Snowman regression: a central downward segment must not become a leg.
  await p.evaluate(async () => {
    const { bindNow } = await import('/src/rig/tests/fixtures.js');
    const s = window.__studio;
    while (s.shapes.length) s.remove(s.shapes[0]);
    const body = s.addPrimitive('sphere', '#e3ded2'); body.position.set(0, .7, 0); body.scale.set(1.3, 1.4, 1.3); body.updateMatrixWorld(true);
    const head = s.addPrimitive('sphere', '#e3ded2'); head.position.set(0, 1.65, 0); head.scale.setScalar(.9);
    const r = s.ensureRig(), root = r.graph.add([0, 0, 0], null, body.userData.id);
    r.graph.add([0, -.5, 0], root, body.userData.id); r.graph.add([0, .7, 0], root, body.userData.id);
    for (const side of [-1, 1]) {
      const arm = s.addPrimitive('cylinder', '#ad8761'); arm.position.set(side * .7, 1, 0); arm.scale.set(.12, .5, .12); arm.rotation.z = side * 1;
      const shoulder = r.graph.add([side * .25, .25, 0], root, body.userData.id);
      r.graph.add([side * .65, .3, 0], shoulder, body.userData.id);
    }
    r.rebuild(); bindNow(s); s.select(null); s.emit('changed'); window.__snowRoot = root;
  });
  await p.click('#reset-view');
  await p.getByRole('button', { name: 'Walk / Jump', exact: true }).click();
  assert.equal(await p.locator('.motion-legs input:checked').count(), 0, 'snowman has no suggested legs');
  await p.getByLabel('Motion', { exact: true }).selectOption('Walk');
  assert.ok(!(await p.locator('[data-field=motion] option').first().evaluate((option) => option.disabled)), 'snowman can Walk without legs');
  await p.getByRole('button', { name: 'Play', exact: true }).click();
  await p.waitForTimeout(2800);
  await p.screenshot({ path: path.join(out, 'motion-waddle.png') });
  await p.getByLabel('Motion', { exact: true }).selectOption('Jump');
  await p.getByRole('button', { name: 'Play', exact: true }).click(); await p.waitForTimeout(550);
  assert.ok(await p.evaluate(() => {
    const s = window.__studio, preview = s.group.parent.children.find((o) => o !== s.group && o.getObjectByName?.(window.__snowRoot));
    const root = preview.getObjectByName(window.__snowRoot);
    return root.position.y > s.rig.bones.get(window.__snowRoot).position.y + .1;
  }), 'snowman jumps without selecting a fake leg');
  await p.screenshot({ path: path.join(out, 'motion-snowman.png') });
  const snow = await download('.motion-dialog [data-action=export]', 'motion-snowman.glb');
  assert.deepEqual(snow.animations.map((a) => a.name), ['Walk', 'Jump'], 'snowman exports both motions');
  assert.ok(snow.animations.every((a) => a.channels.some((c) => c.target.path === 'scale') && a.channels.some((c) => c.target.path === 'rotation')), 'export includes body softness and overlapping motion');
  await p.getByRole('button', { name: 'Close', exact: true }).click();
  console.log('Motion and export, including snowman: headed tablet checks passed.');
}).catch((e) => { console.error(e); process.exitCode = 1; });
