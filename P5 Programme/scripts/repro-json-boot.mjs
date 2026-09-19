// repro-json-boot.mjs — reproduce the "Something went wrong building your city"
// error by feeding a real student JSON through the paste flow and capturing the
// exact console error + stack.
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

const BASE = process.env.BASE || 'http://localhost:8377';
const JSON_FILE = process.argv[2];
const layout = JSON.parse(await readFile(JSON_FILE, 'utf8'));
const jsonText = JSON.stringify(layout);

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.stack || e.message}`));
page.on('response', (r) => { if (r.status() >= 400) logs.push(`[404] ${r.url().replace(BASE, '')}`); });

await page.goto(`${BASE}/city-builder/`, { waitUntil: 'load' });
await page.waitForTimeout(2000);

// Use the paste flow: toggle paste box, fill, submit.
await page.evaluate(() => {
  const wrap = document.getElementById('paste-wrap');
  if (wrap) wrap.style.display = 'block';
});
const box = await page.$('#paste-box');
await box.fill(jsonText);
await page.click('#paste-go');

// Wait for canvas (success) or the boot-error text (failure).
let outcome = 'unknown';
for (let i = 0; i < 40; i++) {
  const hasCanvas = await page.evaluate(() => !!document.querySelector('canvas')).catch(() => false);
  const errText = await page.evaluate(() => (document.body.innerText || '').match(/went wrong|not valid JSON|did not parse/)).catch(() => null);
  if (hasCanvas) { outcome = 'canvas'; break; }
  if (errText) { outcome = 'error:' + errText[0]; break; }
  await page.waitForTimeout(1000);
}
console.log('OUTCOME:', outcome);
console.log('--- captured logs ---');
for (const l of logs.slice(-40)) console.log(l.slice(0, 400));
await browser.close();
