// Record the actual exported clips, not a separately scripted illustration.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const dino = process.argv.includes('--dino');
(async () => {
  const { createServer } = await import('vite');
  const out = path.resolve(__dirname, '../../../../.superpowers/3d-studio-gen-checks');
  const server = await createServer({ root: path.resolve(__dirname, '..'), server: { host: '127.0.0.1', port: 0 } });
  let browser;
  try {
    await server.listen();
    const base = `http://127.0.0.1:${server.httpServer.address().port}`;
    browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({ viewport: { width: 1024, height: 720 }, recordVideo: { dir: out, size: { width: 1024, height: 720 } } });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/__motion-demo', (route) => route.fulfill({ contentType: 'text/html', body: '<html><head><meta charset="UTF-8"></head><body style="margin:0;background:#0b1625;color:#ecf6ff;font:20px system-ui"><div style="position:absolute;top:28px;width:100%;text-align:center"><b id="title">Same motion system, different bodies</b><div style="font-size:15px;margin-top:12px">Snowman: Waddle &nbsp; · &nbsp; Three-legged model: Step</div></div><div style="position:absolute;bottom:28px;width:100%;text-align:center;font-size:14px">Procedural prototype · playback of exported GLB animations</div></body></html>' }));
    await page.route('**/__demo-model/*', (route) => route.fulfill({ contentType: 'model/gltf-binary', body: fs.readFileSync(path.join(out, dino ? 'motion-dino.glb' : route.request().url().endsWith('snowman') ? 'motion-snowman.glb' : 'motion-tripod.glb')) }));
    await page.goto(`${base}/__motion-demo`);
    await page.evaluate(async (dino) => {
      const THREE = await import('/node_modules/.vite/deps/three.js');
      const { GLTFLoader } = await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
      const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(1024, 720); renderer.setPixelRatio(1); document.body.prepend(renderer.domElement);
      const scene = new THREE.Scene(); scene.background = new THREE.Color('#0b1625');
      const camera = new THREE.PerspectiveCamera(36, 1024 / 720, .01, 100); camera.position.set(2.6, 2.7, 8.5); camera.lookAt(0, 1, 0);
      scene.add(new THREE.HemisphereLight('#e0f4ff', '#414b66', 2.2));
      const key = new THREE.DirectionalLight('#fff0d9', 3); key.position.set(-3, 6, 4); scene.add(key);
      const grid = new THREE.GridHelper(12, 24, '#32637a', '#173749'); scene.add(grid);
      const entries = [];
      for (const [name, x] of (dino ? [['dino', 0]] : [['snowman', -1.25], ['tripod', 1.25]])) {
        const gltf = await new GLTFLoader().loadAsync(`/__demo-model/${name}`);
        const wrapper = new THREE.Group(); wrapper.position.x = x; wrapper.add(gltf.scene); scene.add(wrapper);
        if (dino) { wrapper.updateMatrixWorld(true); const bounds = new THREE.Box3().setFromObject(wrapper); wrapper.position.y -= bounds.min.y; }
        entries.push({ mixer: new THREE.AnimationMixer(gltf.scene), clips: gltf.animations });
      }
      window.playDemo = (name) => { for (const entry of entries) { entry.mixer.stopAllAction(); entry.mixer.clipAction(entry.clips.find((c) => c.name === name)).play(); } document.getElementById('title').textContent = name === 'Walk' ? 'Walk: weight shift, body rocking, head and arm follow-through' : 'Jump: wind-up, takeoff, landing and recovery'; };
      if (dino) { document.querySelector('#title + div').textContent = 'Original dinosaur - automatically detected body roles'; camera.position.set(2.3, 1.8, 3.5); camera.lookAt(0, .85, 0); }
      window.playDemo('Walk');
      let last = null;
      renderer.setAnimationLoop((now) => { if (last !== null) for (const entry of entries) entry.mixer.update(Math.min(.05, (now - last) / 1000)); last = now; renderer.render(scene, camera); });
    }, dino);
    await page.waitForTimeout(4500);
    await page.screenshot({ path: path.join(out, dino ? 'motion-dino-demo-walk.png' : 'motion-demo-walk.png') });
    await page.evaluate(() => window.playDemo('Jump'));
    await page.waitForTimeout(4500);
    await page.screenshot({ path: path.join(out, dino ? 'motion-dino-demo-jump.png' : 'motion-demo-jump.png') });
    const video = page.video(); await context.close();
    await video.saveAs(path.join(out, dino ? 'motion-dino-demo.webm' : 'motion-demo.webm'));
    if (errors.length) throw new Error(errors.join('\n'));
    console.log(path.join(out, dino ? 'motion-dino-demo.webm' : 'motion-demo.webm'));
  } finally { await browser?.close(); await server.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
