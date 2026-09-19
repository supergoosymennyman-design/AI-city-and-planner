// smoke-test.mjs — quick smoke test for a P5 game at a given URL.
// Usage: node smoke-test.mjs <url>
import { chromium } from '@playwright/test';

const url = process.argv[2] || 'http://127.0.0.1:8090/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 600 } });
const errors = [];
page.on('console', (msg) => { if (msg.type() === 'error') errors.push('[console] ' + msg.text()); });
page.on('pageerror', (err) => errors.push('[pageerror] ' + err.message));

try {
  const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
  console.log('HTTP', resp && resp.status());
  await page.waitForTimeout(4000);
  // Dump the page's game state if exposed
  const state = await page.evaluate(() => {
    const g = window.__P515_GAME__ ? window.__P515_GAME__.get() : null;
    const shell = !!document.querySelector('.re-root');
    const scenes = document.querySelectorAll('.re-scene').length;
    return { hasGame: !!g, scene: g ? g.scene : null, round: g ? g.round : null,
             hasShell: shell, sceneCount: scenes,
             bodyText: document.body.innerText.slice(0, 200) };
  });
  console.log('STATE:', JSON.stringify(state, null, 2));
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
} catch (e) {
  console.log('LOAD FAILED:', e.message);
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
}
await browser.close();
