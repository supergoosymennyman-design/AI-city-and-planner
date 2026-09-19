import { webkit } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:8377';
const JSON_FILE = process.argv[2];
const browser = await webkit.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.stack || e.message}`));
page.on('requestfailed', (r) => logs.push(`[reqfail] ${r.url().replace(BASE, '')} :: ${r.failure()?.errorText}`));
await page.goto(`${BASE}/city-builder/`, { waitUntil: 'load' });
await page.waitForTimeout(2000);
await page.setInputFiles('#file-input', JSON_FILE);
let outcome = 'unknown';
for (let i = 0; i < 45; i++) {
  const hasCanvas = await page.evaluate(() => !!document.querySelector('canvas')).catch(() => false);
  const errText = await page.evaluate(() => (document.body.innerText || '').match(/went wrong|not valid JSON|did not parse/)).catch(() => null);
  if (hasCanvas) { outcome = 'canvas'; break; }
  if (errText) { outcome = 'error:' + errText[0]; break; }
  await page.waitForTimeout(1000);
}
console.log('OUTCOME:', outcome);
await page.waitForTimeout(10000);
for (const l of logs.slice(-50)) console.log(l.slice(0, 350));
await browser.close();
