// city-smoke.mjs — headless smoke test for city-builder: boots the app (clicks
// "Start with an empty sample" if a start screen appears), waits for the canvas,
// and flags GLB load failures / unknown library ids / 404s.
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:8377';
const URL = process.env.URL || '/city-builder/';
const WAIT = Number(process.env.WAIT || 30000);

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const warnings = [];
page.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'error' || /fail|warn|unknown library|load/i.test(t)) warnings.push(`[${m.type()}] ${t.slice(0, 300)}`);
});
page.on('pageerror', (e) => warnings.push(`[pageerror] ${e.message.slice(0, 300)}`));
page.on('response', (r) => { if (r.status() >= 400) warnings.push(`[404] ${r.url().replace(BASE, '')}`); });

await page.goto(`${BASE}${URL}`, { waitUntil: 'load' });
await page.waitForTimeout(2500);
// Start screen → "Start with an empty sample"
await page.evaluate(() => {
  const el = [...document.querySelectorAll('button')].find((b) => /empty sample/i.test(b.textContent || ''));
  if (el) el.click();
});
// Wait for the 3D canvas / boot completion.
try {
  await page.waitForSelector('canvas', { timeout: WAIT });
} catch {
  console.log('NO CANVAS after', WAIT, 'ms');
}
await page.waitForTimeout(12000); // let buildings/models load

const state = await page.evaluate(() => ({
  canvas: !!document.querySelector('canvas'),
  champion: !!window.__champion,
  buildings: (window.__champion && window.__champion.__buildingCount) ?? null,
}));

console.log('CANVAS:', state.canvas, '| champion:', state.champion);
const bad = warnings.filter((w) => /load failed|unknown library|No DRACOLoader|setMeshoptDecoder|Failed to fetch|404/i.test(w));
console.log('total console messages captured:', warnings.length);
console.log('CRITICAL warnings:', bad.length);
for (const w of bad.slice(0, 25)) console.log('  •', w);
await browser.close();
process.exit(bad.length ? 2 : 0);
