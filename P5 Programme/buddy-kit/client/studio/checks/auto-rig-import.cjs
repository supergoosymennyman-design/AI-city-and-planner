// Import a REAL provider result through the studio's file input and inspect its bending.
// From studio: node checks/auto-rig-import.cjs dev/auto-rig/faisal/three-leg-control/rigged.glb
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const { waitForBoot, watchPage } = require('./page-state.cjs');

(async () => {
  if (!process.argv[2]) throw new Error('Pass a provider-produced rigged GLB path.');
  const input = path.resolve(process.argv[2]);
  const out = path.join(path.dirname(input), 'import-check');
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const report = { input: path.basename(input) };
  const errors = watchPage(page, 'http://127.0.0.1:5180/');
  try {
    await page.goto('http://127.0.0.1:5180/');
    await waitForBoot(page);
    await page.evaluate(() => {
      for (const mesh of [...window.__studio.shapes]) window.__studio.remove(mesh);
      window.__studio.setMode('build');
    });
    await page.setInputFiles('input[type=file][accept=".glb,.gltf"]', input);
    await page.waitForFunction(() => window.__studio.rig?.graph.size > 0);
    await page.evaluate(() => window.__studio.setMode('rig'));
    await page.waitForFunction(() => ['ready', 'error'].includes(window.__rig.status.state), null, { timeout: 120000 });
    report.import = await page.evaluate(() => ({
      joints: window.__studio.rig.graph.size,
      meshes: window.__studio.shapes.length,
      skinned: window.__studio.shapes.filter((m) => m.isSkinnedMesh).length,
      status: window.__rig.status,
    }));
    await page.screenshot({ path: path.join(out, 'rest.png') });
    if (report.import.status.state !== 'ready' || !report.import.skinned) throw new Error('Studio import did not produce a ready skinned model.');
    report.pose = await page.evaluate(async () => {
      const THREE = await import('/node_modules/.vite/deps/three.js');
      const s = window.__studio;
      const rig = s.rig;
      s.setMode('pose');
      const samples = () => {
        rig.root.updateMatrixWorld(true);
        rig.skeleton.update();
        return s.shapes.filter((m) => m.isSkinnedMesh).flatMap((m) => {
          const p = m.geometry.attributes.position;
          const points = [];
          for (let i = 0; i < p.count; i += Math.max(1, Math.floor(p.count / 1000))) {
            points.push(m.applyBoneTransform(i, new THREE.Vector3().fromBufferAttribute(p, i)).applyMatrix4(m.matrixWorld).toArray());
          }
          return points;
        });
      };
      rig.rest();
      const before = samples();
      let best = { id: null, displacement: 0 };
      for (const j of rig.graph.joints.filter((j) => j.parent !== null)) {
        rig.rest();
        rig.bones.get(j.id).rotation.z = 0.35;
        const after = samples();
        if (!after.flat().every(Number.isFinite)) throw new Error('Pose produced non-finite vertices.');
        const displacement = Math.max(...after.map((p, i) => Math.hypot(...p.map((v, k) => v - before[i][k]))));
        if (displacement > best.displacement) best = { id: j.id, displacement };
      }
      rig.rest();
      if (best.id) {
        rig.bones.get(best.id).rotation.z = 0.35;
        s.select(rig.bones.get(best.id));
      }
      rig.readPose();
      s.emit('changed');
      return best;
    });
    await page.screenshot({ path: path.join(out, 'posed.png') });
    if (!(report.pose.displacement > 0.001)) throw new Error('No non-root joint moved the imported surface.');
    report.errors = errors;
    if (errors.page.length || errors.console.length || errors.http.length) throw new Error('Browser reported errors.');
    report.passed = true;
  } catch (error) {
    report.error = error.message;
    report.passed = false;
    process.exitCode = 1;
  } finally {
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    await browser.close();
  }
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
