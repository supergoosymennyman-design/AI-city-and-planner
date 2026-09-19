#!/usr/bin/env node
/**
 * verify-city-builder.mjs — headless regression harness for the 3D city builder.
 *
 * Boots the gateway-served city-builder in headless Chrome (SwiftShader as a
 * tablet-GPU proxy), loads a layout, and asserts:
 *   1. boot COMPLETES (loading overlay gets 'done') — catches hangs/loops
 *   2. the scene has the expected entities (champion ring, pedestrians)
 *   3. a frame-budget probe stays near 60fps (avg frame < 20ms)
 *
 * Usage (from P5 Programme/buddy-kit):
 *   node scripts/verify-city-builder.mjs            # tiny city
 *   node scripts/verify-city-builder.mjs full        # full student city
 *   CHROME=/path/to/chrome node scripts/verify-city-builder.mjs
 *
 * Requires the gateway to be running (npm start) — it serves the client at
 * http://localhost:8787.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.BASE || 'http://localhost:8787';
const PORT = Number(process.env.CDP_PORT || 9440 + Math.floor(Math.random() * 500));
const PROFILE = process.env.PROFILE || `/tmp/chrome-verify-${process.pid}`;
const WAIT_MS = Number(process.env.WAIT_MS || 20000);
const MAX_FRAME_MS = Number(process.env.MAX_FRAME_MS || 20);   // ~50fps budget
const LAYOUT_NAME = process.argv[2] || 'tiny';

const TINY = {
  version: 2, scaleMeters: 2000,
  roads: [
    { points: [[200, 1000], [1800, 1000]], width: 14, class: 'primary' },
    { points: [[1000, 200], [1000, 1800]], width: 14, class: 'primary' },
  ],
  parks: [{ cx: 1500, cz: 1500, radius: 80 }],
  buildings: [{ type: 'city_central', pos: [1000, 1000], footprint: [28, 28], height: 100 }],
};

const FULL = {
  version: 2, scaleMeters: 2000,
  roads: [
    { points: [[200, 1000], [1800, 1000]], width: 14, class: 'primary' },
    { points: [[1000, 200], [1000, 1800]], width: 14, class: 'primary' },
    { points: [[300, 300], [1700, 300]], width: 10, class: 'secondary' },
    { points: [[300, 1700], [1700, 1700]], width: 10, class: 'secondary' },
  ],
  parks: [{ cx: 500, cz: 500, radius: 90 }, { cx: 1500, cz: 1500, radius: 70 }],
  buildings: [
    { type: 'city_central', pos: [1000, 1000], footprint: [28, 28], height: 100 },
    { type: 'office', pos: [600, 1100], footprint: [20, 20], height: 40 },
    { type: 'office', pos: [1400, 900], footprint: [20, 20], height: 45 },
    { type: 'housing', pos: [700, 700], footprint: [22, 22], height: 18 },
    { type: 'housing', pos: [1300, 1300], footprint: [22, 22], height: 16 },
    { type: 'stadium', pos: [500, 1400], footprint: [36, 30], height: 30 },
    { type: 'fire', pos: [1500, 600], footprint: [22, 20], height: 16 },
    { type: 'police', pos: [400, 800], footprint: [22, 20], height: 18 },
    { type: 'shop', pos: [900, 1500], footprint: [30, 24], height: 22 },
    { type: 'school', pos: [1100, 500], footprint: [26, 22], height: 14 },
  ],
};

const layout = LAYOUT_NAME === 'full' ? FULL : TINY;

function httpGet(url) {
  return new Promise((res, rej) => {
    http.get(url, (r) => {
      let d = '';
      r.on('data', (c) => (d += c));
      r.on('end', () => res(d));
    }).on('error', rej);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[verify]', ...a);

let chrome;
const watchdog = setTimeout(() => {
  log('WATCHDOG: hung — killing chrome');
  try { chrome.kill(); } catch (e) {}
  process.exit(3);
}, 120000);
watchdog.unref?.();

async function main() {
  log(`case=${LAYOUT_NAME} chrome=${CHROME.split('/').pop()} port=${PORT}`);
  chrome = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--use-angle=metal', '--enable-unsafe-swiftshader',
    '--enable-webgl', '--ignore-gpu-blocklist',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore'] });

  await sleep(9000);
  let target = null;
  for (let i = 0; i < 40 && !target; i++) {
    try {
      const res = await httpGet(`http://127.0.0.1:${PORT}/json`);
      target = JSON.parse(res).find((t) => t.type === 'page' && t.url !== 'chrome://newtab/');
    } catch (e) {}
    if (!target) await sleep(500);
  }
  if (!target) { log('FAIL: no CDP target (chrome failed to start)'); process.exit(1); }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = {};
  const errors = [];
  const send = (method, params = {}) => new Promise((resolve) => {
    const mid = ++id;
    pending[mid] = resolve;
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending[msg.id]) { pending[msg.id](msg.result); delete pending[msg.id]; }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      errors.push('EXC: ' + (d.exception?.description || d.text || '') + ' @ ' + (d.url || '') + ':' + (d.lineNumber ?? ''));
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      errors.push('CONSOLE: ' + msg.params.args.map((a) => a.value || a.description || '').join(' '));
    }
  };
  await new Promise((r) => (ws.onopen = r));
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: `${BASE}/city-builder/` });
  await sleep(4000);
  await send('Runtime.evaluate', {
    expression: `localStorage.setItem('p5_city_planner_layout_v1', ${JSON.stringify(JSON.stringify(layout))}); 'ok'`,
  });
  await send('Page.reload');
  await sleep(4000);
  await send('Runtime.evaluate', {
    expression: `document.getElementById('entry-local')?.click(); 'ok'`,
  });
  await sleep(WAIT_MS);

  const r = await send('Runtime.evaluate', {
    expression: `
      (async () => {
        const scene = window.__scene;
        let instanced = 0, rings = 0, meshes = 0;
        scene && scene.traverse((o) => {
          if (o.isInstancedMesh) instanced++;
          if (o.isMesh) meshes++;
          if (o.isMesh && o.geometry && o.geometry.type === 'RingGeometry') rings++;
        });
        const loadingDone = document.getElementById('loading')?.classList.contains('done') || false;
        const peds = window.__city?.pedestrians?.getCount?.() ?? -1;
        // Frame-budget probe: 90 rAF samples
        const deltas = [];
        let last = performance.now(), frames = 0;
        await new Promise((resolve) => {
          function tick(now) {
            deltas.push(now - last); last = now;
            frames++;
            if (frames < 90) requestAnimationFrame(tick);
            else resolve();
          }
          requestAnimationFrame(tick);
        });
        deltas.sort((a, b) => a - b);
        const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
        return JSON.stringify({
          loadingDone, peds, instancedMeshes: instanced, totalMeshes: meshes,
          championRingFound: rings > 0,
          avgFrameMs: Math.round(avg * 10) / 10,
          p95: Math.round(deltas[Math.floor(deltas.length * 0.95)] * 10) / 10,
        });
      })()
    `,
    awaitPromise: true,
    returnByValue: true,
  });

  const state = JSON.parse(r.result?.value || '{}');
  const ok =
    state.loadingDone === true &&
    state.peds >= 0 &&
    state.championRingFound === true &&
    state.avgFrameMs <= MAX_FRAME_MS &&
    errors.length === 0;

  log('state:', JSON.stringify(state));
  if (errors.length) log('errors:', errors.slice(0, 6).join(' || '));
  log(ok ? 'PASS' : 'FAIL');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  log('FATAL:', e.message);
  try { chrome.kill(); } catch (err) {}
  process.exit(2);
});
