const path = require('node:path');
const { run } = require('./gen-browser.cjs');
const { waitForBoot } = require('./page-state.cjs');
run(async ({ p, base, out, assert }) => {
  await p.goto(base); await waitForBoot(p);
  await p.evaluate(async () => {
    const THREE = await import('/node_modules/.vite/deps/three.js');
    const { bindNow } = await import('/src/rig/tests/fixtures.js');
    const s = window.__studio;
    while (s.shapes.length) s.remove(s.shapes[0]);
    const body = s.addPrimitive('box');
    const r = s.ensureRig(), root = r.graph.add([0, 1, 0], null, body.userData.id);
    r.graph.add([0, 3, 0], root, body.userData.id);
    window.__shortKnees = [];
    for (const x of [-.3, .3]) for (const z of [-.5, .5]) {
      const mesh = s.addPrimitive('cylinder'); mesh.geometry.dispose();
      mesh.geometry = new THREE.CylinderGeometry(.12, .12, .7, 12, 12).translate(0, .35, 0);
      mesh.position.set(x, 0, z); mesh.updateMatrixWorld(true);
      const hip = r.graph.add([0, .7, 0], root, mesh.userData.id);
      const knee = r.graph.add([0, .55, 0], hip, mesh.userData.id);
      r.graph.add([0, 0, 0], knee, mesh.userData.id); window.__shortKnees.push(knee);
    }
    r.rebuild(); bindNow(s); s.setMode('pose'); s.emit('changed');
    window.__sampleSkin = () => {
      const preview = s.group.parent.children.find(o => o !== s.group && o.getObjectByName?.(window.__shortKnees[0]));
      preview.updateMatrixWorld(true);
      const points = [];
      preview.traverse(o => {
        if (!o.isSkinnedMesh) return;
        o.skeleton.update();
        for (let i = 0; i < o.geometry.attributes.position.count; i += 5) points.push(...o.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(o.matrixWorld).toArray());
      });
      return points;
    };
  });
  await p.getByRole('button', { name: 'Walk / Jump', exact: true }).click();
  assert.deepEqual(await p.locator('.motion-legs input:checked').evaluateAll(inputs => inputs.map(i => i.value).sort()), await p.evaluate(() => window.__shortKnees.sort()));
  for (const motion of ['Walk', 'Jump']) {
    await p.getByLabel('Motion', { exact: true }).selectOption(motion);
    await p.getByRole('button', { name: 'Play', exact: true }).click();
    assert.match(await p.locator('.motion-status').textContent(), /playing/);
    const before = await p.evaluate(() => window.__sampleSkin());
    await p.waitForTimeout(270);
    const after = await p.evaluate(() => window.__sampleSkin());
    assert.ok(before.length > 0 && before.some((v, i) => Math.abs(v - after[i]) > .01), `${motion} moves actual skinned vertices`);
    await p.screenshot({ path: path.join(out, `motion-short-legs-${motion}.png`) });
    await p.getByRole('button', { name: 'Stop', exact: true }).click();
  }
  await p.getByRole('button', { name: 'Close', exact: true }).click();
  await p.getByRole('button', { name: 'Walk / Jump', exact: true }).click();
  await p.getByRole('button', { name: 'Play', exact: true }).click();
  assert.match(await p.locator('.motion-status').textContent(), /playing/, 'saved mapping reopens and plays');
  console.log('Short-leg mapping, visible skin motion and saved playback passed.');
}).catch(error => { console.error(error); process.exitCode = 1; });
