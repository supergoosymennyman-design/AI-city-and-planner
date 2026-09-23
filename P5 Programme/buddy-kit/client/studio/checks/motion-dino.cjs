const fs = require('node:fs');
const path = require('node:path');
const { run } = require('./gen-browser.cjs');
const { waitForBoot } = require('./page-state.cjs');
run(async ({ p, base, out, assert }) => {
  await p.goto(base); await waitForBoot(p);
  await p.evaluate(() => { const s = window.__studio; while (s.shapes.length) s.remove(s.shapes[0]); });
  await p.setInputFiles('input[type=file][accept=".glb,.gltf"]', path.resolve(__dirname, '../dev/auto-rig/dino-full-detail-rigged.glb'));
  await p.waitForFunction(() => window.__rig.status.state === 'ready', null, { timeout: 90000 });
  const report = await p.evaluate(async () => {
    const { detectLegs, detectMotionRoles, motionClips } = await import('/src/rig/motion.js');
    const THREE = await import('/node_modules/.vite/deps/three.js');
    const { clone } = await import('/node_modules/three/examples/jsm/utils/SkeletonUtils.js');
    const s = window.__studio, r = s.rig;
    s.setMode('pose'); s.select(null);
    const legs = detectLegs(r.graph, (id) => r.worldOf(id)), roles = detectMotionRoles(r);
    const clips = motionClips(r, { legs, roles });
    const copy = clone(s.group), mixer = new THREE.AnimationMixer(copy);
    const knees = legs.map((id) => ({ hip: r.graph.get(id).parent, knee: id, ankle: r.graph.children(id).sort((a, b) => r.worldOf(a)[1] - r.worldOf(b)[1])[0], min: Infinity, max: 0, minSide: Infinity }));
    for (const clip of clips) {
      mixer.clipAction(clip).play();
      for (let frame = 0; frame <= 128; frame++) {
        mixer.setTime(clip.duration * frame / 128); copy.updateMatrixWorld(true);
        for (const k of knees) {
          const thigh = copy.getObjectByName(k.knee), shin = copy.getObjectByName(k.ankle);
          const local = (v) => thigh.parent.worldToLocal(v);
          const hip = local(thigh.getWorldPosition(new THREE.Vector3())), knee = local(shin.getWorldPosition(new THREE.Vector3()));
          const upperRest = new THREE.Vector3(...r.worldOf(k.knee)).sub(new THREE.Vector3(...r.worldOf(k.hip)));
          const lowerRest = new THREE.Vector3(...r.worldOf(k.ankle)).sub(new THREE.Vector3(...r.worldOf(k.knee)));
          const ankle = local(shin.localToWorld(lowerRest.clone()));
          const angle = THREE.MathUtils.radToDeg(knee.clone().sub(hip).angleTo(ankle.clone().sub(knee)));
          const restAxis = upperRest.clone().add(lowerRest).normalize(), pole = upperRest.clone().addScaledVector(restAxis, -upperRest.dot(restAxis)).normalize();
          const axis = ankle.clone().sub(hip).normalize(), offset = knee.clone().sub(hip);
          k.min = Math.min(k.min, angle); k.max = Math.max(k.max, angle); k.minSide = Math.min(k.minSide, offset.addScaledVector(axis, -offset.dot(axis)).dot(pole));
        }
      }
      mixer.stopAllAction();
    }
    return { legs, roles, knees, contactErrors: clips.map((c) => ({ name: c.name, error: c.contactError })), joints: r.graph.joints.map((j) => ({ id: j.id, parent: j.parent, position: r.worldOf(j.id) })), vertices: s.shapes.reduce((sum, m) => sum + m.geometry.attributes.position.count, 0) };
  });
  await p.click('#reset-view');
  await p.getByRole('button', { name: 'Walk / Jump', exact: true }).click();
  await p.locator('.motion-dialog summary').click();
  await p.getByRole('button', { name: `Highlight ${report.legs[0]}`, exact: true }).click();
  await p.screenshot({ path: path.join(out, 'motion-dino-mapping.png') });
  await p.getByLabel('Motion', { exact: true }).selectOption('Walk');
  await p.getByRole('button', { name: 'Play', exact: true }).click();
  await p.waitForTimeout(1500); await p.screenshot({ path: path.join(out, 'motion-dino-walk.png') });
  await p.getByRole('button', { name: 'Stop', exact: true }).click();
  const pending = p.waitForEvent('download');
  await p.getByRole('button', { name: 'Export Walk + Jump', exact: true }).click();
  const download = await pending; await download.saveAs(path.join(out, 'motion-dino.glb'));
  const bytes = fs.readFileSync(path.join(out, 'motion-dino.glb'));
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  assert.deepEqual(json.animations.map((a) => a.name), ['Walk', 'Jump']);
  assert.equal(Object.values(report.roles).filter((r) => r === 'head').length, 1, 'dinosaur has a head role');
  assert.equal(Object.values(report.roles).filter((r) => r === 'tail').length, 1, 'dinosaur has a tail role');
  assert.ok(!Object.values(report.roles).includes('arm'), 'dinosaur spine is not an arm');
  assert.ok(report.knees.every((k) => k.min >= 7.5 && k.max <= 120.5 && k.minSide > 0), 'every dinosaur knee stays within its bend limits and on its rest-pose side');
  assert.ok(report.contactErrors.find((c) => c.name === 'Walk').error < .005, 'dinosaur planted foot targets stay within 0.005 document units');
  fs.writeFileSync(path.join(out, 'motion-dino-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}).catch((error) => { console.error(error); process.exitCode = 1; });
