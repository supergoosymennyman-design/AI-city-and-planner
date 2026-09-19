#!/usr/bin/env node
/**
 * Reproducibly render the UI-free Woven Delta city image used by Passiona.ai.
 * Requires the repo's Playwright dependency. Output is deliberately the existing
 * product path so the gallery's public interface and translations stay unchanged.
 */
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const layoutPath = resolve(here, '../docs/showcases/woven-delta-ai-city.json');
const output = resolve(root, 'Passiona.ai/public/product/ai-city.jpg');
const port = Number(process.env.CITY_SHOWCASE_PORT || 8492);
const layout = JSON.parse(await readFile(layoutPath, 'utf8'));
const server = spawn(process.execPath, [resolve(root, 'P5 Programme/tests/e2e/static-server.mjs'), String(port)], { stdio: 'inherit' });
const stop = () => { if (!server.killed) server.kill('SIGTERM'); };
process.on('exit', stop); process.on('SIGINT', () => { stop(); process.exit(130); });

try {
  await new Promise((resolveReady, reject) => {
    const timer = setTimeout(() => reject(new Error('City server did not start')), 15000);
    server.once('error', reject);
    server.stdout?.once?.('data', () => { clearTimeout(timer); resolveReady(); });
    // inherited stdio has no stream: the server is generally ready within this short interval.
    setTimeout(() => { clearTimeout(timer); resolveReady(); }, 700);
  });
  const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('requestfailed', request => { if (/\.(?:glb|gltf)(?:\?|$)/.test(request.url())) errors.push(`asset failed: ${request.url()}`); });
  await page.addInitScript(value => localStorage.setItem('p5_city_planner_layout_v1', JSON.stringify(value)), layout);
  await page.goto(`http://localhost:${port}/city-builder/`, { waitUntil: 'networkidle' });
  await page.locator('#entry-local').click();
  await page.waitForFunction(() => window.__city?.timeOfDay?.settled && document.querySelector('#loading.done'));
  await page.evaluate(() => {
    window.__city.setTimeOfDay('sunset');
    // An oblique, distant camera shows the woven road geometry, downtown and civic pockets.
    window.__camOverride = { pos: [1480, 410, 1570], target: [1010, 8, 980] };
    const style = document.createElement('style');
    style.textContent = 'body > :not(#stage){display:none!important} #stage > :not(canvas){display:none!important} canvas{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important}';
    document.head.append(style);
  });
  await page.waitForFunction(() => window.__city.timeOfDay.id === 'sunset' && window.__city.timeOfDay.settled);
  await page.waitForTimeout(5000);
  if (errors.length) throw new Error(`Capture had errors:\n${errors.join('\n')}`);
  await page.screenshot({ path: output, type: 'jpeg', quality: 92 });
  await browser.close();
  console.log(`Wrote ${output}`);
} finally { stop(); }
