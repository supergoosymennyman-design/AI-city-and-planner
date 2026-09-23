// checks/rig-page-check.cjs
// Headed browser check of Rig mode on the real studio (task 014). Two passes:
//   1. dev/inputs/dino.glb — the big watertight test model: import, grow a three-joint chain by
//      tapping, wait for the bending, pose, reload, export, and assert the numbers that caught
//      every problem in the trials.
//   2. public/samples/dino/model.glb — the studio's OWN shipped sample, which is NOT watertight.
//      That is the model final review F1 broke on, and pass 1 could never have caught it.
// Exit code 1 on any failure. Needs the dev server (npx vite --port 5180 inside
// web/project/3d-studio); pass 1 additionally needs dev/inputs/dino.glb (git-ignored, on this
// machine) and self-skips without it, pass 2 runs on any checkout.
// Usage, from the repo root: node web/project/3d-studio/checks/rig-page-check.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { watchPage, waitForBoot, assertStyled } = require('./page-state.cjs');

const URL_ = process.env.RIG_CHECK_URL || 'http://127.0.0.1:5180/';
const DINO = path.resolve(__dirname, '../dev/inputs/dino.glb');
const SAMPLE = path.resolve(__dirname, '../public/samples/dino/model.glb');
const OUT = path.resolve(__dirname, '../../../../.superpowers/3d-studio-rig-checks/out');
fs.mkdirSync(OUT, { recursive: true });

const failures = [];
function must(name, cond, extra) {
  const ok = !!cond;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra !== undefined ? ' ' + JSON.stringify(extra) : ''}`);
  if (!ok) failures.push(name);
  return ok;
}

function reportErrors(label, errors) {
  must(`${label}: no uncaught page errors`, errors.page.length === 0, errors.page);
  must(`${label}: no console errors`, errors.console.length === 0, errors.console);
  must(`${label}: no failed requests`, errors.http.length === 0, errors.http);
}

/** Wait for the bending to SETTLE, and report the real status if it never does.
 *
 * A refused bind lands on 'idle' (rig-controller.js: "No joint is inside a shape yet"), which is
 * neither 'ready' nor 'error' — and is exactly F1's failure state. Waiting only for those two
 * burned the full five-minute timeout and then died on a Playwright timeout that said nothing
 * about WHY. But 'idle' is also the status a fresh controller STARTS in (rig-controller.js:56), so
 * accepting it before boot finishes can mistake the starting state for refusal. Callers first
 * await waitForBoot's explicit completion signal; elapsed time alone is not a readiness test.
 * A stability window of 3 s then keeps transient idle states from counting as settled. On timeout this
 * reports the live status instead of throwing, so any stuck state — idle, waiting, or running
 * forever — names itself. */
async function waitForBending(page, label, timeout = 120000, idleHoldMs = 3000) {
  await page.evaluate(() => { delete window.__rigCheckIdleSince; });
  try {
    await page.waitForFunction((hold) => {
      const state = window.__rig.status.state;
      if (state === 'ready' || state === 'error') return true;
      if (state !== 'idle') { window.__rigCheckIdleSince = 0; return false; }
      if (!window.__rigCheckIdleSince) { window.__rigCheckIdleSince = Date.now(); return false; }
      return Date.now() - window.__rigCheckIdleSince > hold;
    }, idleHoldMs, { timeout });
  } catch {
    const stuck = await page.evaluate(() => ({ state: window.__rig.status.state, text: window.__rig.status.text }));
    must(`${label}: the bending settled`, false, stuck);
    return stuck;
  }
  return page.evaluate(() => ({ state: window.__rig.status.state, text: window.__rig.status.text, details: window.__rig.status.details }));
}

/** Called on browser.newPage(), which has its own fresh storage context. */
async function freshDocument(page) {
  await page.goto(URL_);
  await waitForBoot(page);
  // The studio has twice rendered completely unstyled while every check passed. The stylesheet is
  // a render-blocking <link>, so when it fails it fails without an error, a warning or a bad
  // status — only the computed style shows it.
  await assertStyled(page);
  await page.evaluate(() => { for (const m of window.__studio.shapes) window.__studio.remove(m); });
}

/** Tap from outside the model toward it, at `station` along the long axis, trying a few heights.
 * Keeps trying dy offsets until one lands INSIDE the model (not just anywhere on it) — a joint on
 * the skin (`inside: false`) is a real 'add' but would fail the caller's "inside" assertion, so
 * stopping at the first 'add' risked a spurious failure when a better dy was one step away.
 * `tapRay` is STATEFUL: any landed tap commits a real joint AND becomes the new selection (so the
 * NEXT chained joint parents onto it) — so a non-inside landing must be REMOVED, not just ignored,
 * before retrying, with the pre-existing selection restored, or the retry (and the next station's
 * first attempt) would chain onto the stray instead of the intended parent. Falls back to the last
 * attempt (for diagnostics) when none land inside; that last stray is cleaned up like every other. */
async function tapStation(page, box, station) {
  const size = [box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]];
  const long = size[2] >= size[0] ? 2 : 0; // the body runs along its longest horizontal axis
  const across = long === 2 ? 0 : 2;
  const centre = [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2];
  const beforeSelected = await page.evaluate(() => window.__rig.selectedId);
  let last = null;
  for (const dy of [0, 0.1, -0.1, 0.2, -0.2, 0.3]) {
    const origin = [0, 0, 0];
    const direction = [0, 0, 0];
    origin[long] = centre[long] + station * size[long];
    origin[1] = centre[1] + dy * size[1];
    origin[across] = box.max[across] + 1;
    direction[across] = -1;
    const r = await page.evaluate(([o, d]) => window.__rig.tapRay(o, d), [origin, direction]);
    if (r.kind === 'add' && r.inside === true) return r;
    if (r.kind === 'add') {
      // A real joint landed but missed 'inside': remove the stray, then restore whatever was
      // selected before this tapStation call so the next attempt chains onto the right parent.
      await page.evaluate((sel) => { window.__rig.removeSelected(); window.__rig.selectJoint(sel); }, beforeSelected);
    }
    last = r;
  }
  return last;
}

/** Pass 2 — the studio's OWN shipped sample.
 *
 * This pass exists because pass 1 could never have caught final review F1. `dev/inputs/dino.glb`
 * is watertight (its edge histogram is [[2, 305250]]: every edge shared by exactly two triangles),
 * and F1 was precisely that `isInside` vetoed every joint on a model that is NOT watertight — so
 * the one model the studio ships could never be rigged at all, while a check running only on the
 * closed model stayed green. A regression check whose fixture cannot exhibit the bug is not a
 * regression check.
 *
 * Deliberately narrow: import the sample, tap a chain, and prove the bending reaches 'ready' with
 * nothing reported outside. Pass 1 already covers pose, persistence and export. */
async function samplePass(browser) {
  if (!fs.existsSync(SAMPLE)) {
    must('the shipped sample is present', false, { SAMPLE });
    return;
  }
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = watchPage(page, URL_);
  try {
    await freshDocument(page);
    await page.setInputFiles('input[type=file][accept=".glb,.gltf"]', SAMPLE);
    await page.waitForFunction(() => window.__studio.shapes.length > 0, null, { timeout: 60000 });
    const model = await page.evaluate(() => ({
      shapes: window.__studio.shapes.length,
      points: window.__studio.shapes.reduce((n, m) => n + m.geometry.attributes.position.count, 0),
    }));
    must('sample: the shipped sample imports as a real model', model.points > 1000, model);

    // The premise of this pass. If the shipped sample ever becomes watertight this check must
    // fail, because the pass would silently stop covering the open-mesh case it exists for.
    // Both seams below return null when nothing riggable imported — read them defensively, so
    // that case is reported as a failure rather than thrown as a TypeError from this file.
    await page.evaluate(() => window.__studio.setMode('rig'));
    const isClosed = await page.evaluate(() => {
      const cache = window.__rig.surface();
      return cache.surface ? cache.surface.isClosed : null;
    });
    must('sample: the shipped sample is NOT watertight — the case F1 broke on', isClosed === false, { isClosed });

    const box = await page.evaluate(() => window.__rig.modelBox());
    if (!must('sample: the imported sample has a riggable body', !!box, { box })) return;
    const taps = [];
    for (const station of [-0.25, 0, 0.25]) taps.push(await tapStation(page, box, station));
    const tapsOk = must('sample: three taps each placed a joint inside an open mesh',
      taps.every((t) => t && t.kind === 'add' && t.inside === true), taps);
    if (tapsOk) {
      const settled = await waitForBending(page, 'sample');
      must('sample: an open mesh can be rigged — the bending reached ready', settled.state === 'ready', settled);
      must('sample: the open mesh is skinned', await page.evaluate(() => window.__studio.shapes.some((m) => m.isSkinnedMesh === true)));
      const warnings = await page.evaluate(() => window.__rig.status.warnings);
      must('sample: no joint is reported outside the open mesh', warnings.length === 0, warnings);
    }
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, 'rig-sample.png') });
    reportErrors('sample', errors);
  } finally {
    await page.close();
  }
}

(async () => {
  const browser = await chromium.launch({ headless: false });
  try {
    // dev/inputs/dino.glb is git-ignored, so it exists only on the machine it was put on. Pass 2
    // runs on any checkout, so a missing pass-1 model skips that pass rather than killing the run.
    if (!fs.existsSync(DINO)) {
      console.log(`SKIP pass 1 — missing ${DINO} (git-ignored). Running pass 2 only.`);
      await samplePass(browser);
      console.log(JSON.stringify({ ok: failures.length === 0, failures, skipped: 'dev dino pass' }, null, 1));
      return;
    }
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = watchPage(page, URL_);
    const shot = (name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

    await freshDocument(page);

    // Import the dinosaur through the Build toolbar's file input.
    await page.setInputFiles('input[type=file][accept=".glb,.gltf"]', DINO);
    await page.waitForFunction(() => window.__studio.shapes.length === 1 && window.__studio.shapes[0].geometry.attributes.position.count > 100000, null, { timeout: 60000 });
    const points = await page.evaluate(() => window.__studio.shapes[0].geometry.attributes.position.count);
    must('the dinosaur is in the document as one plain mesh', points === 101744, { points });

    // Rig mode: three taps from the side at three stations along the body.
    await page.evaluate(() => window.__studio.setMode('rig'));
    const box = await page.evaluate(() => window.__rig.modelBox());
    const taps = [];
    for (const station of [-0.25, 0, 0.25]) taps.push(await tapStation(page, box, station));
    const tapsOk = must('three taps each placed a joint inside the model', taps.every((t) => t && t.kind === 'add' && t.inside === true), taps);
    if (!tapsOk) {
      // Fail fast: with no reliable chain, `window.__rig.status.state` will never reach 'ready' or
      // 'error', so the wait below would otherwise burn its full 5-minute timeout for nothing.
      console.log(JSON.stringify({ ok: false, failures, taps }, null, 1));
      return;
    }
    const graph = await page.evaluate(() => ({ size: window.__studio.rig.graph.size, links: window.__studio.rig.linkBones.length, bones: window.__studio.rig.bones.size }));
    must('the taps grew one chain of three joints', graph.size === 3 && graph.links === 2 && graph.bones === 3, graph);

    // The bending runs itself: wait for the worker.
    await waitForBending(page, 'dev dino');
    const status = await page.evaluate(() => window.__rig.status);
    must('the bending reached ready', status.state === 'ready', { state: status.state, text: status.text });
    const st = status.stats || {};
    must('no point fell back to the nearest bone', st.fallbackVertices === 0, { fallbackVertices: st.fallbackVertices });
    must('every bone converged', st.unconvergedBones === 0, { unconvergedBones: st.unconvergedBones, solver: st.solver });
    must('the solve ran on a coarse copy under the budget', st.reduced === true && st.coarsePoints <= 20000 && st.finePoints === 101744, { coarsePoints: st.coarsePoints, totalMs: st.totalMs });
    must('no joint is outside the model', status.warnings.length === 0, status.warnings);
    must('the model is skinned', await page.evaluate(() => window.__studio.shapes[0].isSkinnedMesh === true && window.__studio.rig.skinBones.length === 2));

    // Pose mode: turn the last joint's bone (the link from the middle joint) as the gizmo would, then Rest.
    await page.evaluate(() => window.__studio.setMode('pose'));
    const restProbe = await page.evaluate(() => window.__rig.probeDisplacement());
    const turned = await page.evaluate(() => {
      const ids = window.__studio.rig.graph.joints.map((j) => j.id);
      const bone = window.__studio.rig.bones.get(ids[2]);
      window.__studio.select(bone);
      bone.quaternion.set(0, Math.sin(Math.PI / 12), 0, Math.cos(Math.PI / 12)); // 30° about y
      window.__studio.rig.root.updateMatrixWorld(true);
      window.__studio.emit('changed');
      return ids[2];
    });
    const bentProbe = await page.evaluate(() => window.__rig.probeDisplacement());
    must('at rest the skin sits on the geometry', restProbe < 1e-4, { restProbe });
    must('a turned bone moves the skin', bentProbe > 0.02, { bentProbe });
    await page.waitForTimeout(300);
    await shot('rig-posed');
    await page.click('#actions >> button:has-text("Rest")');
    const afterRest = await page.evaluate(() => ({ probe: window.__rig.probeDisplacement(), pose: window.__studio.rig.graph.pose.size }));
    must('Rest straightens the model and forgets the pose', afterRest.probe < 1e-4 && afterRest.pose === 0, afterRest);

    // Persistence: pose again, let the auto-save run, reload — skeleton, pose and bending come back.
    await page.evaluate((id) => {
      const bone = window.__studio.rig.bones.get(id);
      bone.quaternion.set(0, Math.sin(Math.PI / 12), 0, Math.cos(Math.PI / 12));
      window.__studio.rig.root.updateMatrixWorld(true);
      window.__studio.emit('changed');
    }, turned);
    await page.waitForTimeout(1500); // the champion auto-save is debounced 400 ms and writes IndexedDB
    await page.reload();
    await waitForBoot(page);
    await assertStyled(page); // a reload is its own delivery path; it has broken on its own before
    await waitForBending(page, 'dev dino after reload');
    const back = await page.evaluate(() => ({
      state: window.__rig.status.state,
      joints: window.__studio.rig ? window.__studio.rig.graph.size : 0,
      pose: window.__studio.rig ? window.__studio.rig.graph.pose.size : 0,
      skinned: window.__studio.shapes[0].isSkinnedMesh === true,
      probe: window.__rig.probeDisplacement(),
    }));
    must('after a reload the skeleton, the pose and the bending are back', back.state === 'ready' && back.joints === 3 && back.pose === 1 && back.skinned && back.probe > 0.02, back);
    await shot('rig-reloaded');

    // Export from Pose mode: a GLB with the skeleton and the skin, no balls.
    await page.evaluate(() => window.__studio.setMode('pose'));
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60000 }),
      page.click('#actions >> button:has-text("Export")'),
    ]);
    const glbPath = path.join(OUT, 'my-champion.glb');
    await download.saveAs(glbPath);
    const buf = fs.readFileSync(glbPath);
    const gltf = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
    const skins = gltf.skins || [];
    const nodes = gltf.nodes || [];
    must('the export carries one skin with three joints', skins.length === 1 && skins[0].joints.length === 3 && skins[0].joints.every((j) => nodes[j] && /^j\d+$/.test(nodes[j].name)), { skins: skins.length });
    must('the export carries the joint graph, so it can come back exactly', nodes.some((n) => n.extras && n.extras.rig && n.extras.rig.joints.length === 3));
    must('the export carries no joint balls or links', !nodes.some((n) => n.extras && (n.extras.isJointBall || n.extras.isRigLink)));
    must('the export is a real model, not an empty file', buf.length > 1000000, { bytes: buf.length });
    must('the balls came back after the export', await page.evaluate(() => {
      // Not a literal 'j1': tapStation's retries can burn an id on an off-model stray before the
      // first real landing (fix round 1), so the first REAL joint is whichever id sits first in the
      // current graph — same pattern as `ids[2]` above, not a name assumed in advance.
      const ids = window.__studio.rig.graph.joints.map((j) => j.id);
      return window.__studio.rig.balls.get(ids[0]).parent === window.__studio.rig.bones.get(ids[0]);
    }));

    await page.waitForTimeout(500);
    await shot('rig-chain');
    reportErrors('dev dino', errors);
    await page.close();

    // Pass 2: the shipped sample, which is NOT watertight (see samplePass).
    await samplePass(browser);

    console.log(JSON.stringify({ ok: failures.length === 0, failures, stats: st, shots: [path.join(OUT, 'rig-chain.png'), path.join(OUT, 'rig-posed.png'), path.join(OUT, 'rig-reloaded.png'), path.join(OUT, 'rig-sample.png'), path.join(OUT, 'my-champion.glb')] }, null, 1));
  } catch (err) {
    failures.push('exception');
    console.error('rig-page-check failed:', err && err.stack ? err.stack : err);
  } finally {
    await browser.close();
    // exitCode, not exit(): process.exit() can truncate the JSON summary above when stdout is a
    // pipe on Windows, which is how this check is normally read. Setting the code lets node drain
    // stdout and leave on its own, and it still applies to the early `return` on a tap failure.
    process.exitCode = failures.length ? 1 : 0;
  }
})();
