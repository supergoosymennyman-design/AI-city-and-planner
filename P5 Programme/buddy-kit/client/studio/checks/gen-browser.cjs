const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');
const { makeGLB } = require('./gen-fixture.cjs');

// The studio's own index.html pulls its display fonts from Google Fonts (a recorded
// `lint-web-allow-cdn` opt-out). Those requests are still ABORTED below, so a check never reaches
// the network; they just must not be reported as a leak, or every check that loads the real app
// would fail on pre-existing app chrome. Any OTHER external origin — a provider, a Space, a CDN,
// telemetry — still fails the check, which is the leak this guard exists to catch.
const ALLOWED_EXTERNAL = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'];

exports.run = async (check) => {
  const { createServer } = await import('vite');
  const server = await createServer({ root: path.resolve(__dirname, '..'), server: { host: '127.0.0.1', port: 0 } });
  let browser, deadline;
  try {
    await server.listen();
    const base = `http://127.0.0.1:${server.httpServer.address().port}`;
    browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, serviceWorkers: 'block' });
    const external = [], errors = [];
    await context.route('**/*', (route) => {
      const url = route.request().url();
      const { origin } = new URL(url);
      if (origin === base || /^(data|blob):/.test(url)) return route.continue();
      if (!ALLOWED_EXTERNAL.includes(origin)) external.push(url);
      return route.abort();
    });
    await context.route(`${base}/__fake.glb`, (route) => route.fulfill({ contentType: 'model/gltf-binary', body: makeGLB() }));
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(String(e)));
    const out = path.resolve(__dirname, '../../../../.superpowers/3d-studio-gen-checks');
    fs.mkdirSync(out, { recursive: true });
    await Promise.race([check({ p: page, base, out, assert }), new Promise((_, reject) => {
      deadline = setTimeout(() => reject(new Error('headed check timed out')), 120000);
    })]);
    assert.deepEqual(errors, [], 'page errors');
    assert.deepEqual(external, [], 'attempted external requests');
  } finally {
    clearTimeout(deadline);
    try { if (browser) await browser.close(); } finally { await server.close(); }
  }
};
